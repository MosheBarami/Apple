// The curated asset library: what Golem is *allowed* to reference, and where every byte of it
// came from.
//
// The insight that makes this free (docs/research/asset-strategy.md §D0): Golem stores Roblox
// asset IDs and metadata, never asset bytes. Roblox already hosts and CDN-serves the geometry.
// A row is ~1.5 KB, so a 400-asset library is ~1.5 MB of D1 — R2 is not needed and its absence
// is not a blocker.
//
// Two design rules follow, and both are enforced here:
//   1. The library is keyed on **Mesh and Image/Decal** asset IDs. Images, Decals and Meshes are
//      created Open Use by default, so one upload under Golem's account is usable by every
//      customer's experience by id. **Models are not** — see assets.ts ACCEPTABLE_ASSET_TYPES.
//   2. Golem never re-hosts asset bytes. If it cannot be referenced by a Roblox asset id, it does
//      not go in the library.
//
// The licence fields are recorded **verbatim** and never inferred, so a future dispute is answered
// with "here is the exact string we read, on this page, on this date" rather than "we thought it
// was CC0".
//
// D1 limits respected here (verified 2026-08-31, https://developers.cloudflare.com/d1/platform/limits/):
//   max database size 10 GB paid / 500 MB free · max row 2 MB · max SQL statement 100 KB ·
//   **max 100 bound parameters per query** (so batch inserts are chunked) · max 100 columns per
//   table · max query duration 30 s. D1 is single-threaded per database, so the library is
//   read-mostly: bulk-ingest offline, serve reads through indexed lookups, never write on the
//   hot path.
import type { Env } from './env';
import type { AssetKind } from './assets';
import { ASSET_KINDS } from './assets';
import { embed } from './gateway';

// ---------------------------------------------------------------------------------------------
// Provenance record
// ---------------------------------------------------------------------------------------------

/** Where the geometry or texture actually originated. */
export const ASSET_SOURCE_SITES = [
  'kenney',
  'quaternius',
  'ambientcg',
  'poly_pizza',
  'opengameart',
  'roblox_official',
  'creator_store',
  'generated_roblox',
  'generated_meshy',
  'procedural',
] as const;
export type AssetSourceSite = (typeof ASSET_SOURCE_SITES)[number];

/**
 * The authoritative record for one library asset. Every field is required — a nullable field is
 * explicitly `| null` and its null meaning is documented, so "we do not know" is never confused
 * with "we did not fill it in".
 */
export interface AssetProvenance {
  /** Stable, human-readable, namespaced: `kenney/city-kit-suburban/building-a-01`. */
  id: string;
  /** Display name as printed by the source. */
  name: string;
  kind: AssetKind;
  source: AssetSourceSite;
  /** The exact page the asset was obtained from. */
  sourceUrl: string;
  /** Licence name **verbatim as printed on the source page**. Never normalised, never inferred. */
  licence: string;
  /** The page the licence string above was read from. */
  licenceUrl: string;
  commercialUse: boolean;
  attributionRequired: boolean;
  author: string;
  /** ISO 8601 date-time, when the licence string and the file were observed. */
  retrievedAt: string;
  /** null until the asset has been imported into Studio and an Open Use id exists. */
  robloxAssetId: number | null;
  /** null when not yet measured (pre-ingest) or not applicable (an Image). */
  triangles: number | null;
  /** Square texture edge in pixels. null when untextured or not yet measured. Roblox caps at 1024. */
  textureResolution: number | null;
  /** [x, y, z] at scale 1. null when not yet measured. */
  boundsStuds: [number, number, number] | null;
  /** Lowercase slugs used for FTS and for style-coherence filtering. Never empty. */
  tags: string[];
  /** SHA-256 of the source file, lowercase hex. null only before the binary has been fetched. */
  sha256: string | null;
}

/** Operational state D1 tracks alongside the record. Not part of the provenance itself. */
export type AssetStatus = 'pending_ingest' | 'active' | 'quarantined' | 'retired';

// ---------------------------------------------------------------------------------------------
// Licences
// ---------------------------------------------------------------------------------------------

export interface LicenceRule {
  commercialUse: boolean;
  attributionRequired: boolean;
  shareAlike: boolean;
  /** Whether an asset under this licence may enter the library at all. */
  allowedInLibrary: boolean;
  why: string;
}

/**
 * Canonical licence rules, keyed by SPDX-ish id. `licence` on a record stays verbatim; this table
 * is reached through normaliseLicence() so a record can be validated without losing the original
 * wording.
 *
 * v1 policy is **CC0 only**. CC-BY is legally usable but attribution has to survive into whatever
 * Golem builds, which is a product feature nobody has built yet; it is allowed in the table but
 * flagged. CC-BY-SA and GPL are excluded outright — share-alike and source-distribution
 * obligations cannot be discharged coherently inside a Roblox place.
 */
