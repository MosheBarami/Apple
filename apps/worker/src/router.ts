// Per-mode capability. What this file decides TODAY is which
// tools each mode may call — which makes it the place that ENFORCES Plan mode's read-only promise
// to the user, not merely a token optimisation. Read the note on toolsForMode before changing it.
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
import type { ProductMode } from '@golem/shared';

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
 * WHY PLAN'S TOOLSET IS READ-ONLY — read this before you add a tool to it.
 *
 * Plan's promise to the user is that it looks and thinks and does NOT touch
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
/** Inspection only. Nothing in this list can change the user's project — see the note above. */
const PLAN_TOOLS = [
  'get_project_tree',
  // Phase A reads (D-VISION-1). Each sends one opt-in op that only reads the place: a query over
  // instances, a raycast/overlap/flat-ground probe, a terrain voxel read. `check_ui_layout` is
  // deliberately NOT here: it changes nothing saved, but it builds a temporary copy of a screen
  // in Studio's own UI layer, and Plan's promise is that it reads.
  'search_instances',
  'spatial_query',
  'read_terrain',
  'list_scripts',
  'read_script',
  'search_scripts',
  // The two read-only code-intelligence tools. `review_scripts` parses and analyses; `find_symbol`
  // resolves a name through scopes. Neither can send a mutating op — they read scripts and return
  // findings — and "what would you do here" is exactly the question they answer. `format_script`
  // is deliberately NOT here: it writes.
  'review_scripts',
  'find_symbol',
  'search_docs',
  'search_creation_skills',
  'read_creation_skill',
  'get_genre_references',
  // THE TWO KNOWLEDGE LIBRARIES. Both are `studio: false`, read a table compiled into this worker,
  // reach nothing outside it and cost no inference — see KNOWLEDGE_TOOLS below for why withholding
  // them was a defect rather than a safety property. Plan is the mode that most needs them: "what
  // would you do here" is answered by the module that was already proven and the construction
  // record that was already measured, not by the planner re-deriving either from memory.
  'get_verified_module',
  'get_ui_construction',
  'remember',
  // The READ-ONLY web tools. Each one reads something outside the user's project — a page, a
  // search, a repository, an image, the project's own scratch files — and none of them can reach
  // the place at all: they are not Studio tools and have no op to send. Planning is exactly the
  // activity that wants them, since "what would you do here" is often answered by reading the
  // documentation or the upstream repository first.
  //
  // `workspace_write` is deliberately NOT here. It writes nothing into the place either, but the
  // rule this list enforces is about what a user can hand Plan without thinking, and "it only
  // writes to Golem's own files" is a distinction the user did not agree to. Plan reads.
  'web_fetch',
  'browse_page',
  'web_search',
  'docs_lookup',
  'screenshot_page',
  'ocr_image',
  'github_lookup',
  'git_history',
  'workspace_list',
  'workspace_read',
];

/**
 * Worker-side capabilities that remain useful without a live Studio bridge.
 *
 * `generate_image` is deliberately separate from the Studio toolset: it creates a preview in
 * Apple's project-scoped storage and never edits the place. Agent should therefore be
 * able to answer an image request while Studio is disconnected, while Plan and unknown modes
 * keep their read-only contract. Do not add a Studio-backed generator here — an offline mode must
 * never suggest a call that can only end in a connection refusal.
 */
/**
 * THE LIBRARIES THE MODEL IS SUPPOSED TO HOLD IN ITS HEAD, which it was handed in one mode out of
 * three and in none of them when Studio was offline.
 *
 * `get_verified_module` serves Luau that was RUN against its own exhaustive checks at build time;
 * `get_ui_construction` serves stroke weights, radii and grid pitches read off interfaces that
 * shipped. Both are `studio: false`, both answer from a table compiled into this bundle, neither
 * can touch the place, spend a credit or make an outbound request.
 *
 * They were nonetheless reachable only from Agent WITH a live Studio, because they were in
 * neither list here — so Plan mode could never cite a proven module in a roadmap, and a
 * disconnected session had to answer construction questions from pretraining. That is the precise
 * failure the modules exist to stop: measured, the model writes the right shape with the wrong
 * arithmetic, and an offered-but-unused library is indistinguishable from no library at all.
 *
 * The rule this list keeps is unchanged — an offline mode must never suggest a call that can only
 * end in a connection refusal — and these two pass it: they answer identically with Studio absent.
 */
const KNOWLEDGE_TOOLS = ['get_verified_module', 'get_ui_construction'];
const OFFLINE_TOOLS = ['search_docs', 'search_creation_skills', 'read_creation_skill', 'get_genre_references', ...KNOWLEDGE_TOOLS, 'remember'];
const OFFLINE_IMAGE_TOOLS = [...OFFLINE_TOOLS, 'generate_image'];

export function toolsForMode(mode: ProductMode, studioConnected: boolean, allNames: string[]): Set<string> {
  if (!studioConnected) {
    const allowed = mode === 'agent' ? OFFLINE_IMAGE_TOOLS : OFFLINE_TOOLS;
    return new Set(allNames.filter((n) => allowed.includes(n)));
  }
  switch (mode) {
    case 'plan':
      return new Set(allNames.filter((n) => PLAN_TOOLS.includes(n)));
    // Agent is the builder, so it gets every registered tool; downstream project/account gates
    // remain authoritative for operations that require pairing, consent or separate approval.
    case 'agent':
      return new Set(allNames);
    default:
      // A MODE NOBODY DEFINED GETS PLAN'S SET, NOT EVERYTHING.
      //
      // This used to fall through to `new Set(allNames)`, so an unrecognised mode was handed
      // edit_script, delete_instances and run_luau — the most permissive answer available, for the
      // one input the function did not understand. Same shape as the step ceiling in session.ts:
      // The mode union is a compile-time promise and the runtime must still fail closed.
      //
      // session.ts now validates `mode` at all three ingresses, so nothing unrecognised should
      // arrive here in the assembled product. This is the second line, and a second line that
      // fails open is not one. The toolset is the guarantee, not a performance tweak.
      return new Set(allNames.filter((n) => PLAN_TOOLS.includes(n)));
  }
}
