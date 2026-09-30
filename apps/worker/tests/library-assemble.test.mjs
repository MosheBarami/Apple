// install_owner_system and assemble_owner_game: the two ways to build from the owner's saved games.
//
// The library decides WHAT (an install plan for one saved game, a blueprint for a whole game); these tools carry it out in
// Studio and tell a young player what happened. Everything runs against a stand-in plugin (fixtures/fake-studio.mjs) that
// answers the library routes, imports, spatial queries and script reads the way the real one does, keeps a log of every
// operation and holds a small world, so the tests check what was ASKED and what the place looks like afterwards.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fakeStudio } from './fixtures/fake-studio.mjs';

const esbuild = await import(process.env.APPLE_TEST_ESBUILD || 'esbuild');
const dir = mkdtempSync(join(tmpdir(), 'library-assemble-'));
test.after(() => rmSync(dir, { recursive: true, force: true }));
const alias = { '@golem/shared': '../../packages/shared/src/index.ts' };
await esbuild.build({ entryPoints: ['src/tools.ts'], bundle: true, format: 'esm', platform: 'node', outfile: join(dir, 'tools.mjs'), alias });
await esbuild.build({ entryPoints: ['src/library-assemble.ts'], bundle: true, format: 'esm', platform: 'node', outfile: join(dir, 'assemble.mjs'), alias });
const T = await import(pathToFileURL(join(dir, 'tools.mjs')).href);
const A = await import(pathToFileURL(join(dir, 'assemble.mjs')).href);

const gid = (n) => String(n).padStart(12, '0');
const BUTTONS = [{ name: 'ShopButton', class: 'TextButton' }, { name: 'CloseButton', class: 'TextButton' }, { name: 'Shop', class: 'Frame' }];
const step = (path, parent, what, extra = {}) => ({ path, mode: 'children', parent, what, ...extra });

// One plan per system id. Daily rewards works ('yes'); the spin wheel came without code ('looks only').
const PLANS = {
  [gid(3)]: { game: gid(3), name: 'Daily Reward System', kind: 'system-pack', works: 'yes', note: 'Players claim once a day.', skipped: [{ path: '/ThumbnailCamera', why: 'a picture camera' }], steps: [
    step('/Move to ServerScriptService', 'game.ServerScriptService', 'the reward logic'),
    step('/Put in StarterGui', 'game.StarterGui', 'a daily reward screen with a claim button'),
    step('/Modules', 'game.ReplicatedStorage.Modules', 'shared helpers'),
    step('/Leaderstats [DONT DRAG IF YOU HAVE THIS ALREADY]', 'game.ServerScriptService', 'a coins counter', { mode: 'self', optional: true }),
  ] },
  [gid(4)]: { game: gid(4), name: 'Lucky Spin Wheel', kind: 'system-pack', works: 'looks only', steps: [step('/Put in StarterGui', 'game.StarterGui', 'a spinning wheel screen')] },
  [gid(5)]: { game: gid(5), name: 'Settings Menu', kind: 'model-pack', works: 'partly', steps: [step('/Workspace (OPCIONAL)', 'game.Workspace', 'a settings board')] },
};

const component = (role, n, over = {}) => ({ role, gameId: gid(n), game: 'Game ' + n, path: '/Workspace/Thing', mode: 'self', parent: 'game.Workspace', install: false, works: 'looks only', why: 'a thing', ...over });
const BLUEPRINT = () => ({ title: 'Brainrot Bonanza', look: 'studded', components: [
  component('lighting', 1, { game: 'Sunny Map', path: '/Lighting', mode: 'children', parent: 'game.Lighting', why: 'a bright sunny sky' }),
  component('sfx', 11, { game: 'Sound Pack', path: '/Workspace/Pop', why: 'a pop when you collect' }),
  component('music', 10, { game: 'Music Pack', path: '/Workspace/Theme', why: 'happy background music' }),
  component('fx', 9, { game: 'Effects Pack', path: '/Workspace/Sparkle', place: { count: 2, on: 'spawn', spread: 30 }, why: 'sparkles at the start' }),
  component('props', 8, { game: 'Stud Asset Pack', path: '/Workspace/Tree', place: { count: 6, on: 'ground', spread: 90 }, why: 'studded trees and rocks' }),
  component('characters', 7, { game: 'Tsunami Brainrots', path: '/Workspace/Brainrot', place: { count: 3, on: 'spawn', spread: 60 }, why: 'funny brainrot pets near the start' }),
  component('ui-kit', 6, { game: 'Studded UI', path: '/StarterGui/Menus', parent: 'game.StarterGui', why: 'big outlined studded buttons' }),
  component('system', 5, { game: 'Settings Menu (1)', install: true, path: '/', mode: 'children', works: 'partly', why: 'a settings menu' }),
  component('system', 4, { game: 'Lucky Spin Wheel', install: true, path: '/', mode: 'children', works: 'looks only', why: 'a lucky spin wheel' }),
  component('system', 3, { game: 'Daily Reward System', install: true, path: '/', mode: 'children', works: 'yes', why: 'daily rewards with a claim screen' }),
  component('core', 2, { game: 'Plants Game (2)', path: '/Workspace/Plots', parent: 'game.Workspace', works: 'yes', why: 'plots to plant on' }),
  component('core', 2, { game: 'Plants Game (2)', path: '/StarterGui', mode: 'children', parent: 'game.StarterGui', works: 'yes', why: 'its shop and buttons' }),
  component('core', 2, { game: 'Plants Game (2)', path: '/ServerScriptService', mode: 'children', parent: 'game.ServerScriptService', works: 'yes', why: 'plants that grow and earn coins' }),
  component('world', 1, { game: 'Sunny Map', path: '/Workspace', mode: 'children', parent: 'game.Workspace', why: 'a big studded map with sand paths' }),
] });

