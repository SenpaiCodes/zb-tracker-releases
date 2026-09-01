import { useState } from "react";
import type { AccountDTO, DayDTO } from "../lib/types";
import { agg, money, monthName } from "../lib/format";
import { dayKind } from "../lib/account";
import { isoDate, slice, weekStart, type Period } from "../lib/stats";
import { C, MONO, caption, signed } from "./ui";
import EquityChart from "./EquityChart";
import PropPanel from "./PropPanel";

type Props = {
  /** Every day on the active account, not just this month. */
  allDays: DayDTO[];
  ym: string;
  account: AccountDTO | null;
  /** Balance the current phase opened at — a passed evaluation resets it. */
  phaseStart: number;
  /** Date the phase started, when one did. Days on or before it are history. */
  phaseFrom: string | null;
  /** Dollars either side of zero that still count as breakeven. */
  breakevenBand: number;
  /** Withdrawals in the current phase; they lower equity, but are not losses. */
  payouts: { date: string; amount: number }[];
  onShiftMonth: (delta: number) => void;
  onToday: () => void;
  onSelectDay: (date: string) => void;
  onAdd: () => void;
  isEmpty: boolean;
};

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// The one button cycles what every figure on this page is measured over.
const CYCLE: { id: Period; label: string; blurb: string }[] = [
  { id: "today", label: "Today", blurb: "today" },
  { id: "week", label: "This week", blurb: "this week" },
  { id: "month", label: "This month", blurb: "this month" },
  { id: "all", label: "All time", blurb: "all time" },
];

type Cell =
  | { kind: "blank"; key: string }
  | { kind: "empty"; key: string; label: string; weekend: boolean; today: boolean }
  | {
      kind: "day";
      key: string;
      label: string;
      today: boolean;
      /** Every account's entry for this date — All time can hold several. */
      days: DayDTO[];
    };

