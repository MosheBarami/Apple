// The Creator Dashboard: read and write a CUSTOMER'S OWN Roblox account, with their own key.
//
// ---------------------------------------------------------------------------------------------
// WHY THIS MODULE HAS NO PLATFORM CREDENTIAL IN IT ANYWHERE
// ---------------------------------------------------------------------------------------------
// Apple once created 299 assets in the owner's personal Roblox account because the only write
// credential in the product was a single shared one, configured once. Roblox refused to take them
// back — an Image is "not an archivable asset type" — so that account keeps them permanently.
//
// `asset-import.ts` has a legitimate no-customer branch: Apple's own library work writes to Apple's
// own account, behind `ROBLOX_UPLOAD_AUTHORISED_FOR`. THIS MODULE HAS NO SUCH BRANCH, and that is
// the design rather than an omission. Every call here acts on a customer's own account by
// definition, so "no key connected" is not a case to fall back from — it is the end of the
// request. `CreatorEnv` therefore does not carry `ROBLOX_API_KEY` at all: there is no shared key in
// scope to reach for by accident, and a future edit that wants one has to add it and explain why.
//
// ---------------------------------------------------------------------------------------------
// EVERY ENDPOINT BELOW WAS VERIFIED, TWICE, ON 2026-09-15
// ---------------------------------------------------------------------------------------------
// 1. Against Roblox's own published OpenAPI documents (github.com/Roblox/creator-docs,
//    content/en-us/reference/cloud/), which is where the request SHAPES come from.
// 2. Against the live service with a deliberately invalid key, which is where the PATHS come from:
//    a real route answers 401 "Invalid API Key", a route that does not exist answers 404. Every
//    path here answered 401; the things named in `UNBUILDABLE` answered 404.
//
// The second check is not redundant. Documentation lags moves, and the repository already carries
// the scar of a function written against a plausible-looking URL. `VERIFIED_ENDPOINTS` is a closed
// set asserted by the tests, so an endpoint added without going through both checks turns a test
// red instead of turning into a request against somebody's real account.
import type { Env } from './env';
import { useRobloxCredential, type CredentialEnv } from './user-credentials';
import { oncePerIsolate } from './schema-once';
import {
  assetTypeForContentType,
  uploadAsset as postAssetToRoblox,
  pollOperation,
  ROBLOX_UPLOAD_TYPES,
  MAX_UPLOAD_BYTES,
  type RobloxUploadType,
  type UploadEnv,
} from './roblox-upload';

const API = 'https://apis.roblox.com';

/**
 * Every path this module may reach, as templates. Asserted as a closed set by the tests.
 *
 * A list that is merely descriptive would drift. This one is the thing the test compares against,
 * so adding a request without adding it here fails, and adding it here without a verified 401 is a
 * lie somebody has to type deliberately.
 */
export const VERIFIED_ENDPOINTS = [
  `${API}/cloud/v2/universes/{id}`,
  `${API}/cloud/v2/users/{id}/inventory-items`,
  `${API}/game-passes/v1/universes/{id}/game-passes`,
  `${API}/game-passes/v1/universes/{id}/game-passes/creator`,
  `${API}/asset-permissions-api/v1/assets/permissions`,
  `${API}/assets/v1/assets`,
  `${API}/assets/v1/assets/{id}`,
  `${API}/assets/v1/operations/{id}`,
] as const;

/**
 * The scope each endpoint needs, taken from `x-roblox-scopes` in Roblox's own master Cloud spec.
 *
 * `x-roblox-scopes` is the field that matters and it is easy to miss: the ordinary OpenAPI
 * `security` block on these operations says only `roblox-api-key` with an EMPTY scope array, which
 * reads as "any key will do" and is wrong. The real permission a person ticks on Roblox's API-key
 * page is in the extension field, and these five strings were read out of it on 2026-09-15:
 *
 *   PATCH /asset-permissions-api/v1/assets/permissions        -> asset-permissions:write
 *   POST  /assets/v1/assets                                   -> asset:read, asset:write
 *   GET   /assets/v1/assets/{assetId}                         -> asset:read
 *   GET   /cloud/v2/users/{user_id}/inventory-items           -> user.inventory-item:read
 *   POST  /game-passes/v1/universes/{id}/game-passes          -> game-pass:write
 *   GET   /game-passes/v1/universes/{id}/game-passes/creator  -> game-pass:read
 *
 * THE ONE HONEST GAP: `GET /cloud/v2/universes/{universe_id}` carries no `x-roblox-scopes` at all
 * in the published spec, while its own PATCH carries `universe:write`. `universe:read` is a real
 * scope string — it is declared on sixteen other paths in the same document — so the read is gated
 * on it, which is the conservative direction: the worst case is asking for a permission Roblox
 * might not have required, never acting without one it did.
 */


/**
 * What the owner asked for that Open Cloud does not offer, with the evidence, in the module rather
 * than in a document nobody opens.
 *
 * These are quoted back to the person in the API response, because "Apple cannot do this" is a
 * fact about Roblox that a customer is entitled to have in words instead of discovering as a
 * missing button.
 */
