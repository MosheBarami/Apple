/**
 * PROMPT TEMPLATES, IN THE COMPOSER — and the seed that ate people's drafts.
 *
 * Two defects, and the first one is the reason the second was never noticed.
 *
 *   1. SEEDING REPLACED THE WHOLE BOX. `useEffect(() => { if (seed) setText(seed); }, [seed])`.
 *      Anybody who had begun typing and then clicked a suggestion, or arrived on a handoff with a
 *      draft restored from a previous visit, watched their own sentence vanish and be replaced by
 *      somebody else's. The draft store faithfully persisted the replacement a moment later.
 *
 *   2. A TEMPLATE WAS ONLY REACHABLE AT CREATION. `PROJECT_TEMPLATES` — five pre-written first
 *      requests, already written, already tested, already careful about not claiming to ship
 *      content — was offered in the new-project dialog and nowhere else. On the second message of
 *      a project, and every message after it, there was no way to reach one.
 *
 * The vocabulary is NOT duplicated for this. The composer offers the same list the dialog does,
 * minus the blank start, which is the one entry whose prompt is null: "Start empty" inserted into
 * a message box would insert nothing and read as a control that does not work.
 *
 * Run with:  node --test tests/composer-templates.test.mjs      (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BLANK_TEMPLATE_ID, PROJECT_TEMPLATES, insertableTemplates } from '../src/lib/project-templates.ts';
import { insertAtCursor } from '../src/lib/selection-reference.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPOSER = readFileSync(join(HERE, '..', 'src', 'components', 'ws', 'composer.tsx'), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const CODE = stripComments(COMPOSER);

/* ------------------------------------------------------------------ the list ---- */

test('the composer offers every template that has a prompt, and only those', () => {
  const offered = insertableTemplates();
  assert.ok(offered.length >= 4, 'the picker must not be empty');
  for (const t of offered) {
    assert.equal(typeof t.prompt, 'string');
    assert.ok(t.prompt.length > 0, `${t.id} would insert nothing`);
  }
  assert.ok(!offered.some((t) => t.id === BLANK_TEMPLATE_ID), 'an empty start is not something to insert');
  assert.equal(offered.length, PROJECT_TEMPLATES.filter((t) => t.prompt !== null).length);
});

test('the list is the dialog’s list, not a second copy of it', () => {
  // A second vocabulary drifts, and the drift shows up as a template that exists in one place and
  // not the other — which is exactly the failure the module's own header warns about.
  for (const t of insertableTemplates()) {
    assert.ok(PROJECT_TEMPLATES.includes(t), `${t.id} is not one of the project templates`);
  }
});

/* ------------------------------------------------------------------ the insert ---- */

test('inserting a template into a half-written message keeps what was written', () => {
  // THE DEFECT, stated as arithmetic. `setText(seed)` answers 'Build a small dropper tycoon…'
  // for this input; the whole first half of the person's sentence is gone.
  const draft = 'in the lobby, ';
  const template = insertableTemplates()[0].prompt;
  const out = insertAtCursor(draft, template, draft.length, draft.length);
  assert.ok(out.text.startsWith('in the lobby,'), 'the person’s own words must survive');
  assert.ok(out.text.includes(template));
  assert.equal(out.caret, out.text.length, 'the caret ends after what was inserted');
});

test('inserting into an empty box is exactly the template, with no leading space', () => {
  const template = insertableTemplates()[0].prompt;
  assert.equal(insertAtCursor('', template, 0, 0).text, template);
});

/* ------------------------------------------------------------------ the wiring ---- */

test('the seed no longer replaces the box', () => {
  assert.equal(/setText\(seed\)/.test(CODE), false, 'seeding still overwrites whatever was there');
  const effect = CODE.slice(CODE.indexOf('seed'), CODE.indexOf('draftKey === lastKey.current'));
  assert.match(effect, /insertAtCursor|insertPhrase/, 'the seed has to go in at the caret like any other insertion');
});

test('the composer has a template picker wired to the shared list', () => {
  assert.match(CODE, /insertableTemplates/);
  assert.match(CODE, /Popover/, 'the existing primitive, not a second menu implementation');
  assert.match(COMPOSER, /Create/);
  assert.match(COMPOSER, /Starting points/);
});

test('all three insertions go through the one function', () => {
  // One function that puts a phrase in the box, so the Studio-selection chip, the seed and the
  // template picker cannot disagree about spacing or about where the caret lands.
  assert.match(CODE, /const insertPhrase = \(/);
  // The chip and the picker call it directly.
  assert.match(CODE, /insertPhrase\(selectionReference\(selection\)\)/);
  assert.match(CODE, /insertPhrase\(t\.prompt/);
  // The seed reaches it through a ref, because the effect must not list a function that closes
  // over `text` in its dependencies — that re-runs on every keystroke and re-inserts the seed
  // into the sentence being typed.
  assert.match(CODE, /insertRef\.current = insertPhrase/);
  assert.match(CODE, /if \(seed\) insertRef\.current\(seed\)/);
  // And nothing else in the file rebuilds the insertion by hand. The @-mention picker inserts
  // too, and it hands its result to the same tail rather than writing a second copy of "set the
  // text, clamp it, put the caret back after a paint".
  assert.equal([...CODE.matchAll(/setText\(next\.text/g)].length, 1, 'the insertion tail is written once');
  assert.match(CODE, /applyInsertion\(insertAtCursor\(/);
  assert.match(CODE, /applyInsertion\(applyMention\(/);
});
