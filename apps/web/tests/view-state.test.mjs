// Where you left the interface.
//
// The rail's collapse already survived a reload. The drawer, the scope tab and the search filters
// did not — they were plain `useState` and reset on every navigation.
//
// Restoring is the easy half. The half that goes wrong is VALIDATING what comes back: a value
// written by a previous version of the app sets a state this build cannot render, and the result
// is an interface insisting it is showing something that is not there. Every read below is held
// against what the caller says it can display.
import test from 'node:test';
import assert from 'node:assert/strict';

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

const install = (s) => {
  globalThis.window = { localStorage: s };
};
globalThis.DOMException = globalThis.DOMException ?? class DOMException extends Error {};
install(fakeStorage());

const { readViewChoice, writeViewChoice, readViewState, writeViewState, clearAllViewState } =
  await import('../src/lib/view-state.ts');
const { scopeToShow } = await import('../src/lib/archive.ts');

const DRAWERS = ['none', 'checkpoints', 'memory', 'credits', 'search'];

test('a choice written is the choice restored', () => {
  install(fakeStorage());
  writeViewChoice('drawer.p1', 'search');
  assert.equal(readViewChoice('drawer.p1', DRAWERS, 'none'), 'search');
});

test('choices are per key, so one project’s drawer is not another’s', () => {
  install(fakeStorage());
  writeViewChoice('drawer.p1', 'search');
  writeViewChoice('drawer.p2', 'memory');
  assert.equal(readViewChoice('drawer.p1', DRAWERS, 'none'), 'search');
  assert.equal(readViewChoice('drawer.p2', DRAWERS, 'none'), 'memory');
});

test('a stored value this build cannot render falls back instead of being obeyed', () => {
  // The defect: a drawer named by an older version sets the state open with nothing to draw, and
  // the interface then claims to be showing something it is not.
  const s = fakeStorage();
  install(s);
  s.map.set('apple.view.drawer.p1', 'telemetry');
  assert.equal(readViewChoice('drawer.p1', DRAWERS, 'none'), 'none');
});

test('nothing stored is the default, not an empty string', () => {
  install(fakeStorage());
  assert.equal(readViewChoice('drawer.never', DRAWERS, 'none'), 'none');
});

test('writing null forgets the choice rather than storing the word null', () => {
  const s = fakeStorage();
  install(s);
  writeViewChoice('drawer.p1', 'search');
  writeViewChoice('drawer.p1', null);
  assert.equal(s.map.has('apple.view.drawer.p1'), false);
  assert.equal(readViewChoice('drawer.p1', DRAWERS, 'none'), 'none');
});

test('storage that throws costs the preference, not the route', () => {
  install(fakeStorage({ throwOn: 'get' }));
  assert.equal(readViewChoice('drawer.p1', DRAWERS, 'none'), 'none');
  assert.doesNotThrow(() => writeViewChoice('drawer.p1', 'search'));
  install(fakeStorage({ throwOn: 'set' }));
  assert.doesNotThrow(() => writeViewChoice('drawer.p1', 'search'));
});

// ------------------------------------------------------------------ structured state ---

test('a structured value round trips through its own normaliser', () => {
  install(fakeStorage());
  const norm = (raw) => (raw && typeof raw === 'object' && Array.isArray(raw.types) ? raw : { types: [] });
  writeViewState('search.filter.p1', { types: ['message'] });
  assert.deepEqual(readViewState('search.filter.p1', norm), { types: ['message'] });
});

test('a corrupt structured value is normalised, never thrown from a render', () => {
  const s = fakeStorage();
  install(s);
  s.map.set('apple.view.search.filter.p1', '{half written');
  const norm = (raw) => (raw && typeof raw === 'object' ? raw : { types: [] });
  assert.deepEqual(readViewState('search.filter.p1', norm), { types: [] });
});

test('the normaliser is asked about the missing case too, rather than being skipped', () => {
  // A `readViewState` that returned a bare default when nothing was stored would let the two
  // paths — "nothing yet" and "something unreadable" — produce different shapes.
  install(fakeStorage());
  let sawNull = false;
  readViewState('never.written', (raw) => {
    if (raw === null) sawNull = true;
    return { types: [] };
  });
  assert.equal(sawNull, true);
});

test('every view preference goes at sign-out, and nothing else does', () => {
  const s = fakeStorage();
  install(s);
  writeViewChoice('drawer.p1', 'search');
  writeViewChoice('dashboard.scope', 'archived');
  s.map.set('apple.draft.p1', 'unsent');
  clearAllViewState();
  assert.equal(readViewChoice('drawer.p1', DRAWERS, 'none'), 'none');
  assert.equal(s.map.get('apple.draft.p1'), 'unsent');
});

// --------------------------------------------------- a restored tab that cannot exist ---

test('a remembered Archived scope yields when there is nothing archived', () => {
  // The Archived tab renders only when something is in it. Restoring 'archived' onto an empty
  // archive would strand the user on an empty list with no control on the page to leave it.
  assert.equal(scopeToShow('archived', 0), 'active');
});

test('a remembered Archived scope stands when there is something in it', () => {
  assert.equal(scopeToShow('archived', 3), 'archived');
});

test('the scope is left alone until the archive has answered', () => {
  // Flipping before the count is known moves the tab under the user a moment after they arrive —
  // the same defect in the other direction.
  assert.equal(scopeToShow('archived', null), 'archived');
});

test('an Active scope is never overridden', () => {
  for (const count of [0, 3, null]) assert.equal(scopeToShow('active', count), 'active');
});
