// The tree the model reads is an outline, not the wire JSON. Measured 2026-09-23 (run 867aff43): "List
// the parts inside the StreetLamp model by name" called get_project_tree on the lamp four times — each
// reply was get_tree's JSON cut at MAX_RESULT_CHARS mid-object — and ended with no answer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(tmpdir(), `apple-tree-outline-${process.pid}.mjs`);
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${out}`], { cwd: WORKER, stdio: 'pipe' });
const T = await import(`file://${out}`);
rmSync(out, { force: true });

const part = (path, name) => ({
  path: `${path}.${name}`, name, class: 'Part',
  props: { Position: { t: 'Vector3', v: [1.25, 7.5, -3.125] }, Size: { t: 'Vector3', v: [0.8, 12, 0.8] }, Material: { t: 'Enum', v: 'Enum.Material.Metal' }, Color: { t: 'Color3', v: [0.1, 0.1, 0.12] } },
  attributes: { AppleBuilt: { t: 'string', v: 'vis-01-lamppost' } },
});
const LAMP_PARTS = ['Plinth1', 'Plinth2', 'Plinth3', 'BaseCap', 'Column1', 'Ring1', 'Column2', 'Ring2', 'Column3', 'Ring3', 'Collar', 'Arm', 'LanternBase', 'Glass1', 'Glass2', 'Glass3', 'Glass4', 'LanternRoof', 'Finial', 'Bulb'];
const lamp = { root: { path: 'game.Workspace.StreetLamp', name: 'StreetLamp', class: 'Model', children: LAMP_PARTS.map((n) => part('game.Workspace.StreetLamp', n)) } };

const ctxFor = (data) => ({ env: {}, studioConnected: () => true, execStudioOp: async () => ({ ok: true, data }) });

test('the fixture reproduces the defect: the raw tree is longer than one tool reply', () => {
  assert.ok(JSON.stringify(lamp).length > T.MAX_RESULT_CHARS, 'the fixture is too small to have been cut');
});

test('every part of the lamp is named in a reply that fits, and the UI still gets the full tree', async () => {
  const ctx = ctxFor(lamp);
  const res = await T.runTool(ctx, 'get_project_tree', JSON.stringify({ root: 'game.Workspace.StreetLamp' }));
  assert.equal(res.ok, true, res.resultForLlm);
  assert.ok(res.resultForLlm.length <= T.MAX_RESULT_CHARS, `reply is ${res.resultForLlm.length} chars`);
  assert.doesNotMatch(res.resultForLlm, /\[truncated/, 'nothing may be cut mid-reply');
  for (const name of LAMP_PARTS) assert.match(res.resultForLlm, new RegExp(`\\b${name} \\(Part\\)`), `${name} is missing`);
  assert.equal(JSON.parse(res.resultForLlm).nodes, 21);
  assert.ok(JSON.stringify(res.detail).includes('Enum.Material.Metal'), 'the UI panel keeps the typed tree');
});

test('a tree too big for one reply says how much it left out and how to read a branch', async () => {
  const big = { root: { path: 'game.Workspace', name: 'Workspace', class: 'Workspace', children: Array.from({ length: 40 }, (_, i) => ({
    path: `game.Workspace.Block${i}`, name: `Block${i}`, class: 'Model', children: Array.from({ length: 20 }, (_, k) => part(`game.Workspace.Block${i}`, `P${k}`)),
  })) } };
  const res = await T.runTool(ctxFor(big), 'get_project_tree', JSON.stringify({}));
  const body = JSON.parse(res.resultForLlm);
  assert.equal(body.nodes, 1 + 40 + 800);
  assert.match(body.notShown, /more node\(s\) not shown/);
  assert.match(body.notShown, /root set to a branch such as game\.Workspace\.Block\d+/);
  assert.doesNotMatch(res.resultForLlm, /\[truncated/);
});
