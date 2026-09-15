// The inbox: rows, read state, counts. The policy that decides what becomes a row lives in
// `notifications.ts` and nothing here re-decides it.
//
// WHY D1 AND NOT A DURABLE OBJECT. The question this store answers is "what is waiting for ME",
// across every project I own and every project I was invited to. A Durable Object is one project,
// or one user's quota, and a DO structurally cannot answer a question about another DO - the same
// reason memory-store.ts and provenance.ts are here rather than in the session. An inbox assembled
// by fanning out to one DO per project would also be an inbox that gets slower as a person does
// more work, which is exactly backwards.
//
// THE PROPERTY THIS FILE EXISTS TO KEEP: every read and every write binds `recipient_id`, and the
// recipient id comes from the verified JWT rather than from the request. There is no route here
// that takes a recipient as a parameter. An inbox is the densest concentration of "who did what
// with whom" in the product - a mention tells you a person is on a project, a security event tells
// you when their key was rotated - and a listing that could be addressed by user id would be a
// directory of everyone's activity behind one bad `if`.
import type { Env } from './env';
import { oncePerIsolate } from './schema-once';
import {
  NOTIFICATION_KINDS,
  isNotificationKind,
  type NotificationKind,
  type NotificationSeverity,
  type PlannedNotification,
} from './notifications';

type Corpus = Pick<Env, 'CORPUS'>;

/**
 * How long a delivery can coalesce into an earlier one.
 *
 * Bounded rather than forever. A run that fails today and fails again next week is two things that
 * happened, and collapsing them into "2" on a row dated last Tuesday loses the newer one behind a
 * timestamp nobody scrolls back to.
 */
export const DEDUPE_WINDOW_MS = 24 * 3_600_000;

/** Read rows are kept this long so "what was I told last month" stays answerable, then dropped. */
export const RETAIN_READ_MS = 30 * 86_400_000;
/** Unread rows live longer, because nobody has seen them yet. */
export const RETAIN_UNREAD_MS = 90 * 86_400_000;

/**
 * The schema, asserted once per isolate rather than once per request.
 *
 * Every call used to issue this whole DDL list before the request could do anything — a
 * sequential round trip per statement to a single-threaded D1, for a schema unchanged since
 * the deployment booted. Under load D1 answers "exceeded its CPU time limit and was reset"
 * and the request 500s with an empty body, having written nothing. See schema-once.ts for
 * the two outages that came from exactly this.
 *
 * The key ignores `env` deliberately: one isolate serves one worker with one binding set, so
 * there is nothing for a second key to distinguish.
 */
export function ensureNotificationTables(env: Corpus): Promise<void> {
  return oncePerIsolate('notification', () => createNotificationTables(env));
}

async function createNotificationTables(env: Corpus): Promise<void> {
  await env.CORPUS.exec(
    `create table if not exists notifications(id text primary key, recipient_id text not null, kind text not null, severity text not null, title text not null, body text, project_id text, project_name text, subject text, href text not null, dedupe_key text not null, group_key text not null, created_at integer not null, updated_at integer not null, deliver_at integer not null, read_at integer, occurrences integer not null)`,
  );
  // Every listing binds the recipient and orders by when the row became visible, so the index
  // carries both. An index on `recipient_id` alone would still scan a heavy user's whole inbox to
  // answer "the newest twenty".
  await env.CORPUS.exec(`create index if not exists idx_notifications_inbox on notifications(recipient_id, deliver_at desc)`);
  // The coalescing lookup. `read_at` is in the key because a row the person has already read is
  // deliberately NOT a coalescing target - see `deliverNotification`.
  await env.CORPUS.exec(`create index if not exists idx_notifications_dedupe on notifications(dedupe_key, read_at)`);
}

export interface NotificationRow {
  id: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  projectId: string | null;
  projectName: string | null;
  subject: string | null;
  href: string;
  groupKey: string;
  createdAt: number;
  updatedAt: number;
  deliverAt: number;
  readAt: number | null;
  /** How many times this same thing has been reported. 1 for a row that happened once. */
  occurrences: number;
}

interface Row {
  id: string;
  recipient_id: string;
  kind: string;
  severity: string;
  title: string;
  body: string | null;
  project_id: string | null;
  project_name: string | null;
  subject: string | null;
  href: string;
  dedupe_key: string;
  group_key: string;
  created_at: number;
  updated_at: number;
  deliver_at: number;
  read_at: number | null;
  occurrences: number;
}

const COLS =
  'id, recipient_id, kind, severity, title, body, project_id, project_name, subject, href, dedupe_key, group_key, created_at, updated_at, deliver_at, read_at, occurrences';

const SEVERITIES: ReadonlySet<string> = new Set(['info', 'warn', 'urgent']);

/**
 * A stored row back into the typed shape, or null.
 *
 * `kind` and `severity` are re-validated on the way OUT as well as in. The columns are `text`, and
 * a row written by a previous version of this file, or by a migration, can hold anything; handing
 * a caller `row.kind as NotificationKind` would put a value `notificationSpec` throws on into a
 * listing. One unreadable row is dropped rather than taking the whole inbox down with it.
 */
