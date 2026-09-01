/**
 * The Drawer's modal contract.
 *
 * Verified in a real browser on 2026-09-01 against the Checkpoints drawer: it opens
 * with role="dialog", aria-modal="true" and aria-label="Checkpoints", focus moves into
 * the panel, Escape closes it, and focus returns to the button that opened it rather
 * than being dumped on <body>. §28 asks that "accessibility/keyboard basics are not
 * broken"; that is the check, and it passed.
 *
 * This file is what stops it silently regressing. Every one of those properties is a
 * line or two in ws/primitives.tsx that a refactor removes without anything failing —
 * the drawer still LOOKS right with no focus trap, and only a keyboard user finds out.
 * Asserted against the source because the behaviour needs a DOM these tests do not
 * have; the browser pass is the evidence, this is the ratchet.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'components', 'ws', 'primitives.tsx'),
  'utf8',
);
const DRAWER = SRC.slice(SRC.indexOf('export function Drawer'), SRC.indexOf('export function Drawer') + 3000);

test('the panel announces itself as a modal dialog', () => {
  // Without role and aria-modal a screen reader keeps reading the page behind it, so
  // the user is navigating two documents at once with no indication.
  assert.match(DRAWER, /role="dialog"/, 'no dialog role');
  assert.match(DRAWER, /aria-modal="true"/, 'not announced as modal');
});

test('the dialog is named, and named by the title it was given', () => {
  // An unnamed dialog is read as "dialog", which tells the user nothing about which
  // one just opened.
  assert.match(DRAWER, /aria-label=\{title\}/, 'the dialog has no accessible name');
});

test('focus moves into the panel when it opens', () => {
  assert.match(DRAWER, /panel\.current\?\.focus\(\)/,
    'focus is not moved into the drawer, so a keyboard user is still behind the scrim');
});

test('Escape closes it', () => {
  assert.match(DRAWER, /e\.key === 'Escape'/, 'Escape is not handled');
});

test('Tab is trapped inside the panel while it is modal', () => {
  // A modal that lets Tab walk out puts focus on controls the scrim is covering.
  assert.match(DRAWER, /e\.key !== 'Tab'/, 'Tab is not intercepted');
  assert.match(DRAWER, /e\.shiftKey/, 'Shift+Tab is not handled, so the trap is one-way');
  assert.match(DRAWER, /preventDefault\(\)/, 'the trap does not stop the default move');
});

test('focus RETURNS to whatever opened it', () => {
  //[[ The one that is easiest to lose and hardest to notice.
  //
  //   It lives in the effect's cleanup, so a refactor that reorganises the effect can
  //   drop it while everything still looks correct. What a keyboard user then gets is
  //   focus on <body> — the next Tab starts from the top of the document, and they
  //   have to walk the whole page back to where they were. ]]
  assert.match(DRAWER, /opener\.current = document\.activeElement/, 'the opener is never recorded');
  assert.match(DRAWER, /opener\.current instanceof HTMLElement\) opener\.current\.focus\(\)/,
    'focus is not returned to the opener on close');
});

test('the scrim is a real button, and hidden from assistive tech', () => {
  // Clickable-div scrims are unreachable by keyboard and announced as nothing. This
  // one is a button so the click target is legitimate, tabIndex -1 so it is not a stop
  // on the way in, and aria-hidden so it is not announced as an empty control.
  assert.match(DRAWER, /className="gx-scrim"/, 'no scrim');
  assert.match(DRAWER, /tabIndex=\{-1\}/, 'the scrim is a tab stop');
  assert.match(DRAWER, /aria-hidden="true"/, 'the scrim is announced to screen readers');
});

test('the key listener is removed when the drawer closes', () => {
  // A leaked keydown listener means Escape keeps firing onClose after the drawer is
  // gone, closing whatever opened next.
  assert.match(DRAWER, /removeEventListener\('keydown', onKey\)/, 'the listener leaks');
});
