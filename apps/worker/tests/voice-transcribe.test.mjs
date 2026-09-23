// Voice typing (POST /api/voice/transcribe), EXECUTED against stub providers — no paid call.
//
// The properties, each asserted on behaviour rather than spelling:
//   * no signed-in user -> refused before anything is read or paid for;
//   * size and length limits are measured on the bytes, not on headers or client claims;
//   * the audio is never stored or logged: no storage binding is touched, no console line carries
//     it, the gateway call asks for no log, and an AssemblyAI transcript is always DELETEd;
//   * the provider switches to AssemblyAI by itself when ASSEMBLYAI_API_KEY exists, and falls back
//     to Workers AI when AssemblyAI fails;
//   * a reservation precedes every provider call, and the person pays Credits from measured seconds.
//
// Run with:  node --test tests/voice-transcribe.test.mjs      (from apps/worker)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(tmpdir(), `apple-voice-${process.pid}.mjs`);
await esbuild.build({ entryPoints: [join(WORKER, 'src', 'voice-transcribe.ts')], bundle: true, format: 'esm', target: 'es2022', outfile: OUT, logLevel: 'silent' });
const V = await import(pathToFileURL(OUT).href);
process.on('exit', () => rmSync(OUT, { force: true }));

/** A 16-bit mono PCM WAV of `seconds` of a quiet tone. */
function wav(seconds, rate = 16000) {
  const n = Math.round(seconds * rate);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i += 1) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i += 1) v.setInt16(44 + i * 2, Math.round(Math.sin(i / 8) * 3000 + (i % 7) * 11), true);
  return new Uint8Array(buf);
}
const b64 = (u8) => Buffer.from(u8).toString('base64');

function harness({ credits = 60, aiResult = { text: ' build me a red tower', transcription_info: { duration: 2 } }, key, budgetOk = true } = {}) {
  const log = [];
  const touched = [];
  const forbidden = (name) => new Proxy({}, { get() { touched.push(name); throw new Error(`${name} must not be touched`); } });
  const env = {
    AI_GATEWAY_ID: 'golem',
    AI: { async run(model, input, opts) { log.push({ at: 'ai', model, input, opts }); if (aiResult instanceof Error) throw aiResult; return aiResult; } },
    BUDGET_DO: { idFromName: (n) => n, get: () => ({ async fetch(url, init) {
      const path = new URL(url).pathname; const body = JSON.parse(init.body); log.push({ at: path, ...body });
      if (path === '/reserve') return Response.json(budgetOk ? { ok: true, reserved: body.neurons } : { ok: false, reason: 'daily_cap' });
      return Response.json({ ok: true });
    } }) },
    QUOTA_DO: { idFromName: (n) => n, get: () => ({ async fetch(url, init) {
      const path = new URL(url).pathname; log.push({ at: `quota${path}`, ...(init?.body ? JSON.parse(init.body) : {}) });
      if (path === '/state') return Response.json({ creditsRemaining: credits });
      return Response.json({ ok: true });
    } }) },
    KV: forbidden('KV'), MEDIA: forbidden('MEDIA'), CORPUS: forbidden('CORPUS'), SESSION_DO: forbidden('SESSION_DO'),
    ...(key ? { ASSEMBLYAI_API_KEY: key } : {}),
  };
  return { env, log, touched };
}

function post(body, type = 'audio/wav') {
  return new Request('https://x/api/voice/transcribe', { method: 'POST', headers: { 'content-type': type }, body });
}

/** Runs the handler with console captured, so a line carrying audio would be seen. */
async function run(req, env, user, deps) {
  const lines = [];
  const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  for (const k of Object.keys(orig)) console[k] = (...a) => lines.push(a.map(String).join(' '));
  try {
    const res = await V.handleVoiceTranscribe(req, env, user, deps);
    return { res, body: await res.json(), lines };
  } finally { Object.assign(console, orig); }
}

test.beforeEach(() => V.resetVoiceRateLimit());

test('no signed-in user is refused before anything is read or paid for', async () => {
  const h = harness();
  const { res } = await run(post(wav(1)), h.env, null);
  assert.equal(res.status, 401);
  assert.equal(h.log.length, 0, 'no budget, quota or provider call without a user');
});