export const LICENCES: Readonly<Record<string, LicenceRule>> = {
  'CC0-1.0': { commercialUse: true, attributionRequired: false, shareAlike: false, allowedInLibrary: true, why: 'public domain dedication' },
  'CC-BY-4.0': {
    commercialUse: true,
    attributionRequired: true,
    shareAlike: false,
    allowedInLibrary: true,
    why: 'usable commercially, but the credit line must be emitted into every generated place',
  },
  'CC-BY-3.0': { commercialUse: true, attributionRequired: true, shareAlike: false, allowedInLibrary: true, why: 'as CC-BY-4.0' },
  'CC-BY-SA-4.0': {
    commercialUse: true,
    attributionRequired: true,
    shareAlike: true,
    allowedInLibrary: false,
    why: 'share-alike cannot be discharged inside a Roblox place — a customer would inherit an obligation they never agreed to',
  },
  'GPL-3.0': { commercialUse: true, attributionRequired: true, shareAlike: true, allowedInLibrary: false, why: 'source-distribution obligation is undischargeable here' },
  'ROBLOX-TOU': {
    commercialUse: true,
    attributionRequired: false,
    shareAlike: false,
    allowedInLibrary: true,
    why: 'Roblox-authored asset used under the Roblox Terms of Use',
  },
  'ROBLOX-GENERATED': {
    commercialUse: true,
    attributionRequired: false,
    shareAlike: false,
    allowedInLibrary: true,
    why: 'produced by GenerationService in the user’s own Studio session and persisted to their own account',
  },
  'MESHY-PREMIUM': {
    commercialUse: true,
    attributionRequired: false,
    shareAlike: false,
    allowedInLibrary: true,
    why: 'owner-owned output of a paid Meshy plan. BUILD-TIME ONLY — see docs/ASSET-PIPELINE.md',
  },
  'NONE-PROCEDURAL': { commercialUse: true, attributionRequired: false, shareAlike: false, allowedInLibrary: true, why: 'no third-party material involved' },
};

/**
 * Map a verbatim licence string to a canonical id, or null when unrecognised.
 *
 * Deliberately conservative: an unrecognised string fails validation rather than being guessed at.
 * The verbatim forms below are the exact wordings observed on the source sites.
 */
export function normaliseLicence(verbatim: string): string | null {
  const t = verbatim.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return null;
  // share-alike and copyleft are checked FIRST so 'CC BY-SA' cannot be matched as 'CC BY'
  if (/\bsa\b|share[- ]?alike/.test(t) && /\bcc\b|creative commons/.test(t)) return 'CC-BY-SA-4.0';
  if (/\bgpl\b|general public license/.test(t)) return 'GPL-3.0';
  if (/\bcc0\b|creative commons zero|public domain dedication/.test(t)) return 'CC0-1.0';
  if (/\bcc[- ]?by\b|creative commons attribution/.test(t)) return /3\.0/.test(t) ? 'CC-BY-3.0' : 'CC-BY-4.0';
  if (/roblox terms of use|roblox-tou/.test(t)) return 'ROBLOX-TOU';
  if (/roblox-generated|generationservice/.test(t)) return 'ROBLOX-GENERATED';
  if (/meshy/.test(t)) return 'MESHY-PREMIUM';
  if (/none-procedural|no third[- ]party/.test(t)) return 'NONE-PROCEDURAL';
  return null;
}

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** Canonical licence id, when it could be resolved. */
  licenceId: string | null;
}

const ID_RE = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)+$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2}))?$/;
const SHA_RE = /^[0-9a-f]{64}$/;
const TAG_RE = /^[a-z0-9][a-z0-9-]*$/;
/** Roblox's own guidance: textures up to 1024x1024, and the closer to that, the higher the cost. */
const MAX_TEXTURE_PX = 1024;
/** Roblox minimum part dimension. A bounds value below this is a measurement error. */
const MIN_STUD = 0.05;

export interface ValidateOptions {
  /**
   * A seed record has not been fetched or imported yet, so robloxAssetId / sha256 / triangles /
   * bounds are legitimately null. Outside seed mode those nulls are only allowed while
   * robloxAssetId is also null.
   */
  seed?: boolean;
  /** v1 policy: refuse anything requiring attribution. */
  cc0Only?: boolean;
}

/**
 * Validate one provenance record. Pure — no I/O — so it can gate an ingest script, a worker
 * request and a test identically.
 */
