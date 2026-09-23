// TURNSTILE — proving a browser belongs to a person before an unauthenticated write (D-VISION-1).
//
// Sign-up, sign-in and password reset go straight from the browser to Supabase Auth, so Supabase
// checks those tokens itself (its captcha setting, provider "turnstile", same widget secret). This
// file covers the routes the WORKER serves without a session, where nobody else would check:
// today that is `POST /api/recovery-request`, which is unauthenticated and inserts a row.
//
// SHIPS DARK. Without `TURNSTILE_SECRET` the verdict is `ok` with `checked: false`, so the route
// behaves exactly as before; the moment the secret exists, a missing or forged token is refused.
//
// FAILS OPEN ONLY ON OUR SIDE OF THE WIRE. A token Cloudflare rejects is a refusal. Cloudflare's
// siteverify being unreachable is not evidence about the person, and refusing then would lock
// somebody out of the one door meant for people who are already locked out — the IP limiter in
// front of the route still bounds what an attacker gains from that window.

export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
/** Where a client that cannot put the token in the JSON body may send it instead. */
export const TURNSTILE_TOKEN_HEADER = 'CF-Turnstile-Response';
/** Cloudflare's documented ceiling on a token; anything longer is not one. */
const MAX_TOKEN_LENGTH = 2048;

/** What the page says when the check fails. Written for a young creator, not an engineer. */
export const TURNSTILE_REFUSAL = 'We could not confirm you are a person. Refresh the page and try again.';

export type TurnstileVerdict =
  | { ok: true; checked: true }
  | { ok: true; checked: false; why: 'not_configured' | 'unreachable' }
  | { ok: false; reason: 'missing_token' | 'rejected' | 'wrong_action'; codes: string[] };

export async function verifyTurnstile(
  secret: string | undefined,
  token: unknown,
  opts: { ip?: string | null; expectedAction?: string; fetchImpl?: typeof fetch } = {},
): Promise<TurnstileVerdict> {
  if (!secret) return { ok: true, checked: false, why: 'not_configured' };
  if (typeof token !== 'string' || token.trim() === '') return { ok: false, reason: 'missing_token', codes: [] };
  if (token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: 'rejected', codes: ['token_too_long'] };

  const form = new FormData();
  form.set('secret', secret);
  form.set('response', token);
  if (opts.ip && opts.ip !== 'unknown') form.set('remoteip', opts.ip);

  let body: { success?: unknown; action?: unknown; 'error-codes'?: unknown };
  try {
    const res = await (opts.fetchImpl ?? fetch)(SITEVERIFY_URL, { method: 'POST', body: form });
    if (!res.ok) return { ok: true, checked: false, why: 'unreachable' };
    body = (await res.json()) as typeof body;
  } catch {
    return { ok: true, checked: false, why: 'unreachable' };
  }
  const codes = Array.isArray(body['error-codes']) ? body['error-codes'].map(String) : [];
  // `internal-error` is Cloudflare telling us it could not decide — the same case as unreachable.
  if (body.success !== true && codes.includes('internal-error')) return { ok: true, checked: false, why: 'unreachable' };
  if (body.success !== true) return { ok: false, reason: 'rejected', codes };
  // A token minted for sign-up must not be replayed at a different door.
  if (opts.expectedAction && typeof body.action === 'string' && body.action !== opts.expectedAction) {
    return { ok: false, reason: 'wrong_action', codes: [] };
  }
  return { ok: true, checked: true };
}
