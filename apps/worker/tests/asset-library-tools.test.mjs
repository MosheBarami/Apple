/**
 * THE OPEN UI/ICON LIBRARY IS REACHABLE, AND ITS UPLOAD GOES ONLY INTO THE USER'S OWN ACCOUNT.
 *
 * packages/asset-library (D-UILIB-1, D-UILIB-2) is thousands of CC0 PNGs. The worker cannot read the
 * repository, so it bundles the compact index and reads bytes from the static store. This holds:
 *   - `find_ui_asset` is a read-only lookup, offered in every mode, answering from the bundle;
 *   - its hits name a pack, a licence and an `asset` id that the upload tool accepts;
 *   - `upload_ui_asset` refuses anything that is not a library file, and refuses without a user
 *     or a key with asset:write, before any byte is read or sent;
 *   - when it does upload, it sends a real PNG as an Image and hands back an rbxassetid;
 *   - neither tool changes the place, and the upload is on the user's permission surface.
 *
 * Run with:  node --test tests/asset-library-tools.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { d1 } from './stubs/d1.mjs';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(WORKER, '..', '..');
const DIR = mkdtempSync(join(tmpdir(), 'asset-library-'));
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
const R = await import(`file://${bundle('router.ts', 'router')}`);
const L = await import(`file://${bundle('asset-library.ts', 'asset-library')}`);
const S = await import(`file://${join(ROOT, 'packages/shared/src/index.ts')}`);
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'packages/asset-library/manifest.json'), 'utf8'));

const FIND = 'find_ui_asset';
const UPLOAD = 'upload_ui_asset';
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

async function withNoNetwork(fn) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => { calls.push(String(url)); throw new Error('network is off in this test'); };
  try { return { result: await fn(), calls }; } finally { globalThis.fetch = real; }
}

function ctx(over = {}) {
  const ops = [];
  return {
    ops,
    ctx: {
      env: { ...(over.env ?? {}) },
      projectId: 'project-lib',
      userId: 'userId' in over ? over.userId : 'user-lib',
      studioConnected: () => true,
      execStudioOp: async (op) => { ops.push(op.op); return { ok: false, error: 'not used' }; },
      createCheckpoint: async () => ({ error: 'not used' }),
      addMemoryFact: async () => 'refused',
    },
  };
}
const run = async (c, name, args) => JSON.parse((await T.runTool(c, name, JSON.stringify(args))).resultForLlm);

/* ------------------------------------------------------------- registration --- */

test('both tools are registered, need no Studio, and change nothing in the place', () => {
  for (const name of [FIND, UPLOAD]) {
    assert.ok(name in T.TOOLS, `${name} is not in TOOLS`);
    assert.equal(T.TOOLS[name].studio, false, `${name} needs no Studio`);
    assert.equal(T.projectMutatingToolNames().includes(name), false, `${name} does not edit the place`);
  }
});

test('the lookup is offered in every mode; the upload only to a connected Agent', () => {
  const names = T.toolNames();
  for (const [mode, connected] of [['plan', true], ['plan', false], ['agent', false], ['agent', true]]) {
    assert.ok(R.toolsForMode(mode, connected, names).has(FIND), `${FIND} missing in ${mode}/${connected}`);
  }
  assert.equal(R.toolsForMode('plan', true, names).has(UPLOAD), false, 'Plan was handed a tool that writes to a Roblox account');
  assert.equal(R.toolsForMode('agent', true, names).has(UPLOAD), true);
});

test('the upload is on the user\'s tool-permission surface', () => {
  assert.ok(S.GOVERNED_TOOL_NAMES.includes(UPLOAD), 'a tool that writes permanent assets into the user\'s Roblox account is not governable');
});

/* ------------------------------------------------------------------ lookup --- */

test('the bundled index covers every PNG the manifest counts', () => {
  const pngs = MANIFEST.packs.reduce((n, p) => n + Object.values(p.categories).reduce((k, c) => k + c, 0), 0);
  assert.equal(L.libraryFileCount(), pngs);
  assert.ok(L.libraryFileCount() > 1000);
});

test('a keyword search returns library files that match it, each with a licence and a resolvable id', async () => {
  const out = await run(ctx().ctx, FIND, { query: 'heart' });
  assert.ok(out.results.length > 0, JSON.stringify(out));
  for (const hit of out.results) {
    assert.match(hit.asset, /^[a-z0-9-]+\/.+\.png$/);
    assert.match(hit.license, /^CC0|^CC-BY/);
    assert.match(hit.asset.toLowerCase(), /heart/);
    assert.ok(L.libraryAsset(hit.asset), `${hit.asset} does not resolve`);
    assert.ok(hit.url.endsWith(hit.asset));
  }
});

test('several words narrow the search to files that match all of them', async () => {
  const out = await run(ctx().ctx, FIND, { query: 'xbox button a' });
  assert.ok(out.results.length > 0);
  const top = out.results[0].asset.toLowerCase();
  assert.match(top, /xbox/);
  assert.match(top, /button/);
});

