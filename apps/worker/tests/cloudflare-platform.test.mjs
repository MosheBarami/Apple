/**
 * THE CLOUDFLARE PLATFORM MODULES (D-VISION-1), EACH DRIVEN WITHOUT THE RUNTIME.
 *
 *   turnstile.ts          — siteverify verdicts, including the ones that must NOT lock people out
 *   analytics-engine.ts   — one data point per event, no person in it, unknown never read as zero
 *   notify-queue.ts       — the queue path, the fallback when the queue refuses, retry vs. final
 *   model-upload.ts       — the durable follow-up that tells the user their slow 3D upload landed
 *   image-resize.ts       — snapped widths, and "never worse than before" when anything fails
 *
 * Each was also exercised against the real Cloudflare runtime on a throwaway worker
 * (apple-cf-probe, deleted afterwards) — see docs/autonomy/vision-status.json `cloudflare`.
 *
 * Run with:  node --test tests/cloudflare-platform.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const outs = [];
async function load(name) {
  const out = join(tmpdir(), `apple-cf-${name}-${process.pid}.mjs`);
  outs.push(out);
  await esbuild.build({ entryPoints: [join(WORKER, 'src', `${name}.ts`)], bundle: true, format: 'esm', target: 'es2022', platform: 'node', outfile: out, logLevel: 'error' });
  return import(pathToFileURL(out).href);
}
process.on('exit', () => outs.forEach((o) => rmSync(o, { force: true })));

const TS = await load('turnstile');
const AE = await load('analytics-engine');
const NQ = await load('notify-queue');
const MU = await load('model-upload');
const IR = await load('image-resize');

/* ------------------------------------------------------------------------------ turnstile --- */

const siteverify = (body, status = 200) => async (url, init) => {
  assert.equal(url, TS.SITEVERIFY_URL);
  siteverify.last = init.body;
  return new Response(JSON.stringify(body), { status });
};

test('turnstile: no secret configured means the route behaves exactly as before', async () => {
  let called = false;
  const v = await TS.verifyTurnstile(undefined, undefined, { fetchImpl: async () => { called = true; } });
  assert.deepEqual(v, { ok: true, checked: false, why: 'not_configured' });
  assert.equal(called, false, 'nothing is sent anywhere without a secret');
});

test('turnstile: with a secret, a missing token is refused before anything is sent', async () => {
  for (const token of [undefined, null, '', '   ', 42]) {
    const v = await TS.verifyTurnstile('1x0000000000000000000000000000000AA', token, { fetchImpl: async () => assert.fail('no call') });
    assert.equal(v.ok, false);
    assert.equal(v.reason, 'missing_token');
  }
});

test('turnstile: Cloudflare saying yes is a pass; the secret, token and client ip are what is sent', async () => {
  const v = await TS.verifyTurnstile('1x0000000000000000000000000000000AA', 'XXXX.DUMMY.TOKEN.XXXX', {
    ip: '203.0.113.9', fetchImpl: siteverify({ success: true, action: 'recovery' }), expectedAction: 'recovery',
  });
  assert.deepEqual(v, { ok: true, checked: true });
  assert.equal(siteverify.last.get('secret'), '1x0000000000000000000000000000000AA');
  assert.equal(siteverify.last.get('response'), 'XXXX.DUMMY.TOKEN.XXXX');
  assert.equal(siteverify.last.get('remoteip'), '203.0.113.9');
});

test('turnstile: Cloudflare saying no is a refusal, with its error codes', async () => {
  const v = await TS.verifyTurnstile('2x0000000000000000000000000000000AA', 'XXXX.DUMMY.TOKEN.XXXX', {
    fetchImpl: siteverify({ success: false, 'error-codes': ['invalid-input-response'] }),
  });
  assert.deepEqual(v, { ok: false, reason: 'rejected', codes: ['invalid-input-response'] });
});

test('turnstile: a token minted for another door is refused', async () => {
  const v = await TS.verifyTurnstile('s', 'tok', { expectedAction: 'recovery', fetchImpl: siteverify({ success: true, action: 'signup' }) });
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'wrong_action');
});

