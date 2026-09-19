/**
 * THE ONE WAY THIS WORKER TALKS TO POSTGRES AS ITSELF RATHER THAN AS A PERSON.
 *
 * Every other read in this product goes through `supaRest` with the caller's own verified JWT, so
 * row level security decides what comes back. That is the design and it is not being relaxed here.
 * But two things the worker must do cannot be expressed as "what this user may read":
 *
 *   - draining the membership access outbox, which belongs to no user; and
 *   - fetching a project row for someone holding a redeemed share link, whose grant lives in KV
 *     because a bearer secret cannot be looked up under RLS, and which therefore matches no policy.
 *
 * Both are served by `security definer` functions that take a purpose token and check its sha256
 * against `membership_outbox_secret` before doing anything. The token is what makes them the
 * WORKER's functions rather than any signed-in user's: they are revoked from `authenticated` and
 * granted to `anon`, so presenting the anon key alone gets you nothing.
 *
 * THERE IS NO SERVICE ROLE KEY IN THIS WORKER, and this module is not a way to get one. Each of
 * these functions answers exactly one question and can do exactly one thing; a service key would
 * answer every question and do everything, which is why ADR-071 refused it.
 *
 * DEGRADES TO "NO". An unconfigured or misconfigured token makes every call here return null,
 * which every caller must already handle — the outbox simply does not drain, and a link guest gets
 * the same 404 they got before this existed. A module that threw would turn a missing secret into
 * an outage across the product.
 */
import type { Env } from './env';

export type SystemRpcEnv = Pick<Env, 'SUPABASE_URL' | 'SUPABASE_ANON_KEY'> &
  Partial<Pick<Env, 'MEMBERSHIP_OUTBOX_TOKEN' | 'MEMBERSHIP_OUTBOX_CONSUMER'>>;

/** A consumer name is part of a database row's primary key, so its shape is checked, not trusted. */
const CONSUMER_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/**
 * The purpose token and consumer name, or null when this deployment has neither.
 *
 * The 32-character floor is not decoration. A short value here is almost always a placeholder left
 * in a config, and a placeholder that passes this check becomes a token the worker sends to the
 * database on every call — where it fails, silently, in a way that looks like the feature being
 * off rather than like a secret being wrong.
 */
export function systemRpcConfig(env: SystemRpcEnv): { token: string; consumer: string } | null {
  const token = typeof env.MEMBERSHIP_OUTBOX_TOKEN === 'string' ? env.MEMBERSHIP_OUTBOX_TOKEN.trim() : '';
  const consumer = typeof env.MEMBERSHIP_OUTBOX_CONSUMER === 'string' ? env.MEMBERSHIP_OUTBOX_CONSUMER.trim() : '';
  if (token.length < 32 || !CONSUMER_RE.test(consumer)) return null;
  return { token, consumer };
}

/**
 * Call a `security definer` function with the anon key and no user JWT.
 *
 * `ok` is the HTTP result and nothing more. A function that does not exist answers 404 and a
 * function that refused the token answers with a null result, and neither is an error worth
 * throwing over: both mean "this deployment cannot do that", which is a thing callers here are
 * required to survive.
 */
export async function systemRpc<T>(
  env: SystemRpcEnv,
  name: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  let data: T | null = null;
  try {
    data = (await res.json()) as T;
  } catch {
    /* an empty/error body remains null and cannot be mistaken for success */
  }
  return { ok: res.ok, status: res.status, data };
}
