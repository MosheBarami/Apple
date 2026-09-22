// A customer's OWN OpenRouter key: stored sealed, opened for one call, and never spending Apple
// Credits (owner decisions D-BYOK-1, D-BYOK-2, D-FREE-1).
//
// MOST OF THIS FILE IS ABOUT WHAT MUST NOT HAPPEN. Every way a key store goes wrong looks fine from
// outside — the key round-trips, the run works — so the cases below watch the negative space: the
// plaintext is not in the row, the key is not in an error, a customer-key call does not reserve on
// Apple's budget, and a step on the customer's key does not bill a Credit.
//
// NO NETWORK. Every OpenRouter answer is a fixture handed to a fake fetch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = mkdtempSync(join(tmpdir(), 'byok-'));
function load(rel, label) {
  const out = join(TMP, `${label}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [join(WORKER, 'src', rel), '--bundle', '--format=esm', '--target=es2022', `--outfile=${out}`],
    { cwd: WORKER, stdio: 'pipe' });
  return import(`file://${out}`);
}
const OR = await load('providers/openrouter.ts', 'openrouter');
const K = await load('model-keys.ts', 'model-keys');
const CAT = await load('model-catalogue.ts', 'catalogue');
const RM = await load('run-model.ts', 'run-model');
const G = await load('gateway.ts', 'gateway');
const SNAP = await load('openrouter-snapshot.ts', 'snapshot');

const KEY = 'sk-or-v1-SENTINEL0123456789abcdef9f3e';
const SECRET = Buffer.from(new Uint8Array(32).map((_, i) => i * 7 + 3)).toString('base64');

function res(status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text, json: async () => JSON.parse(text) };
}

/* ---------------------------------------------------------------- a fake D1 --- */

function fakeD1() {
  const rows = new Map();
  const k = (u, p) => `${u}\u0000${p}`;
  return {
    rows,
    prepare(sql) {
      const stmt = (args) => ({
        async run() {
          if (/^insert into user_credentials/i.test(sql)) {
            const [userId, provider, sealed, fingerprint, hint, createdAt] = args;
            rows.set(k(userId, provider), { user_id: userId, provider, sealed, fingerprint, hint, created_at: createdAt });
            return { meta: { changes: 1 } };
          }
          if (/^delete from user_credentials/i.test(sql)) return { meta: { changes: rows.delete(k(args[0], args[1])) ? 1 : 0 } };
          return { meta: { changes: 0 } };
        },
        async first() {
          return rows.get(k(args[0], args[1])) ?? null;
        },
        async all() {
          const [userId, ...providers] = args;
          return { results: [...rows.values()].filter((r) => r.user_id === userId && providers.includes(r.provider)) };
        },
      });
      return { bind: (...args) => stmt(args), run: async () => ({ meta: { changes: 0 } }) };
    },
  };
}

/* ------------------------------------------------------------ the provider --- */

test('the OpenRouter call carries the key only in the Authorization header, with attribution', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    return res(200, { choices: [{ finish_reason: 'stop', message: { content: 'ok' } }], usage: { prompt_tokens: 3, completion_tokens: 1 } });
  };
  const enc = OR.encodeOpenRouterChat({ modelId: 'openai/gpt-6-sol', messages: [{ role: 'user', content: 'hi' }], maxTokens: 100, temperature: 0.2, reasoningEffort: 'low' });
  await OR.postOpenRouterChat(KEY, enc.payload, fetchImpl);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(seen[0].init.headers.authorization, `Bearer ${KEY}`);
  assert.ok(seen[0].init.headers['HTTP-Referer'], 'no HTTP-Referer attribution');
  assert.equal(seen[0].init.headers['X-Title'], 'Apple');
  assert.equal(seen[0].init.body.includes(KEY), false, 'the key is in the request BODY');
  const body = JSON.parse(seen[0].init.body);
  assert.equal(body.max_tokens, 100);
  assert.deepEqual(body.reasoning, { effort: 'low' }, 'OpenRouter reads reasoning.effort');
  assert.equal('reasoning_effort' in body, false);
});

test('decode keeps tool calls, usage, and marks a length finish as truncated', () => {
  const r = OR.openrouterAdapter.decode({
    choices: [{ finish_reason: 'length', message: { content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'create_instances', arguments: '{"a":' } }] } }],
    usage: { prompt_tokens: 10, completion_tokens: 6500 },
  }, 40, 'openai/gpt-6-sol');
  assert.equal(r.provider, 'openrouter');
  assert.equal(r.truncated, true);
  assert.equal(r.toolCalls.length, 1);
  assert.deepEqual([r.usage.inputTokens, r.usage.outputTokens], [10, 6500]);
});

