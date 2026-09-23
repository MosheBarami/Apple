// Groq page API tests. No network and no paid call: globalThis.fetch is a fake Groq (a model list, and
// a one-token chat completion with the rate-limit headers), or fails every call while echoing the
// caller's Authorization header back. The key is a sentinel; no result may carry it.
//   node --test scripts/owner-dashboard/cc/groq.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const SENTINEL = 'SECRET_SENTINEL_GROQ_7b3';
const KEY = `${SENTINEL}_key`;

const MODELS = { object: 'list', data: [
  { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B', owned_by: 'OpenAI', active: true, context_window: 131072, max_completion_tokens: 65536,
    input_modalities: ['text'], output_modalities: ['text'], supported_features: ['tools', 'json_mode'],
    pricing: { prompt: '0.000000075', completion: '0.0000003', input_cache_read: '0.0000000375' } },
  { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', owned_by: 'OpenAI', active: true, context_window: 131072, max_completion_tokens: 65536,
    input_modalities: ['text'], output_modalities: ['text'], pricing: { prompt: '0.00000015', completion: '0.0000006' } },
  { id: 'whisper-large-v3', owned_by: 'OpenAI', active: true, context_window: 448, input_modalities: ['audio'], output_modalities: ['transcription'] },
  { id: 'old-model', owned_by: 'X', active: false, context_window: 4096, input_modalities: ['text'], output_modalities: ['text'] },
] };
const COMPLETION = { id: 'chatcmpl-1', model: 'openai/gpt-oss-20b', service_tier: 'on_demand', choices: [{ message: { content: 'p' } }],
  usage: { prompt_tokens: 72, completion_tokens: 1, total_tokens: 73, queue_time: 0.0012, prompt_time: 0.002, total_time: 0.0044 } };
const RL = { 'x-ratelimit-limit-requests': '1000', 'x-ratelimit-remaining-requests': '998', 'x-ratelimit-reset-requests': '2m52.8s',
  'x-ratelimit-limit-tokens': '8000', 'x-ratelimit-remaining-tokens': '7927', 'x-ratelimit-reset-tokens': '547ms', 'x-groq-region': 'dls' };

let mode = 'ok';
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url); const a = init.headers?.authorization || '';
  calls.push({ url: u, method: init.method || 'GET', auth: a, body: init.body });
  if (mode === 'throw') throw Object.assign(new Error(`boom ${a}`), { name: 'TypeError' });
  if (mode === 'echo500text') return new Response(`upstream crashed; you sent ${a}`, { status: 500 });
  if (mode === 'echo401' || mode === 'echo429') {
    return new Response(JSON.stringify({ error: { message: `Invalid API Key ${a}` } }), { status: mode === 'echo401' ? 401 : 429,
      headers: { 'content-type': 'application/json', ...(mode === 'echo429' ? { ...RL, 'x-ratelimit-remaining-requests': '0' } : {}) } });
  }
  if (u.endsWith('/models')) return new Response(JSON.stringify(MODELS), { status: 200, headers: { 'content-type': 'application/json' } });
  if (u.endsWith('/chat/completions')) return new Response(JSON.stringify(COMPLETION), { status: 200, headers: { 'content-type': 'application/json', ...RL } });
  return new Response('{}', { status: 404 });
};

const { groq, groqAction, groqInsights, parseLimits, durSec, resetProbe, PROBE_MODEL } = await import('./platforms/groq.mjs');
const { uncache } = await import('./http.mjs');

const clean = (x, label) => assert.ok(!JSON.stringify(x).includes(SENTINEL), `${label}: the key leaked`);
const PLAN = { method: 'POST', url: 'https://api.groq.com/openai/v1/chat/completions',
  body: { model: 'openai/gpt-oss-20b', max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] } };

beforeEach(() => { process.env.GROQ_API_KEY = KEY; mode = 'ok'; calls.length = 0; uncache('groq'); resetProbe(); });

test('groq: without GROQ_API_KEY it says so, concludes only that, and calls nothing', async () => {
  delete process.env.GROQ_API_KEY;
  const r = await groq();
  assert.equal(r.configured, false);
  assert.deepEqual(r.need, ['GROQ_API_KEY']);
  assert.equal(r.conclusions.length, 1);
  assert.equal(r.conclusions[0].tone, 'warn');
  const p = await groqAction({ kind: 'probe' });
  assert.equal(p.ok, false);
  assert.equal(p.configured, false);
  assert.equal(calls.length, 0);
});

