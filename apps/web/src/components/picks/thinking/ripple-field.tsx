// Eldora UI "SVG Ripple Effect" (MIT, eldoraui.site): concentric rings around a centre, each one
// swelling a little and brightening in turn, so a wave travels outward — "reaching for something".
// Re-drawn in SVG + CSS: every ring carries its index as `--n`, and one keyframe (2s, the original's
// scale 1 -> 1.08 and stroke-opacity .3 -> .6) runs on each with a 50ms-per-ring delay. The
// original's radial mask fades the outer rings out.
//
// Used where Apple is reaching for Studio: around the mark of "Creating a pairing code", and as the
// art of the "Waiting for Studio" empty states. Rings are drawn in currentColor at low opacity, so
// the caller's colour decides the tone. Reduced motion: still rings.
import type { CSSProperties, ReactNode } from 'react';
import './ripple-field.css';

export function RippleField({ size = 120, rings = 9, children, className }: {
  size?: number;
  rings?: number;
  /** Drawn in the centre, above the rings. */
  children?: ReactNode;
  className?: string;
}) {
  const step = 250 / (rings + 1);
  return (
    <span className={`picks-ripple${className ? ` ${className}` : ''}`} style={{ width: size, height: size } as CSSProperties}>
      <svg viewBox="0 0 500 500" fill="none" aria-hidden="true" focusable="false" className="picks-ripple__rings">
        {Array.from({ length: rings }, (_, n) => (
          <circle key={n} cx="250" cy="250" r={Math.round(step * (n + 1))} style={{ '--n': n } as CSSProperties} />
        ))}
      </svg>
      {children ? <span className="picks-ripple__centre">{children}</span> : <span className="picks-ripple__dot" aria-hidden="true" />}
    </span>
  );
}
