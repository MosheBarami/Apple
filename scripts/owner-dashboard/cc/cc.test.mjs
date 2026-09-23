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

const { route } = await import('./platforms/router.mjs');
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

const GET_ROUTES = ['session', 'github', 'supabase', 'cloudflare', 'sentry', 'hf', 'extras'];

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
      ['sentry/action', { kind: 'resolve', id: '123' }], ['supabase/action', { kind: 'nothing' }]]) {
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
