// Regression tests for the account rules: what counts as a flat day, where the
// drawdown floor sits, and when an evaluation may be converted.
//
// These are the numbers the app makes claims about on screen, against a real
// prop account. Getting one wrong is worse than showing nothing.
//
//   npm test

import assert from "node:assert/strict";
import test from "node:test";
import { dayKind, drawdownFloor, accountStatus, evalCleared, detectPhaseChange } from "../src/lib/account.ts";
import { rulesFor } from "../src/lib/propfirms.ts";
import { agg } from "../src/lib/format.ts";
import type { AccountDTO, DayDTO } from "../src/lib/types.ts";

function day(date: string, net: number, wins = 1, losses = 0): DayDTO {
  return {
    id: `d-${date}`,
    accountId: "acc",
    date,
    net,
    wins,
    losses,
    contracts: 4,
    note: "",
    tags: [],
    trades: [],
    shots: [],
  };
}

function account(over: Partial<AccountDTO> = {}): AccountDTO {
  return {
    id: "acc",
    name: "Lucid 25K",
    broker: "",
    start: 25000,
    firm: "lucid",
    plan: "flex",
    size: 25000,
    phase: "eval",
    rules: rulesFor("lucid", "flex", 25000),
    passedOn: null,
    blownOn: null,
    createdAt: null,
    archived: false,
    payouts: [],
    ...over,
  };
}

test("Lucid 25K carries a $1,000 drawdown, not $1,500", () => {
  for (const plan of ["flex", "pro", "direct"]) {
    assert.equal(rulesFor("lucid", plan, 25000).maxLoss, 1000, `lucid ${plan} 25K`);
  }
});

test("a day inside the breakeven band is flat, not a loss", () => {
  // Fees alone can leave a scratched session a few dollars down.
  assert.equal(dayKind(-12, 20), "flat");
  assert.equal(dayKind(12, 20), "flat");
  assert.equal(dayKind(-20, 20), "flat", "the band is inclusive");
  assert.equal(dayKind(-21, 20), "loss");
  assert.equal(dayKind(0, 0), "flat");
  assert.equal(dayKind(-1, 0), "loss", "no band means exact");
});

test("the drawdown floor trails the peak and stops at the starting balance", () => {
  const rules = rulesFor("lucid", "flex", 25000); // maxLoss 1000, caps at start

  assert.equal(drawdownFloor(25000, rules, []), 24000, "opens one max-loss below");

  // Up 600: the floor follows to 24,600, still under the starting balance.
  assert.equal(drawdownFloor(25000, rules, [day("2026-09-01", 600)]), 24600);

  // Up 1,800: uncapped it would be 25,800, but it stops at the start.
  assert.equal(drawdownFloor(25000, rules, [day("2026-09-01", 1800)]), 25000);

  // And it never falls back down again after giving profit back.
  assert.equal(
    drawdownFloor(25000, rules, [day("2026-09-01", 600), day("2026-09-02", -400)]),
    24600,
  );
});

test("LucidFlex has no consistency rule", () => {
  for (const size of [25000, 50000, 100000, 150000]) {
    assert.equal(rulesFor("lucid", "flex", size).consistencyPct, 0, `flex ${size}`);
  }
});

test("an evaluation is only offered once the consistency rule is met too", () => {
  // Topstep's Combine does carry one: 50% on a $3,000 target.
  const acc = account({
    name: "Topstep 50K",
    firm: "topstep",
    plan: "combine",
    size: 50000,
    start: 50000,
    rules: rulesFor("topstep", "combine", 50000),
  });
  // 1,700 + 1,400 clears the target, but 1,700 is 54.8% of the 3,100 profit.
  const tooLumpy = [day("2026-09-01", 1700), day("2026-09-02", 1400)];
  const st = accountStatus(acc, tooLumpy, 0);
  assert.ok(st.phaseNet >= st.target, "target is cleared");
  assert.equal(st.consistencyOk, false, "but the best day is over half the profit");
  assert.equal(evalCleared(acc, tooLumpy, 0), null, "so no upgrade is offered");

  // A third green day dilutes the best day under the limit.
  const spread = [...tooLumpy, day("2026-09-03", 1300)];
  assert.equal(accountStatus(acc, spread, 0).consistencyOk, true);
  assert.equal(evalCleared(acc, spread, 0), "2026-09-02", "dated to the day the target was hit");
});

test("LucidFlex pays half your profit, up to the plan's ceiling", () => {
  for (const [size, cap] of [[25000, 1000], [50000, 2000], [100000, 4000], [150000, 6000]] as const) {
    const pay = rulesFor("lucid", "flex", size).payout;
    assert.equal(pay.maxProfitPct, 50, `flex ${size} takes half the profit`);
    assert.equal(pay.maxPayout, cap, `flex ${size} ceiling`);
  }

  const rules = rulesFor("lucid", "flex", 50000);
  const acc = account({
    name: "LucidFlex 50K",
    size: 50000,
    start: 50000,
    phase: "funded",
    passedOn: "2026-08-31",
    rules,
  });

  // Up $1,200 over five qualifying days: half of it is $600.
  const small = Array.from({ length: 5 }, (_, i) => day(`2026-09-0${i + 1}`, 240));
  assert.equal(accountStatus(acc, small, 0).maxRequest, 600, "half the profit");

  // Up $6,000: half would be $3,000, but the 50K ceiling is $2,000.
  const big = Array.from({ length: 5 }, (_, i) => day(`2026-09-0${i + 1}`, 1200));
  assert.equal(accountStatus(acc, big, 0).maxRequest, 2000, "the ceiling wins");
});

