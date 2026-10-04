/**
 * The composer builds a NEW game from components: never a whole world (owner, 2026-09-30). These tests hold it to
 * that, and to a map that works: plots beside the lane (every tile in a defender's reach, none on the lane), props
 * off the lane, config modules that compile, component scripts the plugin will write.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'compose-')), 'c.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'compose-lane.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const R = await import(`file://${out}`);
const C = await import(`file://${out.replace('c.mjs', 'c2.mjs')}`).catch(async () => {
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [join(WORKER, 'src', 'compose.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out.replace('c.mjs', 'c2.mjs')],
    { cwd: WORKER, stdio: 'pipe' });
  return import(`file://${out.replace('c.mjs', 'c2.mjs')}`);
});

// The recipe is the agent's own `laneDefense` argument (every piece a library { gameId, path } it chose): the harness holds no game.
const FIXTURE = JSON.parse(readFileSync(join(WORKER, 'tests', 'fixtures', 'lane-defense.json'), 'utf8'));
const read = R.readLaneDefense(FIXTURE, 20260930);
assert.ok(!('error' in read), JSON.stringify(read));
const recipe = read.recipe;
const steps = C.composeSteps(recipe);

test('compose: no step brings in a whole world, a map or a service', () => {
  const imports = steps.filter((s) => s.kind === 'import');
  assert.ok(imports.length > 10, 'the game is made of many pieces');
  for (const s of imports) {
    const parts = s.ref.path.split('/').filter(Boolean);
    assert.ok(parts.length >= 2, `${s.ref.path} is a whole service`);
    assert.doesNotMatch(s.ref.path, /^\/Workspace\/?$|\/Map$|\/Map\/?$/i, `${s.ref.path} is a whole map`);
  }
  const games = new Set(imports.map((s) => s.ref.game));
  assert.ok(games.size >= 8, `pieces come from many games (${games.size}), a real combination`);
});

test('compose: every plot tile is within a defender\'s reach of the lane and none is on it', () => {
  for (const seed of [1, 2, 3, 20260930, 99]) {
    const L = C.laneLayout(seed);
    for (const plot of L.plots) {
      for (const tile of C.plotTiles(plot)) {
        const d = C.laneDist(tile, L.lane);
        assert.ok(d > C.LANE_WIDTH / 2 + C.TILE / 2 - 0.01, `seed ${seed}: tile ${tile} sits on the lane (${d.toFixed(1)})`);
        assert.ok(d <= Math.min(...recipe.defenders.map((x) => x.range)), `seed ${seed}: tile ${tile} is out of reach of the shortest-range defender (${d.toFixed(1)})`);
      }
    }
    for (let i = 0; i < L.plots.length; i++) for (let j = i + 1; j < L.plots.length; j++) {
      const [a, b] = [L.plots[i], L.plots[j]];
      assert.ok(Math.abs(a[0] - b[0]) >= 18 || Math.abs(a[1] - b[1]) >= 18, `seed ${seed}: plots ${i} and ${j} overlap`);
    }
    for (const p of L.scatter) assert.ok(C.laneDist(p, L.lane) >= C.LANE_WIDTH / 2 + 6, 'props stay off the lane');
    assert.ok(L.scatter.length >= 40, 'room for props');
  }
});

test('compose: two seeds make two different maps', () => {
  const a = JSON.stringify(C.laneLayout(1).lane), b = JSON.stringify(C.laneLayout(2).lane);
  const c = JSON.stringify(C.laneLayout(5).lane);
  assert.ok(a !== b || a !== c);
});

test('compose: the config modules compile as Luau', { skip: (() => { try { execFileSync('luau-compile', ['--help'], { stdio: 'pipe' }); return false; } catch (e) { return e.status === undefined ? 'luau-compile is not on PATH' : false; } })() }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'cfg-'));
  for (const s of steps.filter((x) => x.kind === 'script' && /Config$/.test(x.name))) {
    const f = join(dir, `${s.name}.luau`);
    writeFileSync(f, s.source);
    execFileSync('luau-compile', ['--null', f], { stdio: 'pipe' });
  }
});

test('compose: every script is one the plugin will write', () => {
  const forbidden = ['loadstring', 'getfenv', 'setfenv', 'insertservice', 'assetservice', 'loadasset', 'getobjects', 'httpservice', 'requestasync', 'postasync', 'debug.'];
  const scripts = steps.filter((s) => s.kind === 'script');
  assert.ok(scripts.length >= 12);
  for (const s of scripts) {
    const lower = s.source.toLowerCase();
    for (const word of forbidden) assert.ok(!lower.includes(word), `${s.name} uses ${word}, which the plugin refuses`);
    assert.doesNotMatch(lower, /require%s*\(\s*[\d"']/);
    assert.ok(s.source.length < 240000);
  }
});

test('compose: every enemy is a body wearing a costume (or a model), as the agent said, and the config says so', () => {
  const cfg = steps.find((s) => s.name === 'AppleGameConfig').source;
  for (const e of recipe.enemies) {
    assert.ok(e.body && e.costume, `${e.name} is made from pieces`);
    const key = /^[A-Za-z_]\w*$/.test(e.name) ? e.name : `\\["${e.name}"\\]`;
    assert.match(cfg, new RegExp(`\\n\\t\\t${key} = \\{\\n\\t\\t\\tbody = "ServerStorage\\.AppleParts\\.Body\\d+",\\n\\t\\t\\tcostume = "ServerStorage\\.AppleParts\\.Costume\\d+"`));
  }
});

test('compose: the bundled components are the current sources', () => {
  execFileSync('node', [join(WORKER, '..', '..', 'scripts', 'gen-components.mjs'), '--check'], { stdio: 'pipe' });
});

const outT = join(mkdtempSync(join(tmpdir(), 'compose-tool-')), 't.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'compose-tool.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + outT, '--external:cloudflare:*'],
  { cwd: WORKER, stdio: 'pipe' });
const CT = await import(`file://${outT}`);
const outR = join(mkdtempSync(join(tmpdir(), 'compose-run-')), 'r.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'compose-run.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + outR, '--external:cloudflare:*'],
  { cwd: WORKER, stdio: 'pipe' });
const CR = await import(`file://${outR}`);

/** A Studio that says yes to everything and remembers what was created. */
function studio(init = {}) {
  const ops = [];
  const exists = new Set(init.exists ?? []);
  return {
    ops, exists,
    ctx: {
      env: {}, userId: 'u1', projectId: 'p1', studioConnected: () => true, createCheckpoint: async () => ({ id: 'cp' }), userRequest: () => init.request ?? '',
      execStudioOp: async (op) => {
        ops.push(op);
        const has = (path) => [...exists].some((e) => path === e || path.startsWith(`${e}.`));
        if (op.op === 'get_instance') return has(op.path) ? { ok: true, data: {} } : { ok: false, error: 'not found' };
        if (op.op === 'get_tree') return { ok: has(op.root), data: { root: { name: 'x', class: 'Folder', children: (init.components ?? []).map((name) => ({ name })) } } };
        if (op.op === 'create_instances') { for (const i of op.items) exists.add(`${i.parent}.${i.name}`); return { ok: true, data: {} }; }
        if (op.op === 'spatial_query') return { ok: true, data: { center: [0, 3, 0], size: [8, 6, 8], bottomY: 0 } };
        return { ok: true, data: { imported: 1, placed: [], failed: [] } };
      },
    },
  };
}
const TYCOON = { title: 'Fixture Works', currency: 'Credits', item: { name: 'Raw Stuff', color: '#8a6d52' }, dropper: 'Chute',
  machines: [{ name: 'Press', becomes: 'Pressed Stuff', color: '#dff3ff' }, { name: 'Oven', becomes: 'Baked Stuff', color: '#e8913a', times: 3 }], seller: { name: 'Counter' } };
