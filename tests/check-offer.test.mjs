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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PLAN_COPY, PLAN_IDS, PLAN_LIMITS, PLAN_TABLE, LISTED_PLAN_IDS, INTERNAL_PER_CREDIT, TYPICAL_BUILD_CREDITS,
  CREDITS_PER_BUILD, buildsPerDay, buildsPerMonth,
} from '../packages/shared/src/index.ts';
import { DAILY_NEURON_CEILING, NEURONS_PER_CREDIT, USD_PER_NEURON } from '../apps/worker/src/pricing.ts';
import { copyProblems, limitProblems, planProblems, priceProblems, termProblems } from '../scripts/lib/offer-rules.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const run = () => {
  const p = spawnSync('node', [join(ROOT, 'scripts', 'check-offer.mjs')], { cwd: ROOT, encoding: 'utf8', timeout: 120_000 });
  return { exit: p.status, out: `${p.stdout ?? ''}${p.stderr ?? ''}` };
};

/* ----------------------------------------------------------- the checker runs --- */

test('the real repository holds together: the checker exits 0', () => {
  // WAS "exit 0 or 1, never 2": a verdict of INCOHERENT passed. The checker runs in CI (Static checks), where it
  // must be green, and a test that accepted a red verdict could not have said so. Exit 2 would mean it fell over.
  // It reads only tracked files and the shared tables, so it has no way to be red for a reason outside the tree.
  const r = run();
  assert.equal(r.exit, 0, `the offer is incoherent on the real tree:\n${r.out}`);
  assert.match(r.out, /OFFER COHERENT/);
});

