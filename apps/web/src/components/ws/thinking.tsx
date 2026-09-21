// The Thinking card — the centrepiece of the conversation.
//
// A compact black-glass card with a luminous ring, the current phase and a
// chevron; inside, the event-backed detail timeline remains available:
// Intent → Plan → Actions → Validation.
//
// READ `thinking-model.ts` BEFORE CHANGING ANYTHING HERE. Every row this
// component can draw comes from `buildTimeline`, and `buildTimeline` emits a
// stage only when the worker genuinely supplied its data. This file is a
// renderer: it has no fallback copy, no default stage list and no way to invent
// a row. If the backend never sent an intent, the Intent and Plan bullets do
// not exist in the DOM at all — they are not greyed out, not "waiting", not
// there. There is also no percentage anywhere, because a progress figure here
// would be a guess presented as a measurement.
//
// The Actions stage delegates to <Activity> (`activity-model.ts`), which groups
// the same real events into ordered, timed phases with a terminal state and
// hangs each step's typed evidence on it. `buildTimeline` still decides whether
// that stage exists at all, so the honesty tests keep gating the whole timeline.
import { useCallback, useEffect, useId, useState } from 'react';
import type { RunIntent } from '@golem/shared';
import type { AgentStatus, ToolEvent } from '../../lib/use-project-socket';
import { readSoundEnabled, writeSoundEnabled } from '../../lib/prefs';
import { useReducedMotion } from '../../lib/theme';
import { interfaceSound } from '../../lib/interface-sound';
import { deniedNote } from '../../lib/tool-permissions';
import { Activity, ActivityTerminal } from './activity';
import type { ActivityRun, ActivityStep } from './activity-model';
import type { Evidence } from './evidence-model';
import { Icon, PATH } from './primitives';
import { ModelMark } from './model-mark';
import {
  buildTimeline,
  headerHint,
  labelForTool,
  PHASE_LABEL,
  type GateRow,
  type PlannedStep,
  type TimelineInput,
  type TimelineStage,
} from './thinking-model';
import './thinking.css';

/* ---------------------------------------------------------- compact view --- */

/** The small, always-visible slice of the event log. No status counter or prediction enters here. */
export interface CompactActivity {
  current: ActivityStep | null;
  recent: ActivityStep[];
}

/**
 * Keep the run card useful at a glance without turning it into a progress meter:
 * the one active step, plus the two latest other steps that the reducer can
 * substantiate. Upcoming steps deliberately do not appear in this preview.
 */
export function compactActivity(run: ActivityRun): CompactActivity {
  const steps = run.phases.flatMap((phase) => phase.steps);
  let currentIndex = -1;
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    if (steps[index]?.state === 'active') {
      currentIndex = index;
      break;
    }
  }
  const current = currentIndex === -1 ? null : steps[currentIndex]!;
  const recent = steps.filter((_, index) => index !== currentIndex).slice(-2);
  return { current, recent };
}

/** The canonical activity table stays the source of completed wording. These small
 * verb changes make only the one currently running row read as an action. */
const PRESENT_VERBS: readonly [RegExp, string][] = [
  [/^Read\b/, 'Reading'],
  [/^Inspected\b/, 'Inspecting'],
  [/^Listed\b/, 'Listing'],
  [/^Searched\b/, 'Searching'],
  [/^Reviewed\b/, 'Reviewing'],
  [/^Looked up\b/, 'Looking up'],
  [/^Formatted\b/, 'Formatting'],
  [/^Chose\b/, 'Choosing'],
  [/^Picked\b/, 'Choosing'],
  [/^Generated\b/, 'Generating'],
  [/^Made\b/, 'Making'],
  [/^Spoke\b/, 'Speaking'],
  [/^Created\b/, 'Creating'],
  [/^Inserted\b/, 'Inserting'],
  [/^Ran\b/, 'Running'],
  [/^Set\b/, 'Setting'],
  [/^Routed\b/, 'Routing'],
  [/^Deleted instances\b/, 'Removing instances'],
  [/^Edited\b/, 'Editing'],
  [/^Rendered\b/, 'Rendering'],
  [/^Framed\b/, 'Framing'],
  [/^Checked\b/, 'Checking'],
  [/^Moved\b/, 'Moving'],
  [/^Added\b/, 'Adding'],
  [/^Audited\b/, 'Auditing'],
  [/^Selected\b/, 'Selecting'],
  [/^Installed\b/, 'Installing'],
  [/^Removed\b/, 'Removing'],
  [/^Saved\b/, 'Saving'],
  [/^Noted\b/, 'Noting'],
  [/^Planned\b/, 'Planning'],
  [/^Fetched\b/, 'Fetching'],
  [/^Captured\b/, 'Capturing'],
  [/^Wrote\b/, 'Writing'],
];

