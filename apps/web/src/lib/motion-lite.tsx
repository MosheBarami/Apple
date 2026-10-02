import { createElement } from "react";
import type { ComponentType, CSSProperties, ElementType } from "react";

/**
 * THE ONE THING THE APP USED `motion` FOR, WITHOUT `motion`.
 *
 * AI Elements' Shimmer (components/ai-elements/shimmer.tsx, genuine upstream bytes apart from the two
 * import lines recorded in its NOTICE row) sweeps a gradient across words with
 * `motion.create(tag)` and `animate={{ backgroundPosition }}`. Nothing else in the app imports the
 * library, and it was 124 kB of raw script (motion-dom, framer-motion, motion-utils) in the entry
 * chunk every visitor downloads. This is the part of its API Shimmer calls, as a CSS animation.
 *
 * What it understands: `initial` and `animate` carrying `backgroundPosition`, and a `transition`
 * with `duration` in seconds and `repeat: Infinity`. Anything else is ignored, which is stated here
 * rather than discovered: this is not a general animation library. The keyframes are
 * `motion-lite-bg` in design/apple-minimal.css, switched off under reduced motion.
 */
export interface MotionProps {
  initial?: Record<string, string | number>;
  animate?: Record<string, string | number>;
  transition?: { duration?: number; ease?: string; repeat?: number };
  style?: CSSProperties;
  className?: string;
}

function create(tag: ElementType): ComponentType<MotionProps & Record<string, unknown>> {
  return function MotionLite({ initial, animate, transition, style, className, ...rest }) {
    const from = initial?.backgroundPosition;
    const to = animate?.backgroundPosition;
    const sweeping = from !== undefined && to !== undefined;
    const vars = sweeping
      ? ({
          "--ml-from": String(from),
          "--ml-to": String(to),
          "--ml-dur": `${transition?.duration ?? 1}s`,
          backgroundPosition: String(from),
        } as CSSProperties)
      : undefined;
    return createElement(tag, {
      ...rest,
      className: [sweeping ? "motion-lite-bg" : "", className].filter(Boolean).join(" "),
      style: { ...vars, ...style },
    });
  };
}

export const motion = { create };