test('turnstile: siteverify unreachable or undecided does NOT lock a person out', async () => {
  const thrown = await TS.verifyTurnstile('s', 'tok', { fetchImpl: async () => { throw new Error('network'); } });
  const http500 = await TS.verifyTurnstile('s', 'tok', { fetchImpl: siteverify({}, 500) });
  const internal = await TS.verifyTurnstile('s', 'tok', { fetchImpl: siteverify({ success: false, 'error-codes': ['internal-error'] }) });
  for (const v of [thrown, http500, internal]) assert.deepEqual(v, { ok: true, checked: false, why: 'unreachable' });
});

test('turnstile: an oversized token is not a token', async () => {
  const v = await TS.verifyTurnstile('s', 'x'.repeat(2049), { fetchImpl: async () => assert.fail('no call') });
  assert.equal(v.ok, false);
});

/* ----------------------------------------------------------------------- analytics engine --- */

const base = { at: 1, actorId: 'user-secret-id', projectId: 'project-secret-id', runId: 'run-1' };
const modelCall = { ...base, kind: 'model_call', provider: 'workers-ai', model: '@cf/x', feature: 'agent', outcome: 'ok', latencyMs: 250, inputTokens: 100, outputTokens: 40, cachedInputTokens: null, neurons: 90, errorKind: null };
const build = { ...base, kind: 'build', outcome: 'done', steps: 7, opsApplied: 12, opsFailed: 1, durationMs: null, neurons: null, finishReason: 'stop' };

test('analytics engine: a data point carries no person, no project and no run', () => {
  for (const e of [modelCall, build, { ...base, kind: 'request', route: '/api/x', method: 'GET', status: 200, durationMs: 5 }]) {
    const flat = JSON.stringify(AE.dataPointFor(e));
    for (const secret of ['user-secret-id', 'project-secret-id', 'run-1']) assert.ok(!flat.includes(secret), `${e.kind} leaked ${secret}`);
  }
});

test('analytics engine: an unmeasured duration or cost is flagged unknown, not stored as a measured zero', () => {
  const p = AE.dataPointFor(build);
  assert.equal(p.doubles[2], 0, 'duration known flag');
  assert.equal(p.doubles[4], 0, 'neurons known flag');
  const m = AE.dataPointFor(modelCall);
  assert.deepEqual([m.doubles[1], m.doubles[2], m.doubles[3], m.doubles[4]], [250, 1, 90, 1]);
  assert.deepEqual(m.blobs.slice(0, 5), ['model_call', 'agent', 'ok', 'workers-ai', '@cf/x']);
  assert.deepEqual(m.indexes, ['model_call']);
});

test('analytics engine: writes go to the binding, and one bad write does not cost the batch', () => {
  const seen = [];
  let n = 0;
  const env = { PRODUCT_EVENTS: { writeDataPoint(p) { n += 1; if (n === 1) throw new Error('boom'); seen.push(p); } } };
  assert.equal(AE.writeProductEvents(env, [modelCall, build, modelCall]), 2);
  assert.equal(seen.length, 2);
  assert.equal(AE.writeProductEvents({}, [modelCall]), 0, 'no binding: nothing, and no throw');
});

test('analytics engine: the read path says what is missing instead of answering an empty month', async () => {
  const r = await AE.readProductAnalytics({}, 7, async () => assert.fail('no call'));
  assert.equal(r.configured, false);
  assert.match(r.why, /CF_ANALYTICS_TOKEN/);
});

test('analytics engine: rows are shaped with unknown kept as null and credits derived from neurons', async () => {
  const raw = { data: [
    { kind: 'model_call', label: 'agent', outcome: 'ok', events: '4', duration_ms: 1000, timed: 4, neurons: 300, priced: 4, input_tokens: 10, output_tokens: 5, ops_applied: 0, ops_failed: 0 },
    { kind: 'build', label: 'agent_run', outcome: 'done', events: 2, duration_ms: 0, timed: 0, neurons: 0, priced: 0, input_tokens: 0, output_tokens: 0, ops_applied: 9, ops_failed: 1 },
  ] };
  let sql = '';
  const r = await AE.readProductAnalytics({ CF_ACCOUNT_ID: 'acct', CF_ANALYTICS_TOKEN: 'tok' }, 400, async (url, init) => {
    assert.match(url, /accounts\/acct\/analytics_engine\/sql$/);
    assert.equal(init.headers.Authorization, 'Bearer tok');
    sql = init.body;
    return new Response(JSON.stringify(raw));
  });
  assert.equal(r.ok, true);
  assert.equal(r.days, 90, 'window clamped to the dataset retention');
  assert.match(sql, /INTERVAL '90' DAY/);
  assert.match(sql, /FROM apple_product_events/);
  assert.equal(r.rows[0].avgDurationMs, 250);
  assert.equal(r.rows[0].credits, 10);
  assert.equal(r.rows[1].avgDurationMs, null, 'no timed sample: unknown, not 0 ms');
  assert.equal(r.rows[1].neurons, null, 'no priced sample: unknown, not free');
  assert.deepEqual(r.totals.build, { events: 2, neurons: null, credits: null });
});

