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

// esbuild is resolved from the workspace that DECLARES it, and `--main-fields` is explicit.
//
// Both were latent: `npx esbuild` fell through to fetching esbuild from the registry when the
// cwd was a package that does not declare it, and `--platform=neutral` defaults `mainFields` to
// EMPTY, so a workspace package whose entry comes from `main` cannot be resolved at all. Neither
// showed until this bundle gained its first cross-package import. A test whose pass depends on a
// package it does not declare being downloadable is a test that reports the network.
const ESBUILD = new URL('../../../apps/worker/node_modules/.bin/esbuild', import.meta.url).pathname;

const SRC = new URL('../../../apps/worker/src/reasoning.ts', import.meta.url).pathname;
const out = join(mkdtempSync(join(tmpdir(), 'golem-reasoning-')), 'reasoning.mjs');
// `--bundle` and the explicit `--main-fields`: reasoning.ts gained its first VALUE import from
// @golem/shared (the product-mode display names, so the effort explanation shown to a person stops
// saying "clay"). Transpile-only left that import unresolved at run time. `--platform=neutral`
// defaults mainFields to EMPTY, so a workspace package whose entry comes from `main` cannot be
// resolved without naming them — the same trap the comment above records.
execFileSync(
  ESBUILD,
  [SRC, '--bundle', '--format=esm', '--platform=neutral', '--main-fields=main,module', '--target=es2022', '--outfile=' + out],
  { stdio: 'pipe', cwd: new URL('../../../apps/worker/', import.meta.url).pathname },
);
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
  // This pinned `/^clay baseline/` — the INTERNAL specialist spelling. The string is rendered to a
  // person, so the guard was holding the product to Golem-era vocabulary: renaming it correctly
  // turned this red. Re-aimed at what the test actually meant — that the reason opens with the
  // mode's baseline and then lists each escalation.
  const r = chooseEffort(base('clay', { visualDesignTask: true, multiSystemTask: true }));
  assert.match(r.reason, /^Plan baseline/);
  assert.match(r.reason, /visual or spatial design work/);
  // NOT `multiple interacting systems`: `raise()` records a reason only when it actually raises the
  // tier, and the visual signal had already reached `high`. The list is escalations APPLIED, not
  // signals present — asserting otherwise would pin a behaviour the policy does not have.
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
  // A terse BUILD ask is still ambiguous — this is the case the signal exists for.
  assert.equal(classifyRequest('a door').ambiguousRequest, true);
  assert.equal(classifyRequest('Explain why my RemoteEvent handler receives nil for the second argument').ambiguousRequest, false);
});

