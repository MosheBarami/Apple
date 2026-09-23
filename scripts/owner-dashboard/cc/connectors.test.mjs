// Connector cards: no network and no paid call. fetch is a fake upstream that records every request;
// every credential is a sentinel that must never show up in a result.
//   node --test scripts/owner-dashboard/cc/connectors.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CONNECTORS, connectors, connectorAction } from './platforms/connectors.mjs';
import { uncache } from './http.mjs';

const KEYS = {
  STRIPE_SECRET_KEY: 'sk_test_SENTINEL_1234567890', POSTHOG_PERSONAL_API_KEY: 'phx_SENTINEL_1234567890', POSTHOG_PROJECT_ID: '4242',
  RESEND_API_KEY: 're_SENTINEL_1234567890', VERCEL_TOKEN: 'vc_SENTINEL_1234567890', VERCEL_TEAM_ID: 'team_abc',
  NETLIFY_AUTH_TOKEN: 'nf_SENTINEL_1234567890', OPENROUTER_API_KEY: 'sk-or-SENTINEL_1234567890',
  ASSEMBLYAI_API_KEY: 'aai_SENTINEL_1234567890', CLERK_SECRET_KEY: 'sk_test_clerk_SENTINEL_1234567890',
  LANGFLOW_API_KEY: 'lf_SENTINEL_1234567890', LANGFLOW_URL: 'http://localhost:7860/',
};
const ALL = [...new Set(CONNECTORS.flatMap((c) => [...c.env, ...c.optional]))];
const set = (...names) => { for (const n of names) process.env[n] = KEYS[n]; };

let calls = [], handler = () => json({});
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url, init = {}) => { calls.push({ url: String(url), ...init }); return handler(String(url), init); };

beforeEach(() => { for (const k of ALL) delete process.env[k]; calls = []; handler = () => json({}); uncache('conn:'); });
const byId = async () => Object.fromEntries((await connectors()).list.map((c) => [c.id, c]));

// Realistic upstream bodies, with personal data and key fragments in fields that must NOT be forwarded.
const UP = {
  'api.stripe.com/v1/balance': { livemode: false, available: [{ amount: 1500, currency: 'usd', source_types: {} }], pending: [{ amount: 200, currency: 'usd' }] },
  'api.stripe.com/v1/charges': { data: [{ id: 'ch_1', amount: 999, currency: 'usd', status: 'succeeded', created: 1700000000, paid: true, livemode: false,
    billing_details: { email: 'buyer@example.com', name: 'Buyer Person' }, receipt_email: 'buyer@example.com' }] },
  'api.stripe.com/v1/customers': { data: [{ id: 'cus_1', email: 'buyer@example.com' }, { id: 'cus_2', email: 'b@example.com' }], has_more: true },
  'api.stripe.com/v1/products': { data: [{ name: 'Apple Pro', active: true }] },
  'us.posthog.com/api/projects/4242/feature_flags': { count: 2, results: [
    { id: 7, key: 'new-ui', name: 'New UI', active: true, filters: { groups: [{ properties: [], rollout_percentage: 30 }] } },
    { id: 8, key: 'beta', name: 'Beta', active: false, filters: { groups: [{ properties: [{ key: 'email' }] }, {}] } }] },
  'us.posthog.com/api/projects/4242/': { name: 'Apple', api_token: 'phc_public', owner: { email: 'owner@example.com' } },
  'api.resend.com/domains': { data: [{ id: 'd1', name: 'apple.dev', status: 'verified', region: 'us-east-1', created_at: '2026-01-01' }] },
  'api.vercel.com/v9/projects': { projects: [{ name: 'web', framework: 'nextjs', updatedAt: 1700000001, env: [{ value: 'x' }] }] },
  'api.vercel.com/v6/deployments': { deployments: [{ name: 'web', state: 'READY', target: 'production', created: 1700000002, url: 'web-abc.vercel.app',
    creator: { email: 'owner@example.com' } }] },
  'api.netlify.com': [{ name: 'site', ssl_url: 'https://site.netlify.app', state: 'current', updated_at: '2026-02-02', published_deploy: { state: 'ready' } }],
  'openrouter.ai/api/v1/key': { data: { label: 'sk-or-SENTINEL_1234567890', usage: 1.5, limit: 10, is_free_tier: false, limit_remaining: 8.5 } },
  'api.assemblyai.com': { transcripts: [{ id: 't1', status: 'completed', created: '2026-03-03', audio_duration: 61, audio_url: 'https://private/a.mp3' }] },
  'api.clerk.com/v1/users/count': { object: 'total_count', total_count: 12 },
  'api.clerk.com/v1/users?': [{ id: 'user_1', created_at: 1700000003, last_sign_in_at: 1700000004, email_addresses: [{ email_address: 'u@example.com' }] }],
  'localhost:7860': [{ id: 'f1', name: 'Flow', updated_at: '2026-04-04', is_component: false, data: { secret: 'x' } }],
};
const upstream = (url) => { const k = Object.keys(UP).find((p) => url.includes(p)); return k ? json(UP[k]) : json({ error: 'nope' }, 404); };

