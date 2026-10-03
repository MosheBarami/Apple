/*
 * The prompt ticker (components/Marquee.astro). Two picks, re-implemented without either library:
 *   - GSAP ModifiersPlugin: the row's offset runs forever and is wrapped into [-length, 0), so
 *     the copy that follows the originals is always standing where they began — no seam, no reset;
 *   - Motion Ticker: the speed eases toward its target (full, slow under the pointer, stopped
 *     while a chip has keyboard focus) instead of jumping.
 */
import { loop, onMotionChange, reducedMotion, whileVisible, wrap } from './motion';

const SPEED = 36;   // px per second, at rest
const SLOW = 7;     // under the pointer

interface Row { el: HTMLElement; track: HTMLElement; dir: number; x: number; len: number; speed: number; hover: boolean; focus: boolean; }

export function mountTickers(): void {
  for (const root of document.querySelectorAll<HTMLElement>('[data-ticker]')) {
    try { mount(root); } catch (err) { console.error('ticker failed', err); }
  }
}

function mount(root: HTMLElement): void {
  const field = document.getElementById(root.dataset.fills || '') as HTMLTextAreaElement | null;

  /* A pressed chip is typed into the composer. This is the ticker's reason to exist. */
  root.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>('.ticker-chip');
    if (!chip || !field) return;
    field.value = chip.dataset.prompt || chip.textContent || '';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  });

  const rows: Row[] = [...root.querySelectorAll<HTMLElement>('.ticker-row')].map((el) => {
    const track = el.querySelector<HTMLElement>('.ticker-track')!;
    const row: Row = { el, track, dir: Number(el.dataset.dir) || -1, x: 0, len: 0, speed: SPEED, hover: false, focus: false };
    el.addEventListener('pointerenter', () => { row.hover = true; });
    el.addEventListener('pointerleave', () => { row.hover = false; });
    el.addEventListener('focusin', () => { row.focus = true; });
    el.addEventListener('focusout', () => { row.focus = false; });
    return row;
  });

  const originals = new Map(rows.map((r) => [r, [...r.track.children] as HTMLElement[]]));

  /* Enough aria-hidden, untabbable copies to cover the row plus one full length. */
  const build = (r: Row) => {
    for (const c of [...r.track.children]) if (c.hasAttribute('data-copy')) c.remove();
    const first = originals.get(r)!;
    const copies: HTMLElement[] = [];
    const add = () => {
      for (const li of first) {
        const copy = li.cloneNode(true) as HTMLElement;
        copy.setAttribute('data-copy', '');
        copy.setAttribute('aria-hidden', 'true');
        copy.querySelectorAll('button').forEach((b) => b.setAttribute('tabindex', '-1'));
        r.track.appendChild(copy);
        copies.push(copy);
      }
    };
    add();
    r.len = copies[0].offsetLeft - first[0].offsetLeft;
    if (r.len <= 0) return;
    const need = Math.ceil(r.el.clientWidth / r.len);
    for (let i = 0; i < need; i++) add();
  };

  const place = (r: Row) => {
    r.track.style.transform = `translate3d(${wrap(-r.len, 0, r.x).toFixed(2)}px,0,0)`;
  };

  const ticker = loop((_t, dt) => {
    for (const r of rows) {
      const want = r.focus ? 0 : r.hover ? SLOW : SPEED;
      r.speed += (want - r.speed) * (1 - Math.exp(-dt / 0.14));
      r.x += r.dir * r.speed * dt;
      place(r);
    }
  });

  let visible = false;
  let live = false;
  const setLive = (on: boolean) => {
    if (on === live) return;
    live = on;
    root.classList.toggle('is-live', on);
    for (const r of rows) {
      if (on) { build(r); r.x = r.dir > 0 ? -r.len / 3 : 0; place(r); }
      else { for (const c of [...r.track.children]) if (c.hasAttribute('data-copy')) c.remove(); r.track.style.transform = ''; }
    }
  };
  const sync = () => {
    const motion = !reducedMotion();
    setLive(motion);
    if (motion && visible) ticker.start(); else ticker.stop();
  };

  if ('ResizeObserver' in window) {
    let w = root.clientWidth;
    new ResizeObserver(() => {
      if (root.clientWidth === w) return;
      w = root.clientWidth;
      if (live) for (const r of rows) { build(r); place(r); }
    }).observe(root);
  }
  onMotionChange(sync);
  whileVisible(root, () => { visible = true; sync(); }, () => { visible = false; sync(); }, '0px');
}
