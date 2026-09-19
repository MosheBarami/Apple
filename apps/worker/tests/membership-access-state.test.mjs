/**
 * THE POSTGRES STATE IS THE AUTHORITY WHEN THE KV MIRROR IS LATE.
 *
 * A link grant can remain physically live in KV after the atomic removal intent commits. The
 * resolver must deny that grant from membership_access_state, and a role state may narrow a
 * stronger stored grant without ever widening a weaker one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { decideAccess, resolveMembership } from '../src/collab.ts';

const USER = 'user-1';
const OWNER = 'owner-1';
const NOW = Date.parse('2026-09-18T12:00:00.000Z');
const grant = (role = 'editor') => ({ user_id: USER, role, expires_at: null, revoked_at: null, suspended_at: null });
const state = (access, role = 'editor', version = 1, expiresAt = null) => ({
  user_id: USER,
  access,
  role,
  version,
  expires_at: expiresAt,
});

test('removed and suspended state deny a still-live KV grant', () => {
  for (const access of ['removed', 'suspended']) {
    const input = { userId: USER, ownerId: OWNER, grants: [grant()], accessState: state(access), nowMs: NOW };
    assert.equal(resolveMembership(input), null, `${access} cannot leave a membership behind`);
    assert.deepEqual(decideAccess({ ...input, action: 'read' }), {
      allowed: false,
      status: 404,
      role: null,
      reason: 'not_a_member',
    });
  }
});

test('a demotion caps the strongest grant and changes the actions immediately', () => {
  const input = {
    userId: USER,
    ownerId: OWNER,
    grants: [grant('editor')],
    accessState: state('demoted', 'viewer', 4),
    nowMs: NOW,
  };
  assert.equal(resolveMembership(input)?.role, 'viewer');
  assert.equal(decideAccess({ ...input, action: 'read' }).allowed, true);
  const build = decideAccess({ ...input, action: 'build' });
  assert.equal(build.allowed, false);
  assert.equal(build.status, 403);
  assert.equal(build.role, 'viewer');
});

test('the overlay can narrow but cannot promote a weaker stored grant', () => {
  const membership = resolveMembership({
    userId: USER,
    ownerId: OWNER,
    grants: [grant('viewer')],
    accessState: state('clear', 'admin', 8),
    nowMs: NOW,
  });
  assert.equal(membership?.role, 'viewer', 'state is not a second grant and cannot create capabilities');
});

test('the state expiry closes or narrows a still-live underlying grant without widening it', () => {
  const soon = new Date(NOW + 10_000).toISOString();
  const later = new Date(NOW + 60_000).toISOString();
  const alreadyExpired = new Date(NOW - 1).toISOString();

  assert.equal(resolveMembership({
    userId: USER,
    ownerId: OWNER,
    grants: [{ ...grant(), expires_at: later }],
    accessState: state('clear', 'editor', 2, alreadyExpired),
    nowMs: NOW,
  }), null, 'an expired authoritative state denies a stale live KV mirror');

  const shortened = resolveMembership({
    userId: USER,
    ownerId: OWNER,
    grants: [{ ...grant(), expires_at: later }],
    accessState: state('clear', 'editor', 3, soon),
    nowMs: NOW,
  });
  assert.equal(shortened?.expiresAtMs, Date.parse(soon));

  const cannotWiden = resolveMembership({
    userId: USER,
    ownerId: OWNER,
    grants: [{ ...grant(), expires_at: soon }],
    accessState: state('clear', 'editor', 4, later),
    nowMs: NOW,
  });
  assert.equal(cannotWiden?.expiresAtMs, Date.parse(soon), 'state alone is not a grant extension');

  const extendedTogether = resolveMembership({
    userId: USER,
    ownerId: OWNER,
    grants: [{ ...grant(), expires_at: later }],
    accessState: state('clear', 'editor', 5, later),
    nowMs: NOW,
  });
  assert.equal(extendedTogether?.expiresAtMs, Date.parse(later));
});

test('no state preserves pre-event behavior, while present malformed state fails closed', () => {
  assert.equal(resolveMembership({ userId: USER, ownerId: OWNER, grants: [grant()], nowMs: NOW })?.role, 'editor');
  for (const bad of [
    {},
    { user_id: USER, version: 0, role: 'editor', access: 'clear' },
    { user_id: 'someone-else', version: 1, role: 'editor', access: 'clear' },
    { user_id: USER, version: 1, role: 'owner', access: 'clear' },
    { user_id: USER, version: 1, role: 'editor', access: 'unknown' },
  ]) {
    assert.equal(
      resolveMembership({ userId: USER, ownerId: OWNER, grants: [grant()], accessState: bad, nowMs: NOW }),
      null,
      `malformed state ${JSON.stringify(bad)} must not be treated as absent`,
    );
  }
});

test('membership state cannot move ownership, even if a corrupt row names the owner', () => {
  const membership = resolveMembership({
    userId: OWNER,
    ownerId: OWNER,
    grants: [],
    accessState: { user_id: OWNER, version: 1, role: null, access: 'removed' },
    nowMs: NOW,
  });
  assert.equal(membership?.role, 'owner');
  assert.equal(membership?.via, 'owner');
});
