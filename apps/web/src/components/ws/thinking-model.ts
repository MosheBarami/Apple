/**
 * The Thinking card's data model — deliberately pure, deliberately separate.
 *
 * WHAT THIS IS NOT: it is not the model's chain of thought. No prompt, no
 * system message, no hidden reasoning token and no transcript content reaches
 * this module. Every stage it can produce is derived from something the worker
 * actually reported:
 *
 *   Intent      ← `run_intent`, a deterministic restatement of the user's own
 *                 words produced by the intent extractor (no model call).
 *   Plan        ← the checklist on that same `run_intent`.
 *   Actions     ← `tool_start` / `tool_end`, plus the phase named by the most
 *                 recent `agent_status`, plus any step a validated `build_plan`
 *                 result explicitly announced as still upcoming.
 *   Validation  ← a real gate result (visual critique, playtest report) that
 *                 arrived on `tool_end.detail` and survived the validator.
 *
 * The single rule this file enforces, and that `tests/thinking-model.test.mjs`
 * pins: **a stage is emitted only when its data exists.** There is no default
 * stage list, no placeholder copy, no invented roadmap, no percentage. Absent
 * data means an absent row, never a greyed-out promise.
 *
 * It lives apart from the React component so that rule is testable under
 * `node --test` without a DOM. Its one value import, the shared tool vocabulary,
 * is plain data and imports nothing itself, so that stays true.
 */
import { labelForTool } from './tool-vocabulary.ts';
import type { AgentPhase, RunIntent } from '@golem/shared';
import type { AgentStatus, ToolEvent } from '../../lib/use-project-socket';

/* -------------------------------------------------------------- labels ---- */

/** Human labels for the lifecycle. Present tense while active reads better. */
export const PHASE_LABEL: Record<AgentPhase, string> = {
  understanding: 'Understanding the request',
  planning: 'Planning',
  inspecting: 'Inspecting the project',
  building: 'Building',
  writing_luau: 'Writing Luau',
  rendering: 'Rendering',
  critiquing: 'Reviewing the result',
  rebuilding: 'Starting the layout over',
  playtesting: 'Playtesting',
  debugging: 'Reading the output',
  verifying: 'Verifying',
  checkpointing: 'Saving a checkpoint',
  remembering: 'Noting what changed',
  done: 'Done',
};

/**
 * The Actions checklist used to hold its own copy of this table, identical to the
 * activity card's across all 23 shared entries and missing the same tool. One table,
 * checked against the worker registry, now serves both.
 */
export { TOOL as TOOL_VOCABULARY, labelForTool } from './tool-vocabulary.ts';

/* --------------------------------------------------------------- types ---- */

/**
 * `pending` is reachable ONLY from a step the backend explicitly announced as
 * still upcoming (a `build_plan` step whose status is `pending` or `blocked`).
 * Nothing in this module ever manufactures one.
 */
/** `unknown` is the reducer's own fourth state: closed by the run ending, never reported on. */
export type ActionState = 'done' | 'active' | 'failed' | 'pending' | 'unknown';

export interface ActionRow {
  key: string;
  label: string;
  detail?: string;
  state: ActionState;
}

/** A step a validated `build_plan` result named as still to come. */
export interface PlannedStep {
  key: string;
  title: string;
  detail?: string;
}

/** A real pass/fail gate the worker ran and reported. */
export interface GateRow {
  key: string;
  label: string;
  passed: boolean;
  detail?: string;
  score?: number;
}

export type StageKind = 'intent' | 'plan' | 'actions' | 'validation';

export interface TimelineStage {
  kind: StageKind;
  label: string;
  /** One real line under the stage name. Never filler. */
  summary?: string;
  /** Plan: the things the request named by hand. */
  items?: string[];
  /** Plan: what the request genuinely did not say, surfaced not assumed. */
  questions?: string[];
  /**
   * Plan: what the request did not say and the worker decided anyway.
   *
   * The opposite of `questions`, and a separate field so the card can label them as opposites.
   * Merging them would let a decision already acted on render under a heading that says nothing
   * was assumed.
   */
  assumptions?: string[];
  /** Actions: the nested checklist. */
  actions?: ActionRow[];
  /** Validation: the gates that actually ran. */
  gates?: GateRow[];
  /** True when work is happening inside this stage right now. */
  live: boolean;
}

export interface TimelineInput {
  intent: RunIntent | null | undefined;
  tools: ToolEvent[];
  /** Upcoming steps the backend announced. Pass [] when it announced none. */
  plannedSteps: PlannedStep[];
  /** Gate results extracted from validated tool detail. Pass [] when none. */
  gates: GateRow[];
  status: AgentStatus | null;
  streaming: boolean;
}

/* ------------------------------------------------------------- builders --- */

const clean = (s: unknown): string => (typeof s === 'string' ? s.trim() : '');

