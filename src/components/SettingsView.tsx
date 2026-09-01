import { useState } from "react";
import type { Journal } from "../lib/types";
import { money } from "../lib/format";
import { store, StoreError } from "../lib/store";
import { PRESETS, seedFor, type ThemeChoice, type ThemeSeed } from "../lib/theme";
import { dayKind } from "../lib/account";
import { summarize } from "../lib/stats";
import { C, MONO, caption } from "./ui";
import { AccountListHeader, AccountRow, AddAccount } from "./AccountRow";

// Settings used to be one long scroll of four panels, which made finding
// anything a hunt. It is now a rail of sections with one panel at a time — the
// same content, but you only ever look at the part you came for.

type Props = {
  journal: Journal;
  theme: ThemeChoice;
  /** Runs a mutation and applies its snapshot, discarding out-of-order replies. */
  commit: (fn: () => Promise<Journal>) => Promise<Journal | null>;
  setJournal: (j: Journal) => void;
  note: string;
  setNote: (s: string) => void;
};

type Section = "appearance" | "accounts" | "journal" | "data";

const SECTIONS: { id: Section; label: string; blurb: string }[] = [
  { id: "appearance", label: "Appearance", blurb: "Theme and colours" },
  { id: "accounts", label: "Accounts", blurb: "Prop firms, rules, phases" },
  { id: "journal", label: "Journal", blurb: "Breakeven and tags" },
  { id: "data", label: "Your data", blurb: "Backup, restore, erase" },
];

export default function SettingsView({
  journal,
  theme,
  commit,
  setJournal,
  note,
  setNote,
}: Props) {
  const [section, setSection] = useState<Section>("appearance");
  const current = SECTIONS.find((s) => s.id === section)!;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, width: "100%" }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        <div style={caption(10, 1.5)}>This computer</div>
        <h1 style={{ margin: 0, fontSize: 31, fontWeight: 700, letterSpacing: -0.9 }}>Settings</h1>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(180px, 218px) minmax(0, 1fr)",
          gap: 18,
          alignItems: "start",
        }}
      >
        <nav
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 3,
            position: "sticky",
            top: 8,
          }}
        >
          {SECTIONS.map((s) => {
            const on = s.id === section;
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                aria-current={on ? "page" : undefined}
                className={on ? undefined : "hov-raised"}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  textAlign: "left",
                  border: "1px solid",
                  borderColor: on ? C.line2 : "transparent",
                  borderRadius: 10,
                  padding: "10px 13px",
                  cursor: "pointer",
                  background: on ? C.active : "transparent",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: -1,
                    top: 10,
                    bottom: 10,
                    width: 2.5,
                    borderRadius: 2,
                    background: on ? C.accent : "transparent",
                  }}
                />
                <span
                  style={{
                    fontSize: 13.5,
                    fontWeight: on ? 600 : 500,
                    letterSpacing: -0.1,
                    color: on ? C.text : C.mute,
                  }}
                >
                  {s.label}
                </span>
                <span style={{ fontSize: 11, color: C.fainter }}>{s.blurb}</span>
              </button>
            );
          })}
        </nav>

        <section
          style={{
            border: `1px solid ${C.line}`,
            borderRadius: 14,
            background: C.panel,
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            minWidth: 0,
            animation: "riseIn 160ms ease both",
          }}
          key={section}
        >
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <div style={caption()}>{current.label}</div>
            <div style={{ fontSize: 11.5, color: C.fainter }}>{current.blurb}</div>
          </div>

          {section === "appearance" ? <Appearance theme={theme} journal={journal} commit={commit} /> : null}
          {section === "accounts" ? <Accounts journal={journal} commit={commit} /> : null}
          {section === "journal" ? <JournalPrefs journal={journal} commit={commit} /> : null}
          {section === "data" ? (
            <Data
              journal={journal}
              commit={commit}
              setJournal={setJournal}
              note={note}
              setNote={setNote}
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}

// --- Appearance --------------------------------------------------------------

function Appearance({
  theme,
  journal,
  commit,
}: {
  theme: ThemeChoice;
  journal: Journal;
  commit: Props["commit"];
}) {
  // Editing a colour while on a preset starts the custom theme from that preset,
  // so you are always tweaking what you can currently see.
  const customSeed: ThemeSeed = journal.theme?.custom ?? seedFor(theme);

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(168px, 1fr))",
          gap: 10,
        }}
      >
        {PRESETS.map((p) => (
          <ThemeCard
            key={p.id}
            name={p.name}
            blurb={p.blurb}
            seed={p.seed}
            on={theme.preset === p.id}
            onClick={() => commit(() => store.setTheme({ ...theme, preset: p.id }))}
          />
        ))}
        <ThemeCard
          name="Custom"
          blurb="Your own five colours"
          seed={customSeed}
          on={theme.preset === "custom"}
          onClick={() => commit(() => store.setTheme({ preset: "custom", custom: customSeed }))}
        />
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          alignItems: "flex-end",
          borderTop: `1px solid ${C.line3}`,
          paddingTop: 16,
        }}
      >
        {SWATCHES.map(({ key, label }) => (
          <label key={key} style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 0 }}>
            <span style={{ fontSize: 11.5, color: C.mute2 }}>{label}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="color"
                value={customSeed[key]}
                onChange={(e) => {
                  const next = { ...customSeed, [key]: e.target.value };
                  commit(() => store.setTheme({ preset: "custom", custom: next }));
                }}
                style={{
                  width: 38,
                  height: 30,
                  padding: 2,
                  background: C.field,
                  border: `1px solid ${C.line2}`,
                  borderRadius: 7,
                  cursor: "pointer",
                }}
              />
              <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>
                {customSeed[key].toUpperCase()}
              </span>
            </span>
          </label>
        ))}
        <span style={{ fontSize: 11.5, color: C.fainter, flex: 1, minWidth: 200, lineHeight: 1.7 }}>
          Editing any of these switches to the custom theme. Everything else — panels, borders,
          muted text — is mixed from them, so a light background works as well as a dark one.
        </span>
      </div>
    </>
  );
}