const PLOTSIM = { title: 'Fixture Sim', subject: 'gadget', currency: 'Gems', machines: [
  { name: 'Small Gadget', price: 25, income: 1, look: { gameId: 'aabbccdd1122', path: '/Workspace/Gadget' } },
  { name: 'Big Gadget', price: 100, income: 4, look: { gameId: 'aabbccdd1122', path: '/Workspace/Gadget#2' } }],
  upgrades: [{ label: 'Faster', kind: 'perSecond', amount: 1, cost: 40 }] };

test('compose_game: no template named is a menu, not a refusal and not a guess from the request words', async () => {
  const { ctx, ops } = studio({ request: 'defend your garden from waves of vegetables' });
  const r = await CT.composeGame(ctx, { request: 'defend your garden from waves of vegetables' });
  assert.equal(r.changed, false);
  assert.equal(r.template, 'none');
  assert.deepEqual(r.templates.map((t) => t.template), ['tycoon', 'plot-sim', 'lane-defense']);
  for (const t of r.templates) { assert.ok(t.makes && t.cannot && t.needs, t.template); }
  assert.match(r.note, /build it with your other tools/);
  assert.equal(ops.length, 0, 'nothing touched the place');
  const unknown = await CT.composeGame(ctx, { request: 'x', template: 'racing' });
  assert.equal(unknown.template, 'none');
  assert.notEqual(CT.ideaSeed('defend your garden'), CT.ideaSeed('defend your farm'), 'a new idea gets a new map');
  assert.equal(CT.ideaSeed('Defend  your garden'), CT.ideaSeed('defend your garden'), 'the same idea gets the same map');
  assert.equal(CT.ideaRecipe, undefined, 'the request-word router is gone');
});

