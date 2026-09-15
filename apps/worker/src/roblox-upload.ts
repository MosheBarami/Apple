// Turn a catalogued asset into one a customer's experience can actually use.
//
// THE PROBLEM THIS SOLVES, STATED PLAINLY. The library holds 7,000+ rows of provenance and not one
// of them has a `robloxAssetId`. A row without one is a CATALOGUE ENTRY: Apple knows the asset
// exists, who made it and under what licence, and cannot put it in anybody's game. That is why
// every ingested row is `pending_ingest`.
//
// Search used to answer that by hiding those rows — `ftsSearch` filtered on `status = 'active'` —
// and hiding them was worse than the problem. The rows that DID have ids were the Creator Store
// scrape, so the library's whole curated half was invisible and the junk was all anyone could see.
// Search now returns both and labels each hit `insertable` or `needs_import` (asset-library.ts),
// so "we have this, it needs importing" can be said out loud instead of being silently swallowed.
//
// WHY IMAGES AND MESHES AND NOT MODELS. Roblox creates Images, Decals and Meshes as **Open Use** by
// default, so one upload under Apple's account is referenceable by asset id from every customer's
// experience. Models are not: a Model uploaded here would be usable by Apple and by nobody else,
// and the library would fill with ids that 404 for every paying customer. asset-library.ts states
// this rule at the top of the file; this is where it becomes a refusal rather than a note.
//
// UPLOADING IS ASYNCHRONOUS AND MODERATED. `POST /assets/v1/assets` returns an OPERATION, not an
// asset. The operation may still be running, may fail, and may return an asset that moderation
// later rejects. So `uploadAsset` returns a discriminated result with `done`, `assetId` and
// `error` rather than a number — because "the upload was accepted" and "the asset exists" are
// different facts and a function that returned only the id would conflate them.
import type { AssetKind } from './assets';
import { redactSecrets } from './redaction.ts';

/** Verified 2026-09-15: POST with an invalid key answers 401, so the endpoint is live. */
const ASSETS_ENDPOINT = 'https://apis.roblox.com/assets/v1/assets';
const OPERATIONS_ENDPOINT = 'https://apis.roblox.com/assets/v1/operations';

/** Roblox's documented ceiling for one upload request. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * The asset types Open Cloud accepts, restricted to the ones that are Open Use.
 *
 * `Model` is deliberately absent and its absence is the point — see the header. If Roblox ever
 * makes Models Open Use, adding it here is a one-line change with a dated comment, not a silent
 * loosening somewhere in a caller.
 */
export const OPEN_USE_UPLOAD_TYPES = ['Decal', 'Image', 'Mesh'] as const;
export type OpenUseUploadType = (typeof OPEN_USE_UPLOAD_TYPES)[number];

/**
 * Every content type Open Cloud's Create Asset accepts, and which asset type each one names.
 *
 * Read off Roblox's own table on 2026-09-15 (creator-docs, cloud/guides/usage-assets.md), which is
 * the only place the accepted formats are written down — `assetType` in assets/v1.json is declared
 * as a bare string with `"format": "enum"` and no members, so the spec alone cannot tell you this.
 *
 * WHY THIS IS A WIDER SET THAN `OPEN_USE_UPLOAD_TYPES`, AND WHY THAT IS NOT A LOOSENING. Open Use
 * is a constraint on APPLE'S SHARED ACCOUNT: an asset uploaded there has to be referenceable from
 * every customer's experience, and a Model is not, so a Model in the library would 404 for every
 * paying customer. Uploading into a CUSTOMER'S OWN account has no such problem — they own it, so
 * they can use it. `uploadTypeFor` below is unchanged and still returns Open Use types only, so the
 * library path cannot reach the wider set by accident; only a caller holding that customer's own
 * key can, which is `creator-dashboard.ts` and nothing else.
 *
 * `model/x-rbxm` IS AMBIGUOUS IN ROBLOX'S OWN TABLE — it is listed under both Animation and Model —
 * and a content type cannot tell the two apart. It resolves to Model, the common case, and a caller
 * who means Animation has to say so with an explicit `type`. Guessing would upload somebody's
 * animation as a model, in their account, permanently.
 */
