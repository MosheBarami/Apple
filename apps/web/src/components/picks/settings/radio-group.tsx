// Pick one of a few — as cards with a ring and a dot that springs in.
//
// Pick: Motion "Radix: Radio Group" (Motion+ licence — behaviour re-implemented, nothing copied):
// the chosen option's ring darkens and its dot scales in on a bouncy spring, the card border follows.
//
// Two shapes of the same thing:
//   * <RadioCards> — native radio inputs, so the browser supplies arrow-key movement, form
//     submission and label clicks. Used where a form already had bare radios.
//   * <RadioMark> — just the ring and dot, for a group that already implements the radio pattern
//     itself (Settings' `Choice`, which keeps its own roving tabindex).
import { useId, type CSSProperties, type ReactNode } from 'react';
import { spring } from './motion';
import './radio-group.css';

export function RadioMark({ on }: { on: boolean }) {
  const s = spring(420, 14);
  return (
    <span
      className={`pk-radio__ring${on ? ' is-on' : ''}`}
      aria-hidden="true"
      style={{ '--pk-radio-ease': s.easing, '--pk-radio-dur': `${s.duration}ms` } as CSSProperties}
    >
      <span className="pk-radio__dot" />
    </span>
  );
}

export interface RadioOption<T extends string> {
  value: T;
  label: ReactNode;
  hint?: ReactNode;
}

export function RadioCards<T extends string>({
  legend,
  legendClassName,
  name,
  value,
  options,
  onChange,
  disabled,
}: {
  legend: ReactNode;
  legendClassName?: string;
  name?: string;
  value: T;
  options: readonly RadioOption<T>[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const auto = useId();
  const group = name ?? `pk-radio-${auto}`;
  return (
    <fieldset className="pk-radio" disabled={disabled}>
      <legend className={legendClassName}>{legend}</legend>
      <div className="pk-radio__list">
        {options.map((o) => (
          <label key={o.value} className={`pk-radio__card${value === o.value ? ' is-on' : ''}`}>
            <input
              type="radio"
              className="pk-radio__input"
              name={group}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <RadioMark on={value === o.value} />
            <span className="pk-radio__text">
              <span className="pk-radio__label">{o.label}</span>
              {o.hint && <span className="pk-radio__hint">{o.hint}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
