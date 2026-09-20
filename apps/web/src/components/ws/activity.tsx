// The activity timeline: the ordered, timed record of what Apple did.
//
// READ `activity-model.ts` BEFORE CHANGING ANYTHING HERE. Every phase, every
// step, every duration and the terminal row all come out of `reduceActivity`,
// and that reducer emits a thing only when an event named it. This file is a
// renderer: no fallback phases, no interpolated progress, no percentage of a
// run. If the worker never reported a phase, the row does not exist — it is not
// greyed out, not "waiting", not there.
//
// MOTION. Two things move: the in-flight arc, and a one-shot settle when a step
// resolves. Under `prefers-reduced-motion` both lose their TRAVEL and keep their
// FEEDBACK — the arc becomes a static partial ring, the settle becomes a colour
// change. Removing the feedback as well would leave a viewer with vestibular
// sensitivity looking at a timeline that never appears to change, which is the
// failure this split exists to prevent. `motionPlan` computes the rule in TS so
// it is unit-testable; the stylesheet keys off the class it returns.
import { useEffect, useState } from 'react';
import {
  elapsedTitle,
  formatElapsed,
  motionPlan,
  type ActivityPhase,
  type ActivityRun,
  type ActivityStep,
  type StepState,
  type Terminal,
} from './activity-model';
import { EvidenceCard } from './evidence-cards';
import type { Evidence } from './evidence-model';

/* ----------------------------------------------------------------- hooks --- */

/** The viewer's motion setting, live. Falls back to "reduce" when unknowable. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/**
 * A clock that only ticks while something is genuinely in flight.
 *
 * The live elapsed figure has to advance or it reads as frozen, but a timer
 * that keeps running after the run ends would repaint every settled turn in the
 * conversation once a second forever. `Turn` owns the one instance of this and
 * feeds its value into the reducer, so the timeline and its durations can never
 * be computed against two different clocks.
 */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

/* ----------------------------------------------------------------- marks --- */

const STATE_WORD: Record<StepState, string> = {
  done: 'done',
  active: 'in progress',
  failed: 'failed',
  // Not "not started": the step DID start and the run ended without a result.
  unknown: 'no result reported',
};