test('groq: the model list with context, output limit, modalities and price per million tokens', async () => {
  const r = await groq();
  clean(r, 'groq()');
  assert.equal(r.ok, true);
  assert.equal(r.key, 'valid');
  assert.equal(calls.length, 1, 'only the free model list; no probe inside the GET');
  assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/models');
  assert.equal(calls[0].auth, `Bearer ${KEY}`);
  const m = r.models.find((x) => x.id === 'openai/gpt-oss-20b');
  assert.deepEqual({ context: m.context, maxOut: m.maxOut, input: m.input, output: m.output, features: m.features },
    { context: 131072, maxOut: 65536, input: ['text'], output: ['text'], features: ['tools', 'json_mode'] });
  assert.deepEqual(m.pricing, { in: 0.075, out: 0.3, cached: 0.038 });
  assert.equal(r.models.find((x) => x.id === 'whisper-large-v3').pricing, null);
  assert.equal(r.models.find((x) => x.id === 'old-model').active, false);
  assert.deepEqual(r.models.map((x) => x.context), [131072, 131072, 4096, 448], 'largest context first');
  assert.equal(r.probe, null);
  assert.ok(r.conclusions.some((c) => c.tone === 'good' && c.text.includes('3 מודלים פעילים') && c.text.includes('GPT OSS 20B')), 'cheapest active chat model named');
});

for (const m of ['echo401', 'echo500text', 'throw']) {
  test(`groq: a failing model list (${m}) gives a plain reason and no key`, async () => {
    mode = m;
    const r = await groq();
    clean(r, m);
    assert.equal(r.ok, false);
    assert.equal(typeof r.reason, 'string');
    assert.equal(r.key, m === 'echo401' ? 'invalid' : 'unknown');
  });
}

test('groqAction: dry run returns the exact probe request and calls nothing', async () => {
  delete process.env.GROQ_API_KEY;
  const r = await groqAction({ kind: 'probe', dryRun: true });
  assert.equal(r.ok, true);
  assert.deepEqual(r.plan, PLAN);
  assert.equal(calls.length, 0);
});

test('groqAction: refuses anything but the probe, without a call', async () => {
  for (const kind of ['chat', 'rotate', 'delete', undefined, 'probe ']) {
    const r = await groqAction({ kind, dryRun: true });
    assert.equal(r.ok, false, `${kind} must be refused`);
  }
  assert.equal(calls.length, 0);
});

test('groqAction: the probe times one tiny request and reads the limits from its headers', async () => {
  const r = await groqAction({ kind: 'probe' });
  clean(r, 'probe');
  assert.equal(r.ok, true);
  assert.equal(r.throttled, false);
  assert.equal(calls.length, 1);
  assert.deepEqual({ url: calls[0].url, method: calls[0].method, auth: calls[0].auth, body: JSON.parse(calls[0].body) },
    { url: PLAN.url, method: 'POST', auth: `Bearer ${KEY}`, body: PLAN.body });
  const p = r.probe;
  assert.equal(p.ok, true);
  assert.ok(Number.isFinite(p.ms) && p.ms >= 0);
  assert.deepEqual({ serverMs: p.serverMs, queueMs: p.queueMs, tokens: p.tokens, region: p.region, tier: p.tier, model: p.model },
    { serverMs: 4.4, queueMs: 1.2, tokens: { prompt: 72, completion: 1, total: 73 }, region: 'dls', tier: 'on_demand', model: PROBE_MODEL });
  assert.deepEqual(p.limits, { requestsPerDay: 1000, requestsLeft: 998, requestsResetSec: 172.8, tokensPerMin: 8000, tokensLeft: 7927, tokensResetSec: 0.547 });
  assert.equal(r.history.length, 1);
  assert.ok(r.nextProbeInSec > 55 && r.nextProbeInSec <= 60);
});

