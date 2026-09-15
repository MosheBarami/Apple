// Import a catalogued asset into Roblox, so a catalogue entry becomes something a game can use.
//
// This is the step between `pending_ingest` and `active`. It fetches the bytes the provenance row
// points at, uploads them under Apple's account as an Open Use type, and writes the resulting
// Roblox asset id back — at which point, and only at which point, the product's own search will
// return it, because `ftsSearch` filters on `status = 'active'`.
//
// ONE WRITE PATH, STILL. The update goes back through `ingestAssets`, not through a bespoke UPDATE.
// The column list, the licence gate and the FTS mirror live in `upsertAssets`; a second writer
// would be a second copy of all three, and asset-library-availability.test.mjs asserts there is
// exactly one. Writing an id is not special enough to earn an exception.
//
// EVERY REFUSAL IS A SENTENCE. A row that cannot be imported returns why — no download URL for this
// source, the file was a zip, the key lacks a scope, moderation rejected it. An import loop that
// answered only "failed" would be indistinguishable from a network blip, and the difference
// decides whether a human changes a setting or retries forever.
import type { Env } from './env';
import type { AssetProvenance } from './asset-library';
import { ingestAssets } from './asset-ingest';
import { uploadTypeFor, uploadAsset, type UploadEnv } from './roblox-upload';

export interface ImportEnv extends UploadEnv {
  CORPUS: Env['CORPUS'];
}

export interface ImportOutcome {
  id: string;
  ok: boolean;
  /** Present only on success. */
  robloxAssetId?: number;
  /** Present only on failure, and always a sentence. */
  error?: string;
  /** Set when the upload was accepted but Roblox has not finished processing it. */
  pendingOperation?: string;
}

/**
 * Where the bytes for one row live, per source.
 *
 * DELIBERATELY A SMALL TABLE WITH EXPLICIT GAPS. ambientCG publishes its materials as ZIP archives;
 * Roblox will not take a zip, and unzipping inside a Worker to find the one diffuse map is a
 * different piece of work with its own failure modes. So ambientCG returns null WITH A REASON
 * rather than being quietly skipped, and the reason travels all the way back to the caller.
 */
export async function resolveDownload(rec: Pick<AssetProvenance, 'id' | 'source' | 'kind'>):
  Promise<{ url: string; contentType: string } | { error: string }> {
  if (rec.source === 'poly_haven') {
    // id shape: poly_haven/<type>/<slug>. The slug is not the Poly Haven key — the key uses
    // underscores and the harvest slugified it — so the files API is asked by the ORIGINAL key,
    // which is recoverable because slugification only replaced separators.
    const slug = rec.id.split('/')[2] ?? '';
    const key = slug.replace(/-/g, '_');
    const res = await fetch(`https://api.polyhaven.com/files/${encodeURIComponent(key)}`);
    if (!res.ok) return { error: `poly haven files API answered ${res.status} for ${key}` };
    const files = (await res.json()) as Record<string, unknown>;
    // Textures: the diffuse map at 1k jpg. 1k is chosen because Roblox caps textures at 1024 and
    // uploading 8k would be paying bandwidth for pixels the engine throws away.
    const diffuse = (files.Diffuse ?? files.diffuse) as Record<string, Record<string, { url?: string }>> | undefined;
    const jpg = diffuse?.['1k']?.jpg?.url ?? diffuse?.['1k']?.png?.url;
    if (jpg) return { url: jpg, contentType: jpg.endsWith('.png') ? 'image/png' : 'image/jpeg' };
    return { error: `no 1k diffuse map published for ${key} — models and HDRIs have no Open Use image path yet` };
  }
  if (rec.source === 'ambientcg') {
    return { error: 'ambientCG publishes ZIP archives; Roblox does not accept a zip and no unpacking step exists yet' };
  }
  return { error: `no download resolver for source "${rec.source}"` };
}

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Import one row. Returns an outcome for every input, always — a row that could not be imported
 * produces a failure with a reason, never an absence from the results array.
 */
