// Apple page backend: no network. fetch is a fake worker that answers the admin GET routes and
// /api/health; the admin key is a sentinel, and so are the per-user fields a real log carries (actor
// and project ids, run ids, error messages, uuid route scopes) and key fragments in places a changed
// upstream shape could put them. No return value may carry any, and no call may be anything but GET.
//   node --test scripts/owner-dashboard/cc/apple.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const S = { key: 'SENTINEL_APPLE_ADMIN_KEY', actor: 'user_SENTINEL_ACTOR', actor2: 'user_SENTINEL_OTHER', project: 'proj_SENTINEL_PROJECT',
  run: 'SENTINEL_RUN_TAIL', email: 'owner.sentinel@example.test', message: 'SENTINEL_ERROR_MESSAGE', uuid: '0f8fad5b-d9cb-469f-a165-70867728950e',
  stripe: 'sk_live_SENTINEL_STRIPE', price: 'price_SENTINEL_PRICE', model: 'SENTINEL_MODEL_KEY', health: 'SENTINEL_HEALTH_EXTRA' };
const clean = (x) => { const s = JSON.stringify(x); for (const [k, v] of Object.entries(S)) assert.ok(!s.includes(v), `leaked ${k}: ${v}`); };

const env = () => { process.env.GOLEM_ADMIN_KEY = S.key; process.env.API_BASE = 'http://apple.test'; };
env();
const { apple, appleAction, appleConclusions, NOT_EXPOSED } = await import('./platforms/apple.mjs');
const { uncache } = await import('./http.mjs');
const { WORKER_URL } = await import('./platforms/cloudflare.mjs');
const REPO = new URL('../../..', import.meta.url).pathname;
const head = () => execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO }).toString().trim();

