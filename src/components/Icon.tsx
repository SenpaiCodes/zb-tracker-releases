// Hand-drawn stroke icons rather than an icon package: four shapes don't justify
// a dependency, and these inherit `currentColor` so they track the theme for
// free. Drawn on a 24 grid, 1.75 stroke, round caps and joins to sit with the
// rounded UI face.

export type IconName = "dashboard" | "journal" | "entry" | "settings";

const PATHS: Record<IconName, React.ReactNode> = {
  // A month grid — what the dashboard actually is.
  dashboard: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="3" />
      <path d="M3 9.5h18" />
      <path d="M8 3v3M16 3v3" />
      <path d="M7.5 14h3M13.5 14h3M7.5 17.5h3" />
    </>
  ),
  // A bound notebook.
  journal: (
    <>
      <path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H18a1 1 0 0 1 1 1v15.5" />
      <path d="M5 4.5v13A2.5 2.5 0 0 0 7.5 20H19" />
      <path d="M5 17.5A2.5 2.5 0 0 1 7.5 15H19" />
      <path d="M9 7.5h6" />
    </>
  ),
  // Plus inside a frame: adding a day.
  entry: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="4.5" />
      <path d="M12 8.25v7.5M8.25 12h7.5" />
    </>
  ),
  // Sliders read better than a gear at 17px.
  settings: (
    <>
      <path d="M4 7.5h9M17.5 7.5H20" />
      <path d="M4 16.5h3.5M12 16.5h8" />
      <circle cx="15.25" cy="7.5" r="2.25" />
      <circle cx="9.75" cy="16.5" r="2.25" />
    </>
  ),
};

export default function Icon({
  name,
  size = 17,
  strokeWidth = 1.75,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", flex: `0 0 ${size}px` }}
    >
      {PATHS[name]}
    </svg>
  );
}
