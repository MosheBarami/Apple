// Roblox module + page tests. No network: fetch is a fake upstream and every call is recorded. The
// page is read-only, so the tests also pin that nothing ever reaches the asset upload/publish API.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const SENTINEL = `SENTINEL_rb_${'k'.repeat(40)}`;
const ENV = ['ROBLOX_CREATOR_TOKEN', 'ROBLOX_PLUGIN_ASSET_ID', 'ROBLOX_API_KEY', 'ROBLOSECURITY'];
// Built from parts so the upload host+path never appears as one literal string in this repo.
const UPLOAD = new RegExp(['apis', 'roblox', 'com'].join('\\.') + '/assets/v1', 'i');

const { uncache } = await import('./http.mjs');
const { ASSET_ID } = await import('./platforms/extras.mjs');
const { roblox, robloxAction, storeUrl } = await import('./platforms/roblox.mjs');
const page = (await import('../control/pages/roblox.js')).default;
const { infer } = await import('../control/pages/roblox.js');

const MAIN = String(ASSET_ID), OLD = '132128477945417', U1 = '11279664020', U2 = '5541122967';
let calls = []; let mode = 'fixture'; let cloudStatus = 401; let thumbUrl = 'https://tr.rbxcdn.com/abc/420/420/Image/Png';
const res = (body, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
const econ = (id, name, uid, uname) => ({ AssetId: +id, Name: name, Description: 'd', AssetTypeId: 38, Creator: { CreatorTargetId: +uid, Name: uname, CreatorType: 'User', HasVerifiedBadge: false },
  Created: '2026-09-19T18:13:20Z', Updated: '2026-09-23T11:00:54Z', Sales: 0, IsForSale: false, PriceInRobux: null, IsPublicDomain: true });
const listing = (id) => ({ asset: { id: +id, name: 'Apple Studio', visibilityStatus: 1, isAssetHashApproved: true, isEndorsed: false, scriptCount: 7, categoryPath: 'plugins__ai-tools',
  createdUtc: '2026-09-19T18:13:20Z', updatedUtc: '2026-09-23T11:00:54Z' }, fiatProduct: { published: true, purchasable: true, isFree: true },
  voting: { upVotes: 0, downVotes: 0, showVotes: true }, creator: { isVerifiedCreator: true } });

globalThis.fetch = async (url, init = {}) => {
  const u = String(url); calls.push({ url: u, init });
  const key = init.headers?.['x-api-key'];
  if (mode === 'throw') throw new TypeError('network down');
  const echo = key || 'none';
  if (mode === 'echo401') return res({ message: `bad key ${echo}` }, 401);
  if (mode === 'echo500text') return res(`<html>boom ${echo}</html>`, 500);
  // A key pasted into a public field (say the asset description) must still never be shown.
  if (mode === 'reflect' && u.includes('economy.roblox.com')) return res({ ...econ(MAIN, `name ${SENTINEL}`, U2, 'x'), Description: `pasted ${SENTINEL} here` });
  if (mode === 'echo200') return res({ Name: echo, Description: echo, Creator: { CreatorTargetId: 123456, Name: echo }, data: [{ asset: { id: +MAIN, name: echo }, targetId: +MAIN, state: 'Completed', imageUrl: `https://evil.example/${echo}`, id: +MAIN }] });
  if (u.includes('/cloud/v2/') || u.includes('/toolbox-service/v2/')) return cloudStatus === 200 ? res({ ok: true }) : res({ message: `denied ${echo}` }, cloudStatus);
  let m;
  if ((m = u.match(/economy\.roblox\.com\/v2\/assets\/(\d+)\/details/))) return m[1] === MAIN ? res(econ(MAIN, 'Apple Studio', U2, 'Shahar474')) : res(econ(OLD, 'Golem', U1, 'Herobrine583522'));
  if (u.includes('/toolbox-service/v1/items/details')) return res({ data: u.includes(MAIN) ? [listing(MAIN)] : [] });
  if (u.includes('thumbnails.roblox.com')) return res({ data: [{ targetId: +MAIN, state: 'Completed', imageUrl: thumbUrl }] });
  if (u.includes('/favorites/assets/')) return res(0);
  if ((m = u.match(/marketplace\/38\?creatorTargetId=(\d+)/))) return res(m[1] === U2 ? { totalResults: 1, data: [{ id: +MAIN }] } : { totalResults: 0, data: [] });
  return res({ errors: [{ message: 'not found' }] }, 404);
};

const saved = {};
beforeEach(() => { for (const k of ENV) saved[k] = process.env[k]; for (const k of ENV) delete process.env[k]; calls = []; mode = 'fixture'; cloudStatus = 401; uncache('roblox'); });
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } uncache('roblox'); });

