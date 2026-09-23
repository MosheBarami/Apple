// The one on/off switch on the account screens.
//
// MERGED FROM TWO PICKS that do the same job: Animate UI "Switch" (MIT + Commons Clause — the
// thumb widens while pressed, start/end icons scale in) and Motion "Radix: Switch" (Motion+ — a
// springy thumb and a track that fills). Both behaviours are re-implemented here in CSS; neither
// source was copied. The spring is simulated once in ./motion.ts and handed to CSS as `linear()`.
//
// IT IS STILL A NATIVE CHECKBOX. The input carries role="switch", keeps its label association,
// its `name`, its disabled state and its change event, so every caller that used to render
// `<input type="checkbox" className="settings-switch">` keeps its semantics and its tests.
import type { CSSProperties, InputHTMLAttributes } from 'react';
import { spring } from './motion';
import './switch.css';

type SwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role'> & {
  /** Show the small check / cross marks inside the track (Animate UI's icon variant). */
  icons?: boolean;
};

export function Switch({ className, icons = true, style, ...input }: SwitchProps) {
  const s = spring(300, 25);
  return (
    <span
      className={`pk-switch${className ? ` ${className}` : ''}`}
      style={{ ...style, '--pk-switch-ease': s.easing, '--pk-switch-dur': `${s.duration}ms` } as CSSProperties}
    >
      <input {...input} type="checkbox" role="switch" className="pk-switch__input" />
      <span className="pk-switch__track" aria-hidden="true">
        {icons && (
          <>
            <svg className="pk-switch__icon pk-switch__icon--on" viewBox="0 0 24 24">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <svg className="pk-switch__icon pk-switch__icon--off" viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </>
        )}
        <span className="pk-switch__thumb" />
      </span>
    </span>
  );
}
