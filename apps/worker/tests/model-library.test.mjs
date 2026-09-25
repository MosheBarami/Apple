/**
 * THE 3D MODEL LIBRARY (D-MODELLIB-1/2): EVERY ROW IS REAL; PROPS COME FROM IT.
 *
 * packages/asset-library/models is derived by build.mjs from the files in models-store/ (gitignored)
 * and from the Creator Store harvest. This holds:
 *   - the manifest is not empty, and every row points at a file that exists (when the store is on
 *     this machine) or at a numeric Creator Store id; every file's sha256 matches; every Roblox file
 *     row was scanned clean; every downloaded file carries an allowlisted licence;
 *   - the bundled index holds verified library rows, and each one is a manifest row;
 *   - find_library_model is a read-only lookup; insert_library_model mutates and needs Studio;
 *   - create_instances refuses a multi-part Model named after a thing the library holds, sends
 *     nothing, and still builds terrain/baseplate/path/zone parts; missing permission or a failed
 *     library insert never permits a hand-built prop;
 *   - insert_library_model inserts a Creator Store row by its id through the scan, then places it;
 *   - the agent offers only Creator Store rows; a downloaded file is refused because the
 *     current source choice does not authorise a permanent upload into the user's account.
 *
 * Run with:  node --test tests/model-library.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(WORKER, '..', '..');
const LIB = join(ROOT, 'packages/asset-library');
const DIR = mkdtempSync(join(tmpdir(), 'model-library-'));
process.on('exit', () => rmSync(DIR, { recursive: true, force: true }));

function bundle(rel, name) {
  const out = join(DIR, `${name}.mjs`);
  execFileSync(
    join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [join(WORKER, 'src', rel), '--bundle', '--format=esm', '--target=es2022', '--platform=node', '--outfile=' + out],
    { cwd: WORKER, stdio: 'pipe' },
  );
  return out;
}

const T = await import(`file://${bundle('tools.ts', 'tools')}`);
const M = await import(`file://${bundle('model-library.ts', 'model-library')}`);
const MANIFEST = JSON.parse(readFileSync(join(LIB, 'models/manifest.json'), 'utf8'));
const INDEX = JSON.parse(readFileSync(join(LIB, 'models/index.json'), 'utf8'));
const STORE_PRESENT = existsSync(join(LIB, 'models-store'));
const DOWNLOAD_LICENCES = /^(CC0|CC0-1\.0|Public ?Domain|CC-BY-[34]\.0|CC-BY|MIT|Apache-2\.0|BSD-[23]-Clause|Unlicense|ISC|0BSD|Zlib)$/i;

const ALLOW_ALL = { allow: ['creator_store', 'from_scratch'] };
const run = async (c, name, args) => JSON.parse((await T.runTool(c, name, JSON.stringify(args))).resultForLlm);

function ctxWith(answer = () => ({ ok: false, error: 'not used' }), over = {}) {
  const ops = [];
  return {
    ops,
    ctx: {
      env: {},
      projectId: 'project-models',
      userId: 'userId' in over ? over.userId : 'user-models',
      assetSources: 'assetSources' in over ? over.assetSources : ALLOW_ALL,
      studioConnected: () => true,
      execStudioOp: async (op) => { ops.push(op); return answer(op); },
      createCheckpoint: async () => ({ error: 'not used' }),
      addMemoryFact: async () => 'refused',
      ...(over.ctx ?? {}),
    },
  };
}

const csRows = MANIFEST.rows.filter((r) => r.assetId !== undefined);
const fileRows = MANIFEST.rows.filter((r) => r.path);
const indexed = M.findLibraryModels; // bound for readability below

/* ---------------------------------------------------------------- the manifest --- */

test('the manifest is not empty and holds both downloaded files and Creator Store ids', () => {
  assert.ok(MANIFEST.rows.length >= 1000, `only ${MANIFEST.rows.length} rows`);
  assert.ok(fileRows.length >= 100, `only ${fileRows.length} downloaded model files`);
  assert.ok(csRows.length >= 100, `only ${csRows.length} Creator Store ids`);
  assert.equal(MANIFEST.totals.rows, MANIFEST.rows.length, 'totals are derived from the rows');
});

test('every row points at an existing file or a numeric Creator Store id', (t) => {
  for (const r of MANIFEST.rows) {
    assert.ok(Boolean(r.path) !== (r.assetId !== undefined), `${r.id} must have exactly one of path / assetId`);
    if (r.assetId !== undefined) assert.ok(Number.isInteger(r.assetId) && r.assetId > 0, `${r.id}: ${r.assetId} is not an asset id`);
  }
  if (!STORE_PRESENT) return t.skip('models-store/ is not on this machine (it is gitignored; node packages/asset-library/models/fetch.mjs re-creates it)');
  for (const r of fileRows) {
    const p = join(LIB, r.path);
    assert.ok(existsSync(p), `${r.id}: ${r.path} is not on disk`);
    assert.equal(createHash('sha256').update(readFileSync(p)).digest('hex'), r.sha256, `${r.id}: the file changed since the manifest was built`);
  }
});

