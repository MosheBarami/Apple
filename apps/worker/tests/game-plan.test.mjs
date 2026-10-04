// plan_game and build_game: the two steps of an original game built from the owner's saved games.
//
// The library decides WHAT (a design: the core game, what to import and leave out, the regions and screens, the texts, the content
// to theme); these tools carry it out in Studio. Everything runs against a stand-in plugin (fixtures/fake-studio.mjs) that answers
// the design route, imports, deletes, text reads and writes, spatial queries and moves the way the real one does and keeps a log
// of every operation, so the tests check what was ASKED and what the place looks like afterwards, not only what came back.
//
// The design below has the shape packages/owner-corpus/library_design.py really returns (theme and currency are objects, screens.keep
// holds {path, kit}, there is a cleanup list, import entries carry their own flags, some texts to change live in scripts or are blanked).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fakeStudio } from './fixtures/fake-studio.mjs';

const esbuild = await import(process.env.APPLE_TEST_ESBUILD || 'esbuild');
const dir = mkdtempSync(join(tmpdir(), 'game-plan-'));
test.after(() => rmSync(dir, { recursive: true, force: true }));
const alias = { '@apple/shared': '../../packages/shared/src/index.ts' };
await esbuild.build({ entryPoints: ['src/tools.ts'], bundle: true, format: 'esm', platform: 'node', outfile: join(dir, 'tools.mjs'), alias });
await esbuild.build({ entryPoints: ['src/game-plan.ts'], bundle: true, format: 'esm', platform: 'node', outfile: join(dir, 'plan.mjs'), alias });
await esbuild.build({ entryPoints: ['../../packages/shared/src/index.ts'], bundle: true, format: 'esm', platform: 'node', outfile: join(dir, 'shared.mjs') });
const T = await import(pathToFileURL(join(dir, 'tools.mjs')).href);
const G = await import(pathToFileURL(join(dir, 'plan.mjs')).href);
const S = await import(pathToFileURL(join(dir, 'shared.mjs')).href);

const gid = (n) => String(n).padStart(12, '0');
const CORE = gid(20), DECO = gid(21);
const REQUEST = 'make me a grow a garden game with a candy theme';
const label = (name, text, class_ = 'TextLabel') => ({ name, class: class_, props: { Text: { t: 'string', v: text } } });

/** The design the library would return for the request. Screens the design removes are still in the core's StarterGui; the ones it leaves out with @except are not. */
const design = () => ({
  title: 'Candy Grove', genre: 'grow-garden', pitch: 'Candy Grove is a grow garden game: buy seeds, plant them on your own plot, harvest and sell. It is set in a candy world.',
  theme: {
    name: 'candy', words: ['candy'], twist: '', picked: false, look: 'studded-modern', mood: 'bright pastel sweets world', colours: ['pink', 'purple'], nameIdeas: ['Bonbon Tree', 'Fudge Sprout', 'Licorice Vine'],
    lighting: { properties: { Brightness: 3, Ambient: [255, 204, 102], ExposureCompensation: 0.2, Bogus: 5 }, atmosphere: { Density: 0.22, Color: [255, 205, 235], Haze: 1.1 }, sky: 'a soft pink and lilac sky' },
  },
  loop: ['Spawn on your own plot.', 'Plant a seed, wait, harvest and sell it.'], progression: ['Coins buy better seeds and bigger plots.'],
  core: { gameId: CORE, name: 'Garden Game', why: 'its code is intact, it has the studded look and a single coin currency', runs: 3, alternatives: [] },
  features: { keep: [{ name: 'Planting and growing plants', why: 'its loop', what: 'x' }, { name: 'Seed shop', why: 'its loop', what: 'y' }], requestedButMissing: [] },
  import: [
    { gameId: CORE, path: '/Lighting', mode: 'children', parent: 'game.Lighting', what: 'the sky and lighting', applyServiceProperties: true },
    { gameId: CORE, path: '/MaterialService', mode: 'children', parent: 'game.MaterialService', what: 'the surface looks', onlyMissing: true },
    { gameId: CORE, path: '/ServerScriptService@except(EventManager,AdminCommands)', mode: 'children', parent: 'game.ServerScriptService', what: 'the garden rules' },
    { gameId: CORE, path: '/ReplicatedStorage@except(HalloweenEvent)', mode: 'children', parent: 'game.ReplicatedStorage', what: 'the shared settings' },
    { gameId: CORE, path: '/StarterGui@except(PetsUI,AdminPanel,Main/Pets)', mode: 'children', parent: 'game.StarterGui', what: 'the shop and the coin counter' },
    { gameId: CORE, path: '/Workspace@except(EventIsland)', mode: 'children', parent: 'game.Workspace', what: 'the play area', applyServiceProperties: true },
  ],
  cleanup: ['/ReplicatedStorage/Config/PackRegistry', '/ReplicatedStorage/Config/Missing'],
  leaveOut: [
    { feature: 'Halloween event (a seasonal event)', why: 'a seasonal event that does not belong', parts: ['/ReplicatedStorage/HalloweenEvent'], edits: [] },
    { feature: 'Pets', why: 'a garden has no pets', parts: ['/StarterGui/PetsUI'], edits: [{ path: '/ServerScriptService/GardenMain', change: 'remove the PetService require and the pet bonus in Sell' }, { path: null, change: 'Replace the pet products with the new game\'s own.' }] },
  ],
  world: { keep: [{ name: 'the plots', role: 'plots', path: '/Workspace/Garden', why: 'needed' }], drop: [], add: [{ gameId: DECO, path: '/Workspace/Fountain', mode: 'self', parent: 'game.Workspace', name: 'Fountain', role: 'landmark', offset: { x: 150, y: 0, z: 0 }, at: { x: 450, z: 300 }, why: 'a landmark beside the garden' }] },
  screens: {
    keep: [{ path: '/StarterGui/HUD', kit: 'garden-kit' }, { path: '/StarterGui/Shop', kit: 'garden-kit' }],
    remove: [{ path: '/StarterGui/PetsUI', why: 'pets' }, { path: '/StarterGui/AdminPanel', why: 'admin' }, { path: '/StarterGui/EventBanner', why: 'an event banner' }, { path: '/StarterGui/HUD', why: 'must not go: it is on the keep list' }, { path: '/StarterGui/Shop/Header/Sub', element: true, why: 'stays: a kept screen holds it? no, its own path is removed' }],
    fixTexts: [
      { path: '/StarterGui/HUD/Coins', now: '$299,999', to: '0', kind: 'placeholder-text' },
      { path: '/StarterGui/Loading/Title', now: 'Loading...', to: 'Candy Grove', kind: 'placeholder-text' },
      { path: '/StarterGui/Shop/Header', now: 'Garden', to: 'Candy', kind: 'text' },
      { path: '/StarterGui/Nowhere/Label', now: 'Welcome to Gardenville', to: 'Welcome to Candy Grove', kind: 'text' },
      { path: '/StarterGui/HUD/Timer', now: '...', to: '0', kind: 'placeholder-text' },
    ],
  },
  content: {
    tables: [{ path: '/ReplicatedStorage/Config/Plants', format: 'a ModuleScript returning {[name] = {price = number, grow = seconds}}', sample: 'Carrot = {price = 10, grow = 30}', howToAdd: 'add one key per plant', entries: 12, was: 12, what: 'Per-plant prices (12 entries)' }],
    models: [{ gameId: DECO, path: '/Workspace/CandyTree', category: 'plant', name: 'Candy Tree', fits: 'a Model with a Trunk and a Leaves part, like the core plants' }],
    currency: { name: 'Sugar Coins', was: 'Money', shownAs: '$299,999 in the HUD', places: ['/StarterGui/HUD/Coins'], how: 'Show the new name wherever the old one is written.' },
    lockstep: [], registryNote: 'Keep only the entries the themed game needs.',
  },
  branding: [
    { path: '/StarterGui/Loading/Credit', now: 'by GardenDev', to: 'by the Candy Grove team', kind: 'text' },
    { path: '/ServerScriptService/GardenMain', now: 'GardenDev', to: 'Candy Grove', kind: 'text' },
    { path: '/StarterGui/Loading/Join', now: '1. Like the game', to: '', kind: 'text' },
  ],
  write: [], warnings: ['The core has old or partial code; run it and read the output before trusting it.'],
  studioNotes: ['The garden plots are named Plot1..Plot6; keep those names.'],
  walkthrough: ['Spawn at the garden.', 'Buy a seed in the shop.', 'Plant it, wait, harvest, sell for Sugar Coins.'],
  checklist: ['Import every entry of "import" in order.', 'Theme /ReplicatedStorage/Config/Plants: 12 entries.', 'Play it once and read the output: no red errors.'],
  understood: { request: REQUEST, seed: 7 },
});

