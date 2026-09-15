// Asset strategy brain: WHERE a piece of a scene should come from, and whether a Creator Store
// asset id is safe to touch.
//
// Six jobs, all of which exist because the naive answer is wrong:
//
//   1. chooseAssetSource() — the decision table from docs/research/asset-strategy.md §E1.
//      The default instinct ("search the toolbox for a tree") is the worst option in almost
//      every row. Procedural geometry wins nearly everywhere; the exceptions are narrow and
//      encoded here rather than left to a model's judgement.
//
//   2. verifyCreatorStoreAsset() — the "never guess asset IDs" gate. A free Roblox model is the
//      classic backdoor-script vector, so an asset carrying ANY script is refused outright, and
//      an id that did not come out of a search response is refused before a request is even made.
//
//   3. scanInsertedHierarchy() — the same question asked again, of the thing that actually landed.
//      The gate above trusts a third party's metadata about a third party's asset; this reads the
//      Luau back out of the customer's place and refuses on what is really there.
//
//   4. scoreAssetStyle() / rankAssetsByStyle() — safe is not the same as right. A photoreal PBR
//      chair passes every security assertion and still ruins a bright simulator, so style is
//      ranked separately and deterministically, before anything a model would have to judge.
//
//   5. scoreAssetCoherence() / cullPalette() — right is not the same as right TOGETHER. Every
//      asset in the rejected map passed 2, 3 and 4 individually, and the map still "reads too much
//      like multiple unrelated free assets placed into one map". So a fifth gate runs AFTER
//      insertion and scores a candidate against the PALETTE CONTEXT it is joining rather than
//      against absolute rules — and returns a transform (retint, rescale, drop texture) where one
//      would fix it, because "reject" is the expensive answer to a fixable tint.
//
//   6. brokerAsset() — all of the above in the one order that is safe, with an audit trail.
//
// Everything network-facing takes an injectable fetch so the gate is testable off-network, and
// nothing here throws: a verification that crashes is a verification that gets skipped.
//
// Sources: docs/research/asset-strategy.md §D0-D2, §E1-E2; docs/research/3d-asset-pipeline.md
// §A0-A3, §A6.

/**
 * The only environment this module reads. Declared structurally and optionally so it compiles
 * against today's `Env` (which does not yet carry the key) and picks up the real value the moment
 * the binding is added. A missing key is a first-class state, never an error.
 */
export interface AssetEnv {
  /** Open Cloud key with scope `creator-store-product:read`. Free from the creator dashboard. */
  ROBLOX_API_KEY?: string;
}

// ---------------------------------------------------------------------------------------------
// Decision table
// ---------------------------------------------------------------------------------------------

/** The kinds of thing a scene needs. `lighting` is included because it is the highest-value row. */
export const ASSET_NEEDS = [
  'ground',
  'building',
  'prop',
  'foliage',
  'character',
  'vehicle',
  'ui_icon',
  'texture',
  'particle',
  'sfx',
  'lighting',
] as const;
export type AssetNeed = (typeof ASSET_NEEDS)[number];

/** Everything that is storable in the curated library — `lighting` is config, not an asset. */
export const ASSET_KINDS = ASSET_NEEDS.filter((n): n is Exclude<AssetNeed, 'lighting'> => n !== 'lighting');
export type AssetKind = Exclude<AssetNeed, 'lighting'>;

export const ASSET_SOURCES = ['procedural', 'library', 'generation_service', 'creator_store', 'terrain', 'builtin'] as const;
export type AssetSource = (typeof ASSET_SOURCES)[number];

export interface SourceChoice {
  source: AssetSource;
  /** Why this beats the option below it. Written for a model that will read it in a prompt. */
  rationale: string;
  /** The gate that must pass before this source may actually be used. Never empty. */
  verification: string;
}

const V = {
  none: 'none — nothing is fetched and no asset id is involved',
  library:
    'library gate: the row must exist in asset_library with status=active, health_ok=1 and a licence permitting commercial use; the plugin inserts roblox_asset_id and nothing else',
  generated:
    'QC gate: Generation.inspect() must return verdict=pass in Studio, then a human accepts the preview, then the mesh is persisted via AssetService:CreateAssetAsync — GenerateModelAsync output is session-scoped and does not survive save/publish',
  creatorStore:
    'full verifyCreatorStoreAsset() gate: the id must have come from a search response in this session, resolve to a Mesh/Image/Decal (never a Model), carry zero scripts, be free, publicly visible, from a verified or Roblox creator, and fit the triangle budget',
  builtinRig:
    'none — Roblox default rigs and HumanoidDescription are first-party, already moderated, and involve no third-party asset id',
  sfxReference:
    'the id must be free on the Creator Store and is REFERENCED, never inserted: set AudioPlayer.AssetId = "rbxassetid://<id>" (or Sound.SoundId). insert_asset builds geometry and refuses an Audio id by name — an audio asset has nothing to place in the world',
} as const;

/**
 * Ordered source preference for a need, best first.
 *
 * The two facts this table exists to encode:
 *   - **Foliage and characters are the only rows where procedural loses outright.** Parts-and-wedges
 *     trees and humanoids look bad at any part count, so `procedural` is absent from both lists.
 *   - Buildings and characters never reach the Creator Store, because that is where script-bearing
 *     free models live.
 */
const DECISION_TABLE: Record<AssetNeed, readonly SourceChoice[]> = {
  ground: [
    {
      source: 'terrain',
      rationale:
        'Roblox Terrain (FillRegion/FillBall/FillWedge/WriteVoxels) is free, needs no asset, and its smooth voxel surface already looks better than any slab a model will author',
      verification: V.none,
    },
    {
      source: 'builtin',
      rationale: 'large anchored Parts with a correct built-in Enum.Material (Grass, Slate, Ground, Sand) — still zero assets, still free',
      verification: V.none,
    },
    {
      source: 'library',
      rationale: 'ambientCG CC0 PBR set driven into a MaterialVariant or SurfaceAppearance, when a specific surface is called for',
      verification: V.library,
    },
  ],
  building: [
    {
      source: 'procedural',
      rationale:
        'a modular kit on a 5-stud grid with wedge roofs and trim on every edge; architecture is regular and rectilinear, which is exactly what procedural geometry is good at',
      verification: V.none,
    },
    {
      source: 'library',
      rationale: 'a modular kit mesh (Kenney City/Castle) when a whole coherent style is wanted faster than it can be authored',
      verification: V.library,
    },
    {
      source: 'generation_service',
      rationale: 'GenerateModelAsync for ONE hero structure only — a whole town of generated buildings will not share a style',
      verification: V.generated,
    },
  ],
  prop: [
    {
      source: 'library',
      rationale: 'a curated CC0 mesh (Kenney/Quaternius) is instantly style-coherent with the rest of the kit and costs nothing at runtime',
      verification: V.library,
    },
    {
      source: 'procedural',
      rationale:
        'CSG (SubtractAsync/SweepPartAsync) for regular forms — crates, barrels, signs, railings. Budget 8-20 parts for a good prop, 25-60 for a hero prop; three stacked cylinders is the failure signature',
      verification: V.none,
    },
    {
      source: 'generation_service',
      rationale: 'GenerateModelAsync for a genuinely bespoke object the kit does not contain, ~20s and free',
      verification: V.generated,
    },
    {
      source: 'creator_store',
      rationale: 'last resort, and only for a prop no other layer can supply — this is the highest-risk source in the table',
      verification: V.creatorStore,
    },
  ],
  foliage: [
    {
      source: 'library',
      rationale:
        'MANDATORY. Trees, bushes and grass built from parts and wedges look amateur at any part count — organic silhouettes are the one thing procedural geometry cannot fake',
      verification: V.library,
    },
    {
      source: 'generation_service',
      rationale: 'GenerateModelAsync for one signature species, then reuse it — variety comes from scale and rotation, not from more generations',
      verification: V.generated,
    },
    {
      source: 'creator_store',
      rationale: 'restricted to creatorTargetId=1 (Roblox-authored) so the style stays consistent and the creator is trusted by construction',
      verification: V.creatorStore + '; additionally restricted to creatorTargetId=1',
    },
  ],
  character: [
    {
      source: 'builtin',
      rationale:
        'the Roblox default rig plus HumanoidDescription is free, already animated, already moderated, and instantly familiar to players — nothing else in the table starts that far ahead',
      verification: V.builtinRig,
    },
    {
      source: 'library',
      rationale: 'a Quaternius CC0 character mesh, which ships already rigged, when the default avatar is wrong for the world',
      verification: V.library + '; plus confirm the rig is R15-compatible before use',
    },
    {
      source: 'generation_service',
      rationale: 'GenerateModelAsync for STATIC statues and mannequins only — it produces geometry, not a rig, so a generated "character" cannot animate',
      verification: V.generated + '; static use only, never parented to a Humanoid',
    },
  ],
  vehicle: [
    {
      source: 'generation_service',
      rationale:
        'PredefinedSchema="Car5" returns a body plus four wheels as five MeshParts — this schema exists for exactly this need, and the docs ship a retargetable CarBehavior module to drive it',
      verification: V.generated,
    },
    {
      source: 'library',
      rationale: 'a CC0 vehicle mesh plus hand-written constraints, when a specific silhouette is required',
      verification: V.library,
    },
    {
      source: 'procedural',
      rationale: 'a box-car from primitives. Honest last resort: curved bodywork is the second thing procedural geometry cannot fake',
      verification: V.none,
    },
  ],
  ui_icon: [
    {
      source: 'library',
      rationale: 'a CC0 icon sheet (Kenney UI) uploaded once as Image assets — Images are Open Use by default, so one upload serves every customer',
      verification: V.library,
    },
    {
      source: 'procedural',
      rationale: 'Frame + UIStroke + UICorner + UIGradient shapes are resolution-independent, sharp at any scale, and involve no asset at all',
      verification: V.none,
    },
    { source: 'builtin', rationale: 'Roblox built-in UI imagery where one exists for the concept', verification: V.none },
  ],
  texture: [
    {
      source: 'builtin',
      rationale:
        'Enum.Material is already PBR, already streamed, and free. Setting Material correctly on every part is the single cheapest quality win available',
      verification: V.none,
    },
    {
      source: 'library',
      rationale: 'an ambientCG CC0 PBR set as a MaterialVariant or SurfaceAppearance, for a surface no built-in material covers',
      verification: V.library,
    },
  ],
  particle: [
    {
      source: 'procedural',
      rationale: 'ParticleEmitter / Beam / Trail configuration is pure property values — zero assets, and the look lives in the numbers, not the sprite',
      verification: V.none,
    },
    { source: 'library', rationale: 'a CC0 sprite Image asset behind a procedural emitter config, when a specific shape is needed', verification: V.library },
  ],
  // Sound is the one need with no procedural fallback at all — there is no Roblox API that
  // synthesises a gunshot — and no upload path either. Audio is NOT Open Use: a file uploaded under
  // Apple's account stays private to Apple's account and a customer's place gets silence unless
  // Apple grants that universe permission asset by asset
  // (https://create.roblox.com/docs/en-us/audio/assets, read 2026-09-15 — NOT the asset-privacy
  // page, which states that Asset Privacy does not affect Audio at all). So Kenney's ten CC0 audio
  // packs, OpenGameArt's sound_effect split and freesound are all permissively licensed and all
  // unusable. What is left is audio that is ALREADY public on the Creator Store, referenced by id.
  sfx: [
    {
      source: 'library',
      rationale:
        'free Creator Store audio, harvested with its id and licence recorded — already public and moderated, so it is referenced rather than uploaded, and a genre kit can hand over a matched set',
      verification: V.sfxReference,
    },
    {
      source: 'creator_store',
      rationale: 'a live Creator Store audio search when the library has no match for this specific sound',
      verification: V.sfxReference,
    },
  ],
  lighting: [
    {
      source: 'procedural',
      rationale:
        'Atmosphere, Sky, ColorCorrection, Bloom and the six Lighting properties are pure configuration. Highest quality-per-effort row in the whole table — do this first on every scene',
      verification: V.none,
    },
  ],
};

/**
 * Ordered list of sources to try for a need, best first. Never empty; never contains a duplicate
 * source. Returns copies, so a caller cannot mutate the table.
 */
export function chooseAssetSource(need: AssetNeed): SourceChoice[] {
  const row = DECISION_TABLE[need];
  return row.map((c) => ({ ...c }));
}

/** The whole table, for prompt injection and documentation generation. */
export function assetDecisionTable(): Record<AssetNeed, SourceChoice[]> {
  const out = {} as Record<AssetNeed, SourceChoice[]>;
  for (const need of ASSET_NEEDS) out[need] = chooseAssetSource(need);
  return out;
}

// ---------------------------------------------------------------------------------------------
// QC thresholds and scale plausibility
//
// These are the CANONICAL values. apps/plugin/src/Generation.luau mirrors them because it has to
// run offline inside Studio, and packages/evals/src/asset-qc.test.mjs parses the Luau and asserts
// the two agree, so the mirror cannot silently drift.
// ---------------------------------------------------------------------------------------------

/** Every magic number in the QC gate, with the reason it has that value. */
export const QC_THRESHOLDS = {
  /** Observed live against a running Studio: 10 generations per minute. */
  generationRateLimitPerMinute: 10,
  generationRateWindowSeconds: 60,
  /** Measured 20.1s for a 6k-triangle textured prop; ~4.5x headroom before we stop waiting. */
  generationTimeoutSeconds: 90,
  /** The measured figure that produced a good textured prop. */
  defaultMaxTriangles: 6000,
  /** Above this we are paying for detail Roblox will not show at normal viewing distance. */
  softTriangleWarn: 6000,
  /** EditableMesh's documented hard ceiling: 60,000 vertices and 20,000 triangles. */
  hardTriangleCeiling: 20000,
  /** A single "prop" above this is a scene that should have been built, not generated. */
  softPartWarn: 200,
  /** Roblox's minimum part dimension; anything smaller is a degenerate measurement. */
  minStud: 0.05,
  /** Absolute pivot tolerance: below the visible threshold at Roblox's 0.05-stud grid. */
  pivotToleranceStuds: 0.5,
  /** Relative pivot tolerance, so the rule means the same for a 2-stud crate and a 60-stud tree. */
  pivotToleranceFraction: 0.05,
  lateralPivotToleranceFraction: 0.1,
  /** cos(~32 degrees). Past that, a "standing" object reads as fallen rather than leaning. */
  uprightDotMin: 0.85,
  /** Tolerance around the factory default Part colour (163,162,165), in 0-1 channel units. */
  defaultGreyTolerance: 12 / 255,
  /** Fraction of parts left on default plastic before the surface check warns. */
  plasticWarnFraction: 0.7,
} as const;

export interface ScaleEnvelope {
  minHeight: number;
  maxHeight: number;
  maxAnyDim: number;
  /** Height should be the largest dimension. A tree wider than it is tall has fallen over. */
  tallest: boolean;
}

/**
 * Plausible stud dimensions per intent, keyed to the ~5-stud R15 avatar.
 *
 * Derived from worldbuilding.ts PROPORTIONS and widened at both ends, because the job here is to
 * catch the *implausible* (a chair 40 studs tall) rather than the merely unfashionable (a chair
 * 5.5 studs tall).
 */
export const SCALE_ENVELOPES: Readonly<Record<string, ScaleEnvelope>> = {
  chair: { minHeight: 1.5, maxHeight: 7, maxAnyDim: 8, tallest: false },
  stool: { minHeight: 1, maxHeight: 5, maxAnyDim: 5, tallest: false },
  bench: { minHeight: 1.5, maxHeight: 6, maxAnyDim: 16, tallest: false },
  table: { minHeight: 1.5, maxHeight: 6, maxAnyDim: 16, tallest: false },
  counter: { minHeight: 2, maxHeight: 6, maxAnyDim: 24, tallest: false },
  crate: { minHeight: 0.5, maxHeight: 8, maxAnyDim: 10, tallest: false },
  barrel: { minHeight: 1, maxHeight: 8, maxAnyDim: 8, tallest: false },
  door: { minHeight: 6, maxHeight: 14, maxAnyDim: 14, tallest: true },
  window: { minHeight: 2, maxHeight: 12, maxAnyDim: 14, tallest: false },
  lamp: { minHeight: 8, maxHeight: 24, maxAnyDim: 26, tallest: true },
  lantern: { minHeight: 0.8, maxHeight: 6, maxAnyDim: 6, tallest: true },
  column: { minHeight: 5, maxHeight: 45, maxAnyDim: 45, tallest: true },
  statue: { minHeight: 3, maxHeight: 45, maxAnyDim: 45, tallest: true },
  fountain: { minHeight: 2, maxHeight: 24, maxAnyDim: 44, tallest: false },
  sign: { minHeight: 1, maxHeight: 22, maxAnyDim: 24, tallest: false },
  tree: { minHeight: 10, maxHeight: 70, maxAnyDim: 70, tallest: true },
  bush: { minHeight: 0.8, maxHeight: 8, maxAnyDim: 10, tallest: false },
  rock: { minHeight: 0.5, maxHeight: 40, maxAnyDim: 50, tallest: false },
  character: { minHeight: 3.5, maxHeight: 9, maxAnyDim: 9, tallest: true },
  npc: { minHeight: 3.5, maxHeight: 9, maxAnyDim: 9, tallest: true },
  vehicle: { minHeight: 2.5, maxHeight: 14, maxAnyDim: 30, tallest: false },
  car: { minHeight: 2.5, maxHeight: 10, maxAnyDim: 26, tallest: false },
  weapon: { minHeight: 0.5, maxHeight: 10, maxAnyDim: 12, tallest: false },
  sword: { minHeight: 0.5, maxHeight: 10, maxAnyDim: 12, tallest: false },
  building: { minHeight: 10, maxHeight: 250, maxAnyDim: 350, tallest: false },
  house: { minHeight: 10, maxHeight: 80, maxAnyDim: 120, tallest: false },
  prop: { minHeight: 0.3, maxHeight: 16, maxAnyDim: 24, tallest: false },
};

const PROP_ENVELOPE: ScaleEnvelope = SCALE_ENVELOPES.prop ?? { minHeight: 0.3, maxHeight: 16, maxAnyDim: 24, tallest: false };

/**
 * Resolve free text onto an envelope: exact key, then the LONGEST substring match (so "lamp post"
 * picks `lamp` rather than an accidental shorter key), then the generic `prop` envelope.
 */
export function scaleRuleFor(intent: string | undefined): { key: string; rule: ScaleEnvelope } {
  if (typeof intent !== 'string' || !intent.length) return { key: 'prop', rule: PROP_ENVELOPE };
  const text = intent.toLowerCase();
  const exact = SCALE_ENVELOPES[text];
  if (exact) return { key: text, rule: exact };
  let bestKey: string | null = null;
  let best: ScaleEnvelope | null = null;
  for (const [key, rule] of Object.entries(SCALE_ENVELOPES)) {
    if (text.includes(key) && (bestKey === null || key.length > bestKey.length)) {
      bestKey = key;
      best = rule;
    }
  }
  return bestKey && best ? { key: bestKey, rule: best } : { key: 'prop', rule: PROP_ENVELOPE };
}

export interface ScaleCheck {
  ok: boolean;
  ruleKey: string;
  rule: ScaleEnvelope;
  reasons: string[];
  /** Multiply the model by this to land in the middle of the envelope. 1 when already fine. */
  suggestedScale: number;
  /** True when the object's long axis is not vertical but should be — it is lying on its side. */
  lyingDown: boolean;
}