/** What an import brings in: models with a box (so they can be placed), screens with buttons, sounds without one. */
function importOf(op) {
  const g = Number(op.gameId), name = op.path.split('/').filter(Boolean).pop() ?? '';
  if (op.path === '/MaterialService') return { error: 'path not found: /MaterialService' };
  if (op.path === '/Workspace' && op.mode === 'children') return { roots: [{ name: 'Map', class: 'Folder' }, { name: 'SpawnLocation', class: 'SpawnLocation', center: [0, 0.5, 0], size: [12, 1, 12] }] };
  if (op.path === '/Workspace/Plots') return { roots: [{ name: 'Plots', class: 'Model', center: [200, 30, 200], size: [40, 4, 40] }] };
  if (op.path === '/StarterGui') return { roots: [{ name: 'CoreHud', class: 'ScreenGui', children: BUTTONS, scripts: [{ name: 'HudController', class: 'LocalScript', source: 'Shop.Activated:Connect(open)' }] }], scripts: 1 };
  if (op.path === '/StarterGui/Menus') return { roots: [{ name: 'Menus', class: 'ScreenGui', children: BUTTONS }] };
  if (op.path === '/Put in StarterGui' && g === 3) return { roots: [{ name: 'DailyGui', class: 'ScreenGui', children: BUTTONS, scripts: [{ name: 'Claim', class: 'LocalScript', source: 'claimButton.Activated:Connect(claim)' }] }] };
  if (op.path === '/Put in StarterGui') return { roots: [{ name: 'SpinGui', class: 'ScreenGui', children: [{ name: 'SpinNowButton', class: 'TextButton' }, { name: 'Wheel', class: 'Frame' }] }] };
  if (op.path === '/Workspace/Theme' || op.path === '/Workspace/Pop') return { roots: [{ name, class: 'Sound' }] };
  if (op.path === '/Lighting') return { roots: [{ name: 'Sky', class: 'Sky' }] };
  if (['/Workspace/Brainrot', '/Workspace/Tree', '/Workspace/Sparkle'].includes(op.path)) return { roots: [{ name, class: 'Model', center: [300 + g, -40, 300], size: [4, 6, 4] }], scripts: name === 'Brainrot' ? 2 : 0 };
  return {};
}
const studio = (over = {}) => fakeStudio({ route: { install: (op) => (PLANS[op.params.id] ? { ok: true, data: PLANS[op.params.id] } : { ok: false, error: 'no such game' }), blueprint: BLUEPRINT() }, importOf, ...over });
async function run(f, name, args) { const out = await T.runTool(f.ctx, name, JSON.stringify(args)); return { out, data: JSON.parse(out.resultForLlm) }; }
const imports = (f) => f.ops('import_owner_library');
const jargon = /[a-z]+_[a-z]+|\/[A-Za-z]|game\.|\bStarterGui\b|\bServerScriptService\b|checkpoint|\d/;

// ------------------------------------------------------------------------------------------------- install

test('install_owner_system: fetches the plan by game id, checkpoints once, and puts every step where the library says', async () => {
  const f = studio();
  const { out, data } = await run(f, 'install_owner_system', { gameId: gid(3) });
  assert.equal(out.ok, true); assert.equal(out.mutatedProject, true);
  const asked = f.ops('query_owner_library')[0];
  assert.deepEqual([asked.action, asked.route, asked.params], ['route', 'install', { id: gid(3) }]);
  assert.equal(f.ctx.checkpoints.length, 1, 'one safety copy for the whole install');
  assert.deepEqual(imports(f).map((o) => [o.path, o.mode, o.parent]), [
    ['/Move to ServerScriptService', 'children', 'game.ServerScriptService'],
    ['/Put in StarterGui', 'children', 'game.StarterGui'],
    ['/Modules', 'children', 'game.ReplicatedStorage.Modules'],   // refused: the place has no Modules folder yet
    ['/Modules', 'children', 'game.ReplicatedStorage.Modules'],   // and again once the folder was made
    ['/Leaderstats [DONT DRAG IF YOU HAVE THIS ALREADY]', 'self', 'game.ServerScriptService'],
  ]);
  assert.ok(imports(f).every((o) => o.studioData === true && o.onlyMissing === true), 'every step goes in as studio-data-ready and never duplicates what is there');
  assert.equal(imports(f).some((o) => o.replace), false, 'an install never replaces what the place has');
  assert.equal(data.works, 'yes');
});

test('install_owner_system: a nested folder the place lacks is made, top down, before the step is retried', async () => {
  const f = studio();
  await run(f, 'install_owner_system', { gameId: gid(3) });
  assert.ok(f.world.nodes.has('game.ReplicatedStorage.Modules'), 'the Modules folder was made');
  assert.ok(f.world.nodes.has('game.ReplicatedStorage.Modules.Modules'), 'and the step landed inside it');
  assert.deepEqual(f.ops('create_instances').map((o) => o.items[0].name), ['Modules']);
});

test('install_owner_system: the optional leaderstats script is skipped when the place already has a leaderstats creator, added when not', async () => {
  const has = studio();
  has.world.add('game.ServerScriptService.Stats', { class: 'Script', source: 'local leaderstats = Instance.new("Folder")' });
  const a = await run(has, 'install_owner_system', { gameId: gid(3) });
  assert.equal(imports(has).some((o) => /Leaderstats/.test(o.path)), false, 'skipped');
  assert.ok(a.data.steps.some((s) => s.state === 'have'));
  const none = studio();
  await run(none, 'install_owner_system', { gameId: gid(3) });
  assert.equal(imports(none).some((o) => /Leaderstats/.test(o.path)), true, 'a place with no creator gets it');
  const sameName = studio();
  sameName.world.add('game.ServerScriptService.Leaderstats', { class: 'Script', source: '' });
  await run(sameName, 'install_owner_system', { gameId: gid(3) });
  assert.equal(imports(sameName).some((o) => /Leaderstats/.test(o.path)), false, 'a script of the same name is enough');
});

test('install_owner_system: a second install adds nothing, says so, and does not count as a change', async () => {
  const f = studio();
  const first = await run(f, 'install_owner_system', { gameId: gid(4) });
  assert.equal(first.out.mutatedProject, true);
  const again = await run(f, 'install_owner_system', { gameId: gid(4) });
  assert.equal(again.out.ok, true);
  assert.equal(again.out.mutatedProject, undefined);
  assert.match(again.data.forUser, /already in your game/);
  assert.equal(again.data.changed, false);
  assert.match(again.out.summary, /already in your game/);
});