function presentTense(label: string): string {
  for (const [pattern, replacement] of PRESENT_VERBS) {
    if (pattern.test(label)) return label.replace(pattern, replacement);
  }
  return label;
}

function presentActionLabel(step: ActivityStep): string {
  if (step.tool) return presentTense(labelForTool(step.tool));
  if (step.phase) return PHASE_LABEL[step.phase] ?? step.label;
  return step.label;
}

function usePageHidden(): boolean {
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden === true);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibility = () => setHidden(document.hidden === true);
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return hidden;
}

/* --------------------------------------------------------------- stages --- */

function Gate({ gate }: { gate: GateRow }) {
  return (
    <li className={`gx-gate${gate.passed ? ' is-pass' : ' is-fail'}`}>
      <span className="gx-gate__name">
        {gate.label}
        <span className="gx-gate__verdict">
          {gate.passed ? 'passed' : 'not passed'}
          {gate.score !== undefined ? ` · ${gate.score.toFixed(1)}/10` : ''}
        </span>
      </span>
      {gate.detail && <span className="gx-gate__detail">{gate.detail}</span>}
    </li>
  );
}

function Stage({
  stage,
  activity,
  evidence,
}: {
  stage: TimelineStage;
  activity: ActivityRun;
  evidence: Map<string, Evidence>;
}) {
  return (
    <li className={`gx-stage-row${stage.live ? ' is-live' : ''}`}>
      <span className="gx-stage-row__bullet" aria-hidden="true" />
      <div className="gx-stage-row__body">
        <span className="gx-stage-row__name">{stage.label}</span>

        {stage.summary && <p className="gx-stage-row__text">{stage.summary}</p>}

        {stage.items && (
          <ul className="gx-plan">
            {stage.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}

        {/* The Actions stage is drawn by <Activity>, which groups the same real
            events into ordered, timed phases and hangs each step's evidence on
            it. `stage.actions` still decides whether this stage EXISTS AT ALL —
            it is the honesty gate `tests/thinking-model.test.mjs` pins, and no
            timeline appears without it. */}
        {stage.actions && <Activity run={activity} evidence={evidence} />}

        {stage.gates && <ul className="gx-gates">{stage.gates.map((g) => <Gate key={g.key} gate={g} />)}</ul>}
      </div>
    </li>
  );
}

/* ----------------------------------------------------------------- card --- */

export function Thinking({
  tools,
  status,
  streaming,
  intent,
  deniedTools,
  gates,
  plannedSteps,
  activity,
  evidence,
}: {
  tools: ToolEvent[];
  status: AgentStatus | null;
  streaming: boolean;
  /** From the `run_intent` server message. Absent until the worker sends one. */
  intent?: RunIntent;
  /**
   * Tools this run was not given, from `tools_denied`. Absent until the worker sends one, so a
   * reloaded conversation and an older deployment are silent rather than claiming nothing was
   * withheld — which is a different statement from having checked and found nothing.
   */
  deniedTools?: string[];
  gates: GateRow[];
  plannedSteps: PlannedStep[];
  /** The ordered, timed activity — see `activity-model.ts`. */
  activity: ActivityRun;
  /** Typed artifacts, keyed by `toolId`. See `evidence-model.ts`. */
  evidence: Map<string, Evidence>;
}) {
  //[[ WHO DECIDED THIS PANEL IS SHUT.
  //
  //   `useState(false)` meant nobody did: every run, on every screen, started with its own record
  //   folded away behind "View details". The card is the one place the product shows what it is
  //   doing with a person's Credits WHILE it is doing it, and none of it was on screen until they
  //   clicked. An audit of the deployed product read the live cost out of the DOM and recorded it
  //   as visible; it was not visible, because `.gx-think__body` is `display:none` until `.is-open`
  //   and `innerText` falls back to `textContent` on an unrendered element.
  //
  //   `null` is "the person has not said", and while the run is live that resolves to open. A
  //   click is a statement and outranks it from then on, in both directions.
  const [open, setOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(readSoundEnabled);
  const detailsId = useId();
  const reducedMotion = useReducedMotion();
  const pageHidden = usePageHidden();

  const input: TimelineInput = { intent, tools, plannedSteps, gates, status, streaming };
  const stages = buildTimeline(input);
  const compact = compactActivity(activity);
  // A terminal event is enough to draw the card. It is a real answer about the
  // run, even when the run produced no stages of its own.
  const isLive = streaming && !activity.terminal;
  const title = activity.terminal?.note ?? (isLive && compact.current ? presentActionLabel(compact.current) : (isLive && status ? (PHASE_LABEL[status.phase] ?? status.phase) : 'Activity'));
  // THE SECOND LINE OF THE HEADER, WHICH WAS COMPUTED ON EVERY RENDER AND DRAWN BY NOBODY.
  //
  // `hint` has been assigned here since the redesign and never reached the JSX, so `.gx-think__hint`
  // and the 375px rule that hides it were both dead, and so was headerHint()'s whole return value.
  // Collapsed, the card was one line of text and an arrow with no statement anywhere that the arrow
  // did something.
  //
  // AND IT MAY NOT SAY WHAT THE FIRST LINE ALREADY SAID. While a run is live with a named action,
  // `title` IS that action label and the expression below produces the identical string — printing
  // it twice, once in ink and once in grey, would have been the reason this line looked wrong
  // enough to leave out. Where the two collide the second line falls back to the affordance, which
  // is the thing the first line never carries.
  const liveHint = activity.terminal
    ? (open ? 'Hide details' : 'View details')
    : isLive
      ? (compact.current ? presentActionLabel(compact.current) : 'Working')
      : headerHint(input, open);
  const hint = liveHint === title ? (open ? 'Hide details' : 'View details') : liveHint;

  useEffect(() => {
    // Applying the preference is intentionally silent: this must not create or
    // resume an AudioContext while a history turn is being painted.
    interfaceSound.setEnabled(soundEnabled);
  }, [soundEnabled]);

  const toggleSound = useCallback(() => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    writeSoundEnabled(next);
    // Keep the module state in step with the trusted click before trying to
    // unlock. The effect below mirrors this too, but runs after the gesture.
    interfaceSound.setEnabled(next);
    if (next) {
      // This is the only card path allowed to unlock audio, and it runs from
      // the button's trusted click/tap gesture. A replay never invokes it.
      void interfaceSound.unlock();
    } else {
      interfaceSound.stop();
    }
  }, [soundEnabled]);

  const cardClasses = [
    'gx-think',
    'gx-think--redesign',
    'aw-runtime',
    isLive ? 'is-live' : '',
    activity.terminal ? 'is-terminal' : '',
    reducedMotion ? 'is-reduced' : '',
    pageHidden ? 'is-page-hidden' : '',
  ].filter(Boolean).join(' ');

  // Keep all hooks above this guard. A terminal-only card is real, while a
  // turn with no observed stage or terminal remains absent from the DOM.
  if (stages.length === 0 && !activity.terminal) return null;

  return (
    <div className={cardClasses} data-terminal={activity.terminal?.kind ?? undefined}>
      <div className="gx-think__head aw-runtime__head">
        <span className="aw-runtime__scan" aria-hidden="true" />
        <button
          type="button"
          className="gx-think__toggle aw-runtime__toggle"
          aria-expanded={open}
          aria-controls={detailsId}
          aria-label={`${title}. ${open ? 'Hide details' : 'View details'}`}
          onClick={() => setOpen(!open)}
        >
          <span className="aw-runtime__mark">
            <ModelMark live={isLive && !reducedMotion && !pageHidden} />
          </span>
          <span className="aw-runtime__copy">
            <span className="gx-think__word">{title}</span>
            <span className="gx-think__hint" aria-hidden="true">{hint}</span>
          </span>
          <span className="aw-runtime__signal" aria-hidden="true">
            <i /><i /><i /><i /><i />
          </span>
          {/* Not announced: `aria-expanded` on this button already tells a screen reader what the
              arrow means, and "View details" read out after the run's own state is noise. It is a
              visual affordance, which is exactly what was missing. */}
          <span className="gx-think__chev" aria-hidden="true">
            <Icon d={PATH.chevronDown} size={14} />
          </span>
        </button>

        {/*[[ WHAT THIS RUN HAS COST, ON SCREEN WHILE IT IS STILL COSTING IT.
            This figure used to live in the foot INSIDE `.gx-think__body`, which is `display:none`
            until the person opens the panel — so the answer to "what is this costing me" was one
            click away for the whole of the run, and arrived in the turn footer only once the money
            was already spent. It is settled by the worker and never estimated here, and it is
            drawn only once something has actually been spent: an opening run showing a confident
            "0 Credits" would be a claim nobody measured.
            OUTSIDE the toggle deliberately. Inside, it would join the button's accessible name and
            a screen reader would hear the cost re-read every time the label changed. ]]*/}
        {status?.creditsSpent != null && status.creditsSpent > 0 && (
          <span className="gx-think__cost" title="Credits settled for this run so far">
            <strong>{status.creditsSpent}</strong> {status.creditsSpent === 1 ? 'Credit' : 'Credits'}
            <span className="gx-sr"> spent on this run so far</span>
          </span>
        )}
        {open && <button
          type="button"
          className={`gx-think__sound${soundEnabled ? ' is-on' : ' is-muted'}`}
          aria-pressed={soundEnabled}
          aria-label={soundEnabled ? 'Mute interface sounds' : 'Enable interface sounds'}
          title={soundEnabled ? 'Mute interface sounds' : 'Enable interface sounds'}
          onClick={toggleSound}
        >
          <span aria-hidden="true">{soundEnabled ? '◖))' : '◖×'}</span>
        </button>}
      </div>

      <div
        className={`gx-think__body aw-runtime__drawer${open ? ' is-open' : ''}`}
        id={detailsId}
        aria-hidden={!open}
      >
        <div className="gx-think__inner aw-runtime__inner">
          <ol className="gx-timeline">
            {stages.map((stage) => (
              <Stage key={stage.kind} stage={stage} activity={activity} evidence={evidence} />
            ))}

            {/* How the run ended, last — after the gates, because a gate result
                arrives while the run is still going. Absent entirely when the
                outcome was never reported, which is the case for every turn
                reloaded from message history. */}
            {activity.terminal && <ActivityTerminal terminal={activity.terminal} />}
          </ol>

          {/* WHAT THIS RUN WAS NOT ALLOWED TO DO.
              Above the effort line and below the timeline, because it explains the timeline: a
              step that never happened leaves no row, and without this the absence has no cause
              anywhere on the screen. Drawn only when something really was withheld — `deniedNote`
              returns null otherwise, and an empty announcement is worse than no announcement. */}
          {deniedNote(deniedTools) && (
            <p className="gx-think__foot gx-think__denied" role="note">
              {deniedNote(deniedTools)}
            </p>
          )}

          {/* The reasoning POLICY's own justification for the effort tier it
              picked. A classification of the request, not the model's private
              reasoning. */}
          {/* The credit figure is NOT restated here — it is in the card's head, where it is on
              screen whether or not this panel is open. Printing it in both places would show one
              measurement twice and invite the reader to add them up. */}
          {status?.effort && (
            <p className="gx-think__foot">
              Reasoning effort: <strong>{status.effort}</strong>
              {status.effortReason ? ` — ${status.effortReason}` : ''}
            </p>
          )}
        </div>
      </div>

      {/* Announce phase changes to assistive technology without flooding it:
          polite, and only the one line. */}
      <span className="gx-sr" aria-live="polite">
        {streaming ? hint : ''}
      </span>
    </div>
  );
}
