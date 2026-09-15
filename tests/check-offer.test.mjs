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

import { PLAN_COPY, PLAN_IDS, PLAN_LIMITS, CREDITS_PER_BUILD, buildsPerDay, buildsPerMonth } from '../packages/shared/src/index.ts';
import { DAILY_NEURON_CEILING, NEURONS_PER_CREDIT, USD_PER_NEURON } from '../apps/worker/src/pricing.ts';
import { copyProblems, planProblems, termProblems } from '../scripts/lib/offer-rules.mjs';

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
  const affords = Math.floor(PLAN_LIMITS.free.creditsPerDay / CREDITS_PER_BUILD);
  assert.equal(affords, buildsPerDay('free'), 'the helper and the arithmetic must agree');

  const r = run();
  if (affords === 0) {
    assert.equal(r.exit, 1, 'a free tier affording zero builds must fail the check');
    assert.match(r.out, /the free plan grants \d+ Credits\/day and one quality-gated build costs \d+/);
  } else {
    assert.doesNotMatch(r.out, /the free plan grants/, 'a sufficient free tier must not be reported');
  }
});

test('a plan promising more per day than the service can serve is reported', () => {
  // The ceiling is the WHOLE SERVICE's, so this is not a pricing mistake — it is a promise that
  // fails the moment one subscriber uses what they bought.
  const ceiling = Math.floor(DAILY_NEURON_CEILING / NEURONS_PER_CREDIT);
  const over = PLAN_IDS.filter((id) => PLAN_LIMITS[id].creditsPerDay > ceiling);
  const r = run();
  for (const id of over) {
    assert.match(r.out, new RegExp(`BROKEN: ${id} grants ${PLAN_LIMITS[id].creditsPerDay} Credits/day`));
  }
  if (over.length) assert.equal(r.exit, 1);
});

