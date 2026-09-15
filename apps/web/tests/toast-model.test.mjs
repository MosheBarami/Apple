// What a toast is allowed to do, decided away from React so it can be tested.
//
// The provider that shipped before this file had three defects, and all three are the same defect:
// it never modelled the stack, it only appended to it.
//
//   1. A repeated message stacked. A socket that drops four times in a row produced four identical
//      rows, which is not four pieces of information — it is one piece of information, shouted.
//   2. The cap was `list.slice(-3)`, which drops the OLDEST row unconditionally. Once a toast can
//      carry an Undo, dropping the oldest row silently throws away the user's only way back.
//   3. Every row's dismissal was a `setTimeout` closed over at creation, so a coalesced row could
//      not have its clock extended and a row could never outlive its original deadline.
//
// The rules below are therefore about what must NOT be discarded, and each is fed an input that
// violates it rather than being walked down the healthy path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');
const read = (f) => readFileSync(join(SRC, f), 'utf8');
/** Comments stripped: prose describing a rule must not satisfy a test for the rule. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const {
  TOAST_CAP,
  TOAST_KINDS,
  admitToast,
  sweepToasts,
  toastLifetimeMs,
  toastLive,
  toastRole,
} = await import('../src/components/toast-model.ts');
const { UNDO_WINDOW_MS } = await import('../src/lib/undo.ts');

const plain = (id, message, kind = 'info') => ({ id, kind, message, action: null });
const withUndo = (id, message) => ({ id, kind: 'success', message, action: { label: 'Undo', run() {} } });

/* ------------------------------------------------------------- lifetimes --- */

test('every kind has a finite, positive lifetime', () => {
  // A NaN lifetime makes `now + lifetime` NaN, and a NaN deadline never passes a `>` comparison:
  // the toast would sit on screen until the page reloaded.
  assert.ok(TOAST_KINDS.length >= 3, 'there should be several kinds to check');
  for (const kind of TOAST_KINDS) {
    for (const hasAction of [false, true]) {
      const ms = toastLifetimeMs(kind, hasAction);
      assert.ok(Number.isFinite(ms), `${kind}/${hasAction}: lifetime is not a finite number (${ms})`);
      assert.ok(ms > 0, `${kind}/${hasAction}: lifetime is not positive (${ms})`);
    }
  }
});

test('an unknown kind still yields a finite lifetime rather than NaN', () => {
  // The kind crosses a trust boundary the moment a caller passes a variable. A Record<Union, T> is
  // a compile-time promise; at runtime a missing key is `undefined` and `now + undefined` is NaN.
  const ms = toastLifetimeMs('catastrophe', false);
  assert.ok(Number.isFinite(ms) && ms > 0, `unknown kind produced ${ms}`);
});

test('an error is readable for longer than an info', () => {
  // The relationship, not the literals: whatever the numbers become, bad news gets more time.
  assert.ok(
    toastLifetimeMs('error', false) > toastLifetimeMs('info', false),
    'an error must outlive an info',
  );
});

test('a toast carrying an action outlives the window in which that action still works', () => {
  // THE RELATIONSHIP THAT MATTERS: an Undo that disappears before it expires is an Undo the user
  // watched vanish mid-reach. Whatever either number becomes, the button must outlast the offer.
  for (const kind of TOAST_KINDS) {
    assert.ok(
      toastLifetimeMs(kind, true) >= UNDO_WINDOW_MS,
      `${kind}: an actionable toast (${toastLifetimeMs(kind, true)}ms) dies before the undo window (${UNDO_WINDOW_MS}ms)`,
    );
    assert.ok(
      toastLifetimeMs(kind, true) >= toastLifetimeMs(kind, false),
      `${kind}: adding an action must never shorten the toast`,
    );
  }
});

/* ----------------------------------------------------------- coalescing --- */

test('the same message twice is one row that counts, not two rows', () => {
  const first = admitToast([], plain(1, 'Studio disconnected'), 1_000);
  const second = admitToast(first, plain(2, 'Studio disconnected'), 1_500);
  assert.equal(second.length, 1, 'a repeat must not stack');
  assert.equal(second[0].count, 2);
  assert.equal(second[0].id, 1, 'the row keeps its identity so it does not re-animate');
});

test('coalescing extends the deadline instead of leaving it where the first one put it', () => {
  const first = admitToast([], plain(1, 'Studio disconnected'), 1_000);
  const second = admitToast(first, plain(2, 'Studio disconnected'), 5_000);
  assert.ok(
    second[0].expiresAt > first[0].expiresAt,
    'the second occurrence must reset the clock, or the row vanishes while it is still true',
  );
  assert.equal(second[0].expiresAt, 5_000 + toastLifetimeMs('info', false));
});

test('two different kinds with the same words stay two rows', () => {
  const list = admitToast(admitToast([], plain(1, 'Saved'), 0), plain(2, 'Saved', 'error'), 0);
  assert.equal(list.length, 2, 'a success and a failure that read alike are not the same event');
});

test('TWO OFFERS OF UNDO ARE NEVER MERGED, even word for word', () => {
  // The violating input, fed deliberately: identical text, two distinct reversals behind it.
  // Merging them would strand one archived project with no way back and no sign anything was lost.
  const one = withUndo(1, 'Project archived');
  const two = withUndo(2, 'Project archived');
  const list = admitToast(admitToast([], one, 0), two, 10);
  assert.equal(list.length, 2, 'each undo is a separate promise to the user');
  assert.notEqual(list[0].action, list[1].action, 'and each must keep its OWN reversal');
});

/* ------------------------------------------------------------------ cap --- */

