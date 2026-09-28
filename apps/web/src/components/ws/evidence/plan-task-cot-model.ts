/**
 * Adapters for the Task (UI05), Plan (UI08) and Chain of Thought (UI15) evidence renderers.
 * Pure: reads only the reduced ActivityRun and the worker's run_intent. Nothing here is invented;
 * an absent input yields null and the renderer draws nothing.
 */
import type { RunIntent } from '@golem/shared';
import type { ActivityRun, ActivityStep, StepState } from '../activity-model';

/* ---------------------------------------------------------------- Task --- */

/** Phases whose steps change the place or its scripts. Reading and looking are Activity, not tasks. */
const WORK_KINDS = new Set(['building', 'writing_luau', 'editing', 'generating', 'repairing']);

export interface TaskGroup {
  key: string;
  title: string;
  state: StepState;
  items: { key: string; label: string; detail?: string; state: StepState }[];
  /** Affected files/scripts, as the steps' own targets. */
  files: string[];
}

export function taskGroups(run: ActivityRun | null | undefined): TaskGroup[] {
  if (!run) return [];
  const groups: TaskGroup[] = [];
  for (const phase of run.phases) {
    if (!WORK_KINDS.has(phase.kind) || phase.steps.length === 0) continue;
    const files = new Set<string>();
    for (const s of phase.steps) if (s.kind === 'writing_luau' && s.target) files.add(s.target);
    groups.push({
      key: phase.key,
      title: phase.label,
      state: phase.state,
      items: phase.steps.map((s) => ({ key: s.key, label: s.label, detail: s.detail, state: s.state })),
      files: [...files],
    });
  }
  return groups;
}

/* ---------------------------------------------------------------- Plan --- */

export interface PlanView {
  summary: string;
  items: string[];
  assumptions: string[];
  questions: string[];
  /** Steps a validated build_plan announced as still to come. */
  upcoming: string[];
}

export function planView(
  intent: RunIntent | null | undefined,
  upcoming: readonly { title: string }[] = [],
): PlanView | null {
  const items = intent?.checklist ?? [];
  const next = upcoming.map((u) => u.title);
  if (!intent || (!intent.summary && items.length === 0 && next.length === 0)) return null;
  return {
    summary: intent.summary,
    items,
    assumptions: intent.assumptions ?? [],
    questions: intent.questions ?? [],
    upcoming: next,
  };
}

/* ------------------------------------------------------- Chain of Thought --- */

export interface CotStep {
  key: string;
  label: string;
  description?: string;
  status: 'complete' | 'active' | 'pending';
}

const NOTE: Partial<Record<StepState, string>> = {
  failed: 'This step reported a failure.',
  unknown: 'The run ended before this step reported a result.',
};

function fromStep(s: ActivityStep): CotStep {
  const status = s.state === 'active' ? 'active' : s.state === 'unknown' ? 'pending' : 'complete';
  const text = [s.target ?? s.detail, NOTE[s.state]].filter(Boolean).join(' · ');
  return { key: s.key, label: s.label, description: text || undefined, status };
}

/** The public activity timeline as steps: observed steps in order, then announced-upcoming ones. */
export function cotSteps(run: ActivityRun | null | undefined): CotStep[] {
  if (!run) return [];
  const steps = run.phases.flatMap((p) => p.steps.map(fromStep));
  for (const u of run.upcoming) steps.push({ key: `up:${u.key}`, label: u.label, status: 'pending' });
  return steps;
}