export const UNBUILDABLE = {
  promoCodes:
    'Roblox Open Cloud has no creator-facing promo or redemption code endpoint. Checked against the '
    + 'published Cloud spec (749 paths, none for codes) and by live probe on 2026-09-15: '
    + '/promo-codes/... and /promotion-codes/... both answer 404 while every real route answers 401. '
    + '(/v1/promotion-channels is social marketing links, not redeemable codes.) Codes in Roblox '
    + 'games are built by the game itself in Luau against a DataStore, which is where this belongs.',
  downloadAssetFile:
    'Roblox Open Cloud cannot hand back the FILE of an asset, only its record. Measured against '
    + 'Roblox\'s own published master Cloud specification on 2026-09-15: 749 paths, and not one '
    + 'operation in any of them declares a binary response body — no octet-stream, no image/*, no '
    + '"format": "binary" anywhere in a 200. GET /assets/v1/assets/{id} answers with the Asset '
    + 'schema, whose thirteen properties are all metadata: there is no content field and no download '
    + 'URL. The only service that has ever served asset bytes is assetdelivery, which does not '
    + 'appear in the Cloud spec at all and is authenticated by the .ROBLOSECURITY browser cookie — '
    + 'the credential Roblox\'s own spec describes as "DO NOT SHARE THIS". So getAsset returns what '
    + 'an asset IS; nothing here returns what it contains, and a customer who needs the file '
    + 'downloads it from their own Creator Dashboard in a browser where their session already is.',
  listExperiences:
    'Roblox Open Cloud cannot list the experiences an account owns. GET /v1/user/universes exists '
    + 'but its only documented security scheme is roblox-legacy-cookie — the .ROBLOSECURITY browser '
    + 'cookie, which Roblox\'s own spec describes as "DO NOT SHARE THIS. Sharing this will allow '
    + 'someone to log in as you and to steal your Robux and items." An Open Cloud API key cannot '
    + 'call it, and asking a customer for that cookie would be asking for their whole account. '
    + 'Name the experience by its universe id instead — getExperience resolves it with their key.',
} as const;

// ---------------------------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------------------------

/**
 * Deliberately NOT `UploadEnv`. There is no `ROBLOX_API_KEY` in this type, so there is no shared
 * credential in scope for any function in this file to fall back to.
 */
export interface CreatorEnv extends CredentialEnv {
  CORPUS: Env['CORPUS'];
}

export type Ok<T> = { ok: true; data: T; status: number; audited: boolean; auditError?: string };
export type Err = { ok: false; error: string; status: number; audited: boolean; auditError?: string };
export type Result<T> = Ok<T> | Err;

export interface Experience {
  universeId: string;
  displayName: string;
  description: string;
  visibility: string;
  /** `users/123` or `groups/456`, verbatim as Roblox returns it. */
  owner: string | null;
  createTime: string | null;
  updateTime: string | null;
}

export interface OwnedAsset {
  assetId: string;
  /** Roblox's own enum, e.g. DECAL, MODEL, AUDIO. Passed through rather than re-spelled. */
  type: string;
  addTime: string | null;
}

/**
 * One asset's RECORD. Not its file — see `UNBUILDABLE.downloadAssetFile`.
 *
 * `moderationState` is on here because it is the field that decides whether an upload became a
 * usable thing. Roblox answers the create call long before a human or a model has looked at the
 * asset, so "the upload succeeded" and "the asset is Approved" are different facts and the second
 * one arrives later. A dashboard that showed only the first would be telling a customer their
 * asset is ready while Roblox is still deciding, or after Roblox has said no.
 */
export interface AssetRecord {
  assetId: string;
  assetType: string;
  displayName: string;
  description: string;
  /** `Reviewing`, `Rejected` or `Approved`, or null when Roblox did not say. */
  moderationState: string | null;
  /** `Active` or `Archived`. */
  state: string | null;
  revisionId: string | null;
  revisionCreateTime: string | null;
}

/**
 * What an upload is, honestly, at the moment the request comes back.
 *
 * `done: false` with a null `assetId` is the NORMAL first answer, not an error: Create Asset
 * returns a long-running Operation and Roblox finishes it afterwards. Collapsing the two into a
 * nullable id would let a caller write `if (assetId)` and treat "still processing" as "failed".
 */
export interface UploadedAsset {
  done: boolean;
  assetId: number | null;
  operationId: string;
}

export interface GamePass {
  gamePassId: number;
  name: string;
  description: string;
  isForSale: boolean;
  iconAssetId: number;
  createdTimestamp: string | null;
  updatedTimestamp: string | null;
  priceInRobux: number | null;
}

/** The documented enums, copied from asset-permissions-api/v1.json. */
export const PERMISSION_SUBJECTS = ['User', 'Group', 'GroupRoleset', 'All', 'Universe'] as const;
export const PERMISSION_ACTIONS = ['Edit', 'Use', 'Download', 'CopyFromRcc', 'UpdateFromRcc'] as const;
export type PermissionSubject = (typeof PERMISSION_SUBJECTS)[number];
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

// ---------------------------------------------------------------------------------------------
// the audit log
// ---------------------------------------------------------------------------------------------

