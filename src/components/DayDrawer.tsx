import { useEffect, useState } from "react";
import type { DayDTO } from "../lib/types";
import { colorFor, money } from "../lib/format";
import { readShot } from "../lib/store";
import { C, MONO, caption, cssUrl } from "./ui";

type Props = {
  /**
   * Every entry logged on this date. Usually one, but All time and Current
   * stack span several accounts and you can trade the same day on all of them —
   * so the drawer holds them all and lets you switch between them.
   */
  days: DayDTO[];
  accountFor: (accountId: string) => string;
  /** True when the view spans accounts and naming them earns its place. */
  showAccounts: boolean;
  onClose: () => void;
  onNote: (day: DayDTO, note: string) => void;
  onAddShots: (day: DayDTO, shots: { name: string; data: string }[]) => void;
  onOpenShot: (url: string) => void;
  onDelete: (day: DayDTO) => void;
};

export default function DayDrawer({
  days,
  accountFor,
  showAccounts,
  onClose,
  onNote,
  onAddShots,
  onOpenShot,
  onDelete,
}: Props) {
  const [picked, setPicked] = useState(0);
  const day = days[Math.min(picked, days.length - 1)];
  const [note, setNote] = useState(day.note);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // A different date means starting from its first entry again.
  useEffect(() => setPicked(0), [days[0]?.date]);

  useEffect(() => {
    setNote(day.note);
    setConfirmDelete(false);
  }, [day.id, day.note]);

  // Notes save on blur rather than on every keystroke, so typing doesn't fire a
  // request per character.
  const commit = () => {
    if (note !== day.note) onNote(day, note);
  };

  const dt = new Date(`${day.date}T12:00:00`);
  const total = days.reduce((a, d) => a + d.net, 0);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "color-mix(in srgb, var(--bg) 62%, transparent)",
          zIndex: 40,
          animation: "fadeIn 0.16s ease",
        }}
      />
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 560,
          maxWidth: "100vw",
          background: C.drawer,
          borderLeft: `1px solid ${C.line2}`,
          zIndex: 41,
          overflowY: "auto",
          padding: "26px 28px 40px",
          animation: "slideIn 0.2s ease",
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={caption(10, 1.4)}>
              {dt.toLocaleDateString("en-US", { weekday: "long" })}
            </div>
            <h2 style={{ margin: 0, fontSize: 25, fontWeight: 700, letterSpacing: -0.7 }}>
              {dt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </h2>
            {days.length > 1 ? (
              <div style={{ fontSize: 12, color: C.faint }}>
                {days.length} accounts traded ·{" "}
                <span style={{ fontFamily: MONO, color: colorFor(total) }}>{money(total)}</span>{" "}
                combined
              </div>
            ) : null}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="hov-close"
            style={{
              width: 32,
              height: 32,
              border: `1px solid ${C.line2}`,
              background: "transparent",
              color: C.mute2,
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 15,
            }}
          >
            ×
          </button>
        </div>

        {days.length > 1 || showAccounts ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={caption()}>{days.length > 1 ? "Which account" : "Account"}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {days.map((d, i) => {
                const on = d.id === day.id;
                return (
                  <button
                    key={d.id}
                    onClick={() => setPicked(i)}
                    aria-pressed={on}
                    disabled={days.length === 1}
                    className={on ? undefined : "hov-raised"}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 9,
                      border: `1px solid ${on ? C.edge : C.line2}`,
                      borderRadius: 999,
                      padding: "7px 13px",
                      cursor: days.length === 1 ? "default" : "pointer",
                      background: on ? C.active : "transparent",
                      color: on ? C.text : C.mute,
                      fontSize: 12.5,
                      fontWeight: on ? 600 : 500,
                    }}
                  >
                    {accountFor(d.accountId)}
                    <span style={{ fontFamily: MONO, fontSize: 11.5, color: colorFor(d.net) }}>
                      {money(d.net)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          <Metric label="Net P&L">
            <span style={{ ...metricValue, color: colorFor(day.net) }}>{money(day.net)}</span>
          </Metric>
          <Metric label="Record">
            <span style={metricValue}>
              {day.wins}W / {day.losses}L
            </span>
          </Metric>
          <Metric label="Contracts">
            <span style={metricValue}>{day.contracts}</span>
          </Metric>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={caption()}>Notes</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={commit}
            placeholder="Add a note for this day."
            style={{
              minHeight: 108,
              resize: "vertical",
              background: C.field,
              border: `1px solid ${C.line2}`,
              borderRadius: 10,
              padding: 13,
              color: "var(--dim)",
              fontSize: 13,
              lineHeight: 1.7,
            }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {day.tags.map((t) => (
              <span
                key={t}
                style={{
                  fontSize: 11,
                  color: C.mute,
                  background: "var(--raised)",
                  borderRadius: 999,
                  padding: "5px 11px",
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
          >
            <div style={caption()}>Trades</div>
            <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.fainter }}>
              {day.trades.length} logged
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {day.trades.map((t, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "54px 46px 1fr 62px 84px",
                  alignItems: "center",
                  gap: 12,
                  border: `1px solid ${C.line3}`,
                  borderRadius: 9,
                  padding: "11px 13px",
                }}
              >
                <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>
                  {t.time || "—"}
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 10.5,
                    letterSpacing: 0.6,
                    color: t.side === "LONG" ? C.long : C.short,
                  }}
                >
                  {t.side}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.mute2 }}>
                  {t.entry !== null && t.exit !== null
                    ? `${t.entry.toFixed(2)} → ${t.exit.toFixed(2)}`
                    : "—"}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>
                  {(t.symbol || "—") + (t.size ? ` ×${t.size}` : "")}
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 13,
                    textAlign: "right",
                    color: colorFor(t.pnl),
                  }}
                >
                  {money(Math.round(t.pnl))}
                </span>
              </div>
            ))}
            {day.trades.length === 0 ? (
              <div style={{ fontSize: 12, color: C.fainter, padding: "6px 2px" }}>
                No individual trades recorded for this day.
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={caption()}>Screenshots</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {day.shots.map((s) => (
              <button
                key={s.id}
                onClick={() => onOpenShot(s.url)}
                title={`${s.name} — click to enlarge`}
                className="hov-tile"
                style={{
                  width: "100%",
                  height: 130,
                  borderRadius: 9,
                  border: `1px solid ${C.line2}`,
                  display: "flex",
                  alignItems: "flex-end",
                  padding: 8,
                  cursor: "zoom-in",
                  backgroundColor: C.field,
                  backgroundPosition: "center",
                  backgroundSize: "cover",
                  backgroundImage: cssUrl(s.url),
                }}
              />
            ))}
            <label
              className="hov-tile-text"
              style={{
                minHeight: 88,
                border: `1px dashed ${C.dash}`,
                borderRadius: 9,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontSize: 11.5,
                color: C.fainter,
              }}
            >
              Add screenshot
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  e.target.value = "";
                  const shots = await Promise.all(
                    files.map(async (f) => ({
                      name: f.name || "chart screenshot",
                      data: await readShot(f),
                    })),
                  );
                  if (shots.length) onAddShots(day, shots);
                }}
                style={{ display: "none" }}
              />
            </label>
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${C.line3}`, paddingTop: 16 }}>
          <button
            onClick={() => {
              if (!confirmDelete) return setConfirmDelete(true);
              onDelete(day);
            }}
            className="hov-danger"
            style={{
              height: 34,
              padding: "0 14px",
              border: "1px solid var(--danger-edge)",
              background: "transparent",
              color: "var(--danger-ink)",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 12.5,
            }}
          >
            {confirmDelete ? "Tap again to delete this day" : "Delete this entry"}
          </button>
        </div>
      </aside>
    </>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: `1px solid ${C.line}`,
        borderRadius: 11,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 7,
      }}
    >
      <span style={caption(9, 1.1)}>{label}</span>
      {children}
    </div>
  );
}

const metricValue: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 19,
  fontWeight: 500,
};
