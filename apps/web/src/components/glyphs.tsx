// Inline SVG artwork. Everything uses currentColor or live theme tokens so the
// marks follow light/dark without a second asset.

/**
 * The StudPilot mark: a rounded tile with one circular stud knocked out of it and one corner left
 * sharp, pointing up and to the right. One filled path in `currentColor`, so it takes the accent.
 * The same drawing as packages/design/brand/studpilot-mark.svg (see PROVENANCE.md there); a test in
 * packages/design holds the two equal. Its tile outline and its stud also draw the illustrations
 * below, so every mark in the app is one vocabulary.
 */
export const MARK_PATH = 'M12 3H27.8Q29 3 29 4.2V20A9 9 0 0 1 20 29H12A9 9 0 0 1 3 20V12A9 9 0 0 1 12 3ZM20 17a4.6 4.6 0 1 0-9.2 0 4.6 4.6 0 0 0 9.2 0Z';
/** The tile alone, without the stud, for drawings where the stud is somewhere else. */
export const TILE_PATH = 'M12 3H27.8Q29 3 29 4.2V20A9 9 0 0 1 20 29H12A9 9 0 0 1 3 20V12A9 9 0 0 1 12 3Z';

/**
 * Used at 28px in the workspace rail and on the sign-in screens, ~24px as the assistant avatar and
 * as the wait mark.
 */
export function StudPilotGlyph({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path fillRule="evenodd" d={MARK_PATH} />
    </svg>
  );
}

/** Small StudPilot status mark used by branded waits: the mark itself. */
export function StudPilotPulse({ size = 16 }: { size?: number }) {
  return <StudPilotGlyph size={size} className="studpilot-pulse" />;
}

export function NavIcon({ d, size = 17 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d={d} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export { ICON_PATH as ICONS } from './icons';

/**
 * Empty-state mark for the project list: one tile with its stud, and two blanks beside it that have
 * not been made yet. Drawn from the mark's own tile outline; no fill, no accent, no animation.
 */
export function SummonIllustration() {
  return (
    <svg
      width="168"
      height="140"
      viewBox="0 0 180 150"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      {/* The made one: the tile, its stud, standing on the ground line. */}
      <g transform="translate(51.6 56.4) scale(2.4)">
        <path d={MARK_PATH} fillRule="evenodd" stroke="var(--line-strong)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </g>

      {/* Two blanks waiting to be made. */}
      <g transform="translate(10.6 85.4) scale(1.4)">
        <path d={TILE_PATH} stroke="var(--line)" strokeWidth="1.5" strokeDasharray="3 6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </g>
      <g transform="translate(124.6 85.4) scale(1.4)">
        <path d={TILE_PATH} stroke="var(--line)" strokeWidth="1.5" strokeDasharray="3 6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </g>

      <path d="M22 126 H158" stroke="var(--line)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * 404 mark: the tile with its stud missing, and the stud lying below.
 *
 * The page is not there, so the shape is not whole; the meaning comes from the geometry rather than
 * from a personified character. The stud's place is a faint dashed ring, and the stud itself has
 * come to rest away from the tile. No animation.
 */
export function LostStudPilotIllustration() {
  return (
    <svg
      width="190"
      height="150"
      viewBox="0 0 200 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      {/* The tile, without its stud. */}
      <g transform="translate(52 20) scale(3)">
        <path d={TILE_PATH} stroke="var(--line-strong)" strokeWidth="1.7" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </g>
      {/* Where the stud should be. */}
      <circle cx="100" cy="71" r="14" stroke="var(--line)" strokeWidth="1.4" strokeDasharray="3 7" strokeLinecap="round" />

      {/* The missing piece, come to rest away from the shape. */}
      <circle cx="160" cy="134" r="8" stroke="var(--muted)" strokeWidth="1.7" opacity="0.75" />

      <path d="M32 142 H168" stroke="var(--line)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** Marker for the "no renders yet" state on the work surface. */
export function CameraMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false">
      <rect x="3.5" y="9.5" width="33" height="23" rx="4" stroke="var(--line-strong)" strokeWidth="1.5" />
      <path d="M13 9.5l2.2-3.5h9.6L27 9.5" stroke="var(--line-strong)" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="20" cy="21" r="6.5" stroke="var(--accent)" strokeWidth="1.5" />
      <circle cx="20" cy="21" r="2" fill="var(--accent)" opacity="0.55" />
    </svg>
  );
}