export function validateProvenance(rec: unknown, opts: ValidateOptions = {}): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const r = (typeof rec === 'object' && rec !== null ? rec : {}) as Partial<AssetProvenance>;

  if (typeof r.id !== 'string' || !ID_RE.test(r.id)) {
    errors.push('id must be a namespaced lowercase slug like "kenney/city-kit-suburban/building-a-01"');
  }
  if (typeof r.name !== 'string' || !r.name.trim()) errors.push('name is required');
  if (typeof r.kind !== 'string' || !(ASSET_KINDS as readonly string[]).includes(r.kind)) {
    errors.push(`kind must be one of ${ASSET_KINDS.join(', ')}`);
  }
  if (typeof r.source !== 'string' || !(ASSET_SOURCE_SITES as readonly string[]).includes(r.source)) {
    errors.push(`source must be one of ${ASSET_SOURCE_SITES.join(', ')}`);
  }
  for (const field of ['sourceUrl', 'licenceUrl'] as const) {
    const v = r[field];
    if (typeof v !== 'string' || !/^https:\/\/[^\s]+$/.test(v)) errors.push(`${field} must be an https URL`);
  }
  if (typeof r.author !== 'string' || !r.author.trim()) errors.push('author is required — "unknown" is not acceptable provenance');

  // Licence: verbatim string, resolved through the registry, cross-checked against the booleans.
  let licenceId: string | null = null;
  if (typeof r.licence !== 'string' || !r.licence.trim()) {
    errors.push('licence is required and must be the string read verbatim off the source page');
  } else {
    licenceId = normaliseLicence(r.licence);
    if (!licenceId) {
      errors.push(`licence "${r.licence}" is not a recognised licence — add it to LICENCES deliberately rather than guessing`);
    } else {
      const rule = LICENCES[licenceId];
      if (!rule) {
        errors.push(`licence id ${licenceId} has no rule`);
      } else {
        if (!rule.allowedInLibrary) errors.push(`licence ${licenceId} is excluded from the library: ${rule.why}`);
        if (r.commercialUse !== rule.commercialUse) {
          errors.push(`commercialUse is ${String(r.commercialUse)} but ${licenceId} says ${String(rule.commercialUse)}`);
        }
        if (r.attributionRequired !== rule.attributionRequired) {
          errors.push(`attributionRequired is ${String(r.attributionRequired)} but ${licenceId} says ${String(rule.attributionRequired)}`);
        }
        if (rule.commercialUse !== true) errors.push(`licence ${licenceId} does not permit commercial use`);
        if (opts.cc0Only && licenceId !== 'CC0-1.0' && licenceId !== 'NONE-PROCEDURAL' && licenceId !== 'ROBLOX-GENERATED') {
          errors.push(`v1 policy is CC0 only; ${licenceId} requires attribution plumbing that does not exist yet`);
        }
        if (rule.attributionRequired) {
          warnings.push(`${licenceId} requires attribution — a credit line must be emitted into every place that uses this asset`);
        }
      }
    }
  }

  if (typeof r.retrievedAt !== 'string' || !ISO_RE.test(r.retrievedAt) || Number.isNaN(Date.parse(r.retrievedAt))) {
    errors.push('retrievedAt must be an ISO 8601 date or date-time string');
  }

  const hasRobloxId = typeof r.robloxAssetId === 'number';
  if (r.robloxAssetId !== null && (!hasRobloxId || !Number.isInteger(r.robloxAssetId) || (r.robloxAssetId as number) <= 0)) {
    errors.push('robloxAssetId must be a positive integer or null');
  }

  for (const field of ['triangles', 'textureResolution'] as const) {
    const v = r[field];
    if (v === null || v === undefined) continue;
    if (!Number.isInteger(v) || v < 0) errors.push(`${field} must be a non-negative integer or null`);
  }
  if (typeof r.textureResolution === 'number' && r.textureResolution > MAX_TEXTURE_PX) {
    errors.push(`textureResolution ${r.textureResolution} exceeds Roblox's ${MAX_TEXTURE_PX}px guidance`);
  }

  if (r.boundsStuds !== null && r.boundsStuds !== undefined) {
    const b = r.boundsStuds;
    if (!Array.isArray(b) || b.length !== 3 || b.some((n) => typeof n !== 'number' || !Number.isFinite(n) || n < MIN_STUD)) {
      errors.push(`boundsStuds must be null or three finite numbers >= ${MIN_STUD} studs`);
    }
  }

  if (!Array.isArray(r.tags) || r.tags.length === 0) errors.push('tags must be a non-empty array — retrieval and style coherence both depend on it');
  else if (r.tags.some((t) => typeof t !== 'string' || !TAG_RE.test(t))) errors.push('every tag must be a lowercase slug');

  if (r.sha256 !== null && r.sha256 !== undefined && (typeof r.sha256 !== 'string' || !SHA_RE.test(r.sha256))) {
    errors.push('sha256 must be 64 lowercase hex characters or null');
  }

  // The invariant that keeps the library honest: anything live in Roblox must be hashed, measured
  // and dimensioned. Nulls are only acceptable while the asset has not been imported yet.
  if (hasRobloxId && !opts.seed) {
    if (r.sha256 === null || r.sha256 === undefined) errors.push('sha256 is required once robloxAssetId is set — we must know what we uploaded');
    if (r.triangles === null || r.triangles === undefined) warnings.push('triangles is unmeasured, so this asset cannot be budgeted against a scene');
    if (r.boundsStuds === null || r.boundsStuds === undefined) warnings.push('boundsStuds is unmeasured, so this asset cannot be scale-checked');
  }
  if (!hasRobloxId && !opts.seed) {
    warnings.push('robloxAssetId is null — this record is not yet insertable, it is an ingest candidate');
  }

  return { ok: errors.length === 0, errors, warnings, licenceId };
}

/** Embedding + FTS input. Derived, never stored, so it cannot drift from the record. */
export function assetEmbeddingInput(rec: AssetProvenance): string {
  return `${rec.kind}: ${rec.name}. Style: ${rec.tags.join(', ')}. Source: ${rec.source} by ${rec.author}.`;
}

// ---------------------------------------------------------------------------------------------
// D1 schema
// ---------------------------------------------------------------------------------------------

