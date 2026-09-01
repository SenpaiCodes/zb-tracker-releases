import { useEffect, useMemo, useRef } from "react";
import { C, MONO, signed } from "./ui";

// The three moments in an account's life that are worth stopping for: it gets
// funded, it pays you, or it ends. It plays, then waits: the change is applied
// when you dismiss it, so the new number lands with the reveal and nothing
// disappears while you are still reading it.
//
// Everything is CSS keyframes over a particle set generated once — no animation
// library, no per-frame React work. `prefers-reduced-motion` drops the falling
// pieces and keeps the message.

export type CelebrationKind = "funded" | "payout" | "retired";

type Props = {
  kind: CelebrationKind;
  accountName: string;
  /** Funded: the balance it opens at. Payout: the amount taken. */
  amount: number;
  onDone: () => void;
};

type Particle = {
  left: number;
  delay: number;
  duration: number;
  drift: number;
  size: number;
  spin: number;
  tone: string;
  round: boolean;
};

export default function Celebration({ kind, accountName, amount, onDone }: Props) {
  // Held in a ref so a re-render can't apply the change twice.
  const fired = useRef(false);
  const finish = () => {
    if (fired.current) return;
    fired.current = true;
    onDone();
  };

  // Dismissed by hand only — Escape or Enter as well as a click, so it is not a
  // mouse-only exit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copy = COPY[kind];
  const tone = kind === "retired" ? C.mute : kind === "payout" ? C.accent : C.pos;
  const soft = kind === "retired" ? C.raised : kind === "payout" ? C.accentSoft : C.posSoft;
  const edge = kind === "retired" ? C.line2 : kind === "payout" ? C.accent : C.posEdge;

  // Generated once: re-rolling these on every render would restart the fall.
  const particles = useMemo<Particle[]>(() => {
    // A retirement is not a party. It gets a quiet drift, not confetti.
    const count = kind === "retired" ? 18 : 54;
    const tones =
      kind === "payout"
        ? [C.accent, C.pos, C.accent, C.text]
        : kind === "retired"
          ? [C.faint, C.fainter]
          : [C.pos, C.accent, C.pos, C.text, C.pos];
    return Array.from({ length: count }, (_, i) => ({
      left: (i * 97) % 100,
      delay: (i % 13) * 0.13 + Math.random() * (kind === "retired" ? 1.6 : 0.5),
      duration: (kind === "retired" ? 4.4 : 2.6) + ((i * 7) % 11) * 0.16,
      drift: ((i % 7) - 3) * 34,
      size: kind === "payout" ? 7 : 5 + ((i * 3) % 5),
      spin: 240 + ((i * 53) % 360),
      tone: tones[i % tones.length],
      round: kind === "payout",
    }));
  }, [kind]);

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={copy.aria(accountName)}
      onClick={finish}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        cursor: "pointer",
        background: `color-mix(in srgb, ${C.bg} 88%, transparent)`,
        backdropFilter: "blur(3px)",
        animation: "celebIn 380ms ease both",
      }}
    >
      {/* A glow that blooms out from behind the wordmark. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          width: "min(150vw, 1200px)",
          height: "min(150vw, 1200px)",
          borderRadius: "50%",
          background: `radial-gradient(circle, color-mix(in srgb, ${tone} ${
            kind === "retired" ? 14 : 30
          }%, transparent) 0%, transparent 62%)`,
          animation: "celebGlow 5200ms ease-out both",
          pointerEvents: "none",
        }}
      />

      {/* Rings push outward, so the moment has some force to it. A retirement
          gets one slow ring instead of two quick ones. */}
      {(kind === "retired" ? [0] : [0, 1]).map((i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{
            position: "absolute",
            width: 220,
            height: 220,
            borderRadius: "50%",
            border: `2px solid ${tone}`,
            animation: `celebRing ${kind === "retired" ? 3200 : 2100}ms cubic-bezier(.2,.7,.3,1) ${
              i * 420 + 260
            }ms both`,
            pointerEvents: "none",
          }}
        />
      ))}

      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {particles.map((p, i) => (
          <span
            key={i}
            style={
              {
                position: "absolute",
                top: -24,
                left: `${p.left}%`,
                width: p.size,
                height: p.round ? p.size : p.size * 2.1,
                borderRadius: p.round ? "50%" : 1.5,
                background: p.tone,
                opacity: kind === "retired" ? 0.4 : 0.9,
                "--drift": `${p.drift}px`,
                "--spin": `${p.spin}deg`,
                animation: `celebFall ${p.duration}s cubic-bezier(.3,.1,.5,1) ${p.delay}s both`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          textAlign: "center",
          padding: 32,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 66,
            height: 66,
            borderRadius: "50%",
            border: `1.5px solid ${edge}`,
            background: soft,
            boxShadow: `0 0 0 8px color-mix(in srgb, ${tone} 8%, transparent)`,
            animation: "celebPop 700ms cubic-bezier(.16,1.2,.3,1) 180ms both",
          }}
        >
          <Glyph kind={kind} tone={tone} />
        </div>

        <div
          style={{
            fontFamily: MONO,
            fontSize: 10.5,
            letterSpacing: 3.4,
            textTransform: "uppercase",
            color: tone,
            animation: "celebRise 620ms cubic-bezier(.2,.8,.3,1) 420ms both",
          }}
        >
          {copy.eyebrow}
        </div>

        <h1
          style={{
            margin: 0,
            fontSize: "clamp(34px, 5.6vw, 64px)",
            lineHeight: 1.02,
            fontWeight: 700,
            letterSpacing: -2.2,
            animation: "celebRise 700ms cubic-bezier(.2,.8,.3,1) 560ms both",
          }}
        >
          {copy.headline}
        </h1>

        <div
          style={{
            fontSize: 15,
            color: C.mute2,
            maxWidth: 480,
            lineHeight: 1.65,
            animation: "celebRise 700ms cubic-bezier(.2,.8,.3,1) 720ms both",
          }}
        >
          {copy.body(accountName)}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 4,
            padding: "9px 16px",
            borderRadius: 999,
            border: `1px solid ${edge}`,
            background: soft,
            animation: "celebRise 700ms cubic-bezier(.2,.8,.3,1) 880ms both",
          }}
        >
          <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>{copy.stat}</span>
          <span style={{ fontFamily: MONO, fontSize: 17, fontWeight: 500, color: tone }}>
            {signed(amount)}
          </span>
        </div>

        <div
          style={{
            fontSize: 11.5,
            color: C.faintest,
            marginTop: 10,
            animation: "celebRise 700ms ease 2600ms both",
          }}
        >
          Click anywhere to continue
        </div>
      </div>
    </div>
  );
}

