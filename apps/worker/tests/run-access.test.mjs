/**
 * A MEMBERSHIP REVOKED MID-RUN, AND THE RUN THAT KEPT GOING.
 *
 * Every access check in this product happens on the way in. The agent loop is alarm-driven and
 * outlives the request that authorised it by minutes, so "you may build here" was decided once,
 * at the start, and never asked again. Removing a member stopped them from starting a NEW run and
 * did nothing at all about the one they had going — which spends the owner's Credits and mutates
 * the owner's place on their behalf.
 *
 * These tests drive the decision with the inputs that must NOT stop a run as hard as the ones that
 * must, because a fence that stops everything is not a fence, it is an outage:
 *
 *   - the OWNER's run, which no membership event can touch
 *   - a run whose initiator is unrecorded — "I cannot tell who started this" must never render as
 *     "the person who started this was removed" (F-58, pointed at the destructive direction)
 *   - a mark about somebody ELSE, which is not about this run
 *
 * Run with:  node --test tests/run-access.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACCESS_CHANGE_VERSION_KEY,
  ACCESS_REVOKED_KEY,
  REVOCATION_REASONS,
  acceptAccessChangeVersion,
  markAccessRevoked,
  accessRevokedFor,
  canonicalGrantExpiry,
  clearAccessRevoked,
  currentAccessExpiry,
  runMustStop,
} from '../src/run-access.ts';

const OWNER = 'owner-1';
const MEMBER = 'member-1';
const OTHER = 'member-2';
const NOW = Date.parse('2026-09-15T12:00:00.000Z');

/** A Map with the Durable Object storage shape, recording which keys were written. */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  const writes = [];
  return {
    map,
    writes,
    async get(key) {
      return map.get(key);
    },
    async put(key, value) {
      writes.push(key);
      map.set(key, value);
      return undefined;
    },
    async delete(key) {
      return map.delete(key);
    },
  };
}

const run = (over = {}) => ({ initiatedBy: MEMBER, ownerId: OWNER, ...over });
const mark = (over = {}) => ({ userId: MEMBER, reason: 'removed', at: NOW - 1000, ...over });

// ============================================================ the storage

test('a mark is written under its OWN key, never into the run blob', () => {
  // The whole reason this is not a field on AgentState: the run holds its own copy of that blob
  // for the length of a step and writes it back at the tail. See stop-signal.ts.
  const s = fakeStorage();
  return markAccessRevoked(s, mark()).then(() => {
    assert.deepEqual(s.writes, [ACCESS_REVOKED_KEY]);
    assert.equal(s.map.has('agent'), false, 'the agent blob must not be touched by a revocation');
  });
});

test('two members removed in a minute are both remembered', async () => {
  const s = fakeStorage();
  await markAccessRevoked(s, mark({ userId: MEMBER }));
  await markAccessRevoked(s, mark({ userId: OTHER, reason: 'suspended' }));
  assert.equal((await accessRevokedFor(s, MEMBER)).reason, 'removed');
  assert.equal((await accessRevokedFor(s, OTHER)).reason, 'suspended', 'the second must not erase the first');
});

test('a mark that cannot be read back is not written, and a corrupt table is not trusted', async () => {
  const s = fakeStorage();
  for (const bad of [
    null,
    {},
    { userId: '', reason: 'removed', at: NOW },
    { userId: MEMBER, reason: 'deported', at: NOW },
    { userId: MEMBER, reason: 'removed', at: 'yesterday' },
    { userId: MEMBER, reason: 'removed', at: NaN },
  ]) {
    assert.equal(await markAccessRevoked(s, bad), false, `${JSON.stringify(bad)} must not be stored`);
  }
  assert.deepEqual(s.writes, [], 'nothing unreadable reached storage');

  // A table written by something else, or by an older shape.
  const corrupt = fakeStorage({
    [ACCESS_REVOKED_KEY]: {
      [MEMBER]: { userId: MEMBER, reason: 'nonsense', at: NOW },
      // A row filed under one id that names another: it cannot be matched to a run safely.
      [OTHER]: { userId: MEMBER, reason: 'removed', at: NOW },
    },
  });
  assert.equal(await accessRevokedFor(corrupt, MEMBER), null, 'an unreadable reason is not a revocation');
  assert.equal(await accessRevokedFor(corrupt, OTHER), null, 'a row filed under the wrong id is not trusted');
  const garbled = fakeStorage({ [ACCESS_REVOKED_KEY]: 'not an object' });
  assert.equal(await accessRevokedFor(garbled, MEMBER), null);
});

