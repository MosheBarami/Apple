// Model routing. Cost is dominated by which model runs, so this decides — per step, not per
// request — whether a step genuinely needs the flagship builder or whether the measured cheap
// model is sufficient.
//
// Evidence (docs/evals/FINDINGS.md, 56 Roblox tasks):
//   gpt-oss-120b   97.6 overall — but 100.0 on tool-selection and project-comprehension
//   qwen3-30b-a3b  88.2 overall — ALSO 100.0 on tool-selection and project-comprehension,
//                  100.0 debugging, 100.0 multi-file; it loses on api-knowledge (67.9 vs 100)
//                  and ui-implementation (66.7 vs 100).
// So: inspection/orchestration steps route cheap with no measured quality loss; steps that
// actually author Luau or build UI stay on the flagship, where the gap is real.
import type { GolemMode, GatewayToolCall } from '@golem/shared';

/** Tools that only look at the project — choosing/reading, not authoring. */
const INSPECTION_TOOLS = new Set([
  'get_project_tree',
  'list_scripts',
  'read_script',
  'search_scripts',
  'search_docs',
  'get_output_logs',
  'get_selection',
  'viewport_info',
  'take_screenshot',
  'create_checkpoint',
  'remember',
]);

export interface RouteDecision {
  model: string;
  reason: string;
}

/**
 * Pick the model for the NEXT step of an agent run.
 *
 * The first step of a builder run always uses the flagship: that is where the plan is formed and
 * where a cheap model's weaker API knowledge would poison everything downstream. Later steps that
 * are purely reacting to inspection results route cheap.
 */
export function routeStep(opts: {
  mode: GolemMode;
  step: number;
  lastToolCalls: GatewayToolCall[];
  hasBuilt: boolean;
}): RouteDecision {
  const { mode, step, lastToolCalls, hasBuilt } = opts;

  if (mode === 'clay') return { model: 'clay', reason: 'clay mode' };
  if (step <= 1) return { model: mode, reason: 'planning step' };

  const names = lastToolCalls.map((c) => c.name);
  const onlyInspection = names.length > 0 && names.every((n) => INSPECTION_TOOLS.has(n));

  // MEASURED: routing the step that FOLLOWS inspection to the cheap model looked attractive
  // (51 vs ~140 neurons) but changed the outcome — the cheap model read the project tree and
  // declared the task finished instead of building. That step is where the model decides what
  // to construct, so it stays on the flagship. Only the tail after something is already built
  // — re-reading logs to confirm it worked — is safe to run cheap.
  if (hasBuilt && onlyInspection) {
    return { model: 'cheap', reason: 'post-build verification' };
  }
  return { model: mode, reason: 'authoring step' };
}

/**
 * Tool definitions are re-sent on every single call, so they are a per-step tax. Send only the
 * tools a mode can actually use.
 */
export function toolsForMode(mode: GolemMode, studioConnected: boolean, allNames: string[]): Set<string> {
  if (!studioConnected) {
    return new Set(allNames.filter((n) => n === 'search_docs' || n === 'remember'));
  }
  if (mode === 'clay') {
    return new Set(
      allNames.filter((n) =>
        [
          'get_project_tree',
          'list_scripts',
          'read_script',
          'search_scripts',
          'search_docs',
          'edit_script',
          'set_properties',
          'remember',
        ].includes(n),
      ),
    );
  }
  if (mode === 'stone') {
    return new Set(allNames.filter((n) => n !== 'take_screenshot'));
  }
  return new Set(allNames);
}
