// Golem API keys: the credential the PUBLIC HTTP surface authenticates with, and the per-key
// scoping that decides what a given key may reach.
//
// WHY A SECOND CREDENTIAL AT ALL. Everything under `/api/*` authenticates with the user's Supabase
// JWT, which is minted by a browser login, lives about an hour, and — crucially — is what RLS keys
// off when the worker reads Postgres. None of that suits a program: a script cannot log in through
// a browser, cannot refresh a token it never received, and must not be handed a credential that
// carries the user's FULL account authority for every table RLS protects. So the public API gets
// its own credential with three properties the JWT does not have: it is long-lived, it is
// revocable one at a time, and it carries strictly less authority than the user who minted it.
//
// ---------------------------------------------------------------------------------------------
// HOW A KEY IS AUTHORISED TO TOUCH A PROJECT — read this before you "simplify" it.
// ---------------------------------------------------------------------------------------------
// The obvious design is to let the key say which project it wants and check ownership at call
// time. That cannot work here and the reason is structural: ownership is enforced by Postgres RLS,
// which needs the USER'S JWT (see supa.ts — every read is made with the caller's token so RLS
// applies). An API key has no JWT and never will.
//
// The alternative that fails open is to ask the SessionDO to bind the project to the key's user —
// but `/init` CREATES the binding when none exists, so a key holder could name any unused UUID and
// be handed ownership of it. A check that manufactures the fact it is checking is not a check.
//
// So the grant is made ONCE, at mint time, on the `/api/keys` route, where a real JWT is present
// and `getOwnedProject` can ask Postgres under RLS whether this user owns this project. The
// verified answer is frozen into the key row. At call time the question is therefore a set
// membership test against a list that was proven, not a claim the caller makes about themselves.
//
// The cost of this design is honest and worth stating: a key does not follow its owner's project
// list. Create a project after minting a key and the key cannot see it until you mint a new one.
// That is the correct trade — a credential whose authority silently grows is the thing scoped
// credentials exist to prevent.
import type { Env } from './env';
import { oncePerIsolate } from './schema-once';

// ---------------------------------------------------------------------------
// shape of a key
// ---------------------------------------------------------------------------

/**
 * Key prefixes. LIVE and TEST are different credentials with different behaviour, and the
 * difference is legible in the string itself rather than hidden in a database column — a key that
 * leaks into a log, a screenshot or a git commit should announce whether it can spend money.
 */
export const KEY_PREFIX = { live: 'gk_live_', test: 'gk_test_' } as const;
export type KeyMode = keyof typeof KEY_PREFIX;
export const KEY_MODES: readonly KeyMode[] = ['live', 'test'];

const ID_HEX = 24;
const SECRET_HEX = 48;

/** `gk_live_<24 hex>_<48 hex>`. Anchored: a key with anything appended is not a key. */
const KEY_RE = new RegExp(`^gk_(live|test)_([0-9a-f]{${ID_HEX}})_([0-9a-f]{${SECRET_HEX}})$`);

/**
 * Every scope the public API knows about, as an explicit allowlist.
 *
 * A `Record<Scope, …>` is a compile-time promise and the runtime keeps none of it: the scope list
 * on a key row is JSON that was written months ago by a route that may since have been changed, so
 * it is re-validated against THIS list every time it is read back (`normaliseScopes`). A scope
 * string nobody defines must not become a scope nobody checks.
 */
