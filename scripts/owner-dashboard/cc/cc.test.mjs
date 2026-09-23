// Control-center server tests. No network and no paid call: fetch is replaced by a fake upstream that
// echoes the Authorization header back, and `gh` is a fake script on PATH that prints the Cloudflare
// token into its stderr. Every credential is a sentinel; no response body may ever contain one.
//   node --test scripts/owner-dashboard/cc/cc.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SENTINEL = 'SECRET_SENTINEL';
Object.assign(process.env, {
  CLOUDFLARE_API_TOKEN: `${SENTINEL}_123`, CLOUDFLARE_ACCOUNT_ID: 'acct-test', SUPABASE_ACCESS_TOKEN: `${SENTINEL}_SUPA`,
  HF_TOKEN: `${SENTINEL}_HF`, SENTRY_AUTH_TOKEN: `${SENTINEL}_SENTRY`, SENTRY_ORG: 'test-org', SENTRY_BASE: 'https://sentry.test',
  GOLEM_ADMIN_KEY: `${SENTINEL}_GOLEM`,
});

const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-gh-'));
fs.writeFileSync(path.join(bin, 'gh'), '#!/bin/sh\necho "HTTP 404: Not Found $CLOUDFLARE_API_TOKEN" >&2\nexit 1\n', { mode: 0o755 });
process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;

// The fake upstream. `mode` picks how it answers; every answer carries the caller's Authorization.
let mode = 'echo200';
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url), a = init.headers?.authorization || '';
  calls.push({ url: u, method: init.method || 'GET', body: init.body });
  if (mode === 'throw') throw Object.assign(new Error(`boom ${a}`), { name: 'TypeError' });
  if (mode === 'echo500text') return new Response(`upstream crashed; you sent ${a}`, { status: 500 });
  // Identifiers stay plain (they are built into follow-up URLs); every display field echoes the header.
  const item = { id: 'i1', uuid: 'u1', slug: 's1', name: a, title: a, culprit: a, queue_name: a, echo: a };
  const listy = /huggingface|sentry|supabase\.com\/v1\/projects\/[^/]+\/database\/query/.test(u);
  const body = listy ? [item] : { success: true, result: [item], data: null, echo: a, errors: [] };
  return new Response(JSON.stringify(body), { status: mode === 'echo403' ? 403 : 200, headers: { 'content-type': 'application/json' } });
};

const { route, LAZY_PLATFORMS } = await import('./platforms/router.mjs');
const { SESSION_TOKEN, uncache } = await import('./http.mjs');

let server, port;
before(async () => {
  server = http.createServer((q, s) => { if (!route(q, s)) { s.writeHead(200); s.end('OLD PAGE'); } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
});
after(() => { server.close(); fs.rmSync(bin, { recursive: true, force: true }); });

function req(pathname, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path: pathname, method, headers }, (res) => {
      let data = ''; res.on('data', (c) => { data += c; }); res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    r.on('error', reject);
    if (body !== undefined) r.write(typeof body === 'string' ? body : JSON.stringify(body));
    r.end();
  });
}
const post = (p, body, headers = {}) => req(p, { method: 'POST', body, headers: { 'content-type': 'application/json',
  origin: `http://127.0.0.1:${port}`, 'x-cc-token': SESSION_TOKEN, ...headers } });

