/**
 * MODELS THE RUN INSERTED ARE USED BY THE COMPOSER, OR THE RESULT SAYS THEY ARE NOT (round 3, 2026-10-04, E1).
 *
 * The run found four real crystal models, inserted them, renamed them, and then called compose_game: "from 0 library pieces". The
 * machines never took the models, and nothing said so. Now:
 *   - a plot-sim machine the agent left bare (no look, no from) takes one of the models the run inserted and that still stands in the
 *     place, in turn, and the result names which;
 *   - a `from` that names nothing in the place is refused with the models that do exist;
 *   - models the game does not use are listed with how to use them, at spots on the map the composer just built;
 *   - the ledger follows a rename and a delete, so the candidates are the models as they are now.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { newLedger, recordToolCall } from '../src/evidence-ledger.ts';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'compose-inserted-'));
const bundle = (entry, name) => {
  const out = join(tmp, `${name}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', entry), '--bundle', '--format=esm', '--target=es2022', '--platform=node', '--outfile=' + out, '--external:cloudflare:*', '--log-level=error'], { cwd: WORKER, stdio: 'pipe' });
  return import(`file://${out}`);
};
const CT = await bundle('compose-tool.ts', 'tool');
const S = await bundle('world-steps.ts', 'steps');

/** A Studio that has these paths, says yes to everything else, and remembers what it was asked. */
function studio(has = []) {
  const ops = [];
  const exists = new Set(has);
  return {
    ops,
    ctx: {
      env: {}, userId: 'u1', projectId: 'p1', studioConnected: () => true, createCheckpoint: async () => ({ id: 'cp' }), userRequest: () => '',
      execStudioOp: async (op) => {
        ops.push(op);
        const mine = (p) => [...exists].some((e) => p === e || p.startsWith(`${e}.`));
        if (op.op === 'get_instance') return mine(op.path) ? { ok: true, data: {} } : { ok: false, error: 'not found' };
        if (op.op === 'get_tree') return { ok: false, error: 'not found' };
        if (op.op === 'create_instances') { for (const i of op.items) exists.add(`${i.parent}.${i.name}`); return { ok: true, data: {} }; }
        if (op.op === 'spatial_query') return exists.has(op.path) ? { ok: true, data: { center: [0, 3, 0], size: [4, 6, 4], bottomY: 0 } } : { ok: false, error: 'not found' };
        return { ok: true, data: { imported: 1, placed: [], failed: [] } };
      },
    },
  };
}
const withEvidence = (s, inserted) => { s.ctx.evidence = { inserted }; return s; };

const BARE = { title: 'Crystal Sim', subject: 'crystal', currency: 'Crystals', machines: [
  { name: 'Small', price: 25, income: 1 }, { name: 'Medium', price: 100, income: 4 }, { name: 'Large', price: 400, income: 15 }],
upgrades: [{ label: 'Faster', kind: 'perSecond', amount: 1, cost: 40 }] };

test('withInsertedLooks: only a bare machine is filled, in turn, and a machine that names its model is never changed', () => {
  const r = CT.withInsertedLooks({ ...BARE, machines: [{ name: 'A' }, { name: 'B', from: 'Workspace.Mine' }, { name: 'C', look: { gameId: 'aabbccdd', path: '/x' } }, { name: 'D' }, { name: 'E' }] }, ['Workspace.X', 'Workspace.Y']);
  assert.deepEqual(r.plotSim.machines.map((m) => m.from ?? null), ['Workspace.X', 'Workspace.Mine', null, 'Workspace.Y', 'Workspace.X']);
  assert.deepEqual(r.filled, [{ index: 0, from: 'Workspace.X' }, { index: 3, from: 'Workspace.Y' }, { index: 4, from: 'Workspace.X' }]);
  assert.equal(r.plotSim.machines[2].look.gameId, 'aabbccdd');
  assert.deepEqual(CT.withInsertedLooks(BARE, []).filled, [], 'nothing inserted: nothing filled');
  assert.equal(CT.withInsertedLooks(undefined, ['Workspace.X']).plotSim, undefined);
  assert.equal(BARE.machines[0].from, undefined, 'the argument is not mutated');
});

