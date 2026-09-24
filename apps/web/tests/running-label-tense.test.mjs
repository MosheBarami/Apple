// The line that says what is running reads as happening now — all of it.
//
//[[ RESTATED 2026-09-24 (owner decision D-THINK-1). This held execution-model.ts's `presentTense`,
//   which turned the past-tense activity labels into a running row's label; it once moved only the
//   first verb, so the running playtest row read "Running the game and checked it". That model is
//   gone with the trace it fed: the live line now speaks each tool's own `live` / `on` phrase from
//   tool-vocabulary.ts. Same property, on the phrases actually shown: no clause is in the past. ]]
//
// DERIVED, NOT LISTED: the phrases come from the tool vocabulary itself, so a tool added tomorrow
// with a compound phrase is held to the same rule without anyone remembering this file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SRC = join(import.meta.dirname, '..', 'src');
const { TOOL } = await import(pathToFileURL(join(SRC, 'components/ws/tool-vocabulary.ts')).href);

const phrases = Object.values(TOOL).flatMap((entry) => [entry.live, entry.on].filter(Boolean));
const clauses = (phrase) => phrase.split(/, | and | or /);

test('the derivation found something to check', () => {
  assert.ok(phrases.length > 50, `only ${phrases.length} live phrases were read`);
  assert.ok(phrases.some((phrase) => clauses(phrase).length > 1), 'no compound phrase exists, so the property below is untested');
});

test('a running phrase opens no clause with a past-tense verb', () => {
  const stale = [];
  for (const phrase of phrases) {
    for (const clause of clauses(phrase)) if (/^[A-Za-z]+ed\b/.test(clause)) stale.push(phrase);
  }
  assert.deepEqual(stale, []);
  assert.equal(/^[A-Za-z]+ed\b/.test('Ran the game and checked it'.split(/ and /)[1]), true, 'the check would miss the defect it is for');
});
