// The 3D model library (D-MODELLIB-1): search it, get one row into the place, and refuse a prop
// hand-built from parts when the library already holds one.
//
// WHAT IS BUNDLED. The worker cannot read the repository, so the compact index that
// packages/asset-library/models/build.mjs derives from the files on disk and the Creator Store
// harvest is compiled in. Two kinds of row:
//   - a Creator Store asset id (number): free, script-free by Roblox's own details, owned by Roblox
//     itself (LoadAsset refuses other creators' models, measured 2026-09-23). Inserted by id through the plugin's insert_asset, then re-scanned in the place.
//   - a store path (string) to a CC0/CC-BY/MIT file (.glb, .fbx, .rbxm with every script already
//     stripped by scan-rbx.luau). Its bytes live in the D1 static store at /model-library/<path>
//     (packages/asset-library/models/upload.mjs); insert_library_model uploads that ONE file as a
//     Model into the user's own Roblox account with their key, then inserts the new id.
import index from '../../../packages/asset-library/models/index.json';
import type { Env } from './env';
import { serveStatic } from './static';
import { getUploadStatus, uploadAsset, type CreatorEnv, type Result, type UploadedAsset, type UploadAssetInput } from './creator-dashboard';
import { describeRobloxCredential } from './user-credentials';

type Row = [string, string, number, number, string, number | string, number, string | null, number | null, number[] | null];
interface Index { genres: string[]; kinds: string[]; licences: string[]; rows: Row[] }
const IDX = index as unknown as Index;

export interface LibraryModel {
  id: string;
  name: string;
  genres: string[];
  kind: string;
  /** Creator Store asset id, when the row is inserted by id. */
  assetId?: number;
  /** Store path, when the row is a downloaded file that is uploaded on first use. */
  file?: string;
  licence: string;
  attribution: string | null;
  triangles: number | null;
  /** Bounding size in the file's own units (studs for .rbxm; usually metres for .glb). */
  size: number[] | null;
}

interface Entry { m: LibraryModel; nameTokens: string[]; tagTokens: string[] }

/** "WoodenCrate_02" -> wooden, crate, 02. */
export function tokensOf(s: string): string[] {
  return String(s).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}
