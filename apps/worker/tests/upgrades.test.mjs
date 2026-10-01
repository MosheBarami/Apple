/**
 * "add upgrades" (owner, 2026-10-01): the run redrew the first studded screen six times, restyled it and finally wiped
 * it, in 53 steps. Now a screen is added to, never redrawn (studded-ui-tool.ts screenWrites), and upgrades are one
 * add_upgrades call (upgrades-tool.ts).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'upg-')), 'u.mjs');
const ENTRY = `export { screenWrites } from './src/studded-ui-tool';
export { studdedScreen } from './src/stud-ui';
export { readUpgrades, isUpgradesRequest, DEFAULT_UPGRADES } from './src/upgrades-tool';`;
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), ['--bundle', '--format=esm', '--platform=neutral', '--main-fields=module,main', '--loader=ts', '--outfile=' + out], { cwd: WORKER, input: ENTRY, stdio: ['pipe', 'pipe', 'pipe'] });
const U = await import(`file://${out}`);

// The keyboard's screen as the object builder made it: a counter top-left and a hint at the bottom.
const THERE = { name: 'AsmrKeyboardHUD', class: 'ScreenGui', children: [
  { name: 'Region_top_left', class: 'Frame', children: [{ name: 'List', class: 'UIListLayout' }, { name: 'Presses', class: 'ImageLabel' }, { name: 'Label', class: 'ImageLabel' }] },
  { name: 'Region_bottom', class: 'Frame', children: [{ name: 'List', class: 'UIListLayout' }, { name: 'Hint', class: 'ImageLabel' }] },
] };

const upgradesScreen = (name = 'AsmrKeyboardHUD') => U.studdedScreen({ name, pieces: [
  { kind: 'counter', name: 'Coins', text: '0', at: 'top-left' },
  { kind: 'button', name: 'Upgrades', text: 'Upgrades', at: 'left' },
  { kind: 'panel', name: 'UpgradesPanel', title: 'Upgrades', cards: [{ name: 'Power', label: 'Stronger Taps', price: '15' }] },
] });

test('adding to a screen that is there takes nothing away and redraws nothing', () => {
  const plan = U.screenWrites(upgradesScreen(), THERE);
  assert.deepEqual(plan.deletes, [], 'something already on the screen is deleted');
  assert.ok(!plan.creates.some((c) => c.parent === 'game.StarterGui'), 'the whole screen is written again');
  const coins = plan.creates.find((c) => c.item.name === 'Coins');
  assert.equal(coins.parent, 'game.StarterGui.AsmrKeyboardHUD.Region_top_left', 'the new counter joins the counters already there');
  assert.ok(coins.item.props.LayoutOrder > 100, 'and comes after them');
  assert.ok(!plan.creates.some((c) => c.item.className === 'UIListLayout'), 'a second layout would fight the first');
  assert.deepEqual(plan.creates.filter((c) => c.parent === 'game.StarterGui.AsmrKeyboardHUD').map((c) => c.item.name).sort(), ['Region_left', 'UpgradesPanel']);
});

test('a piece of the same name is replaced on its own; a new design replaces the screen only when asked', () => {
  const again = U.screenWrites(upgradesScreen(), { ...THERE, children: [...THERE.children, { name: 'UpgradesPanel', class: 'Frame', children: [] }] });
  assert.deepEqual(again.deletes, ['game.StarterGui.AsmrKeyboardHUD.UpgradesPanel']);
  const fresh = U.screenWrites(upgradesScreen('NewHUD'), null);
  assert.deepEqual(fresh, { deletes: [], creates: [{ item: upgradesScreen('NewHUD'), parent: 'game.StarterGui' }] });
  const redo = U.screenWrites(upgradesScreen(), THERE, true);
  assert.deepEqual(redo.deletes, ['game.StarterGui.AsmrKeyboardHUD']);
});

test('upgrades: a good default, and what the model gives is checked and bounded', () => {
  assert.equal(U.readUpgrades(undefined), U.DEFAULT_UPGRADES);
  assert.deepEqual(new Set(U.DEFAULT_UPGRADES.map((u) => u.kind)), new Set(['perPress', 'perSecond', 'multiplier']));
  const read = U.readUpgrades([{ label: 'Faster Keys!', cost: '40' }, { id: 'Gold', kind: 'multiplier', amount: 999999, cost: -5 }]);
  assert.equal(read[0].id, 'FasterKeys'); assert.equal(read[0].kind, 'perPress'); assert.equal(read[0].cost, 40);
  assert.equal(read[1].amount, 1000); assert.equal(read[1].cost, 1);
  assert.match(U.readUpgrades([{ id: 'A' }, { id: 'A' }]).error, /unique/);
});

test('which requests are upgrades', () => {
  for (const t of ['add an upgrades gui that actually functions', 'add upgrades', 'can you add an upgrade shop', 'make upgrading work']) assert.ok(U.isUpgradesRequest(t), t);
  for (const t of ['make a tycoon game with upgrades', 'make an asmr keyboard', 'build me a simulator with upgrades']) assert.ok(!U.isUpgradesRequest(t), t);
});

test('the run calls add_upgrades first for an upgrades request, then only checks', () => {
  const src = execFileSync('cat', [join(WORKER, 'src', 'do', 'session.ts')], { encoding: 'utf8' });
  assert.match(src, /isUpgradesRequest\(text\) \? \{ upgradesFirst: true \}/);
  assert.match(src, /agent\.upgradesFirst && !talkOnly && offeredAllowed\.has\('add_upgrades'\) \? \{ requiredTool: 'add_upgrades' \}/);
  assert.match(src, /call\.name === 'add_upgrades' && out\.ok\) agent\.objectBuilt = true/);
});
