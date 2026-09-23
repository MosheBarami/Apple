/**
 * THE TERRAIN LOOP (gauntlet round 6): 951 edit_terrain calls in a row until the day's capacity ran
 * out, with no prop, script or UI built. A run of terrain writes is now capped; any other change
 * lifts the cap. See src/terrain-streak.ts.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Bundled, as model-only.test.mjs does: the sources import each other without extensions.
const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'terrain-streak-'));
const entry = join(temp, 'entry.ts');
writeFileSync(entry, `export * from ${JSON.stringify(join(WORKER, 'src', 'terrain-streak.ts'))};\nexport { projectMutatingToolNames } from ${JSON.stringify(join(WORKER, 'src', 'tools.ts'))};\n`);
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [entry, '--bundle', '--format=esm', '--target=es2022', `--outfile=${join(temp, 'out.mjs')}`], { cwd: WORKER, stdio: 'pipe' });
const { TERRAIN_STREAK_CAP, isTerrainWriter, nextTerrainStreak, terrainStreakRefusal, projectMutatingToolNames } = await import(pathToFileURL(join(temp, 'out.mjs')).href);
rmSync(temp, { recursive: true, force: true });

test('the terrain writers are read from the registry, and include the two round 6 used', () => {
  const writers = projectMutatingToolNames().filter(isTerrainWriter);
  assert.ok(writers.includes('edit_terrain') && writers.includes('shape_terrain'), `writers=${writers}`);
  assert.equal(isTerrainWriter('read_terrain'), false, 'reading the ground is not writing it');
  assert.equal(isTerrainWriter('create_instances'), false);
});

test('round 6 replayed: the run is refused terrain at the cap, not at edit 951', () => {
  let streak = 0;
  let ran = 0;
  for (let i = 0; i < 951; i++) {
    if (terrainStreakRefusal(streak, 'edit_terrain')) continue;
    ran += 1;
    streak = nextTerrainStreak(streak, 'edit_terrain', true, true);
  }
  assert.equal(ran, TERRAIN_STREAK_CAP);
  assert.match(terrainStreakRefusal(streak, 'edit_terrain'), /insert_library_model/);
});

test('any other successful change lifts the cap; a read or a failure does not', () => {
  const at = TERRAIN_STREAK_CAP;
  assert.equal(nextTerrainStreak(at, 'get_project_tree', true, false), at, 'a read between edits must not reset it');
  assert.equal(nextTerrainStreak(at, 'insert_library_model', false, false), at, 'a failed change is not a change');
  assert.equal(nextTerrainStreak(at, 'insert_library_model', true, true), 0);
  assert.equal(terrainStreakRefusal(0, 'edit_terrain'), null);
  assert.equal(nextTerrainStreak(3, 'edit_terrain', false, false), 3, 'a failed terrain call does not count');
});

test('below the cap nothing is refused, and non-terrain tools are never refused', () => {
  assert.equal(terrainStreakRefusal(TERRAIN_STREAK_CAP - 1, 'shape_terrain'), null);
  assert.equal(terrainStreakRefusal(10_000, 'create_instances'), null);
});

test('the run loop refuses before running and counts every executed call', () => {
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const src = strip(readFileSync(new URL('../src/do/session.ts', import.meta.url), 'utf8'));
  const gate = src.indexOf('terrainStreakRefusal(agent.terrainStreak');
  const run = src.indexOf('await runTool(ctx, call.name, call.arguments)');
  assert.ok(gate > 0 && run > gate, 'the refusal must be checked before the tool runs');
  assert.match(src.slice(gate, gate + 900), /continue;/, 'a refused call must not fall through to runTool');
  assert.match(src.slice(run, run + 3000), /agent\.terrainStreak = nextTerrainStreak\(/);
});
