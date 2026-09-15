// Place audio, checked against the engine's own type dump and then RUN.
//
// Generated Luau has a failure mode that no amount of reading catches: `SoundService.Rolloff = 1`
// parses, compiles, ships, and throws in the user's place because the property is `RolloffScale`.
// An invented class name, a mistyped enum item and a property that belongs to a different class all
// behave the same way — silently correct here, broken there. So this file checks three things
// nothing inside the module could check for itself:
//
//   1. EVERY class, property and enum item the generator emits exists, verified against
//      apps/plugin/globalTypes.d.luau — the engine type dump this repository ships. Parsed per
//      class block, so a property of `Sound` cannot satisfy an assertion about `SoundGroup`.
//   2. Every chunk COMPILES, with luau-analyze.
//   3. Every chunk RUNS, twice, against a mock DataModel — because idempotency is a claim about
//      what happens on the second run and no static check can see it. Five duplicate SoundGroups
//      is not an error either; it is a volume slider that quietly stops working.
//
// Run with:  node --test tests/sound-design.test.mjs      (from apps/worker)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const REPO = join(WORKER, '..', '..');
const OUT = join(tmpdir(), `apple-sound-design-${process.pid}.mjs`);
const TMP = mkdtempSync(join(tmpdir(), 'sd-luau-'));

await esbuild.build({ entryPoints: [join(WORKER, 'src', 'sound-design.ts')], bundle: true, format: 'esm', target: 'es2022', outfile: OUT });
const D = await import(pathToFileURL(OUT).href);
process.on('exit', () => { rmSync(OUT, { force: true }); rmSync(TMP, { recursive: true, force: true }); });

const GLOBAL_TYPES = readFileSync(join(REPO, 'apps', 'plugin', 'globalTypes.d.luau'), 'utf8');

const haveLuau = (bin) => { try { execFileSync(bin, ['--help'], { stdio: 'pipe' }); return true; } catch { return false; } };

/* ---------------------------------------------------- reading the engine's type dump ---- */

/** The items of one `Enum.X`, from its `EnumX_INTERNAL` block and nowhere else. */
function enumItems(name) {
  const start = GLOBAL_TYPES.indexOf(`declare extern type Enum${name}_INTERNAL extends Enum with`);
  assert.ok(start > 0, `Enum${name} is not in globalTypes.d.luau — this test is measuring nothing`);
  const end = GLOBAL_TYPES.indexOf('\nend', start);
  const block = GLOBAL_TYPES.slice(start, end);
  return new Set([...block.matchAll(new RegExp(`^\\t(\\w+): Enum${name}$`, 'gm'))].map((m) => m[1]));
}

/**
 * The properties of one class, INCLUDING those it inherits.
 *
 * Anchored to the class's own `declare extern type X extends Y with` block and walked up the
 * inheritance chain, rather than searched for anywhere in the file. A file-wide search would let
 * `Volume` — which Sound, SoundGroup and several others all have — satisfy an assertion about any
 * class at all, which is precisely the "a second occurrence elsewhere satisfies it" failure.
 */
function classProperties(className, seen = new Set()) {
  if (seen.has(className)) return new Set();
  seen.add(className);
  const re = new RegExp(`^declare extern type ${className} extends (\\w+) with$`, 'm');
  const match = re.exec(GLOBAL_TYPES);
  if (!match) return new Set();
  const start = match.index;
  const end = GLOBAL_TYPES.indexOf('\nend', start);
  const block = GLOBAL_TYPES.slice(start, end);
  const props = new Set([...block.matchAll(/^\t(\w+): /gm)].map((m) => m[1]));
  for (const inherited of classProperties(match[1], seen)) props.add(inherited);
  // Every Instance has these; the dump declares them on Instance, which the walk above reaches.
  return props;
}

/** The CREATABLE_INSTANCES list from the metadata comment on line 1 of the dump. */
function creatableInstances() {
  const line = GLOBAL_TYPES.slice(0, GLOBAL_TYPES.indexOf('\n'));
  const json = JSON.parse(line.slice(line.indexOf('{')));
  return new Set(json.CREATABLE_INSTANCES);
}