export default function Dashboard({
  allDays,
  ym,
  account,
  phaseStart,
  phaseFrom,
  breakevenBand,
  payouts,
  onShiftMonth,
  onToday,
  onSelectDay,
  onAdd,
  isEmpty,
}: Props) {
  // Scope: Today → This week → This month → All time, and back round.
  const [period, setPeriod] = useState<Period>("month");
  const scope = CYCLE.find((c) => c.id === period) || CYCLE[2];

  const monthDays = slice(allDays, period, ym);
  const m = agg(monthDays, breakevenBand);
  const kind = (net: number) => dayKind(net, breakevenBand);
  const tone = (net: number) => {
    const k = kind(net);
    return k === "win" ? C.pos : k === "loss" ? C.neg : C.flat;
  };

  const todayIso = new Date().toISOString().slice(0, 10);
  const [y, mo] = ym.split("-").map(Number);
  const total = new Date(y, mo, 0).getDate();
  const lead = new Date(y, mo - 1, 1).getDay();

  // `allDays` arrives already scoped to the account's current phase — after a
  // pass, the evaluation's days belong to All time and nowhere else.
  const from = periodStart(period, ym);
  const before = (date: string) => (from ? date < from : false);
  const takenBefore = payouts.filter((p) => before(p.date)).reduce((a, p) => a + p.amount, 0);
  const startEquity =
    phaseStart + agg(allDays.filter((d) => before(d.date))).net - takenBefore;

  const curveDays = monthDays;
  const takenNow = payouts.filter((p) => !before(p.date));
  // The headline moves with withdrawals; the "made this month" figure doesn't.
  const curveNet = agg(curveDays).net;
  const equityNow = startEquity + curveNet - takenNow.reduce((a, p) => a + p.amount, 0);
  const sincePass = Boolean(phaseFrom && period === "month" && phaseFrom.slice(0, 7) >= ym);

  // The grid below is always a month, whatever the figures above are scoped to.
  // A date can hold more than one entry — All time and Current stack span
  // several accounts, and you can trade the same day on all of them.
  const calendarDays = allDays.filter((d) => d.date.slice(0, 7) === ym);
  const byDate = new Map<string, DayDTO[]>();
  for (const d of calendarDays) byDate.set(d.date, [...(byDate.get(d.date) || []), d]);
  const cells: Cell[] = [];
  for (let i = 0; i < lead; i++) cells.push({ kind: "blank", key: `lead-${i}` });
  for (let n = 1; n <= total; n++) {
    const key = `${ym}-${String(n).padStart(2, "0")}`;
    const onDate = byDate.get(key);
    const today = key === todayIso;
    if (onDate?.length) cells.push({ kind: "day", key, label: String(n), today, days: onDate });
    else {
      const dow = new Date(y, mo - 1, n).getDay();
      cells.push({
        kind: "empty",
        key,
        label: String(n),
        weekend: dow === 0 || dow === 6,
        today,
      });
    }
  }
  while (cells.length % 7) cells.push({ kind: "blank", key: `tail-${cells.length}` });

  const weeks: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const best = monthDays.length ? monthDays.reduce((a, b) => (b.net > a.net ? b : a)) : null;
  const worst = monthDays.length ? monthDays.reduce((a, b) => (b.net < a.net ? b : a)) : null;
  // Scaled against the biggest *day* on the grid, which is now a date's total.
  const peak = Math.max(
    1,
    ...[...byDate.values()].map((list) => Math.abs(list.reduce((a, d) => a + d.net, 0))),
  );

  // Gross win / gross loss — how many dollars won per dollar lost. A day inside
  // the breakeven band belongs to neither side.
  const gross = monthDays.reduce(
    (acc, d) => {
      const k = kind(d.net);
      if (k === "win") acc.win += d.net;
      else if (k === "loss") acc.loss += Math.abs(d.net);
      return acc;
    },
    { win: 0, loss: 0 },
  );
  const factor = gross.loss === 0 ? (gross.win > 0 ? Infinity : 0) : gross.win / gross.loss;

  const streak = currentStreak(monthDays, breakevenBand);
  const greens = monthDays.filter((d) => kind(d.net) === "win").length;
  const reds = monthDays.filter((d) => kind(d.net) === "loss").length;
  const flats = monthDays.filter((d) => kind(d.net) === "flat").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, width: "100%" }}>
      <header
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <div style={{ ...caption(10, 1.5), display: "flex", alignItems: "center", gap: 8 }}>
            {account?.name || "Journal"}
            {account?.broker ? (
              <span style={{ color: C.faintest }}>· {account.broker}</span>
            ) : null}
          </div>
          <h1 style={{ margin: 0, fontSize: 31, fontWeight: 700, letterSpacing: -0.9 }}>
            {period === "month" ? monthName(ym) : scope.label}
          </h1>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* One button, four scopes. The label always says which one you're on. */}
          <button
            onClick={() => {
              const next = CYCLE[(CYCLE.findIndex((c) => c.id === period) + 1) % CYCLE.length];
              setPeriod(next.id);
              // Today, this week and this month are all anchored to now, so the
              // calendar below follows along.
              if (next.id !== "all") onToday();
            }}
            className="hov-active"
            title="Today → This week → This month → All time"
            aria-label={`Showing ${scope.label}. Click to change.`}
            style={{ ...ghostBtn, minWidth: 104, display: "flex", alignItems: "center", gap: 7 }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path
                d="M2 6a4 4 0 0 1 6.9-2.7M10 6a4 4 0 0 1-6.9 2.7"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
              <path d="M9 1.4v2.2H6.8M3 10.6V8.4h2.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {scope.label}
          </button>
          <button
            onClick={() => {
              setPeriod("month");
              onShiftMonth(-1);
            }}
            aria-label="Previous month"
            className="hov-active"
            style={arrowStyle}
          >
            ←
          </button>
          <button
            onClick={() => {
              setPeriod("month");
              onShiftMonth(1);
            }}
            aria-label="Next month"
            className="hov-active"
            style={arrowStyle}
          >
            →
          </button>
          <button onClick={onAdd} className="hov-solid" style={primaryBtn}>
            Log a day
          </button>
        </div>
      </header>

      {isEmpty ? (
        <div
          className="card"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
            border: `1px dashed ${C.dash}`,
            borderRadius: 12,
            padding: "18px 20px",
            animation: "riseIn 240ms ease both",
          }}
        >
          <span style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 14, color: C.text }}>Nothing logged yet</span>
            <span style={{ fontSize: 12.5, color: C.faint }}>
              Drop a P&amp;L screenshot and the day fills itself in. Everything else follows from
              there.
            </span>
          </span>
          <button onClick={onAdd} className="hov-raised" style={outlineBtn}>
            Log your first day
          </button>
        </div>
      ) : null}

      {/* --- equity curve + the headline figures ----------------------------- */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(220px, 300px)",
          gap: 16,
          alignItems: "stretch",
        }}
      >
        <div className="card" style={{ borderRadius: 14, padding: "16px 18px 10px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 16,
              marginBottom: 4,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={caption()}>Account equity</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 27,
                    fontWeight: 500,
                    letterSpacing: -0.8,
                  }}
                >
                  {signed(equityNow)}
                </span>
                {/* Status colour is never alone: the arrow and sign carry it too. */}
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 13,
                    color: tone(curveNet),
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {curveNet >= 0 ? "▲" : "▼"} {money(curveNet)}
                </span>
                <span style={{ fontSize: 11.5, color: C.faintest }}>
                  {sincePass ? "since passing" : scope.blurb}
                </span>
              </div>
            </div>
            {streak.count > 1 ? (
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  color: streak.green ? C.pos : C.neg,
                  border: `1px solid ${streak.green ? C.posEdge : C.negEdge}`,
                  background: streak.green ? C.posSoft : C.negSoft,
                  borderRadius: 999,
                  padding: "4px 10px",
                  whiteSpace: "nowrap",
                }}
              >
                {streak.count} {streak.green ? "green" : "red"} in a row
              </span>
            ) : null}
          </div>

          <EquityChart
            days={curveDays}
            startEquity={startEquity}
            breakevenBand={breakevenBand}
            deductions={takenNow}
            emptyLabel={
              sincePass ? "Nothing logged since the account passed" : undefined
            }
          />
        </div>

        {/* A vertical rail of the numbers that don't fit on the curve. */}
        <div
          className="card"
          style={{
            borderRadius: 14,
            padding: 18,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: 14,
          }}
        >
          <Rail label="Win rate" value={`${m.wr}%`}>
            <div
              style={{
                height: 5,
                borderRadius: 3,
                background: C.line2,
                overflow: "hidden",
                display: "flex",
              }}
            >
              <div style={{ width: `${m.wr}%`, background: C.pos }} />
              <div style={{ flex: 1, background: C.negSoft }} />
            </div>
            <span style={{ fontSize: 11, color: C.faintest }}>
              {m.byDay
                ? `${m.greenDays}W · ${m.redDays}L across ${m.days} ${m.days === 1 ? "day" : "days"}`
                : `${m.wins}W · ${m.losses}L across ${m.trades} trades`}
            </span>
          </Rail>

          <Rail label="Profit factor" value={factor === Infinity ? "∞" : factor.toFixed(2)}>
            <span style={{ fontSize: 11, color: C.faintest }}>
              {money(gross.win)} won · {money(-gross.loss)} lost
            </span>
          </Rail>

          <Rail label="Green / red days" value={`${greens} / ${reds}`} split>
            <span style={{ fontSize: 11, color: C.faintest }}>
              {m.days} {m.days === 1 ? "day" : "days"} · {m.contracts} contracts
              {flats ? (
                <>
                  {" · "}
                  <span style={{ color: C.flat }}>{flats} flat</span>
                </>
              ) : null}
            </span>
          </Rail>
        </div>
      </section>

      {account ? (
        <PropPanel account={account} allDays={allDays} breakevenBand={breakevenBand} />
      ) : null}

      {/* --- the month, in tiles --------------------------------------------- */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
        }}
      >
        <Stat label="Net P&L" value={money(m.net)} tone={tone(m.net)}>
          {m.days} trading {m.days === 1 ? "day" : "days"}
        </Stat>
        <Stat
          label="Average day"
          value={m.days ? money(Math.round(m.net / m.days)) : "—"}
          tone={tone(m.days ? m.net : 0)}
        >
          per session {scope.blurb}
        </Stat>
        <Stat
          label="Best day"
          value={best ? money(best.net) : "—"}
          tone={best ? tone(best.net) : undefined}
        >
          {best ? dayLabel(best.date) : "nothing logged"}
        </Stat>
        <Stat
          label="Worst day"
          value={worst ? money(worst.net) : "—"}
          tone={worst ? tone(worst.net) : undefined}
        >
          {worst ? dayLabel(worst.date) : "nothing logged"}
        </Stat>
        <Stat label="Contracts" value={String(m.contracts)}>
          {m.trades} {m.trades === 1 ? "trade" : "trades"} logged
        </Stat>
      </section>

      <section className="card" style={{ borderRadius: 14, padding: "18px 20px 20px" }}>
        {period !== "month" ? (
          <div
            style={{
              ...caption(9.5, 1.2),
              color: C.fainter,
              paddingBottom: 12,
              borderBottom: `1px solid ${C.line3}`,
              marginBottom: 12,
            }}
          >
            Calendar · {monthName(ym)}
          </div>
        ) : null}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(0, 1fr)) 104px",
            gap: 8,
            marginBottom: 10,
          }}
        >
          {DOW.map((d) => (
            <div
              key={d}
              style={{
                ...caption(9.5, 1.2),
                color: C.fainter,
                textAlign: "center",
                paddingBottom: 2,
              }}
            >
              {d}
            </div>
          ))}
          <div style={{ ...caption(9.5, 1.2), color: C.fainter, textAlign: "right" }}>Week</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {weeks.map((week, wi) => {
            const wd = week.flatMap((c) => (c.kind === "day" ? c.days : []));
            const wa = agg(wd);
            return (
              <div
                key={wi}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, minmax(0, 1fr)) 104px",
                  gap: 8,
                }}
              >
                {week.map((cell) => (
                  <DayCell
                    key={cell.key}
                    cell={cell}
                    peak={peak}
                    band={breakevenBand}
                    onSelect={onSelectDay}
                  />
                ))}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    justifyContent: "center",
                    gap: 4,
                    paddingRight: 2,
                  }}
                >
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 12.5,
                      color: wd.length ? tone(wa.net) : C.faintest,
                    }}
                  >
                    {wd.length ? money(wa.net) : "—"}
                  </span>
                  <span style={{ fontSize: 10, color: C.faintest }}>
                    {wd.length ? `${wd.length}d` : ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/** First date included in a scope, or null for all time. */
function periodStart(period: Period, ym: string): string | null {
  switch (period) {
    case "today":
      return isoDate(new Date());
    case "week":
      return weekStart();
    case "month":
      return `${ym}-01`;
    default:
      return null;
  }
}

function DayCell({
  cell,
  peak,
  band,
  onSelect,
}: {
  cell: Cell;
  peak: number;
  band: number;
  onSelect: (d: string) => void;
}) {
  if (cell.kind === "blank") return <div style={{ minHeight: 96 }} />;

  const base: React.CSSProperties = {
    position: "relative",
    minHeight: 96,
    textAlign: "left",
    padding: "9px 10px",
    borderRadius: 10,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    overflow: "hidden",
  };

  if (cell.kind === "empty") {
    return (
      <div
        style={{
          ...base,
          // Weekends stay recessive but must still read as cells, or the grid
          // loses its columns on Sat/Sun.
          background: cell.weekend ? "transparent" : C.field,
          border: `1px solid ${cell.today ? C.edge : cell.weekend ? C.line3 : C.line}`,
          cursor: "default",
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 11,
            color: cell.today ? C.mute : cell.weekend ? C.faintest : C.fainter,
            fontWeight: cell.today ? 700 : 400,
          }}
        >
          {cell.label}
        </span>
      </div>
    );
  }

  // Three states, not two: a day that closed flat is neither a win nor a loss,
  // so it gets its own neutral tone instead of reading as red. "Flat" is a band,
  // not a point — fees alone can leave a scratched session a few dollars down.
  const net = cell.days.reduce((a, d) => a + d.net, 0);
  const wins = cell.days.reduce((a, d) => a + d.wins, 0);
  const losses = cell.days.reduce((a, d) => a + d.losses, 0);
  const shots = cell.days.reduce((a, d) => a + d.shots.length, 0);
  const k = dayKind(net, band);
  const tone = k === "win" ? C.pos : k === "loss" ? C.neg : C.flat;
  const soft = k === "win" ? C.posSoft : k === "loss" ? C.negSoft : C.flatSoft;
  const edge = k === "win" ? C.posEdge : k === "loss" ? C.negEdge : C.flatEdge;
  // A magnitude bar, so a $40 day and a $900 day don't look identical.
  const weight = Math.min(1, Math.abs(net) / peak);

  return (
    <button
      onClick={() => onSelect(cell.days[0].date)}
      className="day-cell"
      title={
        cell.days.length > 1
          ? `${dayLabel(cell.days[0].date)} · ${money(net)} across ${cell.days.length} accounts`
          : `${dayLabel(cell.days[0].date)} · ${money(net)}`
      }
      style={{
        ...base,
        cursor: "pointer",
        background: `linear-gradient(180deg, ${soft} 0%, transparent 120%)`,
        border: `1px solid ${edge}`,
        boxShadow: cell.today ? `inset 0 0 0 1px ${C.edge}` : undefined,
      }}
    >
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 11,
            color: C.mute,
            fontWeight: cell.today ? 700 : 400,
          }}
        >
          {cell.label}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {/* More than one account traded this date. */}
          {cell.days.length > 1 ? (
            <span
              title={`${cell.days.length} accounts`}
              style={{
                fontFamily: MONO,
                fontSize: 9,
                lineHeight: 1,
                color: C.mute,
                border: `1px solid ${C.line2}`,
                borderRadius: 4,
                padding: "2px 4px",
              }}
            >
              ×{cell.days.length}
            </span>
          ) : null}
          {shots ? (
            <span
              title={`${shots} screenshot${shots === 1 ? "" : "s"}`}
              style={{ width: 5, height: 5, borderRadius: "50%", background: C.faintest }}
            />
          ) : null}
        </span>
      </span>

      <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 14.5,
            fontWeight: 500,
            letterSpacing: -0.3,
            color: tone,
          }}
        >
          {money(net)}
        </span>
        <span style={{ fontSize: 10.5, color: C.faint }}>
          {wins + losses > 0
            ? `${wins}W · ${losses}L`
            : cell.days.length > 1
              ? `${cell.days.length} accounts`
              : k === "win"
                ? "Green day"
                : k === "loss"
                  ? "Red day"
                  : "Flat"}
        </span>
        <span style={{ height: 2, borderRadius: 2, background: C.line2, overflow: "hidden" }}>
          <span
            style={{
              display: "block",
              height: "100%",
              width: `${Math.max(8, weight * 100)}%`,
              background: tone,
              opacity: 0.85,
            }}
          />
        </span>
      </span>
    </button>
  );
}

