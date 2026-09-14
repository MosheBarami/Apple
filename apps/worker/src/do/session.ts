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
  CheckpointMeta,
  GolemMode,
  GatewayRequest,
  ToolTraceEntry,
  QuotaState,
  RunIntent,
  StudioFrame,
  PlaytestRun,
  RenderViewResult,
} from '@golem/shared';
import {
  admitFrame,
  FrameRate,
  FrameRing,
  PLAYTEST_FRAME_HEIGHT,
  PLAYTEST_FRAME_WIDTH,
  type RawFrame,
} from '../frame-bus';
import { advance, isTerminal, startPlaytest } from '../playtest-stream';
import { sparksForNeurons } from '../pricing';
import { chat as llmChat, BudgetError, RateLimitedError } from '../gateway';
import { systemPrompt, collapseArtDirection, MEMORY_UPDATE_PROMPT } from '../prompts';
import { designBrief } from '../design-brief';
import { toolDefs, toolNames, runTool, type AgentCtx, type PlaytestBus } from '../tools';
import { critiqueToText } from '../vision';
import { toolsForMode } from '../router';
import { assetLibraryAvailable } from '../asset-library';
import { chooseEffort, classifyRequest, tokensForEffort, type ReasoningSignals, type Effort } from '../reasoning';
import { phaseForTool, type AgentPhase, type RunSnapshot, type RunSnapshotTool } from '@golem/shared';
import { trimTranscript } from '../transcript';
import { persistWithShedding } from '../persist';
import { clearStop, requestStop, stopRequested } from '../stop-signal';
import { singleFlight } from '../single-flight';
import { sceneSignature, shouldRebuild, semanticCheck, intentCheck, type PassRecord } from '../semantic';
import { readPluginHeaders, clientNotice, sanitizeVersion, parseProtocol, type PluginClientInfo, type PluginCompatibility } from '../plugin-version';
import { partitionOpsByRun } from '../op-attribution';

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
  sparksSpent: number;
  /** neurons this run has consumed, so Sparks round once per run instead of once per call */
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
const STEP_STALE_MS = 180_000;

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
const MAX_PROMPT_CHARS = 24_000; // ~7k tokens; the transcript is re-sent every step

// ---------------------------------------------------------------------------------------------
// THE INTENT AND PLAN ROWS OF THE THINKING CARD.
//
// The card has four stages. Actions and Validation were already backed by real events — a tool
// start/end pair, and the composition/semantic gate's actual verdict. Intent and Plan were not
// backed by anything, so the frontend rendered nothing rather than inventing them.
//
// This closes that gap AT ZERO MODEL COST. `intentCheck` in semantic.ts is regex and lexicons:
// the file has no imports at all and no reference to fetch, the gateway or env, so there is no
// path from here to a paid provider. It runs in well under a millisecond on an 8,000-character
// request, which is why it can be on the critical path of every single run.
//
// The honesty rules, which are the whole point:
//
//   summary   The user's OWN OPENING SENTENCE, whitespace-normalised and truncated. Not a
//             paraphrase — paraphrasing needs a model, and this must stay free. Not a synthesised
//             sentence either: without a model, any synthesis is a fill-in-the-blanks template
//             ("Build a <noun> with <n> features"), which reads like understanding while proving
//             none. Echoing the request verbatim is the only restatement that cannot be wrong,
//             and it is exactly what the reference card shows.
//   checklist EXACTLY what the extractor found the user asked for by name, and nothing else. An
//             empty checklist is the correct answer for "what does this script do?" — there is
//             no list of things to build, so no list is shown.
//   questions ONLY the places the extractor could see the request genuinely did not settle
//             (a hedged clause, a building noun that reads as either a room or a facade). Never
//             padded to look thorough.
//
// Both lists are capped. A cap TRUNCATES a real list to bound the socket payload; nothing here
// ever pads a short one.
// ---------------------------------------------------------------------------------------------
const MAX_INTENT_CHECKLIST = 16;
const MAX_INTENT_QUESTIONS = 6;
const MAX_INTENT_SUMMARY = 160;