/* ============================================================ the vocabulary is the engine's === */

test('EVERY reverb type this module offers is a real Enum.ReverbType item — and none is missing', () => {
  const engine = enumItems('ReverbType');
  assert.ok(engine.size >= 20, `parsed only ${engine.size} reverb types out of the dump`);
  for (const name of D.REVERB_TYPES) {
    assert.ok(engine.has(name), `Enum.ReverbType.${name} does not exist — it would throw in a live place`);
  }
  for (const name of engine) {
    assert.ok(D.REVERB_TYPES.includes(name), `the engine has Enum.ReverbType.${name} and this module cannot reach it`);
  }
});

test('every roll-off mode is a real Enum.RollOffMode item', () => {
  const engine = enumItems('RollOffMode');
  for (const name of D.ROLLOFF_MODES) assert.ok(engine.has(name), `Enum.RollOffMode.${name} does not exist`);
  assert.equal(D.ROLLOFF_MODES.length, engine.size);
});

test('every environment names a reverb that exists', () => {
  for (const entry of D.environmentCatalogue()) {
    assert.ok(D.REVERB_TYPES.includes(entry.reverb), `${entry.name} uses ${entry.reverb}`);
    assert.ok(entry.summary.length > 10 && entry.use.length > 10, `${entry.name} is not documented`);
  }
});

test('every SoundService property this module writes is a real SoundService property', () => {
  const props = classProperties('SoundService');
  assert.ok(props.has('AmbientReverb'), 'the SoundService block was not parsed');
  for (const name of D.WRITTEN_SOUND_SERVICE_PROPERTIES) {
    assert.ok(props.has(name), `SoundService.${name} does not exist — assigning to it throws at runtime`);
  }
  // And the ones deliberately NOT written are real too: the list is a choice, not a typo.
  for (const name of ['OcclusionEnabled', 'AcousticSimulationEnabled']) {
    assert.ok(props.has(name), `the "deliberately not written" note names ${name}, which is not a property either`);
    assert.ok(!D.WRITTEN_SOUND_SERVICE_PROPERTIES.includes(name), `${name} is written despite the note saying it is not`);
  }
});

