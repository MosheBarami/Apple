/**
 * What the Thinking card's execution surface is allowed to show — the DATA half.
 *
 * Split from `thinking.tsx` for the reason every model beside it is: the decisions are the part
 * worth testing, and a module that imports React cannot be loaded by `node --test`.
 *
 * THE ONLY SOURCE IS THE ACTIVITY REDUCER (`activity-model.ts`). Nothing here reads a prompt, a
 * transcript, a reasoning token or a tool's payload. Every row is a step the worker reported
 * (`tool_start` / `tool_end` / `agent_status`), and every field on a row is one of four safe facts
 * about it: the tool's friendly name, what it was pointed at (`target`, from `tool_start`), the
 * worker's own one-line summary of what came back, and the measured duration. `ToolEvent.detail`
 * — the untrusted structured payload — never reaches the reducer, so it cannot reach a row.
 *
 * THREE HONESTY RULES, each of which a test holds:
 *
 *   1. A step that failed and was then recovered from is not a row. A retry is implementation
 *      detail; drawing each failed attempt as a failure turns a run that worked into a list of
 *      red marks. The reducer keeps every attempt, for audit and support.
 *   2. A REAL final failure is shown once: the run's terminal says it failed and this step is the
 *      last thing the run did. Anything the run did after a failed step means it moved on from it.
 *      The run-level sentence ("Something went wrong partway through") stays with the turn's
 *      outcome row (outcome-model.ts); the row here only says which step it was.
 *   3. `unknown` — the run ended and this step never reported — is not a row either. It is not a
 *      failure (nothing said so) and not a success, and there is nothing true to draw for it.
 */
import { formatElapsed, type ActivityRun, type ActivityStep } from './activity-model.ts';
import { labelForTool } from './tool-vocabulary.ts';
import { PHASE_LABEL } from './thinking-model.ts';

/** A tool call, in the three states the wire can substantiate. */
export type ToolRowState = 'running' | 'done' | 'failed';

export interface ToolRow {
  kind: 'tool';
  key: string;
  /** The worker's tool name, kept for the glyph and the badge type; never shown as prose. */
  tool?: string;
  /**
   * Friendly name: past tense once done ("Edited a script"), present tense while it runs and when
   * it failed ("Inserting an asset" + Error) — the past tense of a step that failed would say it
   * happened.
   */
  title: string;
  state: ToolRowState;
  /** What the call was given, from `tool_start` — omitted when the result already names it. */
  target?: string;
  /** The worker's one-line summary of what came back, when it said more than the tool's name. */
  result?: string;
  /** Measured, never estimated. Absent when nothing was measured. */
  duration?: string;
}

/** A state the worker announced between tools (`agent_status.phase`). */
export interface PhaseRow {
  kind: 'phase';
  key: string;
  label: string;
  /** AI Elements' ChainOfThoughtStep statuses this product uses. `pending` is never produced. */
  status: 'active' | 'complete';
}

export type ExecutionRow = ToolRow | PhaseRow;

export interface ExecutionView {
  /** Every observable row, in the order it happened. */
  rows: ExecutionRow[];
  /** The one row running now, if any. */
  current: ExecutionRow | null;
  /** Always on screen: the current row and the two latest others, in the order they happened. */
  visible: ExecutionRow[];
  /** Everything else, behind the "earlier steps" disclosure, in the order it happened. */
  earlier: ExecutionRow[];
}

/* ----------------------------------------------------------------- tense --- */

/** The activity table is written in the past tense; only the row that is running reads as an action. */
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
  [/^Rotated\b/, 'Rotating'],
  [/^Scaled\b/, 'Scaling'],
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

function leadingPresent(clause: string): string {
  for (const [pattern, replacement] of PRESENT_VERBS) {
    if (pattern.test(clause)) return clause.replace(pattern, replacement);
  }
  return clause;
}

