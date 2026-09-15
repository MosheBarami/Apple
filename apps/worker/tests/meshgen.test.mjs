/**
 * THE 3D PIPELINE, MEASURED RATHER THAN DESCRIBED.
 *
 * Everything in apps/worker/src/meshgen.ts produces numbers or bytes, so nothing here greps a
 * source file for a phrase. The rule this suite is written against is docs/FAILURES.md:
 * a failure to observe must not render as an observation. Applied to geometry that means:
 *
 *   1. AN EXPORTER IS NOT TESTED BY CALLING IT. It is tested by reading the bytes back with a
 *      parser that was written by someone else for another purpose. The GLB writer is read by
 *      packages/evals/src/glb-inspect.mjs — the repository's own inspector, which already refuses
 *      untriangulated primitives and mis-pivoted meshes — and the OBJ writer is read by a parser
 *      written in this file that knows nothing about how the writer works. If the writer and the
 *      reader disagree about triangle counts, vertex counts or bounds, this suite goes red.
 *
 *   2. A GUARD IS TESTED WITH THE THING IT REFUSES. Every rejection test constructs the violating
 *      input here — a non-manifold mesh with a face removed, a triangle wound backwards, a torus
 *      whose tube is thicker than its ring, `NaN` where a stud count belongs, a part named
 *      "\nv 9999 9999 9999" — and watches the refusal happen. Nothing asserts "the healthy path
 *      still works" and calls that a guard.
 *
 *   3. RELATIONSHIPS, NOT LITERALS. "the sphere has 2208 triangles" is a fact about today's
 *      segment table. "the high tier has strictly more triangles than the low tier, both enclose
 *      the same silhouette, and the tessellated volume rises toward the analytic volume as the
 *      tier rises" is the claim the tier system actually makes.
 *
 * Run with:  node --test tests/meshgen.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const ROOT = join(WORKER, '..', '..');

const out = join(mkdtempSync(join(tmpdir(), 'meshgen-')), 'meshgen.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'meshgen.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const M = await import(`file://${out}`);

/** The repository's own GLB reader. Written for downloaded assets, reused here as an oracle. */
const { inspectGlb, judgeAsset } = await import(`file://${join(ROOT, 'packages', 'evals', 'src', 'glb-inspect.mjs')}`);

// ---------------------------------------------------------------------------------------------
// An OBJ reader that knows nothing about the writer.
// ---------------------------------------------------------------------------------------------

/**
 * Deliberately strict and deliberately naive: it does exactly what a consumer (Blender, a slicer,
 * three.js's OBJLoader) does — accumulate v/vt/vn in file order and resolve `f` against the
 * ONE global 1-based list. The classic OBJ bug is restarting indices per object; a writer with
 * that bug produces a file this reader resolves to the wrong vertices, and the bounds check below
 * is what notices.
 */
function readObj(text) {
  const vertices = [];
  const uvs = [];
  const normals = [];
  const faces = [];
  const objects = [];
  const usemtl = [];
  const mtllib = [];
  let current = null;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    const tag = parts[0];
    if (tag === 'v') vertices.push([Number(parts[1]), Number(parts[2]), Number(parts[3])]);
    else if (tag === 'vt') uvs.push([Number(parts[1]), Number(parts[2])]);
    else if (tag === 'vn') normals.push([Number(parts[1]), Number(parts[2]), Number(parts[3])]);
    else if (tag === 'o' || tag === 'g') { current = parts.slice(1).join(' '); objects.push(current); }
    else if (tag === 'usemtl') usemtl.push(parts[1]);
    else if (tag === 'mtllib') mtllib.push(parts[1]);
    else if (tag === 'f') {
      const corners = parts.slice(1).map((c) => {
        const [v, vt, vn] = c.split('/');
        return { v: Number(v), vt: vt ? Number(vt) : null, vn: vn ? Number(vn) : null };
      });
      faces.push({ corners, object: current });
    }
  }
  return { vertices, uvs, normals, faces, objects, usemtl, mtllib };
}

function readMtl(text) {
  const materials = [];
  let cur = null;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    if (parts[0] === 'newmtl') { cur = { name: parts[1], props: {} }; materials.push(cur); }
    else if (cur) cur.props[parts[0]] = parts.slice(1).map(Number);
  }
  return materials;
}

function boundsOfPoints(points) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const p of points) {
    for (let i = 0; i < 3; i++) {
      if (p[i] < lo[i]) lo[i] = p[i];
      if (p[i] > hi[i]) hi[i] = p[i];
    }
  }
  return { min: lo, max: hi };
}

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

const BOX = { name: 'Base', kind: 'box', size: [4, 1, 4], pos: [0, 0.5, 0], color: [120, 90, 60], material: 'Wood' };

/** The crate from the design prototype, in the productised spec shape. */
const CRATE = {
  id: 'crate',
  name: 'Supply crate',
  intent: 'crate',
  parts: [
    { name: 'Body', kind: 'box', size: [2, 2, 2], pos: [0, 1, 0], color: [138, 90, 43], material: 'Wood' },
    { name: 'BandTop', kind: 'box', size: [2.12, 0.22, 0.22], pos: [0, 1.7, 0], color: [74, 79, 92], material: 'Metal' },
    { name: 'BandLow', kind: 'box', size: [2.12, 0.22, 0.22], pos: [0, 0.3, 0], color: [74, 79, 92], material: 'Metal' },
    { name: 'Latch', kind: 'cylinder', size: [0.3, 0.4, 0.3], pos: [0, 1, 1.0], color: [74, 79, 92], material: 'Metal' },
    { name: 'Light', kind: 'sphere', size: [0.34, 0.34, 0.34], pos: [0, 2.2, 0], color: [122, 229, 130], material: 'Neon' },
  ],
};

const EVERY_KIND = ['box', 'wedge', 'cylinder', 'cone', 'sphere', 'torus'];
const TIERS = ['low', 'standard', 'high'];

function specForKind(kind) {
  if (kind === 'torus') return { kind, size: [3, 0.6, 3], pos: [0, 2, 0], color: [200, 160, 60], material: 'Metal' };
  return { kind, size: [2, 3, 2], pos: [0, 1.5, 0], color: [200, 160, 60], material: 'Metal' };
}

const ok = (r) => {
  assert.equal(r.ok, true, `expected ok, got problems: ${JSON.stringify(r.problems)}`);
  return r;
};

// ---------------------------------------------------------------------------------------------
// A. Part specs — the trust boundary
// ---------------------------------------------------------------------------------------------

test('a well-formed part spec validates and keeps its numbers', () => {
  const r = ok(M.validatePartSpec(BOX));
  assert.deepEqual(r.spec.size, [4, 1, 4]);
  assert.deepEqual(r.spec.pos, [0, 0.5, 0]);
  assert.equal(r.spec.material, 'Wood');
  assert.equal(r.spec.transparency, 0);
  assert.deepEqual(r.spec.rot, [0, 0, 0]);
});

test('an unknown primitive kind is refused, and so are the keys a Record would answer for', () => {
  for (const kind of ['teapot', 'constructor', 'toString', '__proto__', 'hasOwnProperty', '', 42, null]) {
    const r = M.validatePartSpec({ ...BOX, kind });
    assert.equal(r.ok, false, `kind ${JSON.stringify(kind)} should be refused`);
    assert.ok(r.problems.some((p) => p.field === 'kind'), `problem should name 'kind' for ${JSON.stringify(kind)}`);
  }
  // and the allowlist really is the list the pipeline can build
  for (const kind of M.PRIMITIVE_KINDS) assert.equal(M.validatePartSpec({ ...BOX, kind }).ok, true);
});

