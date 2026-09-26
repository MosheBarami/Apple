import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const TMP = mkdtempSync(join(tmpdir(), 'session-selected-asset-'));
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
      // Keep the real registry and SessionDO policy; replace only the execution boundary.
      build.onLoad({ filter: /[\\/]src[\\/]tools\.ts$/ }, (args) => ({
        loader: 'ts',
        contents: readFileSync(args.path, 'utf8').replace('export async function runTool(', 'async function realRunTool(') + `
          export async function runTool(ctx, name, args) {
            return ctx.env.__testRunTool ? ctx.env.__testRunTool(ctx, name, args) : realRunTool(ctx, name, args);
          }
        `,
      }));
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


const selected = { id: 'roblox:oak', assetId: 101, name: 'OakTree' };
const call = (name, args = {}) => ({ id: name + '-1', name, arguments: JSON.stringify(args) });
async function chosen(h) {
  h.store.set('pendingAssetChoice', {
    request: 'Build a colorful garden with trees and flowers', mode: 'agent', autonomous: false,
    options: [selected],
  });
  h.session.pluginConnected = async () => true;
  h.session.pluginCapabilityReport = { schema: 'golem.studio-ops.v1', operations: [{ op: 'spatial_query', status: 'supported' }] };
  h.session.createCheckpoint = async () => ({ id: 'checkpoint-test' });
  const executed = [];
  h.session.env.__testRunTool = async (ctx, name, args) => {
    executed.push({ name, args: JSON.parse(args), approved: ctx.approvedLibraryAssetId });
    return { ok: true, summary: name + ' succeeded', resultForLlm: '{}',
      mutatedProject: name === 'insert_library_model' };
  };
  await start(h, 'Use visual option 1 and continue.');
  return executed;
}

test('owner choice persists the exact library id independently of prompt text', async () => {
  const h = makeSession();
  await chosen(h);
  assert.deepEqual(h.store.get('agent').selectedAssetInsertion, { id: selected.id });
  assert.equal(h.store.get('agent').approvedLibraryAssetId, selected.assetId);
});

test('unrelated searches and primitive construction cannot precede the selected insertion', async () => {
  for (const name of ['find_library_model', 'find_verified_asset', 'create_instances', 'run_luau']) {
    const h = makeSession({ responses: [gatewayResponse({ finishReason: 'tool_calls',
      toolCalls: [call(name, { query: 'flowers' }), call('create_instances')] })] });
    const executed = await chosen(h);
    // Reload the DO from the same durable store to exercise eviction, not an in-memory flag.
    h.session = new SessionDO(h.session.ctx, h.session.env);
    h.session.pluginConnected = async () => true;
    h.session.pluginCapabilityReport = { schema: 'golem.studio-ops.v1', operations: [{ op: 'spatial_query', status: 'supported' }] };
    await h.session.alarm();
    assert.deepEqual(executed.map(x => x.name), ['insert_library_model'], name);
    assert.deepEqual(executed[0].args, { id: selected.id });
    assert.equal(executed[0].approved, selected.assetId);
    assert.equal(h.store.get('agent').selectedAssetInsertion.attempted, true);
  }
});

test('a prose refusal cannot avoid the selected insertion or claim it succeeded', async () => {
  const h = makeSession({ responses: [gatewayResponse({ text: 'Done. I cannot construct detailed props.' })] });
  const executed = await chosen(h);
  await h.session.alarm();
  assert.deepEqual(executed.map(x => x.name), ['insert_library_model']);
  assert.equal(h.sent.some(m => m.type === 'delta' && /Done/.test(m.text)), false);
});

test('checkpoint and reads can precede insertion; exact placement is retained and later calls wait', async () => {
  const h = makeSession({ responses: [gatewayResponse({ finishReason: 'tool_calls', toolCalls: [
    call('create_checkpoint'), call('get_project_tree'),
    call('insert_library_model', { id: selected.id, position: [7, 0, 9], height: 12 }),
    call('find_library_model', { query: 'flowers' }),
  ] })] });
  const executed = await chosen(h);
  await h.session.alarm();
  assert.deepEqual(executed.map(x => x.name), ['create_checkpoint', 'get_project_tree', 'insert_library_model']);
  assert.deepEqual(executed.at(-1).args, { id: selected.id, position: [7, 0, 9], height: 12 });
});

test('an actual insertion denial ends incomplete without retry, construction, or success', async () => {
  const h = makeSession({ responses: [gatewayResponse({ finishReason: 'tool_calls', toolCalls: [
    call('insert_library_model', { id: 'different-model' }), call('create_instances'),
  ] })] });
  const executed = await chosen(h);
  h.session.env.__testRunTool = async (ctx, name, args) => {
    executed.push({ name, args: JSON.parse(args) });
    return { ok: false, summary: 'third-party loading denied', resultForLlm: '{"error":"third-party loading denied"}' };
  };
  await h.session.alarm();
  assert.deepEqual(executed.map(x => x.name), ['insert_library_model']);
  assert.deepEqual(executed[0].args, { id: selected.id });
  assert.equal(h.store.get('agent').status, 'idle');
  assert.equal(h.store.get('agent').mutated, undefined);
  assert.equal(lastEnd(h).stopReason, 'incomplete');
  assert.match(assistantRow(h).content, /could not be inserted/i);
});

test('withheld insertion cannot widen permissions or fall back to building', async () => {
  const h = makeSession({ responses: [gatewayResponse({ text: 'Done.' })] });
  const executed = await chosen(h);
  const agent = h.store.get('agent');
  agent.readOnly = true;
  h.store.set('agent', structuredClone(agent));
  await h.session.alarm();
  assert.deepEqual(executed, []);
  assert.equal(lastEnd(h).stopReason, 'incomplete');
});