/** What an import brings in. An @except path leaves the named children out, as the real plugin does. */
function importOf(op) {
  const g = op.gameId, base = op.path.replace(/@(?:box|except)\(.*\)$/, '');
  const except = (/@except\(([^)]*)\)$/.exec(op.path)?.[1] ?? '').split(',').filter(Boolean);
  const drop = (roots) => roots.filter((r) => !except.includes(r.name));
  if (op.path === '/MaterialService') return { error: 'path not found: /MaterialService' };
  if (g === CORE && base === '/Lighting') return { roots: [{ name: 'CandySky', class: 'Sky' }] };
  if (g === CORE && base === '/Workspace') return { roots: drop([{ name: 'Garden', class: 'Model', center: [0, 0.5, 0], size: [80, 1, 80] }, { name: 'SpawnLocation', class: 'SpawnLocation', center: [0, 0.5, 0], size: [12, 1, 12] }, { name: 'EventIsland', class: 'Model', center: [900, 0.5, 900], size: [40, 1, 40] }]), scripts: 0 };
  if (g === CORE && base === '/ServerScriptService') return { roots: drop([{ name: 'GardenMain', class: 'Script' }, { name: 'EventManager', class: 'Script' }, { name: 'AdminCommands', class: 'Script' }]), scripts: 1 };
  if (g === CORE && base === '/ReplicatedStorage') return { roots: drop([{ name: 'Config', class: 'Folder', children: [{ name: 'Plants', class: 'ModuleScript' }, { name: 'PackRegistry', class: 'ModuleScript' }] }, { name: 'HalloweenEvent', class: 'Folder' }]) };
  if (g === CORE && base === '/StarterGui') return { roots: drop([
    { name: 'HUD', class: 'ScreenGui', children: [label('Coins', '$299,999'), label('Timer', '...'), { name: 'ShopButton', class: 'TextButton' }], scripts: [{ name: 'HudController', class: 'LocalScript', source: 'ShopButton.Activated:Connect(open)' }] },
    { name: 'Shop', class: 'ScreenGui', children: [{ ...label('Header', 'Garden Shop'), children: [label('Sub', 'Garden prices')] }, { name: 'BuyButton', class: 'TextButton' }], scripts: [{ name: 'ShopController', class: 'LocalScript', source: 'BuyButton.Activated:Connect(buy)' }] },
    { name: 'Loading', class: 'ScreenGui', children: [label('Title', 'Loading...'), label('Credit', 'by GardenDev'), label('Join', '1. Like the game')] },
    { name: 'EventBanner', class: 'ScreenGui', children: [label('Banner', 'Halloween is here')] },
    { name: 'PetsUI', class: 'ScreenGui' }, { name: 'AdminPanel', class: 'ScreenGui' },
  ]) };
  if (g === DECO && op.path === '/Workspace/Fountain') return { roots: [{ name: 'Fountain', class: 'Model', center: [300, -40, 300], size: [10, 10, 10] }] };
  return {};
}
const designRoute = (over = {}) => () => ({ ok: true, data: { ...design(), ...over } });
// A plan is kept per project: the fixture's context has one (a context with neither a project nor a store keeps nothing).
const studio = (over = {}) => { const f = fakeStudio({ route: { design: designRoute() }, importOf, ...over }); f.ctx.projectId ??= 'project-1'; return f; };
// A plan belongs to the call that names its id (phase 1): like the agent, the helper passes back the planId plan_game returned.
async function run(f, name, args) {
  const given = name === 'build_game' || name === 'judge_game' ? { planId: f.planId, ...args } : args;
  const out = await T.runTool(f.ctx, name, JSON.stringify(given));
  const data = JSON.parse(out.resultForLlm);
  if (name === 'plan_game' && data.planId) f.planId = data.planId;
  return { out, data };
}
/** The design's own imports, not the surface-look look-ups that follow a game whose design did not import them. */
const imports = (f) => f.ops('import_owner_library').filter((o) => !(o.path === '/MaterialService' && o.gameId !== CORE));
const plan = (f, args = {}) => run(f, 'plan_game', { request: REQUEST, seed: 7, ...args });
const built = async (f, over = {}) => { await plan(f); return run(f, 'build_game', over); };
const jargon = /[a-z]+_[a-z]+|\/[A-Za-z]|game\.|\bStarterGui\b|\bServerScriptService\b|checkpoint|judge|plan_game|build_game|\b[0-9a-f]{10,}\b/;
const text = (f, p) => f.world.nodes.get(p).props.Text.v;

// ------------------------------------------------------------------------------------------------- plan_game

test('plan_game: the library reads the user\'s own words, not the model\'s retelling; after a short reply ("yes, do it") the model\'s words stand', async () => {
  const seen = [];
  const f = studio({ route: { design: (op) => { seen.push(op.params.request); return { ok: true, data: design() }; } } });
  f.ctx.userRequest = () => 'Make me a Plants vs Brainrots style game, but the brainrots are fruit.';
  await plan(f, { request: 'a lane defense game with plants' });
  f.ctx.userRequest = () => 'yes, do it';
  await plan(f, { request: 'a candy garden' });
  assert.deepEqual(seen, ['Make me a Plants vs Brainrots style game, but the brainrots are fruit.', 'a candy garden']);
});

test('plan_game: asks the library for the design with the request, theme, features and seed, and keeps the whole plan for build_game', async () => {
  const seen = [];
  const f = studio({ route: { design: (op) => { seen.push(op); return { ok: true, data: design() }; } } });
  const { out, data } = await plan(f, { theme: 'candy', features: ['pets', 'a shop'] });
  assert.equal(out.ok, true);
  assert.equal(out.mutatedProject, undefined, 'planning changes nothing');
  assert.equal(f.ctx.checkpoints.length, 0, 'and takes no safety copy');
  assert.deepEqual([seen[0].action, seen[0].route], ['route', 'design']);
  assert.deepEqual(seen[0].params, { request: REQUEST, theme: 'candy', features: 'pets, a shop', seed: 7 });
  assert.equal(data.planned, true);
  assert.equal(data.plan.title, 'Candy Grove');
  assert.equal(data.plan.theme, 'candy');
  assert.equal(data.plan.core.name, 'Garden Game');
  assert.deepEqual(data.plan.keeps, ['Planting and growing plants', 'Seed shop']);
  assert.deepEqual(data.plan.leftOut.map((l) => l.feature), ['Halloween event (a seasonal event)', 'Pets']);
  assert.equal(data.plan.screensRemoved, 5); assert.equal(data.plan.textsFixed, 8);
  assert.deepEqual(data.plan.contentToTheme, ['Plants (12 entries)']);
  assert.deepEqual(data.plan.currency, { name: 'Sugar Coins', was: 'Money' });
  assert.equal(data.plan.seed, 7);
  assert.equal(out.summary, '✓ Planned Candy Grove');
  assert.ok(out.resultForLlm.length < 4000, `the digest is short (${out.resultForLlm.length} characters)`);
  assert.equal(jargon.test(data.forUser), false, data.forUser);
  assert.match(data.forUser, /^Here is the plan\. Candy Grove is a grow garden game: buy seeds/, 'the title is not said twice'); assert.match(data.forUser, /Halloween event and Pets/);
});

