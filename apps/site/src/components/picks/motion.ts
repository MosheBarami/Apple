/*
 * THE FOUR RULES EVERY MOVING PICK ON THE LANDING OBEYS, IN ONE PLACE.
 *
 *   1. Reduced motion wins. `reducedMotion()` is read live, so a reader who flips the OS setting
 *      mid-visit is honoured on the next frame, not on the next page load.
 *   2. Nothing draws while it is off screen or while the tab is hidden (`whileVisible`).
 *   3. Colours are the site's tokens, read off :root, and re-read when the theme changes
 *      (`token`, `onThemeChange`), so the light theme is never a dark drawing on a white page.
 *   4. Every loop is one requestAnimationFrame chain that can be stopped (`loop`).
 *
 * No dependency: the owner's picks came from GSAP / Motion / React Bits demos, and their behaviour
 * is re-implemented here with the platform alone.
 */

const query = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : null;

export const reducedMotion = (): boolean => !!(query && query.matches);

/** Calls `cb` whenever the reduced-motion preference changes. */
export function onMotionChange(cb: () => void): void {
  if (!query) return;
  if (typeof query.addEventListener === 'function') query.addEventListener('change', cb);
}

/** A token's current value, e.g. token('--line-strong') -> '#3b3d46'. */
export function token(name: string, fallback = '#888888'): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Runs `cb` when <html data-theme> changes (the site's theme toggle writes it). */
export function onThemeChange(cb: () => void): void {
  new MutationObserver(cb).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

/**
 * `on` when the element is on screen and the tab is visible, `off` otherwise. Without
 * IntersectionObserver the element counts as visible, so nothing is ever left blank.
 */
export function whileVisible(el: Element, on: () => void, off: () => void, margin = '120px'): void {
  let inView = !('IntersectionObserver' in window);
  let running = false;
  const sync = () => {
    const want = inView && document.visibilityState !== 'hidden';
    if (want && !running) { running = true; on(); }
    else if (!want && running) { running = false; off(); }
  };
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      for (const e of entries) inView = e.isIntersecting;
      sync();
    }, { rootMargin: margin }).observe(el);
  }
  document.addEventListener('visibilitychange', sync);
  sync();
}

/**
 * A stoppable frame loop. `step` receives seconds since start and seconds since the last frame.
 * `stop()` works from inside `step` too (a loop that puts itself to sleep once settled): the next
 * frame is only requested if the loop is still on after the step returns.
 */
export function loop(step: (t: number, dt: number) => void) {
  let raf = 0;
  let on = false;
  let t0 = 0;
  let last = 0;
  const frame = (now: number) => {
    raf = 0;
    if (!on) return;
    if (!t0) t0 = now;
    if (!last) last = now;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step((now - t0) / 1000, dt);
    if (on) raf = requestAnimationFrame(frame);
  };
  return {
    start() { if (!on) { on = true; last = 0; raf = requestAnimationFrame(frame); } },
    stop() { on = false; if (raf) cancelAnimationFrame(raf); raf = 0; },
    get running() { return on; },
  };
}

/** Parses '#rgb', '#rrggbb' or 'rgb(a)(…)' into [r, g, b] 0–255. */
export function rgb(color: string): [number, number, number] {
  const c = color.trim();
  if (c.startsWith('#')) {
    const h = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1, 7);
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = c.match(/[\d.]+/g);
  return m ? [Number(m[0]), Number(m[1]), Number(m[2])] : [136, 136, 136];
}

/** Wraps v into [min, max) — GSAP's utils.wrap, which the ticker's endless row is built on. */
export const wrap = (min: number, max: number, v: number): number => {
  const r = max - min;
  return r === 0 ? min : ((((v - min) % r) + r) % r) + min;
};