function nonEmpty(list: readonly string[] | undefined): string[] {
  if (!Array.isArray(list)) return [];
  return list.map(clean).filter((s) => s.length > 0);
}

/** The Actions checklist: real tool events, then genuinely announced upcoming steps. */
export function buildActions(input: TimelineInput): ActionRow[] {
  const rows: ActionRow[] = [];

  for (const tool of input.tools) {
    rows.push({
      key: tool.toolId,
      label: labelForTool(tool.tool),
      // The worker's own one-line summary of what the tool returned.
      detail: tool.summary && tool.summary !== tool.tool ? tool.summary : undefined,
      // `ok` undefined on a DONE tool is `msg_end` closing a step the run never reported on.
      // Reading it as 'done' would be the same false claim one level up from the one
      // use-project-socket.ts used to make when it wrote `ok:false` here instead.
      state: !tool.done ? 'active' : tool.ok === false ? 'failed' : tool.ok === undefined ? 'unknown' : 'done',
    });
  }

  // The phase the worker is in right now, when no tool is mid-flight. This is
  // the model working between tool calls — a real, announced state.
  const toolRunning = input.tools.some((t) => !t.done);
  if (input.streaming && input.status && !toolRunning) {
    rows.push({
      key: `phase:${input.status.phase}`,
      label: PHASE_LABEL[input.status.phase] ?? input.status.phase,
      state: 'active',
    });
  }

  // Steps the backend announced as still to come. Anything it already reported
  // as done or active is dropped: those are the tool rows above.
  const seen = new Set(rows.map((r) => r.label.toLowerCase()));
  for (const step of input.plannedSteps) {
    const title = clean(step.title);
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    rows.push({ key: step.key, label: title, detail: clean(step.detail) || undefined, state: 'pending' });
  }

  return rows;
}

/**
 * Turn the observable record into the timeline.
 *
 * Every `push` below sits behind a check that the underlying data is really
 * present. Removing one of those checks is what "fabricating the UI" would
 * look like, so they are the thing the test suite guards.
 */
export function buildTimeline(input: TimelineInput): TimelineStage[] {
  const stages: TimelineStage[] = [];

  const summary = clean(input.intent?.summary);
  if (summary) {
    stages.push({ kind: 'intent', label: 'Intent', summary, live: false });
  }

  const checklist = nonEmpty(input.intent?.checklist);
  const questions = nonEmpty(input.intent?.questions);
  const assumptions = nonEmpty(input.intent?.assumptions);
  // ASSUMPTIONS OPEN THIS ROW TOO, not just the checklist.
  //
  // The checklist used to be the only key. A request made entirely of adjectives — "make it
  // cozier" — names no object, so it has no checklist at all, and that is precisely the request
  // where what the worker assumed is the only thing worth reading. Gating the row on the
  // checklist hid the assumption in the one case it mattered most.
  //
  // AND SO DO QUESTIONS, for exactly the same reason one turn further along. `questions` is the
  // extractor's record of what the request genuinely did not settle, and run-intent.ts already
  // returns an intent carrying nothing else — it only returns null when summary, checklist,
  // questions and assumptions are ALL empty. So a hedged request that yielded no checklist and no
  // assumptions produced a question that was computed, serialised, sent over the socket, parsed
  // here, and then dropped by this gate. The user was never told Apple did not know what they
  // meant; they found out when the build came back wrong.
  //
  // Three keys rather than one, because the three are three different sentences: here is what I
  // will do, here is what I guessed, here is what I could not work out. Any one of them on its own
  // is worth a row.
  if (checklist.length > 0 || assumptions.length > 0 || questions.length > 0) {
    stages.push({
      kind: 'plan',
      label: 'Plan',
      items: checklist.length > 0 ? checklist : undefined,
      questions: questions.length > 0 ? questions : undefined,
      assumptions: assumptions.length > 0 ? assumptions : undefined,
      live: false,
    });
  }

  const actions = buildActions(input);
  if (actions.length > 0) {
    stages.push({
      kind: 'actions',
      label: 'Actions',
      actions,
      live: input.streaming && actions.some((a) => a.state === 'active'),
    });
  }

  const gates = input.gates.filter((g) => clean(g.label).length > 0);
  if (gates.length > 0) {
    stages.push({ kind: 'validation', label: 'Validation', gates, live: false });
  }

  return stages;
}

/**
 * What the collapsed header says on its second line. While a run is live this
 * is the phase the worker announced; otherwise it is the affordance.
 */
export function headerHint(input: TimelineInput, open: boolean): string {
  if (input.streaming) {
    const active = buildActions(input).find((a) => a.state === 'active');
    if (active) return active.label;
    if (input.status) return PHASE_LABEL[input.status.phase] ?? input.status.phase;
  }
  return open ? 'Click to collapse' : 'Click to expand';
}
