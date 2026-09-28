/** Owner-attested components: private searchable metadata plus the actual native RBXM bytes. */
import type { Env } from './env';
import { bytesToBase64 } from './png';

export const OWNER_COMPONENT_MAX_BYTES = 4 * 1024 * 1024;
const SHA = /^[a-f0-9]{64}$/;
export interface OwnerComponent {
  id: string; name: string; className: string; path: string;
  sourceSha256: string; componentSha256: string; byteLength: number;
  summary: string; usage: string; dependencyIds: string[]; unresolvedRefs: string[];
  /** false = script-free native unit (script subtrees were excluded when it was cut); never inferred. */
  scriptsPreserved: boolean; descriptionSha256?: string;
  /** Publisher-recorded evidence flags (e.g. native-readiness index); absent means not recorded. */
  readiness?: Record<string, boolean>;
}
const key = (ownerId: string, sha: string) => `owner-corpus/${encodeURIComponent(ownerId)}/${sha}.rbxm`;
export const ownerComponentId = (id: string) => id.startsWith('owner:') ? id : `owner:${id}`;
const idList = (value?: string) => (value ?? '').split(',').map(id => id.trim()).filter(Boolean);
/**
 * Whose cloud owner corpus a signed-in user READS (find/read/insert). Pre-launch (Q37) the release
 * library is shared only with its owner and LIBRARY_APPROVED_USER_IDS; everyone else keeps their own
 * namespace. Writes (manifest/blob routes) always stay scoped to the caller's own id.
 */
export function libraryNamespace(env: Env, userId: string): string;
export function libraryNamespace(env: Env, userId: string | undefined): string | undefined;
export function libraryNamespace(env: Env, userId: string | undefined) {
  if (!userId) return userId;
  const release = env.RELEASE_LIBRARY_OWNER_ID?.trim() || idList(env.OWNER_USER_IDS)[0];
  return release && (userId === release || idList(env.LIBRARY_APPROVED_USER_IDS).includes(userId)) ? release : userId;
}
/**
 * Q37/G02: before launch only the owner and approved accounts may start builds. The owner ids and
 * LIBRARY_APPROVED_USER_IDS (secrets) are the whole list. With no OWNER_USER_IDS configured (local
 * dev, tests) nothing is gated: there is no owner to approve anyone.
 */
