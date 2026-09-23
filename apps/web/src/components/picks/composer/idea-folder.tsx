// IDEAS, IN A FOLDER — somewhere to start when the box is empty and the mind is too. Three picks:
//
//   React Bits "Folder Float"   the folder opens and its cards float up out of it in a loose fan,
//                               each at its own small tilt, one after another. (MIT + Commons
//                               Clause: the behaviour, rebuilt.)
//   GSAP InertiaPlugin          a card can be picked up and THROWN: let go over the box and it
//                               drops in; let go anywhere else and it glides on with the speed it
//                               was thrown at, slows, and springs home. (GSAP: rebuilt on rAF.)
//   gsap.utils.shuffle/random   "More ideas" deals a fresh hand from a shuffled deck — nothing
//                               repeats until every idea has been seen — and the random tilt is
//                               what makes a dealt hand look placed by a hand.
//
// A card is a button: Enter or a click puts the idea in the box at the caret, like every other
// insertion. Escape, a click outside, or choosing closes the folder and gives focus back.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { useIsomorphicLayoutEffect } from '../../ai-elements/lib/use-isomorphic-layout-effect';
import { makeDeck, random, reducedMotion, spring } from './motion';
import { IDEAS } from './ideas';
import './idea-folder.css';

const HAND = 5;
const FRICTION = 5; // per second: how quickly a thrown card loses its speed

interface Card { text: string; tilt: number }

