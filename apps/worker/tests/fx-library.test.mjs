/**
 * D-FXLIB-1: Apple's sounds and particle effects come from the stored library.
 *
 * What this file holds the worker to:
 *   - find_sound / find_vfx are read-only lookups over bundled indexes; insert_sound / insert_vfx
 *     are Studio writers; play_library_sound plays locally and changes nothing;
 *   - every sound handed out is a numeric Roblox audio id that the library holds (or one a search
 *     of this run returned), and an id from nowhere is refused before Studio is asked anything;
 *   - every effect preset, on every kind of target, compiles to classes, properties and enums the
 *     plugin accepts, with textures only from the plugin's engine-texture list, and beams and
 *     trails are linked to attachments the same call created;
 *   - the generic writers refuse to make a Sound, ParticleEmitter, Beam, Trail, Fire, Smoke or
 *     Sparkles by hand (create_instances, run_luau, edit_script), naming the library call instead;
 *     comments are not code; a vetted kit's own emitter still gets through;
 *   - set_properties refuses a SoundId that is not a library or discovered id.
 *
 * Run with:  node --test tests/fx-library.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const ROOT = join(WORKER, '..', '..');
const PLUGIN_SRC = join(WORKER, '..', 'apple-plugin', 'src');
const SFX = JSON.parse(readFileSync(join(ROOT, 'packages', 'asset-library', 'sfx', 'index.json'), 'utf8'));
const VFX = JSON.parse(readFileSync(join(ROOT, 'packages', 'asset-library', 'vfx', 'index.json'), 'utf8'));
const temp = mkdtempSync(join(tmpdir(), 'fx-library-'));
const bundle = (entry) => {
  const outfile = join(temp, `${entry}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
    join(WORKER, 'src', `${entry}.ts`), '--bundle', '--format=esm', '--target=es2022', '--platform=node', `--outfile=${outfile}`,
  ], { cwd: WORKER, stdio: 'pipe' });
  return outfile;
};
const T = await import(pathToFileURL(bundle('tools')).href);
const F = await import(pathToFileURL(bundle('fx-library')).href);
const R = await import(pathToFileURL(bundle('router')).href);
rmSync(temp, { recursive: true, force: true });

function studio(reply) {
  const calls = [];
  return {
    calls,
    ctx: {
      env: {},
      execStudioOp: async (op) => {
        calls.push(op);
        const data = typeof reply === 'function' ? reply(op) : reply;
        return data && data.__fail ? { id: 'x', ok: false, error: data.__fail } : { id: 'x', ok: true, data: data ?? { ok: true } };
      },
    },
  };
}
/** A Studio whose get_tree answers `node` (path + class, no children) and accepts every write. */
const place = (path, className, children = []) => studio((op) => (op.op === 'get_tree' ? { root: { path, name: path.split('.').pop(), class: className, children } } : { ok: true }));
const refused = (r) => r && typeof r === 'object' && typeof r.error === 'string' && /D-FXLIB-1/.test(r.error);
const LIBRARY_ID = SFX.rows[0][0];

/* ------------------------------------------------------------------ registration --- */

test('the five tools are registered with the ops they send, and only the inserts edit the place', () => {
  const want = {
    find_sound: { studio: false }, find_vfx: { studio: false },
    insert_sound: { studio: true, ops: ['create_instances', 'delete_instances', 'get_tree'] },
    insert_vfx: { studio: true, ops: ['create_instances', 'delete_instances', 'get_tree', 'set_props'] },
    play_library_sound: { studio: true, ops: ['preview_sound'] },
  };
  const mutating = T.projectMutatingToolNames();
  for (const [name, w] of Object.entries(want)) {
    const tool = T.TOOLS[name];
    assert.ok(tool, `${name} is not registered`);
    assert.equal(tool.def.name, name);
    assert.equal(tool.studio, w.studio, name);
    if (w.ops) assert.deepEqual([...tool.studioOps].sort(), w.ops, name);
    assert.equal(mutating.includes(name), name.startsWith('insert_'), `${name} mutating`);
  }
  assert.deepEqual(T.TOOLS.insert_vfx.def.parameters.properties.preset.enum, VFX.presets.map((p) => p.name));
});