test('plan_game: no seed gives a fresh one in the library\'s range, a long request is cut at a word to what the plugin takes, and an empty request is refused', async () => {
  const seen = [];
  const f = studio({ route: { design: (op) => { seen.push(op); return { ok: true, data: design() }; } } });
  const long = 'make me a garden game '.repeat(30) + '\n with   candy';
  const { data } = await run(f, 'plan_game', { request: long });
  assert.ok(data.planned);
  assert.ok(seen[0].params.request.length <= 200 && !/\n/.test(seen[0].params.request) && /garden game$/.test(seen[0].params.request), seen[0].params.request);
  const judged = await run(f, 'build_game', {});
  assert.ok(judged.data.themeTheContent.request.length > 200 && judged.data.themeTheContent.request.length <= 1000, 'the judge is given the whole request, not the 200 characters the library took');
  assert.ok(Number.isInteger(seen[0].params.seed) && seen[0].params.seed >= 0 && seen[0].params.seed <= 1_000_000);
  assert.equal('theme' in seen[0].params, false, 'no theme, no param');
  const none = await run(studio(), 'plan_game', { request: '  ' });
  assert.match(none.data.error, /request is required/);
});

test('plan_game: a plugin that does not know the design route, a gateway that is down and a design with no core are each one plain refusal', async () => {
  const old = await plan(studio({ route: { design: () => ({ ok: false, error: 'route must be deps, install, systems, blueprint, family, report or media' }) } }));
  assert.match(old.data.error, /plugin in Roblox Studio needs updating/);
  const down = await plan(studio({ route: { design: () => ({ ok: false, error: 'owner library gateway is not reachable on 127.0.0.1:63747; start it on the Mac' }) } }));
  assert.match(down.data.error, /could not reach your saved games/);
  const empty = await plan(studio({ route: { design: () => ({ ok: true, data: { title: 'x', import: [] } }) } }));
  assert.match(empty.data.error, /without a working game to build on/);
  const none = await plan(studio({ route: { design: () => ({ ok: true, data: { ...design(), import: [{ gameId: 'nope', path: 'relative' }] } }) } }));
  assert.match(none.data.error, /nothing to bring in/);
  assert.equal(none.out.summary.startsWith('✗'), true);
});

// ------------------------------------------------------------------------------------------------- build_game

test('build_game: imports exactly the listed parts, once each, in the design\'s order, with their own flags, and nothing the design did not list (no dependencies)', async () => {
  const f = studio();
  const { out, data } = await built(f);
  assert.equal(out.ok, true); assert.equal(out.mutatedProject, true);
  assert.equal(f.ctx.checkpoints.length, 1, 'one safety copy for the whole build');
  assert.deepEqual(imports(f).map((o) => [o.gameId, o.path, o.mode, o.parent]), [
    [CORE, '/Lighting', 'children', 'game.Lighting'],
    [CORE, '/MaterialService', 'children', 'game.MaterialService'],
    [CORE, '/ServerScriptService@except(EventManager,AdminCommands)', 'children', 'game.ServerScriptService'],
    [CORE, '/ReplicatedStorage@except(HalloweenEvent)', 'children', 'game.ReplicatedStorage'],
    [CORE, '/StarterGui@except(PetsUI,AdminPanel,Main/Pets)', 'children', 'game.StarterGui'],
    [CORE, '/Workspace@except(EventIsland)', 'children', 'game.Workspace'],
    [DECO, '/Workspace/Fountain', 'self', 'game.Workspace'],
  ]);
  assert.ok(imports(f).every((o) => o.studioData === true), 'every import is studio-data ready');
  assert.equal(f.ops('import_owner_library').filter((o) => o.path === '/MaterialService' && o.gameId === CORE).length, 1, 'the design imported the surface looks itself: no second look-up');
  assert.equal(f.ops('import_owner_library').filter((o) => o.path === '/MaterialService' && o.gameId === DECO).length, 1, 'a region\'s game brings its surface looks once, so its studded parts do not draw bare');
  assert.equal(f.ops('query_owner_library').filter((o) => o.action !== 'route').length, 0, 'no dependency look-up: only what the design lists comes in');
  assert.equal(data.built, true); assert.equal(data.changed, true);
  assert.equal(out.summary, '✓ Built Candy Grove from your saved games');
});

test('build_game: @except paths go through as written, so the left-out features are never in the place', async () => {
  const f = studio();
  await built(f);
  const names = (svc) => f.world.kids('game.' + svc).map((n) => n.name);
  assert.deepEqual(names('ServerScriptService'), ['GardenMain']);
  assert.equal(names('ReplicatedStorage').includes('HalloweenEvent'), false);
  assert.equal(names('StarterGui').includes('PetsUI'), false);
  assert.equal(names('StarterGui').includes('AdminPanel'), false);
  assert.equal(names('Workspace').includes('EventIsland'), false);
});

test('build_game: the core\'s map replaces a new place\'s template, and service properties are applied where the design says', async () => {
  const f = studio();
  await built(f);
  const [lighting, material, , , , world] = imports(f);
  assert.equal(world.replace, true, 'a new place\'s baseplate and spawn are replaced by the core\'s map');
  assert.equal(world.applyServiceProperties, true);
  assert.equal(world.onlyMissing, undefined);
  assert.equal(lighting.applyServiceProperties, true); assert.equal(lighting.replace, true, 'and so is the template\'s lighting');
  assert.equal(material.applyServiceProperties, false, 'the design\'s flag is absent: nothing is applied'); assert.equal(material.onlyMissing, true, 'the design\'s own flag is kept');
  assert.equal(f.world.nodes.has('game.Workspace.Baseplate'), false, 'the template baseplate is gone');
  const others = imports(f).slice(2, 5);
  assert.ok(others.every((o) => o.replace === undefined && o.onlyMissing === true), 'the rest add what is missing and never duplicate');
});

test('build_game: the cleanup list and the screens the design removes are gone (also ones that were never imported); a kept screen is never deleted', async () => {
  const f = studio();
  const { data } = await built(f);
  assert.deepEqual(f.world.kids('game.StarterGui').map((n) => n.name).sort(), ['HUD', 'Loading', 'Shop']);
  assert.ok(f.ops('delete_instances').some((o) => o.paths[0] === 'game.StarterGui.EventBanner'));
  assert.equal(f.world.nodes.has('game.ReplicatedStorage.Config.PackRegistry'), false, 'a cleanup path is deleted');
  assert.equal(f.world.nodes.has('game.ReplicatedStorage.Config.Plants'), true, 'and the rest of its folder stays');
  assert.equal(data.screensStillThere.includes('/StarterGui/HUD'), true, 'a keep-listed screen is refused, and said');
  assert.equal(f.world.nodes.has('game.StarterGui.HUD'), true);
});