test('downloaded files carry an allowlisted licence, and every Roblox file was scanned clean', () => {
  for (const r of fileRows) {
    assert.match(String(r.licence), DOWNLOAD_LICENCES, `${r.id} has licence ${r.licence}`);
    if (/^CC-BY/i.test(r.licence)) assert.ok(r.attribution, `${r.id} is CC-BY and needs its attribution`);
    if (r.format === 'rbxm') assert.equal(r.scan.clean, true, `${r.id} is a Roblox file that is not proven script-free`);
  }
});

test('the bundled index holds only verified manifest rows', () => {
  const byId = new Map(MANIFEST.rows.map((r) => [r.id, r]));
  assert.ok(INDEX.rows.length > 0);
  for (const row of INDEX.rows) {
    const r = byId.get(row[0]);
    assert.ok(r, `${row[0]} is in the index but not in the manifest`);
    assert.equal(r.scan.clean, true, `${r.id} is not script-free`);
    assert.notEqual(r.branded, true, `${r.id} names another company's property`);
    if (r.assetId !== undefined) assert.equal(r.trusted, true, `${r.id} is not from a trusted creator`);
    else assert.notEqual(r.format, 'obj', `${r.id}: Open Cloud does not take .obj`);
  }
});

/* ---------------------------------------------------------------- registration --- */

test('find_library_model is a read-only lookup; insert_library_model edits the place through Studio', () => {
  assert.equal(T.TOOLS.find_library_model.studio, false);
  assert.equal(T.projectMutatingToolNames().includes('find_library_model'), false);
  assert.equal(T.TOOLS.insert_library_model.studio, true);
  assert.equal(T.projectMutatingToolNames().includes('insert_library_model'), true);
});

// A name the index is sure to answer for: the first word of a real indexed row.
const sample = (pred) => {
  const row = INDEX.rows.find((r) => pred(r) && M.tokensOf(r[1]).some((w) => w.length >= 4 && !/\d/.test(w)));
  return row ? { id: row[0], word: M.tokensOf(row[1]).find((w) => w.length >= 4 && !/\d/.test(w)) } : null;
};

test('a search word matches its plural, never a longer word that starts with it', () => {
  // crate/crater and car/cartoon are both in the index; a crater is not a crate.
  for (const q of ['crate', 'car', 'rock', 'bush', 'tree']) {
    for (const r of M.findLibraryModels({ query: q, limit: 40 }).results) {
      const toks = M.tokensOf(r.name);
      const plural = (t) => t === q || t === q + 's' || t === q + 'es' || (q.endsWith('y') && t === q.slice(0, -1) + 'ies');
      assert.ok(toks.some(plural), `"${q}" returned "${r.name}", which names no ${q}`);
    }
  }
});

test('find_library_model answers from the bundle with ids insert_library_model takes', async () => {
  const s = sample(() => true);
  const { ctx, ops } = ctxWith();
  const res = await run(ctx, 'find_library_model', { query: s.word });
  assert.ok(res.results.length > 0, `nothing for "${s.word}"`);
  for (const r of res.results) assert.ok(M.libraryModel(r.id), `${r.id} does not resolve`);
  assert.equal(ops.length, 0, 'a lookup sends no Studio op');
});

test('Creator Store consent never authorises a downloaded file upload', async () => {
  const file = INDEX.rows.find((r) => typeof r[5] === 'string');
  assert.ok(file, 'the index has no downloaded row, so this gate would check nothing');
  const { ctx, ops } = ctxWith(undefined, { assetSources: { mode: 'remember', allow: ['creator_store'] } });
  const refused = await run(ctx, 'insert_library_model', { id: file[0] });
  assert.match(refused.error, /Creator Store|source choice/i);
  assert.doesNotMatch(refused.error, /Connect a Roblox Open Cloud key/i, 'an upload path was reached without upload consent');
  assert.equal(ops.length, 0, 'the place was touched before the unsupported source was refused');

  const found = await run(ctx, 'find_library_model', { query: 'small tree', limit: 40 });
  assert.ok(found.results.some((r) => r.assetId !== undefined), 'the permitted Creator Store result vanished');
  assert.ok(found.results.every((r) => r.assetId !== undefined), 'a file was offered as an insertable result');
});

/* ---------------------------------------------------------------- the guard --- */

