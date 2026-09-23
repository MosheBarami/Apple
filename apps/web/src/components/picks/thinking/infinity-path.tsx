// Motion "Loading: Infinite path drawing" (motion.dev/examples/js-loading-infinite-path-drawing),
// re-implemented: the example is licensed LicenseRef-Motion-Plus, so none of its code is used.
// A figure-of-eight track with a short segment that runs round it forever — an indeterminate
// "still working" that, unlike a bar, has no end it could be mistaken for arriving at.
//
// The segment is a quarter of the path (pathLength 1, dasharray .25 .75) and its offset runs
// 0 -> -1 linearly in 1.6s, as CSS. Reduced motion: no segment; the whole loop is drawn in the
// accent's quiet tint, which makes no claim about progress.
import './infinity-path.css';

const D = 'M25 25 C 25 10, 45 10, 50 25 S 75 40, 75 25 S 55 10, 50 25 S 25 40, 25 25';

export function InfinityPath({ className }: { className?: string }) {
  return (
    <svg viewBox="18 6 64 38" fill="none" aria-hidden="true" focusable="false" className={`picks-infinity${className ? ` ${className}` : ''}`}>
      <path d={D} className="picks-infinity__track" strokeWidth="3.5" />
      <path d={D} className="picks-infinity__run" strokeWidth="3.5" strokeLinecap="round" pathLength={1} />
    </svg>
  );
}
