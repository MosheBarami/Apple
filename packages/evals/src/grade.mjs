// Grading: check evaluation + per-task scoring.
// Check shape: {type: 'contains'|'not_contains'|'regex'|'luau_syntax',
//               value?, pattern?, flags?, target: 'text'|'code', weight?}
//  - contains:     literal `value` must appear in the target.
//  - not_contains: literal `value` (or regex `pattern`) must NOT appear/match.
//  - regex:        `pattern` (+optional `flags`) must match the target.
//  - luau_syntax:  target (normally 'code') must parse as Luau via the local CLI.
// Task score = weighted fraction of checks passed (check.weight defaults to 1).
import { checkLuauSyntax } from './luau.mjs';

const FENCE_RE = /```[ \t]*[A-Za-z0-9_+-]*[ \t]*\r?\n([\s\S]*?)```/g;

/** Concatenate all fenced code blocks in a model response (empty string if none). */
export function extractCode(text) {
  const blocks = [];
  for (const m of String(text ?? '').matchAll(FENCE_RE)) blocks.push(m[1].replace(/\s+$/, ''));
  return blocks.join('\n');
}

function targetText(check, text, code) {
  return check.target === 'code' ? code : text;
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
