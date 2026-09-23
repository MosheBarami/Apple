/**
 * The activity state machine: what Apple is *doing*, ordered, timed, terminated.
 *
 * WHAT THIS IS NOT. It is not chain of thought. Nothing here reads a prompt, a
 * system message, a transcript or a reasoning token. Every state it can emit is
 * named by an event the worker actually put on the wire:
 *
 *   tool_start / tool_end  → the step, its outcome and its measured duration
 *   agent_status.phase     → the state between tools, when no tool is in flight
 *   msg_end.stopReason     → the terminal state
 *
 * `docs/THINKING-UX.md` carries the full mapping, including the four §Y states
 * this protocol genuinely cannot express. They are absent here on purpose: an
 * honest "Working" beats a fabricated "Evaluating kit".
 *
 * WHY A REDUCER AND NOT A `useState` PILE. The event log is not guaranteed to
 * be ordered or deduplicated. `run_state` replays a snapshot of a run that is
 * still emitting live events, so a reconnect can hand us the same `tool_start`
 * twice and a `tool_end` whose partner start was never delivered. The old
 * merge-on-arrival path in `use-project-socket` silently dropped a `tool_end`
 * with an unknown `toolId` — the failure that produced was a row that spins
 * forever. Reducing the whole log on every render makes both cases expressible:
 * a duplicate collapses, and an orphan end becomes a finished step with an
 * honestly unobserved start.
 *
 * Pure and DOM-free so `tests/activity-model.test.mjs` can run it under
 * `node --test`: this module imports types only.
 */
import { phaseForTool, type AgentPhase } from '@golem/shared';
import {
  ACTIVITY,
  ACTIVITY_LABEL,
  ACTIVITY_NOT_MODELLED,
  isKnownTool,
  kindForTool,
  labelForTool,
  type ActivityKind,
} from './tool-vocabulary.ts';

/**
 * How close an announcement must sit to the tool that follows for it to be that tool's
 * own announcement. See the note at the filter that uses it.
 */
const ANNOUNCE_WINDOW_MS = 1000;


/* ---------------------------------------------------------------- states --- */

/**
 * The activity states this wire protocol can actually substantiate.
 *
 * `working` is the deliberate escape hatch: a tool we have no mapping for, or a
 * step whose `tool_start` never arrived so we do not even know its name. It is
 * the honest floor. Adding a prettier guess here is the exact failure this
 * module exists to prevent.
 */
// The vocabulary now lives in one module, with the worker's tool registry as its
// checked reference. See tool-vocabulary.ts for why there used to be three copies.
export { ACTIVITY, ACTIVITY_LABEL, ACTIVITY_NOT_MODELLED, kindForTool, labelForTool as stepLabel };
export type { ActivityKind };

/**
 * `agent_status.phase` → activity state. `done` maps to null because it is not
 * an activity: the terminal state comes from `msg_end.stopReason`, which is the
 * only message that says *how* the run ended.
 */
const PHASE_KIND: Record<AgentPhase, ActivityKind | null> = {
  understanding: 'understanding',
  planning: 'planning',
  composing: 'planning',
  inspecting: 'inspecting',
  building: 'building',
  writing_luau: 'writing_luau',
  rendering: 'rendering',
  critiquing: 'critiquing',
  rebuilding: 'repairing',
  playtesting: 'playtesting',
  debugging: 'debugging',
  verifying: 'verifying',
  checkpointing: 'saving',
  remembering: 'remembering',
  done: null,
};

export function kindForPhase(phase: AgentPhase): ActivityKind | null {
  return PHASE_KIND[phase] ?? null;
}

/* ---------------------------------------------------------------- events --- */

export type StopReason = 'done' | 'stopped' | 'error' | 'quota' | 'incomplete';

