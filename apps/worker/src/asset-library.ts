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
import { oncePerIsolate, resetSchemaOnce } from './schema-once';

// ---------------------------------------------------------------------------------------------
// Provenance record
// ---------------------------------------------------------------------------------------------

/** Where the geometry or texture actually originated. */
export const ASSET_SOURCE_SITES = [
  'kenney',
  'quaternius',
  'ambientcg',
  'poly_haven',
  'poly_pizza',
  'opengameart',
  'sketchfab',
  // Added after a 15-source survey that verified each one by fetching it. Every one of these is a
  // community or institution that already assembled the collection — none of it is authored here,
  // which is the owner's standing rule for this library.
  'iconify',
  'game_icons',
  'wikimedia',
  'cgbookcase',
  'roblox_official',
  'creator_store',
  'generated_roblox',
  'procedural',
] as const;
export type AssetSourceSite = (typeof ASSET_SOURCE_SITES)[number];

/**
 * Who owns the thing. Manifest §42 turns on this distinction and nothing else: third-party
 * material may be *used* under its licence but must never be presented as Golem's own work.
 *
 * `user_generated` is deliberately its own class rather than being folded into either side —
 * GenerationService output is produced in the customer's own Studio session under their own
 * account, so it is neither Golem's to claim nor a third party's to be credited.
 */
export const ASSET_ORIGINALITIES = ['golem_original', 'user_generated', 'third_party'] as const;
export type AssetOriginality = (typeof ASSET_ORIGINALITIES)[number];

/**
 * Exhaustive by construction: `Record<AssetSourceSite, …>` means adding a source site to the list
 * above fails the typecheck until someone decides, in writing, whose work it is. That is the point
 * — an unclassified source would silently default to "ours", which is the exact mistake §42 names.
 */
export const ASSET_ORIGINALITY: Readonly<Record<AssetSourceSite, AssetOriginality>> = {
  kenney: 'third_party',
  quaternius: 'third_party',
  ambientcg: 'third_party',
  poly_haven: 'third_party',
  poly_pizza: 'third_party',
  opengameart: 'third_party',
  sketchfab: 'third_party',
  iconify: 'third_party',
  game_icons: 'third_party',
  wikimedia: 'third_party',
  cgbookcase: 'third_party',
  roblox_official: 'third_party',
  creator_store: 'third_party',
  generated_roblox: 'user_generated',
  procedural: 'golem_original',
};

export function originalityOf(source: AssetSourceSite): AssetOriginality {
  return ASSET_ORIGINALITY[source];
}

/**
 * Sources whose Roblox asset ids WE DID NOT MINT.
 *
 * `robloxAssetId` has meant one thing since this file was written — "we uploaded this, here is the
 * id we got back" — and a whole invariant rests on it: anything live in Roblox must be hashed, so
 * we can always say what bytes we put there.
 *
 * The Creator Store breaks that assumption in the good direction. Those rows are ALREADY Roblox
 * asset ids, published by their own creators, and referencing one costs no upload to anybody's
 * account. We never held the bytes, so there is no hash we could honestly record — and demanding
 * one would refuse the only part of the library that needs no upload at all.
 *
 * So the invariant is scoped rather than dropped: for an id we minted, a missing hash is still an
 * error. For an id somebody else minted, it is not a gap, it is the truth.
 */
export const PRE_EXISTING_ID_SOURCES: readonly AssetSourceSite[] = ['creator_store', 'roblox_official', 'generated_roblox'];

export function mintedByUs(source: AssetSourceSite): boolean {
  return !PRE_EXISTING_ID_SOURCES.includes(source);
}

/**
 * The authoritative record for one library asset. Every field is required — a nullable field is
 * explicitly `| null` and its null meaning is documented, so "we do not know" is never confused
 * with "we did not fill it in".
 */
/**
 * What produced a piece of geometry, when the geometry was generated rather than downloaded or
 * authored.
 *
 * This exists because `source: 'generated_roblox'` on its own is an unprovable claim. It says the
 * asset came out of a generator without saying WHICH generator or from WHAT, which is precisely
 * the information the customer needs in order to answer "where did this come from?" about their
 * own place — and precisely the information that cannot be reconstructed after the fact, because
 * the prompt exists only in the session that ran it.
 *
 * Every field is required and non-empty. A partially-filled generation record is not a weaker
 * record, it is a record that cannot answer the question it exists to answer, so
 * `validateProvenance` refuses it outright rather than warning.
 */
