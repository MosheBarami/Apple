/**
 * WHAT A SUPPORT REQUEST IS, DECIDED BEFORE IT REACHES POSTGRES.
 *
 * `public.feedback` has existed since 0001_init.sql — kind, content, page, status, two RLS
 * policies — and until now nothing in the product ever wrote a row to it. The schema described a
 * support desk nobody built, so a person whose build failed had one address on a marketing page
 * and no way to report anything from inside the app where it had failed.
 *
 * This module is the decision half. It exists as its own file, rather than inline in the route,
 * for one reason that is worth stating: the column's CHECK constraint is NOT a validator. Posting
 * `kind: 'question'` to PostgREST returns a Postgres constraint violation, and a route forwarding
 * that gives the user an opaque failure for what is really "that is not one of the categories".
 * The vocabulary therefore has to live here, and it has to be provably the same vocabulary the
 * column allows — apps/worker/tests/support-requests.test.mjs parses the migration and compares.
 */
import { redactSecrets } from './redaction';

/**
 * The categories `public.feedback.kind` accepts.
 *
 * KEPT IN STEP WITH THE COLUMN BY A TEST, NOT BY A COMMENT. Adding a fourth here without the
 * matching migration produces a category the product offers and the database refuses — a 500 on
 * submit that looks, from the user's side, exactly like being ignored.
 */
export const SUPPORT_KINDS = ['feedback', 'bug', 'support'] as const;
export type SupportKind = (typeof SUPPORT_KINDS)[number];

/** The column's own default, for a body that does not say. */
export const SUPPORT_KIND_DEFAULT: SupportKind = 'feedback';

/** `char_length(content) between 1 and 5000` on the column. */
export const SUPPORT_CONTENT_MAX = 5000;

/**
 * How much of a path is kept.
 *
 * `page` is a breadcrumb for whoever answers — "which screen were they on" — not a record. The
 * column is untyped `text`, so nothing but this stops a caller storing a megabyte per row.
 */
export const SUPPORT_PAGE_MAX = 200;

export interface SupportSubmission {
  kind: SupportKind;
  /** Exactly what will be stored: already redacted, already within the column's bound. */
  content: string;
  page: string | null;
  /** True when redaction changed the text. The submitter is told; they are not quietly edited. */
  redacted: boolean;
}

export type SupportParse = { ok: true; value: SupportSubmission } | { ok: false; error: string };

const KIND_SET: ReadonlySet<string> = new Set<string>(SUPPORT_KINDS);
const KIND_LIST = SUPPORT_KINDS.join(', ');

/**
 * Where a report was filed from, with nothing in it that could sign in as the reporter.
 *
 * THE FRAGMENT IS THE DANGEROUS HALF, and it is dangerous in this product specifically. Supabase's
 * recovery and magic-link flows land on `/app#access_token=…` (apps/web/src/lib/auth-flows.ts:227),
 * so a widget that files `location.href` from a page the user has just landed on would write a
 * live session token into a table whose whole purpose is to be read by somebody else. The query
 * string carries the PKCE `code` for the same reason. Both are cut, and what is left is a path.
 *
 * Returns null rather than a sentinel: `page` is nullable, and "unknown" is a fact worth storing
 * honestly instead of as the string "undefined".
 */
function normalisePage(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // Cut at the FIRST of either marker. Cutting the query first would leave `#…` from a URL whose
  // fragment precedes no query, and cutting them in sequence is two chances to get the order wrong.
  const cut = raw.search(/[?#]/);
  const path = (cut === -1 ? raw : raw.slice(0, cut)).trim();
  if (!path) return null;
  return path.length > SUPPORT_PAGE_MAX ? path.slice(0, SUPPORT_PAGE_MAX) : path;
}

/**
 * Turn a request body into the row that will be stored, or into the sentence the caller is shown.
 *
 * NOTE WHAT IS ABSENT FROM THE RESULT: an owner. There is no `owner_id` in `SupportSubmission` and
 * no branch here reads one, so there is no path by which a body can say whose request this is. The
 * route takes that from the verified JWT. Identity that a caller can assert is not identity.
 */
export function parseSupportSubmission(raw: unknown): SupportParse {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'Send a JSON object with a message.' };
  }
  const body = raw as Record<string, unknown>;

  const rawKind = body.kind;
  let kind: SupportKind;
  if (rawKind === undefined || rawKind === null) {
    kind = SUPPORT_KIND_DEFAULT;
  } else if (typeof rawKind === 'string' && KIND_SET.has(rawKind)) {
    kind = rawKind as SupportKind;
  } else {
    return { ok: false, error: `Choose a category: ${KIND_LIST}.` };
  }

  if (typeof body.content !== 'string') return { ok: false, error: 'Write a message before sending.' };
  const trimmed = body.content.trim();
  if (!trimmed) return { ok: false, error: 'Write a message before sending.' };

  /*
   * REDACT, THEN MEASURE. In that order, and the order is the whole point.
   *
   * A placeholder is not the length of what it replaces: `[redacted:private_key_block]` is 26
   * characters where the key was two thousand, and `[redacted:jwt]` is 14 where a short bearer
   * token was 20. The column's CHECK is on the stored string, so measuring the arriving one is
   * measuring a string that will never exist — refusing reports that would have fitted in one
   * direction, and in the other handing Postgres a row it rejects with a constraint error the
   * user reads as "something went wrong".
   *
   * `minConfidence: 'high'` on purpose: the heuristic rules exist for a log's wide net, and a
   * support report is a person's own words. Eating a sentence because it contained a long hex
   * string would destroy the report to protect nothing.
   */
  const scrubbed = redactSecrets(trimmed, { minConfidence: 'high' });
  const content = scrubbed.text;
  if (content.length > SUPPORT_CONTENT_MAX) {
    // Not truncated. The end of a bug report is where the person says what they expected.
    return {
      ok: false,
      error: `That message is ${content.length} characters. Please shorten it to ${SUPPORT_CONTENT_MAX} or fewer.`,
    };
  }
  // Redaction can only shorten a report to a placeholder, never to nothing, but a report that was
  // ONLY a secret would now be a bare marker. That is still a fact worth storing over a refusal.
  if (!content) return { ok: false, error: 'Write a message before sending.' };

  return { ok: true, value: { kind, content, page: normalisePage(body.page), redacted: scrubbed.changed } };
}