export const API_SCOPES = [
  'chat:write',
  'projects:read',
  'messages:read',
  'runs:read',
  'runs:write',
  'events:read',
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

const SCOPE_SET: ReadonlySet<string> = new Set<string>(API_SCOPES);

export function isApiScope(v: unknown): v is ApiScope {
  return typeof v === 'string' && SCOPE_SET.has(v);
}

export interface GrantedProject {
  id: string;
  name: string;
}

export interface ApiKeyRecord {
  id: string;
  userId: string;
  mode: KeyMode;
  name: string;
  scopes: ApiScope[];
  /** Projects proven owned at mint time. Empty means the key reaches no project at all. */
  projects: GrantedProject[];
  createdAt: number;
  /** Epoch ms, or null for "does not expire". */
  expiresAt: number | null;
  lastUsedAt: number | null;
  revokedAt: number | null;
}

/** What the mint returns. `key` is shown ONCE and never stored — only its hash is kept. */
export interface MintedKey {
  id: string;
  key: string;
  mode: KeyMode;
  hash: string;
}

// ---------------------------------------------------------------------------
// pure: minting, parsing, validation
// ---------------------------------------------------------------------------

function randomHex(bytes: number): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function mintKey(mode: KeyMode): Promise<MintedKey> {
  const id = randomHex(ID_HEX / 2);
  const key = `${KEY_PREFIX[mode]}${id}_${randomHex(SECRET_HEX / 2)}`;
  return { id, key, mode, hash: await sha256hex(key) };
}

export interface ParsedKey {
  mode: KeyMode;
  id: string;
}

/**
 * Structural validation before any storage is touched.
 *
 * This runs on an UNAUTHENTICATED string from the internet, so it is deliberately total: a
 * non-string, a key with whitespace, a key with an extra segment, a key whose hex is the wrong
 * length, all return null and the caller answers 401 without a database round trip. Nothing about
 * the string is trusted past this function.
 */
export function parseApiKey(raw: unknown): ParsedKey | null {
  if (typeof raw !== 'string') return null;
  if (raw.length > 128) return null;
  const m = KEY_RE.exec(raw);
  if (!m) return null;
  const mode = m[1] as KeyMode;
  return { mode, id: m[2]! };
}

/** The credential as presented on the wire: `Authorization: Bearer gk_live_…`. */
export function apiKeyFromRequest(req: Request): string | null {
  const h = req.headers.get('Authorization');
  if (h?.startsWith('Bearer ')) return h.slice(7).trim();
  return null;
}

/**
 * Validate a caller-supplied scope list against the allowlist.
 *
 * Returns null — never a filtered list — when anything is wrong. Silently dropping the entries it
 * did not recognise would mint a key whose printed scopes differ from the scopes it has, and the
 * user would be told they created something they did not.
 */
export function normaliseScopes(input: unknown): ApiScope[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > API_SCOPES.length) return null;
  const out: ApiScope[] = [];
  for (const raw of input) {
    if (!isApiScope(raw)) return null;
    if (!out.includes(raw)) out.push(raw);
  }
  return out;
}

/** Read a scope array back out of storage. Same allowlist, applied to our own past writes. */
export function scopesFromStorage(json: string): ApiScope[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isApiScope);
}

export function projectsFromStorage(json: string): GrantedProject[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: GrantedProject[] = [];
  for (const p of parsed) {
    if (!p || typeof p !== 'object') continue;
    const { id, name } = p as { id?: unknown; name?: unknown };
    if (typeof id === 'string' && typeof name === 'string') out.push({ id, name });
  }
  return out;
}

// ---------------------------------------------------------------------------
// pure: authorisation
// ---------------------------------------------------------------------------

export type DenyCode =
  | 'invalid_api_key'
  | 'revoked_api_key'
  | 'expired_api_key'
  | 'insufficient_scope'
  | 'project_not_granted';

export interface Denied {
  ok: false;
  status: 401 | 403;
  code: DenyCode;
  message: string;
}
export type Authorised = { ok: true };

/**
 * May this key perform this operation on this project, right now?
 *
 * A pure function of its inputs — the record, the demanded scope, the project id and the clock —
 * so a test can hand it an expired key, a revoked key or a key whose scope list is missing the one
 * it needs, without arranging for any of those states to exist in a database.
 *
 * `scope: null` means "any valid key" and is reserved for discovery routes that reveal nothing but
 * the shape of the API. It is spelled as an explicit null rather than an absent field so that a
 * route which simply FORGOT to declare a scope cannot read as a route that does not need one —
 * `requiredScope` returns `undefined` for a path it does not know, and that is a 404, not a pass.
 */
