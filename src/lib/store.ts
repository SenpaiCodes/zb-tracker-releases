import type { AccountDTO, DayInput, Journal } from "./types";
import type { ThemeChoice } from "./theme";
import type { AccountRules } from "./propfirms";
import type { Phase } from "./account";

export type AccountInput = {
  name: string;
  broker?: string;
  start?: string | number;
  firm?: string | null;
  plan?: string | null;
  size?: number | null;
  rules?: AccountRules;
  phase?: Phase;
};

export type AccountPatch = Partial<AccountInput> & {
  active?: boolean;
  passedOn?: string | null;
  blownOn?: string | null;
};

// Thin wrapper over the bridge the preload script exposes. Every call returns a
// complete snapshot of the journal, so the UI never merges partial updates.

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

type Bridge = {
  read: () => Promise<Result<Journal>>;
  saveDay: (input: DayInput) => Promise<Result<Journal>>;
  patchDay: (
    id: string,
    patch: { note?: string; tags?: string[]; shots?: { name: string; data: string }[] },
  ) => Promise<Result<Journal>>;
  deleteDay: (id: string) => Promise<Result<Journal>>;
  addAccount: (input: AccountInput) => Promise<Result<Journal>>;
  patchAccount: (id: string, patch: AccountPatch) => Promise<Result<Journal>>;
  deleteAccount: (id: string) => Promise<Result<Journal>>;
  archiveAccount: (id: string) => Promise<Result<Journal>>;
  addPayout: (id: string, amount: number, date: string) => Promise<Result<Journal>>;
  deletePayout: (id: string, payoutId: string) => Promise<Result<Journal>>;
  restoreAccount: (id: string) => Promise<Result<Journal>>;
  setTheme: (theme: ThemeChoice) => Promise<Result<Journal>>;
  setBreakeven: (value: number) => Promise<Result<Journal>>;
  setPhase: (id: string, phase: Phase, on: string | null) => Promise<Result<Journal>>;
  addTag: (label: string) => Promise<Result<Journal>>;
  renameTag: (from: string, to: string) => Promise<Result<Journal>>;
  deleteTag: (label: string) => Promise<Result<Journal>>;
  erase: () => Promise<Result<Journal>>;
  exportJournal: () => Promise<Result<{ saved: boolean; filePath?: string }>>;
  importJournal: () => Promise<
    Result<{ imported: boolean; count?: number; snapshot?: Journal }>
  >;
  minimize: () => Promise<Result<boolean>>;
  toggleMaximize: () => Promise<Result<boolean>>;
  isMaximized: () => Promise<Result<boolean>>;
  closeWindow: () => Promise<Result<boolean>>;
  onMaximized: (fn: (v: boolean) => void) => () => void;
  revealData: () => Promise<Result<boolean>>;
  quit: () => Promise<Result<boolean>>;
};

declare global {
  interface Window {
    zbtracker?: Bridge;
  }
}

export class StoreError extends Error {}

/** True when running inside the desktop shell rather than a plain browser tab. */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && !!window.zbtracker;
}

function bridge(): Bridge {
  if (!window.zbtracker) {
    throw new StoreError("The desktop bridge isn't available.");
  }
  return window.zbtracker;
}

async function unwrap<T>(p: Promise<Result<T>>): Promise<T> {
  const res = await p;
  if (!res.ok) throw new StoreError(res.error);
  return res.value;
}

/** Screenshots are files on disk; the UI refers to them through the app scheme. */
function withUrls(journal: Journal): Journal {
  return {
    ...journal,
    days: journal.days.map((d) => ({
      ...d,
      shots: (d.shots || []).map((s) => ({ ...s, url: `app://shot/${encodeURIComponent(s.file)}` })),
    })),
  };
}

