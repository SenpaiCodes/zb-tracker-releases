"use strict";

// The whole data layer. There is no server and no database — the journal is one
// JSON file and a folder of screenshots, both under Electron's per-user data
// directory. That makes the app fully offline, trivially backed up, and easy to
// reason about.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const FILE_VERSION = 3;

// Seeded on first run; the user edits the list freely from Settings.
const DEFAULT_TAGS = [
  "ORB",
  "Failed breakout",
  "Trend day",
  "Chop",
  "Revenge trade",
  "Oversized",
  "Cut early",
  "A+ setup",
];

const MAX_TAGS = 40;

const DEFAULT_THEME = { preset: "terminal", custom: null };

// A scratch session often closes a few dollars down on fees alone. Anything
// inside this band counts as breakeven rather than a loss; the user sets it.
const DEFAULT_BREAKEVEN_BAND = 0;

const NEUTRAL_PAYOUT = {
  minWinDays: 0,
  minWinDay: 0,
  buffer: 0,
  minPayout: 0,
  maxPayout: 0,
  maxPayoutPct: 0,
  maxProfitPct: 0,
  split: 100,
};

function normalizeRules(r) {
  const src = r && typeof r === "object" ? r : {};
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const pay = src.payout && typeof src.payout === "object" ? src.payout : {};
  return {
    profitTarget: num(src.profitTarget),
    maxLoss: num(src.maxLoss),
    drawdownMode: ["eod", "intraday", "static"].includes(src.drawdownMode)
      ? src.drawdownMode
      : "static",
    trailCapsAtStart: src.trailCapsAtStart !== false,
    dailyLoss: num(src.dailyLoss),
    consistencyPct: Math.max(0, Math.min(100, num(src.consistencyPct))),
    payout: {
      ...NEUTRAL_PAYOUT,
      minWinDays: num(pay.minWinDays),
      minWinDay: num(pay.minWinDay),
      buffer: num(pay.buffer),
      minPayout: num(pay.minPayout),
      maxPayout: num(pay.maxPayout),
      maxPayoutPct: Math.max(0, Math.min(100, num(pay.maxPayoutPct))),
      maxProfitPct: Math.max(0, Math.min(100, num(pay.maxProfitPct))),
      split: pay.split === undefined ? 100 : Math.max(0, Math.min(100, num(pay.split))),
    },
  };
}

function normalizeAccount(a) {
  const phases = ["eval", "funded", "passed", "blown"];
  return {
    id: a.id || newId("acc"),
    name: String(a.name || "Untitled").slice(0, 120),
    broker: String(a.broker || "").slice(0, 120),
    start: toNumber(a.start),
    firm: a.firm ? String(a.firm).slice(0, 40) : null,
    plan: a.plan ? String(a.plan).slice(0, 40) : null,
    size: a.size === null || a.size === undefined ? null : toNumber(a.size),
    phase: phases.includes(a.phase) ? a.phase : a.firm ? "eval" : "funded",
    rules: normalizeRules(a.rules),
    passedOn: typeof a.passedOn === "string" ? a.passedOn : null,
    blownOn: typeof a.blownOn === "string" ? a.blownOn : null,
    archived: a.archived === true,
    payouts: Array.isArray(a.payouts)
      ? a.payouts
          .map((x) => ({
            id: typeof x.id === "string" ? x.id : newId("pay"),
            date: /^\d{4}-\d{2}-\d{2}$/.test(String(x.date)) ? x.date : todayIso(),
            amount: Math.max(0, Math.round(Number(x.amount) || 0)),
          }))
          .filter((x) => x.amount > 0)
      : [],
    createdAt: typeof a.createdAt === "string" ? a.createdAt : new Date().toISOString(),
  };
}
const MAX_TAG_LENGTH = 28;

class Store {
  /**
   * @param {string} dir Electron's userData path.
   * @param {string[]} legacyDirs Older data folders to adopt from, newest first.
   */
  constructor(dir, legacyDirs = []) {
    this.dir = dir;
    this.file = path.join(dir, "journal.json");
    this.shotsDir = path.join(dir, "shots");
    fs.mkdirSync(this.shotsDir, { recursive: true });
    this.adoptLegacy(legacyDirs);
    this.data = this.load();
  }

