// The vocabulary for saying where one asset came from — and nothing else.
//
// THIS FILE IS WHAT SURVIVED THE ASSET LIBRARY. On 2026-09-20 the owner removed the curated
// catalogue outright: the search tool, the ingest and import pipelines, the upload path into
// Apple's shared Roblox account, and the 511,208-row D1 table behind them. The reason was not a
// bug. Every upload that pipeline could make was an Image or a Decal, Roblox refuses to archive
// either, and so every one of them was permanent in somebody's real account; the catalogue also
// carried rows named after other people's characters under a single blanket licence claim.
//
// But removing the catalogue does not remove the QUESTION it existed to answer. Assets still enter
// a customer's place — generated into their own account by `generate_image`, or inserted by an
// explicit Roblox id — and `provenance.ts` still has to tell that customer what they are using and
// what they owe credit for. That answer needs a shared vocabulary for sources, originality and
// licences, so the vocabulary is here, on its own, with no D1, no Vectorize and no gateway behind
// it.
//
// WHY THE SOURCE LIST STILL NAMES PACKS NOBODY CAN SEARCH ANY MORE. `kenney`, `opengameart`,
// `cgbookcase` and the rest stay in `ASSET_SOURCE_SITES` because rows written while the library
// existed are still in customers' credit reports, and a source string that no longer parses would
// turn a real recorded credit into "unknown". The list is a decoder for history, not an offer.
import type { AssetKind } from './assets';

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
 * record, it is a record that cannot answer the question it exists to answer, so a reader that
 * finds one partially filled must report it as unanswerable rather than as a credit.
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

/**
 * The authoritative record for where one asset came from. Every field is required — a nullable
 * field is explicitly `| null` and its null meaning is documented, so "we do not know" is never
 * confused with "we did not fill it in".
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
  /**
   * Direct file URL for an expanded OpenGameArt row; null/absent for pack rows and other sources.
   * It is stored separately from sourceUrl because the latter is the human-facing licence page,
   * and is validated against the exact OpenGameArt host before any fetch is attempted.
   */
  downloadUrl?: string | null;
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
   * every other. Optional in the type only so rows written before this field existed still parse.
   */
  generation?: GenerationRecord | null;
}


// ---------------------------------------------------------------------------------------------
// Licences
// ---------------------------------------------------------------------------------------------

// The table lives in ./licences and is re-exported here, so a caller that needs a source, an
// originality and a licence rule to answer one question about one asset imports one module.
export { LICENCES, normaliseLicence } from './licences';
export type { LicenceRule } from './licences';
