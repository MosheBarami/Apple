/**
 * SessionDO must not turn an incomplete provider response into a successful build.
 *
 * gateway-finish-reason.test.mjs proves the provider boundary preserves `length` after settling
 * provider usage. This file starts one layer later: it replaces only the gateway call with a local
 * deterministic seam and drives the real SessionDO lifecycle, message persistence, Credit settle,
 * tool execution and stop signal around that response. No provider or external endpoint is called.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const TMP = mkdtempSync(join(tmpdir(), 'session-finish-reason-'));
const OUT = join(TMP, 'session.mjs');

await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'do', 'session.ts')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outfile: OUT,
  alias: {
    'cloudflare:workers': join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs'),
  },
  plugins: [{
    name: 'deterministic-gateway',
    setup(build) {
      build.onResolve({ filter: /^\.\.\/gateway$/ }, () => ({ path: 'finish-reason-gateway', namespace: 'finish-reason' }));
      build.onLoad({ filter: /.*/, namespace: 'finish-reason' }, () => ({
        loader: 'js',
        contents: `
          export class BudgetError extends Error {
            constructor(reason, message) { super(message); this.reason = reason; }
          }
          export class RateLimitedError extends Error {}
          export async function chat(env, req, opts) { return env.__testChat(req, opts); }
          // runStep asks the gateway whether the reasoning effort it chose will actually reach the
          // model, so it can report the applied setting instead of the chosen one. This file is
          // about FINISH REASONS, so the fake answers the way the lane these fixtures model does
          // (a GLM route, where the effort is sent) and leaves that behaviour to its own test.
          export async function reasoningEffortApplies() { return true; }
        `,
      }));
    },
  }],
});

const { SessionDO } = await import(pathToFileURL(OUT).href);
test.after(() => rmSync(TMP, { recursive: true, force: true }));

const result = (rows = [], one = null) => ({ toArray: () => rows, one: () => one });

class SqlMemory {
  constructor() {
    this.messages = [];
    this.models = new Map();
    this.calls = [];
  }

  exec(statement, ...args) {
    this.calls.push({ statement, args });
    const q = statement.replace(/\s+/g, ' ').trim();
    if (/pragma_table_info\('checkpoints'\)/.test(q)) return result([]);
    if (q.startsWith('insert into messages(')) {
      const [id, role, mode, content, maybeTrace, maybeCreated] = args;
      const withTrace = args.length === 6;
      this.messages.push({
        id, role, mode, content,
        tool_trace: withTrace ? maybeTrace : null,
        created_at: withTrace ? maybeCreated : maybeTrace,
      });
      return result();
    }
    if (q.startsWith('update messages set stop_reason = ?')) {
      const [stop_reason, run_failure, credits_spent, context_used_chars, context_max_chars,
        context_dropped_groups, context_dropped_chars, denied_tools, id] = args;
      const row = this.messages.find((m) => m.id === id);
      if (row) Object.assign(row, {
        stop_reason, run_failure, credits_spent, context_used_chars, context_max_chars,
        context_dropped_groups, context_dropped_chars, denied_tools,
      });
      return result();
    }
    if (q.startsWith('insert into message_models')) {
      this.models.set(args[0], args[1]);
      return result();
    }
    if (q.startsWith('select message_id, product_model from message_models')) {
      const ids = new Set(args);
      return result([...this.models].filter(([id]) => ids.has(id)).map(([message_id, product_model]) => ({ message_id, product_model })));
    }
    if (q.startsWith('select id, role, mode, content, tool_trace, created_at from messages where created_at < ?')) {
      const before = Number(args[0]);
      const limit = Number(args[1]);
      return result([...this.messages].filter((m) => m.created_at < before).sort((a, b) => b.created_at - a.created_at).slice(0, limit));
    }
    if (q.startsWith('select id, stop_reason, run_failure, credits_spent,')) {
      const ids = new Set(args);
      return result(this.messages.filter((m) => ids.has(m.id)).map((m) => ({
        id: m.id,
        stop_reason: m.stop_reason ?? null,
        run_failure: m.run_failure ?? null,
        credits_spent: m.credits_spent ?? null,
        context_used_chars: m.context_used_chars ?? null,
        context_max_chars: m.context_max_chars ?? null,
        context_dropped_groups: m.context_dropped_groups ?? null,
        context_dropped_chars: m.context_dropped_chars ?? null,
        denied_tools: m.denied_tools ?? null,
      })));
    }
    if (q.startsWith('select role, content from messages order by created_at desc')) {
      return result([...this.messages].sort((a, b) => b.created_at - a.created_at).slice(0, 15));
    }
    if (q.startsWith('select count(*) as c from messages')) return result([], { c: this.messages.length });
    if (q.startsWith('select message_id, count(*) as n from message_revisions')) return result();
    return result();
  }
}

