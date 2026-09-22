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
 * The five verifiers, pinned by verification-tools.test.mjs.
 *
 * Kept as a list rather than a substring test so that renaming a verifier breaks a plan's
 * verification requirement loudly instead of quietly accepting a plan with no check in it.
 */
export const VERIFIER_TOOLS = ['run_and_check', 'run_spec', 'audit_build', 'check_composition', 'inspect_visually'] as const;

/**
 * Which verifier the product appends when a plan names none, best first — and only ever one the
 * run was OFFERED.
 *
 * `inspect_visually` leads because it looks at what is there and needs no prior artifact. When the
 * connected Studio cannot render (`render_view` unsupported), it and `check_composition` are both
 * withheld; `audit_build` is next because it needs only `get_tree`, takes no arguments and costs
 * nothing. `run_and_check` plays the place, and `run_spec` needs cases the product cannot write for
 * the model, so they come last. A permutation of VERIFIER_TOOLS, asserted by propose-plan.test.mjs.
 */
export const APPENDED_VERIFIER_PREFERENCE = [
  'inspect_visually',
  'audit_build',
  'check_composition',
  'run_and_check',
  'run_spec',
] as const;

/** The tool whose call announces a plan. */
export const PLANNER_TOOL = 'propose_plan';