test("'hi' is conversation, not an under-specified build request", () => {
  // It used to be ambiguous purely because it is under 25 characters, which escalated a greeting
  // to high effort, snapshotted the user's place and ended in an apology for not building
  // anything. Short is not the same as under-specified.
  const t = classifyRequest('hi');
  assert.equal(t.conversational, true);
  assert.equal(t.ambiguousRequest, false);
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

/* ------------------------------------------------- the entitlement floor ---- */
//
// Apple MAX reached gatewayModelFor, maxStepsFor and baseTokensFor in do/session.ts and stopped
// there. It never reached this policy, so the thing a person buys when they pick MAX — a better
// answer — was the one thing selecting it could not change. The combination a new paying customer
// is most likely to try first, MAX in Plan mode, asked the bigger model to think at `low`.
//
// These tests are written so that deleting the floor turns them red, and so that they name the
// user-visible combination rather than the internal specialist.

test('Apple MAX in Plan mode does not think at low — the combination the owner hit', () => {
  // Plan is `clay`, whose baseline is deliberately `low` for lookups.
  assert.equal(chooseEffort(base('clay')).effort, 'low', 'precondition: clay still baselines low');
  assert.equal(chooseEffort(base('clay', { productModel: 'apple-max' })).effort, 'high');
});

test('the floor is a floor, not an override: free Apple keeps the adaptive policy', () => {
  assert.equal(chooseEffort(base('clay', { productModel: 'apple' })).effort, 'low');
  assert.equal(chooseEffort(base('stone', { productModel: 'apple' })).effort, 'high');
  // and an unset entitlement behaves exactly as it did before the floor existed
  assert.equal(chooseEffort(base('clay')).effort, 'low');
  assert.equal(chooseEffort(base('stone')).effort, 'high');
});

test('a greeting still costs low on MAX — the entitlement is not a reason to deliberate', () => {
  const talk = base('clay', { productModel: 'apple-max', conversational: true });
  assert.equal(chooseEffort(talk).effort, 'low');
});

test('the late half of a long MAX run is not the cheap half', () => {
  // A 16-step Agent run: without the exemption, steps past the cap fall back to `low`, so the
  // longest and usually hardest half of a paid run would be the half that stopped thinking.
  const spent = { highEffortUsed: MAX_HIGH_EFFORT_STEPS, step: MAX_HIGH_EFFORT_STEPS + 1 };
  assert.equal(chooseEffort(base('stone', spent)).effort, 'low', 'precondition: the cap still bites without MAX');
  assert.equal(chooseEffort(base('stone', { ...spent, productModel: 'apple-max' })).effort, 'high');
});

test('the reason string names the floor, so the admin trace says why', () => {
  const choice = chooseEffort(base('clay', { productModel: 'apple-max' }));
  assert.match(choice.reason, /Apple MAX floor/);
});

/* ------------------------------------ the approval that switched thinking off ---- */
//
// classifyRequest runs ONCE in startRun and its verdict is spread into every later step. That is
// correct for "hi" and wrong for "ok": an approval is how a person ACCEPTS a plan, so the run that
// follows it is a build — and it was pinned to `low` for all sixteen steps by a verdict about a
// two-letter message, with the early return firing before the entitlement floor so Apple MAX could
// not lift it either.

test('"ok" is still talk when nothing has happened yet', () => {
  const traits = classifyRequest('ok');
  assert.equal(traits.conversational, true, 'precondition: a bare approval classifies as talk');
  assert.equal(chooseEffort(base('stone', { ...traits, step: 1 })).effort, 'low');
});

test('a bare approval classifies as talk however it is spelled', () => {
  // This tested the Hebrew approvals, added because the owner wrote in Hebrew. The language was
  // removed from the product on 2026-09-20 — a Hebrew prompt was measured losing a word silently on
  // the way in — so the fixtures are English. The property is the one that mattered and is
  // unchanged: a bare approval is talk, and the run that FOLLOWS it is not (see the tests below).
  for (const word of ['ok', 'okay', 'sure', 'great', 'thanks', 'cool']) {
    assert.equal(classifyRequest(word).conversational, true, `${word} should classify as talk`);
  }
});

test('an approval that turned into a build stops being talk — step 2 onward', () => {
  const traits = classifyRequest('ok');
  assert.equal(chooseEffort(base('stone', { ...traits, step: 2 })).effort, 'high');
});

test('an approval that already changed the project stops being talk immediately', () => {
  const traits = classifyRequest('ok');
  assert.equal(chooseEffort(base('stone', { ...traits, step: 1, mutated: true })).effort, 'high');
});

test('the MAX floor survives an approval, which is the case the owner paid for', () => {
  const traits = classifyRequest('ok');
  const run = base('clay', { ...traits, step: 2, productModel: 'apple-max' });
  assert.equal(chooseEffort(run).effort, 'high');
});

test('a real greeting is still cheap, on both tiers — the shortcut was not deleted', () => {
  for (const model of [undefined, 'apple', 'apple-max']) {
    const run = base('stone', { ...classifyRequest('hi'), step: 1, productModel: model });
    assert.equal(chooseEffort(run).effort, 'low', `greeting on ${model ?? 'no entitlement'}`);
  }
});

/* --------------------------------------- the reason string a person reads ---- */

test('the effort explanation speaks product language, not Golem specialist names', () => {
  const reasons = [
    chooseEffort(base('clay')).reason,
    chooseEffort(base('stone')).reason,
    chooseEffort(base('rune')).reason,
    chooseEffort(base('clay', { productModel: 'apple-max' })).reason,
  ].join(' | ');
  for (const dead of ['clay', 'stone', 'rune']) {
    assert.ok(!reasons.includes(dead), `"${dead}" is Golem-era vocabulary and reached the UI: ${reasons}`);
  }
  assert.match(chooseEffort(base('clay')).reason, /Plan baseline/);
  assert.match(chooseEffort(base('stone')).reason, /Agent baseline/);
  assert.match(chooseEffort(base('clay', { productModel: 'apple-max' })).reason, /Apple MAX floor/);
});
