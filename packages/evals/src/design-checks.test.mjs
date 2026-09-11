// Tests for `no_design_violation` — the check type that points the design library's mechanised
// rules at code a MODEL wrote, rather than at this repository's own source.
//
// The gap this closes was found by an independent audit of mission gate 26 ("corpus materially
// improves UI/world evals"): the eleven executable checks were real and had found two live
// defects, and `packages/evals` did not import `@golem/design` at all. The checks improved this
// repository and had never once been applied to generated output, which is what the gate says.
//
// Run: node --test packages/evals/src/design-checks.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkNoDesignViolation, TEXT_CHECKS, TEXT_CHECK_RULE_IDS } from './design-checks.mjs';
import { ENFORCED_RULE_IDS } from '@golem/design';
import { gradeTask } from './grade.mjs';

test('every text-decidable rule id is a rule the design library actually enforces', () => {
  // Stops this file drifting into checking rules that no longer exist, or claiming a rule id
  // the library never mechanised.
  for (const id of TEXT_CHECK_RULE_IDS) {
    assert.ok(ENFORCED_RULE_IDS.includes(id), `${id} is checked here but not in ENFORCED_RULE_IDS`);
  }
});

test('the split between text-decidable and geometry rules is stated, not silent', () => {
  // Six of the eleven need measured geometry — cluster rectangles at a viewport, a rendered
  // palette, a selection graph — and cannot be decided from a snippet. The point of asserting
  // the count is that a clean report never implies more coverage than was attempted.
  assert.equal(TEXT_CHECK_RULE_IDS.length, 5);
  assert.ok(ENFORCED_RULE_IDS.length > TEXT_CHECK_RULE_IDS.length, 'most enforced rules still need geometry');
});

const BAD_CLAMP = `local label = Instance.new("TextLabel")
label.TextScaled = true
label.TextWrapped = false
local c = Instance.new("UITextSizeConstraint")
c.Parent = label`;

const GOOD_CLAMP = `local label = Instance.new("TextLabel")
local c = Instance.new("UITextSizeConstraint")
c.MaxTextSize = 22
c.Parent = label
label.TextScaled = true`;

test('F-38 in generated code: scale-then-unwrap fails', () => {
  const r = checkNoDesignViolation(BAD_CLAMP, { path: 'Hud.luau' });
  assert.equal(r.passed, false);
  assert.match(r.detail, /a-scaled-label-must-not-be-told-not-to-wrap/);
});

test('...and the fixed order passes', () => {
  assert.equal(checkNoDesignViolation(GOOD_CLAMP, { path: 'Hud.luau' }).passed, true);
});

const BAD_HOVER = `btn.MouseEnter:Connect(function() hovering = true refresh() end)`;
const GOOD_HOVER = `btn.MouseEnter:Connect(function() hovering = true refresh() end)
btn.SelectionGained:Connect(function() hovering = true refresh() end)`;

test('F-37 in generated code: a hover with no gamepad response fails', () => {
  const r = checkNoDesignViolation(BAD_HOVER, { path: 'Theme.luau' });
  assert.equal(r.passed, false);
  assert.match(r.detail, /selection-gained-is-the-gamepad-s-hover/);
});

test('...and answering both signals passes', () => {
  assert.equal(checkNoDesignViolation(GOOD_HOVER, { path: 'Theme.luau' }).passed, true);
});

test('an empty response fails rather than passing vacuously', () => {
  // The most important negative. A model that returns prose with no code block must not score a
  // clean design report — that is the "silently passing check" this suite exists against.
  assert.equal(checkNoDesignViolation('', { path: 'X.luau' }).passed, false);
  assert.equal(checkNoDesignViolation('   \n  ', { path: 'X.luau' }).passed, false);
});

test('a rule this check cannot decide is a loud failure, not a silent pass', () => {
  const r = checkNoDesignViolation('local x = 1', { rules: ['layout.cluster-origin-agreement'] });
  assert.equal(r.passed, false, 'a geometry rule cannot be decided from text and must say so');
  assert.match(r.detail, /unknown or non-text/);
});

test('the detail names the RULE, so an eval report says which design law was broken', () => {
  const r = checkNoDesignViolation(BAD_CLAMP, { path: 'Hud.luau' });
  assert.match(r.detail, /^\d+ finding\(s\); [a-z-]+\./, 'detail leads with a count and a rule id');
});

// ------------------------------------------------------------------ through the grader
test('gradeTask runs no_design_violation end to end', () => {
  const task = {
    id: 'ui-hud',
    checks: [{ type: 'no_design_violation', target: 'code', path: 'Hud.luau', weight: 1 }],
  };
  const bad = gradeTask(task, ['```luau', BAD_CLAMP, '```'].join('\n'));
  assert.equal(bad.score, 0, 'a design violation in the model\'s code scores zero');

  const good = gradeTask(task, ['```luau', GOOD_CLAMP, '```'].join('\n'));
  assert.equal(good.score, 1);
});

test('an unknown check type is still rejected, so this addition did not widen the grader', () => {
  const task = { id: 'x', checks: [{ type: 'no_such_check', weight: 1 }] };
  assert.equal(gradeTask(task, 'anything').score, 0);
});
