/**
 * THE LIVE CREATOR STORE SEARCH: ORDINARY NOUNS FIND REAL, SAFE MODELS (creator-store-live.ts).
 *
 * Before this, find_library_model answered from a bundle of ~640 rows ("crystal" matched a sword, "cave entrance" nothing) and the
 * agent built from plain Parts. The fixtures below are shaped exactly like what
 * `GET toolbox-service/v2/assets:search?searchView=Full` returned on 2026-10-04, so nothing here reaches the network.
 *
 * What is pinned:
 *   - the gate fails closed: not free, unverified creator, any script, an unreported script count, a package/ad/material pack,
 *     a Tool, a non-3D category, too many triangles are each refused, and a Roblox-owned asset needs no verified flag;
 *   - the request is a GET with the documented parameters (free only, verified creators only, the full view), the key goes in
 *     x-api-key only when the worker holds one, and a refused key is retried without it rather than ending the search;
 *   - ranking puts a name with the requested words above a popular unrelated one, and the head noun of the request decides;
 *   - find_library_model tops up from the live store only when the context turns it on, only when the project's asset sources
 *     allow the Creator Store, and remembers the rows it returned so insert_library_model takes exactly those ids;
 *   - insert_library_model on a `cs:` id sends the plugin's insert_asset for that asset id, through the same in-place scan;
 *   - an owner-library row that matched only in a path (the javelin that answered "crystal") is held back.
 *
 * Run with:  node --test tests/creator-store-live.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = mkdtempSync(join(tmpdir(), 'creator-store-live-'));
process.on('exit', () => rmSync(DIR, { recursive: true, force: true }));

async function bundle(rel, name) {
  const out = join(DIR, `${name}.mjs`);
  await esbuild.build({
    entryPoints: [join(WORKER, 'src', rel)], bundle: true, format: 'esm', target: 'es2022', platform: 'node', outfile: out, logLevel: 'silent',
    alias: { 'cloudflare:workers': join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs') },
  });
  return import(pathToFileURL(out).href);
}
const L = await bundle('creator-store-live.ts', 'live');
const T = await bundle('tools.ts', 'tools');

/** One `creatorStoreAssets[]` entry as the live service returns it (search view Full), with overrides and omissions. */
function entry(o = {}) {
  const e = {
    voting: { showVotes: true, upVotes: 5, downVotes: 0, canVote: false, hasVoted: false, voteCount: o.votes ?? 20, upVotePercent: o.rating ?? 95 },
    creator: { creator: 'user/3940233615', userId: o.creatorId ?? 3940233615, name: o.creatorName ?? 'Hyper_verse', verified: o.verified ?? true },
    creatorStoreProduct: { purchasePrice: { currencyCode: 'USD', quantity: { significand: o.price ?? 0, exponent: 0 } }, purchasable: true },
    asset: {
      subTypes: o.subTypes ?? [], hasScripts: o.hasScripts ?? false, scriptCount: o.scriptCount ?? 0,
      objectMeshSummary: { triangles: o.triangles ?? 832, vertices: 600 },
      instanceCounts: { script: 0, meshPart: 2, animation: 0, decal: 0, audio: 0, tool: 0, ...(o.counts ?? {}) },
      capabilities: { shouldSandbox: true },
      id: o.id ?? 7416934814, name: o.name ?? 'Crystal', assetTypeId: o.typeId ?? 10, categoryPath: o.category ?? '3d__props-and-decor',
    },
  };
  for (const path of o.omit ?? []) {
    const [a, b] = path.split('.');
    if (b) delete e[a][b]; else delete e[a];
  }
  return e;
}

