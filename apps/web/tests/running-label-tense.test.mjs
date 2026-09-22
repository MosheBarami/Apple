// The one row that is running reads as happening now — all of it.
//
// The activity table is written in the past tense and `presentTense` turns a label into its running
// form. It used to move only the first verb, so the running playtest row read "Running the game and
// checked it": half now, half over, on the row whose whole job is to say what is happening. Found on
// the chat specimen (routes/studio-preview.tsx), not by any test.
//
// DERIVED, NOT LISTED: the labels come from the tool vocabulary itself and the verbs from the tense
// table, so a tool added tomorrow with a compound label is held to the same rule without anyone
// remembering this file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SRC = join(import.meta.dirname, '..', 'src');
const { presentTense, PAST_VERBS } = await import(pathToFileURL(join(SRC, 'components/ws/execution-model.ts')).href);
const { TOOL } = await import(pathToFileURL(join(SRC, 'components/ws/tool-vocabulary.ts')).href);

const labels = Object.values(TOOL).map((entry) => entry.label);
const pastWords = new Set(PAST_VERBS.filter((verb) => !verb.includes(' ')).map((verb) => verb.toLowerCase()));

test('the derivations found something to check', () => {
  assert.ok(labels.length > 50, `only ${labels.length} tool labels were read`);
  assert.ok(pastWords.size > 20, `only ${pastWords.size} past-tense verbs were read`);
  assert.ok(labels.some((label) => / and | or |, /.test(label)), 'no compound label exists, so the property below is untested');
});

test('a running label keeps no past-tense verb from the table, in any clause', () => {
  const stale = [];
  for (const label of labels) {
    const running = presentTense(label);
    // Only the words that open a clause are verbs here; "Set properties" must not trip on a noun.
    const openers = running.split(/, | and | or /).map((clause) => clause.split(' ')[0].toLowerCase());
    for (const word of openers) if (pastWords.has(word)) stale.push(`${label} -> ${running}`);
  }
  assert.deepEqual(stale, []);
});

test('a clause that is not a verb is left exactly as written', () => {
  assert.equal(presentTense('Checked composition and intent'), 'Checking composition and intent');
  assert.equal(presentTense('Ran the game and checked it'), 'Running the game and checking it');
});
