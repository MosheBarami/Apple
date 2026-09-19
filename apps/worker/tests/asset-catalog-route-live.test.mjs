// The catalogue browse is a read-only authenticated route, executed against real Hono and SQLite.
// A source assertion cannot prove that auth wraps the route, that FTS returns the pending rows, or
// that a browse stayed off Workers AI/Vectorize. This fixture exercises those boundaries directly.
import test, { beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { DatabaseSync } from 'node:sqlite';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const ROUTE_OUT = join(tmpdir(), `apple-asset-catalog-route-${process.pid}.mjs`);
const LIB_OUT = join(tmpdir(), `apple-asset-catalog-library-${process.pid}.mjs`);

const stubBoundaries = {
  name: 'stub-boundaries',
  setup(build) {
    build.onResolve({ filter: /^\.\/auth$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'auth.mjs')).href, external: true }));
    build.onResolve({ filter: /^\.\/supa$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'supa.mjs')).href, external: true }));
    build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: join(HERE, 'stubs', 'cloudflare-workers.mjs') }));
  },
};

await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'index.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: ROUTE_OUT,
  plugins: [stubBoundaries],
});
await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'asset-library.ts')],
  bundle: true, format: 'esm', target: 'es2022', platform: 'node', outfile: LIB_OUT,
});
const app = (await import(`file://${ROUTE_OUT}`)).default;
const L = await import(`file://${LIB_OUT}`);
process.on('exit', () => {
  rmSync(ROUTE_OUT, { force: true });
  rmSync(LIB_OUT, { force: true });
});

function realD1() {
  const db = new DatabaseSync(':memory:');
  const statement = (sql, params) => db.prepare(sql).run(...params);
  const CORPUS = {
    async exec(sql) { db.exec(sql); return { count: 1, duration: 0 }; },
    prepare(sql) {
      const make = (params) => ({
        sql,
        params,
        bind: (...next) => make(next),
        async all() { return { results: db.prepare(sql).all(...params), success: true, meta: {} }; },
        async first() { const row = db.prepare(sql).get(...params); return row === undefined ? null : row; },
        async run() { const result = statement(sql, params); return { success: true, meta: { changes: Number(result.changes) } }; },
      });
      return make([]);
    },
    async batch(statements) {
      db.exec('begin');
      try {
        for (const item of statements) statement(item.sql, item.params);
        db.exec('commit');
      } catch (error) {
        db.exec('rollback');
        throw error;
      }
      return statements.map(() => ({ success: true, meta: {} }));
    },
  };
  return { CORPUS, readOnly: () => db.exec('PRAGMA query_only = ON'), close: () => db.close() };
}

const CURATED = {
  id: 'kenney/survival-kit/wooden-crate',
  name: 'Wooden Crate',
  kind: 'prop',
  source: 'kenney',
  sourceUrl: 'https://kenney.nl/assets/survival-kit',
  licence: 'Creative Commons Zero, CC0',
  licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  commercialUse: true,
  attributionRequired: false,
  author: 'Kenney',
  retrievedAt: '2026-09-01T00:00:00.000Z',
  tags: ['crate', 'prop', 'survival'],
  robloxAssetId: null,
  triangles: null,
  textureResolution: null,
  boundsStuds: null,
  sha256: null,
};
// Named INSERTABLE because it carries a real Roblox id, which is what this file tests. Its
// `availability` is `needs_take`, not `insertable`: measured in Studio 2026-09-19, LoadAsset on a
// creator_store id answers "User is not authorized" while an owned id answers OK. Free on the
// Creator Store is free to TAKE, not free to LOAD. The fixture keeps its name — it is about
// having an id — and the expectations below say the true word.
const INSERTABLE = {
  ...CURATED,
  id: 'creator_store/props/9182736455',
  name: 'Creator Store crate',
  source: 'creator_store',
  sourceUrl: 'https://create.roblox.com/store/asset/9182736455',
  licence: 'Roblox Terms of Use — Open Use, free on the Creator Store',
  licenceUrl: 'https://create.roblox.com/docs/production/publishing/asset-permissions',
  author: 'someuploader',
  robloxAssetId: 9182736455,
  triangles: 432,
  boundsStuds: [2, 3, 4],
};

