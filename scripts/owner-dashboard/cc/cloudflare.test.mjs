// Cloudflare platform module: payload shape, the not-connected state, the D1 read-only guard, the
// read consoles (D1 / R2 / KV / AI Gateway logs), the rollback write (dry-run plan + server-side
// validation), leak-proofing and the Hebrew insights. No network: fetch is a fixture router.
//   node --test scripts/owner-dashboard/cc/cloudflare.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const SENTINEL = 'SECRET_SENTINEL_CF';
const LEAK = 'BODY_LEAK_MARK'; // not an env value: redact() cannot hide it, only the field whitelists can
Object.assign(process.env, { CLOUDFLARE_API_TOKEN: `${SENTINEL}_123`, CLOUDFLARE_ACCOUNT_ID: 'acct-test' });

const { cloudflare, cloudflareAction, sqlGuard, insightsFor, WORKER, WORKER_URL, workerHealth } = await import('./platforms/cloudflare.mjs');
const { uncache } = await import('./http.mjs');

const API = 'https://api.cloudflare.com/client/v4';
const A = `${API}/accounts/acct-test`;
const HOUR = 3600e3;
const NOW = Date.parse('2026-09-23T20:00:00Z');
const iso = (ms) => new Date(ms).toISOString();

// ---------------------------------------------------------------- fixtures
const V = { new: '11111111-1111-4111-8111-111111111111', prev: '22222222-2222-4222-8222-222222222222', old: '33333333-3333-4333-8333-333333333333' };
const GQL = {
  w: [{ dimensions: { scriptName: 'apple' }, sum: { requests: 26800, errors: 12, subrequests: 25414 }, quantiles: { cpuTimeP50: 1461, cpuTimeP99: 25980 } },
    { dimensions: { scriptName: 'golem' }, sum: { requests: 1502, errors: 0, subrequests: 2952 }, quantiles: { cpuTimeP50: 1086, cpuTimeP99: 8310 } }],
  wp: [{ dimensions: { scriptName: 'apple' }, sum: { requests: 12617, errors: 3 } }],
  wh: [{ dimensions: { datetimeHour: '2026-09-23T18:00:00Z', scriptName: 'apple' }, sum: { requests: 600, errors: 1 } },
    { dimensions: { datetimeHour: '2026-09-23T19:00:00Z', scriptName: 'apple' }, sum: { requests: 700, errors: 2 } },
    { dimensions: { datetimeHour: '2026-09-23T19:00:00Z', scriptName: 'golem' }, sum: { requests: 70, errors: 0 } }],
  d1: [{ dimensions: { databaseId: 'db-1' }, sum: { readQueries: 9766, writeQueries: 40195, rowsRead: 69722123, rowsWritten: 61425 } }],
  r2: [{ dimensions: { bucketName: 'apple-media', actionType: 'HeadBucket' }, sum: { requests: 82 } }, { dimensions: { bucketName: 'apple-media', actionType: 'PutObject' }, sum: { requests: 3 } }],
  r2s: [{ dimensions: { bucketName: 'apple-media' }, max: { objectCount: 3, payloadSize: 934350, metadataSize: 249 } }],
  ai: [{ count: 1766, dimensions: { modelId: '@cf/zai-org/glm-5.3-flash' }, sum: { totalNeurons: 194370.5, totalInputTokens: 47923824, totalOutputTokens: 531123 } }],
  aid: [{ count: 1448, sum: { totalNeurons: 160362.2 } }],
  gw: [{ count: 1921, dimensions: { gateway: 'golem' }, sum: { cost: 2.19, uncachedTokensIn: 50103170, uncachedTokensOut: 561130, cachedRequests: 9, erroredRequests: 27 } }],
  ts: [{ count: 2, dimensions: { siteKey: '0x4AAAAAAFBZ', eventType: 'challenge_issued' } }, { count: 1, dimensions: { siteKey: '0x4AAAAAAFBZ', eventType: 'challenge_siteverify_failed_invalid_token' } }],
  kv: [{ dimensions: { namespaceId: 'kv-1', actionType: 'read' }, sum: { requests: 272 } }],
  do: [{ dimensions: { namespaceId: 'ns-s' }, sum: { requests: 24166, errors: 193 } }],
  qu: [{ count: 2, dimensions: { queueId: 'q-1', actionType: 'WriteMessage' }, sum: { billableOperations: 2 } }],
};
const deployments = (script) => (script === 'apple' ? [
  { id: 'dep-3', source: 'api', strategy: 'percentage', author_email: 'o@x.dev', created_on: iso(NOW - 0.3 * HOUR), annotations: { 'workers/triggered_by': 'secret' }, versions: [{ version_id: V.new, percentage: 100 }] },
  { id: 'dep-2', source: 'wrangler', strategy: 'percentage', author_email: 'o@x.dev', created_on: iso(NOW - 1 * HOUR), annotations: { 'workers/triggered_by': 'deployment', 'workers/message': 'ship it' }, versions: [{ version_id: V.prev, percentage: 100 }] },
] : [{ id: `dep-${script}`, source: 'wrangler', strategy: 'percentage', created_on: iso(NOW - 48 * HOUR), annotations: {}, versions: [{ version_id: V.old, percentage: 100 }] }]);
const versions = (script) => (script === 'apple' ? [
  { id: V.new, number: 161, metadata: { created_on: iso(NOW - 0.3 * HOUR), source: 'api', author_email: 'o@x.dev' }, annotations: { 'workers/triggered_by': 'secret' } },
  { id: V.prev, number: 160, metadata: { created_on: iso(NOW - 1 * HOUR), source: 'wrangler' }, annotations: { 'workers/triggered_by': 'upload', 'workers/message': 'ship it' } },
  { id: V.old, number: 159, metadata: { created_on: iso(NOW - 30 * HOUR), source: 'wrangler' }, annotations: {} },
] : [{ id: V.old, number: 4, metadata: { created_on: iso(NOW - 48 * HOUR) }, annotations: {} }]);
const BINDINGS = [
  { type: 'd1', name: 'CORPUS', id: 'db-1', database_id: 'db-1' }, { type: 'kv_namespace', name: 'KV', namespace_id: 'kv-1' },
  { type: 'r2_bucket', name: 'MEDIA', bucket_name: 'apple-media' }, { type: 'ai', name: 'AI' }, { type: 'vectorize', name: 'VEC', index_name: 'golem-docs' },
  { type: 'durable_object_namespace', name: 'SESSION_DO', class_name: 'SessionDO', namespace_id: 'ns-s' },
  { type: 'queue', name: 'NOTIFY_QUEUE', queue_name: 'apple-notifications' }, { type: 'workflow', name: 'MODEL_UPLOAD_WORKFLOW', workflow_name: 'apple-model-upload' },
  { type: 'analytics_engine', name: 'PRODUCT_EVENTS', dataset: 'apple_product_events' }, { type: 'images', name: 'IMAGES' },
  { type: 'secret_text', name: 'OPENAI_KEY' }, { type: 'plain_text', name: 'BUILD_SHA', text: 'abc1234' }, { type: 'plain_text', name: 'PUBLIC_NOTE', text: LEAK },
];
const R = (result, extra = {}) => ({ success: true, errors: [], result, ...extra });