export function IdeaFolder({
  onPick,
  dropTarget,
  disabled,
}: {
  onPick: (idea: string) => void;
  /** The box a thrown card drops into. */
  dropTarget: RefObject<HTMLElement | null>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [cards, setCards] = useState<Card[]>([]);
  const deck = useRef(makeDeck(IDEAS));
  const trigger = useRef<HTMLButtonElement>(null);
  const fan = useRef<HTMLDivElement>(null);
  const drag = useRef<{ el: HTMLElement; id: number; x0: number; y0: number; dx: number; dy: number; moved: boolean; samples: { t: number; x: number; y: number }[] } | null>(null);
  const flight = useRef(0);

  const deal = () => setCards(deck.current.hand(HAND).map((text) => ({ text, tilt: random(-5, 5) })));

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) requestAnimationFrame(() => trigger.current?.focus());
  };

  const toggle = () => {
    if (open) { close(false); return; }
    deal();
    setOpen(true);
  };

  // FLOAT OUT: every card starts inside the folder button and rises to its place in the fan,
  // one after another. Measured after layout so each card knows where the folder is from it.
  useIsomorphicLayoutEffect(() => {
    if (!open || !fan.current || !trigger.current) return;
    const from = trigger.current.getBoundingClientRect();
    const items = [...fan.current.querySelectorAll<HTMLElement>('.pk-idea')];
    if (reducedMotion()) { items[0]?.focus(); return; }
    const { easing, duration } = spring({ stiffness: 260, damping: 18 });
    items.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const dx = from.left + from.width / 2 - (r.left + r.width / 2);
      const dy = from.top + from.height / 2 - (r.top + r.height / 2);
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(.3)`, rotate: '0deg', opacity: 0 },
          { transform: 'translate(0, 0) scale(1)', rotate: `${el.dataset.tilt}deg`, opacity: 1 },
        ],
        { duration, easing, delay: i * 45, fill: 'backwards' },
      );
    });
    items[0]?.focus({ preventScroll: true });
  }, [open, cards]);

  // Close on a press anywhere outside the folder and its cards.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (fan.current?.contains(t) || trigger.current?.contains(t)) return;
      close(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  useEffect(() => () => cancelAnimationFrame(flight.current), []);

  const pick = (text: string) => {
    onPick(text);
    close(false);
  };

  // ------------------------------------------------------------ pick up and throw ----
  const down = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || reducedMotion()) return;
    cancelAnimationFrame(flight.current);
    const el = e.currentTarget;
    drag.current = { el, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, moved: false, samples: [{ t: performance.now(), x: e.clientX, y: e.clientY }] };
  };
  const move = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    d.dx = e.clientX - d.x0;
    d.dy = e.clientY - d.y0;
    if (!d.moved && Math.hypot(d.dx, d.dy) > 5) {
      d.moved = true;
      d.el.setPointerCapture(e.pointerId);
      d.el.classList.add('is-held');
    }
    if (!d.moved) return;
    d.samples.push({ t: performance.now(), x: e.clientX, y: e.clientY });
    if (d.samples.length > 6) d.samples.shift();
    d.el.style.translate = `${d.dx}px ${d.dy}px`;
  };
  const up = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId || !d.moved) return;
    const el = d.el;
    el.classList.remove('is-held');
    // The click that follows a drag is not a choice: the drop (or the throw) was.
    const swallow = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); };
    el.addEventListener('click', swallow, { capture: true, once: true });
    window.setTimeout(() => el.removeEventListener('click', swallow, { capture: true }), 300);
    // Dropped on the box: the idea goes in.
    const box = dropTarget.current?.getBoundingClientRect();
    if (box && e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom) {
      el.style.translate = '';
      pick(el.dataset.idea ?? '');
      return;
    }
    // Thrown: carry the release speed, bleed it off, then spring home.
    const first = d.samples[0];
    const last = d.samples[d.samples.length - 1];
    const span = first && last ? Math.max(16, last.t - first.t) / 1000 : 1;
    let vx = first && last ? (last.x - first.x) / span : 0;
    let vy = first && last ? (last.y - first.y) / span : 0;
    let x = d.dx;
    let y = d.dy;
    let t0 = performance.now();
    const glide = (now: number) => {
      const dt = Math.min(0.05, (now - t0) / 1000);
      t0 = now;
      x += vx * dt;
      y += vy * dt;
      const decay = Math.exp(-FRICTION * dt);
      vx *= decay;
      vy *= decay;
      el.style.translate = `${x}px ${y}px`;
      if (Math.hypot(vx, vy) > 30) { flight.current = requestAnimationFrame(glide); return; }
      const home = spring({ stiffness: 220, damping: 16 });
      el.style.translate = '';
      el.animate([{ translate: `${x}px ${y}px` }, { translate: '0px 0px' }], { duration: home.duration, easing: home.easing });
    };
    flight.current = requestAnimationFrame(glide);
  };

  const redeal = () => {
    const els = fan.current ? [...fan.current.querySelectorAll<HTMLElement>('.pk-idea')] : [];
    if (reducedMotion() || !els.length || typeof els[0]?.animate !== 'function') { deal(); return; }
    // The old hand flicks out the top; the new one floats up out of the folder like the first.
    const outs = els.map((el) => el.animate([{ opacity: 1 }, { opacity: 0, translate: '0 -14px' }], { duration: 160, easing: 'ease-in', fill: 'forwards' }));
    void Promise.all(outs.map((a) => a.finished)).then(() => {
      outs.forEach((a) => a.cancel());
      deal();
    });
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="gx-chip gx-chip--ideas"
        aria-expanded={open}
        aria-controls={open ? 'pk-ideas' : undefined}
        aria-label="Ideas"
        data-tip="Not sure what to make? Grab an idea."
        data-fx="press ripple"
        disabled={disabled}
        onClick={toggle}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        </svg>
        <span className="gx-chip__label">Ideas</span>
      </button>
      {open && (
        <div
          ref={fan}
          id="pk-ideas"
          className="pk-ideas"
          role="group"
          aria-label="Ideas"
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}
        >
          {cards.map((c) => (
            <button
              key={c.text}
              type="button"
              className="pk-idea"
              data-idea={c.text}
              data-tilt={c.tilt.toFixed(2)}
              style={{ rotate: `${c.tilt.toFixed(2)}deg` }}
              onClick={() => pick(c.text)}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={() => { drag.current = null; }}
            >
              {c.text}
            </button>
          ))}
          <button type="button" className="pk-idea pk-idea--more" onClick={redeal}>
            More ideas
          </button>
        </div>
      )}
    </>
  );
}