/**
 * Create the library tables if they do not exist.
 *
 * Style note (matching static.ts): D1's `exec()` splits on newlines, so each statement must be a
 * single line. That is why these are long.
 *
 * The columns are the AssetProvenance record verbatim, plus operational state (status, health) and
 * timestamps that are not part of the provenance itself.
 */
export async function ensureAssetTables(env: Pick<Env, 'CORPUS'>): Promise<void> {
  await env.CORPUS.exec(
    `create table if not exists asset_library(id text primary key, name text not null, kind text not null, source text not null, source_url text not null, licence text not null, licence_url text not null, commercial_use integer not null, attribution_required integer not null, author text not null, retrieved_at text not null, roblox_asset_id integer, triangles integer, texture_resolution integer, bounds_studs text, tags text not null, sha256 text, status text not null default 'pending_ingest', health_ok integer not null default 1, last_health_check text, created_at text not null, updated_at text not null)`,
  );
  // A Roblox asset id may appear at most once. Partial index so many pending rows can share NULL.
  await env.CORPUS.exec(`create unique index if not exists idx_asset_roblox_id on asset_library(roblox_asset_id) where roblox_asset_id is not null`);
  await env.CORPUS.exec(`create index if not exists idx_asset_kind on asset_library(kind, status)`);
  await env.CORPUS.exec(`create index if not exists idx_asset_licence on asset_library(licence, status)`);
  await env.CORPUS.exec(`create index if not exists idx_asset_health on asset_library(status, last_health_check)`);
  // Standalone FTS5 table, mirroring the chunks_fts pattern already used by the docs corpus.
  await env.CORPUS.exec(`create virtual table if not exists asset_library_fts using fts5(asset_id unindexed, name, tags, kind, author)`);
  // Append-only audit log. Never updated, never deleted: this is what makes "never guess asset IDs"
  // provable after the fact rather than merely asserted.
  await env.CORPUS.exec(
    `create table if not exists asset_verification_log(id integer primary key autoincrement, roblox_asset_id integer not null, checked_at text not null, check_source text not null, provenance text not null, http_status integer, resolved_name text, resolved_type_id integer, resolved_creator_id integer, resolved_has_scripts integer, resolved_is_free integer, resolved_triangles integer, verdict text not null, reasons text, raw_response text, requested_by text)`,
  );
  await env.CORPUS.exec(`create index if not exists idx_verif_asset on asset_verification_log(roblox_asset_id, checked_at desc)`);
}

// ---------------------------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------------------------

const COLUMNS = [
  'id',
  'name',
  'kind',
  'source',
  'source_url',
  'licence',
  'licence_url',
  'commercial_use',
  'attribution_required',
  'author',
  'retrieved_at',
  'roblox_asset_id',
  'triangles',
  'texture_resolution',
  'bounds_studs',
  'tags',
  'sha256',
  'status',
  'created_at',
  'updated_at',
] as const;

/**
 * D1 allows at most 100 bound parameters per query, so a multi-row insert is chunked by
 * floor(100 / columns) rows. With 20 columns that is 5 rows per statement.
 */
export const MAX_BOUND_PARAMS = 100;
export function rowsPerStatement(columnCount: number = COLUMNS.length): number {
  return Math.max(1, Math.floor(MAX_BOUND_PARAMS / columnCount));
}

function bindValues(rec: AssetProvenance, status: AssetStatus, now: string): unknown[] {
  return [
    rec.id,
    rec.name,
    rec.kind,
    rec.source,
    rec.sourceUrl,
    rec.licence,
    rec.licenceUrl,
    rec.commercialUse ? 1 : 0,
    rec.attributionRequired ? 1 : 0,
    rec.author,
    rec.retrievedAt,
    rec.robloxAssetId,
    rec.triangles,
    rec.textureResolution,
    rec.boundsStuds ? JSON.stringify(rec.boundsStuds) : null,
    JSON.stringify(rec.tags),
    rec.sha256,
    status,
    now,
    now,
  ];
}

export interface UpsertResult {
  written: number;
  rejected: { id: string; errors: string[] }[];
}

/**
 * Validate and write records. Invalid records are rejected individually rather than failing the
 * batch, because a partially-good ingest is more useful than none — and because the rejects are
 * the interesting output.
 */
