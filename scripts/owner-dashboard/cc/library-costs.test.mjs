// The owner pages' readers: the libraries against the real catalogues in the repo (no network: the
// Roblox thumbnail lookup is stubbed), and the pure derive() of costs and business on fixtures.
//   node --test scripts/owner-dashboard/cc/library-costs.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (String(url).startsWith('https://thumbnails.roblox.com/')) return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  return realFetch(url, opts);
};
const { library } = await import('./platforms/library.mjs');
const costs = await import('./platforms/costs.mjs');
const business = await import('./platforms/business.mjs');
const q = (o) => new URLSearchParams(o);

test('UI library: 34 components x 4 skins = 123 pairs, each with an image and a board', async () => {
  const d = await library(q({ tab: 'ui' }));
  assert.equal(d.pairs.length, 123);
  assert.equal(d.skins.length, 4);
  assert.ok(d.components >= 34);
  assert.ok(d.pairs.every((p) => p.image && p.skin && p.title), 'every pair has an image, a skin and a title');
  assert.ok(d.pairs.filter((p) => p.board).length > 100, 'boards parsed from the visual README');
});

test('assets: more than 1000 real images, paginated server-side with media paths inside the library', async () => {
  const d = await library(q({ tab: 'assets', limit: '50' }));
  assert.ok(d.total > 1000, `total ${d.total}`);
  assert.equal(d.page.rows.length, 50);
  assert.ok(d.packs.length > 3);
  for (const r of d.page.rows) { assert.match(r.src, /^packages\/asset-library\/.+\.png$/); assert.doesNotMatch(r.src, /\/\//); }
  const big = await library(q({ tab: 'assets', limit: '99999' }));
  assert.ok(big.page.rows.length <= 400, 'limit is capped');
  const pack = d.packs[0].id;
  const f = await library(q({ tab: 'assets', pack, limit: '5' }));
  assert.ok(f.page.rows.every((r) => r.pack === pack));
  assert.equal(f.page.total, d.packs[0].n);
});

test('models, sfx and vfx have real rows; sfx defaults to files that can be played', async () => {
  const m = await library(q({ tab: 'models', limit: '5' }));
  assert.ok(m.totals.rows > 1000 && m.page.rows.length === 5);
  const s = await library(q({ tab: 'sfx', limit: '5' }));
  assert.ok(s.total > 1000 && s.local > 100);
  assert.ok(s.page.rows.every((r) => typeof r.file === 'string' && r.file.startsWith('packages/asset-library/')));
  const v = await library(q({ tab: 'vfx', limit: '5' }));
  assert.ok(v.total > 1000 && v.presets.length > 0);
  assert.ok(v.presets.every((p) => Array.isArray(p.parts)));
});

test('owner acquisition view separates listed sources, local bytes and backend status', async () => {
  const d = await library(q({ tab: 'intake', view: 'sources', limit: '10' }));
  assert.ok(d.sources.total >= 140, 'the owner-provided source queue must be visible');
  assert.ok(d.sources.page.rows.some((r) => r.url.includes('zerodev.tools')));
  assert.ok(d.sources.excluded >= 11, 'the general-purpose 3D portals are excluded from Roblox model intake');
  assert.ok(d.files.total > 0);
  assert.ok(d.files.local > 0);
  assert.ok(d.files.fromOwner >= 0 && d.files.fromOwner < d.files.local, 'the owner count is separate from old inventory');
  const onlyOwner = await library(q({ tab: 'intake', view: 'files', owner: '1', limit: '10' }));
  assert.ok(onlyOwner.page.rows.every((r) => r.ownerListed && r.source !== 'polyhaven'), 'excluded general models cannot count as owner acquisitions');
  const files = await library(q({ tab: 'intake', view: 'files', q: 'Wooden Crate 01', limit: '10' }));
  assert.ok(files.page.rows.every((r) => r.source !== 'polyhaven'), 'generic Poly Haven files must not be presented as Apple models');
  const excluded = await library(q({ tab: 'intake', view: 'sources', off: '133', limit: '11' }));
  assert.ok(excluded.page.rows.every((r) => r.state === 'out-of-scope-not-roblox' && r.acquired === 0));
  const sound = await library(q({ tab: 'sfx', source: 'opengameart', q: 'Ability Learn', limit: '40' }));
  assert.ok(sound.page.rows.some((r) => r.file && r.local.state === 'verified'), '35 downloaded sounds must show as files');
});

test('summary counts every library and has a growth series from git', async () => {
  const d = await library(q({ tab: 'summary' }));
  const by = Object.fromEntries(d.counts.map((c) => [c.id, c.n]));
  assert.equal(by.ui, 123);
  assert.ok(by.assets > 1000 && by.models > 0 && by.sfx > 0 && by.vfx > 0);
  for (const id of ['ui', 'assets', 'models', 'sfx', 'vfx']) assert.ok(d.growth[id].length >= 1, `${id} growth`);
});

test('costs derive: joins Workers AI with the gateway, groups runs, projects the month', () => {
  const now = Date.UTC(2026, 8, 10, 12);
  const day = '2026-09-10';
  const out = costs.derive({
    now,
    ai: [{ count: 10, dimensions: { date: day, modelId: '@cf/a' }, sum: { totalInputTokens: 1000, totalOutputTokens: 100, totalNeurons: 20000 } }],
    gw: [{ count: 12, dimensions: { date: day, model: '@cf/a', provider: 'workers-ai' }, sum: { cachedRequests: 3, erroredRequests: 1, cost: 0.5 } },
      { count: 2, dimensions: { date: day, model: 'gpt-x', provider: 'openai' }, sum: { cachedRequests: 0, erroredRequests: 0, cost: 0.1, uncachedTokensIn: 50, uncachedTokensOut: 5 } }],
    calls: [{ runId: 'run-aaaaaaaa1', inputTokens: 500, outputTokens: 50, cachedInputTokens: 400, neurons: 1000, at: now - 1000, model: '@cf/a', feature: 'apple-max:x', outcome: 'ok' },
      { runId: 'run-aaaaaaaa1', inputTokens: 100, outputTokens: 10, neurons: 200, at: now, outcome: 'error' }],
    a: { tokens: { cacheHit: 0.8, input: 600, cached: 480 }, spend: { dayNeurons: 20000, monthNeurons: 50000, monthUsd: 1, maxMonthlyUsd: 19.8, limits: { billablePerMonth: 1800000 } } },
  });
  assert.equal(out.totals.requests, 12);
  assert.equal(out.totals.tokensIn, 1050);
  assert.equal(out.totals.neurons, 20000);
  assert.ok(Math.abs(out.totals.usd - 0.11) < 1e-9, '10,000 billable neurons = $0.11');
  assert.ok(Math.abs(out.totals.gwUsd - 0.6) < 1e-9);
  assert.equal(out.cache.gateway.cached, 3);
  assert.equal(out.cache.prompt, 0.8);
  assert.equal(out.byDay.length, 30);
  assert.equal(out.byDay.at(-1).m0, 1100);
  assert.equal(out.runs.length, 1);
  assert.deepEqual([out.runs[0].calls, out.runs[0].failed, out.runs[0].tokensIn], [2, 1, 600]);
  assert.deepEqual(out.runs[0].features, ['apple-max']);
  assert.equal(out.projection.month, '2026-09');
  assert.ok(Math.abs(out.projection.projectedUsd - (0.11 / 10) * 30) < 1e-9);
  assert.equal(out.headroom.find((h) => h.k === 'neurons-day').frac, 2);
  assert.deepEqual(out.providers.map((p) => p.id), ['workers-ai', 'openai']);
});

test('costs derive on nothing: zeros, no crash, no invented numbers', () => {
  const out = costs.derive({});
  assert.equal(out.totals.requests, 0);
  assert.equal(out.cache.gateway, null);
  assert.equal(out.cache.prompt, null);
  assert.equal(out.projection.workerMonthUsd, null);
});

test('business derive: masks emails, builds the funnel from real rows, flags read-only state', () => {
  const now = Date.UTC(2026, 8, 20);
  const users = [
    { id: '11111111-1111-1111-1111-111111111111', email: 'owner@example.com', created_at: '2026-09-19T10:00:00Z', last_sign_in_at: '2026-09-19T11:00:00Z', confirmed: true, plan: 'enterprise', is_admin: true, projects: 2 },
    { id: '22222222-2222-2222-2222-222222222222', email: 'load-test-1@golem.internal', created_at: '2026-09-01T10:00:00Z', last_sign_in_at: null, confirmed: false, plan: 'free', is_admin: false, projects: 0 },
  ];
  const out = business.derive({ users, now, builds: [{ actorId: users[0].id }, { actorId: users[0].id }],
    a: { spend: { killed: false }, billing: { keyMode: 'test', production: true, webhook: true }, routing: [{ id: 'm', label: 'M', provider: 'workers-ai', available: true }] },
    audit: [{ action: 'GET /api/admin/logs', actorKind: 'admin', allowed: true, at: now }, { action: 'POST /api/admin/kill', actorKind: 'admin', allowed: false, at: now - 1 }] });
  const json = JSON.stringify(out);
  assert.doesNotMatch(json, /owner@example\.com|load-test-1@/, 'no full email leaves derive()');
  assert.equal(out.users.list[0].email, 'o***@example.com');
  assert.equal(out.users.total, 2);
  assert.equal(out.users.test, 1);
  assert.deepEqual(out.funnel.map((s) => s.n), [2, 1, 1, 1, 1]);
  assert.equal(out.users.signups.at(-2).n, 1);
  assert.equal(out.flags.find((f) => f.k === 'kill').on, false);
  assert.equal(out.flags.find((f) => f.k === 'keymode').tone, 'warn');
  assert.equal(out.audit.total, 2);
  assert.equal(out.audit.refused, 1);
  assert.equal(business.derive({}).users, null, 'no users source -> null, not zero');
});
