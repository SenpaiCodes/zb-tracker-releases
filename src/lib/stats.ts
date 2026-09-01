import type { AccountDTO, DayDTO, Journal } from "./types";
import { dayKind } from "./account";
import { CUSTOM_RULES } from "./propfirms";

// Period slicing for the dashboard, and the synthetic "All time" account that
// spans every real one.

export const ALL_TIME_ID = "__all__";
export const STACK_ID = "__stack__";

export type Period = "today" | "week" | "month" | "all";

export const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "all", label: "All time" },
];

/** Local-date ISO string; `toISOString` would shift by the UTC offset. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Monday-based week start, matching how a trading week is usually counted. */
export function weekStart(now = new Date()): string {
  const d = new Date(now);
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return isoDate(d);
}

export function slice(days: DayDTO[], period: Period, ym: string): DayDTO[] {
  const today = isoDate(new Date());
  switch (period) {
    case "today":
      return days.filter((d) => d.date === today);
    case "week": {
      const from = weekStart();
      return days.filter((d) => d.date >= from && d.date <= today);
    }
    case "month":
      return days.filter((d) => d.date.slice(0, 7) === ym);
    case "all":
    default:
      return days;
  }
}

export type Summary = {
  net: number;
  days: number;
  wins: number;
  losses: number;
  flats: number;
  trades: number;
  contracts: number;
  shots: number;
  /** Win rate over trades, which is what a trader means by the term. */
  winRate: number;
  grossWin: number;
  grossLoss: number;
  factor: number;
  best: DayDTO | null;
  worst: DayDTO | null;
};

export function summarize(days: DayDTO[], breakevenBand: number): Summary {
  let net = 0;
  let wins = 0;
  let losses = 0;
  let flats = 0;
  let tradeWins = 0;
  let tradeLosses = 0;
  let contracts = 0;
  let shots = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let best: DayDTO | null = null;
  let worst: DayDTO | null = null;

  for (const d of days) {
    net += d.net;
    contracts += d.contracts;
    shots += d.shots.length;
    tradeWins += d.wins;
    tradeLosses += d.losses;

    const kind = dayKind(d.net, breakevenBand);
    if (kind === "win") {
      wins++;
      grossWin += d.net;
    } else if (kind === "loss") {
      losses++;
      grossLoss += Math.abs(d.net);
    } else {
      flats++;
    }

    if (!best || d.net > best.net) best = d;
    if (!worst || d.net < worst.net) worst = d;
  }

  const trades = tradeWins + tradeLosses;
  return {
    net,
    days: days.length,
    wins,
    losses,
    flats,
    trades,
    contracts,
    shots,
    winRate: trades ? Math.round((tradeWins / trades) * 100) : 0,
    grossWin,
    grossLoss,
    factor: grossLoss === 0 ? (grossWin > 0 ? Infinity : 0) : grossWin / grossLoss,
    best,
    worst,
  };
}

/** The accounts you are still trading: not blown, not retired. */
export function liveAccounts(journal: Journal): AccountDTO[] {
  return journal.accounts.filter((a) => !a.archived && a.phase !== "blown");
}

/** Accounts offered in the switcher — retired ones are hidden. */
export function pickableAccounts(journal: Journal): AccountDTO[] {
  return journal.accounts.filter((a) => !a.archived);
}

function virtual(id: string, name: string, broker: string, start: number): AccountDTO {
  return {
    id,
    name,
    broker,
    start,
    firm: null,
    plan: null,
    size: null,
    phase: "funded",
    rules: { ...CUSTOM_RULES },
    passedOn: null,
    blownOn: null,
    createdAt: null,
    archived: false,
    payouts: [],
  };
}

/**
 * The permanent "All time" account. It owns no days of its own — it stands in
 * for every account that has ever existed, retired and blown ones included, so
 * nothing you have logged can ever fall out of your record.
 */
export function allTimeAccount(journal: Journal): AccountDTO {
  const n = journal.accounts.length;
  return virtual(
    ALL_TIME_ID,
    "All time",
    `${n} account${n === 1 ? "" : "s"}`,
    journal.accounts.reduce((a, acc) => a + (acc.start || 0), 0),
  );
}

/** "Current stack": everything you are still trading, blown accounts excluded. */
export function stackAccount(journal: Journal): AccountDTO {
  const live = liveAccounts(journal);
  return virtual(
    STACK_ID,
    "Current stack",
    `${live.length} live account${live.length === 1 ? "" : "s"}`,
    live.reduce((a, acc) => a + (acc.size || acc.start || 0), 0),
  );
}

export function isAllTime(id: string | null | undefined): boolean {
  return id === ALL_TIME_ID;
}

export function isStack(id: string | null | undefined): boolean {
  return id === STACK_ID;
}

/** True for the two views that stand in for several accounts at once. */
export function isVirtual(id: string | null | undefined): boolean {
  return isAllTime(id) || isStack(id);
}

/** Days for whichever account is selected, including the synthetic ones. */
export function daysForAccount(journal: Journal, accountId: string | null): DayDTO[] {
  if (isAllTime(accountId)) return journal.days;
  if (isStack(accountId)) {
    const live = new Set(liveAccounts(journal).map((a) => a.id));
    return journal.days.filter((d) => live.has(d.accountId));
  }
  return journal.days.filter((d) => d.accountId === accountId);
}

/** Account name for a day, for the journal list. Retired accounts still resolve. */
export function accountName(journal: Journal, accountId: string): string {
  return journal.accounts.find((a) => a.id === accountId)?.name || "Removed account";
}
