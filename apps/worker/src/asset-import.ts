// Import a catalogued asset into Roblox, so a catalogue entry becomes something a game can use.
//
// This is the step between `pending_ingest` and `active`. It fetches the bytes the provenance row
// points at, uploads them under Apple's account as an Open Use type, and writes the resulting
// Roblox asset id back — at which point the row stops being `needs_import` and becomes something a
// place can reference directly.
//
// Search no longer waits for that. It used to filter on `status = 'active'`, which meant an
// un-imported row was indistinguishable from a dead one and the curated packs could not be found
// at all; it now returns them labelled `needs_import` (asset-library.ts). So this file is what
// makes a row INSERTABLE, not what makes it VISIBLE — two facts that were one column for too long.
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
import { useRobloxCredential } from './user-credentials';
import { extractFromZip, pickBaseColour } from './unzip';

export interface ImportEnv extends UploadEnv {
  CORPUS: Env['CORPUS'];
  /** 32 bytes, base64 — unwraps a customer's own stored Roblox key. See user-credentials.ts. */
  CREDENTIAL_KEY?: string;
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
export interface ResolvedDownload {
  url: string;
  contentType: string;
  /** For an archive: which entry inside it this row means, as the slug carried in the row's id. */
  entrySlug?: string;
}

export async function resolveDownload(rec: Pick<AssetProvenance, 'id' | 'source' | 'kind' | 'name' | 'sourceUrl'>):
  Promise<ResolvedDownload | { error: string }> {
  if (rec.source === 'poly_haven') {
    // id shape: poly_haven/<type>/<slug>. The slug is not the Poly Haven key — the key uses
    // underscores and the harvest slugified it — so the files API is asked by the ORIGINAL key,
    // which is recoverable because slugification only replaced separators.
    const [, namespace, slug = ''] = rec.id.split('/');
    //[[ THE NAMESPACE DECIDES, AND IT HAS TO BE CHECKED FIRST.
    //
    //   Poly Haven MODELS also publish a Diffuse map — they are textured meshes — so the lookup
    //   below finds one and happily returns it. That was live: a `prop` row named "Adjustable
    //   Wrench" resolved to a picture of a wrench and would have been uploaded as an Image, giving
    //   the library a row whose name promises geometry and whose asset is a photograph.
    //
    //   Caught by asset-coverage.test.mjs, which asserts the two namespaces answer differently.
    //   The comment further down always SAID models were refused; nothing made them be. ]]
    if (namespace !== 'textures') {
      return {
        error: `no Open Use path for ${rec.id}: geometry must go through the Studio importer `
          + '(Roblox accepts external meshes only as a Model, which is not Open Use), and an HDRI '
          + 'is a lighting probe rather than an image asset',
      };
    }
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
    return { error: `no Open Use path for ${key}: geometry must go through the Studio importer (Roblox accepts external meshes only as a Model, which is not Open Use), and an HDRI is a lighting probe rather than an image asset` };
  }
  if (rec.source === 'iconify') {
    //[[ SVG, AND THIS DEPLOYMENT DOES NOT RENDER IT. The decision and its price, so nobody has to
    //   rediscover both.
    //
    //   Iconify serves SVG only — `.png` is a verified 404 — and Roblox takes png, jpeg, bmp and
    //   tga. Rendering it needs resvg's WebAssembly build, and that was built, tested and MEASURED
    //   before being taken back out: the worker bundle went from 1,691 KiB to 4,132 (471 to 1,404
    //   gzipped, paid at every cold start), and because wrangler rejects `wasm_modules` for an
    //   ES-module worker the import has to be static — which broke 33 test files that bundle
    //   index.ts and have no loader for `.wasm`.
    //
    //   What it bought: 348,522 icons, most of them another set's version of "home" or "settings".
    //   What already works without it: 7,353 Creator Store ui_icon rows that need no upload at all
    //   and 4,239 game-icons rows that publish real PNGs. Eleven and a half thousand usable icons
    //   is not the constraint on anybody building a game.
    //
    //   So these rows stay in the library — searchable, licensed, credited — and are honest about
    //   being reference rather than pretending an upload will work. The renderer belongs in the
    //   web app, where a canvas already exists and the cost falls on the one person who wants
    //   that icon. ]]
    return { error: 'Iconify publishes SVG and this deployment does not rasterise; use a game-icons or Creator Store icon, which need no conversion' };
  }
  if (rec.source === 'game_icons') {
    // The one icon set with a real PNG endpoint, so it needs no rendering at all. White on
    // transparent-ish black, which is what the set's own site serves.
    const [, author, name] = rec.id.split('/');
    if (!author || !name) return { error: `malformed game-icons id "${rec.id}"` };
    return { url: `https://game-icons.net/icons/ffffff/000000/1x1/${author}/${name}.png`, contentType: 'image/png' };
  }
  if (rec.source === 'cgbookcase') {
    const name = (rec.name ?? '').replace(/\s+/g, '');
    if (!name) return { error: 'the cgbookcase row has no name to build a file path from' };
    return { url: `https://cgbookcase.b-cdn.net/textures/thumbnails/${name}_1K/${name}_1K_BaseColor.png`, contentType: 'image/png' };
  }
  if (rec.source === 'creator_store' || rec.source === 'roblox_official') {
    // Not an error and not a gap: these rows already carry a Roblox asset id. Reaching here means
    // a caller asked to import something that needs no importing.
    return { error: 'this row is already a Roblox asset — it needs no import' };
  }
  if (rec.source === 'ambientcg') {
    // id shape: ambientcg/<type>/<slug>. The slug is the asset id lowercased, and the archive URL
    // is built from the original casing, which the NAME preserves. 1K because Roblox caps textures
    // at 1024 and the 4K archive is a hundred megabytes for pixels the engine discards.
    const id = (rec.name ?? '').replace(/\s+/g, '');
    if (!id) return { error: 'the ambientCG row has no name to build an archive URL from' };
    return { url: `https://ambientcg.com/get?file=${encodeURIComponent(id)}_1K-JPG.zip`, contentType: 'application/zip' };
  }
  if (rec.source === 'kenney') {
    //[[ AN EXPANDED ROW NAMES ITS FILE IN ITS OWN ID, which is what makes it importable at all.
    //
    //   Kenney's archive URL carries a content hash that changes on every republish, so it cannot
    //   be built from the row — but the row's sourceUrl is the pack page, and the page carries the
    //   current URL. One extra fetch, and it is always the CURRENT archive rather than one
    //   remembered from harvest time, which is the better answer anyway.
    //
    //   The entry is then found by matching the slug in the id. That is why the expander derives
    //   ids from entry names instead of counters: a counter would make the row unfindable the
    //   moment Kenney reorders a zip. ]]
    const parts = rec.id.split('/');
    if (parts.length < 4) {
      return { error: 'this kenney row is a PACK of many files, not a single asset — it must be expanded into one row per file before any of it can be imported' };
    }
    const page = await fetch(rec.sourceUrl);
    if (!page.ok) return { error: `the kenney pack page answered ${page.status}` };
    const zip = /href='(https:\/\/kenney\.nl\/media\/pages\/assets\/[^']+\.zip)'/.exec(await page.text())?.[1];
    if (!zip) return { error: `no download archive found on ${rec.sourceUrl}` };
    return { url: zip, contentType: 'application/zip', entrySlug: parts.slice(3).join('/') };
  }
  if (rec.source === 'opengameart') {
    //[[ THESE ROWS ARE PACKS, NOT ASSETS, and that is the real reason rather than the first one.
    //
    //   The unzipper exists and would open either archive. What it could not do is choose: a
    //   Kenney pack is 130 sprites and an OpenGameArt submission is a tileset — there is no "the"
    //   file in them, and picking one would produce a library row whose name says "City Kit" and
    //   whose asset is one door.
    //
    //   Making these usable means EXPANDING them at harvest time — unzip locally, enumerate, and
    //   write one provenance row per file, each with its own name and its own tags. That is a real
    //   piece of work and it is not this one, so the row stays honest about being a pointer to a
    //   pack rather than pretending an import will give you what its name promises. ]]
    // An expanded OpenGameArt row carries a loose file, and the mirror lists its direct URL — but
    // the URL is not derivable from the id, so the row must be re-read from the harvest. Until an
    // import path carries that, an expanded row is still a reference. Named, not implied.
    return { error: `this ${rec.source} row is a PACK of many files, not a single asset — it must be expanded into one row per file before any of it can be imported` };
  }
  if (rec.source === 'generated_roblox') {
    return { error: 'this row is already a Roblox asset — it needs no import' };
  }
  if (rec.source === 'procedural') {
    // Built in the place by the agent, from parts. There is no file anywhere to fetch, and that is
    // the design rather than a gap: procedural geometry costs no upload and no licence.
    return { error: 'this row is built in the place from parts — there is no file to import' };
  }
  if (rec.source === 'quaternius' || rec.source === 'poly_pizza' || rec.source === 'sketchfab' || rec.source === 'wikimedia') {
    //[[ IN THE VOCABULARY, NOT IN THE HARVEST, and the difference matters.
    //
    //   These four were verified as real sources by the survey and none has been harvested yet:
    //   Quaternius and Poly Pizza publish geometry, which has no Open Use upload path at all;
    //   Sketchfab needs a token; Wikimedia is 9.8M files and wants a curated slice rather than a
    //   sweep. Saying "no resolver" would read as an oversight. This says which it is. ]]
    return { error: `${rec.source} is an allowed source that has not been harvested yet — no rows from it exist to import` };
  }
  return { error: `no download resolver for source "${rec.source}"` };
}

