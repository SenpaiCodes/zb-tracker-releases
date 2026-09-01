import { useEffect, useRef, useState } from "react";
import { analyzeScreenshot, disposeOcr, type ParsedTrade } from "../lib/ocr";
import { readShot } from "../lib/store";
import { colorFor, monthName, money, todayIso } from "../lib/format";
import { C, MONO, caption, cssUrl, field } from "./ui";

export type Draft = {
  date: string;
  net: string;
  wins: string;
  losses: string;
  contracts: string;
  note: string;
  tags: string[];
  /** Object URL for the on-screen preview. */
  pnlPreview: string | null;
  pnlFile: File | null;
  /** The screenshot's own bytes as a data URL, saved with the entry. */
  pnlData: string | null;
  shots: { name: string; data: string }[];
  trades: ParsedTrade[];
  detected: Record<string, boolean>;
};

export const emptyDraft = (): Draft => ({
  date: "",
  net: "",
  wins: "",
  losses: "",
  contracts: "",
  note: "",
  tags: [],
  pnlPreview: null,
  pnlFile: null,
  pnlData: null,
  shots: [],
  trades: [],
  detected: {},
});

type Scan = { ok: boolean; msg: string } | null;

type Props = {
  draft: Draft;
  setDraft: (fn: (d: Draft) => Draft) => void;
  onSave: () => void;
  saving: boolean;
  /** The quick-pick palette, editable in Settings. */
  presetTags: string[];
  /** Name of the account the entry will be filed under. */
  filedUnder: string;
  /** Other live accounts this session could have been copy-traded on. */
  copyTargets: { id: string; name: string }[];
  copyTo: string[];
  onCopyTo: (ids: string[]) => void;
};