export interface ToolStartEvent {
  type: 'tool_start';
  /** Client receipt time. See `docs/THINKING-UX.md` on whose clock this is. */
  at: number;
  toolId: string;
  tool: string;
  summary?: string;
  /**
   * WHICH THING this step is about, read from the call's arguments before it ran.
   *
   * `summary` here is only the tool's own name; the sentence that names the resource arrives with
   * `tool_end`, after the work. So this is the only thing that can answer "which of my scripts" in
   * the seconds the step is actually running, which is the only time the answer is worth anything.
   */
  target?: string;
}

export interface ToolEndEvent {
  type: 'tool_end';
  at: number;
  toolId: string;
  ok: boolean;
  summary?: string;
  /**
   * Measured, never inferred. The live socket measures it client-side; a
   * `run_state` replay carries the worker's own measurement.
   */
  durationMs?: number;
  /**
   * `tool_end` on the wire carries NO tool name — only a `toolId`. The adapter
   * that reads an already-merged `ToolEvent` can supply it; the raw socket path
   * cannot, and an orphan end therefore stays honestly unnamed.
   */
  tool?: string;
}

export interface PhaseEvent {
  type: 'phase';
  at: number;
  phase: AgentPhase;
}

export interface RunEndEvent {
  type: 'run_end';
  at: number;
  stopReason: StopReason;
  error?: string;
}

export type ActivityEvent = ToolStartEvent | ToolEndEvent | PhaseEvent | RunEndEvent;

/* ----------------------------------------------------------------- shape --- */

/**
 * `unknown` is not a hedge, it is a distinct fact: the step started, the run is
 * over, and no result for it ever arrived. Calling that "failed" would claim
 * something the wire never said.
 */
export type StepState = 'active' | 'done' | 'failed' | 'unknown';

/** How an elapsed figure was arrived at. Rendered differently, because it means different things. */
export type ElapsedBasis = 'wall' | 'tool';

export interface Elapsed {
  ms: number;
  /**
   * `wall` — real time between the first observed start and the last observed
   * end, so it includes the model's own time between tools.
   * `tool` — the sum of measured tool durations, used when the starts are not
   * ours to trust (a replayed run reports one start time for every tool).
   */
  basis: ElapsedBasis;
}

export interface ActivityStep {
  key: string;
  kind: ActivityKind;
  /** The wire phase this step was announced as, for phase steps only. */
  phase?: AgentPhase;
  label: string;
  /** The worker's own one-line summary of what the step returned. */
  detail?: string;
  /**
   * WHICH THING the step was given, read from the call's arguments at `tool_start`.
   *
   * SEPARATE FROM `detail` BECAUSE THEY ARE DIFFERENT QUESTIONS, and collapsing them is how the
   * answer to the first one got lost. `detail` used to read `summary ?? target`, and the worker's
   * `tool_end` summary is `✓ <tool>` for every tool whose argument is not one of five names it
   * knows (`path`, `query`, `root`, `label`, `fact`). So a summary carrying no information beyond
   * the tool's own name still outranked a target that carried the genre, the instance names or
   * the asset id — the panel printed "✓ get_genre_references" and dropped "obby".
   */
  target?: string;
  state: StepState;
  /** Present only for steps that came from a tool, so evidence can be matched. */
  toolId?: string;
  tool?: string;
  startedAt?: number;
  endedAt?: number;
  elapsed?: Elapsed;
  /** False when this step's start time was inferred rather than observed. */
  startObserved: boolean;
}

export type PhaseState = StepState;

export interface ActivityPhase {
  key: string;
  kind: ActivityKind;
  label: string;
  state: PhaseState;
  steps: ActivityStep[];
  startedAt?: number;
  endedAt?: number;
  elapsed?: Elapsed;
  /** How many steps inside this phase reported failure. */
  failures: number;
}

export type TerminalKind = 'done' | 'recovered' | 'failed' | 'stopped' | 'incomplete' | 'quota';

export interface Terminal {
  kind: TerminalKind;
  at: number;
  /** Plain words for the row. Never an apology, never a promise. */
  note: string;
  error?: string;
  /** Failures seen during the run. Non-zero with `done` is what makes it `recovered`. */
  failures: number;
}

