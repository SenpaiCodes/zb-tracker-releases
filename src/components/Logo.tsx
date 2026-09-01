// The app mark, inline so it takes the theme's colours rather than shipping a
// second copy of the icon as a bitmap. Same geometry as build/icon.svg.

export default function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      aria-hidden="true"
      style={{ display: "block", flex: `0 0 ${size}px` }}
    >
      <rect width="256" height="256" rx="58" fill="var(--raised)" />
      <rect
        x="1.5"
        y="1.5"
        width="253"
        height="253"
        rx="56.5"
        fill="none"
        stroke="var(--fg)"
        strokeOpacity="0.08"
        strokeWidth="3"
      />
      <path
        d="M58 176 L104 132 L136 156 L198 86"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="17"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="198" cy="86" r="15" fill="var(--raised)" />
      <circle cx="198" cy="86" r="10.5" fill="var(--accent)" />
    </svg>
  );
}