test('a refused key becomes a plain customer-facing sentence that does not carry the key', async () => {
  for (const [status, kind] of [[401, 'auth'], [403, 'content_filter'], [402, 'unknown']]) {
    const echo = { error: { message: `bad key ${KEY}` } };
    const e = await OR.postOpenRouterChat(KEY, {}, async () => res(status, echo)).catch((x) => x);
    assert.equal(OR.isCustomerKeyError(e), true, `${status} is not a customer-key error`);
    assert.equal(e.kind, kind);
    assert.equal(e.retryable, false);
    assert.equal(String(e.message).includes(KEY), false, `${status}: the key is in the error`);
    assert.equal(/on our side/i.test(e.message), false);
  }
});

test('a 403 is a blocked request, not a broken key: the customer is not sent to Settings', async () => {
  // OpenRouter documents 403 as "insufficient permissions, guardrail block, or moderation flag".
  const flagged = { error: { code: 403, message: 'Input was flagged', metadata: { reasons: ['violence'], flagged_input: 'x' } } };
  const e = await OR.postOpenRouterChat(KEY, {}, async () => res(403, flagged)).catch((x) => x);
  assert.equal(OR.isCustomerKeyError(e), true);
  assert.notEqual(e.kind, 'auth', 'a moderation flag is reported as a key failure');
  assert.equal(/\bkey\b|Settings/i.test(e.message), false, `a 403 tells the customer their key is the problem: ${e.message}`);
  const bad = await OR.postOpenRouterChat(KEY, {}, async () => res(401, { error: { message: 'nope' } })).catch((x) => x);
  assert.equal(bad.kind, 'auth', 'a 401 must still say the key was refused');
  assert.match(bad.message, /key/i);
});

test('any other refusal is scrubbed of the key and classified; a 429 is free to retry', async () => {
  const e = await OR.postOpenRouterChat(KEY, {}, async () => res(429, { error: { message: `slow down ${KEY}` } })).catch((x) => x);
  assert.equal(e.kind, 'rate_limit');
  assert.equal(e.retryable, true);
  assert.equal(String(e.message).includes(KEY), false);
  const t = await OR.postOpenRouterChat(KEY, {}, async () => res(503, 'upstream down')).catch((x) => x);
  assert.equal(t.kind, 'transient');
});

test('a 200 carrying an error object and no choices is a failure, not an empty answer', async () => {
  const e = await OR.postOpenRouterChat(KEY, {}, async () => res(200, { error: { code: 502, message: 'provider failed' } })).catch((x) => x);
  assert.ok(e instanceof Error, 'an upstream error was decoded as a silent stop');
});

test('the key check asks GET /api/v1/key and has three answers', async () => {
  const urls = [];
  const at = (status) => async (url, init) => { urls.push([url, init.method, init.headers.authorization]); return res(status, {}); };
  assert.equal(await OR.checkOpenRouterKey(KEY, at(200)), 'valid');
  assert.equal(await OR.checkOpenRouterKey(KEY, at(401)), 'invalid');
  assert.equal(await OR.checkOpenRouterKey(KEY, at(500)), 'unchecked');
  assert.equal(await OR.checkOpenRouterKey(KEY, async () => { throw new Error('offline'); }), 'unchecked');
  assert.deepEqual(urls[0], ['https://openrouter.ai/api/v1/key', 'GET', `Bearer ${KEY}`]);
});

/* -------------------------------------------------------------- key storage --- */

test('WITHOUT the secret nothing is stored and the key is not even sent to be checked', async () => {
  const db = fakeD1();
  let checked = 0;
  const r = await K.saveModelKey({ CORPUS: db }, 'u1', 'openrouter', KEY, async () => { checked += 1; return 'valid'; });
  assert.equal(r.ok, false);
  assert.equal(r.status, 503);
  assert.equal(db.rows.size, 0, 'a row was written with no sealing key');
  assert.equal(checked, 0, 'the key was sent to OpenRouter although it could not be kept');
  assert.equal(JSON.stringify(r).includes(KEY), false);
  assert.equal(await K.openModelKey({ CORPUS: db }, 'u1', 'openrouter'), null);
});

