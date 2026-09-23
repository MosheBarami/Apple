// Supabase page API: shape, not-connected, the read-only SQL guard, dry-run plans, secrets, insights.
// No network: globalThis.fetch is replaced by a router over fixtures shaped like the live
// Management API answers (measured 2026-09-23). Run: node --test scripts/owner-dashboard/cc/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { uncache } from './http.mjs';
import { supabase, supabaseAction, guardSql, insightsOf, REF } from './platforms/supabase.mjs';

const SENTINEL = 'SECRET_SENTINEL_SUPA_TEST_0123456789';
const API = 'https://api.supabase.com/v1';
const HE = /[֐-׿]/;
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJlLXNpZ25hdHVyZQ';

// ---------------------------------------------------------------- fixtures
const lint = (name, level, meta, extra = {}) => ({ name, title: name.replace(/_/g, ' '), level, facing: 'EXTERNAL', categories: ['SECURITY'],
  description: `about ${name}`, detail: `Table \\\`${meta?.schema}.${meta?.name}\\\` needs attention`, remediation: `https://supabase.com/docs/guides/database/database-linter?lint=${name}`,
  metadata: meta, cache_key: `${name}_${meta?.name}`, ...extra });
const CATALOG = {
  db_bytes: 12_840_083,
  tables: [
    { schema: 'public', name: 'projects', rls: true, forced: false, rows: 116, bytes: 229_376, policies: 2 },
    { schema: 'public', name: 'profiles', rls: true, forced: false, rows: 32, bytes: 98_304, policies: 3 },
    { schema: 'auth', name: 'users', rls: true, forced: false, rows: 32, bytes: 270_336, policies: 0 },
  ],
  users: { total: 32, confirmed: 30, last7: 4, prev7: 2, active7: 12, anonymous: 0 },
  providers: [{ provider: 'email', users: 30 }, { provider: 'github', users: 2 }],
  signups: Array.from({ length: 30 }, (_, i) => ({ day: `2026-08-${String(i + 1).padStart(2, '0')}`, n: i % 5 })),
  recent: [{ id: 'u1', email: 'a@example.com', created_at: '2026-09-20T10:00:00Z', last_sign_in_at: '2026-09-22T10:00:00Z', confirmed: true, anonymous: false, providers: ['email'] }],
  buckets: [{ name: 'avatars', public: true, created_at: '2026-09-01T00:00:00Z', objects: 3, bytes: 4096 }],
  connections: 9, max_connections: 60, cache_hit: 0.9987,
  extensions: [{ name: 'pgcrypto', version: '1.3' }],
};
const FIX = {
  project: { id: REF, ref: REF, organization_id: 'orgslug', organization_slug: 'orgslug', name: 'AppleAI', region: 'eu-central-1', created_at: '2026-08-30T00:00:00Z',
    status: 'ACTIVE_HEALTHY', database: { host: `db.${REF}.supabase.co`, version: '17.6.1.166', postgres_engine: '17', release_channel: 'ga' } },
  health: [
    { name: 'auth', healthy: true, status: 'ACTIVE_HEALTHY', info: { name: 'GoTrue', version: 'v2.197.0' } },
    { name: 'db', healthy: true, status: 'ACTIVE_HEALTHY' }, { name: 'rest', healthy: true, status: 'ACTIVE_HEALTHY' },
    { name: 'realtime', healthy: false, status: 'UNHEALTHY', error: 'Realtime is not healthy' }, { name: 'storage', healthy: true, status: 'ACTIVE_HEALTHY' },
  ],
  security: { lints: [
    lint('rls_enabled_no_policy', 'INFO', { schema: 'public', name: 'outbox', type: 'table' }),
    lint('anon_security_definer_function_executable', 'WARN', { schema: 'public', name: 'fn_a', type: 'function' }),
    lint('anon_security_definer_function_executable', 'WARN', { schema: 'public', name: 'fn_b', type: 'function' }),
    lint('auth_leaked_password_protection', 'WARN', { entity: 'Auth', type: 'auth' }),
  ] },
  performance: { lints: [lint('unindexed_foreign_keys', 'INFO', { schema: 'public', name: 'checkpoints', type: 'table' }),
    lint('auth_rls_initplan', 'WARN', { schema: 'public', name: 'projects', type: 'table' })] },
  functions: [{ id: 'f1', slug: 'hello', name: 'hello', status: 'ACTIVE', version: 3, created_at: 1_790_000_000_000, updated_at: 1_790_100_000_000, verify_jwt: true }],
  migrations: [{ version: '20260830160758', name: 'init_schema' }, { version: '20260901000000', name: 'add_waitlist' }],
  backups: { region: 'eu-central-1', walg_enabled: true, pitr_enabled: false, backups: [], physical_backup_data: {} },
  usage: { result: Array.from({ length: 7 }, (_, i) => ({ timestamp: `2026-09-${String(16 + i).padStart(2, '0')}T00:00:00`,
    total_auth_requests: 100 + i, total_realtime_requests: 0, total_rest_requests: 400 + i, total_storage_requests: 0 })) },
  org: { id: 'orgslug', name: 'Owner Org', plan: 'free' },
  traffic: { result: Array.from({ length: 24 }, (_, i) => ({ t: 1_790_107_200_000_000 + i * 3_600_000_000, n: 200 + i, errors: i === 5 ? 4 : 0 })) },
};