function gatewayResponse({ finishReason = 'stop', text = '', toolCalls = [], neurons = 60, includeFinish = true } = {}) {
  return {
    text,
    toolCalls,
    usage: { inputTokens: 10, outputTokens: Math.max(1, Math.ceil(text.length / 4)) },
    neurons,
    provider: 'workers-ai',
    model: '@cf/qwen/qwen3-30b-a3b-fp8',
    ...(includeFinish ? { finishReason } : {}),
  };
}

function deferred() {
  let resolve;
  let startedResolve;
  const started = new Promise((r) => { startedResolve = r; });
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve, started, startedResolve };
}

function makeSession({ responses = [], chat } = {}) {
  const store = new Map([['bind', { projectId: 'project-1', projectName: 'Test Place', ownerId: 'owner-1' }]]);
  const sql = new SqlMemory();
  const sent = [];
  const spends = [];
  const chatCalls = [];
  const alarms = [];
  let attachment = { userId: 'owner-1', role: 'owner', connectionId: 'connection-1', activity: 'viewing', lastSeenMs: Date.now() };
  const ws = {
    readyState: 1,
    send: (raw) => sent.push(JSON.parse(raw)),
    close: () => {},
    deserializeAttachment: () => attachment,
    serializeAttachment: (next) => { attachment = next; },
  };
  const namespace = (name) => ({
    idFromName: (id) => ({ __name: id, toString: () => `${name}:${id}` }),
    get: (id) => ({
      fetch: async (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        const path = new URL(url).pathname;
        if (name === 'QUOTA_DO' && path === '/state') {
          const spent = spends.reduce((n, v) => n + v, 0);
          return Response.json({
            plan: 'free', creditsRemaining: 100 - spent, creditsDaily: 100,
            allowanceRemaining: 100 - spent, credits: 0, resetsAtIso: '2026-09-19T00:00:00.000Z',
          });
        }
        if (name === 'QUOTA_DO' && path === '/spend') {
          const body = init?.body ? JSON.parse(init.body) : {};
          spends.push(Number(body.credits));
          const spent = spends.reduce((n, v) => n + v, 0);
          return Response.json({
            ok: true,
            state: {
              plan: 'free', creditsRemaining: 100 - spent, creditsDaily: 100,
              allowanceRemaining: 100 - spent, credits: 0, resetsAtIso: '2026-09-19T00:00:00.000Z',
            },
          });
        }
        return Response.json({ ok: true, id: id.__name, state: { killed: false }, reserved: 1 });
      },
    }),
  });
  const ctx = {
    id: { toString: () => 'session-1' },
    storage: {
      async get(key) { return store.get(key); },
      async put(key, value) {
        if (key && typeof key === 'object') {
          for (const [k, v] of Object.entries(key)) store.set(k, structuredClone(v));
        } else {
          store.set(key, structuredClone(value));
        }
      },
      async delete(key) { store.delete(key); return true; },
      async deleteAlarm() {},
      async deleteAll() { store.clear(); },
      async list() { return new Map(); },
      async setAlarm(at) { alarms.push(at); },
      async getAlarm() { return null; },
      sql,
    },
    blockConcurrencyWhile: (fn) => fn(),
    getWebSockets: () => [ws],
    acceptWebSocket: () => {},
  };
  const queue = [...responses];
  const env = {
    QUOTA_DO: namespace('QUOTA_DO'),
    BUDGET_DO: namespace('BUDGET_DO'),
    ADMIN_DO: namespace('ADMIN_DO'),
    CORPUS: {
      async exec() {},
      prepare() {
        return {
          bind() { return this; },
          async first() { return null; },
          async all() { return { results: [] }; },
          async run() { return { success: true, meta: { changes: 0 } }; },
        };
      },
    },
    __testChat: async (req, opts) => {
      chatCalls.push({ req, opts });
      if (chat) return chat(req, opts);
      assert.ok(queue.length > 0, 'the test gateway ran more times than the fixture supplied');
      return structuredClone(queue.shift());
    },
  };
  const session = new SessionDO(ctx, env);
  return { session, store, sql, sent, spends, chatCalls, alarms, ws };
}

