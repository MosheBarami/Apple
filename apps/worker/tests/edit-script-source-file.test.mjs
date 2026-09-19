/**
 * A SAVED PROJECT FILE MAY FEED edit_script WITHOUT COPYING ITS BODY THROUGH THE MODEL.
 *
 * This exercises the shipped KV workspace implementation and the real bundled tool together. The
 * important boundary is the Studio op recorder: every refusal below proves no edit_script mutation
 * was sent, while the positive case proves the exact requested archived version (not latest) is the
 * body that crossed into Studio.
 *
 * Run with: node --test tests/edit-script-source-file.test.mjs   (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = mkdtempSync(join(tmpdir(), 'edit-script-source-file-'));
const bundle = (rel, name) => {
  const out = join(DIR, `${name}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
    join(WORKER, 'src', rel), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out,
  ], { cwd: WORKER, stdio: 'pipe' });
  return out;
};

const T = await import(pathToFileURL(bundle('tools.ts', 'tools')).href);
const W = await import(pathToFileURL(bundle('webtools.ts', 'webtools')).href);

function fakeKV() {
  const rows = new Map();
  return {
    rows,
    async get(key) { return rows.get(key)?.value ?? null; },
    async getWithMetadata(key) {
      const row = rows.get(key);
      return row ? { value: row.value, metadata: row.metadata ?? null } : { value: null, metadata: null };
    },
    async put(key, value, opts = {}) {
      rows.set(key, { value, metadata: opts.metadata ?? null, expirationTtl: opts.expirationTtl ?? null });
    },
    async delete(key) { rows.delete(key); },
    async list({ prefix = '', cursor } = {}) {
      const names = [...rows.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0;
      const page = names.slice(start, start + 2);
      const next = start + page.length;
      const complete = next >= names.length;
      return {
        keys: page.map((name) => ({ name, metadata: rows.get(name).metadata })),
        list_complete: complete,
        ...(complete ? {} : { cursor: String(next) }),
      };
    },
  };
}

function studio(kv, projectId = 'project-A', initial = 'print("before")\n') {
  const ops = [];
  let body = initial;
  const ctx = {
    env: { KV: kv },
    projectId,
    studioConnected: () => true,
    addMemoryFact: async () => 'saved',
    createCheckpoint: async () => ({ error: 'unused' }),
    execStudioOp: async (op) => {
      ops.push(op);
      if (op.op === 'read_script') {
        if (body === null) return { ok: false, error: `script not found: ${op.path}` };
        return { ok: true, data: { path: op.path, source: body } };
      }
      if (op.op === 'edit_script') {
        body = op.source;
        return { ok: true, data: { path: op.path, mode: 'replace' } };
      }
      return { ok: false, error: `unexpected op ${op.op}` };
    },
  };
  return {
    ctx,
    ops,
    body: () => body,
    writes: () => ops.filter((op) => op.op === 'edit_script'),
  };
}

const TARGET = 'game.ServerScriptService.Main';
const FILE = 'lumen/server/Main.luau';
const V1 = 'local version = 1\nprint(version)\n';
const V2 = 'local version = 2\nprint(version)\n';

test('source_file writes the EXACT requested archived workspace version and returns bounded provenance', async () => {
  const kv = fakeKV();
  const store = W.kvWorkspace(kv, 'project-A');
  await store.write(FILE, V1);
  await store.write(FILE, V2);
  const s = studio(kv);

  const res = await T.TOOLS.edit_script.run(s.ctx, {
    path: TARGET,
    source_file: { path: FILE, version: 1 },
  });

  assert.equal(res.error, undefined, JSON.stringify(res));
  assert.equal(s.writes().length, 1);
  assert.equal(s.writes()[0].source, V1, 'version 1 was requested; latest version 2 must never substitute');
  assert.equal(s.body(), V1);
  assert.deepEqual(res.sourceFile, { path: FILE, version: 1, provenance: 'project_workspace_version' });
  assert.equal(JSON.stringify(res).includes(V1), false, 'the full saved source must not be echoed back in the result/trace');
});

test('source_file can create a missing script through the existing create contract', async () => {
  const kv = fakeKV();
  await W.kvWorkspace(kv, 'project-A').write(FILE, V1);
  const s = studio(kv, 'project-A', null);

  const res = await T.TOOLS.edit_script.run(s.ctx, {
    path: TARGET,
    source_file: { path: FILE, version: 1 },
    create_class: 'Script',
    create_parent: 'game.ServerScriptService',
  });

  assert.equal(res.error, undefined, JSON.stringify(res));
  assert.equal(s.writes().length, 1);
  assert.deepEqual(s.writes()[0].create, { className: 'Script', parent: 'game.ServerScriptService' });
  assert.equal(s.writes()[0].baseHash, undefined, 'a missing target has no observed base to hash');
  assert.equal(s.body(), V1);
});

test('inline source and edits remain valid inputs, while every ambiguous pair is refused before Studio', async () => {
  const kv = fakeKV();
  await W.kvWorkspace(kv, 'project-A').write(FILE, V1);

  const source = studio(kv);
  const sourceRes = await T.TOOLS.edit_script.run(source.ctx, { path: TARGET, source: 'print("inline")\n' });
  assert.equal(sourceRes.error, undefined, JSON.stringify(sourceRes));
  assert.equal(source.writes().length, 1);

  const edits = studio(kv);
  const editRes = await T.TOOLS.edit_script.run(edits.ctx, {
    path: TARGET,
    edits: [{ find: 'before', replace: 'after' }],
  });
  assert.equal(editRes.error, undefined, JSON.stringify(editRes));
  assert.equal(edits.writes().length, 1);

  for (const args of [
    { source: 'print(1)\n', edits: [{ find: 'x', replace: 'y' }] },
    { source: 'print(1)\n', source_file: { path: FILE, version: 1 } },
    { edits: [{ find: 'x', replace: 'y' }], source_file: { path: FILE, version: 1 } },
  ]) {
    const ambiguous = studio(kv);
    const res = await T.TOOLS.edit_script.run(ambiguous.ctx, { path: TARGET, ...args });
    assert.match(String(res.error), /exactly one/i);
    assert.deepEqual(ambiguous.ops, [], 'invalid input selection must be rejected before reading or mutating Studio');
  }
});

test('source_file validates a canonical Lua workspace path and positive integer version before Studio', async () => {
  const kv = fakeKV();
  const invalid = [
    { path: '../escape.luau', version: 1 },
    { path: 'notes/design.md', version: 1 },
    { path: 'lumen/Main.luau', version: 0 },
    { path: 'lumen/Main.lua', version: 1.5 },
    { path: 'lumen/Main.lua', version: '1' },
  ];
  for (const source_file of invalid) {
    const s = studio(kv);
    const res = await T.TOOLS.edit_script.run(s.ctx, { path: TARGET, source_file });
    assert.equal(typeof res.error, 'string', `accepted ${JSON.stringify(source_file)}`);
    assert.deepEqual(s.ops, [], `invalid source_file touched Studio: ${JSON.stringify(source_file)}`);
  }
});

test('source_file refuses an oversized persisted row before Studio even if legacy KV contains one', async () => {
  const kv = fakeKV();
  const tooLarge = 'a'.repeat(W.WORKSPACE_MAX_BYTES + 1);
  await W.kvWorkspace(kv, 'project-A').write('lumen/server/Legacy.luau', tooLarge);
  const s = studio(kv);
  const res = await T.TOOLS.edit_script.run(s.ctx, {
    path: TARGET,
    source_file: { path: 'lumen/server/Legacy.luau', version: 1 },
  });
  assert.match(String(res.error), /larger|byte|limit/i);
  assert.deepEqual(s.ops, [], 'an oversized saved row must not be forwarded to Studio');
});

test('source_file is project-scoped and never falls back for missing, deleted, or renamed versions', async () => {
  const kv = fakeKV();
  const own = W.kvWorkspace(kv, 'project-A');
  const stranger = W.kvWorkspace(kv, 'project-B');
  await stranger.write(FILE, 'print("stranger")\n');

  let s = studio(kv, 'project-A');
  let res = await T.TOOLS.edit_script.run(s.ctx, { path: TARGET, source_file: { path: FILE, version: 1 } });
  assert.match(String(res.error), /version|not.*kept|workspace/i);
  assert.deepEqual(s.ops, [], 'another project workspace must be unreachable');

  await own.write(FILE, V1);
  s = studio(kv);
  res = await T.TOOLS.edit_script.run(s.ctx, { path: TARGET, source_file: { path: FILE, version: 2 } });
  assert.match(String(res.error), /version|not.*kept/i);
  assert.deepEqual(s.ops, [], 'a missing exact version must not fall back to the live file');

  await own.remove(FILE);
  s = studio(kv);
  res = await T.TOOLS.edit_script.run(s.ctx, { path: TARGET, source_file: { path: FILE, version: 1 } });
  assert.match(String(res.error), /version|not.*kept/i);
  assert.deepEqual(s.ops, [], 'trash is not a source_file lookup fallback');

  await own.restore(FILE);
  await own.move(FILE, 'lumen/server/Renamed.luau');
  s = studio(kv);
  res = await T.TOOLS.edit_script.run(s.ctx, { path: TARGET, source_file: { path: FILE, version: 1 } });
  assert.match(String(res.error), /version|not.*kept/i);
  assert.deepEqual(s.ops, [], 'a renamed path must be addressed by its new canonical path');
});

test('source_file preserves the Studio base_hash conflict gate', async () => {
  const kv = fakeKV();
  await W.kvWorkspace(kv, 'project-A').write(FILE, V1);
  const s = studio(kv, 'project-A', 'print("current")\n');
  const res = await T.TOOLS.edit_script.run(s.ctx, {
    path: TARGET,
    source_file: { path: FILE, version: 1 },
    base_hash: 'deadbeef',
  });
  assert.match(String(res.error), /changed since you read it/i);
  assert.equal(s.writes().length, 0);
  assert.equal(s.body(), 'print("current")\n');
});

test('saved syntax errors and asset-loader Luau are refused before any Studio mutation', async () => {
  const kv = fakeKV();
  const store = W.kvWorkspace(kv, 'project-A');
  await store.write('lumen/server/Broken.luau', 'local function broken()\n  return 1\n');
  await store.write('lumen/server/Loader.luau', 'local models = game:GetObjects("rbxassetid://123")\nreturn models\n');

  for (const [path, pattern] of [
    ['lumen/server/Broken.luau', /would not parse/i],
    ['lumen/server/Loader.luau', /asset|ingress|GetObjects|refused/i],
  ]) {
    const s = studio(kv);
    const res = await T.TOOLS.edit_script.run(s.ctx, { path: TARGET, source_file: { path, version: 1 } });
    assert.match(String(res.error), pattern, `${path}: ${JSON.stringify(res)}`);
    assert.equal(s.writes().length, 0, `${path} reached the edit_script mutation`);
  }
});
