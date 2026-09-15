/**
 * THE COLLABORATION STORE, DRIVEN OVER A REAL DATABASE.
 *
 * `packages/evals` already showed that a Durable Object's logic can be driven directly if its
 * storage is injected (see the BudgetDO fixture in preserved.test.mjs). This goes one step
 * further and gives CollabStore a real SQLite engine — node:sqlite — rather than a Map that says
 * yes to everything. The schema, the indexes, the joins and the `insert or replace` semantics
 * below are the ones that ship; a fake `exec` that returns `[]` would let a query with a missing
 * WHERE clause pass as easily as a correct one.
 *
 * What is under test here is the STORE's own load-bearing behaviour — that reads are scoped, that
 * a toggle is a toggle, that a restore appends — with every entry point asked as the person who
 * must be refused.
 *
 * Run with:  node --test tests/collab-store.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { CollabStore, collabContext } from '../src/do/collab-store.ts';

const NOW = 1_770_000_000_000;

/** A SqlStorage-shaped adapter over node:sqlite. `exec` is the DO's signature exactly. */
function sqlite() {
  const db = new DatabaseSync(':memory:');
  return {
    exec(query, ...bindings) {
      // The DO allows several statements in one exec only when there are no bindings; that is
      // how the schema is applied, and this adapter keeps the same rule rather than hiding it.
      if (bindings.length === 0 && /;[\s\S]*\S/.test(query.trim().replace(/;\s*$/, ''))) {
        db.exec(query);
        return { toArray: () => [], one: () => ({}) };
      }
      const stmt = db.prepare(query);
      const rows = stmt.all(...bindings);
      return { toArray: () => rows, one: () => rows[0] ?? {} };
    },
  };
}

const DIRECTORY = [
  { userId: 'u-owner', handle: 'maya', role: 'owner' },
  { userId: 'u-admin', handle: 'noa', role: 'admin' },
  { userId: 'u-editor', handle: 'tal', role: 'editor' },
  { userId: 'u-viewer', handle: 'gil', role: 'viewer' },
];

const ctxFor = (userId, role, nowMs = NOW) => collabContext(userId, role, nowMs, DIRECTORY);
const STRANGER = collabContext('u-stranger', undefined, NOW, DIRECTORY); // no role ⇒ no actor
const build = { targetKind: 'build', targetId: 'b-1' };

function store() {
  return new CollabStore(sqlite());
}

test('the schema applies and a fresh project has nothing in it', () => {
  const s = store();
  const out = s.listComments(ctxFor('u-editor', 'editor'), { kind: 'build', id: 'b-1' });
  assert.equal(out.status, 200);
  assert.deepEqual(out.body.comments, []);
  assert.deepEqual(s.listVersions(ctxFor('u-owner', 'owner')).body.versions, []);
});

test('a NON-MEMBER is refused at every single entry point, asked as the non-member', () => {
  const s = store();
  // Seed real content as a member first, so the refusals below are refusing access to something
  // that exists rather than passing because the tables are empty.
  const seeded = s.addComment(ctxFor('u-editor', 'editor'), { ...build, body: 'seeded' });
  assert.equal(seeded.status, 201);

  const attempts = [
    ['listComments', s.listComments(STRANGER, { kind: 'build', id: 'b-1' })],
    ['addComment', s.addComment(STRANGER, { ...build, body: 'let me in' })],
    ['resolveComment', s.resolveComment(STRANGER, { commentId: seeded.body.id, resolved: true })],
    ['react', s.react(STRANGER, { commentId: seeded.body.id, emoji: '👍' })],
    ['listReviews', s.listReviews(STRANGER, {})],
    ['requestReview', s.requestReview(STRANGER, { ...build, reviewers: ['u-admin'] })],
    ['approve', s.approve(STRANGER, { reviewId: 'r-1', verdict: 'approved' })],
    ['listVersions', s.listVersions(STRANGER)],
    ['addVersion', s.addVersion(STRANGER, { label: 'mine now' })],
    ['restoreVersion', s.restoreVersion(STRANGER, { versionId: 'v-1' })],
  ];
  for (const [name, out] of attempts) {
    assert.equal(out.status, 403, `${name} must refuse a non-member`);
    assert.equal(out.body.error, 'not_a_member', `${name} must say why`);
  }
  // And nothing they attempted was written.
  const after = s.listComments(ctxFor('u-editor', 'editor'), { kind: 'build', id: 'b-1' });
  assert.equal(after.body.comments.length, 1, 'the stranger wrote nothing');
  assert.equal(after.body.comments[0].body, 'seeded');
  assert.equal(after.body.comments[0].resolvedAt, null, 'and resolved nothing');
});

