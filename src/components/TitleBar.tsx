import { useEffect, useRef, useState } from "react";
import type { AccountDTO, Journal } from "../lib/types";
import { colorFor, money } from "../lib/format";
import { accountStatus, phaseLabel } from "../lib/account";
import { ALL_TIME_ID, PERIODS, daysForAccount, isAllTime, slice, summarize } from "../lib/stats";
import { C, MONO } from "./ui";
import Logo from "./Logo";
import WindowControls from "./WindowControls";

// The window's own title bar: brand, an account switcher, and a balance chip
// that opens the day / week / month / all-time figures for whatever is selected.

type Props = {
  journal: Journal | null;
  ym: string;
  accounts: AccountDTO[];
  activeId: string | null;
  onSelectAccount: (id: string) => void;
};

export const TITLE_BAR_HEIGHT = 40;

export default function TitleBar({ journal, ym, accounts, activeId, onSelectAccount }: Props) {
  const [open, setOpen] = useState<null | "accounts" | "stats">(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = accounts.find((a) => a.id === activeId) || accounts[0] || null;
  const days = journal ? daysForAccount(journal, active?.id ?? null) : [];
  const band = journal?.breakevenBand ?? 0;
  const all = summarize(days, band);
  const balance = active
    ? isAllTime(active.id)
      ? active.start + all.net
      : accountStatus(active, journal?.days ?? [], band).balance
    : 0;

  return (
    <header
      ref={wrap}
      style={
        {
          height: TITLE_BAR_HEIGHT,
          flex: `0 0 ${TITLE_BAR_HEIGHT}px`,
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "stretch",
          borderBottom: `1px solid ${C.line}`,
          background: C.bg,
          userSelect: "none",
          position: "relative",
          zIndex: 50,
          WebkitAppRegion: "drag",
        } as React.CSSProperties
      }
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          paddingLeft: 12,
          minWidth: 0,
          justifySelf: "start",
        }}
      >
        <Logo size={19} />
        <span style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: -0.1, color: C.dim }}>
          Z&amp;B Tracker
        </span>
      </span>

      {journal && active ? (
        <span
          style={
            {
              display: "flex",
              alignItems: "center",
              gap: 4,
              minWidth: 0,
              position: "relative",
              WebkitAppRegion: "no-drag",
            } as React.CSSProperties
          }
        >
          <button
            onClick={() => setOpen(open === "accounts" ? null : "accounts")}
            className="hov-raised"
            aria-expanded={open === "accounts"}
            style={chip}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                flex: "0 0 6px",
                background: isAllTime(active.id) ? C.accent : phaseTone(active),
              }}
            />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {active.name}
            </span>
            <Chevron />
          </button>

          <button
            onClick={() => setOpen(open === "stats" ? null : "stats")}
            className="hov-raised"
            aria-expanded={open === "stats"}
            style={{ ...chip, fontFamily: MONO }}
          >
            <span style={{ fontSize: 12, color: C.dim }}>
              {balance < 0 ? "-" : ""}${Math.abs(Math.round(balance)).toLocaleString("en-US")}
            </span>
            <span style={{ fontSize: 11.5, color: colorFor(all.net) }}>{money(all.net)}</span>
            <Chevron />
          </button>

          {open === "accounts" ? (
            <AccountMenu
              journal={journal}
              accounts={accounts}
              activeId={active.id}
              band={band}
              onPick={(id) => {
                onSelectAccount(id);
                setOpen(null);
              }}
            />
          ) : null}

          {open === "stats" ? <StatsMenu journal={journal} account={active} ym={ym} /> : null}
        </span>
      ) : (
        <span />
      )}

      <span style={{ display: "flex", justifySelf: "end" }}>
        <WindowControls />
      </span>
    </header>
  );
}

function AccountMenu({
  journal,
  accounts,
  activeId,
  band,
  onPick,
}: {
  journal: Journal;
  accounts: AccountDTO[];
  activeId: string;
  band: number;
  onPick: (id: string) => void;
}) {
  return (
    <div style={{ ...menu, width: 300 }} role="menu">
      {accounts.map((a) => {
        const on = a.id === activeId;
        const net = summarize(daysForAccount(journal, a.id), band).net;
        return (
          <button
            key={a.id}
            role="menuitem"
            onClick={() => onPick(a.id)}
            className="hov-raised"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              width: "100%",
              textAlign: "left",
              border: "none",
              borderRadius: 8,
              padding: "9px 10px",
              cursor: "pointer",
              background: on ? C.active : "transparent",
              color: on ? C.text : C.mute,
              fontSize: 13,
              fontWeight: on ? 600 : 500,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  flex: "0 0 6px",
                  background: isAllTime(a.id) ? C.accent : phaseTone(a),
                }}
              />
              <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span
                  style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {a.name}
                </span>
                <span style={{ fontSize: 10.5, color: C.fainter }}>
                  {isAllTime(a.id) ? a.broker : phaseLabel(a)}
                </span>
              </span>
            </span>
            <span style={{ fontFamily: MONO, fontSize: 11.5, color: colorFor(net) }}>
              {money(net)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function StatsMenu({
  journal,
  account,
  ym,
}: {
  journal: Journal;
  account: AccountDTO;
  ym: string;
}) {
  const band = journal.breakevenBand ?? 0;
  const days = daysForAccount(journal, account.id);

  return (
    <div style={{ ...menu, width: 348 }}>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 9,
          letterSpacing: 1.3,
          textTransform: "uppercase",
          color: C.fainter,
          padding: "2px 8px 8px",
        }}
      >
        {account.name}
      </div>
      {PERIODS.map((p) => {
        const s = summarize(slice(days, p.id, ym), band);
        return (
          <div
            key={p.id}
            style={{
              display: "grid",
              gridTemplateColumns: "68px 1fr auto",
              alignItems: "center",
              gap: 10,
              padding: "9px 10px",
              borderTop: `1px solid ${C.line3}`,
            }}
          >
            <span style={{ fontSize: 12, color: C.mute, fontWeight: 600 }}>{p.label}</span>
            <span style={{ fontSize: 11, color: C.fainter }}>
              {s.days} {s.days === 1 ? "day" : "days"} · {s.winRate}% WR ·{" "}
              <span style={{ color: C.pos }}>{s.wins}</span>/
              <span style={{ color: C.neg }}>{s.losses}</span>
              {s.flats ? <span style={{ color: C.flat }}>/{s.flats}</span> : null}
            </span>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 13,
                fontWeight: 500,
                color: colorFor(s.net),
              }}
            >
              {money(s.net)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function phaseTone(a: AccountDTO): string {
  if (!a.firm) return C.faintest;
  if (a.phase === "blown") return C.neg;
  if (a.phase === "funded" || a.phase === "passed") return C.pos;
  return C.amber;
}

function Chevron() {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path
        d="M2.5 4L5 6.5L7.5 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const chip: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  maxWidth: 260,
  height: 26,
  padding: "0 9px",
  border: "1px solid transparent",
  borderRadius: 8,
  background: "transparent",
  color: C.faint,
  fontSize: 11.5,
  cursor: "pointer",
};

const menu: React.CSSProperties = {
  position: "absolute",
  // Centred under the chips, which are themselves centred on the window.
  top: TITLE_BAR_HEIGHT - 6,
  left: "50%",
  transform: "translateX(-50%)",
  background: C.panel,
  border: `1px solid ${C.line2}`,
  borderRadius: 11,
  padding: 6,
  boxShadow: "var(--shadow-card)",
  display: "flex",
  flexDirection: "column",
  gap: 2,
  animation: "menuIn 130ms ease both",
};
