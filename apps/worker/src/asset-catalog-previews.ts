import type { AssetHit } from './asset-library';

export type AssetCatalogPreview =
  | { state: 'ready'; url: string }
  | { state: 'pending' | 'blocked' | 'unavailable'; url: null };

const UNAVAILABLE: AssetCatalogPreview = { state: 'unavailable', url: null };
const ENDPOINT = 'https://thumbnails.roblox.com/v1/assets';
const MAX_IDS = 20;
const MAX_BODY_BYTES = 64 * 1024;
const TIMEOUT_MS = 2500;

/** Catalogue metadata is untrusted even when it was already parsed into an AssetHit. */
export function catalogAssetMetadata(hit: Pick<AssetHit, 'tags' | 'triangles' | 'boundsStuds'>):
  Pick<AssetHit, 'tags' | 'triangles' | 'boundsStuds'> {
  const tags: string[] = [];
  const seen = new Set<string>();
  if (Array.isArray(hit.tags)) {
    // Bound both the output and work on pathological recorded tags. These remain plain text,
    // never markup; strip control/bidi characters and delimiters without inferring descriptions.
    for (const raw of hit.tags.slice(0, 128)) {
      if (typeof raw !== 'string') continue;
      const tag = raw.slice(0, 256).replace(/<[^>]*>/g, ' ').replace(/[\p{Cc}\p{Cf}\p{Cs}<>]/gu, ' ')
        .replace(/\s+/gu, ' ').trim().slice(0, 48).replace(/[\uD800-\uDBFF]$/, '').trim();
      const key = tag.toLowerCase();
      if (!tag || seen.has(key)) continue;
      seen.add(key);
      tags.push(tag);
      if (tags.length === 12) break;
    }
  }
  const triangles = typeof hit.triangles === 'number' && Number.isSafeInteger(hit.triangles) && hit.triangles >= 0
    ? hit.triangles : null;
  const bounds = hit.boundsStuds;
  // Keep the display boundary consistent with asset-library's ingest MIN_STUD = 0.05.
  const positiveFinite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0.05;
  const boundsStuds: AssetHit['boundsStuds'] = Array.isArray(bounds) && bounds.length === 3
    && positiveFinite(bounds[0]) && positiveFinite(bounds[1]) && positiveFinite(bounds[2])
    ? [bounds[0], bounds[1], bounds[2]] : null;
  return { tags, triangles, boundsStuds };
}

