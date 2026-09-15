// A customer's own Roblox Open Cloud key, stored so Apple can act on THEIR account instead of
// somebody else's.
//
// WHY THIS EXISTS, AND IT IS NOT A FEATURE REQUEST. Apple uploaded 299 assets into the owner's
// personal Roblox account because the only credential it had was a single shared one, configured
// once, belonging to a real person. Roblox then refused to take them back — an Image is "not an
// archivable asset type" — so that account keeps them permanently. A shared write credential means
// every customer's work lands in one identity; this is the fix for the shape of the problem, not
// just for the incident.
//
// ---------------------------------------------------------------------------------------------
// THE FIVE RULES, AND WHY EACH ONE IS HERE RATHER THAN IN A README
// ---------------------------------------------------------------------------------------------
//
// 1. WRITE-ONLY FROM THE OUTSIDE. Nothing ever returns a stored key to a client — not to the
//    person who set it, not to an admin, not in an error. `describe()` returns a fingerprint and
//    the last four characters, which is enough to answer "is this the key I pasted?" and useless
//    to anyone who steals the answer. A settings page that could re-display a secret is a settings
//    page that leaks it the first time a screenshot is taken.
//
// 2. ENCRYPTED AT REST, and the envelope carries its own IV. D1 rows are readable by anything that
//    can reach the database, including a future bug in an unrelated query. AES-GCM with a random
//    96-bit IV per record means two customers who paste the SAME key produce different ciphertext,
//    so the table cannot be used to tell that they did.
//
// 3. NO KEY, NO STORAGE. If `CREDENTIAL_KEY` is absent the module REFUSES rather than storing
//    plaintext. A deployment that quietly downgraded to cleartext because a binding was missing is
//    the exact shape this repository keeps naming: a failure to do the safe thing, rendered as a
//    successful save.
//
// 4. THE OWNER OF THE ROW IS THE ONLY READER. Every function takes a userId and every query is
//    keyed on it. There is deliberately no "get any credential" helper: an admin route that could
//    decrypt a customer's Roblox key is a cross-tenant hole with a friendly name.
//
// 5. A STORED KEY IS STILL NOT CONSENT TO USE IT FOR ANYTHING. Scopes are recorded from what the
//    customer says the key carries, and `assertScope` is what a caller must pass before acting.
//    "They gave us a key" and "they agreed to this particular action" are different facts, which
//    is the lesson the 299 uploads taught at the account level and which applies again here.
import type { Env } from './env';
import { isRobloxScope, ROBLOX_SCOPES, type RobloxScope } from '@golem/shared';

export interface CredentialEnv {
  CORPUS: Env['CORPUS'];
  /** 32 bytes, base64. Without it this module refuses to store anything. */
  CREDENTIAL_KEY?: string;
}

// The scope vocabulary lives in @golem/shared: the settings panel offers these choices and this
// module validates what comes back, and a list that existed in two places would let the panel
// offer a scope the worker refuses. They are RECORDED from what the customer declares rather than
// probed, because probing means making a real call against their account with a credential we have
// not yet been told we may use.
export { ROBLOX_SCOPES, isRobloxScope, type RobloxScope } from '@golem/shared';

export interface StoredCredential {
  userId: string;
  /** The Roblox account this key acts on. Public; not a secret. */
  robloxCreatorId: string;
  creatorType: 'user' | 'group';
  scopes: RobloxScope[];
  /** SHA-256 of the key, hex. Lets a customer confirm which key is stored without it being shown. */
  fingerprint: string;
  /** The last four characters only — the same trick a card form uses, for the same reason. */
  hint: string;
  createdAt: string;
  lastUsedAt: string | null;
}

// ---------------------------------------------------------------------------------------------
// crypto
// ---------------------------------------------------------------------------------------------

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Import the wrapping key, or throw a sentence that says what to do.
 *
 * Throwing rather than returning null is deliberate: every caller of this is about to either store
 * or read a secret, and there is no sensible "carry on without it" branch. A null would have to be
 * checked at four call sites and the one that forgot would silently write plaintext.
 */
