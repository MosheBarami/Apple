// The stand-in on the former hosts (infra/legacy-proxy). Published Studio plugins POST to the old
// host, so an API call must reach the studpilot Worker unchanged; only a browser page load is redirected.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'infra', 'legacy-proxy');
const { default: proxy } = await import(join(DIR, 'index.js'));

const binding = () => {
  const seen = [];
  return { seen, STUDPILOT: { fetch: async (req) => { seen.push({ url: req.url, method: req.method, headers: req.headers, body: await req.text() }); return new Response('from origin', { status: 207 }); } } };
};

test('a published plugin poll reaches studpilot with its method, body and X-Golem headers', async () => {
  const env = binding();
  const res = await proxy.fetch(new Request('https://apple.example.workers.dev/api/studio/poll?x=1', {
    method: 'POST', headers: { 'X-Golem-Token': 't', 'content-type': 'application/json' }, body: '{"ops":[]}' }), env);
  assert.equal(res.status, 207);
  assert.equal(env.seen.length, 1);
  const [r] = env.seen;
  assert.equal(r.url, 'https://studpilot.app/api/studio/poll?x=1');
  assert.equal(r.method, 'POST');
  assert.equal(r.body, '{"ops":[]}');
  assert.equal(r.headers.get('X-Golem-Token'), 't');
});

test('a page load is a 301 to the same path on studpilot.app, and reaches nothing', async () => {
  const env = binding();
  const res = await proxy.fetch(new Request('https://golem.example.workers.dev/app/projects/abc?tab=1'), env);
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), 'https://studpilot.app/app/projects/abc?tab=1');
  assert.equal(env.seen.length, 0);
});

test('a GET under every API prefix and a WebSocket upgrade anywhere pass through', async () => {
  // /v1 matters as much as /api: a 301 to another origin makes fetch drop the SDK's Authorization header.
  const env = binding();
  for (const path of ['/api/health', '/v1/projects/p/events', '/ws/x', '/auth/callback', '/mcp']) {
    await proxy.fetch(new Request(`https://apple.example.workers.dev${path}`), env);
  }
  await proxy.fetch(new Request('https://apple.example.workers.dev/somewhere', { headers: { upgrade: 'websocket' } }), env);
  assert.deepEqual(env.seen.map((r) => r.url), ['https://studpilot.app/api/health', 'https://studpilot.app/v1/projects/p/events',
    'https://studpilot.app/ws/x', 'https://studpilot.app/auth/callback', 'https://studpilot.app/mcp', 'https://studpilot.app/somewhere']);
});

test('plain HTTP is answered with a 308 to HTTPS, as the origin answers it, and forwards nothing', async () => {
  const env = binding();
  const res = await proxy.fetch(new Request('http://apple.example.workers.dev/v1/chat/completions?x=1', {
    method: 'POST', headers: { Authorization: 'Bearer k' }, body: '{}' }), env);
  assert.equal(res.status, 308);
  assert.equal(res.headers.get('location'), 'https://apple.example.workers.dev/v1/chat/completions?x=1');
  assert.equal(env.seen.length, 0, 'a request that crossed the network in cleartext was accepted as HTTPS');
});

test('both stand-ins reach studpilot through a service binding and run no cron', () => {
  for (const name of ['apple', 'golem']) {
    const cfg = JSON.parse(readFileSync(join(DIR, `wrangler.${name}.jsonc`), 'utf8').replace(/^\s*\/\/[^\n]*$/gm, ''));
    assert.equal(cfg.name, name);
    assert.equal(cfg.workers_dev, true, `the ${name} stand-in exists to answer on its workers.dev host`);
    // fetch() to the origin would leave from a Cloudflare address and merge every client's per-IP limits.
    assert.deepEqual(cfg.services, [{ binding: 'STUDPILOT', service: 'studpilot' }]);
    assert.deepEqual(cfg.triggers?.crons, [], `${name} would keep firing the old Worker's crons at a handler-less script`);
  }
  // A bare fetch( (not a method call such as env.STUDPILOT.fetch) is the global one.
  assert.equal(/(?:^|[^.\w])fetch\(/m.test(readFileSync(join(DIR, 'index.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/async fetch\(/, '')), false, 'the stand-in calls the global fetch()');
});
