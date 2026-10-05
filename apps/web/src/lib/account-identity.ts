// Who an account is, for the few places that must tell a Roblox-only account from an email-and-password one.
//
// No React and no Supabase import, so `node --test` loads it and the rules below are executed, not read.
//
// A Roblox-only account is made by the worker (apps/worker/src/roblox-oauth.ts) through the Auth admin API: no password, and an
// address of the form `roblox-<hex>@users.studpilot.invalid` that nothing can deliver to. Two consequences the rest of the app
// has to respect: there is no password to re-enter, and the address is a placeholder a person must never be shown as theirs.

const ROBLOX_SUB = /^\d{1,20}$/;

/**
 * Was this account made by "Continue with Roblox"?
 *
 * Decided by `app_metadata.roblox_sub`, which only the Auth admin API can write (a person can write `user_metadata`, never
 * `app_metadata`), and NOT by the shape of the address: that is a hint somebody else's address could imitate. Such an account
 * has no password, and the app offers no way to give it one, so asking it for one is asking for something that does not
 * exist. It confirms who it is by signing in with Roblox again.
 */
export function isRobloxAccount(user: unknown): boolean {
  const meta = (user as { app_metadata?: unknown } | null | undefined)?.app_metadata;
  if (!meta || typeof meta !== 'object') return false;
  const sub = (meta as { roblox_sub?: unknown }).roblox_sub;
  return typeof sub === 'string' && ROBLOX_SUB.test(sub);
}

/** RFC 2606 reserves `.invalid`: nothing ending in it is anybody's real address, so it is never shown as one. */
export const isPlaceholderAddress = (email: unknown): boolean => typeof email === 'string' && /\.invalid$/i.test(email.trim());

export interface AccountIdentity {
  /** A Roblox-only account (by `roblox_sub`, or by a placeholder address that nothing else could have). */
  roblox: boolean;
  /** Short text where an address would go: the address, or `Roblox: <username>`. Never a placeholder address. */
  label: string;
  /** The sentence under the Settings title. */
  signedInAs: string;
}

/**
 * What to show for an account. `robloxName` is the username the worker holds for the link (null while it is not known yet,
 * and then the account is still named a Roblox account, never by its placeholder address).
 */
export function accountIdentity(user: unknown, address: string | null | undefined, robloxName: string | null): AccountIdentity {
  const roblox = isRobloxAccount(user) || isPlaceholderAddress(address);
  if (!roblox) return { roblox: false, label: address ?? '', signedInAs: `Signed in as ${address ?? ''}` };
  const name = robloxName?.trim() || null;
  return {
    roblox: true,
    label: name ? `Roblox: ${name}` : 'Roblox account',
    signedInAs: name ? `Signed in with Roblox as ${name}` : 'Signed in with Roblox',
  };
}

/**
 * The letter in the avatar: the first letter of the first of these that has one. The profile's display name, then the Roblox username
 * (an account that signed in with Roblox has no address to take it from), then the address, and never a placeholder address.
 *
 * Null when there is nothing honest to take a letter from, and the caller draws a neutral person mark: a "?" or a letter taken from
 * the words "Roblox account" would say something about the person that nothing knows. A letter, a digit or any other character that
 * is a letter in some alphabet counts; a symbol or a space does not, and the first CODE POINT is taken, so an emoji or an astral letter is not cut in half.
 */
export function avatarInitial(parts: {
  displayName?: string | null;
  robloxName?: string | null;
  address?: string | null;
}): string | null {
  const candidates = [parts.displayName, parts.robloxName, isPlaceholderAddress(parts.address) ? null : parts.address];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const first = Array.from(candidate.trim()).find((ch) => /[\p{L}\p{N}]/u.test(ch));
    if (first) return first.toLocaleUpperCase();
  }
  return null;
}
