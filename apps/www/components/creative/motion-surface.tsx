"use client";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
import type { ReactNode } from "react";
export function MotionSurface({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0),
    y = useMotionValue(0);
  const rx = useSpring(x, { damping: 24, stiffness: 170 }),
    ry = useSpring(y, { damping: 24, stiffness: 170 });
  return (
    <motion.div
      className={className}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse" || reduce) {
          return;
        }
        const r = e.currentTarget.getBoundingClientRect();
        x.set((-(e.clientY - r.top - r.height / 2) / r.height) * 5);
        y.set(((e.clientX - r.left - r.width / 2) / r.width) * 5);
      }}
      style={{
        rotateX: reduce ? 0 : rx,
        rotateY: reduce ? 0 : ry,
        transformPerspective: 1000,
      }}
    >
      {children}
    </motion.div>
  );
}
