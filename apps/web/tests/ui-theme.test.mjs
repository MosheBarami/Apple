// The composer's UI theme (V3 UI contract, Q6/Q19): studded (default), cartoony, none.
//
// Remembered per project in localStorage, sent with every chat and edit_resend frame. UI-only: the
// world direction is not this control's business. Storage that throws must not break the composer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (...p) => readFileSync(join(WEB, 'src', ...p), 'utf8');

function install(storage) {
  globalThis.window = { localStorage: storage };
}
const map = new Map();
const okStorage = {
  getItem: (k) => (map.has(k) ? map.get(k) : null),
  setItem: (k, v) => void map.set(k, String(v)),
};
const blocked = {
  getItem() { throw new DOMException('blocked'); },
  setItem() { throw new DOMException('blocked'); },
};
const { readUiTheme, writeUiTheme } = await import('../src/lib/ui-theme.ts');

test('a project with no choice is studded; the last choice is kept per project', () => {
  install(okStorage);
  assert.equal(readUiTheme('p1'), 'studded');
  assert.equal(readUiTheme(''), 'studded');
  writeUiTheme('p1', 'cartoony');
  writeUiTheme('p2', 'none');
  assert.equal(readUiTheme('p1'), 'cartoony');
  assert.equal(readUiTheme('p2'), 'none');
  assert.equal(readUiTheme('p3'), 'studded');
});

test('a corrupt stored value reads as studded', () => {
  install(okStorage);
  map.set('apple.uiTheme.p9', 'neon');
  assert.equal(readUiTheme('p9'), 'studded');
});

test('blocked storage never throws and the choice still holds for the session', () => {
  install(blocked);
  assert.equal(readUiTheme('p-blocked'), 'studded');
  assert.doesNotThrow(() => writeUiTheme('p-blocked', 'none'));
  assert.equal(readUiTheme('p-blocked'), 'none');
});

test('the socket reads the stored theme into every chat and edit_resend frame', () => {
  const socket = src('lib', 'use-project-socket.ts');
  assert.match(socket, /type: 'chat', text, mode, [^\n]*uiTheme: readUiTheme\(projectId\)/);
  assert.match(socket, /type: 'edit_resend', messageId, text, mode, [^\n]*uiTheme: readUiTheme\(projectId\)/);
});

test('the composer offers exactly the three themes, next to Create, and stores the pick', () => {
  const composer = src('components', 'ws', 'composer.tsx');
  assert.match(composer, /UI_THEMES\.map\(/);
  assert.match(composer, /UI: \{UI_THEME_LABEL\[uiTheme\]\}/);
  assert.match(composer, /writeUiTheme\(projectId \?\? '', next\)/);
  assert.ok(composer.indexOf('gx-chip--create') < composer.indexOf('gx-chip--theme'));
});