test('a saved key is sealed: the row holds neither the key nor anything but its last four', async () => {
  const db = fakeD1();
  const env = { CORPUS: db, BYOK_ENCRYPTION_KEY: SECRET };
  const r = await K.saveModelKey(env, 'u1', 'openrouter', `  ${KEY}\n`, async () => 'valid');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.key).sort(), ['addedAt', 'last4', 'provider']);
  assert.equal(r.key.last4, KEY.slice(-4));
  assert.equal(r.check, 'valid');
  const row = db.rows.get('u1\u0000openrouter');
  assert.ok(row, 'nothing was stored');
  assert.equal(JSON.stringify(row).includes(KEY), false, 'the plaintext key is in the database row');
  assert.equal(JSON.stringify(r).includes(KEY), false, 'the plaintext key is in the response');
  assert.equal(await K.openModelKey(env, 'u1', 'openrouter'), KEY, 'the key does not round-trip for the run');
  assert.equal(await K.openModelKey(env, 'u2', 'openrouter'), null, 'another user opened this key');
  assert.equal(await K.openModelKey({ CORPUS: db, BYOK_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64') }, 'u1', 'openrouter'), null,
    'a different secret opened the row');
});

test('every write takes a fresh IV, so the same key saved twice is two different rows', async () => {
  const db = fakeD1();
  const env = { CORPUS: db, BYOK_ENCRYPTION_KEY: SECRET };
  await K.saveModelKey(env, 'u1', 'openrouter', KEY, async () => 'valid');
  const first = db.rows.get('u1\u0000openrouter').sealed;
  await K.saveModelKey(env, 'u1', 'openrouter', KEY, async () => 'valid');
  const second = db.rows.get('u1\u0000openrouter').sealed;
  assert.notEqual(first.split('.')[0], second.split('.')[0], 'the IV was reused');
  assert.notEqual(first, second);
});

test('an invalid key is refused and stored nowhere; an unchecked one is stored and says so', async () => {
  const db = fakeD1();
  const env = { CORPUS: db, BYOK_ENCRYPTION_KEY: SECRET };
  const bad = await K.saveModelKey(env, 'u1', 'openrouter', KEY, async () => 'invalid');
  assert.equal(bad.ok, false);
  assert.equal(bad.check, 'invalid');
  assert.equal(db.rows.size, 0);
  const shape = await K.saveModelKey(env, 'u1', 'openrouter', 'short', async () => 'valid');
  assert.equal(shape.ok, false);
  const maybe = await K.saveModelKey(env, 'u1', 'openrouter', KEY, async () => 'unchecked');
  assert.equal(maybe.ok, true);
  assert.equal(maybe.check, 'unchecked');
});

test('the list is provider, last four and date only; delete removes it', async () => {
  const db = fakeD1();
  const env = { CORPUS: db, BYOK_ENCRYPTION_KEY: SECRET };
  await K.saveModelKey(env, 'u1', 'openrouter', KEY, async () => 'valid');
  const list = await K.listModelKeys(env, 'u1');
  assert.equal(list.length, 1);
  assert.deepEqual(Object.keys(list[0]).sort(), ['addedAt', 'last4', 'provider']);
  assert.equal(JSON.stringify(list).includes(KEY.slice(0, -4)), false);
  assert.deepEqual(await K.listModelKeys(env, 'u2'), []);
  assert.equal(await K.deleteModelKey(env, 'u1', 'openrouter'), true);
  assert.deepEqual(await K.listModelKeys(env, 'u1'), []);
});

/* ----------------------------------------------------------------- catalogue --- */

