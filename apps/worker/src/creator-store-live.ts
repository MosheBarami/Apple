// Live Creator Store model search: the half of find_library_model that reaches past the bundled index.
//
// WHY THIS EXISTS. The bundled model library holds a few hundred rows. "crystal", "cave entrance" and "cart" are ordinary
// nouns it has nothing for, so a build fell back to plain Parts. The Creator Store itself holds thousands of free models
// for each of them, and Roblox's own Toolbox Service search answers for them.
//
// MEASURED 2026-10-04 (curl, no key, from the owner's Mac):
//   GET https://apis.roblox.com/toolbox-service/v2/assets:search?searchCategoryType=Model&query=crystal
//       &includeOnlyVerifiedCreators=true&maxPriceCents=0&searchView=Full
//   answers 200 with `creatorStoreAssets[]`, and each entry already carries hasScripts, scriptCount, the triangle count,
//   instanceCounts, the creator's `verified` flag, the vote counts, the price and the category, so one call both finds and
//   vets. Without a key it works today; the documented auth is `x-api-key` (scope creator-store-product:read) or a cookie,
//   so the key is sent when the worker holds one and the call is repeated without it if Roblox refuses the key. The old
//   search in assets.ts POSTs a JSON body to this same URL, which Roblox answers 403 "XSRF token invalid".
//
// WHAT IS REFUSED, fail closed (a field Roblox does not report counts as the worst case, never as fine):
//   not a Model, not free, creator not verified (Roblox itself counts), any script, a Package/Ad/MaterialPack, a Tool or
//   an Animation or audio inside, not a 3D category, over the triangle budget.
// What is NOT used: `capabilities.shouldSandbox`. It is true on essentially every Model (31 of 32 measured), so it
// separates nothing; scripts are the risk, and they are refused here and again in the place (tools.ts insertAndProveClean).
//
// Nothing here throws, and nothing here inserts: a row is only a candidate until insert_library_model has loaded it
// through the plugin's detached-tree scan and the in-place re-scan.
import type { FetchLike } from './assets';

export const LIVE_ID_PREFIX = 'cs:';
const SEARCH_URL = 'https://apis.roblox.com/toolbox-service/v2/assets:search';
const ASSET_URL = 'https://apis.roblox.com/toolbox-service/v2/assets/';
const MODEL_TYPE_ID = 10;
const TIMEOUT_MS = 8_000;
/** Triangle ceiling for one inserted model. Above it the row is refused; above SOFT it only ranks lower. */
export const LIVE_MAX_TRIANGLES = 60_000;
const SOFT_TRIANGLES = 15_000;
const PAGE_SIZE = 30;
const MAX_QUERIES = 3;
/** Enough relevant rows from one query that the next, broader one is not worth a request. */
const ENOUGH_RELEVANT = 5;

export interface LiveEnv {
  /** Open Cloud key, scope creator-store-product:read. Optional: the search answers without one today. */
  ROBLOX_API_KEY?: string;
}

/** A row in the shape find_library_model already returns (model-library.ts LibraryModel), plus what the live search knows. */
export interface LiveModel {
  id: string;
  name: string;
  genres: string[];
  kind: string;
  assetId: number;
  licence: string;
  attribution: string | null;
  triangles: number | null;
  size: number[] | null;
  source: 'creator_store_live';
  creator: string;
  votes: number;
  rating: number | null;
  meshParts: number;
  category: string;
  why: string;
}

export interface LiveSearch {
  results: LiveModel[];
  /** Entries Roblox returned, and why the others were refused (reason -> count). */
  checked: number;
  refused: Record<string, number>;
  queries: string[];
  endpoint: 'v2' | 'none';
  keyUsed: boolean;
  note: string;
  error?: string;
}

function obj(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v.length ? v : null;
}

/** "3d__nature" -> nature, "3d__structures" -> building, and so on; the kinds find_library_model already uses. */
function kindOfCategory(path: string): string {
  const leaf = path.replace(/^3d__/, '');
  if (leaf === 'nature') return 'nature';
  if (leaf === 'structures') return 'building';
  if (leaf === 'vehicles') return 'vehicle';
  if (leaf === 'characters') return 'character';
  if (leaf === 'weapons') return 'weapon';
  return 'prop';
}

