// Hugging Face: the image model, the 3D generator, the daily cap, and the Roblox hand-off.
//
// EVERY NETWORK CALL HERE IS A RECORDED FAKE. The account is on free inference credits, so a test
// that spent one would be a test that fails next month for a reason nobody can see. The fakes
// answer in the shapes the real services answered with on 2026-09-23 (router.huggingface.co →
// fal-ai queue; the tencent/Hunyuan3D-2 Space's Gradio 4.44 `/call` API), and the assertions are
// about PROPERTIES — nothing is spent without a slot, the token never leaves Hugging Face, a mesh
// Roblox would refuse is never handed on — not about how the requests are spelled.
//
// Run with:  node --test tests/hf.test.mjs      (from apps/worker)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { inspectGlb } from '../../../packages/evals/src/glb-inspect.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT_HF = join(tmpdir(), `apple-hf-${process.pid}.mjs`);
const OUT_PIPE = join(tmpdir(), `apple-hf-3d-${process.pid}.mjs`);
await esbuild.build({ entryPoints: [join(WORKER, 'src', 'hf.ts')], bundle: true, format: 'esm', target: 'es2022', platform: 'node', outfile: OUT_HF, logLevel: 'error' });
await esbuild.build({ entryPoints: [join(WORKER, 'src', 'hf-3d-pipeline.ts')], bundle: true, format: 'esm', target: 'es2022', platform: 'node', outfile: OUT_PIPE, logLevel: 'error' });
const HF = await import(pathToFileURL(OUT_HF).href);
const PIPE = await import(pathToFileURL(OUT_PIPE).href);
process.on('exit', () => { rmSync(OUT_HF, { force: true }); rmSync(OUT_PIPE, { force: true }); });

// ------------------------------------------------------------------------- fixtures ---

const TOKEN = 'hf_TESTtokenABCDEFGHIJKLMNOPQRSTUVWXyz0123';
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 4, 0, 0, 0, 4, 0, 8, 6, 0, 0, 0]);
const noSleep = async () => {};

/** A KV namespace in memory. `store` is exposed so a test can pre-fill a day's counter. */
function kv(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, String(v)); },
  };
}

function envWith({ token = TOKEN, counters = {} } = {}) {
  return { HF_TOKEN: token, KV: kv(counters) };
}

/** A minimal but valid GLB: one mesh, one indexed triangle primitive of `triangles` faces. */
function glb(triangles) {
  const doc = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [
      { count: 3, type: 'VEC3', componentType: 5126, min: [-1, -1, -1], max: [1, 1, 1] },
      { count: triangles * 3, type: 'SCALAR', componentType: 5125 },
    ],
  };
  let json = new TextEncoder().encode(JSON.stringify(doc));
  const pad = (4 - (json.length % 4)) % 4;
  if (pad) json = new Uint8Array([...json, ...new Array(pad).fill(0x20)]);
  const out = new Uint8Array(12 + 8 + json.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, out.length, true);
  dv.setUint32(12, json.length, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(json, 20);
  return out;
}

/**
 * A fetch that answers from a route table and records every request. Routes are tried in order;
 * the first whose test matches `METHOD url` answers. An unmatched request is a test failure,
 * because a request nobody anticipated is exactly what a spend test exists to catch.
 */