let calls = [];
let handler = null;
function fixture(u, init) {
  const url = new URL(u); const p = url.pathname.replace('/client/v4', '');
  const acc = '/accounts/acct-test';
  if (u === `${WORKER_URL}/api/health`) return { buildSha: 'abc1234', version: '161' };
  if (p === '/graphql') return { data: { viewer: { accounts: [GQL] } }, errors: null };
  if (p === acc) return R({ id: 'acct-test', name: 'Moshe account' });
  if (p === `${acc}/workers/scripts`) return R([{ id: 'apple', created_on: iso(NOW - 900 * HOUR), modified_on: iso(NOW - 0.3 * HOUR), usage_model: 'standard', handlers: ['fetch', 'scheduled', 'queue'], compatibility_date: '2026-01-01', last_deployed_from: 'wrangler' },
    { id: 'golem', created_on: iso(NOW - 2000 * HOUR), modified_on: iso(NOW - 48 * HOUR), usage_model: 'standard', handlers: ['fetch'] }]);
  if (p === `${acc}/workers/subdomain`) return R({ subdomain: 'moshe-barami111' });
  let m = p.match(/^\/accounts\/acct-test\/workers\/scripts\/([\w-]+)\/(settings|deployments|versions|schedules|script-settings|subdomain)$/);
  if (m) {
    const [, s, what] = m;
    if (what === 'settings') return R({ bindings: s === 'apple' ? BINDINGS : [{ type: 'secret_text', name: 'X' }], observability: { enabled: true, logs: { enabled: true }, traces: { enabled: s === 'apple' } }, compatibility_date: '2026-01-01' });
    if (what === 'deployments' && (init.method || 'GET') === 'GET') return R({ deployments: deployments(s) });
    if (what === 'deployments') return R({ id: 'dep-new' });
    if (what === 'versions') return R({ items: versions(s) });
    if (what === 'schedules') return R({ schedules: s === 'apple' ? [{ cron: '* * * * *', modified_on: iso(NOW - 99 * HOUR) }] : [] });
    if (what === 'script-settings') return R({ observability: { enabled: true, head_sampling_rate: 1, logs: { enabled: true, invocation_logs: true }, traces: { enabled: true } }, logpush: false });
    if (what === 'subdomain') return R({ enabled: true, previews_enabled: true });
  }
  if (p === `${acc}/d1/database`) return R([{ uuid: 'db-1', name: 'golem-corpus', num_tables: 0 }]);
  if (p === `${acc}/d1/database/db-1`) return R({ uuid: 'db-1', name: 'golem-corpus', file_size: 610066432, num_tables: 31, running_in_region: 'WEUR', created_at: iso(NOW - 3000 * HOUR), version: 'production' });
  if (p === `${acc}/d1/database/db-1/query`) {
    const results = Array.from({ length: 250 }, (_, i) => ({ id: i, email: `u${i}@x.dev`, password_hash: `${LEAK}-hash`, apiKey: LEAK, note: `token ${SENTINEL}_123`, blob: 'A'.repeat(48) }));
    return R([{ results, success: true, meta: { rows_read: 250, duration: 1.5, changes: 0 } }]);
  }
  if (p === `${acc}/storage/kv/namespaces`) return R([{ id: 'kv-1', title: 'golem-kv', supports_url_encoding: true }]);
  if (p === `${acc}/storage/kv/namespaces/kv-1/keys`) return R([{ name: 'user:1' }, { name: `sess:${'Z'.repeat(40)}`, expiration: 1790000000, metadata: { v: LEAK } }], { result_info: { cursor: 'c2', count: 2 } });
  if (p === `${acc}/r2/buckets`) return R({ buckets: [{ name: 'apple-media', creation_date: iso(NOW - 500 * HOUR), location: 'WEUR' }] });
  if (p === `${acc}/r2/buckets/apple-media/objects`) return R([{ key: 'image/a.png', size: 1234, last_modified: iso(NOW - 5 * HOUR), etag: 'e', http_metadata: { contentType: 'image/png' }, custom_metadata: { owner: LEAK }, storage_class: 'Standard' }], { result_info: { delimited: ['image/thumbs/'], is_truncated: false, cursor: '' } });
  if (p === `${acc}/vectorize/v2/indexes`) return R([{ name: 'golem-docs', config: { dimensions: 384, metric: 'cosine' }, created_on: iso(NOW - 700 * HOUR) }]);
  if (p === `${acc}/queues`) return R([{ queue_id: 'q-1', queue_name: 'apple-notifications', producers_total_count: 1, consumers_total_count: 1, producers: [{ script: 'apple' }], consumers: [{ script: 'apple' }] }]);
  if (p === `${acc}/ai-gateway/gateways`) return R([{ id: 'golem', created_at: iso(NOW - 800 * HOUR), collect_logs: true, cache_ttl: 0, rate_limiting_limit: 0, authentication: false, logpush_public_key: LEAK }]);
  if (p === `${acc}/ai-gateway/gateways/golem/logs`) return R([{ id: 'log-1', created_at: iso(NOW - 60e3), provider: 'workers-ai', model: '@cf/zai-org/glm-5.3-flash', status_code: 200, success: true, cached: false, tokens_in: 1200, tokens_out: 80, cost: 0.0012, duration: 900, request: LEAK, response: LEAK, prompts: LEAK, metadata: { user: LEAK }, usage_metadata: { neurons: 110 } }]);
  if (p === '/zones') return R([]);
  if (p === `${acc}/challenges/widgets`) return R([{ sitekey: '0x4AAAAAAFBZ', name: 'apple-auth', mode: 'managed', domains: ['apple.moshe-barami111.workers.dev', 'localhost'], created_on: iso(NOW - 400 * HOUR), secret: LEAK, clearance_level: 'no_clearance' }]);
  if (p === `${acc}/pages/projects`) return R([{ name: 'spin', subdomain: 'spin-b6q.pages.dev', created_on: iso(NOW - 600 * HOUR), production_branch: 'main', deployment_configs: { production: { env_vars: { K: { value: LEAK } } } },
    latest_deployment: { id: 'pd-1', created_on: iso(NOW - 70 * HOUR), url: 'https://abc.spin-b6q.pages.dev', environment: 'production', latest_stage: { name: 'deploy', status: 'success' }, env_vars: { K: { value: LEAK } }, deployment_trigger: { metadata: { branch: 'main', commit_hash: 'deadbeef00', commit_message: 'fix' } } } }]);
  if (p === `${acc}/workers/durable_objects/namespaces`) return R([{ id: 'ns-s', name: 'apple_SessionDO', script: 'apple', class: 'SessionDO', use_sqlite: true }]);
  if (p === `${acc}/workflows`) return R([{ id: 'wf-1', name: 'apple-model-upload', script_name: 'apple', class_name: 'ModelUpload', created_on: iso(NOW - 300 * HOUR), instances: { complete: 3, errored: 1, running: 0, queued: 0 } }]);
  return { success: false, errors: [{ message: `no fixture for ${p}` }], result: null };
}
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  calls.push({ url: u, method: init.method || 'GET', body: init.body, auth: init.headers?.authorization });
  if (handler) return handler(u, init);
  const body = fixture(u, init);
  const miss = body?.success === false;
  return new Response(JSON.stringify(body), { status: miss ? 404 : 200, headers: { 'content-type': 'application/json' } });
};
const hasLeak = (x) => { const s = JSON.stringify(x); return s.includes(SENTINEL) || s.includes(LEAK); };

