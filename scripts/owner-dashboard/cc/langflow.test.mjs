// Langflow page backend: no network. fetch is a fake local Langflow that answers by path; the login
// token, the minted run key and the flow's own credential are sentinels, and so are the personal fields
// a real instance returns (user ids, run inputs and outputs, session ids). No return value may carry any.
//   node --test scripts/owner-dashboard/cc/langflow.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.LANGFLOW_API_KEY;
process.env.LANGFLOW_URL = 'http://lf.test';

const S = { login: 'SENTINEL_LF_LOGIN_TOKEN', key: 'sk-SENTINEL_LF_RUN_KEY', env: 'SENTINEL_LF_ENV_KEY', cred: 'SENTINEL_LF_CF_TOKEN',
  user: 'SENTINEL_LF_USER_ID', email: 'owner.sentinel@example.test', out: 'SENTINEL_LF_RUN_OUTPUT_BODY', session: 'SENTINEL_LF_SESSION' };
const clean = (x) => { const s = JSON.stringify(x); for (const [k, v] of Object.entries(S)) assert.ok(!s.includes(v), `leaked ${k}: ${v}`); };

const { langflow, langflowAction, langflowConclusions, repoFlows, canvasOf, MAX_INPUT } = await import('./platforms/langflow.mjs');
const { uncache } = await import('./http.mjs');
const REPO = repoFlows();
assert.ok(REPO && REPO.length >= 4, 'the repo flows were not found — every test here would check nothing');
const [A, B, C] = REPO;

const trace = (id, flowId, status, startTime) => ({ id, flowId, status, startTime, totalLatencyMs: 1200, totalTokens: 10,
  inputs: { input_value: S.email }, outputs: { message: S.out }, sessionId: S.session });
const FIX = {
  'GET /health': { status: 'ok' },
  'GET /api/v1/version': { version: '1.12.2', main_version: '1.12.2' },
  'GET /api/v1/auto_login': { access_token: S.login, refresh_token: S.login, token_type: 'bearer' },
  'GET /api/v1/flows/': [...REPO.map((f) => ({ id: f.id, name: f.name, folder_id: 'p-1', user_id: S.user, is_component: false })),
    { id: 'other', name: 'Scratch', user_id: S.user, is_component: false }, { id: 'comp', name: 'A component', is_component: true }],
  'GET /api/v1/monitor/traces': { total: 2, traces: [trace('aaaaaaaa-1111', B.id, 'error', '2026-09-23T18:50:20'), trace('bbbbbbbb-2222', A.id, 'ok', '2026-09-23T18:40:00')] },
  'GET /api/v1/projects/': [{ id: 'p-1', name: 'Apple', user_id: S.user }],
  'GET /api/v1/monitor/job_queue': { backend: 'asyncio', active_jobs: 0 },
  'POST /api/v1/api_key/': { id: 'key-1', name: 'x', api_key: S.key, user_id: S.user },
  'DELETE /api/v1/api_key/key-1': { detail: 'deleted' },
};
// The instance copy of a flow: its credential field holds a real-looking token, and its code differs
// from the repo file, so the page must show "drift" without ever carrying the copy's contents.
const instanceFlow = (id) => ({ id, updated_at: '2026-09-23T18:00:00', user_id: S.user,
  data: { nodes: [{ id: 'n', data: { type: 'AppleWorkersAI', node: { template: { api_token: { value: S.cred, password: true }, code: { value: 'edited in the UI' } } } } }] } });

let mode = 'fixture';
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)); const method = init.method || 'GET'; const h = init.headers || {};
  calls.push({ method, path: u.pathname, auth: h.authorization || null, key: h['x-api-key'] || null, body: init.body ?? null });
  const echo = `${h.authorization || ''} ${h['x-api-key'] || ''}`;
  if (mode === 'throw') throw Object.assign(new Error(`connect ECONNREFUSED ${echo}`), { name: 'TypeError' });
  if (mode !== 'fixture' && u.pathname !== '/health') {
    if (mode === 'throw-run' && u.pathname.startsWith('/api/v1/run/')) throw Object.assign(new Error(`socket hang up ${echo}`), { name: 'TypeError' });
    if (mode === '500-run' && u.pathname.startsWith('/api/v1/run/')) return new Response(`Traceback ... key=${echo}`, { status: 500 });
    if (['401', '403', '500'].includes(mode)) return new Response(JSON.stringify({ detail: `bad credentials ${echo}` }), { status: Number(mode), headers: { 'content-type': 'application/json' } });
  }
  let body = FIX[`${method} ${u.pathname}`];
  if (!body && method === 'GET' && /^\/api\/v1\/flows\/[^/]+$/.test(u.pathname)) body = instanceFlow(u.pathname.split('/').pop());
  if (!body && method === 'POST' && u.pathname.startsWith('/api/v1/run/')) body = { session_id: S.session, outputs: [{ inputs: { input_value: S.email }, outputs: [{ results: { message: { text: 'chunked 12 sections', sender: S.user } } }] }] };
  return new Response(JSON.stringify(body ?? { detail: 'Not Found' }), { status: body ? 200 : 404, headers: { 'content-type': 'application/json' } });
};

