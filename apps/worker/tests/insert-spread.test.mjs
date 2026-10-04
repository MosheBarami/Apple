/**
 * MODELS THE RUN INSERTS ARE PLACED, NOT STACKED (round 3, 2026-10-04, E1).
 *
 * The run found four real crystal models and inserted them one after another with no position. insert_library_model stands a
 * model on `position` (default the origin), so all four sat at (0, 2, 0) for the rest of the run: stacked in one spot, then never
 * used. Now a model that would stand on one this run already placed moves along +x to the first free spot, and the result says
 * where it went and where the run's other models stand.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = mkdtempSync(join(tmpdir(), 'insert-spread-'));
process.on('exit', () => rmSync(DIR, { recursive: true, force: true }));
const bundle = (rel, name) => {
  const out = join(DIR, `${name}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', rel), '--bundle', '--format=esm', '--target=es2022', '--platform=node', '--outfile=' + out], { cwd: WORKER, stdio: 'pipe' });
  return import(`file://${out}`);
};
const T = await bundle('tools.ts', 'tools');
const L = await bundle('library-placement.ts', 'placement');
const M = await bundle('model-library.ts', 'model-library');
const INDEX = JSON.parse(readFileSync(join(WORKER, '..', '..', 'packages/asset-library/models/index.json'), 'utf8'));
const run = async (c, name, args) => JSON.parse((await T.runTool(c, name, JSON.stringify(args))).resultForLlm);

/** A place that holds the models an insert puts in it, measures them, and moves them, the way the plugin's ops do. */
function place() {
  const centres = new Map(); // path -> centre
  let n = 0;
  const size = [4, 6, 4];
  const ops = [];
  return {
    ops, centres,
    ctx: {
      env: {}, projectId: 'p', userId: 'u', assetSources: { allow: ['creator_store', 'from_scratch'] },
      studioConnected: () => true,
      createCheckpoint: async () => ({ error: 'not used' }), addMemoryFact: async () => 'refused',
      execStudioOp: async (op) => {
        ops.push(op);
        if (op.op === 'insert_asset') { const p = `game.Workspace.Crystal${++n}`; centres.set(p, [0, 3, 0]); return { ok: true, data: { inserted: [p] } }; }
        if (op.op === 'get_tree') return { ok: true, data: { root: { class: 'Model', name: 'Crystal', children: [{ class: 'MeshPart', name: 'Mesh' }] } } };
        if (op.op === 'list_scripts') return { ok: true, data: { scripts: [] } };
        if (op.op === 'spatial_query') { const c = centres.get(op.path); return c ? { ok: true, data: { center: c, size, bottomY: c[1] - size[1] / 2 } } : { ok: false, error: 'not found' }; }
        if (op.op === 'transform_instances') { const c = centres.get(op.paths[0]); if (op.move) centres.set(op.paths[0], c.map((v, i) => v + op.move[i])); return { ok: true, data: {} }; }
        return { ok: false, error: `unexpected ${op.op}` };
      },
    },
  };
}
const row = INDEX.rows.find((r) => r[10] !== true && typeof r[5] === 'number');
const footprint = (centre) => ({ x: centre[0], z: centre[2] });

test('spreadSpot: a free spot stays, an occupied one moves along +x to the first free spot, and the footprints never touch', () => {
  assert.deepEqual(L.spreadSpot([0, 0, 0], 3, []), { x: 0, moved: false, hits: 0 });
  assert.deepEqual(L.spreadSpot([50, 0, 50], 3, [{ x: 0, z: 0, r: 3 }]), { x: 50, moved: false, hits: 0 });
  const placed = [];
  for (let i = 0; i < 12; i++) {
    const spot = L.spreadSpot([0, 0, 0], 3, placed);
    placed.push({ x: spot.x, z: 0, r: 3 });
  }
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
    assert.ok(Math.hypot(placed[i].x - placed[j].x, 0) >= 6, `models ${i} and ${j} are ${Math.abs(placed[i].x - placed[j].x)} apart`);
  }
  assert.equal(new Set(placed.map((p) => p.x)).size, 12, 'twelve distinct spots');
});