test('install_owner_system: a step that fails is recorded and the rest still go in; Studio going away stops it', async () => {
  const f = studio({ importOf: (op) => (op.path === '/Put in StarterGui' ? { error: 'path not found: /Put in StarterGui' } : importOf(op)) });
  const { out, data } = await run(f, 'install_owner_system', { gameId: gid(3) });
  assert.equal(out.ok, true);
  assert.deepEqual(data.steps.map((s) => s.state), ['added', 'failed', 'added', 'added']);
  assert.match(data.forUser, /One part of it could not be added/);
  assert.equal(jargon.test(data.forUser), false, data.forUser);
  const dead = studio({ fail: (op) => (op.op === 'import_owner_library' && op.path === '/Put in StarterGui' ? { ok: false, error: 'Studio is not connected', failure: 'transport' } : null) });
  const stopped = await run(dead, 'install_owner_system', { gameId: gid(3) });
  assert.equal(stopped.out.ok, true, 'the first step was added');
  assert.equal(imports(dead).filter((o) => o.path === '/Modules').length, 0, 'nothing further is asked of a Studio that is gone');
  assert.match(stopped.data.forUser, /One part of it could not be added/);
});

test('install_owner_system: nothing added and something failed is one plain error, not a success', async () => {
  const f = studio({ importOf: () => ({ error: 'path not found: /x' }) });
  const { out, data } = await run(f, 'install_owner_system', { gameId: gid(4) });
  assert.equal(out.ok, false);
  assert.match(data.error, /^Apple could not add it to your game\. Tell the user in one plain sentence/);
  assert.equal(out.summary, '✗ Apple could not add it to your game');
  assert.equal(out.mutatedProject, undefined);
});

test('install_owner_system: bad input and a library that cannot answer are refused in plain words before anything changes', async () => {
  const f = studio();
  assert.equal((await run(f, 'install_owner_system', { gameId: 'nothex!' })).out.ok, false);
  assert.equal(f.log.length, 0, 'a malformed id never reaches Studio');
  const down = studio({ route: { install: new Error('owner library gateway is not reachable on 127.0.0.1:63747; start it on the Mac') } });
  const r = await run(down, 'install_owner_system', { gameId: gid(3) });
  assert.equal(r.out.ok, false);
  assert.match(r.data.error, /^Apple could not reach your saved games right now\./);
  assert.equal(r.out.summary, '✗ Apple could not reach your saved games right now');
  assert.equal(down.ctx.checkpoints.length, 0, 'no copy of the place was taken for a plan that never came');
  const empty = studio({ route: { install: { game: gid(9), name: 'Empty', steps: [{ path: 'no-slash', mode: 'self', parent: 'game.Workspace' }] } } });
  assert.match((await run(empty, 'install_owner_system', { gameId: gid(9) })).data.error, /nothing in that saved game/);
  const noCopy = studio();
  noCopy.ctx.createCheckpoint = async () => ({ error: 'snapshot failed' });
  const c = await run(noCopy, 'install_owner_system', { gameId: gid(3) });
  assert.equal(c.out.ok, false); assert.equal(imports(noCopy).length, 0);
  assert.match(c.out.summary, /^✗ Apple could not save a copy of your place first/);
  assert.equal(/checkpoint/i.test(c.out.summary), false);
});

test('install_owner_system: the plan is read defensively (bad steps dropped, text made plain, works defaults to partly)', () => {
  const plan = A.readInstallPlan({ game: gid(1), name: 'Easy Plot System (2)', kind: 'weird', works: 'great', note: 'See /Workspace/Plots/One for 0123456789abcdef', steps: [
    { path: '/A', mode: 'self', parent: 'game.Workspace', what: 'a plot\u0007 pad' }, { path: '/B', mode: 'all', parent: 'game.Workspace' }, { path: '/C', mode: 'self', parent: 'Workspace' },
    { path: '/D', mode: 'children', parent: 'game.StarterPlayer.StarterPlayerScripts', optional: true }, null, 5] });
  assert.deepEqual(plan.steps.map((s) => [s.path, s.what, s.optional]), [['/A', 'a plot pad', false], ['/D', 'a part of it', true]]);
  assert.deepEqual([plan.name, plan.works], ['Easy Plot System', 'partly']);
  assert.equal(/\/Workspace|0123456789abcdef/.test(plan.note), false, 'paths and ids are not passed on: ' + plan.note);
});

test('install_owner_system: screens that came without code get their buttons connected once, working ones are left alone', async () => {
  const f = studio();
  await run(f, 'install_owner_system', { gameId: gid(3) });
  assert.equal(f.ops('edit_script').length, 0, 'the daily reward screen works, so it is not touched');
  const spin = await run(f, 'install_owner_system', { gameId: gid(4) });
  assert.equal(spin.data.menus.startsWith('Some screens came without working code'), true);
  const binder = f.ops('edit_script');
  assert.equal(binder.length, 1);
  assert.deepEqual([binder[0].path, binder[0].create.className, binder[0].create.parent], ['game.StarterPlayer.StarterPlayerScripts.AppleMenuBinder', 'LocalScript', 'game.StarterPlayer.StarterPlayerScripts']);
  assert.equal(f.world.nodes.get('game.StarterGui.SpinGui').attrs.AppleMenuBinder, true);
  assert.equal(f.world.nodes.get('game.StarterGui.DailyGui').attrs.AppleMenuBinder, undefined);
  assert.match(spin.data.forUser, /Its menus open and close, but part of its code was stripped out/);
  assert.equal((spin.data.forUser.match(/looks right|stripped/g) ?? []).length, 1, 'the caveat is said once');
});

test('install_owner_system: a game is named as its owner would say it (no file-name underscores, copy marks or id numbers), and each part is said once', async () => {
  const id = gid(9);
  const plan = { game: id, name: 'Complete_Fishing_system_71563435034561 (1)', kind: 'system-pack', works: 'yes', steps: [
    step('/Put in ServerScriptService', 'game.ServerScriptService', 'the objects that sit in the world'), step('/Extra', 'game.Workspace', 'the objects that sit in the world'), step('/More', 'game.Lighting', 'the lighting and sky')] };
  const f = studio({ route: { install: () => ({ ok: true, data: plan }) } });
  const { out, data } = await run(f, 'install_owner_system', { gameId: id });
  assert.equal(data.system, 'Complete Fishing system');
  assert.equal(data.forUser, 'Complete Fishing system is now in your game from your saved games: the objects that sit in the world and the lighting and sky.');
  assert.match(out.summary, /Added Complete Fishing system to your game/);
});

