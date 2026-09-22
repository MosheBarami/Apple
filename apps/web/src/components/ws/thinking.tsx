// The Thinking card: ONE continuous surface, built from Vercel AI Elements.
//
//   Reasoning            owns the header line and the disclosure: Brain, the current observable
//                        action under a Shimmer while the run is live, the measured duration, the
//                        chevron — and the Credits settled so far, beside it.
//   ReasoningContent     the disclosure body. It is a real CollapsibleContent carrying the id the
//                        trigger's aria-controls names, and it renders COMPONENTS: this product has
//                        no model reasoning to show, and none crosses the wire (docs/THINKING-UX.md).
//   ChainOfThought       the observed execution, from the activity reducer: the current step and the
//                        two before it, with every earlier step one disclosure away.
//   Tool                 one row per tool call: friendly name, running / done / a real final
//                        failure, and — opened — only what it was pointed at, what the worker said
//                        came back, and how long it took. Never a payload, never JSON. Closed until
//                        somebody opens it (D-UX-2: the detail is there, not in the way).
//   Next                 the ONE next step a validated `build_plan` announced, as a pending step in
//                        plain words. Never the plan's checklist (D-UX-2), and never inferred.
//   Details              every validated document the reply no longer draws (lib/reply-docs.ts),
//                        closed, its renderer loaded only once it is opened.
//
// What the surface may show, and what it may not, is decided in execution-model.ts, where a test can
// reach it. This file only lays those decisions out, and holds no state of its own: every
// disclosure here is owned by the AI Elements component that draws it.
import { Suspense, lazy, useId, type ReactNode } from 'react';
import type { PlaytestRun, RunIntent, StudioFrame } from '@golem/shared';
import type { UIDocument } from '../../lib/generative-ui/schema';
import type { AgentStatus } from '../../lib/use-project-socket';
import { deniedNote } from '../../lib/tool-permissions';
import type { ActivityRun } from './activity-model';
import { PlaytestCard } from './playtest-card';
import { Reasoning, ReasoningContent, ReasoningTrigger, useReasoning } from '../ai-elements/reasoning';
import { Shimmer } from '../ai-elements/shimmer';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from '../ai-elements/chain-of-thought';
import { Tool, ToolContent, ToolHeader } from '../ai-elements/tool';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ai-elements/ui/collapsible';
import { CheckCircleIcon, ChevronDownIcon } from '../ai-elements/icons';
import type { ToolUIPartState } from '../ai-elements/ai-types';
import {
  executionView,
  formatSeconds,
  type ExecutionRow,
  type ExecutionView,
  type ToolRow,
  type ToolRowState,
} from './execution-model';
import { PHASE_LABEL, type GateRow, type PlannedStep } from './thinking-model';
import './reasoning.css';

// Loaded only when somebody opens Details: the component registry is large, and most runs are never
// looked at this closely.
const GenerativeUI = lazy(() => import('../../lib/generative-ui/render').then((m) => ({ default: m.GenerativeUI })));

/* ------------------------------------------------------------------ rows --- */

/** The three observed tool states, in AI Elements' tool-part vocabulary. */
const TOOL_STATE: Record<ToolRowState, ToolUIPartState> = {
  running: 'input-available',
  done: 'output-available',
  failed: 'output-error',
};

