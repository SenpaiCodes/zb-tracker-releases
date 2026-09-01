// Prop-firm account templates.
//
// IMPORTANT: these are *starting points*, not gospel. Firms change their specs
// often and the figures here were compiled from public write-ups rather than
// each firm's contract, so every number is editable per account in Settings →
// Accounts. Check them against your own dashboard before trusting a number on
// this screen — an account is real money and a stale profit target or drawdown
// here must never be the thing you rely on.

export type DrawdownMode = "eod" | "intraday" | "static";

/**
 * What a firm asks for before it will pay you. Compiled from each firm's public
 * payout policy — see the header warning: verify against your own dashboard.
 */
export type PayoutRules = {
  /** Qualifying winning days needed before a request. */
  minWinDays: number;
  /** Net a day must clear to count as one of them. */
  minWinDay: number;
  /**
   * What has to stay in the account above the drawdown floor after a
   * withdrawal. This is the rule that catches people out: take the buffer with
   * you and the next red day ends the account.
   */
  buffer: number;
  /** Smallest request the firm accepts. 0 when there is no minimum. */
  minPayout: number;
  /** Largest single request. 0 when uncapped. */
  maxPayout: number;
  /** Cap as a share of the balance. 0 when there is none. */
  maxPayoutPct: number;
  /**
   * Cap as a share of the profit made, which is a different thing: Topstep caps
   * against the balance, Lucid against what you actually earned. 0 when none.
   */
  maxProfitPct: number;
  /** Your share of the profit, as a percentage. */
  split: number;
  /**
   * Profit that must be earned before the *first* payout. 0 when the firm gates
   * on winning days instead.
   */
  firstGoal: number;
  /**
   * Profit needed before each payout after the first. Firms reset this per
   * cycle — what is left over from the previous one does not carry.
   * 0 falls back to `firstGoal`.
   */
  nextGoal: number;
  /**
   * Consistency limit by payout number, when it changes as you get paid.
   * Tradeify Lightning relaxes 20% → 25% → 30%. Empty uses `consistencyPct`.
   */
  consistencySteps: number[];
};

export type AccountRules = {
  /** Profit needed to pass. 0 for an instant-funded account with no target. */
  profitTarget: number;
  /** Max loss limit / trailing drawdown, as a positive number. */
  maxLoss: number;
  /** How the drawdown floor moves. */
  drawdownMode: DrawdownMode;
  /** True when the floor stops trailing once it reaches the starting balance. */
  trailCapsAtStart: boolean;
  /** Daily loss limit. 0 when the plan has none. */
  dailyLoss: number;
  /** Best day may not exceed this share of total profit. 0 when none. */
  consistencyPct: number;
  payout: PayoutRules;
};

export const NO_PAYOUT: PayoutRules = {
  minWinDays: 0,
  minWinDay: 0,
  buffer: 0,
  minPayout: 0,
  maxPayout: 0,
  maxPayoutPct: 0,
  maxProfitPct: 0,
  split: 100,
  firstGoal: 0,
  nextGoal: 0,
  consistencySteps: [],
};

/** Most firms count a winning day by size; this is the shape they share. */
function payout(over: Partial<PayoutRules>): PayoutRules {
  return { ...NO_PAYOUT, ...over };
}

export type Plan = {
  id: string;
  name: string;
  /** Sizes offered, in dollars. */
  sizes: number[];
  /** Whether this plan starts as an evaluation or straight into funded. */
  startsFunded: boolean;
  note?: string;
  /** Rules per size; `sizes` and the keys here must agree. */
  rules: Record<number, AccountRules>;
};

export type Firm = { id: string; name: string; plans: Plan[] };

const eod = (
  profitTarget: number,
  maxLoss: number,
  dailyLoss: number,
  consistencyPct: number,
  pay: PayoutRules = NO_PAYOUT,
  trailCapsAtStart = true,
): AccountRules => ({
  profitTarget,
  maxLoss,
  drawdownMode: "eod",
  trailCapsAtStart,
  dailyLoss,
  consistencyPct,
  payout: pay,
});

// --- payout policies ---------------------------------------------------------

