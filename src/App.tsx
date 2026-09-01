import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AccountDTO, Journal } from "./lib/types";
import { isDesktop, store, StoreError } from "./lib/store";
import { shiftYm, todayIso, todayYm } from "./lib/format";
import { applyTheme, DEFAULT_THEME, type ThemeChoice } from "./lib/theme";
import { accountStatus, dayPhase, detectPhaseChange, evalCleared } from "./lib/account";
import { rulesFor } from "./lib/propfirms";
import {
  accountName,
  allTimeAccount,
  daysForAccount,
  isVirtual,
  liveAccounts,
  pickableAccounts,
  stackAccount,
} from "./lib/stats";
import TitleBar from "./components/TitleBar";
import Launcher from "./components/Launcher";
import Sidebar, { type View } from "./components/Sidebar";
import type { Action } from "./components/AccountAction";
import Dashboard from "./components/Dashboard";
import JournalView from "./components/JournalView";
import NewEntry, { emptyDraft, type Draft } from "./components/NewEntry";
import SettingsView from "./components/SettingsView";
import DayDrawer from "./components/DayDrawer";
import Lightbox from "./components/Lightbox";
import Celebration, { type CelebrationKind } from "./components/Celebration";
import { C } from "./components/ui";

export default function App() {
  const [started, setStarted] = useState(false);
  const [journal, setJournal] = useState<Journal | null>(null);
  const [loadError, setLoadError] = useState("");

  const [view, setView] = useState<View>("dashboard");
  const [ym, setYm] = useState(todayYm);
  const [selected, setSelected] = useState<string | null>(null);
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [draft, setDraftState] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  // "All time" and "Current stack" are views across several accounts rather than
  // accounts on disk, so selecting one is renderer state; the stored active
  // account stays put beneath it and remains where new entries are filed.
  const [virtualId, setVirtualId] = useState<string | null>(null);
  // Accounts the day being drafted was also copy-traded on.
  const [copyTo, setCopyTo] = useState<string[]>([]);
  // Set while an animation is playing; the change is applied when it finishes,
  // so the new number lands with the reveal.
  const [celebrating, setCelebrating] = useState<{
    kind: CelebrationKind;
    name: string;
    amount: number;
    apply: () => Promise<unknown>;
  } | null>(null);

  const setDraft = useCallback((fn: (d: Draft) => Draft) => setDraftState(fn), []);

  // Writes reply with a whole snapshot, so two in flight at once could apply out
  // of order and undo the newer one. Stamp each call and drop superseded replies.
  const issued = useRef(0);
  const applied = useRef(0);

  const commit = useCallback(async (fn: () => Promise<Journal>) => {
    const id = ++issued.current;
    try {
      const next = await fn();
      if (id > applied.current) {
        applied.current = id;
        setJournal(next);
      }
      return next;
    } catch (e) {
      setNote(e instanceof StoreError ? e.message : "Something went wrong.");
      return null;
    }
  }, []);

  // One-off repair of accounts seeded from templates that were wrong: LucidFlex
  // carries no consistency rule, and payout policies didn't exist when some
  // accounts were created. Both conditions stop matching once fixed, so this
  // settles after a single pass and never touches an account you have edited
  // into a state the templates don't produce.
  useEffect(() => {
    if (!journal) return;
    for (const a of journal.accounts) {
      if (!a.firm) continue;
      const template = rulesFor(a.firm, a.plan, a.size || 0);
      const needsPayout = !a.rules.payout?.minWinDays && template.payout.minWinDays > 0;
      const staleConsistency =
        template.consistencyPct === 0 && (a.rules.consistencyPct || 0) > 0;
      if (!needsPayout && !staleConsistency) continue;

      commit(() =>
        store.patchAccount(a.id, {
          rules: {
            ...a.rules,
            consistencyPct: staleConsistency ? 0 : a.rules.consistencyPct,
            payout: needsPayout ? template.payout : a.rules.payout,
          },
        }),
      );
    }
  }, [journal, commit]);

  // Read the journal off disk once the user starts the app.
  useEffect(() => {
    if (!started || journal) return;
    store
      .read()
      .then(setJournal)
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Could not open your journal."));
  }, [started, journal]);

  // The theme lives in the journal file, so it can only be applied once that
  // has been read. Until then the stylesheet defaults hold.
  const theme: ThemeChoice = journal
    ? {
        preset: journal.theme?.preset ?? DEFAULT_THEME.preset,
        custom: journal.theme?.custom ?? DEFAULT_THEME.custom,
      }
    : DEFAULT_THEME;

  useEffect(() => {
    applyTheme(theme);
  }, [theme.preset, theme.custom]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (lightbox) setLightbox(null);
      else if (selected) setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, selected]);

  /** The account entries are filed under — never the synthetic All-time one. */
  const storedAccount = useMemo(
    () =>
      journal
        ? journal.accounts.find((a) => a.id === journal.activeAccountId) ||
          journal.accounts[0] ||
          null
        : null,
    [journal],
  );

  // The switcher offers every real account plus All time, which is built fresh
  // from the journal so it can never fall out of date.
  const accountList: AccountDTO[] = useMemo(
    () =>
      journal
        ? [...pickableAccounts(journal), stackAccount(journal), allTimeAccount(journal)]
        : [],
    [journal],
  );

  const viewAccount = journal
    ? (virtualId ? accountList.find((a) => a.id === virtualId) : null) || storedAccount
    : null;
  const band = journal?.breakevenBand ?? 0;

  // Passing an evaluation starts the account again, so its own views show only
  // the funded phase — no green, red or flat days carried over from the
  // evaluation. Every one of them is still in All time, which is the record.
  //
  // Matched on the phase each session was logged in rather than its date, so a
  // session traded on the funded account the same day it passed still appears.
  const activeDays = useMemo(() => {
    if (!journal || !viewAccount) return [];
    const days = daysForAccount(journal, viewAccount.id);
    if (isVirtual(viewAccount.id)) return days;
    return days.filter((d) => dayPhase(d, viewAccount) === viewAccount.phase);
  }, [journal, viewAccount?.id, viewAccount?.phase, viewAccount?.passedOn]);

  // Where the current phase's equity starts, and the date it started on.
  // Passing an evaluation resets the balance and the profit that cleared it does
  // not carry into the funded account, so days on or before that date are
  // history: still listed, but no longer part of the balance. All time simply
  // adds up what every account opened at.
  const phase =
    journal && viewAccount && !isVirtual(viewAccount.id)
      ? accountStatus(viewAccount, journal.days, band)
      : null;
  const phaseStart = phase ? phase.phaseStart : (viewAccount?.start ?? 0);
  const phaseFrom = phase && viewAccount ? viewAccount.passedOn : null;

  // Every entry on the selected date. In All time or Current stack that can be
  // one per account, and the drawer switches between them.
  const selectedDays = useMemo(
    () =>
      activeDays
        .filter((d) => d.date === selected)
        .sort((a, b) => accountName(journal!, a.accountId).localeCompare(accountName(journal!, b.accountId))),
    [activeDays, selected, journal],
  );

  if (!isDesktop()) {
    return <BrowserNotice />;
  }

  if (!started) {
    return (
      <Shell journal={null}>
        <Launcher
          onStart={() => setStarted(true)}
          onClose={() => {
            store.quit().catch(() => window.close());
          }}
        />
      </Shell>
    );
  }

  if (!journal) {
    return (
      <Shell journal={null}>
        <Splash message={loadError || "Opening your journal…"} isError={!!loadError} />
      </Shell>
    );
  }

  async function saveDraft() {
    if (!draft.date || draft.net === "" || saving) return;
    setSaving(true);
    try {
      const shots = [
        ...(draft.pnlData ? [{ name: "P&L panel", data: draft.pnlData }] : []),
        ...draft.shots,
      ];
      const next = await commit(() =>
        store.saveDay({
          date: draft.date,
          net: Math.round(parseFloat(draft.net.replace(/[$,]/g, "")) || 0),
          wins: parseInt(draft.wins, 10) || 0,
          losses: parseInt(draft.losses, 10) || 0,
          contracts: parseInt(draft.contracts, 10) || 0,
          note: draft.note,
          tags: draft.tags,
          trades: draft.trades,
          shots,
          copyTo,
        }),
      );
      if (!next) return;

      // A breach is recorded straight away — it is not something you opt into.
      // Clearing an evaluation only *offers* the upgrade, because converting
      // resets the balance and that is the user's call to make, not ours.
      const touched = [next.activeAccountId, ...copyTo];
      const blown: string[] = [];
      for (const id of new Set(touched)) {
        const acc = next.accounts.find((a) => a.id === id);
        if (!acc) continue;
        const change = detectPhaseChange(acc, next.days, next.breakevenBand ?? 0);
        if (!change) continue;
        await commit(() => store.setPhase(acc.id, "blown", change.blownOn));
        blown.push(`${acc.name} on ${change.blownOn}`);
      }
      if (blown.length) setNote(`Drawdown limit hit — ${blown.join(", ")}.`);

      if (draft.pnlPreview) URL.revokeObjectURL(draft.pnlPreview);
      const savedDate = draft.date;
      setDraftState(emptyDraft());
      setCopyTo([]);
      setYm(savedDate.slice(0, 7));
      setOpenMonths((m) => ({ ...m, [savedDate.slice(0, 7)]: true }));
      setSelected(savedDate);
      setView("dashboard");
    } finally {
      setSaving(false);
    }
  }

  // What the account in view is offering right now. The virtual views offer
  // nothing — there is no single account to act on.
  const target = virtualId ? null : storedAccount;
  const clearedOn = target ? evalCleared(target, journal.days, band) : null;
  const action: Action = !target
    ? null
    : target.phase === "blown"
      ? { kind: "retire" }
      : clearedOn
        ? { kind: "upgrade" }
        : !phase?.isProp || target.phase !== "funded"
          ? null
          : phase.payoutReady
            ? {
                kind: "payout",
                available: phase.maxRequest,
                minimum: target.rules.payout.minPayout,
                buffer: target.rules.payout.buffer,
              }
            : {
                kind: "payout-waiting",
                winDays: phase.winDays,
                needed: phase.winDaysNeeded,
                blockers: phase.payoutBlockers,
              };

  const selectAccount = (id: string) => {
    if (isVirtual(id)) {
      setVirtualId(id);
      return;
    }
    setVirtualId(null);
    if (id !== journal.activeAccountId) commit(() => store.patchAccount(id, { active: true }));
  };

  return (
    <Shell
      journal={journal}
      ym={ym}
      accounts={accountList}
      activeId={viewAccount?.id ?? null}
      onSelectAccount={selectAccount}
    >
      <div style={{ display: "flex", flex: 1, minHeight: 0, background: C.bg }}>
      <Sidebar
        journal={journal}
        view={view}
        account={viewAccount}
        days={activeDays}
        balance={phase ? phase.balance : phaseStart + activeDays.reduce((a, d) => a + d.net, 0)}
        breakevenBand={band}
        action={action}
        onUpgrade={() => {
          if (!clearedOn || !target) return;
          const { id, name } = target;
          setCelebrating({
            kind: "funded",
            name,
            amount: target.size || target.start,
            apply: () => commit(() => store.setPhase(id, "funded", clearedOn)),
          });
        }}
        onPayout={(amount) => {
          if (!target || !phase) return;
          const { id, name } = target;
          // The sessions this payout is drawn against. Recording them is what
          // makes the winning-day count restart properly afterwards.
          const spent = phase.phaseDays.map((d) => d.id);
          setCelebrating({
            kind: "payout",
            name,
            amount,
            apply: () => commit(() => store.addPayout(id, amount, todayIso(), spent)),
          });
        }}
        onRetire={() => {
          if (!target) return;
          const { id, name } = target;
          const finishedAt = phase ? phase.balance : target.start;
          setCelebrating({
            kind: "retired",
            name,
            amount: finishedAt,
            apply: () => commit(() => store.archiveAccount(id)),
          });
        }}
        onView={setView}
        onSelectDay={(date) => {
          setYm(date.slice(0, 7));
          setSelected(date);
        }}
      />

      <main
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          // The sidebar stays put; this column is the only thing that scrolls.
          overflowY: "auto",
          padding: "28px clamp(20px, 2.4vw, 44px) 60px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div style={{ width: "100%", maxWidth: 1760, minWidth: 0 }}>
        {view === "dashboard" ? (
          <Dashboard
            allDays={activeDays}
            ym={ym}
            account={viewAccount}
            phaseStart={phaseStart}
            phaseFrom={phaseFrom}
            breakevenBand={band}
            // Phase-scoped, like the days: a withdrawal from before a pass
            // belongs to the account that no longer exists.
            payouts={
              phase && viewAccount
                ? viewAccount.payouts.filter(
                    (p) => !viewAccount.passedOn || p.date > viewAccount.passedOn,
                  )
                : []
            }
            isEmpty={activeDays.length === 0}
            onShiftMonth={(delta) => setYm((v) => shiftYm(v, delta))}
            onToday={() => setYm(todayYm())}
            onSelectDay={setSelected}
            onAdd={() => setView("add")}
          />
        ) : null}

        {view === "journal" ? (
          <JournalView
            days={activeDays}
            ym={ym}
            breakevenBand={band}
            accountFor={(id) => accountName(journal, id)}
            showAccount={Boolean(virtualId)}
            openMonths={openMonths}
            onToggleMonth={(k) => setOpenMonths((m) => ({ ...m, [k]: !m[k] }))}
            onPickMonth={(k) => {
              setYm(k);
              setOpenMonths((m) => ({ ...m, [k]: true }));
            }}
            onSelectDay={setSelected}
            onAdd={() => setView("add")}
          />
        ) : null}

        {view === "add" ? (
          <NewEntry
            draft={draft}
            setDraft={setDraft}
            onSave={saveDraft}
            saving={saving}
            presetTags={journal.presetTags}
            filedUnder={storedAccount?.name || "this account"}
            copyTargets={liveAccounts(journal)
              .filter((a) => a.id !== journal.activeAccountId)
              .map((a) => ({ id: a.id, name: a.name }))}
            copyTo={copyTo}
            onCopyTo={setCopyTo}
          />
        ) : null}

        {view === "settings" ? (
          <SettingsView
            journal={journal}
            theme={theme}
            commit={commit}
            setJournal={setJournal}
            note={note}
            setNote={setNote}
          />
        ) : null}
        </div>
      </main>

      {selectedDays.length ? (
        <DayDrawer
          days={selectedDays}
          accountFor={(id) => accountName(journal, id)}
          showAccounts={Boolean(virtualId) || selectedDays.length > 1}
          onClose={() => setSelected(null)}
          onNote={(day, n) => commit(() => store.patchDay(day.id, { note: n }))}
          onAddShots={(day, shots) => commit(() => store.patchDay(day.id, { shots }))}
          onOpenShot={setLightbox}
          onDelete={async (day) => {
            await commit(() => store.deleteDay(day.id));
            if (selectedDays.length === 1) setSelected(null);
          }}
        />
      ) : null}

      {lightbox ? <Lightbox url={lightbox} onClose={() => setLightbox(null)} /> : null}

      {celebrating ? (
        <Celebration
          kind={celebrating.kind}
          accountName={celebrating.name}
          amount={celebrating.amount}
          onDone={() => {
            const c = celebrating;
            setCelebrating(null);
            c.apply();
          }}
        />
      ) : null}
      </div>
    </Shell>
  );
}