test('a viewer may read the thread and may not write to it', () => {
  const s = store();
  s.addComment(ctxFor('u-editor', 'editor'), { ...build, body: 'first' });
  const read = s.listComments(ctxFor('u-viewer', 'viewer'), { kind: 'build', id: 'b-1' });
  assert.equal(read.status, 200);
  assert.equal(read.body.comments.length, 1);
  assert.deepEqual(read.body.capabilities, ['read'], 'and is told honestly what they may do');

  assert.equal(s.addComment(ctxFor('u-viewer', 'viewer'), { ...build, body: 'nope' }).status, 403);
  assert.equal(s.react(ctxFor('u-viewer', 'viewer'), { commentId: read.body.comments[0].id, emoji: '👍' }).status, 403);
  assert.equal(s.listComments(ctxFor('u-editor', 'editor'), { kind: 'build', id: 'b-1' }).body.comments.length, 1);
});

test('a comment round-trips through SQL with its mentions, and a stranger handle stores nothing', () => {
  const s = store();
  const out = s.addComment(ctxFor('u-editor', 'editor'), { ...build, body: 'ready for you @noa — cc @ghost' });
  assert.equal(out.status, 201);
  assert.deepEqual(out.body.mentions.map((m) => m.userId), ['u-admin']);
  assert.deepEqual(out.body.unresolvedMentions, ['ghost']);

  const list = s.listComments(ctxFor('u-admin', 'admin'), { kind: 'build', id: 'b-1' });
  const [c] = list.body.comments;
  assert.equal(c.body, 'ready for you @noa — cc @ghost');
  assert.equal(c.authorId, 'u-editor');
  assert.equal(c.authorRole, 'editor');
  assert.deepEqual(c.mentions, [{ userId: 'u-admin', handle: 'noa' }], 'only the member is a mention row');
});

test('a thread read is scoped to its target: another build comments never leak into it', () => {
  const s = store();
  const mine = s.addComment(ctxFor('u-editor', 'editor'), { targetKind: 'build', targetId: 'b-1', body: 'about b-1' });
  s.addComment(ctxFor('u-editor', 'editor'), { targetKind: 'build', targetId: 'b-2', body: 'about b-2' });
  s.addComment(ctxFor('u-editor', 'editor'), { targetKind: 'version', targetId: 'b-1', body: 'about a version that shares an id' });
  s.react(ctxFor('u-editor', 'editor'), { commentId: mine.body.id, emoji: '🚀' });

  const list = s.listComments(ctxFor('u-editor', 'editor'), { kind: 'build', id: 'b-1' });
  assert.deepEqual(list.body.comments.map((c) => c.body), ['about b-1'], 'kind AND id must both scope the read');
  assert.equal(list.body.comments[0].reactions.length, 1, 'and its reactions come with it');

  const other = s.listComments(ctxFor('u-editor', 'editor'), { kind: 'build', id: 'b-2' });
  assert.deepEqual(other.body.comments[0].reactions, [], 'a reaction on another thread is not on this one');
});

test('a reaction toggles in the database rather than piling up', () => {
  const s = store();
  const c = s.addComment(ctxFor('u-editor', 'editor'), { ...build, body: 'nice' }).body.id;

  const add = s.react(ctxFor('u-admin', 'admin'), { commentId: c, emoji: '🎉' });
  assert.equal(add.body.op, 'add');
  assert.equal(add.body.count, 1);

  const same = s.react(ctxFor('u-owner', 'owner'), { commentId: c, emoji: '🎉' });
  assert.equal(same.body.count, 2, 'a different person adds to the same emoji');

  const off = s.react(ctxFor('u-admin', 'admin'), { commentId: c, emoji: '🎉' });
  assert.equal(off.body.op, 'remove', 'the same person reacting again takes it back');
  assert.equal(off.body.count, 1);

  const back = s.react(ctxFor('u-admin', 'admin'), { commentId: c, emoji: '🎉' });
  assert.equal(back.body.op, 'add');
  assert.equal(back.body.count, 2, 'and the row was really deleted, not merely hidden');

  const listed = s.listComments(ctxFor('u-editor', 'editor'), { kind: 'build', id: 'b-1' }).body.comments[0];
  assert.deepEqual(listed.reactions.map((r) => r.emoji), ['🎉']);
  assert.equal(listed.reactions[0].userIds.length, 2);
});

test('a review runs from pending to approved only when every reviewer has answered', () => {
  const s = store();
  const req = s.requestReview(ctxFor('u-editor', 'editor'), { ...build, reviewers: ['u-admin', 'u-owner'], note: 'please look' });
  assert.equal(req.status, 201);
  assert.equal(req.body.state, 'pending');
  const id = req.body.id;

  const first = s.approve(ctxFor('u-admin', 'admin'), { reviewId: id, verdict: 'approved' });
  assert.equal(first.body.state, 'pending', 'one of two is not approved');
  assert.deepEqual(first.body.awaiting, ['u-owner']);

  const second = s.approve(ctxFor('u-owner', 'owner'), { reviewId: id, verdict: 'approved' });
  assert.equal(second.body.state, 'approved');
  assert.equal(second.body.awaiting.length, 0);
  assert.equal(second.body.approvals.length, 2);

  const listed = s.listReviews(ctxFor('u-viewer', 'viewer'), build).body.reviews;
  assert.equal(listed.length, 1);
  assert.equal(listed[0].state, 'approved');
});

