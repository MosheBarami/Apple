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

/**
 * NOTE — model routing was removed in the GLM-5.3-flash migration.
 *
 * Routing existed to move cheap steps onto qwen3-30b while gpt-oss-120b did the authoring.
 * GLM-5.3-flash at reasoning=low is cheaper per call than the old flagship AND stronger than the
 * old cheap model, so a second model would only add a quality cliff for a fraction of a neuron.
 * Measured evidence against keeping it: routing the post-inspection step to qwen3 changed the
 * outcome — the cheap model read the project tree and declared the task finished instead of
 * building it. One model, one behaviour.
 *
 * What survives is the part that genuinely saved tokens: sending each mode only the tool
 * definitions it can use, since schemas are re-sent on every single call.
 */

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
  // Stone is the default builder, so it gets everything including the visual inspection tools:
  // this is the mode that produces scenes, and therefore the mode that must look at them.
  if (mode === 'stone') return new Set(allNames);
  return new Set(allNames);
}
