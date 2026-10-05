// The "Sign in with Google" and "Sign in with Discord" cards in Settings > Connections: which identity an account already has, what
// to call it, and whether it may be disconnected. The calls themselves (supabase.auth.linkIdentity / unlinkIdentity) are in
// components/identity-card.tsx; what is decided here is pure, so it is tested as functions.
//
// NOT THE OTHER TWO THINGS NAMED DISCORD AND ROBLOX on that page. The Roblox card is the Roblox account a person signs in with; the Open Cloud
// key panel is a credential they paste in; the Discord card below the cards is the bot link that starts builds from a channel. These
// cards are about how a person signs in to StudPilot, and each says so in its own words.
//
// No imports beyond a type, so `node --test` loads it directly.
import type { OAuthProvider } from './auth-providers';

/** The settings row each provider's card lives in: the id the search registry and the rail know it by. */
export const IDENTITY_FIELD: Record<OAuthProvider, string> = { google: 'google-signin', discord: 'discord-signin' };

/**
 * The settings the page may offer, given which providers the project has on: a provider's row, its rail entry and its search result are
 * there only with the provider. A search for "google" must not find a row that is not on the page.
 */
export function fieldsForProviders<F extends { id: string }>(fields: readonly F[], on: readonly OAuthProvider[]): F[] {
  const owned = Object.entries(IDENTITY_FIELD) as [OAuthProvider, string][];
  return fields.filter((field) => owned.every(([provider, id]) => field.id !== id || on.includes(provider)));
}

/** What supabase.auth.getUserIdentities() lists, narrowed to what this file reads. */
export interface IdentityRow {
  provider: string;
  identity_id?: string;
  identity_data?: Record<string, unknown> | null;
}

/** The identity an account has for a provider, or null. */
export function identityFor(identities: readonly IdentityRow[] | null | undefined, provider: OAuthProvider): IdentityRow | null {
  return identities?.find((identity) => identity.provider === provider) ?? null;
}

/**
 * A name for the linked account, from what the provider sent: its address, else its display name. Text only, trimmed, cut to a line,
 * and null when the provider sent nothing readable (the card then says "Connected" and names nothing).
 */
export function identityLabel(identity: IdentityRow | null): string | null {
  const data = identity?.identity_data;
  if (!data || typeof data !== 'object') return null;
  const custom = (data as { custom_claims?: unknown }).custom_claims;
  const globalName = custom && typeof custom === 'object' ? (custom as { global_name?: unknown }).global_name : undefined;
  for (const value of [data.email, globalName, data.full_name, data.name]) {
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 80);
  }
  return null;
}

/**
 * May this identity be disconnected? Only when the account has another way in. Supabase refuses to remove an account's last identity,
 * and a card that offered a button the service will refuse is a control that exists only to fail. An unknown count (the list has not
 * loaded) is not "yes".
 */
export function canUnlink(identities: readonly IdentityRow[] | null | undefined): boolean {
  return Array.isArray(identities) && identities.length >= 2;
}

/** What each card says in its first line, and in its note about what it is not. */
export const IDENTITY_COPY: Record<OAuthProvider, { title: string; note: string }> = {
  google: {
    title: 'Sign in with Google',
    note: 'A way to sign in to this StudPilot account. StudPilot receives from Google what you allow on its consent screen, typically your email address and name.',
  },
  discord: {
    title: 'Sign in with Discord',
    note: 'A way to sign in to this StudPilot account. It is separate from the Discord link below, which starts builds from a Discord channel.',
  },
};

export function connectedLine(provider: OAuthProvider, identity: IdentityRow | null): string {
  const label = identityLabel(identity);
  return label ? `Connected as ${label}.` : `${provider === 'google' ? 'Google' : 'Discord'} is connected.`;
}

export const NOT_CONNECTED = 'Not connected. Connect it to sign in with it as well as the way you sign in now.';

/** Said under a connected card that cannot be disconnected. */
export const ONLY_WAY_IN = 'This is the only way you sign in to this account, so it cannot be disconnected. Add another way in first.';