const calls = { ai: 0, vec: 0 };
const thumbnailRequests = [];
const unexpectedRequests = [];
let thumbnailResponse;
beforeEach(() => {
  calls.ai = calls.vec = 0;
  thumbnailRequests.length = unexpectedRequests.length = 0;
  thumbnailResponse = undefined;
  mock.method(globalThis, 'fetch', async (input, init) => {
    thumbnailRequests.push({ input, init });
    if (!thumbnailResponse) {
      unexpectedRequests.push(String(input));
      throw new Error('unexpected external request');
    }
    return thumbnailResponse(input, init);
  });
});
afterEach(() => {
  mock.restoreAll();
  assert.deepEqual(unexpectedRequests, [], 'default/auth/validation paths must never make an external request');
  assert.equal(calls.ai, 0, 'catalogue browsing must not call AI');
  assert.equal(calls.vec, 0, 'catalogue browsing must not call Vectorize');
});
const ctx = { waitUntil() {}, passThroughOnException() {} };
function envFor(db) {
  const corpus = {
    ...db.CORPUS,
    prepare(sql) {
      if (/^\s*(?:insert|update|delete|replace|create|alter|drop|vacuum|reindex)\b/i.test(sql)) {
        throw new Error(`catalogue route attempted a D1 write: ${sql}`);
      }
      return db.CORPUS.prepare(sql);
    },
    async exec(sql) { throw new Error(`catalogue route attempted D1 exec: ${sql}`); },
    async batch() { throw new Error('catalogue route attempted a D1 batch'); },
  };
  return {
    CORPUS: corpus,
    AI: { run() { calls.ai += 1; throw new Error('catalogue browse called Workers AI'); } },
    VEC: { query() { calls.vec += 1; throw new Error('catalogue browse called Vectorize'); } },
    VEC_ASSETS: { query() { calls.vec += 1; throw new Error('catalogue browse called asset Vectorize'); } },
    KV: { async get() { return null; }, async put() {}, async delete() {}, async list() { return { keys: [], list_complete: true }; } },
    SESSION_DO: { idFromName: (name) => name, get: () => ({ async fetch() { return new Response('{}'); } }) },
  };
}
const auth = (token = 'alice') => ({ headers: { Authorization: `Bearer ${token}` } });
const url = (query) => `https://x/api/assets/search${query ? `?${query}` : ''}`;

async function seeded({ extra = [], mutate } = {}) {
  L.resetAssetSchemaCache();
  const db = realD1();
  await L.ensureAssetTables(db);
  assert.deepEqual((await L.upsertAssets(db, [CURATED], { seed: true })).rejected, []);
  assert.deepEqual((await L.upsertAssets(db, [INSERTABLE])).rejected, []);
  if (extra.length) assert.deepEqual((await L.upsertAssets(db, extra)).rejected, []);
  if (mutate) await mutate(db);
  // Make writes fail at the actual SQLite boundary after fixture setup, not by inspecting SQL text.
  db.readOnly();
  return db;
}

test('catalogue fixture rejects attempted writes after setup', async () => {
  const db = await seeded();
  try {
    await assert.rejects(db.CORPUS.prepare('delete from asset_library').run(), /readonly/i);
  } finally { db.close(); }
});

test('catalogue search is authenticated and empty search is a read-only empty state', async () => {
  const db = await seeded();
  try {
    assert.equal((await app.request(url('query=crate'), {}, envFor(db), ctx)).status, 401);
    const empty = await app.request(url('query='), auth(), envFor(db), ctx);
    assert.equal(empty.status, 200);
    assert.deepEqual(await empty.json(), { assets: [] });
    assert.equal(calls.ai, 0);
    assert.equal(calls.vec, 0);
  } finally { db.close(); }
});