test('an unknown material is refused — including inherited Object keys', () => {
  for (const material of ['Unobtainium', 'constructor', '__proto__', 'valueOf', 7]) {
    const r = M.validatePartSpec({ ...BOX, material });
    assert.equal(r.ok, false, `material ${JSON.stringify(material)} should be refused`);
    assert.ok(r.problems.some((p) => p.field === 'material'));
  }
});

test('non-finite numbers are refused everywhere a stud count is read', () => {
  const poison = [NaN, Infinity, -Infinity, '4', null, undefined, {}];
  for (const bad of poison) {
    assert.equal(M.validatePartSpec({ ...BOX, size: [bad, 1, 4] }).ok, false, `size ${String(bad)}`);
    assert.equal(M.validatePartSpec({ ...BOX, pos: [0, bad, 0] }).ok, false, `pos ${String(bad)}`);
    assert.equal(M.validatePartSpec({ ...BOX, rot: [0, bad, 0] }).ok, false, `rot ${String(bad)}`);
  }
  // transparency is optional, so `undefined` there is absence; every other poison is still poison
  for (const bad of [NaN, Infinity, -Infinity, '4', null, {}, 1.5, -0.1]) {
    assert.equal(M.validatePartSpec({ ...BOX, transparency: bad }).ok, false, `transparency ${String(bad)}`);
  }
  // a missing required field is refused; a missing optional one is not
  assert.equal(M.validatePartSpec({ ...BOX, size: undefined }).ok, false);
  assert.equal(M.validatePartSpec({ ...BOX, pos: undefined }).ok, false);
  assert.equal(M.validatePartSpec({ ...BOX, rot: undefined, transparency: undefined }).ok, true);
});

test('a part below the engine minimum, or past the part-size ceiling, is refused', () => {
  assert.equal(M.validatePartSpec({ ...BOX, size: [0.01, 1, 4] }).ok, false);
  assert.equal(M.validatePartSpec({ ...BOX, size: [0, 1, 4] }).ok, false);
  assert.equal(M.validatePartSpec({ ...BOX, size: [-4, 1, 4] }).ok, false);
  assert.equal(M.validatePartSpec({ ...BOX, size: [M.MAX_PART_STUDS + 1, 1, 4] }).ok, false);
  assert.equal(M.validatePartSpec({ ...BOX, size: [M.MIN_PART_STUDS, 1, 4] }).ok, true);
});

test('a colour outside 0-255, or fractional, is refused', () => {
  for (const color of [[256, 0, 0], [-1, 0, 0], [0.5, 0, 0], [0, 0], 'red', [NaN, 0, 0]]) {
    assert.equal(M.validatePartSpec({ ...BOX, color }).ok, false, `colour ${JSON.stringify(color)}`);
  }
});

test('a torus whose tube is thicker than its ring radius is refused as degenerate', () => {
  // outer radius 1.0, tube radius 1.1 — the ring radius would be negative and the mesh inverts
  const bad = M.validatePartSpec({ kind: 'torus', size: [2, 2.2, 2], pos: [0, 2, 0], color: [1, 2, 3] });
  assert.equal(bad.ok, false);
  assert.ok(bad.problems.some((p) => p.field === 'size'));
  // and a torus that is not circular in plan cannot be tessellated by the ring formula
  assert.equal(M.validatePartSpec({ kind: 'torus', size: [3, 0.6, 2], pos: [0, 2, 0], color: [1, 2, 3] }).ok, false);
  assert.equal(M.validatePartSpec({ kind: 'torus', size: [3, 0.6, 3], pos: [0, 2, 0], color: [1, 2, 3] }).ok, true);
});

test('an assembly with no parts, or a non-array parts field, is refused', () => {
  assert.equal(M.validateAssemblySpec({ id: 'x', name: 'x', parts: [] }).ok, false);
  assert.equal(M.validateAssemblySpec({ id: 'x', name: 'x', parts: 'lots' }).ok, false);
  assert.equal(M.validateAssemblySpec({ id: 'x', name: 'x' }).ok, false);
  const r = M.validateAssemblySpec({ id: 'x', name: 'x', parts: [BOX, { ...BOX, kind: 'teapot' }] });
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => p.field.startsWith('parts[1]')), `problem should point at the bad part: ${JSON.stringify(r.problems)}`);
});

// ---------------------------------------------------------------------------------------------
// B. Tessellation
// ---------------------------------------------------------------------------------------------

test('every primitive at every tier produces a structurally sound triangle mesh', () => {
  for (const kind of EVERY_KIND) {
    for (const tier of TIERS) {
      const mesh = M.tessellate(ok(M.validatePartSpec(specForKind(kind))).spec, tier);
      const vCount = mesh.positions.length / 3;
      assert.ok(Number.isInteger(vCount) && vCount > 0, `${kind}/${tier} vertex count`);
      assert.equal(mesh.normals.length, mesh.positions.length, `${kind}/${tier} normals`);
      assert.equal(mesh.uvs.length, vCount * 2, `${kind}/${tier} uvs`);
      assert.equal(mesh.indices.length % 3, 0, `${kind}/${tier} indices`);
      assert.ok(mesh.indices.length >= 3, `${kind}/${tier} has triangles`);
      for (const v of mesh.positions) assert.ok(Number.isFinite(v), `${kind}/${tier} position finite`);
      for (const v of mesh.normals) assert.ok(Number.isFinite(v), `${kind}/${tier} normal finite`);
      for (const i of mesh.indices) assert.ok(Number.isInteger(i) && i >= 0 && i < vCount, `${kind}/${tier} index in range`);
    }
  }
});

test('every primitive at every tier welds into a closed, consistently wound solid', () => {
  for (const kind of EVERY_KIND) {
    for (const tier of TIERS) {
      const mesh = M.tessellate(ok(M.validatePartSpec(specForKind(kind))).spec, tier);
      const t = M.topologyOfMesh(mesh);
      assert.equal(t.boundaryEdges, 0, `${kind}/${tier} has ${t.boundaryEdges} open edges — it is not watertight`);
      assert.equal(t.nonManifoldEdges, 0, `${kind}/${tier} has ${t.nonManifoldEdges} non-manifold edges`);
      assert.equal(t.windingConflicts, 0, `${kind}/${tier} has ${t.windingConflicts} reversed triangles`);
      assert.equal(t.degenerateTriangles, 0, `${kind}/${tier} has ${t.degenerateTriangles} zero-area triangles`);
      assert.equal(t.shells, 1, `${kind}/${tier} is ${t.shells} loose shells`);
      assert.ok(t.signedVolume > 0, `${kind}/${tier} winds inside-out (signed volume ${t.signedVolume})`);
    }
  }
});