test('the requester cannot approve their own review through the store either', () => {
  const s = store();
  const id = s.requestReview(ctxFor('u-admin', 'admin'), { ...build, reviewers: ['u-owner'] }).body.id;
  const self = s.approve(ctxFor('u-admin', 'admin'), { reviewId: id, verdict: 'approved' });
  assert.equal(self.status, 403);
  assert.equal(self.body.error, 'self_approval');
  assert.equal(s.listReviews(ctxFor('u-admin', 'admin'), build).body.reviews[0].state, 'pending', 'and nothing was recorded');
});

test('a reviewer who changes their mind replaces their verdict instead of voting twice', () => {
  const s = store();
  const id = s.requestReview(ctxFor('u-editor', 'editor'), { ...build, reviewers: ['u-admin'] }).body.id;
  s.approve(ctxFor('u-admin', 'admin'), { reviewId: id, verdict: 'changes_requested' });
  const changed = s.approve(ctxFor('u-admin', 'admin'), { reviewId: id, verdict: 'approved' });
  assert.equal(changed.body.approvals.length, 1, 'one reviewer is one verdict row');
  assert.equal(changed.body.state, 'approved');
});

test('an approval on a review that does not exist is a 404, not a new review', () => {
  const s = store();
  const out = s.approve(ctxFor('u-admin', 'admin'), { reviewId: 'rev-nope', verdict: 'approved' });
  assert.equal(out.status, 404);
  assert.equal(s.listReviews(ctxFor('u-admin', 'admin'), {}).body.reviews.length, 0);
});

test('restoring appends: the row count goes UP and every earlier version is still there', () => {
  const s = store();
  const owner = ctxFor('u-owner', 'owner');
  const v1 = s.addVersion(ctxFor('u-editor', 'editor'), { label: 'first pass' }).body.version;
  const v2 = s.addVersion(ctxFor('u-editor', 'editor'), { label: 'second pass' }).body.version;
  assert.ok(v2.seq > v1.seq, 'sequence numbers go up');
  assert.equal(v2.parentId, v1.id);

  const before = s.listVersions(owner).body.versions;
  const restored = s.restoreVersion(owner, { versionId: v1.id });
  assert.equal(restored.status, 201);

  const after = s.listVersions(owner).body.versions;
  assert.equal(after.length, before.length + 1, 'a restore ADDS a version');
  assert.ok(after.every((v) => before.every((b) => b.id !== v.id || b.seq === v.seq)), 'no existing row was renumbered');
  for (const old of before) assert.ok(after.some((v) => v.id === old.id), `version ${old.label} must survive a restore`);

  const headV = after[after.length - 1];
  assert.equal(headV.kind, 'restore');
  assert.equal(headV.restoredFrom, v1.id);
  assert.equal(headV.parentId, v2.id, 'its parent is the head at the time, not what it restored');
  assert.ok(headV.seq > v2.seq);
  assert.equal(headV.authorId, 'u-owner', 'and the store records WHO rolled back');
  assert.deepEqual(s.listVersions(owner).body.lineage, [v1.id, v2.id, headV.id]);
});

test('an editor cannot restore through the store, and nothing is written when refused', () => {
  const s = store();
  const v1 = s.addVersion(ctxFor('u-editor', 'editor'), { label: 'first' }).body.version;
  const out = s.restoreVersion(ctxFor('u-editor', 'editor'), { versionId: v1.id });
  assert.equal(out.status, 403);
  assert.equal(out.body.error, 'insufficient_role');
  assert.equal(s.listVersions(ctxFor('u-owner', 'owner')).body.versions.length, 1, 'the refused restore wrote nothing');
});

test('the router refuses a path nobody defined and a method nobody defined', () => {
  const s = store();
  const ctx = ctxFor('u-owner', 'owner');
  assert.equal(s.handle('GET', '/collab/secrets', {}, ctx).status, 404);
  assert.equal(s.handle('DELETE', '/collab/comments', {}, ctx).status, 404);
  assert.equal(s.handle('POST', '/collab/versions', { label: 'via the router' }, ctx).status, 201);
  assert.equal(s.handle('get', '/collab/versions', {}, ctx).status, 200, 'the method match is case-insensitive');
});

test('the router carries the refusal through unchanged for a non-member', () => {
  const s = store();
  for (const [method, path] of [
    ['GET', '/collab/comments'],
    ['POST', '/collab/comments'],
    ['POST', '/collab/reactions'],
    ['GET', '/collab/reviews'],
    ['POST', '/collab/reviews'],
    ['POST', '/collab/reviews/approve'],
    ['GET', '/collab/versions'],
    ['POST', '/collab/versions'],
    ['POST', '/collab/versions/restore'],
    ['POST', '/collab/comments/resolve'],
  ]) {
    const out = s.handle(method, path, { targetKind: 'build', targetId: 'b-1', body: 'x', reviewers: ['u-admin'], label: 'x' }, STRANGER);
    assert.equal(out.status, 403, `${method} ${path} must refuse a non-member`);
    assert.equal(out.body.error, 'not_a_member');
  }
});