export const UPLOAD_CONTENT_TYPES: Readonly<Record<string, RobloxUploadType>> = {
  'audio/mpeg': 'Audio',
  'audio/ogg': 'Audio',
  'audio/wav': 'Audio',
  'audio/flac': 'Audio',
  'image/png': 'Image',
  'image/jpeg': 'Image',
  'image/bmp': 'Image',
  'image/tga': 'Image',
  'model/x-file-mesh-data': 'Mesh',
  'model/fbx': 'Model',
  'model/gltf+json': 'Model',
  'model/gltf-binary': 'Model',
  'model/x-rbxm': 'Model',
  'model/x-rbxmx': 'Model',
  'video/mp4': 'Video',
  'video/mov': 'Video',
};

export const ROBLOX_UPLOAD_TYPES = ['Animation', 'Audio', 'Decal', 'Image', 'Mesh', 'Model', 'Video'] as const;
export type RobloxUploadType = (typeof ROBLOX_UPLOAD_TYPES)[number];

/**
 * The asset type for a content type, or null with nothing guessed.
 *
 * The parameters after a semicolon are dropped first: a browser sends `image/png` and a file picker
 * sends `image/png; charset=binary`, and a lookup that missed the second would refuse a perfectly
 * good PNG with a message about an unsupported format.
 */
export function assetTypeForContentType(contentType: string): RobloxUploadType | null {
  const bare = (String(contentType ?? '').split(';')[0] ?? '').trim().toLowerCase();
  return UPLOAD_CONTENT_TYPES[bare] ?? null;
}

/**
 * What a library `kind` becomes on Roblox. null means "this kind has no Open Use upload path".
 *
 * GEOMETRY HAS NO PATH HERE, AND THAT IS A ROBLOX CONSTRAINT, NOT AN OMISSION. Checked against the
 * Open Cloud asset-format table on 2026-09-15: `Mesh` accepts **"Roblox only"** format
 * (`model/x-file-mesh-data`) and the documentation says in as many words that it exists for
 * re-uploading meshes downloaded from the Asset Delivery API. A `.glb` or `.fbx` can only be
 * uploaded as `Model` — and Models are not Open Use, so one uploaded under Apple's account would
 * load for Apple and 404 for every customer who pays.
 *
 * My first version of this function mapped `model/gltf-binary` to `Mesh`. It would have sent real
 * geometry to an endpoint that cannot take it, once per asset, against the owner's live account.
 *
 * The path for third-party geometry is therefore NOT this API. It is the Studio plugin's own 3D
 * import, which creates the mesh inside the customer's session under the customer's account —
 * `user_generated` in asset-library.ts's vocabulary, which is exactly why that category exists.
 */
export function uploadTypeFor(kind: AssetKind, contentType: string): OpenUseUploadType | null {
  if (/^image\/(png|jpeg|jpg|bmp|tga)/.test(contentType)) {
    return kind === 'ui_icon' || kind === 'particle' ? 'Decal' : 'Image';
  }
  // The one legitimate Mesh upload: bytes that came out of Roblox's own asset delivery.
  if (contentType === 'model/x-file-mesh-data') return 'Mesh';
  return null;
}

