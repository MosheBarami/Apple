// THE EMPTY BOX, TYPING EXAMPLES AT YOU — two picks merged into one:
//
//   Animate UI "Typing Text"  a steady beat, a hold on the finished line, then erase; the cursor
//                             blinks only while it is idle.
//   React Bits "Text Type"    a human, uneven pace (40–90 ms a key), a faster erase (30 ms).
//
// Neither library is installed and neither's code is copied; this is the behaviour, on timers.
//
// WHAT IT IS NOT: the box's accessible name or its placeholder. The textarea keeps both, so a
// screen reader hears the same sentence it always did; this layer is aria-hidden decoration drawn
// over the empty field, and the native placeholder is only made transparent while it is showing.
// It stops the moment there is text, the box takes focus, or the box is disabled, and under
// prefers-reduced-motion it is never drawn at all (the plain placeholder stays).
import { useEffect, useRef, useState } from 'react';
import { makeDeck, reducedMotion } from './motion';
import { IDEAS } from './ideas';
import './typing-placeholder.css';

const START_AFTER = 1400;
const HOLD = 1800;
const ERASE = 30;

export function TypingPlaceholder({ active, onShowing }: { active: boolean; onShowing?: (showing: boolean) => void }) {
  const [line, setLine] = useState('');
  const [typing, setTyping] = useState(false);
  const [on, setOn] = useState(false);
  const onShowingRef = useRef(onShowing);
  onShowingRef.current = onShowing;

  useEffect(() => {
    if (!active || reducedMotion()) {
      setOn(false);
      setLine('');
      onShowingRef.current?.(false);
      return;
    }
    const deck = makeDeck(IDEAS);
    let timer = 0;
    let cancelled = false;
    const later = (fn: () => void, ms: number) => { timer = window.setTimeout(() => { if (!cancelled) fn(); }, ms); };

    const type = (text: string, i: number) => {
      setTyping(true);
      setLine(text.slice(0, i));
      if (i < text.length) later(() => type(text, i + 1), 40 + Math.random() * 50);
      else { setTyping(false); later(() => erase(text, text.length), HOLD); }
    };
    const erase = (text: string, i: number) => {
      setTyping(true);
      setLine(text.slice(0, i));
      if (i > 0) later(() => erase(text, i - 1), ERASE);
      else { setTyping(false); later(() => type(deck.deal() ?? '', 0), 300); }
    };
    later(() => {
      setOn(true);
      onShowingRef.current?.(true);
      type(deck.deal() ?? '', 0);
    }, START_AFTER);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [active]);

  useEffect(() => () => onShowingRef.current?.(false), []);

  if (!on || !active) return null;
  return (
    <span className="pk-typing" aria-hidden="true">
      <span className="pk-typing__text">{line}</span>
      <span className={`pk-typing__cursor${typing ? '' : ' is-idle'}`} />
    </span>
  );
}