/**
 * The same slug the expander derived the row's id from.
 *
 * Duplicated from scripts/expand-packs.mjs deliberately: they are a plain script and a Worker
 * module with no shared runtime, and the coupling is asserted by a test rather than by an import
 * that cannot exist. If the two ever disagree, every expanded row becomes unfindable at once —
 * which is loud, not silent.
 */
function slugOf(path: string): string {
  return path
    .replace(/\.[a-z0-9]+$/i, '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s/-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'x';
}

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Resolve WHICH ACCOUNT an import writes to, and refuse rather than guess.
 *
 * With a userId, the customer's own stored key is used and the asset lands in THEIR account —
 * which is the only arrangement that makes sense for a product, and the arrangement that was
 * missing when 299 assets went into one person's account because a single shared credential was
 * all there was.
 *
 * Without one, the deployment's own key is used, and that path still has to pass the consent check
 * in `preflight`. A shared key is for Apple's own library work, not for a customer's build, and
 * nothing here quietly falls back to it: an import for a user whose key is missing FAILS, with the
 * reason, instead of writing into somebody else's account.
 */
async function accountFor(env: ImportEnv, userId?: string): Promise<{ ok: true; env: UploadEnv } | { ok: false; error: string }> {
  if (!userId) return { ok: true, env };
  const use = await useRobloxCredential(env as never, userId, 'asset:write');
  if (!use.ok) return { ok: false, error: use.error ?? 'the connected Roblox key cannot be used to create assets' };
  return {
    ok: true,
    env: {
      ROBLOX_API_KEY: use.apiKey,
      ...(use.creatorType === 'group'
        ? { ROBLOX_CREATOR_GROUP_ID: use.creatorId }
        : { ROBLOX_CREATOR_USER_ID: use.creatorId }),
      // The customer connected this key, ticked asset:write, and confirmed the permanence warning.
      // That IS the consent the shared-key path has to look up in configuration, so it is stated
      // here at the point the two paths converge rather than assumed by the caller.
      ROBLOX_UPLOAD_AUTHORISED_FOR: use.creatorId,
    },
  };
}

/**
 * Import one row. Returns an outcome for every input, always — a row that could not be imported
 * produces a failure with a reason, never an absence from the results array.
 *
 * `userId` names whose account the asset is created in. See `accountFor`.
 */
export async function importAsset(env: ImportEnv, rec: AssetProvenance, userId?: string): Promise<ImportOutcome> {
  if (rec.robloxAssetId !== null) {
    return { id: rec.id, ok: true, robloxAssetId: rec.robloxAssetId };
  }
  const resolved = await resolveDownload(rec);
  if ('error' in resolved) return { id: rec.id, ok: false, error: resolved.error };

  const file = await fetch(resolved.url);
  if (!file.ok) return { id: rec.id, ok: false, error: `download answered ${file.status}: ${resolved.url}` };
  let bytes = await file.arrayBuffer();
  if (bytes.byteLength === 0) return { id: rec.id, ok: false, error: 'the download was empty' };

  //[[ AN ARCHIVE BECOMES ONE IMAGE HERE. ambientCG publishes zip and nothing else — its own API
  //   lists exactly one filetype category and it is `zip` — and a material archive holds six maps
  //   of which five are wrong: a normal map is a lilac surface, a roughness map is grey. All six
  //   would upload successfully, so picking the first image would build a library of
  //   plausible-looking, uniformly wrong textures. `pickBaseColour` asks for the colour map by
  //   every name the sources use and refuses rather than settling. ]]
  let contentType = resolved.contentType;
  if (contentType === 'application/zip') {
    // A material archive means "the colour map"; an expanded pack row means "the file my id
    // names". One predicate could not serve both without guessing which kind of archive it had.
    const wanted = resolved.entrySlug;
    const picked = await extractFromZip(
      bytes,
      wanted ? (entries) => entries.find((e) => slugOf(e.name) === wanted) : pickBaseColour,
    );
    if (!picked.ok || !picked.bytes) return { id: rec.id, ok: false, error: `could not read the archive: ${picked.error}` };
    bytes = picked.bytes;
    contentType = /\.png$/i.test(picked.name ?? '') ? 'image/png' : 'image/jpeg';
  }

  const type = uploadTypeFor(rec.kind, contentType);
  if (!type) return { id: rec.id, ok: false, error: `no Open Use upload type for ${contentType}` };

  const account = await accountFor(env, userId);
  if (!account.ok) return { id: rec.id, ok: false, error: account.error };

  const up = await uploadAsset(account.env, {
    file: bytes,
    contentType,
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
  const settled = up.done ? up : await settle(account.env, up.operationId);
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

async function settle(env: UploadEnv, operationId: string): Promise<UploadResult> {
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
export async function importPending(env: ImportEnv, limit: number, source?: string, idPrefix?: string, after?: string, userId?: string): Promise<{
  attempted: number; imported: number; failed: number; outcomes: ImportOutcome[]; lastId: string | null;
}> {
  const rows = await pendingAssets(env, Math.max(1, Math.min(limit, 25)), source, idPrefix, after);
  const outcomes: ImportOutcome[] = [];
  for (const rec of rows) {
    try {
      outcomes.push(await importAsset(env, rec, userId));
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
export async function unimportAssets(env: ImportEnv, limit: number, force = false): Promise<{
  attempted: number; archived: number; unlinked: number; failed: number; outcomes: ImportOutcome[];
}> {
  const rows = await env.CORPUS.prepare(
    `select id, roblox_asset_id from asset_library where roblox_asset_id is not null order by imported_at limit ?`,
  ).bind(Math.max(1, Math.min(limit, 25))).all<{ id: string; roblox_asset_id: number }>();

  const outcomes: ImportOutcome[] = [];
  let archived = 0;
  let unlinked = 0;
  for (const r of rows.results) {
    const res = await archiveAsset(env, r.roblox_asset_id);
    //[[ ROBLOX WILL NOT TAKE AN IMAGE BACK. Measured, not assumed: the live API answers
    //   400 INVALID_ARGUMENT "Asset <id> is not an archivable asset type" for every Image and
    //   Decal this project uploaded. Archiving is for Models, Plugins and Audio.
    //
    //   That breaks the ordering rule this function was written with — clear the row only after
    //   Roblox confirms — and the rule's REASON is what decides what to do instead. It existed to
    //   avoid an orphan: a live asset with nothing pointing at it. Here the orphan is unavoidable,
    //   because the platform will not accept the withdrawal. So `force` unlinks the row anyway and
    //   SAYS the asset is still live, which is the honest answer: the product stops referencing
    //   something the owner did not agree to, and nobody is told it was removed when it was not. ]]
    if (!res.ok && !force) {
      outcomes.push({ id: r.id, ok: false, error: `archive failed (${res.status}): ${res.error}` });
      continue;
    }
    const [rec] = await pendingRowById(env, r.id);
    if (!rec) { outcomes.push({ id: r.id, ok: false, error: 'the row vanished mid-unimport' }); continue; }
    const cleared: AssetProvenance = { ...rec, robloxAssetId: null, importedAt: null, sha256: null };
    const w = await ingestAssets(env, { assets: [cleared], seed: true, status: 'pending_ingest' });
    if (w.written !== 1) {
      outcomes.push({ id: r.id, ok: false, error: `the row would not clear: ${JSON.stringify(w.rejected)}` });
      continue;
    }
    if (res.ok) { archived++; outcomes.push({ id: r.id, ok: true }); }
    else {
      unlinked++;
      outcomes.push({
        id: r.id,
        ok: true,
        // Not an error — the unlink succeeded. It is the state of the REMOTE asset, recorded so a
        // reader of these results never concludes the upload was undone.
        error: `unlinked, but asset ${r.roblox_asset_id} is STILL LIVE on Roblox: ${res.error}`,
      });
    }
  }
  return {
    attempted: rows.results.length,
    archived,
    unlinked,
    failed: outcomes.filter((o) => !o.ok).length,
    outcomes,
  };
}

/** One row by id, in full. Shares `pendingAssets`'s mapping by reusing its query with no filters. */
async function pendingRowById(env: Pick<ImportEnv, 'CORPUS'>, id: string): Promise<AssetProvenance[]> {
  const all = await pendingAssetsRaw(env, id);
  return all;
}