export default function NewEntry({
  draft,
  setDraft,
  onSave,
  saving,
  presetTags,
  filedUnder,
  copyTargets,
  copyTo,
  onCopyTo,
}: Props) {
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [dragging, setDragging] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [pasted, setPasted] = useState(false);
  const [scan, setScan] = useState<Scan>(null);
  const pnlInput = useRef<HTMLInputElement>(null);
  // `analyzing` is state, so a handler that fired before the re-render would
  // still see the old value. The ref is the honest in-flight flag.
  const busy = useRef(false);

  // The recognizer holds a worker and its language data; release it when the
  // form goes away.
  useEffect(() => () => void disposeOcr(), []);

  function attach(file: File) {
    const preview = URL.createObjectURL(file);
    setDraft((d) => {
      if (d.pnlPreview) URL.revokeObjectURL(d.pnlPreview);
      return {
        ...d,
        pnlPreview: preview,
        pnlFile: file,
        date: d.date || todayIso(),
        detected: {},
      };
    });
    setScan(null);
    readShot(file).then((data) => setDraft((d) => ({ ...d, pnlData: data })));
  }

  // Ctrl/Cmd+V anywhere on the page: take the image off the clipboard, attach
  // it, and read it without waiting for a second click. The file is passed
  // straight through because `draft.pnlFile` is a render behind at that point.
  const pasteRef = useRef<(e: ClipboardEvent) => void>(() => {});

  useEffect(() => {
    const handler = (e: ClipboardEvent) => pasteRef.current(e);
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, []);

  pasteRef.current = (e: ClipboardEvent) => {
    if (busy.current) return;
    const file = imageFrom(e.clipboardData);
    if (!file) return; // a plain text paste still belongs to whatever has focus
    e.preventDefault();
    setMode("auto");
    setPasted(true);
    attach(file);
    void analyze(file);
  };

  useEffect(() => {
    if (!pasted) return;
    const t = setTimeout(() => setPasted(false), 1400);
    return () => clearTimeout(t);
  }, [pasted]);

  async function analyze(file?: File) {
    const shot = file || draft.pnlFile;
    if (!shot || busy.current) return;
    busy.current = true;
    setAnalyzing(true);
    setScan({ ok: true, msg: file ? "Pasted — reading it now…" : "Reading the screenshot…" });
    try {
      const r = await analyzeScreenshot(shot, (msg) => setScan({ ok: true, msg }));

      const detected: Record<string, boolean> = {};
      setDraft((d) => {
        const next = { ...d };
        if (r.date) {
          next.date = r.date;
          detected.date = true;
        }
        if (r.net !== null) {
          next.net = String(r.net);
          detected.net = true;
        }
        if (r.wins !== null) {
          next.wins = String(r.wins);
          detected.wl = true;
        }
        if (r.losses !== null) {
          next.losses = String(r.losses);
          detected.wl = true;
        }
        if (r.contracts !== null) {
          next.contracts = String(r.contracts);
          detected.contracts = true;
        }
        if (r.trades.length) {
          next.trades = r.trades;
          detected.trades = true;
        }
        next.detected = detected;
        return next;
      });

      const found = Object.keys(detected).length;
      setScan(
        found
          ? { ok: true, msg: r.read || `${found} field${found > 1 ? "s" : ""} read` }
          : {
              ok: false,
              msg: "Nothing readable found — type the numbers in below",
            },
      );
    } catch (err) {
      // Errors surfacing from inside the recognizer's worker often arrive as
      // events rather than Errors, so dig for something printable.
      const reason =
        (err instanceof Error && err.message) ||
        (typeof err === "string" && err) ||
        (err && typeof err === "object" && "message" in err && String(err.message)) ||
        String(err);
      setScan({
        ok: false,
        msg: `Analysis failed (${String(reason).slice(0, 90)}) — type the numbers in below`,
      });
    } finally {
      busy.current = false;
      setAnalyzing(false);
    }
  }

  const hasShot = !!draft.pnlPreview;
  const badge = (ok: boolean) =>
    ok
      ? { text: "detected", color: C.pos, border: C.posEdge }
      : { text: "manual", color: C.faint, border: C.line2 };
  const bd = badge(!!draft.detected.date);
  const bn = badge(!!draft.detected.net);

  const canSave = !!draft.date && draft.net !== "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, width: "100%" }}>
      <header
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 20,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <div style={caption(10, 1.5)}>New entry</div>
          <h1 style={{ margin: 0, fontSize: 31, fontWeight: 700, letterSpacing: -0.9 }}>
            Log a trading day
          </h1>
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
            padding: 4,
            border: `1px solid ${C.line}`,
            borderRadius: 9,
          }}
        >
          {(["auto", "manual"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setMode(k)}
              style={{
                border: "none",
                borderRadius: 6,
                padding: "8px 14px",
                fontSize: 12.5,
                cursor: "pointer",
                background: mode === k ? C.active : "transparent",
                color: mode === k ? C.text : C.mute,
              }}
            >
              {k === "auto" ? "Auto from screenshot" : "Manual"}
            </button>
          ))}
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
          gap: 16,
          alignItems: "start",
        }}
      >
        <section
          style={{
            border: `1px solid ${C.line}`,
            borderRadius: 14,
            background: C.panel,
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ ...caption(), whiteSpace: "nowrap" }}>
              1 · Paste your P&amp;L screenshot
            </div>
            <div
              style={{
                fontSize: 11,
                color: scan ? (scan.ok ? C.pos : C.amber) : C.fainter,
                textAlign: "right",
              }}
            >
              {scan
                ? scan.msg
                : hasShot
                  ? "Screenshot attached — hit Analyze to read the numbers"
                  : `Press ${pasteKey()} — it reads itself`}
            </div>
          </div>

          <label
            onDragOver={(e) => {
              e.preventDefault();
              if (!dragging) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = imageFrom(e.dataTransfer);
              if (f) attach(f);
            }}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              minHeight: 250,
              border: `1px dashed ${dragging || pasted ? C.pos : C.dash}`,
              borderRadius: 12,
              background: dragging || pasted ? C.posSoft : C.field,
              transition: "border-color 180ms ease, background 180ms ease",
              cursor: "pointer",
              padding: 18,
              textAlign: "center",
            }}
          >
            {hasShot ? (
              <span
                style={{
                  width: "100%",
                  height: 300,
                  borderRadius: 8,
                  border: `1px solid ${C.line2}`,
                  display: "block",
                  backgroundColor: C.field,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "center",
                  backgroundSize: "contain",
                  backgroundImage: cssUrl(draft.pnlPreview),
                }}
              />
            ) : (
              <span
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 9 }}
              >
                <span
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    border: `1px solid ${C.dash}`,
                    display: "block",
                  }}
                />
                <span style={{ fontSize: 13.5, color: C.dim }}>
                  Paste it with {pasteKey()} — or drop it here
                </span>
                <span
                  style={{ fontFamily: MONO, fontSize: 10.5, color: C.fainter, lineHeight: 1.7 }}
                >
                  net p&amp;l · win/loss · contracts · date
                  <br />
                  a pasted screenshot analyzes itself · or click to browse
                </span>
              </span>
            )}
            <input
              ref={pnlInput}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) attach(f);
                e.target.value = "";
              }}
              style={{ display: "none" }}
            />
          </label>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => void analyze()}
              disabled={!hasShot || analyzing}
              className="hov-bright-soft"
              style={{
                flex: 1,
                height: 42,
                border: `1px solid ${hasShot && !analyzing ? C.text : C.line2}`,
                background: hasShot && !analyzing ? C.text : C.raised,
                color: hasShot && !analyzing ? C.bg : C.fainter,
                borderRadius: 9,
                cursor: hasShot && !analyzing ? "pointer" : "default",
                fontSize: 13,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 9,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 2,
                  background: analyzing ? C.amber : hasShot ? C.pos : C.edge,
                }}
              />
              {analyzing
                ? "Analyzing screenshot…"
                : hasShot
                  ? "Analyze screenshot"
                  : `Paste or drop a screenshot (${pasteKey()})`}
            </button>
            <button
              onClick={() => pnlInput.current?.click()}
              className="hov-close"
              style={{
                height: 42,
                padding: "0 14px",
                border: `1px solid ${C.line2}`,
                background: "transparent",
                color: C.mute2,
                borderRadius: 9,
                cursor: "pointer",
                fontSize: 12.5,
                display: hasShot ? "block" : "none",
              }}
            >
              Replace
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={caption()}>Chart screenshots</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {draft.shots.map((s, i) => (
                <span
                  key={i}
                  title={s.name}
                  style={{
                    width: 96,
                    height: 66,
                    borderRadius: 8,
                    border: `1px solid ${C.line2}`,
                    display: "block",
                    backgroundColor: C.field,
                    backgroundPosition: "center",
                    backgroundSize: "cover",
                    backgroundImage: cssUrl(s.data),
                  }}
                />
              ))}
              <label
                className="hov-tile-text"
                style={{
                  width: 96,
                  height: 66,
                  border: `1px dashed ${C.dash}`,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  fontSize: 20,
                  color: C.fainter,
                }}
              >
                +
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    e.target.value = "";
                    for (const f of files) {
                      const data = await readShot(f);
                      setDraft((d) => ({
                        ...d,
                        shots: [...d.shots, { name: f.name || "chart screenshot", data }],
                      }));
                    }
                  }}
                  style={{ display: "none" }}
                />
              </label>
            </div>
          </div>
        </section>

        <section
          style={{
            border: `1px solid ${C.line}`,
            borderRadius: 14,
            background: C.panel,
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <div style={caption()}>2 · Confirm the numbers</div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              gap: 12,
            }}
          >
            <label style={labelCol}>
              <span style={labelRow}>
                Date
                <span style={badgeStyle(bd.color, bd.border)}>{bd.text}</span>
              </span>
              <input
                type="date"
                value={draft.date}
                onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
                style={field}
              />
            </label>

            <label style={labelCol}>
              <span style={labelRow}>
                Net P&amp;L
                <span style={badgeStyle(bn.color, bn.border)}>{bn.text}</span>
              </span>
              <input
                type="text"
                value={draft.net}
                onChange={(e) => setDraft((d) => ({ ...d, net: e.target.value }))}
                placeholder="-320.50"
                style={field}
              />
            </label>

            <label style={labelCol}>
              <span style={{ fontSize: 11.5, color: C.mute2 }}>Wins / losses</span>
              <span style={{ display: "flex", gap: 8, minWidth: 0 }}>
                <input
                  type="text"
                  value={draft.wins}
                  onChange={(e) => setDraft((d) => ({ ...d, wins: e.target.value }))}
                  style={{ ...field, color: C.pos }}
                />
                <input
                  type="text"
                  value={draft.losses}
                  onChange={(e) => setDraft((d) => ({ ...d, losses: e.target.value }))}
                  style={{ ...field, color: C.neg }}
                />
              </span>
            </label>

            <label style={labelCol}>
              <span style={{ fontSize: 11.5, color: C.mute2 }}>Contracts</span>
              <input
                type="text"
                value={draft.contracts}
                onChange={(e) => setDraft((d) => ({ ...d, contracts: e.target.value }))}
                style={field}
              />
            </label>
          </div>

          {draft.trades.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={caption()}>Trades</div>
                <div style={{ fontSize: 11, color: C.pos }}>
                  {draft.trades.length} rows read from the table
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {draft.trades.map((t, i) => (
                  <div
                    key={i}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "48px 46px minmax(0, 1fr) 74px 74px",
                      alignItems: "center",
                      gap: 10,
                      border: `1px solid ${C.line3}`,
                      borderRadius: 8,
                      padding: "9px 11px",
                    }}
                  >
                    <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.faint }}>
                      {t.time || "—"}
                    </span>
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        letterSpacing: 0.6,
                        color: t.side === "LONG" ? C.long : C.short,
                      }}
                    >
                      {t.side}
                    </span>
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 11,
                        color: C.mute2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t.entry !== null && t.exit !== null
                        ? `${t.entry.toFixed(2)} → ${t.exit.toFixed(2)}`
                        : "—"}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.faint }}>
                      {(t.symbol || "—") + (t.size ? ` ×${t.size}` : "")}
                    </span>
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 12,
                        textAlign: "right",
                        color: colorFor(t.pnl),
                      }}
                    >
                      {money(Math.round(t.pnl))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <div style={caption()}>3 · How the day went</div>
            <textarea
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              placeholder="What was the plan, what actually happened, what to repeat or cut."
              style={{
                minHeight: 132,
                resize: "vertical",
                background: C.field,
                border: `1px solid ${C.line2}`,
                borderRadius: 8,
                padding: 13,
                color: C.text,
                fontSize: 13,
                lineHeight: 1.65,
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <div style={caption()}>Tags</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {presetTags.length === 0 && draft.tags.length === 0 ? (
                <span style={{ fontSize: 11.5, color: C.fainter }}>
                  No tags yet — add some under Settings.
                </span>
              ) : null}
              {[...presetTags, ...draft.tags.filter((t) => !presetTags.includes(t))].map((t) => {
                const on = draft.tags.includes(t);
                return (
                  <button
                    key={t}
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        tags: d.tags.includes(t)
                          ? d.tags.filter((x) => x !== t)
                          : [...d.tags, t],
                      }))
                    }
                    style={{
                      border: `1px solid ${on ? C.posEdge : C.line2}`,
                      borderRadius: 999,
                      padding: "6px 12px",
                      fontSize: 11.5,
                      cursor: "pointer",
                      background: on ? C.posSoft : "transparent",
                      color: on ? C.pos : C.mute,
                    }}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {copyTargets.length ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 9,
                borderTop: `1px solid ${C.line3}`,
                paddingTop: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <div style={caption()}>Copy-traded on</div>
                <span style={{ fontSize: 11.5, color: C.fainter }}>
                  Same session on other accounts — each gets its own copy of this day
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {copyTargets.map((a) => {
                  const on = copyTo.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() =>
                        onCopyTo(on ? copyTo.filter((x) => x !== a.id) : [...copyTo, a.id])
                      }
                      aria-pressed={on}
                      className="hov-border"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        border: `1px solid ${on ? C.accent : C.line2}`,
                        borderRadius: 999,
                        padding: "6px 12px",
                        cursor: "pointer",
                        fontSize: 12,
                        background: on ? C.accentSoft : "transparent",
                        color: on ? C.text : C.mute,
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: on ? C.accent : C.faintest,
                        }}
                      />
                      {a.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 14,
              borderTop: `1px solid ${C.line3}`,
              paddingTop: 16,
            }}
          >
            <span style={{ fontSize: 11.5, color: C.fainter }}>
              {canSave
                ? `Saves to ${monthName(draft.date.slice(0, 7))} on ${filedUnder}${
                    copyTo.length ? ` and ${copyTo.length} more` : ""
                  }`
                : "Date and net P&L are required"}
            </span>
            <span style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => {
                  if (draft.pnlPreview) URL.revokeObjectURL(draft.pnlPreview);
                  setDraft(() => emptyDraft());
                  setScan(null);
                }}
                className="hov-raised"
                style={{
                  height: 36,
                  padding: "0 14px",
                  border: `1px solid ${C.line2}`,
                  background: "transparent",
                  color: C.dim,
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Clear
              </button>
              <button
                onClick={onSave}
                disabled={!canSave || saving}
                className="hov-solid"
                style={{
                  height: 36,
                  padding: "0 20px",
                  border: "none",
                  background: canSave ? C.text : C.raised,
                  color: canSave ? C.bg : C.fainter,
                  borderRadius: 8,
                  cursor: canSave && !saving ? "pointer" : "default",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {saving ? "Saving…" : "Save entry"}
              </button>
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Mac keyboards say ⌘V; everything else says Ctrl+V. */
function pasteKey(): string {
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");
  return mac ? "⌘V" : "Ctrl+V";
}

/**
 * The first image on a clipboard or a drag. Screenshot tools hand it over as an
 * item rather than a file, so both shelves get looked at.
 */
function imageFrom(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of Array.from(data.items || [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return Array.from(data.files || []).find((f) => f.type.startsWith("image/")) || null;
}

const labelCol: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 7,
  minWidth: 0,
};

const labelRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  fontSize: 11.5,
  color: C.mute2,
};

function badgeStyle(color: string, border: string): React.CSSProperties {
  return {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color,
    border: `1px solid ${border}`,
    borderRadius: 4,
    padding: "2px 5px",
  };
}
