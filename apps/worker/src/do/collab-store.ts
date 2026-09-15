/**
 * THE COLLABORATION STORE — the only thing in this cluster that writes.
 *
 * Every decision has already been made by the time control reaches a method here:
 * collab-threads.ts and version-history.ts turn an actor plus a request into a plan or a refusal,
 * and this file's job is to put the plan in SQLite and read it back. That is deliberate. A policy
 * that can only be reached by standing up a Durable Object is a policy nothing will ever feed a
 * hostile input to, and the hostile input is the entire subject.
 *
 * WHAT IS STILL LOAD-BEARING HERE, AND THEREFORE TESTED HERE:
 *
 *   - Every entry point re-asks the capability question. The route layer already asked it; this
 *     asks again against the actor it was handed, because "two checks" and "one check and one
 *     assumption" look identical right up until someone adds a third caller.
 *   - Reads are gated too. A comment thread is content, and a non-member reading a thread is the
 *     same leak as a non-member reading the transcript it hangs off.
 *   - `seq` is allocated by reading the head and writing the successor with NO await in between.
 *     A Durable Object is single-threaded, so that pair is atomic; an `await` between them would
 *     not be, and two concurrent restores would both mint the same sequence number.
 *   - A toggle is a read-then-write of the same row, for the same reason.
 *
 * The `sql` handle is injected rather than reached for, exactly like persist.ts takes its `put`.
 * The tests drive this class over a real SQLite database, so the schema, the indexes and every
 * query are the ones that ship.
 */
import {
  asActor,
  planComment,
  planCommentResolve,
  planReaction,
  planReviewRequest,
  planApproval,
  reviewState,
  COMMENT_TARGETS,
  type Actor,
  type Refusal,
} from '../collab-threads.ts';
import { planVersion, planRestore, lineage, head, type Version } from '../version-history.ts';
import { can, capabilitiesFor } from '../collab.ts';

/** The shape of `DurableObjectState.storage.sql`, narrowed to what this file uses. */
export interface SqlLike {
  exec(query: string, ...bindings: unknown[]): { toArray(): Record<string, unknown>[]; one(): Record<string, unknown> };
}

export interface CollabContext {
  /** Already validated by the caller; null means "not a member of this project". */
  actor: Actor | null;
  /** Project members, for resolving mentions and checking reviewers. Never from the client. */
  directory?: readonly unknown[];
  nowMs: number;
}

export interface StoreResult {
  status: number;
  body: Record<string, unknown>;
}

const deny = (r: Refusal): StoreResult => ({ status: r.status, body: { error: r.reason } });
const NOT_MEMBER: StoreResult = { status: 403, body: { error: 'not_a_member' } };

