/**
 * The composer's parts are block source material (M4): the owner's recording of round 2 (2026-10-04) showed five things about the
 * plot simulator's own parts, and they are pinned here against the kept modules (components, stud-ui, compose-plotsim).
 * RESTATED in M4: the compose_game tool (its BASE note, its failure text, the `from` candidates it offered) and the runner
 * (compose-run.ts) are removed; the tests that read them are deleted with them (planning/proof/M4/TEST-LEDGER.md).
 *
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
const U = await bundle('stud-ui.ts', 'ui');
const C = await bundle('compose.ts', 'compose');
const M = await bundle('studded-map.ts', 'map');
const P = await bundle('compose-plotsim.ts', 'plotsim');
const luau = (p) => readFileSync(join(REPO, 'packages', 'components', p), 'utf8');
const strip = (src) => src.replace(/--\[\[[\s\S]*?\]\]/g, '').replace(/--[^\n]*/g, '');

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
  // RESTATED in M4: the run of these steps (no problem reported when the place has no default spawn) was asserted through compose-run.ts,
  // which is removed. The step list is what is kept: the delete is optional-tolerant because the step carries `optional: true` on the set.
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
