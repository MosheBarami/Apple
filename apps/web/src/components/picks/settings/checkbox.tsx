// A tick box whose check is drawn rather than switched on.
//
// Pick: Motion "Radix: Checkbox" (Motion+ licence — behaviour re-implemented, nothing copied): the
// box fills, the check stroke draws in along its own length, and the box gives a small springy
// press. All three are CSS here. The input stays a real checkbox, so labels, forms and keyboard
// behave exactly as before.
import type { CSSProperties, InputHTMLAttributes } from 'react';
import { spring } from './motion';
import './checkbox.css';

export function Checkbox({ className, style, ...input }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const s = spring(500, 18);
  return (
    <span
      className={`pk-check${className ? ` ${className}` : ''}`}
      style={{ ...style, '--pk-check-ease': s.easing, '--pk-check-dur': `${s.duration}ms` } as CSSProperties}
    >
      <input {...input} type="checkbox" className="pk-check__input" />
      <span className="pk-check__box" aria-hidden="true">
        <svg viewBox="0 0 16 16">
          <path d="M3 8.5l3 3 7-7" pathLength={1} />
        </svg>
      </span>
    </span>
  );
}
