// Theming.
//
// A theme is only five seed colours. Every other token — panels, borders, the
// five tiers of muted text — is derived from them with `color-mix`, which is why
// a light preset works without a second set of definitions: mixing the surface
// toward the foreground lightens a dark theme and darkens a light one.

export type ThemeSeed = {
  /** Page background. */
  bg: string;
  /** Primary text; also the mix partner every derived tone is built from. */
  fg: string;
  /** Profit. */
  pos: string;
  /** Loss. */
  neg: string;
  /** Selection, focus, the active nav dot. */
  accent: string;
};

export type ThemePreset = {
  id: string;
  name: string;
  /** One-line description shown under the name in Settings. */
  blurb: string;
  seed: ThemeSeed;
};

export const PRESETS: ThemePreset[] = [
  // --- dark -----------------------------------------------------------------
  {
    id: "terminal",
    name: "Terminal",
    blurb: "Near-black with a mint tape",
    seed: { bg: "#0b0d0f", fg: "#e9ebed", pos: "#3ecf8e", neg: "#f2545b", accent: "#3ecf8e" },
  },
  {
    id: "carbon",
    name: "Carbon",
    blurb: "True black, for OLED",
    seed: { bg: "#000000", fg: "#eceff1", pos: "#39e08a", neg: "#ff5566", accent: "#39e08a" },
  },
  {
    id: "midnight",
    name: "Midnight",
    blurb: "Deep navy, cool highlights",
    seed: { bg: "#0a0f1a", fg: "#e6ecf5", pos: "#38d9c0", neg: "#ff5c7c", accent: "#5b8cff" },
  },
  {
    id: "ocean",
    name: "Ocean",
    blurb: "Deep teal and seafoam",
    seed: { bg: "#071316", fg: "#dff0ef", pos: "#42e0b0", neg: "#ff6b6b", accent: "#2fb6c9" },
  },
  {
    id: "nord",
    name: "Nord",
    blurb: "Cool slate, low glare",
    seed: { bg: "#2e3440", fg: "#eceff4", pos: "#a3be8c", neg: "#bf616a", accent: "#88c0d0" },
  },
  {
    id: "forest",
    name: "Forest",
    blurb: "Dark pine, soft green",
    seed: { bg: "#0b1310", fg: "#e3ece6", pos: "#5fd08a", neg: "#e2685f", accent: "#6fbf8f" },
  },
  {
    id: "ember",
    name: "Ember",
    blurb: "Warm charcoal and amber",
    seed: { bg: "#12100e", fg: "#f0e9e2", pos: "#8fd14f", neg: "#ff6b45", accent: "#f0a03c" },
  },
  {
    id: "violet",
    name: "Violet",
    blurb: "Plum dark with electric edges",
    seed: { bg: "#100b16", fg: "#ece7f2", pos: "#5cf2b0", neg: "#ff5fa2", accent: "#a06bff" },
  },
  {
    id: "graphite",
    name: "Graphite",
    blurb: "Neutral grey, minimum colour",
    seed: { bg: "#131414", fg: "#e8e8e8", pos: "#7bd88f", neg: "#e5686f", accent: "#9aa0a6" },
  },
  {
    id: "mono",
    name: "Mono",
    blurb: "Greyscale, colour only for P&L",
    seed: { bg: "#141414", fg: "#f2f2f2", pos: "#cfcfcf", neg: "#7a7a7a", accent: "#f2f2f2" },
  },

  // --- light ----------------------------------------------------------------
  {
    id: "creme",
    name: "Crème",
    blurb: "Warm cream, muted chart tones",
    seed: { bg: "#f0e9db", fg: "#2b2721", pos: "#3f7d57", neg: "#b4483f", accent: "#a9762f" },
  },
  {
    id: "linen",
    name: "Linen",
    blurb: "Softer cream, sage and clay",
    seed: { bg: "#f7f2e8", fg: "#33302b", pos: "#4c8a63", neg: "#c05b4d", accent: "#7a8b5a" },
  },
  {
    id: "paper",
    name: "Paper",
    blurb: "Light, for a bright room",
    seed: { bg: "#f6f7f8", fg: "#15181b", pos: "#12855a", neg: "#c8323c", accent: "#12855a" },
  },
  {
    id: "frost",
    name: "Frost",
    blurb: "Cool light, blue-grey",
    seed: { bg: "#eef2f6", fg: "#16202b", pos: "#0f7a5a", neg: "#c03a4b", accent: "#2f6fd0" },
  },
];

export const DEFAULT_PRESET = "terminal";

export type ThemeChoice = {
  preset: string;
  custom: ThemeSeed;
};

export const DEFAULT_THEME: ThemeChoice = {
  preset: DEFAULT_PRESET,
  custom: { ...PRESETS[0].seed },
};

export function seedFor(theme: ThemeChoice): ThemeSeed {
  if (theme.preset === "custom") return theme.custom;
  return (PRESETS.find((p) => p.id === theme.preset) || PRESETS[0]).seed;
}

/** True when the surface is dark, so the UI can pick a matching glow strength. */
export function isDark(seed: ThemeSeed): boolean {
  const hex = seed.bg.replace("#", "");
  const n = parseInt(hex.length === 3 ? hex.replace(/./g, "$&$&") : hex, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

/**
 * Writes the seeds onto the document. Every derived token is a `color-mix` in
 * the stylesheet, so only these five need setting.
 */
export function applyTheme(theme: ThemeChoice): void {
  const seed = seedFor(theme);
  const root = document.documentElement;
  root.style.setProperty("--bg", seed.bg);
  root.style.setProperty("--fg", seed.fg);
  root.style.setProperty("--pos", seed.pos);
  root.style.setProperty("--neg", seed.neg);
  root.style.setProperty("--accent", seed.accent);
  root.dataset.mode = isDark(seed) ? "dark" : "light";
  root.style.colorScheme = isDark(seed) ? "dark" : "light";
}
