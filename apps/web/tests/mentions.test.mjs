/**
 * @-MENTIONS: naming one of the project's own files from the message box.
 *
 * Apple has been writing files into the project workspace since the web tools shipped — notes,
 * plans, generated CSVs, design briefs — and `workspace_read` lets the agent open any of them by
 * path. The person typing had no way to say WHICH. They could open the Files drawer, read a path
 * off it, close the drawer, and type it out from memory into a box that had already lost their
 * place; or they could describe the file and hope.
 *
 * The composer already had a precedent for exactly this shape — the Studio-selection chip, which
 * inserts a backticked instance path at the caret — and it was the only reference helper the
 * composer imported.
 *
 * WHAT THESE TESTS ARE DEFENDING:
 *
 *   AN EMAIL ADDRESS IS NOT A MENTION. `me@example.com` has an `@` in it and nobody typing it
 *   wants a file picker. The `@` opens one only at a word boundary.
 *
 *   A MENTION CLOSES WHEN THE PERSON MOVES ON. A space ends it; so does moving the caret away.
 *   A picker that stays open over the middle of a sentence swallows the next Enter.
 *
 *   THE INSERTION REPLACES THE TYPED TOKEN. Leaving `@pla` in front of the inserted path is the
 *   commonest bug in this pattern and it is invisible until somebody reads the sent message.
 *
 *   NOTHING IS OFFERED THAT DOES NOT EXIST. The list comes from the project's own file listing.
 *   A picker that accepted free text would insert a path `workspace_read` then fails to open, and
 *   the agent would report a missing file the person believes they selected.
 *
 * Run with:  node --test tests/mentions.test.mjs      (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MENTION_MAX_QUERY, applyMention, matchMentions, mentionQuery } from '../src/lib/mentions.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPOSER = readFileSync(join(HERE, '..', 'src', 'components', 'ws', 'composer.tsx'), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const CODE = stripComments(COMPOSER);

const PATHS = ['notes/plan.md', 'notes/lighting.md', 'data/waves.csv', 'design-brief.md', 'plan-b.md'];

/* ------------------------------------------------------------------ detection ---- */

test('an @ at the start of the box opens a mention', () => {
  const m = mentionQuery('@pla', 4);
  assert.deepEqual(m, { at: 0, query: 'pla' });
});

test('an @ after a space opens a mention', () => {
  const text = 'look at @li';
  assert.deepEqual(mentionQuery(text, text.length), { at: 8, query: 'li' });
});

test('an @ after a newline opens one too', () => {
  const text = 'first line\n@no';
  assert.deepEqual(mentionQuery(text, text.length), { at: 11, query: 'no' });
});

test('a bare @ opens the picker with no query, so the list is browsable', () => {
  assert.deepEqual(mentionQuery('@', 1), { at: 0, query: '' });
});

test('an email address is not a mention', () => {
  // THE CASE THAT MAKES THE WORD-BOUNDARY RULE NECESSARY. Without it, everybody who types their
  // own address gets a file picker over the middle of it.
  const text = 'write to me@example.com';
  assert.equal(mentionQuery(text, text.length), null);
});

test('a space ends the mention', () => {
  const text = '@plan and then';
  assert.equal(mentionQuery(text, text.length), null);
});

test('the mention is read at the CARET, not at the end of the box', () => {
  // Someone who typed a mention, moved back and is now editing the first word is not mentioning
  // anything, and a picker over their caret would eat the next Enter.
  const text = 'hello @plan';
  assert.equal(mentionQuery(text, 3), null);
  assert.deepEqual(mentionQuery(text, text.length), { at: 6, query: 'plan' });
});

test('a query longer than a filename stops being a mention', () => {
  // Past this the person is typing prose with an @ in it, and a picker that stays open over a
  // paragraph is a picker that swallows the send key.
  const text = `@${'x'.repeat(MENTION_MAX_QUERY + 1)}`;
  assert.equal(mentionQuery(text, text.length), null);
});