test('build_game: what the design hides stays in the place, out of sight: a button made invisible, a whole screen switched off', async () => {
  const d = design();
  const f = studio({ route: { design: designRoute({ screens: { ...d.screens, hide: [{ path: '/StarterGui/HUD/ShopButton', why: 'its button opens a Robux shop' }, { path: '/StarterGui/Loading', why: 'the code still looks for it' }, { path: '/StarterGui/Gone', why: 'never imported' }] } }) } });
  await built(f);
  assert.equal(f.world.nodes.get('game.StarterGui.HUD.ShopButton').props.Visible.v, false, 'the button is still there for the code, but hidden');
  assert.equal(f.world.nodes.get('game.StarterGui.Loading').props.Enabled.v, false, 'a ScreenGui is switched off');
  assert.equal(f.world.nodes.get('game.StarterGui.HUD.ShopButton').attrs.AppleHidden, true, 'and tagged, so a check knows no player reaches it');
  assert.equal(f.ops('delete_instances').some((o) => /ShopButton|Loading/.test(o.paths[0])), false, 'nothing hidden is deleted');
});

test('build_game: the content the design chose is made so in the code: exact edits, each script written whole once; an edit that finds nothing or would not parse is not applied', async () => {
  const src = 'local list = {\n\tBanana = {Rarity = "Rare"},\n\tKiwi = {Rarity = "Rare"},\n\tShark = {Rarity = "Rare"},\n}\nreturn list;';
  const importWith = (op) => {
    const r = importOf(op);
    if (op.gameId === CORE && op.path.startsWith('/ReplicatedStorage')) r.roots[0].scripts = [{ name: 'Creatures', class: 'ModuleScript', source: src }, { name: 'Rebirths', class: 'ModuleScript', source: 'return {Shark = 1}' }];
    return r;
  };
  const d = design();
  const f = studio({ importOf: importWith, route: { design: designRoute({ content: { ...d.content, tables: [], chosen: { keep: ['Banana', 'Kiwi'], left: 1, why: 'only the creatures that fit spawn' }, patches: [
    { path: '/ReplicatedStorage/Config/Creatures', why: 'only the fruit spawn', edits: [{ find: 'return list;', replace: 'for name, e in list do\n\tif name == "Shark" then e.DontSpawn = true end\nend\nreturn list;' }] },
    { path: '/ReplicatedStorage/Config/Rebirths', why: 'asks for a fruit', edits: [{ find: 'Shark = 1', replace: '["Banana"] = 1', all: true }] },
    { path: '/ReplicatedStorage/Config/Creatures', why: 'not there', edits: [{ find: 'Octopus = {', replace: 'x' }] },
    { path: '/ReplicatedStorage/Config/Rebirths', why: 'breaks it', edits: [{ find: 'return {', replace: 'return {{' }] },
  ] } }) } });
  const { data } = await built(f);
  const source = (p) => f.world.nodes.get(p).source;
  assert.match(source('game.ReplicatedStorage.Config.Creatures'), /e\.DontSpawn = true end\nend\nreturn list;$/);
  assert.equal(source('game.ReplicatedStorage.Config.Rebirths'), 'return {["Banana"] = 1}', 'the second edit of the same script found nothing to parse, so the first stands alone');
  assert.equal(f.ops('edit_script').length, 2, 'each script is written once per patch that applies');
  assert.deepEqual(data.editsNotApplied.map((e) => e.path), ['game.ReplicatedStorage.Config.Creatures', 'game.ReplicatedStorage.Config.Rebirths']);
  assert.match(data.contentChosen, /Banana, Kiwi\. This is done; do not rename/);
  assert.match(data.forUser, /Only the 2 characters that fit the theme appear, the rest never show up\./);

  assert.equal(jargon.test(data.forUser), false, data.forUser);
});

test('build_game: when the build did everything itself, the model is told to check the game and answer, not to theme or rewrite anything', async () => {
  const d = design();
  const f = studio({ route: { design: designRoute({ content: { ...d.content, tables: [], models: [], chosen: { keep: ['Banana'], left: 3, why: 'only the fruit spawn' }, patches: [] },
    leaveOut: d.leaveOut.map((l) => ({ ...l, edits: [] })), keepEdits: [], write: [], screens: { ...d.screens, fixTexts: [] }, branding: [] }) } });
  const { data } = await built(f);
  assert.deepEqual(Object.keys(data.themeTheContent).filter((k) => /tables|themedModels|codeEdits|featuresToWrite|brokenReferences|textsStillToChange/.test(k) && data.themeTheContent[k].length), []);
  assert.match(data.note, /nothing is left to do on it/);
  assert.match(data.note, /Do not rename, re-theme or rewrite anything/);
  const busy = await built(studio());
  assert.match(busy.data.note, /theme the content/, 'a plan that leaves work says so');
});

test('build_game: a path that leads nowhere deletes nothing else, not even a look-alike elsewhere', async () => {
  const d = design();
  d.screens.remove = [{ path: '/StarterGui/Main/Effects', why: 'left out with its feature' }];
  const f = studio({ route: { design: () => ({ ok: true, data: d }) } });
  await plan(f);
  f.world.add('game.StarterGui.Other', { class: 'ScreenGui' }); f.world.add('game.StarterGui.Other.Effects', { class: 'Frame' });
  const before = f.world.nodes.size;
  await run(f, 'build_game', {});
  assert.ok(f.world.nodes.has('game.StarterGui.Other.Effects'), 'the look-alike stays');
  assert.equal(f.ops('delete_instances').filter((o) => o.paths[0].includes('Effects')).length, 1, 'one attempt, at the exact path');
  assert.ok(f.world.nodes.size >= before, 'nothing else went');
});

test('build_game: a kept screen inside a removed one stops the removal (the design keeps what it keeps)', async () => {
  const d = design();
  d.screens.keep = [{ path: '/StarterGui/Shop/Header', kit: 'k' }];
  d.screens.remove = [{ path: '/StarterGui/Shop', why: 'a mistake in the design' }];
  const f = studio({ route: { design: () => ({ ok: true, data: d }) } });
  const { data } = await built(f);
  assert.ok(f.world.nodes.has('game.StarterGui.Shop.Header'));
  assert.deepEqual(data.screensStillThere, ['/StarterGui/Shop']);
});

test('build_game: placeholder text, a wrong shop name, a blanked branding line and the source branding are replaced (Text only)', async () => {
  const f = studio();
  const { data } = await built(f);
  assert.equal(text(f, 'game.StarterGui.HUD.Coins'), '0', 'a fake number becomes the real start');
  assert.equal(text(f, 'game.StarterGui.HUD.Timer'), '0', 'a placeholder that is the whole text is replaced');
  assert.equal(text(f, 'game.StarterGui.Loading.Title'), 'Candy Grove', 'the placeholder becomes the title');
  assert.equal(text(f, 'game.StarterGui.Shop.Header'), 'Candy Shop', 'part of a longer text is replaced, the rest kept');
  assert.equal(text(f, 'game.StarterGui.Loading.Credit'), 'by the Candy Grove team', 'branding is fixed like any text');
  assert.equal(text(f, 'game.StarterGui.Loading.Join'), '', 'a text with no place in the new game is blanked');
  assert.ok(f.ops('set_props').filter((o) => o.props).every((o) => Object.keys(o.props).join() === 'Text' || o.path === 'game.Lighting' || o.path.startsWith('game.Lighting.')), 'only Text is written to the screens');
  assert.equal((data.themeTheContent.textsStillToChange ?? []).some((t) => t.now === 'Welcome to Gardenville'), false, 'a text that is on no screen and in no script is not there to change: it is not the model\'s work');
});

