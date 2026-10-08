import type { Env } from './env';
import { oncePerIsolate } from './schema-once';

type ConnectionEnv = Pick<Env, 'CORPUS'> & { AI_CREDENTIAL_KEY?: string };
export type ConnectionStatus = 'unverified' | 'catalog_loaded' | 'verified' | 'invalid' | 'unavailable';
export interface ConnectionView {
  id: string; provider: string; name: string; hint: string; status: ConnectionStatus;
  createdAt: string; updatedAt: string; revision: number;
  catalogVersion: string | null; checkedAt: string | null;
}
export interface AiCredentials { apiKey: string; accountId?: string; region?: string }
export function validateAiCredentials(value: unknown): value is AiCredentials {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const fields = value as Record<string, unknown>;
  return Object.keys(fields).every((key) => ['apiKey', 'accountId', 'region'].includes(key))
    && typeof fields.apiKey === 'string' && fields.apiKey.length >= 8 && fields.apiKey.length <= 8192
    && !/[\s\x00-\x1f]/.test(fields.apiKey)
    && (fields.accountId === undefined || (typeof fields.accountId === 'string' && /^[a-f0-9]{32}$/.test(fields.accountId)))
    && (fields.region === undefined || ['us', 'eu', 'international', 'china'].includes(String(fields.region)));
}
function validateIdentity(owner: string, name: string, credentials: AiCredentials) {
  if (!owner || typeof name !== 'string' || name.trim().length < 1 || name.length > 80
    || !validateAiCredentials(credentials) || name.includes(credentials.apiKey)) throw new Error('Invalid AI connection.');
}
interface ConnectionRow {
  id: string; owner_id: string; provider: string; name: string; hint: string; status: ConnectionStatus;
  sealed: string; created_at: string; updated_at: string; revision: number;
  catalog_version: string | null; checked_at: string | null; catalog: string | null;
}
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
const aad = (owner: string, id: string, provider: string) => enc.encode(JSON.stringify(['ai-connection-v1', owner, id, provider]));

async function keyFor(env: ConnectionEnv) {
  if (!env.AI_CREDENTIAL_KEY) throw new Error('AI connections are unavailable until their encryption key is configured.');
  const bytes = unb64(env.AI_CREDENTIAL_KEY);
  if (bytes.byteLength !== 32) throw new Error('AI credential encryption key has an invalid size.');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function sealAiCredentials(env: ConnectionEnv, owner: string, id: string, provider: string, credentials: AiCredentials) {
  const key = await keyFor(env), iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(owner, id, provider) }, key,
    enc.encode(JSON.stringify(credentials)));
  return `v1.${b64(iv)}.${b64(new Uint8Array(ciphertext))}`;
}
export async function openAiCredentials(env: ConnectionEnv, owner: string, id: string, provider: string, sealed: string): Promise<AiCredentials> {
  try {
    const [version, iv, ciphertext, extra] = sealed.split('.');
    if (version !== 'v1' || !iv || !ciphertext || extra || unb64(iv).byteLength !== 12) throw new Error();
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: aad(owner, id, provider) },
      await keyFor(env), unb64(ciphertext));
    const credentials = JSON.parse(dec.decode(plain));
    if (typeof credentials.apiKey !== 'string' || !credentials.apiKey) throw new Error();
    return credentials;
  } catch { throw new Error('The saved AI connection cannot be decrypted. Replace its key.'); }
}
export function ensureAiConnectionTable(env: ConnectionEnv) {
  return oncePerIsolate('ai-connections-v1', async () => {
    await env.CORPUS.prepare(`CREATE TABLE IF NOT EXISTS ai_connections (
      id TEXT NOT NULL, owner_id TEXT NOT NULL, provider TEXT NOT NULL, name TEXT NOT NULL,
      hint TEXT NOT NULL, status TEXT NOT NULL, sealed TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL,
      catalog_version TEXT, checked_at TEXT, catalog TEXT, PRIMARY KEY (owner_id, id))`).run();
  }, env.CORPUS);
}
const view = (row: ConnectionRow): ConnectionView => ({ id: row.id, provider: row.provider, name: row.name,
  hint: row.hint, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
  revision: row.revision, catalogVersion: row.catalog_version, checkedAt: row.checked_at });