/** Only the safe facts about a step: on what, what came back, how long. */
function ToolFacts({ row }: { row: ToolRow }) {
  const facts: { term: string; value: string; className: string }[] = [];
  if (row.target) facts.push({ term: 'On', value: row.target, className: 'apple-reasoning__target' });
  if (row.result) facts.push({ term: 'Result', value: row.result, className: 'apple-reasoning__detail' });
  if (row.duration) facts.push({ term: 'Time', value: row.duration, className: 'apple-reasoning__time' });
  if (facts.length === 0) return <p className="apple-step__none">No details were reported for this step.</p>;
  return (
    <dl className="apple-step__facts">
      {facts.map((fact) => (
        <div key={fact.term} className="apple-step__fact">
          <dt>{fact.term}</dt>
          <dd className={fact.className}>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ToolStep({ row }: { row: ToolRow }) {
  // CLOSED, EVEN WHILE IT RUNS (D-UX-2). The step's name says what is happening in plain words; what
  // it was pointed at and what came back are one click away for whoever wants them. The row used to
  // open itself while running, which put a facts list in front of every child watching a build.
  return (
    <Tool className="apple-step">
      <ToolHeader title={row.title} type={`tool-${row.tool ?? 'unnamed'}`} state={TOOL_STATE[row.state]} />
      <ToolContent forceMount className="apple-step__body">
        <ToolFacts row={row} />
      </ToolContent>
    </Tool>
  );
}

function StepRow({ row }: { row: ExecutionRow }) {
  if (row.kind === 'tool') return <ToolStep row={row} />;
  return <ChainOfThoughtStep className="apple-step apple-step--phase" label={row.label} status={row.status} />;
}

const rowKey = (row: ExecutionRow) => `${row.key}:${row.kind === 'tool' ? row.state : row.status}`;

/* ------------------------------------------------------------ the surface --- */

/**
 * The disclosure body. Exported so a test can render a settled run's body directly: a settled
 * card starts closed, and server rendering cannot open it.
 */
export function ExecutionSurface({
  view,
  intent,
  plannedSteps,
  passedGates,
  denied,
  playtest,
  frames,
  studioConnected,
  details = [],
}: {
  view: ExecutionView;
  intent?: RunIntent;
  plannedSteps: PlannedStep[];
  passedGates: GateRow[];
  denied: string | null;
  playtest?: PlaytestRun | null;
  frames?: StudioFrame[];
  studioConnected: boolean;
  /** Validated documents the reply does not draw (lib/reply-docs.ts). */
  details?: readonly UIDocument[];
}) {
  // ChainOfThoughtHeader and ChainOfThoughtContent each wrap a Collapsible of their own, so the
  // header can name its content only if both are handed the same id.
  const historyId = useId();
  const verified = passedGates.length > 0;
  // THE NEXT STEP, NOT THE PLAN. One pending row in the same list as the work already done, in the
  // plan's own words; the whole checklist is in Details for whoever wants it.
  const next = plannedSteps[0];

  return (
    <>
      {playtest && (
        <div className="apple-reasoning__playtest">
          <PlaytestCard run={playtest} frames={frames ?? []} studioConnected={studioConnected} />
        </div>
      )}

      {intent?.summary && <p className="apple-reasoning__note">{intent.summary}</p>}

      {(view.rows.length > 0 || verified || next) && (
        <ChainOfThought className="apple-reasoning__chain" role="group" aria-label="Observed run activity">
          {view.earlier.length > 0 && (
            <>
              <ChainOfThoughtHeader aria-controls={historyId} className="apple-reasoning__history">
                {view.earlier.length === 1 ? '1 earlier step' : `${view.earlier.length} earlier steps`}
              </ChainOfThoughtHeader>
              <ChainOfThoughtContent id={historyId} forceMount>
                {view.earlier.map((row) => <StepRow key={rowKey(row)} row={row} />)}
              </ChainOfThoughtContent>
            </>
          )}
          {view.visible.map((row) => <StepRow key={rowKey(row)} row={row} />)}
          {/* ONE STEP, IN PLAIN WORDS. Which checks passed ("Visual quality gate", "Playtest") is
              detail; that it was checked and works is the thing a child needs to know. Drawn only
              for a check that really PASSED — a failed one is never painted as a success. */}
          {verified && (
            <ChainOfThoughtStep
              className="apple-step apple-step--verified"
              icon={CheckCircleIcon}
              label="Checked it works"
              status="complete"
            />
          )}
          {next && (
            <ChainOfThoughtStep className="apple-step apple-step--next" label={`Next: ${next.title}`} status="pending" />
          )}
        </ChainOfThought>
      )}

      {details.length > 0 && (
        <Collapsible className="apple-reasoning__more">
          <CollapsibleTrigger className="apple-reasoning__more-trigger">
            <span>Details</span>
            <ChevronDownIcon className="apple-reasoning__more-chevron" />
          </CollapsibleTrigger>
          {/* Not force-mounted: closed, nothing is rendered and the renderer is not fetched. */}
          <CollapsibleContent className="apple-reasoning__more-body">
            <Suspense fallback={<p className="apple-reasoning__note">Loading…</p>}>
              {details.map((doc, index) => <GenerativeUI key={index} doc={doc} />)}
            </Suspense>
          </CollapsibleContent>
        </Collapsible>
      )}

      {denied && <p className="apple-reasoning__denied" role="note">{denied}</p>}
    </>
  );
}

/* ---------------------------------------------------------------- header --- */

/** The line inside the trigger: the observed action while live, the measured time once settled. */
function thinkingMessage(title: string, isStreaming: boolean, duration: number | undefined): ReactNode {
  const time = formatSeconds(duration);
  if (isStreaming) {
    return (
      <>
        <Shimmer as="span" className="apple-reasoning__summary" duration={1}>{title}</Shimmer>
        {time && <span className="apple-reasoning__time">{time}</span>}
      </>
    );
  }
  return <p className="apple-reasoning__summary">{time ? `Thought for ${time}` : title}</p>;
}

function ReasoningHeader({ title, creditsSpent }: { title: string; creditsSpent?: number }) {
  const { isOpen } = useReasoning();
  return (
    <div className="apple-reasoning__head">
      <ReasoningTrigger
        aria-label={`${title}. ${isOpen ? 'Hide reasoning details' : 'Show reasoning details'}`}
        className="apple-reasoning__trigger"
        getThinkingMessage={(isStreaming, duration) => thinkingMessage(title, isStreaming, duration)}
      />
      {creditsSpent !== undefined && creditsSpent > 0 && (
        <span className="apple-reasoning__cost" title="Credits settled for this run so far">
          {creditsSpent} {creditsSpent === 1 ? 'Credit' : 'Credits'}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ card --- */

export function Thinking({
  status,
  streaming,
  intent,
  deniedTools,
  gates,
  plannedSteps,
  activity,
  frames,
  playtest,
  studioConnected = false,
  details = [],
}: {
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
  /** Real Studio frames for the active run. Never shown on historical turns. */
  frames?: StudioFrame[];
  /** Worker-owned playtest state for the active run. */
  playtest?: PlaytestRun | null;
  studioConnected?: boolean;
  /** Validated documents the reply does not draw, kept under Details (lib/reply-docs.ts). */
  details?: readonly UIDocument[];
}) {
  const view = executionView(activity);
  const isLive = streaming && !activity.terminal;
  const title = isLive && view.current
    ? (view.current.kind === 'tool' ? view.current.title : view.current.label)
    : isLive && status
      ? (PHASE_LABEL[status.phase] ?? status.phase)
      : isLive
        ? 'Thinking'
        : activity.terminal?.kind === 'done' || activity.terminal?.kind === 'recovered'
          ? 'Completed'
          : activity.terminal?.kind === 'stopped'
            ? 'Stopped'
            : activity.terminal?.kind === 'quota'
              ? 'Paused'
              : 'Activity';
  const elapsedSeconds = activity.elapsed ? Math.max(1, Math.ceil(activity.elapsed.ms / 1000)) : undefined;
  const passedGates = gates.filter((gate) => gate.passed);
  const denied = deniedNote(deniedTools);
  const hasObservedContent = Boolean(
    status ||
    intent?.summary ||
    view.rows.length > 0 ||
    activity.terminal ||
    playtest ||
    passedGates.length > 0 ||
    plannedSteps.length > 0 ||
    details.length > 0,
  );
  if (!hasObservedContent) return null;

  return (
    <Reasoning
      className={`apple-reasoning${isLive ? ' is-live' : ''}`}
      data-terminal={activity.terminal?.kind ?? undefined}
      isStreaming={isLive}
      duration={elapsedSeconds}
    >
      <ReasoningHeader title={title} creditsSpent={status?.creditsSpent} />
      <ReasoningContent className="apple-reasoning__details">
        <ExecutionSurface
          view={view}
          intent={intent}
          plannedSteps={plannedSteps}
          passedGates={passedGates}
          denied={denied}
          playtest={playtest}
          frames={frames}
          studioConnected={studioConnected}
          details={details}
        />
      </ReasoningContent>
      <span className="gx-sr" aria-live="polite">{isLive ? title : ''}</span>
    </Reasoning>
  );
}
