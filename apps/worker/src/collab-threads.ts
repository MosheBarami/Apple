/**
 * COMMENTS, MENTIONS, REACTIONS, REVIEW REQUESTS AND APPROVALS — as decisions, not as SQL.
 *
 * Everything here is a pure function of its inputs that returns either a PLAN (what the store
 * should write) or a REFUSAL (status and reason). The store in do/collab-store.ts does the
 * writing and nothing else. That split is the same one persist.ts made and for the same reason:
 * a policy reachable only by standing up a Durable Object is a policy no test will feed a
 * hostile input to, and these are exactly the paths where the hostile input is the whole point.
 *
 * THE REFUSALS, AND WHY EACH ONE EXISTS:
 *
 *   - Capability first, always. `planComment` asks `can(actor.role, 'comment')` before it looks
 *     at the body, so a viewer's comment is refused on the grounds that they are a viewer rather
 *     than on the grounds that their text was short.
 *   - A mention of a NON-MEMBER resolves to nobody. The directory holds members only, so an
 *     `@stranger` in a comment produces no notification target — a mention must never be a way to
 *     tell someone outside the project that the project exists, nor a way to push a notification
 *     at a person who cannot open the thing it points at.
 *   - A reaction emoji is ALLOWLISTED. It arrives as a string from a browser; `Record<Emoji, T>`
 *     is a compile-time promise and this is a runtime boundary.
 *   - A review request naming a reviewer who cannot approve is REFUSED rather than quietly
 *     trimmed. A request that can never reach `approved` is worse than no request: it looks
 *     pending forever and nobody can tell why.
 *   - Self-approval is refused, and the refusal is about the REQUESTER, not about the reviewer
 *     list — a requester who put themselves on their own list must not be able to sign it off.
 *   - A body over the cap is refused, never truncated. A silently shortened comment is a
 *     different statement attributed to the person who did not make it.
 */
import { can, asCollabRole, type CollabRole } from './collab.ts';

export interface Actor {
  userId: string;
  role: CollabRole;
}

/** Build an actor from untrusted parts, or null. Every entry point takes this path. */
export function asActor(userId: unknown, role: unknown): Actor | null {
  const r = asCollabRole(role);
  if (r === null) return null;
  if (typeof userId !== 'string' || userId.trim().length === 0) return null;
  return { userId, role: r };
}

export interface Refusal {
  ok: false;
  status: 400 | 403 | 404 | 409;
  reason: string;
}
const refuse = (status: Refusal['status'], reason: string): Refusal => ({ ok: false, status, reason });

/** A member, as the mention resolver and the reviewer check see them. */
export interface DirectoryEntry {
  userId: string;
  /** What `@…` matches, without the `@`. Case-insensitive. */
  handle: string;
  role: CollabRole;
}