export async function listAiConnections(env: ConnectionEnv, owner: string): Promise<ConnectionView[]> {
  await ensureAiConnectionTable(env);
  const rows = await env.CORPUS.prepare('SELECT * FROM ai_connections WHERE owner_id = ? ORDER BY created_at, id')
    .bind(owner).all<ConnectionRow>();
  return rows.results.map(view);
}
async function rowFor(env: ConnectionEnv, owner: string, id: string): Promise<ConnectionRow | null> {
  await ensureAiConnectionTable(env);
  return env.CORPUS.prepare('SELECT * FROM ai_connections WHERE owner_id = ? AND id = ?').bind(owner, id).first<ConnectionRow>();
}
export async function getAiConnection(env: ConnectionEnv, owner: string, id: string) {
  const row = await rowFor(env, owner, id); if (!row) return null;
  return { view: view(row), credentials: await openAiCredentials(env, owner, id, row.provider, row.sealed),
    catalog: row.catalog ? JSON.parse(row.catalog) as unknown : null };
}
export async function createAiConnection(env: ConnectionEnv, owner: string, provider: string, name: string, credentials: AiCredentials) {
  validateIdentity(owner, name, credentials);
  const id = crypto.randomUUID(), now = new Date().toISOString();
  // Fail before a database write if encryption is unavailable. No raw key in metadata or caches.
  const sealed = await sealAiCredentials(env, owner, id, provider, credentials);
  await ensureAiConnectionTable(env);
  await env.CORPUS.prepare(`INSERT INTO ai_connections
    (id, owner_id, provider, name, hint, status, sealed, created_at, updated_at, revision)
    VALUES (?, ?, ?, ?, ?, 'unverified', ?, ?, ?, 1)`)
    .bind(id, owner, provider, name, credentials.apiKey.slice(-4), sealed, now, now).run();
  return view((await rowFor(env, owner, id))!);
}
export async function replaceAiConnection(env: ConnectionEnv, owner: string, id: string, name: string, credentials: AiCredentials) {
  validateIdentity(owner, name, credentials);
  const row = await rowFor(env, owner, id); if (!row) return null;
  const sealed = await sealAiCredentials(env, owner, id, row.provider, credentials);
  await env.CORPUS.prepare(`UPDATE ai_connections SET name = ?, hint = ?, sealed = ?, status = 'unverified',
    updated_at = ?, revision = revision + 1, catalog_version = NULL, checked_at = NULL, catalog = NULL
    WHERE owner_id = ? AND id = ? AND revision = ?`)
    .bind(name, credentials.apiKey.slice(-4), sealed, new Date().toISOString(), owner, id, row.revision).run();
  const after = await rowFor(env, owner, id);
  if (!after || after.revision !== row.revision + 1 || after.sealed !== sealed) throw new Error('Connection changed while replacing its key. Reload and try again.');
  return view(after);
}
export async function deleteAiConnection(env: ConnectionEnv, owner: string, id: string): Promise<boolean> {
  await ensureAiConnectionTable(env);
  const result = await env.CORPUS.prepare('DELETE FROM ai_connections WHERE owner_id = ? AND id = ?').bind(owner, id).run();
  return (result.meta.changes ?? 0) > 0;
}
/** CAS prevents a slow check with an old key marking a replaced/revoked key verified. */
export async function updateAiConnectionCheck(env: ConnectionEnv, owner: string, id: string, revision: number,
  status: ConnectionStatus, catalog: unknown = null, catalogVersion: string | null = null) {
  await ensureAiConnectionTable(env);
  const result = await env.CORPUS.prepare(`UPDATE ai_connections SET status = ?, checked_at = ?,
    catalog = ?, catalog_version = ? WHERE owner_id = ? AND id = ? AND revision = ?`)
    .bind(status, new Date().toISOString(), catalog ? JSON.stringify(catalog) : null, catalogVersion, owner, id, revision).run();
  return (result.meta.changes ?? 0) > 0;
}
