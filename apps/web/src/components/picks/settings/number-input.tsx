// A number field with − and + either side, whose digits roll when the value changes.
//
// Pick: UI Layouts "Motion Number Input" (MIT — adapted; the digit roll now comes from the shared
// ./rolling-number). The typed text is drawn transparent with a visible caret, and the rolling
// figure sits exactly over it, so typing, pasting and selecting all still work on a real input.
// The steppers are pointer conveniences: out of the tab order, because arrow keys already step.
import type { KeyboardEvent } from 'react';
import { RollingNumber } from './rolling-number';
import './number-input.css';

export function NumberInput({
  id,
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  placeholder,
  invalid,
  describedBy,
  label,
}: {
  id?: string;
  /** Kept as a string: an empty field is a real answer ("no value") for optional numbers. */
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  label?: string;
}) {
  const n = value.trim() === '' ? null : Number(value);
  const numeric = n !== null && Number.isFinite(n);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const bump = (d: number) => onChange(String(clamp((numeric ? n : min - d) + d)));

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      bump(step);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      bump(-step);
    }
  };

  return (
    <div className={`pk-num${invalid ? ' is-invalid' : ''}`}>
      <button
        type="button"
        className="pk-num__step"
        tabIndex={-1}
        aria-hidden="true"
        disabled={numeric && n <= min}
        onPointerDown={(e) => {
          e.preventDefault();
          bump(-step);
        }}
      >
        <svg viewBox="0 0 24 24"><path d="M5 12h14" /></svg>
      </button>
      <span className="pk-num__field">
        <input
          id={id}
          className={`pk-num__input${numeric ? ' is-rolling' : ''}`}
          inputMode="numeric"
          value={value}
          placeholder={placeholder}
          aria-label={label}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
          onKeyDown={onKey}
        />
        {numeric && (
          <span className="pk-num__roll" aria-hidden="true">
            <RollingNumber value={value} />
          </span>
        )}
      </span>
      <button
        type="button"
        className="pk-num__step"
        tabIndex={-1}
        aria-hidden="true"
        disabled={numeric && n >= max}
        onPointerDown={(e) => {
          e.preventDefault();
          bump(step);
        }}
      >
        <svg viewBox="0 0 24 24"><path d="M5 12h14M12 5v14" /></svg>
      </button>
    </div>
  );
}