function fromRow(r: Row): NotificationRow | null {
  if (!isNotificationKind(r.kind) || !SEVERITIES.has(r.severity)) return null;
  return {
    id: r.id,
    kind: r.kind,
    severity: r.severity as NotificationSeverity,
    title: r.title,
    body: r.body,
    projectId: r.project_id,
    projectName: r.project_name,
    subject: r.subject,
    href: r.href,
    groupKey: r.group_key,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deliverAt: r.deliver_at,
    readAt: r.read_at,
    occurrences: r.occurrences,
  };
}

export type DeliverOutcome =
  | { ok: true; created: true; id: string }
  | { ok: true; created: false; id: string; occurrences: number };

/**
 * Put one planned notification in the inbox - or fold it into the one already there.
 *
 * COALESCING RULES, and each one is a decision someone can disagree with:
 *
 *   - Only an UNREAD row absorbs a repeat. Once a person has read "your run failed", the next
 *     failure of that same run is news again; bumping a counter on a row they have already
 *     dismissed is a notification that was delivered to a place nobody looks.
 *   - Only within `DEDUPE_WINDOW_MS`. See the constant.
 *   - The row keeps its ID, its CREATED_AT and its DELIVER_AT. That is what makes a repeat feel
 *     like the same line getting louder rather than a new line jumping the queue - the same rule
 *     `toast-model.ts` already applies to the transient stack, so the inbox and the toasts agree
 *     about what "the same event twice" looks like.
 *   - The TITLE and BODY are refreshed to the newest. The dedupe key contains the subject, so
 *     these two deliveries are about literally the same thing, and the newer text is the more
 *     accurate description of its current state.
 *
 * THE `recipient_id = ?` IN THE LOOKUP BELOW IS REDUNDANT, AND IS KEPT. Removing it turns nothing
 * red, and that is the F-58 reading that means leave it alone rather than the one that means the
 * test is vacuous: the property it names - one person's delivery never folds into another's row -
 * is covered exactly by `dedupeKeyFor`, which puts the recipient id at the front of the key being
 * bound. Two mechanisms, one property, and the other one is pinned by its own test in
 * notifications.test.mjs. What the clause buys is that the day somebody shortens the dedupe key,
 * this query is still scoped.
 */