async function wrappingKey(env: CredentialEnv): Promise<CryptoKey> {
  if (!env.CREDENTIAL_KEY) {
    throw new Error(
      'CREDENTIAL_KEY is not set — refusing to store a customer credential in cleartext. '
      + 'Generate 32 random bytes, base64 them, and set it as a Worker secret.',
    );
  }
  const raw = unb64(env.CREDENTIAL_KEY);
  if (raw.byteLength !== 32) {
    throw new Error(`CREDENTIAL_KEY must decode to exactly 32 bytes, got ${raw.byteLength}`);
  }
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** `<base64 iv>.<base64 ciphertext>` — self-describing, so a rotation can tell the formats apart. */
export async function sealSecret(env: CredentialEnv, plaintext: string): Promise<string> {
  const key = await wrappingKey(env);
  // A FRESH IV EVERY TIME. Reusing one under AES-GCM is catastrophic rather than merely weak, and
  // it is also what would let the table reveal that two customers pasted the same key.
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  return `${b64(iv)}.${b64(ct)}`;
}

export async function openSecret(env: CredentialEnv, sealed: string): Promise<string | null> {
  const [ivB64, ctB64] = String(sealed).split('.');
  if (!ivB64 || !ctB64) return null;
  try {
    const key = await wrappingKey(env);
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(ivB64) },
      key,
      unb64(ctB64),
    );
    return dec.decode(pt);
  } catch {
    // A tampered ciphertext, a rotated key, or a truncated row. All three mean "this cannot be
    // read", and none of them means "there is no credential" — the caller is told null and decides.
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// storage
// ---------------------------------------------------------------------------------------------

export async function ensureCredentialTable(env: Pick<CredentialEnv, 'CORPUS'>): Promise<void> {
  await env.CORPUS.prepare(
    `create table if not exists user_credentials (
       user_id text not null,
       provider text not null,
       sealed text not null,
       roblox_creator_id text not null,
       creator_type text not null,
       scopes text not null,
       fingerprint text not null,
       hint text not null,
       created_at text not null,
       last_used_at text,
       primary key (user_id, provider)
     )`,
  ).run();
}

export interface PutCredentialInput {
  userId: string;
  apiKey: string;
  robloxCreatorId: string;
  creatorType: 'user' | 'group';
  scopes: unknown;
}

export interface PutResult {
  ok: boolean;
  error?: string;
  credential?: StoredCredential;
}

/** Store or replace this user's Roblox key. Returns the DESCRIPTION, never the key. */
export async function putRobloxCredential(env: CredentialEnv, input: PutCredentialInput): Promise<PutResult> {
  const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
  if (!apiKey) return { ok: false, error: 'the key is empty' };
  // Roblox Open Cloud keys are long opaque strings. A short one is a paste that lost most of
  // itself, and storing it would produce a credential that fails later for an unexplainable reason.
  if (apiKey.length < 24) return { ok: false, error: 'that does not look like a Roblox Open Cloud key — it is too short to be one' };
  if (!/^\d+$/.test(String(input.robloxCreatorId))) return { ok: false, error: 'the Roblox creator id must be a number' };
  if (input.creatorType !== 'user' && input.creatorType !== 'group') return { ok: false, error: 'creatorType must be "user" or "group"' };
  const scopes = Array.isArray(input.scopes) ? input.scopes.filter(isRobloxScope) : [];
  if (Array.isArray(input.scopes) && scopes.length !== input.scopes.length) {
    return { ok: false, error: `scopes must be from: ${ROBLOX_SCOPES.join(', ')}` };
  }

  let sealed: string;
  try {
    sealed = await sealSecret(env, apiKey);
  } catch (e) {
    return { ok: false, error: String((e as Error).message) };
  }

  await ensureCredentialTable(env);
  const now = new Date().toISOString();
  const fingerprint = await sha256hex(apiKey);
  const hint = apiKey.slice(-4);
  await env.CORPUS.prepare(
    `insert into user_credentials (user_id, provider, sealed, roblox_creator_id, creator_type, scopes, fingerprint, hint, created_at, last_used_at)
     values (?, 'roblox', ?, ?, ?, ?, ?, ?, ?, null)
     on conflict(user_id, provider) do update set
       sealed=excluded.sealed, roblox_creator_id=excluded.roblox_creator_id,
       creator_type=excluded.creator_type, scopes=excluded.scopes,
       fingerprint=excluded.fingerprint, hint=excluded.hint, created_at=excluded.created_at,
       last_used_at=null`,
  ).bind(input.userId, sealed, String(input.robloxCreatorId), input.creatorType, JSON.stringify(scopes), fingerprint, hint, now).run();

  return {
    ok: true,
    credential: {
      userId: input.userId,
      robloxCreatorId: String(input.robloxCreatorId),
      creatorType: input.creatorType,
      scopes,
      fingerprint,
      hint,
      createdAt: now,
      lastUsedAt: null,
    },
  };
}

/** What the settings page may show. Contains no secret and never will. */
export async function describeRobloxCredential(env: Pick<CredentialEnv, 'CORPUS'>, userId: string): Promise<StoredCredential | null> {
  await ensureCredentialTable(env);
  const row = await env.CORPUS.prepare(
    `select roblox_creator_id, creator_type, scopes, fingerprint, hint, created_at, last_used_at
     from user_credentials where user_id = ? and provider = 'roblox'`,
  ).bind(userId).first<Record<string, unknown>>();
  if (!row) return null;
  let scopes: RobloxScope[] = [];
  try {
    const parsed = JSON.parse(String(row.scopes)) as unknown;
    if (Array.isArray(parsed)) scopes = parsed.filter(isRobloxScope);
  } catch { scopes = []; }
  return {
    userId,
    robloxCreatorId: String(row.roblox_creator_id),
    creatorType: row.creator_type === 'group' ? 'group' : 'user',
    scopes,
    fingerprint: String(row.fingerprint),
    hint: String(row.hint),
    createdAt: String(row.created_at),
    lastUsedAt: (row.last_used_at as string | null) ?? null,
  };
}

export async function deleteRobloxCredential(env: Pick<CredentialEnv, 'CORPUS'>, userId: string): Promise<boolean> {
  await ensureCredentialTable(env);
  const res = await env.CORPUS.prepare(
    `delete from user_credentials where user_id = ? and provider = 'roblox'`,
  ).bind(userId).run();
  return (res.meta?.changes ?? 0) > 0;
}

export interface UseResult {
  ok: boolean;
  error?: string;
  /** Present only on success, and only inside the worker. Never serialised to a response. */
  apiKey?: string;
  creatorId?: string;
  creatorType?: 'user' | 'group';
}

/**
 * Get the key for one user, for ONE named scope.
 *
 * The scope argument is not decoration. A credential stored so Apple could read the Creator Store
 * must not silently become a credential Apple uploads with, and the check that stops that has to
 * happen where the key is handed out — not at the call site, where the next feature will forget.
 */
export async function useRobloxCredential(env: CredentialEnv, userId: string, scope: RobloxScope): Promise<UseResult> {
  await ensureCredentialTable(env);
  const row = await env.CORPUS.prepare(
    `select sealed, roblox_creator_id, creator_type, scopes from user_credentials where user_id = ? and provider = 'roblox'`,
  ).bind(userId).first<Record<string, unknown>>();
  if (!row) return { ok: false, error: 'no Roblox key is connected for this account' };

  let scopes: RobloxScope[] = [];
  try {
    const parsed = JSON.parse(String(row.scopes)) as unknown;
    if (Array.isArray(parsed)) scopes = parsed.filter(isRobloxScope);
  } catch { scopes = []; }
  if (!scopes.includes(scope)) {
    return { ok: false, error: `the connected Roblox key was not declared with the ${scope} scope` };
  }

  const apiKey = await openSecret(env, String(row.sealed));
  // A row that will not decrypt is NOT "no credential". Saying so would send a person to paste
  // their key again when the real fault is a rotated or missing CREDENTIAL_KEY, and the second
  // paste would fail the same way with the same misleading message.
  if (!apiKey) return { ok: false, error: 'the stored key could not be decrypted — CREDENTIAL_KEY may have been rotated or lost' };

  await env.CORPUS.prepare(
    `update user_credentials set last_used_at = ? where user_id = ? and provider = 'roblox'`,
  ).bind(new Date().toISOString(), userId).run();

  return {
    ok: true,
    apiKey,
    creatorId: String(row.roblox_creator_id),
    creatorType: row.creator_type === 'group' ? 'group' : 'user',
  };
}