const twoParts = (name, cls = 'Model') => ({
  className: cls, name, parent: 'Workspace',
  children: [
    { className: 'Part', name: 'A', props: { Size: { t: 'Vector3', v: [1, 1, 1] } } },
    { className: 'Part', name: 'B', props: { Size: { t: 'Vector3', v: [1, 1, 1] } } },
  ],
});
const created = (ops) => ops.filter((o) => o.op === 'create_instances').length;

test('create_instances refuses a part-built prop the library holds, and sends nothing', async () => {
  const s = sample(() => true);
  const hit = indexed({ query: s.word, limit: 1 });
  assert.ok(hit.results.length, 'the sample word must be in the library');
  const { ctx, ops } = ctxWith(() => ({ ok: true, data: { created: [] } }));
  const name = s.word[0].toUpperCase() + s.word.slice(1);
  const res = await run(ctx, 'create_instances', { items: [twoParts(name)] });
  assert.ok(res.error, `a part-built "${name}" was accepted`);
  assert.match(res.error, /insert_library_model/);
  assert.equal(created(ops), 0, 'nothing may reach Studio');
});

// D-MODELLIB-2: structure grouped in a Folder, and a single plain part; a part named "Tree" is now a prop (model-only.test.mjs).
test('parts stay allowed for terrain, baseplates, paths and zones, and for a single part', async () => {
  const folder = (item) => ({ ...item, className: 'Folder' });
  for (const items of [
    [folder(twoParts('Baseplate'))], [folder(twoParts('SpawnArea'))], [folder(twoParts('ObbyStage3'))], [folder(twoParts('MainPath'))], [folder(twoParts('SafeZone'))],
    [{ className: 'Part', name: 'Floor', props: { Size: { t: 'Vector3', v: [100, 1, 100] } } }],
  ]) {
    const { ctx, ops } = ctxWith(() => ({ ok: true, data: { created: [] } }));
    const res = await run(ctx, 'create_instances', { items });
    assert.equal(res.error, undefined, `${items[0].name} was refused: ${res.error}`);
    assert.equal(created(ops), 1);
  }
});

test('a missing source or insert tool never permits a hand-built prop', async () => {
  const s = sample(() => true);
  const name = s.word[0].toUpperCase() + s.word.slice(1);
  for (const over of [
    { assetSources: { allow: ['from_scratch'] } },
    { ctx: { offeredTools: new Set(['create_instances']) } },
  ]) {
    const { ctx, ops } = ctxWith(() => ({ ok: true, data: { created: [] } }), over);
    const res = await run(ctx, 'create_instances', { items: [twoParts(name)] });
    assert.match(res.error, /D-MODELLIB-2/);
    assert.equal(created(ops), 0);
  }
});

test('a failed library insert never permits a hand-built replacement', async () => {
  const s = INDEX.rows
    .map((r) => M.tokensOf(r[1]).find((w) => w.length >= 4 && !/\d/.test(w)))
    .find((w) => w && M.handBuiltPropRefusal([twoParts(w)]));
  assert.ok(s, 'the bundled library has a prop for this guard');
  const name = s[0].toUpperCase() + s.slice(1);
  assert.match(M.handBuiltPropRefusal([twoParts(name)]), /prop the model library/);
  assert.match(M.handBuiltPropRefusal([twoParts(name)], new Set([s])), /prop the model library/);
  const { ctx, ops } = ctxWith(() => ({ ok: true, data: { created: [] } }));
  ctx.libraryMisses = new Set([s]);
  const res = await run(ctx, 'create_instances', { items: [twoParts(name)] });
  assert.match(res.error, /D-MODELLIB-2|prop the model library/);
  assert.equal(created(ops), 0);
});

/* ---------------------------------------------------------------- insert --- */