test('compose_game: a missing field is reported by name and nothing is built or filled from a template', async () => {
  const { ctx, ops } = studio();
  const r = await CT.composeGame(ctx, { request: 'x', template: 'tycoon', tycoon: { title: 'T', currency: 'C', item: { name: 'A' }, dropper: 'D', machines: [{ name: 'M' }], seller: {} } });
  assert.equal(r.changed, false);
  assert.ok(r.missing.includes('item.color (#rrggbb)'), JSON.stringify(r.missing));
  assert.ok(r.missing.includes('machines[0].becomes'));
  assert.ok(r.missing.includes('machines[0].color (#rrggbb)'));
  assert.ok(r.missing.includes('seller.name'));
  assert.match(r.error, /missing:/);
  assert.equal(ops.some((o) => o.op === 'create_instances' || o.op === 'edit_script'), false);
  const sim = await CT.composeGame(ctx, { request: 'x', template: 'plot-sim', plotSim: { title: 'S', subject: 's', currency: 'G', machines: [{ name: 'Only', price: 5 }] } });
  assert.ok(sim.missing.some((m) => /machines\[0\]\.income/.test(m)) && sim.missing.some((m) => /look/.test(m)), JSON.stringify(sim.missing));
  assert.ok(sim.missing.some((m) => /upgrades/.test(m)), 'upgrades are required: no default set');
  const lane = await CT.composeGame(ctx, { request: 'x', template: 'lane-defense', laneDefense: { title: 'L' } });
  assert.ok(lane.missing.includes('currency') && lane.missing.some((m) => /enemies/.test(m)) && lane.missing.some((m) => /base/.test(m)), JSON.stringify(lane.missing));
});

test('compose_game: a built place that already holds a composed game is reported, and the agent chooses extend or replace', async () => {
  const there = studio({ exists: ['game.Workspace.AppleMap', 'game.ServerScriptService.AppleComponents'], components: ['AppleEconomy', 'AppleUpgrades'] });
  const asked = await CT.composeGame(there.ctx, { request: 'x', template: 'tycoon', tycoon: TYCOON });
  assert.equal(asked.changed, false);
  assert.deepEqual(asked.existing, { map: true, components: ['AppleEconomy', 'AppleUpgrades'] });
  assert.match(asked.note, /extend.*replace/s);
  assert.equal(there.ops.some((o) => o.op === 'delete_instances' || o.op === 'create_instances'), false, 'nothing was deleted or built before the agent chose');
  const replaced = studio({ exists: ['game.Workspace.AppleMap', 'game.ServerScriptService.AppleComponents'] });
  const r = await CT.composeGame(replaced.ctx, { request: 'x', template: 'tycoon', existing: 'replace', tycoon: TYCOON });
  assert.ok(replaced.ops.some((o) => o.op === 'delete_instances' && o.paths.includes('game.Workspace.AppleMap')), 'the earlier game went, because the agent said replace');
  assert.ok(replaced.ops.some((o) => o.op === 'create_instances'), 'and the new one was built');
  assert.equal(r.template, 'tycoon', JSON.stringify(r).slice(0, 300));
});

