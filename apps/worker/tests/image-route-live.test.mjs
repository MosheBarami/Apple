// The image route, EXECUTED — not read.
//
// WHY THIS FILE EXISTS. `image-route.test.mjs` asserts the route's source text, and a refuter
// showed that oracle is satisfiable by a comment: commenting the entire route out of index.ts
// left all nine of its tests green, including the one whose stated job is to ask whether the route
// exists. Registering it on a never-mounted sub-app passed too. Source text is not registration,
// and the difference is the whole feature.
//
// So this one instantiates the Hono app and issues real requests through it. Only the boundaries
// this route cannot reach in a test are stubbed — Supabase ownership, JWT verification, the DO and
// KV — and ownership is stubbed by MODELLING it (a map of project to owner) rather than by
// assuming it, because "user B cannot read user A's image" is the property, not a detail.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(tmpdir(), `apple-image-live-${process.pid}.mjs`);

await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'index.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: OUT,
  plugins: [{
    name: 'stub-boundaries',
    setup(b) {
      // EXTERNAL, not bundled. Bundled, the stub is copied into the output and the app gets its own
      // private `PROJECTS` map — so the ownership this test sets up is invisible to the code under
      // test, every request 404s, and the suite looks like a failing route rather than a failing
      // harness. External keeps one module instance shared by both.
      b.onResolve({ filter: /^\.\/auth$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'auth.mjs')).href, external: true }));
      b.onResolve({ filter: /^\.\/supa$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'supa.mjs')).href, external: true }));
      // Bundled rather than externalised: left external, Node's loader refuses the `cloudflare:`
      // scheme at import time and the whole file fails before a single request is issued.
      b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: join(HERE, 'stubs', 'cloudflare-workers.mjs') }));
    },
  }],
});
const app = (await import(`file://${OUT}`)).default;
const { PROJECTS } = await import(`file://${join(HERE, 'stubs', 'supa.mjs')}`);
process.on('exit', () => rmSync(OUT, { force: true }));

const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const A_PROJECT = '11111111-1111-4111-8111-111111111111';
const B_PROJECT = '22222222-2222-4222-8222-222222222222';
const IMAGE = '33333333-3333-4333-8333-333333333333';

PROJECTS.set(A_PROJECT, ALICE);
PROJECTS.set(B_PROJECT, BOB);

// A 1x1 PNG, so the bytes served are real bytes and byte-equality means something.
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const kv = new Map();
const nowSec = () => Math.floor(Date.now() / 1000);
const store = (project, image, secondsLeft) => kv.set(`image:${project}:${image}`, { value: PNG_B64, metadata: { expiresAt: nowSec() + secondsLeft } });
store(A_PROJECT, IMAGE, 3600);

const env = {
  KV: {
    async getWithMetadata(key) { return kv.get(key) ?? { value: null, metadata: null }; },
    async get(key) { return kv.get(key)?.value ?? null; },
    async put() {},
  },
  SESSION_DO: {
    idFromName: (n) => n,
    get: () => ({ async fetch() { return new Response('{}', { status: 200 }); } }),
  },
};

const as = (user) => ({ headers: { Authorization: `Bearer ${user}` } });
const url = (project, image) => `https://x/api/projects/${project}/images/${image}`;

/* ------------------------------------------------- it is actually registered --- */

test('the route is REGISTERED — a request reaches it and returns the bytes', async () => {
  // The assertion the source-text version could not make. A commented-out route 404s here.
  const res = await app.request(url(A_PROJECT, IMAGE), as(ALICE), env);
  assert.equal(res.status, 200, `expected the image, got ${res.status}`);
  assert.equal(res.headers.get('Content-Type'), 'image/png');
  const bytes = new Uint8Array(await res.arrayBuffer());
  const expected = Uint8Array.from(atob(PNG_B64), (ch) => ch.charCodeAt(0));
  assert.deepEqual([...bytes], [...expected], 'the bytes served must be the bytes stored');
});