test('CI RUNS IT: the Static checks job has a step that runs scripts/check-offer.mjs', () => {
  // It was invoked by nothing but this file, and this file accepted an incoherent verdict, so no gate could go red
  // for a figure a page got wrong. The job is cut from "name: Static checks" to the next job header.
  const ci = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  const start = ci.indexOf('    name: Static checks');
  assert.ok(start > 0, 'the Static checks job is not in ci.yml');
  const rest = ci.slice(start);
  const job = rest.slice(0, rest.search(/\n  [a-z][\w-]*:\n/));
  assert.match(job, /^\s+run: node scripts\/check-offer\.mjs\s*$/m, 'the Static checks job does not run check-offer.mjs');
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
  // Rule 3 counts the SMALLEST quality-gated build (CREDITS_PER_BUILD ledger units); the page's
  // "builds a day" counts the TYPICAL one (TYPICAL_BUILD_CREDITS). Free must afford both.
  const affords = Math.floor(PLAN_LIMITS.free.creditsPerDay / CREDITS_PER_BUILD);
  assert.ok(buildsPerDay('free') >= 1, 'a free day must afford at least one typical build');
  assert.ok(affords >= buildsPerDay('free'), 'the smallest build cannot be dearer than the typical one');

  const r = run();
  if (affords === 0) {
    assert.equal(r.exit, 1, 'a free tier affording zero builds must fail the check');
    assert.match(r.out, /the free plan grants \d+ ledger units\/day and one quality-gated build costs \d+/);
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
    assert.match(r.out, new RegExp(`BROKEN: ${id} grants ${PLAN_LIMITS[id].creditsPerDay} ledger units/day`));
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

test('builds-per-month can only understate what the credits buy', () => {
  // A rounded-up figure is a promise the allowance cannot keep. "About N builds" is the pricing
  // doc's figure, held to the typical build's cost: it may be less than the credits afford, never more.
  for (const id of PLAN_IDS) {
    const most = Math.floor(PLAN_TABLE[id].creditsPerMonth / TYPICAL_BUILD_CREDITS);
    assert.equal(buildsPerMonth(id), PLAN_TABLE[id].approxBuilds);
    assert.ok(buildsPerMonth(id) <= most, `${id} promises ${buildsPerMonth(id)} builds and its credits buy ${most}`);
  }
  assert.equal(buildsPerDay('free'), Math.floor(PLAN_TABLE.free.creditsPerDay / TYPICAL_BUILD_CREDITS));
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
  // Not checked anywhere else, and the kind of thing that survives a careless edit to one row. The
  // ladder is the DISPLAYED plans: the stored `enterprise` id carries Max's allowance and is not on it.
  for (let i = 1; i < LISTED_PLAN_IDS.length; i += 1) {
    const lo = PLAN_LIMITS[LISTED_PLAN_IDS[i - 1]];
    const hi = PLAN_LIMITS[LISTED_PLAN_IDS[i]];
    assert.ok(hi.creditsPerDay > lo.creditsPerDay, `${LISTED_PLAN_IDS[i]} grants no more per day than ${LISTED_PLAN_IDS[i - 1]}`);
    assert.ok(hi.creditsPerMonth > lo.creditsPerMonth, `${LISTED_PLAN_IDS[i]} grants no more per month than ${LISTED_PLAN_IDS[i - 1]}`);
  }
});

test('what is enforced is the plan table times the credit unit, for every stored plan', () => {
  assert.deepEqual(
    limitProblems({ planIds: PLAN_IDS, table: PLAN_TABLE, limits: PLAN_LIMITS, internalPerCredit: INTERNAL_PER_CREDIT }),
    [],
  );
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

/**
 * A plan table that satisfies every rule, so each case below can break exactly one thing. It is a
 * SYNTHETIC table for exercising the rule functions: its numbers are not the product's, and nothing
 * here reads or restates PLAN_TABLE.
 */
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
  assert.match(problems[0], /paid grants 6000 ledger units\/day but the WHOLE SERVICE can serve 833/);
  assert.match(problems[0], /exhausts the day for everyone/);
});

test('RULE 3 FIRES: a free tier that cannot finish one build is reported', () => {
  const { problems } = planProblems({
    ...HEALTHY,
    limits: { ...HEALTHY.limits, free: { creditsPerDay: 60, creditsPerMonth: 1_800 } },
  });
  assert.equal(problems.length, 1, problems.join('\n'));
  assert.match(problems[0], /the free plan grants 60 ledger units\/day and one quality-gated build costs 77/);
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
    { day: new Set([231]), month: new Set([2_310]) },
  );
  assert.equal(problems.length, 2, problems.join('\n'));
  assert.match(problems[0], /fake\/page\.astro states 60 Credits a day, which no plan grants a day/);
  assert.match(problems[1], /states 9000 Credits a month, which no plan grants a month/);
});

test('RULE 4 IS SILENT on an enforced figure, and on a number that is not a Credit claim', () => {
  const problems = copyProblems(
    [{ rel: 'fake/page.astro', src: '<p>231 Credits a day.</p><style>.x{width:400px;margin:60px}</style>' }],
    { day: new Set([231]), month: new Set() },
  );
  assert.deepEqual(problems, []);
});

test('RULE 4 READS A ONE-DIGIT CLAIM AND A DECIMAL ONE: "5 Credits a day", "5.00 Credits a day", "7 credits per month"', () => {
  // The claim used to need two characters, so every figure under ten was invisible to the rule, and
  // "5.00" was read as "00". Free is 5 a day, which is exactly the claim that was unguarded.
  const enforced = { day: new Set([5, 20, 30]), month: new Set([30, 100, 300]) };
  const page = (words) => [{ rel: 'fake/page.astro', src: `<p>${words}</p>` }];
  for (const words of ['5 Credits a day', '5.00 Credits a day', '30 credits per month', '30.00 Credits/month', '100 Credits a month, 20 a day']) {
    assert.deepEqual(copyProblems(page(words), enforced), [], `${words}: an enforced figure was reported`);
  }
  const wrong = [
    ['7 credits per month', /fake\/page\.astro states 7 Credits a month, which no plan grants a month/],
    ['6 Credits a day', /states 6 Credits a day/],
    ['7.50 Credits a day', /states 7\.5 Credits a day/],
    ['5.50 Credits per month', /states 5\.5 Credits a month/],
    ['Start with 8 Credits/day.', /states 8 Credits a day/],
  ];
  for (const [words, expected] of wrong) {
    const problems = copyProblems(page(words), enforced);
    assert.equal(problems.length, 1, `${words}: expected one finding, got ${JSON.stringify(problems)}`);
    assert.match(problems[0], expected, words);
  }
  // The tail of a longer number is not a claim of its own: "1.5.5" and "2,5" are not "5".
  assert.deepEqual(copyProblems(page('version 1.5 Credits a day'), { day: new Set([1.5]), month: new Set() }), []);
});

test('RULE 4 READS A CLAIM WHOLE: the lookbehind keeps the tail of a longer number from being a claim of its own', () => {
  // "1.2.5 Credits a day" is not a figure at all. Without the (?<![\d.,]) lookbehind the engine fails at "1" (the
  // pattern allows one decimal point), moves on, and reads "2.5" - or "5" - as the claim. The enforced set has
  // neither, so a regex that read them would report; and the same text without the version prefix is a real claim.
  const none = { day: new Set(), month: new Set() };
  const page = (words) => [{ rel: 'fake/page.astro', src: `<p>${words}</p>` }];
  assert.deepEqual(copyProblems(page('Release 1.2.5 Credits a day'), none), [], 'the tail of 1.2.5 was read as a claim');
  assert.deepEqual(copyProblems(page('Build 10.2.5 Credits per month'), { day: new Set(), month: new Set([5]) }), [], 'the tail of 10.2.5 was read as a claim');
  assert.equal(copyProblems(page('Release: 5 Credits a day'), none).length, 1, 'the same figure, standing alone, is a claim');
});

/** The tables check-offer.mjs builds, in miniature: Free 5/30, Pro 20/100, Max 30/300 (credits a day / a month). */
const TABLES = {
  day: new Set([5, 20, 30]),
  month: new Set([30, 100, 300]),
  plans: { Free: { day: 5, month: 30 }, Pro: { day: 20, month: 100 }, Max: { day: 30, month: 300 } },
};

test('RULE 4 USES THE PERIOD: a month figure claimed as a day figure (and the reverse) is reported', () => {
  const page = (words) => [{ rel: 'fake/page.astro', src: `<p>${words}</p>` }];
  // 300 is Max's MONTH and no plan's day; 5 is Free's DAY and no plan's month.
  const day = copyProblems(page('300 Credits a day'), TABLES);
  assert.equal(day.length, 1, JSON.stringify(day));
  assert.match(day[0], /states 300 Credits a day, which no plan grants a day/);
  const month = copyProblems(page('5 Credits a month'), TABLES);
  assert.equal(month.length, 1, JSON.stringify(month));
  assert.match(month[0], /states 5 Credits a month, which no plan grants a month/);
  // And the same figures in their own period are fine.
  assert.deepEqual(copyProblems(page('300 Credits a month. 5 Credits a day.'), TABLES), []);
});

test('RULE 4 HOLDS A CLAIM THAT NAMES A PLAN TO THAT PLAN: "Max gives 300 a day", "Free gives 30 a day", "Free gives 5 a month"', () => {
  const page = (words) => [{ rel: 'fake/page.astro', src: `<p>${words}</p>` }];
  const cases = [
    ['Max gives 300 Credits a day', /states 300 Credits a day, which no plan grants a day/],
    // 30 IS a day figure (Max's), so only the plan the sentence names can show it is wrong.
    ['Free gives 30 Credits a day', /states 30 Credits a day for Free, which grants 5 a day/],
    ['Free gives 5 Credits a month', /states 5 Credits a month, which no plan grants a month/],
    ['Pro gives 30 Credits a month', /states 30 Credits a month for Pro, which grants 100 a month/],
    ['<li><strong>Max</strong>: 20 Credits a day</li>', /for Max, which grants 30 a day/],
  ];
  for (const [words, expected] of cases) {
    const problems = copyProblems(page(words), TABLES);
    assert.equal(problems.length, 1, `${words}: ${JSON.stringify(problems)}`);
    assert.match(problems[0], expected, words);
  }
  // The controls: each plan's own figure, in either order, and two plans in one sentence.
  for (const words of [
    'Free gives 5 Credits a day', 'Free: 30 Credits a month', 'Max gives 30 Credits a day', 'Max gives 300 Credits a month',
    'Free gives 5 Credits a day; Pro gives 20 Credits a day', 'Compared with Free, Max gets 300 Credits a month',
    'Pro is 100 Credits a month. Free is 5 Credits a day.',
  ]) assert.deepEqual(copyProblems(page(words), TABLES), [], words);
  // A plan named in a PREVIOUS sentence, or before an interpolation, does not own the next figure.
  assert.deepEqual(copyProblems(page('Free is the plan to start on. 20 Credits a day buys more.'), TABLES), []);
});

test('RULE 4 ATTRIBUTES A FIGURE TO THE NEAREST PLAN NAME IN ITS OWN CLAUSE, whichever side the name is on', () => {
  //[[ Review cycle 3, finding 4. The plan was "the last plan named BEFORE the figure", so correct copy that puts the
  //   plan AFTER it ("<li>5 Credits a day (Free)</li>" after a Pro item, "5 Credits a day on Free, 20 on Pro" after
  //   a plan in the same sentence) was reported against the wrong plan and would have turned CI red; and a wrong
  //   figure put before its plan ("30 Credits a day (Free)") named no plan at all and passed, because 30 is
  //   Max's day. A list item, a cell, a heading and a comma end a clause. ]]
  const page = (words) => [{ rel: 'fake/page.astro', src: words }];
  const right = [
    // figure first, plan after
    '<ul><li>20 Credits a day (Pro)</li><li>5 Credits a day (Free)</li></ul>',
    '<ul><li>5 Credits a day (Free)</li><li>20 Credits a day (Pro)</li><li>30 Credits a day (Max)</li></ul>',
    '<table><tr><td>Pro</td><td>20 Credits a day for Pro</td></tr><tr><td>5 Credits a day for Free</td></tr></table>',
    'Pro and Max get more, but 5 Credits a day on Free, 20 Credits a day on Pro.',
    '30 Credits a day on Max and 5 Credits a day on Free',
    '5 Credits a day on Free, 20 Credits a day on Pro, 30 Credits a day on Max',
    // plan first
    '<ul><li>Pro: 20 Credits a day</li><li>Free: 5 Credits a day</li></ul>',
    '<h3>Max</h3><p>30 Credits a day</p><h3>Free</h3><p>5 Credits a day</p>',
    'Free: 5 Credits a day, Pro: 20 Credits a day, Max: 30 Credits a day',
    'Free 5 Credits a day and Pro 20 Credits a day',
    // a month figure beside its plan, either side
    '<li>100 Credits a month (Pro)</li><li>30 Credits a month (Free)</li>',
    // a list item ends a clause: a plan in the NEIGHBOURING item owns nothing here, before or after
    '<ul><li>Pro: 20 Credits a day</li><li>5 Credits a day</li></ul>',
    '<ul><li>5 Credits a day</li><li>Pro: 20 Credits a day</li></ul>',
    // two plans at the same distance: the figure is held to either, so a truly ambiguous clause is not reported
    'Free 5 Credits a day Pro 20 Credits a day',
  ];
  for (const words of right) assert.deepEqual(copyProblems(page(words), TABLES), [], `${words}: correct copy was reported`);

  const wrong = [
    ['<li>30 Credits a day (Free)</li>', /states 30 Credits a day for Free, which grants 5 a day/],
    ['30 Credits a day on Free', /states 30 Credits a day for Free, which grants 5 a day/],
    ['<li>20 Credits a day (Pro)</li><li>20 Credits a day (Free)</li>', /states 20 Credits a day for Free, which grants 5 a day/],
    ['<li>Pro: 20 Credits a day</li><li>5 Credits a day (Pro)</li>', /states 5 Credits a day for Pro, which grants 20 a day/],
    ['5 Credits a day on Free, 30 Credits a day on Pro', /states 30 Credits a day for Pro, which grants 20 a day/],
    ['300 Credits a month for Pro', /states 300 Credits a month for Pro, which grants 100 a month/],
    ['<td>Free</td><td>100 Credits a month</td>', /states 100 Credits a month for Free, which grants 30 a month/],
    // a tie, and the figure is neither plan's
    ['Free 30 Credits a day Pro', /states 30 Credits a day for Free, which grants 5 a day/],
  ];
  for (const [words, expected] of wrong) {
    const problems = copyProblems(page(words), TABLES);
    assert.equal(problems.length, 1, `${words}: ${JSON.stringify(problems)}`);
    assert.match(problems[0], expected, words);
  }
  // A figure inside an attribute is not owned by the text that follows the tag.
  assert.deepEqual(copyProblems(page('<span title="5 Credits a day">Pro</span>'), TABLES), []);
});

test('RULE 4 READS EVERY WAY A PERIOD AND A SPACE ARE WRITTEN: "every day", "each day", "daily", "per calendar month", &nbsp;', () => {
  const enforced = { day: new Set([5, 20, 30]), month: new Set([30, 100, 300]) };
  const page = (words) => [{ rel: 'fake/page.astro', src: `<p>${words}</p>` }];
  // 6 is no plan's day figure and 7 no plan's month figure: each spelling must be READ as a claim to be reported.
  const day = ['6 Credits every day', '6 Credits each day', '6 Credits daily', '6 daily Credits', '6 Credits a calendar day', '6 CREDITS A DAY',
    '6&nbsp;Credits&nbsp;a&nbsp;day', '6&#160;Credits a day', '6&#xA0;Credits a day', '6\u00a0Credits\u00a0a\u00a0day', '6\u202fCredits a day', '6&NonBreakingSpace;Credits a day', '6 Credits&nbsp;/&nbsp;day'];
  const month = ['7 Credits per calendar month', '7 Credits each month', '7 Credits every month', '7 Credits monthly', '7 monthly Credits', '7 Credits a calendar month',
    '7&nbsp;Credits&nbsp;per&nbsp;month', '7 Credits per&nbsp;calendar&nbsp;month'];
  for (const words of day) {
    const problems = copyProblems(page(words), enforced);
    assert.equal(problems.length, 1, `${words}: expected one finding, got ${JSON.stringify(problems)}`);
    assert.match(problems[0], /states 6 Credits a day, which no plan grants a day/, words);
  }
  for (const words of month) {
    const problems = copyProblems(page(words), enforced);
    assert.equal(problems.length, 1, `${words}: expected one finding, got ${JSON.stringify(problems)}`);
    assert.match(problems[0], /states 7 Credits a month, which no plan grants a month/, words);
  }
  // The same spellings with an ENFORCED figure are silent (and the period is the right one: 30 is a month, not a day, figure).
  for (const words of ['5 Credits every day', '5 daily Credits', '5&nbsp;Credits&nbsp;a&nbsp;day', '30 Credits per calendar month', '30 Credits monthly', '30&nbsp;Credits&nbsp;each&nbsp;month']) {
    assert.deepEqual(copyProblems(page(words), enforced), [], `${words}: an enforced figure was reported`);
  }
  assert.equal(copyProblems(page('30 Credits every day'), { day: new Set([5, 20]), month: new Set([30]) }).length, 1, 'a month figure read as a day claim is reported');
  // Not claims: no figure, or the figure belongs to a longer number.
  for (const words of ['Your daily Credits refill at midnight.', 'Credits every day', 'Release 1.2.5 Credits every day']) {
    assert.deepEqual(copyProblems(page(words), { day: new Set(), month: new Set() }), [], words);
  }
});

test('RULE 7 READS "billed monthly", "per user per month" AND A ONE-DECIMAL PRICE, with nbsp as the space', () => {
  const prices = new Set([9.99, 24.99]);
  const page = (words) => [{ rel: 'fake/page.astro', src: `<p>Pro is ${words}.</p>` }];
  const wrong = [
    ['$12 billed monthly', '12'], ['$12, billed monthly', '12'], ['$12 USD billed monthly', '12'],
    ['$12 per user per month', '12'], ['$12 per seat / month', '12'], ['$12/user/month', '12'], ['$12 a user a month', '12'],
    ['$12.5 a month', '12.5'], ['$12.5/month', '12.5'], ['$9.9 a month', '9.9'], ['$12.5 billed monthly', '12.5'],
    ['$12&nbsp;a&nbsp;month', '12'], ['$12\u00a0per\u00a0month', '12'],
  ];
  for (const [words, figure] of wrong) {
    const problems = priceProblems(page(words), prices);
    assert.equal(problems.length, 1, `${words}: expected one finding, got ${JSON.stringify(problems)}`);
    assert.match(problems[0], new RegExp(`states \\$${figure.replace('.', '\\.')} a month, which no plan charges`), words);
  }
  for (const words of ['$9.99 billed monthly', '$9.99 per user per month', '$24.99/user/month', '$24.99 a user a month', '$9.99&nbsp;a&nbsp;month']) {
    assert.deepEqual(priceProblems(page(words), prices), [], `${words}: a plan's own price was reported`);
  }
  // Not a monthly price: a compute figure, and a yearly one.
  assert.deepEqual(priceProblems(page('$0.05 of compute, or $99 a year'), prices), []);
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
  assert.deepEqual(copyProblems(commented, { day: new Set([231]), month: new Set() }), []);
  assert.deepEqual(termProblems(commented), []);

  // And the href's `//` must not have eaten the real claim on that line.
  assert.equal(copyProblems(commented, { day: new Set([1]), month: new Set() }).length, 1);
});

test('RULE 6 FIRES: a limit that is not the table times the unit is reported, with both figures', () => {
  const table = { free: { creditsPerDay: 5, creditsPerMonth: 30 } };
  assert.deepEqual(
    limitProblems({ planIds: ['free'], table, limits: { free: { creditsPerDay: 750, creditsPerMonth: 4_500 } }, internalPerCredit: 150 }),
    [],
    'the control: a limit that IS the table times the unit is clean',
  );
  const problems = limitProblems({
    planIds: ['free'],
    table,
    limits: { free: { creditsPerDay: 231, creditsPerMonth: 4_500 } },
    internalPerCredit: 150,
  });
  assert.equal(problems.length, 1, problems.join('\n'));
  assert.match(problems[0], /free is enforced at 231 ledger units a day, but its plan table says 5 credits a day, which is 750/);
});

test('RULE 7 FIRES: a monthly price no plan charges is reported', () => {
  const prices = new Set([9.99, 24.99]);
  const problems = priceProblems(
    [{ rel: 'fake/page.astro', src: '<p>Pro is $12 a month, Max is $40/month, or $24.99 per month.</p>' }],
    prices,
  );
  assert.equal(problems.length, 2, problems.join('\n'));
  assert.match(problems[0], /fake\/page\.astro states \$12 a month, which no plan charges/);
  assert.match(problems[1], /states \$40 a month/);
});

test('RULE 7 READS EVERY WAY A MONTHLY PRICE IS WRITTEN: "$12 / month", "$12 monthly", "$12 each month", "$12 USD a month"', () => {
  const prices = new Set([9.99, 24.99]);
  const spelled = ['$12 / month', '$12 monthly', '$12 each month', '$12 every month', '$12 USD a month', '$12 USD/month', '$12/mo', '$12 per month', '$12 a month', '$12/month'];
  for (const words of spelled) {
    const problems = priceProblems([{ rel: 'fake/page.astro', src: `<p>Pro is ${words}.</p>` }], prices);
    assert.equal(problems.length, 1, `${words}: ${JSON.stringify(problems)}`);
    assert.match(problems[0], /states \$12 a month, which no plan charges/, words);
  }
  // The same spellings of a price some plan DOES charge are fine.
  for (const words of ['$9.99 / month', '$9.99 monthly', '$24.99 each month', '$24.99 USD a month', '$9.99/mo']) {
    assert.deepEqual(priceProblems([{ rel: 'fake/page.astro', src: `<p>${words}</p>` }], prices), [], words);
  }
});

test('RULE 7 IS SILENT on a plan price, a compute price, and a comment', () => {
  const prices = new Set([9.99]);
  assert.deepEqual(
    priceProblems(
      [{ rel: 'fake/page.astro', src: '<p>$9.99 a month. A Credit is $0.05 of compute.</p>\n// was $12 a month before the repricing' }],
      prices,
    ),
    [],
  );
});

/* ============================================================================================
   THE SCRIPT IS THE WIRING, SO THE SCRIPT IS RUN.

   The rule functions above are pure, so they cannot tell whether check-offer.mjs still applies them. This section
   used to read the script's SOURCE and match the text of its calls, which passes while a call sits in dead code
   and fails when the call is reformatted. It now runs the real script (a copy of it, with its rules) against a
   small tree of its own, with one violation planted per rule, and reads what it says and how it exits. If the
   script stops applying a rule, or stops reading the copy files, or stops honouring an exception, a case below is
   the one that goes red.

   The fixture tree has the shape the script reads: scripts/ (the script and its rules, copied), packages/shared
   and apps/worker/src/pricing.ts (the tables, small and healthy here), and tracked copy files under apps/site
   and apps/web/src (the script lists them with `git ls-files`).
   ============================================================================================ */

const FIXTURE_SHARED = `
export const PLAN_IDS = ['free', 'paid'];
export const INTERNAL_PER_CREDIT = 150;
export const CREDITS_PER_BUILD = 77;
export const PLAN_TABLE = {
  free: { creditsPerDay: 5, creditsPerMonth: 30 },
  paid: { creditsPerDay: 20, creditsPerMonth: 100 },
};
export const PLAN_LIMITS = {
  free: { creditsPerDay: 750, creditsPerMonth: 4500 },
  paid: { creditsPerDay: 3000, creditsPerMonth: 15000 },
};
export const PLAN_COPY = {
  free: { name: 'Free', priceUsdMonthly: 0 },
  paid: { name: 'Pro', priceUsdMonthly: 9.99 },
};
`;
const FIXTURE_PRICING = `
export const USD_PER_NEURON = 0.011 / 1000;
export const FREE_NEURONS_PER_DAY = 10_000;
export const BILLABLE_NEURONS_PER_DAY = 150_000;
export const DAILY_NEURON_CEILING = 160_000;
export const NEURONS_PER_CREDIT = 30;
`;
const HEALTHY_PAGES = {
  'apps/site/src/pages/pricing.astro': '<h1>Plans</h1><p>Free: 5 Credits a day. Pro: 20 Credits a day, 100 Credits a month, $9.99 a month.</p>',
  'apps/web/src/components/plans.tsx': '<ul><li>5 Credits a day (Free)</li><li>20 Credits a day (Pro)</li></ul>',
  // EXCEPTIONS the script honours: a changelog records what WAS true, and a test asserts wrong numbers on purpose.
  'apps/site/src/pages/changelog.astro': '<p>Free used to be 60 Credits a day, $12 a month, free forever.</p>',
  'apps/web/src/components/plans.test.tsx': '<p>60 Credits a day, never be charged</p>',
};

/** Build a fixture tree and run the REAL check-offer.mjs (and its rules, copied) in it. `over` replaces files by path. */
function runOnFixture(over = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'check-offer-'));
  try {
    const files = {
      'package.json': '{"type":"module"}',
      'scripts/check-offer.mjs': readFileSync(join(ROOT, 'scripts', 'check-offer.mjs'), 'utf8'),
      'scripts/lib/offer-rules.mjs': readFileSync(join(ROOT, 'scripts', 'lib', 'offer-rules.mjs'), 'utf8'),
      'packages/shared/src/index.ts': FIXTURE_SHARED,
      'apps/worker/src/pricing.ts': FIXTURE_PRICING,
      ...HEALTHY_PAGES,
      ...over,
    };
    for (const [rel, body] of Object.entries(files)) {
      if (body === null) continue;
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), body);
    }
    const git = (...args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    git('init', '-q');
    git('add', 'apps');
    const p = spawnSync('node', [join(dir, 'scripts', 'check-offer.mjs')], { cwd: dir, encoding: 'utf8', timeout: 120_000 });
    return { exit: p.status, out: `${p.stdout ?? ''}${p.stderr ?? ''}`, first: (p.stdout ?? '').split('\n')[0] };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('FIXTURE CONTROL: the healthy tree is COHERENT, reads exactly its copy files, and honours its two exceptions', () => {
  // Without this every violation case below could pass because the fixture is broken in some other way.
  const r = runOnFixture();
  assert.equal(r.exit, 0, r.out);
  assert.match(r.out, /OFFER COHERENT — 2 plans, 2 copy files checked/, 'the changelog and the .test. file are exceptions, so 4 tracked files are 2 checked');
  assert.match(r.first, /^DENOMINATOR 2 files; EXCEPTIONS 4:/);
});

test('THE SCRIPT APPLIES RULE 4: a quota no plan grants, in a tracked copy file, fails the run', () => {
  const r = runOnFixture({ 'apps/site/src/pages/pricing.astro': '<p>Start with 60 Credits a day.</p>' });
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /BROKEN: apps\/site\/src\/pages\/pricing\.astro states 60 Credits a day, which no plan grants a day/);
});

