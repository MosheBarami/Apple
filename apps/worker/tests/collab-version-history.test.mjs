/**
 * VERSION HISTORY — append-only, and the tests are about the RELATIONSHIPS rather than the numbers.
 *
 * "seq is 4" is a weak claim; "the version a restore writes has a higher seq than everything that
 * was already there, and nothing that was there changed" is the claim the feature actually makes.
 * A rewind-style restore passes any assertion about a single row and fails the one below.
 *
 * Run with:  node --test tests/collab-version-history.test.mjs     (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { planVersion, planRestore, lineage, head, nextSeq, MAX_VERSION_LABEL_CHARS } from '../src/version-history.ts';

const NOW = 1_770_000_000_000;
const OWNER = { userId: 'u-owner', role: 'owner' };
const ADMIN = { userId: 'u-admin', role: 'admin' };
const EDITOR = { userId: 'u-editor', role: 'editor' };
const VIEWER = { userId: 'u-viewer', role: 'viewer' };
const COMMENTER = { userId: 'u-commenter', role: 'commenter' };

const v = (id, seq, over = {}) => ({
  id, seq, label: `v${seq}`, authorId: 'u-editor', kind: 'manual', parentId: null, restoredFrom: null, createdAt: NOW - 1000 * seq, ...over,
});
const HISTORY = [v('a', 1), v('b', 2, { parentId: 'a' }), v('c', 3, { parentId: 'b' })];

test('a viewer and a commenter cannot mint history; an editor can', () => {
  for (const actor of [VIEWER, COMMENTER]) {
    const out = planVersion(actor, { label: 'my version', nowMs: NOW }, HISTORY);
    assert.equal(out.ok, false, `${actor.role} must not be able to record a version`);
    assert.equal(out.status, 403);
    assert.equal(out.reason, 'insufficient_role');
  }
  assert.equal(planVersion(EDITOR, { label: 'my version', nowMs: NOW }, HISTORY).ok, true);
  assert.equal(planVersion(null, { label: 'my version', nowMs: NOW }, HISTORY).reason, 'not_a_member');
});

test('an EDITOR cannot restore — discarding other people work is not building', () => {
  const out = planRestore(EDITOR, 'b', HISTORY, NOW);
  assert.equal(out.ok, false);
  assert.equal(out.status, 403);
  assert.equal(out.reason, 'insufficient_role');
  for (const actor of [VIEWER, COMMENTER]) assert.equal(planRestore(actor, 'b', HISTORY, NOW).reason, 'insufficient_role');
  assert.equal(planRestore(ADMIN, 'b', HISTORY, NOW).ok, true);
  assert.equal(planRestore(OWNER, 'b', HISTORY, NOW).ok, true);
  assert.equal(planRestore(null, 'b', HISTORY, NOW).reason, 'not_a_member');
});

test('restoring moves FORWARD: the new version outranks everything and nothing old changes', () => {
  const before = JSON.parse(JSON.stringify(HISTORY));
  const out = planRestore(ADMIN, 'b', HISTORY, NOW);
  assert.equal(out.ok, true);

  // THE CLAIM: a restore is an append, not a rewind.
  const maxExisting = Math.max(...HISTORY.map((x) => x.seq));
  assert.ok(out.version.seq > maxExisting, 'the restore version must outrank every version already recorded');
  assert.equal(out.version.parentId, head(HISTORY).id, 'its parent is the head at the time, not the version it restores');
  assert.equal(out.version.restoredFrom, 'b', 'and it names what it brought back');
  assert.equal(out.restoring.id, 'b');
  assert.equal(out.version.kind, 'restore');
  assert.equal(out.version.authorId, ADMIN.userId, 'the person who rolled back is on the record');
  assert.deepEqual(HISTORY, before, 'restoring must not mutate or discard a single existing row');
});

test('a restore of a restore keeps going forward', () => {
  const first = planRestore(ADMIN, 'b', HISTORY, NOW);
  const withRestore = [...HISTORY, { id: 'd', ...first.version }];
  const second = planRestore(OWNER, 'd', withRestore, NOW + 1000);
  assert.ok(second.version.seq > first.version.seq, 'sequence numbers only ever go up');
  assert.equal(second.version.parentId, 'd');
  assert.equal(second.version.restoredFrom, 'd');
});

test('a version that is not in the history cannot be restored', () => {
  const out = planRestore(ADMIN, 'nope', HISTORY, NOW);
  assert.equal(out.ok, false);
  assert.equal(out.status, 404);
  assert.equal(out.reason, 'version_not_found');
  assert.equal(planRestore(ADMIN, '', HISTORY, NOW).reason, 'missing_version');
  assert.equal(planRestore(ADMIN, 42, HISTORY, NOW).reason, 'missing_version');
});

test('a corrupt seq does not poison the next one', () => {
  // max(NaN, 3) + 1 is NaN, and a NaN seq sorts nowhere and compares false against everything —
  // which means every later version would collide at "NaN" and the ordering would be gone.
  const poisoned = [...HISTORY, v('bad', NaN), v('worse', 'seven'), v('awful', Infinity), null, 'nonsense'];
  assert.equal(nextSeq(poisoned), 4, 'the next sequence comes from rows we can actually read');
  const out = planVersion(EDITOR, { label: 'after the mess', nowMs: NOW }, poisoned);
  assert.equal(out.ok, true);
  assert.ok(Number.isFinite(out.version.seq));
  assert.equal(out.version.seq, 4);
  assert.equal(head(poisoned).id, 'c', 'a row we cannot read is not the head');
});

test('an empty history starts at 1 with no parent', () => {
  assert.equal(nextSeq([]), 1);
  assert.equal(head([]), null);
  const out = planVersion(EDITOR, { label: 'first', nowMs: NOW }, []);
  assert.equal(out.version.seq, 1);
  assert.equal(out.version.parentId, null);
});

test('a restore version cannot be minted directly', () => {
  // Otherwise a caller could write a row claiming to restore a version it never read.
  const out = planVersion(ADMIN, { label: 'sneaky', kind: 'restore', nowMs: NOW }, HISTORY);
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'restore_is_not_directly_creatable');
  for (const kind of ['rewind', '', 'Manual', 7, {}]) {
    assert.equal(planVersion(EDITOR, { label: 'x', kind, nowMs: NOW }, HISTORY).reason, 'unknown_kind');
  }
  assert.equal(planVersion(EDITOR, { label: 'x', kind: 'pre_agent', nowMs: NOW }, HISTORY).ok, true);
});

test('labels are refused rather than truncated, and a broken clock refuses the write', () => {
  assert.equal(planVersion(EDITOR, { label: '   ', nowMs: NOW }, HISTORY).reason, 'empty_label');
  assert.equal(planVersion(EDITOR, { label: 7, nowMs: NOW }, HISTORY).reason, 'missing_label');
  assert.equal(planVersion(EDITOR, { label: 'x'.repeat(MAX_VERSION_LABEL_CHARS + 1), nowMs: NOW }, HISTORY).reason, 'label_too_long');
  for (const clock of [NaN, Infinity, -Infinity]) {
    assert.equal(planVersion(EDITOR, { label: 'ok', nowMs: clock }, HISTORY).reason, 'bad_clock');
    assert.equal(planRestore(ADMIN, 'b', HISTORY, clock).reason, 'bad_clock');
  }
});

test('lineage walks root-first and terminates on a parent chain that loops', () => {
  assert.deepEqual(lineage(HISTORY, 'c').map((x) => x.id), ['a', 'b', 'c']);
  assert.deepEqual(lineage(HISTORY, 'a').map((x) => x.id), ['a']);
  assert.deepEqual(lineage(HISTORY, 'missing'), []);

  // A bad write makes two rows point at each other. This must terminate, not spin inside the DO.
  const looped = [v('x', 1, { parentId: 'y' }), v('y', 2, { parentId: 'x' })];
  const chain = lineage(looped, 'x');
  assert.ok(chain.length <= 2, 'a cycle must terminate at the repeat');
  assert.deepEqual(chain.map((c) => c.id).sort(), ['x', 'y']);
});