async function start(h, text = 'build a small tower') {
  const res = await h.session.fetch(new Request('https://do/agent-run', {
    method: 'POST',
    body: JSON.stringify({ text, mode: 'agent', productModel: 'apple' }),
  }));
  assert.equal(res.status, 200, await res.text());
  return h.store.get('agent');
}

const lastEnd = (h) => [...h.sent].reverse().find((m) => m.type === 'msg_end');
const assistantRow = (h) => [...h.sql.messages].reverse().find((m) => m.role === 'assistant');
const history = async (h) => (await (await h.session.fetch(new Request('https://do/messages?limit=100'))).json()).messages;

test('length AFTER a successful mutation stays inside the same run and schedules a smaller retry', async () => {
  const h = makeSession({ responses: [gatewayResponse({ finishReason: 'length', text: 'I finished the tower and the final verification is', neurons: 60 })] });
  const agent = await start(h);
  agent.step = 1;
  agent.mutated = true;
  agent.trace = [{ tool: 'create_instances', summary: 'created tower geometry', ok: true, durationMs: 1 }];
  h.store.set('agent', structuredClone(agent));

  await h.session.alarm();

  const continued = h.store.get('agent');
  assert.equal(lastEnd(h), undefined, 'output-limit truncation must not end the customer run');
  assert.equal(continued.status, 'running');
  assert.equal(continued.lengthRecoveries, 1);
  assert.match(continued.llm.at(-1).content, /Continue the SAME task/);
  assert.equal(h.sent.some((m) => m.type === 'delta' && /final verification is/.test(m.text ?? '')), false,
    'partial provider text must not be shown as a customer answer');
  assert.equal(continued.trace.some((entry) => entry.tool === 'create_instances' && entry.ok), true,
    'completed work before the truncation stays in the durable trace');
  assert.deepEqual(h.spends, [1, 1], 'one upfront Credit plus the measured run settlement remain charged');
  assert.ok(h.alarms.length >= 2, 'the same run was not re-armed after truncation');
});

test('terminal outcome, settled cost, context budget and denied-tool facts survive the REST history boundary', async () => {
  const h = makeSession({ responses: [gatewayResponse({ finishReason: 'error', text: 'Provider failed after verification', neurons: 60 })] });
  const agent = await start(h);
  agent.toolPermissions = { search_creation_skills: 'deny' };
  h.store.set('agent', structuredClone(agent));
  await h.session.alarm();

  const liveEnd = lastEnd(h);
  const liveContext = [...h.sent].reverse().find((m) => m.type === 'context_budget');
  const liveDenied = [...h.sent].reverse().find((m) => m.type === 'tools_denied');
  const rows = await history(h);
  const reloaded = rows.find((m) => m.id === liveEnd.msgId);
  assert.ok(reloaded, 'the terminal assistant row must be the same msgId the live run ended');
  assert.equal(reloaded.stopReason, liveEnd.stopReason);
  assert.equal(reloaded.error, liveEnd.error);
  assert.equal(reloaded.creditsSpent, liveEnd.creditsSpent);
  assert.deepEqual(reloaded.context, {
    usedChars: liveContext.usedChars,
    maxChars: liveContext.maxChars,
  });
  assert.deepEqual(reloaded.deniedTools, liveDenied.tools);
  assert.equal('intent' in reloaded, false, 'terminal persistence must not copy prompt-derived intent text into message metadata');
});

