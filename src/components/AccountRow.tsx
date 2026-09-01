import { useState } from "react";
import type { AccountDTO, Journal } from "../lib/types";
import { colorFor, money } from "../lib/format";
import { accountStatus, phaseLabel, type Phase } from "../lib/account";
import { FIRMS, findPlan, rulesFor, sizeLabel, type AccountRules } from "../lib/propfirms";
import { store, type AccountInput } from "../lib/store";
import { C, MONO, caption } from "./ui";

// A prop account carries a lot more than a name: firm, plan, size and the four
// rules that decide whether it is alive. The row stays compact and opens for
// the detail, so a list of six accounts is still readable.

type Props = {
  journal: Journal;
  account: AccountDTO;
  commit: (fn: () => Promise<Journal>) => Promise<Journal | null>;
};

export function AccountRow({ journal, account, commit }: Props) {
  const [open, setOpen] = useState(false);
  const on = account.id === journal.activeAccountId;
  const st = accountStatus(account, journal.days, journal.breakevenBand ?? 0);
  const days = journal.days.filter((d) => d.accountId === account.id);

  const patch = (p: Parameters<typeof store.patchAccount>[1]) =>
    commit(() => store.patchAccount(account.id, p));

  return (
    <div
      style={{
        border: `1px solid ${on ? C.dash : C.line3}`,
        borderRadius: 11,
        background: on ? C.raised : "transparent",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: ROW_COLUMNS,
          alignItems: "center",
          gap: 12,
          padding: "11px 14px",
        }}
      >
        <button
          onClick={() => patch({ active: true })}
          title="Set active"
          style={{
            width: 13,
            height: 13,
            padding: 0,
            borderRadius: "50%",
            border: `1px solid ${on ? C.accent : C.edge}`,
            background: on ? C.accent : "transparent",
            cursor: "pointer",
          }}
        />

        <input
          type="text"
          defaultValue={account.name}
          onBlur={(e) => e.target.value !== account.name && patch({ name: e.target.value })}
          className="hov-border"
          style={{
            minWidth: 0,
            width: "100%",
            background: "transparent",
            border: "1px solid transparent",
            borderRadius: 7,
            padding: "5px 7px",
            color: C.text,
            fontSize: 13,
            fontWeight: 600,
          }}
        />

        <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          <PhaseBadge account={account} />
          <span
            style={{
              fontSize: 11.5,
              color: C.fainter,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {account.firm
              ? [account.size ? sizeLabel(account.size) : "", findPlan(account.firm, account.plan)?.name]
                  .filter(Boolean)
                  .join(" · ")
              : account.broker || "Personal"}
          </span>
        </span>

        <span style={{ fontFamily: MONO, fontSize: 12.5, textAlign: "right", color: C.dim }}>
          ${Math.round(st.balance).toLocaleString("en-US")}
        </span>

        <span
          style={{
            fontFamily: MONO,
            fontSize: 12.5,
            textAlign: "right",
            color: colorFor(st.phaseNet),
          }}
        >
          {money(st.phaseNet)}
        </span>

        <span
          style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}
        >
          <span style={{ fontSize: 11, color: C.fainter }}>{days.length}d</span>
          <button
            onClick={() => setOpen((v) => !v)}
            className="hov-raised"
            aria-expanded={open}
            title="Rules and settings"
            style={{
              border: `1px solid ${C.line2}`,
              background: "transparent",
              color: C.faint,
              borderRadius: 7,
              width: 24,
              height: 22,
              cursor: "pointer",
              fontSize: 11,
              lineHeight: 1,
            }}
          >
            {open ? "–" : "+"}
          </button>
        </span>
      </div>

      {open ? (
        <div
          style={{
            borderTop: `1px solid ${C.line3}`,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 14,
            background: C.field,
          }}
        >
          <FirmPicker
            firm={account.firm}
            plan={account.plan}
            size={account.size}
            onChange={(next) => patch(next)}
          />

          {account.firm ? (
            <RuleFields rules={account.rules} onChange={(rules) => patch({ rules })} />
          ) : (
            <label style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 200 }}>
              <span style={{ fontSize: 11.5, color: C.mute2 }}>Starting balance</span>
              <input
                type="text"
                defaultValue={account.start === 0 ? "" : String(account.start)}
                onBlur={(e) => patch({ start: e.target.value })}
                style={smallField}
              />
            </label>
          )}

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
              borderTop: `1px solid ${C.line3}`,
              paddingTop: 12,
            }}
          >
            {account.firm ? (
              <>
                <span style={{ fontSize: 11.5, color: C.fainter, marginRight: 4 }}>
                  Status is worked out from your logged days. Override it:
                </span>
                {(["eval", "funded", "blown"] as Phase[]).map((ph) => (
                  <button
                    key={ph}
                    onClick={() => patch({ phase: ph })}
                    className="hov-raised"
                    style={{
                      ...pill,
                      borderColor: account.phase === ph ? C.accent : C.line2,
                      color: account.phase === ph ? C.text : C.faint,
                    }}
                  >
                    {ph === "eval" ? "Reset to evaluation" : ph === "funded" ? "Funded" : "Blown"}
                  </button>
                ))}
              </>
            ) : null}
            <button
              onClick={() => commit(() => store.deleteAccount(account.id))}
              className="hov-danger"
              style={{ ...pill, borderColor: "var(--danger-edge)", color: "var(--danger-ink)" }}
            >
              Delete account
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Kept in one place so the list header lines up with the rows beneath it. */
export const ROW_COLUMNS = "18px minmax(0, 1.3fr) minmax(0, 1.5fr) 104px 104px 68px";

/** Column captions, so the two right-hand figures aren't a guess. */
export function AccountListHeader() {
  const cell: React.CSSProperties = { ...caption(9, 1.1), textAlign: "right" };
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: ROW_COLUMNS,
        alignItems: "center",
        gap: 12,
        padding: "0 14px 2px",
      }}
    >
      <span />
      <span style={caption(9, 1.1)}>Account</span>
      <span style={caption(9, 1.1)}>Plan</span>
      <span style={cell}>Balance</span>
      <span style={cell}>P&amp;L</span>
      <span />
    </div>
  );
}

