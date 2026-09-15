// Share links, on the client side: what a link may carry, how long it lasts, where it lands, and
// what each refusal means in words.
//
// The worker half of this has been complete for a long time — mint, redeem, revoke, a scope that
// survives redemption, an expiry enforced on both sides of the link's life — and none of it was
// reachable. `grep` for a share-link function in lib/api.ts returned nothing, the members panel
// mentioned links only in a comment, and there was no page anywhere that a link could land on. So
// the only way to share a project by URL was curl, and the only way to revoke one was to have kept
// the mint response open in a terminal.
//
// Everything decidable without a network is decided here, so it can be tested as a function rather
// than as a rendering: the expiry arithmetic, the URL, and the sentence each refusal becomes.

/**
 * The roles a LINK may carry. Mirrors SHARE_LINK_MAX_RANK in apps/worker/src/collab.ts, which
 * stops at editor — a link is a bearer token that lands in chat logs and browser history, and one
 * that could add members is account takeover with extra steps. The mint route refuses `admin` with
 * `role_too_strong`; offering it here would be a control that exists only to be rejected.
 */
export const LINKABLE_ROLES = ['viewer', 'commenter', 'editor'] as const;
export type LinkableRole = (typeof LINKABLE_ROLES)[number];

/**
 * How long a new link should last.
 *
 * `never` is last and is not the default. A link with no expiry is the one that turns up in a
 * screenshot two years later and still works.
 */
export const SHARE_LINK_EXPIRIES = [
  { id: '24h', label: 'In 24 hours', ms: 24 * 60 * 60 * 1000 },
  { id: '7d', label: 'In 7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  { id: '30d', label: 'In 30 days', ms: 30 * 24 * 60 * 60 * 1000 },
  { id: 'never', label: 'Never', ms: null },
] as const;

export type ExpiryChoice = (typeof SHARE_LINK_EXPIRIES)[number]['id'];

export const DEFAULT_EXPIRY: ExpiryChoice = '7d';

/**
 * The ISO instant to send as `expiresAt`, or null for a link that never expires.
 *
 * A choice this build does not recognise returns null — which is "never" — and that is the one
 * answer that could be wrong in the permissive direction, so it is unreachable by construction:
 * the only values that get here come from SHARE_LINK_EXPIRIES itself, and the type says so. It is
 * written out rather than thrown because a select that cannot submit is worse than a link that
 * outlives its intent, and the expiry is shown on the link afterwards either way.
 */
export function expiryIso(choice: ExpiryChoice, nowMs: number): string | null {
  const entry = SHARE_LINK_EXPIRIES.find((e) => e.id === choice);
  if (!entry || entry.ms === null || !Number.isFinite(nowMs)) return null;
  return new Date(nowMs + entry.ms).toISOString();
}

/**
 * Where a link lands.
 *
 * `/app` is the SPA's basename (see app.tsx) and `/join` is the route that redeems. A token in a
 * query string is what a bearer link IS; the route consumes it and replaces the URL so it does not
 * sit in history longer than the redemption takes.
 */
export function shareLinkUrl(origin: string, token: string): string {
  return `${String(origin).replace(/\/+$/, '')}/app/join?token=${encodeURIComponent(token)}`;
}

/**
 * What the server's `state` means, in the words an admin needs.
 *
 * A state this build does not know PRINTS AS ITSELF rather than as a blank or a guess. A link
 * rendered with no state beside it reads as a live one, which is the direction that matters: the
 * whole reason to look at this list is to find the links that still work.
 */
const LINK_STATE_NOTES: Record<string, string> = {
  live: 'Live — anyone with this link can join.',
  revoked: 'Revoked. It opens nothing.',
  expired: 'Expired.',
  role_too_strong: 'Carries a role a link may not carry, so it will be refused.',
  wrong_project: 'Stored against another project. It will not open this one.',
  wrong_scope: 'Its scope no longer matches what it points at.',
  wrong_resource: 'Points at something that is no longer here.',
  malformed: 'Stored damaged, so it will be refused.',
};

export function describeLinkState(state: unknown): string {
  if (typeof state !== 'string' || state.length === 0) return 'State unknown.';
  return LINK_STATE_NOTES[state] ?? `Refused as “${state}”.`;
}

/** Is this link one somebody could still use? Only a state we recognise as live counts. */
export const isLiveLink = (state: unknown): boolean => state === 'live';

/**
 * Why a redemption was refused, for the person holding the link rather than for a log.
 *
 * Every key is a reason the worker actually returns — `redeemShareLink`'s ShareRefusal union plus
 * the two the route adds — and an unrecognised one is REPORTED, not smoothed over. "Something went
 * wrong" on a link somebody was sent is the answer that generates a support message; naming the
 * code at least lets them quote it.
 */
const REDEEM_REFUSALS: Record<string, string> = {
  no_such_link: 'This link does not exist. It may have been revoked, or the address may be incomplete.',
  revoked: 'This link was revoked, so it no longer opens the project. Ask whoever sent it for a new one.',
  expired: 'This link has expired. Ask whoever sent it for a new one.',
  removed_from_project: 'You were removed from this project, so this link cannot let you back in. An admin has to add you again.',
  role_too_strong: 'This link carries a role that links are not allowed to carry, so it was refused.',
  wrong_project: 'This link belongs to a different project.',
  wrong_scope: 'This link does not open what it was asked to open.',
  wrong_resource: 'What this link points at is no longer here.',
  malformed: 'This link is damaged and cannot be read.',
};

export function redeemRefusal(code: unknown): string {
  if (typeof code !== 'string' || code.length === 0) return 'This link could not be used.';
  return REDEEM_REFUSALS[code] ?? `This link could not be used (${code}).`;
}

/** The first characters of a token, for a list. The whole secret goes on the clipboard, not the page. */
export function tokenPreview(token: unknown): string {
  return typeof token === 'string' && token.length > 8 ? `${token.slice(0, 8)}…` : String(token ?? '');
}
