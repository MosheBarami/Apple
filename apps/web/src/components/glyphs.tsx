// Inline SVG artwork. Everything uses currentColor or live theme tokens so the
// marks follow light/dark without a second asset.

/**
 * The Apple mark (phase 6, "Ember Rail"): a rounded brick with two studs and a prompt chevron cut
 * out of its face. One drawing, shared with the public site (apps/site/src/components/AppleMark.astro)
 * and baked into favicon.svg, so a visitor sees the same object before and after signing up.
 *
 * It takes `--accent` (Ember: #ff8a4c on the dark ground, #a63f0a on the light one). No fruit
 * outline, no leaf, no bite.
 *
 * THE SNAP. The right-hand stud is its own shape. `state="lifted"` raises it (translateY(-3px),
 * rotate(-8deg)); `state="seated"` clicks it down over 320ms with --ease-snap. The shell drives it
 * from the Studio connection it already knows (lib/shell.tsx): lifted while Studio is disconnected,
 * seated once it is connected again. It is never driven by a timer and never moves on its own, and
 * under reduced motion it is simply seated (design/ember.css).
 *
 * Used at 28px in the rail and the conversations drawer, 36px on the welcome sheet and 30px as the
 * mark beside a turn.
 */
export function AppleGlyph({
  size = 28,
  className,
  state = 'seated',
}: {
  /** Height in CSS pixels; the width follows the 32x36 viewBox. */
  size?: number;
  className?: string;
  state?: 'seated' | 'lifted';
}) {
  return (
    <svg
      width={Math.round((size * 32) / 36)}
      height={size}
      viewBox="0 0 32 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`apple-mark${className ? ` ${className}` : ''}`}
      data-state={state}
      aria-hidden="true"
      focusable="false"
    >
      <g fill="var(--accent)">
        <path
          fillRule="evenodd"
          d="M10 11H22A7 7 0 0 1 29 18V26A7 7 0 0 1 22 33H10A7 7 0 0 1 3 26V18A7 7 0 0 1 10 11ZM9.4 16.2 19.6 22 9.4 27.8 7.8 25.2 13.6 22 7.8 18.8ZM21 26.4H25.6A1.2 1.2 0 0 1 25.6 28.8H21A1.2 1.2 0 0 1 21 26.4Z"
        />
        <rect className="stud" x="7" y="6.5" width="7" height="5.5" rx="2" />
        <rect className="stud stud--snap" x="18" y="6.5" width="7" height="5.5" rx="2" />
      </g>
    </svg>
  );
}

/** Small Apple status mark used by branded waits. */
export function ApplePulse({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className="apple-pulse"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 1.5l5.5 3.5v6L8 14.5 2.5 11V5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" />
    </svg>
  );
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
 * Empty-state mark for the project list: an uncarved form.
 *
 * Geometry only, and deliberately so. The previous version of this mark was a
 * head on a body with two accent-filled eyes that blinked on a timer, plus
 * bobbing motes — i.e. a character. DESIGN-SPEC §0 cancels exactly that ("not a
 * face, not a character… a mark that blinks or reacts is a mascot") and §3
 * lists "No mascot" among the things that must not come back. So this is the
 * product's own hexagon vocabulary instead: one hexagon carrying the cube
 * lines, two empty ones beside it, on a faint ground line — a shape that has
 * been carved and two that have not. No fill, no accent, no animation.
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
      {/* The carved form: hexagon + the three isometric cube edges. */}
      <path
        d="M90 30 L122.91 49 L122.91 87 L90 106 L57.09 87 L57.09 49 Z"
        stroke="var(--line-strong)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M90 30 V68 M90 68 L57.09 87 M90 68 L122.91 87"
        stroke="var(--line-strong)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Two blanks waiting to be carved. */}
      <path
        d="M36 72 L53.32 82 L53.32 102 L36 112 L18.68 102 L18.68 82 Z"
        stroke="var(--line)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M144 72 L161.32 82 L161.32 102 L144 112 L126.68 102 L126.68 82 Z"
        stroke="var(--line)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      <path d="M22 126 H158" stroke="var(--line)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * 404 mark: the same hexagon with one edge missing, and that edge lying below.
 *
 * The page is not there, so the shape is not whole — the meaning comes from the
 * geometry rather than from a personified character. The earlier version was a
 * tilted robot with a blinking accent eye, which §3 forbids. No animation.
 */
export function LostAppleIllustration() {
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
      {/* The hexagon, drawn as two open runs so the lower-right edge is absent. */}
      <path
        d="M65.36 48 L100 28 L134.64 48 L134.64 88"
        stroke="var(--line-strong)"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M100 108 L65.36 88 L65.36 48"
        stroke="var(--line-strong)"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Where that edge should be. */}
      <path
        d="M134.64 88 L100 108"
        stroke="var(--line)"
        strokeWidth="1.4"
        strokeDasharray="3 7"
        strokeLinecap="round"
      />

      {/* The cube's edges, faint — the form is incomplete. */}
      <path
        d="M100 28 V68 M100 68 L65.36 88"
        stroke="var(--line)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* The missing piece, come to rest away from the shape. */}
      <path
        d="M150 124 L168 134"
        stroke="var(--muted)"
        strokeWidth="1.7"
        strokeLinecap="round"
        opacity="0.75"
      />

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