test('every connector without its key reports configured:false with the missing names and makes no request', async () => {
  const cards = await byId();
  assert.equal(Object.keys(cards).length, CONNECTORS.length);
  for (const c of CONNECTORS) {
    const k = cards[c.id];
    assert.equal(k.configured, false, c.id);
    assert.deepEqual(k.need, c.env, c.id);
    assert.ok(k.how && k.docs.startsWith('https://') && k.blurb && /^#[0-9A-F]{6}$/i.test(k.color), c.id);
    assert.equal(k.data, undefined); assert.equal(k.error, undefined);
  }
  set('POSTHOG_PERSONAL_API_KEY'); // half-configured still lists the one that is missing
  assert.deepEqual((await byId()).posthog.need, ['POSTHOG_PROJECT_ID']);
  assert.equal(calls.length, 0);
});

test('a live Stripe key is refused before any request; a non-http LANGFLOW_URL too', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_live_SENTINEL_1234567890';
  process.env.LANGFLOW_API_KEY = KEYS.LANGFLOW_API_KEY; process.env.LANGFLOW_URL = 'javascript:alert(1)';
  const c = await byId();
  assert.equal(c.stripe.configured, true);
  assert.equal(c.stripe.error, 'המפתח של Stripe הוא מפתח חי (live) — הדשבורד עובד רק עם מפתח בדיקה (test)');
  assert.match(c.langflow.error, /LANGFLOW_URL/);
  assert.equal(calls.length, 0);
});

test('configured Stripe reads balance, charges, customers and products in test mode', async () => {
  set('STRIPE_SECRET_KEY'); handler = upstream;
  const { stripe } = await byId();
  assert.deepEqual(stripe.data, {
    livemode: false, balance: { available: [{ amount: 1500, currency: 'usd' }], pending: [{ amount: 200, currency: 'usd' }] },
    charges: [{ amount: 999, currency: 'usd', status: 'succeeded', created: 1700000000, paid: true }],
    customers: { count: 2, has_more: true }, products: [{ name: 'Apple Pro', active: true }],
  });
  assert.deepEqual(calls.map((c) => c.url).sort(), ['https://api.stripe.com/v1/balance', 'https://api.stripe.com/v1/charges?limit=10',
    'https://api.stripe.com/v1/customers?limit=10', 'https://api.stripe.com/v1/products?limit=10']);
  assert.ok(calls.every((c) => c.headers.authorization === `Bearer ${KEYS.STRIPE_SECRET_KEY}` && (c.method || 'GET') === 'GET'));
});

test('configured Vercel lists projects and deployments for the team', async () => {
  set('VERCEL_TOKEN', 'VERCEL_TEAM_ID'); handler = upstream;
  const { vercel } = await byId();
  assert.deepEqual(vercel.data, {
    projects: [{ name: 'web', framework: 'nextjs', updatedAt: 1700000001 }],
    deployments: [{ name: 'web', state: 'READY', target: 'production', created: 1700000002, url: 'https://web-abc.vercel.app' }],
  });
  assert.deepEqual(calls.map((c) => c.url).sort(), ['https://api.vercel.com/v6/deployments?limit=10&teamId=team_abc',
    'https://api.vercel.com/v9/projects?limit=20&teamId=team_abc']);
});

test('configured PostHog reads the project name and its flags on the default host', async () => {
  set('POSTHOG_PERSONAL_API_KEY', 'POSTHOG_PROJECT_ID'); handler = upstream;
  const { posthog } = await byId();
  assert.deepEqual(posthog.data, { project: 'Apple', count: 2, flags: [
    { id: 7, key: 'new-ui', name: 'New UI', active: true, rollout_percentage: 30 },
    { id: 8, key: 'beta', name: 'Beta', active: false, rollout_percentage: null }] });
  assert.deepEqual(calls.map((c) => c.url).sort(), ['https://us.posthog.com/api/projects/4242/',
    'https://us.posthog.com/api/projects/4242/feature_flags/?limit=50']);
});

test('one reader answering 403 becomes a Hebrew error and the others still load', async () => {
  set('RESEND_API_KEY', 'VERCEL_TOKEN', 'OPENROUTER_API_KEY');
  handler = (url) => (url.includes('resend') ? json({ message: 'restricted' }, 403) : upstream(url));
  const c = await byId();
  assert.equal(c.resend.error, 'לטוקן של Resend אין הרשאה ל-רשימת הדומיינים');
  assert.equal(c.resend.data, undefined);
  assert.equal(c.vercel.data.projects[0].name, 'web');
  assert.deepEqual(c.openrouter.data, { usage: 1.5, limit: 10, is_free_tier: false, limit_remaining: 8.5 });
});