/** Split on sentence punctuation without lookbehind, keeping the terminator. */
function sentences(flat: string): string[] {
  const out: string[] = [];
  const re = /[.!?]+(?:\s|$)/g;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(flat))) {
    out.push(flat.slice(start, m.index + m[0].trimEnd().length).trim());
    start = re.lastIndex;
  }
  if (start < flat.length) out.push(flat.slice(start).trim());
  return out.filter(Boolean);
}

/**
 * The one-line restatement: the user's own words, normalised and cut at a word boundary.
 *
 * Prefers the first sentence that carries at least three words, so an opening "Hey!" or "Ok."
 * does not become the whole Intent row. Returns '' when the request has no words at all, and the
 * caller then emits nothing rather than an empty row.
 */
function restate(request: string): string {
  const flat = request.replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  const parts = sentences(flat);
  const pick = parts.find((s) => s.split(' ').length >= 3) ?? parts[0] ?? flat;
  if (pick.length <= MAX_INTENT_SUMMARY) return pick;
  const cut = pick.slice(0, MAX_INTENT_SUMMARY);
  const space = cut.lastIndexOf(' ');
  return `${(space > 40 ? cut.slice(0, space) : cut).replace(/[,;:.\s]+$/, '')}…`;
}

/**
 * What the agent understood, derived from the request alone. Null only when there is genuinely
 * nothing to say — an empty request produces no Intent row rather than a blank one.
 */
