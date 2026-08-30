// Asset strategy brain: WHERE a piece of a scene should come from, and whether a Creator Store
// asset id is safe to touch.
//
// Two jobs, both of which exist because the naive answer is wrong:
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
      fail(
        'fail_wrong_type',
        `asset is a ${REFUSED_ASSET_TYPES[v.assetTypeId]} (typeId ${v.assetTypeId}) — Models are not Open Use and can contain scripts; use the Mesh (40) or Image (1) instead`,
      );
    } else if (!ACCEPTABLE_ASSET_TYPES[v.assetTypeId]) {
      fail('fail_wrong_type', `asset typeId ${v.assetTypeId} is not on the allowlist (${Object.values(ACCEPTABLE_ASSET_TYPES).join(', ')})`);
    } else if (opts.expectType && v.assetType !== opts.expectType) {
      fail('fail_wrong_type', `asked for a ${opts.expectType} but the id resolves to a ${v.assetType}`);
    }
    // 4. Free.
    if (!v.isFree) fail('fail_not_free', 'asset is not free (fiatProduct.isFree is not true)');
    else if (!v.purchasable) fail('fail_not_free', 'asset is free but not purchasable — it cannot be acquired');
    // 5. Publicly visible.
    if (v.visibilityStatus !== null && v.visibilityStatus !== 1) fail('fail_moderated', `asset visibilityStatus is ${v.visibilityStatus}, expected 1 (public)`);
    // 6. Trusted creator: Roblox itself, a verified creator, or an endorsed asset.
    const robloxAuthored = v.creator.id === 1;
    if (!robloxAuthored && !v.creator.isVerifiedCreator && !v.isEndorsed) {
      fail('fail_unverified_creator', `creator ${v.creator.name ?? v.creator.id ?? 'unknown'} is not verified and the asset is not endorsed`);
    }
    // 7. Community signal, skipped for Roblox-authored assets which have no meaningful votes.
    const minPct = opts.minUpVotePercent ?? 70;
    const minVotes = opts.minVoteCount ?? 20;
    if (!robloxAuthored && (v.upVotePercent ?? 0) < minPct) {
      fail('fail_low_rating', `upVotePercent ${v.upVotePercent ?? 0} is below ${minPct}`);
    } else if (!robloxAuthored && (v.voteCount ?? 0) < minVotes) {
      fail('fail_low_rating', `only ${v.voteCount ?? 0} votes, below the ${minVotes} needed for the rating to mean anything`);
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
