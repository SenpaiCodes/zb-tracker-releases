import { C, MONO, cssUrl } from "./ui";

export default function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "color-mix(in srgb, var(--bg) 88%, transparent)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 44,
        animation: "fadeIn 0.14s ease",
        cursor: "zoom-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          maxWidth: 1560,
          borderRadius: 12,
          border: `1px solid ${C.dash}`,
          backgroundColor: C.field,
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "contain",
          backgroundImage: cssUrl(url),
          cursor: "default",
        }}
      />
      <button
        onClick={onClose}
        aria-label="Close"
        className="hov-close"
        style={{
          position: "fixed",
          top: 22,
          right: 26,
          width: 36,
          height: 36,
          border: "1px solid var(--edge)",
          background: "color-mix(in srgb, var(--panel) 92%, transparent)",
          color: C.dim,
          borderRadius: 9,
          cursor: "pointer",
          fontSize: 16,
        }}
      >
        ×
      </button>
      <span
        style={{
          position: "fixed",
          bottom: 22,
          left: "50%",
          transform: "translateX(-50%)",
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: C.fainter,
        }}
      >
        Click anywhere to close · Esc
      </span>
    </div>
  );
}