const LIVE = {
  data: [
    { id: 'acme/free-builder:free', name: 'Acme: Free Builder (free)', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools', 'temperature'] },
    { id: 'acme/free-chatter:free', name: 'Acme: Free Chatter (free)', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['temperature'] },
    { id: 'acme/paid:x', name: 'Acme: Paid', pricing: { prompt: '0.000001', completion: '0' }, supported_parameters: ['tools'] },
    { id: 'openrouter/free', name: 'Free Models Router', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'] },
  ],
};

test('free models are DERIVED from the live read: zero price and tools, routers excluded', async () => {
  CAT.resetCatalogueCache();
  const cat = await CAT.modelCatalogue({}, { now: 1_000, fetchImpl: async () => res(200, LIVE) });
  const free = cat.models.filter((m) => m.free);
  assert.deepEqual(free.map((m) => m.id), ['acme/free-builder:free']);
  assert.equal(free[0].vendor, 'Acme');
  assert.equal(free[0].label, 'Free Builder (free)');
  assert.equal(free[0].requiresKey, true, 'without a platform key a free model must say it needs the customer key');
  assert.equal(cat.free.source, 'live');
  assert.equal(cat.free.readAt, new Date(1_000).toISOString());
  assert.equal(cat.free.keyless, false);
});

test('the live read is cached for an hour, then read again', async () => {
  CAT.resetCatalogueCache();
  let reads = 0;
  const f = async () => { reads += 1; return res(200, LIVE); };
  await CAT.modelCatalogue({}, { now: 0, fetchImpl: f });
  await CAT.modelCatalogue({}, { now: CAT.FREE_CACHE_MS - 1, fetchImpl: f });
  assert.equal(reads, 1, 'the cache did not hold');
  await CAT.modelCatalogue({}, { now: CAT.FREE_CACHE_MS + 1, fetchImpl: f });
  assert.equal(reads, 2, 'the cache never expires');
});

test('a failed read falls back to the snapshot and says when that list was read', async () => {
  for (const f of [async () => { throw new Error('offline'); }, async () => res(500, 'x'), async () => res(200, { data: [] })]) {
    CAT.resetCatalogueCache();
    const cat = await CAT.modelCatalogue({}, { now: 5, fetchImpl: f });
    assert.equal(cat.free.source, 'snapshot');
    assert.equal(cat.free.readAt, SNAP.OPENROUTER_SNAPSHOT_READ_AT);
    const expected = SNAP.OPENROUTER_SNAPSHOT.filter((m) => m.free && m.tools && !m.id.startsWith('openrouter/')).map((m) => m.id);
    assert.ok(expected.length > 0, 'the snapshot has no free models; this checks nothing');
    assert.deepEqual(cat.models.filter((m) => m.free).map((m) => m.id), expected);
  }
});

test('a platform key makes free models keyless; paid ones still need the customer key', async () => {
  CAT.resetCatalogueCache();
  const cat = await CAT.modelCatalogue({ OPENROUTER_API_KEY: 'sk-or-platform-000000000000' }, { now: 0, fetchImpl: async () => res(200, LIVE) });
  assert.equal(cat.free.keyless, true);
  assert.ok(cat.models.filter((m) => m.free).every((m) => m.requiresKey === false));
  assert.ok(cat.models.filter((m) => !m.free && !m.builtIn).every((m) => m.requiresKey === true));
});

test('no model id is invented: every paid entry is a snapshot id with tools, and Apple’s own come first', async () => {
  CAT.resetCatalogueCache();
  const cat = await CAT.modelCatalogue({}, { now: 0, fetchImpl: async () => res(200, LIVE) });
  const snap = new Map(SNAP.OPENROUTER_SNAPSHOT.map((m) => [m.id, m]));
  assert.equal(CAT.CURATED_PAID_IDS.every((id) => snap.has(id) && snap.get(id).tools), true, 'a curated id is not in the snapshot');
  const paid = cat.models.filter((m) => !m.builtIn && !m.free);
  assert.equal(paid.length, CAT.CURATED_PAID_IDS.length);
  for (const m of paid) {
    assert.ok(snap.has(m.id), `${m.id} is not a model OpenRouter listed`);
    assert.equal(`${m.vendor}: ${m.label}`, snap.get(m.id).name, `${m.id}'s label was written by hand`);
  }
  assert.deepEqual(cat.models.filter((m) => m.builtIn).map((m) => m.id), ['apple', 'apple-max']);
  assert.equal(cat.models[0].builtIn, true);
  for (const m of cat.models) {
    assert.deepEqual(Object.keys(m).sort(), ['builtIn', 'free', 'id', 'label', 'requiresKey', 'supportsTools', 'vendor']);
  }
});

/* ---------------------------------------------------------- the run's model --- */

test('the frame model resolves to the Apple lane, the customer lane, or a refusal', async () => {
  RM.resetCatalogueCache?.();
  const opts = { now: 0, fetchImpl: async () => res(200, LIVE) };
  assert.deepEqual(await RM.resolveRunModel({}, undefined, 'apple-max', opts), { lane: 'apple', productModel: 'apple-max' });
  assert.deepEqual(await RM.resolveRunModel({}, 'apple-max', undefined, opts), { lane: 'apple', productModel: 'apple-max' });
  assert.equal((await RM.resolveRunModel({}, 'apple-max', 'apple', opts)).lane, 'refused', 'two different Apple models were accepted');
  const paid = await RM.resolveRunModel({}, 'openai/gpt-6-sol', undefined, opts);
  assert.deepEqual(paid, { lane: 'customer', modelId: 'openai/gpt-6-sol', label: 'GPT-6 Sol', free: false });
  assert.equal((await RM.resolveRunModel({}, 'acme/free-builder:free', undefined, opts)).free, true);
  assert.equal((await RM.resolveRunModel({}, 'acme/free-chatter:free', undefined, opts)).lane, 'refused', 'a model without tools was accepted');
  assert.equal((await RM.resolveRunModel({}, 'made-up/model', undefined, opts)).lane, 'refused');
  assert.equal((await RM.resolveRunModel({}, 'x'.repeat(300), undefined, opts)).lane, 'refused');
  assert.equal((await RM.resolveRunModel({}, 42, undefined, opts)).lane, 'refused');
});

test('a run spends the customer key; only a FREE model may fall back to the platform key', async () => {
  const db = fakeD1();
  const env = { CORPUS: db, BYOK_ENCRYPTION_KEY: SECRET };
  const paid = { free: false, keyOwnerId: 'u1', label: 'GPT-6 Sol' };
  const none = await RM.keyForRun(env, paid);
  assert.equal(none.ok, false);
  assert.match(none.message, /Add your OpenRouter key/);
  assert.equal((await RM.keyForRun({ ...env, OPENROUTER_API_KEY: 'sk-or-platform-000000000000' }, paid)).ok, false,
    'a paid model ran on Apple’s platform key');
  const free = await RM.keyForRun({ ...env, OPENROUTER_API_KEY: 'sk-or-platform-000000000000' }, { ...paid, free: true });
  assert.equal(free.ok, true);
  await K.saveModelKey(env, 'u1', 'openrouter', KEY, async () => 'valid');
  const own = await RM.keyForRun(env, paid);
  assert.deepEqual(own, { ok: true, apiKey: KEY });
});

/* ------------------------------------------------------------- the gateway --- */

function budgetEnv({ killed = false } = {}) {
  const calls = [];
  return {
    calls,
    env: {
      AI: { run: async () => { throw new Error('the Workers AI binding was used for a customer-key call'); } },
      KV: { get: async () => null },
      AI_GATEWAY_ID: 'test',
      ENVIRONMENT: 'test',
      BUDGET_DO: {
        idFromName: () => 'singleton',
        get: () => ({
          fetch: async (url) => {
            calls.push(new URL(url).pathname);
            if (url.endsWith('/state')) return { json: async () => ({ killed, killedReason: killed ? 'paused' : null }) };
            return { json: async () => ({ ok: true, reserved: 1 }) };
          },
        }),
      },
    },
  };
}

async function withFetch(impl, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = impl;
  try { return await fn(); } finally { globalThis.fetch = real; }
}

const REQ = { model: 'agent', messages: [{ role: 'user', content: 'build a door' }], tools: [{ name: 'get_selection', description: 'd', parameters: { type: 'object' } }], reasoningEffort: 'high' };

test('a customer-key call goes to OpenRouter, touches no budget ledger, and costs zero neurons', async () => {
  G.resetModelCache();
  const { env, calls } = budgetEnv();
  const sent = [];
  const r = await withFetch(async (url, init) => {
    sent.push({ url, init });
    return res(200, { choices: [{ finish_reason: 'tool_calls', message: { content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_selection', arguments: '{}' } }] } }], usage: { prompt_tokens: 900, completion_tokens: 40 } });
  }, () => G.chat(env, REQ, { kind: 'agent:step', customerKey: { provider: 'openrouter', apiKey: KEY, modelId: 'openai/gpt-6-sol' } }));
  assert.equal(sent.length, 1);
  assert.equal(JSON.parse(sent[0].init.body).model, 'openai/gpt-6-sol');
  assert.equal(r.provider, 'openrouter');
  assert.equal(r.neurons, 0, 'a customer-key call reported Apple spend');
  assert.equal(r.toolCalls.length, 1);
  assert.deepEqual(calls, ['/state'], 'a customer-key call reserved or settled on Apple’s budget');
  assert.equal('reasoning' in JSON.parse(sent[0].init.body), false, 'an unmeasured reasoning effort was sent');
  assert.equal(JSON.stringify(r).includes(KEY), false);
});

test('the kill switch still stops a customer-key call before it reaches OpenRouter', async () => {
  G.resetModelCache();
  const { env } = budgetEnv({ killed: true });
  let reached = 0;
  const e = await withFetch(async () => { reached += 1; return res(200, {}); },
    () => G.chat(env, REQ, { customerKey: { provider: 'openrouter', apiKey: KEY, modelId: 'openai/gpt-6-sol' } })).catch((x) => x);
  assert.equal(e?.name, 'BudgetError');
  assert.equal(reached, 0);
});

test('a customer-key failure leaves the gateway without the key in it', async () => {
  G.resetModelCache();
  const { env } = budgetEnv();
  const e = await withFetch(async () => res(400, { error: { message: `bad request for ${KEY}` } }),
    () => G.chat(env, REQ, { customerKey: { provider: 'openrouter', apiKey: KEY, modelId: 'openai/gpt-6-sol' } })).catch((x) => x);
  assert.ok(e instanceof Error);
  assert.equal(String(e.message).includes(KEY), false, 'the key is in the gateway error');
});

test('an OpenRouter rate limit on the customer lane is not reported as Apple being busy', async () => {
  G.resetModelCache();
  const { env } = budgetEnv();
  // The ladder waits 63 s in total; the waits are real setTimeouts, so they fire at once here.
  const realTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => realTimeout(fn, 0);
  let attempts = 0;
  try {
    const e = await withFetch(async () => { attempts++; return res(429, { error: { message: 'Rate limit exceeded: free-models-per-min' } }); },
      () => G.chat(env, REQ, { customerKey: { provider: 'openrouter', apiKey: KEY, modelId: 'openai/gpt-6-sol' } })).catch((x) => x);
    assert.equal(e?.name, 'RateLimitedError', `expected the ladder to end in a RateLimitedError, got ${e}`);
    assert.ok(attempts > 1, 'a free-to-retry 429 was not retried');
    assert.equal(/\bApple\b/.test(e.message), false, `the customer lane blames Apple: ${e.message}`);
    assert.match(e.message, /OpenRouter/);
  } finally {
    globalThis.setTimeout = realTimeout;
  }
});

test('the Apple lane is unchanged: it still reserves and settles', async () => {
  G.resetModelCache();
  const { env, calls } = budgetEnv();
  env.AI.run = async () => ({ choices: [{ finish_reason: 'stop', message: { content: 'ok' } }], usage: { prompt_tokens: 5, completion_tokens: 1 } });
  const r = await G.chat(env, { model: 'agent', messages: [{ role: 'user', content: 'hi' }] }, {});
  assert.ok(r.neurons > 0);
  assert.deepEqual(calls, ['/reserve', '/settle']);
});

/* ---------------------------------------------------- the session's billing --- */

const SESSION = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8').replace(/\/\/.*$/gm, '');

test('a customer-key run takes no admission Credit and no per-step Credits', () => {
  // creditsForNeurons has a floor of one Credit, so a step reporting zero neurons would still bill
  // one unless the settlement is gated on the lane. Both charges must be.
  assert.match(SESSION, /const quota = customerModel \? null : await this\.quotaSpend\(/, 'the admission Credit is taken on the customer lane');
  assert.match(SESSION, /const owed = agent\.customerModel \? 0 : creditsForNeurons\(/, 'per-step Credits are billed on the customer lane');
  assert.match(SESSION, /creditsSpent: quota \? 1 : 0/, 'the run claims a Credit it did not take');
  assert.match(SESSION, /if \(agent\.step > 1 && !agent\.customerModel\)/, 'an empty Credit balance stops a run the customer is paying for');
});

test('the run remembers the model and whose key, never the key', () => {
  const src = readFileSync(join(WORKER, 'src', 'run-model.ts'), 'utf8');
  const iface = /export interface CustomerRunModel \{([\s\S]*?)\n\}/.exec(src);
  assert.ok(iface, 'CustomerRunModel could not be read');
  const fields = [...iface[1].replace(/\/\*\*[\s\S]*?\*\//g, '').matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1]).sort();
  assert.deepEqual(fields, ['free', 'keyOwnerId', 'label', 'modelId', 'provider']);
  assert.equal(/agent\.[\w.]+\s*=\s*[^;\n]*apiKey/.test(SESSION), false, 'a key is assigned onto the run state');
  assert.match(SESSION, /customerKey = \{ provider: 'openrouter', apiKey: key\.apiKey, modelId: agent\.customerModel\.modelId \}/);
});
