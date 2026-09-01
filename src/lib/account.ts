import type { AccountDTO, DayDTO } from "./types";
import type { AccountRules, PayoutRules } from "./propfirms";

// Kept local and type-only: Vite resolves an extensionless value import from
// here, but `node --test` does not, and the parser tests import this module
// directly. A default for accounts with no payout policy at all.
const NO_PAYOUT: PayoutRules = {
  minWinDays: 0,
  minWinDay: 0,
  buffer: 0,
  minPayout: 0,
  maxPayout: 0,
  maxPayoutPct: 0,
  maxProfitPct: 0,
  split: 100,
};

// Everything derived about an account: how the evaluation is going, where the
// drawdown floor currently sits, and whether the consistency rule is satisfied.
//
// All of it is computed from the logged days rather than stored, so correcting a
// day's P&L immediately corrects the status too.

export type Phase = "eval" | "funded" | "passed" | "blown";

export type DayKind = "win" | "loss" | "flat";

/**
 * Which phase a session belongs to.
 *
 * New entries carry the stamp they were saved with, which is what lets you
 * clear an evaluation and then trade the funded account the same afternoon —
 * both sessions are on the same date and only one of them is funded.
 *
 * Entries logged before the stamp existed fall back to the date: on or before
 * the pass is evaluation, after it is funded.
 */
export function dayPhase(day: DayDTO, account: AccountDTO): Phase {
  if (day.phase) return day.phase;
  if (!account.passedOn) return account.phase;
  return day.date <= account.passedOn ? "eval" : "funded";
}