export function authorizeKey(
  key: ApiKeyRecord,
  demand: { scope: ApiScope | null; projectId?: string | null; now: number },
): Authorised | Denied {
  if (key.revokedAt !== null) {
    return { ok: false, status: 401, code: 'revoked_api_key', message: 'This API key has been revoked.' };
  }
  // `>` against a possibly-non-finite value is a guard that fails open, so the finiteness of
  // `expiresAt` is established before it is compared and a corrupt value expires the key rather
  // than extending it.
  if (key.expiresAt !== null) {
    if (!Number.isFinite(key.expiresAt) || key.expiresAt <= demand.now) {
      return { ok: false, status: 401, code: 'expired_api_key', message: 'This API key has expired.' };
    }
  }
  if (demand.scope !== null && !key.scopes.includes(demand.scope)) {
    return {
      ok: false,
      status: 403,
      code: 'insufficient_scope',
      message: `This API key is missing the '${demand.scope}' scope.`,
    };
  }
  if (demand.projectId != null) {
    if (!key.projects.some((p) => p.id === demand.projectId)) {
      // Same answer for "no such project" and "not granted to this key": a distinct response would
      // confirm to a stranger holding a scoped key that a given project id exists.
      return {
        ok: false,
        status: 403,
        code: 'project_not_granted',
        message: 'This API key was not granted access to that project.',
      };
    }
  }
  return { ok: true };
}

/**
 * Per-key request ceiling, per minute.
 *
 * Test keys get a smaller one deliberately: they cost nothing to serve and therefore attract
 * load-testing against the sandbox, which is fine until it is the thing keeping a live key's
 * requests queued behind it.
 */
export const KEY_RATE_LIMIT: Record<KeyMode, number> = { live: 120, test: 60 };

export interface RotationPlan {
  ok: true;
  /** Exactly the old grant. Rotation is not a mint. */
  replacement: {
    userId: string;
    mode: KeyMode;
    name: string;
    scopes: ApiScope[];
    projects: GrantedProject[];
    expiresAt: number | null;
  };
  /** When the OLD key stops working. Never later than its own expiry. */
  retireAt: number;
}
export interface RotationRefusal {
  ok: false;
  status: 400 | 403 | 404 | 409;
  code: 'revoked_api_key' | 'expired_api_key' | 'bad_rotation_window' | 'unreadable_key';
  message: string;
}

/**
 * Plan a rotation: what the replacement carries, and when the old key dies.
 *
 * Pure, because all three of rotation's security properties are decided here and a reader should be
 * able to check them in one place:
 *
 *   INHERIT EXACTLY. scopes, projects, mode and owner are copied from the old record and nothing is
 *     read from a request. A caller who could rotate into a wider grant would never ask for one.
 *     The arrays are COPIED, not aliased — a plan whose scopes array is the record's array lets a
 *     caller push onto a grant that is still live.
 *   NEVER RESURRECT. A revoked or already-expired key refuses. Rotating one would return access
 *     that revocation or time had taken away, through a route whose name sounds like maintenance.
 *   NEVER EXTEND. `retireAt` is `min(now + grace, expiresAt)`. A key with an hour left does not
 *     gain a day because somebody rotated it, and the replacement inherits the same deadline rather
 *     than a fresh one.
 *
 * A non-finite `now` or `graceMs` refuses instead of computing `NaN`: authorizeKey reads a NaN
 * expiry as corrupt, so the alternative is minting a key that silently never works.
 */
export function planRotation(
  record: unknown,
  opts: { now: number; graceMs: number },
): RotationPlan | RotationRefusal {
  const bad = (code: RotationRefusal['code'], status: RotationRefusal['status'], message: string): RotationRefusal =>
    ({ ok: false, status, code, message });

  if (!Number.isFinite(opts?.now) || !Number.isFinite(opts?.graceMs) || (opts?.graceMs as number) < 0) {
    return bad('bad_rotation_window', 400, 'The rotation window must be a finite, non-negative number of milliseconds.');
  }
  const r = record as ApiKeyRecord | null;
  if (!r || typeof r !== 'object' || typeof r.userId !== 'string' || !Array.isArray(r.scopes) || !Array.isArray(r.projects)) {
    return bad('unreadable_key', 404, 'That API key could not be read.');
  }
  if (r.revokedAt !== null && r.revokedAt !== undefined) {
    return bad('revoked_api_key', 409, 'A revoked key cannot be rotated — mint a new one instead.');
  }
  if (r.expiresAt !== null && r.expiresAt !== undefined) {
    if (!Number.isFinite(r.expiresAt) || r.expiresAt <= opts.now) {
      return bad('expired_api_key', 409, 'An expired key cannot be rotated — mint a new one instead.');
    }
  }

  const graced = opts.now + opts.graceMs;
  const retireAt = r.expiresAt !== null && r.expiresAt !== undefined ? Math.min(graced, r.expiresAt) : graced;

  return {
    ok: true,
    retireAt,
    replacement: {
      userId: r.userId,
      mode: r.mode,
      name: r.name,
      scopes: [...r.scopes],
      projects: r.projects.map((p) => ({ ...p })),
      expiresAt: r.expiresAt ?? null,
    },
  };
}