// ------------------------------------------------------------------------------------------------- assemble

test('assemble_owner_game: asks the library for a plan by niche, theme and seed, and takes ONE checkpoint', async () => {
  const f = studio();
  const { out, data } = await run(f, 'assemble_owner_game', { niche: 'brainrot collecting', theme: 'candy', seed: 42 });
  assert.equal(out.ok, true); assert.equal(out.mutatedProject, true);
  const asked = f.ops('query_owner_library')[0];
  assert.deepEqual([asked.action, asked.route, asked.params], ['route', 'blueprint', { niche: 'brainrot collecting', theme: 'candy', seed: 42 }]);
  assert.equal(f.ctx.checkpoints.length, 1);
  assert.equal(data.seed, 42);
  const fresh = studio();
  const r = await run(fresh, 'assemble_owner_game', { niche: 'tycoon' });
  const p = fresh.ops('query_owner_library')[0].params;
  assert.deepEqual(Object.keys(p).sort(), ['niche', 'seed'], 'no theme when none was given');
  assert.equal(Number.isInteger(p.seed) && p.seed >= 0, true);
  assert.equal(r.data.seed, p.seed, 'the seed used comes back so the same game can be asked for again');
});

test('assemble_owner_game: carries the whole plan out in order: world, core, systems, kit, models, effects, sounds, sky', async () => {
  const f = studio();
  await run(f, 'assemble_owner_game', { niche: 'brainrot collecting', seed: 1 });
  const real = imports(f).filter((o) => o.path !== '/MaterialService');
  const games = real.map((o) => Number(o.gameId)).filter((g, i, all) => i === 0 || g !== all[i - 1]);
  assert.deepEqual(games, [1, 2, 5, 4, 3, 6, 7, 8, 9, 10, 11, 1], 'world, core, the three systems as planned, kit, characters, props, effects, music, sound effects, sky');
  assert.deepEqual(real.filter((o) => o.gameId === gid(2)).map((o) => o.path), ['/Workspace/Plots', '/StarterGui', '/ServerScriptService'], 'the order inside a role stays as planned');
  assert.equal(real.at(-1).path, '/Lighting', 'the sky is last');
});

test('assemble_owner_game: every import is studio-data-ready; the world replaces a NEW place\'s template; the sky replaces the sky', async () => {
  const f = studio();
  await run(f, 'assemble_owner_game', { niche: 'x', seed: 1 });
  assert.ok(imports(f).length > 15);
  assert.ok(imports(f).every((o) => o.studioData === true), 'studioData on every import');
  const world = imports(f).find((o) => o.gameId === gid(1) && o.path === '/Workspace');
  assert.deepEqual([world.replace, world.applyServiceProperties, world.parent], [true, true, 'game.Workspace']);
  assert.equal(f.world.nodes.has('game.Workspace.Baseplate'), false, 'the template baseplate is gone');
  const sky = imports(f).find((o) => o.path === '/Lighting');
  assert.deepEqual([sky.replace, sky.applyServiceProperties, sky.parent], [true, true, 'game.Lighting']);
  const kept = studio({ workspace: ['Baseplate', 'SpawnLocation', 'MyHouse'] });
  await run(kept, 'assemble_owner_game', { niche: 'x', seed: 1 });
  assert.equal(imports(kept).find((o) => o.path === '/Workspace').replace, undefined, 'a place with its own things keeps them');
  assert.ok(kept.world.nodes.has('game.Workspace.MyHouse'));
  assert.equal(imports(kept).filter((o) => o.replace).length, 1, 'only the sky replaces');
});

test('assemble_owner_game: sounds go to SoundService whatever the plan said, and each source game brings its materials once', async () => {
  const f = studio();
  await run(f, 'assemble_owner_game', { niche: 'x', seed: 1 });
  for (const path of ['/Workspace/Theme', '/Workspace/Pop']) assert.equal(imports(f).find((o) => o.path === path).parent, 'game.SoundService');
  const mats = imports(f).filter((o) => o.path === '/MaterialService');
  assert.equal(new Set(mats.map((o) => o.gameId)).size, mats.length, 'once per game');
  assert.deepEqual(new Set(mats.map((o) => Number(o.gameId))), new Set([1, 2, 6, 7, 8, 9]), 'for the games whose look is part of the world, not for sounds or lighting');
  assert.ok(mats.every((o) => o.onlyMissing === true && o.studioData === true));
});

test('assemble_owner_game: characters and props end up on the ground, apart, out of the walls, near the spawn; effects where the plan put them', async () => {
  const f = studio({ walls: [{ center: [40, 15, 0], size: [20, 30, 60] }], ghosts: [{ center: [-30, 4, -30], size: [30, 8, 30] }] });
  const { data } = await run(f, 'assemble_owner_game', { niche: 'x', seed: 5 });
  const under = (name) => [...f.world.nodes.values()].filter((n) => new RegExp(`^game\\.Workspace\\.${name}( \\(\\d+\\))?$`).test(n.path));
  assert.equal(under('Brainrot').length, 3); assert.equal(under('Tree').length, 6); assert.equal(under('Sparkle').length, 2);
  const placed = [...under('Brainrot'), ...under('Tree'), ...under('Sparkle')];
  for (const n of placed) {
    assert.ok(Math.abs(n.center[1] - n.size[1] / 2 - 0) < 1e-6, `${n.path} rests on the ground`);
    assert.ok(!(n.center[0] > 30 && n.center[0] < 50 && Math.abs(n.center[2]) < 30), `${n.path} is in the wall`);
    assert.ok(Math.hypot(n.center[0], n.center[2]) < 91, `${n.path} is near the spawn`);
  }
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) assert.ok(Math.hypot(placed[i].center[0] - placed[j].center[0], placed[i].center[2] - placed[j].center[2]) > 2);
  assert.deepEqual(data.parts.filter((p) => p.placed !== undefined).map((p) => [p.part, p.placed, p.wanted]), [['characters', 3, 3], ['props', 6, 6], ['fx', 2, 2]]);
  assert.equal(f.ops('delete_instances').length, 0);
});

