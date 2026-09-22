// An unsent message, kept across a reload.
//
// Losing a half-written prompt to an accidental reload is small and infuriating, and it happens
// most often to the longest messages — the ones worth the most to keep.
//
// The storage helpers are exercised for real against a fake localStorage, including the case where
// storage THROWS, because that is the one that turns a lost draft into a broken composer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');

/** A localStorage good enough to be wrong in the interesting ways. */
function fakeStorage({ throwOn = null } = {}) {
  const map = new Map();
  return {
    map,
    getItem(k) {
      if (throwOn === 'get') throw new DOMException('blocked');
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      if (throwOn === 'set') throw new DOMException('QuotaExceededError');
      map.set(k, String(v));
    },
    removeItem(k) {
      if (throwOn === 'remove') throw new DOMException('blocked');
      map.delete(k);
    },
    // A real Storage is an ordered, INDEXED collection, and removing from it re-indexes what is
    // left. Modelling that is the whole point: a clear-all that removes while iterating skips
    // every second match, and a Map-only fake would never show it.
    get length() {
      if (throwOn === 'get') throw new DOMException('blocked');
      return map.size;
    },
    key(i) {
      if (throwOn === 'get') throw new DOMException('blocked');
      return [...map.keys()][i] ?? null;
    },
  };
}

function install(storage) {
  globalThis.window = { localStorage: storage };
}

globalThis.DOMException = globalThis.DOMException ?? class DOMException extends Error {};
install(fakeStorage());
const { readDraft, writeDraft, clearDraft, clearAllDrafts, DRAFT_MAX } = await import('../src/lib/draft.ts');

// -------------------------------------------------------------- round trip ---

test('a draft written is a draft read back', () => {
  const s = fakeStorage();
  install(s);
  writeDraft('p1', 'half a thought about doors');
  assert.equal(readDraft('p1'), 'half a thought about doors');
});

test('drafts are per project', () => {
  // One shared key would show project A's unsent message in project B — worse than losing it,
  // because the user then sends the wrong thing to the wrong place.
  const s = fakeStorage();
  install(s);
  writeDraft('p1', 'about the door');
  writeDraft('p2', 'about the lava');
  assert.equal(readDraft('p1'), 'about the door');
  assert.equal(readDraft('p2'), 'about the lava');
});

test('a project with no draft reads as empty, not as undefined', () => {
  install(fakeStorage());
  assert.equal(readDraft('never-typed'), '');
});

test('clearing removes it', () => {
  const s = fakeStorage();
  install(s);
  writeDraft('p1', 'something');
  clearDraft('p1');
  assert.equal(readDraft('p1'), '');
});

// -------------------------------------------------------------- housekeeping ---

test('an emptied draft is removed rather than stored as an empty string', () => {
  // Otherwise every project ever opened leaves a key behind, and the origin's storage quota is
  // shared — eventually a real draft fails to save because of a hundred empty ones.
  const s = fakeStorage();
  install(s);
  writeDraft('p1', 'typed something');
  assert.equal(s.map.size, 1);
  writeDraft('p1', '');
  assert.equal(s.map.size, 0, 'the key must be gone, not set to ""');
});

test('whitespace only is treated as empty', () => {
  const s = fakeStorage();
  install(s);
  writeDraft('p1', 'real');
  writeDraft('p1', '   \n\t ');
  assert.equal(s.map.size, 0);
});

test('a draft is capped at the length a message could actually be', () => {
  const s = fakeStorage();
  install(s);
  writeDraft('p1', 'x'.repeat(DRAFT_MAX + 500));
  assert.equal(s.map.get('apple.draft.p1').length, DRAFT_MAX);
  assert.equal(readDraft('p1').length, DRAFT_MAX);
});

test('a missing project id is a no-op, not a key called "undefined"', () => {
  const s = fakeStorage();
  install(s);
  writeDraft('', 'orphan');
  assert.equal(s.map.size, 0);
  assert.equal(readDraft(''), '');
});

// ------------------------------------------------------------ storage throws ---

test('a private window does not break the composer', () => {
  // localStorage throws on ACCESS in a private window and in some embedded webviews. An exception
  // on the composer's change handler takes the composer down — losing a draft is a small failure,
  // losing the ability to type is not.
  install(fakeStorage({ throwOn: 'get' }));
  assert.doesNotThrow(() => readDraft('p1'));
  assert.equal(readDraft('p1'), '');

  install(fakeStorage({ throwOn: 'set' }));
  assert.doesNotThrow(() => writeDraft('p1', 'anything'));

  install(fakeStorage({ throwOn: 'remove' }));
  assert.doesNotThrow(() => clearDraft('p1'));
});

test('a full storage quota does not break the composer either', () => {
  install(fakeStorage({ throwOn: 'set' }));
  assert.doesNotThrow(() => writeDraft('p1', 'x'.repeat(5000)));
});

// ------------------------------------------------------------- the composer ---

const COMPOSER = readFileSync(join(WEB, 'src', 'components', 'ws', 'composer.tsx'), 'utf8');
const WS = readFileSync(join(WEB, 'src', 'routes', 'workspace.tsx'), 'utf8');

test('the draft is restored on the FIRST render, not in an effect', () => {
  // Restoring in an effect paints an empty box first, and people start retyping into it before
  // the draft lands on top of what they typed.
  assert.match(COMPOSER, /useState\(\(\) => \(draftKey \? readDraft\(draftKey\) : ''\)\)/);
});

