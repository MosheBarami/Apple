/**
 * scripts/eval/luau/world-state.luau, RUN. It is the code that wipes the test place between pieces and measures
 * what a piece built, so a mistake in it either leaves one piece's work in the next piece's baseline or measures the
 * wrong box. It cannot be tried against real Studio without a signed-in Studio and an open place, so it runs here
 * under the real `luau` interpreter against a small stand-in for the DataModel (tests/fixtures/eval/mock-datamodel.luau).
 * What this proves is the script's LOGIC; what the stand-in cannot prove is how Studio itself answers (the first live
 * dry run, `node scripts/eval/run-piece.mjs U01 --dry-run`, is that check).
 *
 * Needs `luau` on PATH (CI installs it; locally `rokit` or brew).
 *
 * Run with:  node --test tests/eval-world-state.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SCRIPT = readFileSync(join(ROOT, 'scripts', 'eval', 'luau', 'world-state.luau'), 'utf8');
const MOCK = readFileSync(join(HERE, 'fixtures', 'eval', 'mock-datamodel.luau'), 'utf8');
const SCENARIO = readFileSync(join(HERE, 'fixtures', 'eval', 'world-state-scenario.luau'), 'utf8');

function runLuau(source) {
  const dir = mkdtempSync(join(tmpdir(), 'eval-world-state-'));
  const file = join(dir, 'scenario.luau');
  writeFileSync(file, source);
  const r = spawnSync('luau', [file], { encoding: 'utf8', timeout: 60_000 });
  if (r.error) throw new Error(`could not run luau: ${r.error.message}`);
  assert.equal(r.status, 0, `luau failed:\n${r.stderr}\n${r.stdout}`);
  const out = {};
  for (const line of r.stdout.split('\n')) {
    const m = /^@@(\S+) (.*)$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
const compose = (script, scenario) => `${MOCK}\nlocal function __script(MODE, BASELINE_JSON)\n${script}\nend\n${scenario}`;
const json = (s) => JSON.parse(s);
// An empty Luau table encodes as [] whether it meant a list or a dictionary.
const asObject = (v) => (Array.isArray(v) && v.length === 0 ? {} : v);

const out = runLuau(compose(SCRIPT, SCENARIO));
const baseline = json(out.capture);

test('the script is valid Luau (luau-analyze reports no syntax error)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eval-world-state-syntax-'));
  const file = join(dir, 'world-state.luau');
  writeFileSync(file, SCRIPT);
  let text = '';
  try {
    text = execFileSync('luau-analyze', [file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    text = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
  // Roblox globals (game, workspace, Instance...) are unknown to the plain analyser; only a syntax error is a finding.
  assert.equal(/SyntaxError/.test(text), false, text);
});

test('capture records the pristine inventory, including the engine singletons a reset must keep', () => {
  const ws = baseline.inventory.Workspace;
  assert.deepEqual(ws, ['Workspace/Baseplate#Part', 'Workspace/Baseplate#Part/Texture#Decal', 'Workspace/SpawnLocation#SpawnLocation']);
  assert.ok(baseline.inventory.Lighting.includes('Lighting/Sky#Sky'));
  assert.ok(baseline.inventory.Lighting.includes('Lighting/ColorGradingEffect#ColorGradingEffect'));
  assert.deepEqual(baseline.inventory.TextChatService, ['TextChatService/ChatWindowConfiguration#Folder']);
  assert.deepEqual(baseline.inventory.StarterPlayer, ['StarterPlayer/StarterCharacterScripts#Folder', 'StarterPlayer/StarterPlayerScripts#Folder']);
  assert.deepEqual(baseline.inventory.ServerScriptService, []);
  assert.equal(baseline.props.Lighting.ClockTime, 14);
  assert.equal(baseline.props.SoundService.AmbientReverb, 'NoReverb');
  assert.equal(baseline.props.Workspace.Gravity, 196.2);
  assert.deepEqual(baseline.parts['Workspace/Baseplate#Part'].Size, [512, 20, 512]);
  assert.equal(baseline.terrainCells, 0);
});

test('a pristine place verifies clean, and measures as nothing built', () => {
  assert.deepEqual(asObject(json(out['verify-pristine'])), { extra: [], missing: [], propDiffs: [] });
  const m = json(out['measure-pristine']);
  assert.equal(m.addedInstances, 0);
  assert.equal(m.addedParts, 0);
  assert.equal(m.bounds ?? null, null, 'nothing built means no bounding box (a nil is absent from the JSON)');
  assert.deepEqual(m.screenGuis, []);
  assert.deepEqual(m.spawn, { position: [0, 0.5, 0], size: [12, 1, 12] });
  assert.deepEqual(m.viewport, [1280, 720]);
});

test('measure counts what a run added, takes the bounding box of rotated parts, and finds the screen UIs', () => {
  const m = json(out['measure-dirty']);
  assert.equal(m.addedParts, 4, 'Counter, Roof, Turned and Loose; the pristine parts are not counted');
  // Counter x 35..45, y 0..4, z -33..-27. Roof x 34..46, y 8.5..9.5, z -34..-26. Turned: 90 degrees about Y swaps its X and Z, so it spans
  // x 58..62 (the old Z of 4), z 0..20 (the old X of 20) around (60, _, 10). Loose x -26..-24, y 5..7, z 4..6.
  assert.deepEqual(m.bounds.min.map((n) => Math.round(n * 1000) / 1000), [-26, 0, -34]);
  assert.deepEqual(m.bounds.max.map((n) => Math.round(n * 1000) / 1000), [62, 9.5, 20]);
  assert.equal(m.addedByService.StarterGui, 5, 'ShopGui, its Frame, TextLabel and TextButton, and EmptyGui');
  assert.equal(m.addedScripts, 2, 'a Script and a LocalScript');
  assert.deepEqual(
    m.screenGuis.sort((a, b) => a.name.localeCompare(b.name)),
    [{ name: 'EmptyGui', enabled: true, guiObjects: 0, texts: 0 }, { name: 'ShopGui', enabled: true, guiObjects: 3, texts: 2 }],
    'a ScreenGui with nothing in it is reported with 0 objects so the harness can tell it from a UI',
  );
  assert.equal(m.terrainCells, 42);
});

test('verify names what differs: extras, and the properties a run changed', () => {
  const v = json(out['verify-dirty']);
  assert.ok(v.extra.includes('Workspace/ShopStall#Model'));
  assert.ok(v.extra.includes('ServerScriptService/Script#Script'));
  assert.ok(v.extra.includes('Lighting/Atmosphere#Atmosphere'));
  assert.ok(v.extra.includes('StarterPlayer/StarterPlayerScripts#Folder/LocalScript#LocalScript'));
  assert.deepEqual(v.missing, []);
  for (const prop of ['Lighting.ClockTime', 'Lighting.Brightness', 'Lighting.Ambient', 'SoundService.AmbientReverb', 'Workspace.Gravity',
    'Workspace/Baseplate#Part.Size', 'Workspace/Baseplate#Part.Color', 'Terrain.cells 0 -> 42']) {
    assert.ok(v.propDiffs.includes(prop), `${prop} was not reported: ${v.propDiffs}`);
  }
});

test('reset removes everything added, restores the properties, clears the Terrain, and leaves a clean place', () => {
  const r = json(out['reset-dirty']);
  assert.ok(r.removedInstances >= 16, `removed ${r.removedInstances}`);
  assert.equal(r.terrainCleared, true);
  for (const prop of ['Lighting.ClockTime', 'Lighting.Ambient', 'Workspace.Gravity', 'Workspace/Baseplate#Part.Size']) {
    assert.ok(r.restored.includes(prop), `${prop} was not restored`);
  }
  assert.deepEqual(asObject(json(out['verify-after-reset'])), { extra: [], missing: [], propDiffs: [] });
  assert.equal(json(out['measure-after-reset']).addedInstances, 0);
});

test('the camera, the Terrain and runtime TouchTransmitters are never inventoried or destroyed', () => {
  assert.equal(out['camera-kept'], 'true');
  assert.equal(out['touch-ignored'], 'true', 'an extra Camera is engine-owned: left alone');
  assert.equal(baseline.inventory.Workspace.some((k) => /Camera|Terrain|TouchTransmitter/.test(k)), false);
});

test('a run that deleted the ground and the spawn gets them rebuilt from the recorded properties', () => {
  const v = json(out['verify-damaged']);
  assert.ok(v.missing.includes('Workspace/SpawnLocation#SpawnLocation'));
  const r = json(out['reset-damaged']);
  assert.deepEqual(r.rebuilt, ['Workspace/SpawnLocation#SpawnLocation'], 'the Baseplate part still existed (the run added two more of that name), only the spawn is rebuilt');
  assert.ok(r.restored.includes('Workspace/Baseplate#Part.Size'));
});

test('what a reset cannot put back (a deleted Sky) is reported as missing, not hidden', () => {
  const after = json(out['verify-after-damage-reset']);
  // The Baseplate's Texture went with the Baseplate the run deleted: a reset rebuilds a kept part from its recorded
  // properties, not its children, so that too is reported rather than hidden.
  assert.deepEqual(after.missing, ['Lighting/ColorGradingEffect#ColorGradingEffect', 'Lighting/Sky#Sky', 'Workspace/Baseplate#Part/Texture#Decal']);
  assert.deepEqual(after.extra, [], 'the duplicate Baseplates and everything else added are gone');
});

test('a second reset removes nothing', () => {
  const r = json(out['reset-again']);
  assert.equal(r.removedInstances, 0);
  assert.equal(Object.keys(asObject(r.rebuilt)).length, 0);
});

test('the reset script cannot be used to destroy a service or the DataModel: it only walks the 13 plugin services', () => {
  assert.equal(/game:Destroy|:ClearAllChildren|game:GetService\(("|')Players/.test(SCRIPT), false);
  const services = /local SERVICES = \{([^}]+)\}/.exec(SCRIPT)[1].match(/"[A-Za-z]+"/g).map((s) => s.slice(1, -1));
  assert.deepEqual(services, ['Workspace', 'ReplicatedStorage', 'ServerScriptService', 'ServerStorage', 'StarterGui', 'StarterPack',
    'StarterPlayer', 'ReplicatedFirst', 'Lighting', 'SoundService', 'Teams', 'TextChatService', 'MaterialService']);
});