test('four models inserted one after another with no position stand apart, and each result says where it went', async () => {
  const { ctx, centres } = place();
  const results = [];
  for (let i = 0; i < 4; i++) results.push(await run(ctx, 'insert_library_model', { id: row[0] }));
  for (const r of results) assert.equal(r.error, undefined, r.error);
  const stood = [...centres.values()].map(footprint);
  for (let i = 0; i < stood.length; i++) for (let j = i + 1; j < stood.length; j++) {
    assert.ok(Math.hypot(stood[i].x - stood[j].x, stood[i].z - stood[j].z) >= 4, `crystal ${i + 1} and ${j + 1} are stacked (${JSON.stringify(stood)})`);
  }
  assert.equal(results[0].placed.spread, undefined, 'the first one is where it was asked to be');
  for (const r of results.slice(1)) assert.match(r.placed.spread, /already placed/);
  // the result names the spot, per model
  results.forEach((r, i) => assert.deepEqual(r.placed.position, [stood[i].x, 0, stood[i].z], `result ${i + 1} reports where model ${i + 1} went`));
  assert.match(results[0].placementNote, /No position was given, so it stands at \(0, 0, 0\)/);
  const last = results[3].placementNote;
  assert.match(last, /Models you placed this run: Crystal1 at \(0, 0, 0\); Crystal2 at/, 'the last result lists every model and where it stands');
  assert.match(last, /Crystal4 at/);
  assert.match(last, /transform_instances/);
  assert.match(last, /clone_instances/);
});

test('a position the agent gave is kept when nothing stands there, and moved off an earlier model when something does', async () => {
  const { ctx, centres } = place();
  const a = await run(ctx, 'insert_library_model', { id: row[0], position: [30, 0, 30] });
  assert.deepEqual(a.placed.position, [30, 0, 30]);
  assert.equal(a.placed.spread, undefined);
  assert.doesNotMatch(a.placementNote, /No position was given/);
  const b = await run(ctx, 'insert_library_model', { id: row[0], position: [30, 0, 30] });
  assert.ok(b.placed.spread, 'the same spot is taken');
  assert.notDeepEqual(b.placed.position, [30, 0, 30]);
  assert.equal(b.placed.position[2], 30, 'it slid along x only');
  const c = await run(ctx, 'insert_library_model', { id: row[0], position: [-30, 0, 0] });
  assert.deepEqual(c.placed.position, [-30, 0, 0], 'a free spot far away is untouched');
  assert.equal(centres.size, 3);
});

test('the run remembers where models stand even when the agent moves on to other tools, and forgets nothing it was told', async () => {
  const { ctx } = place();
  await run(ctx, 'insert_library_model', { id: row[0] });
  assert.equal(ctx.libraryRun.placed.length, 1);
  assert.deepEqual(ctx.libraryRun.placed[0].at, [0, 0, 0]);
  assert.ok(ctx.libraryRun.placed[0].r > 0);
  // placeInserted itself: the same rule when called directly, with the footprint list the run keeps
  const calls = [];
  let centre = [0, 3, 0];
  const exec = async (op) => {
    calls.push(op);
    if (op.op === 'spatial_query') return { ok: true, data: { center: centre, size: [4, 6, 4], bottomY: centre[1] - 3 } };
    if (op.op === 'transform_instances') { centre = centre.map((v, i) => v + op.move[i]); return { ok: true, data: {} }; }
    return { ok: false };
  };
  const out = await M.placeInserted(exec, 'game.Workspace.X', { id: 'x', name: 'X', kind: 'prop' }, { position: [0, 0, 0], avoid: [footprint([0, 0, 0])].map((f) => ({ ...f, r: 3 })) });
  assert.ok(out.spread);
  assert.ok(out.position[0] > 0);
});
