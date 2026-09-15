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
import { BLANK_TEMPLATE_ID, PROJECT_TEMPLATES, templateSeed } from '../src/lib/project-templates.ts';

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

test('templateSeed answers null for anything it does not know', () => {
  // The picker's value is a string that survives a reload and a stale bundle. An unknown id must
  // produce no seed rather than a crash or, worse, someone else's prompt.
  assert.equal(templateSeed(BLANK_TEMPLATE_ID), null);
  assert.equal(templateSeed('a-template-from-a-future-build'), null);
  assert.equal(templateSeed(undefined), null);
  const obby = PROJECT_TEMPLATES.find((t) => t.id !== BLANK_TEMPLATE_ID);
  assert.equal(templateSeed(obby.id), obby.prompt);
});

// --------------------------------------------------------------- the chain, end to end ---

test('the create dialog offers the set and starts on blank', () => {
  assert.match(DASH, /PROJECT_TEMPLATES/, 'the dialog does not offer the templates');
  assert.match(DASH, /useState\(BLANK_TEMPLATE_ID\)/, 'the dialog starts on something other than a blank project');
});

test('THE SEED IS HANDED TO A ROUTE THAT ACTUALLY READS IT', () => {
  // The defect this codebase keeps finding is a control wired to nothing. The create dialog hands
  // the seed over in router state; the workspace consumes `state.seed` and clears it. Both halves
  // are asserted here so neither can be removed without the other going red.
  assert.match(DASH, /templateSeed/, 'nothing turns the chosen template into a seed');
  assert.match(DASH, /state: \{ seed/, 'the seed is never handed over');
  assert.match(WS, /typeof handoff\.seed === 'string'/, 'the workspace no longer reads a seeded request');
});

test('a blank project is navigated to with no state at all', () => {
  // Passing `{ seed: null }` would leave router state on the entry and make the workspace's
  // consume-and-clear effect run for nothing.
  assert.match(DASH, /seed \? \{ state: \{ seed \} \} : undefined|seed === null/, 'blank still carries a handoff');
});
