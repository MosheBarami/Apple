/*
 * The call to action's two scripted qualities (see CtaButton.astro):
 *   - the specular rim, lit on the side nearest the pointer while the pointer is within REACH px;
 *   - the one sheen when the button first scrolls into view.
 * Everything else is CSS. The rim is a light, not a movement, so it stays under reduced motion;
 * the sheen does not.
 */
import { reducedMotion } from './motion';

const REACH = 120;

export function mountCtas(): void {
  const ctas = [...document.querySelectorAll<HTMLElement>('[data-cta]')];
  if (!ctas.length) return;

  let px = -1e6, py = -1e6, queued = false;
  const paint = () => {
    queued = false;
    for (const el of ctas) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -REACH || r.top > innerHeight + REACH) continue;
      const dx = Math.max(r.left - px, 0, px - r.right);
      const dy = Math.max(r.top - py, 0, py - r.bottom);
      const spec = Math.max(0, 1 - Math.hypot(dx, dy) / REACH);
      el.style.setProperty('--cta-spec', spec.toFixed(3));
      el.style.setProperty('--cta-x', `${(px - r.left).toFixed(1)}px`);
      el.style.setProperty('--cta-y', `${(py - r.top).toFixed(1)}px`);
    }
  };
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    px = e.clientX; py = e.clientY;
    if (!queued) { queued = true; requestAnimationFrame(paint); }
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { px = py = -1e6; paint(); });

  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      if (reducedMotion()) continue;
      const el = e.target as HTMLElement;
      el.classList.add('is-shine');
      el.addEventListener('animationend', () => el.classList.remove('is-shine'), { once: true });
    }
  }, { threshold: 0.8 });
  for (const el of ctas) io.observe(el);
}
