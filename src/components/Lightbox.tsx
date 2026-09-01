import { useEffect, useRef, useState } from "react";
import { C, MONO } from "./ui";

// Full-screen screenshot viewer.
//
// It was a background-image in a box capped at 1560px, which meant a chart was
// resampled down even on a large monitor and there was no way to look closer.
// It is a real <img> now: fit to the window by default, click for 1:1, and drag
// to move around at that size. `image-rendering: auto` matters — a browser's
// default downscale is smooth, and anything sharper turns a chart's antialiased
// wicks into stairs.

export default function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  const [zoomed, setZoomed] = useState(false);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const pane = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // Space toggles the zoom without hunting for the image with the mouse.
      if (e.key === " ") {
        e.preventDefault();
        setZoomed((z) => !z);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Centre the view on the middle of the image when zooming in, rather than
  // dumping you at the top-left corner.
  useEffect(() => {
    const el = pane.current;
    if (!el || !zoomed) return;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
  }, [zoomed]);

  // Only offer 1:1 when it would actually show more than the fitted view does.
  const worthZooming =
    !natural || natural.w > window.innerWidth - 88 || natural.h > window.innerHeight - 88;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "color-mix(in srgb, var(--bg) 92%, transparent)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "fadeIn 0.14s ease",
        cursor: "zoom-out",
      }}
    >
      <div
        ref={pane}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => {
          if (!zoomed || !pane.current) return;
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            left: pane.current.scrollLeft,
            top: pane.current.scrollTop,
          };
        }}
        onMouseMove={(e) => {
          const d = drag.current;
          if (!d || !pane.current) return;
          pane.current.scrollLeft = d.left - (e.clientX - d.x);
          pane.current.scrollTop = d.top - (e.clientY - d.y);
        }}
        onMouseUp={() => (drag.current = null)}
        onMouseLeave={() => (drag.current = null)}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          padding: 44,
          display: "flex",
          alignItems: zoomed ? "flex-start" : "center",
          justifyContent: zoomed ? "flex-start" : "center",
          overflow: zoomed ? "auto" : "hidden",
          cursor: "default",
        }}
      >
        <img
          src={url}
          alt="Screenshot"
          draggable={false}
          onLoad={(e) =>
            setNatural({
              w: e.currentTarget.naturalWidth,
              h: e.currentTarget.naturalHeight,
            })
          }
          onClick={() => worthZooming && setZoomed((z) => !z)}
          style={{
            // Fitted: never larger than the window, never upscaled past its own
            // pixels. Zoomed: exactly one image pixel per screen pixel.
            maxWidth: zoomed ? "none" : "100%",
            maxHeight: zoomed ? "none" : "100%",
            width: zoomed && natural ? natural.w : "auto",
            height: "auto",
            display: "block",
            margin: "auto",
            borderRadius: zoomed ? 0 : 10,
            border: zoomed ? "none" : `1px solid ${C.line2}`,
            imageRendering: "auto",
            cursor: worthZooming ? (zoomed ? "grab" : "zoom-in") : "default",
            userSelect: "none",
          }}
        />
      </div>

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
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: C.fainter,
          pointerEvents: "none",
        }}
      >
        {natural ? (
          <span style={{ color: C.faint }}>
            {natural.w}×{natural.h}
          </span>
        ) : null}
        <span>
          {worthZooming
            ? zoomed
              ? "Drag to pan · click to fit"
              : "Click the image to zoom · Esc to close"
            : "Esc to close"}
        </span>
      </span>
    </div>
  );
}
