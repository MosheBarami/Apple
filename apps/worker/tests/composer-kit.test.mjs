/**
 * The composer is a STARTING KIT (D1, D2) and the owner's recording of round 2 (2026-10-04): what compose_game says about
 * itself, what it names when it fails, and the five things the recording showed about the plot simulator's own parts.
 *
 *   - the result and the failure text: this is the base, not the game; a machine with no look is told which models the run
 *     already inserted, as `from` candidates
 *   - currency language: the rebirth text, the shortfall messages and the lane HUD use the game's own currency and symbol,
 *     never "$" or "money"
 *   - pads: their name is a billboard that faces the player, not a decal on the floor
 *   - the default spawn: retired (no star decal in the middle of the hub), nothing deleted
 *   - the active action: a machine on a plot can be pressed, the server counts it, the machine answers; per-press upgrades
 *     therefore buy something that can be done
 *   - the primary menu button is bigger than the others
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(WORKER, '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'composer-kit-'));
const bundle = (entry, name) => {
  const out = join(tmp, `${name}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', entry), '--bundle', '--format=esm', '--target=es2022', '--platform=node', '--outfile=' + out, '--external:cloudflare:*', '--log-level=error'], { cwd: WORKER, stdio: 'pipe' });
  return import(`file://${out}`);
};
const T = await bundle('compose-tool.ts', 'tool');
const U = await bundle('stud-ui.ts', 'ui');
const C = await bundle('compose.ts', 'compose');
const M = await bundle('studded-map.ts', 'map');
const P = await bundle('compose-plotsim.ts', 'plotsim');
const luau = (p) => readFileSync(join(REPO, 'packages', 'components', p), 'utf8');
const strip = (src) => src.replace(/--\[\[[\s\S]*?\]\]/g, '').replace(/--[^\n]*/g, '');

// ---------------------------------------------------------------------------------------- the base ---

test('a composer says it built the BASE, and what to build on it, in the tool result itself', () => {
  const n = T.BASE_NOTE;
  assert.match(n, /BASE of the game, not the finished game/);
  assert.match(n, /world, setting, objects and progression the request describes are NOT built yet/);
  assert.match(n, /find_library_model, then insert_library_model/);
  assert.match(n, /creator skills/);
  assert.match(n, /Baseplate/);
  assert.match(n, /An answer before the world is built is sent back/);
  assert.doesNotMatch(n, /do not rebuild any of it by hand\. Check it once/, 'the old note that told the agent to answer from forUser is gone');
  const tool = readFileSync(join(WORKER, 'src', 'compose-tool.ts'), 'utf8');
  assert.match(tool, /\n    note: BASE_NOTE,/, 'a successful build returns it');
});

test('a machine with no look is told which models this run already inserted', () => {
  const ctx = { evidence: { inserted: ['game.Workspace.Crystal Cluster', 'game.Workspace.Crystals', 'game.Workspace.Crystals.Child', 'game.ServerStorage.Hidden', 'game.Workspace.Crystals'] } };
  const from = T.insertedFromCandidates(ctx);
  assert.deepEqual(from, ['Workspace.Crystal Cluster', 'Workspace.Crystals'], 'only direct children of the workspace (what `from` accepts), once each: not a nested part, not another service');
  const ok = T.insertedFromCandidates({ evidence: { inserted: ['game.Workspace.A', 'game.Workspace.B'] } });
  assert.deepEqual(ok, ['Workspace.A', 'Workspace.B']);
  assert.match(T.fromCandidatesText(ok), /You inserted these models in this run; pass one as machines\[i\]\.from .*"Workspace\.A", "Workspace\.B"/);
  assert.deepEqual(T.insertedFromCandidates({}), []);
  const many = Array.from({ length: 12 }, (_, i) => `game.Workspace.M${i}`);
  assert.equal(T.insertedFromCandidates({ evidence: { inserted: many } }).length, 6, 'bounded');
  const tool = readFileSync(join(WORKER, 'src', 'compose-tool.ts'), 'utf8');
  assert.match(tool, /const lacksLook = p\.missing\.some/, 'the failure text is only extended for a missing look');
});

test('compose_game\'s tool definition says it is the base, and stays inside the context budget (the budget test holds the number)', async () => {
  const out = join(tmp, 'tools.mjs');
  const esb = await import('esbuild');
  await esb.build({ entryPoints: [join(WORKER, 'src', 'tools.ts')], bundle: true, format: 'esm', target: 'es2022', outfile: out, logLevel: 'silent' });
  const { TOOLS } = await import(`file://${out}`);
  const def = TOOLS.compose_game.def;
  assert.match(def.description, /^The BASE of a NEW game/);
  assert.match(def.description, /not the whole game/);
  assert.match(JSON.stringify(def.parameters), /hero: a model you inserted/, 'scenery and hero point at what the run found');
  assert.match(JSON.stringify(def.parameters), /look or from: a model you inserted/);
});

// ------------------------------------------------------------------------------------ the currency ---