let calls = [];
let mode = 'normal'; // normal | echo200 | echo403 | echo500text | throw
let overrides = {}; // route name -> (url, init) => { status, body } | throws
const routeOf = (url) => {
  const u = new URL(url); const p = u.pathname;
  if (p === `/v1/projects/${REF}`) return 'project';
  if (p.endsWith('/health')) return 'health';
  if (p.endsWith('/advisors/security')) return 'security';
  if (p.endsWith('/advisors/performance')) return 'performance';
  if (p.endsWith('/functions')) return 'functions';
  if (p.endsWith('/database/migrations')) return 'migrations';
  if (p.endsWith('/database/backups')) return 'backups';
  if (p.endsWith('/usage.api-counts')) return 'usage';
  if (p.endsWith('/logs.all')) return 'logs';
  if (p.endsWith('/database/query')) return 'query';
  if (p.startsWith('/v1/organizations/')) return 'org';
  return 'unknown';
};
function answer(url, init) {
  const r = routeOf(url);
  if (overrides[r]) return overrides[r](url, init);
  if (r === 'query') {
    const q = JSON.parse(init.body).query;
    if (/json_build_object\(\s*'db_bytes'/.test(q)) return { status: 201, body: [{ d: CATALOG }] };
    return { status: 201, body: [{ id: 1, name: 'row', api_key: 'sk_live_abc', webhook_secret: 'plain-looking-value-42', note: `bearer ${JWT}`, echo: SENTINEL }] };
  }
  if (r === 'logs') {
    const sql = new URL(url).searchParams.get('sql') || '';
    if (/timestamp_trunc/.test(sql)) return { status: 200, body: FIX.traffic };
    if (/auth_logs/.test(sql)) return { status: 200, body: { result: [{ timestamp: 1_790_192_725_000_000,
      event_message: JSON.stringify({ level: 'error', status: 400, method: 'POST', path: '/token?grant_type=password', msg: 'invalid login', remote_addr: '203.0.113.9', request_id: 'r1' }) }] } };
    return { status: 200, body: { result: [{ timestamp: 1_790_158_779_015_000, method: 'GET', path: '/rest/v1/projects?apikey=abc', status: 401 }] } };
  }
  return { status: 200, body: FIX[r] ?? null };
}
function fakeFetch(url, init = {}) {
  calls.push({ url: String(url), init });
  const echo = JSON.stringify({ message: 'upstream said no', headers: init.headers, auth: init.headers?.authorization });
  if (mode === 'throw') return Promise.reject(new Error(`network down ${init.headers?.authorization}`));
  if (mode === 'echo200') return Promise.resolve(new Response(echo, { status: 200, headers: { 'content-type': 'application/json' } }));
  if (mode === 'echo403') return Promise.resolve(new Response(echo, { status: 403 }));
  if (mode === 'echo500text') return Promise.resolve(new Response(`boom ${init.headers?.authorization}`, { status: 500 }));
  const a = answer(String(url), init);
  return Promise.resolve(new Response(JSON.stringify(a.body), { status: a.status, headers: { 'content-type': 'application/json' } }));
}

const realFetch = globalThis.fetch;
function reset({ token = SENTINEL } = {}) {
  calls = []; mode = 'normal'; overrides = {};
  if (token) process.env.SUPABASE_ACCESS_TOKEN = token; else delete process.env.SUPABASE_ACCESS_TOKEN;
  uncache('supabase');
  globalThis.fetch = fakeFetch;
}
test.after(() => { globalThis.fetch = realFetch; });

// ---------------------------------------------------------------- not connected
test('not connected: every entry point says why and sends nothing', async () => {
  reset({ token: null });
  const g = await supabase();
  assert.equal(g.ok, false); assert.match(g.reason, /SUPABASE_ACCESS_TOKEN/); assert.match(g.reason, HE);
  for (const body of [{ kind: 'sql', query: 'select 1' }, { kind: 'logs', q: 'edge-errors' }, { kind: 'preview', schema: 'public', table: 'projects' }]) {
    const r = await supabaseAction(body);
    assert.equal(r.ok, false, body.kind); assert.match(r.reason, /SUPABASE_ACCESS_TOKEN/);
  }
  assert.equal(calls.length, 0, 'no request may leave without a token');
});

// ---------------------------------------------------------------- shape
test('GET: the payload carries every Studio section from real-shaped answers', async () => {
  reset();
  const d = await supabase();
  assert.equal(d.ok, true); assert.ok(d.fetchedAt);
  assert.deepEqual(d.errors, {});
  assert.equal(d.project.name, 'AppleAI'); assert.equal(d.project.ref, REF); assert.equal(d.project.dbVersion, '17.6.1.166');
  assert.equal(d.org.plan, 'free');
  assert.equal(d.health.length, 5); assert.equal(d.health.find((s) => s.name === 'realtime').healthy, false);
  assert.equal(d.dbSizeBytes, CATALOG.db_bytes);
  assert.equal(d.tables.length, 3); assert.deepEqual(Object.keys(d.tables[0]).sort(), ['bytes', 'forced', 'name', 'policies', 'rls', 'rows', 'schema', 'sizeBytes'].sort());
  assert.equal(d.authUsers, 32); // kept for the HQ page and insights.mjs
  assert.equal(d.auth.users.total, 32); assert.equal(d.auth.providers.length, 2); assert.equal(d.auth.signups.length, 30); assert.equal(d.auth.recent[0].email, 'a@example.com');
  assert.deepEqual(d.advisors.security && [d.advisors.security.error, d.advisors.security.warn, d.advisors.security.info], [0, 3, 1]);
  const g = d.advisors.security.groups.find((x) => x.name === 'anon_security_definer_function_executable');
  assert.equal(g.count, 2); assert.match(g.he, HE); assert.ok(g.remediation.startsWith('https://supabase.com/'));
  assert.ok(!/\\`/.test(JSON.stringify(d.advisors)), 'escaped backticks are cleaned');
  assert.equal(d.advisors.performance.warn, 1);
  assert.equal(d.storage.buckets[0].objects, 3);
  assert.equal(d.functions[0].slug, 'hello');
  assert.equal(d.migrations.length, 2);
  assert.equal(d.backups.pitr, false);
  assert.equal(d.usage.days.length, 7); assert.equal(d.usage.totals.rest, FIX.usage.result.reduce((s, r) => s + r.total_rest_requests, 0));
  assert.equal(d.traffic.length, 24); assert.equal(d.traffic.reduce((s, r) => s + r.errors, 0), 4);
  assert.equal(d.db.connections, 9); assert.equal(d.db.maxConnections, 60);
  assert.ok(Array.isArray(d.insights) && d.insights.length >= 2 && d.insights.length <= 4);
  for (const x of d.insights) { assert.ok(['bad', 'warn', 'good', 'info'].includes(x.level)); assert.match(x.title, HE); assert.equal(typeof x.detail, 'string'); }
  // every request is the Management API, SQL is read-only, and no credential rides in a URL or body
  assert.ok(calls.length >= 10);
  for (const c of calls) {
    assert.ok(c.url.startsWith(`${API}/`), c.url);
    assert.ok(!c.url.includes(SENTINEL) && !String(c.init.body || '').includes(SENTINEL));
    if (routeOf(c.url) === 'query') assert.equal(JSON.parse(c.init.body).read_only, true);
    assert.ok(!c.init.method || c.init.method === 'GET' || routeOf(c.url) === 'query', `only the query endpoint is POSTed: ${c.url}`);
  }
});

test('GET: one failing section shows its Hebrew reason and leaves the rest', async () => {
  reset();
  overrides.health = () => ({ status: 500, body: { message: `leak ${SENTINEL}` } });
  overrides.logs = () => ({ status: 200, body: { error: `Backend error ${SENTINEL}` } }); // the logs API answers 200 with an error body
  const d = await supabase();
  assert.equal(d.ok, true);
  assert.equal(d.health, null); assert.match(d.errors.health, HE);
  assert.equal(d.traffic, null); assert.match(d.errors.traffic, HE);
  assert.equal(d.project.name, 'AppleAI');
  assert.ok(!JSON.stringify(d).includes(SENTINEL)); assert.ok(!JSON.stringify(d).includes('Backend error'));
});

test('GET: everything failing is a failure, not an empty page', async () => {
  reset(); mode = 'echo403';
  const d = await supabase();
  assert.equal(d.ok, false); assert.match(d.reason, HE);
});

// ---------------------------------------------------------------- the read-only SQL guard
const WRITE_WORDS = ['insert', 'update', 'delete', 'merge', 'upsert', 'drop', 'alter', 'create', 'truncate', 'grant', 'revoke', 'copy', 'call', 'do', 'set',
  'reset', 'lock', 'vacuum', 'analyze', 'cluster', 'refresh', 'comment', 'security', 'listen', 'notify', 'prepare', 'execute', 'discard', 'begin', 'commit',
  'rollback', 'savepoint', 'import'];
const REJECT = [
  ...WRITE_WORDS.map((w) => `${w} x`),
  ...WRITE_WORDS.map((w) => `with a as (${w} x) select 1`),
  ...WRITE_WORDS.map((w) => `select 1; ${w} x`),
  'select 1; select 2',
  'select 1 /* hi */; drop table x',
  'select 1 -- note\n; delete from x',
  'select 1 /* nested /* deeper */ still */; truncate x',
  "select $a$ text $a$; drop table y",
  "select 'unterminated",
  'select 1 /* unterminated',
  'select * into t2 from public.projects',
  'select * from public.projects for update',
  'select * from public.projects for share',
  'explain analyze select 1',
  'explain (analyze) select 1',
  'show all',
  'table public.projects',
  'values (1)',
  'select pg_terminate_backend(1)',
  'select pg_cancel_backend(1)',
  'select pg_reload_conf()',
  'select PG_SLEEP(10)',
  'select pg_read_file(\'/etc/passwd\')',
  'select lo_import(\'/etc/passwd\')',
  "select * from dblink('x', 'select 1') as t(a int)",
  "select set_config('role', 'postgres', false)",
  "select current_setting('app.settings.jwt_secret')",
  "select query_to_xml('select 1', true, true, '')",
  'select encrypted_password from auth.users',
  'select u.encrypted_password from auth.users u',
  'select "encrypted_password" from "auth"."users"',
  'select * from auth.users',
  'select u.* from auth.users u',
  'select to_json(u) from auth.users u',
  'select row_to_json(users) from auth.users',
  'select u from auth.users as u',
  'select raw_user_meta_data from auth.users',
  'select raw_app_meta_data->>\'provider\' from auth.users',
  'select confirmation_token from auth.users',
  'select identity_data from auth.identities',
  'select * from auth.refresh_tokens',
  'select * from auth.sessions',
  'select * from "auth"."sessions"',
  'select * from auth . sessions',
  'select * from auth.mfa_factors',
  'select * from auth.one_time_tokens',
  'select * from auth.flow_state',
  'select * from auth.audit_log_entries',
  'select * from vault.decrypted_secrets',
  'select * from vault.secrets',
  'select * from pgsodium.key',
  'select * from public.membership_outbox_secret',
  'select api_key from public.integrations',
  'select * from pg_authid',
  'select * from pg_shadow',
  'select * from pg_settings',
  'select query from pg_stat_activity',
  'select * from pg_stat_statements',
  'select * from pg_user_mappings',
  'select U&"d\\0061ta" from public.projects',
  'select net.http_get(\'https://example.com\')',
  "select cron.schedule('x', '* * * * *', 'select 1')",
  'select nextval(\'s\')',
  '',
  '   ',
  ';',
];
const ACCEPT = [
  'select 1',
  'SELECT 1 AS one;',
  'with a as (select 1 as n) select * from a',
  'explain select * from public.projects',
  'explain (format json) select * from public.projects',
  'select count(*) from auth.users',
  'select u.email, u.created_at, u.last_sign_in_at from auth.users u',
  'select i.provider, count(*) from auth.identities i group by i.provider',
  "select 'drop table x; delete' as just_text",
  "select $$ insert $$ as t",
  'select updated_at, created_at from public.projects -- a comment with delete in it',
  'select pg_size_pretty(pg_database_size(current_database()))',
  'select relname, n_live_tup from pg_stat_user_tables order by 2 desc',
  'select "name" from "public"."projects" limit 5',
];
test('guard: rejects every write, second statement, hidden write and secret source', () => {
  assert.ok(REJECT.length > 120, 'the list is populated');
  for (const q of REJECT) {
    const g = guardSql(q);
    assert.equal(g.ok, false, `must reject: ${JSON.stringify(q)}`);
    assert.match(g.reason, HE, `reason is Hebrew for ${q}`);
  }
});
test('guard: lets ordinary reads through', () => {
  for (const q of ACCEPT) { const g = guardSql(q); assert.equal(g.ok, true, `must accept: ${q} (${g.reason})`); }
});
test('guard: a rejected query never leaves the machine', async () => {
  reset();
  for (const q of ['delete from public.projects', 'select * from auth.sessions', 'select 1; drop table x']) {
    const r = await supabaseAction({ kind: 'sql', query: q });
    assert.equal(r.ok, false); assert.match(r.reason, HE);
  }
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------- SQL runner
test('sql: read-only, capped, timed out, and every value masked or redacted', async () => {
  reset();
  const r = await supabaseAction({ kind: 'sql', query: 'select * from public.projects;' });
  assert.equal(r.ok, true, r.reason);
  assert.equal(calls.length, 1);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(calls[0].url, `${API}/projects/${REF}/database/query`); assert.equal(calls[0].init.method, 'POST');
  assert.equal(body.read_only, true);
  assert.match(body.query, /statement_timeout/i);
  assert.match(body.query, /\(\s*select \* from public\.projects\s*\)/); assert.match(body.query, /limit 200\b/);
  assert.deepEqual(r.columns, ['id', 'name', 'api_key', 'webhook_secret', 'note', 'echo']);
  const s = JSON.stringify(r);
  assert.ok(!s.includes('sk_live_abc'), 'a secret-looking value is masked');
  assert.ok(!s.includes('plain-looking-value-42'), 'a secret-named column is masked even when its value looks harmless');
  assert.ok(!s.includes(JWT), 'a JWT-looking value is masked');
  assert.ok(!s.includes(SENTINEL), 'an env credential is redacted');
  assert.equal(r.rows[0].name, 'row');
});
test('sql: EXPLAIN is sent as-is (no row wrapper), still read-only', async () => {
  reset();
  overrides.query = () => ({ status: 201, body: [{ 'QUERY PLAN': 'Seq Scan on projects' }] });
  const r = await supabaseAction({ kind: 'sql', query: 'explain select * from public.projects' });
  assert.equal(r.ok, true);
  const body = JSON.parse(calls[0].init.body);
  assert.match(body.query, /;\s*explain select \* from public\.projects$/); assert.equal(body.read_only, true);
});
test('sql: an upstream refusal becomes a Hebrew reason without the upstream body', async () => {
  reset();
  overrides.query = () => ({ status: 400, body: { message: `ERROR: relation "x" does not exist ${SENTINEL}` } });
  const r = await supabaseAction({ kind: 'sql', query: 'select * from x' });
  assert.equal(r.ok, false); assert.match(r.reason, HE); assert.ok(!JSON.stringify(r).includes(SENTINEL));
});

// ---------------------------------------------------------------- dry-run plans
test('dryRun: backup and sql return the exact plan and send nothing', async () => {
  reset();
  const b = await supabaseAction({ kind: 'backup', dryRun: true });
  assert.equal(b.ok, true); assert.equal(b.dryRun, true);
  assert.equal(b.plan.method, 'POST'); assert.equal(b.plan.url, `${API}/projects/${REF}/database/query`); assert.equal(b.plan.body.read_only, true);
  const s = await supabaseAction({ kind: 'sql', query: 'select 1', dryRun: true });
  assert.equal(s.ok, true); assert.equal(s.dryRun, true);
  assert.deepEqual(Object.keys(s.plan).sort(), ['body', 'method', 'url']);
  assert.equal(s.plan.method, 'POST'); assert.equal(s.plan.url, `${API}/projects/${REF}/database/query`);
  assert.equal(s.plan.body.read_only, true); assert.match(s.plan.body.query, /\(\s*select 1\s*\) as _q limit 200/);
  const bad = await supabaseAction({ kind: 'sql', query: 'drop table x', dryRun: true });
  assert.equal(bad.ok, false, 'the guard runs before the plan');
  assert.equal(calls.length, 0);
  assert.ok(!JSON.stringify([b, s]).includes(SENTINEL));
});
test('reset stays refused on purpose; unknown kinds fail', async () => {
  reset();
  for (const kind of ['reset', 'reset-test-data']) { const r = await supabaseAction({ kind }); assert.equal(r.ok, false); assert.match(r.reason, /חסומה בכוונה/); }
  assert.equal((await supabaseAction({ kind: 'pause' })).ok, false);
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------- logs explorer and table preview
test('logs: fixed queries only, query strings and client addresses stripped', async () => {
  reset();
  const e = await supabaseAction({ kind: 'logs', q: 'edge-errors' });
  assert.equal(e.ok, true); assert.equal(e.rows[0].path, '/rest/v1/projects'); assert.equal(e.rows[0].status, 401);
  assert.ok(calls[0].url.startsWith(`${API}/projects/${REF}/analytics/endpoints/logs.all?`));
  const u = new URL(calls[0].url); assert.ok(u.searchParams.get('iso_timestamp_start')); assert.match(u.searchParams.get('sql'), /edge_logs/);
  const a = await supabaseAction({ kind: 'logs', q: 'auth' });
  assert.equal(a.ok, true); assert.equal(a.rows[0].path, '/token'); assert.equal(a.rows[0].level, 'error');
  assert.ok(!JSON.stringify(a).includes('203.0.113.9'), 'client address dropped');
  const n = calls.length;
  const x = await supabaseAction({ kind: 'logs', q: 'select * from edge_logs' });
  assert.equal(x.ok, false); assert.equal(calls.length, n, 'free-form log SQL is not accepted');
});
test('logs: a 200 carrying {error} is a failure', async () => {
  reset();
  overrides.logs = () => ({ status: 200, body: { result: [], error: `Backend error! ${SENTINEL}` } }); // result present, error set
  const r = await supabaseAction({ kind: 'logs', q: 'postgres-errors' });
  assert.equal(r.ok, false); assert.match(r.reason, HE); assert.ok(!JSON.stringify(r).includes('Backend error'));
});
test('preview: goes through the same guard, names are validated', async () => {
  reset();
  const ok = await supabaseAction({ kind: 'preview', schema: 'public', table: 'projects' });
  assert.equal(ok.ok, true);
  assert.match(JSON.parse(calls[0].init.body).query, /"public"\."projects"/);
  const n = calls.length;
  for (const body of [{ schema: 'auth', table: 'users' }, { schema: 'auth', table: 'sessions' }, { schema: 'vault', table: 'secrets' },
    { schema: 'public', table: 'projects"; drop table x; --' }, { schema: 'public', table: 'projects" where true --' }, { schema: 'public" ."x', table: 'y' }, { schema: 'public', table: 'membership_outbox_secret' }]) {
    const r = await supabaseAction({ kind: 'preview', ...body });
    assert.equal(r.ok, false, JSON.stringify(body)); assert.match(r.reason, HE);
  }
  assert.equal(calls.length, n);
});

// ---------------------------------------------------------------- no secret anywhere
test('no credential in any response: echo 200/403/500 and a throwing fetch', async () => {
  const bodies = [{ kind: 'sql', query: 'select 1' }, { kind: 'logs', q: 'auth' }, { kind: 'preview', schema: 'public', table: 'projects' },
    { kind: 'backup', dryRun: true }, { kind: 'nothing' }];
  for (const m of ['echo200', 'echo403', 'echo500text', 'throw']) {
    reset(); mode = m;
    const g = await supabase();
    assert.equal(typeof g.ok, 'boolean');
    assert.ok(!JSON.stringify(g).includes(SENTINEL), `GET leaked in ${m}`);
    for (const b of bodies) { uncache('supabase'); const r = await supabaseAction(b); assert.ok(!JSON.stringify(r).includes(SENTINEL), `${b.kind} leaked in ${m}`); }
  }
});

// ---------------------------------------------------------------- insights
const base = () => ({
  project: { status: 'ACTIVE_HEALTHY', name: 'AppleAI' }, org: { plan: 'free' }, dbSizeBytes: 12_840_083,
  health: FIX.health.map((h) => ({ name: h.name, healthy: h.healthy, status: h.status })),
  usage: { totals: { rest: 2800, auth: 700, storage: 0, realtime: 0 } },
  advisors: { security: { error: 0, warn: 3, info: 1, groups: [
    { name: 'anon_security_definer_function_executable', he: 'x', level: 'WARN', count: 2, items: [{ object: 'public.fn_a' }] },
    { name: 'auth_leaked_password_protection', he: 'y', level: 'WARN', count: 1, items: [{ object: 'Auth' }] }] } },
  tables: [{ schema: 'public', name: 'projects', rls: true }],
  auth: { users: { last7: 4, prev7: 2 } }, backups: { pitr: false, list: [] }, localBackups: [], traffic: [],
});
test('insights: Hebrew, ranked, 2-4, each names its evidence', () => {
  const xs = insightsOf(base());
  assert.ok(xs.length >= 2 && xs.length <= 4, `got ${xs.length}`);
  const rank = { bad: 0, warn: 1, info: 2, good: 3 };
  for (let i = 1; i < xs.length; i++) assert.ok(rank[xs[i - 1].level] <= rank[xs[i].level], 'sorted by severity');
  const sec = xs.find((x) => /אזהרות אבטחה/.test(x.title));
  assert.ok(sec, 'a security insight'); assert.equal(sec.level, 'warn'); assert.match(sec.title, /3/);
  assert.match(sec.detail, /anon_security_definer_function_executable/, 'the English lint name is kept');
  const rt = xs.find((x) => /Realtime/.test(x.title + x.detail)); assert.ok(rt, 'the unhealthy service is named');
  assert.match(rt.detail, /0/, 'and that nothing uses it');
});
test('insights: RLS off on a public table is the worst finding and names the table', () => {
  const d = base();
  d.advisors.security = { error: 1, warn: 3, info: 0, groups: [{ name: 'rls_disabled_in_public', he: 'z', level: 'ERROR', count: 1, items: [{ object: 'public.orders', table: 'orders' }] }, ...d.advisors.security.groups] };
  const xs = insightsOf(d);
  assert.equal(xs[0].level, 'bad'); assert.match(xs[0].title, /RLS/); assert.match(xs[0].title, /orders/);
});
test('insights: database size against the free-plan 500 MB', () => {
  const d = base(); d.dbSizeBytes = 470 * 1024 * 1024; d.health = d.health.map((h) => ({ ...h, healthy: true }));
  const xs = insightsOf(d);
  const sz = xs.find((x) => /500/.test(x.title + x.detail)); assert.ok(sz); assert.equal(sz.level, 'bad');
  const small = insightsOf({ ...base(), auth: null, backups: null, advisors: { security: { error: 0, warn: 0, info: 0, groups: [] } }, health: base().health.map((h) => ({ ...h, healthy: true })) });
  const s2 = small.find((x) => /500/.test(x.title + x.detail)); assert.ok(s2); assert.equal(s2.level, 'good');
});
test('insights: sign-up trend compares this week to last', () => {
  const xs = insightsOf({ ...base(), advisors: { security: { error: 0, warn: 0, info: 0, groups: [] } }, health: base().health.map((h) => ({ ...h, healthy: true })), backups: { pitr: true, list: [{}] } });
  const su = xs.find((x) => /הרשמ|נרשמו/.test(x.title)); assert.ok(su); assert.match(su.title + su.detail, /4/); assert.match(su.title + su.detail, /2/);
});
test('insights: a failed section is said, not scored as zero', () => {
  const xs = insightsOf({ ...base(), advisors: { security: null }, errors: { security: 'לטוקן אין הרשאה' } });
  assert.ok(!xs.some((x) => /0 אזהרות/.test(x.title)), 'an unread advisor is not "0 warnings"');
});
