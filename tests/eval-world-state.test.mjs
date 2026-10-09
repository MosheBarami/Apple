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
import { BASELINE_FORMAT, baselineProblems, propertyAllowNames, propertyNamesLuau, worldScript, COMMANDS_PATH } from '../scripts/eval/lib/world.mjs';

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
// The script is wrapped as a function of the three lines the runner puts in front of it (world.mjs): the mode, the baseline
// and the plugin's property allowlist, which here is read from Commands.luau exactly as the runner reads it.
const compose = (script, scenario) => `${MOCK}\nlocal PROPERTY_NAMES = ${propertyNamesLuau()}\nlocal function __script(MODE, BASELINE_JSON, PROPERTY_NAMES)\n${script}\nend\n${scenario}`;
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

test('capture records the pristine inventory, including the engine singletons a reset must keep, and the properties of every kept instance', () => {
  const ws = baseline.inventory.Workspace;
  assert.deepEqual(ws, ['Workspace/Baseplate#Part', 'Workspace/Baseplate#Part/Texture#Decal', 'Workspace/SpawnLocation#SpawnLocation']);
  assert.ok(baseline.inventory.Lighting.includes('Lighting/Sky#Sky'));
  assert.ok(baseline.inventory.Lighting.includes('Lighting/ColorGradingEffect#ColorGradingEffect'));
  assert.deepEqual(baseline.inventory.TextChatService, ['TextChatService/ChatWindowConfiguration#Folder']);
  assert.deepEqual(baseline.inventory.StarterPlayer, ['StarterPlayer/StarterCharacterScripts#Folder', 'StarterPlayer/StarterPlayerScripts#Folder']);
  assert.deepEqual(baseline.inventory.ServerScriptService, []);
  assert.equal(baseline.format, BASELINE_FORMAT);
  assert.equal(baseline.state.Lighting.props.ClockTime, 14, 'a service property');
  assert.equal(baseline.state.SoundService.props.AmbientReverb.v[1], 'NoReverb', 'an enum');
  assert.equal(baseline.state.Workspace.props.Gravity, 196.2, 'a property the plugin allowlist does not name but the harness tracks');
  assert.deepEqual(baseline.state['Workspace/Baseplate#Part'].props.Size, { t: 'Vector3', v: [512, 20, 512] });
  assert.equal(baseline.state['Workspace/SpawnLocation#SpawnLocation'].props.Enabled, true, 'a kept instance\'s own property');
  assert.equal(baseline.state['Lighting/ColorGradingEffect#ColorGradingEffect'].props.Contrast, 0, 'a child of Lighting');
  assert.deepEqual(baseline.state['Workspace/Baseplate#Part'].attrs, { Surface: 'stone' });
  assert.deepEqual(baseline.state.Workspace.attrs, { Tier: 'bronze' });
  assert.equal(Object.hasOwn(baseline.state.Lighting.attrs, 'RBX_OriginalTechnologyOnFileLoad'), false, 'the engine\'s own attributes are not tracked: nobody can set or clear them');
  assert.equal(Object.keys(baseline.state).length, Object.values(baseline.inventory).flat().length + 13, 'one state per inventoried instance and per service');
  assert.equal(baseline.terrainCells, 0);
});

