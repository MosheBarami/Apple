/**
 * THE MESSAGE BOX: what sends it, what survives a refusal, and how long it may be.
 *
 * Three defects, all of the same family — the product knew something and did not say it, or said
 * something it did not do.
 *
 *   1. `submit()` cleared the box and the stored draft UNCONDITIONALLY, under a comment claiming
 *      it cleared "at the point the message actually left". `onSend` returned `void`, so there was
 *      nothing for it to check. A send refused because the socket had closed therefore destroyed
 *      the text, and the toast explaining the refusal arrived after the words were gone.
 *
 *   2. `SHORTCUTS.send` declared ⌘Enter and the shortcuts dialog printed ⌘↵, while the composer
 *      hand-matched `e.key === 'Enter' && !e.shiftKey`. Nothing called `matchesShortcut` with that
 *      record anywhere in the app. The help taught a chord that did nothing.
 *
 *   3. The server slices every message at 8,000 characters (do/session.ts, three ingress points)
 *      and the browser capped its stored draft at the same figure — and no surface said so. A long
 *      prompt was accepted, silently cut, and answered in half.
 *
 * Run with:  node --test           (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MESSAGE_MAX_CHARS, MESSAGE_WARN_CHARS } from '@golem/shared';
import { matchesShortcut, shortcutLabel } from '../src/lib/shortcuts.ts';
import { ENTER_SEND, newlineBinding, sendBinding, sendHint } from '../src/lib/send-key.ts';
import { DEFAULT_PREFS, SEND_KEYS, isSendKey, normalisePrefs } from '../src/lib/prefs.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
const COMPOSER = readFileSync(join(WEB, 'src', 'components', 'ws', 'composer.tsx'), 'utf8');
const WS = readFileSync(join(WEB, 'src', 'routes', 'workspace.tsx'), 'utf8');
const DIALOG = readFileSync(join(WEB, 'src', 'components', 'shortcuts-dialog.tsx'), 'utf8');
const SESSION = readFileSync(join(WEB, '..', 'worker', 'src', 'do', 'session.ts'), 'utf8');

/** Source with comments removed, so a negative assertion cannot be tripped by prose. */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const key = (k, mods = {}) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

// ------------------------------------------------------------- the send binding ---

test('the default preference sends on a bare Enter — what shipped', () => {
  // Changing this default would silently rewrite the muscle memory of everyone already using the
  // product, which is a worse failure than the inconsistency this setting exists to fix.
  assert.equal(DEFAULT_PREFS.sendKey, 'enter');
  assert.deepEqual(sendBinding('enter'), ENTER_SEND);
});

test('with Enter sending, Shift+Enter is a new line and does not send', () => {
  const binding = sendBinding('enter');
  assert.equal(matchesShortcut(key('Enter'), binding, true), true);
  assert.equal(matchesShortcut(key('Enter', { shiftKey: true }), binding, true), false);
});

test('with ⌘Enter sending, a bare Enter is a new line and does not send', () => {
  // The inverse has to hold for real, not just be offered: a preference that sends on BOTH is the
  // same as no preference, and the person who chose it did so to stop sending half a paragraph.
  const binding = sendBinding('mod-enter');
  assert.equal(matchesShortcut(key('Enter', { metaKey: true }), binding, true), true);
  assert.equal(matchesShortcut(key('Enter'), binding, true), false);
  assert.equal(matchesShortcut(key('Enter', { shiftKey: true }), binding, true), false);
});

test('⌘Enter sends on Apple and Ctrl+Enter elsewhere — never the other platform’s modifier', () => {
  // Ctrl+Enter on a Mac is not a send gesture, and accepting it would fire mid-sentence for anyone
  // using Ctrl as a text-navigation modifier.
  const binding = sendBinding('mod-enter');
  assert.equal(matchesShortcut(key('Enter', { metaKey: true }), binding, true), true);
  assert.equal(matchesShortcut(key('Enter', { ctrlKey: true }), binding, false), true);
  assert.equal(matchesShortcut(key('Enter', { ctrlKey: true }), binding, true), false);
  assert.equal(matchesShortcut(key('Enter', { metaKey: true }), binding, false), false);
});

test('the send and the new-line bindings are never the same chord', () => {
  // The whole point of the pair. If they matched, one keystroke would both send and insert.
  for (const pref of SEND_KEYS) {
    const send = sendBinding(pref);
    const nl = newlineBinding(pref);
    const chord = (s) => `${s.mod ? 'M' : ''}${s.shift ? 'S' : ''}${s.alt ? 'A' : ''}${s.key.toLowerCase()}`;
    assert.notEqual(chord(send), chord(nl), `${pref} binds one chord to both`);
  }
});

