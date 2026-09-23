// PLAN OR AGENT, BOTH ON SCREEN — the composer's mode, as a two-way switch instead of a menu.
//
// It was a dropdown whose closed face said only the current word, so the other choice existed only
// for somebody who already knew to open it. Two visible words are the whole decision, one tap each.
//
// Three picks, one control:
//   Motion "Radix: Toggle Group"  a pill slides to the chosen side on a spring, and the chosen
//                                 icon pops as it lands. (Motion+ example: behaviour only.)
//   Animate UI "Highlight"        a fainter pill follows the pointer across the options and drifts
//                                 back to the chosen one 200 ms after the pointer leaves.
//   Motion "Radix: Tooltip"       each side's blurb — the shared vocabulary's own sentence about
//                                 what that mode does — is the tip the bar's TipGroup shows.
//
// A radio group (arrow keys move and choose, one tab stop), because that is what a choice of one
// out of two is. Neither side is ever gated: Plan runs on the same free specialist a free account
// already has, so there is nothing to lock and nothing to pretend about.
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { PRODUCT_MODES, PRODUCT_MODE_INFO, type ProductMode } from '@golem/shared';
import { Icon, PATH } from '../../ws/primitives';
import { reducedMotion } from './motion';
import { moveHighlight } from './sliding-highlight';
import './mode-switch.css';

export function ModeSwitch({ mode, onModeChange }: { mode: ProductMode; onModeChange: (mode: ProductMode) => void }) {
  const group = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const ghost = useRef<HTMLSpanElement>(null);
  const back = useRef<number | undefined>(undefined);

  const item = (id: ProductMode) => group.current?.querySelector<HTMLElement>(`[data-mode="${id}"]`) ?? null;

  // The chosen pill follows the choice, and the chosen icon pops as the pill arrives.
  useEffect(() => {
    const el = item(mode);
    if (!pill.current || !el) return;
    moveHighlight(pill.current, el);
    group.current?.classList.add('is-measured');
    const icon = el.querySelector('svg');
    if (icon && !reducedMotion() && typeof icon.animate === 'function') {
      icon.animate([{ scale: '0.8' }, { scale: '1' }], { duration: 420, easing: 'cubic-bezier(.34,1.8,.64,1)' });
    }
  }, [mode]);

  useEffect(() => () => window.clearTimeout(back.current), []);

  const hover = (id: ProductMode | null) => {
    window.clearTimeout(back.current);
    const g = ghost.current;
    if (!g) return;
    if (id) { moveHighlight(g, item(id)); return; }
    back.current = window.setTimeout(() => { g.style.opacity = '0'; }, 200);
  };

  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    // In a right-to-left page the arrow that points at the next item is the left one.
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight');
    const at = PRODUCT_MODES.indexOf(mode);
    const next = PRODUCT_MODES[(at + (rtl ? -step : step) + PRODUCT_MODES.length) % PRODUCT_MODES.length] ?? mode;
    onModeChange(next);
    requestAnimationFrame(() => item(next)?.focus());
  };

  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label="Mode"
      className="pk-mode"
      onKeyDown={keys}
      onPointerLeave={() => hover(null)}
    >
      <span ref={ghost} className="pk-mode__ghost" aria-hidden="true" />
      <span ref={pill} className="pk-mode__pill" aria-hidden="true" />
      {PRODUCT_MODES.map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          data-mode={id}
          aria-checked={mode === id}
          tabIndex={mode === id ? 0 : -1}
          className="pk-mode__option"
          data-tip={PRODUCT_MODE_INFO[id].blurb}
          data-fx="press"
          onClick={() => onModeChange(id)}
          onPointerEnter={() => hover(id)}
        >
          <Icon d={id === 'plan' ? PATH.docs : PATH.layers} size={13} />
          <span className="pk-mode__name">{PRODUCT_MODE_INFO[id].name}</span>
        </button>
      ))}
    </div>
  );
}