function fakeFetch(routes) {
  const calls = [];
  const impl = async (input, init = {}) => {
    const url = String(input);
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = new Headers(init.headers ?? {});
    calls.push({ url, method, auth: headers.get('authorization'), body: init.body });
    for (const [re, answer] of routes) {
      if (re.test(`${method} ${url}`)) return typeof answer === 'function' ? answer(url, init) : answer.clone();
    }
    throw new Error(`unexpected request: ${method} ${url}`);
  };
  return { impl, calls };
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const sse = (events) => new Response(events.map(([e, d]) => `event: ${e}\ndata: ${d}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });

/** The router + fal queue, answering the way it did for the real Z-Image-Turbo call. */
function imageRoutes({ submitStatus = 200, submitBody, nsfw = false, bytes = PNG } = {}) {
  return [
    [/^POST https:\/\/router\.huggingface\.co\/fal-ai\//, () => submitStatus === 200
      ? json({ status: 'IN_QUEUE', request_id: 'req-1', response_url: 'https://queue.fal.run/fal-ai/z-image/requests/req-1' })
      : new Response(submitBody ?? '{"error":"x"}', { status: submitStatus })],
    [/^GET https:\/\/router\.huggingface\.co\/fal-ai\/fal-ai\/z-image\/requests\/req-1\/status/, () => json({ status: 'COMPLETED' })],
    [/^GET https:\/\/router\.huggingface\.co\/fal-ai\/fal-ai\/z-image\/requests\/req-1/, () => json({
      images: [{ url: 'https://v3b.fal.media/files/b/x/chest.png', content_type: 'image/png', width: 1024, height: 1024 }],
      has_nsfw_concepts: [nsfw],
    })],
    [/^GET https:\/\/v3b\.fal\.media\//, () => new Response(bytes, { status: 200, headers: { 'content-type': 'image/png' } })],
  ];
}

/** The Hunyuan3D-2 Space, answering the way it did for the real call — including its broken `url`. */
function spaceRoutes({ triangles = 10000, shapeEvents } = {}) {
  const HOST = 'https://tencent-hunyuan3d-2.hf.space';
  const upd = (path) => JSON.stringify({ value: { path, url: `${HOST}/call/on_e/file=${path}`, meta: { _type: 'gradio.FileData' } }, __type__: 'update' });
  return [
    [/^POST https:\/\/tencent-hunyuan3d-2\.hf\.space\/upload/, () => json(['/tmp/gradio/aaa/input.png'])],
    [/^POST https:\/\/tencent-hunyuan3d-2\.hf\.space\/call\/shape_generation$/, () => json({ event_id: 'ev-shape' })],
    [/^GET https:\/\/tencent-hunyuan3d-2\.hf\.space\/call\/shape_generation\/ev-shape$/, () => sse(shapeEvents ?? [
      ['heartbeat', 'null'],
      ['complete', `[${upd('/tmp/gradio/bbb/white_mesh.glb')}, "<html>", {"number_of_faces": 1251192}, 1234]`],
    ])],
    [/^POST https:\/\/tencent-hunyuan3d-2\.hf\.space\/call\/on_export_click$/, () => json({ event_id: 'ev-export' })],
    [/^GET https:\/\/tencent-hunyuan3d-2\.hf\.space\/call\/on_export_click\/ev-export$/, () => sse([
      ['complete', `["<html>", ${upd('/tmp/gradio/ccc/white_mesh.glb')}]`],
    ])],
    // The url Gradio reports under /call is a 404; only /file=<path> serves the bytes.
    [/^GET https:\/\/tencent-hunyuan3d-2\.hf\.space\/call\/on_e\//, () => json({ detail: 'Not Found' }, 404)],
    [/^GET https:\/\/tencent-hunyuan3d-2\.hf\.space\/file=\/tmp\/gradio\/ccc\/white_mesh\.glb$/, () => new Response(glb(triangles), { status: 200 })],
  ];
}

// ------------------------------------------------------------------ configuration ---

test('isHfConfigured is true only when a real-looking token is present', () => {
  assert.equal(HF.isHfConfigured({ HF_TOKEN: TOKEN }), true);
  for (const t of [undefined, '', '   ']) assert.equal(HF.isHfConfigured({ HF_TOKEN: t }), false, `token ${JSON.stringify(t)}`);
});

test('without a token nothing is fetched and nothing is counted', async () => {
  const f = fakeFetch([]);
  const env = envWith({ token: '' });
  const img = await HF.generateImage(env, 'a treasure chest', { fetchImpl: f.impl, sleep: noSleep });
  const m = await HF.generate3d(env, { prompt: 'a treasure chest' }, { fetchImpl: f.impl, sleep: noSleep });
  assert.equal(img.ok, false);
  assert.equal(img.reason, 'not_configured');
  assert.equal(m.ok, false);
  assert.equal(m.reason, 'not_configured');
  assert.equal(f.calls.length, 0);
  assert.equal(env.KV.store.size, 0);
});

// ---------------------------------------------------------------------- daily cap ---

test('the daily cap refuses before any provider request, and the count is per UTC day', async () => {
  const now = Date.UTC(2026, 8, 23, 12);
  const env = envWith();
  const cap = HF.HF_DAILY_CAPS.image;
  assert.ok(Number.isInteger(cap) && cap > 0);
  for (let i = 0; i < cap; i++) assert.equal((await HF.takeDailySlot(env, 'image', now)).ok, true);
  const refused = await HF.takeDailySlot(env, 'image', now);
  assert.equal(refused.ok, false);

  const f = fakeFetch(imageRoutes());
  const img = await HF.generateImage(env, 'a treasure chest', { fetchImpl: f.impl, sleep: noSleep, now: () => now });
  assert.equal(img.ok, false);
  assert.equal(img.reason, 'daily_cap');
  assert.equal(f.calls.length, 0, 'a capped call must not reach the provider');

  // The next UTC day is a fresh allowance, and another kind has its own.
  assert.equal((await HF.takeDailySlot(env, 'image', now + 864e5)).ok, true);
  assert.equal((await HF.takeDailySlot(env, 'model3d', now)).ok, true);
});

test('a failed provider call still used its slot, so a failing provider cannot be retried past the cap', async () => {
  const now = Date.UTC(2026, 8, 23, 12);
  const env = envWith();
  const f = fakeFetch(imageRoutes({ submitStatus: 500 }));
  for (let i = 0; i < HF.HF_DAILY_CAPS.image; i++) {
    const r = await HF.generateImage(env, 'a treasure chest', { fetchImpl: f.impl, sleep: noSleep, now: () => now });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'provider_error');
  }
  const submits = f.calls.length;
  const last = await HF.generateImage(env, 'a treasure chest', { fetchImpl: f.impl, sleep: noSleep, now: () => now });
  assert.equal(last.reason, 'daily_cap');
  assert.equal(f.calls.length, submits);
});

// -------------------------------------------------------------------------- image ---

test('generateImage returns the PNG bytes, and the token goes to Hugging Face and nowhere else', async () => {
  const f = fakeFetch(imageRoutes());
  const r = await HF.generateImage(envWith(), 'a treasure chest icon', { fetchImpl: f.impl, sleep: noSleep });
  assert.equal(r.ok, true);
  assert.deepEqual([...r.png], [...PNG]);
  assert.equal(r.width, 1024);
  assert.equal(r.height, 1024);
  assert.equal(r.model, HF.HF_IMAGE_MODEL.hubId);
  for (const c of f.calls) {
    const host = new URL(c.url).host;
    if (c.auth) assert.ok(host.endsWith('huggingface.co') || host.endsWith('.hf.space'), `token sent to ${host}`);
  }
  assert.ok(f.calls.some((c) => new URL(c.url).host === 'v3b.fal.media' && !c.auth), 'the CDN fetch carries no credential');
});

test('out of credits is named as such, and the provider body is redacted before it is returned', async () => {
  const f = fakeFetch(imageRoutes({ submitStatus: 402, submitBody: JSON.stringify({ error: `You have exceeded your monthly included credits. token=${TOKEN}` }) }));
  const r = await HF.generateImage(envWith(), 'a treasure chest', { fetchImpl: f.impl, sleep: noSleep });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'credits_exhausted');
  assert.ok(!r.message.includes(TOKEN), 'the token must not come back in a message');
});

test('an image the provider flags as unsafe is refused, not returned', async () => {
  const f = fakeFetch(imageRoutes({ nsfw: true }));
  const r = await HF.generateImage(envWith(), 'a treasure chest', { fetchImpl: f.impl, sleep: noSleep });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'refused');
  assert.equal(r.png, undefined);
});

test('bytes that are not an image are a bad output, never a success', async () => {
  const f = fakeFetch(imageRoutes({ bytes: new TextEncoder().encode('<html>error</html>') }));
  const r = await HF.generateImage(envWith(), 'a treasure chest', { fetchImpl: f.impl, sleep: noSleep });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'bad_output');
});

test('a queue that never completes times out instead of hanging', async () => {
  let t = 0;
  const f = fakeFetch([
    [/^POST https:\/\/router\.huggingface\.co\//, () => json({ status: 'IN_QUEUE', request_id: 'req-1', response_url: 'https://queue.fal.run/fal-ai/z-image/requests/req-1' })],
    [/\/status/, () => json({ status: 'IN_PROGRESS' })],
  ]);
  const r = await HF.generateImage(envWith(), 'a treasure chest', { fetchImpl: f.impl, sleep: async (ms) => { t += ms; }, now: () => t, maxWaitMs: 5000 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'timeout');
});

// ----------------------------------------------------------------------------- 3D ---

test('glbTriangles agrees with the eval suite\'s independent GLB reader', () => {
  for (const n of [1, 12, 10000, 25000]) {
    const bytes = glb(n);
    assert.equal(HF.glbTriangles(bytes), inspectGlb(bytes).triangles);
  }
  assert.equal(HF.glbTriangles(new TextEncoder().encode('not a glb at all')), null);
});

test('generate3d from a prompt: brand marks are refused before anything is spent', async () => {
  const f = fakeFetch([]);
  const env = envWith();
  const r = await HF.generate3d(env, { prompt: 'the Nike logo as a statue' }, { fetchImpl: f.impl, sleep: noSleep });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'refused');
  assert.equal(f.calls.length, 0);
  assert.equal(env.KV.store.size, 0);
});

test('generate3d from a prompt returns a GLB Roblox will accept, fetched from where the Space really serves it', async () => {
  const f = fakeFetch([...imageRoutes(), ...spaceRoutes({ triangles: 10000 })]);
  const r = await HF.generate3d(envWith(), { prompt: 'a treasure chest' }, { fetchImpl: f.impl, sleep: noSleep });
  assert.equal(r.ok, true, r.message);
  assert.equal(new TextDecoder().decode(r.glb.subarray(0, 4)), 'glTF');
  assert.equal(r.triangles, 10000);
  assert.ok(r.triangles <= HF.ROBLOX_MAX_TRIANGLES);
  assert.equal(r.model, HF.HF_3D_MODEL.hubId);
  assert.ok(r.sourceImage instanceof Uint8Array, 'the image the mesh was built from is kept');
  // The image went to the Space as an upload, not as a URL the Space would have to fetch.
  const upload = f.calls.find((c) => c.method === 'POST' && c.url.endsWith('/upload'));
  assert.ok(upload && upload.body instanceof FormData);
});

test('generate3d from image bytes spends no image slot', async () => {
  const env = envWith();
  const f = fakeFetch(spaceRoutes());
  const r = await HF.generate3d(env, { imagePng: PNG }, { fetchImpl: f.impl, sleep: noSleep });
  assert.equal(r.ok, true, r.message);
  assert.ok(!f.calls.some((c) => c.url.includes('router.huggingface.co')));
  assert.ok([...env.KV.store.keys()].every((k) => !k.includes('image')));
});

test('a mesh over Roblox\'s per-mesh triangle limit is refused rather than handed on', async () => {
  const f = fakeFetch(spaceRoutes({ triangles: HF.ROBLOX_MAX_TRIANGLES + 1 }));
  const r = await HF.generate3d(envWith(), { imagePng: PNG }, { fetchImpl: f.impl, sleep: noSleep });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'bad_output');
  assert.equal(r.glb, undefined);
});

test('a Space error (for example an exhausted GPU quota) comes back as the Space said it', async () => {
  const f = fakeFetch(spaceRoutes({ shapeEvents: [['error', JSON.stringify('You have exceeded your GPU quota (60s requested vs. 12s left).')]] }));
  const r = await HF.generate3d(envWith(), { imagePng: PNG }, { fetchImpl: f.impl, sleep: noSleep });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'provider_error');
  assert.match(r.message, /GPU quota/);
});

// ----------------------------------------------------------------- Roblox hand-off ---

function pipeDeps({ credential = { scopes: ['asset:read', 'asset:write'] }, upload, status, fetch } = {}) {
  const log = { uploads: [], polls: 0 };
  return {
    log,
    deps: {
      fetchImpl: fetch?.impl ?? fakeFetch([...imageRoutes(), ...spaceRoutes()]).impl,
      sleep: noSleep,
      describeCredential: async () => credential,
      upload: upload ?? (async (_env, userId, input) => {
        log.uploads.push({ userId, ...input });
        return { ok: true, status: 200, audited: true, data: { done: false, assetId: null, operationId: 'op-1' } };
      }),
      uploadStatus: status ?? (async () => {
        log.polls++;
        return { ok: true, status: 200, audited: false, data: { done: log.polls >= 2, assetId: log.polls >= 2 ? 987654 : null, operationId: 'op-1' } };
      }),
    },
  };
}

test('no connected Roblox key with asset:write: refused before any Hugging Face spend', async () => {
  for (const credential of [null, { scopes: ['asset:read'] }]) {
    const f = fakeFetch([]);
    const env = envWith();
    const { deps, log } = pipeDeps({ credential, fetch: f });
    const r = await PIPE.generateModelForRoblox(env, 'user-1', { prompt: 'a treasure chest' }, deps);
    assert.equal(r.ok, false);
    assert.equal(r.stage, 'roblox_key');
    assert.equal(f.calls.length, 0);
    assert.equal(env.KV.store.size, 0);
    assert.equal(log.uploads.length, 0);
  }
});

test('the GLB is uploaded as a Model into the customer\'s own account and the asset id comes back', async () => {
  const { deps, log } = pipeDeps();
  const r = await PIPE.generateModelForRoblox(envWith(), 'user-1', { prompt: 'a treasure chest' }, deps);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.assetId, 987654);
  assert.equal(log.uploads.length, 1);
  const up = log.uploads[0];
  assert.equal(up.userId, 'user-1');
  assert.equal(up.type, 'Model');
  assert.equal(up.contentType, 'model/gltf-binary');
  assert.equal(new TextDecoder().decode(new Uint8Array(up.file).subarray(0, 4)), 'glTF');
  assert.ok(up.displayName.length > 0 && up.displayName.length <= 50);
});

test('an upload still processing is reported as pending with its operation, never as an asset', async () => {
  const { deps } = pipeDeps({ status: async () => ({ ok: true, status: 200, audited: false, data: { done: false, assetId: null, operationId: 'op-1' } }) });
  const r = await PIPE.generateModelForRoblox(envWith(), 'user-1', { prompt: 'a treasure chest' }, deps);
  assert.equal(r.ok, true);
  assert.equal(r.assetId, null);
  assert.equal(r.operationId, 'op-1');
  assert.equal(r.done, false);
});

test('a refused upload is a failure at the upload stage, carrying Roblox\'s reason', async () => {
  const { deps } = pipeDeps({ upload: async () => ({ ok: false, status: 400, audited: true, error: 'Model contains a mesh with too many triangles' }) });
  const r = await PIPE.generateModelForRoblox(envWith(), 'user-1', { prompt: 'a treasure chest' }, deps);
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'upload');
  assert.match(r.message, /too many triangles/);
});

test('a generation failure stops before Roblox is touched', async () => {
  const f = fakeFetch([...imageRoutes(), ...spaceRoutes({ shapeEvents: [['error', 'null']] })]);
  const { deps, log } = pipeDeps({ fetch: f });
  const r = await PIPE.generateModelForRoblox(envWith(), 'user-1', { prompt: 'a treasure chest' }, deps);
  assert.equal(r.ok, false);
  assert.equal(r.stage, 'generate');
  assert.equal(log.uploads.length, 0);
});