const M = (value) => ({ known: true, value, samples: 10, unreadable: 0, complete: true });
const T = Date.parse('2026-09-23T18:00:00Z');
const ANALYTICS = {
  window: { events: 5000, fromMs: T - 2.5 * 3600e3, toMs: T, complete: false },
  counts: { request: 3400, model_call: 36, error: 1, build: 1, audit: 12 },
  cost: { calls: 36, usd: M(0.42), neurons: M(12000), byModel: [{ key: '@cf/zai-org/glm-5.3-flash', calls: 30, usd: M(0.4), neurons: M(11000) }],
    byFeature: [{ key: 'build', calls: 30, usd: M(0.4), neurons: M(11000) }] },
  tokens: { calls: 36, input: M(9000), output: M(1200), cachedInput: M(3000), total: M(10200), cacheHitRate: M(0.33) },
  latency: { model: { samples: 36, p50: M(900), p95: M(4200) }, request: { samples: 3400, p50: M(4), p95: M(250) }, build: { samples: 1, p50: M(817000), p95: M(817000) } },
  success: { requests: { total: 3400, ok: 3390, failed: 10, rate: M(0.997) }, modelCalls: { total: 36, ok: 36, failed: 0, rate: M(1) } },
  errors: { total: 1, byKind: [{ key: 'server_error', count: 1 }], byScope: [{ key: `/api/projects/${S.uuid}/build`, count: 1 }] },
  features: { rows: [{ feature: `/api/admin/account/${S.uuid}`, events: 3, actors: { known: false, value: null }, lastAt: T }, { feature: '/api/health', events: 1798, lastAt: T }] },
  audit: { total: 12, refused: 0, byAction: [{ key: `grant-credits/${S.uuid}`, count: 2 }] },
};
const SPEND = {
  state: { day: '2026-09-23', month: '2026-09', dayNeurons: 59600, monthBillableNeurons: 257500, killed: false, killedReason: null, dayRemainingFraction: 0.4,
    estimatedMonthUsd: 3.14, thirdParty: { dayUsd: 0, monthUsd: 0, dayCeilingUsd: 2, monthCeilingUsd: 60 } },
  limits: { freeNeuronsPerDay: 10000, billableNeuronsPerDay: 90000, billableNeuronsPerMonth: 1800000 }, maxMonthlyUsd: 19.8,
  days: [{ day: '2026-09-23', neurons: 59600, calls: 40, billableUsd: 0.55 }, { day: '2026-09-22', neurons: 10000, calls: 9, billableUsd: 0.05 }],
  breakdown: [{ day: '2026-09-23', model: '@cf/zai-org/glm-5.3-flash', kind: 'apple:step:low', neurons: 9000, calls: 30, usd: 0.1 },
    { day: '2026-09-22', model: '@cf/openai/gpt-oss-120b', kind: 'stone', neurons: 1000, calls: 4, usd: 0.01 }],
};
const ev = (o) => ({ actorId: S.actor, projectId: S.project, ...o });
const FIX = {
  '/api/admin/analytics': ANALYTICS,
  '/api/admin/spend': SPEND,
  '/api/admin/billing-wiring': { worker: 'apple', isAuthority: true, webhookSecret: true, stripeApiKey: S.stripe, production: true,
    priceIds: { builder: S.price, studio: true }, why: `key ${S.stripe} is wrong` },
  '/api/admin/stats': { counters: [{ day: '2026-09-23', key: 'studio.pair', value: 12 }, { day: '2026-09-22', key: 'studio.pair', value: 4 }] },
  '/api/admin/logs?kind=build': { kind: 'build', retained: 1, truncated: false, events: [ev({ kind: 'build', at: T - 7200e3, runId: `2e381849-${S.run}`, outcome: 'done',
    steps: 142, opsApplied: 128, opsFailed: 5, durationMs: 817000, neurons: 17500, finishReason: 'stop' })] },
  '/api/admin/logs?kind=error': { kind: 'error', retained: 1, truncated: false, events: [{ kind: 'error', at: T - 2100e3, actorId: S.actor2, projectId: null, runId: null,
    scope: `/api/admin/billing-reconcile/${S.uuid}`, errorKind: 'server_error', message: `${S.message} for ${S.email}`, fatal: false }] },
  '/api/admin/logs?kind=model_call': { kind: 'model_call', retained: 2, truncated: false, events: [
    ev({ kind: 'model_call', at: T - 60e3, runId: `r-${S.run}`, provider: 'workers-ai', model: '@cf/zai-org/glm-5.3-flash', feature: `build/${S.uuid}`, outcome: 'ok', latencyMs: 900, inputTokens: 900, outputTokens: 50, neurons: 300 }),
    ev({ kind: 'model_call', at: T - 90e3, actorId: S.actor2, runId: null, provider: 'workers-ai', model: '@cf/openai/gpt-oss-120b', feature: 'chat', outcome: 'ok', latencyMs: 700, neurons: 100 })] },
  '/api/admin/models': { plan: { id: '@cf/zai-org/glm-5.3-flash', nativeTools: true, maxTokens: 6500, apiKey: S.model }, memory: { id: '@cf/qwen/qwen3-30b-a3b-fp8', nativeTools: false, maxTokens: 800 } },
  '/api/admin/model-routing': { models: [{ id: '@cf/openai/gpt-oss-120b', provider: 'workers-ai', label: 'GPT-OSS 120B', available: true, unavailableReason: `token ${S.model}`,
    supportsTools: true, supportsVision: false, inputCostPer1M: 0.35, outputCostPer1M: 0.75 }], auto: { model: '@cf/openai/gpt-oss-120b', reasoning: S.model } },
  '/api/admin/corpus-census': { known: true, chunks: 8333, embedded: 4348 },
  '/api/admin/product-analytics': { configured: false, why: 'CF_ACCOUNT_ID and the CF_ANALYTICS_TOKEN secret are needed' },
  '/api/admin/static-list': [{ path: '/assets/a.js', n_chunks: 2, content_type: 'text/javascript; charset=utf-8', immutable: 1, updated_at: T - 3600e3 },
    { path: '/assets/b.png', n_chunks: 1, content_type: 'image/png', immutable: 0, updated_at: T - 7200e3 }],
};

