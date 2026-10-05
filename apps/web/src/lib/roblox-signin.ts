// Sign in with Roblox, the browser half: when the button shows, where it goes, what the landing route does
// with the fragment, and what the Connections card says. The worker half is apps/worker/src/roblox-oauth.ts
// and planning/proof/M2/ROBLOX-SIGNIN.md says how the two fit.
//
// No JSX and no Supabase import, so `node --test` can load it: the one call that needs the Supabase client
// is handed in.
import { safeInternalPath } from './safe-redirect.ts';

export const ROBLOX_START_PATH = '/auth/roblox/start';
export const ROBLOX_STATUS_PATH = '/auth/roblox/status';

/**
 * The button is rendered only when the worker says it can complete a sign-in. Any other answer, including
 * no answer, an HTML page (a dev server with no worker behind it) or a 429, means "do not offer it": a
 * button that leads to an error page is worse than no button.
 */
export async function fetchRobloxConfigured(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(ROBLOX_STATUS_PATH, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!res.ok) return false;
    const body = (await res.json()) as { configured?: unknown } | null;
    return body?.configured === true;
  } catch {
    return false;
  }
}

/**
 * The link the button points at. The screen the person was heading for rides along as `return`, cleaned
 * here and checked again by the worker against its own short list, which has the last word.
 */
export function robloxStartHref(from?: string | null): string {
  const path = safeInternalPath(from);
  return path === '/' ? ROBLOX_START_PATH : `${ROBLOX_START_PATH}?return=${encodeURIComponent(path)}`;
}

/**
 * What /app/auth/roblox does with its fragment. The token hash is the only thing that matters; its shape is
 * checked so that a mangled or hand-typed fragment never reaches Supabase. `next` is app-relative and goes
 * through the same open-redirect check as every other post-login target.
 */
export function parseRobloxFragment(hash: string): { tokenHash: string; next: string } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const tokenHash = params.get('token_hash') ?? '';
  if (!/^[A-Za-z0-9._~-]{16,256}$/.test(tokenHash)) return null;
  return { tokenHash, next: safeInternalPath(params.get('next')) };
}

export type RobloxSignInOutcome = { kind: 'signed-in'; next: string } | { kind: 'failed' };

/** Trade the one-time token hash for a Supabase session. Supabase issues it; the worker never signs one. */
export async function completeRobloxSignIn(
  hash: string,
  verifyOtp: (args: { token_hash: string; type: 'magiclink' }) => Promise<{ error: unknown }>,
): Promise<RobloxSignInOutcome> {
  const parsed = parseRobloxFragment(hash);
  if (!parsed) return { kind: 'failed' };
  try {
    const { error } = await verifyOtp({ token_hash: parsed.tokenHash, type: 'magiclink' });
    return error ? { kind: 'failed' } : { kind: 'signed-in', next: parsed.next };
  } catch {
    return { kind: 'failed' };
  }
}

/* ------------------------------------------------------------------- the Connections card --- */

export interface RobloxConnection {
  configured: boolean;
  connected: boolean;
  username: string | null;
  linkedAt: string | null;
  /** True while the account's address is still the placeholder, so Roblox is the only way in. */
  signInOnly: boolean;
}

export interface RobloxDisconnectResult {
  revoked: boolean | null;
  tokenRemoved: boolean;
  linkRemoved: boolean;
  signInKept: boolean;
}

export interface ConnectionView {
  status: string;
  /** Said under the button, because it decides whether pressing it is safe. */
  caution: string | null;
  canDisconnect: boolean;
}

export function describeConnection(c: RobloxConnection): ConnectionView {
  if (!c.connected) {
    return {
      status: c.configured
        ? 'Not connected. Signing in with Roblox from the sign-in page makes its own StudPilot account; it does not attach to this one.'
        : 'Not available yet.',
      caution: null,
      canDisconnect: false,
    };
  }
  return {
    status: `Connected as ${c.username ?? 'your Roblox account'}.`,
    caution: c.signInOnly
      ? 'Roblox is how you sign in to this account. Disconnect withdraws StudPilot’s access to your Roblox account and you will still sign in with Roblox. To remove the sign-in too, first change your email address and set a password under Security.'
      : 'Disconnect withdraws StudPilot’s access at Roblox and removes the link, so you can no longer sign in with Roblox.',
    canDisconnect: true,
  };
}

export function disconnectMessage(r: RobloxDisconnectResult): string {
  if (!r.tokenRemoved && !r.linkRemoved && !r.signInKept) return 'There was nothing connected.';
  if (r.signInKept) return 'StudPilot’s access to your Roblox account is withdrawn. Roblox is still how you sign in.';
  return 'Roblox disconnected.';
}

export const ROBLOX_SIGNIN_FAILED = 'We could not sign you in with Roblox. Try again, or sign in with your email.';
