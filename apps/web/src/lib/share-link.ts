/**
 * The two ends of a share link.
 *
 * A guest — `origin: 'link'` — has been a first-class member class since the roster was built:
 * named in MEMBER_ORIGINS, filterable, suspendable and revocable on exactly the same terms as an
 * invited member. What did not exist was any way to make one. There was no mint control, and, more
 * importantly, no page a person could open the resulting link on: minting a token with nowhere to
 * present it is a control that produces a useless string, which is the half-built shape this
 * codebase keeps finding.
 *
 * WHAT THE REFUSALS ARE FOR. `redeemShareLink` gives seven different reasons and the route adds two
 * more, and they are not variations on "no": `expired` and `revoked` are things the person can ask
 * the sender to fix, `wrong_project`/`wrong_scope`/`wrong_resource` mean the link is for something
 * else, and `removed_from_project` means an administrator removed them and pressing the link again
 * will never work — which is the point of that bar, because otherwise a removal lasted exactly as
 * long as it took somebody to re-click the link still sitting in their inbox. One message for all
 * nine is the product declining to say which.
 */

/**
 * Where a share link points. `/app/join` is a real route — see routes/join.tsx and the entry in
 * app.tsx — because a link to a page that does not exist is worse than no link at all.
 *
 * The token is escaped even though base64url never needs it. An unescaped template literal here
 * survives every test until the day the token format changes, and then breaks a link somebody
 * has already sent.
 */
export function shareLinkUrl(token: string, origin: string): string {
  return `${origin.replace(/\/+$/, '')}/app/join?token=${encodeURIComponent(token)}`;
}

/**
 * The token out of whatever somebody pasted.
 *
 * A share link is a URL, and the thing people copy is the URL — so a box that accepts only the
 * 32-character token refuses the exact string the product told them to send. It takes either, and
 * a URL with no token in it is null rather than the URL itself: sending a whole address to the
 * redeem route as a token gets `no_such_link`, which reads as "your link is wrong" when what was
 * wrong is that it had no token on it at all.
 */
export function tokenFrom(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (text.length === 0) return null;
  // A token is base64url: no slashes, no colons. Anything carrying either is an address, and an
  // address is read for its token rather than sent as one — including an address that turns out
  // not to have a token on it, which answers null rather than posting the whole URL and getting
  // `no_such_link` back.
  const looksLikeUrl = text.includes('/') || text.includes(':');
  if (!looksLikeUrl) return text;
  const q = text.indexOf('?');
  return q === -1 ? null : readToken(text.slice(q));
}

/** The token out of a query string, or null. Never throws on a malformed one. */
export function readToken(search: unknown): string | null {
  if (typeof search !== 'string' || search.length === 0) return null;
  try {
    return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('token');
  } catch {
    return null;
  }
}

/** Mirrors ShareRefusal in apps/worker/src/collab.ts, plus the two refusals the route itself adds. */
const REFUSALS: Record<string, string> = {
  malformed: 'That link is not one this project can read. Ask whoever sent it for a new one.',
  revoked: 'That link has been turned off. Ask whoever sent it for a new one.',
  expired: 'That link has run out. Ask whoever sent it for a new one.',
  role_too_strong: 'That link asks for more access than a link is allowed to give, so it was refused.',
  wrong_project: 'That link is for a different project.',
  wrong_scope: 'That link opens a different part of the project than the one you asked for.',
  wrong_resource: 'That link was made for something else in this project.',
  no_such_link: 'We have no record of that link. Check you copied the whole thing.',
  removed_from_project:
    'You were removed from this project, so this link will not let you back in. Ask an administrator to invite you again.',
};

export function redeemRefusal(reason: unknown): string | null {
  if (typeof reason !== 'string' || reason.length === 0) return null;
  // An unrecognised refusal is printed as itself. Through a lookup that returns undefined it
  // becomes a blank page: a refusal with nothing on it reads as the product being broken rather
  // than as a link that was.
  return REFUSALS[reason] ?? `That link was refused: ${reason}.`;
}
