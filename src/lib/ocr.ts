// Client-side screenshot reading — no API key, no server round trip.
//
// Tesseract downsamples nothing for us, but it is weak on the two things a
// trading screenshot is made of: very small toolbar text, and light-on-dark
// theming. So each region of interest is cropped, upscaled, greyscaled and
// inverted before it goes to the recognizer, and each crop is read with the
// character set it actually contains.

import type { Worker } from "tesseract.js";

export type ParsedTrade = {
  time: string;
  side: "LONG" | "SHORT";
  symbol: string;
  size: number;
  entry: number | null;
  exit: number | null;
  pnl: number;
  fees: number | null;
};

export type OcrResult = {
  date: string | null;
  net: number | null;
  balance: number | null;
  wins: number | null;
  losses: number | null;
  contracts: number | null;
  trades: ParsedTrade[];
  /** Short human-readable note on what was actually found. */
  read: string;
  /** True when the trade rows sum to the net read off the toolbar. */
  reconciled: boolean;
  /** Raw recognizer output, kept for troubleshooting a screenshot that reads badly. */
  raw: { toolbar: string; table: string; full: string };
};

export type Progress = (message: string) => void;

// --- image plumbing --------------------------------------------------------

function loadImage(file: File): Promise<{ img: HTMLImageElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be decoded as an image"));
    };
    img.src = url;
  });
}

type Box = { x: number; y: number; w: number; h: number };

/**
 * Crops a region, scales it up so small glyphs have pixels to work with, then
 * greyscales, inverts dark themes and stretches contrast.
 */
function prepare(img: HTMLImageElement, box: Box, targetWidth: number): HTMLCanvasElement {
  const scale = Math.min(6, Math.max(1, targetWidth / Math.max(1, box.w)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(box.w * scale));
  canvas.height = Math.max(1, Math.round(box.h * scale));

  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, canvas.width, canvas.height);

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = image.data;

  // Pass 1 — reduce to one channel, and find the range so contrast can be
  // stretched.
  //
  // Deliberately NOT luminance: a losing P&L is printed in red, and red weighs
  // almost nothing in a luminance sum (#f2545b lands at ~131, mid-grey), so the
  // minus signs and the numbers that matter most wash out against the
  // background. The max channel treats red text as brightly as white text,
  // which is what a dark trading UI actually needs.
  let total = 0;
  let min = 255;
  let max = 0;
  const lum = new Uint8ClampedArray(px.length / 4);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const l = px[i] > px[i + 1] ? (px[i] > px[i + 2] ? px[i] : px[i + 2]) : px[i + 1] > px[i + 2] ? px[i + 1] : px[i + 2];
    lum[j] = l;
    total += l;
    if (l < min) min = l;
    if (l > max) max = l;
  }

  const mean = total / lum.length;
  const invert = mean < 128; // dark platform themes are the norm
  const span = Math.max(1, max - min);

  // Pass 2 — normalise to full range, invert if needed, and push midtones apart
  // so anti-aliased glyph edges resolve into strokes.
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    let v = ((lum[j] - min) / span) * 255;
    if (invert) v = 255 - v;
    v = v < 110 ? Math.max(0, v * 0.55) : v > 150 ? Math.min(255, 255 - (255 - v) * 0.55) : v;
    px[i] = px[i + 1] = px[i + 2] = v;
    px[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

// --- recognizer ------------------------------------------------------------

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const Tesseract = await import("tesseract.js");

      // Fully-qualified URLs, not root-relative paths: the recognizer pulls its
      // own scripts in with `importScripts`, which rejects a bare `/path` when
      // the page is served from a custom scheme like the desktop app's.
      const base = new URL("tessdata/", document.baseURI);
      const asset = (p: string) => new URL(p, base).href;

      // Everything is bundled with the app, so this works with no network at
      // all. The language data is cached in IndexedDB after the first read.
      return Tesseract.createWorker("eng", Tesseract.OEM.LSTM_ONLY, {
        workerPath: asset("worker.min.js"),
        corePath: asset("core"),
        langPath: base.href.replace(/\/$/, ""),
      });
    })();
  }
  return workerPromise;
}