let mode = 'fixture'; let buildSha = null;
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)); const method = init.method || 'GET'; const h = init.headers || {};
  calls.push({ method, host: u.host, path: u.pathname, key: h['x-admin-key'] ?? null, body: init.body ?? null });
  const echo = `x-admin-key=${h['x-admin-key'] || ''}`;
  if (mode === 'throw') throw Object.assign(new Error(`connect ECONNREFUSED ${echo}`), { name: 'TypeError' });
  if (['401', '403', '500'].includes(mode)) return new Response(JSON.stringify({ error: `denied ${echo}`, buildSha: null }), { status: Number(mode), headers: { 'content-type': 'application/json' } });
  const json = (b) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
  if (`${u.origin}` === WORKER_URL && u.pathname === '/api/health') return json({ ok: true, version: '1.0.0', buildSha, time: 'now', debug: S.health });
  const kind = u.searchParams.get('kind');
  const body = FIX[kind ? `${u.pathname}?kind=${kind}` : u.pathname];
  return body ? json(body) : new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
};

beforeEach(() => { mode = 'fixture'; buildSha = `${head()}-dirty`; calls.length = 0; uncache('apple'); env(); });

test('apple(): shape from realistic worker bodies; ids, messages, scopes and key fragments are not forwarded', async () => {
  const d = await apple();
  assert.equal(d.ok, true); assert.equal(d.configured, true); assert.deepEqual(d.errors, {});
  assert.equal(d.health.httpStatus, 200);
  assert.equal(d.version.known, true); assert.equal(d.version.dirty, true); assert.equal(d.version.buildSha, buildSha);
  assert.ok(Number.isInteger(d.version.behind) && d.version.behind >= 0 && Number.isInteger(d.version.workerBehind));
  assert.equal(d.window.events, 5000); assert.equal(d.window.hours, 2.5); assert.equal(d.window.complete, false);
  assert.equal(d.spend.monthUsd, 3.14); assert.equal(d.spend.maxMonthlyUsd, 19.8); assert.equal(d.spend.killed, false);
  assert.deepEqual(d.spend.days.map((x) => x.day), ['2026-09-22', '2026-09-23'], 'the spend days are oldest first for the chart');
  assert.deepEqual(d.modelMix.models.map((m) => [m.model, m.share]), [['@cf/zai-org/glm-5.3-flash', 0.9], ['@cf/openai/gpt-oss-120b', 0.1]]);
  assert.equal(d.modelMix.from, '2026-09-22'); assert.equal(d.modelMix.to, '2026-09-23');
  assert.equal(d.actors.distinct, 2, 'actors are counted, across builds and model calls');
  assert.equal(d.builds.recent[0].k, '2e381849', 'a run id is cut to its first 8 characters');
  assert.equal(d.errorLog.recent[0].scope, '/api/admin/billing-reconcile/:id');
  assert.deepEqual(d.errorsByScope, [{ key: '/api/projects/:id/build', count: 1 }]);
  assert.equal(d.features[0].feature, '/api/admin/account/:id'); assert.equal(d.audit.byAction[0].key, 'grant-credits/:id');
  assert.deepEqual(d.models, [{ role: 'plan', id: '@cf/zai-org/glm-5.3-flash', maxTokens: 6500, tools: true }, { role: 'memory', id: '@cf/qwen/qwen3-30b-a3b-fp8', maxTokens: 800, tools: false }]);
  assert.equal(d.routing[0].inPer1M, 0.35);
  assert.deepEqual(d.corpus, { chunks: 8333, embedded: 4348 });
  assert.equal(d.static.files, 2); assert.equal(d.static.chunks, 3); assert.equal(d.static.types[0].key, 'text/javascript');
  assert.deepEqual(d.counters['studio.pair'], { '2026-09-23': 12, '2026-09-22': 4 });
  assert.equal(d.gauntlet.source, 'docs/gauntlet/visual/rounds');
  // A key-shaped value where an enum belongs is dropped, not forwarded.
  assert.equal(d.billing.keyMode, null); assert.equal(d.billing.why, null); assert.deepEqual(d.billing.prices, { builder: true, studio: true });
  assert.deepEqual(d.notExposed.map((x) => x.k), NOT_EXPOSED.map((x) => x.k));
  assert.ok(d.conclusions.length >= 2 && d.conclusions.length <= 4);
  clean(d);
  // 11 admin routes + static-list + health, every one a GET; the key goes only to the configured base.
  assert.equal(calls.length, 13);
  assert.ok(calls.every((c) => c.method === 'GET' && c.body === null), 'only GET, no body');
  for (const c of calls) assert.equal(c.key, c.host === 'apple.test' ? S.key : null, `${c.host}${c.path}`);
  assert.deepEqual(calls.filter((c) => c.host !== 'apple.test').map((c) => `${c.host}${c.path}`), [`${new URL(WORKER_URL).host}/api/health`]);
});

