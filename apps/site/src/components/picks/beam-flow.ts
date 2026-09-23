/*
 * The beam diagram's curves (see BeamFlow.astro). Each beam is a cubic curve from the edge of one
 * node that faces the other to the edge of the other; the axis it leaves along is whichever axis
 * separates the two most, so the same code draws side-by-side columns and a stacked phone layout.
 * The travelling light is CSS (a one-unit dash run along a pathLength=1 curve); this file only
 * places the curves and pauses them off screen.
 */
import { whileVisible } from './motion';

const NS = 'http://www.w3.org/2000/svg';

type Box = { x: number; y: number; w: number; h: number };

function port(a: Box, b: Box, horiz: boolean): { s: [number, number]; e: [number, number] } {
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
  if (horiz) {
    const dir = Math.sign(bx - ax) || 1;
    return { s: [ax + (dir * a.w) / 2, ay], e: [bx - (dir * b.w) / 2, by] };
  }
  const dir = Math.sign(by - ay) || 1;
  return { s: [ax, ay + (dir * a.h) / 2], e: [bx, by - (dir * b.h) / 2] };
}

function curve(a: Box, b: Box, horiz: boolean): string {
  const { s, e } = port(a, b, horiz);
  const m = horiz ? (e[0] - s[0]) / 2 : (e[1] - s[1]) / 2;
  const c1 = horiz ? [s[0] + m, s[1]] : [s[0], s[1] + m];
  const c2 = horiz ? [e[0] - m, e[1]] : [e[0], e[1] - m];
  const f = (n: number) => n.toFixed(1);
  return `M ${f(s[0])} ${f(s[1])} C ${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(e[0])} ${f(e[1])}`;
}

export function mountBeams(): void {
  for (const fig of document.querySelectorAll<HTMLElement>('[data-beam]')) {
    const grid = fig.querySelector<HTMLElement>('.beam-grid');
    const svg = fig.querySelector<SVGSVGElement>('.beam-svg');
    const hub = fig.querySelector<HTMLElement>('[data-beam-hub]');
    if (!grid || !svg || !hub) continue;

    /* Unidirectional: every beam runs the way the work goes — into the hub, then out of it. */
    const pairs: [HTMLElement, HTMLElement][] = [
      ...[...fig.querySelectorAll<HTMLElement>('[data-beam-in]')].map((n) => [n, hub] as [HTMLElement, HTMLElement]),
      ...[...fig.querySelectorAll<HTMLElement>('[data-beam-out]')].map((n) => [hub, n] as [HTMLElement, HTMLElement]),
    ];

    const beams = pairs.map(([from, to], i) => {
      const base = document.createElementNS(NS, 'path');
      base.setAttribute('class', 'beam-base');
      const run = document.createElementNS(NS, 'path');
      run.setAttribute('class', 'beam-run');
      run.setAttribute('pathLength', '1');
      /* Each at its own pace, as the originals are: a spread of durations and a stagger. */
      run.style.setProperty('--beam-dur', `${(2.8 + ((i * 0.73) % 1.6)).toFixed(2)}s`);
      run.style.setProperty('--beam-delay', `${(-(i * 0.61) % 3).toFixed(2)}s`);
      svg.append(base, run);
      return { from, to, base, run };
    });

    const box = (el: HTMLElement, g: DOMRect): Box => {
      const r = el.getBoundingClientRect();
      return { x: r.left - g.left, y: r.top - g.top, w: r.width, h: r.height };
    };

    const layout = () => {
      const g = grid.getBoundingClientRect();
      const col = fig.querySelector<HTMLElement>('.beam-col');
      const c = col ? col.getBoundingClientRect() : g;
      const h = hub.getBoundingClientRect();
      const horiz = c.right <= h.left || c.left >= h.right;
      svg.setAttribute('viewBox', `0 0 ${g.width.toFixed(1)} ${g.height.toFixed(1)}`);
      svg.setAttribute('width', g.width.toFixed(1));
      svg.setAttribute('height', g.height.toFixed(1));
      /* Stacked, a node's label sits under its dot, so a beam leaves from under the whole node
         rather than through the words. */
      const end = (el: HTMLElement) => (horiz || el === hub ? el : el.closest<HTMLElement>('.beam-node') || el);
      for (const b of beams) {
        const d = curve(box(end(b.from), g), box(end(b.to), g), horiz);
        b.base.setAttribute('d', d);
        b.run.setAttribute('d', d);
      }
      fig.classList.add('is-drawn');
    };

    layout();
    if ('ResizeObserver' in window) new ResizeObserver(layout).observe(grid);
    /* Paused until the observer says it is on screen. `whileVisible` only calls `off` after an
       `on`, so a figure that loads below the fold would otherwise animate unseen. */
    fig.classList.add('is-paused');
    whileVisible(fig, () => fig.classList.remove('is-paused'), () => fig.classList.add('is-paused'), '0px');
  }
}