test('the topology reader is not vacuous — it finds the holes, flips and slivers put in front of it', () => {
  const solid = M.tessellate(ok(M.validatePartSpec(specForKind('box'))).spec, 'standard');
  assert.equal(M.topologyOfMesh(solid).boundaryEdges, 0);

  // a face removed: an open box
  const holed = { ...solid, indices: solid.indices.slice(0, solid.indices.length - 3) };
  assert.ok(M.topologyOfMesh(holed).boundaryEdges > 0, 'a box with a face removed must read as open');
  assert.equal(M.topologyOfMesh(holed).watertight, false);

  // one triangle wound backwards: the surface is closed but inconsistent
  const flipped = { ...solid, indices: solid.indices.slice() };
  const [a, b, c] = [flipped.indices[0], flipped.indices[1], flipped.indices[2]];
  flipped.indices[0] = c; flipped.indices[1] = b; flipped.indices[2] = a;
  assert.ok(M.topologyOfMesh(flipped).windingConflicts > 0, 'a reversed triangle must be reported');

  // a zero-area triangle
  const sliver = { ...solid, indices: [...solid.indices, 0, 0, 1] };
  assert.ok(M.topologyOfMesh(sliver).degenerateTriangles > 0, 'a zero-area triangle must be reported');

  // two boxes that do not touch are two shells
  const far = ok(M.assemble({ id: 'two', name: 'two', parts: [
    { ...BOX, pos: [0, 0.5, 0] },
    { ...BOX, pos: [50, 0.5, 0] },
  ] })).assembly;
  assert.equal(M.topologyOfMesh(M.mergedMesh(far)).shells, 2);
});

test('UVs are generated for every vertex, inside the atlas, and a box unwraps to six disjoint cells', () => {
  for (const kind of EVERY_KIND) {
    const mesh = M.tessellate(ok(M.validatePartSpec(specForKind(kind))).spec, 'standard');
    for (const u of mesh.uvs) assert.ok(Number.isFinite(u) && u >= -1e-9 && u <= 1 + 1e-9, `${kind} uv ${u} outside the atlas`);
  }
  const box = M.tessellate(ok(M.validatePartSpec(BOX)).spec, 'standard');
  const cells = new Set();
  for (let i = 0; i < box.uvs.length; i += 2) {
    const u = Math.min(0.999, Math.max(0, box.uvs[i]));
    const v = Math.min(0.999, Math.max(0, box.uvs[i + 1]));
    cells.add(`${Math.floor(u * 3)},${Math.floor(v * 2)}`);
  }
  assert.equal(cells.size, 6, `a box should unwrap into six disjoint atlas cells, got ${[...cells].join(' ')}`);
});

test('a primitive is inscribed in the size it was asked for, and rises toward the analytic volume with tier', () => {
  for (const kind of EVERY_KIND) {
    const spec = ok(M.validatePartSpec(specForKind(kind))).spec;
    let previous = 0;
    for (const tier of TIERS) {
      const mesh = M.tessellate(spec, tier);
      const b = M.meshBounds(mesh);
      for (let i = 0; i < 3; i++) {
        const span = b.max[i] - b.min[i];
        assert.ok(span <= spec.size[i] + 1e-9, `${kind}/${tier} axis ${i} spills outside the requested size`);
      }
      const vol = M.topologyOfMesh(mesh).signedVolume;
      assert.ok(vol > previous - 1e-12, `${kind}: ${tier} volume ${vol} should not be under the coarser tier's ${previous}`);
      previous = vol;
      assert.ok(vol <= M.analyticVolume(spec) * 1.0001, `${kind}/${tier} volume exceeds the analytic solid`);
    }
    // a curved primitive must actually gain volume from refinement; a box is exact at every tier
    if (kind !== 'box' && kind !== 'wedge') {
      const low = M.topologyOfMesh(M.tessellate(spec, 'low')).signedVolume;
      const high = M.topologyOfMesh(M.tessellate(spec, 'high')).signedVolume;
      assert.ok(high > low * 1.0001, `${kind}: refinement should add volume (${low} -> ${high})`);
      assert.ok(high >= M.analyticVolume(spec) * 0.97, `${kind}: the high tier should be within 3% of the analytic solid`);
    }
  }
  assert.ok(Math.abs(M.topologyOfMesh(M.tessellate(ok(M.validatePartSpec(BOX)).spec, 'low')).signedVolume - 16) < 1e-9);
});

test('the low tier is genuinely cheaper than the high tier and keeps the same silhouette', () => {
  for (const kind of ['cylinder', 'cone', 'sphere', 'torus']) {
    const spec = ok(M.validatePartSpec(specForKind(kind))).spec;
    const low = M.tessellate(spec, 'low');
    const std = M.tessellate(spec, 'standard');
    const high = M.tessellate(spec, 'high');
    const t = (m) => m.indices.length / 3;
    assert.ok(t(low) < t(std) && t(std) < t(high), `${kind} triangles should rise with tier: ${t(low)}/${t(std)}/${t(high)}`);
    assert.ok(t(low) <= M.LOW_POLY_TRIANGLES_PER_PART, `${kind} low tier is ${t(low)} triangles, over the low-poly budget`);
    const bl = M.meshBounds(low);
    const bh = M.meshBounds(high);
    for (let i = 0; i < 3; i++) {
      const spanLow = bl.max[i] - bl.min[i];
      const spanHigh = bh.max[i] - bh.min[i];
      assert.ok(Math.abs(spanLow - spanHigh) <= spanHigh * 0.3 + 1e-9, `${kind} silhouette axis ${i} moved too far between tiers`);
    }
  }
});

// ---------------------------------------------------------------------------------------------
// C. Assembly
// ---------------------------------------------------------------------------------------------

test('an assembly carries the sum of its parts and the union of their bounds', () => {
  const a = ok(M.assemble(CRATE)).assembly;
  assert.equal(a.parts.length, 5);
  assert.equal(a.triangles, a.parts.reduce((n, p) => n + p.triangles, 0));
  assert.equal(a.vertices, a.parts.reduce((n, p) => n + p.mesh.positions.length / 3, 0));
  const union = boundsOfPoints(a.parts.flatMap((p) => [p.bounds.min, p.bounds.max]));
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(a.bounds.min[i] - union.min[i]) < 1e-9, `bounds min axis ${i}`);
    assert.ok(Math.abs(a.bounds.max[i] - union.max[i]) < 1e-9, `bounds max axis ${i}`);
  }
  assert.deepEqual([...a.materials].sort(), ['Metal', 'Neon', 'Wood']);
});

test('rotation is applied to the geometry, not merely recorded', () => {
  const flat = ok(M.assemble({ id: 'r', name: 'r', parts: [{ kind: 'box', size: [4, 1, 1], pos: [0, 0.5, 0], color: [1, 2, 3] }] })).assembly;
  const turned = ok(M.assemble({ id: 'r', name: 'r', parts: [{ kind: 'box', size: [4, 1, 1], pos: [0, 0.5, 0], rot: [0, Math.PI / 2, 0], color: [1, 2, 3] }] })).assembly;
  const span = (b) => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
  const s0 = span(flat.bounds);
  const s1 = span(turned.bounds);
  assert.ok(Math.abs(s0[0] - 4) < 1e-9 && Math.abs(s0[2] - 1) < 1e-9, `unrotated span ${s0}`);
  assert.ok(Math.abs(s1[0] - 1) < 1e-9 && Math.abs(s1[2] - 4) < 1e-9, `a 90 degree Y turn should swap X and Z, got ${s1}`);
  // and the normals turn with it
  const n = turned.parts[0].mesh.normals;
  let sawX = false;
  for (let i = 0; i < n.length; i += 3) if (Math.abs(n[i]) > 0.99) sawX = true;
  assert.ok(sawX, 'a rotated box must still have axis-aligned face normals');
});