export async function upsertAssets(env: Pick<Env, 'CORPUS'>, records: AssetProvenance[], opts: ValidateOptions & { status?: AssetStatus } = {}): Promise<UpsertResult> {
  const now = new Date().toISOString();
  const good: AssetProvenance[] = [];
  const rejected: { id: string; errors: string[] }[] = [];
  for (const rec of records) {
    const v = validateProvenance(rec, opts);
    if (v.ok) good.push(rec);
    else rejected.push({ id: typeof rec?.id === 'string' ? rec.id : '(no id)', errors: v.errors });
  }
  const status: AssetStatus = opts.status ?? (opts.seed ? 'pending_ingest' : 'active');
  const per = rowsPerStatement();
  const cols = COLUMNS.join(', ');
  const updates = COLUMNS.filter((c) => c !== 'id' && c !== 'created_at')
    .map((c) => `${c}=excluded.${c}`)
    .join(', ');

  let written = 0;
  for (let i = 0; i < good.length; i += per) {
    const slice = good.slice(i, i + per);
    const placeholders = slice.map(() => `(${COLUMNS.map(() => '?').join(',')})`).join(',');
    const binds = slice.flatMap((r) => bindValues(r, status, now));
    await env.CORPUS.prepare(`insert into asset_library(${cols}) values ${placeholders} on conflict(id) do update set ${updates}`)
      .bind(...binds)
      .run();
    // FTS5 mirror: delete-then-insert, because a standalone fts5 table has no upsert.
    for (const r of slice) {
      await env.CORPUS.prepare(`delete from asset_library_fts where asset_id = ?`).bind(r.id).run();
      await env.CORPUS.prepare(`insert into asset_library_fts(asset_id, name, tags, kind, author) values(?,?,?,?,?)`)
        .bind(r.id, r.name, r.tags.join(' '), r.kind, r.author)
        .run();
    }
    written += slice.length;
  }
  return { written, rejected };
}