/** A fetch that answers from `pages[query]` (an array of entries) and records every call. */
function fakeStore(pages, { status = 200, onCall } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const u = new URL(url);
    const hit = onCall?.(u, init);
    if (hit) return hit;
    const q = u.searchParams.get('query');
    if (u.pathname.startsWith('/toolbox-service/v2/assets/') && !u.pathname.endsWith(':search')) {
      const e = pages[`id:${u.pathname.split('/').pop()}`];
      return e ? { ok: true, status: 200, json: async () => e } : { ok: false, status: 404, json: async () => ({}) };
    }
    return { ok: status === 200, status, json: async () => ({ creatorStoreAssets: pages[q] ?? [], totalResults: (pages[q] ?? []).length }) };
  };
  impl.calls = calls;
  return impl;
}

/* ------------------------------------------------------------------------------ the gate --- */

test('a clean free model from a verified creator passes and becomes a library row', () => {
  const v = L.judgeLiveModel(entry({ id: 7416934814, name: 'Crystal', category: '3d__nature' }));
  assert.equal(v.ok, true);
  assert.equal(v.model.id, 'cs:7416934814');
  assert.equal(v.model.assetId, 7416934814);
  assert.equal(v.model.kind, 'nature');
  assert.equal(v.model.licence, 'Roblox-free');
  assert.match(v.model.attribution, /Hyper_verse.*7416934814/);
});

test('every unsafe or unsuitable shape is refused, and a field Roblox does not report counts as the worst case', () => {
  const cases = [
    [{ typeId: 40 }, /not a model/],
    [{ price: 2990000000 }, /not free/],
    [{ omit: ['creatorStoreProduct'] }, /not free/],
    [{ verified: false }, /not verified/],
    [{ hasScripts: true, scriptCount: 2 }, /carries scripts/],
    [{ hasScripts: false, scriptCount: 1 }, /carries scripts/],
    [{ hasScripts: true, scriptCount: 0 }, /carries scripts/],
    [{ omit: ['asset.scriptCount'] }, /script count not reported/],
    [{ omit: ['asset.hasScripts'] }, /script count not reported/],
    [{ subTypes: ['Package'] }, /package, ad or material pack/],
    [{ subTypes: ['MaterialPack'] }, /package, ad or material pack/],
    [{ counts: { tool: 1 } }, /tool, animation or audio/],
    [{ counts: { audio: 2 } }, /tool, animation or audio/],
    [{ category: 'gameplay__utilities' }, /not a 3D category/],
    [{ category: 'visual-effects__materials-and-textures' }, /not a 3D category/],
    [{ omit: ['asset.categoryPath'] }, /not a 3D category/],
    [{ triangles: 837623 }, /too many triangles/],
    [{ name: '   ' }, /no name/],
  ];
  for (const [over, why] of cases) {
    const v = L.judgeLiveModel(entry(over));
    assert.equal(v.ok, false, JSON.stringify(over));
    assert.match(v.reason, why, JSON.stringify(over));
  }
  assert.equal(L.judgeLiveModel(null).ok, false);
  assert.equal(L.judgeLiveModel({}).ok, false);
});

test('a Roblox-owned model needs no verified flag, and a model with no mesh summary is allowed but not preferred', () => {
  const roblox = L.judgeLiveModel(entry({ creatorId: 1, verified: false, creatorName: 'Roblox' }));
  assert.equal(roblox.ok, true);
  assert.match(roblox.model.creator, /Roblox/);
  const noMesh = entry({});
  delete noMesh.asset.objectMeshSummary;
  const v = L.judgeLiveModel(noMesh);
  assert.equal(v.ok, true);
  assert.equal(v.model.triangles, null);
});

test('shouldSandbox separates nothing (it is true on essentially every model), so it does not refuse', () => {
  assert.equal(L.judgeLiveModel(entry({})).ok, true);
});

/* ------------------------------------------------------------------------------- ranking --- */

