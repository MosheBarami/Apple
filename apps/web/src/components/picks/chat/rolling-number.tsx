// A NUMBER THAT ROLLS TO ITS NEW VALUE, digit by digit.
//
// Merged from two picks that animate a count the same way: UI Layouts "Motion Number Upvotes" (MIT
// — its idea of one 0–9 column per digit, translated to the digit) and Motion "Engagement stats"
// (Motion+ licence, so re-implemented, not copied: tabular figures, each column springs on its own).
// Used where a real number arrives or changes while the reader is looking — the Credits a turn
// settled at, the count of turns that arrived while the reader was scrolled away.
//
// The whole string is the accessible text; the columns are presentation. A screen reader reads
// "12", never "0 1 2 3 4 5 6 7 8 9".
import { useEffect, useState } from 'react';
import './rolling-number.css';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function RollingNumber({
  value,
  className,
  rollIn = false,
}: {
  value: number;
  className?: string;
  /** Start the reels at zero and roll up to `value` — for a figure that has just arrived. */
  rollIn?: boolean;
}) {
  const [shown, setShown] = useState(rollIn ? 0 : value);
  useEffect(() => {
    if (typeof requestAnimationFrame === 'undefined') return setShown(value);
    // One frame at the old value first, so the transition has somewhere to start from.
    const id = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(id);
  }, [value]);

  const text = String(value);
  // Padded to the target's width so a new leading digit rolls in from 0 instead of popping in.
  const face = String(shown).padStart(text.length, '0');
  return (
    <span className={`pk-roll${className ? ` ${className}` : ''}`}>
      <span className="gx-sr">{text}</span>
      <span className="pk-roll__face" aria-hidden="true">
        {face.split('').map((ch, i) =>
          /\d/.test(ch) ? (
            // Keyed by position from the END, so 9 → 10 rolls the units column rather than
            // re-mounting every column one place to the left.
            <span key={`d${face.length - i}`} className="pk-roll__col">
              <span className="pk-roll__reel" style={{ transform: `translateY(${-Number(ch) * 10}%)` }}>
                {DIGITS.map((d) => <span key={d}>{d}</span>)}
              </span>
            </span>
          ) : (
            <span key={`c${face.length - i}`}>{ch}</span>
          ),
        )}
      </span>
    </span>
  );
}