test("win rate counts days when no trades were recorded", () => {
  // Logging a date and a net figure, with the win/loss boxes left empty, is the
  // normal case — a permanent 0% would be worse than useless.
  const bare = [day("2026-09-01", 300, 0, 0), day("2026-09-02", 250, 0, 0), day("2026-09-03", -100, 0, 0)];
  const a = agg(bare);
  assert.equal(a.trades, 0);
  assert.equal(a.byDay, true, "counted by day");
  assert.equal(a.greenDays, 2);
  assert.equal(a.redDays, 1);
  assert.equal(a.wr, 67, "2 of 3 green days");

  // With trades recorded it goes back to counting trades.
  const detailed = [day("2026-09-01", 300, 3, 1), day("2026-09-02", -100, 0, 2)];
  const b = agg(detailed);
  assert.equal(b.byDay, false);
  assert.equal(b.wr, 50, "3 of 6 trades");

  // A flat day inside the band is neither.
  const withFlat = agg([...bare, day("2026-09-04", -10, 0, 0)], 20);
  assert.equal(withFlat.greenDays, 2);
  assert.equal(withFlat.redDays, 1, "the -$10 day is flat, not red");
});

test("clearing an evaluation is never applied automatically", () => {
  const acc = account();
  const days = [day("2026-09-01", 700), day("2026-09-02", 650), day("2026-09-03", 600)];
  // The upgrade is on offer...
  assert.ok(evalCleared(acc, days, 0));
  // ...but nothing changes phase on its own. Converting resets the balance, and
  // that is the user's call to make.
  assert.equal(detectPhaseChange(acc, days, 0), null);
});

test("a breach is detected, and dated to the day it happened", () => {
  const acc = account();
  const days = [
    day("2026-09-01", 400), // 25,400 — floor trails to 24,400
    day("2026-09-02", -600), // 24,800 — still alive
    day("2026-09-03", -500), // 24,300 — under the floor
    day("2026-09-04", 900),
  ];
  assert.deepEqual(detectPhaseChange(acc, days, 0), { phase: "blown", blownOn: "2026-09-03" });
});

test("passing resets the balance and leaves the evaluation profit behind", () => {
  const acc = account({ phase: "funded", passedOn: "2026-09-03" });
  const days = [
    day("2026-09-01", 700),
    day("2026-09-02", 650),
    day("2026-09-03", 600), // the pass day itself does not carry over
    day("2026-09-04", 250), // the first funded day
  ];
  const st = accountStatus(acc, days, 0);
  assert.equal(st.phaseStart, 25000, "funded balance opens at the account size");
  assert.equal(st.phaseNet, 250, "only days after the pass count");
  assert.equal(st.balance, 25250);
  assert.equal(st.floor, 24250, "the floor trails from the reset balance");
});

test("a payout comes off the balance and the drawdown cushion with it", () => {
  const acc = account({
    phase: "funded",
    passedOn: "2026-09-01",
    payouts: [{ id: "p1", date: "2026-09-05", amount: 400 }],
  });
  const days = [day("2026-09-01", 900), day("2026-09-02", 700)];
  const st = accountStatus(acc, days, 0);

  assert.equal(st.phaseNet, 700, "the pass day is left behind; only 09-02 counts");
  assert.equal(st.paidOut, 400);
  assert.equal(st.balance, 25300, "25,000 + 700 - 400");
  assert.equal(st.withdrawable, 300, "what is left to take out");
  assert.equal(st.canPayout, true);
  // Peak 25,700 puts the floor at 24,700 — it only reaches the 25,000 cap once
  // the peak is a full max-loss above it. Taking 400 out eats the cushion with
  // the balance: 25,300 - 24,700 rather than 25,700 - 24,700.
  assert.equal(st.floor, 24700);
  assert.equal(st.cushion, 600);
});

test("every payout still on the account counts, whatever its date", () => {
  // Payouts are cleared by `setPhase` when a phase resets, so anything left is
  // this phase's. Dating them against `passedOn` is what used to drop a payout
  // taken on the pass day itself — and made the deduction look broken.
  const acc = account({
    phase: "funded",
    passedOn: "2026-09-03",
    payouts: [
      { id: "p0", date: "2026-09-03", amount: 200 }, // the pass day itself
      { id: "p1", date: "2026-09-05", amount: 100 },
    ],
  });
  const st = accountStatus(acc, [day("2026-09-04", 500)], 0);
  assert.equal(st.paidOut, 300);
  assert.equal(st.balance, 25200);
});