test('THE SCRIPT APPLIES RULE 4 PER PLAN, with the names copy uses: a figure printed beside the wrong plan fails the run', () => {
  const r = runOnFixture({ 'apps/web/src/components/plans.tsx': '<ul><li>20 Credits a day (Free)</li></ul>' });
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /states 20 Credits a day for Free, which grants 5 a day/);
});

test('THE SCRIPT HOLDS COPY TO CREDITS, NEVER TO LEDGER UNITS: a ledger figure printed as credits fails, the credit figure does not', () => {
  const ledger = runOnFixture({ 'apps/site/src/pages/pricing.astro': '<p>Free is 4500 Credits a month.</p>' });
  assert.equal(ledger.exit, 1, ledger.out);
  assert.match(ledger.out, /states 4500 Credits a month, which no plan grants a month/);
  assert.equal(runOnFixture({ 'apps/site/src/pages/pricing.astro': '<p>Free is 30 Credits a month.</p>' }).exit, 0);
});

test('THE SCRIPT APPLIES RULE 5: a contractual term in a tracked copy file fails the run', () => {
  const r = runOnFixture({ 'apps/site/src/pages/pricing.astro': '<p>Free forever. You will never be charged.</p>' });
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /BROKEN: apps\/site\/src\/pages\/pricing\.astro promises "Free forever" — a contractual term/);
});

