// The grader's check-type surface.
//
// This file exists because of a defect it now guards: `no_design_violation` and
// `playbook_complete` were both implemented, imported by grade.mjs, unit-tested and
// dispatched — while tasks.mjs validated `check.type` against its own hand-written set
// and rejected them as `bad type`. No task file could declare either, so neither was
// reachable from the eval suite, and both were described as wired into it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DISPATCHABLE_CHECK_TYPES } from './grade.mjs';
import { validateTask } from './tasks.mjs';


// --------------------------------------- the two lists cannot drift again (F-57)
test('every dispatchable check type is accepted by the task validator', () => {
  // `no_design_violation` and `playbook_complete` were both implemented, imported by
  // grade.mjs, unit-tested and dispatched — while tasks.mjs rejected them as `bad type`,
  // so no task file could declare either and neither was reachable from the suite.
  // Both were described as wired into the eval harness. They were not.
  for (const type of DISPATCHABLE_CHECK_TYPES) {
    const errs = validateTask({
      id: 'probe',
      prompt: 'p',
      checks: [{ type, target: 'code', value: 'x', pattern: 'x', playbook: 'panel.shop' }],
    }, 'probe.json');
    const badType = errs.filter((e) => /bad type/.test(e));
    assert.deepEqual(badType, [], `task validator rejects dispatchable type "${type}"`);
  }
});

test('the dispatchable list matches the case labels in grade.mjs itself', () => {
  // The general form of the defect: adding a `case` to evalCheck without adding it to
  // DISPATCHABLE_CHECK_TYPES would leave the new type unreachable from task files, in
  // exactly the way the two above were. Read the source rather than trusting the list.
  const src = readFileSync(new URL('./grade.mjs', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('function evalCheck'));
  const cases = [...body.matchAll(/^\s{4}case '([a-z_]+)':/gm)].map((m) => m[1]);
  assert.ok(cases.length >= 7, `expected the dispatch cases, found ${cases.length}`);
  assert.deepEqual([...cases].sort(), [...DISPATCHABLE_CHECK_TYPES].sort());
});

test('an unknown check type is still rejected', () => {
  // The binding must not turn the validator into a rubber stamp.
  const errs = validateTask({
    id: 'probe', prompt: 'p', checks: [{ type: 'no_such_check', target: 'code' }],
  }, 'probe.json');
  assert.ok(errs.some((e) => /bad type no_such_check/.test(e)), JSON.stringify(errs));
});