test('build_game: a short placeholder is only replaced when it is the whole text, never inside another text', async () => {
  const d = design();
  d.screens.fixTexts = [{ path: '/StarterGui/Loading/Title', now: '...', to: 'X' }];
  const f = studio({ route: { design: () => ({ ok: true, data: d }) } });
  await built(f);
  assert.equal(text(f, 'game.StarterGui.Loading.Title'), 'Loading...', 'a title that merely contains "..." is left');
  assert.equal(text(f, 'game.StarterGui.HUD.Timer'), 'X', 'the label whose whole text is "..." is found by its text');
});

test('build_game: a text in a script comes back with the script that holds it, never edited from here', async () => {
  const f = studio();
  await plan(f);
  f.world.add('game.StarterPlayer.StarterPlayerScripts.Greeter', { class: 'LocalScript', source: 'local msg = "Welcome to Gardenville"' });
  const { data } = await run(f, 'build_game', {});
  const byScript = data.themeTheContent.textsStillToChange.find((t) => t.now === 'GardenDev');
  assert.deepEqual(byScript.inScripts, ['game.ServerScriptService.GardenMain'], 'the design named the script');
  const found = data.themeTheContent.textsStillToChange.find((t) => t.now === 'Welcome to Gardenville');
  assert.deepEqual(found.inScripts, ['game.StarterPlayer.StarterPlayerScripts.Greeter'], 'and one only found by its text');
  assert.equal(f.ops('edit_script').length, 0, 'no script was rewritten');
});

test('build_game: the theme\'s lighting is set: the Lighting values (colours 0-255 as 0-1, unknown names dropped) and the one Atmosphere', async () => {
  const f = studio();
  const { data } = await built(f);
  const set = f.ops('set_props').find((o) => o.path === 'game.Lighting');
  assert.deepEqual(Object.keys(set.props).sort(), ['Ambient', 'Brightness', 'ExposureCompensation']);
  assert.deepEqual(set.props.Brightness, { t: 'number', v: 3 });
  assert.deepEqual(set.props.Ambient, { t: 'Color3', v: [1, 0.8, 0.4] });
  const made = f.ops('create_instances').find((o) => o.items[0].className === 'Atmosphere');
  assert.deepEqual(made.items[0].parent, 'game.Lighting'); assert.deepEqual(made.items[0].props.Density, { t: 'number', v: 0.22 });
  assert.match(data.forUser, /The sky and lighting were set to fit the theme/);
  // an Atmosphere the core brought is set, not doubled
  const has = studio({ importOf: (op) => (op.path === '/Lighting' ? { roots: [{ name: 'Atmosphere', class: 'Atmosphere' }] } : importOf(op)) });
  await built(has);
  assert.equal(has.ops('create_instances').some((o) => o.items[0].className === 'Atmosphere'), false);
  assert.ok(has.ops('set_props').some((o) => o.path === 'game.Lighting.Atmosphere'));
});

test('build_game: an added region is moved by the design\'s offset, rests on the ground and overlaps nothing', async () => {
  const f = studio();
  const { data } = await built(f);
  const fountain = f.world.nodes.get('game.Workspace.Fountain');
  assert.ok(fountain, 'the region is in the world');
  assert.equal(fountain.center[0], 450, 'moved by the offset from where it arrived (300)');
  assert.equal(fountain.center[1] - fountain.size[1] / 2, 0, 'its bottom rests on the ground');
  assert.match(data.forUser, /One extra landmark stands beside the play area/);
  assert.equal(data.couldNotAdd.length, 0);
});

test('build_game: a region whose planned spot is taken looks for open ground; one with no room is deleted, not left inside something', async () => {
  const blocked = studio({ walls: [{ center: [450, 5, 300], size: [40, 40, 40] }] });
  await built(blocked);
  const spot = blocked.world.nodes.get('game.Workspace.Fountain');
  assert.ok(spot, 'it found another place');
  assert.notEqual(spot.center[0], 450);
  assert.ok([0, 1].includes(spot.center[1] - spot.size[1] / 2), 'resting on the ground or on the garden floor');
  const wall = { center: [450, 5, 300], size: [40, 40, 40] };
  assert.ok(Math.abs(spot.center[0] - wall.center[0]) >= 25 || Math.abs(spot.center[2] - wall.center[2]) >= 25, 'and stands clear of the wall');
  // no ground anywhere near: walls all round
  const walls = Array.from({ length: 40 }, (_, i) => ({ center: [Math.cos(i) * 40, 20, Math.sin(i) * 40], size: [1000, 60, 1000] }));
  const jammed = studio({ walls });
  const { data } = await built(jammed);
  assert.equal(jammed.world.nodes.has('game.Workspace.Fountain'), false, 'deleted');
  assert.match(data.forUser, /found no free ground and was left out/);
});

test('build_game: a map with no spawn gets one on the ground where the play area is', async () => {
  const noSpawn = (op) => (op.path.startsWith('/Workspace@except') ? { roots: [{ name: 'Garden', class: 'Model', center: [0, 0.5, 0], size: [80, 1, 80] }] } : importOf(op));
  const f = studio({ importOf: noSpawn });
  const { data } = await built(f);
  assert.equal(f.world.nodes.has('game.Workspace.SpawnLocation'), true);
  assert.match(data.forUser, /A spawn pad was added/);
});

test('build_game: the model may change the title and the currency name only; a new title is in every text that carried the old one', async () => {
  const f = studio();
  await plan(f);
  const { data } = await run(f, 'build_game', { design: { title: 'Sweet Sprout', currency: 'Gumdrops', core: { gameId: gid(99) }, import: [] } });
  assert.equal(data.title, 'Sweet Sprout');
  assert.equal(text(f, 'game.StarterGui.Loading.Title'), 'Sweet Sprout');
  assert.equal(text(f, 'game.StarterGui.Loading.Credit'), 'by the Sweet Sprout team');
  assert.equal(data.themeTheContent.currency.name, 'Gumdrops');
  assert.equal(imports(f).some((o) => o.gameId === gid(99)), false, 'parts and games are not the model\'s to change');
});

test('build_game: a service\'s own attributes (the save key every player\'s data is named by) come over, and one that held the old game\'s name holds the new title', async () => {
  const f = studio({ route: { design: designRoute({ serviceAttributes: [
    { path: '/Workspace', attributes: { DataKey: 'Data1', ServerLuck: 1, Testing: false, GameName: 'Candy Grove' }, title: ['GameName'] },
    { path: 'not a service', attributes: { X: 1 } }, { path: '/ReplicatedStorage', attributes: { Bad: { nested: true } } },
  ] }) } });
  await plan(f);
  await run(f, 'build_game', { design: { title: 'Sweet Sprout' } });
  const sets = f.ops('set_props').filter((o) => o.attributes);
  assert.deepEqual(sets.map((o) => o.path), ['game.Workspace'], 'only a service, only with values a script can read');
  assert.deepEqual(sets[0].attributes, { DataKey: { t: 'string', v: 'Data1' }, ServerLuck: { t: 'number', v: 1 }, Testing: { t: 'bool', v: false }, GameName: { t: 'string', v: 'Sweet Sprout' } });
  assert.ok(f.log.findIndex((o) => o.op === 'set_props' && o.attributes) > f.log.findIndex((o) => o.op === 'import_owner_library'), 'after the imports');
});

