import type { CSSProperties } from "react";

// The design expresses everything as inline styles on the elements. Those are
// carried over close to verbatim; this module holds the values repeated often
// enough that a constant is clearer than another literal.
//
// Every colour is a CSS variable rather than a hex, so switching theme is one
// write to the document root — see lib/theme.ts.

export const C = {
  bg: "var(--bg)",
  panel: "var(--panel)",
  drawer: "var(--drawer)",
  field: "var(--field)",
  raised: "var(--raised)",
  active: "var(--active)",

  line: "var(--line)",
  line2: "var(--line2)",
  line3: "var(--line3)",
  edge: "var(--edge)",
  dash: "var(--dash)",

  text: "var(--text)",
  dim: "var(--dim)",
  mute: "var(--mute)",
  mute2: "var(--mute2)",
  faint: "var(--faint)",
  fainter: "var(--fainter)",
  faintest: "var(--faintest)",

  pos: "var(--pos)",
  neg: "var(--neg)",
  posSoft: "var(--pos-soft)",
  posEdge: "var(--pos-edge)",
  negSoft: "var(--neg-soft)",
  negEdge: "var(--neg-edge)",
  flat: "var(--flat)",
  flatSoft: "var(--flat-soft)",
  flatEdge: "var(--flat-edge)",
  accent: "var(--accent)",
  accentSoft: "var(--accent-soft)",
  amber: "var(--warn)",
  long: "var(--pos-ink)",
  short: "var(--neg-ink)",
} as const;

export const MONO = "'JetBrains Mono', monospace";

/** Small uppercase mono caption used as a section label throughout the design. */
export function caption(size = 9.5, spacing = 1.2): CSSProperties {
  return {
    fontFamily: MONO,
    fontSize: size,
    letterSpacing: spacing,
    textTransform: "uppercase",
    color: C.faint,
  };
}

export const field: CSSProperties = {
  minWidth: 0,
  width: "100%",
  background: C.field,
  border: `1px solid ${C.line2}`,
  borderRadius: 8,
  padding: "11px 12px",
  color: C.text,
  fontFamily: MONO,
  fontSize: 13,
};

export const textField: CSSProperties = {
  background: C.field,
  border: `1px solid ${C.line2}`,
  borderRadius: 9,
  padding: "12px 13px",
  color: C.text,
  fontSize: 13.5,
};

export const primaryButton: CSSProperties = {
  border: "none",
  background: C.text,
  color: C.bg,
  borderRadius: 9,
  cursor: "pointer",
  fontSize: 13.5,
  fontWeight: 600,
};

/** `url("…")` for a real image, or the design's hatched placeholder when absent. */
export function cssUrl(u: string | null | undefined): string {
  return u
    ? `url("${u}")`
    : "repeating-linear-gradient(45deg, color-mix(in srgb, var(--fg) 4%, var(--bg)) 0 4px, color-mix(in srgb, var(--fg) 8%, var(--bg)) 4px 8px)";
}

/** Formats a signed figure with the sign leading the currency symbol. */
export function signed(n: number): string {
  const s = Math.abs(Math.round(n)).toLocaleString("en-US");
  return `${n < 0 ? "-" : ""}$${s}`;
}
