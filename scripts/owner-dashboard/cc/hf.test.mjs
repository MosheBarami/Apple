// Hugging Face page API tests. No network: globalThis.fetch is a fake Hub that answers per API path
// from fixtures, or fails every call (401 / 403 / 500 text / throw) while echoing the caller's
// Authorization header back. The token and whoami's `auth` section are sentinels; no result may carry
// either, whatever path it took.
//   node --test scripts/owner-dashboard/cc/hf.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const SENTINEL = 'SECRET_SENTINEL_HF_5d1';
const TOKEN = `${SENTINEL}_tok`;
const AUTH_SECRET = 'AUTH_SECTION_SENTINEL_hf_0c4'; // what whoami's auth.accessToken may hold

const MIN = 60000;
const T0 = Date.parse('2026-09-23T12:00:00Z');
const iso = (minAgo) => new Date(T0 - minAgo * MIN).toISOString();

function fixtures() {
  return {
    '/api/whoami-v2': { type: 'user', name: 'moshebarami', fullname: 'moshe Bar Ami', isPro: false, canPay: false, avatarUrl: '/avatars/abc123.svg',
      orgs: [{ name: 'some-org', token: AUTH_SECRET }], periodEnd: 1790000000,
      auth: { type: 'access_token', accessToken: { displayName: AUTH_SECRET, role: 'fineGrained', value: AUTH_SECRET,
        fineGrained: { scoped: [{ entity: { name: 'moshebarami' }, permissions: ['repo.content.read', 'repo.write'] }] } } } },
    '/api/users/moshebarami/overview': { numModels: 1, numDatasets: 1, numSpaces: 1, numFollowers: 0, numLikes: 0, createdAt: iso(129600) },
    '/api/models': [{ id: 'moshebarami/apple-lora', private: true, downloads: 0, likes: 0, lastModified: iso(420), createdAt: iso(600),
      library_name: 'peft', tags: ['peft', 'lora', 'base_model:adapter:meta-llama/Llama-3.2-3B-Instruct', 'license:other', 'region:us'] }],
    '/api/datasets': [{ id: 'moshebarami/apple-roblox-corpus', private: true, downloads: 0, likes: 0, lastModified: iso(10), description: 'The corpus.',
      cardData: { pretty_name: 'Apple Roblox corpus' }, tags: ['luau', 'license:other'] }],
    '/api/spaces': [{ id: 'moshebarami/backrooms-api', sdk: 'docker', private: false, likes: 0, lastModified: iso(100000),
      runtime: { stage: 'NO_APP_FILE', hardware: { current: null, requested: 'cpu-basic' }, gcTimeout: 172800, domains: [{ stage: 'READY' }] },
      cardData: { title: 'Backrooms Api', emoji: '💻', colorFrom: 'yellow', colorTo: 'pink' } }],
    '/api/models/moshebarami/apple-lora': { usedStorage: 27816768, siblings: [{ rfilename: 'adapter_model.safetensors' }, { rfilename: 'README.md' }] },
    '/api/datasets/moshebarami/apple-roblox-corpus': { usedStorage: 10836638, siblings: [{ rfilename: 'data.jsonl' }] },
    '/api/models/moshebarami/apple-lora/commits/main': [{ id: 'a'.repeat(40), title: 'Upload adapter', date: iso(420), authors: [{ user: 'moshebarami' }] }],
    '/api/datasets/moshebarami/apple-roblox-corpus/commits/main': [{ id: 'b'.repeat(40), title: 'Corpus snapshot', date: iso(10), authors: [{ user: 'moshebarami' }] },
      { id: 'c'.repeat(40), title: 'initial commit', date: iso(900), authors: [] }],
  };
}

let mode = 'fixtures';
let fx = fixtures();
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)); const a = init.headers?.authorization || '';
  calls.push({ url: String(url), method: init.method || 'GET', auth: a });
  if (mode === 'throw') throw Object.assign(new Error(`boom ${a}`), { name: 'TypeError' });
  if (mode === 'echo500text') return new Response(`upstream crashed; you sent ${a}`, { status: 500 });
  if (mode === 'echo401' || mode === 'echo403') return new Response(JSON.stringify({ error: `bad token ${a}` }), { status: mode === 'echo401' ? 401 : 403, headers: { 'content-type': 'application/json' } });
  if (init.method === 'POST') return new Response(JSON.stringify({ stage: 'RUNNING' }), { status: 200, headers: { 'content-type': 'application/json' } });
  const body = fx[u.pathname];
  if (body === undefined) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
  const headers = { 'content-type': 'application/json' };
  if (u.pathname === '/api/whoami-v2') Object.assign(headers, { ratelimit: '"api";r=988;t=143', 'ratelimit-policy': '"fixed window";"api";q=1000;w=300' });
  if (u.pathname.endsWith('/commits/main')) headers['x-total-count'] = String(body.length + 1);
  return new Response(JSON.stringify(body), { status: 200, headers });
};

