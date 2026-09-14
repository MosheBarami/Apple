// The checker that asks whether the offer holds together.
//
// A plan is four numbers that must agree with each other and with the machine underneath: what it
// charges, what it grants, what that grant costs to serve, and what the service can deliver in a
// day. Nothing checked any of those relationships before, so all four drifted independently — and
// three of them had.
//
// The relationships are computed here from the same shared tables the product enforces, rather than
// asserted against literals. A test that restated "60" would pass forever after someone changed the
// allowance to 6, which is the drift the checker exists to catch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PLAN_COPY, PLAN_IDS, PLAN_LIMITS, SPARKS_PER_BUILD, buildsPerDay, buildsPerMonth } from '../packages/shared/src/index.ts';
import { DAILY_NEURON_CEILING, NEURONS_PER_SPARK, USD_PER_NEURON } from '../apps/worker/src/pricing.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const run = () => {
  const p = spawnSync('node', [join(ROOT, 'scripts', 'check-offer.mjs')], { cwd: ROOT, encoding: 'utf8', timeout: 120_000 });
  return { exit: p.status, out: `${p.stdout ?? ''}${p.stderr ?? ''}` };
};

/* ----------------------------------------------------------- the checker runs --- */

test('the checker reaches a verdict on the real repository', () => {
  // Exit 0 or 1, never 2 — the second means it fell over rather than judged.
  const r = run();
  assert.ok(r.exit === 0 || r.exit === 1, `unexpected exit ${r.exit}:\n${r.out}`);
  assert.match(r.out, /OFFER (COHERENT|INCOHERENT)/);
});

test('it prints a real denominator first', () => {
  const p = spawnSync('node', [join(ROOT, 'scripts', 'check-offer.mjs')], { cwd: ROOT, encoding: 'utf8', timeout: 120_000 });
  const first = p.stdout.split('\n')[0];
  assert.match(first, /^DENOMINATOR \d+ files; EXCEPTIONS \d+:/);
  assert.ok(Number(/DENOMINATOR (\d+)/.exec(first)[1]) > 50, 'a token denominator would let it report clean without looking');
});

/* ------------------------------------------------ the relationships it measures --- */

test('a free tier that cannot finish one build is a broken offer, and this one is', () => {
  // Computed, not restated: if the allowance is raised past one build this assertion flips, and it
  // should — the point is the RELATIONSHIP, not today's number.
  const affords = Math.floor(PLAN_LIMITS.free.sparksPerDay / SPARKS_PER_BUILD);
  assert.equal(affords, buildsPerDay('free'), 'the helper and the arithmetic must agree');

  const r = run();
  if (affords === 0) {
    assert.equal(r.exit, 1, 'a free tier affording zero builds must fail the check');
    assert.match(r.out, /the free plan grants \d+ Sparks\/day and one quality-gated build costs \d+/);
  } else {
    assert.doesNotMatch(r.out, /the free plan grants/, 'a sufficient free tier must not be reported');
  }
});

test('a plan promising more per day than the service can serve is reported', () => {
  // The ceiling is the WHOLE SERVICE's, so this is not a pricing mistake — it is a promise that
  // fails the moment one subscriber uses what they bought.
  const ceiling = Math.floor(DAILY_NEURON_CEILING / NEURONS_PER_SPARK);
  const over = PLAN_IDS.filter((id) => PLAN_LIMITS[id].sparksPerDay > ceiling);
  const r = run();
  for (const id of over) {
    assert.match(r.out, new RegExp(`BROKEN: ${id} grants ${PLAN_LIMITS[id].sparksPerDay} Sparks/day`));
  }
  if (over.length) assert.equal(r.exit, 1);
});

test('a priced plan below its margin floor is reported, and the priced plans today are above it', () => {
  const usdPerSpark = NEURONS_PER_SPARK * USD_PER_NEURON;
  for (const id of PLAN_IDS) {
    const price = PLAN_COPY[id].priceUsdMonthly;
    if (price === null || price === 0) continue;
    const floor = PLAN_LIMITS[id].sparksPerMonth * usdPerSpark * 1.4;
    assert.ok(price > floor, `${id} charges $${price} against a $${floor.toFixed(2)} floor`);
  }
});