/** Done tick, in-flight ring, failure cross, and a dashed ring for no-result. */
function StepMark({ state }: { state: StepState }) {
  if (state === 'active') {
    return (
      <svg className="gx-ring" viewBox="0 0 16 16" aria-hidden="true">
        <circle className="gx-ring__track" cx="8" cy="8" r="5" />
        <circle className="gx-ring__spin" cx="8" cy="8" r="5" />
      </svg>
    );
  }
  if (state === 'unknown') {
    return (
      <svg className="gx-hollow gx-hollow--dashed" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="5" />
      </svg>
    );
  }
  if (state === 'failed') {
    return (
      <svg className="gx-tick" width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className="gx-tick" width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** An announced-but-unreached step. Hollow, and never inferred — see the model. */
function UpcomingMark() {
  return (
    <svg className="gx-hollow" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="5" />
    </svg>
  );
}

function Elapsed({ value }: { value: ActivityStep['elapsed'] }) {
  const text = formatElapsed(value);
  if (!text) return null;
  return (
    <span className={`gx-act__ms${value?.basis === 'tool' ? ' is-tooltime' : ''}`} title={elapsedTitle(value)}>
      {text}
    </span>
  );
}

/**
 * Does the worker's sentence already name this subject?
 *
 * Both strings have been through the same one-line collapse upstream, so a plain containment test
 * is exact rather than approximate. A target the summary already carries is not printed twice.
 */
function carries(detail: string | undefined, target: string): boolean {
  return detail !== undefined && detail.includes(target);
}

/* ----------------------------------------------------------------- rows --- */

function Step({
  step,
  evidence,
  showElapsed,
}: {
  step: ActivityStep;
  evidence?: Evidence;
  /** False when the phase heading already carries this step's only duration. */
  showElapsed: boolean;
}) {
  return (
    <li className={`gx-act__step is-${step.state}`}>
      <span className="gx-act__mark">
        <StepMark state={step.state} />
      </span>
      <span className="gx-act__step-body">
        <span className="gx-act__step-head">
          <span className="gx-act__step-label">{step.label}</span>
          <span className="gx-sr"> — {STATE_WORD[step.state]}</span>
          {showElapsed && <Elapsed value={step.elapsed} />}
        </span>
        {/* ON WHAT, then WHAT CAME BACK — two questions, two lines, and neither may delete the
            other. The subject is printed only when the worker's own sentence does not already
            contain it, because for the tools whose argument `summarize()` recognises the summary
            already reads "read_script, ServerScriptService.Main" with its verdict mark in front,
            and printing the path again underneath would read as two facts where there is one. */}
        {step.target && !carries(step.detail, step.target) && (
          <span className="gx-act__detail gx-act__target">{step.target}</span>
        )}
        {step.detail && <span className="gx-act__detail">{step.detail}</span>}
        {step.state === 'unknown' && (
          <span className="gx-act__detail">The run ended before this step reported a result.</span>
        )}
        {evidence && <EvidenceCard evidence={evidence} />}
      </span>
    </li>
  );
}

function Phase({ phase, evidence }: { phase: ActivityPhase; evidence: Map<string, Evidence> }) {
  return (
    <li className={`gx-act__phase is-${phase.state}`}>
      <span className="gx-act__pip" aria-hidden="true" />
      <div className="gx-act__phase-body">
        <span className="gx-act__phase-head">
          <span className="gx-act__phase-name">{phase.label}</span>
          <Elapsed value={phase.elapsed} />
          {phase.failures > 0 && phase.state !== 'failed' && (
            <span className="gx-act__repaired">
              {phase.failures === 1 ? '1 step failed and was retried' : `${phase.failures} steps failed and were retried`}
            </span>
          )}
        </span>
        <ol className="gx-act__steps">
          {phase.steps.map((step) => (
            <Step
              key={step.key}
              step={step}
              evidence={step.toolId ? evidence.get(step.toolId) : undefined}
              // With one step the phase heading already shows its duration;
              // printing the same figure twice reads as two measurements.
              showElapsed={phase.steps.length > 1}
            />
          ))}
        </ol>
      </div>
    </li>
  );
}

/**
 * How the run ended.
 *
 * It sits at the FOOT OF THE WHOLE CARD, after Validation — not at the end of
 * the Actions stage. A gate result arrives while the run is still going; "this
 * is over" is true of the run, and printing it above the gates would say the run
 * finished before they ran.
 */
export function ActivityTerminal({ terminal }: { terminal: Terminal }) {
  return (
    <li className={`gx-stage-row gx-term is-${terminal.kind}`}>
      <span className="gx-stage-row__bullet" aria-hidden="true" />
      <div className="gx-stage-row__body">
        <span className="gx-stage-row__name">{terminal.note}</span>
        {/* The worker's own error text, when it sent one. Never paraphrased. */}
        {terminal.error && <p className="gx-stage-row__text">{terminal.error}</p>}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------- component --- */

export function Activity({
  run,
  evidence,
}: {
  run: ActivityRun;
  /** Keyed by `toolId`. A step with no entry simply shows no card. */
  evidence: Map<string, Evidence>;
}) {
  const reduced = usePrefersReducedMotion();
  const motion = motionPlan(reduced);

  if (run.phases.length === 0 && run.upcoming.length === 0) return null;

  return (
    <ol className={`gx-act ${motion.className}`}>
      {run.phases.map((phase) => (
        <Phase key={phase.key} phase={phase} evidence={evidence} />
      ))}

      {run.upcoming.length > 0 && (
        <li className="gx-act__phase is-upcoming">
          <span className="gx-act__pip" aria-hidden="true" />
          <div className="gx-act__phase-body">
            {/* These exist because a validated `build_plan` named them as still
                to come. Nothing here is a prediction. */}
            <span className="gx-act__phase-name">Announced as still to come</span>
            <ol className="gx-act__steps">
              {run.upcoming.map((step) => (
                <li key={step.key} className="gx-act__step is-upcoming">
                  <span className="gx-act__mark">
                    <UpcomingMark />
                  </span>
                  <span className="gx-act__step-body">
                    <span className="gx-act__step-label">{step.label}</span>
                    <span className="gx-sr"> — not started</span>
                    {step.detail && <span className="gx-act__detail">{step.detail}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </li>
      )}
    </ol>
  );
}
