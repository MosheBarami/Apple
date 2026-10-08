"use client";
import { MoonIcon, SunIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function AmbientField({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`ambient-field ${className}`}>
      <div className="ambient-aurora" />
      <div className="ambient-aurora ambient-aurora-two" />
      <div className="ambient-stars" />
      <div className="ambient-grid" />
    </div>
  );
}
export function ThemeToggle() {
  const reduce = useReducedMotion();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = !mounted || resolvedTheme === "dark";
  return (
    <button
      type="button"
      className="theme-switch"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={dark ? "moon" : "sun"}
          initial={{
            opacity: 0,
            transform: reduce ? "none" : "rotate(-45deg) scale(.8)",
          }}
          animate={{ opacity: 1, transform: "rotate(0deg) scale(1)" }}
          exit={{
            opacity: 0,
            transform: reduce ? "none" : "rotate(45deg) scale(.8)",
          }}
          transition={{ duration: 0.16 }}
        >
          {dark ? (
            <MoonIcon className="size-4" />
          ) : (
            <SunIcon className="size-4" />
          )}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
