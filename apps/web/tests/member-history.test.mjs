// The membership history, and the warning that goes with a change nobody wrote down.
//
// `membership_events` is append-only, has no update and no delete policy, and its CHECK constraint
// matches the worker's vocabulary exactly. `buildMembershipEvent` refuses a partial row rather than
// writing an uninterpretable one, and `inviteEventKind` names the event from what CHANGED — so a
// demotion is logged as `role_changed`, not as `invited`. GET /api/shared/:id/members/events serves
// it, merged with the link acceptances that live on the KV grant. All of it was unreachable: the
// web app had no function for that route and no view of the answer.
//
// TWO PROPERTIES THIS MODULE HAS TO HOLD, and both of them are the same rule from opposite ends:
//
//   EVERY ROUTE THAT CHANGES A MEMBERSHIP RETURNS `audited`, because the change has already
//   happened by the time the append runs and a failed append must neither undo it nor be
//   swallowed. A client that reads `ok: true` and drops `audited: false` has turned "we did this
//   and did not record it" into "we did this" — the claim surviving while the fact does not.
//
//   AN EVENT KIND THIS BUILD DOES NOT KNOW IS STILL AN EVENT. A newer worker can write a kind this
//   bundle has never heard of; running it through a lookup that returns undefined puts a blank row
//   in somebody's audit trail. The raw kind is shown instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const { unauditedNote, MEMBER_REASON_MAX } = await import('../src/lib/member-history.ts');

test('a change the server could not record says so, out loud', () => {
  const note = unauditedNote({ ok: true, audited: false });
  assert.equal(typeof note, 'string');
  assert.ok(note.length > 0);
});

test('a recorded change adds no noise', () => {
  assert.equal(unauditedNote({ ok: true, audited: true }), null);
});

test('AN OLDER WORKER THAT SENDS NO `audited` IS NOT AN UNRECORDED CHANGE', () => {
  // The dangerous reading is the other one. `!res.audited` is true for a field that is simply
  // absent, and warning on every success from a deployment that predates the flag trains people to
  // ignore the warning — which is exactly when it stops working as one.
  assert.equal(unauditedNote({ ok: true }), null);
  assert.equal(unauditedNote({}), null);
  assert.equal(unauditedNote(null), null);
});

test('only a literal false is an unrecorded change', () => {
  // A truthy-but-not-true value is not a yes, and a falsy-but-not-false value is not a no.
  assert.equal(unauditedNote({ audited: 0 }), null);
  assert.equal(unauditedNote({ audited: 'false' }), null);
  assert.equal(typeof unauditedNote({ audited: false }), 'string');
});

test('THE ROUTES THAT PROMISE `audited` STILL PROMISE IT', () => {
  // This note is worth showing only because every membership mutation answers the flag. If the
  // worker stops returning it, the warning silently becomes unreachable and nothing else would
  // notice — a guard that cannot see the thing it guards.
  const worker = readFileSync(join(HERE, '../../worker/src/index.ts'), 'utf8');
  const audited = worker.match(/audited: audit\.ok/g) ?? [];
  assert.ok(audited.length >= 4, `only ${audited.length} membership routes return audited`);
});

test('THE REASON BOX CANNOT ASK FOR MORE THAN THE COLUMN HOLDS', () => {
  // The route truncates at EVENT_REASON_MAX and the column has a CHECK at the same number. An
  // input that accepts more silently loses the end of what somebody wrote — the half of a reason
  // that says what to do about it.
  const membership = readFileSync(join(HERE, '../../worker/src/membership.ts'), 'utf8');
  const declared = /export const EVENT_REASON_MAX = (\d+)/.exec(membership);
  assert.ok(declared, 'the worker no longer declares EVENT_REASON_MAX where this test can read it');
  assert.equal(MEMBER_REASON_MAX, Number(declared[1]));
});

/* ------------------------------------------------------------- reading an event --- */

