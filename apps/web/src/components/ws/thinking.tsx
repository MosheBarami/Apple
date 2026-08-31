// The Thinking card — the centrepiece of the conversation.
//
// A bordered card with an amber sparkle, the word "Thinking" and a chevron;
// inside, a vertical timeline of ring bullets joined by a hairline:
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
import { useState } from 'react';
import type { RunIntent } from '@golem/shared';
import type { AgentStatus, ToolEvent } from '../../lib/use-project-socket';
import { Icon, PATH } from './primitives';
import {
  buildTimeline,
  headerHint,
  type ActionRow,
  type GateRow,
  type PlannedStep,
  type TimelineInput,
  type TimelineStage,
} from './thinking-model';

/* -------------------------------------------------------------- bullets --- */

/** The checklist marks: done tick, in-flight rotating ring, hollow pending ring. */
function ActionMark({ state }: { state: ActionRow['state'] }) {
  if (state === 'active') {
    return (
      <svg className="gx-ring" viewBox="0 0 16 16" aria-hidden="true">
        <circle className="gx-ring__track" cx="8" cy="8" r="5" />
        <circle className="gx-ring__spin" cx="8" cy="8" r="5" />
      </svg>
    );
  }
  if (state === 'pending') {
    return (
      <svg className="gx-hollow" viewBox="0 0 16 16" aria-hidden="true">
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

const STATE_WORD: Record<ActionRow['state'], string> = {
  done: 'done',
  active: 'in progress',
  failed: 'failed',
  pending: 'not started',
};

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

function Stage({ stage }: { stage: TimelineStage }) {
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

        {stage.questions && (
          <div className="gx-open-qs">
            <span className="gx-open-qs__label">The request didn&rsquo;t say — Golem hasn&rsquo;t assumed:</span>
            <ul>
              {stage.questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </div>
        )}

        {stage.actions && (
          <ol className="gx-checks">
            {stage.actions.map((action) => (
              <li key={action.key} className={`gx-check is-${action.state}`}>
                <span className="gx-check__mark">
                  <ActionMark state={action.state} />
                </span>
                <span className="gx-check__label">
                  {action.label}
                  <span className="gx-sr"> — {STATE_WORD[action.state]}</span>
                  {action.detail && <span className="gx-check__detail">{action.detail}</span>}
                </span>
              </li>
            ))}
          </ol>
        )}

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
  gates,
  plannedSteps,
}: {
  tools: ToolEvent[];
  status: AgentStatus | null;
  streaming: boolean;
  /** From the `run_intent` server message. Absent until the worker sends one. */
  intent?: RunIntent;
  gates: GateRow[];
  plannedSteps: PlannedStep[];
}) {
  const [open, setOpen] = useState(false);

  const input: TimelineInput = { intent, tools, plannedSteps, gates, status, streaming };
  const stages = buildTimeline(input);
  if (stages.length === 0) return null;

  const hint = headerHint(input, open);

  return (
    <div className={`gx-think${streaming ? ' is-live' : ''}`}>
      <button
        type="button"
        className="gx-think__head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="gx-think__spark" aria-hidden="true">
          <Icon d={PATH.sparkle} size={15} />
        </span>
        <span className="gx-think__word">Thinking</span>
        <span className="gx-think__hint">{hint}</span>
        <span className="gx-think__chev" aria-hidden="true">
          <Icon d={PATH.chevronDown} size={14} />
        </span>
      </button>

      <div className={`gx-think__body${open ? ' is-open' : ''}`}>
        <div className="gx-think__inner">
          <ol className="gx-timeline">
            {stages.map((stage) => (
              <Stage key={stage.kind} stage={stage} />
            ))}
          </ol>

          {/* The reasoning POLICY's own justification for the effort tier it
              picked. A classification of the request, not the model's private
              reasoning. */}
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