test('assemble_owner_game: a map with no spawn is decorated around its own middle, not around the origin and not around the models just imported', async () => {
  const bp = BLUEPRINT();
  bp.components = bp.components.filter((c) => ['world', 'props', 'characters'].includes(c.role));
  const far = [1800, 2000, 2200, 2400].map((x, i) => ({ name: 'Block' + i, class: 'Model', center: [x, -2, 300], size: [300, 4, 300] }));
  const f = studio({ route: { blueprint: bp }, importOf: (op) => (op.path === '/Workspace' && op.mode === 'children' ? { roots: far } : importOf(op)) });
  await run(f, 'assemble_owner_game', { niche: 'x', seed: 2 });
  const placed = [...f.world.nodes.values()].filter((n) => /^game\.Workspace\.(Tree|Brainrot)( \(\d+\))?$/.test(n.path));
  assert.equal(placed.length, 9);
  for (const n of placed) assert.ok(Math.abs(n.center[0] - 2100) < 400 && Math.abs(n.center[2] - 300) < 300, `${n.path} stands on the map (${n.center})`);
});

test('assemble_owner_game: a core brought from another game moves down onto the new world\'s ground, as one group', async () => {
  const f = studio();
  await run(f, 'assemble_owner_game', { niche: 'x', seed: 1 });
  const plots = f.world.nodes.get('game.Workspace.Plots');
  assert.ok(Math.abs(plots.center[1] - plots.size[1] / 2) < 1e-6, `the plots rest on the ground (centre ${plots.center[1]})`);
  const bp = BLUEPRINT();
  bp.components = bp.components.filter((c) => c.role !== 'world').map((c) => (c.role === 'core' ? { ...c, gameId: gid(1) } : c));
  const own = studio({ route: { install: (op) => ({ ok: true, data: PLANS[op.params.id] }), blueprint: bp } });
  await run(own, 'assemble_owner_game', { niche: 'x', seed: 1 });
  assert.equal(own.world.nodes.get('game.Workspace.Plots').center[1], 30, 'a core that brings its own map is left where it is');
});

