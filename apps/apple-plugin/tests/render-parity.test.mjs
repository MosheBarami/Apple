/**
 * THE PORTED RASTERISER IS THE SAME RASTERISER.
 *
 * `apps/apple-plugin/src/Render.luau` is a port of `apps/plugin/src/Render.luau`, and a port is
 * exactly the kind of change that looks finished and is not. Three things downstream were
 * calibrated against the ORIGINAL pixels and would not notice a drifted copy:
 *
 *   - `apps/worker/src/vision.ts` — the critic's hard-fail checks and its 0-10 scale
 *   - `apps/worker/src/composition.ts` — SKY_RGB/GROUND_RGB, the background mask
 *   - `packages/evals/src/render-scene.mjs` — the Node twin the eval suite grades stored scenes with
 *
 * A renderer that framed differently, culled differently or packed its bytes differently would
 * still return a plausible image, the critic would still return a score, and every one of those
 * numbers would be about a picture nobody checked. That is a failure to observe rendered as an
 * observation.
 *
 * So the evidence here is not a new test written against the new file. It is the ORIGINAL specs —
 * `render.spec.luau` (framing: bounds and viewpoints) and `rasteriser.spec.luau` (projection and
 * pixels) — read from `apps/plugin/tests/` byte-for-byte and run against the PORTED source, in the
 * original prelude, by the original chunk builder. If the port changed the maths, the specs that
 * defined the maths go red.
 *
 * The specs exercise `Render.bounds`, `Render.viewpoints` and `Render.renderView`, which is why
 * those three keep their exact signatures in the port. `Render.capture` deliberately does not: it
 * takes an already-resolved Instance instead of resolving a path itself, because the command
 * engine's allowlisted resolver is the only path into the place this plugin is allowed to have.
 * That difference is asserted below rather than left implied.
 *
 * Skips with a stated reason when `luau` is absent — a green run that executed no Luau would be
 * the same lie in a different place.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildChunk, luauMissing } from '../../plugin/tests/run.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const LEGACY_TESTS = join(HERE, '..', '..', 'plugin', 'tests');
const LEGACY_SRC = join(HERE, '..', '..', 'plugin', 'src');
const PORTED = join(HERE, '..', 'src', 'Render.luau');

/** The ported module stands in for `Render`; `Paths` is still the legacy stub the prelude needs. */
const modules = [
  { name: 'Paths', path: join(LEGACY_SRC, 'Paths.luau') },
  { name: 'Render', path: PORTED },
];

