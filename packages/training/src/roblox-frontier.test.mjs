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
import { FRONTIER_ITEMS, ALL_CHECK_IDS, AXES, ARMS, UI_RULE_BEFORE, UI_RULE_D_UIONLY_1 } from './roblox-frontier-tasks.mjs';
import { CONTROLS } from './roblox-frontier-controls.mjs';
import { scoreFrontierItem, tally, runUnderHarness } from './score-roblox-frontier.mjs';
import { PRODUCT_MODES, resolveMode, resolveSettings } from './production-settings.mjs';
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

test('the preinserted Shop UI item rejects a script that constructs another Frame', () => {
  const item = FRONTIER_ITEMS.find((candidate) => candidate.id === 'ui-slide-in');
  const bad = `${CONTROLS['ui-slide-in'].pass}\nInstance.new("Frame").Parent = game:GetService("Players").LocalPlayer.PlayerGui`;
  const result = scoreFrontierItem(item, fence(bad));
  assert.equal(result.outcome, 'checked', result.detail ?? 'the candidate must run');
  assert.equal(result.checks.find((check) => check.id === 'uses-library-ui')?.pass, false,
    'creating UI in the script must not satisfy a library-only UI task');
});

test('a saved Shop UI answer may subtract UDim2 values before tweening', () => {
  const run = JSON.parse(readFileSync(resolve(HERE, '../runs/roblox-frontier-apple-max-agent-house-rules-plus-library-ui-20260925-rep16.json'), 'utf8'));
  const answer = run.rows.find((row) => row.id === 'ui-slide-in')?.answer;
  assert.ok(answer, 'the recorded model answer is required');
  const item = FRONTIER_ITEMS.find((candidate) => candidate.id === 'ui-slide-in');
  const result = scoreFrontierItem(item, answer);
  assert.equal(result.outcome, 'checked', result.detail ?? 'the answer must run');
  assert.equal(result.checks.find((check) => check.id === 'tween-runs-on-click')?.pass, true,
    'UDim2 subtraction is valid Roblox arithmetic and must reach TweenService:Create');
});

test('UDim2 addition and subtraction preserve each scale and offset component', () => {
  const result = runUnderHarness(`
local a = UDim2.new(0.5, 12, 0.75, 30)
local b = UDim2.new(0.25, 4, 0.5, 10)
local sum, difference = a + b, a - b
__APPLE.fact("sum", {sum.X.Scale, sum.X.Offset, sum.Y.Scale, sum.Y.Offset})
__APPLE.fact("difference", {difference.Width.Scale, difference.Width.Offset, difference.Height.Scale, difference.Height.Offset})
`, '', 'script');
  assert.equal(result.ran, true, result.reason);
  assert.equal(result.compiled, true, result.detail);
  assert.deepEqual(result.trace.facts.sum, [0.75, 16, 1.25, 40]);
  assert.deepEqual(result.trace.facts.difference, [0.25, 8, 0.25, 20]);
});

test('a platform may move along the documented CFrame.RightVector', () => {
  const item = FRONTIER_ITEMS.find((candidate) => candidate.id === 'platform-mover');
  const answer = `\`\`\`luau
local platform = workspace:WaitForChild("Platform")
local origin = platform.CFrame
local sideways = origin.RightVector * 8
platform.CFrame = origin + sideways
platform.CFrame = origin
\`\`\``;
  const result = scoreFrontierItem(item, answer);
  assert.equal(result.outcome, 'checked', result.detail ?? 'RightVector is a Vector3 in Roblox');
  assert.equal(result.checks.find((check) => check.id === 'actually-moves-it')?.pass, true);
});

test('a buyer who already owns the sword does not mask the affordability check', () => {
  const run = JSON.parse(readFileSync(resolve(HERE, '../runs/roblox-frontier-apple-max-agent-house-rules-plus-library-ui-20260925-rep13.json'), 'utf8'));
  const answer = run.rows.find((row) => row.id === 'shop-debit')?.answer;
  assert.ok(answer, 'the recorded, real model answer is required');
  const item = FRONTIER_ITEMS.find((candidate) => candidate.id === 'shop-debit');
  const result = scoreFrontierItem(item, answer);
  assert.equal(result.outcome, 'checked', result.detail ?? 'the candidate must run');
  assert.equal(result.checks.find((check) => check.id === 'refuses-when-unaffordable')?.pass, true,
    'a separate buyer with 50 coins must test affordability without the first buyer owning a sword');
});