test('groqAction: a second probe inside a minute sends nothing and returns the last result', async () => {
  const first = await groqAction({ kind: 'probe' });
  const second = await groqAction({ kind: 'probe' });
  assert.equal(calls.length, 1, 'one request however many times it is asked');
  assert.equal(second.ok, true);
  assert.equal(second.throttled, true);
  assert.deepEqual(second.probe, first.probe);
  const both = await Promise.all([groqAction({ kind: 'probe' }), groqAction({ kind: 'probe' })]);
  assert.ok(both.every((x) => x.throttled === true));
  assert.equal(calls.length, 1);
});

test('groqAction: two concurrent first probes still send one request', async () => {
  const both = await Promise.all([groqAction({ kind: 'probe' }), groqAction({ kind: 'probe' })]);
  assert.equal(calls.length, 1);
  assert.deepEqual(both.map((x) => x.throttled).sort(), [false, true]);
});

test('groqAction: a refused probe (429) is recorded as a failure, keeps the limits, and carries no key', async () => {
  mode = 'echo429';
  const r = await groqAction({ kind: 'probe' });
  clean(r, 'probe 429');
  assert.equal(r.ok, false);
  assert.equal(r.probe.ok, false);
  assert.equal(r.probe.status, 429);
  assert.equal(r.probe.limits.requestsLeft, 0);
  assert.deepEqual(r.history.map((h) => h.ok), [false]);
  mode = 'throw'; resetProbe();
  const t = await groqAction({ kind: 'probe' });
  clean(t, 'probe throw');
  assert.equal(t.ok, false);
});

test('groq: the GET shows the latest probe even though the model list is cached', async () => {
  await groq();
  await groqAction({ kind: 'probe' });
  const r = await groq();
  assert.equal(calls.filter((c) => c.url.endsWith('/models')).length, 1, 'model list served from cache');
  assert.equal(r.probe.ok, true);
  assert.equal(r.history.length, 1);
  assert.ok(r.conclusions.some((c) => c.text.includes('נשארו 998 מתוך 1000')), 'limits concluded from the probe headers');
});

test('groqInsights: a slow, nearly exhausted key reads differently from a fast, fresh one', () => {
  const models = [{ id: 'a', name: 'A', active: true, context: 131072, input: ['text'], output: ['text'], pricing: { in: 0.05 } }];
  const lim = (left) => ({ requestsPerDay: 1000, requestsLeft: left, tokensPerMin: 8000, tokensLeft: 7000 });
  const worried = groqInsights({ configured: true, models, probe: { ok: true, at: 'x', model: 'a', ms: 2400, serverMs: 300, limits: lim(50) }, history: [] });
  const calm = groqInsights({ configured: true, models, probe: { ok: true, at: 'x', model: 'a', ms: 180, serverMs: 4.4, limits: lim(990) },
    history: [{ ok: true, ms: 170 }, { ok: true, ms: 180 }, { ok: true, ms: 200 }] });
  for (const list of [worried, calm]) {
    assert.ok(list.length >= 2 && list.length <= 4);
    assert.ok(list.every((c) => c.text && c.basis && ['good', 'info', 'warn', 'bad'].includes(c.tone)), 'each conclusion says what it rests on');
  }
  assert.ok(worried.filter((c) => c.tone === 'warn').length >= 2, 'slow answer and low daily requests both flagged');
  assert.ok(calm.every((c) => c.tone === 'good'));
  assert.ok(calm.some((c) => c.text.includes('רוב הזמן הוא הדרך ברשת')), 'network-dominated latency named');
  assert.ok(calm.some((c) => c.text.includes('חציון 3 בדיקות: 180ms')));
  const failed = groqInsights({ configured: true, error: 'המפתח נדחה', probe: null });
  assert.equal(failed[0].tone, 'bad');
  assert.ok(failed.some((c) => c.tone === 'info' && c.text.includes('עוד לא נמדד')));
});

test('durSec and parseLimits read Groq\'s header formats', () => {
  assert.equal(durSec('1m26.4s'), 86.4);
  assert.equal(durSec('547ms'), 0.547);
  assert.equal(durSec('2h3m1s'), 7381);
  assert.equal(durSec(''), null);
  assert.equal(durSec('soon'), null);
  assert.equal(parseLimits(new Headers()), null);
  assert.deepEqual(parseLimits(new Headers({ 'x-ratelimit-remaining-tokens': '12' })),
    { requestsPerDay: null, requestsLeft: null, requestsResetSec: null, tokensPerMin: null, tokensLeft: 12, tokensResetSec: null });
});
