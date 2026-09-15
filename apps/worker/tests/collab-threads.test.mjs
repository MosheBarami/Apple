/**
 * COMMENTS, MENTIONS, REACTIONS, REVIEW REQUESTS AND APPROVALS.
 *
 * Every rule in collab-threads.ts is a refusal, so every test here feeds the thing that must be
 * refused and watches it be refused — a stranger with no membership, a viewer who may only read,
 * an emoji nobody allowlisted, a reviewer who is not in the project, a requester signing off
 * their own request. The healthy path is asserted too, in the same tests, so a rule that has
 * eaten the feature it guards shows up as a failure rather than as a green run.
 *
 * Run with:  node --test tests/collab-threads.test.mjs        (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  asActor,
  parseMentions,
  resolveMentions,
  planComment,
  planCommentResolve,
  planReaction,
  planReviewRequest,
  planApproval,
  reviewState,
  REACTIONS,
  MAX_COMMENT_CHARS,
  MAX_REVIEWERS,
} from '../src/collab-threads.ts';

const OWNER = { userId: 'u-owner', role: 'owner' };
const ADMIN = { userId: 'u-admin', role: 'admin' };
const EDITOR = { userId: 'u-editor', role: 'editor' };
const COMMENTER = { userId: 'u-commenter', role: 'commenter' };
const VIEWER = { userId: 'u-viewer', role: 'viewer' };

const DIRECTORY = [
  { userId: 'u-owner', handle: 'maya', role: 'owner' },
  { userId: 'u-admin', handle: 'noa', role: 'admin' },
  { userId: 'u-editor', handle: 'tal', role: 'editor' },
  { userId: 'u-commenter', handle: 'yon', role: 'commenter' },
  { userId: 'u-viewer', handle: 'gil', role: 'viewer' },
];

const target = { targetKind: 'build', targetId: 'b-1' };

// ---------------------------------------------------------------------------------------------
// Who is even here
// ---------------------------------------------------------------------------------------------

test('a non-member has no actor, and every planner refuses a null actor', () => {
  // asActor is the only door. A stranger arrives with no role at all, and this is what that looks like.
  assert.equal(asActor('u-stranger', undefined), null);
  assert.equal(asActor('u-stranger', null), null);
  assert.equal(asActor('u-stranger', 'superuser'), null, 'a role nobody defined must not build an actor');
  assert.equal(asActor('', 'editor'), null);
  assert.equal(asActor(null, 'editor'), null);

  const stranger = asActor('u-stranger', undefined);
  for (const [name, out] of [
    ['comment', planComment(stranger, { ...target, body: 'hi' }, { directory: DIRECTORY })],
    ['react', planReaction(stranger, { commentId: 'c-1', emoji: '👍' })],
    ['review', planReviewRequest(stranger, { ...target, reviewers: ['u-admin'] }, { directory: DIRECTORY })],
    ['approve', planApproval(stranger, { id: 'r-1', requestedBy: 'u-editor', reviewers: ['u-stranger'], closedAt: null }, 'approved')],
    ['resolve', planCommentResolve(stranger, { id: 'c-1', authorId: 'u-editor', resolvedAt: null }, true)],
  ]) {
    assert.equal(out.ok, false, `${name} must refuse a non-member`);
    assert.equal(out.status, 403);
    assert.equal(out.reason, 'not_a_member');
  }
});

// ---------------------------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------------------------

test('a viewer cannot comment, and is refused for being a viewer rather than for their text', () => {
  const out = planComment(VIEWER, { ...target, body: 'looks good to me' }, { directory: DIRECTORY });
  assert.equal(out.ok, false);
  assert.equal(out.status, 403);
  assert.equal(out.reason, 'insufficient_role');
  // and the role one step up CAN, or the guard has eaten the feature
  assert.equal(planComment(COMMENTER, { ...target, body: 'looks good to me' }, { directory: DIRECTORY }).ok, true);
});

test('an empty body is refused and an oversized body is refused rather than truncated', () => {
  assert.equal(planComment(EDITOR, { ...target, body: '   \n\t ' }).reason, 'empty_body');
  assert.equal(planComment(EDITOR, { ...target, body: '' }).reason, 'empty_body');
  assert.equal(planComment(EDITOR, { ...target, body: 42 }).reason, 'missing_body');

  const overflowing = 'x'.repeat(MAX_COMMENT_CHARS + 1);
  const out = planComment(EDITOR, { ...target, body: overflowing });
  assert.equal(out.ok, false, 'a body over the cap must be refused');
  assert.equal(out.reason, 'body_too_long');
  // Exactly at the cap is fine — a cap that refuses its own boundary is off by one.
  const edge = planComment(EDITOR, { ...target, body: 'x'.repeat(MAX_COMMENT_CHARS) });
  assert.equal(edge.ok, true);
  assert.equal(edge.body.length, MAX_COMMENT_CHARS, 'and it must arrive whole, not shortened');
});

test('a target kind nobody defined is refused', () => {
  for (const kind of ['secret', 'Message', '', null, 7, 'project ']) {
    assert.equal(planComment(EDITOR, { targetKind: kind, targetId: 'x', body: 'hi' }).reason, 'unknown_target_kind');
  }
  assert.equal(planComment(EDITOR, { targetKind: 'project', targetId: '', body: 'hi' }).reason, 'missing_target_id');
});

test('a reply to a comment that is gone is refused, not promoted to a new thread', () => {
  const ctx = { directory: DIRECTORY, threadExists: (id) => id === 'c-live' };
  const orphan = planComment(EDITOR, { ...target, body: 'replying', parentId: 'c-deleted' }, ctx);
  assert.equal(orphan.ok, false);
  assert.equal(orphan.status, 404);
  assert.equal(orphan.reason, 'parent_not_found');

  const good = planComment(EDITOR, { ...target, body: 'replying', parentId: 'c-live' }, ctx);
  assert.equal(good.ok, true);
  assert.equal(good.parentId, 'c-live');
});

// ---------------------------------------------------------------------------------------------
// Mentions
// ---------------------------------------------------------------------------------------------

test('a mention of a NON-MEMBER notifies nobody', () => {
  // The refusal that matters: a mention must not reach outside the project, and must not tell
  // the author that the handle they typed belongs to a real account somewhere.
  const out = planComment(ADMIN, { ...target, body: 'hey @tal and @notinvited, look at this' }, { directory: DIRECTORY });
  assert.equal(out.ok, true);
  assert.deepEqual(out.mentions.map((m) => m.userId), ['u-editor'], 'only the member named is notified');
  assert.deepEqual(out.unresolvedMentions, ['notinvited'], 'the stranger is reported back, never notified');
  assert.ok(!out.mentions.some((m) => m.handle === 'notinvited'));
});

test('a mention of yourself does not notify you, and a repeated mention notifies once', () => {
  const out = planComment(ADMIN, { ...target, body: '@noa @tal @TAL @tal — over to you' }, { directory: DIRECTORY });
  assert.equal(out.ok, true);
  assert.deepEqual(out.mentions.map((m) => m.userId), ['u-editor'], 'self excluded, duplicates collapsed');
});

test('mention parsing does not fire on email addresses or paths', () => {
  assert.deepEqual(parseMentions('write to tal@example.com about it'), []);
  assert.deepEqual(parseMentions('see docs/@internal/readme'), []);
  assert.deepEqual(parseMentions('@tal look at tal@example.com'), ['tal']);
  assert.deepEqual(parseMentions(null), []);
  assert.deepEqual(parseMentions(12), []);
});

test('a directory row with an unreadable role is not a member, so it cannot be mentioned', () => {
  const dodgy = [{ userId: 'u-ghost', handle: 'ghost', role: 'superuser' }, { userId: '', handle: 'blank', role: 'editor' }];
  const { mentions, unresolved } = resolveMentions('@ghost @blank', dodgy);
  assert.deepEqual(mentions, []);
  assert.deepEqual(unresolved.sort(), ['blank', 'ghost']);
});

test('resolving a thread: the author may, a stranger to it may not, an approver may', () => {
  const comment = { id: 'c-1', authorId: EDITOR.userId, resolvedAt: null };
  assert.equal(planCommentResolve(EDITOR, comment, true).ok, true, 'the author may close their own');
  const other = planCommentResolve(COMMENTER, comment, true);
  assert.equal(other.ok, false, 'a commenter must not close someone else thread');
  assert.equal(other.reason, 'insufficient_role');
  assert.equal(planCommentResolve(ADMIN, comment, true).ok, true, 'an approver may');
  assert.equal(planCommentResolve(VIEWER, { ...comment, authorId: VIEWER.userId }, true).ok, false, 'a viewer may not, even their own');
  assert.equal(planCommentResolve(ADMIN, null, true).reason, 'comment_not_found');
});

// ---------------------------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------------------------

test('an emoji nobody allowlisted is refused', () => {
  for (const hostile of ['💣', '<script>', '', 'thumbsup', '👍👍', null, 7, {}]) {
    const out = planReaction(COMMENTER, { commentId: 'c-1', emoji: hostile });
    assert.equal(out.ok, false, `${JSON.stringify(String(hostile))} must not be storable as a reaction`);
    assert.equal(out.reason, 'unknown_reaction');
  }
  // and every allowlisted one works, or the list is decoration
  for (const emoji of REACTIONS) {
    assert.equal(planReaction(COMMENTER, { commentId: 'c-1', emoji }).ok, true);
  }
});

test('a viewer cannot react, and a reaction on a comment that is gone is refused', () => {
  const v = planReaction(VIEWER, { commentId: 'c-1', emoji: '👍' });
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'insufficient_role');

  const missing = planReaction(EDITOR, { commentId: 'c-gone', emoji: '👍' }, { commentExists: (id) => id === 'c-1' });
  assert.equal(missing.status, 404);
  assert.equal(missing.reason, 'comment_not_found');
});

test('reacting again with the same emoji takes it back', () => {
  assert.equal(planReaction(EDITOR, { commentId: 'c-1', emoji: '🎉' }, { alreadyReacted: false }).op, 'add');
  assert.equal(planReaction(EDITOR, { commentId: 'c-1', emoji: '🎉' }, { alreadyReacted: true }).op, 'remove');
});

// ---------------------------------------------------------------------------------------------
// Review requests
// ---------------------------------------------------------------------------------------------

test('a reviewer who is not a member is refused by name, not silently dropped', () => {
  const out = planReviewRequest(EDITOR, { ...target, reviewers: ['u-admin', 'u-stranger'] }, { directory: DIRECTORY });
  assert.equal(out.ok, false, 'the whole request must be refused');
  assert.equal(out.reason, 'reviewer_not_a_member');
});

test('a reviewer who could never approve is refused, because that request could never complete', () => {
  const out = planReviewRequest(EDITOR, { ...target, reviewers: ['u-viewer'] }, { directory: DIRECTORY });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'reviewer_cannot_approve');
  // an admin CAN approve, so the same request with an admin stands
  assert.equal(planReviewRequest(EDITOR, { ...target, reviewers: ['u-admin'] }, { directory: DIRECTORY }).ok, true);
});

test('a commenter cannot open a review request; an editor can', () => {
  const c = planReviewRequest(COMMENTER, { ...target, reviewers: ['u-admin'] }, { directory: DIRECTORY });
  assert.equal(c.ok, false);
  assert.equal(c.reason, 'insufficient_role');
  assert.equal(planReviewRequest(EDITOR, { ...target, reviewers: ['u-admin'] }, { directory: DIRECTORY }).ok, true);
});

test('an empty or absurd reviewer list is refused, and duplicates collapse', () => {
  assert.equal(planReviewRequest(EDITOR, { ...target, reviewers: [] }, { directory: DIRECTORY }).reason, 'no_reviewers');
  assert.equal(planReviewRequest(EDITOR, { ...target, reviewers: 'u-admin' }, { directory: DIRECTORY }).reason, 'missing_reviewers');
  assert.equal(planReviewRequest(EDITOR, { ...target, reviewers: ['u-admin', ''] }, { directory: DIRECTORY }).reason, 'bad_reviewer');
  assert.equal(planReviewRequest(EDITOR, { ...target, reviewers: [EDITOR.userId] }, { directory: DIRECTORY }).reason, 'self_review');

  const dup = planReviewRequest(EDITOR, { ...target, reviewers: ['u-admin', 'u-admin', 'u-owner'] }, { directory: DIRECTORY });
  assert.equal(dup.ok, true);
  assert.deepEqual(dup.reviewers, ['u-admin', 'u-owner']);

  const many = Array.from({ length: MAX_REVIEWERS + 1 }, (_, i) => `u-${i}`);
  const dir = many.map((userId, i) => ({ userId, handle: `h${i}`, role: 'admin' }));
  assert.equal(planReviewRequest(EDITOR, { ...target, reviewers: many }, { directory: dir }).reason, 'too_many_reviewers');
});

// ---------------------------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------------------------

const request = (over = {}) => ({ id: 'r-1', requestedBy: EDITOR.userId, reviewers: [ADMIN.userId, OWNER.userId], closedAt: null, ...over });

test('the requester cannot approve their own request, even from the reviewer list', () => {
  const selfListed = request({ requestedBy: ADMIN.userId, reviewers: [ADMIN.userId, OWNER.userId] });
  const out = planApproval(ADMIN, selfListed, 'approved');
  assert.equal(out.ok, false);
  assert.equal(out.status, 403);
  assert.equal(out.reason, 'self_approval');
});

test('somebody who was not asked cannot approve', () => {
  const out = planApproval({ userId: 'u-other-admin', role: 'admin' }, request(), 'approved');
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'not_a_reviewer');
});

test('a closed request takes no more verdicts, and an unknown verdict is refused', () => {
  assert.equal(planApproval(ADMIN, request({ closedAt: 1 }), 'approved').reason, 'review_closed');
  for (const v of ['lgtm', 'APPROVED', '', null, 1, {}]) {
    assert.equal(planApproval(ADMIN, request(), v).reason, 'unknown_verdict');
  }
  assert.equal(planApproval(ADMIN, null, 'approved').reason, 'review_not_found');
  assert.equal(planApproval(ADMIN, request(), 'approved').ok, true);
  assert.equal(planApproval(OWNER, request(), 'changes_requested').ok, true);
});

test('one approval of two is still pending — the claim is the relationship, not the count', () => {
  const r = request();
  const half = reviewState(r, [{ userId: ADMIN.userId, verdict: 'approved' }]);
  assert.equal(half.state, 'pending', 'a review is not approved until every reviewer has answered');
  assert.deepEqual(half.awaiting, [OWNER.userId]);
  assert.ok(half.approvedBy.length < r.reviewers.length);

  const full = reviewState(r, [
    { userId: ADMIN.userId, verdict: 'approved' },
    { userId: OWNER.userId, verdict: 'approved' },
  ]);
  assert.equal(full.state, 'approved');
  assert.equal(full.awaiting.length, 0);
  assert.equal(full.approvedBy.length, r.reviewers.length);
});

test('one changes_requested blocks, and a later approval from someone else does not erase it', () => {
  const r = request();
  const blocked = reviewState(r, [
    { userId: ADMIN.userId, verdict: 'changes_requested' },
    { userId: OWNER.userId, verdict: 'approved' },
  ]);
  assert.equal(blocked.state, 'changes_requested');
  assert.deepEqual(blocked.changesRequestedBy, [ADMIN.userId]);
  // the reviewer who blocked can change their own mind, and then it clears
  const cleared = reviewState(r, [
    { userId: ADMIN.userId, verdict: 'changes_requested' },
    { userId: OWNER.userId, verdict: 'approved' },
    { userId: ADMIN.userId, verdict: 'approved' },
  ]);
  assert.equal(cleared.state, 'approved', 'the latest verdict per reviewer is the one that counts');
});

test('a verdict from somebody who is not a reviewer cannot complete a review', () => {
  // Defence in depth: planApproval already refuses this, so a row like it should not exist.
  // If one does, it must not be the thing that tips a review to approved.
  const r = request();
  const forged = reviewState(r, [
    { userId: ADMIN.userId, verdict: 'approved' },
    { userId: 'u-nobody', verdict: 'approved' },
    { userId: 'u-nobody-2', verdict: 'approved' },
  ]);
  assert.equal(forged.state, 'pending');
  assert.deepEqual(forged.awaiting, [OWNER.userId]);
  assert.ok(!forged.approvedBy.includes('u-nobody'));
});

test('a verdict string nobody defined is ignored by the tally rather than counted', () => {
  const r = request();
  const junk = reviewState(r, [
    { userId: ADMIN.userId, verdict: 'approved' },
    { userId: OWNER.userId, verdict: 'sure why not' },
  ]);
  assert.equal(junk.state, 'pending');
  assert.deepEqual(junk.awaiting, [OWNER.userId]);
});