export interface UploadEnv {
  /** Open Cloud key. Uploading needs the `asset:write` scope; reading the Creator Store does not. */
  ROBLOX_API_KEY?: string;
  /** The Roblox user or group the assets are created under. One of the two, never both. */
  ROBLOX_CREATOR_USER_ID?: string;
  ROBLOX_CREATOR_GROUP_ID?: string;
  /**
   * EXPLICIT CONSENT TO CREATE ASSETS IN THAT ACCOUNT, and it must equal the creator id.
   *
   * This exists because of what happened without it. A key with `asset:write` and a user id in
   * the config were, between them, enough to start uploading — and 299 assets were created in the
   * owner's personal Roblox account before he had agreed to that. Roblox then refused to take
   * them back: an Image is "not an archivable asset type", so the account keeps them for good.
   *
   * Configuration is not consent. A creator id answers "which account", never "may you". They are
   * separate questions and they now need separate answers, because the first one gets set while
   * somebody is wiring up an integration and the second one is a decision about somebody's real
   * identity — and the action it authorises cannot be undone.
   */
  ROBLOX_UPLOAD_AUTHORISED_FOR?: string;
}

// `status` is on the success arms too, and it is the status Roblox actually answered with. The
// audit in creator-dashboard.ts records it, and the alternative was writing a plausible 200 into
// the log for a response nobody looked at — a failure to observe, rendered as an observation, in
// the one table that exists to say what really happened to somebody's account.
export type UploadResult =
  | { ok: true; done: true; assetId: number; operationId: string; status: number }
  | { ok: true; done: false; operationId: string; status: number }
  | { ok: false; status: number; error: string; operationId: string | null };

/** Every reason an upload can be refused before a byte is sent, as a sentence rather than a code. */
export function preflight(env: UploadEnv, bytes: number, type: RobloxUploadType | null): string | null {
  if (!env.ROBLOX_API_KEY) return 'ROBLOX_API_KEY is not set — uploading needs an Open Cloud key with the asset:write scope';
  const hasUser = !!env.ROBLOX_CREATOR_USER_ID;
  const hasGroup = !!env.ROBLOX_CREATOR_GROUP_ID;
  // Both set is an ambiguity, not a preference. Roblox would take one and the library would record
  // an owner nobody chose, which is the kind of quiet wrong answer that surfaces months later.
  if (hasUser && hasGroup) return 'both ROBLOX_CREATOR_USER_ID and ROBLOX_CREATOR_GROUP_ID are set — exactly one must be';
  if (!hasUser && !hasGroup) return 'neither ROBLOX_CREATOR_USER_ID nor ROBLOX_CREATOR_GROUP_ID is set — uploads need an owner';
  // The consent check, and it is deliberately an EQUALITY against the account being written to
  // rather than a boolean. A `true` would carry over when somebody changes the creator id, which
  // is the moment it most needs to be re-asked: the account is different, so the permission is a
  // different permission. Naming the account makes the two impossible to separate.
  const target = env.ROBLOX_CREATOR_GROUP_ID ?? env.ROBLOX_CREATOR_USER_ID ?? '';
  if (env.ROBLOX_UPLOAD_AUTHORISED_FOR !== target) {
    return `uploads to Roblox account ${target} are not authorised — set ROBLOX_UPLOAD_AUTHORISED_FOR to exactly that id. `
      + 'Creating an asset in somebody\'s account cannot be undone: Roblox refuses to archive an Image or a Decal.';
  }
  if (!type) return 'no Open Use upload path for this content type — Models are excluded on purpose';
  if (bytes <= 0) return 'the file is empty';
  if (bytes > MAX_UPLOAD_BYTES) return `${bytes} bytes exceeds the ${MAX_UPLOAD_BYTES}-byte limit for one upload`;
  return null;
}

export interface UploadInput {
  file: ArrayBuffer;
  contentType: string;
  /** Roblox trims and moderates this. Kept short so a long source name cannot fail the upload. */
  displayName: string;
  description: string;
  type: RobloxUploadType;
  /**
   * The most Robux this upload may cost, or undefined to say nothing about the price.
   *
   * assets/v1.json: "Expected asset upload fee in Robux. When the actual price is more than
   * expected, the operation fails with a 400 error." Sending 0 turns a priced upload into a refusal
   * instead of a charge, which is what the customer path wants — a fee taken out of somebody's
   * balance because nobody named a ceiling is configuration-is-not-consent with money in it.
   *
   * OMITTED rather than defaulted, because the library path has been uploading without it for
   * months against Apple's own account and a silent behaviour change there would be a different
   * decision smuggled into this one. `creator-dashboard.ts` passes 0 explicitly.
   */
  expectedPrice?: number;
}

