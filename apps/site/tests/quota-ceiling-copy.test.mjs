import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

/**
 * "Credits reset to your full daily amount every day."
 *
 * Free grants a daily figure that is a small multiple of its monthly one, and `quotaState` spends
 * the MINIMUM of the two, so the day after the cutoff returns nothing — while the pricing page
 * computed requests from the daily figure and the docs page called Credits "daily energy" that
 * "refills to full once a day". The figures are PLAN_TABLE's and are never restated here.
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
  const { PLAN_TABLE, LISTED_PLAN_IDS } = shared;

  // The arithmetic this whole test exists for, asserted from the config rather than a typed 10.
  const expectedFree = Math.floor(PLAN_TABLE.free.creditsPerMonth / PLAN_TABLE.free.creditsPerDay);
  assert.equal(shared.fullRateDays('free'), expectedFree);
  assert.equal(shared.monthlyCeilingBitesFirst('free'), true, 'free no longer hits its ceiling early — rewrite these guards, do not delete them');

  for (const [name, text] of [['pricing.astro', pricing], ['credits-and-limits.astro', credits]]) {
    assert.match(text, /monthlyCeilingBitesFirst/, `${name} does not ask whether the ceiling bites`);
    assert.match(text, /fullRateDays/, `${name} states no cutoff, so the number can drift out of the prose`);
    assert.match(text, /monthly ceiling/i, `${name} never names the ceiling in shipped copy`);
  }

  // And what the BUILT pages say is the config's cutoff for every plan the ceiling bites on.
  for (const [name, rel] of [['pricing', 'pricing/index.html'], ['credits-and-limits', 'docs/credits-and-limits/index.html']]) {
    const file = new URL(`../dist/${rel}`, import.meta.url);
    if (!existsSync(file)) continue;
    const html = readFileSync(file, 'utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    for (const id of LISTED_PLAN_IDS.filter((p) => shared.monthlyCeilingBitesFirst(p))) {
      const t = PLAN_TABLE[id];
      assert.ok(
        html.includes(`${t.creditsPerDay} a day against ${t.creditsPerMonth} a month`) && html.includes(`${shared.fullRateDays(id)} full days`),
        `${name}: no derived cutoff for ${t.name} (${t.creditsPerDay} a day against ${t.creditsPerMonth} a month)`,
      );
    }
  }
});
