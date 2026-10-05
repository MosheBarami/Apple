// THE QUALITY BAR IS SAID AS THE BAR BEING BUILT TO, NEVER AS A CRITIC THAT IS RUNNING (M2 site fix cycle 2, finding 2).
//
// The front page said "A fresh blind critic sees only the request and screenshots of the result. It does not know how the piece was made", the catalog said "a blind critic
// rates it 8 or better", and the post said "No piece has passed it yet", which reads as pieces tried and failed. No critic harness is on this branch (handoff 3.1 to 3.3:
// scripts/eval, planning/critic-rubric.md), so nothing has been rated and the critic is not a thing that operates. The three figures of the bar (8/10, 0, 0) are the
// largest type on the page and read as results at a glance. So:
//   - while the repository has no critic harness, a sentence of any built page that says what the critic does has to say it is future or unbuilt (will, being built, being
//     made, not yet, not built, nothing has been rated), never the present tense of a running thing;
//   - while it has none, the post and the pages never say a piece "has not passed" the bar or "failed" it (that implies a rating happened), only that none has been rated;
//   - every row of the bar on the front page carries the word Target beside its figure.
// When a harness lands the first two stop applying (the pages are re-read by a person; the blog verifier fails the same day).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SITE, blocksOf, distPage, realPages, regionsWith, textOf } from './lib/dist.mjs';

const ROOT = join(SITE, '..', '..');
const harness = () => existsSync(join(ROOT, 'scripts', 'eval')) || existsSync(join(ROOT, 'planning', 'critic-rubric.md'));

/** What the critic is said to do: the critic and a verb of doing within one clause. */
const DOES = /\bcritic\b[^.!?:;]{0,40}\b(?:sees?|rates?|scores?|judges?|reads?|looks?|reviews?|grades?|knows?|checks?)\b/gi;
/** The words that make that stretch a statement about the future or about something unbuilt: a modal right there, not somewhere else in the sentence. */
const FUTURE = /\bwill\b|\bwould\b|\bto be\b|being (?:built|made|written)|\bnot (?:yet )?(?:built|running|made)\b|\bhas(?:n't| not)\b|\byet\b/i;
/** A rating that implies a piece was tried. */
const TRIED = /\b(?:has|have|had) not passed\b|\bnone has passed\b|\bno piece has passed\b|\bfailed (?:the|that) bar\b|\bpieces? (?:has|have) failed\b/i;

const sentences = (text) => text.split(/(?<=[.!?])\s+/);
/** The sentences that say the critic does something in the present tense. "A piece will go in the catalog only when ...: a blind critic rates it" is one: the modal is not on the critic. */
const present = (text) => sentences(text).filter((s) => [...s.matchAll(DOES)].some((m) => !FUTURE.test(m[0])));

test('the scanners can see: the sentences that shipped are present-tense critic claims, and the reworded ones are not', () => {
  for (const shipped of [
    'A fresh blind critic sees only the request and screenshots of the result.',
    'A piece goes in this catalog only when it passes the quality bar: a blind critic rates it 8 or better in every area.',
    'The bar is a blind critic that rates a piece 8 or better in every area, no play-test errors, and no false claims.',
    'or better in every area the critic looks at, with no serious flaw.',
    'A piece will go in this catalog only when it passes the quality bar: a blind critic rates it 8 or better in every area.',
  ]) assert.equal(present(shipped).length, 1, `not seen as a present-tense critic claim: "${shipped}"`);
  for (const ok of [
    'The bar is a fresh blind critic. It will see only the request and screenshots of the result.',
    'A blind critic will rate it 8 or better in every area.',
    'The critic is still being made.',
    'That critic is being built, so no piece has been rated against the bar yet.',
  ]) assert.equal(present(ok).length, 0, `read as a present-tense claim: "${ok}"`);
  assert.ok(TRIED.test('No piece has passed it yet.') && TRIED.test('None has passed the bar.'));
  assert.ok(!TRIED.test('No piece has been rated against the bar yet.'));
});

test('while no critic harness is in the repository, no built page says the critic does something in the present tense, or that a piece has not passed (it was never rated)', (t) => {
  if (harness()) return t.skip('a critic harness is in the repository: the pages are re-read by a person (tests/blog-post.test.mjs fails the same day)');
  const bad = [];
  let critics = 0;
  for (const { route, html } of realPages()) {
    const text = blocksOf(html).join(' ');
    critics += sentences(text).filter((s) => /\bcritic\b/i.test(s)).length;
    for (const s of present(text)) bad.push(`${route}: "${s.slice(0, 120)}" says the critic does it, and none is built`);
    for (const s of sentences(text)) if (TRIED.test(s)) bad.push(`${route}: "${s.slice(0, 120)}" implies pieces were rated`);
  }
  assert.ok(critics >= 4, `only ${critics} sentences about the critic were read: the scan is blind`);
  assert.deepEqual(bad, []);
});

test('every row of the bar on the front page carries the word Target beside its figure, not only the paragraph above it', () => {
  const bar = regionsWith(distPage('/').html, 'data-quality-bar')[0];
  assert.ok(bar, 'the front page has no data-quality-bar list');
  const rows = [...bar.inner.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) => textOf(m[1]));
  assert.ok(rows.length >= 3, `only ${rows.length} rows of the bar were found`);
  for (const row of rows) assert.match(row, /\bTarget\b/, `a row of the bar shows its figure with no "Target": "${row.slice(0, 60)}"`);
});