// 'reset' is refused by the action itself too, so even a broken guard never writes to disk here.
test('POST without the session token is refused', async () => {
  const r = await req('/api/cc/supabase/action', { method: 'POST', body: { kind: 'reset', confirm: true },
    headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${port}` } });
  assert.equal(r.status, 403);
  const wrong = await post('/api/cc/supabase/action', { kind: 'reset', confirm: true }, { 'x-cc-token': 'nope' });
  assert.equal(wrong.status, 403);
});

test('POST from a foreign Origin is refused even with the token', async () => {
  const r = await post('/api/cc/github/action', { kind: 'rerun', id: 1, confirm: true }, { origin: 'http://evil.example' });
  assert.equal(r.status, 403);
});

test('a request whose Host is not local is refused (DNS rebinding)', async () => {
  const r = await req('/api/cc/session', { headers: { host: 'evil.example' } });
  assert.equal(r.status, 403);
  assert.ok(!r.body.includes(SESSION_TOKEN));
});

test('a valid POST passes the guard, needs confirm:true, and reset is blocked on purpose', async () => {
  const s = JSON.parse((await req('/api/cc/session')).body);
  assert.equal(s.token, SESSION_TOKEN);
  assert.equal((await post('/api/cc/supabase/action', { kind: 'reset' })).status, 400);
  const r = JSON.parse((await post('/api/cc/supabase/action', { kind: 'reset', confirm: true })).body);
  assert.equal(r.ok, false);
  assert.match(r.reason, /חסומה בכוונה/);
});

test('path traversal under /control/ is refused', async () => {
  for (const p of ['/control/../server.mjs', '/control/%2e%2e/server.mjs', '/control/..%2fserver.mjs', '/control/..%5cserver.mjs',
    '/control/%2e%2e%2f%2e%2e%2f.env', '/control/../../../.env', '/control/..%2f..%2fcc%2fhttp.mjs']) {
    const r = await req(p);
    assert.ok(!/createServer|loadEnv|SECRET/.test(r.body), `${p} leaked a file`);
    assert.notEqual(r.body, 'OLD PAGE', `${p} fell through to another route`);
    assert.equal(r.status, 404, p);
  }
});

const GET_ROUTES = ['session', 'github', 'supabase', 'cloudflare', 'sentry', 'hf', 'extras', 'apple', 'groq', 'discord', 'roblox', 'status', 'connectors', 'langflow', 'pulse', 'insights', ...LAZY_PLATFORMS];

test('leak guard: no response ever contains a credential, whatever the upstream sends back', async () => {
  let redacted = 0;
  for (const m of ['echo200', 'echo403', 'echo500text', 'throw']) {
    mode = m; uncache('');
    for (const r of GET_ROUTES) {
      const res = await req(`/api/cc/${r}`);
      assert.ok(!res.body.includes(SENTINEL), `${m} /api/cc/${r} leaked a credential`);
      const j = JSON.parse(res.body);
      assert.equal(typeof j.ok, 'boolean', `${m} ${r} has ok`);
      assert.ok(j.fetchedAt, `${m} ${r} has fetchedAt`);
      if (res.body.includes('[redacted]')) redacted++;
    }
    for (const [p, b] of [['github/action', { kind: 'rerun', id: 5 }], ['cloudflare/action', { kind: 'purge', zoneId: 'z' }],
      ['sentry/action', { kind: 'resolve', id: '123' }], ['supabase/action', { kind: 'nothing' }],
      ['sentry/action', { kind: 'bookmark', id: '123' }], ['hf/action', { kind: 'restart', id: 'moshebarami/x' }],
      ['cloudflare/action', { kind: 'traces', value: true }], ['connectors/action', { id: 'posthog', kind: 'flag', target: 1, value: true }]]) {
      const res = await post(`/api/cc/${p}`, { ...b, confirm: true });
      assert.ok(!res.body.includes(SENTINEL), `${m} POST ${p} leaked a credential`);
    }
  }
  // The echo did reach the response builder and was scrubbed — the guard above is not vacuous.
  assert.ok(redacted > 0);
});

test('sentry resolve sends status=resolved to the org issues endpoint (fake upstream)', async () => {
  mode = 'echo200';
  const r = JSON.parse((await post('/api/cc/sentry/action', { kind: 'resolve', id: '4242', confirm: true })).body);
  assert.equal(r.ok, true);
  const put = calls.findLast((c) => c.method === 'PUT');
  assert.equal(put.url, 'https://sentry.test/api/0/organizations/test-org/issues/?id=4242');
  assert.deepEqual(JSON.parse(put.body), { status: 'resolved' });
});

test('no credential is ever put in an upstream URL or body', () => {
  assert.ok(calls.length > 20);
  assert.ok(calls.every((c) => !c.url.includes(SENTINEL) && !String(c.body || '').includes(SENTINEL)));
});

test('dryRun returns the exact upstream call and sends nothing', async () => {
  mode = 'echo200';
  const cases = [
    ['sentry/action', { kind: 'ignore', id: '77' }, 'PUT', 'https://sentry.test/api/0/organizations/test-org/issues/?id=77'],
    ['hf/action', { kind: 'restart', id: 'moshebarami/backrooms-api' }, 'POST', 'https://huggingface.co/api/spaces/moshebarami/backrooms-api/restart'],
    ['cloudflare/action', { kind: 'logs', value: false }, 'PATCH', 'https://api.cloudflare.com/client/v4/accounts/<account>/workers/scripts/apple/script-settings'],
    ['supabase/action', { kind: 'backup' }, 'POST', 'https://api.supabase.com/v1/projects/npqvyijsvzkuwddyhtpm/database/query'],
    ['review', { sha: 'abc1234', verdict: 'approve' }, 'WRITE', 'scripts/owner-dashboard/cc/review.json'],
  ];
  for (const [p, b, method, url] of cases) {
    const before = calls.length;
    const r = JSON.parse((await post(`/api/cc/${p}`, { ...b, dryRun: true, confirm: true })).body);
    assert.equal(r.ok, true, p); assert.equal(r.dryRun, true, p);
    assert.equal(r.plan.method, method, p); assert.equal(r.plan.url, url, p);
    assert.equal(calls.length, before, `${p} dry run touched the network`);
  }
  const bad = JSON.parse((await post('/api/cc/hf/action', { kind: 'restart', id: 'someone-else/space', dryRun: true, confirm: true })).body);
  assert.equal(bad.ok, false);
  const nope = JSON.parse((await post('/api/cc/sentry/action', { kind: 'delete', id: '1', dryRun: true, confirm: true })).body);
  assert.equal(nope.ok, false);
});

test('sentry bookmark and cloudflare traces toggle send the right bodies (fake upstream)', async () => {
  mode = 'echo200';
  JSON.parse((await post('/api/cc/sentry/action', { kind: 'bookmark', id: '9', confirm: true })).body);
  const put = calls.findLast((c) => c.method === 'PUT');
  assert.deepEqual(JSON.parse(put.body), { isBookmarked: true });
  await post('/api/cc/cloudflare/action', { kind: 'traces', value: false, confirm: true });
  const patch = calls.findLast((c) => c.method === 'PATCH');
  assert.match(patch.url, /workers\/scripts\/apple\/script-settings$/);
  assert.equal(JSON.parse(patch.body).observability.traces.enabled, false);
});

test('langflow degrades to "not running" when the local instance is down', async () => {
  mode = 'throw'; uncache('');
  const r = JSON.parse((await req('/api/cc/langflow')).body);
  assert.equal(r.ok, true); assert.equal(r.running, false);
  assert.ok(Array.isArray(r.flows));
  mode = 'echo200'; uncache('');
});

test('the Langflow page lists only flow exports, not other JSON beside them (package.json)', async () => {
  const { repoFlows } = await import('./platforms/langflow.mjs');
  const flows = repoFlows();
  assert.ok(flows && flows.length >= 4, 'the repo flows were not found — this test would check nothing');
  assert.deepEqual(flows.filter((f) => f.nodes === null && !f.invalid).map((f) => f.file), []);
});

// ---------------------------------------------------------------- shell v2: lazy platforms, SSE, insights
const { derive } = await import('./insights.mjs');
const { frame } = await import('./stream.mjs');

test('lazy platforms: GET and POST routes exist and keep the POST guards', async () => {
  assert.ok(LAZY_PLATFORMS.length >= 3, 'no lazy platforms registered — this test would check nothing');
  for (const id of LAZY_PLATFORMS) {
    const g = await req(`/api/cc/${id}`);
    assert.equal(g.status, 200, `/api/cc/${id} is not routed`);
    const j = JSON.parse(g.body);
    assert.equal(typeof j.ok, 'boolean'); assert.ok(j.fetchedAt);
    assert.ok(!g.body.includes(SENTINEL));
    const noTok = await req(`/api/cc/${id}/action`, { method: 'POST', body: { kind: 'x', confirm: true },
      headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${port}` } });
    assert.equal(noTok.status, 403, `${id}/action accepted a POST without the session token`);
    assert.equal((await post(`/api/cc/${id}/action`, { kind: 'x' })).status, 400, `${id}/action is not routed, or ran without confirm:true`);
  }
});