test('the lookups are offered in every mode, Studio or not', () => {
  const names = T.toolNames();
  for (const [mode, connected] of [['plan', true], ['plan', false], ['agent', false], ['agent', true]]) {
    for (const name of ['find_sound', 'find_vfx']) assert.ok(R.toolsForMode(mode, connected, names).has(name), `${name} missing in ${mode}/${connected}`);
  }
  assert.ok(R.toolsForMode('agent', true, names).has('insert_vfx'));
  assert.equal(R.toolsForMode('plan', true, names).has('insert_sound'), false, 'Plan was handed a writer');
});

/* ------------------------------------------------------------------------ sounds --- */

test('the bundled index is non-empty and every row is a numeric audio id in a known category', () => {
  assert.ok(SFX.rows.length > 10000, `only ${SFX.rows.length} sounds bundled`);
  const cats = new Set(SFX.categories);
  for (const [id, name, category] of SFX.rows) {
    assert.ok(Number.isInteger(id) && id > 0, `bad id ${id}`);
    assert.ok(name.length > 0);
    assert.ok(cats.has(category), category);
  }
  for (const needed of ['coin', 'ui_click', 'explosion', 'sword', 'footsteps', 'music', 'ambient', 'reward', 'jump']) {
    assert.ok(SFX.rows.filter((r) => r[2] === needed).length >= 20, `thin category ${needed}`);
  }
});

test('find_sound answers plain words with library ids from the right category', async () => {
  for (const [query, ...category] of [['coin pickup', 'coin'], ['button click', 'ui_click'], ['big explosion', 'explosion'], ['sword swing', 'sword', 'whoosh']]) {
    const out = await T.TOOLS.find_sound.run({}, { query });
    assert.ok(out.sounds.length > 0, query);
    for (const s of out.sounds) {
      assert.equal(s.soundId, `rbxassetid://${s.assetId}`);
      assert.ok(F.librarySound(s.assetId), `${s.assetId} does not resolve`);
    }
    assert.ok(out.sounds.filter((s) => category.includes(s.category)).length >= out.sounds.length / 2, `${query}: ${JSON.stringify(out.sounds.map((s) => s.category))}`);
  }
  // A one-shot is short: the first answer for a click, a coin or a hit is not a 27-second loop.
  for (const query of ['ui click', 'coin', 'hit', 'jump', 'pop']) {
    const [first] = (await T.TOOLS.find_sound.run({}, { query })).sounds;
    assert.ok(first && first.seconds !== null && first.seconds <= 6, `${query}: ${JSON.stringify(first)}`);
  }
  const [song] = (await T.TOOLS.find_sound.run({}, { query: 'calm music' })).sounds;
  assert.ok(song && song.seconds > 20, `music stays long: ${JSON.stringify(song)}`);
  const byCat = await T.TOOLS.find_sound.run({}, { category: 'reward', limit: 5 });
  assert.ok(byCat.sounds.length === 5 && byCat.sounds.every((s) => s.category === 'reward'));
  const short = await T.TOOLS.find_sound.run({}, { query: 'click', maxSeconds: 1 });
  assert.ok(short.sounds.every((s) => s.seconds === null || s.seconds <= 1));
  assert.equal(typeof (await T.TOOLS.find_sound.run({}, { category: 'nope' })).error, 'string');
});

