/*
 * Hover scramble for the navigation labels. Pick: Motion "Scramble text: Hover"
 * (LicenseRef-Motion-Plus) — its code is NOT used. What it does is re-implemented here: on hover
 * or keyboard focus the label's letters are replaced by random glyphs that resolve back to the real
 * letters from left to right over half a second.
 *
 * The label's width is held for the duration so the bar never shifts, the link's accessible name
 * is pinned with aria-label so a screen reader never hears the noise, and under reduced motion
 * nothing happens at all.
 */
import { reducedMotion } from './motion';

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const DURATION = 500;

export function scrambleOnHover(links: Iterable<HTMLElement>): void {
  for (const link of links) {
    const label = link.querySelector<HTMLElement>('[data-scramble]') || link;
    const text = label.textContent || '';
    if (!text.trim()) continue;
    if (!link.hasAttribute('aria-label')) link.setAttribute('aria-label', text.trim());
    let raf = 0;

    const run = () => {
      if (reducedMotion() || raf) return;
      label.style.display = 'inline-block';
      label.style.width = `${label.getBoundingClientRect().width}px`;
      label.style.whiteSpace = 'nowrap';
      label.style.overflow = 'hidden';
      const t0 = performance.now();
      const frame = (now: number) => {
        const p = Math.min(1, (now - t0) / DURATION);
        let out = '';
        for (let i = 0; i < text.length; i++) {
          const settle = (i / Math.max(1, text.length)) * 0.85 + 0.15;
          out += text[i] === ' ' || p >= settle ? text[i] : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        }
        label.textContent = out;
        if (p < 1) { raf = requestAnimationFrame(frame); return; }
        label.textContent = text;
        label.style.display = label.style.width = label.style.whiteSpace = label.style.overflow = '';
        raf = 0;
      };
      raf = requestAnimationFrame(frame);
    };

    link.addEventListener('pointerenter', run);
    link.addEventListener('focus', () => { if (link.matches(':focus-visible')) run(); });
  }
}