test('the new-line binding really does not send, under either preference', () => {
  for (const pref of SEND_KEYS) {
    const nl = newlineBinding(pref);
    const ev = key(nl.key, { metaKey: !!nl.mod, shiftKey: !!nl.shift });
    assert.equal(matchesShortcut(ev, sendBinding(pref), true), false, `${pref}: the new-line chord sends`);
  }
});

test('the hint names the chord that fires, in the platform’s own symbols', () => {
  assert.equal(sendHint('enter', true), '↵ to send · ⇧↵ for a new line');
  assert.equal(sendHint('mod-enter', true), '⌘↵ to send · ↵ for a new line');
  // ↵ rather than "Enter" on Windows and Linux too: `shortcutLabel` maps named keys to their
  // symbol before it picks the modifier spelling, which is the existing, tested behaviour.
  assert.equal(sendHint('mod-enter', false), 'Ctrl+↵ to send · ↵ for a new line');
});

test('bare Enter is NOT in the global shortcut map', () => {
  // It must not be: `useGlobalShortcut` suppresses every non-modifier binding while the user is
  // typing (isTypingTarget), which is the only place this binding is ever meant to fire. A bare
  // Enter registered globally would be dead on arrival in the one field that needs it.
  const SHORTCUTS_SRC = readFileSync(join(WEB, 'src', 'lib', 'shortcuts.ts'), 'utf8');
  const table = SHORTCUTS_SRC.slice(SHORTCUTS_SRC.indexOf('export const SHORTCUTS'), SHORTCUTS_SRC.indexOf('} as const satisfies'));
  const bareEnter = /key:\s*'Enter'(?![^}]*mod:\s*true)/.test(table);
  assert.equal(bareEnter, false, 'a bare Enter in SHORTCUTS would be suppressed in every text field');
});

// ------------------------------------------------- the composer actually uses it ---

test('the composer matches through the SHARED matcher, not a hand-rolled key check', () => {
  // This is the regression. A hand-matched chord in one component is exactly what lib/shortcuts.ts
  // exists to prevent, and it survived here, in the most-used control in the product.
  const code = stripComments(COMPOSER);
  assert.match(code, /matchesShortcut\(e, sendKeyBinding\)/);
  assert.equal(
    /e\.key === 'Enter'/.test(code),
    false,
    'the composer must not hand-match Enter — that is how the help and the behaviour diverged',
  );
});

test('the binding comes from the stored preference, not from a constant in the component', () => {
  const code = stripComments(COMPOSER);
  assert.match(code, /sendBinding\(prefs\.sendKey\)/);
});

test('the hint under the box is derived from the same preference', () => {
  // A hint that restated the chord would be free to disagree with the handler, which is the defect
  // in its original form wearing different clothes.
  const code = stripComments(COMPOSER);
  assert.match(code, /sendHint\(prefs\.sendKey\)/);
  assert.equal(/to send ·/.test(code), false, 'the hint text must not be written out in the component');
});

test('the shortcuts dialog resolves send from the preference too', () => {
  const code = stripComments(DIALOG);
  assert.match(code, /sendBinding\(pref\)/);
  assert.equal(/SHORTCUTS\.send/.test(code), false, 'the dialog must not pin the send row to a constant');
});

test('the dialog offers the choice and writes it to the shared preference store', () => {
  // A setting nothing can change is a constant with extra steps.
  assert.match(DIALOG, /setPref\('sendKey', key\)/);
  assert.match(DIALOG, /role="radio"/);
  assert.match(DIALOG, /aria-checked=\{prefs\.sendKey === key\}/);
});

// ------------------------------------------------------- a refused send is kept ---

test('onSend reports whether the message left', () => {
  // The type is the fix: with `void` there was nothing for submit() to check, so the guard could
  // not have been written even by someone who wanted it.
  assert.match(COMPOSER, /onSend: \(text: string\) => boolean/);
});

test('a refused send returns before the box or the draft is cleared', () => {
  const submit = COMPOSER.slice(COMPOSER.indexOf('const submit ='), COMPOSER.indexOf('const onKeyDown'));
  assert.match(submit, /if \(!onSend\(value\)\) return;/, 'the refusal must short-circuit');
  const guard = submit.indexOf('if (!onSend(value)) return;');
  assert.ok(guard !== -1);
  assert.ok(guard < submit.indexOf("setText('')"), 'the guard must precede emptying the box');
  assert.ok(guard < submit.indexOf('clearDraft(draftKey)'), 'the guard must precede clearing the draft');
});

