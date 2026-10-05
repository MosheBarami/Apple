// ANIMATE UI'S "SLIDING NUMBER", rebuilt without Motion: every digit is a column of 0–9 that rolls
// to its new value on a springy transition, like an odometer. Used where a number in the composer
// changes while somebody watches it — the characters left, and the Credits left on the ring.
//
// The rolling columns are decoration and are hidden from assistive technology; the number itself
// is in the DOM once, as text, so a screen reader reads "1,204" and never "0123456789".
//
// Digits are keyed from the right, so 99 → 100 adds a column at the left and the ones column keeps
// rolling instead of every column being rebuilt. Under prefers-reduced-motion the columns jump
// (the transition is removed in the sheet); the value is the same either way.
import { formatNumber } from '../../../lib/format';
import './sliding-number.css';

export function SlidingNumber({ value, className, decimals = 0 }: { value: number; className?: string; decimals?: number }) {
  // Whole numbers go through the shared formatter. With `decimals` the figure is a credit balance
  // and always shows exactly that many places ("3.54"), English separators like every credit figure.
  const safe = Number.isFinite(value) ? Math.max(0, decimals > 0 ? value : Math.round(value)) : 0;
  const shown = decimals > 0
    ? safe.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : formatNumber(safe);
  const chars = [...shown];
  let digitIndex = 0;
  const digitsTotal = chars.filter((c) => c >= '0' && c <= '9').length;
  return (
    <span className={`pk-num${className ? ` ${className}` : ''}`}>
      <span className="pk-num__roll" aria-hidden="true">
        {chars.map((c, i) => {
          if (c < '0' || c > '9') return <span key={`s${chars.length - i}`} className="pk-num__sep">{c}</span>;
          const place = digitsTotal - digitIndex;
          digitIndex += 1;
          return (
            <span key={`d${place}`} className="pk-num__col">
              <span className="pk-num__strip" style={{ transform: `translateY(${-Number(c) * 10}%)` }}>
                {'0123456789'.split('').map((d) => <span key={d}>{d}</span>)}
              </span>
            </span>
          );
        })}
      </span>
      <span className="gx-sr">{shown}</span>
    </span>
  );
}