test('a pristine place verifies clean, and measures as nothing built', () => {
  assert.deepEqual(asObject(json(out['verify-pristine'])), { extra: [], missing: [], propDiffs: [] });
  const m = json(out['measure-pristine']);
  assert.equal(m.addedInstances, 0);
  assert.equal(m.addedParts, 0);
  assert.equal(m.bounds ?? null, null, 'nothing built means no bounding box (a nil is absent from the JSON)');
  assert.deepEqual(m.screenGuis, []);
  assert.deepEqual(m.spawn, { position: [0, 0.5, 0], size: [12, 1, 12], source: 'pristine' });
  assert.deepEqual(m.terrain, { cells: 0, baselineCells: 0, edited: false });
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

// ================================================================================ what a run does to what the place KEEPS
// Reset and verify once covered only the services' properties and the parts directly in Workspace, so a run that disabled the
// spawn, locked the Baseplate or changed a Lighting child left the place changed while verify said clean.
const KEPT_EDIT_DIFFS = [
  'Lighting.Ambient',
  'Lighting/ColorGradingEffect#ColorGradingEffect.Contrast',
  'Lighting/Sky#Sky@Mood',
  'ReplicatedStorage/Sparks#ParticleEmitter.Lifetime',
  'StarterGui/HudFrame#Frame.AnchorPoint',
  'StarterGui/HudFrame#Frame.Size',
  'Workspace/Baseplate#Part.CustomPhysicalProperties',
  'Workspace/Baseplate#Part.Friction',
  'Workspace/Baseplate#Part.Locked',
  'Workspace/Baseplate#Part.Material',
  'Workspace/Baseplate#Part@Biome',
  'Workspace/Baseplate#Part@Surface',
  'Workspace/SpawnLocation#SpawnLocation.CFrame',
  'Workspace/SpawnLocation#SpawnLocation.CustomPhysicalProperties',
  'Workspace/SpawnLocation#SpawnLocation.Enabled',
  'Workspace@Round',
  'Workspace@Tier',
];

test('KEPT INSTANCES: verify names every property and attribute a run changed on the spawn, the Baseplate, a Lighting child and a service', () => {
  assert.equal(out['kept-before'], 'false 0.9 true', 'the edits landed (the run really disabled the spawn, set the contrast and locked the ground)');
  const v = json(out['verify-kept-edits']);
  assert.deepEqual(v.extra, []);
  assert.deepEqual(v.missing, []);
  assert.deepEqual(v.propDiffs, KEPT_EDIT_DIFFS);
  assert.equal(v.propDiffs.some((d) => /RBX/.test(d)), false, 'clearing an engine-owned attribute is not a difference');
});

test('KEPT INSTANCES: reset puts every one of them back, of every recorded kind, and the place then verifies clean', () => {
  const r = json(out['reset-kept-edits']);
  assert.deepEqual(r.restored, KEPT_EDIT_DIFFS);
  assert.deepEqual(r.restoreFailed, []);
  assert.deepEqual(asObject(json(out['verify-after-kept-edits-reset'])), { extra: [], missing: [], propDiffs: [] });
  // what the live objects hold now: spawn on, contrast 0, ground unlocked, plastic, friction restored to the limit value (inf),
  // no custom physics on the ground, the old attribute value back, an attribute the run added gone, a UDim2, a Vector2 and a
  // NumberRange back, and the spawn's own PhysicalProperties (density 1) back.
  assert.equal(out['kept-state-after'], 'true 0 false Plastic inf nil stone nil bronze nil nil 0.5 0.5 2 1 50 0.27 0');
});

test('KEPT INSTANCES: the property list is what the plugin may write (its API dump rule), and the script holds no copy of it', () => {
  const names = propertyAllowNames();
  assert.ok(names.length > 200, `only ${names.length} names were read: this test would check nothing`);
  for (const n of ['Anchored', 'CanCollide', 'Locked', 'Transparency', 'Size', 'CFrame', 'Enabled', 'ClockTime', 'Contrast', 'Density', 'TonemapperPreset', 'AmbientReverb']) assert.ok(names.includes(n), `${n} is writable by the plugin and must be tracked`);
  // plugin 2.0 keeps no allowlist table to drift from: the deny list stays out of the tracked names
  for (const denied of ['Source', 'Parent']) assert.equal(names.includes(denied), false, `${denied} is on the deny list`);
  assert.ok(readFileSync(COMMANDS_PATH, 'utf8').includes('local PROPERTY_ALLOW = setmetatable('), 'the plugin grew an allowlist table back');
  // no hand-written copy in the script: the allowlist's common names must not appear as string literals there
  const code = SCRIPT.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n'); // comments first: the header documents the injected list
  for (const n of ['Anchored', 'CanCollide', 'Transparency', 'Reflectance', 'ClockTime', 'Contrast']) assert.equal(code.includes(`"${n}"`), false, `${n} is typed into world-state.luau: derive it from Commands.luau`);
  // an unreadable list is an error, never an empty list
  assert.throws(() => propertyAllowNames({ writableNames: new Set(['A']) }), /only 1 property names/);
});

test('the Luau the runner sends (mode, baseline and property list in front of the script) is valid Luau in every mode', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eval-world-state-prelude-'));
  for (const mode of ['capture', 'reset', 'verify', 'measure', 'ui-enable', 'ui-restore']) {
    const file = join(dir, `${mode}.luau`);
    writeFileSync(file, worldScript(mode, baseline));
    let text = '';
    try {
      text = execFileSync('luau-analyze', [file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      text = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    }
    assert.equal(/SyntaxError/.test(text), false, `${mode}: ${text}`);
  }
  assert.throws(() => worldScript('verify', null), /needs the baseline/);
  assert.throws(() => worldScript('explode', baseline), /unknown world-state mode/);
});

test('baselineProblems accepts a real capture and refuses an old-format baseline, one with no recorded state, and an empty place', () => {
  assert.deepEqual(baselineProblems(baseline), []);
  const old = { inventory: baseline.inventory, props: { Lighting: { ClockTime: 14 } }, parts: { 'Workspace/Baseplate#Part': { class: 'Part' } }, terrainCells: 0 };
  assert.match(baselineProblems(old).join(), /format 1, not 2.*run --init-baseline again/);
  assert.match(baselineProblems({ ...baseline, state: undefined }).join(), /no recorded state/);
  assert.match(baselineProblems({ ...baseline, state: { Workspace: baseline.state.Workspace } }).join(), /no Baseplate or SpawnLocation/);
  const bare = Object.fromEntries(Object.entries(baseline.state).map(([k, v]) => [k, { ...v, props: {} }]));
  assert.match(baselineProblems({ ...baseline, state: bare }).join(), /tracked nothing/);
  assert.match(baselineProblems(null).join(), /not an object/);
});

// ================================================================================ terrain, framing, spawn, UI
test('TERRAIN: a piece built from terrain alone is edited, and its box is the terrain\'s own (voxels of 4 studs)', () => {
  const m = json(out['measure-terrain-only']);
  assert.equal(m.addedParts, 0);
  assert.deepEqual(m.terrain, { cells: 5000, baselineCells: 0, edited: true, extents: { min: [-128, 0, -128], max: [128, 32, 128] } });
  assert.deepEqual(m.bounds, { min: [-128, 0, -128], max: [128, 32, 128] }, 'the camera is told where the terrain is');
  assert.equal(m.framing.includesTerrain, true);
  assert.equal(m.terrainCells, 5000);
});

test('TERRAIN: terrain together with parts frames both; an extents box that is a limit, not a measurement, is not used; unchanged terrain is not an edit', () => {
  const both = json(out['measure-terrain-and-parts']);
  assert.deepEqual(both.bounds, { min: [-128, 0, -128], max: [305, 32, 128] });
  assert.deepEqual(both.partBounds, { min: [295, 0, -5], max: [305, 10, 5] }, 'the parts\' own box is kept beside the union');
  const limit = json(out['measure-terrain-unusable-extents']);
  assert.equal(limit.terrain.edited, true, 'the cell count still says the terrain was edited');
  assert.equal(limit.terrain.extents ?? null, null);
  assert.equal(limit.bounds ?? null, null, 'no box is invented');
  const same = json(out['measure-terrain-unchanged']);
  assert.equal(same.terrain.edited, false, 'terrain that was in the baseline is not what the run built');
  assert.equal(same.terrain.extents ?? null, null);
  assert.deepEqual(asObject(json(out['verify-after-terrain'])), { extra: [], missing: [], propDiffs: [] });
});

test('FRAMING: an invisible part and a ground-sized slab do not shrink the piece; the box falls back only when nothing else is left', () => {
  const m = json(out['measure-framing']);
  assert.equal(m.addedParts, 3, 'all three parts are counted');
  assert.deepEqual(m.bounds, { min: [27, 0, 27], max: [33, 12, 33] }, 'but only the statue is framed, not the 2048-stud ground or the invisible trigger');
  assert.deepEqual(m.framing, { basis: 'framed', hiddenParts: 1, hugeParts: 1, includesTerrain: false });
  const huge = json(out['measure-framing-only-huge']);
  assert.deepEqual(huge.framing, { basis: 'huge', hiddenParts: 1, hugeParts: 1, includesTerrain: false });
  assert.deepEqual(huge.bounds, { min: [-1024, -1, -1024], max: [1024, 0, 1024] });
  const hidden = json(out['measure-framing-only-hidden']);
  assert.equal(hidden.framing.basis, 'hidden');
  assert.deepEqual(hidden.bounds, { min: [-540, 0, -40], max: [-460, 40, 40] });
});

test('SPAWN: the player appears at an enabled SpawnLocation the run added, else at the pristine enabled one, else at the origin; the source says which', () => {
  assert.deepEqual(json(out['measure-spawn-added']).spawn, { position: [100, 0.5, 40], size: [10, 1, 10], source: 'added' });
  assert.deepEqual(json(out['measure-spawn-added-disabled']).spawn, { position: [0, 0.5, 0], size: [12, 1, 12], source: 'pristine' });
  assert.deepEqual(json(out['measure-spawn-none-enabled']).spawn, { position: [0, 0, 0], size: [6, 1, 6], source: 'default' });
  assert.deepEqual(asObject(json(out['verify-after-spawn'])), { extra: [], missing: [], propDiffs: [] }, 'the disabled pristine spawn is switched back on by the reset');
});

test('UI: a ScreenGui a run switched off is turned on for the capture and put back exactly; an enabled one and an empty one are left alone', () => {
  const m = json(out['measure-ui-disabled']);
  assert.deepEqual(m.screenGuis.map((g) => `${g.name}:${g.enabled}:${g.guiObjects}`).sort(), ['HollowGui:false:0', 'HudGui:true:1', 'ModalGui:false:1']);
  assert.deepEqual(json(out['ui-enable']), { enabled: ['ModalGui'] });
  assert.equal(out['ui-after-enable'], 'true true false true', 'the modal is on and marked; the hud is untouched; the empty one stays off');
  assert.deepEqual(json(out['ui-restore']), { restored: ['ModalGui'] });
  assert.equal(out['ui-after-restore'], 'false true false nil', 'the modal is off again and the mark is gone');
  assert.deepEqual(asObject(json(out['verify-after-ui'])), { extra: [], missing: [], propDiffs: [] });
});

test('A PROPERTY THAT WAS READABLE AND IS NOT ANY MORE is a difference in verify, and reset writes it back: a failure to read never looks like "unchanged"', () => {
  assert.deepEqual(json(out['verify-unreadable']).propDiffs, ['StarterGui/HudFrame#Frame.Size']);
  assert.deepEqual(json(out['reset-unreadable']).restored, ['StarterGui/HudFrame#Frame.Size']);
  assert.deepEqual(asObject(json(out['verify-after-unreadable'])), { extra: [], missing: [], propDiffs: [] });
});