function runSpec(specName, mutate) {
  const specSrc = readFileSync(join(LEGACY_TESTS, specName), 'utf8');
  const chunk = buildChunk(specSrc, modules, mutate);
  const dir = mkdtempSync(join(tmpdir(), 'apple-render-parity-'));
  const file = join(dir, `${specName}.gen.luau`);
  writeFileSync(file, chunk);
  try {
    return { ok: true, out: execFileSync('luau', [file], { encoding: 'utf8', stdio: 'pipe' }) };
  } catch (err) {
    return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

const SPECS = ['render.spec.luau', 'rasteriser.spec.luau'];

for (const spec of SPECS) {
  test(`${spec}, unmodified, passes against the ported renderer`, { skip: luauMissing() && 'luau is not on PATH' }, () => {
    const run = runSpec(spec);
    assert.ok(run.ok, `the ported renderer failed the original spec:\n${run.out}`);
    // Assert the run actually EXECUTED assertions. A spec that loaded, printed a "0 passed" line
    // and exited zero would satisfy `run.ok` while proving nothing about the port.
    const passed = /(\d+) passed/.exec(run.out);
    assert.ok(passed, `no pass count in the spec output — nothing was measured:\n${run.out}`);
    assert.ok(Number(passed[1]) >= 12, `only ${passed?.[1]} assertions ran against the ported renderer`);
    assert.doesNotMatch(run.out, /failed/i, run.out);
  });
}

test('the parity harness can fail: a mutated port turns the original specs red', { skip: luauMissing() && 'luau is not on PATH' }, () => {
  // The framing distance is the value docs/VISUAL-LOOP.md records as MEASURED — 1.35x the subject
  // radius, after 2.1x put scenes at 8-11% of frame and the critic called them "a postage stamp in
  // a void". `render.spec.luau` pins the band. Moving it is exactly the drift this file exists to
  // catch, so the harness is made to catch it here, in the open, rather than assumed to.
  const mutate = (src, name) => {
    if (name !== 'Render') return src;
    const from = 'local d = radius * 1.35';
    assert.equal(src.split(from).length - 1, 1, 'the framing constant is no longer uniquely anchored');
    return src.replace(from, 'local d = radius * 2.1');
  };
  const run = runSpec('render.spec.luau', mutate);
  assert.ok(!run.ok || /failed/i.test(run.out), `a drifted framing distance was not caught:\n${run.out}`);
  // And the file on disk is untouched: the mutation happened on the text on its way into the chunk.
  assert.match(readFileSync(PORTED, 'utf8'), /local d = radius \* 1\.35\n/);
});

/**
 * Comments out, first. This file's own header explains that `Paths.resolve` is gone and that the
 * renderer performs no HTTP — and a scanner that reads prose would report every one of those
 * sentences as the defect it describes. Four scanners in this repository have needed this.
 */
function code(src) {
  return src.replace(/--\[\[[\s\S]*?\]\]/g, ' ').replace(/--[^\n]*/g, ' ');
}

test('the port takes a resolved Instance and never resolves a path or reaches for a service itself', () => {
  const raw = readFileSync(PORTED, 'utf8');
  const src = code(raw);
  assert.ok(src.includes('function Render.capture'), 'comment stripping ate the source — this test would check nothing');
  // No second path into the place. The command engine's allowlisted resolver is the only one.
  assert.doesNotMatch(src, /require\s*\(/, 'the shipped renderer must not require another module');
  assert.doesNotMatch(src, /Paths\.resolve/, 'path resolution belongs to the command engine, not the renderer');
  assert.doesNotMatch(src, /game\s*:\s*GetService/, 'services are injected so the renderer has no reach of its own');
  // Nothing that could make this a distribution problem rather than a maths problem.
  for (const forbidden of [/HttpService/, /RequestAsync/, /loadstring/, /GetObjects/, /InsertService/, /AssetService/, /rbxassetid/, /CreateAssetAsync/]) {
    assert.doesNotMatch(src, forbidden, `the renderer must contain nothing matching ${forbidden}`);
  }
  // capture() takes what the engine already resolved.
  assert.match(src, /function Render\.capture\(root: Instance, subject: string, view: string, width: number, height: number, env: any\?\)/);
});

// 2026-09-23: Terrain was invisible to this renderer, so every terrain island was judged as trees floating
// over nothing. The terrain pass is exercised here against a stub Terrain holding a solid grass box.
const TERRAIN_SPEC = String.raw`--!nocheck
--!modules Paths,Render
Region3 = { new = function(lo, hi)
	local r = { CFrame = CFrame.new((lo.X + hi.X) / 2, (lo.Y + hi.Y) / 2, (lo.Z + hi.Z) / 2), Size = hi - lo }
	function r:ExpandToGrid() return r end
	return r
end }
local terrain = {}
function terrain:ReadVoxels(region, res)
	local sx, sy, sz = math.floor(region.Size.X / 4), math.floor(region.Size.Y / 4), math.floor(region.Size.Z / 4)
	local m, o = {}, {}
	for x = 1, sx do m[x], o[x] = {}, {}
		for y = 1, sy do m[x][y], o[x][y] = {}, {}
			for z = 1, sz do
				local solid = y <= sy / 2
				m[x][y][z] = if solid then Enum.Material.Grass else Enum.Material.Air
				o[x][y][z] = if solid then 1 else 0
			end
		end
	end
	return m, o
end
function terrain:GetMaterialColor() return Color3.new(0.3, 0.6, 0.25) end

local cam = CFrame.lookAt(Vector3.new(0, 40, 90), Vector3.new(0, 0, 0))
local box = { instance = terrain, lo = Vector3.new(-32, -32, -32), hi = Vector3.new(32, 32, 32) }
H.test("terrain in the box is drawn, and counted", function()
	local _, meta = Render.renderView(cam, 64, 48, 55, game:GetService("Workspace"), box)
	H.ok(meta.terrainCells > 0, "no terrain cells were drawn: " .. tostring(meta.terrainCells))
	local seen = false
	for _, row in meta.materials do if row.material == "Terrain Grass" then seen = true end end
	H.ok(seen, "the terrain material is not reported")
end)
H.test("without the terrain argument nothing changes for existing callers", function()
	local _, meta = Render.renderView(cam, 64, 48, 55, game:GetService("Workspace"))
	H.ok(meta.terrainCells == 0, "terrain drawn although none was asked for")
end)
H.test("the drawn terrain changes the pixels", function()
	local a = Render.renderView(cam, 64, 48, 55, game:GetService("Workspace"), box)
	local b = Render.renderView(cam, 64, 48, 55, game:GetService("Workspace"))
	H.ok(a ~= b, "the image is identical with and without terrain")
end)
H.report("apple-plugin/render-terrain")
`;

test('the renderer draws Terrain it is given', { skip: luauMissing() && 'luau is not on PATH' }, () => {
  const chunk = buildChunk(TERRAIN_SPEC, modules);
  const dir = mkdtempSync(join(tmpdir(), 'apple-render-terrain-'));
  const file = join(dir, 'terrain.gen.luau');
  writeFileSync(file, chunk);
  let out;
  try { out = execFileSync('luau', [file], { encoding: 'utf8', stdio: 'pipe' }); } catch (err) { out = `${err.stdout ?? ''}${err.stderr ?? ''}`; assert.fail(out); }
  assert.match(out, /3 passed/, out);
  assert.doesNotMatch(out, /failed/i, out);
});
