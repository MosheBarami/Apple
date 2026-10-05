// Sign in with Roblox, the browser half: when the button shows, where it goes, what the landing route does
// once the worker has sent the browser back, and what the Connections card says. The worker half is
// apps/worker/src/roblox-oauth.ts and planning/proof/M2/ROBLOX-SIGNIN.md says how the two fit.
//
// No JSX and no Supabase import, so `node --test` can load it: the calls that need the Supabase client are
// handed in. The two hooks use only useState, useEffect and useRef, and tests/roblox-signin.test.mjs runs them
// for real against a small stand-in for React (there is no DOM package in this app).
import { useEffect, useRef, useState } from 'react';
import { safeInternalPath } from './safe-redirect.ts';

export const ROBLOX_START_PATH = '/auth/roblox/start';
export const ROBLOX_STATUS_PATH = '/auth/roblox/status';
export const ROBLOX_REDEEM_PATH = '/auth/roblox/redeem';
export const ROBLOX_CREATE_PATH = '/auth/roblox/create';
export const ROBLOX_DECLINE_PATH = '/auth/roblox/decline';

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
 * Whether to draw "Continue with Roblox". False until the worker has said yes, so the button is never there
 * for a moment and then taken away, and false for ever on any other answer.
 */
export function useRobloxConfigured(): boolean {
  const [configured, setConfigured] = useState(false);
  useEffect(() => {
    let current = true;
    void fetchRobloxConfigured().then((ok) => {
      if (current) setConfigured(ok);
    });
    return () => {
      current = false;
    };
  }, []);
  return configured;
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
 * The link "Confirm with Roblox" points at: a sign-in that is a RE-AUTHENTICATION for `action`. The worker asks Roblox for a fresh
 * login (so a Roblox session already open in this browser is not enough on its own), records the confirmation on the server,
 * and sends the browser back to Settings carrying the action (`/settings?resume=<action>`), which Settings then resumes.
 */
export function robloxReauthHref(action: string): string {
  return `${ROBLOX_START_PATH}?reauth=${encodeURIComponent(action)}`;
}

/* ------------------------------------------------------------------------- the landing route --- */

/**
 * WHERE THE WORKER SENDS THE BROWSER BACK, and what it must never do. The redirect carries nothing: the
 * one-time sign-in token waits behind an HttpOnly cookie that only this browser holds. So this page asks the worker
 * for it (a same-origin POST with no body, the cookie going along on its own) and trades it with Supabase.
 * It never reads the URL for a token. A link that carried one would sign in whoever opened it, and anyone can
 * make such a link out of their own Roblox sign-in: a crafted `#token_hash=…` here is ignored.
 */
export type Redeemed =
  | { tokenHash: string; next: string }
  /** A Roblox account nobody here has seen. Nothing has been made: the person is asked first. `username` is Roblox's own, cleaned by the worker. */
  | { confirmNew: { username: string } }
  | null;

/** The same-origin POST every step of the landing page makes: only the handle cookie goes along, nothing is in the URL, nothing is cached. */
const post = (fetchImpl: typeof fetch, path: string): Promise<Response> =>
  fetchImpl(path, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });

export async function redeemRobloxSignIn(fetchImpl: typeof fetch = fetch): Promise<Redeemed> {
  try {
    const res = await post(fetchImpl, ROBLOX_REDEEM_PATH);
    if (!res.ok) return null;
    const body = (await res.json()) as { token_hash?: unknown; next?: unknown; confirm?: unknown; username?: unknown } | null;
    if (body?.confirm === 'new-account') {
      // Shown on a card as text, so it is only ever a non-empty string of a sane length.
      const username = typeof body.username === 'string' ? body.username.trim() : '';
      return username !== '' && username.length <= 200 ? { confirmNew: { username } } : null;
    }
    const tokenHash = typeof body?.token_hash === 'string' ? body.token_hash : '';
    // Its shape is checked so that a mangled answer never reaches Supabase. `next` is app-relative and goes
    // through the same open-redirect check as every other post-login target.
    if (!/^[A-Za-z0-9._~-]{16,256}$/.test(tokenHash)) return null;
    return { tokenHash, next: safeInternalPath(body?.next) };
  } catch {
    return null;
  }
}

/**
 * "Continue" on the first-sight card: the person has been told this makes a NEW StudPilot account and has said yes. Only this makes
 * the user. `reference` is the worker's fixed code for a failure an operator can search for (never provider text).
 */
export async function createRobloxAccount(fetchImpl: typeof fetch = fetch): Promise<{ ok: true } | { ok: false; reference?: string }> {
  try {
    const res = await post(fetchImpl, ROBLOX_CREATE_PATH);
    const body = (await res.json().catch(() => null)) as { created?: unknown; reference?: unknown } | null;
    if (res.ok && body?.created === true) return { ok: true };
    return typeof body?.reference === 'string' && /^[a-z_]{3,40}$/.test(body.reference) ? { ok: false, reference: body.reference } : { ok: false };
  } catch {
    return { ok: false };
  }
}

