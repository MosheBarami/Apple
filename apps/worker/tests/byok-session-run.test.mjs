/**
 * A RUN ON THE CUSTOMER'S OWN KEY, DRIVEN END TO END THROUGH THE REAL SessionDO AND GATEWAY.
 *
 * Owner decisions D-BYOK-1 / D-BYOK-2: a run on a model the customer pays for through their own
 * OpenRouter key spends no Apple Credits and is labelled with the model that actually ran.
 *
 * WHY THIS FILE EXISTS. byok-openrouter.test.mjs pins the session side with regexes over the source
 * text. A review planted `...(customerModel ? { customerModel } : {})` -> `...({})` in the run state,
 * so a key-backed run fell back to Apple's model and billed Credits for every step after admission,
 * and the whole suite stayed green. This file asserts the BEHAVIOUR instead: which provider was
 * called, with whose key, whether QuotaDO or BudgetDO were touched, and what the history says after
 * a reload.
 *
 * NO NETWORK. `fetch` is replaced for the duration of each test; any URL it does not expect fails
 * the test, and the Workers AI binding records every call so an Apple-lane step is visible.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const TMP = mkdtempSync(join(tmpdir(), 'byok-session-'));

function bundle(rel, name) {
  const out = join(TMP, `${name}.mjs`);
  execFileSync(
    join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [join(WORKER, 'src', ...rel), '--bundle', '--format=esm', '--target=es2022',
      '--alias:cloudflare:workers=' + join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs'), '--outfile=' + out],
    { cwd: WORKER, stdio: 'pipe' },
  );
  return import(`file://${out}`);
}

const { SessionDO } = await bundle(['do', 'session.ts'], 'session');
const K = await bundle(['model-keys.ts'], 'model-keys');

const KEY = 'sk-or-v1-SESSIONSENTINEL0123456789abcdef77';
const SECRET = Buffer.from(new Uint8Array(32).map((_, i) => i * 11 + 5)).toString('base64');
const MODEL = 'openai/gpt-6-sol';

function result(rows = [], value = null) {
  return { toArray: () => rows, one: () => value };
}

/** The DO's SQLite: enough of `messages` and `message_models` for a run and a history read. */
class SqlMemory {
  constructor() { this.messages = []; this.models = new Map(); }
  exec(statement, ...args) {
    const q = statement.replace(/\s+/g, ' ').trim();
    if (q.startsWith('insert into messages(')) {
      const [id, role, mode, content, maybeTrace, maybeCreated] = args;
      const hasTrace = args.length === 6;
      this.messages.push({ id, role, mode, content, tool_trace: hasTrace ? maybeTrace : null, created_at: hasTrace ? maybeCreated : maybeTrace });
      return result();
    }
    if (q.startsWith('update messages set content')) {
      const id = args[args.length - 1];
      const row = this.messages.find((m) => m.id === id);
      if (row) row.content = args[0];
      return result();
    }
    if (q.startsWith('insert into message_models')) { this.models.set(args[0], args[1]); return result(); }
    if (q.startsWith('select message_id, product_model from message_models')) {
      const ids = new Set(args);
      return result([...this.models].filter(([id]) => ids.has(id)).map(([message_id, product_model]) => ({ message_id, product_model })));
    }
    if (q.startsWith('select role, content from messages order by created_at desc')) {
      return result([...this.messages].sort((a, b) => b.created_at - a.created_at).slice(0, 15));
    }
    if (q.startsWith('select id, role, mode, content, tool_trace, created_at from messages where created_at < ?')) {
      return result([...this.messages].filter((m) => m.created_at < Number(args[0])).sort((a, b) => b.created_at - a.created_at).slice(0, Number(args[1])));
    }
    if (q.startsWith('select count(*) as c from messages')) return result([], { c: this.messages.length });
    return result();
  }
}

/** D1 with only `user_credentials` answering; every other query is empty. */
function fakeD1() {
  const rows = new Map();
  const k = (u, p) => `${u}\u0000${p}`;
  const stmt = (sql, args) => ({
    bind: (...a) => stmt(sql, a),
    async run() {
      if (/^\s*insert into user_credentials/i.test(sql)) {
        const [userId, provider, sealed] = args;
        rows.set(k(userId, provider), { sealed });
        return { success: true, meta: { changes: 1 } };
      }
      return { success: true, meta: { changes: 0 } };
    },
    async first() {
      if (/from user_credentials/i.test(sql)) return rows.get(k(args[0], args[1])) ?? null;
      return null;
    },
    async all() { return { results: [] }; },
  });
  return { rows, prepare: (sql) => stmt(sql, []), async exec() {}, async batch() { return []; } };
}

