// Turn a catalogued asset into one a customer's experience can actually use.
//
// THE PROBLEM THIS SOLVES, STATED PLAINLY. The library holds 7,000+ rows of provenance and not one
// of them has a `robloxAssetId`. A row without one is a CATALOGUE ENTRY: Apple knows the asset
// exists, who made it and under what licence, and cannot put it in anybody's game. That is why
// every ingested row is `pending_ingest` and why `ftsSearch` filters on `status = 'active'` —
// offering a row that cannot be inserted would be the library telling the truth in a way that
// produces a lie downstream.
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
}

export type UploadResult =
  | { ok: true; done: true; assetId: number; operationId: string }
  | { ok: true; done: false; operationId: string }
  | { ok: false; status: number; error: string; operationId: string | null };

/** Every reason an upload can be refused before a byte is sent, as a sentence rather than a code. */
export function preflight(env: UploadEnv, bytes: number, type: OpenUseUploadType | null): string | null {
  if (!env.ROBLOX_API_KEY) return 'ROBLOX_API_KEY is not set — uploading needs an Open Cloud key with the asset:write scope';
  const hasUser = !!env.ROBLOX_CREATOR_USER_ID;
  const hasGroup = !!env.ROBLOX_CREATOR_GROUP_ID;
  // Both set is an ambiguity, not a preference. Roblox would take one and the library would record
  // an owner nobody chose, which is the kind of quiet wrong answer that surfaces months later.
  if (hasUser && hasGroup) return 'both ROBLOX_CREATOR_USER_ID and ROBLOX_CREATOR_GROUP_ID are set — exactly one must be';
  if (!hasUser && !hasGroup) return 'neither ROBLOX_CREATOR_USER_ID nor ROBLOX_CREATOR_GROUP_ID is set — uploads need an owner';
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
  type: OpenUseUploadType;
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
    creationContext: { creator },
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
      error: text.slice(0, 400) || `HTTP ${res.status}`,
      operationId: null,
    };
  }

  const operationId = operationIdFrom(body);
  if (!operationId) return { ok: false, status: res.status, error: `no operation in response: ${text.slice(0, 200)}`, operationId: null };
  const assetId = assetIdFrom(body);
  return assetId !== null ? { ok: true, done: true, assetId, operationId } : { ok: true, done: false, operationId };
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
  if (!res.ok) return { ok: false, status: res.status, error: text.slice(0, 400) || `HTTP ${res.status}`, operationId };
  let body: Record<string, unknown> | null = null;
  try { body = JSON.parse(text) as Record<string, unknown>; } catch { /* not JSON */ }
  // An operation that reports an error is a FAILURE, not an incomplete success. Roblox answers 200
  // with an `error` member, so a status-code-only check would read this as still running forever.
  const err = body?.error as { message?: string; code?: string } | undefined;
  if (err) return { ok: false, status: res.status, error: typeof err.message === 'string' ? err.message : typeof err.code === 'string' ? err.code : 'operation failed', operationId };
  const assetId = assetIdFrom(body);
  if (assetId !== null) return { ok: true, done: true, assetId, operationId };
  return { ok: true, done: false, operationId };
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
