// A PAID PLAN'S PER-DAY FIGURE IS NOT PRINTED AS A PLAN FACT UNTIL THE OWNER HAS DECIDED IT (M2 site fix cycle 2, finding 3).
//
// planning/pricing-2026-10-04.md decides each plan's price and monthly pool, and Free's 5 a day. It does not decide the paid plans' per-day figures: the
// config's 20 (Pro) and 30 (Max) are an assumption QuotaDO needs a number for ("The owner confirms or replaces them", packages/shared; DECISIONS.md section 5;
// planning/proof/OWNER-DECISIONS.md has no answer). The first rebuild printed them in the pricing table's "Credits a day" row and built "Pro: 20 a day against 100
// a month is 5 full days" on them, and the pricing guards pinned them to the config, which only proves the page agrees with an undecided number.
//
// PAID_DAILY_CAPS_DECIDED (packages/shared) is the flag. While it is false no built page, and neither the share card nor the manifest, may give a paid plan's
// per-day figure, and nothing may do "full days" arithmetic for a paid plan; the pricing table and the docs say "not decided yet" where the figure would be.
// When it is true the opposite holds: the figure is printed and no page says it is not decided. The scan is derived from the config (every paid plan's own
// figure), never a typed 20 and 30, and reads the built site.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE, blocksOf, metaTextOf, realPages, textOf } from './lib/dist.mjs';

const shared = await import('../../../packages/shared/src/index.ts');
const { PLAN_TABLE, PLAN_COPY, LISTED_PLAN_IDS } = shared;
const PAID = LISTED_PLAN_IDS.filter((id) => id !== 'free');
const FREE_DAILY = PLAN_TABLE.free.creditsPerDay;
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The figures that would be an invented plan fact: each paid plan's per-day number, unless it is the same number Free's decided figure already is. */
const secretFigures = () => [...new Set(PAID.map((id) => PLAN_TABLE[id].creditsPerDay))].filter((n) => n !== FREE_DAILY);

/** A paid plan's per-day figure said in a sentence: "20 a day", "30 Credits per day", "up to 20 a day against ...". */
const perDayClaim = (n) => new RegExp(`(?<![\\d.,$/])${esc(n)}(?:\\.0+)?\\s+(?:Credits?\\s+)?(?:a|per|each|every)\\s+day\\b`, 'i');
/** "full days" arithmetic that names a paid plan. */
const paidFullDays = () => new RegExp(`\\b(?:${PAID.map((id) => esc(PLAN_COPY[id].name)).join('|')})\\b[^.]{0,80}\\bfull days\\b`, 'i');

/** The offending sentences in a list of text blocks. */
function offences(blocks) {
  const out = [];
  for (const b of blocks) {
    for (const n of secretFigures()) if (perDayClaim(n).test(b)) out.push(`"${b.slice(0, 110)}" gives a paid plan's per-day figure (${n}) as a fact`);
    if (paidFullDays().test(b)) out.push(`"${b.slice(0, 110)}" does "full days" arithmetic for a paid plan`);
  }
  return out;
}