// A plural or a longer form matches its stem ("trees" finds tree), but only for words of 3+
// letters: otherwise "a" would match everything that starts with an a.
/** Singular form, so "crates" meets "crate" while "crater" and "cartoon" stay other words. */
function stem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 3 && /(s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

function matches(q: string, t: string): boolean {
  return q === t || stem(q) === stem(t);
}

let entries: Entry[] | null = null;
let byId: Map<string, Entry> | null = null;
function all(): Entry[] {
  if (entries) return entries;
  entries = IDX.rows.map(([id, name, genreBits, kind, tags, ref, lic, attribution, triangles, size]) => {
    const m: LibraryModel = {
      id, name,
      genres: IDX.genres.filter((_, i) => genreBits & (1 << i)),
      kind: IDX.kinds[kind] ?? 'prop',
      ...(typeof ref === 'number' ? { assetId: ref } : { file: ref }),
      licence: IDX.licences[lic] ?? 'unknown',
      attribution, triangles, size,
    };
    return { m, nameTokens: tokensOf(name), tagTokens: [...tokensOf(tags), m.kind, ...m.genres.flatMap(tokensOf)] };
  });
  byId = new Map(entries.map((e) => [e.m.id, e]));
  return entries;
}

export function libraryModelCount(): number {
  return all().length;
}

/** Exact lookup: only a row the index names resolves, so an id cannot be made up. */
export function libraryModel(id: string): LibraryModel | null {
  all();
  return byId!.get(String(id ?? ''))?.m ?? null;
}

export const LIBRARY_GENRES = IDX.genres;
export const LIBRARY_KINDS = IDX.kinds;

export function findLibraryModels(input: { query?: string; genre?: string; kind?: string; limit?: number }) {
  const limit = Math.max(1, Math.min(40, Math.floor(Number(input.limit ?? 10)) || 10));
  const words = tokensOf(input.query ?? '');
  const genre = input.genre ? IDX.genres.find((g) => g.toLowerCase() === String(input.genre).toLowerCase()) : undefined;
  const pool = all().filter((e) => (!genre || e.m.genres.includes(genre)) && (!input.kind || e.m.kind === input.kind));
  if (!words.length) {
    return { total: pool.length, results: [], genres: IDX.genres, kinds: IDX.kinds, note: 'Pass plain words for the object, e.g. "palm tree" or "police car".' };
  }
  const scored: { e: Entry; hit: number; score: number }[] = [];
  for (const e of pool) {
    let hit = 0;
    let score = 0;
    for (const w of words) {
      if (e.nameTokens.some((t) => matches(w, t))) { hit++; score += 2; }
      else if (e.tagTokens.some((t) => matches(w, t))) { hit++; score += 1; }
    }
    // One word must be in the row's own name: a tag match alone would return every row of a pack.
    if (hit && e.nameTokens.some((t) => words.some((w) => matches(w, t)))) scored.push({ e, hit, score });
  }
  const best = scored.reduce((m, s) => Math.max(m, s.hit), 0);
  const kept = scored
    .filter((s) => s.hit === best)
    // Official Roblox and Creator Store ids first (no upload needed), then shorter names.
    .sort((a, b) => b.score - a.score || Number(b.e.m.assetId !== undefined) - Number(a.e.m.assetId !== undefined) || a.e.nameTokens.length - b.e.nameTokens.length || a.e.m.id.localeCompare(b.e.m.id));
  return {
    total: kept.length,
    matchedWords: best,
    ofWords: words.length,
    results: kept.slice(0, limit).map((s) => s.e.m),
    ...(kept.length ? {} : { note: 'Nothing in the library matched. Try one plain noun (tree, car, crate, house), or drop the genre filter.' }),
  };
}

// ---------------------------------------------------------------------------------------------
// The guard: a prop that the library holds is inserted from it, not assembled from parts.
// ---------------------------------------------------------------------------------------------

/**
 * Names that are the world's surface, not a prop. A primitive part stays the right tool for these:
 * terrain, baseplates, paths, zones, spawns, walls, floors, platforms, obby stages and the like.
 */
const STRUCTURAL = /\b(terrain|baseplate|base|ground|floor|path|road|street|sidewalk|lane|track|zone|area|region|spawn|spawnlocation|checkpoint|wall|walls|fence|barrier|border|platform|platforms|stage|stages|obby|course|level|map|arena|plot|lot|tile|tiles|ramp|stairs|step|steps|bridge|water|lava|kill|killbrick|boundary|invisible|hitbox|trigger|region|pad|button|conveyor|dropper|lighting|folder|ui|gui)\b/;

interface PlannedItem { className?: unknown; name?: unknown; children?: unknown }

function partCount(item: PlannedItem): number {
  const kids = Array.isArray(item.children) ? (item.children as PlannedItem[]) : [];
  let n = /Part$|^Part$|^WedgePart$|^CornerWedgePart$|^TrussPart$|^MeshPart$|^UnionOperation$/.test(String(item.className ?? '')) ? 1 : 0;
  for (const k of kids) n += partCount(k);
  return n;
}

/**
 * Why create_instances must not build this batch, or null when it may.
 *
 * Refused: a Model (or Folder) of two or more parts whose own name is a thing the library holds —
 * a tree, a car, a house, a crate — and is not a structural surface. Allowed: single parts,
 * structural names, any prop the library has nothing for, and any prop insert_library_model already
 * failed to deliver in this run (the fallback the prompt describes).
 */
export function handBuiltPropRefusal(items: readonly unknown[], misses?: ReadonlySet<string>): string | null {
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as PlannedItem;
    const cls = String(item.className ?? '');
    if (cls !== 'Model' && cls !== 'Folder') continue;
    const name = String(item.name ?? '');
    const words = tokensOf(name);
    if (!words.length || STRUCTURAL.test(words.join(' '))) continue;
    if (partCount(item) < 2) continue;
    // insert_library_model already failed for this thing in this run: parts are the fallback now.
    if (misses && words.some((w) => misses.has(w))) continue;
    const hit = findLibraryModels({ query: words.filter((w) => !/^\d+$/.test(w)).join(' '), limit: 3 });
    // All the name's words, or all but one (a colour or an adjective the library has no tag for).
    if (!hit.results.length || !('matchedWords' in hit) || hit.matchedWords < Math.max(1, hit.ofWords - 1)) continue;
    const ids = hit.results.map((r) => r.id).join(', ');
    return `"${name}" is a prop the model library already holds (${ids}). Insert it with insert_library_model instead of assembling it from parts — library models are real, detailed assets and a stack of blocks is not. Parts stay the right tool for terrain, baseplates, paths, walls, platforms and zones. If insert_library_model fails for it, this guard stands down and the part-built version is accepted.`;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Upload of a file row into the user's own account.
// ---------------------------------------------------------------------------------------------

const URL_PREFIX = '/model-library/';
export const CONTENT_TYPES: Readonly<Record<string, string>> = {
  glb: 'model/gltf-binary',
  fbx: 'model/fbx',
  rbxm: 'model/x-rbxm',
};

/** The stored bytes of a library file, or null when the store does not hold it. */
export async function readLibraryModelFile(
  env: Env,
  file: string,
  serve: (env: Env, req: Request) => Promise<Response> = serveStatic,
): Promise<Uint8Array | null> {
  const res = await serve(env, new Request(`https://model-library.internal${URL_PREFIX}${file}`));
  // A missing path answers with the marketing 404 page, so the status and type are checked.
  if (res.status !== 200 || /text\/html/.test(String(res.headers.get('content-type') ?? ''))) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  return bytes.length > 16 ? bytes : null;
}

export interface ModelUploadDeps {
  describeCredential?: (env: CreatorEnv, userId: string) => Promise<{ scopes: readonly string[] } | null>;
  read?: (env: Env, file: string) => Promise<Uint8Array | null>;
  upload?: (env: CreatorEnv, userId: string, input: UploadAssetInput) => Promise<Result<UploadedAsset>>;
  uploadStatus?: (env: CreatorEnv, userId: string, operationId: string) => Promise<Result<UploadedAsset>>;
  sleep?: (ms: number) => Promise<void>;
}

/** A Model takes longer than an Image to process; past this the caller gets the operation id. */
const POLLS = 10;
const POLL_MS = 3_000;
/** Uploads are permanent in the user's account, so one run may make only a few. */
export const MAX_UPLOADS_PER_RUN = 12;

export type ModelUpload = { assetId: number } | { pending: true; operationId: string } | { error: string; stage: string };

export async function uploadLibraryModel(env: Env, userId: string | undefined, m: LibraryModel, deps: ModelUploadDeps = {}): Promise<ModelUpload> {
  if (!m.file) return { error: `${m.id} is a Creator Store id, not a file`, stage: 'library' };
  const ext = m.file.slice(m.file.lastIndexOf('.') + 1).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) return { error: `.${ext} cannot be uploaded as a Roblox Model`, stage: 'library' };
  if (!userId) return { error: 'This library model is a file: it is uploaded into the signed-in user\'s own Roblox account, and there is no user here.', stage: 'roblox_key' };
  const cred = await (deps.describeCredential ?? describeRobloxCredential)(env as CreatorEnv, userId);
  if (!cred || !cred.scopes.includes('asset:write')) {
    return { error: 'Connect a Roblox Open Cloud key with the asset:write scope in Settings first — a library file is created as a Model in your own Roblox account. Creator Store rows in the library need no key.', stage: 'roblox_key' };
  }
  const bytes = await (deps.read ?? ((e, f) => readLibraryModelFile(e, f)))(env, m.file);
  if (!bytes) return { error: 'The library file is not in the static store yet (packages/asset-library/models/upload.mjs has not been run for it). Nothing was uploaded.', stage: 'library' };
  const up = await (deps.upload ?? ((e, u, i) => uploadAsset(e, u, i)))(env as CreatorEnv, userId, {
    file: bytes.slice().buffer,
    contentType,
    type: 'Model',
    displayName: m.name.replace(/\s+/g, ' ').trim().slice(0, 50) || 'Library model',
    description: `${m.name}, ${m.licence}${m.attribution ? ` — ${m.attribution}` : ''}. Added by Apple from its model library.`.slice(0, 1000),
    expectedPrice: 0,
  });
  if (!up.ok) return { error: up.error, stage: 'upload' };
  const status = deps.uploadStatus ?? ((e, u, id) => getUploadStatus(e, u, id));
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let asset = up.data;
  for (let i = 0; i < POLLS && !asset.done; i++) {
    await sleep(POLL_MS);
    const s = await status(env as CreatorEnv, userId, asset.operationId);
    if (!s.ok) return { error: s.error, stage: 'upload' };
    asset = s.data;
  }
  if (!asset.done || asset.assetId === null) return { pending: true, operationId: asset.operationId };
  return { assetId: asset.assetId };
}

// ---------------------------------------------------------------------------------------------
// Placement: scale to a sensible size and stand it on `position`.
// ---------------------------------------------------------------------------------------------

/** Height in studs a row of each kind is scaled to when the caller names none (a Roblox avatar is ~5). */
export const DEFAULT_HEIGHT: Readonly<Record<string, number>> = {
  building: 24, prop: 3, nature: 14, vehicle: 6, character: 5.5, pet: 3, weapon: 4, kit: 12,
};

type Exec = (op: Record<string, unknown>, timeoutMs?: number) => Promise<{ ok: boolean; data?: unknown; error?: string }>;
const vec = (v: unknown): number[] | null => (Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(Number(n))) ? v.map(Number) : null);

