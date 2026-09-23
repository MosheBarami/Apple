// SessionDO — one per project. Store of record for chat history, checkpoints and op logs.
// Bridges: browser (WebSocket, hibernatable) <-> agent loop (alarm-driven steps) <-> Studio
// plugin (HTTP long-poll). Survives eviction between agent steps via persisted state.
import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import { RETENTION } from '../retention';
import type {
  ClientMsg,
  ServerMsg,
  StudioOp,
  OpResult,
  PendingOp,
  PluginPollRequest,
  PluginPollResponse,
  StudioEventState,
  StudioEventSelection,
  CheckpointMeta,
  RestoreFidelity,
  ProductMode,
  GatewayRequest,
  ToolTraceEntry,
  QuotaState,
  RunIntent,
  StudioFrame,
  PlaytestRun,
  RenderViewResult,
  StudioPlace,
  StudioDiagnostics,
  StudioLinkSummary,
  ProductModel,
  PluginCapabilityReportV1,
} from '@golem/shared';
import { canUseProductModel, isModelId, isRunFailure, MESSAGE_MAX_CHARS, modelRefusal, recordsRevision, type AssetSourcePolicy } from '@golem/shared';
import { isRefusalRemedyCode, type RefusalRemedyCode } from '@golem/shared';
import { registryModel } from '@golem/shared';

/**
 * The edit history being moved onto the message that replaces an edited one.
 *
 * `previous` is null when the resend changed nothing — Try again and Regenerate both come through
 * `edit_resend` with the text untouched — in which case the existing chain is still carried across,
 * because the message is still the same message; it just gained no new version.
 */
interface CarriedRevisions {
  /** The id of the row being replaced, whose chain moves to the new row. */
  from: string;
  /** The text that was there, or null if this resend did not change it. */
  previous: string | null;
  /** When the replaced message was written, so the stored version keeps its own timestamp. */
  at: number;
}
import {
  admitFrame,
  FrameRate,
  FrameRing,
  PLAYTEST_FRAME_HEIGHT,
  PLAYTEST_FRAME_WIDTH,
  type RawFrame,
} from '../frame-bus';
import { promptWithAttachments } from '../attachments';
import { artifactCompletion } from '../artifact-completion';
import { checkpointEvidence, checkpointCoverageNote } from '../checkpoint-evidence';
import { advance, isTerminal, startPlaytest } from '../playtest-stream';
import { creditsForNeurons } from '../pricing';
import { chat as llmChat, reasoningEffortApplies, BudgetError, RateLimitedError } from '../gateway';
import { systemPrompt, collapseArtDirection, MEMORY_UPDATE_PROMPT } from '../prompts';
import { designBrief } from '../design-brief';
import { TOOLS, toolDefs, toolNames, targetOf, runTool, projectMutatingToolNames, type AgentCtx, type PlaytestBus, type PlanDefectKind } from '../tools';
import { historySafeToolCalls } from '../tool-call-integrity';
import { MCP_TOOL_NAMES } from '../mcp';
import { nextPlanStep, planFromDetail, planDetail, settlePlan, type RunPlan } from '../run-plan';
import { refundSentence, refundVerdict } from '../run-refund';
import { critiqueToText } from '../vision';
import { toolsForMode } from '../router';
import { recoverToolCall } from '../tool-recovery';
import { notify } from '../notify';
import { usageBand } from '../notifications';
import { dayKey } from '../quota-math';
import { chooseEffort, classifyRequest, forbidsChanges, tokensForEffort, type ReasoningSignals, type Effort } from '../reasoning';
import { phaseForTool, type AgentPhase, type RunSnapshot, type RunSnapshotTool } from '@golem/shared';
import type { RunFailure } from '@golem/shared';
import { aim, trimTranscriptReport } from '../transcript';
import { VERIFIER_TOOLS } from '../verifiers';
import { afterStep, afterChange, builtSummary, type RetuneAction } from '../run-idle';
import { floatingIslandKit, kitZone, touchesKit, type KitZone } from '../scene-kits';
import { isLightingOnlyRequest, staysInLighting } from '../request-scope';
import { persistWithShedding } from '../persist';
import { clearStop, requestStop, stopRequested } from '../stop-signal';
import { singleFlight } from '../single-flight';
import { sceneSignature, shouldRebuild, semanticCheck, type PassRecord } from '../semantic';
import { runIntentFor } from '../run-intent';
import { readPluginHeaders, clientNotice, sanitizeVersion, parseProtocol, type PluginClientInfo, type PluginCompatibility } from '../plugin-version';
import { CollabStore, collabContext } from './collab-store.ts';
import { asCollabRole, can, type CollabRole } from '../collab.ts';
import { makeBeat, presenceSnapshot, type PresenceActivity } from '../presence.ts';
import { partitionOpsByRun } from '../op-attribution';
import {
  acceptAccessChangeVersion,
  accessRevokedFor,
  canonicalGrantExpiry,
  clearAccessRevoked,
  currentAccessCursor,
  markAccessRevoked,
  runMustStop,
  type RevocationReason,
  type RunAccessVerdict,
} from '../run-access';
import { placeAdmission, readPlaceReport, servesOps, type PlaceAdmission } from '../studio-place';
import { WORKER_FAILURES, asFailureKind, replyWithRemedy, replacedFiction } from '../op-failure';
import { replyDelta } from '../reply-delta';
import { latestSelection, sameSelection, companionOpAccess, sanitizeCompanionOp, companionRefusal } from '../companion';
import {
  MIN_QUERY,
  authorForRole,
  checkpointAuthor,
  isSearchable,
  narrowing,
  parseSearchFilter,
  runSearch,
  zeroCounts,
  type SearchFilter,
  type SearchRecord,
} from '../search';
import {
  addModelFact,
  applyModelUpdate,
  applyUserEdit,
  decideSuggestedFact,
  decideSuggestedSummary,
  isSuggestionDecision,
  memoryForPrompt,
  memoryWritable,
  normaliseMemory,
  type MemoryMode,
} from '../memory';
import { memoryAccessFor } from '../memory-store';
import { EMPTY_PERSONALISATION, applyToolPermissions, deniedTools, memoryModeOf, personalisationForProject } from '../preferences';
import { allModels } from '../providers/registry';
import { recordEvent, type BuildOutcome } from '../analytics';
import { flushEvents } from '../analytics-sink';
import { fenceToolOutput, describeThreats } from '../injection.ts';
import { advisory, scoreSubmission, type Submission } from '../abuse.ts';
import {
  filterToolsForPlugin,
  normalisePluginCapabilities,
  pluginCapabilityPromptNote,
  type PluginToolFilter,
  type ToolStudioRequirements,
} from '../plugin-capabilities';

/**
 * The poll response, plus the one field the shared contract does not carry yet.
 *
 * `PluginPollResponse` lives in packages/shared, which another workstream owns, so
 * this intersects rather than edits it: the shared type stays authoritative for
 * `ops` and `waitMs`, and `client` is declared here. Additive and backward
 * compatible in both directions — a plugin that never reads `client` sees the
 * response it has always seen. Fold this into the shared interface when that file
 * is free to change; the exact addition is written out in the handover notes.
 */
type PollResponse = PluginPollResponse & { client?: PluginCompatibility };

const STUDIO_TOOL_REQUIREMENTS: ToolStudioRequirements = Object.fromEntries(
  Object.entries(TOOLS)
    .filter(([, tool]) => tool.studio)
    .map(([name, tool]) => [name, tool.studioOps ?? []]),
) as ToolStudioRequirements;

const pluginCapabilitiesKey = (tokenHash: string): string => `pluginCapabilities:${tokenHash}`;
const pluginCapabilitiesClientKey = (tokenHash: string): string => `pluginCapabilitiesClient:${tokenHash}`;
type PluginCapabilityClientIdentity = { version: string | null; protocol: number | null };

function samePluginCapabilityClient(
  a: PluginCapabilityClientIdentity | null | undefined,
  b: PluginCapabilityClientIdentity | null | undefined,
): boolean {
  return !!a && !!b && a.version === b.version && a.protocol === b.protocol;
}

interface AgentState {
  status: 'idle' | 'running' | 'stopping';
  /**
   * The remedy code of a Studio refusal this run hit, if any.
   *
   * THE REASON THIS IS NOT LEFT TO THE MODEL. On 2026-09-19 the plugin refused a write for want of
   * edit consent and said so, in full, naming the button that lifts it and denying that it is a
   * Studio setting — verified in the oplog. The model was handed that sentence, under a system
   * prompt that names and forbids the exact fiction, and told the user to uncheck "Require explicit
   * edit consent for scripts" under File > Place Settings > Security, which does not exist. Six
   * corrections at six layers did not move it.
   *
   * So the sentence stops being the model's to write. A refusal with a known remedy is a
   * deterministic fact, and finishRun appends the product's own words to the reply — the same
   * treatment `incomplete` already gets, and for the same reason: a reply that sends the user
   * hunting for a setting that was never there is worse than an error, because they have no reason
   * to doubt it.
   */
  refusalRemedy?: RefusalRemedyCode;
  /** the run's unforgeable fence id; optional so a run persisted by an older deploy still loads */
  fenceId?: string;
  mode: ProductMode;
  /** Per-message autonomy switch. It is meaningful only when mode === 'agent'. */
  autonomous?: boolean;
  /** The user's model entitlement, independent of Plan/Agent and the Autonomous toggle. */
  productModel?: ProductModel;
  msgId: string;
  llm: GatewayRequest['messages'];
  step: number;
  /** Hard per-message work-step ceiling. Optional only for blobs persisted by an older deploy. */
  maxSteps?: number;
  creditsSpent: number;
  /**
   * HOW those Credits were taken, split the way QuotaDO took them: renewable allowance first, then
   * purchased balance. Kept on the run because a refund has to reverse the same two ledgers in the
   * same proportions — put a spent free allowance back as purchased balance and the product has
   * quietly turned a rate into money.
   *
   * Both optional: a run persisted by a deploy that predates the refund path deserialises with
   * neither, and `refundRun` treats that as "the split is unknown" rather than guessing one. A
   * refund nobody can apportion is not applied, and the reply does not claim one.
   */
  creditsFromAllowance?: number;
  creditsFromCredits?: number;
  /** What was actually put back at the end of the run, once. Its presence is also the "done" mark. */
  creditsRefunded?: number;
  /** neurons this run has consumed, so Credits round once per run instead of once per call */
  neuronsUsed?: number;
  trace: ToolTraceEntry[];
  seenCalls?: string[]; // "tool:argsHash" of calls already executed this run
  /**
   * Identical calls whose last attempt failed in a way op-failure.ts classified as SAFE TO REPEAT
   * (it never reached Studio, or a read timed out), and how many identical repeats each has had.
   * The duplicate guard lets such a call through up to MAX_IDENTICAL_RETRIES times instead of
   * answering "you already made this exact call" to the very retry the tool result invited.
   * Bounded like seenCalls, for the same storage reason. Optional for runs persisted earlier.
   */
  retryableCalls?: { sig: string; retries: number }[];
  /**
   * Consecutive steps in which EVERY tool call was refused as a duplicate. Measured 2026-09-22 (run
   * 1870ecfe, the vis-01 street lamp): after the lamp was built the model re-read the place, the guard
   * answered "you already have the result" to each identical read, and it asked again — 53 paid
   * steps, most of the run's 205 Credits, with nothing executed and nothing traced. Bounded at
   * MAX_DUPLICATE_STREAK; the run then ends on what it built.
   */
  duplicateStreak?: number;
  /** A verifier passed after the latest change to the place. Cleared by the next change. */
  verifiedAfterMutation?: boolean;
  /**
   * Consecutive steps that only READ, after the run changed the place and a verifier passed. Measured
   * 2026-09-22 on every mission run (76b59615, fad0ab1b, a95f86fa): build, check, then 20–40 paid
   * search_scripts / get_project_tree steps with different arguments — invisible to the duplicate
   * guard — until it ended the run. Nudged and ended per run-idle.ts.
   */
  idleAfterVerify?: number;
  /** Consecutive read-only steps since the last change or check, in a run that can build (run-idle.ts). */
  readsSinceChange?: number;
  /** Successful changes per target (tool + what it was aimed at) this run — run-idle.ts afterChange. */
  changesByTarget?: Record<string, number>;
  /** Set when build_scene has built a kit this run; its pieces and terrain are kept (scene-kits.ts). */
  kitZone?: KitZone;
  /** A Studio tool was refused because the plugin stopped answering (run-refund.ts studioDropped). */
  studioDropped?: boolean;
  /** Studio was connected at some step of this run, so its tools stay offered if the link drops (F-033). */
  studioSeen?: boolean;
  /**
   * propose_plan's consecutive refusals and the kinds of the last one, carried across steps so the
   * tool can keep its promise that no run is refused more than twice in a row. See PlanState.
   */
  planRefusals?: { count: number; kinds: PlanDefectKind[] };
  /**
   * When the current unbroken stretch of provider refusals and transport failures began. Cleared
   * the moment a model call returns. See PROVIDER_OUTAGE_MAX_MS.
   */
  providerWaitSince?: number;
  /**
   * Consecutive steps whose whole reply was a tool payload written as text and not executed. The
   * steer that answers it is given its turn at most MAX_TEXT_CALL_STEERS times in a row.
   */
  textCallSteers?: number;
  lastCalls?: { id: string; name: string; arguments: string }[];
  finalText: string;
  streamedText?: string;
  /**
   * The closing sentence a run bound already wrote into the reply (the read-stall end, a
   * duplicate streak that changed nothing). finishRun's generic 'incomplete' sentence gives way to
   * it: the note that names the real reason is the one closing line (F-045, 2026-09-23).
   */
  terminalNote?: string;
  startedAt: number;
  lastStepAt: number;
  userId: string;
  /** The verified socket identity that initiated this run; owner billing stays in userId. */
  initiatedBy?: string;
  /** Trusted grant deadline, when the ingress was able to carry one. */
  initiatorExpiresAt?: string | number;
  // ---- adaptive reasoning signals. All optional: a run persisted by an older deployment
  // deserialises unchanged and simply starts from the baseline effort. ----
  /** how many steps this run has already spent at high effort */
  highEffortUsed?: number;
  /** the previous step errored or a tool reported failure */
  priorStepFailed?: boolean;
  /** provider output cuts recovered inside this same run; diagnostic/escalation only, never a cap */
  lengthRecoveries?: number;
  /** consecutive provider transport failures; reset after a successful model response */
  transientFailures?: number;
  /** the last visual critique failed its quality gate */
  visualDefectsFound?: boolean;
  /**
   * What the user's request looks like, classified once when the run starts.
   *
   * `uiDesignTask` was missing from this Pick while `classifyRequest` returned it and line ~2956
   * assigned the whole object — so the value was written to storage, round-tripped, and spread into
   * `chooseEffort`'s signals on every step, with the type contract saying it was not there. A field
   * that exists at runtime and not in the type is a field no reader can be written against, which is
   * how it came to be classified, stored, spread and read by nobody.
   */
  traits?: Pick<ReasoningSignals, 'visualDesignTask' | 'uiDesignTask' | 'multiSystemTask' | 'ambiguousRequest' | 'conversational'>;
  /** pins the reasoning tier for the whole run; set only by the A/B harness, never in production */
  forcedEffort?: Effort;
  /** a mutating tool has succeeded this run, so there is something to show for it */
  mutated?: boolean;
  /**
   * Asset ids whose PROVENANCE was established earlier in this run.
   *
   * These lived only on the per-step AgentCtx, which `agentCtx()` rebuilds from scratch every
   * step — so a model that searched in step N and inserted in step N+1 arrived with both sets
   * empty. Provenance then degraded to `user_supplied`, which means the curated-library waiver is
   * not applied and the full Creator Store gate (price, votes, verified creator) runs against an
   * asset that by construction has none of them. The intended search-then-insert flow could only
   * work if both calls happened to land in the same 4-call step.
   *
   * Stored as arrays because AgentState is JSON-serialised into DO storage and a Set is not.
   */
  discoveredAssetIds?: number[];
  /**
   * The tool permissions in force for this run, already layered org-then-user-then-project.
   *
   * Pinned to the RUN rather than re-read per step: a preference edited mid-build would otherwise
   * change what the agent may do between step 4 and step 5, which is a run that behaves two
   * different ways and an audit trail that cannot explain either. Optional, so a run persisted by
   * an older deployment deserialises unchanged and simply narrows nothing.
   */
  toolPermissions?: Record<string, 'allow' | 'ask' | 'deny'>;
  /**
   * The request forbade changing the place ("do not change anything"). Pinned at the start of the run,
   * like the permissions: every project-writing tool is withheld and the run owes no mutation. See
   * forbidsChanges in reasoning.ts.
   */
  readOnly?: boolean;
  /** The request is only about the light: changes outside Lighting are refused (request-scope.ts). */
  lightingOnly?: boolean;
  /**
   * Which tools the permissions above actually REMOVED from this run, computed once at the first
   * step and kept so the announcement is made once and survives a reload.
   *
   * `undefined` means nobody has looked yet — an older run deserialises into it and is checked on
   * its next step. An empty array means somebody looked and there was nothing to report, which is
   * a different fact and the reason this is not just a truthiness check.
   */
  deniedTools?: string[];
  /**
   * Whether this run may write to memory, and whether it has to ask first.
   *
   * Pinned exactly like `toolPermissions`, for exactly the same reason: memory is written at the
   * TAIL of a run, so a setting read at that moment would be the setting as it stood after the
   * work, not the one in force when the user started it. Someone who turns memory off mid-build
   * has told the product not to keep this run either. Optional, so a run persisted by an older
   * deployment deserialises unchanged and falls back to the resolved default.
   */
  memoryMode?: MemoryMode;
  /** how many times this run has been steered back to work after replying without acting */
  nudges?: number;
  /** the user's request, kept so the automatic visual gate can judge against the actual intent */
  request?: string;
  /** the visual gate has already run once this run — it is charged once, never in a loop */
  autoCritiqued?: boolean;
  /** one record per visual correction pass, so "patched forever" can be detected rather than felt */
  passes?: PassRecord[];
  /** a rebuild has already been ordered this run; ordering it twice would loop */
  rebuildOrdered?: boolean;
  /**
   * Provider rate-limit waits already spent on the CURRENT step, and the earliest moment that step
   * may be attempted again. Reset once the step's model call gets through. These waits do not
   * consume the 1000 work steps because the provider never accepted the attempted step.
   *
   * `resumeAt` exists because the alarm is shared. `armStudioWatchdog` legitimately pulls the alarm
   * earlier, and every alarm during a run takes a step — without a "not before" mark the watchdog's
   * alarm would consume a wait containing no wait. Both optional: a run persisted by an older
   * deploy deserialises with neither and simply starts from zero waits and no deadline.
   */
  rateLimitWaits?: number;
  resumeAt?: number;
  /**
   * The provider's own last word on the most recent response — 'stop', 'tool_calls', 'length',
   * 'error'. Carried on the run's state rather than in a local so `finishRun` can record it.
   *
   * The value was being read, used to compose the sentence "the model reached its output limit
   * before finishing this step", and then dropped. So the one failure a user can watch happening
   * had no number attached to it anywhere: 'length' truncation was recoverable per-project by
   * inference from `messages` and never across the fleet. See BuildEvent.finishReason.
   */
  lastFinishReason?: string;
  // ---- live-UI state. Optional so a run persisted by an older deployment
  // deserialises unchanged and simply replays an emptier snapshot. ----
  /** the stage the run is currently in, for the reconnect snapshot */
  phase?: AgentPhase;
  /** tools executed this run, kept so a reconnecting browser can rebuild the trace */
  uiTools?: RunSnapshotTool[];
  /** the reasoning policy's chosen effort and its own explanation, for the UI */
  effort?: Effort;
  effortReason?: string;
  /**
   * What the agent took the request to be, derived once at run start. Persisted so that the
   * Intent and Plan rows of the Thinking card survive a browser refresh: `broadcast` drops any
   * message sent while nobody is listening, and `run_intent` is emitted exactly once per run.
   */
  intent?: RunIntent;
  /** Last measured prompt size sent this run. Scalar metadata only — no prompt text is copied. */
  contextUsedChars?: number;
  contextMaxChars?: number;
  /** Cumulative user-turn loss across the run. Absent means no observed drop, not a guessed zero. */
  contextDroppedGroups?: number;
  contextDroppedChars?: number;
  /**
   * The plan `propose_plan` announced, and the tool row it was announced on.
   *
   * Kept so `settlePlan` can re-state it at the end of the run against what actually ran. Bounded
   * by the tool's own 12-step cap and its 200/800-character clips, so it cannot be the thing that
   * pushes the persisted AgentState past the Durable Object's value limit.
   */
  plan?: RunPlan;
}

type AccessChange = RevocationReason | 'clear';

function accessCursorEvent(value: string | undefined): { access: AccessChange; role: CollabRole | null } | null {
  if (typeof value !== 'string') return null;
  const split = value.indexOf(':');
  if (split <= 0) return null;
  const access = value.slice(0, split);
  if (access !== 'clear' && access !== 'removed' && access !== 'suspended' && access !== 'demoted') return null;
  const rawRole = value.slice(split + 1);
  const role = rawRole === 'none' ? null : asCollabRole(rawRole);
  if ((access === 'clear' || access === 'demoted') && role === null) return null;
  if ((access === 'removed' || access === 'suspended') && role !== null) return null;
  return { access, role };
}

const accessClearPendingKey = (userId: string): string => `accessClearPending:${userId}`;

// step limits are a direct cost multiplier: every step is a full priced inference call
// The hard step ceiling is a direct cost multiplier: every accepted step is a full priced inference
// call. The previous small mode-specific ceilings cut visual loops off mid-work; the current product
// contract gives every message one explicit long-horizon ceiling instead.
const VALID_MODES = new Set<ProductMode>(['plan', 'agent']);
/** Latest product contract: one message may execute at most 1000 accepted work steps. */
export const MAX_RUN_STEPS = 1000;

/** How many times one run may be steered back to work after replying without acting. */
const MAX_NUDGE_LEVEL = 6;
/**
 * How many IDENTICAL repeats a call may have when its last failure was classified safe to repeat
 * (op-failure.ts: it never reached Studio, or a read timed out). Two, so a dropped connection or a
 * slow read can recover without the model inventing different arguments to get past the duplicate
 * guard — and no more, because a failure that survives two clean retries is not transient.
 */
const MAX_IDENTICAL_RETRIES = 2;
/** Consecutive all-duplicate steps after which a run ends on what it built (see AgentState.duplicateStreak). */
const MAX_DUPLICATE_STREAK = 3;
const VERIFIERS = new Set<string>(VERIFIER_TOOLS);
/** What a run that was told not to change anything is never offered. */
const READ_ONLY_WITHHELD = new Set(projectMutatingToolNames());
/** What a lighting-only run is told when it reaches for anything else. */
const LIGHTING_ONLY =
  'Not run: this request is only about the lighting, so only Lighting changes are made in this run. ' +
  'Finish the lighting change, then reply to the user in one or two short, simple sentences.';
/** What a run is told when it tries to redo a kit it already built. */
const KIT_KEPT =
  'Not run: the ready-made scene is finished, and its pieces and the terrain around it are kept as built in this run. ' +
  'Add only what the request still asks for that the scene does not have, or reply to the user now in two or three short, simple sentences.';
/** A sentence followed by one space, or nothing — so an empty summary leaves no double space. */
const spaced = (t: string): string => (t ? `${t} ` : '');
/** Consecutive steps a tool-call-written-as-text steer may be given before the ordinary ending decides. */
const MAX_TEXT_CALL_STEERS = 2;
const MODE_BASE_TOKENS: Record<ProductMode, number> = { plan: 4400, agent: 4400 };

/**
 * The runtime mode allowlist. `ProductMode` is a COMPILE-TIME type and `JSON.parse(raw) as ClientMsg`
 * is an assertion, not a check — so before this, whatever the client put in `mode` was used as a
 * key directly.
 *
 * Only Plan and Agent are valid run modes. Autonomous is a separate boolean on Agent.
 */
function asProductMode(x: unknown): ProductMode | null {
  if (typeof x !== 'string') return null;
  const mode = x as ProductMode;
  return VALID_MODES.has(mode) && Object.prototype.hasOwnProperty.call(MODE_BASE_TOKENS, x) ? mode : null;
}

/**
 * The refusal a chat frame gets when its `mode` is not one this build knows.
 *
 * MEASURED 2026-09-22. The product renamed its run modes — the wire carried `clay`/`stone`/`rune`
 * and carries `plan`/`agent` now — and a browser tab keeps the bundle it loaded until it reloads.
 * There is no way to update a web SPA atomically, so during any such rename there is a window in
 * which a live tab asks for a mode this build has never heard of. The old message ("Unknown mode
 * for this request") was true and useless: the person reading it had done nothing wrong and had no
 * way to know that a reload fixes it, so the product read as broken rather than as stale.
 *
 * The wording is the one this file already uses for a stale socket — `me === null`, a client from
 * before the socket carried an identity. Same cause, same remedy, so the same sentence.
 *
 * THE CODE STAYS `bad_mode`, and that is load-bearing in two places. The browser maps the code to a
 * field-level error on the composer (`refusalFor('bad_mode').field === 'mode'`), and
 * tests/mode-ingress.test.mjs asserts on the code and on `terminal: true`. Changing the prose
 * therefore cannot loosen the security property: an unrecognised mode still creates no run, and a
 * hostile one still gets a terminal refusal.
 */
const MODE_SKEW_REFUSAL = 'This connection is out of date — reload the page to keep building.';
/** A restore refused because a run is still changing the place. Plain words: the reader may be young. */
const RESTORE_WHILE_RUNNING = 'Apple is still building. Press Stop first, then restore.';

/** Runtime validation for the additive product-model field on newer clients. */
function asProductModel(x: unknown): ProductModel | undefined | null {
  if (x === undefined || x === null) return undefined;
  // Every registry model (D-VISION-1); what the account may USE is productModelVerdict's question.
  return isModelId(x) ? x : null;
}

/** Model entitlement is independent of Plan/Agent. Older clients default to the free Apple lane. */
function effectiveProductModel(mode: ProductMode, requested?: ProductModel): ProductModel {
  void mode;
  return requested ?? 'apple';
}

// Product-model entitlement and Plan/Agent are separate axes. The two Apple lanes use the same
// measured foundation under the mode keys (plan/agent), so entitlement reaches them only as effort
// policy. A third-party model (D-VISION-1) is its own DEFAULT_MODELS key, named by its registry id,
// because its provider id, output ceiling and wire differ from GLM's.
export function gatewayModelFor(mode: ProductMode, productModel?: ProductModel): string {
  if (productModel && registryModel(productModel)?.route === 'unified-billing') return productModel;
  return mode;
}

/**
 * THE OUTPUT BUDGET FOLLOWS THE TOOLSET, AND THE TOOLSET IS KEYED ON `mode`.
 *
 * The budget follows the offered toolset. It must not size an Agent answer as though it were Plan:
 * the tools a
 * run is offered come from `toolsForMode(agent.mode, …)` — see runStep — and that function does
 * not look at the product model at all, so a free Agent run is handed run_luau, edit_script and
 * delete_instances and needs enough output room to express a complete tool call.
 *
 * The measurement that sized the Agent budget is in gateway.ts: a market-stall build script
 * is ~5,300 characters, and at 2,400 output tokens it came back `finish_reason: "length"` — an
 * unparseable tool call, nothing built, and the Credits spent. Asking the free lane to do the
 * Giving an Agent job a Plan-sized budget is that failure made structural.
 *
 * So: the budget is whatever the offered toolset is sized for. Free-vs-paid bounds live in
 * allowance/entitlement and capability policy, not a hidden maximum number of work steps.
 *
 * Exported alongside `gatewayModelFor` because the budget that reaches the provider is the MINIMUM
 * of the two — llmChat clamps with `Math.min(req.maxTokens ?? cfg.maxTokens, cfg.maxTokens)` — so
 * a guard that reads only this half would have stayed green through the whole defect.
 */
export function baseTokensFor(mode: ProductMode): number {
  return MODE_BASE_TOKENS[mode];
}
/**
 * HOW LONG A RUN WAITS OUT A PROVIDER BURST, AND WHY IT WAITS AT ALL.
 *
 * Measured 2026-09-20 against the deployed worker (free Apple Agent lane, GLM-5.3-flash,
 * Studio disconnected): of the seven runs that reached a knowledge tool, five died with `busy` — a
 * Workers AI rate-limit refusal. The refusal was NOT provoked by the knowledge call. 389 of 600
 * model calls that day were refused and every one of them falls inside a single 17-minute window;
 * outside it there is not one refusal in any minute. What a knowledge call changes is the LENGTH of
 * the run, and one refusal used to end the whole run, so survival went as p^steps: a run that
 * answered from memory took 1–2 steps and often lived, a run that called get_ui_construction took
 * 4–5 and almost never did. "Every run that reached a knowledge tool ended in provider error" was
 * survivorship — the burst deleted exactly the long runs, which are the runs that used the library.
 *
 * gateway.ts already waits 1200/2400/3600 ms INSIDE the call, a 7.6 s ladder. In that same window
 * the same refusal class cleared at 1.9, 5.0, 6.2, 6.3, 12.1 and 60.6 s — so the ladder lands in the
 * MIDDLE of the recovery distribution, and whether a customer's run survived was decided by which
 * side of 7.6 s the provider happened to fall on. These waits sit outside the call and resume the
 * SAME durable step. There is still no run-age watchdog: a run's age is not evidence of anything.
 *
 * The retry is free in the only sense that matters here — the request never reached the model,
 * nothing was billed, and gateway.ts has already handed the reservation back before it throws.
 */
const RATE_LIMIT_WAIT_MS = [5_000, 15_000, 30_000] as const;
const TRANSIENT_PROVIDER_WAIT_MAX_MS = 60_000;

/**
 * HOW LONG A PROVIDER MAY STAY UNAVAILABLE BEFORE THE RUN SAYS SO AND ENDS.
 *
 * The waits above used to repeat forever and silently: every rate-limit refusal slept 30 s and
 * every transport failure up to 60 s, with nothing sent to the browser, so a provider that was down
 * for an hour showed an hour of a frozen Thinking card and could only be ended by Stop. That is not
 * "keep working until a real boundary" — a model provider that has not answered for minutes IS the
 * boundary, and the product was the only party that knew it.
 *
 * So this bounds CONTINUOUS unavailability, not run age: the clock starts at the first refusal or
 * transport failure of a stretch and is cleared the moment any model call returns. The burst this
 * code was written for cleared within 60.6 s (see RATE_LIMIT_WAIT_MS); five minutes is five times
 * the slowest recovery ever measured, and every wait inside it is announced to the client. At the
 * bound the run ends as an error with the shared `busy` / `dropped_step` code, and finishRun's
 * ordinary refund rules apply — a run that delivered nothing gets its Credits back.
 */
export const PROVIDER_OUTAGE_MAX_MS = 5 * 60_000;

function isTransientProviderFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: unknown; kind?: unknown };
  return e.name === 'ProviderError' && e.kind === 'transient';
}

/**
 * A rate-limit refusal that landed on the STEP'S OWN model call, before any of the step's work ran.
 *
 * This distinction is the entire safety of the retry above. At that boundary nothing has been
 * billed, no tool has run and nothing has been pushed onto `agent.llm`, so re-running the step is
 * free and idempotent. A RateLimitedError raised LATER in a step — a tool making a model call of
 * its own — arrives after paid inference and after mutations, and resuming from there would bill
 * the step's inference twice and re-apply its tools. Those keep the terminal path, which is the
 * behaviour every rate limit had before this. `runTool` catches everything and turns it into a
 * failed tool result, so today no such error escapes; this subclass is what keeps the retry
 * correct if one ever does, instead of a comment asserting that none can.
 */
class StepRefusedError extends RateLimitedError {}

// ---------------------------------------------------------------------------------------------
// PLUGIN POLL PACING — this is the largest recurring cost in the system, not inference.
//
// The poll used to hold every request open for 6s (4s mid-run) and tell the plugin to come back
// after 1s. A paired SessionDO was therefore in flight ~85% of wall-clock, continuously, for as
// long as a project stayed connected — and Durable Object residency is billed by GB-s. One
// always-connected project consumes roughly the entire monthly allowance on its own. Inference,
// which the whole budget system was built to guard, is the smaller line item by a wide margin.
//
// The original comment was honest that it was trading residency for latency and that "that saving
// was never measured and this latency was". It has now been measured, so the trade is revisited —
// but only for the case where the hold buys nothing.
//
// Holding is right when work is happening or imminent: `pollWaiter` resolves the instant an op is
// queued, so latency is near zero. Holding is pure waste when the project has been idle for
// minutes, because no op is coming. So: hold while active, and when idle return IMMEDIATELY and
// let the plugin sleep client-side, where sleeping is free.
//
// 10s is not arbitrary. The plugin clamps the value it is given to [0.2, 10] seconds
// (apps/plugin/src/init.server.luau), so 10s is the longest sleep any currently deployed plugin
// will honour. Issuing more would be silently clamped, and staleness derived from the larger
// number would then declare a healthy plugin dead. This needs no plugin change to take effect.
// ---------------------------------------------------------------------------------------------

/** Hold while a run is in flight: ops are arriving, and latency is what the user feels. */
const POLL_HOLD_ACTIVE_MS = 4_000;
/** Hold while recently active: the user is still in the conversation and likely to act again. */
const POLL_HOLD_WARM_MS = 6_000;
/** No activity for this long and the connection is parked: stop holding requests open. */
const POLL_IDLE_AFTER_MS = 180_000;
/**
 * Client-side sleep while parked.
 *
 * 5s, NOT the 10s the plugin would accept, and the difference matters. A blanket 20s backoff was
 * tried here before and refuted by measurement: ops took 6.5-10.4s to be picked up where holding
 * gave under 2.5s. That refutation stands, and this must not quietly re-enact it.
 *
 * What makes this a different trade is WHEN it applies. The refuted backoff paced every poll; this
 * one applies only after POLL_IDLE_AFTER_MS of complete silence, and the very first queued op sets
 * `lastActivity`, which un-parks the connection for everything that follows. So the cost is a
 * single wait of at most 5s (2.5s on average) on the FIRST op after minutes of inactivity, and
 * near-zero latency on every op after it — rather than 6.5-10.4s on all of them.
 *
 * 5s keeps that worst case inside the band the original measurement found acceptable, while still
 * cutting idle residency by more than two orders of magnitude.
 */
const POLL_WAIT_IDLE_MS = 5_000;
/**
 * Grace on top of the sleep we asked for, before the plugin is presumed gone. Covers the request
 * round trip, Studio's own scheduling jitter, and a slow network. Staleness is DERIVED from what
 * we told the plugin to do rather than being a second constant that can silently disagree with it
 * — the previous fixed 8s is exactly what made a 12s hold declare every op "Studio is not
 * connected".
 */
const POLL_STALE_GRACE_MS = 8_000;
const PLUGIN_TOKEN_TTL_MS = 30 * 24 * 3600 * 1000; // 30 days, then re-pair
const MAX_SNAPSHOT_BYTES = 12 * 1024 * 1024; // refuse absurd checkpoints
/**
 * How much of a checkpoint's description is kept.
 *
 * Long enough for a paragraph about what is in the snapshot and why it was taken, which is the
 * whole point of having a field beyond the 60-character label. CAPPED rather than rejected: losing
 * somebody's sentence because they wrote one more than the limit is a worse outcome than a
 * truncated one, and every checkpoint on this object shares one SQLite.
 */
const MAX_CHECKPOINT_DESCRIPTION = 500;
// The transcript is re-sent every step, and the budget includes the ~15k-char system prompt. At 24,000
// a building run kept about two turn groups and re-read what it had just read (F-039: 88 reads, 242
// Credits). The model takes 1M tokens and cached input is a fifth of the price, so the budget is
// larger, and a trim cuts to MAX_PROMPT_TARGET so the steps after it are appends the cache serves.
const MAX_PROMPT_CHARS = 60_000;
const MAX_PROMPT_TARGET = 42_000;

