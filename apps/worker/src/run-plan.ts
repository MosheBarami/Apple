/**
 * The plan the agent announced, and what became of it.
 *
 * `propose_plan` (tools.ts) emits a `build_plan` panel with every step `pending`. That is true at
 * the instant it is emitted and false for the rest of the run: the browser's gates.ts lifts pending
 * steps into the Thinking card's Actions checklist, so a plan nobody re-states leaves a FINISHED
 * run showing work as "still to come" that was in fact done twenty minutes ago.
 *
 * WHAT `done` MEANS HERE, stated narrowly because the narrowness is the point:
 *
 *     the tool that step named was called after the plan was announced, and did not fail.
 *
 * It is NOT a claim that the step achieved its title. Nothing in this worker can know that — a
 * create_instances that succeeds can still build the wrong thing, which is exactly why the plan is
 * required to contain a verification step. A status that claimed more than it can see would be the
 * house defect this file exists to avoid: a failure to observe rendered as an observation.
 *
 * A step whose tool never ran, or ran and failed, stays `pending` at the end of the run. That is
 * deliberate and it is the useful half: an unticked box on a finished plan is the product saying
 * out loud that it promised something and did not deliver it.
 */

export interface RunPlanStep {
  title: string;
  detail?: string;
  /** The exact registered tool name. `propose_plan` validated it against the tools this run was offered. */
  tool: string;
  status: 'pending' | 'done';
}

export interface RunPlan {
  /** The tool_end row the panel is attached to, so a settled plan REPLACES it rather than adding one. */
  toolId: string;
  title?: string;
  steps: RunPlanStep[];
}

/** One entry of the run's own tool trace. Structural, so AgentState's type is not imported here. */
export interface PlanTraceEntry {
  tool: string;
  ok: boolean;
  /** The row's panel, when the trace kept it. Read only to find which propose_plan drew the plan. */
  detail?: unknown;
}

/** The tool whose call announces a plan; it can never be one of the plan's own steps. */
const PLANNER = 'propose_plan';

/**
 * Read a plan back out of the panel `propose_plan` emitted.
 *
 * The run loop takes the plan from the tool's OWN output rather than through a second channel, so
 * the thing settled at the end is by construction the thing the user was shown. Anything that is
 * not a well-formed build_plan panel is not a plan: this returns undefined rather than a partial
 * one, because half a plan on screen is worse than none.
 */
export function planFromDetail(toolId: string, detail: unknown): RunPlan | undefined {
  if (typeof detail !== 'object' || detail === null) return undefined;
  const blocks = (detail as { blocks?: unknown }).blocks;
  if (!Array.isArray(blocks) || blocks.length === 0) return undefined;
  const block = blocks[0];
  if (typeof block !== 'object' || block === null) return undefined;
  const b = block as Record<string, unknown>;
  if (b.type !== 'build_plan' || !Array.isArray(b.steps) || b.steps.length === 0) return undefined;

  const steps: RunPlanStep[] = [];
  for (const raw of b.steps) {
    if (typeof raw !== 'object' || raw === null) return undefined;
    const s = raw as Record<string, unknown>;
    if (typeof s.title !== 'string' || typeof s.tool !== 'string' || !s.title || !s.tool) return undefined;
    steps.push({
      title: s.title,
      ...(typeof s.detail === 'string' && s.detail ? { detail: s.detail } : {}),
      tool: s.tool,
      status: s.status === 'done' ? 'done' : 'pending',
    });
  }
  return { toolId, ...(typeof b.title === 'string' && b.title ? { title: b.title } : {}), steps };
}

/**
 * Re-state the plan against the run's own trace.
 *
 * Matching is POSITIONAL and each successful call is spent once: two steps that both say
 * `create_instances` need two successful create_instances calls to both tick. Spending a call once
 * is the difference between "the agent did the second piece of work" and "the agent did something
 * with the same tool", and only the first is worth drawing a tick for.
 *
 * Calls made before the plan was announced are skipped. A look-around taken while the agent was
 * still deciding cannot retroactively satisfy something it then promised to do.
 *
 * Pure: the stored plan keeps saying what was originally promised, which is what makes the
 * difference between promise and delivery visible at all.
 */
export function settlePlan(plan: RunPlan, trace: readonly PlanTraceEntry[]): RunPlan {
  const steps = plan.steps.map((s) => ({ ...s }));
  // The plan was announced by the propose_plan that DREW it — the one the run loop keeps.
  // Anchoring on the first propose_plan of any outcome let a refused attempt start the clock early,
  // so a look-around made between the refusal and the real plan ticked a step it never promised.
  // "The first that succeeded" is not that either: propose_plan also answers ok WITHOUT drawing a
  // checklist (a plan it could not repair, or a second plan), so the anchor is the first ok call
  // whose own panel is a plan. A trace that kept no panels falls back to the first ok call.
  const drew = trace.findIndex((e) => e.tool === PLANNER && e.ok && planFromDetail('', e.detail) !== undefined);
  const announced = drew !== -1 ? drew : trace.findIndex((e) => e.tool === PLANNER && e.ok);
  const from = announced === -1 ? 0 : announced + 1;
  for (let i = from; i < trace.length; i++) {
    const entry = trace[i];
    if (!entry || !entry.ok) continue;
    const step = steps.find((s) => s.status === 'pending' && s.tool === entry.tool);
    if (step) step.status = 'done';
  }
  return { ...plan, steps };
}

/**
 * The first promised step the trace has not yet delivered — what a looping run is told to do next.
 * Measured 2026-09-23 (Sky Island 2, 04:45): the model repeated one terrain call three steps running
 * while its own plan read "Next: Place hero trees and crystals", and the refusal only said "make the
 * actual change", so the run ended on the duplicate bound having built nothing but terrain.
 */
export function nextPlanStep(plan: RunPlan, trace: readonly PlanTraceEntry[]): RunPlanStep | undefined {
  return settlePlan(plan, trace).steps.find((s) => s.status === 'pending');
}

/**
 * The plan as the document the browser already knows how to render.
 *
 * Exactly the shape `propose_plan` emits, so the settled panel replaces the proposed one in place
 * on the same tool row instead of appearing as a second, contradictory card.
 */
export function planDetail(plan: RunPlan): unknown {
  return {
    v: 1,
    blocks: [
      {
        type: 'build_plan',
        ...(plan.title ? { title: plan.title } : {}),
        steps: plan.steps.map((s) => ({ title: s.title, ...(s.detail ? { detail: s.detail } : {}), tool: s.tool, status: s.status })),
      },
    ],
  };
}