// Reads the SSE stream until `until(frames)` holds or `ms` passes, then hangs up.
function sse(headers = {}, until = () => false, ms = 15000) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path: '/api/cc/stream', headers }, (res) => {
      let raw = ''; const done = () => { clearTimeout(t); res.destroy(); resolve({ status: res.statusCode, type: res.headers['content-type'], raw, frames: parse(raw) }); };
      const t = setTimeout(done, ms);
      res.on('data', (c) => { raw += c; if (until(parse(raw))) done(); });
      res.on('end', done);
    });
    r.on('error', reject); r.end();
  });
}
const parse = (raw) => raw.split('\n\n').filter((b) => /^event: /m.test(b)).map((b) => {
  const lines = b.split('\n'); const ev = lines.find((l) => l.startsWith('event: ')); const data = lines.filter((l) => l.startsWith('data: '));
  return { event: ev.slice(7), data: data.map((l) => l.slice(6)).join('\n'), dataLines: data.length, lines };
});

test('SSE stream: refused for a foreign Host', async () => {
  const r = await sse({ host: 'evil.example' }, () => true, 3000);
  assert.equal(r.status, 403);
  assert.ok(!/event-stream/.test(r.type || ''));
});

test('SSE stream: text/event-stream, hello then a pulse, every frame well-formed and free of secrets', async () => {
  mode = 'echo200'; uncache('');
  const r = await sse({}, (f) => f.some((x) => x.event === 'pulse'), 20000);
  assert.equal(r.status, 200);
  assert.match(r.type, /^text\/event-stream/);
  assert.equal(r.frames[0]?.event, 'hello');
  assert.ok(r.frames.some((x) => x.event === 'pulse'), 'no pulse frame arrived');
  for (const f of r.frames) {
    assert.match(f.event, /^[\w:.-]+$/);
    assert.equal(f.dataLines, 1, `${f.event}: data must be one line`);
    assert.equal(f.lines.length, 2, `${f.event}: a frame is exactly event + data`);
    assert.doesNotThrow(() => JSON.parse(f.data), `${f.event}: data is not JSON`);
  }
  const pulse = JSON.parse(r.frames.find((x) => x.event === 'pulse').data);
  assert.ok(Array.isArray(pulse.insights), 'the pulse carries the derived insights');
  assert.ok(!r.raw.includes(SENTINEL), 'the stream leaked a credential');
});