/** The rows of every table whose label is a per-day row, as { label, cells: { column: text } }, read the way pricing-config reads the comparison table. */
function dailyRows(html) {
  const rows = [];
  for (const table of html.matchAll(/<table\b[\s\S]*?<\/table>/gi)) {
    for (const row of table[0].matchAll(/<tr[^>]*>\s*<th scope="row"[^>]*>([\s\S]*?)<\/th>([\s\S]*?)<\/tr>/g)) {
      const label = textOf(row[1].replace(/<span class="rownote"[\s\S]*?<\/span>/, ''));
      if (!/\b(?:a|per) day\b/i.test(label)) continue;
      rows.push({ label, cells: Object.fromEntries([...row[2].matchAll(/<td[^>]*data-label="([^"]*)"[^>]*>([\s\S]*?)<\/td>/g)].map((c) => [c[1], textOf(c[2])])) });
    }
  }
  return rows;
}
const paidTableCells = (html) => dailyRows(html).flatMap((r) => PAID.map((id) => [r.label, PLAN_COPY[id].name, r.cells[PLAN_COPY[id].name]]));

test('the scanner can see: the sentences the first rebuild shipped are offences, and Free\'s decided figure, the monthly pools and "not decided yet" are not', () => {
  assert.deepEqual(secretFigures().sort(), [...new Set(PAID.map((id) => PLAN_TABLE[id].creditsPerDay))].sort(), 'the figures to hide are not the paid plans\' own');
  assert.ok(secretFigures().length >= 1, 'the paid plans have no per-day figure that differs from Free\'s: this guard is moot, retire it with the flag');
  const [pro] = PAID;
  const day = PLAN_TABLE[pro].creditsPerDay;
  const month = PLAN_TABLE[pro].creditsPerMonth;
  const name = PLAN_COPY[pro].name;
  for (const sentence of [
    `${name}: ${day} a day against ${month} a month is 5 full days`,
    `${name} plan: ${month} Credits a month · up to ${day} a day.`,
    `${name} gives ${day} Credits per day.`,
    `Up to ${day} Credits a day on ${name}.`,
  ]) assert.ok(offences([sentence]).length >= 1, `not seen as an offence: "${sentence}"`);
  assert.equal(offences([`Free: ${FREE_DAILY} a day against ${PLAN_TABLE.free.creditsPerMonth} a month is ${shared.fullRateDays('free')} full days`]).length, 0, 'Free\'s decided figure is read as an offence');
  assert.equal(offences([`${name} plan: ${month} Credits a month. The daily limit is not decided yet.`]).length, 0, 'the monthly pool or "not decided yet" is read as an offence');
  assert.equal(offences([`The session expires after ${day} days.`, `About ${day} typical builds a month.`, `A fee of $${day} a day.`]).length, 0, 'a number that is not a per-day claim is read as one');
  const row = (cells) => `<table class="compare"><tr><th scope="row">Credits a day<span class="rownote">The hard daily ceiling.</span></th>${cells}</tr></table>`;
  const cell = (n, v) => `<td data-label="${n}">${v}</td>`;
  const bad = row(`${cell('Free', FREE_DAILY)}${cell(name, day)}`);
  assert.deepEqual(paidTableCells(bad).filter(([, n]) => n === name).map((c) => c[2]), [String(day)], 'the per-day table row is not read');
  assert.deepEqual(paidTableCells(row(`${cell('Free', FREE_DAILY)}${cell(name, 'Not decided yet')}`)).filter(([, n]) => n === name).map((c) => c[2]), ['Not decided yet']);
});

test('while the paid plans\' per-day figures are undecided, no built page, title, description, share card or manifest gives one, or does "full days" arithmetic on one', (t) => {
  if (shared.PAID_DAILY_CAPS_DECIDED) return t.skip('the owner decided the paid daily figures: the next test holds the opposite');
  const bad = [];
  let read = 0;
  for (const { route, html } of realPages()) {
    const blocks = [...blocksOf(html), ...metaTextOf(html)];
    read += blocks.length;
    for (const o of offences(blocks)) bad.push(`${route}: ${o}`);
    for (const [label, plan, value] of paidTableCells(html)) {
      if (value !== 'Not decided yet') bad.push(`${route}: the "${label}" row says "${value}" for ${plan}, not "Not decided yet"`);
    }
  }
  for (const file of [join(SITE, 'brand', 'og.html'), join(SITE, 'public', 'site.webmanifest')]) {
    assert.ok(existsSync(file), `${file} is missing`);
    for (const o of offences(blocksOf(readFileSync(file, 'utf8')))) bad.push(`${file}: ${o}`);
  }
  assert.deepEqual(bad, []);
  assert.ok(read > 500, `only ${read} blocks of text were read: the scan is blind`);
  // It is not vacuous: the pricing page has the per-day row and its paid cells say so; the docs page names the plans and says the figure is undecided.
  const pricing = realPages().find((p) => p.route === '/pricing/');
  assert.ok(pricing && paidTableCells(pricing.html).length === PAID.length, 'the pricing table has no per-day row for the paid plans: the row was removed or renamed');
  const docs = textOf(realPages().find((p) => p.route === '/docs/credits-and-limits/').html);
  for (const id of PAID) assert.match(docs, new RegExp(`${esc(PLAN_COPY[id].name)} plan: ${PLAN_TABLE[id].creditsPerMonth} Credits a month\\. The daily limit is not decided yet`), `the docs do not say ${PLAN_COPY[id].name}'s daily limit is not decided yet`);
});

test('once the owner has decided the paid per-day figures, the pages print them and no page says they are undecided (the opposite lie)', (t) => {
  if (!shared.PAID_DAILY_CAPS_DECIDED) return t.skip('the paid daily figures are still undecided: the test above holds');
  for (const { route, html } of realPages()) {
    for (const b of blocksOf(html)) assert.doesNotMatch(b, /not decided yet|daily limit is not decided/i, `${route}: "${b.slice(0, 90)}" still says a figure is undecided`);
  }
  const pricing = realPages().find((p) => p.route === '/pricing/');
  for (const id of PAID) {
    const row = dailyRows(pricing.html)[0];
    assert.equal(row.cells[PLAN_COPY[id].name], String(PLAN_TABLE[id].creditsPerDay), `${PLAN_COPY[id].name}'s decided per-day figure is not in the table`);
  }
});

test('the pages that print a plan\'s per-day figure ask whether it is decided, from the one place that says', () => {
  const lib = readFileSync(join(SITE, 'src', 'lib', 'plan-facts.ts'), 'utf8');
  assert.match(lib, /PAID_DAILY_CAPS_DECIDED/);
  assert.match(lib, /Not decided yet/);
  for (const page of ['pages/pricing.astro', 'pages/docs/credits-and-limits.astro']) {
    const src = readFileSync(join(SITE, 'src', page), 'utf8');
    assert.match(src, /from '(?:\.\.\/)+lib\/plan-facts'/, `${page} does not import the decided-figure gate`);
    assert.match(src, /dailyCapDecided\(/, `${page} prints a per-day figure without asking whether it is decided`);
  }
  assert.match(readFileSync(join(SITE, '..', '..', 'packages', 'shared', 'src', 'index.ts'), 'utf8'), /export const PAID_DAILY_CAPS_DECIDED: boolean = (?:true|false);/, 'the flag is not exported from packages/shared');
});