// --- Accounts ----------------------------------------------------------------

function Accounts({ journal, commit }: { journal: Journal; commit: Props["commit"] }) {
  const live = journal.accounts.filter((a) => !a.archived);
  const retired = journal.accounts.filter((a) => a.archived);

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        <AccountListHeader />
        {live.map((a) => (
          <AccountRow key={a.id} journal={journal} account={a} commit={commit} />
        ))}
      </div>

      <AddAccount onAdd={(input) => commit(() => store.addAccount(input))} />

      {retired.length ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 9,
            borderTop: `1px solid ${C.line3}`,
            paddingTop: 16,
          }}
        >
          <div style={caption()}>Closed accounts</div>
          <div style={{ fontSize: 11.5, color: C.fainter, lineHeight: 1.7, maxWidth: 560 }}>
            Out of the switcher, but every day you logged on them is kept and still counts toward
            All time. Bring one back, or delete it for good — deleting also destroys its entries and
            screenshots, and takes them out of All time with it.
          </div>
          {retired.map((a) => {
            const s = summarize(
              journal.days.filter((d) => d.accountId === a.id),
              journal.breakevenBand ?? 0,
            );
            return (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  border: `1px solid ${C.line3}`,
                  borderRadius: 10,
                  padding: "10px 14px",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <span style={{ fontSize: 13, color: C.mute, fontWeight: 600 }}>{a.name}</span>
                  <span style={{ fontSize: 11, color: C.fainter }}>
                    {s.days} {s.days === 1 ? "day" : "days"} ·{" "}
                    <span style={{ color: s.net >= 0 ? C.pos : C.neg }}>{money(s.net)}</span>
                  </span>
                </span>
                <span style={{ display: "flex", gap: 7 }}>
                  <button
                    onClick={() => commit(() => store.restoreAccount(a.id))}
                    className="hov-raised"
                    style={{ ...ghost, height: 30, fontSize: 12 }}
                  >
                    Bring it back
                  </button>
                  <button
                    onClick={() => commit(() => store.deleteAccount(a.id))}
                    className="hov-danger"
                    style={{
                      height: 30,
                      padding: "0 12px",
                      border: "1px solid var(--danger-edge)",
                      background: "transparent",
                      color: "var(--danger-ink)",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    Delete for good
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      <div
        style={{
          fontSize: 11.5,
          color: C.fainter,
          lineHeight: 1.75,
          borderTop: `1px solid ${C.line3}`,
          paddingTop: 14,
        }}
      >
        Pick a prop firm and the plan you bought, and the profit target, drawdown, daily loss and
        consistency rule are filled in for you. From there the app works out on its own whether the
        evaluation is still running, has been cleared — at which point the balance resets and the
        account shows as funded — or has been breached.
      </div>
    </>
  );
}

// --- Journal preferences -----------------------------------------------------

function JournalPrefs({ journal, commit }: { journal: Journal; commit: Props["commit"] }) {
  const [newTag, setNewTag] = useState("");
  const band = journal.breakevenBand ?? 0;

  async function addTag() {
    const label = newTag.trim();
    if (!label) return;
    const ok = await commit(() => store.addTag(label));
    if (ok) setNewTag("");
  }

  const affected = journal.days.filter(
    (d) => d.net !== 0 && dayKind(d.net, band) === "flat",
  ).length;

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>What counts as breakeven</div>
        <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.75, maxWidth: 560 }}>
          Commissions alone can leave a scratched session a few dollars down. Anything within this
          much of zero is shown as a flat day in grey rather than a red one, and is counted in
          neither the wins nor the losses.
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: MONO, fontSize: 13, color: C.faint }}>±$</span>
            <input
              type="text"
              inputMode="numeric"
              defaultValue={String(band)}
              key={band}
              onBlur={(e) => {
                const v = Math.max(0, Math.round(Number(e.target.value.replace(/[$,\s]/g, "")) || 0));
                if (v !== band) commit(() => store.setBreakeven(v));
                else e.target.value = String(band);
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              style={{
                width: 96,
                background: C.field,
                border: `1px solid ${C.line2}`,
                borderRadius: 8,
                padding: "9px 11px",
                color: C.text,
                fontFamily: MONO,
                fontSize: 13.5,
              }}
            />
          </span>
          {[0, 10, 20, 50].map((v) => (
            <button
              key={v}
              onClick={() => commit(() => store.setBreakeven(v))}
              className="hov-raised"
              style={{
                height: 30,
                padding: "0 12px",
                border: `1px solid ${band === v ? C.accent : C.line2}`,
                background: "transparent",
                color: band === v ? C.text : C.faint,
                borderRadius: 999,
                cursor: "pointer",
                fontFamily: MONO,
                fontSize: 12,
              }}
            >
              {v === 0 ? "Exact" : `±$${v}`}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 11.5, color: band > 0 && affected ? C.flat : C.fainter }}>
          {band === 0
            ? "Only a day that lands on exactly $0 is flat."
            : `${affected} logged ${affected === 1 ? "day counts" : "days count"} as breakeven at ${money(-band)} to ${money(band)}.`}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          borderTop: `1px solid ${C.line3}`,
          paddingTop: 16,
        }}
      >
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>Tags</div>
        <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.75, maxWidth: 560 }}>
          The quick-pick list on a new entry. Renaming a tag updates it everywhere it has already
          been used; removing one only takes it off this list — days already tagged with it keep it.
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {journal.presetTags.map((t) => {
            const used = journal.days.filter((d) => d.tags.includes(t)).length;
            return (
              <span
                key={t}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  border: `1px solid ${C.line2}`,
                  borderRadius: 999,
                  padding: "5px 6px 5px 12px",
                  fontSize: 11.5,
                  color: C.mute,
                }}
              >
                <input
                  type="text"
                  defaultValue={t}
                  title={used ? `Used on ${used} ${used === 1 ? "day" : "days"}` : "Not used yet"}
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (!next || next === t) {
                      e.target.value = t;
                      return;
                    }
                    commit(() => store.renameTag(t, next));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") {
                      e.currentTarget.value = t;
                      e.currentTarget.blur();
                    }
                  }}
                  style={{
                    background: "transparent",
                    border: "1px solid transparent",
                    borderRadius: 5,
                    padding: "1px 3px",
                    color: C.mute,
                    fontSize: 11.5,
                  }}
                  className="hov-border tag-input"
                />
                {used ? (
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.faintest }}>{used}</span>
                ) : null}
                <button
                  onClick={() => commit(() => store.deleteTag(t))}
                  title="Remove from the list"
                  className="hov-red"
                  style={{
                    border: "none",
                    background: "transparent",
                    color: C.faintest,
                    fontSize: 13,
                    cursor: "pointer",
                    padding: "0 4px",
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </span>
            );
          })}
          {journal.presetTags.length === 0 ? (
            <span style={{ fontSize: 11.5, color: C.fainter }}>
              No tags yet — add your first below.
            </span>
          ) : null}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 104px",
            gap: 10,
            alignItems: "center",
          }}
        >
          <input
            type="text"
            value={newTag}
            maxLength={28}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addTag();
            }}
            placeholder="New tag — e.g. Held through news, Perfect entry"
            style={newInput}
          />
          <button onClick={addTag} className="hov-raised" style={{ ...ghost, height: 38 }}>
            Add tag
          </button>
        </div>
      </div>
    </>
  );
}