test('a pack filter and a limit are honoured', async () => {
  const out = await run(ctx().ctx, FIND, { query: 'button', pack: 'kenney-ui-pack', limit: 5 });
  assert.ok(out.results.length > 0 && out.results.length <= 5);
  for (const hit of out.results) assert.equal(hit.pack, 'kenney-ui-pack');
  assert.ok(out.total >= out.results.length);
});

test('a query that matches nothing is an empty answer with a way forward, not an error', async () => {
  const out = await run(ctx().ctx, FIND, { query: 'zzqxv' });
  assert.deepEqual(out.results, []);
  assert.equal('error' in out, false);
  assert.ok(Array.isArray(out.packs) && out.packs.length === MANIFEST.packs.length, 'the packs to browse were not listed');
});

test('an empty query lists the packs with their counts and licences', async () => {
  const out = await run(ctx().ctx, FIND, {});
  assert.equal(out.packs.length, MANIFEST.packs.length);
  assert.ok(out.packs.reduce((n, p) => n + p.files, 0) > 1000);
  for (const p of out.packs) assert.match(p.license, /^CC0|^CC-BY/);
});

/* ------------------------------------------------------------------ upload --- */

test('the upload refuses a file that is not in the library, before any network call', async () => {
  const c = ctx();
  for (const asset of ['../../etc/passwd', 'kenney-ui-pack/nope.png', 'https://example.com/a.png', '']) {
    const { result, calls } = await withNoNetwork(() => run(c.ctx, UPLOAD, { asset }));
    assert.equal(typeof result.error, 'string', asset);
    assert.deepEqual(calls, [], asset);
  }
});

test('the upload refuses without a signed-in user', async () => {
  const hit = (await run(ctx().ctx, FIND, { query: 'heart' })).results[0];
  const { result, calls } = await withNoNetwork(() => run(ctx({ userId: undefined }).ctx, UPLOAD, { asset: hit.asset }));
  assert.equal(typeof result.error, 'string');
  assert.deepEqual(calls, []);
});

test('the upload refuses when the user has no Roblox key with asset:write, before reading bytes', async () => {
  const hit = (await run(ctx().ctx, FIND, { query: 'heart' })).results[0];
  const db = d1();
  const { result, calls } = await withNoNetwork(() => run(ctx({ env: { CORPUS: db.CORPUS } }).ctx, UPLOAD, { asset: hit.asset }));
  assert.equal(typeof result.error, 'string');
  assert.match(result.error, /asset:write/);
  assert.deepEqual(calls, []);
});

test('with a key, the PNG is sent as an Image into the user\'s account and an rbxassetid comes back', async () => {
  const hit = L.findUiAssets({ query: 'heart' }).results[0];
  const png = new Uint8Array([...PNG_MAGIC, 1, 2, 3, 4]);
  const sent = [];
  const out = await L.uploadLibraryAsset({}, 'user-lib', { asset: hit.asset }, {
    describeCredential: async () => ({ scopes: ['asset:read', 'asset:write'] }),
    read: async (_env, asset) => (asset === hit.asset ? png : null),
    upload: async (_env, userId, input) => { sent.push({ userId, input }); return { ok: true, status: 200, audited: true, data: { done: true, assetId: 424242, operationId: 'op-1' } }; },
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].userId, 'user-lib');
  assert.equal(sent[0].input.contentType, 'image/png');
  assert.ok(sent[0].input.file.byteLength > 0);
  assert.ok(sent[0].input.displayName.length > 0 && sent[0].input.displayName.length <= 50);
  assert.equal(sent[0].input.expectedPrice ?? 0, 0, 'an upload that could spend Robux');
  assert.equal(out.assetId, 424242);
  assert.equal(out.image, 'rbxassetid://424242');
  assert.match(out.license, /^CC0|^CC-BY/);
});

test('bytes that are not a stored PNG are refused rather than uploaded', async () => {
  const hit = L.findUiAssets({ query: 'heart' }).results[0];
  let uploads = 0;
  const out = await L.uploadLibraryAsset({}, 'user-lib', { asset: hit.asset }, {
    describeCredential: async () => ({ scopes: ['asset:write'] }),
    read: async () => null,
    upload: async () => { uploads++; return { ok: false, error: 'x', status: 500, audited: false }; },
  });
  assert.equal(typeof out.error, 'string');
  assert.equal(uploads, 0);
});

test('the static read accepts only a 200 PNG and refuses the not-found page', async () => {
  const pngBody = new Uint8Array([...PNG_MAGIC, 9, 9]);
  const ok = await L.readLibraryPng({}, 'kenney-ui-pack/x.png', async () => new Response(pngBody, { status: 200, headers: { 'content-type': 'image/png' } }));
  assert.ok(ok && ok.byteLength === pngBody.byteLength);
  const notFound = await L.readLibraryPng({}, 'kenney-ui-pack/x.png', async () => new Response('<html>', { status: 404, headers: { 'content-type': 'text/html' } }));
  assert.equal(notFound, null);
  const html200 = await L.readLibraryPng({}, 'kenney-ui-pack/x.png', async () => new Response('<html>', { status: 200, headers: { 'content-type': 'image/png' } }));
  assert.equal(html200, null, 'a body that is not a PNG was accepted');
});
