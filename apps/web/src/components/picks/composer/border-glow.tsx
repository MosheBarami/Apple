// REACT BITS' "BORDER GLOW" on the message box: the card's edge lights up in the accent on the side
// the pointer is nearest, brighter the closer the pointer is to the edge, and once — the first time
// the box appears on a page load — a light sweeps once around it to say "type here".
//
// Rebuilt from what the component does (React Bits is MIT with the Commons Clause, so none of its
// code is copied): pointer position → two custom properties, `--pk-edge` (0–100, how near the edge)
// and `--pk-angle` (which way round), and the sheet draws a conic ring masked to the border from
// those. The sweep is the same two properties driven by requestAnimationFrame.
//
// Blue only: the one violet in the product is Autonomous-on, and a violet edge here would spend it.
// Nothing at all under prefers-reduced-motion or on touch, and nothing while the box is disabled.
import { useEffect, useRef, type RefObject } from 'react';
import { finePointer, reducedMotion } from './motion';
import './border-glow.css';

let sweptThisLoad = false;

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeIn = (t: number) => t ** 3;

export function BorderGlow({ hostRef }: { hostRef: RefObject<HTMLElement | null> }) {
  const glow = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const el = glow.current;
    if (!host || !el || reducedMotion()) return;
    let raf = 0;
    const set = (edge: number, angle: number) => {
      el.style.setProperty('--pk-edge', edge.toFixed(2));
      el.style.setProperty('--pk-angle', `${angle.toFixed(2)}deg`);
    };

    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || raf) return;
      const r = host.getBoundingClientRect();
      const cx = r.width / 2;
      const cy = r.height / 2;
      const dx = e.clientX - r.left - cx;
      const dy = e.clientY - r.top - cy;
      // How far toward the nearer edge the pointer is, 0 at the centre and 1 on the edge.
      const kx = dx ? cx / Math.abs(dx) : Number.POSITIVE_INFINITY;
      const ky = dy ? cy / Math.abs(dy) : Number.POSITIVE_INFINITY;
      const edge = Math.min(Math.max(1 / Math.min(kx, ky), 0), 1);
      let angle = dx || dy ? (Math.atan2(dy, dx) * 180) / Math.PI + 90 : 0;
      if (angle < 0) angle += 360;
      set(edge * 100, angle);
    };
    const leave = () => { if (!raf) set(0, Number.parseFloat(el.style.getPropertyValue('--pk-angle')) || 45); };

    if (finePointer()) {
      host.addEventListener('pointermove', move);
      host.addEventListener('pointerleave', leave);
    }

    // THE SWEEP: in to full strength, once round, and out — about four seconds, once per page load.
    if (!sweptThisLoad) {
      sweptThisLoad = true;
      const t0 = performance.now();
      const a0 = 110;
      const a1 = 465;
      const tick = (now: number) => {
        const t = (now - t0) / 1000;
        const edge = t < 0.5 ? easeOut(t / 0.5) * 100 : t < 2.5 ? 100 : t < 4 ? 100 * (1 - easeIn((t - 2.5) / 1.5)) : 0;
        const p = t < 1.5 ? easeIn(t / 1.5) * 0.5 : t < 3.75 ? 0.5 + easeOut((t - 1.5) / 2.25) * 0.5 : 1;
        set(edge, a0 + (a1 - a0) * p);
        raf = t < 4 ? requestAnimationFrame(tick) : 0;
      };
      raf = requestAnimationFrame(tick);
    }
    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerleave', leave);
    };
  }, [hostRef]);

  return (
    <span ref={glow} className="pk-glow" aria-hidden="true" />
  );
}