test('the request is reduced to the words that name the thing, and the queries run broad after narrow', () => {
  assert.deepEqual(L.contentWords('a low poly glowing crystal cluster'), ['glowing', 'crystal', 'cluster']);
  assert.deepEqual(L.contentWords('stylized low poly'), ['stylized', 'low', 'poly'], 'a request of only style words still searches');
  assert.deepEqual(L.liveQueries('glowing crystal cluster'), ['glowing crystal cluster', 'crystal cluster', 'cluster']);
  assert.deepEqual(L.liveQueries('crystal'), ['crystal']);
  assert.deepEqual(L.liveQueries('cave entrance'), ['cave entrance', 'entrance']);
  assert.deepEqual(L.liveQueries('   '), []);
  assert.equal(L.relevanceOf('Awesome Crystal Cluster Mesh', ['crystal', 'cluster']), 1);
  assert.equal(L.relevanceOf('Crystals', ['crystal']), 1, 'a plural meets its stem');
  assert.equal(L.relevanceOf('Crater', ['crystal']), 0);
});

test('a name with the requested words beats a popular unrelated one; votes break ties; spam and a downvoted pile sink', () => {
  const row = (o) => L.judgeLiveModel(entry(o)).model;
  const content = L.contentWords('wooden cart');
  const exact = row({ id: 1, name: 'Wooden Cart', votes: 0, rating: 0 });
  const popularUnrelated = row({ id: 2, name: 'Wooden Door', votes: 9000, rating: 99 });
  assert.ok(L.scoreLiveModel(exact, content, 5, 6) > L.scoreLiveModel(popularUnrelated, content, 0, 6));
  const loved = row({ id: 3, name: 'Wooden Cart', votes: 800, rating: 96 });
  assert.ok(L.scoreLiveModel(loved, content, 3, 6) > L.scoreLiveModel(exact, content, 3, 6));
  const spam = row({ id: 4, name: 'Wooden Cart Realistic Medieval Farm Wagon Free Model Stylized Best 2026 Update' });
  assert.ok(L.scoreLiveModel(spam, content, 3, 6) < L.scoreLiveModel(exact, content, 3, 6));
  const disliked = row({ id: 5, name: 'Wooden Cart', votes: 500, rating: 13 });
  assert.ok(L.scoreLiveModel(disliked, content, 3, 6) < L.scoreLiveModel(exact, content, 3, 6));
  const heavy = row({ id: 6, name: 'Wooden Cart', triangles: 55000 });
  assert.ok(L.scoreLiveModel(heavy, content, 3, 6) < L.scoreLiveModel(exact, content, 3, 6));
});

/* --------------------------------------------------------------------------- the request --- */

test('the search is a GET with the documented parameters, keyless unless the worker holds a key', async () => {
  const f = fakeStore({ crystal: [entry({ id: 11, name: 'Crystal' })] });
  const r = await L.searchLiveModels({}, 'crystal', { fetchImpl: f });
  assert.equal(r.endpoint, 'v2');
  assert.equal(f.calls.length, 1);
  const { url, init } = f.calls[0];
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, 'https://apis.roblox.com/toolbox-service/v2/assets:search');
  assert.equal(init.method, 'GET');
  assert.equal(init.body, undefined, 'the old POST body answers 403 XSRF');
  assert.equal(u.searchParams.get('searchCategoryType'), 'Model');
  assert.equal(u.searchParams.get('query'), 'crystal');
  assert.equal(u.searchParams.get('includeOnlyVerifiedCreators'), 'true');
  assert.equal(u.searchParams.get('maxPriceCents'), '0', 'free assets only');
  assert.equal(u.searchParams.get('searchView'), 'Full', 'the view that carries hasScripts and scriptCount');
  assert.deepEqual(u.searchParams.getAll('excludedModelSubTypes').sort(), ['Ad', 'MaterialPack', 'Package']);
  assert.equal(init.headers['x-api-key'], undefined);
  assert.equal(r.keyUsed, false);
  assert.deepEqual(r.results.map((m) => m.id), ['cs:11']);
});