/** Window chrome: our title bar above, whatever the app is showing below. */
function Shell({
  journal,
  ym = "",
  accounts = [],
  activeId = null,
  onSelectAccount = () => {},
  children,
}: {
  journal: Journal | null;
  ym?: string;
  accounts?: AccountDTO[];
  activeId?: string | null;
  onSelectAccount?: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
        background: C.bg,
      }}
    >
      <TitleBar
        journal={journal}
        ym={ym}
        accounts={accounts}
        activeId={activeId}
        onSelectAccount={onSelectAccount}
      />
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex" }}>{children}</div>
    </div>
  );
}

function Splash({ message, isError }: { message: string; isError: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        background: C.bg,
        color: isError ? C.neg : C.faint,
        fontSize: 13.5,
        padding: 40,
        textAlign: "center",
      }}
    >
      {message}
    </div>
  );
}

/** Shown if the page is opened in a normal browser, where there is no data store. */
function BrowserNotice() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        minHeight: "100vh",
        background: C.bg,
        padding: 40,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 700 }}>Z&amp;B Tracker</div>
      <div style={{ fontSize: 13, color: C.faint, maxWidth: 420, lineHeight: 1.7 }}>
        This is the desktop app&apos;s window content. Run it with{" "}
        <code style={{ color: C.dim }}>npm start</code> — opening the page in a browser has no
        access to your journal on disk.
      </div>
    </div>
  );
}