/* ---------------------------------------------------------------------- notification queue --- */

test('notify queue: with the binding, the request only hands the notices to the queue', async () => {
  const sent = [];
  const bg = [];
  const env = { NOTIFY_QUEUE: { async sendBatch(m) { sent.push(...m); } } };
  NQ.dispatchNotifications(env, [{ kind: 'mention', recipientId: 'u', title: 't', at: 1 }], (p) => bg.push(p));
  await Promise.all(bg);
  assert.deepEqual(sent, [{ body: { kind: 'mention', recipientId: 'u', title: 't', at: 1 } }]);
});

test('notify queue: a queue that refuses falls back to delivering now, and nothing throws', async () => {
  const bg = [];
  let d1Touched = false;
  const env = {
    NOTIFY_QUEUE: { async sendBatch() { throw new Error('queue down'); } },
    // notify() reaches D1 first; a D1 that throws proves the direct path ran (and is swallowed).
    CORPUS: { prepare() { d1Touched = true; throw new Error('d1 down'); }, batch() { d1Touched = true; throw new Error('d1 down'); }, exec() { d1Touched = true; throw new Error('d1 down'); } },
  };
  NQ.dispatchNotifications(env, [{ kind: 'mention', recipientId: 'u', projectId: 'p', title: 't', at: 1 }], (p) => bg.push(p));
  await Promise.all(bg);
  assert.equal(d1Touched, true, 'the fallback really tried to deliver');
});

test('notify queue: nothing to send sends nothing', () => {
  NQ.dispatchNotifications({ NOTIFY_QUEUE: { sendBatch: () => assert.fail('no send') } }, [], () => assert.fail('no work'));
});

test('notify queue: backoff grows and is capped', () => {
  assert.deepEqual([1, 2, 3, 4].map(NQ.retryDelaySeconds), [10, 20, 40, 80]);
  assert.equal(NQ.retryDelaySeconds(50), 600);
  assert.equal(NQ.retryDelaySeconds(NaN), 10);
});

test('notify queue: a storage error is retried, a policy refusal is final', async () => {
  const log = [];
  const msg = (body, attempts = 1) => ({ body, attempts, ack: () => log.push(['ack', body.title]), retry: (o) => log.push(['retry', body.title, o.delaySeconds]) });
  const env = { CORPUS: { prepare() { throw new Error('d1 down'); }, batch() { throw new Error('d1 down'); }, exec() { throw new Error('d1 down'); } } };
  await NQ.consumeNotifications({ messages: [
    msg({ kind: 'mention', recipientId: 'u', projectId: 'p', title: 'store-error', at: 1 }, 2),
    msg({ kind: 'mention', recipientId: 'u', projectId: 'p', title: 'given-up', at: 1 }, NQ.NOTIFY_MAX_ATTEMPTS),
    msg({ kind: 'not-a-kind', recipientId: '', title: 'refused', at: 1 }),
  ] }, env);
  assert.deepEqual(log, [['retry', 'store-error', 20], ['ack', 'given-up'], ['ack', 'refused']]);
});

/* ------------------------------------------------------------------- 3D upload follow-up --- */

function fakeStep() {
  const trail = [];
  return {
    trail,
    async do(name, a, b) { trail.push(`do:${name}`); return (typeof a === 'function' ? a : b)({ attempt: 1 }); },
    async sleep(name, d) { trail.push(`sleep:${name}:${d}`); },
  };
}
const params = { userId: 'u1', operationId: 'op/1', projectId: 'p1', displayName: 'Crate' };