test('compose_game takes the models the run inserted as the machines of a bare plot simulator, and says which', async () => {
  const s = withEvidence(studio(['game.Workspace.Crystal1', 'game.Workspace.Crystal2']), ['game.Workspace.Crystal1', 'game.Workspace.Crystal2']);
  const r = await CT.composeGame(s.ctx, { request: 'x', template: 'plot-sim', plotSim: BARE });
  assert.equal(r.template, 'plot-sim', JSON.stringify(r).slice(0, 400));
  assert.deepEqual(r.machinesFromYourModels, ['machines[0] "Small" uses Workspace.Crystal1', 'machines[1] "Medium" uses Workspace.Crystal2', 'machines[2] "Large" uses Workspace.Crystal1']);
  const config = s.ops.find((o) => o.op === 'edit_script' && /AppleGameConfig/.test(o.path)).source;
  assert.match(config, /Workspace\.Crystal1/);
  assert.match(config, /Workspace\.Crystal2/);
  assert.deepEqual(r.yourModels.unused, [], 'both are used by the machines');
  assert.equal(r.yourModels.note, undefined);
});

test('a model the run renamed or deleted is not offered: only what still stands in the place', async () => {
  // the ledger says Crystal1 and Gone; the place has only Crystal1
  const s = withEvidence(studio(['game.Workspace.Crystal1']), ['game.Workspace.Gone', 'game.Workspace.Crystal1']);
  assert.deepEqual(await CT.liveInsertedFrom(s.ctx), ['Workspace.Crystal1']);
  const r = await CT.composeGame(s.ctx, { request: 'x', template: 'plot-sim', plotSim: BARE });
  assert.deepEqual(r.machinesFromYourModels.map((m) => m.split(' uses ')[1]), ['Workspace.Crystal1', 'Workspace.Crystal1', 'Workspace.Crystal1']);
});

test('a machine `from` that names nothing in the place is refused with the models that do exist', async () => {
  const s = withEvidence(studio(['game.Workspace.Crystal1']), ['game.Workspace.Crystal1']);
  const bad = { ...BARE, machines: [{ name: 'Small', price: 25, income: 1, from: 'Workspace.Misspelt' }, ...BARE.machines.slice(1)] };
  const r = await CT.composeGame(s.ctx, { request: 'x', template: 'plot-sim', plotSim: bad });
  assert.equal(r.changed, false);
  assert.match(r.error, /machines\[0\]\.from: game\.Workspace\.Misspelt is not in the place/);
  assert.match(r.error, /"Workspace\.Crystal1"/, 'and the model that is there');
  assert.deepEqual(r.missing, ['machines[0].from']);
  assert.equal(s.ops.some((o) => o.op === 'create_instances'), false, 'nothing was built');
  const none = await CT.composeGame(studio().ctx, { request: 'x', template: 'plot-sim', plotSim: { ...BARE, machines: BARE.machines.map((m) => ({ ...m, from: 'Workspace.Misspelt' })) } });
  assert.match(none.error, /Insert a model first/);
});

