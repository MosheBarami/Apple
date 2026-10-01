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
  const allowed = new Set([...block.matchAll(/^\s*([A-Za-z_]+)\s*=\s*true/gm)].map((m) => m[1]));
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