const { hf, hfAction, hfInsights, parseRate } = await import('./platforms/hf.mjs');
const { uncache } = await import('./http.mjs');

const clean = (x, label) => {
  const s = JSON.stringify(x);
  assert.ok(!s.includes(SENTINEL), `${label}: the token leaked`);
  assert.ok(!s.includes(AUTH_SECRET), `${label}: whoami's auth section leaked`);
};

beforeEach(() => { process.env.HF_TOKEN = TOKEN; mode = 'fixtures'; fx = fixtures(); calls.length = 0; uncache('hf'); });

test('hf: without HF_TOKEN it says so and calls nothing', async () => {
  delete process.env.HF_TOKEN;
  const r = await hf();
  assert.equal(r.ok, false);
  assert.equal(r.configured, false);
  assert.deepEqual(r.need, ['HF_TOKEN']);
  assert.equal(calls.length, 0);
});

test('hf: account, repos with commits, Spaces and rate limit, with nothing of the auth section', async () => {
  const r = await hf();
  clean(r, 'hf()');
  assert.equal(r.ok, true);
  assert.ok(!('auth' in r), 'the auth section is never forwarded');
  assert.ok(calls.every((c) => c.auth === `Bearer ${TOKEN}`), 'every Hub call carries the token');
  assert.equal(r.user, 'moshebarami');
  assert.equal(r.avatar, 'https://huggingface.co/avatars/abc123.svg');
  assert.deepEqual(r.orgs, ['some-org']);
  assert.deepEqual(r.token, { role: 'fineGrained', write: true });
  assert.deepEqual(r.rate, { remaining: 988, resetSec: 143, limit: 1000, windowSec: 300 });
  assert.deepEqual(r.inference, { measurable: false });
  const [m] = r.models; const [d] = r.datasets; const [s] = r.spaces;
  assert.equal(m.baseModel, 'meta-llama/Llama-3.2-3B-Instruct');
  assert.equal(m.license, 'other');
  assert.ok(!m.tags.some((t) => /^(license|base_model):|^region:/.test(t)), 'meta tags are split out of the tag list');
  assert.equal(m.storage, 27816768);
  assert.equal(m.commits[0].title, 'Upload adapter');
  assert.equal(d.commitCount, 3, 'the commit count comes from x-total-count');
  assert.equal(d.commits.length, 2);
  assert.equal(d.title, 'Apple Roblox corpus');
  assert.equal(s.runtimeStage, 'NO_APP_FILE');
  assert.equal(s.requestedHardware, 'cpu-basic');
  assert.equal(s.sleepAfterSec, 172800);
  assert.ok(r.conclusions.length >= 2 && r.conclusions.length <= 4);
});

test('hf: an avatar URL that is not the Hub\'s is dropped', async () => {
  fx['/api/whoami-v2'].avatarUrl = 'javascript:alert(1)';
  const r = await hf();
  assert.equal(r.avatar, null);
});

for (const m of ['echo401', 'echo403', 'echo500text', 'throw']) {
  test(`hf: every call failing (${m}) gives a plain reason and no secret`, async () => {
    mode = m;
    const r = await hf();
    clean(r, m);
    assert.equal(r.ok, false);
    assert.equal(typeof r.reason, 'string');
    assert.ok(r.errors.who && r.errors.spaces, 'each failed section is named');
  });
}

test('hf: one failed section is reported and the rest still shows', async () => {
  delete fx['/api/spaces'];
  const r = await hf();
  clean(r, 'partial');
  assert.equal(r.ok, true);
  assert.ok(r.errors.spaces);
  assert.equal(r.spaces.length, 0);
  assert.equal(r.models.length, 1);
  assert.ok(r.conclusions.some((c) => c.text.includes('Spaces') && c.tone === 'warn'), 'no conclusion about Spaces it could not see');
});