/**
 * One append-only row per attempted write to a customer's Roblox account.
 *
 * Follows `asset_verification_log` in asset-library.ts: append-only, the requester recorded, the
 * response kept as evidence and capped so the log stays cheap. The columns answer the three
 * questions the incident left behind — WHAT was done, to WHICH account, on WHOSE behalf — and a
 * fourth the incident also needed and did not have: WHETHER IT WORKED, because a refused attempt on
 * somebody's account is still a fact about that account.
 *
 * Refusals that never left the worker (no key, wrong scope, bad enum) are NOT logged here: nothing
 * touched anybody's account, and filling the log with them would bury the rows that matter.
 */
function createWriteTable(env: Pick<CreatorEnv, 'CORPUS'>): Promise<void> {
  return env.CORPUS.prepare(
    `create table if not exists creator_write_log(
       id integer primary key autoincrement,
       user_id text not null,
       at text not null,
       action text not null,
       roblox_creator_id text not null,
       creator_type text not null,
       target text,
       ok integer not null,
       http_status integer,
       request text,
       response text
     )`,
  ).run().then(() => undefined);
}

// THE THIRD ARGUMENT IS THE DATABASE, AND IT IS NOT OPTIONAL HERE. `oncePerIsolate` keys its memo
// on the binding object; omit it and this store falls back to the isolate-wide table, where one
// flag covers every database the process ever builds. In production that reads as identical — one
// CORPUS per isolate — and in a test suite that fabricates a fresh D1 stub per case the second
// stub is told the schema was already made and never gets its table. That is the whole of the bug
// the other seven stores were fixed for; this one was written while that fix was landing.
export function ensureWriteTable(env: Pick<CreatorEnv, 'CORPUS'>): Promise<void> {
  return oncePerIsolate('creator-writes', () => createWriteTable(env), env.CORPUS);
}

export interface WriteRecord {
  userId: string;
  action: 'create_gamepass' | 'grant_asset_permission' | 'upload_asset';
  robloxCreatorId: string;
  creatorType: 'user' | 'group';
  /** What was acted on, as a resource path: `universes/123`, `assets/981234567`. */
  target: string | null;
  ok: boolean;
  httpStatus: number | null;
  /** A summary of what was asked for. NEVER the key — see the assertion in the tests. */
  request: unknown;
  response: string | null;
}