test('dryRun returns the PATCH plan without a key and without any request', async () => {
  const r = await connectorAction({ id: 'posthog', kind: 'flag', target: '7', value: false, dryRun: true });
  assert.equal(r.ok, true);
  assert.deepEqual(r.plan, { method: 'PATCH', url: 'https://us.posthog.com/api/projects/{POSTHOG_PROJECT_ID}/feature_flags/7/', body: { active: false } });
  set('POSTHOG_PERSONAL_API_KEY', 'POSTHOG_PROJECT_ID');
  const r2 = await connectorAction({ id: 'posthog', kind: 'flag', target: 7, value: true, dryRun: true });
  assert.equal(r2.plan.url, 'https://us.posthog.com/api/projects/4242/feature_flags/7/');
  assert.equal(calls.length, 0);
});

test('a real flag toggle PATCHes the flag with {active:false} and drops the PostHog cache', async () => {
  set('POSTHOG_PERSONAL_API_KEY', 'POSTHOG_PROJECT_ID'); process.env.POSTHOG_HOST = 'https://eu.posthog.com/';
  handler = (url, init) => (init.method === 'PATCH' ? json({ id: 7, active: false }) : upstream(url.replace('eu.', 'us.')));
  await byId(); await byId();
  const reads = calls.length; // the second read came from the cache
  assert.equal(reads, 2);
  const r = await connectorAction({ id: 'posthog', kind: 'flag', target: '7', value: false });
  assert.deepEqual([r.ok, r.target, r.value], [true, '7', false]);
  const patch = calls.find((c) => c.method === 'PATCH');
  assert.equal(patch.url, 'https://eu.posthog.com/api/projects/4242/feature_flags/7/');
  assert.deepEqual(JSON.parse(patch.body), { active: false });
  assert.equal(patch.headers.authorization, `Bearer ${KEYS.POSTHOG_PERSONAL_API_KEY}`);
  await byId();
  assert.equal(calls.length, reads + 1 + 2, 'cache was dropped, so the card re-read PostHog');
});

test('a PostHog write without the key fails cleanly, still with no request', async () => {
  const r = await connectorAction({ id: 'posthog', kind: 'flag', target: '7', value: true });
  assert.equal(r.ok, false);
  assert.deepEqual(r.need, ['POSTHOG_PERSONAL_API_KEY', 'POSTHOG_PROJECT_ID']);
  assert.equal(calls.length, 0);
});

test('bad id, kind, target or value is rejected before anything else', async () => {
  set('POSTHOG_PERSONAL_API_KEY', 'POSTHOG_PROJECT_ID');
  const base = { id: 'posthog', kind: 'flag', target: '7', value: true };
  for (const bad of [{ id: 'stripe' }, { kind: 'delete' }, { id: undefined }]) {
    assert.equal((await connectorAction({ ...base, ...bad })).reason, 'פעולה לא מוכרת');
  }
  for (const target of ['7a', '../7', '', ['7'], -1, 1.5, '7/../../x', null, true]) {
    assert.equal((await connectorAction({ ...base, target })).ok, false, JSON.stringify(target));
  }
  for (const value of ['false', 0, 1, null, undefined]) {
    assert.equal((await connectorAction({ ...base, value })).ok, false, JSON.stringify(value));
  }
  assert.equal((await connectorAction()).ok, false);
  assert.equal(calls.length, 0);
});

test('leak guard: no result carries a key, an email or other unmapped upstream data, whatever upstream does', async () => {
  const secrets = Object.entries(KEYS).filter(([k]) => /KEY|TOKEN/.test(k)).map(([, v]) => v);
  const modes = {
    ok: upstream,
    forbidden: () => json({ error: `bad key ${KEYS.STRIPE_SECRET_KEY}` }, 403),
    crash: (url, init) => new Response(`crashed; you sent ${JSON.stringify(init.headers)}`, { status: 500 }),
    down: (url, init) => { throw Object.assign(new Error(`boom ${JSON.stringify(init.headers)}`), { name: 'TypeError' }); },
  };
  for (const [name, h] of Object.entries(modes)) {
    for (const k of Object.keys(KEYS)) process.env[k] = KEYS[k];
    uncache('conn:'); handler = h;
    const out = [await connectors(), await connectorAction({ id: 'posthog', kind: 'flag', target: '7', value: false }),
      await connectorAction({ id: 'posthog', kind: 'flag', target: '7', value: true, dryRun: true })];
    const s = JSON.stringify(out);
    for (const v of secrets) assert.ok(!s.includes(v), `${name}: leaked ${v.slice(0, 6)}`);
    assert.ok(!/SENTINEL|@example\.com|phc_public|private\/a\.mp3/.test(s), `${name}: leaked upstream data`);
    const cards = out[0].list;
    assert.ok(cards.every((c) => c.configured && (name === 'ok' ? c.data && !c.error : c.error && !c.data)), name);
  }
  assert.ok(calls.length > 20);
  assert.ok(calls.every((c) => secrets.every((v) => !c.url.includes(v) && !String(c.body || '').includes(v))));
});
