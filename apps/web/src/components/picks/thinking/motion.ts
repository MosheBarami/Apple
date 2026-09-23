// Shared motion helpers for the Thinking lane's picks.
//
// Everything in this folder animates without a dependency: CSS keyframes where the motion is a
// loop that CSS can describe, the Web Animations API where a value has to be measured first (a
// disclosure's height) or a keyframe offset depends on the text (a shimmer's rest), and
// requestAnimationFrame for the three canvases.
//
// CSS animations are already stopped for a reader who asked for less motion — system.css kills
// them under the media query and under `.motion-reduced`. Scripted motion is not covered by either,
// so every scripted animation here asks `lessMotion()` first.

/** True when the OS or the app's own setting (the `.motion-reduced` class) asks for less motion. */
export function lessMotion(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return true;
  if (document.documentElement.classList.contains('motion-reduced')) return true;
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Thought Line's settle curve (React Bits), which the disclosure and the label crossfade share. */
export const EASE_SETTLE = 'cubic-bezier(.23,1,.32,1)';
/** Animate UI's Collapsible duration: 0.35s. */
export const DISCLOSURE_MS = 350;

function cancelAll(el: HTMLElement) {
  if (typeof el.getAnimations === 'function') for (const a of el.getAnimations()) a.cancel();
}

/**
 * OPEN: height 0 → its measured height, opacity 0 → 1, y 12px → 0 (Animate UI's Collapsible, with
 * Thought Line's settle curve). Called after the element is already visible, so a reader who asked
 * for less motion simply sees it open.
 */
export function expand(el: HTMLElement | null) {
  if (!el || typeof el.animate !== 'function' || lessMotion()) return;
  cancelAll(el);
  const height = el.scrollHeight;
  if (!height) return;
  const previous = el.style.overflow;
  el.style.overflow = 'hidden';
  const animation = el.animate(
    [
      { height: '0px', opacity: 0, transform: 'translateY(12px)' },
      { height: `${height}px`, opacity: 1, transform: 'none' },
    ],
    { duration: DISCLOSURE_MS, easing: EASE_SETTLE },
  );
  const restore = () => { el.style.overflow = previous; };
  animation.onfinish = restore;
  animation.oncancel = restore;
}

/**
 * CLOSE: the reverse, resolved when the element has reached height 0 so the caller can hide it.
 * Resolves at once when there is nothing to animate.
 */
export function collapse(el: HTMLElement | null): Promise<void> {
  if (!el || el.hidden || typeof el.animate !== 'function' || lessMotion()) return Promise.resolve();
  cancelAll(el);
  const height = el.getBoundingClientRect().height;
  if (!height) return Promise.resolve();
  el.style.overflow = 'hidden';
  const animation = el.animate(
    [
      { height: `${height}px`, opacity: 1, transform: 'none' },
      { height: '0px', opacity: 0, transform: 'translateY(12px)' },
    ],
    // Held at the last frame until the caller hides the element; the next `expand` cancels it.
    { duration: Math.round(DISCLOSURE_MS * 0.7), easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' },
  );
  return new Promise((resolve) => {
    animation.onfinish = () => { el.style.overflow = ''; resolve(); };
    animation.oncancel = () => { el.style.overflow = ''; resolve(); };
  });
}
