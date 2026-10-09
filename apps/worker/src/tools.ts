// Agent tool definitions + dispatcher. Tools either talk to Studio (via the session DO's
// op queue) or run worker-side (docs search, memory, checkpoints).
import { searchLibraryCode, insertPlan, aliasFor, treeOps, header, audit } from './library-code';
import { searchLibrarySkills, readLibrarySkill, LIBRARY_SKILL_PREFIX } from './library-skills';
import { embed, release as releaseImageBudget, reserve as reserveImageBudget, settle as settleImageBudget } from './gateway';
import { encodeRgbaPng, finishImage, IMAGE_KINDS, planImage, suggestSlice, toBase64, type ImageKind } from './image-gen';
import { uploadToOwnRoblox } from './own-upload';
import { IMAGE_MODEL, imageNeurons } from './pricing';
import { previewLibraryModels } from './library-object';
import { dressObject } from './dress-object';
import { expandTerrainRecipe, TERRAIN_RECIPES } from './terrain-recipes';
import type { Env } from './env';
import { generatedImageCapacity, saveGeneratedImage } from './generated-images';
import { decodeRgbBase64, encodePng, bytesToBase64 } from './png';
import { retryHint, remedyHint, retryEligibility } from './op-failure';
import { planCopyRounds } from './dup-names';
import { VERIFIER_TOOLS, APPENDED_VERIFIER_PREFERENCE, PLANNER_TOOL } from './verifiers';
import { normaliseItems, normaliseProps, describeRefusals, createLimitIssues, planCreateBatches, normaliseStudioPaths } from './studio-props';
import type { GatewayToolDef, StudioOp, OpResult, CheckpointMeta, RenderViewResult, StudioFrame, AssetSourcePolicy, InstanceSpec, PropValue } from '@studpilot/shared';
import { RENDER_VIEWS, phaseForTool } from '@studpilot/shared';
import { searchDocsDetailed } from './rag';
import { allowedSources, sourceRefusal, provenanceRefusal } from './asset-policy';
import {
  chooseAssetSource,
  verifyCreatorStoreAsset,
  findVerifiedAssets,
  scanInsertedHierarchy,
  summariseTree,
  appendStudioPath,
  SCAN_LIMITS,
  type AssetNeed,
  type AssetProvenanceSource,
  type FetchLike,
  type HttpResponseLike,
  type ScannedScriptInput,
} from './assets';
import { GENRE_KIT_IDS, getGenreKit, admitToKit } from './genre-kits';
import { getGenreReferenceGuide, GENRE_REFERENCE_GUIDE_ASPECT_IDS } from './genre-reference-guide';
import { getUIConstruction, UI_CONSTRUCTION_GENRE_IDS, UI_CONSTRUCTION_SCREEN_IDS } from './ui-construction-guide';
import { askVerifiedModule, VERIFIED_MODULE_COUNT } from './verified-modules';
import {
  applyEdits,
  checkSyntax,
  describeSyntax,
  diffHunks,
  diffStat,
  formatScript,
  reviewPlace,
  reviewScript,
  sourceHash,
  symbolLookup,
  symbolSearch,
  symbolsInFile,
  type ScriptFile,
} from './luau-review';
import { propertyChangeGroups } from './property-diff';
import { parseCensus, destructiveDelta, needsProtection, summarisePlayCheck } from './playtest';
import { countConsole, parseLogEntries } from './playtest-stream';
import { PLAYTEST_FRAME_MIN_INTERVAL_MS } from './frame-bus';
import { compositionHardFails, structureFromLayout, structureLine, compositionMetrics } from './composition';
import {
  ROBLOX_IMAGE_SPECS,
  THUMBNAIL_UPLOAD,
  captureSizeFor,
  chooseFraming,
  isFramableView,
  publishSteps,
  shortfallAgainst,
  thumbnailPanel,
  type FramingInput,
  type ThumbnailKind,
} from './thumbnail';
import { semanticCheck, semanticLine } from './semantic';
import { generateImage, storeImage, imagePanel, imagePathFor, composeArtDirection, type ImageRequest, type PaletteRole } from './imagegen';
import { generateImage as hfGenerateImage, isHfConfigured, HF_IMAGE_MODEL } from './hf';
import { findUiAssets, uploadLibraryAsset } from './asset-library';
import { findUiStoreImages, UI_STORE_COUNT, UI_STORE_GENRES } from './ui-store-search';
import { refuseLibraryItems, refuseLibraryLuau } from './library-guard';
import { refuseGameScript, sourcesIn } from './game-independence';
import { orderApplies, refuseGeneratedModel, refuseHandMadeModel, refuseHandMadeModelLuau, refuseNewHandMadeModelLuau, type LibraryOrder } from './model-rule';
import { noteInsert, noteSearch, notePlaced, type LibraryRun } from './library-run';
import { footprintRadius } from './library-placement';
import { planCopies } from './placement';
import { applyOrigin, readOrigin, sharedParent } from './local-space';
import { expandTerrainPath, TERRAIN_PATH_OP_CAP } from './terrain-path';
import { insertUiComponent, refuseUiLook, uiImageResolver, UI_RULE, isEmptyScreenGuiHost } from './ui-components';
import { FX_RULE, findSound, findVfxTool, insertSound, insertVfx, playLibrarySound, refuseSoundId } from './fx-library';
import { findLibraryModels, libraryAdvice, libraryModel, LIBRARY_GENRES, LIBRARY_KINDS, placeInserted, type LibraryModel } from './model-library';
import { sourcesIn as runSourcesIn } from './sources';
import { buildObject } from './object-tool';
import { animateModel } from './animate-tool';
import { addBehaviour } from './behaviour-tool';
import { lintScriptWrite } from './behaviour-review';
import { modelAnatomy } from './model-anatomy';
import { buildStuddedUi } from './studded-ui-tool';
import { BLOCKS_TOOL_DESCRIPTION, buildBlocks } from './blocks-tool';
import { addUpgrades } from './upgrades-tool';
import { matchesVisualAnchor, visualAssetAnchor } from './asset-choice';
import { fetchLiveModel, liveAssetIdOf, searchLiveModels, LIVE_ID_PREFIX, type LiveModel } from './creator-store-live';
import { ensureProvenanceTables, recordAssetUse } from './provenance';
import { MOODS, PALETTES, type RGB } from './worldbuilding';
import { EFFECTS, EFFECT_NAMES, effectCatalogue, effectInstanceSpecs, parseInstancePath } from './effects';
import { auditCaptureFromTree, auditMetrics, lensCoverage, runnableLenses, sceneFromTree } from './build-audit';
import { sceneFlags } from './scene-flags';
import { formatPanelReport, runCriticPanel } from './critic';
import { specLuau, parseSpecRun, refuseSpecCases, missingCases, SPEC_LIMITS, type SpecCase } from './spec-runner';
// The audio tools are DEFINED in audio-tools.ts and registered here with one spread. Their
// descriptions carry the whole cluster's product surface — what the model may claim about
// generated audio, and in particular that none of it reaches the user's Roblox place — so they
// live beside the modules that enforce those limits rather than in the middle of this file.
// audio-tools.ts imports only `AgentCtx` back from here, as a TYPE, so there is no module cycle.
import { AUDIO_TOOLS } from './audio-tools';
import { admitProgram, isRefusal, capPrints, type SandboxJob } from './sandbox';
import { PREFABS, PREFAB_IDS, prefabCatalogue } from './prefabs';
import { MECHANIC_PATTERNS, MECHANIC_MENU, rankMechanics, answerFor } from './mechanics';
import { MECHANIC_CITATIONS } from './mechanic-citations';
import {
  CREATOR_SKILL_DOMAINS,
  getGenreSkillProfile,
  readCreatorSkill,
  searchCreatorSkills,
} from './creator-skills';
import { checkWorkspacePath, kvWorkspace, runWebTool, webToolDef, WORKSPACE_MAX_BYTES, type WebToolCtx, type WorkspaceStore } from './webtools';
import type { WebFetchLike } from './net-policy';
import { applySurfaceOp, type SurfaceKind } from './surfaces';
// The self-check's ledger, which runTool writes to (evidence-ledger.ts).
import { recordToolCall, type EvidenceLedger, type ToolRecord } from './evidence-ledger';
import {
  searchInstances, setPropertiesBulk, spatialQuery, scatterInstances, collisionGroups, shapeTerrain, readTerrain,
  createRig, checkUiLayout, playCheckUiOp, PLAY_CHECK_UI_DEF, type OpCall,
} from './phase-a-tools';
// Rebuild 2026-10-08: the UI engine. The model designs the screen; the engine builds it correctly and measures it.
import { buildUi, checkUi } from './ui-engine';

// Every supplied gameplay genre is available, including horror.
const AVAILABLE_KIT_IDS = GENRE_KIT_IDS;

export interface AgentCtx {
  env: Env;
  /**
   * The project these tools are acting on, when there is one.
   *
   * Optional because two callers genuinely have no project: the eval harness and the
   * admin `/run-tool` route build an AgentCtx directly to exercise a tool in isolation.
   * Attribution is recorded per project, so those callers record nothing — there is
   * nothing to attribute it to, which is different from failing to record it.
   */
  projectId?: string;
  /**
   * Which asset sources this build may use, already layered across org, user and project.
   *
   * Resolved ONCE in the session DO, where the user is known, and carried as a value so a tool
   * reads a field instead of querying per call. Optional because the eval harness builds an
   * AgentCtx directly with no policy to hand it — the admin `/run-tool` route goes through
   * `this.agentCtx()` like every real step and so already carries it — and
   * `allowedSources(undefined)` is `[]`, so the harness gets the safe answer rather than a
   * permissive one by omission.
   */
  assetSources?: AssetSourcePolicy;
  /**
   * What this run has done with the model library (library-run.ts): kept on the run and handed in by reference, so the
   * order gate on hand-built Models (model-rule.ts) and the insert failure hints see the same record across steps.
   * Absent outside a run; a tool then creates one on the context for its own duration.
   */
  libraryRun?: LibraryRun;
  /** The one library model the project owner selected from a visual preview for this run. */
  approvedLibraryAssetId?: number;
  /**
   * Live Creator Store rows this run's find_library_model returned, by library id (`cs:<assetId>`): the only live ids
   * insert_library_model takes. A plain object, kept on the run beside `libraryRun`, because the context is rebuilt for every call.
   */
  liveLibraryRows?: Record<string, LiveModel>;
  /**
   * Whether find_library_model may search the live Creator Store (creator-store-live.ts). Off unless the run's context turns it on,
   * so a suite that never stubs the network never reaches Roblox, as with `webFetch`.
   */
  liveCreatorStore?: boolean;
  /** Outbound HTTP for that search; the global fetch when absent. */
  liveStoreFetch?: FetchLike;
  rejectedLibraryAssetIds?: number[];
  assetChoiceAnchor?: string;
  /**
   * Put the asset-source question to whoever is here, and say whether anybody was (F-059). Called
   * by a refusal only while the answer is owed; it never allows anything. Absent in the eval
   * harness, which then gets the unasked refusal.
   */
  askAssetSources?: () => boolean;
  /** True when this project's asset settings could not be read (asset-policy.ts sourceRefusal): not the same as "nobody answered". */
  assetSettingsUnread?: boolean;
  /**
   * The user the run acts for: the project owner (`bind.ownerId`, recorded on the run as `userId`).
   * `generate_model_external` creates its Model in this user's own Roblox account with their
   * connected key. Optional because the eval harness and the admin route have no run and no user;
   * a tool that needs one refuses without it.
   */
  userId?: string;
  studioConnected(): boolean;
  execStudioOp(op: StudioOp, timeoutMs?: number): Promise<OpResult>;
  /** Live run fence: direct model deletion is refused after a create name conflict. */
  blockDirectDeletion?: (paths?: readonly string[]) => boolean;
  /** Tell the run which paths a tool just put in the place under their FINAL names (an insert renames after the plugin replies). */
  noteCreated?(paths: readonly string[]): void;
  createCheckpoint(label: string, kind: 'auto' | 'manual' | 'pre_agent'): Promise<CheckpointMeta | { error: string }>;
  /** Roll the place back to a checkpoint. Optional so an older caller still satisfies this type. */
  restoreCheckpoint?(id: string): Promise<{ ok: boolean; error?: string }>;
  /**
   * Save one fact to project memory — or report that it was not saved.
   *
   * The outcome is part of the contract because the user's memory setting can turn this into a
   * proposal (`suggested`) or refuse it outright (`off`). A tool that reported success for a write
   * that did not happen would teach the model something false about the world, and it would keep
   * acting on it for the rest of the run.
   */
  addMemoryFact(fact: string): Promise<'saved' | 'suggested' | 'refused'>;
  /**
   * Forward a rasterised frame to the browser.
   *
   * Optional so an older caller still satisfies this type, and separate from
   * the tool result on purpose: pixels must reach the USER without ever
   * entering the model's transcript, where they would cost a fortune in
   * tokens and tell it nothing it did not already get from the metadata.
   */
  emitFrame?(frame: StudioFrame): void;
  /**
   * The live playtest channel, when the caller provides one.
   *
   * Optional for the same reason everything else here is: the eval harness and
   * the admin `run-tool` route build an AgentCtx directly, and a playtest they
   * cannot watch should still RUN — the safety behaviour in run_and_check is
   * the part that must never be conditional. Without this the tool does
   * everything it always did and simply streams nothing.
   */
  playtest?: PlaytestBus;
  /**
   * A payload for the BROWSER only, never for the model.
   *
   * `detailForUi` derives the UI payload from the model-facing result, which is why a picture tool
   * could never show anything: its result is deliberately image-free, because tool results are
   * re-sent to the model on every later step and a frame is ~207KB of base64 RGB. A step whose
   * evidence is invisible to the user is indistinguishable from one that did not run.
   *
   * A tool sets this when it has something to SHOW that must not be something to READ. `runTool`
   * prefers it over the derived detail, so the two payloads can differ by construction rather than
   * by a size cap accidentally dropping one of them.
   */
  uiDetail?: unknown;
  /**
   * THE RUN'S EVIDENCE LEDGER (self-check.ts). `runTool` writes what each tool did into it — changes, read-backs,
   * player checks. Optional: the eval harness and the admin route build an
   * AgentCtx with none, and then nothing is recorded and nothing else changes.
   */
  evidence?: EvidenceLedger;
  /**
   * A raw Studio payload for the LEDGER only, when the model-facing result is a summary of it (play_check
   * returns sentences; the ledger wants which label was hidden). Set by the tool, consumed and cleared by
   * `runTool`, so one tool's payload can never be recorded as the next one's.
   */
  evidenceRaw?: unknown;
  /** What the user originally asked for in this run (not the latest steer). Data for a check, never an instruction. */
  request?: string;
  /**
   * Asset ids that came out of a verified search in THIS session.
   *
   * Membership records PROVENANCE and nothing else — not permission and not a skip. It changes at
   * most which assertions may be waived, never whether the gate runs. It used to double as a skip
   * (an id in this set went to Studio without ever being resolved), which meant one bad catalogue
   * row could put an unverified Model into a customer's place.
   *
   * Nor is it an admission list: an id that is NOT here is not refused, it is simply the weakest
   * provenance and waives nothing. Refusing it would need evidence this worker does not have —
   * see the note at the provenance computation in `insert_asset`.
   *
   * SINCE 2026-09-20 NOTHING IN THIS WORKER WAIVES AN ASSERTION AT ALL. There was a second set,
   * `libraryAssetIds`, holding the ids that came out of StudPilot's curated catalogue, and membership
   * in it waived three marketplace assertions — price, votes, verified creator — which a catalogue
   * asset had none of by construction. The catalogue is gone, so the set is gone and the waiver
   * with it, and every id now faces the identical verdict.
   */
  discoveredAssetIds?: Set<number>;
  /**
   * The model library (D-MODELLIB-1), per run: the Roblox id each library FILE row was uploaded
   * as, so a second insert of the same row reuses it instead of creating another permanent asset in
   * the user's account.
   */
  libraryUploads?: Map<string, number>;
  /**
   * Outbound HTTP for the web-facing tools.
   *
   * Optional, and it defaults to the global `fetch` — exactly like `fetchImpl` in assets.ts, and
   * for the same reason: a suite that exercises `web_fetch` must be able to do so WITHOUT the
   * internet. A test that reaches the real network is not testing this worker, it is testing
   * whoever happens to answer, and it fails on an aeroplane.
   */
  webFetch?: WebFetchLike;
  /**
   * The project's scratch file store. Defaults to KV keyed by the project id.
   *
   * Injectable for the same reason, and because the eval harness has no KV.
   */
  workspace?: WorkspaceStore;
  /**
   * The tools THIS run was offered for the current step, after mode, permission and plugin
   * capability narrowing — the set the run loop will actually execute.
   *
   * It exists because `propose_plan` validated steps against the whole registry. A plan naming
   * `run_spec` against a plugin that reports `run_code` unsupported passed, and an appended
   * `check_composition` was announced to a Studio that cannot render; each step then came back
   * "unavailable" at the cost of a paid step and stayed pending forever. Optional because the eval
   * harness and the admin `/run-tool` route have no run: absent means the registry, which is the
   * honest answer when nothing narrowed anything.
   */
  offeredTools?: ReadonlySet<string>;
  /**
   * The Studio agent (rebuild 2026-10-08, owner: "no kits", "without any limits"): it makes UI, models, sounds and effects
   * itself, so the old library rules (D-UIONLY-1, D-FXLIB-1, D-MODELLIB-2) do not apply to its calls. Safety checks stay.
   */
  freeHand?: boolean;
  /**
   * How `propose_plan` has fared so far in this run. The run loop carries it across steps (it
   * rebuilds this context every step) and reads it back after each call. See PlanState.
   */
  planState?: PlanState;
  /**
   * True the first time a key is claimed in this run, false after. For work a tool must not repeat
   * within one run (adding the same asset's dependencies twice). Absent outside a run, where every claim is the first.
   */
  onceInRun?(key: string): boolean;
  /** The user's own words for this run (their last message), so a tool that must understand the request does not read the model's retelling of it. */
  userRequest?: () => string | undefined;
  /**
   * What earlier runs of this project built (build-ledger.ts), for `build_object { extend: <id> }`: the entry with its spec,
   * or undefined when the id is not in this project's ledger.
   */
  buildLedger?: { find(id: string): Promise<{ id: string; tool: string; spec?: Record<string, unknown>; rootPaths: string[] } | undefined> };
  /** more_tools: lift the run's focused toolset for the rest of the run (session.ts AgentState.focused), or only the named tools. */
  widenTools?: (tools?: string[]) => void;
  /** The run's sources (sources.ts): add some, get their [n] numbers back. */
  addSources?: (fresh: import('@studpilot/shared').RunSource[]) => number[];
}

/**
 * The run-level memory `propose_plan` needs so that it can never trap a run in refusals.
 *
 * `refusals` counts consecutive refusals; `kinds` is what the last one refused for. The tool
 * refuses at most twice in a row and never twice for the same kind — see planVerdict. `announced`
 * is true once a plan is on the user's screen, after which a second plan is answered without a
 * second checklist.
 */
export interface PlanState {
  refusals: number;
  kinds: PlanDefectKind[];
  announced: boolean;
}

/**
 * What can be wrong with a proposed plan, grouped by what a repair can do about it.
 *
 *   shape            no usable `steps` array at all — nothing to repair from
 *   too_long         more steps than the checklist cap
 *   bad_step         a step that is not an object, has no title, names no tool, or names propose_plan
 *   unavailable_tool a step naming a tool that does not exist, or one this run was not offered
 */
export type PlanDefectKind = 'shape' | 'too_long' | 'bad_step' | 'unavailable_tool';

/**
 * What run_and_check needs in order to be watchable, and nothing more.
 *
 * Every method is a REPORT of something that already happened, never a request
 * to make something happen. `begin` is called after the checkpoint is taken,
 * `phase` after the transition, `captureFrame` returns whether a frame was
 * actually delivered. The tool cannot use this interface to tell the card a
 * story that differs from what it did.
 */
export interface PlaytestBus {
  /** A playtest has started. Returns its id. */
  begin(opts: { requestedSeconds: number; action: string }): string;
  /** Report the current phase and what is being done. */
  phase(phase: 'preparing' | 'running' | 'stopping' | 'finished' | 'failed', action: string, error?: string): void;
  /** Replace the console counts from a fresh log window. */
  console(errors: number, warnings: number): void;
  /**
   * Ask Studio for one frame and forward it if it arrives.
   * Resolves false when the rate gate, the budget or the plugin declined —
   * which the caller records as a drop rather than retrying immediately.
   */
  captureFrame(): Promise<boolean>;
  /** Whether the capture budget and rate gate would allow another frame now. */
  canCapture(): boolean;
}

// An empty `required` is the JSON Schema default; leaving it out saves its characters on every model step.
/** The first script class in a create_instances item list (children included), named for the refusal; or null. */
function findScriptClass(items: unknown, depth = 0): string | null {
  if (!Array.isArray(items) || depth > 12) return null;
  for (const it of items) {
    const rec = it && typeof it === 'object' ? (it as Record<string, unknown>) : {};
    if (typeof rec.className === 'string' && /^(Script|LocalScript|ModuleScript)$/.test(rec.className)) return `${rec.className} "${String(rec.name ?? '')}"`;
    const inner = findScriptClass(rec.children, depth + 1);
    if (inner) return inner;
  }
  return null;
}

/** The first AudioPlayer.Asset (or SoundId) in a create_instances item list, children included, that is not a library or discovered sound id; or null. */
function firstUnknownSoundId(items: unknown, discovered: ReadonlySet<number> | undefined, depth = 0): { error: string } | null {
  if (!Array.isArray(items) || depth > 12) return null;
  for (const it of items) {
    const rec = it && typeof it === 'object' ? (it as Record<string, unknown>) : {};
    const props = rec.props && typeof rec.props === 'object' && !Array.isArray(rec.props) ? (rec.props as Record<string, unknown>) : undefined;
    const refused = refuseSoundId(props, discovered) ?? firstUnknownSoundId(rec.children, discovered, depth + 1);
    if (refused) return refused;
  }
  return null;
}

const S = (props: Record<string, unknown>, required: string[] = []): unknown => ({
  type: 'object',
  properties: props,
  ...(required.length ? { required } : {}),
});

interface ToolImpl {
  def: GatewayToolDef;
  studio: boolean; // requires studio connection
  /** Studio operations this tool may require. Every `studio: true` registry entry must name them. */
  studioOps?: readonly StudioOp['op'][];
  /** Any one complete path suffices; common studioOps remain required. */
  studioOpAlternatives?: readonly (readonly StudioOp['op'][])[];
  /**
   * Whether a successful call means the user's Roblox place changed.
   *
   * A function is used for tools that can succeed as a no-op (format/install/remove/assign). This
   * is the run loop's source of truth for "did I actually build anything?"; keeping it beside the
   * implementation prevents SessionDO from accumulating another hand-maintained tool-name list.
   */
  mutatesProject?: boolean | ((result: unknown) => boolean);
  /**
   * The one line the activity feed shows for this tool, in words a young player reads (no tool name, path or count).
   * Absent: the generic "✓ tool_name · target" line.
   */
  plainSummary?(args: Record<string, unknown>, result: unknown, failed: boolean): string;
  run(ctx: AgentCtx, args: Record<string, unknown>): Promise<unknown>;
}

const DIRECT_EDIT_LIMITS = Object.freeze({
  items: 120,
  pathChars: 320,
  nameChars: 96,
  translation: 1_000_000,
  rotationDegrees: 36_000,
  minScale: 0.001,
  maxScale: 1000,
});

function boundedPath(value: unknown, label: string): string | { error: string } {
  if (typeof value !== 'string') return { error: `${label} must be a string` };
  const path = value.trim();
  if (!path || path.length > DIRECT_EDIT_LIMITS.pathChars) {
    return { error: `${label} must be 1-${DIRECT_EDIT_LIMITS.pathChars} characters` };
  }
  return path;
}

function directName(value: unknown, label: string): string | { error: string } {
  if (typeof value !== 'string') return { error: `${label} must be a string` };
  const name = value.trim();
  if (!name || name.length > DIRECT_EDIT_LIMITS.nameChars) {
    return { error: `${label} must be 1-${DIRECT_EDIT_LIMITS.nameChars} characters` };
  }
  return name;
}

function boundedPaths(value: unknown, label = 'paths', allowRepeats = false): string[] | { error: string } {
  if (!Array.isArray(value) || value.length === 0 || value.length > DIRECT_EDIT_LIMITS.items) {
    return { error: `${label} must contain 1-${DIRECT_EDIT_LIMITS.items} instance paths` };
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index++) {
    const path = boundedPath(value[index], `${label}[${index}]`);
    if (typeof path !== 'string') return path;
    if (seen.has(path) && !allowRepeats) return { error: `${label} contains the same path more than once: ${path}` };
    seen.add(path);
    out.push(path);
  }
  return out;
}

function boundedTriple(value: unknown, label: string, limit: number): [number, number, number] | { error: string } {
  if (!Array.isArray(value) || value.length !== 3) return { error: `${label} must contain exactly 3 numbers` };
  const triple = value.map(Number);
  if (triple.some((n) => !Number.isFinite(n) || Math.abs(n) > limit)) {
    return { error: `${label} entries must be finite and within ±${limit}` };
  }
  return triple as [number, number, number];
}

function changedField(result: unknown, field: string): boolean {
  return !!result && typeof result === 'object' && (result as Record<string, unknown>)[field] === true;
}

function positiveCount(result: unknown, field: string): boolean {
  if (!result || typeof result !== 'object') return false;
  const value = (result as Record<string, unknown>)[field];
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/* ------------------------------------------------------------- propose_plan --- */

/**
 * One step of the plan the agent announces before it builds.
 *
 * `tool` is REQUIRED and is validated against the real registry. It is not decoration: it is what
 * lets the run loop settle the step against what actually ran, and what stops a plan naming a
 * capability the product does not have.
 */
export interface ProposedStep {
  title: string;
  detail?: string;
  tool: string;
}

export interface ProposedPlan {
  title?: string;
  steps: ProposedStep[];
  /** Set when this module appended the verification step the model left out. See readProposedPlan. */
  verifierAdded?: string;
  /**
   * Set when the plan names no verifier and this run was offered none to append. The plan still
   * runs — refusing it would trap the run for want of a capability the model cannot conjure — and
   * the checklist and the tool result both say that nothing will check the result automatically.
   */
  noVerifierOffered?: true;
  /** What the product changed in a plan it repaired rather than refused again, one sentence each. */
  repairs?: string[];
}

/**
 * Twelve, not forty.
 *
 * The browser's validator accepts 40 steps per build_plan. That is the shape limit, not the useful
 * one: a plan nobody reads to the end is the same as no plan. Twelve keeps the visible plan
 * scannable while the run itself may carry out far more internal work.
 */
const MAX_PLAN_STEPS = 12;

// Re-exported so every reader that imported the list from the registry keeps doing so. The one
// definition is in verifiers.ts, which the system prompt imports too.
export { VERIFIER_TOOLS, APPENDED_VERIFIER_PREFERENCE };

const clip = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** The title the checklist shows for the verifier the product appended, per verifier. */
const APPENDED_VERIFIER_TITLE: Record<(typeof VERIFIER_TOOLS)[number], string> = {
  check_composition: 'Check the layout of the result',
  audit_build: 'Check the build for defects',
  run_and_check: 'Playtest the result',
  run_spec: 'Run the behaviour checks',
};

/**
 * What the refusal names instead of a tool the run cannot use.
 *
 * "Use an exact name from the tools you were given" left the model to guess again, and a guess is
 * what got it refused. Tools OFFERED to this run that share a word with the one it asked for come
 * first; a verifier it asked for is answered with the verifiers it can have. Never propose_plan,
 * and never a tool outside `offered`, because a suggestion the run cannot call is the same defect
 * one sentence later.
 */
function offeredAlternatives(tool: string, offered: ReadonlySet<string>): string[] {
  const words = new Set(tool.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3));
  const candidates = [...offered].filter((n) => n !== PLANNER_TOOL);
  const verifierLike = (VERIFIER_TOOLS as readonly string[]).includes(tool) || /check|verif|inspect|audit|test|spec/.test(tool);
  const out: string[] = [];
  if (verifierLike) {
    for (const v of APPENDED_VERIFIER_PREFERENCE) if (offered.has(v)) out.push(v);
  }
  // Ranked by how many words they share, so the near-miss the model meant (`edit_scripts` →
  // `edit_script`) comes first rather than wherever the registry happens to list it.
  const scored = candidates
    .filter((name) => !out.includes(name))
    .map((name, order) => ({
      name,
      order,
      shared: name.split('_').filter((w) => words.has(w) || [...words].some((x) => x.startsWith(w) || w.startsWith(x))).length,
    }))
    .filter((c) => c.shared > 0)
    .sort((a, b) => b.shared - a.shared || a.order - b.order);
  for (const c of scored) out.push(c.name);
  return out.slice(0, 6);
}

function alternativesSentence(tool: string, offered: ReadonlySet<string>): string {
  const alt = offeredAlternatives(tool, offered);
  return alt.length
    ? `Offered in this run instead: ${alt.join(', ')}.`
    : 'Use an exact name from the tools offered in this run.';
}

interface PlanDefect {
  kind: PlanDefectKind;
  /** Addressed to the model, which reads it as the refusal. */
  sentence: string;
  /** Addressed to the model too, but describing what the product did in a repair. */
  repair?: string;
}

type PlanVerdict =
  | { kind: 'plan'; plan: ProposedPlan }
  | { kind: 'refused'; error: string; kinds: PlanDefectKind[] }
  | { kind: 'skipped'; note: string };

/**
 * May this call be refused, or must the product repair it?
 *
 * THE PROPERTY: consecutive propose_plan refusals never exceed two in a run, whatever the model
 * sends. A refusal only works if the model acts on it, and measured against the deployed product it
 * does not (the three identical refusals recorded at readProposedPlan). So a refusal is spent once
 * per kind of defect — the second time the same thing is wrong, the product fixes it — and never a
 * third time in a row for any reason.
 */
function mayRefuse(kinds: readonly PlanDefectKind[], state: PlanState): boolean {
  if (state.refusals <= 0) return true;
  if (state.refusals === 1) return !kinds.some((k) => state.kinds.includes(k));
  return false;
}

/**
 * Read the model's plan: accept it, refuse it once with a reason it can act on, or repair it.
 *
 * Every refusal is phrased as an instruction the model can act on in the next step, because that is
 * the only channel a refusal has. "steps must be an array" teaches nothing; naming the tool that
 * does not exist, and the offered tools it could use instead, does.
 *
 * `offered` is the set THIS run may execute. A registered tool the run was not offered is as
 * uncallable as one that does not exist, and passing it would only move the failure to the moment
 * the step is attempted — a paid step, an "unavailable" error, and a checklist row pending forever.
 */
function readProposedPlan(a: Record<string, unknown>, offered: ReadonlySet<string>, state: PlanState): PlanVerdict {
  const raw = a.steps;
  if (!Array.isArray(raw) || raw.length === 0) {
    const kinds: PlanDefectKind[] = ['shape'];
    if (mayRefuse(kinds, state)) {
      return { kind: 'refused', kinds, error: 'propose_plan needs a non-empty `steps` array; each step is { title, detail?, tool }.' };
    }
    return {
      kind: 'skipped',
      note:
        'propose_plan was sent without a usable `steps` array after earlier refusals, so no checklist is shown for this run. ' +
        'Do not call propose_plan again; carry on with the work and report what you did in your reply.',
    };
  }

  const registered = new Set(toolNames());
  const defects: PlanDefect[] = [];
  if (raw.length > MAX_PLAN_STEPS) {
    defects.push({
      kind: 'too_long',
      sentence:
        `that plan has ${raw.length} steps and the limit is ${MAX_PLAN_STEPS}. It was refused rather than ` +
        'truncated, because a clipped plan reads as the whole commitment. Group the small steps together.',
    });
  }

  const kept: ProposedStep[] = [];
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    if (typeof entry !== 'object' || entry === null) {
      defects.push({ kind: 'bad_step', sentence: `step ${i + 1} is not an object.`, repair: `step ${i + 1} was not a step and was dropped` });
      continue;
    }
    const step = entry as Record<string, unknown>;
    const title = clip(step.title, 200);
    if (!title) {
      defects.push({ kind: 'bad_step', sentence: `step ${i + 1} has no title. Say what the step delivers.`, repair: `step ${i + 1} had no title and was dropped` });
      continue;
    }
    const tool = clip(step.tool, 64);
    if (!tool) {
      defects.push({
        kind: 'bad_step',
        sentence: `step ${i + 1} ("${title}") names no tool. Every step must say which tool will carry it out — a step with no tool is a wish, not a plan.`,
        repair: `step ${i + 1} ("${title}") named no tool and was dropped`,
      });
      continue;
    }
    if (tool === PLANNER_TOOL) {
      defects.push({
        kind: 'bad_step',
        sentence: `step ${i + 1} names propose_plan. The plan does not contain itself; list the work.`,
        repair: `step ${i + 1} named propose_plan itself and was dropped`,
      });
      continue;
    }
    if (!registered.has(tool)) {
      defects.push({
        kind: 'unavailable_tool',
        sentence:
          `step ${i + 1} names the tool "${tool}", which does not exist. The user reads a plan as a commitment, ` +
          `so a step that cannot be carried out is refused. ${alternativesSentence(tool, offered)}`,
        repair: `step ${i + 1} ("${title}") named "${tool}", which does not exist, and was dropped`,
      });
      continue;
    }
    if (!offered.has(tool)) {
      defects.push({
        kind: 'unavailable_tool',
        sentence:
          `step ${i + 1} names "${tool}", which is not available in this run — the mode, the permissions or ` +
          `the connected Studio withhold it — so the step could never be carried out. ${alternativesSentence(tool, offered)}`,
        repair: `step ${i + 1} ("${title}") named "${tool}", which this run was not offered, and was dropped`,
      });
      continue;
    }
    kept.push({ title, ...(clip(step.detail, 800) ? { detail: clip(step.detail, 800) } : {}), tool });
  }

  const repairs: string[] = [];
  let steps = kept;
  let truncatedFrom: number | undefined;
  if (defects.length) {
    const kinds = [...new Set(defects.map((d) => d.kind))];
    if (mayRefuse(kinds, state)) {
      // The first few problems in full, then a count: a refusal the model can act on, not a wall.
      const shown = defects.slice(0, 6).map((d) => d.sentence).join(' ');
      const more = defects.length > 6 ? ` …and ${defects.length - 6} more problems of the same kinds.` : '';
      return { kind: 'refused', kinds, error: shown + more };
    }
    //[[ REPAIRED, NOT REFUSED AGAIN. Every change is named to the model in the tool result, and a
    //   truncation is named on the checklist the user reads, because a plan the product edited and
    //   presented as the model's would be the failure-to-observe defect wearing a plan's clothes. ]]
    for (const d of defects) if (d.repair) repairs.push(d.repair);
    if (steps.length > MAX_PLAN_STEPS) {
      truncatedFrom = steps.length;
      steps = steps.slice(0, MAX_PLAN_STEPS);
      repairs.push(`only the first ${MAX_PLAN_STEPS} of ${truncatedFrom} steps are on the checklist`);
    }
    if (!steps.length) {
      return {
        kind: 'skipped',
        note:
          `No step of that plan can be carried out in this run (${repairs.join('; ')}), so no checklist is shown. ` +
          'Do not call propose_plan again; carry on with the tools you were offered and report what you did.',
      };
    }
  }

  //[[ RE-AIMED 2026-09-21, AT THE PROPERTY RATHER THAN AT THE MODEL. History, because the
  //   refusal it replaces was correct in every way except the one that mattered.
  //
  //   This used to return `{ error: 'this plan never checks its own work. Add at least one
  //   verification step using one of: …' }`. The rule is right — a build with no planned check
  //   ends with "Done." and nothing proven. What was wrong is that a refusal only works if the
  //   model acts on it, and MEASURED AGAINST THE DEPLOYED PRODUCT it does not. From the tool
  //   trace of a real run on 2026-09-21, project 52a4b8c5, one part requested:
  //
  //     ✗ propose_plan — this plan never checks its own work. Add at least one verification…
  //     ✗ propose_plan — this plan never checks its own work. Add at least one verification…
  //     ✗ propose_plan — this plan never checks its own work. Add at least one verification…
  //     → "I reached the step limit for this run."   8 Credits asked, 8 returned
  //
  //   Three identical refusals at durationMs 0, the whole step budget spent on them, and NOTHING
  //   BUILT. The user's own words for this are "the agent always fails in the thinking". The run
  //   before it died the same way after get_project_tree, get_selection, get_project_tree,
  //   propose_plan — 26 Credits asked, 26 returned.
  //
  //   The PROPERTY this guard defends is "the plan that runs contains a check". It is not "the
  //   model must be the one to write the check down". Appending the step satisfies the property
  //   outright instead of asking for it and losing the run when the answer does not come. The
  //   append is ANNOUNCED — to the model in the tool result and to the user in the checklist —
  //   because a step the product added and presented as the model's would be this house's own
  //   failure-to-observe defect wearing a plan's clothes.
  //
  //   RE-AIMED AGAIN 2026-09-22: THE APPENDED CHECK MUST BE ONE THIS RUN CAN RUN. It was always
  //   a visual check, including against a Studio whose plugin reports `render_view`
  //   unsupported — so the product announced a check it had already withheld, and the step stayed
  //   pending forever. The pick is now the first OFFERED verifier in APPENDED_VERIFIER_PREFERENCE,
  //   and when none is offered nothing is appended and the plan says so instead of pretending. ]]
  let verifierAdded: string | undefined;
  let noVerifierOffered = false;
  if (!steps.some((s) => (VERIFIER_TOOLS as readonly string[]).includes(s.tool))) {
    const pick = APPENDED_VERIFIER_PREFERENCE.find((v) => offered.has(v));
    if (pick) {
      verifierAdded = pick;
      steps = [
        ...steps,
        {
          title: APPENDED_VERIFIER_TITLE[pick],
          detail: 'Added automatically: a plan with no check proves nothing, so this run verifies what it built.',
          tool: pick,
        },
      ];
    } else {
      noVerifierOffered = true;
    }
  }

  // Said on the checklist itself, because the checklist is what the person reads.
  const titleNotes = [
    ...(truncatedFrom !== undefined ? [`first ${MAX_PLAN_STEPS} of ${truncatedFrom} steps`] : []),
    ...(noVerifierOffered ? ['no automatic check is available in this session'] : []),
  ];
  const suffix = titleNotes.join('; ');
  const baseTitle = clip(a.title, 200);
  const title = suffix
    ? baseTitle
      ? `${baseTitle.slice(0, Math.max(0, 200 - suffix.length - 3)).trim()} (${suffix})`
      : suffix.charAt(0).toUpperCase() + suffix.slice(1)
    : baseTitle;

  return {
    kind: 'plan',
    plan: {
      ...(title ? { title } : {}),
      steps,
      ...(verifierAdded ? { verifierAdded } : {}),
      ...(noVerifierOffered ? { noVerifierOffered: true as const } : {}),
      ...(repairs.length ? { repairs } : {}),
    },
  };
}

/**
 * EVERY VALUE THE PLUGIN RETURNS IS WRAPPED. Unwrap one.
 *
 * `Paths.encode` in the plugin wraps every scalar as `{ t, v }` — `{t:"number",v:0}`,
 * `{t:"Vector3",v:[0,5,0]}`, `{t:"nil"}` — and recurses into tables, encoding each FIELD. So a
 * handler that returns `{ removed = 0 }` arrives as `{ removed = { t = "number", v = 0 } }`, and a
 * property table arrives with every value wrapped.
 *
 * Reading one of those as a bare value does not throw. `Number({t,v})` is NaN and `String({t,v})`
 * is "[object Object]" — both of which travel onward as plausible-looking nonsense. That is how
 * this was shipped: the tools read the unwrapped shape, and the tests STUBBED the unwrapped shape,
 * so the tests encoded the same misunderstanding as the code and could never contradict it.
 *
 * The three parsers that already handle it — parseLayout, parseAudit, parseSpecRun — do so because
 * their payload is a JSON string, and a string is wrapped too; peeling `{t,v}` was unavoidable
 * there. The structured-table readers had no such forcing function.
 */
function decodeTagged(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const o = value as Record<string, unknown>;
  if (typeof o.t === 'string' && ('v' in o || o.t === 'nil')) {
    return o.t === 'nil' ? null : o.v;
  }
  return value;
}

type StudioTreeNode = {
  readRef?: string;
  path?: string;
  name?: string;
  class?: string;
  props?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  children?: StudioTreeNode[];
};

function treeRoot(value: unknown): StudioTreeNode | null {
  if (!value || typeof value !== 'object') return null;
  const root = (value as { root?: unknown }).root;
  return root && typeof root === 'object' ? root as StudioTreeNode : null;
}

/**
 * Terrain operations per edit_terrain call. Measured 2026-09-22 (run d1a97c0d): "a grassy hill with a
 * small pond" took 149 single-operation calls — 152 paid steps, 450 Credits — and the load made Studio
 * miss a 30 s op deadline, after which the link read as down and the Studio tools were withdrawn.
 */
const MAX_TERRAIN_BATCH = 32;

/**
 * A long list of terrain operations (a path expands to many), run in order in chunks of MAX_TERRAIN_BATCH through the same
 * batch the tool already has. A failure says which operation, how many ran before it, and that the ground has changed.
 */
async function runTerrainChunks(ctx: AgentCtx, operations: unknown[]): Promise<unknown> {
  let completed = 0;
  for (let start = 0; start < operations.length; start += MAX_TERRAIN_BATCH) {
    const res = await runTerrainEdits(ctx, { operations: operations.slice(start, start + MAX_TERRAIN_BATCH) });
    if (toolError(res)) {
      const r = res as Record<string, unknown>;
      const done = completed + (Number(r.completed) || 0);
      return { ...r, failedAt: start + (Number(r.failedAt) || 0), completed: done, ...(done ? { projectMutated: true } : {}) };
    }
    completed += Number((res as Record<string, unknown>).completed) || 0;
  }
  return { completed };
}

async function runTerrainEdits(ctx: AgentCtx, a: Record<string, unknown>): Promise<unknown> {
  if (typeof a.recipe === 'string') {
    const expanded = expandTerrainRecipe(a.recipe, a);
    if ('error' in expanded) return expanded;
    const res = await runTerrainEdits(ctx, { operations: expanded.operations });
    return toolError(res) ? res : { ...(res as Record<string, unknown>), ...expanded.facts };
  }
  const { operations: given, ...single } = a;
  if (given === undefined && single.action === 'path') {
    const path = expandTerrainPath(single, DIRECT_EDIT_LIMITS.translation);
    if ('error' in path) return path;
    const res = await runTerrainChunks(ctx, path.operations);
    return toolError(res) ? res : { ...(res as Record<string, unknown>), ...path.facts };
  }
  if (given === undefined) {
    if (typeof single.action !== 'string') return { error: 'edit_terrain needs an action, or operations: [...]' };
    return op(ctx, { ...single, op: 'terrain_edit' } as StudioOp);
  }
  if (!Array.isArray(given) || given.length === 0) return { error: 'operations must be a non-empty array of terrain actions' };
  if (given.length > MAX_TERRAIN_BATCH) {
    return { error: `operations holds ${given.length} actions; the limit is ${MAX_TERRAIN_BATCH} per call — split it` };
  }
  // A `path` among the operations is expanded in place; the whole list is then run in chunks of MAX_TERRAIN_BATCH.
  let operations: unknown[] = given;
  if (given.some((raw) => raw && typeof raw === 'object' && (raw as { action?: unknown }).action === 'path')) {
    const flat: unknown[] = [];
    for (const [index, raw] of given.entries()) {
      if (raw && typeof raw === 'object' && (raw as { action?: unknown }).action === 'path') {
        const path = expandTerrainPath(raw as Record<string, unknown>, DIRECT_EDIT_LIMITS.translation);
        if ('error' in path) return { error: `operations[${index}]: ${path.error}` };
        flat.push(...path.operations);
      } else flat.push(raw);
    }
    if (flat.length > TERRAIN_PATH_OP_CAP) return { error: `these operations expand to ${flat.length} blocks; the limit is ${TERRAIN_PATH_OP_CAP} per call — split them` };
    if (flat.length > MAX_TERRAIN_BATCH) return runTerrainChunks(ctx, flat);
    operations = flat;
  }
  const done: unknown[] = [];
  for (const [index, raw] of operations.entries()) {
    if (!raw || typeof raw !== 'object' || typeof (raw as { action?: unknown }).action !== 'string') {
      return { error: `operations[${index}] has no action`, completed: done.length, ...(done.length ? { projectMutated: true } : {}) };
    }
    const res = await op(ctx, { ...(raw as Record<string, unknown>), op: 'terrain_edit' } as StudioOp);
    if (toolError(res)) {
      // The earlier operations are already in the place. Say so, and let mutation truth say so too.
      return { ...(res as Record<string, unknown>), failedAt: index, completed: done.length, ...(done.length ? { projectMutated: true } : {}) };
    }
    done.push(res);
  }
  return { completed: done.length, results: done };
}

/**
 * THE TREE THE MODEL READS IS AN OUTLINE, NOT THE WIRE JSON.
 *
 * Every tool result is cut at MAX_RESULT_CHARS, and get_tree's JSON carries typed props and
 * attributes on every node, so a single model's tree ran past the cut: the model received a JSON
 * fragment ending "...[truncated N chars]", could not name the children, and asked again. Measured
 * 2026-09-23 (run 867aff43): "List the parts inside the StreetLamp model by name" called
 * get_project_tree on game.Workspace.StreetLamp four times and ended with no answer. One line per
 * node — indented name and class — fits a few hundred nodes, and when the budget runs out it says how
 * many were not shown and how to read a branch, instead of cutting a sentence in half.
 */
function treeOutline(data: unknown, budget = MAX_RESULT_CHARS - 300): Record<string, unknown> | null {
  const root = treeRoot(data);
  if (!root) return null;
  // Only a plugin that says so honours a read reference as the address of a write. An older one reads with it
  // and refuses everything else, and the outline must not promise what the connected Studio cannot do.
  const refsWritable = (data as { refsWritable?: unknown }).refsWritable === true;
  const lines: string[] = [];
  let used = 0;
  let total = 0;
  let firstHidden: string | undefined;
  // Keep the geometry needed for placement without returning every typed property.
  // Only measured finite vectors are shown; Models without these fields get none.
  const spatial = (node: StudioTreeNode) => {
    const fields: string[] = [];
    for (const [key, label] of [['Position', 'position'], ['Size', 'size']] as const) {
      const prop = node.props?.[key] as { t?: unknown; v?: unknown } | undefined;
      if (prop?.t === 'Vector3' && Array.isArray(prop.v) && prop.v.length === 3
        && prop.v.every((v) => typeof v === 'number' && Number.isFinite(v))) {
        fields.push(`${label}=${JSON.stringify(prop.v)}`);
      }
    }
    const anchored = node.props?.Anchored as { t?: unknown; v?: unknown } | undefined;
    if (anchored?.t === 'bool' && typeof anchored.v === 'boolean') fields.push(`anchored=${anchored.v}`);
    return fields.length ? ` ${fields.join(' ')}` : '';
  };
  const walk = (node: StudioTreeNode, depth: number, siblings = 1) => {
    total += 1;
    const name = node.name ?? node.path?.split('.').pop() ?? '?';
    const unfetched = Number((node as { moreChildren?: unknown }).moreChildren) || 0;
    const line = `${'  '.repeat(depth)}${name} (${node.class ?? '?'})${siblings > 1 ? ` [ambiguous: ${siblings} siblings named ${name}; ${refsWritable ? 'address each by its readRef' : 'this path cannot select one'}]` : ''}${typeof node.readRef === 'string' && /^read-ref:[0-9a-f-]{36}:\d+$/.test(node.readRef) ? ` readRef=${node.readRef} (${refsWritable ? 'use it as the path in any tool' : 'get_instance reads only'})` : ''}${spatial(node)}${unfetched > 0 ? ` +${unfetched} more children not fetched` : ''}`;
    if (used + line.length + 1 <= budget) {
      lines.push(line);
      used += line.length + 1;
    } else if (!firstHidden) {
      firstHidden = node.path ?? name;
    }
    const counts = new Map<string | undefined, number>();
    for (const child of node.children ?? []) counts.set(child.name, (counts.get(child.name) ?? 0) + 1);
    for (const child of node.children ?? []) walk(child, depth + 1, counts.get(child.name));
  };
  walk(root, 0);
  // Fit on the SERIALISED reply, which is what the cap measures: JSON escapes every newline and quote,
  // so counting raw characters let a large tree overrun the cap and be cut after all.
  const render = () => {
    const hidden = total - lines.length;
    return {
      root: root.path ?? root.name,
      nodes: total,
      outline: lines.join('\n'),
      ...(hidden > 0
        ? { notShown: `${hidden} more node(s) not shown to stay within the reply limit — call get_project_tree with root set to a branch such as ${firstHidden ?? root.path} to read it` }
        : {}),
    };
  };
  let result = render();
  while (lines.length > 1 && JSON.stringify(result).length > MAX_RESULT_CHARS) {
    lines.pop();
    result = render();
  }
  return result;
}

function toolError(value: unknown): value is { error: unknown } {
  return !!value && typeof value === 'object' && 'error' in (value as Record<string, unknown>);
}

function typedPresetValue(value: number | boolean | RGB): PropValue {
  if (typeof value === 'number') return { t: 'number', v: value };
  if (typeof value === 'boolean') return { t: 'bool', v: value };
  return { t: 'Color3', v: [value[0] / 255, value[1] / 255, value[2] / 255] };
}

function typedPresetProps(values: Record<string, number | boolean | RGB>): Record<string, PropValue> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, typedPresetValue(value)]));
}

const LIGHTING_EFFECT_CLASSES = new Set([
  'Atmosphere', 'BloomEffect', 'BlurEffect', 'ColorCorrectionEffect', 'ColorGradingEffect',
  'DepthOfFieldEffect', 'SunRaysEffect',
]);

function moodInstances(mood: string): InstanceSpec[] {
  const preset = MOODS[mood]!;
  const one = (className: string, props: Record<string, number | boolean | RGB>): InstanceSpec => ({
    className,
    name: className,
    parent: 'game.Lighting',
    props: typedPresetProps(props),
    attributes: { AppleMood: { t: 'string', v: mood } },
  });
  const out = [
    one('Atmosphere', preset.atmosphere as unknown as Record<string, number | boolean | RGB>),
    one('BloomEffect', preset.bloom as unknown as Record<string, number | boolean | RGB>),
    one('ColorCorrectionEffect', preset.colorCorrection as unknown as Record<string, number | boolean | RGB>),
  ];
  if (preset.sunRays) out.push(one('SunRaysEffect', preset.sunRays as unknown as Record<string, number | boolean | RGB>));
  if (preset.depthOfField) out.push(one('DepthOfFieldEffect', preset.depthOfField as unknown as Record<string, number | boolean | RGB>));
  return out;
}

/** A tagged value rendered for a person: "0, 5, 0" rather than "[object Object]" or a JSON blob. */
function displayTagged(value: unknown): string {
  const decoded = decodeTagged(value);
  if (decoded === null || decoded === undefined) return '—';
  if (Array.isArray(decoded)) return decoded.map((n) => (typeof n === 'number' ? round2(n) : String(n))).join(', ');
  if (typeof decoded === 'number') return round2(decoded);
  if (typeof decoded === 'boolean') return decoded ? 'true' : 'false';
  return String(decoded);
}

/** One node of the plugin's `serialize` op (apps/studpilot-plugin/src/ops/Serialize.luau). */
interface SerializedNode {
  class?: string;
  name?: string;
  props?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  tags?: string[];
  source?: string;
  childCount?: number;
  children?: SerializedNode[];
}

/** A serialized node as text a model can quote: each value displayed, a reference shown as its path. */
function readableNode(node: SerializedNode): Record<string, unknown> {
  const show = (v: unknown): string => {
    const t = v as { t?: string; v?: unknown } | null;
    return t && typeof t === 'object' && t.t === 'Instance' && typeof t.v === 'string' ? t.v : displayTagged(v);
  };
  const out: Record<string, unknown> = { class: node.class, name: node.name };
  out.props = Object.fromEntries(Object.entries(node.props ?? {}).sort(([x], [y]) => x.localeCompare(y)).map(([k, v]) => [k, show(v)]));
  if (node.attributes && Object.keys(node.attributes).length) out.attributes = Object.fromEntries(Object.entries(node.attributes).map(([k, v]) => [k, show(v)]));
  if (node.tags?.length) out.tags = node.tags;
  if (typeof node.source === 'string') out.source = node.source;
  if (node.children?.length) out.children = node.children.map(readableNode);
  else if (node.childCount) out.childCount = node.childCount;
  return out;
}

/** Two decimals, without the trailing zeros that make a property panel read like a spreadsheet. */
function round2(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

//[[ EXPORTED SO THAT NOTHING HAS TO KEEP A SECOND COPY OF IT.
//   A tool that must fit inside this cap is passed the cap, and the test that proves it fits reads
//   it from here. The deleted check-harvest-licences learned the same lesson the expensive way: its
//   first version restated the rules it was checking and got one wrong immediately. ]]
export const MAX_RESULT_CHARS = 3000; // tool output is re-sent every later step, so keep it tight
// Script edits require source beyond the generic outline budget. Reads page before this cap.
export const MAX_SCRIPT_RESULT_CHARS = 24_000;

/** Errors before warnings before anything else, so a size cap never truncates away the errors. */
function severityRank(severity: string): number {
  return severity === 'error' ? 0 : severity === 'warn' ? 1 : 2;
}

/** One finding as a line a model can act on: where, which rule, what, and why it matters. */
function renderFinding(f: { line: number; rule: string; detail: string; why?: string }): string {
  return `line ${f.line}: ${f.rule} — ${f.detail}${f.why ? ` (${f.why})` : ''}`;
}

/**
 * Every script in the place, in ONE Studio round trip.
 *
 * The require graph, the place-wide symbol index and the run-context checks all need every source
 * at once. `list_scripts` then N × `read_script` returns the same bytes at N times the latency,
 * and a 40-script place would spend most of a turn waiting. `truncated` is carried through rather
 * than dropped: a place-wide answer computed over an unknowingly partial place is exactly the
 * failure-to-observe-rendered-as-observation this repository keeps finding.
 */
async function dumpScripts(
  ctx: AgentCtx,
  root?: string,
): Promise<{ files: ScriptFile[]; truncated: boolean } | { error: string }> {
  const raw = await op(ctx, { op: 'dump_scripts', root, maxScripts: 80, maxChars: 400_000 }, 45_000);
  if (raw && typeof raw === 'object' && 'error' in (raw as Record<string, unknown>)) {
    return { error: String((raw as { error: unknown }).error) };
  }
  const list = (raw as { scripts?: unknown }).scripts;
  if (!Array.isArray(list)) return { error: 'the plugin returned no script list' };
  const files: ScriptFile[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.path !== 'string' || typeof e.source !== 'string') continue;
    files.push({ path: e.path, source: e.source, className: typeof e.class === 'string' ? e.class : undefined });
  }
  return { files, truncated: (raw as { truncated?: unknown }).truncated === true };
}

/**
 * THE FAILURE'S CLASSIFICATION TRAVELS WITH IT, or the classifier protects nobody.
 *
 * This reduced every failed op to `{ error }` and threw `res.failure` away — at the last step
 * before the model, which is the only reader whose behaviour the classification was written to
 * change. src/op-failure.ts states the load-bearing rule (delivery is at-most-once, so a timed-out
 * MUTATION may already have been applied and must not be repeated) and had no caller outside its
 * own test. The model saw "the operation timed out" and re-issued the create, which is how a door
 * gets built twice.
 *
 * `retry` is a separate field rather than more prose glued onto `error`, because the two are
 * different kinds of thing: one is what happened, the other is what may be done about it, and a
 * model that skims the first still gets the second.
 *
 * `fix` is the third of those things and it was missing, which cost a user a wrong instruction on
 * 2026-09-19: told only that a write was refused for want of edit consent, the model invented a
 * Studio settings page that does not exist rather than naming the button in the StudPilot panel. `retry`
 * answers "may I do this again"; `fix` answers "what does the PERSON do", and a refusal is precisely
 * the case where those two have different answers. See remedyHint in op-failure.ts.
 */
/** The Studio channel as phase-a-tools.ts sees it: the same `op`, bound to this run. */
const studioCall = (ctx: AgentCtx): OpCall => (studioOp, timeoutMs) => op(ctx, studioOp, timeoutMs);

/** A rename that leaves scripts naming the old object breaks them silently (s08: Baseplate -> LavaFloor
 * killed the lava). The rename stands; the result lists every script line that still names the old one. */
async function renameAndAudit(ctx: AgentCtx, path: string, name: string): Promise<unknown> {
  const res = await op(ctx, { op: 'rename_instance', path, name });
  const old = parseInstancePath(path)?.at(-1);
  if (!old || old.length < 3 || old === name || (res as { error?: unknown })?.error) return res;
  const found = await ctx.execStudioOp({ op: 'search_scripts', query: old, maxResults: 20 }, 20_000).catch(() => null);
  const named = new RegExp(`["'.]${old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_])`);
  const stale = ((found?.ok && (found.data as { matches?: { path: string; line: number; text: string }[] })?.matches) || [])
    .filter((m) => named.test(m.text)).slice(0, 8);
  if (!stale.length) return res;
  return { ...(res as object), staleReferences: stale.map((m) => `${m.path}:${m.line}  ${m.text.trim()}`),
    warning: `These scripts still name "${old}" and no longer find it: update each with edit_script to "${name}" before you claim the mechanic works.` };
}

/**
 * make_image's second route: an Image uploaded into the person's OWN Roblox account, waited on until Roblox names it. First
 * with their "Connect Roblox for uploads" grant (OAuth, asset:write), else with an Open Cloud key they saved; never a platform key.
 */
async function uploadImageWithOwnKey(ctx: AgentCtx, userId: string, png: Uint8Array, name: string): Promise<{ assetId: string | number } | { error: string }> {
  return uploadToOwnRoblox(ctx.env, userId, png, 'image/png', 'Image', name);
}

/** Luau analyzer rules (packages/evals/src/luau-intel.mjs) whose finding is a bug at runtime, not a style note. */
const RUNTIME_BUG_RULES = new Set(['unknown-global', 'implicit-global', 'no-yield-infinite-loop', 'never-updated-loop-condition', 'unreachable-code', 'require-cycle']);

async function op(ctx: AgentCtx, studioOp: StudioOp, timeoutMs = 30_000): Promise<unknown> {
  const res = await ctx.execStudioOp(studioOp, timeoutMs);
  if (!res.ok) {
    const hint = retryHint(studioOp, res);
    const fix = remedyHint(res);
    return {
      error: res.error ?? 'operation failed',
      ...(hint ? { retry: hint } : {}),
      ...(fix ? { fix } : {}),
      // The same verdict as `retry`, as a field the run loop can read without parsing prose: the
      // duplicate-call guard lets an identical call be repeated only when THIS says it is safe.
      // Bookkeeping, like `projectMutated`; runTool strips it before the model sees the result.
      ...(retryEligibility(studioOp, res).retryable ? { retryable: true } : {}),
    };
  }
  return res.data ?? { ok: true };
}

/**
 * How long the WORKER waits on a code-execution op, given the wall number in the job.
 *
 * Twice the wall plus five seconds, and the slack is the honest part: the plugin has never read
 * `timeoutMs` and could not honour it if it did, so `job.limits.wallMs` is a request and this is
 * the point at which the worker stops waiting for an answer. sandbox.ts records that asymmetry as
 * `enforcement.wall: 'unenforced'` for the studio backend. Giving up earlier than the engine
 * plausibly needs would turn slow-but-finished work into a phantom timeout.
 */
function studioWaitMs(job: SandboxJob): number {
  return job.limits.wallMs * 2 + 5_000;
}

/**
 * Apply the output ceiling to what Studio sent back.
 *
 * The plugin collects `__prints` with no bound at all (Ops.luau `run_code`), so this is the first
 * point in the system that can cut it — which is exactly why sandbox.ts calls the studio backend's
 * output enforcement `truncate-after-transfer` rather than `truncate`. The bytes are already here.
 *
 * The truncation is ANNOUNCED. `runTool`'s generic `MAX_RESULT_CHARS` slice would cut the JSON in
 * the middle and append a char count, leaving a model to read a shortened log as a complete one —
 * a failure to observe rendering as an observation, on the tool whose entire output is evidence.
 */
function capStudioPrints(raw: unknown, job: SandboxJob): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.prints)) return raw;
  const capped = capPrints(o.prints, job.limits.outputBytes);
  if (!capped.truncated) return { ...o, prints: capped.prints };
  return {
    ...o,
    prints: capped.prints,
    outputTruncated: true,
    outputNote: `${capped.dropped} further print line(s) were dropped at the ${job.limits.outputBytes}-byte output ceiling; what you see above is the part that fit, not the whole log`,
  };
}

/**
 * Ask the plugin to rasterise the scene. Rendering five views of a busy place is real CPU work
 * inside Studio, so this gets a longer timeout than an ordinary op.
 *
 * `size` is optional and omitted by every caller that wants the critique loop's own frame (the
 * plugin's 288x180 default). `compose_thumbnail` passes one because a store-page image has a
 * REQUIRED aspect ratio, and a 16:9 composition judged on a 16:10 frame is a composition judged on
 * a picture nobody will see. The op has carried `width`/`height` since it was written; nothing had
 * ever set them.
 */
async function renderViews(
  ctx: AgentCtx,
  target: string | undefined,
  view: string,
  size?: { width: number; height: number },
): Promise<RenderViewResult | { error: string }> {
  const res = await ctx.execStudioOp(
    {
      op: 'render_view',
      target,
      view: view as RenderViewResult['views'][number]['name'] | 'all',
      ...(size ? { width: size.width, height: size.height } : {}),
    },
    view === 'all' ? 90_000 : 45_000,
  );
  if (!res.ok) return { error: res.error ?? 'render failed' };
  const data = res.data as RenderViewResult & { error?: string };
  if (data?.error) return { error: data.error };
  if (!data?.views?.length && !data?.studioViewport?.rgbBase64) return { error: 'the renderer returned no views or native viewport pixels' };
  // Push the pixels to the browser as they arrive. This is the only path by
  // which a frame reaches the user; the tool result below still strips them.
  if (ctx.emitFrame) {
    if (data.studioViewport?.rgbBase64) {
      ctx.emitFrame(data.studioViewport);
    } else {
      for (const v of data.views) {
        if (!v.rgbBase64) continue;
        ctx.emitFrame({
          rgbBase64: v.rgbBase64,
          encoding: 'rgb24',
          source: 'software_render',
          width: v.meta.width,
          height: v.meta.height,
          view: v.name,
          subject: data.subject,
          capturedAt: Date.now(),
        });
      }
    }
  }
  return data;
}

// ---------------------------------------------------------------------------------------------
// Untrusted-asset brokerage — the half of the gate that only the customer's place can answer
//
// assets.ts builds the whole apparatus and states the one order that is safe. `insert_asset` used
// none of it past the metadata gate: it resolved an id and handed the asset to Studio. That solves
// the half of the problem that can be solved without touching a place — but `hasScripts` is a
// third-party CLAIM about a third-party asset, made by an undocumented endpoint, about contents
// that can change after they were inspected. Whether the thing that LANDED carries Luau is a
// different question, and only the place can answer it.
//
// So every insertion now runs the broker's post-insertion sequence, and the ORDER is the security
// property (assets.ts, `brokerAsset`):
//
//   insert -> enumerate the hierarchy -> read every script out of the place -> scan
//          -> delete what the scan condemns -> RE-LIST to prove nothing survived
//
// Reordering any of it defeats it: an agent that inserts and then decides it is happy has already
// run the attacker's code, and "we deleted the scripts we knew about" is bookkeeping, not proof.
// Anything that cannot be proven clean is deleted WHOLE and the tool refuses.
// ---------------------------------------------------------------------------------------------

function rec(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function libraryRunOf(ctx: AgentCtx): LibraryRun {
  return (ctx.libraryRun ??= {});
}

/** A library row by id: the bundled index, or a live Creator Store row this run's search returned. */
function libraryRow(ctx: AgentCtx, id: string): LibraryModel | null {
  return libraryModel(id) ?? ctx.liveLibraryRows?.[id] ?? null;
}

/**
 * Does the order gate (model-rule.ts) still hold a hand-built Model back in this run? Decided from the run alone:
 * the library must be on offer and usable here, not yet tried, and the gate not spent.
 */
function libraryOrder(ctx: AgentCtx): LibraryOrder {
  const run = libraryRunOf(ctx);
  return orderApplies({
    offered: !ctx.offeredTools || ctx.offeredTools.has('find_library_model'),
    usable: allowedSources(ctx.assetSources).includes('creator_store'),
    outcome: run.outcome,
    gated: run.gated,
  });
}

function noteOrderRefusal(ctx: AgentCtx): void {
  const run = libraryRunOf(ctx);
  run.gated = (run.gated ?? 0) + 1;
}

/** Record what a find_library_model call answered. An error is not an attempt: nothing was searched. */
function recordSearch(ctx: AgentCtx, result: unknown): unknown {
  const r = rec(result);
  if (typeof r.error === 'string') return result;
  const rows = Array.isArray(r.results) ? (r.results as unknown[]) : [];
  noteSearch(libraryRunOf(ctx), rows.map((row) => rec(row).id).filter((id): id is string => typeof id === 'string'));
  return result;
}

/** Record how insert_library_model ended: a refusal before anything was tried (bad id, source off) is not an attempt. */
function recordInsert(ctx: AgentCtx, a: Record<string, unknown>, result: unknown): unknown {
  const r = rec(result);
  const id = String(a.id ?? '');
  const row = libraryRow(ctx, id);
  if (!row) return result;
  const failed = typeof r.error === 'string';
  // A policy or argument refusal reached neither Roblox nor Studio, so it says nothing about the library.
  if (failed && r.stage === 'policy') return result;
  // A timeout may be tried once more, so its id is not written off; a load or scan failure is.
  noteInsert(libraryRunOf(ctx), id, row.assetId, !failed, { remember: r.retry !== true });
  return result;
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length ? v : null;
}

/** Pull `{ scripts: [{ path, class }] }` out of a `list_scripts` result, defensively. */
function scriptRows(data: unknown): { path: string; className: string }[] {
  const rows = rec(data).scripts;
  if (!Array.isArray(rows)) return [];
  const out: { path: string; className: string }[] = [];
  for (const r of rows) {
    const path = strOrNull(rec(r).path);
    if (path) out.push({ path, className: strOrNull(rec(r).class) ?? 'Script' });
  }
  return out;
}

/** The one endpoint whose payload the metadata gate believes, wrapped so absence can be seen. */
const DETAILS_PATH = '/toolbox-service/v1/items/details';

export interface DetailsIntegrity {
  /** Fields the details response failed to report. Non-empty means the gate ran on a guess. */
  missing: string[];
}

/**
 * Wrap the details fetch so a MISSING field fails closed.
 *
 * `judgeAssetDetails` reads `asset.hasScripts === true`. That is correct against a documented
 * schema and wrong against this one: `toolbox-service/v1/items/details` is undocumented, so a
 * rename, a schema change or a partial response all arrive as "the field is not there" — and
 * `undefined === true` is `false`, which reads as "this asset carries no scripts" and passes the
 * single most important assertion in the system without a sound.
 *
 * The fix belongs at the trust boundary rather than inside the judge, which is pure and has no way
 * to tell absent from false. Absence is recorded here and the entry is rewritten to
 * `hasScripts: true`, so a silent schema change takes exactly the path a script-bearing asset takes.
 * The caller reads `missing` and reports what actually happened, so the refusal is never dressed up
 * as a script nobody saw.
 */
export function strictDetailsFetch(seen: DetailsIntegrity, base?: FetchLike): FetchLike {
  const inner: FetchLike = base ?? ((url, init) => fetch(url, init as RequestInit) as unknown as Promise<HttpResponseLike>);
  return async (url, init) => {
    const res = await inner(url, init);
    if (!url.includes(DETAILS_PATH) || !res.ok) return res;
    let body: unknown;
    try {
      body = await res.json();
    } catch (e) {
      // A details response that will not parse is a refusal, not an empty one — hand the parse
      // failure straight back so `verifyCreatorStoreAsset` records it as fail_network.
      return { ok: res.ok, status: res.status, json: () => Promise.reject(e instanceof Error ? e : new Error(String(e))) };
    }
    const rows = rec(body).data;
    if (Array.isArray(rows)) {
      for (const row of rows) {
        const asset = rec(row).asset;
        // An absent `asset` is a not-found, which the judge already fails on. Only a present asset
        // that declines to say anything about scripts is the silent-pass case this exists for.
        if (typeof asset !== 'object' || asset === null) continue;
        const a = asset as Record<string, unknown>;
        if (typeof a.hasScripts !== 'boolean') {
          seen.missing.push('hasScripts');
          a.hasScripts = true;
        }
      }
    }
    return { ok: res.ok, status: res.status, json: async () => body };
  };
}

/** Where a library insert failed. `policy` means it was refused before Roblox or Studio was reached. */
type InsertStage = 'policy' | 'roblox_load' | 'scan' | 'place' | 'timeout';

const NO_MORE_CANDIDATES = 'no more candidates; continue per the asset order';

/** The library ids worth trying next: the run's last search, minus the one that just failed and every id that failed here. */
function nextLibraryIds(ctx: AgentCtx, exceptId?: string): string[] {
  const run = libraryRunOf(ctx);
  const failed = new Set(run.failedIds ?? []);
  return (run.candidates ?? []).filter((id) => id !== exceptId && !failed.has(libraryRow(ctx, id)?.assetId ?? -1)).slice(0, 3);
}

/**
 * EVERY insert error says where it failed, why, whether trying again can help, and what to try next. The live benchmark
 * (2026-10-02) showed the model hearing "Did not work" and retrying the same insert; a failure that names its stage and the
 * next candidate ids is something it can act on without another search.
 */
function insertFailure(
  ctx: AgentCtx,
  f: { stage: InsertStage; reason: string; retry: boolean; error?: string; libraryId?: string; extra?: Record<string, unknown> },
): Record<string, unknown> {
  const next = nextLibraryIds(ctx, f.libraryId);
  return { error: f.error ?? f.reason, stage: f.stage, reason: f.reason, retry: f.retry, next: next.length ? next : NO_MORE_CANDIDATES, ...(f.extra ?? {}) };
}

/** What a failed insert_asset op means, from its failure KIND where the plugin sent one, and its own words for the rest. */
function insertStage(res: { error?: string; failure?: string }): { stage: InsertStage; reason: string; retry: boolean } {
  const err = res.error ?? 'insert_asset failed';
  if (res.failure === 'timeout' || /timed out|did not answer/i.test(err)) {
    return { stage: 'timeout', reason: 'Studio did not answer in time; the model may have landed: read the tree under the parent before retrying once', retry: true };
  }
  if (/would not load asset/i.test(err)) return { stage: 'roblox_load', reason: 'Roblox would not load this id (it is not loadable for this place); try the next id and do not retry this one', retry: false };
  if (/carries \d+ script/i.test(err)) return { stage: 'scan', reason: 'this asset carries scripts and was not inserted; try the next id', retry: false };
  if (/contained nothing|inserted nothing/i.test(err)) return { stage: 'roblox_load', reason: 'this asset held nothing to insert; try the next id', retry: false };
  if (res.failure === 'invalid' || /outside (?:StudPilot|Apple|Golem)'s place scope|allowlist|ambiguous|no such|not found|path/i.test(err)) return { stage: 'policy', reason: err, retry: false };
  return { stage: 'roblox_load', reason: err, retry: false };
}

/** The parent as the plugin reads it: rooted at `game`. */
function rootedPath(path: string): string {
  return path === 'game' || path.startsWith('game.') || path.startsWith('game[') ? path : `game.${path.replace(/^workspace(?=$|[.[])/, 'Workspace')}`;
}

/** The last segment of a studio path, for either spelling (`.Name` or `["Odd Name"]`). */
function lastSegment(path: string): string | null {
  return /\["([^"\\]+)"\]$/.exec(path)?.[1] ?? /\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(path)?.[1] ?? null;
}

/** The tree read the scan runs on: the plugin's own ceiling first, and the old one for a plugin that refuses the larger ask. */
const SCAN_TREE_CAPS = [{ nodes: 1200, depth: 12 }, { nodes: 400, depth: 12 }] as const;

/**
 * Take the proven-clean roots out of their run-unique holder Folder: give each a name unique under the real parent, move it
 * there, and delete the empty holder. Any step that fails leaves the model INSIDE the holder, where its path is still
 * unambiguous, and says so; nothing here can lose the model.
 */
async function settleOutOfHolder(ctx: AgentCtx, holder: string, paths: string[], parentRoot: string): Promise<{ paths: string[]; warning?: string }> {
  const siblings = await ctx.execStudioOp({ op: 'get_tree', root: parentRoot, maxDepth: 1, maxNodes: 1200 }, 20_000);
  const used = new Set<string>();
  let complete = false;
  if (siblings.ok) {
    const root = rec(rec(siblings.data).root);
    for (const k of Array.isArray(root.children) ? root.children : []) {
      const name = strOrNull(rec(k).name);
      if (name) used.add(name);
    }
    // A child at the depth cap says `moreChildren` by design; only the node budget running out makes the sibling list incomplete.
    complete = rec(siblings.data).truncated !== true && root.truncated !== true;
  }
  const moves: { path: string; newParent: string }[] = [];
  const finals: string[] = [];
  for (const p of paths) {
    const base = lastSegment(p);
    if (!base) return { paths, warning: `left inside ${holder}: could not read the name of ${p}` };
    // An unread or cut sibling list cannot prove a name free, so it gets a suffix nothing else has.
    let name = base;
    if (!complete) name = `${base}_${Math.random().toString(36).slice(2, 6)}`;
    else for (let n = 2; used.has(name); n++) name = `${base}_${n}`;
    used.add(name);
    let at = p;
    if (name !== base) {
      const renamed = await ctx.execStudioOp({ op: 'rename_instance', path: p, name }, 20_000);
      at = appendStudioPath(holder, name) ?? p;
      if (!renamed.ok) return { paths, warning: `left inside ${holder}: renaming ${base} to a unique name failed (${renamed.error ?? 'rename failed'})` };
    }
    moves.push({ path: at, newParent: parentRoot });
    finals.push(appendStudioPath(parentRoot, name) ?? at);
  }
  const moved = await ctx.execStudioOp({ op: 'move_instances', moves }, 20_000);
  if (!moved.ok) return { paths: moves.map((m) => m.path), warning: `left inside ${holder}: moving it under ${parentRoot} failed (${moved.error ?? 'move failed'})` };
  const gone = await ctx.execStudioOp({ op: 'delete_instances', paths: [holder] }, 20_000);
  return gone.ok ? { paths: finals } : { paths: finals, warning: `the empty folder ${holder} could not be removed (${gone.error ?? 'delete failed'}); delete it` };
}

/**
 * Insert one verified id and prove the place clean afterwards, or leave the place as it was found.
 *
 * Returns a tool result: small, and free of any line of the source it removed. An attacker's Luau
 * belongs in the audit trail, not in the model's transcript where it becomes an instruction.
 *
 * THE ASSET LANDS INSIDE A RUN-UNIQUE FOLDER, not directly under the parent. Roblox keeps the model's own name, so a
 * second insert of the same id left two same-named siblings and every path-addressed op on either ("path is ambiguous")
 * failed. Inside `StudPilot_Insert_<n>` the path is unambiguous for the whole scan; once the roots are proven clean they are
 * given a name unique under the real parent and moved there. If the holder cannot be made the insert goes straight to the
 * parent, as it always did.
 */
async function insertAndProveClean(ctx: AgentCtx, assetId: number, parent: string, libraryId?: string): Promise<unknown> {
  const run = libraryRunOf(ctx);
  const seq = (run.inserts = (run.inserts ?? 0) + 1);
  const parentRoot = rootedPath(parent);
  const holderName = `StudPilot_Insert_${seq}_${Math.random().toString(36).slice(2, 6)}`;
  let holder: string | null = null;
  const holderPath = appendStudioPath(parentRoot, holderName);
  if (holderPath) {
    const made = await ctx.execStudioOp({ op: 'create_instances', items: [{ className: 'Folder', name: holderName, parent: parentRoot }] }, 20_000);
    if (made.ok) holder = holderPath;
  }

  const inserted = await ctx.execStudioOp({ op: 'insert_asset', assetId, parent: holder ?? parent }, 45_000);
  if (!inserted.ok) {
    let leftover: Record<string, unknown> = {};
    if (holder) {
      const del = await ctx.execStudioOp({ op: 'delete_instances', paths: [holder] }, 20_000);
      if (!del.ok) leftover = { projectMutated: true, manualCleanupRequired: [holder] };
    }
    const why = insertStage(inserted);
    return insertFailure(ctx, { ...why, libraryId, error: inserted.error ?? 'insert_asset failed', extra: leftover });
  }
  const raw = rec(inserted.data).inserted;
  const paths = (Array.isArray(raw) ? raw : []).filter((p): p is string => typeof p === 'string');
  if (!paths.length) {
    if (holder) await ctx.execStudioOp({ op: 'delete_instances', paths: [holder] }, 20_000);
    return insertFailure(ctx, { stage: 'roblox_load', reason: 'this asset held nothing to insert; try the next id', retry: false, libraryId, error: `asset ${assetId} inserted nothing — nothing was added to the place` });
  }

  /**
   * Remove the whole asset and refuse. Never leaves the place in the state the scan objected to, and never says "removed" when
   * it was not. The asset's own roots are deleted by path, exactly as before the holder existed; the holder Folder goes after
   * them, and is the fallback that takes the roots with it when deleting them by path fails.
   */
  const discard = async (why: string): Promise<unknown> => {
    let del = await ctx.execStudioOp({ op: 'delete_instances', paths }, 20_000);
    if (holder) {
      const folder = await ctx.execStudioOp({ op: 'delete_instances', paths: [holder] }, 20_000);
      // The holder holds whatever the first delete could not reach, so removing it can finish the job.
      if (folder.ok) del = { ...del, ok: true };
    }
    if (del.ok) {
      return insertFailure(ctx, { stage: 'scan', reason: why, retry: false, libraryId, error: `asset ${assetId} was inserted, refused and removed: ${why}`, extra: { removedWholeAsset: paths } });
    }
    return insertFailure(ctx, {
      stage: 'scan', reason: why, retry: false, libraryId,
      error: `asset ${assetId} was inserted at ${paths.join(', ')} and refused (${why}); removal also failed (${del.error ?? 'delete failed'}): delete ${paths.join(', ')} yourself`,
      extra: { removeFailed: del.error ?? 'delete failed', manualCleanupRequired: paths, projectMutated: true },
    });
  };

  // 1. Enumerate. A subtree that cannot be walked is a subtree whose contents are unknown, and
  //    unknown is never scored as empty. A read that WORKED but was cut at its cap is a different fact and is reported as one.
  const classes: string[] = [];
  let enumerationFailed = false;
  let treeTruncated = false;
  let caps: { nodes: number; depth: number } = SCAN_TREE_CAPS[0];
  for (const p of paths) {
    let tree = await ctx.execStudioOp({ op: 'get_tree', root: p, maxDepth: SCAN_TREE_CAPS[0].depth, maxNodes: SCAN_TREE_CAPS[0].nodes }, 20_000);
    if (!tree.ok && tree.failure === 'invalid') {
      caps = SCAN_TREE_CAPS[1];
      tree = await ctx.execStudioOp({ op: 'get_tree', root: p, maxDepth: SCAN_TREE_CAPS[1].depth, maxNodes: SCAN_TREE_CAPS[1].nodes }, 20_000);
    }
    if (!tree.ok) {
      enumerationFailed = true;
      continue;
    }
    const sum = summariseTree(tree.data);
    classes.push(...sum.classes);
    if (sum.truncated) treeTruncated = true;
  }

  // 2. Read the Luau back OUT OF THE PLACE. This is the whole point: the metadata said there was
  //    none, and this is the only reading of that claim that is not the claimant's own.
  const rows: { path: string; className: string }[] = [];
  for (const p of paths) {
    const listed = await ctx.execStudioOp({ op: 'list_scripts', root: p }, 20_000);
    if (!listed.ok) {
      enumerationFailed = true;
      continue;
    }
    rows.push(...scriptRows(listed.data));
  }
  if (rows.length > SCAN_LIMITS.maxScripts) {
    return discard(`${rows.length} scripts in one asset, over the ${SCAN_LIMITS.maxScripts} scan cap — refused on count alone rather than partially cleared`);
  }
  const scripts: ScannedScriptInput[] = [];
  for (const s of rows) {
    const read = await ctx.execStudioOp({ op: 'read_script', path: s.path }, 20_000);
    // null, never '': a source that could not be read is the worst case, not the empty one.
    scripts.push({ path: s.path, className: s.className, source: read.ok ? strOrNull(rec(read.data).source) : null });
  }

  // 3. Judge.
  const scan = scanInsertedHierarchy({ rootPath: paths[0] as string, scripts, instanceClasses: classes, enumerationFailed, treeTruncated, treeCaps: caps });
  if (scan.verdict === 'reject') return discard(scan.reasons[0] ?? 'the safety scan rejected this asset');

  // 4. Strip what the scan condemned. A failed delete is a discard, not a warning.
  if (scan.removePaths.length) {
    const del = await ctx.execStudioOp({ op: 'delete_instances', paths: scan.removePaths }, 20_000);
    if (!del.ok) return discard(`${scan.removePaths.length} condemned script(s) could not be deleted (${del.error ?? 'delete failed'})`);
  }

  // 5. PROVE it. Re-listing is the only step that says anything about the place rather than about
  //    our own bookkeeping, so a listing that fails here is a refusal like any other.
  const leftover: string[] = [];
  for (const p of paths) {
    const listed = await ctx.execStudioOp({ op: 'list_scripts', root: p }, 20_000);
    if (!listed.ok) return discard('the post-removal script listing failed, so the place cannot be proven clean');
    leftover.push(...scriptRows(listed.data).map((s) => s.path));
  }
  if (leftover.length) return discard(`${leftover.length} script(s) survived removal: ${leftover.slice(0, 6).join(', ')}`);

  // 6. Out of the holder, under names nobody else has.
  let finalPaths = paths;
  let warning: string | undefined;
  if (holder) {
    const settled = await settleOutOfHolder(ctx, holder, paths, parentRoot);
    finalPaths = settled.paths;
    warning = settled.warning;
  }
  ctx.noteCreated?.(finalPaths);

  // The plugin makes a name that is already taken unique ("Lamp" becomes "Lamp (2)"); say so (dup-names).
  const renamed = rec(inserted.data).renamed;
  return {
    assetId,
    inserted: finalPaths,
    ...(Array.isArray(renamed) && renamed.length ? { renamed } : {}),
    scan: scan.verdict,
    // Codes and one-line reasons only. An excerpt of the removed Luau would put the attacker's text
    // into the transcript, where the model reads it as prose.
    stripped: scan.scripts
      .filter((s) => s.action === 'remove')
      .map((s) => ({ path: s.path, class: s.className, severity: s.severity, why: [...new Set(s.findings.map((f) => f.code))].join(', ') })),
    ...(scan.findings.length ? { notes: scan.findings.slice(0, 6).map((f) => `${f.severity} ${f.code}: ${f.message}`) } : {}),
    proven: `re-listed after removal: zero scripts remain under ${finalPaths.join(', ')}`,
    ...(warning ? { placementWarning: warning } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// run_luau's asset-ingress filter
//
// `run_luau` hands the model's Luau to the plugin's `run_code`, which concatenates it into a
// ModuleScript and requires it in PLUGIN context. That is a legitimate and load-bearing escape
// hatch — loops for trim and railings, terrain, bulk property edits, measurement — and it was also,
// verbatim, the primitive `insert_asset` is gated for: `game:GetObjects("rbxassetid://123")` is one
// line, and it reached the same place with none of the verification, none of the post-insertion
// scan, and no audit row.
//
// THE TRADE. Blocking the tool, or admitting only an allowlist of Luau, would cost far more than
// the gap is worth: almost everything the agent builds well, it builds with a loop. So the filter
// is narrow by construction — it refuses ASSET INGRESS and nothing else, and every refusal names
// `insert_asset` as the way to do the thing the code was reaching for. Ordinary building Luau
// contains none of these tokens, so the false-positive surface is close to zero.
//
// WHAT IT DOES NOT CLAIM. This is a pattern filter over source text, not a Luau evaluator, and a
// determined model can still defeat it:
//   * a string assembled through values the fold cannot resolve — a table of byte values, a loop
//     over `string.sub`, arithmetic on character codes, `table.concat` of computed parts;
//   * an ingress primitive reached through an alias captured before the call
//     (`local f = game.GetObjects` is caught, `local f = game[k]` with a computed `k` is not — which
//     is the whole reason computed indexing of `game` is refused outright);
//   * `edit_script` writing a game Script that calls `GetObjects`, then `run_and_check` running it.
//     That is a deliberate product capability — the user asked for a game — and is out of scope
//     here; it is bounded by the user owning and reading the scripts StudPilot writes.
//   * ASSIGNING A COMPUTED ASSET URI TO A CONTENT PROPERTY. `Paths.setProp` in the plugin refuses an
//     unverified `MeshId` / `Texture` / `SoundId`, which closes this for `create_instances` and
//     `set_properties` — but `run_code` executes Luau straight against the engine and never goes
//     through `setProp`, so that policy does not apply here. Measured as still allowed:
//     `m.MeshId = a .. b` through variables, `string.format("%s://%d", "rbxassetid", 999)`,
//     `table.concat({"rbxasset", "id://999"})`. The literal-fold catches adjacent literals only.
//     This is a LICENCE-AND-PROVENANCE hole, not code execution: those properties load inert media.
//     Recorded because the asymmetry is the dangerous part — a reader who knows the plugin gates
//     Content properties would reasonably assume all three ops are covered, and two of them are.
// So this raises the cost of the direct path and makes the indirect ones look like what they are.
// It is not a sandbox, and nothing downstream may be built as though it were one: the real
// guarantee still comes from the post-insertion scan that `insert_asset` runs inside the place.
// ---------------------------------------------------------------------------------------------

/** One refusal: a stable code for the audit trail, and the sentence the model is shown. */
export interface LuauIngressFinding {
  code: string;
  why: string;
}

/** End index of a `[[ … ]]` / `[==[ … ]==]` span starting at `i`, or null. Strings and comments both. */
function longBracketAt(src: string, i: number): number | null {
  if (src[i] !== '[') return null;
  let j = i + 1;
  let eq = 0;
  while (src[j] === '=') {
    eq += 1;
    j += 1;
  }
  if (src[j] !== '[') return null;
  const close = ']' + '='.repeat(eq) + ']';
  const at = src.indexOf(close, j + 1);
  return at < 0 ? src.length : at + close.length;
}

/**
 * Remove comments, leaving string literals intact.
 *
 * String-aware on purpose. A naive "cut from `--` to end of line" is a bypass rather than a
 * simplification: `local s = "--" game:GetObjects(id)` would lose the half of the line that
 * matters. Comments are removed at all so that `-- never call game:GetObjects here` is not a
 * refusal.
 */
function stripLuauComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i] as string;
    if (ch === '-' && src[i + 1] === '-') {
      const long = longBracketAt(src, i + 2);
      if (long !== null) {
        i = long;
      } else {
        while (i < src.length && src[i] !== '\n') i += 1;
      }
      out += ' ';
      continue;
    }
    const long = longBracketAt(src, i);
    if (long !== null) {
      out += src.slice(i, long);
      i = long;
      continue;
    }
    if (ch === '"' || ch === "'") {
      out += ch;
      i += 1;
      while (i < src.length) {
        const c = src[i] as string;
        out += c;
        i += 1;
        if (c === '\\') {
          if (i < src.length) {
            out += src[i];
            i += 1;
          }
          continue;
        }
        if (c === ch) break;
      }
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Printable ASCII only. Decoding a control character helps nobody and could split a token. */
function printableChar(code: number, fallback: string): string {
  return code >= 32 && code <= 126 ? String.fromCharCode(code) : fallback;
}

/** `\65`, `\x41`, `\u{41}` → `A`. Applied per segment so an escaped backslash never starts one. */
function decodeLuauEscapes(seg: string): string {
  return seg
    .replace(/\\(\d{1,3})/g, (m, d: string) => printableChar(parseInt(d, 10), m))
    .replace(/\\x([0-9a-fA-F]{2})/g, (m, h: string) => printableChar(parseInt(h, 16), m))
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (m, h: string) => printableChar(parseInt(h, 16), m));
}

/**
 * Undo the two evasions that are cheap to write and cheap to reverse: escape sequences, and
 * strings assembled out of literals.
 *
 * `"\114bxassetid://"`, `"rbxasset" .. "id://"` and `string.char(114,98,120)` all mean one thing to
 * the Luau parser, so they have to mean one thing here. The fold is textual and deliberately
 * conservative: anything it cannot resolve is left exactly as written rather than guessed at, and
 * the rules run over BOTH the original text and the folded text, so folding can only add findings.
 */
function foldLuauLiterals(src: string): string {
  // Split on the escaped backslash rather than substituting a sentinel: `"\\120"` is a backslash
  // followed by three digits, not the character `x`.
  let s = src
    .split('\\\\')
    .map(decodeLuauEscapes)
    .join('\\\\');

  s = s.replace(/\bstring\.char\s*\(([^()]*)\)/g, (m, args: string) => {
    const parts = args.split(',').map((p) => p.trim());
    if (!parts.length || !parts.every((p) => /^\d{1,3}$/.test(p))) return m;
    return '"' + parts.map((p) => printableChar(Number(p), '')).join('') + '"';
  });

  // Fixed point rather than a single pass: `"a" .. "b" .. "c"` needs two.
  for (let pass = 0; pass < 8; pass += 1) {
    const next = s
      .replace(/(['"])([^'"\n]*)\1\s*\.\.\s*(['"])([^'"\n]*)\3/g, (_m, q: string, a: string, _q2: string, b: string) => q + a + b + q)
      .replace(/(\d)\s*\.\.\s*(\d)/g, '$1$2');
    if (next === s) return s;
    s = next;
  }
  return s;
}

/**
 * The tokens that mean "geometry from outside this place is about to arrive", plus the two that
 * mean "the source above is not the code that will run".
 */
const LUAU_INGRESS_RULES: readonly { code: string; pattern: RegExp; why: string }[] = [
  {
    code: 'get_objects',
    pattern: /\bGetObjects\b/,
    why: 'game:GetObjects loads an arbitrary asset id straight into the place — it is the exact primitive insert_asset exists to gate',
  },
  {
    code: 'insert_service',
    pattern: /\bInsertService\b|\bLoadAssetVersion\b|\bLoadAsset\b/,
    why: 'InsertService:LoadAsset / LoadAssetVersion insert a third-party asset with no verification',
  },
  {
    code: 'asset_uri',
    pattern: /rbx(?:assetid|thumb|http|gameasset):\/\//i,
    why: 'an rbxassetid:// or rbxthumb:// literal references content that has not been through the asset gate',
  },
  {
    code: 'content_from_asset',
    pattern: /\bContent\s*\.\s*from(?:AssetId|Uri)\b/,
    why: 'Content.fromAssetId / Content.fromUri hands an unverified asset id to AssetService',
  },
  {
    code: 'dynamic_code',
    pattern: /\bloadstring\s*\(|\bgetfenv\s*\(|\bsetfenv\s*\(/,
    why: 'loadstring/getfenv decide at runtime what code runs, so nothing in the source above them can be checked',
  },
  {
    code: 'computed_member',
    pattern: /\bgame\s*\[\s*[^'"\]\s]/,
    why: 'game[<computed>] hides which member is called; write game.Workspace or game:GetService("…") instead',
  },
];

/** The argument text of every `require(…)` call, brackets balanced. */
function requireArgs(src: string): string[] {
  const out: string[] = [];
  const re = /\brequire\s*\(/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const from = i;
    while (i < src.length && depth > 0) {
      if (src[i] === '(') depth += 1;
      else if (src[i] === ')') depth -= 1;
      i += 1;
    }
    out.push(src.slice(from, depth === 0 ? i - 1 : src.length));
  }
  return out;
}

/**
 * Everything `run_luau` refuses, as findings rather than a boolean, so the refusal can say WHICH
 * primitive was reached for.
 *
 * `require` is judged by its argument. A numeric literal is the classic marketplace backdoor, and
 * an argument with no path structure at all — a bare name, a call, `tonumber(s)` — cannot be read
 * from the source, so it is indistinguishable from one. Anything that traverses a path is allowed
 * (`require(script.Parent.Config)`, `require(SS.Modules.Config)` where `SS` is a service captured
 * further up), because that is what the legitimate uses of this tool look like and refusing them
 * would cost more than the rule is worth.
 */
export function scanLuauForAssetIngress(code: string): LuauIngressFinding[] {
  const stripped = stripLuauComments(code);
  const variants = [stripped, foldLuauLiterals(stripped)];
  const found = new Map<string, string>();
  for (const rule of LUAU_INGRESS_RULES) {
    if (variants.some((v) => rule.pattern.test(v))) found.set(rule.code, rule.why);
  }
  for (const variant of variants) {
    for (const arg of requireArgs(variant)) {
      const a = arg.trim();
      if (/^["']?\d/.test(a)) {
        found.set('require_asset_id', 'require(<asset id>) pulls a module off the marketplace at runtime — the classic Roblox backdoor');
      } else if (/\btonumber\b/.test(a) || !/[.:]/.test(a)) {
        found.set('require_computed', `require(${a.slice(0, 40)}) resolves to something the source does not say, so what it loads is unknown; require a module by its path`);
      }
    }
  }
  return [...found].map(([code_, why]) => ({ code: code_, why }));
}

/**
 * The refusal itself, shared by `run_luau` and by the admin diagnostics route, so the two cannot
 * drift apart. Returns null when the code may run.
 */
/** The texts a Luau rule reads: comments stripped, then literals folded (see scanLuauForAssetIngress). */
export function luauScanVariants(code: string): string[] {
  const stripped = stripLuauComments(code);
  return [stripped, foldLuauLiterals(stripped)];
}

export function refuseLuauIngress(code: string): { error: string; blocked: string[] } | null {
  const findings = scanLuauForAssetIngress(code);
  if (!findings.length) return null;
  return {
    error:
      `this Luau was refused because it reaches for an asset-ingress primitive: ${findings.map((f) => f.why).join('; ')}. ` +
      'Luau is not how assets enter a place. Find an id with find_verified_asset and insert it with insert_asset, ' +
      'which verifies the id and then reads the place back to prove nothing executable arrived with it. ' +
      'Everything else run_luau does — loops, bulk property edits and measurement — is unaffected; Terrain uses edit_terrain.',
    blocked: findings.map((f) => f.code),
  };
}

/**
 * Write the attribution row for an asset that has just been placed.
 *
 * EVERY ROW THIS WRITES IS NOW UNACCOUNTED, AND THAT IS THE HONEST ANSWER RATHER THAN A GAP.
 * The ledger keys on a namespaced provenance slug like `kenney/city-kit-suburban/building-a-01`,
 * because a Roblox id says nothing about where the bytes came from or under what licence. Those
 * slugs came from the curated library, and the library was removed on 2026-09-20 — so an id
 * arriving at `insert_asset` today is, by construction, a Creator Store id or one the user pasted,
 * and StudPilot knows nothing about its licence beyond what the Creator Store said when it was gated.
 *
 * It is therefore keyed `unaccounted:roblox:<id>`, which contains a colon and can never satisfy
 * the provenance id pattern, so `provenance.ts`'s left join always misses and the credits panel
 * renders it as provenance-unknown. That is the one state `provenance: null` exists to express,
 * and it is what the customer should see: StudPilot placed this, and cannot tell you who made it.
 *
 * WHAT USED TO BE HERE, so nobody re-adds it. This function asked D1 for a library row matching
 * the Roblox id, on every insertion, so that an asset that WAS in the library got credited no
 * matter how its number reached the tool. With the table gone that query can only ever answer
 * `no such table`, which is a network round-trip whose result is known before it is made.
 *
 * Returns the key it wrote, or null when there was nothing to write it against.
 */
/**
 * Isolate-scoped, not global: a fresh isolate pays for one extra
 * `create table if not exists` and every insertion after it pays nothing. Getting this
 * wrong costs three cheap DDL statements, never correctness — which is why the flag is
 * set AFTER the call rather than before it, so a failed creation is retried.
 */
let provenanceTablesReady = false;

async function recordPlacedAsset(
  ctx: AgentCtx,
  assetId: number,
  parent: string,
): Promise<{ assetId: string; accounted: boolean; recorded?: false; why?: string } | null> {
  if (!ctx.projectId) return null;
  try {
    if (!provenanceTablesReady) {
      await ensureProvenanceTables(ctx.env);
      provenanceTablesReady = true;
    }
    const key = `unaccounted:roblox:${assetId}`;
    // `viaLiveApi` is false here and it is a claim, not a default: it records that the
    // credit was not obtained by calling an origin's own API at placement time. Nothing
    // on this path does — the insertion touches Roblox and nobody else.
    await recordAssetUse(ctx.env, ctx.projectId, key, {
      viaLiveApi: false,
      context: parent,
    });
    return { assetId: key, accounted: false };
  } catch (e) {
    // The reason travels back with the failure. A bare `catch { return null }` reported a
    // permanent schema mistake — a renamed column in `recordAssetUse` — exactly like a
    // one-off D1 blip, which is the same "well-covered logic, nothing watches the wiring"
    // shape this producer was written to fix. The placement still stands; only the record
    // is lost, and now it says what lost it.
    return { assetId: `unaccounted:roblox:${assetId}`, accounted: false, recorded: false, why: scrubEngineIdentity(String(e instanceof Error ? e.message : e)).slice(0, 160) };
  }
}

/* --------------------------------------------------- the web tools' one capability ---
 *
 * webtools.ts holds the contracts, the allowlists and the failure shapes, and it deliberately
 * imports nothing heavy — it can be loaded and exercised on its own. The one capability that
 * genuinely needs the rest of this worker is wired in here instead: putting a captured image in
 * front of the USER (KV storage plus the panel `generate_image` already uses). No image is ever
 * sent to a model (M4: there is no vision in the product).
 *
 * It is OPTIONAL on the web-tool context and has a defined absence: a missing capability is
 * reported as one rather than showing up as an invisible screenshot.
 */

/** The AgentCtx a web tool sees. Capabilities are attached only where they can actually work. */
function webCtx(ctx: AgentCtx): WebToolCtx {
  return {
    env: ctx.env,
    projectId: ctx.projectId,
    fetchImpl: ctx.webFetch,
    workspace: ctx.workspace,
    showImage: async (pngBase64, subject, meta) => {
      // No project means no key to store the pixels under and no route that could serve them —
      // the same refusal `generate_image` makes, and for the same reason. Returning false here is
      // what makes `screenshot_page` say "captured but not displayed" instead of implying a
      // picture the user can never see.
      if (!ctx.projectId) return false;
      const imageId = await storeImage(ctx.env, pngBase64, ctx.projectId);
      ctx.uiDetail = imagePanel(ctx.projectId, imageId, subject, meta);
      return true;
    },
  };
}

/**
 * find_library_model, as one function so the run records what the library answered (library-run.ts) around it,
 * whichever of its several return paths answered.
 */
async function findLibraryModelCall(ctx: AgentCtx, a: Record<string, unknown>): Promise<unknown> {
  const query = a.query === undefined ? undefined : String(a.query);
  const found = findLibraryModels({
    query,
    genre: a.genre ? String(a.genre) : undefined,
    kind: a.kind ? String(a.kind) : undefined,
    limit: Math.max(10, a.limit === undefined ? 10 : Number(a.limit)),
    creatorStoreOnly: true,
    includeThirdParty: a.includeThirdParty === true,
  });
  const rejected = new Set(ctx.rejectedLibraryAssetIds ?? []);
  const requestedObject = visualAssetAnchor(query ?? '', []);
  const wanted = found.results.length;
  const cap = a.limit === undefined ? 10 : Math.max(1, Math.min(40, Number(a.limit) || 10));
  const kept = found.results.filter((row) => row.assetId !== undefined && !rejected.has(row.assetId)
    && matchesVisualAnchor(row.name, requestedObject ?? undefined)
    && matchesVisualAnchor(row.name, ctx.assetChoiceAnchor));
  found.results = kept.slice(0, cap);
  // Said, not silent: rows left out because their name lacks the last word of the agent's own query.
  const leftOut = wanted - kept.length;
  if (leftOut > 0 && requestedObject) found.note = `${leftOut} row(s) matching your words were left out because their name does not contain "${requestedObject}" (the last word of your query, or an anchor from the user's rejection); search other words to see them.${found.note ? ' ' + found.note : ''}`;
  // The bundled index holds a few hundred rows; ordinary nouns it lacks are looked up live (creator-store-live.ts): free, verified
  // creator, zero scripts, ranked by name. Skipped, and said so, when the project's asset sources do not allow the Creator Store.
  let liveNote = '';
  if (ctx.liveCreatorStore && query?.trim() && found.results.length < LIVE_TOP_UP) {
    const refusedSource = sourceRefusal(ctx.assetSources, 'creator_store', ctx.askAssetSources, ctx.assetSettingsUnread);
    if (refusedSource) liveNote = `Live Creator Store search was not run: ${refusedSource}`;
    else {
      // The same name rule as the bundled rows: the last word of the query (or the user's rejection anchor) is in the name.
      const live = await searchLiveModels(ctx.env, query, {
        limit: cap - found.results.length, exclude: rejected, fetchImpl: ctx.liveStoreFetch,
        accept: (name) => matchesVisualAnchor(name, requestedObject ?? undefined) && matchesVisualAnchor(name, ctx.assetChoiceAnchor),
      });
      const rows = live.results;
      const store = (ctx.liveLibraryRows ??= {});
      for (const row of rows) store[row.id] = row;
      const keys = Object.keys(store);
      for (const k of keys.slice(0, Math.max(0, keys.length - LIVE_ROWS_KEPT))) delete store[k];
      found.results = [...found.results, ...rows];
      liveNote = live.error && !rows.length ? `${live.note} (${live.error})` : live.note;
    }
  }
  if (liveNote) found.note = `${found.note ? found.note + ' ' : ''}${liveNote}`;
  if (!found.results.length && requestedObject) found.note = `No verified Creator Store model named ${requestedObject} is available${liveNote ? ' (' + liveNote.replace(/\.$/, '') + ')' : ''}. Try other words (several queries are fine), or take the next step of the asset order (Creator Store, adapt or combine, then Parts in full detail); do not pass off an unrelated preview as this object. If the request cannot work without it, record it as an UNRESOLVED ESSENTIAL GAP and name it in your final summary.`;
  return found;
}

/** Below this many bundled rows, find_library_model also searches the live Creator Store. */
const LIVE_TOP_UP = 5;
/** Live rows a run remembers for insert_library_model; older ones are forgotten first. */
const LIVE_ROWS_KEPT = 60;

/** insert_library_model, as one function so the run can record how the library insert ended (library-run.ts). */
async function insertLibraryModelCall(ctx: AgentCtx, a: Record<string, unknown>): Promise<unknown> {
  const refuse = (reason: string, extra?: Record<string, unknown>) => insertFailure(ctx, { stage: 'policy', reason, retry: false, ...(extra ? { extra } : {}) });
  if (a.id === undefined) return refuse('give { id } from find_library_model');
  let pick = libraryRow(ctx, String(a.id ?? ''));
  if (!pick && String(a.id ?? '').startsWith(LIVE_ID_PREFIX)) {
    // A live id this run did not search for (the previous run offered it and the owner picked it) is taken only when it is
    // exactly the asset the project owner approved, and only after the same gate a search applies.
    const wantedId = liveAssetIdOf(String(a.id));
    if (wantedId !== null && wantedId === ctx.approvedLibraryAssetId) {
      const got = await fetchLiveModel(ctx.env, wantedId, { fetchImpl: ctx.liveStoreFetch });
      if (!got.ok) return refuse(`${String(a.id)} could not be verified as a free, script-free model from a verified creator (${got.reason}); search again and take another row.`);
      (ctx.liveLibraryRows ??= {})[got.model.id] = got.model;
      pick = got.model;
    }
  }
  if (!pick) return refuse(`${String(a.id ?? '')} is not a library id. Call find_library_model and pass one of its ids unchanged.`);
  if (pick.assetId === undefined) return refuse('This downloaded library file would upload a new permanent Model into your Roblox account. The current asset-source choices do not authorise that. Choose a Creator Store id from find_library_model instead.');
  const refused = sourceRefusal(ctx.assetSources, 'creator_store', ctx.askAssetSources, ctx.assetSettingsUnread);
  if (refused) return refuse(refused);
  if ((libraryRunOf(ctx).failedIds ?? []).includes(pick.assetId)) {
    return insertFailure(ctx, { stage: 'policy', reason: 'this id already failed in this run, so it was not sent to Studio again; take the next candidate', retry: false, libraryId: pick.id,
      error: `${pick.id} (asset ${pick.assetId}) already failed earlier in this run and was not tried again. Nothing was sent to Studio.` });
  }
  const pos = a.position === undefined ? [0, 0, 0] : boundedTriple(a.position, 'position', DIRECT_EDIT_LIMITS.translation);
  if (!Array.isArray(pos)) return refuse(pos.error);
  const scale = a.scale === undefined ? undefined : Number(a.scale);
  if (scale !== undefined && !(scale >= DIRECT_EDIT_LIMITS.minScale && scale <= DIRECT_EDIT_LIMITS.maxScale)) return refuse(`scale must be between ${DIRECT_EDIT_LIMITS.minScale} and ${DIRECT_EDIT_LIMITS.maxScale}`);
  const height = a.height === undefined ? undefined : Number(a.height);
  if (height !== undefined && !(height > 0 && height <= 2000)) return refuse('height must be between 0 and 2000 studs');
  const longest = a.size === undefined ? undefined : Number(a.size);
  if (longest !== undefined && !(longest > 0 && longest <= 2000)) return refuse('size must be between 0 and 2000 studs');
  if ([scale, height, longest].filter((v) => v !== undefined).length > 1) return refuse('give one of size (longest side in studs), height or scale, not several');

  const assetId = pick.assetId;
  const placed = rec(await insertAndProveClean(ctx, assetId, String(a.parent ?? 'game.Workspace'), pick.id));
  if ('error' in placed) return { ...placed, library: pick.id };
  let paths = (Array.isArray(placed.inserted) ? placed.inserted : []).filter((p): p is string => typeof p === 'string');
  if (paths.length > 1) {
    const grouped = await ctx.execStudioOp({ op: 'group_instances', paths, name: pick.name.replace(/[^A-Za-z0-9 _-]+/g, '').slice(0, 50) || 'LibraryModel' }, 20_000);
    const path = grouped.ok ? strOrNull(rec(grouped.data).path) : null;
    if (path) paths = [path];
    ctx.noteCreated?.(paths);
  }
  const run = libraryRunOf(ctx);
  const where = paths.length === 1
    ? await placeInserted((o, t) => ctx.execStudioOp(o as StudioOp, t), paths[0]!, pick, { position: pos, scale, height, longest, avoid: (run.placed ?? []).map((p) => ({ x: p.at[0], z: p.at[2], r: p.r })) })
    : { error: 'inserted as several pieces; left where Roblox put them' };
  if (!('error' in where) && paths.length === 1 && where.position.length === 3) notePlaced(run, paths[0]!, [where.position[0]!, where.position[1]!, where.position[2]!], where.size ? footprintRadius(where.size as [number, number, number]) : 1);
  const here = !('error' in where) && where.position.length === 3 ? where.position.map((n) => Math.round(n * 10) / 10) : undefined;
  return {
    ...placed,
    inserted: paths,
    library: { id: pick.id, name: pick.name, kind: pick.kind, licence: pick.licence, ...(pick.attribution ? { attribution: pick.attribution } : {}) },
    ...('error' in where ? { placementWarning: where.error } : { placed: where }),
    // Where it went, and where the run's other models stand: a model inserted with no position stands at the origin, and the agent
    // must put it somewhere (round 3: four crystals sat stacked at (0, 2, 0) for the whole run).
    ...(here ? { placementNote: `${a.position === undefined ? `No position was given, so it stands at (${here.join(', ')}). ` : ''}${(run.placed?.length ?? 0) > 1 ? `Models you placed this run: ${(run.placed ?? []).slice(-8).map((p) => `${lastSegment(p.path) ?? p.path} at (${p.at.map((n) => Math.round(n)).join(', ')})`).join('; ')}. ` : ''}Put it where it belongs with transform_instances, or copy it onto the map with clone_instances (at [[x, y, z], ...]).` } : {}),
  };
}

/**
 * Send a create_instances list as one call, or as sequential calls when it is over the per-call limits (studio-props.ts
 * CREATE_LIMITS). A call that fails after earlier ones landed says how many items DID land, so the model carries on from
 * there instead of rebuilding what is already in the place; those calls changed Studio, so the result says so.
 */
async function createInBatches(ctx: AgentCtx, items: unknown[]): Promise<unknown> {
  const batches = planCreateBatches(items);
  if (batches.length <= 1) return op(ctx, { op: 'create_instances', items: items as never[] });
  const merged: Record<string, unknown> = {};
  let landed = 0;
  for (let i = 0; i < batches.length; i++) {
    const res = await op(ctx, { op: 'create_instances', items: batches[i] as never[] });
    const r = rec(res);
    if (typeof r.error === 'string') {
      const where = `Batch ${i + 1} of ${batches.length} failed`;
      return landed
        ? { ...r, error: `${where} after ${landed} of ${items.length} items were created: ${r.error} The ${items.length - landed} items from index ${landed} on were not created; send those again once the cause is fixed.`, createdItems: landed, projectMutated: true }
        : { ...r, error: `${where}: ${r.error}` };
    }
    landed += batches[i]!.length;
    for (const [key, value] of Object.entries(r)) merged[key] = Array.isArray(value) && Array.isArray(merged[key]) ? [...(merged[key] as unknown[]), ...value] : value;
  }
  // Hundreds of created paths would push the result past the tool-result ceiling and cut it mid-JSON; the head is enough to
  // address what was built, and the count says the rest exists.
  const compact: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(merged)) {
    if (Array.isArray(value) && value.length > 20) { compact[key] = value.slice(0, 20); compact[`${key}More`] = value.length - 20; } else compact[key] = value;
  }
  return { ...compact, batches: batches.length, createdItems: landed };
}

/** Copies the plugin's place_copies op handles per call (apps/studpilot-plugin/src/ops/Compose.luau MAX_PLACE). */
const PLACE_COPIES_PER_CALL = 200;

/**
 * clone_instances with a placement: lay the copies out here (placement.ts), then send them as place_copies ops of at most
 * 200. The plugin op copies the piece (a Folder wrapper is unwrapped to the model inside it), strips scripts, anchors parts
 * and stands the copy with its bottom on `at`, scaled to a height when asked. Names are made unique against the parent's
 * existing children, so a second call continues where the first stopped.
 */
async function placeCopiesCall(ctx: AgentCtx, a: Record<string, unknown>, sources: string[], parentArg: string | undefined): Promise<unknown> {
  if (sources.length > 8) return { error: 'give at most 8 template paths to cycle through' };
  const plan = planCopies(
    { at: a.at, along: a.along, within: a.within, yaw: a.yaw, scale: a.scale, jitter: a.jitter, seed: a.seed },
    DIRECT_EDIT_LIMITS.translation,
  );
  if ('error' in plan) return { error: plan.error };
  const first = sources[0]!;
  const parentOf = (path: string) => path.replace(/\.[^.\[\]]+$|\["[^"]+"\]$/, '');
  const inWorkspace = (path: string) => path === 'game.Workspace' || path.startsWith('game.Workspace.') || path.startsWith('game.Workspace[');
  const parent = parentArg ?? (inWorkspace(parentOf(first)) ? parentOf(first) : 'game.Workspace');
  const notes: string[] = plan.note ? [plan.note] : [];

  // Heights, for a scale: each template measured once.
  const heights = new Map<string, number>();
  if (plan.copies.some((c) => c.scale !== undefined)) {
    for (const source of sources) {
      const b = await ctx.execStudioOp({ op: 'spatial_query', action: 'bounds', path: source } as StudioOp, 15_000);
      const size = rec(b.ok ? b.data : null).size;
      const h = Array.isArray(size) ? Number(size[1]) : NaN;
      if (!(h > 0)) return { error: `could not measure ${source} to scale it (${b.ok ? 'no size reported' : (b.error ?? 'spatial_query bounds failed')}). Check the path, or drop scale.` };
      heights.set(source, h);
    }
  }

  // `within` without a y: the ground under the area's centre, measured once.
  let groundY: number | undefined;
  if (plan.needsGround) {
    const cx = plan.copies.reduce((n, c) => n + c.at[0], 0) / plan.copies.length;
    const cz = plan.copies.reduce((n, c) => n + c.at[2], 0) / plan.copies.length;
    const g = await ctx.execStudioOp({ op: 'spatial_query', action: 'find_ground', position: [cx, 500, cz] } as StudioOp, 15_000);
    const hit = rec(rec(g.ok ? g.data : null).result);
    const pos = hit.position;
    if (hit.hit === true && Array.isArray(pos) && Number.isFinite(Number(pos[1]))) {
      groundY = Number(pos[1]);
      notes.push(`Ground height was measured once, at the centre of the area (y ${Math.round(groundY * 10) / 10}), and used for every copy. On rolling terrain use scatter_instances, which drops each copy onto the ground.`);
    } else {
      return { error: 'within has no y and there is no ground under its centre to measure. Give within.y, or build the ground first.' };
    }
  }

  // Names that cannot collide with what the parent already holds.
  const base = (lastSegment(first) ?? 'Copy').replace(/[^A-Za-z0-9_ -]/g, '').slice(0, 40) || 'Copy';
  const tree = await ctx.execStudioOp({ op: 'get_tree', root: parent, maxDepth: 1, maxNodes: 1200 }, 20_000);
  let next = 1;
  if (tree.ok) {
    const pattern = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_(\\d+)$`);
    for (const k of Array.isArray(rec(rec(tree.data).root).children) ? (rec(rec(tree.data).root).children as unknown[]) : []) {
      const n = Number(pattern.exec(String(rec(k).name ?? ''))?.[1]);
      if (Number.isFinite(n) && n >= next) next = n + 1;
    }
  }
  const stem = typeof a.name === 'string' && a.name.trim() ? a.name.trim().replace(/[^A-Za-z0-9_ -]/g, '').slice(0, 40) || base : base;

  const items = plan.copies.map((c, i) => {
    const from = sources[i % sources.length]!;
    const item: Record<string, unknown> = { from, parent, name: `${stem}_${next + i}`, at: [c.at[0], groundY ?? c.at[1], c.at[2]] };
    if (c.yaw) item.yaw = Math.round(c.yaw * 100) / 100;
    if (c.scale !== undefined) item.height = Math.round(heights.get(from)! * c.scale * 100) / 100;
    return item;
  });

  const placed: string[] = [];
  const failed: { index: number; error: string }[] = [];
  for (let start = 0; start < items.length; start += PLACE_COPIES_PER_CALL) {
    const res = await ctx.execStudioOp({ op: 'place_copies', items: items.slice(start, start + PLACE_COPIES_PER_CALL) } as unknown as StudioOp, 120_000);
    if (!res.ok) {
      const unsupported = /unknown Studio operation|unsupported|not supported/i.test(String(res.error ?? ''));
      const where = start ? ` after ${placed.length} of ${items.length} copies were placed` : '';
      const error = unsupported
        ? 'This Studio plugin cannot place copies at positions yet (it does not know place_copies); update the StudPilot plugin. Until then use clone_instances with only `paths`, then transform_instances to move each copy.'
        : `${res.error ?? 'place_copies failed'}${where}`;
      return { error, ...(placed.length ? { placed: placed.slice(0, 20), placedCount: placed.length, projectMutated: true } : {}) };
    }
    const d = rec(res.data);
    for (const p of Array.isArray(d.placed) ? d.placed : []) if (typeof p === 'string') placed.push(p);
    for (const f of Array.isArray(d.failed) ? d.failed : []) {
      const row = rec(f);
      failed.push({ index: start + Number(row.index ?? 1) - 1, error: String(row.error ?? 'failed').slice(0, 160) });
    }
  }
  ctx.noteCreated?.(placed);
  if (!placed.length) return { error: `nothing was placed: ${failed[0]?.error ?? 'the plugin placed no copies'}` };
  return {
    placedCount: placed.length,
    requested: items.length,
    placed: placed.slice(0, 20),
    ...(placed.length > 20 ? { placedMore: placed.length - 20 } : {}),
    ...(failed.length ? { failed: failed.slice(0, 8), failedCount: failed.length } : {}),
    parent,
    seed: finiteOr(a.seed, 1),
    ...(notes.length ? { notes } : {}),
  };
}

function finiteOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/**
 * create_instances with a `group`: create the items (in batches when there are many), then gather the top-level ones into one
 * Model or Folder with group_instances (which, unlike nesting them as children, has no 40-children limit). A failed grouping
 * leaves the created items in place and says so; the grouping is one more op, never a reason to refuse the build.
 */
async function createGrouped(ctx: AgentCtx, items: unknown[], rawGroup: unknown): Promise<unknown> {
  const g = rec(rawGroup);
  const className = String(g.className ?? 'Model');
  const name = typeof g.name === 'string' ? g.name.trim() : '';
  if (className !== 'Model' && className !== 'Folder') return { error: 'Nothing was created. group.className must be "Model" or "Folder".' };
  if (!name || name.length > 96) return { error: 'Nothing was created. group.name must be 1-96 characters.' };
  if (g.primaryPart !== undefined && (typeof g.primaryPart !== 'string' || className !== 'Model')) return { error: 'Nothing was created. group.primaryPart must name a part, and only a Model has one.' };
  if (items.length > 120) return { error: `Nothing was created. A group holds at most 120 items per call (this has ${items.length}); build it in pieces and group them.` };
  const home = sharedParent(items);
  if (typeof home !== 'string') return { error: `Nothing was created. ${home.error}` };
  const made = rec(await createInBatches(ctx, items));
  if (typeof made.error === 'string') return made;
  const top = items.map((i) => {
    const it = rec(i);
    return appendStudioPath(home, String(it.name ?? it.className ?? ''));
  });
  if (top.some((p) => p === null)) return { ...made, groupWarning: 'the items were created but one has a name that cannot be addressed, so they were not grouped' };
  if (className === 'Folder') {
    // group_instances only makes Models; a Folder is made first and the items are moved into it.
    const folderPath = appendStudioPath(home, name);
    const f = await ctx.execStudioOp({ op: 'create_instances', items: [{ className: 'Folder', name, parent: home }] }, 20_000);
    const moved = f.ok && folderPath
      ? await ctx.execStudioOp({ op: 'move_instances', moves: (top as string[]).map((path) => ({ path, newParent: folderPath })) }, 30_000)
      : null;
    if (!folderPath || !f.ok || !moved?.ok) {
      return { ...made, groupWarning: `the items were created but could not be put in a Folder (${!f.ok ? (f.error ?? 'create failed') : !moved ? 'the name cannot be addressed' : (moved.error ?? 'move failed')}); use group_instances or move_instances` };
    }
    ctx.noteCreated?.([folderPath]);
    return { ...made, group: folderPath, grouped: top.length };
  }
  const grouped = await ctx.execStudioOp({ op: 'group_instances', paths: top as string[], name }, 30_000);
  const path = grouped.ok ? strOrNull(rec(grouped.data).path) : null;
  if (!path) {
    return { ...made, groupWarning: `the items were created but could not be grouped (${grouped.ok ? 'no path returned' : (grouped.error ?? 'group_instances failed')}); group them with group_instances` };
  }
  ctx.noteCreated?.([path]);
  const out: Record<string, unknown> = { ...made, group: path, grouped: top.length };
  if (typeof g.primaryPart === 'string') {
    const part = appendStudioPath(path, g.primaryPart);
    const set = part ? await ctx.execStudioOp({ op: 'set_props', path, props: { PrimaryPart: { t: 'Instance', v: part } } } as StudioOp, 20_000) : null;
    if (!set || !set.ok) out.groupWarning = `the group was made but its PrimaryPart could not be set (${set && !set.ok ? (set.error ?? 'set_props failed') : 'the part name cannot be addressed'})`;
  }
  return out;
}

/**
 * What set_mood's `overrides` may set, by group. A name is here only if the plugin's property allowlist carries it
 * (apps/studpilot-plugin/src/Commands.luau PROPERTY_ALLOW); the value is the kind it takes, with a range where a wrong number
 * is silently nonsense (ClockTime past 24, a colour channel past 255).
 */
const MOOD_OVERRIDES = {
  lighting: {
    ClockTime: { kind: 'number', min: 0, max: 24 }, Brightness: { kind: 'number', min: 0, max: 20 },
    ExposureCompensation: { kind: 'number', min: -5, max: 5 }, ShadowSoftness: { kind: 'number', min: 0, max: 1 },
    GlobalShadows: { kind: 'bool' }, GeographicLatitude: { kind: 'number', min: -90, max: 90 },
    EnvironmentDiffuseScale: { kind: 'number', min: 0, max: 1 }, EnvironmentSpecularScale: { kind: 'number', min: 0, max: 1 },
    Ambient: { kind: 'color' }, OutdoorAmbient: { kind: 'color' }, ColorShift_Top: { kind: 'color' }, ColorShift_Bottom: { kind: 'color' },
    FogStart: { kind: 'number', min: 0, max: 100000 }, FogEnd: { kind: 'number', min: 0, max: 100000 }, FogColor: { kind: 'color' },
  },
  atmosphere: {
    Density: { kind: 'number', min: 0, max: 1 }, Offset: { kind: 'number', min: 0, max: 1 }, Haze: { kind: 'number', min: 0, max: 10 },
    Glare: { kind: 'number', min: 0, max: 10 }, Color: { kind: 'color' }, Decay: { kind: 'color' },
  },
  colorCorrection: {
    Brightness: { kind: 'number', min: -1, max: 1 }, Contrast: { kind: 'number', min: -1, max: 1 },
    Saturation: { kind: 'number', min: -1, max: 1 }, TintColor: { kind: 'color' },
  },
} as const;

type MoodOverrideValues = Record<string, number | boolean | RGB>;

function readMoodOverrides(raw: unknown): { values: Partial<Record<keyof typeof MOOD_OVERRIDES, MoodOverrideValues>> } | { error: string } {
  if (raw === undefined) return { values: {} };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'overrides must be {lighting?, atmosphere?, colorCorrection?}, each an object of property values.' };
  const values: Partial<Record<keyof typeof MOOD_OVERRIDES, MoodOverrideValues>> = {};
  for (const [group, body] of Object.entries(raw as Record<string, unknown>)) {
    const spec = (MOOD_OVERRIDES as Record<string, Record<string, { kind: string; min?: number; max?: number }>>)[group];
    if (!spec) return { error: `overrides.${group} is not a group. Use ${Object.keys(MOOD_OVERRIDES).join(', ')}.` };
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: `overrides.${group} must be an object of property values.` };
    const out: MoodOverrideValues = {};
    for (const [name, value] of Object.entries(body as Record<string, unknown>)) {
      const rule = spec[name];
      if (!rule) return { error: `overrides.${group}.${name} cannot be set here (the plugin does not write it). Allowed: ${Object.keys(spec).join(', ')}.` };
      if (rule.kind === 'bool') {
        if (typeof value !== 'boolean') return { error: `overrides.${group}.${name} must be true or false.` };
        out[name] = value;
      } else if (rule.kind === 'number') {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < rule.min! || value > rule.max!) return { error: `overrides.${group}.${name} must be a number from ${rule.min} to ${rule.max}.` };
        out[name] = value;
      } else {
        if (!Array.isArray(value) || value.length !== 3 || !value.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 255)) return { error: `overrides.${group}.${name} must be a colour [r, g, b] with each channel 0-255.` };
        out[name] = value as unknown as RGB;
      }
    }
    values[group as keyof typeof MOOD_OVERRIDES] = out;
  }
  return { values };
}

/**
 * Measured facts about the scene for audit_build: terrain, lighting and structure. Numbers only. Each read is best-effort and
 * says why when it could not be made, so a missing measurement is never rendered as an empty scene.
 *
 * Terrain is one read of a 256 x 64 x 256 stud box centred on the parts' footprint (or the origin when there are none): the
 * material histogram and how many voxels are solid. The ground heights come from one find_flat probe over the same footprint,
 * which also counts how many of its rays hit anything. Both are samples of that box, and say so.
 */
async function measureScene(ctx: AgentCtx, workspaceTree: unknown, capture: ReturnType<typeof auditCaptureFromTree>): Promise<Record<string, unknown> & { terrain?: Record<string, unknown> }> {
  const structure = sceneFromTree(workspaceTree);
  const parts = capture?.parts ?? [];
  const cx = parts.length ? Math.round((Math.min(...parts.map((p) => p.pos[0])) + Math.max(...parts.map((p) => p.pos[0]))) / 2) : 0;
  const cz = parts.length ? Math.round((Math.min(...parts.map((p) => p.pos[2])) + Math.max(...parts.map((p) => p.pos[2]))) / 2) : 0;
  const box = { min: [cx - 128, -16, cz - 128], max: [cx + 128, 48, cz + 128] };
  const terrain: Record<string, unknown> = { sampledBox: box };
  const read = await ctx.execStudioOp({ op: 'terrain_read', min: box.min, max: box.max } as StudioOp, 30_000);
  if (read.ok) {
    const d = rec(read.data);
    const voxels = Number(d.voxels) || 0;
    const solid = Number(d.solidVoxels) || 0;
    Object.assign(terrain, {
      voxels, solidVoxels: solid, fillRatio: voxels ? Math.round((solid / voxels) * 1000) / 1000 : 0,
      materials: Array.isArray(d.materials) ? d.materials.slice(0, 12) : [],
    });
  } else terrain.terrainUnavailable = String(read.error ?? 'terrain_read failed').slice(0, 160);
  const ground = await ctx.execStudioOp({ op: 'spatial_query', action: 'find_flat', region: { min: [cx - 128, -64, cz - 128], max: [cx + 128, 256, cz + 128] }, samples: 256, maxSlopeDeg: 60 } as StudioOp, 30_000);
  if (ground.ok) {
    const d = rec(ground.data);
    const ys = (Array.isArray(d.flat) ? d.flat : []).map((p) => (Array.isArray(p) ? Number(p[1]) : NaN)).filter((y) => Number.isFinite(y));
    terrain.groundProbe = {
      raysCast: Number(d.sampled) || 0, raysHit: Number(d.hits) || 0,
      ...(ys.length ? { sampledHeights: { min: Math.round(Math.min(...ys) * 10) / 10, max: Math.round(Math.max(...ys) * 10) / 10, count: ys.length } } : {}),
    };
  } else terrain.groundProbeUnavailable = String(ground.error ?? 'find_flat failed').slice(0, 160);
  const lighting = capture?.lighting;
  return {
    terrain,
    ...(lighting ? { lighting: { clockTime: lighting.clockTime, brightness: lighting.brightness, ambient: lighting.ambient, atmospherePresent: lighting.effects.includes('Atmosphere'), effects: lighting.effects, lightInstances: lighting.lightInstances } } : {}),
    ...(structure ? { structure } : {}),
  };
}

export const TOOLS: Record<string, ToolImpl> = {
  get_project_tree: {
    def: {
      name: 'get_project_tree',
      description: 'Snapshot of the game instance tree with names, classes, measured part positions/sizes/anchoring when available, and duplicate-name warnings. Start here to understand a project. Siblings that share a name are marked: a plain path cannot select one of them, so never guess which is meant. Where the outline shows a readRef for one, that readRef is its address.',
      parameters: S({
        root: { type: 'string', description: 'Path to start from, e.g. "game.Workspace". Default: whole game (key services).' },
        maxDepth: { type: 'number', description: 'Depth limit, default 4' },
      }),
    },
    studio: true,
    studioOps: ['get_tree'],
    run: async (ctx, a) => {
      const raw = await op(ctx, { op: 'get_tree', root: a.root as string | undefined, maxDepth: (a.maxDepth as number) ?? 4, maxNodes: 800 });
      if (toolError(raw)) return raw;
      const outline = treeOutline(raw);
      if (!outline) return raw;
      // The UI keeps the full typed tree for its panels; the model gets the outline below.
      ctx.uiDetail = raw;
      return outline;
    },
  },
  list_scripts: {
    def: { name: 'list_scripts', description: 'List all scripts in the project with paths, class and line counts.', parameters: S({ root: { type: 'string' } }) },
    studio: true,
    studioOps: ['list_scripts'],
    run: (ctx, a) => op(ctx, { op: 'list_scripts', root: a.root as string | undefined }),
  },
  read_script: {
    def: {
      name: 'read_script',
      description:
        'Read script source by path. Normal scripts are returned completely; large scripts return an explicit line page with nextStartLine. Follow it with start_line until null before replacing the whole script. complete means this response contains the entire script. Every page carries the whole-file baseHash: pass it as base_hash on edit_script to reject concurrent edits.',
      parameters: S({
        path: { type: 'string' },
        start_line: { type: 'integer', minimum: 1, description: 'First line, one-based; follow nextStartLine when the source is paged.' },
        max_lines: { type: 'integer', minimum: 1, maximum: 1000 },
      }, ['path']),
    },
    studio: true,
    studioOps: ['read_script'],
    run: async (ctx, a) => {
      const startLine = a.start_line ?? 1;
      const maxLines = a.max_lines ?? 1000;
      if (!Number.isInteger(startLine) || Number(startLine) < 1 ||
          !Number.isInteger(maxLines) || Number(maxLines) < 1 || Number(maxLines) > 1000) {
        return { error: 'start_line must be a positive integer; max_lines must be 1..1000' };
      }
      const raw = await op(ctx, { op: 'read_script', path: String(a.path ?? '') });
      if (!raw || typeof raw !== 'object' || 'error' in raw) return raw;
      const read = raw as Record<string, unknown>;
      if (typeof read.source !== 'string') return { error: 'Studio did not return script source' };
      const lines = read.source.split('\n');
      if (Number(startLine) > lines.length) return { error: 'start_line is beyond the script', totalLines: lines.length };
      const page: string[] = [];
      const payload = (endLine: number) => ({
        ...read, source: page.join('\n'), startLine, endLine, totalLines: lines.length,
        complete: startLine === 1 && endLine === lines.length,
        nextStartLine: endLine < lines.length ? endLine + 1 : null,
      });
      let endLine = Number(startLine) - 1;
      for (let i = endLine; i < Math.min(lines.length, Number(startLine) - 1 + Number(maxLines)); i++) {
        page.push(lines[i]!);
        if (JSON.stringify(payload(i + 1)).length > MAX_SCRIPT_RESULT_CHARS) {
          page.pop();
          if (!page.length) return { error: `script line ${i + 1} is too large for one bounded read`, baseHash: read.baseHash };
          break;
        }
        endLine = i + 1;
      }
      return payload(endLine);
    },
  },
  edit_script: {
    def: {
      name: 'edit_script',
      description:
        'Create or edit a script. Provide exactly one of `source` (full new content), `edits` (find/replace list, exact match), or `source_file` (an exact saved .lua/.luau workspace version). One exact edit: edits:[{find:"exact old text",replace:"new text"}]; top-level find + replace is the same shorthand, never combined with another input. A new script: set `create_class` + `create_parent`. ' +
        'The result is parsed BEFORE it is written: a body that does not compile is refused, nothing changed. A script that newly assembles a Model from Parts waits until the library was tried (find_library_model). `base_hash` from read_script also refuses a write over a concurrent Studio edit.',
      parameters: S(
        {
          path: { type: 'string', description: 'Full path, e.g. game.ServerScriptService.RoundManager' },
          source: { type: 'string' },
          find: { type: 'string', description: 'Single-edit shorthand: non-empty exact old text. Requires replace; omit source, edits and source_file.' },
          replace: { type: 'string', description: 'Single-edit shorthand: replacement text, including an empty string for deletion. Requires find.' },
          all: { type: 'boolean', description: 'For the single-edit shorthand only: replace all exact occurrences.' },
          baseHash: { type: 'string', description: 'Alias for base_hash; both must match.' },
          edits: {
            type: 'array',
            items: S({ find: { type: 'string' }, replace: { type: 'string' }, all: { type: 'boolean' } }, ['find', 'replace']),
          },
          source_file: S(
            {
              path: { type: 'string', description: 'Project workspace path ending in .lua or .luau.' },
              version: { type: 'number', description: 'Exact saved workspace version to use. No latest-version fallback.' },
            },
            ['path', 'version'],
          ),
          create_class: { type: 'string', enum: ['Script', 'LocalScript', 'ModuleScript'] },
          create_parent: { type: 'string', description: 'Parent path when creating' },
          base_hash: {
            type: 'string',
            description: 'The `baseHash` read_script returned for this path. The edit is refused if the file has changed since.',
          },
        },
        ['path'],
      ),
    },
    studio: true,
    studioOps: ['read_script', 'edit_script'],
    mutatesProject: true,
    run: async (ctx, a) => {
      const path = String(a.path ?? '');
      // Live provider output used flat find/replace and read_script's baseHash spelling.
      // Normalise only this explicit equivalent shape; never infer an edit from prose,
      // pick between payloads, or discard a read hash to make a mutation succeed.
      const owns = (key: string) => Object.prototype.hasOwnProperty.call(a, key);
      if (owns('find') || owns('replace')) {
        if (owns('source') || owns('edits') || owns('source_file')) {
          return { error: 'single-edit find/replace cannot be combined with source, edits, or source_file' };
        }
        if (typeof a.find !== 'string' || a.find.length === 0 || typeof a.replace !== 'string') {
          return { error: 'single-edit shorthand requires non-empty find text and string replace text' };
        }
        if (owns('all') && typeof a.all !== 'boolean') return { error: '`all` must be a boolean' };
        a = { ...a, edits: [{ find: a.find, replace: a.replace, ...(owns('all') ? { all: a.all } : {}) }] };
      }
      if (owns('baseHash')) {
        if (typeof a.baseHash !== 'string' || !a.baseHash.trim()) return { error: '`baseHash` must be a non-empty string' };
        if (owns('base_hash') && (typeof a.base_hash !== 'string' || a.base_hash.trim().toLowerCase() !== a.baseHash.trim().toLowerCase())) {
          return { error: '`baseHash` and `base_hash` conflict; nothing was written' };
        }
        a = { ...a, base_hash: a.baseHash };
      }
      const hasSourceArg = Object.prototype.hasOwnProperty.call(a, 'source');
      const hasEditsArg = Object.prototype.hasOwnProperty.call(a, 'edits');
      const hasSourceFileArg = Object.prototype.hasOwnProperty.call(a, 'source_file');
      if (Number(hasSourceArg) + Number(hasEditsArg) + Number(hasSourceFileArg) !== 1) {
        return { error: 'pass exactly one of `source`, `edits`, or `source_file`' };
      }

      let directSource: string | undefined;
      let edits: { find: string; replace: string; all?: boolean }[] | undefined;
      let sourceFile: { path: string; version: number; provenance: 'project_workspace_version' } | undefined;

      if (hasSourceArg) {
        if (typeof a.source !== 'string') return { error: '`source` must be a string' };
        directSource = a.source;
      } else if (hasEditsArg) {
        if (!Array.isArray(a.edits) || a.edits.length === 0) return { error: '`edits` must be a non-empty list' };
        edits = a.edits as { find: string; replace: string; all?: boolean }[];
      } else {
        if (!ctx.projectId) return { error: '`source_file` requires a project workspace' };
        if (!a.source_file || typeof a.source_file !== 'object' || Array.isArray(a.source_file)) {
          return { error: '`source_file` must contain `path` and `version`' };
        }
        const requested = a.source_file as { path?: unknown; version?: unknown };
        if (typeof requested.path !== 'string') return { error: '`source_file.path` must be a project workspace path' };
        const verdict = checkWorkspacePath(requested.path);
        if (!verdict.ok) return { error: `source_file path refused: ${verdict.detail}` };
        if (!/\.lua(?:u)?$/i.test(verdict.path)) return { error: '`source_file.path` must end in .lua or .luau' };
        if (!Number.isInteger(requested.version) || Number(requested.version) < 1) {
          return { error: '`source_file.version` must be a whole number from 1 upwards' };
        }
        const version = Number(requested.version);
        const saved = await kvWorkspace(ctx.env.KV, ctx.projectId).readVersion(verdict.path, version);
        if (!saved) {
          return { error: `version ${version} of ${verdict.path} is not kept in this project workspace` };
        }
        if (saved.bytes > WORKSPACE_MAX_BYTES) {
          return { error: `${verdict.path} version ${version} is larger than the ${WORKSPACE_MAX_BYTES}-byte workspace file limit` };
        }
        directSource = saved.content;
        sourceFile = { path: verdict.path, version, provenance: 'project_workspace_version' };
      }
      const create =
        a.create_class && a.create_parent
          ? { className: a.create_class as 'Script' | 'LocalScript' | 'ModuleScript', parent: String(a.create_parent) }
          : undefined;

      // READ BEFORE WRITING — for three things at once, all of which need the current text:
      // the base hash the write is pinned to, the text `edits` will be applied to (so the RESULT
      // can be parsed before Studio holds it), and the "before" side of the diff the user sees.
      //
      // Only the resolver's own not-found is absence. A timeout, a dropped plugin or a path that
      // resolves to a Folder all produce an error too, and reading any of those as "nothing there,
      // safe to create" is the overwrite this read exists to prevent.
      const existing = await op(ctx, { op: 'read_script', path });
      const readError =
        existing && typeof existing === 'object' && 'error' in (existing as Record<string, unknown>)
          ? String((existing as { error: unknown }).error)
          : null;
      const absent = readError !== null && /\bnot found\b/i.test(readError);
      if (readError !== null && !absent) {
        return { error: `could not read ${path} before editing: ${readError}. Nothing was written.` };
      }
      if (absent && !create) {
        return { error: `script not found: ${path} — pass create_class and create_parent to create it` };
      }
      if (absent && directSource === undefined) {
        return { error: `${path} does not exist yet, so there is nothing for \`edits\` to match. Pass \`source\` with the full body.` };
      }

      const before = absent ? null : String((existing as { source?: unknown }).source ?? '');
      const baseHash = before === null ? undefined : sourceHash(before);
      const claimed = typeof a.base_hash === 'string' ? a.base_hash.trim().toLowerCase() : '';
      if (claimed && baseHash && claimed !== baseHash) {
        return {
          error:
            `${path} has changed since you read it — the edit was computed against a version that is no longer there, so nothing was written. ` +
            `Read the script again and re-apply your change on top of the current text.`,
          currentBaseHash: baseHash,
        };
      }

      let after: string;
      let sentEdits = edits;
      if (directSource !== undefined) {
        after = directSource;
      } else {
        const applied = applyEdits(before ?? '', edits!);
        if (!applied.ok) {
          return applied.closest
            ? {
                error: `${applied.error} in ${path}. Nothing was written. \`closest\` is the script's current text nearest your anchor, with line numbers — copy the find from it exactly (without the "N| " prefix) instead of reading the script again.`,
                closest: applied.closest,
              }
            : { error: `${applied.error} in ${path}. Nothing was written — read the script again and match the text that is actually there.` };
        }
        after = applied.source;
        sentEdits = applied.edits;
      }

      // THE PRE-WRITE PARSE. A body that does not compile used to be discovered by run_spec, after
      // the user's file had already been replaced, and reported as a spec failure rather than as
      // the edit that caused it.
      const problems = checkSyntax(after);
      if (problems.length) {
        return {
          error:
            `refused: the result would not parse — ${describeSyntax(problems)}. Nothing was written, ${path} is unchanged.`,
          syntaxErrors: problems.slice(0, 5),
        };
      }

      // A saved workspace file crosses a new trust boundary: persisted project text becomes live
      // Luau without being copied through the model. Keep asset ingress behind the same narrow
      // admission helper used by Studio-bound Luau before the plugin sees a mutation.
      if (sourceFile) {
        const ingress = refuseLuauIngress(after);
        if (ingress) return ingress;
      }
      // D-MODELLIB-2 also applies to scripts that create visual props at runtime: a Model assembled from Parts in a
      // script is held to the same order as one made by create_instances.
      const handMadeModel = ctx.freeHand ? null : refuseNewHandMadeModelLuau(
        luauScanVariants(after), before === null ? undefined : luauScanVariants(before), libraryOrder(ctx),
      );
      if (handMadeModel) {
        if (handMadeModel.ordered) noteOrderRefusal(ctx);
        return handMadeModel;
      }
      // D-UIONLY-1: a script may use inserted UI but not make more UI than it already did.
      const handMadeUi = ctx.freeHand ? null : refuseLibraryLuau(luauScanVariants(after), UI_RULE, before === null ? undefined : luauScanVariants(before));
      if (handMadeUi) return handMadeUi;
      // D-FXLIB-1: the same for Sounds and particle effects, which come from insert_sound / insert_vfx.
      const handMadeFx = ctx.freeHand ? null : refuseLibraryLuau(luauScanVariants(after), FX_RULE, before === null ? undefined : luauScanVariants(before));
      if (handMadeFx) return handMadeFx;
      // G13/G14: no runtime dependence on StudPilot, no fabricated purchase ids.
      const gameRule = refuseGameScript(luauScanVariants(after), before === null ? undefined : luauScanVariants(before));
      if (gameRule) return gameRule;
      // M4 backstop for agent-written scripts (behaviour-review.ts): a loop that never yields is refused with the fix; the other
      // findings (a missing child, an unguarded Touched, ingress and egress primitives) ride on the result for the agent to act on.
      const existingClass = typeof (existing as { class?: unknown } | null)?.class === 'string' ? String((existing as { class: string }).class) : undefined;
      const lint = await lintScriptWrite(ctx, {
        path, source: after, parentPath: create?.parent, className: create?.className ?? existingClass, ingress: scanLuauForAssetIngress(after),
      });
      if (lint.refusal) return lint.refusal;

      const res = await op(ctx, {
        op: 'edit_script',
        path,
        source: directSource !== undefined ? after : undefined,
        edits: directSource !== undefined ? undefined : sentEdits,
        create,
        baseHash,
      });
      if (res && typeof res === 'object' && 'error' in (res as Record<string, unknown>)) return res;

      const hunks = diffHunks(before ?? '', after);
      const stat = diffStat(hunks);
      if (hunks.length) {
        ctx.uiDetail = {
          v: 1,
          blocks: [
            {
              type: 'code_diff',
              path,
              language: 'luau',
              hunks,
              summary: `+${stat.added} / -${stat.removed}${before === null ? ' · new script' : ''}`,
            },
          ],
        };
      }

      // The review runs on what was written, so a warning here is about the file as it now stands.
      const review = reviewScript(path, after, create?.className);
      // Findings that are runtime bugs go first and all of them: an `unknown-global` typo cut off behind three style notes
      // cost a live run eight steps of guessing (2026-10-09). The rest stay a short list.
      const findings = review.findings.filter((f) => f.severity !== 'error');
      const bugs = findings.filter((f) => RUNTIME_BUG_RULES.has(f.rule));
      const warnings = findings.filter((f) => !RUNTIME_BUG_RULES.has(f.rule)).slice(0, 2);
      return {
        ...(res as Record<string, unknown>),
        added: stat.added,
        removed: stat.removed,
        ...(sourceFile ? { sourceFile } : {}),
        ...(bugs.length ? { bugs: bugs.map((f) => `line ${f.line}: ${f.rule} — ${f.detail}. Fix this before play_check: it fails at runtime.`) } : {}),
        ...(warnings.length ? { warnings: warnings.map((f) => `line ${f.line}: ${f.rule} — ${f.detail}`) } : {}),
        ...(lint.summary ? { lint: lint.summary } : {}),
      };
    },
  },
  search_scripts: {
    def: { name: 'search_scripts', description: 'Search all script sources for a string. Returns matches with paths and line numbers. For a NAME rather than a substring, find_symbol resolves scope and search_scripts does not.', parameters: S({ query: { type: 'string' } }, ['query']) },
    studio: true,
    studioOps: ['search_scripts'],
    run: (ctx, a) => op(ctx, { op: 'search_scripts', query: String(a.query ?? ''), maxResults: 40 }),
  },
  /** Plugin 2.0 (ops/Search.luau): the Studio agent's code search. Replaces search_scripts on that surface. */
  grep: {
    def: {
      name: 'grep',
      description:
        'Search every script source for text, or a Lua pattern with pattern:true. Case-insensitive unless case_sensitive. Returns path, line number and the line, with `context` lines before and after (0-5). Narrow with include/exclude slash globs over script paths, e.g. include:"ServerScriptService/**", exclude:["ReplicatedStorage/Packages/**"]. Paths come back in the game.X.Y form read_script and edit_script take.',
      parameters: S({
        query: { type: 'string' },
        pattern: { type: 'boolean', description: 'Treat query as a Lua pattern (%d, %a, .-, ^ $), not plain text.' },
        case_sensitive: { type: 'boolean' },
        context: { type: 'number', description: '0-5 lines of context around each match. Default 0.' },
        include: { type: 'array', items: { type: 'string' }, description: 'Slash globs a script path must match (* within a name, ** across names).' },
        exclude: { type: 'array', items: { type: 'string' }, description: 'Slash globs that drop a script.' },
        max_results: { type: 'number', description: 'Default 100, at most 500.' },
      }, ['query']),
    },
    studio: true,
    studioOps: ['grep'],
    run: (ctx, a) => {
      const list = (v: unknown): string[] | undefined => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 20) : undefined);
      const context = Math.min(5, Math.max(0, Math.round(Number(a.context) || 0)));
      const maxResults = Math.min(500, Math.max(1, Math.round(Number(a.max_results) || 100)));
      return op(ctx, {
        op: 'grep', query: String(a.query ?? ''), pattern: a.pattern === true, caseSensitive: a.case_sensitive === true, context, maxResults,
        ...(list(a.include)?.length ? { include: list(a.include) } : {}), ...(list(a.exclude)?.length ? { exclude: list(a.exclude) } : {}),
      });
    },
  },
  /** Plugin 2.0 (ops/Search.luau): find instances by path shape. Replaces list_scripts on the Studio agent's surface. */
  glob: {
    def: {
      name: 'glob',
      description:
        'Find instances by path: a slash glob from the service down, * within one name, ? one character, ** across any number of names. E.g. "Workspace/**/Door*", "ServerScriptService/**" with class_name:"LuaSourceContainer" to list every script, "ReplicatedStorage/**/*.spec". class_name keeps only instances that are that class or inherit from it (BasePart, GuiObject, Script). Returns each path (game.X.Y form), class and child count.',
      parameters: S({
        pattern: { type: 'string' },
        class_name: { type: 'string' },
        max_results: { type: 'number', description: 'Default 200, at most 500.' },
      }, ['pattern']),
    },
    studio: true,
    studioOps: ['glob'],
    run: (ctx, a) => op(ctx, {
      op: 'glob', pattern: String(a.pattern ?? ''), maxResults: Math.min(500, Math.max(1, Math.round(Number(a.max_results) || 200))),
      ...(typeof a.class_name === 'string' && a.class_name ? { className: a.class_name } : {}),
    }),
  },
  /**
   * Plugin 2.0 (ops/Serialize.luau): one instance, or a subtree, with EVERY property a plugin can write (Roblox's API
   * dump), not the dozen get_instance shows. Replaces get_instance on the Studio agent's surface. Values are shown as
   * text the model can quote; `typed` keeps the {t,v} values for a create_instances / set_properties round trip.
   */
  read_instance: {
    def: {
      name: 'read_instance',
      description:
        'Read an instance back with every property a plugin can set (all of them, from the Roblox API dump), its attributes and tags, and optionally its descendants (depth) and script source. Use it to VERIFY a change and quote what you saw, or to learn exactly how something you inserted is built before changing it. Values equal to a new instance\'s defaults are included. typed:true returns {t,v} values you can pass straight back to create_instances / set_properties.',
      parameters: S({
        path: { type: 'string', description: 'Full path, e.g. game.Workspace.Lobby.Floor (or a readRef from get_project_tree)' },
        depth: { type: 'number', description: 'Levels of descendants to include, 0-6. Default 0 (just this instance; children are counted).' },
        include_source: { type: 'boolean', description: 'Include script source for scripts in the subtree. Default false (use read_script).' },
        typed: { type: 'boolean' },
      }, ['path']),
    },
    studio: true,
    studioOps: ['serialize'],
    run: async (ctx, a) => {
      const path = String(a.path ?? '');
      if (!path) return { error: 'path is required' };
      const depth = Math.min(6, Math.max(0, Math.round(Number(a.depth) || 0)));
      const res = await op(ctx, { op: 'serialize', path, maxDepth: depth, maxNodes: depth === 0 ? 1 : 300, includeSource: a.include_source === true });
      if (!res || typeof res !== 'object' || 'error' in (res as Record<string, unknown>)) return res;
      const data = res as { path?: string; root?: SerializedNode; truncated?: boolean; notes?: string[] };
      if (a.typed === true || !data.root) return data;
      return { path: data.path, ...readableNode(data.root), ...(data.truncated ? { truncated: true } : {}), ...(data.notes?.length ? { notes: data.notes } : {}) };
    },
  },
  /** Plugin 2.0 (ops/Tests.luau + PlayCheck.runTests): the place's TestEZ specs in a solo Test session. */
  run_tests: {
    def: {
      name: 'run_tests',
      description:
        'Run the place\'s TestEZ unit tests: every ModuleScript named *.spec under `roots` (default: ReplicatedStorage, ServerScriptService, ServerStorage, StarterPlayer, ReplicatedFirst) runs in a solo Studio Test session on a copy of the place, and you get passed / failed / skipped counts with each failure\'s name and message. TestEZ must be in the place as a ModuleScript named TestEZ. The session always ends by timeout_seconds (5-50, default 40); a timeout returns what had finished.',
      parameters: S({
        roots: { type: 'array', items: { type: 'string' }, description: 'Paths to search for *.spec modules, e.g. ["game.ReplicatedStorage.Shared"].' },
        timeout_seconds: { type: 'number' },
      }),
    },
    studio: true,
    studioOps: ['run_tests'],
    run: async (ctx, a) => {
      const roots = Array.isArray(a.roots) ? a.roots.filter((r): r is string => typeof r === 'string').slice(0, 10) : undefined;
      const timeoutSeconds = Math.min(50, Math.max(5, Math.round(Number(a.timeout_seconds) || 40)));
      return op(ctx, { op: 'run_tests', timeoutSeconds, ...(roots?.length ? { roots } : {}) }, (timeoutSeconds + 40) * 1000);
    },
  },
  /**
   * Game art from Lucid Origin (owner, 2026-10-09: "only him generates all of the UI/GUI/assets"). image-gen.ts makes the
   * picture (cut-out, cropped, sized); the plugin uploads it into the Studio user's own account (ops/Image.luau) and the
   * id comes back for build_ui (image, skin, pattern) or any Image property. Metered on the shared budget per image.
   */
  make_image: {
    def: {
      name: 'make_image',
      description:
        'Make a picture for the game with the image model and upload it to the person\'s Roblox account; returns its rbxassetid and size. ' +
        'Use it when the design needs a picture: button and panel skins, title banners, icons, item pictures, textures, backgrounds, decals. ' +
        'kind: icon | button | panel | banner | sprite (cut out on a transparent background and cropped) | texture (seamless tile) | background (full frame). ' +
        'Describe the subject and look in prompt; pass the SAME style string for every image of one screen so they match. ' +
        'Text is drawn only when quoted in the prompt ("SHOP"); live text (names, numbers, labels) stays in build_ui. About $0.03 per image: make what the request needs.',
      parameters: S({
        prompt: { type: 'string', description: 'What to draw: subject, shape, colours, material, mood. e.g. "a chunky red glossy plastic button with a thick black outline"' },
        kind: { type: 'string', enum: [...IMAGE_KINDS] },
        style: { type: 'string', description: 'The shared art style of this screen, e.g. "bright cartoon simulator style, thick black outlines, glossy plastic, LEGO studs"' },
        name: { type: 'string', description: 'Asset name in the person\'s inventory' },
        size: { type: 'array', items: { type: 'number' }, description: '[w, h] box to fit the result in, at most 1024; defaults by kind' },
        seed: { type: 'integer' },
      }, ['prompt', 'kind']),
    },
    studio: true,
    studioOps: ['create_image_asset'],
    run: async (ctx, a) => {
      const prompt = typeof a.prompt === 'string' ? a.prompt.trim() : '';
      if (prompt.length < 3 || prompt.length > 1200) return { error: 'prompt must describe the picture in 3-1200 characters.' };
      if (!(IMAGE_KINDS as readonly string[]).includes(String(a.kind))) return { error: `kind must be one of ${IMAGE_KINDS.join(', ')}.` };
      const size = Array.isArray(a.size) && a.size.length === 2 && a.size.every((v) => typeof v === 'number' && v >= 16 && v <= 1024) ? [Math.round(a.size[0] as number), Math.round(a.size[1] as number)] as [number, number] : undefined;
      const plan = planImage({ prompt, kind: a.kind as ImageKind, style: typeof a.style === 'string' ? a.style.slice(0, 400) : undefined, size });
      const neurons = imageNeurons(plan.genW, plan.genH, plan.steps);
      let reserved: number;
      try {
        reserved = await reserveImageBudget(ctx.env, IMAGE_MODEL, neurons);
      } catch (e) {
        return { error: e instanceof Error ? e.message : 'StudPilot could not check its capacity, so nothing was drawn.' };
      }
      let jpegB64: string;
      try {
        const draw = (p: string) => (ctx.env.AI.run as (m: string, i: unknown) => Promise<unknown>)(IMAGE_MODEL, {
          prompt: p, width: plan.genW, height: plan.genH, steps: plan.steps, ...(Number.isInteger(a.seed) ? { seed: a.seed } : {}),
        });
        // The model's filter reads game words as bodies ("pink button skin" and "studs texture" were refused as NSFW,
        // 2026-10-09): retry once with them said another way.
        const out = (await draw(plan.prompt).catch((e: unknown) => {
          if (!/NSFW|3030/.test(String(e))) throw e;
          return draw(plan.prompt
            .replace(/\bskins?\b/gi, 'graphic')
            .replace(/\bstudded\b/gi, 'covered in round raised bumps')
            .replace(/\bstuds?\b/gi, 'round raised bumps')
            .replace(/\b(flesh|nude|bare|naked|sexy|hot)\b/gi, ''));
        })) as { image?: unknown };
        if (typeof out?.image !== 'string') throw new Error('the image model returned no image');
        jpegB64 = out.image;
      } catch (e) {
        await releaseImageBudget(ctx.env, reserved, IMAGE_MODEL);
        return { error: `The image model failed: ${e instanceof Error ? e.message : String(e)}. Try again, or simplify the prompt.` };
      }
      await settleImageBudget(ctx.env, reserved, neurons, IMAGE_MODEL, 'studio_image');
      if (!ctx.env.MEDIA) return { error: 'Image storage is not configured, so the picture cannot reach Studio.' };
      const img = finishImage(jpegB64, plan);
      if ('error' in img) return { error: img.error, neurons };
      // The pixels wait in R2 for the plugin's one download (index.ts /api/studio/pixels/:id), then are deleted.
      const id = crypto.randomUUID();
      await ctx.env.MEDIA!.put(`studio-pixels/${id}`, toBase64(img.data), { customMetadata: { createdAt: String(Date.now()), projectId: ctx.projectId ?? '' } });
      const name = (typeof a.name === 'string' && a.name.trim() ? a.name.trim() : `StudPilot ${plan.kind}`).slice(0, 50);
      const made = await op(ctx, { op: 'create_image_asset', url: `https://studpilot.app/api/studio/pixels/${id}`, width: img.width, height: img.height, name }, 120_000);
      await ctx.env.MEDIA!.delete(`studio-pixels/${id}`).catch(() => undefined);
      let assetId = (made as { assetId?: unknown })?.assetId;
      // Studio may refuse the plugin upload ("CreateAssetAsync ... not available yet", measured 2026-10-09). Then the
      // picture goes up through Open Cloud with the person's OWN key (Settings), never a platform key.
      let cloudNote = '';
      if (typeof assetId !== 'number' && typeof assetId !== 'string') {
        const cloud = ctx.userId ? await uploadImageWithOwnKey(ctx, ctx.userId, await encodeRgbaPng(img), name) : { error: 'no signed-in owner' };
        if ('assetId' in cloud) assetId = cloud.assetId;
        else cloudNote = cloud.error;
      }
      if (typeof assetId !== 'number' && typeof assetId !== 'string') {
        return {
          error: `The picture was drawn but could not be uploaded to Roblox. Studio said: ${String((made as { error?: unknown })?.error ?? 'no answer')}. Open Cloud: ${cloudNote}`,
          neurons,
          fix: 'Tell the person once: to use drawn art, open StudPilot Settings and press "Connect Roblox for uploads"; on Roblox\'s page they must press Select next to their account under "Your Accounts" before Confirm (a PERMISSION_DENIED "User not authenticated" means no account was selected). Meanwhile build the look in-engine: pattern with Roblox\'s stud map rbxassetid://10509831729, gradients, textStroke, depth. Do not call make_image again this turn.',
        };
      }
      // A panel's rim is thicker than its corner curve: never slice inside it.
      const rim = plan.kind === 'panel' ? Math.round(Math.min(img.width, img.height) * 0.12) : 0;
      const slice = plan.kind === 'panel' || plan.kind === 'button' || plan.kind === 'banner' ? suggestSlice(img).map((v) => Math.max(v, rim)) : null;
      return {
        image: `rbxassetid://${assetId}`,
        width: img.width,
        height: img.height,
        kind: plan.kind,
        neurons,
        ...(slice ? { slice } : {}),
        use: plan.kind === 'texture'
          ? 'Tile it: build_ui pattern {image, tile} or a Texture on a part.'
          : slice
            ? `Use it as a skin exactly so: skin {image: "rbxassetid://${assetId}", size: [${img.width}, ${img.height}], slice: [${slice.join(', ')}]} (measured from its corners, so it stretches to any size cleanly; tint recolours it).`
            : 'Use it in build_ui (an image or icon node with fit "fit") or on an Image/Decal property.',
      };
    },
  },
  review_scripts: {
    def: {
      name: 'review_scripts',
      description:
        'Static review of the project\'s Luau: syntax errors, dead code, unused and write-only locals, accidental globals, require cycles, ' +
        'unvalidated RemoteEvent handlers and client-invoked RemoteFunctions, DataStore lost updates, and scripts whose class does not match ' +
        'the container they live in. A whole-place review also reports the require graph: which module depends on which, what a require ' +
        'expression failed to resolve to, load order, and cycles. Pass `path` for one script, or omit it to review the whole place. ' +
        'This reads; it changes nothing.',
      parameters: S({
        path: { type: 'string', description: 'One script to review. Omit to review every script in the place.' },
        root: { type: 'string', description: 'Limit a whole-place review to a subtree, e.g. game.ServerScriptService' },
        include_warnings: { type: 'boolean', description: 'Include warnings as well as errors. Default true.' },
        dependencies: { type: 'boolean', description: 'Include the full require graph, not just its cycles. Default false.' },
      }),
    },
    studio: true,
    studioOps: ['read_script', 'dump_scripts'],
    run: async (ctx, a) => {
      const includeWarnings = a.include_warnings !== false;
      const keep = (severity: string): boolean => severity === 'error' || includeWarnings;

      if (typeof a.path === 'string' && a.path.trim()) {
        const path = a.path.trim();
        const raw = await op(ctx, { op: 'read_script', path });
        if (raw && typeof raw === 'object' && 'error' in (raw as Record<string, unknown>)) return raw;
        const source = String((raw as { source?: unknown }).source ?? '');
        const className = typeof (raw as { class?: unknown }).class === 'string' ? String((raw as { class: string }).class) : undefined;
        const review = reviewScript(path, source, className);
        const findings = review.findings.filter((f) => keep(f.severity));
        return {
          path,
          parsed: review.ok,
          context: review.context,
          errors: review.errors,
          warnings: review.warnings,
          requires: review.requires.slice(0, 20),
          findings: findings.slice(0, 25).map(renderFinding),
          ...(findings.length > 25 ? { more: findings.length - 25 } : {}),
        };
      }

      const dump = await dumpScripts(ctx, typeof a.root === 'string' ? a.root : undefined);
      if ('error' in dump) return { error: dump.error };
      if (!dump.files.length) return { scripts: 0, note: 'no scripts found in this place' };

      const place = reviewPlace(dump.files);
      const flat = place.scripts
        .flatMap((s) => s.findings.filter((f) => keep(f.severity)).map((f) => ({ ...f, path: s.path })))
        .concat(place.crossFile.filter((f) => keep(f.severity)));
      // Errors first: a place with 200 style warnings and one require cycle must not bury the cycle.
      flat.sort((x, y) => severityRank(x.severity) - severityRank(y.severity) || x.path.localeCompare(y.path) || x.line - y.line);
      return {
        scripts: place.totals.scripts,
        parsed: place.totals.parsed,
        errors: place.totals.errors,
        warnings: place.totals.warnings,
        requireCycles: place.dependencies.cycles.map((c) => c.join(' -> ')),
        ...(dump.truncated ? { truncated: 'not every script was read — the reply hit the size budget, so this review covers only the scripts listed' } : {}),
        findings: flat.slice(0, 30).map((f) => `${f.path}:${f.line} ${f.rule} — ${f.detail}`),
        ...(flat.length > 30 ? { more: flat.length - 30 } : {}),
      };
    },
  },
  find_symbol: {
    def: {
      name: 'find_symbol',
      description:
        'Resolve a name the way the language does, not the way grep does. With `path` + `line` + `column` it returns the declaration the ' +
        'identifier at that position refers to plus every read and write of THAT binding (shadowed names are different symbols). With `name` ' +
        'alone it lists declarations across the place — functions, locals, types — with their file and line.',
      parameters: S({
        name: { type: 'string', description: 'Name, or part of one, to look up across the place.' },
        path: { type: 'string', description: 'Script to resolve a position in.' },
        line: { type: 'number', description: '1-based line of the identifier.' },
        column: { type: 'number', description: '1-based column of the identifier.' },
      }),
    },
    studio: true,
    studioOps: ['read_script', 'dump_scripts'],
    run: async (ctx, a) => {
      const path = typeof a.path === 'string' ? a.path.trim() : '';
      const line = Number(a.line);
      const column = Number(a.column);
      const name = typeof a.name === 'string' ? a.name.trim() : '';

      if (path && Number.isFinite(line) && line > 0) {
        const raw = await op(ctx, { op: 'read_script', path });
        if (raw && typeof raw === 'object' && 'error' in (raw as Record<string, unknown>)) return raw;
        const source = String((raw as { source?: unknown }).source ?? '');
        if (!Number.isFinite(column) || column <= 0) {
          // No column: report every declaration on that line rather than guessing one.
          const onLine = symbolsInFile(path, source, name).filter((s) => s.line === line);
          if (!onLine.length) return { error: `no declaration on ${path} line ${line} — pass \`column\` to resolve a reference instead` };
          return { path, line, declarations: onLine.map((s) => `${s.kind} ${s.name} (line ${s.line})`) };
        }
        const hit = symbolLookup(path, source, line, column);
        if (!hit) {
          return { error: `nothing resolvable at ${path} line ${line} column ${column} — it may be a global, a field, or inside a comment or string` };
        }
        return {
          name: hit.name,
          kind: hit.kind,
          definedAt: `${path}:${hit.definition.line}:${hit.definition.column}`,
          reads: hit.reads,
          writes: hit.writes,
          references: hit.references.slice(0, 40).map((r) => `${path}:${r.line}:${r.column} ${r.kind}`),
          ...(hit.references.length > 40 ? { more: hit.references.length - 40 } : {}),
        };
      }

      if (!name) return { error: 'pass `name`, or `path` + `line` (+ `column`) to resolve a position' };
      const dump = await dumpScripts(ctx);
      if ('error' in dump) return { error: dump.error };
      const hits = symbolSearch(dump.files, name);
      if (!hits.length) return { name, declarations: [], note: 'no declaration of that name — search_scripts finds it as text if it is a field or a string' };
      return {
        name,
        declarations: hits.slice(0, 40).map((s) => `${s.path}:${s.line} ${s.kind} ${s.name}`),
        ...(hits.length > 40 ? { more: hits.length - 40 } : {}),
      };
    },
  },
  format_script: {
    def: {
      name: 'format_script',
      description:
        'Re-indent and normalise spacing in a script. The formatter proves its own output holds exactly the same tokens and comments as the ' +
        'input, and the write is abandoned if it does not — so this can never change what a script does. Refuses a script that does not lex.',
      parameters: S({ path: { type: 'string', description: 'Script to format.' } }, ['path']),
    },
    studio: true,
    studioOps: ['read_script', 'edit_script'],
    mutatesProject: (result) => changedField(result, 'changed'),
    run: async (ctx, a) => {
      const path = String(a.path ?? '').trim();
      if (!path) return { error: 'pass `path`' };
      const raw = await op(ctx, { op: 'read_script', path });
      if (raw && typeof raw === 'object' && 'error' in (raw as Record<string, unknown>)) return raw;
      const before = String((raw as { source?: unknown }).source ?? '');
      const formatted = formatScript(before);
      if (!formatted.ok) return { error: formatted.error };
      if (!formatted.changed) return { path, changed: false, note: 'already formatted' };

      const res = await op(ctx, { op: 'edit_script', path, source: formatted.code, baseHash: sourceHash(before) });
      if (res && typeof res === 'object' && 'error' in (res as Record<string, unknown>)) return res;

      const hunks = diffHunks(before, formatted.code);
      const stat = diffStat(hunks);
      if (hunks.length) {
        ctx.uiDetail = {
          v: 1,
          blocks: [{ type: 'code_diff', path, language: 'luau', hunks, summary: `formatting only · +${stat.added} / -${stat.removed}` }],
        };
      }
      return { path, changed: true, added: stat.added, removed: stat.removed };
    },
  },
  create_instances: {
    def: {
      name: 'create_instances',
      description:
        'Create instances: any class Roblox lets a plugin create, with any property a plugin can write on it (scripts are made with edit_script). Content properties (Image, SoundId, Texture, TextureID, Asset, AnimationId...) take any rbxassetid://<digits> (Creator Store / Toolbox ids included), rbxasset:// or rbxthumb:// value. Props are typed: {"Position":{"t":"Vector3","v":[0,5,0]}, "Material":{"t":"EnumItem","v":"Enum.Material.Neon"}, "Color":{"t":"Color3","v":[1,0.5,0]}}. Types: string,number,bool,Vector3,Vector2,CFrame,Color3,UDim2,UDim,EnumItem (full name, or just the item name/number),BrickColor,Content,NumberRange,NumberSequence,ColorSequence,Rect,Font,Faces,Axes,PhysicalProperties,Instance,nil. A propIssues result means the instances WERE created: fix them with set_properties. Per call: 120 items, 400 instances, 40 children each, 12 levels, 48 props each (longer lists are split for you). origin {at:[x,y,z], yaw?} builds in local space around (0,0,0) and places the batch; group {className:"Model"|"Folder", name, primaryPart?} wraps it (up to 120 items); build once, repeat with clone_instances. Plain parts (Part, WedgePart, CornerWedgePart, TrussPart) are Anchored unless Anchored is false; bare Size/Position/Orientation/Color arrays and Material/Shape names on parts are typed for you. Also creates AudioPlayer (Asset: an audio id), AudioEmitter, Wire (SourceInstance/TargetInstance: paths of existing instances), the Audio effects, Animator, Animation, IKControl and Explosion (BlastPressure and DestroyJointRadiusPercent default to 0).',      parameters: S({
        items: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              className: { type: 'string', description: 'Roblox class, e.g. "Part"' },
              name: { type: 'string' },
              parent: { type: 'string', description: 'Path of an existing instance, e.g. "Workspace.StreetLamp". Default "Workspace".' },
              props: { type: 'object', description: 'Typed properties' },
              attributes: { type: 'object' },
              children: { type: 'array', description: 'Nested items with the same fields (no parent)', items: { type: 'object' } },
            },
            required: ['className', 'name'],
          },
        },
        origin: { type: 'object' },
        group: { type: 'object' },
      }, ['items']),
    },
    studio: true,
    studioOps: ['create_instances'],
    mutatesProject: true,
    //[[ THE PROPS ARE READ BEFORE THEY LEAVE, and the reason is in the operation log of the
    //   owner's own project. The one time this product tried to build in it, `create_instances`
    //   came back `instance props.Position must be a typed property value` — the model had written
    //   a bare value where the wire wants {t, v}. This function forwarded it unexamined, so the
    //   error was produced by the plugin, inside somebody's Studio, after a network round trip,
    //   and it is a failed build in that project's log where the customer can see it.
    //
    //   `normaliseItems` tags what cannot be anything else (a number, a boolean, a string starting
    //   `Enum.`) and REFUSES what only the class could disambiguate — an array of three is a
    //   Vector3 for Position and a Color3 for Color, and guessing would put a colour where a
    //   position goes and call it a success. A refusal here is a tool error the model corrects in
    //   the same turn: no round trip, no failed op, nothing touched in the place. ]]
    run: (ctx, a) => {
      // `items` missing used to go to the plugin as [] and come back "items must contain at least one instance", which reads
      // as a problem with the list's length rather than with its absence.
      if (!Array.isArray(a.items)) return Promise.resolve({ error: 'items was missing or not an array, so nothing was sent. Send items: [{className, name, parent, props?, children?}, ...].' });
      // D-UIONLY-1: UI classes come from insert_ui_component only.
      const handMadeUi = ctx.freeHand ? null : refuseLibraryItems(Array.isArray(a.items) ? a.items.filter(item => !isEmptyScreenGuiHost(item)) : a.items, UI_RULE);
      if (handMadeUi) return Promise.resolve(handMadeUi);
      // D-FXLIB-1: Sounds and particle effects come from insert_sound / insert_vfx.
      const handMadeFx = ctx.freeHand ? null : refuseLibraryItems(a.items, FX_RULE);
      if (handMadeFx) return Promise.resolve(handMadeFx);
      // An AudioPlayer's Asset is held to the same rule as a Sound's SoundId: an id that does not exist plays silence without an error.
      const silentAsset = firstUnknownSoundId(a.items, ctx.discoveredAssetIds);
      if (silentAsset) return Promise.resolve(silentAsset);
      // A script class is not on the plugin's create allowlist, and its refusal named no way forward (benchmark o05, 2026-10-04).
      const scriptItem = findScriptClass(a.items);
      if (scriptItem) return Promise.resolve({ error: `${scriptItem} is created with edit_script, not create_instances: set create_class (Script, LocalScript or ModuleScript), create_parent and source. Nothing was sent.` });
      for (const src of sourcesIn(a.items)) {
        const gameRule = refuseGameScript(luauScanVariants(src));
        if (gameRule) return Promise.resolve(gameRule);
      }
      const pass = normaliseItems(a.items);
      if (pass.refusals.length > 0) {
        return Promise.resolve({
          error: `Nothing was created. ${pass.refusals.length === 1 ? 'One property' : `${pass.refusals.length} properties`} could not be read, and the rest were left alone rather than half-building the set: ${describeRefusals(pass.refusals)}`,
        });
      }
      const issues = createLimitIssues((pass.items as unknown[]) ?? []);
      if (issues.length) return Promise.resolve({ error: `Nothing was created. ${issues.join(' ')}` });
      // D-MODELLIB-2 is an ORDER (model-rule.ts): a Model of Parts waits until the run has tried the library,
      // at most twice, and never when the library is not on offer. A mesh cannot be created at all.
      const order = libraryOrder(ctx);
      const handMadeModel = ctx.freeHand ? null : refuseHandMadeModel(a.items, order);
      if (handMadeModel) {
        if (handMadeModel.ordered) noteOrderRefusal(ctx);
        return Promise.resolve(handMadeModel);
      }
      let items = (pass.items as unknown[]) ?? [];
      if (a.origin !== undefined) {
        const origin = readOrigin(a.origin, DIRECT_EDIT_LIMITS.translation);
        if ('error' in origin) return Promise.resolve({ error: `Nothing was created. ${origin.error}` });
        const moved = applyOrigin(items, origin);
        if ('error' in moved) return Promise.resolve(moved);
        items = moved.items;
      }
      // D-MODELLIB-2, phase 1: a Model of parts named like something the library already holds is created, and the
      // result says what the library has, so the agent can look before it hand-builds. Information, never a refusal.
      const advice = libraryAdvice(Array.isArray(a.items) ? a.items : []);
      const made = Promise.resolve(a.group === undefined ? createInBatches(ctx, items) : createGrouped(ctx, items, a.group));
      return advice ? made.then((r) => (r && typeof r === 'object' && !('error' in r) ? { ...r, libraryAdvice: advice } : r)) : made;
    },
  },
  /**
   * SET, AND SAY WHAT IT WAS.
   *
   * This was a bare pass-through to the plugin op: it read nothing first and emitted no panel, so a
   * run that moved a wall forty studs reported "set_properties ok" and the person had to go and
   * look. Meanwhile `PropertyRow.changed` / `.previous` and the renderer that draws
   * `<s>previous</s> → value` had existed since the schema was written with no producer in the
   * product at all — the before→after block only ever showed the after.
   *
   * Read-before-write is the pattern edit_script already uses to compute its diff (it reads the
   * current source to hash it, and turns the same read into hunks). One extra op, on a call the
   * model makes when it is changing something a person asked for.
   *
   * THE READ COMES FIRST AND ITS FAILURE IS NOT SWALLOWED INTO A CLAIM. If the instance could not
   * be read, `propertyChangeGroups` marks nothing changed — see its comment. A panel that said
   * "0 → 0.5" on the strength of having written 0.5 would be asserting something never observed.
   */
  set_properties: {
    def: {
      name: 'set_properties',
      description: 'Set properties/attributes on an existing instance. Same typed prop format as create_instances. Reports what each value WAS, so you can quote the change rather than the intention. path may be a readRef from get_project_tree to change one of several same-named siblings.',
      parameters: S({ path: { type: 'string' }, props: { type: 'object' }, attributes: { type: 'object' } }, ['path']),
    },
    studio: true,
    studioOps: ['get_instance', 'set_props'],
    mutatesProject: true,
    run: async (ctx, a) => {
      const path = String(a.path ?? '');
      const props = (a.props ?? undefined) as Record<string, unknown> | undefined;
      const attributes = (a.attributes ?? undefined) as Record<string, unknown> | undefined;

      // Best effort, and its failure is recorded as a failure rather than as "nothing changed":
      // a refusal here must not stop the write the user asked for.
      const seen = await op(ctx, { op: 'get_instance', path });
      const prior =
        seen && typeof seen === 'object' && !('error' in (seen as Record<string, unknown>))
          ? (seen as { class?: string; props?: Record<string, unknown>; attributes?: Record<string, unknown> })
          : null;

      // The same gate as create_instances, for the same reason: `set_properties` writes straight
      // into the place, so an untagged value here is a failed op in the customer's log too.
      const restyle = ctx.freeHand ? null : refuseUiLook(props, prior?.class);
      if (restyle) return restyle;
      const silent = refuseSoundId(props, ctx.discoveredAssetIds);
      if (silent) return silent;
      let sending = props;
      if (props !== undefined) {
        const pass = normaliseProps(props);
        if (pass.refusals.length > 0) {
          return { error: `Nothing was changed. ${pass.refusals.map((r) => r.message).join(' ')}` };
        }
        sending = pass.props;
      }
      const res = await op(ctx, { op: 'set_props', path, props: sending as never, attributes: attributes as never });
      if (!res || typeof res !== 'object' || 'error' in (res as Record<string, unknown>)) return res;

      const groups = propertyChangeGroups({ props, attributes }, prior, displayTagged);
      if (groups.length) {
        ctx.uiDetail = {
          v: 1,
          blocks: [{ type: 'property_inspector', path, className: prior?.class, groups }],
        };
      }
      // Stated on the RESULT as well as in the panel, because the model reads this and the person
      // reads that: a step that could not see the previous values must not be quoted as if it had.
      return { ...(res as Record<string, unknown>), priorValuesRead: prior !== null };
    },
  },
  edit_terrain: {
    def: {
      name: 'edit_terrain',
      description:
        'Edit Roblox smooth Terrain through bounded typed operations (no arbitrary Luau). ' +
        'Actions: clear (no fields; empties ALL Terrain in one call — use it for "clear/remove the terrain", never Air fills), fill_block (center,size,material), fill_ball (center,radius,material), fill_region (min,max,material), ' +
        'replace_material (min,max,sourceMaterial,targetMaterial), write_voxels (4-stud-grid origin, integer dimensions, flat voxels [{material,occupancy}]) or path. ' +
        'Materials are Enum.Material names (Enum.Material.Grass). At most 65,536 voxels per call. ' +
        'Needs a live Studio connection; one undo-recorded change. Checkpoint restore does not keep voxels: roll terrain back with Studio Undo. ' +
        'RECIPES FIRST for these landforms: "floating_island" (center, radius), a flat grassy top on a rock underside tapering to a point, returns surfaceY to stand things on; "waterfall" (top = the edge it pours over, height, width, endsIn) hangs a thin sheet of water. ' +
        'A CHANNEL OR LINE OF TERRAIN ALONG POINTS IS ONE CALL: action "path", points [[x,y,z],...] (2-32; y = the surface, or the ceiling of a covered cut), width, depth (studs down), fill "Air" (default), "Water" (waterLevel 0-1: share of the depth filled, default 0.75) or "material" (with `material`); run as blocks, at most ' + TERRAIN_PATH_OP_CAP + ' per call. ' +
        `BUILD A WHOLE FEATURE IN ONE CALL: pass operations (up to ${MAX_TERRAIN_BATCH} of the actions above, each with its own fields); they run in order: overlapping fill_balls of decreasing radius make a mound; Air then a smaller Water ball, a basin. One operation per call costs a step each.`,
      parameters: S(
        {
          operations: {
            type: 'array',
            description: `Up to ${MAX_TERRAIN_BATCH} actions run in order, each shaped like a single call. Stops at the first failure.`,
            items: { type: 'object' },
          },
          recipe: { type: 'string', enum: [...TERRAIN_RECIPES], description: 'floating_island {center, radius 12-70}; waterfall {top, height, width, endsIn: "pool"|"mist"}.' },
          top: { type: 'array', items: { type: 'number' } },
          height: { type: 'number' },
          width: { type: 'number' },
          endsIn: { type: 'string', enum: ['pool', 'mist'] },
          action: { type: 'string', enum: ['clear', 'fill_block', 'fill_ball', 'fill_region', 'replace_material', 'write_voxels', 'path'] },
          points: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
          depth: { type: 'number' },
          fill: { type: 'string', enum: ['Air', 'Water', 'material'] },
          waterLevel: { type: 'number', minimum: 0, maximum: 1 },
          center: { type: 'array', items: { type: 'number' } },
          size: { type: 'array', items: { type: 'number' } },
          radius: { type: 'number' },
          min: { type: 'array', items: { type: 'number' } },
          max: { type: 'array', items: { type: 'number' } },
          material: { type: 'string' },
          sourceMaterial: { type: 'string' },
          targetMaterial: { type: 'string' },
          origin: { type: 'array', items: { type: 'number' } },
          dimensions: { type: 'array', items: { type: 'number' } },
          voxels: { type: 'array', items: { type: 'object' } },
        },
        [],
      ),
    },
    studio: true,
    studioOps: ['terrain_edit'],
    mutatesProject: true,
    run: (ctx, a) => runTerrainEdits(ctx, a),
  },
  delete_instances: {
    def: { name: 'delete_instances', description: 'Delete instances by path only when the user asked for removal or after a replacement is already verified in Studio. A duplicate-name create error means the existing object should be inspected and edited or renamed; never delete working paths or props to make that name available. To remove one of several same-named copies, pass its readRef from get_project_tree in place of the path.', parameters: S({ paths: { type: 'array', items: { type: 'string' } } }, ['paths']) },
    studio: true,
    studioOps: ['delete_instances'],
    mutatesProject: true,
    run: (ctx, a) => ctx.blockDirectDeletion?.((a.paths as string[]) ?? [])
      ? Promise.resolve({ error: 'A create name conflict occurred in this run, so instances that were already in the place were not deleted (what this run created itself can still be removed). Inspect, edit or rename the existing path instead.' })
      : op(ctx, { op: 'delete_instances', paths: (a.paths as string[]) ?? [] }),
  },
  move_instances: {
    def: {
      name: 'move_instances',
      description: 'Reparent existing instances without recreating them. Each move is { path, newParent }; either may be a readRef from get_project_tree when siblings share a name. Paths stay inside StudPilot\'s writable place scope and Studio refuses cycles, duplicate targets and sibling-name collisions.',
      parameters: S({
        moves: {
          type: 'array',
          minItems: 1,
          maxItems: DIRECT_EDIT_LIMITS.items,
          items: S({
            path: { type: 'string', maxLength: DIRECT_EDIT_LIMITS.pathChars },
            newParent: { type: 'string', maxLength: DIRECT_EDIT_LIMITS.pathChars },
          }, ['path', 'newParent']),
        },
      }, ['moves']),
    },
    studio: true,
    studioOps: ['move_instances'],
    mutatesProject: true,
    run: (ctx, a) => {
      if (!Array.isArray(a.moves) || a.moves.length === 0 || a.moves.length > DIRECT_EDIT_LIMITS.items) {
        return Promise.resolve({ error: `moves must contain 1-${DIRECT_EDIT_LIMITS.items} entries` });
      }
      const moves: { path: string; newParent: string }[] = [];
      const seen = new Set<string>();
      for (let index = 0; index < a.moves.length; index++) {
        const raw = a.moves[index];
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return Promise.resolve({ error: `moves[${index}] must be an object` });
        const entry = raw as Record<string, unknown>;
        const path = boundedPath(entry.path, `moves[${index}].path`);
        if (typeof path !== 'string') return Promise.resolve(path);
        const newParent = boundedPath(entry.newParent, `moves[${index}].newParent`);
        if (typeof newParent !== 'string') return Promise.resolve(newParent);
        if (seen.has(path)) return Promise.resolve({ error: `moves repeats target ${path}` });
        seen.add(path);
        moves.push({ path, newParent });
      }
      return op(ctx, { op: 'move_instances', moves });
    },
  },
  // RESURFACE, embedded (apps/studpilot-plugin/src/ops/Surface.luau, credited in THIRD_PARTY_NOTICES.md): classic Roblox
  // surfaces on any part, mesh or union. Only when the person asks for that look; nothing is studded by default.
  apply_surface: {
    def: {
      name: 'apply_surface',
      description:
        'Give parts a classic Roblox surface on every face (meshes and unions included): studs, inlet, universal, weld, glue, or smooth / smooth_no_outlines to take one off. Applies to every BasePart at or under each path. Use it only when the person asks for a studded or classic look.',
      parameters: S(
        {
          paths: { type: 'array', minItems: 1, maxItems: 200, items: { type: 'string' } },
          surface: { type: 'string', enum: ['studs', 'inlet', 'universal', 'weld', 'glue', 'smooth', 'smooth_no_outlines'] },
        },
        ['paths', 'surface'],
      ),
    },
    studio: true,
    studioOps: ['apply_surface'],
    mutatesProject: true,
    run: (ctx, a) => op(ctx, applySurfaceOp((Array.isArray(a.paths) ? a.paths : []).map(String), String(a.surface) as SurfaceKind)),
  },
  transform_instances: {
    def: {
      name: 'transform_instances',
      description: 'Move, rotate and/or uniformly scale existing spatial instances as one bounded typed Studio edit. move is studs, rotate is degrees, scale is a positive multiplier.',
      parameters: S({
        paths: { type: 'array', minItems: 1, maxItems: DIRECT_EDIT_LIMITS.items, items: { type: 'string', maxLength: DIRECT_EDIT_LIMITS.pathChars } },
        move: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number' } },
        rotate: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number' } },
        scale: { type: 'number', minimum: DIRECT_EDIT_LIMITS.minScale, maximum: DIRECT_EDIT_LIMITS.maxScale },
      }, ['paths']),
    },
    studio: true,
    studioOps: ['transform_instances'],
    mutatesProject: true,
    run: (ctx, a) => {
      const paths = boundedPaths(a.paths);
      if (!Array.isArray(paths)) return Promise.resolve(paths);
      if (a.move === undefined && a.rotate === undefined && a.scale === undefined) return Promise.resolve({ error: 'pass move, rotate or scale' });
      let move: [number, number, number] | undefined;
      let rotate: [number, number, number] | undefined;
      if (a.move !== undefined) {
        const parsed = boundedTriple(a.move, 'move', DIRECT_EDIT_LIMITS.translation);
        if (!Array.isArray(parsed)) return Promise.resolve(parsed);
        move = parsed;
      }
      if (a.rotate !== undefined) {
        const parsed = boundedTriple(a.rotate, 'rotate', DIRECT_EDIT_LIMITS.rotationDegrees);
        if (!Array.isArray(parsed)) return Promise.resolve(parsed);
        rotate = parsed;
      }
      let scale: number | undefined;
      if (a.scale !== undefined) {
        scale = Number(a.scale);
        if (!Number.isFinite(scale) || scale < DIRECT_EDIT_LIMITS.minScale || scale > DIRECT_EDIT_LIMITS.maxScale) {
          return Promise.resolve({ error: `scale must be finite and between ${DIRECT_EDIT_LIMITS.minScale} and ${DIRECT_EDIT_LIMITS.maxScale}` });
        }
      }
      return op(ctx, { op: 'transform_instances', paths, ...(move ? { move } : {}), ...(rotate ? { rotate } : {}), ...(scale !== undefined ? { scale } : {}) });
    },
  },
  clone_instances: {
    def: {
      name: 'clone_instances',
      description:
        'Clone instances (collision-free names; optional parent). MANY COPIES IN ONE CALL: `paths` (a template, up to 8 cycled) plus exactly one of `at` [[x,y,z],...], `along` {points, spacing|count} or `within` {rect:{min:[x,z],max:[x,z]}|polygon, count, minSpacing?, y?}; optional yaw (number or [min,max]), scale, jitter, seed, name, parent. Up to 1000 copies; no scripts, parts anchored. `within` without y measures the ground once at its centre (scatter_instances drops each copy onto rolling terrain). Plain clones: list a source more than once or pass copies (each source that many times; <=120 per call); a source may be a get_project_tree readRef.',
      parameters: S({
        paths: { type: 'array', minItems: 1, maxItems: DIRECT_EDIT_LIMITS.items, items: { type: 'string', maxLength: DIRECT_EDIT_LIMITS.pathChars } },
        copies: { type: 'number', minimum: 1, maximum: DIRECT_EDIT_LIMITS.items, description: 'Clones of each listed source. Default 1.' },
        parent: { type: 'string', maxLength: DIRECT_EDIT_LIMITS.pathChars },
        at: { type: 'array', items: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 }, maxItems: 1000 },
        along: { type: 'object' },
        within: { type: 'object' },
        yaw: {},
        scale: {},
        jitter: { type: 'number', minimum: 0, maximum: 1000 },
        seed: { type: 'integer' },
        name: { type: 'string', maxLength: DIRECT_EDIT_LIMITS.nameChars },
      }, ['paths']),
    },
    studio: true,
    studioOps: ['clone_instances'],
    mutatesProject: true,
    run: async (ctx, a) => {
      const paths = boundedPaths(a.paths, 'paths', true);
      if (!Array.isArray(paths)) return paths;
      let parent: string | undefined;
      if (a.parent !== undefined) {
        const parsed = boundedPath(a.parent, 'parent');
        if (typeof parsed !== 'string') return parsed;
        parent = parsed;
      }
      if (a.at !== undefined || a.along !== undefined || a.within !== undefined) return placeCopiesCall(ctx, a, paths, parent);
      const plan = planCopyRounds(paths, a.copies ?? 1);
      if ('error' in plan) return plan;
      // The plugin refuses a repeated target inside one op, so N copies of one source are N rounds. Doing the
      // split here, not in the plugin, is what makes it work with the plugin already installed.
      const created: unknown[] = [];
      const refs: unknown[] = [];
      for (const [index, round] of plan.rounds.entries()) {
        const res = await op(ctx, { op: 'clone_instances', paths: round, ...(parent ? { parent } : {}) });
        if (toolError(res)) {
          // Earlier rounds are already in the place: say so, so the agent does not clone them a second time.
          return plan.rounds.length === 1 ? res : { ...(res as Record<string, unknown>), completed: index, created, ...(created.length ? { projectMutated: true } : {}) };
        }
        const data = res as { created?: unknown; refs?: unknown };
        if (plan.rounds.length === 1) return res;
        if (Array.isArray(data.created)) created.push(...data.created);
        if (Array.isArray(data.refs)) refs.push(...data.refs);
      }
      return { created, count: created.length, ...(refs.length ? { refs } : {}), rounds: plan.rounds.length };
    },
  },
  group_instances: {
    def: {
      name: 'group_instances',
      description: 'Group existing instances into a new Model. The plugin checks nesting, destination scope and path-name collisions before mutating.',
      parameters: S({
        paths: { type: 'array', minItems: 1, maxItems: DIRECT_EDIT_LIMITS.items, items: { type: 'string', maxLength: DIRECT_EDIT_LIMITS.pathChars } },
        name: { type: 'string', maxLength: DIRECT_EDIT_LIMITS.nameChars },
      }, ['paths']),
    },
    studio: true,
    studioOps: ['group_instances'],
    mutatesProject: true,
    run: (ctx, a) => {
      const paths = boundedPaths(a.paths);
      if (!Array.isArray(paths)) return Promise.resolve(paths);
      let name: string | undefined;
      if (a.name !== undefined) {
        const parsed = directName(a.name, 'name');
        if (typeof parsed !== 'string') return Promise.resolve(parsed);
        name = parsed;
      }
      return op(ctx, { op: 'group_instances', paths, ...(name ? { name } : {}) });
    },
  },
  ungroup_instances: {
    def: {
      name: 'ungroup_instances',
      description: 'Ungroup Models or Folders, moving their children to the parent and removing the empty group after collision checks.',
      parameters: S({ paths: { type: 'array', minItems: 1, maxItems: DIRECT_EDIT_LIMITS.items, items: { type: 'string', maxLength: DIRECT_EDIT_LIMITS.pathChars } } }, ['paths']),
    },
    studio: true,
    studioOps: ['ungroup_instances'],
    mutatesProject: true,
    run: (ctx, a) => {
      const paths = boundedPaths(a.paths);
      return Array.isArray(paths) ? op(ctx, { op: 'ungroup_instances', paths }) : Promise.resolve(paths);
    },
  },
  rename_instance: {
    def: {
      name: 'rename_instance',
      description: 'Rename one existing instance without recreating it. Studio refuses protected structures and sibling-name collisions. path may be a readRef from get_project_tree: renaming one of several same-named siblings is how they become addressable by plain paths.',
      parameters: S({ path: { type: 'string', maxLength: DIRECT_EDIT_LIMITS.pathChars }, name: { type: 'string', maxLength: DIRECT_EDIT_LIMITS.nameChars } }, ['path', 'name']),
    },
    studio: true,
    studioOps: ['rename_instance', 'search_scripts'],
    mutatesProject: true,
    run: (ctx, a) => {
      const path = boundedPath(a.path, 'path');
      if (typeof path !== 'string') return Promise.resolve(path);
      const name = directName(a.name, 'name');
      if (typeof name !== 'string') return Promise.resolve(name);
      return renameAndAudit(ctx, path, name);
    },
  },
  set_locked: {
    def: {
      name: 'set_locked',
      description: 'Set the Studio Locked property on all BaseParts under the named instances. Bounded to the plugin\'s affected-part ceiling.',
      parameters: S({ paths: { type: 'array', minItems: 1, maxItems: DIRECT_EDIT_LIMITS.items, items: { type: 'string', maxLength: DIRECT_EDIT_LIMITS.pathChars } }, locked: { type: 'boolean' } }, ['paths', 'locked']),
    },
    studio: true,
    studioOps: ['set_locked'],
    mutatesProject: true,
    run: (ctx, a) => {
      const paths = boundedPaths(a.paths);
      if (!Array.isArray(paths)) return Promise.resolve(paths);
      if (typeof a.locked !== 'boolean') return Promise.resolve({ error: 'locked must be true or false' });
      return op(ctx, { op: 'set_locked', paths, locked: a.locked });
    },
  },
  set_visible: {
    def: {
      name: 'set_visible',
      description: 'Show or hide spatial instances or GUI objects through the plugin\'s reversible typed visibility operation.',
      parameters: S({ paths: { type: 'array', minItems: 1, maxItems: DIRECT_EDIT_LIMITS.items, items: { type: 'string', maxLength: DIRECT_EDIT_LIMITS.pathChars } }, visible: { type: 'boolean' } }, ['paths', 'visible']),
    },
    studio: true,
    studioOps: ['set_visible'],
    mutatesProject: true,
    run: (ctx, a) => {
      const paths = boundedPaths(a.paths);
      if (!Array.isArray(paths)) return Promise.resolve(paths);
      if (typeof a.visible !== 'boolean') return Promise.resolve({ error: 'visible must be true or false' });
      return op(ctx, { op: 'set_visible', paths, visible: a.visible });
    },
  },
  /**
   * READ-BACK — the tool the system prompt has always told the model to call.
   *
   * prompts.ts:73 instructs it to "verify with a read-back (get_instance, or run_luau returning the
   * value) and quote what you actually saw". `get_instance` was never a tool. The op has existed in
   * the wire union and had a plugin handler the whole time (Ops.luau `handlers.get_instance`), but
   * it was reachable only behind ADMIN_STUDIO_OPS, so a model obeying its own instructions asked for
   * a tool that did not exist and fell back to spending a whole run_luau on a property read.
   *
   * studio-op-parity.test.mjs records the opposite decision — that `get_instance`, `get_selection`
   * and `move_instances` "are not tools; they are plugin OPS" — and it was right about the bug it
   * was fixing: `lib/tool-meta.ts` had LABELLED them as tools without any of them being registered,
   * so the UI named tools the agent could not call. That is drift. Registering them properly is the
   * other way to close the same gap, and it is the one the system prompt already assumes.
   *
   * The panel is free. `documentFromToolDetail` passes a `{v:1,blocks:[…]}` document straight
   * through to the validated renderer (adapters.ts:331), and `property_inspector` has had a
   * renderer and a ui-lab entry with no producer in the product since it was written.
   */
  get_instance: {
    def: {
      name: 'get_instance',
      description:
        'Read one instance back: its class, child count, common properties and attributes. Use it to VERIFY a change you just made, and quote what you actually saw rather than what you intended. Cheaper and more reliable than a run_luau that returns the same value. When a tree provides readRef for a duplicate-named instance, pass that exact readRef as path to read it; references expire and cannot authorize writes.',
      parameters: S({ path: { type: 'string', description: 'Full path, e.g. game.Workspace.Lobby.Floor' } }, ['path']),
    },
    studio: true,
    studioOps: ['get_instance'],
    run: async (ctx, a) => {
      const path = String(a.path ?? '');
      if (!path) return { error: 'path is required' };
      const res = await op(ctx, { op: 'get_instance', path });
      if (!res || typeof res !== 'object' || 'error' in (res as Record<string, unknown>)) return res;

      const d = res as { path?: string; class?: string; childCount?: number; props?: Record<string, unknown>; attributes?: Record<string, unknown> };
      const props = d.props ?? {};
      // Grouped the way a person reads an instance, not the way the plugin happened to probe it.
      // A group with no rows is dropped rather than rendered empty.
      const GROUPS: { name: string; keys: string[] }[] = [
        { name: 'Transform', keys: ['Position', 'Size', 'CFrame', 'Anchored'] },
        { name: 'Appearance', keys: ['Color', 'Material', 'Transparency'] },
        { name: 'Content', keys: ['Text', 'Value', 'Image', 'SoundId'] },
      ];
      const groups = GROUPS.map((g) => ({
        name: g.name,
        rows: g.keys
          .filter((k) => props[k] !== undefined)
          .map((k) => ({ name: k, value: displayTagged(props[k]) })),
      })).filter((g) => g.rows.length > 0);
      const attrs = Object.entries(d.attributes ?? {});
      if (attrs.length) {
        groups.push({ name: 'Attributes', rows: attrs.map(([k, v]) => ({ name: k, value: displayTagged(v) })) });
      }

      if (groups.length) {
        ctx.uiDetail = {
          v: 1,
          blocks: [{ type: 'property_inspector', path: d.path ?? path, className: d.class, groups }],
        };
      }
      return res;
    },
  },
  /**
   * What the USER has selected in Studio — the missing half of "make this taller".
   *
   * Without it the model has no way to resolve "this", so a request about the thing the person is
   * looking at becomes a guess about a path. The op and its handler already existed.
   */
  get_selection: {
    def: {
      name: 'get_selection',
      description:
        "What the user currently has selected in Studio. Call this FIRST whenever the request says 'this', 'these', 'the selected one' or points at something without naming a path.",
      parameters: S({}),
    },
    studio: true,
    studioOps: ['get_selection'],
    run: async (ctx) => op(ctx, { op: 'get_selection' }),
  },
  /**
   * Point the user's Studio camera at what was just built or changed.
   *
   * The agent could already change a place the user was not looking at, which is how work gets done
   * and then reported as "I added a fountain" to someone staring at an empty corner.
   */
  focus_camera: {
    def: {
      name: 'focus_camera',
      description:
        "Move the user's Studio camera to frame an instance. Call it after building or changing something the user should look at, so the change is visible in their viewport rather than only in the place file.",
      parameters: S({ path: { type: 'string', description: 'Full path of the instance to frame.' } }, ['path']),
    },
    studio: true,
    studioOps: ['camera_focus'],
    run: async (ctx, a) => {
      const path = String(a.path ?? '');
      if (!path) return { error: 'path is required' };
      return op(ctx, { op: 'camera_focus', path });
    },
  },
  /**
   * Put what was just built into the user's own selection.
   *
   * The last of the read-mostly orphaned ops. `focus_camera` points the viewport at a thing;
   * this makes it the thing Studio's own tools are aimed at, so "I widened the doorway" arrives
   * with the doorway already selected and the user's next drag or property edit lands on it.
   * Non-destructive: it changes the selection, never the place.
   *
   * `move_instances` and `undo_waypoint` are deliberately still unregistered — one mutates the
   * place and the other drives ChangeHistoryService, which is the restore path.
   */
  select_instances: {
    def: {
      name: 'select_instances',
      description:
        "Select instances in the user's Studio, so their next action lands on what you just built or changed. Pair it with focus_camera when you want them to both see it and be able to act on it. Replaces the current selection.",
      parameters: S(
        { paths: { type: 'array', items: { type: 'string' }, description: 'Full instance paths.' } },
        ['paths'],
      ),
    },
    studio: true,
    studioOps: ['select'],
    run: async (ctx, a) => {
      const paths = (Array.isArray(a.paths) ? a.paths : [])
        .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
        .slice(0, 100);
      if (!paths.length) return { error: 'paths must be a non-empty array of instance paths' };
      return op(ctx, { op: 'select', paths });
    },
  },
  /**
   * Where the user's camera is, and roughly what is in front of it.
   *
   * Without this the agent builds into a place it cannot see the shape of: it knows the tree, not
   * the arrangement, so "put the bench next to the fountain" is a guess about coordinates. The op
   * returns the camera plus a bounded spatial summary of the top-level children.
   */
  viewport_info: {
    def: {
      name: 'viewport_info',
      description:
        "Where the user's camera is pointing and a spatial summary of what is in the Workspace — each top-level model or part with its centre and size in studs. Call it before placing something relative to what already exists, so the position is measured rather than guessed.",
      parameters: S({}),
    },
    studio: true,
    studioOps: ['viewport_info'],
    run: async (ctx) => op(ctx, { op: 'viewport_info' }),
  },
  run_luau: {
    def: {
      name: 'run_luau',
      description:
        'Run a Luau snippet in Studio (edit-time, plugin context) for inspection, bulk edits and math when a typed tool does not cover the job. Use edit_terrain for Terrain. print() output and the returned value come back. No game scripts run. It may NOT be used to bring assets into the place: GetObjects, InsertService, rbxassetid://, Content.fromAssetId, loadstring and require of an asset id are refused here — use insert_asset, which verifies the id and scans the place afterwards.',
      parameters: S({ code: { type: 'string' } }, ['code']),
    },
    studio: true,
    studioOps: ['run_code'],
    mutatesProject: true,
    run: async (ctx, a) => {
      // Admitted BEFORE the op is queued. By the time an asset reaches the place its scripts have
      // already had their chance to run, so there is no useful check on the far side of this.
      // The ingress gate is handed to admission rather than called beside it: sandbox.ts REFUSES
      // Luau bound for Studio that arrives without one, so this cannot be forgotten later.
      const handMadeUi = ctx.freeHand ? null : refuseLibraryLuau(luauScanVariants(String(a.code ?? '')), UI_RULE);
      if (handMadeUi) return handMadeUi;
      const handMadeFx = ctx.freeHand ? null : refuseLibraryLuau(luauScanVariants(String(a.code ?? '')), FX_RULE);
      if (handMadeFx) return handMadeFx;
      // D-MODELLIB-2: run_luau does not assemble props either.
      const handMadeModel = ctx.freeHand ? null : refuseHandMadeModelLuau(luauScanVariants(String(a.code ?? '')), libraryOrder(ctx));
      if (handMadeModel) {
        if (handMadeModel.ordered) noteOrderRefusal(ctx);
        return handMadeModel;
      }
      const gameRule = refuseGameScript(luauScanVariants(String(a.code ?? '')));
      if (gameRule) return gameRule;
      const job = admitProgram({
        runtime: 'luau',
        backend: 'studio',
        source: String(a.code ?? ''),
        ingress: refuseLuauIngress,
      });
      if (isRefusal(job)) return { error: job.error, ...(job.blocked ? { blocked: job.blocked } : {}) };
      const raw = await op(ctx, { op: 'run_code', code: job.source, timeoutMs: job.limits.wallMs }, studioWaitMs(job));
      return capStudioPrints(raw, job);
    },
  },
  run_and_check: {
    def: {
      name: 'run_and_check',
      description:
        'Playtest verification: starts Run mode (server simulation), waits, collects console output/errors, stops. Returns the logs. Use AFTER building, to verify nothing errors. It proves NOTHING ERRORED, which is not the same as anything being correct — a shop that debits the wrong amount errors nowhere. Use run_spec for assertions about behaviour. Run mode is NOT a sandbox — it executes your server scripts against the real place and Studio does not undo what they destroy — so this takes a protective checkpoint first, and restores automatically if the playtest destroys anything.',
      parameters: S({ seconds: { type: 'number', description: '2-15, default 5' } }),
    },
    studio: true,
    studioOps: ['project_census', 'snapshot', 'run_mode', 'get_logs', 'restore'],
    run: async (ctx, a) => {
      const secs = Math.min(15, Math.max(2, Number(a.seconds) || 5));

      // Census BEFORE. RunService:Run() executes server scripts against the EDIT DataModel and Stop
      // does not revert them, so anything a startup script destroys is destroyed for real.
      // Reproduced in live Studio — the transcript is in apps/worker/src/playtest.ts.
      const beforeRaw = await ctx.execStudioOp({ op: 'project_census' }, 30_000);
      const before = beforeRaw.ok ? parseCensus(beforeRaw.data) : null;

      // The playtest becomes watchable from here. `begin` is deliberately AFTER the
      // census and BEFORE the checkpoint, so a refusal below is reported to the card as
      // a failed playtest the user can see the reason for, rather than as a playtest
      // that never appeared to exist.
      ctx.playtest?.begin({ requestedSeconds: secs, action: 'Taking a protective checkpoint' });

      // Protective checkpoint. If there is real work here and it cannot be protected, REFUSE — an
      // unprotected playtest is precisely the hazard, and declining costs the user nothing.
      let checkpointId: string | null = null;
      if (needsProtection(before)) {
        const cp = await ctx.createCheckpoint('before playtest', 'auto');
        if ('error' in cp) {
          ctx.playtest?.phase('failed', 'Refused: the project could not be protected first', cp.error);
          return {
            error:
              `refused to playtest: could not take a protective checkpoint first (${cp.error}). ` +
              'Run mode executes server scripts against the real place and Studio does not undo what they destroy, ' +
              'so this would risk the build. Use play_check instead: it plays as a real player in a throwaway copy and needs no checkpoint.',
          };
        }
        checkpointId = cp.id;
      }

      ctx.playtest?.phase('preparing', 'Starting run mode in Studio');
      const start = await ctx.execStudioOp({ op: 'run_mode', action: 'start' }, 20_000);
      if (!start.ok) {
        ctx.playtest?.phase('failed', 'Run mode would not start', start.error);
        return { error: `could not start run mode: ${start.error}` };
      }

      // ------------------------------------------------------------- watch it run
      //
      // What replaced a blind `sleep(secs)`. The simulation runs for the same wall
      // clock either way; the difference is that the user can now see it.
      //
      // The loop is driven by the CLOCK, not by a frame counter: each pass captures a
      // frame if the rate gate allows one, and sleeps only for what is left of the
      // interval. A rasterise that takes 800ms therefore costs the playtest nothing —
      // it eats into the wait rather than extending the run past `secs`, so the
      // playtest still lasts as long as the agent asked for and no longer.
      //
      // Frames are captured through the EXISTING `render_view` op, at a size the
      // existing plugin already clamps to. No new op, no protocol bump, nothing that
      // an installed plugin would fail on — which matters because Roblox has no
      // automatic plugin updating and a new op would be broken for every current user
      // until each of them clicked Update by hand.
      // Anything thrown while Run mode is live (a frame capture, a log read) must not leave Studio
      // simulating: every edit after it would be refused until someone pressed Stop by hand.
      let logs: OpResult;
      try {
        const deadline = Date.now() + secs * 1000;
        const pt = ctx.playtest;
        if (pt) {
          pt.phase('running', 'Run mode is live — capturing frames');
          let logsSeen = 0;
          while (Date.now() < deadline) {
            const tickStart = Date.now();
            if (pt.canCapture()) await pt.captureFrame();

            // Console state is refreshed roughly every other capture. Reading it every
            // pass would double the op traffic to show a number that changes slowly.
            logsSeen += 1;
            if (logsSeen % 2 === 0) {
              const live = await ctx.execStudioOp({ op: 'get_logs', maxEntries: 120 }, 10_000);
              if (live.ok) {
                const counts = countConsole(parseLogEntries(live.data) ?? undefined);
                pt.console(counts.errors, counts.warnings);
              }
            }

            const spent = Date.now() - tickStart;
            const wait = Math.min(PLAYTEST_FRAME_MIN_INTERVAL_MS - spent, deadline - Date.now());
            if (wait > 0) await new Promise((r) => setTimeout(r, wait));
          }
          pt.phase('stopping', 'Stopping run mode and checking what changed');
        } else {
          await new Promise((r) => setTimeout(r, secs * 1000));
        }

        logs = await ctx.execStudioOp({ op: 'get_logs', maxEntries: 120 }, 15_000);
        if (logs.ok) {
          const counts = countConsole(parseLogEntries(logs.data) ?? undefined);
          ctx.playtest?.console(counts.errors, counts.warnings);
        }
      } catch (err) {
        await ctx.execStudioOp({ op: 'run_mode', action: 'stop' }, 20_000).catch(() => undefined);
        throw err;
      }
      const stop = await ctx.execStudioOp({ op: 'run_mode', action: 'stop' }, 20_000);

      // Census AFTER, and restore if the playtest ate anything.
      const afterRaw = await ctx.execStudioOp({ op: 'project_census' }, 30_000);
      const after = afterRaw.ok ? parseCensus(afterRaw.data) : null;
      const lost = before && after ? destructiveDelta(before, after) : [];

      let restored: string | undefined;
      if (lost.length && checkpointId && ctx.restoreCheckpoint) {
        const res = await ctx.restoreCheckpoint(checkpointId);
        // The restore is VERIFIED, never assumed: re-census and confirm the losses are actually back.
        const checkRaw = res.ok ? await ctx.execStudioOp({ op: 'project_census' }, 30_000) : null;
        const check = checkRaw?.ok ? parseCensus(checkRaw.data) : null;
        const stillLost = before && check ? destructiveDelta(before, check) : ['the restore could not be verified'];
        restored =
          res.ok && stillLost.length === 0
            ? 'the project was restored from the pre-playtest checkpoint, and the restore was verified by re-counting'
            : `THE RESTORE DID NOT FULLY SUCCEED (${res.error ?? stillLost.join('; ')}) — checkpoint ${checkpointId} still holds the pre-playtest state`;
      }

      // The card's last word. A playtest that destroyed work says so even when the
      // restore succeeded, because "it was put back" and "nothing happened" are
      // different facts and the user is entitled to the first one.
      ctx.playtest?.phase(
        'finished',
        lost.length
          ? `Finished — the playtest destroyed committed work${restored ? ' and it was restored' : ''}`
          : 'Finished',
      );

      // Safety fields come FIRST. Tool results are truncated at MAX_RESULT_CHARS and the console log
      // is easily thousands of characters, so putting the destruction warning after it means the
      // agent never sees the one thing it must not miss.
      // A STOP THAT FAILED IS THE HEADLINE. Measured 2026-09-22 (run fad0ab1b): the plugin refused its
      // own stop, this returned `stopped: false` beside a green ✓, the agent never noticed, and every
      // edit after it was refused because Studio was still in a test. Safety fields come first below.
      if (!stop.ok) {
        ctx.playtest?.phase('failed', 'Run mode is still running in Studio', stop.error);
      }
      return {
        ...(!stop.ok
          ? {
              error: `the playtest could not stop Run mode: ${stop.error}`,
              stillRunning:
                `Run mode is STILL RUNNING in Studio — the stop was refused: ${stop.error}. Nothing in the place can ` +
                'be edited until it stops. Tell the user to press Stop in Studio; do not report this playtest as a pass.',
            }
          : {}),
        ...(lost.length
          ? {
              destroyedByPlaytest: lost,
              restored,
              warning:
                'A script destroyed committed work when the simulation started. Run mode is not a sandbox — it runs ' +
                'your scripts against the real place. Find the script that deletes instances on startup and guard it ' +
                'before playtesting again.',
            }
          : {}),
        ...(checkpointId ? { protectedByCheckpoint: checkpointId } : {}),
        ...(before && after ? {} : { censusUnavailable: true }),
        ranSeconds: secs,
        stopped: stop.ok,
        logs: logs.ok ? logs.data : { error: logs.error },
      };
    },
  },
  /**
   * THE PLAYER-SIDE CHECK (F-046). A separate tool rather than `run_and_check({ player: true })`,
   * because the capability filter withholds whole tools: an option on run_and_check would be
   * advertised to every model on every plugin, including the 1.1.0 store build that cannot run it,
   * and the first the model heard of that would be a refusal mid-check. As its own tool it is
   * offered only when the plugin explicitly reports `play_check` supported (OPT_IN_OPERATIONS).
   * It also has none of run_and_check's census/checkpoint machinery to carry: a Test session runs
   * on a COPY of the place, so the customer's scripts cannot destroy committed work through it.
   */
  play_check: {
    def: {
      name: 'play_check',
      description:
        "Playtest AS A PLAYER: starts a real Studio Test session with one player, waits `seconds`, optionally walks the character onto each `touch` part (e.g. a coin), then reports what the player's screen actually shows (every ScreenGui in PlayerGui, enabled or not, and its visible text), the player's leaderstats before and after, and the errors from BOTH the client (LocalScripts) and the server. Use it before you say a counter, HUD, button or other on-screen UI works — run_and_check has no player and cannot see the screen or any LocalScript. It does not press buttons: to prove a button flow (Shop → Buy) use play_check_ui, which clicks each button and reports what the click changed. The session runs on a copy of the place; its temporary check scripts are removed afterwards. It takes Studio over for up to about a minute. tests:true instead runs the place's TestEZ unit tests (every ModuleScript named *.spec; TestEZ must be in the place) in a Test session and reports passed/failed/skipped with each failure.",
      parameters: S({
        tests: { type: 'boolean', description: 'Run the TestEZ *.spec modules instead of the player check (same as run_tests).' },
        seconds: { type: 'number', description: '3-15, default 5: how long the player stays in before the touches and the screen read' },
        touch: {
          type: 'array',
          items: { type: 'string' },
          description: 'up to 5 BasePart/Model paths inside game.Workspace to walk onto, in order, e.g. ["game.Workspace.Coins.Coin1"]',
        },
      }),
    },
    studio: true,
    studioOps: ['play_check'],
    run: async (ctx, a) => {
      // Plugin 2.0: the Studio agent's surface is capped at 25 tools, so its unit-test runner rides on play_check.
      if (a.tests === true) return TOOLS.run_tests!.run(ctx, {});
      const seconds = Math.min(15, Math.max(3, Math.round(Number(a.seconds) || 5)));
      const rawTouch = a.touch === undefined ? [] : a.touch;
      if (!Array.isArray(rawTouch) || rawTouch.length > 5 || rawTouch.some((p) => typeof p !== 'string' || p.length > 320)) {
        return { error: 'touch must be a list of at most 5 instance paths inside game.Workspace' };
      }
      const touch = rawTouch as string[];
      // The plugin's own bound on the session is 50s; the slack covers inserting and removing the
      // harness and Studio starting and ending the Test session around it.
      const res = await op(ctx, { op: 'play_check', seconds, ...(touch.length ? { touch } : {}) }, 90_000);
      if (res && typeof res === 'object' && 'error' in res) {
        return {
          ...(res as Record<string, unknown>),
          notVerified: 'The player-side check did not produce a report, so nothing on the player\'s screen was observed. Do not claim any UI works.',
        };
      }
      ctx.evidenceRaw = res;
      // What interaction the check exercised, said plainly: a check that touched nothing proves nothing about a click or a walk-in.
      return { ...summarisePlayCheck(res), interaction: touch.length ? `walked onto ${touch.join(', ')}` : 'none: no part was named in touch, so nothing was walked into or pressed (the screen and the output were read)' };
    },
  },
  /**
   * F-050: play_check that also PRESSES on-screen buttons, so a flow like Shop -> Buy is verified by
   * a click rather than asserted. Its own tool for the same reason play_check is not an option on
   * run_and_check: an option would be offered to the store plugin that cannot run it.
   */
  play_check_ui: {
    def: PLAY_CHECK_UI_DEF,
    studio: true,
    studioOps: ['play_check_ui'],
    run: async (ctx, a) => {
      const request = playCheckUiOp(a);
      if ('error' in request) return request;
      // Each press adds up to two seconds to the plugin's own bound; the slack is play_check's.
      const res = await op(ctx, request, 100_000);
      if (res && typeof res === 'object' && 'error' in res) {
        return {
          ...(res as Record<string, unknown>),
          notVerified: 'The player-side check did not produce a report, so no button was observed being pressed. Do not claim any UI flow works.',
        };
      }
      ctx.evidenceRaw = res;
      return summarisePlayCheck(res);
    },
  },
  get_output_logs: {
    def: { name: 'get_output_logs', description: 'Read recent Studio output/console logs (errors, warnings, prints).', parameters: S({}) },
    studio: true,
    studioOps: ['get_logs'],
    run: (ctx) => op(ctx, { op: 'get_logs', maxEntries: 120 }),
  },
  capture_studio_viewport: {
    def: {name:'capture_studio_viewport',description:'Capture bounded native pixels of the active Studio viewport, including engine effects, materials and visible UI. The picture goes to the screen strip the user sees and is never sent to a model. Honors Roblox screenshot permission; does not frame a target, change camera, or start Play. Current camera must already show the subject. Capturing pixels does not establish target visibility or visual quality.',parameters:S({})},
    studio:true,
    studioOps:['capture_studio_viewport'],
    run:async ctx => {
      const result=await ctx.execStudioOp({op:'capture_studio_viewport'},45_000);
      if (!result.ok) return {error:result.error ?? 'Native viewport capture refused'};
      const frame=result.data as StudioFrame;
      if(frame?.source !== 'studio_viewport' || !['png','rgb24'].includes(frame.encoding ?? '') || !frame.rgbBase64) return {error:'Plugin returned no native viewport pixels; no software substitute accepted.'};
      ctx.emitFrame?.(frame);
      return {captured:true,source:frame.source,encoding:frame.encoding,width:frame.width,height:frame.height,subject:'game.Workspace',nativeWidth:frame.nativeWidth,nativeHeight:frame.nativeHeight,resampled:frame.resampled,targetFramed:false,judged:false,note:'Active Studio camera only. Target visibility and quality have not been judged.'};
    },
  },
  render_view: {
    def: {
      name: 'render_view',
      description:
        'Produce software geometry views and, when permitted, native pixels of the active Studio viewport. Software views approximate parts and omit effects such as Beams. Native viewport pixels use the current camera and do not prove requested-target visibility. The frames go to the screen strip the user sees and are never sent to a model.',
      parameters: S({
        target: { type: 'string', description: 'instance path to frame, e.g. game.Workspace.Plaza. Omit for the whole workspace.' },
        view: { type: 'string', enum: [...RENDER_VIEWS, 'all'], description: 'camera preset; "all" renders every angle' },
      }),
    },
    studio: true,
    studioOps: ['render_view'],
    run: async (ctx, a) => {
      const res = await renderViews(ctx, a.target ? String(a.target) : undefined, String(a.view ?? 'hero'));
      if ('error' in res) return res;
      // The images themselves never enter the transcript — they are ~60KB each and tool results
      // are re-sent on every later step. They reach the user's screen strip (renderViews emits them) and nothing else.
      return { subject: res.subject, boundsSizeStuds: res.boundsSize, views: res.views.map((v) => ({ view: v.name, ...v.meta })), nativeViewportCaptured:!!res.studioViewport, targetFramed:res.views.length > 0, softwareRenderError:res.softwareRenderError, note:res.views.length ? 'Software geometry views are approximations; native capture is the active Studio camera.' : 'Native active viewport captured; requested target visibility is not established. No software geometry views or quality score.' };
    },
  },
  /**
   * THE STORE-PAGE IMAGE — a framed, composed use of the render path, not a second pipeline.
   *
   * Everything here already existed and had never been pointed at this question: `render_view`
   * makes real pixels of the real place, `compositionMetrics` measures them over the geometry mask,
   * `encodePng` turns packed RGB into a file, `storeImage` parks it where the project's own serving
   * route can hand it back. What was missing was the FRAMING — a required aspect ratio, a choice
   * between angles made on measurement, and an honest account of the gap between what we can
   * capture and what Roblox asks for. thumbnail.ts holds all three.
   *
   * THE TWO REFUSALS ARE THE FEATURE.
   *   * No Studio, or a render that fails, produces NOTHING. It does not fall through to
   *     `generate_image`, because a picture of a game that does not exist is a misrepresentation of
   *     the product on its own store page, and the owner has rejected that explicitly.
   *   * No upload, ever, by any path. Roblox has no Open Cloud endpoint for experience thumbnails,
   *     and the scope that would let us try (`asset:write`) creates a permanently undeletable
   *     Image. See THUMBNAIL_UPLOAD.
   */
  compose_thumbnail: {
    def: {
      name: 'compose_thumbnail',
      description:
        "Frame and capture a store-page image of the place the user is actually building — the thumbnail on Roblox's home and experience detail pages, or the square experience icon. It renders the real place from every camera angle, measures each, and proposes the best-framed shot at the aspect ratio Roblox requires. The image is SHOWN to the user and saved for an hour where they can download it. IT IS NOT AN UPLOAD-READY ASSET and you must not say it is: the plugin's rasteriser caps far below the size Roblox wants and draws no lighting, shadows or materials, so this settles the COMPOSITION and the user takes the full-resolution shot in Studio themselves. Roblox publishes no API for experience thumbnails, so never tell the user it has been set on their experience; report the steps this returns. Never substitute generate_image for this: a store-page image must be the actual place.",
      parameters: S({
        kind: { type: 'string', enum: ['thumbnail', 'icon'], description: 'thumbnail = the wide store-page image; icon = the square experience icon. Default thumbnail.' },
        target: { type: 'string', description: 'instance path to frame, e.g. game.Workspace.Plaza. Omit to frame the whole place, which is usually what a store-page image wants.' },
      }),
    },
    studio: true,
    studioOps: ['render_view'],
    run: async (ctx, a) => {
      // Checked BEFORE the render, not after: without a project the pixels are unretrievable by
      // anyone, so stalling the user's Studio to rasterise five angles would spend their editor's
      // main thread on something nobody could ever open.
      if (!ctx.projectId) return { error: 'compose_thumbnail needs a project to save the image against' };

      const kind: ThumbnailKind = a.kind === 'icon' ? 'icon' : 'thumbnail';
      const spec = ROBLOX_IMAGE_SPECS[kind];
      const capture = captureSizeFor(kind);

      // Every angle, because choosing between them IS the framing. `all` is the render op's own
      // preset for that, at the timeout it has always used.
      const res = await renderViews(ctx, a.target ? String(a.target) : undefined, 'all', capture);
      if ('error' in res) {
        return {
          error:
            `No ${spec.what} was made: the place could not be rendered (${res.error}). ` +
            'A store-page image has to be a picture of the actual place, so nothing is produced when the render fails. ' +
            'Fix the render first — check that there is geometry in the workspace and that Studio is still connected.',
        };
      }

      const candidates: FramingInput[] = [];
      for (const v of res.views) {
        if (!isFramableView(v.name)) continue;
        const px = v.meta.width * v.meta.height * 3;
        const rgb = decodeRgbBase64(v.rgbBase64);
        if (rgb.length < px) continue; // a frame whose payload is short of its declared size is not a frame
        const m = compositionMetrics(rgb.subarray(0, px), v.meta.width, v.meta.height);
        candidates.push({
          view: v.name,
          coverage: v.meta.subjectCoverage,
          colourfulness: m.maskedColorfulness,
          centroidOffset: m.centroidOffset,
          silhouetteRange: m.silhouetteRange,
        });
      }

      const chosen = chooseFraming(candidates);
      if (!chosen) {
        return {
          error:
            `No ${spec.what} was made: none of the rendered angles can stand as a store-page image. ` +
            'The plan view is excluded on purpose — a floor plan is a diagram, not a thumbnail — so this means ' +
            'the perspective angles came back empty or unreadable. Build or reposition something and render again.',
        };
      }

      const frame = res.views.find((v) => v.name === chosen.view)!;
      const png = await encodePng(
        decodeRgbBase64(frame.rgbBase64).subarray(0, frame.meta.width * frame.meta.height * 3),
        frame.meta.width,
        frame.meta.height,
      );
      // Hoisted rather than nested inside the call: image-route.test.mjs reads this call site out
      // of the source to prove every store is project-scoped, and a nested call hides the argument
      // list from it. A guard that cannot see the argument is a guard that passes for no reason.
      const pngBase64 = bytesToBase64(png);
      const imageId = await storeImage(ctx.env, pngBase64, ctx.projectId);

      // The pixels reach the BROWSER by path and the transcript carries only the id half — the same
      // split generate_image follows, and for the same reason: a leaked transcript must not carry a
      // fetchable handle, and the model cannot read a PNG anyway.
      ctx.uiDetail = thumbnailPanel({
        imageId,
        src: imagePathFor(ctx.projectId, imageId),
        kind,
        subject: res.subject,
        capture: { width: frame.meta.width, height: frame.meta.height },
        view: chosen.view,
      });

      const short = shortfallAgainst(kind);
      return {
        imageId,
        kind,
        view: chosen.view,
        framing: chosen.because,
        captured: { width: frame.meta.width, height: frame.meta.height },
        requirement: { width: spec.width, height: spec.height, aspect: spec.aspectLabel },
        shortfallScale: short.scale,
        // Said in several fields rather than one sentence, because each is a different claim and the
        // one that matters most has to survive the result being truncated.
        uploadReady: false,
        uploadedToRoblox: false,
        uploadSupported: THUMBNAIL_UPLOAD.supported,
        limitation: short.note,
        whyNoUpload: THUMBNAIL_UPLOAD.reason,
        nextSteps: publishSteps(kind),
        alsoConsidered: candidates.filter((c) => c.view !== chosen.view).map((c) => c.view),
      };
    },
  },
  /**
   * ART DIRECTION — the lighting half of "does this read as a place, or as a grey blockout".
   *
   * worldbuilding.ts carries eight named lighting moods and `worldBuildingBrief` describes them to
   * the model on build requests. This tool materialises those presets through bounded typed Studio
   * properties; the older `moodLuau` export remains only as compatibility/test surface.
   *
   * The model's argument selects a ROW of MOODS and every value is sent through typed Studio
   * properties. An unknown mood is refused by name rather than
   * silently resolved to `day`, because a mood that quietly did not apply is the same invisible
   * failure as no mood at all.
   */
  set_mood: {
    def: {
      name: 'set_mood',
      description:
        'Apply a named lighting mood: atmosphere, bloom, colour correction, sun rays and depth of field, plus the Lighting properties that carry it; how a scene stops looking like a grey blockout. Call it once the geometry is roughly in place, BEFORE render_view. Pick the nearest preset, then set the exact hour or feel with overrides.',
      parameters: S(
        {
          mood: {
            type: 'string',
            enum: Object.keys(MOODS),
            description: 'A named mood: a complete lighting setup.',
          },
          overrides: {
            type: 'object',
            description: `Applied after the preset: {lighting?: {${Object.keys(MOOD_OVERRIDES.lighting).join(', ')}}, atmosphere?: {${Object.keys(MOOD_OVERRIDES.atmosphere).join(', ')}}, colorCorrection?: {${Object.keys(MOOD_OVERRIDES.colorCorrection).join(', ')}}}. Colours [r,g,b] 0-255; ClockTime 0-24.`,
          },
        },
        ['mood'],
      ),
    },
    studio: true,
    studioOps: ['get_tree', 'delete_instances', 'set_props', 'create_instances'],
    mutatesProject: true,
    run: async (ctx, a) => {
      let projectMutated = false;
      const mood = String(a.mood ?? '');
      if (!Object.hasOwn(MOODS,mood)) {
        return {
          error: `unknown mood "${mood}" for this lighting library. Choose one of: ${Object.keys(MOODS).join(', ')}.`,
        };
      }
      // Overrides are read BEFORE anything changes: an unknown name or a bad value must not leave a half-applied mood.
      const overrides = readMoodOverrides(a.overrides);
      if ('error' in overrides) return overrides;
      const tree = await op(ctx, { op: 'get_tree', root: 'game.Lighting', maxDepth: 1, maxNodes: 200 });
      if (toolError(tree)) return tree;
      const root = treeRoot(tree);
      if (!root) return { error: 'Studio returned no Lighting tree' };
      const owned: string[] = [];
      const kept: string[] = [];
      // ONE ATMOSPHERE PER PLACE. The user's other effects are kept and stacked with the mood's, but a
      // place renders a single Atmosphere, and creating a second beside theirs collides on the name.
      // Measured 2026-09-22 (run 1fe40a80): "game.Lighting already contains a child named Atmosphere"
      // — the Baseplate template ships one — after Lighting had already been changed, so the mood was
      // left half applied. The mood's values now go onto the Atmosphere the place already has.
      let userAtmosphere: string | null = null;
      for (const child of root.children ?? []) {
        if (!child.class || !LIGHTING_EFFECT_CLASSES.has(child.class)) continue;
        if (decodeTagged(child.attributes?.AppleMood) !== null && decodeTagged(child.attributes?.AppleMood) !== undefined) {
          if (child.path) owned.push(child.path);
        } else if (child.class === 'Atmosphere' && child.path && !userAtmosphere) {
          userAtmosphere = child.path;
        } else {
          kept.push(child.class);
        }
      }
      if (owned.length) {
        const removed = await op(ctx, { op: 'delete_instances', paths: owned });
        if (toolError(removed)) return removed;
        projectMutated = true;
      }
      const preset = MOODS[mood]!;
      const lighting = await op(ctx, {
        op: 'set_props',
        path: 'game.Lighting',
        props: typedPresetProps(preset.scriptable as unknown as Record<string, number | boolean | RGB>),
      });
      if (toolError(lighting)) return projectMutated
        ? { ...(lighting as Record<string, unknown>), projectMutated: true }
        : lighting;
      projectMutated = true;
      if (userAtmosphere) {
        const atmosphere = await op(ctx, {
          op: 'set_props',
          path: userAtmosphere,
          props: typedPresetProps(preset.atmosphere as unknown as Record<string, number | boolean | RGB>),
        });
        if (toolError(atmosphere)) return { ...(atmosphere as Record<string, unknown>), projectMutated: true };
      }
      const items = moodInstances(mood).filter((item) => !(userAtmosphere && item.className === 'Atmosphere'));
      const created = await op(ctx, { op: 'create_instances', items });
      if (toolError(created)) return { ...(created as Record<string, unknown>), projectMutated: true };
      // The overrides, after the preset. Each group is its own write; a group that fails is reported and the mood stands.
      const overridden: string[] = [];
      const overrideFailures: string[] = [];
      for (const [group, path] of [['lighting', 'game.Lighting'], ['atmosphere', userAtmosphere ?? 'game.Lighting.Atmosphere'], ['colorCorrection', 'game.Lighting.ColorCorrectionEffect']] as const) {
        const values = overrides.values[group];
        if (!values || !Object.keys(values).length) continue;
        const res = await op(ctx, { op: 'set_props', path, props: typedPresetProps(values) });
        if (toolError(res)) overrideFailures.push(`${group}: ${String((res as { error?: unknown }).error ?? 'failed').slice(0, 160)}`);
        else overridden.push(...Object.keys(values).map((k) => `${group}.${k}`));
      }

      // Hand back the palettes this mood was art-directed alongside. The lighting is half of a
      // look; the materials and colours are the other half, and the model has no other way to
      // learn which of them were designed to sit under this light.
      const palettes = Object.keys(PALETTES)
        .filter((name) => PALETTES[name]?.moods.includes(mood))
        .map((name) => ({ name, materials: PALETTES[name]!.materials }));
      const keptNote = kept.length
        ? `Left in place: ${kept.join(', ')} — the user put ${kept.length === 1 ? 'that' : 'those'} in Lighting, so ${kept.length === 1 ? 'it is' : 'they are'} still active and now combine with this mood. Tell them, and use remove_effect or ask before deleting ${kept.length === 1 ? 'it' : 'them'}.`
        : undefined;
      return {
        applied: mood,
        ...(overridden.length ? { overrides: overridden } : {}),
        ...(overrideFailures.length ? { overridesFailed: overrideFailures } : {}),
        // Only ever this mood's own previous instances; the user's are counted in `kept`.
        replacedOwn: owned.length || undefined,
        // Their Atmosphere was retuned rather than duplicated; say so, because its old values are gone.
        updatedAtmosphere: userAtmosphere ?? undefined,
        keptUserEffects: kept.length ? kept : undefined,
        note: keptNote,
        palettes: palettes.length ? palettes : undefined,
        next:
          'render_view to see it. If the scene reads flat or muddy, the mood is usually right and the MATERIALS are wrong — use one of the palettes above.' +
          (kept.length ? ' The scene also carries the effects listed above, which were not mine to remove.' : ''),
      };
    },
  },
  /**
   * AMBIENT EFFECTS — see effects.ts for why none of these reference an asset.
   *
   * The catalogue is rendered into the tool description rather than fetched by a separate
   * `list_effects` call: it is ~10 short lines, it is static, and a round trip to learn the names of
   * ten things is a round trip the user pays for.
   */
  add_effect: {
    def: {
      name: 'add_effect',
      description:
        'Attach an ambient effect to an instance (fire, smoke, embers, mist, ...). No assets or asset ids: pure, art-directed engine particles and light, so free and never stopped by a licence or safety gate. A built scene with nothing moving reads as a model, not a place. Re-applying an effect to the same instance retunes it instead of stacking a copy.\n\nCatalogue:\n' +
        effectCatalogue().map((e) => `${e.name} — ${e.summary} ${e.use}`).join('\n'),
      parameters: S(
        {
          effect: { type: 'string', enum: EFFECT_NAMES, description: 'Which preset to attach.' },
          path: { type: 'string', description: 'Full path of the instance to attach it to, e.g. game.Workspace.Forge.Coals' },
        },
        ['effect', 'path'],
      ),
    },
    studio: true,
    studioOps: ['get_tree', 'delete_instances', 'create_instances'],
    mutatesProject: true,
    run: async (ctx, a) => {
      let projectMutated = false;
      const effect = String(a.effect ?? '');
      const path = String(a.path ?? '');
      if (!Object.prototype.hasOwnProperty.call(EFFECTS, effect)) {
        return { error: `unknown effect "${effect}". Choose one of: ${EFFECT_NAMES.join(', ')}.` };
      }
      if (!path) return { error: 'path is required' };
      // Parsed, not pattern-matched. The old filter rejected every quote, which meant it rejected
      // game.Workspace["Camp Fire"].Logs — the exact form Paths.fullPath RETURNS for any name that
      // is not a bare identifier. Every instance with a space, a hyphen or a leading digit in its
      // name was unreachable here, and the error told the model its own path format was invalid.
      if (!parseInstancePath(path)) {
        return { error: `"${path}" is not an instance path. Use the form returned by other tools, such as game.Workspace.Lobby.Floor or game.Workspace["Camp Fire"].Logs.` };
      }

      const tree = await op(ctx, { op: 'get_tree', root: path, maxDepth: 1, maxNodes: 200 });
      if (toolError(tree)) return tree;
      const root = treeRoot(tree);
      if (!root) return { error: `Studio returned no tree for ${path}` };
      const previous = (root.children ?? [])
        .filter((child) => decodeTagged(child.attributes?.AppleEffect) === effect && typeof child.path === 'string')
        .map((child) => child.path as string);
      if (previous.length) {
        const removed = await op(ctx, { op: 'delete_instances', paths: previous });
        if (toolError(removed)) return removed;
        projectMutated = true;
      }
      const items = effectInstanceSpecs(effect, path);
      if (!items) return { error: `effect preset "${effect}" cannot be represented by the typed Studio protocol` };
      const created = await op(ctx, { op: 'create_instances', items });
      if (toolError(created)) return projectMutated
        ? { ...(created as Record<string, unknown>), projectMutated: true }
        : created;
      return { attached: effect, to: path, parts: EFFECTS[effect]!.parts.map((x) => x.className) };
    },
  },
  /**
   * THE ADVERSARIAL CRITIC, FINALLY REACHABLE — and honest about what it did not check.
   *
   * critic.ts has had zero importers in apps/worker since it was written. This is its first product
   * caller. No judge is passed, so every lens takes `runDeterministicLens` and the whole audit costs
   * ZERO neurons and makes zero model calls — asserted in the test, because a free check that
   * quietly starts charging is a different product.
   *
   * WHY IT REPORTS WHICH LENSES DID NOT RUN. `applyMetricRules` runs only the rules whose metric it
   * has, so a partial metric set produces a SHORT defect list rather than an error — and a short
   * defect list is indistinguishable from a clean build. gameplay_readability is measured entirely
   * from pixels, which this pass does not have, so it does not run at all; lighting runs PARTIAL,
   * because its configuration half is measurable here and its value-structure half is not. Both
   * facts are reported in the same breath as the verdict, and the rules skipped inside a lens that
   * did run come back on `unchecked` rather than vanishing. Silently omitting either would be the
   * exact failure critic.ts was built to make impossible.
   */
  audit_build: {
    def: {
      name: 'audit_build',
      description:
        'Audit what has been built against a panel of adversarial critics and get back CONFIRMED defects, each naming the metric it measured, that metric\'s value, and the threshold it violates — unanchored parts that will fall on server start, default-grey Plastic, single-material builds, coplanar faces that will z-fight, sub-perceptual parts, a silhouette that carries no information, an untouched Lighting rig. Costs nothing and calls no model. Run it after building and again after fixing. It judges GEOMETRY and lighting configuration; it does not look at the render, so it says nothing about how the result looks on screen. Imported library originals are left out: they are the original game\'s own design.',
      parameters: S({}),
    },
    studio: true,
    studioOps: ['get_tree'],
    run: async (ctx, a) => {
      const workspace = await op(ctx, { op: 'get_tree', root: 'game.Workspace', maxDepth: 12, maxNodes: 1200 }, 30_000);
      if (toolError(workspace)) return workspace;
      const lighting = await op(ctx, { op: 'get_tree', root: 'game.Lighting', maxDepth: 1, maxNodes: 200 });
      if (toolError(lighting)) return lighting;
      const capture = auditCaptureFromTree(workspace, lighting);
      if (!capture) return { error: 'the typed Studio tree returned something this worker could not read' };
      // What the audit's parts-only view could not see: terrain, lighting as numbers, and how the place is grouped.
      const scene = await measureScene(ctx, workspace, capture);
      // THE LAYOUT FLAGS (scene-flags.ts), from the two trees already read and the terrain measure above: identical models on a grid
      // or a mirror, objects outside their walls, an open flat map, near-black lighting. Facts with their numbers; no further read.
      const solidVoxels = scene.terrain && 'solidVoxels' in scene.terrain ? Number(scene.terrain.solidVoxels) : undefined;
      const layout = sceneFlags({ workspace, lighting, terrainSolidVoxels: Number.isFinite(solidVoxels) ? solidVoxels : undefined, request: String(a.intent ?? ctx.request ?? ctx.userRequest?.() ?? '') });
      // Bounded hard: this result is cut at MAX_RESULT_CHARS (3,000) and a cut-off result is not JSON, and the audit's own result is already
      // close. At most three flags, each reduced to its kind and its measurement (the first sentence, at most 190 characters); the
      // full text with its advice goes to the panel below and to check_composition-style reads. The measurement carries the numbers.
      const layoutLines = (layout?.flags ?? []).slice(0, 3).map((f) => {
        const first = f.text.split(/(?<=[.)])\s+(?=[A-Z])/)[0] ?? f.text;
        return `${f.severity} ${f.kind}: ${first.length > 190 ? `${first.slice(0, 189)}…` : first}`;
      });
      if (capture.parts.length === 0) {
        // Terrain is geometry: a map made of it is not "nothing to audit". The measurements are the answer.
        if (scene.terrain && 'solidVoxels' in scene.terrain && Number(scene.terrain.solidVoxels) > 0) {
          return { text: 'There are no parts to audit, but the place holds terrain (see scene). Nothing was judged.', confirmed: 0, blocking: 0, partsAudited: 0, scene };
        }
        return { error: 'there is no geometry in Workspace to audit yet — build something first' };
      }

      const metrics = auditMetrics(capture);
      const coverage = lensCoverage(metrics);
      const lenses = runnableLenses(metrics);
      const panel = await runCriticPanel(
        {
          intent: String(a.intent ?? 'the build as it stands'),
          subject: capture.parts.length > 60 ? 'scene' : 'prop',
          views: [], // no frame was rendered; every lens that needs one is excluded above
          metrics,
          lighting: capture.lighting,
        },
        { lenses, alwaysRunDeterministic: true },
      );

      const partial = coverage.filter((c) => c.status === 'partial');
      const notRun = coverage.filter((c) => c.status === 'none');
      const confirmed = panel.adjudication.confirmed;

      ctx.uiDetail = {
        v: 1,
        title: 'Build audit',
        blocks: [
          {
            type: 'callout',
            // "No confirmed defects" in a good tone is a CLEAN BILL. It must not be issued when
            // part of the panel never answered: a lens whose judge threw contributes nothing, and
            // nothing-contributed and nothing-found were previously the same sentence here.
            tone: confirmed.some((d) => d.severity === 'blocking')
              ? 'bad'
              : confirmed.length || panel.lensesIncomplete.length
                ? 'warn'
                : 'good',
            title: confirmed.length
              ? `${confirmed.length} confirmed defect(s)`
              : panel.lensesIncomplete.length
                ? `No confirmed defects, but ${panel.lensesIncomplete.length} lens(es) did not answer`
                : 'No confirmed defects',
            text:
              (capture.truncated
                // "run over 1500 parts" reads as complete. It is a sample, and the parts past the
                // cap are the ones added most recently — the likeliest place for a new defect.
                ? `${panel.lensesRun.length} of ${coverage.length} lenses run over the FIRST ${capture.parts.length} of ${capture.total} part(s) — this is a sample, not the whole place. ${panel.modelCalls} model call(s). `
                : `${panel.lensesRun.length} of ${coverage.length} lenses run over ${capture.parts.length} part(s), ${panel.modelCalls} model call(s). `) +
              (notRun.length ? `Not run: ${notRun.map((c) => c.lens).join(', ')} — every rule needs a render. ` : '') +
              (panel.lensesIncomplete.length
                ? `INCOMPLETE: ${panel.lensesIncomplete.length} lens(es) produced nothing — ${panel.lensesIncomplete.map((f) => `${f.lens} (${f.reason})`).join('; ')}. What follows is what the rest found, not a complete audit. `
                : '') +
              (panel.unchecked.length
                ? `${panel.unchecked.length} rule(s) inside the lenses that did run were skipped for want of a measurement: ${[...new Set(panel.unchecked.map((u) => u.metric))].join(', ')}.`
                : notRun.length ? '' : capture.truncated ? '' : 'Every rule in every lens was evaluated.'),
          },
          ...(layoutLines.length ? [{ type: 'callout', tone: layout!.flags.some((f) => f.severity === 'high') ? 'warn' : 'neutral', title: `${layoutLines.length} layout flag(s)`, text: (layout?.flags ?? []).map((f) => `${f.severity} ${f.kind}: ${f.text}`).join(' ') }] : []),
          ...(confirmed.length
            ? [{
                type: 'table',
                caption: 'Each defect cites the measurement that confirms it.',
                columns: ['Severity', 'Subject', 'Measured', 'Fix'],
                rows: confirmed.map((d) => [
                  d.severity,
                  d.subject,
                  d.claims[0] ?? '',
                  d.fixes[0] ?? '',
                ]),
              }]
            : []),
          {
            type: 'key_values',
            title: 'What was measured',
            items: Object.entries(metrics)
              .sort(([x], [y]) => x.localeCompare(y))
              .map(([k, v]) => ({ key: k, value: Number.isInteger(v) ? String(v) : v.toFixed(3) })),
          },
        ],
      };

      // Two different silences, reported as two different things: a lens that examined nothing, and
      // a rule inside a lens that did run. Collapsing them would let "5 lenses run" stand for a
      // lens that checked nothing at all.
      const noteParts: string[] = [];
      if (notRun.length) {
        noteParts.push(`NOT RUN (every rule needs a render): ${notRun.map((c) => c.lens).join(', ')}`);
      }
      if (panel.unchecked.length) {
        noteParts.push(
          `RULES SKIPPED for want of a measurement: ${panel.unchecked.map((u) => `${u.lens}/${u.subject} [${u.metric}]`).join('; ')}`,
        );
      }
      const note = noteParts.length ? `\n${noteParts.join('\n')}\nThose rules were not checked, so do not say they pass.` : '';
      return {
        text: formatPanelReport(panel) + note,
        confirmed: confirmed.length,
        blocking: confirmed.filter((d) => d.severity === 'blocking').length,
        lensesRun: panel.lensesRun,
        lensesNotRun: notRun.map((c) => c.lens),
        lensesPartial: partial.map((c) => ({ lens: c.lens, missing: c.missing, ran: c.partialBecause })),
        rulesUnchecked: panel.unchecked.length || undefined,
        partsAudited: capture.parts.length,
        truncated: capture.truncated || undefined,
        ...(layoutLines.length ? { layoutFlags: layoutLines } : {}),
        scene,
      };
    },
  },
  /**
   * ASSERTIONS AGAINST THE PROJECT'S OWN MODULES.
   *
   * `run_and_check` answers "did anything error in five seconds of server simulation". It cannot
   * answer "does the shop debit the right amount", "does the save round-trip", "does the cooldown
   * expire" — every failure where the code runs perfectly and does the wrong thing, which is most
   * of them. This runs real assertions and reports them per case.
   *
   * UNLIKE set_mood AND add_effect, THE CODE HERE IS MODEL-AUTHORED. Those two generate Luau from
   * tables in this repository, so nothing the model writes becomes code and the ingress filter is
   * belt-and-braces. A spec case body is the model's own Luau at exactly run_luau's trust level, so
   * the ASSEMBLED source goes through `refuseLuauIngress` before it is sent — a spec harness is a
   * fine place to hide `require(12345)`, and requiring project modules by path is the whole point of
   * the tool, so that rule is load-bearing rather than incidental here.
   *
   * This is the first producer of the `test_report` block. Its renderer, its validator, its
   * gates.ts consumer and the TestEvidence card have all existed since they were written with
   * nothing in the product emitting one — mock.ts was the only source.
   */
  run_spec: {
    def: {
      name: 'run_spec',
      description:
        'Run assertions against the modules this project actually contains, and get a per-case pass/fail report. Each case is { name, code }; the code runs as a function body, and a case PASSES by returning and FAILS by erroring — use assert(condition, message). Require project modules by path, e.g. require(game.ServerScriptService.Shop). Use this after building a system that has rules — economy, saving, cooldowns, access — because run_and_check only proves nothing errored, not that anything is correct. A case that ERRORS is caught on its own, so one failing assertion does not hide the rest — but every case is compiled together, so a case that does not PARSE takes the whole run with it and you get a compile error instead of a report. Costs nothing: no model calls, no images. LIMIT: this assertion harness runs in plugin/edit context rather than a Play Solo client, so there is no LocalPlayer here; assert against server and shared modules.',
      parameters: S(
        {
          cases: {
            type: 'array',
            description: `Up to ${SPEC_LIMITS.maxCases} cases, each { name, code }.`,
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'What this case proves, as a sentence.' },
                code: { type: 'string', description: 'Luau function body. assert(...) to fail it.' },
              },
              required: ['name', 'code'],
            },
          },
          title: { type: 'string', description: 'Optional name for the run, e.g. "Shop economy".' },
        },
        ['cases'],
      ),
    },
    studio: true,
    studioOps: ['run_code'],
    run: async (ctx, a) => {
      const refusal = refuseSpecCases(a.cases);
      if (refusal) return { error: refusal };
      const cases = (a.cases as SpecCase[]).map((c) => ({ name: String(c.name), code: String(c.code) }));

      // Model-authored code, admitted the same way run_luau's is: same ingress gate, and now the
      // same source-size and output ceilings, under the `roblox-spec` runtime whose ceilings are
      // the harness's rather than a single snippet's.
      const job = admitProgram({
        runtime: 'roblox-spec',
        backend: 'studio',
        source: specLuau(cases),
        ingress: refuseLuauIngress,
      });
      if (isRefusal(job)) return { error: job.error, ...(job.blocked ? { blocked: job.blocked } : {}) };

      const raw = await op(ctx, { op: 'run_code', code: job.source, timeoutMs: job.limits.wallMs }, studioWaitMs(job));
      if (raw && typeof raw === 'object' && 'error' in (raw as Record<string, unknown>)) return raw;

      const run = parseSpecRun(raw);
      if (!run) return { error: 'the spec harness returned something this worker could not read' };

      // A case whose body cannot even be compiled never reaches the harness's result table, so the
      // report would simply be shorter than the spec. Reporting "3 passed" for a four-case spec is
      // the same defect as a critic reporting a lens it never ran.
      const missing = missingCases(cases, run);
      const allCases = [
        ...run.cases,
        ...missing.map((name) => ({
          name,
          status: 'fail' as const,
          message: 'this case did not run — the harness never reached it, usually a syntax error in its body',
        })),
      ];
      const failed = run.failed + missing.length;

      ctx.uiDetail = {
        v: 1,
        blocks: [
          {
            type: 'test_report',
            title: typeof a.title === 'string' && a.title.trim() ? a.title.trim().slice(0, 48) : 'Spec run',
            passed: run.passed,
            failed,
            skipped: run.skipped,
            cases: allCases.map((c) => ({
              name: c.name,
              status: c.status,
              ...(c.message ? { message: c.message } : {}),
              ...(Number.isFinite((c as { durationMs?: number }).durationMs)
                ? { durationMs: (c as { durationMs?: number }).durationMs }
                : {}),
            })),
          },
        ],
      };

      return {
        passed: run.passed,
        failed,
        text: allCases
          .map((c) => `${c.status === 'pass' ? 'PASS' : 'FAIL'}  ${c.name}${c.message ? ` — ${c.message}` : ''}`)
          .join('\n'),
        ...(missing.length ? { didNotRun: missing } : {}),
      };
    },
  },
  /**
   * INSTALL A VETTED MODULE instead of writing it again.
   *
   * The roadmap briefs now say what correct looks like for saving, for remote validation and for
   * receipts. A brief is an instruction, and an instruction is re-followed from scratch on every
   * project with a fresh chance to drop one clause — and the clause that gets dropped is always the
   * one whose absence is silent. These are the same rules as code, written once, compiled in CI.
   *
   * Rides `edit_script`, which already creates a ModuleScript when given `create`. The source comes
   * from a table in this repository, never from the model, so nothing here is model-authored Luau.
   */
  install_module: {
    def: {
      name: 'install_module',
      description:
        'Install a vetted, self-contained ModuleScript for a system whose failures are silent and expensive; prefer it to writing your own (each encodes Roblox behaviour easy to get subtly wrong). Over an existing script that differs it is REFUSED unless replace: true, since re-installing destroys the user\'s changes.\n\n' +
        prefabCatalogue()
          // What each one prevents comes back in its install result, where it is read when it matters, not on every step.
          .map((p) => `${p.id} — ${p.summary}`)
          .join('\n'),
      parameters: S(
        {
          module: { type: 'string', enum: PREFAB_IDS, description: 'Which module to install.' },
          parent: { type: 'string', description: 'Where to put it. Defaults to the module\'s own recommended parent.' },
          replace: {
            type: 'boolean',
            description: 'Overwrite a script already at that path whose contents differ. Only when the user asked for it — their edits are lost.',
          },
        },
        ['module'],
      ),
    },
    studio: true,
    studioOps: ['read_script', 'edit_script'],
    mutatesProject: (result) => !!result && typeof result === 'object' && typeof (result as Record<string, unknown>).installed === 'string',
    run: async (ctx, a) => {
      const id = String(a.module ?? '');
      const prefab = PREFABS[id];
      if (!prefab) return { error: `unknown module "${id}". Choose one of: ${PREFAB_IDS.join(', ')}.` };
      if (id === 'ui_kit') {
        return { error: 'Refused (D-UIONLY-1): ui_kit (AppleUI) draws its screens by hand. Insert them from the UI library with insert_ui_component({"component":"shop_window","genre":"<game genre>"}) (currency_counter, notification_toast, quest_list, ...), then wire them in a LocalScript by path. Nothing was written.' };
      }

      const parent = String(a.parent ?? '').trim() || prefab.defaultParent;
      // The parent is concatenated into an instance path. A quote, backslash, newline or control
      // character is not a path, and refusing is cheaper than reasoning about what would happen.
      if (!/^[A-Za-z0-9_.]+$/.test(parent)) {
        return { error: `"${parent}" is not a valid instance path — use dotted names such as game.ServerScriptService` };
      }

      const path = `${parent}.${prefab.moduleName}`;

      // READ BEFORE WRITING. `edit_script` with a `source` REPLACES the script, so installing over
      // an existing one is destructive — and this tool is the kind a model calls again when it is
      // unsure, which is exactly when the user has already edited what is there.
      //
      // NOT EVERY FAILED READ MEANS THERE IS NOTHING THERE. Treating any error as "safe to create"
      // turned this guard into the overwrite it exists to prevent: a plugin that timed out, a
      // Studio that disconnected mid-call, or a path that resolves to a Folder all produce an
      // error, and all of them would have been read as absence and then written over. Only the
      // resolver's own not-found is absence; anything else is a failure to observe, and a failure
      // to observe must not be rendered as an observation.
      const existing = await op(ctx, { op: 'read_script', path });
      const readError = existing && typeof existing === 'object' && 'error' in (existing as Record<string, unknown>)
        ? String((existing as { error: unknown }).error)
        : null;
      const absent = readError !== null && /\bnot found\b/i.test(readError);
      if (readError !== null && !absent) {
        return {
          error:
            `could not check ${path} before installing: ${readError}. Nothing was written. ` +
            `If a script is already there, installing would replace it, so this stops rather than guessing.`,
        };
      }
      const found = readError === null;
      let currentSource: string | undefined;
      if (found) {
        currentSource = String((existing as { source?: unknown }).source ?? '');
        // Identical is a no-op, not a refusal: re-asking for a module already installed should be
        // boring rather than an error the model has to reason about.
        if (currentSource === prefab.source) {
          return {
            alreadyInstalled: prefab.moduleName,
            at: path,
            api: prefab.api,
            needs: prefab.needs?.length ? prefab.needs : undefined,
            note: 'unchanged — this is the same module, already present',
          };
        }
        if (a.replace !== true) {
          return {
            error:
              `${path} already exists and differs from the module. It may be an older version, or the user may have edited it. ` +
              `Read it first; pass replace: true only if overwriting their file is what was asked for.`,
          };
        }
      }

      // The plugin distinguishes creating a missing script from editing one already observed.
      // `create` is only valid in the first branch; an existing replacement must carry the hash
      // read above so ScriptEditorService can reject a concurrent Studio edit instead of replacing
      // it blindly. Reaching this point with `found` means `replace: true` was explicit, because
      // the differing existing-script branch above refuses without it.
      const prefabRule = refuseGameScript(luauScanVariants(prefab.source));
      if (prefabRule) return prefabRule;
      const edit: StudioOp = found
        ? { op: 'edit_script', path, source: prefab.source, baseHash: sourceHash(currentSource ?? '') }
        : { op: 'edit_script', path, source: prefab.source, create: { className: prefab.className, parent } };
      const res = await op(ctx, edit);
      if (res && typeof res === 'object' && 'error' in (res as Record<string, unknown>)) return res;

      return {
        installed: prefab.moduleName,
        at: path,
        replaced: found || undefined,
        api: prefab.api,
        prevents: prefab.prevents,
        // Wiring, not imports. A module installed without the one it is handed functions from
        // loads, configures and silently does nothing, which is the worst way for this to fail.
        needs: prefab.needs?.length ? prefab.needs : undefined,
        next:
          `require(${path}) from a Script in ServerScriptService. Read it before changing it — the comments say which lines are load-bearing.` +
          (prefab.needs?.length
            ? ` It has to be wired to ${prefab.needs.map((n) => PREFABS[n]?.moduleName ?? n).join(' and ')} — see its configure line in the API above, and install ${prefab.needs.length > 1 ? 'those' : 'that'} first if not already present.`
            : ''),
      };
    },
  },
  /**
   * READ HOW IT HAS ALREADY BEEN BUILT, THEN BUILD IT.
   *
   * The owner's rule is "never build from scratch — find what communities have already assembled".
   * The harvest that answers it is 3,017 GitHub repositories, and its own first page holds a Rust
   * CSV tool, a Lua formatter and a Bee Swarm Simulator macro. A search result is not a library, so
   * nothing here searches it: `mechanic-citations.ts` is the 131 rows that survived a curator which
   * read each repository's file TREE, and the exclusions are named rules rather than a low rank.
   *
   * WHAT COMES BACK IS THE PATTERN, NOT THE CODE. The mechanic, where its authority has to live,
   * the calls that are current, the specific ways it breaks — then the repositories that
   * demonstrably implement it, each with its author and its licence. StudPilot vendors nothing: six of
   * the surviving repositories are GPL and one is AGPL, and a customer's game must never carry
   * someone else's licence. The citation is there to be read, and the licence travels with it so
   * the agent cannot forget which one it is reading.
   */
  find_mechanic: {
    def: {
      name: 'find_mechanic',
      description:
        'Before writing a game system from scratch, ask here. Give the mechanic in the builder\'s own words — "a shop that sells pets for coins", "save progress between sessions", "a round-based lobby" — and get back what the pattern IS: where authority has to live, the Roblox calls that are current, the specific ways it breaks, and real repositories that implement it with their author and licence. READ those to understand the approach and then write the mechanic for THIS game; never copy their code. Known mechanics: '
        + MECHANIC_MENU,
      parameters: S(
        {
          mechanic: {
            type: 'string',
            description: 'What the user asked for, in their words. Several mechanics in one sentence is fine — each is answered.',
          },
          limit: { type: 'number', description: 'Implementations to cite per mechanic, default 4.' },
        },
        ['mechanic'],
      ),
    },
    studio: false,
    run: async (_ctx, a) => {
      const query = String(a.mechanic ?? '').trim();
      if (!query) return { error: `say which mechanic. One of: ${MECHANIC_MENU}` };
      const limit = Math.max(1, Math.min(8, Number(a.limit ?? 4) || 4));
      const ranked = rankMechanics(query);
      // NO MATCH IS AN ANSWER WITH A MENU ATTACHED. An empty list reads as "there is nothing
      // written about this", which is a claim about Roblox rather than about a lookup table, and
      // the agent's next move after it is to invent one unaided.
      if (!ranked.length) {
        return {
          noMatch: `"${query}" does not name a mechanic this library has a pattern for. That is a gap in the library, not a statement about the game — write it from the Roblox documentation, and prefer a mechanic below if one is close.`,
          known: MECHANIC_PATTERNS.map((p) => ({ id: p.id, is: p.label })),
          searchedRepositories: MECHANIC_CITATIONS.length,
        };
      }
      return { mechanics: ranked.slice(0, 3).map((r) => answerFor(r.pattern, limit)) };
    },
  },
  /**
   * The other half of add_effect.
   *
   * Shipping the add without the remove leaves "take the fire off" with no path, and the agent's
   * only alternative is hand-written deletion Luau against a place it is guessing at. It removes
   * only instances carrying the `AppleEffect` attribute this module writes, so it can never take
   * away a ParticleEmitter the user placed themselves.
   */
  remove_effect: {
    def: {
      name: 'remove_effect',
      description:
        "Take an ambient effect back off an instance. Removes only effects that add_effect placed there — anything the user built themselves is untouched. Omit `effect` to remove every effect on that instance, or name one to remove just that preset. Use this when the user asks for less, rather than rebuilding the object.",
      parameters: S(
        {
          path: { type: 'string', description: 'Full path of the instance to clear.' },
          effect: { type: 'string', enum: EFFECT_NAMES, description: 'Which preset to remove. Omit for all of them.' },
        },
        ['path'],
      ),
    },
    studio: true,
    studioOps: ['get_tree', 'delete_instances'],
    mutatesProject: (result) => positiveCount(result, 'removed'),
    run: async (ctx, a) => {
      const path = String(a.path ?? '');
      if (!path) return { error: 'path is required' };
      // Parsed, not pattern-matched. The old filter rejected every quote, which meant it rejected
      // game.Workspace["Camp Fire"].Logs — the exact form Paths.fullPath RETURNS for any name that
      // is not a bare identifier. Every instance with a space, a hyphen or a leading digit in its
      // name was unreachable here, and the error told the model its own path format was invalid.
      if (!parseInstancePath(path)) {
        return { error: `"${path}" is not an instance path. Use the form returned by other tools, such as game.Workspace.Lobby.Floor or game.Workspace["Camp Fire"].Logs.` };
      }

      const effect = a.effect === undefined || a.effect === null ? null : String(a.effect);
      if (effect !== null && !Object.prototype.hasOwnProperty.call(EFFECTS, effect)) {
        return { error: `unknown effect "${effect}". Choose one of: ${EFFECT_NAMES.join(', ')}, or omit it to remove all.` };
      }

      const tree = await op(ctx, { op: 'get_tree', root: path, maxDepth: 1, maxNodes: 200 });
      if (toolError(tree)) return tree;
      const root = treeRoot(tree);
      if (!root) return { error: `Studio returned no tree for ${path}` };
      const matched = (root.children ?? []).filter((child) => {
        const mark = decodeTagged(child.attributes?.AppleEffect);
        return typeof child.path === 'string' && typeof mark === 'string' && (effect === null || mark === effect);
      });
      const names = [...new Set(matched.map((child) => String(decodeTagged(child.attributes?.AppleEffect))))];
      if (matched.length === 0) {
        return { removed: 0, note: effect ? `there was no ${effect} on ${path}` : `there were no effects on ${path}` };
      }
      const removed = await op(ctx, { op: 'delete_instances', paths: matched.map((child) => child.path as string) });
      if (toolError(removed)) return removed;
      return { removed: matched.length, from: path, effects: names };
    },
  },
  check_composition: {
    def: {
      name: 'check_composition',
      description:
        'Check your BLOCKOUT before adding any detail: whether you are building the thing that was actually requested, and whether the macro composition works. Costs no model call: it reads the renderer\'s typed layout summary and performs arithmetic only. If it fails, adding parts cannot fix it; change the layout and check again.',
      parameters: S({
        target: { type: 'string', description: 'instance path to check, e.g. game.Workspace.Plaza. Omit for the whole workspace.' },
        subject: { type: 'string', enum: ['scene', 'prop'], description: 'a prop has no landmark tier; defaults to scene' },
        intent: { type: 'string', description: "the user's request in their own words — used to check you are building the right KIND of thing" },
      }),
    },
    studio: true,
    studioOps: ['render_view'],
    run: async (ctx, a) => {
      // One minimum-size bounded software frame carries the typed layout summary. The pixels are not
      // sent to a model; only the arithmetic layout rows below are consumed.
      const raw = await op(ctx, {
        op: 'render_view',
        target: a.target ? String(a.target) : undefined,
        view: 'hero',
        width: 48,
        height: 32,
      }, 30_000);
      if (toolError(raw)) return { error: `could not read the scene: ${String(raw.error)}` };
      const parts = (raw as RenderViewResult).layout?.parts;
      const structure = structureFromLayout(parts ?? undefined);
      if (!structure) return { error: 'no geometry to judge — build the blockout first' };
      const subject = a.subject === 'prop' ? 'prop' : 'scene';
      // SEMANTIC FIRST. Composition asks "is this well arranged"; semantics asks "is this the thing
      // that was asked for". The cottage built for a tavern-interior brief had a real vertical
      // hierarchy and was still completely wrong, so the second question has to be answered first —
      // and answered before any detail is paid for.
      const semantic = a.intent ? semanticCheck(String(a.intent), parts ?? undefined) : null;
      const failures = [...(semantic?.failures ?? []), ...compositionHardFails(structure, [], subject)];
      return {
        structure: structureLine(structure),
        ...(semantic ? { intentMatch: semanticLine(semantic) } : {}),
        passed: failures.length === 0,
        failures,
        guidance: semantic?.failures.length
          ? 'STOP. You are not building the thing that was requested. Do not add detail and do not correct this in place — the layout itself is the wrong shape. Clear what you built and lay out the right kind of space.'
          : failures.length
            ? 'These are structural. More parts, more materials and more props will not move any of them — that was measured. Change the LAYOUT: give one element clear dominance in height and mass and let everything else step down beneath it.'
            : 'Blockout is sound and it is the right kind of thing. Build detail on top of it.',
      };
    },
  },
  choose_asset_source: {
    def: {
      name: 'choose_asset_source',
      description:
        'Where should this piece of the scene come from? Returns an ordered list of sources with rationale and the verification gate each requires. Call this BEFORE building anything you might be tempted to search for. Procedural wins almost everywhere; foliage and characters are the exceptions.',
      parameters: S(
        { need: { type: 'string', enum: ['ground', 'building', 'prop', 'foliage', 'character', 'vehicle', 'ui_icon', 'texture', 'particle', 'sfx', 'lighting'] } },
        ['need'],
      ),
    },
    studio: false,
    run: async (ctx, a) => {
      const need = String(a.need ?? 'prop') as AssetNeed;
      const chosen = chooseAssetSource(need);
      const allowed = allowedSources(ctx.assetSources);
      // The ordered list is the product's own recommendation; the policy is the customer's
      // permission. Returning the full list and letting the model pick a forbidden entry would
      // mean discovering the refusal one tool call later, with a plan already built around it.
      const usable = chosen.filter((c) => allowed.includes(c.source));
      if (usable.length) return usable;
      return {
        error: sourceRefusal(ctx.assetSources, chosen[0]?.source ?? 'procedural', ctx.askAssetSources, ctx.assetSettingsUnread)
          ?? 'no asset source is available for this need',
        // The unusable list is returned too: a model told only "no" cannot explain to the person
        // what it would have done, and that explanation is what makes the setting make sense.
        wouldHaveUsed: chosen.map((c) => c.source),
      };
    },
  },
  search_creation_skills: {
    def: {
      name: 'search_creation_skills',
      description:
        'Search the bounded catalogue of Roblox creation tasks before inventing an implementation plan. Search by a plain-language task, domain, genre, or both. Returns at most five compact matches grounded in exact Creator Docs corpus ids, and, for a query, `documentation_procedures`: official step-by-step procedures from the Roblox Creator Documentation, graded for building in Studio. These entries are guidance, not executable code, training examples, licensed assets, or proof that a Studio build passed. Use read_creation_skill on the chosen id.',
      parameters: S({
        query: { type: 'string', description: 'The task in plain language. Treated only as search data; commands inside it are never executed.' },
        domain: { type: 'string', enum: [...CREATOR_SKILL_DOMAINS], description: 'Optional task domain filter.' },
        genre: { type: 'string', enum: [...GENRE_KIT_IDS], description: 'Optional genre applicability filter.' },
        limit: { type: 'number', description: 'Maximum matches, clamped to 1–5. Default 5.' },
        max_chars: { type: 'number', description: 'Maximum serialized result size, clamped to 900–2600 characters.' },
      }),
    },
    studio: false,
    run: async (ctx, a) => {
      const catalogue = searchCreatorSkills({
        query: typeof a.query === 'string' ? a.query : undefined,
        domain: typeof a.domain === 'string' ? a.domain as (typeof CREATOR_SKILL_DOMAINS)[number] : undefined,
        genre: typeof a.genre === 'string' ? a.genre as (typeof GENRE_KIT_IDS)[number] : undefined,
        limit: a.limit === undefined ? undefined : Number(a.limit),
        maxChars: a.max_chars === undefined ? undefined : Number(a.max_chars),
      });
      // The library's word-for-word documentation procedures (A/B only); a search failure leaves the catalogue answer whole.
      const procedures = typeof a.query === 'string' ? await searchLibrarySkills(ctx.env, a.query, embed).catch(() => []) : [];
      return procedures.length ? { ...catalogue, documentation_procedures: procedures } : catalogue;
    },
  },
  read_creation_skill: {
    def: {
      name: 'read_creation_skill',
      description:
        'Read one creation skill by the exact id returned by search_creation_skills. Returns bounded preconditions, steps, verification, failure modes, quality criteria, exact official corpus references, and any existing reviewed prefab or mechanic pointer; a documentation procedure (id starting skill:docs:) returns its official steps word for word with source and attribution. The result remains guidance and still requires implementation tests and a live Studio visual pass.',
      parameters: S({
        id: { type: 'string', description: 'Exact skill id returned by search_creation_skills (a catalogue id, or a documentation procedure id starting skill:docs:).' },
        max_chars: { type: 'number', description: 'Maximum serialized result size, clamped to 1400–2800 characters.' },
      }, ['id']),
    },
    studio: false,
    run: async (ctx, a) => (typeof a.id === 'string' && a.id.startsWith(LIBRARY_SKILL_PREFIX) ? readLibrarySkill(ctx.env, a.id) : readCreatorSkill(a.id, a.max_chars)),
  },
  get_genre_references: {
    def: {
      name: 'get_genre_references',
      description:
        'Read inspected visual references and authored implementation guidance for a Roblox genre and optional aspect. Returns source URLs, scoped observations, official documentation, coverage gaps and explicit omission counts. Reference-only: these are not reusable assets, training examples or evidence that the generated game has passed visual review. Works without Studio and makes no network requests.',
      //[[ `genre` IS A FREE STRING, DELIBERATELY, AND IT USED TO BE AN ENUM OF TEN.
      //
      //   The catalogue covers ten genres. A customer wanting a fishing game, a pet sim or a
      //   bedwars clone met a parameter that forbade the word — so the model could not ask, got no
      //   answer, and therefore had no signal that nobody had ever looked at that kind of game.
      //   What a model does with no signal is proceed as though it knew.
      //
      //   Now the question can be asked and the answer is a fact: not covered, here is what the
      //   catalogue has, here is a near one ONLY if your own words named it, and here is a sentence
      //   to say out loud so the customer knows the look is the model's judgement rather than
      //   something taken from a game that shipped. The enum lives in the description, where it
      //   guides without forbidding. ]]
      parameters: S({
        genre: { type: 'string', description: `Covered: ${GENRE_KIT_IDS.join(', ')}. Any other genre is allowed and answers with what is NOT known about it.` },
        aspect: { type: 'string', enum: [...GENRE_REFERENCE_GUIDE_ASPECT_IDS] },
      }, ['genre']),
    },
    studio: false,
    run: async (_ctx, a) => {
      if ((a.genre !== undefined && typeof a.genre !== 'string')
          || (a.aspect !== undefined && typeof a.aspect !== 'string')) {
        return { error: 'genre and aspect must be canonical string identifiers' };
      }
      return getGenreReferenceGuide({ genre: a.genre, aspect: a.aspect, maxChars: 2700 });
    },
  },
  //[[ WHAT AN INTERFACE IS SHAPED LIKE, as opposed to what colour it is.
  //
  //   ui-references/README.md records why this is a separate question: the simulator theme already
  //   had the right PALETTE — saturated blue panel, near-white cards, green accent — and rendering
  //   it in Studio still did not look like the references. The palette was never the gap. The gap
  //   was construction: no thick dark stroke, no banner overhanging the panel, flat buttons with no
  //   bevel, a close button that was a small square instead of a red circle hanging off the corner.
  //
  //   get_genre_kit answers colour and content. This answers shape, and the two are not
  //   substitutes: getting one right and the other wrong produces exactly the near-miss that sent
  //   the reference library into existence.
  //
  //   It covers SCREENS as well as genres, because a shop is built the same way whether the game is
  //   a tycoon or a pet simulator, and the model needs the screen answer far more often than the
  //   genre one. ]]
  get_ui_construction: {
    def: {
      name: 'get_ui_construction',
      description:
        'How a Roblox interface is BUILT — stroke weights, corner radii, how a header overhangs its panel, how many tiles a grid runs, what replaces a price when an item is owned. Read off interfaces that actually shipped, not invented. Ask by screen type ('
        + UI_CONSTRUCTION_SCREEN_IDS.join(', ')
        + ') or by genre ('
        + UI_CONSTRUCTION_GENRE_IDS.join(', ')
        + '). Call this before building ANY interface: get_genre_kit gives you the colours, this gives you the shape, and a design with the right palette and the wrong construction is the exact near-miss this library exists to stop. An id nobody has inspected answers so out loud rather than returning nothing.',
      parameters: S({
        id: { type: 'string', description: 'A screen type such as "shop" or "inventory", or a genre such as "tycoon". Bare screen names resolve: "shop" finds "screen-shop".' },
      }, ['id']),
    },
    studio: false,
    run: async (_ctx, a) => {
      if (typeof a.id !== 'string') return { error: 'id must be a string naming a screen type or a genre' };
      // The cap is handed down rather than guessed: every one of the 29 entries used to leave this
      // call larger than MAX_RESULT_CHARS and be cut mid-JSON by the slicer below.
      return getUIConstruction({ id: a.id, totalChars: MAX_RESULT_CHARS });
    },
  },
  //[[ THE LOGIC WE HAVE WATCHED PASS, instead of the logic the model re-derives.
  //
  //   eval-v4 measured game logic at 0/8 for the trained model and 0/8 for its base. The failures
  //   are near-misses, which is what makes them dangerous: the house style is perfect and the
  //   arithmetic is wrong. `honest-percent` came back multiplying by 99 instead of 100. A customer
  //   cannot see that, the build succeeds, and the number is quietly wrong forever.
  //
  //   These eighty modules were authored here and each is RUN against its own exhaustive checks at
  //   build time by scripts/build-verified-modules.mjs; one that fails is absent rather than
  //   shipped. So this tool is the difference between code somebody reviewed and code somebody
  //   watched pass.
  //
  //   Two-step on purpose: describe the NEED and get a shortlist, then ask for the ID and get the
  //   source. Returning source on a fuzzy match would hand over a plausible wrong module, and a
  //   plausible wrong module is worse than none — nothing downstream checks it. ]]
  library_code: {
    def: {
      name: 'library_code',
      description:
        'The StudPilot Library\'s open-source Luau packages (data saving, signals, promises, cleanup, networking, zones, springs, state machines, pathfinding, ECS): each audited for safety and graded by two reviewers; only A/B, standalone ones are offered. '
        + '`need` (plain words) returns a shortlist; `id` installs that package with its dependencies under game.ReplicatedStorage.Packages, licence notice kept, and says how to require it. A package marked only_when is for that feature only. Installing never overwrites: a package already there is left as it is.',
      parameters: S({
        need: { type: 'string', description: 'What the code must do, in plain words. Returns a shortlist.' },
        id: { type: 'string', description: 'A package id from a shortlist. Installs it.' },
        limit: { type: 'number', description: 'Shortlist size, 1 to 15 (default 8).' },
      }, []),
    },
    studio: true,
    studioOps: ['get_instance', 'read_script', 'edit_script', 'create_instances'],
    mutatesProject: (result) => !!result && typeof result === 'object' && Array.isArray((result as Record<string, unknown>).installed) && ((result as { installed: unknown[] }).installed.length > 0),
    run: async (ctx, a) => {
      if (a.id === undefined) {
        if (typeof a.need !== 'string' || !a.need.trim()) return { error: 'pass need (plain words) for a shortlist, or id to install one' };
        return searchLibraryCode(ctx.env, a.need, embed, Number(a.limit ?? 8));
      }
      if (typeof a.id !== 'string') return { error: 'id must be a string' };
      const plan = await insertPlan(ctx.env, a.id);
      if ('error' in plan) return { error: `Nothing installed: ${plan.error}` };
      const root = 'game.ReplicatedStorage.Packages';
      const holder = await op(ctx, { op: 'get_instance', path: root });
      const holderError = holder && typeof holder === 'object' && 'error' in (holder as Record<string, unknown>) ? String((holder as { error: unknown }).error) : null;
      if (holderError !== null) {
        if (!/\bnot found\b/i.test(holderError)) return { error: `Nothing installed: could not read ${root} (${holderError})` };
        const made = await op(ctx, { op: 'create_instances', items: [{ className: 'Folder', name: 'Packages', parent: 'game.ReplicatedStorage' }] });
        if (made && typeof made === 'object' && 'error' in (made as Record<string, unknown>)) return { error: `Nothing installed: could not create ${root} (${String((made as { error: unknown }).error)})` };
      }
      const installed: string[] = [], present: string[] = [];
      let use = '';
      for (const b of plan.bundles) {
        const name = b.id === a.id ? b.name : aliasFor(plan.bundles, b.id, b.name);
        const path = `${root}.${name}`;
        const existing = await op(ctx, { op: 'read_script', path });
        const readError = existing && typeof existing === 'object' && 'error' in (existing as Record<string, unknown>) ? String((existing as { error: unknown }).error) : null;
        if (b.id === a.id) use = `local ${name.replace(/[^A-Za-z0-9_]/g, '')} = require(game.ReplicatedStorage.Packages.${name})`;
        if (readError === null) { present.push(name); continue; }
        if (!/\bnot found\b/i.test(readError)) return { error: `Stopped before ${name}: could not read ${path} (${readError})`, installed };
        let ops;
        try { ops = treeOps({ ...b.tree, name }, root, header(b)); } catch (e) { return { error: `Stopped before ${name}: ${(e as Error).message}`, installed }; }
        for (const o of ops) {
          const res = await op(ctx, o as never);
          if (res && typeof res === 'object' && 'error' in (res as Record<string, unknown>)) return { error: `Stopped inside ${name}: ${String((res as { error: unknown }).error)}`, installed };
        }
        installed.push(name);
      }
      const a0 = audit(plan.bundles[plan.bundles.length - 1]!.row);
      return { installed, ...(present.length ? { already_present: present } : {}), use, ...(a0.note ? { only_when: a0.note } : {}), note: 'The licence notice is at the top of each package; keep it.' };
    },
  },
  get_verified_module: {
    def: {
      name: 'get_verified_module',
      description:
        'Reviewed-and-EXECUTED Luau for the logic that is easy to get subtly wrong — cooldowns, currency, percentages, leaderboards, inventory limits, round transitions, XP curves, checkpoints. '
        + VERIFIED_MODULE_COUNT
        + ' modules, each run against its own exhaustive checks at build time; one that fails is not shipped. Describe what the logic must do in `need` to get a shortlist, then call again with `id` to get the source. USE THIS BEFORE WRITING GAME LOGIC BY HAND: the model measurably writes the right shape with the wrong arithmetic, and a wrong constant here is invisible to the customer and permanent in their game.',
      parameters: S({
        need: { type: 'string', description: 'What the logic must do, in plain words. Returns a shortlist of ids.' },
        id: { type: 'string', description: 'A module id from a shortlist. Returns its source.' },
      }, []),
    },
    studio: false,
    run: async (_ctx, a) => {
      if (a.id !== undefined && typeof a.id !== 'string') return { error: 'id must be a string' };
      if (a.need !== undefined && typeof a.need !== 'string') return { error: 'need must be a string' };
      return askVerifiedModule({ id: a.id, need: a.need });
    },
  },
  get_genre_kit: {
    def: {
      name: 'get_genre_kit',
      description:
        'Ask for any supported game genre and get its matched palette, lighting, UI/VFX/prop briefs and verified public sound ids. Call this before a genre build, then find rights-verified Roblox-specific assets for detailed objects and UI. Only simple structure may be built from primitive parts; do not generate complex replacements.',
      parameters: S({ genre: { type: 'string', enum: [...AVAILABLE_KIT_IDS] } }, ['genre']),
    },
    studio: false,
    run: async (ctx, a) => {
      const kit = getGenreKit(String(a.genre ?? ''));
      if (!kit) {
        // Naming the ten is the whole answer: a model told only "unknown genre" guesses again, and
        // the second guess is no better informed than the first.
        return { error: `there is no "${String(a.genre)}" kit. The available kits are: ${AVAILABLE_KIT_IDS.join(', ')}.` };
      }
      const skillProfile = getGenreSkillProfile(kit.id);

      // THE GATE RUNS ON THE WAY OUT, not only in the test. A pin that stopped being admissible —
      // because the licence table changed, not because this file did — must not reach a customer's
      // place just because it was correct when it was written.
      const admitted: { assetId: number; name: string; role: string; use: string }[] = [];
      const refused: { id: string; why: string }[] = [];
      for (const p of kit.pinned) {
        const verdict = admitToKit(p);
        if (!verdict.admitted) { refused.push({ id: p.id, why: verdict.why }); continue; }
        admitted.push({
          assetId: p.robloxAssetId,
          name: p.name,
          role: p.role,
          // Never insert_asset: an Audio id has no geometry, and insert_asset refuses typeId 3.
          use: `AudioPlayer.AssetId = "rbxassetid://${p.robloxAssetId}"`,
        });
      }

      // These ids are already public Creator Store assets, and they are REFERENCED by id rather
      // than inserted, so they are not added to discoveredAssetIds: nothing here has been through
      // insert_asset's gate, and marking them discovered would claim it had.
      return {
        genre: kit.id,
        pitch: kit.pitch,
        visualReferences: { tool: 'get_genre_references', genre: kit.id, use: 'reference_only' },
        // Put the creation profile before the larger palette/library payload. runTool caps model
        // context at 3,000 characters, and the task guidance must survive that cap even when a kit
        // has a long curated asset description.
        ...(skillProfile ? {
          creationSkills: {
            featuredSkillIds: skillProfile.skillIds.slice(0, 8),
            qualityCriteria: skillProfile.qualityCriteria,
            assetDirection: skillProfile.assetDirection,
            guidanceStatus: skillProfile.guidanceStatus,
            studioVisualPass: skillProfile.studioVisualPass,
            readWith: 'read_creation_skill',
          },
        } : {}),
        palette: kit.palette,
        lighting: kit.lighting,
        buildTheseYourself: ['Only plain structure such as ground, floors, paths, walls, platforms and zones. Retrieve detailed models, UI and effects from verified Roblox-specific libraries.'],
        // THE KEY USED TO BE `searchTheLibraryFor`, AND THERE IS NO LIBRARY TO SEARCH.
        // It named a tool that no longer exists, so the model was being handed five queries and
        // no way to run them. The briefs themselves were never the library's — the `why` is the
        // art direction — so each one now says how to MAKE the thing instead, which is the honest
        // answer and the one that ends with an asset the customer owns.
        makeThese: kit.slots.map((s) => ({
          need: s.need,
          subject: s.query,
          styleTags: s.tags,
          howMany: s.count,
          why: s.why,
          how:
            s.need === 'sfx'
              ? 'use the ids under `sounds` — do not search for audio, they are already chosen for this genre'
              : s.need === 'ui_icon'
                ? 'find the matching Roblox UI library component, then insert_ui_component; never draw it yourself'
                : s.need === 'particle'
                  ? 'find_vfx for a verified preset, then insert_vfx; never hand-build particle effects'
                  : s.need === 'texture'
                    ? 'use a rights-verified Roblox-specific library or Creator Store texture; do not invent an asset id'
                    : 'find_library_model with the subject as a plain noun, then insert_library_model; Parts only after the library had nothing (asset order)',
        })),
        sounds: admitted,
        // Present even when empty is wrong — an empty key reads as "we checked and all were fine",
        // which is true here only because the loop above actually ran. It is included ONLY when
        // something was refused, so its presence is always a real event.
        ...(refused.length ? { soundsRefusedOnLicence: refused } : {}),
      };
    },
  },
  find_verified_asset: {
    def: {
      name: 'find_verified_asset',
      description:
        'Search the Roblox Creator Store and return only ids that passed full verification (free, publicly visible, ZERO scripts, Mesh/Image only — never a Model, trusted creator, inside the triangle budget). For a ready-made prop, building or tree, call find_library_model first. Never invent an assetId; an id may be inserted only if it was returned here or given to you by the user.',
      parameters: S({ query: { type: 'string' }, maxTriangles: { type: 'number' }, robloxOnly: { type: 'boolean' } }, ['query']),
    },
    studio: false,
    run: async (ctx, a) => {
      const refused = sourceRefusal(ctx.assetSources, 'creator_store', ctx.askAssetSources, ctx.assetSettingsUnread);
      // BEFORE the search, never after. An empty result would read as "the Creator Store has
      // nothing like that" — a claim about a catalogue this caller was never allowed to look in.
      if (refused) return { error: refused };
      const integrity: DetailsIntegrity = { missing: [] };
      const res = await findVerifiedAssets(ctx.env, String(a.query ?? ''), {
        category: 'mesh',
        robloxOnly: a.robloxOnly === true,
        maxTriangles: a.maxTriangles ? Number(a.maxTriangles) : undefined,
        want: 3,
        fetchImpl: strictDetailsFetch(integrity),
      });
      for (const v of res.passed) (ctx.discoveredAssetIds ??= new Set()).add(v.assetId);
      return {
        note: res.search.note,
        ...(integrity.missing.length
          ? { schemaWarning: `the details endpoint stopped reporting ${[...new Set(integrity.missing)].join(', ')} for one or more candidates; those were refused rather than assumed script-free` }
          : {}),
        passed: res.passed.map((v) => ({ assetId: v.assetId, name: v.name, type: v.assetType, triangles: v.triangles })),
        rejected: res.rejected.map((v) => ({ assetId: v.assetId, verdict: v.verdict, reasons: v.reasons })),
      };
    },
  },
  insert_asset: {
    def: {
      name: 'insert_asset',
      description:
        'Insert an asset by numeric assetId, from find_verified_asset or the USER (never one you produced yourself). EVERY id is resolved against the Creator Store and must pass the gate find_verified_asset applies (a Model is always refused); every insertion is then scanned inside the place: scripts are removed, the place is re-listed to prove it clean, and an asset that cannot be proven clean is deleted whole and refused. Models come from insert_library_model, which skips this gate.',
      parameters: S({ assetId: { type: 'number' }, parent: { type: 'string' } }, ['assetId']),
    },
    studio: true,
    studioOps: ['insert_asset', 'get_tree', 'list_scripts', 'read_script', 'delete_instances'],
    mutatesProject: true,
    run: async (ctx, a) => {
      const assetId = Number(a.assetId);
      if (!Number.isInteger(assetId) || assetId <= 0) return { error: `${String(a.assetId)} is not a valid asset id` };
      const parent = String(a.parent ?? 'game.Workspace');

      // WHERE an id came from decides which assertions may be waived. It never decides whether the
      // gate runs — a membership test is not a verification, and treating it as one is how a bad
      // library row would have reached a place unresolved and unscanned.
      //
      // AND IT CANNOT DECIDE MORE THAN THAT, which the tool description used to claim it did: it
      // promised that an id from outside this session's searches is refused. It was not, and the
      // code could not have kept the promise. `verifyCreatorStoreAsset` refuses `model_output`, but
      // nothing here assigns it, because nothing here can: an id the user pasted and an id the model
      // invented arrive at this function as the same integer. The evidence that would separate them
      // — the user's own message text — lives in the session Durable Object and is not passed to a
      // tool, and adding a hook nobody fills in would be the same dead branch in a new place.
      //
      // So the description now states what this actually does, and `user_supplied` means exactly
      // "not discovered in this session" — the LEAST trusted provenance, which waives nothing and
      // faces the full gate plus the in-place scan below. Refusing it outright was considered and
      // rejected: a user pasting an id they own is a real flow, and it is the flow that is hardest
      // to work around when it is broken. The provenance is reported in the result so that an id
      // nobody searched for is visible in the transcript and in the audit log rather than inferred.
      const provenance: AssetProvenanceSource = ctx.discoveredAssetIds?.has(assetId) ? 'search_result' : 'user_supplied';

      // BEFORE verification, not after: this is a question about where the id came from, which
      // `provenance` already answers for free, and it costs nothing to ask now. Verification below
      // spends a real Creator Store network call — paying for it on an id nobody was allowed to go
      // looking for through this app in the first place would be the same mistake find_verified_asset
      // avoids above. `user_supplied` is never refused here — see
      // `PROVENANCE_SOURCE` in asset-policy.ts for why a pasted id is the customer's own choice, not
      // StudPilot's, and still faces the full gate immediately below regardless.
      const sourceRefused = provenanceRefusal(ctx.assetSources, provenance, ctx.askAssetSources, ctx.assetSettingsUnread);
      if (sourceRefused) return { error: sourceRefused };

      const integrity: DetailsIntegrity = { missing: [] };
      const verdict = await verifyCreatorStoreAsset(ctx.env, assetId, { provenance, fetchImpl: strictDetailsFetch(integrity) });
      if (integrity.missing.length) {
        return {
          error:
            `asset ${assetId} was refused: the asset details response did not report ${[...new Set(integrity.missing)].join(', ')}, ` +
            'so whether it carries scripts could not be checked. A field that is absent is treated as the worst case, never as false.',
        };
      }

      //[[ THERE IS NO LONGER A WAIVER HERE, AND THAT IS THE POINT.
      //
      //   A curated-library id used to take a softer path: it had been ingested by an operator and
      //   uploaded under StudPilot's own account, so by construction it carried no marketplace price,
      //   no votes and no verified-creator badge, and the full gate would have refused every asset
      //   in the library on those three alone. Those three were waived and only those three.
      //
      //   The library was removed on 2026-09-20 and `libraryAssetIds` went with it, so `fromLibrary`
      //   could only ever have been false from that moment on. A branch that no input can reach is
      //   not a harmless leftover when the branch is a security waiver: the next reader sees three
      //   assertions described as waivable and has to work out, from two other files, that nothing
      //   can ask for it. So the waiver is deleted rather than left unreachable, and EVERY id now
      //   faces the same verdict — which is what the tool description already promised. ]]
      if (!verdict.ok) return { error: `asset ${assetId} was not verified: ${verdict.verdict}. ${verdict.reasons.join(' ')}` };

      ctx.discoveredAssetIds = (ctx.discoveredAssetIds ?? new Set()).add(assetId);
      const placed = await insertAndProveClean(ctx, assetId, parent);
      if (typeof placed !== 'object' || placed === null || 'error' in placed) return placed;

      // AFTER the asset is proven clean and in the place, and never before: the ledger
      // records what a project actually uses, and an insertion that was refused is not
      // a use. Failures here are swallowed on purpose — an attribution row is a record
      // ABOUT the build, and losing one must not undo a placement that succeeded.
      //
      // WHAT A LOST WRITE ACTUALLY COSTS, stated correctly. An earlier version of this
      // comment claimed it "degrades into a visible unaccounted" — it does not. The
      // report reads `project_asset_use`, so a row that was never written is not
      // unaccounted, it is ABSENT, and the asset simply does not appear. The key-space
      // argument covers a row that was written with a sentinel; it cannot cover a row
      // that does not exist. `recorded: false` therefore goes into the tool result, so
      // the loss is at least visible in the transcript and the audit log rather than
      // nowhere, and the panel's footer says a clean result covers only what is listed.
      const recorded = await recordPlacedAsset(ctx, assetId, parent);

      return {
        ...placed,
        provenance,
        // `null` means there was no project to attribute to at all — the eval harness
        // and the admin run-tool route. Saying "recorded: false" there would report a
        // failure that never happened.
        ...(recorded ? { attribution: recorded } : {}),
      };
    },
  },
  // THE CREATOR STORE PATH (rebuild 2026-10-08). The agent searches the store itself (apps/studio search_creator_store),
  // picks an asset, and brings it in here: inserted into a holder folder, every script removed and the place re-listed to
  // prove it, then measured so the agent can scale, place and adapt it. Unlike insert_asset there is no popularity gate:
  // the agent judges fit from the store's details and from what it sees after insertion.
  insert_from_store: {
    def: {
      name: 'insert_from_store',
      description:
        'Insert a Creator Store asset (model, mesh, decal, audio) you found with search_creator_store into the place. It lands in a holder folder under `parent`; any scripts inside are removed and reported. Returns the inserted paths and their bounding size, so you can inspect (get_instance, model_anatomy), then scale and position it (transform_instances) and rename or re-parent it to fit the request. Delete it if it does not fit.',
      parameters: S({ assetId: { type: 'number' }, parent: { type: 'string', description: 'Where to put it. Default game.Workspace.' } }, ['assetId']),
    },
    studio: true,
    studioOps: ['insert_asset', 'get_tree', 'list_scripts', 'read_script', 'delete_instances', 'create_instances'],
    mutatesProject: true,
    run: async (ctx, a) => {
      const assetId = Number(a.assetId);
      if (!Number.isInteger(assetId) || assetId <= 0) return { error: `${String(a.assetId)} is not a valid asset id` };
      ctx.discoveredAssetIds = (ctx.discoveredAssetIds ?? new Set()).add(assetId);
      return insertAndProveClean(ctx, assetId, String(a.parent ?? 'game.Workspace'));
    },
  },
  generate_model: {
    def: {
      name: 'generate_model',
      description:
        "CLOSED to the agent (D-MODELLIB-2): no 3D model is generated from scratch, so this refuses. Every prop, building, vehicle and character comes from find_library_model + insert_library_model.",
      parameters: S(
        {
          prompt: { type: 'string' },
          intent: { type: 'string', description: 'what it is meant to be, e.g. "tree" or "lamp post" — drives the scale check' },
          maxTriangles: { type: 'number', description: 'default 6000' },
          predefinedSchema: { type: 'string', enum: ['Body1', 'Car5'] },
          parent: { type: 'string' },
        },
        ['prompt'],
      ),
    },
    studio: true,
    studioOps: ['generate_model'],
    mutatesProject: true,
    // D-MODELLIB-2: the plugin op stays; the agent is refused and sent to the library.
    run: () => Promise.resolve(refuseGeneratedModel('generate_model')),
  },
  inspect_model: {
    def: {
      name: 'inspect_model',
      description:
        'Run bounded structural QC on an inserted or generated Model/BasePart: descendant/part/script counts, bounding box, anchoring, collision flags, MeshPart/texturing presence and pivot-to-base offset where Studio exposes it. Triangle count is reported as unmeasured because current MeshPart exposes no triangle-count property; visual quality remains a separate render/vision check.',
      parameters: S({ path: { type: 'string' }, intent: { type: 'string' } }, ['path']),
    },
    studio: true,
    studioOps: ['inspect_model'],
    run: (ctx, a) => op(ctx, { op: 'inspect_model', path: String(a.path ?? ''), intent: a.intent ? String(a.intent) : undefined }, 45_000),
  },
  /**
   * THE RETENTION SENTENCE IN THIS DESCRIPTION IS THE ONLY RETENTION FACT THE MODEL HAS. The tool
   * result carries no expiry field and search_docs indexes Roblox's documentation, not StudPilot's, so
   * whatever this says is what the customer gets told. It said "retrievable for one hour" — the
   * KV window this tool stopped using in the same commit that moved it to `saveGeneratedImage` —
   * while /docs/credits-and-limits told the customer images stay until the project is deleted. The
   * product contradicted itself, and the half talking to the customer was the wrong one.
   *
   * Do NOT sweep the word "hour" out of this file. `compose_thumbnail` above says "saved for an
   * hour" and that one is TRUE: it writes through `storeImage`, which is KV with IMAGE_TTL_SECONDS.
   * Two tools, two stores, two different honest sentences.
   */
  generate_image: {
    def: {
      name: 'generate_image',
      description:
        "Generate an original 2D image — UI icon, decal, tiling texture, thumbnail or concept study. Defaults are outlined, chunky game art. Keep the user's exact subject and background colors in subject; they override default palettes, even neutral or dark ones. Other style choices go in structured fields. Embedded text and brand marks are refused: use editable TextLabels or official brand assets. The flatness heuristic does NOT verify appearance, color or subject fidelity; inspect the image before claiming a match. Results show inline with Save image and stay with the project until it is deleted. Nothing is uploaded to Roblox or applied to the user's place.",
      parameters: S(
        {
          subject: { type: 'string', description: 'What to draw, as a plain noun phrase. No words to render, no brand names.' },
          target: { type: 'string', enum: ['ui_icon', 'decal', 'texture', 'thumbnail', 'concept'] },
          palette: {
            type: 'array',
            description: 'Default palette roles, only when the user gave no colors; requested colors go in subject, never replaced by a saturated palette.',
            items: { type: 'string', enum: ['grass', 'dirt', 'stone', 'cliff', 'foliage', 'wood', 'sky', 'sand', 'accent', 'positive', 'danger', 'premium', 'currency_soft', 'currency_hard', 'locked'] },
          },
          outline: { type: 'string', enum: ['heavy', 'very_heavy'], description: 'default heavy; the style never uses a thin outline' },
          lowPoly: { type: 'string', enum: ['flat_vector', 'chunky_low_poly', 'blocky'] },
          lighting: { type: 'string', enum: ['flat', 'high_key', 'clear_daylight'] },
          camera: { type: 'string', enum: ['straight_on', 'three_quarter', 'isometric', 'top_down'] },
          background: { type: 'string', enum: ['flat_solid', 'soft_vignette_free', 'sky', 'plain_white'] },
          aspect: { type: 'string', enum: ['1:1', '4:3', '3:4', '16:9', '9:16'], description: 'composition hint; the canvas itself is square' },
          steps: { type: 'number', description: '1-8, default 4' },
          seed: { type: 'number' },
        },
        ['subject', 'target'],
      ),
    },
    studio: false,
    run: async (ctx, a) => {
      const req: ImageRequest = {
        subject: String(a.subject ?? ''),
        target: (a.target as ImageRequest['target']) ?? 'ui_icon',
        palette: Array.isArray(a.palette) ? (a.palette as PaletteRole[]) : undefined,
        outline: a.outline as ImageRequest['outline'],
        lowPoly: a.lowPoly as ImageRequest['lowPoly'],
        lighting: a.lighting as ImageRequest['lighting'],
        camera: a.camera as ImageRequest['camera'],
        background: a.background as ImageRequest['background'],
        aspect: a.aspect as ImageRequest['aspect'],
        steps: a.steps ? Number(a.steps) : undefined,
        seed: a.seed ? Number(a.seed) : undefined,
      };
      // The result is stored under a project-scoped key and is only retrievable through the
      // project-owned image route. Refuse before calling the paid image model when this isolated
      // harness/admin caller has no project, rather than generating pixels nobody can access.
      if (!ctx.projectId) return { error: 'generate_image needs a project to store the result against' };
      if (!await generatedImageCapacity(ctx.env, ctx.projectId)) return { error: 'Image storage is full or this project was deleted. No image generation was started.' };
      const res = await generateImage(ctx.env, req);
      // A refusal is a result, not a crash: the model gets told what to do instead.
      if ('refused' in res) return { error: res.message, reason: res.reason, offending: res.offending };
      // The pixels never enter the transcript — a base64 PNG is ~230k characters of nothing the
      // model can read. The bounded private store keeps them until this project is deleted.
      let imageId: string;
      try { imageId = await saveGeneratedImage(ctx.env, res.pngBase64, ctx.projectId); }
      catch { return { error: 'The image was generated but could not be saved. Do not claim successful delivery or retry automatically.', neurons: res.neurons }; }

      // The pixels reach the BROWSER by path, never through the transcript. A 1024x1024 PNG as a
      // data URL is far past MAX_UI_DETAIL_CHARS, and the model could not read it anyway.
      ctx.uiDetail = imagePanel(ctx.projectId, imageId, req.subject, {
        width: res.width,
        height: res.height,
        note: res.flatness.verdict === 'too_detailed' ? res.flatness.note : undefined,
      });

      return {
        imageId,
        width: res.width,
        height: res.height,
        bytes: res.bytes,
        steps: res.steps,
        flatness: res.flatness.verdict,
        flatnessNote: res.flatness.note,
        appearanceVerified: false,
        verificationNote: 'Image delivered, but subject/color fidelity has not been visually verified. Do not claim it matches the request merely because generation succeeded.',
        aspectHonoured: res.aspectHonoured,
        prompt: res.prompt,
      };
    },
  },
  search_docs: {
    def: {
      name: 'search_docs',
      description: 'Search official Roblox documentation (APIs, services, properties, guides). Use when unsure about an API.',
      parameters: S({ query: { type: 'string' } }, ['query']),
    },
    studio: false,
    run: async (ctx, a) => {
      const { hits, outcome, citations } = await searchDocsDetailed(ctx.env, String(a.query ?? ''), 5);
      //[[ TELL THE MODEL WHICH KIND OF NOTHING THIS IS.
      //
      //   An empty array is the same token sequence whether the documentation has no answer or
      //   whether nobody ever filled the index, and the model's behaviour should differ: on a real
      //   miss it should answer from what it knows and say so; on an empty index it must not claim
      //   the documentation was consulted. It cannot make that distinction from `[]`.
      //
      //   Results, when there are any, keep the plain array shape the prompt describes — plus the
      //   citation number the answer is expected to cite by. ]]
      if (!hits.length) return { results: [], searched: outcome.kind !== 'empty-index' && outcome.kind !== 'unavailable', note: outcome.detail, conclusive: outcome.certain };
      const n = new Map(citations.map((cit) => [cit.url, cit.n]));
      return hits.map((h) => ({ citation: n.get(h.url) ?? null, title: h.title, url: h.url, excerpt: h.text.slice(0, 900) }));
    },
  },
  generate_ui_image_hf: {
    def: {
      name: 'generate_ui_image_hf',
      description:
        'Second image model (Z-Image-Turbo on Hugging Face). Same job and same rules as generate_image — an original UI icon, decal, texture or thumbnail, no words, no brands — use it when generate_image failed or the user asks for another take. Capped at a few calls a day across all users; a daily_cap error means use generate_image instead.',
      parameters: S(
        {
          subject: { type: 'string', description: 'What to draw, as a plain noun phrase. No words to render, no brand names.' },
          target: { type: 'string', enum: ['ui_icon', 'decal', 'texture', 'thumbnail', 'concept'] },
        },
        ['subject', 'target'],
      ),
    },
    studio: false,
    run: async (ctx, a) => {
      const req: ImageRequest = {
        subject: String(a.subject ?? ''),
        target: (a.target as ImageRequest['target']) ?? 'ui_icon',
      };
      // Same art direction and refusals as generate_image, decided before any paid call.
      const direction = composeArtDirection(req);
      if ('refused' in direction) return { error: direction.message, reason: direction.reason, offending: direction.offending };
      if (!isHfConfigured(ctx.env)) return { error: 'The Hugging Face image model is not configured here. Use generate_image.' };
      if (!ctx.projectId) return { error: 'generate_ui_image_hf needs a project to store the result against' };
      if (!await generatedImageCapacity(ctx.env, ctx.projectId)) return { error: 'Image storage is full or this project was deleted. No image generation was started.' };

      const res = await hfGenerateImage(ctx.env, direction.prompt);
      if (!res.ok) return { error: res.message, reason: res.reason };

      let imageId: string;
      try { imageId = await saveGeneratedImage(ctx.env, bytesToBase64(res.png), ctx.projectId); }
      catch { return { error: 'The image was generated but could not be saved. Do not claim successful delivery or retry automatically.' }; }
      ctx.uiDetail = imagePanel(ctx.projectId, imageId, req.subject, { width: res.width, height: res.height });
      return {
        imageId,
        width: res.width,
        height: res.height,
        model: HF_IMAGE_MODEL.hubId,
        appearanceVerified: false,
        verificationNote: 'Image delivered, but subject/color fidelity has not been visually verified. Do not claim it matches the request merely because generation succeeded.',
      };
    },
  },
  // The open UI/icon library (D-UILIB-1/2): thousands of CC0 Kenney PNGs — buttons, panels, bars,
  // frames, HUD icons, controller prompts, cursors, crosshairs. The lookup answers from an index
  // compiled into this bundle; the upload reads the PNG from the static store and puts it in the
  // USER'S OWN Roblox account (their key), exactly as generate_model_external does.
  find_ui_asset: {
    def: {
      name: 'find_ui_asset',
      description:
        `Search the UI image library: 5,000+ CC0 PNGs (buttons, panels, bars, borders, HUD and menu icons, controller/key/touch prompts, emotes, cursors) AND ${UI_STORE_COUNT.toLocaleString('en-US')} free Roblox Creator Store UI images. Use it before generating an image for a standard UI element. Plain words match names (e.g. "coin icon", "shop button", "gamepass", "settings", "rebirth"); \`genre\` lifts that genre's Creator Store images; \`pack\` narrows the CC0 part to one pack; an empty query lists the packs. \`results\` are CC0 files: pass an \`asset\` to upload_ui_asset, or as an icon to insert_ui_component. \`store\` hits are already on Roblox: their \`image\` (rbxassetid://…) goes straight into an icon of insert_ui_component or an Image property, never uploaded. Nothing is uploaded or changed by this call.`,
      parameters: S(
        {
          query: { type: 'string', description: 'Plain words for the element, e.g. "red round button" or "pause".' },
          pack: { type: 'string', description: 'Optional pack id from an earlier answer, e.g. kenney-ui-pack or kenney-input-prompts.' },
          kind: { type: 'string', enum: ['ui', 'icons'], description: 'ui = panels, buttons, bars, frames; icons = single glyphs.' },
          genre: { type: 'string', enum: [...UI_STORE_GENRES], description: 'Optional: lift Creator Store images made for this genre.' },
          limit: { type: 'number', description: 'How many results, 1 to 40. Default 12.' },
        },
        [],
      ),
    },
    studio: false,
    run: async (_ctx, a) => {
      const query = a.query === undefined ? undefined : String(a.query);
      const found = findUiAssets({
        query,
        pack: a.pack ? String(a.pack) : undefined,
        kind: a.kind ? String(a.kind) : undefined,
        limit: a.limit === undefined ? undefined : Number(a.limit),
      });
      if (!query?.trim() || a.pack) return found;
      // Tool answers are cut at 3,000 characters, so the store part is slim and short.
      const genre = a.genre && UI_STORE_GENRES.includes(String(a.genre)) ? String(a.genre) : undefined;
      const store = findUiStoreImages({ query, genre, limit: 8 }).map((h) => ({ image: h.image, name: h.name, kind: h.kind }));
      if (!store.length) return found;
      // With store hits, an empty CC0 answer needs no pack list; the two sources then share the room.
      const out = { ...found, ...(found.results.length ? {} : { packs: undefined }), store };
      while (JSON.stringify(out).length > 2900 && (out.results.length || out.store.length)) {
        (out.results.length > out.store.length ? out.results : out.store).pop();
      }
      return out;
    },
  },
  upload_ui_asset: {
    def: {
      name: 'upload_ui_asset',
      description:
        "Upload ONE image chosen with find_ui_asset into the USER'S OWN Roblox account with their connected Open Cloud key (asset:write) and get back an rbxassetid for ImageLabel.Image / ImageButton.Image. `asset` must be an `asset` value find_ui_asset returned. Roblox keeps uploaded images permanently and moderates them: upload only images the build actually uses, once each, and reuse an id you already have. Nothing is put in the place — set the Image property yourself afterwards.",
      parameters: S(
        {
          asset: { type: 'string', description: 'The `asset` value from find_ui_asset, unchanged.' },
          displayName: { type: 'string', description: 'Name in the user\'s inventory, max 50 chars.' },
        },
        ['asset'],
      ),
    },
    studio: false,
    run: async (ctx, a) =>
      uploadLibraryAsset(ctx.env, ctx.userId, {
        asset: String(a.asset ?? ''),
        displayName: a.displayName ? String(a.displayName) : undefined,
      }),
  },
  // The 3D model library (D-MODELLIB-1): script-free Creator Store models, normally Roblox-owned.
  // Trusted third-party models are explicitly optional because Studio may refuse their load.
  // Downloaded CC0/CC-BY/MIT files remain indexed but are not offered to the
  // agent: the current source choice does not authorise a permanent upload into the user's
  // Roblox account. Props still come from the library; parts stay for terrain, paths and zones.
  find_library_model: {
    def: {
      name: 'find_library_model',
      description:
        "Step 1 of the asset order, before building a detailed object: search for a ready-made prop, building, plant, vehicle, character, pet, weapon, kit, UI or map in the bundled Roblox-owned models, then the live Creator Store (free, verified creator, zero scripts; ids cs:<n>). Plain words, as many queries as needed; genre and kind narrow it. Bundled third-party models only with includeThirdParty=true (marked requiresThirdPartyLoading; Studio may refuse them, never promise they load). Fit and looks are unverified until preview_library_models. In Agent mode StudPilot may show the owner up to three thumbnails to pick from. Inserts nothing: pass a result `id` unchanged to insert_library_model.",
      parameters: S(
        {
          query: { type: 'string', description: 'Plain words for the object.' },
          genre: { type: 'string', enum: [...LIBRARY_GENRES] },
          kind: { type: 'string', enum: [...LIBRARY_KINDS] },
          includeThirdParty: { type: 'boolean', description: 'Also search free third-party models (default false).' },
          limit: { type: 'number', description: '1 to 40, default 10.' },
        },
        [],
      ),
    },
    studio: false,
    run: async (ctx, a) => recordSearch(ctx, await findLibraryModelCall(ctx, a)),
  },
  more_tools: {
    def: {
      name: 'more_tools',
      description: 'When no offered tool fits: unlocks more. names = tools or groups (terrain, sound, image, models, web, code, workspace, ui); omit for all.',
      parameters: S({ why: { type: 'string' }, names: { type: 'array', items: { type: 'string' } } }, ['why']),
    },
    studio: false,
    run: async (ctx, a) => {
      const asked = Array.isArray(a.names) ? a.names.filter((n): n is string => typeof n === 'string') : [];
      const { tools, unknown } = resolveDeferred(asked);
      // Nothing recognised (or nothing asked for) unlocks everything, as it always did: no capability is cut by a typo.
      if (!tools.length) {
        ctx.widenTools?.();
        return { widened: true, note: 'Every tool is offered from the next step.' };
      }
      ctx.widenTools?.(tools);
      return { widened: true, unlocked: tools, ...(unknown.length ? { unknown } : {}), note: 'These tools are offered from the next step; ask again for others.' };
    },
  },
  preview_library_models: {
    def: {
      name: 'preview_library_models',
      description: "Look at ready-made models before choosing: 1-6 candidates ({ id } from find_library_model), staged off the place and measured (size against a player, colour, parts, blockers); nothing is placed or chosen for you. snapshot: true shows the user one picture.",
      parameters: S({
        models: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } } },
        snapshot: { type: 'boolean' },
      }, ['models']),
    },
    studio: true,
    studioOps: ['snapshot', 'get_instance', 'create_instances', 'delete_instances', 'get_tree', 'strip_descendants'],
    plainSummary: (_a, r, failed) => failed ? 'Could not look at the models' : `Looked at ${(r as { previews?: unknown[] } | undefined)?.previews?.length ?? 0} ready-made model(s)`,
    run: (ctx, a) => previewLibraryModels(ctx, Array.isArray(a.models) ? a.models : [], { snapshot: a.snapshot === true }),
  },
  dress_object: {
    def: {
      name: 'dress_object',
      description: "Optional extras for an object already in the place; nothing is added unless you ask, an empty call is an error. target = game.Workspace.<Name>. stage: a slab it is raised onto. click { motion, sound? }: the whole object moves when clicked or walked into. counter { label, hint? }: counts those moves (needs click). attach: other ready-made pieces fixed to it. Ground, spawn, lighting and camera are left alone (lights, effects: insert_vfx or create_instances).",
      parameters: S({
        target: { type: 'string' },
        stage: { type: 'object', properties: { color: { type: 'string' }, height: { type: 'number' }, pad: { type: 'number' } } },
        click: { type: 'object', properties: { motion: { type: 'string', enum: ['wobble', 'spin', 'bob', 'pop', 'press', 'open'] }, sound: { type: 'string' }, amount: { type: 'number' } } },
        counter: { type: 'object', properties: { label: { type: 'string' }, hint: { type: 'string' } } },
        attach: { type: 'array', maxItems: 6, items: { type: 'object', properties: { id: { type: 'string' }, pieceName: { type: 'string' }, at: {}, width: { type: 'number' } } } },
      }, ['target']),
    },
    studio: true,
    studioOps: ['get_tree', 'get_instance', 'create_instances', 'transform_instances', 'rig_model', 'set_joint_pivot', 'edit_script', 'set_props', 'delete_instances', 'place_copies', 'strip_descendants'],
    mutatesProject: (r) => typeof r === 'object' && r !== null && (r as { changed?: unknown }).changed === true,
    plainSummary: (_a, _r, failed) => failed ? 'Could not dress the object' : 'Dressed the object',
    run: dressObject,
  },
  build_object: {
    def: {
      name: 'build_object',
      description: "Build ONE object from named parts: size [x,y,z] studs (a player is 5), centred at `at`, y up; details on the outside of what they decorate. Words go in a part's text; a part moves only with a move; rows lays out labelled cells. Nothing unasked is added (stage, screen, focus are opt-in). The result has measured `checks`: information, not a verdict. A taken name is an error; replace: true overwrites.",
      parameters: S({
        name: { type: 'string', description: 'Any language.' },
        scale: { type: 'number' },
        at: { type: 'array', items: { type: 'number' }, description: 'Footprint centre on the ground. Default: beside what is there.' },
        replace: { type: 'boolean' },
        extend: { type: 'string', description: 'An id from "Earlier in this project": add these parts to that object.' },
        parts: { type: 'array', items: { type: 'object', properties: {
          name: { type: 'string' }, shape: { type: 'string', enum: ['block', 'ball', 'cylinder', 'wedge'] },
          size: { type: 'array', items: { type: 'number' } }, at: { type: 'array', items: { type: 'number' } }, rot: { type: 'array', items: { type: 'number' } },
          color: { type: 'string', description: '#rrggbb' }, material: { type: 'string', enum: ['Plastic', 'Neon'] }, transparency: { type: 'number' }, surface: { type: 'string', enum: ['smooth'] },
          text: { description: 'A string, or { value, face, color, font, glow }.' }, key: { type: 'string', description: 'Enum.KeyCode, for move.on key.' }, rides: { type: 'string' },
          repeat: { type: 'object', properties: { grid: { type: 'array', items: { type: 'number' } }, step: { type: 'array', items: { type: 'number' } }, names: { type: 'array', items: { type: 'string' } }, texts: { type: 'array', items: { type: 'string' } }, keys: { type: 'array', items: { type: 'string' } } } },
          rows: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'Labelled cells instead of one part. Also unit, gap, height, widths, color(s), textColor, case, align, keys, move.' },
          move: { type: 'object', properties: { as: { type: 'string', enum: ['press', 'spin', 'bob', 'open', 'wobble', 'pop'] }, on: { type: 'string', enum: ['key', 'click', 'touch', 'prompt', 'loop', 'once'] }, hinge: { type: 'string' }, amount: { type: 'number' }, sound: { type: 'string', description: 'Sound id or words.' } } },
        }, required: ['name'] } },
        stage: { type: 'object', description: 'Slab under it; absent: none.', properties: { color: { type: 'string' }, height: { type: 'number' }, pad: { type: 'number' } } },
        screen: { type: 'object', description: 'Counter/hint on the screen; absent: none.', properties: { counter: { type: 'string' }, hint: { type: 'string' } } },
        focus: { type: 'boolean' },
      }, ['name', 'parts']),
    },
    studio: true,
    studioOps: ['create_instances', 'delete_instances', 'get_instance', 'set_props', 'apply_surface', 'rig_model', 'set_joint_pivot', 'edit_script', 'get_tree', 'camera_focus', 'spatial_query'],
    mutatesProject: (r) => typeof r === 'object' && r !== null && (r as { changed?: unknown }).changed === true,
    plainSummary: (_a, _r, failed) => failed ? 'Could not build it' : 'Built it',
    run: buildObject,
  },
  animate_model: {
    def: {
      name: 'animate_model',
      description: "Make a model move: rig it, then keyframe clips. Load the animation skill first and read the model with model_anatomy.",
      parameters: S({ model: { type: 'string' }, rig: { type: 'object' }, clips: { type: 'object' } }, ['model', 'clips']),
    },
    studio: true,
    studioOps: ['rig_model', 'set_joint_pivot', 'edit_script', 'delete_instances'],
    mutatesProject: (r) => typeof r === 'object' && r !== null && (r as { changed?: unknown }).changed === true,
    plainSummary: (_a, _r, failed) => failed ? 'Could not animate it' : 'Made it move',
    run: animateModel,
  },
  model_anatomy: {
    def: {
      name: 'model_anatomy',
      description: "Read a placed model: its parts, joints, hinge candidates and which way a positive angle turns a part, what is already clickable, lit or playing. Use before add_behaviour. Pass part for one part's detail.",
      parameters: S({ model: { type: 'string' }, part: { type: 'string' }, maxParts: { type: 'number' } }, ['model']),
    },
    studio: true,
    studioOps: ['get_tree', 'read_script'],
    plainSummary: (_a, _r, failed) => failed ? 'Could not look it over' : 'Looked the model over',
    run: modelAnatomy,
  },
  add_behaviour: {
    def: {
      name: 'add_behaviour',
      description: "Give a placed model behaviour from reviewed verbs (swing, slide, spin, bob, fade, light, sound, emit, bounce) done to parts on a trigger (click, prompt, touch, near, auto). Library models arrive with scripts and sounds stripped; this gives them behaviour again. Call with just model to list the verbs and what each takes. Read creation skill props-add-behaviour first.",
      parameters: S({ model: { type: 'string' }, behaviours: { type: 'array', items: { type: 'object' } }, remove: { type: 'array', items: { type: 'string' } }, replace: { type: 'boolean' } }, ['model']),
    },
    studio: true,
    studioOps: ['get_tree', 'read_script', 'edit_script', 'delete_instances', 'get_instance'],
    mutatesProject: (r) => typeof r === 'object' && r !== null && (r as { changed?: unknown }).changed === true,
    plainSummary: (_a, _r, failed) => failed ? 'Could not add the behaviour' : 'Made it do something',
    run: addBehaviour,
  },
  build_blocks: {
    def: {
      name: 'build_blocks',
      description: BLOCKS_TOOL_DESCRIPTION,
      parameters: S({ blocks: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string' } }, params: { type: 'object', description: '{blockId: {parameter: value}}' } }, ['blocks']),
    },
    studio: true,
    // play_check is the final check, not a requirement: without it the blocks are still built and the report says the play test did not run.
    studioOps: ['create_instances', 'set_props', 'edit_script', 'clone_instances', 'delete_instances', 'get_instance', 'read_script'],
    mutatesProject: (r) => typeof r === 'object' && r !== null && (r as { changed?: unknown }).changed === true,
    plainSummary: (_a, r, failed) => failed || (r as { ok?: unknown } | null)?.ok === false ? 'Could not finish the build' : 'Built it from reviewed blocks',
    run: buildBlocks,
  },
  build_studded_ui: {
    def: {
      name: 'build_studded_ui',
      description: "Studded GUI: pieces [{kind counter|button|bar|panel, name, text, at, colour, cards}] (skill ui-studded-gui). Reuses screen pieces; buttons avoid bottom/corners unless exact:true. Then script each value and button.",
      parameters: S({ screen: { type: 'string' }, pieces: { type: 'array', items: { type: 'object' } }, replace: { type: 'boolean' } }, ['pieces']),
    },
    studio: true,
    studioOps: ['create_instances', 'delete_instances'],
    mutatesProject: (r) => typeof r === 'object' && r !== null && (r as { changed?: unknown }).changed === true,
    plainSummary: (_a, _r, failed) => failed ? 'Could not draw the screen' : 'Drew the studded screen',
    run: buildStuddedUi,
  },
  add_upgrades: {
    def: {
      name: 'add_upgrades',
      description: 'Working upgrades in ONE call: money per press and second, Upgrades button and panel on the screen (nothing on it changes), server-checked buys, saved. Design them for THIS game.',
      parameters: S({ screen: { type: 'string' }, currency: { type: 'string' }, upgrades: { type: 'array', minItems: 1, maxItems: 9, items: { type: 'object' }, description: '[{label, kind perPress|perSecond|multiplier, amount, cost, growth?, max?, icon?}]' } }, ['upgrades']),
    },
    studio: true,
    studioOps: ['get_tree', 'create_instances', 'delete_instances', 'edit_script'],
    mutatesProject: (r) => typeof r === 'object' && r !== null && (r as { changed?: unknown }).changed === true,
    plainSummary: (_a, _r, failed) => failed ? 'Could not add the upgrades' : 'Added working upgrades',
    run: addUpgrades,
  },
  insert_library_model: {
    def: {
      name: 'insert_library_model',
      description:
        "Place ONE ready-made model you chose as a script-free copy; reports its size against a player. Pass { id } from find_library_model (a verified Creator Store row). It keeps its own size unless you pass size (longest side), height or scale; dress_object adds extras. name: any language; a taken name is an error (rename, or replace: true). Third-party rows need the experience's third-party loading; file rows are not insertable. Inserts are scanned in the place and scripts removed; this skips insert_asset's gate (which refuses every Model). A failure names its stage, whether to retry and the next candidate ids: take the next, then go on down the asset order. For many copies, insert one and clone_instances it.",
      parameters: S(
        {
          id: { type: 'string', description: 'A result `id` from find_library_model, unchanged.' },
          name: { type: 'string' },
          position: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number' }, description: 'Bottom-centre.' },
          size: { type: 'number', description: 'Longest side in studs.' },
          height: { type: 'number', description: 'Target height in studs.' },
          scale: { type: 'number', minimum: 0.001, maximum: 1000 },
          replace: { type: 'boolean' },
          parent: { type: 'string', description: 'Default game.Workspace.' },
        },
        [],
      ),
    },
    studio: true,
    studioOps: ['snapshot', 'insert_asset', 'get_tree', 'list_scripts', 'read_script', 'delete_instances', 'group_instances', 'spatial_query', 'transform_instances'],
    // A refusal changed nothing in the place.
    mutatesProject: (r) => !(typeof r === 'object' && r !== null && ('pending' in r || ('error' in r && !('projectMutated' in r)))),
    run: async (ctx, a) => recordInsert(ctx, a, await insertLibraryModelCall(ctx, a)),
  },
  generate_model_external: {
    def: {
      name: 'generate_model_external',
      description:
        "CLOSED to the agent (D-MODELLIB-2): no 3D model is generated from scratch, so this refuses. Every prop, building, vehicle and character comes from find_library_model + insert_library_model.",
      parameters: S(
        {
          prompt: { type: 'string', description: 'One object, as a plain noun phrase. No brands, no text.' },
          displayName: { type: 'string', description: 'asset name in the user\'s inventory, max 50 chars' },
          parent: { type: 'string' },
        },
        ['prompt'],
      ),
    },
    studio: true,
    // insertAndProveClean's ops, as on insert_asset.
    studioOps: ['insert_asset', 'get_tree', 'list_scripts', 'read_script', 'delete_instances'],
    // A still-processing upload is a success that changed nothing in the place.
    mutatesProject: (r) => !(typeof r === 'object' && r !== null && 'pending' in r),
    // D-MODELLIB-2: the agent is sent to the library; hf-3d-pipeline.ts stays for the owner's tooling.
    run: () => Promise.resolve(refuseGeneratedModel('generate_model_external')),
  },
  remember: {
    def: {
      name: 'remember',
      description: 'Save a durable fact to project memory (decisions, conventions, user preferences).',
      parameters: S({ fact: { type: 'string' } }, ['fact']),
    },
    studio: false,
    run: async (ctx, a) => {
      const outcome = await ctx.addMemoryFact(String(a.fact ?? ''));
      // Each branch says what actually happened, in words the model can act on: under review it
      // must not tell the user the fact is remembered, and with memory off it must stop trying.
      if (outcome === 'suggested') {
        return { saved: false, status: 'awaiting_approval', note: 'Queued for the user to approve in the memory panel. Do not tell them it is remembered yet.' };
      }
      if (outcome === 'refused') {
        return { saved: false, status: 'memory_off', note: 'This user has turned memory off. Nothing was stored; do not call remember again this run.' };
      }
      return { saved: true, status: 'saved' };
    },
  },
  create_checkpoint: {
    def: {
      name: 'create_checkpoint',
      description: 'Save a restorable checkpoint of the project (scripts + instance tree). Do this before large changes.',
      parameters: S({ label: { type: 'string' } }, ['label']),
    },
    studio: true,
    studioOps: ['snapshot'],
    run: async (ctx, a) => ctx.createCheckpoint(String(a.label ?? 'checkpoint'), 'auto'),
  },
  /**
   * SAY WHAT YOU ARE ABOUT TO DO, BEFORE YOU DO IT.
   *
   * Everything downstream of this has existed since the component registry was written and none of
   * it could ever run: `BuildPlanBlock` (apps/web/src/lib/generative-ui/schema.ts), `BuildPlanView`
   * (render.tsx), `plannedStepsFromDocs` lifting pending steps into the Thinking card's Actions
   * list (gates.ts), `PlanStep.tool` rendered as a monospace chip. `grep -r "build_plan"
   * apps/worker/src` returned nothing, so the only producer in the whole product was a fixture in
   * /ui-lab. This is the producer.
   *
   * It is deliberately NOT in PLAN_TOOLS (router.ts). Plan mode's whole deliverable is a prose
   * roadmap; a second, structured plan on top of that is two answers to one question. This is for
   * Agent, which otherwise starts building with nothing announced.
   *
   * WHAT IT REFUSES, AND WHY IT CAN NEVER REFUSE FOR LONG. Each rule is a defect this codebase has
   * shipped in another form:
   *
   *   - a step whose `tool` is not a registered tool, or is one THIS run was not offered. The user
   *     reads a plan as a commitment, and `edit_scripts` — or `run_spec` against a plugin that
   *     cannot run code — is a commitment the run cannot keep. Same class as the system prompt
   *     naming `get_instance` while it was not a tool (see prompt-tool-names.test.mjs).
   *   - a plan longer than the cap. Truncating silently would show a card the user reads as the
   *     whole commitment while the tail was dropped.
   *   - a malformed step: no title, no tool, or propose_plan itself.
   *
   * A plan with no verification step is not refused: an offered verifier is appended and announced
   * (see readProposedPlan). And no refusal is repeated: the same defect twice in a row is repaired
   * by the product, and two refusals in a row are the most any run can receive (see mayRefuse),
   * because the production failure this replaces was a run that spent its budget being refused.
   *
   * Titles are CLIPPED rather than refused, because the browser's validator drops a whole document
   * whose label exceeds LIMITS.maxLabelLength — a plan that vanishes is worse than a clipped one.
   */
  propose_plan: {
    def: {
      name: 'propose_plan',
      description:
        'Announce the ordered plan for this request BEFORE you start building it: once, as your first step, then carry it out. Each step is { title, detail?, tool }; `tool` is the exact name of a tool offered in this run that you will call for that step. Include a verification step (run_and_check, run_spec, audit_build or check_composition, whichever is offered): a build with no planned check proves nothing, and if you leave it out an offered one is appended. The user sees the plan as a checklist during the run, so title each step as the thing they will get ("A platform players spawn onto"), not an internal action. Costs nothing: no model calls, no images, no change to the project. Do not call it twice; if the work turns out differently, say so in your reply instead of re-planning.',
      parameters: S(
        {
          steps: {
            type: 'array',
            description: `The ordered steps, up to ${MAX_PLAN_STEPS}. Include one that uses an offered verification tool.`,
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'What this step delivers, as a short phrase the user would recognise.' },
                detail: { type: 'string', description: 'One sentence of specifics: which instance, which script, which property.' },
                tool: { type: 'string', description: 'The exact name of the tool this step will call.' },
              },
              required: ['title', 'tool'],
            },
          },
          title: { type: 'string', description: 'Optional name for the plan, e.g. "Spawn platform".' },
        },
        ['steps'],
      ),
    },
    studio: false,
    run: async (ctx, a) => {
      const state: PlanState = ctx.planState ?? { refusals: 0, kinds: [], announced: false };
      //[[ ONE PLAN PER RUN, ANSWERED RATHER THAN REFUSED. A second plan used to be accepted and
      //   drawn as a second checklist, while the run loop kept and settled only the first — so the
      //   browser was left with a card whose steps stayed pending forever. Refusing it instead
      //   would put the run back on the refusal path this tool exists to keep it off. ]]
      if (state.announced) {
        return {
          planned: false,
          note:
            'A plan is already on the user\'s screen for this run and it was not replaced — a second checklist ' +
            'would rewrite what they already read. Carry out the plan you announced, and say in your reply if the ' +
            'work turned out differently.',
        };
      }
      const verdict = readProposedPlan(a, ctx.offeredTools ?? new Set(toolNames()), state);
      if (verdict.kind === 'refused') {
        ctx.planState = { refusals: state.refusals + 1, kinds: verdict.kinds, announced: false };
        return { error: verdict.error };
      }
      if (verdict.kind === 'skipped') {
        ctx.planState = { ...state };
        return { planned: false, note: verdict.note };
      }
      ctx.planState = { refusals: 0, kinds: [], announced: true };
      const plan = verdict.plan;

      ctx.uiDetail = {
        v: 1,
        blocks: [
          {
            type: 'build_plan',
            ...(plan.title ? { title: plan.title } : {}),
            // PENDING, every one of them. Nothing in this list has happened at the moment it is
            // proposed, and a step drawn as done before it ran is this house's own
            // failure-to-observe defect wearing a plan's clothes. session.ts settles the statuses
            // against the oplog when the run ends.
            steps: plan.steps.map((s) => ({ title: s.title, ...(s.detail ? { detail: s.detail } : {}), tool: s.tool, status: 'pending' as const })),
          },
        ],
      };

      return {
        steps: plan.steps.length,
        // The model gets the plan back so the transcript carries the commitment it just made;
        // without it the plan exists only in a UI payload the model never sees again.
        plan: plan.steps.map((s, i) => `${i + 1}. ${s.title} — ${s.tool}`),
        // Said out loud. The model is now committed to a step it did not write, and it has to be
        // told, or it will reach the end of its own list and stop one step early.
        ...(() => {
          const notes = [
            ...(plan.repairs?.length
              ? [`This plan was repaired rather than refused again: ${plan.repairs.join('; ')}. The checklist the user sees is the repaired plan.`]
              : []),
            ...(plan.verifierAdded
              ? [
                  `Your plan had no verification step, so ${plan.verifierAdded} was added as the last step and is ` +
                    'part of the plan the user can see. Carry it out with the rest.',
                ]
              : []),
            ...(plan.noVerifierOffered
              ? [
                  'No verification tool is offered in this session, so nothing will check this result automatically ' +
                    'and the checklist says so. Say plainly in your reply that the result was not automatically checked.',
                ]
              : []),
          ];
          return notes.length ? { note: notes.join(' ') } : {};
        })(),
      };
    },
  },

  /* ------------------------------------------------------- the web-facing tools ---
   *
   * Ten tools defined in webtools.ts, registered here ONE BY ONE rather than spread in from a
   * loop. That is deliberate and it is not style: three separate guards in this repository find
   * the tool table by PARSING THIS LITERAL — tool-vocabulary.test.mjs (every tool must have a
   * written label), tools-for-mode.test.mjs (Plan must reach nothing that mutates) and
   * prompt-tool-names.test.mjs. A `...spread` is invisible to all three, so ten tools would
   * quietly acquire no label, no mode assertion and no prompt check. An entry that a guard cannot
   * see is an entry with no guard.
   *
   * Each body is two lines because the real work — the typed contract, the argument validation,
   * the host/repo/path allowlists, and the rule that a failed fetch is an error rather than an
   * empty result — lives in webtools.ts where it can be tested without a Studio, a project or a
   * network. `runWebTool` validates before dispatching, so no body here is ever reached with an
   * argument nobody checked.
   */
  web_fetch: {
    def: webToolDef('web_fetch'),
    studio: false,
    run: (ctx, a) => runWebTool('web_fetch', webCtx(ctx), a),
  },
  browse_page: {
    def: webToolDef('browse_page'),
    studio: false,
    run: (ctx, a) => runWebTool('browse_page', webCtx(ctx), a),
  },
  web_search: {
    def: webToolDef('web_search'),
    studio: false,
    run: (ctx, a) => runWebTool('web_search', webCtx(ctx), a),
  },
  docs_lookup: {
    def: webToolDef('docs_lookup'),
    studio: false,
    run: (ctx, a) => runWebTool('docs_lookup', webCtx(ctx), a),
  },
  screenshot_page: {
    def: webToolDef('screenshot_page'),
    studio: false,
    run: (ctx, a) => runWebTool('screenshot_page', webCtx(ctx), a),
  },
  github_lookup: {
    def: webToolDef('github_lookup'),
    studio: false,
    run: (ctx, a) => runWebTool('github_lookup', webCtx(ctx), a),
  },
  git_history: {
    def: webToolDef('git_history'),
    studio: false,
    run: (ctx, a) => runWebTool('git_history', webCtx(ctx), a),
  },
  workspace_list: {
    def: webToolDef('workspace_list'),
    studio: false,
    run: (ctx, a) => runWebTool('workspace_list', webCtx(ctx), a),
  },
  workspace_read: {
    def: webToolDef('workspace_read'),
    studio: false,
    run: (ctx, a) => runWebTool('workspace_read', webCtx(ctx), a),
  },
  workspace_write: {
    def: webToolDef('workspace_write'),
    studio: false,
    run: (ctx, a) => runWebTool('workspace_write', webCtx(ctx), a),
  },
  /*
   * THE PHASE A STUDIO TOOLS (D-VISION-1), registered one by one for the reason given for the audio
   * tools below. Their argument checks and bodies live in phase-a-tools.ts, where they are tested
   * against a recorded op channel; each stands on an OPT-IN plugin operation, so a plugin that has
   * not reported that operation is never offered the tool.
   */
  search_instances: {
    def: searchInstances.def,
    studio: true,
    studioOps: ['query_instances'],
    run: (ctx, a) => searchInstances.run(studioCall(ctx), a),
  },
  set_properties_bulk: {
    def: setPropertiesBulk.def,
    studio: true,
    studioOps: ['set_props_bulk'],
    mutatesProject: (result) => positiveCount(result, 'count'),
    run: (ctx, a) => Promise.resolve(refuseUiLook(a.props)).then((restyle) => restyle ?? setPropertiesBulk.run(studioCall(ctx), a)),
  },
  spatial_query: {
    def: spatialQuery.def,
    studio: true,
    studioOps: ['spatial_query'],
    run: (ctx, a) => spatialQuery.run(studioCall(ctx), a),
  },
  scatter_instances: {
    def: scatterInstances.def,
    studio: true,
    studioOps: ['scatter'],
    mutatesProject: (result) => positiveCount(result, 'placed'),
    run: (ctx, a) => scatterInstances.run(studioCall(ctx), a),
  },
  collision_groups: {
    def: collisionGroups.def,
    studio: true,
    studioOps: ['collision_groups', 'collision_groups_list'],
    mutatesProject: (result) => collisionGroups.mutates(result),
    run: (ctx, a) => collisionGroups.run(studioCall(ctx), a),
  },
  shape_terrain: {
    def: shapeTerrain.def,
    studio: true,
    studioOps: ['terrain_shape'],
    mutatesProject: true,
    run: (ctx, a) => shapeTerrain.run(studioCall(ctx), a),
  },
  read_terrain: {
    def: readTerrain.def,
    studio: true,
    studioOps: ['terrain_read'],
    run: (ctx, a) => readTerrain.run(studioCall(ctx), a),
  },
  create_rig: {
    def: createRig.def,
    studio: true,
    studioOps: ['create_rig'],
    mutatesProject: true,
    run: (ctx, a) => createRig.run(studioCall(ctx), a),
  },
  check_ui_layout: {
    def: checkUiLayout.def,
    studio: true,
    studioOps: ['ui_layout_check'],
    run: (ctx, a) => checkUiLayout.run(studioCall(ctx), a),
  },
  // Rebuild 2026-10-08 (ui-engine.ts): replaces the retired theme builder (D-UIONLY-1) under the same name.
  build_ui: {
    def: buildUi.def,
    studio: true,
    studioOps: ['query_instances', 'delete_instances', 'create_instances', 'measure_ui'],
    mutatesProject: (result) => !!result && typeof result === 'object' && typeof (result as Record<string, unknown>).built === 'string',
    run: (ctx, a) => buildUi.run(studioCall(ctx), a),
  },
  check_ui: {
    def: checkUi.def,
    studio: true,
    studioOps: ['measure_ui'],
    run: (ctx, a) => checkUi.run(studioCall(ctx), a),
  },
  // D-FXLIB-1: the sound and effect library (fx-library.ts). Registered one by one, like the rest.
  find_sound: {
    def: findSound.def,
    studio: false,
    run: async (_ctx, a) => findSound.run(a),
  },
  insert_sound: {
    def: insertSound.def,
    studio: true,
    studioOps: ['get_tree', 'delete_instances', 'create_instances'],
    mutatesProject: (result) => (!!result && typeof result === 'object' && typeof (result as Record<string, unknown>).inserted === 'string') || (result as Record<string, unknown> | null)?.projectMutated === true,
    run: (ctx, a) => insertSound.run(studioCall(ctx), a, ctx.discoveredAssetIds),
  },
  play_library_sound: {
    def: playLibrarySound.def,
    studio: true,
    studioOps: ['preview_sound'],
    run: (ctx, a) => playLibrarySound.run(studioCall(ctx), a, ctx.discoveredAssetIds),
  },
  find_vfx: {
    def: findVfxTool.def,
    studio: false,
    run: async (_ctx, a) => findVfxTool.run(a),
  },
  insert_vfx: {
    def: insertVfx.def,
    studio: true,
    studioOps: ['get_tree', 'delete_instances', 'create_instances', 'set_props'],
    mutatesProject: (result) => (!!result && typeof result === 'object' && typeof (result as Record<string, unknown>).inserted === 'string') || (result as Record<string, unknown> | null)?.projectMutated === true,
    run: (ctx, a) => insertVfx.run(studioCall(ctx), a),
  },
  insert_ui_component: {
    def: insertUiComponent.def,
    studio: true,
    studioOps: ['query_instances', 'get_instance', 'create_instances', 'ui_layout_check'],
    mutatesProject: (result) => !!result && typeof result === 'object' && typeof (result as Record<string, unknown>).inserted === 'string',
    run: (ctx, a) => insertUiComponent.run(studioCall(ctx), a, uiImageResolver(ctx.env, ctx.userId)),
  },
  /*
   * THE AUDIO TOOLS, REGISTERED ONE BY ONE ON PURPOSE.
   *
   * These four were first added as `...AUDIO_TOOLS`, which worked perfectly and was wrong:
   * webtools-wiring.test.mjs refuses a spread here, and the reason is in its own comment — three
   * separate guards read THIS LITERAL out of the source to decide what every tool owes the rest of
   * the product. tool-vocabulary.test.mjs (apps/web) holds each name to a written label, so a
   * spread-in tool renders in the Thinking card as `design_sound`; phase-coverage.test.mjs holds it
   * to a phase, so one that is missing falls through to `default: 'building'` and announces that it
   * is building the user's world while it renders a footstep; tools-for-mode.test.mjs holds it to a
   * mode. A spread satisfies every test of the tools themselves and is invisible to all three.
   *
   * The bodies live in audio-tools.ts because their DESCRIPTIONS are the product surface for this
   * cluster — in particular the standing promise that none of this audio reaches the user's Roblox
   * place — and belong beside the modules that enforce it. What has to be here is the name.
   */
  design_sound: {
    def: AUDIO_TOOLS.design_sound!.def,
    studio: AUDIO_TOOLS.design_sound!.studio,
    studioOps: ['get_tree', 'set_props', 'create_instances'],
    mutatesProject: true,
    run: (ctx, a) => AUDIO_TOOLS.design_sound!.run(ctx, a),
  },
  assign_sounds: {
    def: AUDIO_TOOLS.assign_sounds!.def,
    studio: AUDIO_TOOLS.assign_sounds!.studio,
    studioOps: ['get_tree', 'get_instance', 'set_props'],
    mutatesProject: (result) => positiveCount(result, 'assigned'),
    run: (ctx, a) => AUDIO_TOOLS.assign_sounds!.run(ctx, a),
  },
  generate_sound: {
    def: AUDIO_TOOLS.generate_sound!.def,
    studio: AUDIO_TOOLS.generate_sound!.studio,
    run: (ctx, a) => AUDIO_TOOLS.generate_sound!.run(ctx, a),
  },
  speak_line: {
    def: AUDIO_TOOLS.speak_line!.def,
    studio: AUDIO_TOOLS.speak_line!.studio,
    run: (ctx, a) => AUDIO_TOOLS.speak_line!.run(ctx, a),
  },
};

export function toolNames(): string[] {
  return Object.keys(TOOLS);
}

/**
 * Tools that can change the user's Roblox place.
 *
 * This is derived from the same metadata `runTool` uses to decide whether a successful call
 * actually delivered project work. Consumers that need to cover the complete mutation surface
 * (permissions, audits, release guards) must not maintain a second hand-written name list.
 */
export function projectMutatingToolNames(): string[] {
  return Object.entries(TOOLS)
    .filter(([, tool]) => tool.mutatesProject !== undefined)
    .map(([name]) => name);
}

export function toolMutatesProject(name: string, result: unknown): boolean {
  const rule = TOOLS[name]?.mutatesProject;
  return typeof rule === 'function' ? rule(result) : rule === true;
}

/* ------------------------------------------------------------ which thing, though --- */

/** One line beside an activity label, not a paragraph. Long enough for a real Roblox path. */
const TARGET_MAX = 120;

/**
 * Where in the arguments each tool's SUBJECT is. A tool absent from this table has no resource
 * worth naming, and gets none — a guess is worse than silence here, because this string is what a
 * person reads to decide whether the step about to run is the one they meant.
 */
const TARGET_ARG: Readonly<Record<string, { key: string; kind: 'string' | 'list' | 'number' | 'items' | 'moves' }>> = {
  read_script: { key: 'path', kind: 'string' },
  edit_script: { key: 'path', kind: 'string' },
  format_script: { key: 'path', kind: 'string' },
  set_properties: { key: 'path', kind: 'string' },
  edit_terrain: { key: 'action', kind: 'string' },
  get_instance: { key: 'path', kind: 'string' },
  insert_ui_component: { key: 'component', kind: 'string' },
  insert_sound: { key: 'query', kind: 'string' },
  insert_vfx: { key: 'preset', kind: 'string' },
  delete_instances: { key: 'paths', kind: 'list' },
  move_instances: { key: 'moves', kind: 'moves' },
  transform_instances: { key: 'paths', kind: 'list' },
  apply_surface: { key: 'paths', kind: 'list' },
  clone_instances: { key: 'paths', kind: 'list' },
  group_instances: { key: 'paths', kind: 'list' },
  ungroup_instances: { key: 'paths', kind: 'list' },
  rename_instance: { key: 'path', kind: 'string' },
  set_locked: { key: 'paths', kind: 'list' },
  set_visible: { key: 'paths', kind: 'list' },
  select_instances: { key: 'paths', kind: 'list' },
  create_instances: { key: 'items', kind: 'items' },
  install_module: { key: 'name', kind: 'string' },
  insert_asset: { key: 'assetId', kind: 'number' },
  web_fetch: { key: 'url', kind: 'string' },
  browse_page: { key: 'url', kind: 'string' },
  screenshot_page: { key: 'url', kind: 'string' },
  workspace_read: { key: 'path', kind: 'string' },
  workspace_write: { key: 'path', kind: 'string' },
  run_spec: { key: 'path', kind: 'string' },
  search_creation_skills: { key: 'query', kind: 'string' },
  read_creation_skill: { key: 'id', kind: 'string' },
  get_genre_references: { key: 'genre', kind: 'string' },
};

/** Collapse to one line and cap. The target sits beside a label; it may not push the layout. */
function oneLine(v: string): string | undefined {
  const s = v.replace(/\s+/g, ' ').trim();
  if (!s) return undefined;
  return s.length > TARGET_MAX ? `${s.slice(0, TARGET_MAX - 1)}…` : s;
}

/**
 * WHICH THING THIS CALL IS ABOUT, read from the arguments BEFORE it runs.
 *
 * `tool_start` used to broadcast the bare tool name, and the sentence naming the script or the
 * instances only arrived at `tool_end` — after the write. For the whole time a step was running,
 * the one question a person has about it had no answer on screen, and by the time it did the thing
 * was already changed.
 *
 * ARGUMENTS ARE MODEL-AUTHORED. Malformed JSON, a missing key, a wrong type and a 40KB string are
 * all reachable, and this runs inside the step loop: a throw here ends a paid run at the moment it
 * was about to do the work. So every path returns `undefined` rather than raising, and the result
 * is collapsed to one capped line before anything renders it.
 */
export function targetOf(tool: string, argsJson: unknown): string | undefined {
  const spec = TARGET_ARG[tool];
  if (!spec) return undefined;
  let args: unknown;
  try {
    args = typeof argsJson === 'string' ? JSON.parse(argsJson) : argsJson;
  } catch {
    return undefined;
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) return undefined;
  const raw = (args as Record<string, unknown>)[spec.key];

  if (spec.kind === 'string') return typeof raw === 'string' ? oneLine(raw) : undefined;
  if (spec.kind === 'number') return typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : typeof raw === 'string' ? oneLine(raw) : undefined;

  const names: string[] =
    spec.kind === 'list'
      ? (Array.isArray(raw) ? raw : []).filter((v): v is string => typeof v === 'string')
      : spec.kind === 'moves'
        ? (Array.isArray(raw) ? raw : [])
            .map((it) => (it && typeof it === 'object' ? (it as { path?: unknown }).path : null))
            .filter((v): v is string => typeof v === 'string')
        : (Array.isArray(raw) ? raw : [])
            .map((it) => (it && typeof it === 'object' ? (it as { name?: unknown }).name : null))
            .filter((v): v is string => typeof v === 'string');

  const cleaned = names.map((n) => n.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!cleaned.length) return undefined;
  // Three, then a count. Twelve paths on one line is noise; "+9 more" is the honest summary of the
  // rest, and it keeps the number visible — which is the part that says how big this step is.
  const shown = cleaned.slice(0, 3).join(', ');
  const rest = cleaned.length - 3;
  return oneLine(rest > 0 ? `${shown} +${rest} more` : shown);
}

/**
 * Tools the model may call, given what this deployment can actually do.
 *
 * THIS USED TO TAKE AN `assetLibrary` FLAG, and the flag is gone with the thing it gated. It
 * removed `search_asset_library` on deployments where the catalogue tables had never been created,
 * so the model was not offered a tool whose every call answered `no such table`. On 2026-09-20 the
 * catalogue was removed outright — there is no deployment where that tool exists — so a parameter
 * for "does this deployment have a library" would now have exactly one answer, and a caller
 * passing `true` would be asking for a tool that is not in `TOOLS` at all.
 */
/**
 * THE FOCUSED TOOLSET (owner, 2026-10-01: fast and token-cheap). Every tool definition rides on every step, so the
 * heavy, rarely needed ones wait behind more_tools: sound synthesis and voice, image generation, terrain, saved-game copying,
 * web research, the workspace store, and the UI builders the studded theme replaces.
 * Everything a build needs stays offered. A run that needs a deferred tool calls more_tools once.
 */
/**
 * The deferred tools by need, so a run that wants terrain pays for the terrain definitions and not for sound, web and
 * the rest (more_tools {names}). Every deferred tool is in exactly one group (tests/more-tools-by-need.test.mjs).
 */
export const DEFERRED_GROUPS: Readonly<Record<string, readonly string[]>> = {
  sound: ['generate_sound', 'design_sound', 'speak_line', 'assign_sounds'],
  image: ['generate_image', 'generate_ui_image_hf', 'upload_ui_asset', 'compose_thumbnail'],
  terrain: ['edit_terrain', 'shape_terrain', 'read_terrain'],
  models: ['generate_model', 'generate_model_external'],
  web: ['web_fetch', 'browse_page', 'web_search', 'screenshot_page', 'github_lookup'],
  code: ['git_history', 'review_scripts', 'format_script', 'find_symbol', 'run_spec', 'collision_groups', 'library_code'],
  workspace: ['workspace_list', 'workspace_read', 'workspace_write'],
  ui: ['build_ui', 'insert_ui_component'],
};
export const DEFERRED_TOOLS: ReadonlySet<string> = new Set(Object.values(DEFERRED_GROUPS).flat());
export function offeredWhenFocused(tool: string, unlocked?: readonly string[]): boolean { return !DEFERRED_TOOLS.has(tool) || unlocked?.includes(tool) === true; }

/** The deferred tools a more_tools request names: a tool name, or a group name for all of its tools. Anything else is `unknown`. */
export function resolveDeferred(names: readonly string[]): { tools: string[]; unknown: string[] } {
  const tools = new Set<string>();
  const unknown: string[] = [];
  for (const raw of names.slice(0, 20)) {
    const name = raw.trim().toLowerCase();
    const group = Object.prototype.hasOwnProperty.call(DEFERRED_GROUPS, name) ? DEFERRED_GROUPS[name] : undefined;
    if (group) for (const t of group) tools.add(t);
    else if (DEFERRED_TOOLS.has(name)) tools.add(name);
    else unknown.push(raw.slice(0, 40));
  }
  return { tools: [...tools], unknown };
}

export function toolDefs(studioConnected: boolean, allowed?: Set<string>): GatewayToolDef[] {
  return Object.entries(TOOLS)
    .filter(([name, t]) => (studioConnected || !t.studio) && (!allowed || allowed.has(name)))
    .map(([, t]) => t.def);
}

/**
 * The largest structured result we will hand to the browser.
 *
 * The `detail` payload exists so the web app's typed generative-UI validator
 * has something real to validate — before this it was always undefined, which
 * silently made the entire component registry dead outside mock mode. It is
 * capped independently of MAX_RESULT_CHARS because the two limits protect
 * different things: that one protects the model's context, this one protects
 * the WebSocket.
 */
const MAX_DETAIL_CHARS = 24_000;

/**
 * The cap for an explicit UI payload, which is a different thing from a derived one.
 *
 * MAX_DETAIL_CHARS protects the socket from tool results that are ALSO re-sent to the model every
 * step. An evidence panel is sent once, on one tool row, and carries an encoded image. The socket
 * already streams 200KB playtest frames (frame-bus.ts), so the constraint here is "one screenshot,
 * not a gallery" rather than "keep it tiny".
 */
const MAX_UI_DETAIL_CHARS = 96_000;

function capUiDetail(value: unknown): unknown {
  try {
    return JSON.stringify(value).length > MAX_UI_DETAIL_CHARS ? undefined : value;
  } catch {
    return undefined;
  }
}

/**
 * Structured results are forwarded to the UI, plain strings are not.
 *
 * A tool that returns a bare string has nothing a component could render, and
 * an `error` result is already conveyed by `ok: false` plus the summary. Only
 * objects that carry actual structure are worth sending.
 */
function detailForUi(result: unknown): unknown {
  if (typeof result !== 'object' || result === null) return undefined;
  if ('error' in (result as Record<string, unknown>)) return undefined;
  // Cheap size guard: serialise once and drop anything oversized rather than
  // truncating it into invalid JSON that the validator would reject anyway.
  let encoded: string;
  try {
    encoded = JSON.stringify(result);
  } catch {
    return undefined;
  }
  if (encoded.length > MAX_DETAIL_CHARS) return undefined;
  return result;
}

/**
 * Arguments that are one whole JSON object with nothing but stray closing brackets after it, or with trailing commas,
 * read as that object; anything else is still refused. Live 2026-10-01: a complete build_object spec followed by one
 * extra "}" was thrown away, and the keyboard cost 22 credits instead of 10. Pure.
 */
export function recoverJsonObject(text: string): Record<string, unknown> | undefined {
  const tryParse = (t: string) => { try { const v = JSON.parse(t); return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : undefined; } catch { return undefined; } };
  const start = text.indexOf('{');
  if (start < 0 || text.slice(0, start).trim()) return undefined;
  // The end of the first top-level object, strings respected.
  let depth = 0, inString = false, escaped = false, end = -1;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') inString = false; continue; }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  const noTrailingCommas = (t: string) => t.replace(/,(\s*[}\]])/g, '$1');
  // A backslash key written bare, "\" inside a list, ends its string early (round 13 of the owner's test 1, 2026-10-01:
  // two build_object specs refused, 17 credits for a 10-credit keyboard). Read as the one-backslash string it meant.
  const bareBackslash = (t: string) => t.replace(/"\\"(\s*[,\]])/g, '"\\\\"$1');
  if (end >= 0 && /^[\s}\]]*$/.test(text.slice(end + 1))) {
    const body = text.slice(start, end + 1);
    const parsed = tryParse(body) ?? tryParse(noTrailingCommas(body));
    if (parsed) return parsed;
  }
  // The bare backslash also unbalances the scan above (its string never closes), so it is tried on the whole text.
  const fixed = bareBackslash(text.trim());
  return fixed !== text.trim() ? recoverJsonObject(fixed) : undefined;
}

export async function runTool(
  ctx: AgentCtx,
  name: string,
  argsJson: string,
): Promise<{ summary: string; resultForLlm: string; ok: boolean; detail?: unknown; mutatedProject?: boolean; retryable?: boolean }> {
  const impl = TOOLS[name];
  if (!impl) return { summary: `unknown tool ${name}`, resultForLlm: JSON.stringify({ error: `unknown tool: ${name}` }), ok: false };
  if (impl.studio && !ctx.studioConnected()) {
    return { summary: `${name}: Studio not connected`, resultForLlm: JSON.stringify({ error: 'Roblox Studio is not connected right now — the StudPilot plugin is not answering. It is not a limit of this mode. Tell the user to reconnect Studio from the StudPilot panel, and do not claim any Studio change you did not see succeed.' }), ok: false };
  }
  // UNPARSEABLE ARGUMENTS ARE NOT ABSENT ARGUMENTS. This used to swallow the parse error and
  // continue with `{}`, so `'{not json'` reached web_fetch and came back as
  // `web_fetch: url is required` — which tells the model to ADD A URL to a string that was never
  // read. It would then send the same malformed payload with a url appended and get the same
  // answer forever. A failure to read the arguments must not render as a reading of them.
  let args: Record<string, unknown> = {};
  if (argsJson) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(argsJson);
    } catch (err) {
      parsed = recoverJsonObject(argsJson);
    }
    if (parsed === undefined) {
      let why = 'unreadable';
      try { JSON.parse(argsJson); } catch (err) { why = err instanceof Error ? err.message : String(err); }
      return {
        summary: `${name}: arguments are not valid JSON`,
        resultForLlm: JSON.stringify({
          error: `${name}: the arguments are not valid JSON and were not run — ${why}`,
        }),
        ok: false,
      };
    }
    // `"3"`, `null` and `[1,2]` all parse. None of them is an argument object, and spreading them
    // into a tool gives it a shape it never declared rather than telling it what arrived.
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        summary: `${name}: arguments are not an object`,
        resultForLlm: JSON.stringify({
          error: `${name}: the arguments must be a JSON object, got ${Array.isArray(parsed) ? 'an array' : parsed === null ? 'null' : typeof parsed}`,
        }),
        ok: false,
      };
    }
    args = parsed as Record<string, unknown>;
  }
  // ONE PATH SPELLING for every Studio tool: `Workspace.Lamp` means `game.Workspace.Lamp` here as it does in create_instances.
  if (impl.studio) args = normaliseStudioPaths(args);
  try {
    ctx.uiDetail = undefined; // never let one tool's panel leak into the next tool's row
    ctx.evidenceRaw = undefined; // …nor one tool's raw payload into the next tool's ledger entry
    let result = await impl.run(ctx, args);
    // Sources the result named, numbered for the whole run, so the answer can cite them as [n].
    const fresh = ctx.addSources ? runSourcesIn(name, result) : [];
    if (fresh.length && result && typeof result === 'object' && !Array.isArray(result) && !('error' in (result as Record<string, unknown>))) {
      const ns = ctx.addSources!(fresh);
      result = { ...(result as Record<string, unknown>), cite: fresh.map((s, i) => `[${ns[i]}] ${s.title} ${s.url}`) };
    } else if (fresh.length && Array.isArray(result)) {
      const ns = ctx.addSources!(fresh);
      result = { results: result, cite: fresh.map((s, i) => `[${ns[i]}] ${s.title} ${s.url}`) };
    }
    const failed = typeof result === 'object' && result !== null && 'error' in (result as Record<string, unknown>);
    // A failed tool is logged for the developers (worker logs; wrangler tail), never shown to the user as it is.
    if (failed) console.warn('[tool-failed]', name, String((result as { error?: unknown }).error ?? '').slice(0, 400));
    const partialMutation = failed && (result as Record<string, unknown>).projectMutated === true;
    //[[ RETRYABLE ONLY WHEN NOTHING WAS APPLIED. `retryable` comes from op-failure.ts's verdict on
    //   the LAST op a tool ran. A composite that already changed Studio before that op failed is
    //   not safe to repeat whole, whatever its last op says, so the mark is dropped there. ]]
    const retryable = failed && !partialMutation && (result as Record<string, unknown>).retryable === true;
    // Composite tools can fail after an earlier sub-operation already changed Studio. That marker
    // is bookkeeping for SessionDO, not model-visible payload, so strip it before serialisation —
    // and `retryable` with it, which the model already reads in words as `retry`.
    const visibleResult = failed && typeof result === 'object' && result !== null &&
      ('projectMutated' in (result as Record<string, unknown>) || 'retryable' in (result as Record<string, unknown>))
      ? Object.fromEntries(Object.entries(result as Record<string, unknown>).filter(([key]) => key !== 'projectMutated' && key !== 'retryable'))
      : result;
    let str = typeof visibleResult === 'string' ? visibleResult : JSON.stringify(visibleResult);
    const resultLimit = name === 'read_script' || name === 'find_library_model' ? MAX_SCRIPT_RESULT_CHARS : MAX_RESULT_CHARS;
    if (str.length > resultLimit) str = str.slice(0, resultLimit) + `\n...[truncated ${str.length - resultLimit} chars]`;
    const mutatedProject = partialMutation || (!failed && toolMutatesProject(name, result));
    // An explicit UI payload wins. It is capped separately and more generously than the derived
    // one: this socket already carries 200KB playtest frames, so a single ~25KB evidence panel per
    // build is not what needs protecting — a 24KB cap sized for re-sent tool results is.
    const detail = ctx.uiDetail !== undefined ? capUiDetail(ctx.uiDetail) : detailForUi(visibleResult);
    // THE LEDGER. What this call did, as evidence for the self-check. A change that failed is recorded as a failed
    // attempt (it moves nothing); one that failed after part of it landed still counts as a change.
    if (ctx.evidence) {
      const kind: ToolRecord['kind'] | null = impl.mutatesProject !== undefined
        ? (mutatedProject || failed ? 'mutation' : 'read')
        : impl.studio ? (phaseForTool(name) === 'playtesting' ? 'play' : 'read') : null;
      if (kind) {
        recordToolCall(ctx.evidence, {
          tool: name, kind, args, result: visibleResult, ok: !failed,
          ...(partialMutation ? { partial: true } : {}),
          extra: ctx.evidenceRaw !== undefined ? ctx.evidenceRaw : kind === 'read' ? ctx.uiDetail : undefined,
        });
      }
    }
    ctx.evidenceRaw = undefined;
    ctx.uiDetail = undefined;
    return {
      summary: impl.plainSummary
        ? scrubEngineIdentity(impl.plainSummary(args, visibleResult, failed)).replace(/\s+/g, ' ').slice(0, MAX_SUMMARY_CHARS)
        : summarize(name, args, failed, failed ? (visibleResult as Record<string, unknown>).error : undefined),
      resultForLlm: str,
      ok: !failed,
      detail,
      ...(mutatedProject ? { mutatedProject: true } : {}),
      ...(retryable ? { retryable: true } : {}),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    /* §1: provider and model identity are implementation details and must not
       reach a normal user. This catch used to put the RAW exception into the
       summary, which is broadcast as `tool_end.summary` and rendered verbatim in
       the Thinking card — so a Workers AI failure surfaced to anyone with an
       ordinary account as:

         generate_image failed: AiError: 3040: Request failed for model
         @cf/black-forest-labs/flux-1-schnell on ...

       naming both the model and the provider. The raw text still goes to the
       server log, where admin/diagnostics can read it; what crosses the boundary
       to the user and to the model is scrubbed. */
    console.error(`[tool:${name}] ${msg}`);
    return { summary: `✗ ${name}`, resultForLlm: JSON.stringify({ error: scrubEngineIdentity(msg) }), ok: false };
  }
}

/**
 * Strip anything that names the engine behind StudPilot.
 *
 * Deliberately a denylist of shapes rather than an allowlist of safe text. An
 * allowlist would also drop the actionable half of an error — "Studio
 * disconnected", "asset not found" — and make the model worse at recovering from
 * a failure it could otherwise handle. The shapes below cover every id this
 * worker can emit: Workers AI model paths are always `@cf/vendor/model`, and the
 * token-billed providers have fixed names.
 *
 * Adding a provider means adding it here. The security suite asserts that a tool
 * error carrying a model id does not survive this function.
 */
export function scrubEngineIdentity(msg: string): string {
  return msg
    .replace(/@cf\/[\w.-]+\/[\w.-]+/g, 'the engine')
    .replace(/\bfor model\s+\S+/gi, 'for the engine')
    .replace(/\b(?:workers-ai|openai|google|deepseek|anthropic|gemini|gpt-[\w.-]+|glm-[\w.-]+)\b/gi, 'the engine')
    .replace(/\bAiError\b/g, 'EngineError')
    .slice(0, 300);
}

/**
 * The row one line long: what ran, on what, and — when it failed — WHY.
 *
 * The reason used to be missing, and the omission was not visible from here. MEASURED against
 * production 2026-09-20T23:38Z, the first tool row of a real run read `✗ propose_plan` and carried
 * no `detail`; the sentence `readProposedPlan` had written for exactly this moment ("step 2 names
 * the tool \"edit_scripts\", which does not exist") went into `resultForLlm`, which only the model
 * reads. The person watching the Thinking card was shown that something failed and told nothing
 * about what — an observation-shaped rendering of a failure to observe, which is the defect class
 * this repository exists to refuse.
 *
 * SCRUBBED, because part of this string is now chosen by the model. Tool refusals quote their own
 * arguments back ("names the tool X"), so a model that puts an engine id in an argument would put
 * it in front of a user; `scrubEngineIdentity` is on this path for that reason and not as ceremony.
 *
 * BOUNDED AS A WHOLE, not just the reason. `tool_end.summary` is rendered verbatim on one line in
 * apps/web's activity panel, and the length of a refusal is partly the model's to choose.
 *
 * NOT extended to `runTool`'s catch branch on purpose. That text is an unexpected exception rather
 * than a sentence written for a reader, and the comment there records what it cost to learn that
 * raw exception text must not cross this boundary.
 */
const MAX_SUMMARY_CHARS = 200;

function summarize(name: string, args: Record<string, unknown>, failed: boolean, reason?: unknown): string {
  const target = (args.path ?? args.query ?? args.root ?? args.label ?? args.fact ?? '') as string;
  const t = typeof target === 'string' && target ? ` · ${target.slice(0, 60)}` : '';
  const head = `${failed ? '✗' : '✓'} ${name}${t}`;
  if (!failed || typeof reason !== 'string') return head;
  const why = scrubEngineIdentity(reason).replace(/\s+/g, ' ').trim();
  // A reason with no room left to be read is worse than none: it would end mid-word and still push
  // the subject off the row.
  const room = MAX_SUMMARY_CHARS - head.length - 3;
  if (!why || room < 24) return head;
  return `${head} — ${why.length > room ? why.slice(0, room - 1) + '…' : why}`;
}