function validId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function thumbnailUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048 || /[^\x21-\x7e]|[\\#]/.test(value)) return null;
  // Inspect the literal authority too: URL normalizes away :443, empty ports and empty userinfo.
  const authority = /^https:\/\/([^/?#]+)(?:[/?]|$)/i.exec(value)?.[1];
  if (!authority || authority.length > 253
    || !/^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+rbxcdn\.com$/i.test(authority)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || url.pathname.length <= 1) return null;
    return url.href;
  } catch { return null; }
}

function previewFromRow(row: Record<string, unknown>): AssetCatalogPreview {
  if (row.imageUrl !== undefined && row.imageUrl !== null && typeof row.imageUrl !== 'string') return UNAVAILABLE;
  if (row.version !== undefined && typeof row.version !== 'string') return UNAVAILABLE;
  switch (row.state) {
    case 'Completed': {
      const url = thumbnailUrl(row.imageUrl);
      return url ? { state: 'ready', url } : UNAVAILABLE;
    }
    case 'Pending':
    case 'InReview': return { state: 'pending', url: null };
    case 'Blocked': return { state: 'blocked', url: null };
    default: return UNAVAILABLE;
  }
}

/** One bounded public metadata read. Never forward request headers, cookies or Roblox credentials. */
async function fetchThumbnailData(ids: readonly number[]): Promise<unknown> {
  const controller = new AbortController();
  let response: Response | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancelBody = () => {
    if (reader) void reader.cancel().catch(() => {});
    else if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
  };
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('thumbnail deadline exceeded'));
    }, TIMEOUT_MS);
  });
  const readData = async (): Promise<unknown> => {
    const endpoint = new URL(ENDPOINT);
    endpoint.search = new URLSearchParams({
      assetIds: ids.join(','), size: '150x150', format: 'Png', isCircular: 'false', returnPolicy: 'PlaceHolder',
    }).toString();
    // Workers omit ambient cookies already; keep the standard fetch credential boundary explicit
    // for any other runtime too. Its Worker RequestInit type omits the browser-only property.
    const init: RequestInit & { credentials: 'omit' } = {
      method: 'GET', credentials: 'omit', redirect: 'error', headers: { Accept: 'application/json' }, signal: controller.signal,
    };
    response = await fetch(endpoint.href, init);
    if (controller.signal.aborted) { cancelBody(); throw new Error('thumbnail deadline exceeded'); }
    if (response.status !== 200 || response.redirected || !response.body) throw new Error('thumbnail response unavailable');
    if (response.url) {
      const actual = new URL(response.url);
      if (actual.origin + actual.pathname !== ENDPOINT) throw new Error('unexpected thumbnail endpoint');
    }
    if (!/^(application\/json|text\/json)(?:\s*;|$)/i.test(response.headers.get('Content-Type') ?? '')) {
      throw new Error('thumbnail response is not JSON');
    }
    const length = response.headers.get('Content-Length');
    if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) > MAX_BODY_BYTES)) {
      throw new Error('thumbnail response length invalid');
    }
    reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
    let bytes = 0;
    let text = '';
    // Cap chunk count as well as bytes, so an endless sequence of empty chunks cannot starve the
    // deadline timer. The cap is independent of Content-Length and applies to decoded body bytes.
    for (let reads = 0; reads < 1024; reads++) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(text + decoder.decode()) as unknown;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) throw new Error('thumbnail body too large');
      text += decoder.decode(value, { stream: true });
    }
    throw new Error('too many thumbnail body chunks');
  };
  try {
    // Abort alone is not a wall-clock bound when a transport stalls/ignores its signal. Keep this
    // race active through body consumption, and do not update any asset until it has completed.
    return await Promise.race([readData(), deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort();
    cancelBody();
  }
}

/**
 * Optional previews for catalogue hits, with no writes, model calls, retries or uploads.
 * Public contract verified 2026-09-18:
 * https://prod.docsiteassets.roblox.com/assets/en-us/cloud/legacy/thumbnails/v1.json
 * Only Completed returns a URL. Pending/InReview and Blocked may carry placeholder images from
 * upstream; those are deliberately not returned as asset previews. Other states/missing data
 * remain explicitly unavailable. A preview is not evidence of permissions, safety or readiness.
 */
export async function resolveAssetCatalogPreviews<T extends Pick<AssetHit, 'robloxAssetId'>>(
  hits: readonly T[], enabled = false,
): Promise<AssetCatalogPreview[]> {
  if (enabled !== true) return hits.map(() => ({ ...UNAVAILABLE }));
  const ids = new Set<number>();
  for (const hit of hits) {
    if (validId(hit.robloxAssetId)) ids.add(hit.robloxAssetId);
    if (ids.size === MAX_IDS) break;
  }
  const found = new Map<number, AssetCatalogPreview>();
  if (ids.size) {
    try {
      const payload = await fetchThumbnailData([...ids]);
      if (record(payload) && Array.isArray(payload.data) && payload.data.length <= MAX_IDS) {
        const seen = new Set<number>();
        for (const row of payload.data) {
          if (!record(row) || !validId(row.targetId) || !ids.has(row.targetId)) continue;
          // Even identical duplicates make this target ambiguous; never choose first/last wins.
          if (seen.has(row.targetId)) { found.set(row.targetId, UNAVAILABLE); continue; }
          seen.add(row.targetId);
          found.set(row.targetId, previewFromRow(row));
        }
      }
    } catch {
      // Thumbnail availability must never turn a successful catalogue search into a failed one.
      // Do not expose upstream errors, invent a URL, or retry with credentials/another endpoint.
    }
  }
  return hits.map((hit) => ({ ...(found.get(hit.robloxAssetId as number) ?? UNAVAILABLE) }));
}