export interface ActivityRun {
  phases: ActivityPhase[];
  /** Null while the run is live, and for a history turn whose outcome we never saw. */
  terminal: Terminal | null;
  /** Steps the backend explicitly announced as still to come. Never inferred. */
  upcoming: ActivityStep[];
  /** Total time the run has been observable, when the clocks allow it. */
  elapsed?: Elapsed;
}

export interface ActivityInput {
  events: ActivityEvent[];
  /** Steps a validated `build_plan` named as pending or blocked. */
  upcoming?: { key: string; title: string; detail?: string }[];
  /** Injected so the timeline is deterministic under test. */
  now: number;
  streaming: boolean;
}

/* --------------------------------------------------------------- reducer --- */

const clean = (s: unknown): string => (typeof s === 'string' ? s.trim() : '');

/** Keep the earliest of two events for the same id: a later duplicate would inflate the clock. */
function keepEarliest<T extends { at: number }>(existing: T | undefined, next: T): T {
  if (!existing) return next;
  return next.at < existing.at ? next : existing;
}

interface ToolRecord {
  toolId: string;
  tool?: string;
  summary?: string;
  target?: string;
  ok?: boolean;
  done: boolean;
  startedAt?: number;
  endedAt?: number;
  durationMs?: number;
  startObserved: boolean;
  seq: number;
}

/**
 * Fold the raw log into one record per tool.
 *
 * Order-independent by construction: it indexes by `toolId` and picks the
 * earliest timestamp for each half, so a `tool_end` that arrives before its
 * `tool_start`, or a snapshot replayed on top of live events, lands on the same
 * record instead of creating a second row or vanishing.
 */
function foldTools(events: ActivityEvent[]): ToolRecord[] {
  const starts = new Map<string, ToolStartEvent>();
  const ends = new Map<string, ToolEndEvent>();
  const seq = new Map<string, number>();
  let n = 0;

  for (const e of events) {
    if (e.type === 'tool_start') {
      starts.set(e.toolId, keepEarliest(starts.get(e.toolId), e));
      if (!seq.has(e.toolId)) seq.set(e.toolId, n++);
    } else if (e.type === 'tool_end') {
      ends.set(e.toolId, keepEarliest(ends.get(e.toolId), e));
      if (!seq.has(e.toolId)) seq.set(e.toolId, n++);
    }
  }

  const records: ToolRecord[] = [];
  for (const [toolId, index] of seq) {
    const s = starts.get(toolId);
    const e = ends.get(toolId);

    let startedAt = s?.at;
    const startObserved = s !== undefined;
    // An end can never precede its own start; a clock that says otherwise is a
    // skewed clock, not a negative duration.
    let endedAt = e ? (startedAt !== undefined ? Math.max(e.at, startedAt) : e.at) : undefined;

    let durationMs = e?.durationMs;
    if (durationMs !== undefined && durationMs < 0) durationMs = undefined;
    if (durationMs === undefined && startedAt !== undefined && endedAt !== undefined) {
      durationMs = endedAt - startedAt;
    }
    // Orphan end with a measured duration: the start is arithmetic, not observation.
    if (startedAt === undefined && endedAt !== undefined && durationMs !== undefined) {
      startedAt = endedAt - durationMs;
    }

    records.push({
      toolId,
      tool: s?.tool ?? e?.tool,
      summary: clean(e?.summary) || clean(s?.summary) || undefined,
      target: clean(s?.target) || undefined,
      ok: e?.ok,
      done: e !== undefined,
      startedAt,
      endedAt,
      durationMs,
      startObserved,
      seq: index,
    });
  }

  return records;
}

