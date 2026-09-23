// Motion "Skeleton Shimmer" (MIT, motion.dev/examples/react-skeleton-shimmer), without Motion:
// placeholder bars whose sheen travels across them while something loads, and a Reveal that
// brings the loaded thing in from a slight blur (opacity 0 -> 1, blur 4px -> 0, 0.25s), as the
// example swaps its skeleton for the real card. Both are CSS keyframes, so reduced motion leaves
// still bars and content that is simply there.
import type { CSSProperties, ReactNode } from 'react';
import './skeleton.css';

const WIDTHS = ['100%', '90%', '70%', '84%', '60%'];

export function Skeleton({ lines = 3, label = 'Loading' }: { lines?: number; label?: string }) {
  return (
    <div className="picks-skeleton" role="status" aria-label={label}>
      {Array.from({ length: Math.max(1, lines) }, (_, index) => (
        <span
          key={index}
          className="picks-skeleton__bar"
          style={{ width: WIDTHS[index % WIDTHS.length] } as CSSProperties}
        />
      ))}
    </div>
  );
}

export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`picks-reveal${className ? ` ${className}` : ''}`}>{children}</div>;
}
