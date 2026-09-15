/**
 * The inbox, as decisions rather than as markup.
 *
 * The worker has had a complete notification subsystem for a while — a store, dedupe, grouping,
 * quiet hours, an unread count and a deep link per row — and nothing in this app ever asked it for
 * anything. `components/notification-inbox.tsx` is the surface; this is everything about it that
 * can be wrong in a way a test can catch, kept out of the JSX so it is exercised rather than
 * eyeballed.
 *
 * THE WIRE TYPES LIVE HERE TOO, and `lib/api.ts` imports them from here rather than declaring its
 * own. Same arrangement as components/roadmap/model.ts: a field renamed on the worker is renamed
 * once, in the file the tests load, and every caller still typechecks against that one definition.
 */
import { safeInternalPath } from './safe-redirect.ts';

/**
 * The kinds the worker can emit.
 *
 * A SECOND COPY OF THE SERVER'S LIST, and the only reason it is tolerable is that
 * tests/notification-inbox.test.mjs reads apps/worker/src/notifications.ts and fails if the two
 * disagree in either direction. The labels themselves cannot come from the server — it ships wire
 * names, not sentences — so the list they are keyed on has to be pinned instead.
 */
export const NOTIFICATION_KINDS = [
  'run_complete',
  'run_failed',
  'automation_failed',
  'approval_requested',
  'mention',
  'integration_failure',
  'usage_threshold',
  'billing_issue',
  'security_event',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type NotificationSeverity = 'info' | 'warn' | 'urgent';

/** One row of somebody's inbox, exactly as apps/worker/src/notification-store.ts serves it. */
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
  /** How many times the same thing has been reported. 1 for something that happened once. */
  occurrences: number;
}

/** The collapsed view: one line per (kind, project). */
export interface NotificationGroup {
  groupKey: string;
  kind: NotificationKind;
  projectId: string | null;
  projectName: string | null;
  total: number;
  unread: number;
  latestAt: number;
}

export interface InboxResponse {
  items: NotificationRow[];
  unread: number;
  groups: NotificationGroup[];
  /** The kind allowlist, shipped so a settings page need not keep a second copy. */
  kinds: string[];
}

export interface MarkReadResult {
  marked: number;
  unread: number;
}

/* --------------------------------------------------------------------------- labels --- */

export const KIND_LABELS: Readonly<Record<NotificationKind, string>> = {
  run_complete: 'Build finished',
  run_failed: 'Build failed',
  automation_failed: 'A scheduled job failed',
  approval_requested: 'A review was asked of you',
  mention: 'Someone mentioned you',
  integration_failure: 'A connection failed',
  usage_threshold: 'Running low on Credits',
  billing_issue: 'A billing problem',
  security_event: 'Something changed on your account',
};

/**
 * The two kinds that cannot be switched off, and the sentence to print beside them.
 *
 * The server refuses to mute these with the reason `mandatory`, so a settings page that offered
 * the switch would show a control that silently does nothing. Pinned against the worker's specs by
 * the test — this is a copy of a decision made there.
 */
export const MANDATORY_KINDS: readonly NotificationKind[] = ['billing_issue', 'security_event'];
export const MANDATORY_REASON = 'Always on — this one is about your account, not about a build.';

/** The label for a kind, or the kind itself. Never an empty row. */
export function kindLabel(kind: unknown): string {
  if (typeof kind !== 'string' || kind === '') return 'Notification';
  return (KIND_LABELS as Record<string, string>)[kind] ?? kind;
}

export function severityClass(severity: unknown): string {
  const s = severity === 'urgent' || severity === 'warn' ? severity : 'info';
  return `gx-note--${s}`;
}

/* ------------------------------------------------------------------- where a row goes --- */

/** The router's basename. `app.tsx` mounts <BrowserRouter basename="/app">. */
export const APP_BASENAME = '/app';