/** The sessions that count toward an account's current phase. */
export function phaseDaysOf(account: AccountDTO, days: DayDTO[]): DayDTO[] {
  return days
    .filter((d) => d.accountId === account.id && dayPhase(d, account) === account.phase)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Classifies a day. `band` is the breakeven tolerance in dollars: fees can leave
 * a scratch session at -$12, and that is a flat day, not a losing one.
 */
export function dayKind(net: number, band: number): DayKind {
  if (Math.abs(net) <= band) return "flat";
  return net > 0 ? "win" : "loss";
}

export type AccountStatus = {
  /** Days that count toward the current phase. */
  phaseDays: DayDTO[];
  /** Balance the current phase started from. */
  phaseStart: number;
  /** Current balance, payouts already taken off. */
  balance: number;
  /** Profit within the current phase, before payouts. */
  phaseNet: number;
  /** Withdrawn during this phase. */
  paidOut: number;
  /** Profit still available to withdraw. */
  withdrawable: number;
  /** A funded *prop* account with profit left in it. */
  canPayout: boolean;
  /** Days in this phase clearing the firm's minimum for a winning day. */
  winDays: number;
  /** How many the firm wants before it will pay. */
  winDaysNeeded: number;
  /**
   * The balance a withdrawal may not take you below: the drawdown floor plus
   * whatever buffer the firm holds back. Taking money out of the buffer is what
   * turns a good week into a blown account on the next red day.
   */
  payoutFloor: number;
  /** The largest request that satisfies every rule at once. */
  maxRequest: number;
  /** Nothing standing in the way of a request. */
  payoutReady: boolean;
  /** Plain reasons a payout can't be requested yet, in the order they bite. */
  payoutBlockers: string[];

  isProp: boolean;
  phase: Phase;

  target: number;
  /** 0..1 progress toward the profit target; 0 when there is no target. */
  targetProgress: number;
  remainingToTarget: number;

  /** Where the account dies, in dollars of balance. Null when no drawdown rule. */
  floor: number | null;
  /** Distance from the current balance down to the floor. */
  cushion: number | null;

  /** Best single day as a share of gross profit, 0..1. Null when no rule. */
  consistency: number | null;
  consistencyLimit: number | null;
  consistencyOk: boolean;
  /** What the best day would have to stay under to satisfy the rule. */
  consistencyCap: number | null;
  bestDay: number;
};

/**
 * The trailing drawdown floor after each end-of-day balance.
 *
 * The floor follows the highest end-of-day balance reached, minus the max loss,
 * and never falls again. For most firms it also stops climbing once it reaches
 * the starting balance, which is what `trailCapsAtStart` expresses.
 */
export function drawdownFloor(
  start: number,
  rules: AccountRules,
  ordered: DayDTO[],
): number | null {
  if (!rules.maxLoss) return null;

  let balance = start;
  let peak = start;
  let floor = start - rules.maxLoss;

  for (const d of ordered) {
    balance += d.net;
    if (balance > peak) peak = balance;
    const candidate = rules.trailCapsAtStart
      ? Math.min(peak - rules.maxLoss, start)
      : peak - rules.maxLoss;
    if (candidate > floor) floor = candidate;
  }
  return floor;
}

export function accountStatus(
  account: AccountDTO,
  allDays: DayDTO[],
  breakevenBand: number,
): AccountStatus {
  const rules = account.rules;
  const isProp = Boolean(account.firm);

  // Passing an evaluation resets the balance, so only sessions logged in the
  // current phase count toward it.
  const phaseDays = phaseDaysOf(account, allDays);

  const phaseStart = account.passedOn ? account.size || account.start : account.start;
  const phaseNet = phaseDays.reduce((a, d) => a + d.net, 0);

  // A payout is real money leaving the account: it comes off the balance, and
  // off the drawdown cushion with it, but never off the trading record.
  //
  // No date filtering. Payouts belong to the phase they were taken in and
  // `setPhase` clears them on a reset, so every one still on the account counts.
  // Comparing dates against `passedOn` meant a clock a day out, or a payout on
  // the pass date itself, silently vanished — which looked exactly like the
  // deduction not working.
  const paidOut = (account.payouts || []).reduce((a, p) => a + p.amount, 0);

  const balance = phaseStart + phaseNet - paidOut;
  const withdrawable = Math.max(0, phaseNet - paidOut);

  const target = rules?.profitTarget || 0;
  const targetProgress = target > 0 ? Math.max(0, Math.min(1, phaseNet / target)) : 0;

  // The floor follows the trading peak; a withdrawal doesn't move it, so taking
  // money out eats into the cushion. That is how the firms count it too.
  const floor = rules ? drawdownFloor(phaseStart, rules, phaseDays) : null;
  const cushion = floor === null ? null : balance - floor;

  // Consistency looks only at winning days: the rule asks what share of the
  // profit came from the single best session.
  const wins = phaseDays.filter((d) => dayKind(d.net, breakevenBand) === "win");
  const grossWin = wins.reduce((a, d) => a + d.net, 0);
  const bestDay = wins.length ? Math.max(...wins.map((d) => d.net)) : 0;
  const limit = rules?.consistencyPct || 0;

  const consistency = limit > 0 && grossWin > 0 ? bestDay / grossWin : null;
  const consistencyOk = consistency === null ? true : consistency <= limit / 100;
  // The profit you would need for the current best day to be compliant.
  const consistencyCap = limit > 0 ? (grossWin * limit) / 100 : null;

  // --- payout eligibility ---------------------------------------------------
  const pay = rules?.payout || NO_PAYOUT;

  // Winning days count from the last payout, not from funding: firms want the
  // days done again before they will pay again.
  const lastPayout = (account.payouts || [])
    .map((p) => p.date)
    .sort()
    .pop();
  const sinceLastPayout = lastPayout
    ? phaseDays.filter((d) => d.date > lastPayout)
    : phaseDays;
  const winDays = sinceLastPayout.filter((d) => d.net >= Math.max(pay.minWinDay, 0.01)).length;
  const payoutFloor = (floor ?? phaseStart - (rules?.maxLoss || 0)) + pay.buffer;

  // Every cap applied at once — you can only have the smallest of them.
  let maxRequest = Math.max(0, Math.min(withdrawable, balance - payoutFloor));
  if (pay.maxPayout) maxRequest = Math.min(maxRequest, pay.maxPayout);
  if (pay.maxPayoutPct) maxRequest = Math.min(maxRequest, (balance * pay.maxPayoutPct) / 100);
  // A share of the profit, which is not the same as a share of the balance.
  if (pay.maxProfitPct) maxRequest = Math.min(maxRequest, (phaseNet * pay.maxProfitPct) / 100);
  maxRequest = Math.floor(maxRequest);

  const payoutBlockers: string[] = [];
  if (account.phase !== "funded") {
    payoutBlockers.push("The account has to be funded first.");
  } else {
    if (pay.minWinDays && winDays < pay.minWinDays) {
      const left = pay.minWinDays - winDays;
      payoutBlockers.push(
        `${left} more winning ${left === 1 ? "day" : "days"} of ${
          pay.minWinDay ? `$${pay.minWinDay}+` : "profit"
        } — ${winDays} of ${pay.minWinDays}${lastPayout ? " since your last payout" : ""}.`,
      );
    }
    if (!consistencyOk) {
      payoutBlockers.push("The consistency rule isn't met yet.");
    }
    if (balance - payoutFloor <= 0) {
      payoutBlockers.push(
        pay.buffer
          ? `Nothing above the buffer — the firm holds ${fmt(pay.buffer)} over the drawdown.`
          : "Nothing above the drawdown floor to withdraw.",
      );
    } else if (pay.minPayout && maxRequest < pay.minPayout) {
      payoutBlockers.push(
        `The smallest request is ${fmt(pay.minPayout)}; only ${fmt(maxRequest)} is free right now.`,
      );
    } else if (maxRequest <= 0) {
      payoutBlockers.push("No profit to withdraw yet.");
    }
  }

  return {
    phaseDays,
    phaseStart,
    balance,
    phaseNet,
    paidOut,
    withdrawable,
    // Withdrawing is a prop-firm thing. Your own cash account has no payout to
    // request, so offering one there would be nonsense.
    canPayout: isProp && account.phase === "funded" && withdrawable > 0,
    winDays,
    winDaysNeeded: pay.minWinDays,
    payoutFloor,
    maxRequest,
    payoutReady: isProp && payoutBlockers.length === 0 && maxRequest > 0,
    payoutBlockers,
    isProp,
    phase: account.phase,
    target,
    targetProgress,
    remainingToTarget: Math.max(0, target - phaseNet),
    floor,
    cushion,
    consistency,
    consistencyLimit: limit || null,
    consistencyOk,
    consistencyCap,
    bestDay,
  };
}

/**
 * Works out whether an account has been breached, from the days alone. Returns
 * null when nothing changed.
 *
 * Only a breach is detected automatically. Clearing an evaluation is *offered*
 * rather than applied — see `evalCleared` — because the upgrade resets the
 * balance, and doing that to someone's account the instant a number is hit,
 * before their firm has actually converted it, would be presumptuous.
 */
export function detectPhaseChange(
  account: AccountDTO,
  allDays: DayDTO[],
  breakevenBand: number,
): { phase: Phase; blownOn: string } | null {
  if (!account.firm || account.phase === "blown" || account.phase === "passed") return null;
  if (!account.rules?.maxLoss) return null;

  const status = accountStatus(account, allDays, breakevenBand);
  const ordered = status.phaseDays;
  if (!ordered.length) return null;

  // Checked day by day, because the floor moves as the balance does. Payouts are
  // walked alongside: money taken out lowers the balance without lowering the
  // floor, which is exactly how a withdrawal can end an account.
  const taken = new Map<string, number>();
  for (const p of account.payouts || []) {
    taken.set(p.date, (taken.get(p.date) || 0) + p.amount);
  }

  let balance = status.phaseStart;
  let peak = status.phaseStart;
  let floor = status.phaseStart - account.rules.maxLoss;

  const dates = [...new Set([...ordered.map((d) => d.date), ...taken.keys()])].sort();
  const byDate = new Map(ordered.map((d) => [d.date, d]));

  for (const date of dates) {
    balance += byDate.get(date)?.net ?? 0;
    balance -= taken.get(date) ?? 0;
    if (balance <= floor) return { phase: "blown", blownOn: date };
    if (balance > peak) peak = balance;
    const candidate = account.rules.trailCapsAtStart
      ? Math.min(peak - account.rules.maxLoss, status.phaseStart)
      : peak - account.rules.maxLoss;
    if (candidate > floor) floor = candidate;
  }

  return null;
}

/**
 * The date an evaluation's profit target was cleared, or null if it hasn't been.
 *
 * The consistency rule has to be satisfied too: firms hold the conversion
 * otherwise, and offering the upgrade early would be worse than not offering it.
 */
export function evalCleared(
  account: AccountDTO,
  allDays: DayDTO[],
  breakevenBand: number,
): string | null {
  if (!account.firm || account.phase !== "eval") return null;

  const status = accountStatus(account, allDays, breakevenBand);
  if (status.target <= 0 || !status.phaseDays.length) return null;
  if (status.phaseNet < status.target || !status.consistencyOk) return null;

  // Dated to the day the target was actually reached, not the latest day.
  let running = 0;
  for (const d of status.phaseDays) {
    running += d.net;
    if (running >= status.target) return d.date;
  }
  return status.phaseDays[status.phaseDays.length - 1].date;
}

function fmt(n: number): string {
  return `$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
}

export function phaseLabel(account: AccountDTO): string {
  if (!account.firm) return "Personal";
  switch (account.phase) {
    case "eval":
      return "Evaluation";
    case "funded":
      return "Funded";
    case "passed":
      return "Passed";
    case "blown":
      return "Blown";
    default:
      return "Account";
  }
}
