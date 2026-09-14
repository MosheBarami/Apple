// The keyboard map.
//
// The defect this exists to prevent already happened once: ⌘K was bound to "New chat" in the
// shell, and ⌘K is also the chord every user presses expecting a command palette. Two handlers,
// both individually reasonable, fighting over one chord. So the bindings live in one table and
// this file asserts the properties that table has to have — including that no two commands claim
// the same chord, which no amount of reading the code reliably catches.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SHORTCUTS,
  isApplePlatform,
  isTypingTarget,
  matchesShortcut,
  shortcutLabel,
} from '../src/lib/shortcuts.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');

const key = (k, mods = {}) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

// ------------------------------------------------------------------- matching ---

test('⌘K matches the palette on Apple, Ctrl+K elsewhere', () => {
  assert.equal(matchesShortcut(key('k', { metaKey: true }), SHORTCUTS.palette, true), true);
  assert.equal(matchesShortcut(key('k', { ctrlKey: true }), SHORTCUTS.palette, false), true);
});

test('the WRONG platform modifier does not match', () => {
  // Ctrl+K on a Mac is "delete to end of line" in every text field. Accepting it would open the
  // palette while someone was editing a prompt.
  assert.equal(matchesShortcut(key('k', { ctrlKey: true }), SHORTCUTS.palette, true), false);
  assert.equal(matchesShortcut(key('k', { metaKey: true }), SHORTCUTS.palette, false), false);
});

test('holding both modifiers is not the shortcut', () => {
  assert.equal(matchesShortcut(key('k', { metaKey: true, ctrlKey: true }), SHORTCUTS.palette, true), false);
});

test('an unwanted modifier disqualifies the match', () => {
  // ⌘⇧K is a different chord and may mean something else later. Matching it now would make that
  // impossible to add without breaking muscle memory.
  assert.equal(matchesShortcut(key('K', { metaKey: true, shiftKey: true }), SHORTCUTS.palette, true), false);
  assert.equal(matchesShortcut(key('k', { metaKey: true, altKey: true }), SHORTCUTS.palette, true), false);
});

test('a shift chord matches the uppercase key the browser actually reports', () => {
  // With Shift held, KeyboardEvent.key is "N", not "n". Comparing case-sensitively here is the
  // classic way a shortcut silently never fires.
  assert.equal(matchesShortcut(key('N', { metaKey: true, shiftKey: true }), SHORTCUTS.newProject, true), true);
  assert.equal(matchesShortcut(key('n', { metaKey: true, shiftKey: true }), SHORTCUTS.newProject, true), true);
});

test('a bare key does not match a chord', () => {
  assert.equal(matchesShortcut(key('k'), SHORTCUTS.palette, true), false);
  assert.equal(matchesShortcut(key('n'), SHORTCUTS.newProject, true), false);
});

test('Escape is a bare key and matches with no modifier', () => {
  assert.equal(matchesShortcut(key('Escape'), SHORTCUTS.stop, true), true);
  assert.equal(matchesShortcut(key('Escape', { metaKey: true }), SHORTCUTS.stop, true), false);
});

// --------------------------------------------------------------- no collisions ---

test('no two shortcuts claim the same chord', () => {
  // Escape is deliberately shared between "stop the run" and "close" — they are the same gesture
  // meaning "get me out", resolved by what is open, and only one handler is ever mounted.
  const seen = new Map();
  for (const [name, s] of Object.entries(SHORTCUTS)) {
    const chord = `${s.mod ? 'M' : ''}${s.shift ? 'S' : ''}${s.alt ? 'A' : ''}${s.key.toLowerCase()}`;
    if (chord === 'escape') continue;
    assert.equal(seen.has(chord), false, `${name} and ${seen.get(chord)} both claim ${chord}`);
    seen.set(chord, name);
  }
});

test('no shortcut takes a plain command chord the browser owns', () => {
  // ⌘W closes the tab, ⌘T opens one, ⌘N a window, ⌘L the address bar, ⌘R reloads, ⌘F finds,
  // ⌘P prints, ⌘S saves, ⌘Q quits. Taking any of these costs the user something they needed more
  // than they needed our feature.
  const RESERVED = new Set(['w', 't', 'n', 'l', 'r', 'f', 'p', 's', 'q']);
  for (const [name, s] of Object.entries(SHORTCUTS)) {
    if (!s.mod || s.shift || s.alt) continue;
    assert.equal(RESERVED.has(s.key.toLowerCase()), false, `${name} takes the browser's ⌘${s.key.toUpperCase()}`);
  }
});