/**
 * The in-app route a stored `href` opens, or null.
 *
 * The worker stores hrefs WITH the basename on them (`/app/projects/x`) because they are also
 * valid as ordinary links. react-router's `navigate` takes a path WITHOUT it, so handing it the
 * stored value lands on `/app/app/projects/x` — a 404 reached by clicking a link the server got
 * right.
 *
 * Two things this must not do, and the naive `href.slice('/app'.length)` does both:
 *
 *   - match the basename as four characters rather than as a path segment, which turns `/appendix`
 *     into `endix` and resolves it against wherever the user happens to be standing;
 *   - pass anything through that is not one of this app's own paths. The rows come from our own
 *     server, but `href` is a text column, and react-router 6.30 treats `/\host` and `//host` as
 *     protocol-relative — so this goes through the same sink validator the login redirect uses.
 */
export function routePathFor(href: unknown): string | null {
  if (typeof href !== 'string' || href === '') return null;
  // Judge the WHOLE href first: a backslash or a control character has to be refused before any
  // prefix is taken off it, not after.
  if (safeInternalPath(href, '') !== href) return null;
  if (href !== APP_BASENAME && !href.startsWith(`${APP_BASENAME}/`)) return null;
  const rest = href.slice(APP_BASENAME.length);
  if (rest === '' || rest === '/') return '/';
  return safeInternalPath(rest, '') === rest ? rest : null;
}

/* ---------------------------------------------------------------------------- badge --- */

export const BADGE_MAX = 99;

/**
 * What the superscript on the bell says, or null for no badge at all.
 *
 * NULL AT ZERO. A "0" beside a bell is a notification about there being no notifications, and it
 * makes the one state that should be silent the loudest thing in the rail.
 */
export function badgeText(unread: unknown): string | null {
  if (typeof unread !== 'number' || !Number.isFinite(unread) || unread < 1) return null;
  const n = Math.trunc(unread);
  return n > BADGE_MAX ? `${BADGE_MAX}+` : String(n);
}

/* --------------------------------------------------------------------- marking read --- */

export interface MarkReadRequest {
  ids?: readonly string[];
  all?: boolean;
}

/**
 * The cached payload after a mark-read write landed.
 *
 * THE COUNT COMES FROM THE SERVER, not from arithmetic here. `markRead` deliberately does not
 * touch a row held by quiet hours — marking it read would consume a notification the person was
 * never shown — so "mark all" can legitimately leave unread above zero. A client that sets the
 * badge to 0 because it asked for everything shows a cleared badge over an inbox that still has
 * something waiting in it.
 *
 * Applied locally rather than by refetching so the badge moves on the same frame as the click; the
 * poll corrects anything this got wrong within the minute.
 */
export function markedInbox(
  data: InboxResponse,
  req: MarkReadRequest,
  result: MarkReadResult,
  now: number,
): InboxResponse {
  const ids = new Set(req.all ? [] : (req.ids ?? []));
  const items = data.items.map((r) => {
    if (r.readAt !== null) return r;
    if (!req.all && !ids.has(r.id)) return r;
    return { ...r, readAt: now };
  });
  // Recomputed from the rows this client holds, so the collapsed heading and the list under it
  // cannot report different numbers of unread things.
  const unreadByGroup = new Map<string, number>();
  for (const r of items) {
    if (r.readAt === null) unreadByGroup.set(r.groupKey, (unreadByGroup.get(r.groupKey) ?? 0) + 1);
  }
  const groups = data.groups.map((g) => ({ ...g, unread: unreadByGroup.get(g.groupKey) ?? 0 }));
  return { ...data, items, groups, unread: result.unread };
}

/** The rows behind one collapsed line. */
export function rowsOfGroup(items: readonly NotificationRow[], groupKey: string): NotificationRow[] {
  return items.filter((r) => r.groupKey === groupKey);
}

/** The ids of everything in a group that is still unread — what a group's own "read" button sends. */
export function unreadIdsOf(items: readonly NotificationRow[]): string[] {
  return items.filter((r) => r.readAt === null).map((r) => r.id);
}
