"use client";

import { PauseIcon, PlayIcon } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState } from "react";

const MotionContext = createContext({ paused: false, toggle: () => {} });

/** Decorative motion only. Real agent activity keeps its own status semantics. */
export function AtmosphereProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  useEffect(() => {
    try {
      setPaused(localStorage.getItem("studpilot:ambient-motion") === "paused");
    } catch {}
  }, []);
  useEffect(() => {
    pausedRef.current = paused;
    document.documentElement.dataset.ambientMotion = paused
      ? "paused"
      : "running";
  }, [paused]);
  useEffect(() => {
    const root = document.documentElement;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const move = (event: PointerEvent) => {
      if (
        frame ||
        pausedRef.current ||
        preference.matches ||
        event.pointerType !== "mouse"
      )
        return;
      const x = event.clientX / innerWidth;
      const y = event.clientY / innerHeight;
      frame = requestAnimationFrame(() => {
        root.style.setProperty("--light-x", `${35 + x * 30}%`);
        root.style.setProperty("--light-y", `${10 + y * 25}%`);
        frame = 0;
      });
    };
    const visibility = () => {
      root.dataset.pageVisibility = document.hidden ? "hidden" : "visible";
    };
    visibility();
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  const toggle = () =>
    setPaused((previous) => {
      try {
        localStorage.setItem(
          "studpilot:ambient-motion",
          previous ? "running" : "paused"
        );
      } catch {}
      return !previous;
    });
  return (
    <MotionContext.Provider value={{ paused, toggle }}>
      {children}
    </MotionContext.Provider>
  );
}

export function MotionControl() {
  const { paused, toggle } = useContext(MotionContext);
  return (
    <button
      type="button"
      className="ambient-control"
      onClick={toggle}
      aria-label={paused ? "Resume ambient motion" : "Pause ambient motion"}
      aria-pressed={paused}
      title={paused ? "Resume ambient motion" : "Pause ambient motion"}
    >
      {paused ? <PlayIcon size={14} /> : <PauseIcon size={14} />}
    </button>
  );
}

/** Original CSS sculpture: a studded block suspended in orbital light. */
export function BuildConstellation({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`build-constellation ${compact ? "is-compact" : ""}`}
      aria-hidden="true"
    >
      <div className="constellation-halo" />
      <div className="constellation-grid" />
      <div className="constellation-orbit orbit-one">
        <i />
      </div>
      <div className="constellation-orbit orbit-two">
        <i />
      </div>
      <div className="constellation-orbit orbit-three" />
      <div className="constellation-float">
        <div className="constellation-cube">
          <div className="cube-face cube-front">
            <span>SP</span>
          </div>
          <div className="cube-face cube-back" />
          <div className="cube-face cube-right" />
          <div className="cube-face cube-left" />
          <div className="cube-face cube-top">
            {[0, 1, 2, 3].map((i) => (
              <i key={i} />
            ))}
          </div>
          <div className="cube-face cube-bottom" />
        </div>
      </div>
      <span className="constellation-spark spark-one" />
      <span className="constellation-spark spark-two" />
      <span className="constellation-spark spark-three" />
    </div>
  );
}

export function PromptArtwork({ kind }: { kind: number }) {
  return (
    <span className={`prompt-artwork artwork-${kind % 3}`} aria-hidden="true">
      <span className="artwork-orbit" />
      {kind % 3 === 0 ? (
        <span className="artwork-interface">
          <i />
          <i />
          <i />
          <b />
          <b />
        </span>
      ) : kind % 3 === 1 ? (
        <span className="artwork-coins">
          <i />
          <i />
          <i />
        </span>
      ) : (
        <span className="artwork-world">
          <i />
          <i />
          <i />
          <b />
        </span>
      )}
    </span>
  );
}
