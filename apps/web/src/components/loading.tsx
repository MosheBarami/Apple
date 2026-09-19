// Branded loading. One sequence per operation, because "building" and
// "restoring a checkpoint" are not the same wait and should not look the same.
//
// The steps advance on a timer only as a *rhythm* — they never claim a stage is
// finished when it is not. The last step stays active until the real work ends,
// so the sequence can never race ahead of the truth.
import { useEffect, useState } from 'react';
import { OPERATION_STEPS, type OperationKind } from '../lib/tool-meta';
// The OS query is no longer read here. It is still honoured — it is one of the two inputs to
// `useReducedMotion` — but a user who has overridden it in settings must be able to override it
// HERE too, and a second local copy of the query could only ever disagree with the first.
import { useReducedMotion } from '../lib/theme';
import { RunePulse } from './glyphs';
import { StatusIcon } from './status-icon';
import './loading.css';

const HEADLINE: Record<OperationKind, string> = {
  building: 'Apple is building',
  verifying: 'Apple is verifying',
  rendering: 'Apple is looking at your scene',
  restoring: 'Rewinding your place',
  connecting: 'Waiting for Studio',
  recalling: 'Opening the session',
};

interface ForgeProps {
  kind: OperationKind;
  /** Overrides the built-in headline. */
  label?: string;
  /** Hide the step list for tight spaces (rail, inline). */
  compact?: boolean;
  /** Milliseconds each step is highlighted before the next one takes over. */
  cadenceMs?: number;
}

/**
 * The branded wait. `role="status"` so a screen reader is told what is happening
 * once, not on every tick.
 */
export function Forge({ kind, label, compact, cadenceMs = 1500 }: ForgeProps) {
  const steps = OPERATION_STEPS[kind];
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
    if (reduced || compact) return;
    const id = window.setInterval(() => {
      setIndex((i) => Math.min(i + 1, steps.length - 1));
    }, cadenceMs);
    return () => window.clearInterval(id);
  }, [kind, cadenceMs, reduced, compact, steps.length]);

  return (
    // `is-compact` is carried as a class rather than left implicit in "no step list". The compact
    // wait is the only one that ships today, and a panel holding three short things cannot have
    // been sized by the same padding as one holding seven.
    <div className={`forge${compact ? ' is-compact' : ''}`} role="status" aria-live="polite">
      <span className="forge-mark" aria-hidden="true">
        <RunePulse size={24} />
      </span>
      <p className="forge-label">{label ?? HEADLINE[kind]}</p>
      {!compact && (
        <ol className="forge-steps">
          {steps.map((step, i) => (
            <li
              key={step}
              className={`forge-step${i < index ? ' is-done' : ''}${i === index ? ' is-active' : ''}`}
            >
              {/* THE MARK IS ON THE STEP IN FLIGHT, not on the ones behind it, and that is a
                  correction. A finished step used to carry `<StatusIcon status="success">`, whose
                  tone is --good — a second green on a panel whose progress bar already spends the
                  accent, for a state nobody has to act on. The step that is HAPPENING is the one
                  worth marking, `pending` is the only status in the canonical set that animates,
                  and its tone is muted, so the sequence reads without spending a colour.
                  The box is left EMPTY for every other step on purpose: loading.css draws the
                  filled dot and the hollow ring off `:empty`, so the state is described once. */}
              <span className="forge-step-mark">
                {i === index ? <StatusIcon status="pending" size={12} /> : null}
              </span>
              <span className="forge-step-name">{step}</span>
            </li>
          ))}
        </ol>
      )}
      <span className="forge-bar" aria-hidden="true">
        <span />
      </span>
      <span className="visually-hidden">{steps[Math.min(index, steps.length - 1)]}</span>
    </div>
  );
}

/**
 * The smallest possible wait indicator, for inline use.
 *
 * IT USED TO BE INVISIBLE. The span's only child was screen-reader text, so the workspace's
 * "Opening your project…" screen — the one a customer sees between clicking a project and seeing
 * it — rendered as an empty page. The mark comes from the shared status vocabulary so that the one
 * spinning thing in the product spins the same way everywhere, and `label`, when a caller gives
 * one, is now SHOWN rather than only announced: the caller had already written the sentence, and a
 * 14px mark alone on a full page says less than it does.
 */
export function Spinner({ label }: { label?: string }) {
  return (
    <span className="rune-spinner" role="status">
      <StatusIcon status="pending" size={14} />
      {label
        ? <span className="rune-spinner__label">{label}</span>
        : <span className="visually-hidden">Loading</span>}
    </span>
  );
}