test('reinstatement lifts the mark, and lifting a mark that is not there says so', async () => {
  const s = fakeStorage();
  await markAccessRevoked(s, mark());
  assert.equal(await clearAccessRevoked(s, MEMBER), true);
  assert.equal(await accessRevokedFor(s, MEMBER), null);
  assert.equal(await clearAccessRevoked(s, MEMBER), false, 'a second lift changes nothing and reports nothing');
  assert.equal(await clearAccessRevoked(s, ''), false);
});

test('access-change versions carry the current expiry and reject stale or conflicting equality', async () => {
  const s = fakeStorage();
  const firstExpiry = new Date(NOW + 60_000).toISOString();
  const laterExpiry = new Date(NOW + 120_000).toISOString();

  const first = await acceptAccessChangeVersion(s, MEMBER, 1, firstExpiry, 'clear:editor');
  assert.deepEqual(
    { accepted: first.accepted, reason: first.reason, expiresAt: first.expiresAt },
    { accepted: true, reason: 'new', expiresAt: firstExpiry },
  );
  assert.deepEqual(await currentAccessExpiry(s, MEMBER), {
    status: 'known',
    version: 1,
    expiresAt: firstExpiry,
  });
  assert.equal(s.writes.at(-1), ACCESS_CHANGE_VERSION_KEY);

  const same = await acceptAccessChangeVersion(s, MEMBER, 1, firstExpiry, 'clear:editor');
  assert.equal(same.accepted, true);
  assert.equal(same.reason, 'duplicate');

  const differentExpiry = await acceptAccessChangeVersion(s, MEMBER, 1, laterExpiry, 'clear:editor');
  assert.equal(differentExpiry.accepted, false);
  assert.equal(differentExpiry.reason, 'conflict');
  const differentEvent = await acceptAccessChangeVersion(s, MEMBER, 1, firstExpiry, 'removed:none');
  assert.equal(differentEvent.accepted, false, 'one sequence cannot be replayed as a different lifecycle event');
  assert.equal(differentEvent.reason, 'conflict');

  const next = await acceptAccessChangeVersion(s, MEMBER, 2, laterExpiry, 'clear:editor');
  assert.equal(next.accepted, true);
  assert.equal(next.reason, 'new');
  const stale = await acceptAccessChangeVersion(s, MEMBER, 1, firstExpiry, 'clear:editor');
  assert.equal(stale.accepted, false);
  assert.equal(stale.reason, 'stale');
  assert.equal((await currentAccessExpiry(s, MEMBER)).expiresAt, laterExpiry);
});

test('versioned events require an explicit readable expiry and event fingerprint', async () => {
  const s = fakeStorage();
  for (const [expiry, event] of [
    [undefined, 'clear:editor'],
    ['not-a-date', 'clear:editor'],
    [new Date(NOW).toISOString(), ''],
    [new Date(NOW).toISOString(), undefined],
  ]) {
    const verdict = await acceptAccessChangeVersion(s, MEMBER, 1, expiry, event);
    assert.equal(verdict.accepted, false);
    assert.equal(verdict.reason, 'invalid');
  }
  assert.equal(await canonicalGrantExpiry(null), null);
  assert.equal(canonicalGrantExpiry(NOW), new Date(NOW).toISOString());
  assert.equal(canonicalGrantExpiry('not-a-date'), undefined);
});

test('the numeric rollout cursor is readable and an equal full event upgrades it', async () => {
  const expiry = new Date(NOW + 60_000).toISOString();
  const s = fakeStorage({ [ACCESS_CHANGE_VERSION_KEY]: { [MEMBER]: 4 } });
  assert.deepEqual(await currentAccessExpiry(s, MEMBER), {
    status: 'legacy',
    version: 4,
    expiresAt: undefined,
  });
  const upgraded = await acceptAccessChangeVersion(s, MEMBER, 4, expiry, 'clear:editor');
  assert.equal(upgraded.accepted, true);
  assert.equal(upgraded.reason, 'duplicate');
  assert.deepEqual(await currentAccessExpiry(s, MEMBER), {
    status: 'known',
    version: 4,
    expiresAt: expiry,
  });
});

// ============================================================ the decision

test('A REVOKED MEMBER STOPS THE RUN THEY STARTED', () => {
  const v = runMustStop(run(), mark(), NOW);
  assert.equal(v.stop, true);
  assert.equal(v.why, 'membership_revoked');
  assert.match(v.message, /removed from the project/i, 'the person watching is told why their build stopped');
});