test('every shortcut says what it does, in words a user would recognise', () => {
  for (const [name, s] of Object.entries(SHORTCUTS)) {
    assert.ok(s.label && s.label.length > 2, `${name} has no usable label`);
    assert.equal(/^[a-z]/.test(s.label), false, `${name}'s label should read as a sentence: "${s.label}"`);
  }
});

// -------------------------------------------------------------------- labelling ---

test('chords are written the way the platform writes them', () => {
  assert.equal(shortcutLabel(SHORTCUTS.palette, true), '⌘K');
  assert.equal(shortcutLabel(SHORTCUTS.palette, false), 'Ctrl+K');
  assert.equal(shortcutLabel(SHORTCUTS.newProject, true), '⌘⇧N');
  assert.equal(shortcutLabel(SHORTCUTS.newProject, false), 'Ctrl+Shift+N');
});

test('named keys get their symbol rather than their DOM name', () => {
  assert.equal(shortcutLabel(SHORTCUTS.send, true), '⌘↵');
  assert.equal(shortcutLabel(SHORTCUTS.stop, true), 'esc');
});

test('platform detection reads the hint it is given', () => {
  assert.equal(isApplePlatform('MacIntel'), true);
  assert.equal(isApplePlatform('iPhone'), true);
  assert.equal(isApplePlatform('Win32'), false);
  assert.equal(isApplePlatform('Linux x86_64'), false);
  assert.equal(isApplePlatform(''), false);
});

// ------------------------------------------------------------ typing suppression ---

test('a bare shortcut is suppressed inside a text field', () => {
  // A single key firing mid-prompt is a bug that looks like data loss.
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
    assert.equal(isTypingTarget({ tagName: tag, isContentEditable: false, __proto__: FakeElement.prototype }), true, tag);
  }
  assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: true, __proto__: FakeElement.prototype }), true);
  assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: false, __proto__: FakeElement.prototype }), false);
  assert.equal(isTypingTarget(null), false);
});

// `instanceof HTMLElement` is the real guard; node has no DOM, so this stands in for it.
class FakeElement {}
globalThis.HTMLElement = FakeElement;

// ------------------------------------------------------- the collision, in place ---

/** Source with comments removed, so a negative assertion cannot be tripped by prose. */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const LAYOUT = readFileSync(join(WEB, 'src', 'components', 'layout.tsx'), 'utf8');
const PALETTE = readFileSync(join(WEB, 'src', 'components', 'command-palette.tsx'), 'utf8');

test('the shell no longer claims ⌘K', () => {
  // This is the regression. The shell used to intercept ⌘K and navigate to New chat, which meant
  // the palette could never open.
  assert.equal(/e\.key === 'k' \|\| e\.key === 'K'/.test(LAYOUT), false, 'the shell must not hand-match ⌘K');
  assert.match(LAYOUT, /matchesShortcut\(e, SHORTCUTS\.newProject\)/);
});

test('the palette owns ⌘K through the shared map, not its own matcher', () => {
  // A hand-rolled `(metaKey || ctrlKey) && key === 'k'` fires on Ctrl+K on a Mac — where Ctrl+K is
  // delete-to-end-of-line in every text field, so trimming a prompt in the composer opened the
  // palette instead. The shared matcher rejects the non-platform modifier, which is the whole
  // reason it takes a platform argument.
  assert.match(PALETTE, /matchesShortcut\(e, SHORTCUTS\.palette\)/);
  // Comments may quote the old pattern — that is how the reason is recorded. Only CODE counts.
  assert.equal(/metaKey \|\| e?\.?ctrlKey/.test(stripComments(PALETTE)), false, 'no hand-matched chord in the palette');
  assert.match(PALETTE, /e\.preventDefault\(\)/);
});

test('the New chat badge shows the chord that actually works', () => {
  // A badge showing ⌘K beside a control bound to ⌘⇧N teaches the wrong shortcut to everyone who
  // reads it — and it was showing exactly that until the binding moved.
  assert.match(LAYOUT, /shortcutLabel\(SHORTCUTS\.newProject\)/);
  // Comments are allowed to name the old chord (they explain the move); rendered markup is not.
  for (const [, body] of LAYOUT.matchAll(/<kbd\b[^>]*>([\s\S]*?)<\/kbd>/g)) {
    assert.equal(/[⌘⇧⌥]|Ctrl\+/.test(body), false, `a hard-coded chord is rendered: ${body.trim()}`);
  }
});

test('the help dialog is generated from the map, not restated', () => {
  const DIALOG = readFileSync(join(WEB, 'src', 'components', 'shortcuts-dialog.tsx'), 'utf8');
  assert.match(DIALOG, /shortcutLabel\(s\)/);
  assert.equal(/'⌘|Ctrl\+/.test(DIALOG.replace(/shortcutLabel\([^)]*\)/g, '')), false, 'help must not hard-code chords');
});
