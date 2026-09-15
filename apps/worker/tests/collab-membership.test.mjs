/**
 * MEMBERSHIP, AND THE REFUSALS IT IS MADE OF.
 *
 * The discipline this file is written under: a guard that only walks the healthy path exercises
 * nothing. Every rule below is stated as "reject X", so every test feeds an actual X and watches
 * it get rejected. The violating inputs are constructed HERE — a corrupt row, a role string
 * nobody defined, an expiry that does not parse, a clock that is NaN — rather than hoped for from
 * the tree, because the tree will never produce them on demand.
 *
 * Run with:  node --test tests/collab-membership.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COLLAB_ROLES,
  COLLAB_ACTIONS,
  GRANTABLE_ROLES,
  asCollabRole,
  asCollabAction,
  can,
  capabilitiesFor,
  roleRank,
  classifyGrant,
  resolveMembership,
  decideAccess,
  redeemShareLink,
  SHARE_LINK_MAX_RANK,
} from '../src/collab.ts';

const OWNER = 'u-owner';
const MEMBER = 'u-member';
const STRANGER = 'u-stranger';
const NOW = Date.parse('2026-09-15T12:00:00.000Z');
const grant = (over = {}) => ({ user_id: MEMBER, role: 'editor', ...over });

// ---------------------------------------------------------------------------------------------
// The allowlists
// ---------------------------------------------------------------------------------------------

test('a role nobody defined is refused, not defaulted and not downgraded', () => {
  // The exact shape router.ts's default branch had: an unrecognised value once took the MOST
  // permissive answer available. Feed it real hostile values.
  for (const hostile of ['Owner', 'OWNER', 'superuser', 'admin ', '', ' ', 'proto', '__proto__', 'constructor']) {
    assert.equal(asCollabRole(hostile), null, `${JSON.stringify(hostile)} must not resolve to a role`);
    assert.equal(can(hostile, 'read'), false, `${JSON.stringify(hostile)} must not be able to read`);
    assert.deepEqual(capabilitiesFor(hostile), [], `${JSON.stringify(hostile)} must hold no capabilities`);
  }
  for (const hostile of [null, undefined, 0, 1, {}, [], { role: 'owner' }, true]) {
    assert.equal(asCollabRole(hostile), null);
    assert.equal(can(hostile, 'read'), false);
  }
  // roleRank must not hand a corrupt value a number that could win a max().
  assert.ok(roleRank('superuser') < roleRank('viewer'), 'an unknown role must rank below the weakest real one');
});

test('an action nobody defined is refused for every role, including the owner', () => {
  for (const role of COLLAB_ROLES) {
    for (const hostile of ['purge', 'READ', 'read ', '', null, undefined, 42, {}]) {
      assert.equal(can(role, hostile), false, `${role} must not be able to ${JSON.stringify(hostile)}`);
    }
  }
});

test('the capability ladder is a ladder: every role can do strictly more than the one below it', () => {
  // The claim is the RELATIONSHIP, not the literals. "admin has 9 actions" would survive a table
  // where admin lost `approve` and gained something else.
  const order = ['viewer', 'commenter', 'editor', 'admin', 'owner'];
  for (let i = 1; i < order.length; i += 1) {
    const lower = new Set(capabilitiesFor(order[i - 1]));
    const upper = new Set(capabilitiesFor(order[i]));
    for (const a of lower) assert.ok(upper.has(a), `${order[i]} must keep ${a}, which ${order[i - 1]} has`);
    assert.ok(upper.size > lower.size, `${order[i]} must be able to do more than ${order[i - 1]}`);
    assert.ok(roleRank(order[i]) > roleRank(order[i - 1]), 'rank must agree with the capability ladder');
  }
  // Every declared action must be reachable by somebody, or it is a string nothing enforces.
  const reachable = new Set(capabilitiesFor('owner'));
  for (const a of COLLAB_ACTIONS) assert.ok(reachable.has(a), `${a} is declared but no role can perform it`);
});

test('spending the owner Sparks stops at editor, and restoring stops at admin', () => {
  assert.equal(can('commenter', 'chat'), false, 'an invitation to comment is not an invitation to spend');
  assert.equal(can('commenter', 'build'), false);
  assert.equal(can('editor', 'chat'), true);
  assert.equal(can('editor', 'restore_version'), false, 'an editor must not discard other people work');
  assert.equal(can('admin', 'restore_version'), true);
  assert.equal(can('admin', 'delete_project'), false, 'only the owner may delete the project');
  assert.equal(can('owner', 'delete_project'), true);
});

// ---------------------------------------------------------------------------------------------
// Grant rows
// ---------------------------------------------------------------------------------------------

test('a membership row claiming owner is malformed, not an owner', () => {
  // The escalation this closes: whoever can insert a row could otherwise take the project.
  const { status, grant: g } = classifyGrant(grant({ role: 'owner' }), NOW);
  assert.equal(status, 'malformed');
  assert.equal(g, null);
  assert.ok(!GRANTABLE_ROLES.includes('owner'), 'owner must never be in the grantable set');

  const m = resolveMembership({ userId: MEMBER, ownerId: OWNER, grants: [grant({ role: 'owner' })], nowMs: NOW });
  assert.equal(m, null, 'a row claiming owner must confer nothing at all');
});

test('a revoked grant is over, even while its expiry is still in the future', () => {
  const row = grant({ revoked_at: '2026-09-01T00:00:00.000Z', expires_at: '2099-01-01T00:00:00.000Z' });
  assert.equal(classifyGrant(row, NOW).status, 'revoked');
  assert.equal(resolveMembership({ userId: MEMBER, ownerId: OWNER, grants: [row], nowMs: NOW }), null);
});

test('an expiry that is present but unparseable makes the grant dead, not eternal', () => {
  // `expires_at ?? Infinity` defends null and undefined only. These are the values that get past it.
  for (const bad of ['whenever', 'soon', '', 'not-a-date', NaN, Infinity, -Infinity, {}, [], true]) {
    const row = grant({ expires_at: bad });
    assert.equal(classifyGrant(row, NOW).status, 'malformed', `expires_at ${JSON.stringify(String(bad))} must not be treated as no expiry`);
    assert.equal(
      resolveMembership({ userId: MEMBER, ownerId: OWNER, grants: [row], nowMs: NOW }),
      null,
      'a grant with an unreadable expiry must not open the project',
    );
  }
  // And an absent expiry still means "never expires", or the rule has eaten the healthy path.
  assert.equal(classifyGrant(grant(), NOW).status, 'active');
  assert.equal(classifyGrant(grant({ expires_at: null }), NOW).status, 'active');
});

test('an expired grant is expired at the boundary, not one tick later', () => {
  const at = '2026-09-15T12:00:00.000Z';
  assert.equal(Date.parse(at), NOW, 'fixture sanity: the expiry is exactly now');
  assert.equal(classifyGrant(grant({ expires_at: at }), NOW).status, 'expired', 'expiring now is expired now');
  assert.equal(classifyGrant(grant({ expires_at: at }), NOW - 1).status, 'active');
  assert.equal(classifyGrant(grant({ expires_at: at }), NOW + 1).status, 'expired');
});

test('a clock that is not a finite number refuses everything', () => {
  // "Cannot evaluate the expiry" must never render as "the expiry has not passed".
  for (const clock of [NaN, Infinity, -Infinity]) {
    assert.equal(classifyGrant(grant(), clock).status, 'malformed');
    assert.equal(resolveMembership({ userId: MEMBER, ownerId: OWNER, grants: [grant()], nowMs: clock }), null);
    // Not even the owner, because a broken clock is a broken process.
    assert.equal(resolveMembership({ userId: OWNER, ownerId: OWNER, grants: [], nowMs: clock }), null);
  }
});

test('a grant about someone else is not a grant to you', () => {
  const rows = [grant({ user_id: 'u-somebody-else', role: 'admin' })];
  assert.equal(resolveMembership({ userId: MEMBER, ownerId: OWNER, grants: rows, nowMs: NOW }), null);
});

test('two valid grants resolve to the stronger one, and a dead row never wins', () => {
  const rows = [
    grant({ role: 'viewer' }),
    grant({ role: 'admin', expires_at: '2026-09-14T00:00:00.000Z' }), // expired yesterday
    grant({ role: 'commenter' }),
  ];
  const m = resolveMembership({ userId: MEMBER, ownerId: OWNER, grants: rows, nowMs: NOW });
  assert.equal(m.role, 'commenter', 'the strongest LIVE grant wins');
  assert.ok(roleRank(m.role) > roleRank('viewer'));
  assert.ok(roleRank(m.role) < roleRank('admin'), 'an expired admin grant must not out-rank a live one');
});

test('a missing user id never authenticates as a missing owner id', () => {
  // Two empty strings are equal, and `ownerId === userId` is how a broken row becomes an owner.
  for (const blank of ['', '   ', null, undefined]) {
    assert.equal(resolveMembership({ userId: blank, ownerId: blank, grants: [], nowMs: NOW }), null);
    assert.equal(resolveMembership({ userId: blank, ownerId: OWNER, grants: [], nowMs: NOW }), null);
    assert.equal(resolveMembership({ userId: OWNER, ownerId: blank, grants: [], nowMs: NOW }), null);
  }
});

test('rows that are not objects are refused rather than thrown over', () => {
  for (const junk of [null, undefined, 'editor', 7, [], true]) {
    assert.equal(classifyGrant(junk, NOW).status, 'malformed');
  }
  assert.equal(resolveMembership({ userId: MEMBER, ownerId: OWNER, grants: [null, 'editor', 7], nowMs: NOW }), null);
});

// ---------------------------------------------------------------------------------------------
// The route-level decision
// ---------------------------------------------------------------------------------------------

test('a NON-MEMBER asking as a non-member is refused, with 404 and no role leaked', () => {
  // The heart of the cluster. The question is asked AS THE STRANGER, not asserted about them.
  for (const action of COLLAB_ACTIONS) {
    const d = decideAccess({ userId: STRANGER, ownerId: OWNER, grants: [grant()], nowMs: NOW, action });
    assert.equal(d.allowed, false, `a stranger must not be allowed to ${action}`);
    assert.equal(d.status, 404, 'a stranger must not learn the project exists');
    assert.equal(d.role, null, 'no role may be reported to a stranger');
    assert.equal(d.reason, 'not_a_member');
  }
});

test('a member who lacks the capability gets 403, not 404', () => {
  const rows = [grant({ role: 'viewer' })];
  const read = decideAccess({ userId: MEMBER, ownerId: OWNER, grants: rows, nowMs: NOW, action: 'read' });
  assert.equal(read.allowed, true);
  assert.equal(read.role, 'viewer');

  const build = decideAccess({ userId: MEMBER, ownerId: OWNER, grants: rows, nowMs: NOW, action: 'build' });
  assert.equal(build.allowed, false);
  assert.equal(build.status, 403, 'a member already knows the project exists');
  assert.equal(build.reason, 'insufficient_role');
  assert.equal(build.role, 'viewer', 'and must be told which role they are asking with');
});

test('an unknown action is refused even for the owner', () => {
  const d = decideAccess({ userId: OWNER, ownerId: OWNER, grants: [], nowMs: NOW, action: 'exfiltrate' });
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'unknown_action');
  assert.equal(d.status, 403);
});

test('the owner needs no grant row at all', () => {
  const d = decideAccess({ userId: OWNER, ownerId: OWNER, grants: [], nowMs: NOW, action: 'delete_project' });
  assert.equal(d.allowed, true);
  assert.equal(d.role, 'owner');
});

// ---------------------------------------------------------------------------------------------
// Share links
// ---------------------------------------------------------------------------------------------

const link = (over = {}) => ({
  token: 'tok-abcdef',
  project_id: 'p-1',
  scope: 'project',
  resource_id: null,
  role: 'viewer',
  ...over,
});

test('a share link may never carry admin or owner, however the row is written', () => {
  for (const role of ['admin', 'owner']) {
    const out = redeemShareLink(link({ role }), { projectId: 'p-1', scope: 'project' }, NOW);
    assert.equal(out.ok, false, `a link must not confer ${role}`);
    assert.equal(out.reason, 'role_too_strong');
  }
  assert.ok(SHARE_LINK_MAX_RANK < roleRank('admin'), 'the ceiling must sit below admin');
  assert.equal(redeemShareLink(link({ role: 'editor' }), { projectId: 'p-1', scope: 'project' }, NOW).ok, true);
});

test('a chat link presented at a build is refused, not upgraded', () => {
  const chat = link({ scope: 'chat', resource_id: 'c-9', role: 'commenter' });
  assert.equal(redeemShareLink(chat, { projectId: 'p-1', scope: 'chat', resourceId: 'c-9' }, NOW).ok, true);

  const wrongScope = redeemShareLink(chat, { projectId: 'p-1', scope: 'build', resourceId: 'c-9' }, NOW);
  assert.equal(wrongScope.ok, false);
  assert.equal(wrongScope.reason, 'wrong_scope');

  const wrongResource = redeemShareLink(chat, { projectId: 'p-1', scope: 'chat', resourceId: 'c-10' }, NOW);
  assert.equal(wrongResource.ok, false);
  assert.equal(wrongResource.reason, 'wrong_resource');

  const wrongProject = redeemShareLink(chat, { projectId: 'p-2', scope: 'chat', resourceId: 'c-9' }, NOW);
  assert.equal(wrongProject.ok, false);
  assert.equal(wrongProject.reason, 'wrong_project');
});

test('a scoped link with no resource is malformed, because it would open everything', () => {
  const out = redeemShareLink(link({ scope: 'build', resource_id: null }), { projectId: 'p-1', scope: 'build', resourceId: 'b-1' }, NOW);
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'malformed');
});

test('a revoked or expired link is dead, and an unreadable expiry is dead too', () => {
  assert.equal(redeemShareLink(link({ revoked_at: '2026-01-01T00:00:00Z' }), { projectId: 'p-1', scope: 'project' }, NOW).reason, 'revoked');
  assert.equal(redeemShareLink(link({ expires_at: '2026-09-14T00:00:00Z' }), { projectId: 'p-1', scope: 'project' }, NOW).reason, 'expired');
  for (const bad of ['forever', NaN, {}, '']) {
    assert.equal(
      redeemShareLink(link({ expires_at: bad }), { projectId: 'p-1', scope: 'project' }, NOW).reason,
      'malformed',
      'an unreadable expiry must close the link, not open it forever',
    );
  }
});

test('a link redeemed against a NaN clock is refused', () => {
  const out = redeemShareLink(link({ expires_at: '2099-01-01T00:00:00Z' }), { projectId: 'p-1', scope: 'project' }, NaN);
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'malformed');
});
