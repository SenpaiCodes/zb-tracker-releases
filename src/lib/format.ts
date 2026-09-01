// Shared formatting — imported by both server and client code.

export const POS = "var(--pos)";
export const NEG = "var(--neg)";
export const NEUTRAL = "var(--mute)";

export function money(n: number): string {
  const s = Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return (n > 0 ? "+$" : n < 0 ? "-$" : "$") + s;
}

export function colorFor(n: number): string {
  return n > 0 ? POS : n < 0 ? NEG : NEUTRAL;
}

export function monthName(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function todayYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function shiftYm(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export type DayLike = {
  net: number;
  wins: number;
  losses: number;
  contracts: number;
};

export type Agg = {
  net: number;
  wins: number;
  losses: number;
  contracts: number;
  trades: number;
  days: number;
  wr: number;
  /** True when `wr` counts days because no trades were recorded. */
  byDay: boolean;
  greenDays: number;
  redDays: number;
};

/**
 * Win rate is over trades when you have recorded them, and over *days* when you
 * haven't. Most days get logged as a date and a net figure with the win/loss
 * boxes left empty, and a permanent 0% would be worse than useless — so with no
 * trade record the day itself is the unit.
 */
export function agg(list: DayLike[], breakevenBand = 0): Agg {
  const net = list.reduce((a, d) => a + d.net, 0);
  const wins = list.reduce((a, d) => a + d.wins, 0);
  const losses = list.reduce((a, d) => a + d.losses, 0);
  const contracts = list.reduce((a, d) => a + d.contracts, 0);
  const trades = wins + losses;

  const greenDays = list.filter((d) => d.net > breakevenBand).length;
  const redDays = list.filter((d) => d.net < -breakevenBand).length;

  return {
    net,
    wins,
    losses,
    contracts,
    trades,
    days: list.length,
    /** True when the rate below counts days rather than trades. */
    byDay: trades === 0,
    wr: trades
      ? Math.round((wins / trades) * 100)
      : greenDays + redDays
        ? Math.round((greenDays / (greenDays + redDays)) * 100)
        : 0,
    greenDays,
    redDays,
  };
}