test('the shop fixture stocks the sword before judging a safe purchase', () => {
  const run = JSON.parse(readFileSync(resolve(HERE, '../runs/roblox-frontier-apple-max-agent-house-rules-plus-library-ui-20260925-rep15.json'), 'utf8'));
  const answer = run.rows.find((row) => row.id === 'shop-debit')?.answer;
  assert.ok(answer, 'the recorded, real model answer is required');
  const item = FRONTIER_ITEMS.find((candidate) => candidate.id === 'shop-debit');
  const result = scoreFrontierItem(item, answer);
  assert.equal(result.outcome, 'checked', result.detail ?? 'the candidate must run');
  assert.equal(result.checks.find((check) => check.id === 'legit-purchase-works')?.pass, true,
    'the fixture has no sword to deliver, so a safe handler refunds an otherwise valid purchase');
});

test('task.spawn returns a thread for a shutdown save to await', () => {
  const run = JSON.parse(readFileSync(resolve(HERE, '../runs/roblox-frontier-apple-max-agent-house-rules-plus-library-ui-20260925-rep14.json'), 'utf8'));
  const answer = run.rows.find((row) => row.id === 'shutdown-save')?.answer;
  assert.ok(answer, 'the recorded, real model answer is required');
  const item = FRONTIER_ITEMS.find((candidate) => candidate.id === 'shutdown-save');
  const result = scoreFrontierItem(item, answer);
  assert.equal(result.outcome, 'checked', result.detail ?? 'the candidate must run');
  assert.equal(result.checks.find((check) => check.id === 'shutdown-saves-everyone')?.pass, true);
  assert.equal(result.checks.find((check) => check.id === 'shutdown-path-does-not-throw')?.pass, true);
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

  //[[ THE AUDIT SECTION 8.8 NAMED: A CHECK MAY PASS ONLY BECAUSE IT WAS WRITTEN BESIDE ITS CONTROL.
  //   Rule 2 above proves every check CAN fail. Nothing proved a check can pass against anything
  //   other than the one answer written in the same file, by the same hand, on the same afternoon.
  //   `reported-total-is-real` failed that way -- it could only pass against a bare-number store --
  //   and `refuses-when-unaffordable` failed the same way for a capitalisation. Both were found by
  //   a check failing in EVERY recorded sample, which is late and lucky.
  //   `pass2`, where an item has one, is an independently written correct answer that disagrees with
  //   `pass` everywhere the prompt leaves free. It is optional; adding one to an item is how this
  //   audit advances, and the run below reports the coverage rather than implying it.
  if (control.pass2) {
    test(`${item.id}: a SECOND, independently written correct answer also passes every check`, () => {
      const result = scoreFrontierItem(item, fence(control.pass2));
      assert.equal(result.outcome, 'checked',
        `second pass control did not run: ${result.outcome} - ${result.detail ?? ''} ${result.probeError ?? ''}`);
      const bad = result.checks.filter((c) => c.pass !== true);
      assert.deepEqual(bad.map((c) => `${c.id}=${c.pass}`), [],
        `TUNED TO ONE IMPLEMENTATION: ${bad.map((c) => `${c.id} (${c.why})`).join('; ')}. The first `
        + 'pass control passes this check and a second correct answer does not, so the check is '
        + 'describing how the first one was written rather than the property it claims to measure.');
    });
  }

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

//[[ THE DOCUMENT CLAIMS THE MAX NUMBER IS THE APPLE NUMBER. THIS IS WHAT THAT CLAIM RESTS ON.
//
//   docs/frontier-for-roblox.md §6 and §8.8 both said "nothing here supports or refutes a claim
//   about MAX", because every arm ran the `apple` lane. §10 retires that, without a single neuron,
//   on one fact: in AGENT mode the two lanes send the SAME REQUEST. The bench posts
//   `{ model: settings.gateway, prompt, system, maxTokens: settings.requestedTokens }`, and for
//   agent mode all four fields are equal across the lanes. `lane` and `productMode` differ and are
//   not sent.
//
//   IF THIS GOES RED, THE FIX IS NOT TO PUT THE LANES BACK. Differentiating them is a legitimate
//   product change. What must happen is that §10's claim is retracted and the MAX lane is measured
//   on its own — which is exactly what this guard exists to force rather than let drift silently.
//
//[[ 2026-09-22 — THE LANE STOPPED ROUTING, SO THE PLACE THE LANES DIFFER MOVED, AND IT IS NAMED.
//
//   This test used to end with `--mode super-agent` resolving to `rune`: the one mode where the
//   paid lane reached a different gateway, kept as the named exception so it could not be mistaken
//   for coverage. Super Agent is retired and `gatewayModelFor` now voids its `productModel`
//   argument for EVERY mode, so the gateway can no longer be what separates the lanes. That makes
//   §10's claim stronger rather than weaker, and the stronger form is what is asserted below.
//
//   What survives is the entitlement floor, and it is visible in exactly one place. Agent's `high`
//   baseline already exceeds the free lane's `low` floor, so both lanes ask for the same room. Plan's
//   `low` baseline does not, so apple-max raises it to `high` and the two lanes send a DIFFERENT
//   `maxTokens` — with the same gateway, the same model and the same ceiling. Naming that here is
//   what stops a later reader concluding the lanes are interchangeable in every mode, which §10 does
//   not claim and this page must not imply. ]]
test('the MAX Agent lane and the Apple Agent lane send a byte-identical request, which is what §10 rests on', () => {
  const arm = ARMS['house-rules-plus'];
  const body = (lane, mode) => {
    const s = resolveSettings({ lane, mode });
    return JSON.stringify({ model: s.gateway, prompt: 'PROMPT', system: arm.system, maxTokens: s.requestedTokens });
  };
  assert.equal(body('apple', 'agent'), body('apple-max', 'agent'),
    'apple and apple-max no longer resolve to the same request in Agent mode. docs/frontier-for-roblox.md '
    + '§10 says the 87.5% covers MAX because the request is identical; that claim is now false and '
    + 'must be retracted or re-measured on the MAX lane.');

  // The lane is no longer an input to the routing decision at all, in either mode.
  for (const mode of PRODUCT_MODES) {
    assert.equal(resolveSettings({ lane: 'apple', mode }).gateway,
      resolveSettings({ lane: 'apple-max', mode }).gateway,
      `${mode}: the lane still changes the gateway, so §10 must be re-derived`);
  }

  // The difference that survives, located precisely. Plan is where it is visible, and it is the
  // requested budget alone.
  const freePlan = resolveSettings({ lane: 'apple', mode: 'plan' });
  const paidPlan = resolveSettings({ lane: 'apple-max', mode: 'plan' });
  assert.equal(freePlan.gateway, paidPlan.gateway, 'the gateway is no longer what differs');
  assert.equal(freePlan.modelId, paidPlan.modelId, 'and neither is the model');
  assert.equal(freePlan.gatewayCeiling, paidPlan.gatewayCeiling, 'and neither is the ceiling');
  assert.equal(freePlan.effort, 'low');
  assert.equal(paidPlan.effort, 'high');
  assert.notEqual(freePlan.requestedTokens, paidPlan.requestedTokens,
    'the entitlement floor no longer reaches the request in Plan mode. If the lanes are truly '
    + 'interchangeable in every mode, docs/frontier-for-roblox.md §10 should say that about Plan too '
    + '— it currently says it only about Agent, and this guard is what keeps that honest.');
  assert.notEqual(body('apple', 'plan'), body('apple-max', 'plan'),
    'Plan is the mode where the two lanes are NOT the same request');

  // Non-vacuity for the re-aim: the mode that used to carry the exception is gone, so a reader
  // cannot find the old difference by looking for it.
  assert.deepEqual([...PRODUCT_MODES], ['plan', 'agent'], 'the product offers exactly two modes');
  assert.throws(() => resolveMode('super-agent'), /is retired/,
    'Super Agent is back — §10 and the mode contract both need re-reading');
});

//[[ A RE-SCORED RUN MUST NOT CARRY A HASH OF THE FILE THAT JUDGED THE VERSION BEFORE IT.
//   rescore-roblox-frontier.mjs re-judges saved answers with no model call, and it spreads the old
//   provenance block before overwriting the hashes it knows about. It knew about two. The bench
//   writes five, and one of the three it did not re-take is roblox-frontier-tasks.mjs, where the
//   probes live -- so a probe correction plus a re-score produced a run file whose `tasks` hash
//   named the probe that did NOT judge it. This is read off both sources rather than remembered,
//   because the failure mode is the bench growing a sixth hash and nobody telling the rescorer.
test('the rescorer re-takes every provenance hash the bench writes', () => {
  const bench = readFileSync(resolve(HERE, 'roblox-frontier-bench.mjs'), 'utf8');
  const rescore = readFileSync(resolve(HERE, 'rescore-roblox-frontier.mjs'), 'utf8');
  const block = /const provenance = \{([\s\S]*?)\n\};/.exec(bench);
  assert.ok(block, 'could not find the bench provenance block — this test is reading the wrong thing');
  const keys = [...block[1].matchAll(/^\s*([A-Za-z][\w]*)\s*:/gm)].map((m) => m[1]);
  assert.ok(keys.length >= 2, `parsed ${keys.length} provenance keys out of the bench; the parse is broken, not the code`);
  const written = /run\.provenance = \{([\s\S]*?)\n\};/.exec(rescore);
  assert.ok(written, 'could not find the rescorer provenance assignment');
  const missing = keys.filter((k) => !new RegExp(`^\\s*${k}\\s*:`, 'm').test(written[1]));
  assert.deepEqual(missing, [],
    `the bench records ${missing.join(', ')} and the rescorer does not re-take it, so a re-scored `
    + 'run keeps the hash of the file version that did not judge it.');
});

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
  // The one other difference is production's own UI rule (D-UIONLY-1), swapped in whole.
  assert.ok(baseRules.endsWith(UI_RULE_BEFORE), 'the control must still carry its historical UI line');
  const control = baseRules.replace(UI_RULE_BEFORE, UI_RULE_D_UIONLY_1);
  assert.ok(plusRules.startsWith(control), 'the plus arm must OPEN with its control (UI rule swapped), byte for byte');

  const added = plusRules.slice(control.length);
  // D-FXLIB-1 entered production after the four-rule intervention was designed. It is part of
  // today's production prompt, so the verbatim mirror above covers it, but it is not evidence
  // for any of the four game-logic checks this test attributes to the intervention.
  assert.ok(added.startsWith('\n- Sounds and particle effects come ONLY from the stored library'));
  const intervention = added.slice(added.indexOf('\n- Player-authored text'));
  assert.ok(intervention.startsWith('\n- Player-authored text'));
  const bullets = intervention.split('\n').filter((l) => l.startsWith('- '));
  assert.equal(bullets.length, 4, 'four rules were added for four permanently-failing checks; a fifth has no check behind it');
  // Each added rule names the API or the hazard of the check it was written for. A rule with no
  // failing check behind it is a rule nobody can attribute a gain to.
  for (const needle of ['FilterStringAsync', 'retry', 'UpdateAsync', 'failed load']) {
    assert.ok(intervention.includes(needle), `the added block does not mention "${needle}", so one failing check has no rule`);
  }
  // And it must NOT quietly address shop-debit, whose failure is a string-matching artefact of the
  // probe rather than a Roblox lapse. A rule about that would measure the benchmark's phrasing.
  assert.ok(!/case|lower|upper|spelling/i.test(intervention), 'the added block addresses shop-debit, which is a phrasing artefact and not a Roblox failure');
});

