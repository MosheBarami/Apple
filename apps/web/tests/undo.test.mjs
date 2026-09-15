// An offer to put something back, and the ways that offer lies.
//
// "Undo" in a toast is a promise made in the past tense: by the time the user reaches for it, the
// thing it reverses may already be beyond reach. Every test here is about the moment the promise
// stops being true, because that is the moment a naive implementation keeps making it:
//
//   * the button is clicked twice, and the reversal runs twice;
//   * the window has closed, and the reversal runs anyway against a row someone else now owns;
//   * the reversal THREW, and the UI says "restored" because it only observed that the call returned.
//
// The clock is injected, so the expired case is a real expired case rather than a test that waits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');
const read = (f) => readFileSync(join(SRC, f), 'utf8');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const { UNDO_WINDOW_MS, createUndoable } = await import('../src/lib/undo.ts');

/** A reversal that counts its own calls, so "ran once" is measured and not assumed. */
function spy(impl = async () => {}) {
  const calls = [];
  const fn = async (...args) => {
    calls.push(args);
    return impl(...args);
  };
  fn.calls = calls;
  return fn;
}

test('the window is a real, finite span', () => {
  assert.ok(Number.isFinite(UNDO_WINDOW_MS) && UNDO_WINDOW_MS > 0);
});

test('an undo inside its window reverses the thing exactly once', async () => {
  const reverse = spy();
  const u = createUndoable({ label: 'Undo', reverse, now: 0 });
  const r = await u.undo(1_000);
  assert.equal(r.ok, true);
  assert.equal(r.status, 'undone');
  assert.equal(reverse.calls.length, 1);
});

test('A SECOND CLICK DOES NOT REVERSE IT A SECOND TIME', async () => {
  // Double-clicking a button is not a rare event, and the second archive-then-restore lands on a
  // row the user has already put back.
  const reverse = spy();
  const u = createUndoable({ label: 'Undo', reverse, now: 0 });
  await u.undo(10);
  const again = await u.undo(20);
  assert.equal(reverse.calls.length, 1, 'the reversal ran twice');
  assert.equal(again.status, 'undone');
  assert.equal(u.offered(30), false, 'a spent offer must stop being offered');
});

test('two clicks in the same tick share one reversal rather than racing', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const reverse = spy(() => gate);
  const u = createUndoable({ label: 'Undo', reverse, now: 0 });
  const a = u.undo(1);
  const b = u.undo(1);
  release();
  await Promise.all([a, b]);
  assert.equal(reverse.calls.length, 1, 'the in-flight reversal must be shared, not restarted');
});

test('AN EXPIRED UNDO DOES NOT RUN, AND SAYS SO', async () => {
  const reverse = spy();
  const u = createUndoable({ label: 'Undo', reverse, windowMs: 5_000, now: 0 });
  const r = await u.undo(5_000);
  assert.equal(reverse.calls.length, 0, 'the reversal ran after its window closed');
  assert.equal(r.ok, false);
  assert.equal(r.status, 'expired');
  assert.equal(u.offered(5_000), false);
  // And the boundary is not off by one in the other direction: a millisecond earlier still works.
  const still = createUndoable({ label: 'Undo', reverse: spy(), windowMs: 5_000, now: 0 });
  assert.equal(still.offered(4_999), true);
});

test('AN UNUSABLE CLOCK IS TREATED AS EXPIRED, NOT AS FOREVER-PENDING', async () => {
  // `now - createdAt >= windowMs` is FALSE when `now` is NaN, so the naive read of a broken clock
  // is "still fresh" — a guard that fails open, and offers a reversal of unknown age.
  const reverse = spy();
  const u = createUndoable({ label: 'Undo', reverse, now: 0 });
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, undefined, 'soon']) {
    const r = await u.undo(bad);
    assert.equal(r.status, 'expired', `a now of ${String(bad)} was read as still pending`);
    assert.equal(u.offered(bad), false, `a now of ${String(bad)} still offered the undo`);
  }
  assert.equal(reverse.calls.length, 0);
});

test('a window that is not a finite number is refused at construction', () => {
  // Not a runtime shrug: an undoable with a NaN window either never expires or never offers, and
  // both are silent. The caller hears about it immediately instead.
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1, '8000', null]) {
    assert.throws(
      () => createUndoable({ label: 'Undo', reverse: spy(), windowMs: bad }),
      /window/i,
      `windowMs of ${String(bad)} was accepted`,
    );
  }
});

test('A REVERSAL THAT THREW IS NOT REPORTED AS AN UNDO', async () => {
  // The observation failure, in its purest form: the call returned, so the UI said "restored".
  // Nothing was restored — the network refused it.
  const boom = spy(async () => { throw new Error('offline'); });
  const u = createUndoable({ label: 'Undo', reverse: boom, now: 0 });
  const r = await u.undo(100);
  assert.equal(r.ok, false);
  assert.equal(r.status, 'failed');
  assert.equal(u.status(100), 'failed');
  // Still inside the window, so the user may try again — and trying again really does try again.
  assert.equal(u.offered(200), true);
  const second = await u.undo(200);
  assert.equal(boom.calls.length, 2, 'a failed undo must be retryable, not spent');
  assert.equal(second.status, 'failed');
});

test('a failed undo that then expires stops being offered', async () => {
  const boom = spy(async () => { throw new Error('offline'); });
  const u = createUndoable({ label: 'Undo', reverse: boom, windowMs: 1_000, now: 0 });
  await u.undo(100);
  assert.equal(u.offered(1_000), false);
  assert.equal(u.status(1_000), 'expired');
});

/* ------------------------------------------------------------ the wiring --- */

test('archiving a project offers a real undo rather than a confirmation up front', () => {
  const dash = code(read('routes/dashboard.tsx'));
  assert.match(dash, /createUndoable\(/, 'the archive path must build an undoable');
  // Anchored to the line that carries the claim: the reversal is the opposite archive, run through
  // the same mutation, so it invalidates the same three caches the forward action does.
  assert.match(
    dash,
    /reverse: \(\) => setArchived\.mutateAsync\(\{ project, archive: !archive \}\)/,
    'the reversal must actually put the project back',
  );
  assert.match(dash, /action: \{ label: 'Undo'/, 'and the toast must offer it');
});