test('model upload follow-up: polls until Roblox answers, then tells the user the asset id', async () => {
  const step = fakeStep();
  let n = 0;
  const sent = [];
  const out = await MU.runModelUpload({}, params, step, {
    status: async () => (++n < 3 ? { ok: true, data: { done: false, assetId: null, operationId: 'op/1' } } : { ok: true, data: { done: true, assetId: 777, operationId: 'op/1' } }),
    notify: async (_env, input) => { sent.push(input); return { delivered: true, created: true, id: 'n1' }; },
  });
  assert.deepEqual(out, { done: true, assetId: 777, notified: true });
  assert.deepEqual(step.trail, ['do:check 0', 'sleep:wait 0:15 seconds', 'do:check 1', 'sleep:wait 1:30 seconds', 'do:check 2', 'do:notify']);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].recipientId, 'u1');
  assert.equal(sent[0].projectId, 'p1', 'a project notification needs its project, or it has nowhere to link');
  assert.match(sent[0].body, /777/);
});

test('model upload follow-up: a refused key stops at once and notifies nobody', async () => {
  const step = fakeStep();
  const out = await MU.runModelUpload({}, params, step, {
    status: async () => ({ ok: false, error: 'key removed', status: 403 }),
    notify: async () => assert.fail('no notice'),
  });
  assert.deepEqual(out, { done: false, reason: 'refused', message: 'key removed' });
  assert.deepEqual(step.trail, ['do:check 0']);
});

test('model upload follow-up: gives up after the last check, never loops forever', async () => {
  const step = fakeStep();
  const out = await MU.runModelUpload({}, params, step, {
    status: async () => ({ ok: true, data: { done: false, assetId: null, operationId: 'op/1' } }),
    notify: async () => assert.fail('no notice'),
  });
  assert.deepEqual(out, { done: false, reason: 'gave_up' });
  assert.equal(step.trail.filter((t) => t.startsWith('do:check')).length, MU.CHECK_DELAYS_SECONDS.length + 1);
});

test('model upload follow-up: starts one instance per operation, and never throws', async () => {
  const created = [];
  assert.equal(await MU.startModelUploadFollowUp({}, params), false, 'no binding: no follow-up');
  assert.equal(await MU.startModelUploadFollowUp({ MODEL_UPLOAD_WORKFLOW: { async create(o) { created.push(o); } } }, params), true);
  assert.equal(created[0].id, 'upload-op_1');
  assert.deepEqual(created[0].params, params);
  assert.equal(await MU.startModelUploadFollowUp({ MODEL_UPLOAD_WORKFLOW: { async create() { throw new Error('exists'); } } }, params), false);
});

/* --------------------------------------------------------------------------- image resize --- */

test('image resize: widths snap to three sizes so a client cannot mint a transformation per pixel', () => {
  assert.equal(IR.displayWidth(undefined), null);
  assert.equal(IR.displayWidth(''), null);
  assert.equal(IR.displayWidth('abc'), null);
  assert.equal(IR.displayWidth('-5'), null);
  assert.equal(IR.displayWidth('1'), 320);
  assert.equal(IR.displayWidth('640'), 640);
  assert.equal(IR.displayWidth('641'), 1024);
  assert.equal(IR.displayWidth('99999'), 1024);
});

function fakeImages(outBytes, { fail = false } = {}) {
  const calls = [];
  return {
    calls,
    input() {
      if (fail) throw new Error('not an image');
      const chain = {
        transform(t) { calls.push(['transform', t]); return chain; },
        async output(o) { calls.push(['output', o]); return { response: () => new Response(outBytes), contentType: () => 'image/webp' }; },
      };
      return chain;
    },
  };
}

test('image resize: with the binding, a smaller WebP comes back', async () => {
  const IMAGES = fakeImages(new Uint8Array(100));
  const r = await IR.resizeForDisplay({ IMAGES }, new Uint8Array(5000), 640);
  assert.equal(r.bytes.byteLength, 100);
  assert.equal(r.contentType, 'image/webp');
  assert.deepEqual(IMAGES.calls[0], ['transform', { width: 640, fit: 'scale-down' }]);
});

test('image resize: never worse than before — no binding, a failure, or a bigger result all serve the original', async () => {
  assert.equal(await IR.resizeForDisplay({}, new Uint8Array(10), 640), null);
  assert.equal(await IR.resizeForDisplay({ IMAGES: fakeImages(new Uint8Array(1), { fail: true }) }, new Uint8Array(10), 640), null);
  assert.equal(await IR.resizeForDisplay({ IMAGES: fakeImages(new Uint8Array(50)) }, new Uint8Array(10), 640), null);
});
