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
  /** Characters left, counting the attachment. Goes NEGATIVE, so the user sees by how much. */
  remaining: number;
}

/**
 * Whether this draft can go, judged before the round trip.
 *
 * JUDGED ON WHAT WILL BE SENT, attachment included. The column's bound is on the stored string, so
 * measuring only the typed half accepts a report the server then refuses — and the person is left
 * with no idea which half was too long, because they can only see one of them.
 *
 * The blank case returns `canSend: false` with NO error on purpose. A red message under an empty
 * box scolds somebody for not having typed yet; the disabled button already says everything.
 */
export function checkDraft(raw: unknown, attachment?: string | null): DraftCheck {
  const text = typeof raw === 'string' ? raw : '';
  const trimmed = text.trim();
  if (!trimmed) return { canSend: false, error: null, remaining: SUPPORT_CONTENT_MAX };
  const whole = withAttachment(trimmed, attachment ?? null);
  const remaining = SUPPORT_CONTENT_MAX - whole.length;
  if (whole.length > SUPPORT_CONTENT_MAX) {
    return {
      canSend: false,
      error:
        attachment
          ? `That is ${whole.length} characters with the connection details attached. Please shorten it to ${SUPPORT_CONTENT_MAX} or fewer, or leave them off.`
          : `That is ${whole.length} characters. Please shorten it to ${SUPPORT_CONTENT_MAX} or fewer.`,
      remaining,
    };
  }
  return { canSend: true, error: null, remaining };
}

/* ------------------------------------------------ the consented diagnostic attachment --- */

/**
 * How much of the report the connection details may take.
 *
 * Deliberately well under half the column: the attachment is context for the person's words, and a
 * bundle that crowds out the report has inverted which of the two matters.
 */
export const SUPPORT_ATTACHMENT_MAX = 1400;

/** The header the attachment is joined under. Present only when something is actually attached. */
const ATTACHMENT_HEADER = '--- Connection details (attached by me) ---';

/** How many operations are worth attaching. The last few are the ones near the failure. */
const OPS_SHOWN = 6;
const OP_SUMMARY_MAX = 90;

/** The project this report is about, read off the route. `/projects/:id` — see App.tsx. */
export function projectIdFromPath(pathname: unknown): string | null {
  if (typeof pathname !== 'string') return null;
  const m = /^\/projects\/([^/?#]+)/.exec(pathname);
  return m && m[1] ? m[1] : null;
}

/** The shape of what /studio/diagnostics returns, narrowed to what is worth attaching. */
export interface DiagnosticsLike {
  link?: {
    paired?: boolean;
    connected?: boolean;
    lastSeenAt?: number | null;
    queuedOps?: number;
    pluginVersion?: string | null;
    pluginProtocol?: number | null;
  } | null;
  agentStatus?: string | null;
  pairingExpiresAt?: number | null;
  openPlace?: { placeName?: string; placeId?: number; isRunMode?: boolean } | null;
  placeMismatch?: { message?: string } | null;
  recentOps?: { kind?: string | null; ok?: number | null; summary?: string | null; created_at?: number }[];
}

const when = (ms: number | null | undefined): string => {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return 'never';
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
};

/**
 * The connection details, as the text that would be attached — or null when there are none.
 *
 * LINES, NOT JSON. Support has to be able to read this and quote a line of it back; a pasted
 * object is something only a developer can use, and the person filing the report has to be able to
 * read it too, because they are the one consenting to send it.
 *
 * AND IT NEVER COLLAPSES TO EMPTY. "Studio will not connect" is the commonest report there is, and
 * it is precisely the case where every field is null. An attachment that vanished when nothing was
 * paired would go missing exactly when it was most useful, so "not paired" is itself a line.
 */
export function diagnosticsAttachment(diag: DiagnosticsLike | null | undefined): string | null {
  if (typeof diag !== 'object' || diag === null) return null;
  const link = diag.link ?? {};
  const lines: string[] = [];

  lines.push(link.paired ? 'Studio pairing: paired' : 'Studio pairing: not paired');
  lines.push(`Plugin last polled: ${when(link.lastSeenAt)}`);
  lines.push(`Plugin version: ${link.pluginVersion ?? 'never reported'} (protocol ${link.pluginProtocol ?? '?'})`);
  if (link.paired) lines.push(`Pairing lapses: ${when(diag.pairingExpiresAt)}`);
  lines.push(`Queued operations: ${typeof link.queuedOps === 'number' ? link.queuedOps : 0}`);
  lines.push(`Agent: ${diag.agentStatus ?? 'unknown'}`);

  const place = diag.openPlace;
  lines.push(
    place && place.placeName
      ? `Open place: ${place.placeName} (${place.placeId ?? '?'})${place.isRunMode ? ', running' : ''}`
      : 'Open place: Studio has never reported one',
  );
  if (diag.placeMismatch?.message) lines.push(`Place mismatch: ${diag.placeMismatch.message}`);

  const ops = Array.isArray(diag.recentOps) ? diag.recentOps.slice(-OPS_SHOWN) : [];
  if (ops.length === 0) {
    lines.push('Recent operations: none recorded');
  } else {
    lines.push('Recent operations (newest last):');
    for (const o of ops) {
      // `ok` is 0/1 out of SQLite. A row of identical lines would hide the one that failed, which
      // is the only row anybody is looking for.
      const mark = o.ok === 1 ? 'ok    ' : o.ok === 0 ? 'FAILED' : '?     ';
      const summary = (o.summary ?? '').slice(0, OP_SUMMARY_MAX);
      lines.push(`  ${mark} ${o.kind ?? 'unknown'}${summary ? ` — ${summary}` : ''}`);
    }
  }

  const text = lines.join('\n');
  // Truncated at a line boundary, with the cut stated. A bundle that silently stopped mid-line
  // would look to support like an operation that never finished.
  if (text.length <= SUPPORT_ATTACHMENT_MAX) return text;
  const kept = text.slice(0, SUPPORT_ATTACHMENT_MAX - 40);
  return `${kept.slice(0, kept.lastIndexOf('\n'))}\n  … (trimmed to fit)`;
}

/**
 * The person's words, then the attachment — or the words alone when nothing was attached.
 *
 * THEIR WORDS COME FIRST, always. What somebody chose to write is the report; the bundle is
 * context for it, and a support desk that has to scroll past a machine dump to find the sentence
 * reads the sentence less carefully.
 *
 * ONE STRING, not a second field: the worker redacts `content`, so an attachment that travelled
 * beside it would be a second route into the support table with no scanner on it.
 */
export function withAttachment(text: string, attachment: string | null): string {
  const body = text.trim();
  if (!attachment) return body;
  return `${body}\n\n${ATTACHMENT_HEADER}\n${attachment}`;
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
