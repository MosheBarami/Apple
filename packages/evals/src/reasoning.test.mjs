// Tests for the adaptive reasoning policy in apps/worker/src/reasoning.ts.
//
// This policy decides how much every agent step spends and how good its judgement is, so the rules
// that matter are pinned here rather than left to inspection. The module is TypeScript in the
// worker; it is transpiled on the fly so there is no build step and no duplicated copy to drift.
//
// Run: node --test packages/evals/src/reasoning.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SRC = new URL('../../../apps/worker/src/reasoning.ts', import.meta.url).pathname;
const out = join(mkdtempSync(join(tmpdir(), 'golem-reasoning-')), 'reasoning.mjs');
execFileSync('npx', ['esbuild', SRC, '--format=esm', '--outfile=' + out], { stdio: 'pipe' });
const { chooseEffort, classifyRequest, tokensForEffort, higher, MAX_HIGH_EFFORT_STEPS } = await import(out);

/** A step with no escalation signals set. */
const base = (mode, over = {}) => ({ mode, step: 1, highEffortUsed: 0, ...over });

test('medium is never selected, on any combination of signals', () => {
  // `medium` costs 3-6x `low` and returned ZERO output on two of three task types when measured
  // against the live service. No path may reach it. See the table in reasoning.ts.
  const flags = ['priorStepFailed', 'visualDefectsFound', 'visualDesignTask', 'multiSystemTask', 'ambiguousRequest', 'irreversibleChange'];
  for (const mode of ['clay', 'stone', 'rune']) {
    for (let mask = 0; mask < 1 << flags.length; mask++) {
      const over = {};
      flags.forEach((f, i) => {
        if (mask & (1 << i)) over[f] = true;
      });
      for (const used of [0, MAX_HIGH_EFFORT_STEPS]) {
        const { effort } = chooseEffort(base(mode, { ...over, highEffortUsed: used }));
        assert.notEqual(effort, 'medium', `mode=${mode} flags=${JSON.stringify(over)} used=${used} chose medium`);
      }
    }
  }
});

test('baselines: Clay is cheap, Stone and Rune think', () => {
  assert.equal(chooseEffort(base('clay')).effort, 'low');
  assert.equal(chooseEffort(base('stone')).effort, 'high');
  assert.equal(chooseEffort(base('rune')).effort, 'high');
});

test('a failed step escalates Clay, because repeating cheap thinking will not fix it', () => {
  assert.equal(chooseEffort(base('clay')).effort, 'low');
  const r = chooseEffort(base('clay', { priorStepFailed: true }));
  assert.equal(r.effort, 'high');
  assert.match(r.reason, /recovering from a failed step/);
});

test("observed visual defects escalate — the model's own judgement was wrong", () => {
  const r = chooseEffort(base('clay', { visualDefectsFound: true }));
  assert.equal(r.effort, 'high');
  assert.match(r.reason, /visual defects/);
});

test('an irreversible change gets its careful think before it happens', () => {
  assert.equal(chooseEffort(base('clay', { irreversibleChange: true })).effort, 'high');
});

test('the high-effort budget falls back to low, never to medium', () => {
  const spent = chooseEffort(base('stone', { highEffortUsed: MAX_HIGH_EFFORT_STEPS }));
  assert.equal(spent.effort, 'low');
  assert.match(spent.reason, /high-effort budget spent/);
  // one step below the cap still gets the expensive tier
  assert.equal(chooseEffort(base('stone', { highEffortUsed: MAX_HIGH_EFFORT_STEPS - 1 })).effort, 'high');
});

test('the reason string records the baseline and every escalation applied', () => {
  const r = chooseEffort(base('clay', { visualDesignTask: true, multiSystemTask: true }));
  assert.match(r.reason, /^clay baseline/);
  assert.match(r.reason, /visual or spatial design work/);
});

test('classifyRequest recognises design work', () => {
  for (const q of ['build me a medieval plaza', 'make the lobby look better', 'add lighting to the arena']) {
    assert.equal(classifyRequest(q).visualDesignTask, true, q);
  }
  assert.equal(classifyRequest('what does task.wait do in Luau, precisely?').visualDesignTask, false);
});

test('classifyRequest recognises multi-system work', () => {
  assert.equal(classifyRequest('wire the leaderboard up to a datastore and replicate it').multiSystemTask, true);
});

test('classifyRequest treats vague and very short requests as ambiguous', () => {
  assert.equal(classifyRequest('make it better').ambiguousRequest, true);
  assert.equal(classifyRequest('surprise me').ambiguousRequest, true);
  assert.equal(classifyRequest('hi').ambiguousRequest, true);
  assert.equal(classifyRequest('Explain why my RemoteEvent handler receives nil for the second argument').ambiguousRequest, false);
});

test('token budgets: high gets modest headroom, low is unchanged', () => {
  // measured: high produced 882 output tokens against low's 858 on the same prompt, so a large
  // multiplier would only over-reserve budget
  assert.equal(tokensForEffort(2400, 'low'), 2400);
  assert.equal(tokensForEffort(2400, 'high'), 3000);
  // medium is scaled generously only as a safety net for an explicit caller; it is never selected
  assert.ok(tokensForEffort(2400, 'medium') > tokensForEffort(2400, 'high'));
});

test('higher() picks the more expensive tier', () => {
  assert.equal(higher('low', 'high'), 'high');
  assert.equal(higher('high', 'low'), 'high');
  assert.equal(higher('low', 'low'), 'low');
});

test('an escalated Clay step still respects the high-effort budget', () => {
  assert.equal(chooseEffort(base('clay', { priorStepFailed: true, highEffortUsed: MAX_HIGH_EFFORT_STEPS })).effort, 'low');
});