//[[ THE RE-AIM OF `reported-total-is-real` MUST NOT HAVE LET ANYTHING NEW THROUGH.
//
//   That check used to read `Number(call2) === Number(stored)` and could only pass against a model
//   storing a bare number; every one of the eight recorded samples stored a profile table and
//   failed on the schema rather than on the arithmetic. It now asks whether the reported total is
//   among the numbers ACTUALLY WRITTEN. The item's own fail control (returns `amount`, not the
//   total) still covers the lying case and is exercised above. The case the old comparison caught
//   by accident — banking nothing and counting in memory, where `stored` is nil — is NOT covered by
//   that control, so it is written out here. A no-weakening claim that nobody executed is an
//   assertion.
test('reported-total-is-real still fails an answer that banks nothing and counts in memory', () => {
  const item = FRONTIER_ITEMS.find((i) => i.id === 'atomic-add');
  const inMemory = fence(`
local module = {}
local totals = {}
function module.addCoins(userId, amount)
\tlocal key = "Player_" .. tostring(userId)
\ttotals[key] = (totals[key] or 0) + amount
\treturn totals[key]
end
return module
`);
  const scored = scoreFrontierItem(item, inMemory);
  assert.equal(scored.outcome, 'checked', `the control did not run: ${scored.detail ?? ''}`);
  // It reports the right arithmetic, so it must be the STORE that refuses it.
  const byId = Object.fromEntries(scored.checks.map((c) => [c.id, c.pass]));
  assert.equal(byId['concurrent-adds-both-land'], true, 'the in-memory control must get the arithmetic right, or it is not testing the store');
  assert.equal(
    byId['reported-total-is-real'], false,
    'a module that never wrote to the DataStore passed `reported-total-is-real`. The re-aim let '
    + 'through the one case the old comparison caught, and the check no longer observes the store.',
  );
});

//[[ AND THE TABLE CASE — THE ONE THE RE-AIM EXISTS TO ADMIT — MUST ACTUALLY BE ADMITTED.
//   Otherwise the change is inert and eight samples would still be failing on their schema.
test('reported-total-is-real accepts a correct answer that stores a profile table', () => {
  const item = FRONTIER_ITEMS.find((i) => i.id === 'atomic-add');
  const profileTable = fence(`
local DataStoreService = game:GetService("DataStoreService")
local store = DataStoreService:GetDataStore("PlayerData")
local module = {}
function module.addCoins(userId, amount)
\tlocal key = "Player_" .. tostring(userId)
\tlocal data = store:UpdateAsync(key, function(old)
\t\told = old or {}
\t\told.Coins = (old.Coins or 0) + amount
\t\treturn old
\tend)
\treturn data.Coins
end
return module
`);
  const scored = scoreFrontierItem(item, profileTable);
  assert.equal(scored.outcome, 'checked', `the control did not run: ${scored.detail ?? ''}`);
  const byId = Object.fromEntries(scored.checks.map((c) => [c.id, c.pass]));
  assert.equal(byId['reported-total-is-real'], true, 'a correct answer that stores {Coins = n} is still being failed on its schema');
});
