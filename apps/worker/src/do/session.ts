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
import { chat as llmChat } from '../gateway';
import { systemPrompt, MEMORY_UPDATE_PROMPT } from '../prompts';
import { toolDefs, runTool, type AgentCtx } from '../tools';

interface AgentState {
  status: 'idle' | 'running' | 'stopping';
  mode: GolemMode;
  msgId: string;
  llm: GatewayRequest['messages'];
  step: number;
  maxSteps: number;
  sparksSpent: number;
  trace: ToolTraceEntry[];
  seenCalls?: string[]; // "tool:argsHash" of calls already executed this run
  finalText: string;
  streamedText?: string;
  startedAt: number;
  lastStepAt: number;
  userId: string;
}

const STEP_LIMITS: Record<GolemMode, number> = { clay: 4, stone: 14, rune: 32 };
const PLUGIN_TIMEOUT_MS = 9000;
const STEP_STALE_MS = 180_000;

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
    const last = (await this.ctx.storage.get<number>('pluginLastSeen')) ?? 0;
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
      const jwt = req.headers.get('X-User-Jwt');
      if (jwt) await this.ctx.storage.put('lastJwt', jwt);
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
      await this.ctx.storage.put('pluginTokenHash', tokenHash);
      return json({ ok: true });
    }

    if (path === '/plugin/poll' && req.method === 'POST') {
      const token = req.headers.get('X-Golem-Token') ?? '';
      const expect = await this.ctx.storage.get<string>('pluginTokenHash');
      if (!expect || (await sha256hex(token)) !== expect) return json({ error: 'invalid token' }, 401);
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

    if (path === '/info') {
      const agent = await this.ctx.storage.get<AgentState>('agent');
      const msgs = this.sql.exec(`select count(*) as c from messages`).one() as { c: number };
      const oplog = this.sql
        .exec(`select op_id, kind, ok, summary, created_at from oplog order by id desc limit 25`)
        .toArray();
      return json({
        bind,
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
  private async startRun(bind: { projectId: string; projectName: string; ownerId: string }, text: string, mode: GolemMode) {
    const existing = await this.ctx.storage.get<AgentState>('agent');
    if (existing && existing.status !== 'idle' && Date.now() - existing.lastStepAt < STEP_STALE_MS) {
      this.broadcast({ type: 'error', code: 'busy', message: 'Golem is already working — stop the current run first.' });
      return;
    }
    const quota = await this.quotaSpend(bind.ownerId, MODE_INFO[mode].sparksPerRequest, `chat_${mode}`);
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
    const sys = systemPrompt({
      mode,
      studioConnected,
      placeName: pluginState?.placeName ?? null,
      projectName: bind.projectName,
      memorySummary: memory.summary,
      memoryFacts: memory.facts,
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
      llm: [{ role: 'system', content: sys }, ...history, { role: 'user', content: text }],
      step: 0,
      maxSteps: STEP_LIMITS[mode],
      sparksSpent: MODE_INFO[mode].sparksPerRequest,
      trace: [],
      finalText: '',
      startedAt: Date.now(),
      lastStepAt: Date.now(),
      userId: bind.ownerId,
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
      const msg = e instanceof Error ? e.message : String(e);
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
      const spend = await this.quotaSpend(agent.userId, 1, `step_${agent.mode}`);
      if (!spend.ok) {
        agent.finalText = agent.finalText || 'I paused because your daily Sparks ran out. Progress is saved.';
        await this.finishRun(agent, 'quota');
        return;
      }
      agent.sparksSpent += 1;
    }
    await this.ctx.storage.put('agent', agent);
    this.broadcast({ type: 'agent_status', phase: 'working', step: agent.step, totalSteps: agent.maxSteps });

    const studioConnected = await this.pluginConnected();
    const res = await llmChat(this.env, {
      model: agent.mode,
      messages: agent.llm,
      tools: toolDefs(studioConnected),
    });

    if (res.text) {
      agent.finalText = res.text;
      agent.streamedText = (agent.streamedText ?? '') + res.text;
      this.broadcast({ type: 'delta', msgId: agent.msgId, text: res.text });
    }

    if (!res.toolCalls.length) {
      agent.llm.push({ role: 'assistant', content: res.text });
      await this.finishRun(agent, 'done');
      return;
    }

    // record assistant turn with tool calls (as text for portability across models)
    agent.llm.push({
      role: 'assistant',
      content: (res.text ? res.text + '\n' : '') + res.toolCalls.map((c) => `\`\`\`tool_call\n{"name":"${c.name}","arguments":${c.arguments}}\n\`\`\``).join('\n'),
    });

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
      this.broadcast({ type: 'tool_end', msgId: agent.msgId, toolId, ok: out.ok, summary: out.summary });
      agent.llm.push({ role: 'tool', content: `[${call.name}] ${out.resultForLlm}`, toolCallId: call.id, name: call.name });
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
    if (!built && agent.step >= 4 && agent.step % 3 === 1) {
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
    if (agent.trace.length > 0 || reason === 'done') {
      this.ctx.waitUntil?.(this.updateMemory().catch(() => {}));
      // DurableObjectState has waitUntil in newer runtimes; fall back to inline
      if (!this.ctx.waitUntil) await this.updateMemory().catch(() => {});
    }
  }

  private async updateMemory() {
    const memory = (await this.ctx.storage.get<{ summary: string | null; facts: string[] }>('memory')) ?? { summary: null, facts: [] };
    const recent = (
      this.sql.exec(`select role, content from messages order by created_at desc limit 8`).toArray() as { role: string; content: string }[]
    )
      .reverse()
      .map((m) => `${m.role}: ${m.content.slice(0, 1500)}`)
      .join('\n');
    const res = await llmChat(this.env, {
      model: 'memory',
      messages: [
        { role: 'system', content: MEMORY_UPDATE_PROMPT },
        { role: 'user', content: `Previous summary:\n${memory.summary ?? '(none)'}\n\nExisting facts:\n${memory.facts.join('\n')}\n\nLatest conversation:\n${recent}` },
      ],
      maxTokens: 900,
    });
    try {
      const jsonStart = res.text.indexOf('{');
      const parsed = JSON.parse(res.text.slice(jsonStart)) as { summary?: string; facts?: string[] };
      if (parsed.summary) {
        const facts = Array.isArray(parsed.facts) ? parsed.facts.slice(0, 12).map(String) : memory.facts;
        await this.ctx.storage.put('memory', { summary: parsed.summary.slice(0, 3000), facts });
        // best-effort sync to Supabase registry with the user's own JWT
        const jwt = await this.ctx.storage.get<string>('lastJwt');
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

  private async handlePluginPoll(body: PluginPollRequest): Promise<Response> {
    const wasConnected = await this.pluginConnected();
    await this.ctx.storage.put('pluginLastSeen', Date.now());
    this.pluginSeenRecently = true;

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
    await this.ctx.storage.put('opQueue', this.opQueue);
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