test('insert_sound creates one library Sound with the id, volume and loop asked for', async () => {
  const s = place('game.SoundService', 'SoundService');
  const out = await T.TOOLS.insert_sound.run(s.ctx, { query: 'coin pickup', volume: 0.3 });
  assert.equal(typeof out.inserted, 'string', JSON.stringify(out));
  const create = s.calls.find((c) => c.op === 'create_instances');
  assert.equal(create.items.length, 1);
  const item = create.items[0];
  assert.equal(item.className, 'Sound');
  assert.equal(item.parent, 'game.SoundService');
  const id = Number(/^rbxassetid:\/\/(\d+)$/.exec(item.props.SoundId.v)[1]);
  assert.ok(F.librarySound(id), 'the SoundId is not a library sound');
  assert.equal(item.props.Volume.v, 0.3);
  assert.equal(item.props.Looped.v, false);
  assert.equal(item.attributes.AppleSound.v, id);
  // By id, looped, under a part.
  const p = place('game.Workspace.Campfire', 'Part');
  const looped = await T.TOOLS.insert_sound.run(p.ctx, { assetId: LIBRARY_ID, parent: 'game.Workspace.Campfire', looped: true, name: 'Crackle' });
  assert.equal(looped.inserted, 'game.Workspace.Campfire.Crackle');
  const made = p.calls.find((c) => c.op === 'create_instances').items[0];
  assert.equal(made.props.SoundId.v, `rbxassetid://${LIBRARY_ID}`);
  assert.equal(made.props.Looped.v, true);
});

test('insert_sound replaces its own earlier Sound of the same name and never another', async () => {
  const mine = { path: 'game.SoundService.Coin', name: 'Coin', class: 'Sound', attributes: { AppleSound: { t: 'number', v: 1 } } };
  const s = place('game.SoundService', 'SoundService', [mine]);
  const out = await T.TOOLS.insert_sound.run(s.ctx, { query: 'coin', name: 'Coin' });
  assert.equal(out.replaced, true);
  assert.deepEqual(s.calls.find((c) => c.op === 'delete_instances').paths, ['game.SoundService.Coin']);
  const theirs = place('game.SoundService', 'SoundService', [{ path: 'game.SoundService.Coin', name: 'Coin', class: 'Sound' }]);
  const clash = await T.TOOLS.insert_sound.run(theirs.ctx, { query: 'coin', name: 'Coin' });
  assert.equal(typeof clash.error, 'string');
  assert.ok(!theirs.calls.some((c) => c.op === 'delete_instances' || c.op === 'create_instances'));
});

test('an id that is not in the library is refused before Studio is asked; an id this run discovered is accepted', async () => {
  const unknown = 1; // not a library row
  assert.equal(F.librarySound(unknown), null);
  for (const args of [{ assetId: unknown }, { assetId: 'rbxassetid://abc' }, {}, { query: 'coin', volume: 3 }]) {
    const s = place('game.SoundService', 'SoundService');
    const out = await T.TOOLS.insert_sound.run(s.ctx, args);
    assert.equal(typeof out.error, 'string', JSON.stringify(args));
    assert.equal(s.calls.length, 0, JSON.stringify(args));
  }
  const s = place('game.SoundService', 'SoundService');
  s.ctx.discoveredAssetIds = new Set([unknown]);
  const out = await T.TOOLS.insert_sound.run(s.ctx, { assetId: unknown });
  assert.equal(typeof out.inserted, 'string', JSON.stringify(out));
});

test('play_library_sound sends only preview_sound, with a library id', async () => {
  const s = studio({ played: true });
  const out = await T.TOOLS.play_library_sound.run(s.ctx, { query: 'level up' });
  assert.equal(out.played, true, JSON.stringify(out));
  assert.deepEqual(s.calls.map((c) => c.op), ['preview_sound']);
  assert.ok(F.librarySound(Number(s.calls[0].soundId.replace('rbxassetid://', ''))));
  const none = studio();
  assert.equal(typeof (await T.TOOLS.play_library_sound.run(none.ctx, { assetId: 1 })).error, 'string');
  assert.equal(none.calls.length, 0);
});

/* ----------------------------------------------------------------------- effects --- */

