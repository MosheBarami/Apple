// Per-mode capability, and the model routing it grew out of. What this file decides TODAY is which
// tools each mode may call — which makes it the place that ENFORCES Plan mode's read-only promise
// to the user, not merely a token optimisation. Read the note on toolsForMode before you change
// clay's list.
//
// The routing history below is kept because it explains why the toolsets are all that is left.
//
// Model routing: cost is dominated by which model runs, so this decided — per step, not per
// request — whether a step genuinely needed the flagship builder or whether the measured cheap
// model was sufficient.
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
 * WHY CLAY'S TOOLSET IS READ-ONLY — read this before you add a tool to it.
 *
 * The user does not pick clay/stone/rune. They pick Plan, Agent or Super Agent, and Plan maps onto
 * the clay specialist. Plan's promise to the user is that it looks and thinks and does NOT touch
 * their project: they can point it at a place they care about, ask "what would you do here", and
 * get an answer without risking a single instance. That promise is what makes Plan safe to run on
 * work in progress, and it is the only mode that offers it.
 *
 * So the tools below are the guarantee, not a performance tweak. The system prompt asks the model
 * to behave like a planner, but a prompt is a request; the toolset is what makes it true. If you
 * put edit_script, set_properties, create_instances, delete_instances or run_luau back into this
 * list, Plan stops being a mode that cannot damage a project and becomes a mode that promises not
 * to — and the product has said something to the user that is no longer enforced anywhere.
 * `remember` is the one write here and it is deliberate: it writes to Golem's own memory of the
 * project, never to the project itself.
 *
 * (Tool definitions are also re-sent on every single call, so a mode's toolset is a per-step token
 * tax as well. Send only the tools a mode can actually use.)
 */
export function toolsForMode(mode: GolemMode, studioConnected: boolean, allNames: string[]): Set<string> {
  if (!studioConnected) {
    return new Set(allNames.filter((n) => n === 'search_docs' || n === 'remember'));
  }
  if (mode === 'clay') {
    // Inspection only. Nothing in this list can change the user's project — see the note above.
    return new Set(
      allNames.filter((n) =>
        [
          'get_project_tree',
          'list_scripts',
          'read_script',
          'search_scripts',
          'search_docs',
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
