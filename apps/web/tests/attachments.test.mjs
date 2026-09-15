/**
 * STAGED ATTACHMENTS: what the composer holds between "the person picked a file" and "the message
 * left", and what it says at every point in between.
 *
 * The composer's entire state was `text`, `modeOpen`, a box ref, a key ref and prefs — so there
 * was nowhere for a file to live, which is why "attachment upload progress", "attachment upload
 * cancellation", "attachment retry" and "attachment removal before sending" were all four filed as
 * blocked on the same missing thing. They are one model, not four features.
 *
 * It is a reducer with tests rather than five `useState`s because every one of those four rows is
 * a TRANSITION, and transitions asserted by clicking through a browser are asserted once.
 *
 * The properties that matter, each written against the case that breaks it:
 *
 *   - A REFUSED FILE IS REFUSED BEFORE THE UPLOAD, and the sentence is the server's own. Spending
 *     someone's upload on a file we already know will be refused is rude; refusing it in different
 *     words than the server would is worse, because the two read as different bugs.
 *
 *   - SEND IS BLOCKED WHILE A FILE IS IN FLIGHT, and the reason is a sentence. A message that
 *     leaves before its attachment lands arrives as "this file could not be read", and the person
 *     is never told why.
 *
 *   - A FAILED UPLOAD BLOCKS TOO, because the alternative is a message sent with a file the person
 *     can still see on their screen and the model never received. Retry and × are the two ways out
 *     and both are on the row.
 *
 *   - A CANCEL IS NOT AN ERROR. Cancelling leaves no failed row and no message: the person already
 *     knows, they did it.
 *
 *   - A 413 IS NOT A GENERIC 4xx. "Apple could not make sense of that request. Try again." is
 *     exactly wrong for a file that is too big — retrying is guaranteed to fail — and that is what
 *     the taxonomy said before this.
 *
 * Run with:  node --test tests/attachments.test.mjs      (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { MAX_ATTACHMENTS_PER_MESSAGE, MAX_ATTACHMENT_BYTES } from '@golem/shared';
import {
  admitFiles,
  attachmentFailure,
  blockingReason,
  progressPercent,
  readyAttachments,
  stageReducer,
} from '../src/lib/attachments.ts';
import { explainFailure } from '../src/lib/error-taxonomy.ts';

const file = (name, size = 10, type = 'text/plain') => ({ name, size, type });
const err = (status, message = 'nope') => Object.assign(new Error(message), { status });

/** Walk a list of actions through the reducer, the way the component does. */
const run = (actions, start = []) => actions.reduce((s, a) => stageReducer(s, a), start);

/* ------------------------------------------------------------------ admission ---- */

test('a file the server would refuse is refused here first, in the server’s own words', () => {
  const { admitted, refused } = admitFiles([], [file('shot.png', 100, 'image/png')]);
  assert.equal(admitted.length, 0);
  assert.equal(refused.length, 1);
  assert.equal(refused[0].name, 'shot.png');
  assert.match(refused[0].message, /image/i);
});

test('an over-size file never leaves the machine', () => {
  const { admitted, refused } = admitFiles([], [file('big.txt', MAX_ATTACHMENT_BYTES + 1)]);
  assert.equal(admitted.length, 0);
  assert.match(refused[0].message, /32 KB/);
});

test('past the per-message limit, the extra files are refused by name rather than dropped', () => {
  const already = run(
    Array.from({ length: MAX_ATTACHMENTS_PER_MESSAGE }, (_, i) => ({ type: 'stage', id: `s${i}`, name: `f${i}.txt`, size: 10 })),
  );
  const { admitted, refused } = admitFiles(already, [file('one-too-many.txt')]);
  assert.equal(admitted.length, 0);
  assert.equal(refused.length, 1);
  assert.match(refused[0].message, new RegExp(`${MAX_ATTACHMENTS_PER_MESSAGE}`));
});

test('a good file is admitted', () => {
  const { admitted, refused } = admitFiles([], [file('notes.md', 20, '')]);
  assert.equal(refused.length, 0);
  assert.equal(admitted.length, 1);
  assert.equal(admitted[0].name, 'notes.md');
});

/* ------------------------------------------------------------------ the model ---- */

test('a staged file starts at zero and reads as in flight', () => {
  const s = run([{ type: 'stage', id: 'a', name: 'notes.txt', size: 100 }]);
  assert.equal(s.length, 1);
  assert.equal(s[0].phase, 'uploading');
  assert.equal(progressPercent(s[0]), 0);
});

test('progress is a real fraction of a real total, and never runs past 100', () => {
  const s = run([
    { type: 'stage', id: 'a', name: 'notes.txt', size: 100 },
    { type: 'progress', id: 'a', sent: 50 },
  ]);
  assert.equal(progressPercent(s[0]), 50);
  // A server that acknowledges more than was sent must not paint a 140% bar.
  assert.equal(progressPercent(stageReducer(s, { type: 'progress', id: 'a', sent: 140 })[0]), 100);
});

