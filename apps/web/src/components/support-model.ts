/**
 * THE SUPPORT DIALOG'S DECISIONS, WITH NO REACT IN THEM.
 *
 * Everything here is a pure function or a constant, for the reason the rest of this app separates
 * `*-model.ts` from `*.tsx`: the interesting failures are decisions, and a decision inside a
 * component can only be tested by rendering one.
 *
 * The three decisions worth naming:
 *
 *   - WHICH CATEGORIES EXIST. They are the database's, not a fresh list invented for a radio
 *     group. A fourth option here is a 500 on submit and the database's constraint name in the
 *     user's face; a missing one is a dead branch in the column. tests/support-dialog.test.mjs
 *     compares this list against the CHECK in 0001_init.sql AND against the worker's copy.
 *
 *   - WHAT `page` MEANS. A path. Never `location.href`, which in this app can carry a live
 *     `access_token` in its fragment (lib/auth-flows.ts:227) — a widget that filed the whole URL
 *     would send a working session to a table whose entire purpose is to be read by somebody else.
 *     The worker strips it as well; that is defence in depth, not a reason to send it.
 *
 *   - WHAT A STATUS SAYS. `open` and `closed` are column values, not sentences. And a value this
 *     code does not recognise is reported as unrecognised rather than defaulted to "open", because
 *     telling somebody their answered request is still waiting is worse than telling them nothing.
 */

/** A category the user can file under. `id` is the stored `kind`; the rest is for the reader. */
export interface SupportCategory {
  id: string;
  label: string;
  /** When to choose this one. Three bare nouns make the user guess which one gets answered. */
  hint: string;
}

/**
 * KEPT IN STEP BY A TEST, NOT BY A COMMENT.
 *
 * `public.feedback.kind` is `check (kind in ('feedback','bug','support'))`. Adding a fourth entry
 * here without the matching migration ships a category the database refuses.
 */
export const SUPPORT_CATEGORIES: readonly SupportCategory[] = [
  { id: 'bug', label: 'Something is broken', hint: 'A build failed, a screen is wrong, or the app did something it should not.' },
  { id: 'support', label: 'I need help with my account', hint: 'Billing, credits, access, or anything you need a person to look at.' },
  { id: 'feedback', label: 'Feedback or an idea', hint: 'Something that could be better, or something you wish this did.' },
];

/** The column's own default, so "did not choose" and "unspecified" cannot disagree. */
export const SUPPORT_CATEGORY_DEFAULT = 'feedback';

/** `char_length(content) between 1 and 5000` on the column, and the worker's own bound. */
export const SUPPORT_CONTENT_MAX = 5000;

const CATEGORY_LABEL = new Map(SUPPORT_CATEGORIES.map((c) => [c.id, c.label]));

/**
 * The page a report is being filed from: path only.
 *
 * TAKES A LOCATION-SHAPED OBJECT rather than reading `window`, so the property can be tested
 * without a DOM — and so there is no line anywhere in this feature that touches `location.href`,
 * which is the line that would leak the session.
 */
export function supportPageOf(loc: unknown): string | null {
  if (typeof loc !== 'object' || loc === null) return null;
  const p = (loc as { pathname?: unknown }).pathname;
  if (typeof p !== 'string') return null;
  const path = p.trim();
  return path ? path : null;
}

export interface DraftCheck {
  canSend: boolean;
  /** A sentence only when the user has done something to fix. A blank box is not a mistake. */
  error: string | null;
  /** Characters left. Goes NEGATIVE past the limit, so the user can see by how much. */
  remaining: number;
}

/**
 * Whether this draft can go, judged before the round trip.
 *
 * The blank case returns `canSend: false` with NO error on purpose. A red message under an empty
 * box scolds somebody for not having typed yet; the disabled button already says everything.
 */
export function checkDraft(raw: unknown): DraftCheck {
  const text = typeof raw === 'string' ? raw : '';
  const trimmed = text.trim();
  const remaining = SUPPORT_CONTENT_MAX - trimmed.length;
  if (!trimmed) return { canSend: false, error: null, remaining: SUPPORT_CONTENT_MAX };
  if (trimmed.length > SUPPORT_CONTENT_MAX) {
    return {
      canSend: false,
      error: `That is ${trimmed.length} characters. Please shorten it to ${SUPPORT_CONTENT_MAX} or fewer.`,
      remaining,
    };
  }
  return { canSend: true, error: null, remaining };
}

export interface SupportRequest {
  id: string;
  kind: string;
  content: string;
  page: string | null;
  status: string;
  createdAt: string;
}

export interface DescribedRequest extends SupportRequest {
  kindLabel: string;
  statusLabel: string;
}

/**
 * A stored request, in the words of the person who filed it rather than of the column.
 *
 * THE UNKNOWN BRANCH IS THE POINT. `status` is `check (status in ('open','closed'))` today, and a
 * later migration could add a third. Falling back to "Open" would render a request somebody has
 * already answered as one still waiting — a failure to recognise, rendered as a recognition. So an
 * unfamiliar value is shown as itself, prefixed so nobody mistakes it for copy.
 */
export function describeRequest(r: SupportRequest): DescribedRequest {
  const statusLabel =
    r.status === 'open' ? 'Waiting on us' : r.status === 'closed' ? 'Answered and closed' : `Status: ${r.status}`;
  return { ...r, kindLabel: CATEGORY_LABEL.get(r.kind) ?? r.kind, statusLabel };
}
