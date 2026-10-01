/**
 * Studs by default (owner, 2026-10-01): every part Apple makes is studded unless the USER asked for another surface.
 * The maps are Resurface's (cxmeel); the plugin's Surface family applies them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'surfaces-')), 's.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'surfaces.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out], { cwd: WORKER, stdio: 'pipe' });
const S = await import(`file://${out}`);

test('an idea is studded unless the user asked for a surface of their own', () => {
  for (const idea of ['defend your orchard from vegetables that come in waves', 'an island that sinks while you build a boat from parts',
    'a neon obby with lava', 'an ice cream shop tycoon', 'a metal detector simulator', 'a wooden pirate ship battle', 'a glass bridge game', 'smooth sailing boat race']) {
    const op = S.surfaceDefaultOp(idea);
    assert.equal(op.surface, 'studs', `"${idea}" must be studded`);
    assert.deepEqual(op.maps, S.SURFACE_MAPS.studs);
  }
  for (const idea of ['make it with no studs', 'a castle without studs please', 'realistic graphics horror map', 'use real textures on everything',
    'marble floors and brick walls', 'smooth parts only', 'apply materials to the house']) {
    assert.equal(S.surfaceDefaultOp(idea).surface, 'keep', `"${idea}" asked for its own surface`);
  }
  assert.equal(S.surfaceDefaultOp(undefined).surface, 'studs', 'no words, studs');
});

test('the maps are image ids the plugin will accept, and the plugin source holds none of them', () => {
  for (const [kind, m] of Object.entries(S.SURFACE_MAPS)) {
    assert.match(m.colorMap, /^rbxassetid:\/\/\d{1,20}$/, kind);
    assert.match(m.normalMap, /^rbxassetid:\/\/\d{1,20}$/, kind);
    assert.ok(m.studsPerTile > 0 && m.studsPerTile <= 64);
  }
  const plugin = readFileSync(join(WORKER, '..', 'apple-plugin', 'src', 'ops', 'Surface.luau'), 'utf8');
  assert.match(plugin, /resurface-plugin/, 'the plugin credits Resurface');
  assert.doesNotMatch(plugin.replace(/--\[\[[\s\S]*?\]\]/g, '').replace(/--[^\n]*/g, ''), /rbxassetid:\/\//, 'ids come from the worker');
  assert.deepEqual(S.applySurfaceOp(['game.Workspace'], 'smooth'), { op: 'apply_surface', paths: ['game.Workspace'], surface: 'smooth' });
  assert.equal(S.applySurfaceOp(['game.Workspace']).maps, S.SURFACE_MAPS.studs);
});

test('every building run tells Studio the surface rule before it starts', () => {
  const session = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8').replace(/\/\/[^\n]*/g, '');
  const at = session.indexOf("createCheckpoint('before Apple changes'");
  assert.ok(at > 0, 'found the pre-run checkpoint');
  const after = session.slice(at, at + 2500);
  assert.match(after, /execStudioOp\(surfaceDefaultOp\(text\)/, 'the run sends the surface rule with the user\'s own words');
});
