// Six boxes for a six-digit code.
//
// Pick: React Bits "Code Slots" (MIT + Commons Clause — re-implemented, not copied): each digit
// rises into its box on a spring, the caret sits in the next empty box, a wrong code drains out
// right-to-left, and a right one washes the row and draws a check.
//
// ONE REAL INPUT UNDER THE BOXES. It keeps `name`, `autoComplete="one-time-code"` (so a phone can
// offer the code from a text message), `inputMode="numeric"`, paste, and the form's submit on
// Enter. The boxes are a drawing of its value and are hidden from assistive technology.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { spring } from './motion';
import './code-slots.css';

export function CodeSlots({
  value,
  onChange,
  name,
  id,
  length = 6,
  status = 'idle',
  autoFocus,
  disabled,
  label,
  describedBy,
}: {
  value: string;
  onChange: (v: string) => void;
  name?: string;
  id?: string;
  length?: number;
  /** 'error' plays the drain, 'success' the wash; the caller decides which happened. */
  status?: 'idle' | 'error' | 'success';
  autoFocus?: boolean;
  disabled?: boolean;
  label: string;
  describedBy?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const digits = value.replace(/\D/g, '').slice(0, length);
  const active = Math.min(digits.length, length - 1);
  const s = spring(438, 34);

  // Keep the caret at the end: the boxes only ever fill left to right.
  useEffect(() => {
    const el = input.current;
    if (el && document.activeElement === el) el.setSelectionRange(el.value.length, el.value.length);
  }, [digits]);

  return (
    <div
      className={`pk-slots is-${status}${focused ? ' is-focused' : ''}${disabled ? ' is-disabled' : ''}`}
      style={{ '--pk-slot-ease': s.easing, '--pk-slot-dur': `${s.duration}ms`, '--pk-slots': length } as CSSProperties}
    >
      <input
        ref={input}
        id={id}
        className="pk-slots__input"
        name={name}
        value={digits}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={length}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-label={label}
        aria-invalid={status === 'error' ? 'true' : undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSelect={(e) => {
          const el = e.currentTarget;
          if (el.selectionStart !== el.value.length) el.setSelectionRange(el.value.length, el.value.length);
        }}
      />
      <div className="pk-slots__row" aria-hidden="true">
        {Array.from({ length }, (_, i) => {
          const ch = digits[i];
          return (
            <span
              key={i}
              className={`pk-slots__slot${ch ? ' is-filled' : ''}${focused && i === active && !ch ? ' is-active' : ''}`}
              style={{ '--i': i, '--ri': length - 1 - i } as CSSProperties}
            >
              {ch && (
                <span key={ch + i} className="pk-slots__digit">
                  {ch}
                </span>
              )}
              {focused && i === active && !ch && status !== 'success' && <span className="pk-slots__caret" />}
            </span>
          );
        })}
        {status === 'success' && (
          <span className="pk-slots__wash">
            <svg viewBox="0 0 24 24">
              <path d="M5 12l5 5 9-10" pathLength={1} />
            </svg>
          </span>
        )}
      </div>
    </div>
  );
}