const COPY: Record<
  CelebrationKind,
  {
    eyebrow: string;
    headline: string;
    stat: string;
    body: (name: string) => React.ReactNode;
    aria: (name: string) => string;
  }
> = {
  funded: {
    eyebrow: "Evaluation cleared",
    headline: "You’re funded.",
    stat: "BALANCE RESET TO",
    body: (name) => (
      <>
        <strong style={{ color: C.text, fontWeight: 600 }}>{name}</strong> is a funded account now.
        Go get paid.
      </>
    ),
    aria: (name) => `${name} is funded`,
  },
  payout: {
    eyebrow: "Payout requested",
    headline: "Getting paid.",
    stat: "TAKEN OFF",
    body: (name) => (
      <>
        Logged against <strong style={{ color: C.text, fontWeight: 600 }}>{name}</strong>. This is
        the whole point — the account is a tool, and it just did its job.
      </>
    ),
    aria: (name) => `Payout recorded on ${name}`,
  },
  retired: {
    eyebrow: "Account closed",
    headline: "On to the next.",
    stat: "FINISHED AT",
    body: (name) => (
      <>
        <strong style={{ color: C.text, fontWeight: 600 }}>{name}</strong> is done, but every day
        you logged on it stays in your record. That&rsquo;s the part that compounds — the account was
        always replaceable.
      </>
    ),
    aria: (name) => `${name} retired`,
  },
};

function Glyph({ kind, tone }: { kind: CelebrationKind; tone: string }) {
  const common = {
    stroke: tone,
    strokeWidth: 2.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {kind === "funded" ? (
        <path
          d="M5 12.5L10 17.5L19 7"
          {...common}
          pathLength={1}
          style={{ strokeDasharray: 1, animation: "celebCheck 520ms ease-out 480ms both" }}
        />
      ) : kind === "payout" ? (
        <path
          d="M12 4v16M12 20l-5-5M12 20l5-5"
          {...common}
          pathLength={1}
          style={{ strokeDasharray: 1, animation: "celebCheck 520ms ease-out 480ms both" }}
        />
      ) : (
        <path
          d="M4 12h16"
          {...common}
          pathLength={1}
          style={{ strokeDasharray: 1, animation: "celebCheck 620ms ease-out 480ms both" }}
        />
      )}
    </svg>
  );
}