test('hfAction: dry run returns the exact plan for each switch and calls nothing', async () => {
  delete process.env.HF_TOKEN; // a plan needs no token
  const id = 'moshebarami/backrooms-api';
  const want = { restart: `https://huggingface.co/api/spaces/${id}/restart`, pause: `https://huggingface.co/api/spaces/${id}/pause`,
    rebuild: `https://huggingface.co/api/spaces/${id}/restart?factory=true` };
  for (const [kind, url] of Object.entries(want)) {
    const r = await hfAction({ kind, id, dryRun: true });
    assert.equal(r.ok, true);
    assert.deepEqual(r.plan, { method: 'POST', url, body: null });
  }
  assert.equal(calls.length, 0);
});

test('hfAction: refuses unknown kinds and Spaces outside the account, without a call', async () => {
  for (const [kind, id] of [['delete', 'moshebarami/backrooms-api'], ['hardware', 'moshebarami/backrooms-api'], ['restart', 'someone/else'],
    ['restart', 'moshebarami/..'], ['restart', 'moshebarami/../x'], ['restart', 'moshebarami/a/b'], ['restart', '']]) {
    const r = await hfAction({ kind, id, dryRun: true });
    assert.equal(r.ok, false, `${kind} ${id} must be refused`);
  }
  assert.equal(calls.length, 0);
});

test('hfAction: a real switch POSTs to the Hub with the token and returns no secret', async () => {
  const r = await hfAction({ kind: 'restart', id: 'moshebarami/backrooms-api' });
  clean(r, 'action');
  assert.deepEqual({ ok: r.ok, kind: r.kind, id: r.id }, { ok: true, kind: 'restart', id: 'moshebarami/backrooms-api' });
  assert.equal(calls.length, 1);
  assert.deepEqual({ url: calls[0].url, method: calls[0].method, auth: calls[0].auth },
    { url: 'https://huggingface.co/api/spaces/moshebarami/backrooms-api/restart', method: 'POST', auth: `Bearer ${TOKEN}` });
  mode = 'echo403';
  const bad = await hfAction({ kind: 'pause', id: 'moshebarami/backrooms-api' });
  clean(bad, 'action 403');
  assert.equal(bad.ok, false);
});

test('hfInsights: a broken, stale, public account reads differently from a healthy one', () => {
  const repo = (id, kind, date, priv = true) => ({ id, kind, private: priv, commits: [{ date }], updatedAt: date });
  const worried = hfInsights({ isPro: false, canPay: false, errors: {},
    spaces: [{ id: 'moshebarami/a', runtimeStage: 'RUNTIME_ERROR' }],
    models: [repo('moshebarami/m', 'model', iso(3000))], datasets: [repo('moshebarami/d', 'dataset', iso(10), false)] });
  const calm = hfInsights({ isPro: true, canPay: true, errors: {},
    spaces: [{ id: 'moshebarami/a', runtimeStage: 'RUNNING' }],
    models: [repo('moshebarami/m', 'model', iso(10))], datasets: [repo('moshebarami/d', 'dataset', iso(3000))] });
  for (const list of [worried, calm]) {
    assert.ok(list.length >= 2 && list.length <= 4);
    assert.ok(list.every((c) => c.text && c.basis && ['good', 'info', 'warn', 'bad'].includes(c.tone)), 'each conclusion says what it rests on');
  }
  assert.equal(worried[0].tone, 'bad');
  assert.ok(worried.some((c) => c.tone === 'warn' && c.text.includes('ייתכן שהמודל לא אומן')), 'dataset newer than the model');
  assert.ok(worried.some((c) => c.text.includes('ציבורי')), 'public repo named');
  assert.ok(calm.every((c) => c.tone !== 'bad' && c.tone !== 'warn'));
  assert.ok([...worried, ...calm].some((c) => c.text.includes('ה-API לא חושף')), 'inference usage is said to be unmeasurable');
});

test('parseRate: reads the IETF ratelimit headers, null without them', () => {
  const h = new Headers({ ratelimit: '"api";r=5;t=12', 'ratelimit-policy': '"fixed window";"api";q=1000;w=300' });
  assert.deepEqual(parseRate(h), { remaining: 5, resetSec: 12, limit: 1000, windowSec: 300 });
  assert.equal(parseRate(new Headers()), null);
});
