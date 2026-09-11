// design-checks.mjs — run the design library's EXECUTABLE rules against model-generated Luau.
//
// WHY THIS FILE EXISTS.
//
// An independent audit put it plainly: mission gate 26 claims "the corpus materially improves
// UI/world evals", justified by "11 of 107 rules mechanised as executable checks" — and **the
// word doing the work is *evals*, and there was no eval**. `packages/evals` did not import
// `@golem/design` at all. The eleven checks were real, and two of them found live defects the
// moment they ran (F-37, F-38), but they had only ever been pointed at THIS REPOSITORY'S
// shipped source. They had never once been applied to something a model wrote, which is what
// the gate actually says.
//
// This closes that. `no_design_violation` is a check type in the same family as
// `no_antipattern`: it reads the code the model produced rather than its vocabulary, and it
// names the design failure it prevents.
//
// WHAT IT CAN AND CANNOT SEE, stated so a clean report is not read for more than it earns.
// Five of the eleven mechanised rules take FILE TEXT and are usable here. The other six take
// measured geometry — cluster rectangles at a viewport, a rendered palette, a selection graph —
// which cannot be recovered from a snippet, and pretending otherwise would be the "check that
// guesses" `checks.mjs` refuses to ship.

import {
  checkWaitContracts,
  checkMotionGate,
  checkInertSurfaceFlags,
  checkFocusFeedback,
  checkTextScaleOrder,
} from '@golem/design';

/**
 * The design checks that can be decided from source text alone.
 *
 * Each is keyed by the rule id it enforces, so a task can request a subset by rule and an eval
 * report can say which RULE failed rather than which function did.
 */
export const TEXT_CHECKS = Object.freeze({
  'icon.a-module-not-installed-is-a-module-absent': checkWaitContracts,
  'motion.gate-at-the-service-not-the-call-site': checkMotionGate,
  'studs.outlines-are-gone-and-no-surface-flag-brings-them-back': checkInertSurfaceFlags,
  'state.selection-gained-is-the-gamepad-s-hover': checkFocusFeedback,
  'typography.a-scaled-label-must-not-be-told-not-to-wrap': checkTextScaleOrder,
});

export const TEXT_CHECK_RULE_IDS = Object.freeze(Object.keys(TEXT_CHECKS));

/**
 * Grade one model-produced Luau snippet against the text-decidable design rules.
 *
 * `path` matters: several rules key off it (a `.luau` client module is judged differently from a
 * world builder), so a task supplies the filename the model was asked to write.
 *
 * Returns the same `{passed, detail}` shape every other check type returns.
 */
export function checkNoDesignViolation(code, opts = {}) {
  if (!code || !code.trim()) return { passed: false, detail: 'no code to analyze (no fenced code block found)' };

  const wanted = opts.rules?.length ? opts.rules : TEXT_CHECK_RULE_IDS;
  const unknown = wanted.filter((id) => !(id in TEXT_CHECKS));
  if (unknown.length) {
    // Loud, never silently-passing: a task naming a rule this check cannot decide would
    // otherwise report a clean run it never attempted.
    return { passed: false, detail: `unknown or non-text design rule(s): ${unknown.join(', ')}` };
  }

  const files = [{ path: opts.path ?? 'Generated.luau', source: code }];
  const findings = [];
  for (const id of wanted) {
    try {
      findings.push(...TEXT_CHECKS[id](files));
    } catch (e) {
      return { passed: false, detail: `design check ${id} threw: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  if (findings.length === 0) {
    return { passed: true, detail: `no design violations (${wanted.length} rule(s) run)` };
  }
  const first = findings[0];
  return {
    passed: false,
    detail: `${findings.length} finding(s); ${first.ruleId}: ${first.detail}`,
  };
}