/** "Go back": the person does not want a new account. The worker deletes what it held and withdraws the Roblox authorization. */
export async function declineRobloxAccount(fetchImpl: typeof fetch = fetch): Promise<void> {
  try {
    await post(fetchImpl, ROBLOX_DECLINE_PATH);
  } catch {
    /* nothing more can be done from here: the held record expires on its own in five minutes */
  }
}

/** Who is signed in in this browser right now, as far as the landing page needs to know. */
export interface RobloxLandingAccount {
  id: string;
  email: string | null;
  /** True when that account is itself a Roblox account (account-identity.ts `isRobloxAccount`). */
  roblox: boolean;
}

export interface RobloxLandingDeps {
  /** Who is signed in right now: null when nobody, a throw when that cannot be told. */
  currentAccount(): Promise<RobloxLandingAccount | null>;
  redeem(): Promise<Redeemed>;
  /** Make the account that is waiting (the person said Continue). */
  create(): Promise<{ ok: true } | { ok: false; reference?: string }>;
  /** Drop the account that is waiting (the person said Go back). */
  decline(): Promise<void>;
  verifyOtp(args: { token_hash: string; type: 'magiclink' }): Promise<{ data?: { user?: { id?: string } | null } | null; error: unknown }>;
  /** A different account has just replaced the one that was signed in here: drop what the old one left on this device. */
  accountSwitched(): void;
}

export type RobloxLandingState =
  | { kind: 'working' }
  /** Somebody is already signed in here. Nothing has been redeemed, and nothing is replaced until they say so. */
  | { kind: 'choice'; id: string; email: string | null; roblox: boolean }
  /** A Roblox account nobody here has seen: nothing is made until the person presses Continue. */
  | { kind: 'confirm-new'; username: string }
  | { kind: 'signed-in'; next: string }
  | { kind: 'failed'; reference?: string };

/**
 * Redeem the handle and trade the token for a Supabase session. Supabase issues it; the worker never signs one.
 *
 * `previous` is the account that was signed in here when the person chose to switch. Signing in over it fires SIGNED_IN, not
 * SIGNED_OUT, so the app's sign-out cleanup would never run and the old account's drafts, searches and view state would stay for
 * the new one. When the session that results belongs to somebody else (or cannot be said to be the same), that cleanup is run.
 * The same account signing in again (confirming it is them) keeps its own drafts.
 */
export async function completeRobloxSignIn(
  deps: Pick<RobloxLandingDeps, 'redeem' | 'verifyOtp' | 'accountSwitched'>,
  previous: { id: string } | null = null,
): Promise<RobloxLandingState> {
  const redeemed = await deps.redeem();
  if (!redeemed) return { kind: 'failed' };
  // A first sight is a question, not a sign-in: nothing is traded and nothing is made until the person answers it.
  if ('confirmNew' in redeemed) return { kind: 'confirm-new', username: redeemed.confirmNew.username };
  try {
    const { data, error } = await deps.verifyOtp({ token_hash: redeemed.tokenHash, type: 'magiclink' });
    if (error) return { kind: 'failed' };
    if (previous && data?.user?.id !== previous.id) {
      try {
        deps.accountSwitched();
      } catch {
        /* the cleanup is best effort; the person is signed in either way */
      }
    }
    return { kind: 'signed-in', next: redeemed.next };
  } catch {
    return { kind: 'failed' };
  }
}

/**
 * "Continue" on the first-sight card: make the account, then redeem the sign-in it produced and trade it as usual. A failure to make it
 * is a failure card (with the worker's reference when it gave one); nothing is signed in.
 */
export async function continueRobloxNewAccount(
  deps: Pick<RobloxLandingDeps, 'create' | 'redeem' | 'verifyOtp' | 'accountSwitched'>,
  previous: { id: string } | null = null,
): Promise<RobloxLandingState> {
  const made = await deps.create();
  if (!made.ok) return made.reference ? { kind: 'failed', reference: made.reference } : { kind: 'failed' };
  return completeRobloxSignIn(deps, previous);
}

/**
 * What the landing page does first. Signing in as the Roblox account REPLACES whatever session this browser has, so
 * when there is one it asks (state `choice`) and redeems nothing yet. When it cannot tell, it fails rather than guess.
 */
export async function startRobloxLanding(deps: RobloxLandingDeps): Promise<RobloxLandingState> {
  let account: RobloxLandingAccount | null;
  try {
    account = await deps.currentAccount();
  } catch {
    return { kind: 'failed' };
  }
  return account ? { kind: 'choice', id: account.id, email: account.email, roblox: account.roblox } : completeRobloxSignIn(deps);
}

