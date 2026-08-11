/**
 * The product mark.
 *
 * A diamond holding three descending nodes: the rounds of an interview, which
 * is the one idea the whole product is organised around. Drawn as inline SVG
 * rather than an image file so it inherits `currentColor`, stays sharp at any
 * size, and costs no request.
 */
export function AppMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 1.6 22.4 12 12 22.4 1.6 12Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Descending opacity reads as progress through the rounds: done, current,
          still ahead. */}
      <circle cx="12" cy="7.2" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" opacity="0.55" />
      <circle cx="12" cy="16.8" r="1.5" fill="currentColor" opacity="0.28" />
    </svg>
  );
}