test('old assistant rows with no terminal metadata stay unknown after reload rather than becoming done', async () => {
  const h = makeSession();
  h.sql.messages.push({
    id: 'old-assistant', role: 'assistant', mode: 'agent', content: 'An old reply', tool_trace: null, created_at: 1,
  });
  const rows = await history(h);
  const old = rows.find((m) => m.id === 'old-assistant');
  assert.ok(old);
  assert.equal('stopReason' in old, false);
  assert.equal('error' in old, false);
  assert.equal('creditsSpent' in old, false);
  assert.equal('context' in old, false);
  assert.equal('deniedTools' in old, false);
});

test('length BEFORE any mutation is recovered internally rather than shown as a failed partial response', async () => {
  const h = makeSession({ responses: [gatewayResponse({ finishReason: 'length', text: 'I was about to create the first platform', neurons: 60 })] });
  await start(h);
  await h.session.alarm();

  assert.equal(lastEnd(h), undefined);
  assert.equal(h.store.get('agent').status, 'running');
  assert.equal(h.sent.some((m) => m.type === 'delta' && /about to create/.test(m.text ?? '')), false);
  assert.match(h.store.get('agent').llm.at(-1).content, /same task/i);
  assert.deepEqual(h.spends, [1, 1]);
});

test('ordinary provider stop remains the successful control', async () => {
  const h = makeSession({ responses: [gatewayResponse({ finishReason: 'stop', text: 'Complete answer.', neurons: 30 })] });
  await start(h, 'explain what this project does');
  await h.session.alarm();

  assert.equal(lastEnd(h).stopReason, 'done');
  assert.equal(assistantRow(h).content, 'Complete answer.');
  assert.deepEqual(h.spends, [1], 'a one-Credit response is not charged twice');
});

//[[ RE-TITLED 2026-09-22: this said transient outages NEVER end a run, and since PROVIDER_OUTAGE_MAX_MS
//   an outage that lasts five minutes does end it — honestly, with the refund (run-loop-traps.test.mjs).
//   What this test measures is unchanged and still right: twelve failures in quick succession, well
//   inside the bound, are a pause and not a terminal state. ]]
test('classified transient provider outages inside the outage bound never become an artificial terminal run', async () => {
  let attempts = 0;
  const h = makeSession({
    chat: async () => {
      attempts += 1;
      const error = new Error('workers-ai 503 temporarily unavailable');
      error.name = 'ProviderError';
      error.kind = 'transient';
      throw error;
    },
  });
  await start(h);

  for (let i = 0; i < 12; i += 1) {
    await h.session.alarm();
    const waiting = h.store.get('agent');
    assert.equal(waiting.status, 'running');
    assert.equal(lastEnd(h), undefined, `transient failure ${i + 1} incorrectly ended the run`);
    assert.equal(typeof waiting.resumeAt, 'number');
    assert.ok(waiting.resumeAt > Date.now());
    h.store.set('agent', structuredClone({ ...waiting, resumeAt: Date.now() - 1 }));
  }

  assert.equal(attempts, 12, 'the fixture did not cross the former eight-failure cutoff');
  assert.equal(h.store.get('agent').transientFailures, 12);
  assert.equal(h.store.get('agent').step, 0, 'a provider outage must not consume a work step');
  assert.deepEqual(h.spends, [1], 'failed transport attempts do not consume customer Credits in SessionDO');
});

test('explicit provider error persists useful partial text and an actionable failed terminal state', async () => {
  const h = makeSession({ responses: [gatewayResponse({ finishReason: 'error', text: 'The verification reached the doorway', neurons: 60 })] });
  await start(h);
  await h.session.alarm();

  const end = lastEnd(h);
  assert.equal(end.stopReason, 'error');
  assert.equal(end.error, 'model_failed');
  assert.match(assistantRow(h).content, /verification reached the doorway/);
  assert.doesNotMatch(assistantRow(h).content, /send another message/i);
  assert.deepEqual(h.spends, [1, 1]);
});