test('a key is sent as x-api-key, and a key Roblox refuses is retried without it', async () => {
  const f = fakeStore({ crystal: [entry({ id: 11 })] });
  const ok = await L.searchLiveModels({ ROBLOX_API_KEY: 'secret-key' }, 'crystal', { fetchImpl: f });
  assert.equal(f.calls[0].init.headers['x-api-key'], 'secret-key');
  assert.equal(ok.keyUsed, true);
  assert.doesNotMatch(JSON.stringify(ok), /secret-key/, 'the key never appears in what the agent sees');

  const refusing = fakeStore({ crystal: [entry({ id: 12 })] }, { onCall: (_u, init) => (init.headers['x-api-key'] ? { ok: false, status: 403, json: async () => ({}) } : null) });
  const retried = await L.searchLiveModels({ ROBLOX_API_KEY: 'bad' }, 'crystal', { fetchImpl: refusing });
  assert.equal(refusing.calls.length, 2);
  assert.equal(refusing.calls[1].init.headers['x-api-key'], undefined);
  assert.equal(retried.keyUsed, false);
  assert.deepEqual(retried.results.map((m) => m.id), ['cs:12']);
});

test('results are gated, deduplicated, ranked, and say what was refused', async () => {
  const f = fakeStore({
    crystal: [
      entry({ id: 1, name: 'Crystal', votes: 0 }),
      entry({ id: 2, name: 'Crystal Pack', votes: 900, rating: 97 }),
      entry({ id: 3, name: 'Crystal', hasScripts: true, scriptCount: 3 }),
      entry({ id: 4, name: 'Crystal', verified: false }),
      entry({ id: 5, name: 'Unrelated Sword', votes: 9999, rating: 99 }),
      entry({ id: 1, name: 'Crystal', votes: 0 }),
    ],
  });
  const r = await L.searchLiveModels({}, 'crystal', { fetchImpl: f });
  assert.deepEqual(r.results.map((m) => m.id), ['cs:2', 'cs:1'], 'relevant rows only, popular and relevant first');
  assert.equal(r.refused['carries scripts'], 1);
  assert.equal(r.refused['creator not verified'], 1);
  assert.equal(r.checked, 6);
  assert.match(r.note, /refused 1 carries scripts, 1 creator not verified/);
  assert.match(r.note, /1 left out as unrelated by name/);
  assert.match(r.results[0].why, /900 votes, 97% up.*0 scripts/);
});

test('a broader query runs only while too few relevant rows have passed, and never more than three', async () => {
  const f = fakeStore({
    'glowing crystal cluster': [entry({ id: 1, name: 'Unrelated Thing' })],
    'crystal cluster': [entry({ id: 2, name: 'Crystal Cluster' })],
    cluster: [entry({ id: 3, name: 'Cluster Bomb' })],
  });
  const r = await L.searchLiveModels({}, 'glowing crystal cluster', { fetchImpl: f });
  assert.deepEqual(f.calls.map((c) => new URL(c.url).searchParams.get('query')), ['glowing crystal cluster', 'crystal cluster', 'cluster']);
  assert.equal(r.results[0].id, 'cs:2', 'the row that names the crystal cluster outranks the one found by the broadest query');

  const plenty = fakeStore({ tree: Array.from({ length: 6 }, (_, i) => entry({ id: 100 + i, name: `Tree ${i}` })) });
  await L.searchLiveModels({}, 'tree', { fetchImpl: plenty });
  assert.equal(plenty.calls.length, 1);
  const enough = fakeStore({ 'oak tree': Array.from({ length: 6 }, (_, i) => entry({ id: 200 + i, name: `Oak Tree ${i}` })), tree: [] });
  await L.searchLiveModels({}, 'oak tree', { fetchImpl: enough });
  assert.equal(enough.calls.length, 1, 'five relevant rows are enough: the next query is not worth a request');
});