function normaliseDirectory(directory: readonly unknown[] | undefined): DirectoryEntry[] {
  const out: DirectoryEntry[] = [];
  for (const raw of directory ?? []) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as Record<string, unknown>;
    const role = asCollabRole(e.role);
    if (role === null) continue; // a member row we cannot read is not a member we can notify
    if (typeof e.userId !== 'string' || e.userId.trim().length === 0) continue;
    if (typeof e.handle !== 'string' || e.handle.trim().length === 0) continue;
    out.push({ userId: e.userId, handle: e.handle, role });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------------------------

/** What a comment can hang off. Anything else is a 400 — see the Record<Union,T> note above. */
export const COMMENT_TARGETS = ['project', 'message', 'build', 'version'] as const;
export type CommentTargetKind = (typeof COMMENT_TARGETS)[number];
const TARGET_SET: ReadonlySet<string> = new Set(COMMENT_TARGETS);

export const MAX_COMMENT_CHARS = 4000;

export interface CommentTarget {
  kind: CommentTargetKind;
  id: string;
}

export interface CommentPlan {
  ok: true;
  body: string;
  target: CommentTarget;
  parentId: string | null;
  /** Members the body named, deduplicated, never including the author. */
  mentions: DirectoryEntry[];
  /** Handles that matched nobody in the project. Reported, never notified. */
  unresolvedMentions: string[];
}

/** `@handle` — letters, digits, dot, dash, underscore. Bounded so a wall of text is not a mention. */
const MENTION_RE = /(^|[^\w@/])@([a-zA-Z0-9][a-zA-Z0-9._-]{1,31})/g;

/**
 * Every `@handle` in the body, in order, deduplicated case-insensitively.
 * Resolution is a separate step, because "what was written" and "who that is" are different
 * questions and only the second one needs the project's member list.
 */
export function parseMentions(body: unknown): string[] {
  if (typeof body !== 'string' || body.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of body.matchAll(MENTION_RE)) {
    const handle = m[2];
    if (handle === undefined) continue; // the group is not optional; the narrowing is
    const key = handle.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(handle);
  }
  return out;
}

export function resolveMentions(
  body: unknown,
  directory: readonly unknown[] | undefined,
  exclude?: string,
): { mentions: DirectoryEntry[]; unresolved: string[] } {
  const members = normaliseDirectory(directory);
  const byHandle = new Map<string, DirectoryEntry>();
  for (const m of members) byHandle.set(m.handle.toLowerCase(), m);

  const mentions: DirectoryEntry[] = [];
  const unresolved: string[] = [];
  const claimed = new Set<string>();
  for (const handle of parseMentions(body)) {
    const hit = byHandle.get(handle.toLowerCase());
    // A handle nobody in this project answers to is NOT a notification. See the header.
    if (!hit) { unresolved.push(handle); continue; }
    if (exclude !== undefined && hit.userId === exclude) continue; // nobody is notified of their own comment
    if (claimed.has(hit.userId)) continue;
    claimed.add(hit.userId);
    mentions.push(hit);
  }
  return { mentions, unresolved };
}

export interface CommentInput {
  body: unknown;
  targetKind: unknown;
  targetId: unknown;
  parentId?: unknown;
}

export function planComment(
  actor: Actor | null,
  input: CommentInput,
  ctx: { directory?: readonly unknown[]; threadExists?: (parentId: string) => boolean } = {},
): CommentPlan | Refusal {
  if (actor === null) return refuse(403, 'not_a_member');
  if (!can(actor.role, 'comment')) return refuse(403, 'insufficient_role');

  if (typeof input.targetKind !== 'string' || !TARGET_SET.has(input.targetKind)) {
    return refuse(400, 'unknown_target_kind');
  }
  if (typeof input.targetId !== 'string' || input.targetId.trim().length === 0) {
    return refuse(400, 'missing_target_id');
  }
  if (typeof input.body !== 'string') return refuse(400, 'missing_body');
  const body = input.body.trim();
  if (body.length === 0) return refuse(400, 'empty_body');
  // Refused, not truncated: see the header.
  if (body.length > MAX_COMMENT_CHARS) return refuse(400, 'body_too_long');

  let parentId: string | null = null;
  if (input.parentId !== undefined && input.parentId !== null) {
    if (typeof input.parentId !== 'string' || input.parentId.trim().length === 0) return refuse(400, 'bad_parent');
    // A reply to a comment that is gone must not silently become a new top-level thread.
    if (ctx.threadExists && !ctx.threadExists(input.parentId)) return refuse(404, 'parent_not_found');
    parentId = input.parentId;
  }

  const { mentions, unresolved } = resolveMentions(body, ctx.directory, actor.userId);
  return {
    ok: true,
    body,
    target: { kind: input.targetKind as CommentTargetKind, id: input.targetId },
    parentId,
    mentions,
    unresolvedMentions: unresolved,
  };
}

/**
 * Who may mark a thread resolved: its author, or anyone who can approve.
 * A viewer cannot, and a passing editor cannot close someone else's open question.
 */
export function planCommentResolve(
  actor: Actor | null,
  comment: { id: string; authorId: string; resolvedAt: number | null } | null,
  resolved: boolean,
): { ok: true; resolved: boolean } | Refusal {
  if (actor === null) return refuse(403, 'not_a_member');
  if (comment === null) return refuse(404, 'comment_not_found');
  if (typeof resolved !== 'boolean') return refuse(400, 'bad_resolved_flag');
  const own = comment.authorId === actor.userId;
  if (!own && !can(actor.role, 'approve')) return refuse(403, 'insufficient_role');
  if (!can(actor.role, 'comment')) return refuse(403, 'insufficient_role');
  return { ok: true, resolved };
}

// ---------------------------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------------------------

/** The allowlist. A browser sends this string; nothing here trusts it. */
export const REACTIONS = ['👍', '👎', '🎉', '❤️', '🚀', '👀', '😄'] as const;
export type Reaction = (typeof REACTIONS)[number];
const REACTION_SET: ReadonlySet<string> = new Set(REACTIONS);

export function asReaction(value: unknown): Reaction | null {
  return typeof value === 'string' && REACTION_SET.has(value) ? (value as Reaction) : null;
}

export interface ReactionPlan {
  ok: true;
  emoji: Reaction;
  commentId: string;
  /** Reacting twice with the same emoji takes it back, which is what every product means by this. */
  op: 'add' | 'remove';
}

export function planReaction(
  actor: Actor | null,
  input: { commentId: unknown; emoji: unknown },
  ctx: { commentExists?: (id: string) => boolean; alreadyReacted?: boolean } = {},
): ReactionPlan | Refusal {
  if (actor === null) return refuse(403, 'not_a_member');
  if (!can(actor.role, 'react')) return refuse(403, 'insufficient_role');
  const emoji = asReaction(input.emoji);
  if (emoji === null) return refuse(400, 'unknown_reaction');
  if (typeof input.commentId !== 'string' || input.commentId.trim().length === 0) return refuse(400, 'missing_comment');
  if (ctx.commentExists && !ctx.commentExists(input.commentId)) return refuse(404, 'comment_not_found');
  return { ok: true, emoji, commentId: input.commentId, op: ctx.alreadyReacted ? 'remove' : 'add' };
}

// ---------------------------------------------------------------------------------------------
// Review requests and approvals
// ---------------------------------------------------------------------------------------------

export const REVIEW_TARGETS = ['build', 'version'] as const;
export type ReviewTargetKind = (typeof REVIEW_TARGETS)[number];
const REVIEW_TARGET_SET: ReadonlySet<string> = new Set(REVIEW_TARGETS);

export const MAX_REVIEWERS = 10;
export const MAX_REVIEW_NOTE_CHARS = 1000;

export interface ReviewRequestPlan {
  ok: true;
  targetKind: ReviewTargetKind;
  targetId: string;
  reviewers: string[];
  note: string;
}

export function planReviewRequest(
  actor: Actor | null,
  input: { targetKind: unknown; targetId: unknown; reviewers: unknown; note?: unknown },
  ctx: { directory?: readonly unknown[] } = {},
): ReviewRequestPlan | Refusal {
  if (actor === null) return refuse(403, 'not_a_member');
  if (!can(actor.role, 'request_review')) return refuse(403, 'insufficient_role');
  if (typeof input.targetKind !== 'string' || !REVIEW_TARGET_SET.has(input.targetKind)) {
    return refuse(400, 'unknown_target_kind');
  }
  if (typeof input.targetId !== 'string' || input.targetId.trim().length === 0) return refuse(400, 'missing_target_id');
  if (!Array.isArray(input.reviewers)) return refuse(400, 'missing_reviewers');

  const members = normaliseDirectory(ctx.directory);
  const byId = new Map(members.map((m) => [m.userId, m]));

  const reviewers: string[] = [];
  for (const raw of input.reviewers) {
    if (typeof raw !== 'string' || raw.trim().length === 0) return refuse(400, 'bad_reviewer');
    if (raw === actor.userId) return refuse(400, 'self_review');
    const member = byId.get(raw);
    // A stranger cannot be a reviewer, and is refused by NAME rather than dropped: a request
    // silently missing the person the requester meant to ask is a request nobody is waiting on.
    if (!member) return refuse(400, 'reviewer_not_a_member');
    // Nor can a member who could never approve — that request can never reach `approved`.
    if (!can(member.role, 'approve')) return refuse(400, 'reviewer_cannot_approve');
    if (!reviewers.includes(raw)) reviewers.push(raw);
  }
  if (reviewers.length === 0) return refuse(400, 'no_reviewers');
  if (reviewers.length > MAX_REVIEWERS) return refuse(400, 'too_many_reviewers');

  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length > MAX_REVIEW_NOTE_CHARS) return refuse(400, 'note_too_long');

  return { ok: true, targetKind: input.targetKind as ReviewTargetKind, targetId: input.targetId, reviewers, note };
}