export function PhaseBadge({ account }: { account: AccountDTO }) {
  if (!account.firm) return null;
  const tone =
    account.phase === "blown"
      ? C.neg
      : account.phase === "funded" || account.phase === "passed"
        ? C.pos
        : C.amber;
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 9,
        letterSpacing: 0.8,
        textTransform: "uppercase",
        color: tone,
        border: `1px solid ${tone}`,
        borderRadius: 999,
        padding: "2px 7px",
        whiteSpace: "nowrap",
      }}
    >
      {phaseLabel(account)}
    </span>
  );
}

/** Firm → plan → size, each narrowing the next, with the rules following. */
export function FirmPicker({
  firm,
  plan,
  size,
  onChange,
}: {
  firm: string | null;
  plan: string | null;
  size: number | null;
  onChange: (next: {
    firm: string | null;
    plan: string | null;
    size: number | null;
    rules: AccountRules;
    phase?: Phase;
  }) => void;
}) {
  const currentFirm = FIRMS.find((f) => f.id === firm) || null;
  const currentPlan = currentFirm?.plans.find((p) => p.id === plan) || null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <label style={fieldCol}>
          <span style={labelText}>Prop firm</span>
          <select
            value={firm || ""}
            onChange={(e) => {
              const f = FIRMS.find((x) => x.id === e.target.value) || null;
              const p = f?.plans[0] || null;
              const sz = p?.sizes[0] ?? null;
              onChange({
                firm: f?.id ?? null,
                plan: p?.id ?? null,
                size: sz,
                rules: rulesFor(f?.id ?? null, p?.id ?? null, sz ?? 0),
                phase: p ? (p.startsFunded ? "funded" : "eval") : "funded",
              });
            }}
            style={select}
          >
            <option value="">Personal account</option>
            {FIRMS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>

        {currentFirm ? (
          <label style={fieldCol}>
            <span style={labelText}>Account type</span>
            <select
              value={plan || ""}
              onChange={(e) => {
                const p = currentFirm.plans.find((x) => x.id === e.target.value) || null;
                const sz = p?.sizes.includes(size ?? 0) ? size : (p?.sizes[0] ?? null);
                onChange({
                  firm: currentFirm.id,
                  plan: p?.id ?? null,
                  size: sz ?? null,
                  rules: rulesFor(currentFirm.id, p?.id ?? null, sz ?? 0),
                  phase: p ? (p.startsFunded ? "funded" : "eval") : "eval",
                });
              }}
              style={select}
            >
              {currentFirm.plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {currentPlan ? (
          <label style={fieldCol}>
            <span style={labelText}>Account size</span>
            <select
              value={String(size ?? "")}
              onChange={(e) => {
                const sz = Number(e.target.value);
                onChange({
                  firm: currentFirm!.id,
                  plan: currentPlan.id,
                  size: sz,
                  rules: rulesFor(currentFirm!.id, currentPlan.id, sz),
                });
              }}
              style={select}
            >
              {currentPlan.sizes.map((sz) => (
                <option key={sz} value={sz}>
                  {sizeLabel(sz)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {currentPlan?.note ? (
        <div style={{ fontSize: 11.5, color: C.fainter, lineHeight: 1.6 }}>{currentPlan.note}</div>
      ) : null}
    </div>
  );
}

/** Every rule stays editable — the presets are a starting point, not gospel. */
export function RuleFields({
  rules,
  onChange,
}: {
  rules: AccountRules;
  onChange: (r: AccountRules) => void;
}) {
  const num = (key: keyof AccountRules, label: string, suffix?: string) => (
    <label style={fieldCol} key={key}>
      <span style={labelText}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="text"
          defaultValue={String(rules[key] ?? 0)}
          onBlur={(e) => onChange({ ...rules, [key]: Number(e.target.value) || 0 })}
          style={smallField}
        />
        {suffix ? <span style={{ fontSize: 11, color: C.fainter }}>{suffix}</span> : null}
      </span>
    </label>
  );

  const pay = (key: keyof AccountRules["payout"], label: string, suffix?: string) => (
    <label style={fieldCol} key={key}>
      <span style={labelText}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="text"
          defaultValue={String(rules.payout?.[key] ?? 0)}
          onBlur={(e) =>
            onChange({
              ...rules,
              payout: { ...rules.payout, [key]: Number(e.target.value) || 0 },
            })
          }
          style={{ ...smallField, width: 104 }}
        />
        {suffix ? <span style={{ fontSize: 11, color: C.fainter }}>{suffix}</span> : null}
      </span>
    </label>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={caption()}>Rules</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {num("profitTarget", "Profit target", "$")}
        {num("maxLoss", "Max loss / drawdown", "$")}
        {num("dailyLoss", "Daily loss limit", "$")}
        {num("consistencyPct", "Consistency", "%")}
        <label style={fieldCol}>
          <span style={labelText}>Drawdown</span>
          <select
            value={rules.drawdownMode}
            onChange={(e) =>
              onChange({ ...rules, drawdownMode: e.target.value as AccountRules["drawdownMode"] })
            }
            style={select}
          >
            <option value="eod">Trailing (end of day)</option>
            <option value="intraday">Trailing (intraday)</option>
            <option value="static">Static</option>
          </select>
        </label>
      </div>
      <label
        style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: C.mute2 }}
      >
        <input
          type="checkbox"
          checked={rules.trailCapsAtStart}
          onChange={(e) => onChange({ ...rules, trailCapsAtStart: e.target.checked })}
        />
        Drawdown stops trailing once it reaches the starting balance
      </label>
      <div style={caption()}>Payouts</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {pay("minWinDays", "Winning days needed")}
        {pay("minWinDay", "Counts as a winning day", "$")}
        {pay("buffer", "Buffer held over drawdown", "$")}
        {pay("minPayout", "Smallest request", "$")}
        {pay("maxPayout", "Largest request", "$")}
        {pay("maxPayoutPct", "Or share of balance", "%")}
        {pay("maxProfitPct", "Or share of profit", "%")}
        {pay("split", "Your profit split", "%")}
      </div>

      <div style={{ fontSize: 11.5, color: C.fainter, lineHeight: 1.65 }}>
        These are filled from a template and firms change their specs often — check them against
        your own dashboard. Everything here is editable and only affects what this app shows. A 0
        means the rule does not apply.
      </div>
    </div>
  );
}

/** The add-account form; same pickers, so a new account arrives fully specified. */
export function AddAccount({
  onAdd,
}: {
  onAdd: (input: AccountInput) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [spec, setSpec] = useState<{
    firm: string | null;
    plan: string | null;
    size: number | null;
    rules: AccountRules;
    phase: Phase;
  }>({
    firm: null,
    plan: null,
    size: null,
    rules: rulesFor(null, null, 0),
    phase: "funded",
  });
  const [start, setStart] = useState("");

  const suggested =
    spec.firm && spec.size
      ? `${FIRMS.find((f) => f.id === spec.firm)?.name ?? ""} ${sizeLabel(spec.size)}`.trim()
      : "";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        borderTop: `1px solid ${C.line3}`,
        paddingTop: 16,
      }}
    >
      <div style={caption()}>Add an account</div>

      <FirmPicker
        firm={spec.firm}
        plan={spec.plan}
        size={spec.size}
        onChange={(next) =>
          setSpec({
            firm: next.firm,
            plan: next.plan,
            size: next.size,
            rules: next.rules,
            phase: next.phase ?? (next.firm ? "eval" : "funded"),
          })
        }
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
        <label style={{ ...fieldCol, flex: 1, minWidth: 200 }}>
          <span style={labelText}>Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={suggested || "Account name"}
            style={{ ...smallField, width: "100%" }}
          />
        </label>

        {!spec.firm ? (
          <label style={fieldCol}>
            <span style={labelText}>Starting balance</span>
            <input
              type="text"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              placeholder="25000"
              style={smallField}
            />
          </label>
        ) : (
          <span style={{ fontSize: 11.5, color: C.fainter, paddingBottom: 9 }}>
            Balance starts at {spec.size ? sizeLabel(spec.size) : "the account size"}.
          </span>
        )}

        <button
          onClick={async () => {
            const finalName = name.trim() || suggested;
            if (!finalName) return;
            await onAdd({
              name: finalName,
              broker: "",
              start: spec.firm ? String(spec.size ?? 0) : start,
              firm: spec.firm,
              plan: spec.plan,
              size: spec.size,
              rules: spec.rules,
              phase: spec.phase,
            });
            setName("");
            setStart("");
          }}
          className="hov-raised"
          style={{
            height: 36,
            padding: "0 16px",
            border: `1px solid ${C.edge}`,
            background: "transparent",
            color: C.text,
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Add account
        </button>
      </div>
    </div>
  );
}

const fieldCol: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
const labelText: React.CSSProperties = { fontSize: 11.5, color: C.mute2 };

const smallField: React.CSSProperties = {
  minWidth: 0,
  width: 128,
  background: C.bg,
  border: `1px solid ${C.line2}`,
  borderRadius: 8,
  padding: "8px 10px",
  color: C.text,
  fontFamily: MONO,
  fontSize: 12.5,
};

const select: React.CSSProperties = {
  minWidth: 150,
  background: C.bg,
  border: `1px solid ${C.line2}`,
  borderRadius: 8,
  padding: "8px 10px",
  color: C.text,
  fontSize: 13,
  cursor: "pointer",
};

const pill: React.CSSProperties = {
  height: 30,
  padding: "0 12px",
  border: "1px solid",
  background: "transparent",
  borderRadius: 999,
  cursor: "pointer",
  fontSize: 12,
};
