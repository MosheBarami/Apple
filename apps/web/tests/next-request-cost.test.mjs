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
 *   THE DERIVATION. The figure must come from PRODUCT_MODE_INFO for the same Plan/Agent value the
 *   page renders. A literal typed into the app is a price free to drift from the shared contract.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  PRODUCT_MODES,
  PRODUCT_MODE_INFO,
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
  `import { PRODUCT_MODES, PRODUCT_MODE_INFO } from ${JSON.stringify(join(ROOT, 'packages', 'shared', 'src', 'index.ts'))};\n` +
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

test('both product modes have a per-request figure, and it is the published one', () => {
  assert.ok(REQUEST_COSTS.length > 0, 'the app shows no per-request cost at all');
  assert.deepEqual(
    REQUEST_COSTS.map((c) => c.mode),
    [...PRODUCT_MODES],
    'the app must price exactly Plan and Agent from the shared ProductMode list',
  );
  for (const c of REQUEST_COSTS) {
    const published = String(PRODUCT_MODE_INFO[c.mode].typicalCredits);
    assert.equal(c.published, published.replace('-', '–'), `${c.mode} quotes a figure PRODUCT_MODE_INFO does not`);
    assert.equal(c.name, PRODUCT_MODE_INFO[c.mode].name);
    assert.equal(c.low, Number(published.split('-')[0]));
    assert.ok(Number.isFinite(c.low) && Number.isFinite(c.high) && c.low > 0 && c.high >= c.low, `${c.mode} has no usable range`);
  }
});

test('Autonomous is not priced as a build mode', () => {
  assert.equal(REQUEST_COSTS.some((c) => c.mode === 'autonomous'), false);
});

test('the figure is not a literal in the page — it is read from the table the site reads', () => {
  const block = PAGE.slice(from, to);
  assert.match(block, /PRODUCT_MODE_INFO\[m\]\.typicalCredits/, 'the price must be derived from the direct mode');
  assert.match(block, /PRODUCT_MODES\.map\(\(m\)/, 'the shared ProductMode list must drive the rows directly');
  // Commentary stripped first: a comment explaining what "2" means is not the number being
  // typed in, and this file's first run failed on its own doc comment saying exactly that.
  const code = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
  for (const m of PRODUCT_MODES) {
    const published = String(PRODUCT_MODE_INFO[m].typicalCredits);
    assert.equal(
      new RegExp(`['"\`]${published.replace('-', '[-–]')}['"\` ]`).test(code),
      false,
      `${published} is typed into usage.tsx as a literal and will drift from PRODUCT_MODE_INFO`,
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

/*
 * SEEN ON THE LIVE PAGE, WHICH IS WHY THESE NUMBERS ARE THE ONES THEY ARE.
 *
 * The Usage page of an account holding a large credit grant read "about 500,000,169 more today"
 * and, beside it, "between 55,555,574 and 250,000,084 more". Every digit was correct. Nothing was
 * broken. It was unreadable, and a nine-digit figure in a sentence about your next request reads
 * as a bug whether or not it is one — which is the whole reason the owner asked to be shown the
 * screen rather than the test results.
 *
 * The cases below pin the boundary from BOTH sides, because a ceiling that swallows ordinary
 * numbers is a worse defect than the one it fixes: somebody with fourteen runs left needs to be
 * told fourteen.
 */
test('a count that has stopped being information is not printed as one', () => {
  // The live values. 1,000,000,338 spendable against a 2-credit Plan request.
  assert.equal(requestsLeftLine(1_000_000_338, 2, 2, 'day'), 'far more than you can use today');
  assert.equal(requestsLeftLine(1_000_000_338, 4, 18, 'day'), 'far more than you can use today');
  assert.equal(requestsLeftLine(1_000_000_338, 4, 18, 'month'), 'far more than you can use this month');
});

test('the ceiling does not swallow a number somebody actually needs', () => {
  // Ordinary balances still report exactly, and the eight cases above this block prove the common
  // shapes are untouched. These sit just under the boundary on purpose.
  assert.equal(requestsLeftLine(998, 2, 2, 'day'), 'about 499 more today');
  assert.equal(requestsLeftLine(231, 4, 18, 'day'), 'between 12 and 57 more today');
  assert.equal(requestsLeftLine(9998, 2, 2, 'month'), 'about 4,999 more this month');
});

test('a spread that straddles the ceiling reports the floor rather than a nine-digit top', () => {
  // The dear end is still countable, the cheap end is not. Answering "between 200 and 1,000" is
  // fine; the shape to avoid is a countable floor paired with a top nobody can read.
  //
  // THE FIRST VERSION OF THIS CASE WAS WRONG AND THE TEST CAUGHT IT: it used 6,000,000 against a
  // 10,000-credit high end, which is 600 at the FEWEST — already over the ceiling, so the whole
  // line collapsed to "far more than you can use today" and the branch under test never ran. The
  // fix is arithmetic in the test, not a loosened assertion in the code.
  const line = requestsLeftLine(2_000, 2, 10, 'day');
  assert.equal(line, 'at least 200 more today');
  assert.doesNotMatch(line, /\d{4,}/, 'an unreadable count came back on the high end of a spread');
});

test('every line this function can produce is short enough to read', () => {
  const cases = [[0,4,18],[1,2,2],[10,4,18],[231,4,18],[998,2,2],[6_000_000,1,10_000],
    [1_000_000_338,2,2],[1_000_000_338,4,18],[Number.NaN,2,2]];
  for (const period of ['day','month']) {
    for (const [s,l,h] of cases) {
      const line = requestsLeftLine(s,l,h,period);
      assert.doesNotMatch(line, /\d{7,}/,
        `"${line}" carries a seven-digit number; no sentence about your next request should`);
      assert.ok(line.length <= 46, `"${line}" is ${line.length} characters — too long for the line it sits on`);
    }
  }
});
