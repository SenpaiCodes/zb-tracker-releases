// Shapes shared between the Electron main process and the UI.

import type { ThemeSeed } from "./theme";
import type { AccountRules } from "./propfirms";
import type { Phase } from "./account";

export type TradeDTO = {
  time: string;
  side: "LONG" | "SHORT";
  symbol: string;
  size: number;
  entry: number | null;
  exit: number | null;
  pnl: number;
  fees: number | null;
};

export type ShotDTO = {
  id: string;
  name: string;
  /** File name inside the data directory. */
  file: string;
  /** `app://shot/<file>` — filled in when a snapshot is read. */
  url: string;
};

export type DayDTO = {
  id: string;
  accountId: string;
  date: string; // YYYY-MM-DD
  /**
   * The account phase this session was logged in. Stamped at save time rather
   * than derived from the date, because you can pass an evaluation and then
   * trade the funded account on the same day — and both entries are real.
   * Absent on entries logged before this existed; `dayPhase()` infers those.
   */
  phase?: Phase;
  net: number;
  wins: number;
  losses: number;
  contracts: number;
  note: string;
  tags: string[];
  trades: TradeDTO[];
  shots: ShotDTO[];
};

export type AccountDTO = {
  id: string;
  name: string;
  broker: string;
  /** Balance the account opened at; equals `size` for a prop account. */
  start: number;
  /** Prop firm id, or null for a personal account. */
  firm: string | null;
  /** Plan id within that firm. */
  plan: string | null;
  /** Account size in dollars, when it came from a firm template. */
  size: number | null;
  phase: Phase;
  rules: AccountRules;
  /** Date the evaluation was cleared; the funded balance starts after it. */
  passedOn: string | null;
  blownOn: string | null;
  createdAt: string | null;
  /**
   * Retired: hidden from the switcher and Settings, but its days are kept for
   * good so All time stays a complete record. Only an explicit delete in
   * Settings actually destroys anything.
   */
  archived: boolean;
  /** Money actually withdrawn from this account, newest last. */
  payouts: PayoutDTO[];
};

export type PayoutDTO = {
  id: string;
  /** YYYY-MM-DD the payout was requested. */
  date: string;
  amount: number;
  /**
   * Ids of the sessions this payout consumed — every one that had been logged
   * when it was requested.
   *
   * Firms restart the winning-day count at each payout, and the day you request
   * on doesn't carry over either. Working that out by comparing dates breaks as
   * soon as an entry is dated ahead of the payout, so the entries themselves are
   * recorded instead. Absent on payouts taken before this existed.
   */
  consumed?: string[];
};

export type Journal = {
  accounts: AccountDTO[];
  activeAccountId: string | null;
  /** The quick-pick tag palette shown on the entry form, editable in Settings. */
  presetTags: string[];
  /** Chosen colour theme; `custom` is null until the user edits one. */
  theme: { preset: string; custom: ThemeSeed | null };
  /** Dollars either side of zero that still count as a breakeven day. */
  breakevenBand: number;
  days: DayDTO[];
  /** Total size on disk of the stored screenshots. */
  storageBytes: number;
  /** Where the journal lives, shown on the Settings page. */
  dataDir: string;
  /** Set when this install adopted a previous version's data on first run. */
  migratedFrom: string | null;
};

/** What the New-entry form hands to the store. */
export type DayInput = {
  date: string;
  net: number;
  wins: number;
  losses: number;
  contracts: number;
  note: string;
  tags: string[];
  trades: TradeDTO[];
  /** data: URLs — downscaled before they are written to disk. */
  shots: { name: string; data: string }[];
  /**
   * Extra accounts the same session was copy-traded on. The day is written to
   * each of them as well, so every account carries its own copy.
   */
  copyTo?: string[];
};