test('originAtBase puts the model on the floor and centres it, which is what the asset judge demands', () => {
  const raised = ok(M.assemble(CRATE, { originAtBase: true })).assembly;
  assert.ok(Math.abs(raised.bounds.min[1]) < 1e-9, `base should sit at y=0, got ${raised.bounds.min[1]}`);
  assert.ok(Math.abs((raised.bounds.min[0] + raised.bounds.max[0]) / 2) < 1e-9);
  assert.ok(Math.abs((raised.bounds.min[2] + raised.bounds.max[2]) / 2) < 1e-9);
  const asIs = ok(M.assemble(CRATE, { originAtBase: false })).assembly;
  const sunk = ok(M.assemble({ ...CRATE, parts: CRATE.parts.map((p) => ({ ...p, pos: [p.pos[0] + 12, p.pos[1] - 7, p.pos[2]] })) }, { originAtBase: false })).assembly;
  assert.ok(Math.abs(sunk.bounds.min[1] - (asIs.bounds.min[1] - 7)) < 1e-6, `without the flag the model stays where it was put, got ${sunk.bounds.min[1]}`);
  assert.ok(Math.abs(sunk.bounds.min[0] - (asIs.bounds.min[0] + 12)) < 1e-6, `and it stays where it was put laterally too, got ${sunk.bounds.min[0]}`);
});

test('an assembly that would blow the EditableMesh ceiling is refused, not silently shipped', () => {
  const many = { id: 'heavy', name: 'heavy', parts: Array.from({ length: 200 }, (_, i) => ({
    kind: 'sphere', size: [2, 2, 2], pos: [i * 3, 1, 0], color: [10, 10, 10], material: 'Plastic',
  })) };
  const r = M.assemble(many, { quality: 'high' });
  assert.equal(r.ok, false, 'a 200-sphere high-tier assembly must be refused');
  assert.ok(r.problems.some((p) => p.field === 'triangles'), JSON.stringify(r.problems));
  assert.ok(r.problems.some((p) => String(p.detail).includes(String(M.MESH_LIMITS.hardTriangleCeiling))));
  // the same parts at the low tier fit, which is what makes the refusal a budget and not a wall
  assert.equal(M.assemble(many, { quality: 'low' }).ok, true);
});

test('planQuality picks the richest tier that fits the budget, and says so when none does', () => {
  const parts = CRATE.parts;
  const generous = M.planQuality(parts, 100000);
  assert.equal(generous.tier, 'high');
  assert.equal(generous.ok, true);
  const tight = M.planQuality(parts, 400);
  assert.equal(tight.ok, true);
  assert.ok(tight.triangles <= 400);
  assert.ok(TIERS.indexOf(tight.tier) < TIERS.indexOf(generous.tier), `a tight budget should step the tier down, got ${tight.tier}`);
  const impossible = M.planQuality(parts, 10);
  assert.equal(impossible.ok, false, 'a budget below the cheapest tier must be reported, not rounded away');
  assert.ok(impossible.triangles > 10);
  for (const bad of [NaN, Infinity, -1, '5000', null]) {
    assert.equal(M.planQuality(parts, bad).ok, false, `budget ${String(bad)} must be refused`);
  }
});

// ---------------------------------------------------------------------------------------------
// D. LOD
// ---------------------------------------------------------------------------------------------

test('an LOD chain drops triangles at every step while keeping the silhouette and gaining distance', () => {
  const r = M.generateLods(CRATE, { levels: 3 });
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.equal(r.levels.length, 3);
  for (let i = 1; i < r.levels.length; i++) {
    assert.ok(r.levels[i].triangles < r.levels[i - 1].triangles,
      `LOD${i} (${r.levels[i].triangles}) must be cheaper than LOD${i - 1} (${r.levels[i - 1].triangles})`);
    assert.ok(r.levels[i].minViewDistanceStuds > r.levels[i - 1].minViewDistanceStuds,
      'each LOD must take over further away than the one before it');
    for (let a = 0; a < 3; a++) {
      const s0 = r.levels[0].bounds.max[a] - r.levels[0].bounds.min[a];
      const sN = r.levels[i].bounds.max[a] - r.levels[i].bounds.min[a];
      assert.ok(Math.abs(s0 - sN) <= s0 * 0.35 + 1e-9, `LOD${i} silhouette axis ${a} moved ${s0} -> ${sN}`);
    }
  }
  assert.equal(r.levels[0].level, 0);
  assert.equal(r.levels[0].minViewDistanceStuds, 0);
});

test('an LOD chain cannot be asked for a level count it cannot produce', () => {
  for (const levels of [0, 1, 4, 2.5, NaN, Infinity, '3']) {
    assert.equal(M.generateLods(CRATE, { levels }).ok, false, `levels=${String(levels)} must be refused`);
  }
  assert.equal(M.generateLods(CRATE, { levels: 2 }).ok, true);
});

// ---------------------------------------------------------------------------------------------
// E. Seeded variation
// ---------------------------------------------------------------------------------------------

test('the same seed rebuilds the same model, a different seed does not', () => {
  const a = M.variantOf(CRATE, 4242);
  const b = M.variantOf(CRATE, 4242);
  const c = M.variantOf(CRATE, 4243);
  assert.deepEqual(a, b, 'a seed is a promise: same seed, same model');
  assert.notDeepEqual(a, c, 'a different seed must actually change something');
  assert.equal(a.seed, 4242);
  // and the geometry the seed produces is identical byte for byte through the exporter
  const ga = M.exportGlb(ok(M.assemble(a)).assembly);
  const gb = M.exportGlb(ok(M.assemble(b)).assembly);
  assert.deepEqual(Buffer.from(ga), Buffer.from(gb), 'the same seed must export identical bytes');
});

test('a variant is still a legal model, even under jitter that would otherwise break it', () => {
  const brutal = { sizeJitter: 0.95, hueJitter: 1, posJitter: 0.9 };
  for (let seed = 1; seed <= 25; seed++) {
    const v = M.variantOf(CRATE, seed, brutal);
    const r = M.validateAssemblySpec(v);
    assert.equal(r.ok, true, `seed ${seed} produced an invalid variant: ${JSON.stringify(r.problems)}`);
    for (const p of v.parts) {
      for (const s of p.size) assert.ok(s >= M.MIN_PART_STUDS, `seed ${seed} shrank a part to ${s}`);
      for (const ch of p.color) assert.ok(Number.isInteger(ch) && ch >= 0 && ch <= 255, `seed ${seed} colour ${ch}`);
    }
    assert.ok(M.assemble(v).ok, `seed ${seed} produced an unassemblable variant`);
  }
});

test('a seed that is not a whole number is refused rather than silently becoming NaN', () => {
  for (const seed of [NaN, Infinity, -Infinity, 1.5, '7', null, undefined, {}]) {
    assert.throws(() => M.variantOf(CRATE, seed), /seed/i, `seed ${String(seed)} must be refused`);
  }
  // the generator itself refuses too — nothing downstream should have to remember
  for (const seed of [NaN, Infinity, 2.5]) assert.throws(() => M.seededRandom(seed), /seed/i);
  const rng = M.seededRandom(1);
  for (let i = 0; i < 200; i++) {
    const v = rng();
    assert.ok(Number.isFinite(v) && v >= 0 && v < 1, `rng produced ${v}`);
  }
});