test('EVERY class and property in the generated mixer is real, checked per class', () => {
  // The parse below tracks which class each local holds, so `music.Volume` is checked against
  // SoundGroup and `voice_voiceleveller.Threshold` against CompressorSoundEffect. Checking every
  // property against a union of all classes would pass on `music.Threshold`, which throws.
  const creatable = creatableInstances();
  const chunk = D.soundDesignLuau('cave');
  assert.equal(typeof chunk, 'string', JSON.stringify(chunk));

  const varClass = new Map([['SoundService', 'SoundService']]);
  for (const m of chunk.matchAll(/^local (\w+) = ensure\([^,]+, "(\w+)", /gm)) {
    assert.ok(creatable.has(m[2]), `Instance.new("${m[2]}") — that class is not creatable`);
    varClass.set(m[1], m[2]);
  }
  assert.ok(varClass.size > 5, `only ${varClass.size} instances were parsed out of the chunk`);

  let checked = 0;
  for (const m of chunk.matchAll(/^(\w+)\.(\w+) = /gm)) {
    const className = varClass.get(m[1]);
    if (!className) continue;
    const props = classProperties(className);
    assert.ok(props.size > 0, `could not read the ${className} block`);
    assert.ok(props.has(m[2]), `${className}.${m[2]} does not exist — it would throw in a live place`);
    checked++;
  }
  assert.ok(checked >= 12, `only ${checked} property assignments were checked; the parse is missing most of the chunk`);
});

/* ==================================================================== no asset, anywhere === */

test('NOT ONE generated chunk references an asset', () => {
  // The claim the whole module rests on, asserted over every environment rather than over one.
  const chunks = D.ENVIRONMENT_NAMES.map((n) => D.soundDesignLuau(n));
  chunks.push(D.assignSoundsLuau([{ path: 'game.Workspace.Forge.Crackle', bus: 'SFX' }]));
  for (const chunk of chunks) {
    assert.equal(typeof chunk, 'string');
    for (const shape of [/rbxassetid/i, /rbxasset:/i, /https?:\/\//i, /\bSoundId\b/]) {
      assert.ok(!shape.test(chunk), `a chunk matched ${shape} — the module is referencing audio it cannot verify`);
    }
  }
});

test('an asset id offered by the caller is refused, with the reason that makes it a refusal', () => {
  for (const offered of ['rbxassetid://9046863579', 'rbxasset://sounds/impact.mp3', 'https://example.com/a.mp3', '9046863579']) {
    const r = D.refuseSoundId(offered);
    assert.ok(r && r.refused, `"${offered}" was accepted as a sound`);
    assert.equal(r.reason, 'asset_id');
    assert.match(r.message, /plays silently rather than erroring/);
  }
  assert.equal(D.refuseSoundId('game.Workspace.Forge.Crackle'), null, 'an ordinary instance path was refused as an asset');
  assert.equal(D.refuseSoundId(''), null);
});

/* ========================================================================== the mixer === */

test('the bus volumes are a MIX, not five ones', () => {
  const byName = Object.fromEntries(D.SOUND_BUSES.map((b) => [b.name, b.volume]));
  assert.equal(D.SOUND_BUSES.length, D.BUS_NAMES.length);
  assert.ok(new Set(Object.values(byName)).size > 2, 'every bus is at the same volume, which is not a mix');
  assert.ok(byName.Music < byName.SFX, 'music is not below the effects it plays under');
  assert.ok(byName.Voice >= byName.SFX, 'dialogue is quieter than the effects it has to be heard over');
  assert.ok(byName.Ambience <= byName.Music, 'the ambience bed is louder than the score');
});

test('an environment TRIM actually reaches the emitted volume', () => {
  // The relationship, not a literal: a cave pulls the music down relative to open ground, and the
  // number in the chunk must reflect it. A `busTrimDb` field nothing reads is a comment.
  const volumeOf = (chunk, bus) => {
    const line = new RegExp(`^${bus.toLowerCase()}\\.Volume = ([\\d.]+)$`, 'm').exec(chunk);
    assert.ok(line, `no volume line for ${bus}`);
    return Number(line[1]);
  };
  const open = D.soundDesignLuau('open_world');
  const cave = D.soundDesignLuau('cave');
  assert.ok(volumeOf(cave, 'Music') < volumeOf(open, 'Music'), 'the cave trim did not reach the music bus');
  assert.ok(volumeOf(cave, 'Ambience') > volumeOf(open, 'Ambience'), 'the cave trim did not raise the ambience bus');
  assert.equal(volumeOf(cave, 'UI'), volumeOf(open, 'UI'), 'an untrimmed bus moved between environments');

  // A master trim moves everything, in the same direction.
  const quiet = D.soundDesignLuau('open_world', { masterTrimDb: -6 });
  for (const bus of D.BUS_NAMES) {
    assert.ok(volumeOf(quiet, bus) < volumeOf(open, bus), `${bus} ignored the master trim`);
  }
});

test('enclosed environments fall off faster than open ones', () => {
  const scale = (n) => D.SOUND_ENVIRONMENTS[n].rolloffScale;
  assert.ok(scale('small_room') > scale('open_world'), 'a living room carries sound as far as a field');
  assert.ok(scale('cave') > scale('forest'));
  assert.ok(scale('underwater') > scale('city'));
  assert.ok(scale('mountains') < scale('corridor'));
});

/* ====================================================================== refusals === */

test('an unknown environment is refused and the refusal lists the real ones', () => {
  const r = D.soundDesignLuau('spooky');
  assert.ok(D.isRefusal(r));
  assert.equal(r.reason, 'unknown_environment');
  assert.match(r.message, /cave/);
});

test('a prototype key is not an environment', () => {
  // `SOUND_ENVIRONMENTS['constructor']` is a function on any plain object; `.reverb` off it is
  // undefined, and the chunk would carry `Enum.ReverbType.undefined` — which parses, ships, and
  // throws in the user's place.
  for (const key of ['__proto__', 'constructor', 'toString']) {
    const r = D.soundDesignLuau(key);
    assert.ok(D.isRefusal(r), `"${key}" generated a chunk`);
  }
});

test('a malformed instance path is refused rather than concatenated into code', () => {
  for (const path of ['Workspace.Thing', 'game', '', 'game.Work"space.Thing', 'game.Thing\u0000']) {
    const r = D.assignSoundsLuau([{ path, bus: 'SFX' }]);
    assert.ok(D.isRefusal(r), `"${path}" was accepted as a path`);
    assert.equal(r.reason, 'bad_path');
  }
});

test('an impossible falloff range is refused — max must exceed min, and NaN is not a distance', () => {
  const base = { path: 'game.Workspace.Crackle', bus: 'SFX' };
  for (const range of [{ minDistance: 100, maxDistance: 50 }, { minDistance: 10, maxDistance: 10 }, { minDistance: NaN, maxDistance: 100 }, { minDistance: 10, maxDistance: Infinity }, { minDistance: -5, maxDistance: 50 }]) {
    const r = D.assignSoundsLuau([{ ...base, ...range }]);
    assert.ok(D.isRefusal(r), `${JSON.stringify(range)} was accepted`);
    assert.equal(r.reason, 'bad_parameter');
  }
  assert.equal(typeof D.assignSoundsLuau([{ ...base, minDistance: 8, maxDistance: 90 }]), 'string');
});

test('an unknown bus or roll-off mode is refused', () => {
  assert.equal(D.assignSoundsLuau([{ path: 'game.Workspace.X', bus: 'Master' }]).reason, 'unknown_bus');
  assert.equal(D.assignSoundsLuau([{ path: 'game.Workspace.X', bus: 'SFX', rollOffMode: 'Exponential' }]).reason, 'bad_parameter');
});

test('an absurd trim is refused rather than emitted as a volume of zero or a hundred', () => {
  assert.equal(D.assignSoundsLuau([{ path: 'game.Workspace.X', bus: 'SFX', volumeDb: 40 }]).reason, 'bad_parameter');
  assert.equal(D.assignSoundsLuau([{ path: 'game.Workspace.X', bus: 'SFX', volumeDb: NaN }]).reason, 'bad_parameter');
  assert.equal(D.soundDesignLuau('cave', { masterTrimDb: 99 }).reason, 'bad_parameter');
});

/* ========================================================================= it compiles === */

test('every generated chunk COMPILES', { skip: haveLuau('luau-analyze') ? false : 'luau-analyze not on PATH' }, () => {
  const chunks = D.ENVIRONMENT_NAMES.map((n) => [n, D.soundDesignLuau(n)]);
  chunks.push(['assign', D.assignSoundsLuau([
    { path: 'game.Workspace.Forge.Crackle', bus: 'SFX', minDistance: 8, maxDistance: 60, volumeDb: -3 },
    { path: 'game.Workspace["Camp Fire"].Hiss', bus: 'Ambience', rollOffMode: 'Linear', looped: true },
  ])]);
  for (const [name, chunk] of chunks) {
    const file = join(TMP, `${name}.luau`);
    writeFileSync(file, chunk);
    let output = '';
    try { output = execFileSync('luau-analyze', [file], { encoding: 'utf8', stdio: 'pipe' }); }
    catch (e) { output = `${e.stdout ?? ''}${e.stderr ?? ''}`; }
    // SyntaxError only, which is the same filter effects.test.mjs applies and for the same reason:
    // run without the Roblox type definitions, luau-analyze reports `game`, `Instance` and `Enum`
    // as unknown globals on EVERY chunk this repository generates. Those three exist in the place
    // the chunk runs in, so treating them as failures would make this test permanently red and
    // therefore permanently ignored. What it still catches is the thing it is for: a chunk that
    // does not parse, which is what a generator bug produces.
    const syntax = output.split('\n').filter((l) => l.includes('SyntaxError'));
    assert.equal(syntax.length, 0, `${name} does not parse:\n${syntax.join('\n')}`);
  }
});

/* ============================================================================ it runs === */

// A DataModel small enough to read and real enough to catch a duplicate. Instances are proxies so
// that `x.Parent = y` actually parents — without __newindex the generated code would appear to work
// and nothing would ever be a child of anything.
const HARNESS = `
local ALL = {}
local function newInstance(class)
\tlocal data = { ClassName = class, Name = class }
\tlocal children, attributes = {}, {}
\tlocal proxy = {}
\tlocal methods = {}
\tmethods.FindFirstChild = function(_, name)
\t\tfor _, c in ipairs(children) do if c.Name == name then return c end end
\t\treturn nil
\tend
\tmethods.GetChildren = function() return children end
\tmethods.IsA = function(_, c) return data.ClassName == c end
\tmethods.GetFullName = function() return data.Name end
\tmethods.GetAttribute = function(_, k) return attributes[k] end
\tmethods.SetAttribute = function(_, k, v) attributes[k] = v end
\tmethods._addChild = function(_, c) table.insert(children, c) end
\tsetmetatable(proxy, {
\t\t__index = function(_, k) if methods[k] then return methods[k] end return data[k] end,
\t\t__newindex = function(_, k, v)
\t\t\tdata[k] = v
\t\t\tif k == "Parent" and v ~= nil then v:_addChild(proxy) end
\t\tend,
\t})
\ttable.insert(ALL, proxy)
\treturn proxy
end

Instance = { new = function(class) return newInstance(class) end }
Enum = setmetatable({}, { __index = function(_, enumName)
\treturn setmetatable({}, { __index = function(_, item) return { EnumType = enumName, Name = item } end })
end })

local services = {}
game = newInstance("DataModel")
game.Name = "game"
local rawGame = game
function rawGame:GetService(name)
\tif not services[name] then
\t\tlocal s = newInstance(name)
\t\ts.Name = name
\t\ts.Parent = rawGame
\t\tservices[name] = s
\tend
\treturn services[name]
end

function COUNT(class)
\tlocal n = 0
\tfor _, inst in ipairs(ALL) do if inst.ClassName == class then n = n + 1 end end
\treturn n
end
function SERVICE(name) return services[name] end
function MAKE(class, name, parent)
\tlocal inst = newInstance(class)
\tinst.Name = name
\tinst.Parent = parent
\treturn inst
end
`;

function runLuau(body) {
  const file = join(TMP, `run-${Math.random().toString(36).slice(2)}.luau`);
  writeFileSync(file, `${HARNESS}\n${body}\n`);
  try {
    return { ok: true, output: execFileSync('luau', [file], { encoding: 'utf8', stdio: 'pipe' }) };
  } catch (e) {
    return { ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

test('THE PASS IS IDEMPOTENT: running it twice leaves one mixer, not two', { skip: haveLuau('luau') ? false : 'luau not on PATH' }, () => {
  // No static check can see this. A generator that calls Instance.new unconditionally produces a
  // chunk that reads perfectly and, on its second run, gives the place ten SoundGroups — five of
  // which nothing is routed to, so the volume slider silently stops working.
  const chunk = D.soundDesignLuau('cave');
  const r = runLuau([
    `local function pass() ${'\n'}${chunk}${'\n'} end`,
    'pass()',
    'local afterOne = COUNT("SoundGroup")',
    'pass()',
    'local afterTwo = COUNT("SoundGroup")',
    'print(afterOne, afterTwo, COUNT("CompressorSoundEffect"), SERVICE("SoundService").AmbientReverb.Name)',
  ].join('\n'));
  assert.ok(r.ok, `the chunk failed to run:\n${r.output}`);
  const [one, two, compressors, reverb] = r.output.trim().split(/\s+/);
  assert.equal(Number(one), D.BUS_NAMES.length, `the first pass created ${one} groups for ${D.BUS_NAMES.length} buses`);
  assert.equal(Number(two), Number(one), `the second pass created ${Number(two) - Number(one)} duplicate SoundGroups`);
  assert.equal(Number(compressors), 2, `expected two compressors, got ${compressors}`);
  assert.equal(reverb, 'Cave', `SoundService.AmbientReverb came out as ${reverb}`);
});

test('a name already held by something else is an ERROR, not something to delete', { skip: haveLuau('luau') ? false : 'luau not on PATH' }, () => {
  // Deleting a user's instance to make room for ours, in their own place, is not a trade this pass
  // gets to make on its own. The chunk must stop and say what is in the way.
  const chunk = D.soundDesignLuau('dry');
  const r = runLuau([
    'local ss = game:GetService("SoundService")',
    'MAKE("Folder", "Music", ss)',
    `local ok, err = pcall(function() ${'\n'}${chunk}${'\n'} end)`,
    'print(ok, tostring(err))',
    'print("folders:", COUNT("Folder"))',
  ].join('\n'));
  assert.ok(r.ok, `the harness failed:\n${r.output}`);
  assert.match(r.output, /^false/, `the pass overwrote a user instance instead of refusing: ${r.output}`);
  assert.match(r.output, /already exists and is a Folder/);
  assert.match(r.output, /folders:\s+1/, 'the Folder was destroyed');
});

test('THE VOLUME TRIM DOES NOT COMPOUND: running the assignment twice gives the same volume', { skip: haveLuau('luau') ? false : 'luau not on PATH' }, () => {
  // "Turn this down 6 dB" applied twice is -12 and applied five times is inaudible, and nothing in
  // the place would say why. The base volume is recorded once and every later trim computes from it.
  const chunk = D.assignSoundsLuau([{ path: 'game.Workspace.Crackle', bus: 'SFX', volumeDb: -6, minDistance: 8, maxDistance: 60 }]);
  assert.equal(typeof chunk, 'string', JSON.stringify(chunk));
  const r = runLuau([
    'local ss = game:GetService("SoundService")',
    'MAKE("SoundGroup", "SFX", ss)',
    'local workspace_ = MAKE("Folder", "Workspace", game)',
    'local sound = MAKE("Sound", "Crackle", workspace_)',
    'sound.Volume = 1',
    `local function pass() ${'\n'}${chunk}${'\n'} end`,
    'local first = pass()',
    'local afterOne = sound.Volume',
    'pass()',
    'print(string.format("%.6f %.6f %s %d %d", afterOne, sound.Volume, sound.SoundGroup.Name, sound.RollOffMinDistance, sound.RollOffMaxDistance))',
    'print("assigned:", first.assigned, "missing:", #first.missing)',
  ].join('\n'));
  assert.ok(r.ok, `the chunk failed to run:\n${r.output}`);
  const [afterOne, afterTwo, group, minD, maxD] = r.output.trim().split('\n')[0].split(/\s+/);
  assert.ok(Math.abs(Number(afterOne) - 0.501187) < 0.001, `-6 dB gave ${afterOne}, which is not half the amplitude`);
  assert.equal(afterTwo, afterOne, `the second pass moved the volume from ${afterOne} to ${afterTwo} — the trim compounds`);
  assert.equal(group, 'SFX');
  assert.equal(minD, '8');
  assert.equal(maxD, '60');
  assert.match(r.output, /assigned:\s+1\s+missing:\s+0/);
});

test('a Sound that is not there is REPORTED as missing, not counted as assigned', { skip: haveLuau('luau') ? false : 'luau not on PATH' }, () => {
  // The count and the misses both come back, so the caller can tell "all of them" from "the ones
  // that happened to exist". A pass that assigned three of eight and reported success is the exact
  // substitution this repository refuses.
  const chunk = D.assignSoundsLuau([
    { path: 'game.Workspace.Here', bus: 'SFX' },
    { path: 'game.Workspace.NotHere', bus: 'SFX' },
  ]);
  const r = runLuau([
    'local ss = game:GetService("SoundService")',
    'MAKE("SoundGroup", "SFX", ss)',
    'local workspace_ = MAKE("Folder", "Workspace", game)',
    'local sound = MAKE("Sound", "Here", workspace_)',
    'sound.Volume = 1',
    `local result = (function() ${'\n'}${chunk}${'\n'} end)()`,
    'print(result.assigned, #result.missing, result.missing[1])',
  ].join('\n'));
  assert.ok(r.ok, `the chunk failed to run:\n${r.output}`);
  const [assigned, missing, first] = r.output.trim().split(/\s+/);
  assert.equal(assigned, '1');
  assert.equal(missing, '1', 'the absent Sound was not reported');
  assert.equal(first, 'game.Workspace.NotHere');
});