test('build_game: hands the model the content checklist (theme, modules, formats, counts, models, code edits, currency) and the walkthrough, with the request for judge_game', async () => {
  const f = studio();
  const { out, data } = await built(f);
  const c = data.themeTheContent;
  assert.equal(c.request, REQUEST);
  assert.deepEqual(c.theme.nameIdeas, ['Bonbon Tree', 'Fudge Sprout', 'Licorice Vine']);
  assert.equal(c.theme.mood, 'bright pastel sweets world');
  assert.equal(c.tables.length, 1);
  assert.equal(c.tables[0].module, 'game.ReplicatedStorage.Config.Plants', 'the library path is the Studio path the module has now');
  assert.equal(c.tables[0].entries, 12);
  assert.match(c.tables[0].format, /price/); assert.match(c.tables[0].sample, /Carrot/); assert.match(c.tables[0].howToAdd, /one key per plant/); assert.match(c.tables[0].what, /Per-plant prices/);
  assert.equal(c.tables[0].exists, undefined, 'a module that is there is not flagged');
  assert.deepEqual(c.themedModels, [{ category: 'plant', name: 'Candy Tree', fits: 'a Model with a Trunk and a Leaves part, like the core plants', import: { gameId: DECO, path: '/Workspace/CandyTree', mode: 'self' } }]);
  assert.deepEqual(c.codeEdits, [
    { feature: 'Pets', file: 'game.ServerScriptService.GardenMain', change: 'remove the PetService require and the pet bonus in Sell' },
    { feature: 'Pets', change: 'Replace the pet products with the new game\'s own.' },
  ]);
  assert.deepEqual(c.currency, { name: 'Sugar Coins', was: 'Money', shownAs: '$299,999 in the HUD', places: ['game.StarterGui.HUD.Coins'], how: 'Show the new name wherever the old one is written.' });
  assert.deepEqual(c.walkthrough, design().walkthrough);
  assert.deepEqual(c.warnings, design().warnings);
  assert.deepEqual(c.checks, ['Play it once and read the output: no red errors.'], 'what build_game already did is not asked of the model again');
  assert.match(data.note, /judge_game \{request: themeTheContent\.request\}/);
  assert.match(data.note, /at most three rounds/);
  assert.ok(out.resultForLlm.length < 12000, `the result stays well inside the limit (${out.resultForLlm.length})`);
});

test('build_game: hands the model what only it can do, whole: the calls to answer, the edits a kept feature needs, the notes to keep, and how many items to cut to', async () => {
  const d = design();
  const calls = Array.from({ length: 30 }, (_, i) => `Remote${i + 1}Event`);
  d.write = [{ feature: 'the server side of the core', how: 'The saved game has no working server code. Write server scripts that answer what the client already calls.', remotes: calls, uses: { currency: 'Sugar Coins', data: '/ReplicatedStorage/Config/Plants' }, reference: [{ gameId: gid(30), game: 'Other Game', feature: 'Server data', read: ['/ServerScriptService/Data'] }] }];
  d.keepEdits = [{ feature: 'Tutorial / onboarding', change: 'default SeenTutorial=true in templateData (spawning is gated on it)' }];
  d.themeNotes = ['Rebirth: keep Requirements keys equal to Assets/Brainrots names.'];
  d.content.tables = [{ ...d.content.tables[0], entries: 8, was: 20, format: 'F'.repeat(300), howToAdd: 'H'.repeat(410) }];
  const f = studio({ route: { design: () => ({ ok: true, data: d }) } });
  const { data } = await built(f);
  const c = data.themeTheContent;
  const [task] = c.featuresToWrite;
  assert.match(task, /Remote30Event\. Pay in Sugar Coins\. Keep the player data where game\.ReplicatedStorage\.Config\.Plants keeps it\. Other saved games do something like it: Other Game Server data /, 'every call the kept screens make is there, none cut off');
  assert.equal(task.startsWith('the server side of the core. The saved game has no working server code.'), true);
  assert.deepEqual(c.codeEdits[0], { feature: 'Tutorial / onboarding', change: 'default SeenTutorial=true in templateData (spawning is gated on it)' }, 'an edit a kept feature needs comes first');
  assert.equal(c.codeEdits.length, 3);
  assert.deepEqual(c.keepInMind, ['Rebirth: keep Requirements keys equal to Assets/Brainrots names.']);
  assert.equal(c.tables[0].entries, 8); assert.equal(c.tables[0].has, 20); assert.equal(c.tables[0].cutTo, 8, 'a module with more items than the game keeps says so');
  assert.equal(c.tables[0].format.length, 300); assert.equal(c.tables[0].howToAdd.length, 410, 'the design\'s own texts come whole');
  assert.match(data.note, /keepInMind/);
  // The model may rename the currency: what it is told to pay in follows.
  const g = studio({ route: { design: () => ({ ok: true, data: d }) } });
  await plan(g);
  const renamed = await run(g, 'build_game', { design: { currency: 'Gumdrops' } });
  assert.match(renamed.data.themeTheContent.featuresToWrite[0], /Pay in Gumdrops\./);
});

test('build_game: a core whose map is kept in a container of its own still replaces a new place\'s template', async () => {
  const d = design();
  for (const p of d.import) if (p.path.startsWith('/Workspace') || p.path === '/Lighting') p.path = '/GameModules' + p.path;
  const f = studio({ route: { design: () => ({ ok: true, data: d }) }, importOf: (op) => importOf({ ...op, path: op.path.replace('/GameModules', '') }) });
  await built(f);
  const world = imports(f).find((o) => o.path.startsWith('/GameModules/Workspace'));
  assert.equal(world.replace, true, 'the template baseplate would otherwise stay under the map and hide the core\'s own by name');
  assert.equal(world.applyServiceProperties, true); assert.equal(world.onlyMissing, undefined);
  const lighting = imports(f).find((o) => o.path === '/GameModules/Lighting');
  assert.equal(lighting.replace, true); assert.equal(lighting.applyServiceProperties, true);
  assert.equal(f.world.nodes.has('game.Workspace.Baseplate'), false);
});

test('build_game: a part of the plan that could not be read is said as a part missing, not skipped in silence', async () => {
  const d = design();
  d.import.push({ gameId: CORE, path: '/A'.repeat(600), mode: 'children', parent: 'game.Workspace', what: 'x' });
  const f = studio({ route: { design: () => ({ ok: true, data: d }) } });
  const { data } = await built(f);
  assert.deepEqual(data.couldNotAdd, ['a part of the game']);
  assert.match(data.forUser, /a part of the game could not be added, so the game is missing that\./);
});

test('build_game: scripts that can call the internet are said in a few, with how many more there are', async () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ path: `Plant${i}`, pattern: 'HttpService' }));
  const f = studio({ importOf: (op) => (op.gameId === CORE && op.path.startsWith('/Workspace') ? { ...importOf(op), suspicious: many } : importOf(op)) });
  const { data } = await built(f);
  assert.equal(data.suspicious.length, 8);
  assert.equal(data.suspiciousMore, 22);
});

test('build_game: kept code that still names a part the plan left out is handed to the model line by line (a comment, a name still in the place, a longer name are not)', async () => {
  const f = studio();
  await plan(f);
  f.world.add('game.StarterPlayer.StarterPlayerScripts.Client', { class: 'LocalScript', source: 'local em = require(ReplicatedStorage:WaitForChild("EventManager"))' });
  f.world.add('game.StarterPlayer.StarterPlayerScripts.Notes', { class: 'LocalScript', source: '-- old: require(ReplicatedStorage.AdminCommands)' });
  f.world.add('game.StarterPlayer.StarterPlayerScripts.Other', { class: 'LocalScript', source: 'local h = ReplicatedStorage.HalloweenEvent.Banner; local c = Cmds.AdminCommandsList' });
  f.world.add('game.Workspace.HalloweenEvent', { class: 'Model' });
  const { data } = await run(f, 'build_game', {});
  assert.deepEqual(data.themeTheContent.brokenReferences, [{ script: 'game.StarterPlayer.StarterPlayerScripts.Client', line: 1, text: 'local em = require(ReplicatedStorage:WaitForChild("EventManager"))', missing: 'EventManager' }]);
  assert.match(data.note, /brokenReferences/);
  assert.equal(f.ops('edit_script').length, 0, 'the model edits the scripts, not the build');
  const quiet = studio();
  const q = await built(quiet);
  assert.equal(q.data.themeTheContent.brokenReferences, undefined, 'nothing kept names anything left out: nothing is listed');
});

