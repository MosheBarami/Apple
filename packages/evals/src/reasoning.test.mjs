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
// @apple/shared (the product-mode display names, so the effort explanation shown to a person stops
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
  //[[ 2026-10-01: ONE PRODUCT MODE (c839d7af removed Plan/Agent/Autonomous). ProductMode is 'agent' only.
  //   Previously: BOTH PRODUCT MODES, AND THE LIST IS THE PRODUCT'S, NOT A HAND-WRITTEN ONE.
  //   This was `['clay', 'stone', 'rune']` — the retired specialist names. `chooseEffort` keys its
  //   baseline on `ProductMode`, so a retired name reads `BASELINE['clay']` and the policy throws
  //   rather than answering, which is the right failure but a useless test. Autonomous is a BOOLEAN
  //   on Agent, not a third mode, so two is the whole set. ]]
  for (const mode of ['agent']) {
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

test('baseline: the one behaviour thinks without being asked, and talk is the only cheap path', () => {
  //[[ RESTATED 2026-10-01 (c839d7af "one behaviour for every request"). Plan's `low` baseline was removed
  //   by owner decision; BASELINE is now { agent: 'high' }. The surviving properties: the builder
  //   deliberates by default, and the only way to a cheap step with no budget spent is talk. ]]
  assert.equal(chooseEffort(base('agent')).effort, 'high');
  assert.equal(chooseEffort(base('agent', { conversational: true })).effort, 'low');
});

test('a failed step is never cheap: it defeats the talk shortcut', () => {
  // RESTATED 2026-10-01 (c839d7af): there is no cheap Plan baseline to escalate FROM, and `raise()`
  // records a reason only when it lifts the tier, so with a high baseline "recovering from a failed
  // step" is no longer written. The surviving property: a failure is never answered at `low`.
  const r = chooseEffort(base('agent', { conversational: true, priorStepFailed: true }));
  assert.equal(r.effort, 'high');
  assert.ok(!/conversational/.test(r.reason), 'a failed step must not take the talk shortcut');
});

test("observed visual defects and irreversible changes are never cheap", () => {
  // RESTATED 2026-10-01 (c839d7af): baseline is high, so these signals can no longer raise anything
  // and no reason is recorded for them (raise() only records a lift). The property that survives is
  // that no combination of them lands on `low` while budget remains.
  for (const sig of ['visualDefectsFound', 'irreversibleChange']) {
    assert.equal(chooseEffort(base('agent', { [sig]: true, step: 2, conversational: true })).effort, 'high', sig);
    assert.equal(chooseEffort(base('agent', { [sig]: true })).effort, 'high', sig);
  }
});

test('the high-effort budget falls back to low, never to medium', () => {
  const spent = chooseEffort(base('agent', { highEffortUsed: MAX_HIGH_EFFORT_STEPS }));
  assert.equal(spent.effort, 'low');
  assert.match(spent.reason, /high-effort budget spent/);
  // one step below the cap still gets the expensive tier
  assert.equal(chooseEffort(base('agent', { highEffortUsed: MAX_HIGH_EFFORT_STEPS - 1 })).effort, 'high');
});

test('the reason string records the baseline and every escalation applied', () => {
  // RESTATED 2026-10-01 (c839d7af): the reason now opens with the bare word `baseline` (no mode
  // name — there is one mode). The property is unchanged: it opens with the baseline and then lists
  // each escalation APPLIED. With a high baseline, `raise()` records nothing for signals that do
  // not raise the tier, so the escalations are visible only when something lifts a lowered step.
  const r = chooseEffort(base('agent', { visualDesignTask: true, multiSystemTask: true }));
  assert.match(r.reason, /^baseline\b/);
  assert.ok(!/visual or spatial design work|multiple interacting systems/.test(r.reason),
    'a signal that does not raise the tier must not be listed: the list is escalations APPLIED, not present');
  // spent budget lowers a high step, and that is recorded after the baseline
  const spent = chooseEffort(base('agent', { visualDesignTask: true, highEffortUsed: MAX_HIGH_EFFORT_STEPS }));
  assert.match(spent.reason, /^baseline; high-effort budget spent/);
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

test('token budgets: low is unchanged, and high is never given less room than low', () => {
  // RE-AIMED 2026-09-20. This asserted `tokensForEffort(2400, 'high') === 3000` — the 1.25x scale —
  // on the grounds that "high produced 882 output tokens against low's 858 on the same prompt, so a
  // large multiplier would only over-reserve budget".
  //
  // That reasoning was refuted in 600ab00 and the decision genuinely reversed. The measurement was
  // real but taken on a DESIGN PROBE, which answers in prose; it was then generalised into a policy
  // for every prompt, including a build step that has to emit a complete Luau tool call. The tier
  // chosen for the hardest work ended up with the second-smallest budget, and a reasoning model
  // spends its budget on thinking FIRST — so the step that thinks hardest was the one most likely
  // to run out before writing anything. The owner's 16-step tower-defence build died on step 1 of
  // 16 with "the model reached its output limit before finishing this step", 30 Credits charged for
  // nothing usable. `high` now asks 2x the base.
  //
  // So the literal is gone and what remains is the PROPERTY the literal was a stale instance of:
  // low passes through untouched, and high is never rationed below low. The exact ceiling that
  // `high` reaches is asserted on its own terms, against every mode, in
  // apps/worker/tests/effort-output-budget.test.mjs ("high effort asks for at least every model
  // ceiling, in every mode") — pinning a second copy of the number here is what made this test go
  // red for a fix rather than for a regression.
  assert.equal(tokensForEffort(2400, 'low'), 2400, 'low passes the base through unscaled');
  assert.ok(
    tokensForEffort(2400, 'high') > tokensForEffort(2400, 'low'),
    'high must not be rationed below low — the defect 600ab00 fixed',
  );
  // medium is scaled generously only as a safety net for an explicit caller; it is never selected
  assert.ok(tokensForEffort(2400, 'medium') > tokensForEffort(2400, 'high'));
});

test('higher() picks the more expensive tier', () => {
  assert.equal(higher('low', 'high'), 'high');
  assert.equal(higher('high', 'low'), 'high');
  assert.equal(higher('low', 'low'), 'low');
});

test('an escalated step still respects the high-effort budget', () => {
  assert.equal(chooseEffort(base('agent', { priorStepFailed: true, highEffortUsed: MAX_HIGH_EFFORT_STEPS })).effort, 'low');
});

/* ------------------------------------------------- the entitlement floor ---- */
//
// REMOVED BY OWNER DECISION 2026-10-01: 38efea2e "single engine Apple; remove model picker, tiers"
// deleted ENTITLEMENT_FLOOR and the `productModel` signal, and c839d7af removed Plan mode. There is
// no Apple MAX tier to floor and no Plan baseline to lift. What survives is that an unknown
// `productModel` signal changes nothing — the policy no longer reads it.

test('the entitlement floor is gone: productModel does not change the policy', () => {
  for (const pm of [undefined, 'apple', 'apple-max']) {
    assert.equal(chooseEffort(base('agent', { productModel: pm })).effort, 'high');
    assert.equal(chooseEffort(base('agent', { productModel: pm, conversational: true })).effort, 'low');
    assert.equal(chooseEffort(base('agent', { productModel: pm, highEffortUsed: MAX_HIGH_EFFORT_STEPS })).effort, 'low');
    assert.ok(!/MAX floor/.test(chooseEffort(base('agent', { productModel: pm })).reason));
  }
});

test('a greeting still costs low on MAX — the entitlement is not a reason to deliberate', () => {
  const talk = base('plan', { productModel: 'apple-max', conversational: true });
  assert.equal(chooseEffort(talk).effort, 'low');
});

test.skip('the late half of a long MAX run is not the cheap half', { skip: 'removed by owner decision 2026-10-01, 38efea2e: no MAX tier, so the budget cap bites every run (see "the high-effort budget falls back to low")' }, () => {});

test.skip('the reason string names the floor, so the admin trace says why', { skip: 'removed by owner decision 2026-10-01, 38efea2e: ENTITLEMENT_FLOOR deleted; no floor to name' }, () => {});

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
  assert.equal(chooseEffort(base('agent', { ...traits, step: 1 })).effort, 'low');
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
  assert.equal(chooseEffort(base('agent', { ...traits, step: 2 })).effort, 'high');
});

test('an approval that already changed the project stops being talk immediately', () => {
  const traits = classifyRequest('ok');
  assert.equal(chooseEffort(base('agent', { ...traits, step: 1, mutated: true })).effort, 'high');
});

test.skip('the MAX floor survives an approval, which is the case the owner paid for', { skip: 'removed by owner decision 2026-10-01, 38efea2e: no MAX floor; the approval property itself is covered by the two step-2/mutated tests above' }, () => {});

test('a real greeting is still cheap, on both tiers — the shortcut was not deleted', () => {
  for (const model of [undefined, 'apple', 'apple-max']) {
    const run = base('agent', { ...classifyRequest('hi'), step: 1, productModel: model });
    assert.equal(chooseEffort(run).effort, 'low', `greeting on ${model ?? 'no entitlement'}`);
  }
});

/* --------------------------------------- the reason string a person reads ---- */

test('the effort explanation speaks product language, not Golem specialist names', () => {
  const reasons = [
    chooseEffort(base('agent')).reason,
    chooseEffort(base('agent', { conversational: true })).reason,
    chooseEffort(base('agent', { priorStepFailed: true, highEffortUsed: MAX_HIGH_EFFORT_STEPS })).reason,
  ].join(' | ');
  // RESTATED 2026-10-01 (c839d7af, 38efea2e): the property is unchanged — no internal name reaches a
  // person. Plan/MAX fixtures are gone with the modes; the reason now reads `baseline`.
  for (const dead of ['clay', 'stone', 'rune', 'super-agent', 'super agent']) {
    assert.ok(!reasons.includes(dead), `"${dead}" is Golem-era vocabulary and reached the UI: ${reasons}`);
  }
  assert.match(chooseEffort(base('agent')).reason, /^baseline/);
  assert.match(chooseEffort(base('agent', { conversational: true })).reason, /conversational/);
});