export const REVIEW_VERDICTS = ['approved', 'changes_requested'] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];
const VERDICT_SET: ReadonlySet<string> = new Set(REVIEW_VERDICTS);

export interface ReviewRequestRecord {
  id: string;
  requestedBy: string;
  reviewers: readonly string[];
  /** Set once the request is withdrawn or superseded; a closed request takes no more verdicts. */
  closedAt: number | null;
}

export function planApproval(
  actor: Actor | null,
  request: ReviewRequestRecord | null,
  verdict: unknown,
): { ok: true; verdict: ReviewVerdict } | Refusal {
  if (actor === null) return refuse(403, 'not_a_member');
  if (request === null) return refuse(404, 'review_not_found');
  if (typeof verdict !== 'string' || !VERDICT_SET.has(verdict)) return refuse(400, 'unknown_verdict');
  if (request.closedAt !== null) return refuse(409, 'review_closed');
  // The self-approval refusal is about the REQUESTER, so putting yourself on your own list does
  // not smuggle it back in.
  if (request.requestedBy === actor.userId) return refuse(403, 'self_approval');
  if (!request.reviewers.includes(actor.userId)) return refuse(403, 'not_a_reviewer');
  if (!can(actor.role, 'approve')) return refuse(403, 'insufficient_role');
  return { ok: true, verdict: verdict as ReviewVerdict };
}

