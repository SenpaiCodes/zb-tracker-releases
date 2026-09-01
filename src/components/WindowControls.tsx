import { useEffect, useState } from "react";
import { store } from "../lib/store";
import { C } from "./ui";

// Our own minimise / maximise / close, because the native overlay can only be
// given two colours and looked washed out against the lighter themes. Drawing
// them means they follow the theme exactly and get the usual Windows treatment:
// grey hover on the first two, red on close.

const BOX = { width: 46, height: 32 };

export default function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    store.isMaximized().then(setMaximized).catch(() => {});
    return store.onMaximizeChange(setMaximized);
  }, []);

  return (
    <span
      style={{ display: "flex", alignItems: "stretch", WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      <ControlButton label="Minimise" onClick={() => store.minimize()}>
        <line x1="3" y1="8" x2="13" y2="8" />
      </ControlButton>

      <ControlButton
        label={maximized ? "Restore" : "Maximise"}
        onClick={() => store.toggleMaximize().then(setMaximized)}
      >
        {maximized ? (
          <>
            <rect x="3" y="5.5" width="7.5" height="7.5" rx="1.2" />
            <path d="M5.5 5.5V4.2A1.2 1.2 0 0 1 6.7 3h6.1A1.2 1.2 0 0 1 14 4.2v6.1a1.2 1.2 0 0 1-1.2 1.2h-1.3" />
          </>
        ) : (
          <rect x="3.5" y="3.5" width="9" height="9" rx="1.4" />
        )}
      </ControlButton>

      <ControlButton label="Close" danger onClick={() => store.closeWindow()}>
        <line x1="4" y1="4" x2="12" y2="12" />
        <line x1="12" y1="4" x2="4" y2="12" />
      </ControlButton>
    </span>
  );
}

function ControlButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={danger ? "winctl winctl-close" : "winctl"}
      style={{
        ...BOX,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        background: "transparent",
        color: C.mute,
        cursor: "pointer",
        padding: 0,
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}
