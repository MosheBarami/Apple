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
export { readUpgrades, isUpgradesRequest, DEFAULT_UPGRADES, KIND_ICON, upgradeBlurb, pickScreen } from './src/upgrades-tool';`;
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
  assert.match(src, /isUpgradesRequest\(text\) \? \{ upgradesFirst: true\b/);
  assert.match(src, /agent\.upgradesFirst && !talkOnly && offeredAllowed\.has\('add_upgrades'\) \? \{ requiredTool: 'add_upgrades' \}/);
  assert.match(src, /call\.name === 'add_upgrades' && out\.ok\) agent\.objectBuilt = true/);
});

test('a failed build_object is retried, not swapped for hand-made instances (the fence lifts after three failures)', () => {
  const src = execFileSync('cat', [join(WORKER, 'src', 'do', 'session.ts')], { encoding: 'utf8' });
  const lift = src.slice(src.indexOf("if (call.name === 'build_object') {"), src.indexOf("if (call.name === 'build_object') {") + 300);
  assert.match(lift, /agent\.objectFails = out\.ok \? 0 : \(agent\.objectFails \?\? 0\) \+ 1/);
  assert.match(lift, /if \(out\.ok \|\| agent\.objectFails >= 3\) agent\.objectFirst = false/);
  assert.doesNotMatch(src, /if \(call\.name === 'build_object'\) agent\.objectFirst = false;/, 'one failure lifts the fence again');
});

test('after the object is built an object run cannot add upgrades, and an upgrades run cannot rebuild the object', () => {
  const src = execFileSync('cat', [join(WORKER, 'src', 'do', 'session.ts')], { encoding: 'utf8' });
  const after = src.slice(src.indexOf('const AFTER_OBJECT'), src.indexOf('const AFTER_OBJECT') + 400);
  assert.match(after, /agent\.upgradesRun\s*\?\s*\['add_upgrades'/);
  assert.doesNotMatch(after.slice(after.indexOf(": ['build_object'")), /add_upgrades/, 'an object run may add upgrades');
  assert.doesNotMatch(after.slice(0, after.indexOf(": ['build_object'")), /'build_object'/, 'an upgrades run may rebuild the object');
});

// Play test, 2026-10-01: the model named the currency Taps, the economy kept Coins, and the counter sat at 0.
test('the money the screen shows is the money the economy keeps', () => {
  const tool = execFileSync('cat', [join(WORKER, 'src', 'upgrades-tool.ts')], { encoding: 'utf8' });
  assert.match(tool, /AppleGameConfig'\)\)\) \{[\s\S]{0,500}economy: \{ currency, start \}/, 'a place without settings gets the upgrades\' currency');
  assert.match(tool, /const start = Math\.min\(\.\.\.upgrades\.map\(\(u\) => u\.cost\)\)/, 'and enough to buy the cheapest upgrade at once');
  const server = execFileSync('cat', [join(WORKER, '..', '..', 'packages', 'components', 'upgrades', 'AppleUpgrades.luau')], { encoding: 'utf8' });
  assert.match(server, /if shown ~= Economy\.CURRENCY then[\s\S]{0,200}player:SetAttribute\(shown, amount\)/, 'a game that already has Coins still shows the right number');
  const animate = execFileSync('cat', [join(WORKER, '..', '..', 'packages', 'components', 'animate', 'AppleAnimate.luau')], { encoding: 'utf8' });
  assert.match(animate, /mine\[key\]/, 'the flood guard is per key, so fast typing on different keys all counts');
});

// Owner, 2026-10-01: "the upgrades gui does not have any icons in it" and it felt mid.
test('every upgrade card has an icon, a level badge, what it does and a priced button', () => {
  const screen = U.studdedScreen({ name: 'HUD', pieces: [{ kind: 'panel', name: 'UpgradesPanel', title: 'Upgrades', cards: U.DEFAULT_UPGRADES.map((u) => ({
    name: u.id, label: u.label, price: `$ ${u.cost}`, icon: U.KIND_ICON[u.kind], blurb: U.upgradeBlurb(u, 'Coins'), level: 'Lv 0' })) }] });
  const json = JSON.stringify(screen);
  for (const part of ['"IconBubble"', '"Icon"', '"Level"', '"Blurb"', '"Buy"']) assert.ok((json.match(new RegExp(part, 'g')) ?? []).length >= 3, `${part} missing from a card`);
  assert.deepEqual(U.DEFAULT_UPGRADES.map((u) => U.upgradeBlurb(u, 'Coins')), ['+1 per press', '+1 Coins a second', 'x2 everything']);
  assert.equal(new Set(Object.values(U.KIND_ICON)).size, 3, 'each kind has its own icon');
});

// Re-test, 2026-10-01: an upgrades request sent right after the keyboard's play check met a Studio still closing its
// Test session; every write was refused and the user was told to press Stop.
test('a write refused because a Test session is still closing waits for edit mode and goes again', () => {
  const src = execFileSync('cat', [join(WORKER, 'src', 'do', 'session.ts')], { encoding: 'utf8' });
  const wrapper = src.slice(src.indexOf('private async execStudioOp('), src.indexOf('private async execStudioOpOnce('));
  assert.match(wrapper, /writes require Studio edit mode/);
  assert.match(wrapper, /setTimeout\(resolve, 2_000\)/);
  assert.match(wrapper, /i < 6/, 'it gives up after about 12 seconds');
});

// Re-test, 2026-10-01: the model asked for screen "hud"; a second screen was made over the keyboard's.
test('upgrades go on the screen the game already has, whatever name the model gives', () => {
  assert.equal(U.pickScreen('hud', ['ASMRKeyboardHUD']), 'ASMRKeyboardHUD');
  assert.equal(U.pickScreen('asmrkeyboardhud', ['Other', 'ASMRKeyboardHUD']), 'ASMRKeyboardHUD', 'the one asked for, in any case');
  assert.equal(U.pickScreen(undefined, ['ASMRKeyboardHUD']), 'ASMRKeyboardHUD');
  assert.equal(U.pickScreen('ShopHUD', []), 'ShopHUD', 'a place with no screen gets the name asked');
  assert.equal(U.pickScreen(undefined, []), 'GameHUD');
});

// Owner, 2026-10-01: "the upgrades ui buttons are a bit offside", "more rich and better gui", and keys that go down
// with the players on top of them.
test('the GUI: one captioned counter pill, a glossy Upgrades button with a hidden "!" badge, a panel that fits its cards', () => {
  const screen = U.studdedScreen({ name: 'HUD', pieces: [
    { kind: 'counter', name: 'Counter', text: '0', icon: '#', at: 'top-left', caption: 'Keys pressed', plus: false },
    { kind: 'button', name: 'Upgrades', text: 'Upgrades', icon: '⬆', at: 'left', badge: true },
    { kind: 'panel', name: 'UpgradesPanel', title: 'Upgrades', cards: U.DEFAULT_UPGRADES.map((u) => ({ name: u.id, label: u.label, price: '$ 1' })) },
  ] });
  const json = JSON.stringify(screen);
  const counter = JSON.stringify(screen.children[0].children.find((c) => c.name === 'Counter'));
  assert.ok(counter.includes('"name":"Caption"') && counter.includes('KEYS PRESSED'), 'the caption sits inside the counter');
  const badge = JSON.stringify(screen.children.flatMap((r) => r.children ?? []).find((c) => c.name === 'Upgrades').children.find((c) => c.name === 'Badge'));
  assert.ok(badge && badge.includes('"Visible":false'), 'the badge waits until something can be bought');
  assert.match(json, /"name":"Shine"/, 'buttons and counters are glossy');
  const panel = screen.children.find((c) => c.name === 'UpgradesPanel');
  const height = panel.props.Size.v[3];
  assert.ok(height < 400 && height >= 236 + 70, `one row of cards in a ${height}px panel`);
  const client = execFileSync('cat', [join(WORKER, '..', '..', 'packages', 'components', 'upgrades', 'AppleUpgradesClient.luau')], { encoding: 'utf8' });
  assert.match(client, /badge\.Visible = affordable\(\)/);
  const animate = execFileSync('cat', [join(WORKER, '..', '..', 'packages', 'components', 'animate', 'AppleAnimate.luau')], { encoding: 'utf8' });
  assert.match(animate, /target\.Touched:Connect\(function\(hit\)[\s\S]{0,400}play\(model, joints, rest, clip, false, who\)/, 'a key is pressed by stepping on it');
});