test('build_game: a content module that is not where the design says is flagged, with a look-alike found by name', async () => {
  const d = design();
  d.content.tables[0].path = '/ReplicatedStorage/Settings/Plants';
  const f = studio({ route: { design: () => ({ ok: true, data: d }) } });
  const { data } = await built(f);
  assert.equal(data.themeTheContent.tables[0].exists, false);
  assert.deepEqual(data.themeTheContent.tables[0].maybeAt, ['game.ReplicatedStorage.Config.Plants']);
});

test('build_game: what the user reads is plain: no tool names, paths, ids or counts', async () => {
  const f = studio();
  const { data, out } = await built(f);
  assert.equal(jargon.test(data.forUser), false, data.forUser);
  assert.equal(/\d/.test(data.forUser), false, data.forUser);
  assert.equal(jargon.test(out.summary), false, out.summary);
  assert.match(data.forUser, /^Candy Grove is a grow garden game: buy seeds, plant them on your own plot, harvest and sell\. It is set in a candy world\. It is ready in your place\./, 'the title is not said twice');
  assert.match(data.forUser, /without Halloween event and Pets, which do not belong in it/);
  const technical = design();
  technical.leaveOut = [{ feature: 'Server events framework and ~70 event scripts', why: 'x', edits: [] }, { feature: 'Debug NoClip', why: 'x', edits: [] }, { feature: 'Lucky blocks (a gamble)', why: 'x', edits: [] }];
  const g = studio({ route: { design: () => ({ ok: true, data: { ...technical, pitch: 'A sweet garden.' } }) } });
  const t = await built(g);
  assert.match(t.data.forUser, /^Candy Grove is ready in your place\. A sweet garden\. It was built from a working game of its kind, without Lucky blocks, which do not belong in it\./, 'only what a client can read is said');
});

test('build_game: a part that fails is left out and said, the rest is built; no core piece at all is an error and nothing is claimed', async () => {
  const f = studio({ importOf: (op) => (op.path.startsWith('/ReplicatedStorage') ? { error: 'path not found: /ReplicatedStorage' } : importOf(op)) });
  const { data } = await built(f);
  assert.deepEqual(data.couldNotAdd, ['the shared settings']);
  assert.match(data.forUser, /the shared settings could not be added, so the game is missing that/);
  const dead = studio({ importOf: () => ({ error: 'path not found' }) });
  const bad = await built(dead);
  assert.equal(bad.out.ok, false); assert.match(bad.data.error, /could not build a game/);
  assert.equal(bad.out.mutatedProject, undefined);
});

test('build_game: Studio going away stops the build and says so; nothing later is attempted', async () => {
  let seen = 0;
  const f = studio({ fail: (op) => (op.op === 'import_owner_library' && ++seen === 3 ? { ok: false, error: 'plugin gone', failure: 'transport' } : null) });
  const { data } = await built(f);
  assert.match(data.forUser, /Roblox Studio stopped answering part-way/);
  assert.equal(imports(f).length, 3, 'no fourth import was tried');
  assert.equal(f.ops('delete_instances').length, 0, 'and nothing was deleted after Studio went');
  assert.equal(f.ops('set_props').filter((o) => o.props).length, 0, 'and no text or light was written');
});

test('build_game: a second build adds nothing twice (what the design removes is brought and removed again, nothing else)', async () => {
  const f = studio();
  await built(f);
  const before = f.world.nodes.size;
  await plan(f); // the first plan was spent by the build: a second build needs a plan of its own
  await run(f, 'build_game', {});
  assert.deepEqual(f.world.kids('game.StarterGui').map((n) => n.name).sort(), ['HUD', 'Loading', 'Shop']);
  assert.equal(f.world.kids('game.ServerScriptService').length, 1);
  assert.ok(f.world.nodes.size <= before + 2, `${f.world.nodes.size} nodes after, ${before} before`);
});

test('build_game: when everything in the plan is already in the place it says so and changes nothing', async () => {
  const d = design();
  d.screens.remove = []; d.cleanup = []; d.world.add = [];
  const f = studio({ route: { design: () => ({ ok: true, data: d }) } });
  await built(f);
  await plan(f);
  const again = await run(f, 'build_game', {});
  assert.equal(again.out.ok, true); assert.equal(again.data.changed, false); assert.equal(again.out.mutatedProject, undefined);
  assert.match(again.data.forUser, /Candy Grove was already in your game, so nothing changed/);
});

test('build_game: a plan is used only by the call that names its planId; a whole design is accepted; an old or spent plan is not', async () => {
  const fresh = studio();
  const G2 = await import(pathToFileURL(join(dir, 'plan.mjs')).href + '?fresh');   // another module instance: its own memory
  const none = await G2.buildGame(fresh.ctx, {});
  assert.match(none.error, /no saved plan under that planId/);
  const whole = await G2.buildGame(fresh.ctx, { design: design() });
  assert.equal(whole.built, true);
  const half = await G2.buildGame(studio().ctx, { design: { core: { gameId: 'x' } } });
  assert.match(half.error, /Call plan_game again/);
  const store = studio();
  store.ctx.plannedGame = { load: async () => ({ design: G.readDesign(design()), request: REQUEST, seed: 1, at: Date.now() - 4 * 3600_000, planId: 'old1' }), save: async () => {} };
  assert.match((await G.buildGame(store.ctx, { planId: 'old1' })).error, /no saved plan under that planId/, 'a plan from hours ago is another conversation\'s');
  // A plan nobody names is nobody's: the saved plan is not used by a build that does not pass its id, nor by one that passes another.
  const named = studio();
  const planned = await plan(named);
  assert.ok(/^[0-9a-f]{8}$/.test(planned.data.planId), 'plan_game returns the id to build with');
  const asked = (args) => run(named, 'build_game', { planId: undefined, ...args }).then((r) => r.data);
  assert.match((await asked({})).error, /no saved plan under that planId/);
  assert.match((await asked({ planId: 'wrong' })).error, /no saved plan under that planId/);
  assert.equal((await asked({ planId: planned.data.planId })).built, true);
  // Spent: a successful build clears it, so the same id cannot rebuild from it.
  assert.match((await asked({ planId: planned.data.planId })).error, /no saved plan under that planId/);
});