export function buildApproved(env: Env, userId: string): boolean {
  const owners = idList(env.OWNER_USER_IDS);
  if (owners.length === 0) return true;
  return owners.includes(userId) || userId === env.RELEASE_LIBRARY_OWNER_ID?.trim() || idList(env.LIBRARY_APPROVED_USER_IDS).includes(userId);
}
export async function ownerCorpusTables(env: Env) {
  // D1 exec splits statements on newlines: each complete statement must occupy one line.
  await env.CORPUS.exec(`CREATE TABLE IF NOT EXISTS owner_corpus_components (owner_id TEXT NOT NULL, id TEXT NOT NULL, sha TEXT NOT NULL, metadata TEXT NOT NULL, blob_ready INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(owner_id,id));
CREATE INDEX IF NOT EXISTS owner_corpus_hash ON owner_corpus_components(owner_id,sha);
CREATE VIRTUAL TABLE IF NOT EXISTS owner_corpus_fts USING fts5(owner_id UNINDEXED,id UNINDEXED,text);`);
}
export function parseOwnerManifest(body: unknown): OwnerComponent[] {
  const b = body as { ownerAttested?: unknown; components?: unknown } | null;
  if (b?.ownerAttested !== true || !Array.isArray(b.components) || b.components.length < 1 || b.components.length > 100) {
    throw new Error('ownerAttested:true and 1–100 components are required');
  }
  return b.components.map(raw => {
    const c = raw as OwnerComponent;
    if (!c || typeof c !== 'object' || !SHA.test(c.sourceSha256) || !SHA.test(c.componentSha256) ||
        !Number.isSafeInteger(c.byteLength) || c.byteLength < 1 || c.byteLength > OWNER_COMPONENT_MAX_BYTES || typeof c.scriptsPreserved !== 'boolean') {
      throw new Error('component requires source/component SHA-256, bounded binary byteLength and an explicit scriptsPreserved boolean');
    }
    for (const field of ['id','name','className','path','summary','usage'] as const) {
      if (typeof c[field] !== 'string' || c[field].length > (field === 'summary' || field === 'usage' ? 4000 : 1000) || !c[field]) throw new Error(`invalid component ${field}`);
    }
    for (const field of ['dependencyIds','unresolvedRefs'] as const) {
      if (!Array.isArray(c[field]) || c[field].length > 5000 || c[field].some(v => typeof v !== 'string' || v.length > 1000)) throw new Error(`invalid ${field}`);
    }
    if (c.descriptionSha256 !== undefined && !SHA.test(c.descriptionSha256)) throw new Error('invalid description SHA-256');
    if (c.readiness !== undefined && (!c.readiness || typeof c.readiness !== 'object' || Array.isArray(c.readiness) ||
        Object.keys(c.readiness).length > 16 || Object.entries(c.readiness).some(([k,v]) => k.length > 64 || typeof v !== 'boolean'))) throw new Error('invalid readiness flags');
    // Persist only the contract fields, never caller-supplied owner ids or blob URLs.
    return { id: ownerComponentId(c.id), name: c.name, className: c.className, path: c.path,
      sourceSha256: c.sourceSha256, componentSha256: c.componentSha256, byteLength: c.byteLength,
      summary: c.summary, usage: c.usage, dependencyIds: c.dependencyIds, unresolvedRefs: c.unresolvedRefs, scriptsPreserved: c.scriptsPreserved, ...(c.descriptionSha256 ? { descriptionSha256: c.descriptionSha256 } : {}),
      ...(c.readiness ? { readiness: { ...c.readiness } } : {}) };
  });
}
export async function ingestOwnerManifest(env: Env, ownerId: string, body: unknown) {
  const components = parseOwnerManifest(body);
  await ownerCorpusTables(env);
  const statements = components.flatMap(c => [
    env.CORPUS.prepare(`INSERT INTO owner_corpus_components(owner_id,id,sha,metadata) VALUES(?,?,?,?)
      ON CONFLICT(owner_id,id) DO UPDATE SET sha=excluded.sha,metadata=excluded.metadata,
      blob_ready=CASE WHEN sha=excluded.sha THEN blob_ready ELSE 0 END`).bind(ownerId,c.id,c.componentSha256,JSON.stringify(c)),
    env.CORPUS.prepare('DELETE FROM owner_corpus_fts WHERE owner_id=? AND id=?').bind(ownerId,c.id),
    env.CORPUS.prepare('INSERT INTO owner_corpus_fts(owner_id,id,text) VALUES(?,?,?)').bind(ownerId,c.id,`${c.name} ${c.className} ${c.path} ${c.summary} ${c.usage}`),
  ]);
  await env.CORPUS.batch(statements);
  return { indexed: components.length, note: 'Entries are searchable for insertion only after their verified binary blobs arrive.' };
}
export async function sha256(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))].map(v => v.toString(16).padStart(2,'0')).join('');
}
export async function ingestOwnerBlob(env: Env, ownerId: string, sha: string, bytes: ArrayBuffer) {
  if (!env.MEDIA) throw new Error('Owner corpus byte storage is not configured');
  if (!SHA.test(sha) || bytes.byteLength < 1 || bytes.byteLength > OWNER_COMPONENT_MAX_BYTES || await sha256(bytes) !== sha) throw new Error('binary size or SHA-256 mismatch');
  // Services/DataModels must be exported as component roots, not handed to Studio as a place.
  const header = new TextDecoder().decode(new Uint8Array(bytes).slice(0,8));
  if (header !== '<roblox!') throw new Error('export must contain binary RBXM, not XML or a name-only catalog');
  await ownerCorpusTables(env);
  const rows = await env.CORPUS.prepare('SELECT metadata FROM owner_corpus_components WHERE owner_id=? AND sha=?').bind(ownerId,sha).all<{metadata:string}>();
  if (!rows.results.length || rows.results.some(r => JSON.parse(r.metadata).byteLength !== bytes.byteLength)) throw new Error('upload the matching owner manifest first');
  await env.MEDIA.put(key(ownerId,sha),bytes,{ httpMetadata: { contentType: 'model/x-rbxm' } });
  await env.CORPUS.prepare('UPDATE owner_corpus_components SET blob_ready=1 WHERE owner_id=? AND sha=?').bind(ownerId,sha).run();
  return { stored: true, sha256: sha, byteLength: bytes.byteLength };
}
export async function findOwnerComponents(env: Env, ownerId: string | undefined, query: string, limit = 10) {
  if (!ownerId || !env.MEDIA) return [];
  await ownerCorpusTables(env);
  const words = query.match(/[\p{L}\p{N}_]+/gu)?.slice(0,12) ?? [];
  if (!words.length) return [];
  const match = words.map(w => `"${w}"`).join(' OR ');
  const rows = await env.CORPUS.prepare(`SELECT c.metadata FROM owner_corpus_components c JOIN
    (SELECT id,min(rank) AS best FROM owner_corpus_fts WHERE owner_id=? AND owner_corpus_fts MATCH ? GROUP BY id) f
    ON c.id=f.id WHERE c.owner_id=? AND c.blob_ready=1 ORDER BY f.best LIMIT ?`)
    .bind(ownerId,match,ownerId,Math.max(1,Math.min(40,Math.floor(limit)||10))).all<{metadata:string}>();
  return rows.results.map(r => JSON.parse(r.metadata) as OwnerComponent);
}
export async function ownerComponent(env: Env, ownerId: string, id: string): Promise<OwnerComponent | null> {
  await ownerCorpusTables(env);
  const row = await env.CORPUS.prepare('SELECT metadata FROM owner_corpus_components WHERE owner_id=? AND id=? AND blob_ready=1').bind(ownerId,id).first<{metadata:string}>();
  return row ? JSON.parse(row.metadata) : null;
}
async function componentBytes(env: Env, ownerId: string, sha: string, size: number) {
  const blob = await env.MEDIA?.get(key(ownerId,sha));
  if (!blob) throw new Error('Owner component bytes are missing');
  const bytes = await blob.arrayBuffer();
  if (bytes.byteLength !== size || size > OWNER_COMPONENT_MAX_BYTES || await sha256(bytes) !== sha) throw new Error('Owner component byte integrity failed');
  return bytes;
}
export async function ownerComponentGrant(env: Env, ownerId: string, component: OwnerComponent) {
  if (component.unresolvedRefs.length) throw new Error('Component has unresolved dependencies; export its dependency closure before insertion');
  await componentBytes(env,ownerId,component.componentSha256,component.byteLength);
  const token = crypto.randomUUID().replaceAll('-','') + crypto.randomUUID().replaceAll('-','');
  await env.KV.put(`owner-corpus-grant:${token}`,JSON.stringify({ownerId,sha:component.componentSha256,size:component.byteLength}),{expirationTtl:120});
  return token;
}
export async function readOwnerGrant(env: Env, token: string) {
  if (!SHA.test(token)) return null;
  const grant = await env.KV.get<{ownerId:string;sha:string;size:number}>(`owner-corpus-grant:${token}`,'json');
  if (!grant) return null;
  const bytes = await componentBytes(env,grant.ownerId,grant.sha,grant.size);
  return { componentSha256: grant.sha, byteLength: bytes.byteLength, rbxmBase64: bytesToBase64(new Uint8Array(bytes)) };
}