/** One append-only audit row per verification, pass or fail. */
export async function recordVerification(
  env: Pick<Env, 'CORPUS'>,
  v: {
    assetId: number;
    checkedAt: string;
    verdict: string;
    reasons: string[];
    provenance: string;
    httpStatus: number | null;
    name: string | null;
    assetTypeId: number | null;
    creatorId: number | null;
    hasScripts: boolean;
    isFree: boolean;
    triangles: number | null;
  },
  requestedBy?: string,
  rawResponse?: string,
): Promise<void> {
  await env.CORPUS.prepare(
    `insert into asset_verification_log(roblox_asset_id, checked_at, check_source, provenance, http_status, resolved_name, resolved_type_id, resolved_creator_id, resolved_has_scripts, resolved_is_free, resolved_triangles, verdict, reasons, raw_response, requested_by) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      v.assetId,
      v.checkedAt,
      'toolbox_v1_details',
      v.provenance,
      v.httpStatus,
      v.name,
      v.assetTypeId,
      v.creatorId,
      v.hasScripts ? 1 : 0,
      v.isFree ? 1 : 0,
      v.triangles,
      v.verdict,
      JSON.stringify(v.reasons).slice(0, 4000),
      // D1's row cap is 2 MB; 8 KB keeps the log cheap while still being evidence.
      rawResponse ? rawResponse.slice(0, 8192) : null,
      requestedBy ?? null,
    )
    .run();
}

// ---------------------------------------------------------------------------------------------
// Semantic search
// ---------------------------------------------------------------------------------------------

export interface AssetHit {
  id: string;
  name: string;
  kind: AssetKind;
  robloxAssetId: number | null;
  triangles: number | null;
  boundsStuds: [number, number, number] | null;
  tags: string[];
  licence: string;
  attributionRequired: boolean;
  score: number;
}

export interface AssetSearchOptions {
  kind?: AssetKind;
  /** Remaining scene triangle budget; heavier assets are dropped. */
  maxTriangles?: number;
  /** The project's declared style. Retrieval strongly prefers assets sharing these tags. */
  styleTags?: string[];
  /** Only return rows that actually have a Roblox id (i.e. are insertable today). */
  insertableOnly?: boolean;
  k?: number;
}

/** Vector ids are namespaced so the asset vectors can share the docs index until VEC_ASSETS exists. */
export const ASSET_VECTOR_PREFIX = 'asset:';

type LibraryEnv = Env & { VEC_ASSETS?: VectorizeIndex };

interface Row {
  id: string;
  name: string;
  kind: string;
  roblox_asset_id: number | null;
  triangles: number | null;
  bounds_studs: string | null;
  tags: string;
  licence: string;
  attribution_required: number;
}

function toHit(r: Row, score: number): AssetHit {
  let bounds: [number, number, number] | null = null;
  try {
    const parsed = r.bounds_studs ? (JSON.parse(r.bounds_studs) as unknown) : null;
    if (Array.isArray(parsed) && parsed.length === 3) bounds = parsed as [number, number, number];
  } catch {
    bounds = null;
  }
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(r.tags) as unknown;
    if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === 'string');
  } catch {
    tags = [];
  }
  return {
    id: r.id,
    name: r.name,
    kind: r.kind as AssetKind,
    robloxAssetId: r.roblox_asset_id,
    triangles: r.triangles,
    boundsStuds: bounds,
    tags,
    licence: r.licence,
    attributionRequired: r.attribution_required === 1,
    score,
  };
}

const SELECT_COLS = `id, name, kind, roblox_asset_id, triangles, bounds_studs, tags, licence, attribution_required`;

/**
 * Hybrid retrieval over the library: Vectorize (semantic) + D1 FTS5 (keyword), merged with
 * reciprocal rank fusion — the same shape as searchDocs() in rag.ts, deliberately, so there is one
 * retrieval pattern in the product rather than two.
 *
 * The extra step on top of RRF is a deterministic rerank on **style coherence**. A Kenney house
 * standing next to a photoreal rock looks worse than two grey boxes, so tag agreement with the
 * project's declared style outweighs a slightly better semantic match.
 */
export async function searchAssetLibrary(env: LibraryEnv, query: string, opts: AssetSearchOptions = {}): Promise<AssetHit[]> {
  const k = opts.k ?? 8;
  const [vecHits, ftsHits] = await Promise.all([
    vecSearch(env, query, 16, opts).catch(() => [] as AssetHit[]),
    ftsSearch(env, query, 16, opts).catch(() => [] as AssetHit[]),
  ]);

  const rrf = new Map<string, { hit: AssetHit; score: number }>();
  const add = (list: AssetHit[], weight: number) => {
    list.forEach((h, i) => {
      const prev = rrf.get(h.id);
      const s = weight / (60 + i);
      if (prev) prev.score += s;
      else rrf.set(h.id, { hit: h, score: s });
    });
  };
  add(vecHits, 1);
  add(ftsHits, 1);

  return [...rrf.values()]
    .map(({ hit, score }) => ({ ...hit, score: score * rerankMultiplier(hit, opts) }))
    .filter((h) => keep(h, opts))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/**
 * Deterministic rerank. Multiplicative so it reorders within the fused set rather than inventing
 * relevance the retrievers never found.
 */
export function rerankMultiplier(hit: AssetHit, opts: AssetSearchOptions): number {
  let m = 1;
  if (opts.kind && hit.kind === opts.kind) m *= 1.6;
  if (opts.styleTags?.length) {
    const want = new Set(opts.styleTags);
    const shared = hit.tags.filter((t) => want.has(t)).length;
    // Style coherence dominates: a full-style match roughly doubles, a mismatch is halved.
    m *= shared > 0 ? 1 + Math.min(1, shared / want.size) : 0.5;
  }
  if (opts.maxTriangles !== undefined && hit.triangles !== null) {
    m *= hit.triangles <= opts.maxTriangles * 0.5 ? 1.1 : 1;
  }
  if (hit.attributionRequired) m *= 0.9; // usable, but it costs a credit line
  return m;
}

function keep(hit: AssetHit, opts: AssetSearchOptions): boolean {
  if (opts.kind && hit.kind !== opts.kind) return false;
  if (opts.insertableOnly && hit.robloxAssetId === null) return false;
  if (opts.maxTriangles !== undefined && hit.triangles !== null && hit.triangles > opts.maxTriangles) return false;
  return true;
}

async function vecSearch(env: LibraryEnv, query: string, k: number, opts: AssetSearchOptions): Promise<AssetHit[]> {
  const [vector] = await embed(env, [query], 'embed-assets');
  if (!vector) return [];
  const index = env.VEC_ASSETS ?? env.VEC;
  const filter: Record<string, unknown> = { ns: 'asset', status: 'active' };
  if (opts.kind) filter.kind = opts.kind;
  const res = await index.query(vector, { topK: k, returnMetadata: 'all', filter: filter as never });
  const ids = res.matches.map((m) => m.id.replace(ASSET_VECTOR_PREFIX, '')).filter((id) => id.length > 0);
  if (!ids.length) return [];
  const rows = await selectByIds(env, ids);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return res.matches
    .map((m) => {
      const r = byId.get(m.id.replace(ASSET_VECTOR_PREFIX, ''));
      return r ? toHit(r, m.score) : null;
    })
    .filter((h): h is AssetHit => h !== null);
}

/**
 * D1 allows 100 bound parameters per query, so an id list longer than that is fetched in pages.
 */
async function selectByIds(env: Pick<Env, 'CORPUS'>, ids: string[]): Promise<Row[]> {
  const out: Row[] = [];
  for (let i = 0; i < ids.length; i += MAX_BOUND_PARAMS) {
    const page = ids.slice(i, i + MAX_BOUND_PARAMS);
    const placeholders = page.map(() => '?').join(',');
    const rows = await env.CORPUS.prepare(`select ${SELECT_COLS} from asset_library where id in (${placeholders}) and status = 'active'`)
      .bind(...page)
      .all<Row>();
    out.push(...rows.results);
  }
  return out;
}

async function ftsSearch(env: Pick<Env, 'CORPUS'>, query: string, k: number, opts: AssetSearchOptions): Promise<AssetHit[]> {
  // sanitize into an fts5 OR query of bare terms, exactly as rag.ts does
  const terms = query
    .replace(/[^\w.:\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .slice(0, 8);
  if (!terms.length) return [];
  const match = terms.map((t) => `"${t.replaceAll('"', '')}"`).join(' OR ');
  const where = opts.kind ? `and l.kind = ?` : '';
  const binds: unknown[] = opts.kind ? [match, opts.kind, k] : [match, k];
  const rows = await env.CORPUS.prepare(
    `select ${SELECT_COLS.split(', ')
      .map((c) => `l.${c}`)
      .join(', ')}, bm25(asset_library_fts) as rank from asset_library_fts join asset_library l on l.id = asset_library_fts.asset_id where asset_library_fts match ? and l.status = 'active' ${where} order by rank limit ?`,
  )
    .bind(...binds)
    .all<Row & { rank: number }>();
  return rows.results.map((r) => toHit(r, -r.rank));
}

/** Rows whose Roblox id has not been re-checked recently. Feeds the nightly health-check cron. */
export async function staleAssets(env: Pick<Env, 'CORPUS'>, olderThanDays = 7, limit = 100): Promise<{ id: string; robloxAssetId: number }[]> {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000).toISOString();
  const rows = await env.CORPUS.prepare(
    `select id, roblox_asset_id from asset_library where status = 'active' and roblox_asset_id is not null and (last_health_check is null or last_health_check < ?) limit ?`,
  )
    .bind(cutoff, limit)
    .all<{ id: string; roblox_asset_id: number }>();
  return rows.results.map((r) => ({ id: r.id, robloxAssetId: r.roblox_asset_id }));
}

