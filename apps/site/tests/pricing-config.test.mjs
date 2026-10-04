/**
 * THE PRICING PAGE SAYS WHAT THE PLAN TABLE SAYS, AND NOTHING THE OWNER SUPERSEDED.
 *
 * Owner decisions of 2026-10-04 (planning/pricing-2026-10-04.md): Free is 5 credits a day and at
 * most 30 a month; Pro is $9.99 a month for 100; Max is $24.99 for 300; a credit is $0.05 of AI
 * compute; charging starts later. packages/shared holds those numbers once (PLAN_TABLE, BUILD_COSTS)
 * and this reads the BUILT page, so the property is what a visitor sees, not how the source spells it.
 *
 * What the page replaced, and may not say again: $12 and $40 a month, 231 / 416 / 700 credits a day,
 * "77 Credits" for a build, "~163 builds a month". Those were the old plan table and the old unit.
 *
 * What the page must not claim yet: a way to buy (no checkout, Stripe or purchase link) and the
 * estimate-before / exact-after metering, which is a later milestone (M6) and not built.
 *
 * The page needs a built site (`npx astro build`), like every test that reads dist/.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { visibleCopy } from './lib/visible-copy.mjs';

const shared = await import('../../../packages/shared/src/index.ts');
const { PLAN_TABLE, LISTED_PLAN_IDS, BUILD_COSTS, CREDIT_USD, TYPICAL_BUILD_CREDITS, formatCredits, formatMoney } = shared;

const distFile = fileURLToPath(new URL('../dist/pricing/index.html', import.meta.url));
const sourceFile = fileURLToPath(new URL('../src/pages/pricing.astro', import.meta.url));

test('THE BUILD IS HERE, or this file has measured nothing', () => {
  assert.ok(existsSync(distFile), 'dist/pricing/index.html is missing: run `npx astro build` in apps/site first');
});

const html = existsSync(distFile) ? readFileSync(distFile, 'utf8') : '';
/** What a visitor reads: scripts, styles and tags out, entities decoded where the page uses them. */
const text = html
  .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&rsquo;|&#8217;|&#x27;|&#39;/g, "'")
  .replace(/\s+/g, ' ');

test('the page says the owner\'s line, exactly', () => {
  assert.ok(text.includes('Free while in beta. Paid plans start later'), 'the headline is not the decided line');
  assert.match(html, /<h1[^>]*>\s*Free while in beta\. Paid plans start later\s*<\/h1>/, 'and it is the page\'s one h1');
});

test('every displayed plan shows its name, price and credits from the plan table', () => {
  assert.deepEqual([...LISTED_PLAN_IDS], ['free', 'builder', 'studio']);
  for (const id of LISTED_PLAN_IDS) {
    const plan = PLAN_TABLE[id];
    assert.match(html, new RegExp(`<h2 id="plan-${id}"[^>]*>\\s*${plan.name}\\s*</h2>`), `no card for ${plan.name}`);
    // Free leads with its day (that is how it is given out), a paid plan with its month (its pool).
    const line = id === 'free'
      ? `${plan.creditsPerDay} Credits per day \u00b7 up to ${plan.creditsPerMonth} a month`
      : `${plan.creditsPerMonth} Credits a month \u00b7 up to ${plan.creditsPerDay} a day`;
    assert.ok(text.includes(line), `${plan.name}: "${line}" is not on the page`);
    if (plan.priceUsdMonthly > 0) {
      assert.ok(
        text.includes(`${formatMoney(plan.priceUsdMonthly)} a month`),
        `${plan.name}: ${formatMoney(plan.priceUsdMonthly)} a month is not on the page`,
      );
    }
  }
  // The exact figures the owner decided, spelled out once, so a config edit that is wrong is caught
  // here too and not only a page that disagrees with it.
  assert.ok(text.includes('$9.99 a month') && text.includes('$24.99 a month'));
  assert.ok(text.includes('5 Credits per day \u00b7 up to 30 a month'));
  assert.ok(text.includes('100 Credits a month') && text.includes('300 Credits a month'));
});

test('Enterprise is not on the page, in any form', () => {
  assert.doesNotMatch(text, /enterprise/i, 'a visitor can still read about Enterprise');
  assert.doesNotMatch(html, /plan-enterprise|plan=enterprise/i);
});

