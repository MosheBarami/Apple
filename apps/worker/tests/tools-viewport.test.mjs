/**
 * The viewport/selection helpers and the direct manipulation surface.
 *
 * `select` and `viewport_info` have had plugin handlers and StudioOp members since they were
 * written, reachable only behind ADMIN_STUDIO_OPS. Both are non-destructive: one replaces the
 * user's selection, the other reads the camera and a bounded spatial summary. Registering them
 * lets the agent finish an edit the way a person would — point the camera at the thing and hand
 * over the selection so the user's next drag lands on it — and lets it place geometry relative to
 * what exists rather than guessing at coordinates.
 *
 * Direct manipulation is now deliberately exposed through bounded typed tools; undo_waypoint stays
 * internal to the checkpoint/history surface rather than becoming a model-facing escape hatch.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'vp-')), 'vp.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const T = await import(`file://${out}`);

function stubCtx(data = { ok: true }) {
  const ops = [];
  return { ops, ctx: { env: {}, studioConnected: () => true,
    execStudioOp: async (o) => { ops.push(o); return { ok: true, data } }, addMemoryFact: async () => {} } };
}

test('both are registered and offered only with Studio', () => {
  for (const t of ['select_instances', 'viewport_info']) {
    assert.ok(T.toolNames().includes(t), `${t} is not registered`);
    assert.ok(T.toolDefs(true, undefined).map((d) => d.name).includes(t));
    assert.equal(T.toolDefs(false, undefined).map((d) => d.name).includes(t), false);
  }
});

test('select_instances sends the paths it was given', async () => {
  const { ctx, ops } = stubCtx({ selected: 2 });
  const res = await T.TOOLS.select_instances.run(ctx, { paths: ['game.Workspace.A', 'game.Workspace.B'] });
  assert.deepEqual(ops[0], { op: 'select', paths: ['game.Workspace.A', 'game.Workspace.B'] });
  assert.equal(res.selected, 2);
});

test('select_instances drops junk entries and refuses an empty list', async () => {
  const { ctx, ops } = stubCtx({ selected: 1 });
  await T.TOOLS.select_instances.run(ctx, { paths: ['game.Workspace.A', '', '  ', 42, null] });
  assert.deepEqual(ops[0].paths, ['game.Workspace.A'], 'only real paths may be sent');

  for (const bad of [{ paths: [] }, { paths: ['', '   '] }, {}, { paths: 'not an array' }]) {
    const s = stubCtx();
    const res = await T.TOOLS.select_instances.run(s.ctx, bad);
    assert.match(String(res.error), /non-empty array/);
    assert.equal(s.ops.length, 0, `${JSON.stringify(bad)} reached Studio`);
  }
});

test('select_instances is bounded, so a huge list cannot be forwarded whole', async () => {
  const { ctx, ops } = stubCtx({ selected: 100 });
  await T.TOOLS.select_instances.run(ctx, { paths: Array.from({ length: 500 }, (_, i) => `game.Workspace.P${i}`) });
  assert.equal(ops[0].paths.length, 100);
});

test('viewport_info takes no arguments and asks for the viewport', async () => {
  const { ctx, ops } = stubCtx({ camera: { fov: 70 }, spatial: [] });
  const res = await T.TOOLS.viewport_info.run(ctx, {});
  assert.deepEqual(ops[0], { op: 'viewport_info' });
  assert.equal(res.camera.fov, 70);
});

test('direct reparenting is registered while undo_waypoint stays internal', () => {
  const names = T.toolNames();
  assert.equal(names.includes('move_instances'), true,
    'the typed reparenting op must be reachable by Agent');
  assert.equal(names.includes('undo_waypoint'), false,
    'undo_waypoint drives ChangeHistoryService, which is the restore surface');
});