export async function markHealth(env: Pick<Env, 'CORPUS'>, id: string, ok: boolean): Promise<void> {
  await env.CORPUS.prepare(`update asset_library set health_ok = ?, status = ?, last_health_check = ?, updated_at = ? where id = ?`)
    .bind(ok ? 1 : 0, ok ? 'active' : 'quarantined', new Date().toISOString(), new Date().toISOString(), id)
    .run();
}

// ---------------------------------------------------------------------------------------------
// Seed manifest
// ---------------------------------------------------------------------------------------------

/**
 * Ingest candidates, not library rows.
 *
 * These record **metadata and URLs only** — no binaries have been downloaded, so `sha256`,
 * `triangles`, `textureResolution`, `boundsStuds` and `robloxAssetId` are all null and every row
 * lands with status `pending_ingest`. The ingest step fills them in.
 *
 * The licence strings below are the wordings the sources publish. Research verified three of them
 * by reading a live page:
 *   - kenney.nl/assets/city-kit-suburban  -> "License: Creative Commons CC0"
 *   - quaternius.com/packs/ultimatemodularwomen.html -> "License: CC0"
 *   - ambientcg.com -> "All assets are released under the Creative Commons CC0 license, making
 *     them free to use without attribution - even in commercial circumstances."
 *
 * **The ingest step MUST re-read the licence off the page at fetch time and overwrite `licence`
 * and `licenceUrl` with what it actually saw.** Licences change and sites get redesigned; a
 * remembered value is not provenance.
 */
export const SEED_MANIFEST_NOTE =
  'Pre-ingest candidates. No binaries downloaded. The ingest step must re-read each licence string live and overwrite licence/licenceUrl, then fill sha256, triangles, textureResolution, boundsStuds and robloxAssetId after importing to Studio.';

const KENNEY_CC0 = 'License: Creative Commons CC0';
const QUAT_CC0 = 'License: CC0';
const ACG_CC0 = 'All assets are released under the Creative Commons CC0 license, making them free to use without attribution - even in commercial circumstances.';
const RETRIEVED = '2026-08-30';

function seed(
  id: string,
  name: string,
  kind: AssetKind,
  source: AssetSourceSite,
  sourceUrl: string,
  licence: string,
  licenceUrl: string,
  author: string,
  tags: string[],
): AssetProvenance {
  return {
    id,
    name,
    kind,
    source,
    sourceUrl,
    licence,
    licenceUrl,
    commercialUse: true,
    attributionRequired: false,
    author,
    retrievedAt: RETRIEVED,
    robloxAssetId: null,
    triangles: null,
    textureResolution: null,
    boundsStuds: null,
    tags,
    sha256: null,
  };
}

/**
 * A deliberately small, stylistically coherent starter kit: Kenney + Quaternius low-poly
 * flat-shaded geometry, ambientCG for surfaces. All three are single-author and uniformly CC0,
 * which is why they can sit in one scene without looking like a collage.
 */