export async function deliverNotification(env: Corpus, n: PlannedNotification, opts: { now?: number } = {}): Promise<DeliverOutcome> {
  const now = opts.now ?? n.createdAt;
  const existing = await env.CORPUS.prepare(
    `select ${COLS} from notifications where dedupe_key = ? and recipient_id = ? and read_at is null and created_at > ? order by created_at desc limit 1`,
  )
    .bind(n.dedupeKey, n.recipientId, now - DEDUPE_WINDOW_MS)
    .first<Row>();

  if (existing) {
    const occurrences = existing.occurrences + 1;
    await env.CORPUS.prepare(`update notifications set occurrences = ?, updated_at = ?, title = ?, body = ? where id = ?`)
      .bind(occurrences, now, n.title, n.body, existing.id)
      .run();
    return { ok: true, created: false, id: existing.id, occurrences };
  }

  const id = crypto.randomUUID();
  await env.CORPUS.prepare(
    `insert into notifications(${COLS}) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      id,
      n.recipientId,
      n.kind,
      n.severity,
      n.title,
      n.body,
      n.projectId,
      n.projectName,
      n.subject,
      n.href,
      n.dedupeKey,
      n.groupKey,
      n.createdAt,
      now,
      n.deliverAt,
      null,
      1,
    )
    .run();
  return { ok: true, created: true, id };
}

export interface InboxQuery {
  limit?: number;
  unreadOnly?: boolean;
  now?: number;
  /**
   * Include rows whose delivery time has not arrived yet - the ones quiet hours or a digest are
   * holding. Off by default: a held notification that showed up in the inbox immediately would
   * make quiet hours a label rather than a behaviour.
   */
  includeHeld?: boolean;
}

export const INBOX_LIMIT_DEFAULT = 30;
export const INBOX_LIMIT_MAX = 100;

/** One person's inbox. The recipient is bound; there is no variant of this that takes a list. */
export async function listNotifications(env: Corpus, recipientId: string, q: InboxQuery = {}): Promise<NotificationRow[]> {
  if (typeof recipientId !== 'string' || recipientId.trim() === '') return [];
  const now = q.now ?? Date.now();
  const limit = Number.isFinite(q.limit) ? Math.min(INBOX_LIMIT_MAX, Math.max(1, Math.trunc(q.limit as number))) : INBOX_LIMIT_DEFAULT;
  const clauses = ['recipient_id = ?'];
  const binds: (string | number)[] = [recipientId];
  if (!q.includeHeld) {
    clauses.push('deliver_at <= ?');
    binds.push(now);
  }
  if (q.unreadOnly) clauses.push('read_at is null');
  const res = await env.CORPUS.prepare(
    `select ${COLS} from notifications where ${clauses.join(' and ')} order by deliver_at desc, created_at desc limit ?`,
  )
    .bind(...binds, limit)
    .all<Row>();
  const out: NotificationRow[] = [];
  for (const r of res.results ?? []) {
    const n = fromRow(r);
    if (n) out.push(n);
  }
  return out;
}

/**
 * The badge.
 *
 * Counts only what has actually ARRIVED: a row held by quiet hours is not yet a thing the person
 * has been told, and a badge that counts it makes quiet hours into "we will not show you the text
 * but we will show you the number", which is the annoying half of being interrupted with none of
 * the useful half.
 */
export async function unreadCount(env: Corpus, recipientId: string, opts: { now?: number } = {}): Promise<number> {
  if (typeof recipientId !== 'string' || recipientId.trim() === '') return 0;
  const now = opts.now ?? Date.now();
  const row = await env.CORPUS.prepare(
    `select count(*) as n from notifications where recipient_id = ? and read_at is null and deliver_at <= ?`,
  )
    .bind(recipientId, now)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

/**
 * Collapsed view: one line per (kind, project), with how many and how many unread.
 *
 * Grouping is computed from the stored `group_key` rather than re-derived here, so the key one
 * row was written with is the key it is grouped under even if the policy changes shape later.
 */
export interface NotificationGroup {
  groupKey: string;
  kind: NotificationKind;
  projectId: string | null;
  projectName: string | null;
  total: number;
  unread: number;
  latestAt: number;
}

export async function groupNotifications(env: Corpus, recipientId: string, opts: { now?: number; limit?: number } = {}): Promise<NotificationGroup[]> {
  if (typeof recipientId !== 'string' || recipientId.trim() === '') return [];
  const now = opts.now ?? Date.now();
  const limit = Number.isFinite(opts.limit) ? Math.min(INBOX_LIMIT_MAX, Math.max(1, Math.trunc(opts.limit as number))) : INBOX_LIMIT_DEFAULT;
  const res = await env.CORPUS.prepare(
    `select group_key, kind, project_id, max(project_name) as project_name, sum(occurrences) as total, sum(case when read_at is null then 1 else 0 end) as unread, max(deliver_at) as latest_at from notifications where recipient_id = ? and deliver_at <= ? group by group_key, kind, project_id order by latest_at desc limit ?`,
  )
    .bind(recipientId, now, limit)
    .all<{ group_key: string; kind: string; project_id: string | null; project_name: string | null; total: number; unread: number; latest_at: number }>();
  const out: NotificationGroup[] = [];
  for (const r of res.results ?? []) {
    if (!isNotificationKind(r.kind)) continue;
    out.push({
      groupKey: r.group_key,
      kind: r.kind,
      projectId: r.project_id,
      projectName: r.project_name,
      total: Number(r.total),
      unread: Number(r.unread),
      latestAt: Number(r.latest_at),
    });
  }
  return out;
}

export interface MarkReadRequest {
  /** Specific rows, or every delivered row when `all` is set. */
  ids?: readonly unknown[];
  all?: boolean;
  now?: number;
}

/**
 * Mark rows read. Returns how many rows actually moved.
 *
 * THE COUNT IS READ FROM THE WRITE, not from the length of the id list. "Marked 4 read" when the
 * ids belonged to somebody else's inbox is the exact failure this store's recipient binding exists
 * to prevent, and reporting the request back as if it were the result would hide it.
 *
 * `all` marks only what has been DELIVERED. Marking a held notification read would consume it
 * before the person could ever have seen it.
 */
export async function markRead(env: Corpus, recipientId: string, req: MarkReadRequest): Promise<number> {
  if (typeof recipientId !== 'string' || recipientId.trim() === '') return 0;
  const now = req.now ?? Date.now();
  if (req.all) {
    const res = await env.CORPUS.prepare(`update notifications set read_at = ? where recipient_id = ? and read_at is null and deliver_at <= ?`)
      .bind(now, recipientId, now)
      .run();
    return changesOf(res);
  }
  const ids = (req.ids ?? []).filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64).slice(0, INBOX_LIMIT_MAX);
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const res = await env.CORPUS.prepare(
    `update notifications set read_at = ? where recipient_id = ? and read_at is null and id in (${placeholders})`,
  )
    .bind(now, recipientId, ...ids)
    .run();
  return changesOf(res);
}

function changesOf(res: unknown): number {
  const changes = (res as { meta?: { changes?: number } })?.meta?.changes;
  return typeof changes === 'number' && Number.isFinite(changes) ? changes : 0;
}

/** The sweeper. Read rows go first and sooner; nothing unread is dropped inside three months. */
export async function pruneNotifications(env: Corpus, opts: { now?: number } = {}): Promise<number> {
  const now = opts.now ?? Date.now();
  const read = await env.CORPUS.prepare(`delete from notifications where read_at is not null and read_at < ?`).bind(now - RETAIN_READ_MS).run();
  const old = await env.CORPUS.prepare(`delete from notifications where created_at < ?`).bind(now - RETAIN_UNREAD_MS).run();
  return changesOf(read) + changesOf(old);
}

/** The kinds, for a settings page that must not hand-maintain a second copy of the list. */
export const INBOX_KINDS: readonly NotificationKind[] = NOTIFICATION_KINDS;
