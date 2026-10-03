/*
 * The device's scroll reveal (see DeviceFrame.astro). Progress runs 0 -> 1 as the frame's top
 * moves from the bottom of the viewport to 20% down it; the tilt, scale and fade are mapped from
 * that linearly, as Motion's ScreenshotScrollReveal maps them. Reduced motion writes nothing, so
 * the frame stays at its CSS resting state, which is flat.
 */
import { onMotionChange, reducedMotion } from './motion';

export function mountDevices(): void {
  const bodies = [...document.querySelectorAll<HTMLElement>('[data-device] .device__body')];
  if (!bodies.length) return;

  let queued = false;
  const paint = () => {
    queued = false;
    const vh = window.innerHeight || 1;
    for (const b of bodies) {
      if (reducedMotion()) { b.style.transform = ''; b.style.opacity = ''; continue; }
      const top = b.getBoundingClientRect().top;
      const p = Math.max(0, Math.min(1, (vh - top) / (vh * 0.8)));
      const k = 1 - p;
      b.style.transform = k > 0.001 ? `rotateX(${(28 * k).toFixed(2)}deg) scale(${(1 - 0.1 * k).toFixed(4)})` : '';
      b.style.opacity = k > 0.001 ? (1 - 0.5 * k).toFixed(3) : '';
    }
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(paint); } };

  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue, { passive: true });
  onMotionChange(queue);
  paint();
}