test('a family of variants is distinct, and every one of them differs from the base', () => {
  const family = M.variantsOf(CRATE, 6, { sizeJitter: 0.2, hueJitter: 0.3 });
  assert.equal(family.length, 6);
  const seen = new Set(family.map((v) => JSON.stringify(v.parts)));
  assert.equal(seen.size, 6, 'six variants that are really four is a menu that lies');
  for (const v of family) assert.notDeepEqual(v.parts, CRATE.parts);
  assert.equal(new Set(family.map((v) => v.seed)).size, 6);
});

// ---------------------------------------------------------------------------------------------
// F. Collision
// ---------------------------------------------------------------------------------------------

test('every collision fidelity encloses every vertex of the visual mesh', () => {
  const a = ok(M.assemble(CRATE, { quality: 'high' })).assembly;
  for (const fidelity of M.COLLISION_FIDELITIES) {
    const proxy = M.collisionProxy(a, fidelity);
    const report = M.proxyContainsMesh(proxy, a);
    assert.equal(report.contained, true, `${fidelity} leaves ${report.escaped} vertices outside the collision hull`);
    assert.ok(proxy.boxes.length >= 1);
  }
});

test('the containment check is not vacuous — a shrunken proxy fails it', () => {
  const a = ok(M.assemble(CRATE)).assembly;
  const proxy = M.collisionProxy(a, 'per_part');
  const shrunk = { ...proxy, boxes: proxy.boxes.map((b) => ({ ...b, size: [b.size[0] * 0.5, b.size[1] * 0.5, b.size[2] * 0.5] })) };
  const report = M.proxyContainsMesh(shrunk, a);
  assert.equal(report.contained, false, 'halving every collision box must leave geometry outside it');
  assert.ok(report.escaped > 0);
});

test('collision fidelity is a real cost ladder, and always cheaper than the visual mesh', () => {
  const a = ok(M.assemble(CRATE, { quality: 'high' })).assembly;
  const box = M.collisionProxy(a, 'box');
  const clustered = M.collisionProxy(a, 'clustered');
  const perPart = M.collisionProxy(a, 'per_part');
  assert.ok(box.triangles <= clustered.triangles, `box ${box.triangles} <= clustered ${clustered.triangles}`);
  assert.ok(clustered.triangles <= perPart.triangles, `clustered ${clustered.triangles} <= per_part ${perPart.triangles}`);
  assert.ok(perPart.triangles < a.triangles, `collision (${perPart.triangles}) must be cheaper than visual (${a.triangles})`);
  assert.equal(box.boxes.length, 1);
  assert.equal(perPart.boxes.length, a.parts.length);
  assert.throws(() => M.collisionProxy(a, 'perfect'), /fidelity/i);
});

// ---------------------------------------------------------------------------------------------
// G. Bounding box against intent, reusing the QC envelopes already in assets.ts
// ---------------------------------------------------------------------------------------------

test('a plausible crate passes the stud envelope and an absurd one does not', () => {
  const good = M.checkAssemblyBounds(ok(M.assemble(CRATE, { originAtBase: true })).assembly, 'crate');
  assert.equal(good.ok, true, JSON.stringify(good.reasons));
  assert.equal(good.scale.ruleKey, 'crate');

  const huge = { ...CRATE, parts: CRATE.parts.map((p) => ({ ...p, size: p.size.map((s) => s * 20), pos: p.pos.map((v) => v * 20) })) };
  const bad = M.checkAssemblyBounds(ok(M.assemble(huge, { originAtBase: true })).assembly, 'crate');
  assert.equal(bad.ok, false);
  assert.ok(bad.reasons.some((r) => r.includes('crate')), JSON.stringify(bad.reasons));
  assert.ok(bad.scale.suggestedScale < 1, 'a model that is too big should be told to shrink');
});

test('a model whose pivot is nowhere near its base fails the pivot check', () => {
  const sunk = { ...CRATE, parts: CRATE.parts.map((p) => ({ ...p, pos: [p.pos[0] + 9, p.pos[1] + 40, p.pos[2]] })) };
  const c = M.checkAssemblyBounds(ok(M.assemble(sunk, { originAtBase: false })).assembly, 'crate');
  assert.equal(c.pivot.ok, false);
  assert.equal(c.ok, false);
  assert.ok(c.reasons.some((r) => /pivot|origin/i.test(r)), JSON.stringify(c.reasons));
  const fine = M.checkAssemblyBounds(ok(M.assemble(CRATE, { originAtBase: true })).assembly, 'crate');
  assert.equal(fine.pivot.ok, true);
});

// ---------------------------------------------------------------------------------------------
// H. Printability
// ---------------------------------------------------------------------------------------------

test('a solid, grounded, thick-walled model is printable', () => {
  const a = ok(M.assemble(CRATE, { originAtBase: true, quality: 'standard' })).assembly;
  const r = M.printabilityReport(a, { millimetresPerStud: 20 });
  assert.equal(r.printable, true, JSON.stringify(r.issues));
  assert.equal(r.watertight, true);
  assert.ok(r.volumeMm3 > 0);
});

test('printability refuses the thing it exists to refuse', () => {
  // 1. a wall thinner than two nozzle widths
  const thin = { id: 't', name: 't', parts: [
    { kind: 'box', size: [4, 4, 0.06], pos: [0, 2, 0], color: [10, 10, 10] },
  ] };
  const thinReport = M.printabilityReport(ok(M.assemble(thin, { originAtBase: true })).assembly, { millimetresPerStud: 5 });
  assert.equal(thinReport.printable, false);
  assert.ok(thinReport.issues.some((i) => i.code === 'thin_feature'), JSON.stringify(thinReport.issues));

  // ... and the same geometry printed larger is fine, so the rule is about millimetres and not studs
  const bigReport = M.printabilityReport(ok(M.assemble(thin, { originAtBase: true })).assembly, { millimetresPerStud: 200 });
  assert.ok(!bigReport.issues.some((i) => i.code === 'thin_feature'), JSON.stringify(bigReport.issues));

  // 2. a part hanging in the air over nothing
  const floating = { id: 'f', name: 'f', parts: [
    { kind: 'box', size: [4, 1, 4], pos: [0, 0.5, 0], color: [10, 10, 10] },
    { kind: 'sphere', size: [2, 2, 2], pos: [0, 14, 0], color: [10, 10, 10] },
  ] };
  const floatReport = M.printabilityReport(ok(M.assemble(floating)).assembly, { millimetresPerStud: 20 });
  assert.ok(floatReport.issues.some((i) => i.code === 'unsupported'), JSON.stringify(floatReport.issues));
  assert.equal(floatReport.printable, false);

  // 3. the same sphere resting on the box is supported
  const stacked = { id: 's', name: 's', parts: [
    { kind: 'box', size: [4, 1, 4], pos: [0, 0.5, 0], color: [10, 10, 10] },
    { kind: 'sphere', size: [2, 2, 2], pos: [0, 2, 0], color: [10, 10, 10] },
  ] };
  const stackedReport = M.printabilityReport(ok(M.assemble(stacked)).assembly, { millimetresPerStud: 20 });
  assert.ok(!stackedReport.issues.some((i) => i.code === 'unsupported'), JSON.stringify(stackedReport.issues));

  // 4. nothing touching the plate at all
  const airborne = M.printabilityReport(ok(M.assemble({ id: 'a', name: 'a', parts: [
    { kind: 'box', size: [4, 1, 4], pos: [0, 30, 0], color: [10, 10, 10] },
  ] }, { originAtBase: false })).assembly, { millimetresPerStud: 20 });
  assert.ok(airborne.issues.some((i) => i.code === 'no_bed_contact'), JSON.stringify(airborne.issues));

  // 5. a mesh with a hole in it is not a solid, whatever its bounds say
  const holed = M.printabilityOfMesh({ ...M.mergedMesh(ok(M.assemble(CRATE)).assembly) }, { millimetresPerStud: 20 });
  assert.equal(holed.watertight, true);
  const broken = M.mergedMesh(ok(M.assemble(CRATE)).assembly);
  const openReport = M.printabilityOfMesh({ ...broken, indices: broken.indices.slice(0, broken.indices.length - 3) }, { millimetresPerStud: 20 });
  assert.equal(openReport.watertight, false);
  assert.ok(openReport.issues.some((i) => i.code === 'not_watertight'), JSON.stringify(openReport.issues));
});

