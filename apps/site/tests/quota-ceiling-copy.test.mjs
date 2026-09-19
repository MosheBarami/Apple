import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * "Credits reset to your full daily amount every day."
 *
 * True for three plans, false for the only one anyone can currently have. Free grants 231 a day
 * against 2,310 a month, and `quotaState` spends the MINIMUM of the two, so the eleventh day of
 * every month returns nothing — while the pricing page computed "≈ requests a free day" from the
 * daily figure and the docs page called Credits "daily energy" that "refills to full once a day".
 *
 * Nobody typed a wrong number. Both numbers were right and were printed side by side on both pages;
 * what was missing was the sentence saying which of them wins. That is the failure this pins: a
 * page may quote the daily rate, but while `monthlyCeilingBitesFirst` is true for a plan it may not
 * describe that rate as available every day without saying where it stops.
 */

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const pricing = read('../src/pages/pricing.astro');
const credits = read('../src/pages/docs/credits-and-limits.astro');

/** The exact shape of the claim: a daily refill with no ceiling beside it. */
const UNQUALIFIED = /reset to your full daily amount every day/i;

function check(pages) {
  const bad = [];
  for (const [name, text] of pages) {
    if (UNQUALIFIED.test(text)) bad.push(`${name}: promises the full daily amount every day, with no ceiling named`);
  }
  assert.deepEqual(bad, [], bad.join('\n'));
}

test('no page promises the full daily allowance every day', () => {
  check([['pricing.astro', pricing], ['credits-and-limits.astro', credits]]);
});

test('the guard fails on the sentence that shipped', () => {
  const reintroduced = pricing.replace(
    /Credits reset to your full daily amount each day, up to your plan's monthly ceiling\./,
    'Credits reset to your full daily amount every day.',
  );
  assert.notEqual(reintroduced, pricing, 'the mutation did not land — re-aim it before trusting this test');
  assert.throws(() => check([['pricing.astro', reintroduced]]));
});

test('while the ceiling bites, both pages derive the cutoff rather than restating the daily rate', async () => {
  // No catch: a specifier that stops resolving must turn this red, not make it vacuous.
  const shared = await import('../../../packages/shared/src/index.ts');
  const bites = shared.monthlyCeilingBitesFirst('free');

  // The arithmetic this whole test exists for, asserted rather than assumed.
  assert.equal(shared.fullRateDays('free'), 10);
  assert.equal(bites, true, 'free no longer hits its ceiling early — rewrite these guards, do not delete them');

  for (const [name, text] of [['pricing.astro', pricing], ['credits-and-limits.astro', credits]]) {
    assert.match(text, /monthlyCeilingBitesFirst/, `${name} does not ask whether the ceiling bites`);
    assert.match(text, /fullRateDays/, `${name} states no cutoff, so the number can drift out of the prose`);
    assert.match(text, /monthly ceiling/i, `${name} never names the ceiling in shipped copy`);
  }
});

test('the plans that clear a month are not slandered by the same guard', async () => {
  const shared = await import('../../../packages/shared/src/index.ts');
  // If this ever flips, the copy above says something false about a PAID plan, which is worse.
  for (const plan of ['builder', 'studio', 'enterprise']) {
    assert.equal(
      shared.monthlyCeilingBitesFirst(plan),
      false,
      `${plan} now hits its monthly ceiling in ${shared.fullRateDays(plan)} days and the copy does not say so`,
    );
  }
});
