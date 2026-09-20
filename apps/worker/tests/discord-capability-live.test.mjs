/**
 * A PAIRING CODE FOR AN INTEGRATION THIS DEPLOYMENT CANNOT REDEEM.
 *
 * Defect Dd8a983. Settings → Connections offers "Get a code", shows `/link 123456` with an expiry
 * countdown, and the only thing that can redeem it — `/api/discord/interactions` — refuses with 503
 * to Discord itself when DISCORD_PUBLIC_KEY is unset. Neither the apple nor the golem worker has
 * ever had that key. So the user typed the code, nothing answered, they watched it expire, took
 * another, and concluded the product was broken. Unlike `/api/billing/config` there was no
 * capability in any response for the UI to degrade on.
 *
 * These tests drive the REAL routes through the real JWT middleware, with the env varied, rather
 * than asserting the source says the right words: the defect was that a configured-ness the server
 * knew about never reached a response, and only a response can show that it now does.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { PROJECTS } from './stubs/supa.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(tmpdir(), `golem-discord-cap-${process.pid}.mjs`);

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

const USER = 'u-owner';
const PROJECT = '33333333-cccc-4ccc-8ccc-cccccccccccc';
PROJECTS.set(PROJECT, USER);

/** Every mint the DiscordDO was asked for, so "did not mint" is an observation and not a guess. */
const MINTED = [];

function envWith(publicKey) {
  return {
    ...(publicKey === undefined ? {} : { DISCORD_PUBLIC_KEY: publicKey }),
    DISCORD_DO: {
      idFromName: (n) => n,
      get: () => ({
        async fetch(url, init) {
          const path = new URL(url).pathname;
          if (path === '/mint') {
            MINTED.push(JSON.parse(init.body));
            return new Response(JSON.stringify({ code: '123456', expiresAt: Date.now() + 600_000 }), { status: 200 });
          }
          if (path === '/link-for-owner') return new Response(JSON.stringify({ link: null }), { status: 200 });
          return new Response('{}', { status: 200 });
        },
      }),
    },
    QUOTA_DO: { idFromName: (n) => n, get: () => ({ async fetch() { return new Response('{}', { status: 200 }); } }) },
    SESSION_DO: { idFromName: (n) => n, get: () => ({ async fetch() { return new Response('{}', { status: 200 }); } }) },
    ADMIN_DO: { idFromName: (n) => n, get: () => ({ async fetch() { return new Response('{"stored":0}', { status: 200 }); } }) },
    KV: { async get() { return null; }, async put() {}, async delete() {}, async list() { return { keys: [], list_complete: true }; } },
  };
}

const ctx = { waitUntil() {}, passThroughOnException() {} };
const get = (path, env) =>
  app.fetch(new Request(`https://w${path}`, { headers: { Authorization: `Bearer ${USER}` } }), env, ctx);
const mint = (env) =>
  app.fetch(
    new Request(`https://w/api/projects/${PROJECT}/discord-code`, { method: 'POST', headers: { Authorization: `Bearer ${USER}` } }),
    env,
    ctx,
  );

test('an unconfigured deployment SAYS SO in the response the Connections panel already reads', async () => {
  const res = await get('/api/discord/link', envWith(undefined));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.configured, false, 'there is still nothing in any response for the UI to degrade on');
  assert.equal(body.link, null);
  assert.ok(typeof body.reason === 'string' && body.reason.length > 0, 'a false flag with no sentence explains nothing');
});

test('an unconfigured deployment refuses to mint a code instead of handing out a dead one', async () => {
  MINTED.length = 0;
  const res = await mint(envWith(undefined));
  assert.equal(res.status, 503, 'the user was given a countdown on a code nothing can redeem');
  const body = await res.json();
  assert.equal(body.configured, false);
  assert.match(body.error, /Discord is not set up/);
  assert.deepEqual(MINTED, [], 'a code was minted anyway');
});

test('an empty-string key is unconfigured, not configured-with-nothing', async () => {
  const body = await (await get('/api/discord/link', envWith(''))).json();
  assert.equal(body.configured, false);
  assert.equal((await mint(envWith(''))).status, 503);
});

test('a configured deployment is unchanged — the code is still minted and still carries the link', async () => {
  const key = 'a'.repeat(64);
  const body = await (await get('/api/discord/link', envWith(key))).json();
  assert.equal(body.configured, true);
  assert.equal(body.link, null, 'the DO fixture reports no link; the route must pass that through');

  MINTED.length = 0;
  const res = await mint(envWith(key));
  assert.equal(res.status, 200, 'the fix must not break the deployment the feature was built for');
  assert.equal(MINTED.length, 1);
  assert.equal(MINTED[0].projectId, PROJECT);
  assert.equal(MINTED[0].appleUserId, USER);
});

test('ownership still decides before configured-ness does', async () => {
  // A stranger must not learn that a project exists from a capability probe.
  const res = await app.fetch(
    new Request('https://w/api/projects/44444444-dddd-4ddd-8ddd-dddddddddddd/discord-code', { method: 'POST', headers: { Authorization: 'Bearer someone-else' } }),
    envWith(undefined),
    ctx,
  );
  assert.equal(res.status, 404, 'the 503 was returned before ownership was checked');
});