function runIntentFor(request: string): RunIntent | null {
  const report = intentCheck(request);
  const summary = restate(request);
  const checklist = report.checklist.slice(0, MAX_INTENT_CHECKLIST);
  const questions = report.questions.slice(0, MAX_INTENT_QUESTIONS);
  if (!summary && !checklist.length && !questions.length) return null;
  return { summary, checklist, questions };
}

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
      const userId = req.headers.get('X-User-Id');
      if (userId !== bind.ownerId) return json({ error: 'forbidden' }, 403);
      // the JWT is kept only in memory for the lifetime of this DO instance so a
      // background memory sync can use it; it is never written to durable storage
      const jwt = req.headers.get('X-User-Jwt');
      if (jwt) this.liveJwt = jwt;
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      this.ctx.acceptWebSocket(server, ['client']);
      const quota = await this.quotaState(bind.ownerId);
      server.send(
        JSON.stringify({
          type: 'hello',
          sessionId: bind.projectId,
          studioConnected: await this.pluginConnected(),
          quota,
        } satisfies ServerMsg),
      );
      const st = await this.ctx.storage.get<StudioEventState>('pluginState');
      if (st) server.send(JSON.stringify({ type: 'studio_status', connected: await this.pluginConnected(), state: st } satisfies ServerMsg));
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
      const body = (await req.json()) as { tokenHash: string; pluginVersion?: string; pluginProtocol?: string };
      // a fresh pairing supersedes any previous plugin token for this project
      await this.ctx.storage.put({ pluginTokenHash: body.tokenHash, pluginTokenIssuedAt: Date.now() });
      // Record what paired, at the moment it paired, so the server knows what it is
      // talking to before the first poll rather than after it. A plugin that reports
      // nothing simply leaves this unknown, which every consumer already handles.
      await this.recordPluginClient(sanitizeVersion(body.pluginVersion), parseProtocol(body.pluginProtocol));
      return json({ ok: true });
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
      if (!expect || Date.now() - issuedAt > PLUGIN_TOKEN_TTL_MS) return json({ error: 'token expired' }, 401);
      if (!(await timingSafeEqual(await sha256hex(token), expect))) return json({ error: 'invalid token' }, 401);
      const reported = readPluginHeaders(req.headers);
      const body = (await req.json()) as PluginPollRequest;
      return this.handlePluginPoll(body, reported);
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

    if (path === '/checkpoints' && req.method === 'GET') {
      const rows = this.sql
        .exec(`select id, label, kind, script_count, instance_count, size_bytes, created_at from checkpoints order by created_at desc limit 50`)
        .toArray() as { id: string; label: string; kind: string; script_count: number; instance_count: number; size_bytes: number; created_at: number }[];
      return json({
        checkpoints: rows.map((r) => ({
          id: r.id,
          label: r.label,
          kind: r.kind as CheckpointMeta['kind'],
          createdAt: r.created_at,
          scriptCount: r.script_count,
          instanceCount: r.instance_count,
          sizeBytes: r.size_bytes,
        })),
      });
    }

    if (path === '/checkpoint' && req.method === 'POST') {
      const { label } = (await req.json()) as { label: string };
      const res = await this.createCheckpoint((label || 'manual checkpoint').slice(0, 60), 'manual');
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
      await this.startRun(bind, text.slice(0, 8000), mode ?? 'stone', effort);
      return json({ ok: true, started: true, mode: mode ?? 'stone', effort: effort ?? 'adaptive' });
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

    if (path === '/studio-op' && req.method === 'POST') {
      const { op, timeoutMs } = (await req.json()) as { op: StudioOp; timeoutMs?: number };
      if (!(await this.pluginConnected())) return json({ ok: false, error: 'Studio is not connected' }, 409);
      return json(await this.execStudioOp(op, Math.min(timeoutMs ?? 45_000, 120_000)));
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

    switch (msg.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' } satisfies ServerMsg));
        return;
      case 'resume':
        // Previously declared in the protocol and silently unhandled.
        ws.send(JSON.stringify({ type: 'run_state', run: await this.runSnapshot() } satisfies ServerMsg));
        return;
      case 'chat':
        await this.startRun(bind, msg.text.slice(0, 8000), msg.mode);
        return;
      case 'stop': {
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
        const res = await this.createCheckpoint(msg.label.slice(0, 60) || 'checkpoint', 'manual');
        if ('error' in res) this.broadcast({ type: 'error', code: 'checkpoint', message: res.error });
        return;
      }
      case 'checkpoint_restore': {
        const res = await this.restoreCheckpoint(msg.checkpointId);
        if (!res.ok) this.broadcast({ type: 'error', code: 'restore', message: res.error ?? 'restore failed' });
        return;
      }
    }
  }

  async webSocketClose() {
    /* hibernation-friendly: nothing to clean */
  }

  // ------------------------------------------------------------------ agent run

  /** Admits one startRun at a time. See the comment on startRun. */
  private readonly startGate = singleFlight();

  /**
   * Start a run, at most one at a time.
   *
   * Durable Objects are single-threaded, but this function awaits — and the storage read that
   * decides whether a run is already in flight is one of the things it awaits. Two `chat`
   * frames arriving together both saw an idle agent, so both spent a Spark, both inserted a
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
  ) {
    const attempt = await this.startGate(() => this.startRunInner(bind, text, mode, forcedEffort));
    if (!attempt.ran) {
      this.broadcast({ type: 'error', code: 'busy', message: 'Golem is already working — stop the current run first.' });
    }
  }

  private async startRunInner(
    bind: { projectId: string; projectName: string; ownerId: string },
    text: string,
    mode: GolemMode,
    forcedEffort?: Effort,
  ) {
    const existing = await this.ctx.storage.get<AgentState>('agent');
    if (existing && existing.status !== 'idle' && Date.now() - existing.lastStepAt < STEP_STALE_MS) {
      this.broadcast({ type: 'error', code: 'busy', message: 'Golem is already working — stop the current run first.' });
      return;
    }
    // Clear any stop left behind by a previous run. Belt and braces with finishRun's clear:
    // a stop that arrives in the moment a run is finishing can land after that clear, and it
    // must not travel into the run the user starts next.
    await clearStop(this.ctx.storage);

    // Sparks are billed from measured usage after each model call, so entering a run only
    // requires having some balance left — the user is never charged for an estimate.
    const quota = await this.quotaSpend(bind.ownerId, 1, `chat_${mode}`);
    if (!quota.ok) {
      this.broadcast({ type: 'error', code: 'quota', message: 'Daily Sparks are used up. They refill at midnight UTC.' });
      this.broadcast({ type: 'quota', quota: quota.state });
      return;
    }
    this.broadcast({ type: 'quota', quota: quota.state });

    const userMsgId = crypto.randomUUID();
    this.sql.exec(`insert into messages(id, role, mode, content, created_at) values(?,?,?,?,?)`, userMsgId, 'user', mode, text, Date.now());

    const memory = (await this.ctx.storage.get<{ summary: string | null; facts: string[] }>('memory')) ?? { summary: null, facts: [] };
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
    const sys = systemPrompt({
      mode,
      studioConnected,
      assetLibraryAvailable: await assetLibraryAvailable(this.env),
      placeName: pluginState?.placeName ?? null,
      projectName: bind.projectName,
      memorySummary: memory.summary,
      memoryFacts: memory.facts,
      // The art-direction brief is ~1,800 tokens on every step, so only visual requests pay for
      // it. The request text doubles as the scene-kind hint — resolveKind matches on substrings.
      sceneKind: traits.visualDesignTask && mode !== 'clay' ? text : undefined,
      //[[ Same gate as sceneKind, on the trait that means INTERFACE rather than place.
      //   `designBrief` returns null when the library has nothing useful for this
      //   request, and null is a real answer: the library covers a fraction of the
      //   style families §L asks for, and padding a thin match into a prompt would
      //   spend tokens on every step to tell the model what it did not need. ]]
      uiBrief: traits.uiDesignTask && mode !== 'clay' ? (designBrief(text)?.text ?? null) : null,
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
      sparksSpent: 1,
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
    // three minutes of "Golem is already working" before a new run could start.
    //
    // The returned error was also being discarded. A checkpoint is the user's undo point, so
    // failing to take one is worth saying out loud — but it is not a reason to refuse to work,
    // and silently pressing on is the thing this codebase keeps getting wrong.
    if (studioConnected && mode !== 'clay') {
      try {
        const checkpoint = await this.createCheckpoint('before Golem changes', 'pre_agent'); // broadcasts internally
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
          `Golem has reached today's shared building capacity, so I stopped here. Everything I finished is saved — your project and checkpoints are untouched. Capacity resets in about ${hours} hour${hours === 1 ? '' : 's'} (midnight UTC), and you can pick up right where we left off.`;
        this.broadcast({ type: 'error', code: 'capacity', message: `Golem is at capacity for today. Resets in ~${hours}h (midnight UTC).` });
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

    if (agent.step > agent.maxSteps) {
      agent.finalText = agent.finalText || 'I reached the step limit for this run. Progress so far is saved — send another message to continue.';
      await this.finishRun(agent, 'done');
      return;
    }
    if (agent.step > 1) {
      const state = await this.quotaState(agent.userId);
      if (state.sparksRemaining <= 0) {
        agent.finalText = agent.finalText || 'I paused because your daily Sparks ran out. Progress is saved.';
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
    agent.llm = trimTranscript(agent.llm, MAX_PROMPT_CHARS);
    await this.persistAgent(agent);
    // The opening phase of a step is 'understanding' on the first step and
    // otherwise carries whatever the previous tool left us in, until the next
    // tool call renames it. Never invent a stage the agent has not entered.
    agent.phase = agent.step === 1 ? (agent.mode === 'clay' ? 'understanding' : 'planning') : (agent.phase ?? 'building');
    this.broadcast({ type: 'agent_status', phase: agent.phase, step: agent.step, totalSteps: agent.maxSteps, sparksSpent: agent.sparksSpent });

    const studioConnected = await this.pluginConnected();
    const allowed = toolsForMode(agent.mode, studioConnected, toolNames());

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
      sparksSpent: agent.sparksSpent,
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
      { kind: `${agent.mode}:step:${choice.effort}`, sessionId: this.ctx.id.toString() },
    );
    //[[ Same reason as seenCalls: this holds raw tool arguments verbatim and is persisted.
    //   Only the most recent turn's calls are ever read, so keeping more is pure weight. ]]
    agent.lastCalls = (res.toolCalls ?? []).slice(-8);
    // Signals are recomputed from what actually happens each step, so an escalation lapses once
    // the problem it was bought for is resolved.
    agent.priorStepFailed = false;
    agent.visualDefectsFound = false;

    // Sparks track real spend: charge the difference between what this call actually cost
    // and the 1 Spark already taken for the step. Users are never billed for our estimate.
    // Round Sparks once per RUN, not once per call: otherwise a run of five small calls costs
    // five whole Sparks when the compute used barely fills one.
    agent.neuronsUsed = (agent.neuronsUsed ?? 0) + res.neurons;
    const owed = sparksForNeurons(agent.neuronsUsed) - agent.sparksSpent;
    if (owed > 0) {
      const settle = await this.quotaSpend(agent.userId, owed, `usage_${agent.mode}`);
      agent.sparksSpent += owed;
      if (!settle.ok) {
        // they have run out mid-run: finish this step's work, then stop cleanly
        agent.finalText =
          (res.text || agent.finalText || '') +
          '\n\nThat used the last of your Sparks for today. Everything so far is saved — they refill at midnight UTC.';
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
      // fence tool output as untrusted data — it can contain attacker-authored text
      agent.llm.push({
        role: 'tool',
        content: `[${call.name}]\n<untrusted-tool-output id="${agent.fenceId ?? ''}" tool="${call.name}">\n${out.resultForLlm}\n</untrusted-tool-output>`,
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
    this.broadcast({ type: 'msg_end', msgId: agent.msgId, stopReason: reason, error });
    // background memory distillation (only after substantive runs)
    if (agent.trace.length > 2 && reason === 'done') {
      // Distillation is Golem's own housekeeping: it counts against the GLOBAL neuron budget
      // (so it can never create an uncontrolled bill) but is not charged to the user's Sparks.
      const budgetLeft = await this.quotaState(agent.userId);
      if (budgetLeft.sparksRemaining <= 0) return;
      this.ctx.waitUntil?.(this.updateMemory().catch(() => {}));
      if (!this.ctx.waitUntil) await this.updateMemory().catch(() => {});
    }
  }

  private async updateMemory() {
    const memory = (await this.ctx.storage.get<{ summary: string | null; facts: string[] }>('memory')) ?? { summary: null, facts: [] };
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
      if (parsed.summary) {
        const facts = Array.isArray(parsed.facts) ? parsed.facts.slice(0, 12).map(String) : memory.facts;
        await this.ctx.storage.put('memory', { summary: parsed.summary.slice(0, 3000), facts });
        // best-effort sync to Supabase registry with the user's own JWT
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
            body: JSON.stringify({ memory_summary: parsed.summary.slice(0, 3000), memory_facts: facts, last_activity_at: new Date().toISOString() }),
          }).catch(() => {});
        }
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
        const memory = (await this.ctx.storage.get<{ summary: string | null; facts: string[] }>('memory')) ?? { summary: null, facts: [] };
        memory.facts = [...memory.facts.filter((f) => f !== fact), fact].slice(-24);
        await this.ctx.storage.put('memory', memory);
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
        `insert into oplog(op_id, kind, ok, summary, created_at) values(?,?,?,?,?)`,
        'frame',
        'frame_rejected',
        0,
        `${verdict.reason}: ${verdict.detail}`.slice(0, 200),
        Date.now(),
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
        waiter({ id: op.id, ok: false, error: 'The run this change belonged to has ended' });
      }
    }
    return dropped.length;
  }

  private async execStudioOp(studioOp: StudioOp, timeoutMs = 30_000): Promise<OpResult> {
    if (!(await this.pluginConnected())) {
      return { id: 'none', ok: false, error: 'Studio is not connected' };
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
        resolve({ id: op.id, ok: false, error: `Studio did not respond within ${Math.round(timeoutMs / 1000)}s` });
      }, timeoutMs);
      this.opWaiters.set(op.id, (r) => {
        clearTimeout(timer);
        resolve(r);
      });
    });
    this.sql.exec(
      `insert into oplog(op_id, kind, ok, summary, created_at) values(?,?,?,?,?)`,
      op.id,
      studioOp.op,
      result.ok ? 1 : 0,
      result.error?.slice(0, 200) ?? '',
      Date.now(),
    );
    return result;
  }

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
    if (!wasConnected) {
      const st = body.state ?? (await this.ctx.storage.get<StudioEventState>('pluginState'));
      this.broadcast({ type: 'studio_status', connected: true, state: st ?? undefined });
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

  // ------------------------------------------------------------------ checkpoints
  async createCheckpoint(label: string, kind: CheckpointMeta['kind']): Promise<CheckpointMeta | { error: string }> {
    if (!(await this.pluginConnected())) return { error: 'Studio is not connected — connect Studio to create checkpoints.' };
    const snap = await this.execStudioOp({ op: 'snapshot', root: 'game', includeScripts: true }, 60_000);
    if (!snap.ok) return { error: snap.error ?? 'snapshot failed' };
    const payload = JSON.stringify(snap.data);
    if (payload.length > MAX_SNAPSHOT_BYTES) {
      return { error: `This project is too large to checkpoint (${Math.round(payload.length / 1e6)} MB). Golem still edits it normally — use Studio's own undo for large rollbacks.` };
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
      `insert into checkpoints(id, label, kind, script_count, instance_count, size_bytes, created_at) values(?,?,?,?,?,?,?)`,
      id,
      label,
      kind,
      meta.scriptCount ?? 0,
      meta.instanceCount ?? 0,
      gz.byteLength,
      Date.now(),
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
    };
    this.broadcast({ type: 'checkpoint', checkpoint: cp });
    return cp;
  }

  async restoreCheckpoint(id: string): Promise<{
    ok: boolean;
    error?: string;
    /** What the plugin reports it actually put back. Absent when the op never reached Studio. */
    fidelity?: {
      instancesCreated: number;
      scriptsRestored: number;
      scriptsExpected: number;
      failedInstances: number;
      failedScripts: number;
      failedProperties: number;
    };
    /** A caveat worth showing the user even though the restore succeeded. */
    note?: string;
  }> {
    if (!(await this.pluginConnected())) return { ok: false, error: 'Studio is not connected' };
    const chunks = this.sql.exec(`select data from checkpoint_chunks where checkpoint_id = ? order by idx`, id).toArray() as { data: ArrayBuffer }[];
    if (!chunks.length) return { ok: false, error: 'checkpoint not found' };
    const total = chunks.reduce((n, c) => n + c.data.byteLength, 0);
    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      buf.set(new Uint8Array(c.data), off);
      off += c.data.byteLength;
    }
    const jsonStr = await gunzip(buf);
    const applied = await this.execStudioOp({ op: 'restore', root: 'game', snapshot: JSON.parse(jsonStr) }, 120_000);
    if (!applied.ok) return { ok: false, error: applied.error };

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
      return { ok: true, fidelity, note: 'This Studio plugin is too old to report what it restored, so the result could not be verified.' };
    }

    if (!d.restored) {
      return { ok: false, error: d.error ?? 'restore incomplete', fidelity };
    }

    // Every instance and script came back, but properties can still have failed — and a part with
    // the wrong Size and CFrame is not the part the user checkpointed. Successful, with a caveat
    // the UI is expected to show.
    if (fidelity.failedProperties > 0) {
      return {
        ok: true,
        fidelity,
        note: `Restored, but ${fidelity.failedProperties} propert${fidelity.failedProperties === 1 ? 'y' : 'ies'} could not be set — some objects may differ from the checkpoint.`,
      };
    }
    return { ok: true, fidelity };
  }

  private async quotaSpend(userId: string, sparks: number, kind: string): Promise<{ ok: boolean; state: QuotaState }> {
    const stub = this.env.QUOTA_DO.get(this.env.QUOTA_DO.idFromName(userId));
    const res = await stub.fetch('https://do/spend', { method: 'POST', body: JSON.stringify({ sparks, kind }) });
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
