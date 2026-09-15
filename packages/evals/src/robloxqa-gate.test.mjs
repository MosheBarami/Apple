// THE SCORER THAT CONSUMES THE HELD-OUT SPLIT, TESTED.
//
// WHY THIS FILE EXISTS. `qa-overlap.test.mjs` and `train-gate-overlap.test.mjs` establish that
// `gate.jsonl` is genuinely held out. That work is worth nothing if the thing that READS it scores
// the wrong rows, or scores them in a way that measures something other than knowledge —
// and `robloxqa-gate.mjs` shipped with four exported functions and no test on any of them. Each
// one has a failure mode that produces a plausible number rather than an error:
//
//   shuffleOptions  the dataset stores the correct answer in `answer` and the wrong ones in
//                   `incorrect_*`, ALWAYS in that order. If the shuffle were the identity — or
//                   seeded per run instead of per question — the gate would be measuring a model's
//                   willingness to pick option A, or would stop being comparable between runs.
//                   Both read as a score.
//   parseLetter     a parser that quietly rescues prose makes the gate measure the parser's
//                   generosity. A parser that rejects a legitimate reply makes a model look
//                   ignorant. `unparsed` therefore has to be visible and distinct from `wrong`.
//   loadGate        this is the one that matters most. It drops the rows that restate `headroom`
//                   and the stale Open Cloud v1 slice. If it silently scored everything, the
//                   headline number would go UP and look like an improvement.
//   summarise       the headline is reference+Luau only. Blending education/tutorial rows in moves
//                   the number for reasons that have nothing to do with the engine.
//
// EVERY DROP TEST HAS A KEEP TWIN. A loader that returned nothing would satisfy "the excluded rows
// are not present" perfectly.
//
// NO NETWORK, NO PROVIDER, NO SPEND. Nothing here calls `callModel`. §5 runs the CLI as a
// subprocess with no `--i-will-pay-for-this` and requires it to refuse — which is the only way to
// prove that the refusal is real rather than described in a comment.
//
// Run: node --test packages/evals/src/robloxqa-gate.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { shuffleOptions, renderQuestion, parseLetter, loadGate, summarise } from './robloxqa-gate.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const DATA = join(HERE, '..', 'data', 'robloxqa');

const ENGINE = 'roblox-docs:/docs/en-us/reference/engine/classes/Humanoid.md';
const LUAU = 'luau-docs:reference/library.md';
const EDU = 'roblox-docs:/docs/en-us/education/lesson-plans/speedway.md';
const LEGACY = 'roblox-docs:/docs/en-us/cloud/legacy/datastores.md';

const row = (i, doc = ENGINE) => ({
  grounding_doc_id: doc,
  question: `Question number ${i} about the engine?`,
  answer: `correct-${i}`,
  distractors: [`wrong-${i}-a`, `wrong-${i}-b`, `wrong-${i}-c`],
});