export class SessionDO extends DurableObject<Env> {
  private sql = this.ctx.storage.sql;
  private opQueue: PendingOp[] = [];
  private opWaiters = new Map<string, (r: OpResult) => void>();
  private pollWaiter: (() => void) | null = null;
  /** msgId of the run in flight, so a forwarded frame can be attributed. */
  private currentMsgId: string | undefined;
  private seq = 0;
  /** Current pairing identity and its validated capability report. Never shared across tokens. */
  private activePluginTokenHash: string | null = null;
  private pluginCapabilityReport: PluginCapabilityReportV1 | null = null;
  /** Which reported plugin build supplied `pluginCapabilityReport`. Null means no fresh authority. */
  private pluginCapabilityClient: PluginCapabilityClientIdentity | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`
        create table if not exists messages(
          id text primary key, role text not null, mode text, content text not null,
          tool_trace text,
          stop_reason text, run_failure text, credits_spent integer,
          context_used_chars integer, context_max_chars integer,
          context_dropped_groups integer, context_dropped_chars integer,
          denied_tools text,
          created_at integer not null);
        create index if not exists messages_time on messages(created_at);
        create table if not exists checkpoints(
          id text primary key, label text not null, kind text not null,
          script_count integer default 0, instance_count integer default 0,
          size_bytes integer default 0, created_at integer not null);
        create table if not exists checkpoint_chunks(
          checkpoint_id text not null, idx integer not null, data blob not null,
          primary key (checkpoint_id, idx));
        create table if not exists oplog(
          id integer primary key autoincrement, op_id text, kind text, ok integer,
          summary text, created_at integer not null);
        create table if not exists message_revisions(
          message_id text not null, seq integer not null, content text not null,
          created_at integer not null, primary key(message_id, seq));
        create table if not exists message_models(
          message_id text primary key, product_model text not null);
      `);
      //[[ WHY a failure is recorded as a KIND and not only as a sentence: see src/op-failure.ts.
      //
      //   `create table if not exists` does nothing at all to an object that already has the
      //   table, so the column has to be added explicitly for every project that existed before
      //   this. SQLite has no `add column if not exists`, so the duplicate-column error on every
      //   later boot is the expected outcome and is swallowed — it is the success case, not a
      //   fault, and letting it escape would take the whole object down on its second start. ]]
      try {
        this.sql.exec(`alter table oplog add column failure text`);
      } catch {
        /* already added on an earlier boot */
      }
      //[[ TERMINAL MESSAGE METADATA, WITHOUT REWRITING OLD HISTORY.
      //
      //   The live socket has always known how a run ended (`msg_end`), what the final settled
      //   Credit total was, and the last context-budget measurement. The SQLite row did not. A
      //   browser refresh therefore replaced a failed/stopped turn with the same text but NO
      //   outcome, which is not a cosmetic omission: the reloaded transcript contradicted the run
      //   the user had just watched.
      //
      //   These columns are deliberately scalar. No prompt, intent summary, hidden reasoning, or
      //   provider message is copied into terminal metadata. NULL on an older row means unknown;
      //   it must never be upgraded to `done` merely because the column did not exist yet. ]]
      const messageColumns = this.sql.exec(`select name from pragma_table_info('messages')`).toArray() as { name: string }[];
      const hasMessageColumn = (name: string) => messageColumns.some((column) => column.name === name);
      if (!hasMessageColumn('stop_reason')) this.sql.exec(`alter table messages add column stop_reason text`);
      if (!hasMessageColumn('run_failure')) this.sql.exec(`alter table messages add column run_failure text`);
      if (!hasMessageColumn('credits_spent')) this.sql.exec(`alter table messages add column credits_spent integer`);
      if (!hasMessageColumn('context_used_chars')) this.sql.exec(`alter table messages add column context_used_chars integer`);
      if (!hasMessageColumn('context_max_chars')) this.sql.exec(`alter table messages add column context_max_chars integer`);
      if (!hasMessageColumn('context_dropped_groups')) this.sql.exec(`alter table messages add column context_dropped_groups integer`);
      if (!hasMessageColumn('context_dropped_chars')) this.sql.exec(`alter table messages add column context_dropped_chars integer`);
      if (!hasMessageColumn('denied_tools')) this.sql.exec(`alter table messages add column denied_tools text`);
      //[[ WHICH RUN DID THIS. The record's anchor back into the conversation.
      //
      //   `PendingOp.runId` already tags every queued op — op-attribution.ts depends on it to stop
      //   a cancelled run's mutations reaching the place. The oplog threw it away, so no history
      //   row could name the run that made the change, and the workspace's own search handler had
      //   to say so: "the oplog row carries no anchor to a message". A user who finds the change
      //   could not get to the conversation that caused it.
      //
      //   Nullable on purpose. An op taken between runs — a manual checkpoint, a snapshot —
      //   belongs to NO run, and inheriting the previous one would send that user into a
      //   conversation that did not cause what they are looking at. ]]
      try {
        this.sql.exec(`alter table oplog add column run_id text`);
      } catch {
        /* already added on an earlier boot */
      }
      //[[ WHO TOOK THIS CHECKPOINT. Not guessed from its kind.
      //
      //   There was no author column, so the product inferred one: `kind === 'manual' ? 'you'`.
      //   On a shared project that is a false statement about a real person's work — every
      //   teammate's checkpoint was labelled as yours — and the checkpoint before a restore that
      //   discards someone's afternoon is exactly the row where "who did this" is the question.
      //
      //   Nullable, and null is meaningful twice: a row from before this column has no recorded
      //   author, and an `auto`/`pre_agent` checkpoint has no HUMAN author at all. Filling either
      //   in with whoever happens to be connected would put a name on work they did not do. ]]
      try {
        this.sql.exec(`alter table checkpoints add column author_id text`);
      } catch {
        /* already added on an earlier boot */
      }
      //[[ WHAT THIS SNAPSHOT CONTAINS, AND WHY IT WAS TAKEN.
      //
      //   A 60-character label was the only authored text on a checkpoint; everything else the
      //   drawer showed — the timestamp, the object count, the script count — is derived metadata
      //   that says nothing about what is IN the snapshot. And every automatic one carries the
      //   same label, so a list of them is a column of identical rows and the person restoring
      //   picks by timestamp. ]]
      try {
        this.sql.exec(`alter table checkpoints add column description text`);
      } catch {
        /* already added on an earlier boot */
      }
      const checkpointColumns = this.sql.exec(`select name from pragma_table_info('checkpoints')`).toArray() as { name: string }[];
      if (!checkpointColumns.some(column => column.name === 'coverage')) this.sql.exec(`alter table checkpoints add column coverage text`);
      if (!checkpointColumns.some(column => column.name === 'preserved_objects')) this.sql.exec(`alter table checkpoints add column preserved_objects integer`);
      const q = await this.ctx.storage.get<PendingOp[]>('opQueue');
      if (q) this.opQueue = q;
      const seq = await this.ctx.storage.get<number>('seq');
      if (seq) this.seq = seq;
      const tokenHash = (await this.ctx.storage.get<string>('pluginTokenHash')) ?? null;
      this.activePluginTokenHash = tokenHash;
      if (tokenHash) {
        const stored = await this.ctx.storage.get<unknown>(pluginCapabilitiesKey(tokenHash));
        const storedClient = await this.ctx.storage.get<PluginCapabilityClientIdentity>(pluginCapabilitiesClientKey(tokenHash));
        const currentClient = await this.ctx.storage.get<PluginClientInfo>('pluginClient');
        const currentIdentity = currentClient
          ? { version: currentClient.version, protocol: currentClient.protocol }
          : null;
        const report = normalisePluginCapabilities(stored);
        if (report && samePluginCapabilityClient(storedClient, currentIdentity)) {
          this.pluginCapabilityReport = report;
          this.pluginCapabilityClient = storedClient ?? null;
        } else if (stored !== undefined || storedClient !== undefined) {
          // Reports written before client-binding existed, or by a different plugin build, are not
          // evidence about the build that will execute the next op. Compatibility is safer than a
          // stale refusal that hides a capability the current plugin may now implement.
          await this.ctx.storage.delete([pluginCapabilitiesKey(tokenHash), pluginCapabilitiesClientKey(tokenHash)]);
        }
      }
      const lastSeen = (await this.ctx.storage.get<number>('pluginLastSeen')) ?? 0;
      //[[ THE LAST HEARTBEAT, NOT A VERDICT ABOUT IT.
      //
      //   This line used to read `this.pluginSeenRecently = Date.now() - lastSeen < 8000`, and that
      //   fixed 8 seconds is the rule `pluginConnected` was CHANGED AWAY FROM — the comment on it
      //   says why in one sentence: a fixed threshold cannot work once the sleep is adaptive, and
      //   8s would declare a healthy parked plugin dead 2s into a 10s hold. The fix landed in one
      //   place. This was the other one, and it is the one the MODEL reads.
      //
      //   What the customer saw: the header said "Studio last connected 13 seconds ago", the panel
      //   beside it said "Studio not connected", and the assistant said it had no way to check —
      //   three answers to one question on one screen, because two of them came from a rule the
      //   third had already replaced. Storing the timestamp and asking one function about it is
      //   what makes a second answer impossible rather than merely unlikely. ]]
      this.pluginLastSeenMs = lastSeen;
      //[[ A playtest outlives the instance that started it, for the same reason a run does.
      //
      //   `playtestRun` was instance-only, so an eviction mid-playtest lost it — and the guard
      //   in finishRun that exists to stop "a card that sits there counting up the age of a
      //   frame from a playtest that is long over" then reads a null and does nothing. That is
      //   precisely the state its own comment was written to prevent, and a reconnecting
      //   client got nothing either. See F-35. ]]
      const playtest = await this.ctx.storage.get<PlaytestRun>('playtestRun');
      if (playtest) this.playtestRunBacking = playtest;
      //[[ The binding, for the same reason as the playtest above.
      //
      //   The agent loop is driven by `alarm()`, which never calls `bind()` — so on an
      //   instance revived after eviction mid-run, `boundProjectId` was null, and
      //   `recordPlacedAsset` returned on its first line. Every insert_asset for the rest
      //   of that run recorded nothing, and an empty ledger reads CLEAN. That is the exact
      //   bug the producer was written to fix, re-entering through the recovery path. ]]
      const bound = await this.ctx.storage.get<{ projectId: string }>('bind');
      if (bound) this.boundProjectId = bound.projectId;
      //[[ The place binding, for the reason above it and one more: if this were read lazily on
      //   first use, an evicted-and-revived instance would see `null` on the poll that revived it
      //   and BIND to whatever place was open — turning the guard into a rubber stamp at exactly
      //   the moment it matters, since a long-evicted project is one the user has been away from
      //   and may well have opened something else since. ]]
      this.boundPlace = (await this.ctx.storage.get<StudioPlace>('pluginPlace')) ?? null;
    });
  }

  // ------------------------------------------------------------------ helpers
  private async bind(): Promise<{ projectId: string; projectName: string; ownerId: string } | null> {
    const b = (await this.ctx.storage.get<{ projectId: string; projectName: string; ownerId: string }>('bind')) ?? null;
    // Cached for `agentCtx`, which is synchronous and needs the project id to
    // attribute asset use. Every path that runs the agent reads the binding first
    // — the socket does it in `hello` — so by the time a tool runs this is set.
    if (b) this.boundProjectId = b.projectId;
    return b;
  }

  /**
   * Re-ask who may keep a durable run alive. `userId` remains the owner's billing identity; the
   * initiator is a separate, verified field so a collaborator's revocation cannot either charge
   * them or accidentally stop the owner's run.
   */
  private async runAccessVerdict(agent: Pick<AgentState, 'initiatedBy' | 'initiatorExpiresAt'>): Promise<RunAccessVerdict> {
    const bind = await this.bind();
    let mark =
      typeof agent.initiatedBy === 'string' && agent.initiatedBy.trim().length > 0
        ? await accessRevokedFor(this.ctx.storage, agent.initiatedBy)
        : null;
    let initiatorExpiresAt = agent.initiatorExpiresAt;
    const now = Date.now();
    if (
      typeof agent.initiatedBy === 'string'
      && agent.initiatedBy.trim().length > 0
      && agent.initiatedBy !== bind?.ownerId
    ) {
      const current = await currentAccessCursor(this.ctx.storage, agent.initiatedBy);
      if (current.status === 'known') initiatorExpiresAt = current.expiresAt ?? undefined;
      else if (current.status === 'corrupt') initiatorExpiresAt = 'unreadable-access-expiry';
      const event = accessCursorEvent(current.event);
      // The sequence is persisted before socket/fence effects. If the object crashes in that tiny
      // window, the cursor itself is enough to stop the run on its next alarm instead of waiting
      // for the outbox retry to reconstruct the mark.
      if (mark === null && event !== null && event.access !== 'clear') {
        mark = { userId: agent.initiatedBy, reason: event.access, at: now };
      }
      // `none` and the numeric rollout cursor fall back to the deadline pinned at ingress.
    }
    return runMustStop(
      {
        initiatedBy: agent.initiatedBy,
        ownerId: bind?.ownerId,
        initiatorExpiresAt,
      },
      mark,
      now,
    );
  }

  /** Stop a revoked/expired run before its next model step and purge its not-yet-delivered ops. */
  private async stopForAccess(agent: AgentState): Promise<boolean> {
    const verdict = await this.runAccessVerdict(agent);
    if (!verdict.stop) return false;
    agent.status = 'stopping';
    agent.finalText = agent.finalText || verdict.message;
    await this.dropOpsForRun(agent.msgId);
    await this.finishRun(agent, 'stopped');
    return true;
  }

  /**
   * Read additive model metadata without changing the long-lived messages table schema.
   *
   * The column holds a registry model id. Anything else in it — including the OpenRouter ids that
   * runs on a customer's own key wrote before BYOK was removed (D-VISION-1) — is dropped as
   * unknown, so such a turn is never relabelled as a model that did not run it.
   */
  private productModelsFor(ids: readonly string[]): Map<string, { productModel: ProductModel }> {
    const out = new Map<string, { productModel: ProductModel }>();
    if (ids.length === 0) return out;
    const placeholders = ids.map(() => '?').join(',');
    const rows = this.sql
      .exec(`select message_id, product_model from message_models where message_id in (${placeholders})`, ...ids)
      .toArray() as { message_id?: unknown; product_model?: unknown }[];
    for (const row of rows) {
      if (typeof row.message_id !== 'string') continue;
      const productModel = asProductModel(row.product_model);
      if (productModel) out.set(row.message_id, { productModel });
    }
    return out;
  }

  /**
   * Terminal facts that used to exist only on the live socket.
   *
   * Every value is validated on the way OUT as well as on the way in. These rows live for years
   * across worker versions; a corrupt/legacy scalar must disappear as unknown rather than become a
   * confident outcome after reload. `denied_tools` is the one list and is still stored as one
   * bounded SQLite TEXT scalar containing worker-owned registry names — never prompt text.
   */
  private terminalMetadataFor(ids: readonly string[]): Map<string, {
    stopReason?: 'done' | 'stopped' | 'error' | 'quota' | 'incomplete';
    error?: RunFailure;
    creditsSpent?: number;
    context?: { usedChars: number; maxChars: number; dropped?: { groups: number; chars: number } };
    deniedTools?: string[];
  }> {
    const out = new Map<string, {
      stopReason?: 'done' | 'stopped' | 'error' | 'quota' | 'incomplete';
      error?: RunFailure;
      creditsSpent?: number;
      context?: { usedChars: number; maxChars: number; dropped?: { groups: number; chars: number } };
      deniedTools?: string[];
    }>();
    if (ids.length === 0) return out;
    const placeholders = ids.map(() => '?').join(',');
    const rows = this.sql.exec(
      `select id, stop_reason, run_failure, credits_spent,
              context_used_chars, context_max_chars, context_dropped_groups, context_dropped_chars,
              denied_tools
         from messages where id in (${placeholders})`,
      ...ids,
    ).toArray() as Record<string, unknown>[];
    const reasons = new Set(['done', 'stopped', 'error', 'quota', 'incomplete']);
    for (const row of rows) {
      if (typeof row['id'] !== 'string') continue;
      const meta: {
        stopReason?: 'done' | 'stopped' | 'error' | 'quota' | 'incomplete';
        error?: RunFailure;
        creditsSpent?: number;
        context?: { usedChars: number; maxChars: number; dropped?: { groups: number; chars: number } };
        deniedTools?: string[];
      } = {};
      const stopReason = row['stop_reason'];
      if (typeof stopReason === 'string' && reasons.has(stopReason)) {
        meta.stopReason = stopReason as 'done' | 'stopped' | 'error' | 'quota' | 'incomplete';
      }
      if (isRunFailure(row['run_failure'])) meta.error = row['run_failure'];
      const credits = row['credits_spent'];
      if (typeof credits === 'number' && Number.isSafeInteger(credits) && credits >= 0) meta.creditsSpent = credits;

      const used = row['context_used_chars'];
      const max = row['context_max_chars'];
      if (
        typeof used === 'number' && Number.isSafeInteger(used) && used >= 0
        && typeof max === 'number' && Number.isSafeInteger(max) && max > 0
        && used <= max
      ) {
        const context: { usedChars: number; maxChars: number; dropped?: { groups: number; chars: number } } = {
          usedChars: used,
          maxChars: max,
        };
        const groups = row['context_dropped_groups'];
        const chars = row['context_dropped_chars'];
        if (
          typeof groups === 'number' && Number.isSafeInteger(groups) && groups > 0
          && typeof chars === 'number' && Number.isSafeInteger(chars) && chars > 0
        ) {
          context.dropped = { groups, chars };
        }
        meta.context = context;
      }

      if (typeof row['denied_tools'] === 'string') {
        try {
          const value = JSON.parse(row['denied_tools']) as unknown;
          if (
            Array.isArray(value)
            && value.length <= 128
            && value.every((name) => typeof name === 'string' && name.length > 0 && name.length <= 64 && /^[a-z0-9_]+$/.test(name))
          ) {
            meta.deniedTools = value;
          }
        } catch {
          /* corrupt legacy metadata is unknown, never a guessed empty list */
        }
      }
      if (Object.keys(meta).length > 0) out.set(row['id'], meta);
    }
    return out;
  }

  /**
   * Persist model identity beside a message; old rows remain valid and simply have no entry.
   * `model` is the registry id the run ran on.
   */
  private rememberProductModel(messageId: string, model: ProductModel): void {
    this.sql.exec(
      `insert into message_models(message_id, product_model) values(?,?)
         on conflict(message_id) do update set product_model = excluded.product_model`,
      messageId,
      model,
    );
  }

  /** Read only a successful QuotaDO state; an error body is never evidence of paid access. */
  private async productModelPlan(userId: string): Promise<string | undefined> {
    try {
      const stub = this.env.QUOTA_DO.get(this.env.QUOTA_DO.idFromName(userId));
      const res = await stub.fetch('https://do/state');
      if (!res.ok) return undefined;
      const data = (await res.json()) as { plan?: unknown };
      return typeof data?.plan === 'string' ? data.plan : undefined;
    } catch {
      return undefined;
    }
  }

  /** MAX admission is checked against the QuotaDO's plan, never against a client claim. */
  private async productModelVerdict(
    bind: { ownerId: string },
    mode: ProductMode,
    requested?: ProductModel,
  ): Promise<{ ok: true; model: ProductModel } | { ok: false; model: ProductModel; message: string }> {
    const model = effectiveProductModel(mode, requested);
    // The free lane is intentionally usable while a billing read is unavailable. MAX is the
    // paid capability, so only that lane needs an authoritative QuotaDO read.
    if (canUseProductModel(model, undefined)) return { ok: true, model };
    const plan = await this.productModelPlan(bind.ownerId);
    if (canUseProductModel(model, plan)) return { ok: true, model };
    return { ok: false, model, message: modelRefusal(model) };
  }

  /** The project this session is bound to, or null before the binding has been read. */
  private boundProjectId: string | null = null;

  /**
   * The collaboration store, built over this object's own SQLite on first use.
   *
   * Lazy rather than constructed in `blockConcurrencyWhile`: a project that nobody has ever
   * commented on should not pay for eight `create table if not exists` statements on every cold
   * start, and the store applies its own schema the moment it is first touched.
   */
  private collabStore: CollabStore | null = null;

  private get collab(): CollabStore {
    if (this.collabStore === null) this.collabStore = new CollabStore(this.sql);
    return this.collabStore;
  }

  /**
   * WHO IS ON THIS SOCKET.
   *
   * `X-Golem-Role` is trusted for exactly one reason: a Durable Object is reachable only through
   * its stub, every worker path that forwards to `/ws` SETS this header (overwriting whatever the
   * browser sent), and `sessionStub` is itself confined to ownership-checked and admin-gated call
   * sites by a static check in packages/evals/src/security.test.mjs. The value is still validated
   * against the allowlist rather than cast — a header that says `superuser` is a refusal, not a
   * role — and the owner is recognised from the binding rather than from anything on the wire.
   */
  private socketRole(req: Request, bind: { ownerId: string }): { userId: string; role: CollabRole } | null {
    const userId = req.headers.get('X-User-Id');
    if (!userId) return null;
    if (userId === bind.ownerId) return { userId, role: 'owner' };
    const role = asCollabRole(req.headers.get('X-Golem-Role'));
    return role === null ? null : { userId, role };
  }

  /** What each attached socket last told us about itself. Survives hibernation with the socket. */
  private presenceBeats(): unknown[] {
    const out: unknown[] = [];
    for (const ws of this.ctx.getWebSockets('client')) {
      try {
        const att = ws.deserializeAttachment() as unknown;
        if (att) out.push(att);
      } catch {
        /* a socket with no attachment is simply not present */
      }
    }
    return out;
  }

  /** The identity this socket was accepted with, or null for one that predates the attachment. */
  private beatOf(ws: WebSocket): {
    userId: string;
    role: CollabRole;
    connectionId: string;
    activity: PresenceActivity;
    grantExpiresAt: string | null | undefined;
  } | null {
    try {
      const att = ws.deserializeAttachment() as {
        userId?: unknown;
        role?: unknown;
        connectionId?: unknown;
        activity?: unknown;
        grantExpiresAt?: unknown;
      } | null;
      const role = asCollabRole(att?.role);
      if (!att || role === null || typeof att.userId !== 'string' || typeof att.connectionId !== 'string') return null;
      const activity = att.activity === 'typing' || att.activity === 'building' ? att.activity : 'viewing';
      const grantExpiresAt = Object.prototype.hasOwnProperty.call(att, 'grantExpiresAt')
        ? canonicalGrantExpiry(att.grantExpiresAt)
        : undefined;
      // A present unreadable deadline is a damaged permission attachment, not a permanent grant.
      if (Object.prototype.hasOwnProperty.call(att, 'grantExpiresAt') && grantExpiresAt === undefined) return null;
      return { userId: att.userId, role, connectionId: att.connectionId, activity, grantExpiresAt };
    } catch {
      return null;
    }
  }

  private attachedBeat(
    current: NonNullable<ReturnType<SessionDO['beatOf']>>,
    input: { role?: CollabRole; activity?: PresenceActivity; expiresAt?: string | null },
  ) {
    const beat = makeBeat({
      userId: current.userId,
      role: input.role ?? current.role,
      connectionId: current.connectionId,
      nowMs: Date.now(),
      activity: input.activity ?? current.activity,
    });
    if (beat === null) return null;
    const grantExpiresAt = input.expiresAt === undefined ? current.grantExpiresAt : input.expiresAt;
    return grantExpiresAt === undefined ? beat : { ...beat, grantExpiresAt };
  }

  /** Prefer the versioned cursor over a socket/run's ingress snapshot. */
  private async effectiveGrantAccess(
    userId: string,
    ownerId: string,
    fallback: string | null | undefined,
  ): Promise<{
    ok: true;
    expiresAt: string | null | undefined;
    event: { access: AccessChange; role: CollabRole | null } | null;
  } | { ok: false }> {
    if (userId === ownerId) return { ok: true, expiresAt: null, event: null };
    const current = await currentAccessCursor(this.ctx.storage, userId);
    if (current.status === 'corrupt') return { ok: false };
    const event = accessCursorEvent(current.event);
    if (current.event !== undefined && event === null) return { ok: false };
    return {
      ok: true,
      expiresAt: current.status === 'known' ? current.expiresAt : fallback,
      event,
    };
  }

  private async scheduleGrantExpiry(expiresAt: string | null | undefined): Promise<void> {
    if (typeof expiresAt !== 'string') return;
    const at = Date.parse(expiresAt);
    if (!Number.isFinite(at)) return;
    const existing = await this.ctx.storage.getAlarm();
    if (existing === null || at < existing) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, at));
  }

  /** Close naturally expired sockets and leave one alarm at the earliest remaining deadline. */
  private async enforceSocketExpiries(): Promise<void> {
    const bind = await this.bind();
    if (bind === null) return;
    const now = Date.now();
    let next: number | null = null;
    const byUser = new Map<string, Awaited<ReturnType<SessionDO['effectiveGrantAccess']>>>();
    for (const ws of this.ctx.getWebSockets('client')) {
      const beat = this.beatOf(ws);
      if (beat === null) continue;
      let effective = byUser.get(beat.userId);
      if (effective === undefined) {
        effective = await this.effectiveGrantAccess(beat.userId, bind.ownerId, beat.grantExpiresAt);
        byUser.set(beat.userId, effective);
      }
      if (!effective.ok) {
        try { ws.close(1008, 'access state unreadable'); } catch { /* already closing */ }
        continue;
      }
      if (effective.event?.access === 'removed' || effective.event?.access === 'suspended') {
        try { ws.close(1008, 'access changed'); } catch { /* already closing */ }
        continue;
      }
      const eventRole = effective.event?.role;
      const expiresAt = effective.expiresAt;
      const desiredRole = eventRole ?? beat.role;
      if (desiredRole !== beat.role || expiresAt !== beat.grantExpiresAt) {
        const updated = this.attachedBeat(beat, { role: desiredRole, expiresAt: expiresAt ?? null });
        if (updated !== null) {
          try { ws.serializeAttachment(updated); } catch { /* already closing */ }
        }
      }
      if (typeof expiresAt !== 'string') continue;
      const at = Date.parse(expiresAt);
      if (!Number.isFinite(at) || at <= now) {
        try { ws.close(1008, 'access expired'); } catch { /* already closing */ }
        continue;
      }
      next = next === null ? at : Math.min(next, at);
    }
    if (next !== null) await this.scheduleGrantExpiry(new Date(next).toISOString());
  }

  /** Refresh this socket's heartbeat, and tell the room. */
  private touch(ws: WebSocket, activity?: PresenceActivity) {
    const current = this.beatOf(ws);
    if (current === null) return;
    const beat = this.attachedBeat(current, { activity });
    if (beat === null) return;
    try {
      ws.serializeAttachment(beat);
    } catch {
      /* a closing socket cannot be updated, and does not need to be */
    }
    this.broadcastPresence();
  }

  /**
   * A MEMBERSHIP CHANGE, APPLIED TO THE SOCKETS THAT ARE ALREADY OPEN.
   *
   * Every HTTP route re-resolves membership on every request, so somebody who was removed is a
   * stranger on their next call. A WebSocket makes no further calls: the role was decided once at
   * the handshake (`socketRole`) and frozen into the attachment, and every later frame is gated
   * against that frozen value. So a member who was removed, suspended or demoted kept every
   * capability they had until they happened to reload — which, for a workspace tab left open, is
   * never.
   *
   * `role === null` is a removal and the socket is CLOSED, because there is no lesser role to
   * demote to and a socket that stays open on a project you are no longer on is the bug itself.
   * A demotion re-serializes the attachment, which is the same value `beatOf` reads before every
   * gated frame — so the next `chat` from a demoted tab is refused by the code that was always
   * there, rather than by a second copy of the rule living here.
   *
   * Returns what it actually did. `matched: 0` is a real and common answer — the person was not
   * connected — and the route reports it rather than an unconditional `ok: true`.
   */
  private async applyAccessChange(
    userId: string,
    role: CollabRole | null,
    access: AccessChange,
    expiresAt?: string | null,
  ): Promise<{ matched: number; closed: number; demoted: number }> {
    const agent = await this.ctx.storage.get<AgentState>('agent');
    const activeRunByUser =
      agent !== undefined &&
      agent.status !== 'idle' &&
      agent.initiatedBy === userId &&
      typeof agent.msgId === 'string' &&
      agent.msgId.length > 0;
    if (access === 'clear') {
      if (activeRunByUser && agent) {
        // Keep the revocation fence until the old run is idle. A regrant must never resurrect the
        // run it invalidated; finishRun consumes this deferred clear after purging its ops.
        if (await accessRevokedFor(this.ctx.storage, userId)) {
          await this.ctx.storage.put(accessClearPendingKey(userId), true);
        }
      } else {
        await clearAccessRevoked(this.ctx.storage, userId);
        await this.ctx.storage.delete(accessClearPendingKey(userId));
      }
    } else {
      await this.ctx.storage.delete(accessClearPendingKey(userId));
      await markAccessRevoked(this.ctx.storage, { userId, reason: access, at: Date.now() });
      if (activeRunByUser && agent) {
        // Purge before waking the alarm. The queue is the only durable boundary before Studio;
        // anything already delivered is intentionally not undone.
        await this.dropOpsForRun(agent.msgId);
        this.pollWaiter?.();
        await this.ctx.storage.setAlarm(Date.now() + 1);
      }
    }
    const expiryMs = typeof expiresAt === 'string' ? Date.parse(expiresAt) : null;
    const expiredNow = expiryMs !== null && (!Number.isFinite(expiryMs) || expiryMs <= Date.now());
    if (activeRunByUser && agent && expiredNow) {
      // Expiry is not a revocation mark because a later extension before the boundary may keep the
      // run alive. The version cursor is the authority; purge/wake here closes the delivery race.
      await this.dropOpsForRun(agent.msgId);
      this.pollWaiter?.();
      await this.ctx.storage.setAlarm(Date.now() + 1);
    }
    await this.scheduleGrantExpiry(expiresAt);
    let matched = 0;
    let closed = 0;
    let demoted = 0;
    for (const ws of this.ctx.getWebSockets('client')) {
      const beat = this.beatOf(ws);
      if (beat === null || beat.userId !== userId) continue;
      matched += 1;
      if (role === null || expiredNow) {
        try {
          // 1008 is "policy violation", which is what this is: the connection is no longer
          // permitted. The client reconnects and is refused at the door like anyone else.
          ws.close(1008, 'access changed');
          closed += 1;
        } catch {
          /* already closing */
        }
        continue;
      }
      const roleChanged = beat.role !== role;
      const expiryChanged = expiresAt !== undefined && beat.grantExpiresAt !== expiresAt;
      if (!roleChanged && !expiryChanged) continue;
      const next = this.attachedBeat(beat, { role, ...(expiresAt === undefined ? {} : { expiresAt }) });
      if (next === null) continue;
      try {
        ws.serializeAttachment(next);
        if (roleChanged) demoted += 1;
        // The tab is TOLD. Without this the controls keep offering what the server will now
        // refuse, and the person finds out by pressing one and reading a permission error they
        // have no explanation for.
        if (roleChanged) {
          ws.send(JSON.stringify({
            type: 'error',
            code: 'role_changed',
            message: `Your role on this project is now ${role}.`,
            terminal: false,
          } satisfies ServerMsg));
        }
      } catch {
        /* a closing socket cannot be updated, and does not need to be */
      }
    }
    if (matched > 0) this.broadcastPresence();
    return { matched, closed, demoted };
  }

  /**
   * A REFUSAL GOES TO THE PERSON WHO CAUSED IT.
   *
   * `broadcast` reaches every socket on the project, and these are refusals of ONE person's
   * request. "Apple is already working — stop the current run first." arriving on a colleague's
   * screen reads as something THEY did, and there is nothing on screen to tell them otherwise.
   * The role refusals two lines from the call sites have always been targeted; this brings the
   * busy ones into line with them.
   *
   * A run with no originating socket — the automation path — still broadcasts, because there is
   * no one person to answer and silence would be worse.
   */
  private refuseOne(origin: WebSocket | undefined, msg: Extract<ServerMsg, { type: 'error' }>) {
    // A refusal is the final answer to THIS request even when another collaborator's run remains
    // live. There may be no assistant msgId yet, so inventing msg_end would fabricate a run. An
    // explicit request-terminal bit is the only truthful signal clients can act on.
    const refusal: Extract<ServerMsg, { type: 'error' }> = { ...msg, terminal: true };
    if (origin === undefined) {
      this.broadcast(refusal);
      return;
    }
    try {
      origin.send(JSON.stringify(refusal));
    } catch {
      /* closed */
    }
  }

  /**
   * NOBODY IS BUILDING ONCE THE RUN HAS ENDED.
   *
   * `touch(ws, 'building')` is set when a chat starts, and nothing ever cleared it. The only other
   * calls to `touch` are the ping — which re-uses whatever activity is already there — and the
   * `presence` frame the browser never sent. So after a member's first message their face read
   * "is building" for the entire life of the socket, including hours after the run finished: an
   * indicator stating a fact that had stopped being true, which is worse than no indicator because
   * everyone else plans around it.
   *
   * Applied to EVERY socket rather than to the one that started the run, because the claim being
   * withdrawn is about the project. This object admits one run at a time (see `startGate`), so
   * when that run ends there is nobody left for whom `building` is true.
   */
  private clearBuildingBeats() {
    let changed = false;
    for (const ws of this.ctx.getWebSockets('client')) {
      const beat = this.beatOf(ws);
      if (beat === null || beat.activity !== 'building') continue;
      const next = this.attachedBeat(beat, { activity: 'viewing' });
      if (next === null) continue;
      try {
        ws.serializeAttachment(next);
        changed = true;
      } catch {
        /* a closing socket cannot be updated, and does not need to be */
      }
    }
    if (changed) this.broadcastPresence();
  }

  /** Tell everyone who is here. Called on connect, on heartbeat and on close. */
  private broadcastPresence() {
    const snap = presenceSnapshot(this.presenceBeats(), Date.now());
    this.broadcast({ type: 'presence', present: snap.present });
  }

  private broadcast(msg: ServerMsg) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets('client')) {
      try {
        ws.send(data);
      } catch {
        /* closed */
      }
    }
  }

  /**
   * Is the plugin still there?
   *
   * Judged against the deadline we set when we answered its last poll — last seen, plus the sleep
   * we TOLD it to take, plus grace. A fixed threshold cannot work once the sleep is adaptive: 8s
   * was correct for a 1s sleep and would declare a healthy parked plugin dead 2s into a 10s one.
   * `pollDueBy` is instance state, so after an eviction it falls back to the stored timestamp plus
   * the widest sleep we ever issue, which errs towards "still connected" for a few seconds rather
   * than towards a spurious "Studio is not connected" on the first op after a restart.
   */
  private async pluginConnected(): Promise<boolean> {
    const stored = (await this.ctx.storage.get<number>('pluginLastSeen')) ?? 0;
    return this.connectedGiven(Math.max(stored, this.lastSeenWrittenAt, this.pluginLastSeenMs));
  }

  /**
   * The same question, answered without awaiting storage.
   *
   * IT HAS TO BE SYNCHRONOUS because `AgentCtx.studioConnected` is, and that interface decides
   * which tools exist for a run and what the system prompt tells the model. Making it async would
   * mean changing the tool registry's signature; keeping a second, simpler rule meant the model was
   * answering from one clock and the screen from another, which is what actually happened.
   *
   * The in-memory heartbeat is at least as fresh as the stored one — it is written on every poll,
   * while the stored copy is checkpointed every few seconds to avoid write amplification — so the
   * only case this is blind to is an eviction with no poll since, and the wake path above loads the
   * stored value precisely for that.
   */
  private pluginConnectedNow(): boolean {
    return this.connectedGiven(Math.max(this.lastSeenWrittenAt, this.pluginLastSeenMs));
  }

  /**
   * WHAT THE OPEN TABS WERE LAST TOLD, so a change can be told to them too.
   *
   * Every `studio_status connected:true` in this file is broadcast by something that HAPPENS — a
   * poll arriving, a pairing, a queue being cleared. A plugin going away does not happen; it is the
   * absence of the next poll, and absences broadcast nothing. So a user who closed Studio, or whose
   * plugin took any of its own terminal paths, kept a green "Studio · <place>" pill in the header
   * until they reloaded the page. `pluginConnected()` — which the model reads — correctly refused to
   * build the whole time: two answers to one question on one screen, which is the defect this file
   * already carries a comment about at the wake path.
   *
   * There is no timer to hang this on that would not fight for the object's single alarm with the
   * run loop, which resets it to `now + 10ms` on every step. What there IS, already, is the
   * browser's own 25-second ping (see `webSocketMessage`): a tab that is showing the pill is by
   * definition a tab that is talking to us. Asking the question when it does costs one synchronous
   * comparison and bounds the stale pill at one ping instead of at forever.
   */
  private studioAnnouncedConnected = false;

  /**
   * Whether THIS instance has already sent the `connected:false`, so it is said once.
   *
   * IT IS A SECOND FIELD BECAUSE ONE FIELD COULD NOT SURVIVE AN EVICTION, AND THAT IS THE WHOLE
   * DEFECT. `studioAnnouncedConnected` means "a tab may believe the link is up". It is set from
   * things this instance DID — a poll it answered, a hello it sent — so a Durable Object that was
   * evicted while a hibernated socket stayed open comes back with it `false`, meaning "nothing to
   * correct", when the truth is "a green pill has been on that screen for ten minutes and the
   * object that painted it is gone". The guard then returned on its first line forever and the
   * disconnect was never announced at all. That is this repository's own observation-failure
   * pattern: a failure to REMEMBER rendered as an observation that there was nothing to say.
   *
   * The durable evidence is `pluginLastSeen`, which the constructor loads. A plugin that has ever
   * polled is a pairing that has, at some point, painted something green; saying `connected:false`
   * once per instance to correct it is at worst redundant and is never wrong. What must not happen
   * is saying it on every ping, which is what this field — not the other one — now prevents.
   */
  private studioSilenceAnnounced = false;

  /**
   * Announce a plugin that stopped polling, ONCE, to everyone watching.
   *
   * Guarded on whether the disconnect was already SAID rather than on whether this instance
   * happens to remember saying "connected", so this cannot become a `studio_status` per ping per
   * tab and cannot fall silent across an eviction. Synchronous on purpose: `pluginConnectedNow()`
   * is the same rule `pluginConnected()` applies, minus a storage read the constructor has already
   * done, so there is no second rule here to drift.
   */
  private noticeStudioSilence(): void {
    if (this.studioSilenceAnnounced) return;
    if (this.pluginConnectedNow()) return;
    const last = Math.max(this.lastSeenWrittenAt, this.pluginLastSeenMs);
    // Never paired, or explicitly revoked (which clears the heartbeat): there is no green pill
    // anywhere to correct, and an unprompted `connected:false` would be noise on a fresh project.
    if (!this.studioAnnouncedConnected && last <= 0) return;
    this.studioSilenceAnnounced = true;
    this.studioAnnouncedConnected = false;
    this.broadcast({
      type: 'studio_status',
      connected: false,
      // NOT null. "Never connected" and "connected until a moment ago" are different facts and the
      // header renders them differently — see the note on `studioLastSeenAt` in the hello frame.
      lastSeenAt: last > 0 ? last : null,
      queuedOps: this.opQueue.length,
      place: this.boundPlace,
      placeMismatch: null,
    });
  }

  /**
   * The instant the current heartbeat stops counting as a live link.
   *
   * The same arithmetic as `connectedGiven`, named once so the watchdog below cannot schedule
   * itself against a second rule. Zero means "no plugin has ever polled", which is not a deadline.
   */
  private studioStaleAt(): number {
    const last = Math.max(this.lastSeenWrittenAt, this.pluginLastSeenMs);
    if (!last) return 0;
    return Math.max(this.pollDueBy, last + POLL_WAIT_IDLE_MS + POLL_STALE_GRACE_MS);
  }

  /**
   * PUT A CLOCK ON THE GREEN PILL, because the browser's own clock is not one.
   *
   * `noticeStudioSilence` can only run when something wakes this object, and until now the only
   * thing that woke an idle one was the tab's 25-second ping. Three things were measured wrong
   * with that. A backgrounded tab has its timers throttled to roughly one a minute, so the ping is
   * not a 25-second bound, it is a browser-policy bound — 57s and 117s were both measured on the
   * deployed product for the identical action. An evicted object wakes with no memory of having
   * said "connected" (see `studioSilenceAnnounced`). And a socket that is merely OPEN sends
   * nothing at all, so a perfectly healthy WebSocket can carry six ping/pong round trips over 150
   * seconds without the disconnect ever being computed.
   *
   * An alarm is the only thing in this runtime that fires when nobody does anything. Set at the
   * moment the heartbeat expires, it turns "eventually, if the tab feels like pinging" into a
   * bound of POLL_WAIT_IDLE_MS + POLL_STALE_GRACE_MS + one alarm — about thirteen seconds — with
   * no dependence on the browser at all.
   *
   * WHY IT DOES NOT FIGHT THE RUN LOOP. It only ever moves the alarm EARLIER, and `alarm()`
   * re-arms it on every entry, so the sequence is self-healing: the run loop's `now + 10ms`
   * overwrites this deadline, that alarm fires, and the first thing it does is set this one again.
   * The run loop wins the race and loses nothing, because a step that runs is a step that also
   * re-arms the watchdog.
   *
   * It is armed only while a tab is actually watching. A pill nobody can see is not a lie worth
   * waking a Durable Object for, and this is the difference between an alarm every thirteen
   * seconds per WATCHED project and one per PAIRED project forever.
   */
  private async armStudioWatchdog(): Promise<void> {
    if (!this.pluginConnectedNow()) return;
    if (this.ctx.getWebSockets('client').length === 0) return;
    // A quarter second past the deadline, so the alarm cannot land in the same millisecond the
    // link is still nominally alive and then have to be re-armed for one more tick.
    const at = this.studioStaleAt() + 250;
    if (at <= 0) return;
    const existing = await this.ctx.storage.getAlarm();
    if (existing !== null && existing <= at) return;
    await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, at));
  }

  /**
   * ONE rule, so there cannot be two answers. Both readers above are this function.
   *
   * `pollDueBy` EXTENDS the window, it does not replace it. Its own declaration says what it is —
   * "last answer + the sleep we issued + grace" — so it exists for the case where we told the
   * plugin to sleep longer than the default idle and the heartbeat-derived deadline would
   * therefore expire mid-hold. That is a reason to take the LATER of the two.
   *
   * It was written as `this.pollDueBy || …`, which takes it INSTEAD, and that inverts the meaning
   * whenever the issued deadline has lapsed but a heartbeat has arrived since. A plugin
   * reconnecting to a still-warm SessionDO does exactly that: handlePluginPoll writes the
   * heartbeat, broadcasts `studio_status connected:true` to the browser, then holds the request
   * for POLL_HOLD_WARM_MS before refreshing `pollDueBy`. For those six seconds the screen said
   * connected and this function said false.
   *
   * Six seconds would be a small window if the answer were re-read, but it is not: a run started
   * in it computes `studioConnected` once, builds the system prompt from it, and keeps that prompt
   * as `agent.llm[0]` for the whole run — a prompt reading "Roblox Studio is NOT connected" and a
   * tool set with no building tools in it. That is the owner's report exactly: the plugin says
   * connected, the pill is green, and the model says it cannot see Studio.
   *
   * A fresh heartbeat is positive evidence of life. A lapsed deadline we issued earlier is not
   * evidence of death once a poll has arrived after it.
   */
  private connectedGiven(last: number): boolean {
    if (!last) return false;
    const fromHeartbeat = last + POLL_WAIT_IDLE_MS + POLL_STALE_GRACE_MS;
    return Date.now() < Math.max(this.pollDueBy, fromHeartbeat);
  }

  /**
   * When the plugin last polled, or null if it never has.
   *
   * Reads the larger of the checkpointed value and the in-memory one for the same reason
   * `pluginConnected()` does: the heartbeat is only written to storage every 4s, so between
   * checkpoints storage is behind by up to that much and reporting it would age the link by four
   * seconds every time somebody opened a tab.
   *
   * IT DID NOT DO THAT, and the comment above was a claim rather than a description. The in-memory
   * copy of the heartbeat is `pluginLastSeenMs` — written on EVERY poll. `lastSeenWrittenAt` is the
   * checkpoint clock: it is assigned `now` in the same breath as `storage.put('pluginLastSeen',
   * now)` and is therefore always EQUAL to `stored`, never ahead of it, so the Math.max could not
   * move the answer by a millisecond. What it reported was the last CHECKPOINT, up to four seconds
   * behind the truth — stalest during a fast run, which is when the checkpoint is skipped most and
   * when the most is happening.
   *
   * `pluginConnected()` three lines up takes the max of all THREE. This now asks the same question
   * of the same three clocks, which is the only way there cannot be a second answer.
   */
  private async pluginLastSeenAt(): Promise<number | null> {
    const stored = (await this.ctx.storage.get<number>('pluginLastSeen')) ?? 0;
    const last = Math.max(stored, this.lastSeenWrittenAt, this.pluginLastSeenMs);
    return last > 0 ? last : null;
  }

  /**
   * The whole state of this project's link to Studio, in one shape, for the owner.
   *
   * `paired` and `connected` are kept apart deliberately: a project keeps its pairing across a
   * Studio restart and a closed laptop, and collapsing the two would send a user to mint a code
   * they already have. Everything here was already known to this object and none of it was
   * reachable by the person who owns the project — `/info` carries most of it and sits behind the
   * admin key.
   */
  private async linkSummary(): Promise<StudioLinkSummary> {
    const client = await this.ctx.storage.get<PluginClientInfo>('pluginClient');
    const hash = await this.ctx.storage.get<string>('pluginTokenHash');
    return {
      paired: !!hash,
      connected: await this.pluginConnected(),
      lastSeenAt: await this.pluginLastSeenAt(),
      queuedOps: this.opQueue.length,
      pluginVersion: client?.version ?? null,
      pluginProtocol: client?.protocol ?? null,
      place: this.boundPlace,
    };
  }

  /** When this project last did anything: a run stepped, or an op was queued. */
  private async lastActivityAt(): Promise<number> {
    if (this.lastActivity) return this.lastActivity;
    const agent = await this.ctx.storage.get<AgentState>('agent');
    this.lastActivity = agent?.lastStepAt ?? 0;
    return this.lastActivity;
  }

  // ------------------------------------------------------------------ fetch
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === '/init' && req.method === 'POST') {
      const body = (await req.json()) as { projectId: string; projectName: string; ownerId: string };
      const existing = await this.bind();
      if (existing && existing.ownerId !== body.ownerId) return json({ error: 'owner mismatch' }, 403);
      await this.ctx.storage.put('bind', { projectId: body.projectId, projectName: body.projectName, ownerId: body.ownerId });
      this.boundProjectId = body.projectId;
      return json({ ok: true });
    }

    const bind = await this.bind();
    if (!bind) return json({ error: 'session not initialized' }, 400);

    if (path === '/ws') {
      // A MEMBER MAY WATCH; WHAT THEY MAY DO IS DECIDED PER MESSAGE.
      //
      // This used to be `userId !== bind.ownerId → 403`, which is correct for a single-tenant
      // product and is the whole of "shared projects" in a collaborative one. The identity is
      // resolved here once and rides on the socket; `webSocketMessage` asks the capability
      // question for each thing the socket tries to DO, because a viewer watching a build and a
      // viewer starting one are the same connection.
      const who = this.socketRole(req, bind);
      if (who === null) return json({ error: 'forbidden' }, 403);
      // The worker may carry the already-validated grant deadline over a private header. Keep the
      // value only in memory and pin it onto the run; never persist the member's JWT or the header.
      const rawGrantExpiry = req.headers.get('X-Golem-Grant-Expires-At');
      const grantExpiresAt = rawGrantExpiry === null ? null : canonicalGrantExpiry(rawGrantExpiry);
      if (grantExpiresAt === undefined) return json({ error: 'bad_grant_expiry' }, 400);
      // the JWT is kept only in memory for the lifetime of this DO instance so a
      // background memory sync can use it; it is never written to durable storage
      const jwt = req.headers.get('X-User-Jwt');
      if (jwt) this.liveJwt = jwt;
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      this.ctx.acceptWebSocket(server, ['client']);
      // The socket carries its own identity, so a hibernated object waking to a message still
      // knows who is on the other end without a storage read.
      const beat = makeBeat({ userId: who.userId, role: who.role, connectionId: crypto.randomUUID(), nowMs: Date.now() });
      if (beat === null) return json({ error: 'forbidden' }, 403);
      server.serializeAttachment({ ...beat, grantExpiresAt });
      await this.scheduleGrantExpiry(grantExpiresAt);
      // Everyone already here learns someone arrived; the arriver gets the list in the same shape
      // rather than a special one-off payload.
      this.broadcastPresence();
      const quota = await this.quotaState(bind.ownerId);
      // What this tab is about to be told is, from now on, what it believes — including after this
      // object was evicted and revived with a heartbeat it never saw arrive. Arming the flag from
      // the sentence we are actually sending is what makes `noticeStudioSilence` able to correct a
      // pill that was painted green by a hello rather than by a poll.
      const studioConnected = await this.pluginConnected();
      if (studioConnected) {
        this.studioAnnouncedConnected = true;
        // A fresh green pill is a fresh thing to correct later, whatever an earlier instance said.
        this.studioSilenceAnnounced = false;
      }
      server.send(
        JSON.stringify({
          type: 'hello',
          sessionId: bind.projectId,
          studioConnected,
          quota,
          //[[ "NOT CONNECTED" IS TWO DIFFERENT FACTS AND THE USER CAN ONLY ACT ON ONE OF THEM.
          //
          //   A Studio that stopped polling ten seconds ago is a hiccup; one that stopped in March
          //   is a machine that is off. The boolean reads identically for both, and the timestamp
          //   that separates them was already being kept — `pluginLastSeen`, checkpointed every 4s
          //   and used by `pluginConnected()` to make this very judgement. It simply never crossed
          //   the wire. Null means it has never polled at all, which is a third state again. ]]
          studioLastSeenAt: await this.pluginLastSeenAt(),
          queuedOps: this.opQueue.length,
          studioPlace: this.boundPlace,
        } satisfies ServerMsg),
      );
      const st = await this.ctx.storage.get<StudioEventState>('pluginState');
      if (st) {
        server.send(
          JSON.stringify({
            type: 'studio_status',
            connected: await this.pluginConnected(),
            state: st,
            lastSeenAt: await this.pluginLastSeenAt(),
            queuedOps: this.opQueue.length,
            place: this.boundPlace,
            placeMismatch: this.placeMismatch
              ? {
                  expectedPlaceName: this.placeMismatch.expected.placeName,
                  openPlaceName: this.placeMismatch.open.placeName,
                  openPlaceId: this.placeMismatch.open.placeId,
                }
              : null,
          } satisfies ServerMsg),
        );
      }
      // The selection as it stands, so a tab that opens mid-session shows what the user
      // has in front of them rather than an empty panel until their next click.
      const sel = this.pluginSelection ?? (await this.ctx.storage.get<StudioEventSelection>('pluginSelection')) ?? null;
      if (sel) {
        this.pluginSelection = sel;
        server.send(JSON.stringify({ type: 'studio_selection', selection: sel } satisfies ServerMsg));
      }
      // If a build is already in flight, hand the client the whole picture
      // straight away rather than making it ask.
      const live = await this.runSnapshot();
      if (live) server.send(JSON.stringify({ type: 'run_state', run: live } satisfies ServerMsg));
      // A playtest in flight, and the frames still in the ring. Without this, a
      // user who refreshes during a playtest gets an empty card until the next
      // capture tick — up to a rate-gate interval of looking at nothing while
      // their game is running. The frames are replayed with their ORIGINAL
      // capturedAt, so the staleness the card computes is the truth about when
      // they were rendered, not about when this socket opened.
      if (this.playtestRun) {
        server.send(JSON.stringify({ type: 'playtest_state', run: this.playtestRun } satisfies ServerMsg));
        for (const frame of this.frames.list()) {
          server.send(JSON.stringify({ type: 'studio_frame', frame } satisfies ServerMsg));
        }
      }
      // browsers abort the handshake unless a requested subprotocol is echoed back
      return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'golem.v1' } });
    }

    if (path === '/plugin/register' && req.method === 'POST') {
      const body = (await req.json()) as {
        tokenHash: string;
        pluginVersion?: string;
        pluginProtocol?: string;
        place?: unknown;
      };
      // Change the in-memory pairing fence before the first storage await below. A poll that
      // authenticated the previous token and resumes during this registration may finish, but it
      // can no longer install capabilities into the new pairing's live state.
      const priorActiveTokenHash = this.activePluginTokenHash;
      if (priorActiveTokenHash !== body.tokenHash) {
        this.activePluginTokenHash = body.tokenHash;
        this.pluginCapabilityReport = null;
        this.pluginCapabilityClient = null;
      }
      //[[ SUPERSESSION IS RECORDED, NOT ONLY PERFORMED.
      //
      //   A fresh pairing has always replaced the previous plugin token, and the Studio that lost
      //   it found out by getting a 401 on its next poll — a bare "invalid token", which is what
      //   this server also says to a forged one. Keeping the hash it used to be lets the poll tell
      //   those two apart and say the true thing: somebody paired this project from another
      //   window. Only the HASH is kept, never the token. ]]
      const previous = await this.ctx.storage.get<string>('pluginTokenHash');
      if (previous && previous !== body.tokenHash) {
        await this.ctx.storage.put('pluginSuperseded', { hash: previous, at: Date.now() });
      }
      if (previous !== body.tokenHash) {
        if (previous) {
          await this.ctx.storage.delete([pluginCapabilitiesKey(previous), pluginCapabilitiesClientKey(previous)]);
        }
        await this.ctx.storage.delete([pluginCapabilitiesKey(body.tokenHash), pluginCapabilitiesClientKey(body.tokenHash)]);
      }
      // a fresh pairing supersedes any previous plugin token for this project
      await this.ctx.storage.put({ pluginTokenHash: body.tokenHash, pluginTokenIssuedAt: Date.now() });
      //[[ THE PLACE, CONFIRMED AT PAIRING RATHER THAN DISCOVERED LATER.
      //
      //   The plugin sends what it has open in the claim, so the binding exists before the first
      //   op can be queued. A pairing from a plugin too old to send one, or from a place that has
      //   never been saved to Roblox, simply leaves this unbound — `placeAdmission` then binds on
      //   the first identifiable state event, and refuses nothing in the meantime. ]]
      const claimed = placeAdmission(null, readPlaceReport(body.place), Date.now());
      const place = claimed.verdict === 'bind' ? claimed.place : null;
      if (place) await this.ctx.storage.put<StudioPlace>('pluginPlace', place);
      else await this.ctx.storage.delete('pluginPlace');
      this.boundPlace = place;
      this.placeMismatch = null;
      // Record what paired, at the moment it paired, so the server knows what it is
      // talking to before the first poll rather than after it. A plugin that reports
      // nothing simply leaves this unknown, which every consumer already handles.
      await this.recordPluginClient(sanitizeVersion(body.pluginVersion), parseProtocol(body.pluginProtocol));
      // The bound place travels back out so the claim response can CONFIRM it — the plugin prints
      // which place it just bound this project to, rather than the user finding out later, or not
      // at all. Null is the honest answer for a place that cannot be identified.
      return json({ ok: true, place });
    }

    if (path === '/plugin/poll' && req.method === 'POST') {
      const token = req.headers.get('X-Golem-Token') ?? '';
      const expect = await this.ctx.storage.get<string>('pluginTokenHash');
      let issuedAt = await this.ctx.storage.get<number>('pluginTokenIssuedAt');
      if (issuedAt === undefined) {
        // pairing predates token expiry — grandfather it in from now rather than locking it out
        issuedAt = Date.now();
        await this.ctx.storage.put('pluginTokenIssuedAt', issuedAt);
      }
      if (!expect || Date.now() - issuedAt > PLUGIN_TOKEN_TTL_MS) {
        const staleHash = expect ?? this.activePluginTokenHash;
        if (staleHash && this.activePluginTokenHash === staleHash) {
          this.activePluginTokenHash = null;
          this.pluginCapabilityReport = null;
          this.pluginCapabilityClient = null;
          await this.ctx.storage.delete([pluginCapabilitiesKey(staleHash), pluginCapabilitiesClientKey(staleHash)]);
        }
        return json({ error: 'token expired', message: 'This pairing has expired. Pair again from the Apple web app.' }, 401);
      }
      const presented = await sha256hex(token);
      if (!(await timingSafeEqual(presented, expect))) {
        // Was this the token we replaced? Then the honest answer is not "invalid" — this plugin
        // was paired correctly and has been superseded, which is a thing the user did and can
        // therefore understand and undo. Anything else really is an unknown token.
        const superseded = await this.ctx.storage.get<{ hash: string; at: number }>('pluginSuperseded');
        if (superseded && (await timingSafeEqual(presented, superseded.hash))) {
          return json(
            {
              error: 'superseded',
              message:
                'This project was paired again from another Studio window, so this one was disconnected. ' +
                'Pair again from the Apple web app to bring it back here.',
            },
            401,
          );
        }
        return json({ error: 'invalid token' }, 401);
      }
      //[[ AN ACTIVELY USED PAIRING MUST NOT LAPSE.
      //
      //   `pluginTokenIssuedAt` was written once, at pairing, and never again — so the 30-day clock
      //   ran from the pairing rather than from use, and a Studio that polled every four seconds
      //   for a month was cut off on the same day as one that was never opened again. There is no
      //   renewal path anywhere: the only remedy was minting a new pairing code, for a link that
      //   was working.
      //
      //   Slid only past the HALFWAY mark, and only after the token has already been accepted.
      //   Past halfway because this runs on every poll of every connected Studio and an
      //   unconditional write would be a storage put every four seconds for nothing. After the
      //   check because doing it before would resurrect a pairing that had already lapsed —
      //   the expiry would become unreachable, which is the same defect as no expiry at all. ]]
      if (Date.now() - issuedAt > PLUGIN_TOKEN_TTL_MS / 2) {
        await this.ctx.storage.put('pluginTokenIssuedAt', Date.now());
      }
      const reported = readPluginHeaders(req.headers);
      const body = (await req.json()) as PluginPollRequest;
      return this.handlePluginPoll(body, reported, expect);
    }

    //[[ COLLABORATION: comments, mentions, reactions, reviews, approvals and version history.
    //
    //   One door, because the thing that must cross exactly once is the IDENTITY. The worker has
    //   already resolved who this is and what they may do; `collabContext` re-validates the role
    //   against the allowlist here rather than trusting the string, and a body that cannot produce
    //   an actor produces a refusal from every method in the store.
    //
    //   The store does the writing and makes none of the decisions — see do/collab-store.ts. ]]
    if (path === '/collab' && req.method === 'POST') {
      const payload = (await req.json().catch(() => null)) as {
        method?: unknown;
        path?: unknown;
        body?: unknown;
        userId?: unknown;
        role?: unknown;
        directory?: unknown;
      } | null;
      if (!payload || typeof payload.method !== 'string' || typeof payload.path !== 'string') {
        return json({ error: 'bad_request' }, 400);
      }
      const body = payload.body && typeof payload.body === 'object' ? (payload.body as Record<string, unknown>) : {};
      const ctx = collabContext(
        payload.userId,
        payload.role,
        Date.now(),
        Array.isArray(payload.directory) ? payload.directory : undefined,
      );
      const out = this.collab.handle(payload.method, payload.path, body, ctx);
      return json(out.body, out.status);
    }

    if (path === '/collab/access-changed' && req.method === 'POST') {
      // Called immediately by a membership route and at-least-once by the durable outbox. The
      // version is persisted before effects and an equal version is deliberately re-applied: if the
      // object crashed after persisting the sequence but before closing a socket/marking a run, the
      // duplicate is the recovery path. Only a LOWER version is stale.
      const payload = (await req.json().catch(() => null)) as {
        userId?: unknown;
        role?: unknown;
        access?: unknown;
        version?: unknown;
        expiresAt?: unknown;
      } | null;
      const userId = typeof payload?.userId === 'string' && payload.userId.length > 0 ? payload.userId : null;
      if (userId === null) return json({ error: 'bad_request' }, 400);
      // THE OWNER'S ROLE IS THE `projects.owner_id` COLUMN and no membership write can move it, so
      // a request to change it is a programming error rather than a demotion to apply.
      if (userId === bind.ownerId) return json({ error: 'owner_is_not_a_member' }, 400);
      // A ROLE THIS BUILD CANNOT READ IS A REMOVAL, not a role left as it was. `asCollabRole`
      // returns null for anything outside the allowlist, and leaving the socket at the
      // capabilities it already had would be the one direction that must never be the default.
      const role = payload?.role === null || payload?.role === undefined ? null : asCollabRole(payload.role);
      const access: AccessChange =
        payload?.access === 'removed' || payload?.access === 'suspended' || payload?.access === 'demoted' || payload?.access === 'clear'
          ? payload.access
          : role === null
            ? 'removed'
            : 'clear';
      const version = payload?.version;
      if (version !== undefined && version !== null && (typeof version !== 'number' || !Number.isSafeInteger(version) || version <= 0)) {
        return json({ error: 'bad_version' }, 400);
      }
      return this.ctx.blockConcurrencyWhile(async () => {
        const order = await acceptAccessChangeVersion(
          this.ctx.storage,
          userId,
          version,
          payload?.expiresAt,
          `${access}:${role ?? 'none'}`,
        );
        if (order.reason === 'invalid') return json({ error: 'bad_version' }, 400);
        if (order.reason === 'conflict') return json({ error: 'access_event_conflict' }, 409);
        if (order.reason === 'corrupt_storage') return json({ error: 'access_version_unavailable' }, 500);
        if (!order.accepted) {
          // A stale event is successfully CONSUMED. Returning 200 lets the exact outbox row be
          // acknowledged; replaying it forever cannot improve the state and would only keep work
          // permanently due.
          return json({ matched: 0, closed: 0, demoted: 0, applied: false, stale: true, version, previous: order.previous });
        }
        const changed = await this.applyAccessChange(userId, role, access, order.expiresAt);
        // Preserve the old exact response shape for rollout-era direct pushes and their tests.
        return order.versioned
          ? json({ ...changed, applied: true, duplicate: order.reason === 'duplicate', version })
          : json(changed);
      });
    }

    if (path === '/collab/presence' && req.method === 'GET') {
      // Derived from the sockets that are actually attached, never from a stored list: a list
      // would outlive the connections it describes, and presence that outlives the connection is
      // the feature failing in the one way its users would never notice.
      const snap = presenceSnapshot(this.presenceBeats(), Date.now());
      return json(snap);
    }

    if (path === '/messages' && req.method === 'GET') {
      const before = Number(url.searchParams.get('before')) || Date.now() + 1;
      const limit = Math.min(100, Number(url.searchParams.get('limit')) || 50);
      const rows = this.sql
        .exec(`select id, role, mode, content, tool_trace, created_at from messages where created_at < ? order by created_at desc limit ?`, before, limit)
        .toArray() as { id: string; role: string; mode: string | null; content: string; tool_trace: string | null; created_at: number }[];
      const productModels = this.productModelsFor(rows.map((r) => r.id));
      const terminal = this.terminalMetadataFor(rows.map((r) => r.id));
      //[[ HOW MANY EARLIER VERSIONS EACH MESSAGE HAS, counted here rather than asked for later.
      //
      //   The conversation needs this to decide whether to draw an "edited" mark at all. A request
      //   per turn would be fifty requests on a long conversation, and the marks would appear one
      //   by one as they landed. One grouped count over a table that is empty for almost every
      //   project costs nothing. The TEXT is not sent — it is only fetched if someone asks to read
      //   it, because a long conversation of edited prompts would otherwise double this payload.
      const counts = new Map<string, number>();
      for (const c of this.sql
        .exec(`select message_id, count(*) as n from message_revisions group by message_id`)
        .toArray() as { message_id: string; n: number }[]) {
        counts.set(c.message_id, c.n);
      }
      return json({
        messages: rows.reverse().map((r) => ({
          id: r.id,
          role: r.role,
          mode: r.mode,
          ...(productModels.get(r.id) ?? {}),
          ...(terminal.get(r.id) ?? {}),
          content: r.content,
          toolTrace: r.tool_trace ? JSON.parse(r.tool_trace) : null,
          createdAt: new Date(r.created_at).toISOString(),
          revisions: counts.get(r.id) ?? 0,
        })),
      });
    }

    if (path === '/message-revisions' && req.method === 'GET') {
      //[[ WHAT THE USER WROTE BEFORE THEY EDITED IT.
      //
      //   Oldest first, because this is read as a history: "you first asked X, then Y, and now Z"
      //   only makes sense in the order it happened.
      //
      //   No ownership check here — this object is only reachable through the worker route, which
      //   resolves the caller with `withOwnedProject` first. Said out loud because the absence of a
      //   check on a route that returns someone's own words should read as a decision, not as an
      //   omission.
      const id = url.searchParams.get('id') ?? '';
      if (!id) return json({ error: 'expected a message id' }, 400);
      const rows = this.sql
        .exec(`select seq, content, created_at from message_revisions where message_id = ? order by seq asc`, id)
        .toArray() as { seq: number; content: string; created_at: number }[];
      return json({
        revisions: rows.map((r) => ({ seq: r.seq, content: r.content, createdAt: new Date(r.created_at).toISOString() })),
      });
    }

    if (path === '/memory' && req.method === 'GET') {
      // The DO's copy is authoritative. The Supabase columns are a MIRROR kept for the dashboard,
      // written best-effort at the tail of a run with whatever JWT happened to be live — so it can
      // lag, and reading it here would show the user something the agent is not actually using.
      const stored = (await this.ctx.storage.get<unknown>('memory')) ?? null;
      return json({ memory: normaliseMemory(stored), editedAt: (await this.ctx.storage.get<string>('memoryEditedAt')) ?? null });
    }

    if (path === '/memory' && req.method === 'PUT') {
      //[[ CORRECT WHAT APPLE BELIEVES.
      //
      //   Memory is written by a model from the conversation, unreviewed, and then steers every
      //   later run. A fact that is wrong — "the doors use a custom DoorService" after the user
      //   tore that out — is not a cosmetic problem: it is a wrong instruction the agent keeps
      //   following, and until now there was no way to reach it.
      //
      //   The whole memory is REPLACED rather than patched. A partial update needs the client and
      //   the server to agree on identity for a list of free-text strings that the model rewrites
      //   every few turns, and they would not agree for long. ]]
      const body = (await req.json().catch(() => null)) as unknown;
      if (!body || typeof body !== 'object') return json({ error: 'expected a memory object' }, 400);

      //[[ AN EDIT IS NOT AN AUTHORSHIP CLAIM, AND IT IS NOT AN ANSWER TO THE REVIEW QUEUE.
      //
      //   `applyUserEdit` keeps the origin of every fact that was already there — correcting a typo
      //   in one line does not make the other eleven yours — and leaves pending proposals pending,
      //   because discarding them because somebody fixed a typo would be a decision the product
      //   made on the user's behalf. It normalises what it is handed, so the credential scan and
      //   the caps still run on this path. ]]
      const memory = applyUserEdit(await this.ctx.storage.get<unknown>('memory'), normaliseMemory((body as { memory?: unknown }).memory ?? body));
      await this.ctx.storage.put('memory', memory);
      const editedAt = new Date().toISOString();
      await this.ctx.storage.put('memoryEditedAt', editedAt);
      return json({ memory, editedAt });
    }

    if (path === '/memory/suggestions' && req.method === 'POST') {
      //[[ ANSWERING WHAT APPLE ASKED TO REMEMBER.
      //
      //   Under `review` the distiller writes into a queue instead of into memory, and this is the
      //   only door out of that queue. Two things are load-bearing:
      //
      //     - THE DECISION NAMES WHAT IT IS ABOUT. The client sends the fact's TEXT, and a decision
      //       about something that is no longer proposed comes back 404 rather than 200. A panel
      //       that had been open for ten minutes would otherwise report "discarded" for a
      //       suggestion a second tab had already accepted — a decision the user never made,
      //       displayed as one they did.
      //     - ACCEPTING IS NOT AUTHORING. The accepted fact is recorded as the MODEL's, because
      //       that is who wrote it; re-attributing it on approval would erase the only trace that
      //       it was ever proposed. ]]
      const body = (await req.json().catch(() => null)) as { decision?: unknown; fact?: unknown; target?: unknown } | null;
      if (!body || typeof body !== 'object') return json({ error: 'expected a decision object' }, 400);
      if (!isSuggestionDecision(body.decision)) return json({ error: 'decision must be accept or discard' }, 400);
      const stored = await this.ctx.storage.get<unknown>('memory');
      const out =
        body.target === 'summary'
          ? decideSuggestedSummary(stored, body.decision)
          : decideSuggestedFact(stored, body.fact, body.decision);
      if (!out.matched) return json({ error: 'that is not waiting for a decision', memory: normaliseMemory(stored) }, 404);
      await this.ctx.storage.put('memory', out.memory);
      // The same stamp the editor writes: a memory a person has curated and one the model wrote
      // unattended are different things, and accepting a proposal is curation.
      const editedAt = new Date().toISOString();
      await this.ctx.storage.put('memoryEditedAt', editedAt);
      return json({ memory: out.memory, editedAt });
    }

    if (path === '/search' && req.method === 'GET') {
      //[[ SEARCH THE WHOLE PROJECT, NOT THE PART THE UI HAPPENS TO HOLD — AND NOT ONLY WHAT WAS SAID.
      //
      //   A client-side filter over the last 100 messages is the cheap version, and it is worse
      //   than nothing: it answers "not found" for text that IS in the conversation, and the user
      //   has no way to tell that from the real answer. So the query runs here, against every row.
      //
      //   It also runs against every KIND of row. A user looking for "the door checkpoint" was
      //   searching a transcript for the name of a checkpoint; a user looking for the render the
      //   agent produced was searching prose for an artifact. The records this gathers — messages,
      //   the tool steps that produced artifacts, checkpoints, the operation log, and what Apple
      //   remembers — are the five things a project actually contains.
      //
      //   MATCHING AND RANKING HAPPEN IN `runSearch`, NOT HERE. The SQL below narrows rows; it
      //   does not decide what a result is. That split is what lets the prefilter be skipped
      //   entirely for a query SQLite's ASCII-only case folding would mishandle, without any other
      //   part of the answer changing — see `likePrefilterable`.
      //
      //   ORDER IS BY RELEVANCE. `order by created_at desc limit 40` answers "what matched most
      //   recently", which is a different question and the one the UI had to apologise for by
      //   saying "showing the most recent — there are more". ]]
      const raw = url.searchParams.get('q') ?? '';
      const filter = parseSearchFilter(url.searchParams);
      const echo = {
        query: raw.trim(),
        // What was actually applied, so the panel renders the filter the server used rather than
        // the one the user believes it sent.
        applied: { types: filter.types, authors: filter.authors, from: filter.from, to: filter.to },
        ignored: filter.ignored,
      };
      if (!isSearchable(raw)) {
        return json({ ...echo, tooShort: raw.trim().length < MIN_QUERY, results: [], counts: zeroCounts(), total: 0, more: false, scanned: 0, scanTruncated: false });
      }
      if (filter.impossible) {
        // Every filter was narrowed away, or the window closes before it opens. Returning the
        // unfiltered project here would be a full page of results for a question nobody asked.
        return json({ ...echo, impossible: true, results: [], counts: zeroCounts(), total: 0, more: false, scanned: 0, scanTruncated: false });
      }
      const gathered = await this.searchRecords(filter, url.searchParams.get('viewer') || null);
      const out = runSearch(gathered.records, filter);
      return json({ ...echo, ...out, scanned: gathered.scanned, scanTruncated: gathered.truncated });
    }

    if (path === '/export' && req.method === 'GET') {
      //[[ THE WHOLE CONVERSATION, AS A FILE THE USER OWNS.
      //
      //   `/messages` pages backwards for the UI and caps at 100. An export that silently returned
      //   the most recent hundred and called itself the transcript would be a file that LOOKS
      //   complete, which is worse than no export: the user keeps it, and only discovers the gap
      //   when they need the part that was cut.
      //
      //   So this reads everything, and reports the count it actually wrote. The cap that remains
      //   is a real one — DO SQLite is bounded and a transcript is not unbounded in practice — and
      //   when it bites the response says so in `truncated` rather than staying quiet. ]]
      const EXPORT_MAX = 5000;
      const rows = this.sql
        .exec(
          `select id, role, mode, content, tool_trace, created_at from messages order by created_at asc limit ?`,
          EXPORT_MAX + 1,
        )
        .toArray() as { id: string; role: string; mode: string | null; content: string; tool_trace: string | null; created_at: number }[];
      const truncated = rows.length > EXPORT_MAX;
      const kept = truncated ? rows.slice(0, EXPORT_MAX) : rows;
      const productModels = this.productModelsFor(kept.map((r) => r.id));
      const terminal = this.terminalMetadataFor(kept.map((r) => r.id));
      const bind = await this.bind();
      const total = (this.sql.exec(`select count(*) as n from messages`).one() as { n: number }).n;

      return json({
        project: { id: bind?.projectId ?? null, name: bind?.projectName ?? null },
        exportedAt: new Date().toISOString(),
        // Stated rather than implied: a consumer can tell a complete transcript from a clipped one
        // without counting the array itself.
        messageCount: kept.length,
        totalMessages: total,
        truncated,
        messages: kept.map((r) => ({
          id: r.id,
          role: r.role,
          mode: r.mode,
          ...(productModels.get(r.id) ?? {}),
          ...(terminal.get(r.id) ?? {}),
          content: r.content,
          toolTrace: r.tool_trace ? JSON.parse(r.tool_trace) : null,
          createdAt: new Date(r.created_at).toISOString(),
        })),
      });
    }

    if (path === '/checkpoints' && req.method === 'GET') {
      const rows = this.sql
        .exec(`select id, label, kind, script_count, instance_count, size_bytes, created_at, author_id, description, coverage, preserved_objects from checkpoints order by created_at desc limit 50`)
        .toArray() as { id: string; label: string; kind: string; script_count: number; instance_count: number; size_bytes: number; created_at: number; author_id: string | null; description: string | null; coverage: string | null; preserved_objects: number | null }[];
      return json({
        checkpoints: rows.map((r) => ({
          id: r.id,
          label: r.label,
          kind: r.kind as CheckpointMeta['kind'],
          createdAt: r.created_at,
          scriptCount: r.script_count,
          instanceCount: r.instance_count,
          sizeBytes: r.size_bytes,
          ...(r.coverage === 'exact' || r.coverage === 'supported-subset' ? { coverage: r.coverage, preservedObjects: r.preserved_objects ?? 0 } : {}),
          /** Who took it, or null for one Apple took and for a row that predates the column. */
          authorId: r.author_id,
          /** What it contains or why it was taken. Null when nobody wrote one. */
          description: r.description,
        })),
      });
    }

    if (path === '/checkpoint' && req.method === 'POST') {
      // `authorId` is set by index.ts from the AUTHENTICATED user, never by a browser: this object
      // is reachable only through its stub, and every route that forwards here has already
      // resolved who is asking. See socketRole's comment for the same reasoning on the ws path.
      const { label, authorId, description } = (await req.json()) as { label: string; authorId?: string; description?: string };
      const res = await this.createCheckpoint((label || 'manual checkpoint').slice(0, 60), 'manual', {
        authorId: typeof authorId === 'string' && authorId ? authorId : null,
        description: typeof description === 'string' ? description : null,
      });
      return json(res, 'error' in res ? 409 : 200);
    }

    if (path === '/restore' && req.method === 'POST') {
      const { checkpointId } = (await req.json()) as { checkpointId: string };
      // Same rule as the socket path: no restore while a run is writing to the place.
      const running = await this.ctx.storage.get<AgentState>('agent');
      if (running && running.status !== 'idle') return json({ ok: false, error: RESTORE_WHILE_RUNNING }, 409);
      const res = await this.restoreCheckpoint(checkpointId);
      return json(res, res.ok ? 200 : 409);
    }

    if (path === '/purge' && req.method === 'POST') {
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.close(1000, 'project deleted');
        } catch {
          /* already closed */
        }
      }
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      return json({ ok: true });
    }

    // Start a real agent run without a WebSocket client. This is how the visual benchmark suite
    // drives builds end-to-end: a human typing chat messages cannot be part of an automated
    // regression run. It takes exactly the path a chat message takes — same startRun, same tools,
    // same quota, same budget — so what it measures is the real agent, not a test harness.
    if (path === '/agent-run' && req.method === 'POST') {
      const { text, mode, effort, productModel, autonomous } = (await req.json()) as {
        text: string;
        mode?: ProductMode;
        effort?: Effort;
        productModel?: unknown;
        autonomous?: unknown;
      };
      if (!text?.trim()) return json({ ok: false, error: 'text required' }, 400);
      const agent = await this.ctx.storage.get<AgentState>('agent');
      if (agent?.status === 'running') return json({ ok: false, error: 'a run is already in progress' }, 409);
      // `effort` pins the reasoning tier for the whole run, overriding the adaptive policy. It
      // exists so the policy itself can be A/B tested against real builds rather than against
      // text-only probes — the measurement that missed the tool-calling regression.
      const runMode = mode === undefined || mode === null ? 'agent' : asProductMode(mode);
      if (!runMode) return json({ ok: false, error: `unknown mode` }, 400);
      const runAutonomous = runMode === 'agent' && autonomous === true;
      const selectedModel = asProductModel(productModel);
      if (selectedModel === null) return json({ ok: false, error: 'unknown product model' }, 400);
      const modelVerdict = await this.productModelVerdict(bind, runMode, selectedModel);
      if (!modelVerdict.ok) return json({ ok: false, error: modelVerdict.message, code: 'product_model_unavailable' }, 403);
      await this.startRun(bind, text.slice(0, MESSAGE_MAX_CHARS), runMode, effort, undefined, undefined, selectedModel, runAutonomous, bind.ownerId);
      return json({ ok: true, started: true, mode: runMode, autonomous: runAutonomous, ...(selectedModel ? { productModel: selectedModel } : {}), effort: effort ?? 'adaptive' });
    }

    // Run one Studio op directly, with no agent loop and no inference. The visual eval harness
    // uses this to capture renders as evidence: paying a model to ask for a screenshot would make
    // every eval run cost money and would confound what is being measured.
    // Admin-only: run one agent TOOL directly, so a tool's real behaviour can be exercised against
    // live Studio without paying for a whole agent run to reach it. Added to prove the playtest
    // restore end to end; unreachable without the admin key.
    if (path === '/run-tool' && req.method === 'POST') {
      const { tool, args } = (await req.json()) as { tool: string; args?: unknown };
      const out = await runTool(this.agentCtx(), tool, JSON.stringify(args ?? {}));
      return json(out);
    }

    /**
     * One agent tool, driven by an MCP client rather than by a model.
     *
     * SEPARATE FROM `/run-tool` ON PURPOSE, and for the reason `/companion-op` is separate from
     * `/studio-op` below: `/run-tool` forwards whatever tool name it is handed and is reachable
     * only with the admin key, while this route is reachable by any customer's API key. The
     * allowlist is therefore checked HERE as well as in index.ts — a check in the caller is a
     * convention the next caller forgets, a check in the receiver is a property of the route.
     *
     * `MCP_TOOL_NAMES` is the same constant the HTTP handler filters on, so the two boundaries
     * cannot disagree about what the surface is.
     */
    if (path === '/mcp-tool' && req.method === 'POST') {
      const { tool, args } = (await req.json().catch(() => ({}))) as { tool?: unknown; args?: unknown };
      if (typeof tool !== 'string' || !MCP_TOOL_NAMES.includes(tool)) {
        return json({ error: `${typeof tool === 'string' ? tool : 'that tool'} is not on the MCP surface.` }, 403);
      }
      const out = await runTool(this.agentCtx(), tool, JSON.stringify(args ?? {}));
      return json(out);
    }

    if (path === '/studio-op' && req.method === 'POST') {
      const { op, timeoutMs } = (await req.json()) as { op: StudioOp; timeoutMs?: number };
      if (!(await this.pluginConnected())) return json({ ok: false, error: 'Studio is not connected' }, 409);
      return json(await this.execStudioOp(op, Math.min(timeoutMs ?? 45_000, 120_000)));
    }

    /**
     * The same picture a reconnecting browser gets, over HTTP.
     *
     * Read by DiscordDO's progress pusher: a Discord reply has no socket to broadcast onto, so the
     * only way to say "step 4 of 12, critiquing" is to ask. Deliberately the SAME snapshot the web
     * client sees, so the two surfaces can never disagree about what the run is doing.
     */
    if (path === '/run-state') {
      return json({ run: await this.runSnapshot() });
    }

    /**
     * One companion op, driven by a person rather than by a model.
     *
     * The caller's PERMISSION is checked in index.ts, which is the only place that has a
     * user. What is checked HERE is which ops this channel carries at all, and it is
     * checked again on purpose: `/studio-op` above forwards anything it is handed, and
     * the difference between the two routes is the entire security boundary. A single
     * check in the caller is a convention the next caller forgets; a check in the
     * receiver is a property of the route.
     */
    if (path === '/companion-op' && req.method === 'POST') {
      const body = (await req.json().catch(() => null)) as { op?: Record<string, unknown>; timeoutMs?: number } | null;
      const raw = body?.op;
      if (!raw || typeof raw !== 'object' || companionOpAccess(raw) === null) {
        return json({ ok: false, error: companionRefusal(raw) }, 400);
      }
      if (!(await this.pluginConnected())) return json({ ok: false, error: 'Studio is not connected' }, 409);
      // Shorter ceiling than /studio-op: a person is watching this one, and a request the
      // panel holds open for two minutes is indistinguishable from a broken panel.
      const timeoutMs = Math.min(Math.max(Number(body?.timeoutMs) || 20_000, 1_000), 60_000);
      return json(await this.execStudioOp(sanitizeCompanionOp(raw) as unknown as StudioOp, timeoutMs));
    }

    //[[ THE STUDIO LINK, FOR THE PERSON WHO OWNS THE PROJECT.
    //
    //   Everything below was already known to this object and none of it was reachable by a
    //   signed-in user. `/info` carries most of it and sits behind the admin key, so the product's
    //   own troubleshooting page could only tell people to try things — and two docs pages tell
    //   them to "disconnect from the web workspace", which until `/studio/revoke` below did not
    //   exist anywhere. index.ts owns the question of WHO may call these; this object owns what
    //   they say. ]]
    if (path === '/studio/link') {
      return json(await this.linkSummary());
    }

    if (path === '/studio/diagnostics') {
      const agent = await this.ctx.storage.get<AgentState>('agent');
      const state = await this.ctx.storage.get<StudioEventState>('pluginState');
      const issuedAt = (await this.ctx.storage.get<number>('pluginTokenIssuedAt')) ?? null;
      // The same window /info reports, and the same ordering, so an operator and a user are
      // looking at one record rather than two that can disagree.
      //
      // `runId` is renamed out of the column name here rather than left as `run_id`, because this
      // payload is read by the browser and every other field on it is already camelCase. A caller
      // that has to know the storage spelling of one field is a caller that will get it wrong.
      //[[ A HISTORY HAS TO BE READABLE PAST ITS FIRST SCREEN.
      //
      //   This served the last 25 rows and nothing else. Twenty-five ops is a few minutes of one
      //   build, and the payload gave no sign it had been cut — so a list that showed everything
      //   and a list that showed the newest fraction of everything looked identical to a caller,
      //   which is the worse of the two failures.
      //
      //   `before` is the oplog's own autoincrement id, descending, so a page can never repeat or
      //   skip a row the way an offset does when rows arrive while the user is reading. A cursor
      //   that does not parse is REFUSED rather than answered with the newest page: silently
      //   restarting is how an infinite scroll loops forever over the same twenty-five rows. ]]
      const OPS_MAX = 200;
      const beforeRaw = url.searchParams.get('before');
      const before = beforeRaw === null ? null : Number(beforeRaw);
      if (before !== null && !Number.isSafeInteger(before)) return json({ error: 'bad cursor' }, 400);
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 25, 1), OPS_MAX);
      // One extra row, purely to learn whether there IS a next page. Asking the database is the
      // only way to tell "that was all of them" from "that was as many as fitted".
      const opRows = (
        this.sql
          .exec(
            before === null
              ? `select id, op_id, kind, ok, summary, created_at, failure, run_id from oplog order by id desc limit ?`
              : `select id, op_id, kind, ok, summary, created_at, failure, run_id from oplog where id < ? order by id desc limit ?`,
            ...(before === null ? [limit + 1] : [before, limit + 1]),
          )
          .toArray() as { id: number; op_id: string; kind: string; ok: number; summary: string; created_at: number; failure: string | null; run_id: string | null }[]
      );
      const opPage = opRows.slice(0, limit);
      const recentOps = opPage.map((r) => ({
        op_id: r.op_id,
        kind: r.kind,
        ok: r.ok,
        summary: r.summary,
        created_at: r.created_at,
        failure: r.failure,
        /** The run that asked for this op, or null for one taken outside a run. */
        runId: r.run_id,
      }));
      return json({
        link: await this.linkSummary(),
        /** The page size actually applied, which is not necessarily the one asked for. */
        limit,
        /** The cursor for the next page, or null when this page reached the end of the log. */
        nextBefore: opRows.length > limit ? (opPage[opPage.length - 1]?.id ?? null) : null,
        agentStatus: agent?.status ?? 'idle',
        /** When the pairing token was issued and when it lapses — the 30-day clock, made visible. */
        pairedAt: issuedAt,
        pairingExpiresAt: issuedAt === null ? null : issuedAt + PLUGIN_TOKEN_TTL_MS,
        /** What Studio last said about itself. Null when it has never reported. */
        openPlace: state
          ? { placeName: state.placeName, placeId: state.placeId, gameId: state.gameId, isRunMode: state.isRunMode }
          : null,
        placeMismatch: this.placeMismatch
          ? {
              expectedPlaceName: this.placeMismatch.expected.placeName,
              openPlaceName: this.placeMismatch.open.placeName,
              openPlaceId: this.placeMismatch.open.placeId,
              message: this.placeMismatch.message,
            }
          : null,
        recentOps,
        // Typed against the shared shape the browser panel reads, so a renamed field here fails the
        // build rather than emptying a row on somebody's screen. This route was tested and had no
        // caller in apps/web for a long time, which is precisely the arrangement in which that
        // happens quietly.
      } satisfies StudioDiagnostics);
    }

    //[[ DISCONNECT THIS STUDIO. The route the documentation has been promising.
    //
    //   docs/troubleshooting and docs/plugin both tell the user to "disconnect from the web
    //   workspace"; there was no such thing. The only way to revoke a plugin's access was to
    //   delete the entire project.
    //
    //   Deleting the token hash is what actually revokes: the next poll cannot match it and is
    //   answered 401, which the plugin already handles by clearing its saved session. The
    //   heartbeat is cleared in the same breath so `pluginConnected()` reports the truth
    //   immediately rather than for one more poll interval, and the place binding goes with it
    //   because it described a pairing that no longer exists. ]]
    if (path === '/studio/revoke' && req.method === 'POST') {
      const tokenHash = (await this.ctx.storage.get<string>('pluginTokenHash')) ?? this.activePluginTokenHash;
      const had = !!tokenHash;
      this.activePluginTokenHash = null;
      this.pluginCapabilityReport = null;
      this.pluginCapabilityClient = null;
      await this.ctx.storage.delete([
        'pluginTokenHash', 'pluginTokenIssuedAt', 'pluginLastSeen', 'pluginPlace', 'pluginSuperseded',
        ...(tokenHash ? [pluginCapabilitiesKey(tokenHash), pluginCapabilitiesClientKey(tokenHash)] : []),
      ]);
      this.lastSeenWrittenAt = 0;
      this.pollDueBy = 0;
      this.pluginLastSeenMs = 0;
      this.boundPlace = null;
      this.placeMismatch = null;
      // Already said, so `noticeStudioSilence` must not say it a second time when the next ping
      // arrives and finds the heartbeat cleared.
      this.studioAnnouncedConnected = false;
      this.studioSilenceAnnounced = true;
      this.broadcast({ type: 'studio_status', connected: false, lastSeenAt: null, queuedOps: this.opQueue.length, place: null, placeMismatch: null });
      // A poll parked in the long hold is released at once, so the plugin learns within a
      // round trip instead of after the hold expires.
      this.pollWaiter?.();
      return json({ ok: true, revoked: had });
    }

    //[[ REBIND THE PROJECT TO THE PLACE STUDIO HAS OPEN NOW.
    //
    //   The escape hatch for the refusal above, and the reason that refusal is safe to ship. A
    //   user who genuinely moved their project into a new place — "Save As", a republish under a
    //   new id — would otherwise have to re-pair to get out of a permanent refusal. Clearing the
    //   binding is enough: the next identifiable state event binds, which is the same path a
    //   first-time pairing takes. ]]
    //[[ THROW AWAY THE WORK THAT IS WAITING.
    //
    //   Automatic cancellation was already built and proven: finishRun drops every op the ending
    //   run queued and resolves each dropped waiter with a `transport` failure rather than deleting
    //   it quietly. There was no EXPLICIT cancellation anywhere — the only queue mutations in this
    //   object were push, splice-on-poll, and that run-ended purge. So a user watching twelve
    //   changes stack up behind a Studio that had closed could not say "forget them": Stop reached
    //   only the ops belonging to a live run, and everything else sat waiting to be applied at
    //   whatever moment Studio came back, possibly to a place the user had since edited by hand.
    //
    //   THE WAITERS ARE RESOLVED, NOT DROPPED, and with `transport` rather than `timeout`. A
    //   dropped waiter becomes a 30-second timeout, and `timeout` is the one failure kind that is
    //   not safe to retry, because it means "this may already have been applied". A discarded op
    //   provably never reached Studio, so saying so is both true and the more useful answer. ]]
    if (path === '/studio/queue' && req.method === 'DELETE') {
      const discarded = this.opQueue;
      this.opQueue = [];
      await this.ctx.storage.put('opQueue', this.opQueue);
      for (const op of discarded) {
        const waiter = this.opWaiters.get(op.id);
        if (waiter) {
          this.opWaiters.delete(op.id);
          waiter({
            id: op.id,
            ok: false,
            error: 'This change was discarded before Studio collected it',
            failure: WORKER_FAILURES.runEnded,
          });
        }
      }
      // Every open tab is told the new depth, or the panel keeps offering to discard work that is
      // already gone.
      const stillConnected = await this.pluginConnected();
      // This frame IS what the tabs were last told, so `noticeStudioSilence` must not repeat it.
      this.studioAnnouncedConnected = stillConnected;
      this.studioSilenceAnnounced = !stillConnected;
      this.broadcast({
        type: 'studio_status',
        connected: stillConnected,
        lastSeenAt: await this.pluginLastSeenAt(),
        queuedOps: 0,
        place: this.boundPlace,
      });
      return json({ ok: true, discarded: discarded.length });
    }

    if (path === '/studio/place/rebind' && req.method === 'POST') {
      await this.ctx.storage.delete('pluginPlace');
      this.boundPlace = null;
      this.placeMismatch = null;
      this.pollWaiter?.();
      return json({ ok: true });
    }

    if (path === '/info') {
      const agent = await this.ctx.storage.get<AgentState>('agent');
      const msgs = this.sql.exec(`select count(*) as c from messages`).one() as { c: number };
      const oplog = this.sql
        .exec(`select op_id, kind, ok, summary, created_at from oplog order by id desc limit 25`)
        .toArray();
      return json({
        // deliberately no owner id here — this endpoint is operational, not a user lookup
        project: { id: bind.projectId, name: bind.projectName },
        agentStatus: agent?.status ?? 'idle',
        messages: msgs.c,
        pluginConnected: await this.pluginConnected(),
        queuedOps: this.opQueue.length,
        // The same record the owner sees at /studio/diagnostics, so the two views cannot drift.
        link: await this.linkSummary(),
        oplog,
      });
    }

    return json({ error: 'not found' }, 404);
  }

  // ------------------------------------------------------------------ websocket
  /**
   * A replayable picture of the run currently in flight, or null when idle.
   *
   * The run itself is durable: it is driven by a storage alarm and keeps
   * stepping with no sockets attached. What was not durable was the user's
   * view of it — `broadcast` drops every event sent while nobody is listening,
   * and the assistant row is only written to SQL at finishRun. So refreshing
   * the browser mid-build used to show the user their own message and nothing
   * else, with no indication that anything was still happening.
   */
  private async runSnapshot(): Promise<RunSnapshot | null> {
    const agent = await this.ctx.storage.get<AgentState>('agent');
    if (!agent || agent.status === 'idle') return null;
    return {
      msgId: agent.msgId,
      mode: agent.mode,
      ...(agent.autonomous ? { autonomous: true } : {}),
      ...(agent.productModel ? { productModel: agent.productModel } : {}),
      phase: agent.phase ?? 'planning',
      step: agent.step,
      totalSteps: MAX_RUN_STEPS,
      text: agent.streamedText ?? '',
      tools: agent.uiTools ?? [],
      startedAt: agent.startedAt,
      effort: agent.effort,
      effortReason: agent.effortReason,
      // Optional on the wire, and optional here: a run persisted by an older deployment simply
      // replays without the Intent and Plan rows rather than failing to replay at all.
      intent: agent.intent,
      // `tools_denied` is broadcast once, at the first step. Without this a refresh at step nine
      // would leave the run looking as though nothing had been withheld from it. Only sent when
      // something WAS withheld — an empty array here would claim a check the older runs never made.
      ...(agent.deniedTools?.length ? { deniedTools: agent.deniedTools } : {}),
    };
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)) as ClientMsg;
    } catch {
      return;
    }
    const bind = await this.bind();
    if (!bind) return;

    // A tab that is talking to us is a tab that is showing the Studio pill. If the plugin has gone
    // quiet since we last said otherwise, this is where everyone watching finds out — there is no
    // other event that fires when a plugin simply stops. See `noticeStudioSilence`.
    this.noticeStudioSilence();
    // A tab that is talking is also a tab worth waking this object for later. The ping is no
    // longer the bound — see `armStudioWatchdog` — but it is a free chance to notice that the
    // watchdog is missing, which is exactly the state an eviction leaves behind.
    await this.armStudioWatchdog();

    //[[ WHAT THIS SOCKET MAY DO, ASKED PER MESSAGE.
    //
    //   The handshake decided WHO. It cannot decide WHAT, because one connection carries reads and
    //   writes both: a viewer watching a build and a viewer trying to start one arrive on the same
    //   socket, a millisecond apart.
    //
    //   A socket with no readable identity is refused rather than assumed. Before this change only
    //   the owner could hold one, so a socket open across the deploy that introduced attachments
    //   IS the owner's — and defaulting it to `owner` on that reasoning is precisely the shape
    //   this repository keeps finding: an inference that is true today, load-bearing forever, and
    //   silent when it stops being true. The cost of refusing is one reconnect; the cost of
    //   assuming is every future socket that fails to carry a role.
    let me = this.beatOf(ws);
    if (me !== null) {
      const access = await this.effectiveGrantAccess(me.userId, bind.ownerId, me.grantExpiresAt);
      if (!access.ok) {
        try { ws.close(1008, 'access state unreadable'); } catch { /* already closing */ }
        return;
      }
      if (access.event?.access === 'removed' || access.event?.access === 'suspended') {
        try { ws.close(1008, 'access changed'); } catch { /* already closing */ }
        return;
      }
      const expiresMs = typeof access.expiresAt === 'string' ? Date.parse(access.expiresAt) : null;
      if (expiresMs !== null && (!Number.isFinite(expiresMs) || expiresMs <= Date.now())) {
        try { ws.close(1008, 'access expired'); } catch { /* already closing */ }
        return;
      }
      const currentRole = access.event?.role ?? me.role;
      if (access.expiresAt !== me.grantExpiresAt || currentRole !== me.role) {
        const updated = this.attachedBeat(me, { role: currentRole, expiresAt: access.expiresAt ?? null });
        if (updated !== null) {
          try { ws.serializeAttachment(updated); } catch { return; }
          me = { ...me, role: currentRole, grantExpiresAt: access.expiresAt };
        }
      }
      await this.scheduleGrantExpiry(access.expiresAt);
    }
    const mayNot = (action: Parameters<typeof can>[1]): boolean => me === null || !can(me.role, action);
    const refuse = (message: string) => {
      ws.send(JSON.stringify({ type: 'error', code: 'forbidden', message } satisfies ServerMsg));
    };

    switch (msg.type) {
      case 'ping':
        this.touch(ws);
        //[[ THE ROUND TRIP, MEASURED IN ONE CLOCK DOMAIN.
        //
        //   `t` is the browser's own timestamp, echoed back untouched. The server deliberately
        //   does NOT substitute its own clock: the difference between two unsynchronised clocks
        //   is not latency, and a "latency" reading that is really clock skew is a number that
        //   looks like a measurement and is not one. A tab from an older build sends no `t` and
        //   is ponged without one, which the client reads as "not measured" rather than as 0. ]]
        ws.send(JSON.stringify({ type: 'pong', ...(typeof msg.t === 'number' ? { t: msg.t } : {}) } satisfies ServerMsg));
        return;
      case 'presence':
        // The client says what it is doing; it does not get to say who it is.
        this.touch(ws, msg.activity === 'typing' || msg.activity === 'building' ? msg.activity : 'viewing');
        return;
      case 'resume':
        // Previously declared in the protocol and silently unhandled.
        ws.send(JSON.stringify({ type: 'run_state', run: await this.runSnapshot() } satisfies ServerMsg));
        return;
      case 'chat':
        {
          if (mayNot('chat')) {
            refuse(
              me === null
                ? 'This connection is out of date — reload the page to keep building.'
                : 'Your role on this project can read and comment, but not build.',
            );
            return;
          }
          const mode = asProductMode(msg.mode);
          if (!mode) {
            this.refuseOne(ws, { type: 'error', code: 'bad_mode', message: MODE_SKEW_REFUSAL });
            return;
          }
          const autonomous = mode === 'agent' && msg.autonomous === true;
          const productModel = asProductModel(msg.productModel);
          if (productModel === null) {
            this.refuseOne(ws, { type: 'error', code: 'bad_product_model', message: 'Unknown product model for this request.' });
            return;
          }
          const text = msg.text.slice(0, MESSAGE_MAX_CHARS);
          //[[ THE SAME BUILD, ASKED AGAIN.
          //
          //   Quota answers "can this account afford another run" and the IP limiter answers "is
          //   one address hammering the edge". Neither can see that this is the fourth copy of the
          //   same 600-word prompt in three minutes — each run is paid for and each request is
          //   under the ceiling, and all four burn a build on one intention.
          //
          //   The history is this project's own user messages, read here rather than kept in
          //   memory so a reconnect, a new isolate or a second tab does not reset the count. ]]
          // WHO sent it and WHICH project it was sent to. Without those two fields the abuse
          // findings below are a stream of anonymous complaints: an operator can see that somebody
          // pasted a credential or was refused for flooding and cannot see who, so nothing can be
          // followed up and no account can be looked at. `me` is the socket's verified identity —
          // not the project owner, who is frequently not the person typing.
          if (this.refuseAbusive(text, { actorId: me?.userId ?? null, projectId: bind.projectId })) return;
          //[[ THE FILES THE PERSON ATTACHED BECOME PART OF THE MESSAGE.
          //
          //   `attachments` has been on this frame since the protocol was written and this handler
          //   read `msg.text` and `msg.mode` and nothing else — so a file that was uploaded,
          //   stored, and shown as a chip on the composer was dropped on the floor at the one
          //   place it mattered, and the person got an answer about a file nobody had read.
          //
          //   AFTER the abuse check on purpose: scoring a 24,000-character fold as a submission
          //   would flag every attachment as spam, and the duplicate detector would stop reading
          //   the prompt the person actually wrote. The check is also fed the raw `text` rather
          //   than the folded prompt for exactly that reason.
          //
          //   The project comes from `bind`, never from the frame — that is what stops an id from
          //   somebody else's project resolving here. ]]
          const withFiles = await promptWithAttachments(this.env, bind.projectId, text, msg.attachments);
          await this.startRun(
            bind,
            withFiles,
            mode,
            undefined,
            ws,
            undefined,
            productModel,
            autonomous,
            me?.userId,
            me?.grantExpiresAt ?? undefined,
          );
        }
        return;
      case 'edit_resend': {
        //[[ CORRECT AN EARLIER PROMPT AND RUN AGAIN FROM THERE.
        //
        //   Everything from the edited message onward is deleted. That is what makes this a
        //   correction rather than a new question appended to a thread that still contains the
        //   mistake and the answer to it.
        //
        //   Three refusals before anything is destroyed, because this is irreversible:
        //
        //     1. Not mid-run. A run holds a copy of the agent blob for the length of a step and
        //        writes it back at the tail; deleting the messages it is writing about leaves a
        //        run narrating a conversation that no longer exists.
        //     2. The message must exist. A stale client — a tab open across a previous truncation
        //        — can ask to edit a row that is already gone, and the id of a deleted row must
        //        not silently become "truncate from the beginning".
        //     3. It must be a USER message. Editing what Apple said and replaying from there
        //        would let the transcript assert the assistant produced text it never produced. ]]
        if (mayNot('chat')) {
          refuse(
            me === null
              ? 'This connection is out of date — reload the page to keep building.'
              : 'Your role on this project cannot edit the conversation.',
          );
          return;
        }
        const mode = asProductMode(msg.mode);
        if (!mode) {
          this.refuseOne(ws, { type: 'error', code: 'bad_mode', message: MODE_SKEW_REFUSAL });
          return;
        }
        const autonomous = mode === 'agent' && msg.autonomous === true;
        const productModel = asProductModel(msg.productModel);
        if (productModel === null) {
          this.refuseOne(ws, { type: 'error', code: 'bad_product_model', message: 'Unknown product model for this request.' });
          return;
        }
        const modelVerdict = await this.productModelVerdict(bind, mode, productModel);
        if (!modelVerdict.ok) {
          this.refuseOne(ws, { type: 'error', code: 'product_model_unavailable', message: modelVerdict.message });
          return;
        }
        const agent = await this.ctx.storage.get<AgentState>('agent');
        if (agent && agent.status !== 'idle') {
          this.refuseOne(ws, { type: 'error', code: 'busy', message: 'Stop the current run before editing a message.' });
          return;
        }

        // `content` is selected for one reason: it is the only thing this handler destroys that
        // cannot be reconstructed from anywhere afterwards. Read here, kept below.
        const row = this.sql
          .exec(`select id, role, content, created_at from messages where id = ?`, msg.messageId)
          .toArray()[0] as { id: string; role: string; content: string; created_at: number } | undefined;
        if (!row) {
          this.broadcast({ type: 'error', code: 'edit', message: 'That message is no longer in the conversation.' });
          return;
        }
        if (row.role !== 'user') {
          this.broadcast({ type: 'error', code: 'edit', message: 'Only your own messages can be edited.' });
          return;
        }

        const text = msg.text.slice(0, MESSAGE_MAX_CHARS).trim();
        if (!text) {
          this.broadcast({ type: 'error', code: 'edit', message: 'An edited message cannot be empty.' });
          return;
        }

        // Counted BEFORE the delete: afterwards there is nothing left to count, and reporting a
        // number the client cannot verify is how "removed: 0" ends up on screen after 40 messages
        // vanish.
        const removed = (
          this.sql.exec(`select count(*) as n from messages where created_at >= ?`, row.created_at).one() as { n: number }
        ).n;
        this.sql.exec(`delete from message_models where message_id in (select id from messages where created_at >= ?)`, row.created_at);
        this.sql.exec(`delete from messages where created_at >= ?`, row.created_at);

        // Every client, not just the asker: a second tab would otherwise keep showing messages the
        // server has deleted, and nothing distinguishes that stale view from a live one.
        this.broadcast({ type: 'history_truncated', fromMessageId: row.id, removed });

        {
          //[[ WHAT THE USER WROTE BEFORE, KEPT.
          //
          //   The dialog in front of this says "That cannot be undone", and for the conversation it
          //   is still true — the replies are gone. What is no longer true is that the PROMPT is
          //   gone: the text they typed the first time is the one thing here that cannot be
          //   reconstructed from anything else, and it is now carried onto the message that
          //   replaces it (startRunInner does the carrying, because only it knows the new row's
          //   id).
          //
          //   `recordsRevision` and not `old !== new`: this same handler serves Try again and
          //   Regenerate, which resend the prompt VERBATIM so that re-running has one definition.
          //   Storing those would tell someone who regenerated four times that their message has
          //   four earlier versions, all identical to the one in front of them. The rule lives in
          //   @golem/shared because the web app increments its own count optimistically and the
          //   two must agree. ]]
          await this.startRun(
            bind,
            text,
            mode,
            undefined,
            ws,
            {
              from: row.id,
              previous: recordsRevision(row.content, text) ? row.content : null,
              at: row.created_at,
            },
            productModel,
            autonomous,
            me?.userId,
            me?.grantExpiresAt ?? undefined,
          );
        }
        return;
      }
      case 'stop': {
        // Stopping someone else's build is an act, not a view: a viewer watching a run must not be
        // able to end it.
        if (mayNot('chat')) return;
        // Written to its OWN key, never into the agent blob. The run holds a copy of that blob
        // for the length of a step and writes it back at the tail, so a stop written into the
        // same blob either gets erased by that write or erases the step's own progress,
        // depending only on which lands last. See stop-signal.ts.
        const agent = await this.ctx.storage.get<AgentState>('agent');
        if (agent && agent.status !== 'idle') {
          await requestStop(this.ctx.storage);
        }
        return;
      }
      case 'checkpoint_create': {
        if (mayNot('build')) {
          refuse('Your role on this project cannot create checkpoints.');
          return;
        }
        // `me.userId` — the socket's own identity, resolved at the handshake from a header the
        // worker sets. NOT anything on the frame: the frame is written by the browser, and an
        // authorId taken from it would let any member sign a checkpoint with another's name.
        const res = await this.createCheckpoint(msg.label.slice(0, 60) || 'checkpoint', 'manual', {
          authorId: me?.userId ?? null,
          description: msg.description ?? null,
        });
        if ('error' in res) this.broadcast({ type: 'error', code: 'checkpoint', message: res.error });
        return;
      }
      case 'checkpoint_restore': {
        // Restoring discards work other members did after the checkpoint, so it takes the same
        // capability the version history requires — admin or owner. See collab.ts.
        if (mayNot('restore_version')) {
          refuse('Restoring a checkpoint discards work other people did. Only a project admin can do that.');
          return;
        }
        // A restore rebuilds the place while a run would still be writing to it, so it waits for
        // the run to end, the same way editing a message does. Told to the presser only.
        const agent = await this.ctx.storage.get<AgentState>('agent');
        if (agent && agent.status !== 'idle') {
          this.refuseOne(ws, { type: 'error', code: 'busy', message: RESTORE_WHILE_RUNNING });
          return;
        }
        const res = await this.restoreCheckpoint(msg.checkpointId);
        if (!res.ok) this.broadcast({ type: 'error', code: 'restore', message: res.error ?? 'restore failed' });
        return;
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    // Reciprocate the close. The runtime does it itself on this compatibility date, and Cloudflare
    // documents the call as safe either way; measured 2026-09-23, a browser that closed its socket
    // still sat in CLOSING 27 s later, so the handshake is completed explicitly rather than assumed.
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
    } catch {
      /* already closed */
    }
    // The room has changed, and presence is derived from the sockets that are still attached, so
    // the people left behind need to be told.
    this.broadcastPresence();
  }

  // ------------------------------------------------------------------ agent run

  /** Admits one startRun at a time. See the comment on startRun. */
  private readonly startGate = singleFlight();

  /**
   * Start a run, at most one at a time.
   *
   * Durable Objects are single-threaded, but this function awaits — and the storage read that
   * decides whether a run is already in flight is one of the things it awaits. Two `chat`
   * frames arriving together both saw an idle agent, so both spent a Credit, both inserted a
   * user row, and one of the two `msg_start` broadcasts never got its `msg_end`: a message
   * that sits in the transcript spinning forever.
   *
   * The guard is an instance field set SYNCHRONOUSLY, before any await. That is the whole
   * point of it — a guard that is itself established across an await is just a smaller race.
   * In-memory is sufficient because the concurrency is within one instance: two frames on one
   * socket, or two sockets on one Durable Object, are all the same object.
   */
  private async startRun(
    bind: { projectId: string; projectName: string; ownerId: string },
    text: string,
    mode: ProductMode,
    forcedEffort?: Effort,
    /** The socket that asked, so the refusal reaches that person and not the room. */
    origin?: WebSocket,
    carryRevisionsFrom?: CarriedRevisions,
    productModel?: ProductModel,
    autonomous = false,
    initiatedBy?: string,
    initiatorExpiresAt?: string | number,
  ) {
    const attempt = await this.startGate(() =>
      this.startRunInner(bind, text, mode, forcedEffort, origin, carryRevisionsFrom, productModel, autonomous, initiatedBy, initiatorExpiresAt),
    );
    if (!attempt.ran) {
      this.refuseOne(origin, { type: 'error', code: 'busy', message: 'Apple is already working — stop the current run first.' });
    }
  }

  private async startRunInner(
    bind: { projectId: string; projectName: string; ownerId: string },
    text: string,
    mode: ProductMode,
    forcedEffort?: Effort,
    origin?: WebSocket,
    carryRevisionsFrom?: CarriedRevisions,
    productModel?: ProductModel,
    autonomous = false,
    initiatedBy?: string,
    initiatorExpiresAt?: string | number,
  ) {
    const existing = await this.ctx.storage.get<AgentState>('agent');
    if (existing && existing.status !== 'idle') {
      this.refuseOne(origin, { type: 'error', code: 'busy', message: 'Apple is already working — stop the current run first.' });
      return;
    }
    const access = await this.runAccessVerdict({ initiatedBy, initiatorExpiresAt });
    if (access.stop) {
      this.refuseOne(origin, { type: 'error', code: 'forbidden', message: access.message });
      return;
    }
    const modelVerdict = await this.productModelVerdict(bind, mode, productModel);
    if (!modelVerdict.ok) {
      this.refuseOne(origin, { type: 'error', code: 'product_model_unavailable', message: modelVerdict.message });
      return;
    }
    const selectedProductModel = modelVerdict.model;
    // Clear any stop left behind by a previous run. Belt and braces with finishRun's clear:
    // a stop that arrives in the moment a run is finishing can land after that clear, and it
    // must not travel into the run the user starts next.
    await clearStop(this.ctx.storage);

    // Credits are billed from measured usage after each model call, so entering a run only
    // requires having some balance left — the user is never charged for an estimate.
    const quota = await this.quotaSpend(bind.ownerId, 1, `chat_${mode}`);
    if (!quota.ok) {
      this.refuseOne(origin, { type: 'error', code: 'quota', message: 'Daily Credits are used up. They refill at midnight UTC.' });
      this.broadcast({ type: 'quota', quota: quota.state });
      return;
    }
    this.broadcast({ type: 'quota', quota: quota.state });
    // Mark the socket only after entitlement and quota admission succeeded. A refused MAX request
    // must not leave a collaborator's presence claiming that a build is in flight.
    if (origin) this.touch(origin, 'building');

    const userMsgId = crypto.randomUUID();
    this.sql.exec(`insert into messages(id, role, mode, content, created_at) values(?,?,?,?,?)`, userMsgId, 'user', mode, text, Date.now());
    this.rememberProductModel(userMsgId, selectedProductModel);

    //[[ THE EDIT HISTORY FOLLOWS THE MESSAGE.
    //
    //   An edit deletes the old row and this inserts a new one with a new id, so a chain left
    //   keyed on the old id is unreachable: rows nothing can read, and an "edited" mark that never
    //   appears on the message that was edited. Doing it here rather than in the `edit_resend`
    //   handler is not a preference — the new id does not exist until the line above.
    //
    //   Copy forward, append, then drop the old chain. The other order loses the history, and
    //   skipping the drop doubles it on every subsequent edit. `seq` continues from the rows just
    //   carried in: restarting at 0 collides with them, and the primary key turns a lost revision
    //   into an exception in the middle of someone's run.
    if (carryRevisionsFrom) {
      const { from, previous, at } = carryRevisionsFrom;
      this.sql.exec(
        `insert into message_revisions(message_id, seq, content, created_at)
           select ?, seq, content, created_at from message_revisions where message_id = ?`,
        userMsgId,
        from,
      );
      if (previous !== null) {
        const seq = (
          this.sql
            .exec(`select coalesce(max(seq), -1) + 1 as next from message_revisions where message_id = ?`, userMsgId)
            .one() as { next: number }
        ).next;
        this.sql.exec(
          `insert into message_revisions(message_id, seq, content, created_at) values(?,?,?,?)`,
          userMsgId,
          seq,
          previous,
          at,
        );
      }
      this.sql.exec(`delete from message_revisions where message_id = ?`, from);
    }

    const memory = normaliseMemory(await this.ctx.storage.get<unknown>('memory'));
    const studioConnected = await this.pluginConnected();
    const pluginState = await this.ctx.storage.get<StudioEventState>('pluginState');
    const traits = classifyRequest(text);
    // Derived from the user's own words, on the same line as the trait classifier and for the
    // same reason: both are free, both are deterministic, and both are true of this request
    // before a single token has been spent. See runIntentFor.
    const intent = runIntentFor(text);
    //[[ The run's fence id. Random per run, named in the system prompt, and used on every
    //   tool fence below, so a closing tag forged by tool content cannot match it. Tool output
    //   is NOT escaped — mangling it would corrupt the evidence the agent reasons from — so the
    //   tag carries a secret instead of relying on the content not containing one. ]]
    const fenceId = crypto.randomUUID().slice(0, 8);
    //[[ WHAT THE PERSON ASKED FOR, as opposed to what Apple worked out for itself.
    //
    //   Scoped memory lives in D1 rather than in this DO because it is not per-project: "answer me
    //   in Hebrew" is a fact about the person, and a preference that has to be re-taught in every
    //   new project is not a preference. The access context is built from what this DO has already
    //   PROVEN — it is bound to one project and knows its owner — so the read can only ever reach
    //   this project's rows, this owner's rows, and the organisations that owner belongs to.
    //
    //   Best-effort: a store that cannot be read must not take the conversation down with it. The
    //   fallback is EMPTY personalisation, which is the honest degraded state — no settings applied
    //   and no settings invented — and it is visible in the memory panel, which reads the same
    //   rows through the same functions. ]]
    const personalisation = await (async () => {
      try {
        const access = await memoryAccessFor(this.env, bind.ownerId, [bind.projectId]);
        return await personalisationForProject(this.env, access, { projectId: bind.projectId }, fenceId, {
          knownModelIds: allModels().map((m) => m.id),
          knownToolNames: toolNames(),
        });
      } catch {
        return EMPTY_PERSONALISATION;
      }
    })();
    this.pinnedPrefs = personalisation.prefs;
    const promptMemory = memoryForPrompt(memory, personalisation.memoryMode);
    const promptBaseTools = toolsForMode(mode, studioConnected, toolNames());
    const runAutonomous = mode === 'agent' && autonomous;
    const promptUserTools = runAutonomous
      ? promptBaseTools
      : applyToolPermissions(promptBaseTools, personalisation.prefs.tool_permissions);
    const promptCapabilityFilter = this.pluginToolFilter(promptUserTools);
    const sys = systemPrompt({
      mode,
      autonomous: runAutonomous,
      studioConnected,
      placeName: pluginState?.placeName ?? null,
      projectName: bind.projectName,
      //[[ MEMORY OFF MEANS OFF ON THE READ SIDE TOO.
      //
      //   A switch that only stopped new writes would leave the agent acting on everything it had
      //   already worked out — which is not what the person who turned it off asked for, and is
      //   indistinguishable from the switch not working.
      //
      //   What it does NOT drop is `personalisation` below. Those are settings the person TYPED —
      //   the language to answer in, the project's instructions, the team's rules. They are things
      //   they told Apple, not things Apple noticed, and silently ignoring them would be a second,
      //   unannounced setting hiding inside this one. ]]
      memorySummary: promptMemory.summary,
      memoryFacts: promptMemory.facts,
      // The art-direction brief is ~1,800 tokens on every step, so only visual requests pay for
      // it. The request text doubles as the scene-kind hint — resolveKind matches on substrings.
      sceneKind: traits.visualDesignTask && mode === 'agent' ? text : undefined,
      //[[ Same gate as sceneKind, on the trait that means INTERFACE rather than place.
      //   `designBrief` returns null when the library has nothing useful for this
      //   request, and null is a real answer: the library covers a fraction of the
      //   style families §L asks for, and padding a thin match into a prompt would
      //   spend tokens on every step to tell the model what it did not need. ]]
      uiBrief: traits.uiDesignTask && mode === 'agent' ? (designBrief(text)?.text ?? null) : null,
      studioCapabilityNote: pluginCapabilityPromptNote(promptCapabilityFilter),
      // The same narrowed set the first step will offer, so the prompt never instructs a call to a
      // tool the run was not given (propose_plan with Studio disconnected was the shipped case).
      offeredTools: promptCapabilityFilter.allowed,
      personalisation: personalisation.promptBlock,
      fenceId,
    });

    const history = (
      this.sql.exec(`select role, content from messages order by created_at desc limit 15`).toArray() as { role: string; content: string }[]
    )
      .reverse()
      .slice(0, -1) // drop the message we just inserted; re-added below
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content.slice(0, 4000) }));

    const msgId = crypto.randomUUID();
    const agent: AgentState = {
      status: 'running',
      mode,
      autonomous: runAutonomous,
      productModel: selectedProductModel,
      msgId,
      fenceId,
      // The original request is PINNED: the trim may never evict it. Losing it was the defect
      // trimTranscript documents — the agent kept working with no record of the task.
      llm: [{ role: 'system', content: sys }, ...history, { role: 'user', content: text, pinned: true }],
      ...(mode === 'agent' && forbidsChanges(text) ? { readOnly: true } : {}),
      ...(mode === 'agent' && isLightingOnlyRequest(text) ? { lightingOnly: true } : {}),
      step: 0,
      maxSteps: MAX_RUN_STEPS,
      creditsSpent: quota ? 1 : 0,
      // The admission charge above, apportioned exactly as QuotaDO took it. Spread rather than
      // assigned so an older QuotaDO that reports no split leaves both fields ABSENT — which is the
      // signal `refundRun` needs to decline instead of guessing. `?? {}` would write zeroes and
      // claim a run took nothing from either ledger, which is a different and false statement.
      ...(quota && typeof quota.fromAllowance === 'number' && typeof quota.fromCredits === 'number'
        ? { creditsFromAllowance: quota.fromAllowance, creditsFromCredits: quota.fromCredits }
        : {}),
      trace: [],
      finalText: '',
      startedAt: Date.now(),
      lastStepAt: Date.now(),
      userId: bind.ownerId,
      ...(typeof initiatedBy === 'string' && initiatedBy.trim().length > 0 ? { initiatedBy } : {}),
      ...(initiatorExpiresAt !== undefined ? { initiatorExpiresAt } : {}),
      highEffortUsed: 0,
      // Classified once from the user's own words, so every step of the run knows whether it is
      // design work, systems work, or an under-specified request that needs interpreting.
      traits,
      forcedEffort,
      request: text,
      toolPermissions: personalisation.prefs.tool_permissions,
      memoryMode: personalisation.memoryMode,
      // Persisted with the run, not just broadcast: a browser that refreshes mid-build replays
      // this out of runSnapshot() instead of losing the Intent and Plan rows.
      intent: intent ?? undefined,
    };
    await this.persistAgent(agent);
    // `userMsgId` tells the client what the row IT optimistically rendered is actually called here.
    // Without it every user message sent in the current session carried a client-minted id the
    // server had never heard of, and Edit / Try again / Regenerate — all of which resolve that id
    // against the messages table — answered "That message is no longer in the conversation" until
    // the page was reloaded. See web/src/lib/message-identity.ts.
    this.broadcast({ type: 'msg_start', msgId, role: 'assistant', mode, ...(runAutonomous ? { autonomous: true } : {}), productModel: selectedProductModel, userMsgId });
    // Exactly once per run, and only after msg_start so the client has a message to attach it to.
    if (intent) this.broadcast({ type: 'run_intent', msgId, intent });
    this.currentMsgId = agent.msgId;
    agent.phase = mode === 'plan' ? 'understanding' : 'planning';
    this.broadcast({ type: 'agent_status', phase: agent.phase });

    // Auto-checkpoint before builder modes touch the project.
    //
    // Everything here is inside a try, and the alarm below is outside it, because a throw on
    // this line used to skip `setAlarm` entirely — leaving the run at `status: 'running'` with
    // nothing scheduled to advance it. The staleness bypass cannot rescue that one: it requires
    // `agent.step > 0`, and no step has run. The user got a message that never finished and
    // three minutes of "Apple is already working" before a new run could start.
    //
    // The returned error was also being discarded. A checkpoint is the user's undo point, so
    // failing to take one is worth saying out loud — but it is not a reason to refuse to work,
    // and silently pressing on is the thing this codebase keeps getting wrong.
    if (studioConnected && mode === 'agent') {
      try {
        //[[ SAY WHAT THE RUN WAS ABOUT TO DO.
        //
        //   Every pre-run checkpoint carries this same label, so a project's list of them was a
        //   column of identical rows and the person restoring one was choosing by timestamp. The
        //   request that caused it is right here in scope and was being thrown away.
        //
        //   `intent.summary` when the local classifier produced one — it restates the request in
        //   the agent's own terms — and otherwise the user's own words, which are never worse. No
        //   model call: this runs before the first one. ]]
        const checkpoint = await this.createCheckpoint('before Apple changes', 'pre_agent', {
          description: `Apple was asked to: ${intent?.summary ?? text}`,
        }); // broadcasts internally
        if ('error' in checkpoint) {
          this.broadcast({
            type: 'error',
            code: 'checkpoint',
            message: `Couldn't snapshot your project before starting (${checkpoint.error}). Continuing without an undo point.`,
          });
        }
      } catch (err) {
        console.warn('[session] pre-run checkpoint threw', String(err).slice(0, 200));
        this.broadcast({
          type: 'error',
          code: 'checkpoint',
          message: "Couldn't snapshot your project before starting. Continuing without an undo point.",
        });
      }
    }
    await this.ctx.storage.setAlarm(Date.now() + 10);
  }

  async alarm() {
    // Socket grants expire even when no run is active. The deadline is represented by an alarm so
    // hibernation cannot turn "expires at 14:00" into "expires when the tab next sends a frame".
    await this.enforceSocketExpiries();
    // Cheap, and it catches the case the ping cannot: Studio closed mid-run, while the run loop is
    // the thing waking this object.
    this.noticeStudioSilence();
    // And re-arm, FIRST, before any of the early returns below. This is the link in the chain that
    // makes the watchdog self-sustaining: whatever else this alarm was set for, leaving it without
    // a successor is how the bound goes back to "whenever the tab next pings".
    await this.armStudioWatchdog();
    const agent = await this.ctx.storage.get<AgentState>('agent');
    if (!agent) return;
    if (agent.status === 'idle') return;
    if (await this.stopForAccess(agent)) return;
    if (agent.status === 'stopping' || (await stopRequested(this.ctx.storage))) {
      agent.status = 'stopping';
      await this.finishRun(agent, 'stopped');
      return;
    }
    // Durable runs may legitimately sleep for minutes or hours between alarms. Age is not evidence
    // that work is lost: Stop/access/quota and the operation-specific timeouts are the actual gates.
    if (typeof agent.resumeAt === 'number' && Date.now() < agent.resumeAt) {
      await this.ctx.storage.setAlarm(agent.resumeAt);
      return;
    }
    try {
      await this.runStep(agent);
    } catch (e) {
      if (e instanceof BudgetError) {
        const resetsAt = new Date();
        resetsAt.setUTCHours(24, 0, 0, 0);
        const hours = Math.max(1, Math.round((resetsAt.getTime() - Date.now()) / 3_600_000));
        const tail =
          e.reason === 'monthly_cap' || e.reason === 'third_party_monthly_cap'
            ? 'Capacity refills at the start of next month.'
            : e.reason === 'killed'
              ? 'An administrator paused generation; it will be back shortly.'
              : `Capacity resets in about ${hours} hour${hours === 1 ? '' : 's'} (midnight UTC).`;
        agent.finalText =
          (agent.finalText ? agent.finalText + '\n\n' : '') +
          `${e.message} Everything I finished is saved — your project and checkpoints are untouched. ${tail}`;
        this.broadcast({ type: 'error', code: 'capacity', message: e.message });
        await this.finishRun(agent, 'quota');
        return;
      }
      if (e instanceof RateLimitedError) {
        //[[ A FREE REFUSAL IS NOT A FAILED RUN, and treating it as one is what made using the
        //   knowledge library and finishing mutually exclusive. See RATE_LIMIT_WAIT_MS.
        //
        //   Only a refusal from the step's own model call may be resumed — StepRefusedError is the
        //   proof that nothing of this step was billed or applied. The step counter goes back too:
        //   the step did not run, and charging the step budget for work the provider refused to do
        //   would shorten the very runs this exists to let finish. ]]
        const waited = agent.rateLimitWaits ?? 0;
        const waitMs = e instanceof StepRefusedError
          ? RATE_LIMIT_WAIT_MS[Math.min(waited, RATE_LIMIT_WAIT_MS.length - 1)]
          : undefined;
        if (waitMs !== undefined) {
          agent.rateLimitWaits = Math.min(waited + 1, RATE_LIMIT_WAIT_MS.length - 1);
          await this.waitOnProvider(agent, 'rate_limited', waitMs);
          return;
        }
        agent.finalText =
          (agent.finalText ? agent.finalText + '\n\n' : '') +
          `${e.message} Everything I finished is saved.`;
        this.broadcast({ type: 'error', code: 'busy', message: e.message });
        await this.finishRun(agent, 'error', 'busy');
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      // A classified provider transport outage is a pause in this run, not yet a terminal state.
      // There is no usable provider response and no tool from this step to replay. Keep retrying
      // across Durable Object alarms with a capped backoff, announced to the client each time, until
      // the provider has been unavailable for PROVIDER_OUTAGE_MAX_MS — the run's real boundary for
      // an outage, beside Credits/allowance, Stop and access revocation. Unknown/auth/context/safety
      // failures do not enter this branch because repeating those has no evidence of becoming valid.
      if (isTransientProviderFailure(e)) {
        const failures = (agent.transientFailures ?? 0) + 1;
        agent.transientFailures = failures;
        console.warn('[session] transient provider failure; keeping run alive:', msg);
        await this.waitOnProvider(
          agent,
          'unavailable',
          Math.min(TRANSIENT_PROVIDER_WAIT_MAX_MS, 1_000 * 2 ** Math.min(failures, 6)),
        );
        return;
      }
      if (msg === 'CAPACITY_EXHAUSTED') {
        const resetsAt = new Date();
        resetsAt.setUTCHours(24, 0, 0, 0);
        const hours = Math.max(1, Math.round((resetsAt.getTime() - Date.now()) / 3_600_000));
        agent.finalText =
          (agent.finalText ? agent.finalText + '\n\n' : '') +
          `Apple has reached today's shared building capacity, so I stopped here. Everything I finished is saved — your project and checkpoints are untouched. Capacity resets in about ${hours} hour${hours === 1 ? '' : 's'} (midnight UTC), and you can pick up right where we left off.`;
        this.broadcast({ type: 'error', code: 'capacity', message: `Apple is at capacity for today. Resets in ~${hours}h (midnight UTC).` });
        await this.finishRun(agent, 'quota');
        return;
      }
      // NOT `Something went wrong: ${msg}`. That interpolated the upstream's unredacted message
      // into the reply, on the one path where nothing else had classified the failure — so the
      // least-understood failure produced the least comprehensible sentence. Same shape as the
      // branch above it instead, and it answers "did I lose anything" first.
      agent.finalText =
        agent.finalText ||
        'That step failed on our side. Work already applied to Studio is saved.';
      console.warn('[session] step failed:', msg);
      await this.finishRun(agent, 'error', 'model_failed');
    } finally {
      // Each step's model calls reach the log now, not when the run ends: a 422 s step on the owner's
      // build left nothing to read while it was happening. Awaited, since waitUntil is a no-op here.
      await flushEvents(this.env);
    }
  }

  /**
   * Retry the current step after a provider refusal or transport failure — or, once the provider
   * has been unavailable for PROVIDER_OUTAGE_MAX_MS without one answer, end the run and say why.
   *
   * EVERY WAIT IS ANNOUNCED. `agent_status` keeps the card current and a `notice` says, in words,
   * that the run is waiting on the model provider and when it will try again. Before this the wait
   * sent nothing at all, and a run waiting out an outage was indistinguishable from a dead one.
   *
   * The step is handed back either way: the provider never ran it. At the bound the run ends as an
   * `error`, which is a refundable ending, so a run that delivered nothing is refunded by finishRun
   * under the same rules as every other failure.
   */
  private async waitOnProvider(agent: AgentState, cause: 'rate_limited' | 'unavailable', waitMs: number): Promise<void> {
    const now = Date.now();
    const recorded = agent.providerWaitSince;
    // An unreadable or future start is treated as "starting now" — never as an outage that has
    // already lasted forever, which would end a healthy run on its first refusal.
    const since = typeof recorded === 'number' && Number.isFinite(recorded) && recorded <= now ? recorded : now;
    agent.providerWaitSince = since;
    agent.step = Math.max(0, agent.step - 1);
    const outageMs = now - since;
    if (outageMs >= PROVIDER_OUTAGE_MAX_MS) {
      const minutes = Math.max(1, Math.round(outageMs / 60_000));
      delete agent.resumeAt;
      delete agent.providerWaitSince;
      agent.finalText =
        (agent.finalText ? agent.finalText + '\n\n' : '') +
        `The model provider has not answered for ${minutes} minute${minutes === 1 ? '' : 's'} — every attempt was ` +
        `${cause === 'rate_limited' ? 'refused as too busy' : 'lost before a response came back'} — so I stopped this run ` +
        'here instead of waiting indefinitely.' +
        (agent.mutated === true ? ' Everything already applied to your project is saved.' : '') +
        ' Send the message again once the provider is back.';
      this.broadcast({
        type: 'error',
        code: 'busy',
        message: `The model provider has been unavailable for ${minutes} minute${minutes === 1 ? '' : 's'}, so this run was ended.`,
      });
      // Two literal calls rather than a ternary: the code is part of a closed vocabulary and
      // run-failure-vocabulary.test.mjs reads each call site to prove it.
      if (cause === 'rate_limited') await this.finishRun(agent, 'error', 'busy');
      else await this.finishRun(agent, 'error', 'dropped_step');
      return;
    }
    agent.resumeAt = now + waitMs;
    await this.persistAgent(agent);
    this.broadcast({ type: 'agent_status', phase: agent.phase ?? 'planning', step: agent.step, creditsSpent: agent.creditsSpent });
    this.broadcast({
      type: 'notice',
      code: 'provider_wait',
      message:
        `Waiting on the model provider (${cause === 'rate_limited' ? 'it is too busy right now' : 'it did not answer'}) — ` +
        `retrying in ${Math.max(1, Math.round(waitMs / 1000))} s. The run is still going; it ends if the provider ` +
        `stays unavailable for ${Math.round(PROVIDER_OUTAGE_MAX_MS / 60_000)} minutes.`,
    });
    await this.ctx.storage.setAlarm(agent.resumeAt);
  }

  private async runStep(agent: AgentState) {
    // The RESULT is unused; the call is kept because reading the binding refreshes
    // `boundProjectId` on an instance revived mid-run. The constructor restores it too,
    // so this is belt and braces rather than the only path — see the note there.
    await this.bind();
    // The alarm check and this await are separate turns. Re-check after re-binding so a
    // revocation that landed while the object was waking cannot spend another model step.
    if (await this.stopForAccess(agent)) return;
    //[[ Re-established here, not only in startRunInner.
    //
    //   `currentMsgId` is an instance field, and a run outlives the instance: the Durable
    //   Object can be evicted between steps and the alarm resumes the run on a fresh object
    //   whose field is undefined. Everything that reads it then silently degrades — playtest
    //   frames lose their message id, and worse, `execStudioOp` tags its ops with `undefined`,
    //   which `dropOpsForEndedRuns` deliberately treats as "queued by an older deploy, keep
    //   it". A5's protection would switch itself off after the first eviction, and nothing
    //   would say so.
    //
    //   The run's own state carries the id across the eviction, so it is taken from there. ]]
    this.currentMsgId = agent.msgId;
    if (agent.step >= MAX_RUN_STEPS) {
      agent.finalText = agent.finalText || `I reached the ${MAX_RUN_STEPS}-step ceiling for this message. Work already applied to the project is saved.`;
      await this.finishRun(agent, 'incomplete', undefined, undefined, 'step_limit');
      return;
    }
    agent.step += 1;
    agent.lastStepAt = Date.now();
    this.lastActivity = agent.lastStepAt;

    // A run persisted before BYOK was removed may still name a customer key. That run cannot be
    // continued on the key and must not silently move onto Apple's Credits, so it ends here.
    if ((agent as { customerModel?: unknown }).customerModel) {
      agent.finalText = agent.finalText || 'Runs on your own key have been retired. Choose a model and send again. Progress is saved.';
      await this.finishRun(agent, 'error', 'model_failed');
      return;
    }
    //[[ THE MODEL IS RE-CHECKED ON EVERY STEP, NOT ONLY AT ADMISSION (D-VISION-1).
    //
    //   A run can outlive the plan it started on: a downgrade or a lapsed subscription lands while
    //   a 16-step build is between steps, and admission alone would let a paid model finish the run
    //   on an account that no longer has it. `agent.userId` is the owner's billing identity, the
    //   same identity admission read. A free model needs no read, so this costs nothing on Apple. ]]
    if (agent.productModel) {
      const verdict = await this.productModelVerdict({ ownerId: agent.userId }, agent.mode, agent.productModel);
      if (!verdict.ok) {
        agent.finalText = agent.finalText || `${verdict.message} Progress is saved.`;
        await this.finishRun(agent, 'quota');
        return;
      }
    }
    if (agent.step > 1) {
      const state = await this.quotaState(agent.userId);
      if (state.unmetered !== true && state.creditsRemaining <= 0) {
        agent.finalText = agent.finalText || 'I paused because your daily Credits ran out. Progress is saved.';
        await this.finishRun(agent, 'quota');
        return;
      }
    }
    // Drop the art-direction brief once the blockout exists. It is 7,001 of the ~15,048-character
    // system prompt and the whole transcript is re-sent every step, so carrying it through a
    // 16-step build costs ~1,945 input tokens (~27 neurons) on every one of them. It earns that
    // while the agent is deciding what to build; it earns nothing while the agent is placing trim.
    if (agent.mutated && agent.llm[0]?.role === 'system') {
      const collapsed = collapseArtDirection(agent.llm[0].content as string);
      if (collapsed.length !== (agent.llm[0].content as string).length) {
        agent.llm[0] = { ...agent.llm[0], content: collapsed };
      }
    }
    //[[ THE TRIM STOPS BEING SILENT HERE.
    //
    //   `trimTranscriptReport` is the same function with the same arithmetic — `trimTranscript` now
    //   calls it and takes `.llm` — plus the two figures nobody could see: what this step's prompt
    //   costs against the ceiling, and what had to be dropped to get under it.
    //
    //   `dropped` rides only on a step that ACTUALLY dropped something. Sending `{ groups: 0 }`
    //   every step would make "nothing was trimmed" and "this worker does not report trims" the
    //   same message, and the client renders a note from its presence.
    //
    //   Note what is NOT reported: the collapseArtDirection step above shortens OUR OWN system
    //   prompt, not the user's conversation. It is a cost optimisation on our instructions, and
    //   announcing it to a builder as "context was truncated" would describe a loss they did not
    //   take. What they can lose is turns, and that is what this counts. ]]
    const trimmed = trimTranscriptReport(agent.llm, MAX_PROMPT_CHARS, MAX_PROMPT_TARGET);
    agent.llm = trimmed.llm;
    // A READ WHOSE RESULT WAS TRIMMED AWAY MAY BE READ AGAIN. The duplicate guard refuses an identical
    // call as "you already have the result above" — after the trim, it no longer is above. Measured
    // 2026-09-23 (runs 867aff43, 2d3d2ea9): the lamp's tree was read, trimmed out, and every re-read
    // refused, so "list the parts of the StreetLamp" ended with no answer. Writes stay remembered:
    // redoing a change is the harm the guard exists to prevent; re-reading is not.
    if (trimmed.droppedGroups > 0 && agent.seenCalls?.length) {
      const visible = new Set(agent.llm.flatMap((m) => (m.toolCalls ?? []).map((c) => `${c.name}:${c.arguments}`)));
      const writers = new Set(projectMutatingToolNames());
      agent.seenCalls = agent.seenCalls.filter((sig) => visible.has(sig) || writers.has(sig.slice(0, sig.indexOf(':'))));
    }
    // Keep only the arithmetic needed to reconstruct the last live `context_budget` state after a
    // reload. No prompt text is copied. The last size wins; drops accumulate because a turn removed
    // on step four is still absent on step sixteen, exactly like the browser's live reducer.
    agent.contextUsedChars = trimmed.after;
    agent.contextMaxChars = trimmed.maxChars;
    if (trimmed.droppedGroups > 0) {
      agent.contextDroppedGroups = (agent.contextDroppedGroups ?? 0) + trimmed.droppedGroups;
      agent.contextDroppedChars = (agent.contextDroppedChars ?? 0) + trimmed.droppedChars;
    }
    this.broadcast({
      type: 'context_budget',
      msgId: agent.msgId,
      usedChars: trimmed.after,
      maxChars: trimmed.maxChars,
      ...(trimmed.droppedGroups > 0
        ? { dropped: { groups: trimmed.droppedGroups, chars: trimmed.droppedChars } }
        : {}),
    });
    await this.persistAgent(agent);
    // The opening phase of a step is 'understanding' / 'planning' on the first step. After that the
    // model is writing its next move, and says so: carrying the last tool's phase over read as
    // "Inspecting the project" for the 90 s the model spent writing (F-007). A step that follows an
    // ordered rebuild keeps 'rebuilding' — that is what the model is doing.
    agent.phase =
      agent.step === 1
        ? agent.mode === 'plan' ? 'understanding' : 'planning'
        : agent.phase === 'rebuilding' ? 'rebuilding' : 'composing';
    this.broadcast({ type: 'agent_status', phase: agent.phase, step: agent.step, creditsSpent: agent.creditsSpent });

    const studioConnected = await this.pluginConnected();
    // STUDIO GOING AWAY MID-RUN IS NOT THE TOOLS GOING AWAY (F-033, run d1a97c0d). Withdrawing the Studio
    // tools when the link dropped left the model to explain their absence, and it told the customer they
    // "aren't offered in this mode" — false for Agent mode. Once a run has seen Studio, its tools stay
    // offered; a call while Studio is down gets the plain refusal below ("did not run because Roblox Studio
    // is not connected right now … It is not a limit of this mode"), which is the truth.
    if (studioConnected) agent.studioSeen = true;
    const offerStudio = studioConnected || agent.studioSeen === true;
    //[[ NARROWING ONLY, and in this order.
    //
    //   `toolsForMode` is what enforces Plan mode's read-only promise to the user — it is the
    //   guarantee, not a token optimisation. Preferences are applied ON TOP of it and can only
    //   remove, so a preference cannot hand run_luau to the one mode whose entire purpose is that
    //   it cannot touch the project. See applyToolPermissions. ]]
    const modeBase = toolsForMode(agent.mode, offerStudio, toolNames());
    // A request that forbade changes gets no tool that can make one — narrowing only, like the
    // permissions below. The playtest stays: it restores anything it disturbs, and it is often
    // exactly what such a request asks for.
    const base = agent.readOnly
      ? new Set([...modeBase].filter((name) => !READ_ONLY_WITHHELD.has(name)))
      : modeBase;
    const userAllowed = agent.mode === 'agent' && agent.autonomous
      ? base
      : applyToolPermissions(base, agent.toolPermissions);
    const offeredCapabilityFilter = this.pluginToolFilter(userAllowed);
    const offeredAllowed = offeredCapabilityFilter.allowed;
    const knownTools = new Set(toolNames());

    //[[ AND SAY WHAT WAS TAKEN.
    //
    //   Until now the narrowing was invisible from every side: the tool was removed from the set,
    //   nothing was logged, nothing was broadcast, and "why did Apple not use run_luau on that
    //   run" had no answer anywhere in the product. A capability that is silently missing reads,
    //   from the user's side, exactly like a broken one.
    //
    //   ONCE PER RUN, because the permissions are PINNED to the run (see AgentState.toolPermissions)
    //   — so this cannot change between step 4 and step 5, and repeating it every step would be the
    //   same sentence eleven times. `agent.deniedTools` being set is what marks it as said; an
    //   empty array is stored when nothing was removed, so "already checked" and "nothing to say"
    //   stay distinguishable from "an older run that never looked".
    //
    //   The audit event is per TOOL rather than per run: `subject` is one name in analytics.ts, and
    //   a comma-joined list in that field would be a record nothing can query by tool. ]]
    if (agent.deniedTools === undefined) {
      const denied = agent.mode === 'agent' && agent.autonomous ? [] : deniedTools(base, agent.toolPermissions);
      agent.deniedTools = denied;
      if (denied.length) {
        for (const tool of denied) {
          recordEvent({ kind: 'audit', action: 'tool_denied', actorKind: 'user', subject: tool, allowed: false });
        }
        this.broadcast({ type: 'tools_denied', msgId: agent.msgId, tools: denied });
      }
    }

    // Decide how hard to think about THIS step. Cheap by default, expensive where it changes the
    // outcome — visual design, recovery from failure, anything irreversible.
    const choice = chooseEffort({
      mode: agent.mode,
      // The entitlement travels WITH the mode. `chooseEffort` is the ONLY thing that reads it now:
      // for the Apple lanes `gatewayModelFor` returns the mode key and `baseTokensFor` is keyed on
      // the mode alone, so the entitlement reaches the request as an EFFORT FLOOR and nothing else. The
      // thinking policy used to ignore it entirely, which is how Apple MAX in Plan mode came to
      // think at `low`.
      productModel: agent.productModel,
      step: agent.step,
      highEffortUsed: agent.highEffortUsed ?? 0,
      priorStepFailed: agent.priorStepFailed,
      // What the run has actually DONE, which is what expires a stale `conversational` verdict
      // taken from the opening message. `traits` is spread below and carries that verdict.
      mutated: agent.mutated,
      visualDefectsFound: agent.visualDefectsFound,
      ...(agent.traits ?? {}),
    });
    if (agent.forcedEffort) choice.effort = agent.forcedEffort;
    if (choice.effort === 'high') agent.highEffortUsed = (agent.highEffortUsed ?? 0) + 1;
    const gatewayModel = gatewayModelFor(agent.mode, agent.productModel);
    //[[ REPORT THE SETTING THAT WAS APPLIED, NOT THE ONE THAT WAS CHOSEN.
    //
    //   The policy decides an effort for every step whatever the lane. Whether that effort reaches
    //   the model is a different question. The adapter is authoritative for whether the selected
    //   route accepts an explicit reasoning effort.
    //
    //   OMITTED rather than downgraded to 'low'. "Low" would be a second false claim — the provider
    //   was told nothing at all, which is not the same as being told to think cheaply — and the
    //   field is already optional on the wire for runs that predate it, so a UI that renders
    //   nothing for an absent effort is the behaviour that already exists.
    //
    //   `agent.effort` is cleared for the same reason and not merely left unsent: it is replayed on
    //   `run_state` after a refresh (see runSnapshot), so a value kept here would put the claim back
    //   on screen by another route.
    //
    //   What the policy chose is NOT wasted on this lane — `tokensForEffort` still sizes the output
    //   budget from it. What is withheld is only the statement about the provider's own knob. ]]
    const effortApplied = await reasoningEffortApplies(this.env, gatewayModel);
    if (effortApplied) {
      // Surface the reasoning POLICY's decision — the tier it picked and its own
      // one-line justification. This is a classification of the request, never
      // the model's hidden reasoning, and carries no prompt or transcript text.
      agent.effort = choice.effort;
      agent.effortReason = choice.reason;
    } else {
      delete agent.effort;
      delete agent.effortReason;
    }
    this.broadcast({
      type: 'agent_status',
      phase: agent.phase ?? 'planning',
      step: agent.step,
      ...(effortApplied ? { effort: choice.effort, effortReason: choice.reason } : {}),
      creditsSpent: agent.creditsSpent,
    });

    // TALK IS NOT PRICED LIKE BUILDING (F-019). A greeting, a thanks or a question about Apple itself,
    // on the run's first step, gets no tool definitions: they are 69 tools and ~67k characters, about
    // 80% of the input of every call, and "hi" needs none of them. CONVERSATIONAL_RE is anchored to the
    // whole message, so "hi, build me a tower" is not talk. Any later step is offered the normal set.
    const talkOnly = agent.traits?.conversational === true && agent.step === 1 && !agent.mutated;
    const res = await llmChat(
      this.env,
      {
        model: gatewayModel,
        messages: agent.llm,
        tools: talkOnly ? [] : toolDefs(offerStudio, offeredAllowed),
        reasoningEffort: choice.effort,
        maxTokens: tokensForEffort(baseTokensFor(agent.mode), choice.effort),
      },
      // Same affinity key for every step of the run, so Workers AI can reuse the prefill for the
      // identical system-prompt-and-tools prefix instead of recomputing ~5,200 tokens each step.
      // The DO id is per-project and opaque, so it is never shared across tenants.
      {
        kind: `${agent.productModel ?? agent.mode}:step:${choice.effort}`,
        sessionId: this.ctx.id.toString(),
        // Attribution for the model trace. Null when the run predates a bind rather than a
        // placeholder — `breakdownBy` counts unattributed calls instead of inventing a tenant.
        // Human attribution follows the verified run starter. `userId` remains the project owner
        // because quota/refund billing is intentionally owner-scoped. Older persisted runs do not
        // have initiatedBy, so fall back to their historical owner identity rather than inventing one.
        actorId: agent.initiatedBy ?? agent.userId,
        ...(this.boundProjectId ? { projectId: this.boundProjectId } : {}),
        runId: agent.msgId,
      },
    ).catch((e: unknown) => {
      // THE BOUNDARY THE RESUME IS ALLOWED TO REACH. Everything above this line is idempotent —
      // the transcript trim, the art-direction collapse and the effort choice all recompute — and
      // nothing below it has happened yet, so a refusal caught HERE is a step that did not occur.
      // Re-tagged rather than re-thrown so `alarm` can tell it apart from a rate limit raised after
      // paid work. See StepRefusedError.
      if (e instanceof RateLimitedError) throw new StepRefusedError(e.message);
      throw e;
    });
    // The burst this step was waiting on has cleared, so the next one starts from a full set of
    // waits. Per STEP, not per run: what bounds the total is PROVIDER_OUTAGE_MAX_MS of continuous
    // unavailability (there is no run wall clock).
    agent.rateLimitWaits = 0;
    agent.transientFailures = 0;
    delete agent.resumeAt;
    // And the outage clock: an answer ends the stretch of unavailability PROVIDER_OUTAGE_MAX_MS bounds.
    delete agent.providerWaitSince;
    // Pairing can change while the model is in flight. Re-read the current capability report before
    // interpreting or executing its response, and intersect it with what THIS call was offered.
    // A reconnect may narrow a step immediately; it may never widen the step after inference.
    const capabilityFilter = this.pluginToolFilter(userAllowed);
    const allowed = new Set([...offeredAllowed].filter((name) => capabilityFilter.allowed.has(name)));
    // Whether this run can change the project at all. The steers that say "make the change" are
    // only true for a run that was offered something that makes one.
    const canBuild = projectMutatingToolNames().some((name) => allowed.has(name));
    //[[ THE MODEL SOMETIMES WRITES THE CALL INSTEAD OF MAKING IT, and until this ran the payload
    //   was printed at the user as the answer. Observed in production: a request for a clicker
    //   loop came back as eighty lines of `propose_plan` arguments in the chat window, nothing
    //   built, and the whole day's Credits spent. See tool-recovery.ts for why only inert tools
    //   may be recovered and why this is not the fence-parsing fallback gateway.ts refuses.
    //
    //   Done BEFORE `lastCalls` is taken and before `res.text` is read, so the recovered call is
    //   indistinguishable downstream from one the model actually made. ]]
    let rescued: ReturnType<typeof recoverToolCall> | null = null;
    if (!res.toolCalls.length && res.text) {
      rescued = recoverToolCall(res.text, allowed, knownTools);
      if (rescued.call) {
        res.toolCalls = [{ id: `rescued_${agent.step}`, name: rescued.call.name, arguments: rescued.call.arguments }];
        res.text = rescued.text;
      } else if (rescued.refused) {
        // Not executed — but not shown either. A wall of JSON is never the answer to anything, and
        // the model needs to be told what went wrong rather than the user being handed the
        // evidence. The steer is pushed below, AFTER the assistant turn it answers, and is given
        // a step of its own there.
        res.text = '';
      }
    }

    //[[ Same reason as seenCalls: this holds raw tool arguments verbatim and is persisted.
    //   Only the most recent turn's calls are ever read, so keeping more is pure weight. ]]
    agent.lastCalls = (res.toolCalls ?? []).slice(-8);
    // Signals are recomputed from what actually happens each step, so an escalation lapses once
    // the problem it was bought for is resolved.
    agent.priorStepFailed = false;
    agent.visualDefectsFound = false;
    // A tool call written as text and not run IS something that went wrong this step. This used to
    // be set before the reset above, which erased it on the same line it was meant to survive.
    if (rescued?.refused) agent.priorStepFailed = true;

    // A generated-image/model claim needs evidence from THIS run, not an invented ID
    // copied into prose. Hold replies until the requested artifact tool succeeds.
    const artifact = artifactCompletion(agent.mode === 'plan' ? undefined : agent.request, agent.trace);
    if (artifact.missing) {
      res.text = '';
      agent.finalText = '';
    }
    if (
      res.text &&
      !res.toolCalls.length &&
      agent.mutated &&
      studioConnected &&
      agent.traits?.visualDesignTask &&
      capabilityFilter.withheld.includes('inspect_visually')
    ) {
      res.text += '\n\nRendered appearance was not verified: the connected Studio does not provide the required visual inspection operation.';
    }

    // Credits track real spend: charge the difference between what this call actually cost
    // and the 1 Credit already taken for the step. Users are never billed for our estimate.
    // Round Credits once per RUN, not once per call: otherwise a run of five small calls costs
    // five whole Credits when the compute used barely fills one.
    agent.neuronsUsed = (agent.neuronsUsed ?? 0) + res.neurons;
    const owed = creditsForNeurons(agent.neuronsUsed) - agent.creditsSpent;
    if (owed > 0) {
      const settle = await this.quotaSpend(agent.userId, owed, `usage_${agent.mode}`);
      //[[ ONLY A SPEND THAT HAPPENED IS ADDED TO WHAT THE RUN COST.
      //
      //   This was `agent.creditsSpent += owed` unconditionally, on both sides of the branch below.
      //   So a settlement REFUSED for want of Credits still moved the figure: the ledger took
      //   nothing, and the transcript row, `msg_end.creditsSpent` and the run-complete notification
      //   all reported the full amount as charged. Money the user still had, shown as money they
      //   had spent — the product's own failure shape pointed at a balance.
      //
      //   It matters twice over now. `refundVerdict` reads this number, so an inflated one would
      //   ask the ledger for Credits it never took and the reply would then explain the shortfall
      //   with a reason that never happened. ]]
      if (settle.ok) agent.creditsSpent += owed;
      // Accumulated per settlement, not derived at the end: allowance can run out MID-RUN, so one
      // run's Credits are genuinely split across both ledgers and only the charges themselves know
      // where the boundary fell. See AgentState.creditsFromAllowance.
      this.recordSpendSplit(agent, settle);
      if (!settle.ok) {
        // they have run out mid-run: finish this step's work, then stop cleanly
        agent.finalText =
          (res.text || agent.finalText || '') +
          '\n\nThat used the last of your Credits for today. Everything so far is saved — they refill at midnight UTC.';
        this.broadcast({ type: 'quota', quota: settle.state });
        await this.finishRun(agent, 'quota');
        return;
      }
      this.broadcast({ type: 'quota', quota: settle.state });
    }

    // A stop may land while inference is in flight. The provider has already run by the time we
    // can observe it here, so its measured usage remains settled; what MUST NOT happen is taking a
    // tool call returned after the click and applying one more mutation before the existing
    // after-tool stop check sees the signal. This read is deliberately after settlement and before
    // any response text or tool execution: Stop is not a refund, and it is still a stop.
    if (await stopRequested(this.ctx.storage)) {
      agent.status = 'stopping';
      await this.finishRun(agent, 'stopped');
      return;
    }

    // `finishReason` is the provider's statement about whether this RESPONSE completed. The
    // gateway preserves `length` after it settles provider usage, but until this branch SessionDO
    // ignored the field and a response guillotined at the output-token ceiling was persisted as
    // `msg_end.stopReason = done`. That is a partial observation rendered as a completed build.
    //
    // Structured tool calls take precedence: the gateway itself reports `tool_calls` whenever it
    // retained one, and those calls are work still to execute rather than a terminal response.
    // Everything else must positively say `stop`; an absent reason fails closed rather than
    // inventing completion for a response shape an older/newer adapter did not describe.
    const finishReason = (res as { finishReason?: 'stop' | 'tool_calls' | 'length' | 'error' }).finishReason;
    // KEPT, not only read. `finishRun` records it on the build log so a truncation is countable
    // across the fleet rather than only reconstructable one project at a time. Written on EVERY
    // step, so the value on the log is the last thing the provider said about this run — which is
    // the response the run ended on.
    agent.lastFinishReason = finishReason;
    if (!res.toolCalls.length && finishReason === 'length') {
      // Output ceilings are a provider-call boundary, not a customer-run boundary. The old path
      // printed partial JSON/prose, ended the run and told the user to send another message. Keep
      // the durable tool/results history, discard the unusable partial assistant payload, and ask
      // the same run to retry the unfinished action in a smaller batch.
      agent.priorStepFailed = true;
      const cuts = (agent.lengthRecoveries ?? 0) + 1;
      agent.lengthRecoveries = cuts;
      const batchHint =
        cuts >= 4
          ? 'Use exactly one small mutating tool call for the next piece, then continue in later steps.'
          : cuts >= 2
            ? 'Split large instance/script work into small tool calls of at most four logical items.'
            : 'Split any large tool payload into smaller calls instead of trying to describe the whole build at once.';
      agent.llm.push({
        role: 'user',
        content:
          'Your previous provider response hit its output ceiling before it became a complete action. ' +
          'It was not shown to the user and did not end the run. Continue the SAME task from the ' +
          'successful tools/results already in the transcript. Do not repeat completed work. ' +
          batchHint,
      });
      await this.persistAgent(agent);
      await this.ctx.storage.setAlarm(Date.now() + 10);
      return;
    }
    if (!res.toolCalls.length && finishReason !== 'stop') {
      //[[ "EVERYTHING COMPLETED BEFORE THE CUTOFF IS SAVED" IS A CLAIM, AND IT NEEDS A SUBJECT.
      //
      //   It was printed on every truncated run, including the ones where nothing had been applied
      //   at all. Vacuously true and read as reassurance: the user is told their work is safe by a
      //   run that did no work, and goes looking in the place for something that was never put
      //   there. The run already knows which case it is in — the trace and `mutated` are the same
      //   evidence `refundVerdict` reads a few lines later — so the clause is only stated when
      //   there is something for it to be about. ]]
      const kept = agent.mutated === true || agent.trace.some((t) => t.ok);
      const savedClause = kept ? ' Everything completed before it stopped is saved.' : '';
      const providerNote =
        (finishReason === 'error'
          ? 'The model could not complete this step.'
          : 'The model response did not confirm that this step completed.') +
        savedClause +
        ' Progress already applied to the project is preserved.';
      const artifactNote = artifact.missing
        ? artifact.tool === 'generate_image'
          ? 'No image was generated in this run. There is no new image to view or download.'
          : 'No 3D model was generated in this run. Check the Studio connection and generation availability before retrying.'
        : '';
      const partial = typeof res.text === 'string' ? res.text.trim() : '';
      const segment = [partial, artifactNote, providerNote].filter(Boolean).join('\n\n');
      const prior = agent.streamedText ?? '';
      const terminalContent = prior && segment ? `${prior}\n${segment}` : prior || segment;
      agent.finalText = terminalContent;
      agent.streamedText = terminalContent;
      if (segment) this.broadcast({ type: 'delta', msgId: agent.msgId, text: prior ? `\n${segment}` : segment });
      await this.finishRun(
        agent,
        artifact.missing ? 'incomplete' : 'error',
        artifact.missing ? undefined : 'model_failed',
        terminalContent,
      );
      return;
    }

    if (res.text) {
      agent.finalText = res.text;
      agent.streamedText = (agent.streamedText ?? '') + res.text;
      this.broadcast({ type: 'delta', msgId: agent.msgId, text: res.text });
    }

    if (!res.toolCalls.length) {
      agent.llm.push({ role: 'assistant', content: res.text });
      //[[ THE STEER GETS ITS TURN — BOUNDED.
      //
      //   It used to be pushed and then ignored: with nothing else owed (Studio offline, or the run
      //   already mutated) control fell straight through to finishRun('done'), so a model that wrote
      //   its call as text ended the run with "Done." and the correction it was handed never reached
      //   it. Now the next step answers it, at most MAX_TEXT_CALL_STEERS times in a row, after which
      //   the ordinary ending below decides as it always did. And a tool this run was not offered is
      //   not one to be told to call — that instruction could only end in "unavailable". ]]
      if (rescued?.refused) {
        const steers = (agent.textCallSteers ?? 0) + 1;
        agent.textCallSteers = steers;
        agent.llm.push({
          role: 'user',
          content:
            `Your last message was the ARGUMENTS for \`${rescued.refused}\` written as text, not a tool call. ` +
            'It was not run and the user did not see it. ' +
            (allowed.has(rescued.refused)
              ? 'Call the tool.'
              : 'That tool is not offered in this run, so do not try it again: carry on with the tools you were given.'),
        });
        if (steers <= MAX_TEXT_CALL_STEERS) {
          await this.persistAgent(agent);
          await this.ctx.storage.setAlarm(Date.now() + 10);
          return;
        }
      }
      if (artifact.missing) {
        const available = toolDefs(studioConnected, allowed)
          .some((tool) => tool.name === artifact.tool);
        if (!artifact.attempted && available) {
          agent.nudges = Math.min(MAX_NUDGE_LEVEL, (agent.nudges ?? 0) + 1);
          agent.llm.push({ role: 'user', content: `The requested artifact has not been created in this run. Call ${artifact.tool} now. Do not invent an artifact ID or describe work as completed without a successful tool result.` });
          await this.persistAgent(agent);
          await this.ctx.storage.setAlarm(Date.now() + 10);
          return;
        }
        await this.finishRun(agent, 'incomplete');
        return;
      }
      // A build request that ends with prose and no change has failed, whatever the prose says.
      // Measured: the model replied "One part is still Plastic - finding and fixing it, then a
      // visual inspection:" and stopped, announcing work it never did. Steer it back rather than
      // reporting success — that is the `owesWork` nudge below. It is NOT bounded by a nudge count
      // any more (commit 384a4be removed MAX_NUDGES; MAX_NUDGE_LEVEL only clamps the counter): it
      // repeats on every step the model answers in prose without changing the project, and what
      // ends that is MAX_RUN_STEPS, Credits on a metered account, Stop or access revocation.
      // VISUAL SELF-CORRECTION, as a production behaviour rather than a benchmark feature.
      // If the run changed the world for a visual request and never looked at the result, look
      // now. A failing gate is handed back as work to do, exactly as a user would hand it back.
      // Charged once per run (`autoCritiqued`), so it can neither loop nor surprise the budget.
      if (
        agent.mode === 'agent' &&
        agent.mutated &&
        studioConnected &&
        agent.traits?.visualDesignTask &&
        allowed.has('inspect_visually') &&
        !agent.autoCritiqued
      ) {
        agent.autoCritiqued = true;
        // The worker's own check that the change came out right — not a tool the model chose.
        agent.phase = 'verifying';
        this.broadcast({
          type: 'agent_status',
          phase: 'verifying',
          step: agent.step,
          tool: 'inspect_visually',
        });
        const ctx2 = this.agentCtx(agent);
        const out = await runTool(ctx2, 'inspect_visually', JSON.stringify({ intent: agent.request ?? 'the requested build' }));
        this.captureProvenance(agent, ctx2);
        agent.trace.push({ tool: 'inspect_visually', summary: out.summary, ok: out.ok, durationMs: 0 });
        this.broadcast({ type: 'tool_end', msgId: agent.msgId, toolId: `auto_${agent.step}`, ok: out.ok, summary: out.summary });
        const critique = ctx2.lastCritique;
        if (critique && !critique.passed && !critique.unavailable) {
          agent.visualDefectsFound = true;

          // REBUILD OR PATCH. Until now this always said "Do not start over", which is the wrong
          // instruction exactly when it matters most: b4-interior was handed its own critique and
          // returned a scene with the same part, material and light counts and the same defects,
          // one for one. Patching had already failed and nothing could notice.
          const layout = ctx2.lastRender?.layout?.parts;
          agent.passes = [
            ...(agent.passes ?? []),
            { signature: sceneSignature(layout), score: critique.score, parts: layout?.length ?? 0 },
          ];
          const semantic = agent.request ? semanticCheck(agent.request, layout) : null;
          const verdict = shouldRebuild(agent.passes, semantic?.failures.length ?? 0);
          const rebuild = verdict.rebuild && !agent.rebuildOrdered;
          if (rebuild) {
            agent.rebuildOrdered = true;
            agent.phase = 'rebuilding';
            this.broadcast({ type: 'agent_status', phase: 'rebuilding', step: agent.step, creditsSpent: agent.creditsSpent });
          }

          agent.llm.push({
            role: 'user',
            content: rebuild
              ? `A visual review of the render you just produced did not pass:\n\n${critiqueToText(critique)}\n\n` +
                (semantic?.failures.length ? `${semantic.failures.join('\n')}\n\n` : '') +
                `STOP PATCHING — ${verdict.reason}.\n` +
                'Do not correct this in place and do not add more parts: that was measured and it does not work. ' +
                'Create a checkpoint, delete the failed layout, and lay out a fundamentally different macro ' +
                'composition from scratch. Keep any individual props that were good and reuse them. ' +
                'Then call check_composition on the new blockout BEFORE adding any detail.'
              : `A visual review of the render you just produced did not pass:\n\n${critiqueToText(critique)}\n\n` +
                'Fix the blocking and major defects in what you already built. Do not start over.',
          });
          await this.persistAgent(agent);
          await this.ctx.storage.setAlarm(Date.now() + 10);
          return;
        }
      }

      // A run only OWES a mutation if the user asked for work. Without the conversational test
      // this fired on "hi": the greeting reached here unmutated, the nudge below told the model
      // "You have not changed the project yet" twice — two more paid calls — and the run then
      // finished as `incomplete`, printing "I did not change anything in your project... which is
      // a fault on my side". The guard itself is right and stays; it simply must not be applied to
      // a message that never requested a change. See classifyRequest in reasoning.ts.
      //
      // And only a run that CAN build owes a build — the same reason `studioConnected` is in the
      // test. A paired run whose permissions or plugin withhold every tool that changes the project
      // could never satisfy the nudge, so it was told "do it now" on every prose reply until the
      // step ceiling or its Credits ran out: a loop with no possible progress, a paid step each time.
      const askedForWork =
        agent.mode === 'agent' && !agent.mutated && studioConnected && !agent.traits?.conversational && !agent.readOnly;
      const owesWork = askedForWork && canBuild;
      if (owesWork) {
        agent.nudges = Math.min(MAX_NUDGE_LEVEL, (agent.nudges ?? 0) + 1);
        agent.llm.push({
          role: 'user',
          content:
            'You have not changed the project yet. Do not describe what you are about to do — do it now ' +
            'with a tool call, in this turn. If you were mid-sentence, carry out that action.',
        });
        await this.persistAgent(agent);
        await this.ctx.storage.setAlarm(Date.now() + 10);
        return;
      }
      // A run that still owes work has FAILED, and must not be reported as success.
      //
      // MEASURED, 2026-08-31: asked to build a town plaza, the agent called a tool that does not
      // exist, ran a playtest against an empty Workspace, then spent the rest of its steps on asset
      // searches — ten tool calls, not one of them mutating — and the user was told "Done."
      // Then, the nudge above fired at most MAX_NUDGES times and control fell through to
      // finishRun(agent, 'done'), which printed the model's own optimistic prose.
      //
      // NOW the nudge never gives up, so this line is reached only by a run that does not owe
      // work and `owesWork` is always false here. A run that owes work and never delivers it ends
      // through a run boundary instead: MAX_RUN_STEPS (`incomplete`, step_limit), Credits (`quota`),
      // Stop or access revocation — each with its own honest reply.
      //
      // Nothing about that is recoverable by a user, because the reply says the work happened.
      //
      // A run that was asked for work and cannot build ends here too, like an offline Agent run, on
      // the model's own reply — with the one fact that reply must not contradict said by the product,
      // since the model's prose is not evidence of what changed (agent.mutated is).
      if (askedForWork) {
        const note =
          'Nothing in the project was changed: this run was not offered any tool that edits the project ' +
          '(the tool permissions or the connected Studio withhold them).';
        const prior = agent.streamedText ?? '';
        agent.finalText = agent.finalText ? `${agent.finalText}\n\n${note}` : note;
        agent.streamedText = prior ? `${prior}\n\n${note}` : note;
        this.broadcast({ type: 'delta', msgId: agent.msgId, text: prior ? `\n\n${note}` : note });
      }
      await this.finishRun(agent, owesWork ? 'incomplete' : 'done');
      return;
    }

    // record the assistant turn with STRUCTURED tool calls; the gateway renders them in whatever
    // form the target model expects. Only arguments the provider can read back go into history: a
    // call whose arguments are not JSON is still run (and runTool tells the model so), but its bytes
    // are replaced by `{}` here, because echoing them made the provider reject the next request.
    agent.llm.push({ role: 'assistant', content: res.text ?? '', toolCalls: historySafeToolCalls(res.toolCalls) });
    // A real call was made, so the text-payload steer's run of consecutive uses is over.
    agent.textCallSteers = 0;

    const ctx = this.agentCtx(agent);
    // What propose_plan validates against: exactly the set this step will execute, so a plan can
    // never promise a tool the run was not given. And the plan tool's own run-level memory, so it
    // can keep its promise never to refuse more than twice in a row. See PlanState in tools.ts.
    ctx.offeredTools = allowed;
    ctx.planState = {
      refusals: agent.planRefusals?.count ?? 0,
      kinds: agent.planRefusals?.kinds ?? [],
      announced: agent.plan !== undefined,
    };
    agent.seenCalls = agent.seenCalls ?? [];
    let executedThisStep = 0;
    let duplicatesThisStep = 0;
    let mutatedThisStep = false;
    let retuneThisStep: RetuneAction = 'none';
    let verifiedThisStep = false;
    for (const call of res.toolCalls.slice(0, 4)) {
      if (await this.stopForAccess(agent)) return;
      const t0 = Date.now();
      const toolId = call.id;
      const sig = `${call.name}:${call.arguments}`;
      //[[ THE DUPLICATE GUARD, AND ITS TWO EXCEPTIONS.
      //
      //   An identical call is refused as "already done" — unless (a) its last attempt failed in a
      //   way op-failure.ts classified as safe to repeat, which the tool result had just TOLD the
      //   model ("This can be retried: it never reached Studio"); refusing that retry cost a step
      //   and forced the model to invent different arguments to get past the guard. Such a call
      //   gets MAX_IDENTICAL_RETRIES identical repeats. Or (b) it is propose_plan, which is free and
      //   whose answer to a repeat depends on the run's state: the tool repairs a plan it already
      //   refused rather than being refused again here, which is what keeps consecutive
      //   propose_plan refusals at two or fewer whatever the model sends. ]]
      const retry = agent.retryableCalls?.find((r) => r.sig === sig);
      const repeated = call.name !== 'propose_plan' && agent.seenCalls.includes(sig);
      if (repeated && !(retry && retry.retries < MAX_IDENTICAL_RETRIES)) {
        // the model is looping — refuse the duplicate and steer it back to the work
        duplicatesThisStep += 1;
        const planNext = agent.plan ? nextPlanStep(agent.plan, agent.trace) : undefined;
        const planHint = planNext ? ` Your plan's next step is "${planNext.title}" (${planNext.tool}); do that now.` : '';
        const steer =
          (canBuild ? ' Use what you know now and make the actual change to the project.' : ' Use what you already know to answer.') +
          planHint;
        this.broadcast({ type: 'tool_start', msgId: agent.msgId, toolId, tool: call.name, summary: call.name, target: targetOf(call.name, call.arguments) });
        this.broadcast({ type: 'tool_end', msgId: agent.msgId, toolId, ok: false, summary: `↺ ${call.name} (already done)` });
        agent.llm.push({
          role: 'tool',
          content:
            `[${call.name}] ` +
            (retry
              ? 'You have already retried this exact call and it failed every time, so it was not run again. Do not repeat it; change your approach.'
              : 'You already made this exact call earlier in this run and have the result above. Do not repeat it.') +
            steer,
          toolCallId: call.id,
          name: call.name,
        });
        continue;
      }
      if (agent.lightingOnly && READ_ONLY_WITHHELD.has(call.name) && !staysInLighting(call.name, call.arguments)) {
        duplicatesThisStep += 1;
        this.broadcast({ type: 'tool_start', msgId: agent.msgId, toolId, tool: call.name, summary: call.name, target: targetOf(call.name, call.arguments) });
        this.broadcast({ type: 'tool_end', msgId: agent.msgId, toolId, ok: false, summary: `${call.name} (this request is about the lighting)` });
        agent.llm.push({ role: 'tool', content: `[${call.name}] ${LIGHTING_ONLY}`, toolCallId: call.id, name: call.name });
        continue;
      }
      if (agent.kitZone && touchesKit(agent.kitZone, call.name, call.arguments)) {
        duplicatesThisStep += 1;
        this.broadcast({ type: 'tool_start', msgId: agent.msgId, toolId, tool: call.name, summary: call.name, target: targetOf(call.name, call.arguments) });
        this.broadcast({ type: 'tool_end', msgId: agent.msgId, toolId, ok: false, summary: `${call.name} (the ready-made scene is kept)` });
        agent.llm.push({ role: 'tool', content: `[${call.name}] ${KIT_KEPT}`, toolCallId: call.id, name: call.name });
        continue;
      }
      if (repeated && retry) retry.retries += 1;
      else if (call.name !== 'propose_plan') agent.seenCalls.push(sig);
      //[[ BOUNDED, like uiTools two lines below. `sig` is `name:arguments`, and arguments is
      //   the raw JSON — a full script body for edit_script. Unbounded, this array alone can
      //   carry the persisted AgentState past the Durable Object's 128 KiB value limit, and
      //   the failure mode is not a lost dedupe: the put rejects, the alarm dies, and the
      //   retry re-runs the step's paid LLM call and its mutating tools. 40 is far more than
      //   the duplicate-call guard needs — it only ever compares against the current run. ]]
      if (agent.seenCalls.length > 40) agent.seenCalls.splice(0, agent.seenCalls.length - 40);
      // Announce the stage this tool actually represents, immediately before it
      // runs. The phase is derived from the tool, so the UI never claims a
      // stage the agent has not entered.
      agent.phase = phaseForTool(call.name);
      this.broadcast({
        type: 'agent_status',
        phase: agent.phase,
        step: agent.step,
        tool: call.name,
      });
      this.broadcast({ type: 'tool_start', msgId: agent.msgId, toolId, tool: call.name, summary: call.name, target: targetOf(call.name, call.arguments) });
      const capabilityBlocked = capabilityFilter.withheld.includes(call.name);
      const safeToolName = knownTools.has(call.name) ? call.name : 'requested tool';
      // A Studio tool withheld because the link is DOWN is not "unavailable in this mode". Measured
      // 2026-09-22 (run d1a97c0d): the plugin ended its session mid-run, the Studio tools dropped out,
      // and the model — told only "not available … for the current mode" — told the customer the
      // terrain and lighting tools "aren't offered in this mode". Say what actually happened.
      const studioDown = !studioConnected && TOOLS[call.name]?.studio === true;
      if (studioDown) agent.studioDropped = true;
      const out = allowed.has(call.name)
        ? await runTool(ctx, call.name, call.arguments)
        : {
            summary: studioDown
              ? `${safeToolName}: Studio is not connected`
              : capabilityBlocked
                ? `${safeToolName}: unavailable in connected Studio`
                : `${safeToolName}: unavailable in this run`,
            resultForLlm: JSON.stringify({
              error: studioDown
                ? `${safeToolName} did not run because Roblox Studio is not connected right now — the Apple plugin stopped answering. It is not a limit of this mode. Tell the user to reconnect Studio from the Apple panel, and do not claim any Studio change you did not see succeed.`
                : capabilityBlocked
                  ? `${safeToolName} is unavailable because the connected Studio reports a required operation unsupported, or does not report one it needs. It was not executed. Use the Studio tools still offered for this run.`
                  : `${safeToolName} is not available in this run and was not executed. Use only the tools offered for the current mode and permissions.`,
              executed: false,
            }),
            ok: false,
            detail: undefined,
          };
      const entry: ToolTraceEntry = {
        tool: call.name,
        summary: out.summary,
        ok: out.ok,
        durationMs: Date.now() - t0,
        // `runTool` has already capped this payload for the live tool_end event; keep that same
        // untrusted document in history, where the browser validates it before rendering. Without
        // it, a refreshed transcript reduces a generated image to a text-only row.
        detail: out.detail,
      };
      agent.trace.push(entry);
      executedThisStep += 1;
      // Feed the outcome back to the reasoning policy: a failed tool or a failed visual gate
      // means the next step should think harder rather than repeat the same cheap attempt.
      if (!out.ok) agent.priorStepFailed = true;
      // A composite tool can fail after an earlier sub-operation already changed Studio. runTool
      // reports that residual mutation explicitly even when `ok` is false; losing it here would
      // make refund/delivery bookkeeping claim nothing changed when the place did.
      if (out.mutatedProject === true) {
        agent.mutated = true;
        mutatedThisStep = true;
        const retune = afterChange(agent.changesByTarget, `${call.name} ${aim(call.arguments)}`);
        agent.changesByTarget = retune.counts;
        if (retune.action === 'finish' || (retune.action === 'nudge' && retuneThisStep === 'none')) retuneThisStep = retune.action;
      }
      if (out.ok && call.name === 'build_scene') {
        let kitArgs: Record<string, unknown> = {};
        try { kitArgs = JSON.parse(call.arguments || '{}') as Record<string, unknown>; } catch { /* the tool already refused bad JSON */ }
        const kit = floatingIslandKit(kitArgs);
        if (!('error' in kit)) agent.kitZone = kitZone(kit.facts);
      }
      if (out.ok && VERIFIERS.has(call.name) && agent.mutated) verifiedThisStep = true;
      // A read made BEFORE the place changed is not the same read after it. Refusing an identical
      // get_project_tree as "you already have the result above" after a create_instances hands the
      // model a result that is now false — and it asks again (run 1870ecfe). So a change forgets the
      // remembered READ signatures; identical MUTATING calls stay refused.
      if (out.mutatedProject === true) {
        const writers = new Set(projectMutatingToolNames());
        agent.seenCalls = agent.seenCalls.filter((seen) => writers.has(seen.slice(0, seen.indexOf(':'))));
      }
      // The plan is read back out of the panel the tool emitted rather than handed over through a
      // second channel: one mechanism, and the thing settled at the end is by construction the
      // thing the user was shown. A second propose_plan is ignored — the prompt says call it once,
      // and letting a later plan replace the one the user already read would rewrite history.
      if (call.name === 'propose_plan' && out.ok && !agent.plan) agent.plan = planFromDetail(toolId, out.detail);
      // The plan tool's refusal count survives the step. ctx.planState is shared by every call of
      // this step, so two plans in one step already see each other; this carries it to the next.
      if (call.name === 'propose_plan' && ctx.planState) {
        agent.planRefusals = { count: ctx.planState.refusals, kinds: [...ctx.planState.kinds] };
        if (agent.plan) ctx.planState.announced = true;
      }
      // Remember whether an identical repeat of THIS call would be safe. Only the classifier's own
      // verdict counts (runTool drops it when a composite already changed Studio); anything else —
      // success, or a failure not known to be repeatable — makes an identical repeat a duplicate.
      if (!out.ok && out.retryable === true) {
        if (!retry) {
          agent.retryableCalls = [...(agent.retryableCalls ?? []), { sig, retries: 0 }].slice(-4);
        }
      } else if (retry) {
        agent.retryableCalls = (agent.retryableCalls ?? []).filter((r) => r.sig !== sig);
      }
      if (ctx.lastCritique && !ctx.lastCritique.passed) agent.visualDefectsFound = true;
      this.broadcast({ type: 'tool_end', msgId: agent.msgId, toolId, ok: out.ok, summary: out.summary, detail: out.detail });
      // Keep the live trace the reconnect snapshot replays from.
      agent.uiTools = agent.uiTools ?? [];
      agent.uiTools.push({
        toolId,
        tool: call.name,
        ok: out.ok,
        summary: out.summary,
        durationMs: entry.durationMs,
        detail: out.detail,
      });
      if (agent.uiTools.length > 60) agent.uiTools.splice(0, agent.uiTools.length - 60);
      //[[ FENCE TOOL OUTPUT AS UNTRUSTED DATA — it can contain attacker-authored text.
      //
      //   Built by `fenceToolOutput` rather than interpolated here, for a reason that is not
      //   tidiness. `call.name` IS MODEL-SUPPLIED: `runTool` refuses a name it does not know, but
      //   it refuses by RETURNING an error result, and that result was then fenced with the same
      //   name. A call named `get_project_tree" trusted="yes` wrote an attribute the content chose
      //   onto the one tag in the transcript whose whole authority is that content cannot write it.
      //   The name now goes through an allowlist there.
      //
      //   The body is passed through byte for byte — escaping it would mangle the evidence the
      //   agent reasons from. What the scan finds is reported in the tag's ATTRIBUTES, the one
      //   place content cannot reach because the tag carries the run's unguessable id, and on the
      //   tool row, so the user sees that a page tried it. ]]
      const fenced = fenceToolOutput({ fenceId: this.fenceIdFor(agent), tool: call.name, body: out.resultForLlm });
      if (fenced.threats.length) {
        const note = describeThreats(fenced.findings);
        entry.summary = `${entry.summary} · ${note}`;
        const lastUi = agent.uiTools[agent.uiTools.length - 1];
        if (lastUi) lastUi.summary = `${lastUi.summary} · ${note}`;
        recordEvent({ kind: 'error', scope: `tool:${call.name}`, errorKind: 'prompt_injection', message: note });
      }
      agent.llm.push({
        role: 'tool',
        content: fenced.text,
        toolCallId: call.id,
        name: call.name,
      });
      if (await stopRequested(this.ctx.storage)) {
        agent.status = 'stopping';
        break;
      }
      if (await this.stopForAccess(agent)) return;
    }

    // Checked again here, not only inside the tool loop: a stop that arrives after the last
    // tool's check would otherwise be overwritten by this step's tail persist below, and the
    // next alarm would carry on as though the button had never been pressed.
    if (agent.status === 'stopping' || (await stopRequested(this.ctx.storage))) {
      agent.status = 'stopping';
      await this.finishRun(agent, 'stopped');
      return;
    }
    // A step whose every call was refused as a duplicate made no progress and was still paid for.
    // Three in a row is a loop, not deliberation: end on what the run has, and say so.
    agent.duplicateStreak = executedThisStep === 0 && duplicatesThisStep > 0 ? (agent.duplicateStreak ?? 0) + 1 : 0;
    if (agent.duplicateStreak >= MAX_DUPLICATE_STREAK) {
      const note = agent.lightingOnly && agent.mutated
        ? `The lighting is changed. ${spaced(builtSummary(agent.trace, READ_ONLY_WITHHELD))}Say what else you would like and Apple will do it.`
        : agent.kitZone
        ? `Your scene is built. ${spaced(builtSummary(agent.trace, READ_ONLY_WITHHELD))}Say what you would like changed and Apple will change it.`
        : agent.mutated
        ? `Apple stopped because it kept repeating a step it had already done. ${spaced(builtSummary(agent.trace, READ_ONLY_WITHHELD))}Everything it built is in your place.`
        : 'Apple stopped because it kept repeating a step it had already done, and nothing in your place was changed.';
      agent.terminalNote = note;
      const prior = agent.streamedText ?? '';
      agent.finalText = agent.finalText ? `${agent.finalText}\n\n${note}` : note;
      agent.streamedText = prior ? `${prior}\n\n${note}` : note;
      this.broadcast({ type: 'delta', msgId: agent.msgId, text: prior ? `\n\n${note}` : note });
      await this.finishRun(agent, agent.mutated ? 'done' : 'incomplete');
      return;
    }
    // Built and checked, then only reading: tell it to answer, and if it still does not, end on the
    // work it did. A new change clears the check, so a run that is still fixing things is untouched.
    const idle = afterStep(agent, {
      mutated: mutatedThisStep,
      verified: verifiedThisStep,
      calls: executedThisStep + duplicatesThisStep,
      answerOnly: agent.readOnly === true,
      canBuild,
    });
    agent.verifiedAfterMutation = idle.verifiedAfterMutation;
    agent.idleAfterVerify = idle.idleAfterVerify;
    agent.readsSinceChange = idle.readsSinceChange;
    // Reading without building — F-039, run c71b89a9: one install, then 88 read-only calls. Told to
    // build at the nudge; at the limit the run ends and says plainly what it did and did not do.
    if (idle.action === 'stall' && agent.lightingOnly && agent.mutated) {
      // A lighting change that is made and then only looked at is finished, not stalled.
      const note = `The lighting is changed. ${spaced(builtSummary(agent.trace, READ_ONLY_WITHHELD))}Say what else you would like and Apple will do it.`;
      agent.terminalNote = note;
      const prior = agent.streamedText ?? '';
      agent.finalText = agent.finalText ? `${agent.finalText}\n\n${note}` : note;
      agent.streamedText = prior ? `${prior}\n\n${note}` : note;
      this.broadcast({ type: 'delta', msgId: agent.msgId, text: prior ? `\n\n${note}` : note });
      await this.finishRun(agent, 'done');
      return;
    }
    if (idle.action === 'stall') {
      const note = agent.mutated
        ? `Apple stopped because it kept re-reading your place instead of building the rest. ${spaced(builtSummary(agent.trace, READ_ONLY_WITHHELD))}Ask again to continue.`
        : 'Apple stopped because it kept re-reading your place instead of building, and nothing in your place was changed. Ask again to continue.';
      agent.terminalNote = note;
      const prior = agent.streamedText ?? '';
      agent.finalText = agent.finalText ? `${agent.finalText}\n\n${note}` : note;
      agent.streamedText = prior ? `${prior}\n\n${note}` : note;
      this.broadcast({ type: 'delta', msgId: agent.msgId, text: prior ? `\n\n${note}` : note });
      await this.finishRun(agent, 'incomplete');
      return;
    }
    // Changing the same thing over and over — F-036: 101 steps re-tuning one Lighting value.
    if (retuneThisStep === 'finish') {
      const note = `Apple stopped here: it had changed the same thing many times in a row. ${spaced(builtSummary(agent.trace, READ_ONLY_WITHHELD))}Say what should be different and it will pick up from there.`;
      const prior = agent.streamedText ?? '';
      agent.finalText = agent.finalText ? `${agent.finalText}\n\n${note}` : note;
      agent.streamedText = prior ? `${prior}\n\n${note}` : note;
      this.broadcast({ type: 'delta', msgId: agent.msgId, text: prior ? `\n\n${note}` : note });
      await this.finishRun(agent, 'done');
      return;
    }
    if (retuneThisStep === 'nudge') {
      agent.llm.push({
        role: 'user',
        content:
          'You have changed the same thing several times in a row. Stop tuning it: keep the best version you have, ' +
          'finish anything else the request still needs, and then reply to the user.',
      });
    }
    if (idle.action === 'build') {
      agent.llm.push({
        role: 'user',
        content:
          'You have read the place enough. Stop reading and make the next change the request needs now, with what you ' +
          'already know. If a detail is missing, choose a sensible default instead of reading again.',
      });
    }
    if (idle.action === 'finish') {
      const note = 'Apple stopped here: the change was made and checked, and further steps were only re-reading the place.';
      const prior = agent.streamedText ?? '';
      agent.finalText = agent.finalText ? `${agent.finalText}\n\n${note}` : note;
      agent.streamedText = prior ? `${prior}\n\n${note}` : note;
      this.broadcast({ type: 'delta', msgId: agent.msgId, text: prior ? `\n\n${note}` : note });
      await this.finishRun(agent, 'done');
      return;
    }
    if (idle.action === 'answer') {
      agent.llm.push({
        role: 'user',
        content:
          'You have read enough to answer. Reply to the user now with what you found, in plain words. ' +
          'Only call another tool if one specific fact you need is still missing.',
      });
    }
    if (idle.action === 'nudge') {
      agent.llm.push({
        role: 'user',
        content:
          'The change is made and your check has run. Stop reading and reply to the user now: what you changed, ' +
          'what the check showed, and anything that is still wrong or unverified. Only call another tool if you are ' +
          'about to change something.',
      });
    }
    // If the model has spent several steps without changing anything, steer it. Mutation truth
    // comes from the tool implementation's co-located metadata through runTool, rather than a
    // second list of names here that can drift when a composite or direct authoring tool is added.
    // ONLY for a run that CAN build (`canBuild`, from the same metadata). Plan mode and an Agent run
    // with Studio disconnected are offered nothing that changes the project, so telling them to
    // "create the instances" could only invite a call to a tool they do not have — refused as
    // unavailable, a paid step each time.
    const built = agent.mutated === true;
    if (!built && agent.step >= 2 && canBuild && studioConnected) {
      agent.llm.push({
        role: 'user',
        content:
          'You have spent several steps researching without changing the project. Stop investigating and build now with what you know: create the instances or edit the scripts the request needs. Build geometry from Parts rather than looking for assets.',
      });
    }
    this.captureProvenance(agent, ctx);
    await this.persistAgent(agent);
    await this.ctx.storage.setAlarm(Date.now() + 10);
  }

  /**
   * Is this submission the same submission again? Returns true when the run must not start.
   *
   * TWO OUTCOMES ON THIS SURFACE, NOT THREE. `scoreSubmission` can say `throttle`, and a socket
   * cannot throttle: there is nothing here that can hold a run back for thirty seconds, and a
   * `throttle` branch that quietly started the run anyway would be a defence that reads like one
   * and is not. So `refuse` refuses, `throttle` is RECORDED and the run proceeds, and the split is
   * written down here rather than left for the next reader to infer.
   *
   * The history is this project's own message table. A read that THROWS is passed on as
   * `historyReadable: false` rather than as an empty list — an empty list means "this user has sent
   * nothing", which is an observation, and a failed query is the absence of one.
   */
  private refuseAbusive(text: string, who: { actorId: string | null; projectId: string | null }): boolean {
    let recent: Submission[] = [];
    let historyReadable = true;
    try {
      const rows = this.sql
        .exec(`select content, created_at from messages where role = 'user' order by created_at desc limit 20`)
        .toArray() as { content: string; created_at: number }[];
      recent = rows.map((r) => ({ text: r.content, at: r.created_at }));
    } catch {
      historyReadable = false;
    }
    const verdict = scoreSubmission({
      text,
      recent,
      now: Date.now(),
      historyReadable,
      // A fresh id per submission: the prompt is scanned with the same injection rules as tool
      // output, and a prompt cannot contain an id that was minted for this scan alone.
      fenceId: crypto.randomUUID().slice(0, 8),
    });
    // RECORDED BEFORE ANYTHING IS DECIDED, and that ordering is the fix rather than a tidy-up.
    // `recordEvent` used to sit below the `action === 'allow'` return, so the only findings that
    // were ever written down were the ones already being throttled or refused for something else.
    // The two zero-weight signals — a pasted credential, an injection pattern — exist precisely to
    // be noted on submissions that are otherwise fine, and those were the submissions whose
    // findings were discarded. Nothing fires on a clean verdict: `signals` is empty and there is
    // nothing to say.
    //
    // A pasted credential gets its OWN `errorKind` rather than the generic `abuse_noted`. It is
    // the one finding here that is about the user's own property rather than their conduct, and
    // an operator reading the trace for leaked keys should not have to grep message bodies.
    if (verdict.signals.length > 0) {
      const secret = verdict.signals.some((s) => s.code === 'secret_in_prompt');
      recordEvent({
        kind: 'error',
        scope: 'chat:ingress',
        errorKind:
          verdict.action === 'refuse'
            ? 'abuse_refused'
            : verdict.action === 'throttle'
              ? 'abuse_throttled'
              : secret
                ? 'secret_in_prompt'
                : 'abuse_noted',
        message: verdict.signals.map((s) => `${s.code}: ${s.detail}`).join(' | '),
        // ATTRIBUTED, or the whole stream is unreviewable. Every one of these rows used to land
        // with a null actor, so an operator could read that somebody had been refused for flooding
        // or had pasted a live credential into a transcript, and could not find out who — which
        // makes the detection a counter rather than something anyone can act on. Null when the
        // socket carried no readable identity, never a placeholder: `breakdownBy` counts
        // unattributed events instead of inventing a tenant to hang them on.
        actorId: who.actorId,
        projectId: who.projectId,
      });
    }
    // And told to the person it is about. A credential in a transcript is theirs to rotate whether
    // or not this particular run starts, so this is sent on both paths — see `advisory` for why it
    // covers the pasted key and not the injection pattern.
    //
    // SENT AS `notice`, NOT AS `error`. This was an `error` only because the wire had no other
    // channel; it now has one. The run is still going and nothing failed, and a failure-shaped
    // banner over a build that is happily building teaches people to distrust both the banner and
    // the build. The browser renders it as an info toast with a link to where keys live.
    const notice = advisory(verdict);
    if (notice) this.broadcast({ type: 'notice', code: notice.code, message: notice.message });
    if (verdict.action === 'allow') return false;
    if (verdict.action !== 'refuse') return false;
    this.broadcast({
      type: 'error',
      code: 'rate_limited',
      message: verdict.message ?? 'This request was not started because it repeats one that is already running.',
    });
    return true;
  }

  /**
   * Carry asset provenance from the step that discovered it onto the run that will use it.
   *
   * `agentCtx()` rebuilds its object every step, so without this a `find_verified_asset` in step N
   * and the `insert_asset` in step N+1 never meet: the second arrives with empty sets, provenance
   * degrades to `user_supplied`, and the curated-library waiver silently stops applying.
   *
   * Bounded, because this is unbounded model-supplied input in all but name: a run that searched
   * in a loop would otherwise grow the persisted state without limit. The newest ids are kept,
   * since those are the ones an insert in the next step is actually about.
   */
  /**
   * The run's fence id, minted if a run persisted by an older deploy arrives without one.
   *
   * NEVER a constant. The `?? ''` that stood here gave every such run the SAME marker, and the
   * untrusted-content rule stakes everything on the marker being unguessable: content that knows
   * the id can close the fence and open a fresh one the model has been instructed to trust. An
   * empty id is not a weaker secret, it is a shared one.
   *
   * A minted id will not match the system prompt a legacy run is already carrying, and that is the
   * FAIL-CLOSED direction on purpose — the prompt tells the model that a closing tag without the
   * exact id was written by the content, and that everything after it is still inside the fence.
   * Unrecognised beats forgeable.
   */
  private fenceIdFor(agent: AgentState): string {
    if (!agent.fenceId) agent.fenceId = crypto.randomUUID().slice(0, 8);
    return agent.fenceId;
  }

  private captureProvenance(agent: AgentState, ctx: AgentCtx): void {
    const CAP = 200;
    if (ctx.discoveredAssetIds?.size) agent.discoveredAssetIds = [...ctx.discoveredAssetIds].slice(-CAP);
  }

  /**
   * Persist the run state, shedding transcript rather than dying.
   *
   * The policy lives in `persist.ts` and is tested there; this supplies the storage and nothing
   * else. It was a method here until that method was found calling ITSELF instead of storage,
   * a bug no test happened to reach. See F-31.
   */
  private async persistAgent(agent: AgentState): Promise<void> {
    await persistWithShedding((value) => this.ctx.storage.put('agent', value), agent);
  }

  private async finishRun(
    agent: AgentState,
    reason: 'done' | 'stopped' | 'error' | 'quota' | 'incomplete',
    /**
     * A CODE, never prose. It is broadcast to the browser on `msg_end`, and the app owns the
     * sentence — see RUN_FAILURES in @golem/shared. Typing it as the closed set is what makes
     * "just pass the message through" a compile error rather than a leak nobody notices.
     */
    error?: RunFailure,
    /**
     * A terminal sentence assembled from evidence outside the ordinary completion path.
     *
     * Used only when the provider explicitly did NOT complete its response. The partial text is
     * still useful evidence, but neither `done` nor the generic incomplete fallback may overwrite
     * the sentence that says it was cut short. Ordinary calls omit this and retain the established
     * artifact/incomplete safeguards below.
     */
    contentOverride?: string,
    /**
     * HOW THE RUN ENDED, FOR THE BUILD LOG — a finer answer than `reason` where one exists.
     *
     * A run killed by the step cap and a run killed by the wall clock both end with `reason:
     * 'done'`, because `done` is what the browser's `msg_end.stopReason` union can carry: that
     * union lives in @golem/shared and is rendered by apps/web, and widening it is a change to a
     * contract this file does not own. But the ANALYTICS vocabulary is this file's to widen, and
     * filing "stopped three steps in, unfinished, and paid for" under the same label as "it worked"
     * is what made every failure-rate number wrong in our own favour.
     *
     * Omitted means `reason`, which is what every ordinary caller wants.
     */
    buildOutcome?: BuildOutcome,
  ) {
    const artifact = artifactCompletion(agent.mode === 'plan' ? undefined : agent.request, agent.trace);
    if (reason === 'done' && artifact.missing) reason = 'incomplete';
    agent.status = 'idle';
    // Clear the run attribution before the first await: any later out-of-run Studio op must not
    // inherit the finished run's id, even if this cleanup is interrupted midway through.
    this.currentMsgId = undefined;

    // The run is over, so the "is building" beside somebody's name is no longer true. Done first,
    // synchronously, because everything below this awaits and an isolate that goes away mid-tidy
    // would leave the claim standing on every other screen in the project.
    this.clearBuildingBeats();

    // Read before anything else awaits: the notification below wants the project's name, and a
    // storage read placed next to its use would be one more await between the run ending and the
    // isolate going away.
    const bindName = (await this.bind())?.projectName ?? null;
    // The signal belongs to the run it was pressed during. Leaving it set would stop the
    // user's NEXT message before its first step.
    await clearStop(this.ctx.storage);
    // Nothing this run queued may still be applied to the place now that it has ended.
    const abandoned = await this.dropOpsForEndedRuns(undefined);
    // A regrant that arrived while this run was still live is deliberately deferred until now.
    // Clearing the mark earlier would let an invalidated run resume if its next alarm raced the
    // regrant; clearing only after the run is idle makes the regrant apply to future runs only.
    if (agent.initiatedBy && (await this.ctx.storage.get<boolean>(accessClearPendingKey(agent.initiatedBy))) === true) {
      await clearAccessRevoked(this.ctx.storage, agent.initiatedBy);
      await this.ctx.storage.delete(accessClearPendingKey(agent.initiatedBy));
    }
    //[[ AND THE RUN STOPS OWNING OPS QUEUED AFTER IT.
    //
    //   `execStudioOp` tags every op with `currentMsgId`, and this field used to survive the
    //   run that set it. So the next op queued with NO run in flight — a checkpoint from
    //   POST /api/projects/:id/checkpoints, or the automatic snapshot taken as the next run
    //   starts — inherited a DEAD run's id, and the next poll discarded it with "The run this
    //   change belonged to has ended".
    //
    //   Seen twice against the deployed Worker on 2026-09-01, in both golden creation
    //   exercises. The costly one is the automatic pre-run checkpoint: that is the undo point
    //   the product promises before it changes anything, and it silently was not taken.
    //
    //   Clearing it at run end above puts those ops back on the `runId === undefined` path, which
    //   partitionOpsByRun keeps — an op that belonged to no run cannot belong to an ended one.
    //   A5 is untouched: ops queued DURING a run still carry that run's id, and runStep
    //   re-establishes the field on every step, so an eviction mid-run cannot land here. ]]
    if (abandoned > 0) {
      console.warn(`[session] discarded ${abandoned} queued op(s) from a run that ended`);
    }

    // THE PLAN STOPS BEING A FORECAST HERE.
    //
    // propose_plan emitted every step as `pending`, which was true when the user read it and is
    // false now. gates.ts lifts pending steps into the Thinking card as work still to come, so a
    // plan nobody re-states leaves a finished run claiming it is about to do things it already did
    // — and, worse, hides the steps it promised and never reached. Both halves matter, which is
    // why the settled plan keeps the unticked ones rather than dropping them.
    //
    // It goes out on the SAME toolId, so the browser replaces that row's panel instead of drawing a
    // second, contradictory card; `uiTools` is updated in step so a reconnecting browser replays
    // the settled plan and not the proposal. See run-plan.ts for what `done` is allowed to mean.
    //
    if (agent.plan) {
      const settled = settlePlan(agent.plan, agent.trace);
      agent.plan = settled;
      const detail = planDetail(settled);
      const row = (agent.uiTools ?? []).find((t) => t.toolId === settled.toolId);
      if (row) row.detail = detail;
      this.broadcast({
        type: 'tool_end',
        msgId: agent.msgId,
        toolId: settled.toolId,
        ok: true,
        summary: `plan: ${settled.steps.filter((s) => s.status === 'done').length}/${settled.steps.length} done`,
        detail,
      });
    }

    // A playtest cannot outlive the run that started it.
    //
    // run_and_check reports its own terminal phase on every path it returns
    // from, but it is not the only way this run can end: the tool can throw,
    // the user can press stop, the budget can abort mid-loop. On any of those
    // the record would be left saying 'running' and the card would sit there
    // counting up the age of a frame from a playtest that is long over.
    //
    // Reported as 'failed' rather than 'finished' because that is what
    // happened — the playtest did not complete, and saying it did would be the
    // same category of lie the card exists to avoid.
    if (this.playtestRun && !isTerminal(this.playtestRun.phase)) {
      this.playtestRun = advance(this.playtestRun, {
        phase: 'failed',
        action: 'The run ended before the playtest finished',
        // NOT the run's failure code: this field is rendered to the user by playtest-card.tsx,
        // and a code is not a sentence. The playtest reports the run ending in its own words.
        error: reason === 'stopped' ? 'stopped by you' : `the run ended (${reason})`,
        now: Date.now(),
      });
      this.emitPlaytest();
    }

    // 'incomplete' OVERRIDES the model's own text rather than appending to it, which is the whole
    // point: on the run this was written for, that text was the single word "Done." A reply that
    // reports work which did not happen is worse than an error, because the user has no reason to
    // check. The tool trace is still attached, so the timeline shows exactly what was attempted.
    //[[ ONE CLOSING LINE, AND IT IS THE ONE THAT NAMES THE REAL REASON (F-045, 2026-09-23).
    //
    //   Measured in production: one incomplete run's reply carried the read-stall note, then the
    //   generic sentence below ("I did not change anything … I looked around but never made the
    //   edit"), then the refund, then the refusal heading — four accounts of one ending, two of them
    //   contradicting each other. So, in this order:
    //     - a refusal the product can explain, on a run that changed nothing, IS the reason: its
    //       heading and remedy are the closing, and neither incomplete sentence is added;
    //     - a bound that already wrote its own note (`terminalNote`) keeps it, and the generic
    //       sentence does not go on top;
    //     - only a run with neither gets the generic sentence.
    //   The refund sentence is money and always stays, once. ]]
    const remedyCloses =
      reason === 'incomplete' && !contentOverride && !artifact.missing && !agent.readOnly && !agent.mutated
      && isRefusalRemedyCode(agent.refusalRemedy);
    const content = contentOverride ?? (
      reason === 'incomplete'
        ? artifact.missing
          ? (artifact.tool === 'generate_image'
            ? 'No image was generated in this run. There is no new image to view or download.'
            : 'No 3D model was generated in this run. Check the Studio connection and generation availability before retrying.')
          : remedyCloses
            ? replyWithRemedy('', agent.refusalRemedy)
          : agent.terminalNote
            ? agent.terminalNote
          : agent.readOnly
            // You asked for no changes, so "never made the edit you asked for" would be false twice
            // over. Measured 2026-09-22 (run 3bcf3f57): a diagnosis request got exactly that sentence.
            ? 'I looked through your place but did not reach an answer before I stopped, and I kept ' +
              're-reading the same things. Nothing was changed, as you asked. Ask again and name the ' +
              'script or object to start from, and I will look there first.'
            : 'I did not change anything in your project. I looked around but never made the edit you ' +
              'asked for, which is a fault on my side rather than a result. Nothing was modified, so ' +
              'there is nothing to undo — ask me again and I will build it.'
        : agent.finalText || (reason === 'stopped' ? 'Stopped.' : 'Done.')
    );

    //[[ AND THE RUN STOPS BILLING FOR WORK IT DID NOT DO.
    //
    //   The product settles Credits from measured compute after every model call — honest, and
    //   until now the only arithmetic it had. So a run that hit the provider's output ceiling, or
    //   errored, or ran out of steps, charged for every neuron and then said "send another message
    //   and Apple will continue from here", which starts a second run and charges again. One build,
    //   paid for twice, and every sentence involved individually true.
    //
    //   `refundVerdict` is narrow on purpose: only a run that left the user with NOTHING they can
    //   keep — no applied ops, nothing mutated, no requested artifact, and in a conversational mode
    //   no answer — and only on an ending that is a failure. A user who pressed stop is not
    //   refunded, which is the rule the stop check above already states.
    //
    //   ORDERED BEFORE THE ROW IS WRITTEN so `credits_spent` on the message, the `creditsSpent` on
    //   msg_end and the sentence in the reply are all the same number. It was previously possible
    //   for the transcript and the meter to disagree about one run; that must not become true again
    //   through the refund door.
    //
    //   The SENTENCE is composed from what the ledger RETURNED, never from what was asked for.
    //   They differ over a UTC midnight and the difference is the user's money. ]]
    const verdict = refundVerdict({
      reason,
      buildOutcome,
      mode: agent.mode,
      opsApplied: agent.trace.filter((t) => t.ok).length,
      mutated: agent.mutated === true,
      artifactRequested: artifact.tool !== null,
      artifactMissing: artifact.missing,
      // The model's OWN prose, not the product's failure note. `finalText` is overwritten by the
      // truncation branch with the composed terminal text, so `contentOverride` — which that branch
      // is the only caller to pass — is not evidence of a model answer either. What survives both
      // is: did the model stream anything of its own during this run?
      textDelivered: typeof agent.streamedText === 'string' && agent.streamedText.trim().length > 0 && !contentOverride,
      creditsSpent: agent.creditsSpent,
      studioDropped: agent.studioDropped === true,
    });
    let refundNote: string | null = null;
    if (verdict.refund && agent.creditsRefunded === undefined) {
      const { attempted, asked, returned } = await this.refundRun(agent, verdict.credits);
      if (attempted) {
        agent.creditsRefunded = returned;
        agent.creditsSpent = Math.max(0, agent.creditsSpent - returned);
        refundNote = refundSentence(asked, returned);
      }
      this.sql.exec(
        `insert into oplog(op_id, kind, ok, summary, created_at, failure, run_id) values(?,?,?,?,?,?,?)`,
        `${agent.msgId}-refund`,
        'credits_refunded',
        returned > 0 ? 1 : 0,
        (attempted
          ? `run produced no usable output (${buildOutcome ?? reason}); asked ${asked}, returned ${returned}`
          : `run produced no usable output (${buildOutcome ?? reason}); asked ${verdict.credits}, the ledger did not answer`
        ).slice(0, 200),
        Date.now(),
        returned > 0 ? null : attempted ? 'refund_not_applied' : 'refund_unknown',
        agent.msgId,
      );
    }
    const contentWithRefund = refundNote ? `${content}\n\n${refundNote}` : content;

    // THE PRODUCT'S OWN WORDS, ADDED AFTER THE MODEL'S. Not an override, because the model's text
    // usually also contains something true about what it tried; and not a silent replacement,
    // because the user should be able to see both and believe the one that is signed.
    //
    // EXCEPT when the model named a Studio settings page that does not exist (w35). Then the reply
    // IS replaced, because two accounts of one event — one of them a numbered, actionable-looking
    // fabrication — is worse than one. What was removed is written to the oplog rather than to the
    // reply: the user needs the truth, not a note about their assistant's imagination, and the next
    // person debugging this needs to know a replacement happened at all.
    const fiction = remedyCloses ? null : replacedFiction(contentWithRefund, agent.refusalRemedy);
    // When the remedy is already the closing it is not appended a second time.
    const withRemedy = remedyCloses ? contentWithRefund : replyWithRemedy(contentWithRefund, agent.refusalRemedy);
    if (fiction) {
      this.sql.exec(
        `insert into oplog(op_id, kind, ok, summary, created_at, failure, run_id) values(?,?,?,?,?,?,?)`,
        `${agent.msgId}-fiction`,
        'reply_replaced',
        0,
        `the reply named "${fiction}", which does not exist in Roblox Studio; replaced with the product's remedy`.slice(0, 200),
        Date.now(),
        'refused',
        agent.msgId,
      );
    }
    // make sure fallback/step-limit text reaches clients that saw no delta for it. The live
    // socket and the stored row carry the SAME text: a remedy visible only after a reload would
    // be the two-accounts-of-one-event bug the outcome model was written to end.
    //
    // ONLY WHAT THE STREAM DOES NOT ALREADY SHOW (F-045, 2026-09-23). This was
    // `withRemedy.slice(streamedText.length) || '\n' + withRemedy`: the stream holds every step's
    // text and the reply only the last step's, so the whole reply was sent again and every
    // multi-step reply read twice live ("Fixed. …" twice). msg_end below carries the stored reply
    // itself, so a client that holds the stream can settle on exactly what a reload shows.
    const delta = replyDelta(agent.streamedText ?? '', withRemedy);
    if (delta) this.broadcast({ type: 'delta', msgId: agent.msgId, text: delta });
    this.sql.exec(
      `insert into messages(id, role, mode, content, tool_trace, created_at) values(?,?,?,?,?,?)`,
      agent.msgId,
      'assistant',
      agent.mode,
      withRemedy,
      JSON.stringify(agent.trace),
      Date.now(),
    );
    // The live socket's terminal facts belong to THIS assistant row: its id is the run id and is
    // the exact provenance the client already uses for every delta/tool/end frame. Persist only
    // bounded metadata here. In particular, `agent.intent` and `agent.request` are deliberately
    // absent — both contain prompt-derived text and terminal history does not need another copy of
    // the user's words.
    const deniedToolsForHistory =
      Array.isArray(agent.deniedTools)
      && agent.deniedTools.length <= 128
      && agent.deniedTools.every((name) => typeof name === 'string' && name.length > 0 && name.length <= 64 && /^[a-z0-9_]+$/.test(name))
        ? JSON.stringify(agent.deniedTools)
        : null;
    this.sql.exec(
      `update messages
          set stop_reason = ?, run_failure = ?, credits_spent = ?,
              context_used_chars = ?, context_max_chars = ?,
              context_dropped_groups = ?, context_dropped_chars = ?, denied_tools = ?
        where id = ?`,
      reason,
      error ?? null,
      Number.isSafeInteger(agent.creditsSpent) && agent.creditsSpent >= 0 ? agent.creditsSpent : null,
      Number.isSafeInteger(agent.contextUsedChars) && (agent.contextUsedChars ?? -1) >= 0 ? agent.contextUsedChars : null,
      Number.isSafeInteger(agent.contextMaxChars) && (agent.contextMaxChars ?? 0) > 0 ? agent.contextMaxChars : null,
      Number.isSafeInteger(agent.contextDroppedGroups) && (agent.contextDroppedGroups ?? 0) > 0 ? agent.contextDroppedGroups : null,
      Number.isSafeInteger(agent.contextDroppedChars) && (agent.contextDroppedChars ?? 0) > 0 ? agent.contextDroppedChars : null,
      deniedToolsForHistory,
      agent.msgId,
    );
    this.rememberProductModel(agent.msgId, agent.productModel ?? effectiveProductModel(agent.mode));
    await this.persistAgent(agent);
    // The settled cost of the whole run. Read here, after the last `quotaSpend`, because every
    // earlier broadcast of this number was taken before that step's settlement and was therefore
    // an under-count of what the user had actually been charged.
    this.broadcast({ type: 'msg_end', msgId: agent.msgId, stopReason: reason, error, creditsSpent: agent.creditsSpent, content: withRemedy });

    // BUILD LOG. One event per run, written from the branch that actually ended it, so `outcome` is
    // the reason recorded rather than a guess made later from the reply text. `neuronsUsed` is
    // `number | undefined` on a run persisted by an older deploy: it is passed through as null, and
    // the cost rollup reports that run as unreadable instead of adding a zero to the total.
    recordEvent({
      kind: 'build',
      // NOT `reason`. See the `buildOutcome` parameter: `done` is the only thing the browser's
      // stopReason union can carry for a step-cap or wall-clock exit, and counting those as
      // successes is the defect. The override never applies when `finishRun` rewrote `reason`
      // above — an artifact-missing run is `incomplete` whatever the caller hoped for — which is
      // why this reads `reason === 'done' ? …` rather than taking the override unconditionally.
      outcome: reason === 'done' ? (buildOutcome ?? 'done') : reason,
      finishReason: agent.lastFinishReason ?? null,
      steps: agent.step,
      opsApplied: agent.trace.filter((t) => t.ok).length,
      opsFailed: agent.trace.filter((t) => !t.ok).length,
      durationMs: Date.now() - agent.startedAt,
      neurons: agent.neuronsUsed ?? null,
      actorId: agent.initiatedBy ?? agent.userId,
      projectId: this.boundProjectId,
      runId: agent.msgId,
    });
    //[[ THE RUN'S OUTCOME, WRITTEN DOWN RATHER THAN ONLY BROADCAST.
    //
    //   `msg_end` above reaches whoever has this project's socket open at this instant. That is
    //   the right thing for someone watching, and it is the ONLY thing the product had: close the
    //   tab and the outcome was not delayed, it was gone. There was nothing to come back to.
    //
    //   Addressed to the person who STARTED the run, which is the one case where actor and
    //   recipient being the same person is the entire point - see `suppressSelf` in
    //   notifications.ts. A run with no user on it (a session persisted by an older deploy) is not
    //   notified rather than notified to nobody.
    //
    //   Best-effort and off the critical path. `notify` never throws; this is additionally on
    //   waitUntil so a slow D1 write cannot hold the isolate open at the moment it is most likely
    //   to be evicted. ]]
    const runRecipientId = agent.initiatedBy ?? agent.userId;
    if (runRecipientId && this.boundProjectId) {
      // 'stopped' is the user pressing stop, which is not a failure and does not need reporting
      // back to the person who pressed it. 'quota' is: the run ended without doing the work.
      const failed = reason === 'error' || reason === 'incomplete' || reason === 'quota';
      const outcome = notify(this.env, {
        kind: failed ? 'run_failed' : 'run_complete',
        recipientId: runRecipientId,
        projectId: this.boundProjectId,
        projectName: bindName,
        // The run id, so two failures of the SAME run coalesce into one line and two different
        // runs never do.
        subject: agent.msgId,
        title: failed ? `That build did not finish` : `Your build finished`,
        body: failed
          ? (error ?? 'The run ended before it could make the change you asked for.')
          : `${agent.trace.filter((t) => t.ok).length} change(s) applied for ${agent.creditsSpent} Credit(s).`,
        at: Date.now(),
      }).then(() => undefined);
      //[[ OFF THE CRITICAL PATH, AND ACTUALLY STARTED. This was `waitUntil(outcome)`, which drops
      //   the promise on the floor in a Durable Object, and notification-emitters.test.mjs pinned
      //   that exact spelling to keep the emit off the run's critical path. The property is right —
      //   a slow inbox must not take down a finished run — and the spelling achieved it only by
      //   never sending at all. `void … .catch()` keeps it off the path and lets it run: the object
      //   stays alive while it has pending I/O, and this is pending I/O. ]]
      void outcome.catch(() => {});
    }

    //[[ AND WHETHER THE RUN LEFT THEM SHORT.
    //
    //   `usage-meter-model.ts` already turns amber at this level and do/session.ts already appends
    //   a line to the transcript when a run spends the last Credit. Both are things you see WHILE
    //   LOOKING, which is the same gap the run outcome had: the person whose overnight build used
    //   the last of the day's allowance learns it by starting the next one and being refused.
    //
    //   The DAY and the BAND are the dedupe subject, so crossing into 'low' is said once per day
    //   rather than after every one of the eleven runs that follow it - and crossing from 'low'
    //   into 'exhausted' is still a second, different thing worth saying.
    //
    //   Read AFTER the last settlement, like `creditsSpent` above, or the figure reported is the
    //   one from before this run paid for itself. ]]
    if (agent.userId) {
      const state = await this.quotaState(agent.userId).catch(() => null);
      const band = state ? usageBand(state.creditsRemaining, state.creditsDaily) : 'fine';
      if (state && band !== 'fine') {
        const usage = notify(this.env, {
          kind: 'usage_threshold',
          recipientId: agent.userId,
          subject: `usage:${dayKey(Date.now())}:${band}`,
          title: band === 'exhausted' ? 'Your Credits for today are used up' : 'You are running low on Credits',
          body:
            band === 'exhausted'
              ? `They refill at ${state.resetsAtIso}. Credits, or a bigger plan, cover the gap.`
              : `${state.creditsRemaining} of ${state.creditsDaily} left today. They refill at ${state.resetsAtIso}.`,
          at: Date.now(),
        }).then(() => undefined);
        void usage.catch(() => {});
      }
    }

    // A Durable Object's isolate can be evicted the moment it goes idle, and a run ending is
    // exactly when that happens — so this one flushes rather than waiting for a threshold.
    //[[ AWAITED, BECAUSE `state.waitUntil` DOES NOTHING HERE.
    //
    //   Cloudflare's own documentation for DurableObjectState: "Unlike in Workers, `waitUntil` has
    //   no effect in Durable Objects. It does not extend the lifetime of a Durable Object or affect
    //   when a request or RPC completes. It is available for API compatibility." So
    //   `this.ctx.waitUntil` is always TRUTHY and always a no-op — which made every
    //   `if (this.ctx.waitUntil) … else await …` in this file take the branch that does nothing and
    //   left the correct branch as dead code.
    //
    //   MEASURED BEFORE BELIEVING IT. `/api/admin/logs` on production: `request` 2,499 rows,
    //   `audit` 2,501 rows — both recorded in the WORKER. `build` 0, `model_call` 0, `error` 0 —
    //   all three recorded in THIS isolate. A clean split along the boundary, with an un-awaited
    //   flush on one side of it. The product had never recorded a single build.
    //
    //   Awaiting costs nothing: the object stays alive while it has pending I/O, which is exactly
    //   what an await is. ]]
    await flushEvents(this.env);
    // background memory distillation (only after substantive runs)
    //
    // The mode is checked BEFORE the model call, not inside the writer. `applyModelUpdate` would
    // discard the result anyway, but a run with memory switched off must not spend a neuron — or a
    // provider round-trip carrying this conversation — producing a summary nobody will ever store.
    if (agent.trace.length > 2 && reason === 'done' && memoryWritable(this.memoryModeOn(agent))) {
      // Distillation is Golem's own housekeeping: it counts against the GLOBAL neuron budget
      // (so it can never create an uncontrolled bill) but is not charged to the user's Credits.
      const budgetLeft = await this.quotaState(agent.userId);
      if (budgetLeft.creditsRemaining <= 0) return;
      void this.updateMemory(agent).catch(() => {});
    }
  }

  /**
   * The memory mode in force for a run.
   *
   * Pinned at run start; a run persisted by an older deployment has none, so it falls back to the
   * CURRENT resolved preference rather than to a hard-coded default — an old run should not be the
   * one path that ignores a person's setting, and `memoryModeOf` supplies the default anyway.
   */
  private memoryModeOn(agent: AgentState): MemoryMode {
    return agent.memoryMode ?? memoryModeOf(this.pinnedPrefs);
  }

  /**
   * The last personalisation this DO resolved, kept only to answer the line above — and, via
   * `asset_sources`, to hand the agent's tools the policy they must consult.
   *
   * The policy rides on this rather than being read separately because `personalisationForProject`
   * already resolves it: `mergePreferences` narrows `asset_sources` across org, user and project
   * layers along with every other preference, and that result is what gets assigned here. A second
   * reader would be a second implementation of the same precedence, and the two would disagree the
   * first time somebody set the policy at the org layer. This field was simply typed too narrowly
   * to see it.
   */
  private pinnedPrefs: { memory_mode?: MemoryMode; asset_sources?: AssetSourcePolicy } | null = null;

  private async updateMemory(agent?: AgentState) {
    const mode = agent ? this.memoryModeOn(agent) : memoryModeOf(this.pinnedPrefs);
    if (!memoryWritable(mode)) return;
    const memory = normaliseMemory(await this.ctx.storage.get<unknown>('memory'));
    const recent = (
      this.sql.exec(`select role, content from messages order by created_at desc limit 8`).toArray() as { role: string; content: string }[]
    )
      .reverse()
      .map((m) => `${m.role}: ${m.content.slice(0, 600)}`)
      .join('\n');
    const res = await llmChat(
      this.env,
      {
        model: 'memory',
        messages: [
          { role: 'system', content: MEMORY_UPDATE_PROMPT },
          {
            role: 'user',
            content: `Previous summary:\n${memory.summary ?? '(none)'}\n\nExisting facts:\n${memory.facts.join('\n')}\n\nLatest conversation:\n${recent}`,
          },
        ],
        maxTokens: 600,
      },
      { kind: 'memory' },
    );
    try {
      const jsonStart = res.text.indexOf('{');
      const parsed = JSON.parse(res.text.slice(jsonStart)) as { summary?: string; facts?: string[] };
      if (!parsed.summary) return;
      //[[ WHAT THE MODEL PRODUCED IS A PROPOSAL UNTIL THE MODE SAYS OTHERWISE.
      //
      //   Under `auto` this is the behaviour it always had. Under `review` the distilled facts go
      //   into the pending queue and ACTIVE memory is untouched — which is the entire content of
      //   the setting, and the reason the decision is made in one tested function rather than by
      //   two branches written here. Credentials are stripped by the same function, so a key that
      //   was pasted into the conversation cannot become a permanent line in the system prompt.
      const next = applyModelUpdate(memory, parsed, mode);
      await this.ctx.storage.put('memory', next);
      // best-effort sync to Supabase registry with the user's own JWT. The MIRROR carries active
      // memory only: a proposal nobody has accepted is not something the dashboard should report
      // as what Apple knows.
      const jwt = this.liveJwt;
      const bind = await this.bind();
      if (jwt && bind) {
        await fetch(`${this.env.SUPABASE_URL}/rest/v1/projects?id=eq.${bind.projectId}`, {
          method: 'PATCH',
          headers: {
            apikey: this.env.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${jwt}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ memory_summary: next.summary, memory_facts: next.facts, last_activity_at: new Date().toISOString() }),
        }).catch(() => {});
      }
    } catch {
      /* memory update is best-effort */
    }
  }

  // ------------------------------------------------------------------ AgentCtx impl
  /**
   * @param agent when present, asset provenance discovered earlier in the run is carried in and
   *        back out again. Omitted by the admin `/run-tool` route, which is a single tool call
   *        with no run to accumulate against.
   */
  private agentCtx(agent?: AgentState): AgentCtx {
    return {
      discoveredAssetIds: new Set(agent?.discoveredAssetIds ?? []),
      env: this.env,
      projectId: this.boundProjectId ?? undefined,
      // The run's user is the project owner (startRun records `bind.ownerId`); a tool that acts in
      // the user's own account (generate_model_external) needs it. No run, no user.
      userId: agent?.userId,
      assetSources: this.pinnedPrefs?.asset_sources ?? undefined,
      // The queue length is backpressure and stays: a hundred ops deep, the honest answer to
      // "can you build right now" is no. The connection half now comes from the same rule the
      // header and the status broadcast use.
      studioConnected: () => this.opQueue.length < 100 && this.pluginConnectedNow(),
      execStudioOp: (op, timeoutMs) => this.execStudioOp(op, timeoutMs, agent),
      createCheckpoint: (label, kind) => this.createCheckpoint(label, kind, {}, agent),
      restoreCheckpoint: (id: string) => this.restoreCheckpoint(id, agent),
      // Frames go to the browser and nowhere else. They are deliberately not
      // persisted: a run's worth of uncompressed RGB would be tens of megabytes
      // in DO storage to show something the user was already watching. A client
      // that reconnects mid-run gets the trace, the ring buffer, and the pixels
      // still in it — not the whole history.
      emitFrame: (frame) => {
        this.publishFrame(frame, { recompress: false });
      },
      playtest: this.playtestBus(agent),
      addMemoryFact: async (fact) => {
        // The same three-way rule as the distiller, through the same function — `remember` is a
        // write to the same field, and a tool that obeyed a different policy from the background
        // writer would be the hole in the setting. The OUTCOME is returned rather than swallowed:
        // a tool that answers `saved: true` for a write that did not happen teaches the model
        // something false about the world, and it will act on it for the rest of the run.
        const mode = agent ? this.memoryModeOn(agent) : memoryModeOf(this.pinnedPrefs);
        const stored = await this.ctx.storage.get<unknown>('memory');
        const { memory, outcome } = addModelFact(stored, fact, mode);
        if (outcome !== 'refused') await this.ctx.storage.put('memory', memory);
        return outcome;
      },
    };
  }

  /** The last poll, in memory. Written on every one; the stored copy lags by up to 4s by design. */
  private pluginLastSeenMs = 0;
  private liveJwt: string | null = null;

  // ------------------------------------------------------------------ frames
  /**
   * Recent frames, in memory only, bounded on both count and bytes.
   *
   * TENANT SCOPE IS STRUCTURAL, NOT CHECKED. This ring is a field of the
   * SessionDO instance, and a SessionDO instance is addressed by project id
   * (`idFromName(projectId)` in index.ts). There is exactly one of these per
   * project and no code path that hands a frame to a different one, so frames
   * cannot cross a tenant boundary without someone first routing an op to the
   * wrong DO — at which point the frame is the least of it. The /ws handler
   * already refuses any socket whose X-User-Id is not the bound owner, so the
   * set of readers is the set of that project's owner's sockets.
   */
  private frames = new FrameRing();
  /** Rate + budget gate for the playtest currently streaming, if any. */
  private frameRate: FrameRate | null = null;
  private playtestRunBacking: PlaytestRun | null = null;

  private get playtestRun(): PlaytestRun | null {
    return this.playtestRunBacking;
  }

  /** Persisting on assignment rather than at the call sites is the point.
   *
   *  There are six places that advance a playtest, in four branches of one message handler.
   *  A helper every one of them has to remember to call is a helper the seventh will not, and
   *  that is exactly how this state came to be instance-only while everything around it was
   *  persisted. An accessor cannot be forgotten.
   *
   *  Fire-and-forget on the write: losing a card's state is not worth failing a run over, and
   *  the next transition rewrites it. */
  private set playtestRun(next: PlaytestRun | null) {
    this.playtestRunBacking = next;
    void this.ctx.storage.put('playtestRun', next).catch(() => {});
  }
  private playtestSeq = 0;

  /**
   * Admit a frame, then fan it out and remember it.
   *
   * Returns whether it was delivered, so a caller counting drops counts real
   * ones. A refusal is logged to the oplog rather than thrown: a bad frame must
   * degrade the picture, never the build.
   */
  private publishFrame(raw: RawFrame, opts: { recompress: boolean; playtestRunId?: string }): boolean {
    const verdict = admitFrame(raw, { recompress: opts.recompress });
    if (!verdict.ok) {
      this.sql.exec(
        `insert into oplog(op_id, kind, ok, summary, created_at, run_id) values(?,?,?,?,?,?)`,
        'frame',
        'frame_rejected',
        0,
        `${verdict.reason}: ${verdict.detail}`.slice(0, 200),
        Date.now(),
        this.currentMsgId ?? null,
      );
      return false;
    }
    const frame: StudioFrame = {
      ...verdict.frame,
      msgId: this.currentMsgId,
      ...(opts.playtestRunId ? { playtestRunId: opts.playtestRunId, seq: (this.playtestSeq += 1) } : {}),
    };
    this.frames.push(frame);
    this.broadcast({ type: 'studio_frame', frame });
    return true;
  }

  /** Push the playtest record to every attached client. */
  private emitPlaytest(): void {
    this.broadcast({ type: 'playtest_state', run: this.playtestRun });
  }

  /**
   * The channel run_and_check writes its progress to.
   *
   * Everything here is a report of something that already happened. The one
   * method that acts — `captureFrame` — asks Studio for a render through the
   * ordinary op queue and returns whether pixels actually came back, so a
   * plugin that has gone away produces a recorded drop rather than a frame the
   * card would otherwise keep showing as current.
   */
  private playtestBus(agentRun?: AgentState): PlaytestBus {
    return {
      begin: ({ requestedSeconds, action }) => {
        const id = `pt_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
        this.frameRate = new FrameRate();
        this.playtestSeq = 0;
        this.playtestRun = startPlaytest({
          id,
          now: Date.now(),
          requestedSeconds,
          action,
          msgId: this.currentMsgId,
        });
        this.emitPlaytest();
        return id;
      },
      phase: (phase, action, error) => {
        if (!this.playtestRun) return;
        this.playtestRun = advance(this.playtestRun, { phase, action, error, now: Date.now() });
        this.emitPlaytest();
      },
      console: (errors, warnings) => {
        if (!this.playtestRun) return;
        this.playtestRun = advance(this.playtestRun, { consoleErrors: errors, consoleWarnings: warnings });
        this.emitPlaytest();
      },
      canCapture: () => {
        if (!this.frameRate || !this.playtestRun) return false;
        return this.frameRate.remaining > 0;
      },
      captureFrame: async () => {
        const run = this.playtestRun;
        const rate = this.frameRate;
        if (!run || !rate) return false;
        const gate = rate.take(Date.now());
        if (!gate.ok) return false;

        // 'eye' is roughly player eye height looking into the scene: the closest
        // thing the rasteriser has to what someone standing in the game would
        // see. The timeout is short on purpose — a render that takes longer than
        // this has stalled the simulation the user is trying to watch, and the
        // honest response is a dropped frame, not a longer freeze.
        const res = await this.execStudioOp(
          { op: 'render_view', view: 'eye', width: PLAYTEST_FRAME_WIDTH, height: PLAYTEST_FRAME_HEIGHT },
          8000,
          agentRun,
        );
        const data = res.ok ? (res.data as RenderViewResult & { error?: string }) : null;
        const direct = data?.studioViewport;
        const view = data?.views?.[0];
        if (!direct?.rgbBase64 && !view?.rgbBase64) {
          this.playtestRun = advance(run, { droppedFrame: true });
          this.emitPlaytest();
          return false;
        }
        const raw = direct?.rgbBase64
          ? direct
          : {
              rgbBase64: view!.rgbBase64,
              encoding: 'rgb24' as const,
              source: 'software_render' as const,
              width: view!.meta.width,
              height: view!.meta.height,
              view: view!.name,
              subject: data?.subject ?? 'game.Workspace',
              capturedAt: Date.now(),
            };
        const delivered = this.publishFrame(raw, {
          recompress: raw.encoding !== 'png',
          playtestRunId: run.id,
        });
        this.playtestRun = advance(this.playtestRun ?? run, {
          ...(delivered ? { deliveredFrame: true, lastFrameAt: Date.now() } : { droppedFrame: true }),
        });
        this.emitPlaytest();
        return delivered;
      },
    };
  }

  /**
   * Discard queued ops belonging to a run that is no longer the live one.
   *
   * A5: ops queued by a dead run were still delivered and executed. The user presses stop, the
   * run ends, and the plugin's next poll collects whatever was already in the queue and applies
   * it to their place — mutations from a run they explicitly cancelled, arriving after the UI
   * said it had stopped.
   *
   * Anything dropped resolves its waiter rather than being deleted quietly, so an
   * `execStudioOp` still holding on does not sit out its full 30-second timeout to learn the
   * same thing.
   *
   * An op with no `runId` is KEPT: it was queued by a deploy that predates the field, and
   * discarding work because it is unlabelled would be a worse bug than the one this fixes.
   */
  private async dropOpsForEndedRuns(liveRunId: string | undefined): Promise<number> {
    const { keep, drop: dropped } = partitionOpsByRun(this.opQueue, liveRunId);
    if (dropped.length === 0) return 0;

    this.opQueue = keep;
    await this.ctx.storage.put('opQueue', this.opQueue);
    for (const op of dropped) {
      const waiter = this.opWaiters.get(op.id);
      if (waiter) {
        this.opWaiters.delete(op.id);
        // `transport`: this op was removed from the queue before any plugin collected it, so it
        // provably never reached Studio and nothing was applied.
        waiter({ id: op.id, ok: false, error: 'The run this change belonged to has ended', failure: WORKER_FAILURES.runEnded });
      }
    }
    return dropped.length;
  }

  /** Drop only one still-live run's queued work when its membership changes mid-step. */
  private async dropOpsForRun(runId: string): Promise<number> {
    const dropped = this.opQueue.filter((op) => op.runId === runId);
    if (dropped.length === 0) return 0;
    this.opQueue = this.opQueue.filter((op) => op.runId !== runId);
    await this.ctx.storage.put('opQueue', this.opQueue);
    for (const op of dropped) {
      const waiter = this.opWaiters.get(op.id);
      if (!waiter) continue;
      this.opWaiters.delete(op.id);
      waiter({ id: op.id, ok: false, error: 'This build no longer has access to the project', failure: WORKER_FAILURES.runEnded });
    }
    return dropped.length;
  }

  private async execStudioOp(studioOp: StudioOp, timeoutMs = 30_000, run?: AgentState): Promise<OpResult> {
    if (!(await this.pluginConnected())) {
      return { id: 'none', ok: false, error: 'Studio is not connected', failure: WORKER_FAILURES.notConnected };
    }
    //[[ An op must not be queued for a Studio that has the wrong place open.
    //
    //   Without this the op sits in the queue until its 30s waiter expires, because the poll is
    //   refusing to collect anything — a two-line refusal turned into half a minute of nothing,
    //   and a `timeout`, which is the one failure kind that is NOT safe to retry. Refusing here
    //   makes it a `transport` failure instead: it provably never ran, so the agent may try again
    //   the moment the user switches back. ]]
    if (this.placeMismatch) {
      return { id: 'none', ok: false, error: this.placeMismatch.message, failure: WORKER_FAILURES.placeMismatch };
    }
    // A membership event may arrive while the model is between tool calls. Check immediately
    // before queueing so a revoked run cannot hand a fresh mutation to the next plugin poll.
    if (run) {
      const verdict = await this.runAccessVerdict(run);
      if (verdict.stop) {
        await this.dropOpsForRun(run.msgId);
        void this.ctx.storage.setAlarm(Date.now() + 1);
        return { id: 'none', ok: false, error: verdict.message, failure: WORKER_FAILURES.runEnded };
      }
    }
    this.seq += 1;
    // Tagged with the run that asked for it. A queued op outlives the request that made it —
    // it sits here until the plugin's next poll, which can be seconds away — and a run can end
    // in that gap, by the user pressing stop or by the step limit. See dropOpsForEndedRuns.
    const op: PendingOp = {
      id: `op_${this.seq}_${Date.now().toString(36)}`,
      seq: this.seq,
      studioOp,
      runId: this.currentMsgId,
    };
    this.opQueue.push(op);
    // Queueing an op is activity: it un-parks the poll so the next one holds again rather than
    // sleeping through the work that is about to arrive.
    this.lastActivity = Date.now();
    await this.ctx.storage.put({ opQueue: this.opQueue, seq: this.seq });
    this.pollWaiter?.();

    const result = await new Promise<OpResult>((resolve) => {
      const timer = setTimeout(() => {
        this.opWaiters.delete(op.id);
        // `timeout` and not `transport`: this op may have been delivered, applied, and its report
        // lost. op-failure.ts is what turns that distinction into a retry decision.
        resolve({
          id: op.id,
          ok: false,
          error: `Studio did not respond within ${Math.round(timeoutMs / 1000)}s`,
          failure: WORKER_FAILURES.timeout,
        });
      }, timeoutMs);
      this.opWaiters.set(op.id, (r) => {
        clearTimeout(timer);
        resolve(r);
      });
    });
    // The FIRST refusal of the run wins: it is the one the user asked for, and a later refusal of a
    // recovery attempt describes the model's improvisation rather than their request.
    if (run && run.refusalRemedy === undefined && !result.ok && result.failure === 'refused' && isRefusalRemedyCode(result.remedy)) {
      run.refusalRemedy = result.remedy;
    }
    this.sql.exec(
      `insert into oplog(op_id, kind, ok, summary, created_at, failure, run_id) values(?,?,?,?,?,?,?)`,
      op.id,
      studioOp.op,
      result.ok ? 1 : 0,
      result.error?.slice(0, 200) ?? '',
      Date.now(),
      result.ok ? null : (asFailureKind(result.failure) ?? null),
      // The op's OWN attribution, not `this.currentMsgId` read a second time: the run can have
      // ended while this op sat in the queue, and the row must name the run that asked for it.
      op.runId ?? null,
    );
    return result;
  }

  /** What the plugin last reported as selected in Studio. Mirrored in storage. */
  private pluginSelection: StudioEventSelection | null = null;
  /**
   * The place this project is bound to, mirrored from storage.
   *
   * Cached because it is consulted on EVERY poll and a storage read per poll, forever, for a value
   * that changes at most once per pairing is the kind of cost this file has already had to undo
   * twice (see `pluginLastSeen` and `recordPluginClient`). Loaded in the constructor alongside the
   * op queue so a revived instance judges against the real binding rather than rebinding to
   * whatever place happens to be open at that moment — which would defeat the guard entirely.
   */
  private boundPlace: StudioPlace | null = null;
  /** Set while the paired Studio has a different place open. Instance-only: it is re-derived from
   *  the next poll, and a stale copy in storage would outlive the condition. */
  private placeMismatch: Extract<PlaceAdmission, { verdict: 'mismatch' }> | null = null;
  private lastSeenWrittenAt = 0;
  /** When the plugin's next poll is due (last answer + the sleep we issued + grace). */
  private pollDueBy = 0;
  /** Last run step or queued op, for the idle/parked decision. */
  private lastActivity = 0;
  private lastClientWrittenAt = 0;

  /** Capability narrowing is always the last narrowing layer: mode, user preference, then plugin. */
  private pluginToolFilter(candidates: ReadonlySet<string>): PluginToolFilter {
    return filterToolsForPlugin(candidates, STUDIO_TOOL_REQUIREMENTS, this.pluginCapabilityReport);
  }

  /**
   * Persist only a canonical report for the pairing that authenticated this poll.
   *
   * The storage key includes the token hash. A superseded poll can finish late and write only its
   * own dead key; it can never replace the report a newer pairing reads. The in-memory report has
   * the same fence and therefore cannot be poisoned by that late poll either.
   */
  private async recordPluginCapabilities(
    raw: unknown,
    pairingHash: string,
    reported: PluginCapabilityClientIdentity,
  ): Promise<void> {
    if (this.activePluginTokenHash !== pairingHash) return;
    const report = normalisePluginCapabilities(raw);
    if (report === null) {
      this.pluginCapabilityReport = null;
      this.pluginCapabilityClient = null;
      await this.ctx.storage.delete([pluginCapabilitiesKey(pairingHash), pluginCapabilitiesClientKey(pairingHash)]);
      return;
    }
    await this.ctx.storage.put({
      [pluginCapabilitiesKey(pairingHash)]: report,
      [pluginCapabilitiesClientKey(pairingHash)]: reported,
    });
    if (this.activePluginTokenHash === pairingHash) {
      this.pluginCapabilityReport = report;
      this.pluginCapabilityClient = reported;
    }
  }

  /**
   * Remember which plugin build is on the other end.
   *
   * Written on pairing, and thereafter only when the reported identity actually
   * CHANGES or the record is stale by a minute. The plugin polls every few
   * seconds and its version cannot change mid-session without a Studio restart,
   * so persisting it every poll would be pure write amplification for a value
   * that is constant — the same reasoning that already governs `pluginLastSeen`.
   */
  private async recordPluginClient(version: string | null, protocol: number | null): Promise<void> {
    const now = Date.now();
    const prev = await this.ctx.storage.get<PluginClientInfo>('pluginClient');
    const changed = !prev || prev.version !== version || prev.protocol !== protocol;
    if (!changed && now - this.lastClientWrittenAt < 60_000) return;
    this.lastClientWrittenAt = now;
    await this.ctx.storage.put<PluginClientInfo>('pluginClient', {
      version,
      protocol,
      firstSeenAt: changed ? now : (prev?.firstSeenAt ?? now),
      lastSeenAt: now,
    });
  }

  /**
   * WRITE THE PLACE ONTO THE PROJECT ROW, because that is where the shelf reads it.
   *
   * The owner's definition of done says a project is "name, description, when updated, WHICH
   * PLACE". Three of those four were on every card. The fourth was a column — `projects.place_name`
   * — that this worker knew the value of on every single poll and never once wrote: the place lived
   * in Durable Object storage, where only the workspace's own socket could see it. So every card on
   * the shelf read "No place name yet", including cards for projects that were paired to a named
   * place at that moment, and the app's own pairing dialog carried a comment saying as much.
   *
   * IT IS WRITTEN HERE AND NOT ON EVERY POLL. `bind` and a `match` that CHANGED are the only two
   * moments the answer is new — a pairing, or a place renamed or re-saved — which is a handful of
   * writes per project per lifetime rather than one every two seconds.
   *
   * BEST EFFORT, AND HONESTLY SO. The only credential this object holds is a member's own JWT,
   * kept in memory from their socket, exactly as the memory mirror above uses it; there is no
   * service key here and adding one to reach a user's row is not a trade this file should make.
   * So the write lands when the owner has the workspace open, which is precisely when pairing
   * happens, and a failure changes nothing that was already true. What it must never do is throw:
   * a Studio poll that 500s because a registry PATCH was refused would turn a cosmetic gap into a
   * broken link.
   *
   * An UNVERIFIED place never reaches here — `placeAdmission` returns `unverified` for a place
   * Roblox cannot identify and this branch is not taken — but `placeId 0` and an empty name are
   * still normalised to null rather than written as "0" and "", which would read on the card as a
   * place called nothing.
   */
  /**
   * What was last successfully mirrored, so a poll every two seconds is not a PATCH every two
   * seconds. `undefined` means "not read from storage yet" and is distinct from `null`, which means
   * "read, and nothing has ever been mirrored".
   */
  private placeMirrored: string | null | undefined = undefined;
  /** When the last attempt was made, so a refused write retries slowly rather than per poll. */
  private placeMirrorTriedAt = 0;
  /** What that attempt was FOR. A new fact is never made to wait behind an old failure. */
  private placeMirrorTriedKey: string | null = null;

  private async mirrorPlaceToRegistry(place: StudioPlace | null): Promise<void> {
    if (!place) return;
    const jwt = this.liveJwt;
    if (!jwt) return;
    const name = place.placeName.trim();
    const key = `${place.placeId}:${name}`;
    if (this.placeMirrored === undefined) {
      this.placeMirrored = (await this.ctx.storage.get<string>('placeMirrored')) ?? null;
    }
    if (this.placeMirrored === key) return;
    // A member whose JWT cannot write this row — a viewer — would otherwise attempt one PATCH per
    // poll forever. The owner's next tab fixes it; a minute of waiting costs nothing.
    const now = Date.now();
    if (this.placeMirrorTriedKey === key && now - this.placeMirrorTriedAt < 60_000) return;
    this.placeMirrorTriedKey = key;
    this.placeMirrorTriedAt = now;
    const bind = await this.bind();
    if (!bind) return;
    try {
      const res = await fetch(`${this.env.SUPABASE_URL}/rest/v1/projects?id=eq.${bind.projectId}`, {
        method: 'PATCH',
        headers: {
          apikey: this.env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          place_name: name.length > 0 ? name : null,
          place_id: place.placeId > 0 ? place.placeId : null,
        }),
      });
      // Marked only on success. RLS answers a viewer's PATCH with a refusal, and recording that as
      // "mirrored" would mean the owner's own tab never retried — the card would stay empty for the
      // life of the pairing because somebody else looked at the project first.
      if (res.ok) {
        this.placeMirrored = key;
        await this.ctx.storage.put('placeMirrored', key);
      }
    } catch {
      /* the pairing is what matters; the shelf's copy of its name is not worth failing a poll for */
    }
  }

  private async handlePluginPoll(
    body: PluginPollRequest,
    reported: { version: string | null; protocol: number | null } = { version: null, protocol: null },
    pairingHash: string | null = null,
  ): Promise<Response> {
    // Capability silence only preserves a report while the same reported plugin build keeps
    // polling. A version/protocol change means a different executable is on the other end; carrying
    // the previous build's refusals forward would turn an advisory negotiation into a stale feature
    // gate. Unknown then means compatibility until the new build supplies its own report.
    if (
      pairingHash !== null &&
      this.activePluginTokenHash === pairingHash &&
      this.pluginCapabilityClient !== null &&
      !samePluginCapabilityClient(this.pluginCapabilityClient, reported)
    ) {
      this.pluginCapabilityReport = null;
      this.pluginCapabilityClient = null;
      await this.ctx.storage.delete([pluginCapabilitiesKey(pairingHash), pluginCapabilitiesClientKey(pairingHash)]);
    }
    // Omission from the SAME build means "already acknowledged" for the Bridge. A PRESENT malformed
    // report is explicitly unknown and falls back to legacy compatibility exactly like the parser.
    if (body.capabilities !== undefined && pairingHash !== null) {
      await this.recordPluginCapabilities(body.capabilities, pairingHash, reported);
    }
    const wasConnected = await this.pluginConnected();
    // the plugin polls every ~0.4-2.5s; persisting the heartbeat every time is pure write
    // amplification. Keep it in memory and only checkpoint it to storage every few seconds.
    const now = Date.now();
    this.pluginLastSeenMs = now;
    // A poll IS the plugin being here. Whatever the browser was last told, from this instant the
    // truth is "connected" — so the flag that decides whether a later silence is worth announcing
    // is armed here rather than only on the `!wasConnected` transition below, which a warm object
    // that has been polling since before this deploy would never take.
    this.studioAnnouncedConnected = true;
    // The link is up again as of this instant, so a disconnect said earlier is spent: the NEXT
    // silence is a new fact and has to be announceable.
    this.studioSilenceAnnounced = false;
    if (now - this.lastSeenWrittenAt > 4000) {
      this.lastSeenWrittenAt = now;
      await this.ctx.storage.put('pluginLastSeen', now);
    }

    await this.recordPluginClient(reported.version, reported.protocol);
    const notice = clientNotice(reported);

    // A client we cannot serve is told so and handed nothing. Draining the queue into
    // it would burn the user's queued ops against a plugin that cannot execute them,
    // turning a fixable "please update" into a run of mysterious failures. It keeps
    // polling — the queue is left intact for whenever the user does update — and it is
    // answered promptly rather than being held open for the usual long-poll window,
    // because there is nothing to wait for.
    if (notice && !notice.compatible) {
      const blocked: PollResponse = { ops: [], waitMs: 5000, client: notice };
      return json(blocked);
    }

    if (body.state) {
      await this.ctx.storage.put('pluginState', body.state);
    }

    //[[ IS THIS THE PLACE THIS PROJECT IS PAIRED TO?
    //
    //   The plugin's session is a plugin-wide Studio setting, so opening a different place in the
    //   same Studio kept the session and executed this project's ops there. `placeId` and `gameId`
    //   had been arriving on every state event since the plugin was written and were compared to
    //   nothing.
    //
    //   studio-place.ts owns the decision, including the half that matters most: an UNIDENTIFIABLE
    //   place — a place never saved to Roblox, or one Studio is still loading, both of which report
    //   placeId 0 — is `unverified`, is SERVED, and never counts as a mismatch. Refusing on an
    //   absence would break a legitimate user intermittently. ]]
    const report = readPlaceReport(body.state);
    const admission = placeAdmission(this.boundPlace, report, Date.now());
    if (admission.verdict === 'bind' || (admission.verdict === 'match' && admission.changed)) {
      this.boundPlace = admission.place;
      await this.ctx.storage.put<StudioPlace>('pluginPlace', admission.place);
    }
    // NOT inside the branch above. That branch fires only when the binding is NEW, which would have
    // left every project paired before this shipped reading "No place name yet" until its owner
    // happened to rename the place. The mirror decides for itself whether there is anything to say.
    //[[ F-008: an UNSAVED place (placeId 0) is never bound, so with nothing bound the open place's
    //   own name is the best name the project has — mirrored for the card, never bound, and its id
    //   written as null. A bound place always wins. ]]
    const unsavedOpen = report && report.placeName.trim()
      ? { placeId: report.placeId, gameId: report.gameId, placeName: report.placeName, boundAt: 0 }
      : null;
    await this.mirrorPlaceToRegistry(this.boundPlace ?? unsavedOpen);
    this.placeMismatch = admission.verdict === 'mismatch' ? admission : null;
    if (!servesOps(admission) && admission.verdict === 'mismatch') {
      // The link is alive and the plugin is welcome to keep polling — the user may simply switch
      // back — but it is handed NO ops, and every browser watching is told why rather than being
      // shown a healthy green pill above a build that never starts.
      this.broadcast({
        type: 'studio_status',
        connected: true,
        lastSeenAt: now,
        queuedOps: this.opQueue.length,
        place: admission.expected,
        placeMismatch: {
          expectedPlaceName: admission.expected.placeName,
          openPlaceName: admission.open.placeName,
          openPlaceId: admission.open.placeId,
        },
      });
      const refused: PollResponse = {
        ops: [],
        waitMs: 3000,
        placeMismatch: {
          expected: admission.expected,
          openPlaceId: admission.open.placeId,
          openPlaceName: admission.open.placeName,
          message: admission.message,
        },
        // Carried on `client` as well so a plugin build that predates `placeMismatch` still shows
        // the sentence: `applyClientNotice` already renders any message it is handed.
        client: { compatible: true, message: admission.message },
      };
      return json(refused);
    }

    if (!wasConnected) {
      // A link that has just come up is a green pill that now needs a deadline on it.
      await this.armStudioWatchdog();
      const st = body.state ?? (await this.ctx.storage.get<StudioEventState>('pluginState'));
      this.broadcast({
        type: 'studio_status',
        connected: true,
        state: st ?? undefined,
        lastSeenAt: now,
        queuedOps: this.opQueue.length,
        place: this.boundPlace,
        placeMismatch: null,
      });
    }
    for (const r of body.results ?? []) {
      const waiter = this.opWaiters.get(r.id);
      if (waiter) {
        this.opWaiters.delete(r.id);
        waiter(r);
      }
    }
    const logs = (body.events ?? []).filter((e) => e.kind === 'log');
    if (logs.length) this.broadcast({ type: 'studio_log', entries: logs.slice(-40) as never });

    //[[ WHAT IS SELECTED IN STUDIO, KEPT AND FORWARDED.
    //
    //   The plugin pushes this when the user clicks, rather than the browser polling for
    //   it: a poll would cost a round trip per tick forever and still be a tick stale,
    //   which is exactly long enough for "select the door, then press the button" to act
    //   on the wrong thing.
    //
    //   Persisted on every change rather than on a timer. It is one storage write per
    //   poll at the very worst — the plugin holds only the LATEST selection between polls
    //   and drops a repeat of what it last sent — and the alternative is a browser that
    //   connects after a Durable Object eviction being shown a selection the user left
    //   minutes ago, with nothing to correct it until they happen to click again.
    //
    //   `latestSelection` re-derives every field; see companion.ts for why none of them
    //   is taken on the sender's word. ]]
    const selection = latestSelection(body.events);
    if (selection && !sameSelection(selection, this.pluginSelection)) {
      this.pluginSelection = selection;
      await this.ctx.storage.put('pluginSelection', selection);
      this.broadcast({ type: 'studio_selection', selection });
    }

    // long-poll: if agent is running and no ops queued, wait briefly for new ops
    let agent = await this.ctx.storage.get<AgentState>('agent');
    let accessStopped = false;
    if (agent?.status === 'running') {
      const verdict = await this.runAccessVerdict(agent);
      if (verdict.stop) {
        accessStopped = true;
        await this.dropOpsForRun(agent.msgId);
        void this.ctx.storage.setAlarm(Date.now() + 1);
      }
    }
    // Long-poll whenever there is nothing to hand over, not only mid-run.
    //
    // This replaces a 2,500 ms idle re-poll, and then replaces the 20,000 ms backoff that was tried
    // instead of it. That backoff was justified by an ESTIMATE of Durable Object residency cost and
    // was refuted by MEASUREMENT: with no browser attached, ops took 6.5-10.4 s to be picked up
    // where they had taken under 2.5 s. Agent work is exactly the case with no browser attached.
    //
    // Holding the request open instead gives both halves: `pollWaiter` fires the moment an op is
    // queued, so latency is near zero, and an idle plugin makes one request per ~13 s rather than
    // one per 2.5 s. It forfeits most of the residency saving, because an open request keeps the DO
    // alive — but that saving was never measured and this latency was.
    // 6s, not 12s: `pluginConnected()` treats the plugin as gone after 8s without a poll, and a
    // 12s hold made every op fail with "Studio is not connected" between polls. The hold must stay
    // comfortably inside that window — changing both at once would trade one silent failure for
    // another.
    const running = agent?.status === 'running' && !accessStopped;
    const idleFor = Date.now() - (await this.lastActivityAt());
    const parked = !running && idleFor > POLL_IDLE_AFTER_MS;
    const holdMs = running ? POLL_HOLD_ACTIVE_MS : POLL_HOLD_WARM_MS;

    // Parked: return at once and let the plugin sleep. The cost of not holding is that an op
    // queued during that sleep waits for the next poll — bounded by POLL_WAIT_IDLE_MS, and only
    // ever paid on the first op after several minutes of silence.
    if (!accessStopped && !parked && !this.opQueue.length) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, holdMs);
        this.pollWaiter = () => {
          clearTimeout(t);
          this.pollWaiter = null;
          resolve();
        };
      });
    }

    // A revocation can wake the long poll after the first read above. Re-read both the run and
    // the fence before handing over anything; an event that landed during the hold wins.
    agent = await this.ctx.storage.get<AgentState>('agent');
    accessStopped = false;
    if (agent?.status === 'running') {
      const verdict = await this.runAccessVerdict(agent);
      if (verdict.stop) {
        accessStopped = true;
        await this.dropOpsForRun(agent.msgId);
        void this.ctx.storage.setAlarm(Date.now() + 1);
      }
    }
    const deliveryRunning = agent?.status === 'running' && !accessStopped;

    // Backstop for the purge in finishRun. The queue is persisted, so a Durable Object that
    // restarts between a run ending and the next poll would otherwise hand the plugin ops from
    // a run nobody is waiting on.
    await this.dropOpsForEndedRuns(deliveryRunning && agent ? agent.msgId : undefined);

    // One final check closes the await above as a delivery race: once this returns, splicing is
    // synchronous, so a mark cannot insert another op between the verdict and the response.
    if (deliveryRunning && agent) {
      const verdict = await this.runAccessVerdict(agent);
      if (verdict.stop) {
        accessStopped = true;
        await this.dropOpsForRun(agent.msgId);
      }
    }

    //[[ DELIVERY IS AT-MOST-ONCE, AND THAT IS THE DECISION RATHER THAN AN OVERSIGHT.
    //
    //   A6 asked for an ack and redelivery. Splicing hands these ops to the plugin and forgets
    //   them, so a plugin that dies between receiving a batch and running it loses that batch.
    //
    //   Redelivery would trade that for duplicate mutation, and the two are not equal. The
    //   plugin acknowledges by reporting RESULTS on its next poll — after execution — so a
    //   batch that goes unacknowledged is not evidence it did not run. Studio may have applied
    //   every op and died before reporting. Re-sending would then create the parts a second
    //   time, or run the same `edit_script` again over a file it already wrote. This codebase
    //   treats duplicate mutation as the worst outcome available (see the alarm-retry chain in
    //   transcript.ts and persist.ts), and an at-least-once op channel would install exactly
    //   that, by design, on the path that touches the user's place directly.
    //
    //   The loss is not silent: `execStudioOp` holds a waiter that resolves with "Studio did
    //   not respond within 30s", so the run is told and can decide what to do. A lost op
    //   surfaces as a failed tool call, which the agent already knows how to handle.
    //
    //   What WOULD make redelivery safe is idempotency — a plugin that recognises an op id it
    //   has already applied and replies with the earlier result instead of re-running it. That
    //   is a plugin protocol change, not a worker one, and it is the shape any future attempt
    //   at this should take. Until then, losing work is the cheaper mistake. ]]
    const ops = accessStopped ? [] : this.opQueue.splice(0, 10);
    if (ops.length) await this.ctx.storage.put('opQueue', this.opQueue);
    const waitMs = deliveryRunning ? 400 : parked ? POLL_WAIT_IDLE_MS : 1000;
    // Record when the next poll is due, so `pluginConnected()` judges against what we actually
    // asked for instead of a constant that can drift away from it.
    this.pollDueBy = Date.now() + waitMs + POLL_STALE_GRACE_MS;
    const res: PollResponse = { ops, waitMs };
    // Omitted entirely when there is nothing to say, which is the common case. An
    // older plugin that does not read this field is unaffected either way.
    if (notice) res.client = notice;
    return json(res);
  }

  // ------------------------------------------------------------------ search
  /**
   * Every record in this project a search could return, narrowed as far as SQL safely can.
   *
   * THE TYPE FILTER IS NOT APPLIED HERE, and that is deliberate. The panel shows a count beside
   * every type — "Messages 12 · Checkpoints 2" — and those counts have to be computed with the
   * other filters applied but not the type one, or choosing a type collapses every other count to
   * zero and choosing it back becomes a guess. `runSearch` is where the type filter lands.
   *
   * THE PREFILTER IS AN OPTIMISATION, NEVER THE DEFINITION. `narrowing` omits it entirely for a
   * query SQLite's ASCII-only case folding would mishandle — `Дверь` — and the scan cap does the
   * bounding instead. A prefilter that drops rows the matcher would have accepted is a search that
   * silently misses, which is the one failure a user cannot detect from the result list.
   *
   * The cap that remains is REPORTED rather than quiet: `truncated` is the difference between
   * "nothing else matches" and "nothing else was looked at".
   */
  /**
   * @param viewer who is READING, so a record can be called theirs — or, absent, cannot be called
   * anyone's. index.ts sets it from the authenticated caller and overwrites whatever arrived on
   * the query string.
   */
  private async searchRecords(filter: SearchFilter, viewer: string | null): Promise<{ records: SearchRecord[]; scanned: number; truncated: boolean }> {
    const SCAN_MESSAGES = 2000;
    const SCAN_ROWS = 1000;
    const records: SearchRecord[] = [];
    let scanned = 0;
    let truncated = false;

    // ----- what was said
    {
      const n = narrowing(filter, { columns: ['content'] });
      const rows = this.sql
        .exec(
          `select id, role, content, created_at from messages ${n.where} order by created_at desc limit ?`,
          ...n.args,
          SCAN_MESSAGES + 1,
        )
        .toArray() as { id: string; role: string; content: string; created_at: number }[];
      if (rows.length > SCAN_MESSAGES) truncated = true;
      for (const r of rows.slice(0, SCAN_MESSAGES)) {
        scanned += 1;
        records.push({
          id: r.id,
          type: 'message',
          author: authorForRole(r.role),
          title: null,
          body: r.content,
          createdAt: r.created_at,
          messageId: r.id,
        });
      }
    }

    // ----- what the agent produced: one record per tool step, which is what the work surface
    //       builds its artifact panels from. The message's own text need not mention the tool at
    //       all, so this is its own query rather than a pass over the rows above.
    {
      const n = narrowing(filter, { columns: ['tool_trace'], require: ['tool_trace is not null'] });
      const rows = this.sql
        .exec(
          `select id, tool_trace, created_at from messages ${n.where} order by created_at desc limit ?`,
          ...n.args,
          SCAN_MESSAGES + 1,
        )
        .toArray() as { id: string; tool_trace: string | null; created_at: number }[];
      if (rows.length > SCAN_MESSAGES) truncated = true;
      for (const r of rows.slice(0, SCAN_MESSAGES)) {
        let trace: ToolTraceEntry[] = [];
        try {
          const parsed = JSON.parse(r.tool_trace ?? '[]');
          if (Array.isArray(parsed)) trace = parsed as ToolTraceEntry[];
        } catch {
          // A trace written in an older shape is skipped rather than taking the whole search down
          // with it; the message itself is still searchable through the query above.
          continue;
        }
        trace.forEach((entry, i) => {
          if (!entry || typeof entry.tool !== 'string') return;
          scanned += 1;
          records.push({
            id: `${r.id}:${i}`,
            type: 'artifact',
            author: 'apple',
            title: entry.tool,
            body: typeof entry.summary === 'string' ? entry.summary : '',
            createdAt: r.created_at,
            messageId: r.id,
          });
        });
      }
    }

    // ----- what can be rolled back to. A manual checkpoint is attributed to the person who asked
    //       for it and an automatic one to Apple, so the author filter means what it says on both.
    {
      const n = narrowing(filter, { columns: ['label', 'kind'] });
      const rows = this.sql
        .exec(
          `select id, label, kind, created_at, author_id from checkpoints ${n.where} order by created_at desc limit ?`,
          ...n.args,
          SCAN_ROWS,
        )
        .toArray() as { id: string; label: string; kind: string; created_at: number; author_id: string | null }[];
      for (const r of rows) {
        scanned += 1;
        records.push({
          id: r.id,
          type: 'checkpoint',
          //[[ WHO, READ FROM THE ROW. This was `r.kind === 'manual' ? 'you' : 'apple'` — a guess
          //   from the kind, which on a shared project told every member that a teammate's
          //   checkpoint was theirs. The row now records its author, so the only remaining
          //   judgement is whether that author is the person reading.
          //
          //   An unrecorded author (a row from before the column) is NOT 'you'. Defaulting an
          //   unknown to the reader is the original defect wearing a different hat. ]]
          author: checkpointAuthor(r.kind, r.author_id, viewer),
          title: r.label,
          body: r.kind,
          createdAt: r.created_at,
        });
      }
    }

    // ----- what was done to the place. The project's own operation history, which until now was
    //       readable only as the last 25 rows on the status payload.
    {
      const n = narrowing(filter, { columns: ['summary', 'kind'] });
      const rows = this.sql
        .exec(
          `select id, kind, ok, summary, created_at, run_id from oplog ${n.where} order by created_at desc limit ?`,
          ...n.args,
          SCAN_ROWS + 1,
        )
        .toArray() as { id: number; kind: string | null; ok: number | null; summary: string | null; created_at: number; run_id: string | null }[];
      if (rows.length > SCAN_ROWS) truncated = true;
      for (const r of rows.slice(0, SCAN_ROWS)) {
        scanned += 1;
        records.push({
          id: `op:${r.id}`,
          type: 'activity',
          author: 'apple',
          title: r.kind ?? null,
          body: r.summary ?? '',
          createdAt: r.created_at,
          // The anchor back into the conversation. OMITTED, not nulled, for an op taken outside a
          // run: `messageId` present is what tells the workspace it has somewhere to go, and a
          // record that claims an anchor it does not have scrolls the user to nothing.
          ...(r.run_id ? { messageId: r.run_id } : {}),
        });
      }
    }

    // ----- what Apple remembers. Held in storage rather than SQL, and carrying one honest
    //       timestamp: the human correction if there was one, otherwise the newest message, since
    //       the model writes memory at the tail of a run. Never `Date.now()`, which would claim an
    //       edit that never happened and would drift into every "since yesterday" window.
    {
      const stored = normaliseMemory((await this.ctx.storage.get<unknown>('memory')) ?? null);
      const editedAt = await this.ctx.storage.get<string>('memoryEditedAt');
      const edited = editedAt ? Date.parse(editedAt) : NaN;
      const newest = (
        this.sql.exec(`select max(created_at) as t from messages`).toArray() as { t: number | null }[]
      )[0]?.t;
      const at = Number.isFinite(edited) ? edited : newest ?? 0;
      if (stored.summary) {
        scanned += 1;
        records.push({ id: 'memory:summary', type: 'memory', author: 'apple', title: null, body: stored.summary, createdAt: at });
      }
      stored.facts.forEach((fact, i) => {
        scanned += 1;
        records.push({ id: `memory:fact:${i}`, type: 'memory', author: 'apple', title: null, body: fact, createdAt: at });
      });
    }

    return { records, scanned, truncated };
  }

  // ------------------------------------------------------------------ checkpoints
  /**
   * @param meta.authorId the person who asked for it, or undefined when Apple took it itself. The
   * CALLER resolves this — the socket's own attachment or the worker's authenticated user — never
   * a value off the wire, or any member could sign a checkpoint with someone else's name.
   * @param meta.description what the snapshot contains or why it was taken, in the user's words
   * for a manual one and from the request for an automatic one. Blank becomes null: "" and "nobody
   * wrote one" would render identically and mean different things.
   */
  async createCheckpoint(
    label: string,
    kind: CheckpointMeta['kind'],
    meta2: { authorId?: string | null; description?: string | null } = {},
    run?: AgentState,
  ): Promise<CheckpointMeta | { error: string }> {
    const authorId = meta2.authorId ?? null;
    const description = (meta2.description ?? '').trim().slice(0, MAX_CHECKPOINT_DESCRIPTION) || null;
    if (!(await this.pluginConnected())) return { error: 'Studio is not connected — connect Studio to create checkpoints.' };
    const id = crypto.randomUUID();
    const snap = await this.execStudioOp({ op: 'snapshot', root: 'game', includeScripts: true, checkpointId: id }, 60_000, run);
    if (!snap.ok) return { error: snap.error ?? 'snapshot failed' };
    const evidence = checkpointEvidence(snap.data, id);
    if (!evidence.ok) return { error: evidence.error };
    const payload = JSON.stringify(snap.data);
    if (payload.length > MAX_SNAPSHOT_BYTES) {
      return { error: `This project is too large to checkpoint (${Math.round(payload.length / 1e6)} MB). Apple still edits it normally — use Studio's own undo for large rollbacks.` };
    }
    const gz = await gzip(payload);
    const meta = (snap.data ?? {}) as { scriptCount?: number; instanceCount?: number };
    const CHUNK = 900_000;
    for (let i = 0; i * CHUNK < gz.byteLength; i++) {
      this.sql.exec(
        `insert into checkpoint_chunks(checkpoint_id, idx, data) values(?,?,?)`,
        id,
        i,
        gz.slice(i * CHUNK, (i + 1) * CHUNK),
      );
    }
    this.sql.exec(
      `insert into checkpoints(id, label, kind, script_count, instance_count, size_bytes, created_at, author_id, description, coverage, preserved_objects) values(?,?,?,?,?,?,?,?,?,?,?)`,
      id,
      label,
      kind,
      meta.scriptCount ?? 0,
      meta.instanceCount ?? 0,
      gz.byteLength,
      Date.now(),
      authorId,
      description,
      evidence.coverage ?? null,
      evidence.preservedObjects ?? null,
    );
    // RETENTION, ENFORCED IN THE SAME WRITE that adds the new one — so the cap is a fact about the
    // table rather than a job that might not have run. By age alone: `kind` is not in either clause,
    // and apps/site/tests/workspace-limits.test.mjs fails the docs page if it claims otherwise.
    this.sql.exec(
      `delete from checkpoint_chunks where checkpoint_id in (select id from checkpoints order by created_at desc limit -1 offset ?)`,
      RETENTION.checkpointsKept,
    );
    this.sql.exec(
      `delete from checkpoints where id in (select id from checkpoints order by created_at desc limit -1 offset ?)`,
      RETENTION.checkpointsKept,
    );
    const cp: CheckpointMeta = {
      id,
      label,
      kind,
      createdAt: Date.now(),
      scriptCount: meta.scriptCount ?? 0,
      instanceCount: meta.instanceCount ?? 0,
      sizeBytes: gz.byteLength,
      ...(evidence.coverage ? { coverage: evidence.coverage, preservedObjects: evidence.preservedObjects } : {}),
      authorId,
      description,
    };
    this.broadcast({ type: 'checkpoint', checkpoint: cp });
    return cp;
  }

  async restoreCheckpoint(id: string, run?: AgentState): Promise<{
    ok: boolean;
    error?: string;
    /** What the plugin reports it actually put back. Absent when the op never reached Studio. */
    fidelity?: RestoreFidelity;
    /** A caveat worth showing the user even though the restore succeeded. */
    note?: string;
  }> {
    //[[ THE PERSON WHO PRESSED RESTORE IS WATCHING A BLANK DRAWER.
    //
    //   Everything below used to happen in silence: one op with a 120s ceiling, nothing broadcast
    //   while it ran, and — on the ws path — a broadcast only when it FAILED. So the interface had
    //   nothing to say for up to two minutes about the operation that was at that moment clearing
    //   and rebuilding the user's place, and on success it had nothing to say at all.
    //
    //   Every exit from this method now reports itself, including the two refusals above the work,
    //   because a restore that never starts is exactly the case where a silent UI leaves someone
    //   waiting on something that is not coming.
    //
    //   `broadcast` and not a return value: the HTTP caller and the SDK already get the result,
    //   and a second tab watching the same project has to see this too. ]]
    const say = (phase: 'reading' | 'applying' | 'verifying' | 'done' | 'failed', rest: { fidelity?: RestoreFidelity; note?: string; error?: string } = {}) =>
      this.broadcast({ type: 'restore_status', checkpointId: id, phase, ...rest });

    if (!(await this.pluginConnected())) {
      say('failed', { error: 'Studio is not connected' });
      return { ok: false, error: 'Studio is not connected' };
    }
    const chunks = this.sql.exec(`select data from checkpoint_chunks where checkpoint_id = ? order by idx`, id).toArray() as { data: ArrayBuffer }[];
    if (!chunks.length) {
      say('failed', { error: 'checkpoint not found' });
      return { ok: false, error: 'checkpoint not found' };
    }
    say('reading');
    const total = chunks.reduce((n, c) => n + c.data.byteLength, 0);
    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      buf.set(new Uint8Array(c.data), off);
      off += c.data.byteLength;
    }
    let snapshot: unknown;
    try {
      snapshot = JSON.parse(await gunzip(buf));
    } catch {
      const error = 'The saved checkpoint could not be read. Nothing was sent to Studio.';
      say('failed', { error });
      return { ok: false, error };
    }
    const evidence = checkpointEvidence(snapshot, id);
    if (!evidence.ok) {
      const error = evidence.error.replace('Checkpoint was not saved:', 'Checkpoint cannot be restored:');
      say('failed', { error });
      return { ok: false, error };
    }
    say('applying');
    const applied = await this.execStudioOp({ op: 'restore', root: 'game', snapshot, checkpointId: id }, 120_000, run);
    if (!applied.ok) {
      say('failed', { error: applied.error });
      return { ok: false, error: applied.error };
    }
    say('verifying');

    // SURFACE THE FIDELITY REPORT. The plugin returns exactly how faithful the restore was —
    // instancesCreated, scriptsRestored against scriptsExpected, and counts of instances, scripts
    // and properties that could not be written. All of it used to be dropped here in favour of a
    // bare `{ ok: true }`, so a restore that recreated every instance with the wrong Size, CFrame
    // and Material reported plain success and the user had no reason to look.
    //
    // That is the same defect as a green check over a failed build, on the one path whose entire
    // purpose is getting a user's work back. `ok` now reflects the plugin's own `restored` verdict,
    // and the counts travel with it so the UI can say what was actually recovered.
    const d = (applied.data ?? {}) as {
      restored?: boolean;
      instancesCreated?: number;
      scriptsRestored?: number;
      scriptsExpected?: number;
      failedInstances?: number;
      failedScripts?: number;
      failedProperties?: number;
      error?: string;
    };
    const fidelity = {
      instancesCreated: d.instancesCreated ?? 0,
      scriptsRestored: d.scriptsRestored ?? 0,
      scriptsExpected: d.scriptsExpected ?? 0,
      failedInstances: d.failedInstances ?? 0,
      failedScripts: d.failedScripts ?? 0,
      failedProperties: d.failedProperties ?? 0,
    };

    // A pre-0.2.0 plugin returns no report at all. Absent evidence is reported as absent rather
    // than as success: `restored === undefined` must not read as "restored fine".
    if (d.restored === undefined) {
      const note = 'This Studio plugin is too old to report what it restored, so the result could not be verified.';
      say('done', { fidelity, note });
      return { ok: true, fidelity, note };
    }

    if (!d.restored) {
      const error = d.error ?? 'restore incomplete';
      say('failed', { fidelity, error });
      return { ok: false, error, fidelity };
    }

    // Every instance and script came back, but properties can still have failed — and a part with
    // the wrong Size and CFrame is not the part the user checkpointed. Successful, with a caveat
    // the UI is expected to show.
    if (fidelity.failedProperties > 0) {
      const note = `Restored, but ${fidelity.failedProperties} propert${fidelity.failedProperties === 1 ? 'y' : 'ies'} could not be set — some objects may differ from the checkpoint.`;
      say('done', { fidelity, note });
      return { ok: true, fidelity, note };
    }
    const coverageNote = checkpointCoverageNote(evidence.coverage, evidence.preservedObjects);
    say('done', { fidelity, ...(coverageNote ? { note: coverageNote } : {}) });
    return { ok: true, fidelity, ...(coverageNote ? { note: coverageNote } : {}) };
  }

  private async quotaSpend(
    userId: string,
    credits: number,
    kind: string,
  ): Promise<{ ok: boolean; state: QuotaState; fromAllowance?: number; fromCredits?: number }> {
    const stub = this.env.QUOTA_DO.get(this.env.QUOTA_DO.idFromName(userId));
    const res = await stub.fetch('https://do/spend', { method: 'POST', body: JSON.stringify({ credits, kind }) });
    const data = (await res.json()) as { ok: boolean; state: QuotaState; fromAllowance?: number; fromCredits?: number };
    return data;
  }

  /**
   * Remember which ledger a charge came out of.
   *
   * ONLY ON A CHARGE THAT SUCCEEDED, and only when QuotaDO actually reported a split. A refused
   * spend moved nothing, and a response with no split at all is one from a worker/DO pair mid-roll:
   * leaving the fields undefined there is what makes `refundRun` decline rather than invent a
   * proportion. Undefined and zero are different facts and are kept different.
   */
  private recordSpendSplit(agent: AgentState, settle: { ok: boolean; fromAllowance?: number; fromCredits?: number }): void {
    if (!settle.ok) return;
    if (typeof settle.fromAllowance !== 'number' || typeof settle.fromCredits !== 'number') return;
    agent.creditsFromAllowance = (agent.creditsFromAllowance ?? 0) + Math.max(0, settle.fromAllowance);
    agent.creditsFromCredits = (agent.creditsFromCredits ?? 0) + Math.max(0, settle.fromCredits);
  }

  /**
   * PUT THE CREDITS BACK when the run had nothing to show for them.
   *
   * Called exactly once, from `finishRun`, and guarded three ways: `refundVerdict` decides whether
   * this ending qualifies at all, `agent.creditsRefunded` stops a second attempt inside this
   * isolate, and QuotaDO's `applied_refunds` stops one across isolates. The run id is the refund
   * id, so all three agree on what "this refund" means.
   *
   * RETURNS WHAT CAME BACK, NOT WHAT WAS ASKED FOR. The caller writes a sentence from it, and the
   * two numbers differ over a UTC midnight — see the doc comment on `/refund`. Reporting the ask
   * would be a refund that was not observed rendered as one.
   */
  private async refundRun(agent: AgentState, credits: number): Promise<{ attempted: boolean; asked: number; returned: number }> {
    //[[ `attempted` IS THE POINT OF THIS RETURN TYPE, and it is this repository's own rule applied
    //   to a payment. "Nothing came back" and "we never found out" are the same 0 and are not the
    //   same fact: the first earns the sentence about yesterday's allowance, the second earns
    //   SILENCE, because a refund nobody observed must not be rendered as a refund that failed for
    //   a stated reason. The caller writes a note only when `attempted` is true. ]]
    const unknown = { attempted: false, asked: 0, returned: 0 };
    const fromAllowance = agent.creditsFromAllowance;
    const fromCredits = agent.creditsFromCredits;
    // The split is only unknown on a run started by a deploy that predates it. Refusing here — and
    // saying nothing to the user — is the honest failure: the alternative is to guess which ledger
    // to credit, and the cheap guess ("all purchased") turns a free allowance into money.
    if (typeof fromAllowance !== 'number' || typeof fromCredits !== 'number') return unknown;
    if (fromAllowance + fromCredits <= 0) return unknown;
    // Never refund more than the verdict allows, and keep the same allowance-first proportions the
    // charge used: trim the purchased half first, because that is the half the user paid for and
    // the half we want to leave them holding if anything is trimmed at all.
    const askAllowance = Math.min(fromAllowance, credits);
    const askCredits = Math.max(0, Math.min(fromCredits, credits - askAllowance));
    const stub = this.env.QUOTA_DO.get(this.env.QUOTA_DO.idFromName(agent.userId));
    try {
      const res = await stub.fetch('https://do/refund', {
        method: 'POST',
        body: JSON.stringify({ fromAllowance: askAllowance, fromCredits: askCredits, kind: `usage_${agent.mode}`, refundId: agent.msgId }),
      });
      const data = (await res.json()) as { ok?: boolean; returned?: unknown; state?: QuotaState };
      // A ledger that answered without a `returned` figure is one that predates this route. It did
      // not refuse, and it did not refund; it did not understand the question.
      if (data?.ok !== true || !Number.isSafeInteger(data.returned)) return unknown;
      if (data.state) this.broadcast({ type: 'quota', quota: data.state });
      // `asked` is what was actually REQUESTED of the ledger, which can be less than the verdict
      // when the run's recorded split is smaller than its recorded cost. The sentence is written
      // from this pair, so it can never say "the rest could not be returned" about Credits that
      // were never taken in the first place.
      return { attempted: true, asked: askAllowance + askCredits, returned: Math.max(0, data.returned as number) };
    } catch {
      // A ledger that cannot be reached has not refunded anything, and the reply must not say it
      // did — nor that it could not. The run still ends and the Credits stay as they were.
      return unknown;
    }
  }

  private async quotaState(userId: string): Promise<QuotaState> {
    const stub = this.env.QUOTA_DO.get(this.env.QUOTA_DO.idFromName(userId));
    const res = await stub.fetch('https://do/state');
    return (await res.json()) as QuotaState;
  }
}

// ---------------------------------------------------------------------- utils
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function gzip(s: string): Promise<Uint8Array> {
  const cs = new CompressionStream('gzip');
  const blob = new Blob([s]);
  const stream = blob.stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(b: Uint8Array): Promise<string> {
  const ds = new DecompressionStream('gzip');
  const stream = new Blob([b as unknown as ArrayBuffer]).stream().pipeThrough(ds);
  return await new Response(stream).text();
}