test('the free plan is exempt from the margin rule, and only from that rule', () => {
  // A margin rule including a $0 plan would make any free tier arithmetically impossible, which is
  // a rule about nothing. The free tier is still held to the one-complete-build rule.
  const r = run();
  assert.doesNotMatch(r.out, /BROKEN: free charges/);
});

test('an unpriced plan is noted rather than judged', () => {
  const r = run();
  const unpriced = PLAN_IDS.filter((id) => PLAN_COPY[id].priceUsdMonthly === null);
  for (const id of unpriced) assert.match(r.out, new RegExp(`${id}: no price`));
});

/* ------------------------------------------------- the terms it refuses to ship --- */

test('the contractual promises a subscription product cannot make are gone', () => {
  // "$0 forever" and "no card required, ever" are terms, not descriptions. §12.5 puts terms in the
  // owner's hands, and this product now has subscriptions.
  const r = run();
  for (const phrase of ['\\$0 forever', 'No card required, ever', 'never be charged']) {
    assert.doesNotMatch(r.out, new RegExp(`promises "${phrase}"`, 'i'));
  }
});

/* ------------------------------------------------------- the helpers are honest --- */

test('builds-per-month floors rather than rounds', () => {
  // A rounded-up figure is a promise the allowance cannot keep: 6,000 Sparks at 77 each is 77
  // builds and a remainder, not 78.
  for (const id of PLAN_IDS) {
    const exact = PLAN_LIMITS[id].sparksPerMonth / SPARKS_PER_BUILD;
    assert.equal(buildsPerMonth(id), Math.floor(exact));
    assert.ok(buildsPerMonth(id) * SPARKS_PER_BUILD <= PLAN_LIMITS[id].sparksPerMonth, `${id} promises more builds than it grants`);
  }
});

test('every plan in the ladder has copy, and every copy has a plan', () => {
  // A plan the ledger enforces but no page describes is invisible; a plan described but not
  // enforced is a promise nothing keeps.
  assert.deepEqual(Object.keys(PLAN_COPY).sort(), [...PLAN_IDS].sort());
  for (const id of PLAN_IDS) {
    assert.ok(PLAN_COPY[id].name, `${id} has no name`);
    assert.ok(PLAN_COPY[id].blurb.length > 10, `${id} has no blurb`);
    assert.ok(PLAN_COPY[id].highlights.length > 0, `${id} has nothing to compare`);
  }
});

test('the ladder is monotonic — more money never buys less', () => {
  // Not checked anywhere else, and the kind of thing that survives a careless edit to one row.
  for (let i = 1; i < PLAN_IDS.length; i += 1) {
    const lo = PLAN_LIMITS[PLAN_IDS[i - 1]];
    const hi = PLAN_LIMITS[PLAN_IDS[i]];
    assert.ok(hi.sparksPerDay > lo.sparksPerDay, `${PLAN_IDS[i]} grants no more per day than ${PLAN_IDS[i - 1]}`);
    assert.ok(hi.sparksPerMonth > lo.sparksPerMonth, `${PLAN_IDS[i]} grants no more per month than ${PLAN_IDS[i - 1]}`);
  }
});

test('the monthly allowance is reachable within the month', () => {
  // A monthly figure larger than 31 days of the daily figure is a number no user can ever reach,
  // which makes it advertising rather than an allowance.
  for (const id of PLAN_IDS) {
    const reachable = PLAN_LIMITS[id].sparksPerDay * 31;
    assert.ok(
      PLAN_LIMITS[id].sparksPerMonth <= reachable,
      `${id} advertises ${PLAN_LIMITS[id].sparksPerMonth}/month but 31 days of its daily cap is only ${reachable}`,
    );
  }
});