test('plan_game: there is no shared slot: a context with neither a project nor a store keeps nothing and says so; two projects do not see each other\'s plan', async () => {
  const nowhere = studio();
  delete nowhere.ctx.projectId;
  assert.match((await plan(nowhere)).data.error, /no project to keep the plan in/);
  const a = studio(), b = studio();
  b.ctx.projectId = 'project-2';
  const pa = await plan(a);
  assert.match((await run(b, 'build_game', { planId: pa.data.planId })).data.error, /no saved plan under that planId/, 'project 2 cannot build from project 1\'s plan, even with its id');
  const code = readFileSync('src/game-plan.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/\?\? '-'/.test(code), false, 'the shared "-" key is gone');
});

test('plan_game: the plan is cleared when the place is restored (the session deletes plannedGame with the ledger)', () => {
  const session = readFileSync('src/do/session.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const restore = session.slice(session.indexOf('async restoreCheckpoint('));
  assert.ok(restore.indexOf("storage.delete('plannedGame')") > restore.indexOf("op: 'restore'"));
  assert.match(session, /clear: \(\) => this\.ctx\.storage\.delete\('plannedGame'\)/);
});

test('build_game: the plan is kept in the session\'s store when there is one (the run rebuilds its context every step)', async () => {
  const saved = [];
  const f = studio();
  f.ctx.plannedGame = { load: async () => saved.at(-1), save: async (v) => { saved.push(v); } };
  await plan(f);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].design.title, 'Candy Grove');
  assert.ok(JSON.stringify(saved[0]).length < 60_000);
  const { data } = await run(f, 'build_game', {});
  assert.equal(data.built, true);
});

test('readDesign: the shapes the library really writes (objects for theme, currency and screens.keep; a cleanup list; entry flags; blank replacement texts)', () => {
  const d = G.readDesign(design());
  assert.equal(d.theme, 'candy'); assert.equal(d.look.lighting.sky, 'a soft pink and lilac sky'); assert.deepEqual(d.look.lighting.properties, { Brightness: 3, Ambient: [255, 204, 102], ExposureCompensation: 0.2, Bogus: 5 });
  assert.equal(d.currency.name, 'Sugar Coins');
  assert.deepEqual(d.screensKeep, ['/StarterGui/HUD', '/StarterGui/Shop']);
  assert.deepEqual(d.cleanup, ['/ReplicatedStorage/Config/PackRegistry', '/ReplicatedStorage/Config/Missing']);
  assert.equal(d.imports[0].apply, true); assert.equal(d.imports[1].onlyMissing, true); assert.equal(d.imports[2].apply, undefined);
  assert.deepEqual(d.add[0].offset, [150, 0, 0]);
  assert.equal(d.branding[2].to, '', 'a blank replacement is kept');
  assert.equal(d.leaveOut[1].edits[1].path, '', 'an edit with no file');
  const plain = G.readDesign({ ...design(), theme: 'space', content: { ...design().content, currency: 'Stars' } });
  assert.equal(plain.theme, 'space'); assert.equal(plain.currency.name, 'Stars'); assert.equal(plain.look.lighting, undefined);
  assert.equal(G.readDesign({ ...design(), import: [{ gameId: CORE, path: '/A'.repeat(600), mode: 'children' }] }).error, 'The plan for this game came back with nothing to bring in.', 'a path over the limit the plugin takes is dropped');
});

// ------------------------------------------------------------------------------------------------- the flow

test('the flow: plan_game, build_game and judge_game are the agent\'s tools; assemble_owner_game is no longer offered', () => {
  const names = T.toolNames();
  for (const n of ['plan_game', 'build_game', 'judge_game', 'install_owner_system', 'recreate_owner_game', 'browse_owner_library', 'import_owner_library', 'read_script', 'edit_script']) assert.ok(names.includes(n), n);
  assert.equal(names.includes('assemble_owner_game'), false);
  const defs = Object.fromEntries(T.toolDefs(true).map((d) => [d.name, d]));
  assert.match(defs.build_game.description, /judge_game/);
  assert.match(defs.build_game.description, /at most three rounds/);
  assert.match(defs.plan_game.description, /build_game/);
  assert.match(defs.plan_game.description, /compose_game/, 'a new idea goes to the composer');
  // RESTATED 2026-10-04 (t1 round 2): the composer's definition says it builds the BASE of a game, not the whole game.
  assert.match(defs.compose_game.description, /BASE of a NEW game/);
  const prompts = readFileSync('src/prompts.ts', 'utf8');
  assert.match(prompts, /compose_game \(you pick the template[\s\S]{0,500}judge_game \{request\}[\s\S]{0,120}at most three rounds/);
  assert.equal(/assemble_owner_game/.test(prompts), false);
});

test('the flow: the tools are registered where the product lists them (permissions, phases, the web table, the MCP exclusions)', () => {
  assert.ok(S.GOVERNED_TOOLS.some((g) => g.name === 'build_game' && g.group === 'changes'));
  assert.equal(S.GOVERNED_TOOLS.some((g) => g.name === 'assemble_owner_game'), false);
  assert.equal(S.phaseForTool('plan_game'), 'planning');
  assert.equal(S.phaseForTool('build_game'), 'building');
  assert.ok(S.GOVERNED_TOOLS.some((g) => g.name === 'compose_game' && g.group === 'changes'));
  assert.equal(S.phaseForTool('compose_game'), 'building');
  assert.deepEqual(T.projectMutatingToolNames().filter((n) => /_game$/.test(n)).sort(), ['build_game', 'compose_game', 'recreate_owner_game']);
});

test('the flow: a design path resolves the way the imports put things (children go straight in, a self import keeps its name, odd names are bracketed)', () => {
  const imports = [
    { path: '/StarterGui@except(PetsUI)', mode: 'children', parent: 'game.StarterGui' },
    { path: '/Workspace/Farm Stand#2', mode: 'self', parent: 'game.Workspace' },
    { path: '/ServerScriptService', mode: 'children', parent: 'game.ServerScriptService' },
  ];
  assert.equal(G.toStudio(imports, '/StarterGui/Shop/Header'), 'game.StarterGui.Shop.Header');
  assert.equal(G.toStudio(imports, '/StarterGui/Shop Gui/Buy Button'), 'game.StarterGui["Shop Gui"]["Buy Button"]');
  assert.equal(G.toStudio(imports, '/Workspace/Farm Stand#2/Sign'), 'game.Workspace["Farm Stand"].Sign');
  assert.equal(G.toStudio(imports, '/GameModules/ReplicatedStorage/Config'), 'game.ReplicatedStorage.Config', 'a model file\'s wrapper folder is skipped');
  assert.equal(G.toStudio(imports, 'game.StarterGui.HUD'), 'game.StarterGui.HUD');
  assert.equal(G.toStudio(imports, '/StarterGui/Meshes%2FWave/Label'), 'game.StarterGui["Meshes/Wave"].Label', 'a slash inside a name is written %2F in a library path');
  assert.equal(G.toStudio(imports, '/Nowhere/Anything'), undefined);
  assert.equal(G.basePath('/Workspace@box(1,2,3,4,5,6)'), '/Workspace');
  assert.equal(G.basePath('/ReplicatedStorage@except(A,B)'), '/ReplicatedStorage');
});

test('build_game: the original creator\'s private sounds are silenced in Studio after the build (names kept), so no play fills the Output with "not authorized"', async () => {
  const f = studio({ fail: (op) => (op.op === 'run_code' ? { ok: true, data: { result: { t: 'string', v: 'silence 12 3 7' }, prints: [] } } : null) });
  const { data } = await built(f);
  const code = f.ops('run_code');
  assert.equal(code.length, 1);
  assert.match(code[0].code, /PreloadAsync/);
  assert.match(code[0].code, /AssetFetchStatus\.Failure/);
  assert.match(code[0].code, /SetAttribute\("AppleSilenced"/);
  assert.doesNotMatch(code[0].code, /HttpService|:Destroy\(|\.Name\s*=/, 'nothing deleted or renamed, nothing the plugin guards');
  assert.match(data.privateSounds, /^7 sounds .* silenced \(names kept\)/);
  const quiet = await built(studio());
  assert.equal(quiet.data.privateSounds, undefined, 'a Studio that cannot tell says nothing');
});
