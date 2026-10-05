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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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

/**
 * THE PLAN COLUMNS (restated 2026-10-05, M2 site fix cycle 1). The page no longer has three plan cards: every plan is a COLUMN of the one
 * comparison table (the cells whose data-label is the plan's name), and the decision panel above it is Free's. What a card used to carry (its
 * price, its allowance, its build count) is read off its column, and a column carries nothing of another plan's.
 */
function column(id) {
  const name = PLAN_TABLE[id].name;
  const table = /<table class="compare"[\s\S]*?<\/table>/.exec(html);
  assert.ok(table, 'no comparison table on the page');
  const cells = [...table[0].matchAll(/<td[^>]*data-label="([^"]*)"[^>]*>([\s\S]*?)<\/td>/g)].filter((m) => m[1] === name).map((m) => plain(m[2]));
  assert.ok(cells.length >= 8, `the ${name} column holds only ${cells.length} cells: the table is not read`);
  return cells.join(' | ');
}

/** The answer under the limit that asks `question`, from the always-open limits grid (it was an accordion item, then a note under the cards). */
function limitAnswer(question) {
  const m = new RegExp(`<h3 class="limit__q"[^>]*>${question.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</h3>\\s*<div class="limit__a"[^>]*>([\\s\\S]*?)</div>`).exec(html);
  assert.ok(m, `no limit asks "${question}"`);
  return plain(m[1]);
}
const faqAnswer = limitAnswer;
const note = limitAnswer;

/**
 * `phrase` in `t` with no digit, comma or point glued to its front: "25 Credits per day" is not "5 Credits per day",
 * and a card that says it must not pass for the one that says the other. (A plain `includes` passed both.)
 */
const has = (t, phrase) => new RegExp(`(?<![\\d.,])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\d)`).test(t);

test('the card assertions are BOUNDED: a leading extra digit, or a trailing one, fails', () => {
  assert.ok(has('Free $0 in beta 5 Credits per day · up to 30 a month', '5 Credits per day · up to 30 a month'));
  assert.ok(!has('15 Credits per day · up to 30 a month', '5 Credits per day · up to 30 a month'), 'a leading extra digit passed');
  assert.ok(!has('1,5 Credits per day · up to 30 a month', '5 Credits per day · up to 30 a month'), 'a thousands comma passed');
  assert.ok(!has('2.5 Credits per day · up to 30 a month', '5 Credits per day · up to 30 a month'), 'a decimal point passed');
  assert.ok(!has('100 Credits a month · up to 20 a day', '100 Credits a month · up to 2 a day'), 'a trailing extra digit passed');
  assert.ok(!has('1100 Credits a month · up to 20 a day', '100 Credits a month · up to 20 a day'), 'four digits passed for three');
});

test('the page says the owner\'s line, exactly', () => {
  assert.ok(text.includes('Free while in beta. Paid plans start later'), 'the headline is not the decided line');
  assert.match(html, /<h1[^>]*>\s*Free while in beta\. Paid plans start later\s*<\/h1>/, 'and it is the page\'s one h1');
});