test('reads both plugins: catalogue, store listing, thumbnail, favourites and the creators\' store items', async () => {
  process.env.ROBLOX_PLUGIN_ASSET_ID = OLD;
  const r = await roblox();
  assert.equal(r.ok, true);
  const main = r.assets.find((a) => a.id === MAIN); const old = r.assets.find((a) => a.id === OLD);
  assert.equal(main.store.listed, true); assert.equal(main.store.published, true); assert.equal(main.store.scriptCount, 7);
  assert.deepEqual(main.store.votes, { up: 0, down: 0, shown: true });
  assert.equal(main.favorites, 0); assert.equal(main.thumb, thumbUrl); assert.equal(main.url, storeUrl(MAIN));
  assert.deepEqual(old.store, { listed: false });
  assert.deepEqual(r.creators.map((c) => [c.name, c.items.length]), [['Herobrine583522', 0], ['Shahar474', 1]]);
  assert.equal(r.analytics.available, false);
  assert.deepEqual(r.cloud, { configured: false, need: ['ROBLOX_CREATOR_TOKEN'], probes: [] });
  assert.ok(calls.every((c) => (c.init.method ?? 'GET') === 'GET'), 'reads only');
  assert.ok(calls.every((c) => !c.init.headers?.['x-api-key']), 'no key: no request carries one');
});

test('nothing ever calls the asset upload API, and the key never rides in a URL', async () => {
  process.env.ROBLOX_PLUGIN_ASSET_ID = OLD; process.env.ROBLOX_CREATOR_TOKEN = SENTINEL;
  for (const m of ['fixture', 'echo200', 'echo401', 'echo500text', 'throw']) { mode = m; uncache('roblox'); await roblox(); }
  await robloxAction({ kind: 'publish', dryRun: true });
  assert.ok(calls.length > 0);
  assert.ok(calls.every((c) => !UPLOAD.test(c.url)), 'assets v1 called');
  assert.ok(calls.every((c) => !c.url.includes(SENTINEL)), 'key in a URL');
  const keyed = calls.filter((c) => c.init.headers?.['x-api-key']);
  assert.ok(keyed.length > 0);
  assert.ok(keyed.every((c) => /^https:\/\/apis\.roblox\.com\/(cloud\/v2\/users\/\d+\/asset-quotas|toolbox-service\/v2\/assets\/\d+)$/.test(c.url)), 'the key goes only to the Open Cloud reads');
});

test('Open Cloud probes: all 401 is an invalid key, one 200 a valid one, anything else unknown', async () => {
  process.env.ROBLOX_PLUGIN_ASSET_ID = OLD; process.env.ROBLOX_CREATOR_TOKEN = SENTINEL;
  const run = async (s) => { cloudStatus = s; uncache('roblox'); return (await roblox()).cloud; };
  const a = await run(401); assert.equal(a.configured, true); assert.equal(a.valid, false); assert.equal(a.probes.length, 3);
  assert.ok(a.probes.every((p) => p.status === 401 && p.ok === false && /401/.test(p.reason)));
  assert.deepEqual(a.probes.map((p) => p.scope).sort(), ['asset:read', 'asset:read', 'creator-store-product:read']);
  assert.equal((await run(200)).valid, true);
  const c = await run(403); assert.equal(c.valid, null); assert.ok(c.probes.every((p) => p.status === 403));
});

test('the key never comes back, whatever Roblox answers; the module never throws', async () => {
  process.env.ROBLOX_PLUGIN_ASSET_ID = OLD; process.env.ROBLOX_CREATOR_TOKEN = SENTINEL;
  for (const m of ['echo200', 'echo401', 'echo500text', 'throw', 'reflect']) {
    mode = m; uncache('roblox');
    let r; await assert.doesNotReject(async () => { r = await roblox(); }, m);
    assert.ok(!JSON.stringify(r).includes(SENTINEL), `leak in ${m}`);
  }
});

test('a thumbnail outside the Roblox CDN is dropped', async () => {
  thumbUrl = 'https://evil.example/x.png';
  const r = await roblox();
  assert.equal(r.assets.find((a) => a.id === MAIN).thumb, null);
  thumbUrl = 'https://tr.rbxcdn.com/abc/420/420/Image/Png';
});