function Stat({
  label,
  value,
  tone,
  children,
}: {
  label: string;
  value: string;
  tone?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="tile"
      style={{
        borderRadius: 12,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 9,
      }}
    >
      <div style={caption()}>{label}</div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 24,
          fontWeight: 500,
          letterSpacing: -0.8,
          color: tone,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11.5, color: C.faint }}>{children}</div>
    </div>
  );
}

function Rail({
  label,
  value,
  split,
  children,
}: {
  label: string;
  value: string;
  split?: boolean;
  children: React.ReactNode;
}) {
  const [a, b] = split ? value.split(" / ") : [value, null];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={caption()}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 21, fontWeight: 500, letterSpacing: -0.6 }}>
        {split ? (
          <>
            <span style={{ color: C.pos }}>{a}</span>
            <span style={{ color: C.faintest }}> / </span>
            <span style={{ color: C.neg }}>{b}</span>
          </>
        ) : (
          a
        )}
      </div>
      {children}
    </div>
  );
}

function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Consecutive green or red days, counting back from the most recent. */
function currentStreak(days: DayDTO[], band: number): { count: number; green: boolean } {
  const sorted = [...days].sort((a, b) => b.date.localeCompare(a.date));
  if (!sorted.length) return { count: 0, green: true };
  const first = dayKind(sorted[0].net, band);
  if (first === "flat") return { count: 0, green: true };
  let count = 0;
  for (const d of sorted) {
    if (dayKind(d.net, band) !== first) break;
    count++;
  }
  return { count, green: first === "win" };
}

const arrowStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  border: `1px solid ${C.line2}`,
  background: C.raised,
  color: C.dim,
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 14,
};

const ghostBtn: React.CSSProperties = {
  height: 34,
  padding: "0 13px",
  border: `1px solid ${C.line2}`,
  background: C.raised,
  color: C.dim,
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 12.5,
};

const primaryBtn: React.CSSProperties = {
  height: 34,
  padding: "0 16px",
  border: "none",
  background: C.text,
  color: C.bg,
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  marginLeft: 6,
};

const outlineBtn: React.CSSProperties = {
  height: 34,
  padding: "0 16px",
  border: `1px solid ${C.edge}`,
  background: "transparent",
  color: C.text,
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  whiteSpace: "nowrap",
};