test('catalogue query, kind, limit, and insertableOnly validation fail closed', async () => {
  const db = await seeded();
  try {
    const cases = [
      ['kind=not-a-kind&query=crate', /kind must be one of/],
      ['query=crate&limit=0', /limit must be an integer/],
      ['query=crate&limit=21', /limit must be an integer/],
      ['query=crate&limit=1.5', /limit must be an integer/],
      ['query=crate&insertableOnly=yes', /insertableOnly must be true or false/],
      ...['', '1', '0', 'yes', 'TRUE', 'null', 'false&previews=true', 'true&previews=true'].map((value) =>
        [`query=crate&previews=${value}`, /previews must be true or false/]),
      [`query=${'x'.repeat(121)}`, /query must be at most 120/],
    ];
    for (const [params, message] of cases) {
      const res = await app.request(url(params), auth(), envFor(db), ctx);
      assert.equal(res.status, 400, params);
      assert.match((await res.json()).error, message, params);
    }
    assert.equal(calls.ai, 0);
    assert.equal(calls.vec, 0);
  } finally { db.close(); }
});

test('authenticated catalogue returns real provenance fields and availability without model calls', async () => {
  const db = await seeded();
  try {
    const res = await app.request(url('query=crate&kind=prop&limit=20'), auth(), envFor(db), ctx);
    const raw = await res.text();
    assert.equal(res.status, 200, raw);
    const body = JSON.parse(raw);
    assert.equal(body.assets.length, 2);
    assert.deepEqual(Object.keys(body.assets[0]).sort(), [
      'attributionRequired', 'author', 'availability', 'boundsStuds', 'id', 'kind', 'licence', 'name', 'robloxAssetId', 'source', 'sourceUrl', 'tags', 'triangles',
    ].sort());
    const curated = body.assets.find((asset) => asset.id === CURATED.id);
    const insertable = body.assets.find((asset) => asset.id === INSERTABLE.id);
    assert.deepEqual(curated, {
      id: CURATED.id,
      name: CURATED.name,
      kind: CURATED.kind,
      source: CURATED.source,
      sourceUrl: CURATED.sourceUrl,
      author: CURATED.author,
      licence: CURATED.licence,
      attributionRequired: false,
      robloxAssetId: null,
      availability: 'needs_import',
      tags: CURATED.tags,
      triangles: null,
      boundsStuds: null,
    });
    assert.equal(insertable.robloxAssetId, INSERTABLE.robloxAssetId);
    assert.equal(insertable.availability, 'needs_take');
    assert.deepEqual(insertable.tags, INSERTABLE.tags);
    assert.equal(insertable.triangles, 432);
    assert.deepEqual(insertable.boundsStuds, [2, 3, 4]);
    assert.equal(calls.ai, 0, 'lexical catalogue search must not invoke Workers AI');
    assert.equal(calls.vec, 0, 'lexical catalogue search must not invoke Vectorize');
  } finally { db.close(); }
});

test('insertableOnly=true narrows catalogue results by recorded Roblox id, not status', async () => {
  const db = await seeded();
  try {
    const res = await app.request(url('query=crate&insertableOnly=true'), auth(), envFor(db), ctx);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.assets.map((asset) => asset.id), [INSERTABLE.id]);
    assert.equal(body.assets[0].availability, 'needs_take');
  } finally { db.close(); }
});

test('previews are opt-in: false, empty/no-match searches, rejected requests and unauthenticated callers do not fetch', async () => {
  const db = await seeded();
  try {
    for (const params of ['query=crate', 'query=crate&previews=false', 'query=&previews=true', 'query=unfindablezxy&previews=true']) {
      const res = await app.request(url(params), auth(), envFor(db), ctx);
      assert.equal(res.status, 200);
      const { assets } = await res.json();
      if (!params.includes('previews=true')) assert.ok(assets.every((hit) => !Object.hasOwn(hit, 'preview')));
    }
    assert.equal((await app.request(url('query=crate&previews=true'), {}, envFor(db), ctx)).status, 401);
    assert.equal((await app.request(url('query=crate&previews=true&limit=21'), auth(), envFor(db), ctx)).status, 400);
    assert.equal(thumbnailRequests.length, 0);
  } finally { db.close(); }
});

const READY_URL = 'https://tr.rbxcdn.com/test-crate/150/150/Model/Png/noFilter';
const unavailable = { state: 'unavailable', url: null };
const thumbnailRow = (targetId, state = 'Completed', imageUrl = READY_URL) => ({ targetId, state, imageUrl, version: 'TN3' });
const thumbnailJson = (data) => new Response(JSON.stringify({ data }), { headers: { 'Content-Type': 'application/json' } });

