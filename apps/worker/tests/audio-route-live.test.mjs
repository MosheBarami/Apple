// The audio route, EXECUTED through the real Hono app — not read out of index.ts.
//
// image-route.test.mjs opens with what source-text assertions are worth here: a refuter commented
// the entire image route out of index.ts and all nine of its tests stayed green, including the one
// whose stated job was to ask whether the route existed. Registering it on a never-mounted sub-app
// passed too. So this file does what image-route-live.test.mjs does — builds the app and issues
// real requests — and it exists from the day the route does rather than a release later.
//
// THE ONE THING THIS ROUTE HAS THAT THE IMAGE ROUTE DOES NOT is a stored Content-Type, because
// audio is not one format. A value taken out of storage and echoed into a response header is a
// value a writer chooses and a browser obeys, so `text/html` there would turn an authenticated URL
// on our own origin into a page that runs script. Two tests below are about exactly that.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(tmpdir(), `apple-audio-live-${process.pid}.mjs`);

await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'index.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: OUT,
  plugins: [{
    name: 'stub-boundaries',
    setup(b) {
      // EXTERNAL, so the stub instance this test configures is the one the app reads. Bundled, the
      // app would get a private copy of PROJECTS, every request would 404, and the suite would look
      // like a broken route rather than a broken harness. (The same note is on image-route-live.)
      b.onResolve({ filter: /^\.\/auth$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'auth.mjs')).href, external: true }));
      b.onResolve({ filter: /^\.\/supa$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'supa.mjs')).href, external: true }));
      b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: join(HERE, 'stubs', 'cloudflare-workers.mjs') }));
    },
  }],
});
const app = (await import(pathToFileURL(OUT).href)).default;
const { PROJECTS } = await import(`file://${join(HERE, 'stubs', 'supa.mjs')}`);
process.on('exit', () => rmSync(OUT, { force: true }));

const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const A_PROJECT = '55555555-5555-4555-8555-555555555555';
const B_PROJECT = '66666666-6666-4666-8666-666666666666';
const CLIP = '77777777-7777-4777-8777-777777777777';
const HOSTILE = '88888888-8888-4888-8888-888888888888';

PROJECTS.set(A_PROJECT, ALICE);
PROJECTS.set(B_PROJECT, BOB);

// A real 8-byte RIFF header, so byte-equality means something.
const WAV_B64 = Buffer.from(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45])).toString('base64');

const kv = new Map();
const nowSec = () => Math.floor(Date.now() / 1000);
const store = (project, id, { contentType = 'audio/wav', secondsLeft = 3600 } = {}) =>
  kv.set(`audio:${project}:${id}`, { value: WAV_B64, metadata: { expiresAt: nowSec() + secondsLeft, contentType } });

store(A_PROJECT, CLIP);
// The same project, holding an object whose stored type must never be served as itself.
store(A_PROJECT, HOSTILE, { contentType: 'text/html' });

const env = {
  KV: {
    async getWithMetadata(key) { return kv.get(key) ?? { value: null, metadata: null }; },
    async get(key) { return kv.get(key)?.value ?? null; },
    async put() {},
  },
  SESSION_DO: { idFromName: (n) => n, get: () => ({ async fetch() { return new Response('{}', { status: 200 }); } }) },
};

const as = (user) => ({ headers: { Authorization: `Bearer ${user}` } });
const url = (project, id) => `https://x/api/projects/${project}/audio/${id}`;

/* ------------------------------------------------------------- it is actually registered --- */

test('THE ROUTE IS REGISTERED — a request reaches it and returns the bytes', async () => {
  // The assertion a source-text test cannot make. A commented-out route 404s here.
  const res = await app.request(url(A_PROJECT, CLIP), as(ALICE), env);
  assert.equal(res.status, 200, `expected the audio, got ${res.status}`);
  assert.equal(res.headers.get('Content-Type'), 'audio/wav');
  const bytes = new Uint8Array(await res.arrayBuffer());
  const expected = Uint8Array.from(atob(WAV_B64), (ch) => ch.charCodeAt(0));
  assert.deepEqual([...bytes], [...expected], 'the bytes served are not the bytes stored');
  assert.equal(res.headers.get('Content-Length'), String(expected.length));
});

/* -------------------------------------------------------------------------- the header --- */

