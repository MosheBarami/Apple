// SessionDO — one per project. Store of record for chat history, checkpoints and op logs.
// Bridges: browser (WebSocket, hibernatable) <-> agent loop (alarm-driven steps) <-> Studio
// plugin (HTTP long-poll). Survives eviction between agent steps via persisted state.
import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
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
  GolemMode,
  GatewayRequest,
  ToolTraceEntry,
  QuotaState,
  RunIntent,
  StudioFrame,
  PlaytestRun,
  RenderViewResult,
  StudioPlace,
  StudioLinkSummary,
} from '@golem/shared';
import { MESSAGE_MAX_CHARS, type AssetSourcePolicy } from '@golem/shared';
import {
  admitFrame,
  FrameRate,
  FrameRing,
  PLAYTEST_FRAME_HEIGHT,
  PLAYTEST_FRAME_WIDTH,
  type RawFrame,
} from '../frame-bus';
import { advance, isTerminal, startPlaytest } from '../playtest-stream';
import { creditsForNeurons } from '../pricing';
import { chat as llmChat, BudgetError, RateLimitedError } from '../gateway';
import { systemPrompt, collapseArtDirection, MEMORY_UPDATE_PROMPT } from '../prompts';
import { designBrief } from '../design-brief';
import { toolDefs, toolNames, runTool, type AgentCtx, type PlaytestBus } from '../tools';
import { MCP_TOOL_NAMES } from '../mcp';
import { planFromDetail, planDetail, settlePlan, type RunPlan } from '../run-plan';
import { critiqueToText } from '../vision';
import { toolsForMode } from '../router';
import { assetLibraryAvailable } from '../asset-library';
import { notify } from '../notify';
import { usageBand } from '../notifications';
import { dayKey } from '../quota-math';
import { chooseEffort, classifyRequest, tokensForEffort, type ReasoningSignals, type Effort } from '../reasoning';
import { phaseForTool, type AgentPhase, type RunSnapshot, type RunSnapshotTool } from '@golem/shared';
import { trimTranscriptReport } from '../transcript';
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
import { placeAdmission, readPlaceReport, servesOps, type PlaceAdmission } from '../studio-place';
import { WORKER_FAILURES, asFailureKind } from '../op-failure';
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
import { EMPTY_PERSONALISATION, applyToolPermissions, memoryModeOf, personalisationForProject } from '../preferences';
import { allModels } from '../providers/registry';
import { recordEvent } from '../analytics';
import { flushEvents } from '../analytics-sink';
import { fenceToolOutput, describeThreats } from '../injection.ts';
import { scoreSubmission, type Submission } from '../abuse.ts';

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

interface AgentState {
  status: 'idle' | 'running' | 'stopping';
  /** the run's unforgeable fence id; optional so a run persisted by an older deploy still loads */
  fenceId?: string;
  mode: GolemMode;
  msgId: string;
  llm: GatewayRequest['messages'];
  step: number;
  maxSteps: number;
  creditsSpent: number;
  /** neurons this run has consumed, so Credits round once per run instead of once per call */
  neuronsUsed?: number;
  trace: ToolTraceEntry[];
  seenCalls?: string[]; // "tool:argsHash" of calls already executed this run
  lastCalls?: { id: string; name: string; arguments: string }[];
  finalText: string;
  streamedText?: string;
  startedAt: number;
  lastStepAt: number;
  userId: string;
  // ---- adaptive reasoning signals. All optional: a run persisted by an older deployment
  // deserialises unchanged and simply starts from the baseline effort. ----
  /** how many steps this run has already spent at high effort */
  highEffortUsed?: number;
  /** the previous step errored or a tool reported failure */
  priorStepFailed?: boolean;
  /** the last visual critique failed its quality gate */
  visualDefectsFound?: boolean;
  /** what the user's request looks like, classified once when the run starts */
  traits?: Pick<ReasoningSignals, 'visualDesignTask' | 'multiSystemTask' | 'ambiguousRequest' | 'conversational'>;
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
  /** The subset of the above that came from the curated library rather than the Creator Store. */
  libraryAssetIds?: number[];
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
  /**
   * The plan `propose_plan` announced, and the tool row it was announced on.
   *
   * Kept so `settlePlan` can re-state it at the end of the run against what actually ran. Bounded
   * by the tool's own 12-step cap and its 200/800-character clips, so it cannot be the thing that
   * pushes the persisted AgentState past the Durable Object's value limit.
   */
  plan?: RunPlan;
}

// step limits are a direct cost multiplier: every step is a full priced inference call
// Step limits are a direct cost multiplier: every step is a full priced inference call. They were
// 3/8/14, which was sized for build-only runs. The visual loop costs steps by construction —
// build (2-3) + render + critique + fix (2) + re-render is eight on its own — and a Stone lamp-post
// build was measured hitting the ceiling mid-work, leaving scaffolding behind and never finishing
// the detail pass. These are sized so the loop can actually close.
const STEP_LIMITS: Record<GolemMode, number> = { clay: 3, stone: 16, rune: 24 };

/** Tools that change the project. A run that ends without one of these has not done its job. */
const MUTATING_TOOLS = new Set([
  'edit_script', 'create_instances', 'set_properties', 'delete_instances', 'run_luau', 'insert_asset',
]);
/** How many times one run may be steered back to work after replying without acting. */
const MAX_NUDGES = 2;
/** Output token budget per step before the effort multiplier — matches the gateway model config. */
const MODE_BASE_TOKENS: Record<GolemMode, number> = { clay: 1600, stone: 4400, rune: 5200 };