test('NO WAY TO BUY: no checkout, Stripe or purchase link, no form, and the paid buttons are off', () => {
  const links = [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/gi)].map((m) => m[1]);
  assert.ok(links.length > 5, 'the page has no links to read, so this would pass on nothing');
  for (const href of links) {
    assert.doesNotMatch(href, /stripe|checkout|billing|\/app\/usage\?plan|buy\./i, `a purchase path: ${href}`);
  }
  assert.doesNotMatch(html, /<form\b/i, 'a form on the pricing page');
  assert.doesNotMatch(html, /stripe/i);
  // One disabled button per paid card, and none that is live.
  const disabled = (html.match(/<button[^>]*\bdisabled\b[^>]*>\s*Checkout not open\s*<\/button>/gi) ?? []).length;
  assert.equal(disabled, LISTED_PLAN_IDS.length - 1, 'every paid card ends on a disabled "Checkout not open"');
  assert.doesNotMatch(text, /\b(Choose|Upgrade to|Subscribe to) (Pro|Max)\b/);
});

test('the figures the pricing doc superseded are gone', () => {
  const stale = [
    ['$12 a month', /\$12\b/],
    ['$40 a month', /\$40\b/],
    ['231 credits a day', /\b231\b/],
    ['416 credits a day', /\b416\b/],
    ['700 credits a day', /\b700\b/],
    ['2,310 / 12,600 / 21,000 a month', /\b(2,?310|12,?600|21,?000)\b/],
    ['77 Credits a build', /\b77\s+Credits?\b/i],
    ['~163 builds', /\b163\b/],
    ['quality-gated builds', /quality-gated/i],
  ];
  for (const [what, re] of stale) assert.doesNotMatch(text, re, `the page still says ${what}`);
});

test('NO METERING CLAIM THAT IS NOT BUILT: no estimate before a build, no exact charge after', () => {
  const claims = [
    /\bestimat\w*\b[^.]{0,60}\bbefore\b/i,
    /\bbefore (you|a|each|every|the) (build|run|start)\b/i,
    /\bexact\b[^.]{0,60}\b(charge|cost|credits?)\b/i,
    /\b(charge|cost)\b[^.]{0,30}\bafter (the|each|every) (build|run)\b/i,
  ];
  for (const re of claims) assert.doesNotMatch(text, re, `a metering claim: ${re}`);
});

test('what a Credit buys comes from BUILD_COSTS and CREDIT_USD, not from the page', () => {
  assert.ok(text.includes(`${formatMoney(CREDIT_USD)} of AI compute`), 'the credit is not defined on the page');
  const cents = (credits) => formatMoney(Math.round(credits * CREDIT_USD * 100) / 100);
  for (const b of BUILD_COSTS) {
    const credits = b.creditsLow === b.creditsHigh ? formatCredits(b.creditsLow) : `${formatCredits(b.creditsLow)}–${formatCredits(b.creditsHigh)}`;
    const dollars = b.creditsLow === b.creditsHigh ? cents(b.creditsLow) : `${cents(b.creditsLow)}–${cents(b.creditsHigh)}`;
    assert.ok(text.includes(credits), `${b.label}: ${credits} credits is not on the page`);
    assert.ok(text.includes(dollars), `${b.label}: ${dollars} is not on the page`);
    assert.equal(/estimated/i.test(text.slice(text.indexOf(b.label), text.indexOf(b.label) + 90)), b.estimated, `${b.label}: the estimate flag is not shown exactly where the config sets it`);
  }
  assert.ok(text.includes(`${formatCredits(TYPICAL_BUILD_CREDITS)} Credits`), 'the typical build is not stated');
});

test('the source types no plan figure and reads none from the ledger-unit table', () => {
  const src = visibleCopy(readFileSync(sourceFile, 'utf8'));
  assert.doesNotMatch(src, /\$\d/, 'a dollar figure is typed into the page source');
  assert.doesNotMatch(src, /\b\d[\d,.]*\s+Credits?\b/, 'a credit figure is typed into the page source');
  for (const name of ['PLAN_LIMITS', 'CREDITS_PER_BUILD', 'BUILD_NEURONS', 'MODE_INFO']) {
    assert.doesNotMatch(src, new RegExp(`\\b${name}\\b`), `${name} is a ledger-unit figure and the page quotes credits`);
  }
  assert.doesNotMatch(src, /billing\/config/, 'the page asks the live deployment whether a plan can be bought');
});