test('preparation-only turns are bounded and successful insertion releases later searches', async () => {
  const h = makeSession({ responses: [
    ...['get_project_tree', 'read_script', 'list_scripts'].map(name => gatewayResponse({
      finishReason: 'tool_calls', toolCalls: [call(name)],
    })),
    gatewayResponse({ finishReason: 'tool_calls', toolCalls: [call('find_library_model', { query: 'flowers' })] }),
  ] });
  const executed = await chosen(h);
  for (let i = 0; i < 3; i++) await h.session.alarm();
  assert.deepEqual(executed.map(x => x.name), ['get_project_tree', 'read_script', 'list_scripts', 'insert_library_model']);
  assert.equal(h.store.get('agent').selectedAssetInsertion.attempted, true);
  await h.session.alarm();
  assert.equal(executed.at(-1).name, 'find_library_model');
});

test('Stop arriving during inference prevents even the enforced insertion', async () => {
  const h = makeSession();
  const executed = await chosen(h);
  h.session.env.__testChat = async () => {
    h.store.set('stopRequested', Date.now());
    return gatewayResponse({ text: 'Done.' });
  };
  await h.session.alarm();
  assert.deepEqual(executed, []);
  assert.equal(lastEnd(h).stopReason, 'stopped');
});

test('real insertion still refuses missing source consent before any Studio operation', async () => {
  const index = JSON.parse(readFileSync(join(WORKER, '../../packages/asset-library/models/index.json'), 'utf8'));
  const row = index.rows.find(row => Number.isSafeInteger(row[5]) && row[5] > 0);
  assert.ok(row, 'real Creator Store candidate needed for the consent test');
  const h = makeSession({ responses: [gatewayResponse({ text: 'I will search for flowers.' })] });
  await chosen(h);
  const agent = h.store.get('agent');
  agent.selectedAssetInsertion = { id: row[0] };
  agent.approvedLibraryAssetId = row[5];
  h.store.set('agent', structuredClone(agent));
  delete h.session.env.__testRunTool;
  const originalCtx = h.session.agentCtx.bind(h.session);
  const ops = [];
  h.session.agentCtx = agent => ({ ...originalCtx(agent),
    studioConnected: () => true,
    assetSources: undefined,
    askAssetSources: () => {},
    execStudioOp: async op => { ops.push(op); throw new Error('consent must refuse first'); },
  });
  await h.session.alarm();
  assert.deepEqual(ops, []);
  assert.equal(lastEnd(h).stopReason, 'incomplete');
  assert.equal(h.store.get('agent').trace.at(-1).tool, 'insert_library_model');
  assert.equal(h.store.get('agent').trace.at(-1).ok, false);
  assert.match(h.store.get('agent').llm.findLast(m => m.role === 'tool').content, /permitted source/i);
});

test('Plan mode and stale cards cannot create an insertion obligation', async () => {
  const h = makeSession();
  h.store.set('pendingAssetChoice', { request: 'Build a forest', mode: 'agent', options: [selected] });
  const res = await h.session.fetch(new Request('https://do/agent-run', { method: 'POST',
    body: JSON.stringify({ text: 'Use visual option 1 and continue.', mode: 'plan', productModel: 'apple' }),
  }));
  assert.equal(res.status, 200);
  assert.equal(h.store.get('agent'), undefined);
  assert.equal(h.sent.at(-1).code, 'forbidden');
  h.store.delete('pendingAssetChoice');
  await start(h, 'Use visual option 1 and continue.');
  assert.equal(h.store.get('agent'), undefined);
  assert.equal(h.sent.at(-1).code, 'forbidden');
});

test('explicit tool denial and late capability withdrawal never become insertion authority', async () => {
  for (const boundary of ['preference', 'capability']) {
    const h = makeSession({ responses: [gatewayResponse({ text: 'Done.' })] });
    const executed = await chosen(h);
    if (boundary === 'preference') {
      const agent = h.store.get('agent');
      agent.toolPermissions = { insert_library_model: 'deny' };
      h.store.set('agent', structuredClone(agent));
    } else {
      h.session.env.__testChat = async () => {
        h.session.pluginCapabilityReport = { schema: 'golem.studio-ops.v1', operations: [
          { op: 'spatial_query', status: 'unsupported', reason: 'operation withdrawn during inference' },
        ] };
        return gatewayResponse({ text: 'Done.' });
      };
    }
    await h.session.alarm();
    assert.deepEqual(executed, [], boundary);
    assert.equal(lastEnd(h).stopReason, 'incomplete', boundary);
    assert.equal(h.store.get('agent').trace.at(-1).ok, false, boundary);
  }
});

test('access revoked during inference stops before the selected tool executes', async () => {
  const h = makeSession();
  const executed = await chosen(h);
  const agent = h.store.get('agent');
  agent.initiatedBy = 'collaborator';
  agent.initiatorExpiresAt = new Date(Date.now() + 60_000).toISOString();
  h.store.set('agent', structuredClone(agent));
  h.session.env.__testChat = async () => {
    h.store.set('accessRevoked', { collaborator: { userId: 'collaborator', reason: 'removed', at: Date.now() } });
    return gatewayResponse({ text: 'Done.' });
  };
  await h.session.alarm();
  assert.deepEqual(executed, []);
  assert.equal(lastEnd(h).stopReason, 'stopped');
});

test('structured calls remain ordered even when a provider reports a truncated response', async () => {
  const h = makeSession({ responses: [gatewayResponse({ finishReason: 'length',
    toolCalls: [call('find_library_model', { query: 'flowers' })] })] });
  const executed = await chosen(h);
  await h.session.alarm();
  assert.deepEqual(executed.map(x => x.name), ['insert_library_model']);
});