test('printability refuses a non-finite scale rather than measuring against NaN', () => {
  const a = ok(M.assemble(CRATE)).assembly;
  for (const mm of [NaN, Infinity, 0, -5, '20', null]) {
    assert.throws(() => M.printabilityReport(a, { millimetresPerStud: mm }), /millimetres/i, `scale ${String(mm)}`);
  }
});

// ---------------------------------------------------------------------------------------------
// I. OBJ export — read back by the parser above
// ---------------------------------------------------------------------------------------------

test('the OBJ round-trips: a foreign parser recovers exactly the geometry that was assembled', () => {
  const a = ok(M.assemble(CRATE, { originAtBase: true, quality: 'standard' })).assembly;
  const { obj, mtl, objName, mtlName } = M.exportObj(a);
  const parsed = readObj(obj);
  assert.equal(parsed.vertices.length, a.vertices, 'vertex count');
  assert.equal(parsed.faces.length, a.triangles, 'face count');
  assert.equal(parsed.normals.length, a.vertices, 'normal count');
  assert.equal(parsed.uvs.length, a.vertices, 'uv count');
  for (const f of parsed.faces) assert.equal(f.corners.length, 3, 'OBJ faces must be triangles');
  const b = boundsOfPoints(parsed.vertices);
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(b.min[i] - a.bounds.min[i]) < 1e-4, `min axis ${i}: ${b.min[i]} vs ${a.bounds.min[i]}`);
    assert.ok(Math.abs(b.max[i] - a.bounds.max[i]) < 1e-4, `max axis ${i}: ${b.max[i]} vs ${a.bounds.max[i]}`);
  }
  assert.equal(parsed.mtllib[0], mtlName);
  assert.ok(objName.endsWith('.obj'));
  assert.ok(mtl.length > 0);
});

test('OBJ indices are global and 1-based — the per-object reset bug would be visible here', () => {
  const a = ok(M.assemble(CRATE)).assembly;
  const parsed = readObj(M.exportObj(a).obj);
  let minIdx = Infinity;
  let maxIdx = -Infinity;
  const used = new Set();
  for (const f of parsed.faces) {
    for (const c of f.corners) {
      minIdx = Math.min(minIdx, c.v);
      maxIdx = Math.max(maxIdx, c.v);
      used.add(c.v);
      assert.equal(c.vt, c.v, 'this writer emits one uv per vertex, so the indices must agree');
      assert.equal(c.vn, c.v, 'this writer emits one normal per vertex, so the indices must agree');
    }
  }
  assert.equal(minIdx, 1, 'OBJ is 1-based');
  assert.equal(maxIdx, parsed.vertices.length, 'the last vertex must be referenced, or the file carries dead geometry');
  assert.equal(used.size, parsed.vertices.length, 'every vertex written must be used by a face');
  assert.equal(parsed.objects.length, a.parts.length, 'one object per part');
});

test('every material the OBJ uses is declared in the MTL it ships with', () => {
  const a = ok(M.assemble(CRATE)).assembly;
  const { obj, mtl } = M.exportObj(a);
  const parsed = readObj(obj);
  const declared = new Set(readMtl(mtl).map((m) => m.name));
  assert.ok(declared.size > 0);
  for (const name of parsed.usemtl) assert.ok(declared.has(name), `usemtl ${name} is not in the .mtl`);
  const neon = readMtl(mtl).find((m) => m.name.includes('Neon'));
  assert.ok(neon, 'the crate has a Neon part, so the MTL must carry a Neon material');
  assert.ok(neon.props.Ke && neon.props.Ke.some((v) => v > 0), 'Neon must export as emissive');
  const transparent = readMtl(M.exportObj(ok(M.assemble({ ...CRATE, parts: CRATE.parts.map((p, i) => (i === 0 ? { ...p, transparency: 0.5 } : p)) })).assembly).mtl);
  assert.ok(transparent.some((m) => m.props.d && Math.abs(m.props.d[0] - 0.5) < 1e-6), 'transparency must reach the MTL as d');
});

test('a hostile part name cannot inject geometry into the OBJ', () => {
  const evil = 'Body\nv 9999 9999 9999\nf 1 1 1';
  const a = ok(M.assemble({ ...CRATE, parts: [{ ...CRATE.parts[0], name: evil }] })).assembly;
  const clean = ok(M.assemble({ ...CRATE, parts: [{ ...CRATE.parts[0], name: 'Body' }] })).assembly;
  const dirty = readObj(M.exportObj(a).obj);
  const tidy = readObj(M.exportObj(clean).obj);
  assert.equal(dirty.vertices.length, tidy.vertices.length, 'a name must never add a vertex');
  assert.equal(dirty.faces.length, tidy.faces.length, 'a name must never add a face');
  const b = boundsOfPoints(dirty.vertices);
  assert.ok(b.max[0] < 100, `a name injected geometry: bounds reached ${b.max[0]}`);
  assert.equal(dirty.objects.length, 1, 'the newline must not have started a second object');
  assert.ok(dirty.objects.every((o) => !/\s/.test(o)), `an object name must be one token, got ${JSON.stringify(dirty.objects)}`);
});

// ---------------------------------------------------------------------------------------------
// J. GLB export — read back by packages/evals/src/glb-inspect.mjs
// ---------------------------------------------------------------------------------------------

test('the GLB round-trips through the repository\'s own inspector', () => {
  const a = ok(M.assemble(CRATE, { originAtBase: true, quality: 'standard' })).assembly;
  const bytes = M.exportGlb(a);
  const info = inspectGlb(Buffer.from(bytes));
  assert.equal(info.version, 2);
  assert.equal(info.triangles, a.triangles, 'triangle count');
  assert.equal(info.vertices, a.vertices, 'vertex count');
  assert.equal(info.meshes, a.parts.length);
  assert.equal(info.untriangulatedPrimitives, 0);
  assert.deepEqual(info.primitiveModes, ['TRIANGLES']);
  assert.equal(info.materials.length, a.materials.length);
  assert.equal(info.animations, 0);
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(info.boundsMin[i] - a.bounds.min[i]) < 1e-3, `glb min axis ${i}: ${info.boundsMin[i]} vs ${a.bounds.min[i]}`);
    assert.ok(Math.abs(info.boundsMax[i] - a.bounds.max[i]) < 1e-3, `glb max axis ${i}`);
  }
  assert.ok(String(info.generator).length > 0);
});