beforeEach(() => { mode = 'fixture'; calls.length = 0; uncache('langflow'); delete process.env.LANGFLOW_API_KEY; process.env.LANGFLOW_URL = 'http://lf.test'; });

test('langflow(): shape from a realistic instance, repo flows matched by id, personal fields dropped', async () => {
  const r = await langflow();
  assert.equal(r.ok, true); assert.equal(r.running, true); assert.equal(r.auth, 'ok'); assert.equal(r.version, '1.12.2');
  assert.equal(r.ui, false, 'a 404 at / means backend-only: no link may be offered');
  assert.deepEqual(r.project, { id: 'p-1', name: 'Apple' });
  assert.equal(r.extraInstanceFlows, 1, 'the scratch flow counts; the component does not');
  assert.equal(r.flows.length, REPO.length);
  for (const f of r.flows) {
    assert.equal(f.imported, true); assert.equal(f.openUrl, null);
    assert.equal(f.current, false, 'the instance copy was edited: must read as drift');
    assert.ok(f.canvas.nodes.length > 0 && Array.isArray(f.canvas.edges));
  }
  const b = r.flows.find((f) => f.id === B.id);
  assert.deepEqual(b.lastRun, { at: '2026-09-23T18:50:20Z', ok: false });
  assert.deepEqual(Object.keys(b.runs[0]).sort(), ['at', 'id', 'ms', 'ok', 'status', 'tokens']);
  assert.equal(r.runsTotal, 2); assert.equal(r.recentRuns[0].flowName, B.name);
  assert.deepEqual(r.queue, { backend: 'asyncio', active: 0 });
  assert.ok(calls.some((c) => c.path === '/api/v1/flows/' && c.auth === `Bearer ${S.login}`), 'the auto-login token was not used');
  clean(r);
});

test('canvasOf: credential and password field values never reach the page; plain values do', () => {
  const c = canvasOf({ nodes: [{ id: 'w', position: { x: 1, y: 2 }, data: { type: 'AppleWorkersAI', node: { display_name: 'Workers AI',
    field_order: ['account_id', 'api_token', 'secret_note', 'model', 'max_tokens'], outputs: [{ name: 'reply', display_name: 'Reply', types: ['Message'] }],
    template: { account_id: { type: 'str', value: 'acct-plain-looking', password: true }, api_token: { type: 'str', value: S.cred },
      secret_note: { type: 'str', value: S.env, display_name: 'Note' }, model: { type: 'str', value: '@cf/meta/llama' }, max_tokens: { type: 'int', value: 1024 } } } } }], edges: [] });
  const [n] = c.nodes;
  assert.deepEqual(n.fields.map((f) => [f.name, 'value' in f]), [['account_id', false], ['api_token', false], ['secret_note', false], ['model', true]]);
  assert.equal(n.fields[3].value, '@cf/meta/llama'); assert.equal(n.usesModel, true);
  assert.ok(!JSON.stringify(c).includes('acct-plain-looking')); clean(c);
});

test('not connected: Langflow down means one /health probe and nothing else, a calm state, repo canvas still there', async () => {
  mode = 'throw';
  const r = await langflow();
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), ['GET /health']);
  assert.equal(r.ok, true); assert.equal(r.running, false); assert.equal(r.auth, null);
  assert.equal(r.flows.length, REPO.length); assert.ok(r.flows.every((f) => f.imported === null && f.canvas.nodes.length > 0 && f.runCount === null));
  assert.equal(r.conclusions[0].k, 'down'); clean(r);
});

test('refused login (401/403) and a 500 from every route: calm, no crash, nothing echoed', async () => {
  for (const m of ['401', '403', '500']) {
    mode = m; uncache('langflow'); calls.length = 0;
    const r = await langflow();
    assert.equal(r.ok, true, m); assert.equal(r.running, true, m);
    assert.equal(r.auth, m === '500' ? null : 'refused', m);
    assert.deepEqual(r.recentRuns, [], m); clean(r);
  }
});

test('dryRun returns the exact plan with zero fetch calls, and says how it authenticates without the key', async () => {
  const input = '{"source":"docs/gauntlet/README.md"}';
  const r = await langflowAction({ kind: 'run', id: A.id, input, dryRun: true });
  assert.deepEqual(r.plan, { method: 'POST', url: `http://lf.test/api/v1/run/${A.id}?stream=false`, body: { input_value: input, input_type: 'chat', output_type: 'chat' },
    flow: A.name, auth: 'מפתח API זמני דרך auto-login, נמחק מיד אחרי הריצה' });
  assert.equal(r.dryRun, true); assert.equal(calls.length, 0);
  process.env.LANGFLOW_API_KEY = S.env;
  const e = await langflowAction({ kind: 'run', id: A.id, input, dryRun: true });
  assert.equal(e.plan.auth, 'x-api-key מ-LANGFLOW_API_KEY'); assert.equal(calls.length, 0); clean(e);
});