test('no composer string says "$" or "money": the rebirth text and every shortfall use the game\'s own currency', () => {
  const client = strip(luau('machines/AppleMachinesClient.luau'));
  assert.doesNotMatch(client, /Rebirth for \$/);
  assert.match(client, /Rebirth for %s: start over/);
  assert.match(client, /\(cfg :: any\)\.symbol/, 'the symbol the agent gave is read');
  assert.match(client, /return short\(n\) \.\. " " \.\. currencyName/, 'without a symbol the price carries the currency\'s name');
  for (const f of ['shop/AppleShop.luau', 'machines/AppleMachines.luau']) {
    const src = strip(luau(f));
    assert.doesNotMatch(src, /Not enough money|more money/, `${f} says money`);
  }
  assert.match(strip(luau('machines/AppleMachines.luau')), /rebirthRefusal\(economy\.get\(player\), cost, economy\.CURRENCY\)/);
  assert.match(strip(luau('shop/AppleShop.luau')), /AppleShop\.notEnough\(economy\.CURRENCY\)/);
});

test('the lane-defense screen wears the game\'s own symbol, not a dollar sign', () => {
  const hud = U.waveDefenseHud([{ id: 'A', name: 'Archer', price: 40 }], { wave: 'Wave' }, { currency: 'Gems', symbol: '◆' });
  const json = JSON.stringify(hud);
  assert.doesNotMatch(json, /\$/);
  assert.match(json, /◆40/);
  const noSymbol = JSON.stringify(U.waveDefenseHud([{ id: 'A', name: 'Archer', price: 40 }], { wave: 'Wave' }, { currency: 'Gems' }));
  assert.doesNotMatch(noSymbol, /\$/);
  assert.match(noSymbol, /"v":"G"|Text.{0,30}G/, 'the coin shows the currency\'s first letter');
  assert.match(readFileSync(join(WORKER, 'src', 'compose.ts'), 'utf8'), /\{ currency: recipe\.currency, symbol: recipe\.symbol \}/, 'the composer passes them');
});

// ------------------------------------------------------------------------------------------- pads ---

test('a pad\'s name is a billboard above it, not a floor decal that reads sideways from the way you walk up', () => {
  const GIVEN = { title: 'T', subject: 'gem', currency: 'Gems', machines: [{ name: 'A', price: 5, income: 1, from: 'Workspace.Thing' }], upgrades: [{ label: 'U', kind: 'perPress', amount: 1, cost: 5 }] };
  const read = P.readPlotSim(GIVEN, 7, false);
  assert.ok(!('error' in read), JSON.stringify(read));
  const map = P.plotSimSteps(read.recipe).find((s) => s.kind === 'create' && s.parent === 'game.Workspace');
  const walk = (list, out = []) => { for (const i of list) { out.push(i); walk(i.children ?? [], out); } return out; };
  const pads = walk(map.items).filter((i) => i.name === 'ShopPad' || i.name === 'SellPad');
  assert.equal(pads.length, 2);
  for (const pad of pads) {
    const kinds = walk(pad.children ?? []).map((c) => c.className);
    assert.ok(kinds.includes('BillboardGui'), `${pad.name} has a billboard`);
    assert.ok(!kinds.includes('SurfaceGui'), `${pad.name} has no floor decal`);
  }
  assert.match(JSON.stringify(pads), /REBIRTH/);
});

// ------------------------------------------------------------------------------- the default spawn ---

test('the default SpawnLocation is retired, not deleted: its decal goes, it is switched off and invisible, and absent is not a problem', async () => {
  const steps = C.retireDefaultSpawn();
  assert.deepEqual(steps[0], { kind: 'delete', paths: ['game.Workspace.SpawnLocation.Decal', 'game.Workspace.SpawnLocation.Texture'] });
  assert.equal(steps[1].kind, 'set');
  assert.deepEqual(steps[1].props, { Enabled: false, Transparency: 1, CanCollide: false });
  assert.equal(steps[1].optional, true);
  for (const f of ['compose.ts', 'compose-plotsim.ts', 'compose-tycoon.ts']) {
    assert.match(readFileSync(join(WORKER, 'src', f), 'utf8'), /else steps\.push\(\.\.\.retireDefaultSpawn\(\)\)/, `${f} retires it`);
  }
  // And a run of it does not report a problem when the place has no default spawn.
  const R = await bundle('compose-run.ts', 'run');
  const ctx = { execStudioOp: async (op) => (op.op === 'set_props' || op.op === 'delete_instances' ? { ok: false, error: 'not found' } : { ok: true, data: {} }) };
  const report = await R.runSteps(ctx, steps);
  assert.deepEqual(report.problems, []);
  assert.match(readFileSync(join(WORKER, 'src', 'compose-tool.ts'), 'utf8'), /default SpawnLocation was switched off and its decal removed/);
});