/**
 * Scale then move the inserted root so its bottom-centre sits on `position`.
 *
 * A Creator Store row keeps its author's scale unless the caller asks (it was built in studs); a
 * file row is scaled to `height`, or the kind's default, because glTF units are usually metres.
 */
export async function placeInserted(
  exec: Exec,
  path: string,
  m: LibraryModel,
  want: { position?: number[]; scale?: number; height?: number },
): Promise<{ position: number[]; size: number[] | null; scaledBy: number | null } | { error: string }> {
  const bounds = async () => {
    const b = await exec({ op: 'spatial_query', action: 'bounds', path }, 15_000);
    const d = (b.ok ? b.data : null) as { center?: unknown; size?: unknown; bottomY?: unknown } | null;
    const center = vec(d?.center);
    const size = vec(d?.size);
    return center && size && Number.isFinite(Number(d?.bottomY)) ? { center, size, bottomY: Number(d!.bottomY) } : null;
  };
  let b = await bounds();
  if (!b) return { error: 'the inserted model has no measurable bounds' };
  let factor: number | null = null;
  if (want.scale !== undefined) factor = want.scale;
  else {
    const target = want.height ?? (m.file ? DEFAULT_HEIGHT[m.kind] ?? 4 : undefined);
    const h = b.size[1] ?? 0;
    if (target !== undefined && h > 0) factor = target / h;
  }
  if (factor !== null && Math.abs(factor - 1) > 0.01) {
    factor = Math.min(1000, Math.max(0.001, factor));
    const s = await exec({ op: 'transform_instances', paths: [path], scale: factor }, 20_000);
    if (!s.ok) return { error: `scaling failed: ${s.error ?? 'transform_instances failed'}` };
    b = await bounds();
    if (!b) return { error: 'the scaled model has no measurable bounds' };
  } else factor = null;
  const to = want.position ?? [0, 0, 0];
  const move = [to[0]! - b.center[0]!, to[1]! - b.bottomY, to[2]! - b.center[2]!];
  if (move.some((n) => Math.abs(n) > 0.001)) {
    const mv = await exec({ op: 'transform_instances', paths: [path], move }, 20_000);
    if (!mv.ok) return { error: `moving failed: ${mv.error ?? 'transform_instances failed'}` };
  }
  return { position: to, size: b.size.map((n) => Math.round(n * 100) / 100), scaledBy: factor === null ? null : Math.round(factor * 1000) / 1000 };
}