test('models the game does not use are listed with how to use them, at spots on the map just built', async () => {
  const s = withEvidence(studio(['game.Workspace.Crystal1', 'game.Workspace.Crystal2', 'game.Workspace.Crystal3']), ['game.Workspace.Crystal1', 'game.Workspace.Crystal2', 'game.Workspace.Crystal3']);
  // the agent named a library look for every machine and one model of its own: three inserted models, one used
  const own = { ...BARE, machines: [
    { name: 'Small', price: 25, income: 1, from: 'Workspace.Crystal1' },
    { name: 'Medium', price: 100, income: 4, look: { gameId: 'aabbccdd1122', path: '/Workspace/Gadget' } },
    { name: 'Large', price: 400, income: 15, look: { gameId: 'aabbccdd1122', path: '/Workspace/Gadget#2' } }] };
  const r = await CT.composeGame(s.ctx, { request: 'x', template: 'plot-sim', plotSim: own });
  assert.equal(r.template, 'plot-sim', JSON.stringify(r).slice(0, 300));
  assert.equal(r.machinesFromYourModels, undefined, 'nothing was filled in: every machine named its own');
  assert.deepEqual(r.yourModels.used, ['Workspace.Crystal1']);
  assert.deepEqual(r.yourModels.unused, ['Workspace.Crystal2', 'Workspace.Crystal3']);
  assert.match(r.yourModels.note, /NOT part of the game yet: "Workspace\.Crystal2", "Workspace\.Crystal3"/);
  assert.match(r.yourModels.note, /clone_instances \(paths \["game\.Workspace\.Crystal2", "game\.Workspace\.Crystal3"\], at \[\[-?\d+, 0, -?\d+\]/, 'with spots to give it');
  assert.match(r.yourModels.note, /existing "replace"/);
  // the spots are on the map: the composer's own bounds say so
  const spots = [...r.yourModels.note.matchAll(/\[(-?\d+), 0, (-?\d+)\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.ok(spots.length >= 4);
  for (const [x, z] of spots) assert.ok(Math.abs(x - r.map.ground.center[0]) <= r.map.ground.half[0] && Math.abs(z - r.map.ground.center[1]) <= r.map.ground.half[1], `spot ${x},${z} is off the island`);
});

test('the composer result carries the map in numbers: bounds, hub, plots, free ground', async () => {
  const r = await CT.composeGame(studio().ctx, { request: 'x', template: 'plot-sim', plotSim: { ...BARE, machines: BARE.machines.map((m) => ({ ...m, look: { gameId: 'aabbccdd1122', path: '/Workspace/G' } })), players: 4 } });
  const map = r.map;
  assert.equal(map.root, 'game.Workspace.AppleMap');
  assert.equal(map.plots.length, 4);
  assert.match(map.plots[0].path, /^game\.Workspace\.AppleMap\.Plots\.Plot1$/);
  assert.match(map.hub.path, /AppleMap\.Hub$/);
  assert.ok(map.ground.half[0] > 60 && map.free.length === 8);
  assert.equal(r.yourModels, undefined, 'nothing inserted: nothing to report');
});

test('the ledger follows a rename and a delete, and keeps names with spaces (an insert names a taken model "Thing (2)")', () => {
  const l = newLedger();
  const mutation = (tool, args, result = {}) => ({ tool, kind: 'mutation', args, result, ok: true });
  recordToolCall(l, mutation('insert_library_model', {}, { inserted: ['game.Workspace.Crystal'] }));
  recordToolCall(l, mutation('insert_library_model', {}, { inserted: ['game.Workspace["Crystal (2)"]'] }));
  recordToolCall(l, mutation('insert_library_model', {}, { inserted: ['game.Workspace.Crystal3'] }));
  assert.deepEqual(CT.insertedFromCandidates({ evidence: l }), ['Workspace.Crystal', 'Workspace.Crystal (2)', 'Workspace.Crystal3'], 'a bracketed name is a direct child of the workspace too');
  recordToolCall(l, mutation('rename_instance', { path: 'game.Workspace.Crystal', name: 'Crystal A' }));
  recordToolCall(l, mutation('rename_instance', { path: 'game.Workspace["Crystal (2)"]', name: 'CrystalB' }));
  recordToolCall(l, mutation('delete_instances', { paths: ['game.Workspace.Crystal3'] }));
  assert.deepEqual(l.inserted, ['game.Workspace["Crystal A"]', 'game.Workspace.CrystalB'], 'renamed in place, deleted gone');
  assert.deepEqual(CT.insertedFromCandidates({ evidence: l }), ['Workspace.Crystal A', 'Workspace.CrystalB']);
});

test('placementSpots: beside each plot first (outside its frame, away from the hub), then free ground, never more than asked', () => {
  const map = {
    root: 'game.Workspace.AppleMap', ground: { center: [0, 0], half: [150, 150] }, hub: { path: 'h', center: [0, 0], half: 36 }, frame: 19,
    plots: [{ path: 'p1', at: [80, 0] }, { path: 'p2', at: [0, 80] }], free: [[-90, -90], [100, -100], [-100, 100]],
  };
  const spots = S.placementSpots(map, 4);
  assert.deepEqual(spots, [[105, 0, 0], [0, 0, 105], [-90, 0, -90], [100, 0, -100]], 'a plot at 80 east: a spot 25 further east');
  assert.equal(S.placementSpots(map, 1).length, 1);
  assert.equal(S.placementSpots({ ...map, plots: [], free: [] }, 5).length, 0);
});