/** Is this bounding box a plausible size for the thing it claims to be? */
export function checkScale(intent: string | undefined, bounds: readonly [number, number, number]): ScaleCheck {
  const { key, rule } = scaleRuleFor(intent);
  const [x, y, z] = bounds;
  const largest = Math.max(x, y, z);
  const reasons: string[] = [];
  if (y < rule.minHeight) reasons.push(`${y} studs tall is under the ${rule.minHeight} minimum for a '${key}'`);
  if (y > rule.maxHeight) reasons.push(`${y} studs tall is over the ${rule.maxHeight} maximum for a '${key}'`);
  if (largest > rule.maxAnyDim) reasons.push(`largest dimension ${largest} exceeds the ${rule.maxAnyDim} limit for a '${key}'`);
  const lyingDown = rule.tallest && y < largest - 0.01;
  if (lyingDown) reasons.push(`a '${key}' should be taller than it is wide, but height ${y} is under the largest dimension ${largest} — it is lying on its side`);
  const target = (rule.minHeight + rule.maxHeight) / 2;
  const suggestedScale = reasons.length && y > 0 ? Math.min(100, Math.max(0.01, target / y)) : 1;
  return { ok: reasons.length === 0, ruleKey: key, rule, reasons, suggestedScale, lyingDown };
}

/** Absolute stud tolerance for how far a pivot may sit from the bounding-box base. */
export function pivotToleranceStuds(height: number): number {
  return Math.max(QC_THRESHOLDS.pivotToleranceStuds, height * QC_THRESHOLDS.pivotToleranceFraction);
}

/** Absolute stud tolerance for how far a pivot may sit off the horizontal centre. */
export function lateralPivotToleranceStuds(x: number, z: number): number {
  return Math.max(QC_THRESHOLDS.pivotToleranceStuds, Math.max(x, z) * QC_THRESHOLDS.lateralPivotToleranceFraction);
}

// ---------------------------------------------------------------------------------------------
// Creator Store verification — "never guess asset IDs"
// ---------------------------------------------------------------------------------------------

/**
 * Hard allowlist of asset types Golem may auto-insert.
 *
 * Images, Decals and **Meshes** are created as Open Use by default, so one upload is usable by
 * every customer's experience by id. **Models are not** — they need the per-place "Allow Loading
 * Third Party Assets" toggle, and they are the container type that can carry scripts. A Model is
 * therefore refused in favour of the Mesh/Image it is wrapping.
 * Source: https://create.roblox.com/docs/en-us/projects/assets/privacy
 */
export const ACCEPTABLE_ASSET_TYPES: Readonly<Record<number, string>> = {
  1: 'Image',
  13: 'Decal',
  40: 'MeshPart',
};

/** Types that resolve but are deliberately refused, with the reason surfaced to the caller. */
export const REFUSED_ASSET_TYPES: Readonly<Record<number, string>> = {
  10: 'Model',
  // Not an oversight and not a licence problem — an SFX row in the library is meant to be
  // REFERENCED. It is named here rather than left to fall through to the generic "not on the
  // allowlist" message so the model is told what to do instead of being told no.
  3: 'Audio',
};

/** Why each refused type is refused, and what to do instead. Refusing without this is just "no". */
export const REFUSAL_REASONS: Readonly<Record<number, string>> = {
  10: 'Models are not Open Use and can contain scripts; use the Mesh (40) or Image (1) inside it instead',
  3: 'audio has no geometry to place. Reference it instead: AudioPlayer.AssetId = "rbxassetid://<id>", or Sound.SoundId on a part',
};

export type AssetVerdictCode =
  | 'pass'
  | 'fail_bad_provenance'
  | 'fail_network'
  | 'fail_not_found'
  | 'fail_has_scripts'
  | 'fail_sandboxed'
  | 'fail_wrong_type'
  | 'fail_not_free'
  | 'fail_moderated'
  | 'fail_unverified_creator'
  | 'fail_low_rating'
  | 'fail_too_many_triangles';

/** Where the caller says this id came from. Anything but a real discovery is refused. */
export type AssetProvenanceSource = 'search_result' | 'library' | 'user_supplied' | 'model_output' | 'unknown';

export interface AssetVerdict {
  assetId: number;
  /** true only when verdict === 'pass'. The one field a call site should branch on. */
  ok: boolean;
  verdict: AssetVerdictCode;
  /** Every assertion that failed, not just the first. Safe to show a user. */
  reasons: string[];
  exists: boolean;
  name: string | null;
  assetTypeId: number | null;
  /** Resolved friendly type, or 'Unknown'. */
  assetType: string;
  creator: { id: number | null; name: string | null; isVerifiedCreator: boolean };
  hasScripts: boolean;
  scriptCount: number;
  shouldSandbox: boolean;
  triangles: number | null;
  vertices: number | null;
  isFree: boolean;
  purchasable: boolean;
  visibilityStatus: number | null;
  /** Ranking inputs, never rejection inputs. See the note in judgeAssetDetails. */
  qualitySignals?: { surfaced: boolean; voteCount: number; upVotePercent: number; unverifiedCreator?: boolean };
  isEndorsed: boolean;
  upVotePercent: number | null;
  voteCount: number | null;
  /** Public, no-auth render of the asset. Metadata lies; renders do not. */
  thumbnailUrl: string;
  checkedAt: string;
  httpStatus: number | null;
}

export interface HttpResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<HttpResponseLike>;

export interface VerifyOptions {
  /** Where the id came from. Defaults to 'unknown', which is REFUSED — callers must be explicit. */
  provenance?: AssetProvenanceSource;
  /** What the caller asked for. When set, a resolved type that is not this is a wrong-type fail. */
  expectType?: 'Image' | 'Decal' | 'MeshPart';
  /** Remaining triangle budget for the scene. When set, a heavier asset is refused. */
  maxTriangles?: number;
  /** Minimum community approval. Skipped entirely for Roblox-authored assets (creator id 1). */
  minUpVotePercent?: number;
  minVoteCount?: number;
  fetchImpl?: FetchLike;
  /** Overridable so tests do not depend on the clock. */
  now?: () => Date;
}

const DETAILS_ENDPOINT = 'https://apis.roblox.com/toolbox-service/v1/items/details';
const SEARCH_V2_ENDPOINT = 'https://apis.roblox.com/toolbox-service/v2/assets:search';
const SEARCH_V1_ENDPOINT = 'https://apis.roblox.com/toolbox-service/v1/marketplace';

export function assetThumbnailUrl(assetId: number, size = '420x420'): string {
  return `https://thumbnails.roblox.com/v1/assets?assetIds=${assetId}&size=${size}&format=Png`;
}

