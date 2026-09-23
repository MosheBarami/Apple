// ONE TOOLTIP FOR THE WHOLE BAR — the behaviour of Motion's "Radix: Tooltip" example, rebuilt (the
// example is Motion+ licensed, so none of its code is here; only what it does).
//
//   * The first tip waits (DELAY) so a pointer passing over the bar does not light it up.
//   * Once one is showing, its neighbours answer at once, and the bubble SLIDES from one control to
//     the next instead of blinking out and in — Radix's `skipDelayDuration`.
//   * It closes a moment after the pointer leaves (so crossing a gap does not flicker), at once on
//     a press, on Escape, and on scroll.
//   * Keyboard focus shows it too, but only focus that came from the keyboard (:focus-visible).
//
// A control opts in with `data-tip="…"`: a short, plain sentence about what it does. While the tip
// is showing, the control is `aria-describedby` it, so a screen reader hears the same sentence the
// pointer user reads; the control's own name stays in its aria-label.
import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { reducedMotion } from './motion';
import './tip-group.css';

const DELAY = 400;
const LINGER = 150;

interface Tip { text: string; x: number; y: number; below: boolean }

export function TipGroup({ rootRef }: { rootRef: RefObject<HTMLElement | null> }) {
  const id = useId();
  const [tip, setTip] = useState<Tip | null>(null);
  const [slide, setSlide] = useState(false);
  const shown = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const owner = useRef<HTMLElement | null>(null);
  const bubble = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const detach = () => {
      if (owner.current?.getAttribute('aria-describedby') === id) owner.current.removeAttribute('aria-describedby');
      owner.current = null;
    };
    const hide = (now = false) => {
      window.clearTimeout(timer.current);
      const go = () => { shown.current = false; setSlide(false); setTip(null); detach(); };
      if (now) go(); else timer.current = window.setTimeout(go, LINGER);
    };
    const show = (el: HTMLElement) => {
      const text = el.dataset.tip;
      if (!text) return;
      window.clearTimeout(timer.current);
      const place = () => {
        const box = root.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        // Above the control unless that would leave the top of the viewport.
        const below = r.top - 40 < 0;
        detach();
        owner.current = el;
        if (!el.hasAttribute('aria-describedby')) el.setAttribute('aria-describedby', id);
        setSlide(shown.current && !reducedMotion());
        shown.current = true;
        setTip({ text, x: r.left - box.left + r.width / 2, y: (below ? r.bottom : r.top) - box.top, below });
      };
      if (shown.current) place(); else timer.current = window.setTimeout(place, DELAY);
    };
    const target = (from: EventTarget | null) =>
      from instanceof Element ? from.closest<HTMLElement>('[data-tip]') : null;

    const over = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const el = target(e.target);
      if (el && root.contains(el)) show(el);
    };
    const out = (e: PointerEvent) => {
      const el = target(e.target);
      if (!el || (e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) return;
      hide();
    };
    const focusIn = (e: FocusEvent) => {
      const el = target(e.target);
      if (el && el === e.target && el.matches(':focus-visible')) show(el);
    };
    const focusOut = () => hide(true);
    const down = () => hide(true);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && shown.current) hide(true); };
    const scroll = () => { if (shown.current) hide(true); };

    root.addEventListener('pointerover', over);
    root.addEventListener('pointerout', out);
    root.addEventListener('focusin', focusIn);
    root.addEventListener('focusout', focusOut);
    root.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', scroll, true);
    return () => {
      window.clearTimeout(timer.current);
      root.removeEventListener('pointerover', over);
      root.removeEventListener('pointerout', out);
      root.removeEventListener('focusin', focusIn);
      root.removeEventListener('focusout', focusOut);
      root.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', scroll, true);
      detach();
    };
  }, [rootRef, id]);

  return (
    <span
      ref={bubble}
      id={id}
      role="tooltip"
      className={`pk-tip${tip ? ' is-open' : ''}${tip?.below ? ' is-below' : ''}${slide ? ' is-sliding' : ''}`}
      style={tip ? { transform: `translate(${tip.x}px, ${tip.y}px)` } : undefined}
    >
      <span className="pk-tip__body">{tip?.text ?? ''}</span>
    </span>
  );
}