function cleanName(raw: string): string {
  return raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

// ---------------------------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------------------------

/**
 * Whether one `creatorStoreAssets[]` entry (search view Full, or GET /assets/{id}) may be offered, and the row if so. Pure.
 * `reason` is a short stable phrase, counted in LiveSearch.refused so an empty answer says what it was empty of.
 */
export function judgeLiveModel(entry: unknown, opts: { maxTriangles?: number } = {}): { ok: true; model: LiveModel } | { ok: false; reason: string } {
  const root = obj(entry);
  const asset = obj(root.asset);
  const creator = obj(root.creator);
  const voting = obj(root.voting);
  const quantity = obj(obj(obj(root.creatorStoreProduct).purchasePrice).quantity);
  const id = num(asset.id);
  if (id === null || !Number.isSafeInteger(id) || id <= 0) return { ok: false, reason: 'no asset id' };
  const typeId = num(asset.assetTypeId) ?? num(asset.typeId);
  if (typeId !== MODEL_TYPE_ID) return { ok: false, reason: 'not a model' };
  if (num(quantity.significand) !== 0) return { ok: false, reason: 'not free' };
  const robloxOwned = num(creator.userId) === 1;
  if (creator.verified !== true && !robloxOwned) return { ok: false, reason: 'creator not verified' };
  if (typeof asset.hasScripts !== 'boolean' || num(asset.scriptCount) === null) return { ok: false, reason: 'script count not reported' };
  if (asset.hasScripts || (num(asset.scriptCount) ?? 0) > 0) return { ok: false, reason: 'carries scripts' };
  const subTypes = Array.isArray(asset.subTypes) ? asset.subTypes.map((t) => String(t)) : [];
  if (subTypes.some((t) => /package|^ad$|materialpack/i.test(t))) return { ok: false, reason: 'package, ad or material pack' };
  const counts = obj(asset.instanceCounts);
  if ((num(counts.tool) ?? 0) > 0 || (num(counts.animation) ?? 0) > 0 || (num(counts.audio) ?? 0) > 0) return { ok: false, reason: 'holds a tool, animation or audio' };
  const category = str(asset.categoryPath);
  if (!category || !category.startsWith('3d__')) return { ok: false, reason: 'not a 3D category' };
  const triangles = num(obj(asset.objectMeshSummary).triangles);
  if (triangles !== null && triangles > (opts.maxTriangles ?? LIVE_MAX_TRIANGLES)) return { ok: false, reason: 'too many triangles' };
  const name = cleanName(str(asset.name) ?? '');
  if (!name) return { ok: false, reason: 'no name' };

  const votes = num(voting.voteCount) ?? 0;
  const rating = num(voting.upVotePercent);
  const creatorName = cleanName(str(creator.name) ?? 'unknown');
  const meshParts = num(counts.meshPart) ?? 0;
  return {
    ok: true,
    model: {
      id: `${LIVE_ID_PREFIX}${id}`,
      name,
      genres: [],
      kind: kindOfCategory(category),
      assetId: id,
      licence: 'Roblox-free',
      attribution: `${creatorName}, Creator Store asset ${id}`,
      triangles,
      size: null,
      source: 'creator_store_live',
      creator: `${creatorName}${robloxOwned ? ' (Roblox)' : ' (verified)'}`,
      votes,
      rating,
      meshParts,
      category: category.replace(/^3d__/, ''),
      why: '',
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------------------------

const STOP = new Set(['a', 'an', 'the', 'of', 'for', 'with', 'and', 'in', 'on', 'to', 'my', 'some', 'that', 'this', 'near', 'into']);
/** Style words say how it should look, not what it is: they never decide relevance. */
const STYLE = new Set(['low', 'poly', 'lowpoly', 'stylized', 'stylised', 'cartoon', 'cartoony', 'realistic', 'simple', 'small', 'medium', 'large', 'big', 'huge', 'tiny', 'free', 'roblox', 'model', 'asset', 'mesh', '3d', 'cute', 'nice', 'detailed', 'high', 'quality']);

function words(text: string): string[] {
  return text.toLowerCase().replace(/([a-z])([A-Z])/g, '$1 $2').split(/[^a-z0-9]+/).filter(Boolean);
}
function stem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 3 && /(s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** The words of the request that name the thing (what relevance is measured on), in order. */
export function contentWords(query: string): string[] {
  const all = words(query).filter((w) => !STOP.has(w));
  const named = all.filter((w) => !STYLE.has(w));
  return (named.length ? named : all).map(stem);
}

/** The queries to try, narrowest-useful first: the whole phrase, its last two content words, its last. At most MAX_QUERIES. */
export function liveQueries(query: string): string[] {
  const all = words(query).filter((w) => !STOP.has(w)).slice(0, 6);
  const content = contentWords(query);
  const out: string[] = [];
  const add = (q: string) => { if (q && !out.includes(q)) out.push(q); };
  add(all.join(' '));
  if (content.length > 2) add(content.slice(-2).join(' '));
  if (content.length > 1) add(content[content.length - 1]!);
  return out.slice(0, MAX_QUERIES);
}

/**
 * Relevance 0..1: the share of the request's content words that are words of the row's own name. Stemmed, so "crystals" meets
 * "crystal". A request with no content words matches everything equally.
 */
export function relevanceOf(name: string, content: readonly string[]): number {
  if (!content.length) return 1;
  const own = new Set(words(name).map(stem));
  return content.filter((w) => own.has(w)).length / content.length;
}

/** Higher is better. Relevance dominates; then votes and approval, polygon sanity, a name that is just the thing, search position. */
export function scoreLiveModel(m: LiveModel, content: readonly string[], position: number, total: number): number {
  const relevance = relevanceOf(m.name, content);
  const ownWords = words(m.name).map(stem);
  const extra = content.length ? ownWords.filter((w) => !content.includes(w)).length : 0;
  // 0 votes is neutral, not bad: most clean free models have none. 1000+ votes at 95% earns the full 3.
  const quality = 3 * ((m.rating ?? 70) / 100) * Math.min(1, Math.log10(1 + m.votes) / 3);
  const poly = m.triangles === null ? -0.5 : m.triangles > SOFT_TRIANGLES * 2.5 ? -2 : m.triangles > SOFT_TRIANGLES ? -1 : 0;
  const tight = relevance > 0 ? Math.max(0, 1.5 - 0.3 * extra) : 0;
  const spam = m.name.length > 50 ? -1.5 : 0;
  // Enough people voted and most voted it down: usually a broken or misnamed model.
  const disliked = m.votes >= 20 && (m.rating ?? 100) < 60 ? -2 : 0;
  const place = total > 1 ? (1 - position / (total - 1)) * 1 : 0.5;
  return relevance * 10 + quality + poly + tight + spam + disliked + place;
}

function describe(m: LiveModel, relevance: number): string {
  const bits = [relevance >= 1 ? 'name has every word of the request' : relevance > 0 ? 'name has some words of the request' : 'weak name match'];
  if (m.votes > 0) bits.push(`${m.votes} votes${m.rating !== null ? `, ${m.rating}% up` : ''}`);
  if (m.triangles !== null) bits.push(`${m.triangles} triangles`);
  bits.push('0 scripts');
  return bits.join('; ');
}

// ---------------------------------------------------------------------------------------------
// The calls
// ---------------------------------------------------------------------------------------------

function defaultFetch(): FetchLike {
  return (url, init) => fetch(url, { ...(init as RequestInit), signal: AbortSignal.timeout(TIMEOUT_MS) }) as never;
}

function searchUrl(query: string): string {
  const p = new URLSearchParams({
    searchCategoryType: 'Model',
    query,
    maxPageSize: String(PAGE_SIZE),
    includeOnlyVerifiedCreators: 'true',
    maxPriceCents: '0',
    searchView: 'Full',
  });
  for (const t of ['Package', 'Ad', 'MaterialPack']) p.append('excludedModelSubTypes', t);
  return `${SEARCH_URL}?${p.toString()}`;
}

async function getJson(doFetch: FetchLike, url: string, key: string | undefined): Promise<{ ok: true; json: unknown; keyUsed: boolean } | { ok: false; status: number | null; message: string }> {
  const attempt = async (withKey: boolean) => {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (withKey && key) headers['x-api-key'] = key;
    const res = await doFetch(url, { method: 'GET', headers });
    return res;
  };
  try {
    let res = await attempt(true);
    let keyUsed = Boolean(key);
    // A key Roblox does not accept for this scope must not end the search: the call answers without one.
    if (key && (res.status === 401 || res.status === 403)) {
      res = await attempt(false);
      keyUsed = false;
    }
    if (!res.ok) return { ok: false, status: res.status, message: `Creator Store search answered HTTP ${res.status}` };
    return { ok: true, json: await res.json(), keyUsed };
  } catch (e) {
    return { ok: false, status: null, message: `Creator Store search failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Search the live Creator Store for free, script-free models from verified creators, ranked for the request.
 * Up to MAX_QUERIES calls: the whole phrase first, then its last content words while fewer than ENOUGH_RELEVANT relevant rows
 * have passed. `exclude` drops asset ids already rejected this run; `accept` is the caller's own test of a row's name. Never throws.
 */
export async function searchLiveModels(
  env: LiveEnv,
  query: string,
  opts: { limit?: number; maxTriangles?: number; exclude?: ReadonlySet<number>; accept?: (name: string) => boolean; fetchImpl?: FetchLike } = {},
): Promise<LiveSearch> {
  const limit = Math.max(1, Math.min(20, Math.floor(opts.limit ?? 8)));
  const queries = liveQueries(query);
  const empty = (note: string, error?: string): LiveSearch => ({ results: [], checked: 0, refused: {}, queries, endpoint: 'none', keyUsed: false, note, ...(error ? { error } : {}) });
  if (!queries.length) return empty('no search words were given');
  const doFetch = opts.fetchImpl ?? defaultFetch();
  const content = contentWords(query);
  const seen = new Set<number>();
  const refused: Record<string, number> = {};
  const pool: { m: LiveModel; score: number; relevance: number }[] = [];
  let checked = 0;
  let keyUsed = false;
  let failure: string | undefined;
  let answered = false;
  const ran: string[] = [];

  for (const q of queries) {
    ran.push(q);
    const got = await getJson(doFetch, searchUrl(q), env.ROBLOX_API_KEY);
    if (!got.ok) { failure = got.message; continue; }
    answered = true;
    keyUsed = keyUsed || got.keyUsed;
    const rows = obj(got.json).creatorStoreAssets;
    const entries = Array.isArray(rows) ? rows : [];
    const verdicts: LiveModel[] = [];
    for (const entry of entries) {
      const v = judgeLiveModel(entry, { maxTriangles: opts.maxTriangles });
      checked++;
      if (!v.ok) { refused[v.reason] = (refused[v.reason] ?? 0) + 1; continue; }
      if (seen.has(v.model.assetId)) continue;
      seen.add(v.model.assetId);
      if (opts.exclude?.has(v.model.assetId)) { refused['rejected earlier in this run'] = (refused['rejected earlier in this run'] ?? 0) + 1; continue; }
      if (opts.accept && !opts.accept(v.model.name)) { refused['name lacks the requested object'] = (refused['name lacks the requested object'] ?? 0) + 1; continue; }
      verdicts.push(v.model);
    }
    verdicts.forEach((m, i) => {
      const relevance = relevanceOf(m.name, content);
      pool.push({ m, relevance, score: scoreLiveModel(m, content, i, verdicts.length) });
    });
    if (pool.filter((p) => p.relevance >= 0.5).length >= ENOUGH_RELEVANT) break;
  }

  if (!answered) return { ...empty(failure ?? 'the Creator Store did not answer', failure), queries: ran };
  const relevant = pool.filter((p) => p.relevance > 0);
  const results = relevant
    .sort((a, b) => b.score - a.score || a.m.assetId - b.m.assetId)
    .slice(0, limit)
    .map((p) => ({ ...p.m, why: describe(p.m, p.relevance) }));
  const dropped = pool.length - relevant.length;
  const refusedText = Object.entries(refused).map(([why, n]) => `${n} ${why}`).join(', ');
  return {
    results,
    checked,
    refused,
    queries: ran,
    endpoint: 'v2',
    keyUsed,
    note: results.length
      ? `${results.length} live Creator Store model(s): free, verified creator, zero scripts by Roblox's own listing (${checked} checked${refusedText ? `; refused ${refusedText}` : ''}${dropped ? `; ${dropped} left out as unrelated by name` : ''}). The place is scanned again after insertion. Looks and fit are unverified until preview_library_models.`
      : `The live Creator Store had no free, script-free model from a verified creator whose name matches "${ran.join('" or "')}" (${checked} checked${refusedText ? `; refused ${refusedText}` : ''}${dropped ? `; ${dropped} unrelated by name` : ''}).`,
    ...(failure ? { error: failure } : {}),
  };
}

/** One asset by id, through the same gate. For an owner-approved id the run has not searched itself. */
export async function fetchLiveModel(env: LiveEnv, assetId: number, opts: { maxTriangles?: number; fetchImpl?: FetchLike } = {}): Promise<{ ok: true; model: LiveModel } | { ok: false; reason: string }> {
  if (!Number.isSafeInteger(assetId) || assetId <= 0) return { ok: false, reason: 'not a valid asset id' };
  const got = await getJson(opts.fetchImpl ?? defaultFetch(), `${ASSET_URL}${assetId}`, env.ROBLOX_API_KEY);
  if (!got.ok) return { ok: false, reason: got.message };
  const verdict = judgeLiveModel(got.json, { maxTriangles: opts.maxTriangles });
  if (verdict.ok) verdict.model.why = describe(verdict.model, 1);
  return verdict;
}

/** The asset id inside a live library id, or null when the id is not one. */
export function liveAssetIdOf(id: string): number | null {
  if (!id.startsWith(LIVE_ID_PREFIX)) return null;
  const rest = id.slice(LIVE_ID_PREFIX.length);
  if (!/^[1-9][0-9]{0,15}$/.test(rest)) return null;
  const n = Number(rest);
  return Number.isSafeInteger(n) ? n : null;
}
