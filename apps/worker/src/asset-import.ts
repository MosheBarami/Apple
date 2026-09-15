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
import { uploadTypeFor, uploadAsset, pollOperation, archiveAsset, type UploadEnv, type UploadResult } from './roblox-upload';

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
    // A model's GEOMETRY has no Open Use upload path at all (see uploadTypeFor), and importing
    // only its diffuse map would stamp a `prop` row with an Image asset id — a row that says it is
    // a wrench and resolves to a picture of one. Refused with the reason rather than half-done.
    return { error: `no Open Use path for ${key}: geometry must go through the Studio importer, and an HDRI is not an image asset` };
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

  // Roblox answers with an OPERATION, not an asset, and image processing usually finishes in a
  // few seconds. Waiting here is what turns "accepted" into an id in one pass. It is bounded:
  // beyond the budget the operation id is handed back so a later pass can resume it, because an
  // upload that succeeded and was then forgotten is a real asset on Roblox with nothing pointing
  // at it — a leak that costs the owner storage and gives the library nothing.
  const settled = up.done ? up : await settle(env, up.operationId);
  if (!settled.ok) return { id: rec.id, ok: false, error: `upload failed: ${settled.error}`, pendingOperation: settled.operationId ?? undefined };
  if (!settled.done) return { id: rec.id, ok: false, pendingOperation: settled.operationId, error: 'upload accepted, Roblox is still processing it' };
  const assetId = settled.assetId;

  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const updated: AssetProvenance = {
    ...rec,
    robloxAssetId: assetId,
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
      error: `uploaded as ${assetId} but the library refused the row: ${JSON.stringify(res.rejected)}`,
    };
  }
  return { id: rec.id, ok: true, robloxAssetId: assetId };
}

/** Wait for an operation, briefly. The delays are stated rather than tuned by feel: ~15 s total. */
const POLL_DELAYS_MS = [1200, 1800, 2500, 3500, 6000];

async function settle(env: ImportEnv, operationId: string): Promise<UploadResult> {
  let last: UploadResult = { ok: true, done: false, operationId };
  for (const wait of POLL_DELAYS_MS) {
    await new Promise((r) => setTimeout(r, wait));
    last = await pollOperation(env, operationId);
    if (!last.ok || last.done) return last;
  }
  return last;
}

/**
 * The rows still waiting for a Roblox id.
 *
 * `roblox_asset_id is null` rather than `status = 'pending_ingest'`: the status is what the library
 * DECIDED, the null id is what is actually MISSING, and if the two ever disagree the id is the one
 * that determines whether an import is needed. Selecting on the decision would skip a row someone
 * marked active by hand and leave it permanently un-importable.
 */
export async function pendingAssets(
  env: Pick<ImportEnv, 'CORPUS'>,
  limit: number,
  source?: string,
  idPrefix?: string,
  after?: string,
): Promise<AssetProvenance[]> {
  return selectAssets(env, { limit, source, idPrefix, after, onlyPending: true });
}

/** One row by id regardless of whether it has been imported — what the undo path needs. */
export async function pendingAssetsRaw(env: Pick<ImportEnv, 'CORPUS'>, id: string): Promise<AssetProvenance[]> {
  return selectAssets(env, { limit: 1, exactId: id, onlyPending: false });
}

interface SelectOpts {
  limit: number;
  source?: string;
  idPrefix?: string;
  after?: string;
  exactId?: string;
  onlyPending: boolean;
}