/**
 * Roblox's own words about a failure — with the credential taken out of them.
 *
 * KEEPING THE BODY IS THE POINT AND SO IS REDACTING IT. A generic "upload failed" hides the one
 * sentence that separates "the key lacks a scope" from "the creator id is wrong" from "the file
 * was rejected", and those need three different actions. But an Open Cloud 401 very often echoes
 * the key it just refused — `{"message":"Invalid API Key: gk_live_…"}` — and this string does not
 * stop here: it becomes an import failure, a tool row, a log line, and part of a model's context.
 * On this path the key is a CUSTOMER'S, connected through settings, which is the one credential in
 * the product that belongs to somebody else.
 *
 * REDACT, THEN TRUNCATE. Cutting first leaves the head of a key inside the excerpt and pushes the
 * placeholder past the cut — redacted-looking, not redacted. Same order, same reason, as
 * net-policy.ts, which has guarded every other outbound call this way for longer than this one has
 * existed.
 */
function providerError(text: string, status: number): string {
  return redactSecrets(text, { max: 400 }).text || `HTTP ${status}`;
}

/**
 * Start one upload. Returns the operation, and the asset id when Roblox answered with it directly.
 *
 * `fetchImpl` is injectable so the tests exercise the real request construction — the multipart
 * body, the field names, the creator block — against a recorded server rather than a mock of this
 * function. Testing the caller instead of the request is how a wrong field name ships green.
 */
export async function uploadAsset(
  env: UploadEnv,
  input: UploadInput,
  fetchImpl: typeof fetch = fetch,
): Promise<UploadResult> {
  const blocked = preflight(env, input.file.byteLength, input.type);
  if (blocked) return { ok: false, status: 0, error: blocked, operationId: null };

  const creator = env.ROBLOX_CREATOR_GROUP_ID
    ? { groupId: env.ROBLOX_CREATOR_GROUP_ID }
    : { userId: env.ROBLOX_CREATOR_USER_ID! };

  const form = new FormData();
  form.append('request', JSON.stringify({
    assetType: input.type,
    displayName: input.displayName.slice(0, 50),
    description: input.description.slice(0, 1000),
    creationContext: input.expectedPrice === undefined
      ? { creator }
      : { creator, expectedPrice: input.expectedPrice },
  }));
  form.append('fileContent', new Blob([input.file], { type: input.contentType }), 'asset');

  const res = await fetchImpl(ASSETS_ENDPOINT, {
    method: 'POST',
    // No content-type header: it must carry the multipart boundary, which FormData sets itself.
    // Setting it by hand here is the classic way to get a 400 that reads like a schema error.
    headers: { 'x-api-key': env.ROBLOX_API_KEY! },
    body: form,
  });

  const text = await res.text();
  let body: Record<string, unknown> | null = null;
  try { body = JSON.parse(text) as Record<string, unknown>; } catch { /* not JSON */ }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      // The body verbatim, truncated. A generic "upload failed" would hide the one sentence that
      // says whether the key lacks a scope, the creator is wrong, or the file was rejected.
      error: providerError(text, res.status),
      operationId: null,
    };
  }

  const operationId = operationIdFrom(body);
  if (!operationId) return { ok: false, status: res.status, error: `no operation in response: ${text.slice(0, 200)}`, operationId: null };
  const assetId = assetIdFrom(body);
  return assetId !== null
    ? { ok: true, done: true, assetId, operationId, status: res.status }
    : { ok: true, done: false, operationId, status: res.status };
}

