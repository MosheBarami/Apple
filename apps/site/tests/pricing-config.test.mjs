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
const {
  PLAN_TABLE, LISTED_PLAN_IDS, BUILD_COSTS, CREDIT_USD, TYPICAL_BUILD_CREDITS, INTERNAL_PER_CREDIT, NEURONS_PER_CREDIT,
  buildsPerMonth, formatCredits, formatMoney,
} = shared;
const { DAILY_NEURON_CEILING } = await import('../../worker/src/pricing.ts');

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

/** Tags, scripts and styles out; what a reader sees of one fragment, cells separated by a single space. */
const plain = (fragment) =>
  fragment
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&rsquo;|&#8217;|&#x27;|&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/** One plan card, from the <article> that names it to the </article> that closes it. Nothing outside it. */
function card(id) {
  const m = new RegExp(`<article[^>]*aria-labelledby="plan-${id}"[\\s\\S]*?</article>`).exec(html);
  assert.ok(m, `no card for ${id}`);
  return plain(m[0]);
}

/** The answer of the FAQ item whose question is `question`. */
function faqAnswer(question) {
  const item = html.split('<details class="acc__item"').find((chunk) => chunk.includes(`>${question}</span>`));
  assert.ok(item, `no FAQ item asks "${question}"`);
  const open = item.indexOf('class="acc__a"');
  return plain(item.slice(item.indexOf('>', open) + 1));
}

/** A titled note under the cards ("A second, shared limit"): the paragraph that opens with that title. */
function note(title) {
  const m = new RegExp(`<p class="plan__note"[^>]*><strong class="note-title"[^>]*>${title}</strong>([\\s\\S]*?)</p>`).exec(html);
  assert.ok(m, `no note titled "${title}"`);
  return plain(m[1]);
}

test('the page says the owner\'s line, exactly', () => {
  assert.ok(text.includes('Free while in beta. Paid plans start later'), 'the headline is not the decided line');
  assert.match(html, /<h1[^>]*>\s*Free while in beta\. Paid plans start later\s*<\/h1>/, 'and it is the page\'s one h1');
});