test('opted-in real route batches recorded ids and never forwards caller credentials or changes provenance', async () => {
  const db = await seeded();
  thumbnailResponse = () => thumbnailJson([thumbnailRow(INSERTABLE.robloxAssetId)]);
  try {
    const res = await app.request(url('query=crate&previews=true'), {
      headers: { Authorization: 'Bearer alice', Cookie: 'golem_session=private-cookie', 'X-Roblox-Api-Key': 'private-key' },
    }, envFor(db), ctx);
    assert.equal(res.status, 200);
    const { assets } = await res.json();
    assert.equal(assets.length, 2);
    const ready = assets.find((hit) => hit.id === INSERTABLE.id);
    assert.deepEqual(ready.preview, { state: 'ready', url: READY_URL });
    assert.equal(ready.sourceUrl, INSERTABLE.sourceUrl);
    assert.equal(ready.licence, INSERTABLE.licence);
    assert.equal(ready.availability, 'needs_take');
    assert.deepEqual(assets.find((hit) => hit.id === CURATED.id).preview, unavailable);
    assert.equal(thumbnailRequests.length, 1);
    const { input, init } = thumbnailRequests[0];
    const endpoint = new URL(input);
    assert.equal(endpoint.origin + endpoint.pathname, 'https://thumbnails.roblox.com/v1/assets');
    assert.equal(endpoint.searchParams.get('assetIds'), String(INSERTABLE.robloxAssetId));
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'error');
    assert.equal(init.method, 'GET');
    assert.ok(init.signal instanceof AbortSignal);
    const headers = new Headers(init.headers);
    for (const key of ['authorization', 'cookie', 'x-roblox-api-key']) assert.equal(headers.get(key), null);
    assert.ok(!JSON.stringify(thumbnailRequests).includes('private-'));
  } finally { db.close(); }
});

test('opted-in route preserves pending/blocked, and uses unavailable for missing, unsupported, invalid and error results', async () => {
  const db = await seeded();
  try {
    const cases = [
      [[thumbnailRow(INSERTABLE.robloxAssetId, 'Pending')], { state: 'pending', url: null }],
      [[thumbnailRow(INSERTABLE.robloxAssetId, 'InReview', null)], { state: 'pending', url: null }],
      [[thumbnailRow(INSERTABLE.robloxAssetId, 'Blocked')], { state: 'blocked', url: null }],
      [[thumbnailRow(INSERTABLE.robloxAssetId, 'Error')], unavailable],
      [[thumbnailRow(INSERTABLE.robloxAssetId, 'TemporarilyUnavailable')], unavailable],
      [[thumbnailRow(INSERTABLE.robloxAssetId, 'Completed', 'https://evil.example/crate.png')], unavailable],
      [[thumbnailRow(123)], unavailable],
      [[thumbnailRow(INSERTABLE.robloxAssetId), thumbnailRow(INSERTABLE.robloxAssetId)], unavailable],
      [[], unavailable],
    ];
    for (const [data, expected] of cases) {
      thumbnailResponse = () => thumbnailJson(data);
      const res = await app.request(url('query=crate&previews=true'), auth(), envFor(db), ctx);
      assert.equal(res.status, 200);
      const { assets } = await res.json();
      assert.deepEqual(assets.find((hit) => hit.id === INSERTABLE.id).preview, expected);
      assert.deepEqual(assets.find((hit) => hit.id === CURATED.id).preview, unavailable);
    }
    for (const failure of [
      () => { throw new Error('offline private-provider-detail'); },
      () => new Response('private error', { status: 503 }),
      () => new Response('{invalid-json', { headers: { 'Content-Type': 'application/json' } }),
    ]) {
      thumbnailResponse = failure;
      const res = await app.request(url('query=crate&previews=true'), auth(), envFor(db), ctx);
      assert.equal(res.status, 200, 'thumbnail failure must not turn successful search into failure');
      const body = await res.json();
      assert.ok(body.assets.every((hit) => JSON.stringify(hit.preview) === JSON.stringify(unavailable)));
      assert.ok(!JSON.stringify(body).includes('private'));
    }
  } finally { db.close(); }
});