test('rejected ids and a name the caller refuses are left out', async () => {
  const f = fakeStore({ gate: [entry({ id: 1, name: 'Gate' }), entry({ id: 2, name: 'Gate Key' }), entry({ id: 3, name: 'Gate' })] });
  const r = await L.searchLiveModels({}, 'gate', { fetchImpl: f, exclude: new Set([1]), accept: (n) => n === 'Gate' });
  assert.deepEqual(r.results.map((m) => m.assetId), [3]);
  assert.equal(r.refused['rejected earlier in this run'], 1);
  assert.equal(r.refused['name lacks the requested object'], 1);
});

test('an unreachable store, a 500 and a body that is not JSON each end in an explained empty answer, never a throw', async () => {
  const offline = await L.searchLiveModels({}, 'tree', { fetchImpl: async () => { throw new Error('offline'); } });
  assert.deepEqual(offline.results, []);
  assert.equal(offline.endpoint, 'none');
  assert.match(offline.error, /offline/);
  const broken = await L.searchLiveModels({}, 'tree', { fetchImpl: fakeStore({}, { status: 500 }) });
  assert.deepEqual(broken.results, []);
  assert.match(broken.error, /HTTP 500/);
  const notJson = await L.searchLiveModels({}, 'tree', { fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } }) });
  assert.deepEqual(notJson.results, []);
  assert.match(notJson.error, /Unexpected token/);
  const none = await L.searchLiveModels({}, '   ', { fetchImpl: fakeStore({}) });
  assert.deepEqual(none.results, []);
});

test('fetching one asset applies the same gate', async () => {
  const f = fakeStore({ 'id:5': entry({ id: 5, name: 'Lamp' }), 'id:6': entry({ id: 6, name: 'Lamp', hasScripts: true, scriptCount: 1 }) });
  const ok = await L.fetchLiveModel({}, 5, { fetchImpl: f });
  assert.equal(ok.ok, true);
  assert.equal(new URL(f.calls[0].url).pathname, '/toolbox-service/v2/assets/5');
  const refused = await L.fetchLiveModel({}, 6, { fetchImpl: f });
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /carries scripts/);
  assert.equal((await L.fetchLiveModel({}, 7, { fetchImpl: f })).ok, false);
  assert.equal((await L.fetchLiveModel({}, -1, { fetchImpl: f })).ok, false);
  assert.equal(f.calls.length, 3, 'an invalid id never reaches the network');
});

test('only a well-formed cs: id names an asset', () => {
  assert.equal(L.liveAssetIdOf('cs:7416934814'), 7416934814);
  for (const bad of ['cs:', 'cs:0', 'cs:-1', 'cs:12abc', 'cs:1.5', 'cs:01', 'cs:99999999999999999999', 'owner:cs:5', 'tree/oak', '']) assert.equal(L.liveAssetIdOf(bad), null, bad);
});

/* ------------------------------------------------------------------------------- the tools --- */

const ALLOW = { allow: ['creator_store', 'from_scratch'] };
const run = async (ctx, name, args) => JSON.parse((await T.runTool(ctx, name, JSON.stringify(args))).resultForLlm);

function ctxWith(answer = () => ({ ok: false, error: 'not used' }), over = {}) {
  const ops = [];
  return {
    ops,
    ctx: {
      env: {}, projectId: 'p-live', userId: 'u-live', assetSources: ALLOW,
      studioConnected: () => true,
      execStudioOp: async (op) => { ops.push(op); return answer(op); },
      createCheckpoint: async () => ({ error: 'not used' }),
      addMemoryFact: async () => 'refused',
      ...over,
    },
  };
}

const CRYSTALS = { crystal: [entry({ id: 7416934814, name: 'Crystal', votes: 20 }), entry({ id: 157006174, name: 'Awesome Crystal Cluster Mesh', votes: 200, rating: 95 }), entry({ id: 193928719, name: 'Crystal 1', hasScripts: true, scriptCount: 1 })] };