test('EACH CARD carries its own price, allowance and build count, from the plan table, and no other card\'s', () => {
  assert.deepEqual([...LISTED_PLAN_IDS], ['free', 'builder', 'studio']);
  const cards = Object.fromEntries(LISTED_PLAN_IDS.map((id) => [id, card(id)]));
  for (const id of LISTED_PLAN_IDS) {
    const plan = PLAN_TABLE[id];
    const t = cards[id];
    assert.ok(t.includes(plan.name), `${plan.name}: the card does not carry its own name`);
    // Price. Free is $0 in beta; a paid card is "<price> a month", adjacent, inside the card.
    if (plan.priceUsdMonthly === 0) assert.match(t, /\$0 in beta/, `${plan.name}: the card does not say it is $0 in beta`);
    else assert.ok(t.includes(`${formatMoney(plan.priceUsdMonthly)} a month`), `${plan.name}: "${formatMoney(plan.priceUsdMonthly)} a month" is not on its card`);
    // Allowance. Free leads with its day (that is how it is given out), a paid plan with its month (its pool).
    const line = id === 'free'
      ? `${plan.creditsPerDay} Credits per day · up to ${plan.creditsPerMonth} a month`
      : `${plan.creditsPerMonth} Credits a month · up to ${plan.creditsPerDay} a day`;
    assert.ok(t.includes(line), `${plan.name}: "${line}" is not on its card`);
    // Build count.
    assert.ok(t.includes(`About ${buildsPerMonth(id)} typical builds a month`), `${plan.name}: "About ${buildsPerMonth(id)} typical builds a month" is not on its card`);
  }
  // Nothing crosses: a card never carries another plan's price or allowance (a swapped pair would pass the loop above).
  for (const id of LISTED_PLAN_IDS) {
    for (const other of LISTED_PLAN_IDS.filter((o) => o !== id)) {
      const o = PLAN_TABLE[other];
      if (o.priceUsdMonthly > 0) assert.ok(!cards[id].includes(formatMoney(o.priceUsdMonthly)), `the ${PLAN_TABLE[id].name} card carries the ${o.name} price`);
      assert.ok(!cards[id].includes(`${o.creditsPerMonth} Credits a month`) || o.creditsPerMonth === PLAN_TABLE[id].creditsPerMonth, `the ${PLAN_TABLE[id].name} card carries the ${o.name} allowance`);
    }
  }
  // The exact figures the owner decided, typed once, so a config edit that is wrong is caught here too
  // and not only a page that disagrees with it.
  assert.ok(cards.builder.includes('$9.99 a month') && cards.studio.includes('$24.99 a month'));
  assert.ok(cards.free.includes('5 Credits per day · up to 30 a month'));
  assert.ok(cards.builder.includes('100 Credits a month · up to 20 a day') && cards.studio.includes('300 Credits a month · up to 30 a day'));
  assert.ok(cards.free.includes('About 20 typical builds a month') && cards.builder.includes('About 70 typical builds') && cards.studio.includes('About 200 typical builds'));
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

test('THE FAQ DEFINES A CREDIT from CREDIT_USD and the unit, at the question that asks', () => {
  const a = faqAnswer('What is a Credit?');
  assert.ok(a.startsWith(`One Credit is about ${formatMoney(CREDIT_USD)} of AI compute:`), `the answer does not open with the definition: ${a.slice(0, 80)}`);
  const neurons = (INTERNAL_PER_CREDIT * NEURONS_PER_CREDIT).toLocaleString('en-US');
  assert.ok(a.includes(`${neurons} of Cloudflare's Workers AI neurons`), `the answer does not give the ${neurons} neurons a credit is`);
  assert.equal(neurons, '4,500', 'a credit is 150 ledger units of 30 neurons');
  assert.ok(a.includes('shows with two decimals'), 'and the app\'s two-decimal balance is said');
  assert.ok(a.includes(`A typical build uses about ${formatCredits(TYPICAL_BUILD_CREDITS)} Credits`), 'and what a typical build uses');
});

test('THE SHARED-POOL SENTENCE gives the whole-service ceiling in credits and the accounts it serves, from the worker\'s own number', () => {
  const pool = Math.floor(DAILY_NEURON_CEILING / (NEURONS_PER_CREDIT * INTERNAL_PER_CREDIT));
  const accounts = Math.floor(pool / PLAN_TABLE.free.creditsPerDay);
  assert.deepEqual([pool, accounts], [35, 7], 'the service-wide ceiling moved: decide what the page may say');
  const n = note('A second, shared limit');
  assert.ok(n.includes(`shared pool of about ${pool} Credits of building a day across the whole service`), `the pool is not ${pool} Credits: ${n.slice(0, 140)}`);
  assert.ok(n.includes(`roughly ${accounts} accounts building flat out`), `the page does not say ${accounts} accounts`);
  assert.ok(n.includes('even though your own balance still shows Credits'), 'and what the user sees when the pool is gone');
});

test('THE BUILD COST TABLE has one row per build, with its credits and its dollars in that row', () => {
  const rows = [...html.matchAll(/<tr[^>]*>\s*<td[^>]*data-label="Build"[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*data-label="Credits"[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*data-label="AI compute"[^>]*>([\s\S]*?)<\/td>/g)]
    .map((m) => [plain(m[1]), plain(m[2]), plain(m[3])]);
  assert.equal(rows.length, BUILD_COSTS.length, 'one row per build cost');
  const cents = (credits) => formatMoney(Math.round(credits * CREDIT_USD * 100) / 100);
  BUILD_COSTS.forEach((b, k) => {
    const credits = b.creditsLow === b.creditsHigh ? formatCredits(b.creditsLow) : `${formatCredits(b.creditsLow)}\u2013${formatCredits(b.creditsHigh)}`;
    const dollars = b.creditsLow === b.creditsHigh ? cents(b.creditsLow) : `${cents(b.creditsLow)}\u2013${cents(b.creditsHigh)}`;
    assert.deepEqual(rows[k], [`${b.label}${b.estimated ? ', estimated' : ''}`, credits, dollars], `row ${k} (${b.label}) is not the config's`);
  });
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