test('assemble_owner_game: a core\'s map pieces move by the offset the library worked out, keep their layout, and bring no helper of their own', async () => {
  const offset = { x: -1153, y: -1, z: 1024 };
  const piece = (name) => component('core', 2, { game: 'Mega fun obby', path: '/Workspace/' + name, parent: 'game.Workspace', works: 'yes', why: 'part of the map the game looks for', place: { count: 1, on: 'ground', spread: 0, offset } });
  const bp = BLUEPRINT();
  bp.components = [...bp.components.filter((c) => c.role === 'world' || c.role === 'lighting'), piece('Base'), piece('Base#2'), piece('MainSpawn'), component('core', 2, { path: '/Workspace/Checkpoint System', parent: 'game.Workspace', works: 'yes' })];
  const seen = { Base: [960, 1.5, -1040], 'Base#2': [960, 1.5, -1020], MainSpawn: [1060, 3, -1000] };
  const f = studio({ route: { blueprint: bp },
    importOf: (op) => { const name = op.path.split('/').pop(); return seen[name] ? { roots: [{ name: name.replace('#2', '2'), class: 'Part', center: [...seen[name]], size: [4, 1, 4] }] } : importOf(op); } });
  const { data } = await run(f, 'assemble_owner_game', { niche: 'x', seed: 1 });
  const at = (n) => f.world.nodes.get('game.Workspace.' + n).center;
  assert.deepEqual([at('Base'), at('Base2'), at('MainSpawn')], [[960 - 1153, 0.5, -1040 + 1024], [960 - 1153, 0.5, -1020 + 1024], [1060 - 1153, 2, -1000 + 1024]]);
  assert.equal(f.ops('query_owner_library').filter((o) => o.action === 'deps' && /\/Workspace\//.test(o.path)).length, 0, 'a helper imported for one piece would stand apart from the moved ones');
  assert.equal(f.ops('transform_instances').filter((o) => o.move.join() === '-1153,-1,1024').length, 3);
  assert.equal([...f.world.nodes.keys()].filter((p) => /\(2\)$/.test(p)).length, 0, 'no piece is imported twice');
  assert.equal(data.parts.filter((p) => p.part === 'core' && p.moved === 1).length, 3);
});

test('assemble_owner_game: screens are wired by what the library says works: the core and the daily reward are left, the kit and the wheel are connected', async () => {
  const f = studio();
  const { data } = await run(f, 'assemble_owner_game', { niche: 'x', seed: 1 });
  const attr = (p) => f.world.nodes.get(p)?.attrs.AppleMenuBinder;
  assert.deepEqual([attr('game.StarterGui.CoreHud'), attr('game.StarterGui.DailyGui'), attr('game.StarterGui.Menus'), attr('game.StarterGui.SpinGui')], [undefined, undefined, true, true]);
  assert.equal(f.ops('edit_script').length, 1, 'ONE binder for the whole game');
  assert.match(data.menus, /connected their buttons/);
  assert.match(data.forUser, /their menus open and close/);
});

test('assemble_owner_game: the answer for the user is plain: names its sources, says what players get, has no path, tool name, id or count', async () => {
  const f = studio();
  const { out, data } = await run(f, 'assemble_owner_game', { niche: 'brainrot collecting', seed: 3 });
  assert.match(data.forUser, /^Brainrot Bonanza is ready in your place/);
  for (const name of ['Sunny Map', 'Plants Game', 'Daily Reward System', 'Lucky Spin Wheel', 'Settings Menu', 'Studded UI', 'Tsunami Brainrots', 'Stud Asset Pack']) assert.ok(data.forUser.includes(name), name + ' missing from: ' + data.forUser);
  assert.equal(data.forUser.includes('(2)'), false, 'the library\'s copy marker is not part of a name');
  for (const why of ['daily rewards with a claim screen', 'a lucky spin wheel', 'funny brainrot pets near the start']) assert.ok(data.forUser.includes(why), why);
  assert.equal(jargon.test(data.forUser), false, data.forUser);
  assert.equal(jargon.test(out.summary), false, out.summary);
  assert.equal(out.summary, '✓ Built Brainrot Bonanza from your saved games');
  assert.deepEqual(data.couldNotAdd, []);
  assert.match(data.note, /Name no tools, paths, counts or ids/);
});

test('assemble_owner_game: a part that fails is skipped and named plainly; the rest still goes on', async () => {
  const f = studio({ importOf: (op) => (op.gameId === gid(4) || op.gameId === gid(8) ? { error: 'path not found: ' + op.path } : importOf(op)) });
  const { out, data } = await run(f, 'assemble_owner_game', { niche: 'x', seed: 1 });
  assert.equal(out.ok, true);
  assert.deepEqual(data.parts.filter((p) => !p.ok).map((p) => p.part).sort(), ['props', 'system']);
  assert.match(data.forUser, /one of its features and the decorations could not be added, so the game is missing those\./);
  assert.equal(jargon.test(data.forUser), false, data.forUser);
  assert.equal(out.summary, '✓ Built Brainrot Bonanza from your saved games, with a few parts left out');
  assert.equal(imports(f).filter((o) => o.gameId === gid(7) && o.path === '/Workspace/Brainrot').length, 1, 'characters came before the props failed and after the wheel failed');
  assert.ok(f.world.nodes.has('game.Workspace.Brainrot'));
  assert.equal(imports(f).at(-1).path, '/Lighting', 'and the sky still went in last');
});

test('assemble_owner_game: models nobody could place are removed; nothing is left inside a wall or under the map', async () => {
  const f = studio({ ghosts: [{ center: [0, 4, 0], size: [800, 8, 800] }] });
  const { out, data } = await run(f, 'assemble_owner_game', { niche: 'x', seed: 1 });
  assert.equal(out.ok, true);
  assert.deepEqual(data.parts.filter((p) => !p.ok).map((p) => p.part).sort(), ['characters', 'fx', 'props']);
  assert.match(data.forUser, /the characters, the decorations and the effects could not be added/);
  for (const n of f.world.nodes.values()) if (/^game\.Workspace\.(Brainrot|Tree|Sparkle)/.test(n.path)) assert.fail(n.path + ' was left behind');
});

test('assemble_owner_game: a Studio that goes away stops the build, keeps what was built and says so', async () => {
  const f = studio({ fail: (op) => (op.op === 'import_owner_library' && op.gameId === gid(6) ? { ok: false, error: 'Studio is not connected', failure: 'transport' } : null) });
  const { out, data } = await run(f, 'assemble_owner_game', { niche: 'x', seed: 1 });
  assert.equal(out.ok, true);
  assert.match(data.forUser, /Roblox Studio stopped answering part-way, so the rest was not added\./);
  assert.equal(imports(f).filter((o) => o.gameId === gid(7)).length, 0, 'nothing after the loss is attempted');
  assert.ok(f.world.nodes.has('game.Workspace.Map'), 'what was built is kept');
});

test('assemble_owner_game: a run that has taken too long stops adding extras and finishes as far as it got', async () => {
  const f = studio();
  let t = 0;
  const inner = f.ctx.execStudioOp;
  f.ctx.execStudioOp = async (op) => { t += 1000; return inner(op); };
  const r = await A.assembleOwnerGame(f.ctx, { niche: 'x', seed: 1 }, { budgetMs: 40_000, now: () => t });
  assert.ok(r.changed);
  assert.match(r.forUser, /Apple stopped part-way to keep things quick, so a few extras are missing\./);
  assert.ok(r.parts.some((p) => !p.ok && p.technical === 'out of time'));
  assert.ok(imports(f).length < 20, 'and it really stopped asking');
  const unlimited = await A.assembleOwnerGame(studio().ctx, { niche: 'x', seed: 1 });
  assert.equal(unlimited.couldNotAdd.length, 0);
  assert.equal(A.ASSEMBLE_BUDGET_MS, 12 * 60_000, 'inside the 15 minutes a Durable Object alarm may run');
});

test('assemble_owner_game: no plan, no niche or no way to save a copy first changes nothing and is one plain sentence', async () => {
  const none = studio({ route: { blueprint: new Error('owner library gateway is not reachable; start it on the Mac') } });
  const a = await run(none, 'assemble_owner_game', { niche: 'obby' });
  assert.equal(a.out.ok, false);
  assert.equal(a.out.summary, '✗ Apple could not reach your saved games right now');
  assert.deepEqual([none.ctx.checkpoints.length, imports(none).length], [0, 0]);
  const empty = studio({ route: { blueprint: { title: 'X', components: [{ role: 'nonsense', gameId: 'zz' }] } } });
  const b = await run(empty, 'assemble_owner_game', { niche: 'obby' });
  assert.equal(b.out.ok, false); assert.match(b.data.error, /Tell the user in one plain sentence that the library has nothing for that kind of game yet/);
  assert.equal(empty.ctx.checkpoints.length, 0);
  const missing = studio();
  assert.equal((await run(missing, 'assemble_owner_game', {})).out.ok, false);
  assert.equal(missing.log.length, 0);
  const noCopy = studio();
  noCopy.ctx.createCheckpoint = async () => ({ error: 'snapshot failed' });
  const c = await run(noCopy, 'assemble_owner_game', { niche: 'obby' });
  assert.deepEqual([c.out.ok, imports(noCopy).length], [false, 0]);
  assert.match(c.out.summary, /^✗ Apple could not save a copy of your place first/);
  const allFail = studio({ importOf: () => ({ error: 'path not found' }), route: { install: { ok: false, error: 'x' }, blueprint: BLUEPRINT() } });
  const d = await run(allFail, 'assemble_owner_game', { niche: 'obby', seed: 1 });
  assert.equal(d.out.ok, false); assert.match(d.out.summary, /^✗ Apple could not build a game from your saved games this time/);
  assert.equal(d.out.mutatedProject, undefined);
});

test('readBlueprint: keeps what can be carried out, drops what cannot, and clamps counts and spreads', () => {
  const bp = A.readBlueprint({ title: 'Title /A/B', look: 'studded', components: [
    component('props', 1, { place: { count: 99, on: 'roof', spread: 9999 } }), component('props', 2, { place: { count: 0, on: 'plots', spread: 1 } }),
    component('props', 3), { ...component('props', 4), role: 'weather' }, { ...component('props', 5), gameId: '../x' }, { ...component('props', 6), path: 'nope' },
    { ...component('system', 7), install: true, path: undefined, parent: 'not a path' }, null, 3] });
  assert.equal(bp.title, 'Title');
  assert.deepEqual(bp.components.map((c) => c.gameId), [gid(1), gid(2), gid(3), gid(7)]);
  assert.deepEqual([bp.components[0].place, bp.components[1].place, bp.components[2].place], [{ count: 20, on: 'ground', spread: 400 }, { count: 1, on: 'plots', spread: 10 }, undefined]);
  assert.equal(bp.components[3].parent, 'game.Workspace', 'a missing parent falls back to where the library path belongs');
  const off = A.readBlueprint({ components: [component('core', 1, { place: { count: 1, on: 'ground', spread: 0, offset: { x: -5, y: 0, z: 9 } } }), component('core', 2, { place: { count: 1, on: 'ground', spread: 0, offset: { x: 'a', y: 0, z: 0 } } }),
    component('props', 3, { place: { count: 1, on: 'ground', spread: 40, offset: { x: 1, y: 1, z: 1 } } })] });
  assert.deepEqual([off.components[0].place.offset, off.components[1].place.offset, off.components[2].place.offset], [[-5, 0, 9], undefined, undefined], 'only a core piece has an offset, and only three plain numbers make one');

  assert.equal(bp.unusable, 5);
  assert.deepEqual(A.inBuildOrder([component('lighting', 1), component('props', 2), component('world', 3), component('props', 4), component('core', 5)]).map((c) => c.role), ['world', 'core', 'props', 'props', 'lighting']);
});

// ---------------------------------------------------------- the older library tools share the same rules

test('studioData is on every library import the worker sends: single imports, their dependencies, materials and whole games', async () => {
  const deps = { needs: [{ path: '/ReplicatedStorage/Remotes/Buy', parent: 'game.ReplicatedStorage', mode: 'self', why: 'buy remote' }], usedBy: [] };
  const f = studio({ game: { name: 'Farm Game', place: true, works: 'yes', lighting: { Brightness: 2 }, services: { Workspace: { instances: 5, children: [] }, StarterGui: { instances: 3, children: [] } } } });
  const inner = f.ctx.execStudioOp;
  f.ctx.onceInRun = (() => { const seen = new Set(); return (k) => !seen.has(k) && !!seen.add(k); })();
  f.ctx.execStudioOp = async (op) => (op.op === 'query_owner_library' && op.action === 'deps' ? (f.log.push(op), { ok: true, data: deps }) : inner(op));
  await run(f, 'import_owner_library', { gameId: gid(2), path: '/StarterGui/Shop', mode: 'self' });
  await run(f, 'recreate_owner_game', { gameId: gid(2) });
  assert.ok(imports(f).length >= 6);
  assert.ok(imports(f).some((o) => o.path === '/ReplicatedStorage/Remotes/Buy'), 'a dependency was imported too');
  assert.ok(imports(f).some((o) => o.path === '/MaterialService'), 'and the materials');
  assert.ok(imports(f).every((o) => o.studioData === true), imports(f).filter((o) => o.studioData !== true).map((o) => o.path).join());
});

test('a screen imported on its own that came without working code gets connected; one with working code, or from a working game, is left alone', async () => {
  const kit = studio({ importOf: () => ({ roots: [{ name: 'Kit', class: 'ScreenGui', children: BUTTONS }] }) });
  const a = await run(kit, 'import_owner_library', { gameId: gid(6), path: '/StarterGui/Kit', mode: 'self' });
  assert.equal(kit.world.nodes.get('game.StarterGui.Kit').attrs.AppleMenuBinder, true);
  assert.match(a.data.menus, /connected their buttons/);
  const coded = studio({ importOf: () => ({ roots: [{ name: 'Kit', class: 'ScreenGui', children: BUTTONS, scripts: [{ name: 'Ctl', class: 'LocalScript', source: 'x.Activated:Connect(f)' }] }] }) });
  const b = await run(coded, 'import_owner_library', { gameId: gid(6), path: '/StarterGui/Kit', mode: 'self' });
  assert.equal(coded.world.nodes.get('game.StarterGui.Kit').attrs.AppleMenuBinder, undefined);
  assert.equal(b.data.menus, undefined); assert.equal(coded.ops('edit_script').length, 0);
  const stripped = studio({ importOf: () => ({ roots: [{ name: 'Kit', class: 'ScreenGui', children: BUTTONS, scripts: [{ name: 'Ctl', class: 'LocalScript', source: '-- Decompilation panicked' }] }] }) });
  await run(stripped, 'import_owner_library', { gameId: gid(6), path: '/StarterGui/Kit', mode: 'self' });
  assert.equal(stripped.world.nodes.get('game.StarterGui.Kit').attrs.AppleMenuBinder, true, 'stripped code is no code');
  const game = (works) => studio({ game: { name: 'Shop Game', place: true, works, services: { StarterGui: { instances: 4, children: [] } } }, importOf: () => ({ roots: [{ name: 'Hud', class: 'ScreenGui', children: BUTTONS }] }) });
  const yes = game('yes'); await run(yes, 'recreate_owner_game', { gameId: gid(2) });
  assert.equal(yes.ops('query_instances').length, 0, 'a working game\'s screens are not even read');
  const looks = game('looks only'); const r = await run(looks, 'recreate_owner_game', { gameId: gid(2) });
  assert.equal(looks.world.nodes.get('game.StarterGui.Hud').attrs.AppleMenuBinder, true);
  assert.match(r.data.menus, /connected their buttons/);
});

test('the older library tools speak plainly in the activity feed too', async () => {
  const f = studio({ game: { name: 'Farm Game (2)', place: true, services: { Workspace: { instances: 5, children: [] } } } });
  assert.equal((await run(f, 'import_owner_library', { gameId: gid(2), path: '/StarterGui/ShopGui', mode: 'self' })).out.summary, '✓ Added the shop screen from your saved games');
  assert.equal((await run(f, 'import_owner_library', { gameId: gid(2), path: '/Workspace', mode: 'children' })).out.summary, '✓ Added the game map from your saved games');
  assert.equal((await run(f, 'recreate_owner_game', { gameId: gid(2) })).out.summary, '✓ Rebuilt Farm Game from your saved games');
  assert.equal((await run(f, 'browse_owner_library', { q: 'farm' })).out.summary, '✓ Looked through your saved games');
  const bad = studio({ importOf: () => ({ error: 'path not found: /X' }) });
  assert.equal((await run(bad, 'import_owner_library', { gameId: gid(2), path: '/StarterGui/ShopGui', mode: 'self' })).out.summary, '✗ Something stopped it from finishing.');
});

test('the two new tools are registered as project-changing Studio tools, offered only with the ops they need, and described for the model', () => {
  for (const name of ['install_owner_system', 'assemble_owner_game']) {
    const tool = T.TOOLS[name];
    assert.equal(tool.studio, true); assert.ok(tool.mutatesProject);
    assert.deepEqual([...tool.studioOps].sort(), ['import_owner_library', 'query_owner_library', 'snapshot']);
    assert.ok(T.projectMutatingToolNames().includes(name));
  }
  assert.match(T.TOOLS.assemble_owner_game.def.description, /THE way to build a game/);
  assert.match(T.TOOLS.assemble_owner_game.def.description, /niche/);
  assert.deepEqual(T.TOOLS.assemble_owner_game.def.parameters.required, ['niche']);
  assert.deepEqual(T.TOOLS.install_owner_system.def.parameters.required, ['gameId']);
});

// ---------------------------------------------------------- the prompt, the run's own record and the fences

test('the prompt names the two tools as THE way to build from the saved games, in a short paragraph without the do-and-do-not prose the tools now enforce', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/prompts.ts', import.meta.url), 'utf8');
  const at = src.indexOf("- THE OWNER'S SAVED GAMES ARE THE FIRST SOURCE FOR EVERY BUILD.");
  assert.ok(at > 0, 'the paragraph');
  const paragraph = src.slice(at, src.indexOf('\n- ', at + 10));
  assert.ok(paragraph.length < 800, `${paragraph.length} characters: keep it short, the tool descriptions carry the how`);
  assert.match(paragraph, /assemble_owner_game \{niche\}/);
  assert.match(paragraph, /install_owner_system \{gameId\}/);
  assert.match(paragraph, /If an imported game can load code from the internet, say so in one plain sentence/);
  for (const enforced of [/never a flat or realistic map/i, /studded-modern and\s+studded-classic/i, /MaterialVariant from MaterialService/i, /unrelated GUIs dropped on it/i, /ONE studded game in the niche/i]) assert.doesNotMatch(src, enforced);
});

test('a run that assembled a game or installed a system reports it in plain words, and the HUD gap knows a whole game has screens', async () => {
  const { builtSummary, addMade, madeKey, buildsHud } = await import('../src/run-idle.ts');
  assert.equal(builtSummary(addMade(undefined, madeKey('assemble_owner_game', '{"niche":"tycoon"}'))), 'It worked on a whole new game from your saved games.');
  assert.equal(builtSummary(addMade(undefined, madeKey('install_owner_system', '{"gameId":"abcdef012345"}'))), 'It worked on a ready-made feature from your saved games.');
  assert.equal(buildsHud('assemble_owner_game', '{"niche":"tycoon"}'), true);
  assert.equal(buildsHud('install_owner_system', '{"gameId":"abcdef012345"}'), false, 'one system is not a HUD');
});

test('a build that only uses the saved games may call the two tools, and is told about them when it reaches for something else', async () => {
  const { staysInOwnerLibrary } = await import('../src/request-scope.ts');
  assert.equal(staysInOwnerLibrary('assemble_owner_game'), true);
  assert.equal(staysInOwnerLibrary('install_owner_system'), true);
  const { readFileSync } = await import('node:fs');
  const session = readFileSync(new URL('../src/do/session.ts', import.meta.url), 'utf8');
  assert.match(session, /Build the game with assemble_owner_game \{niche\}, add a feature with install_owner_system \{gameId\}/);
  const mcp = readFileSync(new URL('../src/mcp.ts', import.meta.url), 'utf8');
  assert.match(mcp, /install_owner_system: /); assert.match(mcp, /assemble_owner_game: /);
});

test('browse_owner_library kind system lists the ready-made systems through the library\'s systems route, and says how to add one', async () => {
  const rows = { total: 1, items: [{ gameId: gid(3), name: 'Daily Reward System', does: 'daily rewards with a claim screen', tags: ['daily-reward'], works: 'yes', instances: 40, scripts: 6 }], nextAfter: null };
  const f = studio({ route: { systems: rows } });
  const { out, data } = await run(f, 'browse_owner_library', { kind: 'system', q: 'daily reward', niche: 'tycoon', after: 20, limit: 5 });
  assert.equal(out.ok, true);
  const asked = f.ops('query_owner_library')[0];
  assert.deepEqual([asked.action, asked.route, asked.params], ['route', 'systems', { q: 'daily reward', niche: 'tycoon', after: 20, limit: 5 }]);
  assert.equal(data.items[0].gameId, gid(3));
  assert.match(data.note, /install_owner_system \{gameId\}/);
  const bare = studio({ route: { systems: rows } });
  await run(bare, 'browse_owner_library', { kind: 'system' });
  assert.deepEqual(bare.ops('query_owner_library')[0].params, { limit: 10 }, 'no empty words are sent');
  assert.match(T.TOOLS.browse_owner_library.def.parameters.properties.kind.enum.join(), /system/);
});

test('a plugin that does not know the route yet is one plain sentence about updating it, never a raw error', async () => {
  const old = studio({ route: { install: new Error('action must be list, game or deps') } });
  const r = await run(old, 'install_owner_system', { gameId: gid(3) });
  assert.equal(r.out.ok, false);
  assert.equal(r.out.summary, '✗ The Apple plugin in Roblox Studio needs updating before it can do that');
  assert.equal(old.ctx.checkpoints.length, 0);
});
