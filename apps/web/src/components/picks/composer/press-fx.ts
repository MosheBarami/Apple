// HOW A CONTROL IN THE COMPOSER ANSWERS A FINGER — five picks, one behaviour, one listener set.
//
//   Animate UI "Button"   hover grows a little, a press shrinks it, on a stiff spring (400/25).
//   Motion "Hover"        the lift on pointer-enter, and the settle back on leave. (MIT)
//   Motion "Press"        Send gives under the press (to 0.8 on a 1000/30 spring) and springs back
//                         with a bounce (500/12) when it is released. (MIT)
//   Animate UI "Ripple"   a click spreads a ring from the point it landed, then fades.
//   UI Layouts "Button Background Spotlight"  a soft light follows the pointer across the button. (MIT)
//
// None of the libraries is installed, so the behaviour is rebuilt on the Web Animations API (see
// motion.ts); the Animate UI and React Bits code was not copied, only what it does.
//
// DELEGATED, not a hook per button. The composer's buttons come from vendored components that do
// not all forward refs, and a dozen listeners per render in the most-used control in the product
// would be a cost for nothing. One set on the panel reads a `data-fx` word list off whichever
// button the event reached:
//
//   data-fx="press"            hover 1.04, press 0.95
//   data-fx="press squish"     press 0.8 (Send)
//   data-fx="... ripple"       the ring on click
//   data-fx="... spotlight"    the light under the pointer (--pk-spot-x / --pk-spot-y)
//
// Every one of them is skipped under prefers-reduced-motion, and hover is skipped on touch.
import { useEffect, type RefObject } from 'react';
import { finePointer, reducedMotion, springScale } from './motion';
import './press-fx.css';

const HOVER = 1.04;
const PRESS = 0.95;
const SQUISH = 0.8;
const SOFT = { stiffness: 400, damping: 25 };
const HARD = { stiffness: 1000, damping: 30 };
const BOUNCE = { stiffness: 500, damping: 12 };

function fxTarget(from: EventTarget | null, root: HTMLElement): HTMLElement | null {
  const el = from instanceof Element ? from.closest<HTMLElement>('[data-fx]') : null;
  if (!el || !root.contains(el)) return null;
  if (el.matches(':disabled, [aria-disabled="true"]')) return null;
  return el;
}

const words = (el: HTMLElement) => (el.dataset.fx ?? '').split(/\s+/);

function ripple(el: HTMLElement, x: number, y: number) {
  const r = el.getBoundingClientRect();
  const dot = document.createElement('span');
  dot.className = 'pk-ripple';
  dot.setAttribute('aria-hidden', 'true');
  dot.style.left = `${x - r.left - 10}px`;
  dot.style.top = `${y - r.top - 10}px`;
  el.appendChild(dot);
  const anim = dot.animate(
    [{ transform: 'scale(0)', opacity: 0.5 }, { transform: 'scale(10)', opacity: 0 }],
    { duration: 600, easing: 'cubic-bezier(0, 0, 0.2, 1)' },
  );
  anim.onfinish = () => dot.remove();
  anim.oncancel = () => dot.remove();
}

export function usePressFx(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof root.animate !== 'function') return;
    let pressed: HTMLElement | null = null;

    const rest = (el: HTMLElement) => (finePointer() && el.matches(':hover') ? HOVER : 1);

    const over = (e: PointerEvent) => {
      if (reducedMotion() || e.pointerType !== 'mouse') return;
      const el = fxTarget(e.target, root);
      if (!el || (e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) return;
      if (el !== pressed) springScale(el, HOVER, SOFT);
    };
    const out = (e: PointerEvent) => {
      const el = fxTarget(e.target, root);
      if (!el || (e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) return;
      if (reducedMotion()) return;
      springScale(el, 1, words(el).includes('squish') ? BOUNCE : SOFT);
      if (pressed === el) pressed = null;
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || reducedMotion()) return;
      const el = fxTarget(e.target, root);
      if (!el) return;
      pressed = el;
      const squish = words(el).includes('squish');
      springScale(el, squish ? SQUISH : PRESS, squish ? HARD : SOFT);
    };
    const up = () => {
      const el = pressed;
      pressed = null;
      if (!el || reducedMotion()) return;
      springScale(el, rest(el), words(el).includes('squish') ? BOUNCE : SOFT);
    };
    const click = (e: MouseEvent) => {
      if (reducedMotion()) return;
      const el = fxTarget(e.target, root);
      if (!el || !words(el).includes('ripple')) return;
      const r = el.getBoundingClientRect();
      // A keyboard click has no pointer position (detail 0): the ring starts from the middle.
      const fromKeys = e.detail === 0;
      ripple(el, fromKeys ? r.left + r.width / 2 : e.clientX, fromKeys ? r.top + r.height / 2 : e.clientY);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const el = fxTarget(e.target, root);
      if (!el || !words(el).includes('spotlight')) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--pk-spot-x', `${e.clientX - r.left}px`);
      el.style.setProperty('--pk-spot-y', `${e.clientY - r.top}px`);
    };
    // Space and Enter press a button too, and a press that only answered the mouse would tell a
    // keyboard user that their press did not land.
    const keydown = (e: KeyboardEvent) => {
      if ((e.key !== ' ' && e.key !== 'Enter') || e.repeat || reducedMotion()) return;
      const el = fxTarget(e.target, root);
      if (!el || !el.matches('button')) return;
      springScale(el, words(el).includes('squish') ? SQUISH : PRESS, HARD);
      window.setTimeout(() => springScale(el, 1, BOUNCE), 110);
    };

    root.addEventListener('pointerover', over);
    root.addEventListener('pointerout', out);
    root.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move);
    root.addEventListener('click', click);
    root.addEventListener('keydown', keydown);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      root.removeEventListener('pointerover', over);
      root.removeEventListener('pointerout', out);
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('pointermove', move);
      root.removeEventListener('click', click);
      root.removeEventListener('keydown', keydown);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [rootRef]);
}