  /**
   * The app has been renamed once, which moved its data folder. If this install
   * has no journal yet but an older one does, copy it across — losing a
   * trader's history to a rename would be unforgivable. The original is left
   * untouched, so this is safe to get wrong.
   */
  adoptLegacy(dirs) {
    if (fs.existsSync(this.file)) return;

    for (const old of dirs) {
      const oldFile = path.join(old, "journal.json");
      if (!fs.existsSync(oldFile)) continue;
      try {
        fs.copyFileSync(oldFile, this.file);

        const oldShots = path.join(old, "shots");
        if (fs.existsSync(oldShots)) {
          for (const name of fs.readdirSync(oldShots)) {
            try {
              fs.copyFileSync(path.join(oldShots, name), path.join(this.shotsDir, name));
            } catch {
              /* skip an unreadable screenshot rather than abandoning the rest */
            }
          }
        }
        this.migratedFrom = old;
        return;
      } catch {
        // Try the next candidate.
      }
    }
  }

  // --- persistence ---------------------------------------------------------

  load() {
    try {
      const raw = fs.readFileSync(this.file, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.accounts) && Array.isArray(parsed.days)) {
        return this.normalize(parsed);
      }
    } catch {
      // Missing or unreadable file — start fresh below.
    }
    return this.normalize({
      accounts: [],
      activeAccountId: null,
      days: [],
      presetTags: null,
      theme: null,
    });
  }

  normalize(d) {
    const accounts = (
      d.accounts.length
        ? d.accounts
        : [{ id: newId("acc"), name: "Main account", broker: "", start: 0 }]
    ).map(normalizeAccount);
    const ids = new Set(accounts.map((a) => a.id));
    // An older file has no tag list; seed it rather than leaving the picker empty.
    const presetTags = Array.isArray(d.presetTags) ? cleanTags(d.presetTags) : DEFAULT_TAGS.slice();
    return {
      version: FILE_VERSION,
      accounts,
      activeAccountId: ids.has(d.activeAccountId) ? d.activeAccountId : accounts[0].id,
      presetTags,
      theme:
        d.theme && typeof d.theme.preset === "string"
          ? { preset: d.theme.preset, custom: d.theme.custom || null }
          : { ...DEFAULT_THEME },
      breakevenBand: Math.max(
        0,
        Number.isFinite(Number(d.breakevenBand))
          ? Number(d.breakevenBand)
          : DEFAULT_BREAKEVEN_BAND,
      ),
      days: (d.days || []).filter((day) => ids.has(day.accountId)),
    };
  }

  /** Writes via a temp file + rename so a crash mid-write can't truncate the journal. */
  save() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), "utf8");
    fs.renameSync(tmp, this.file);
    return this.snapshot();
  }

  snapshot() {
    const bytes = this.shotBytes();
    return {
      accounts: this.data.accounts,
      activeAccountId: this.data.activeAccountId,
      presetTags: this.data.presetTags,
      theme: this.data.theme,
      breakevenBand: this.data.breakevenBand,
      days: this.data.days,
      storageBytes: bytes,
      dataDir: this.dir,
      migratedFrom: this.migratedFrom || null,
    };
  }

  shotBytes() {
    let total = 0;
    try {
      for (const name of fs.readdirSync(this.shotsDir)) {
        try {
          total += fs.statSync(path.join(this.shotsDir, name)).size;
        } catch {
          /* file vanished between listing and stat */
        }
      }
    } catch {
      /* directory missing */
    }
    return total;
  }

  // --- screenshots ---------------------------------------------------------

  /** Writes a `data:` URL to disk and returns the record the UI refers to it by. */
  writeShot(name, dataUrl) {
    const m = /^data:(image\/[a-z+]+);base64,(.*)$/s.exec(String(dataUrl || ""));
    if (!m) return null;
    const id = newId("sh");
    const ext = m[1] === "image/png" ? "png" : "jpg";
    const file = `${id}.${ext}`;
    fs.writeFileSync(path.join(this.shotsDir, file), Buffer.from(m[2], "base64"));
    return { id, name: String(name || "screenshot").slice(0, 200), file };
  }

  shotPath(file) {
    // Refuse anything that tries to climb out of the screenshots folder.
    const resolved = path.resolve(this.shotsDir, String(file || ""));
    return resolved.startsWith(path.resolve(this.shotsDir) + path.sep) ? resolved : null;
  }

  removeShotFiles(shots) {
    for (const s of shots || []) {
      const p = this.shotPath(s.file);
      if (p) {
        try {
          fs.unlinkSync(p);
        } catch {
          /* already gone */
        }
      }
    }
  }

  // --- days ----------------------------------------------------------------

  saveDay(input) {
    const accountId = this.data.activeAccountId;
    const date = String(input.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("A day needs a valid date.");

    const shots = (input.shots || [])
      .map((s) => this.writeShot(s.name, s.data))
      .filter(Boolean);

    const trades = (input.trades || []).map((t) => ({
      time: String(t.time || "").slice(0, 8),
      side: t.side === "SHORT" ? "SHORT" : "LONG",
      symbol: String(t.symbol || "").slice(0, 12),
      size: Math.max(0, Math.round(Number(t.size) || 0)),
      entry: numOrNull(t.entry),
      exit: numOrNull(t.exit),
      pnl: Number(t.pnl) || 0,
      fees: numOrNull(t.fees),
    }));

    const fields = {
      net: Math.round(Number(input.net) || 0),
      wins: Math.max(0, Math.round(Number(input.wins) || 0)),
      losses: Math.max(0, Math.round(Number(input.losses) || 0)),
      contracts: Math.max(0, Math.round(Number(input.contracts) || 0)),
      note: String(input.note || ""),
      tags: (input.tags || []).filter((t) => typeof t === "string").slice(0, 12),
      trades,
    };

    this.writeDay(accountId, date, fields, shots);

    // Copy-traded: the same session ran on other accounts, so each gets its own
    // copy of the day. The screenshot stays with the account it was taken on.
    const copies = (input.copyTo || []).filter(
      (id) => id !== accountId && this.data.accounts.some((a) => a.id === id && !a.archived),
    );
    for (const id of new Set(copies)) this.writeDay(id, date, fields, []);

    return this.save();
  }

  /** Inserts or replaces one account's day. Screenshots always accumulate. */
  writeDay(accountId, date, fields, shots) {
    const existing = this.data.days.find((d) => d.accountId === accountId && d.date === date);
    if (existing) {
      // Re-saving a date replaces its numbers and trades, but screenshots
      // accumulate so an earlier upload is never silently dropped.
      Object.assign(existing, fields, { shots: [...(existing.shots || []), ...shots] });
    } else {
      this.data.days.push({ id: newId("day"), accountId, date, ...fields, shots });
    }
  }

  patchDay(id, patch) {
    const day = this.data.days.find((d) => d.id === id);
    if (!day) throw new Error("No such day.");
    if (typeof patch.note === "string") day.note = patch.note;
    if (Array.isArray(patch.tags)) {
      day.tags = patch.tags.filter((t) => typeof t === "string").slice(0, 12);
    }
    for (const s of patch.shots || []) {
      const shot = this.writeShot(s.name, s.data);
      if (shot) day.shots.push(shot);
    }
    return this.save();
  }

  deleteDay(id) {
    const i = this.data.days.findIndex((d) => d.id === id);
    if (i < 0) throw new Error("No such day.");
    this.removeShotFiles(this.data.days[i].shots);
    this.data.days.splice(i, 1);
    return this.save();
  }

  setBreakevenBand(value) {
    const n = Number(value);
    this.data.breakevenBand = Number.isFinite(n) && n > 0 ? Math.min(n, 100000) : 0;
    return this.save();
  }

  setTheme(theme) {
    if (!theme || typeof theme.preset !== "string") throw new Error("Bad theme.");
    this.data.theme = {
      preset: theme.preset,
      custom: theme.custom && typeof theme.custom === "object" ? theme.custom : null,
    };
    return this.save();
  }

  // --- preset tags ----------------------------------------------------------
  // These are only the quick-pick palette on the entry form. Removing one never
  // touches days already tagged with it.

  addTag(label) {
    const clean = String(label || "").trim().slice(0, MAX_TAG_LENGTH);
    if (!clean) throw new Error("A tag needs a name.");
    if (this.data.presetTags.length >= MAX_TAGS) {
      throw new Error(`That's the limit of ${MAX_TAGS} tags.`);
    }
    if (this.data.presetTags.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      throw new Error("You already have that tag.");
    }
    this.data.presetTags.push(clean);
    return this.save();
  }

  renameTag(from, to) {
    const clean = String(to || "").trim().slice(0, MAX_TAG_LENGTH);
    if (!clean) throw new Error("A tag needs a name.");
    const i = this.data.presetTags.indexOf(from);
    if (i < 0) throw new Error("No such tag.");
    if (
      this.data.presetTags.some((t, j) => j !== i && t.toLowerCase() === clean.toLowerCase())
    ) {
      throw new Error("You already have that tag.");
    }
    this.data.presetTags[i] = clean;
    // Carry the rename onto days already using it, so history stays consistent.
    for (const day of this.data.days) {
      day.tags = (day.tags || []).map((t) => (t === from ? clean : t));
    }
    return this.save();
  }

  deleteTag(label) {
    const i = this.data.presetTags.indexOf(label);
    if (i < 0) throw new Error("No such tag.");
    this.data.presetTags.splice(i, 1);
    return this.save();
  }

  // --- trading accounts ----------------------------------------------------

  addAccount(input) {
    const clean = String(input.name || "").trim();
    if (!clean) throw new Error("An account needs a name.");
    const acc = normalizeAccount({ ...input, id: newId("acc"), name: clean, archived: false });
    // A prop account's starting balance is its size.
    if (acc.firm && acc.size) acc.start = acc.size;
    this.data.accounts.push(acc);
    this.data.activeAccountId = acc.id;
    return this.save();
  }

  patchAccount(id, patch) {
    const acc = this.data.accounts.find((a) => a.id === id);
    if (!acc) throw new Error("No such account.");
    if (typeof patch.name === "string") acc.name = patch.name;
    if (typeof patch.broker === "string") acc.broker = patch.broker;
    if (patch.start !== undefined) acc.start = toNumber(patch.start);
    if (patch.firm !== undefined) acc.firm = patch.firm ? String(patch.firm) : null;
    if (patch.plan !== undefined) acc.plan = patch.plan ? String(patch.plan) : null;
    if (patch.size !== undefined) {
      acc.size = patch.size === null ? null : toNumber(patch.size);
      if (acc.firm && acc.size) acc.start = acc.size;
    }
    if (patch.rules !== undefined) acc.rules = normalizeRules(patch.rules);
    if (patch.phase !== undefined) {
      const before = acc.phase;
      acc.phase = patch.phase;
      // Resetting by hand clears the markers so the detector can run again.
      if (patch.phase === "eval") {
        acc.passedOn = null;
        acc.blownOn = null;
      }
      if (patch.phase !== before && patch.phase !== "blown") acc.payouts = [];
    }
    if (patch.passedOn !== undefined) acc.passedOn = patch.passedOn;
    if (patch.blownOn !== undefined) acc.blownOn = patch.blownOn;
    if (patch.active) this.data.activeAccountId = id;
    return this.save();
  }

  /**
   * Applies an evaluation outcome worked out by the renderer. Kept as a plain
   * setter so the rule logic lives in one place (lib/account.ts) rather than
   * being duplicated on both sides of the bridge.
   */
  setPhase(id, phase, on) {
    const acc = this.data.accounts.find((a) => a.id === id);
    if (!acc) throw new Error("No such account.");
    const before = acc.phase;
    acc.phase = phase;
    if (phase === "funded" && on) acc.passedOn = on;
    if (phase === "blown" && on) acc.blownOn = on;
    // A phase reset starts the balance again, so the withdrawals that belonged
    // to the old one go with it. That also means payouts never have to be
    // matched against a date to know which phase they are in.
    if (phase !== before && phase !== "blown") acc.payouts = [];
    return this.save();
  }

  /**
   * Records money actually withdrawn. The app can't know what a firm paid, so
   * this is simply what the user says they requested — it comes straight off the
   * journal's balance and the drawdown cushion with it.
   */
  addPayout(id, amount, date) {
    const acc = this.data.accounts.find((a) => a.id === id);
    if (!acc) throw new Error("No such account.");
    const value = Math.round(Number(amount) || 0);
    if (!(value > 0)) throw new Error("A payout needs an amount.");
    acc.payouts.push({
      id: newId("pay"),
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? date : todayIso(),
      amount: value,
    });
    return this.save();
  }

  deletePayout(accountId, payoutId) {
    const acc = this.data.accounts.find((a) => a.id === accountId);
    if (!acc) throw new Error("No such account.");
    acc.payouts = acc.payouts.filter((p) => p.id !== payoutId);
    return this.save();
  }

  /**
   * Retires an account: it leaves the switcher but its days are kept for good,
   * so "All time" stays a complete record of everything ever traded. This is
   * what the blown-account button does — deleting outright is a separate,
   * deliberate action in Settings.
   */
  archiveAccount(id) {
    const acc = this.data.accounts.find((a) => a.id === id);
    if (!acc) throw new Error("No such account.");
    const live = this.data.accounts.filter((a) => !a.archived && a.id !== id);
    if (!live.length) throw new Error("You need at least one account you're still trading.");
    acc.archived = true;
    if (this.data.activeAccountId === id) this.data.activeAccountId = live[0].id;
    return this.save();
  }

  restoreAccount(id) {
    const acc = this.data.accounts.find((a) => a.id === id);
    if (!acc) throw new Error("No such account.");
    acc.archived = false;
    return this.save();
  }

  deleteAccount(id) {
    if (this.data.accounts.filter((a) => !a.archived).length < 2) {
      throw new Error("You need at least one trading account.");
    }
    const remaining = this.data.accounts.filter((a) => a.id !== id);
    if (remaining.length === this.data.accounts.length) throw new Error("No such account.");

    for (const day of this.data.days.filter((d) => d.accountId === id)) {
      this.removeShotFiles(day.shots);
    }
    this.data.accounts = remaining;
    this.data.days = this.data.days.filter((d) => d.accountId !== id);
    if (this.data.activeAccountId === id) this.data.activeAccountId = remaining[0].id;
    return this.save();
  }

  erase() {
    for (const day of this.data.days) this.removeShotFiles(day.shots);
    this.data.days = [];
    return this.save();
  }

  // --- backup --------------------------------------------------------------

  /** A self-contained backup: screenshots are inlined so the file stands alone. */
  exportPayload() {
    return {
      format: "zb-tracker/v2",
      exportedAt: new Date().toISOString(),
      accounts: this.data.accounts,
      activeAccountId: this.data.activeAccountId,
      presetTags: this.data.presetTags,
      theme: this.data.theme,
      breakevenBand: this.data.breakevenBand,
      days: this.data.days.map((d) => ({
        ...d,
        shots: (d.shots || []).flatMap((s) => {
          const p = this.shotPath(s.file);
          if (!p) return [];
          try {
            const mime = s.file.endsWith(".png") ? "image/png" : "image/jpeg";
            return [{ name: s.name, data: `data:${mime};base64,${fs.readFileSync(p).toString("base64")}` }];
          } catch {
            return [];
          }
        }),
      })),
    };
  }

  importPayload(payload) {
    if (!payload || !Array.isArray(payload.accounts) || !Array.isArray(payload.days)) {
      throw new Error("That file isn't a Z&B Tracker export.");
    }

    // Replace outright, and clear the old screenshots so they don't leak.
    for (const day of this.data.days) this.removeShotFiles(day.shots);

    const idMap = new Map();
    const accounts = payload.accounts.map((a) => {
      const id = newId("acc");
      if (a.id) idMap.set(a.id, id);
      return normalizeAccount({ ...a, id });
    });
    if (!accounts.length) throw new Error("That export has no trading accounts.");

    const fallback = accounts[0].id;
    const seen = new Set();
    const days = [];

    for (const d of payload.days) {
      const date = String(d.date || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const accountId = idMap.get(d.accountId) || fallback;
      const key = `${accountId}:${date}`;
      if (seen.has(key)) continue;
      seen.add(key);

      days.push({
        id: newId("day"),
        accountId,
        date,
        net: Math.round(Number(d.net) || 0),
        wins: Math.max(0, Math.round(Number(d.wins) || 0)),
        losses: Math.max(0, Math.round(Number(d.losses) || 0)),
        contracts: Math.max(0, Math.round(Number(d.contracts) || 0)),
        note: String(d.note || ""),
        tags: (d.tags || []).filter((t) => typeof t === "string").slice(0, 12),
        trades: (d.trades || []).map((t) => ({
          time: String(t.time || "").slice(0, 8),
          side: String(t.side).toUpperCase() === "SHORT" ? "SHORT" : "LONG",
          symbol: String(t.symbol || "").slice(0, 12),
          size: Math.max(0, Math.round(Number(t.size) || 0)),
          entry: numOrNull(t.entry),
          exit: numOrNull(t.exit),
          pnl: Number(t.pnl) || 0,
          fees: numOrNull(t.fees),
        })),
        shots: (d.shots || [])
          .map((s) => this.writeShot(s.name, s.data))
          .filter(Boolean),
      });
    }

    this.data = this.normalize({
      accounts,
      activeAccountId: idMap.get(payload.activeAccountId) || fallback,
      presetTags: Array.isArray(payload.presetTags) ? payload.presetTags : null,
      theme: payload.theme || null,
      breakevenBand: payload.breakevenBand,
      days,
    });
    return { snapshot: this.save(), imported: days.length };
  }
}

function cleanTags(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const t = raw.trim().slice(0, MAX_TAG_LENGTH);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function toNumber(v) {
  const n = parseFloat(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

module.exports = { Store };
