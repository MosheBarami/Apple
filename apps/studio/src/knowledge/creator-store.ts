// Creator Store (Roblox toolbox) search for the agent: keyword search, then details and thumbnails for the hits.
// Endpoints (public, no key): apis.roblox.com/toolbox-service/v1/{marketplace/<assetType>, items/details} and
// thumbnails.roblox.com/v1/assets.

export type StoreCategory = 'model' | 'audio' | 'decal' | 'mesh' | 'animation' | 'video' | 'plugin';

/** Roblox AssetTypeId values accepted by /marketplace/{id}. */
export const CATEGORY_IDS: Record<StoreCategory, number> = {
  model: 10,
  audio: 3,
  decal: 13,
  mesh: 40,
  animation: 24,
  video: 62,
  plugin: 38,
};

export interface CreatorStoreItem {
  id: number;
  name: string;
  category: StoreCategory | string;
  creator: string;
  creatorVerified: boolean;
  description: string;
  link: string;
  thumbnailUrl: string | null;
  hasScripts: boolean;
  endorsed: boolean;
  votes: number | null;
  upVotePercent: number | null;
  free: boolean | null;
  triangles: number | null;
  /** Instance counts inside a model, non-zero entries only. */
  instances: Record<string, number>;
  durationSeconds: number | null;
  audio: { title: string; artist: string; genre: string } | null;
  updated: string | null;
}

export interface CreatorStoreResult {
  query: string;
  category: StoreCategory;
  total: number;
  items: CreatorStoreItem[];
  /** Set when the store could not be reached or rate limited; items may then be empty. */
  error?: string;
}

const API = 'https://apis.roblox.com/toolbox-service/v1';
const THUMBS = 'https://thumbnails.roblox.com/v1/assets';
const TYPE_NAMES: Record<number, string> = { 10: 'model', 3: 'audio', 13: 'decal', 40: 'mesh', 24: 'animation', 62: 'video', 38: 'plugin' };

export function storeLink(id: number): string {
  return `https://create.roblox.com/store/asset/${id}`;
}

export function searchUrl(category: StoreCategory, query: string, limit: number): string {
  const p = new URLSearchParams({ keyword: query, limit: String(limit) });
  return `${API}/marketplace/${CATEGORY_IDS[category]}?${p}`;
}

export function detailsUrl(ids: number[]): string {
  return `${API}/items/details?assetIds=${ids.join(',')}`;
}

export function thumbnailsUrl(ids: number[]): string {
  return `${THUMBS}?assetIds=${ids.join(',')}&size=420x420&format=Png&returnPolicy=PlaceHolder`;
}

type Json = Record<string, any>;

export function parseSearch(json: Json | null): { total: number; ids: number[] } {
  const ids = Array.isArray(json?.data) ? json!.data.map((d: Json) => Number(d?.id)).filter((n: number) => Number.isSafeInteger(n) && n > 0) : [];
  return { total: Number(json?.totalResults ?? ids.length) || 0, ids };
}

export function parseThumbnails(json: Json | null): Map<number, string> {
  const m = new Map<number, string>();
  for (const t of Array.isArray(json?.data) ? json!.data : []) {
    if (t?.state === 'Completed' && typeof t.imageUrl === 'string' && t.imageUrl) m.set(Number(t.targetId), t.imageUrl);
  }
  return m;
}

function short(s: unknown, n = 160): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

export function parseDetails(json: Json | null, thumbs: Map<number, string> = new Map()): Map<number, CreatorStoreItem> {
  const out = new Map<number, CreatorStoreItem>();
  for (const row of Array.isArray(json?.data) ? json!.data : []) {
    const a: Json | undefined = row?.asset;
    if (!a || !Number.isSafeInteger(a.id)) continue;
    const counts: Record<string, number> = {};
    for (const [k, v] of Object.entries((a.modelTechnicalDetails?.instanceCounts ?? {}) as Record<string, number>)) if (v > 0) counts[k] = v;
    const tris = a.modelTechnicalDetails?.objectMeshSummary?.triangles;
    const ad = a.audioDetails;
    out.set(a.id, {
      id: a.id,
      name: short(a.name, 100),
      category: TYPE_NAMES[a.typeId] ?? String(a.typeId ?? ''),
      creator: short(row.creator?.name, 60),
      creatorVerified: row.creator?.isVerifiedCreator === true,
      description: short(a.description),
      link: storeLink(a.id),
      thumbnailUrl: thumbs.get(a.id) ?? null,
      hasScripts: a.hasScripts === true,
      endorsed: a.isEndorsed === true,
      votes: typeof row.voting?.voteCount === 'number' ? row.voting.voteCount : null,
      upVotePercent: typeof row.voting?.upVotePercent === 'number' ? row.voting.upVotePercent : null,
      free: typeof row.fiatProduct?.isFree === 'boolean' ? row.fiatProduct.isFree : null,
      triangles: typeof tris === 'number' ? tris : null,
      instances: counts,
      durationSeconds: typeof a.duration === 'number' && a.duration > 0 ? a.duration : null,
      audio: ad ? { title: short(ad.title, 80), artist: short(ad.artist, 60), genre: short(ad.musicGenre, 30) } : null,
      updated: typeof a.updatedUtc === 'string' ? a.updatedUtc.slice(0, 10) : null,
    });
  }
  return out;
}

