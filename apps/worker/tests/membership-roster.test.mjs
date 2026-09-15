/**
 * THE ROSTER, THE BATCH AND THE EVENT — as pure decisions, fed the inputs that must be refused.
 *
 * `memberDirectory` in src/supa.ts answers one question: who may be @mentioned right now. It is
 * built from LIVE grants only, which is correct for mentions and useless for administration —
 * a person looking at a member list needs to see the member whose invitation EXPIRED, the one who
 * was SUSPENDED this morning, and the stranger who walked in through a link, because those are
 * exactly the rows they are about to act on.
 *
 * So the roster is a second view over the same rows, and it takes its STATUS from `classifyGrant`
 * rather than deciding again — two authorities that disagree about whether a grant is live are
 * worse than one (F-57). Every test below either feeds a violating input or checks that the two
 * agree.
 *
 * THE FILTER FAILURES THIS FILE IS REALLY ABOUT:
 *
 *   - A filter value that is not one of ours is an ERROR, never an ignored filter. `?status=revokd`
 *     answered with the whole roster reads as "nobody is revoked" — a failure to observe rendering
 *     as an observation, which is this repository's F-58.
 *   - A batch that is too large is REFUSED, never truncated. A truncated batch reports success for
 *     invitations it did not send.
 *   - An expiry that cannot be parsed is refused at the door, because `classifyGrant` treats an
 *     unreadable expiry as DEAD — accepting one would write a grant that never works and report it
 *     as an invitation.
 *
 * Run with:  node --test tests/membership-roster.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MEMBER_STATUSES,
  MEMBER_ORIGINS,
  MEMBERSHIP_EVENT_KINDS,
  BULK_INVITE_MAX,
  buildRoster,
  parseRosterQuery,
  filterRoster,
  planBulkInvite,
  inviteEventKind,
  buildMembershipEvent,
} from '../src/membership.ts';
import { classifyGrant, GRANTABLE_ROLES } from '../src/collab.ts';

const NOW = Date.parse('2026-09-15T12:00:00.000Z');
const OWNER = '11111111-1111-4111-8111-111111111111';
const A = '22222222-2222-4222-8222-222222222222';
const B = '33333333-3333-4333-8333-333333333333';
const C = '44444444-4444-4444-8444-444444444444';
const GUEST = '55555555-5555-4555-8555-555555555555';

const project = { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', owner_id: OWNER };

const row = (over = {}) => ({
  user_id: A,
  role: 'editor',
  display_name: null,
  invited_by: OWNER,
  created_at: '2026-09-01T00:00:00.000Z',
  expires_at: null,
  revoked_at: null,
  suspended_at: null,
  suspended_reason: null,
  suspended_by: null,
  ...over,
});

// ============================================================ status, derived and never re-decided

test('every status the roster can show is a status classifyGrant can produce', () => {
  // The roster does not decide whether a grant is live; it reports what the access decision
  // already decided. If these two vocabularies drift, the list shows one thing and the door does
  // another. Each status is produced HERE by feeding classifyGrant the row that causes it.
  const produced = new Set([
    classifyGrant(row(), NOW).status,
    classifyGrant(row({ expires_at: '2020-01-01T00:00:00.000Z' }), NOW).status,
    classifyGrant(row({ revoked_at: '2026-09-02T00:00:00.000Z' }), NOW).status,
    classifyGrant(row({ suspended_at: '2026-09-02T00:00:00.000Z' }), NOW).status,
    classifyGrant(row({ role: 'owner' }), NOW).status,
  ]);
  assert.deepEqual(
    [...produced].sort(),
    ['active', 'expired', 'malformed', 'revoked', 'suspended'],
    'the five row shapes above must produce five distinct classifications',
  );
  for (const s of produced) {
    assert.ok(MEMBER_STATUSES.includes(s), `classifyGrant can produce ${s} and the roster cannot show it`);
  }
});

test('SUSPENSION is a status of its own, and it closes the door like revocation does', () => {
  const suspended = row({ suspended_at: '2026-09-14T09:00:00.000Z', suspended_reason: 'under review', suspended_by: OWNER });
  const { status, grant } = classifyGrant(suspended, NOW);
  assert.equal(status, 'suspended', 'a suspended row must not read as active');
  assert.equal(grant, null, 'a suspended grant confers nothing');

  // …and it is distinguishable from revocation, which is the entire point of adding it: an admin
  // who cannot tell "paused" from "gone" cannot restore the first without re-inviting the second.
  assert.equal(classifyGrant(row({ revoked_at: '2026-09-14T09:00:00.000Z' }), NOW).status, 'revoked');

  // Revocation still beats suspension: the stronger fact wins, so "restore" cannot resurrect
  // someone who was removed.
  const both = row({ suspended_at: '2026-09-14T09:00:00.000Z', revoked_at: '2026-09-14T10:00:00.000Z' });
  assert.equal(classifyGrant(both, NOW).status, 'revoked');
});

test('a suspension timestamp that cannot be read suspends anyway, and never reads as active', () => {
  // The same direction `expires_at` fails in: present but unreadable must close the grant.
  for (const bad of ['whenever', '', 0, {}, [], true]) {
    const { status, grant } = classifyGrant(row({ suspended_at: bad }), NOW);
    assert.notEqual(status, 'active', `suspended_at ${JSON.stringify(String(bad))} must not read as active`);
    assert.equal(grant, null);
  }
});

// ============================================================ the roster itself

test('the roster carries the owner, the live members, and the ones a directory would hide', () => {
  const roster = buildRoster({
    project,
    rows: [
      row({ user_id: A, role: 'editor' }),
      row({ user_id: B, role: 'viewer', expires_at: '2020-01-01T00:00:00.000Z' }),
      row({ user_id: C, role: 'commenter', suspended_at: '2026-09-14T09:00:00.000Z', suspended_reason: 'spam', suspended_by: OWNER }),
    ],
    kvGrants: [{ user_id: GUEST, role: 'viewer', via_token: 'tok', invited_by: OWNER, accepted_at: '2026-09-10T00:00:00.000Z', expires_at: null, revoked_at: null }],
    ownerHandle: 'maya',
    nowMs: NOW,
  });

  const by = Object.fromEntries(roster.map((e) => [e.userId, e]));
  assert.equal(by[OWNER].role, 'owner');
  assert.equal(by[OWNER].status, 'active');
  assert.equal(by[OWNER].origin, 'owner');
  assert.equal(by[A].status, 'active');
  assert.equal(by[B].status, 'expired', 'an expired member is still on the roster, marked expired');
  assert.equal(by[B].role, 'viewer', 'the role a dead grant carried is still reported — "was a viewer"');
  assert.equal(by[C].status, 'suspended');
  assert.equal(by[C].suspendedReason, 'spam');
  assert.equal(by[C].suspendedBy, OWNER);
  assert.equal(by[GUEST].status, 'active');

  // THE GUEST. Someone who redeemed a link is an outsider who let themselves in, and a roster that
  // cannot say so cannot be used to decide who should still be here.
  assert.equal(by[GUEST].origin, 'link');
  assert.equal(by[GUEST].guest, true);
  assert.equal(by[GUEST].acceptedAt, '2026-09-10T00:00:00.000Z');
  assert.equal(by[A].guest, false, 'an invited member is not a guest');
  assert.equal(by[OWNER].guest, false, 'the owner is certainly not a guest');
  for (const e of roster) assert.ok(MEMBER_ORIGINS.includes(e.origin), `${e.origin} is not an origin`);
});

test('a row the access layer cannot read appears as malformed rather than vanishing', () => {
  // Dropping it would hide a row that EXISTS in the table from the only person who can fix it.
  const roster = buildRoster({ project, rows: [row({ role: 'owner' }), row({ user_id: B, role: 'nonsense' })], kvGrants: [], ownerHandle: null, nowMs: NOW });
  const bad = roster.filter((e) => e.status === 'malformed');
  assert.equal(bad.length, 2, 'both unreadable rows are reported');
  assert.equal(bad[0].role, null, 'a role that is not a role is reported as no role, never widened');
});

test('the owner appears once, at full strength, even when a row claims them', () => {
  const roster = buildRoster({
    project,
    rows: [row({ user_id: OWNER, role: 'viewer' })],
    kvGrants: [{ user_id: OWNER, role: 'viewer', via_token: 't', invited_by: null, expires_at: null, revoked_at: null }],
    ownerHandle: 'maya',
    nowMs: NOW,
  });
  const owners = roster.filter((e) => e.userId === OWNER);
  assert.equal(owners.length, 1, 'the owner is in the roster exactly once');
  assert.equal(owners[0].role, 'owner', 'a membership row must never downgrade the owner');
});

test('two grants for one person collapse to the strongest LIVE one, as the door decides it', () => {
  const roster = buildRoster({
    project,
    rows: [row({ user_id: A, role: 'viewer' }), row({ user_id: A, role: 'admin', revoked_at: '2026-09-02T00:00:00.000Z' })],
    kvGrants: [],
    ownerHandle: null,
    nowMs: NOW,
  });
  const entries = roster.filter((e) => e.userId === A);
  assert.equal(entries.length, 1, 'one person is one row on the roster');
  assert.equal(entries[0].role, 'viewer', 'the LIVE grant is the one in force, not the stronger dead one');
  assert.equal(entries[0].status, 'active');
});

// ============================================================ filters

test('a filter value that is not one of ours is an ERROR, never an ignored filter', () => {
  // `?status=revokd` answered with everybody reads as "nobody is revoked".
  for (const [key, value] of [
    ['status', 'revokd'],
    ['role', 'superuser'],
    ['origin', 'ftp'],
    ['limit', 'lots'],
    ['limit', '0'],
    ['limit', '-3'],
    ['offset', 'x'],
  ]) {
    const parsed = parseRosterQuery({ [key]: value });
    assert.equal(parsed.ok, false, `${key}=${value} must be refused`);
    assert.equal(parsed.error, `bad_${key}`, `${key}=${value} must say which filter it refused`);
  }
  const good = parseRosterQuery({ status: 'suspended', role: 'editor', origin: 'link', q: 'ma', limit: '10', offset: '5' });
  assert.equal(good.ok, true);
  assert.equal(good.status, 'suspended');
  assert.equal(good.role, 'editor');
  assert.equal(good.origin, 'link');
  assert.equal(good.limit, 10);
  assert.equal(good.offset, 5);
});

test('the default answers the live roster, and `all` is the way to ask for the rest', () => {
  const dflt = parseRosterQuery({});
  assert.equal(dflt.ok, true);
  assert.equal(dflt.status, 'active', 'the unfiltered list is the live one, as every caller before this expected');
  assert.equal(parseRosterQuery({ status: 'all' }).status, 'all');
});

test('filtering narrows, and says how many it narrowed FROM', () => {
  const roster = buildRoster({
    project,
    rows: [
      row({ user_id: A, role: 'editor', display_name: 'Maya Tal' }),
      row({ user_id: B, role: 'viewer', revoked_at: '2026-09-02T00:00:00.000Z' }),
      row({ user_id: C, role: 'editor', suspended_at: '2026-09-02T00:00:00.000Z' }),
    ],
    kvGrants: [{ user_id: GUEST, role: 'viewer', via_token: 't', invited_by: OWNER, expires_at: null, revoked_at: null }],
    ownerHandle: 'noa',
    nowMs: NOW,
  });

  const live = filterRoster(roster, parseRosterQuery({}));
  assert.equal(live.total, 5, 'total counts every row that exists, whatever the filter');
  assert.deepEqual(live.entries.map((e) => e.userId).sort(), [OWNER, A, GUEST].sort());
  assert.equal(live.matched, 3);

  assert.deepEqual(filterRoster(roster, parseRosterQuery({ status: 'revoked' })).entries.map((e) => e.userId), [B]);
  assert.deepEqual(filterRoster(roster, parseRosterQuery({ status: 'suspended' })).entries.map((e) => e.userId), [C]);
  assert.deepEqual(filterRoster(roster, parseRosterQuery({ origin: 'link', status: 'all' })).entries.map((e) => e.userId), [GUEST]);
  assert.deepEqual(
    filterRoster(roster, parseRosterQuery({ role: 'editor', status: 'all' })).entries.map((e) => e.userId).sort(),
    [A, C].sort(),
  );
  assert.equal(filterRoster(roster, parseRosterQuery({ status: 'all' })).matched, 5);

  // The text query matches a display name, a handle or an id — and matches NOTHING it was not given.
  assert.deepEqual(filterRoster(roster, parseRosterQuery({ q: 'maya' })).entries.map((e) => e.userId), [A]);
  assert.deepEqual(filterRoster(roster, parseRosterQuery({ q: 'MAYA' })).entries.map((e) => e.userId), [A], 'case-insensitive');
  assert.deepEqual(filterRoster(roster, parseRosterQuery({ q: 'noa' })).entries.map((e) => e.userId), [OWNER]);
  assert.deepEqual(filterRoster(roster, parseRosterQuery({ q: GUEST.slice(0, 8), status: 'all' })).entries.map((e) => e.userId), [GUEST]);
  assert.deepEqual(filterRoster(roster, parseRosterQuery({ q: 'nobody-by-that-name' })).entries, []);
});

test('a page is a window on a stable order, and the caller is told there is more', () => {
  const rows = [];
  for (let i = 0; i < 7; i++) {
    rows.push(row({ user_id: `${i}0000000-0000-4000-8000-000000000000`, role: 'viewer', display_name: `member-${i}` }));
  }
  const roster = buildRoster({ project, rows, kvGrants: [], ownerHandle: 'maya', nowMs: NOW });
  const first = filterRoster(roster, parseRosterQuery({ limit: '3' }));
  assert.equal(first.entries.length, 3);
  assert.equal(first.matched, 8, 'matched counts everything the filter admitted, not the page');
  assert.equal(first.more, true);
  const second = filterRoster(roster, parseRosterQuery({ limit: '3', offset: '3' }));
  assert.equal(second.entries.length, 3);
  assert.equal(second.more, true);
  const third = filterRoster(roster, parseRosterQuery({ limit: '3', offset: '6' }));
  assert.equal(third.entries.length, 2);
  assert.equal(third.more, false, 'the last page says so');
  // No row is served twice and none is skipped, which is the only thing pagination has to promise.
  const seen = [...first.entries, ...second.entries, ...third.entries].map((e) => e.userId);
  assert.equal(new Set(seen).size, 8, 'every member appears exactly once across the pages');
  // An offset past the end is an empty page, not a wrapped one.
  assert.deepEqual(filterRoster(roster, parseRosterQuery({ limit: '3', offset: '99' })).entries, []);
});

// ============================================================ bulk invitations

test('a batch is refused whole rather than truncated', () => {
  const many = [];
  for (let i = 0; i <= BULK_INVITE_MAX; i++) many.push({ userId: `${(i % 10)}1111111-1111-4111-8111-11111111111${i % 10}`, role: 'viewer' });
  const out = planBulkInvite({ members: many }, { ownerId: OWNER, actorId: OWNER });
  assert.equal(out.ok, false);
  assert.equal(out.error, 'too_many');
  // Truncating would report 201 for invitations that were never written.
  assert.equal(out.accepted, undefined);
});

test('a batch says, per row, exactly which rows it refused and why', () => {
  const out = planBulkInvite(
    {
      members: [
        { userId: A, role: 'editor' },
        { userId: 'not-a-uuid', role: 'editor' },
        { userId: B, role: 'owner' },
        { userId: OWNER, role: 'admin' },
        { userId: A, role: 'viewer' },
        { userId: C, role: 'viewer', expiresAt: 'whenever' },
        { userId: C, role: 'viewer', expiresAt: '2099-01-01T00:00:00.000Z' },
      ],
    },
    { ownerId: OWNER, actorId: OWNER },
  );
  assert.equal(out.ok, true);
  assert.deepEqual(out.accepted.map((r) => r.userId), [A, C]);
  assert.deepEqual(
    out.rejected.map((r) => [r.index, r.error]),
    [
      [1, 'bad_user'],
      [2, 'unknown_role'],
      [3, 'owner_is_not_a_member'],
      [4, 'duplicate'],
      [5, 'bad_expiry'],
    ],
    'every refusal names the ROW it refused, by index, and the reason',
  );
  assert.equal(out.accepted.find((r) => r.userId === C).expiresAt, '2099-01-01T00:00:00.000Z');
  // An unparseable expiry is refused rather than written: classifyGrant treats it as DEAD, so a
  // row accepted with one is an invitation that never opens anything.
  assert.equal(out.accepted.some((r) => r.expiresAt === 'whenever'), false);
});

test('a batch that is not a batch is refused before anything is written', () => {
  for (const body of [null, {}, { members: 'A,B' }, { members: [] }, { members: [null, 7] }]) {
    const out = planBulkInvite(body, { ownerId: OWNER, actorId: OWNER });
    if (out.ok) {
      assert.equal(out.accepted.length, 0, `${JSON.stringify(body)} must not accept any row`);
    } else {
      assert.ok(['bad_body', 'no_members'].includes(out.error), `unexpected refusal ${out.error}`);
    }
  }
  // …and every role a batch may confer is a role a single invitation may confer. One allowlist.
  const out = planBulkInvite({ members: GRANTABLE_ROLES.map((role, i) => ({ userId: `${i}2222222-2222-4222-8222-222222222222`, role })) }, { ownerId: OWNER, actorId: OWNER });
  assert.equal(out.accepted.length, GRANTABLE_ROLES.length, 'every grantable role is acceptable in a batch');
  assert.equal(out.rejected.length, 0);
});

// ============================================================ the event log

test('the kind of an event is decided by what CHANGED, not by which route was called', () => {
  assert.equal(inviteEventKind(null, { role: 'editor' }), 'invited');
  assert.equal(inviteEventKind({ role: 'viewer', revoked_at: null }, { role: 'editor' }), 'role_changed');
  assert.equal(inviteEventKind({ role: 'editor', revoked_at: null }, { role: 'editor' }), 'renewed');
  assert.equal(inviteEventKind({ role: 'editor', revoked_at: '2026-09-01T00:00:00.000Z' }, { role: 'editor' }), 'reactivated');
  assert.equal(
    inviteEventKind({ role: 'viewer', revoked_at: '2026-09-01T00:00:00.000Z' }, { role: 'admin' }),
    'reactivated',
    'coming back from revoked is a reactivation even when the role also moved',
  );
  for (const k of ['invited', 'role_changed', 'renewed', 'reactivated']) {
    assert.ok(MEMBERSHIP_EVENT_KINDS.includes(k), `${k} is not in the event vocabulary`);
  }
});

test('an event that cannot be read back is never written', () => {
  const ok = buildMembershipEvent({
    projectId: project.id,
    kind: 'role_changed',
    subjectId: A,
    actorId: OWNER,
    fromRole: 'viewer',
    toRole: 'editor',
    at: new Date(NOW).toISOString(),
  });
  assert.ok(ok);
  assert.equal(ok.project_id, project.id);
  assert.equal(ok.subject_id, A);
  assert.equal(ok.actor_id, OWNER);
  assert.equal(ok.from_role, 'viewer');
  assert.equal(ok.to_role, 'editor');
  assert.equal(ok.created_at, new Date(NOW).toISOString());

  for (const bad of [
    { kind: 'deleted_everything' },
    { kind: '' },
    { subjectId: '' },
    { subjectId: 7 },
    { actorId: null },
    { projectId: '' },
    { fromRole: 'superuser' },
    { toRole: 'superuser' },
  ]) {
    const out = buildMembershipEvent({
      projectId: project.id,
      kind: 'role_changed',
      subjectId: A,
      actorId: OWNER,
      fromRole: 'viewer',
      toRole: 'editor',
      at: new Date(NOW).toISOString(),
      ...bad,
    });
    assert.equal(out, null, `${JSON.stringify(bad)} must not produce an event row`);
  }

  // A reason is carried, trimmed and BOUNDED — an unbounded reason is a way to write a novel into
  // an append-only table nobody can edit.
  const long = buildMembershipEvent({
    projectId: project.id,
    kind: 'suspended',
    subjectId: A,
    actorId: OWNER,
    reason: 'x'.repeat(5000),
    at: new Date(NOW).toISOString(),
  });
  assert.ok(long.reason.length <= 500, 'the reason is bounded');
  assert.equal(
    buildMembershipEvent({ projectId: project.id, kind: 'suspended', subjectId: A, actorId: OWNER, at: new Date(NOW).toISOString() }).reason,
    null,
    'no reason is null, never an empty string that reads like a reason nobody gave',
  );
});