export async function ingestOwnerDescription(env: Env, ownerId: string, sha: string, bytes: ArrayBuffer) {
  if (!env.MEDIA) throw new Error('Owner corpus byte storage is not configured');
  if (!SHA.test(sha) || bytes.byteLength < 1 || bytes.byteLength > OWNER_COMPONENT_MAX_BYTES || await sha256(bytes) !== sha) throw new Error('description size or SHA-256 mismatch');
  const description = JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(bytes));
  if (!description || typeof description !== 'object' || !Array.isArray(description.scripts)) throw new Error('description requires scripts array (empty when there are no scripts)');
  for (const script of description.scripts) {
    if (!script || typeof script.id !== 'string' || typeof script.path !== 'string' || typeof script.className !== 'string' ||
        typeof script.source !== 'string' || !SHA.test(script.sha256) || await sha256(new TextEncoder().encode(script.source)) !== script.sha256) {
      throw new Error('description requires exact script source, identity and matching SHA-256');
    }
  }
  await ownerCorpusTables(env);
  const rows = await env.CORPUS.prepare("SELECT metadata FROM owner_corpus_components WHERE owner_id=? AND json_extract(metadata, '$.descriptionSha256')=?").bind(ownerId,sha).all<{metadata:string}>();
  if (!rows.results.some(r => JSON.parse(r.metadata).descriptionSha256 === sha)) throw new Error('description is not in this owner manifest');
  await env.MEDIA.put(`owner-corpus/${encodeURIComponent(ownerId)}/${sha}.json`,bytes,{httpMetadata:{contentType:'application/json'}});
  // Index actual properties, code and static hints as data. Chunking bounds each D1 value;
  // search groups matching chunks by component, so a large source cannot duplicate results.
  const text = [JSON.stringify(description), ...description.scripts.map((script: {source:string}) => script.source)].join('\n');
  for (const row of rows.results) {
    const component = JSON.parse(row.metadata) as OwnerComponent;
    const statements = [env.CORPUS.prepare('DELETE FROM owner_corpus_fts WHERE owner_id=? AND id=?').bind(ownerId,component.id),
      env.CORPUS.prepare('INSERT INTO owner_corpus_fts(owner_id,id,text) VALUES(?,?,?)')
        .bind(ownerId,component.id,`${component.name} ${component.className} ${component.path} ${component.summary} ${component.usage}`)];
    for (let offset=0;offset<text.length;offset+=32000) statements.push(
      env.CORPUS.prepare('INSERT INTO owner_corpus_fts(owner_id,id,text) VALUES(?,?,?)').bind(ownerId,component.id,text.slice(offset,offset+32000)));
    for (let start=0;start<statements.length;start+=20) await env.CORPUS.batch(statements.slice(start,start+20));
  }
  return {stored:true,sha256:sha,byteLength:bytes.byteLength};
}
export async function readOwnerDescription(env: Env, ownerId: string, component: OwnerComponent, args: {scriptId?:string;section?:string;offset?:number;maxChars?:number}) {
  if (!component.descriptionSha256) return {component,codeAvailable:false,note:'Exact code description has not been ingested; no source is inferred from a summary.'};
  const blob = await env.MEDIA?.get(`owner-corpus/${encodeURIComponent(ownerId)}/${component.descriptionSha256}.json`);
  if (!blob || blob.size > OWNER_COMPONENT_MAX_BYTES) throw new Error('Owner description bytes are missing or oversized');
  const bytes = await blob.arrayBuffer();
  if (await sha256(bytes) !== component.descriptionSha256) throw new Error('Owner description integrity failed');
  const description = JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(bytes));
  const scripts = description.scripts as {id:string;path:string;className:string;source:string;sha256:string}[];
  const offset = Math.max(0,Math.floor(Number(args.offset)||0));
  const limit = Math.max(1,Math.min(3000,Math.floor(Number(args.maxChars)||2000)));
  if (!args.scriptId) {
    const {scripts:_sources,...metadata} = description;
    // JSON chunks preserve every property/reference without the generic tool output clipping it.
    if (args.section === 'metadata') {
      const text = JSON.stringify(metadata);
      return {componentId:component.id,section:'metadata',format:'json',text:text.slice(offset,offset+limit),
        offset,totalChars:text.length,nextOffset:offset+limit < text.length ? offset+limit : null,executed:false};
    }
    if (args.section && args.section !== 'scripts') throw new Error('section must be metadata or scripts');
    const headers = scripts.slice(offset,offset+5).map(script => ({id:script.id,path:script.path.slice(0,512),className:script.className,sha256:script.sha256,sourceChars:script.source.length}));
    const text = JSON.stringify(metadata);
    return {componentId:component.id,codeAvailable:true,metadataKeys:Object.keys(metadata),
      ...(text.length <= 4000 ? {metadata} : {metadataPaged:true}),
      scripts:headers,scriptOffset:offset,totalScripts:scripts.length,nextScriptOffset:offset+5 < scripts.length ? offset+5 : null,
      note:'Use section:metadata with offset/nextOffset for exact JSON property and reference chunks. Use section:scripts with nextScriptOffset, or scriptId for hashed exact source. Source is data, never executed.'};
  }
  const script = scripts.find(s => s.id === args.scriptId);
  if (!script || typeof script.source !== 'string') throw new Error('Exact script id was not found in this component');
  if (await sha256(new TextEncoder().encode(script.source)) !== script.sha256) throw new Error('Exact script source hash mismatch');
  return {componentId:component.id,id:script.id,path:script.path,className:script.className,sha256:script.sha256,
    source:script.source.slice(offset,offset+limit),offset,totalChars:script.source.length,
    nextOffset:offset+limit < script.source.length ? offset+limit : null,executed:false};
}