test('compose_game: a tycoon is exactly what the agent said: its names, its chain, its currency, and no baseplate or lighting change unasked', async () => {
  const { ctx, ops } = studio();
  const r = await CT.composeGame(ctx, { request: 'x', template: 'tycoon', tycoon: { ...TYCOON, title: 'מפעל', currency: 'מטבעות', item: { name: 'חומר גלם', color: '#8a6d52' } } });
  assert.equal(r.template, 'tycoon');
  assert.deepEqual(r.chain, ['חומר גלם', 'Pressed Stuff', 'Baked Stuff']);
  assert.ok(r.economy.pads.length >= 3 && r.economy.pads.every((p) => p.secondsToAfford > 0), 'the economy curve is reported as information');
  const authored = (o) => o.op === 'edit_script' ? /Config$/.test(o.path) ? o.source : '' : o.op === 'create_instances' ? JSON.stringify(o.items.filter((i) => !/AppleCompon/.test(i.name))) : '';
  const text = ops.map(authored).join('\n');
  assert.ok(text.includes('חומר גלם') && text.includes('מטבעות'), 'the agent\'s own words are in what was written');
  for (const gone of ['Fabric', 'Cleaner', 'Polisher', 'Packer', 'Dirty', 'Laundry', '$']) assert.equal(text.includes(gone), false, `${gone} is back`);
  // RESTATED 2026-10-04 (owner's recording of round 2): the default SpawnLocation's star decal is removed and the spawn switched off,
  // nothing else of the default ground is touched; the Baseplate and the spawn itself are not deleted.
  assert.equal(ops.some((o) => o.op === 'delete_instances' && o.paths.some((p) => /Baseplate|SpawnLocation/.test(p) && !/^game\.Workspace\.SpawnLocation\.(Decal|Texture)$/.test(p))), false, 'the default ground was left (only the default spawn\'s decal goes)');
  assert.ok(ops.some((o) => o.op === 'set_props' && o.path === 'game.Workspace.SpawnLocation' && o.props.Enabled?.v === false), 'the default spawn is switched off');
  assert.equal(ops.some((o) => o.op === 'set_props' && o.path === 'game.Lighting'), false, 'lighting was left');
  assert.match(r.scene, /Baseplate was left as it was/);
  const cleared = studio();
  await CT.composeGame(cleared.ctx, { request: 'x', template: 'tycoon', clearDefaultGround: true, tycoon: TYCOON });
  assert.ok(cleared.ops.some((o) => o.op === 'delete_instances' && o.paths.includes('game.Workspace.Baseplate')), 'cleared when the agent asked');
});

test('compose_game: a plot simulator is its machines, upgrades and currency as given, with the economy checked and a short ladder said', async () => {
  const { ctx, ops } = studio();
  const r = await CT.composeGame(ctx, { request: 'x', template: 'plot-sim', plotSim: PLOTSIM });
  assert.equal(r.template, 'plot-sim', JSON.stringify(r).slice(0, 300));
  assert.deepEqual(r.economy.machines.map((m) => m.paybackSeconds), [25, 25]);
  assert.ok(r.notes.some((n) => /short ladder: 2 machines/.test(n)), JSON.stringify(r.notes));
  assert.ok(r.defaults.includes('players = 4') && r.defaults.some((d) => /rebirth/.test(d)), 'defaults are reported, not silent');
  const authored = (o) => o.op === 'edit_script' ? /Config$/.test(o.path) ? o.source : '' : o.op === 'create_instances' && o.items.some((i) => i.name === 'AppleHUD') ? JSON.stringify(o.items) : '';
  const text = ops.map(authored).join('\n');
  assert.ok(text.includes('Gems') && text.includes('Small Gadget') && text.includes('Faster'), 'the agent\'s own names are in the config and the screen');
  for (const gone of ['Classic', 'Ice ', 'Galaxy', 'Mega ', 'Ultra ', 'Royal ', 'Coins', 'Stronger Taps', 'Auto Tapper', '$']) assert.equal(text.includes(gone), false, `${gone} is back`);
  const hud = ops.find((o) => o.op === 'create_instances' && o.items.some((i) => i.name === 'AppleHUD')).items.find((i) => i.name === 'AppleHUD');
  assert.ok(hud.children.some((c) => c.name === 'Gems'), 'a renamed currency: the money counter is named for it');
  assert.equal(hud.children.some((c) => c.name === 'Coins'), false);
  const client = ops.find((o) => o.op === 'edit_script' && /AppleClientConfig/.test(o.path)).source;
  assert.match(client, /currency = "Gems"/);
  assert.match(client, /counter = "Gems"/, 'the client scripts find the counter by this name');
  const upgrades = ops.find((o) => o.op === 'edit_script' && /AppleUpgradesConfig/.test(o.path)).source;
  assert.match(upgrades, /counter = "Gems"/);
  const prices = await CT.composeGame(studio().ctx, { request: 'x', template: 'plot-sim', plotSim: { ...PLOTSIM, machines: [PLOTSIM.machines[1], PLOTSIM.machines[0]] } });
  assert.match(prices.error, /must be higher than/, 'prices rise, or the cheaper tier is never worth buying');
  const hero = studio();
  hero.ctx.execStudioOp = (orig => async (op) => (op.op === 'spatial_query' && op.path === 'game.Workspace.Ghost') ? { ok: false } : orig(op))(hero.ctx.execStudioOp);
  assert.match((await CT.composeGame(hero.ctx, { request: 'x', template: 'plot-sim', plotSim: { ...PLOTSIM, hero: 'Ghost' } })).error, /hero: game\.Workspace\.Ghost is not in the place/);
});