test('the workspace returns false when the socket refused the message', () => {
  const fn = WS.slice(WS.indexOf('const send = (text: string)'), WS.indexOf('const lastAssistantId'));
  assert.match(fn, /if \(!sendChat\(text, PRODUCT_MODE_TO_SPECIALIST\[mode\]\)\) \{/);
  assert.match(fn, /return false;/);
  assert.match(fn, /return true;/);
});

test('and it says the message is still there, because it is', () => {
  // The old copy — "Not connected yet — hang on a moment." — was true and useless: by the time it
  // was read the words it referred to had been deleted.
  const fn = WS.slice(WS.indexOf('const send = (text: string)'), WS.indexOf('const lastAssistantId'));
  assert.match(fn, /still in the box/);
});

// -------------------------------------------------------------- message length ---

test('the browser and the server cap a message at the same number', () => {
  // Two copies of the figure is how a counter ends up promising room the server will not accept.
  assert.equal(MESSAGE_MAX_CHARS, 8000);
  const slices = [...SESSION.matchAll(/\.slice\(0, MESSAGE_MAX_CHARS\)/g)];
  assert.equal(slices.length, 3, 'every chat ingress must slice against the shared constant');
  assert.equal(
    /\.slice\(0, 8000\)/.test(SESSION),
    false,
    'a literal 8000 left at an ingress is a second source of truth',
  );
});

test('the draft store caps against the same constant rather than its own copy', () => {
  const DRAFT = readFileSync(join(WEB, 'src', 'lib', 'draft.ts'), 'utf8');
  assert.match(DRAFT, /export const DRAFT_MAX = MESSAGE_MAX_CHARS;/);
});

test('the warning threshold leaves room to react and is inside the limit', () => {
  assert.ok(MESSAGE_WARN_CHARS < MESSAGE_MAX_CHARS, 'a threshold at the limit warns too late to matter');
  assert.ok(MESSAGE_WARN_CHARS > MESSAGE_MAX_CHARS * 0.5, 'a threshold this early is noise on every message');
});

test('the composer states the remaining characters, and clamps what it holds', () => {
  const code = stripComments(COMPOSER);
  assert.match(code, /maxLength=\{MESSAGE_MAX_CHARS\}/);
  // maxLength alone is not enough: browsers disagree about whether an over-long PASTE is truncated
  // or dropped, and the box must always hold exactly what will be sent.
  assert.match(code, /setText\(e\.target\.value\.slice\(0, MESSAGE_MAX_CHARS\)\)/);
  assert.match(code, /MESSAGE_MAX_CHARS - text\.length/);
  assert.match(code, /characters left/);
});

test('the counter appears only near the limit, and is announced politely', () => {
  const code = stripComments(COMPOSER);
  assert.match(code, /text\.length >= MESSAGE_WARN_CHARS/);
  const block = code.slice(code.indexOf('{showCount &&'), code.indexOf('{showCount &&') + 700);
  assert.match(block, /aria-live="polite"/);
  assert.equal(/aria-live="assertive"/.test(block), false, 'a character count must never interrupt');
});

// ------------------------------------------------------------- stored preference ---

test('an unknown stored send key falls back without discarding the other settings', () => {
  // Per-field fallback is the rule this store is built on: one stale field written by an older
  // build must not silently reset everything the user configured.
  const prefs = normalisePrefs({ sendKey: 'ctrl-j', appearance: 'light', region: 'de-DE' });
  assert.equal(prefs.sendKey, DEFAULT_PREFS.sendKey);
  assert.equal(prefs.appearance, 'light');
  assert.equal(prefs.region, 'de-DE');
});

test('every offered option is one the store will accept back', () => {
  // A chooser that can write a value `normalisePrefs` rejects is a setting that silently reverts.
  for (const k of SEND_KEYS) {
    assert.equal(isSendKey(k), true, `${k} is offered but not accepted`);
    assert.equal(normalisePrefs({ sendKey: k }).sendKey, k);
  }
});

test('both options render a chord a person can read', () => {
  for (const k of SEND_KEYS) {
    const label = shortcutLabel(sendBinding(k), true);
    assert.ok(label.length > 0, `${k} has no printable chord`);
    assert.match(label, /↵/);
  }
});
