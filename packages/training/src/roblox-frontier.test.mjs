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
import { scoreFrontierItem, tally } from './score-roblox-frontier.mjs';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

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

//[[ THE HOUSE-RULES ARM CLAIMS TO BE PRODUCTION'S TEXT. READ PRODUCTION AND CHECK.
//
//   `ARMS['house-rules'].what` says "production's own written code rules, verbatim from prompts.ts
//   IDENTITY". The whole point of the arm is that the gap between it and `neutral` is the part of
//   the score bought by PROMPTING rather than by the weights — which is only true if the prompt is
//   the one production actually sends. The guard that stood here checked for two phrases inside the
//   arm's own string, so it could not notice prompts.ts moving underneath it: a mirror whose test
//   never opens the original is a copy with a certificate, not a mirror. The settings mirror in
//   production-settings.mjs is tested by reading apps/worker/src; this now is too.
//   2026-09-21, second edit: the four rules this benchmark's work queue named were measured and then
//   SHIPPED into IDENTITY, so the arm that mirrors production is now `house-rules-plus`, and
//   `house-rules` became the historical control the gain is read against. The mirror test moved with
//   production rather than staying pointed at the arm that used to be it — a guard aimed at
//   yesterday's production is a guard that cannot see today's drift.
test('the arm that claims to be production is a verbatim block of the system prompt production sends', () => {
  const identity = readFileSync(resolve(HERE, '..', '..', '..', 'apps', 'worker', 'src', 'prompts.ts'), 'utf8');
  const house = ARMS['house-rules-plus'].system;
  // The arm is the Roblox-rules block plus a shared answer-format instruction the product does not
  // need (production streams into tools; the bench needs one fenced block). Only the first part
  // claims to be production's, so only the first part is compared — and it is compared whole.
  const [rules] = house.split('\n\nAnswer with ONE fenced luau code block');
  assert.ok(rules.length > 400, 'the block being compared is too short to be the rules block');
  assert.ok(
    identity.includes(rules),
    'the house-rules-plus arm is no longer a verbatim substring of apps/worker/src/prompts.ts. Either '
    + 'production\'s IDENTITY changed and the arm must be re-copied, or the arm was edited. Until '
    + 'they match, the arm measures a prompt no customer receives and the neutral-vs-house gap is '
    + 'not the gap it is reported as.',
  );
});

//[[ A SYNTAX ERROR IS A SCORE, NOT A MISSING MEASUREMENT.
//
//   The first run of this benchmark that produced any number at all reported 9/13 (69.2%) over
//   sixteen items, having dropped two answers the Luau compiler rejected out of the denominator.
//   Both were the model's own bytes. `tally` is what decides this, so `tally` is what is tested:
//   an answer that does not compile must LOWER the percentage, and a throw under the harness must
//   not, because a throw can be the shim's gap.
test('tally counts a non-compiling answer as a failure and excludes a harness throw', () => {
  const items = [
    { id: 'a', axis: AXES[0] }, { id: 'b', axis: AXES[0] },
    { id: 'c', axis: AXES[0] }, { id: 'd', axis: AXES[0] },
  ];
  const board = tally(items, [
    { outcome: 'checked', ok: true, checks: [{ id: 'x', pass: true }] },
    { outcome: 'does_not_compile', ok: false, checks: [] },
    { outcome: 'no_code_block', ok: false, checks: [] },
    { outcome: 'runtime_error', ok: false, checks: [] },
  ]);
  assert.equal(board.measured, 3, 'the two verdicts that are the MODEL\'s must be in the denominator');
  assert.equal(board.passed, 1);
  assert.equal(board.excluded, 1, 'the harness throw must be excluded and counted');
  assert.equal(board.pct, 33.3, 'one pass out of three scored answers is 33.3%, not 100%');

  // The negative control for this guard: if every non-`checked` outcome left the denominator again,
  // this same board would read 1/1 = 100%. That is the exact regression, written out.
  const inflated = tally(items, [
    { outcome: 'checked', ok: true, checks: [{ id: 'x', pass: true }] },
    { outcome: 'runtime_error', ok: false, checks: [] },
    { outcome: 'harness_unavailable', ok: false, checks: [] },
    { outcome: 'runtime_error', ok: false, checks: [] },
  ]);
  assert.equal(inflated.pct, 100, 'a board of one pass and three harness faults is the case that MAY read 100%');
  assert.equal(inflated.excluded, 3);
});

//[[ THE INTERVENTION ARM MUST DIFFER FROM ITS CONTROL BY THE INTERVENTION AND NOTHING ELSE.
//
//   `house-rules-plus` exists to answer one question: do four added rules move the five items that
//   failed in every sample of both existing arms? That question is only answerable if the arm is
//   its control plus the four sentences — if the answer format, the voice or the opening block also
//   moved, a difference in score has more than one candidate cause and the run measures nothing.
//   So this reads both strings and proves the difference is exactly additive.
test('house-rules-plus is house-rules plus four sentences, and nothing else moved', () => {
  const base = ARMS['house-rules'].system;
  const plus = ARMS['house-rules-plus'].system;
  const [baseRules, baseFormat] = base.split('\n\nAnswer with ONE fenced');
  const [plusRules, plusFormat] = plus.split('\n\nAnswer with ONE fenced');
  assert.equal(baseFormat, plusFormat, 'the answer-format half must be identical in both arms');
  assert.ok(plusRules.startsWith(baseRules), 'the plus arm must OPEN with its control, byte for byte');

  const added = plusRules.slice(baseRules.length);
  const bullets = added.split('\n').filter((l) => l.startsWith('- '));
  assert.equal(bullets.length, 4, 'four rules were added for four permanently-failing checks; a fifth has no check behind it');
  // Each added rule names the API or the hazard of the check it was written for. A rule with no
  // failing check behind it is a rule nobody can attribute a gain to.
  for (const needle of ['FilterStringAsync', 'retry', 'UpdateAsync', 'failed load']) {
    assert.ok(added.includes(needle), `the added block does not mention "${needle}", so one failing check has no rule`);
  }
  // And it must NOT quietly address shop-debit, whose failure is a string-matching artefact of the
  // probe rather than a Roblox lapse. A rule about that would measure the benchmark's phrasing.
  assert.ok(!/case|lower|upper|spelling/i.test(added), 'the added block addresses shop-debit, which is a phrasing artefact and not a Roblox failure');
});