test('find_library_model returns live rows for a noun the bundle lacks, remembers them for the insert, and counts as a hit', async () => {
  const f = fakeStore(CRYSTALS);
  const { ctx } = ctxWith(undefined, { liveCreatorStore: true, liveStoreFetch: f });
  const res = await run(ctx, 'find_library_model', { query: 'crystal' });
  assert.deepEqual(res.results.map((r) => r.id), ['cs:7416934814', 'cs:157006174'], 'the name that is just the thing leads; the scripted row is gone');
  assert.equal(res.results[0].source, 'creator_store_live');
  assert.match(res.note, /live Creator Store/);
  assert.deepEqual(Object.keys(ctx.liveLibraryRows).sort(), ['cs:157006174', 'cs:7416934814']);
  assert.equal(ctx.libraryRun.outcome, 'hits');
  assert.deepEqual(ctx.libraryRun.candidates, ['cs:7416934814', 'cs:157006174']);
});

test('the live search is off unless the run turns it on, and never runs when the project does not allow the Creator Store', async () => {
  const off = fakeStore(CRYSTALS);
  const { ctx: plain } = ctxWith(undefined, { liveStoreFetch: off });
  const none = await run(plain, 'find_library_model', { query: 'crystal' });
  assert.equal(off.calls.length, 0, 'a context that did not ask for the live search never reaches Roblox');
  assert.equal(plain.libraryRun.outcome, 'no_hit');
  assert.deepEqual(none.results, []);

  const blocked = fakeStore(CRYSTALS);
  const { ctx: noStore } = ctxWith(undefined, { liveCreatorStore: true, liveStoreFetch: blocked, assetSources: { allow: ['from_scratch'] } });
  const refused = await run(noStore, 'find_library_model', { query: 'crystal' });
  assert.equal(blocked.calls.length, 0, 'the source choice is honoured before any request');
  assert.deepEqual(refused.results, []);
  assert.match(refused.note, /Live Creator Store search was not run/);
});

test('the last word of the query still names the object: rows without it are not offered, and the miss says what was tried', async () => {
  const f = fakeStore({ 'wooden arch gate': [entry({ id: 1, name: 'Wooden Plate' }), entry({ id: 2, name: 'Wooden Wheel' })], 'arch gate': [], gate: [entry({ id: 3, name: 'Old Gate' })] });
  const { ctx } = ctxWith(undefined, { liveCreatorStore: true, liveStoreFetch: f });
  const res = await run(ctx, 'find_library_model', { query: 'wooden arch gate' });
  assert.deepEqual(res.results.map((r) => r.name), ['Old Gate']);
  const none = ctxWith(undefined, { liveCreatorStore: true, liveStoreFetch: fakeStore({}) });
  const empty = await run(none.ctx, 'find_library_model', { query: 'zzqq widget' });
  assert.deepEqual(empty.results, []);
  assert.match(empty.note, /No verified Creator Store model named widget/);
  assert.match(empty.note, /live Creator Store had no free, script-free model/);
});

test('a rejected asset id is not offered again from the live store', async () => {
  const f = fakeStore(CRYSTALS);
  const { ctx } = ctxWith(undefined, { liveCreatorStore: true, liveStoreFetch: f, rejectedLibraryAssetIds: [157006174] });
  const res = await run(ctx, 'find_library_model', { query: 'crystal' });
  assert.deepEqual(res.results.map((r) => r.id), ['cs:7416934814']);
});

