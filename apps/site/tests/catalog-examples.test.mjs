// THE CATALOG SHOWS REQUESTS, NEVER RESULTS (handoff M2: "no example results yet"; plan section 4: the dev test set is frozen).
//
// Each of the four kinds of piece lists example requests. They are the requests the product is built against, copied word for word from
// planning/STUDPILOT-TEST-SET-DEV.md, so a request on the site is a request the product will be measured on, never an invented
// one. They are shown as requests ("Example requests", in the catalog's own words) and with nothing beside them that reads as an outcome:
// no score, no "built", no picture of the piece. This reads the BUILT catalog and the planning file.
//
// The line parser is run on a sample of the file first, and the result scanner on a sentence it must catch.
//
// Run with:  pnpm --filter @studpilot/site build && node --test tests/catalog-examples.test.mjs   (from apps/site)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE, distPage, regionsWith, textOf } from './lib/dist.mjs';

const TEST_SET = join(SITE, '..', '..', 'planning', 'STUDPILOT-TEST-SET-DEV.md');

/** The request text of every line of the form "- U01: <request>". */
function requestsIn(markdown) {
  return [...markdown.matchAll(/^- [A-Z]\d{2}: (.+)$/gm)].map((m) => m[1].trim());
}

/** Words that turn a request into a claim about an outcome. */
const OUTCOME = /\b(?:built|passed|scored|rated|looks great|works perfectly|generated in|took \d|minutes? to build)\b|\b\d+(?:\.\d+)?\s*\/\s*10\b/i;

test('the parsers can see: the test set yields requests, and the outcome scanner catches a result', () => {
  const sample = '## UI\n- U01: a shop screen for a pet simulator\n- S02: a click-to-earn system\nnot a request line\n';
  assert.deepEqual(requestsIn(sample), ['a shop screen for a pet simulator', 'a click-to-earn system']);
  assert.match('Built in 4 minutes, scored 9/10.', OUTCOME);
  assert.doesNotMatch('a treasure chest that opens when you press E and gives coins with a sparkle', OUTCOME);
  const all = requestsIn(readFileSync(TEST_SET, 'utf8'));
  assert.equal(all.length, 60, 'the dev test set is the frozen 60 requests');
});

test('every example request on the catalog is a line of the frozen dev test set, word for word', () => {
  const frozen = new Set(requestsIn(readFileSync(TEST_SET, 'utf8')));
  const page = distPage('/catalog/');
  const listed = regionsWith(page.html, 'class="requests"').flatMap((r) => [...r.inner.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) => textOf(m[1])));
  assert.ok(listed.length >= 8, `only ${listed.length} example requests were found on the catalog`);
  for (const request of listed) assert.ok(frozen.has(request), `"${request}" is not a request of planning/STUDPILOT-TEST-SET-DEV.md`);
  assert.equal(new Set(listed).size, listed.length, 'an example request is listed twice');
});

test('the four kinds each carry two or three example requests, labelled as requests', () => {
  const page = distPage('/catalog/');
  const kinds = [...page.html.matchAll(/<article\b[^>]*aria-labelledby="kind-([a-z]+)"[\s\S]*?<\/article>/g)];
  assert.deepEqual(kinds.map((k) => k[1]), ['ui', 'system', 'prop', 'area']);
  for (const [block, id] of kinds) {
    const n = [...block.matchAll(/<li\b/g)].length;
    assert.ok(n >= 2 && n <= 3, `${id} has ${n} example requests; the catalog shows two or three`);
    assert.match(textOf(block), /Example requests/, `${id} does not label its list as example requests`);
  }
});

test('nothing on the catalog reads as a result, and the page says there are no examples yet', () => {
  const page = distPage('/catalog/');
  const text = textOf(page.html);
  assert.doesNotMatch(text, OUTCOME, 'the catalog states an outcome');
  assert.match(text, /No examples yet/);
  assert.match(text, /Examples arrive when pieces pass/);
});