test('a gateway response with no completion reason fails closed instead of inventing done', async () => {
  const h = makeSession({ responses: [gatewayResponse({ text: 'Partial response with no terminal marker', neurons: 60, includeFinish: false })] });
  await start(h);
  await h.session.alarm();

  const end = lastEnd(h);
  assert.equal(end.stopReason, 'error');
  assert.equal(end.error, 'model_failed');
  assert.match(assistantRow(h).content, /Partial response with no terminal marker/);
  assert.match(assistantRow(h).content, /completion|confirm/i);
  assert.doesNotMatch(assistantRow(h).content, /send another message/i);
});

test('a truncated direct artifact request keeps the run live and suppresses the invented artifact claim', async () => {
  const h = makeSession({ responses: [gatewayResponse({
    finishReason: 'length',
    text: 'Done — your image is available as image_fake_123',
    neurons: 60,
  })] });
  await start(h, 'create an image of a red apple');
  await h.session.alarm();

  assert.equal(lastEnd(h), undefined);
  assert.equal(h.store.get('agent').status, 'running');
  assert.equal(h.sent.some((m) => m.type === 'delta' && /image_fake_123/.test(m.text ?? '')), false,
    'artifact guard still suppresses an invented image claim');
  assert.equal(h.chatCalls.length, 1, 'an output-limit finish does not buy a blanket retry');
  assert.deepEqual(h.spends, [1, 1], 'the consumed call remains settled once');
});

test('genuine tool_calls still execute and keep the run live for the next model step', async () => {
  const h = makeSession({ responses: [
    gatewayResponse({
      finishReason: 'tool_calls', text: '', neurons: 30,
      toolCalls: [{ id: 'skills-1', name: 'search_creation_skills', arguments: JSON.stringify({ query: 'obby checkpoint' }) }],
    }),
    gatewayResponse({ finishReason: 'stop', text: 'Plan recorded.', neurons: 30 }),
  ] });
  await start(h, 'plan a small tower');
  await h.session.alarm();

  const mid = h.store.get('agent');
  assert.equal(mid.status, 'running');
  assert.equal(lastEnd(h), undefined, 'a real tool call must not be mistaken for a terminal provider response');
  assert.equal(mid.trace.some((entry) => entry.tool === 'search_creation_skills' && entry.ok), true);

  await h.session.alarm();
  assert.equal(lastEnd(h).stopReason, 'done');
});

test('a tool call whose arguments are not JSON is never echoed back to the provider', async () => {
  // Production, 2026-09-22: the unparseable arguments of a cut-off create_instances call were written
  // into history and sent back as a structured tool_call; the provider rejected the next request in
  // ~300 ms and the build ended with nothing built. The call still runs (and fails, telling the model
  // why) — only the unreadable bytes are kept out of the transcript the provider must read.
  const h = makeSession({ responses: [
    gatewayResponse({
      finishReason: 'tool_calls', text: '', neurons: 30,
      toolCalls: [{ id: 'bad-1', name: 'search_creation_skills', arguments: '{"query":"street lamp' }],
    }),
    gatewayResponse({ finishReason: 'stop', text: 'Continuing in smaller steps.', neurons: 30 }),
  ] });
  await start(h, 'make me a street lamp');
  await h.session.alarm();
  await h.session.alarm();

  assert.equal(h.chatCalls.length, 2, 'the run must reach a second model step');
  const second = h.chatCalls[1].req.messages;
  const echoed = second.filter((m) => m.role === 'assistant' && (m.toolCalls ?? []).some((c) => c.id === 'bad-1'));
  assert.equal(echoed.length, 1, 'the call must still be in history so its result pairs with it');
  const call = echoed[0].toolCalls.find((c) => c.id === 'bad-1');
  assert.doesNotThrow(() => JSON.parse(call.arguments), 'history must hold arguments the provider can read');
  assert.equal(call.arguments, '{}');
  const result = second.find((m) => m.role === 'tool' && (m.toolCallId === 'bad-1' || m.tool_call_id === 'bad-1'));
  assert.ok(result && /not valid JSON/.test(typeof result.content === 'string' ? result.content : JSON.stringify(result.content)),
    'the model is still told its arguments were not valid JSON');
  assert.notEqual(lastEnd(h)?.stopReason, 'error');
});

