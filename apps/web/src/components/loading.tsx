// Branded loading. One sequence per operation, because "building" and
// "restoring a checkpoint" are not the same wait and should not look the same.
//
// The steps advance on a timer only as a *rhythm* — they never claim a stage is
// finished when it is not. The last step stays active until the real work ends,
// so the sequence can never race ahead of the truth.
import { useEffect, useState } from 'react';
import { OPERATION_STEPS, type OperationKind } from '../lib/tool-meta';
import { RunePulse } from './glyphs';

const HEADLINE: Record<OperationKind, string> = {
  building: 'Golem is building',
  verifying: 'Golem is verifying',
  rendering: 'Golem is looking at your scene',
  restoring: 'Rewinding your place',
  connecting: 'Waiting for Studio',
  recalling: 'Opening the session',
};

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

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
    <div className="forge" role="status" aria-live="polite">
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
              <span className="forge-step-mark" aria-hidden="true">
                {i < index ? '✓' : ''}
              </span>
              {step}
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

/** The smallest possible wait indicator, for inline use. */
export function Spinner({ label }: { label?: string }) {
  return (
    <span className="rune-spinner" role="status" aria-label={label ?? 'Loading'}>
      <span className="visually-hidden">{label ?? 'Loading'}</span>
    </span>
  );
}