test('apple(): the worker enums still pass when they are what the worker sends', async () => {
  const w = FIX['/api/admin/billing-wiring'];
  const saved = { ...w };
  Object.assign(w, { stripeApiKey: 'test', why: 'stripe_api_key_is_a_test_key_in_production', priceIds: { builder: true, studio: false } });
  try {
    const d = await apple();
    assert.deepEqual([d.billing.keyMode, d.billing.why, d.billing.prices], ['test', 'stripe_api_key_is_a_test_key_in_production', { builder: true, studio: false }]);
    assert.ok(d.conclusions.some((c) => c.k === 'billing' && c.tone === 'warn'));
  } finally { Object.assign(w, saved); }
});

test('apple(): no GOLEM_ADMIN_KEY means not connected, the missing name, and zero fetch calls', async () => {
  delete process.env.GOLEM_ADMIN_KEY; delete process.env.API_BASE;
  const d = await apple();
  assert.deepEqual([d.ok, d.configured, d.need], [true, false, ['GOLEM_ADMIN_KEY']]);
  assert.deepEqual(d.notExposed.map((x) => x.k), ['credits', 'users', 'd1', 'r2', 'gauntlet']);
  assert.equal(calls.length, 0);
});

for (const m of ['401', '403', '500', 'throw']) {
  test(`apple(): upstream ${m} fails calmly and never echoes the key`, async () => {
    mode = m;
    const d = await apple();
    assert.equal(d.ok, false);
    assert.equal(typeof d.reason, 'string'); assert.ok(d.reason.length > 0);
    assert.ok(Object.keys(d.errors).includes('analytics'));
    clean(d);
    assert.ok(calls.every((c) => c.method === 'GET'));
  });
}

test('apple(): one failing route is named in errors, its neighbours still render', async () => {
  const saved = FIX['/api/admin/spend']; delete FIX['/api/admin/spend'];
  try {
    const d = await apple();
    assert.equal(d.ok, true); assert.deepEqual(Object.keys(d.errors), ['spend']);
    assert.equal(d.spend, null); assert.equal(d.modelMix, null); assert.equal(d.corpus.chunks, 8333);
    clean(d);
  } finally { FIX['/api/admin/spend'] = saved; }
});

test('appleAction: dryRun refresh returns the exact read plan and makes no call', async () => {
  const r = await appleAction({ kind: 'refresh', dryRun: true });
  assert.deepEqual(r.plan, { method: 'GET', url: 'http://apple.test/api/admin/analytics?days=7', body: null,
    also: ['/api/admin/spend', '/api/admin/billing-wiring', '/api/admin/stats', '/api/admin/logs', '/api/admin/models', '/api/admin/model-routing',
      '/api/admin/corpus-census', '/api/admin/product-analytics', '/api/admin/static-list', '/api/health'], note: 'קריאה בלבד, בלי שינוי בעובד' });
  assert.equal(r.ok, true); assert.equal(r.dryRun, true);
  clean(r);
  assert.equal(calls.length, 0);
});

test('appleAction: every write kind and every malformed body is refused before anything happens', async () => {
  await apple(); const before = calls.length;
  for (const kind of ['kill', 'kill-switch', 'grant-credits', 'set-plan', 'quota-reset', 'spend-reset', 'REFRESH', '', undefined, 42, { kind: 'refresh' }]) {
    for (const dryRun of [true, false]) {
      const r = await appleAction({ kind, dryRun, userId: S.actor, credits: 1000 });
      assert.equal(r.ok, false, `${String(kind)} dry=${dryRun}`); assert.equal(r.plan, undefined); clean(r);
    }
  }
  for (const body of [null, undefined, 'refresh', []]) assert.equal((await appleAction(body)).ok, false);
  assert.equal(calls.length, before, 'no call for any refused action');
  await apple(); assert.equal(calls.length, before, 'a refused action does not even drop the cache');
});