/** The words that say whose session would be replaced. A placeholder address is not somebody's name. */
export function existingSessionLine(email: string | null): string {
  const named = email && !/\.invalid$/i.test(email) ? ` as ${email}` : '';
  return `You are already signed in${named}. Signing in with Roblox would replace that session.`;
}

/**
 * The same, for a session that is itself a Roblox account. That is what a person has when they came here from Settings to
 * confirm it is them (a Roblox-only account has no password to type), so it says what continuing does.
 */
export const EXISTING_ROBLOX_SESSION_LINE =
  'You are signed in with Roblox. Continue to sign in again with the Roblox account you just used. If it is a different Roblox account, it replaces this session.';

/**
 * The landing page's state, and the things a person can do from it: from `choice` switch, from `confirm-new` continue or go back.
 * The hook runs once, whatever re-renders it. `onDeclined` is called once "Go back" has been said and the worker told.
 */
export function useRobloxLanding(
  deps: RobloxLandingDeps,
  onSignedIn: (next: string) => void,
  onDeclined: () => void = () => {},
): { state: RobloxLandingState; switchNow: () => void; continueNew: () => void; goBack: () => void } {
  const [state, setState] = useState<RobloxLandingState>({ kind: 'working' });
  const started = useRef(false);
  /** Who was signed in when the choice was put to the person: the account a switch replaces. */
  const replaced = useRef<{ id: string } | null>(null);
  const apply = (outcome: RobloxLandingState): void => {
    if (outcome.kind === 'choice') replaced.current = { id: outcome.id };
    if (outcome.kind === 'signed-in') onSignedIn(outcome.next);
    else setState(outcome);
  };
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void startRobloxLanding(deps).then(apply);
  }, []); // once per mount, on purpose: the handle can be redeemed only once
  const switchNow = (): void => {
    setState({ kind: 'working' });
    void completeRobloxSignIn(deps, replaced.current).then(apply);
  };
  const continueNew = (): void => {
    setState({ kind: 'working' });
    void continueRobloxNewAccount(deps, replaced.current).then(apply);
  };
  const goBack = (): void => {
    setState({ kind: 'working' });
    void deps.decline().then(onDeclined);
  };
  return { state, switchNow, continueNew, goBack };
}

/* ------------------------------------------------------------------- the Connections card --- */

export interface RobloxConnection {
  configured: boolean;
  connected: boolean;
  username: string | null;
  linkedAt: string | null;
  /** True while the account's address is still the placeholder, so Roblox is the only way in. */
  signInOnly: boolean;
  /** True when the person confirmed it is them with Roblox in the last ten minutes, by the SERVER's clock: what a Roblox-only account's gate asks, instead of any timestamp compared with the device's. */
  reauthFresh: boolean;
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
  if (c.signInOnly) {
    // What a Roblox-only account can do today, said plainly. There is no email address or password to fall back on (the address
    // is a placeholder nothing can be delivered to, so it cannot be changed through a confirmation email either), so Disconnect
    // is not offered: it would leave no way back in.
    return {
      status: `Connected as ${c.username ?? 'your Roblox account'}.`,
      caution: 'Roblox is how you sign in to this account, and it cannot be disconnected: this account has no email address or password, so there would be no way back in. To withdraw StudPilot’s access to your Roblox account, check Connected apps in your Roblox account settings, or delete your StudPilot account under Danger zone.',
      canDisconnect: false,
    };
  }
  return {
    status: `Connected as ${c.username ?? 'your Roblox account'}.`,
    caution: 'Disconnect withdraws StudPilot’s access at Roblox and removes the link, so you can no longer sign in with Roblox.',
    canDisconnect: true,
  };
}

export function disconnectMessage(r: RobloxDisconnectResult): string {
  if (!r.tokenRemoved && !r.linkRemoved && !r.signInKept) return 'There was nothing connected.';
  // `revoked` is Roblox's own answer as the worker reports it: `true` says Roblox withdrew the access, `null` that there was
  // no stored token to withdraw. `false` is never a success, so it is never worded as one.
  if (r.revoked === false) return 'StudPilot removed its copy of the connection, but Roblox did not confirm that it withdrew the access. Check Connected apps in your Roblox account settings.';
  if (r.signInKept) return 'StudPilot’s access to your Roblox account is withdrawn. Roblox is still how you sign in.';
  return 'Roblox disconnected.';
}

/** What the first-sight card says, word for word: it is the answer to "Continue with Roblox" from somebody who may already have an email account here. */
export const ROBLOX_NEW_ACCOUNT_LINE = 'This creates a new StudPilot account. Already have one? Sign in with your email instead.';

export const ROBLOX_SIGNIN_FAILED = 'We could not sign you in with Roblox. Try again, or sign in with your email.';
