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
  [join(WORKER, 'src', 'recipes.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const R = await import(`file://${out}`);
const C = await import(`file://${out.replace('c.mjs', 'c2.mjs')}`).catch(async () => {
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [join(WORKER, 'src', 'compose.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out.replace('c.mjs', 'c2.mjs')],
    { cwd: WORKER, stdio: 'pipe' });
  return import(`file://${out.replace('c.mjs', 'c2.mjs')}`);
});

const recipe = R.orchardRecipe();
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

test('compose: the twist is built: every enemy is a body wearing a vegetable, and the config says so', () => {
  const cfg = steps.find((s) => s.name === 'AppleGameConfig').source;
  for (const e of recipe.enemies) {
    assert.ok(e.body && e.costume, `${e.name} is made from pieces`);
    const key = /^[A-Za-z_]\w*$/.test(e.name) ? e.name : `\\["${e.name}"\\]`;
    assert.match(cfg, new RegExp(`\\n\\t\\t${key} = \\{\\n\\t\\t\\tbody = "ServerStorage\\.AppleParts\\.Body\\d+",\\n\\t\\t\\tcostume = "ServerStorage\\.AppleParts\\.Costume\\d+"`));
  }
});

test('compose: the bundled components are the current sources', () => {
  execFileSync('node', [join(WORKER, '..', '..', 'scripts', 'generate', 'gen-components.mjs'), '--check'], { stdio: 'pipe' });
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

test('compose_game: an idea picks its template; an idea no template can build is refused, never swapped for another game', () => {
  const orchard = CT.ideaRecipe('defend your orchard from vegetables that come in waves');
  assert.equal(orchard.template, 'lane-defense/orchard');
  assert.equal(CT.ideaRecipe('Defend the farm from waves of angry tomatoes').template, 'lane-defense/orchard');
  const other = CT.ideaRecipe('a racing game on the moon');
  assert.ok('error' in other);
  assert.match(other.error, /nothing was built/);
  assert.notEqual(CT.ideaSeed('defend your orchard'), CT.ideaSeed('defend your farm'), 'a new idea gets a new map');
  assert.equal(CT.ideaSeed('Defend  your orchard'), CT.ideaSeed('defend your orchard'), 'the same idea gets the same map');
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
  const plugin = readFileSync(join(WORKER, '..', 'apple-plugin', 'src', 'Commands.luau'), 'utf8');
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
const IDEA = 'defend your orchard from vegetables that come in waves';

test('composed judge: it reads the config the composer wrote', () => {
  const cfg = J.readConfig(steps.find((s) => s.name === 'AppleGameConfig').source);
  assert.equal(cfg.title, 'Orchard Siege');
  assert.deepEqual([...cfg.enemies].sort(), recipe.enemies.map((e) => e.name).sort());
  assert.deepEqual([...cfg.creatures].sort(), recipe.enemies.map((e) => e.name).sort());
  assert.equal(cfg.costumed, recipe.enemies.length);
  assert.deepEqual(cfg.items, recipe.defenders.map((d) => d.id));
  assert.equal(J.readConfig('return { foo = 1 }'), null, 'a place the composer did not make goes to the older judge');
});

const GOOD = { apple: { composed: true, bought: 2, moneyStart: 60, moneyAfterBuy: 10, moneyEnd: 22, enemies: 4, wave: 1, enemyJoints: 24, enemyJointsMoving: 22, defenderJoints: 2, defenderJointsMoving: 2 } };

test('composed judge: a game that plays as asked is ready; each of the owner\'s failures fails it', () => {
  const cfg = J.readConfig(steps.find((s) => s.name === 'AppleGameConfig').source);
  const world = ['Camera', 'Terrain', 'AppleMap', 'AppleEnemies', 'AppleDefenders'];
  const ok = J.judgeFindings(IDEA, cfg, world, GOOD, { errors: [], loadFailures: ['Failed to load animation 114302219876492'] });
  assert.equal(J.verdictOf(ok).verdict, 'ready', JSON.stringify(ok.filter((f) => !f.ok)));
  const fail = (f) => J.verdictOf(f).verdict === 'not ready';
  assert.ok(fail(J.judgeFindings(IDEA, cfg, [...world, 'Map', 'Lobby'], GOOD, { errors: [], loadFailures: [] })), 'a copied world fails');
  assert.ok(fail(J.judgeFindings(IDEA, { ...cfg, enemies: ['Tung Tung', ...cfg.enemies] }, world, GOOD, { errors: [], loadFailures: [] })), 'a twist not built fails');
  assert.ok(fail(J.judgeFindings(IDEA, cfg, world, { apple: { ...GOOD.apple, enemyJointsMoving: 0 } }, { errors: [], loadFailures: [] })), 'a creature that does not move fails');
  assert.ok(fail(J.judgeFindings(IDEA, cfg, world, GOOD, { errors: [], loadFailures: ['Failed to load 111111', 'Failed to load 222222', 'Failed to load 333333'] })), 'assets that do not load fail');
  assert.ok(fail(J.judgeFindings(IDEA, cfg, world, { apple: { ...GOOD.apple, moneyEnd: 10 } }, { errors: [], loadFailures: [] })), 'a loop that pays nothing fails');
  assert.ok(fail(J.judgeFindings(IDEA, cfg, world, null, { errors: [], loadFailures: [] })), 'not played is never ready');
});

test('compose: every class and enum the build creates is one the plugin will create', () => {
  const plugin = readFileSync(join(WORKER, '..', 'apple-plugin', 'src', 'Commands.luau'), 'utf8');
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
