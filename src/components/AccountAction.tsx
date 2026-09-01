import { useEffect, useRef, useState } from "react";
import { money } from "../lib/format";
import { C, MONO } from "./ui";

// The one thing an account most wants you to do right now, in a single slot
// above the balance card: convert a cleared evaluation, take a payout, or close
// a blown account out. Only ever one of them is on offer.

export type Action =
  | { kind: "upgrade" }
  /** Ready: `available` is the largest request every firm rule allows. */
  | { kind: "payout"; available: number; minimum: number; buffer: number }
  /** Not there yet — the reasons, in the order they bite. */
  | { kind: "payout-waiting"; winDays: number; needed: number; blockers: string[] }
  | { kind: "retire" }
  | null;

type Props = {
  action: Action;
  onUpgrade: () => void;
  /** Amount actually requested on the firm's site. */
  onPayout: (amount: number) => void;
  onRetire: () => void;
};

export default function AccountAction({ action, onUpgrade, onPayout, onRetire }: Props) {
  const [asking, setAsking] = useState(false);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (asking) field.current?.focus();
  }, [asking]);

  useEffect(() => {
    setAsking(false);
    setAmount("");
    setError("");
  }, [action?.kind]);

  if (!action) return null;

  if (action.kind === "upgrade") {
    return (
      <Button
        tone={C.pos}
        soft={C.posSoft}
        onClick={onUpgrade}
        title="Upgrade to funded"
        sub="Target cleared — claim it"
      />
    );
  }

  // Not eligible yet: show the progress rather than a button that does nothing.
  if (action.kind === "payout-waiting") {
    return (
      <div
        style={{
          marginTop: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: "12px 14px",
          border: `1px solid ${C.line2}`,
          borderRadius: 12,
          background: C.raised,
        }}
      >
        <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.mute }}>Payout progress</span>
          {action.needed ? (
            <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.faint }}>
              {action.winDays}/{action.needed}
            </span>
          ) : null}
        </span>

        {action.needed ? (
          <span style={{ display: "flex", gap: 3 }}>
            {Array.from({ length: action.needed }, (_, i) => (
              <span
                key={i}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  background: i < action.winDays ? C.pos : C.line2,
                }}
              />
            ))}
          </span>
        ) : null}

        {action.blockers.map((b) => (
          <span key={b} style={{ fontSize: 10.5, color: C.fainter, lineHeight: 1.55 }}>
            {b}
          </span>
        ))}
      </div>
    );
  }

  if (action.kind === "retire") {
    return (
      <Button
        tone={C.neg}
        soft={C.negSoft}
        onClick={onRetire}
        title="Close this account"
        sub="Blown — clear it out"
      />
    );
  }

  // --- payout ---------------------------------------------------------------
  // The app has no idea what a firm actually paid, so it asks for the figure
  // requested on their site and takes exactly that off the journal's balance.
  if (!asking) {
    return (
      <Button
        tone={C.accent}
        soft={C.accentSoft}
        onClick={() => setAsking(true)}
        title="Take a payout"
        sub={`up to ${money(action.available)}`}
      />
    );
  }

  const submit = () => {
    const value = Math.round(Number(amount.replace(/[$,\s]/g, "")) || 0);
    if (!(value > 0)) return setError("Enter the amount you requested.");
    if (action.minimum && value < action.minimum) {
      return setError(`The firm's minimum request is ${money(action.minimum)}.`);
    }
    if (value > action.available) {
      return setError(
        action.buffer
          ? `${money(action.available)} is the most you can take and still keep the ${money(action.buffer)} buffer above your drawdown.`
          : `That's more than the ${money(action.available)} available.`,
      );
    }
    setAsking(false);
    setAmount("");
    onPayout(value);
  };

  return (
    <div
      style={{
        marginTop: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 9,
        padding: 14,
        border: `1.5px solid ${C.accent}`,
        borderRadius: 12,
        background: C.accentSoft,
        animation: "riseIn 160ms ease both",
      }}
    >
      <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>How much?</span>
      <span style={{ fontSize: 10.5, color: C.mute2, lineHeight: 1.55 }}>
        The amount you requested on the firm&rsquo;s site. It comes straight off your balance here
        — and off your drawdown cushion with it.
      </span>
      {action.buffer ? (
        <span style={{ fontSize: 10.5, color: C.amber, lineHeight: 1.55 }}>
          {money(action.available)} max — anything more eats the {money(action.buffer)} buffer the
          firm holds over your drawdown.
        </span>
      ) : null}

      <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ fontFamily: MONO, fontSize: 13, color: C.faint }}>$</span>
        <input
          ref={field}
          type="text"
          inputMode="numeric"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") setAsking(false);
          }}
          placeholder={String(Math.round(action.available))}
          style={{
            minWidth: 0,
            flex: 1,
            background: C.bg,
            border: `1px solid ${error ? C.neg : C.line2}`,
            borderRadius: 8,
            padding: "8px 10px",
            color: C.text,
            fontFamily: MONO,
            fontSize: 13.5,
          }}
        />
      </span>

      {error ? <span style={{ fontSize: 10.5, color: C.neg }}>{error}</span> : null}

      <span style={{ display: "flex", gap: 6 }}>
        <button
          onClick={submit}
          className="upgrade"
          style={{
            flex: 1,
            height: 32,
            border: `1.5px solid ${C.accent}`,
            borderRadius: 9,
            background: "transparent",
            color: C.accent,
            fontSize: 12.5,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Deduct it
        </button>
        <button
          onClick={() => setAsking(false)}
          className="hov-raised"
          style={{
            height: 32,
            padding: "0 11px",
            border: `1px solid ${C.line2}`,
            borderRadius: 9,
            background: "transparent",
            color: C.faint,
            fontSize: 12.5,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </span>
    </div>
  );
}

function Button({
  tone,
  soft,
  title,
  sub,
  onClick,
}: {
  tone: string;
  soft: string;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="upgrade"
      style={
        {
          marginTop: "auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 3,
          padding: "13px 14px",
          border: `1.5px solid ${tone}`,
          borderRadius: 12,
          background: soft,
          color: tone,
          cursor: "pointer",
          textAlign: "center",
          // The pulse and hover glow are drawn from this, so each state keeps
          // its own colour without a class per variant.
          "--glow": tone,
        } as React.CSSProperties
      }
    >
      <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.2 }}>{title}</span>
      <span style={{ fontSize: 10.5, opacity: 0.85 }}>{sub}</span>
    </button>
  );
}
