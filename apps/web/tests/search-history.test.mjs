// Recent searches.
//
// Exercised against a fake localStorage, including the case where storage THROWS, because that is
// the one that turns "the history did not persist" into "the search panel does not render".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
    // left — which is what makes a clear-all that removes while iterating skip every second key.
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
const { readSearchHistory, rememberSearch, forgetSearch, clearSearchHistory, clearAllSearchHistory, HISTORY_MAX, HISTORY_MIN_QUERY } =
  await import('../src/lib/search-history.ts');

test('a search remembered is a search read back', () => {
  install(fakeStorage());
  rememberSearch('p1', 'ProximityPrompt');
  assert.deepEqual(readSearchHistory('p1'), ['ProximityPrompt']);
});

test('the newest question is first', () => {
  install(fakeStorage());
  rememberSearch('p1', 'door');
  rememberSearch('p1', 'lava');
  assert.deepEqual(readSearchHistory('p1'), ['lava', 'door']);
});

test('history is per project', () => {
  // A shared list shows one project's vocabulary inside another — noise at best, and at worst the
  // name of something the user was doing elsewhere.
  install(fakeStorage());
  rememberSearch('p1', 'door');
  rememberSearch('p2', 'lava');
  assert.deepEqual(readSearchHistory('p1'), ['door']);
  assert.deepEqual(readSearchHistory('p2'), ['lava']);
});

test('searching the same thing again moves it up instead of duplicating it', () => {
  install(fakeStorage());
  rememberSearch('p1', 'door');
  rememberSearch('p1', 'lava');
  rememberSearch('p1', 'door');
  assert.deepEqual(readSearchHistory('p1'), ['door', 'lava']);
});

test('a re-search in different casing keeps the spelling just typed', () => {
  install(fakeStorage());
  rememberSearch('p1', 'door');
  rememberSearch('p1', 'Door');
  assert.deepEqual(readSearchHistory('p1'), ['Door']);
});

test('the list is capped, dropping the oldest', () => {
  install(fakeStorage());
  for (let i = 0; i < HISTORY_MAX + 4; i += 1) rememberSearch('p1', `query ${i}`);
  const out = readSearchHistory('p1');
  assert.equal(out.length, HISTORY_MAX);
  assert.equal(out[0], `query ${HISTORY_MAX + 3}`, 'newest kept');
  assert.equal(out.includes('query 0'), false, 'oldest dropped');
});

test('a query too short to have been searched is not remembered', () => {
  // Every keystroke passes through the box. Remembering what was TYPED fills the list with "d",
  // "do", "doo" and buries the entry that was worth keeping.
  install(fakeStorage());
  rememberSearch('p1', 'd');
  rememberSearch('p1', '  ');
  assert.deepEqual(readSearchHistory('p1'), []);
  assert.equal(HISTORY_MIN_QUERY, 2);
});

test('a query is stored trimmed', () => {
  install(fakeStorage());
  rememberSearch('p1', '  door  ');
  assert.deepEqual(readSearchHistory('p1'), ['door']);
});

test('one entry can be forgotten without touching the rest', () => {
  install(fakeStorage());
  rememberSearch('p1', 'door');
  rememberSearch('p1', 'lava');
  assert.deepEqual(forgetSearch('p1', 'door'), ['lava']);
  assert.deepEqual(readSearchHistory('p1'), ['lava']);
});

test('clearing one project leaves the others alone', () => {
  install(fakeStorage());
  rememberSearch('p1', 'door');
  rememberSearch('p2', 'lava');
  clearSearchHistory('p1');
  assert.deepEqual(readSearchHistory('p1'), []);
  assert.deepEqual(readSearchHistory('p2'), ['lava']);
});

test('an empty history removes its key rather than storing an empty list', () => {
  // Otherwise every project ever opened leaves a key behind, and the origin's quota is shared:
  // eventually a real write fails because of a hundred empty ones.
  const s = fakeStorage();
  install(s);
  rememberSearch('p1', 'door');
  clearSearchHistory('p1');
  assert.equal([...s.map.keys()].some((k) => k.includes('p1')), false);
});

// ------------------------------------------------------------------- hostile storage ---

test('a corrupt value reads as no history rather than throwing inside a render', () => {
  const s = fakeStorage();
  install(s);
  s.map.set('apple.search.history.p1', '{not json');
  assert.deepEqual(readSearchHistory('p1'), []);
});

test('a stored value that is not a list of strings is discarded, not rendered', () => {
  const s = fakeStorage();
  install(s);
  s.map.set('apple.search.history.p1', JSON.stringify({ door: true }));
  assert.deepEqual(readSearchHistory('p1'), []);
  s.map.set('apple.search.history.p1', JSON.stringify(['door', 42, null, '', 'lava']));
  assert.deepEqual(readSearchHistory('p1'), ['door', 'lava']);
});

test('storage that throws on read costs the history, not the panel', () => {
  install(fakeStorage({ throwOn: 'get' }));
  assert.deepEqual(readSearchHistory('p1'), []);
  assert.doesNotThrow(() => rememberSearch('p1', 'door'));
  assert.doesNotThrow(() => clearAllSearchHistory());
});

test('storage that throws on write costs the history, not the search', () => {
  install(fakeStorage({ throwOn: 'set' }));
  assert.doesNotThrow(() => rememberSearch('p1', 'door'));
});

// --------------------------------------------------------------------- at sign-out ---

test('every project’s history goes at sign-out, and nothing else does', () => {
  // These are the user's own words on a device that may not be theirs — the same exception drafts
  // are, so they leave by the same door.
  const s = fakeStorage();
  install(s);
  rememberSearch('p1', 'door');
  rememberSearch('p2', 'lava');
  s.map.set('apple.draft.p1', 'unsent');
  s.map.set('sb-access-token', 'keep me');
  clearAllSearchHistory();
  assert.deepEqual(readSearchHistory('p1'), []);
  assert.deepEqual(readSearchHistory('p2'), []);
  assert.equal(s.map.get('apple.draft.p1'), 'unsent', 'drafts are cleared by their own module');
  assert.equal(s.map.get('sb-access-token'), 'keep me');
});

test('clearing walks the store without skipping every second key', () => {
  // Removing while iterating `localStorage.key(i)` re-indexes underneath the loop: half the
  // histories stay behind while the call looks like it worked.
  const s = fakeStorage();
  install(s);
  for (const p of ['p1', 'p2', 'p3', 'p4', 'p5']) rememberSearch(p, `query for ${p}`);
  clearAllSearchHistory();
  assert.equal([...s.map.keys()].filter((k) => k.startsWith('apple.search.history.')).length, 0);
});

test('and the app actually clears it — on the EVENT, not the button', () => {
  // A clear-all nothing calls is a dead end. Bound to SIGNED_OUT rather than to signOut() so that
  // a token expiry, and a session replaced by a different account, clear the history too.
  //
  // This assertion exists because a falsification aimed at auth.tsx came back green: every test in
  // this file called the function directly, so nothing anywhere covered the wiring. Asserted as
  // the BRANCH, not as a statement's shape — the next thing added to the sign-out path must not
  // turn it red while the property holds.
  const AUTH = readFileSync(new URL('../src/lib/auth.tsx', import.meta.url), 'utf8');
  const branch = AUTH.slice(AUTH.indexOf("event === 'SIGNED_OUT'"), AUTH.indexOf('setSession(next)'));
  assert.match(branch, /clearAllSearchHistory\(\)/, 'sign-out must clear the search history');
});