test('appleAction: a real refresh only drops the cache; the next read goes to the worker again', async () => {
  await apple(); const n = calls.length;
  await apple(); assert.equal(calls.length, n, 'the second read is cached');
  const r = await appleAction({ kind: 'refresh' });
  assert.equal(r.ok, true); assert.equal(calls.length, n, 'the action itself makes no call');
  await apple(); assert.equal(calls.length, 2 * n, 'everything is read again, the static list too');
  assert.ok(calls.every((c) => c.method === 'GET'));
});

// ---------------------------------------------------------------- conclusions
const good = { health: { httpStatus: 200 }, spend: { monthUsd: 3.14, maxMonthlyUsd: 19.8, dayRemaining: 0.4, killed: false },
  version: { known: true, sha: 'abc1234', head: 'abc1234', behind: 3, workerBehind: 0, dirty: false },
  success: { requests: { total: 1000, failed: 0, rate: 1 }, modelCalls: { total: 10, failed: 0 } }, errorLog: { retained: 0 } };

test('appleConclusions: a healthy product reads as healthy, most urgent first', () => {
  const c = appleConclusions(good);
  assert.deepEqual(c.map((x) => [x.k, x.tone]), [['spend', 'ok'], ['version', 'ok'], ['health', 'ok']]);
  assert.equal(c[0].title, 'הוצאה החודש $3.14 מתוך תקרה של $19.80 (16%)');
  assert.equal(c[1].text, '3 קומיטים מאז, אף אחד מהם לא נוגע ב-apps/worker.');
  assert.equal(c[2].title, '100% מהבקשות הצליחו בחלון הלוג');
  // A warning found last in the list still comes first.
  assert.deepEqual(appleConclusions({ ...good, billing: { production: true, keyMode: 'test' } }).map((x) => [x.k, x.tone]),
    [['billing', 'warn'], ['spend', 'ok'], ['version', 'ok'], ['health', 'ok']]);
});

test('appleConclusions: down, killed, stale and failing reads as that, capped at 4, bad before warn', () => {
  const c = appleConclusions({ health: { httpStatus: 503 }, spend: { ...good.spend, killed: true },
    version: { known: true, sha: 'abc1234', head: 'def5678', behind: 44, workerBehind: 6, dirty: true },
    success: { requests: { total: 100, failed: 10, rate: 0.9 } }, errorLog: { retained: 7 },
    billing: { production: true, keyMode: 'test' }, window: { events: 5000, hours: 0.5, complete: false } });
  assert.deepEqual(c.map((x) => [x.k, x.tone]), [['down', 'bad'], ['killed', 'bad'], ['version', 'warn'], ['health', 'warn']]);
  assert.equal(c[0].text, '/api/health החזיר 503.');
  assert.equal(c[2].text, '6 קומיטים ב-apps/worker עוד לא נפרסו, הפריסה נעשתה מעץ עם שינויים שלא נשמרו בקומיט.');
  assert.equal(c[3].title, '90% מהבקשות הצליחו בחלון הלוג');
});

test('appleConclusions: spend near the cap warns; no health answer is its own state; an unknown sha says so', () => {
  const c = appleConclusions({ health: { httpStatus: null }, spend: { monthUsd: 17, maxMonthlyUsd: 19.8, dayRemaining: 0 }, version: { known: false, buildSha: 'deadbee' },
    window: { events: 5000, hours: 0.5, complete: false }, audit: { byAction: [{ key: '/api/health', count: 4000 }] } });
  assert.deepEqual(c.map((x) => [x.k, x.tone]), [['down', 'bad'], ['spend', 'warn'], ['version', 'info'], ['window', 'info']]);
  assert.equal(c[0].text, 'אין תשובה מ-/api/health.');
  assert.equal(c[3].title, 'חלון הלוג מכסה רק 30 דקות');
  assert.match(c[3].text, /80% מהם הם \/api\/health/);
  assert.deepEqual(appleConclusions(null), []);
});