/** Cache API when the runtime has one (Workers); plain fetch otherwise. */
async function getJson(url: string, fetcher: typeof fetch, ttl = 300): Promise<{ json: Json | null; status: number }> {
  const cache: Cache | undefined = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const req = new Request(url, { headers: { accept: 'application/json' } });
  try {
    const hit = await cache?.match(req);
    if (hit) return { json: (await hit.json()) as Json, status: 200 };
  } catch {
    // cache unavailable: fall through to the network
  }
  let status = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetcher(req);
      status = res.status;
      if (res.ok) {
        const text = await res.text();
        const json = JSON.parse(text) as Json;
        try {
          await cache?.put(req, new Response(text, { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${ttl}` } }));
        } catch {
          // ignore cache write failures
        }
        return { json, status };
      }
      if (res.status !== 429 && res.status < 500) break;
      const wait = Math.min(2000, (Number(res.headers.get('retry-after')) || 1) * 1000);
      await new Promise((r) => setTimeout(r, wait));
    } catch {
      status = status || 0;
    }
  }
  return { json: null, status };
}

export async function searchCreatorStore(
  args: { query: string; category?: StoreCategory; limit?: number },
  fetcher: typeof fetch = fetch,
): Promise<CreatorStoreResult> {
  const category: StoreCategory = args.category && args.category in CATEGORY_IDS ? args.category : 'model';
  const query = args.query.trim().slice(0, 120);
  const limit = Math.max(1, Math.min(args.limit ?? 8, 20));
  const base: CreatorStoreResult = { query, category, total: 0, items: [] };
  if (!query) return { ...base, error: 'empty query' };

  const s = await getJson(searchUrl(category, query, limit), fetcher);
  if (!s.json) return { ...base, error: s.status === 429 ? 'Creator Store is rate limiting requests; try again shortly.' : `Creator Store search failed (HTTP ${s.status || 'network error'}).` };
  const { total, ids: found } = parseSearch(s.json);
  const ids = found.slice(0, limit);
  if (!ids.length) return { ...base, total };

  const [d, t] = await Promise.all([getJson(detailsUrl(ids), fetcher), category === 'audio' ? Promise.resolve({ json: null, status: 200 }) : getJson(thumbnailsUrl(ids), fetcher, 3600)]);
  const thumbs = parseThumbnails(t.json);
  const details = parseDetails(d.json, thumbs);
  const items = ids.map((id) => details.get(id)).filter((x): x is CreatorStoreItem => !!x);
  return { query, category, total, items, ...(d.json ? {} : { error: 'Could not load asset details; only ids were found.' }) };
}

/** Compact, LLM-friendly rendering of a result. */
export function formatCreatorStoreResult(r: CreatorStoreResult): string {
  if (r.error && !r.items.length) return `Creator Store ${r.category} search "${r.query}": ${r.error}`;
  const lines = [`Creator Store ${r.category} search "${r.query}": ${r.total} total, showing ${r.items.length}.`];
  for (const i of r.items) {
    const bits = [`${i.name} (id ${i.id}) by ${i.creator}${i.creatorVerified ? ' [verified]' : ''}`];
    if (i.upVotePercent !== null) bits.push(`${i.upVotePercent}% up of ${i.votes} votes`);
    if (i.endorsed) bits.push('endorsed');
    if (i.triangles !== null) bits.push(`${i.triangles} tris`);
    const inst = Object.entries(i.instances).map(([k, v]) => `${v} ${k}`).join(', ');
    if (inst) bits.push(inst);
    if (i.category === 'model') bits.push(i.hasScripts ? 'HAS SCRIPTS' : 'no scripts');
    if (i.durationSeconds !== null) bits.push(`${i.durationSeconds}s`);
    if (i.audio) bits.push(`${i.audio.artist} - ${i.audio.title}`.trim());
    if (i.free === false) bits.push('paid');
    if (i.description) bits.push(`"${i.description.slice(0, 100)}"`);
    bits.push(i.link);
    lines.push(`- ${bits.join(' | ')}`);
  }
  if (r.error) lines.push(`Note: ${r.error}`);
  return lines.join('\n');
}
