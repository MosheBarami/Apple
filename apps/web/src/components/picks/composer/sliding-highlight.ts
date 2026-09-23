// ANIMATE UI'S "HIGHLIGHT": one shared backdrop that travels to whichever item is current, instead
// of every item painting its own. Rebuilt on the Web Animations API with Animate UI's spring
// (350/35); none of its code is copied.
//
// `moveHighlight(pill, to, container)` puts the pill behind `to`, measured in the container's own
// coordinates (offsetLeft/offsetTop), so it keeps its place when the container scrolls. The first
// placement, and every placement under prefers-reduced-motion, is instant — a highlight that flew
// in from the corner on first paint would be a highlight that lied about where it had been.
import { reducedMotion, spring } from './motion';

const placed = new WeakSet<HTMLElement>();
const anims = new WeakMap<HTMLElement, Animation>();

export function moveHighlight(pill: HTMLElement, to: HTMLElement | null) {
  if (!to) {
    pill.style.opacity = '0';
    return;
  }
  const x = to.offsetLeft;
  const y = to.offsetTop;
  const w = to.offsetWidth;
  const h = to.offsetHeight;
  const target = { transform: `translate(${x}px, ${y}px)`, width: `${w}px`, height: `${h}px` };
  const instant = !placed.has(pill) || reducedMotion() || typeof pill.animate !== 'function';
  // Freeze wherever a running move has got to, so an interrupted move continues from there.
  try { anims.get(pill)?.commitStyles?.(); } catch { /* not rendered: nothing to freeze */ }
  anims.get(pill)?.cancel();
  if (!instant) {
    const from = { transform: pill.style.transform, width: pill.style.width, height: pill.style.height };
    const { easing, duration } = spring({ stiffness: 350, damping: 35 });
    anims.set(pill, pill.animate([from, target], { duration, easing }));
  }
  Object.assign(pill.style, target, { opacity: '1' });
  placed.add(pill);
}