test('compose_game: a lane-defense game is the agent\'s own pieces, built as a new map', async () => {
  const { ctx } = studio();
  const r = await CT.composeGame(ctx, { request: 'x', template: 'lane-defense', laneDefense: FIXTURE });
  assert.equal(r.template, 'lane-defense', JSON.stringify(r).slice(0, 300));
  assert.equal(r.game, 'Fixture Siege');
  assert.match(r.forUser, /Runner, Walker, Brute, King/);
  const bad = R.readLaneDefense({ ...FIXTURE, waves: { list: [[{ enemy: 'Nobody', count: 1, every: 1 }]] } }, 1);
  assert.ok(bad.missing.some((m) => /"Nobody" is not one of the enemies/.test(m)));
  const src = readFileSync(join(WORKER, 'src', 'compose-lane.ts'), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/gameId: '[0-9a-f]{12}'|f3ac50e43d68|MythicNPC/.test(src), false, 'no library reference of an earlier benchmark is baked in');
});

test('compose_game: composer values become the plugin\'s typed values', () => {
  assert.deepEqual(CR.propValue('Size', [4, 1, 4]), { t: 'Vector3', v: [4, 1, 4] });
  assert.deepEqual(CR.propValue('Material', 'Grass'), { t: 'EnumItem', v: 'Enum.Material.Grass' });
  assert.deepEqual(CR.propValue('TopSurface', 'Studs'), { t: 'EnumItem', v: 'Enum.SurfaceType.Studs' });
  const c = CR.propValue('Color', '#ff8000');
  assert.equal(c.t, 'Color3'); assert.equal(c.v[0], 1); assert.ok(Math.abs(c.v[1] - 128 / 255) < 1e-9); assert.equal(c.v[2], 0);
  assert.deepEqual(CR.propValue('Anchored', true), { t: 'bool', v: true });
  assert.deepEqual(CR.propValue('', 'AppleTile'), { t: 'string', v: 'AppleTile' });
});

test('compose: every property the map writes is one the plugin will write (one refused property loses the whole map)', () => {
  // Seen live 2026-09-30: SpawnLocation.Duration was refused, so create_instances refused the whole AppleMap.
  const plugin = readFileSync(join(WORKER, '..', 'studpilot-plugin', 'src', 'Commands.luau'), 'utf8');
  const block = plugin.slice(plugin.indexOf('local PROPERTY_ALLOW = {'), plugin.indexOf('\n}', plugin.indexOf('local PROPERTY_ALLOW = {')));
  const allowed = new Set([...block.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*true/gm)].map((m) => m[1])); // names may hold digits (Color3)
  assert.ok(allowed.has('Size') && allowed.has('Material'), 'read the allowlist');
  const used = new Set();
  const walk = (items) => { for (const i of items) { Object.keys(i.props ?? {}).forEach((k) => used.add(k)); walk(i.children ?? []); } };
  for (const s of steps.filter((x) => x.kind === 'create')) walk(s.items);
  for (const k of used) assert.ok(allowed.has(k), `${k} is not in the plugin's write allowlist`);
});

const outJ = join(mkdtempSync(join(tmpdir(), 'cjudge-')), 'j.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'composed-judge.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + outJ], { cwd: WORKER, stdio: 'pipe' });
const J = await import(`file://${outJ}`);
const IDEA = 'defend the base from waves of enemies';

test('composed judge: it reads the config the composer wrote', () => {
  const cfg = J.readConfig(steps.find((s) => s.name === 'AppleGameConfig').source);
  assert.equal(cfg.title, 'Fixture Siege');
  assert.deepEqual([...cfg.enemies].sort(), recipe.enemies.map((e) => e.name).sort());
  assert.deepEqual([...cfg.creatures].sort(), recipe.enemies.map((e) => e.name).sort());
  assert.equal(cfg.costumed, recipe.enemies.length);
  assert.deepEqual(cfg.items, recipe.defenders.map((d) => d.id));
  assert.equal(J.readConfig('return { foo = 1 }'), null, 'a place the composer did not make goes to the older judge');
});

const GOOD = { studpilot: { composed: true, bought: 2, moneyStart: 60, moneyAfterBuy: 10, moneyEnd: 22, enemies: 4, wave: 1, enemyJoints: 24, enemyJointsMoving: 22, defenderJoints: 2, defenderJointsMoving: 2 } };

