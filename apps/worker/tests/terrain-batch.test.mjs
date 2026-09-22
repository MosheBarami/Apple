// A hill in one call, not 149. Measured 2026-09-22 (run d1a97c0d): "a grassy hill with a small pond"
// took 149 single-operation edit_terrain calls — 152 paid steps, 450 Credits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(tmpdir(), `apple-terrain-batch-${process.pid}.mjs`);
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${out}`], { cwd: WORKER, stdio: 'pipe' });
const T = await import(`file://${out}`);
rmSync(out, { force: true });

const ball = (y, r) => ({ action: 'fill_ball', center: [-120, y, 0], radius: r, material: 'Enum.Material.Grass' });
const ctxWith = (answer) => {
  const ops = [];
  return { ops, ctx: { env: {}, studioConnected: () => true, execStudioOp: async (op) => { ops.push(op); return answer(op, ops.length); } } };
};

test('one call carries a whole feature, in order, and is still a writer', async () => {
  const { ops, ctx } = ctxWith(() => ({ ok: true, data: { voxelsBound: 10 } }));
  const res = await T.TOOLS.edit_terrain.run(ctx, { operations: [ball(10, 30), ball(20, 20), ball(28, 10)] });
  assert.equal(res.error, undefined, JSON.stringify(res));
  assert.equal(res.completed, 3);
  assert.deepEqual(ops.map((o) => [o.op, o.action, o.radius]), [['terrain_edit', 'fill_ball', 30], ['terrain_edit', 'fill_ball', 20], ['terrain_edit', 'fill_ball', 10]]);
  assert.equal(ops.some((o) => 'operations' in o), false, 'the batch must be unpacked, never sent to the plugin as one op');
  assert.equal(T.TOOLS.edit_terrain.mutatesProject, true);
});

test('a failure part-way stops the batch and says the earlier work is already in the place', async () => {
  const { ops, ctx } = ctxWith((_op, n) => (n === 2 ? { ok: false, error: 'terrain edit spans 70000 voxels; limit is 65536' } : { ok: true, data: {} }));
  const res = await T.TOOLS.edit_terrain.run(ctx, { operations: [ball(10, 30), ball(20, 90), ball(28, 10)] });
  assert.match(String(res.error), /limit is 65536/);
  assert.equal(res.failedAt, 1);
  assert.equal(res.completed, 1);
  assert.equal(res.projectMutated, true, 'one operation already changed the place');
  assert.equal(ops.length, 2, 'nothing after the failure runs');
});

test('the batch is bounded, and the description tells the model to use it', async () => {
  const { ops, ctx } = ctxWith(() => ({ ok: true, data: {} }));
  const res = await T.TOOLS.edit_terrain.run(ctx, { operations: Array.from({ length: 33 }, (_, i) => ball(i, 4)) });
  assert.match(String(res.error), /limit is 32/);
  assert.equal(ops.length, 0);
  const def = T.toolDefs(true).find((d) => d.name === 'edit_terrain');
  assert.match(def.description, /ONE CALL: pass operations/);
  assert.ok(def.parameters.properties.operations, 'operations must be in the schema the model sees');
});

test('control: a single action still works exactly as before', async () => {
  const { ops, ctx } = ctxWith(() => ({ ok: true, data: { voxelsBound: 4 } }));
  const res = await T.TOOLS.edit_terrain.run(ctx, ball(10, 8));
  assert.deepEqual(res, { voxelsBound: 4 });
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op, 'terrain_edit');
});
