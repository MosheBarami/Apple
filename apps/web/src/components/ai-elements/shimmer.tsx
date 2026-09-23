"use client";

// Vendored from Vercel AI Elements (Apache-2.0), packages/elements/src/shimmer.tsx at
// 6a9d5b1822ffb10bba4bd97175f01edd7d8651cd. The verbatim original is ./upstream/shimmer.tsx.txt
// and ./NOTICE lists the local substitutions: motion/react's animated element is replaced by the
// requested element carrying `.ai-elements-shimmer`, whose sweep is driven by the same duration and
// spread props, with a reduced-motion opt-out.
//
// THREE SHIMMERS, ONE COMPONENT (2026-09-23, the owner's component picks, Thinking lane). The
// owner ticked AI Elements "shimmer", React Bits "Shiny Text" and Animate UI "Shimmering Text",
// which do one job — say "this is still happening" on a line of text — so they are merged here:
//
//   sweep (default)  AI Elements' band clipped to the text, drawn with Shiny Text's look: a soft
//                    band at 120deg (35% / 50% / 65% stops) over a 200% background. Between
//                    sweeps it RESTS for as long as Shimmering Text rests — 0.05s per character —
//                    so a long action name does not strobe. The rest depends on the text, which no
//                    CSS keyframe can express, so the sweep runs on the Web Animations API.
//   wave             Shimmering Text's per-glyph wave: each character brightens in turn, the same
//                    rest between passes. For a short standalone line (a wait's caption), where the
//                    glyph-by-glyph cadence reads; a truncating header line keeps the sweep.
//
// No code from React Bits or Animate UI is copied (their licence adds the Commons Clause); the
// behaviour is re-implemented from what each one does. Server-rendered and reduced-motion output is
// the plain text in its resting colour.
import { memo, useEffect, useMemo, useRef, type CSSProperties, type ElementType } from 'react';
import { lessMotion } from '../picks/thinking/motion';
import { cn } from './lib/utils';

export interface TextShimmerProps {
  children: string;
  as?: ElementType;
  className?: string;
  /** Seconds one pass takes. */
  duration?: number;
  spread?: number;
  /** `sweep` (default) or Shimmering Text's per-glyph `wave`. */
  variant?: 'sweep' | 'wave';
}

/** Animate UI's rest between passes: 0.05s per character. */
const REST_PER_CHAR = 0.05;

const ShimmerComponent = ({
  children,
  as: Component = 'p',
  className,
  duration = 2,
  spread = 2,
  variant = 'sweep',
}: TextShimmerProps) => {
  const length = children?.length ?? 0;
  const dynamicSpread = useMemo(() => length * spread, [length, spread]);
  const ref = useRef<HTMLElement | null>(null);
  const cycle = duration + length * REST_PER_CHAR;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== 'function' || lessMotion()) return;
    const sweepEnds = duration / cycle;
    const options: KeyframeAnimationOptions = { duration: cycle * 1000, iterations: Infinity };
    const animations: Animation[] = [];
    if (variant === 'sweep') {
      animations.push(el.animate(
        [
          { backgroundPosition: '150% center, 0 0', offset: 0 },
          { backgroundPosition: '-50% center, 0 0', offset: sweepEnds },
          { backgroundPosition: '-50% center, 0 0', offset: 1 },
        ],
        { ...options, easing: 'linear' },
      ));
    } else {
      const glyphs = el.querySelectorAll<HTMLElement>('.ai-elements-shimmer__glyph');
      glyphs.forEach((glyph, index) => {
        animations.push(glyph.animate(
          [
            { opacity: 0.45, offset: 0 },
            { opacity: 1, offset: sweepEnds / 2 },
            { opacity: 0.45, offset: sweepEnds },
            { opacity: 0.45, offset: 1 },
          ],
          { ...options, easing: 'ease-in-out', delay: (index * duration * 1000) / Math.max(1, glyphs.length) },
        ));
      });
    }
    return () => animations.forEach((a) => a.cancel());
  }, [children, cycle, duration, variant]);

  const style = {
    '--ai-shimmer-duration': `${duration}s`,
    '--ai-shimmer-spread': `${dynamicSpread}px`,
  } as CSSProperties;

  if (variant === 'wave') {
    return (
      <Component ref={ref} className={cn('ai-elements-shimmer ai-elements-shimmer--wave', className)} style={style}>
        <span className="visually-hidden">{children}</span>
        <span aria-hidden="true">
          {Array.from(children).map((char, index) => (
            <span key={index} className="ai-elements-shimmer__glyph">{char}</span>
          ))}
        </span>
      </Component>
    );
  }

  return (
    <Component ref={ref} className={cn('ai-elements-shimmer', className)} style={style}>
      {children}
    </Component>
  );
};

export const Shimmer = memo(ShimmerComponent);