test('composed judge: a game that plays as asked is ready; each of the owner\'s failures fails it', () => {
  const cfg = J.readConfig(steps.find((s) => s.name === 'AppleGameConfig').source);
  const world = ['Camera', 'Terrain', 'AppleMap', 'AppleEnemies', 'AppleDefenders'];
  const ok = J.judgeFindings(IDEA, cfg, world, GOOD, { errors: [], loadFailures: ['Failed to load animation 114302219876492'] });
  assert.equal(J.verdictOf(ok).verdict, 'ready', JSON.stringify(ok.filter((f) => !f.ok)));
  const fail = (f) => J.verdictOf(f).verdict === 'not ready';
  assert.ok(fail(J.judgeFindings(IDEA, cfg, [...world, 'Map', 'Lobby'], GOOD, { errors: [], loadFailures: [] })), 'a copied world fails');
  assert.ok(fail(J.judgeFindings(IDEA, { ...cfg, enemies: ['Tung Tung', ...cfg.enemies] }, world, GOOD, { errors: [], loadFailures: [] })), 'an enemy with no costume fails');
  assert.ok(fail(J.judgeFindings(IDEA, cfg, world, { studpilot: { ...GOOD.studpilot, enemyJointsMoving: 0 } }, { errors: [], loadFailures: [] })), 'a creature that does not move fails');
  assert.ok(fail(J.judgeFindings(IDEA, cfg, world, GOOD, { errors: [], loadFailures: ['Failed to load 111111', 'Failed to load 222222', 'Failed to load 333333'] })), 'assets that do not load fail');
  assert.ok(fail(J.judgeFindings(IDEA, cfg, world, { studpilot: { ...GOOD.studpilot, moneyEnd: 10 } }, { errors: [], loadFailures: [] })), 'a loop that pays nothing fails');
  assert.ok(fail(J.judgeFindings(IDEA, cfg, world, null, { errors: [], loadFailures: [] })), 'not played is never ready');
});

test('composed judge: the unpublished plugin 1.5.0 reports the play check under `apple`, and is judged the same as one that says `studpilot`', () => {
  const cfg = J.readConfig(steps.find((s) => s.name === 'AppleGameConfig').source);
  const world = ['Camera', 'Terrain', 'AppleMap', 'AppleEnemies', 'AppleDefenders'];
  const logs = { errors: [], loadFailures: [] };
  const old = { apple: GOOD.studpilot };
  assert.deepEqual(J.judgeFindings(IDEA, cfg, world, old, logs), J.judgeFindings(IDEA, cfg, world, GOOD, logs), 'the old field name reads the same');
  assert.equal(J.verdictOf(J.judgeFindings(IDEA, cfg, world, old, logs)).verdict, 'ready');
  const stalled = { apple: { ...GOOD.studpilot, enemyJointsMoving: 0 } };
  assert.equal(J.verdictOf(J.judgeFindings(IDEA, cfg, world, stalled, logs)).verdict, 'not ready', 'a failure is still a failure under the old name');
  const both = { studpilot: { ...GOOD.studpilot, enemyJointsMoving: 0 }, apple: GOOD.studpilot };
  assert.equal(J.verdictOf(J.judgeFindings(IDEA, cfg, world, both, logs)).verdict, 'not ready', 'when both are present the new name wins');
});

test('composed judge: what the agent said it meant to build is compared with what exists, with no list of nouns', () => {
  const cfg = J.readConfig(steps.find((s) => s.name === 'AppleGameConfig').source);
  const world = ['Camera', 'Terrain', 'AppleMap', 'AppleEnemies', 'AppleDefenders'];
  const pieces = { Costume2: ['Cherry'], Costume3: ['Cherry'] };
  const stated = (enemies) => J.judgeFindings(IDEA, cfg, world, GOOD, { errors: [], loadFailures: [] }, { enemies }, pieces).find((f) => f.area === 'twist');
  const all = cfg.enemies.map((name) => ({ name }));
  assert.equal(stated(all).ok, true, stated(all).said);
  assert.equal(stated(all.slice(1)).ok, false, 'an enemy the design did not state');
  assert.match(stated(all.slice(1)).said, /did not state/);
  assert.equal(stated([...all, { name: 'Dragon' }]).ok, false);
  assert.match(stated([...all, { name: 'Dragon' }]).said, /does not have: Dragon/);
  const costume = cfg.costumeKeys.Walker;
  assert.ok(costume, 'the judge reads which costume each enemy wears: ' + JSON.stringify(cfg.costumeKeys));
  const wrong = stated(all.map((e) => e.name === 'Walker' ? { ...e, is: 'a pumpkin' } : e));
  assert.equal(wrong.ok, false, 'meant to be a pumpkin, wears a cherry');
  assert.match(wrong.said, /Walker is meant to be "a pumpkin", but it wears "Cherry"/);
  assert.equal(stated(all.map((e) => e.name === 'Walker' ? { ...e, is: 'a cherry' } : e)).ok, true, 'the same words in the agent\'s own language of the piece');
  const none = J.judgeFindings(IDEA, cfg, world, GOOD, { errors: [], loadFailures: [] }).find((f) => f.area === 'twist');
  assert.match(none.said, /Not compared with a design/, 'a check that did not run is said, not a pass in disguise');
  assert.deepEqual(J.readDesign({ enemies: [{ name: ' A ', is: 'x' }, {}, { name: 'B' }] }), { enemies: [{ name: 'A', is: 'x' }, { name: 'B' }] });
  assert.equal(J.readDesign({}), null);
  const src = readFileSync(join(WORKER, 'src', 'composed-judge.ts'), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/VEG|FRUIT|tomato|carrot|pumpkin/i.test(src), false, 'the judge holds no noun list');
});

