// Rolling digits — each digit is a column of 0–9 that slides to its value.
//
// One implementation behind four picks that each drew the same odometer their own way: the Motion
// "Stats: Live panel" and "Line graph" readouts, and the UI Layouts "Motion Number Input" and
// "Motion Number Slider". Re-implemented from the behaviour (a digit column translated by -n × 10%);
// the Motion sources are Motion+ licensed and were not copied. The UI Layouts sources are MIT.
//
// The visible columns are aria-hidden; the whole value is one text node for assistive technology.
import './rolling-number.css';

export function RollingNumber({ value, className }: { value: string | number; className?: string }) {
  const text = String(value);
  // Keyed from the right, so "99" → "100" keeps the units column in place and adds a new one on
  // the left instead of re-rolling every digit.
  const chars = text.split('');
  return (
    <span className={`pk-roll${className ? ` ${className}` : ''}`}>
      <span className="pk-roll__sr">{text}</span>
      <span className="pk-roll__cols" aria-hidden="true">
        {chars.map((ch, i) => {
          const key = chars.length - i;
          if (!/\d/.test(ch)) {
            return (
              <span key={`c${key}-${ch}`} className="pk-roll__char">
                {ch === ' ' ? ' ' : ch}
              </span>
            );
          }
          return (
            <span key={`d${key}`} className="pk-roll__digit">
              <span className="pk-roll__strip" style={{ transform: `translateY(${-Number(ch) * 10}%)` }}>
                {'0123456789'.split('').map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