async function harness() {
  const store = new Map([['bind', { projectId: 'project-1', projectName: 'Test Place', ownerId: 'owner-1' }]]);
  const sql = new SqlMemory();
  const sent = [];
  const doCalls = [];
  const aiRuns = [];
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
      fetch: async (url) => {
        const path = new URL(typeof url === 'string' ? url : url.url).pathname;
        doCalls.push({ name, path, id: id.__name });
        if (name === 'QUOTA_DO' && path === '/state') return Response.json({ plan: 'free', creditsRemaining: 100, allowanceRemaining: 100 });
        if (name === 'QUOTA_DO' && path === '/spend') return Response.json({ ok: true, state: { plan: 'free', creditsRemaining: 99, allowanceRemaining: 99 } });
        return Response.json({ ok: true, state: { killed: false }, reserved: 1 });
      },
    }),
  });
  const ctx = {
    id: { toString: () => 'session-1' },
    storage: {
      async get(key) { return store.get(key); },
      async put(key, value) {
        if (key && typeof key === 'object') for (const [a, b] of Object.entries(key)) store.set(a, b);
        else store.set(key, value);
      },
      async delete(key) { store.delete(key); },
      async deleteAlarm() {},
      async deleteAll() { store.clear(); },
      async list() { return new Map(); },
      setAlarm() {},
      getAlarm() { return null; },
      sql,
    },
    blockConcurrencyWhile: (fn) => fn(),
    getWebSockets: () => [ws],
    acceptWebSocket() {},
  };
  const env = {
    QUOTA_DO: namespace('QUOTA_DO'),
    BUDGET_DO: namespace('BUDGET_DO'),
    ADMIN_DO: namespace('ADMIN_DO'),
    CORPUS: fakeD1(),
    BYOK_ENCRYPTION_KEY: SECRET,
    KV: { async get() { return null; }, async put() {} },
    AI: {
      run: async (model, payload) => {
        aiRuns.push({ model, payload });
        return { choices: [{ finish_reason: 'stop', message: { content: 'apple lane answered' } }], usage: { prompt_tokens: 10, completion_tokens: 2 } };
      },
    },
  };
  const saved = await K.saveModelKey(env, 'owner-1', 'openrouter', KEY, async () => 'valid');
  assert.equal(saved.ok, true, 'the fixture could not save a key');
  const session = new SessionDO(ctx, env);
  return { session, store, sql, sent, doCalls, aiRuns, ws, env };
}

/** Replace fetch for one test: the models list fails (snapshot fallback), chat is recorded. */
async function withOpenRouter(fn) {
  const orCalls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url === 'https://openrouter.ai/api/v1/models') return new Response('down', { status: 503 });
    if (url === 'https://openrouter.ai/api/v1/chat/completions') {
      orCalls.push({ authorization: init.headers?.authorization, body: JSON.parse(init.body) });
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'Built a small tower.' } }], usage: { prompt_tokens: 12, completion_tokens: 4 } });
    }
    throw new Error(`unexpected network call in test: ${url}`);
  };
  try {
    return await fn(orCalls);
  } finally {
    globalThis.fetch = real;
  }
}

async function runOnCustomerKey() {
  return withOpenRouter(async (orCalls) => {
    const h = await harness();
    await h.session.webSocketMessage(h.ws, JSON.stringify({ type: 'chat', text: 'build a small tower', mode: 'agent', model: MODEL }));
    const started = h.store.get('agent');
    assert.ok(started, `the run was not admitted: ${JSON.stringify(h.sent.filter((m) => m.type === 'error'))}`);
    const startedModel = started.customerModel?.modelId;
    await h.session.alarm();
    return { ...h, orCalls, startedModel, agent: h.store.get('agent') };
  });
}

test('a customer-key run is admitted onto the customer lane and remembers the model', async () => {
  const r = await runOnCustomerKey();
  assert.equal(r.startedModel, MODEL, 'the run state lost the customer model; every step would fall back to the Apple lane');
  assert.equal(r.agent.customerModel.keyOwnerId, 'owner-1', 'the key owner is the person who pressed send');
  const start = r.sent.find((m) => m.type === 'msg_start');
  assert.equal(start?.model, MODEL);
});

test('every step goes to OpenRouter with the customer key, never to Apple’s model', async () => {
  const r = await runOnCustomerKey();
  assert.ok(r.orCalls.length >= 1, 'the step never reached OpenRouter');
  for (const c of r.orCalls) {
    assert.equal(c.authorization, `Bearer ${KEY}`, 'the call did not carry the customer key');
    assert.equal(c.body.model, MODEL, 'the call asked OpenRouter for a different model');
  }
  // Measured 2026-09-23: this one-step run makes no Workers AI call at all. If a helper (memory,
  // title) ever starts using Apple's lane here, re-aim this to exclude that call by `kind` rather
  // than deleting it: the run's own step must never be answered by Apple's model.
  assert.deepEqual(r.aiRuns.map((a) => a.model), [], 'a call on this run went to Apple\u2019s model');
  assert.equal(JSON.stringify(r.sent).includes('apple lane answered'), false, 'the run step was answered by the Apple lane');
});

test('a customer-key run takes no Credit and no Apple budget reservation', async () => {
  const r = await runOnCustomerKey();
  const spends = r.doCalls.filter((c) => c.name === 'QUOTA_DO' && c.path === '/spend');
  assert.deepEqual(spends, [], 'Credits were taken for a run the customer is paying for');
  const budget = r.doCalls.filter((c) => c.name === 'BUDGET_DO' && (c.path === '/reserve' || c.path === '/settle'));
  assert.deepEqual(budget, [], 'the run reserved or settled against Apple\u2019s shared budget');
  assert.equal(r.agent.creditsSpent ?? 0, 0, 'the run claims Credits it must not have spent');
  const end = r.sent.find((m) => m.type === 'msg_end');
  assert.ok(end, 'the run never finished');
  assert.equal(end.creditsSpent ?? 0, 0);
});

test('after a reload the history names the model that ran, not Apple', async () => {
  const r = await runOnCustomerKey();
  const res = await r.session.fetch(new Request('https://do/messages'));
  const body = await res.json();
  const assistant = body.messages.find((m) => m.role === 'assistant');
  assert.ok(assistant, 'the run left no assistant message');
  assert.equal(assistant.model, MODEL, 'the history does not say which model ran');
  assert.equal(assistant.productModel, undefined, 'the history labels a customer-key run as an Apple model');
});

test('the key is never persisted in run state or in the transcript', async () => {
  const r = await runOnCustomerKey();
  assert.equal(JSON.stringify([...r.store.values()]).includes(KEY), false, 'the key is in DO storage');
  assert.equal(JSON.stringify(r.sql.messages).includes(KEY), false, 'the key is in the transcript');
  assert.equal(JSON.stringify(r.sent).includes(KEY), false, 'the key was broadcast');
});