const INSERT_OPS = (centre = [0, 3, 0]) => (op) => {
  if (op.op === 'create_instances') return { ok: true, data: { created: ['game.Workspace.holder'] } };
  if (op.op === 'insert_asset') return { ok: true, data: { inserted: ['game.Workspace.holder.Crystal'] } };
  if (op.op === 'get_tree') return { ok: true, data: { root: { class: 'Model', name: 'Crystal', children: [{ class: 'MeshPart', name: 'Mesh' }] } } };
  if (op.op === 'list_scripts') return { ok: true, data: { scripts: [] } };
  if (op.op === 'spatial_query') return { ok: true, data: { center: centre, size: [2, 4, 2], bottomY: centre[1] - 2 } };
  if (op.op === 'transform_instances' || op.op === 'move_instances' || op.op === 'delete_instances' || op.op === 'rename_instance') return { ok: true, data: {} };
  return { ok: false, error: `unexpected ${op.op}` };
};

test('insert_library_model on a live row sends the plugin insert for that asset and scans the place afterwards', async () => {
  const f = fakeStore(CRYSTALS);
  const { ctx, ops } = ctxWith(INSERT_OPS(), { liveCreatorStore: true, liveStoreFetch: f });
  await run(ctx, 'find_library_model', { query: 'crystal' });
  const res = await run(ctx, 'insert_library_model', { id: 'cs:7416934814', position: [4, 0, 9] });
  assert.equal(res.error, undefined, res.error);
  const insert = ops.find((o) => o.op === 'insert_asset');
  assert.equal(insert.assetId, 7416934814, 'the asset inserted is the one the row names');
  assert.ok(ops.some((o) => o.op === 'list_scripts'), 'the insert is scanned in the place after loading');
  assert.equal(res.library.id, 'cs:7416934814');
  assert.equal(res.library.licence, 'Roblox-free');
  assert.match(res.library.attribution, /7416934814/);
  assert.equal(ctx.libraryRun.outcome, 'inserted');
});

test('a scripted result in the place removes the whole live asset and refuses, exactly as for a bundled row', async () => {
  const f = fakeStore(CRYSTALS);
  const answer = (op) => (op.op === 'list_scripts' ? { ok: true, data: { scripts: [{ path: 'game.Workspace.holder.Crystal.Body.Payload', class: 'Script' }] } }
    : op.op === 'read_script' ? { ok: true, data: { source: 'print("hi")' } } : INSERT_OPS()(op));
  const { ctx, ops } = ctxWith(answer, { liveCreatorStore: true, liveStoreFetch: f });
  await run(ctx, 'find_library_model', { query: 'crystal' });
  const res = await run(ctx, 'insert_library_model', { id: 'cs:7416934814' });
  assert.ok(res.error, 'a model that carries code in the place is refused');
  assert.ok(ops.some((o) => o.op === 'delete_instances'), 'and taken out again');
  assert.equal(ctx.libraryRun.outcome, 'insert_failed');
});

test('a cs: id this run never searched for is refused before anything reaches Studio, unless it is exactly the owner-approved asset', async () => {
  const f = fakeStore({ ...CRYSTALS, 'id:7416934814': entry({ id: 7416934814, name: 'Crystal' }) });
  const stranger = ctxWith(INSERT_OPS(), { liveCreatorStore: true, liveStoreFetch: f });
  const refused = await run(stranger.ctx, 'insert_library_model', { id: 'cs:7416934814' });
  assert.match(refused.error, /not a library id/);
  assert.equal(refused.stage, 'policy');
  assert.equal(stranger.ops.length, 0, 'an invented id never reaches Studio');
  assert.equal(f.calls.length, 0, 'and does not even reach Roblox');

  const approved = ctxWith(INSERT_OPS(), { liveCreatorStore: true, liveStoreFetch: f, approvedLibraryAssetId: 7416934814 });
  const ok = await run(approved.ctx, 'insert_library_model', { id: 'cs:7416934814' });
  assert.equal(ok.error, undefined, ok.error);
  assert.equal(new URL(f.calls[0].url).pathname, '/toolbox-service/v2/assets/7416934814', 'the approved id was verified through the gate first');
  assert.equal(approved.ops.find((o) => o.op === 'insert_asset').assetId, 7416934814);

  const scripted = fakeStore({ 'id:7416934814': entry({ id: 7416934814, hasScripts: true, scriptCount: 2 }) });
  const bad = ctxWith(INSERT_OPS(), { liveCreatorStore: true, liveStoreFetch: scripted, approvedLibraryAssetId: 7416934814 });
  const noGo = await run(bad.ctx, 'insert_library_model', { id: 'cs:7416934814' });
  assert.match(noGo.error, /carries scripts/);
  assert.equal(bad.ops.length, 0, 'an approved id that fails the gate is not inserted either');

  const other = ctxWith(INSERT_OPS(), { liveCreatorStore: true, liveStoreFetch: f, approvedLibraryAssetId: 5 });
  assert.match((await run(other.ctx, 'insert_library_model', { id: 'cs:7416934814' })).error, /not a library id/, 'approval of one asset does not open another');
});

