/*
 * The pointer rim's angle, re-implemented from what Motion's "Conic gradient pointer" example does
 * (none of its code): the target angle is the pointer's bearing from the control's centre, the
 * change is always taken the short way round, and the drawn angle follows on a damped spring
 * (stiffness 120, damping 20, as the example is tuned). Under reduced motion it jumps instead.
 */
import { reducedMotion } from './motion';

const REACH = 220;

export function mountRims(): void {
  for (const host of document.querySelectorAll<HTMLElement>('[data-rim]')) {
    let target = 0, angle = 0, vel = 0, raf = 0, last = 0;

    const step = (now: number) => {
      const dt = Math.min(0.032, last ? (now - last) / 1000 : 0.016);
      last = now;
      vel += (-120 * (angle - target) - 20 * vel) * dt;
      angle += vel * dt;
      host.style.setProperty('--prim-a', `${angle.toFixed(2)}deg`);
      if (Math.abs(vel) < 0.01 && Math.abs(angle - target) < 0.01) { raf = 0; last = 0; return; }
      raf = requestAnimationFrame(step);
    };

    document.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const r = host.getBoundingClientRect();
      const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
      const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
      const near = Math.max(0, 1 - Math.hypot(dx, dy) / REACH);
      host.style.setProperty('--prim-near', (near * 0.9).toFixed(3));
      if (!near) return;
      const bearing = (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI + 90;
      target = angle + ((((bearing - angle) % 360) + 540) % 360) - 180;
      if (reducedMotion()) {
        angle = target; vel = 0;
        host.style.setProperty('--prim-a', `${angle.toFixed(2)}deg`);
      } else if (!raf) {
        raf = requestAnimationFrame(step);
      }
    }, { passive: true });
  }
}
