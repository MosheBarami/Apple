// AN ICON THAT MOVES WHEN ITS CONTROL IS REACHED FOR.
//
// Animate UI "Animated Icons" (MIT + Commons Clause, re-implemented): each icon has a small motion
// of its own that plays when the pointer arrives or the control takes keyboard focus — the pen
// writes, the gear turns, the gauge swings. The product keeps its own glyphs (components/icons.ts);
// only the motion is added, so an icon never changes shape between routes. It plays once per
// arrival, never loops, and never plays at all for a reader who asked for less motion.
import type { ReactNode } from 'react';
import './animated-icon.css';

export type IconMotion = 'write' | 'pop' | 'slide' | 'swing' | 'turn' | 'drop' | 'nudge' | 'lift';

export function AnimatedIcon({ motion, children }: { motion: IconMotion; children: ReactNode }) {
  return (
    <span className="pk-aicon" data-motion={motion} aria-hidden="true">
      {children}
    </span>
  );
}
