// The eval hook for L3.
//
// What this file has to establish is that `playbook_complete` fails work that
// `no_design_violation` passes — otherwise it is a second opinion rather than a
// new verdict, and docs/SOURCE-INTELLIGENCE.md §7 does not count that as a rung.
import test from 'node:test';
import assert from 'node:assert/strict';

import { gradeTask } from './grade.mjs';
import { checkPlaybookComplete } from './playbook-checks.mjs';
import { checkNoDesignViolation } from './design-checks.mjs';

// What a model plausibly returns for "build me a shop panel" when it has not been
// given a procedure. It parses, it mentions the right nouns, and it is not a shop.
const PLAUSIBLE_BUT_EMPTY = [
  'local gui = Instance.new("ScreenGui")',
  'local shop = Instance.new("Frame")',
  'shop.Size = UDim2.fromOffset(420, 320)',
  'shop.Parent = gui',
  'local title = Instance.new("TextLabel")',
  'title.Text = "Shop"',
  'title.Parent = shop',
].join('\n');

test('the two checks disagree, and that disagreement is the point', () => {
  const violations = checkNoDesignViolation(PLAUSIBLE_BUT_EMPTY, {});
  assert.equal(violations.passed, true, 'nothing here violates a mechanised rule');

  const complete = checkPlaybookComplete(PLAUSIBLE_BUT_EMPTY, { playbook: 'panel.shop' });
  assert.equal(complete.passed, false);
  assert.match(complete.detail, /4 of 5 step\(s\) missing: footer, rows, price, transition/);
});

test('a missing playbook id fails loudly instead of passing an unattempted run', () => {
  assert.equal(checkPlaybookComplete('local a = 1', {}).passed, false);
  assert.match(checkPlaybookComplete('local a = 1', {}).detail, /requires a `playbook` id/);

  const bogus = checkPlaybookComplete('local a = 1', { playbook: 'panel.nope' });
  assert.equal(bogus.passed, false);
  assert.match(bogus.detail, /unknown playbook "panel\.nope".*panel\.shop/s);
});

test('empty output fails rather than vacuously passing', () => {
  assert.equal(checkPlaybookComplete('', { playbook: 'panel.shop' }).passed, false);
  assert.equal(checkPlaybookComplete('   ', { playbook: 'panel.shop' }).passed, false);
});

test('a library bypass is reported on a PASS, not buried by it', () => {
  const handRolled = [
    'local frame = Instance.new("Frame")',
    'local footer = 40',
    'local layout = Instance.new("UIListLayout")',
    'local price = 250',
    'TweenService:Create(frame, info, { Position = target }):Play()',
  ].join('\n');
  const res = checkPlaybookComplete(handRolled, { playbook: 'panel.shop' });
  assert.equal(res.passed, true, 'every step was attempted');
  assert.match(res.detail, /5 step\(s\) bypassed the library/);

  // …and a task that cares can refuse it outright.
  const strict = checkPlaybookComplete(handRolled, { playbook: 'panel.shop', allowManual: false });
  assert.equal(strict.passed, false);
});

test('the grader dispatches playbook_complete from a task check', () => {
  const task = { checks: [{ type: 'playbook_complete', target: 'code', playbook: 'panel.shop' }] };
  const response = '```lua\n' + PLAUSIBLE_BUT_EMPTY + '\n```';
  const graded = gradeTask(task, response);
  assert.equal(graded.score, 0);
  assert.equal(graded.checks[0].passed, false);
  assert.match(graded.checks[0].detail, /step\(s\) missing/);
});