test('invalid input is refused before any network call', async () => {
  const bad = [
    { kind: 'delete', id: A.id, input: 'x' }, { kind: 'run', id: 'not-a-uuid', input: 'x' }, { kind: 'run', id: `${A.id}/../x`, input: 'x' },
    { kind: 'run', id: A.id, input: '   ' }, { kind: 'run', id: A.id, input: 42 }, { kind: 'run', id: A.id, input: 'x'.repeat(MAX_INPUT + 1) },
    { kind: 'run', id: '00000000-0000-4000-8000-000000000000', input: 'x' }, null,
  ];
  for (const b of bad) {
    for (const dryRun of [true, false]) {
      const r = await langflowAction(b && { ...b, dryRun });
      assert.equal(r.ok, false, JSON.stringify(b)); assert.match(r.reason, /[֐-׿]/);
    }
  }
  assert.equal(calls.length, 0);
});

test('a real run (fake Langflow): temp key minted, used only as x-api-key, deleted after; nothing forwarded but the text', async () => {
  const r = await langflowAction({ kind: 'run', id: A.id, input: 'hello' });
  assert.equal(r.ok, true); assert.equal(r.output, 'chunked 12 sections');
  const seq = calls.map((c) => `${c.method} ${c.path}`);
  assert.deepEqual(seq.filter((s) => !s.includes('auto_login')), ['GET /health', 'POST /api/v1/api_key/', `POST /api/v1/run/${A.id}`, 'DELETE /api/v1/api_key/key-1']);
  assert.equal(calls.find((c) => c.path.startsWith('/api/v1/run/')).key, S.key);
  assert.deepEqual(JSON.parse(calls.find((c) => c.path.startsWith('/api/v1/run/')).body), { input_value: 'hello', input_type: 'chat', output_type: 'chat' });
  clean(r);
});

test('the temp key is deleted even when the run fails (500 or a dropped connection), and no failure echoes a secret', async () => {
  for (const m of ['500-run', 'throw-run']) {
    mode = m; calls.length = 0;
    const r = await langflowAction({ kind: 'run', id: A.id, input: 'hello' });
    assert.equal(r.ok, false, m); assert.match(r.reason, /[֐-׿]/);
    assert.equal(calls.at(-1).method, 'DELETE', `${m}: the temp key outlived the run`); clean(r);
  }
  mode = 'throw'; calls.length = 0;
  const down = await langflowAction({ kind: 'run', id: A.id, input: 'hello' });
  assert.equal(down.ok, false); assert.deepEqual(calls.map((c) => c.path), ['/health']); clean(down);
  mode = 'fixture'; calls.length = 0; process.env.LANGFLOW_API_KEY = S.env;
  const env = await langflowAction({ kind: 'run', id: A.id, input: 'hello' });
  assert.equal(env.ok, true); assert.ok(!calls.some((c) => c.path.startsWith('/api/v1/api_key')), 'minted a key although LANGFLOW_API_KEY is set');
  assert.equal(calls.find((c) => c.path.startsWith('/api/v1/run/')).key, S.env); clean(env);
});

test('conclusions: down vs up-with-drift-and-a-failed-run vs refused login read differently', () => {
  const flows = [{ name: 'a', file: 'flows/a.json', usesModel: true }, { name: 'b', file: 'flows/b.json', usesModel: false }];
  const down = langflowConclusions({ repoFolder: true, running: false, flows });
  assert.deepEqual(down.map((c) => c.k), ['down', 'cost']);
  assert.match(down[0].title, /כבוי/); assert.match(down[1].title, /1 מתוך 2/);

  const now = Date.parse('2026-09-23T20:50:00Z');
  const up = langflowConclusions({ repoFolder: true, running: true, auth: 'ok', version: '1.12.2', ui: false, project: { name: 'Apple' }, runsKnown: true, runsTotal: 7,
    recentRuns: [{ at: '2026-09-23T18:50:00Z', flowName: 'a' }],
    flows: [{ ...flows[0], imported: true, current: false, lastRun: { ok: false } }, { ...flows[1], imported: true, current: true, lastRun: { ok: true } }] }, now);
  assert.deepEqual(up.map((c) => [c.k, c.tone]), [['up', 'ok'], ['drift', 'warn'], ['failed', 'bad'], ['cost', 'info']]);
  assert.match(up[0].title, /1\.12\.2/); assert.match(up[1].title, /^1 /);

  const ok = langflowConclusions({ repoFolder: true, running: true, auth: 'ok', ui: false, runsKnown: true, runsTotal: 3, recentRuns: [{ at: '2026-09-23T18:50:00Z', flowName: 'b' }],
    flows: flows.map((f) => ({ ...f, imported: true, current: true, lastRun: { ok: true } })) }, now);
  assert.deepEqual(ok.map((c) => c.k), ['up', 'last', 'cost', 'no-ui']); assert.match(ok[1].title, /לפני 2 שעות/);

  const refused = langflowConclusions({ repoFolder: true, running: true, auth: 'refused', flows });
  assert.equal(refused[0].k, 'auth'); assert.equal(refused[0].tone, 'bad');
  for (const list of [down, up, ok, refused]) {
    assert.ok(list.length >= 2 && list.length <= 4);
    for (const c of list) assert.match(c.title, /[֐-׿]/);
  }
});
