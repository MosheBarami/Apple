/**
 * THE WHOLE PRODUCT ANSWERED OVER PLAINTEXT HTTP.
 *
 * Measured against production on 2026-09-20, before this existed:
 *
 *     curl -s -o /dev/null -w '%{http_code} %{redirect_url}' http://apple.moshe-barami111.workers.dev/
 *     200
 *
 * Not a redirect. The page. The same origin serves the app shell, keeps the Supabase session in
 * localStorage, and hosts the API-key-authenticated /v1 API — so a request made on a shared network
 * went out readable, key included, and no response ever told the browser not to try http again.
 *
 * TWO HALVES. The redirect closes the request in front of you; Strict-Transport-Security closes
 * every request after it. Without the header a browser that has only ever been redirected still
 * tries http:// first next time, and that first request is the one an attacker wants.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(tmpdir(), `apple-https-${process.pid}.mjs`);

await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'index.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: OUT,
  plugins: [{
    name: 'stub-boundaries',
    setup(b) {
      b.onResolve({ filter: /^\.\/auth$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'auth.mjs')).href, external: true }));
      b.onResolve({ filter: /^\.\/supa$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'supa.mjs')).href, external: true }));
      b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: join(HERE, 'stubs', 'cloudflare-workers.mjs') }));
    },
  }],
});
const app = (await import(pathToFileURL(OUT).href)).default;
process.on('exit', () => rmSync(OUT, { force: true }));

const env = { KV: { get: async () => null, getWithMetadata: async () => ({ value: null, metadata: null }), put: async () => {} } };
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };
const call = (url, init) => app.fetch(new Request(url, init), env, ctx);

test('A PLAINTEXT REQUEST IS REDIRECTED, not served', async () => {
  const res = await call('http://apple.moshe-barami111.workers.dev/');
  assert.equal(res.status, 308, `plaintext http answered ${res.status} — this is the defect`);
  assert.equal(res.headers.get('Location'), 'https://apple.moshe-barami111.workers.dev/');
});

test('308 AND NOT 301, so a POST to the API keeps its method and body', async () => {
  // A 301 turns a POST into a GET. The caller then gets "no such endpoint" for what was really a
  // wrong scheme, which is the error that costs somebody an afternoon.
  const res = await call('http://apple.moshe-barami111.workers.dev/v1/chat/completions', {
    method: 'POST', body: '{}', headers: { 'content-type': 'application/json' },
  });
  assert.equal(res.status, 308);
  assert.equal(res.headers.get('Location'), 'https://apple.moshe-barami111.workers.dev/v1/chat/completions');
});

test('the path and query survive the redirect — a share link must still land where it was pointed', async () => {
  const res = await call('http://apple.moshe-barami111.workers.dev/join?token=abc123&x=1');
  assert.equal(res.headers.get('Location'), 'https://apple.moshe-barami111.workers.dev/join?token=abc123&x=1');
});

test('HSTS IS ON EVERY RESPONSE, including the API half that carries a key', async () => {
  for (const path of ['/', '/api/health', '/v1/models']) {
    const res = await call(`https://apple.moshe-barami111.workers.dev${path}`);
    const hsts = res.headers.get('Strict-Transport-Security');
    assert.ok(hsts, `${path} carries no Strict-Transport-Security — a header only on the pages is a header the API does not have`);
    assert.match(hsts, /max-age=31536000/, `${path}: ${hsts}`);
    assert.match(hsts, /includeSubDomains/, `${path}: ${hsts}`);
  }
});

test('preload is NOT asserted, and that is deliberate', async () => {
  // `preload` is a one-way door: it asks browser vendors to hardcode the hostname, and removal
  // takes months. This product may not keep this hostname.
  const res = await call('https://apple.moshe-barami111.workers.dev/');
  assert.doesNotMatch(res.headers.get('Strict-Transport-Security') ?? '', /preload/);
});
