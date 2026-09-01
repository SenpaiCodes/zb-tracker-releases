import type { AccountDTO, DayDTO } from "../lib/types";
import { colorFor, money } from "../lib/format";
import { accountStatus } from "../lib/account";
import { findPlan, sizeLabel } from "../lib/propfirms";
import { C, MONO, caption, signed } from "./ui";

// What a prop account actually turns on: how far the evaluation has got, how
// much room is left before the drawdown floor, and — when the plan has one —
// whether the consistency rule is being met. Nothing here is stored; it is all
// recomputed from the logged days, so fixing a day fixes the status with it.

type Props = {
  account: AccountDTO;
  allDays: DayDTO[];
  breakevenBand: number;
};

export default function PropPanel({ account, allDays, breakevenBand }: Props) {
  if (!account.firm) return null;
  const st = accountStatus(account, allDays, breakevenBand);
  const plan = findPlan(account.firm, account.plan);

  const blown = account.phase === "blown";
  const evaluating = account.phase === "eval" && st.target > 0;

  return (
    <section
      className="card"
      style={{
        borderRadius: 14,
        padding: "16px 18px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
        gap: 18,
        borderColor: blown ? C.negEdge : undefined,
      }}
    >
      {/* --- phase ---------------------------------------------------------- */}
      <div style={{ display: "flex", flexDirection: "column", gap: 9, minWidth: 0 }}>
        <div style={caption()}>{evaluating ? "Evaluation" : blown ? "Account breached" : "Funded"}</div>

        {evaluating ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 500, letterSpacing: -0.6 }}>
                {Math.round(st.targetProgress * 100)}%
              </span>
              <span style={{ fontSize: 11.5, color: C.faint }}>
                of {signed(st.target)} target
              </span>
            </div>
            <Bar value={st.targetProgress} tone={C.pos} />
            <span
              style={{
                fontSize: 11,
                color: st.remainingToTarget > 0 ? C.faintest : st.consistencyOk ? C.pos : C.amber,
              }}
            >
              {st.remainingToTarget > 0
                ? `${signed(st.remainingToTarget)} to go · ${money(st.phaseNet)} so far`
                : st.consistencyOk
                  ? "Cleared — upgrade it whenever you're ready."
                  : "Target cleared. The consistency rule still has to be met."}
            </span>
          </>
        ) : blown ? (
          <>
            <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 500, color: C.neg }}>
              {money(st.phaseNet)}
            </div>
            <span style={{ fontSize: 11, color: C.faintest }}>
              {account.blownOn
                ? `Breached on ${dayLabel(account.blownOn)}. Reset it from Settings → Accounts.`
                : "Marked as blown. Reset it from Settings → Accounts."}
            </span>
          </>
        ) : (
          <>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 22,
                fontWeight: 500,
                letterSpacing: -0.6,
                color: colorFor(st.phaseNet),
              }}
            >
              {money(st.phaseNet)}
            </div>
            <span style={{ fontSize: 11, color: C.faintest }}>
              {account.passedOn
                ? `Passed ${dayLabel(account.passedOn)} · balance reset to ${signed(st.phaseStart)}`
                : `${plan?.name || "Funded"}${account.size ? ` · ${sizeLabel(account.size)}` : ""}`}
            </span>
          </>
        )}
      </div>

      {/* --- drawdown -------------------------------------------------------- */}
      {st.floor !== null && st.cushion !== null ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 9, minWidth: 0 }}>
          <div style={caption()}>Room to the drawdown</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 22,
                fontWeight: 500,
                letterSpacing: -0.6,
                color: cushionTone(st.cushion, account.rules.maxLoss),
              }}
            >
              {signed(Math.max(0, st.cushion))}
            </span>
            <span style={{ fontSize: 11.5, color: C.faint }}>left</span>
          </div>
          <Bar
            value={account.rules.maxLoss ? Math.max(0, st.cushion) / account.rules.maxLoss : 0}
            tone={cushionTone(st.cushion, account.rules.maxLoss)}
          />
          {account.rules.payout.buffer && account.phase === "funded" ? (
            <span style={{ fontSize: 11, color: C.amber }}>
              Payouts stop at {signed(st.payoutFloor)} — the firm holds{" "}
              {signed(account.rules.payout.buffer)} over the floor.
            </span>
          ) : null}
          <span style={{ fontSize: 11, color: C.faintest }}>
            Floor at {signed(st.floor)} ·{" "}
            {account.rules.drawdownMode === "static"
              ? "static"
              : account.rules.drawdownMode === "intraday"
                ? "trails intraday"
                : "trails end of day"}
          </span>
        </div>
      ) : null}

      {/* --- consistency ----------------------------------------------------- */}
      {st.consistencyLimit ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 9, minWidth: 0 }}>
          <div style={caption()}>Consistency</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 22,
                fontWeight: 500,
                letterSpacing: -0.6,
                color: st.consistency === null ? C.mute : st.consistencyOk ? C.pos : C.neg,
              }}
            >
              {st.consistency === null ? "—" : `${Math.round(st.consistency * 100)}%`}
            </span>
            <span style={{ fontSize: 11.5, color: C.faint }}>
              of profit, limit {st.consistencyLimit}%
            </span>
          </div>

          {/* The bar is the best day's share; the notch is where the rule sits. */}
          <div style={{ position: "relative" }}>
            <Bar
              value={st.consistency ?? 0}
              tone={st.consistencyOk ? C.pos : C.neg}
            />
            <span
              title={`${st.consistencyLimit}% limit`}
              style={{
                position: "absolute",
                top: -2,
                bottom: -2,
                left: `${st.consistencyLimit}%`,
                width: 2,
                borderRadius: 2,
                background: C.text,
                opacity: 0.55,
              }}
            />
          </div>

          <span style={{ fontSize: 11, color: st.consistencyOk ? C.faintest : C.neg }}>
            {st.consistency === null
              ? "No winning days yet — nothing to measure."
              : st.consistencyOk
                ? `Best day ${money(st.bestDay)}, under the ${signed(st.consistencyCap ?? 0)} cap.`
                : `Best day ${money(st.bestDay)} exceeds the ${signed(
                    st.consistencyCap ?? 0,
                  )} cap — more green days bring it back in line.`}
          </span>
        </div>
      ) : null}

      {/* --- payout progress --------------------------------------------------- */}
      {account.phase === "funded" && st.winDaysNeeded ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 9, minWidth: 0 }}>
          <div style={caption()}>Winning days</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 22,
                fontWeight: 500,
                letterSpacing: -0.6,
                color: st.winDays >= st.winDaysNeeded ? C.pos : C.mute,
              }}
            >
              {st.winDays}/{st.winDaysNeeded}
            </span>
            <span style={{ fontSize: 11.5, color: C.faint }}>
              {account.rules.payout.minWinDay
                ? `days over ${signed(account.rules.payout.minWinDay)}`
                : "profitable days"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 3 }}>
            {Array.from({ length: st.winDaysNeeded }, (_, i) => (
              <span
                key={i}
                style={{
                  flex: 1,
                  height: 5,
                  borderRadius: 2,
                  background: i < st.winDays ? C.pos : C.line2,
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: 11, color: st.payoutReady ? C.pos : C.faintest }}>
            {st.payoutReady
              ? `Payout ready — up to ${signed(st.maxRequest)}.`
              : st.payoutBlockers[0] || "Keep going."}
          </span>
        </div>
      ) : null}

      {/* --- payouts ---------------------------------------------------------- */}
      {st.paidOut > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 9, minWidth: 0 }}>
          <div style={caption()}>Paid out</div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: -0.6,
              color: C.accent,
            }}
          >
            {signed(st.paidOut)}
          </div>
          <span style={{ fontSize: 11, color: C.faintest }}>
            Withdrawn since funding · {signed(st.withdrawable)} still in the account
          </span>
        </div>
      ) : null}

      {/* --- daily loss ------------------------------------------------------ */}
      {account.rules.dailyLoss ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 9, minWidth: 0 }}>
          <div style={caption()}>Daily loss limit</div>
          <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 500, letterSpacing: -0.6 }}>
            {signed(account.rules.dailyLoss)}
          </div>
          <span style={{ fontSize: 11, color: C.faintest }}>
            {worstBreach(st.phaseDays, account.rules.dailyLoss)}
          </span>
        </div>
      ) : null}
    </section>
  );
}

function Bar({ value, tone }: { value: number; tone: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div style={{ height: 5, borderRadius: 3, background: C.line2, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: tone, opacity: 0.9 }} />
    </div>
  );
}

function cushionTone(cushion: number, maxLoss: number): string {
  if (cushion <= 0) return C.neg;
  if (maxLoss && cushion / maxLoss < 0.25) return C.amber;
  return C.pos;
}

function worstBreach(days: DayDTO[], limit: number): string {
  const worst = days.reduce((a, d) => Math.min(a, d.net), 0);
  if (worst >= 0) return "No losing day logged in this phase.";
  if (Math.abs(worst) >= limit) return `Worst day ${money(worst)} — at or past the limit.`;
  return `Worst day ${money(worst)}, ${signed(limit - Math.abs(worst))} inside it.`;
}

function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