test('the cap drops the oldest plain toast', () => {
  let list = [];
  for (let i = 1; i <= TOAST_CAP + 2; i += 1) list = admitToast(list, plain(i, `message ${i}`), i);
  assert.equal(list.length, TOAST_CAP);
  assert.equal(list[list.length - 1].message, `message ${TOAST_CAP + 2}`, 'the newest survives');
  assert.ok(!list.some((t) => t.message === 'message 1'), 'the oldest is the one that goes');
});

test('THE CAP NEVER DISCARDS AN OFFERED UNDO', () => {
  // Fed more undo toasts than the cap allows, which is the input that made the old `slice(-3)`
  // throw a reversal away. An undo removed by a cap is removed silently: the row is simply not
  // there, and the user has no way to know the offer was ever made.
  let list = [];
  const over = TOAST_CAP + 2;
  for (let i = 1; i <= over; i += 1) list = admitToast(list, withUndo(i, `archived ${i}`), i);
  assert.equal(list.length, over, `an undo was evicted: ${over} offered, ${list.length} left`);
  for (let i = 1; i <= over; i += 1) {
    assert.ok(list.some((t) => t.id === i), `the undo for "archived ${i}" was dropped`);
  }
});

test('and the newest message is not the one sacrificed to make room for old undos', () => {
  let list = [];
  for (let i = 1; i <= TOAST_CAP + 1; i += 1) list = admitToast(list, withUndo(i, `archived ${i}`), i);
  const after = admitToast(list, plain(99, 'Display name saved'), 100);
  assert.ok(
    after.some((t) => t.id === 99),
    'the row that just arrived must never be the one the cap removes',
  );
});

/* ---------------------------------------------------------------- sweep --- */

test('a toast is swept exactly when its deadline has passed, not before', () => {
  const list = admitToast([], plain(1, 'Saved'), 1_000);
  const deadline = list[0].expiresAt;
  assert.equal(sweepToasts(list, deadline - 1).length, 1, 'still within its life');
  assert.equal(sweepToasts(list, deadline).length, 0, 'gone once the deadline arrives');
});

test('A TOAST WITH AN UNUSABLE DEADLINE IS SWEPT, NOT IMMORTAL', () => {
  // Fed the violating rows directly: `now > NaN` is false, so a naive sweep keeps them forever and
  // the stack becomes furniture. `??` would not have caught either of these — neither is nullish.
  for (const expiresAt of [Number.NaN, Number.POSITIVE_INFINITY, undefined, '9999']) {
    const rotten = [{ id: 1, kind: 'info', message: 'stuck', count: 1, action: null, expiresAt }];
    assert.equal(
      sweepToasts(rotten, 5_000).length,
      0,
      `a deadline of ${String(expiresAt)} left the toast on screen forever`,
    );
  }
});

test('A SWEEP THAT REMOVES NOTHING RETURNS THE STACK IT WAS GIVEN', () => {
  // Identity, not contents. The provider sweeps four times a second while anything is on screen,
  // and `setToasts` with a fresh array every tick re-renders EVERY component under the provider —
  // which is the whole app — for as long as a toast is visible. Returning the same reference is
  // what lets React bail out.
  const list = admitToast([], plain(1, 'Saved'), 1_000);
  assert.equal(sweepToasts(list, 1_500), list, 'a no-op sweep allocated a new array');
  assert.equal(sweepToasts(list, Number.NaN), list, 'and so did a sweep it refused to perform');
  // And when it DOES remove something, it must not hand back the original.
  assert.notEqual(sweepToasts(list, list[0].expiresAt), list);
});

test('sweeping with an unusable clock removes nothing rather than clearing the stack', () => {
  // The opposite failure: a bad `now` must not look like "everything expired" and wipe a live undo.
  const list = admitToast([], withUndo(1, 'Project archived'), 1_000);
  assert.equal(sweepToasts(list, Number.NaN).length, 1);
});

/* --------------------------------------------------------- announcement --- */

test('a failure interrupts a screen reader and a confirmation does not', () => {
  assert.equal(toastRole('error'), 'alert');
  assert.equal(toastLive('error'), 'assertive');
  for (const kind of ['info', 'success']) {
    assert.equal(toastRole(kind), 'status', `${kind} must not be an alert`);
    assert.equal(toastLive(kind), 'polite');
  }
});

/* ------------------------------------------------------------ the wiring --- */

test('the provider decides nothing for itself — it calls the model', () => {
  const src = code(read('components/toast.tsx'));
  assert.match(src, /setToasts\(\(list\) => admitToast\(list,/, 'admission must go through admitToast');
  assert.match(src, /sweepToasts\(list, Date\.now\(\)\)/, 'expiry must go through sweepToasts');
  assert.match(src, /role=\{toastRole\(t\.kind\)\}/, 'the role comes from the model');
  // The three defects in the header, pinned so they cannot come back.
  assert.doesNotMatch(src, /list\.slice\(-3\)/, 'the blind cap is gone');
  assert.doesNotMatch(src, /window\.setTimeout\(\(\) => dismiss\(id\)/, 'the per-toast timer is gone');
});

test('the action a toast carries is actually rendered, and consumes the toast', () => {
  const src = code(read('components/toast.tsx'));
  assert.match(src, /t\.action &&/, 'a toast with an action must render it');
  assert.match(src, /className="toast-action"/);
  // Clicking Undo and leaving the row sitting there invites a second click on a spent offer.
  assert.match(src, /onClick=\{\(\) => \{[^}]*t\.action\?\.run\(\);[\s\S]{0,80}dismiss\(t\.id\)/,
    'running the action must also dismiss the row');
});

test('a coalesced row says how many times it happened', () => {
  const src = code(read('components/toast.tsx'));
  assert.match(src, /t\.count > 1/, 'a row standing for four events must not look like one');
});
