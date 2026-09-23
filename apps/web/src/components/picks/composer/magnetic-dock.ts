// COMPONENTRY'S MAGNETIC DOCK (MIT), on the composer's round tools — the paperclip, the microphone,
// the credits ring and Send — rather than on a separate dock that would be one more thing to learn.
//
// Each `[data-dock]` button in the container swells toward the pointer: full size at the pointer,
// back to rest `DIST` pixels away, on a smoothed value integrated every frame so the growth has
// weight instead of snapping. The swell is small (at most 1.18) because these are 32px buttons next
// to a text box, not app icons, and it is written to a custom property (`--pk-dock`) that the CSS
// turns into `transform`. The press springs own `scale`, so a pressed, magnified Send is both.
//
// Off on touch (no pointer to follow) and under prefers-reduced-motion. The loop runs only while
// the pointer is near the dock or a button is still settling, and stops itself otherwise.
import { useEffect, type RefObject } from 'react';
import { finePointer, reducedMotion } from './motion';

const MAX = 1.18;
const DIST = 90;
const SMOOTH = 14; // per second: how quickly each button chases its target

export function useMagneticDock(containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const box = containerRef.current;
    if (!box || typeof window === 'undefined' || !finePointer() || reducedMotion()) return;
    let pointerX = Number.POSITIVE_INFINITY;
    let raf = 0;
    let last = 0;
    const scale = new WeakMap<HTMLElement, number>();

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;
      let moving = false;
      for (const el of box.querySelectorAll<HTMLElement>('[data-dock]')) {
        const r = el.getBoundingClientRect();
        const d = Math.abs(pointerX - (r.left + r.width / 2));
        const target = d >= DIST ? 1 : 1 + (MAX - 1) * (Math.cos((d / DIST) * Math.PI) + 1) / 2;
        const cur = scale.get(el) ?? 1;
        const next = cur + (target - cur) * (1 - Math.exp(-SMOOTH * dt));
        if (Math.abs(next - target) > 0.001) moving = true;
        scale.set(el, next);
        el.style.setProperty('--pk-dock', next.toFixed(4));
      }
      raf = moving ? requestAnimationFrame(frame) : 0;
      if (!raf) last = 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
    const move = (e: PointerEvent) => { if (e.pointerType === 'mouse') { pointerX = e.clientX; kick(); } };
    const leave = () => { pointerX = Number.POSITIVE_INFINITY; kick(); };

    box.addEventListener('pointermove', move);
    box.addEventListener('pointerleave', leave);
    return () => {
      box.removeEventListener('pointermove', move);
      box.removeEventListener('pointerleave', leave);
      if (raf) cancelAnimationFrame(raf);
      for (const el of box.querySelectorAll<HTMLElement>('[data-dock]')) el.style.removeProperty('--pk-dock');
    };
  }, [containerRef]);
}
