// A customer's own model-provider key (OpenRouter), sealed at rest and opened for one run at a time.
//
// Owner decisions D-BYOK-1 and D-BYOK-2. The rules are the ones user-credentials.ts already
// follows for Roblox keys, for the same reasons:
//
//   1. WRITE-ONLY FROM THE OUTSIDE. Nothing returns a stored key. The browser gets the provider, the
//      last four characters and when it was saved (`ModelKeySummary`), and nothing else.
//   2. SEALED WITH AES-GCM under the worker secret BYOK_ENCRYPTION_KEY, with a fresh 96-bit IV on
//      every write, so the same key saved twice — or by two customers — is two different rows.
//   3. NO SECRET, NO STORAGE. Without BYOK_ENCRYPTION_KEY every write refuses and stores nothing,
//      and the key is not even sent to OpenRouter to be checked: a key we cannot keep is not a key
//      we should be handling at all.
//   4. THE OWNER OF THE ROW IS THE ONLY READER. Every function takes the userId from the caller's
//      verified identity; there is no "open any key" helper.
//   5. OPENED FOR ONE CALL. `openModelKey` is called by the session for each model step and the
//      plaintext lives in that step's stack frame. It is never written to AgentState, the
//      transcript, analytics or a log.
//
// WHERE IT IS STORED, AND WHY THAT TABLE. The smallest existing per-user store that already has the
// two properties a secret needs is the D1 table `user_credentials`, keyed (user_id, provider): the
// account-erasure sweep already deletes EVERY row of it for the person (erasure.ts, no provider
// filter), and the export inventory already declares it as holding a sealed key. The quota Durable
// Object was the other candidate and is the wrong one: erasure deliberately RETAINS QuotaDO because
// it holds financial records, so a key put there would outlive the account it belongs to. The
// Roblox-specific columns of the row are filled with neutral values ('', 'user', '[]'), and every
// Roblox query already filters `provider = 'roblox'`, so the two kinds of row cannot be confused.
import type { Env } from './env';
import { BYOK_PROVIDERS, type ByokProvider, type ModelKeyCheck, type ModelKeySummary } from '@golem/shared';
import { ensureCredentialTable, sha256hex } from './user-credentials';

export interface ModelKeyEnv {
  CORPUS: Env['CORPUS'];
  /** 32 bytes, base64. Without it this module refuses to store or open anything. */
  BYOK_ENCRYPTION_KEY?: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** The sentence every refusal for a missing secret uses. Plain, and names no value. */
export const BYOK_NOT_CONFIGURED = 'Saving your own model keys is not switched on yet, so nothing was stored.';

async function sealingKey(env: ModelKeyEnv): Promise<CryptoKey | null> {
  const secret = env.BYOK_ENCRYPTION_KEY?.trim();
  if (!secret) return null;
  let raw: Uint8Array;
  try {
    raw = unb64(secret);
  } catch {
    return null;
  }
  if (raw.byteLength !== 32) return null;
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function seal(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  return `${b64(iv)}.${b64(ct)}`;
}

async function open(key: CryptoKey, sealed: string): Promise<string | null> {
  const [ivB64, ctB64] = String(sealed).split('.');
  if (!ivB64 || !ctB64) return null;
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivB64) }, key, unb64(ctB64));
    return dec.decode(pt);
  } catch {
    // Tampered, truncated, or sealed under a rotated secret (D-BYOK-2). All mean "cannot be read".
    return null;
  }
}

/**
 * What a pasted key must look like before it is sent anywhere. Deliberately loose about the
 * provider's own format — OpenRouter's documented keys start `sk-or-`, but a prefix the provider
 * changes should not lock customers out — and strict about what can never be a key.
 */
export function modelKeyShapeError(apiKey: string): string | null {
  if (!apiKey) return 'Paste your OpenRouter key.';
  if (apiKey.length < 20 || apiKey.length > 256) return 'That does not look like an OpenRouter key.';
  if (/[\s\u0000-\u001f\u007f]/.test(apiKey)) return 'That does not look like an OpenRouter key.';
  return null;
}