/** Topstep: five $200 days, then $5,000 or half the balance, whichever is less. */
const TOPSTEP_PAYOUT = payout({
  minWinDays: 5,
  minWinDay: 200,
  maxPayout: 5000,
  maxPayoutPct: 50,
  split: 90,
});

/**
 * Lucid: five days clearing a size-scaled minimum, and a request capped at half
 * your profit up to a ceiling that scales with the account.
 */
const lucidPayout = (size: number, buffered: boolean, maxLoss: number): PayoutRules =>
  payout({
    minWinDays: 5,
    minWinDay: { 25000: 100, 50000: 150, 100000: 200, 150000: 250 }[size] ?? 100,
    // Pro and Direct additionally hold back the drawdown plus $100.
    buffer: buffered ? maxLoss + 100 : 0,
    maxProfitPct: 50,
    maxPayout: { 25000: 1000, 50000: 2000, 100000: 4000, 150000: 6000 }[size] ?? 1000,
    split: 100,
  });

/**
 * Tradeify Lightning. No minimum trading-day count — it gates on profit earned
 * *this cycle*: $1,500/$3,000/$6,000/$9,000 to unlock the first payout, then
 * $1,000/$2,000/$3,500/$4,500 for each one after. Leftover profit from the
 * previous cycle doesn't carry. Consistency relaxes 20% → 25% → 30%.
 *
 * The per-request ceiling is $1,000 on a 25K and $3,500 on a 150K; the 50K and
 * 100K figures are not in Tradeify's public write-ups, so they are left at 0
 * ("no cap") rather than guessed. Fill them in from your own dashboard.
 */
const lightningPayout = (size: number, buffer: number): PayoutRules =>
  payout({
    minWinDays: 0,
    buffer,
    minPayout: 1000,
    maxPayout: { 25000: 1000, 50000: 0, 100000: 0, 150000: 3500 }[size] ?? 0,
    firstGoal: { 25000: 1500, 50000: 3000, 100000: 6000, 150000: 9000 }[size] ?? 1500,
    nextGoal: { 25000: 1000, 50000: 2000, 100000: 3500, 150000: 4500 }[size] ?? 1000,
    consistencySteps: [20, 25, 30],
    split: 90,
  });

/** Tradeify: five qualifying days and a size-scaled minimum request. */
const tradeifyPayout = (size: number, buffer: number): PayoutRules =>
  payout({
    minWinDays: 5,
    minWinDay: 200,
    buffer,
    minPayout: { 25000: 250, 50000: 500, 100000: 1000, 150000: 1500 }[size] ?? 250,
    split: 100,
  });