/** Frees the worker; called when the entry form unmounts. */
export async function disposeOcr(): Promise<void> {
  if (!workerPromise) return;
  const worker = await workerPromise.catch(() => null);
  workerPromise = null;
  await worker?.terminate().catch(() => {});
}

// The toolbar only ever contains money, the few P&L labels, and separators.
// Constraining the alphabet there stops `$88` turning into `S8B`.
const TOOLBAR_CHARS = "0123456789.,$-+()&:/|%RPLBUNDaleiornstuwyAEMTQ ";

async function read(worker: Worker, canvas: HTMLCanvasElement, toolbar: boolean): Promise<string> {
  const Tesseract = await import("tesseract.js");
  await worker.setParameters({
    // Both crops are blocks of text; sparse mode loses the toolbar's spacing.
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
    tessedit_char_whitelist: toolbar ? TOOLBAR_CHARS : "",
    preserve_interword_spaces: "1",
  });
  const { data } = await worker.recognize(canvas);
  return data.text || "";
}

// --- number helpers --------------------------------------------------------

/** `-$1,234.50`, `(1,234.50)`, `$ 88,591.75` → number. */
export function parseMoney(raw: string): number | null {
  if (!raw) return null;
  const t = raw.replace(/[\s$]/g, "");
  const negative = /^\(.*\)$/.test(t) || t.startsWith("-") || t.endsWith("-");
  const digits = t.replace(/[()\-+]/g, "").replace(/,/g, "");
  if (!/^\d*\.?\d+$/.test(digits)) return null;
  const n = parseFloat(digits);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

// Comma-grouped first, then a plain run of digits. Without the second branch a
// value whose decimal point was dropped (`-$3150`) splits into `315` and `0`.
const MONEY_RE = /\(?-?\$?\s?(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\)?-?/g;

type MoneyToken = { raw: string; value: number; index: number; signed: boolean };

function moneyTokens(line: string): MoneyToken[] {
  const out: MoneyToken[] = [];
  for (const m of line.matchAll(MONEY_RE)) {
    const value = parseMoney(m[0]);
    // Bare punctuation matches too; require a real number.
    if (value !== null && /\d/.test(m[0])) {
      out.push({
        raw: m[0],
        value,
        index: m.index ?? 0,
        // Whether the recognizer actually saw a minus or brackets, as opposed to
        // us inferring the sign later.
        signed: /^\(|^-|-$/.test(m[0].trim()),
      });
    }
  }
  return out;
}

// --- toolbar parsing -------------------------------------------------------

type LabelKind = "realized" | "balance" | "unrealized" | "generic";

// OCR mangles `RP&L` into RPGL / RP8L / RPAL / RP&:L, so labels are matched on a
// letters-only reduction of the token rather than exact text.
/** Levenshtein distance, used to match labels the recognizer garbled. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

function near(t: string, candidates: string[]): boolean {
  return candidates.some((c) => editDistance(t, c) <= Math.max(1, Math.floor(c.length / 4)));
}

function classifyLabel(token: string): LabelKind | null {
  const t = token.toUpperCase().replace(/[^A-Z]/g, "");
  if (!t || t.length > 12) return null;

  if (near(t, ["BAL", "BALANCE", "EQUITY", "NETLIQ", "ACCOUNTVALUE"])) return "balance";

  // A P&L label is the one token that carries a P and ends in an L. Matching on
  // that shape rather than on an exact spelling survives `RP&L` coming back as
  // `nP2l` or `PPAL`, which is the norm at toolbar sizes.
  if (t.includes("P") && t.endsWith("L")) {
    // Realized and unrealized are one edit apart (RPAL / UPAL), so a distance
    // match would mix them up — and showing open-position P&L as the day's
    // result would be a real error. The leading letter decides instead: OCR
    // readily swaps R, P and N for each other, but not for a U.
    if (t.startsWith("U")) return "unrealized";
    if (near(t, ["UNREALIZED", "UNREALISED", "OPENPL", "FLOATING"])) return "unrealized";
    if (t === "PL" || t === "PNL" || t === "PAL") return "generic";
    return "realized";
  }

  if (near(t, ["REALIZED", "REALISED", "PROFIT"])) return "realized";
  return null;
}

type LabelHit = { kind: LabelKind; value: number; raw: string };

/**
 * Scans a toolbar line for `label value` pairs. Tolerates the label and its
 * number being split across whitespace, which is how OCR usually returns them.
 */
function scanLabels(text: string): LabelHit[] {
  const hits: LabelHit[] = [];
  for (const line of text.split(/\n+/)) {
    if (!line.trim()) continue;

    // Split into label-ish and number-ish tokens, keeping order.
    const tokens = line.split(/\s+/).filter(Boolean);
    for (let i = 0; i < tokens.length; i++) {
      const kind = classifyLabel(tokens[i]);
      if (!kind) continue;

      // The value is normally the next token; allow one token of slack for
      // stray separators like `:` or `-` landing on their own.
      for (let j = i + 1; j < Math.min(i + 3, tokens.length); j++) {
        const value = parseMoney(tokens[j]);
        if (value !== null && /\d/.test(tokens[j])) {
          hits.push({ kind, value, raw: `${tokens[i]} ${tokens[j]}` });
          i = j;
          break;
        }
      }
    }
  }
  return hits;
}

// --- trade-table parsing ---------------------------------------------------

const SIDE_RE = /\b(short|sell|sold|long|buy|bought)\b/i;
const SYMBOL_RE = /\b([A-Z]{2,9}[:_])?(M?(?:ES|NQ|YM|GC|CL|RTY|BTC)[A-Z]?\d?)\b/;
const DATE_RE = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/;
const TIME_RE = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/g;

function parseTradeLine(line: string): ParsedTrade | null {
  const sideMatch = SIDE_RE.exec(line);
  if (!sideMatch) return null;

  const isShort = /short|sell|sold/i.test(sideMatch[1]);
  const sideIndex = sideMatch.index ?? 0;

  // The Side column sits immediately before the numbers, so anchoring on it
  // gives the columns in order — entry | exit | net P&L | charges — without
  // having to guess which of the row's many numbers (dates, times, size) are
  // money. Taking them from the end instead breaks whenever the charges column
  // is absent.
  const after = moneyTokens(line).filter((t) => t.index > sideIndex);
  if (after.length < 3) return null;

  const symbolMatch = SYMBOL_RE.exec(line);
  const symbol = symbolMatch ? symbolMatch[2] : "";

  const [entryTok, exitTok, pnlTok] = after;
  const feesTok = after.length >= 4 ? after[3] : null;

  const entry = entryTok.value;
  const exit = exitTok.value;
  let pnl = pnlTok.value;

  if (!(Math.abs(entry) > 1 && Math.abs(exit) > 1)) return null;

  // Prefer the sign the recognizer actually saw. Only when no minus was read do
  // we infer it from the trade's direction — a short loses when it exits
  // higher, a long when it exits lower — because that inference depends on both
  // prices being right, and a single misread digit inverts it.
  if (!pnlTok.signed) {
    const losing = isShort ? exit > entry : exit < entry;
    pnl = losing ? -Math.abs(pnl) : Math.abs(pnl);
  }

  // Size is a bare integer sitting between the symbol and the side.
  let size = 0;
  const between = line.slice(
    symbolMatch ? (symbolMatch.index ?? 0) + symbolMatch[0].length : 0,
    sideIndex,
  );
  const sizeMatch = /\b(\d{1,4})\b/.exec(between);
  if (sizeMatch) size = parseInt(sizeMatch[1], 10);

  // Close time is the last HH:MM on the row.
  let time = "";
  const times = Array.from(line.matchAll(TIME_RE));
  if (times.length) {
    const t = times[times.length - 1];
    time = `${t[1].padStart(2, "0")}:${t[2]}`;
  }

  return {
    time,
    side: isShort ? "SHORT" : "LONG",
    symbol,
    size,
    entry,
    exit,
    pnl,
    fees: feesTok ? Math.abs(feesTok.value) : null,
  };
}

function parseDate(text: string): string | null {
  const m = DATE_RE.exec(text);
  if (!m) return null;

  let [, a, b, y] = m;
  let year = parseInt(y, 10);
  if (year < 100) year += 2000;

  // Ambiguous between US and ISO ordering; a value above 12 settles it.
  let month = parseInt(a, 10);
  let day = parseInt(b, 10);
  if (month > 12 && day <= 12) [month, day] = [day, month];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // A year that far out is a misread — keep the day and month, take the year
  // from today, and let the UI flag the field for confirmation.
  const today = new Date();
  if (Math.abs(year - today.getFullYear()) > 1) {
    year = today.getFullYear();
    const candidate = new Date(year, month - 1, day);
    if (candidate > today) year -= 1;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// --- the analysis pass -----------------------------------------------------

export async function analyzeScreenshot(file: File, onProgress?: Progress): Promise<OcrResult> {
  const { img, url } = await loadImage(file);
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;

  try {
    onProgress?.("Starting the reader…");
    const worker = await getWorker();

    // 1. The account toolbar, where Bal / RP&L sit at ~11px. Its exact height
    // varies — a fullscreen platform puts it at the very top, a browser window
    // pushes it below tabs and an address bar — so read the whole top band.
    onProgress?.("Reading the account toolbar…");
    // Someone who has already cropped down to just the toolbar hands us a small,
    // wide image — slicing a percentage out of that would cut the P&L off the
    // right-hand side, so read those whole.
    const preCropped = H < 260 || W < 700;
    const toolbarBox = preCropped
      ? { x: 0, y: 0, w: W, h: H }
      : { x: 0, y: 0, w: Math.round(W * 0.6), h: Math.max(40, Math.round(H * 0.2)) };
    const toolbarText = await read(worker, prepare(img, toolbarBox, 2800), true);

    // 2. Closed-trades table across the bottom of the platform.
    onProgress?.("Reading the trade table…");
    let tableText = "";
    if (!preCropped) {
      const tableBox = { x: 0, y: Math.round(H * 0.6), w: W, h: Math.round(H * 0.4) };
      tableText = await read(worker, prepare(img, tableBox, 2400), false);
    }

    let hits = scanLabels(toolbarText);
    let rows = extractRows(tableText);

    // 3. If we still have no P&L and no rows, the layout is not the one we
    // guessed at — fall back to reading the whole frame.
    const foundNet = hits.some((h) => h.kind === "realized" || h.kind === "generic");
    let fullText = "";
    if (!foundNet && !rows.length && !preCropped) {
      onProgress?.("Reading the full screenshot…");
      fullText = await read(worker, prepare(img, { x: 0, y: 0, w: W, h: H }, 2000), false);
      hits = scanLabels(fullText);
      rows = extractRows(fullText);
    }

    return parseRecognizedText({ toolbar: toolbarText, table: tableText, full: fullText });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function extractRows(text: string): ParsedTrade[] {
  return text
    .split(/\n+/)
    .map(parseTradeLine)
    .filter((t): t is ParsedTrade => t !== null);
}

/**
 * The pure half of the reader: recognizer output in, structured result out.
 * Split from `analyzeScreenshot` so the parsing rules can be tested against
 * captured OCR text without a browser or an image.
 */
export function parseRecognizedText(raw: {
  toolbar: string;
  table: string;
  full: string;
}): OcrResult {
  let hits = scanLabels(raw.toolbar);
  if (!hits.some((h) => h.kind === "realized" || h.kind === "generic")) {
    hits = hits.concat(scanLabels(raw.full));
  }

  const tableRows = extractRows(raw.table);
  const rows = tableRows.length ? tableRows : extractRows(raw.full);

  return assemble(raw.toolbar, raw.table, raw.full, hits, rows);
}

function assemble(
  toolbarText: string,
  tableText: string,
  fullText: string,
  hits: LabelHit[],
  rows: ParsedTrade[],
): OcrResult {
  const realized = hits.find((h) => h.kind === "realized");
  const generic = hits.find((h) => h.kind === "generic");
  const balanceHit = hits.find((h) => h.kind === "balance");

  let net = realized?.value ?? generic?.value ?? null;
  const balance = balanceHit?.value ?? null;

  const notes: string[] = [];
  if (realized) notes.push(`realized P&L ${fmt(realized.value)}`);
  else if (generic) notes.push(`P&L ${fmt(generic.value)}`);
  if (balance !== null) notes.push(`balance ${fmt(balance)}`);

  let wins: number | null = null;
  let losses: number | null = null;
  let contracts: number | null = null;
  let reconciled = false;

  if (rows.length) {
    // The toolbar figure and the table are two independent readings of the same
    // number, so one can repair the other.
    const toolbarNet = net;
    if (toolbarNet !== null) {
      const repaired = repairRows(rows, toolbarNet);
      if (repaired) {
        rows = repaired;
        reconciled = true;
      }
    }

    const sum = Math.round(rows.reduce((a, t) => a + t.pnl, 0) * 100) / 100;
    if (toolbarNet !== null && Math.abs(sum - toolbarNet) <= 1) reconciled = true;

    wins = rows.filter((t) => t.pnl > 0).length;
    losses = rows.filter((t) => t.pnl < 0).length;
    const size = rows.reduce((a, t) => a + (t.size || 0), 0);
    if (size) contracts = size;

    if (reconciled || toolbarNet === null) {
      net = sum;
    }
    // Otherwise the toolbar number stands: it is one short token read at high
    // zoom, where a table row is a long line with many more chances to slip.

    notes.unshift(`${rows.length} trade row${rows.length === 1 ? "" : "s"}`);
    notes.push(reconciled ? "rows match the toolbar" : "rows disagree with the toolbar — check them");
  }

  const date = parseDate(tableText) ?? parseDate(fullText) ?? parseDate(toolbarText);

  return {
    date,
    net: net === null ? null : Math.round(net * 100) / 100,
    balance,
    wins,
    losses,
    contracts,
    trades: rows,
    read: notes.length ? notes.join(", ") : "",
    reconciled,
    raw: { toolbar: toolbarText, table: tableText, full: fullText },
  };
}

/**
 * OCR fails on trade rows in two characteristic ways: it drops the decimal point
 * (`-$31.50` → `-$3150`) and it drops the leading minus. Both are recoverable
 * because the toolbar gives us the total the rows have to add up to — so try the
 * small set of per-row reinterpretations and keep a combination that reconciles.
 *
 * Returns null when nothing adds up, leaving the rows untouched.
 */
function repairRows(rows: ParsedTrade[], target: number): ParsedTrade[] | null {
  const sum = (list: number[]) => Math.round(list.reduce((a, b) => a + b, 0) * 100) / 100;
  const current = rows.map((r) => r.pnl);
  if (Math.abs(sum(current) - target) <= 1) return null; // already fine

  // Search stays bounded: 4 readings per row, and only for a handful of rows.
  if (rows.length > 6) return null;

  const options = rows.map((r) => {
    const v = r.pnl;
    const set = new Set<number>([v, -v]);
    // A dropped decimal point only matters for values that have no fraction.
    if (Number.isInteger(v) && Math.abs(v) >= 100) {
      set.add(v / 100);
      set.add(-v / 100);
    }
    return Array.from(set);
  });

  let best: number[] | null = null;
  const pick: number[] = [];

  const walk = (i: number) => {
    if (best) return;
    if (i === rows.length) {
      if (Math.abs(sum(pick) - target) <= 1) best = pick.slice();
      return;
    }
    for (const candidate of options[i]) {
      pick[i] = candidate;
      walk(i + 1);
      if (best) return;
    }
    pick.length = i;
  };
  walk(0);

  if (!best) return null;
  return rows.map((r, i) => ({ ...r, pnl: best![i] }));
}

function fmt(n: number): string {
  const s = Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  return `${n < 0 ? "-" : ""}$${s}`;
}