test('an upload that lands carries the server’s record, not the browser’s guess', () => {
  const att = { kind: 'file', name: 'notes.txt', attachmentId: 'id-1', mime: 'text/plain', size: 100 };
  const s = run([
    { type: 'stage', id: 'a', name: 'notes.txt', size: 100 },
    { type: 'ready', id: 'a', attachment: att },
  ]);
  assert.equal(s[0].phase, 'ready');
  assert.equal(progressPercent(s[0]), 100);
  assert.deepEqual(readyAttachments(s), [att]);
});

test('only finished uploads are sent', () => {
  const att = { kind: 'file', name: 'a.txt', attachmentId: 'id-1', mime: 'text/plain', size: 1 };
  const s = run([
    { type: 'stage', id: 'a', name: 'a.txt', size: 1 },
    { type: 'ready', id: 'a', attachment: att },
    { type: 'stage', id: 'b', name: 'b.txt', size: 1 },
  ]);
  assert.deepEqual(readyAttachments(s), [att], 'a half-uploaded file must never ride on a message');
});

test('a retry puts the row back in flight at zero without moving it', () => {
  const s = run([
    { type: 'stage', id: 'a', name: 'a.txt', size: 100 },
    { type: 'stage', id: 'b', name: 'b.txt', size: 100 },
    { type: 'failed', id: 'a', message: 'Network error', retryable: true },
    { type: 'retry', id: 'a' },
  ]);
  assert.equal(s[0].id, 'a', 'a retried row that jumps to the end loses the person’s place');
  assert.equal(s[0].phase, 'uploading');
  assert.equal(s[0].sent, 0);
  assert.equal(s[0].error, null);
});

test('removing a row takes it out, and clearing takes them all', () => {
  const s = run([
    { type: 'stage', id: 'a', name: 'a.txt', size: 1 },
    { type: 'stage', id: 'b', name: 'b.txt', size: 1 },
    { type: 'remove', id: 'a' },
  ]);
  assert.deepEqual(s.map((r) => r.id), ['b']);
  assert.deepEqual(stageReducer(s, { type: 'clear' }), []);
});

test('an action naming a row that is gone changes nothing and throws nothing', () => {
  // A progress event can arrive after the person pressed ×; the request has not been told yet.
  const s = run([{ type: 'stage', id: 'a', name: 'a.txt', size: 1 }]);
  assert.deepEqual(stageReducer(s, { type: 'progress', id: 'ghost', sent: 5 }), s);
  assert.deepEqual(stageReducer(s, { type: 'ready', id: 'ghost', attachment: null }), s);
});

/* ------------------------------------------------------------------ the gate ---- */

test('send is blocked while a file is in flight, and the reason is a sentence', () => {
  const s = run([{ type: 'stage', id: 'a', name: 'a.txt', size: 1 }]);
  const why = blockingReason(s);
  assert.ok(why, 'a message that leaves before its attachment lands arrives without the file');
  assert.match(why, /still (uploading|going up)|uploading/i);
});

test('send is blocked by a failed row, because the person can still see the file on their screen', () => {
  const s = run([
    { type: 'stage', id: 'a', name: 'a.txt', size: 1 },
    { type: 'failed', id: 'a', message: 'Network error', retryable: true },
  ]);
  const why = blockingReason(s);
  assert.ok(why);
  // The two ways out have to be named, or the block is a dead end.
  assert.match(why, /retry|remove/i);
});

test('nothing staged, and everything uploaded, both allow send', () => {
  assert.equal(blockingReason([]), null);
  const s = run([
    { type: 'stage', id: 'a', name: 'a.txt', size: 1 },
    { type: 'ready', id: 'a', attachment: { kind: 'file', name: 'a.txt', attachmentId: 'x', mime: 'text/plain', size: 1 } },
  ]);
  assert.equal(blockingReason(s), null);
});

/* ------------------------------------------------------------------ failures ---- */

test('a 413 says the file is too big and does not offer a retry that cannot work', () => {
  const f = attachmentFailure(err(413, 'That file is larger than 32 KB.'));
  assert.equal(f.retryable, false, 'the same bytes will be refused the same way every time');
  assert.match(f.message, /32 KB/);
});

test('a 415 says this kind of file will never work, and is not retryable either', () => {
  const f = attachmentFailure(err(415, 'Apple can’t read images yet.'));
  assert.equal(f.retryable, false);
  assert.match(f.message, /image/i);
});

test('a network failure IS retryable, because the next attempt is a different attempt', () => {
  const f = attachmentFailure(err(0, 'Network error — check your connection.'));
  assert.equal(f.retryable, true);
});

test('the shared taxonomy learned 413 and 415, so every surface says the same thing', () => {
  // Before this, both fell through to "Apple could not make sense of that request" with
  // `retryable: true` — a Try again button over a file that can never be accepted.
  const tooBig = explainFailure(err(413, 'That file is larger than 32 KB.'));
  assert.equal(tooBig.retryable, false);
  assert.match(tooBig.title, /too (big|large)/i);
  const wrongType = explainFailure(err(415, 'Apple can’t read images yet.'));
  assert.equal(wrongType.retryable, false);
  assert.match(wrongType.title, /kind of file|type/i);
});

test('a cancel leaves no row and no error — the person already knows', () => {
  const s = run([
    { type: 'stage', id: 'a', name: 'a.txt', size: 1 },
    { type: 'remove', id: 'a' },
  ]);
  assert.deepEqual(s, []);
  assert.equal(blockingReason(s), null);
});
