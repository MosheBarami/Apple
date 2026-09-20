/**
 * "AND WHAT THE NEXT REQUEST WILL COST" — the half of G1 that was nowhere in the app.
 *
 * Measured on the live product on 2026-09-20: /app/usage showed "Today's Credits 222 of 231",
 * thirty days of bars and a breakdown of what the Credits went on, and no figure anywhere for what
 * spending them costs. The model menu read "Apple — Free · limited daily usage". `typicalCredits`
 * appeared nine times in the shipped bundle and every one of them was inside an object literal
 * nothing rendered. The only per-request number a customer could read was on /pricing and
 * /docs/credits-and-limits — pages you leave the app to reach.
 *
 * Two things are checked here, and the second is the one that rots:
 *
 *   THE ARITHMETIC. "How many more today" from a cost that is a RANGE has a most and a fewest, and
 *   quoting only the most is the flattering reading of a spread presented as a fact.
 *
 *   THE DERIVATION. The figure must come out of MODE_INFO through PRODUCT_MODE_TO_SPECIALIST, the
 *   same path /pricing and /docs/credits-and-limits take. A literal typed into the app is a price
 *   free to drift from the site's, and from the measurements in docs/COST-MODEL.md that
 *   scripts/check-credit-figures.mjs polices.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  MODE_INFO,
  PRODUCT_MODES,
  PRODUCT_MODES_OFFERED,
  PRODUCT_MODE_INFO,
  PRODUCT_MODE_TO_SPECIALIST,
} from '@golem/shared';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(WEB, '..', '..');
const ESBUILD = join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild');
const PAGE = readFileSync(join(WEB, 'src', 'routes', 'usage.tsx'), 'utf8');

/* --------------------------------------------- the block, compiled and executed --- */

const BEGIN = '/* ===== WHAT THE NEXT REQUEST COSTS: BEGIN';
const END = '/* ===== WHAT THE NEXT REQUEST COSTS: END ===== */';
const from = PAGE.indexOf(BEGIN);
const to = PAGE.indexOf(END);
assert.ok(from > 0 && to > from, 'the next-request-cost sentinels are gone from usage.tsx');

const dir = mkdtempSync(join(tmpdir(), 'reqcost-'));
const src = join(dir, 'block.ts');
writeFileSync(
  src,
  `import { MODE_INFO, PRODUCT_MODES_OFFERED, PRODUCT_MODE_INFO, PRODUCT_MODE_TO_SPECIALIST } from ${JSON.stringify(join(ROOT, 'packages', 'shared', 'src', 'index.ts'))};\n` +
    `import { formatNumber } from ${JSON.stringify(join(WEB, 'src', 'lib', 'format.ts'))};\n` +
    PAGE.slice(from, to) +
    '\nexport { REQUEST_COSTS };\n',
);
const out = join(dir, 'block.mjs');
execFileSync(ESBUILD, [src, '--bundle', '--format=esm', '--platform=neutral', '--outfile=' + out], { stdio: 'pipe' });
const { REQUEST_COSTS, requestsLeftLine, articleFor } = await import(`file://${out}`);

/* ------------------------------------------------------------- the arithmetic --- */

test('a cost that is a range answers with a range, and never only its flattering end', () => {
  // 231 Credits against an Agent run at 4-18: 12 at worst, 57 at best. Quoting 57 alone is the
  // number a customer would remember and the number they would not get.
  assert.equal(requestsLeftLine(231, 4, 18, 'day'), 'between 12 and 57 more today');
  assert.equal(requestsLeftLine(231, 2, 2, 'day'), 'about 115 more today');
  assert.equal(requestsLeftLine(231, 4, 18, 'month'), 'between 12 and 57 more this month');
});

test('it says when the balance will not stretch to one, rather than printing zero', () => {
  assert.equal(requestsLeftLine(1, 2, 2, 'day'), 'not enough left today for one');
  assert.equal(requestsLeftLine(0, 4, 18, 'day'), 'not enough left today for one');
  // Enough for a cheap run and not for a dear one: "up to", because the fewest really is none.
  assert.equal(requestsLeftLine(10, 4, 18, 'day'), 'up to 2 more today');
});

test('a balance it cannot read produces a sentence, not a number', () => {
  assert.equal(requestsLeftLine(Number.NaN, 2, 2, 'day'), 'we could not read what is left today');
  assert.equal(requestsLeftLine(-1, 2, 2, 'day'), 'we could not read what is left today');
});

test('the article matches the mode name', () => {
  assert.equal(articleFor('Plan'), 'A');
  assert.equal(articleFor('Agent'), 'An');
});

/* -------------------------------------------------------------- the derivation --- */

test('every offered mode has a per-request figure, and it is the published one', () => {
  assert.ok(REQUEST_COSTS.length > 0, 'the app shows no per-request cost at all');
  assert.deepEqual(
    REQUEST_COSTS.map((c) => c.mode),
    [...PRODUCT_MODES_OFFERED],
    'the app must price exactly the modes a person can choose',
  );
  for (const c of REQUEST_COSTS) {
    const published = String(MODE_INFO[PRODUCT_MODE_TO_SPECIALIST[c.mode]].typicalCredits);
    assert.equal(c.published, published.replace('-', '–'), `${c.mode} quotes a figure MODE_INFO does not`);
    assert.equal(c.name, PRODUCT_MODE_INFO[c.mode].name);
    assert.equal(c.low, Number(published.split('-')[0]));
    assert.ok(Number.isFinite(c.low) && Number.isFinite(c.high) && c.low > 0 && c.high >= c.low, `${c.mode} has no usable range`);
  }
});

test('a mode nobody can select is not priced', () => {
  const withdrawn = PRODUCT_MODES.filter((m) => !PRODUCT_MODES_OFFERED.includes(m));
  for (const m of withdrawn) {
    assert.equal(REQUEST_COSTS.some((c) => c.mode === m), false, `${m} is priced and cannot be chosen`);
  }
});

test('the figure is not a literal in the page — it is read from the table the site reads', () => {
  const block = PAGE.slice(from, to);
  assert.match(block, /MODE_INFO\[PRODUCT_MODE_TO_SPECIALIST\[m\]\]\.typicalCredits/, 'the price must be derived');
  // Commentary stripped first: a comment explaining what "2" means is not the number being
  // typed in, and this file's first run failed on its own doc comment saying exactly that.
  const code = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
  for (const m of PRODUCT_MODES_OFFERED) {
    const published = String(MODE_INFO[PRODUCT_MODE_TO_SPECIALIST[m]].typicalCredits);
    assert.equal(
      new RegExp(`['"\`]${published.replace('-', '[-–]')}['"\` ]`).test(code),
      false,
      `${published} is typed into usage.tsx as a literal and will drift from MODE_INFO`,
    );
  }
});

/* ------------------------------------------------------------------ the screen --- */

test('the credits card renders the figure and what is left, beside the balance', () => {
  const at = PAGE.indexOf('<div className="card credits-card">');
  assert.ok(at > 0, 'the credits card is gone');
  const card = PAGE.slice(at, PAGE.indexOf('<div className="card bars-card">', at));
  assert.match(card, /What your next request costs/, 'the card must say what the block is');
  assert.match(card, /REQUEST_COSTS\.map/, 'the figures are computed and never rendered — the defect this fixes');
  assert.match(card, /\{c\.published\} Credits/, 'the published figure has to reach the screen');
  assert.match(card, /requestsLeftLine\(view\.allowanceRemaining \+ view\.credits/, 'what is left must include purchased credits');
});
