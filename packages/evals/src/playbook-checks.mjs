// playbook-checks.mjs — grade model output for COMPLETENESS, not only for violations.
//
// `no_design_violation` reads what a model wrote and reports what is wrong with it.
// It cannot report what is absent, because every mechanised rule it runs is a
// violation detector and several return early when the thing they judge is not
// there — `checkFocusFeedback` skips any file with no `MouseEnter` to contradict.
//
// So a model that answers "build a shop panel" with a bare Frame and a TextLabel
// scores a clean `no_design_violation`. It violated nothing. It also did not build
// a shop panel, and no check in `packages/evals` could say so before this one.
//
// `playbook_complete` is that missing verdict: given a task class, did the code
// carry out the steps the class requires? A `missing` step is a failure. A step
// done WITHOUT the Golem primitive is reported but does not fail the task, because
// hand-rolling is sometimes right and `no_design_violation` still reads the result.

import { gradePlaybook, PLAYBOOK_IDS } from '@golem/design/playbooks';

/**
 * @param {string} code   the model's fenced Luau
 * @param {{playbook?: string, path?: string, allowManual?: boolean}} opts
 */
export function checkPlaybookComplete(code, opts = {}) {
  if (!code || !code.trim()) {
    return { passed: false, detail: 'no code to analyze (no fenced code block found)' };
  }
  const id = opts.playbook;
  if (!id) {
    return { passed: false, detail: 'playbook_complete requires a `playbook` id' };
  }
  if (!PLAYBOOK_IDS.includes(id)) {
    // Loud rather than silently-passing, for the same reason design-checks.mjs is:
    // a task naming a playbook that does not exist would otherwise report a clean
    // run it never attempted.
    return { passed: false, detail: `unknown playbook "${id}" (have: ${PLAYBOOK_IDS.join(', ')})` };
  }

  let graded;
  try {
    graded = gradePlaybook(code, id, { path: opts.path ?? 'Generated.luau' });
  } catch (e) {
    return { passed: false, detail: `playbook ${id} threw: ${e instanceof Error ? e.message : String(e)}` };
  }

  const { completeness, missing, reinvented } = graded;
  // `reinvented` is reported in BOTH outcomes. It is the §G signal — a generator
  // rebuilding a primitive Golem already owns — and burying it inside a pass would
  // make the one thing this eval exists to notice the one thing it never says.
  const note = reinvented.length > 0 ? `; ${reinvented.length} step(s) bypassed the library: ${reinvented.join(', ')}` : '';

  if (missing.length > 0) {
    return {
      passed: false,
      detail: `${missing.length} of ${completeness.total} step(s) missing: ${missing.join(', ')}${note}`,
    };
  }
  if (opts.allowManual === false && reinvented.length > 0) {
    return { passed: false, detail: `all steps present but ${reinvented.length} bypassed the library: ${reinvented.join(', ')}` };
  }
  return { passed: true, detail: `all ${completeness.total} step(s) present${note}` };
}