const SCHEMA = `
  create table if not exists collab_comments(
    id text primary key,
    target_kind text not null,
    target_id text not null,
    parent_id text,
    author_id text not null,
    author_role text not null,
    body text not null,
    created_at integer not null,
    resolved_at integer,
    resolved_by text);
  create index if not exists collab_comments_target on collab_comments(target_kind, target_id, created_at);
  create table if not exists collab_mentions(
    comment_id text not null, user_id text not null, handle text not null,
    primary key (comment_id, user_id));
  create table if not exists collab_reactions(
    comment_id text not null, user_id text not null, emoji text not null, created_at integer not null,
    primary key (comment_id, user_id, emoji));
  create table if not exists collab_reviews(
    id text primary key,
    target_kind text not null, target_id text not null,
    requested_by text not null, note text not null default '',
    created_at integer not null, closed_at integer);
  create index if not exists collab_reviews_target on collab_reviews(target_kind, target_id, created_at);
  create table if not exists collab_review_reviewers(
    review_id text not null, user_id text not null, primary key (review_id, user_id));
  create table if not exists collab_approvals(
    review_id text not null, user_id text not null, verdict text not null, created_at integer not null,
    primary key (review_id, user_id));
  create table if not exists collab_versions(
    id text primary key, seq integer not null, label text not null,
    author_id text not null, kind text not null, parent_id text, restored_from text,
    created_at integer not null);
  create index if not exists collab_versions_seq on collab_versions(seq);
`;

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export class CollabStore {
  /** Not a parameter property: node's type-stripping test runner cannot parse those, and this
   *  class is driven directly by tests/collab-store.test.mjs over a real SQLite database. */
  private readonly sql: SqlLike;

  constructor(sql: SqlLike) {
    this.sql = sql;
    this.sql.exec(SCHEMA);
  }

  // ------------------------------------------------------------------ comments

  private commentRow(id: string) {
    const rows = this.sql.exec(`select * from collab_comments where id = ?`, id).toArray();
    return rows[0] ?? null;
  }

  /**
   * Reactions for one TARGET's comments, joined in SQL rather than filtered in JS.
   *
   * The first version of this read every reaction row in the project and dropped the ones that did
   * not belong — which is a full scan per thread render, and worse, it is the shape where a
   * missing filter reads as an empty result rather than as an error. The join makes the scoping
   * the database's job and the thread's own rows the only ones that can come back.
   */
  private reactionsFor(targetKind: string, targetId: string): Map<string, { emoji: string; userIds: string[] }[]> {
    const out = new Map<string, { emoji: string; userIds: string[] }[]>();
    const rows = this.sql
      .exec(
        `select r.comment_id as comment_id, r.user_id as user_id, r.emoji as emoji
         from collab_reactions r join collab_comments c on c.id = r.comment_id
         where c.target_kind = ? and c.target_id = ?`,
        targetKind,
        targetId,
      )
      .toArray();
    for (const r of rows) {
      const cid = String(r.comment_id);
      const list = out.get(cid) ?? [];
      const hit = list.find((x) => x.emoji === r.emoji);
      if (hit) hit.userIds.push(String(r.user_id));
      else list.push({ emoji: String(r.emoji), userIds: [String(r.user_id)] });
      out.set(cid, list);
    }
    return out;
  }

  listComments(ctx: CollabContext, target: { kind: unknown; id: unknown }): StoreResult {
    if (ctx.actor === null) return NOT_MEMBER;
    // Reads are gated: a thread is content, and it hangs off content.
    if (!can(ctx.actor.role, 'read')) return { status: 403, body: { error: 'insufficient_role' } };
    if (typeof target.kind !== 'string' || !(COMMENT_TARGETS as readonly string[]).includes(target.kind)) {
      return { status: 400, body: { error: 'unknown_target_kind' } };
    }
    if (typeof target.id !== 'string' || target.id.length === 0) return { status: 400, body: { error: 'missing_target_id' } };

    const rows = this.sql
      .exec(
        `select * from collab_comments where target_kind = ? and target_id = ? order by created_at asc limit 500`,
        target.kind,
        target.id,
      )
      .toArray();
    const reactions = this.reactionsFor(target.kind, target.id);
    const mentions = this.sql
      .exec(
        `select m.comment_id as comment_id, m.user_id as user_id, m.handle as handle
         from collab_mentions m join collab_comments c on c.id = m.comment_id
         where c.target_kind = ? and c.target_id = ?`,
        target.kind,
        target.id,
      )
      .toArray();

    return {
      status: 200,
      body: {
        comments: rows.map((r) => ({
          id: String(r.id),
          targetKind: String(r.target_kind),
          targetId: String(r.target_id),
          parentId: r.parent_id === null ? null : String(r.parent_id),
          authorId: String(r.author_id),
          authorRole: String(r.author_role),
          body: String(r.body),
          createdAt: Number(r.created_at),
          resolvedAt: r.resolved_at === null ? null : Number(r.resolved_at),
          resolvedBy: r.resolved_by === null ? null : String(r.resolved_by),
          mentions: mentions.filter((m) => m.comment_id === r.id).map((m) => ({ userId: String(m.user_id), handle: String(m.handle) })),
          reactions: reactions.get(String(r.id)) ?? [],
        })),
        /** So a client can grey out its own controls without guessing at the rules. */
        capabilities: capabilitiesFor(ctx.actor.role),
      },
    };
  }

  addComment(ctx: CollabContext, input: Record<string, unknown>): StoreResult {
    const plan = planComment(ctx.actor, input as never, {
      directory: ctx.directory,
      threadExists: (id) => this.commentRow(id) !== null,
    });
    if (plan.ok !== true) return deny(plan);
    const actor = ctx.actor as Actor;

    const id = newId('cmt');
    this.sql.exec(
      `insert into collab_comments(id, target_kind, target_id, parent_id, author_id, author_role, body, created_at, resolved_at, resolved_by)
       values(?,?,?,?,?,?,?,?,null,null)`,
      id,
      plan.target.kind,
      plan.target.id,
      plan.parentId,
      actor.userId,
      actor.role,
      plan.body,
      ctx.nowMs,
    );
    for (const m of plan.mentions) {
      this.sql.exec(`insert or replace into collab_mentions(comment_id, user_id, handle) values(?,?,?)`, id, m.userId, m.handle);
    }
    return {
      status: 201,
      body: {
        id,
        mentions: plan.mentions.map((m) => ({ userId: m.userId, handle: m.handle })),
        // Reported so the author can see their typo, never delivered anywhere.
        unresolvedMentions: plan.unresolvedMentions,
      },
    };
  }

  resolveComment(ctx: CollabContext, input: Record<string, unknown>): StoreResult {
    const id = typeof input.commentId === 'string' ? input.commentId : '';
    const row = id ? this.commentRow(id) : null;
    const comment = row === null ? null : { id, authorId: String(row.author_id), resolvedAt: row.resolved_at === null ? null : Number(row.resolved_at) };
    const plan = planCommentResolve(ctx.actor, comment, input.resolved as boolean);
    if (plan.ok !== true) return deny(plan);
    const actor = ctx.actor as Actor;
    this.sql.exec(
      `update collab_comments set resolved_at = ?, resolved_by = ? where id = ?`,
      plan.resolved ? ctx.nowMs : null,
      plan.resolved ? actor.userId : null,
      id,
    );
    return { status: 200, body: { id, resolved: plan.resolved } };
  }

  react(ctx: CollabContext, input: Record<string, unknown>): StoreResult {
    const commentId = typeof input.commentId === 'string' ? input.commentId : '';
    // The toggle is decided from the row that is there RIGHT NOW, and written with no await in
    // between — see the header.
    const already =
      ctx.actor !== null && commentId !== ''
        ? this.sql
            .exec(
              `select count(*) as n from collab_reactions where comment_id = ? and user_id = ? and emoji = ?`,
              commentId,
              ctx.actor.userId,
              String(input.emoji ?? ''),
            )
            .one().n
        : 0;
    const plan = planReaction(ctx.actor, input as never, {
      commentExists: (id) => this.commentRow(id) !== null,
      alreadyReacted: Number(already) > 0,
    });
    if (plan.ok !== true) return deny(plan);
    const actor = ctx.actor as Actor;

    if (plan.op === 'add') {
      this.sql.exec(
        `insert or replace into collab_reactions(comment_id, user_id, emoji, created_at) values(?,?,?,?)`,
        plan.commentId,
        actor.userId,
        plan.emoji,
        ctx.nowMs,
      );
    } else {
      this.sql.exec(`delete from collab_reactions where comment_id = ? and user_id = ? and emoji = ?`, plan.commentId, actor.userId, plan.emoji);
    }
    const n = this.sql.exec(`select count(*) as n from collab_reactions where comment_id = ? and emoji = ?`, plan.commentId, plan.emoji).one().n;
    return { status: 200, body: { commentId: plan.commentId, emoji: plan.emoji, op: plan.op, count: Number(n) } };
  }

  // ------------------------------------------------------------------ reviews

  private reviewRecord(id: string) {
    const rows = this.sql.exec(`select * from collab_reviews where id = ?`, id).toArray();
    const row = rows[0];
    if (!row) return null;
    const reviewers = this.sql
      .exec(`select user_id from collab_review_reviewers where review_id = ?`, id)
      .toArray()
      .map((r) => String(r.user_id));
    return {
      id,
      requestedBy: String(row.requested_by),
      reviewers,
      closedAt: row.closed_at === null ? null : Number(row.closed_at),
      targetKind: String(row.target_kind),
      targetId: String(row.target_id),
      note: String(row.note ?? ''),
      createdAt: Number(row.created_at),
    };
  }

  private approvalsFor(reviewId: string) {
    return this.sql
      .exec(`select user_id, verdict, created_at from collab_approvals where review_id = ?`, reviewId)
      .toArray()
      .map((r) => ({ userId: String(r.user_id), verdict: String(r.verdict), createdAt: Number(r.created_at) }));
  }

  listReviews(ctx: CollabContext, target: { kind?: unknown; id?: unknown } = {}): StoreResult {
    if (ctx.actor === null) return NOT_MEMBER;
    if (!can(ctx.actor.role, 'read')) return { status: 403, body: { error: 'insufficient_role' } };
    const rows =
      typeof target.kind === 'string' && typeof target.id === 'string'
        ? this.sql.exec(`select id from collab_reviews where target_kind = ? and target_id = ? order by created_at desc limit 100`, target.kind, target.id).toArray()
        : this.sql.exec(`select id from collab_reviews order by created_at desc limit 100`).toArray();

    return {
      status: 200,
      body: {
        reviews: rows.map((r) => {
          const rec = this.reviewRecord(String(r.id))!;
          const approvals = this.approvalsFor(rec.id);
          return { ...rec, approvals, ...reviewState(rec, approvals) };
        }),
      },
    };
  }

  requestReview(ctx: CollabContext, input: Record<string, unknown>): StoreResult {
    const plan = planReviewRequest(ctx.actor, input as never, { directory: ctx.directory });
    if (plan.ok !== true) return deny(plan);
    const actor = ctx.actor as Actor;
    const id = newId('rev');
    this.sql.exec(
      `insert into collab_reviews(id, target_kind, target_id, requested_by, note, created_at, closed_at) values(?,?,?,?,?,?,null)`,
      id,
      plan.targetKind,
      plan.targetId,
      actor.userId,
      plan.note,
      ctx.nowMs,
    );
    for (const r of plan.reviewers) {
      this.sql.exec(`insert or replace into collab_review_reviewers(review_id, user_id) values(?,?)`, id, r);
    }
    const rec = this.reviewRecord(id)!;
    return { status: 201, body: { ...rec, approvals: [], ...reviewState(rec, []) } };
  }

  approve(ctx: CollabContext, input: Record<string, unknown>): StoreResult {
    const reviewId = typeof input.reviewId === 'string' ? input.reviewId : '';
    const record = reviewId ? this.reviewRecord(reviewId) : null;
    const plan = planApproval(ctx.actor, record, input.verdict);
    if (plan.ok !== true) return deny(plan);
    const actor = ctx.actor as Actor;
    // `insert or replace`: a reviewer who changes their mind replaces their own verdict rather
    // than adding a second one. reviewState takes the latest either way; two rows would still be
    // a lie about how many people answered.
    this.sql.exec(
      `insert or replace into collab_approvals(review_id, user_id, verdict, created_at) values(?,?,?,?)`,
      reviewId,
      actor.userId,
      plan.verdict,
      ctx.nowMs,
    );
    const rec = this.reviewRecord(reviewId)!;
    const approvals = this.approvalsFor(reviewId);
    return { status: 200, body: { ...rec, approvals, ...reviewState(rec, approvals) } };
  }

  // ------------------------------------------------------------------ versions

  private versions(): Version[] {
    return this.sql
      .exec(`select * from collab_versions order by seq asc`)
      .toArray()
      .map((r) => ({
        id: String(r.id),
        seq: Number(r.seq),
        label: String(r.label),
        authorId: String(r.author_id),
        kind: String(r.kind) as Version['kind'],
        parentId: r.parent_id === null ? null : String(r.parent_id),
        restoredFrom: r.restored_from === null ? null : String(r.restored_from),
        createdAt: Number(r.created_at),
      }));
  }

  listVersions(ctx: CollabContext): StoreResult {
    if (ctx.actor === null) return NOT_MEMBER;
    if (!can(ctx.actor.role, 'read')) return { status: 403, body: { error: 'insufficient_role' } };
    const all = this.versions();
    const h = head(all);
    return {
      status: 200,
      body: { versions: all, head: h, lineage: h === null ? [] : lineage(all, h.id).map((v) => v.id) },
    };
  }

  private insertVersion(v: Omit<Version, 'id'>): Version {
    const id = newId('ver');
    this.sql.exec(
      `insert into collab_versions(id, seq, label, author_id, kind, parent_id, restored_from, created_at) values(?,?,?,?,?,?,?,?)`,
      id,
      v.seq,
      v.label,
      v.authorId,
      v.kind,
      v.parentId,
      v.restoredFrom,
      v.createdAt,
    );
    return { id, ...v };
  }

  addVersion(ctx: CollabContext, input: Record<string, unknown>): StoreResult {
    // Read the head and write its successor with nothing awaited in between — see the header.
    const plan = planVersion(ctx.actor, { label: input.label, kind: input.kind, nowMs: ctx.nowMs }, this.versions());
    if (plan.ok !== true) return deny(plan);
    return { status: 201, body: { version: this.insertVersion(plan.version) } };
  }

  restoreVersion(ctx: CollabContext, input: Record<string, unknown>): StoreResult {
    const all = this.versions();
    const plan = planRestore(ctx.actor, input.versionId, all, ctx.nowMs);
    if (plan.ok !== true) return deny(plan);
    const written = this.insertVersion(plan.version);
    return { status: 201, body: { version: written, restored: plan.restoring } };
  }

  // ------------------------------------------------------------------ routing

  /**
   * One entry point, so the Durable Object's `fetch` gains a delegation rather than nine branches.
   * Returns data; the caller decides what a Response looks like.
   */
  handle(method: string, path: string, body: Record<string, unknown>, ctx: CollabContext): StoreResult {
    const route = `${method.toUpperCase()} ${path}`;
    switch (route) {
      case 'GET /collab/comments':
        return this.listComments(ctx, { kind: body.targetKind, id: body.targetId });
      case 'POST /collab/comments':
        return this.addComment(ctx, body);
      case 'POST /collab/comments/resolve':
        return this.resolveComment(ctx, body);
      case 'POST /collab/reactions':
        return this.react(ctx, body);
      case 'GET /collab/reviews':
        return this.listReviews(ctx, { kind: body.targetKind, id: body.targetId });
      case 'POST /collab/reviews':
        return this.requestReview(ctx, body);
      case 'POST /collab/reviews/approve':
        return this.approve(ctx, body);
      case 'GET /collab/versions':
        return this.listVersions(ctx);
      case 'POST /collab/versions':
        return this.addVersion(ctx, body);
      case 'POST /collab/versions/restore':
        return this.restoreVersion(ctx, body);
      default:
        return { status: 404, body: { error: 'not_found' } };
    }
  }
}

/** Convenience for callers that hold raw, unvalidated identity parts. */
export function collabContext(userId: unknown, role: unknown, nowMs: number, directory?: readonly unknown[]): CollabContext {
  return { actor: asActor(userId, role), directory, nowMs };
}
