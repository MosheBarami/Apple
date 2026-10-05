/**
 * THE USAGE PAGE'S PLAN LADDER IS LABELLED BETA, AND PRINTS THE SHARED CONFIG (M2 step 2.3, item C7).
 *
 * The pricing slice put the decided plans (Free, Pro, Max, from PLAN_TABLE in @studpilot/shared) on the site and in the app, with credits
 * to two decimals. Checking the app against that slice found one thing still wrong: the site says "Free while in beta. Paid plans
 * start later" above its cards, and the in-app ladder said nothing of beta. It does now, in the same words, and this file holds:
 *
 *   1. THE LABEL: the usage page's Plans section says it, above the ladder, and in the pricing page's own words (read from the site source).
 *   2. THE LADDER, rendered: one card for each listed plan and no other (no Enterprise), each with its credits to two decimals, read
 *      from the shared config rather than typed here.
 *   3. EVERY CREDIT FIGURE IN THE LADDER has two decimals.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { WEB, bundle, renderWith, text } from './ui-bundle.mjs';

const ui = await bundle(`
  export { createElement as h } from 'react';
  export { renderToStaticMarkup } from 'react-dom/server';
  export { BETA_LINE, PlanLadder } from './src/components/plans';
  export { LISTED_PLAN_IDS, PLAN_COPY, PLAN_TABLE, formatCredits } from '@studpilot/shared';
`, { name: 'usage-beta', resolveDir: WEB });
const render = (el) => renderWith(ui.renderToStaticMarkup, el);

const ladder = text(render(ui.h(ui.PlanLadder, { current: 'free', availability: 'unavailable' })));

test('the ladder shows the three listed plans from the shared config, and no other', () => {
  assert.deepEqual([...ui.LISTED_PLAN_IDS], ['free', 'builder', 'studio'], 'Free, Pro and Max are listed (the stored ids are free, builder, studio)');
  for (const id of ui.LISTED_PLAN_IDS) assert.ok(ladder.includes(ui.PLAN_COPY[id].name), `${id}: its name is not on the ladder`);
  assert.doesNotMatch(ladder, /Enterprise|Get in touch|Contact sales/i, 'an unlisted plan is on the ladder');
});

test('each plan’s credits are the shared config’s, with two decimals', () => {
  for (const id of ui.LISTED_PLAN_IDS) {
    const row = ui.PLAN_TABLE[id];
    assert.ok(ladder.includes(`${ui.formatCredits(row.creditsPerMonth)} Credits a month`), `${id}: the monthly figure`);
    assert.ok(ladder.includes(`${ui.formatCredits(row.creditsPerDay)} a day`), `${id}: the daily figure`);
  }
  // Pinned to the decided numbers too, so a change to the config is a change here on purpose (planning/pricing-2026-10-04.md).
  assert.match(ladder, /30\.00 Credits a month · 5\.00 a day/, 'Free: 5 a day, 30 a month');
  assert.match(ladder, /100\.00 Credits a month/, 'Pro');
  assert.match(ladder, /300\.00 Credits a month/, 'Max');
});

test('EVERY figure the ladder gives in Credits has two decimals', () => {
  const figures = [...ladder.matchAll(/(\d[\d,]*(?:\.\d+)?)\s+(?:Credits|a day|a month)/g)].map((m) => m[1]);
  assert.ok(figures.length >= 6, `found ${figures.length} credit figures: the check would be vacuous`);
  for (const figure of figures) assert.match(figure, /^\d[\d,]*\.\d{2}$/, `${figure} is not shown with two decimals`);
});

test('the paid tiers cannot be chosen while checkout is off, and the free one is the only one that is not marked unavailable', () => {
  const html = render(ui.h(ui.PlanLadder, { current: 'free', availability: 'unavailable', purchasable: [] }));
  assert.equal((text(html).match(/Not available yet/g) ?? []).length, 2, 'Pro and Max say so');
});

/* ------------------------------------------------------------------ the label --- */

const read = (...p) => readFileSync(join(WEB, ...p), 'utf8');
const parse = (src) => ts.createSourceFile('usage.tsx', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = (root) => { const all = []; const visit = (n) => { all.push(n); ts.forEachChild(n, visit); }; visit(root); return all; };

test('THE LABEL says it in the pricing page’s own words', () => {
  assert.equal(ui.BETA_LINE, 'Free while in beta. Paid plans start later.');
  const pricing = read('..', 'site', 'src', 'pages', 'pricing.astro');
  const heading = /<h1 id="pricing-title"[^>]*>([^<]*)<\/h1>/.exec(pricing)?.[1]?.trim();
  assert.ok(heading, 'could not read the pricing page’s heading: this test would compare nothing');
  assert.equal(`${heading}.`, ui.BETA_LINE, 'the app and the pricing page say different things about beta');
});

test('the label sits in the Plans section, ABOVE the ladder, in the page the ladder is on', () => {
  const src = read('src', 'routes', 'usage.tsx');
  const file = parse(src);
  const section = nodes(file).find((n) => ts.isJsxElement(n) && n.openingElement.tagName.getText() === 'section' && /plans-section/.test(n.openingElement.getText()));
  assert.ok(section, 'the plans section was not found');
  const text = section.getText();
  const label = text.indexOf('{BETA_LINE}');
  const ladderAt = text.indexOf('<PlanLadder');
  assert.ok(label > 0 && ladderAt > 0, 'the label or the ladder is missing from the section');
  assert.ok(label < ladderAt, 'the label is below the ladder');
  assert.match(src, /import \{ BETA_LINE, PlanLadder \} from '\.\.\/components\/plans'/);
});

test('the label is not a promise: it says nothing about when, and no referral or bonus credit is offered anywhere on the page', () => {
  const src = read('src', 'routes', 'usage.tsx').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(ui.BETA_LINE, /\d|soon|will|free credits|bonus|referral/i);
  assert.doesNotMatch(src, /referral|invite a friend|bonus credit/i, 'the usage page promises referral credits (they wait for M6)');
});