beforeEach(() => { calls = []; handler = null; uncache('cloudflare'); Object.assign(process.env, { CLOUDFLARE_API_TOKEN: `${SENTINEL}_123`, CLOUDFLARE_ACCOUNT_ID: 'acct-test' }); });

// ---------------------------------------------------------------- exports other files rely on
test('keeps the exports other files import', () => {
  assert.equal(WORKER, 'apple');
  assert.match(WORKER_URL, /^https:\/\/apple\./);
  assert.equal(typeof workerHealth, 'function');
});

// ---------------------------------------------------------------- not connected
test('not connected: missing env → ok:false with the reason, zero requests', async () => {
  delete process.env.CLOUDFLARE_API_TOKEN;
  const r = await cloudflare();
  assert.equal(r.ok, false);
  assert.match(r.reason, /CLOUDFLARE_API_TOKEN/);
  for (const body of [{ kind: 'd1-query', db: 'db-1', sql: 'SELECT 1' }, { kind: 'kv-keys', ns: 'kv-1' }, { kind: 'r2-list', bucket: 'apple-media' },
    { kind: 'gw-logs', gateway: 'golem' }, { kind: 'rollback', script: 'apple', versionId: V.prev }]) {
    const a = await cloudflareAction(body);
    assert.equal(a.ok, false, body.kind);
    assert.match(a.reason, /CLOUDFLARE_API_TOKEN/, body.kind);
  }
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------- payload shape
test('payload shape: workers with bindings, deployments and versions; analytics; storage; AI; security', async () => {
  const r = await cloudflare();
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.errors, {});
  assert.deepEqual(r.account, { id: 'acct-test', name: 'Moshe account' });
  const apple = r.workers.find((w) => w.name === 'apple');
  assert.equal(apple.url, 'https://apple.moshe-barami111.workers.dev');
  assert.deepEqual(apple.deployments.map((d) => d.id), ['dep-3', 'dep-2']);
  assert.equal(apple.deployments[0].trigger, 'secret');
  assert.deepEqual(apple.deployments[0].versions, [{ id: V.new, pct: 100 }]);
  assert.equal(apple.deployments[1].message, 'ship it');
  assert.deepEqual(apple.versions.map((v) => v.number), [161, 160, 159]);
  assert.deepEqual(apple.serving, [{ id: V.new, pct: 100, number: 161 }]);
  assert.deepEqual(apple.crons, ['* * * * *']);
  assert.equal(apple.requests24h, 26800);
  assert.equal(apple.cpuP99Ms, 25.98);
  // bindings: type, name, target only. Never a value.
  assert.deepEqual(apple.bindings.find((b) => b.name === 'CORPUS'), { type: 'd1', name: 'CORPUS', target: 'db-1' });
  assert.deepEqual(apple.bindings.find((b) => b.name === 'MEDIA'), { type: 'r2_bucket', name: 'MEDIA', target: 'apple-media' });
  assert.deepEqual(apple.bindings.find((b) => b.name === 'OPENAI_KEY'), { type: 'secret_text', name: 'OPENAI_KEY', target: null });
  assert.equal(apple.buildSha, 'abc1234');
  assert.ok(!('text' in apple.bindings.find((b) => b.name === 'PUBLIC_NOTE')));
  // the fields insights.mjs reads keep their shape
  assert.equal(r.traffic.last24h.requests, 26800);
  assert.equal(r.traffic.last24h.cpuP99Ms, 25.98);
  assert.deepEqual(r.traffic.prev24h, { requests: 12617, errors: 3 });
  assert.deepEqual(r.traffic.perHour.map((h) => h.requests), [600, 700]);
  assert.ok(r.workers.every((w) => Array.isArray(w.deployments) && w.deployments.every((d) => d.createdAt)));
  assert.deepEqual(r.d1[0], { name: 'golem-corpus', uuid: 'db-1', sizeBytes: 610066432, tables: 31, region: 'WEUR', createdAt: iso(NOW - 3000 * HOUR),
    reads24h: 9766, writes24h: 40195, rowsRead24h: 69722123, rowsWritten24h: 61425 });
  assert.deepEqual(r.r2[0], { name: 'apple-media', createdAt: iso(NOW - 500 * HOUR), location: 'WEUR', objects: 3, bytes: 934350, ops24h: 85, writes24h: 3 });
  assert.deepEqual(r.kv[0], { title: 'golem-kv', id: 'kv-1', ops24h: 272 });
  assert.equal(r.queues[0].ops24h, 2);
  assert.equal(r.ai.neurons24h, 194370.5);
  assert.equal(r.ai.neuronsToday, 160362.2);
  assert.equal(r.ai.models[0].model, '@cf/zai-org/glm-5.3-flash');
  assert.deepEqual(r.aiGateway[0], { id: 'golem', createdAt: iso(NOW - 800 * HOUR), collectLogs: true, cacheTtl: 0, rateLimit: 0, authentication: false,
    requests24h: 1921, cost24h: 2.19, errors24h: 27, cached24h: 9, tokensIn24h: 50103170, tokensOut24h: 561130 });
  assert.deepEqual(r.turnstile[0], { sitekey: '0x4AAAAAAFBZ', name: 'apple-auth', mode: 'managed', domains: ['apple.moshe-barami111.workers.dev', 'localhost'],
    createdAt: iso(NOW - 400 * HOUR), events24h: { challenge_issued: 2, challenge_siteverify_failed_invalid_token: 1 } });
  assert.deepEqual(r.durableObjects[0], { id: 'ns-s', name: 'apple_SessionDO', script: 'apple', className: 'SessionDO', sqlite: true, requests24h: 24166, errors24h: 193 });
  assert.equal(r.workflows[0].instances.errored, 1);
  assert.deepEqual(r.pages[0], { name: 'spin', subdomain: 'spin-b6q.pages.dev', createdAt: iso(NOW - 600 * HOUR), branch: 'main',
    latest: { id: 'pd-1', createdAt: iso(NOW - 70 * HOUR), url: 'https://abc.spin-b6q.pages.dev', env: 'production', status: 'success', commit: 'deadbeef00' } });
  assert.equal(r.plan.paid, true);
  assert.deepEqual(r.settings, { observability: true, logs: true, traces: true, sampling: 1, logpush: false });
  assert.ok(Array.isArray(r.insights) && r.insights.length > 0);
  assert.ok(!hasLeak(r), 'a secret or an upstream body field reached the payload');
});

test('a section the token cannot read becomes a reason in errors, never a thrown request', async () => {
  handler = async (u, init) => {
    if (/challenges\/widgets|graphql/.test(u)) return new Response('{"success":false}', { status: 403 });
    return new Response(JSON.stringify(fixture(u, init)), { status: 200 });
  };
  const r = await cloudflare();
  assert.equal(r.ok, true);
  assert.ok(r.errors.turnstile && r.errors.analytics);
  assert.deepEqual(r.turnstile, []);
  assert.equal(r.workers.length, 2);
});

// ---------------------------------------------------------------- D1 read-only guard
test('sqlGuard accepts only a single read statement', () => {
  for (const q of ['SELECT 1', 'select * from chunks limit 5;', 'WITH x AS (SELECT 1) SELECT * FROM x', 'EXPLAIN QUERY PLAN SELECT * FROM chunks',
    "SELECT ';' AS semi, 'drop table x' AS s FROM chunks", 'SELECT replace(name, \'a\', \'b\') FROM chunks', 'PRAGMA table_info(chunks)', 'PRAGMA table_list',
    'pragma index_list("chunks")', 'PRAGMA table_info(api_keys)', 'SELECT count(*) FROM memory_items -- trailing note', 'SELECT /* hi */ 1',
    'SELECT created_at, updated_at FROM chunks', 'SELECT "name" FROM [chunks]']) {
    assert.equal(sqlGuard(q).ok, true, q);
  }
});

test('sqlGuard rejects every write, DDL, ATTACH, multi-statement query and hidden write', () => {
  const bad = ['INSERT INTO t VALUES (1)', 'UPDATE t SET a=1', 'DELETE FROM t', 'DROP TABLE t', 'CREATE TABLE t(a)', 'ALTER TABLE t ADD b',
    "ATTACH DATABASE 'x' AS y", 'DETACH y', 'VACUUM', 'REINDEX', 'ANALYZE', 'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT a', 'RELEASE a',
    'REPLACE INTO t VALUES (1)', 'SELECT 1; DELETE FROM t', 'SELECT 1;;', 'SELECT 1 /* x */; DROP TABLE t', 'SELECT 1 -- x\n; DELETE FROM t',
    'SELECT 1 /* unterminated', "SELECT 'unterminated", 'WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x', 'EXPLAIN DELETE FROM t',
    // SQLite accepts a CTE in front of a write: only the deny list catches these.
    'WITH x AS (SELECT 1) DELETE FROM t', 'WITH x AS (SELECT 1) UPDATE t SET a = 1', 'WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x',
    'SELECT load_extension(\'x\')', 'PRAGMA writable_schema = 1', 'PRAGMA table_info(t); DROP TABLE t', 'PRAGMA journal_mode', 'SELECT * FROM t RETURNING id',
    'UPSERT', 'insert/**/into t values(1)', 'SELECT 1 UNION ALL SELECT 2; UPDATE t SET a=1', '', '   ', 'SELECT', 'VALUES (1)',
    '/* SELECT */ DELETE FROM t', "SELECT 1 WHERE 'a' = 'a'; DELETE FROM t"];
  for (const q of bad) assert.equal(sqlGuard(q).ok, false, q);
});

test('sqlGuard refuses tables and columns that hold secrets', () => {
  for (const q of ['SELECT * FROM api_keys', 'SELECT * FROM "api_keys"', 'SELECT * FROM [user_credentials]', 'SELECT password FROM users',
    'SELECT token FROM sessions', 'SELECT secret_value FROM vault', 'SELECT pw_hash FROM users', 'SELECT salt FROM users', 'SELECT private_key FROM k',
    'SELECT apikey FROM x', 'SELECT * FROM _cf_KV', 'WITH a AS (SELECT * FROM api_keys) SELECT 1']) {
    const g = sqlGuard(q);
    assert.equal(g.ok, false, q);
    assert.match(g.reason, /סוד|רגיש/, q);
  }
});

// ---------------------------------------------------------------- read consoles
test('d1-query runs the guarded SELECT, caps rows, masks secret columns and redacts values', async () => {
  const r = await cloudflareAction({ kind: 'd1-query', db: 'db-1', sql: 'SELECT * FROM chunks' });
  assert.equal(r.ok, true, r.reason);
  const q = calls.find((c) => c.method === 'POST');
  assert.equal(q.url, `${A}/d1/database/db-1/query`);
  assert.deepEqual(JSON.parse(q.body), { sql: 'SELECT * FROM chunks' });
  assert.deepEqual(r.columns, ['id', 'email', 'password_hash', 'apiKey', 'note', 'blob']);
  assert.equal(r.rows.length, 200);
  assert.equal(r.truncated, true);
  assert.deepEqual(r.masked.sort(), ['apiKey', 'password_hash']);
  assert.equal(r.rows[0][2], '•••');
  assert.equal(r.rows[0][5], '•••');
  assert.equal(r.rows[0][4], 'token [redacted]');
  assert.ok(!hasLeak(r));
});

test('d1-query refuses a write and an unknown database without sending the query', async () => {
  const w = await cloudflareAction({ kind: 'd1-query', db: 'db-1', sql: 'DELETE FROM chunks' });
  assert.equal(w.ok, false);
  assert.equal(calls.length, 0);
  const u = await cloudflareAction({ kind: 'd1-query', db: 'db-other', sql: 'SELECT 1' });
  assert.equal(u.ok, false);
  assert.ok(!calls.some((c) => c.method === 'POST'));
  const s = await cloudflareAction({ kind: 'd1-query', db: '../x', sql: 'SELECT 1' });
  assert.equal(s.ok, false);
});

test('kv-keys returns names and expiration only, never values', async () => {
  const r = await cloudflareAction({ kind: 'kv-keys', ns: 'kv-1', prefix: 'se' });
  assert.equal(r.ok, true, r.reason);
  assert.ok(calls.every((c) => !/\/values\//.test(c.url)));
  const k = calls.find((c) => /\/keys/.test(c.url));
  assert.equal(new URL(k.url).searchParams.get('prefix'), 'se');
  assert.deepEqual(r.keys, [{ name: 'user:1', expiration: null }, { name: 'sess:…', expiration: 1790000000 }]);
  assert.equal(r.cursor, 'c2');
  assert.ok(!hasLeak(r));
  assert.equal((await cloudflareAction({ kind: 'kv-keys', ns: 'kv-nope' })).ok, false);
});

test('r2-list returns names, sizes, dates and content types, no bodies', async () => {
  const r = await cloudflareAction({ kind: 'r2-list', bucket: 'apple-media', prefix: 'image/' });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.objects, [{ key: 'image/a.png', size: 1234, uploaded: iso(NOW - 5 * HOUR), contentType: 'image/png' }]);
  assert.deepEqual(r.prefixes, ['image/thumbs/']);
  const l = calls.find((c) => /\/objects/.test(c.url));
  assert.equal(new URL(l.url).searchParams.get('delimiter'), '/');
  assert.ok(calls.every((c) => c.method === 'GET' && !/\/objects\/./.test(c.url)));
  assert.ok(!hasLeak(r));
  assert.equal((await cloudflareAction({ kind: 'r2-list', bucket: 'other' })).ok, false);
});

test('gw-logs whitelists the log fields: no prompt, request, response or metadata', async () => {
  const r = await cloudflareAction({ kind: 'gw-logs', gateway: 'golem' });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.logs, [{ id: 'log-1', createdAt: iso(NOW - 60e3), provider: 'workers-ai', model: '@cf/zai-org/glm-5.3-flash', status: 200, success: true,
    cached: false, tokensIn: 1200, tokensOut: 80, cost: 0.0012, durationMs: 900, neurons: 110 }]);
  assert.ok(!hasLeak(r));
  assert.equal((await cloudflareAction({ kind: 'gw-logs', gateway: 'nope' })).ok, false);
});

// ---------------------------------------------------------------- writes: dry-run plans and rollback
test('dryRun returns the exact plan without calling fetch', async () => {
  assert.deepEqual((await cloudflareAction({ kind: 'logs', value: false, dryRun: true })).plan,
    { method: 'PATCH', url: `${API}/accounts/<account>/workers/scripts/apple/script-settings`, body: { observability: { logs: { enabled: false } } } });
  assert.deepEqual((await cloudflareAction({ kind: 'traces', value: true, dryRun: true })).plan,
    { method: 'PATCH', url: `${API}/accounts/<account>/workers/scripts/apple/script-settings`, body: { observability: { traces: { enabled: true } } } });
  assert.deepEqual((await cloudflareAction({ kind: 'purge', zoneId: 'z1', dryRun: true })).plan,
    { method: 'POST', url: `${API}/zones/z1/purge_cache`, body: { purge_everything: true } });
  const rb = await cloudflareAction({ kind: 'rollback', script: 'apple', versionId: V.prev, dryRun: true });
  assert.equal(rb.dryRun, true);
  assert.deepEqual(rb.plan, { method: 'POST', url: `${API}/accounts/<account>/workers/scripts/apple/deployments`,
    body: { strategy: 'percentage', versions: [{ version_id: V.prev, percentage: 100 }], annotations: { 'workers/message': 'Rollback from owner dashboard' } } });
  assert.equal(calls.length, 0);
});

test('rollback validates the script and the version before it writes', async () => {
  for (const b of [{ script: 'apple', versionId: 'not-a-uuid' }, { script: '../x', versionId: V.prev }, { script: 'apple' }]) {
    assert.equal((await cloudflareAction({ kind: 'rollback', ...b, dryRun: true })).ok, false, JSON.stringify(b));
  }
  assert.equal(calls.length, 0);
  const foreign = await cloudflareAction({ kind: 'rollback', script: 'apple', versionId: '44444444-4444-4444-8444-444444444444' });
  assert.equal(foreign.ok, false);
  assert.match(foreign.reason, /לא שייכת/);
  const other = await cloudflareAction({ kind: 'rollback', script: 'nope', versionId: V.prev });
  assert.equal(other.ok, false);
  const serving = await cloudflareAction({ kind: 'rollback', script: 'apple', versionId: V.new });
  assert.equal(serving.ok, false);
  assert.match(serving.reason, /כבר/);
  assert.ok(!calls.some((c) => c.method === 'POST'), 'a refused rollback still wrote');
});

test('rollback posts the chosen version at 100% (fake upstream) and drops the cache', async () => {
  const r = await cloudflareAction({ kind: 'rollback', script: 'apple', versionId: V.prev });
  assert.equal(r.ok, true, r.reason);
  const post = calls.filter((c) => c.method === 'POST');
  assert.equal(post.length, 1);
  assert.equal(post[0].url, `${A}/workers/scripts/apple/deployments`);
  assert.deepEqual(JSON.parse(post[0].body), { strategy: 'percentage', versions: [{ version_id: V.prev, percentage: 100 }], annotations: { 'workers/message': 'Rollback from owner dashboard' } });
  assert.equal(r.versionId, V.prev);
});

test('unknown kinds and odd values are refused', async () => {
  for (const b of [{ kind: 'delete' }, { kind: 'd1-exec' }, { kind: 'logs', value: 'yes' }, { kind: 'purge', zoneId: '../x' }, {}]) {
    assert.equal((await cloudflareAction(b)).ok, false, JSON.stringify(b));
  }
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------- no secret in any response
test('no secret reaches a response when the upstream echoes the Authorization header (200/403/500/throw)', async () => {
  for (const mode of ['echo200', 'echo403', 'echo500text', 'throw']) {
    handler = async (u, init) => {
      const a = init.headers?.authorization || '';
      if (mode === 'throw') throw Object.assign(new Error(`boom ${a}`), { name: 'TypeError' });
      if (mode === 'echo500text') return new Response(`crash ${a}`, { status: 500 });
      const item = { id: 'i1', uuid: 'u1', name: a, title: a, key: a, sitekey: a, model: a, echo: a, text: a, queue_name: a, results: [{ a }] };
      return new Response(JSON.stringify({ success: true, result: [item], data: null, echo: a, errors: [{ message: a }] }), { status: mode === 'echo403' ? 403 : 200 });
    };
    uncache('cloudflare');
    const outs = [await cloudflare()];
    for (const b of [{ kind: 'd1-query', db: 'u1', sql: 'SELECT 1' }, { kind: 'kv-keys', ns: 'i1' }, { kind: 'r2-list', bucket: 'x' }, { kind: 'gw-logs', gateway: 'i1' },
      { kind: 'rollback', script: 'i1', versionId: V.prev }, { kind: 'rollback', script: 'i1', versionId: V.prev, dryRun: true }, { kind: 'logs', value: true },
      { kind: 'purge', zoneId: 'i1' }]) outs.push(await cloudflareAction(b));
    for (const o of outs) assert.ok(!JSON.stringify(o).includes(SENTINEL), `${mode}: ${JSON.stringify(o).slice(0, 300)}`);
  }
  for (const c of calls) {
    assert.ok(!c.url.includes(SENTINEL), `credential in a URL: ${c.url}`);
    assert.ok(!String(c.body ?? '').includes(SENTINEL), 'credential in a request body');
  }
});

// ---------------------------------------------------------------- insights
const base = () => ({
  workers: [{ name: 'apple', deployments: [{ id: 'd2', createdAt: iso(NOW - 0.3 * HOUR), trigger: 'deployment', versions: [{ id: V.new, pct: 100 }] }],
    versions: [{ id: V.new, number: 161, createdAt: iso(NOW - 0.3 * HOUR) }], serving: [{ id: V.new, pct: 100, number: 161 }], cpuP99Ms: 3, requests24h: 1000, errors24h: 0 }],
  traffic: { last24h: { requests: 1000, errors: 0, cpuP99Ms: 3 }, prev24h: { requests: 1000, errors: 0 }, perHour: [] },
  d1: [{ name: 'small', sizeBytes: 5e6 }], ai: { neuronsToday: 100, neurons24h: 100 }, durableObjects: [], aiGateway: [], turnstile: [], plan: { paid: false },
});
const levels = (list, re) => list.filter((x) => re.test(x.title + x.detail)).map((x) => x.level);

test('insights: a healthy account says so', () => {
  const list = insightsFor(base(), NOW);
  assert.ok(list.every((x) => ['bad', 'warn', 'good', 'info'].includes(x.level) && x.title && typeof x.detail === 'string'));
  assert.ok(!list.some((x) => x.level === 'bad' || x.level === 'warn'), JSON.stringify(list));
  assert.ok(list.some((x) => x.level === 'good'));
});

test('insights: error rate vs yesterday', () => {
  const p = base(); p.traffic.last24h = { requests: 2000, errors: 160, cpuP99Ms: 3 }; p.traffic.prev24h = { requests: 1000, errors: 5 };
  const list = insightsFor(p, NOW);
  assert.deepEqual(levels(list, /שגיאות/), ['bad']);
  assert.match(list.find((x) => /שגיאות/.test(x.title)).detail, /8%/);
  assert.match(list.find((x) => /שגיאות/.test(x.title)).detail, /0\.5%/);
  p.traffic.last24h.errors = 30; // 1.5% vs 0.5%
  assert.deepEqual(levels(insightsFor(p, NOW), /שיעור השגיאות/), ['warn']);
});

test('insights: traffic doubled vs yesterday is reported', () => {
  const p = base(); p.traffic.last24h.requests = 26800; p.traffic.prev24h.requests = 12617;
  const t = insightsFor(p, NOW).find((x) => /תנועה/.test(x.title));
  assert.equal(t.level, 'info');
  assert.match(t.title, /פי 2\.1/);
});

test('insights: CPU p99 near the limit', () => {
  const p = base(); p.workers[0].cpuP99Ms = 9; // free plan: 10 ms
  assert.deepEqual(levels(insightsFor(p, NOW), /CPU/), ['warn']);
  p.workers[0].cpuP99Ms = 26; p.plan.paid = true; // paid: 30 s default
  assert.deepEqual(levels(insightsFor(p, NOW), /CPU/), []);
  p.plan.paid = false;
  assert.deepEqual(levels(insightsFor(p, NOW), /CPU/), ['bad']);
});

test('insights: the last deploy, its trigger, and whether it is the one serving', () => {
  const p = base();
  p.workers[0].deployments = [{ id: 'd3', createdAt: iso(NOW - 0.3 * HOUR), trigger: 'secret', versions: [{ id: V.new, pct: 100 }] },
    { id: 'd2', createdAt: iso(NOW - 5 * HOUR), trigger: 'deployment', versions: [{ id: V.prev, pct: 100 }] }];
  const d = insightsFor(p, NOW).find((x) => /פריסה/.test(x.title));
  assert.equal(d.level, 'info');
  assert.match(d.detail, /סוד/);
  assert.match(d.detail, /5 שעות/);
  const q = base();
  q.workers[0].versions = [{ id: V.new, number: 161 }, { id: V.prev, number: 160 }]; q.workers[0].serving = [{ id: V.prev, pct: 100, number: 160 }];
  const s = insightsFor(q, NOW).find((x) => /מגישה/.test(x.title));
  assert.equal(s.level, 'warn');
  assert.match(s.detail, /161/);
  const g = base(); g.workers[0].serving = [{ id: V.new, pct: 90, number: 161 }, { id: V.prev, pct: 10, number: 160 }];
  assert.equal(insightsFor(g, NOW).find((x) => /הדרגתית/.test(x.title)).level, 'warn');
});

test('insights: D1 size vs the plan limit', () => {
  const p = base(); p.d1 = [{ name: 'golem-corpus', sizeBytes: 610066432 }]; p.plan = { paid: true };
  const d = insightsFor(p, NOW).find((x) => /D1/.test(x.title));
  assert.equal(d.level, 'info');
  assert.match(d.detail, /10 GB/);
  const f = base(); f.d1 = [{ name: 'x', sizeBytes: 450e6 }];
  assert.equal(insightsFor(f, NOW).find((x) => /D1/.test(x.title)).level, 'warn');
  const b = base(); b.d1 = [{ name: 'x', sizeBytes: 9.8e9 }]; b.plan = { paid: true };
  assert.equal(insightsFor(b, NOW).find((x) => /D1/.test(x.title)).level, 'bad');
});

test('insights: Workers AI neurons vs the free 10k a day', () => {
  const p = base(); p.ai = { neuronsToday: 160362.2, neurons24h: 194370.5 };
  const a = insightsFor(p, NOW).find((x) => /נוירונים/.test(x.title));
  assert.equal(a.level, 'warn');
  assert.match(a.title, /פי 16/);
  assert.match(a.detail, /\$1\.65/);
  const q = base(); q.ai = { neuronsToday: 8000 };
  assert.equal(insightsFor(q, NOW).find((x) => /נוירונים/.test(x.title)).level, 'info');
  const n = base(); n.ai = { neuronsToday: 900 };
  assert.equal(insightsFor(n, NOW).find((x) => /נוירונים/.test(x.title)), undefined);
});

test('insights: Durable Object and AI Gateway errors', () => {
  const p = base(); p.durableObjects = [{ name: 'apple_SessionDO', className: 'SessionDO', requests24h: 24166, errors24h: 193 }];
  p.aiGateway = [{ id: 'golem', requests24h: 1921, errors24h: 27, cost24h: 2.19 }];
  const list = insightsFor(p, NOW);
  assert.equal(list.find((x) => /SessionDO/.test(x.title)).level, 'warn');
  const g = list.find((x) => /Gateway/.test(x.title));
  assert.equal(g.level, 'info');
  assert.match(g.detail, /\$2\.19/);
});

test('insights tolerate an empty or odd payload', () => {
  assert.ok(Array.isArray(insightsFor({}, NOW)));
  assert.ok(Array.isArray(insightsFor({ workers: [{}], traffic: null, d1: 'x', ai: null }, NOW)));
});