/** Bring a key's expiry forward. Never pushes it back — see planRotation's NEVER EXTEND. */
export async function retireApiKey(
  env: Pick<Env, 'CORPUS'>,
  userId: string,
  keyId: string,
  retireAt: number,
): Promise<boolean> {
  if (!Number.isFinite(retireAt)) return false;
  const res = await env.CORPUS.prepare(
    `update api_keys set expires_at = case
       when expires_at is null then ?1
       else min(expires_at, ?1) end
     where id = ?2 and user_id = ?3 and revoked_at is null`,
  )
    .bind(retireAt, keyId, userId)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

export function rateLimitFor(mode: KeyMode): number {
  // The Record above is a compile-time promise; `mode` reaching here from a parsed key is already
  // one of two literals, but the fallback is stated rather than assumed.
  return KEY_RATE_LIMIT[mode] ?? KEY_RATE_LIMIT.test;
}

// ---------------------------------------------------------------------------
// storage (D1, alongside the other worker-owned tables)
// ---------------------------------------------------------------------------

/**
 * Table creation, memoised per isolate.
 *
 * Every public API request authenticates, so an un-memoised `create table if not exists` would
 * issue two DDL statements on D1 in front of every single call on the public surface. The memo is
 * a PROMISE, so concurrent first requests wait on one round trip instead of racing; and a FAILED
 * creation is forgotten rather than remembered as done — caching the failure would leave every
 * later request in this isolate querying a table that was never made.
 */
// THIS FILE GOT IT RIGHT FIRST, AND ITS REASONING BECAME schema-once.ts. The promise memo, the
// shared in-flight run and the forgotten failure were all worked out here; seven other stores
// re-ran their DDL on every request until D1 reset under a bulk ingest and took down both the
// asset ingest and a site deploy. The local copy is gone rather than duplicated — one
// implementation, so the next store to need it cannot get a worse version.
export function ensureApiKeyTables(env: Pick<Env, 'CORPUS'>): Promise<void> {
  return oncePerIsolate('api-keys', async () => {
    await env.CORPUS.exec(
      `create table if not exists api_keys(id text primary key, user_id text not null, mode text not null, name text not null, key_hash text not null unique, scopes text not null, projects text not null, created_at integer not null, expires_at integer, last_used_at integer, revoked_at integer)`,
    );
    await env.CORPUS.exec(`create index if not exists idx_api_keys_user on api_keys(user_id)`);
  });
}

interface KeyRow {
  id: string;
  user_id: string;
  mode: string;
  name: string;
  scopes: string;
  projects: string;
  created_at: number;
  expires_at: number | null;
  last_used_at: number | null;
  revoked_at: number | null;
}

function rowToRecord(row: KeyRow): ApiKeyRecord | null {
  // `mode` crosses a trust boundary on the way OUT of storage too: the column is free text and a
  // row written by a future migration could hold anything. An unrecognised mode is not coerced to
  // `live`.
  const mode = KEY_MODES.find((m) => m === row.mode);
  if (!mode) return null;
  return {
    id: row.id,
    userId: row.user_id,
    mode,
    name: row.name,
    scopes: scopesFromStorage(row.scopes),
    projects: projectsFromStorage(row.projects),
    createdAt: row.created_at,
    expiresAt: row.expires_at ?? null,
    lastUsedAt: row.last_used_at ?? null,
    revokedAt: row.revoked_at ?? null,
  };
}

export async function insertApiKey(
  env: Pick<Env, 'CORPUS'>,
  rec: ApiKeyRecord & { hash: string },
): Promise<void> {
  await ensureApiKeyTables(env);
  await env.CORPUS.prepare(
    `insert into api_keys(id, user_id, mode, name, key_hash, scopes, projects, created_at, expires_at, last_used_at, revoked_at) values(?,?,?,?,?,?,?,?,?,NULL,NULL)`,
  )
    .bind(
      rec.id,
      rec.userId,
      rec.mode,
      rec.name,
      rec.hash,
      JSON.stringify(rec.scopes),
      JSON.stringify(rec.projects),
      rec.createdAt,
      rec.expiresAt,
    )
    .run();
}

/**
 * Look a key up by the SHA-256 of the whole presented string.
 *
 * The plaintext is never stored, so a dump of this table hands an attacker nothing they can
 * present. Lookup by hash equality is safe against timing precisely because the compared value is
 * a digest: there is no way to walk a prefix towards a match without inverting SHA-256.
 */
export async function findApiKeyByHash(env: Pick<Env, 'CORPUS'>, hash: string): Promise<ApiKeyRecord | null> {
  await ensureApiKeyTables(env);
  const row = await env.CORPUS.prepare(
    `select id, user_id, mode, name, scopes, projects, created_at, expires_at, last_used_at, revoked_at from api_keys where key_hash = ?`,
  )
    .bind(hash)
    .first<KeyRow>();
  return row ? rowToRecord(row) : null;
}

export async function listApiKeys(env: Pick<Env, 'CORPUS'>, userId: string): Promise<ApiKeyRecord[]> {
  await ensureApiKeyTables(env);
  const rows = await env.CORPUS.prepare(
    `select id, user_id, mode, name, scopes, projects, created_at, expires_at, last_used_at, revoked_at from api_keys where user_id = ? order by created_at desc`,
  )
    .bind(userId)
    .all<KeyRow>();
  const out: ApiKeyRecord[] = [];
  for (const r of rows.results ?? []) {
    const rec = rowToRecord(r);
    if (rec) out.push(rec);
  }
  return out;
}

/**
 * Revoke, scoped to the owner.
 *
 * `user_id = ?` is in the WHERE clause and not checked afterwards in JavaScript: a revoke that
 * reads the row, compares owners and then writes has a window between the two, and more
 * importantly it would have to decide what to do when the owner does not match. One statement, and
 * a key belonging to someone else simply matches nothing.
 */
export async function revokeApiKey(env: Pick<Env, 'CORPUS'>, userId: string, keyId: string, now: number): Promise<boolean> {
  await ensureApiKeyTables(env);
  const res = await env.CORPUS.prepare(`update api_keys set revoked_at = ? where id = ? and user_id = ? and revoked_at is null`)
    .bind(now, keyId, userId)
    .run();
  const changes = (res as { meta?: { changes?: number } }).meta?.changes;
  return typeof changes === 'number' ? changes > 0 : true;
}

/** Best-effort last-used stamp. Never blocks a request: a failed write loses a timestamp, not a call. */
export async function touchApiKey(env: Pick<Env, 'CORPUS'>, keyId: string, now: number): Promise<void> {
  await env.CORPUS.prepare(`update api_keys set last_used_at = ? where id = ?`).bind(now, keyId).run();
}

/** What a key looks like to its owner. The secret is not here because it is not stored. */
export function publicKeyShape(rec: ApiKeyRecord): Record<string, unknown> {
  return {
    id: rec.id,
    name: rec.name,
    mode: rec.mode,
    prefix: KEY_PREFIX[rec.mode],
    scopes: rec.scopes,
    projects: rec.projects,
    created_at: new Date(rec.createdAt).toISOString(),
    expires_at: rec.expiresAt === null ? null : new Date(rec.expiresAt).toISOString(),
    last_used_at: rec.lastUsedAt === null ? null : new Date(rec.lastUsedAt).toISOString(),
    revoked_at: rec.revokedAt === null ? null : new Date(rec.revokedAt).toISOString(),
  };
}
