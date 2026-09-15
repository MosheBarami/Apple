/**
 * What has happened to this ACCOUNT, as opposed to what has happened to the work.
 *
 * The worker has written this record faithfully for a while: `securityNotice` in
 * apps/worker/src/index.ts emits a `security_event` on every API-key mint, rotation and revocation
 * and on every membership change, `notifications.ts` marks that kind urgent and makes it the one
 * kind nobody may mute, and `GET /api/notifications` returns it bound to the caller's own JWT.
 * Nothing in this app had ever asked for it. A security log the account holder cannot open is the
 * same thing as no security log — it is the failure `securityNotice`'s own comment says it exists
 * to fix, reintroduced one layer up.
 *
 * WHY THIS IS A MODULE AND NOT A `.filter()` IN THE PAGE. Two of the four decisions here are ones a
 * page gets wrong quietly:
 *
 *   * AN EMPTY LIST AND A FAILED READ ARE DIFFERENT SENTENCES. `items.length === 0` is true when
 *     nothing has happened and equally true when the request never arrived, and the reassuring
 *     sentence is the wrong one to print by accident. `historyState` refuses to answer 'empty'
 *     unless it actually saw a well-formed, empty list.
 *
 *   * MARKING READ MUST NAME ONLY WHAT WAS SHOWN. `/api/notifications/read` takes ids or `all`.
 *     Passing `all` because the security panel is open would clear run failures the person never
 *     saw, from a panel that is not about runs.
 *
 * Kept free of React so tests/security-history.test.mjs can feed it hostile input without a DOM.
 */

/** The one kind this panel is about. Pinned against the worker's allowlist by the test. */
export const SECURITY_KIND = 'security_event';

/** One delivered row, as `GET /api/notifications` returns it. */
export interface InboxItem {
  id: string;
  kind: string;
  severity: string;
  title: string;
  body: string | null;
  subject: string | null;
  href: string;
  createdAt: number;
  updatedAt: number;
  deliverAt: number;
  readAt: number | null;
  /** How many times this same thing was reported inside the store's dedupe window. */
  occurrences: number;
}

export interface InboxResponse {
  items: InboxItem[];
  unread: number;
  kinds?: readonly string[];
}

/**
 * A row this page is willing to render.
 *
 * The worker re-validates `kind` and `severity` on the way out of D1 because a `text` column can
 * hold anything; the same argument applies one hop further along, where the payload has also
 * crossed a network and a JSON parse. A row missing an id cannot be marked read, and a row missing
 * a title renders as a blank line in a list whose whole job is to be legible.
 */
function usable(v: unknown): v is InboxItem {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    r.id !== '' &&
    typeof r.kind === 'string' &&
    typeof r.title === 'string' &&
    r.title.trim() !== '' &&
    typeof r.deliverAt === 'number' &&
    Number.isFinite(r.deliverAt)
  );
}

/**
 * The security events in a payload, newest first.
 *
 * Sorted here rather than trusted from the server: the inbox route orders by `deliver_at desc`
 * today, and a panel that silently depends on that would reorder itself the day someone adds a
 * second ordering for a different consumer.
 */
export function securityEvents(items: unknown): InboxItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter(usable)
    .filter((i) => i.kind === SECURITY_KIND)
    .sort((a, b) => b.deliverAt - a.deliverAt);
}

/** The ids of the unread security rows — and nothing else in the inbox. See the header. */
export function unreadSecurityIds(items: unknown): string[] {
  return securityEvents(items)
    .filter((i) => i.readAt === null || i.readAt === undefined)
    .map((i) => i.id);
}

/**
 * "Happened 3 times" — or nothing at all for a row that happened once.
 *
 * The store coalesces by subject inside a day, so `occurrences` is how many times the same thing
 * was reported. A bare number beside a security event is worse than silence.
 */
export function occurrenceNote(item: { occurrences?: unknown }): string | null {
  const n = typeof item?.occurrences === 'number' ? item.occurrences : 1;
  return n > 1 ? `Happened ${n} times` : null;
}

export type HistoryState =
  | { state: 'loading' }
  /** We could not read the history. NOT the same claim as "nothing has happened". */
  | { state: 'unavailable'; message: string }
  | { state: 'empty' }
  | { state: 'items'; items: InboxItem[]; unread: number };

/**
 * The four things this panel can honestly be, from the three things react-query reports.
 *
 * `unavailable` is reachable three ways, and all three are the same sentence to the reader: the
 * request failed, the answer was not shaped like an answer, or every row in it was unreadable. The
 * last one matters most — a payload of nothing but corrupt rows is the case where "your account has
 * been quiet" would be printed on exactly the evidence that says otherwise.
 */
export function historyState(input: { loading: boolean; error: unknown; data: unknown }): HistoryState {
  if (input.loading) return { state: 'loading' };
  if (input.error) {
    const message = input.error instanceof Error ? input.error.message : String(input.error);
    return { state: 'unavailable', message };
  }
  const data = input.data as { items?: unknown } | null | undefined;
  if (typeof data !== 'object' || data === null || !Array.isArray(data.items)) {
    return { state: 'unavailable', message: 'The account history could not be read.' };
  }
  const raw = data.items;
  if (raw.length === 0) return { state: 'empty' };
  const items = securityEvents(raw);
  if (items.length === 0) {
    // Nothing security-shaped survived. Two different reasons, and they are told apart: an inbox
    // full of run notifications genuinely has no security events in it, while an inbox whose rows
    // are all unreadable is a read that failed.
    const anyUsable = raw.some(usable);
    return anyUsable ? { state: 'empty' } : { state: 'unavailable', message: 'The account history could not be read.' };
  }
  return { state: 'items', items, unread: items.filter((i) => i.readAt === null || i.readAt === undefined).length };
}
