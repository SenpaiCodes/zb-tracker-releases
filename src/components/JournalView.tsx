import type { DayDTO } from "../lib/types";
import { agg, colorFor, money, monthName } from "../lib/format";
import { dayKind } from "../lib/account";
import { C, MONO, caption } from "./ui";

type Props = {
  days: DayDTO[];
  /** Resolves a day's account to a name — including retired ones. */
  accountFor: (accountId: string) => string;
  /** True when several accounts are in view and the column earns its place. */
  showAccount: boolean;
  ym: string;
  /** Dollars either side of zero that still count as a breakeven day. */
  breakevenBand: number;
  openMonths: Record<string, boolean>;
  onToggleMonth: (key: string) => void;
  onPickMonth: (key: string) => void;
  onSelectDay: (date: string) => void;
  onAdd: () => void;
};

export default function JournalView({
  days,
  accountFor,
  showAccount,
  ym,
  breakevenBand,
  openMonths,
  onToggleMonth,
  onPickMonth,
  onSelectDay,
  onAdd,
}: Props) {
  // A day inside the breakeven band is neither green nor red.
  const tone = (net: number) => {
    const k = dayKind(net, breakevenBand);
    return k === "win" ? C.pos : k === "loss" ? C.neg : C.flat;
  };
  const monthKeys = Array.from(new Set(days.map((d) => d.date.slice(0, 7)))).sort().reverse();
  const chipKeys = monthKeys.length ? monthKeys.slice(0, 4) : [ym];

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
          <div style={caption(10, 1.5)}>All entries</div>
          <h1 style={{ margin: 0, fontSize: 31, fontWeight: 700, letterSpacing: -0.9 }}>Journal</h1>
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
          {chipKeys.map((k) => {
            const on = ym === k;
            return (
              <button
                key={k}
                onClick={() => onPickMonth(k)}
                className="hov-active"
                style={{
                  border: "none",
                  borderRadius: 6,
                  padding: "7px 12px",
                  fontSize: 12,
                  cursor: "pointer",
                  background: on ? C.active : "transparent",
                  color: on ? C.text : C.mute,
                }}
              >
                {new Date(`${k}-15T12:00:00`).toLocaleDateString("en-US", {
                  month: "short",
                  year: "numeric",
                })}
              </button>
            );
          })}
        </div>
      </header>

      {days.length === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
            border: `1px dashed ${C.dash}`,
            borderRadius: 14,
            padding: "58px 30px",
            background: C.drawer,
            textAlign: "center",
          }}
        >
          <span style={{ fontSize: 15, color: C.text }}>No entries yet</span>
          <span style={{ fontSize: 12.5, color: C.faint, maxWidth: 340, lineHeight: 1.7 }}>
            Saved days group themselves under the month they belong to. Log one and this fills in.
          </span>
          <button
            onClick={onAdd}
            className="hov-raised"
            style={{
              height: 34,
              padding: "0 16px",
              border: "1px solid var(--edge)",
              background: "transparent",
              color: C.text,
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            New entry
          </button>
        </div>
      ) : null}

      {monthKeys.map((key) => {
        const list = days
          .filter((d) => d.date.slice(0, 7) === key)
          .slice()
          .sort((a, b) => b.date.localeCompare(a.date));
        const a = agg(list);
        const open = !!openMonths[key];

        return (
          <section key={key} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <button
              onClick={() => onToggleMonth(key)}
              className="hov-raised"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                width: "100%",
                textAlign: "left",
                background: C.panel,
                border: `1px solid ${C.line}`,
                borderRadius: 11,
                padding: "14px 18px",
                cursor: "pointer",
                marginBottom: 8,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  style={{
                    fontSize: 11,
                    color: C.fainter,
                    width: 10,
                    display: "inline-block",
                  }}
                >
                  {open ? "–" : "+"}
                </span>
                <span style={{ fontSize: 16.5, fontWeight: 600, color: C.text }}>
                  {monthName(key)}
                </span>
                <span style={{ fontSize: 11.5, color: C.faint }}>
                  {a.days} {a.days === 1 ? "day" : "days"} · {a.trades}{" "}
                  {a.trades === 1 ? "trade" : "trades"}
                </span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <span style={{ fontSize: 11.5, color: C.faint }}>{a.wr}% win rate</span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 16,
                    fontWeight: 500,
                    color: colorFor(a.net),
                  }}
                >
                  {money(a.net)}
                </span>
              </span>
            </button>

            {open ? (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 14 }}
              >
                {list.map((d) => {
                  const dt = new Date(`${d.date}T12:00:00`);
                  return (
                    <button
                      key={d.id}
                      onClick={() => onSelectDay(d.date)}
                      className="hov-row"
                      style={{
                        display: "grid",
                        gridTemplateColumns: showAccount
                          ? "118px 88px 116px minmax(0, 1fr) 104px minmax(90px, 140px)"
                          : "132px 88px minmax(0, 1fr) 110px minmax(90px, 150px)",
                        alignItems: "center",
                        gap: 16,
                        width: "100%",
                        textAlign: "left",
                        background: "transparent",
                        border: `1px solid ${C.line3}`,
                        borderRadius: 10,
                        padding: "13px 18px",
                        cursor: "pointer",
                      }}
                    >
                      <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <span style={{ fontSize: 13, color: C.text }}>
                          {dt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                        <span style={{ fontFamily: MONO, fontSize: 10, color: C.fainter }}>
                          {dt.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase()}
                        </span>
                      </span>
                      <span style={{ fontFamily: MONO, fontSize: 14, color: tone(d.net) }}>
                        {money(d.net)}
                      </span>
                      {showAccount ? (
                        <span
                          title={accountFor(d.accountId)}
                          style={{
                            fontSize: 11,
                            color: C.mute2,
                            border: `1px solid ${C.line2}`,
                            borderRadius: 999,
                            padding: "3px 9px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            justifySelf: "start",
                            maxWidth: "100%",
                          }}
                        >
                          {accountFor(d.accountId)}
                        </span>
                      ) : null}
                      <span
                        style={{
                          fontSize: 12.5,
                          color: C.mute2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {d.note || "No note yet"}
                      </span>
                      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span
                          style={{
                            fontFamily: MONO,
                            fontSize: 10.5,
                            color: C.faint,
                            border: `1px solid ${C.line2}`,
                            borderRadius: 5,
                            padding: "3px 6px",
                          }}
                        >
                          {d.shots.length} shots
                        </span>
                        <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.faint }}>
                          {d.wins}W/{d.losses}L
                        </span>
                      </span>
                      <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        {d.tags.slice(0, 1).map((t) => (
                          <span
                            key={t}
                            style={{
                              fontSize: 10.5,
                              color: C.mute,
                              background: "var(--raised)",
                              borderRadius: 5,
                              padding: "3px 8px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {t}
                          </span>
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
