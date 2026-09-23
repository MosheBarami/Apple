// Motion helpers for the chat-core picks.
//
// apps/web has no motion library, so every pick that came from Motion, GSAP or Animate UI is
// re-implemented here with the Web Animations API and CSS. These are the three things they all
// need: one question about the reader's settings, one overshoot curve standing in for the
// libraries' springs, and FLIP (First, Last, Invert, Play) — which is what Motion's `layout` /
// `layoutId` and GSAP's Flip plugin are underneath.

/** A spring stand-in: leaves fast, overshoots a little, settles. */
export const OVERSHOOT = 'cubic-bezier(.34,1.36,.64,1)';
/** The calmer settle used where an overshoot would read as a wobble (lists, menus). */
export const SETTLE = 'cubic-bezier(.16,1,.3,1)';

export function reducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Whether `el.animate` exists and the reader has not asked for less motion. */
export function canAnimate(el: Element | null | undefined): el is HTMLElement {
  return !!el && typeof (el as HTMLElement).animate === 'function' && !reducedMotion();
}

/**
 * Play an element from where it WAS (`first`) to where it is now. Call it after the DOM change,
 * with the rect measured before it. Translation only unless `scale` is asked for: scaling a row
 * of text squashes the glyphs mid-flight.
 */
export function flip(
  el: HTMLElement,
  first: DOMRect,
  { scale = false, duration = 320, easing = OVERSHOOT }: { scale?: boolean; duration?: number; easing?: string } = {},
): Animation | null {
  if (!canAnimate(el)) return null;
  const last = el.getBoundingClientRect();
  const dx = first.left - last.left;
  const dy = first.top - last.top;
  const sx = scale && last.width ? first.width / last.width : 1;
  const sy = scale && last.height ? first.height / last.height : 1;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return null;
  return el.animate(
    [
      { transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
      { transformOrigin: '0 0', transform: 'none' },
    ],
    { duration, easing },
  );
}

/** Animate an element's own width from `from` to what it measures now (a badge changing words). */
export function tweenWidth(el: HTMLElement, from: number | null): number {
  const to = el.offsetWidth;
  if (from !== null && Math.abs(from - to) > 0.5 && canAnimate(el)) {
    el.animate([{ width: `${from}px` }, { width: `${to}px` }], { duration: 260, easing: OVERSHOOT });
  }
  return to;
}