export interface GenerationRecord {
  /** The API that produced it, named exactly: `GenerationService:GenerateModelAsync`. */
  service: string;
  /**
   * The model, as the platform names it in its own documentation — `Roblox Cube 3D`.
   *
   * Recorded as a string rather than an enum on purpose: the engine picks the model version and
   * does not report it, so pinning a closed set here would be inventing precision we do not have.
   */
  model: string;
  /** The prompt, verbatim. Never summarised — a paraphrased prompt does not reproduce the mesh. */
  prompt: string;
  /** ISO 8601, when generation ran. Distinct from `retrievedAt`, which is when the record was made. */
  generatedAt: string;
}

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
  /**
   * ISO 8601, when the asset entered Golem's control as a Roblox asset — distinct from
   * `retrievedAt`, which is when the source page was read. null until imported.
   *
   * Optional in the type only because rows written before this field existed do not carry one;
   * `requireImportDate` promotes the missing-value warning to an error for new ingests.
   */
  importedAt?: string | null;
  /**
   * What Golem changed relative to the file the source published: `['decimated to 900 tris',
   * 'retextured to 512px']`. An empty array means "used exactly as downloaded" — which is itself
   * a claim, so it is recorded rather than assumed.
   *
   * Optional for the same backwards-compatibility reason as `importedAt`; absent reads as empty.
   */
  modifications?: string[];
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
  /**
   * Set if and only if `source` is `generated_roblox`. Required in that case and forbidden in
   * every other — see `validateProvenance`. Optional in the type only so rows written before this
   * field existed still parse.
   */
  generation?: GenerationRecord | null;
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
  // The non-commercial family exists in the registry precisely so it can be *recognised and
  // refused* rather than falling through normaliseLicence() as an unknown string. Sketchfab
  // publishes per-asset licences (manifest §15) and NC is common there, so a record carrying one
  // is an expected input, not a malformed one.
  'CC-BY-NC-4.0': {
    commercialUse: false,
    attributionRequired: true,
    shareAlike: false,
    allowedInLibrary: false,
    why: 'non-commercial: a Roblox experience with any monetisation, or eligible for the engagement payout, is a commercial use',
  },
  'CC-BY-NC-SA-4.0': {
    commercialUse: false,
    attributionRequired: true,
    shareAlike: true,
    allowedInLibrary: false,
    why: 'non-commercial and share-alike — both obligations are undischargeable in a customer place',
  },
  // NoDerivs is here for the same reason the NC family is, and it is the trap of the set: its
  // Sketchfab label is "CC Attribution-NoDerivs", so anything matching on the word *attribution*
  // reads it as plain CC-BY and admits it. It cannot be admitted. Every route an external mesh
  // takes into a Roblox place is a derivative work — decimating to a triangle budget, rescaling to
  // studs, re-baking a 4K texture down to 1024 — so ND forbids the only thing we would ever do
  // with it. Recognised and refused beats unrecognised: an unknown string is a shrug, and this is
  // a decision.
  'CC-BY-ND-4.0': {
    commercialUse: true,
    attributionRequired: true,
    shareAlike: false,
    allowedInLibrary: false,
    why: 'no-derivatives: importing to Roblox means decimating, rescaling and re-baking, which is exactly the derivative work this licence forbids',
  },
  'CC-BY-NC-ND-4.0': {
    commercialUse: false,
    attributionRequired: true,
    shareAlike: false,
    allowedInLibrary: false,
    why: 'non-commercial and no-derivatives — neither obligation survives an import into a customer place',
  },
  // Permissive code-style licences, which is what the icon sets ship under. They require the
  // notice to travel, not the source — dischargeable by a credits list, unlike share-alike.
  'MIT': { commercialUse: true, attributionRequired: true, shareAlike: false, allowedInLibrary: true, why: 'permissive; the notice must travel with the work' },
  'ISC': { commercialUse: true, attributionRequired: true, shareAlike: false, allowedInLibrary: true, why: 'as MIT' },
  'Apache-2.0': { commercialUse: true, attributionRequired: true, shareAlike: false, allowedInLibrary: true, why: 'permissive; notice and NOTICE file must travel' },
  'BSD-3-Clause': { commercialUse: true, attributionRequired: true, shareAlike: false, allowedInLibrary: true, why: 'as MIT, plus a no-endorsement clause' },
  'Unlicense': { commercialUse: true, attributionRequired: false, shareAlike: false, allowedInLibrary: true, why: 'public domain dedication' },
  'OFL-1.1': { commercialUse: true, attributionRequired: true, shareAlike: true, allowedInLibrary: false, why: 'the reserved-font-name and bundling rules cannot be discharged inside a Roblox place' },
  'PD': { commercialUse: true, attributionRequired: false, shareAlike: false, allowedInLibrary: true, why: 'public domain — no rights reserved to discharge' },
  'GPL-2.0': { commercialUse: true, attributionRequired: true, shareAlike: true, allowedInLibrary: false, why: 'as GPL-3.0' },
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
  // Restrictions are checked from most restrictive to least, so a longer id can never be matched
  // by a shorter prefix of itself: 'CC BY-NC-SA' before 'CC BY-NC' before 'CC BY-SA' before 'CC BY'.
  const isCc = /\bcc\b|creative commons/.test(t);
  const nc = /\bnc\b|non[- ]?commercial/.test(t);
  const sa = /\bsa\b|share[- ]?alike/.test(t);
  const nd = /\bnd\b|no[- ]?derivs?\b|no[- ]?derivatives\b/.test(t);
  if (isCc && nc && sa) return 'CC-BY-NC-SA-4.0';
  if (isCc && nc && nd) return 'CC-BY-NC-ND-4.0';
  if (isCc && nc) return 'CC-BY-NC-4.0';
  if (isCc && sa) return 'CC-BY-SA-4.0';
  // BEFORE the plain-attribution branch below, and the ordering is the whole safety property:
  // "CC Attribution-NoDerivs" satisfies that branch's wording too, and reaching it first would
  // return an ALLOWED id for a licence that forbids every use this library puts an asset to.
  if (isCc && nd) return 'CC-BY-ND-4.0';
  if (/\bgpl\b|general public license/.test(t)) return /\b2(\.0)?\b/.test(t) ? 'GPL-2.0' : 'GPL-3.0';
  // Checked BEFORE the CC family: "MIT License" contains no CC marker, but ordering these together
  // keeps the whole permissive block in one place and makes the precedence readable.
  if (/\bmit\b/.test(t)) return 'MIT';
  if (/\bisc\b/.test(t)) return 'ISC';
  if (/apache/.test(t)) return 'Apache-2.0';
  if (/bsd[- ]?3|bsd 3-clause/.test(t)) return 'BSD-3-Clause';
  if (/\bunlicense\b/.test(t)) return 'Unlicense';
  if (/open font license|\bofl\b|sil open font/.test(t)) return 'OFL-1.1';
  if (/\bcc0\b|creative commons zero|public domain dedication/.test(t)) return 'CC0-1.0';
  // Plain "Public domain" is NOT CC0. Both permit everything, but they are different statements —
  // CC0 is a deliberate waiver by a rights-holder, PD is the absence of rights — and Wikimedia
  // prints them as different strings on different files. Recording them as one would lose that.
  if (/^pd$|public domain/.test(t)) return 'PD';
  // `cc attribution` is Sketchfab's own wording for plain CC-BY — it writes neither "CC BY" nor
  // "Creative Commons Attribution", so without this alternative every CC-BY model it publishes
  // came back null and was refused as an unrecognised string.
  if (/\bcc[- ]?by\b|creative commons attribution|\bcc attribution\b/.test(t)) return /3\.0/.test(t) ? 'CC-BY-3.0' : 'CC-BY-4.0';
  if (/roblox terms of use|roblox-tou/.test(t)) return 'ROBLOX-TOU';
  if (/roblox-generated|generationservice/.test(t)) return 'ROBLOX-GENERATED';
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
  /**
   * Manifest §16 requires an import date on every non-original external asset. It is a warning by
   * default rather than an error so rows written before the field existed still validate; new
   * ingests should pass this and get the hard gate.
   */
  requireImportDate?: boolean;
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
        // The policy is NOT "the string must say CC0". It is "this licence must not oblige us to
        // emit a credit line, because nothing emits one yet". Those are different rules, and the
        // literal list was the first one wearing the second one's name: ROBLOX-TOU has
        // attributionRequired false — using a free Creator Store asset owes nobody a credit — and
        // it was refused anyway, which would have excluded the 100,000 assets that need no upload.
        if (opts.cc0Only && rule.attributionRequired) {
          errors.push(`this ingest was asked for licences owing no credit line; ${licenceId} requires one`);
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
  if (r.importedAt !== null && r.importedAt !== undefined) {
    if (typeof r.importedAt !== 'string' || !ISO_RE.test(r.importedAt) || Number.isNaN(Date.parse(r.importedAt))) {
      errors.push('importedAt must be an ISO 8601 date or date-time string, or null when not yet imported');
    }
  }
  if (r.modifications !== undefined) {
    if (!Array.isArray(r.modifications) || r.modifications.some((m) => typeof m !== 'string' || !m.trim())) {
      errors.push('modifications must be an array of non-empty descriptions — omit it or use [] for "used exactly as downloaded"');
    }
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

  // Generation: required for a generation, forbidden for anything else.
  //
  // Both directions are errors rather than warnings, and they guard opposite mistakes.
  //
  //   Missing — an asset whose `source` says it was generated but which cannot name the model or
  //   the prompt. That record does not read as "the generation was not recorded"; it reads as an
  //   ordinary asset of the customer's own, and the credits file it as such. A failure to record
  //   the generation must not render as a recorded generation.
  //
  //   Present but not a generation — a downloaded third-party asset carrying generation metadata
  //   would be laundered out of the third-party column and into the customer's own, which is the
  //   §42 mistake run backwards. Somebody else's work is not made yours by claiming a model made
  //   it.
  const isGenerated = r.source === 'generated_roblox';
  const gen = r.generation;
  if (gen === null || gen === undefined) {
    if (isGenerated) {
      errors.push(
        'generation is required for a generated_roblox asset — a mesh that cannot name the model and prompt that produced it has no provenance, only a claim',
      );
    }
  } else if (!isGenerated) {
    errors.push(`generation is set but source is "${String(r.source)}" — only a generated_roblox asset may carry generation metadata`);
  } else if (typeof gen !== 'object' || Array.isArray(gen)) {
    errors.push('generation must be an object with service, model, prompt and generatedAt');
  } else {
    const g = gen as Partial<GenerationRecord>;
    for (const field of ['service', 'model', 'prompt'] as const) {
      if (typeof g[field] !== 'string' || !g[field]!.trim()) {
        errors.push(`generation.${field} is required and must be non-empty — an unnamed ${field} cannot be audited`);
      }
    }
    if (typeof g.generatedAt !== 'string' || !ISO_RE.test(g.generatedAt) || Number.isNaN(Date.parse(g.generatedAt))) {
      errors.push('generation.generatedAt must be an ISO 8601 date-time');
    }
  }

  // The invariant that keeps the library honest: anything live in Roblox must be hashed, measured
  // and dimensioned. Nulls are only acceptable while the asset has not been imported yet.
  const weMintedTheId =
    typeof r.source === 'string' && (ASSET_SOURCE_SITES as readonly string[]).includes(r.source)
      ? mintedByUs(r.source as AssetSourceSite)
      : true;
  if (hasRobloxId && !opts.seed) {
    // Scoped to ids WE minted — see PRE_EXISTING_ID_SOURCES. A Creator Store row's id belongs to
    // its own creator and we never held the bytes, so there is no hash we could honestly record.
    if (weMintedTheId && (r.sha256 === null || r.sha256 === undefined)) {
      errors.push('sha256 is required once robloxAssetId is set — we must know what we uploaded');
    }
    if (r.triangles === null || r.triangles === undefined) warnings.push('triangles is unmeasured, so this asset cannot be budgeted against a scene');
    if (r.boundsStuds === null || r.boundsStuds === undefined) warnings.push('boundsStuds is unmeasured, so this asset cannot be scale-checked');
    // §16: an imported third-party asset without an import date cannot answer "when did we take
    // this, and under which version of that page's licence?" — which is the question provenance
    // exists to answer.
    if (!r.importedAt && typeof r.source === 'string' && ASSET_ORIGINALITY[r.source as AssetSourceSite] === 'third_party') {
      const msg = 'importedAt is unrecorded for a third-party asset that is already live in Roblox (manifest §16)';
      if (opts.requireImportDate) errors.push(msg);
      else warnings.push(msg);
    }
  }
  if (!hasRobloxId && !opts.seed) {
    warnings.push('robloxAssetId is null — this record is not yet insertable, it is an ingest candidate');
  }

  return { ok: errors.length === 0, errors, warnings, licenceId };
}

/** Product origin, matching apps/plugin/src/init.server.luau's DEFAULT_API. */
const GOLEM_ORIGIN = 'https://golem.moshe-barami111.workers.dev';

/**
 * Build the provenance record for something Golem authored itself — procedural geometry written
 * as Luau, with no third-party material anywhere in it.
 *
 * This exists so "original" is a *constructed* state rather than an omission. §42's failure mode
 * is a third-party asset drifting into the library with no source recorded and being treated as
 * Golem's own by default; a record that claims originality has to be built by this function, which
 * can only produce `source: 'procedural'`.
 */
export function originalAsset(args: { id: string; name: string; kind: AssetKind; tags: string[]; createdAt: string; robloxAssetId?: number | null; sha256?: string | null }): AssetProvenance {
  return {
    id: args.id,
    name: args.name,
    kind: args.kind,
    source: 'procedural',
    // There is no source page for work nobody else published. Both URL fields carry the product
    // origin — the thing that authored it — rather than a fabricated listing path that would 404
    // the first time someone tried to check the provenance.
    sourceUrl: GOLEM_ORIGIN,
    licence: 'NONE-PROCEDURAL',
    licenceUrl: GOLEM_ORIGIN,
    commercialUse: true,
    attributionRequired: false,
    author: 'Apple',
    retrievedAt: args.createdAt,
    importedAt: args.robloxAssetId ? args.createdAt : null,
    modifications: [],
    robloxAssetId: args.robloxAssetId ?? null,
    triangles: null,
    textureResolution: null,
    boundsStuds: null,
    tags: args.tags,
    sha256: args.sha256 ?? null,
  };
}

/** The service that generates geometry in the customer's own Studio session, named exactly. */
export const ROBLOX_GENERATION_SERVICE = 'GenerationService:GenerateModelAsync';
/**
 * The model behind that service, as Roblox names it in its own documentation: GenerationService is
 * described there as using "Roblox's Cube 3D foundation model".
 *
 * NOTE this is Roblox serving Cube as a first-party platform feature under the Roblox Terms of
 * Use. It is NOT the openrail-licensed `Roblox/cube3d-*` weights on Hugging Face, whose licence
 * restricts use to "academic or research purposes only" and which therefore cannot be run by this
 * product at all. See docs/research/3d-asset-pipeline.md §A0.
 */
export const ROBLOX_GENERATION_MODEL = 'Roblox Cube 3D';
const ROBLOX_GENERATION_DOCS = 'https://create.roblox.com/docs/reference/engine/classes/GenerationService';

/**
 * Build the provenance record for geometry generated by Roblox's own generator inside the
 * customer's Studio session.
 *
 * As with `originalAsset`, the point is that this state is CONSTRUCTED rather than asserted: the
 * only way to get `source: 'generated_roblox'` past `validateProvenance` is to come through here
 * or to supply the same fields by hand, and this function will not build a record whose model or
 * prompt is missing. It throws rather than returning an invalid record because the caller is a
 * generation that just succeeded — there is no sensible partial answer, and a silently
 * unattributed mesh is the exact outcome this is here to prevent.
 */
export function generatedAsset(args: {
  id: string;
  name: string;
  kind: AssetKind;
  tags: string[];
  prompt: string;
  /** Defaults to the Roblox generator; passed explicitly when some other generator is wired. */
  service?: string;
  model?: string;
  generatedAt: string;
  robloxAssetId?: number | null;
  sha256?: string | null;
  triangles?: number | null;
  modifications?: string[];
}): AssetProvenance {
  const service = (args.service ?? ROBLOX_GENERATION_SERVICE).trim();
  const model = (args.model ?? ROBLOX_GENERATION_MODEL).trim();
  const prompt = args.prompt?.trim() ?? '';
  if (!service) throw new Error('generatedAsset: service is required — a generation that cannot name its API has no provenance');
  if (!model) throw new Error('generatedAsset: model is required — a generation that cannot name its model has no provenance');
  if (!prompt) throw new Error('generatedAsset: prompt is required — a generation that cannot name its prompt cannot be reproduced or audited');

  return {
    id: args.id,
    name: args.name,
    kind: args.kind,
    source: 'generated_roblox',
    // No source page exists for a mesh that was generated rather than published. Both URLs point
    // at the generator's documentation — the thing that made it — rather than a fabricated listing.
    sourceUrl: ROBLOX_GENERATION_DOCS,
    licence: 'ROBLOX-GENERATED',
    licenceUrl: ROBLOX_GENERATION_DOCS,
    commercialUse: true,
    attributionRequired: false,
    // The customer ran the generator in their own session, on their own account. Naming the
    // service as author rather than Apple is the §42 line: this is not our work to claim.
    author: 'Roblox GenerationService',
    retrievedAt: args.generatedAt,
    importedAt: args.robloxAssetId ? args.generatedAt : null,
    modifications: args.modifications ?? [],
    robloxAssetId: args.robloxAssetId ?? null,
    triangles: args.triangles ?? null,
    textureResolution: null,
    boundsStuds: null,
    tags: args.tags,
    sha256: args.sha256 ?? null,
    generation: { service, model, prompt, generatedAt: args.generatedAt },
  };
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
/**
 * The schema, asserted once per isolate rather than once per ingest batch.
 *
 * THIS IS WHERE THE 510,979-ROW INGEST DIED. Ten DDL statements ran on every request, ten
 * sequential round trips to a single-threaded D1 before a single row was written, and D1 reported
 * on the first of them:
 *
 *   D1_EXEC_ERROR: Error in line 1: create index if not exists idx_asset_kind
 *   on asset_library(kind, status): D1 DB exceeded its CPU time limit and was reset.
 *
 * That index already exists — sqlite_master on the live database says so, and all five are there.
 * The statement did no work; it was merely the first thing to touch a database the previous batch
 * had exhausted. Ten free statements per request is ten more chances to be that messenger, and the
 * whole request 500s having written nothing.
 *
 * `oncePerIsolate` is shared with the other six stores that had the same shape, and it is the one
 * that remembers a RUN rather than a result: a throw is not cached, so a half-built schema cannot
 * become permanent for the isolate's life.
 */
export function ensureAssetTables(env: Pick<Env, 'CORPUS'>): Promise<void> {
  return oncePerIsolate('assets', () => createAssetTables(env));
}

/** Test seam: the record is per-isolate and otherwise unreachable. */
export function resetAssetSchemaCache(): void {
  resetSchemaOnce('assets');
}

async function createAssetTables(env: Pick<Env, 'CORPUS'>): Promise<void> {
  await env.CORPUS.exec(
    `create table if not exists asset_library(id text primary key, name text not null, kind text not null, source text not null, source_url text not null, licence text not null, licence_url text not null, commercial_use integer not null, attribution_required integer not null, author text not null, retrieved_at text not null, imported_at text, modifications text, roblox_asset_id integer, triangles integer, texture_resolution integer, bounds_studs text, tags text not null, sha256 text, generation text, status text not null default 'pending_ingest', health_ok integer not null default 1, last_health_check text, created_at text not null, updated_at text not null)`,
  );
  // Deployed databases predate these two columns, and `create table if not exists` will not add
  // them. D1 has no `add column if not exists`, so the failure is caught: on an already-migrated
  // database it is a duplicate-column error and nothing else, and swallowing it is the whole point.
  for (const col of ['imported_at text', 'modifications text', 'generation text']) {
    try {
      await env.CORPUS.exec(`alter table asset_library add column ${col}`);
    } catch {
      // already present
    }
  }
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

export const COLUMNS = [
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
  'imported_at',
  'modifications',
  'roblox_asset_id',
  'triangles',
  'texture_resolution',
  'bounds_studs',
  'tags',
  'sha256',
  'generation',
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

export function bindValues(rec: AssetProvenance, status: AssetStatus, now: string): unknown[] {
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
    rec.importedAt ?? null,
    JSON.stringify(rec.modifications ?? []),
    rec.robloxAssetId,
    rec.triangles,
    rec.textureResolution,
    rec.boundsStuds ? JSON.stringify(rec.boundsStuds) : null,
    JSON.stringify(rec.tags),
    rec.sha256,
    // JSON text, matching modifications/tags/bounds_studs. null rather than "null" for the
    // overwhelming majority of rows that are not generations, so the column stays queryable as
    // "is this a generation?" without parsing.
    rec.generation ? JSON.stringify(rec.generation) : null,
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
  //[[ THE FTS DELETE WAS A FULL SCAN, ONCE PER ROW.
  //
  //   `asset_library_fts` declares `asset_id unindexed`, which means fts5 stores the column and
  //   does not index it. So `delete from asset_library_fts where asset_id = ?` has nothing to seek
  //   on and scans the mirror — and the loop issued one of those PER ROW. At 7,000 rows in the
  //   table nobody noticed; at 86,000 a 500-row batch was 500 full scans of an 86,000-row FTS
  //   index, the database hit its CPU limit, reset, and the ingest died. That is why it ran fine
  //   for hours and then stopped: the cost is quadratic in the thing the job exists to grow.
  //
  //   Measured on the live remote D1, same rows, same worker:
  //     one delete per row, one batch() per 4 rows   ->  7 rows/sec   (~17 hours for what is left)
  //     ids grouped 100 to a delete, 4 batch() calls ->  measured below in the ingest log
  //
  //   Three changes, and the third only matters because of the first two:
  //
  //     ONE DELETE PER 100 IDS instead of per row. Still a scan, but 5 scans for a 500-row batch
  //     rather than 500. The 100 is D1's bound-parameter ceiling, not a taste.
  //
  //     FTS ROWS INSERTED 20 AT A TIME. Five columns, so 20 rows is the same 100-parameter
  //     ceiling. 25 statements for a batch of 500 instead of 500.
  //
  //     EVERY DELETE BEFORE EVERY INSERT, IN ONE ORDERED LIST. `batch()` runs its statements in
  //     order inside one transaction, so the mirror is cleared and rebuilt with no window in which
  //     a row is missing — which a per-row delete/insert pair could not promise across chunks
  //     anyway. The ordering is not incidental: inserts first would leave every re-ingested row
  //     duplicated in the mirror, and a duplicated FTS row is a search hit that returns twice.
  //
  //   The main-table insert still chunks at `rowsPerStatement()` for the same parameter ceiling,
  //   and it is still an upsert, so re-running the ingest over rows already present is free of
  //   duplicates by construction rather than by the caller remembering. ]]
  const FTS_COLS = 5;
  const idsPerDelete = Math.floor(MAX_BOUND_PARAMS / 1);
  const ftsRowsPerInsert = Math.floor(MAX_BOUND_PARAMS / FTS_COLS);

  /** How many rows go into one round trip. Kept whole so a failure rejects a whole group, not half. */
  const GROUP = 500;

  for (let g = 0; g < good.length; g += GROUP) {
    const group = good.slice(g, g + GROUP);

    const deletes = [];
    for (let i = 0; i < group.length; i += idsPerDelete) {
      const ids = group.slice(i, i + idsPerDelete).map((r) => r.id);
      deletes.push(
        env.CORPUS.prepare(`delete from asset_library_fts where asset_id in (${ids.map(() => '?').join(',')})`).bind(...ids),
      );
    }

    const inserts = [];
    for (let i = 0; i < group.length; i += per) {
      const slice = group.slice(i, i + per);
      const placeholders = slice.map(() => `(${COLUMNS.map(() => '?').join(',')})`).join(',');
      inserts.push(
        env.CORPUS.prepare(`insert into asset_library(${cols}) values ${placeholders} on conflict(id) do update set ${updates}`)
          .bind(...slice.flatMap((r) => bindValues(r, status, now))),
      );
    }
    for (let i = 0; i < group.length; i += ftsRowsPerInsert) {
      const slice = group.slice(i, i + ftsRowsPerInsert);
      inserts.push(
        env.CORPUS.prepare(
          `insert into asset_library_fts(asset_id, name, tags, kind, author) values ${slice.map(() => '(?,?,?,?,?)').join(',')}`,
        ).bind(...slice.flatMap((r) => [r.id, r.name, r.tags.join(' '), r.kind, r.author])),
      );
    }

    //[[ A GROUP THAT D1 REFUSES IS A REJECT, NOT AN EXCEPTION.
    //
    //   This used to `await` the batch bare. One failure anywhere in a 500-row ingest threw out of
    //   `upsertAssets`, out of `ingestAssets`, out of the route — and the caller got an empty
    //   `text/plain` 500. Not a count, not an id, not the D1 message: the rows that HAD been
    //   written in earlier groups of the same call were reported as nothing at all, and the one
    //   sentence that explained the failure only ever existed in `wrangler tail`.
    //
    //   The failure that made this matter is D1's own, and it is transient:
    //   "D1 DB exceeded its CPU time limit and was reset." So the group is retried with backoff —
    //   and if it still will not go, its rows join `rejected` carrying D1's sentence, which is what
    //   `rejected` is for. `written + rejected.length === received` holds either way, so a partial
    //   ingest still cannot pass for a clean one. ]]
    let lastError: unknown = null;
    let stored = false;
    for (let attempt = 0; attempt < 3 && !stored; attempt++) {
      try {
        await env.CORPUS.batch([...deletes, ...inserts]);
        stored = true;
      } catch (e) {
        lastError = e;
        // 250ms, then 1s. D1's reset clears in well under that; a longer wait would only spend the
        // request's own wall clock on a database that is already ready again.
        if (attempt < 2) await new Promise((r) => setTimeout(r, 250 * (attempt + 1) ** 2));
      }
    }
    if (stored) {
      written += group.length;
    } else {
      const message = lastError instanceof Error ? lastError.message : String(lastError);
      for (const r of group) rejected.push({ id: r.id, errors: [`d1 write failed after 3 attempts: ${message}`] });
    }
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
/**
 * Does the curated library exist in THIS deployment?
 *
 * Nothing in the repository calls `ensureAssetTables` or `upsertAssets`, so on every deployment so
 * far the tables have never been created and `search_asset_library` has raised
 * `no such table: asset_library_fts` on every call — while the system prompt told the model to try
 * it FIRST. That is a wasted inference step on every build that reaches for an asset, and a raw SQL
 * string the model could do nothing with.
 *
 * The answer must NOT be produced by creating the tables. An empty library answering "no matches"
 * is a claim about a table nobody has ever filled, and turning a loud failure into a quiet lie is
 * the defect this codebase keeps finding in other systems. So this only READS.
 *
 * Cached per isolate: the answer changes at most once per deployment, and the whole point is to
 * avoid paying for a query on a path that already knows the answer.
 */
let libraryAvailable: boolean | null = null;

export async function assetLibraryAvailable(env: Pick<Env, 'CORPUS'>): Promise<boolean> {
  if (libraryAvailable !== null) return libraryAvailable;
  try {
    const row = await env.CORPUS.prepare(
      `select name from sqlite_master where type='table' and name='asset_library' limit 1`,
    ).first<{ name: string }>();
    libraryAvailable = !!row;
  } catch {
    // A CORPUS binding that cannot be queried is not evidence the library exists.
    libraryAvailable = false;
  }
  return libraryAvailable;
}

/** Test seam: the cache is per-isolate and otherwise unreachable. */
export function resetAssetLibraryAvailability(): void {
  libraryAvailable = null;
}

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
    // Nothing has been downloaded, so nothing has been imported and nothing has been altered.
    importedAt: null,
    modifications: [],
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
  seed('kenney/particle-pack/pack', 'Particle Pack', 'particle', 'kenney', 'https://kenney.nl/assets/particle-pack', KENNEY_CC0, 'https://kenney.nl/assets/particle-pack', 'Kenney', ['particle', 'sprite', 'smoke', 'credit']),

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