export type SaveModelKeyResult =
  | { ok: true; key: ModelKeySummary; check: ModelKeyCheck }
  | { ok: false; status: 400 | 503; error: string; check?: ModelKeyCheck };

/**
 * Save (or replace) a customer's key. `check` asks the provider whether the key is alive; it is a
 * parameter so the route passes the real one and tests pass a fake without a network.
 */
export async function saveModelKey(
  env: ModelKeyEnv,
  userId: string,
  provider: ByokProvider,
  rawKey: unknown,
  check: (apiKey: string) => Promise<ModelKeyCheck>,
): Promise<SaveModelKeyResult> {
  const key = await sealingKey(env);
  if (!key) return { ok: false, status: 503, error: BYOK_NOT_CONFIGURED };
  const apiKey = typeof rawKey === 'string' ? rawKey.trim() : '';
  const shape = modelKeyShapeError(apiKey);
  if (shape) return { ok: false, status: 400, error: shape };
  const verdict = await check(apiKey);
  if (verdict === 'invalid') {
    return { ok: false, status: 400, error: 'OpenRouter did not accept that key, so it was not saved.', check: 'invalid' };
  }
  const sealed = await seal(key, apiKey);
  const addedAt = new Date().toISOString();
  const last4 = apiKey.slice(-4);
  await ensureCredentialTable(env);
  await env.CORPUS.prepare(
    `insert into user_credentials (user_id, provider, sealed, roblox_creator_id, creator_type, scopes, fingerprint, hint, created_at, last_used_at, expires_at)
     values (?, ?, ?, '', 'user', '[]', ?, ?, ?, null, null)
     on conflict(user_id, provider) do update set
       sealed = excluded.sealed, fingerprint = excluded.fingerprint, hint = excluded.hint,
       created_at = excluded.created_at, last_used_at = null`,
  )
    .bind(userId, provider, sealed, await sha256hex(apiKey), last4, addedAt)
    .run();
  return { ok: true, key: { provider, last4, addedAt }, check: verdict };
}

/** Every saved model key, as the browser may see it. */
export async function listModelKeys(env: ModelKeyEnv, userId: string): Promise<ModelKeySummary[]> {
  await ensureCredentialTable(env);
  const marks = BYOK_PROVIDERS.map(() => '?').join(', ');
  const res = await env.CORPUS.prepare(
    `select provider, hint, created_at from user_credentials where user_id = ? and provider in (${marks})`,
  )
    .bind(userId, ...BYOK_PROVIDERS)
    .all<{ provider: string; hint: string; created_at: string }>();
  return (res.results ?? [])
    .filter((r): r is { provider: ByokProvider; hint: string; created_at: string } =>
      (BYOK_PROVIDERS as readonly string[]).includes(r.provider))
    .map((r) => ({ provider: r.provider, last4: r.hint, addedAt: r.created_at }));
}

export async function deleteModelKey(env: ModelKeyEnv, userId: string, provider: ByokProvider): Promise<boolean> {
  await ensureCredentialTable(env);
  const res = await env.CORPUS.prepare(`delete from user_credentials where user_id = ? and provider = ?`)
    .bind(userId, provider)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

/**
 * The plaintext key, for ONE model call. Null when none is saved, the secret is absent, or the row
 * cannot be opened — the caller refuses the run in each case, with the same plain sentence.
 */
export async function openModelKey(env: ModelKeyEnv, userId: string, provider: ByokProvider): Promise<string | null> {
  const key = await sealingKey(env);
  if (!key) return null;
  await ensureCredentialTable(env);
  const row = await env.CORPUS.prepare(`select sealed from user_credentials where user_id = ? and provider = ?`)
    .bind(userId, provider)
    .first<{ sealed: string }>();
  if (!row?.sealed) return null;
  return open(key, row.sealed);
}