/** Order by observed start, falling back to end, then to arrival. Stable for ties. */
function byTime<T extends { startedAt?: number; endedAt?: number; seq: number }>(a: T, b: T): number {
  const at = a.startedAt ?? a.endedAt;
  const bt = b.startedAt ?? b.endedAt;
  if (at === undefined && bt === undefined) return a.seq - b.seq;
  if (at === undefined) return 1;
  if (bt === undefined) return -1;
  if (at !== bt) return at - bt;
  return a.seq - b.seq;
}

/**
 * A `tool_end` summary that says nothing the row's own label does not already say.
 *
 * The worker formats every summary as `✓ <tool>` or `✗ <tool>`, optionally followed by ` · <arg>`
 * — and the arg is appended only when the call's arguments carry one of five keys it looks for.
 * For everything else the whole "result" is the tool's name with a tick in front of it, under a
 * label that already reads "Looked up genre references". That is not a result, and while it was
 * treated as one it SUPPRESSED the argument the same step had already reported at `tool_start`.
 *
 * So: strip the verdict mark, and if what is left is just the tool's name, there is no summary.
 * The tick is already drawn by `StepMark`; the row loses nothing and gets its subject back.
 */
// The verdict marks a summary may open with, as escapes rather than glyphs: `tests/status-icon`
// forbids drawing a status with a literal mark, and a rule that is true of rendering code is worth
// keeping true of the code that PARSES the same marks — the escapes also survive any editor or
// pipeline that would helpfully normalise them. U+2713/U+2717 are the two the worker writes today;
// the others are what a future one might, plus the repeat arrow used for "already done".
const VERDICT_MARKS = /^[\u2713\u2714\u2717\u2718\u00d7\u21ba\u2022\u00b7\s]+/u;

export function informativeSummary(summary: string | undefined, tool: string | undefined): string | undefined {
  if (!summary) return undefined;
  if (!tool) return summary;
  // U+2713/U+2717 are the two the worker writes; the rest are the marks a future one might.
  const bare = summary.replace(VERDICT_MARKS, '').trim();
  return bare === tool || summary.trim() === tool ? undefined : summary;
}

function stepElapsed(record: ToolRecord, now: number, live: boolean): Elapsed | undefined {
  if (record.durationMs !== undefined) return { ms: record.durationMs, basis: 'wall' };
  if (live && record.startObserved && record.startedAt !== undefined) {
    return { ms: Math.max(0, now - record.startedAt), basis: 'wall' };
  }
  return undefined;
}

/**
 * Phase elapsed. Wall time whenever every member's start was genuinely observed;
 * otherwise the sum of measured tool time, which is a smaller and different
 * claim. When neither holds, no figure at all — a missing number beats a made-up
 * one, and this is the only place a duration could quietly become fiction.
 */
function phaseElapsed(steps: ActivityStep[], now: number): Elapsed | undefined {
  if (steps.length === 0) return undefined;

  const allObserved = steps.every((s) => s.startObserved && s.startedAt !== undefined);
  if (allObserved) {
    const start = Math.min(...steps.map((s) => s.startedAt!));
    const ends = steps.map((s) => (s.state === 'active' ? now : s.endedAt));
    if (ends.every((e) => e !== undefined)) {
      return { ms: Math.max(0, Math.max(...(ends as number[])) - start), basis: 'wall' };
    }
  }

  const durations = steps.map((s) => s.elapsed?.ms);
  if (durations.every((d) => d !== undefined)) {
    return { ms: (durations as number[]).reduce((a, b) => a + b, 0), basis: 'tool' };
  }
  return undefined;
}

const TERMINAL_NOTE: Record<TerminalKind, string> = {
  done: 'Finished',
  recovered: 'Finished after recovering from a failed step',
  failed: 'Stopped by an error',
  stopped: 'Stopped by you',
  incomplete: 'Finished without changing anything',
  quota: 'Out of Credits for today',
};

/**
 * `msg_end.stopReason` → terminal state. Only one of these is derived rather
 * than reported: `recovered` is `done` plus at least one step that genuinely
 * failed earlier in the same run. It is worth separating, because "it worked"
 * and "it worked on the second attempt" are different facts about the build.
 */