test('THE SCRIPT APPLIES RULE 7: a monthly price no plan charges fails the run', () => {
  const r = runOnFixture({ 'apps/site/src/pages/pricing.astro': '<p>Pro is $12 a month.</p>' });
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /BROKEN: apps\/site\/src\/pages\/pricing\.astro states \$12 a month, which no plan charges/);
});

test('THE SCRIPT APPLIES RULES 1 TO 3 (planIssues) to the tables it imports: a priced plan below its floor, and a free day below one build', () => {
  const cheap = runOnFixture({
    'packages/shared/src/index.ts': FIXTURE_SHARED.replace('priceUsdMonthly: 9.99', 'priceUsdMonthly: 1'),
  });
  assert.equal(cheap.exit, 1, cheap.out);
  assert.match(cheap.out, /BROKEN: paid charges \$1\/month for 15,000 ledger units, which cost \$4\.95 to serve — below the \$6\.93 floor at 1\.4x/);

  const over = runOnFixture({
    'packages/shared/src/index.ts': FIXTURE_SHARED.replace('paid: { creditsPerDay: 3000,', 'paid: { creditsPerDay: 6000,'),
  });
  assert.equal(over.exit, 1, over.out);
  assert.match(over.out, /BROKEN: paid grants 6000 ledger units\/day but the WHOLE SERVICE can serve 5333/);

  const starved = runOnFixture({
    'packages/shared/src/index.ts': FIXTURE_SHARED.replace('free: { creditsPerDay: 750,', 'free: { creditsPerDay: 60,'),
  });
  assert.equal(starved.exit, 1, starved.out);
  assert.match(starved.out, /BROKEN: the free plan grants 60 ledger units\/day and one quality-gated build costs 77/);
});

test('THE SCRIPT APPLIES RULE 6: an enforced limit that is not the table times the unit fails the run, with both figures', () => {
  const r = runOnFixture({
    'packages/shared/src/index.ts': FIXTURE_SHARED.replace('free: { creditsPerDay: 750, creditsPerMonth: 4500 }', 'free: { creditsPerDay: 231, creditsPerMonth: 4500 }'),
  });
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /BROKEN: free is enforced at 231 ledger units a day, but its plan table says 5 credits a day, which is 750/);
});