/**
 * The runtime mode allowlist. `GolemMode` is a COMPILE-TIME type and `JSON.parse(raw) as ClientMsg`
 * is an assertion, not a check — so before this, whatever the client put in `mode` was used as a
 * key directly.
 *
 * WHAT THAT COST, measured by driving webSocketMessage:
 *
 *   mode=stone      maxSteps=16         the ceiling stops the loop
 *   mode=memory     maxSteps=undefined  `9999 > undefined` is false — NO CEILING, EVER
 *   mode=vision     maxSteps=undefined  same
 *   mode=nonsense   maxSteps=undefined  same
 *   mode=__proto__  maxSteps={}         Object.prototype, and `9999 > {}` is false too
 *
 * An agent run was created every time. `memory` and `vision` are the sharp cases because they are
 * real DEFAULT_MODELS keys, so gateway.ts's `if (!cfg) throw` — the only thing that rejected a bad
 * mode — does not fire for them either, and the token arithmetic goes NaN through a chain of `>`
 * comparisons that all fail open. But the step ceiling is set HERE, before the gateway is ever
 * consulted, so ANY unrecognised mode removes it. An unbounded agent loop is a larger exposure
 * than any single under-reserved call.
 *
 * MEMBERSHIP IS CHECKED AGAINST BOTH TABLES, deliberately. The bug was two `Record<GolemMode, T>`
 * tables with different key sets — a compile-time promise that nothing keeps at runtime. Requiring
 * a mode to appear in both means that if they ever drift again the mode is REFUSED rather than
 * half-configured, so the next drift is a visible error instead of a missing ceiling.
 *
 * hasOwnProperty, not `in` and not truthiness: `'__proto__' in STEP_LIMITS` is true.
 *
 * THE TWO-TABLE CHECK CANNOT BE FALSIFIED TODAY and should not be mistaken for a tested clause.
 * The tables currently hold the same three keys, so dropping the MODE_BASE_TOKENS half turns
 * nothing red. It is kept because it is the drift itself that is being guarded against: the day
 * someone adds a fourth mode to one table and not the other, this refuses it instead of handing it
 * an undefined ceiling. Falsifiable only by a future that has not happened yet.
 */
function asGolemMode(x: unknown): GolemMode | null {
  if (typeof x !== 'string') return null;
  const inBoth =
    Object.prototype.hasOwnProperty.call(STEP_LIMITS, x) &&
    Object.prototype.hasOwnProperty.call(MODE_BASE_TOKENS, x);
  return inBoth ? (x as GolemMode) : null;
}
const STEP_STALE_MS = 180_000;

/**
 * HOW LONG A RUN MAY LAST — CHECKLIST-V2 §50.14.
 *
 * STEP_LIMITS bounds how many TIMES work is attempted. Nothing bounded how LONG those attempts
 * take, and `startedAt` was read exactly once, at the end, to report a `durationMs` nobody acted
 * on. A rune run of 24 steps each waiting on a slow provider runs for over an hour and spends the
 * whole time. The runaway that matters is not usually a fast loop; it is a slow one.
 *
 * Ordered by how long the mode is meant to work: Plan is a question, Agent is a build, Super Agent
 * is long-horizon. None of them is an hour.
 */
export const RUN_WALL_MS: Record<GolemMode, number> = {
  clay: 5 * 60_000,
  stone: 20 * 60_000,
  rune: 45 * 60_000,
};

/** The strictest ceiling, which is what an unrecognised mode gets. */
const STRICTEST_RUN_WALL_MS = Math.min(...Object.values(RUN_WALL_MS));

export interface RunDurationVerdict {
  over: boolean;
  elapsedMs: number;
  capMs: number;
  /** What to tell the agent. Never blames the step ceiling for a time limit. */
  reason: string;
}

/**
 * Has this run been going too long?
 *
 * AN UNREADABLE CLOCK STOPS THE RUN. `Date.now() - NaN` is NaN and `NaN > cap` is FALSE, so the
 * naive form of this check removes the limit exactly when the state is corrupt. A deadline that
 * cannot be computed is a deadline that has passed — the same rule resolveMembership applies to an
 * expiry it cannot read.
 *
 * A start time in the FUTURE is corrupt too, not a run with extra credit.
 *
 * An unrecognised mode gets the STRICTEST ceiling rather than none. session.ts validates mode at
 * every ingress, so this is defence in depth — and the safe direction for a value nobody
 * recognised is the tightest bound.
 */
export function runDurationVerdict(input: {
  startedAt: unknown;
  mode: unknown;
  now: unknown;
}): RunDurationVerdict {
  const capMs =
    typeof input.mode === 'string' && Object.prototype.hasOwnProperty.call(RUN_WALL_MS, input.mode)
      ? RUN_WALL_MS[input.mode as GolemMode]
      : STRICTEST_RUN_WALL_MS;

  const started = input.startedAt;
  const now = input.now;
  if (typeof started !== 'number' || !Number.isFinite(started) || typeof now !== 'number' || !Number.isFinite(now)) {
    return {
      over: true,
      elapsedMs: 0,
      capMs,
      reason: 'this run was stopped because its start time could not be read — an unreadable clock is not an unlimited one',
    };
  }
  const elapsedMs = now - started;
  if (elapsedMs < 0) {
    return {
      over: true,
      elapsedMs: 0,
      capMs,
      reason: 'this run was stopped because its start time is in the future — the clock could not be trusted',
    };
  }
  if (elapsedMs >= capMs) {
    return {
      over: true,
      elapsedMs,
      capMs,
      reason:
        `this run reached its time limit of ${Math.round(capMs / 60_000)} minutes (it had been going ` +
        `${Math.round(elapsedMs / 60_000)}). Everything done so far is saved — send another message to carry on.`,
    };
  }
  return { over: false, elapsedMs, capMs, reason: '' };
}


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
const MAX_PROMPT_CHARS = 24_000; // ~7k tokens; the transcript is re-sent every step