test('compose: every class and enum the build creates is one the plugin will create', () => {
  const plugin = readFileSync(join(WORKER, '..', 'studpilot-plugin', 'src', 'Commands.luau'), 'utf8');
  const table = (name) => {
    const at = plugin.indexOf(`local ${name} = {`);
    const block = plugin.slice(at, plugin.indexOf('\n}', at));
    return new Set([...block.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*true/gm)].map((m) => m[1]));
  };
  const classes = table('CREATE_CLASSES'), enums = table('ENUM_ALLOW');
  assert.ok(classes.has('Part') && classes.has('ImageButton') && enums.has('Material'), 'read the plugin tables');
  const usedClasses = new Set(), usedEnums = new Set();
  const walk = (items) => {
    for (const i of items) {
      usedClasses.add(i.className);
      for (const v of Object.values(i.props ?? {})) if (v && v.t === 'EnumItem') usedEnums.add(v.v.split('.')[1]);
      walk(i.children ?? []);
    }
  };
  for (const s of steps.filter((x) => x.kind === 'create')) walk(s.items);
  assert.ok(usedClasses.size > 10);
  for (const c of usedClasses) assert.ok(classes.has(c), `${c} is not a class the plugin creates`);
  for (const e of usedEnums) assert.ok(enums.has(e), `Enum.${e} is not an enum the plugin writes`);
});

test('compose: everything is studded: the map\'s bricks are plain Plastic and one surface step gives studs to the map and every library piece', () => {
  const map = steps.find((s) => s.kind === 'create' && s.parent === 'game.Workspace').items[0];
  const parts = [];
  const walk = (i) => { if (i.className === 'Part' || i.className === 'SpawnLocation') parts.push(i); (i.children ?? []).forEach(walk); };
  walk(map);
  const visible = parts.filter((p) => p.props.Transparency !== 1);
  assert.ok(visible.length > 40, `a real map (${visible.length} bricks)`);
  for (const p of visible) {
    assert.equal(p.props.Material, 'Plastic', `${p.name} is Plastic, the base of the stud surface`);
    assert.equal(p.props.MaterialVariant, undefined, `${p.name} brings no surface of its own`);
    assert.ok(!(p.children ?? []).some((c) => c.className === 'Texture' || c.className === 'Decal'), `${p.name} has no flat image studs`);
  }
  const surface = steps.findIndex((s) => s.kind === 'surface');
  assert.ok(surface > 0, 'there is a surface step');
  assert.deepEqual(steps[surface].paths.sort(), ['game.ServerStorage.AppleParts', 'game.Workspace.AppleMap']);
  const lastImport = steps.map((s) => s.kind).lastIndexOf('import');
  assert.ok(surface > lastImport, 'the studs go on after every library piece is in');
  const names = new Set(parts.map((p) => p.name));
  for (const n of ['Grass', 'Cliff1', 'Cliff2', 'Cliff3', 'Water', 'Plaza', 'Spawn']) assert.ok(names.has(n), `the map has ${n}`);
  // Props come from the library, never from parts (owner, D-MODELLIB-2): no brick is named like a prop.
  for (const p of parts) assert.doesNotMatch(p.name, /tree|bush|fence|rock|flower|lamp|chest|barrel/i, `${p.name} is a prop made of parts`);
  const kept = C.composeSteps({ ...recipe, surface: 'keep' });
  assert.ok(!kept.some((s) => s.kind === 'surface'), 'a user who asked for their own surfaces gets no studs');
});