test('EACH PLAN COLUMN carries its own price, allowance and build count, from the plan table, and no other plan\'s', () => {
  assert.deepEqual([...LISTED_PLAN_IDS], ['free', 'builder', 'studio']);
  const cols = Object.fromEntries(LISTED_PLAN_IDS.map((id) => [id, column(id)]));
  for (const id of LISTED_PLAN_IDS) {
    const plan = PLAN_TABLE[id];
    const t = cols[id];
    // Price. Free is "Free while in beta" in its Price cell; a paid column says "<price> a month", adjacent.
    if (plan.priceUsdMonthly === 0) assert.ok(has(t, 'Free while in beta'), `${plan.name}: the column does not say it is free while in beta`);
    else assert.ok(has(t, `${formatMoney(plan.priceUsdMonthly)} a month`), `${plan.name}: "${formatMoney(plan.priceUsdMonthly)} a month" is not in its column`);
    // Allowance and builds: each in its own cell.
    assert.ok(t.split(' | ').includes(String(plan.creditsPerDay)), `${plan.name}: its ${plan.creditsPerDay} Credits a day is not a cell of its column`);
    assert.ok(t.split(' | ').includes(String(plan.creditsPerMonth)), `${plan.name}: its ${plan.creditsPerMonth} Credits a month is not a cell of its column`);
    assert.ok(has(t, `About ${buildsPerMonth(id)}`), `${plan.name}: "About ${buildsPerMonth(id)}" typical builds is not in its column`);
  }
  // Nothing crosses: a column never carries another plan's price (a swapped pair would pass the loop above).
  for (const id of LISTED_PLAN_IDS) {
    for (const other of LISTED_PLAN_IDS.filter((o) => o !== id)) {
      const o = PLAN_TABLE[other];
      if (o.priceUsdMonthly > 0) assert.ok(!cols[id].includes(formatMoney(o.priceUsdMonthly)), `the ${PLAN_TABLE[id].name} column carries the ${o.name} price`);
    }
  }
  // The per-build price of a paid column is the monthly price over ITS builds, never another plan's.
  for (const id of LISTED_PLAN_IDS.filter((p) => PLAN_TABLE[p].priceUsdMonthly > 0)) {
    const perBuild = Math.round((PLAN_TABLE[id].priceUsdMonthly / buildsPerMonth(id)) * 100) / 100;
    assert.ok(has(cols[id], `about ${formatMoney(perBuild)} a build at this price`), `${PLAN_TABLE[id].name}: the price a build is not its monthly price over its builds`);
  }
  // The exact figures the owner decided, typed once, so a config edit that is wrong is caught here too
  // and not only a page that disagrees with it.
  assert.ok(has(cols.builder, '$9.99 a month') && has(cols.studio, '$24.99 a month'));
  assert.ok(cols.free.split(' | ').includes('5') && cols.free.split(' | ').includes('30'));
  assert.ok(cols.builder.split(' | ').includes('20') && cols.builder.split(' | ').includes('100'));
  assert.ok(cols.studio.split(' | ').includes('30') && cols.studio.split(' | ').includes('300'));
  assert.ok(has(cols.free, 'About 20') && has(cols.builder, 'About 70') && has(cols.studio, 'About 200'));
  // And the decision panel is Free's, from the same table.
  const panel = plain(/<section[^>]*aria-labelledby="now-title"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '');
  assert.ok(panel.includes(`${PLAN_TABLE.free.creditsPerDay} Credits per day · up to ${PLAN_TABLE.free.creditsPerMonth} a month`), 'the Free panel does not say its allowance');
  assert.ok(has(panel, '$0 in beta'), 'the Free panel does not say it is $0 in beta');
  assert.ok(has(panel, `About ${buildsPerMonth('free')} typical builds a month`));
});