/**
 * The running form of a past-tense label — EVERY coordinated verb, not only the first.
 *
 * "Ran the game and checked it" used to run as "Running the game and checked it": the first verb
 * moved and the second stayed behind, so the one row that is happening now read as half over. Each
 * clause after "and", "or" or a comma gets the same table, matched against its capitalised form
 * and written back in lower case; a clause that does not start with a verb ("… and intent") is left
 * exactly as it was.
 */
export function presentTense(label: string): string {
  return label
    .split(/(, | and | or )/)
    .map((part, i) => {
      if (i === 0) return leadingPresent(part);
      if (i % 2 === 1 || part === '') return part;
      const capital = part[0]!.toUpperCase() + part.slice(1);
      const moved = leadingPresent(capital);
      return moved === capital ? part : moved[0]!.toLowerCase() + moved.slice(1);
    })
    .join('');
}

/** The past-tense verbs the table knows, for a test to hold every running label against. */
export const PAST_VERBS: readonly string[] = PRESENT_VERBS.map(([pattern]) => pattern.source.replace(/^\^|\\b$/g, ''));

/** The label a step shows while it is the one running. */
export function presentActionLabel(step: ActivityStep): string {
  if (step.tool) return presentTense(labelForTool(step.tool));
  if (step.phase) return PHASE_LABEL[step.phase] ?? step.label;
  return step.label;
}

/* ------------------------------------------------------------ what shows --- */

/**
 * The steps the surface may draw, in the order they happened — see rules 1-3 above.
 *
 * "Last thing the run did" is the last step of the whole ordered log, whatever its state: a later
 * step of any kind (even one that never reported) means the run went on past the failure.
 */
export function observableSteps(run: ActivityRun): ActivityStep[] {
  const all = run.phases.flatMap((phase) => phase.steps);
  const last = all[all.length - 1];
  const finalFailure = run.terminal?.kind === 'failed' && last?.state === 'failed' ? last : null;
  return all.filter((step) => step.state === 'active' || step.state === 'done' || step === finalFailure);
}

function toolRow(step: ActivityStep): ToolRow {
  const state: ToolRowState = step.state === 'active' ? 'running' : step.state === 'failed' ? 'failed' : 'done';
  // ON WHAT, AND WHAT CAME BACK — two questions (tests/step-subject-survives.test.mjs). When the
  // worker's sentence already contains the subject, printing it again reads as two facts.
  const showTarget = step.target && (!step.detail || !step.detail.includes(step.target));
  return {
    kind: 'tool',
    key: step.key,
    tool: step.tool,
    title: state === 'done' ? step.label : presentActionLabel(step),
    state,
    target: showTarget ? step.target : undefined,
    result: step.detail,
    duration: formatElapsed(step.elapsed) || undefined,
  };
}

function phaseRow(step: ActivityStep): PhaseRow {
  const active = step.state === 'active';
  return { kind: 'phase', key: step.key, label: active ? presentActionLabel(step) : step.label, status: active ? 'active' : 'complete' };
}

export function rowFor(step: ActivityStep): ExecutionRow {
  return step.toolId !== undefined ? toolRow(step) : phaseRow(step);
}

/** How many settled rows stay on screen beside the current one. */
export const RECENT_ROWS = 2;

export function executionView(run: ActivityRun): ExecutionView {
  const steps = observableSteps(run);
  let currentIndex = -1;
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    if (steps[index]?.state === 'active') {
      currentIndex = index;
      break;
    }
  }
  const others = steps.map((_, index) => index).filter((index) => index !== currentIndex);
  const recent = new Set(others.slice(-RECENT_ROWS));
  if (currentIndex !== -1) recent.add(currentIndex);

  const rows = steps.map(rowFor);
  return {
    rows,
    current: currentIndex === -1 ? null : rows[currentIndex]!,
    visible: rows.filter((_, index) => recent.has(index)),
    earlier: rows.filter((_, index) => !recent.has(index)),
  };
}

/* --------------------------------------------------------------- the clock --- */

/** Whole seconds, the way the header states a duration: "42s", then "3m 05s". */
export function formatSeconds(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '';
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole}s`;
  return `${Math.floor(whole / 60)}m ${String(whole % 60).padStart(2, '0')}s`;
}