test('the route is registered behind the JWT gate, not exempt from it', () => {
  // Line comments stripped (a naive /* */ strip would eat code: '/api/*' opens one).
  const src = readFileSync(join(WORKER, 'src', 'index.ts'), 'utf8').replace(/^\s*(\/\/|\*).*$/gm, '');
  assert.match(src, /app\.post\(\s*'\/api\/voice\/transcribe'[^\n]*handleVoiceTranscribe\([^\n]*c\.get\('user'\)/);
  const exempt = src.match(/const AUTH_EXEMPT = \[([^\]]*)\]/);
  assert.ok(exempt, 'AUTH_EXEMPT list not found — this test would check nothing');
  assert.doesNotMatch(exempt[1], /voice/);
});

test('a non-WAV body is refused with 415 and no provider runs', async () => {
  const h = harness();
  const { res } = await run(post(new Uint8Array(4000), 'audio/webm'), h.env, 'u1');
  assert.equal(res.status, 415);
  assert.ok(!h.log.some((l) => l.at === 'ai' || l.at === '/reserve'));
});

test('size is measured on the bytes that arrived, and over-size is 413 with no provider call', async () => {
  const h = harness();
  const big = new Uint8Array(V.VOICE_LIMITS.maxBytes + 1);
  const { res, body } = await run(post(big), h.env, 'u1');
  assert.equal(res.status, 413);
  assert.equal(body.reason, 'too_large');
  assert.ok(!h.log.some((l) => l.at === 'ai'));
});

test('a clip longer than the limit is 413 even when its bytes fit', async () => {
  const h = harness();
  const long = wav(V.VOICE_LIMITS.maxSeconds + 5, 8000); // 8 kHz keeps it under the byte cap
  assert.ok(long.byteLength <= V.VOICE_LIMITS.maxBytes);
  const { res, body } = await run(post(long), h.env, 'u1');
  assert.equal(res.status, 413);
  assert.equal(body.reason, 'too_long');
  assert.ok(!h.log.some((l) => l.at === 'ai'));
});

test('Workers AI path: transcript returned, reserved before the call, billed from measured seconds, nothing stored or logged', async () => {
  const h = harness();
  const audio = wav(2);
  const { res, body, lines } = await run(post(audio), h.env, 'u1');
  assert.equal(res.status, 200);
  assert.deepEqual({ heard: body.heard, text: body.text, provider: body.provider }, { heard: true, text: 'build me a red tower', provider: 'workers-ai' });
  const order = h.log.map((l) => l.at);
  assert.ok(order.indexOf('/reserve') < order.indexOf('ai') && order.indexOf('ai') < order.indexOf('/settle'), order.join(' > '));
  const ai = h.log.find((l) => l.at === 'ai');
  assert.equal(ai.model, '@cf/openai/whisper-large-v3-turbo');
  assert.equal(ai.input.audio, b64(audio));
  assert.equal(ai.input.language, 'en');
  assert.equal(ai.opts.gateway.collectLog, false, 'the gateway must not log the audio');
  const spend = h.log.find((l) => l.at === 'quota/spend');
  assert.ok(spend && spend.credits >= 1 && spend.kind === 'voice');
  assert.deepEqual(h.touched, [], 'no storage binding may be touched');
  const needle = b64(audio).slice(100, 160);
  assert.ok(!lines.some((l) => l.includes(needle)), 'no console line may carry the audio');
});

test('a changed provider shape is a failure, never an empty transcript', async () => {
  const h = harness({ aiResult: { something: 'else' } });
  const { res, body } = await run(post(wav(1)), h.env, 'u1');
  assert.equal(res.status, 502);
  assert.notEqual(body.heard, false);
});

test('silence is heard:false, and the work is still billed', async () => {
  const h = harness({ aiResult: { text: '  ' } });
  const { res, body } = await run(post(wav(1)), h.env, 'u1');
  assert.equal(res.status, 200);
  assert.equal(body.heard, false);
  assert.ok(h.log.some((l) => l.at === 'quota/spend'));
});

test('no Credits left: 402 and no provider runs', async () => {
  const h = harness({ credits: 0 });
  const { res } = await run(post(wav(1)), h.env, 'u1');
  assert.equal(res.status, 402);
  assert.ok(!h.log.some((l) => l.at === 'ai' || l.at === '/reserve'));
});

test('a refused global reservation means the provider is never called', async () => {
  const h = harness({ budgetOk: false });
  const { res } = await run(post(wav(1)), h.env, 'u1');
  assert.equal(res.status, 503);
  assert.ok(!h.log.some((l) => l.at === 'ai'));
});

function assemblyFetcher({ fail = false } = {}) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ url: String(url), method, auth: init.headers?.authorization });
    if (url.endsWith('/upload')) return Response.json({ upload_url: 'https://cdn.assemblyai.com/upload/abc' });
    if (url.endsWith('/transcript') && method === 'POST') return Response.json({ id: 't1' });
    if (method === 'DELETE') return Response.json({ id: 't1' });
    return Response.json(fail ? { status: 'error', error: 'boom' } : { status: 'completed', text: 'Build me a red tower.', audio_duration: 2 });
  };
  return { calls, fetcher };
}

test('with ASSEMBLYAI_API_KEY the product uses AssemblyAI by itself, and deletes the transcript after', async () => {
  const h = harness({ key: 'k-test' });
  const a = assemblyFetcher();
  const { res, body } = await run(post(wav(2)), h.env, 'u1', { fetcher: a.fetcher, sleep: async () => {} });
  assert.equal(res.status, 200);
  assert.equal(body.provider, 'assemblyai');
  assert.equal(body.text, 'Build me a red tower.');
  assert.ok(!h.log.some((l) => l.at === 'ai'), 'Workers AI not called when AssemblyAI answered');
  assert.ok(a.calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/transcript/t1')), 'transcript (and upload) must be deleted');
  assert.equal(h.log.find((l) => l.at === '/reserve').model, V.ASSEMBLY.id);
  assert.deepEqual(h.touched, []);
});

test('an AssemblyAI failure still deletes, and Workers AI answers instead', async () => {
  const h = harness({ key: 'k-test' });
  const a = assemblyFetcher({ fail: true });
  const { res, body, lines } = await run(post(wav(2)), h.env, 'u1', { fetcher: a.fetcher, sleep: async () => {} });
  assert.equal(res.status, 200);
  assert.equal(body.provider, 'workers-ai');
  assert.ok(a.calls.some((c) => c.method === 'DELETE'));
  assert.ok(!lines.some((l) => l.includes('k-test')), 'the key never reaches a log line');
});

test('a burst from one person is rate limited', async () => {
  const h = harness();
  let last;
  for (let i = 0; i <= V.VOICE_LIMITS.perMinute; i += 1) last = await run(post(wav(0.5)), h.env, 'burst', { now: () => 1_000 });
  assert.equal(last.res.status, 429);
});
