// Grading: check evaluation + per-task scoring.
// Check shape: {type: 'contains'|'not_contains'|'regex'|'luau_syntax'|'no_antipattern'|'no_design_violation',
//               value?, pattern?, flags?, target: 'text'|'code', weight?, rules?, context?}
//  - contains:     literal `value` must appear in the target.
//  - not_contains: literal `value` (or regex `pattern`) must NOT appear/match.
//  - regex:        `pattern` (+optional `flags`) must match the target.
//  - luau_syntax:  target (normally 'code') must parse as Luau via the local CLI.
//  - no_antipattern: target (normally 'code') must contain none of the named Roblox anti-patterns.
//  - no_design_violation: target must violate none of the design library's text-decidable rules.
//  - playbook_complete: target must carry out every step of a task class's playbook. This is the
//      only check that can fail code for what it does NOT do; the rest are violation detectors,
//      and a bare Frame answering "build a shop panel" violates nothing.
//      `luau_syntax` and the text checks together cannot distinguish a shop that debits the server's
//      balance from one that trusts a price the client sent — both parse and both mention
//      RemoteEvent. This check reads the code instead of its vocabulary; see roblox-antipatterns.mjs.
// Task score = weighted fraction of checks passed (check.weight defaults to 1).
import { checkLuauSyntax } from './luau.mjs';
import { checkNoAntipattern } from './roblox-antipatterns.mjs';
import { checkNoDesignViolation } from './design-checks.mjs';
import { checkPlaybookComplete } from './playbook-checks.mjs';

const FENCE_RE = /```[ \t]*[A-Za-z0-9_+-]*[ \t]*\r?\n([\s\S]*?)```/g;

/** Concatenate all fenced code blocks in a model response (empty string if none). */
export function extractCode(text) {
  const blocks = [];
  for (const m of String(text ?? '').matchAll(FENCE_RE)) blocks.push(m[1].replace(/\s+$/, ''));
  return blocks.join('\n');
}

// Markers a model uses to switch from "these are affected" to "these are not".
const NEGATION_MARKERS = /\n\s*(?:\*\*)?(?:not affected|unaffected|not impacted|safe|would not break|no impact)/i;

function targetText(check, text, code) {
  const t = check.target === 'code' ? code : text;
  // `scope: 'claimed'` restricts a check to the part of the answer where the model is ASSERTING
  // something, i.e. before any "Not affected:" section. Without this a bare not_contains punishes
  // a model for the *more* useful answer — correctly naming what breaks, then explaining what
  // does not. Verified against GLM-5.3-flash on pc-03: the answer was right, the check was wrong.
  if (check.scope === 'claimed') {
    const m = t.match(NEGATION_MARKERS);
    if (m && m.index != null) return t.slice(0, m.index);
  }
  return t;
}

function evalCheck(check, text, code, luauCheck) {
  const t = targetText(check, text, code);
  switch (check.type) {
    case 'contains': {
      const passed = t.includes(check.value);
      return { passed, detail: passed ? `found ${JSON.stringify(check.value)}` : `missing ${JSON.stringify(check.value)}` };
    }
    case 'not_contains': {
      if (check.pattern != null) {
        const re = new RegExp(check.pattern, check.flags ?? '');
        const passed = !re.test(t);
        return { passed, detail: passed ? `pattern absent: /${check.pattern}/` : `forbidden pattern matched: /${check.pattern}/` };
      }
      const passed = !t.includes(check.value);
      return { passed, detail: passed ? `absent: ${JSON.stringify(check.value)}` : `forbidden text found: ${JSON.stringify(check.value)}` };
    }
    case 'regex': {
      const re = new RegExp(check.pattern, check.flags ?? '');
      const passed = re.test(t);
      return { passed, detail: `${passed ? 'matched' : 'no match'}: /${check.pattern}/${check.flags ?? ''}` };
    }
    case 'luau_syntax': {
      return (luauCheck ?? checkLuauSyntax)(t);
    }
    case 'no_antipattern': {
      return checkNoAntipattern(t, { rules: check.rules, context: check.context });
    }
    case 'playbook_complete': {
      return checkPlaybookComplete(t, { playbook: check.playbook, path: check.path, allowManual: check.allowManual });
    }
    case 'no_design_violation': {
      // The design library's mechanised rules, pointed at what the MODEL wrote rather than at
      // this repository's own source — which is the difference gate 26 turns on.
      return checkNoDesignViolation(t, { rules: check.rules, path: check.path });
    }
    default:
      return { passed: false, detail: `unknown check type: ${check.type}` };
  }
}

/**
 * Grade one model response against a task.
 * @param {object} task  task definition ({id, checks, ...})
 * @param {string} responseText  raw model text
 * @param {{luauCheck?: (code: string) => {passed: boolean, detail: string}}} [opts]  injectable for tests
 * @returns {{score: number, code: string, checks: Array<{type, target, passed, weight, detail}>}}
 */
export function gradeTask(task, responseText, opts = {}) {
  const text = String(responseText ?? '');
  const code = extractCode(text);
  const results = [];
  let totalW = 0;
  let passedW = 0;
  for (const check of task.checks) {
    const w = check.weight ?? 1;
    let r;
    try {
      r = evalCheck(check, text, code, opts.luauCheck);
    } catch (e) {
      r = { passed: false, detail: `check error: ${e instanceof Error ? e.message : String(e)}` };
    }
    totalW += w;
    if (r.passed) passedW += w;
    results.push({ type: check.type, target: check.target, passed: r.passed, weight: w, detail: r.detail });
  }
  return { score: totalW > 0 ? passedW / totalW : 0, code, checks: results };
}