test('a second @ inside the token is not a mention', () => {
  const text = '@a@b';
  assert.equal(mentionQuery(text, text.length), null);
});

/* ------------------------------------------------------------------ matching ---- */

test('an empty query offers the files there are, so a bare @ is browsable', () => {
  const hits = matchMentions(PATHS, '', 8);
  assert.equal(hits.length, PATHS.length);
});

test('a filename prefix beats a path substring', () => {
  const hits = matchMentions(PATHS, 'plan', 8);
  assert.equal(hits[0], 'notes/plan.md', 'the file actually CALLED plan must come first');
  assert.ok(hits.includes('plan-b.md'));
});

test('matching is case-insensitive and reaches into the folder name', () => {
  assert.ok(matchMentions(PATHS, 'NOTES', 8).includes('notes/plan.md'));
  assert.ok(matchMentions(PATHS, 'WAVES', 8).includes('data/waves.csv'));
});

test('a query nothing matches returns nothing, rather than everything', () => {
  // Falling back to the whole list when nothing matches is how a picker comes to insert a file
  // the person never looked at.
  assert.deepEqual(matchMentions(PATHS, 'zzzz', 8), []);
});

test('the list is capped', () => {
  const many = Array.from({ length: 50 }, (_, i) => `f${i}.md`);
  assert.equal(matchMentions(many, '', 8).length, 8);
});

/* ------------------------------------------------------------------ insertion ---- */

test('picking a file replaces the typed token, leaving no @ behind', () => {
  const text = 'look at @pla';
  const m = mentionQuery(text, text.length);
  const out = applyMention(text, m, 'notes/plan.md');
  assert.equal(out.text, 'look at `notes/plan.md`');
  assert.ok(!out.text.includes('@'), 'the half-typed token must be gone');
  assert.equal(out.caret, out.text.length);
});

test('the path is backticked, so it survives markdown with its dots and slashes intact', () => {
  const text = '@w';
  const out = applyMention(text, mentionQuery(text, text.length), 'data/waves.csv');
  assert.equal(out.text, '`data/waves.csv`');
});

test('text after the mention is kept, and the spacing is repaired', () => {
  const text = 'read @pla and summarise it';
  // The caret sits at the end of the token, which is where it is while somebody is typing one.
  const m = mentionQuery(text, 'read @pla'.length);
  const out = applyMention(text, m, 'notes/plan.md');
  assert.equal(out.text, 'read `notes/plan.md` and summarise it');
});

test('applying a mention that is not open changes nothing', () => {
  assert.equal(applyMention('hello', null, 'notes/plan.md').text, 'hello');
});

/* ------------------------------------------------------------------ the wiring ---- */

test('the composer opens the picker from the caret and lists the project’s own files', () => {
  assert.match(CODE, /mentionQuery\(/);
  assert.match(CODE, /matchMentions\(/);
  assert.match(CODE, /fetchProjectFiles\(/, 'the list has to come from the project, not from free text');
});

test('the picker is a listbox, so it is reachable without a mouse', () => {
  assert.match(CODE, /role="listbox"/);
  assert.match(CODE, /role="option"/);
  assert.match(CODE, /aria-selected/);
});

test('Enter picks the highlighted file instead of sending the message', () => {
  // The one interaction that must not be got wrong: a send key that fires while a picker is open
  // sends a message with `@pla` in it and the picker still on screen.
  const handler = CODE.slice(CODE.indexOf('const onKeyDown'), CODE.indexOf('const selectionLabel'));
  assert.match(handler, /mention/i, 'the send chord must be checked against the picker first');
  const mentionBranch = handler.indexOf('mention');
  const sendBranch = handler.indexOf('matchesShortcut');
  assert.ok(mentionBranch < sendBranch, 'the picker has to claim the key before the send binding does');
  assert.match(handler, /ArrowDown/);
  assert.match(handler, /Escape/);
});
