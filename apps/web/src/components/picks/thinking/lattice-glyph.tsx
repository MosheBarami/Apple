// The Thinking header's state glyph — React Bits "Lattice Loader", re-implemented.
//
// A 3x3 lattice. While the run is live a light runs round its ring ("orbit"); when the run settles
// the lattice turns into its mark — a tick for done, a cross for a real failure, two bars for
// stopped or paused — without the glyph changing size or place, so the header line never moves.
// The words beside it already say the same thing; this is the part a child reads at a glance.
//
// React Bits is MIT + Commons Clause, so none of its code is copied: the patterns and timings are
// taken from what it does (a 108ms step, a 864ms cycle; its check and cross cell sets) and drawn
// with this app's tokens. aria-hidden: the state is in the trigger's text and accessible name.
import type { CSSProperties } from 'react';
import './lattice-glyph.css';

export type LatticeStatus = 'working' | 'done' | 'failed' | 'stopped' | 'idle';

/** Orbit: the order each ring cell lights in; the centre is a hole. */
const ORBIT: (number | null)[] = [0, 1, 2, 7, null, 3, 6, 5, 4];
const STEP_MS = 108;
const MARK: Record<Exclude<LatticeStatus, 'working'>, number[]> = {
  done: [2, 3, 5, 7],
  failed: [0, 2, 4, 6, 8],
  stopped: [0, 3, 6, 2, 5, 8],
  idle: [4],
};

export function LatticeGlyph({ status, className }: { status: LatticeStatus; className?: string }) {
  const mark = status === 'working' ? MARK.done : MARK[status];
  return (
    <span
      className={`picks-lattice${className ? ` ${className}` : ''}`}
      data-status={status}
      aria-hidden="true"
      style={{ '--picks-lattice-cycle': `${STEP_MS * 8}ms` } as CSSProperties}
    >
      <span className="picks-lattice__layer picks-lattice__run">
        {ORBIT.map((order, index) => (
          <span
            key={index}
            className="picks-lattice__cell"
            data-hole={order === null ? '' : undefined}
            style={order === null ? undefined : { animationDelay: `${order * STEP_MS}ms` }}
          />
        ))}
      </span>
      <span className="picks-lattice__layer picks-lattice__mark">
        {ORBIT.map((_, index) => (
          <span key={index} className="picks-lattice__cell" data-on={mark.includes(index) ? '' : undefined} />
        ))}
      </span>
    </span>
  );
}
