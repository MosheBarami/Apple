// §32: "Suggest next milestone" — the small contextual set, asked for on
// purpose.
//
// The worker keeps this deliberately short (three at most). A list of twelve
// "next steps" is not a recommendation, so the panel does not pad it out, and
// when the scan has nothing new to propose it says exactly that instead of
// inventing a third card.
//
// These are proposals drawn from the same plan the spine draws, so a suggestion
// is usually already on it. The card says so and offers to show you where,
// rather than an "Add" button that would silently do nothing.
import { COMPLEXITY, ComplexityMark } from './marks';
import type { BriefIntent } from './milestone-card';
import { creditRangeLabel, effortLabel, type Milestone } from './model';
import { CompareTable } from '../picks/tech/compare-table';
import '../picks/tech/tech-ui.css';
import './suggestions.css';

interface Props {
  /** `idle` renders nothing — the panel only exists once it has been asked. */
  state: 'idle' | 'pending' | 'error' | 'ready';
  next: Milestone[];
  error: string | null;
  /** True when this milestone is already drawn on the spine above. */
  inPlan: (id: string) => boolean;
  /** Resolves a prerequisite id to a title, or null when it is not in the plan. */
  titleOf: (id: string) => string | null;
  onJumpTo: (milestoneId: string) => void;
  onBrief: (milestoneId: string, intent: BriefIntent) => void;
  busy: { id: string; intent: BriefIntent } | null;
  onRetry: () => void;
  onDismiss: () => void;
}

export function SuggestionPanel({
  state,
  next,
  error,
  inPlan,
  titleOf,
  onJumpTo,
  onBrief,
  busy,
  onRetry,
  onDismiss,
}: Props) {
  if (state === 'idle') return null;

  return (
    <section className="rm-suggest" aria-label="Suggested next milestones">
      <header className="rm-suggest__head">
        <h2 className="rm-suggest__title">Suggested next</h2>
        <p className="rm-suggest__sub">
          What Apple would pick up next, given what it can see in your place right now.
        </p>
        <button type="button" className="btn btn-sm btn-ghost rm-suggest__dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      </header>

      {/* The pending state says what is actually happening. A bare spinner here
          would be indistinguishable from a stalled scan. */}
      {state === 'pending' && (
        <div className="rm-suggest__pending" aria-live="polite">
          <p className="rm-suggest__pending-copy">
            Reading your place — what is built, what is missing — and picking the next few things worth
            doing. This scans the project, so it takes a moment.
          </p>
          <div className="rm-suggest__grid" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rm-sg rm-sg--skeleton">
                <div className="skeleton skeleton-title" />
                <div className="skeleton skeleton-line" />
                <div className="skeleton skeleton-line short" />
              </div>
            ))}
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="rm-suggest__error" role="alert">
          <p>{error ?? 'The scan did not finish.'}</p>
          <button type="button" className="btn btn-sm" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}

      {state === 'ready' && next.length === 0 && (
        <p className="rm-suggest__none">
          Nothing new to propose — everything Apple can see is either built or waiting on something else
          in the plan above.
        </p>
      )}

      {state === 'ready' && next.length > 0 && (
        <div className="rm-suggest__grid">
          {next.map((s) => {
            const waits = (s.blockedBy ?? []).map(titleOf).filter((t): t is string => t !== null);
            const cardBusy = busy?.id === s.id ? busy.intent : null;
            return (
              <article
                key={s.id}
                className="rm-sg"
                style={{ ['--rm-weight' as string]: COMPLEXITY[s.complexity]?.accent ?? 'var(--accent)' }}
              >
                <h3 className="rm-sg__title">{s.title}</h3>
                <p className="rm-sg__summary">{s.why}</p>
                {s.impact && <p className="rm-sg__why">{s.impact}</p>}

                <div className="rm-sg__facts">
                  {COMPLEXITY[s.complexity] && (
                    <span className="rm-fact">
                      <ComplexityMark complexity={s.complexity} />
                      {COMPLEXITY[s.complexity].label}
                    </span>
                  )}
                  {s.effort && <span className="chip">{effortLabel(s.effort)}</span>}
                </div>

                {waits.length > 0 && (
                  <p className="rm-sg__builds">
                    Waits for <strong>{waits.join(', ')}</strong>
                  </p>
                )}

                <div className="rm-sg__actions">
                  {inPlan(s.id) && (
                    <button type="button" className="btn btn-sm" onClick={() => onJumpTo(s.id)}>
                      Show in plan
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-sm btn-quiet"
                    disabled={cardBusy !== null}
                    onClick={() => onBrief(s.id, 'plan')}
                  >
                    {cardBusy === 'plan' ? 'Reading…' : 'Plan'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={cardBusy !== null}
                    onClick={() => onBrief(s.id, 'build')}
                  >
                    {cardBusy === 'build' ? 'Reading…' : 'Build'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Two or more suggestions can be weighed against each other, row by row. */}
      {state === 'ready' && next.length > 1 && (
        <details className="tq-details">
          <summary>Compare them</summary>
          <div className="tq-details__body">
            <CompareTable
              caption="The suggested milestones side by side"
              columns={next.map((s) => s.title)}
              rows={[
                { label: 'Size', values: next.map((s) => COMPLEXITY[s.complexity]?.label ?? '') },
                { label: 'Work', values: next.map((s) => effortLabel(s.effort)) },
                { label: 'Cost', values: next.map((s) => creditRangeLabel(s.creditsLow, s.creditsHigh)) },
                {
                  label: 'Waits for',
                  values: next.map((s) => (s.blockedBy ?? []).map(titleOf).filter((t): t is string => t !== null).join(', ')),
                },
                { label: 'In the plan', values: next.map((s) => (inPlan(s.id) ? 'Yes' : 'No')) },
                // A row the worker sent nothing for is left out rather than drawn as a line of dashes.
              ].filter((row) => row.values.some((v) => v !== ''))}
            />
          </div>
        </details>
      )}
    </section>
  );
}