/** Poll one operation. Same three-state result, for the same reason. */
export async function pollOperation(
  env: UploadEnv,
  operationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<UploadResult> {
  if (!env.ROBLOX_API_KEY) return { ok: false, status: 0, error: 'ROBLOX_API_KEY is not set', operationId };
  const res = await fetchImpl(`${OPERATIONS_ENDPOINT}/${encodeURIComponent(operationId)}`, {
    headers: { 'x-api-key': env.ROBLOX_API_KEY },
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, error: providerError(text, res.status), operationId };
  let body: Record<string, unknown> | null = null;
  try { body = JSON.parse(text) as Record<string, unknown>; } catch { /* not JSON */ }
  // An operation that reports an error is a FAILURE, not an incomplete success. Roblox answers 200
  // with an `error` member, so a status-code-only check would read this as still running forever.
  const err = body?.error as { message?: string; code?: string } | undefined;
  if (err) return { ok: false, status: res.status, error: typeof err.message === 'string' ? err.message : typeof err.code === 'string' ? err.code : 'operation failed', operationId };
  const assetId = assetIdFrom(body);
  if (assetId !== null) return { ok: true, done: true, assetId, operationId, status: res.status };
  return { ok: true, done: false, operationId, status: res.status };
}

/** `operations/abc-123` or `{ operationId: 'abc-123' }`, both of which Roblox has returned. */
export function operationIdFrom(body: unknown): string | null {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.operationId === 'string' && b.operationId) return b.operationId;
  if (typeof b.path === 'string') {
    const m = /(?:^|\/)operations\/([^/]+)$/.exec(b.path);
    if (m?.[1]) return m[1];
  }
  return null;
}

/**
 * The asset id, from wherever this response shape put it — and NEVER from a coercion.
 *
 * Roblox returns it as a decimal STRING under `response.assetId`, and `Number('')` is 0 while
 * `Number(undefined)` is NaN. Both would sail through a `> 0` check written the obvious way, and a
 * row stamped with asset id 0 is a row that looks imported and resolves to nothing.
 */
export function assetIdFrom(body: unknown): number | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const resp = (b.response ?? b) as Record<string, unknown>;
  const raw = resp.assetId ?? b.assetId;
  if (typeof raw === 'number') return Number.isSafeInteger(raw) && raw > 0 ? raw : null;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Archive an asset this key owns — the undo for an upload.
 *
 * WHY THIS EXISTS. 299 assets were uploaded to the owner's personal Roblox account before he had
 * agreed to that, which is exactly the kind of outward-facing action that needed asking first.
 * Being able to say "and here is the one command that removes them" is part of not doing it again:
 * an action with no reverse is a different, heavier decision than one with a reverse, and the two
 * should not be confused at the moment of taking it.
 *
 * Verified 2026-09-15: `POST /assets/v1/assets/{id}:archive` answers 401 with an invalid key and
 * 404 for the verbs that do not exist, so the route is real. Archiving is reversible on Roblox's
 * side (`:restore`), which is why this is archive and not a delete.
 */
export async function archiveAsset(
  env: UploadEnv,
  robloxAssetId: number,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; status: number; error?: string }> {
  if (!env.ROBLOX_API_KEY) return { ok: false, status: 0, error: 'ROBLOX_API_KEY is not set' };
  if (!Number.isSafeInteger(robloxAssetId) || robloxAssetId <= 0) {
    // The same refusal as assetIdFrom, for the same reason: asset 0 is not an asset, and a request
    // built from one would be a well-formed call against nothing.
    return { ok: false, status: 0, error: `${robloxAssetId} is not an asset id` };
  }
  const res = await fetchImpl(`${ASSETS_ENDPOINT}/${robloxAssetId}:archive`, {
    method: 'POST',
    // A JSON body here, unlike the multipart upload, so the type is stated.
    headers: { 'x-api-key': env.ROBLOX_API_KEY, 'content-type': 'application/json' },
    body: '{}',
  });
  if (res.ok) return { ok: true, status: res.status };
  return { ok: false, status: res.status, error: (await res.text()).slice(0, 300) || `HTTP ${res.status}` };
}