test('SSE frame(): newlines cannot inject fields, and secrets are redacted', () => {
  const f = frame('pulse\ndata: evil', { t: `line1\nline2 ${process.env.HF_TOKEN}` });
  assert.equal(f.split('\n').filter(Boolean).length, 2);
  const [ev, data] = f.split('\n');
  assert.match(ev, /^event: [\w:.-]+$/); assert.match(data, /^data: \{.*\}$/);
  assert.ok(!f.includes(SENTINEL));
});

// A minimal world for insights: one failing CI streak, a site answer, a Discord app without a bot token.
const runs = (fails, sec = 5) => [...Array.from({ length: fails }, (_, i) => ({ id: 900 + i, status: 'completed', conclusion: 'failure', branch: 'main', durationSec: sec })),
  { id: 1, status: 'completed', conclusion: 'success', branch: 'main', durationSec: 300, createdAt: '2026-09-01T00:00:00Z' }];
const gh = (fails, sec) => ({ ok: true, repo: { defaultBranch: 'main' }, runs: runs(fails, sec), commits: [] });

test('insights: nothing observed gives no insights', () => {
  assert.deepEqual(derive({}), []);
  assert.deepEqual(derive({ github: { ok: false, configured: false }, sentry: { ok: true, configured: false }, discord: { ok: false } }), []);
});

test('insights are derived from the inputs, not hard-coded', () => {
  const ci = (d) => derive(d).find((x) => x.id === 'ci-failing');
  const three = ci({ github: gh(3, 5) }); const five = ci({ github: gh(5, 5) });
  assert.match(three.title, /3/); assert.match(five.title, /5/);
  assert.equal(three.evidence.find((e) => /15/.test(e.k)).v, '3/3');
  assert.equal(three.action.id, 'gh-rerunf-900');
  assert.notEqual(ci({ github: gh(3, 200) }).title, three.title, 'slow failures must not be called an account block');
  assert.equal(ci({ github: gh(0) }), undefined, 'a green main gives no CI insight');
  const down = derive({ health: { httpStatus: 503, ms: 80 } }).find((x) => x.id === 'site-down');
  assert.match(down.why, /503/);
  assert.equal(derive({ health: { httpStatus: 200, ms: 80 } }).find((x) => x.id === 'site-down'), undefined);
  for (const x of derive({ github: gh(3, 5), health: { httpStatus: 503 } })) {
    assert.ok(x.title && x.why && Array.isArray(x.evidence) && x.action?.type, `${x.id} is missing a field`);
    assert.ok(!JSON.stringify(x).includes('NaN'), `${x.id} shows NaN`);
  }
});

test('insights are ordered red first, then yellow, then info', () => {
  // inserted by derive() in the order warn (blind sentry), bad (site), info (discord) — the output must reorder them
  const out = derive({ sentry: { ok: false, reason: 'HTTP 401' }, health: { httpStatus: 500, ms: 1 }, discord: { ok: true, configured: true, bot: false } });
  assert.deepEqual(out.map((x) => x.sev), ['bad', 'warn', 'info']);
  assert.ok(out.every((x) => !('weight' in x)), 'the internal weight leaked into the output');
});