// The plugin's delete_instances is all-or-nothing (Commands.luau handleDelete: resolveTargets fails on the first path that is not
// there and nothing is deleted). Round 3 (2026-10-04): the retire step listed `SpawnLocation.Decal` AND `SpawnLocation.Texture`; a
// default spawn has only the Decal, so the call was refused whole, the star stayed on the hub, and only the Transparency write (a
// separate step) took effect: an invisible pad with its star hanging in the air. This fake place behaves like the plugin.
test('the default spawn\'s star decal is really deleted when the spawn has a Decal and no Texture (round 3), and the other deletes still run', async () => {
  const R = await bundle('compose-run.ts', 'run-spawn');
  const place = new Map([
    ['game.Workspace.SpawnLocation', { Transparency: 0, Enabled: true }],
    ['game.Workspace.SpawnLocation.Decal', {}],
    ['game.Workspace.Baseplate', {}],
  ]);
  const ops = [];
  const ctx = { execStudioOp: async (op) => {
    ops.push(op);
    if (op.op === 'delete_instances') {
      const missing = op.paths.find((p) => !place.has(p));
      if (missing) return { ok: false, error: `${missing} was not found`, failure: 'not_found' };
      for (const p of op.paths) for (const k of [...place.keys()]) if (k === p || k.startsWith(p + '.')) place.delete(k);
      return { ok: true, data: { deleted: op.paths } };
    }
    if (op.op === 'set_props') {
      if (!place.has(op.path)) return { ok: false, error: 'not found', failure: 'not_found' };
      Object.assign(place.get(op.path), Object.fromEntries(Object.entries(op.props).map(([k, v]) => [k, v.v])));
      return { ok: true, data: {} };
    }
    return { ok: true, data: {} };
  } };
  const report = await R.runSteps(ctx, C.retireDefaultSpawn());
  assert.equal(place.has('game.Workspace.SpawnLocation.Decal'), false, 'the star decal is gone');
  assert.equal(place.get('game.Workspace.SpawnLocation').Transparency, 1, 'and the spawn is retired');
  assert.equal(place.get('game.Workspace.SpawnLocation').Enabled, false);
  assert.deepEqual(report.problems, []);
  // The same all-or-nothing trap for clearDefaultGround: a place with a Baseplate and no SpawnLocation still loses its Baseplate.
  place.delete('game.Workspace.SpawnLocation');
  await R.runSteps(ctx, [{ kind: 'delete', paths: ['game.Workspace.Baseplate', 'game.Workspace.SpawnLocation'] }]);
  assert.equal(place.has('game.Workspace.Baseplate'), false, 'one absent path does not keep the others');
  assert.ok(ops.filter((o) => o.op === 'delete_instances').every((o) => o.paths.length === 1), 'one path per op');
});

// -------------------------------------------------------------------------------- the active action ---

test('a machine on a plot can be pressed: the server counts the press, the machine answers, a visitor\'s press does nothing', () => {
  const src = strip(luau('machines/AppleMachines.luau'));
  assert.match(src, /Instance\.new\("ClickDetector"\)/);
  assert.match(src, /Instance\.new\("ProximityPrompt"\)/);
  assert.match(src, /pressed:Fire\(player, model, "press"\)/, 'counted on the server through the event AppleUpgrades and the machine\'s own perPress pay from');
  assert.match(src, /if not AppleMachines\.isOwn\(ownerOf\(model\), player\.UserId\) then return end\s*\n\s*local now/, 'only the owner\'s own machine');
  assert.match(src, /now - \(lastPress\[player\] or 0\) < 0\.12/, 'a press is not counted faster than a person can make it');
  for (const feel of ['ParticleEmitter', 'Instance.new("Sound")', 'Instance.new("BillboardGui")', 'PivotTo']) assert.ok(src.includes(feel), `hit feedback: ${feel}`);
  assert.match(src, /economy\.Changed:Connect\(function\(player: Player, _amount: number, delta: number, reason: string\)\s*\n\s*if reason ~= "press"/, 'the "+N" is what the press actually paid');
  assert.match(src, /placed\.ChildAdded:Connect/, 'a machine bought later is pressable too');
  const upgrades = strip(luau('upgrades/AppleUpgrades.luau'));
  assert.match(upgrades, /AppleAnimatePressed/, 'the per-press upgrade pays from the same event');
});

test('the tool tells the player the press exists', () => {
  assert.match(readFileSync(join(WORKER, 'src', 'compose-tool.ts'), 'utf8'), /clicking or tapping one of your machines presses it for an instant payout that upgrades raise/);
});

// ------------------------------------------------------------------------------------- the menu ---

test('the primary menu button (the shop) is taller than the other two, which weigh the same as each other', () => {
  const hud = U.plotSimHud([{ id: 'A', name: 'A', price: 5, income: 1 }], [{ id: 'U', label: 'U', cost: 5, blurb: 'b' }], { currency: 'Cash', shop: 'Shop', upgrades: 'Upgrades', rebirth: 'Rebirth' });
  const menu = hud.children.find((c) => c.name === 'Menu');
  const h = (name) => menu.children.find((c) => c.name === name).props.Size.v[3];
  assert.ok(h('Shop') > h('Upgrades'), 'the shop is the primary action');
  assert.equal(h('Upgrades'), 64);
  assert.ok(h('Shop') > 64);
  const total = menu.props.Size.v[3];
  assert.ok(total >= h('Shop') + h('Upgrades') + h('Rebirth') + 28, 'the column holds all three');
});
