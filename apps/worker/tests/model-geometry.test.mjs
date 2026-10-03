/**
 * model-geometry.ts: the maths the worker uses to read a placed model, and its agreement with the Luau runtime.
 * The hinge formula exists twice (TypeScript here, Luau in packages/components/behave); the cross-check below runs the real
 * Luau with the luau CLI and demands the same numbers, so the worker's "a positive angle carries the part up" is the
 * runtime's behaviour and not a second opinion. All shapes are invented for this test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'geometry-')), 'g.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'model-geometry.ts'), '--bundle', '--format=esm', '--target=es2022', '--platform=node', '--outfile=' + out], { cwd: WORKER, stdio: 'pipe' });
const G = await import(`file://${out}`);

const near = (a, b, why, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${why ?? 'value'}: expected ${b}, got ${a}`);
const nearAll = (a, b, why, eps = 1e-9) => { assert.equal(a.length, b.length, why); a.forEach((x, i) => near(x, b[i], `${why}[${i}]`, eps)); };

test('a point goes to world and back; a turned box maps its axes into the world', () => {
  const turned = [10, 0, 0, 0, 0, 1, 0, 1, 0, -1, 0, 0]; // local +X is world -Z, local +Z is world +X
  nearAll(G.vectorToWorld(turned, [1, 0, 0]), [0, 0, -1], 'local x');
  nearAll(G.pointToWorld(turned, [0, 0, 4]), [14, 0, 0], 'local +Z 4 studs');
  const p = [3, -2, 7];
  nearAll(G.pointToWorld(turned, G.pointToLocal(turned, p)), p, 'round trip');
  nearAll(G.boxPoint(turned, [2, 2, 8], [0, 0, 1]), [14, 0, 0], 'the +Z face of an 8-long box');
});

test('a quarter turn about Y sends +X to -Z (right-hand rule); zero and a full turn change nothing', () => {
  nearAll(G.swingComponents([1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0], [0, 1, 0], 90), [0, 0, -1, 0, 0, 1, 0, 1, 0, -1, 0, 0], 'quarter');
  const c = [1.5, 2, -3, 0, 0, 1, 0, 1, 0, -1, 0, 0];
  nearAll(G.swingComponents(c, [4, 5, 6], [1, 2, 3], 0), c, 'zero');
  nearAll(G.swingComponents(c, [4, 5, 6], [1, 2, 3], 360), c, 'full turn');
  nearAll(G.swingComponents(c, [4, 5, 6], [0, 0, 0], 50), c, 'no axis, no turn');
});

test('boxEdges: twelve edges, four along each axis, each at the corner of the other two', () => {
  const edges = G.boxEdges();
  assert.equal(edges.length, 12);
  for (const axis of ['x', 'y', 'z']) assert.equal(edges.filter((e) => e.axis === axis).length, 4);
  for (const e of edges) {
    const a = 'xyz'.indexOf(e.axis);
    assert.equal(e.pivot[a], 0, 'the component along the edge is 0');
    assert.equal(e.pivot.filter((v) => Math.abs(v) === 1).length, 2, 'the other two sit on a face each');
  }
  assert.equal(new Set(edges.map((e) => `${e.axis}${e.pivot}`)).size, 12, 'all different');
});

test('edgeSamples: the two ends and the middle of an edge, on the box', () => {
  const box = [0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
  const s = G.edgeSamples(box, [4, 0.4, 3], { axis: 'x', pivot: [0, -1, -1] });
  nearAll(s[0], [-2, 0.8, -1.5], 'one end'); nearAll(s[1], [0, 0.8, -1.5], 'middle'); nearAll(s[2], [2, 0.8, -1.5], 'other end');
});

test('pointToBoxDistance: zero inside and on the surface, the straight gap outside, the corner distance past a corner', () => {
  const box = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
  near(G.pointToBoxDistance([0, 0, 0], box, [2, 2, 2]), 0, 'inside');
  near(G.pointToBoxDistance([1, 0, 0], box, [2, 2, 2]), 0, 'on a face');
  near(G.pointToBoxDistance([3, 0, 0], box, [2, 2, 2]), 2, 'two studs off a face');
  near(G.pointToBoxDistance([2, 2, 1], box, [2, 2, 2]), Math.sqrt(2), 'off an edge');
  const turned = [0, 0, 0, 0, 0, 1, 0, 1, 0, -1, 0, 0];
  near(G.pointToBoxDistance([0, 0, 5], turned, [8, 2, 2]), 1, 'a box 8 long in local X reaches z=4 once turned, so z=5 is one stud off');
});

test('dominantAxis and positiveCarries: which way a positive angle takes a part, for a flap hinged on its back-bottom edge', () => {
  assert.equal(G.dominantAxis([0.1, -3, 0.2]), '-y');
  assert.equal(G.dominantAxis([0, 0, 0]), null);
  // a thin box on a base: hinge on the bottom back edge (pivot y=-1, z=-1), axis +X; centre is 0.2 above and 1.5 in front of it
  assert.equal(G.positiveCarries([0, 0.8, -1.5], [1, 0, 0], [0, 1, 0]), '-y', 'a positive angle swings it DOWN into the base');
  assert.equal(G.positiveCarries([0, 0.8, 1.5], [1, 0, 0], [0, 1, 0]), '+y', 'the front edge, same axis: a positive angle lifts the back up');
  assert.equal(G.positiveCarries([0, 1, 0], [0, 1, 0], [0, 1, 0]), null, 'a centre on the axis goes nowhere');
});

function luauSwing(cases) {
  const mod = readFileSync(join(WORKER, '..', '..', 'packages', 'components', 'behave', 'AppleBehave.luau'), 'utf8').replace(/^--!strict\n/, '');
  const calls = cases.map((c, i) => `emit(${i}, AppleBehave.swingComponents({${c.c}}, {${c.pivot}}, {${c.axis}}, ${c.deg}))`).join('\n');
  const body = `local AppleBehave = (function()\n${mod}\nend)()\nlocal function emit(i, t) local s = {}; for k, v in t do s[k] = string.format("%.10f", v) end; print(i .. " " .. table.concat(s, " ")) end\n${calls}\n`;
  const file = join(mkdtempSync(join(tmpdir(), 'geometry-luau-')), 'swing.luau');
  writeFileSync(file, body);
  const res = execFileSync('luau', [file], { encoding: 'utf8' });
  return res.trim().split('\n').map((l) => l.split(' ').slice(1).map(Number));
}

let haveLuau = true;
try { execFileSync('luau', ['--help'], { stdio: 'pipe' }); } catch { haveLuau = false; }

test('swingComponents agrees with the Luau runtime on arbitrary poses, pivots, axes and angles', { skip: haveLuau ? false : 'luau is not on PATH' }, () => {
  const rot = G.swingComponents([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0], [1, 1, 1], 33); // a made-up, non-trivial orientation
  const cases = [
    { c: [1, 2, 3, 1, 0, 0, 0, 1, 0, 0, 0, 1], pivot: [0, 0, 0], axis: [0, 1, 0], deg: 90 },
    { c: [1.5, 2, -3, 0, 0, 1, 0, 1, 0, -1, 0, 0], pivot: [4, 5, 6], axis: [1, 2, 3], deg: 77 },
    { c: [-8, 0.25, 11, ...rot.slice(3)], pivot: [-1, 2, 0.5], axis: [-3, 0.2, 1], deg: -135.5 },
    { c: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], pivot: [0, 0.8, -1.5], axis: [1, 0, 0], deg: -90 },
    { c: [2, 2, 2, ...rot.slice(3)], pivot: [2, 2, 2], axis: [0, 0, 5], deg: 12 },
  ];
  const luau = luauSwing(cases);
  cases.forEach((k, i) => nearAll(G.swingComponents(k.c, k.pivot, k.axis, k.deg), luau[i], `case ${i}`, 1e-8));
});