async function recordWrite(env: Pick<CreatorEnv, 'CORPUS'>, r: WriteRecord): Promise<void> {
  await ensureWriteTable(env);
  await env.CORPUS.prepare(
    `insert into creator_write_log(user_id, at, action, roblox_creator_id, creator_type, target, ok, http_status, request, response)
     values(?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    r.userId,
    new Date().toISOString(),
    r.action,
    r.robloxCreatorId,
    r.creatorType,
    r.target,
    r.ok ? 1 : 0,
    r.httpStatus,
    JSON.stringify(r.request).slice(0, 4000),
    // Same 8 KB cap as asset_verification_log: enough to be evidence, cheap enough to keep.
    r.response ? r.response.slice(0, 8192) : null,
  ).run();
}

/**
 * Record the write and say whether the record landed.
 *
 * THE RETURN VALUE IS THE POINT. The thing on Roblox already exists and cannot be un-created, so a
 * failed audit cannot be turned into a failed operation — but it must not be rendered as a clean
 * success either. That is this repository's named failure shape: a failure to observe presented as
 * an observation. The caller is handed `audited: false` and the reason, and passes both on.
 */
async function audit(env: Pick<CreatorEnv, 'CORPUS'>, r: WriteRecord): Promise<{ audited: boolean; auditError?: string }> {
  try {
    await recordWrite(env, r);
    return { audited: true };
  } catch (e) {
    return { audited: false, auditError: (e as Error)?.message ?? String(e) };
  }
}

// ---------------------------------------------------------------------------------------------
// plumbing
// ---------------------------------------------------------------------------------------------

/**
 * The customer's key for one named scope, or a sentence saying why not.
 *
 * Every function in this file starts here, and nothing in this file has anything else to use. The
 * scope is passed per call rather than per credential because "they gave us a key" and "they agreed
 * to this particular action" are different facts — rule 5 in user-credentials.ts.
 */
async function keyFor(env: CreatorEnv, userId: string, scope: Parameters<typeof useRobloxCredential>[2]) {
  const use = await useRobloxCredential(env, userId, scope);
  if (!use.ok) return { ok: false as const, error: use.error ?? 'the connected Roblox key cannot be used for this' };
  return {
    ok: true as const,
    apiKey: use.apiKey!,
    creatorId: use.creatorId!,
    creatorType: use.creatorType ?? 'user',
  };
}

const refused = (error: string, status = 0): Err => ({ ok: false, error, status, audited: false });

/**
 * Did this attempt actually reach Roblox?
 *
 * IT DECIDES WHETHER `audited` MEANS ANYTHING. `audited: false` is the most alarming thing this
 * product can say — "something was done to your Roblox account and the record of it did not land",
 * about a thing that cannot be un-created. A refusal that never sent a request has nothing to log,
 * so reporting `audited: false` for it would be that alarm going off for an event that did not
 * happen. Callers use this to decide whether to include the field at all.
 *
 * `status === 0` is the marker because `refused()` is the only thing that produces it: every path
 * that spoke to Roblox carries Roblox's own status, and 200 is as much a fact as 403.
 */
export function reachedRoblox(r: Result<unknown>): boolean {
  return r.ok || r.status !== 0;
}

/** Roblox's error sentence, verbatim and truncated — never a generic "it failed". */
function errorFrom(text: string, status: number): string {
  const trimmed = text.trim();
  if (!trimmed) return `HTTP ${status}`;
  try {
    const b = JSON.parse(trimmed) as Record<string, unknown>;
    const direct = b.errorMessage ?? b.message;
    if (typeof direct === 'string' && direct) return direct;
    const nested = (b.error as { message?: string } | undefined)?.message;
    if (typeof nested === 'string' && nested) return nested;
    const arr = b.errors as Array<{ message?: string }> | undefined;
    if (Array.isArray(arr) && typeof arr[0]?.message === 'string' && arr[0].message) return arr[0].message;
  } catch { /* not JSON — the body itself is the message */ }
  return trimmed.slice(0, 400);
}

async function readJson(res: Response): Promise<{ text: string; body: Record<string, unknown> | null }> {
  const text = await res.text();
  try { return { text, body: JSON.parse(text) as Record<string, unknown> }; } catch { return { text, body: null }; }
}

/** `universes/6543210` -> `6543210`. Roblox returns resource paths; callers want the id. */
function idFromPath(path: unknown, prefix: string): string {
  const s = typeof path === 'string' ? path : '';
  const m = new RegExp(`(?:^|/)${prefix}/([^/]+)`).exec(s);
  return m?.[1] ?? '';
}

/** A universe id must be digits: it goes into a URL path, and a bad one is a request into nowhere. */
function badUniverseId(universeId: string): string | null {
  return /^\d+$/.test(String(universeId ?? '')) ? null : `"${universeId}" is not a universe id — it is the number in your experience's Creator Dashboard URL`;
}

// ---------------------------------------------------------------------------------------------
// READS — safe, and what makes the connection feel real before anything is written
// ---------------------------------------------------------------------------------------------

/**
 * One experience, by universe id.
 *
 * This is deliberately get-one and not list-all: see `UNBUILDABLE.listExperiences`. Open Cloud's
 * only list-my-universes endpoint is cookie-authenticated, and the cookie in question is the one
 * that IS the account.
 */
export async function getExperience(
  env: CreatorEnv,
  userId: string,
  universeId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<Experience>> {
  const bad = badUniverseId(universeId);
  if (bad) return refused(bad);
  const key = await keyFor(env, userId, 'universe:read');
  if (!key.ok) return refused(key.error);

  const res = await fetchImpl(`${API}/cloud/v2/universes/${encodeURIComponent(universeId)}`, {
    headers: { 'x-api-key': key.apiKey },
  });
  const { text, body } = await readJson(res);
  if (!res.ok) return refused(errorFrom(text, res.status), res.status);

  const b = body ?? {};
  return {
    ok: true,
    status: res.status,
    audited: true,
    data: {
      universeId: idFromPath(b.path, 'universes') || String(universeId),
      displayName: typeof b.displayName === 'string' ? b.displayName : '',
      description: typeof b.description === 'string' ? b.description : '',
      visibility: typeof b.visibility === 'string' ? b.visibility : 'UNKNOWN',
      owner: typeof b.user === 'string' ? b.user : typeof b.group === 'string' ? b.group : null,
      createTime: typeof b.createTime === 'string' ? b.createTime : null,
      updateTime: typeof b.updateTime === 'string' ? b.updateTime : null,
    },
  };
}

export interface AssetPage { items: OwnedAsset[]; nextPageToken: string | null }

/**
 * What the connected account owns.
 *
 * THE ACCOUNT IN THE PATH COMES FROM THE STORED CREDENTIAL, never from the request. A userId
 * parameter here would let a caller aim this at somebody else's inventory and have Roblox decide
 * whether that is allowed; taking it from the credential means the question cannot be asked.
 */
export async function listOwnedAssets(
  env: CreatorEnv,
  userId: string,
  opts: { maxPageSize?: number; pageToken?: string; filter?: string } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<Result<AssetPage>> {
  const key = await keyFor(env, userId, 'user.inventory-item:read');
  if (!key.ok) return refused(key.error);

  const url = new URL(`${API}/cloud/v2/users/${encodeURIComponent(key.creatorId)}/inventory-items`);
  if (opts.maxPageSize) url.searchParams.set('maxPageSize', String(opts.maxPageSize));
  if (opts.pageToken) url.searchParams.set('pageToken', opts.pageToken);
  if (opts.filter) url.searchParams.set('filter', opts.filter);

  const res = await fetchImpl(url.toString(), { headers: { 'x-api-key': key.apiKey } });
  const { text, body } = await readJson(res);
  if (!res.ok) return refused(errorFrom(text, res.status), res.status);

  const raw = Array.isArray(body?.inventoryItems) ? (body!.inventoryItems as Record<string, unknown>[]) : [];
  const items: OwnedAsset[] = [];
  for (const it of raw) {
    // Only assets. A badge, a game pass and a private server also arrive here, and calling one of
    // those an asset would put an id in front of somebody that nothing can insert.
    const d = it.assetDetails as Record<string, unknown> | undefined;
    if (!d || typeof d.assetId !== 'string') continue;
    items.push({
      assetId: d.assetId,
      type: typeof d.inventoryItemAssetType === 'string' ? d.inventoryItemAssetType : 'UNSPECIFIED',
      addTime: typeof it.addTime === 'string' ? it.addTime : null,
    });
  }
  const next = typeof body?.nextPageToken === 'string' && body.nextPageToken ? body.nextPageToken : null;
  return { ok: true, status: res.status, audited: true, data: { items, nextPageToken: next } };
}

export interface GamePassPage { gamePasses: GamePass[]; nextPageToken: string | null }

function gamePassFrom(b: Record<string, unknown>): GamePass {
  const price = (b.priceInformation as Record<string, unknown> | null | undefined)?.defaultPriceInRobux;
  return {
    gamePassId: typeof b.gamePassId === 'number' ? b.gamePassId : Number(b.gamePassId ?? 0),
    name: typeof b.name === 'string' ? b.name : '',
    description: typeof b.description === 'string' ? b.description : '',
    isForSale: b.isForSale === true,
    iconAssetId: typeof b.iconAssetId === 'number' ? b.iconAssetId : 0,
    createdTimestamp: typeof b.createdTimestamp === 'string' ? b.createdTimestamp : null,
    updatedTimestamp: typeof b.updatedTimestamp === 'string' ? b.updatedTimestamp : null,
    priceInRobux: typeof price === 'number' ? price : null,
  };
}

export async function listGamePasses(
  env: CreatorEnv,
  userId: string,
  universeId: string,
  opts: { pageSize?: number; pageToken?: string } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<Result<GamePassPage>> {
  const bad = badUniverseId(universeId);
  if (bad) return refused(bad);
  const key = await keyFor(env, userId, 'game-pass:read');
  if (!key.ok) return refused(key.error);

  const url = new URL(`${API}/game-passes/v1/universes/${encodeURIComponent(universeId)}/game-passes/creator`);
  if (opts.pageSize) url.searchParams.set('pageSize', String(opts.pageSize));
  if (opts.pageToken) url.searchParams.set('pageToken', opts.pageToken);

  const res = await fetchImpl(url.toString(), { headers: { 'x-api-key': key.apiKey } });
  const { text, body } = await readJson(res);
  if (!res.ok) return refused(errorFrom(text, res.status), res.status);

  const raw = Array.isArray(body?.gamePasses) ? (body!.gamePasses as Record<string, unknown>[]) : [];
  const next = typeof body?.nextPageToken === 'string' && body.nextPageToken ? body.nextPageToken : null;
  return { ok: true, status: res.status, audited: true, data: { gamePasses: raw.map(gamePassFrom), nextPageToken: next } };
}

/** `assets/981234567` -> `981234567`, and a plain number stays itself. */
function badAssetId(assetId: string): string | null {
  return /^\d+$/.test(String(assetId ?? '')) ? null : `"${assetId}" is not an asset id`;
}

function assetRecordFrom(b: Record<string, unknown>, fallbackId: string): AssetRecord {
  const mod = b.moderationResult as Record<string, unknown> | undefined;
  const id = b.assetId;
  return {
    // Roblox returns the id as a number here and as a decimal string elsewhere in the same API.
    // It is carried as a string either way, because an id is a name and never an amount.
    assetId: typeof id === 'number' || typeof id === 'string' ? String(id) : (idFromPath(b.path, 'assets') || String(fallbackId)),
    assetType: typeof b.assetType === 'string' ? b.assetType : 'Unspecified',
    displayName: typeof b.displayName === 'string' ? b.displayName : '',
    description: typeof b.description === 'string' ? b.description : '',
    moderationState: typeof mod?.moderationState === 'string' ? mod.moderationState : null,
    state: typeof b.state === 'string' ? b.state : null,
    revisionId: typeof b.revisionId === 'string' ? b.revisionId : null,
    revisionCreateTime: typeof b.revisionCreateTime === 'string' ? b.revisionCreateTime : null,
  };
}

/**
 * One asset the customer owns, as a record.
 *
 * THIS IS AS CLOSE TO "DOWNLOAD" AS OPEN CLOUD GETS, and the gap is in `UNBUILDABLE` with the
 * count that proves it rather than approximated by a function that fetches from somewhere else.
 */
export async function getAsset(
  env: CreatorEnv,
  userId: string,
  assetId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<AssetRecord>> {
  const bad = badAssetId(assetId);
  if (bad) return refused(bad);
  const key = await keyFor(env, userId, 'asset:read');
  if (!key.ok) return refused(key.error);

  const res = await fetchImpl(`${API}/assets/v1/assets/${encodeURIComponent(assetId)}`, {
    headers: { 'x-api-key': key.apiKey },
  });
  const { text, body } = await readJson(res);
  if (!res.ok) return refused(errorFrom(text, res.status), res.status);
  return { ok: true, status: res.status, audited: true, data: assetRecordFrom(body ?? {}, assetId) };
}

/**
 * Finish the job an upload started.
 *
 * An upload that was accepted and then forgotten is a real asset in somebody's account with nothing
 * pointing at it — and in an account where an Image cannot be deleted, that is the worst kind of
 * leftover. Gated on `asset:read` because that is what the operations endpoint declares.
 */
export async function getUploadStatus(
  env: CreatorEnv,
  userId: string,
  operationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<UploadedAsset>> {
  const id = String(operationId ?? '').trim();
  if (!id) return refused('there is no operation id to check');
  const key = await keyFor(env, userId, 'asset:read');
  if (!key.ok) return refused(key.error);

  const out = await pollOperation({ ROBLOX_API_KEY: key.apiKey }, id, fetchImpl);
  if (!out.ok) return refused(out.error, out.status);
  return {
    ok: true,
    status: out.status,
    audited: true,
    data: { done: out.done, assetId: out.done ? out.assetId : null, operationId: id },
  };
}

// ---------------------------------------------------------------------------------------------
// WRITES — each one gated, each one audited
// ---------------------------------------------------------------------------------------------

export interface UploadAssetInput {
  file: ArrayBuffer;
  contentType: string;
  displayName: string;
  description?: string;
  /**
   * Only for what the content type cannot say. `model/x-rbxm` is listed by Roblox under BOTH
   * Animation and Model, and a png may be meant as a Decal rather than an Image.
   */
  type?: RobloxUploadType;
  /** The Robux ceiling. Defaults to 0 — see below, it is a consent decision, not a tuning knob. */
  expectedPrice?: number;
}

/**
 * Put a file into the CUSTOMER'S OWN Roblox account.
 *
 * THIS IS THE OPERATION THAT CAUSED THE INCIDENT, so it is worth saying exactly what is different
 * now. 299 assets were created in one person's account because the product held a single shared
 * write key and a creator id in a config file, and between them that was enough to start uploading.
 * Three things here make that shape impossible rather than discouraged:
 *
 *   THE KEY IS THE CUSTOMER'S. `CreatorEnv` has no `ROBLOX_API_KEY` field, so there is no shared
 *   credential in scope for this function to fall back to even if somebody wrote the fallback.
 *
 *   THE ACCOUNT COMES FROM THE CREDENTIAL, NOT THE REQUEST. `UploadAssetInput` has no creator
 *   field. A caller cannot aim this at an account, only at the one their own key belongs to.
 *
 *   THE CONSENT IS THE SCOPE, TICKED PER ACCOUNT. `asset:write` was ticked by this person against
 *   this account, after a panel that says Roblox will not let them delete an Image afterwards. The
 *   `ROBLOX_UPLOAD_AUTHORISED_FOR` equality that guards Apple's own account is satisfied here by
 *   the creator id out of that same credential, which is the two facts — which account, and may
 *   you — arriving together rather than from two different places.
 *
 * AND IT WILL NOT SPEND THEIR ROBUX. `expectedPrice` defaults to 0, so an upload that would carry a
 * fee fails with Roblox's own 400 instead of taking the money. Raising it is a separate, explicit
 * act by a caller who knows what it costs.
 */
export async function uploadAsset(
  env: CreatorEnv,
  userId: string,
  input: UploadAssetInput,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<UploadedAsset>> {
  const displayName = String(input.displayName ?? '').trim();
  if (!displayName) return refused('an asset needs a name');

  // The type is resolved HERE rather than by `uploadTypeFor`, which answers the library's question
  // ("is this Open Use?") and would refuse a Model that this customer is perfectly entitled to
  // create in their own account. Both tables live in roblox-upload.ts; this one is Roblox's full
  // published list and that one is the Open Use subset.
  const type = input.type ?? assetTypeForContentType(input.contentType);
  if (!type) {
    return refused(
      `Roblox Open Cloud does not accept ${input.contentType || 'that file type'} — it takes png, `
      + 'jpeg, bmp and tga images, mp3/ogg/wav/flac audio, fbx/gltf/glb models, mp4 and mov video',
    );
  }
  if (!(ROBLOX_UPLOAD_TYPES as readonly string[]).includes(type)) {
    return refused(`"${type}" is not a Roblox asset type — it accepts ${ROBLOX_UPLOAD_TYPES.join(', ')}`);
  }
  const bytes = input.file?.byteLength ?? 0;
  if (bytes <= 0) return refused('the file is empty');
  if (bytes > MAX_UPLOAD_BYTES) {
    return refused(`${bytes} bytes is over Roblox's ${MAX_UPLOAD_BYTES}-byte limit for one upload`);
  }

  const key = await keyFor(env, userId, 'asset:write');
  if (!key.ok) return refused(key.error);

  // Built here, from the credential, and thrown away when this call returns. It is an `UploadEnv`
  // by shape and not by provenance: nothing in it came from the worker's own configuration.
  //
  // FALSIFIED 2026-09-15 by replacing this with `key.ok ? {…} : env`, the helpful version. Both
  // negative tests went red and the route answered 200 with asset 981234999 created in the
  // PLATFORM's account for a customer who had connected nothing — the incident, reproduced in
  // eight lines. The audit could not even record it: with no customer creator id to bind, the
  // insert failed and the response carried `audited: false`.
  const account: UploadEnv = {
    ROBLOX_API_KEY: key.apiKey,
    ...(key.creatorType === 'group'
      ? { ROBLOX_CREATOR_GROUP_ID: key.creatorId }
      : { ROBLOX_CREATOR_USER_ID: key.creatorId }),
    ROBLOX_UPLOAD_AUTHORISED_FOR: key.creatorId,
  };

  const up = await postAssetToRoblox(account, {
    file: input.file,
    contentType: input.contentType,
    displayName,
    description: String(input.description ?? ''),
    type,
    expectedPrice: input.expectedPrice ?? 0,
  }, fetchImpl);

  // A status of 0 means `preflight` stopped it and nothing was sent. Every one of its conditions is
  // already satisfied by the object built above, so this should be unreachable — and "should be
  // unreachable" is how a row claiming a write that never happened gets into the log. It is
  // returned as a plain refusal, on the same rule as every other refusal that never left: nothing
  // touched the account, so nothing is written down about the account.
  if (!up.ok && up.status === 0) return refused(up.error);

  const assetId = up.ok && up.done ? up.assetId : null;
  const trail = await audit(env, {
    userId,
    action: 'upload_asset',
    robloxCreatorId: key.creatorId,
    creatorType: key.creatorType,
    // The asset when Roblox named one, the operation when it has not yet. An upload still being
    // processed has a target that does not exist yet, and recording nothing would lose the only
    // handle anybody has on it.
    target: assetId !== null ? `assets/${assetId}` : up.ok ? `operations/${up.operationId}` : null,
    ok: up.ok,
    httpStatus: up.status,
    request: { displayName, assetType: type, contentType: input.contentType, bytes, expectedPrice: input.expectedPrice ?? 0 },
    response: up.ok ? `operation ${up.operationId}${assetId !== null ? ` -> asset ${assetId}` : ' (processing)'}` : up.error,
  });

  if (!up.ok) return { ok: false, error: up.error, status: up.status, ...trail };
  return { ok: true, status: up.status, data: { done: up.done, assetId, operationId: up.operationId }, ...trail };
}

export interface CreateGamePassInput {
  universeId: string;
  name: string;
  description?: string;
  price?: number;
  isForSale?: boolean;
  isRegionalPricingEnabled?: boolean;
  /** The thumbnail. Roblox names this field `imageFile` on create and `file` on update. */
  icon?: { bytes: ArrayBuffer; contentType: string };
}

/**
 * Create a game pass on one of the customer's experiences.
 *
 * THE BODY IS MULTIPART, NOT JSON, and that is not a stylistic choice — game-passes/v1.json
 * declares `multipart/form-data` with a required `name`. A JSON body here is a 400 forever, which
 * is the precise shape of the dead branch this repository refuses to ship again. The test asserts
 * the FormData and the field names against the recorded document.
 *
 * NOT REVERSIBLE THROUGH THIS API. Open Cloud publishes create and update and no delete, so a game
 * pass made here can be taken off sale and never removed. The settings panel says so before the
 * scope is ticked, for the same reason the asset upload warning exists.
 */
export async function createGamePass(
  env: CreatorEnv,
  userId: string,
  input: CreateGamePassInput,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<GamePass>> {
  const bad = badUniverseId(input.universeId);
  if (bad) return refused(bad);
  const name = String(input.name ?? '').trim();
  if (!name) return refused('a game pass needs a name');
  if (input.price !== undefined && (!Number.isInteger(input.price) || input.price < 0)) {
    return refused(`${input.price} is not a price in Robux`);
  }

  const key = await keyFor(env, userId, 'game-pass:write');
  if (!key.ok) return refused(key.error);

  const form = new FormData();
  form.append('name', name);
  if (input.description !== undefined) form.append('description', String(input.description));
  if (input.isForSale !== undefined) form.append('isForSale', String(input.isForSale));
  if (input.price !== undefined) form.append('price', String(input.price));
  if (input.isRegionalPricingEnabled !== undefined) form.append('isRegionalPricingEnabled', String(input.isRegionalPricingEnabled));
  if (input.icon) form.append('imageFile', new Blob([input.icon.bytes], { type: input.icon.contentType }), 'icon');

  const res = await fetchImpl(`${API}/game-passes/v1/universes/${encodeURIComponent(input.universeId)}/game-passes`, {
    method: 'POST',
    // No content-type header: FormData sets it WITH the multipart boundary. Setting it by hand is
    // the classic way to get a 400 that reads like a schema error — see roblox-upload.ts.
    headers: { 'x-api-key': key.apiKey },
    body: form,
  });
  const { text, body } = await readJson(res);

  const trail = await audit(env, {
    userId,
    action: 'create_gamepass',
    robloxCreatorId: key.creatorId,
    creatorType: key.creatorType,
    target: `universes/${input.universeId}`,
    ok: res.ok,
    httpStatus: res.status,
    request: { name, price: input.price ?? null, isForSale: input.isForSale ?? null, hasIcon: !!input.icon },
    response: text,
  });

  if (!res.ok) return { ok: false, error: errorFrom(text, res.status), status: res.status, ...trail };
  return { ok: true, status: res.status, data: gamePassFrom(body ?? {}), ...trail };
}

export interface GrantPermissionInput {
  subjectType: PermissionSubject;
  /** Must be empty for subjectType 'All' — Roblox's own rule, enforced before the request. */
  subjectId?: string | null;
  action: PermissionAction;
  assetIds: number[];
  grantToDependencies?: boolean;
}

/**
 * Let somebody else use assets this account owns.
 *
 * The valid AssetType–SubjectType–Action combinations are Roblox's and are enforced by Roblox; what
 * is enforced HERE is that the two enums are the documented ones, because a misspelled action is a
 * request that reaches somebody's account and does something other than what was asked.
 *
 * ONE-WAY, LIKE THE REST OF THIS FILE. asset-permissions-api/v1.json publishes a grant and no
 * revoke, so this adds access and cannot take it back.
 */
export async function grantAssetPermission(
  env: CreatorEnv,
  userId: string,
  input: GrantPermissionInput,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<{ granted: number }>> {
  if (!(PERMISSION_SUBJECTS as readonly string[]).includes(input.subjectType)) {
    return refused(`"${input.subjectType}" is not a permission subject — Roblox accepts ${PERMISSION_SUBJECTS.join(', ')}`);
  }
  if (!(PERMISSION_ACTIONS as readonly string[]).includes(input.action)) {
    return refused(`"${input.action}" is not a permission action — Roblox accepts ${PERMISSION_ACTIONS.join(', ')}`);
  }
  const ids = Array.isArray(input.assetIds) ? input.assetIds.filter((n) => Number.isSafeInteger(n) && n > 0) : [];
  if (!ids.length) return refused('no asset ids to grant permission to');
  if (input.subjectType === 'All' && input.subjectId) {
    return refused('subjectId must be empty when the subject is "All" — that grant is to everybody');
  }
  if (input.subjectType !== 'All' && !input.subjectId) {
    return refused(`a ${input.subjectType} grant needs the id of the ${input.subjectType.toLowerCase()} to grant to`);
  }

  const key = await keyFor(env, userId, 'asset-permissions:write');
  if (!key.ok) return refused(key.error);

  const payload = {
    subjectType: input.subjectType,
    subjectId: input.subjectId ?? null,
    action: input.action,
    requests: ids.map((assetId) =>
      input.grantToDependencies === undefined ? { assetId } : { assetId, grantToDependencies: input.grantToDependencies }),
  };

  const res = await fetchImpl(`${API}/asset-permissions-api/v1/assets/permissions`, {
    method: 'PATCH',
    headers: { 'x-api-key': key.apiKey, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const { text } = await readJson(res);

  const trail = await audit(env, {
    userId,
    action: 'grant_asset_permission',
    robloxCreatorId: key.creatorId,
    creatorType: key.creatorType,
    target: ids.map((n) => `assets/${n}`).join(','),
    ok: res.ok,
    httpStatus: res.status,
    request: { subjectType: input.subjectType, subjectId: input.subjectId ?? null, action: input.action, assetIds: ids },
    response: text,
  });

  if (!res.ok) return { ok: false, error: errorFrom(text, res.status), status: res.status, ...trail };
  return { ok: true, status: res.status, data: { granted: ids.length }, ...trail };
}

// ---------------------------------------------------------------------------------------------
// reading the trail back
// ---------------------------------------------------------------------------------------------

export interface WriteLogRow {
  at: string;
  action: string;
  robloxCreatorId: string;
  creatorType: string;
  target: string | null;
  ok: boolean;
  httpStatus: number | null;
  request: unknown;
}

/**
 * What Apple has done to this person's Roblox account, for this person.
 *
 * Keyed on userId like every other query in the credential path: there is deliberately no "read any
 * customer's trail" helper, for the same reason there is no "get any credential" one.
 */
export async function listWrites(env: Pick<CreatorEnv, 'CORPUS'>, userId: string, limit = 50): Promise<WriteLogRow[]> {
  await ensureWriteTable(env);
  const capped = Math.max(1, Math.min(Number.isFinite(limit) ? Number(limit) : 50, 200));
  const res = await env.CORPUS.prepare(
    `select at, action, roblox_creator_id, creator_type, target, ok, http_status, request
     from creator_write_log where user_id = ? order by id desc limit ?`,
  ).bind(userId, capped).all<Record<string, unknown>>();
  return (res.results ?? []).map((r) => {
    let request: unknown = null;
    try { request = JSON.parse(String(r.request ?? 'null')); } catch { request = null; }
    return {
      at: String(r.at),
      action: String(r.action),
      robloxCreatorId: String(r.roblox_creator_id),
      creatorType: String(r.creator_type),
      target: (r.target as string | null) ?? null,
      ok: Number(r.ok) === 1,
      httpStatus: r.http_status === null || r.http_status === undefined ? null : Number(r.http_status),
      request,
    };
  });
}
