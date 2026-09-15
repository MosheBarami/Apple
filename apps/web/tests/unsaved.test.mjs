/**
 * THE ONE CLASS OF UNSAVED WORK THAT HAD NOTHING AT ALL.
 *
 * The composer draft is safe: lib/draft.ts persists it, it survives a reload and a route change,
 * and draft.test.mjs holds twenty assertions over it. The memory panel and the instructions
 * panel are the opposite — a `dirty` flag and a textarea in component state, nothing written
 * anywhere. Close the tab on a rewritten project memory and it is gone, with no warning and no
 * way back.
 *
 * `beforeunload` is what exists for that. It is deliberately NOT a permanent listener:
 *
 *   A guard registered whether or not there is anything to lose asks the browser to interrupt
 *   every single reload. People learn in two days to click through the dialog without reading
 *   it, and then it does not work on the one day it matters.
 *
 * In-app navigation is not blocked and this does not pretend to. react-router's useBlocker needs
 * a data router and this app mounts <BrowserRouter>; the drawers also abandon their edits on
 * close BY DESIGN — see the comment on the memory Drawer in routes/workspace.tsx. What was
 * missing was the case with no recourse at all: the tab closing.
 *
 * Run with:  node --test apps/web/tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'unsaved-'));

// React stands in for itself: useEffect queues rather than schedules, so the test can run the
// effect and its cleanup by hand and watch what each one does to the target.
const stub = join(dir, 'react-stub.mjs');
writeFileSync(stub, 'globalThis.__effects = [];\nexport function useEffect(fn) { globalThis.__effects.push(fn); }\n');

const out = join(dir, 'unsaved.mjs');
execFileSync(join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [join(WEB, 'src', 'lib', 'unsaved.ts'), '--bundle', '--format=esm', '--platform=neutral',
   '--main-fields=main,module', `--alias:react=${stub}`, '--outfile=' + out], { stdio: 'pipe' });
const U = await import(out);

/** A window that records what was asked of it. */
function fakeWindow() {
  const listeners = [];
  return {
    listeners,
    addEventListener: (type, fn) => listeners.push([type, fn]),
    removeEventListener: (type, fn) => {
      const i = listeners.findIndex(([t, f]) => t === type && f === fn);
      if (i !== -1) listeners.splice(i, 1);
    },
  };
}

/** The event the browser hands a beforeunload listener, as far as this cares. */
function unloadEvent() {
  return { prevented: false, returnValue: undefined, preventDefault() { this.prevented = true; } };
}

test('an armed guard asks the browser to interrupt the close', () => {
  const win = fakeWindow();
  U.armUnloadWarning(win);
  assert.equal(win.listeners.length, 1, 'exactly one listener, on exactly one event');
  assert.equal(win.listeners[0][0], 'beforeunload');

  const e = unloadEvent();
  win.listeners[0][1](e);
  // Both halves are required: Chrome honours preventDefault, older engines honour returnValue,
  // and doing one of the two produces a guard that silently does nothing in half the browsers.
  assert.equal(e.prevented, true, 'preventDefault is what modern browsers read');
  assert.equal(e.returnValue, '', 'returnValue is what the older ones read');
});

test('disarming removes the listener it added, not a fresh one', () => {
  const win = fakeWindow();
  const disarm = U.armUnloadWarning(win);
  const added = win.listeners[0][1];
  disarm();
  assert.deepEqual(win.listeners, [], 'the warning must stop the moment the edit is saved');
  // removeEventListener matches by identity; a guard that hands over a new closure leaves the
  // old one attached for ever and every later reload keeps asking.
  assert.equal(typeof added, 'function');
});

test('nothing is armed while there is nothing to lose', () => {
  // Driven through the hook itself: clean means the effect body registers nothing at all.
  const effects = globalThis.__effects;
  assert.ok(Array.isArray(effects), 'the react stub must be the one this bundle uses');

  effects.length = 0;
  U.useUnsavedGuard(false);
  assert.equal(effects.length, 1, 'the hook must run unconditionally — hooks cannot be conditional');
  assert.equal(effects[0](), undefined, 'a clean panel registers nothing and has nothing to clean up');

  // And dirty does arm, through the same path, so the two branches are one mechanism rather than
  // a guard that happens to be tested only in the state where it does nothing. The hook reaches
  // for the real `window`, so one is put where it looks.
  const win = fakeWindow();
  globalThis.window = win;
  try {
    effects.length = 0;
    U.useUnsavedGuard(true);
    const disarm = effects[0]();
    assert.equal(typeof disarm, 'function', 'a dirty panel must come back with a disarm');
    assert.equal(win.listeners.length, 1, 'and must have armed the real window on the way');
    disarm();
    assert.deepEqual(win.listeners, []);
  } finally {
    delete globalThis.window;
  }
});

test('the panels that hold an edit in memory alone are the ones guarded', () => {
  const src = (...p) => readFileSync(join(WEB, 'src', ...p), 'utf8');
  for (const panel of ['memory-panel.tsx', 'instructions-panel.tsx']) {
    const s = src('components', 'ws', panel);
    assert.match(s, /useUnsavedGuard\(dirty\)/, `${panel} must guard its own dirty flag`);
    assert.match(s, /from '\.\.\/\.\.\/lib\/unsaved'/, `${panel} must use the shared guard, not its own`);
  }
});

test('what is NOT claimed is said in the file rather than left to be assumed', () => {
  // A guard that cannot see in-app navigation must say so, or the next reader will believe the
  // panels are protected against something they are not.
  const s = readFileSync(join(WEB, 'src', 'lib', 'unsaved.ts'), 'utf8');
  assert.match(s, /useBlocker|BrowserRouter/, 'the limit has to be named where the guard lives');
});