test('switching projects swaps the draft', () => {
  // Without this the composer keeps the previous project's text — the exact failure the
  // per-project key exists to prevent. The same value moves the caret too, so a shorter restored
  // draft cannot inherit project A's stale selection offset.
  assert.match(COMPOSER, /if \(draftKey === lastKey\.current\) return;/);
  assert.match(COMPOSER, /const next = draftKey \? readDraft\(draftKey\) : '';/);
  assert.match(COMPOSER, /setText\(next\);/);
  assert.match(COMPOSER, /setCaret\(next\.length\);/);
});

test('writes are debounced rather than one per keystroke', () => {
  const block = COMPOSER.slice(COMPOSER.indexOf('const timer = setTimeout(() => writeDraft'));
  assert.match(block, /writeDraft\(draftKey, text\), 400\)/);
  assert.match(block, /clearTimeout\(timer\)/);
});

test('the draft is cleared only after the message actually left', () => {
  // A send refused because the socket had closed must leave the draft exactly where it was.
  const submit = COMPOSER.slice(COMPOSER.indexOf('const submit ='), COMPOSER.indexOf('const onKeyDown'));
  // `return false`: the refusal PromptInput honours by clearing nothing (composer-send.test.mjs).
  assert.match(submit, /if \(!value \|\| running \|\| disabled\) return false;/);
  assert.ok(submit.indexOf('onSend(value)') < submit.indexOf('clearDraft(draftKey)'), 'send, then clear');
  assert.ok(
    submit.indexOf('if (!value || running || disabled) return false;') < submit.indexOf('clearDraft(draftKey)'),
    'a refused send must never reach the clear',
  );
});

test('the workspace gives the composer a project-scoped key', () => {
  assert.match(WS, /draftKey=\{projectId\}/);
});

// ------------------------------------------------------ gone at sign-out ---
//
// THE DEFECT. Every other piece of user content here is isolated by Postgres RLS and never leaves
// the server without a verified JWT. A draft is the exception: the user's own unsent words, in
// localStorage, on a device that may not be theirs. Nothing cleared them, so a prompt typed by one
// person sat in the composer waiting for whoever signed in next.

test('signing out removes every draft', () => {
  const s = fakeStorage();
  install(s);
  writeDraft('p1', 'one');
  writeDraft('p2', 'two');
  clearAllDrafts();
  assert.equal(readDraft('p1'), '');
  assert.equal(readDraft('p2'), '');
});

test('it removes EVERY draft, not every second one', () => {
  // The trap this exists for: `for (i = 0; i < length; i++) removeItem(key(i))` re-indexes the
  // store underneath the loop and silently leaves half the drafts behind — and looks like it
  // worked, because the ones it checked are gone. Five, so an off-by-one cannot pass by luck.
  const s = fakeStorage();
  install(s);
  for (const id of ['a', 'b', 'c', 'd', 'e']) writeDraft(id, `draft ${id}`);
  assert.equal(s.map.size, 5, 'precondition: five drafts stored');
  clearAllDrafts();
  assert.equal(s.map.size, 0, `left behind: ${[...s.map.keys()].join(', ')}`);
});

test('it leaves keys that are not drafts alone', () => {
  // The rail's collapse preference shares this origin. A clear-all that took the whole store would
  // be a sign-out that silently reset the user's layout.
  const s = fakeStorage();
  install(s);
  s.map.set('apple.rail.collapsed', '1');
  s.map.set('sb-npqvyijsvzkuwddyhtpm-auth-token', 'something supabase owns');
  writeDraft('p1', 'mine');
  clearAllDrafts();
  assert.equal(s.map.get('apple.rail.collapsed'), '1');
  assert.equal(s.map.get('sb-npqvyijsvzkuwddyhtpm-auth-token'), 'something supabase owns');
  assert.equal(readDraft('p1'), '');
});

test('clearing does not throw when storage is unavailable', () => {
  // Sign-out must complete in a private window. An exception here would leave the user signed in.
  install(fakeStorage({ throwOn: 'get' }));
  assert.doesNotThrow(() => clearAllDrafts());
  install(fakeStorage({ throwOn: 'remove' }));
  assert.doesNotThrow(() => clearAllDrafts());
});

test('and the app actually calls it — on the EVENT, not the button', () => {
  // A clear-all nothing calls is a dead end. Bound to SIGNED_OUT rather than to signOut() so that
  // a token expiry, and a session replaced by a different account, clear the drafts too.
  const AUTH = readFileSync(join(WEB, 'src', 'lib', 'auth.tsx'), 'utf8');
  assert.match(AUTH, /clearAllDrafts/, 'auth.tsx must clear drafts');
  // Read as the BRANCH rather than as one statement's spelling. The original pattern here was
  // `/event === 'SIGNED_OUT'\s*\)\s*clearAllDrafts\(\)/`, which pinned the call to being the
  // whole body of the `if`: adding a second thing to clear on sign-out turned it red while the
  // property it names — the clear hangs off the EVENT, not the button — was still exactly true.
  // Anchored to the end of the handler's first statement after the branch, so a call that moves
  // out of the branch and into `signOut()` still fails it.
  const branch = AUTH.slice(AUTH.indexOf("event === 'SIGNED_OUT'"), AUTH.indexOf('setSession(next)'));
  assert.match(branch, /clearAllDrafts\(\)/, 'it must hang off the SIGNED_OUT event, not only the sign-out button');
});