test('A STORED CONTENT TYPE THIS WORKER WILL NOT SERVE IS A 404, not an echoed header', async () => {
  // The vector: an object whose metadata says `text/html`, served from our own origin behind a
  // session cookie, is a page that runs script with our origin's privileges. The route looks the
  // stored string up in an allowlist; it never uses it.
  const res = await app.request(url(A_PROJECT, HOSTILE), as(ALICE), env);
  assert.equal(res.status, 404, `a text/html object was served with status ${res.status}`);
  assert.ok(!/text\/html/.test(res.headers.get('Content-Type') ?? ''), 'the stored type reached the response header');
});

test('the response cannot be sniffed into something else, and cannot embed anything', async () => {
  const res = await app.request(url(A_PROJECT, CLIP), as(ALICE), env);
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(res.headers.get('Content-Security-Policy') ?? '', /default-src 'none'/);
});

/* ----------------------------------------------------------------------- authorisation --- */

test("BOB CANNOT READ ALICE'S AUDIO, even knowing both ids", async () => {
  const res = await app.request(url(A_PROJECT, CLIP), as(BOB), env);
  assert.equal(res.status, 404);
});

test("nor by presenting Alice's audio id against his OWN project", async () => {
  // The other half, and the reason the project is HALF THE KEY rather than a checked field: the
  // key Bob's request builds simply does not exist.
  const res = await app.request(url(B_PROJECT, CLIP), as(BOB), env);
  assert.equal(res.status, 404);
});

test('an unauthenticated request never reaches the route at all', async () => {
  const res = await app.request(url(A_PROJECT, CLIP), {}, env);
  assert.equal(res.status, 401, 'the route must sit INSIDE the /api/* auth middleware');
});

test('every failure is byte-identical, so the route is not an existence oracle', async () => {
  // Four different reasons, one body. A body that differed would tell a prober which of them they
  // had hit — including whether an object exists in someone else's project.
  const bodies = await Promise.all([
    app.request(url(A_PROJECT, CLIP), as(BOB), env).then((r) => r.text()),
    app.request(url(B_PROJECT, '99999999-9999-4999-8999-999999999999'), as(BOB), env).then((r) => r.text()),
    app.request(url(B_PROJECT, 'not-a-uuid'), as(BOB), env).then((r) => r.text()),
    app.request(url(A_PROJECT, HOSTILE), as(ALICE), env).then((r) => r.text()),
  ]);
  assert.equal(new Set(bodies).size, 1, `four failures, ${new Set(bodies).size} distinguishable bodies: ${bodies.join(' | ')}`);
});

test('an id that is not a UUID is refused before it is concatenated into a key', async () => {
  // `audio:<project>:<id>` — an id containing a colon would otherwise address a different namespace
  // in the same KV store.
  for (const id of ['not-a-uuid', 'image:11111111-1111-4111-8111-111111111111:x', '../../secret']) {
    const res = await app.request(url(A_PROJECT, encodeURIComponent(id)), as(ALICE), env);
    assert.equal(res.status, 404, `"${id}" was accepted as an audio id`);
  }
});

/* ------------------------------------------------------------------------------ caching --- */

test('CACHE-CONTROL IS THE REMAINING LIFE, not the full hour', async () => {
  // KV's expirationTtl is anchored at WRITE time and this header at RESPONSE time. Serving the
  // full TTL to an object fetched 59 minutes in caches a copy that outlives the object it copies.
  const nearlyGone = '12121212-1212-4121-8121-121212121212';
  store(A_PROJECT, nearlyGone, { secondsLeft: 45 });
  const res = await app.request(url(A_PROJECT, nearlyGone), as(ALICE), env);
  assert.equal(res.status, 200);
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('Cache-Control') ?? '')?.[1]);
  assert.ok(maxAge <= 45, `cached for ${maxAge}s an object with 45s left`);
  assert.match(res.headers.get('Cache-Control') ?? '', /private/, 'a shared cache would serve one user\'s audio to the next');
});

test('an object written before the metadata existed is cached for nothing, not for an hour', async () => {
  const legacy = '13131313-1313-4131-8131-131313131313';
  kv.set(`audio:${A_PROJECT}:${legacy}`, { value: WAV_B64, metadata: { contentType: 'audio/wav' } });
  const res = await app.request(url(A_PROJECT, legacy), as(ALICE), env);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Cache-Control') ?? '', /max-age=0/);
});

test('audio/mpeg is served as audio/mpeg — the allowlist is not a single hardcoded type', async () => {
  const spoken = '14141414-1414-4141-8141-141414141414';
  store(A_PROJECT, spoken, { contentType: 'audio/mpeg' });
  const res = await app.request(url(A_PROJECT, spoken), as(ALICE), env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'audio/mpeg');
});