test('the GLB container obeys the spec a stricter reader would enforce', () => {
  const bytes = M.exportGlb(ok(M.assemble(CRATE)).assembly);
  assert.equal(bytes.byteLength % 4, 0, 'the whole file must be 4-byte aligned');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(dv.getUint32(0, true), 0x46546c67, 'magic');
  assert.equal(dv.getUint32(4, true), 2, 'version');
  assert.equal(dv.getUint32(8, true), bytes.byteLength, 'declared length must be the real length');
  assert.equal(dv.getUint32(16, true), 0x4e4f534a, 'the first chunk must be JSON');
  const jsonLen = dv.getUint32(12, true);
  assert.equal(jsonLen % 4, 0, 'the JSON chunk must be padded to 4 bytes');
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLen)));
  assert.equal(json.asset.version, '2.0');
  assert.equal(json.buffers.length, 1);
  assert.equal(dv.getUint32(20 + jsonLen + 4, true), 0x004e4942, 'the second chunk must be BIN');
  assert.equal(json.buffers[0].byteLength, dv.getUint32(20 + jsonLen, true), 'the buffer length must match the BIN chunk');
  for (const acc of json.accessors) {
    assert.ok(Number.isInteger(acc.count) && acc.count > 0);
    if (acc.type === 'VEC3' && acc.min) {
      assert.equal(acc.min.length, 3);
      for (let i = 0; i < 3; i++) assert.ok(acc.min[i] <= acc.max[i]);
    }
  }
  for (const p of json.meshes.flatMap((m) => m.primitives)) {
    assert.ok(json.accessors[p.attributes.POSITION].min, 'glTF requires min/max on POSITION');
    assert.ok(p.attributes.NORMAL != null && p.attributes.TEXCOORD_0 != null);
    assert.equal(p.mode ?? 4, 4);
  }
});

test('the exported GLB passes the asset judge on everything except the texture it honestly lacks', () => {
  const a = ok(M.assemble(CRATE, { originAtBase: true, quality: 'standard' })).assembly;
  const verdict = judgeAsset(inspectGlb(Buffer.from(M.exportGlb(a))), { profile: 'roblox_prop', intendedHeight: 2.37, heightTolerance: 0.5 });
  const byId = Object.fromEntries(verdict.checks.map((c) => [c.id, c]));
  for (const id of ['triangles', 'file_size', 'texture_size', 'has_geometry', 'triangulated', 'has_material', 'not_degenerate', 'origin_at_base', 'origin_centred', 'scale_plausible']) {
    assert.equal(byId[id].passed, true, `${id}: ${byId[id].detail}`);
  }
  // Stated rather than hidden: this pipeline emits materials, not textures.
  assert.equal(byId.textured.passed, false);
  assert.equal(verdict.passed, false);
});

test('colour and transparency survive the trip into glTF material space', () => {
  const make = (color, transparency) => {
    const a = ok(M.assemble({ id: 'c', name: 'c', parts: [{ kind: 'box', size: [2, 2, 2], pos: [0, 1, 0], color, transparency, material: 'SmoothPlastic' }] })).assembly;
    return inspectGlb(Buffer.from(M.exportGlb(a))).materials[0];
  };
  const white = make([255, 255, 255], 0);
  const black = make([0, 0, 0], 0);
  const mid = make([128, 128, 128], 0);
  assert.deepEqual(white.baseColorFactor.slice(0, 3).map((v) => Math.round(v * 1000) / 1000), [1, 1, 1]);
  assert.deepEqual(black.baseColorFactor.slice(0, 3), [0, 0, 0]);
  assert.ok(mid.baseColorFactor[0] > black.baseColorFactor[0] && mid.baseColorFactor[0] < white.baseColorFactor[0], 'colour must be monotone');
  assert.equal(white.alphaMode, 'OPAQUE');
  assert.equal(white.baseColorFactor[3], 1);
  const ghost = make([255, 255, 255], 0.5);
  assert.equal(ghost.alphaMode, 'BLEND');
  assert.ok(Math.abs(ghost.baseColorFactor[3] - 0.5) < 1e-6, `alpha ${ghost.baseColorFactor[3]}`);
});

test('two parts sharing a look share one glTF material, and different looks do not', () => {
  const same = ok(M.assemble({ id: 's', name: 's', parts: [
    { kind: 'box', size: [2, 2, 2], pos: [0, 1, 0], color: [10, 20, 30], material: 'Metal' },
    { kind: 'box', size: [2, 2, 2], pos: [5, 1, 0], color: [10, 20, 30], material: 'Metal' },
  ] })).assembly;
  assert.equal(inspectGlb(Buffer.from(M.exportGlb(same))).materials.length, 1);
  const differ = ok(M.assemble({ id: 'd', name: 'd', parts: [
    { kind: 'box', size: [2, 2, 2], pos: [0, 1, 0], color: [10, 20, 30], material: 'Metal' },
    { kind: 'box', size: [2, 2, 2], pos: [5, 1, 0], color: [10, 20, 31], material: 'Metal' },
  ] })).assembly;
  assert.equal(inspectGlb(Buffer.from(M.exportGlb(differ))).materials.length, 2);
});

// ---------------------------------------------------------------------------------------------
// K. Credit accounting
// ---------------------------------------------------------------------------------------------

test('a mesh charge refuses to be computed from a number that is not one', () => {
  for (const triangles of [NaN, Infinity, -1, '900', null, undefined, 1.5]) {
    assert.throws(() => M.meshCreditCost({ triangles, parts: 1 }), /triangle/i, `triangles ${String(triangles)}`);
  }
  for (const parts of [NaN, Infinity, 0, -2, '3']) {
    assert.throws(() => M.meshCreditCost({ triangles: 900, parts }), /part/i, `parts ${String(parts)}`);
  }
});

test('a mesh charge never falls as the work rises, and is never free', () => {
  let previous = -1;
  for (const triangles of [1, 12, 200, 900, 6000, 20000]) {
    const n = M.meshCreditCost({ triangles, parts: 1 });
    assert.ok(n > previous, `charge should rise with triangles: ${triangles} gave ${n} after ${previous}`);
    assert.ok(M.sparksForMesh({ triangles, parts: 1 }) >= 1, 'no mesh is free');
    previous = n;
  }
  let prevParts = -1;
  for (const parts of [1, 2, 8, 40]) {
    const n = M.meshCreditCost({ triangles: 900, parts });
    assert.ok(n > prevParts);
    prevParts = n;
  }
  assert.ok(M.meshCreditCost({ triangles: 900, parts: 1, textured: true }) > M.meshCreditCost({ triangles: 900, parts: 1, textured: false }));
});

test('the most expensive mesh the pipeline can make still costs less than a whole build', () => {
  const worst = M.sparksForMesh({ triangles: M.MESH_LIMITS.hardTriangleCeiling, parts: M.MESH_LIMITS.maxParts, textured: true });
  assert.ok(worst >= 1);
  assert.ok(worst < M.SPARKS_PER_BUILD, `one mesh at ${worst} Sparks would cost more than a build at ${M.SPARKS_PER_BUILD}`);
});