function defaultFetch(): FetchLike {
  return (url, init) => fetch(url, init as RequestInit) as unknown as Promise<HttpResponseLike>;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v.length ? v : null;
}
function obj(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

/** Skeleton verdict so every early return is the same shape. */
function blankVerdict(assetId: number, now: Date): AssetVerdict {
  return {
    assetId,
    ok: false,
    verdict: 'fail_not_found',
    reasons: [],
    exists: false,
    name: null,
    assetTypeId: null,
    assetType: 'Unknown',
    creator: { id: null, name: null, isVerifiedCreator: false },
    hasScripts: false,
    scriptCount: 0,
    shouldSandbox: false,
    triangles: null,
    vertices: null,
    isFree: false,
    purchasable: false,
    visibilityStatus: null,
    isEndorsed: false,
    upVotePercent: null,
    voteCount: null,
    thumbnailUrl: assetThumbnailUrl(assetId),
    checkedAt: now.toISOString(),
    httpStatus: null,
  };
}

/**
 * Turn one `toolbox-service/v1/items/details` entry into a verdict. Pure — no I/O, no clock —
 * so the gate's logic can be driven directly from a fixture.
 *
 * Assertions are evaluated in a fixed order and the FIRST failure names the verdict, but every
 * failure is collected into `reasons`. Order is deliberately security-first: a script-bearing
 * asset reports `fail_has_scripts` even when it is also the wrong type and also not free, because
 * that is the fact a human reading the log needs to see.
 */
export function judgeAssetDetails(assetId: number, entry: unknown, opts: VerifyOptions, now: Date): AssetVerdict {
  const v = blankVerdict(assetId, now);
  const root = obj(entry);
  const asset = obj(root.asset);
  const creator = obj(root.creator);
  const voting = obj(root.voting);
  const fiat = obj(root.fiatProduct);
  const mesh = obj(obj(asset.modelTechnicalDetails).objectMeshSummary);

  v.exists = Object.keys(asset).length > 0 || num(asset.id) !== null;
  v.name = str(asset.name);
  v.assetTypeId = num(asset.typeId);
  v.assetType =
    (v.assetTypeId !== null ? (ACCEPTABLE_ASSET_TYPES[v.assetTypeId] ?? REFUSED_ASSET_TYPES[v.assetTypeId]) : undefined) ?? 'Unknown';
  v.hasScripts = asset.hasScripts === true;
  v.scriptCount = num(asset.scriptCount) ?? 0;
  v.shouldSandbox = obj(asset.capabilities).shouldSandbox === true;
  v.triangles = num(mesh.triangles);
  v.vertices = num(mesh.vertices);
  v.visibilityStatus = num(asset.visibilityStatus);
  v.isEndorsed = asset.isEndorsed === true;
  v.creator = { id: num(creator.id), name: str(creator.name), isVerifiedCreator: creator.isVerifiedCreator === true };
  v.upVotePercent = num(voting.upVotePercent);
  v.voteCount = num(voting.voteCount);
  v.isFree = fiat.isFree === true;
  v.purchasable = fiat.purchasable !== false; // absent means "not sold", which is fine for a free asset

  // Ordered assertions. Each pushes a reason; the first also fixes the verdict code.
  const fails: { code: AssetVerdictCode; reason: string }[] = [];
  const fail = (code: AssetVerdictCode, reason: string) => fails.push({ code, reason });

  if (!v.exists) {
    fail('fail_not_found', `asset ${assetId} did not resolve to anything`);
  } else {
    // 1. Scripts. Non-negotiable, and checked first: this is an untrusted-code injection vector.
    if (v.hasScripts || v.scriptCount > 0) {
      fail('fail_has_scripts', `asset carries ${v.scriptCount || 'one or more'} script(s) — refused outright, scripts are an untrusted-code injection vector`);
    }
    // 2. Sandbox flag: Roblox itself thinks this needs containment.
    if (v.shouldSandbox) fail('fail_sandboxed', 'asset is flagged shouldSandbox by Roblox');
    // 3. Type allowlist. Models are refused in favour of the Mesh/Image they wrap.
    if (v.assetTypeId === null) {
      fail('fail_wrong_type', 'asset type could not be determined');
    } else if (REFUSED_ASSET_TYPES[v.assetTypeId]) {
      // The reason has to be per-type. One message that said "Models are not Open Use and can
      // contain scripts; use the Mesh (40) or Image (1) instead" was correct for a Model and a lie
      // for an Audio id, which is refused for the opposite reason — there is nothing to place.
      fail('fail_wrong_type', `asset is a ${REFUSED_ASSET_TYPES[v.assetTypeId]} (typeId ${v.assetTypeId}) — ${REFUSAL_REASONS[v.assetTypeId] ?? 'not insertable'}`);
    } else if (!ACCEPTABLE_ASSET_TYPES[v.assetTypeId]) {
      fail('fail_wrong_type', `asset typeId ${v.assetTypeId} is not on the allowlist (${Object.values(ACCEPTABLE_ASSET_TYPES).join(', ')})`);
    } else if (opts.expectType && v.assetType !== opts.expectType) {
      fail('fail_wrong_type', `asked for a ${opts.expectType} but the id resolves to a ${v.assetType}`);
    }
    // 4. Free.
    if (!v.isFree) fail('fail_not_free', 'asset is not free (fiatProduct.isFree is not true)');
    else if (!v.purchasable) fail('fail_not_free', 'asset is free but not purchasable — it cannot be acquired');
    /* 5-7 were RECALIBRATED AGAINST MEASUREMENT on 2026-08-31, because together
       they rejected 100% of the live catalogue and the asset pipeline could
       never hand the agent a single insertable id.

       `visibilityStatus` was treated as a moderation flag — "expected 1
       (public)" — and anything else hard-failed as `fail_moderated`. Measured:
       the field genuinely varies across assets returned by the PUBLIC search
       endpoint, and asset 6434088676 (`visibilityStatus: 0`, `hasScripts:
       false`) INSERTED SUCCESSFULLY into a real place, `sandboxed: false`,
       status success. A moderated asset does not do that. So the field is a
       ranking/surfacing signal, not a safety one, and reading it as moderation
       was rejecting the whole usable catalogue on a guess about an undocumented
       field.

       Votes were the same mistake in a different costume: a brand-new free
       low-poly tree with 0 votes is not less SAFE than one with 600, and
       measurement showed plenty of clean free assets sitting at 0.

       What did NOT move, and must not: scripts, sandbox, asset type, free, and
       not-found. Those are safety and licensing. And the real control is
       downstream anyway — `insert_asset` now enumerates the inserted hierarchy,
       reads every script out of the place, scans, strips and RE-LISTS to prove
       it clean. These metadata checks are a cheap pre-filter over a
       third-party's undocumented JSON; they were never the thing keeping Luau
       out of a user's game, and treating them as if they were is what let them
       be calibrated to reject everything without anyone noticing. */
    // 5. Visibility and community signal are QUALITY signals: they rank, they do not reject.
    v.qualitySignals = {
      surfaced: v.visibilityStatus === 1,
      voteCount: v.voteCount ?? 0,
      upVotePercent: v.upVotePercent ?? 0,
    };
    // 6. Trusted creator: Roblox itself, a verified creator, or an endorsed asset.
    const robloxAuthored = v.creator.id === 1;
    if (!robloxAuthored && !v.creator.isVerifiedCreator && !v.isEndorsed) {
      /* Also demoted. Verified-creator status is a Roblox account property, not a
         property of the model's contents, and requiring it excludes most of the
         free stylised catalogue. Recorded so ranking can prefer it. */
      v.qualitySignals.unverifiedCreator = true;
    }
    // 7. Explicit thresholds still apply when a CALLER asks for them, so a
    //    quality-sensitive path can opt back in. They are simply no longer the
    //    default, because the default was "reject everything".
    if (opts.minUpVotePercent !== undefined && !robloxAuthored && (v.upVotePercent ?? 0) < opts.minUpVotePercent) {
      fail('fail_low_rating', `upVotePercent ${v.upVotePercent ?? 0} is below the requested ${opts.minUpVotePercent}`);
    } else if (opts.minVoteCount !== undefined && !robloxAuthored && (v.voteCount ?? 0) < opts.minVoteCount) {
      fail('fail_low_rating', `only ${v.voteCount ?? 0} votes, below the requested ${opts.minVoteCount}`);
    }
    // 8. Triangle budget.
    if (opts.maxTriangles !== undefined && v.triangles !== null && v.triangles > opts.maxTriangles) {
      fail('fail_too_many_triangles', `${v.triangles} triangles exceeds the remaining budget of ${opts.maxTriangles}`);
    }
  }

  v.reasons = fails.map((f) => f.reason);
  v.verdict = fails[0]?.code ?? 'pass';
  v.ok = v.verdict === 'pass';
  return v;
}

/**
 * Resolve an asset id to a structured, auditable verdict.
 *
 * Step 0 is the provenance gate: an id that appears in a model's output text and nowhere else is
 * refused **before** a request is made. Discovery must come from `searchCreatorStore()` or the
 * curated library; an id cannot be conjured.
 *
 * Never throws. Network failure is `fail_network`, which is a refusal like any other.
 *
 * `env` IS UNUSED, on purpose. Verification reads public endpoints and needs no
 * credential; `AssetEnv` carries only `ROBLOX_API_KEY`, which `searchCreatorStore` uses
 * for the documented v2 search. The parameter stays so this function has the same shape
 * as the rest of the asset family — `verifyCreatorStoreAssets` and `searchCreatorStore`
 * both take the env first — and dropping it from one of the three would make the odd one
 * out look like the one that forgot.
 *
 * (`noUnusedParameters` was tried across the repo and found only this. One deliberate
 * hit is not worth a compiler flag that would force a cosmetic rename, so it is off and
 * this comment does the job instead. `noUnusedLocals` found five real ones and is on.)
 */
export async function verifyCreatorStoreAsset(env: AssetEnv, assetId: number, opts: VerifyOptions = {}): Promise<AssetVerdict> {
  const now = (opts.now ?? (() => new Date()))();
  const provenance: AssetProvenanceSource = opts.provenance ?? 'unknown';

  if (!Number.isInteger(assetId) || assetId <= 0) {
    const v = blankVerdict(assetId, now);
    v.verdict = 'fail_not_found';
    v.reasons = [`${assetId} is not a valid asset id`];
    return v;
  }

  if (provenance === 'model_output' || provenance === 'unknown') {
    const v = blankVerdict(assetId, now);
    v.verdict = 'fail_bad_provenance';
    v.reasons = [
      `asset id ${assetId} has provenance '${provenance}' — an id must come from a Creator Store search response or the curated library. An id that only ever appeared in generated text is never inserted.`,
    ];
    return v;
  }

  const doFetch = opts.fetchImpl ?? defaultFetch();
  let res: HttpResponseLike;
  try {
    res = await doFetch(`${DETAILS_ENDPOINT}?assetIds=${assetId}`, { method: 'GET', headers: { accept: 'application/json' } });
  } catch (e) {
    const v = blankVerdict(assetId, now);
    v.verdict = 'fail_network';
    v.reasons = [`could not reach the asset details endpoint: ${e instanceof Error ? e.message : String(e)}`];
    return v;
  }

  if (!res.ok) {
    const v = blankVerdict(assetId, now);
    v.httpStatus = res.status;
    v.verdict = res.status === 404 ? 'fail_not_found' : 'fail_network';
    v.reasons = [`asset details endpoint returned HTTP ${res.status}`];
    return v;
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch (e) {
    const v = blankVerdict(assetId, now);
    v.httpStatus = res.status;
    v.verdict = 'fail_network';
    v.reasons = [`asset details response was not JSON: ${e instanceof Error ? e.message : String(e)}`];
    return v;
  }

  const data = obj(body).data;
  const entry = Array.isArray(data) ? data[0] : undefined;
  if (entry === undefined) {
    const v = blankVerdict(assetId, now);
    v.httpStatus = res.status;
    v.verdict = 'fail_not_found';
    v.reasons = [`asset ${assetId} is not in the details response — it does not exist, or was deleted`];
    return v;
  }

  const verdict = judgeAssetDetails(assetId, entry, opts, now);
  verdict.httpStatus = res.status;
  return verdict;
}

/** Verify several ids, sequentially so the 100 req/min details rate limit is respected. */
export async function verifyCreatorStoreAssets(env: AssetEnv, assetIds: number[], opts: VerifyOptions = {}): Promise<AssetVerdict[]> {
  const out: AssetVerdict[] = [];
  for (const id of assetIds) out.push(await verifyCreatorStoreAsset(env, id, opts));
  return out;
}

// ---------------------------------------------------------------------------------------------
// Creator Store search
// ---------------------------------------------------------------------------------------------

/** toolbox-service typeIds, used by the v1 marketplace path. */
export const TOOLBOX_TYPE_IDS = { Model: 10, Decal: 13, MeshPart: 40 } as const;

export type SearchCategory = 'model' | 'mesh' | 'decal';

export interface CreatorStoreHit {
  assetId: number;
  name: string | null;
  assetTypeId: number | null;
  creatorId: number | null;
  creatorName: string | null;
  /** Never trust this — it is a search-time hint, not a verification. Always run the gate. */
  hintIsFree: boolean | null;
  thumbnailUrl: string;
}

export interface CreatorStoreSearchResult {
  /** Whether ROBLOX_API_KEY was present. false does NOT mean the search failed. */
  configured: boolean;
  endpoint: 'v2' | 'v1' | 'none';
  results: CreatorStoreHit[];
  /** Always populated, always safe to show a user or feed back to a model. */
  note: string;
  error?: string;
}

export interface SearchOptions {
  category?: SearchCategory;
  limit?: number;
  /** Restrict to Roblox-authored assets (creatorTargetId=1&creatorType=1). Highest-trust subset. */
  robloxOnly?: boolean;
  /** v2 only. Set alongside robloxOnly=false to keep third-party results at least verified. */
  onlyVerifiedCreators?: boolean;
  /** v2 only. 0 keeps the result set to genuinely free assets. */
  maxPriceCents?: number;
  fetchImpl?: FetchLike;
}

const CATEGORY_TYPE_ID: Record<SearchCategory, number> = {
  model: TOOLBOX_TYPE_IDS.Model,
  mesh: TOOLBOX_TYPE_IDS.MeshPart,
  decal: TOOLBOX_TYPE_IDS.Decal,
};

const CATEGORY_V2: Record<SearchCategory, string> = {
  model: 'SEARCH_CATEGORY_TYPE_MODEL',
  mesh: 'SEARCH_CATEGORY_TYPE_MESH',
  decal: 'SEARCH_CATEGORY_TYPE_DECAL',
};

function toHit(raw: unknown): CreatorStoreHit | null {
  const r = obj(raw);
  const asset = Object.keys(obj(r.asset)).length ? obj(r.asset) : r;
  const creator = obj(r.creator);
  const fiat = obj(r.fiatProduct);
  const id = num(asset.id) ?? num(asset.assetId) ?? num(r.assetId);
  if (id === null) return null;
  return {
    assetId: id,
    name: str(asset.name),
    assetTypeId: num(asset.typeId) ?? num(asset.assetType),
    creatorId: num(creator.id) ?? num(asset.creatorTargetId),
    creatorName: str(creator.name),
    hintIsFree: typeof fiat.isFree === 'boolean' ? fiat.isFree : null,
    thumbnailUrl: assetThumbnailUrl(id),
  };
}

/**
 * Discover candidate asset ids. This is the ONLY sanctioned way an id enters the system: the
 * verification gate refuses anything whose provenance is not a search response or the library.
 *
 * Uses the documented, key-gated v2 endpoint when `ROBLOX_API_KEY` is set, and falls back to the
 * undocumented-but-working unauthenticated v1 marketplace endpoint otherwise. A missing key is
 * reported clearly in `note` and is never an error.
 *
 * MUST run in the Worker: HttpService in a Studio plugin cannot call apis.roblox.com without an
 * x-api-key header, which a plugin has no safe way to hold.
 */
export async function searchCreatorStore(env: AssetEnv, query: string, opts: SearchOptions = {}): Promise<CreatorStoreSearchResult> {
  const term = query.trim();
  const limit = Math.min(50, Math.max(1, opts.limit ?? 12));
  const category: SearchCategory = opts.category ?? 'mesh';
  const doFetch = opts.fetchImpl ?? defaultFetch();
  const key = env.ROBLOX_API_KEY;

  if (!term) {
    return { configured: !!key, endpoint: 'none', results: [], note: 'no search term was given' };
  }

  if (key) {
    try {
      const body: Record<string, unknown> = {
        searchCategoryType: CATEGORY_V2[category],
        query: term,
        limit,
      };
      if (opts.onlyVerifiedCreators !== false) body.includeOnlyVerifiedCreators = true;
      if (opts.maxPriceCents !== undefined) body.maxPriceCents = opts.maxPriceCents;
      if (opts.robloxOnly) {
        body.creatorTargetId = 1;
        body.creatorType = 1;
      }
      const res = await doFetch(SEARCH_V2_ENDPOINT, {
        method: 'POST',
        headers: { 'x-api-key': key, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const parsed = obj(await res.json());
        const rows = Array.isArray(parsed.data) ? parsed.data : Array.isArray(parsed.assets) ? parsed.assets : [];
        const results = rows.map(toHit).filter((h): h is CreatorStoreHit => h !== null);
        return {
          configured: true,
          endpoint: 'v2',
          results,
          note: `${results.length} candidate(s) from the official Creator Store search. Every id must still pass verifyCreatorStoreAsset() before insertion.`,
        };
      }
      // fall through to v1 on any non-2xx — a bad key should degrade, not break the build
      return await searchV1(doFetch, term, category, limit, opts, true, `official v2 search returned HTTP ${res.status}`);
    } catch (e) {
      return await searchV1(doFetch, term, category, limit, opts, true, `official v2 search failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return await searchV1(
    doFetch,
    term,
    category,
    limit,
    opts,
    false,
    'ROBLOX_API_KEY is not configured, so the documented Creator Store v2 search is unavailable. Falling back to the undocumented unauthenticated marketplace endpoint, which may disappear without notice.',
  );
}

async function searchV1(
  doFetch: FetchLike,
  term: string,
  category: SearchCategory,
  limit: number,
  opts: SearchOptions,
  configured: boolean,
  why: string,
): Promise<CreatorStoreSearchResult> {
  const typeId = CATEGORY_TYPE_ID[category];
  const params = new URLSearchParams({ keyword: term, limit: String(limit) });
  if (opts.robloxOnly) {
    params.set('creatorTargetId', '1');
    params.set('creatorType', '1');
  }
  try {
    const res = await doFetch(`${SEARCH_V1_ENDPOINT}/${typeId}?${params.toString()}`, {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      return { configured, endpoint: 'none', results: [], note: why, error: `fallback marketplace search returned HTTP ${res.status}` };
    }
    const parsed = obj(await res.json());
    const rows = Array.isArray(parsed.data) ? parsed.data : Array.isArray(parsed.results) ? parsed.results : [];
    const results = rows.map(toHit).filter((h): h is CreatorStoreHit => h !== null);
    return {
      configured,
      endpoint: 'v1',
      results,
      note: `${why} ${results.length} candidate(s) from the unauthenticated marketplace endpoint. Every id must still pass verifyCreatorStoreAsset() before insertion.`,
    };
  } catch (e) {
    return {
      configured,
      endpoint: 'none',
      results: [],
      note: why,
      error: `fallback marketplace search failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * Search, then verify, and hand back only ids that actually passed. This is the function a tool
 * should call: it makes it structurally impossible to insert an unverified id, because the
 * provenance is set here and nowhere else.
 */
export async function findVerifiedAssets(
  env: AssetEnv,
  query: string,
  opts: SearchOptions & VerifyOptions & { want?: number } = {},
): Promise<{ search: CreatorStoreSearchResult; passed: AssetVerdict[]; rejected: AssetVerdict[] }> {
  const search = await searchCreatorStore(env, query, opts);
  const want = Math.max(1, opts.want ?? 3);
  const passed: AssetVerdict[] = [];
  const rejected: AssetVerdict[] = [];
  for (const hit of search.results) {
    if (passed.length >= want) break;
    const verdict = await verifyCreatorStoreAsset(env, hit.assetId, { ...opts, provenance: 'search_result' });
    if (verdict.ok) passed.push(verdict);
    else rejected.push(verdict);
  }
  return { search, passed, rejected };
}

// ---------------------------------------------------------------------------------------------
// Script safety scanner — the layer that treats every external model as hostile
//
// `verifyCreatorStoreAsset()` above refuses a script-bearing asset from METADATA. That metadata is
// a third-party claim about a third-party asset: `hasScripts` is whatever the toolbox service says
// it is, on an undocumented endpoint, for an asset whose contents can change after it was
// inspected. So once anything is actually inserted into a customer's place, the hierarchy is read
// back and scanned for real. Metadata decides whether to try; this decides whether to keep.
//
// The policy, stated once so no call site has to re-derive it:
//
//   - A script is never *allowed*. It is removed, or the whole asset is discarded.
//   - Anything ambiguous is a refusal. `require(v)` where `v` cannot be resolved statically is
//     treated as hostile, because the alternative is to guess in the attacker's favour.
//   - A source that could not be read is the worst case, not the empty case.
//
// Everything here is pure and synchronous: it is fed strings a caller has already fetched, so it
// can be driven from a fixture and can never itself reach the network.
// ---------------------------------------------------------------------------------------------

/** The three classes that can hold Luau. A fourth would be a Roblox change, not a config change. */
export const SCRIPT_CLASSES = ['Script', 'LocalScript', 'ModuleScript'] as const;
export type ScriptClass = (typeof SCRIPT_CLASSES)[number];

export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';

const SEVERITY_ORDER: Readonly<Record<RiskSeverity, number>> = { low: 1, medium: 2, high: 3, critical: 4 };

/** Worse of two severities. Used to roll findings up to a script, and scripts up to a hierarchy. */
export function worseSeverity(a: RiskSeverity, b: RiskSeverity): RiskSeverity {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}

export type ScriptRiskCode =
  /** A script exists at all. Emitted for every script, so "clean" always means "no Luau". */
  | 'script_present'
  /** `require(1234567)` — a module pulled off the marketplace at runtime. The classic backdoor. */
  | 'require_asset_id'
  /** `require(x)` where x is not statically resolvable. Ambiguous, therefore refused. */
  | 'require_dynamic'
  | 'http_service'
  | 'url_literal'
  /** loadstring / getfenv / setfenv / debug upvalue access — code that writes code. */
  | 'dynamic_code'
  | 'obfuscation'
  | 'remote_traffic'
  /** Reads or writes ServerScriptService / ServerStorage — where a backdoor installs itself. */
  | 'server_container'
  | 'reparent_self'
  | 'marketplace_prompt'
  /** TeleportService / Player:Kick — takes the player somewhere the place did not choose. */
  | 'player_redirect'
  /** The source could not be read. Worse than an empty script, never better. */
  | 'unreadable';

export interface ScriptFinding {
  code: ScriptRiskCode;
  severity: RiskSeverity;
  /** Written for a human reading an audit log: what was found and why it matters. */
  message: string;
  /** 1-based line, or null for a whole-file signal like an escaped-character ratio. */
  line: number | null;
  /** The offending text: control characters stripped, trimmed, capped. Safe to display. */
  excerpt: string;
}

/** Caps, so a hostile 5 MB single-line script cannot turn the scanner into the denial of service. */
export const SCAN_LIMITS = {
  /** Source past this is not examined; the truncation itself is a critical finding. */
  maxSourceChars: 200_000,
  /** Per script. Beyond this the script is already condemned; more detail buys nothing. */
  maxFindingsPerScript: 12,
  /** Scripts examined in one hierarchy. A model with more than this is refused on count alone. */
  maxScripts: 60,
  excerptChars: 160,
  /** Kept on the record so a human can read what was removed without a second round trip. */
  sourcePreviewChars: 600,
  /** A line longer than this is not source anyone wrote by hand. */
  longLine: 400,
  /** A line longer than THIS is a packed payload, not a long line. */
  packedLine: 2000,
  /** `\xNN`-style escapes covering this fraction of the source is encoding, not text. */
  escapeRatio: 0.15,
  minEscapes: 20,
  /** `..` concatenations on one line. Ten is a chain nobody types deliberately. */
  concatChain: 10,
  base64Run: 160,
  /** Consecutive numeric entries in a table literal — a bytecode array, not data. */
  numericTableRun: 200,
  /** string.char() calls before the source is considered reassembled rather than written. */
  charChain: 5,
} as const;

function excerptOf(text: string): string {
  return text
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, SCAN_LIMITS.excerptChars);
}

interface LineRule {
  code: ScriptRiskCode;
  severity: RiskSeverity;
  pattern: RegExp;
  why: string;
}

/**
 * Per-line detectors. Deliberately over-broad: `:GetAsync(` also matches a DataStore call, and that
 * is fine — a decorative mesh has no business calling either, and an ambiguous hit is a refusal by
 * policy rather than something to disambiguate cleverly.
 */
const LINE_RULES: readonly LineRule[] = [
  {
    code: 'http_service',
    severity: 'critical',
    pattern: /\bHttpService\b|GetService\s*\(\s*["']Http/i,
    why: 'uses HttpService — an inserted decoration has no reason to talk to the internet, and this is how data leaves a place',
  },
  {
    code: 'http_service',
    severity: 'high',
    pattern: /:\s*(?:GetAsync|PostAsync|RequestAsync|UrlEncode)\s*\(|\bHttpGet\b|\bHttpPost\b/,
    why: 'performs a remote request (GetAsync/PostAsync/RequestAsync) — outbound traffic from an asset that should be inert',
  },
  {
    code: 'url_literal',
    severity: 'critical',
    pattern: /discord\.gg|discordapp\.com|\/api\/webhooks\//i,
    why: 'contains a webhook or invite URL — the standard exfiltration endpoint in Roblox backdoors',
  },
  {
    code: 'url_literal',
    severity: 'high',
    pattern: /\bhttps?:\/\/[^\s"'`)]+/i,
    why: 'contains a hard-coded URL',
  },
  {
    code: 'dynamic_code',
    severity: 'critical',
    pattern: /\bloadstring\s*\(|\bgetfenv\s*\(|\bsetfenv\s*\(|\bdebug\s*\.\s*(?:setupvalue|getupvalue|setconstant)\s*\(/,
    why: 'builds and runs code at runtime (loadstring/getfenv/setfenv) — nothing legitimate in a static asset does this',
  },
  {
    code: 'dynamic_code',
    severity: 'high',
    pattern: /(?:^|[^:.\w])load\s*\(/,
    why: 'calls load() — the same code-from-data vector as loadstring',
  },
  {
    code: 'server_container',
    severity: 'critical',
    pattern: /ServerScriptService|ServerStorage/,
    why: 'references ServerScriptService/ServerStorage — an asset reaching for the server script container is installing itself, not decorating',
  },
  {
    code: 'reparent_self',
    severity: 'high',
    pattern: /\bscript\s*\.\s*Parent\s*=|\bscript\s*:\s*Clone\s*\(/,
    why: 'moves or clones itself — a script that relocates survives the deletion of the model it arrived in',
  },
  {
    code: 'remote_traffic',
    severity: 'high',
    pattern:
      /Instance\.new\s*\(\s*["'](?:RemoteEvent|RemoteFunction|BindableFunction)["']|:\s*(?:FireServer|InvokeServer|FireAllClients|FireClient|InvokeClient)\s*\(/,
    why: 'creates or drives a Remote — an unexpected client/server channel inside an inserted asset',
  },
  {
    code: 'marketplace_prompt',
    severity: 'high',
    pattern: /MarketplaceService|Prompt(?:Product|GamePass|ThirdParty|Subscription)?Purchase/,
    why: "prompts a purchase — an inserted asset that can ask the player for money is monetising someone else's place",
  },
  {
    code: 'player_redirect',
    severity: 'high',
    pattern: /TeleportService|:\s*Kick\s*\(/,
    why: 'teleports or kicks players — moves the player somewhere the place did not choose',
  },
];

/**
 * `require(...)` deserves its own pass rather than a row in the table above, because the *argument*
 * is the whole question. `require(script.Parent.Config)` is ordinary; `require(1234567)` is the
 * single most common Roblox backdoor there is; `require(v)` cannot be answered statically at all,
 * and an unanswerable question is a refusal.
 */
function scanRequires(line: string, lineNo: number): ScriptFinding[] {
  const out: ScriptFinding[] = [];
  const re = /\brequire\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    // Naive paren balance from the opening paren, capped — enough to read one call's argument.
    let depth = 1;
    const start = m.index + m[0].length;
    let i = start;
    for (; i < line.length && i - start < 200 && depth > 0; i++) {
      if (line[i] === '(') depth++;
      else if (line[i] === ')') depth--;
    }
    const arg = line.slice(start, depth === 0 ? i - 1 : i).trim();
    if (/^(?:tonumber\s*\(\s*)?["']?\d{3,}/.test(arg)) {
      out.push({
        code: 'require_asset_id',
        severity: 'critical',
        message: `require(${excerptOf(arg)}) loads a module by ASSET ID at runtime — the classic Roblox backdoor. What that id serves can change after this asset was inspected, so nothing about it can be verified.`,
        line: lineNo,
        excerpt: excerptOf(line),
      });
    } else if (/^(?:script|game|workspace|Workspace|self)\b/.test(arg)) {
      // A path-shaped require inside the asset's own tree. Still Luau, still removed by policy —
      // reported through `script_present` rather than duplicated as a separate risk.
    } else if (arg.length === 0) {
      out.push({
        code: 'require_dynamic',
        severity: 'high',
        message: 'require() with an argument that could not be read — treated as hostile because it cannot be resolved.',
        line: lineNo,
        excerpt: excerptOf(line),
      });
    } else {
      out.push({
        code: 'require_dynamic',
        severity: /\.\.|tonumber|getfenv|\[/.test(arg) ? 'critical' : 'high',
        message: `require(${excerptOf(arg)}) cannot be resolved statically. An unresolvable require is refused rather than guessed at — it is how an asset-id require is hidden behind one variable.`,
        line: lineNo,
        excerpt: excerptOf(line),
      });
    }
  }
  return out;
}

/**
 * Whole-source signals. These are shape, not vocabulary: obfuscated Luau does not contain a keyword
 * that says so, but it is reliably one enormous line, or mostly escapes, or a base64 blob, or a
 * numeric table that is really bytecode.
 */
function scanShape(source: string): ScriptFinding[] {
  const out: ScriptFinding[] = [];
  const lines = source.split('\n');

  let longestIdx = 0;
  for (let i = 1; i < lines.length; i++) if ((lines[i] ?? '').length > (lines[longestIdx] ?? '').length) longestIdx = i;
  const longest = lines[longestIdx] ?? '';
  if (longest.length >= SCAN_LIMITS.packedLine) {
    out.push({
      code: 'obfuscation',
      severity: 'critical',
      message: `line ${longestIdx + 1} is ${longest.length} characters — that is a packed payload, not source anyone wrote`,
      line: longestIdx + 1,
      excerpt: excerptOf(longest),
    });
  } else if (longest.length >= SCAN_LIMITS.longLine) {
    out.push({
      code: 'obfuscation',
      severity: 'high',
      message: `line ${longestIdx + 1} is ${longest.length} characters long, well past anything hand-written`,
      line: longestIdx + 1,
      excerpt: excerptOf(longest),
    });
  }

  const escapes = source.match(/\\x[0-9a-fA-F]{2}|\\u\{[0-9a-fA-F]+\}|\\\d{1,3}/g);
  if (escapes && escapes.length >= SCAN_LIMITS.minEscapes) {
    const covered = escapes.join('').length / Math.max(1, source.length);
    if (covered >= SCAN_LIMITS.escapeRatio) {
      out.push({
        code: 'obfuscation',
        severity: 'critical',
        message: `${escapes.length} character escapes cover ${(covered * 100).toFixed(0)}% of the source — the text is encoded, which is done to hide it from exactly this check`,
        line: null,
        excerpt: excerptOf(escapes.slice(0, 24).join('')),
      });
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const concats = ((lines[i] ?? '').match(/\.\./g) ?? []).length;
    if (concats >= SCAN_LIMITS.concatChain) {
      out.push({
        code: 'obfuscation',
        severity: 'high',
        message: `line ${i + 1} chains ${concats} string concatenations — a name assembled at runtime so it cannot be grepped for`,
        line: i + 1,
        excerpt: excerptOf(lines[i] ?? ''),
      });
      break;
    }
  }

  const blob = new RegExp(`[A-Za-z0-9+/]{${SCAN_LIMITS.base64Run},}={0,2}`).exec(source);
  if (blob) {
    out.push({
      code: 'obfuscation',
      severity: 'high',
      message: `contains a ${blob[0].length}-character unbroken alphanumeric blob — base64-shaped data embedded in source`,
      line: null,
      excerpt: excerptOf(blob[0]),
    });
  }

  const numericTable = new RegExp(`\\{\\s*(?:\\d{1,6}\\s*,\\s*){${SCAN_LIMITS.numericTableRun},}`).exec(source);
  if (numericTable) {
    out.push({
      code: 'obfuscation',
      severity: 'critical',
      message: 'contains a table literal of hundreds of consecutive numbers — a bytecode or character array waiting to be turned back into code',
      line: null,
      excerpt: excerptOf(numericTable[0]),
    });
  }

  const charChains = (source.match(/string\s*\.\s*char\s*\(/g) ?? []).length;
  if (charChains >= SCAN_LIMITS.charChain) {
    out.push({
      code: 'obfuscation',
      severity: 'high',
      message: `calls string.char() ${charChains} times — text reassembled from character codes to defeat inspection`,
      line: null,
      excerpt: 'string.char(...)',
    });
  }

  return out;
}

export interface ScannedScript {
  path: string;
  className: string;
  lineCount: number;
  sourceLength: number;
  /** The head of the source, so a human can see what was removed without a second round trip. */
  sourcePreview: string;
  findings: ScriptFinding[];
  /** Worst finding. Never below 'medium': the presence of a script is itself a medium finding. */
  severity: RiskSeverity;
  /** Always 'remove' under today's policy; derived from severity so a change is one constant. */
  action: 'remove' | 'review';
}

/** At and above this, a script is deleted rather than surfaced for a human decision. */
const REMOVE_AT: RiskSeverity = 'medium';

/**
 * Scan one script's source.
 *
 * `source === null` means it could not be read, and that is the WORST case, not the empty one: an
 * asset carrying code nobody can display is more dangerous than one whose code is merely nasty.
 */
export function scanScriptSource(path: string, className: string, source: string | null): ScannedScript {
  const findings: ScriptFinding[] = [];

  if (source === null) {
    findings.push({
      code: 'unreadable',
      severity: 'critical',
      message: 'the source of this script could not be read — an asset carrying code nobody can see is refused outright',
      line: null,
      excerpt: '',
    });
    return { path, className, lineCount: 0, sourceLength: 0, sourcePreview: '', findings, severity: 'critical', action: 'remove' };
  }

  const truncated = source.length > SCAN_LIMITS.maxSourceChars;
  const body = truncated ? source.slice(0, SCAN_LIMITS.maxSourceChars) : source;
  const lines = body.split('\n');

  findings.push({
    code: 'script_present',
    severity: 'medium',
    message: `${className} at ${path} carries ${lines.length} line(s) of Luau. Golem never auto-inserts an asset containing code, whatever the code says.`,
    line: lines.length ? 1 : null,
    excerpt: excerptOf(lines.find((l) => l.trim().length) ?? ''),
  });

  if (truncated) {
    findings.push({
      code: 'obfuscation',
      severity: 'critical',
      message: `source is ${source.length} characters; only the first ${SCAN_LIMITS.maxSourceChars} were scanned. An asset this large is refused rather than partially cleared.`,
      line: null,
      excerpt: '',
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!line.trim()) continue;
    for (const rule of LINE_RULES) {
      if (rule.pattern.test(line)) {
        findings.push({ code: rule.code, severity: rule.severity, message: rule.why, line: i + 1, excerpt: excerptOf(line) });
      }
    }
    findings.push(...scanRequires(line, i + 1));
    if (findings.length >= SCAN_LIMITS.maxFindingsPerScript) break;
  }

  findings.push(...scanShape(body));

  const capped = findings.slice(0, SCAN_LIMITS.maxFindingsPerScript);
  const severity = capped.reduce<RiskSeverity>((acc, f) => worseSeverity(acc, f.severity), 'low');
  return {
    path,
    className,
    lineCount: lines.length,
    sourceLength: source.length,
    sourcePreview: body.slice(0, SCAN_LIMITS.sourcePreviewChars),
    findings: capped,
    severity,
    action: SEVERITY_ORDER[severity] >= SEVERITY_ORDER[REMOVE_AT] ? 'remove' : 'review',
  };
}

/**
 * Instance classes that are suspicious on their own, with no script anywhere in the model. A mesh
 * of a chair does not ship a RemoteEvent; if one is present, something was meant to talk to it.
 */
const SUSPICIOUS_CLASSES: Readonly<Record<string, { code: ScriptRiskCode; severity: RiskSeverity; why: string }>> = {
  RemoteEvent: { code: 'remote_traffic', severity: 'high', why: 'a RemoteEvent inside an inserted asset is a client/server channel nobody asked for' },
  RemoteFunction: { code: 'remote_traffic', severity: 'high', why: 'a RemoteFunction inside an inserted asset is a client/server channel nobody asked for' },
  BindableFunction: { code: 'remote_traffic', severity: 'medium', why: 'a BindableFunction is a call target left behind for code that is meant to arrive later' },
  Script: { code: 'script_present', severity: 'high', why: 'a server Script runs the moment the asset is inserted' },
  LocalScript: { code: 'script_present', severity: 'high', why: 'a LocalScript runs on every client' },
  ModuleScript: { code: 'script_present', severity: 'medium', why: 'a ModuleScript is Luau waiting to be required' },
};

export interface ScannedScriptInput {
  path: string;
  className: string;
  /** null when the read FAILED. Do not substitute an empty string; the two mean opposite things. */
  source: string | null;
}

export interface HierarchyScanInput {
  /** Where the asset landed, for the audit record. */
  rootPath: string;
  scripts: readonly ScannedScriptInput[];
  /** Every ClassName seen in the subtree, so class-level risk is caught even with zero scripts. */
  instanceClasses?: readonly string[];
  /** True when the subtree could not be enumerated. Unknown contents are never 'clean'. */
  enumerationFailed?: boolean;
}

export interface HierarchyScan {
  rootPath: string;
  /**
   * - `clean`    — no Luau, no unexpected class. The only value that may be auto-inserted.
   * - `stripped` — safe *after* `removePaths` are deleted, and only then.
   * - `reject`   — discard the whole asset; nothing here is made safe by deleting a script.
   */
  verdict: 'clean' | 'stripped' | 'reject';
  scriptCount: number;
  scripts: ScannedScript[];
  /** Paths to delete before the asset may be used at all. */
  removePaths: string[];
  /** Findings not attached to a script — class-level and enumeration risks. */
  findings: ScriptFinding[];
  severity: RiskSeverity | 'none';
  reasons: string[];
  /** The one field a call site should branch on. Never true when any script was found. */
  autoInsertable: boolean;
}

/**
 * Judge an inserted hierarchy.
 *
 * REJECT is reached by more routes than acceptance: an unreadable script, a failed enumeration,
 * more scripts than the scan cap, or any critical finding all end there. The only path to `clean`
 * is "there is provably nothing to remove".
 */
export function scanInsertedHierarchy(input: HierarchyScanInput): HierarchyScan {
  const scripts = input.scripts.slice(0, SCAN_LIMITS.maxScripts).map((s) => scanScriptSource(s.path, s.className, s.source));
  const findings: ScriptFinding[] = [];
  const reasons: string[] = [];

  if (input.scripts.length > SCAN_LIMITS.maxScripts) {
    findings.push({
      code: 'obfuscation',
      severity: 'critical',
      message: `${input.scripts.length} scripts in one asset, over the ${SCAN_LIMITS.maxScripts} scan cap — refused on count alone rather than partially cleared`,
      line: null,
      excerpt: '',
    });
  }

  if (input.enumerationFailed) {
    findings.push({
      code: 'unreadable',
      severity: 'critical',
      message: 'the inserted hierarchy could not be enumerated, so its contents are unknown. Unknown is never treated as empty.',
      line: null,
      excerpt: '',
    });
  }

  const scannedAny = scripts.length > 0;
  const seen = new Set<string>();
  for (const cls of input.instanceClasses ?? []) {
    const rule = SUSPICIOUS_CLASSES[cls];
    if (!rule || seen.has(cls)) continue;
    // A script class that DID arrive for scanning is already reported per-script; flagging it here
    // as well would double-count. A script class that did not arrive is the interesting case.
    if ((SCRIPT_CLASSES as readonly string[]).includes(cls) && scannedAny) continue;
    seen.add(cls);
    findings.push({ code: rule.code, severity: rule.severity, message: `${cls}: ${rule.why}`, line: null, excerpt: cls });
  }

  const rollUp = (acc: RiskSeverity | 'none', s: RiskSeverity): RiskSeverity => (acc === 'none' ? s : worseSeverity(acc, s));
  let severity: RiskSeverity | 'none' = 'none';
  for (const s of scripts) severity = rollUp(severity, s.severity);
  for (const f of findings) severity = rollUp(severity, f.severity);

  const removePaths = scripts.filter((s) => s.action === 'remove').map((s) => s.path);
  const critical = scripts.some((s) => s.severity === 'critical') || findings.some((f) => f.severity === 'critical');

  let verdict: HierarchyScan['verdict'];
  if (critical) {
    verdict = 'reject';
    reasons.push('a critical finding is not fixed by deleting a script — the whole asset is discarded');
  } else if (scripts.length || findings.length) {
    verdict = 'stripped';
    reasons.push(`${scripts.length} script(s) must be removed before this asset is usable; it is not auto-insertable`);
  } else {
    verdict = 'clean';
    reasons.push('no Luau and no unexpected instance class in the inserted subtree');
  }

  for (const s of scripts) {
    for (const f of s.findings) if (f.code !== 'script_present') reasons.push(`${s.path}: ${f.message}`);
  }
  for (const f of findings) reasons.push(f.message);

  return {
    rootPath: input.rootPath,
    verdict,
    scriptCount: scripts.length,
    scripts,
    removePaths,
    findings,
    severity,
    reasons,
    autoInsertable: verdict === 'clean',
  };
}

/** One-screen rendering of a scan, for a log line or a tool result. Never includes full sources. */
export function scanToText(scan: HierarchyScan): string {
  const lines = [`${scan.verdict.toUpperCase()} — ${scan.rootPath}: ${scan.scriptCount} script(s), worst severity ${scan.severity}`];
  for (const s of scan.scripts) {
    lines.push(`  ${s.className} ${s.path} [${s.severity}] -> ${s.action}`);
    for (const f of s.findings) {
      lines.push(`    ${f.severity} ${f.code}${f.line === null ? '' : ` (line ${f.line})`}: ${f.message}`);
      if (f.excerpt) lines.push(`      | ${f.excerpt}`);
    }
  }
  for (const f of scan.findings) lines.push(`  ${f.severity} ${f.code}: ${f.message}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// Style ranker — a technically valid asset can still be the wrong asset
//
// The verification gate above answers "is this safe and free?". It does not answer "does this
// belong in THIS game", and those are different questions with different failure modes. A
// photoreal PBR chair from a verified creator passes every security assertion and still ruins a
// bright simulator, because docs/ROBLOX-STYLE-SPEC.md §9 says a realistic material is an automatic
// fail. So a second, independent ranking runs on style.
//
// Every axis below is computed from a DETERMINISTIC signal — triangle count, texture presence,
// material enum, the saturation of the dominant colours, bounding box against the scale envelope.
// None of it costs a model call. That ordering is deliberate: a deterministic check that can reject
// a candidate must run before a critic that costs money and can be argued with, so `hardFails`
// exists to short-circuit the expensive path entirely.
//
// The honest limitation, stated here rather than discovered later: before an asset is inserted the
// only signals available are its NAME, its TAGS and whatever the details endpoint reported. Those
// are weak. `rankAssetsByStyle()` is therefore a cheap prefilter over search hits, and the real
// score is the one computed after insertion when triangles, materials and colours are measurable.
// ---------------------------------------------------------------------------------------------

/** Linear RGB channels in 0..1, matching Roblox's `Color3` and the rest of this repo. */
export type RGB = readonly [number, number, number];

export const STYLE_AXES = ['cartoon', 'poly_density', 'colour', 'scale', 'material', 'silhouette', 'performance', 'readability'] as const;
export type StyleAxis = (typeof STYLE_AXES)[number];

/**
 * Axis weights. Cartoon compatibility and polygon density carry the most because they are the two
 * that a wrong asset fails hardest and most visibly; silhouette and readability carry least because
 * they are computed from proxies rather than measured directly.
 */
const AXIS_WEIGHTS: Readonly<Record<StyleAxis, number>> = {
  cartoon: 0.2,
  poly_density: 0.15,
  colour: 0.15,
  material: 0.13,
  scale: 0.12,
  performance: 0.09,
  silhouette: 0.08,
  readability: 0.08,
};

export interface StyleTarget {
  id: string;
  /** What this target encodes, in one line, for a model that reads it in a prompt. */
  description: string;
  /** True when the category is flat-shaded and untextured (§7). A texture map is then a defect. */
  flatShaded: boolean;
  /** Triangles a single prop may cost before it is over budget. */
  triangleBudget: number;
  /** Triangles a good prop in this style actually costs. Far below this is also wrong. */
  triangleIdeal: number;
  /** Enum.Material names the style permits. */
  allowedMaterials: readonly string[];
  /** Materials that are an automatic style fail. §9: "a realistic material ... is an automatic fail". */
  bannedMaterials: readonly string[];
  /** HSV saturation floor for the dominant colours. §1: "no muted palettes, no tasteful neutrals". */
  minSaturation: number;
  /** HSV value floor. §1: "no dark mode". */
  minValue: number;
  /** The scene's colour zoning. A candidate near one of these reads as belonging. */
  palette: readonly RGB[];
  /** RGB distance at which a colour still counts as "in palette". */
  paletteTolerance: number;
  /** §7: props are oversized relative to the player. Realistic scale reads as empty. */
  oversizedProps: boolean;
}

function hex(h: string): RGB {
  const n = parseInt(h.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * The one calibrated target: the bright simulator category described by docs/ROBLOX-STYLE-SPEC.md.
 * The palette is that document's §1 environment table, verbatim, so the two cannot drift by
 * paraphrase. Callers with a different art direction pass their own `StyleTarget`.
 */
export const BRIGHT_SIMULATOR: StyleTarget = {
  id: 'bright_simulator',
  description:
    'Bright, saturated, flat-shaded low-poly. Colour zones the space and does the work; nothing is thin, subtle, desaturated or realistic (ROBLOX-STYLE-SPEC §1, §7, §9).',
  flatShaded: true,
  triangleBudget: 4000,
  triangleIdeal: 900,
  allowedMaterials: ['Plastic', 'SmoothPlastic', 'Neon', 'ForceField', 'Grass', 'Sand', 'Slate', 'Ground'],
  bannedMaterials: ['Glass', 'Marble', 'Granite', 'CorrodedMetal', 'DiamondPlate', 'Foil', 'Concrete', 'Brick', 'Cobblestone', 'Pebble', 'Asphalt', 'Basalt', 'CrackedLava', 'Limestone', 'Rock', 'Salt', 'Sandstone'],
  minSaturation: 0.35,
  minValue: 0.45,
  palette: [
    hex('5FC94A'), // grass
    hex('7ED957'),
    hex('C98A4B'), // dirt path
    hex('E0A45C'),
    hex('B8BFC4'), // stone path
    hex('B5533A'), // cliff
    hex('3E9E4E'), // canopy
    hex('57B85F'),
    hex('7A5230'), // trunk
    hex('7FC8F0'), // sky
    hex('E8D3A9'), // plaza floor
  ],
  paletteTolerance: 0.34,
  oversizedProps: true,
};

/**
 * What is known about a candidate. Every field is optional because the two call sites know very
 * different amounts: a search hit has a name and nothing else, while an inserted model has been
 * measured. Unknown is scored as 0.5 and SAID so, never silently treated as good.
 */
export interface StyleCandidate {
  assetId?: number | null;
  name?: string | null;
  tags?: readonly string[];
  triangles?: number | null;
  vertices?: number | null;
  /** A texture map is a defect in a flat-shaded target, so this is a first-class signal. */
  hasTexture?: boolean | null;
  textureResolution?: number | null;
  /** Enum.Material names actually present on the geometry. */
  materials?: readonly string[];
  /** Dominant colours as Color3-style 0..1 triples. */
  dominantColours?: readonly RGB[];
  boundsStuds?: readonly [number, number, number] | null;
  partCount?: number | null;
  /** What it is meant to be, e.g. "chair". Drives the scale envelope. */
  intent?: string;
}

export interface StyleAxisScore {
  axis: StyleAxis;
  /** 0..1. */
  score: number;
  weight: number;
  /** Why it scored that. Written to be shown to a user or fed back to a model. */
  reason: string;
}

export interface StyleScore {
  targetId: string;
  /** 0..100, weighted. */
  total: number;
  /**
   * - `strong`     — use it.
   * - `acceptable` — usable, with the named compromise.
   * - `off_style`  — it will look wrong; prefer anything else.
   * - `reject`     — a hard fail; do not use it at all.
   */
  verdict: 'strong' | 'acceptable' | 'off_style' | 'reject';
  axes: StyleAxisScore[];
  /** Deterministic hard fails. Non-empty means REJECT, and means no model critic needs to run. */
  hardFails: string[];
  /** How much of the score rests on measured facts rather than on unknowns, 0..1. */
  confidence: number;
}

/** HSV saturation and value of an RGB triple, tolerating a 0..255 input by normalising it. */
function saturationValue(c: RGB): { s: number; v: number } {
  const scale = Math.max(c[0], c[1], c[2]) > 1.0001 ? 1 / 255 : 1;
  const r = c[0] * scale;
  const g = c[1] * scale;
  const b = c[2] * scale;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return { s: max === 0 ? 0 : (max - min) / max, v: max };
}

function rgbDistance(a: RGB, b: RGB): number {
  const scale = Math.max(a[0], a[1], a[2]) > 1.0001 ? 1 / 255 : 1;
  return Math.sqrt((a[0] * scale - b[0]) ** 2 + (a[1] * scale - b[1]) ** 2 + (a[2] * scale - b[2]) ** 2);
}

/** Text signals. Weak on their own, but free, deterministic, and available before insertion. */
const REALISM_WORDS = /\b(?:pbr|photoreal(?:istic)?|realistic|scan(?:ned)?|hd|4k|8k|hi-?res|hyper-?real|ray-?trac|substance|megascan)\b/i;
const CARTOON_WORDS = /\b(?:low-?poly|lowpoly|cartoon|stylis[ez]ed|flat(?:-shaded)?|toon|simple|blocky|chibi|kenney|quaternius)\b/i;

function textSignal(cand: StyleCandidate): { realism: boolean; cartoon: boolean } {
  const text = [cand.name ?? '', ...(cand.tags ?? [])].join(' ');
  return { realism: REALISM_WORDS.test(text), cartoon: CARTOON_WORDS.test(text) };
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Score a candidate against a target.
 *
 * `hardFails` is the part that matters operationally: it is populated only from signals that were
 * actually measured (never from an unknown), and any entry in it forces `reject`. That is the
 * deterministic gate a caller runs BEFORE spending anything on a model critic.
 */
export function scoreAssetStyle(cand: StyleCandidate, target: StyleTarget = BRIGHT_SIMULATOR): StyleScore {
  const axes: StyleAxisScore[] = [];
  const hardFails: string[] = [];
  let known = 0;
  let knowable = 0;
  const push = (axis: StyleAxis, score: number, reason: string, measured: boolean) => {
    axes.push({ axis, score: clamp01(score), weight: AXIS_WEIGHTS[axis], reason });
    knowable += 1;
    if (measured) known += 1;
  };

  const text = textSignal(cand);
  const tris = typeof cand.triangles === 'number' && Number.isFinite(cand.triangles) ? cand.triangles : null;
  const materials = (cand.materials ?? []).filter((m) => typeof m === 'string' && m.length);
  const colours = (cand.dominantColours ?? []).filter((c) => Array.isArray(c) && c.length === 3);
  const hasTexture = cand.hasTexture ?? (typeof cand.textureResolution === 'number' ? cand.textureResolution > 0 : null);

  // 1. Cartoon compatibility --------------------------------------------------------------------
  {
    let score = 0.5;
    const why: string[] = [];
    if (hasTexture === true && target.flatShaded) {
      score = 0.1;
      why.push('carries a texture map, and this style is flat-shaded and untextured');
      hardFails.push('textured asset in a flat-shaded, untextured style (ROBLOX-STYLE-SPEC §7)');
    } else if (hasTexture === false && target.flatShaded) {
      score = 0.95;
      why.push('untextured, so colour does the work as the style requires');
    } else {
      why.push('texture presence unknown');
    }
    if (text.realism) {
      score = Math.min(score, 0.15);
      why.push('name or tags advertise realism (pbr/photoreal/scanned), which is the opposite of this category');
    }
    if (text.cartoon) {
      score = Math.max(score, 0.75);
      why.push('name or tags read as low-poly/stylised');
    }
    push('cartoon', score, why.join('; '), hasTexture !== null || text.realism || text.cartoon);
  }

  // 2. Polygon density --------------------------------------------------------------------------
  {
    if (tris === null) {
      push('poly_density', 0.5, 'triangle count unknown — the details endpoint reports it only for meshes it can measure', false);
    } else if (tris > target.triangleBudget * 3) {
      hardFails.push(`${tris} triangles is more than 3x the ${target.triangleBudget} budget for one prop`);
      push('poly_density', 0, `${tris} triangles, far past the ${target.triangleBudget} budget — this is a film asset, not a prop`, true);
    } else if (tris > target.triangleBudget) {
      push('poly_density', clamp01(1 - (tris - target.triangleBudget) / (target.triangleBudget * 2)), `${tris} triangles is over the ${target.triangleBudget} budget`, true);
    } else if (tris < target.triangleIdeal / 12) {
      push('poly_density', 0.45, `${tris} triangles is below the ${Math.round(target.triangleIdeal / 12)} floor — too coarse to read as the object it claims to be`, true);
    } else {
      push('poly_density', 1 - Math.abs(tris - target.triangleIdeal) / (target.triangleBudget * 2), `${tris} triangles sits inside the budget (ideal ~${target.triangleIdeal})`, true);
    }
  }

  // 3. Colour language --------------------------------------------------------------------------
  {
    if (!colours.length) {
      push('colour', 0.5, 'no dominant colours were measured', false);
    } else {
      const sv = colours.map(saturationValue);
      const meanS = sv.reduce((a, x) => a + x.s, 0) / sv.length;
      const meanV = sv.reduce((a, x) => a + x.v, 0) / sv.length;
      const nearest = colours.map((c) => Math.min(...target.palette.map((p) => rgbDistance(c, p))));
      const inPalette = nearest.filter((d) => d <= target.paletteTolerance).length / nearest.length;
      let score = clamp01(0.45 * clamp01(meanS / Math.max(0.01, target.minSaturation)) + 0.2 * clamp01(meanV / Math.max(0.01, target.minValue)) + 0.35 * inPalette);
      const why = [`mean saturation ${meanS.toFixed(2)} (floor ${target.minSaturation}), value ${meanV.toFixed(2)} (floor ${target.minValue}), ${Math.round(inPalette * 100)}% of dominant colours inside the scene palette`];
      if (meanS < target.minSaturation * 0.5) {
        hardFails.push(`dominant colours average ${meanS.toFixed(2)} saturation, less than half the ${target.minSaturation} floor — desaturated is an automatic fail in this category`);
        score = Math.min(score, 0.1);
        why.push('desaturated');
      }
      if (meanV < target.minValue * 0.6) {
        hardFails.push(`dominant colours average ${meanV.toFixed(2)} brightness, well under the ${target.minValue} floor — this category has no dark mode`);
        score = Math.min(score, 0.1);
        why.push('too dark');
      }
      push('colour', score, why.join('; '), true);
    }
  }

  // 4. Scale ------------------------------------------------------------------------------------
  {
    if (!cand.boundsStuds) {
      push('scale', 0.5, 'no bounding box was measured', false);
    } else {
      const check = checkScale(cand.intent ?? cand.name ?? undefined, [cand.boundsStuds[0], cand.boundsStuds[1], cand.boundsStuds[2]]);
      if (check.lyingDown) {
        hardFails.push(`a '${check.ruleKey}' this shape is lying on its side, not standing`);
        push('scale', 0, check.reasons.join('; '), true);
      } else if (check.ok) {
        push('scale', 1, `plausible dimensions for a '${check.ruleKey}'`, true);
      } else {
        push('scale', clamp01(1 - check.reasons.length * 0.4), check.reasons.join('; '), true);
      }
    }
  }

  // 5. Material style ---------------------------------------------------------------------------
  {
    if (!materials.length) {
      push('material', 0.5, 'no materials were reported', false);
    } else {
      const banned = materials.filter((m) => target.bannedMaterials.includes(m));
      const allowed = materials.filter((m) => target.allowedMaterials.includes(m));
      if (banned.length) {
        hardFails.push(`uses ${banned.join(', ')} — a realistic material is an automatic style fail (ROBLOX-STYLE-SPEC §9)`);
        push('material', 0, `realistic materials present: ${banned.join(', ')}`, true);
      } else {
        push('material', clamp01(allowed.length / materials.length), `${allowed.length}/${materials.length} materials are on the style's allowlist`, true);
      }
    }
  }

  // 6. Silhouette -------------------------------------------------------------------------------
  //    A proxy, and labelled as one: detail-per-volume. A shape that reads at a glance carries its
  //    information in the outline, so a high triangle count packed into a small box is a fussy
  //    silhouette even when the triangle budget itself is satisfied.
  {
    if (tris === null || !cand.boundsStuds) {
      push('silhouette', 0.5, 'silhouette proxy needs both a triangle count and a bounding box', false);
    } else {
      const volume = Math.max(1, cand.boundsStuds[0] * cand.boundsStuds[1] * cand.boundsStuds[2]);
      const density = tris / volume;
      push('silhouette', clamp01(1 - density / 400), `${density.toFixed(0)} triangles per cubic stud (proxy for how fussy the outline is; flat-shaded forms sit low)`, true);
    }
  }

  // 7. Performance ------------------------------------------------------------------------------
  {
    const parts = typeof cand.partCount === 'number' ? cand.partCount : null;
    if (tris === null && parts === null && !cand.textureResolution) {
      push('performance', 0.5, 'no cost signals were measured', false);
    } else {
      const triCost = tris === null ? 0.5 : clamp01(1 - tris / (target.triangleBudget * 4));
      const texCost = cand.textureResolution ? clamp01(1 - cand.textureResolution / 4096) : 1;
      const partCost = parts === null ? 0.7 : clamp01(1 - parts / QC_THRESHOLDS.softPartWarn);
      push('performance', triCost * 0.5 + texCost * 0.25 + partCost * 0.25, `triangles ${tris ?? 'unknown'}, texture ${cand.textureResolution ?? 'none'}px, parts ${parts ?? 'unknown'}`, tris !== null || parts !== null);
    }
  }

  // 8. Gameplay readability ---------------------------------------------------------------------
  //    §7: props are oversized relative to the player, and colour zoning is how a player reads
  //    where to go. An in-palette prop at realistic scale is the specific failure this catches.
  {
    const why: string[] = [];
    let score = 0.5;
    let measured = false;
    if (cand.boundsStuds) {
      measured = true;
      const height = cand.boundsStuds[1];
      const { rule } = scaleRuleFor(cand.intent ?? cand.name ?? undefined);
      const mid = (rule.minHeight + rule.maxHeight) / 2;
      score = target.oversizedProps ? clamp01(height / mid) : clamp01(1 - Math.abs(height - mid) / mid);
      why.push(`${height} studs tall against a ${mid.toFixed(1)}-stud midpoint for its class${target.oversizedProps ? ' (this style wants props oversized, not realistic)' : ''}`);
    } else {
      why.push('no height measured');
    }
    if (colours.length) {
      measured = true;
      const contrast = Math.max(...colours.map((c) => Math.min(...target.palette.map((p) => rgbDistance(c, p)))));
      score = score * 0.75 + clamp01(contrast / 0.5) * 0.25;
      why.push(`separates from the ground palette by ${contrast.toFixed(2)}`);
    }
    push('readability', score, why.join('; '), measured);
  }

  const total = axes.reduce((a, x) => a + x.score * x.weight, 0) * 100;
  const verdict: StyleScore['verdict'] = hardFails.length ? 'reject' : total >= 75 ? 'strong' : total >= 55 ? 'acceptable' : 'off_style';
  return {
    targetId: target.id,
    total: hardFails.length ? Math.min(total, 25) : total,
    verdict,
    axes,
    hardFails,
    confidence: knowable ? known / knowable : 0,
  };
}

export interface RankedCandidate {
  candidate: StyleCandidate;
  score: StyleScore;
}

/**
 * Rank candidates best-first. Hard-failed candidates always sort last regardless of their weighted
 * total, because "it scored 60 but uses Marble" is still an automatic fail, not a near miss.
 */
export function rankAssetsByStyle(candidates: readonly StyleCandidate[], target: StyleTarget = BRIGHT_SIMULATOR): RankedCandidate[] {
  return candidates
    .map((candidate) => ({ candidate, score: scoreAssetStyle(candidate, target) }))
    .sort((a, b) => {
      const aFail = a.score.hardFails.length > 0;
      const bFail = b.score.hardFails.length > 0;
      if (aFail !== bFail) return aFail ? 1 : -1;
      return b.score.total - a.score.total;
    });
}

/**
 * The deterministic style gate (§39): does this candidate fail on measured facts alone?
 *
 * A caller runs this BEFORE any model-based critic. When it returns a non-empty list, the critic is
 * not worth its cost — the answer is already known and it is no.
 */
export function styleGateBlocks(score: StyleScore): string[] {
  return score.hardFails.slice();
}

/** One-screen rendering of a style score, for a log line or a tool result. */
export function styleToText(score: StyleScore): string {
  const lines = [`${score.verdict.toUpperCase()} ${score.total.toFixed(0)}/100 against '${score.targetId}' (confidence ${(score.confidence * 100).toFixed(0)}%)`];
  for (const a of score.axes) lines.push(`  ${a.axis} ${(a.score * 100).toFixed(0)} (w${a.weight}): ${a.reason}`);
  for (const f of score.hardFails) lines.push(`  HARD FAIL: ${f}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// The COHERENCE gate — "does this belong with the assets already accepted?" (§42)
//
// WHY THIS EXISTS, IN THE OWNER'S WORDS: "the world reads too much like multiple unrelated free
// assets placed into one map". Every asset in that map had passed security AND passed the style
// ranker above. Both gates were working. Both were asking the wrong question.
//
// `scoreAssetStyle()` asks an ABSOLUTE question: is this cartoon-compatible, is it under budget,
// is it saturated enough. A lime-green bush answers yes. So does a 40k-triangle photoreal rock
// once you strip its texture. So does a grey fence. Each of those is individually defensible and
// collectively they are a junk drawer, because "passes the style spec" is not the same as
// "belongs next to the eleven things already standing here".
//
// So this gate asks the RELATIVE question, and it asks it AFTER insertion, against a PALETTE
// CONTEXT built from what was already accepted:
//
//   palette      — distance from the colours this biome has already approved
//   saturation   — distance from the saturation the accepted set actually runs at
//   silhouette   — detail density against the accepted set's median, because a 40k-triangle
//                  realistic rock beside 300-triangle stylised ones is incoherent even though
//                  both are "rocks" and both are "under budget"
//   texture      — a textured mesh among untextured ones cannot be recoloured and will always
//                  read foreign, whatever else is done to it
//   scale_tier   — plausibility against a PLAYER-RELATIVE tier, not an absolute stud range,
//                  because the failure the owner saw was trees, rocks, fences and crates
//                  disagreeing with EACH OTHER
//   biome        — contamination: living lime-green standing inside a snow biome
//
// TWO OUTCOMES, NOT ONE. The owner said "rejected OR transformed". A grey fence in a saturated
// meadow is not a bad asset, it is an untinted one, and throwing it away costs a search. So the
// verdict carries a TRANSFORM when a single change would fix it — retint, rescale, drop texture —
// and refuses only when no single change would. `buildTransformLuau()` turns that suggestion into
// the code that applies it, so a transform is a thing that happens rather than a thing suggested.
//
// AND IT CULLS. "Do not interpret 26 assets acquired as 26 assets must remain. A smaller coherent
// palette is better than a larger incoherent one." `cullPalette()` is that sentence as a function.
// ---------------------------------------------------------------------------------------------

/** The colour zones a map is divided into. Each one is its own coherence context. */
export const BIOMES = ['meadow', 'frost', 'canyon', 'plaza'] as const;
export type Biome = (typeof BIOMES)[number];

/**
 * A hue range that must not appear in a biome AT ALL, whatever else the asset does right.
 *
 * This is deliberately rarer than "off palette": most out-of-palette colours are a tint problem
 * and get a retint. A contamination band is the case where the colour is the tell that the asset
 * came from a different map — the owner's screenshot of bright lime trees standing in snow.
 */
export interface HueBand {
  name: string;
  /** Degrees, 0..360. */
  minHue: number;
  maxHue: number;
  /** Below this saturation the hue is a neutral and reads as fine. */
  minSaturation: number;
  why: string;
}

export interface BiomeProfile {
  id: Biome;
  description: string;
  /** The colours this biome has approved. Seeded from ROBLOX-STYLE-SPEC §1 where it names them. */
  palette: readonly RGB[];
  forbidden: readonly HueBand[];
}

/** Living leaf/lime green. Named once because two biomes forbid the same band for the same reason. */
const VEGETATION_GREEN: HueBand = {
  name: 'vegetation green',
  minHue: 70,
  maxHue: 165,
  minSaturation: 0.35,
  why: 'living lime/leaf green does not grow here — it reads as an asset from another map dropped into this one',
};

/**
 * Only four biomes, and only one of them carries a contamination band, because inventing symmetry
 * here would be inventing rules. Frost gets the band because frost contamination is the failure
 * that was actually observed; a canyon genuinely tolerates scrub, so it gets no band and its
 * off-palette greens are handled as an ordinary tint problem.
 */
export const BIOME_PROFILES: Readonly<Record<Biome, BiomeProfile>> = {
  meadow: {
    id: 'meadow',
    description: 'Saturated grass, dirt paths, warm trunks. The default outdoor zone.',
    palette: [hex('5FC94A'), hex('7ED957'), hex('3E9E4E'), hex('57B85F'), hex('C98A4B'), hex('E0A45C'), hex('7A5230'), hex('B8BFC4')],
    forbidden: [],
  },
  frost: {
    id: 'frost',
    description: 'Snow, ice and cold stone. Cool hues only; its greens are desaturated pine, never leaf.',
    palette: [hex('F2F7FA'), hex('BFE3F2'), hex('7FB6D9'), hex('9FB0BC'), hex('5C8C86'), hex('6E7F94')],
    forbidden: [VEGETATION_GREEN],
  },
  canyon: {
    id: 'canyon',
    description: 'Layered warm rock: rust, ochre, sand. Reads by strata, not by repetition.',
    palette: [hex('B5533A'), hex('C96A3F'), hex('E0A45C'), hex('E8D3A9'), hex('8C4A33'), hex('A9713F')],
    forbidden: [],
  },
  plaza: {
    id: 'plaza',
    description: 'Built ground: pale stone, banners, painted trim. Where the player is meant to stop.',
    palette: [hex('E8D3A9'), hex('B8BFC4'), hex('D9C08A'), hex('C05A4A'), hex('4A7FC0'), hex('F0E4C8')],
    forbidden: [],
  },
};

/** Hue in degrees, 0..360. Undefined for a neutral, so callers must check saturation first. */
function hueOf(c: RGB): number {
  const scale = Math.max(c[0], c[1], c[2]) > 1.0001 ? 1 / 255 : 1;
  const r = c[0] * scale;
  const g = c[1] * scale;
  const b = c[2] * scale;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = 60 * (((g - b) / d) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  return (h + 360) % 360;
}

function inBand(c: RGB, band: HueBand): boolean {
  const { s } = saturationValue(c);
  if (s < band.minSaturation) return false;
  const h = hueOf(c);
  return h >= band.minHue && h <= band.maxHue;
}

// --- player-relative scale tiers ---------------------------------------------------------------
//
// The scale failure the owner named is not "this tree is 300 studs tall" — the absolute envelope in
// SCALE_ENVELOPES already catches that. It is "trees, rocks, fences, crates disagree strongly in
// scale", which is a statement about the objects RELATIVE TO EACH OTHER and to the player. So the
// unit here is the avatar, and the check is which band the asset lands in versus which band its
// class belongs in.

/** R15 avatar height. Every tier below is a multiple of this, which is the point. */
export const PLAYER_HEIGHT_STUDS = 5;

export const SCALE_TIERS = [
  { id: 'underfoot', maxRatio: 0.55, label: 'below the knee — pebbles, flowers, litter' },
  { id: 'waist', maxRatio: 1.15, label: 'knee to head — crates, bushes, rocks, seating' },
  { id: 'player', maxRatio: 2.6, label: 'one to two-and-a-half players — doors, fences, signs, NPCs' },
  { id: 'canopy', maxRatio: 9, label: 'overhead — trees, lamps, columns, statues' },
  { id: 'landmark', maxRatio: Infinity, label: 'skyline — buildings, towers, the central landmark' },
] as const;
export type ScaleTier = (typeof SCALE_TIERS)[number]['id'];

const TIER_ORDER: readonly ScaleTier[] = SCALE_TIERS.map((t) => t.id);

/** Which tier a measured height lands in. */
export function tierForHeight(heightStuds: number): ScaleTier {
  const ratio = heightStuds / PLAYER_HEIGHT_STUDS;
  for (const t of SCALE_TIERS) if (ratio <= t.maxRatio) return t.id;
  return 'landmark';
}

/** The stud range a tier covers. `landmark` is open-ended upward and says so with Infinity. */
export function tierRange(tier: ScaleTier): { min: number; max: number } {
  const i = TIER_ORDER.indexOf(tier);
  const min = i <= 0 ? 0 : SCALE_TIERS[i - 1]!.maxRatio * PLAYER_HEIGHT_STUDS;
  const max = SCALE_TIERS[i]!.maxRatio * PLAYER_HEIGHT_STUDS;
  return { min, max };
}

/** What tier each kind of thing is SUPPOSED to occupy. Resolved by longest substring, like scaleRuleFor. */
export const INTENT_TIERS: Readonly<Record<string, ScaleTier>> = {
  pebble: 'underfoot', flower: 'underfoot', mushroom: 'underfoot', litter: 'underfoot', grass: 'underfoot',
  crate: 'waist', barrel: 'waist', bush: 'waist', shrub: 'waist', rock: 'waist', boulder: 'waist',
  chair: 'waist', stool: 'waist', bench: 'waist', table: 'waist', lantern: 'waist', chest: 'waist',
  fence: 'player', door: 'player', sign: 'player', npc: 'player', character: 'player', post: 'player',
  banner: 'player', gate: 'player', barrier: 'player',
  tree: 'canopy', lamp: 'canopy', column: 'canopy', pillar: 'canopy', statue: 'canopy', arch: 'canopy',
  fountain: 'canopy', crystal: 'canopy',
  building: 'landmark', house: 'landmark', tower: 'landmark', castle: 'landmark', monument: 'landmark',
};

export function expectedTier(intent: string | undefined): { key: string; tier: ScaleTier } {
  if (typeof intent !== 'string' || !intent.length) return { key: 'prop', tier: 'waist' };
  const text = intent.toLowerCase();
  const exact = INTENT_TIERS[text];
  if (exact) return { key: text, tier: exact };
  let bestKey: string | null = null;
  let best: ScaleTier | null = null;
  for (const [key, tier] of Object.entries(INTENT_TIERS)) {
    if (text.includes(key) && (bestKey === null || key.length > bestKey.length)) { bestKey = key; best = tier; }
  }
  return bestKey && best ? { key: bestKey, tier: best } : { key: 'prop', tier: 'waist' };
}

/**
 * Things whose COLOUR IS THEIR IDENTITY. A crate can be any colour; a tree's canopy green is what
 * makes it read as a tree. That distinction is the whole reason a lime bush in the snow is a
 * removal and a grey fence in the meadow is a retint: repainting the bush white does not fix the
 * bush, it makes it a different object that no longer reads as foliage.
 */
const IDENTITY_COLOURED = /\b(?:tree|bush|shrub|foliage|plant|leaf|leaves|canopy|hedge|grass|flower|fern|palm|vine|moss)\b/i;

// --- the palette context ------------------------------------------------------------------------

/** An asset already accepted into the map. The gate's context is built out of these. */
export interface CoherenceMember {
  assetId?: number | null;
  name?: string | null;
  triangles?: number | null;
  hasTexture?: boolean | null;
  dominantColours?: readonly RGB[];
  boundsStuds?: readonly [number, number, number] | null;
  intent?: string;
}

/** A candidate is a member plus the two facts that only matter for the transform decision. */
export interface CoherenceCandidate extends CoherenceMember {
  /** True when the texture map can be cleared in place (a MeshPart TextureID, not baked-in vertex colour). */
  textureRemovable?: boolean | null;
}

export interface PaletteContext {
  biome: Biome;
  /** How many accepted assets this was derived from. 0 means the biome profile IS the context. */
  sampleSize: number;
  /** Biome palette PLUS every colour already accepted. This is what "in palette" now means. */
  approvedColours: RGB[];
  paletteTolerance: number;
  /** Saturation the accepted set actually runs at — not the spec floor, the observed level. */
  meanSaturation: number;
  /** Median triangles across the accepted set, or null when nothing measurable was accepted. */
  medianTriangles: number | null;
  /** Median detail density (triangles per cubic stud) across the accepted set. */
  medianDensity: number | null;
  /** Fraction of the accepted set carrying a texture map. */
  texturedFraction: number;
  /** True when the accepted set is untextured: a textured newcomer cannot be recoloured to match. */
  flatShaded: boolean;
  target: StyleTarget;
  /** How the numbers above were derived, in plain words. */
  notes: string[];
}

function median(ns: readonly number[]): number | null {
  if (!ns.length) return null;
  const s = [...ns].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function densityOf(m: CoherenceMember): number | null {
  const tris = typeof m.triangles === 'number' && Number.isFinite(m.triangles) ? m.triangles : null;
  if (tris === null || !m.boundsStuds) return null;
  const volume = Math.max(1, m.boundsStuds[0] * m.boundsStuds[1] * m.boundsStuds[2]);
  return tris / volume;
}

/**
 * Derive the context from what has already been accepted.
 *
 * The accepted set WIDENS the palette (a colour that is already standing in the map is approved by
 * the fact that it is standing there) but it does not widen the contamination bands, which come
 * from the biome and are not up for negotiation by precedent. That asymmetry is deliberate: it is
 * how a map drifts one asset at a time, and refusing to let it drift is the point of the gate.
 */
export function buildPaletteContext(
  biome: Biome,
  accepted: readonly CoherenceMember[] = [],
  target: StyleTarget = BRIGHT_SIMULATOR,
): PaletteContext {
  const profile = BIOME_PROFILES[biome];
  const members = accepted.filter((m) => m && typeof m === 'object');
  const notes: string[] = [`biome '${biome}': ${profile.description}`];

  const acceptedColours: RGB[] = [];
  for (const m of members) for (const c of m.dominantColours ?? []) if (Array.isArray(c) && c.length === 3) acceptedColours.push(c);
  const approvedColours = [...profile.palette, ...acceptedColours];
  notes.push(`${profile.palette.length} colour(s) from the biome profile + ${acceptedColours.length} measured off ${members.length} accepted asset(s)`);

  const sats = acceptedColours.map((c) => saturationValue(c).s);
  const meanSaturation = sats.length ? sats.reduce((a, x) => a + x, 0) / sats.length : target.minSaturation;
  notes.push(sats.length ? `accepted set runs at ${meanSaturation.toFixed(2)} saturation` : `nothing accepted yet, so the ${target.minSaturation} spec floor stands in for the observed level`);

  const tris = members.map((m) => m.triangles).filter((t): t is number => typeof t === 'number' && Number.isFinite(t));
  const medianTriangles = median(tris);
  const densities = members.map(densityOf).filter((d): d is number => d !== null);
  const medianDensity = median(densities);
  if (medianTriangles !== null) notes.push(`median accepted asset is ${medianTriangles} triangles${medianDensity !== null ? ` at ${medianDensity.toFixed(1)} tri/stud³` : ''}`);

  const textureKnown = members.filter((m) => m.hasTexture === true || m.hasTexture === false);
  const texturedFraction = textureKnown.length ? textureKnown.filter((m) => m.hasTexture === true).length / textureKnown.length : 0;
  const flatShaded = textureKnown.length ? texturedFraction <= 0.2 : target.flatShaded;
  notes.push(flatShaded ? 'the accepted set is flat-shaded and untextured' : `${Math.round(texturedFraction * 100)}% of the accepted set carries a texture map`);

  return {
    biome,
    sampleSize: members.length,
    approvedColours,
    paletteTolerance: target.paletteTolerance,
    meanSaturation,
    medianTriangles,
    medianDensity,
    texturedFraction,
    flatShaded,
    target,
    notes,
  };
}

// --- transforms ----------------------------------------------------------------------------------

export const TRANSFORM_KINDS = ['retint', 'rescale', 'drop_texture'] as const;
export type TransformKind = (typeof TRANSFORM_KINDS)[number];

export interface AssetTransform {
  kind: TransformKind;
  /** One line, actionable: what to change and to what. */
  instruction: string;
  /** RETINT: the approved colour to move the asset's dominant colours onto. */
  colour?: RGB;
  /** RESCALE: multiply the model by this. */
  scale?: number;
  /** Which axes this is expected to repair. */
  repairs: CoherenceAxis[];
  /** The coherence total the gate PROJECTS once it is applied — recomputed, not guessed. */
  projectedTotal: number;
}

export const COHERENCE_AXES = ['palette', 'silhouette', 'saturation', 'texture', 'scale_tier', 'biome'] as const;
export type CoherenceAxis = (typeof COHERENCE_AXES)[number];

/**
 * Palette and silhouette lead because they are the two the owner's eye caught from a player-eye
 * camera: the colour that does not belong, and the object that is too detailed for its neighbours.
 */
const COHERENCE_WEIGHTS: Readonly<Record<CoherenceAxis, number>> = {
  palette: 0.24,
  silhouette: 0.2,
  saturation: 0.16,
  texture: 0.16,
  scale_tier: 0.14,
  biome: 0.1,
};

/** Weighted total at or above which a candidate reads as belonging. */
export const COHERENCE_FLOOR = 68;

export interface CoherenceAxisScore {
  axis: CoherenceAxis;
  score: number;
  weight: number;
  reason: string;
  measured: boolean;
}

export interface CoherenceVerdict {
  biome: Biome;
  /** 0..100, weighted. */
  total: number;
  /**
   * - `coherent`   — it belongs; keep it as it is.
   * - `transform`  — it does not belong YET, and one named change would fix it.
   * - `incoherent` — no single change fixes it. Cull it.
   */
  verdict: 'coherent' | 'transform' | 'incoherent';
  axes: CoherenceAxisScore[];
  /** Everything wrong with it, transformable or not. Empty when it is coherent. */
  reasons: string[];
  /** The subset no transform can repair. Non-empty forces `incoherent`. */
  blockers: string[];
  transform: AssetTransform | null;
  /** True when it carries a texture map into a flat-shaded set: it can never be recoloured to match. */
  unrecolourable: boolean;
  /** How much of this rests on measured facts, 0..1. */
  confidence: number;
  /** True when too little was measured to judge. The gate then abstains rather than refusing. */
  abstained: boolean;
  /** How many accepted assets the context was built from. */
  contextSize: number;
}

/**
 * Pick the colour to retint towards: the approved colour nearest in HUE that actually clears the
 * saturation floor.
 *
 * Nearest-by-RGB is the obvious implementation and it is wrong — it maps a grey fence onto the
 * approved grey stone, which is a no-op that leaves the fence exactly as unstyled as it was. Hue
 * is the axis a retint can move along without changing what the object is.
 */
export function chooseRetint(colours: readonly RGB[], ctx: PaletteContext): RGB | null {
  const floor = Math.max(ctx.target.minSaturation, ctx.meanSaturation * 0.8);
  const usable = ctx.approvedColours.filter((c) => {
    const { s, v } = saturationValue(c);
    return s >= floor && v >= ctx.target.minValue;
  });
  const pool = usable.length ? usable : ctx.approvedColours.slice();
  if (!pool.length) return null;
  const source = colours.find((c) => saturationValue(c).s > 0.15);
  if (source) {
    const h = hueOf(source);
    return pool.reduce((best, c) => {
      const d = Math.min(Math.abs(hueOf(c) - h), 360 - Math.abs(hueOf(c) - h));
      const bd = Math.min(Math.abs(hueOf(best) - h), 360 - Math.abs(hueOf(best) - h));
      return d < bd ? c : best;
    });
  }
  // A neutral has no hue to preserve, so match brightness instead and let the palette pick the hue.
  const v = colours.length ? saturationValue(colours[0]!).v : 0.6;
  return pool.reduce((best, c) => (Math.abs(saturationValue(c).v - v) < Math.abs(saturationValue(best).v - v) ? c : best));
}

/**
 * Score a candidate against a palette context, and say what — if anything — would fix it.
 *
 * `depth` is internal: the projected total of a transform is computed by re-running this function
 * on the transformed candidate, so a suggested transform is one the gate has actually checked
 * rather than one it hopes about.
 */
export function scoreAssetCoherence(cand: CoherenceCandidate, ctx: PaletteContext, depth = 0): CoherenceVerdict {
  const axes: CoherenceAxisScore[] = [];
  const reasons: string[] = [];
  const blockers: string[] = [];
  /** Failures a transform of this kind would repair. */
  const repairable: { kind: TransformKind; axis: CoherenceAxis; why: string }[] = [];
  const push = (axis: CoherenceAxis, score: number, reason: string, measured: boolean) => {
    axes.push({ axis, score: clamp01(score), weight: COHERENCE_WEIGHTS[axis], reason, measured });
  };

  const profile = BIOME_PROFILES[ctx.biome];
  const colours = (cand.dominantColours ?? []).filter((c) => Array.isArray(c) && c.length === 3);
  const tris = typeof cand.triangles === 'number' && Number.isFinite(cand.triangles) ? cand.triangles : null;
  const hasTexture = cand.hasTexture ?? null;
  const identity = IDENTITY_COLOURED.test(`${cand.intent ?? ''} ${cand.name ?? ''}`);

  // 1. Biome contamination -----------------------------------------------------------------------
  //    Run FIRST because its outcome changes what the palette axis is allowed to suggest: an
  //    identity-coloured contaminant cannot be retinted out of the problem.
  let contaminated: HueBand | null = null;
  {
    if (!colours.length) {
      push('biome', 0.5, `no colours were measured, so contamination against '${ctx.biome}' is unknown`, false);
    } else {
      const hits = profile.forbidden.filter((b) => colours.some((c) => inBand(c, b)));
      if (hits.length) {
        contaminated = hits[0]!;
        const band = hits[0]!;
        const why = `palette contamination: ${band.name} inside the '${ctx.biome}' biome — ${band.why}`;
        push('biome', 0, why, true);
        reasons.push(why);
        if (identity) {
          blockers.push(`${why}; and ${band.name} is this object's identity colour, so retinting it would not fix it — it would make it a different object`);
        } else {
          repairable.push({ kind: 'retint', axis: 'biome', why });
        }
      } else {
        push('biome', 1, `no forbidden hue for '${ctx.biome}' appears in its dominant colours`, true);
      }
    }
  }

  // 2. Palette distance --------------------------------------------------------------------------
  //    `alreadyApproved` is the tighter of two tests and exists to protect the deliberate neutral.
  //    "Within tolerance of an approved colour" is loose enough to cover default part grey, which
  //    is the thing the saturation axis below is FOR; "sitting on an approved colour" is not. So a
  //    stone that is painted the scene's stone colour is exempt from the grey-prop rule, and a
  //    fence left on factory grey is not, even though both are neutral.
  let alreadyApproved = false;
  {
    if (!colours.length) {
      push('palette', 0.5, 'no dominant colours were measured', false);
    } else {
      const nearest = colours.map((c) => Math.min(...ctx.approvedColours.map((p) => rgbDistance(c, p))));
      alreadyApproved = nearest.every((d) => d <= ctx.paletteTolerance / 2);
      const worst = Math.max(...nearest);
      const inPalette = nearest.filter((d) => d <= ctx.paletteTolerance).length / nearest.length;
      const score = clamp01(inPalette * 0.7 + clamp01(1 - worst / (ctx.paletteTolerance * 2.5)) * 0.3);
      const reason = `${Math.round(inPalette * 100)}% of dominant colours sit inside the ${ctx.approvedColours.length}-colour approved set (worst is ${worst.toFixed(2)} away, tolerance ${ctx.paletteTolerance})`;
      push('palette', score, reason, true);
      if (score < 0.5 && !contaminated) {
        const why = `off the approved palette for '${ctx.biome}': ${reason}`;
        reasons.push(why);
        repairable.push({ kind: 'retint', axis: 'palette', why });
      }
    }
  }

  // 3. Saturation distance from the ACCEPTED SET (not from the spec floor) -------------------------
  {
    if (!colours.length) {
      push('saturation', 0.5, 'no dominant colours were measured', false);
    } else {
      const sats = colours.map((c) => saturationValue(c).s);
      const mean = sats.reduce((a, x) => a + x, 0) / sats.length;
      const drift = Math.abs(mean - ctx.meanSaturation);
      const score = clamp01(1 - drift / 0.45);
      const reason = `saturation ${mean.toFixed(2)} against the accepted set's ${ctx.meanSaturation.toFixed(2)} (drift ${drift.toFixed(2)})${alreadyApproved ? ' — but it is painted a colour the set has already approved, so the drift is deliberate' : ''}`;
      push('saturation', alreadyApproved ? Math.max(score, 0.8) : score, reason, true);
      if (score < 0.5 && !alreadyApproved) {
        const why = mean < ctx.meanSaturation
          ? `reads grey/unstyled beside the accepted set: ${reason}`
          : `far louder than everything already accepted: ${reason}`;
        reasons.push(why);
        if (!contaminated) repairable.push({ kind: 'retint', axis: 'saturation', why });
      }
    }
  }

  // 4. Silhouette complexity vs the accepted set ---------------------------------------------------
  //    THE 40k-TRIANGLE ROCK. Both are rocks, both pass the absolute triangle budget when the budget
  //    is generous, and side by side one of them is from a different game. Detail density is the
  //    measurable form of that, and it is not transformable: nothing here can decimate a mesh, so a
  //    gross mismatch is a cull, not a fix.
  {
    const density = densityOf(cand);
    if (tris === null || ctx.medianTriangles === null) {
      push('silhouette', 0.5, 'silhouette needs both a measured triangle count and an accepted set to compare against', false);
    } else {
      const triRatio = tris / Math.max(1, ctx.medianTriangles);
      const densRatio = density !== null && ctx.medianDensity !== null && ctx.medianDensity > 0 ? density / ctx.medianDensity : null;
      // The GEOMETRIC MEAN of the two, not the max. Raw triangle count alone forgives a fussy
      // pebble; density alone condemns any small object, because density is triangles over volume
      // and volume is cubic. Taking the mean means a candidate has to be out of line on both counts
      // before it is called incoherent, which is the case the eye actually notices.
      const ratio = densRatio === null ? triRatio : Math.sqrt(Math.max(1, triRatio) * Math.max(1, densRatio));
      const score = clamp01(1 - Math.log2(Math.max(1, ratio)) / 5);
      const reason = `${tris} triangles is ${triRatio.toFixed(1)}x the accepted median of ${ctx.medianTriangles}${densRatio !== null ? `, detail density ${densRatio.toFixed(1)}x` : ''} (combined ${ratio.toFixed(1)}x)`;
      push('silhouette', score, reason, true);
      if (ratio > 8) {
        const why = `detail density is incoherent with the accepted set — ${reason}. Nothing available here decimates a mesh, so this cannot be brought into line`;
        reasons.push(why);
        blockers.push(why);
      } else if (ratio > 3) {
        reasons.push(`busier than its neighbours (${reason}), but inside what the silhouette tolerates`);
      }
    }
  }

  // 5. Texture presence vs a flat-shaded set --------------------------------------------------------
  //    The owner's sentence, and it is exactly right: a textured mesh among untextured ones cannot be
  //    recoloured and will always read foreign. Every other repair here works by changing colour; a
  //    baked texture is the one thing that puts the asset beyond colour's reach.
  let unrecolourable = false;
  {
    if (hasTexture === null) {
      push('texture', 0.5, 'texture presence unknown', false);
    } else if (!ctx.flatShaded) {
      push('texture', hasTexture ? 1 : 0.7, hasTexture ? 'textured, matching a textured accepted set' : 'untextured among a mostly textured set — flatter than its neighbours but not foreign', true);
    } else if (!hasTexture) {
      push('texture', 1, 'untextured, like every asset already accepted — colour can still do the work', true);
    } else {
      unrecolourable = true;
      const why = `carries a texture map into a flat-shaded, untextured set (${Math.round(ctx.texturedFraction * 100)}% textured) — an unrecolourable asset: no retint can reach a baked texture, so it will always read foreign`;
      push('texture', 0.05, why, true);
      reasons.push(why);
      if (cand.textureRemovable === true) repairable.push({ kind: 'drop_texture', axis: 'texture', why });
      else blockers.push(why);
    }
  }

  // 6. Scale tier, player-relative --------------------------------------------------------------------
  {
    const want = expectedTier(cand.intent ?? cand.name ?? undefined);
    if (!cand.boundsStuds) {
      push('scale_tier', 0.5, `no height was measured, so its tier against '${want.key}' (${want.tier}) is unknown`, false);
    } else {
      const height = cand.boundsStuds[1];
      const got = tierForHeight(height);
      const gap = Math.abs(TIER_ORDER.indexOf(got) - TIER_ORDER.indexOf(want.tier));
      const score = gap === 0 ? 1 : gap === 1 ? 0.45 : 0.1;
      const range = tierRange(want.tier);
      const reason = `${height.toFixed(1)} studs is ${(height / PLAYER_HEIGHT_STUDS).toFixed(2)} players tall — tier '${got}', but a '${want.key}' belongs in '${want.tier}' (${range.min.toFixed(1)}-${Number.isFinite(range.max) ? range.max.toFixed(1) : '∞'} studs)`;
      push('scale_tier', score, reason, true);
      if (gap >= 1) {
        const mid = Number.isFinite(range.max) ? (range.min + range.max) / 2 : range.min * 1.5;
        const factor = height > 0 ? mid / height : 1;
        const why = `wrong scale tier beside its neighbours: ${reason}`;
        reasons.push(why);
        // ONE tier out is a mis-set import scale and a rescale fixes it. TWO tiers out is not: a
        // uniform scale keeps the triangle count while the volume moves cubically, so blowing up a
        // 4-stud "tree" to canopy height gives canopy-sized geometry with pebble-sized detail. That
        // is the same incoherence the silhouette axis exists to catch, arrived at by another route,
        // so it is a cull rather than a patch.
        if (gap === 1 && factor >= 0.1 && factor <= 10) repairable.push({ kind: 'rescale', axis: 'scale_tier', why });
        else blockers.push(`${why}; ${gap} tiers out means it was not authored for this role at all — a ${factor.toFixed(2)}x uniform scale would carry its detail density with it and read wrong`);
      }
    }
  }

  const measuredCount = axes.filter((a) => a.measured).length;
  const confidence = axes.length ? measuredCount / axes.length : 0;
  const total = axes.reduce((a, x) => a + x.score * x.weight, 0) * 100;
  const abstained = measuredCount < 2;

  // --- verdict ---------------------------------------------------------------------------------
  // Order matters. A blocker wins over a transform, and a transform wins over a bare total, because
  // "it scored 71 but it is textured" is not a pass.
  let verdict: CoherenceVerdict['verdict'];
  let transform: AssetTransform | null = null;

  if (blockers.length) {
    verdict = 'incoherent';
  } else if (abstained) {
    verdict = 'coherent';
    reasons.push(`abstained: only ${measuredCount} of ${axes.length} axes were measured, which is too little to refuse anything on`);
  } else if (repairable.length) {
    const kinds = [...new Set(repairable.map((r) => r.kind))];
    if (kinds.length > 1) {
      verdict = 'incoherent';
      blockers.push(`needs ${kinds.length} different corrections (${kinds.join(' + ')}) — a smaller coherent palette beats a larger patched one, so this is a cull`);
    } else if (depth > 0) {
      // Inside a projection. Do not recurse again; report the state as it stands.
      verdict = 'transform';
    } else {
      transform = planTransform(kinds[0]!, repairable, cand, ctx, colours);
      verdict = transform ? 'transform' : 'incoherent';
      if (!transform) blockers.push(`a ${kinds[0]} would have been the fix, but the context offers nothing to ${kinds[0] === 'retint' ? 'retint towards' : 'rescale to'}`);
    }
  } else {
    verdict = total >= COHERENCE_FLOOR ? 'coherent' : 'incoherent';
    if (verdict === 'incoherent') {
      const worst = [...axes].sort((a, b) => a.score * a.weight - b.score * b.weight)[0];
      reasons.push(`no single axis failed outright, but the weighted total ${total.toFixed(0)} is under the ${COHERENCE_FLOOR} floor — worst axis '${worst?.axis}': ${worst?.reason}`);
    }
  }

  return {
    biome: ctx.biome,
    total,
    verdict,
    axes,
    reasons,
    blockers,
    transform,
    unrecolourable,
    confidence,
    abstained,
    contextSize: ctx.sampleSize,
  };
}

/** Build the transform and PROJECT its result by re-scoring the transformed candidate. */
function planTransform(
  kind: TransformKind,
  repairable: readonly { kind: TransformKind; axis: CoherenceAxis; why: string }[],
  cand: CoherenceCandidate,
  ctx: PaletteContext,
  colours: readonly RGB[],
): AssetTransform | null {
  const repairs = [...new Set(repairable.filter((r) => r.kind === kind).map((r) => r.axis))];
  let after: CoherenceCandidate;
  let instruction: string;
  let colour: RGB | undefined;
  let scale: number | undefined;

  if (kind === 'retint') {
    const to = chooseRetint(colours, ctx);
    if (!to) return null;
    colour = to;
    after = { ...cand, dominantColours: [to] };
    instruction = `retint every part to the approved colour rgb(${to.map((n) => Math.round(n * 255)).join(', ')}) — it is on the '${ctx.biome}' palette and clears the saturation the accepted set runs at`;
  } else if (kind === 'rescale') {
    const want = expectedTier(cand.intent ?? cand.name ?? undefined);
    const range = tierRange(want.tier);
    const height = cand.boundsStuds?.[1] ?? 0;
    if (!height) return null;
    const mid = Number.isFinite(range.max) ? (range.min + range.max) / 2 : range.min * 1.5;
    scale = mid / height;
    if (!(scale >= 0.1 && scale <= 10)) return null;
    after = {
      ...cand,
      boundsStuds: cand.boundsStuds ? [cand.boundsStuds[0] * scale, cand.boundsStuds[1] * scale, cand.boundsStuds[2] * scale] : null,
    };
    instruction = `rescale by ${scale.toFixed(2)}x to ${mid.toFixed(1)} studs, which puts a '${want.key}' back in the '${want.tier}' tier alongside its neighbours`;
  } else {
    after = { ...cand, hasTexture: false };
    instruction = 'clear the TextureID on every MeshPart so the asset is flat-shaded like the rest of the set, then retint it if it reads grey afterwards';
  }

  const projected = scoreAssetCoherence(after, ctx, 1);
  return { kind, instruction, colour, scale, repairs, projectedTotal: projected.total };
}

/**
 * "A smaller coherent asset palette is better than a larger incoherent one. Cull aggressively."
 *
 * Runs the gate across a whole accepted set and sorts it into what stays, what is fixed, and what
 * goes. The context is built from the members that come back coherent WITHOUT a transform, so the
 * standard is set by the assets that already belong rather than by the average of everything
 * present — an average that a junk drawer drags down until nothing looks out of place in it.
 */
export function cullPalette(
  members: readonly CoherenceCandidate[],
  biome: Biome,
  target: StyleTarget = BRIGHT_SIMULATOR,
): { keep: { member: CoherenceCandidate; verdict: CoherenceVerdict }[]; transform: { member: CoherenceCandidate; verdict: CoherenceVerdict }[]; drop: { member: CoherenceCandidate; verdict: CoherenceVerdict }[]; context: PaletteContext } {
  // Pass 1: judge everything against the biome profile alone, so no member can vouch for itself.
  const seedCtx = buildPaletteContext(biome, [], target);
  const seed = members.filter((m) => scoreAssetCoherence(m, seedCtx).verdict === 'coherent');
  // Pass 2: the context is the seed set — the assets that belong here on the biome's own terms.
  const context = buildPaletteContext(biome, seed.length ? seed : members, target);
  const keep: { member: CoherenceCandidate; verdict: CoherenceVerdict }[] = [];
  const transform: typeof keep = [];
  const drop: typeof keep = [];
  for (const m of members) {
    const verdict = scoreAssetCoherence(m, context);
    (verdict.verdict === 'coherent' ? keep : verdict.verdict === 'transform' ? transform : drop).push({ member: m, verdict });
  }
  return { keep, transform, drop, context };
}

/**
 * Emit the Luau that APPLIES a transform. Same fail-closed discipline as `buildNormaliseLuau`: an
 * unsafe path or an out-of-range number yields null, never best-effort code.
 */
export function buildTransformLuau(path: string, transform: AssetTransform): string | null {
  if (!isSafeLuauPath(path)) return null;
  const head = `
local ok, target = pcall(function() return ${path} end)
if not ok or typeof(target) ~= "Instance" then return '{"error":"target not found"}' end
local touched = 0
`;
  if (transform.kind === 'retint') {
    const c = transform.colour;
    if (!c || !c.every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) return null;
    return `${head}
local tint = Color3.new(${c[0].toFixed(4)}, ${c[1].toFixed(4)}, ${c[2].toFixed(4)})
local function paint(p)
  if p:IsA("BasePart") then p.Color = tint touched += 1 end
end
paint(target)
for _, d in ipairs(target:GetDescendants()) do paint(d) end
return string.format('{"kind":"retint","touched":%d}', touched)
`;
  }
  if (transform.kind === 'drop_texture') {
    return `${head}
local function strip(p)
  if p:IsA("MeshPart") then pcall(function() p.TextureID = "" end) touched += 1
  elseif p:IsA("Decal") or p:IsA("Texture") then p:Destroy() touched += 1 end
end
strip(target)
for _, d in ipairs(target:GetDescendants()) do strip(d) end
return string.format('{"kind":"drop_texture","touched":%d}', touched)
`;
  }
  const s = transform.scale;
  if (typeof s !== 'number' || !Number.isFinite(s) || s < 0.1 || s > 10) return null;
  return `${head}
if target:IsA("Model") then
  if pcall(function() target:ScaleTo(${s.toFixed(4)}) end) then touched = 1 end
end
return string.format('{"kind":"rescale","touched":%d}', touched)
`;
}

/** One-screen rendering of a coherence verdict, for a log line or a tool result. */
export function coherenceToText(v: CoherenceVerdict): string {
  const lines = [`${v.verdict.toUpperCase()} ${v.total.toFixed(0)}/100 in '${v.biome}' against ${v.contextSize} accepted asset(s) (confidence ${(v.confidence * 100).toFixed(0)}%)`];
  for (const a of v.axes) lines.push(`  ${a.axis} ${(a.score * 100).toFixed(0)} (w${a.weight}): ${a.reason}`);
  for (const b of v.blockers) lines.push(`  BLOCKER: ${b}`);
  if (v.transform) lines.push(`  TRANSFORM ${v.transform.kind}: ${v.transform.instruction} (projected ${v.transform.projectedTotal.toFixed(0)}/100)`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// The Creator Store broker — the whole pipeline, in one auditable function
//
//   describe -> search -> rank -> inspect metadata -> inspect creator -> select -> insert
//            -> inspect inserted hierarchy -> scan scripts -> remove suspicious -> normalise
//            -> coherence -> place -> verify
//
// Two things make this worth having as one function rather than as thirteen tools a model calls in
// whatever order it fancies:
//
//   1. The order is the security property. "Scan the hierarchy" after "insert" is not a suggestion;
//      an agent that inserts and then decides it is happy has already run the attacker's code. The
//      sequence is encoded here so it cannot be reordered by a prompt.
//   2. Every step records what it did, so a refusal is explainable. `BrokerResult.steps` is the
//      audit trail, and it is populated even when the run aborts on step 2.
//
// Studio is reached through an injected bridge with exactly the shape `AgentCtx` already has, so
// this composes with the existing tool dispatcher and is drivable from a fake in a test.
// ---------------------------------------------------------------------------------------------

/** Structural mirror of the op executor the agent context already exposes. */
export interface StudioBridge {
  execStudioOp(op: { op: string; [k: string]: unknown }, timeoutMs?: number): Promise<{ ok: boolean; data?: unknown; error?: string }>;
}

export const BROKER_STEPS = [
  'describe',
  'search',
  'rank',
  'inspect_metadata',
  'inspect_creator',
  'select',
  'insert',
  'inspect_hierarchy',
  'scan_scripts',
  'remove_suspicious',
  'normalise',
  'coherence',
  'place',
  'verify',
] as const;
export type BrokerStep = (typeof BROKER_STEPS)[number];

export interface BrokerStepRecord {
  step: BrokerStep;
  ok: boolean;
  /** One line, safe to show a user. Never contains a key, a URL with credentials, or a raw source. */
  detail: string;
}

export interface AssetRequest {
  /** Free text: what the scene needs, in the user's words. */
  description: string;
  /** Which row of the decision table this is. Inferred from the description when omitted. */
  need?: AssetNeed;
  /** What the thing is meant to BE, e.g. "chair". Drives the scale envelope and the style score. */
  intent?: string;
  /** Where it goes. Defaults to game.Workspace. */
  parent?: string;
  /** Where to stand it, in studs. Applied as a pivot during normalisation. */
  position?: readonly [number, number, number];
  /** Remaining triangle budget for the scene. */
  maxTriangles?: number;
}

export interface BrokerOptions extends SearchOptions, VerifyOptions {
  /** Art direction to rank against. Defaults to the calibrated bright-simulator target. */
  target?: StyleTarget;
  /**
   * The palette this asset is joining. Supplying it turns the post-insertion coherence gate from an
   * abstention into a real refusal, so a caller building a map should always pass it — rebuilt from
   * the assets already placed, not cached from the start of the run.
   */
  palette?: PaletteContext;
  /** Apply the gate's transform (retint/rescale/drop texture) rather than only reporting it. */
  applyTransform?: boolean;
  /** Candidates taken past ranking into the (network-bound) metadata gate. */
  maxCandidates?: number;
  /** Weighted style score a candidate must reach to be selected. */
  minStyleTotal?: number;
  /** Stop after `select`. Used to exercise the choosing half without touching a place. */
  dryRun?: boolean;
}

export interface BrokerResult {
  ok: boolean;
  query: string;
  need: AssetNeed;
  intent: string;
  steps: BrokerStepRecord[];
  /** Every candidate that reached the metadata gate, with both verdicts. */
  considered: { assetId: number; name: string | null; verdict: AssetVerdictCode; style: StyleScore | null }[];
  chosen: { assetId: number; name: string | null; verdict: AssetVerdict; style: StyleScore } | null;
  creator: CreatorInspection | null;
  insertedPaths: string[];
  scan: HierarchyScan | null;
  removed: string[];
  normalisation: NormaliseOutcome | null;
  /** The post-insertion coherence verdict: does this belong with what is already here? */
  coherence: CoherenceVerdict | null;
  /** The transform the gate applied in place, if any. */
  transformApplied: AssetTransform | null;
  /** Populated when the run stopped early: the step that refused, and why. */
  aborted: { step: BrokerStep; reason: string } | null;
  /** One-screen rendering of the whole run. */
  summary: string;
}

// --- creator inspection ------------------------------------------------------------------------

export type CreatorTrust = 'roblox' | 'verified' | 'endorsed' | 'untrusted';

export interface CreatorInspection {
  id: number | null;
  name: string | null;
  trust: CreatorTrust;
  /** Whether this creator may supply an auto-inserted asset at all. */
  acceptable: boolean;
  reasons: string[];
}

/**
 * Judge the creator, from the details response already fetched.
 *
 * Deliberately NOT a second network call: Roblox exposes no endpoint that answers "is this creator
 * trustworthy", and the three facts that are actually load-bearing — is it Roblox itself, is the
 * creator verified, is the asset endorsed — all arrive with the asset. An extra request would buy
 * a follower count, which is not evidence of anything.
 */
export function inspectCreator(verdict: AssetVerdict): CreatorInspection {
  const { id, name, isVerifiedCreator } = verdict.creator;
  const reasons: string[] = [];
  let trust: CreatorTrust;
  if (id === 1) {
    trust = 'roblox';
    reasons.push('authored by Roblox itself — the only creator that is trusted by construction');
  } else if (isVerifiedCreator) {
    trust = 'verified';
    reasons.push(`creator ${name ?? id ?? 'unknown'} carries Roblox's verified badge`);
  } else if (verdict.isEndorsed) {
    trust = 'endorsed';
    reasons.push('asset is endorsed by Roblox even though its creator is not verified');
  } else {
    trust = 'untrusted';
    reasons.push(`creator ${name ?? id ?? 'unknown'} is neither verified nor endorsed — refused for auto-insertion`);
  }
  if (trust !== 'roblox' && (verdict.voteCount ?? 0) > 0) {
    reasons.push(`community signal: ${verdict.upVotePercent ?? 0}% approval across ${verdict.voteCount ?? 0} votes`);
  }
  return { id, name, trust, acceptable: trust !== 'untrusted', reasons };
}

// --- describe ----------------------------------------------------------------------------------

const FILLER = new Set([
  'a', 'an', 'the', 'some', 'any', 'please', 'can', 'you', 'i', 'we', 'need', 'want', 'get', 'find', 'me', 'for', 'my', 'our',
  'with', 'and', 'or', 'that', 'this', 'it', 'is', 'are', 'to', 'of', 'in', 'on', 'add', 'put', 'make', 'build', 'nice', 'good',
]);

/** Keyword → decision-table row. Only the rows a Creator Store search can plausibly serve. */
const NEED_WORDS: readonly (readonly [RegExp, AssetNeed])[] = [
  [/\b(tree|trees|bush|shrub|foliage|plant|grass|fern|palm)\b/i, 'foliage'],
  [/\b(car|truck|vehicle|bike|boat|plane)\b/i, 'vehicle'],
  [/\b(npc|character|avatar|person|villager)\b/i, 'character'],
  [/\b(house|building|shop|tower|castle|hut)\b/i, 'building'],
  [/\b(icon|button|badge|ui)\b/i, 'ui_icon'],
  [/\b(texture|material|surface)\b/i, 'texture'],
  [/\b(ground|terrain|floor|path)\b/i, 'ground'],
  [/\b(particle|smoke|fire|credit)\b/i, 'particle'],
];

export interface AssetDescription {
  /** The search term, filler removed. */
  query: string;
  need: AssetNeed;
  intent: string;
  /** Which search category the need maps onto. */
  category: SearchCategory;
}

/**
 * Turn a request in the user's words into the three things the rest of the pipeline needs. Pure and
 * deterministic — a model is not asked to invent a search term, because a model asked for a search
 * term will happily invent an asset id alongside it.
 */
export function describeAssetRequest(req: AssetRequest): AssetDescription {
  const words = req.description
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !FILLER.has(w));
  const query = (words.join(' ') || req.description.trim()).slice(0, 80);
  const need = req.need ?? NEED_WORDS.find(([re]) => re.test(req.description))?.[1] ?? 'prop';
  const intent = req.intent ?? scaleRuleFor(words[0] ?? req.description).key;
  return { query, need, intent, category: need === 'ui_icon' || need === 'texture' || need === 'particle' ? 'decal' : 'mesh' };
}

// --- normalisation -----------------------------------------------------------------------------

/**
 * Paths safe to interpolate into Luau source.
 *
 * The path comes from the plugin's own `Paths.fullPath()`, not from a model — but it travels
 * through a model's transcript on the way here, and this string is pasted into code that runs in
 * the user's Studio. So it is validated against a shape that cannot escape an expression: bare
 * identifiers, or bracketed names with no quote, backslash, bracket or newline in them. Anything
 * else fails closed and normalisation is reported as not applied.
 */
const SAFE_LUAU_PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*|\["[A-Za-z0-9 _'()-]+"\])*$/;

export function isSafeLuauPath(path: string): boolean {
  return path.length > 0 && path.length <= 400 && SAFE_LUAU_PATH.test(path);
}

export interface NormalisePlan {
  path: string;
  /** Uniform scale to apply. 1 when the asset is already the right size. */
  scale: number;
  /** Pivot target in studs, or null to leave it where it landed. */
  position: readonly [number, number, number] | null;
  /** Why the scale is what it is — the scale-envelope reasons, so the number is never bare. */
  reasons: string[];
}

/**
 * Emit the Luau that normalises one inserted asset: anchor every part, apply a uniform scale, pivot
 * it into place, and report the resulting bounding box. One `run_code` round trip rather than a
 * `set_props` per part, matching how `LAYOUT_LUAU` and `CENSUS_LUAU` already talk to the plugin.
 *
 * Returns null when the path is not safe to interpolate — fail closed, never "best effort".
 */
export function buildNormaliseLuau(plan: NormalisePlan): string | null {
  if (!isSafeLuauPath(plan.path)) return null;
  if (!Number.isFinite(plan.scale) || plan.scale <= 0 || plan.scale > 100) return null;
  const pos = plan.position;
  if (pos && !pos.every((n) => Number.isFinite(n) && Math.abs(n) < 1e6)) return null;
  const scale = plan.scale.toFixed(4);
  const pivot = pos
    ? `if target:IsA("PVInstance") then pcall(function() target:PivotTo(CFrame.new(${pos[0].toFixed(3)}, ${pos[1].toFixed(3)}, ${pos[2].toFixed(3)})) end) end`
    : '';
  return `
local ok, target = pcall(function() return ${plan.path} end)
if not ok or typeof(target) ~= "Instance" then return '{"error":"target not found"}' end
local anchored = 0
-- Colour is sampled here, in the pass that is already walking every part, because the coherence
-- gate downstream is worthless without it: unmeasured colour scores 0.5 and can never refuse the
-- grey unstyled prop it exists to catch. Weighted by volume so a big painted body outranks a bolt.
local swatch = {}
local swatchOrder = {}
local function fix(p)
  if p:IsA("BasePart") then
    p.Anchored = true
    anchored += 1
    local c = p.Color
    local key = string.format("%.3f,%.3f,%.3f", c.R, c.G, c.B)
    if swatch[key] == nil then swatch[key] = 0 table.insert(swatchOrder, key) end
    swatch[key] = swatch[key] + math.max(p.Size.X * p.Size.Y * p.Size.Z, 0.001)
  end
end
fix(target)
for _, d in ipairs(target:GetDescendants()) do fix(d) end
table.sort(swatchOrder, function(a, b) return swatch[a] > swatch[b] end)
local swatches = {}
for i = 1, math.min(3, #swatchOrder) do table.insert(swatches, "[" .. swatchOrder[i] .. "]") end
local colours = "[" .. table.concat(swatches, ",") .. "]"
local scaled = 0
if target:IsA("Model") and ${scale} ~= 1 then
  if pcall(function() target:ScaleTo(${scale}) end) then scaled = ${scale} end
end
${pivot}
local cf, size
if target:IsA("Model") then
  cf, size = target:GetBoundingBox()
elseif target:IsA("BasePart") then
  cf, size = target.CFrame, target.Size
else
  return '{"error":"target is not spatial"}'
end
return string.format('{"anchored":%d,"scaled":%.4f,"size":[%.3f,%.3f,%.3f],"pos":[%.3f,%.3f,%.3f],"colours":%s}',
  anchored, scaled, size.X, size.Y, size.Z, cf.Position.X, cf.Position.Y, cf.Position.Z, colours)
`;
}

export interface NormaliseOutcome {
  applied: boolean;
  anchored: number;
  scaled: number;
  size: [number, number, number] | null;
  position: [number, number, number] | null;
  /** Dominant part colours, volume-weighted, as measured in the place. Empty when none was read. */
  colours: RGB[];
  plan: NormalisePlan;
  note: string;
}

/** Read the normalisation report back out of whatever wrapper `run_code` returned it in. */
export function parseNormaliseResult(raw: unknown): { anchored: number; scaled: number; size: [number, number, number] | null; position: [number, number, number] | null; colours: RGB[] } | null {
  let value: unknown = raw;
  for (let i = 0; i < 6; i++) {
    if (!value || typeof value !== 'object') break;
    const o = value as Record<string, unknown>;
    if ('result' in o) { value = o.result; continue; }
    if ('t' in o && 'v' in o) { value = o.v; continue; }
    if ('data' in o) { value = o.data; continue; }
    break;
  }
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return null; }
  }
  const o = obj(value);
  if (typeof o.error === 'string') return null;
  const triple = (v: unknown): [number, number, number] | null =>
    Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number') ? [v[0] as number, v[1] as number, v[2] as number] : null;
  const anchored = num(o.anchored);
  if (anchored === null) return null;
  const colours = (Array.isArray(o.colours) ? o.colours : []).map(triple).filter((c): c is [number, number, number] => c !== null);
  return { anchored, scaled: num(o.scaled) ?? 0, size: triple(o.size), position: triple(o.pos), colours };
}

// --- hierarchy reading -------------------------------------------------------------------------

interface TreeSummary {
  classes: string[];
  /** Bounding box across every BasePart the tree reported, or null when none carried geometry. */
  bounds: [number, number, number] | null;
  nodeCount: number;
  truncated: boolean;
}

/**
 * Flatten a `get_tree` payload into the two things the safety and style layers need: every class
 * name present, and the overall bounding box. `truncated` matters — a tree that hit its node cap is
 * a tree whose remaining contents are unknown, and unknown contents are never scored as clean.
 */
export function summariseTree(data: unknown): TreeSummary {
  const classes: string[] = [];
  let truncated = false;
  let nodeCount = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  const visit = (node: unknown, depth: number): void => {
    if (depth > 32) { truncated = true; return; }
    const n = obj(node);
    const cls = str(n.class);
    if (cls) classes.push(cls);
    nodeCount += 1;
    if (n.truncated === true || num(n.moreChildren) !== null) truncated = true;
    const pos = Array.isArray(n.pos) ? (n.pos as unknown[]) : null;
    const size = Array.isArray(n.size) ? (n.size as unknown[]) : null;
    if (pos && size && pos.length === 3 && size.length === 3) {
      const p = pos.map((v) => (typeof v === 'number' ? v : 0));
      const s = size.map((v) => (typeof v === 'number' ? v : 0));
      minX = Math.min(minX, p[0]! - s[0]! / 2); maxX = Math.max(maxX, p[0]! + s[0]! / 2);
      minY = Math.min(minY, p[1]! - s[1]! / 2); maxY = Math.max(maxY, p[1]! + s[1]! / 2);
      minZ = Math.min(minZ, p[2]! - s[2]! / 2); maxZ = Math.max(maxZ, p[2]! + s[2]! / 2);
    }
    const kids = n.children;
    if (Array.isArray(kids)) for (const k of kids) visit(k, depth + 1);
  };

  const root = obj(data);
  if (root.root !== undefined) visit(root.root, 0);
  else if (Array.isArray(root.services)) for (const s of root.services) visit(s, 0);
  else visit(data, 0);

  const bounds: [number, number, number] | null =
    Number.isFinite(minX) && Number.isFinite(maxX) ? [Math.max(0, maxX - minX), Math.max(0, maxY - minY), Math.max(0, maxZ - minZ)] : null;
  return { classes, bounds, nodeCount, truncated };
}

/** Pull `{ scripts: [{ path, class }] }` out of a `list_scripts` result, defensively. */
function scriptsFrom(data: unknown): { path: string; className: string }[] {
  const rows = obj(data).scripts;
  if (!Array.isArray(rows)) return [];
  const out: { path: string; className: string }[] = [];
  for (const r of rows) {
    const o = obj(r);
    const path = str(o.path);
    if (path) out.push({ path, className: str(o.class) ?? 'Script' });
  }
  return out;
}

// --- the pipeline ------------------------------------------------------------------------------

/**
 * Run the whole broker. Never throws: every failure is a recorded, explained refusal, because a
 * broker that throws is a broker whose audit trail stops at the interesting moment.
 */
export async function brokerAsset(env: AssetEnv, request: AssetRequest, bridge: StudioBridge, opts: BrokerOptions = {}): Promise<BrokerResult> {
  const target = opts.target ?? BRIGHT_SIMULATOR;
  const maxCandidates = Math.max(1, Math.min(8, opts.maxCandidates ?? 4));
  const minStyleTotal = opts.minStyleTotal ?? 55;
  const parent = request.parent ?? 'game.Workspace';

  const desc = describeAssetRequest(request);
  const steps: BrokerStepRecord[] = [];
  const considered: BrokerResult['considered'] = [];
  const result: BrokerResult = {
    ok: false,
    query: desc.query,
    need: desc.need,
    intent: desc.intent,
    steps,
    considered,
    chosen: null,
    creator: null,
    insertedPaths: [],
    scan: null,
    removed: [],
    normalisation: null,
    coherence: null,
    transformApplied: null,
    aborted: null,
    summary: '',
  };
  const step = (s: BrokerStep, ok: boolean, detail: string) => { steps.push({ step: s, ok, detail }); };
  const abort = (s: BrokerStep, reason: string): BrokerResult => {
    step(s, false, reason);
    result.aborted = { step: s, reason };
    result.summary = brokerSummary(result);
    return result;
  };

  step('describe', true, `'${request.description}' -> need=${desc.need}, intent=${desc.intent}, query='${desc.query}'`);

  // The decision table gets the last word on whether the Creator Store is even an option for this
  // need. Buildings and characters are absent from it on purpose; going anyway would silently undo
  // the reasoning in DECISION_TABLE.
  const sources = chooseAssetSource(desc.need).map((c) => c.source);
  if (!sources.includes('creator_store')) {
    return abort('describe', `the decision table does not list creator_store for '${desc.need}' — prefer ${sources[0]} (${chooseAssetSource(desc.need)[0]?.rationale ?? ''})`);
  }

  const search = await searchCreatorStore(env, desc.query, {
    ...opts,
    category: desc.category,
    limit: Math.max(maxCandidates * 3, 12),
    robloxOnly: desc.need === 'foliage' ? true : opts.robloxOnly,
  });
  if (!search.results.length) {
    return abort('search', search.error ? `${search.note} ${search.error}` : search.note);
  }
  step('search', true, `${search.results.length} hit(s) via the ${search.endpoint} endpoint. ${search.note}`);

  // Ranking here is a PREFILTER on name and tags alone — nothing else is known before the metadata
  // call. It exists to order the (network-bound, rate-limited) gate, not to pick a winner.
  const ranked = rankAssetsByStyle(
    search.results.map((h) => ({ assetId: h.assetId, name: h.name, intent: desc.intent })),
    target,
  );
  step('rank', true, `ordered ${ranked.length} candidate(s) on name/tag signals only; real scoring happens after the metadata call`);

  let chosen: BrokerResult['chosen'] = null;
  let creator: CreatorInspection | null = null;
  for (const r of ranked.slice(0, maxCandidates)) {
    const assetId = r.candidate.assetId;
    if (typeof assetId !== 'number') continue;
    const verdict = await verifyCreatorStoreAsset(env, assetId, {
      ...opts,
      provenance: 'search_result',
      maxTriangles: request.maxTriangles ?? opts.maxTriangles,
    });
    if (!verdict.ok) {
      considered.push({ assetId, name: verdict.name, verdict: verdict.verdict, style: null });
      continue;
    }
    const inspection = inspectCreator(verdict);
    if (!inspection.acceptable) {
      considered.push({ assetId, name: verdict.name, verdict: 'fail_unverified_creator', style: null });
      continue;
    }
    // Now the style score means something: triangles are measured, and the type is known.
    const style = scoreAssetStyle(
      {
        assetId,
        name: verdict.name,
        triangles: verdict.triangles,
        vertices: verdict.vertices,
        hasTexture: verdict.assetType === 'Image' || verdict.assetType === 'Decal' ? true : null,
        intent: desc.intent,
      },
      target,
    );
    considered.push({ assetId, name: verdict.name, verdict: verdict.verdict, style });
    if (styleGateBlocks(style).length || style.total < minStyleTotal) continue;
    chosen = { assetId, name: verdict.name, verdict, style };
    creator = inspection;
    break;
  }

  step('inspect_metadata', considered.length > 0, `${considered.length} candidate(s) went through the full verification gate`);
  if (!chosen || !creator) {
    const why = considered.map((c) => `${c.assetId}: ${c.verdict}${c.style ? ` / style ${c.style.total.toFixed(0)}${c.style.hardFails.length ? ` (${c.style.hardFails[0]})` : ''}` : ''}`);
    return abort('select', `no candidate passed both the safety gate and the style gate. ${why.join('; ')}`);
  }
  result.chosen = chosen;
  result.creator = creator;
  step('inspect_creator', true, `${creator.trust}: ${creator.reasons.join('; ')}`);
  step('select', true, `asset ${chosen.assetId} (${chosen.name ?? 'unnamed'}), style ${chosen.style.total.toFixed(0)}/100 — ${chosen.style.verdict}`);

  if (opts.dryRun) {
    result.ok = true;
    result.summary = brokerSummary(result);
    return result;
  }

  // --- insert ---------------------------------------------------------------------------------
  const inserted = await bridge.execStudioOp({ op: 'insert_asset', assetId: chosen.assetId, parent }, 45_000);
  if (!inserted.ok) return abort('insert', inserted.error ?? 'insert_asset failed');
  const paths = (Array.isArray(obj(inserted.data).inserted) ? (obj(inserted.data).inserted as unknown[]) : []).filter((p): p is string => typeof p === 'string');
  if (!paths.length) return abort('insert', 'the asset inserted nothing — GetObjects returned an empty array');
  result.insertedPaths = paths;
  step('insert', true, `inserted at ${paths.join(', ')}`);

  const discard = async (why: string, s: BrokerStep): Promise<BrokerResult> => {
    const del = await bridge.execStudioOp({ op: 'delete_instances', paths }, 20_000);
    return abort(s, `${why} — the asset was ${del.ok ? 'deleted' : `NOT deleted (${del.error ?? 'delete failed'}); remove ${paths.join(', ')} by hand`}`);
  };

  // --- inspect the inserted hierarchy ----------------------------------------------------------
  const classes: string[] = [];
  let treeBounds: [number, number, number] | null = null;
  let enumerationFailed = false;
  for (const p of paths) {
    const tree = await bridge.execStudioOp({ op: 'get_tree', root: p, maxDepth: 12, maxNodes: 400 }, 20_000);
    if (!tree.ok) { enumerationFailed = true; continue; }
    const sum = summariseTree(tree.data);
    classes.push(...sum.classes);
    if (sum.truncated) enumerationFailed = true;
    if (sum.bounds && !treeBounds) treeBounds = sum.bounds;
  }
  step('inspect_hierarchy', !enumerationFailed, enumerationFailed ? 'the subtree could not be fully enumerated — its contents are unknown' : `${classes.length} instance(s), classes: ${[...new Set(classes)].slice(0, 12).join(', ')}`);

  // --- scan scripts ----------------------------------------------------------------------------
  const scriptInputs: ScannedScriptInput[] = [];
  for (const p of paths) {
    const listed = await bridge.execStudioOp({ op: 'list_scripts', root: p }, 20_000);
    if (!listed.ok) { enumerationFailed = true; continue; }
    for (const s of scriptsFrom(listed.data)) {
      if (scriptInputs.length >= SCAN_LIMITS.maxScripts) break;
      const read = await bridge.execStudioOp({ op: 'read_script', path: s.path }, 20_000);
      const source = read.ok ? str(obj(read.data).source) : null;
      scriptInputs.push({ path: s.path, className: s.className, source });
    }
  }
  const scan = scanInsertedHierarchy({ rootPath: paths[0]!, scripts: scriptInputs, instanceClasses: classes, enumerationFailed });
  result.scan = scan;
  step('scan_scripts', scan.verdict !== 'reject', `${scan.verdict}: ${scan.scriptCount} script(s), worst severity ${scan.severity}`);

  if (scan.verdict === 'reject') {
    return discard(`the safety scan rejected this asset (${scan.reasons[0] ?? 'critical finding'})`, 'scan_scripts');
  }

  // --- remove suspicious ------------------------------------------------------------------------
  if (scan.removePaths.length) {
    const del = await bridge.execStudioOp({ op: 'delete_instances', paths: scan.removePaths }, 20_000);
    if (!del.ok) return discard(`could not delete ${scan.removePaths.length} script(s) the scan condemned`, 'remove_suspicious');
    result.removed = scan.removePaths.slice();
    step('remove_suspicious', true, `deleted ${scan.removePaths.length} script(s): ${scan.removePaths.join(', ')}`);
  } else {
    step('remove_suspicious', true, 'nothing to remove');
  }

  // --- normalise --------------------------------------------------------------------------------
  const primary = paths[0]!;
  const scaleCheck = treeBounds ? checkScale(desc.intent, treeBounds) : null;
  const plan: NormalisePlan = {
    path: primary,
    scale: scaleCheck && !scaleCheck.ok ? scaleCheck.suggestedScale : 1,
    position: request.position ?? null,
    reasons: scaleCheck?.reasons ?? ['no bounding box was measured, so the asset is left at its authored scale'],
  };
  const luau = buildNormaliseLuau(plan);
  if (!luau) {
    result.normalisation = { applied: false, anchored: 0, scaled: 0, size: treeBounds, position: null, colours: [], plan, note: `the inserted path is not safe to interpolate into Luau (${primary}), so normalisation was not applied` };
    step('normalise', false, result.normalisation.note);
  } else {
    const ran = await bridge.execStudioOp({ op: 'run_code', code: luau }, 20_000);
    const parsed = ran.ok ? parseNormaliseResult(ran.data) : null;
    result.normalisation = parsed
      ? { applied: true, anchored: parsed.anchored, scaled: parsed.scaled, size: parsed.size, position: parsed.position, colours: parsed.colours, plan, note: plan.reasons.join('; ') }
      : { applied: false, anchored: 0, scaled: 0, size: treeBounds, position: null, colours: [], plan, note: ran.error ?? 'the normalisation snippet returned nothing readable' };
    step('normalise', result.normalisation.applied, result.normalisation.applied ? `anchored ${result.normalisation.anchored} part(s), scale ${plan.scale.toFixed(2)}` : result.normalisation.note);
  }

  // --- coherence ----------------------------------------------------------------------------------
  // The gate the rejected map did not have. Everything above proved this asset is SAFE and that it
  // matches the style spec in the abstract; this asks the only question a player-eye camera actually
  // answers, which is whether it belongs beside the things already standing here. It runs after
  // normalisation because that is the first moment the asset's real colours and real size are known.
  {
    const measuredSize = result.normalisation?.size ?? treeBounds;
    const ctx = opts.palette ?? buildPaletteContext('meadow', [], target);
    const coherence = scoreAssetCoherence(
      {
        assetId: chosen.assetId,
        name: chosen.name,
        triangles: chosen.verdict.triangles,
        hasTexture: chosen.verdict.assetType === 'Image' || chosen.verdict.assetType === 'Decal' ? true : null,
        dominantColours: result.normalisation?.colours ?? [],
        boundsStuds: measuredSize,
        intent: desc.intent,
      },
      ctx,
    );
    result.coherence = coherence;
    if (coherence.verdict === 'incoherent') {
      return discard(`the coherence gate refused it: ${coherence.blockers[0] ?? coherence.reasons[0] ?? 'it does not belong with the assets already accepted'}`, 'coherence');
    }
    if (coherence.verdict === 'transform' && coherence.transform && opts.applyTransform) {
      const code = buildTransformLuau(primary, coherence.transform);
      const ran = code ? await bridge.execStudioOp({ op: 'run_code', code }, 20_000) : { ok: false, error: 'the transform could not be expressed as safe Luau' };
      if (ran.ok) result.transformApplied = coherence.transform;
      step('coherence', ran.ok, ran.ok
        ? `${coherence.total.toFixed(0)}/100 — applied ${coherence.transform.kind}: ${coherence.transform.instruction} (projected ${coherence.transform.projectedTotal.toFixed(0)}/100)`
        : `${coherence.total.toFixed(0)}/100 — the ${coherence.transform.kind} was NOT applied (${ran.error ?? 'run_code failed'}); the asset stands as inserted`);
    } else {
      step('coherence', true, coherence.verdict === 'transform' && coherence.transform
        ? `${coherence.total.toFixed(0)}/100 — needs a ${coherence.transform.kind}: ${coherence.transform.instruction}`
        : `${coherence.total.toFixed(0)}/100 in '${ctx.biome}' against ${ctx.sampleSize} accepted asset(s)${coherence.abstained ? ' — abstained, too little measured to refuse on' : ''}`);
    }
  }

  // --- place -------------------------------------------------------------------------------------
  const misplaced = paths.filter((p) => !p.startsWith(parent));
  step('place', misplaced.length === 0, misplaced.length ? `inserted outside the requested parent: ${misplaced.join(', ')}` : `sits under ${parent}${request.position ? ` at ${request.position.join(', ')}` : ''}`);

  // --- verify -------------------------------------------------------------------------------------
  // Re-read the scripts rather than trusting the delete. This is the only step that can prove the
  // place is clean, and it is proof about the place, not about our own bookkeeping.
  const leftover: string[] = [];
  for (const p of paths) {
    const listed = await bridge.execStudioOp({ op: 'list_scripts', root: p }, 20_000);
    if (!listed.ok) return discard('the post-removal script listing failed, so the place cannot be proven clean', 'verify');
    leftover.push(...scriptsFrom(listed.data).map((s) => s.path));
  }
  if (leftover.length) {
    return discard(`${leftover.length} script(s) survived removal: ${leftover.join(', ')}`, 'verify');
  }
  const finalSize = result.normalisation?.size ?? treeBounds;
  const finalScale = finalSize ? checkScale(desc.intent, finalSize) : null;
  step('verify', true, `zero scripts remain under ${paths.join(', ')}${finalScale ? `; scale ${finalScale.ok ? 'plausible' : `still off (${finalScale.reasons[0]})`} for a '${finalScale.ruleKey}'` : ''}`);

  result.ok = true;
  result.summary = brokerSummary(result);
  return result;
}

/** One-screen rendering of a broker run, for a log line or a tool result. */
export function brokerSummary(r: BrokerResult): string {
  const head = r.ok
    ? `OK — asset ${r.chosen?.assetId ?? '?'} (${r.chosen?.name ?? 'unnamed'}) placed for '${r.query}'`
    : `REFUSED at ${r.aborted?.step ?? 'unknown'} — ${r.aborted?.reason ?? 'no reason recorded'}`;
  const lines = [head];
  for (const s of r.steps) lines.push(`  ${s.ok ? 'ok  ' : 'FAIL'} ${s.step}: ${s.detail}`);
  if (r.scan) lines.push(scanToText(r.scan));
  if (r.coherence) lines.push(coherenceToText(r.coherence));
  return lines.join('\n');
}