test('a SUSPENSION stops it too, and says something different', () => {
  const v = runMustStop(run(), mark({ reason: 'suspended' }), NOW);
  assert.equal(v.stop, true);
  assert.equal(v.why, 'membership_suspended');
  assert.notEqual(
    v.message,
    runMustStop(run(), mark({ reason: 'removed' }), NOW).message,
    'a paused member and a removed one must not read identically',
  );
  // Every reason the storage can hold produces a stop, or a reason exists that nothing acts on.
  for (const reason of REVOCATION_REASONS) {
    assert.equal(runMustStop(run(), mark({ reason }), NOW).stop, true, `${reason} must stop the run`);
  }
});

test('a DEMOTION stops the run, and says build access was lost', () => {
  const v = runMustStop(run(), mark({ reason: 'demoted' }), NOW);
  assert.equal(v.stop, true);
  assert.equal(v.why, 'membership_demoted');
  assert.match(v.message, /build access/i);
});

test('THE OWNER IS NEVER STOPPED, even by a mark naming them', () => {
  // Ownership is the projects.owner_id column; no membership write can move it, so no membership
  // event may halt the owner's own build. Without this, a stray mark would take the project down.
  const v = runMustStop(run({ initiatedBy: OWNER }), mark({ userId: OWNER }), NOW);
  assert.equal(v.stop, false);
  assert.equal(v.why, 'owner');
});

test('A RUN WITH NO RECORDED INITIATOR IS NOT STOPPED — not knowing is not evidence', () => {
  // A run persisted by an earlier deploy has no initiator. Stopping it would be a guess dressed as
  // an enforcement, and the guess kills a build somebody is watching.
  for (const missing of [undefined, null, '', '   ', 7, {}]) {
    const v = runMustStop(run({ initiatedBy: missing }), mark(), NOW);
    assert.equal(v.stop, false, `initiatedBy ${JSON.stringify(missing)} must not stop the run`);
    assert.equal(v.why, 'unknown_initiator');
  }
});

test('a mark about SOMEBODY ELSE does not stop this run', () => {
  const v = runMustStop(run({ initiatedBy: MEMBER }), mark({ userId: OTHER }), NOW);
  assert.equal(v.stop, false);
  assert.equal(v.why, 'not_this_run');
});

test('with no mark at all, the run continues — the control for every stop above', () => {
  const v = runMustStop(run(), null, NOW);
  assert.equal(v.stop, false);
  assert.equal(v.why, 'ok');
  assert.equal(v.message, '');
});

// ============================================================ the expiry nobody pushes

test('a grant that simply RAN OUT stops the run, at the boundary and not a tick later', () => {
  const at = new Date(NOW).toISOString();
  assert.equal(runMustStop(run({ initiatorExpiresAt: at }), null, NOW).stop, true, 'expiring now is expired now');
  assert.equal(runMustStop(run({ initiatorExpiresAt: at }), null, NOW - 1).stop, false);
  assert.equal(runMustStop(run({ initiatorExpiresAt: at }), null, NOW + 1).why, 'grant_expired');
  assert.equal(runMustStop(run({ initiatorExpiresAt: NOW - 1 }), null, NOW).stop, true, 'epoch ms works too');
  assert.equal(runMustStop(run({ initiatorExpiresAt: NOW + 60_000 }), null, NOW).stop, false, 'a live grant keeps building');
});

test('an expiry that cannot be read is DEAD, not eternal', () => {
  // The same direction classifyGrant fails in. The alternative is a corrupt value buying an
  // unbounded run on somebody else's Credits.
  for (const bad of ['whenever', 'soon', NaN, Infinity, {}, [], true]) {
    const v = runMustStop(run({ initiatorExpiresAt: bad }), null, NOW);
    assert.equal(v.stop, true, `expiry ${JSON.stringify(String(bad))} must not be treated as no expiry`);
    assert.equal(v.why, 'grant_expired');
  }
  // …and an absent expiry is genuinely "no expiry", which is the control.
  for (const none of [undefined, null, '']) {
    assert.equal(runMustStop(run({ initiatorExpiresAt: none }), null, NOW).stop, false);
  }
});

test('A CLOCK THAT CANNOT BE READ REPORTS ITSELF rather than deciding an expiry', () => {
  for (const clock of [NaN, Infinity, -Infinity]) {
    const v = runMustStop(run({ initiatorExpiresAt: new Date(NOW - 1).toISOString() }), null, clock);
    assert.equal(v.expiryEvaluated, false, '"could not evaluate" must never be reported as "has not expired"');
    assert.equal(v.stop, false, 'and it must not destroy a paid, in-flight run on the strength of a broken clock');
    // A REVOCATION still bites, because it needs no clock to be true.
    const revoked = runMustStop(run(), mark(), clock);
    assert.equal(revoked.stop, true, 'a removal is a fact, not a calculation');
    assert.equal(revoked.expiryEvaluated, false);
  }
});