/** One row of the comparison table, by its label: the cells keyed by the plan column they sit under, as a visitor reads them. */
function matrixRow(label) {
  const table = /<table class="compare"[\s\S]*?<\/table>/.exec(html);
  assert.ok(table, 'no comparison table on the page');
  const row = [...table[0].matchAll(/<tr[^>]*>\s*<th scope="row"[^>]*>([\s\S]*?)<\/th>([\s\S]*?)<\/tr>/g)]
    .find((m) => plain(m[1].replace(/<span class="rownote"[\s\S]*?<\/span>/, '')) === label);
  assert.ok(row, `no comparison row labelled "${label}"`);
  return Object.fromEntries([...row[2].matchAll(/<td[^>]*data-label="([^"]*)"[^>]*>([\s\S]*?)<\/td>/g)].map((c) => [c[1], plain(c[2])]));
}

test('THE COMPARISON TABLE\'S Price, Credits a day, Credits a month AND builds ROWS are the plan table\'s, cell by cell', () => {
  // Read from PLAN_TABLE, not from PLAN_FEATURES (which is what the page renders): a config that reverts, or a
  // page that stops reading it, makes the cell differ from this. Then the decided figures, typed once.
  const names = Object.fromEntries(LISTED_PLAN_IDS.map((id) => [PLAN_TABLE[id].name, id]));
  const price = matrixRow('Price');
  const day = matrixRow('Credits a day');
  const month = matrixRow('Credits a month');
  const builds = matrixRow('Typical builds a month');
  for (const [name, id] of Object.entries(names)) {
    const plan = PLAN_TABLE[id];
    assert.equal(price[name], plan.priceUsdMonthly === 0 ? 'Free while in beta' : `${formatMoney(plan.priceUsdMonthly)} a month`, `Price / ${name}`);
    assert.equal(day[name], String(plan.creditsPerDay), `Credits a day / ${name}: a ledger-unit figure (PLAN_LIMITS) is not what a person reads`);
    assert.equal(month[name], String(plan.creditsPerMonth), `Credits a month / ${name}`);
    assert.equal(builds[name], `About ${buildsPerMonth(id)}`, `Typical builds a month / ${name}`);
  }
  assert.deepEqual(Object.keys(price), ['Free', 'Pro', 'Max'], 'the columns are the listed plans, in order');
  assert.deepEqual(price, { Free: 'Free while in beta', Pro: '$9.99 a month', Max: '$24.99 a month' }, 'the owner\'s line, not "Free forever"');
  assert.deepEqual(day, { Free: '5', Pro: '20', Max: '30' });
  assert.deepEqual(month, { Free: '30', Pro: '100', Max: '300' });
});

test('WHAT THE PAGE SAYS HAPPENS AT THE LIMIT names BOTH resets, EACH WITH ITS OWN PERIOD: midnight UTC for the day, the first of next month for the month', () => {
  //[[ Review cycle 3, finding 7. This matched "midnight UTC" and "1st of the next month" anywhere in the answer, so an
  //   answer that said the DAILY limit resets on the 1st of the next month and the MONTHLY one at midnight passed. The
  //   pairing is the claim: each reset is read inside the sentence (or clause) that names its period. ]]
  const MIDNIGHT = /midnight UTC/i;
  const FIRST = /(1st of the next month|first of the next month)/i;
  const sentences = (a, word) => a.split(/(?<=[.!?])\s+/).filter((x) => new RegExp(`\\b${word}\\b`, 'i').test(x));

  const run = faqAnswer('What happens when I run out of Credits?');
  const daily = sentences(run, 'daily');
  const monthly = sentences(run, 'monthly');
  assert.ok(daily.length >= 1 && monthly.length >= 1, 'the answer does not name both limits by period: this would check nothing');
  for (const x of daily) {
    assert.match(x, MIDNIGHT, `the DAILY limit's reset is not midnight UTC: "${x}"`);
    assert.doesNotMatch(x, FIRST, `the DAILY limit is given the monthly reset: "${x}"`);
  }
  for (const x of monthly) {
    assert.match(x, FIRST, `the MONTHLY limit's reset is not the 1st of the next month: "${x}"`);
    assert.doesNotMatch(x, MIDNIGHT, `the MONTHLY limit is given the daily reset: "${x}"`);
  }

  const cost = faqAnswer('Can a build cost more than the table says?');
  assert.match(cost, /lifts at midnight UTC if it was the day's/, 'the day\'s reset is not tied to the day');
  assert.match(cost, /1st of the next month if it was the month's/, 'the month\'s reset is not tied to the month');
  assert.doesNotMatch(cost, /midnight UTC if it was the month's|1st of the next month if it was the day's/, 'the two resets are swapped');
  // And never the one sentence that promises the day's refill whatever stopped you.
  assert.doesNotMatch(cost, /the allowance refills at midnight UTC/);
});

test('THE DOCS PAGE ON LIMITS names both resets too', () => {
  const file = fileURLToPath(new URL('../dist/docs/credits-and-limits/index.html', import.meta.url));
  assert.ok(existsSync(file), 'dist/docs/credits-and-limits/index.html is missing: run `npx astro build` first');
  const doc = plain(readFileSync(file, 'utf8'));
  assert.match(doc, /The daily limit resets at midnight UTC/, 'the day\'s reset is not named');
  assert.match(doc, /The monthly limit resets at 00:00 UTC on the 1st of the next month, and a new day does not lift it/, 'the month\'s reset is not named');
  assert.doesNotMatch(doc, /Quotas reset at midnight UTC/, 'the sentence that promised the day\'s reset for both limits is back');
});

test('NO PAGE POINTS AT "Plans & Credits", which does not exist; the page that does is Usage and Credits (Plan & billing tab)', () => {
  for (const [name, dist] of [['/pricing', 'pricing'], ['/terms', 'terms']]) {
    const file = fileURLToPath(new URL(`../dist/${dist}/index.html`, import.meta.url));
    const page = plain(readFileSync(file, 'utf8'));
    assert.doesNotMatch(page, /Plans (&|and) Credits page/i, `${name} sends the reader to a page that does not exist`);
  }
  // /terms renders this sentence only when checkout is open, so the BUILT page cannot show it today: read the sources.
  for (const name of ['terms', 'pricing']) {
    const src = readFileSync(fileURLToPath(new URL(`../src/pages/${name}.astro`, import.meta.url)), 'utf8');
    assert.doesNotMatch(src, /Plans (&amp;|&|and) Credits page/i, `${name}.astro sends the reader to a page that does not exist`);
  }
  assert.match(readFileSync(fileURLToPath(new URL('../src/pages/terms.astro', import.meta.url)), 'utf8'), /Plan &amp; billing tab of your account's Usage and Credits page/, 'terms.astro does not name the page that exists');
  const faq = faqAnswer('Can I subscribe now?');
  assert.match(faq, /Plan & billing tab of your account['\u2019]s Usage and Credits page/, 'the FAQ does not point at the page that shows purchase availability');
  // And that page is real: the app has a Usage and Credits link and a Plan & billing tab.
  const web = (p) => readFileSync(fileURLToPath(new URL(`../../web/src/${p}`, import.meta.url)), 'utf8');
  assert.match(web('components/layout.tsx'), /Usage and Credits/);
  assert.match(web('routes/usage.tsx'), /Plan &amp; billing/);
});

// RESTATED 2026-10-05 (M2 rebuild). This read dist/changelog, which is deleted (/changelog redirects to /blog). The property is that no page
// still defines a Credit as 30 neurons (the retired unit), and that the page people read says what a Credit is now: so it is held over
// every built page, and the second half is read off /pricing, which says it in its "What is a Credit?" answer.
test('NO PAGE DEFINES A CREDIT AS 30 NEURONS: a Credit is about $0.05 of compute, and /pricing says so', () => {
  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  const pages = readdirSync(dist, { recursive: true }).filter((f) => String(f).endsWith('.html'));
  assert.ok(pages.length > 10, 'too few built pages to mean anything');
  for (const f of pages) {
    assert.doesNotMatch(plain(readFileSync(join(dist, String(f)), 'utf8')), /1 Credit\s*=\s*30 neurons/i, `${f} still defines a Credit as 30 neurons`);
  }
  assert.match(text, /One Credit is about \$0\.05 of AI compute/, '/pricing does not say what a Credit is now');
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

test('THE BUILD COST LIST has one row per build, with its credits and its dollars in that row', () => {
  // RESTATED 2026-10-05: the cost table became a list with a bar per row (src/pages/pricing.astro, "What a Credit buys"); the property (one row
  // per config build, its own credits and dollars, the estimate flag where the config sets it) is read off the list items.
  const rows = [...html.matchAll(/<li class="cost"[^>]*>\s*<span class="cost__label"[^>]*>([\s\S]*?)<\/span>[\s\S]*?<span class="cost__credits[^"]*"[^>]*>([\s\S]*?)<\/span>\s*<span class="cost__usd[^"]*"[^>]*>([\s\S]*?)<\/span>/g)]
    .map((m) => [plain(m[1]), plain(m[2]), plain(m[3])]);
  assert.equal(rows.length, BUILD_COSTS.length, 'one row per build cost');
  const cents = (credits) => formatMoney(Math.round(credits * CREDIT_USD * 100) / 100);
  BUILD_COSTS.forEach((b, k) => {
    const credits = b.creditsLow === b.creditsHigh ? formatCredits(b.creditsLow) : `${formatCredits(b.creditsLow)}\u2013${formatCredits(b.creditsHigh)}`;
    const dollars = b.creditsLow === b.creditsHigh ? cents(b.creditsLow) : `${cents(b.creditsLow)}\u2013${cents(b.creditsHigh)}`;
    assert.deepEqual(rows[k], [`${b.label}${b.estimated ? ', estimated' : ''}`, credits, dollars], `row ${k} (${b.label}) is not the config's`);
  });
  // The bars are widths, never figures: each is within the range of 0 to 100 and the biggest build's is the longest.
  const widths = [...html.matchAll(/<span class="cost__bar"[^>]*><span style="width: (\d+)%"/g)].map((m) => Number(m[1]));
  assert.equal(widths.length, BUILD_COSTS.length);
  assert.equal(Math.max(...widths), widths[BUILD_COSTS.indexOf(BUILD_COSTS.reduce((a, b) => (b.creditsHigh > a.creditsHigh ? b : a)))], 'the longest bar is not the dearest build');
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
