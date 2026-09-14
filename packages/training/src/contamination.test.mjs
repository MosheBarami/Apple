// The guard that keeps training data out of the eval set.
//
// WHY IT MATTERS MORE THAN ITS SIZE SUGGESTS. If a training example overlaps a task the model is
// later scored on, every eval number afterwards is inflated and NOTHING LOOKS WRONG — the scores
// simply come out better. There is no crash, no warning, and the failure is indistinguishable from
// the model having improved. It is the observation-failure shape aimed at the one instrument that
// tells us whether the training worked.
//
// `shingles` and `contaminated` were unexported until now, so this mechanism had never been run by
// a test. The backlog row cited "build-dataset.mjs 8-word shingle vs packages/evals tasks", which
// names the approach and proves nothing about it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contaminated, shingles } from './build-dataset.mjs';

const words = (n, seed = 'w') => Array.from({ length: n }, (_, i) => `${seed}${i}`).join(' ');
const setOf = (text, n = 8) => new Set(shingles(text, n));

/* ------------------------------------------------------------------- shingles itself --- */

test('an n-word window slides one word at a time', () => {
  assert.deepEqual([...shingles('a b c d', 2)], ['a b', 'b c', 'c d']);
});

test('text SHORTER than the window yields nothing, rather than one short shingle', () => {
  // The boundary that decides whether a 7-word overlap can ever match an 8-word set.
  assert.deepEqual([...shingles('a b c', 8)], []);
  assert.deepEqual([...shingles(words(7), 8)], []);
  assert.equal([...shingles(words(8), 8)].length, 1, 'exactly at the window, exactly one shingle');
});

/* ------------------------------------------------------------ the guard, both directions --- */

test('AN OVERLAPPING EXAMPLE IS CAUGHT — the case the guard exists for', () => {
  const evalText = words(20, 'task');
  const evalSet = setOf(evalText);
  // An example that happens to contain eight consecutive words from an eval prompt.
  const stolen = evalText.split(' ').slice(5, 13).join(' ');
  assert.equal(stolen.split(' ').length, 8);
  assert.equal(contaminated({ doc: `preamble ${stolen} trailing` }, evalSet), true);
});

test('AN UNRELATED EXAMPLE IS NOT CAUGHT — the control, without which the above proves nothing', () => {
  // A guard that returned true for everything would pass the test above and be useless.
  const evalSet = setOf(words(20, 'task'));
  assert.equal(contaminated({ doc: words(20, 'other') }, evalSet), false);
});

test('a SEVEN-word overlap is below the window and is not caught', () => {
  // Stated rather than discovered later: the threshold is a real threshold, and short incidental
  // phrases shared between a corpus and a prompt are not contamination.
  const evalText = words(20, 'task');
  const evalSet = setOf(evalText);
  const short = evalText.split(' ').slice(5, 12).join(' ');
  assert.equal(short.split(' ').length, 7);
  assert.equal(contaminated({ doc: `preamble ${short} trailing` }, evalSet), false);
});

test('the overlap is caught wherever it sits — start, middle or end of the example', () => {
  const evalText = words(20, 'task');
  const evalSet = setOf(evalText);
  const stolen = evalText.split(' ').slice(0, 8).join(' ');
  for (const doc of [stolen, `lead ${stolen}`, `${stolen} tail`, `lead ${stolen} tail`]) {
    assert.equal(contaminated({ doc }, evalSet), true, `missed in: ${doc.slice(0, 30)}`);
  }
});

/* ------------------------------------------------------------------ the fail-open case --- */

test('AN EMPTY EVAL SET MAKES EVERY EXAMPLE CLEAN — documented, not endorsed', () => {
  // This is fail-OPEN, and it is the shape this repository keeps finding: a guard that cannot see
  // renders as a guard that saw nothing wrong. An eval task directory that moved, failed to parse,
  // or was filtered to nothing would disable contamination checking entirely.
  //
  // It is not silent, and that is the only reason it stands: build-dataset's main() prints
  // `eval contamination guard: N shingles from packages/evals/tasks`, so a zero denominator is on
  // screen. But the announcement lives in the CALLER. This function, handed an empty set, reports
  // every example as clean and says nothing — so any future caller that skips the log inherits a
  // guard that guards nothing.
  //
  // Asserted here so the behaviour is a decision on the record rather than an accident, and so it
  // reddens the day someone changes it without meaning to.
  const stolen = words(20, 'task');
  assert.equal(contaminated({ doc: stolen }, new Set()), false);
});

test('the caller announces its denominator, which is what makes the case above tolerable', () => {
  // §6.3: print the denominator. If this line ever disappears, the fail-open above becomes silent
  // and the test above stops being a documented decision.
  const src = new URL('./build-dataset.mjs', import.meta.url);
  const text = readFileSync(src, 'utf8');
  assert.match(text, /eval contamination guard: \$\{evalSet\.size\} shingles/);
});
