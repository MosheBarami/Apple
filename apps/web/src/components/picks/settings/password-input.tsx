// A password field with an eye to show what you typed and, for a NEW password, how strong it is.
//
// MERGED FROM TWO UI Layouts PICKS (MIT — adapted): "Show/Hide Password" (the eye button that
// swaps the field between hidden and shown) and "Password Strength Hover Indicator" (five dots
// under the field, and a checklist that opens when you hover or focus the info mark).
//
// THE CHECKLIST IS HONEST ABOUT WHICH LINE IS A RULE. Apple has one hard rule — a minimum length
// (PASSWORD_MIN in lib/auth-flows.ts, plus refusing a common password or your own address, which
// the form still reports as an error). The other lines are tips that make a password stronger,
// and they are labelled as tips: a checklist that shows "1 uppercase letter" as a requirement
// would be the page inventing a rule the server does not enforce.
import { useId, useState, type InputHTMLAttributes } from 'react';
import { PASSWORD_MIN } from '../../../lib/auth-flows';
import './password-input.css';

const TIPS: { test: (p: string) => boolean; text: string; rule?: boolean }[] = [
  { test: (p) => p.length >= PASSWORD_MIN, text: `At least ${PASSWORD_MIN} characters`, rule: true },
  { test: (p) => p.length >= PASSWORD_MIN + 4, text: 'Longer is stronger' },
  { test: (p) => /\d/.test(p), text: 'Add a number' },
  { test: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p), text: 'Mix big and small letters' },
  { test: (p) => /[^A-Za-z0-9]/.test(p), text: 'Add a symbol like ! or #' },
];

const WORDS = ['Type a password', 'Too short', 'Okay', 'Good', 'Strong', 'Very strong'];

export function passwordScore(p: string): number {
  if (!p) return 0;
  if (p.length < PASSWORD_MIN) return 1;
  return Math.min(5, TIPS.filter((t) => t.test(p)).length);
}

export function PasswordInput({
  label,
  value,
  onChange,
  strength,
  inputClassName,
  ...input
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  /** Used to word the eye button ("Show password"). */
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** Draw the strength dots and checklist — only for a password being chosen. */
  strength?: boolean;
  inputClassName?: string;
}) {
  const [shown, setShown] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(false);
  const tipsId = useId();
  const score = passwordScore(value);
  const describedBy = [input['aria-describedby'], strength ? `${tipsId}-word` : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="pk-pass">
      <div className="pk-pass__wrap field__wrap">
        <input
          {...input}
          className={inputClassName}
          type={shown ? 'text' : 'password'}
          value={value}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="pk-pass__eye"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          aria-controls={input.id}
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          title={shown ? 'Hide' : 'Show'}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className={shown ? 'is-shown' : ''}>
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
            <path className="pk-pass__slash" d="M3 3l18 18" pathLength={1} />
          </svg>
        </button>
      </div>
      {strength && (
        <div className="pk-pass__meter">
          <span className="pk-pass__dots" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((i) => (
              <span key={i} className={`pk-pass__dot${score >= i ? ` is-on is-${score}` : ''}`} />
            ))}
          </span>
          <span className="pk-pass__word" id={`${tipsId}-word`} aria-live="polite">
            {WORDS[score]}
          </span>
          <span
            className="pk-pass__info"
            onPointerEnter={() => setTipsOpen(true)}
            onPointerLeave={() => setTipsOpen(false)}
          >
            <button
              type="button"
              className="pk-pass__info-btn"
              aria-expanded={tipsOpen}
              aria-controls={tipsId}
              aria-label="Password tips"
              onClick={() => setTipsOpen((o) => !o)}
              onFocus={() => setTipsOpen(true)}
              onBlur={() => setTipsOpen(false)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
            </button>
            <ul id={tipsId} className={`pk-pass__tips${tipsOpen ? ' is-open' : ''}`} hidden={!tipsOpen}>
              {TIPS.map((t) => {
                const met = t.test(value);
                return (
                  <li key={t.text} className={met ? 'is-met' : ''}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      {met ? <path d="M20 6 9 17l-5-5" /> : <path d="M18 6 6 18M6 6l12 12" />}
                    </svg>
                    <span>
                      {t.text}
                      {t.rule ? ' (needed)' : ''}
                      <span className="pk-pass__sr">{met ? ' — done' : ' — not yet'}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </span>
        </div>
      )}
    </div>
  );
}
