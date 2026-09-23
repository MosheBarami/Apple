// Motion "SVG loading spinner" (MIT, motion.dev/examples/js-svg-loading-spinner), without Motion:
// an arc on a faint track that grows and shrinks as the whole ring turns. The ring's rotation
// (1.2s, linear) and the arc's dash (1.6s, ease-in-out: .05 -> .6 -> .05 of the circle while its
// offset runs 0 -> -.3 -> -1) are the example's values, as CSS keyframes.
//
// The arc is drawn in `--picks-arc`, which the caller sets (loading.css): the accent when the spinner
// stands on its own, currentColor inside a button — where an accent arc on an accent fill would
// vanish. Reduced motion: a still quarter arc on the track.
import './arc-spinner.css';

export function ArcSpinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 50 50"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={`picks-arc${className ? ` ${className}` : ''}`}
    >
      <circle className="picks-arc__track" cx="25" cy="25" r="20" fill="none" strokeWidth="5" />
      <circle className="picks-arc__arc" cx="25" cy="25" r="20" fill="none" strokeWidth="5" strokeLinecap="round" pathLength={1} />
    </svg>
  );
}
