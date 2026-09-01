import type { AccountDTO, DayDTO, Journal } from "../lib/types";
import { agg, colorFor, money } from "../lib/format";
import { dayKind } from "../lib/account";
import { isAllTime, isVirtual } from "../lib/stats";
import { C, MONO } from "./ui";
import Icon, { type IconName } from "./Icon";
import { PhaseBadge } from "./AccountRow";
import AccountAction, { type Action } from "./AccountAction";

export type View = "dashboard" | "journal" | "add" | "settings";

type Props = {
  journal: Journal;
  view: View;
  /** Whatever the title bar has selected — a real account or All time. */
  account: AccountDTO | null;
  /** That account's days, already sliced. */
  days: DayDTO[];
  /** Current balance, payouts already deducted — computed once, in App. */
  balance: number;
  breakevenBand: number;
  /** The one thing this account is offering right now, if anything. */
  action: Action;
  onUpgrade: () => void;
  onPayout: (amount: number) => void;
  onRetire: () => void;
  onView: (v: View) => void;
  onSelectDay: (date: string) => void;
};

const NAV: { key: View; label: string; icon: IconName }[] = [
  { key: "dashboard", label: "Dashboard", icon: "dashboard" },
  { key: "journal", label: "Journal", icon: "journal" },
  { key: "add", label: "New entry", icon: "entry" },
  { key: "settings", label: "Settings", icon: "settings" },
];

export default function Sidebar({
  journal,
  view,
  account,
  days,
  balance,
  breakevenBand,
  action,
  onUpgrade,
  onPayout,
  onRetire,
  onView,
  onSelectDay,
}: Props) {
  const all = agg(days, breakevenBand);
  // The P&L and day count below the balance are the account's whole history,
  // which is why they can differ from it after a pass or a payout.
  const recent = [...days].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);

  return (
    <aside
      style={{
        width: 244,
        flex: "0 0 244px",
        borderRight: `1px solid ${C.line}`,
        padding: "20px 16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 26,
        // Fixed column: the main area scrolls beneath it, this never moves.
        height: "100%",
        overflowY: "auto",
        background: `linear-gradient(180deg, color-mix(in srgb, var(--fg) 2%, transparent) 0%, transparent 220px), ${C.bg}`,
      }}
    >
      <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {NAV.map(({ key, label, icon }) => {
          const on = view === key;
          return (
            <button
              key={key}
              onClick={() => onView(key)}
              aria-current={on ? "page" : undefined}
              className={on ? undefined : "hov-raised"}
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: 11,
                textAlign: "left",
                border: "1px solid",
                borderColor: on ? C.line2 : "transparent",
                borderRadius: 10,
                padding: "10px 12px",
                fontSize: 14,
                fontWeight: on ? 600 : 500,
                letterSpacing: -0.1,
                cursor: "pointer",
                background: on ? C.active : "transparent",
                color: on ? C.text : C.mute,
              }}
            >
              {/* Accent rail marks the active tab without shouting. */}
              <span
                style={{
                  position: "absolute",
                  left: -1,
                  top: 11,
                  bottom: 11,
                  width: 2.5,
                  borderRadius: 2,
                  background: on ? C.accent : "transparent",
                }}
              />
              <span style={{ color: on ? C.accent : C.faint, display: "flex" }}>
                <Icon name={icon} />
              </span>
              {label}
            </button>
          );
        })}
      </nav>

      {/* The most recent sessions, as a shortcut into the day drawer. Fills what
          was otherwise a tall empty column with something worth clicking. */}
      {recent.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 9, minHeight: 0 }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 9,
              letterSpacing: 1.3,
              textTransform: "uppercase",
              color: C.fainter,
              paddingLeft: 12,
            }}
          >
            Recent
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
            {recent.map((d) => {
              const dt = new Date(`${d.date}T12:00:00`);
              const kind = dayKind(d.net, breakevenBand);
              return (
                <button
                  key={d.id}
                  onClick={() => onSelectDay(d.date)}
                  className="hov-raised"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    border: "1px solid transparent",
                    borderRadius: 8,
                    padding: "7px 12px",
                    cursor: "pointer",
                    background: "transparent",
                    textAlign: "left",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span
                      style={{
                        width: 3,
                        height: 14,
                        borderRadius: 2,
                        flex: "0 0 3px",
                        background:
                          kind === "win" ? C.pos : kind === "loss" ? C.neg : C.flat,
                      }}
                    />
                    <span style={{ fontSize: 12.5, color: C.mute, whiteSpace: "nowrap" }}>
                      {dt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </span>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      color: kind === "win" ? C.pos : kind === "loss" ? C.neg : C.flat,
                    }}
                  >
                    {money(d.net)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <AccountAction
        action={action}
        onUpgrade={onUpgrade}
        onPayout={onPayout}
        onRetire={onRetire}
      />

      <div
        className="card"
        style={{
          marginTop: action ? 0 : "auto",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          padding: 16,
          borderRadius: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div
            style={{
              fontFamily: MONO,
              fontSize: 9,
              letterSpacing: 1.3,
              textTransform: "uppercase",
              color: C.faint,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {account && isVirtual(account.id) ? account.broker : "Account balance"}
          </div>
          {account ? <PhaseBadge account={account} /> : null}
        </div>

        <div style={{ fontFamily: MONO, fontSize: 23, fontWeight: 500, letterSpacing: -0.6 }}>
          {/* Sign leads the currency symbol — `-$88`, not `$-88`. */}
          {balance < 0 ? "-" : ""}${Math.abs(Math.round(balance)).toLocaleString("en-US")}
        </div>

        {/* A hairline split of green against red days, so the card carries a
            little information rather than just a number. */}
        <Split days={days} band={breakevenBand} />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            fontSize: 11.5,
          }}
        >
          <span style={{ color: colorFor(all.net), fontWeight: 600 }}>{money(all.net)}</span>
          <span style={{ color: C.faint }}>
            {all.days} {all.days === 1 ? "day" : "days"}
          </span>
        </div>

        {account?.broker ? (
          <div
            style={{
              borderTop: `1px solid ${C.line}`,
              paddingTop: 11,
              fontSize: 11.5,
              color: C.fainter,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {account.broker}
          </div>
        ) : null}

        {account && isVirtual(account.id) ? (
          <div
            style={{
              borderTop: `1px solid ${C.line}`,
              paddingTop: 11,
              fontSize: 11,
              color: C.fainter,
              lineHeight: 1.6,
            }}
          >
            {isAllTime(account.id)
              ? `Every day, screenshot and note across all ${journal.accounts.length} accounts you have ever had — blown and closed ones included.`
              : "The accounts you're still trading. Blown and closed ones are left out."}{" "}
            New entries still go to the account you have set active.
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function Split({ days, band }: { days: { net: number }[]; band: number }) {
  const green = days.filter((d) => dayKind(d.net, band) === "win").length;
  const red = days.filter((d) => dayKind(d.net, band) === "loss").length;
  const total = green + red;
  if (!total) {
    return <div style={{ height: 4, borderRadius: 2, background: C.line2 }} />;
  }
  return (
    <div
      title={`${green} green, ${red} red`}
      style={{ display: "flex", gap: 2, height: 4, borderRadius: 2, overflow: "hidden" }}
    >
      <div style={{ flex: green || 0.0001, background: C.pos, borderRadius: 2 }} />
      <div style={{ flex: red || 0.0001, background: C.neg, borderRadius: 2, opacity: 0.85 }} />
    </div>
  );
}
