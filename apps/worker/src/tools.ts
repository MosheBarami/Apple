// Agent tool definitions + dispatcher. Tools either talk to Studio (via the session DO's
// op queue) or run worker-side (docs search, memory, checkpoints).
import { renderShowsTerrain } from '@golem/shared';
import { isOutdoorRequest } from './worldbuilding';
import { floatingIslandKit } from './scene-kits';
import { expandTerrainRecipe, TERRAIN_RECIPES } from './terrain-recipes';
import type { Env } from './env';
import { generatedImageCapacity, saveGeneratedImage } from './generated-images';
import { rgbBase64ToDataUrl, decodeRgbBase64, encodePng, bytesToBase64 } from './png';
import { retryHint, remedyHint, retryEligibility } from './op-failure';
import { VERIFIER_TOOLS, APPENDED_VERIFIER_PREFERENCE, PLANNER_TOOL } from './verifiers';
import { normaliseItems, normaliseProps } from './studio-props';
import type { GatewayToolDef, StudioOp, OpResult, CheckpointMeta, RenderViewResult, StudioFrame, AssetSourcePolicy, InstanceSpec, PropValue } from '@golem/shared';
import { RENDER_VIEWS } from '@golem/shared';
import { searchDocsDetailed } from './rag';
import { critiqueViews, critiqueToText, type VisualCritique } from './vision';
import { allowedSources, sourceRefusal, provenanceRefusal } from './asset-policy';
import {
  chooseAssetSource,
  verifyCreatorStoreAsset,
  findVerifiedAssets,
  scanInsertedHierarchy,
  summariseTree,
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
import { refuseGeneratedModel, refuseHandMadeModel, refuseHandMadeModelLuau } from './model-rule';
import { insertUiComponent, refuseUiLook, uiImageResolver, UI_RULE } from './ui-components';
import { FX_RULE, findSound, findVfxTool, insertSound, insertVfx, playLibrarySound, refuseSoundId } from './fx-library';
import { findLibraryModels, handBuiltPropRefusal, libraryModel, LIBRARY_GENRES, LIBRARY_KINDS, MAX_UPLOADS_PER_RUN, placeInserted, uploadLibraryModel } from './model-library';
import { ensureProvenanceTables, recordAssetUse } from './provenance';
import { MOODS, PALETTES, type RGB } from './worldbuilding';
import { EFFECTS, EFFECT_NAMES, effectCatalogue, effectInstanceSpecs, parseInstancePath } from './effects';
import { auditCaptureFromTree, auditMetrics, lensCoverage, runnableLenses } from './build-audit';
import { formatPanelReport, runCriticPanel } from './critic';
import { criticInputFromRender } from './critic-input';
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
import { chat } from './gateway';
import {
  searchInstances, setPropertiesBulk, spatialQuery, scatterInstances, collisionGroups, shapeTerrain, readTerrain,
  createRig, checkUiLayout, buildUi, playCheckUiOp, PLAY_CHECK_UI_DEF, type OpCall,
} from './phase-a-tools';

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
   * Put the asset-source question to whoever is here, and say whether anybody was (F-059). Called
   * by a refusal only while the answer is owed; it never allows anything. Absent in the eval
   * harness, which then gets the unasked refusal.
   */
  askAssetSources?: () => boolean;
  /**
   * The user the run acts for: the project owner (`bind.ownerId`, recorded on the run as `userId`).
   * `generate_model_external` creates its Model in this user's own Roblox account with their
   * connected key. Optional because the eval harness and the admin route have no run and no user;
   * a tool that needs one refuses without it.
   */
  userId?: string;
  studioConnected(): boolean;
  execStudioOp(op: StudioOp, timeoutMs?: number): Promise<OpResult>;
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
  /** last render/critique produced this run, so the loop can escalate reasoning on a failure */
  lastRender?: RenderViewResult;
  lastCritique?: VisualCritique;
  /**
   * A payload for the BROWSER only, never for the model.
   *
   * `detailForUi` derives the UI payload from the model-facing result, which is why the visual
   * tools could never show anything: their result is deliberately image-free, because tool results
   * are re-sent to the model on every later step and a frame is ~207KB of base64 RGB. The pixels
   * therefore stayed in `lastRender` on the server and the user never saw what the critic saw —
   * a verification step whose evidence is invisible is indistinguishable from one that did not run.
   *
   * A tool sets this when it has something to SHOW that must not be something to READ. `runTool`
   * prefers it over the derived detail, so the two payloads can differ by construction rather than
   * by a size cap accidentally dropping one of them.
   */
  uiDetail?: unknown;
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
   * `libraryAssetIds`, holding the ids that came out of Apple's curated catalogue, and membership
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
   * `run_spec` against a plugin that reports `run_code` unsupported passed, and the appended
   * `inspect_visually` was announced to a Studio that cannot render; each step then came back
   * "unavailable" at the cost of a paid step and stayed pending forever. Optional because the eval
   * harness and the admin `/run-tool` route have no run: absent means the registry, which is the
   * honest answer when nothing narrowed anything.
   */
  offeredTools?: ReadonlySet<string>;
  /**
   * How `propose_plan` has fared so far in this run. The run loop carries it across steps (it
   * rebuilds this context every step) and reads it back after each call. See PlanState.
   */
  planState?: PlanState;
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

const S = (props: Record<string, unknown>, required: string[] = []): unknown => ({
  type: 'object',
  properties: props,
  required,
});

interface ToolImpl {
  def: GatewayToolDef;
  studio: boolean; // requires studio connection
  /** Studio operations this tool may require. Every `studio: true` registry entry must name them. */
  studioOps?: readonly StudioOp['op'][];
  /**
   * Whether a successful call means the user's Roblox place changed.
   *
   * A function is used for tools that can succeed as a no-op (format/install/remove/assign). This
   * is the run loop's source of truth for "did I actually build anything?"; keeping it beside the
   * implementation prevents SessionDO from accumulating another hand-maintained tool-name list.
   */
  mutatesProject?: boolean | ((result: unknown) => boolean);
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

function boundedPaths(value: unknown, label = 'paths'): string[] | { error: string } {
  if (!Array.isArray(value) || value.length === 0 || value.length > DIRECT_EDIT_LIMITS.items) {
    return { error: `${label} must contain 1-${DIRECT_EDIT_LIMITS.items} instance paths` };
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index++) {
    const path = boundedPath(value[index], `${label}[${index}]`);
    if (typeof path !== 'string') return path;
    if (seen.has(path)) return { error: `${label} contains the same path more than once: ${path}` };
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
  inspect_visually: 'Check the result looks right',
  check_composition: 'Check the result looks right',
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
  //   `inspect_visually`, including against a Studio whose plugin reports `render_view`
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

async function runTerrainEdits(ctx: AgentCtx, a: Record<string, unknown>): Promise<unknown> {
  if (typeof a.recipe === 'string') {
    const expanded = expandTerrainRecipe(a.recipe, a);
    if ('error' in expanded) return expanded;
    const res = await runTerrainEdits(ctx, { operations: expanded.operations });
    return toolError(res) ? res : { ...(res as Record<string, unknown>), ...expanded.facts };
  }
  const { operations, ...single } = a;
  if (operations === undefined) {
    if (typeof single.action !== 'string') return { error: 'edit_terrain needs an action, or operations: [...]' };
    return op(ctx, { ...single, op: 'terrain_edit' } as StudioOp);
  }
  if (!Array.isArray(operations) || operations.length === 0) return { error: 'operations must be a non-empty array of terrain actions' };
  if (operations.length > MAX_TERRAIN_BATCH) {
    return { error: `operations holds ${operations.length} actions; the limit is ${MAX_TERRAIN_BATCH} per call — split it` };
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
  const lines: string[] = [];
  let used = 0;
  let total = 0;
  let firstHidden: string | undefined;
  const walk = (node: StudioTreeNode, depth: number) => {
    total += 1;
    const name = node.name ?? node.path?.split('.').pop() ?? '?';
    const unfetched = Number((node as { moreChildren?: unknown }).moreChildren) || 0;
    const line = `${'  '.repeat(depth)}${name} (${node.class ?? '?'})${unfetched > 0 ? ` +${unfetched} more children not fetched` : ''}`;
    if (used + line.length + 1 <= budget) {
      lines.push(line);
      used += line.length + 1;
    } else if (!firstHidden) {
      firstHidden = node.path ?? name;
    }
    for (const child of node.children ?? []) walk(child, depth + 1);
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

/** Two decimals, without the trailing zeros that make a property panel read like a spreadsheet. */
function round2(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

//[[ EXPORTED SO THAT NOTHING HAS TO KEEP A SECOND COPY OF IT.
//   A tool that must fit inside this cap is passed the cap, and the test that proves it fits reads
//   it from here. The deleted check-harvest-licences learned the same lesson the expensive way: its
//   first version restated the rules it was checking and got one wrong immediately. ]]
export const MAX_RESULT_CHARS = 3000; // tool output is re-sent every later step, so keep it tight

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
 * Studio settings page that does not exist rather than naming the button in the Apple panel. `retry`
 * answers "may I do this again"; `fix` answers "what does the PERSON do", and a refusal is precisely
 * the case where those two have different answers. See remedyHint in op-failure.ts.
 */
/** The Studio channel as phase-a-tools.ts sees it: the same `op`, bound to this run. */
const studioCall = (ctx: AgentCtx): OpCall => (studioOp, timeoutMs) => op(ctx, studioOp, timeoutMs);
/** Item arrays a vetted kit in this file built (D-FXLIB-1): create_instances lets their emitters through. Arguments the model writes are never in it. */
const LIBRARY_BUILT = new WeakSet<object>();

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
  if (!data?.views?.length) return { error: 'the renderer returned no views' };
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

/**
 * Insert one verified id and prove the place clean afterwards, or leave the place as it was found.
 *
 * Returns a tool result: small, and free of any line of the source it removed. An attacker's Luau
 * belongs in the audit trail, not in the model's transcript where it becomes an instruction.
 */
async function insertAndProveClean(ctx: AgentCtx, assetId: number, parent: string): Promise<unknown> {
  const inserted = await ctx.execStudioOp({ op: 'insert_asset', assetId, parent }, 45_000);
  if (!inserted.ok) return { error: inserted.error ?? 'insert_asset failed' };
  const raw = rec(inserted.data).inserted;
  const paths = (Array.isArray(raw) ? raw : []).filter((p): p is string => typeof p === 'string');
  if (!paths.length) return { error: `asset ${assetId} inserted nothing — nothing was added to the place` };

  /** Remove the whole asset and refuse. Never leaves the place in the state the scan objected to. */
  const discard = async (why: string): Promise<unknown> => {
    const del = await ctx.execStudioOp({ op: 'delete_instances', paths }, 20_000);
    return {
      error: `asset ${assetId} was inserted, refused and removed: ${why}`,
      ...(del.ok
        ? { removedWholeAsset: paths }
        : { removeFailed: del.error ?? 'delete failed', manualCleanupRequired: paths, projectMutated: true }),
    };
  };

  // 1. Enumerate. A subtree that cannot be walked is a subtree whose contents are unknown, and
  //    unknown is never scored as empty.
  const classes: string[] = [];
  let enumerationFailed = false;
  for (const p of paths) {
    const tree = await ctx.execStudioOp({ op: 'get_tree', root: p, maxDepth: 12, maxNodes: 400 }, 20_000);
    if (!tree.ok) {
      enumerationFailed = true;
      continue;
    }
    const sum = summariseTree(tree.data);
    classes.push(...sum.classes);
    if (sum.truncated) enumerationFailed = true;
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
  const scan = scanInsertedHierarchy({ rootPath: paths[0] as string, scripts, instanceClasses: classes, enumerationFailed });
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

  return {
    assetId,
    inserted: paths,
    scan: scan.verdict,
    // Codes and one-line reasons only. An excerpt of the removed Luau would put the attacker's text
    // into the transcript, where the model reads it as prose.
    stripped: scan.scripts
      .filter((s) => s.action === 'remove')
      .map((s) => ({ path: s.path, class: s.className, severity: s.severity, why: [...new Set(s.findings.map((f) => f.code))].join(', ') })),
    ...(scan.findings.length ? { notes: scan.findings.slice(0, 6).map((f) => `${f.severity} ${f.code}: ${f.message}`) } : {}),
    proven: `re-listed after removal: zero scripts remain under ${paths.join(', ')}`,
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
//     here; it is bounded by the user owning and reading the scripts Golem writes.
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
 * and Apple knows nothing about its licence beyond what the Creator Store said when it was gated.
 *
 * It is therefore keyed `unaccounted:roblox:<id>`, which contains a colon and can never satisfy
 * the provenance id pattern, so `provenance.ts`'s left join always misses and the credits panel
 * renders it as provenance-unknown. That is the one state `provenance: null` exists to express,
 * and it is what the customer should see: Apple placed this, and cannot tell you who made it.
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

/* --------------------------------------------- the web tools' two capabilities ---
 *
 * webtools.ts holds the contracts, the allowlists and the failure shapes, and it deliberately
 * imports nothing heavy — it can be loaded and exercised on its own. The two capabilities that
 * genuinely need the rest of this worker are wired in here instead: reading text out of an image
 * (the vision model, through the gateway that budgets and attributes it) and putting a captured
 * image in front of the user (KV storage plus the panel `generate_image` already uses).
 *
 * Both are OPTIONAL on the web-tool context and both have a defined absence. That is the point of
 * injecting them: the tools stay testable without a model call, and a missing capability is
 * reported as one rather than showing up as an empty transcription or an invisible screenshot.
 */
const OCR_SCHEMA = {
  name: 'image_text',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['text'],
    properties: { text: { type: 'string', maxLength: 4000 } },
  },
};

const OCR_PROMPT =
  'You transcribe text from images. Return ONLY the characters that are actually visible, in reading order, '
  + 'preserving line breaks. Never translate, never summarise, never describe the picture, and never guess at '
  + 'text that is too small or too blurred to read. If the image contains no legible text, return an empty string.';

/** Tolerant of a model that wraps its JSON in a fence, strict about what it must contain. */
function parseOcr(raw: string): { text: string } | { error: string } {
  const body = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { error: 'the transcription came back as something other than JSON' };
  }
  const text = (parsed as { text?: unknown } | null)?.text;
  // A missing field is NOT an empty transcription. Defaulting it to '' here is precisely the
  // failure-as-observation shape: "the engine answered in a form we could not read" would reach
  // the model as "this image has no text in it".
  if (typeof text !== 'string') return { error: 'the transcription had no text field' };
  return { text };
}

async function readImageText(env: Env, dataUrl: string, opts: { language: string }): Promise<{ text: string } | { error: string }> {
  const hint = opts.language === 'auto' ? '' : ' The text is expected to be in English.';
  try {
    const res = await chat(
      env,
      {
        model: 'vision',
        messages: [
          { role: 'system', content: OCR_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Transcribe the text in this image.${hint}` },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        jsonSchema: OCR_SCHEMA,
        maxTokens: 1200,
        // STATED, not inherited. `vision` carries `reasoningEffort: 'low'` in the model table
        // (gateway.ts:139-145) and this call passed nothing, so OCR was getting 'low' by accident
        // of the default — while the visual critic on the SAME model states 'high' at
        // vision.ts:328 with its own argument. Change the table for the critic's sake and
        // transcription would move with it, silently, for a reason that has nothing to do with
        // transcription. 'low' is right here on its own merits: reading the characters that are in
        // a picture is not a judgement, and vision.ts records that the critic at 'medium' spent its
        // whole budget reasoning and returned an empty string.
        reasoningEffort: 'low',
      },
      { kind: 'visual:ocr', cacheTtl: 0 },
    );
    return parseOcr(res.text ?? '');
  } catch (e) {
    // Scrubbed for the same reason every other tool error is: the engine's identity must not cross
    // this boundary, and the actionable half of the message still does.
    return { error: scrubEngineIdentity(e instanceof Error ? e.message : String(e)) };
  }
}

/** The AgentCtx a web tool sees. Capabilities are attached only where they can actually work. */
function webCtx(ctx: AgentCtx): WebToolCtx {
  return {
    env: ctx.env,
    projectId: ctx.projectId,
    fetchImpl: ctx.webFetch,
    workspace: ctx.workspace,
    readTextFromImage: (dataUrl, opts) => readImageText(ctx.env, dataUrl, opts),
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

export const TOOLS: Record<string, ToolImpl> = {
  get_project_tree: {
    def: {
      name: 'get_project_tree',
      description: 'Snapshot of the game instance tree (names, classes, child counts). Start here to understand a project.',
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
        'Read full source of a script by path. The reply carries `baseHash`: pass it back as `base_hash` on edit_script and the write is refused rather than overwriting a change someone made in Studio in between.',
      parameters: S({ path: { type: 'string' } }, ['path']),
    },
    studio: true,
    studioOps: ['read_script'],
    run: (ctx, a) => op(ctx, { op: 'read_script', path: String(a.path ?? '') }),
  },
  edit_script: {
    def: {
      name: 'edit_script',
      description:
        'Create or edit a script. Provide exactly one of `source` (full new content), `edits` (find/replace list, exact match), or `source_file` (an exact saved .lua/.luau workspace version). To create a new script set `create_class` + `create_parent`. ' +
        'The result is parsed BEFORE it is written: a body that does not compile is refused and nothing is changed. Pass `base_hash` from read_script to also refuse a write over a concurrent Studio edit.',
      parameters: S(
        {
          path: { type: 'string', description: 'Full path, e.g. game.ServerScriptService.RoundManager' },
          source: { type: 'string' },
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
      // D-UIONLY-1: a script may use inserted UI but not make more UI than it already did.
      const handMadeUi = refuseLibraryLuau(luauScanVariants(after), UI_RULE, before === null ? undefined : luauScanVariants(before));
      if (handMadeUi) return handMadeUi;
      // D-FXLIB-1: the same for Sounds and particle effects, which come from insert_sound / insert_vfx.
      const handMadeFx = refuseLibraryLuau(luauScanVariants(after), FX_RULE, before === null ? undefined : luauScanVariants(before));
      if (handMadeFx) return handMadeFx;

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
      const warnings = review.findings.filter((f) => f.severity !== 'error').slice(0, 3);
      return {
        ...(res as Record<string, unknown>),
        added: stat.added,
        removed: stat.removed,
        ...(sourceFile ? { sourceFile } : {}),
        ...(warnings.length ? { warnings: warnings.map((f) => `line ${f.line}: ${f.rule} — ${f.detail}`) } : {}),
      };
    },
  },
  search_scripts: {
    def: { name: 'search_scripts', description: 'Search all script sources for a string. Returns matches with paths and line numbers. For a NAME rather than a substring, find_symbol resolves scope and search_scripts does not.', parameters: S({ query: { type: 'string' } }, ['query']) },
    studio: true,
    studioOps: ['search_scripts'],
    run: (ctx, a) => op(ctx, { op: 'search_scripts', query: String(a.query ?? ''), maxResults: 40 }),
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
        'Create instances (parts, models, UI, folders...). Each item: {className, name, parent, props?, children?}. Props are typed: {"Position":{"t":"Vector3","v":[0,5,0]}, "Anchored":{"t":"bool","v":true}, "Material":{"t":"EnumItem","v":"Enum.Material.Neon"}, "Color":{"t":"Color3","v":[1,0.5,0]}, "Size":{"t":"UDim2","v":[0.5,0,0.1,0]}, "AnchorPoint":{"t":"Vector2","v":[0.5,0.5]}}. Supported prop types: string,number,bool,Vector3,Vector2,CFrame,Color3,UDim2,UDim,EnumItem,BrickColor,Content,NumberRange,NumberSequence,ColorSequence,Rect,Instance,nil. ParticleEmitter Transparency and Size are NumberSequence, not NumberRange: {"t":"NumberSequence","v":[[0,0.2,0],[1,1,0]]} (time 0..1, value, envelope); ParticleEmitter Color is {"t":"ColorSequence","v":[[0,[1,0.8,0.4]],[1,[1,0.4,0.1]]]}. If the result reports propIssues, the instances WERE created — fix the listed properties with set_properties.',
      parameters: S({
        items: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              className: { type: 'string', description: 'Roblox class to create, e.g. "Part", "Model", "PointLight", "ScreenGui"' },
              name: { type: 'string' },
              parent: { type: 'string', description: 'Path of an EXISTING instance, e.g. "Workspace" or "Workspace.StreetLamp". Defaults to "Workspace".' },
              props: { type: 'object', description: 'Typed properties, e.g. {"Size":{"t":"Vector3","v":[1,4,1]}}' },
              attributes: { type: 'object' },
              children: { type: 'array', description: 'Nested items with the same fields (no parent)', items: { type: 'object' } },
            },
            required: ['className', 'name'],
          },
        },
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
      // D-UIONLY-1: UI classes come from insert_ui_component only.
      const handMadeUi = refuseLibraryItems(a.items, UI_RULE);
      if (handMadeUi) return Promise.resolve(handMadeUi);
      // D-FXLIB-1: Sounds and particle effects come from insert_sound / insert_vfx. A vetted kit
      // built in this file (LIBRARY_BUILT) is the library too.
      const handMadeFx = LIBRARY_BUILT.has(a.items as object) ? null : refuseLibraryItems(a.items, FX_RULE);
      if (handMadeFx) return Promise.resolve(handMadeFx);
      const pass = normaliseItems(a.items);
      if (pass.refusals.length > 0) {
        return Promise.resolve({
          error: `Nothing was created. ${pass.refusals.length === 1 ? 'One property' : `${pass.refusals.length} properties`} could not be read, and the rest were left alone rather than half-building the set: ${pass.refusals.map((r) => r.message).join(' ')}`,
        });
      }
      // D-MODELLIB-2: a prop never becomes hand-built because consent is still owed or a plugin
      // cannot insert from the library. Keep it unbuilt and report the missing capability instead.
      if (!LIBRARY_BUILT.has(a.items as object)) {
        const handMadeModel = refuseHandMadeModel(a.items);
        if (handMadeModel) return Promise.resolve(handMadeModel);
        const handBuilt = handBuiltPropRefusal(Array.isArray(a.items) ? a.items : []);
        if (handBuilt) return Promise.resolve({ error: `Nothing was created. ${handBuilt}` });
      }
      return op(ctx, { op: 'create_instances', items: (pass.items as never[]) ?? [] });
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
      description: 'Set properties/attributes on an existing instance. Same typed prop format as create_instances. Reports what each value WAS, so you can quote the change rather than the intention.',
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
      const restyle = refuseUiLook(props, prior?.class);
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
        'Create or edit Roblox smooth Terrain through bounded typed operations, without running arbitrary Luau. ' +
        'Actions: clear (no fields; empties ALL Terrain in one call — use it for "clear/remove the terrain", never Air fills), fill_block (center,size,material), fill_ball (center,radius,material), fill_region (min,max,material), ' +
        'replace_material (min,max,sourceMaterial,targetMaterial), or write_voxels (4-stud-grid origin, integer dimensions, flat voxels [{material,occupancy}]). ' +
        'Materials are Enum.Material names such as Enum.Material.Grass. At most 65,536 voxels are touched per call. ' +
        'Requires Studio edit consent and is one undo-recorded change. Checkpoint restore preserves Terrain identity but does not serialize voxel contents, so use Studio Undo for terrain rollback. ' +
        'RECIPES FIRST for these landforms: recipe "floating_island" (center, radius) builds a flat grassy top on a rock underside that tapers to a point and returns surfaceY to stand things on; recipe "waterfall" (top = the edge point it pours over, height, width, endsIn) hangs a thin sheet of water. ' +
        `BUILD A WHOLE FEATURE IN ONE CALL: pass operations (up to ${MAX_TERRAIN_BATCH} of the actions above, each with its own fields) and they run in order — a hill is several overlapping fill_ball calls with decreasing radius, a pond is a fill_ball of Enum.Material.Air then a smaller one of Enum.Material.Water. One operation per call costs a step each.`,
      parameters: S(
        {
          operations: {
            type: 'array',
            description: `Up to ${MAX_TERRAIN_BATCH} terrain actions run in order, each shaped like a single call ({action, center, radius, material, ...}). Stops at the first failure.`,
            items: { type: 'object' },
          },
          recipe: { type: 'string', enum: [...TERRAIN_RECIPES], description: 'A whole landform in one call. floating_island {center, radius 12-70}; waterfall {top, height, width, endsIn: "pool"|"mist"}.' },
          top: { type: 'array', items: { type: 'number' } },
          height: { type: 'number' },
          width: { type: 'number' },
          endsIn: { type: 'string', enum: ['pool', 'mist'] },
          action: { type: 'string', enum: ['clear', 'fill_block', 'fill_ball', 'fill_region', 'replace_material', 'write_voxels'] },
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
  build_scene: {
    def: {
      name: 'build_scene',
      description:
        'Build a whole ready-made environment in ONE call, then add to it. kit "floating_island": a Terrain island with a flat grassy top and a rock underside tapering to a point, a stream that pours off the edge as a waterfall with mist, 2-6 stylised trees (30-45 studs), 1-5 glowing crystal clusters, the golden-hour mood, the Baseplate hidden and the SpawnLocation moved onto the island. ' +
        'Use it for any floating / sky island request instead of building those pieces yourself — their shapes are tested; yours have not looked right. It returns surfaceY and usableRadius: place anything extra on that height. Everything lands in Workspace.SkyIsland.',
      parameters: S({
        kit: { type: 'string', enum: ['floating_island'] },
        center: { type: 'array', items: { type: 'number' }, description: 'Island centre, default [0, 150, 0]' },
        radius: { type: 'number', description: '12-70 studs, default 50' },
        trees: { type: 'number', description: '2-6, default 4' },
        crystals: { type: 'number', description: '1-5, default 3' },
      }, ['kit']),
    },
    studio: true,
    studioOps: ['terrain_edit', 'create_instances', 'get_tree', 'delete_instances', 'set_props', 'set_visible'],
    mutatesProject: true,
    run: async (ctx, a) => {
      if (a.kit !== 'floating_island') return { error: 'kit must be "floating_island"' };
      const kit = floatingIslandKit(a);
      if ('error' in kit) return kit;
      const terrain = await runTerrainEdits(ctx, { operations: kit.terrain });
      if (toolError(terrain)) return { ...(terrain as Record<string, unknown>), note: 'Only part of the island terrain was built; nothing else was added.' };
      const built = ['island terrain, stream and waterfall'];
      LIBRARY_BUILT.add(kit.items);
      const made = await TOOLS.create_instances!.run(ctx, { items: kit.items });
      if (toolError(made)) return { ...(made as Record<string, unknown>), built, projectMutated: true, note: 'The terrain is in place; the trees and crystals were not created.' };
      built.push(`${kit.facts.trees} trees, ${kit.facts.crystals} crystal clusters and waterfall mist`);
      const mood = await TOOLS.set_mood!.run(ctx, { mood: 'golden' });
      if (!toolError(mood)) built.push('golden-hour lighting');
      const hidden = await op(ctx, { op: 'set_visible', paths: ['game.Workspace.Baseplate'], visible: false });
      if (!toolError(hidden)) built.push('Baseplate hidden');
      const spawn = await op(ctx, { op: 'set_props', path: 'game.Workspace.SpawnLocation', props: { Position: { t: 'Vector3', v: kit.spawn } } as never });
      if (!toolError(spawn)) built.push('SpawnLocation moved onto the island');
      return { built, ...kit.facts, projectMutated: true, next: 'The scene is finished and its pieces are kept for this run. If the request asks for something it does not have, add only that (on surfaceY). Otherwise reply now in two or three short, simple sentences for a young player — no numbers, sizes or part names.' };
    },
  },
  delete_instances: {
    def: { name: 'delete_instances', description: 'Delete instances by path.', parameters: S({ paths: { type: 'array', items: { type: 'string' } } }, ['paths']) },
    studio: true,
    studioOps: ['delete_instances'],
    mutatesProject: true,
    run: (ctx, a) => op(ctx, { op: 'delete_instances', paths: (a.paths as string[]) ?? [] }),
  },
  move_instances: {
    def: {
      name: 'move_instances',
      description: 'Reparent existing instances without recreating them. Each move is { path, newParent }. Paths stay inside Apple\'s writable place scope and Studio refuses cycles, duplicate targets and sibling-name collisions.',
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
      description: 'Clone existing instances through Studio. Clones receive collision-free names and may optionally be placed under a specific writable parent.',
      parameters: S({
        paths: { type: 'array', minItems: 1, maxItems: DIRECT_EDIT_LIMITS.items, items: { type: 'string', maxLength: DIRECT_EDIT_LIMITS.pathChars } },
        parent: { type: 'string', maxLength: DIRECT_EDIT_LIMITS.pathChars },
      }, ['paths']),
    },
    studio: true,
    studioOps: ['clone_instances'],
    mutatesProject: true,
    run: (ctx, a) => {
      const paths = boundedPaths(a.paths);
      if (!Array.isArray(paths)) return Promise.resolve(paths);
      let parent: string | undefined;
      if (a.parent !== undefined) {
        const parsed = boundedPath(a.parent, 'parent');
        if (typeof parsed !== 'string') return Promise.resolve(parsed);
        parent = parsed;
      }
      return op(ctx, { op: 'clone_instances', paths, ...(parent ? { parent } : {}) });
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
      description: 'Rename one existing instance without recreating it. Studio refuses protected structures and sibling-name collisions.',
      parameters: S({ path: { type: 'string', maxLength: DIRECT_EDIT_LIMITS.pathChars }, name: { type: 'string', maxLength: DIRECT_EDIT_LIMITS.nameChars } }, ['path', 'name']),
    },
    studio: true,
    studioOps: ['rename_instance'],
    mutatesProject: true,
    run: (ctx, a) => {
      const path = boundedPath(a.path, 'path');
      if (typeof path !== 'string') return Promise.resolve(path);
      const name = directName(a.name, 'name');
      if (typeof name !== 'string') return Promise.resolve(name);
      return op(ctx, { op: 'rename_instance', path, name });
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
        'Read one instance back: its class, child count, common properties and attributes. Use it to VERIFY a change you just made, and quote what you actually saw rather than what you intended. Cheaper and more reliable than a run_luau that returns the same value.',
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
      const handMadeUi = refuseLibraryLuau(luauScanVariants(String(a.code ?? '')), UI_RULE);
      if (handMadeUi) return handMadeUi;
      const handMadeFx = refuseLibraryLuau(luauScanVariants(String(a.code ?? '')), FX_RULE);
      if (handMadeFx) return handMadeFx;
      // D-MODELLIB-2: run_luau does not assemble props either.
      const handMadeModel = refuseHandMadeModelLuau(luauScanVariants(String(a.code ?? '')));
      if (handMadeModel) return handMadeModel;
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
              'so this would risk the build. Fix the checkpoint problem, or verify without a playtest.',
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

      const logs = await ctx.execStudioOp({ op: 'get_logs', maxEntries: 120 }, 15_000);
      if (logs.ok) {
        const counts = countConsole(parseLogEntries(logs.data) ?? undefined);
        ctx.playtest?.console(counts.errors, counts.warnings);
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
        "Playtest AS A PLAYER: starts a real Studio Test session with one player, waits `seconds`, optionally walks the character onto each `touch` part (e.g. a coin), then reports what the player's screen actually shows (every ScreenGui in PlayerGui, enabled or not, and its visible text), the player's leaderstats before and after, and the errors from BOTH the client (LocalScripts) and the server. Use it before you say a counter, HUD, button or other on-screen UI works — run_and_check has no player and cannot see the screen or any LocalScript. The session runs on a copy of the place; its temporary check scripts are removed afterwards. It takes Studio over for up to about a minute.",
      parameters: S({
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
      return summarisePlayCheck(res);
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
      return summarisePlayCheck(res);
    },
  },
  get_output_logs: {
    def: { name: 'get_output_logs', description: 'Read recent Studio output/console logs (errors, warnings, prints).', parameters: S({}) },
    studio: true,
    studioOps: ['get_logs'],
    run: (ctx) => op(ctx, { op: 'get_logs', maxEntries: 120 }),
  },
  render_view: {
    def: {
      name: 'render_view',
      description:
        'Render the scene to real images from one or more camera angles and report what is actually visible. Use this to SEE your work — object properties cannot tell you whether a scene looks good.',
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
      // are re-sent on every later step. inspect_visually is what actually shows them to a model.
      ctx.lastRender = res;
      return { subject: res.subject, boundsSizeStuds: res.boundsSize, views: res.views.map((v) => ({ view: v.name, ...v.meta })) };
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
        "Frame and capture a store-page image of the place the user is actually building — the thumbnail shown on Roblox's home page and experience detail page, or the square experience icon. It renders the real place from every camera angle, measures each one, and proposes the best-framed shot at the aspect ratio Roblox requires. The image is SHOWN to the user and saved for an hour where they can download it. IT IS NOT AN UPLOAD-READY ASSET and you must not say it is: the Studio plugin's rasteriser caps far below the size Roblox wants and draws no lighting, shadows or materials, so this settles the COMPOSITION and the user takes the full-resolution shot in Studio themselves. There is no way to upload it — Roblox publishes no API for experience thumbnails — so never tell the user it has been set on their experience. Report the steps this returns instead. Never substitute generate_image for this: a store-page image must be the actual place.",
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

      // Every angle, because choosing between them IS the framing. `all` is what inspect_visually
      // already asks for, at the timeout that path has been using.
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
        'Apply a named lighting mood to the place: atmosphere, bloom, colour correction, sun rays and depth of field, plus the Lighting properties that carry it. This is how a scene stops looking like a grey blockout. Call it once the geometry is roughly in place and BEFORE render_view, then render to see it. Pick the mood the scene is meant to feel like, not the time of day it literally is.',
      parameters: S(
        {
          mood: {
            type: 'string',
            enum: Object.keys(MOODS),
            description: 'One of the named moods. Each is a complete, art-directed lighting setup.',
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
      if (!Object.prototype.hasOwnProperty.call(MOODS, mood)) {
        return {
          error: `unknown mood "${mood}". Choose one of: ${Object.keys(MOODS).join(', ')}.`,
        };
      }
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

      // Hand back the palettes this mood was art-directed alongside. The lighting is half of a
      // look; the materials and colours are the other half, and the model has no other way to
      // learn which of them were designed to sit under this light.
      const palettes = Object.entries(PALETTES)
        .filter(([, p]) => p.moods.includes(mood))
        .map(([name, p]) => ({ name, materials: p.materials }));
      const keptNote = kept.length
        ? `Left in place: ${kept.join(', ')} — the user put ${kept.length === 1 ? 'that' : 'those'} in Lighting, so ${kept.length === 1 ? 'it is' : 'they are'} still active and now combine with this mood. Tell them, and use remove_effect or ask before deleting ${kept.length === 1 ? 'it' : 'them'}.`
        : undefined;
      return {
        applied: mood,
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
        'Attach an ambient effect to an instance: fire, smoke, embers, mist and so on. These use no assets and no asset ids — they are pure engine particle and light configuration, already art-directed, so they cost nothing and cannot fail a licence or safety gate. Use them to make a built scene feel alive; a correct scene with nothing moving in it reads as a model, not a place. Re-applying the same effect to the same instance retunes it rather than stacking a second copy.\n\nCatalogue:\n' +
        effectCatalogue().map((e) => `  ${e.name} — ${e.summary} ${e.use}`).join('\n'),
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
        'Audit what has been built against a panel of adversarial critics and get back CONFIRMED defects, each naming the metric it measured, that metric\'s value, and the threshold it violates — unanchored parts that will fall on server start, default-grey Plastic, single-material builds, coplanar faces that will z-fight, sub-perceptual parts, a silhouette that carries no information, an untouched Lighting rig. Costs nothing and calls no model. Run it after building and again after fixing. It judges GEOMETRY and lighting configuration; it does not look at the render, so it complements inspect_visually rather than replacing it.',
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
      if (capture.parts.length === 0) {
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
      const note = noteParts.length ? `\n${noteParts.join('\n')}\nCall render_view then inspect_visually for those.` : '';
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
        'Install a vetted, self-contained ModuleScript for a system whose failures are silent and expensive. Prefer this to writing one of these yourself — they encode the specific Roblox behaviour that is easy to get subtly wrong. Each is one file with no dependencies on the others, and the user can read it. Installing over a script that already exists and differs is REFUSED unless you pass replace: true — re-installing would destroy whatever the user had changed.\n\n' +
        prefabCatalogue()
          .map((p) => `  ${p.id} — ${p.summary}\n      prevents: ${p.prevents.join('; ')}`)
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
   * demonstrably implement it, each with its author and its licence. Apple vendors nothing: six of
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
  inspect_visually: {
    def: {
      name: 'inspect_visually',
      description:
        'Render the scene and have it critiqued as an image against a visual quality gate. Returns a score, named defects and specific fixes. Call this after building anything visual, and again after fixing, until it passes. It renders and calls a vision model, so it costs Credits — run audit_build FIRST, which is free, checks geometry and the Lighting configuration, and finds a different class of defect. Use this for what only an image can show: whether the thing reads.',
      parameters: S(
        {
          target: { type: 'string', description: 'instance path to inspect. Omit for the whole workspace.' },
          intent: { type: 'string', description: 'what the user asked for, in one line — the critique is judged against this' },
        },
        ['intent'],
      ),
    },
    studio: true,
    studioOps: ['render_view'],
    run: async (ctx, a) => {
      const res = await renderViews(ctx, a.target ? String(a.target) : undefined, 'all');
      if ('error' in res) return res;
      ctx.lastRender = res;
      const intent = String(a.intent ?? 'a well-built Roblox scene');
      // A CHECK THAT CANNOT SEE THE SCENE DOES NOT SCORE IT (2026-09-23). The connected plugin's renderer
      // draws no Terrain, so an outdoor scene's island, rock and water are absent from the images. Scored
      // anyway, it said "a flat slab with no underside" (1/10) about an island that had one, and the model
      // spent 15 minutes and 219 Credits rebuilding it. The prompt note alone was ignored.
      if (!renderShowsTerrain(res) && isOutdoorRequest(intent)) {
        return {
          judged: false,
          reason:
            'Not scored: the connected Apple plugin draws no Terrain in its renders, so this outdoor scene\'s land, rock and water cannot be seen by the check. ' +
            'Do not change the scene because of this check. Reply to the user, and say the visual check could not look at the landform.',
        };
      }
      const critique = await critiqueViews(ctx.env, res, intent);

      // THE DETERMINISTIC PANEL, alongside the model's opinion.
      //
      // `critic.ts` shipped in zero bytes until now: its only importer anywhere was a test, and the
      // deployed bundle contained no trace of it. It is 900 lines of measured rules with an evidence
      // gate — a criticism that cannot cite a number is DISCARDED rather than down-weighted — and it
      // was running nowhere while the product asked a vision model for a score instead.
      //
      // The two are complementary and are reported separately on purpose. `critiqueViews` is a
      // model's judgement of pixels; the panel is arithmetic over what the plugin measured. Where
      // they disagree, that disagreement is information.
      //
      // The panel runs with NO judge, so it makes zero model calls and costs nothing. Five of its
      // eighteen metrics are pixel-derived and are not supplied, because reproducing them here would
      // mean inferring a downsample and a masking rule defined in the eval harness — and the panel
      // now REPORTS what it could not check, so a partial run says so instead of looking clean.
      const panel = await runCriticPanel(criticInputFromRender(res, intent));

      // THE PANEL'S VERDICT REACHES THE AGENT, not only the screen.
      //
      // Until now `panel` went into `ctx.uiDetail` and nowhere else. `uiDetail` is the browser.
      // The retry loop reads `ctx.lastCritique`, and `session.ts` decides `visualDefectsFound`
      // from it — so the panel could confirm a measured defect, print it in the workspace, and the
      // run would still report a clean build and move on. A critic whose findings reach the screen
      // and influence nothing the agent does is a display, not a critic, and this repository has
      // twice recorded that the panel "is display-only" as an item to fix rather than fixing it.
      //
      // `hardFails` is the seam, because it is already DEFINED as "rules tripped by measured
      // structure, independent of the model's opinion" — which is exactly what the panel produces.
      // It already flows to the model's text via critiqueToText, to the workspace through the
      // generative-ui adapter, and to the retry decision through `passed`. Nothing new is threaded;
      // the measured verdict simply stops being discarded.
      //
      // CONFIRMED ONLY. `panel.unchecked` is an absence of evidence and must never fail a build —
      // that distinction is the whole point of the evidence gate, and inverting it here would make
      // a partial run indistinguishable from a bad one.
      if (panel.adjudication.confirmed.length) {
        critique.hardFails = [
          ...critique.hardFails,
          ...panel.adjudication.confirmed.map((d) => `${d.subject} — ${d.claims[0] ?? 'measured defect'} [${d.severity}, confirmed by ${d.confirmedBy}]`),
        ];
        // A measured, evidence-backed defect is not a clean build, whatever the model said. The
        // two verdicts are complementary and this is the direction the disagreement has to resolve:
        // the panel cites numbers the model never saw.
        critique.passed = false;
      }
      ctx.lastCritique = critique;

      // SHOW THE USER WHAT THE CRITIC LOOKED AT.
      //
      // The model gets text, a score and a verdict — deliberately no pixels, because this result is
      // re-sent on every later step and a frame is ~207KB of base64 RGB. The BROWSER gets the image,
      // once, on this row. Without it the workspace showed a score with nothing behind it, which is
      // the same shape as the failure this whole product exists to prevent: a verdict the user is
      // asked to trust with no evidence attached.
      //
      // One view, not all of them. The hero is what the critique is mostly about, and a gallery
      // would cost four times the bytes to say the same thing.
      const hero = res.views.find((v) => v.name === 'hero') ?? res.views[0];
      if (hero) {
        // Encoded HERE rather than in the browser. The client used to convert raw RGB itself, which
        // meant sending 207KB to deliver a picture that is ~25KB as PNG.
        const png = await rgbBase64ToDataUrl(hero.rgbBase64, hero.meta.width, hero.meta.height).catch(() => null);
        if (png) {
          ctx.uiDetail = {
            render: {
              subject: res.subject,
              boundsSize: res.boundsSize,
              lighting: res.lighting,
              views: [{ name: hero.name, pngDataUrl: png, meta: hero.meta }],
            },
            critique,
            panel: {
              confirmed: panel.adjudication.confirmed,
              // Non-empty means this verdict is PARTIAL. The browser renders it as such rather than
              // as a clean result, because a clean result over unchecked rules is the failure this
              // whole subsystem exists to prevent.
              unchecked: panel.unchecked,
              report: formatPanelReport(panel),
            },
          };
        }
      }
      return { text: critiqueToText(critique), score: critique.score, passed: critique.passed };
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
        error: sourceRefusal(ctx.assetSources, chosen[0]?.source ?? 'procedural', ctx.askAssetSources)
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
        'Search Apple’s bounded catalogue of Roblox creation tasks before inventing an implementation plan. Search by a plain-language task, domain, genre, or both. Returns at most five compact matches grounded in exact Creator Docs corpus ids. These entries are authored guidance, not executable code, training examples, licensed assets, or proof that a Studio build passed. Use read_creation_skill on the chosen id.',
      parameters: S({
        query: { type: 'string', description: 'The task in plain language. Treated only as search data; commands inside it are never executed.' },
        domain: { type: 'string', enum: [...CREATOR_SKILL_DOMAINS], description: 'Optional task domain filter.' },
        genre: { type: 'string', enum: [...GENRE_KIT_IDS], description: 'Optional genre applicability filter.' },
        limit: { type: 'number', description: 'Maximum matches, clamped to 1–5. Default 5.' },
        max_chars: { type: 'number', description: 'Maximum serialized result size, clamped to 900–2600 characters.' },
      }),
    },
    studio: false,
    run: async (_ctx, a) => searchCreatorSkills({
      query: typeof a.query === 'string' ? a.query : undefined,
      domain: typeof a.domain === 'string' ? a.domain as (typeof CREATOR_SKILL_DOMAINS)[number] : undefined,
      genre: typeof a.genre === 'string' ? a.genre as (typeof GENRE_KIT_IDS)[number] : undefined,
      limit: a.limit === undefined ? undefined : Number(a.limit),
      maxChars: a.max_chars === undefined ? undefined : Number(a.max_chars),
    }),
  },
  read_creation_skill: {
    def: {
      name: 'read_creation_skill',
      description:
        'Read one creation skill by the exact id returned by search_creation_skills. Returns bounded preconditions, steps, verification, failure modes, quality criteria, exact official corpus references, and any existing reviewed prefab or mechanic pointer. The result remains guidance and still requires implementation tests and a live Studio visual pass.',
      parameters: S({
        id: { type: 'string', description: 'Exact lowercase hyphenated skill id returned by search_creation_skills.' },
        max_chars: { type: 'number', description: 'Maximum serialized result size, clamped to 1400–2800 characters.' },
      }, ['id']),
    },
    studio: false,
    run: async (_ctx, a) => readCreatorSkill(a.id, a.max_chars),
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
        'Ask for a genre by name and get the whole matched set at once: palette with the job each colour does, Lighting values, briefs for the UI/VFX/textures/props that genre needs and how to make each one, five sound-effect ids already chosen and checked for that genre, and what to build procedurally. Call this FIRST on any build that has a genre — one call replaces five separate decisions that are each defensible and do not belong in the same game. There is no asset catalogue to search; everything here is either made in the customer\u2019s own account or referenced by an id already pinned below.',
      parameters: S({ genre: { type: 'string', enum: [...GENRE_KIT_IDS] } }, ['genre']),
    },
    studio: false,
    run: async (ctx, a) => {
      const kit = getGenreKit(String(a.genre ?? ''));
      if (!kit) {
        // Naming the ten is the whole answer: a model told only "unknown genre" guesses again, and
        // the second guess is no better informed than the first.
        return { error: `there is no "${String(a.genre)}" kit. The kits are: ${GENRE_KIT_IDS.join(', ')}.` };
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
        buildTheseYourself: kit.procedural,
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
              : s.need === 'ui_icon' || s.need === 'particle' || s.need === 'texture'
                ? `generate_image with target="${s.need === 'ui_icon' ? 'ui_icon' : s.need === 'particle' ? 'decal' : 'texture'}", subject as given, and the styleTags folded into the style fields`
                : 'find_library_model with the subject as a plain noun, then insert_library_model; never parts or a generator (D-MODELLIB-2)',
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
      const refused = sourceRefusal(ctx.assetSources, 'creator_store', ctx.askAssetSources);
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
        'Insert an asset by numeric assetId. Use an id from find_verified_asset, or one the USER gave you — never one you produced yourself: a made-up id resolves to something random or to nothing. Where the id came from does not decide whether it is checked. EVERY id is resolved against the Creator Store and must pass the full gate (free, publicly visible, zero scripts, Mesh or Image — a Model is always refused, trusted creator, inside the triangle budget), and every insertion is then scanned INSIDE the place: Luau that arrived with the asset is removed, the place is re-listed to prove it clean, and an asset that cannot be proven clean is deleted whole and refused. To create objects, build them from Parts with create_instances instead.',
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
      // Apple's, and still faces the full gate immediately below regardless.
      const sourceRefused = provenanceRefusal(ctx.assetSources, provenance, ctx.askAssetSources);
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
      //   uploaded under Apple's own account, so by construction it carried no marketplace price,
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
  generate_model: {
    def: {
      name: 'generate_model',
      description:
        "CLOSED to the agent (D-MODELLIB-2): Apple never generates a 3D model from scratch, so this refuses. Every prop, building, vehicle and character comes from find_library_model + insert_library_model.",
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
   * result carries no expiry field and search_docs indexes Roblox's documentation, not Apple's, so
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
        "Generate an original 2D image — UI icon, decal, tiling texture, thumbnail or concept study. Defaults are outlined, chunky game art. Preserve the user's exact subject and background colors in subject; those override default palettes, including requests for neutral or dark colors. Use structured fields for other style choices. Embedded text and brand marks are refused: use editable TextLabels or official brand assets instead. The flatness heuristic does NOT verify appearance, color or subject fidelity; inspect the image before claiming a match. Results appear inline with Save image and stay with the project until it is deleted. Nothing is uploaded to Roblox or applied to the user's place.",
      parameters: S(
        {
          subject: { type: 'string', description: 'What to draw, as a plain noun phrase. No words to render, no brand names.' },
          target: { type: 'string', enum: ['ui_icon', 'decal', 'texture', 'thumbnail', 'concept'] },
          palette: {
            type: 'array',
            description: 'Default palette roles only when the user has not specified colors. Preserve requested subject/background colors in subject; do not replace silver, grey or dark colors with a gold/saturated palette.',
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
        `Search Apple's UI image library: 5,000+ CC0 PNGs (buttons, panels, bars, borders, HUD and menu icons, controller/keyboard/touch prompts, emotes, cursors) AND ${UI_STORE_COUNT.toLocaleString('en-US')} free Roblox Creator Store UI images. Use it before generating an image for a standard UI element. Plain words match names (e.g. "coin icon", "shop button", "gamepass", "settings", "rebirth"); \`genre\` lifts that genre's Creator Store images; \`pack\` narrows the CC0 part to one pack; an empty query lists the packs. \`results\` are CC0 files: pass an \`asset\` to upload_ui_asset, or as an icon to insert_ui_component. \`store\` hits are already on Roblox: their \`image\` (rbxassetid://…) goes straight into an icon of insert_ui_component or an Image property, never uploaded. Nothing is uploaded or changed by this call.`,
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
  // The 3D model library (D-MODELLIB-1): script-free Creator Store models that Roblox itself owns,
  // inserted by id, plus CC0/CC-BY/MIT files (Kenney, KayKit, GitHub .rbxm with every
  // script stripped) uploaded once into the USER'S OWN account. Props always come from the
  // library; parts stay the tool for terrain, baseplates, paths and zones.
  find_library_model: {
    def: {
      name: 'find_library_model',
      description:
        "Search Apple's 3D model library for a ready-made prop, building, tree/rock/plant, vehicle, character, pet, weapon or kit: script-free Creator Store models that Roblox itself published, and openly licensed low-poly packs. Call it BEFORE building any object out of parts. Plain nouns work best (\"palm tree\", \"police car\", \"crate\", \"shop\"); `genre` and `kind` narrow it. Returns ids for insert_library_model. Nothing is inserted or uploaded by this call.",
      parameters: S(
        {
          query: { type: 'string', description: 'Plain words for the object, e.g. "wooden crate" or "pine tree".' },
          genre: { type: 'string', enum: [...LIBRARY_GENRES], description: 'Optional game genre.' },
          kind: { type: 'string', enum: [...LIBRARY_KINDS], description: 'Optional kind of object.' },
          limit: { type: 'number', description: 'How many results, 1 to 40. Default 10.' },
        },
        [],
      ),
    },
    studio: false,
    run: async (_ctx, a) =>
      findLibraryModels({
        query: a.query === undefined ? undefined : String(a.query),
        genre: a.genre ? String(a.genre) : undefined,
        kind: a.kind ? String(a.kind) : undefined,
        limit: a.limit === undefined ? undefined : Number(a.limit),
      }),
  },
  insert_library_model: {
    def: {
      name: 'insert_library_model',
      description:
        "Insert ONE model from Apple's model library into the place, scaled and standing on `position`. Pass `id` from find_library_model, or `query` (plus optional genre/kind) to take the best match. A Creator Store row is inserted by id; a file row is first uploaded as a Model into the USER'S OWN Roblox account with their connected key (asset:write) — once per run, reused after. Every insert is scanned in the place and any script is removed before it counts. Use this for props, buildings, nature, vehicles, pets and characters. If insertion fails, search again or leave the prop unbuilt. To place many copies, insert one and clone_instances it.",
      parameters: S(
        {
          id: { type: 'string', description: 'A result `id` from find_library_model, unchanged.' },
          query: { type: 'string', description: 'Instead of id: plain words; the best match is inserted.' },
          genre: { type: 'string', enum: [...LIBRARY_GENRES] },
          kind: { type: 'string', enum: [...LIBRARY_KINDS] },
          position: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number' }, description: 'Where the bottom-centre lands, in studs. Default [0,0,0].' },
          height: { type: 'number', description: 'Target height in studs (the model is scaled uniformly). Default: its own size for Creator Store rows, a size for its kind for file rows.' },
          scale: { type: 'number', minimum: 0.001, maximum: 1000, description: 'Uniform scale factor instead of height.' },
          parent: { type: 'string', description: 'Default game.Workspace.' },
        },
        [],
      ),
    },
    studio: true,
    studioOps: ['insert_asset', 'get_tree', 'list_scripts', 'read_script', 'delete_instances', 'group_instances', 'spatial_query', 'transform_instances'],
    // A refusal or a still-processing upload changed nothing in the place.
    mutatesProject: (r) => !(typeof r === 'object' && r !== null && ('pending' in r || ('error' in r && !('projectMutated' in r)))),
    run: async (ctx, a) => {
      const refused = sourceRefusal(ctx.assetSources, 'creator_store', ctx.askAssetSources);
      if (refused) return { error: refused };
      const pick = a.id
        ? libraryModel(String(a.id))
        : findLibraryModels({ query: String(a.query ?? ''), genre: a.genre ? String(a.genre) : undefined, kind: a.kind ? String(a.kind) : undefined, limit: 1 }).results[0] ?? null;
      if (!pick) return { error: a.id ? `${String(a.id)} is not a library id. Call find_library_model and pass one of its ids unchanged.` : 'Nothing in the model library matched. Search for another library model or leave the prop unbuilt.' };
      const pos = a.position === undefined ? [0, 0, 0] : boundedTriple(a.position, 'position', DIRECT_EDIT_LIMITS.translation);
      if (!Array.isArray(pos)) return pos;
      const scale = a.scale === undefined ? undefined : Number(a.scale);
      if (scale !== undefined && !(scale >= DIRECT_EDIT_LIMITS.minScale && scale <= DIRECT_EDIT_LIMITS.maxScale)) return { error: `scale must be between ${DIRECT_EDIT_LIMITS.minScale} and ${DIRECT_EDIT_LIMITS.maxScale}` };
      const height = a.height === undefined ? undefined : Number(a.height);
      if (height !== undefined && !(height > 0 && height <= 2000)) return { error: 'height must be between 0 and 2000 studs' };

      let assetId = pick.assetId ?? ctx.libraryUploads?.get(pick.id);
      if (assetId === undefined) {
        ctx.libraryUploads = ctx.libraryUploads ?? new Map();
        if (ctx.libraryUploads.size >= MAX_UPLOADS_PER_RUN) {
          return { error: `This run already uploaded ${MAX_UPLOADS_PER_RUN} library files into the user's account, the most one run may. Reuse (clone_instances) a model already in the place, or pick a Creator Store row from find_library_model.` };
        }
        const up = await uploadLibraryModel(ctx.env, ctx.userId, pick);
        if ('error' in up) return { error: up.error, stage: up.stage, library: pick.id };
        if ('pending' in up) return { pending: true, operationId: up.operationId, library: pick.id, note: "Uploaded to the user's Roblox account; Roblox is still processing it, so nothing was inserted yet. Do not claim it is in the place." };
        assetId = up.assetId;
        ctx.libraryUploads.set(pick.id, assetId);
      }
      const placed = rec(await insertAndProveClean(ctx, assetId, String(a.parent ?? 'game.Workspace')));
      if ('error' in placed) return { ...placed, library: pick.id };
      let paths = (Array.isArray(placed.inserted) ? placed.inserted : []).filter((p): p is string => typeof p === 'string');
      if (paths.length > 1) {
        const grouped = await ctx.execStudioOp({ op: 'group_instances', paths, name: pick.name.replace(/[^A-Za-z0-9 _-]+/g, '').slice(0, 50) || 'LibraryModel' }, 20_000);
        const path = grouped.ok ? strOrNull(rec(grouped.data).path) : null;
        if (path) paths = [path];
      }
      const where = paths.length === 1
        ? await placeInserted((o, t) => ctx.execStudioOp(o as StudioOp, t), paths[0]!, pick, { position: pos, scale, height })
        : { error: 'inserted as several pieces; left where Roblox put them' };
      return {
        ...placed,
        inserted: paths,
        library: { id: pick.id, name: pick.name, kind: pick.kind, licence: pick.licence, ...(pick.attribution ? { attribution: pick.attribution } : {}) },
        ...('error' in where ? { placementWarning: where.error } : { placed: where }),
      };
    },
  },
  generate_model_external: {
    def: {
      name: 'generate_model_external',
      description:
        "CLOSED to the agent (D-MODELLIB-2): Apple never generates a 3D model from scratch, so this refuses. Every prop, building, vehicle and character comes from find_library_model + insert_library_model.",
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
        'Announce the ordered plan for this request BEFORE you start building it. Call this once, as your first step, then carry it out. Each step is { title, detail?, tool } — `tool` must be the exact name of a tool offered to you in this run that you will actually call for that step. Include a verification step (run_and_check, run_spec, audit_build, check_composition or inspect_visually — whichever you were offered), because a build with no planned check proves nothing; if you leave it out, an offered one is appended for you. The plan is shown to the user as a checklist while the run happens, so write each title as the thing they will get ("A platform players spawn onto"), not as an internal action. Costs nothing: no model calls, no images, no change to the project. Do not call it twice — if the work turns out differently, say so in your reply rather than re-planning.',
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
  ocr_image: {
    def: webToolDef('ocr_image'),
    studio: false,
    run: (ctx, a) => runWebTool('ocr_image', webCtx(ctx), a),
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
  build_ui: {
    def: buildUi.def,
    studio: true,
    studioOps: ['query_instances', 'create_instances', 'ui_layout_check'],
    mutatesProject: (result) => !!result && typeof result === 'object' && typeof (result as Record<string, unknown>).built === 'string',
    // Retired by D-UIONLY-1 (its screens were hand-styled Frames). Reverse: call buildUi.run again.
    run: async () => ({
      error: 'Refused (D-UIONLY-1): build_ui draws UI by hand and is retired. Insert each piece from the UI library with insert_ui_component({"component":"shop_window","genre":"<game genre>"}) (or currency_counter, main_menu, settings_window, ...). Nothing was sent to Studio.',
    }),
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

export async function runTool(
  ctx: AgentCtx,
  name: string,
  argsJson: string,
): Promise<{ summary: string; resultForLlm: string; ok: boolean; detail?: unknown; mutatedProject?: boolean; retryable?: boolean }> {
  const impl = TOOLS[name];
  if (!impl) return { summary: `unknown tool ${name}`, resultForLlm: JSON.stringify({ error: `unknown tool: ${name}` }), ok: false };
  if (impl.studio && !ctx.studioConnected()) {
    return { summary: `${name}: Studio not connected`, resultForLlm: JSON.stringify({ error: 'Roblox Studio is not connected right now — the Apple plugin is not answering. It is not a limit of this mode. Tell the user to reconnect Studio from the Apple panel, and do not claim any Studio change you did not see succeed.' }), ok: false };
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
      const why = err instanceof Error ? err.message : String(err);
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
  try {
    ctx.uiDetail = undefined; // never let one tool's panel leak into the next tool's row
    const result = await impl.run(ctx, args);
    const failed = typeof result === 'object' && result !== null && 'error' in (result as Record<string, unknown>);
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
    if (str.length > MAX_RESULT_CHARS) str = str.slice(0, MAX_RESULT_CHARS) + `\n...[truncated ${str.length - MAX_RESULT_CHARS} chars]`;
    const mutatedProject = partialMutation || (!failed && toolMutatesProject(name, result));
    // An explicit UI payload wins. It is capped separately and more generously than the derived
    // one: this socket already carries 200KB playtest frames, so a single ~25KB evidence panel per
    // build is not what needs protecting — a 24KB cap sized for re-sent tool results is.
    const detail = ctx.uiDetail !== undefined ? capUiDetail(ctx.uiDetail) : detailForUi(visibleResult);
    ctx.uiDetail = undefined;
    return {
      summary: summarize(name, args, failed, failed ? (visibleResult as Record<string, unknown>).error : undefined),
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
 * Strip anything that names the engine behind Golem.
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
