/**
 * REFERRING TO WHAT IS SELECTED IN STUDIO, FROM THE MESSAGE BOX.
 *
 * The selection already travelled the whole way and stopped one step short of a person.
 *
 *   * apps/plugin/src/Companion.luau captures it and keeps the REAL count beside a truncated list
 *     (MAX_SELECTION = 100);
 *   * apps/worker/src/companion.ts re-derives every field rather than trusting the sender, and
 *     `truncated` is computed from two numbers instead of being a claim the plugin gets to make;
 *   * do/session.ts persists it and broadcasts `studio_selection` on connect and on every real
 *     change;
 *   * and `handleServerMsg` in the browser HAD NO CASE FOR IT. The message arrived, fell through
 *     the switch, and the app knew nothing about what the user was looking at.
 *
 * So the honesty obligations here are the plugin's and the worker's, carried one layer further:
 * the COUNT shown is the plugin's count, never the length of the list we happen to hold, and only
 * paths we actually have are ever named.
 *
 * Run with:  node --test           (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MAX_NAMED_ITEMS,
  insertAtCursor,
  selectionChipLabel,
  selectionReference,
} from '../src/lib/selection-reference.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
const SOCKET = readFileSync(join(WEB, 'src', 'lib', 'use-project-socket.ts'), 'utf8');
const COMPOSER = readFileSync(join(WEB, 'src', 'components', 'ws', 'composer.tsx'), 'utf8');
const WS = readFileSync(join(WEB, 'src', 'routes', 'workspace.tsx'), 'utf8');

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** A selection exactly as the worker's `readSelectionEvent` produces one. */
const sel = (paths, count = paths.length) => ({
  kind: 'selection',
  items: paths.map((p) => ({ path: p, class: 'Part' })),
  count,
  truncated: count > paths.length,
  clock: 1,
});

// --------------------------------------------------------------- the reference ---

test('one selected object is referred to by its path, with nothing added', () => {
  assert.equal(selectionReference(sel(['game.Workspace.Lobby.Door'])), '`game.Workspace.Lobby.Door`');
});

test('a few are listed as a sentence, with the count beside them', () => {
  const out = selectionReference(sel(['a.b', 'a.c', 'a.d']));
  assert.equal(out, '`a.b`, `a.c` and `a.d` (3 selected)');
});

test('THE COUNT IS THE PLUGIN’S COUNT, NOT THE LENGTH OF THE LIST WE HOLD', () => {
  // This is the whole honesty chain in one assertion. The plugin caps its list at 100 items and
  // reports the real total; a reference that said "100 selected" would be a discrepancy the user
  // cannot see and the agent cannot correct.
  const out = selectionReference(sel(Array.from({ length: 100 }, (_, i) => `p.${i}`), 143));
  assert.match(out, /of the 143 selected/);
  assert.equal(/100 selected/.test(out), false, 'the truncated list length must never be reported as the total');
});

