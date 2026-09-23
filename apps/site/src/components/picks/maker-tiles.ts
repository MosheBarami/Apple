/*
 * The maker tiles' two behaviours (see MakerTiles.astro):
 *   - arrival (Eldora Integrations): each tile fades in after its own shuffled delay, once;
 *   - the passing light (Eldora Animated Frameworks): a light runs along the rail and the tile it
 *     is under tips up. Only while the row is on screen, never under reduced motion.
 */
import { loop, onMotionChange, reducedMotion, whileVisible } from './motion';

const PER_TILE = 1.1; // seconds of the light's run per tile

export function mountMakerTiles(): void {
  for (const root of document.querySelectorAll<HTMLElement>('[data-mk]')) {
    const tiles = [...root.querySelectorAll<HTMLElement>('.mk-tile')];
    const light = root.querySelector<HTMLElement>('.mk-light');
    if (!tiles.length || !light) continue;

    /* Arrival. A shuffled order, fixed per visit, spread over about a second. */
    if ('IntersectionObserver' in window && !reducedMotion()) {
      const order = tiles.map((_, i) => i).sort(() => Math.random() - 0.5);
      order.forEach((n, k) => { tiles[n].style.transitionDelay = `${(k * 0.12).toFixed(2)}s`; });
      root.classList.add('is-armed');
      const io = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        root.classList.add('is-in');
        window.setTimeout(() => { for (const t of tiles) t.style.transitionDelay = ''; }, 2400);
      }, { threshold: 0.4 });
      io.observe(root);
      /* A failsafe: whatever the observer does, the row is shown within three seconds. */
      window.setTimeout(() => root.classList.add('is-in'), 3000);
    }

    /* The passing light. */
    const run = loop((t) => {
      const railW = root.clientWidth;
      const span = tiles.length * PER_TILE;
      const p = (t % span) / span;
      const x = p * railW;
      light.style.transform = `translateX(${(x - 28).toFixed(1)}px)`;
      const base = root.getBoundingClientRect().left;
      for (const tile of tiles) {
        const r = tile.getBoundingClientRect();
        const cx = r.left - base + r.width / 2;
        tile.classList.toggle('is-up', Math.abs(cx - x) < r.width / 2 + 4);
      }
    });
    let visible = false;
    const sync = () => {
      const on = visible && !reducedMotion();
      if (on) run.start(); else { run.stop(); for (const tile of tiles) tile.classList.remove('is-up'); }
      root.classList.toggle('is-running', on);
    };
    onMotionChange(sync);
    whileVisible(root, () => { visible = true; sync(); }, () => { visible = false; sync(); }, '0px');
  }
}
