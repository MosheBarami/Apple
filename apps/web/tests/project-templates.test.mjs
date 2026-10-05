/**
 * STARTING POINTS, WHICH ARE REQUESTS AND NOT CONTENT.
 *
 * A new project opened on an empty conversation and three generic suggestion chips. There was no
 * template concept anywhere in the product — and the one time this product claimed there was, the
 * claim was false and had to be taken down: apps/site/src/pages/index.astro carries a comment
 * recording that a "3,017 game templates" line was REMOVED because nothing behind it was real.
 *
 * So a template here is one thing and one thing only: THE FIRST REQUEST, WRITTEN OUT. It seeds the
 * composer through the handoff the workspace already has — the same path the suggestion chips and
 * the roadmap's "open this in the conversation" take — and nothing happens until the person reads
 * it and presses send. No geometry ships with it, no scripts, no place.
 *
 * WHAT THESE TESTS GUARD is that distinction, because it is the one that will drift. A blurb that
 * says "comes with a working shop" is the 3,017-templates claim again, one card at a time.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BLANK_TEMPLATE_ID, PROJECT_TEMPLATES, insertableTemplates } from '../src/lib/project-templates.ts';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const DASH = readFileSync(join(WEB, 'src', 'routes', 'dashboard.tsx'), 'utf8');
const WS = readFileSync(join(WEB, 'src', 'routes', 'workspace.tsx'), 'utf8');

// ------------------------------------------------------------------------- the set itself ---

test('every template is complete and named once', () => {
  const ids = new Set();
  for (const t of PROJECT_TEMPLATES) {
    assert.ok(t.id && !ids.has(t.id), `duplicate or missing id: ${t.id}`);
    ids.add(t.id);
    assert.ok(t.label && t.label.length <= 28, `${t.id}: the label is missing or too long for a card`);
    assert.ok(t.blurb && t.blurb.length <= 120, `${t.id}: the blurb is missing or too long for a card`);
  }
  assert.ok(PROJECT_TEMPLATES.length >= 3, 'a picker with two options is a checkbox');
});

test('blank is in the set, is first, and carries no request', () => {
  // It is the default, and it has to be an option a person can see and choose rather than the
  // absence of a choice — otherwise "I just want an empty project" reads as a failure to pick.
  const first = PROJECT_TEMPLATES[0];
  assert.equal(first.id, BLANK_TEMPLATE_ID);
  assert.equal(first.prompt, null, 'the blank start would seed a request');
});

test('EVERY OTHER TEMPLATE IS A REQUEST, IN THE IMPERATIVE', () => {
  // The prompt is text the user is about to send as their own message. A prompt phrased as a
  // description of what exists ("A tycoon with three droppers") would arrive in the conversation as
  // a statement of fact about a place that is empty.
  for (const t of PROJECT_TEMPLATES.filter((x) => x.id !== BLANK_TEMPLATE_ID)) {
    assert.ok(typeof t.prompt === 'string' && t.prompt.length > 40, `${t.id}: the prompt is missing or too thin`);
    assert.match(t.prompt, /^Build /, `${t.id}: the prompt does not ask for anything`);
  }
});

test('NOTHING CLAIMS TO SHIP WITH ANYTHING', () => {
  //[[ The 3,017-templates line, as a guard. apps/site/src/pages/index.astro records that this
  //   product already published a template claim it could not keep and had to remove it. A card
  //   saying a template "comes with" or "includes" a working shop is the same claim at a smaller
  //   size, and it is false for the same reason: a seeded request builds nothing until it is sent,
  //   and what comes back is whatever the agent actually manages. ]]
  const claims = /\b(pre-?built|pre-?made|ready-made|comes with|ships with|includes?|included|already (built|set up|there)|out of the box)\b/i;
  for (const t of PROJECT_TEMPLATES) {
    assert.doesNotMatch(t.blurb, claims, `${t.id}: the blurb promises content that does not exist`);
    if (t.prompt) assert.doesNotMatch(t.prompt, claims, `${t.id}: the prompt describes the place as already built`);
  }
});

//[[ RESTATED 2026-10-05 (M2 step 2.3, C3: one-click create). Five tests here were about the CREATE DIALOG, which is gone: it offered the set, started on
//   blank and handed the chosen template's request to the workspace as `state.seed`. A project is made in one click now and nothing is picked
//   first, so `templateSeed` (the dialog's lookup) was removed with its only caller. The set itself is unchanged and still has a home: the
//   composer's "Starting points" menu inserts these same requests (tests/composer-templates.test.mjs). What the dialog tests guarded is kept in
//   the form that still has a subject: THE SET IS NOT A CREATION-TIME PICKER ANY MORE, AND THE ONE THING THAT STILL SEEDS A NEW PROJECT IS THE
//   SENTENCE THE PERSON TYPED ON THE LANDING PAGE, handed over only as a string the workspace actually reads. ]]
test('the set is offered where a request is written, as requests to insert, and the blank start is not one of them', () => {
  const offered = insertableTemplates();
  assert.ok(offered.length > 0, 'nothing is offered, so the checks below would pass over an empty list');
  assert.ok(!offered.some((t) => t.id === BLANK_TEMPLATE_ID), 'an empty start is not something to insert');
  for (const t of offered) assert.equal(typeof t.prompt, 'string');
});

test('NO TEMPLATE PICKER AT CREATION: the dashboard offers no starting point and creates nothing from one', () => {
  assert.doesNotMatch(DASH, /PROJECT_TEMPLATES|templateSeed|BLANK_TEMPLATE_ID|projectTemplate|Starting point/, 'the dashboard still offers a starting point at creation');
  assert.equal(/from '\.\.\/lib\/project-templates'/.test(DASH), false);
});

test('THE SEED IS HANDED TO A ROUTE THAT ACTUALLY READS IT', () => {
  // The defect this codebase keeps finding is a control wired to nothing. The creation hook hands the landing sentence over in router
  // state; the workspace consumes `state.seed` and clears it. Both halves are asserted here so neither can be removed without the other going red.
  const HOOK = readFileSync(join(WEB, 'src', 'lib', 'use-create-project.ts'), 'utf8');
  assert.match(HOOK, /takePendingStart\(\)/, 'nothing turns the landing sentence into a seed');
  assert.match(HOOK, /state: \{ seed \}/, 'the seed is never handed over');
  assert.match(WS, /typeof handoff\.seed === 'string'/, 'the workspace no longer reads a seeded request');
});

test('a blank project is navigated to with no state at all', () => {
  // Passing `{ seed: null }` would leave router state on the entry and make the workspace's consume-and-clear effect run for nothing.
  const HOOK = readFileSync(join(WEB, 'src', 'lib', 'use-create-project.ts'), 'utf8');
  assert.match(HOOK, /seed \? \{ state: \{ seed \} \} : undefined/, 'a blank start still carries a handoff');
});