test('compose: the HUD is the game\'s own: a card and an upgrade row for every item, no placeholder text, every panel closable', () => {
  const create = steps.find((s) => s.kind === 'create' && s.parent === 'game.StarterGui');
  assert.ok(create, 'the HUD is written into StarterGui');
  const hud = create.items[0];
  assert.equal(hud.name, 'AppleHUD');
  const all = [];
  const walk = (i, path) => { all.push({ ...i, path }); (i.children ?? []).forEach((c) => walk(c, `${path}.${c.name}`)); };
  walk(hud, 'AppleHUD');
  const has = (p) => all.some((i) => i.path === p);
  for (const d of recipe.defenders) {
    assert.ok(has(`AppleHUD.ShopPanel.Body.Grid.Item_${d.id}`), `a shop card for ${d.id}`);
    assert.ok(has(`AppleHUD.ShopPanel.Body.Grid.Item_${d.id}.Buy`), `${d.id} can be bought`);
    assert.ok(has(`AppleHUD.UpgradePanel.Body.List.Up_${d.id}.Buy`), `${d.id} can be upgraded`);
  }
  for (const p of ['Coins.Value', 'Coins.Plus', 'Wave.Title', 'Wave.Timer', 'Health.Fill', 'Menu.Shop', 'Menu.Upgrade', 'ShopPanel.Close', 'UpgradePanel.Close', 'Toast']) assert.ok(has(`AppleHUD.${p}`), `HUD has ${p}`);
  for (const i of all) {
    const t = i.props?.Text;
    if (typeof t !== 'string') continue;
    assert.doesNotMatch(t, /^(Label|TextLabel|TextButton|Button)$/, `${i.path} shows a placeholder`);
    assert.doesNotMatch(t, /\d{5,}/, `${i.path} shows a made-up number (${t})`);
  }
  const studded = all.filter((i) => i.props?.Image === 'rbxassetid://6927295847');
  assert.ok(studded.length >= 20, 'the HUD is studded');
  assert.ok(studded.every((i) => (i.children ?? []).some((c) => c.className === 'UIStroke') && (i.children ?? []).some((c) => c.className === 'UIGradient')), 'every studded surface has its outline and colour');
});

test('compose: the game has progression: later items unlock with waves, upgrades and a wave bonus are configured', () => {
  const cfg = steps.find((s) => s.name === 'AppleGameConfig').source;
  assert.ok(recipe.defenders.some((d) => (d.unlock ?? 0) > 0), 'some items are earned');
  assert.match(cfg, /unlock = [1-9]/);
  assert.match(cfg, /clearBonus = \d+/);
  const scripts = steps.filter((s) => s.kind === 'script').map((s) => s.name);
  for (const n of ['AppleGameUI', 'AppleFx', 'AppleSounds']) assert.ok(scripts.includes(n), `${n} is installed`);
});

const outM = join(mkdtempSync(join(tmpdir(), 'studded-map-')), 'm.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'studded-map.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + outM], { cwd: WORKER, stdio: 'pipe' });
const M = await import(`file://${outM}`);

test('compose: the road never overlaps itself and no curb crosses it (owner\'s circled corners, 2026-10-01)', () => {
  const box = (p) => { const [sx, , sz] = p.props.Size, [x, , z] = p.props.Position; return { x0: x - sx / 2, x1: x + sx / 2, z0: z - sz / 2, z1: z + sz / 2 }; };
  const inside = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.01 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 0.01;
  for (const seed of [1, 2, 3, 20260930, 99]) {
    const pieces = M.roadPieces(C.laneLayout(seed).lane, C.LANE_WIDTH, { path: '#e0a45c', curb: '#8e5b32' });
    const road = pieces.filter((p) => !/Curb/.test(p.name)), curbs = pieces.filter((p) => /Curb/.test(p.name));
    assert.ok(road.length >= 10 && curbs.length >= 10, 'a real road');
    for (let i = 0; i < road.length; i++) for (let j = i + 1; j < road.length; j++) {
      assert.ok(!inside(box(road[i]), box(road[j])), `seed ${seed}: ${road[i].name} overlaps ${road[j].name}`);
    }
    for (const c of curbs) for (const r of road) assert.ok(!inside(box(c), box(r)), `seed ${seed}: ${c.name} crosses ${r.name}`);
    // The whole lane is paved: every point along it lies on some road piece.
    const lane = C.laneLayout(seed).lane;
    for (let i = 0; i < lane.length - 1; i++) for (let k = 0; k <= 20; k++) {
      const x = lane[i][0] + (lane[i + 1][0] - lane[i][0]) * k / 20, z = lane[i][1] + (lane[i + 1][1] - lane[i][1]) * k / 20;
      assert.ok(road.some((r) => { const b = box(r); return x >= b.x0 - 1e-6 && x <= b.x1 + 1e-6 && z >= b.z0 - 1e-6 && z <= b.z1 + 1e-6; }), `seed ${seed}: a gap in the road at ${x},${z}`);
    }
  }
});