export class SessionDO extends DurableObject<Env> {
  private sql = this.ctx.storage.sql;
  private opQueue: PendingOp[] = [];
  private opWaiters = new Map<string, (r: OpResult) => void>();
  private pollWaiter: (() => void) | null = null;
  /** msgId of the run in flight, so a forwarded frame can be attributed. */
  private currentMsgId: string | undefined;
  private seq = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`
        create table if not exists messages(
          id text primary key, role text not null, mode text, content text not null,
          tool_trace text, created_at integer not null);
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
      const q = await this.ctx.storage.get<PendingOp[]>('opQueue');
      if (q) this.opQueue = q;
      const seq = await this.ctx.storage.get<number>('seq');
      if (seq) this.seq = seq;
      const lastSeen = (await this.ctx.storage.get<number>('pluginLastSeen')) ?? 0;
      this.pluginSeenRecently = Date.now() - lastSeen < 8000;
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
  private beatOf(ws: WebSocket): { userId: string; role: CollabRole; connectionId: string; activity: PresenceActivity } | null {
    try {
      const att = ws.deserializeAttachment() as { userId?: unknown; role?: unknown; connectionId?: unknown; activity?: unknown } | null;
      const role = asCollabRole(att?.role);
      if (!att || role === null || typeof att.userId !== 'string' || typeof att.connectionId !== 'string') return null;
      const activity = att.activity === 'typing' || att.activity === 'building' ? att.activity : 'viewing';
      return { userId: att.userId, role, connectionId: att.connectionId, activity };
    } catch {
      return null;
    }
  }

  /** Refresh this socket's heartbeat, and tell the room. */
  private touch(ws: WebSocket, activity?: PresenceActivity) {
    const current = this.beatOf(ws);
    if (current === null) return;
    const beat = makeBeat({
      userId: current.userId,
      role: current.role,
      connectionId: current.connectionId,
      nowMs: Date.now(),
      activity: activity ?? current.activity,
    });
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
  private applyAccessChange(userId: string, role: CollabRole | null): { matched: number; closed: number; demoted: number } {
    let matched = 0;
    let closed = 0;
    let demoted = 0;
    for (const ws of this.ctx.getWebSockets('client')) {
      const beat = this.beatOf(ws);
      if (beat === null || beat.userId !== userId) continue;
      matched += 1;
      if (role === null) {
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
      if (beat.role === role) continue;
      const next = makeBeat({ userId: beat.userId, role, connectionId: beat.connectionId, nowMs: Date.now(), activity: beat.activity });
      if (next === null) continue;
      try {
        ws.serializeAttachment(next);
        demoted += 1;
        // The tab is TOLD. Without this the controls keep offering what the server will now
        // refuse, and the person finds out by pressing one and reading a permission error they
        // have no explanation for.
        ws.send(JSON.stringify({ type: 'error', code: 'role_changed', message: `Your role on this project is now ${role}.` } satisfies ServerMsg));
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
  private refuseOne(origin: WebSocket | undefined, msg: ServerMsg) {
    if (origin === undefined) {
      this.broadcast(msg);
      return;
    }
    try {
      origin.send(JSON.stringify(msg));
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
      const next = makeBeat({
        userId: beat.userId,
        role: beat.role,
        connectionId: beat.connectionId,
        nowMs: Date.now(),
        activity: 'viewing',
      });
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
    const last = Math.max(stored, this.lastSeenWrittenAt);
    if (!last) return false;
    const deadline = this.pollDueBy || last + POLL_WAIT_IDLE_MS + POLL_STALE_GRACE_MS;
    return Date.now() < deadline;
  }

  /**
   * When the plugin last polled, or null if it never has.
   *
   * Reads the larger of the checkpointed value and the in-memory one for the same reason
   * `pluginConnected()` does: the heartbeat is only written to storage every 4s, so between
   * checkpoints storage is behind by up to that much and reporting it would age the link by four
   * seconds every time somebody opened a tab.
   */
  private async pluginLastSeenAt(): Promise<number | null> {
    const stored = (await this.ctx.storage.get<number>('pluginLastSeen')) ?? 0;
    const last = Math.max(stored, this.lastSeenWrittenAt);
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
      server.serializeAttachment(beat);
      // Everyone already here learns someone arrived; the arriver gets the list in the same shape
      // rather than a special one-off payload.
      this.broadcastPresence();
      const quota = await this.quotaState(bind.ownerId);
      server.send(
        JSON.stringify({
          type: 'hello',
          sessionId: bind.projectId,
          studioConnected: await this.pluginConnected(),
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
      const reported = readPluginHeaders(req.headers);
      const body = (await req.json()) as PluginPollRequest;
      return this.handlePluginPoll(body, reported);
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
      // Called by the membership routes after their writes land. See `applyAccessChange`.
      const payload = (await req.json().catch(() => null)) as { userId?: unknown; role?: unknown } | null;
      const userId = typeof payload?.userId === 'string' && payload.userId.length > 0 ? payload.userId : null;
      if (userId === null) return json({ error: 'bad_request' }, 400);
      // THE OWNER'S ROLE IS THE `projects.owner_id` COLUMN and no membership write can move it, so
      // a request to change it is a programming error rather than a demotion to apply.
      if (userId === bind.ownerId) return json({ error: 'owner_is_not_a_member' }, 400);
      // A ROLE THIS BUILD CANNOT READ IS A REMOVAL, not a role left as it was. `asCollabRole`
      // returns null for anything outside the allowlist, and leaving the socket at the
      // capabilities it already had would be the one direction that must never be the default.
      const role = payload?.role === null || payload?.role === undefined ? null : asCollabRole(payload.role);
      return json(this.applyAccessChange(userId, role));
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
      return json({
        messages: rows.reverse().map((r) => ({
          id: r.id,
          role: r.role,
          mode: r.mode,
          content: r.content,
          toolTrace: r.tool_trace ? JSON.parse(r.tool_trace) : null,
          createdAt: new Date(r.created_at).toISOString(),
        })),
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
          content: r.content,
          toolTrace: r.tool_trace ? JSON.parse(r.tool_trace) : null,
          createdAt: new Date(r.created_at).toISOString(),
        })),
      });
    }

    if (path === '/checkpoints' && req.method === 'GET') {
      const rows = this.sql
        .exec(`select id, label, kind, script_count, instance_count, size_bytes, created_at, author_id, description from checkpoints order by created_at desc limit 50`)
        .toArray() as { id: string; label: string; kind: string; script_count: number; instance_count: number; size_bytes: number; created_at: number; author_id: string | null; description: string | null }[];
      return json({
        checkpoints: rows.map((r) => ({
          id: r.id,
          label: r.label,
          kind: r.kind as CheckpointMeta['kind'],
          createdAt: r.created_at,
          scriptCount: r.script_count,
          instanceCount: r.instance_count,
          sizeBytes: r.size_bytes,
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
      const { text, mode, effort } = (await req.json()) as { text: string; mode?: GolemMode; effort?: Effort };
      if (!text?.trim()) return json({ ok: false, error: 'text required' }, 400);
      const agent = await this.ctx.storage.get<AgentState>('agent');
      if (agent?.status === 'running') return json({ ok: false, error: 'a run is already in progress' }, 409);
      // `effort` pins the reasoning tier for the whole run, overriding the adaptive policy. It
      // exists so the policy itself can be A/B tested against real builds rather than against
      // text-only probes — the measurement that missed the tool-calling regression.
      // `mode ?? 'stone'` defended undefined and null only — never a hostile string, and this path
      // sets the same step ceiling the socket path does.
      const runMode = mode === undefined || mode === null ? 'stone' : asGolemMode(mode);
      if (!runMode) return json({ ok: false, error: `unknown mode` }, 400);
      await this.startRun(bind, text.slice(0, MESSAGE_MAX_CHARS), runMode, effort);
      return json({ ok: true, started: true, mode: runMode, effort: effort ?? 'adaptive' });
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
      });
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
      const had = !!(await this.ctx.storage.get<string>('pluginTokenHash'));
      await this.ctx.storage.delete(['pluginTokenHash', 'pluginTokenIssuedAt', 'pluginLastSeen', 'pluginPlace', 'pluginSuperseded']);
      this.lastSeenWrittenAt = 0;
      this.pollDueBy = 0;
      this.pluginSeenRecently = false;
      this.boundPlace = null;
      this.placeMismatch = null;
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
      phase: agent.phase ?? 'planning',
      step: agent.step,
      totalSteps: agent.maxSteps,
      text: agent.streamedText ?? '',
      tools: agent.uiTools ?? [],
      startedAt: agent.startedAt,
      effort: agent.effort,
      effortReason: agent.effortReason,
      // Optional on the wire, and optional here: a run persisted by an older deployment simply
      // replays without the Intent and Plan rows rather than failing to replay at all.
      intent: agent.intent,
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
    const me = this.beatOf(ws);
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
          this.touch(ws, 'building');
          const mode = asGolemMode(msg.mode);
          if (!mode) {
            // Refused by name. A `?? 'clay'` default here would accept a hostile value and run it
            // quietly as something else, which is the same failure wearing a helpful face.
            this.broadcast({ type: 'error', code: 'bad_mode', message: 'Unknown mode for this request.' });
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
          if (this.refuseAbusive(text)) return;
          await this.startRun(bind, text, mode, undefined, ws);
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
        const agent = await this.ctx.storage.get<AgentState>('agent');
        if (agent && agent.status !== 'idle') {
          this.refuseOne(ws, { type: 'error', code: 'busy', message: 'Stop the current run before editing a message.' });
          return;
        }

        const row = this.sql
          .exec(`select id, role, created_at from messages where id = ?`, msg.messageId)
          .toArray()[0] as { id: string; role: string; created_at: number } | undefined;
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
        this.sql.exec(`delete from messages where created_at >= ?`, row.created_at);

        // Every client, not just the asker: a second tab would otherwise keep showing messages the
        // server has deleted, and nothing distinguishes that stale view from a live one.
        this.broadcast({ type: 'history_truncated', fromMessageId: row.id, removed });

        {
          const mode = asGolemMode(msg.mode);
          if (!mode) {
            this.broadcast({ type: 'error', code: 'bad_mode', message: 'Unknown mode for this request.' });
            return;
          }
          await this.startRun(bind, text, mode, undefined, ws);
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
        const res = await this.restoreCheckpoint(msg.checkpointId);
        if (!res.ok) this.broadcast({ type: 'error', code: 'restore', message: res.error ?? 'restore failed' });
        return;
      }
    }
  }

  async webSocketClose() {
    // Nothing to clean — but the room has changed, and presence is derived from the sockets that
    // are still attached, so the people left behind need to be told.
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
    mode: GolemMode,
    forcedEffort?: Effort,
    /** The socket that asked, so the refusal reaches that person and not the room. */
    origin?: WebSocket,
  ) {
    const attempt = await this.startGate(() => this.startRunInner(bind, text, mode, forcedEffort, origin));
    if (!attempt.ran) {
      this.refuseOne(origin, { type: 'error', code: 'busy', message: 'Apple is already working — stop the current run first.' });
    }
  }

  private async startRunInner(
    bind: { projectId: string; projectName: string; ownerId: string },
    text: string,
    mode: GolemMode,
    forcedEffort?: Effort,
    origin?: WebSocket,
  ) {
    const existing = await this.ctx.storage.get<AgentState>('agent');
    if (existing && existing.status !== 'idle' && Date.now() - existing.lastStepAt < STEP_STALE_MS) {
      this.refuseOne(origin, { type: 'error', code: 'busy', message: 'Apple is already working — stop the current run first.' });
      return;
    }
    // Clear any stop left behind by a previous run. Belt and braces with finishRun's clear:
    // a stop that arrives in the moment a run is finishing can land after that clear, and it
    // must not travel into the run the user starts next.
    await clearStop(this.ctx.storage);

    // Credits are billed from measured usage after each model call, so entering a run only
    // requires having some balance left — the user is never charged for an estimate.
    const quota = await this.quotaSpend(bind.ownerId, 1, `chat_${mode}`);
    if (!quota.ok) {
      this.broadcast({ type: 'error', code: 'quota', message: 'Daily Credits are used up. They refill at midnight UTC.' });
      this.broadcast({ type: 'quota', quota: quota.state });
      return;
    }
    this.broadcast({ type: 'quota', quota: quota.state });

    const userMsgId = crypto.randomUUID();
    this.sql.exec(`insert into messages(id, role, mode, content, created_at) values(?,?,?,?,?)`, userMsgId, 'user', mode, text, Date.now());

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
    const sys = systemPrompt({
      mode,
      studioConnected,
      assetLibraryAvailable: await assetLibraryAvailable(this.env),
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
      sceneKind: traits.visualDesignTask && mode !== 'clay' ? text : undefined,
      //[[ Same gate as sceneKind, on the trait that means INTERFACE rather than place.
      //   `designBrief` returns null when the library has nothing useful for this
      //   request, and null is a real answer: the library covers a fraction of the
      //   style families §L asks for, and padding a thin match into a prompt would
      //   spend tokens on every step to tell the model what it did not need. ]]
      uiBrief: traits.uiDesignTask && mode !== 'clay' ? (designBrief(text)?.text ?? null) : null,
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
      msgId,
      fenceId,
      // The original request is PINNED: the trim may never evict it. Losing it was the defect
      // trimTranscript documents — the agent kept working with no record of the task.
      llm: [{ role: 'system', content: sys }, ...history, { role: 'user', content: text, pinned: true }],
      step: 0,
      maxSteps: STEP_LIMITS[mode],
      creditsSpent: 1,
      trace: [],
      finalText: '',
      startedAt: Date.now(),
      lastStepAt: Date.now(),
      userId: bind.ownerId,
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
    this.broadcast({ type: 'msg_start', msgId, role: 'assistant', mode });
    // Exactly once per run, and only after msg_start so the client has a message to attach it to.
    if (intent) this.broadcast({ type: 'run_intent', msgId, intent });
    this.currentMsgId = agent.msgId;
    agent.phase = mode === 'clay' ? 'understanding' : 'planning';
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
    if (studioConnected && mode !== 'clay') {
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
    const agent = await this.ctx.storage.get<AgentState>('agent');
    if (!agent) return;
    if (agent.status === 'idle') return;
    if (agent.status === 'stopping' || (await stopRequested(this.ctx.storage))) {
      agent.status = 'stopping';
      await this.finishRun(agent, 'stopped');
      return;
    }
    if (Date.now() - agent.lastStepAt > STEP_STALE_MS && agent.step > 0) {
      agent.finalText = agent.finalText || 'The run was interrupted. Everything up to the last completed step is saved — you can continue from here.';
      await this.finishRun(agent, 'error', 'run interrupted');
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
          e.reason === 'monthly_cap'
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
        agent.finalText =
          (agent.finalText ? agent.finalText + '\n\n' : '') +
          `${e.message} Everything I finished is saved.`;
        this.broadcast({ type: 'error', code: 'busy', message: e.message });
        await this.finishRun(agent, 'error', 'rate_limited');
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      // Provider hiccups are surfaced, never silently re-billed. The agent recovers by asking
      // the user to continue rather than spending a second time on the same step.
      if (/inference failed/i.test(msg) && agent.step > 1) {
        agent.finalText =
          (agent.finalText ? agent.finalText + '\n\n' : '') +
          'The model dropped that step. Everything up to here is saved — send another message and I will pick up where I left off.';
        await this.finishRun(agent, 'error', msg);
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
      agent.finalText = agent.finalText || `Something went wrong: ${msg}`;
      await this.finishRun(agent, 'error', msg);
    }
  }

  private async runStep(agent: AgentState) {
    // The RESULT is unused; the call is kept because reading the binding refreshes
    // `boundProjectId` on an instance revived mid-run. The constructor restores it too,
    // so this is belt and braces rather than the only path — see the note there.
    await this.bind();
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
    agent.step += 1;
    agent.lastStepAt = Date.now();
    this.lastActivity = agent.lastStepAt;

    // TIME before STEPS: a run that has been going too long should be told so, not told it ran out
    // of steps. What stopped it has to be what it is told, or the next attempt repeats it.
    const duration = runDurationVerdict({ startedAt: agent.startedAt, mode: agent.mode, now: Date.now() });
    if (duration.over) {
      agent.finalText = agent.finalText || duration.reason;
      await this.finishRun(agent, 'done');
      return;
    }

    if (agent.step > agent.maxSteps) {
      agent.finalText = agent.finalText || 'I reached the step limit for this run. Progress so far is saved — send another message to continue.';
      await this.finishRun(agent, 'done');
      return;
    }
    if (agent.step > 1) {
      const state = await this.quotaState(agent.userId);
      if (state.creditsRemaining <= 0) {
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
    const trimmed = trimTranscriptReport(agent.llm, MAX_PROMPT_CHARS);
    agent.llm = trimmed.llm;
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
    // The opening phase of a step is 'understanding' on the first step and
    // otherwise carries whatever the previous tool left us in, until the next
    // tool call renames it. Never invent a stage the agent has not entered.
    agent.phase = agent.step === 1 ? (agent.mode === 'clay' ? 'understanding' : 'planning') : (agent.phase ?? 'building');
    this.broadcast({ type: 'agent_status', phase: agent.phase, step: agent.step, totalSteps: agent.maxSteps, creditsSpent: agent.creditsSpent });

    const studioConnected = await this.pluginConnected();
    //[[ NARROWING ONLY, and in this order.
    //
    //   `toolsForMode` is what enforces Plan mode's read-only promise to the user — it is the
    //   guarantee, not a token optimisation. Preferences are applied ON TOP of it and can only
    //   remove, so a preference cannot hand run_luau to the one mode whose entire purpose is that
    //   it cannot touch the project. See applyToolPermissions. ]]
    const allowed = applyToolPermissions(toolsForMode(agent.mode, studioConnected, toolNames()), agent.toolPermissions);

    // Decide how hard to think about THIS step. Cheap by default, expensive where it changes the
    // outcome — visual design, recovery from failure, anything irreversible.
    const choice = chooseEffort({
      mode: agent.mode,
      step: agent.step,
      highEffortUsed: agent.highEffortUsed ?? 0,
      priorStepFailed: agent.priorStepFailed,
      visualDefectsFound: agent.visualDefectsFound,
      ...(agent.traits ?? {}),
    });
    if (agent.forcedEffort) choice.effort = agent.forcedEffort;
    if (choice.effort === 'high') agent.highEffortUsed = (agent.highEffortUsed ?? 0) + 1;
    // Surface the reasoning POLICY's decision — the tier it picked and its own
    // one-line justification. This is a classification of the request, never
    // the model's hidden reasoning, and carries no prompt or transcript text.
    agent.effort = choice.effort;
    agent.effortReason = choice.reason;
    this.broadcast({
      type: 'agent_status',
      phase: agent.phase ?? 'planning',
      step: agent.step,
      totalSteps: agent.maxSteps,
      effort: choice.effort,
      effortReason: choice.reason,
      creditsSpent: agent.creditsSpent,
    });

    // Whether the curated library exists here. Read once per isolate — it changes at most once per
    // deployment, and the whole point is to stop paying for a tool call that cannot succeed.
    const hasAssetLibrary = await assetLibraryAvailable(this.env);

    const res = await llmChat(
      this.env,
      {
        model: agent.mode,
        messages: agent.llm,
        tools: toolDefs(studioConnected, allowed, { assetLibrary: hasAssetLibrary }),
        reasoningEffort: choice.effort,
        maxTokens: tokensForEffort(MODE_BASE_TOKENS[agent.mode], choice.effort),
      },
      // Same affinity key for every step of the run, so Workers AI can reuse the prefill for the
      // identical system-prompt-and-tools prefix instead of recomputing ~5,200 tokens each step.
      // The DO id is per-project and opaque, so it is never shared across tenants.
      {
        kind: `${agent.mode}:step:${choice.effort}`,
        sessionId: this.ctx.id.toString(),
        // Attribution for the model trace. Null when the run predates a bind rather than a
        // placeholder — `breakdownBy` counts unattributed calls instead of inventing a tenant.
        actorId: agent.userId,
        ...(this.boundProjectId ? { projectId: this.boundProjectId } : {}),
        runId: agent.msgId,
      },
    );
    //[[ Same reason as seenCalls: this holds raw tool arguments verbatim and is persisted.
    //   Only the most recent turn's calls are ever read, so keeping more is pure weight. ]]
    agent.lastCalls = (res.toolCalls ?? []).slice(-8);
    // Signals are recomputed from what actually happens each step, so an escalation lapses once
    // the problem it was bought for is resolved.
    agent.priorStepFailed = false;
    agent.visualDefectsFound = false;

    // Credits track real spend: charge the difference between what this call actually cost
    // and the 1 Credit already taken for the step. Users are never billed for our estimate.
    // Round Credits once per RUN, not once per call: otherwise a run of five small calls costs
    // five whole Credits when the compute used barely fills one.
    agent.neuronsUsed = (agent.neuronsUsed ?? 0) + res.neurons;
    const owed = creditsForNeurons(agent.neuronsUsed) - agent.creditsSpent;
    if (owed > 0) {
      const settle = await this.quotaSpend(agent.userId, owed, `usage_${agent.mode}`);
      agent.creditsSpent += owed;
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

    if (res.text) {
      agent.finalText = res.text;
      agent.streamedText = (agent.streamedText ?? '') + res.text;
      this.broadcast({ type: 'delta', msgId: agent.msgId, text: res.text });
    }

    if (!res.toolCalls.length) {
      agent.llm.push({ role: 'assistant', content: res.text });
      // A build request that ends with prose and no change has failed, whatever the prose says.
      // Measured: the model replied "One part is still Plastic - finding and fixing it, then a
      // visual inspection:" and stopped, announcing work it never did. Steer it back rather than
      // reporting success. Bounded by MAX_NUDGES so this can never loop.
      // VISUAL SELF-CORRECTION, as a production behaviour rather than a benchmark feature.
      // If the run changed the world for a visual request and never looked at the result, look
      // now. A failing gate is handed back as work to do, exactly as a user would hand it back.
      // Charged once per run, and only with steps left, so it can neither loop nor surprise the
      // budget.
      if (
        agent.mode !== 'clay' &&
        agent.mutated &&
        studioConnected &&
        agent.traits?.visualDesignTask &&
        !agent.autoCritiqued &&
        agent.step < agent.maxSteps - 1
      ) {
        agent.autoCritiqued = true;
        agent.phase = 'critiquing';
        this.broadcast({
          type: 'agent_status',
          phase: 'critiquing',
          step: agent.step,
          totalSteps: agent.maxSteps,
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
          if (rebuild) agent.rebuildOrdered = true;

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
      const owesWork =
        agent.mode !== 'clay' && !agent.mutated && studioConnected && !agent.traits?.conversational;
      if (owesWork && (agent.nudges ?? 0) < MAX_NUDGES && agent.step < agent.maxSteps) {
        agent.nudges = (agent.nudges ?? 0) + 1;
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
      // The nudge above had already fired MAX_NUDGES times; when it gives up, control fell straight
      // through to finishRun(agent, 'done'), which prints the model's own optimistic prose.
      //
      // Nothing about that is recoverable by a user, because the reply says the work happened.
      await this.finishRun(agent, owesWork ? 'incomplete' : 'done');
      return;
    }

    // record the assistant turn with STRUCTURED tool calls; the gateway renders them in whatever
    // form the target model expects
    agent.llm.push({ role: 'assistant', content: res.text ?? '', toolCalls: res.toolCalls });

    const ctx = this.agentCtx(agent);
    agent.seenCalls = agent.seenCalls ?? [];
    for (const call of res.toolCalls.slice(0, 4)) {
      const t0 = Date.now();
      const toolId = call.id;
      const sig = `${call.name}:${call.arguments}`;
      if (agent.seenCalls.includes(sig)) {
        // the model is looping — refuse the duplicate and steer it back to building
        this.broadcast({ type: 'tool_start', msgId: agent.msgId, toolId, tool: call.name, summary: call.name });
        this.broadcast({ type: 'tool_end', msgId: agent.msgId, toolId, ok: false, summary: `↺ ${call.name} (already done)` });
        agent.llm.push({
          role: 'tool',
          content: `[${call.name}] You already made this exact call earlier in this run and have the result above. Do not repeat it. Use what you know now and make the actual change to the project.`,
          toolCallId: call.id,
          name: call.name,
        });
        continue;
      }
      agent.seenCalls.push(sig);
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
        totalSteps: agent.maxSteps,
        tool: call.name,
      });
      this.broadcast({ type: 'tool_start', msgId: agent.msgId, toolId, tool: call.name, summary: call.name });
      const out = await runTool(ctx, call.name, call.arguments);
      const entry: ToolTraceEntry = { tool: call.name, summary: out.summary, ok: out.ok, durationMs: Date.now() - t0 };
      agent.trace.push(entry);
      // Feed the outcome back to the reasoning policy: a failed tool or a failed visual gate
      // means the next step should think harder rather than repeat the same cheap attempt.
      if (!out.ok) agent.priorStepFailed = true;
      if (out.ok && MUTATING_TOOLS.has(call.name)) agent.mutated = true;
      // The plan is read back out of the panel the tool emitted rather than handed over through a
      // second channel: one mechanism, and the thing settled at the end is by construction the
      // thing the user was shown. A second propose_plan is ignored — the prompt says call it once,
      // and letting a later plan replace the one the user already read would rewrite history.
      if (call.name === 'propose_plan' && out.ok && !agent.plan) agent.plan = planFromDetail(toolId, out.detail);
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
    }

    // Checked again here, not only inside the tool loop: a stop that arrives after the last
    // tool's check would otherwise be overwritten by this step's tail persist below, and the
    // next alarm would carry on as though the button had never been pressed.
    if (agent.status === 'stopping' || (await stopRequested(this.ctx.storage))) {
      agent.status = 'stopping';
      await this.finishRun(agent, 'stopped');
      return;
    }
    // if the model has spent several steps without changing anything, steer it
    const BUILD_TOOLS = ['create_instances', 'edit_script', 'set_properties', 'delete_instances', 'run_luau', 'move_instances'];
    const built = agent.trace.some((t) => BUILD_TOOLS.includes(t.tool) && t.ok);
    if (!built && agent.step >= 2) {
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
  private refuseAbusive(text: string): boolean {
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
    if (verdict.action === 'allow') return false;
    recordEvent({
      kind: 'error',
      scope: 'chat:ingress',
      errorKind: verdict.action === 'refuse' ? 'abuse_refused' : 'abuse_throttled',
      message: verdict.signals.map((s) => `${s.code}: ${s.detail}`).join(' | '),
    });
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
    if (ctx.libraryAssetIds?.size) agent.libraryAssetIds = [...ctx.libraryAssetIds].slice(-CAP);
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
    error?: string,
  ) {
    agent.status = 'idle';

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
    //   Clearing it here puts those ops back on the `runId === undefined` path, which
    //   partitionOpsByRun keeps — an op that belonged to no run cannot belong to an ended one.
    //   A5 is untouched: ops queued DURING a run still carry that run's id, and runStep
    //   re-establishes the field on every step, so an eviction mid-run cannot land here. ]]
    this.currentMsgId = undefined;
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
    // Placed AFTER the currentMsgId clear above on purpose: op-attribution.test.mjs reads the head
    // of this method for that line, and burying it under a block this long made the guard go red.
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
        error: error ?? (reason === 'stopped' ? 'stopped by you' : `the run ended (${reason})`),
        now: Date.now(),
      });
      this.emitPlaytest();
    }

    // 'incomplete' OVERRIDES the model's own text rather than appending to it, which is the whole
    // point: on the run this was written for, that text was the single word "Done." A reply that
    // reports work which did not happen is worse than an error, because the user has no reason to
    // check. The tool trace is still attached, so the timeline shows exactly what was attempted.
    const content =
      reason === 'incomplete'
        ? 'I did not change anything in your project. I looked around but never made the edit you ' +
          'asked for, which is a fault on my side rather than a result. Nothing was modified, so ' +
          'there is nothing to undo — ask me again and I will build it.'
        : agent.finalText || (reason === 'stopped' ? 'Stopped.' : 'Done.');
    if (content !== agent.streamedText) {
      // make sure fallback/step-limit text reaches clients that saw no delta for it
      this.broadcast({ type: 'delta', msgId: agent.msgId, text: agent.streamedText ? '\n' + content : content });
    }
    this.sql.exec(
      `insert into messages(id, role, mode, content, tool_trace, created_at) values(?,?,?,?,?,?)`,
      agent.msgId,
      'assistant',
      agent.mode,
      content,
      JSON.stringify(agent.trace),
      Date.now(),
    );
    await this.persistAgent(agent);
    // The settled cost of the whole run. Read here, after the last `quotaSpend`, because every
    // earlier broadcast of this number was taken before that step's settlement and was therefore
    // an under-count of what the user had actually been charged.
    this.broadcast({ type: 'msg_end', msgId: agent.msgId, stopReason: reason, error, creditsSpent: agent.creditsSpent });

    // BUILD LOG. One event per run, written from the branch that actually ended it, so `outcome` is
    // the reason recorded rather than a guess made later from the reply text. `neuronsUsed` is
    // `number | undefined` on a run persisted by an older deploy: it is passed through as null, and
    // the cost rollup reports that run as unreadable instead of adding a zero to the total.
    recordEvent({
      kind: 'build',
      outcome: reason,
      steps: agent.step,
      opsApplied: agent.trace.filter((t) => t.ok).length,
      opsFailed: agent.trace.filter((t) => !t.ok).length,
      durationMs: Date.now() - agent.startedAt,
      neurons: agent.neuronsUsed ?? null,
      actorId: agent.userId,
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
    if (agent.userId && this.boundProjectId) {
      // 'stopped' is the user pressing stop, which is not a failure and does not need reporting
      // back to the person who pressed it. 'quota' is: the run ended without doing the work.
      const failed = reason === 'error' || reason === 'incomplete' || reason === 'quota';
      const outcome = notify(this.env, {
        kind: failed ? 'run_failed' : 'run_complete',
        recipientId: agent.userId,
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
      if (this.ctx.waitUntil) this.ctx.waitUntil(outcome);
      else await outcome;
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
        if (this.ctx.waitUntil) this.ctx.waitUntil(usage);
        else await usage;
      }
    }

    // A Durable Object's isolate can be evicted the moment it goes idle, and a run ending is
    // exactly when that happens — so this one flushes rather than waiting for a threshold.
    if (this.ctx.waitUntil) this.ctx.waitUntil(flushEvents(this.env).then(() => undefined));
    else await flushEvents(this.env);
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
      this.ctx.waitUntil?.(this.updateMemory(agent).catch(() => {}));
      if (!this.ctx.waitUntil) await this.updateMemory(agent).catch(() => {});
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
      libraryAssetIds: new Set(agent?.libraryAssetIds ?? []),
      env: this.env,
      projectId: this.boundProjectId ?? undefined,
      assetSources: this.pinnedPrefs?.asset_sources ?? undefined,
      studioConnected: () => this.opQueue.length < 100 && this.pluginSeenRecently,
      execStudioOp: (op, timeoutMs) => this.execStudioOp(op, timeoutMs),
      createCheckpoint: (label, kind) => this.createCheckpoint(label, kind),
      restoreCheckpoint: (id: string) => this.restoreCheckpoint(id),
      // Frames go to the browser and nowhere else. They are deliberately not
      // persisted: a run's worth of uncompressed RGB would be tens of megabytes
      // in DO storage to show something the user was already watching. A client
      // that reconnects mid-run gets the trace, the ring buffer, and the pixels
      // still in it — not the whole history.
      emitFrame: (frame) => {
        this.publishFrame(frame, { recompress: false });
      },
      playtest: this.playtestBus(),
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

  private pluginSeenRecently = false;
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
  private playtestBus(): PlaytestBus {
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
        );
        const data = res.ok ? (res.data as RenderViewResult & { error?: string }) : null;
        const view = data?.views?.[0];
        if (!view?.rgbBase64) {
          this.playtestRun = advance(run, { droppedFrame: true });
          this.emitPlaytest();
          return false;
        }
        const delivered = this.publishFrame(
          {
            rgbBase64: view.rgbBase64,
            width: view.meta.width,
            height: view.meta.height,
            view: view.name,
            subject: data?.subject ?? 'game.Workspace',
            capturedAt: Date.now(),
          },
          { recompress: true, playtestRunId: run.id },
        );
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

  private async execStudioOp(studioOp: StudioOp, timeoutMs = 30_000): Promise<OpResult> {
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

  private async handlePluginPoll(
    body: PluginPollRequest,
    reported: { version: string | null; protocol: number | null } = { version: null, protocol: null },
  ): Promise<Response> {
    const wasConnected = await this.pluginConnected();
    // the plugin polls every ~0.4-2.5s; persisting the heartbeat every time is pure write
    // amplification. Keep it in memory and only checkpoint it to storage every few seconds.
    const now = Date.now();
    this.pluginSeenRecently = true;
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
    const admission = placeAdmission(this.boundPlace, readPlaceReport(body.state), Date.now());
    if (admission.verdict === 'bind' || (admission.verdict === 'match' && admission.changed)) {
      this.boundPlace = admission.place;
      await this.ctx.storage.put<StudioPlace>('pluginPlace', admission.place);
    }
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
    const agent = await this.ctx.storage.get<AgentState>('agent');
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
    const running = agent?.status === 'running';
    const idleFor = Date.now() - (await this.lastActivityAt());
    const parked = !running && idleFor > POLL_IDLE_AFTER_MS;
    const holdMs = running ? POLL_HOLD_ACTIVE_MS : POLL_HOLD_WARM_MS;

    // Parked: return at once and let the plugin sleep. The cost of not holding is that an op
    // queued during that sleep waits for the next poll — bounded by POLL_WAIT_IDLE_MS, and only
    // ever paid on the first op after several minutes of silence.
    if (!parked && !this.opQueue.length) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, holdMs);
        this.pollWaiter = () => {
          clearTimeout(t);
          this.pollWaiter = null;
          resolve();
        };
      });
    }

    // Backstop for the purge in finishRun. The queue is persisted, so a Durable Object that
    // restarts between a run ending and the next poll would otherwise hand the plugin ops from
    // a run nobody is waiting on.
    await this.dropOpsForEndedRuns(agent?.status === 'running' ? agent.msgId : undefined);

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
    const ops = this.opQueue.splice(0, 10);
    if (ops.length) await this.ctx.storage.put('opQueue', this.opQueue);
    const waitMs = running ? 400 : parked ? POLL_WAIT_IDLE_MS : 1000;
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
  ): Promise<CheckpointMeta | { error: string }> {
    const authorId = meta2.authorId ?? null;
    const description = (meta2.description ?? '').trim().slice(0, MAX_CHECKPOINT_DESCRIPTION) || null;
    if (!(await this.pluginConnected())) return { error: 'Studio is not connected — connect Studio to create checkpoints.' };
    const snap = await this.execStudioOp({ op: 'snapshot', root: 'game', includeScripts: true }, 60_000);
    if (!snap.ok) return { error: snap.error ?? 'snapshot failed' };
    const payload = JSON.stringify(snap.data);
    if (payload.length > MAX_SNAPSHOT_BYTES) {
      return { error: `This project is too large to checkpoint (${Math.round(payload.length / 1e6)} MB). Apple still edits it normally — use Studio's own undo for large rollbacks.` };
    }
    const gz = await gzip(payload);
    const id = crypto.randomUUID();
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
      `insert into checkpoints(id, label, kind, script_count, instance_count, size_bytes, created_at, author_id, description) values(?,?,?,?,?,?,?,?,?)`,
      id,
      label,
      kind,
      meta.scriptCount ?? 0,
      meta.instanceCount ?? 0,
      gz.byteLength,
      Date.now(),
      authorId,
      description,
    );
    // retention: keep last 25
    this.sql.exec(
      `delete from checkpoint_chunks where checkpoint_id in (select id from checkpoints order by created_at desc limit -1 offset 25)`,
    );
    this.sql.exec(`delete from checkpoints where id in (select id from checkpoints order by created_at desc limit -1 offset 25)`);
    const cp: CheckpointMeta = {
      id,
      label,
      kind,
      createdAt: Date.now(),
      scriptCount: meta.scriptCount ?? 0,
      instanceCount: meta.instanceCount ?? 0,
      sizeBytes: gz.byteLength,
      authorId,
      description,
    };
    this.broadcast({ type: 'checkpoint', checkpoint: cp });
    return cp;
  }

  async restoreCheckpoint(id: string): Promise<{
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
    const jsonStr = await gunzip(buf);
    say('applying');
    const applied = await this.execStudioOp({ op: 'restore', root: 'game', snapshot: JSON.parse(jsonStr) }, 120_000);
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
    say('done', { fidelity });
    return { ok: true, fidelity };
  }

  private async quotaSpend(userId: string, credits: number, kind: string): Promise<{ ok: boolean; state: QuotaState }> {
    const stub = this.env.QUOTA_DO.get(this.env.QUOTA_DO.idFromName(userId));
    const res = await stub.fetch('https://do/spend', { method: 'POST', body: JSON.stringify({ credits, kind }) });
    const data = (await res.json()) as { ok: boolean; state: QuotaState };
    return data;
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
