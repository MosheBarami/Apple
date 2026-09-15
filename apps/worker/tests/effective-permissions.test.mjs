/**
 * "What may I do here, and why?" — CHECKLIST-V2 section 08, items 12, 13 and 14.
 *
 *   12 Permission inheritance visibility
 *   13 Permission override visibility
 *   14 Effective permission inspection
 *
 * Those are one question. A person who cannot see WHY they can do something cannot tell a bug from
 * a policy, and a person who cannot see why they CANNOT cannot tell "ask an admin" from "this is
 * broken". The three items are the same endpoint answering at three depths: what, from where, and
 * until when.
 *
 * THE PROPERTY THAT MATTERS MOST. The answer must be DERIVED from the same `can()` the routes
 * enforce with, never from a second table written beside it. A permissions view that drifts from
 * enforcement is worse than none: it tells people confidently what the server will refuse. So this
 * asserts agreement with `can()` across every role and every action rather than asserting a
 * hand-written matrix — a hand-written expectation would pass while both drifted together.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'effperm-')), 'collab.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'collab.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const C = await import(`file://${out}`);

const NOW = Date.parse('2026-09-15T12:00:00Z');
const DAY = 864e5;
const OWNER = 'owner-1';
const MEMBER = 'member-1';
const grant = (over = {}) => ({ user_id: MEMBER, role: 'editor', expires_at: null, revoked_at: null, invited_by: OWNER, display_name: 'M', created_at: null, ...over });

test('CONTROL: the answer AGREES with can() for every role and every action', () => {
  // The whole point. A hand-written matrix here would pass while the view and the enforcement
  // drifted together; deriving both from can() makes disagreement the only way to fail.
  for (const role of ['viewer', 'commenter', 'editor', 'admin']) {
    const eff = C.effectivePermissions({ userId: MEMBER, role, via: 'grant' }, { now: NOW });
    for (const action of C.COLLAB_ACTIONS) {
      assert.equal(eff.actions[action], C.can(role, action),
        `${role} + ${action}: the view says ${eff.actions[action]} and enforcement says ${C.can(role, action)}`);
    }
  }
});

test('an owner is shown as owner, inherited from ownership rather than a grant', () => {
  const eff = C.effectivePermissions({ userId: OWNER, role: 'owner', via: 'owner' }, { now: NOW });
  assert.equal(eff.role, 'owner');
  assert.equal(eff.via, 'owner', 'inheritance visibility: where the role came from');
  assert.equal(eff.actions.read, true);
  assert.equal(eff.expiresAtIso, null, 'ownership does not expire');
});

test('a granted role names the grant it came from, and when it runs out', () => {
  const g = grant({ expires_at: new Date(NOW + 7 * DAY).toISOString() });
  const eff = C.effectivePermissions({ userId: MEMBER, role: 'editor', via: 'grant' }, { now: NOW, grants: [g] });
  assert.equal(eff.via, 'grant');
  assert.equal(eff.invitedBy, OWNER, 'override visibility: who conferred it');
  assert.equal(eff.expiresAtIso, new Date(NOW + 7 * DAY).toISOString(), 'and until when');
});

test('OVERRIDE VISIBILITY: two grants, and the answer says which one won', () => {
  // The strongest grant wins — that is resolveMembership's rule — and a person looking at two
  // invitations needs to be told which is in force, not left to guess from the role alone.
  const weak = grant({ role: 'viewer', invited_by: 'someone-else' });
  const strong = grant({ role: 'admin', invited_by: OWNER });
  const eff = C.effectivePermissions({ userId: MEMBER, role: 'admin', via: 'grant' }, { now: NOW, grants: [weak, strong] });
  assert.equal(eff.role, 'admin');
  assert.equal(eff.invitedBy, OWNER, 'the grant that conferred the effective role is the one reported');
  assert.equal(eff.supersededCount, 1, 'and the weaker grant is acknowledged rather than hidden');
});

test('a non-member gets an honest nothing, not an empty success', () => {
  // `null` membership must not render as "you have no permissions here" in a shape that looks the
  // same as a viewer with an empty action list.
  const eff = C.effectivePermissions(null, { now: NOW });
  assert.equal(eff.role, null);
  assert.equal(eff.via, null);
  // `[].every(...)` is TRUE, so an all-false check alone passes on an EMPTY map — and an empty map
  // is exactly the bug (absence reading as refusal). The count is asserted first, deliberately:
  // deleting the map entirely left this case green until it was.
  assert.equal(Object.keys(eff.actions).length, C.COLLAB_ACTIONS.length, 'every action is named, even for a stranger');
  assert.equal(Object.values(eff.actions).every((v) => v === false), true, 'nothing is permitted');
  assert.equal(eff.member, false, 'and the answer SAYS you are not a member');
});

test('every action in the vocabulary appears in the answer', () => {
  // A view that silently omits an action reads as "not permitted" for it. Absence must not be a
  // verdict — the omission and the refusal look identical to a UI.
  const eff = C.effectivePermissions({ userId: MEMBER, role: 'editor', via: 'grant' }, { now: NOW });
  for (const action of C.COLLAB_ACTIONS) {
    assert.equal(Object.prototype.hasOwnProperty.call(eff.actions, action), true, `${action} is missing from the answer`);
  }
  assert.equal(Object.keys(eff.actions).length, C.COLLAB_ACTIONS.length, 'and nothing extra is invented');
});

test('an expired grant confers nothing, and says so rather than reporting the role', () => {
  const expired = grant({ expires_at: new Date(NOW - 1).toISOString() });
  const eff = C.effectivePermissions({ userId: MEMBER, role: 'editor', via: 'grant' }, { now: NOW, grants: [expired] });
  assert.equal(eff.expiresAtIso, null, 'an expired grant is not the source of anything');
  assert.equal(eff.invitedBy, null);
});

test('a corrupt clock refuses to answer rather than answering wrongly', () => {
  for (const now of [NaN, Infinity, '123', null]) {
    const eff = C.effectivePermissions({ userId: MEMBER, role: 'editor', via: 'grant' }, { now, grants: [grant()] });
    assert.equal(eff.member, false, `nowMs=${String(now)} must not produce a confident answer`);
    assert.equal(Object.values(eff.actions).every((v) => v === false), true);
  }
});
