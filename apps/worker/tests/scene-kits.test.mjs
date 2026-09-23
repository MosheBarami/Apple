// The floating-island kit (2026-09-23): five default-model sky islands never looked right; the kit's
// geometry is fixed and tested here instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'kit-')), 'k.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'scene-kits.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out], { cwd: WORKER, stdio: 'pipe' });
const { floatingIslandKit, countNodes, crystalCluster } = await import(`file://${out}`);

const cells = (sx, sy, sz) => Math.ceil(sx / 4) * Math.ceil(sy / 4) * Math.ceil(sz / 4);
const budget = (op) => op.action === 'fill_ball' ? cells(op.radius * 2, op.radius * 2, op.radius * 2)
  : op.action === 'fill_block' ? cells(...op.size)
  : cells(...op.max.map((v, i) => v - op.min[i] + 8));

function parts(item, out = []) {
  if (item.className === 'Part') out.push(item);
  for (const c of item.children ?? []) parts(c, out);
  return out;
}
const pos = (p) => p.props.CFrame.v.slice(0, 3);
const size = (p) => p.props.Size.v;

test('the kit fits the plugin: under 400 created nodes, every terrain step inside the voxel ceiling', () => {
  for (const radius of [20, 50, 70]) {
    const kit = floatingIslandKit({ radius, trees: 6, crystals: 5 });
    assert.ok(!('error' in kit), JSON.stringify(kit));
    assert.ok(countNodes(kit.items) < 400, `${countNodes(kit.items)} nodes`);
    assert.ok(kit.terrain.length <= 32, 'one edit_terrain batch');
    for (const op of kit.terrain) assert.ok(budget(op) <= 65536, `${op.action} spans ${budget(op)}`);
  }
});

test('trees are 30-45 studs, stand on the surface, and sit inside the island', () => {
  const kit = floatingIslandKit({ center: [0, 150, 0], radius: 50 });
  const folder = kit.items[0];
  assert.equal(folder.name, 'SkyIsland');
  const trees = folder.children.filter((c) => c.name.startsWith('Tree'));
  assert.equal(trees.length, 4);
  for (const t of trees) {
    const ps = parts(t);
    const bottom = Math.min(...ps.map((p) => pos(p)[1] - size(p)[1] / 2));
    const top = Math.max(...ps.map((p) => pos(p)[1] + size(p)[1] / 2));
    assert.ok(Math.abs(bottom - (kit.facts.surfaceY - 0.5)) < 1, `${t.name} floats or sinks: bottom ${bottom}`);
    assert.ok(top - bottom >= 30 && top - bottom <= 45, `${t.name} is ${top - bottom} studs tall`);
    const trunk = ps.find((p) => p.name === 'Trunk1');
    assert.ok(Math.hypot(pos(trunk)[0], pos(trunk)[2]) < kit.facts.usableRadius, `${t.name} stands off the edge`);
    assert.ok(ps.filter((p) => p.name.startsWith('Leaves')).length >= 5, 'a canopy of several balls, not one lollipop');
  }
});

test('crystal spikes are rotated, not stretched, and the tallest is taller than a player', () => {
  const c = crystalCluster('C', [0, 100, 0], 1, 'cyan');
  const spikes = parts(c);
  assert.equal(spikes.length, 7);
  for (const s of spikes) {
    const m = s.props.CFrame.v.slice(3);
    const col = (j) => [m[j], m[3 + j], m[6 + j]];
    for (let j = 0; j < 3; j++) assert.ok(Math.abs(Math.hypot(...col(j)) - 1) < 1e-3, 'rotation columns are unit length');
    assert.equal(s.props.Material.v, 'Enum.Material.Neon');
  }
  assert.ok(Math.max(...spikes.map((s) => size(s)[1])) > 5.5, 'at least one spike is taller than a 5-stud player');
  assert.ok(spikes[0].children?.some((k) => k.className === 'PointLight'), 'the cluster lights its surroundings');
});

test('the kit hides nothing it does not name: one folder, and a spawn on the island', () => {
  const kit = floatingIslandKit({});
  assert.equal(kit.items.length, 1);
  assert.equal(kit.items[0].parent, 'Workspace');
  assert.ok(Math.abs(kit.spawn[1] - (kit.facts.surfaceY + 1)) < 0.01);
  assert.match(floatingIslandKit({ radius: 500 }).error, /radius/);
});