// --- Data --------------------------------------------------------------------

function Data({
  journal,
  commit,
  setJournal,
  note,
  setNote,
}: {
  journal: Journal;
  commit: Props["commit"];
  setJournal: (j: Journal) => void;
  note: string;
  setNote: (s: string) => void;
}) {
  const [wipeArm, setWipeArm] = useState(false);
  const days = journal.days;
  const totalTrades = days.reduce((a, d) => a + d.trades.length, 0);
  const totalShots = days.reduce((a, d) => a + d.shots.length, 0);
  const kb = journal.storageBytes / 1024;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
        <DataStat value={days.length} label={days.length === 1 ? "day logged" : "days logged"} />
        <DataStat value={totalTrades} label={totalTrades === 1 ? "trade" : "trades"} />
        <DataStat value={totalShots} label={totalShots === 1 ? "screenshot" : "screenshots"} />
        <DataStat
          value={kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`}
          label="on disk"
        />
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          borderTop: `1px solid ${C.line3}`,
          paddingTop: 16,
        }}
      >
        <button
          onClick={async () => {
            try {
              const r = await store.exportJournal();
              if (r.saved) setNote(`Saved to ${r.filePath}`);
            } catch (e) {
              setNote(e instanceof StoreError ? e.message : "Export failed.");
            }
          }}
          className="hov-raised"
          style={ghost}
        >
          Back up to a file
        </button>
        <button
          onClick={async () => {
            try {
              const r = await store.importJournal();
              if (r.imported && r.snapshot) {
                setJournal(r.snapshot);
                setNote(`Restored ${r.count} days.`);
              }
            } catch (e) {
              setNote(e instanceof StoreError ? e.message : "That file could not be read.");
            }
          }}
          className="hov-raised"
          style={ghost}
        >
          Restore from a file
        </button>
        <button onClick={() => store.revealData()} className="hov-raised" style={ghost}>
          Show data folder
        </button>
        <button
          onClick={async () => {
            if (!wipeArm) return setWipeArm(true);
            setWipeArm(false);
            await commit(() => store.erase());
            setNote("All entries erased.");
          }}
          className="hov-danger"
          style={{
            height: 36,
            padding: "0 14px",
            border: "1px solid var(--danger-edge)",
            background: "transparent",
            color: "var(--danger-ink)",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 12.5,
          }}
        >
          {wipeArm ? "Click again to erase everything" : "Erase all entries"}
        </button>
      </div>

      <div
        style={{
          fontSize: 11.5,
          color: C.fainter,
          lineHeight: 1.75,
          borderTop: `1px solid ${C.line3}`,
          paddingTop: 14,
        }}
      >
        {note ? <div style={{ color: C.mute2, marginBottom: 8 }}>{note}</div> : null}
        {journal.migratedFrom ? (
          <div style={{ color: C.pos, marginBottom: 8 }}>
            Your journal was carried over from the previous version at{" "}
            <span style={{ fontFamily: MONO }}>{journal.migratedFrom}</span>. The old copy was left
            where it was.
          </div>
        ) : null}
        Everything lives on this computer, in:
        <div
          style={{
            fontFamily: MONO,
            fontSize: 11.5,
            color: C.mute2,
            marginTop: 6,
            wordBreak: "break-all",
            userSelect: "all",
          }}
        >
          {journal.dataDir}
        </div>
        <div style={{ marginTop: 8 }}>
          Nothing is sent anywhere and no account is needed. Back up to a file now and then — that
          one file holds every entry, trade and screenshot.
        </div>
      </div>
    </>
  );
}

const SWATCHES: { key: keyof ThemeSeed; label: string }[] = [
  { key: "bg", label: "Background" },
  { key: "fg", label: "Text" },
  { key: "pos", label: "Profit" },
  { key: "neg", label: "Loss" },
  { key: "accent", label: "Accent" },
];

function ThemeCard({
  name,
  blurb,
  seed,
  on,
  onClick,
}: {
  name: string;
  blurb: string;
  seed: ThemeSeed;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        textAlign: "left",
        padding: 12,
        borderRadius: 11,
        cursor: "pointer",
        background: C.field,
        border: `1px solid ${on ? C.accent : C.line2}`,
        boxShadow: on ? `inset 0 0 0 1px ${C.accent}` : undefined,
      }}
    >
      {/* A miniature of the app: surface, a rising line, and the two P&L tones. */}
      <span
        style={{
          height: 46,
          borderRadius: 7,
          background: seed.bg,
          border: `1px solid ${seed.fg}22`,
          position: "relative",
          overflow: "hidden",
          display: "block",
        }}
      >
        <svg viewBox="0 0 100 46" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
          <path
            d="M4,34 L22,26 L38,31 L54,17 L70,22 L96,9"
            fill="none"
            stroke={seed.pos}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="4" y="38" width="26" height="4" rx="2" fill={seed.fg} opacity="0.35" />
          <rect x="34" y="38" width="12" height="4" rx="2" fill={seed.neg} />
          <rect x="50" y="38" width="12" height="4" rx="2" fill={seed.accent} />
        </svg>
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ fontSize: 12.5, color: on ? C.text : C.dim, fontWeight: on ? 600 : 400 }}>
          {name}
        </span>
        <span style={{ fontSize: 11, color: C.fainter }}>{blurb}</span>
      </span>
    </button>
  );
}

function DataStat({ value, label }: { value: string | number; label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontFamily: MONO, fontSize: 19, fontWeight: 500 }}>{value}</span>
      <span style={{ fontSize: 11.5, color: C.faint }}>{label}</span>
    </div>
  );
}

const ghost: React.CSSProperties = {
  height: 36,
  padding: "0 14px",
  border: `1px solid ${C.line2}`,
  background: "transparent",
  color: C.dim,
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 12.5,
};

const newInput: React.CSSProperties = {
  minWidth: 0,
  width: "100%",
  background: C.field,
  border: `1px solid ${C.line2}`,
  borderRadius: 8,
  padding: "10px 12px",
  color: C.text,
  fontSize: 13,
};