const STOP_TERMINAL: Record<StopReason, TerminalKind> = {
  done: 'done',
  stopped: 'stopped',
  error: 'failed',
  quota: 'quota',
  incomplete: 'incomplete',
};

function terminalFrom(end: RunEndEvent, failures: number): Terminal {
  const kind: TerminalKind =
    end.stopReason === 'done' && failures > 0 ? 'recovered' : STOP_TERMINAL[end.stopReason];
  return { kind, at: end.at, note: TERMINAL_NOTE[kind], error: clean(end.error) || undefined, failures };
}

/**
 * Reduce the log into the ordered, timed activity timeline.
 *
 * Every field it produces traces to an event. There is no default phase list,
 * no interpolation between phases, no predicted next step and no percentage —
 * the same rule `thinking-model.ts` enforces for the stages above it.
 */
export function reduceActivity(input: ActivityInput): ActivityRun {
  const { events, now, streaming } = input;

  const runEnd = events.find((e): e is RunEndEvent => e.type === 'run_end') ?? null;
  const records = foldTools(events).sort(byTime);

  // --- tool steps ----------------------------------------------------------
  const toolSteps: ActivityStep[] = records.map((r) => {
    let state: StepState;
    if (r.done) state = r.ok === false ? 'failed' : 'done';
    else if (runEnd) state = 'unknown'; // the run ended and this step never reported
    else state = 'active';

    const live = state === 'active';
    return {
      key: `tool:${r.toolId}`,
      kind: kindForTool(r.tool),
      label: labelForTool(r.tool),
      // The tool's own NAME is not a detail — it would read as "edit_script" under a label that
      // already says "Editing project". What came back is, when the worker said anything beyond
      // the name; what it was given is the separate `target` field below, and the two are no
      // longer allowed to overwrite one another. See `informativeSummary`.
      detail: informativeSummary(r.summary, r.tool),
      target: r.target,
      state,
      toolId: r.toolId,
      tool: r.tool,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      elapsed: stepElapsed(r, now, live),
      startObserved: r.startObserved,
    };
  });

  // --- phase steps ---------------------------------------------------------
  // A phase becomes a row only when no tool covers it. Inside a tool span the
  // tool is the better evidence, and stacking both would double-count the time.
  // Only a start we actually watched can claim to cover a moment. An orphan
  // end's start is arithmetic, and letting arithmetic suppress a real
  // announcement would delete a state the worker genuinely reported.
  const spans = records
    .filter((r) => r.startObserved && r.startedAt !== undefined)
    .map((r) => [r.startedAt!, r.endedAt ?? (streaming ? now : r.startedAt!)] as const);
  const covered = (at: number) => spans.some(([from, to]) => at >= from && at <= to);

  const phaseEvents = events
    .filter((e): e is PhaseEvent => e.type === 'phase')
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.at === b.e.at ? a.i - b.i : a.e.at - b.e.at));

  const phaseSteps: ActivityStep[] = [];
  let lastKind: ActivityKind | null = null;
  for (const { e, i } of phaseEvents) {
    const kind = kindForPhase(e.phase);
    if (kind === null) continue;
    // Drop the covered ones FIRST, then collapse repeats among what is left.
    // The other order would let a covered announcement swallow the uncovered
    // one that follows it, losing the model's own time between two tools.
    if (covered(e.at)) continue;
    if (kind === lastKind) continue; // a repeated announcement is not a new state
    lastKind = kind;
    phaseSteps.push({
      key: `phase:${e.phase}:${e.at}:${i}`,
      kind,
      // The raw wire phase, kept so the suppression below can be exact rather than
      // approximate. See the note there.
      phase: e.phase,
      label: ACTIVITY_LABEL[kind],
      state: 'done',
      startedAt: e.at,
      startObserved: true,
    });
  }

  // --- merge, then close the open ends -------------------------------------
  const merged = [...toolSteps, ...phaseSteps]
    .map((s, i) => ({ s, seq: i }))
    .sort((a, b) => byTime({ ...a.s, seq: a.seq }, { ...b.s, seq: b.seq }))
    .map(({ s }) => s);

  // `agent_status` is broadcast immediately BEFORE the `tool_start` it describes
  // (apps/worker/src/do/session.ts). Keeping both prints the same state twice
  // and hangs a ~0ms clock on the first of them. When an announcement is
  // followed straight away by a tool in the same state, the tool is the row: it
  // carries the same fact and a duration that was actually measured.
  //
  // COMPARE THE PHASE, NOT THE KIND. The worker sets `agent.phase = phaseForTool(name)`
  // on the line before it broadcasts `tool_start`, so an announcement is redundant
  // exactly when it is the one DERIVED FROM the tool that follows it.
  //
  // This used to compare `next.kind === s.kind`, which was the same test only while the
  // web's vocabulary and the wire's phases were one-to-one. Splitting C04/C06/C08 out of
  // `inspecting` and `building` broke that: the wire still announces `building` before
  // `set_properties`, the web now calls that tool `editing`, the kinds no longer matched,
  // and the announcement survived as an EMPTY "Building world" heading immediately above
  // "Editing project · Set properties" — reintroducing, as its own row, the very claim
  // the split was made to remove.
  const steps = merged.filter((s, i) => {
    if (s.toolId !== undefined) return true;
    const next = merged[i + 1];
    if (!next || next.toolId === undefined) return true;

    // TWO conditions the first version of this fix left out, both found by re-reading
    // what the worker actually broadcasts.
    //
    // PROXIMITY. This comment has always justified itself by "broadcast immediately
    // BEFORE the tool_start it describes" — and the code only ever checked adjacency in
    // the merged array. They are not the same thing: session.ts re-broadcasts the
    // STICKY previous phase at the top of every step, before the model call, and the
    // derived one only when the tool starts. So an announcement can sit seconds of real
    // model thinking away from the tool that follows it, and deleting it deletes a
    // measured duration the user is entitled to see. The window is a threshold and
    // therefore a judgement: two messages sent back to back over one socket arrive a
    // few milliseconds apart, so a second is generous by three orders of magnitude and
    // still nowhere near a model call.
    //
    // KNOWN TOOL. `phaseForTool` answers 'building' for any name it does not recognise,
    // and its own JSDoc says the default is "for a name this build has never heard of"
    // and is "NOT a resting place". Comparing against it for an unknown tool means a
    // browser one version behind a worker silently eats real "Building world"
    // announcements whenever the default happens to coincide.
    const close =
      s.startedAt !== undefined && next.startedAt !== undefined && next.startedAt - s.startedAt <= ANNOUNCE_WINDOW_MS;
    if (close && s.phase !== undefined && isKnownTool(next.tool)) return s.phase !== phaseForTool(next.tool!);
    if (!close) return true;
    return next.kind !== s.kind;
  });

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i]!;
    if (step.toolId !== undefined || step.endedAt !== undefined) continue;
    // A phase step runs until the next observed step begins, or until now while
    // the run is live. If neither exists it has no measurable end, and gets none.
    const next = steps.slice(i + 1).find((s) => s.startedAt !== undefined);
    const isLast = next === undefined;
    const end = next?.startedAt ?? (isLast && streaming ? now : runEnd?.at);
    if (end === undefined) continue;
    step.endedAt = Math.max(end, step.startedAt ?? end);
    step.state = isLast && streaming && !runEnd ? 'active' : 'done';
    step.elapsed = { ms: Math.max(0, step.endedAt - (step.startedAt ?? step.endedAt)), basis: 'wall' };
  }

  // --- group adjacent steps of the same state ------------------------------
  const phases: ActivityPhase[] = [];
  for (const step of steps) {
    const last = phases[phases.length - 1];
    // A `working` step joins whatever is open rather than opening a "Working"
    // phase of its own. This is a layout choice, not a claim: the row still says
    // it has no reported name, and the heading above it is the state the worker
    // had genuinely announced at that moment. The live case is the auto visual
    // critique, which emits a `tool_end` with no `tool_start` — see §4 of
    // docs/THINKING-UX.md.
    if (last && (last.kind === step.kind || step.kind === 'working')) {
      last.steps.push(step);
      continue;
    }
    phases.push({
      key: `${step.kind}:${step.key}`,
      kind: step.kind,
      label: ACTIVITY_LABEL[step.kind],
      state: 'done',
      steps: [step],
      failures: 0,
    });
  }

  let failures = 0;
  for (const phase of phases) {
    phase.failures = phase.steps.filter((s) => s.state === 'failed').length;
    failures += phase.failures;
    const starts = phase.steps.map((s) => s.startedAt).filter((v): v is number => v !== undefined);
    const ends = phase.steps.map((s) => s.endedAt).filter((v): v is number => v !== undefined);
    phase.startedAt = starts.length ? Math.min(...starts) : undefined;
    phase.endedAt = ends.length === phase.steps.length ? Math.max(...ends) : undefined;
    phase.elapsed = phaseElapsed(phase.steps, now);

    const lastStep = phase.steps[phase.steps.length - 1]!;
    if (phase.steps.some((s) => s.state === 'active')) phase.state = 'active';
    else if (phase.steps.every((s) => s.state === 'unknown')) phase.state = 'unknown';
    else phase.state = lastStep.state === 'failed' ? 'failed' : 'done';
  }

  const upcoming: ActivityStep[] = [];
  const seen = new Set(steps.map((s) => s.label.toLowerCase()));
  for (const item of input.upcoming ?? []) {
    const title = clean(item.title);
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    upcoming.push({
      key: item.key,
      kind: 'working',
      label: title,
      detail: clean(item.detail) || undefined,
      state: 'unknown',
      startObserved: false,
    });
  }

  return {
    phases,
    terminal: runEnd ? terminalFrom(runEnd, failures) : null,
    upcoming,
    elapsed: phaseElapsed(steps, now),
  };
}