test('real FTS route sanitizes untrusted metadata on all searches without changing stored rows', async () => {
  const dirtyTags = ['  crate  ', 'crate', '', null, 123, '<rough>\u0000\u202estone', 'x'.repeat(500), ...Array.from({ length: 30 }, (_, i) => `tag-${i}`)];
  const db = await seeded({ mutate: async (db) => {
    await db.CORPUS.prepare('update asset_library set tags=?, triangles=?, bounds_studs=? where id=?')
      .bind(JSON.stringify(dirtyTags), Infinity, '[1e999,2,3]', INSERTABLE.id).run();
  } });
  try {
    for (const previews of ['false', 'true']) {
      thumbnailResponse = () => thumbnailJson([]);
      const res = await app.request(url(`query=crate&previews=${previews}`), auth(), envFor(db), ctx);
      assert.equal(res.status, 200);
      const hit = (await res.json()).assets.find((hit) => hit.id === INSERTABLE.id);
      assert.ok(Array.isArray(hit.tags));
      assert.ok(hit.tags.includes('crate'));
      assert.ok(hit.tags.length <= 12);
      assert.equal(new Set(hit.tags).size, hit.tags.length);
      assert.ok(hit.tags.every((tag) => typeof tag === 'string' && tag.length > 0 && tag.length <= 48 && !/[<>\p{Cc}\p{Cf}]/u.test(tag)));
      assert.equal(hit.triangles, null);
      assert.equal(hit.boundsStuds, null);
    }
    assert.equal((await db.CORPUS.prepare('select tags from asset_library where id=?').bind(INSERTABLE.id).first()).tags, JSON.stringify(dirtyTags));
  } finally { db.close(); }
});

test('catalogue still reports absent FTS tables as unavailable rather than fabricating an empty library', async () => {
  const db = realD1();
  db.readOnly();
  try {
    const res = await app.request(url('query=crate&previews=true'), auth(), envFor(db), ctx);
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: 'asset catalogue is unavailable', assets: [] });
    assert.equal(thumbnailRequests.length, 0);
  } finally { db.close(); }
});

test('real route enforces the 20-result batch cap and joins thumbnails by targetId instead of position', async () => {
  const extra = Array.from({ length: 24 }, (_, i) => ({
    ...INSERTABLE, id: `creator_store/props/${10000 + i}`, name: `Crate choice ${i}`,
    robloxAssetId: 10000 + i, sourceUrl: `https://create.roblox.com/store/asset/${10000 + i}`,
  }));
  const db = await seeded({ extra });
  const image = (id) => `https://tr.rbxcdn.com/asset-${id}/150/150/Model/Png`;
  thumbnailResponse = (input) => {
    const ids = new URL(input).searchParams.get('assetIds').split(',').map(Number);
    assert.equal(ids.length, 20);
    assert.equal(new Set(ids).size, 20);
    return thumbnailJson(ids.reverse().map((id) => thumbnailRow(id, 'Completed', image(id))));
  };
  try {
    const res = await app.request(url('query=crate&insertableOnly=true&previews=true&limit=20'), auth(), envFor(db), ctx);
    assert.equal(res.status, 200);
    const { assets } = await res.json();
    assert.equal(assets.length, 20);
    assert.equal(thumbnailRequests.length, 1);
    for (const hit of assets) assert.deepEqual(hit.preview, { state: 'ready', url: image(hit.robloxAssetId) });
  } finally { db.close(); }
});

test('opted-in search with only non-Roblox assets is explicitly unavailable without a request', async () => {
  const db = await seeded();
  try {
    const res = await app.request(url('query=wooden&previews=true'), auth(), envFor(db), ctx);
    assert.equal(res.status, 200);
    const { assets } = await res.json();
    assert.equal(assets.length, 1);
    assert.equal(assets[0].id, CURATED.id);
    assert.deepEqual(assets[0].preview, unavailable);
    assert.equal(thumbnailRequests.length, 0);
  } finally { db.close(); }
});