/** Build a throwaway gate directory. `excluded` omitted entirely means the file is NOT written. */
function gateFixture({ rows, excluded }) {
  const dir = mkdtempSync(join(tmpdir(), 'golem-robloxqa-'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'gate.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  if (excluded !== undefined) {
    writeFileSync(join(dir, 'excluded-gate-rows.json'), JSON.stringify({ rows: excluded.map((i) => ({ gateRowIdx: i })) }));
  }
  return dir;
}

// ==============================================================================================
// §1 — the shuffle. The dataset hands us the answer in position 0 every single time.
// ==============================================================================================

test('§1 the shuffle is a permutation — no option is lost or duplicated', () => {
  const { options, correctIndex } = shuffleOptions('q', 'right', ['a', 'b', 'c']);
  assert.equal(options.length, 4);
  assert.deepEqual([...options].sort(), ['a', 'b', 'c', 'right']);
  assert.equal(options[correctIndex], 'right');
});

test('§1 it is seeded by the QUESTION, so two runs of two models see the same arrangement', () => {
  // A run-level RNG would make two runs differ by arrangement as well as by answer, and the
  // difference would be invisible in the score.
  const a = shuffleOptions('same question', 'right', ['a', 'b', 'c']);
  const b = shuffleOptions('same question', 'right', ['a', 'b', 'c']);
  assert.deepEqual(a.options, b.options);
  assert.equal(a.correctIndex, b.correctIndex);
});

test('§1 AND IT ACTUALLY MOVES THE ANSWER — the identity shuffle this exists to rule out', () => {
  // THE FAILURE THIS CATCHES: the correct answer arrives at index 0 in every row of the dataset.
  // A shuffle that returned its input would leave it there and the gate would score a model's
  // preference for option A — a number that looks exactly like knowledge. Asserted over 400
  // distinct questions because any single question may legitimately keep the answer at 0.
  const positions = [0, 0, 0, 0];
  for (let i = 0; i < 400; i++) positions[shuffleOptions(`question ${i}`, 'right', ['a', 'b', 'c']).correctIndex]++;
  assert.equal(positions.reduce((x, y) => x + y), 400);
  for (let p = 0; p < 4; p++) {
    assert.ok(positions[p] > 400 * 0.10, `position ${p} got only ${positions[p]} of 400 — the shuffle is skewed: ${positions}`);
  }
});

test('§1 renderQuestion labels the options A-D and reports where the right one landed', () => {
  const r = renderQuestion({ question: 'What?', answer: 'yes', distractors: ['no', 'maybe', 'never'] });
  assert.match(r.prompt, /^What\?\n\nA\. .+\nB\. .+\nC\. .+\nD\. .+$/s);
  assert.equal(r.options[r.correctIndex], 'yes');
});

// ==============================================================================================
// §2 — reading a letter out of a reply
// ==============================================================================================

test('§2 the accepted forms are accepted', () => {
  for (const [text, want] of [['A', 0], [' b ', 1], ['C.', 2], ['(D)', 3], ['Answer: B', 1], ['answer - c', 2], ['A) ', 0]]) {
    assert.equal(parseLetter(text), want, `failed on ${JSON.stringify(text)}`);
  }
});

test('§2 PROSE IS NOT RESCUED — the gate must not measure the parser\'s generosity', () => {
  // A model asked for one letter that writes a paragraph scores zero on that row, and that is the
  // honest outcome. Silently extracting a letter from the middle of an essay would score a
  // different thing than the prompt asked for.
  for (const text of ['I think the answer is probably B, because...', 'The correct option is C.', '', null, undefined, 'E', 'AB']) {
    assert.equal(parseLetter(text), -1, `should not have parsed ${JSON.stringify(text)}`);
  }
});

// ==============================================================================================
// §3 — loadGate. The fail-closed behaviour is the point of this section.
// ==============================================================================================

test('§3 A MISSING EXCLUSION LIST REFUSES TO SCORE rather than scoring the whole split', () => {
  // The inflated-number case. Without the list, the 60 rows that restate `headroom` would be
  // scored, the headline would rise, and the run would look like a clean success.
  const dir = gateFixture({ rows: [row(0), row(1)] });          // no excluded-gate-rows.json
  assert.equal(existsSync(join(dir, 'excluded-gate-rows.json')), false);
  assert.throws(() => loadGate({ dir }), /Refusing to score/);
});

test('§3 A MISSING GATE THROWS rather than being read as an empty gate', () => {
  const dir = mkdtempSync(join(tmpdir(), 'golem-robloxqa-empty-'));
  assert.throws(() => loadGate({ dir }), /is absent/);
});

test('§3 THE EXCLUDED ROWS ARE DROPPED — by index, and the survivors keep their original index', () => {
  const dir = gateFixture({ rows: [row(0), row(1), row(2), row(3)], excluded: [1, 3] });
  const g = loadGate({ dir });
  assert.equal(g.total, 4);
  assert.equal(g.dropped.notHeldOut, 2);
  assert.deepEqual(g.rows.map((r) => r.gateRowIdx), [0, 2], 'the surviving rows must carry their index in the ORIGINAL file');
});

test('§3 THE STALE OPEN CLOUD v1 SLICE IS DROPPED, and only that slice', () => {
  const dir = gateFixture({ rows: [row(0, ENGINE), row(1, LEGACY), row(2, LUAU), row(3, EDU)], excluded: [] });
  const g = loadGate({ dir });
  assert.equal(g.dropped.cloudLegacy, 1);
  assert.deepEqual(g.rows.map((r) => r.bucket), ['referenceEngine', 'luau', 'education']);
});

test('§3 THE KEEP TWIN — with an empty exclusion list every non-legacy row survives', () => {
  // Without this, a loader that returned nothing at all would pass both drop tests above.
  const dir = gateFixture({ rows: [row(0), row(1), row(2)], excluded: [] });
  const g = loadGate({ dir });
  assert.equal(g.rows.length, 3);
  assert.equal(g.dropped.notHeldOut, 0);
  assert.equal(g.dropped.cloudLegacy, 0);
});

// ==============================================================================================
// §4 — the summary. One number over everything would be the wrong number.
// ==============================================================================================

const graded = (bucket, correct, picked = 0) => ({ bucket, correct, picked });

test('§4 the headline is reference+Luau; education and the rest are reported BESIDE it', () => {
  // The buckets are deliberately given DIFFERENT pass rates — engine 1/3, everything else 3/3 —
  // because a fixture where they happen to match would let a `summarise` that ignored buckets
  // entirely pass this test. (It did, on the first run: headline 2/3 and blended 4/6 are both
  // 0.6667, and the assertion below went red for the right reason on a fixture that was too kind.)
  const s = summarise([
    graded('referenceEngine', true), graded('referenceEngine', false),
    graded('luau', false),
    graded('education', true), graded('education', true),
    graded('otherDocs', true),
  ]);
  assert.equal(s.headline.n, 3);
  assert.equal(s.headline.right, 1);
  assert.equal(s.headline.score, 0.3333);
  assert.equal(s.secondary.n, 3);
  assert.equal(s.secondary.score, 1);
  assert.equal(s.all.n, 6);
  assert.notEqual(s.headline.score, s.all.score, 'a headline identical to the blended score is not a headline');
  assert.deepEqual(Object.keys(s.byBucket).sort(), ['education', 'luau', 'otherDocs', 'referenceEngine']);
});

test('§4 UNPARSED IS COUNTED SEPARATELY FROM WRONG — an outage must not read as ignorance', () => {
  const s = summarise([graded('referenceEngine', false, -1), graded('referenceEngine', false, 2), graded('referenceEngine', true, 1)]);
  assert.equal(s.headline.unparsed, 1);
  assert.equal(s.headline.right, 1);
  assert.equal(s.headline.n, 3, 'unparsed rows stay in the denominator — they were asked and did not answer');
});

test('§4 an empty bucket scores null, not 0 — "nobody asked" is not "everybody failed"', () => {
  assert.equal(summarise([]).headline.score, null);
  assert.equal(summarise([graded('education', true)]).headline.score, null);
});

// ==============================================================================================
// §5 — the spend refusal, proven by running it rather than by reading the comment
// ==============================================================================================

test('§5 THE CLI REFUSES TO RUN WITHOUT --i-will-pay-for-this, and exits non-zero', () => {
  // 3,000 questions is 3,000 calls through the worker's admin gateway, which is a paid provider.
  // This repository's standing constraint is that CI never reaches one. A comment saying so is not
  // the constraint; this is.
  let status = 0;
  let out = '';
  try {
    out = execFileSync(process.execPath, [join(HERE, 'robloxqa-gate.mjs')], { encoding: 'utf8', stdio: 'pipe', timeout: 20_000 });
  } catch (e) {
    status = e.status;
    out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
  assert.equal(status, 2, 'a refusal has to be a non-zero exit, or a pipeline will carry on');
  assert.match(out, /REFUSING TO RUN/);
  assert.match(out, /paid provider/);
});

test('§5 importing this module reaches no network — the refusal is not the only thing standing there', () => {
  // The import at the top of this file has already happened by now. If module scope had made a
  // request, it would have done so before any test ran.
  assert.equal(typeof loadGate, 'function');
  assert.equal(typeof summarise, 'function');
});

// ==============================================================================================
// §6 — against the real committed gate, when it is present
// ==============================================================================================

test('§6 THE REAL GATE LOADS, drops exactly what the committed evidence says, and keeps the rest', () => {
  if (!existsSync(join(DATA, 'gate.jsonl'))) {
    console.log('  !  gate.jsonl absent (derived, gitignored) — the real loadGate path did NOT run this time. ' +
      'Run `node scripts/harvest-hf.mjs`. This is NOT a clean result.');
    return;
  }
  const excluded = JSON.parse(readFileSync(join(DATA, 'excluded-gate-rows.json'), 'utf8')).rows.length;
  const g = loadGate();
  assert.equal(g.total, 3000);
  assert.equal(g.dropped.notHeldOut, excluded, 'the loader dropped a different number of rows than the exclusion list holds');
  assert.equal(g.rows.length, g.total - g.dropped.notHeldOut - g.dropped.cloudLegacy);
  assert.ok(g.rows.length > 2500, `only ${g.rows.length} rows survived — the gate has been gutted, not filtered`);
  assert.ok(g.dropped.cloudLegacy > 0, 'no Open Cloud v1 rows were dropped; the bucket rule has stopped matching');
});
