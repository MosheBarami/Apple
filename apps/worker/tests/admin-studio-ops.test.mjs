/**
 * The admin diagnostics route forwards an allowlist of Studio ops (an admin key is not a way around the asset gate).
 * The library audit drives two more through it: capture_studio_viewport (what Studio shows) and preload_content
 * (whether asset ids load in this account). Both are read-only. insert_asset stays refused.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = mkdtempSync(join(tmpdir(), 'admin-studio-ops-'));
test.after(() => rmSync(TMP, { recursive: true, force: true }));
const out = join(TMP, 'worker.mjs');
await esbuild.build({ entryPoints: [join(WORKER, 'src', 'index.ts')], bundle: true, format: 'esm', target: 'es2022', outfile: out, logLevel: 'silent',
  alias: { 'cloudflare:workers': join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs') } });
const worker = (await import(pathToFileURL(out).href)).default;

async function adminOp(op) {
  const forwarded = [];
  const env = { ADMIN_KEY: 'test-admin-key', SESSION_DO: { idFromName: (n) => n, get: () => ({ fetch: async (_url, init) => {
    forwarded.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ ok: true, data: { forwarded: true } }), { headers: { 'content-type': 'application/json' } });
  } }) } };
  const res = await worker.fetch(new Request('https://apple.test/api/admin/studio-op/9f1c1f2a-0000-4000-8000-000000000001', {
    method: 'POST', headers: { 'X-Admin-Key': 'test-admin-key', 'Content-Type': 'application/json' }, body: JSON.stringify({ op, timeoutMs: 5000 }),
  }), env);
  return { status: res.status, body: await res.json(), forwarded };
}

test('preload_content and capture_studio_viewport reach the paired plugin through the admin route', async () => {
  for (const op of [
    { op: 'preload_content', items: [{ id: 'rbxassetid://1234', type: 'image' }], timeoutMs: 20000 },
    { op: 'capture_studio_viewport' },
  ]) {
    const r = await adminOp(op);
    assert.equal(r.status, 200, `${op.op} was refused: ${JSON.stringify(r.body)}`);
    assert.equal(r.forwarded.length, 1, `${op.op} never reached the session`);
    assert.equal(r.forwarded[0].op?.op ?? r.forwarded[0].op, op.op);
  }
});

test('the ops that bring content in from outside are still refused', async () => {
  for (const op of [{ op: 'insert_asset', assetId: 1, parent: 'game.Workspace' }, { op: 'import_owner_library', gameId: 'abcdef012345', path: '/Workspace', mode: 'children', parent: 'game.Workspace' }]) {
    const r = await adminOp(op);
    assert.equal(r.status, 400);
    assert.match(r.body.error, /not a diagnostics op/);
    assert.deepEqual(r.forwarded, [], 'nothing may reach the session');
  }
});