async function selectAssets(env: Pick<ImportEnv, 'CORPUS'>, o: SelectOpts): Promise<AssetProvenance[]> {
  const { limit, source, idPrefix, after, exactId, onlyPending } = o;
  // The prefix exists because the id namespace IS the taxonomy: `poly_haven/textures/…` are the
  // rows with an Open Use image path, and `poly_haven/hdris/…` are not. Filtering on `kind` would
  // not separate them — an HDRI and a texture are both `texture` to the planner, correctly.
  //
  // `after` is a KEYSET CURSOR and it is not an optimisation. Without it this selector returns the
  // same rows on every pass — it filters on `roblox_asset_id is null`, and a row that fails for a
  // permanent reason stays null for ever. The first unimportable row would then sit at the head of
  // the queue and block every row behind it, while the caller saw a loop that was busy and a count
  // that never moved. Ordering by id and stepping past the last one seen is what makes the queue
  // drain instead of stall.
  const clauses = [
    onlyPending ? 'and roblox_asset_id is null' : '',
    exactId ? 'and id = ?' : '',
    source ? 'and source = ?' : '',
    idPrefix ? "and id like ? escape '\\'" : '',
    after ? 'and id > ?' : '',
  ].join(' ');
  const binds: unknown[] = [];
  if (exactId) binds.push(exactId);
  if (source) binds.push(source);
  // The wildcards in a LIKE pattern are escaped so a prefix containing _ or % cannot widen the
  // match: `poly_haven/…` contains an underscore, which LIKE reads as "any character".
  if (idPrefix) binds.push(`${idPrefix.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
  if (after) binds.push(after);
  binds.push(limit);
  const where = clauses;
  const rows = await env.CORPUS.prepare(
    `select id, name, kind, source, source_url, licence, licence_url, commercial_use,
            attribution_required, author, retrieved_at, imported_at, modifications,
            roblox_asset_id, triangles, texture_resolution, bounds_studs, tags, sha256
     from asset_library where 1=1 ${where} order by id limit ?`,
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
export async function importPending(env: ImportEnv, limit: number, source?: string, idPrefix?: string, after?: string): Promise<{
  attempted: number; imported: number; failed: number; outcomes: ImportOutcome[]; lastId: string | null;
}> {
  const rows = await pendingAssets(env, Math.max(1, Math.min(limit, 25)), source, idPrefix, after);
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
    // The cursor the caller must send next. Returned even when everything failed — especially
    // then, because that is the case the cursor exists for.
    lastId: rows.length ? rows[rows.length - 1]!.id : null,
  };
}

/**
 * Undo an import: archive the asset on Roblox and put the library row back to pending.
 *
 * ORDER MATTERS AND IS THE OPPOSITE OF THE OBVIOUS ONE. The row is cleared only AFTER Roblox has
 * confirmed the archive. Clearing first would, on a failed archive, leave a live asset in the
 * owner's account with nothing in the library pointing at it — the same orphan the import path
 * goes out of its way to avoid, produced by the code meant to clean up.
 */
export async function unimportAssets(env: ImportEnv, limit: number): Promise<{
  attempted: number; archived: number; failed: number; outcomes: ImportOutcome[];
}> {
  const rows = await env.CORPUS.prepare(
    `select id, roblox_asset_id from asset_library where roblox_asset_id is not null order by imported_at limit ?`,
  ).bind(Math.max(1, Math.min(limit, 25))).all<{ id: string; roblox_asset_id: number }>();

  const outcomes: ImportOutcome[] = [];
  for (const r of rows.results) {
    const res = await archiveAsset(env, r.roblox_asset_id);
    if (!res.ok) {
      outcomes.push({ id: r.id, ok: false, error: `archive failed (${res.status}): ${res.error}` });
      continue;
    }
    const [rec] = await pendingRowById(env, r.id);
    if (!rec) { outcomes.push({ id: r.id, ok: false, error: 'archived on Roblox but the row vanished' }); continue; }
    const cleared: AssetProvenance = { ...rec, robloxAssetId: null, importedAt: null, sha256: null };
    const w = await ingestAssets(env, { assets: [cleared], seed: true, status: 'pending_ingest' });
    outcomes.push(w.written === 1
      ? { id: r.id, ok: true }
      : { id: r.id, ok: false, error: `archived ${r.roblox_asset_id} but the row would not clear: ${JSON.stringify(w.rejected)}` });
  }
  return {
    attempted: rows.results.length,
    archived: outcomes.filter((o) => o.ok).length,
    failed: outcomes.filter((o) => !o.ok).length,
    outcomes,
  };
}

/** One row by id, in full. Shares `pendingAssets`'s mapping by reusing its query with no filters. */
async function pendingRowById(env: Pick<ImportEnv, 'CORPUS'>, id: string): Promise<AssetProvenance[]> {
  const all = await pendingAssetsRaw(env, id);
  return all;
}