test('three steps of nothing but refused duplicates end the run instead of paying for a loop', async () => {
  // Production, 2026-09-22 (run 1870ecfe): after building a lamp the model repeated identical calls,
  // each answered "already done" and none executed or traced — 53 paid steps, most of 205 Credits.
  const call = { name: 'search_creation_skills', arguments: JSON.stringify({ query: 'street lamp' }) };
  const step = (id) => gatewayResponse({ finishReason: 'tool_calls', text: '', neurons: 30, toolCalls: [{ id, ...call }] });
  const h = makeSession({ responses: [step('c1'), step('c2'), step('c3'), step('c4'),
    gatewayResponse({ finishReason: 'stop', text: 'never reached', neurons: 30 })] });
  await start(h, 'make me a street lamp');
  for (let i = 0; i < 6 && !lastEnd(h); i++) await h.session.alarm();

  assert.equal(h.chatCalls.length, 4, 'one real call then three all-duplicate steps — the fifth step must never be paid for');
  const end = lastEnd(h);
  assert.ok(end, 'the run must end');
  assert.notEqual(end.stopReason, 'error');
  const said = h.sent.filter((m) => m.type === 'delta').map((m) => m.text).join('');
  assert.match(said, /kept repeating a step it had already done/);
  assert.match(said, /nothing in your place was changed/, 'nothing was built, and the note must say so');
});

test('control: one refused duplicate followed by real work is not a loop', async () => {
  const call = { name: 'search_creation_skills', arguments: JSON.stringify({ query: 'street lamp' }) };
  const h = makeSession({ responses: [
    gatewayResponse({ finishReason: 'tool_calls', text: '', neurons: 30, toolCalls: [{ id: 'c1', ...call }] }),
    gatewayResponse({ finishReason: 'tool_calls', text: '', neurons: 30, toolCalls: [{ id: 'c2', ...call }] }),
    gatewayResponse({ finishReason: 'tool_calls', text: '', neurons: 30, toolCalls: [{ id: 'c3', name: 'search_creation_skills', arguments: JSON.stringify({ query: 'lantern' }) }] }),
    gatewayResponse({ finishReason: 'stop', text: 'Done.', neurons: 30 }),
  ] });
  await start(h, 'make me a street lamp');
  for (let i = 0; i < 6 && !lastEnd(h); i++) await h.session.alarm();
  assert.equal(h.chatCalls.length, 4);
  assert.equal(lastEnd(h).stopReason, 'done');
});

test('Stop pressed while inference is in flight wins before any returned tool call executes', async () => {
  const gate = deferred();
  const h = makeSession({
    chat: async () => {
      gate.startedResolve();
      return gate.promise;
    },
  });
  await start(h, 'build a tower');
  const alarm = h.session.alarm();
  await gate.started;

  await h.session.webSocketMessage(h.ws, JSON.stringify({ type: 'stop' }));
  gate.resolve(gatewayResponse({
    finishReason: 'tool_calls', text: '', neurons: 60,
    toolCalls: [{ id: 'skills-after-stop', name: 'search_creation_skills', arguments: JSON.stringify({ query: 'obby checkpoint' }) }],
  }));
  await alarm;

  const end = lastEnd(h);
  assert.equal(end.stopReason, 'stopped');
  assert.equal(h.store.get('agent').trace.length, 0, 'a tool returned after Stop must not run even once');
  assert.deepEqual(h.spends, [1, 1], 'the already-consumed inference remains settled; Stop is not a refund');
});