test('a live insert respects the source policy like every Creator Store insert', async () => {
  const f = fakeStore(CRYSTALS);
  const { ctx, ops } = ctxWith(INSERT_OPS(), { liveCreatorStore: true, liveStoreFetch: f });
  await run(ctx, 'find_library_model', { query: 'crystal' });
  ctx.assetSources = { allow: ['from_scratch'] };
  const res = await run(ctx, 'insert_library_model', { id: 'cs:7416934814' });
  assert.ok(res.error);
  assert.equal(res.stage, 'policy');
  assert.equal(ops.length, 0);
});

/* --------------------------------------------------------------------- the owner library --- */

test('an owner-library row that matched only in a path is held back, so "crystal" no longer answers a javelin', async () => {
  const raw = 'a'.repeat(64) + ':42';
  const gateway = (rows) => async (op) => (op.op === 'query_owner_local' ? { ok: true, data: { items: rows, nextAfter: null } } : { ok: false, error: 'unexpected' });
  const javelin = { id: raw, name: 'Javelin', class: 'Model', path: 'Workspace.CrystalQuest.Javelin', summary: 'a thrown crystal tipped spear' };
  const f = fakeStore(CRYSTALS);
  const { ctx } = ctxWith(gateway([javelin]), { localOwnerGateway: true, liveCreatorStore: true, liveStoreFetch: f });
  const res = await run(ctx, 'find_library_model', { query: 'crystal' });
  assert.notEqual(res.source, 'owner_local', 'the javelin does not answer');
  assert.deepEqual(res.results.map((r) => r.id), ['cs:7416934814', 'cs:157006174'], 'the live store answers instead');

  // A row whose own name has the word still answers first.
  const crystalRow = { id: 'b'.repeat(64) + ':7', name: 'Crystal Spire', class: 'Model', path: 'Workspace.Cave.Crystal Spire' };
  const named = ctxWith(gateway([javelin, crystalRow]), { localOwnerGateway: true, liveCreatorStore: true, liveStoreFetch: fakeStore(CRYSTALS) });
  const first = await run(named.ctx, 'find_library_model', { query: 'crystal' });
  assert.equal(first.source, 'owner_local');
  assert.deepEqual(first.results.map((r) => r.name), ['Crystal Spire']);
  assert.match(first.note, /1 other row\(s\) matched only in a path or description/);

  // With nothing else to offer, the held rows come back, said to be unnamed matches.
  const alone = ctxWith(gateway([javelin]), { localOwnerGateway: true });
  const last = await run(alone.ctx, 'find_library_model', { query: 'crystal' });
  assert.equal(last.source, 'owner_local');
  assert.match(last.note, /None of these rows has a word of "crystal" in its own name/);
});

test('the real run context turns the live search on and keeps the rows between calls', async () => {
  const { readFileSync } = await import('node:fs');
  const session = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
  assert.match(session, /liveLibraryRows: \(agent\.liveLibraryRows \?\?= \{\}\)/, 'the rows live on the run, not on a context rebuilt for every call');
  assert.match(session, /liveCreatorStore: true/, 'a real run searches the live store');
});
