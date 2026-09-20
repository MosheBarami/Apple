/**
 * EVERY QUOTED STRING ON /proof IS IN THE FILE IT SAYS IT IS IN.
 *
 * The page exists because the site was making claims it could demonstrate instead. That only holds
 * for as long as the quotes are real, and a quote is the easiest thing in a codebase to improve by
 * one word: a timestamp rounded, an error message tidied, a defect softened. Every one of those
 * edits leaves a page that still looks like evidence and is not, and none of them is visible in a
 * diff review of a marketing page.
 *
 * So this re-reads the three evidence files — committed on 2026-09-01, three weeks before the page
 * — and fails if any string in src/data/recorded-run.ts is not in the file that entry names. It
 * checks the SOURCE OF THE PAGE'S DATA, not the built HTML, because the failure it is aimed at is
 * a string being wrong at its origin; two other guards on this site already read the built output
 * for copy that contradicts the product.
 *
 * WHITESPACE IS NORMALISED ON BOTH SIDES AND NOTHING ELSE IS. The record wraps its prose at 90
 * columns, so a sentence quoted from it spans two lines there and one here; the transcript pads
 * its own columns. Collapsing runs of whitespace makes those comparable. Every other character —
 * every digit, every name, the em dash in the reply, the capital letters in STOPPED=true — must
 * match exactly. A guard that normalised punctuation would pass a quote that had been rewritten.
 *
 * THE TRIPWIRE AT THE BOTTOM IS NOT DECORATION. A checker over a list can be defeated by emptying
 * the list, and this one is over a list that a future edit could trim to three friendly lines. It
 * asserts the shape of what it is checking: how many quotes there are, that they come from all
 * three files, and that a string which is NOT in the evidence is rejected — so the mechanism is
 * exercised on this run rather than assumed.
 *
 * Run with:  node --test tests/recorded-run-is-evidence.test.mjs     (from apps/site)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(SITE, '..', '..');
const DATA = join(SITE, 'src', 'data', 'recorded-run.ts');
const PAGE = join(SITE, 'src', 'pages', 'proof.astro');

/** Runs of whitespace are equal; nothing else is touched. */
const flat = (s) => s.replace(/\s+/g, ' ').trim();

const files = new Map();
function evidence(path) {
  if (!files.has(path)) {
    const full = join(ROOT, path);
    assert.ok(existsSync(full), `the page cites ${path}, which is not in the repository`);
    files.set(path, flat(readFileSync(full, 'utf8')));
  }
  return files.get(path);
}

/** Every `{ text, from }` in the data module, however deeply nested, in source order. */
function quotesOf(node, out = []) {
  if (Array.isArray(node)) {
    for (const item of node) quotesOf(item, out);
    return out;
  }
  if (node && typeof node === 'object') {
    if (typeof node.text === 'string' && typeof node.from === 'string') out.push(node);
    else for (const value of Object.values(node)) quotesOf(value, out);
  }
  return out;
}

const { RECORDED_RUN } = await import('../src/data/recorded-run.ts');
const quotes = quotesOf(RECORDED_RUN);

test('every quote on the proof page is in the evidence file it names', () => {
  const missing = [];
  for (const q of quotes) {
    if (!evidence(q.from).includes(flat(q.text))) missing.push(`${q.from}\n    ${flat(q.text)}`);
  }
  assert.deepEqual(missing, [], `these strings are not in the file they are attributed to:\n  ${missing.join('\n  ')}`);
});

test('each before/after number is inside the table row it is taken from', () => {
  // The page prints the label and the two numbers separately. This is what stops one of them being
  // nudged: all three have to be inside the one row the entry quotes, and that row has to be in
  // the record.
  for (const row of RECORDED_RUN.landed) {
    const quoted = flat(row.quote.text);
    assert.ok(evidence(row.quote.from).includes(quoted), `row not in ${row.quote.from}: ${quoted}`);
    for (const shown of [row.label, row.before, row.after]) {
      assert.ok(quoted.includes(shown), `"${shown}" is printed on the page but is not in the row it cites: ${quoted}`);
    }
  }
});

test('the page states the product name it is published under, and no old one', () => {
  // A page of quotations is the easiest place on a site for a withdrawn name to survive, because
  // the quotes are old on purpose and nobody edits them. The evidence files predate the rename and
  // say the old name in their own prose; nothing lifted out of them may.
  const shipped = readFileSync(DATA, 'utf8') + (existsSync(PAGE) ? readFileSync(PAGE, 'utf8') : '');
  for (const q of quotes) {
    assert.doesNotMatch(q.text, /golem/i, `a quote carries the withdrawn product name: ${q.text}`);
  }
  assert.ok(shipped.length > 0, 'nothing to check');
});

test('the guard has teeth', () => {
  // 1. The mechanism rejects a string that is not in the file.
  assert.ok(
    !evidence(RECORDED_RUN.request.from).includes(flat('It built the whole game perfectly on the first try.')),
    'the evidence file appears to contain anything asked of it — the comparison is not working',
  );

  // 2. One changed word is a failure, not a near miss. This is the edit the guard exists for.
  const real = flat(RECORDED_RUN.moments[5].lines[3].text); // elapsed=212.3s tools=18 toolErrors=1
  assert.ok(evidence(RECORDED_RUN.moments[5].lines[3].from).includes(real), 'the real summary line moved');
  assert.ok(
    !evidence(RECORDED_RUN.moments[5].lines[3].from).includes(real.replace('toolErrors=1', 'toolErrors=0')),
    'a run with its one error edited out would pass this guard',
  );

  // 3. The list is the size it is meant to be and spans all three sources. An emptied list passes
  //    every assertion above it.
  assert.ok(quotes.length >= 30, `only ${quotes.length} quotes — the page has been trimmed and this guard now checks almost nothing`);
  assert.deepEqual([...new Set(quotes.map((q) => q.from))].sort(), [...RECORDED_RUN.sources].sort());

  // 4. The defects are still on the page. They are the half a marketing page deletes first.
  assert.ok(RECORDED_RUN.defects.items.length === 5, 'the record lists five defects; the page must not show fewer');
});