const { describeEvent, historyGap } = await import('../src/lib/member-history.ts');

const EV = (over = {}) => ({
  kind: 'invited',
  subjectId: 'u1',
  actorId: 'admin',
  fromRole: null,
  toRole: 'editor',
  reason: null,
  at: '2026-09-01T10:00:00.000Z',
  source: 'history',
  ...over,
});

test('a role change names BOTH roles — that is the whole content of the event', () => {
  const line = describeEvent(EV({ kind: 'role_changed', fromRole: 'viewer', toRole: 'admin' }));
  assert.match(line.text, /Viewer/);
  assert.match(line.text, /Admin/);
});

test('`renewed` is not a no-op and does not read as one', () => {
  // Re-inviting somebody at the role they already hold extends or replaces the grant. An audit
  // reader needs to know somebody did that; `inviteEventKind` names it from what changed, so this
  // kind only ever arrives when it is true.
  const line = describeEvent(EV({ kind: 'renewed', fromRole: 'editor', toRole: 'editor' }));
  assert.ok(line.text.length > 0);
  assert.equal(/undefined|\[object/.test(line.text), false);
});

test('AN ACCEPTANCE IS SHOWN AND THE SECRET IS NOT INVENTED', () => {
  // The route merges link acceptances in from the KV grant and deliberately never echoes the
  // token: knowing somebody came in through a link is the audit fact; the token is not, and a
  // history view is a place people paste from.
  const line = describeEvent(EV({ kind: 'link_accepted', fromRole: null, toRole: 'viewer', source: 'grant' }));
  assert.match(line.text, /link/i);
  assert.equal(/token/i.test(line.text), false, 'the sentence talks about a token it was never given');
});

test('a suspension carries its reason, separately, so it can be quoted rather than glued on', () => {
  const line = describeEvent(EV({ kind: 'suspended', toRole: null, reason: 'Left the team' }));
  assert.equal(line.reason, 'Left the team');
});

test('AN EVENT KIND THIS BUILD DOES NOT KNOW IS STILL AN EVENT', () => {
  // A newer worker can write a kind this bundle has never heard of. Through a lookup that returns
  // undefined it becomes a blank row in somebody's audit trail — a gap that looks like nothing
  // happening rather than like something unread.
  const line = describeEvent(EV({ kind: 'reassigned' }));
  assert.match(line.text, /reassigned/);
});

test('a row with no timestamp says so rather than rendering an invalid date', () => {
  const line = describeEvent(EV({ at: null }));
  assert.equal(line.at, null);
  assert.equal(/Invalid|NaN/.test(line.text), false);
});

test('a role string this build does not know is printed, not dropped', () => {
  // An event rendered with no role at all reads as an event about no access.
  const line = describeEvent(EV({ kind: 'role_changed', fromRole: 'editor', toRole: 'archivist' }));
  assert.match(line.text, /archivist/);
});

test('an unreadable row is a row we could not read, not an empty one', () => {
  for (const bad of [null, 'nope', 7]) {
    const line = describeEvent(bad);
    assert.ok(line.text.length > 0, `describeEvent(${JSON.stringify(bad)}) rendered as nothing at all`);
  }
});

/* ------------------------------------------------------------ a hole in the list --- */

test('A HISTORY WITH A SILENT HOLE IN IT IS THE FAILURE THE ROUTE AVOIDS', () => {
  // The route answers `partial: true, incomplete: ['link_grants']` when the KV side could not be
  // read in full, rather than serving a short list as a whole one. A client that drops the flag
  // undoes exactly the care the route took.
  const gap = historyGap({ events: [], partial: true, incomplete: ['link_grants'] });
  assert.equal(typeof gap, 'string');
  assert.ok(gap.length > 0);
});

test('a complete history adds no warning', () => {
  assert.equal(historyGap({ events: [], partial: false }), null);
  assert.equal(historyGap({ events: [] }), null);
});
