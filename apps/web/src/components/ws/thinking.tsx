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
//                        came back, and how long it took. Never a payload, never JSON.
//   Task                 the next steps a validated `build_plan` announced. Never inferred.
//
// What the surface may show, and what it may not, is decided in execution-model.ts, where a test can
// reach it. This file only lays those decisions out, and holds no state of its own: every
// disclosure here is owned by the AI Elements component that draws it.
import { useId, type ReactNode } from 'react';
import type { PlaytestRun, RunIntent, StudioFrame } from '@golem/shared';
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
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
  ChainOfThoughtStep,
} from '../ai-elements/chain-of-thought';
import { Tool, ToolContent, ToolHeader } from '../ai-elements/tool';
import { Task, TaskContent, TaskItem, TaskTrigger } from '../ai-elements/task';
import { CheckCircleIcon, ChevronDownIcon, ListTodoIcon } from '../ai-elements/icons';
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
  // OPEN WHILE IT RUNS. What a step is pointed at is worth reading only in the seconds it runs —
  // "which of my scripts?" — so the running row shows it without a click. The caller keys the row
  // on its state, so it closes itself once it finishes and the column stays one line per step.
  return (
    <Tool className="apple-step" defaultOpen={row.state === 'running'}>
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
}: {
  view: ExecutionView;
  intent?: RunIntent;
  plannedSteps: PlannedStep[];
  passedGates: GateRow[];
  denied: string | null;
  playtest?: PlaytestRun | null;
  frames?: StudioFrame[];
  studioConnected: boolean;
}) {
  // ChainOfThoughtHeader and ChainOfThoughtContent each wrap a Collapsible of their own, so the
  // header can name its content only if both are handed the same id.
  const historyId = useId();
  const verified = passedGates.slice(-2);
  const nextTitle = `${plannedSteps.length} planned ${plannedSteps.length === 1 ? 'step' : 'steps'}`;

  return (
    <>
      {playtest && (
        <div className="apple-reasoning__playtest">
          <PlaytestCard run={playtest} frames={frames ?? []} studioConnected={studioConnected} />
        </div>
      )}

      {intent?.summary && <p className="apple-reasoning__note">{intent.summary}</p>}

      {(view.rows.length > 0 || verified.length > 0) && (
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
          {verified.length > 0 && (
            <ChainOfThoughtStep
              className="apple-step apple-step--verified"
              icon={CheckCircleIcon}
              label="Verified"
              status="complete"
            >
              <ChainOfThoughtSearchResults role="group" aria-label="Verified checks">
                {verified.map((gate) => <ChainOfThoughtSearchResult key={gate.key}>{gate.label}</ChainOfThoughtSearchResult>)}
              </ChainOfThoughtSearchResults>
            </ChainOfThoughtStep>
          )}
        </ChainOfThought>
      )}

      {plannedSteps.length > 0 && (
        <Task className="apple-reasoning__next" role="group" aria-label="Planned next actions">
          {/* Upstream's default trigger is a <div>, which a keyboard cannot reach. The same parts,
              in a real button: `asChild` carries the trigger's state and handler onto it. */}
          <TaskTrigger title={nextTitle}>
            <button type="button" className="apple-reasoning__next-trigger">
              <ListTodoIcon className="ai-task__icon" />
              <span className="ai-task__title">{nextTitle}</span>
              <ChevronDownIcon className="ai-task__chevron" />
            </button>
          </TaskTrigger>
          <TaskContent forceMount>
            {plannedSteps.map((step) => <TaskItem key={step.key}>{step.title}</TaskItem>)}
          </TaskContent>
        </Task>
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
    plannedSteps.length > 0,
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
        />
      </ReasoningContent>
      <span className="gx-sr" aria-live="polite">{isLive ? title : ''}</span>
    </Reasoning>
  );
}