test('the ledger charges once per mesh and its total is the sum of its rows', () => {
  const a = ok(M.assemble(CRATE, { quality: 'standard' })).assembly;
  const ledger = M.meshLedger(a);
  assert.equal(ledger.charges.length, a.parts.length, 'one row per mesh');
  assert.equal(ledger.totalNeurons, ledger.charges.reduce((n, c) => n + c.neurons, 0));
  assert.equal(ledger.totalSparks, M.sparksForNeurons(ledger.totalNeurons));
  for (const c of ledger.charges) {
    assert.ok(c.triangles > 0 && Number.isInteger(c.triangles));
    assert.ok(c.neurons > 0 && Number.isFinite(c.neurons));
    assert.ok(c.meshId.length > 0);
  }
  assert.equal(new Set(ledger.charges.map((c) => c.meshId)).size, ledger.charges.length, 'mesh ids must be unique or the ledger cannot be audited');
  // billing the meshes one at a time can only ever cost the user more, never less
  assert.ok(ledger.chargedSeparatelySparks >= ledger.totalSparks,
    `per-mesh rounding must not undercharge: ${ledger.chargedSeparatelySparks} vs ${ledger.totalSparks}`);
  // a heavier model costs more than a lighter one — the ledger tracks the work, not the call
  const heavy = M.meshLedger(ok(M.assemble(CRATE, { quality: 'high' })).assembly);
  assert.ok(heavy.totalNeurons > ledger.totalNeurons, 'a high-tier build must cost more than a standard one');
});

// ---------------------------------------------------------------------------------------------
// L. The material vocabulary must not fork
// ---------------------------------------------------------------------------------------------

test('every material the offline renderer knows has PBR values here', () => {
  const src = readFileSync(join(ROOT, 'packages', 'evals', 'src', 'render-scene.mjs'), 'utf8');
  const start = src.indexOf('const MATERIAL_LOOK = {');
  assert.ok(start > 0, 'render-scene.mjs no longer declares MATERIAL_LOOK — this guard needs rewriting');
  const block = src.slice(start, src.indexOf('};', start));
  const names = [...block.matchAll(/(\w+):\s*\[/g)].map((m) => m[1]);
  assert.ok(names.length > 20, `expected the renderer's material table, found ${names.length} names`);
  for (const name of names) {
    assert.ok(Object.prototype.hasOwnProperty.call(M.MATERIAL_PBR, name),
      `the renderer knows material '${name}' and meshgen does not — the vocabulary has forked`);
  }
});

// ---------------------------------------------------------------------------------------------
// M. Cleanup — geometry the customer pays for and nobody can see
// ---------------------------------------------------------------------------------------------

const DIRTY = {
  id: 'dirty',
  name: 'dirty',
  parts: [
    { name: 'Body', kind: 'box', size: [4, 4, 4], pos: [0, 2, 0], color: [90, 90, 90], material: 'Metal' },
    { name: 'BodyAgain', kind: 'box', size: [4, 4, 4], pos: [0, 2, 0], color: [10, 10, 10], material: 'Wood' },
    { name: 'Guts', kind: 'sphere', size: [1, 1, 1], pos: [0, 2, 0], color: [200, 0, 0], material: 'Neon' },
    { name: 'Finial', kind: 'sphere', size: [1, 1, 1], pos: [0, 4.5, 0], color: [200, 200, 0], material: 'Neon' },
    { name: 'Bubble', kind: 'box', size: [20, 20, 20], pos: [0, 2, 0], color: [255, 255, 255], material: 'Glass', transparency: 1 },
  ],
};

test('cleanup removes the geometry nobody can see, and says which and why', () => {
  const r = M.cleanAssemblySpec(DIRTY);
  assert.deepEqual(r.removed.map((x) => x.index).sort((a, b) => a - b), [1, 2, 4]);
  assert.deepEqual(r.removed.map((x) => x.reason).sort(), ['duplicate', 'enclosed', 'invisible']);
  assert.deepEqual(r.spec.parts.map((p) => p.name), ['Body', 'Finial']);
  assert.ok(r.trianglesSaved > 0, 'removing three parts must save triangles');
  assert.equal(M.validateAssemblySpec(r.spec).ok, true);

  // the visible silhouette is untouched ...
  const kept = ok(M.assemble({ ...DIRTY, parts: [DIRTY.parts[0], DIRTY.parts[3]] })).assembly;
  const cleaned = ok(M.assemble(r.spec)).assembly;
  assert.deepEqual(cleaned.bounds, kept.bounds);
  // ... and the 20-stud invisible bubble stops inflating the bounding box the QC gates measure
  const before = ok(M.assemble(DIRTY)).assembly;
  assert.ok(before.bounds.max[0] - before.bounds.min[0] > 19);
  assert.ok(cleaned.bounds.max[0] - cleaned.bounds.min[0] < 5);
  assert.ok(M.meshLedger(cleaned).totalNeurons < M.meshLedger(before).totalNeurons, 'a cleaned model must cost less');
});

test('cleanup keeps everything it cannot prove is hidden', () => {
  const keepers = {
    id: 'k',
    name: 'k',
    parts: [
      { name: 'Case', kind: 'box', size: [4, 4, 4], pos: [0, 2, 0], color: [90, 90, 90], material: 'Glass', transparency: 0.5 },
      { name: 'SeenThrough', kind: 'sphere', size: [1, 1, 1], pos: [0, 2, 0], color: [200, 0, 0], material: 'Neon' },
      { name: 'Ball', kind: 'sphere', size: [6, 6, 6], pos: [20, 3, 0], color: [90, 90, 90], material: 'Metal' },
      { name: 'InsideTheBallsBox', kind: 'box', size: [1, 1, 1], pos: [22.4, 5.2, 0], color: [1, 2, 3], material: 'Wood' },
      { name: 'Turned', kind: 'box', size: [4, 4, 4], pos: [40, 2, 0], rot: [0, 0.7854, 0], color: [90, 90, 90], material: 'Metal' },
      { name: 'InsideTheTurnedBox', kind: 'box', size: [0.4, 0.4, 0.4], pos: [42.6, 2, 0], color: [1, 2, 3], material: 'Wood' },
      { name: 'PokingOut', kind: 'box', size: [1, 9, 1], pos: [1.5, 2, 0], color: [1, 2, 3], material: 'Wood' },
    ],
  };
  const r = M.cleanAssemblySpec(keepers);
  assert.deepEqual(r.removed, [], `nothing here is provably hidden, but cleanup removed ${JSON.stringify(r.removed)}`);
  assert.equal(r.spec.parts.length, keepers.parts.length);
  assert.equal(r.trianglesSaved, 0);
  // a clean model is returned unchanged rather than rebuilt differently
  const twice = M.cleanAssemblySpec(r.spec);
  assert.deepEqual(twice.spec.parts, r.spec.parts);
});

test('cleanup never empties a model', () => {
  const ghosts = {
    id: 'g',
    name: 'g',
    parts: [
      { name: 'Small', kind: 'box', size: [1, 1, 1], pos: [0, 0.5, 0], color: [1, 2, 3], transparency: 1 },
      { name: 'Large', kind: 'box', size: [4, 4, 4], pos: [0, 2, 0], color: [1, 2, 3], transparency: 1 },
    ],
  };
  const r = M.cleanAssemblySpec(ghosts);
  assert.equal(r.spec.parts.length, 1, 'an empty assembly is not a model');
  assert.equal(r.spec.parts[0].name, 'Large', 'the survivor should be the biggest thing there was');
  assert.equal(M.validateAssemblySpec(r.spec).ok, true);
});

test('cleanup refuses an invalid assembly instead of cleaning it into a shape', () => {
  assert.throws(() => M.cleanAssemblySpec({ id: 'x', name: 'x', parts: [{ ...BOX, kind: 'teapot' }] }), /kind/i);
  assert.throws(() => M.cleanAssemblySpec(null), /assembly|object/i);
});
