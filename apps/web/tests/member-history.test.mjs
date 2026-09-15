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
const { unauditedNote } = await import('../src/lib/member-history.ts');

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