/* -------------------------------------------------------------- authorisation --- */

test("BOB CANNOT READ ALICE'S IMAGE, even knowing both ids", async () => {
  // The security property, executed. Bob presents Alice's project id and the real image id; the
  // ownership lookup fails and he is told nothing.
  const res = await app.request(url(A_PROJECT, IMAGE), as(BOB), env);
  assert.equal(res.status, 404);
});

test("nor by presenting Alice's image id against his OWN project", async () => {
  // The other half. Bob owns B_PROJECT, so ownership succeeds — and the key built from HIS project
  // simply does not exist. This is why the project is half the key rather than a checked field.
  const res = await app.request(url(B_PROJECT, IMAGE), as(BOB), env);
  assert.equal(res.status, 404);
});

test('an unauthenticated request never reaches the route at all', async () => {
  const res = await app.request(url(A_PROJECT, IMAGE), {}, env);
  assert.equal(res.status, 401, 'the route must sit INSIDE the /api/* auth middleware');
});

test('every failure is byte-identical, so the route is not an existence oracle', async () => {
  // A refuter found these differed: the expired branch carried `reason: 'expired_or_missing'`
  // while the not-yours branch did not, so the body distinguished the two cases the status code
  // was carefully making identical.
  const notYours = await app.request(url(A_PROJECT, IMAGE), as(BOB), env);
  const missing = await app.request(url(B_PROJECT, '44444444-4444-4444-8444-444444444444'), as(BOB), env);
  const badId = await app.request(url(B_PROJECT, 'not-a-uuid'), as(BOB), env);
  const bodies = await Promise.all([notYours.text(), missing.text(), badId.text()]);
  assert.equal(new Set(bodies).size, 1, `three failures, ${new Set(bodies).size} distinguishable bodies: ${bodies.join(' | ')}`);
  assert.deepEqual([notYours.status, missing.status, badId.status], [404, 404, 404]);
});

/* -------------------------------------------------------------------- caching --- */

test('a cached copy cannot outlive the object it is a copy of', async () => {
  // The claim as originally written was false. KV's expirationTtl is anchored at WRITE time and
  // Cache-Control's max-age at RESPONSE time, so an image fetched 59 minutes after it was stored
  // was cached for a further hour — outliving the object by nearly the whole TTL.
  const res = await app.request(url(A_PROJECT, IMAGE), as(ALICE), env);
  const cc = res.headers.get('Cache-Control');
  assert.match(cc, /^private, max-age=\d+$/, `got ${cc}`);
  const maxAge = Number(/max-age=(\d+)/.exec(cc)[1]);
  assert.ok(maxAge > 0, 'a fresh image must be cacheable at all');

  // An image with most of its life already spent: max-age must shrink to match, not reset. Stored
  // through the same path a real one is, with no test-only branch in the product — a backdoor
  // parameter would make this test pass against code that ignores expiry for everyone else.
  const OLD = '55555555-5555-4555-8555-555555555555';
  store(A_PROJECT, OLD, 100);
  const aged = await app.request(url(A_PROJECT, OLD), as(ALICE), env);
  const agedMax = Number(/max-age=(\d+)/.exec(aged.headers.get('Cache-Control'))[1]);
  assert.ok(agedMax <= 100, `an image with 100s left must not be cached for ${agedMax}s`);
  assert.ok(agedMax < maxAge, `an aged image must have a shorter max-age, got ${agedMax} vs ${maxAge}`);

  // And one already past its expiry is not cacheable at all.
  const DEAD = '66666666-6666-4666-8666-666666666666';
  store(A_PROJECT, DEAD, -10);
  const dead = await app.request(url(A_PROJECT, DEAD), as(ALICE), env);
  assert.match(dead.headers.get('Cache-Control'), /max-age=0$/);
});

test('the bytes are not sniffable and carry no ambient authority', async () => {
  const res = await app.request(url(A_PROJECT, IMAGE), as(ALICE), env);
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(res.headers.get('Cache-Control'), /^private,/);
});
