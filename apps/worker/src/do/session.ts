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
} from '@golem/shared';
import { MODE_INFO } from '@golem/shared';
import { sparksForNeurons } from '../pricing';
import { chat as llmChat, BudgetError, RateLimitedError } from '../gateway';
import { systemPrompt, MEMORY_UPDATE_PROMPT } from '../prompts';
import { toolDefs, toolNames, runTool, type AgentCtx } from '../tools';
import { critiqueToText } from '../vision';
import { toolsForMode } from '../router';
import { chooseEffort, classifyRequest, tokensForEffort, type ReasoningSignals, type Effort } from '../reasoning';
import { trimTranscript } from '../transcript';

interface AgentState {
  status: 'idle' | 'running' | 'stopping';
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
  traits?: Pick<ReasoningSignals, 'visualDesignTask' | 'multiSystemTask' | 'ambiguousRequest'>;
  /** pins the reasoning tier for the whole run; set only by the A/B harness, never in production */
  forcedEffort?: Effort;
  /** a mutating tool has succeeded this run, so there is something to show for it */
  mutated?: boolean;
  /** how many times this run has been steered back to work after replying without acting */
  nudges?: number;
  /** the user's request, kept so the automatic visual gate can judge against the actual intent */
  request?: string;
  /** the visual gate has already run once this run — it is charged once, never in a loop */
  autoCritiqued?: boolean;
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
const PLUGIN_TIMEOUT_MS = 9000;
const STEP_STALE_MS = 180_000;
const PLUGIN_TOKEN_TTL_MS = 30 * 24 * 3600 * 1000; // 30 days, then re-pair
const MAX_SNAPSHOT_BYTES = 12 * 1024 * 1024; // refuse absurd checkpoints
const MAX_PROMPT_CHARS = 24_000; // ~7k tokens; the transcript is re-sent every step

export class SessionDO extends DurableObject<Env> {
  private sql = this.ctx.storage.sql;
  private opQueue: PendingOp[] = [];
  private opWaiters = new Map<string, (r: OpResult) => void>();
  private pollWaiter: (() => void) | null = null;
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
    });
  }

  // ------------------------------------------------------------------ helpers
  private async bind(): Promise<{ projectId: string; projectName: string; ownerId: string } | null> {
    return (await this.ctx.storage.get('bind')) ?? null;
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

  private async pluginConnected(): Promise<boolean> {
    const stored = (await this.ctx.storage.get<number>('pluginLastSeen')) ?? 0;
    const last = Math.max(stored, this.lastSeenWrittenAt);
    return Date.now() - last < 8000;
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
      // browsers abort the handshake unless a requested subprotocol is echoed back
      return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'golem.v1' } });
    }

    if (path === '/plugin/register' && req.method === 'POST') {
      const { tokenHash } = (await req.json()) as { tokenHash: string };
      // a fresh pairing supersedes any previous plugin token for this project
      await this.ctx.storage.put({ pluginTokenHash: tokenHash, pluginTokenIssuedAt: Date.now() });
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
      const body = (await req.json()) as PluginPollRequest;
      return this.handlePluginPoll(body);
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
      case 'chat':
        await this.startRun(bind, msg.text.slice(0, 8000), msg.mode);
        return;
      case 'stop': {
        const agent = await this.ctx.storage.get<AgentState>('agent');
        if (agent && agent.status === 'running') {
          agent.status = 'stopping';
          await this.ctx.storage.put('agent', agent);
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
  private async startRun(
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
    const sys = systemPrompt({
      mode,
      studioConnected,
      placeName: pluginState?.placeName ?? null,
      projectName: bind.projectName,
      memorySummary: memory.summary,
      memoryFacts: memory.facts,
      // The art-direction brief is ~1,800 tokens on every step, so only visual requests pay for
      // it. The request text doubles as the scene-kind hint — resolveKind matches on substrings.
      sceneKind: traits.visualDesignTask && mode !== 'clay' ? text : undefined,
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
    };
    await this.ctx.storage.put('agent', agent);
    this.broadcast({ type: 'msg_start', msgId, role: 'assistant', mode });
    this.broadcast({ type: 'agent_status', phase: mode === 'clay' ? 'thinking' : 'planning' });

    // auto-checkpoint before builder modes touch the project
    if (studioConnected && mode !== 'clay') {
      await this.createCheckpoint('before Golem changes', 'pre_agent'); // broadcasts internally
    }
    await this.ctx.storage.setAlarm(Date.now() + 10);
  }

  async alarm() {
    const agent = await this.ctx.storage.get<AgentState>('agent');
    if (!agent) return;
    if (agent.status === 'idle') return;
    if (agent.status === 'stopping') {
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
    const bind = (await this.bind())!;
    agent.step += 1;
    agent.lastStepAt = Date.now();

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
    agent.llm = trimTranscript(agent.llm, MAX_PROMPT_CHARS);
    await this.ctx.storage.put('agent', agent);
    this.broadcast({ type: 'agent_status', phase: 'working', step: agent.step, totalSteps: agent.maxSteps });

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

    const res = await llmChat(
      this.env,
      {
        model: agent.mode,
        messages: agent.llm,
        tools: toolDefs(studioConnected, allowed),
        reasoningEffort: choice.effort,
        maxTokens: tokensForEffort(MODE_BASE_TOKENS[agent.mode], choice.effort),
      },
      // Same affinity key for every step of the run, so Workers AI can reuse the prefill for the
      // identical system-prompt-and-tools prefix instead of recomputing ~5,200 tokens each step.
      // The DO id is per-project and opaque, so it is never shared across tenants.
      { kind: `${agent.mode}:step:${choice.effort}`, sessionId: this.ctx.id.toString() },
    );
    agent.lastCalls = res.toolCalls;
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
        this.broadcast({ type: 'agent_status', phase: 'working', step: agent.step, totalSteps: agent.maxSteps });
        const ctx2 = this.agentCtx();
        const out = await runTool(ctx2, 'inspect_visually', JSON.stringify({ intent: agent.request ?? 'the requested build' }));
        agent.trace.push({ tool: 'inspect_visually', summary: out.summary, ok: out.ok, durationMs: 0 });
        this.broadcast({ type: 'tool_end', msgId: agent.msgId, toolId: `auto_${agent.step}`, ok: out.ok, summary: out.summary });
        const critique = ctx2.lastCritique;
        if (critique && !critique.passed && !critique.unavailable) {
          agent.visualDefectsFound = true;
          agent.llm.push({
            role: 'user',
            content:
              `A visual review of the render you just produced did not pass:\n\n${critiqueToText(critique)}\n\n` +
              'Fix the blocking and major defects in what you already built. Do not start over.',
          });
          await this.ctx.storage.put('agent', agent);
          await this.ctx.storage.setAlarm(Date.now() + 10);
          return;
        }
      }

      const owesWork = agent.mode !== 'clay' && !agent.mutated && studioConnected;
      if (owesWork && (agent.nudges ?? 0) < MAX_NUDGES && agent.step < agent.maxSteps) {
        agent.nudges = (agent.nudges ?? 0) + 1;
        agent.llm.push({
          role: 'user',
          content:
            'You have not changed the project yet. Do not describe what you are about to do — do it now ' +
            'with a tool call, in this turn. If you were mid-sentence, carry out that action.',
        });
        await this.ctx.storage.put('agent', agent);
        await this.ctx.storage.setAlarm(Date.now() + 10);
        return;
      }
      await this.finishRun(agent, 'done');
      return;
    }

    // record the assistant turn with STRUCTURED tool calls; the gateway renders them in whatever
    // form the target model expects
    agent.llm.push({ role: 'assistant', content: res.text ?? '', toolCalls: res.toolCalls });

    const ctx = this.agentCtx();
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
      this.broadcast({ type: 'tool_start', msgId: agent.msgId, toolId, tool: call.name, summary: call.name });
      const out = await runTool(ctx, call.name, call.arguments);
      const entry: ToolTraceEntry = { tool: call.name, summary: out.summary, ok: out.ok, durationMs: Date.now() - t0 };
      agent.trace.push(entry);
      // Feed the outcome back to the reasoning policy: a failed tool or a failed visual gate
      // means the next step should think harder rather than repeat the same cheap attempt.
      if (!out.ok) agent.priorStepFailed = true;
      if (out.ok && MUTATING_TOOLS.has(call.name)) agent.mutated = true;
      if (ctx.lastCritique && !ctx.lastCritique.passed) agent.visualDefectsFound = true;
      this.broadcast({ type: 'tool_end', msgId: agent.msgId, toolId, ok: out.ok, summary: out.summary });
      // fence tool output as untrusted data — it can contain attacker-authored text
      agent.llm.push({
        role: 'tool',
        content: `[${call.name}]\n<untrusted-tool-output tool="${call.name}">\n${out.resultForLlm}\n</untrusted-tool-output>`,
        toolCallId: call.id,
        name: call.name,
      });
      const current = await this.ctx.storage.get<AgentState>('agent');
      if (current?.status === 'stopping') {
        agent.status = 'stopping';
        break;
      }
    }

    if (agent.status === 'stopping') {
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
    await this.ctx.storage.put('agent', agent);
    await this.ctx.storage.setAlarm(Date.now() + 10);
  }

  private async finishRun(agent: AgentState, reason: 'done' | 'stopped' | 'error' | 'quota', error?: string) {
    agent.status = 'idle';
    const content = agent.finalText || (reason === 'stopped' ? 'Stopped.' : 'Done.');
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
    await this.ctx.storage.put('agent', agent);
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
  private agentCtx(): AgentCtx {
    return {
      env: this.env,
      studioConnected: () => this.opQueue.length < 100 && this.pluginSeenRecently,
      execStudioOp: (op, timeoutMs) => this.execStudioOp(op, timeoutMs),
      createCheckpoint: (label, kind) => this.createCheckpoint(label, kind),
      addMemoryFact: async (fact) => {
        const memory = (await this.ctx.storage.get<{ summary: string | null; facts: string[] }>('memory')) ?? { summary: null, facts: [] };
        memory.facts = [...memory.facts.filter((f) => f !== fact), fact].slice(-24);
        await this.ctx.storage.put('memory', memory);
      },
    };
  }

  private pluginSeenRecently = false;
  private liveJwt: string | null = null;

  private async execStudioOp(studioOp: StudioOp, timeoutMs = 30_000): Promise<OpResult> {
    if (!(await this.pluginConnected())) {
      return { id: 'none', ok: false, error: 'Studio is not connected' };
    }
    this.seq += 1;
    const op: PendingOp = { id: `op_${this.seq}_${Date.now().toString(36)}`, seq: this.seq, studioOp };
    this.opQueue.push(op);
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

  private async handlePluginPoll(body: PluginPollRequest): Promise<Response> {
    const wasConnected = await this.pluginConnected();
    // the plugin polls every ~0.4-2.5s; persisting the heartbeat every time is pure write
    // amplification. Keep it in memory and only checkpoint it to storage every few seconds.
    const now = Date.now();
    this.pluginSeenRecently = true;
    if (now - this.lastSeenWrittenAt > 4000) {
      this.lastSeenWrittenAt = now;
      await this.ctx.storage.put('pluginLastSeen', now);
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
    if (!this.opQueue.length && agent?.status === 'running') {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 4000);
        this.pollWaiter = () => {
          clearTimeout(t);
          this.pollWaiter = null;
          resolve();
        };
      });
    }

    const ops = this.opQueue.splice(0, 10);
    if (ops.length) await this.ctx.storage.put('opQueue', this.opQueue);
    const running = agent?.status === 'running';
    const res: PluginPollResponse = { ops, waitMs: running ? 400 : 2500 };
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

  async restoreCheckpoint(id: string): Promise<{ ok: boolean; error?: string }> {
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
    return { ok: true };
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
