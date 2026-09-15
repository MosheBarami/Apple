// Many invitations, one request — and the per-row answer that comes back.
//
// The worker has had POST /api/shared/:id/members/bulk for a while: capped at fifty, refused whole
// rather than truncated, every row validated before anything is written, and a `rejected` array
// that names each refused row BY INDEX with its reason. Nothing in the web app posted to it. Not
// even an orphaned control — `grep bulk apps/web/src/lib/api.ts` returned nothing at all.
//
// THE PART A CLIENT GETS WRONG IS THE INDEX. The server answers about the array it was sent, and
// the array is not what the person typed: blank lines are dropped on the way out, so `index: 2`
// is the third row SENT and almost never the third line they are looking at. A UI that prints the
// server's index as a line number points at an innocent row, and the person edits the wrong one.
//
// AND THE SECOND PART IS THE REFUSAL NOBODY PLANNED FOR. A reason code this build does not know
// must render as itself. Mapping it through a lookup that returns undefined and then rendering
// `{undefined}` puts a row in the rejected list with no reason beside it, which reads as a row
// that was fine — a failure to observe presented as an observation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const { BULK_INVITE_MAX, parseBulkIds, explainRejections, bulkRefusal } = await import('../src/lib/bulk-invite.ts');

/* ------------------------------------------------------------------ parsing --- */

test('one id per line, trimmed, and the blank lines do not become rows', () => {
  const entries = parseBulkIds('  a  \n\n\t\nb\n');
  assert.deepEqual(
    entries.map((e) => e.userId),
    ['a', 'b'],
  );
});

test('THE LINE NUMBER SURVIVES THE BLANK LINES — this is the whole point of the module', () => {
  // `b` is the second row sent and the fourth line typed. The server will answer `index: 1` about
  // it; the person must be shown line 4.
  const entries = parseBulkIds('a\n\n\nb');
  assert.deepEqual(entries, [
    { index: 0, line: 1, userId: 'a' },
    { index: 1, line: 4, userId: 'b' },
  ]);
});

test('the index is the position in the array we POST, contiguous from zero', () => {
  const entries = parseBulkIds('\n\na\n\nb\n\nc');
  assert.deepEqual(
    entries.map((e) => e.index),
    [0, 1, 2],
  );
});

test('a pasted list with CRLF line endings is not one enormous id', () => {
  assert.equal(parseBulkIds('a\r\nb\r\n').length, 2);
});

test('a malformed id is SENT, not silently dropped', () => {
  // The tempting client-side filter — drop anything that is not a UUID — deletes the row the
  // person most needs to see refused. The server answers `bad_user` against its index and this
  // module puts that answer back on their line. Dropping it makes the row disappear with no
  // explanation, which is the same list silently getting shorter.
  const entries = parseBulkIds('not-a-uuid\n00000000-0000-0000-0000-000000000001');
  assert.equal(entries.length, 2);
  assert.equal(entries[0].userId, 'not-a-uuid');
});

test('input that is not a string is no rows rather than a crash', () => {
  assert.deepEqual(parseBulkIds(null), []);
  assert.deepEqual(parseBulkIds(undefined), []);
  assert.deepEqual(parseBulkIds(12), []);
});

/* --------------------------------------------------------------- rejections --- */

const ENTRIES = parseBulkIds('alpha\n\nbravo\ncharlie');

test('a rejection is reported against the LINE THE PERSON TYPED, not the index sent', () => {
  const [problem] = explainRejections([{ index: 1, userId: 'bravo', error: 'bad_user' }], ENTRIES);
  assert.equal(problem.line, 3, 'index 1 is the second row sent and the third line typed');
  assert.equal(problem.userId, 'bravo');
});

test('every reason the route can give has a sentence that says what to fix', () => {
  const REASONS = ['bad_row', 'bad_user', 'unknown_role', 'owner_is_not_a_member', 'duplicate', 'bad_expiry'];
  for (const error of REASONS) {
    const [problem] = explainRejections([{ index: 0, userId: 'alpha', error }], ENTRIES);
    assert.equal(typeof problem.message, 'string');
    assert.ok(problem.message.length > 0, `${error} renders as an empty string`);
    assert.equal(/undefined/.test(problem.message), false, `${error} fell through the lookup`);
  }
});

test('AN UNKNOWN REASON RENDERS AS ITSELF — a row with no reason beside it reads as a row that was fine', () => {
  const [problem] = explainRejections([{ index: 0, userId: 'alpha', error: 'some_future_refusal' }], ENTRIES);
  assert.match(problem.message, /some_future_refusal/);
});

test('a rejection about a row we cannot place is still shown, with no line rather than a wrong one', () => {
  // Out of range, or an index the server made up. Dropping it would be the list quietly getting
  // shorter; guessing a line would point at somebody else's row.
  const [problem] = explainRejections([{ index: 99, userId: 'ghost', error: 'bad_user' }], ENTRIES);
  assert.equal(problem.line, null);
  assert.equal(problem.userId, 'ghost');
});

test('a rejected payload that is not a list is no problems rather than a crash', () => {
  assert.deepEqual(explainRejections(null, ENTRIES), []);
  assert.deepEqual(explainRejections({ index: 0 }, ENTRIES), []);
});

/* ------------------------------------------------------- whole-batch refusal --- */

test('the cap is NAMED when the batch is refused for being too big', () => {
  const msg = bulkRefusal('too_many', 50);
  assert.match(msg, /50/, 'a refusal that does not say the limit cannot be acted on');
});

test('every whole-batch refusal the route can give has a sentence', () => {
  for (const error of ['too_many', 'no_members', 'bad_body', 'invite_failed']) {
    const msg = bulkRefusal(error, 50);
    assert.equal(typeof msg, 'string');
    assert.ok(msg.length > 0, `${error} renders as an empty string`);
  }
});

test('an unrecognised whole-batch refusal is shown rather than swallowed', () => {
  assert.match(bulkRefusal('some_future_refusal'), /some_future_refusal/);
});

test('no error is no message — the absence of a refusal is not a refusal', () => {
  assert.equal(bulkRefusal(undefined), null);
  assert.equal(bulkRefusal(null), null);
});

/* ------------------------------------------------------------- the mirror ----- */

test('THE CAP THIS MODULE SHOWS IS THE CAP THE SERVER ENFORCES', () => {
  // A mirror nobody checks is a second source of truth that drifts. The client warns at fifty so
  // the person is told before they press; if the server moves and this does not, the warning is a
  // lie in one direction and a silent 400 in the other.
  const membership = readFileSync(join(HERE, '../../worker/src/membership.ts'), 'utf8');
  const declared = /export const BULK_INVITE_MAX = (\d+)/.exec(membership);
  assert.ok(declared, 'the worker no longer declares BULK_INVITE_MAX where this test can read it');
  assert.equal(BULK_INVITE_MAX, Number(declared[1]));
});