export interface ApprovalRecord {
  userId: string;
  verdict: unknown;
}

export interface ReviewState {
  state: 'pending' | 'approved' | 'changes_requested';
  approvedBy: string[];
  changesRequestedBy: string[];
  /** Reviewers who have not answered. `approved` is only reachable when this is empty. */
  awaiting: string[];
}

/**
 * Where a review stands.
 *
 * `approved` requires EVERY reviewer, which is the relationship that matters: one approval out of
 * two is still pending, and a state machine that reports otherwise has quietly redefined what the
 * requester asked for. A single `changes_requested` dominates — it is a blocking answer, and
 * later approvals do not erase it.
 *
 * Verdicts from people who are not on the reviewer list are IGNORED rather than counted. Nothing
 * should be able to write one, and if something does it must not be able to complete a review.
 */
export function reviewState(request: ReviewRequestRecord, approvals: readonly ApprovalRecord[]): ReviewState {
  const reviewers = request.reviewers.filter((r) => typeof r === 'string' && r.length > 0);
  const latest = new Map<string, ReviewVerdict>();
  for (const a of approvals ?? []) {
    if (!a || typeof a.userId !== 'string') continue;
    if (!reviewers.includes(a.userId)) continue;
    if (typeof a.verdict !== 'string' || !VERDICT_SET.has(a.verdict)) continue;
    latest.set(a.userId, a.verdict as ReviewVerdict); // last write per reviewer wins
  }
  const approvedBy = reviewers.filter((r) => latest.get(r) === 'approved');
  const changesRequestedBy = reviewers.filter((r) => latest.get(r) === 'changes_requested');
  const awaiting = reviewers.filter((r) => !latest.has(r));

  const state: ReviewState['state'] =
    changesRequestedBy.length > 0 ? 'changes_requested' : awaiting.length === 0 && reviewers.length > 0 ? 'approved' : 'pending';
  return { state, approvedBy, changesRequestedBy, awaiting };
}
