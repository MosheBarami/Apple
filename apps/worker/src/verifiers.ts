/**
 * THE TOOLS THAT ANSWER "IS THIS ANY GOOD", in one place both the tool registry and the system
 * prompt can import.
 *
 * It lives outside tools.ts for one reason: prompts.ts has to say which verifiers THIS run was
 * offered, and prompts.ts is loaded directly by node in the test suite, where tools.ts (which
 * imports without extensions and pulls in the gateway) cannot be. A second hand-written copy of
 * the list in the prompt would be the drift this repository keeps finding, so the prompt imports
 * this one instead.
 */

/**
 * The four verifiers, pinned by verification-tools.test.mjs. None of them sends a picture to a model (M4: there is no vision
 * in the product): `run_and_check` and `run_spec` play the place, `audit_build` and `check_composition` are arithmetic.
 *
 * Kept as a list rather than a substring test so that renaming a verifier breaks a plan's
 * verification requirement loudly instead of quietly accepting a plan with no check in it.
 */
export const VERIFIER_TOOLS = ['run_and_check', 'run_spec', 'audit_build', 'check_composition'] as const;

/**
 * Which verifier the product appends when a plan names none, best first — and only ever one the
 * run was OFFERED.
 *
 * `audit_build` leads because it needs only `get_tree`, takes no arguments and costs nothing, and it works
 * when the connected Studio cannot render (`render_view` unsupported, which withholds `check_composition`).
 * `run_and_check` plays the place, and `run_spec` needs cases the product cannot write for the model, so
 * they come last. A permutation of VERIFIER_TOOLS, asserted by propose-plan.test.mjs.
 */
export const APPENDED_VERIFIER_PREFERENCE = [
  'audit_build',
  'check_composition',
  'run_and_check',
  'run_spec',
] as const;

/** The tool whose call announces a plan. */
export const PLANNER_TOOL = 'propose_plan';
