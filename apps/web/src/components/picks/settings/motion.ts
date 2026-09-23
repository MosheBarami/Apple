// Shared motion helpers for the account-screen picks (settings, usage, projects, sign-in, tour).
//
// apps/web ships no animation library, so the spring feel the picked components have upstream
// (Motion, GSAP, Animate UI) is rebuilt here from two native parts: a spring simulated once into a
// CSS `linear()` easing, which the Web Animations API and CSS transitions can both play, and a
// requestAnimationFrame tween for the few values that are not CSS (SVG attributes, counters).
//
// Every caller asks `reducedMotion()` first. It answers yes for the OS setting AND for the
// product's own "Always reduce" preference, which lib/theme.tsx writes as `html.motion-reduced`.
import { useEffect, useState } from 'react';

export function reducedMotion(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    if (document.documentElement.classList.contains('motion-reduced')) return true;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Re-renders when either reduced-motion source changes. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(reducedMotion);
  useEffect(() => {
    const sync = () => setReduced(reducedMotion());
    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      mq.addEventListener?.('change', sync);
    } catch {
      mq = null;
    }
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      mq?.removeEventListener?.('change', sync);
      obs.disconnect();
    };
  }, []);
  return reduced;
}

export interface SpringEasing {
  /** A CSS `linear(...)` easing that traces the spring. */
  easing: string;
  /** How long the spring takes to settle, in ms. */
  duration: number;
}

const springCache = new Map<string, SpringEasing>();

/**
 * Simulate a damped spring once and sample it into a CSS `linear()` easing.
 * stiffness/damping/mass have the same meaning as in Motion's spring options.
 */
export function spring(stiffness = 300, damping = 25, mass = 1): SpringEasing {
  const key = `${stiffness}/${damping}/${mass}`;
  const hit = springCache.get(key);
  if (hit) return hit;
  let x = 0;
  let v = 0;
  let t = 0;
  const dt = 1 / 240;
  const pts: number[] = [0];
  while (t < 3) {
    const a = (-stiffness * (x - 1) - damping * v) / mass;
    v += a * dt;
    x += v * dt;
    t += dt;
    pts.push(x);
    if (t > 0.1 && Math.abs(x - 1) < 0.0005 && Math.abs(v) < 0.005) break;
  }
  const n = Math.min(60, pts.length - 1);
  const out: string[] = [];
  for (let i = 0; i <= n; i++) {
    const p = i === n ? 1 : pts[Math.round((i / n) * (pts.length - 1))] ?? 1;
    out.push(p.toFixed(4));
  }
  const made = { easing: `linear(${out.join(',')})`, duration: Math.round(t * 1000) };
  springCache.set(key, made);
  return made;
}

/** The ease most of these components use for a plain arrival. */
export const EASE_OUT = 'cubic-bezier(.23,1,.32,1)';

/**
 * Tween a number with requestAnimationFrame. Returns a cancel function.
 * Jumps straight to the end under reduced motion.
 */
export function tween(
  from: number,
  to: number,
  duration: number,
  onUpdate: (v: number) => void,
  ease: (t: number) => number = (t) => 1 - Math.pow(1 - t, 3),
): () => void {
  if (reducedMotion() || duration <= 0 || from === to) {
    onUpdate(to);
    return () => {};
  }
  let raf = 0;
  const start = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - start) / duration);
    onUpdate(from + (to - from) * ease(p));
    if (p < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/** power3.inOut — the curve the GSAP credits meter used. */
export const inOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * A number that glides to its target instead of jumping. Used for the credits ring, whose arc and
 * figure are SVG attributes the GSAP AttrPlugin used to tween.
 */
export function useTweenedNumber(target: number, duration = 900, initial = target): number {
  const [shown, setShown] = useState(initial);
  useEffect(() => {
    let current = shown;
    const cancel = tween(current, target, duration, (v) => {
      current = v;
      setShown(v);
    }, inOutCubic);
    return cancel;
    // `shown` is the start point of THIS tween only; re-running on it would restart every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);
  return shown;
}