export const FIRMS: Firm[] = [
  {
    id: "topstep",
    name: "Topstep",
    plans: [
      {
        id: "combine",
        name: "Trading Combine",
        sizes: [50000, 100000, 150000],
        startsFunded: false,
        note: "50% consistency during the Combine; MLL trails end-of-day.",
        rules: {
          50000: eod(3000, 2000, 1000, 50, TOPSTEP_PAYOUT),
          100000: eod(6000, 3000, 2000, 50, TOPSTEP_PAYOUT),
          150000: eod(9000, 4500, 3000, 50, TOPSTEP_PAYOUT),
        },
      },
    ],
  },
  {
    id: "lucid",
    name: "Lucid Trading",
    plans: [
      {
        id: "flex",
        name: "LucidFlex",
        sizes: [25000, 50000, 100000, 150000],
        startsFunded: false,
        note: "No consistency rule. Payouts are half your profit, up to the plan's ceiling.",
        rules: {
          25000: eod(1250, 1000, 0, 0, lucidPayout(25000, false, 1000)),
          50000: eod(3000, 2000, 0, 0, lucidPayout(50000, false, 2000)),
          100000: eod(6000, 3000, 0, 0, lucidPayout(100000, false, 3000)),
          150000: eod(9000, 4500, 0, 0, lucidPayout(150000, false, 4500)),
        },
      },
      {
        id: "pro",
        name: "LucidPro",
        sizes: [25000, 50000, 100000, 150000],
        startsFunded: false,
        note: "No consistency rule; daily loss limits scale with size.",
        rules: {
          25000: eod(1250, 1000, 500, 0, lucidPayout(25000, true, 1000)),
          50000: eod(3000, 2000, 1100, 0, lucidPayout(50000, true, 2000)),
          100000: eod(6000, 3000, 2200, 0, lucidPayout(100000, true, 3000)),
          150000: eod(9000, 4500, 3300, 0, lucidPayout(150000, true, 4500)),
        },
      },
      {
        id: "direct",
        name: "LucidDirect",
        sizes: [25000, 50000, 100000, 150000],
        startsFunded: true,
        note: "Instant funded. 20% consistency, and LucidScale moves the daily limit with your peak balance.",
        rules: {
          25000: eod(0, 1000, 500, 20, lucidPayout(25000, true, 1000)),
          50000: eod(0, 2000, 1100, 20, lucidPayout(50000, true, 2000)),
          100000: eod(0, 3000, 2200, 20, lucidPayout(100000, true, 3000)),
          150000: eod(0, 4500, 3300, 20, lucidPayout(150000, true, 4500)),
        },
      },
    ],
  },
  {
    id: "tradeify",
    name: "Tradeify",
    plans: [
      {
        id: "growth",
        name: "Growth Evaluation",
        sizes: [25000, 50000, 100000, 150000],
        startsFunded: false,
        note: "35% consistency on the funded account, and five qualifying days per payout.",
        rules: {
          25000: eod(1500, 1500, 0, 35, tradeifyPayout(25000, 0)),
          50000: eod(3000, 2000, 0, 35, tradeifyPayout(50000, 0)),
          100000: eod(6000, 3000, 0, 35, tradeifyPayout(100000, 0)),
          150000: eod(9000, 4500, 0, 35, tradeifyPayout(150000, 0)),
        },
      },
      {
        id: "select",
        name: "Select Evaluation",
        sizes: [25000, 50000, 100000, 150000],
        startsFunded: false,
        note: "Intraday trailing drawdown.",
        rules: {
          25000: { ...eod(1500, 1500, 0, 0, tradeifyPayout(25000, 1600)), drawdownMode: "intraday" },
          50000: { ...eod(2000, 2000, 0, 0, tradeifyPayout(50000, 2100)), drawdownMode: "intraday" },
          100000: { ...eod(5000, 3000, 0, 0, tradeifyPayout(100000, 3100)), drawdownMode: "intraday" },
          150000: { ...eod(9000, 4500, 0, 0, tradeifyPayout(150000, 4600)), drawdownMode: "intraday" },
        },
      },
      {
        id: "lightning",
        name: "Lightning Funded",
        sizes: [25000, 50000, 100000, 150000],
        startsFunded: true,
        note: "Instant funded — no target to clear, rule compliance only.",
        rules: {
          25000: eod(0, 1500, 0, 20, lightningPayout(25000, 1600)),
          50000: eod(0, 2000, 0, 20, lightningPayout(50000, 2100)),
          100000: eod(0, 3000, 0, 20, lightningPayout(100000, 3100)),
          150000: eod(0, 4500, 0, 20, lightningPayout(150000, 4600)),
        },
      },
    ],
  },
];

export const CUSTOM_RULES: AccountRules = {
  profitTarget: 0,
  maxLoss: 0,
  drawdownMode: "static",
  trailCapsAtStart: true,
  dailyLoss: 0,
  consistencyPct: 0,
  payout: { ...NO_PAYOUT },
};

export function findFirm(id: string | null): Firm | null {
  return FIRMS.find((f) => f.id === id) || null;
}

export function findPlan(firmId: string | null, planId: string | null): Plan | null {
  return findFirm(firmId)?.plans.find((p) => p.id === planId) || null;
}

/** The template's rules for a size, or the neutral set when there is no match. */
export function rulesFor(
  firmId: string | null,
  planId: string | null,
  size: number,
): AccountRules {
  const plan = findPlan(firmId, planId);
  if (!plan) return { ...CUSTOM_RULES };
  return { ...(plan.rules[size] || plan.rules[plan.sizes[0]] || CUSTOM_RULES) };
}

export function sizeLabel(size: number): string {
  return size >= 1000 ? `${Math.round(size / 1000)}K` : `$${size}`;
}
