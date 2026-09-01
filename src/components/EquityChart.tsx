import { useEffect, useMemo, useRef, useState } from "react";
import type { DayDTO } from "../lib/types";
import { money } from "../lib/format";
import { dayKind } from "../lib/account";
import { C, MONO } from "./ui";

// Running account equity across the month on view.
//
// One series, so no legend — the header names it. Green/red here is a *status*
// encoding (up or down on the month), and status must never be colour alone, so
// the header always prints the signed figure and a direction arrow beside it.
// The calendar grid below this chart is its table view: every plotted day's P&L
// is readable there without hovering anything.

type Props = {
  /** Days in the month on view, any order. */
  days: DayDTO[];
  /** Account equity entering the month — where the curve starts. */
  startEquity: number;
  /** Dollars either side of zero that still count as a breakeven day. */
  breakevenBand?: number;
  /** Money withdrawn during the period — it steps the curve down on its date. */
  deductions?: { date: string; amount: number }[];
  /** Shown when there is nothing to plot. */
  emptyLabel?: string;
  height?: number;
};

type Point = { x: number; y: number; equity: number; net: number; date: string | null };

const PAD = { top: 14, right: 18, bottom: 24, left: 64 };

export default function EquityChart({
  days,
  startEquity,
  breakevenBand = 0,
  deductions = [],
  emptyLabel = "No days logged this month yet",
  height = 208,
}: Props) {
  // A day inside the band is flat, not a loss, so its marker is neutral.
  const tone = (net: number) => {
    const k = dayKind(net, breakevenBand);
    return k === "win" ? C.pos : k === "loss" ? C.neg : C.flat;
  };
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  // The card is fluid, so the plot is measured rather than assumed.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const series = useMemo(() => {
    // A payout is money leaving the account, so the line steps down on the day
    // it was taken. It is not P&L, though, so the day's own figure is unmoved.
    const taken = new Map<string, number>();
    for (const p of deductions) taken.set(p.date, (taken.get(p.date) || 0) + p.amount);

    const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
    let running = startEquity;
    const out = [{ equity: startEquity, net: 0, date: null as string | null }];
    for (const d of sorted) {
      running += d.net - (taken.get(d.date) || 0);
      taken.delete(d.date);
      out.push({ equity: running, net: d.net, date: d.date });
    }
    // Anything withdrawn on a day with no session still has to show up.
    for (const [date, amount] of [...taken].sort((a, b) => a[0].localeCompare(b[0]))) {
      running -= amount;
      out.push({ equity: running, net: 0, date });
    }
    return out;
  }, [days, startEquity, deductions]);

  const net = series[series.length - 1].equity - startEquity;
  const up = net >= 0;
  const stroke = up ? C.pos : C.neg;
  const hasData = series.length > 1;

  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;

  const { points, ticks, lo, hi } = useMemo(() => {
    const values = series.map((p) => p.equity);
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) {
      // A flat line still needs a band, or it sits on the axis.
      const pad = Math.max(50, Math.abs(min) * 0.02);
      min -= pad;
      max += pad;
    } else {
      const pad = (max - min) * 0.14;
      min -= pad;
      max += pad;
    }

    const step = niceStep((max - min) / 3);
    const first = Math.ceil(min / step) * step;
    const t: number[] = [];
    for (let v = first; v <= max && t.length < 6; v += step) t.push(v);

    const toY = (v: number) => PAD.top + plotH - ((v - min) / (max - min)) * plotH;
    const toX = (i: number) =>
      PAD.left + (series.length === 1 ? plotW / 2 : (i / (series.length - 1)) * plotW);

    return {
      lo: min,
      hi: max,
      ticks: t.map((v) => ({ v, y: toY(v) })),
      points: series.map((p, i) => ({ ...p, x: toX(i), y: toY(p.equity) })) as Point[],
    };
  }, [series, plotW, plotH]);

  if (width === 0) {
    return <div ref={wrap} style={{ height, width: "100%" }} />;
  }

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaBase = PAD.top + plotH;
  const area = `${line} L${points[points.length - 1].x.toFixed(1)},${areaBase} L${points[0].x.toFixed(1)},${areaBase} Z`;
  const baselineY = PAD.top + plotH - ((startEquity - lo) / (hi - lo)) * plotH;

  const last = points[points.length - 1];
  const shown = active !== null ? points[active] : null;

  const pick = (clientX: number) => {
    const box = wrap.current?.getBoundingClientRect();
    if (!box || points.length < 2) return;
    const x = clientX - box.left;
    let best = 0;
    let bestD = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(p.x - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setActive(best);
  };

  return (
    <div ref={wrap} style={{ position: "relative", width: "100%" }}>
      <svg
        className="chart-svg chart-hit"
        width={width}
        height={height}
        role="img"
        aria-label={`Account equity through the month, ${up ? "up" : "down"} ${money(net)}. Each day's figure is also listed in the calendar below.`}
        tabIndex={hasData ? 0 : -1}
        onMouseMove={(e) => pick(e.clientX)}
        onMouseLeave={() => setActive(null)}
        onFocus={() => hasData && setActive(points.length - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (!hasData) return;
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            setActive((a) => {
              const cur = a ?? points.length - 1;
              return Math.min(points.length - 1, Math.max(0, cur + (e.key === "ArrowLeft" ? -1 : 1)));
            });
          }
          if (e.key === "Escape") setActive(null);
        }}
        style={{ display: "block", borderRadius: 12, outlineOffset: -2 }}
      >
        <defs>
          <linearGradient id="eq-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: stroke, stopOpacity: 0.26 }} />
            <stop offset="100%" style={{ stopColor: stroke, stopOpacity: 0 }} />
          </linearGradient>
          {/* The neon: a blurred copy of the stroke sitting under the crisp one. */}
          <filter id="eq-glow" x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Hairline grid, solid and one shade off the surface. */}
        {ticks.map((t) => (
          <g key={t.v}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={t.y}
              y2={t.y}
              style={{ stroke: C.line }}
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
            <text
              x={PAD.left - 10}
              y={t.y + 3.5}
              textAnchor="end"
              style={{ fill: C.faintest, fontSize: 9.5, fontVariantNumeric: "tabular-nums" }}
            >
              {compact(t.v)}
            </text>
          </g>
        ))}

        {/* Where the month opened, so the dips read against something. */}
        <line
          x1={PAD.left}
          x2={width - PAD.right}
          y1={baselineY}
          y2={baselineY}
          style={{ stroke: C.edge }}
          strokeWidth={1}
          shapeRendering="crispEdges"
        />

        {hasData ? (
          <>
            <path d={area} fill="url(#eq-fill)" />
            <path
              // Keyed on the data so the draw-in replays when the month changes,
              // but not on every hover.
              key={`${points.length}-${startEquity}`}
              d={line}
              fill="none"
              pathLength={1}
              style={{
                stroke,
                strokeDasharray: 1,
                animation: "drawEquity 700ms cubic-bezier(0.22, 1, 0.36, 1) both",
              }}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#eq-glow)"
            />
            {points.slice(1).map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={active === i + 1 ? 4.5 : 2.5}
                style={{ fill: tone(p.net) }}
                stroke="var(--panel)"
                strokeWidth={active === i + 1 ? 2 : 0}
              />
            ))}

            {/* Only the endpoint is labelled; the rest live in the calendar. */}
            {active === null ? (
              <text
                x={Math.min(last.x + 8, width - PAD.right)}
                y={Math.max(PAD.top + 9, last.y - 10)}
                textAnchor="end"
                style={{ fill: stroke, fontSize: 11, fontWeight: 600 }}
              >
                {money(last.equity)}
              </text>
            ) : null}
          </>
        ) : (
          <text
            x={PAD.left + plotW / 2}
            y={PAD.top + plotH / 2}
            textAnchor="middle"
            style={{ fill: C.fainter, fontSize: 11.5 }}
          >
            {emptyLabel}
          </text>
        )}

        {shown ? (
          <line
            x1={shown.x}
            x2={shown.x}
            y1={PAD.top}
            y2={PAD.top + plotH}
            style={{ stroke: C.edge }}
            strokeWidth={1}
            shapeRendering="crispEdges"
          />
        ) : null}
      </svg>

      {shown ? (
        <div
          style={{
            position: "absolute",
            left: Math.max(8, Math.min(shown.x - 74, width - 156)),
            top: Math.max(4, shown.y - 66),
            width: 148,
            pointerEvents: "none",
            background: C.panel,
            border: `1px solid ${C.line2}`,
            borderRadius: 9,
            padding: "9px 11px",
            boxShadow: "var(--shadow-card)",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 1, color: C.faint }}>
            {shown.date
              ? new Date(`${shown.date}T12:00:00`)
                  .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                  .toUpperCase()
              : "MONTH START"}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 500 }}>
            {money(shown.equity)}
          </span>
          {shown.date ? (
            <span
              style={{
                fontFamily: MONO,
                fontSize: 11,
                color: tone(shown.net),
              }}
            >
              {shown.net >= 0 ? "▲" : "▼"} {money(shown.net)} on the day
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Rounds a raw step up to something a person would choose. */
function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

/** Axis labels stay short: 12,400 -> 12.4k. */
function compact(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 10_000) return `${sign}$${Math.round(a / 1000)}k`;
  if (a >= 1_000) return `${sign}$${(a / 1000).toFixed(1)}k`;
  return `${sign}$${Math.round(a)}`;
}
