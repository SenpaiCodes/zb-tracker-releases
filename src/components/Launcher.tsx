import Dashboard from "./Dashboard";
import type { AccountDTO, DayDTO } from "../lib/types";
import { CUSTOM_RULES } from "../lib/propfirms";
import { C, MONO } from "./ui";

// The opening screen. The left half is a live, scaled-down render of the real
// dashboard rather than a picture of one, so it can never drift out of date;
// the right half is the two things you can do.

type Props = {
  onStart: () => void;
  onClose: () => void;
};

/** A plausible month, purely for the preview. Never touches the real journal. */
function previewDays(): DayDTO[] {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const shape: [number, number, number, number][] = [
    // day, net, wins, losses
    [2, 420, 3, 1],
    [3, -180, 1, 2],
    [4, 265, 2, 1],
    [8, 610, 4, 0],
    [9, -95, 1, 1],
    [10, 340, 2, 1],
    [11, 155, 2, 2],
    [15, -260, 0, 2],
    [16, 480, 3, 1],
    [17, 205, 2, 1],
    [18, -140, 1, 2],
    [22, 720, 4, 1],
    [23, 190, 2, 1],
    [24, -75, 1, 1],
    [25, 395, 3, 1],
  ];

  return shape.map(([d, net, wins, losses]) => ({
    id: `preview-${d}`,
    accountId: "preview",
    date: `${ym}-${String(d).padStart(2, "0")}`,
    net,
    wins,
    losses,
    contracts: (wins + losses) * 3,
    note: "",
    tags: [],
    trades: [],
    shots: [],
  }));
}

/** A plain personal account, so the preview shows no prop-firm panel. */
const PREVIEW_ACCOUNT: AccountDTO = {
  id: "preview",
  name: "Main account",
  broker: "",
  start: 25000,
  firm: null,
  plan: null,
  size: null,
  phase: "funded",
  rules: { ...CUSTOM_RULES },
  passedOn: null,
  blownOn: null,
  createdAt: null,
  archived: false,
  payouts: [],
};

export default function Launcher({ onStart, onClose }: Props) {
  const days = previewDays();
  const ym = days[0].date.slice(0, 7);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.35fr) minmax(360px, 0.65fr)",
        minHeight: "100%",
        flex: 1,
        background: C.bg,
      }}
    >
      {/* Left — the app itself, shrunk and inert. */}
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          borderRight: `1px solid ${C.line}`,
          background: C.bg,
        }}
        aria-hidden="true"
      >
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 1240,
            transform: "translate(-50%, -50%) scale(0.62)",
            transformOrigin: "center center",
            pointerEvents: "none",
            userSelect: "none",
            padding: 32,
          }}
        >
          <Dashboard
            allDays={days}
            ym={ym}
            account={PREVIEW_ACCOUNT}
            phaseStart={PREVIEW_ACCOUNT.start}
            phaseFrom={null}
            breakevenBand={0}
            payouts={[]}
            isEmpty={false}
            onShiftMonth={() => {}}
            onToday={() => {}}
            onSelectDay={() => {}}
            onAdd={() => {}}
          />
        </div>

        {/* Fades the preview into the background so it reads as a backdrop. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            // Theme-aware, so the fade works on a cream background too.
            background:
              "radial-gradient(120% 90% at 40% 45%, color-mix(in srgb, var(--bg) 0%, transparent) 35%, color-mix(in srgb, var(--bg) 60%, transparent) 78%, color-mix(in srgb, var(--bg) 92%, transparent) 100%)",
          }}
        />
      </div>

      {/* Right — the two things you can do. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: 40,
          padding: "48px 46px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: -0.3 }}>Z&amp;B Tracker</div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: 1.4,
              textTransform: "uppercase",
              color: C.faint,
              marginTop: 5,
            }}
          >
            Futures journal
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 420 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 40,
              lineHeight: 1.12,
              fontWeight: 700,
              letterSpacing: -1.4,
              textWrap: "pretty",
            }}
          >
            Every session, on the record.
          </h1>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.7, color: C.mute2 }}>
            Drop the daily P&amp;L panel, confirm the numbers, write what actually happened. The
            month tells you the rest.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
            <button onClick={onStart} className="hov-solid" style={startButton} autoFocus>
              Start app
            </button>
            <button onClick={onClose} className="hov-raised" style={closeButton}>
              Close
            </button>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            fontSize: 11.5,
            color: C.fainter,
            lineHeight: 1.7,
          }}
        >
          <span style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 2,
                background: C.pos,
                flex: "0 0 6px",
                marginTop: 7,
              }}
            />
            Everything stays on this computer. No account, no internet needed.
          </span>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: C.faintest,
            }}
          >
            MES · MNQ &nbsp;&nbsp; ES · NQ
          </span>
        </div>
      </div>
    </div>
  );
}

const startButton: React.CSSProperties = {
  height: 46,
  border: "none",
  background: C.text,
  color: C.bg,
  borderRadius: 10,
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
};

const closeButton: React.CSSProperties = {
  height: 46,
  border: `1px solid ${C.line2}`,
  background: "transparent",
  color: C.dim,
  borderRadius: 10,
  cursor: "pointer",
  fontSize: 14,
};