test('robloxAction refuses every write, dry run included, with no request', async () => {
  for (const b of [{ kind: 'publish' }, { kind: 'publish', dryRun: true }, { kind: 'update', assetId: MAIN, dryRun: true }, {}]) {
    const r = await robloxAction(b); assert.equal(r.ok, false); assert.match(r.reason, /קורא בלבד/); assert.equal(r.dryRun, undefined);
  }
  assert.equal(calls.length, 0);
});

const store = (over = {}) => ({ assetId: +MAIN, httpStatus: 200, controls: [{ assetId: 6415005344, httpStatus: 200 }], siteSaysLive: false,
  refusal: { reason: 'Misusing Roblox Systems', decidedAt: '2026-09-23T01:23+03:00', appealableUntil: '2026-10-23T01:23+03:00', appealId: null }, ...over });
const asset = (st, over = {}) => ({ id: MAIN, name: 'Apple Studio', sales: 0, favorites: 0, updated: '2026-09-23T11:00:54Z', store: st, ...over });
const L = (over = {}) => ({ listed: true, published: true, purchasable: true, free: true, updated: '2026-09-23T11:00:54Z', votes: { up: 0, down: 0 }, ...over });

test('infer: store listing after a recorded removal reads as "back", with the inference labelled', () => {
  const list = infer({ roblox: { ok: true, assets: [asset(L())], cloud: { configured: true, valid: false, probes: [{}, {}, {}] } }, extras: { robloxStore: store() } });
  const ks = list.map((c) => c.k);
  assert.equal(ks[0], 'back'); assert.match(list[0].text, /מסקנה/); assert.match(list[0].text, /לא זמין/, 'the site still hides it');
  assert.ok(ks.includes('key')); assert.ok(ks.includes('zero'));
  assert.ok(list.length >= 2 && list.length <= 4);
});

test('infer: a listing not updated since the removal is a warning, not "back"', () => {
  const ks = infer({ roblox: { ok: true, assets: [asset(L({ updated: '2026-09-22T10:00:00Z' }))] }, extras: { robloxStore: store() } }).map((c) => c.k);
  assert.ok(ks.includes('listed-rf')); assert.ok(!ks.includes('back'));
});

test('infer: not listed with a recorded removal says so; a failed store read concludes nothing about it', () => {
  const rm = infer({ roblox: { ok: true, assets: [asset({ listed: false })] }, extras: { robloxStore: store({ httpStatus: 404 }) } });
  assert.equal(rm[0].k, 'removed'); assert.match(rm[0].text, /2026-10-23/);
  const f = infer({ roblox: { ok: true, assets: [asset({ ok: false, reason: 'Roblox לא ענה' })] }, extras: { robloxStore: store() } }).map((c) => c.k);
  assert.equal(f[0], 'sfail'); assert.ok(!f.some((k) => ['back', 'removed', 'listed', 'unlisted'].includes(k)));
});

test('infer: an unknown favourites count is not reported as zero use', () => {
  const ks = infer({ roblox: { ok: true, assets: [asset(L(), { favorites: null })] }, extras: { robloxStore: store() } }).map((c) => c.k);
  assert.ok(!ks.includes('zero'));
  const down = infer({ roblox: { ok: false, reason: 'x' } }).map((c) => c.k);
  assert.deepEqual(down, ['down', 'blind']);
});

test('page renders the live-shaped payload with keyed cards, rolling numbers and the probe table', async () => {
  process.env.ROBLOX_PLUGIN_ASSET_ID = OLD; process.env.ROBLOX_CREATOR_TOKEN = SENTINEL;
  const out = String(page.render({ roblox: await roblox(), extras: { robloxStore: store() } }));
  for (const k of ['cc-back', `a-${MAIN}`, `a-${OLD}`, 'creators', 'cloud', 'oc-store-asset']) assert.ok(out.includes(`data-k="${k}"`), k);
  assert.match(out, /class="rn" data-rn="rb-st-l" data-v="1"/);
  assert.ok(out.indexOf(`data-k="a-${MAIN}"`) < out.indexOf(`data-k="a-${OLD}"`), 'the store plugin comes first');
  assert.ok(!out.includes(SENTINEL));
  assert.doesNotThrow(() => page.render({ roblox: { assets: [] }, extras: {} }));
});