test('a Creator Store row is inserted by its own id, scanned, then stood on the requested spot', async () => {
  const s = sample((r) => typeof r[5] === 'number');
  assert.ok(s, 'the index has a Creator Store row');
  const want = M.libraryModel(s.id);
  let centre = [10, 7, -3];
  const size = [4, 6, 4];
  const { ctx, ops } = ctxWith((op) => {
    if (op.op === 'insert_asset') return { ok: true, data: { inserted: ['Workspace.Thing'] } };
    if (op.op === 'get_tree') return { ok: true, data: { root: { class: 'Model', name: 'Thing', children: [{ class: 'MeshPart', name: 'Mesh' }] } } };
    if (op.op === 'list_scripts') return { ok: true, data: { scripts: [] } };
    if (op.op === 'spatial_query') return { ok: true, data: { center: centre, size, bottomY: centre[1] - size[1] / 2 } };
    if (op.op === 'transform_instances') { if (op.move) centre = centre.map((c, i) => c + op.move[i]); return { ok: true, data: {} }; }
    return { ok: false, error: `unexpected ${op.op}` };
  });
  ctx.approvedLibraryAssetId = want.assetId;
  const res = await run(ctx, 'insert_library_model', { id: s.id, position: [0, 0, 20] });
  assert.equal(res.error, undefined, res.error);
  const insert = ops.find((o) => o.op === 'insert_asset');
  assert.equal(insert.assetId, want.assetId, 'the id inserted is the row\'s own id');
  assert.ok(ops.some((o) => o.op === 'list_scripts'), 'the insert is scanned in the place');
  assert.deepEqual([centre[0], centre[1] - size[1] / 2, centre[2]], [0, 0, 20], 'bottom-centre lands on position');
  assert.equal(ops.filter((o) => o.op === 'transform_instances' && o.scale).length, 0, 'a Creator Store row keeps its own scale unless asked');
});

test('a detailed model cannot be inserted before the owner selects its preview', async () => {
  const s = sample((r) => typeof r[5] === 'number');
  const { ctx, ops } = ctxWith();
  const result = await run(ctx, 'insert_library_model', { id: s.id });
  assert.match(result.error, /preview and choose/);
  assert.equal(ops.length, 0, 'an unapproved option must never reach Studio');
});

test('a rejected preview is not offered again in the next search', async () => {
  const { ctx } = ctxWith();
  const first = await run(ctx, 'find_library_model', { query: 'tree', limit: 10 });
  assert.ok(first.results.length > 0);
  const rejected = first.results[0].assetId;
  ctx.rejectedLibraryAssetIds = [rejected];
  const second = await run(ctx, 'find_library_model', { query: 'tree', limit: 10 });
  assert.ok(second.results.every((row) => row.assetId !== rejected));
});

test('after rejecting trees the model cannot offer an unrelated flower', async () => {
  assert.ok(M.findLibraryModels({ query: 'flowers', creatorStoreOnly: true }).results.length > 0,
    'the test needs a real flower row to exercise the boundary');
  const { ctx } = ctxWith();
  ctx.assetChoiceAnchor = 'tree';
  const result = await run(ctx, 'find_library_model', { query: 'flowers' });
  assert.deepEqual(result.results, []);
  assert.equal(ctx.uiDetail, undefined, 'no unrelated preview card may be offered');
});

test('the upload cap refuses before any byte is read or sent', async () => {
  const s = sample((r) => typeof r[5] === 'string');
  const full = new Map(Array.from({ length: M.MAX_UPLOADS_PER_RUN }, (_, i) => [`x${i}`, i + 1]));
  // Any read of env (the credential store, the static store) would mean the upload path started.
  const touched = [];
  const env = new Proxy({}, { get: (_t, k) => { touched.push(String(k)); return undefined; } });
  const { ctx, ops } = ctxWith(undefined, { ctx: { libraryUploads: full, env } });
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('network off'); };
  try {
    const res = await run(ctx, 'insert_library_model', { id: s.id });
    assert.ok(res.error);
    assert.equal(calls, 0);
    assert.equal(ops.length, 0);
    assert.deepEqual(touched, [], 'neither the key nor the file was looked up');
  } finally { globalThis.fetch = real; }
});

test('a file row is uploaded as a Model into the user\'s own account at price 0, and only with a key', async () => {
  const s = sample((r) => typeof r[5] === 'string' && /\.glb$/.test(r[5]));
  const m = M.libraryModel(s.id);
  const sent = [];
  const deps = (scopes) => ({
    describeCredential: async () => ({ scopes }),
    read: async () => new Uint8Array(64).fill(7),
    upload: async (_env, userId, input) => { sent.push({ userId, ...input }); return { ok: true, data: { done: true, assetId: 424242, operationId: 'op' } }; },
    uploadStatus: async () => { throw new Error('not polled'); },
    sleep: async () => {},
  });
  const noUser = await M.uploadLibraryModel({}, undefined, m, deps(['asset:write']));
  assert.ok('error' in noUser);
  const noScope = await M.uploadLibraryModel({}, 'u1', m, deps(['asset:read']));
  assert.ok('error' in noScope);
  assert.equal(sent.length, 0, 'nothing is sent without a user and asset:write');
  const ok = await M.uploadLibraryModel({}, 'u1', m, deps(['asset:write']));
  assert.deepEqual(ok, { assetId: 424242 });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].userId, 'u1');
  assert.equal(sent[0].contentType, 'model/gltf-binary');
  assert.equal(sent[0].type, 'Model');
  assert.equal(sent[0].expectedPrice, 0);
});