test('only paths we actually hold are named; the rest are counted', () => {
  const paths = Array.from({ length: 30 }, (_, i) => `p.${i}`);
  const out = selectionReference(sel(paths));
  const named = [...out.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  assert.equal(named.length, MAX_NAMED_ITEMS, 'more names than the cap');
  for (const n of named) assert.ok(paths.includes(n), `${n} was invented`);
  assert.match(out, new RegExp(`and ${30 - MAX_NAMED_ITEMS} more of the 30 selected`));
});

test('the unnamed remainder is counted against the REAL total, not against the list', () => {
  // 100 held, 143 selected, 8 named: 135 are unaccounted for, not 92.
  const out = selectionReference(sel(Array.from({ length: 100 }, (_, i) => `p.${i}`), 143));
  assert.match(out, new RegExp(`and ${143 - MAX_NAMED_ITEMS} more`));
});

test('nothing selected produces no phrase at all', () => {
  // Not a placeholder. A composer that types "nothing is selected" into the user's prompt has put
  // words in their mouth about a fact they can already see.
  assert.equal(selectionReference(null), '');
  assert.equal(selectionReference(undefined), '');
  assert.equal(selectionReference(sel([], 0)), '');
});

test('a coherent-but-empty payload — count above zero with no items — yields no phrase', () => {
  // There is nothing to name and naming the count alone would be a reference to nothing.
  assert.equal(selectionReference({ kind: 'selection', items: [], count: 7, truncated: true, clock: 1 }), '');
});

// -------------------------------------------------------------------- the chip ---

test('the chip names the object when there is one, and counts when there are several', () => {
  assert.equal(selectionChipLabel(sel(['game.Workspace.Lobby.Door'])), 'Door');
  assert.equal(selectionChipLabel(sel(['a.b', 'a.c'])), '2 selected');
});

test('the chip’s count is the plugin’s count too', () => {
  assert.equal(selectionChipLabel(sel(Array.from({ length: 100 }, (_, i) => `p.${i}`), 143)), '143 selected');
});

test('there is no chip when there is nothing to point at', () => {
  // Null, not an empty label: the composer renders the control only when this is a string, so a
  // permanently-present-but-inert chip is impossible by construction.
  assert.equal(selectionChipLabel(null), null);
  assert.equal(selectionChipLabel(sel([], 0)), null);
});

// ------------------------------------------------------------ insert at cursor ---

test('the reference lands at the caret, not at the end of the box', () => {
  const r = insertAtCursor('make bigger', 'X', 5, 5);
  assert.equal(r.text, 'make X bigger');
});

test('the caret ends after what was inserted, so typing continues from there', () => {
  const r = insertAtCursor('make bigger', 'X', 5, 5);
  assert.equal(r.text.slice(0, r.caret), 'make X');
});

test('a selected range is replaced, the way typed input replaces it', () => {
  const r = insertAtCursor('make the thing bigger', 'X', 5, 14);
  assert.equal(r.text, 'make X bigger');
});

test('spacing is repaired on both sides rather than fusing onto a word', () => {
  assert.equal(insertAtCursor('make', 'X', 4, 4).text, 'make X');
  assert.equal(insertAtCursor('bigger', 'X', 0, 0).text, 'X bigger');
  // Already spaced: no second space is added on either side.
  assert.equal(insertAtCursor('make  bigger', 'X', 5, 5).text, 'make X bigger');
});

test('an out-of-range caret is clamped instead of producing undefined slices', () => {
  // `selectionStart` is null on a textarea that has never been focused, and the composer falls
  // back to the text length — but a stale caret from a longer previous value is also possible.
  assert.equal(insertAtCursor('abc', 'X', 99, 99).text, 'abc X');
  assert.equal(insertAtCursor('abc', 'X', -5, -5).text, 'X abc');
});

test('inserting nothing changes nothing', () => {
  const r = insertAtCursor('abc', '', 1, 2);
  assert.equal(r.text, 'abc');
});

// ------------------------------------------------- the message is no longer dropped ---

test('the socket has a case for studio_selection', () => {
  // THE DEFECT. The worker broadcast it, and the switch had no arm for it.
  assert.match(SOCKET, /case 'studio_selection':/);
  assert.match(SOCKET, /selection: msg\.selection/);
});

test('the selection is replaced wholesale, never merged', () => {
  // The worker sends the WHOLE selection and only when it genuinely changed (sameSelection in
  // companion.ts). Merging would leave a deselected part on screen as something to point at.
  const arm = SOCKET.slice(SOCKET.indexOf("case 'studio_selection':"), SOCKET.indexOf("case 'studio_selection':") + 700);
  const code = stripComments(arm);
  assert.match(code, /setStudio\(\(s\) => \(\{ \.\.\.s, selection: msg\.selection \}\)\)/);
});

test('a Studio that dropped takes its selection with it', () => {
  // A reference to objects nothing can act on any more is worse than no reference.
  const arm = SOCKET.slice(SOCKET.indexOf("case 'studio_status':"), SOCKET.indexOf("case 'studio_selection':"));
  assert.match(stripComments(arm), /selection: msg\.connected \? s\.selection : null/);
});

test('the initial state has no selection rather than an empty one', () => {
  // Null is "the worker has not told us", which is a different fact from "nothing is selected" —
  // and it is why the chip is absent rather than showing a zero before the first message lands.
  const init = SOCKET.slice(SOCKET.indexOf('const [studio, setStudio]'), SOCKET.indexOf('const [quota,'));
  assert.match(init, /selection: null,/);
});

// -------------------------------------------------------------- and the composer ---

test('the workspace hands the live selection to the composer', () => {
  assert.match(WS, /selection=\{studio\.selection\}/);
});

test('the chip exists only when there is a selection to refer to', () => {
  const code = stripComments(COMPOSER);
  assert.match(code, /\{selectionLabel && \(/);
  assert.match(code, /selectionChipLabel\(selection\)/);
});

/**
 * The handler's source, bounded by the declaration that follows it.
 *
 * REACHED, then asserted. An earlier `return (` appears in this file before the handler, so
 * slicing to that anchor produced an EMPTY string — and `assert.match('' , /x/)` fails loudly,
 * which is the good case. A slice anchored the other way round would have matched nothing and
 * passed, which is the failure this repo keeps finding.
 */
function insertSelectionSource() {
  const from = COMPOSER.indexOf('const insertSelection');
  const to = COMPOSER.indexOf('const activeMode', from);
  assert.ok(from !== -1 && to > from, 'the insertSelection handler was not found — this test checks nothing');
  return COMPOSER.slice(from, to);
}

test('clicking it inserts at the caret and keeps the message within the cap', () => {
  const fn = insertSelectionSource();
  assert.match(fn, /insertAtCursor\(text, phrase, start, end\)/);
  assert.match(fn, /setSelectionRange\(next\.caret, next\.caret\)/);
  assert.match(fn, /slice\(0, MESSAGE_MAX_CHARS\)/, 'an inserted reference must not push the message past the cap');
});

test('an empty phrase is not inserted', () => {
  const fn = insertSelectionSource();
  assert.match(fn, /if \(!phrase\) return;/);
});