test("a personal account offers no payout", () => {
  const cash = account({ firm: null, plan: null, size: null, phase: "funded", rules: rulesFor(null, null, 0) });
  const st = accountStatus(cash, [day("2026-09-01", 400)], 0);
  assert.equal(st.withdrawable, 400, "the profit is real enough");
  assert.equal(st.canPayout, false, "but there is no firm to request it from");
});

test("an evaluation offers no payout", () => {
  const st = accountStatus(account(), [day("2026-09-01", 900)], 0);
  assert.equal(st.canPayout, false, "there is nothing to withdraw until it is funded");
});

test("a payout needs the firm's winning days first", () => {
  // Lucid 25K: five days clearing $100 each.
  const acc = account({ phase: "funded", passedOn: "2026-08-31" });
  const four = [
    day("2026-09-01", 300),
    day("2026-09-02", 250),
    day("2026-09-03", 90), // under the $100 minimum — doesn't count
    day("2026-09-04", 300),
    day("2026-09-05", 200),
  ];
  let st = accountStatus(acc, four, 0);
  assert.equal(st.winDaysNeeded, 5);
  assert.equal(st.winDays, 4, "the $90 day is short of the minimum");
  assert.equal(st.payoutReady, false);
  assert.match(st.payoutBlockers[0], /1 more winning day of \$100\+/);

  st = accountStatus(acc, [...four, day("2026-09-08", 150)], 0);
  assert.equal(st.winDays, 5);
  assert.equal(st.payoutReady, true, "five qualifying days clears it");
});

test("Topstep caps a request at $5,000 or half the balance", () => {
  const rules = rulesFor("topstep", "combine", 50000);
  assert.equal(rules.payout.maxPayout, 5000);
  assert.equal(rules.payout.maxPayoutPct, 50);
  assert.equal(rules.payout.minWinDay, 200, "a $200 day is what counts");
  assert.equal(rules.payout.split, 90);

  const acc = account({
    name: "Topstep 50K",
    firm: "topstep",
    plan: "combine",
    size: 50000,
    start: 50000,
    phase: "funded",
    passedOn: "2026-08-31",
    rules,
  });
  // Up 12,000 over five qualifying days: the profit is there, but the cap isn't.
  const days = Array.from({ length: 5 }, (_, i) => day(`2026-09-0${i + 1}`, 2400));
  const st = accountStatus(acc, days, 0);
  assert.equal(st.winDays, 5);
  assert.equal(st.withdrawable, 12000, "all of it is profit");
  assert.equal(st.maxRequest, 5000, "but $5,000 is the ceiling");
});

test("the buffer is what you may not withdraw", () => {
  // LucidPro 50K: $2,000 drawdown, and the firm holds maxLoss + $100 on top.
  const rules = rulesFor("lucid", "pro", 50000);
  assert.equal(rules.payout.buffer, 2100);

  const acc = account({
    name: "LucidPro 50K",
    plan: "pro",
    size: 50000,
    start: 50000,
    phase: "funded",
    passedOn: "2026-08-31",
    rules,
  });
  const days = Array.from({ length: 5 }, (_, i) => day(`2026-09-0${i + 1}`, 600));
  const st = accountStatus(acc, days, 0);

  assert.equal(st.balance, 53000);
  assert.equal(st.floor, 50000, "trailing floor, capped at the starting balance");
  assert.equal(st.payoutFloor, 52100, "floor plus the $2,100 buffer");
  assert.equal(st.maxRequest, 900, "53,000 - 52,100 — not the full $3,000 profit");
  assert.equal(st.payoutReady, true);
});

test("withdrawing into the drawdown blows the account", () => {
  const rules = rulesFor("lucid", "flex", 50000); // $2,000 drawdown, no buffer
  const base = {
    name: "LucidFlex 50K",
    size: 50000,
    start: 50000,
    phase: "funded" as const,
    passedOn: "2026-08-31",
    rules,
  };
  const days = [day("2026-09-01", 2000)]; // 52,000; floor trails to the 50,000 cap

  // Take the lot out and the balance is back on the floor — that is a breach.
  const stripped = account({ ...base, payouts: [{ id: "p", date: "2026-09-02", amount: 2000 }] });
  assert.deepEqual(detectPhaseChange(stripped, days, 0), {
    phase: "blown",
    blownOn: "2026-09-02",
  });

  // Leaving something in it survives.
  const careful = account({ ...base, payouts: [{ id: "p", date: "2026-09-02", amount: 1500 }] });
  assert.equal(detectPhaseChange(careful, days, 0), null);
  assert.equal(accountStatus(careful, days, 0).cushion, 500, "one bad day from the floor");
});

test("a payout dated before the pass still counts, so a wrong clock can't hide it", () => {
  const acc = account({
    phase: "funded",
    passedOn: "2026-09-10",
    payouts: [{ id: "p", date: "2026-09-01", amount: 400 }],
  });
  assert.equal(accountStatus(acc, [day("2026-09-11", 900)], 0).paidOut, 400);
});