export const store = {
  read: async () => withUrls(await unwrap(bridge().read())),
  saveDay: async (input: DayInput) => withUrls(await unwrap(bridge().saveDay(input))),
  patchDay: async (
    id: string,
    patch: { note?: string; tags?: string[]; shots?: { name: string; data: string }[] },
  ) => withUrls(await unwrap(bridge().patchDay(id, patch))),
  deleteDay: async (id: string) => withUrls(await unwrap(bridge().deleteDay(id))),

  addAccount: async (input: AccountInput) =>
    withUrls(await unwrap(bridge().addAccount(input))),
  patchAccount: async (id: string, patch: AccountPatch) =>
    withUrls(await unwrap(bridge().patchAccount(id, patch))),
  deleteAccount: async (id: string) => withUrls(await unwrap(bridge().deleteAccount(id))),
  archiveAccount: async (id: string) => withUrls(await unwrap(bridge().archiveAccount(id))),
  addPayout: async (id: string, amount: number, date: string) =>
    withUrls(await unwrap(bridge().addPayout(id, amount, date))),
  deletePayout: async (id: string, payoutId: string) =>
    withUrls(await unwrap(bridge().deletePayout(id, payoutId))),
  restoreAccount: async (id: string) => withUrls(await unwrap(bridge().restoreAccount(id))),

  setTheme: async (theme: ThemeChoice) => withUrls(await unwrap(bridge().setTheme(theme))),
  setBreakeven: async (value: number) => withUrls(await unwrap(bridge().setBreakeven(value))),
  setPhase: async (id: string, phase: Phase, on: string | null) =>
    withUrls(await unwrap(bridge().setPhase(id, phase, on))),
  addTag: async (label: string) => withUrls(await unwrap(bridge().addTag(label))),
  renameTag: async (from: string, to: string) =>
    withUrls(await unwrap(bridge().renameTag(from, to))),
  deleteTag: async (label: string) => withUrls(await unwrap(bridge().deleteTag(label))),

  erase: async () => withUrls(await unwrap(bridge().erase())),

  exportJournal: () => unwrap(bridge().exportJournal()),
  importJournal: async () => {
    const res = await unwrap(bridge().importJournal());
    return res.snapshot ? { ...res, snapshot: withUrls(res.snapshot) } : res;
  },
  minimize: () => unwrap(bridge().minimize()).catch(() => false),
  toggleMaximize: () => unwrap(bridge().toggleMaximize()).catch(() => false),
  isMaximized: () => unwrap(bridge().isMaximized()).catch(() => false),
  closeWindow: () => unwrap(bridge().closeWindow()).catch(() => false),
  onMaximizeChange: (fn: (v: boolean) => void) => bridge().onMaximized(fn),
  revealData: () => unwrap(bridge().revealData()),
  quit: () => unwrap(bridge().quit()),
};

export type { AccountDTO };

/**
 * Keeps a screenshot exactly as it was taken.
 *
 * These are chart screenshots people zoom into to re-read a wick or a level, so
 * quality is the whole point of storing them. The original bytes go to disk
 * untouched — no re-encode, no resample, original format.
 *
 * The only exception is an absurdly large file, which is downscaled rather than
 * refused: a 4K screenshot is a couple of megabytes, so anything past the cap is
 * a photo or a poster, not a chart.
 */
const KEEP_ORIGINAL_UP_TO = 24 * 1024 * 1024;

export function readShot(file: File): Promise<string> {
  if (file.size > KEEP_ORIGINAL_UP_TO) return shrink(file, 3840, 0.95);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("That file could not be read"));
    reader.readAsDataURL(file);
  });
}

/**
 * Re-encodes an image at a bounded width. Only used as the safety valve above —
 * screenshots are otherwise stored as they arrived.
 */
export function shrink(file: File, maxWidth = 3840, quality = 0.95): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const W = img.naturalWidth || img.width;
      const H = img.naturalHeight || img.height;
      const scale = Math.min(1, maxWidth / W);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(W * scale));
      canvas.height = Math.max(1, Math.round(H * scale));
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as an image"));
    };
    img.src = url;
  });
}