export const SEED_MANIFEST: AssetProvenance[] = [
  // --- Kenney: buildings, props, icons, prototype surfaces -------------------------------------
  seed('kenney/city-kit-suburban/pack', 'City Kit (Suburban)', 'building', 'kenney', 'https://kenney.nl/assets/city-kit-suburban', KENNEY_CC0, 'https://kenney.nl/assets/city-kit-suburban', 'Kenney', ['lowpoly', 'flat-shaded', 'modular', 'suburban', 'building']),
  seed('kenney/city-kit-commercial/pack', 'City Kit (Commercial)', 'building', 'kenney', 'https://kenney.nl/assets/city-kit-commercial', KENNEY_CC0, 'https://kenney.nl/assets/city-kit-commercial', 'Kenney', ['lowpoly', 'flat-shaded', 'modular', 'commercial', 'building']),
  seed('kenney/castle-kit/pack', 'Castle Kit', 'building', 'kenney', 'https://kenney.nl/assets/castle-kit', KENNEY_CC0, 'https://kenney.nl/assets/castle-kit', 'Kenney', ['lowpoly', 'flat-shaded', 'modular', 'medieval', 'building']),
  seed('kenney/nature-kit/pack', 'Nature Kit', 'foliage', 'kenney', 'https://kenney.nl/assets/nature-kit', KENNEY_CC0, 'https://kenney.nl/assets/nature-kit', 'Kenney', ['lowpoly', 'flat-shaded', 'tree', 'rock', 'foliage']),
  seed('kenney/survival-kit/pack', 'Survival Kit', 'prop', 'kenney', 'https://kenney.nl/assets/survival-kit', KENNEY_CC0, 'https://kenney.nl/assets/survival-kit', 'Kenney', ['lowpoly', 'flat-shaded', 'crate', 'barrel', 'prop']),
  seed('kenney/car-kit/pack', 'Car Kit', 'vehicle', 'kenney', 'https://kenney.nl/assets/car-kit', KENNEY_CC0, 'https://kenney.nl/assets/car-kit', 'Kenney', ['lowpoly', 'flat-shaded', 'car', 'vehicle']),
  seed('kenney/game-icons/pack', 'Game Icons', 'ui_icon', 'kenney', 'https://kenney.nl/assets/game-icons', KENNEY_CC0, 'https://kenney.nl/assets/game-icons', 'Kenney', ['icon', 'ui', 'flat', 'monochrome']),
  seed('kenney/ui-pack/pack', 'UI Pack', 'ui_icon', 'kenney', 'https://kenney.nl/assets/ui-pack', KENNEY_CC0, 'https://kenney.nl/assets/ui-pack', 'Kenney', ['icon', 'ui', 'button', 'panel']),
  seed('kenney/prototype-textures/pack', 'Prototype Textures', 'texture', 'kenney', 'https://kenney.nl/assets/prototype-textures', KENNEY_CC0, 'https://kenney.nl/assets/prototype-textures', 'Kenney', ['texture', 'prototype', 'grid', 'greybox']),
  seed('kenney/particle-pack/pack', 'Particle Pack', 'particle', 'kenney', 'https://kenney.nl/assets/particle-pack', KENNEY_CC0, 'https://kenney.nl/assets/particle-pack', 'Kenney', ['particle', 'sprite', 'smoke', 'spark']),

  // --- Quaternius: characters and organics ------------------------------------------------------
  seed('quaternius/ultimate-modular-women/pack', 'Ultimate Modular Women', 'character', 'quaternius', 'https://quaternius.com/packs/ultimatemodularwomen.html', QUAT_CC0, 'https://quaternius.com/packs/ultimatemodularwomen.html', 'Quaternius', ['lowpoly', 'flat-shaded', 'character', 'rigged', 'modular']),
  seed('quaternius/ultimate-modular-men/pack', 'Ultimate Modular Men', 'character', 'quaternius', 'https://quaternius.com/packs/ultimatemodularmen.html', QUAT_CC0, 'https://quaternius.com/packs/ultimatemodularmen.html', 'Quaternius', ['lowpoly', 'flat-shaded', 'character', 'rigged', 'modular']),
  seed('quaternius/stylized-nature/pack', 'Stylized Nature MegaKit', 'foliage', 'quaternius', 'https://quaternius.com/packs/stylizednaturemegakit.html', QUAT_CC0, 'https://quaternius.com/packs/stylizednaturemegakit.html', 'Quaternius', ['lowpoly', 'flat-shaded', 'tree', 'bush', 'foliage']),
  seed('quaternius/ultimate-nature/pack', 'Ultimate Nature Pack', 'foliage', 'quaternius', 'https://quaternius.com/packs/ultimatenature.html', QUAT_CC0, 'https://quaternius.com/packs/ultimatenature.html', 'Quaternius', ['lowpoly', 'flat-shaded', 'tree', 'rock', 'foliage']),
  seed('quaternius/ultimate-cars/pack', 'Ultimate Cars Pack', 'vehicle', 'quaternius', 'https://quaternius.com/packs/ultimatecars.html', QUAT_CC0, 'https://quaternius.com/packs/ultimatecars.html', 'Quaternius', ['lowpoly', 'flat-shaded', 'car', 'vehicle']),

  // --- ambientCG: PBR surfaces for MaterialVariant / SurfaceAppearance ---------------------------
  seed('ambientcg/ground037', 'Ground037 PBR', 'texture', 'ambientcg', 'https://ambientcg.com/view?id=Ground037', ACG_CC0, 'https://ambientcg.com/license', 'ambientCG', ['texture', 'pbr', 'ground', 'dirt']),
  seed('ambientcg/grass004', 'Grass004 PBR', 'ground', 'ambientcg', 'https://ambientcg.com/view?id=Grass004', ACG_CC0, 'https://ambientcg.com/license', 'ambientCG', ['texture', 'pbr', 'grass', 'ground']),
  seed('ambientcg/bricks075a', 'Bricks075A PBR', 'texture', 'ambientcg', 'https://ambientcg.com/view?id=Bricks075A', ACG_CC0, 'https://ambientcg.com/license', 'ambientCG', ['texture', 'pbr', 'brick', 'wall']),
  seed('ambientcg/wood066', 'Wood066 PBR', 'texture', 'ambientcg', 'https://ambientcg.com/view?id=Wood066', ACG_CC0, 'https://ambientcg.com/license', 'ambientCG', ['texture', 'pbr', 'wood', 'plank']),
  seed('ambientcg/paving-stones070', 'PavingStones070 PBR', 'ground', 'ambientcg', 'https://ambientcg.com/view?id=PavingStones070', ACG_CC0, 'https://ambientcg.com/license', 'ambientCG', ['texture', 'pbr', 'cobblestone', 'ground']),
];
