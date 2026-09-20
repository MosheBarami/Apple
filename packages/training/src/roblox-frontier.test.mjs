#!/usr/bin/env node
/**
 * THE BENCHMARK'S OWN GUARD: PROVE EVERY CHECK CAN FAIL BEFORE ANY MODEL IS SCORED BY IT.
 *
 * A check that always passes is indistinguishable, in a report, from a check the model passed. A
 * suite of fifty of them reads as very good news and means nothing. This is the repository's own
 * failure shape — PRESENT and never REACHED — and a benchmark is the most expensive place to
 * commit it, because every downstream decision is made from its numbers.
 *
 * So this file does not test the scorer's plumbing. It tests that the SUITE DISCRIMINATES:
 *
 *   1. Every item's `pass` control passes EVERY check on that item. A pass control that fails means
 *      either the control or the check is wrong, and either way no model should be measured yet.
 *   2. Every check has a `fail` control, and that control FAILS it. A check with no control, or one
 *      whose control passes it, is unfalsifiable and the suite goes red naming it.
 *   3. No control errors under the harness. A control that throws proves nothing about the check.
 *   4. The item ids and check ids are unique, and every check id is reachable from ALL_CHECK_IDS.
 *
 * Run: node --test packages/training/src/roblox-frontier.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FRONTIER_ITEMS, ALL_CHECK_IDS, AXES, ARMS } from './roblox-frontier-tasks.mjs';
import { CONTROLS } from './roblox-frontier-controls.mjs';
import { scoreFrontierItem } from './score-roblox-frontier.mjs';

const fence = (luau) => `\`\`\`luau\n${luau}\n\`\`\``;

test('item and check ids are unique, and every item declares an axis that exists', () => {
  const ids = FRONTIER_ITEMS.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate item id');
  assert.equal(new Set(ALL_CHECK_IDS).size, ALL_CHECK_IDS.length, 'duplicate check id within an item');
  for (const item of FRONTIER_ITEMS) {
    assert.ok(AXES.includes(item.axis), `${item.id}: unknown axis ${item.axis}`);
    assert.ok(item.checks.length > 0, `${item.id}: has no checks`);
    assert.ok(item.prompt.length > 40, `${item.id}: prompt is too short to be a real request`);
    assert.ok(item.cite, `${item.id}: no citation for the rule it scores`);
    assert.ok(['script', 'module'].includes(item.shape), `${item.id}: unknown shape`);
  }
});

test('every item has a control block, and every check has a fail control', () => {
  for (const item of FRONTIER_ITEMS) {
    const control = CONTROLS[item.id];
    assert.ok(control, `${item.id}: no controls at all — the checks are unproven`);
    assert.ok(control.pass, `${item.id}: no pass control`);
    for (const check of item.checks) {
      assert.ok(
        control.fail?.[check.id],
        `${item.id}/${check.id}: NO NEGATIVE CONTROL. This check has never been shown to fail, so a `
        + 'model passing it is not evidence of anything.',
      );
    }
    for (const id of Object.keys(control.fail ?? {})) {
      assert.ok(item.checks.some((c) => c.id === id), `${item.id}: fail control for unknown check "${id}"`);
    }
  }
});

//[[ THE EXPENSIVE HALF. Each control is compiled and RUN under the harness, through the same
//   scorer a model's answer goes through — not a mock of it. About 70 Luau processes; a few
//   seconds. Worth every one of them, because this is the only thing standing between a number in
//   docs/roblox-frontier-benchmark.md and a number that means nothing.
for (const item of FRONTIER_ITEMS) {
  const control = CONTROLS[item.id];
  if (!control) continue;

  test(`${item.id}: the pass control passes every check`, () => {
    const result = scoreFrontierItem(item, fence(control.pass));
    assert.equal(
      result.outcome, 'checked',
      `pass control did not run: ${result.outcome} — ${result.detail ?? ''} ${result.probeError ?? ''}`,
    );
    const bad = result.checks.filter((c) => c.pass !== true);
    assert.deepEqual(
      bad.map((c) => `${c.id}=${c.pass}`), [],
      `pass control failed or could not resolve: ${bad.map((c) => `${c.id} (${c.why})`).join('; ')}`,
    );
  });

  for (const check of item.checks) {
    const source = control.fail?.[check.id];
    if (!source) continue;
    test(`${item.id}/${check.id}: the negative control fails it`, () => {
      const result = scoreFrontierItem(item, fence(source));
      assert.notEqual(
        result.outcome, 'does_not_compile',
        `negative control does not compile, so it proves nothing: ${result.detail}`,
      );
      assert.notEqual(result.outcome, 'no_code_block', 'negative control produced no code');
      const verdict = result.checks.find((c) => c.id === check.id);
      assert.ok(verdict, `check ${check.id} did not run against its own negative control`);
      assert.equal(
        verdict.pass, false,
        `UNFALSIFIABLE: "${check.id}" passed on an answer written to break it. Either the check does `
        + `not observe what it claims to, or the control does not do what its comment says. Why: ${check.why}`,
      );
    });
  }
}

test('the two prompt arms differ only in Roblox guidance, and the neutral one carries none', () => {
  const neutral = ARMS.neutral.system;
  const house = ARMS['house-rules'].system;
  assert.notEqual(neutral, house);
  // The neutral arm measures the MODEL. If it names an API, it is measuring itself.
  for (const leak of ['task.wait', 'Animator', 'UpdateAsync', 'pcall', 'AnchorPoint', 'never trust', 'TweenService', 'TextChatService']) {
    assert.ok(
      !neutral.includes(leak),
      `the neutral system prompt mentions "${leak}" — it would be measuring the prompt, not the model`,
    );
  }
  // The house-rules arm must actually be production's text, not a paraphrase of it.
  assert.ok(house.includes('never the deprecated global wait/spawn'));
  assert.ok(house.includes('never trust the client on the server'));
});