function tableKeys(source, head) {
  const at = source.indexOf(head);
  if (at < 0) return null;
  let i = source.indexOf('{', at);
  let depth = 0;
  const start = i;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) break;
  }
  const body = source.slice(start + 1, i).replace(/--[^\n]*/g, '');
  return new Set([...body.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:true|\{)/g)].map((m) => m[1]));
}
const stripLuauComments = (src) => src.replace(/--\[(=*)\[[\s\S]*?\]\1\]/g, '').replace(/--[^\n]*/g, '');
const COMMANDS = stripLuauComments(readFileSync(join(PLUGIN_SRC, 'Commands.luau'), 'utf8'));
const FX_FAMILY = stripLuauComments(readFileSync(join(PLUGIN_SRC, 'ops', 'Fx.luau'), 'utf8'));
const union = (...sets) => new Set(sets.flatMap((s) => [...(s ?? [])]));
const ALLOW = {
  classes: tableKeys(COMMANDS, 'local CREATE_CLASSES = {'),
  props: union(tableKeys(COMMANDS, 'local PROPERTY_ALLOW = {'), tableKeys(FX_FAMILY, 'propertyAllow = {')),
  enums: union(tableKeys(COMMANDS, 'local ENUM_ALLOW = {'), tableKeys(FX_FAMILY, 'enumAllow = {')),
  // The engine particle textures the plugin accepts, read from the plugin's own list.
  textures: new Set([...(/CONTENT_PROPERTY\.Texture\.ParticleEmitter = \{([\s\S]*?)\n\}/.exec(COMMANDS)?.[1] ?? '').matchAll(/\["([^"]+)"\]\s*=\s*true/g)].map((m) => m[1])),
};

function walk(items, out = []) {
  for (const item of items ?? []) { out.push(item); walk(item.children, out); }
  return out;
}

test('the plugin allowlists read back non-empty (else the next test checks nothing)', () => {
  assert.ok(ALLOW.classes.size > 20 && ALLOW.props.size > 50 && ALLOW.enums.size > 5, JSON.stringify({ c: ALLOW.classes.size, p: ALLOW.props.size, e: ALLOW.enums.size }));
  assert.ok(ALLOW.textures.size >= 8, `engine textures read: ${ALLOW.textures.size}`);
  for (const path of F.ENGINE_TEXTURE_PATHS) assert.ok(ALLOW.textures.has(path), `the plugin would refuse preset texture ${path}`);
});

const TARGETS = { Part: 'game.Workspace.Target', Attachment: 'game.Workspace.Target.Att', Workspace: 'game.Workspace', Model: 'game.Workspace.Egg' };

test('every preset, on every target it accepts, compiles to what the plugin accepts, marked and linked', () => {
  assert.ok(F.PRESETS.length >= 20);
  let built = 0;
  for (const preset of F.PRESETS) {
    for (const [className, path] of Object.entries(TARGETS)) {
      const plan = F.vfxPlan(preset.name, { path, className });
      if ('error' in plan) continue;
      built += 1;
      const all = walk(plan.items);
      assert.ok(all.length > 0 || plan.skipped.length > 0, `${preset.name} on ${className} built nothing`);
      for (const item of all) {
        const where = `${preset.name} on ${className}: ${item.className} ${item.name}`;
        assert.ok(ALLOW.classes.has(item.className), `${where}: class not creatable`);
        assert.match(item.name, /^[A-Za-z]\w*$/, where);
        assert.equal(item.attributes?.AppleVfx?.v, preset.name, `${where}: not marked`);
        for (const [prop, value] of Object.entries(item.props ?? {})) {
          assert.ok(ALLOW.props.has(prop), `${where}: property ${prop} not writable`);
          if (value.t === 'EnumItem') assert.ok(ALLOW.enums.has(value.v.split('.')[1]), `${where}: enum ${value.v}`);
          if (prop === 'Texture' && value.v !== '') {
            const m = /^rbxasset:\/\/textures\/(.+)$/.exec(value.v);
            assert.ok(m && ALLOW.textures.has(m[1]), `${where}: texture ${value.v} is not an engine texture on the plugin list`);
          }
        }
        if (item.className === 'ParticleEmitter' && item.attributes.AppleEmitCount) {
          assert.ok(item.attributes.AppleEmitCount.v >= 1);
          assert.equal(item.props.Enabled?.v, false, `${where}: a one-shot must be placed switched off`);
        }
      }
      // Every link names an instance this plan creates, and every Beam/Trail is linked.
      const created = new Set();
      const paths = (items, parent) => { for (const it of items) { const p = `${it.parent ?? parent}.${it.name}`; created.add(p); paths(it.children ?? [], p); } };
      paths(plan.items, path);
      for (const link of plan.links) {
        assert.ok(created.has(link.path), `${preset.name}: links ${link.path}, which it did not create`);
        for (const k of ['Attachment0', 'Attachment1']) assert.ok(created.has(link.props[k].v), `${preset.name}: ${k} -> ${link.props[k].v}`);
      }
      const linked = all.filter((i) => i.className === 'Beam' || i.className === 'Trail').length;
      assert.equal(plan.links.length, linked, `${preset.name}: ${linked} beams/trails, ${plan.links.length} links`);
    }
  }
  assert.ok(built >= F.PRESETS.length, `only ${built} preset/target builds`);
});

test('each required effect exists and each kind is placed where it can play', () => {
  const names = new Set(F.PRESET_NAMES);
  for (const n of ['coin_burst', 'sparkle_shimmer', 'level_up_aura', 'rebirth_pillar', 'fire', 'smoke', 'explosion', 'magic_hit', 'heal', 'portal', 'water_splash', 'dust_trail', 'speed_trail', 'confetti', 'pet_hatch', 'egg_glow', 'lightning', 'snow', 'rain', 'fireflies']) {
    assert.ok(names.has(n), `missing preset ${n}`);
  }
  // Emitters need a part: a Model is refused with a hint, except a highlight, which goes on the Model.
  assert.match(F.vfxPlan('fire', { path: TARGETS.Model, className: 'Model' }).error, /part/);
  const glow = F.vfxPlan('egg_glow', { path: TARGETS.Model, className: 'Model' });
  assert.deepEqual(glow.items.map((i) => i.className), ['Highlight']);
  assert.ok(glow.skipped.length > 0, 'the emitters it could not place must be reported');
  // Area effects on Workspace get an invisible, anchored, non-colliding host.
  const snow = F.vfxPlan('snow', { path: 'game.Workspace', className: 'Workspace' });
  const host = snow.items[0];
  assert.equal(host.className, 'Part');
  assert.equal(host.props.Anchored.v, true);
  assert.equal(host.props.CanCollide.v, false);
  assert.equal(host.props.Transparency.v, 1);
  assert.ok(host.children.some((c) => c.className === 'ParticleEmitter'));
  // Options: colour reaches every emitter, loop mode keeps a one-shot running.
  const red = F.vfxPlan('coin_burst', { path: TARGETS.Part, className: 'Part' }, { color: [255, 0, 0], mode: 'loop' });
  for (const e of walk(red.items).filter((i) => i.className === 'ParticleEmitter')) {
    assert.deepEqual(e.props.Color.v[0][1], [1, 0, 0]);
    assert.notEqual(e.props.Enabled?.v, false);
    assert.ok(e.props.Rate.v >= 1);
  }
  assert.match(F.vfxPlan('nope', { path: TARGETS.Part, className: 'Part' }).error, /coin_burst/);
});

test('insert_vfx builds through create_instances then links, replacing its own earlier copy only', async () => {
  const old = { path: 'game.Workspace.Tower.RebirthPillarBase', name: 'RebirthPillarBase', class: 'Attachment', attributes: { AppleVfx: { t: 'string', v: 'rebirth_pillar' } } };
  const other = { path: 'game.Workspace.Tower.FireFX', name: 'FireFX', class: 'Attachment', attributes: { AppleVfx: { t: 'string', v: 'fire' } } };
  const s = place('game.Workspace.Tower', 'Part', [old, other]);
  const out = await T.TOOLS.insert_vfx.run(s.ctx, { preset: 'rebirth_pillar', target: 'game.Workspace.Tower' });
  assert.equal(out.inserted, 'rebirth_pillar', JSON.stringify(out));
  assert.deepEqual(s.calls.map((c) => c.op), ['get_tree', 'delete_instances', 'create_instances', 'set_props', 'set_props']);
  assert.deepEqual(s.calls[1].paths, [old.path], 'only its own earlier copy may be deleted');
  const link = s.calls[3];
  assert.equal(link.props.Attachment0.t, 'Instance');
  assert.equal(link.props.Attachment0.v, 'game.Workspace.Tower.RebirthPillarBase');
  assert.equal(link.props.Attachment1.v, 'game.Workspace.Tower.RebirthPillarTop');
  // A burst says how to fire it.
  const b = place('game.Workspace.Coin', 'Part');
  assert.match((await T.TOOLS.insert_vfx.run(b.ctx, { preset: 'coin_burst', target: 'game.Workspace.Coin' })).fire, /AppleEmitCount/);
  // A refusal sends no write.
  const m = place('game.Workspace.Egg', 'Model');
  assert.equal(typeof (await T.TOOLS.insert_vfx.run(m.ctx, { preset: 'fire', target: 'game.Workspace.Egg' })).error, 'string');
  assert.deepEqual(m.calls.map((c) => c.op), ['get_tree']);
});

/* --------------------------------------------------------------------- the guard --- */

const namesLibrary = (r) => /insert_sound|insert_vfx/.test(r.error);

test('create_instances refuses a hand-made Sound, emitter, Beam, Trail or Fire, nested or not, and sends nothing', async () => {
  for (const items of [
    [{ className: 'Sound', name: 'Coin', parent: 'game.SoundService', props: { SoundId: { t: 'string', v: 'rbxassetid://1' } } }],
    [{ className: 'Part', name: 'Torch', children: [{ className: 'ParticleEmitter', name: 'Flames' }] }],
    [{ className: 'Model', name: 'M', children: [{ className: 'Part', name: 'P', children: [{ className: 'Beam', name: 'B' }, { className: 'Trail', name: 'T' }] }] }],
    [{ className: 'Part', name: 'Camp', children: [{ className: 'Fire', name: 'F' }] }],
  ]) {
    const s = studio();
    const r = await T.TOOLS.create_instances.run(s.ctx, { items });
    assert.ok(refused(r), JSON.stringify(r));
    assert.ok(namesLibrary(r), r.error);
    assert.equal(s.calls.length, 0, 'nothing may reach Studio');
  }
  // Parts, lights and attachments are still the model's to build.
  const ok = studio({ created: ['game.Workspace.Lamp'] });
  const r = await T.TOOLS.create_instances.run(ok.ctx, { items: [{ className: 'Part', name: 'Lamp', children: [{ className: 'PointLight', name: 'L' }, { className: 'Attachment', name: 'A' }] }] });
  assert.ok(!refused(r), JSON.stringify(r));
});

test('run_luau refuses Luau that Instance.news a Sound or an emitter, in any spelling; comments and clones pass', async () => {
  for (const code of [
    'local s = Instance.new("Sound")\ns.SoundId = "rbxassetid://1"\ns.Parent = workspace',
    "local e = Instance.new('ParticleEmitter', part)",
    'local k = "Beam"\nlocal b = Instance.new(k)',
    'local t = Instance.new[[Trail]]',
  ]) {
    const s = studio();
    const r = await T.TOOLS.run_luau.run(s.ctx, { code });
    assert.ok(refused(r), `${code}\n${JSON.stringify(r)}`);
    assert.ok(namesLibrary(r), r.error);
    assert.equal(s.calls.length, 0);
  }
  for (const code of [
    '-- never Instance.new("Sound"); clone the library one\nlocal s = game.SoundService.Coin:Clone()\ns.Parent = workspace\ns:Play()',
    'for _, e in workspace.Coin.CoinBurstFX:GetChildren() do if e:IsA("ParticleEmitter") then e:Emit(e:GetAttribute("AppleEmitCount")) end end',
  ]) {
    const r = await T.TOOLS.run_luau.run(studio({ ok: true }).ctx, { code });
    assert.ok(!refused(r), `${code}\n${JSON.stringify(r)}`);
  }
});

test('edit_script refuses a script that adds a hand-made Sound, and allows one that only plays the inserted one', async () => {
  const withRead = (source) => studio((op) => (op.op === 'read_script' ? (source === null ? { __fail: 'not found: x' } : { source, hash: 'h' }) : { ok: true }));
  const bad = withRead('print("hi")');
  const r = await T.TOOLS.edit_script.run(bad.ctx, { path: 'game.ServerScriptService.Coins', source: 'local s = Instance.new("Sound")\ns.Parent = workspace' });
  assert.ok(refused(r) && namesLibrary(r), JSON.stringify(r));
  assert.ok(!bad.calls.some((c) => c.op === 'edit_script'), 'the script must not be written');
  const good = withRead('print("hi")');
  const ok = await T.TOOLS.edit_script.run(good.ctx, { path: 'game.ServerScriptService.Coins', source: 'local s = game.SoundService.Coin:Clone()\ns.Parent = workspace\ns:Play()' });
  assert.ok(!refused(ok), JSON.stringify(ok));
  assert.ok(good.calls.some((c) => c.op === 'edit_script'));
});

test('set_properties refuses a SoundId from nowhere and accepts a library or discovered one', async () => {
  const sound = () => studio((op) => (op.op === 'get_instance' ? { class: 'Sound', props: {} } : { ok: true }));
  for (const v of ['rbxassetid://1', 'rbxasset://sounds/electronicpingshort.wav', 'http://x/a.mp3']) {
    const s = sound();
    const r = await T.TOOLS.set_properties.run(s.ctx, { path: 'game.SoundService.Coin', props: { SoundId: { t: 'string', v } } });
    assert.ok(refused(r), `${v}: ${JSON.stringify(r)}`);
    assert.ok(!s.calls.some((c) => c.op === 'set_props'));
  }
  const lib = sound();
  assert.ok(!refused(await T.TOOLS.set_properties.run(lib.ctx, { path: 'game.SoundService.Coin', props: { SoundId: { t: 'string', v: `rbxassetid://${LIBRARY_ID}` } } })));
  assert.ok(lib.calls.some((c) => c.op === 'set_props'));
  const found = sound();
  found.ctx.discoveredAssetIds = new Set([1]);
  assert.ok(!refused(await T.TOOLS.set_properties.run(found.ctx, { path: 'game.SoundService.Coin', props: { SoundId: { t: 'string', v: 'rbxassetid://1' } } })));
  // Volume on a Sound is not a SoundId.
  assert.ok(!refused(await T.TOOLS.set_properties.run(sound().ctx, { path: 'game.SoundService.Coin', props: { Volume: { t: 'number', v: 0.2 } } })));
});

test('a terrain kit does not hand-build a particle effect', async () => {
  const s = studio((op) => (op.op === 'get_tree' ? { root: { path: 'game.Workspace', class: 'Workspace', children: [] } } : { ok: true, created: ['x'] }));
  const r = await T.TOOLS.build_scene.run(s.ctx, { kit: 'floating_island' });
  const creates = s.calls.filter((c) => c.op === 'create_instances');
  const detailed = creates.flatMap((c) => walk(c.items)).filter((item) => ['Part', 'Model', 'ParticleEmitter'].includes(item.className));
  assert.equal(detailed.length, 0, JSON.stringify(r));
  assert.match(r.next, /insert_vfx/);
});
