// The Thinking card — the centrepiece of the conversation.
//
// A bordered card with an amber creditle, the word "Thinking" and a chevron;
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
//
// The Actions stage delegates to <Activity> (`activity-model.ts`), which groups
// the same real events into ordered, timed phases with a terminal state and
// hangs each step's typed evidence on it. `buildTimeline` still decides whether
// that stage exists at all, so the honesty tests keep gating the whole timeline.
import { useState } from 'react';
import type { RunIntent } from '@golem/shared';
import type { AgentStatus, ToolEvent } from '../../lib/use-project-socket';
import { Activity, ActivityTerminal } from './activity';
import type { ActivityRun } from './activity-model';
import type { Evidence } from './evidence-model';
import { Icon, PATH } from './primitives';
import {
  buildTimeline,
  headerHint,
  type GateRow,
  type PlannedStep,
  type TimelineInput,
  type TimelineStage,
} from './thinking-model';

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

        {stage.questions && (
          <div className="gx-open-qs">
            <span className="gx-open-qs__label">The request didn&rsquo;t say — Apple hasn&rsquo;t assumed:</span>
            <ul>
              {stage.questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </div>
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
  gates: GateRow[];
  plannedSteps: PlannedStep[];
  /** The ordered, timed activity — see `activity-model.ts`. */
  activity: ActivityRun;
  /** Typed artifacts, keyed by `toolId`. See `evidence-model.ts`. */
  evidence: Map<string, Evidence>;
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
        <span className="gx-think__credit" aria-hidden="true">
          <Icon d={PATH.creditle} size={15} />
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
              <Stage key={stage.kind} stage={stage} activity={activity} evidence={evidence} />
            ))}

            {/* How the run ended, last — after the gates, because a gate result
                arrives while the run is still going. Absent entirely when the
                outcome was never reported, which is the case for every turn
                reloaded from message history. */}
            {activity.terminal && <ActivityTerminal terminal={activity.terminal} />}
          </ol>

          {/* The reasoning POLICY's own justification for the effort tier it
              picked. A classification of the request, not the model's private
              reasoning. */}
          {(status?.effort || status?.creditsSpent != null || status?.step != null) && (
            <p className="gx-think__foot">
              {status?.step != null && status?.totalSteps != null && (
                <>
                  Step <strong>{status.step}</strong> of {status.totalSteps}
                  {(status.effort || status.creditsSpent != null) ? ' · ' : ''}
                </>
              )}
              {/* What THIS run has cost, settled by the worker and never estimated here. The
                  account-wide figure lives in the credits panel; this is the one a user watching a
                  build can actually act on. Rendered only once something has been spent, so an
                  opening run does not display a confident "0". */}
              {status?.creditsSpent != null && status.creditsSpent > 0 && (
                <>
                  <strong>{status.creditsSpent}</strong> {status.creditsSpent === 1 ? 'Credit' : 'Credits'} this run
                  {status.effort ? ' · ' : ''}
                </>
              )}
              {status?.effort && (
                <>
                  Reasoning effort: <strong>{status.effort}</strong>
                  {status.effortReason ? ` — ${status.effortReason}` : ''}
                </>
              )}
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
