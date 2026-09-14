/**
 * THE METER MAY NOT RESTATE THE ALLOWANCE, MAY NOT MERGE THE TWO BALANCES, AND MAY NOT
 * DRAW AN UNREADABLE QUOTA AS A HEALTHY ONE.
 *
 * The quota reached the browser long before this component existed: `fetchMe` has always
 * returned a full QuotaState and layout.tsx has always fetched it, then read exactly one
 * field — `profile.is_admin`. Every number describing what the user had left was fetched
 * on every page load and discarded, so the only way to learn you were nearly out was to
 * run out. That is what w13 means by "visible before the run, not after".
 *
 * Three properties are load-bearing and each is pinned below:
 *
 *   1. `allowanceTotal` is read from PLAN_LIMITS in @golem/shared — the same table QuotaDO
 *      enforces. The test imports that table rather than repeating its numbers, so a meter
 *      that hard-codes 60 fails here even though 60 is today's correct answer.
 *   2. allowanceRemaining and credits are reported separately. QuotaState's own comment is
 *      the reason: "you have 0 left today" and "you have 0 left at all" are different
 *      sentences with different next actions, and sparksRemaining — their sum — cannot
 *      distinguish them.
 *   3. A quota that could not be read is `unknown`, never good and never bad.
 *
 * KNOWN LIMIT, stated rather than papered over: this exercises the MODEL, which is where
 * every decision lives, and not the rendered component — apps/web has no DOM renderer, so
 * no test in this package mounts anything. That the two bands reach the DOM is not proven
 * here; that the model reports two separate numbers for them is.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'usage-')), 'usage.mjs');
execFileSync(join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [join(WEB, 'src', 'components', 'usage-meter-model.ts'), '--bundle', '--format=esm',
   '--platform=neutral', '--main-fields=main,module', '--outfile=' + out], { stdio: 'pipe' });
const { meterView, resetsIn } = await import(out);

const sharedOut = join(mkdtempSync(join(tmpdir(), 'shared-')), 'shared.mjs');
execFileSync(join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [join(WEB, '..', '..', 'packages', 'shared', 'src', 'index.ts'), '--bundle', '--format=esm',
   '--platform=neutral', '--main-fields=main,module', '--outfile=' + sharedOut], { stdio: 'pipe' });
const { PLAN_LIMITS, PLAN_COPY, SPARKS_PER_BUILD } = await import(sharedOut);

const NOW = Date.UTC(2026, 8, 14, 12, 0, 0);
const quota = (over = {}) => ({
  sparksRemaining: 40, sparksDaily: 60, sparksMonthly: 900,
  sparksUsedToday: 20, sparksUsedThisMonth: 100,
  resetsAtIso: new Date(NOW + 3 * 3600_000).toISOString(),
  plan: 'free', allowanceRemaining: 40, credits: 0, ...over,
});

// --- 1. the allowance is never restated -------------------------------------------------

test('allowanceTotal comes from PLAN_LIMITS, for every plan', () => {
  for (const plan of Object.keys(PLAN_LIMITS)) {
    const v = meterView(quota({ plan, allowanceRemaining: 5 }), NOW);
    assert.equal(v.allowanceTotal, PLAN_LIMITS[plan].sparksPerDay,
      `${plan} must track the enforced table`);
    assert.equal(v.planName, PLAN_COPY[plan].name);
  }
});

test('a plan the client does not know falls back to the wire figure, not to a guess', () => {
  const v = meterView(quota({ plan: 'platinum', sparksDaily: 123, allowanceRemaining: 10 }), NOW);
  assert.equal(v.allowanceTotal, 123);
  assert.equal(v.planName, null, 'it must not invent a name for an unknown plan');
});

// --- 2. two balances, never one ---------------------------------------------------------

test('allowance and credits are reported as separate numbers', () => {
  const v = meterView(quota({ allowanceRemaining: 12, credits: 500 }), NOW);
  assert.equal(v.allowanceRemaining, 12);
  assert.equal(v.credits, 500);
  assert.equal(v.allowanceRemaining + v.credits, 512);
  // the headline is the ALLOWANCE, never the sum — 512 would imply today's budget is 512
  assert.match(v.headline, /\b12\b/);
  assert.doesNotMatch(v.headline, /512/);
});

test('the two kinds of zero are different sentences with different next actions', () => {
  const spentButFunded = meterView(quota({ allowanceRemaining: 0, credits: 300 }), NOW);
  const trulyEmpty = meterView(quota({ allowanceRemaining: 0, credits: 0 }), NOW);

  assert.notEqual(spentButFunded.headline, trulyEmpty.headline);
  assert.equal(spentButFunded.tone, 'warn', 'funded by credits is not a dead stop');
  assert.equal(trulyEmpty.tone, 'bad');
  assert.equal(spentButFunded.nextAction, null, 'nothing is blocked, so nothing is demanded');
  assert.ok(trulyEmpty.nextAction, 'a dead stop must name the next action');
  assert.match(spentButFunded.detail, /300/, 'the purchased balance must still be visible');
});

// --- 3. an unreadable quota is not a healthy one ----------------------------------------

test('a missing or malformed quota is unknown, never good and never bad', () => {
  for (const bad of [undefined, null, {}, 'nope', 42, { allowanceRemaining: 5 }, { credits: 5 }]) {
    const v = meterView(bad, NOW);
    assert.equal(v.tone, 'unknown', `${JSON.stringify(bad)} must be unknown`);
    assert.equal(v.allowanceFraction, 0);
    assert.equal(v.nextAction, null, 'it must not demand an action on a number it cannot read');
    assert.match(v.detail, /display problem|not a charge/i,
      'it must say the balance is unchanged, not imply a spend');
  }
});

// --- the rest ---------------------------------------------------------------------------

test('the bar fills against the plan total and is clamped', () => {
  assert.equal(meterView(quota({ allowanceRemaining: 30, plan: 'free' }), NOW).allowanceFraction, 0.5);
  assert.equal(meterView(quota({ allowanceRemaining: 999, plan: 'free' }), NOW).allowanceFraction, 1,
    'more than the allowance must not overflow the bar');
  assert.equal(meterView(quota({ allowanceRemaining: 0, credits: 0 }), NOW).allowanceFraction, 0);
});

test('running low is warned before it is spent', () => {
  assert.equal(meterView(quota({ allowanceRemaining: 40 }), NOW).tone, 'good');
  assert.equal(meterView(quota({ allowanceRemaining: 5 }), NOW).tone, 'warn', '5 of 60 is low');
  assert.equal(meterView(quota({ allowanceRemaining: 1 }), NOW).tone, 'warn');
});

test('the builds hint is withheld below one whole build rather than shown as zero', () => {
  const under = meterView(quota({ allowanceRemaining: SPARKS_PER_BUILD - 1, credits: 0 }), NOW);
  assert.equal(under.buildsHint, null, '"0 builds" reads as a fault in the account');
  const over = meterView(quota({ allowanceRemaining: SPARKS_PER_BUILD * 3, credits: 0 }), NOW);
  assert.match(over.buildsHint, /3 more builds/);
  const one = meterView(quota({ allowanceRemaining: SPARKS_PER_BUILD, credits: 0 }), NOW);
  assert.match(one.buildsHint, /1 more build\b/, 'singular, not "1 more builds"');
});

test('the builds hint counts purchased credits, because they are spendable too', () => {
  const v = meterView(quota({ allowanceRemaining: 0, credits: SPARKS_PER_BUILD * 2 }), NOW);
  assert.match(v.buildsHint, /2 more builds/);
});

test('the reset is relative, and a past reset is not announced', () => {
  assert.equal(resetsIn(new Date(NOW + 30 * 60_000).toISOString(), NOW), 'resets in 30 min');
  assert.equal(resetsIn(new Date(NOW + 3 * 3600_000).toISOString(), NOW), 'resets in 3h');
  assert.equal(resetsIn(new Date(NOW - 60_000).toISOString(), NOW), null, 'a past reset says nothing');
  assert.equal(resetsIn('not a date', NOW), null);
  assert.equal(resetsIn(undefined, NOW), null);
});

test('negative or fractional balances from the wire are not rendered raw', () => {
  const v = meterView(quota({ allowanceRemaining: -5, credits: 2.7 }), NOW);
  assert.equal(v.allowanceRemaining, 0, 'a negative balance is zero, not "-5 left"');
  assert.equal(v.credits, 2, 'credits floor — never round a balance up');
});