export async function importAsset(env: ImportEnv, rec: AssetProvenance): Promise<ImportOutcome> {
  if (rec.robloxAssetId !== null) {
    return { id: rec.id, ok: true, robloxAssetId: rec.robloxAssetId };
  }
  const resolved = await resolveDownload(rec);
  if ('error' in resolved) return { id: rec.id, ok: false, error: resolved.error };

  const file = await fetch(resolved.url);
  if (!file.ok) return { id: rec.id, ok: false, error: `download answered ${file.status}: ${resolved.url}` };
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength === 0) return { id: rec.id, ok: false, error: 'the download was empty' };

  const type = uploadTypeFor(rec.kind, resolved.contentType);
  if (!type) return { id: rec.id, ok: false, error: `no Open Use upload type for ${resolved.contentType}` };

  const up = await uploadAsset(env, {
    file: bytes,
    contentType: resolved.contentType,
    displayName: rec.name,
    // The credit line travels WITH the asset onto Roblox, not only in Apple's own database. If
    // Apple ever disappears, the attribution the licence asked for is still attached to the thing.
    description: `${rec.name} — ${rec.author}, ${rec.licence}. Source: ${rec.sourceUrl}`,
    type,
  });

  if (!up.ok) return { id: rec.id, ok: false, error: `upload failed (${up.status}): ${up.error}` };
  if (!up.done) return { id: rec.id, ok: false, pendingOperation: up.operationId, error: 'upload accepted, Roblox is still processing it' };

  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const updated: AssetProvenance = {
    ...rec,
    robloxAssetId: up.assetId,
    sha256: hex(digest),
    importedAt: new Date().toISOString(),
    textureResolution: type === 'Mesh' ? rec.textureResolution : 1024,
  };
  // `seed: false` is the whole point of this line: the row now has a Roblox id, so it is no longer
  // a seed and the stricter validation applies to it.
  const res = await ingestAssets(env, { assets: [updated], seed: false, status: 'active' });
  if (res.written !== 1) {
    return {
      id: rec.id,
      ok: false,
      // The asset EXISTS on Roblox at this point. Saying "import failed" without that id would
      // strand a real uploaded asset with nothing pointing at it.
      error: `uploaded as ${up.assetId} but the library refused the row: ${JSON.stringify(res.rejected)}`,
    };
  }
  return { id: rec.id, ok: true, robloxAssetId: up.assetId };
}

/**
 * The rows still waiting for a Roblox id.
 *
 * `roblox_asset_id is null` rather than `status = 'pending_ingest'`: the status is what the library
 * DECIDED, the null id is what is actually MISSING, and if the two ever disagree the id is the one
 * that determines whether an import is needed. Selecting on the decision would skip a row someone
 * marked active by hand and leave it permanently un-importable.
 */
export async function pendingAssets(env: Pick<ImportEnv, 'CORPUS'>, limit: number, source?: string): Promise<AssetProvenance[]> {
  const where = source ? `and source = ?` : '';
  const binds: unknown[] = source ? [source, limit] : [limit];
  const rows = await env.CORPUS.prepare(
    `select id, name, kind, source, source_url, licence, licence_url, commercial_use,
            attribution_required, author, retrieved_at, imported_at, modifications,
            roblox_asset_id, triangles, texture_resolution, bounds_studs, tags, sha256
     from asset_library where roblox_asset_id is null ${where} order by id limit ?`,
  ).bind(...binds).all<Record<string, unknown>>();

  return rows.results.map((r) => {
    const parse = <T>(v: unknown, fallback: T): T => {
      if (typeof v !== 'string') return fallback;
      try { return JSON.parse(v) as T; } catch { return fallback; }
    };
    return {
      id: String(r.id),
      name: String(r.name),
      kind: r.kind as AssetProvenance['kind'],
      source: r.source as AssetProvenance['source'],
      sourceUrl: String(r.source_url),
      licence: String(r.licence),
      licenceUrl: String(r.licence_url),
      commercialUse: !!r.commercial_use,
      attributionRequired: !!r.attribution_required,
      author: String(r.author),
      retrievedAt: String(r.retrieved_at),
      importedAt: (r.imported_at as string | null) ?? null,
      modifications: parse<string[]>(r.modifications, []),
      robloxAssetId: (r.roblox_asset_id as number | null) ?? null,
      triangles: (r.triangles as number | null) ?? null,
      textureResolution: (r.texture_resolution as number | null) ?? null,
      boundsStuds: parse<[number, number, number] | null>(r.bounds_studs, null),
      tags: parse<string[]>(r.tags, []),
      sha256: (r.sha256 as string | null) ?? null,
    };
  });
}

/**
 * Import a bounded run of pending rows, one at a time.
 *
 * SEQUENTIAL ON PURPOSE. Roblox rate-limits asset creation per key, and a parallel burst earns a
 * 429 that this code would then have to distinguish from a real rejection. One at a time is slower
 * and its failures mean what they say.
 */
export async function importPending(env: ImportEnv, limit: number, source?: string): Promise<{
  attempted: number; imported: number; failed: number; outcomes: ImportOutcome[];
}> {
  const rows = await pendingAssets(env, Math.max(1, Math.min(limit, 25)), source);
  const outcomes: ImportOutcome[] = [];
  for (const rec of rows) {
    try {
      outcomes.push(await importAsset(env, rec));
    } catch (e) {
      outcomes.push({ id: rec.id, ok: false, error: `threw: ${String((e as Error)?.message ?? e).slice(0, 200)}` });
    }
  }
  return {
    attempted: rows.length,
    imported: outcomes.filter((o) => o.ok).length,
    failed: outcomes.filter((o) => !o.ok).length,
    outcomes,
  };
}