/* ---------------------------------------------------------------- labels --- */

/**
 * A friendlier name per tool for the step row. An unmapped tool falls back to
 * its own underscored name rather than to invented prose, so a tool added in
 * the worker shows up as itself instead of as a lie.
 */

/* -------------------------------------------------------------- duration --- */

/** Human elapsed time. Tabular-friendly, never rounded up to imply completion. */
export function formatElapsed(elapsed: Elapsed | undefined): string {
  if (!elapsed || !Number.isFinite(elapsed.ms) || elapsed.ms < 0) return '';
  const ms = elapsed.ms;
  if (ms < 10_000) return `${Math.round(ms / 100) / 10}s`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

/**
 * The suffix that keeps an elapsed figure honest. `tool` basis is a sum of
 * measured tool durations and excludes the model's own time between them, so it
 * must not be shown as if it were wall time.
 */
export function elapsedTitle(elapsed: Elapsed | undefined): string {
  if (!elapsed) return '';
  return elapsed.basis === 'wall'
    ? 'Time between the first and last reported event in this phase'
    : 'Measured tool time only — the start clocks for this phase were replayed, not observed';
}

/* --------------------------------------------------------------- adapter --- */

/**
 * Structurally compatible with `ToolEvent` from `lib/use-project-socket`, and
 * deliberately not imported from it: this module stays runtime-dependency-free
 * so `node --test` can load it without a bundler.
 */
export interface ToolEventLike {
  toolId: string;
  tool: string;
  summary: string;
  /** See `ToolStartEvent.target`. Survives a reload so a reconnect mid-build does not lose it. */
  target?: string;
  ok?: boolean;
  startedAt: number;
  durationMs?: number;
  done: boolean;
  /**
   * False when `startedAt` was not observed on this client — a `run_state`
   * replay stamps every tool with the RUN's start time, and message history has
   * no start time at all. Undefined means observed, so live sockets need no flag.
   */
  startObserved?: boolean;
}

export interface PhaseMark {
  phase: AgentPhase;
  at: number;
}

/**
 * Rebuild an event log from an already-merged turn.
 *
 * Two callers reach the same reducer through this: the live socket, which keeps
 * the raw log, and every finished or reloaded turn, which only has the merged
 * `ToolEvent[]`. One state machine, two adapters — so a history turn and a live
 * turn cannot drift into showing different things about the same run.
 */
export function eventsFromTurn(source: {
  tools: ToolEventLike[];
  phaseMarks?: PhaseMark[];
  stopReason?: StopReason;
  error?: string;
  /** When the run ended, if known. Falls back to the last observed tool end. */
  endedAt?: number;
}): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  let lastEnd: number | undefined;

  for (const tool of source.tools) {
    const observed = tool.startObserved !== false;
    if (observed) {
      events.push({
        type: 'tool_start',
        at: tool.startedAt,
        toolId: tool.toolId,
        tool: tool.tool,
        summary: tool.summary,
        target: tool.target,
      });
    }
    if (!tool.done) continue;
    // CLOSED, BUT NEVER REPORTED ON. `msg_end` marks every still-open tool `done` so nothing
    // spins forever, and deliberately does NOT invent an outcome for it — `ok` stays undefined.
    // There is no `tool_end` to emit here: the two fields it would have to carry, the verdict and
    // the clock, are exactly the two nobody measured. Leaving the record end-less is what lets
    // the reducer take its `unknown` branch ("the step started, the run is over, and no result
    // for it ever arrived") instead of reading a fabricated `ok:false` as a failure.
    if (tool.ok === undefined) continue;
    // With no observed start this timestamp is arithmetic, not observation; the
    // reducer marks the record unobserved so its phase reports measured tool
    // time rather than wall time.
    const at = tool.startedAt + (tool.durationMs ?? 0);
    // Only an observed clock may date the terminal row. With unobserved starts
    // this number is arithmetic on a placeholder, and the one row that says
    // "this is over" is the worst place to carry a made-up timestamp.
    if (observed) lastEnd = lastEnd === undefined ? at : Math.max(lastEnd, at);
    events.push({
      type: 'tool_end',
      at,
      toolId: tool.toolId,
      ok: tool.ok !== false,
      summary: tool.summary,
      durationMs: tool.durationMs,
      tool: tool.tool,
    });
  }

  for (const mark of source.phaseMarks ?? []) {
    events.push({ type: 'phase', at: mark.at, phase: mark.phase });
  }

  if (source.stopReason) {
    const at = source.endedAt ?? lastEnd;
    // No clock for the end means no terminal row. A guessed timestamp on the one
    // row that says "this is over" is the worst place to guess.
    if (at !== undefined) {
      events.push({ type: 'run_end', at, stopReason: source.stopReason, error: source.error });
    }
  }

  return events;
}

/* ---------------------------------------------------------------- motion --- */

/**
 * What the timeline is allowed to animate.
 *
 * `prefers-reduced-motion` removes TRAVEL — position and scale changes — and
 * nothing else. Colour, opacity and the in-flight arc stay, because they are
 * not decoration: they are how a state change is reported at all. Stripping
 * them would leave a viewer with vestibular sensitivity staring at a timeline
 * that never visibly changes.
 *
 * The plan is computed here, not only in CSS, so the rule is unit-testable and
 * so a future inline style cannot quietly reintroduce travel.
 */
export interface MotionPlan {
  travel: boolean;
  /** Always true. Present so the invariant is visible at the call site. */
  feedback: true;
  className: string;
}

export function motionPlan(reducedMotion: boolean): MotionPlan {
  return {
    travel: !reducedMotion,
    feedback: true,
    className: reducedMotion ? 'is-still' : 'is-moving',
  };
}