test('a priced plan below its margin floor is reported, and the priced plans today are above it', () => {
  const usdPerCredit = NEURONS_PER_CREDIT * USD_PER_NEURON;
  for (const id of PLAN_IDS) {
    const price = PLAN_COPY[id].priceUsdMonthly;
    if (price === null || price === 0) continue;
    const floor = PLAN_LIMITS[id].creditsPerMonth * usdPerCredit * 1.4;
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
  // A rounded-up figure is a promise the allowance cannot keep: 6,000 Credits at 77 each is 77
  // builds and a remainder, not 78.
  for (const id of PLAN_IDS) {
    const exact = PLAN_LIMITS[id].creditsPerMonth / CREDITS_PER_BUILD;
    assert.equal(buildsPerMonth(id), Math.floor(exact));
    assert.ok(buildsPerMonth(id) * CREDITS_PER_BUILD <= PLAN_LIMITS[id].creditsPerMonth, `${id} promises more builds than it grants`);
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
    assert.ok(hi.creditsPerDay > lo.creditsPerDay, `${PLAN_IDS[i]} grants no more per day than ${PLAN_IDS[i - 1]}`);
    assert.ok(hi.creditsPerMonth > lo.creditsPerMonth, `${PLAN_IDS[i]} grants no more per month than ${PLAN_IDS[i - 1]}`);
  }
});

test('the monthly allowance is reachable within the month', () => {
  // A monthly figure larger than 31 days of the daily figure is a number no user can ever reach,
  // which makes it advertising rather than an allowance.
  for (const id of PLAN_IDS) {
    const reachable = PLAN_LIMITS[id].creditsPerDay * 31;
    assert.ok(
      PLAN_LIMITS[id].creditsPerMonth <= reachable,
      `${id} advertises ${PLAN_LIMITS[id].creditsPerMonth}/month but 31 days of its daily cap is only ${reachable}`,
    );
  }
});

/* ============================================================================================
   EACH RULE, SHOWN TO FIRE.

   Everything above this line runs the checker against the REAL repository, which is supposed to
   satisfy every rule. That is worth asserting and it is not enough: a rule that has been deleted
   is silent, and so is a rule that holds. Measured, not suspected — with the daily-ceiling rule
   replaced by `if (false)` and the contractual-terms list emptied to `[]`, this suite was 12/12
   green both times, and G-ORACLE-3 could not be falsified.

   Four of the tests above are written as "if the repository violates this, assert it is reported;
   otherwise assert silence". Those are correct sentences that exercise nothing, and they check
   LESS the healthier the repository gets — the worst gradient a guard can have. They stay, because
   a regression in the real tree should surface there. The cases below are the other half: the
   rules handed inputs that break them, so the detection path is the thing under test.

   These call the rule functions directly rather than the script. The script's job is to supply
   the real tables; asking it to also accept fabricated ones would mean a flag that changes what
   it measures, which is an escape hatch, not a test.
   ============================================================================================ */

/** A plan table that satisfies every rule, so each case below can break exactly one thing. */
const HEALTHY = {
  planIds: ['free', 'paid'],
  limits: { free: { creditsPerDay: 231, creditsPerMonth: 2_310 }, paid: { creditsPerDay: 416, creditsPerMonth: 12_600 } },
  copy: { free: { priceUsdMonthly: 0 }, paid: { priceUsdMonthly: 12 } },
  ceilingCredits: 833,
  creditsPerBuild: 77,
  usdPerCredit: 0.00033,
  margin: 1.4,
};

test('the fixture itself is clean, or every case below proves nothing', () => {
  // The control. Without it, a rule function that returned a problem for ANY input would make all
  // four cases below pass, which is a different way of looking at nothing.
  const { problems } = planProblems(HEALTHY);
  assert.deepEqual(problems, [], `the healthy fixture must satisfy every rule:\n${problems.join('\n')}`);
});

test('RULE 1 FIRES: a priced plan below its margin floor is reported', () => {
  const { problems } = planProblems({
    ...HEALTHY,
    copy: { ...HEALTHY.copy, paid: { priceUsdMonthly: 1 } },
  });
  assert.equal(problems.length, 1, problems.join('\n'));
  assert.match(problems[0], /paid charges \$1\/month .* below the \$\d+\.\d\d floor at 1\.4x/);
});

test('RULE 2 FIRES: a plan granting more per day than the service can serve is reported', () => {
  // The rule check-offer's own header calls the one that matters most, and the one that was
  // disabled without this suite noticing.
  const { problems } = planProblems({
    ...HEALTHY,
    limits: { ...HEALTHY.limits, paid: { creditsPerDay: 6_000, creditsPerMonth: 12_600 } },
  });
  assert.equal(problems.length, 1, problems.join('\n'));
  assert.match(problems[0], /paid grants 6000 Credits\/day but the WHOLE SERVICE can serve 833/);
  assert.match(problems[0], /exhausts the day for everyone/);
});

test('RULE 3 FIRES: a free tier that cannot finish one build is reported', () => {
  const { problems } = planProblems({
    ...HEALTHY,
    limits: { ...HEALTHY.limits, free: { creditsPerDay: 60, creditsPerMonth: 1_800 } },
  });
  assert.equal(problems.length, 1, problems.join('\n'));
  assert.match(problems[0], /the free plan grants 60 Credits\/day and one quality-gated build costs 77/);
});

test('RULE 1 EXEMPTS the free tier, and only from that rule', () => {
  // A margin rule including a $0 plan would make any free tier arithmetically impossible. The
  // exemption has to be narrow: the same free plan is still held to rule 3, which the case above
  // proves fires. Here it must produce no margin complaint at any allowance.
  const { problems } = planProblems({
    ...HEALTHY,
    limits: { ...HEALTHY.limits, free: { creditsPerDay: 231, creditsPerMonth: 2_310 } },
  });
  assert.deepEqual(problems.filter((p) => p.startsWith('free charges')), []);
});

test('RULE 4 FIRES: a stated quota no plan grants is reported', () => {
  const problems = copyProblems(
    [{ rel: 'fake/page.astro', src: '<p>Start with 60 Credits a day, then 9,000 Credits per month.</p>' }],
    new Set([231, 2_310]),
  );
  assert.equal(problems.length, 2, problems.join('\n'));
  assert.match(problems[0], /fake\/page\.astro states 60 Credits a day, which no plan grants/);
  assert.match(problems[1], /states 9000 Credits a month/);
});

test('RULE 4 IS SILENT on an enforced figure, and on a number that is not a Credit claim', () => {
  const problems = copyProblems(
    [{ rel: 'fake/page.astro', src: '<p>231 Credits a day.</p><style>.x{width:400px;margin:60px}</style>' }],
    new Set([231]),
  );
  assert.deepEqual(problems, []);
});

test('RULE 5 FIRES: a contractual term in copy is reported', () => {
  // The rule that could be deleted outright without this suite noticing.
  const problems = termProblems([{ rel: 'fake/page.astro', src: '<p>Free forever. You will never be charged.</p>' }]);
  assert.equal(problems.length, 2, problems.join('\n'));
  assert.ok(problems.every((p) => p.includes('a contractual term')));
});

test('RULES 4 AND 5 READ THE SOURCE, NOT THE COMMENTARY ON IT', () => {
  // A comment explaining why a figure was corrected is exactly the history worth writing down, and
  // an unstripped scan refuses to let it be written. This reported pricing.astro for a "60 Credits a
  // day" that lived in a comment beside the interpolation that replaced it.
  //
  // Asymmetry is the reason the rule strips rather than the prose being reworded: a comment can
  // only ever produce a false alarm here, never hide a real claim, because a comment is not copy.
  const commented = [{
    rel: 'fake/page.astro',
    src: [
      '// was 60 Credits a day before the repricing',
      '/* and we must never write $0 forever */',
      '<!-- nor free forever -->',
      '<a href="https://example.com/x">231 Credits a day</a>',
    ].join('\n'),
  }];
  assert.deepEqual(copyProblems(commented, new Set([231])), []);
  assert.deepEqual(termProblems(commented), []);

  // And the href's `//` must not have eaten the real claim on that line.
  assert.equal(copyProblems(commented, new Set([1])).length, 1);
});
