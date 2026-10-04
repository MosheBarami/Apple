/**
 * One layout per screen (phase T, game 1, flaws 13 to 19): build_studded_ui placed UPGRADES top-centre and REBIRTH bottom-centre,
 * then add_upgrades added a green Upgrades button on the left: three Upgrades labels, REBIRTH on the hotbar, and a panel that
 * opened over the HUD. The rules live in src/ui-layout.ts (pure) and in the two tools; this holds both.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'uil-')), 'l.mjs');
const ENTRY = `export * from './src/ui-layout';
export { studdedScreen } from './src/stud-ui';
export { readStudSpec, buildStuddedUi } from './src/studded-ui-tool';
export { addUpgrades } from './src/upgrades-tool';`;
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), ['--bundle', '--format=esm', '--platform=neutral', '--main-fields=module,main', '--loader=ts', '--outfile=' + out], { cwd: WORKER, input: ENTRY, stdio: ['pipe', 'pipe', 'pipe'] });
const L = await import(`file://${out}`);

// ------------------------------------------------------------------------------------------------ a fake Studio

/** A small stand-in for the plugin: it keeps the screens it was told to create and answers get_tree from them. */
function fakeStudio() {
  const screens = new Map(); // name -> spec node
  const made = new Set(['game.ServerScriptService']);
  const log = { deletes: [], scripts: [], creates: [] };
  const node = (s) => ({ name: s.name, class: s.className, children: (s.children ?? []).map(node) });
  const find = (path) => {
    const parts = path.replace(/^game\.StarterGui\.?/, '').split('.').filter(Boolean);
    let cur = parts.length ? screens.get(parts[0]) : null;
    for (const p of parts.slice(1)) cur = cur && (cur.children ?? []).find((c) => c.name === p);
    return cur;
  };
  const ctx = {
    async execStudioOp(op) {
      if (op.op === 'get_tree') {
        if (op.root === 'game.StarterGui') return { ok: true, data: { root: { name: 'StarterGui', class: 'StarterGui', children: [...screens.values()].map((s) => ({ name: s.name, class: s.className })) } } };
        if (op.root.startsWith('game.StarterGui.')) { const n = find(op.root); return n ? { ok: true, data: { root: node(n) } } : { ok: false, error: 'not found' }; }
        return made.has(op.root) ? { ok: true, data: { root: { name: op.root, class: 'Folder' } } } : { ok: false, error: 'not found' };
      }
      if (op.op === 'delete_instances') {
        for (const path of op.paths) {
          log.deletes.push(path);
          const parts = path.split('.');
          if (parts.length === 3 && parts[1] === 'StarterGui') screens.delete(parts[2]);
          else { const parent = find(parts.slice(0, -1).join('.')); if (parent) parent.children = parent.children.filter((c) => c.name !== parts.at(-1)); }
        }
        return { ok: true, data: {} };
      }
      if (op.op === 'create_instances') {
        for (const item of op.items) {
          log.creates.push(item);
          if (item.parent === 'game.StarterGui') screens.set(item.name, JSON.parse(JSON.stringify(item)));
          else if (item.parent.startsWith('game.StarterGui.')) { const parent = find(item.parent); parent.children = [...(parent.children ?? []), JSON.parse(JSON.stringify(item))]; }
          else made.add(`${item.parent}.${item.name}`);
        }
        return { ok: true, data: {} };
      }
      if (op.op === 'edit_script') { log.scripts.push(op); made.add(op.path); return { ok: true, data: {} }; }
      return { ok: true, data: {} };
    },
  };
  return { ctx, screens, log };
}

/** Every piece on a screen with where it sits: [{ name, className, region }]. */
function pieces(screen) {
  const out = [];
  for (const c of screen.children ?? []) {
    if (c.name.startsWith('Region_')) for (const p of c.children ?? []) { if (p.className !== 'UIListLayout') out.push({ name: p.name, className: p.className, region: c.name }); }
    else out.push({ name: c.name, className: c.className, region: '' });
  }
  return out;
}
const buttons = (screen) => pieces(screen).filter((p) => p.className === 'ImageButton');
const UPGRADES = [{ label: 'Pickaxe Power', kind: 'perPress', amount: 1, cost: 10 }, { label: 'Auto Miner', kind: 'perSecond', amount: 0.5, cost: 25 }];

// ------------------------------------------------------------------------------------------------ flaw 14: no duplicates

// Game 1's call order: build_studded_ui first (UPGRADES top, REBIRTH bottom), then add_upgrades.
test('add_upgrades after build_studded_ui adds no second Upgrades button and no second panel', async () => {
  const studio = fakeStudio();
  const built = await L.buildStuddedUi(studio.ctx, { screen: 'GameHUD', pieces: [
    { kind: 'counter', name: 'Crystals', text: '0', at: 'top-left', caption: 'Crystals' },
    { kind: 'button', name: 'Upgrades', text: 'Upgrades', at: 'top' },
    { kind: 'button', name: 'Rebirth', text: 'Rebirth', at: 'bottom' },
  ] });
  assert.equal(built.changed, true);
  const before = JSON.stringify(studio.screens.get('GameHUD'));
  const done = await L.addUpgrades(studio.ctx, { currency: 'Crystals', upgrades: UPGRADES });
  assert.equal(done.changed, true, JSON.stringify(done));
  assert.equal(studio.screens.size, 1, 'one screen');
  const screen = studio.screens.get('GameHUD');
  const upgradeButtons = buttons(screen).filter((b) => L.actionKey(b.name) === 'upgrade');
  assert.equal(upgradeButtons.length, 1, `Upgrades buttons: ${JSON.stringify(buttons(screen))}`);
  const counters = pieces(screen).filter((p) => /crystal/i.test(p.name));
  assert.equal(counters.length, 1, 'one Crystals counter');
  assert.equal(pieces(screen).filter((p) => /upgrade/i.test(p.name) && p.className === 'Frame').length, 1, 'one Upgrades panel');
  // What build_studded_ui drew is untouched: the add reused it, it did not redraw it.
  const kept = JSON.stringify(screen.children.filter((c) => c.name.startsWith('Region_')).map((r) => r.children.filter((p) => ['Upgrades', 'Rebirth', 'Crystals'].includes(p.name))));
  assert.ok(kept.includes('"Upgrades"') && kept.includes('"Rebirth"'));
  assert.ok(before.length > 0);
  assert.match(done.note, /reused/i, 'the agent is told what was reused');
});

test('add_upgrades writes the names it reused into the config, so the client finds the button that is there', async () => {
  const studio = fakeStudio();
  await L.buildStuddedUi(studio.ctx, { screen: 'GameHUD', pieces: [
    { kind: 'counter', name: 'CrystalCount', text: '0', at: 'top-left' },
    { kind: 'button', name: 'OpenUpgrades', text: 'Boost', at: 'right' },
  ] });
  await L.addUpgrades(studio.ctx, { currency: 'Crystals', upgrades: UPGRADES });
  const config = studio.log.scripts.find((s) => s.path.endsWith('AppleUpgradesConfig')).source;
  assert.match(config, /button = "OpenUpgrades"/, config);
  assert.match(config, /counter = "CrystalCount"/, config);
  assert.equal(buttons(studio.screens.get('GameHUD')).length, 1, 'no new button beside OpenUpgrades');
});

test('a panel already there keeps its name and is written again with the upgrade cards', async () => {
  const studio = fakeStudio();
  await L.buildStuddedUi(studio.ctx, { screen: 'GameHUD', pieces: [{ kind: 'panel', name: 'UpgradePanel', title: 'Upgrades', cards: [{ name: 'Old', label: 'Old', price: '1' }] }] });
  await L.addUpgrades(studio.ctx, { upgrades: UPGRADES });
  const screen = studio.screens.get('GameHUD');
  const panels = screen.children.filter((c) => c.name.endsWith('Panel'));
  assert.deepEqual(panels.map((p) => p.name), ['UpgradePanel'], 'one panel, under the name the game already uses');
  assert.ok(JSON.stringify(panels[0]).includes('"PickaxePower"'), 'with the upgrades\' cards');
  assert.ok(!JSON.stringify(panels[0]).includes('"Old"'));
  assert.match(studio.log.scripts.find((s) => s.path.endsWith('AppleUpgradesConfig')).source, /panel = "UpgradePanel"/);
});

test('add_upgrades on an empty place still draws all three pieces, on the right edge', async () => {
  const studio = fakeStudio();
  const done = await L.addUpgrades(studio.ctx, { currency: 'Crystals', upgrades: UPGRADES });
  assert.equal(done.changed, true);
  const ps = pieces(studio.screens.get('GameHUD'));
  assert.deepEqual(ps.filter((p) => p.className === 'ImageButton').map((p) => [p.name, p.region]), [['Upgrades', 'Region_right']], 'primary actions go on the right edge');
  assert.ok(ps.some((p) => p.name === 'Crystals' && p.region === 'Region_top_left'));
  assert.ok(ps.some((p) => p.name === 'UpgradesPanel'));
});

test('build_studded_ui drops a button that does what one on the screen does, and says so', async () => {
  const studio = fakeStudio();
  await L.buildStuddedUi(studio.ctx, { screen: 'GameHUD', pieces: [{ kind: 'button', name: 'Shop', text: 'Shop', at: 'right' }] });
  const second = await L.buildStuddedUi(studio.ctx, { screen: 'GameHUD', pieces: [{ kind: 'button', name: 'StoreButton', text: 'Store', at: 'right' }, { kind: 'button', name: 'Codes', text: 'Codes', at: 'right' }] });
  assert.deepEqual(buttons(studio.screens.get('GameHUD')).map((b) => b.name).sort(), ['Codes', 'Shop']);
  assert.match(second.note, /StoreButton[\s\S]{0,80}Shop/, 'it says which one was reused');
});

test('a piece of the same name in another region replaces the old one (it moved), it is not drawn twice', async () => {
  const studio = fakeStudio();
  await L.buildStuddedUi(studio.ctx, { screen: 'GameHUD', pieces: [{ kind: 'button', name: 'Shop', text: 'Shop', at: 'left' }] });
  await L.buildStuddedUi(studio.ctx, { screen: 'GameHUD', pieces: [{ kind: 'button', name: 'Shop', text: 'Shop', at: 'right', colour: 'green' }] });
  assert.deepEqual(buttons(studio.screens.get('GameHUD')).map((b) => [b.name, b.region]), [['Shop', 'Region_right']]);
});

test('two buttons in one spec that do the same thing are refused', () => {
  const spec = (...buttonsIn) => L.readStudSpec({ pieces: buttonsIn.map(([name, text, at = 'right']) => ({ kind: 'button', name, text, at })) });
  assert.match(spec(['Upgrades', 'Upgrades'], ['UpgradeBtn', 'Boost']).error, /do the same thing/);
  assert.match(spec(['Rebirth', 'Rebirth'], ['PrestigeButton', 'Prestige']).error, /do the same thing/, 'prestige is rebirth');
  assert.ok(!spec(['Upgrades', 'Upgrades'], ['Shop', 'Shop']).error);
});

test('actionKey reads the action out of a name or a label', () => {
  for (const s of ['Upgrades', 'UpgradesButton', 'upgrade_btn', 'OpenUpgrades', '⬆ UPGRADES']) assert.equal(L.actionKey(s), 'upgrade', s);
  assert.equal(L.actionKey('Store'), 'shop');
  assert.equal(L.actionKey('Shop Panel'), 'shop');
  assert.equal(L.actionKey('Button'), '', 'only filler words: an empty key matches nothing');
  assert.notEqual(L.actionKey('Pets'), L.actionKey('Shop'));
});

// ------------------------------------------------------------------------------------------------ flaws 18, 19, 25: where pieces sit

const spec1 = (p) => L.readStudSpec({ pieces: [p] }).pieces[0];

test('a button at bottom-centre is moved to the right edge, with the reason', () => {
  const read = L.readStudSpec({ pieces: [{ kind: 'button', name: 'Rebirth', text: 'Rebirth', at: 'bottom' }] });
  assert.equal(read.pieces[0].at, 'right', 'the hotbar zone is kept clear');
  assert.match(read.notes[0], /Rebirth[\s\S]*bottom -> right[\s\S]*hotbar/);
  assert.match(read.notes[0], /exact/, 'the note says how to keep the spot');
});

test('buttons are never left at the bottom corners (thumbstick and jump zones) or in the top corners', () => {
  for (const at of ['bottom-left', 'bottom-right', 'top-left', 'top-right', 'top', 'bottom']) assert.equal(spec1({ kind: 'button', name: 'B', text: 'B', at }).at, 'right', at);
  for (const at of ['left', 'right']) assert.equal(spec1({ kind: 'button', name: 'B', text: 'B', at }).at, at, `${at} is a good edge`);
});

test('exact:true keeps the spot the user asked for, and says nothing is moved', () => {
  const read = L.readStudSpec({ pieces: [{ kind: 'button', name: 'Rebirth', text: 'Rebirth', at: 'bottom', exact: true }] });
  assert.equal(read.pieces[0].at, 'bottom');
  assert.deepEqual(read.notes, []);
});

test('the right edge holds three buttons, the rest go to the left edge, and more than six are refused', () => {
  const many = (n) => L.readStudSpec({ pieces: Array.from({ length: n }, (_, i) => ({ kind: 'button', name: `Btn${String.fromCharCode(97 + i)}`, text: `Word${String.fromCharCode(97 + i)}`, at: 'bottom' })) });
  assert.deepEqual(many(5).pieces.map((p) => p.at), ['right', 'right', 'right', 'left', 'left']);
  assert.match(many(7).error, /Too many buttons/);
});

test('counters and bars leave the bottom row; a counter stays where a good spot was asked', () => {
  assert.equal(spec1({ kind: 'counter', name: 'Coins', text: '0', at: 'bottom' }).at, 'top-left');
  assert.equal(spec1({ kind: 'counter', name: 'Coins', text: '0', at: 'bottom-right' }).at, 'top-left');
  assert.equal(spec1({ kind: 'bar', name: 'Hp', text: 'HP', at: 'bottom' }).at, 'top');
  assert.equal(spec1({ kind: 'counter', name: 'Coins', text: '0', at: 'top-right' }).at, 'top-right');
});

test('the screen has no centre region; the side columns start high, below the counters, and stay out of the bottom third', () => {
  const screen = L.studdedScreen({ name: 'HUD', pieces: [{ kind: 'button', name: 'A', text: 'A', at: 'left' }, { kind: 'button', name: 'B', text: 'B', at: 'right' }, { kind: 'counter', name: 'Coins', text: '0', at: 'top-left' }] });
  const region = (name) => screen.children.find((c) => c.name === name).props;
  for (const name of ['Region_left', 'Region_right']) {
    const p = region(name);
    assert.ok(p.Position.v[2] <= 0.25, `${name} starts at ${p.Position.v[2]} of the height`);
    assert.deepEqual(p.AnchorPoint.v, [name === 'Region_left' ? 0 : 1, 0], 'anchored at its top edge, not centred');
    assert.ok(p.Size.v[3] <= 3 * 64 + 2 * 12 + 8, 'a column holds three buttons');
  }
  assert.ok(region('Region_top_left').Position.v[3] >= 20, 'the top row leaves room under the Roblox top bar');
  assert.ok(screen.children.every((c) => !/center|centre|bottom/.test(c.name)), 'no region in the middle or on the bottom row unless a piece was put there');
});

test('the buttons a screen already has on an edge count toward its capacity', async () => {
  const studio = fakeStudio();
  await L.buildStuddedUi(studio.ctx, { screen: 'GameHUD', pieces: ['One', 'Two', 'Three'].map((n) => ({ kind: 'button', name: n, text: n, at: 'right' })) });
  await L.buildStuddedUi(studio.ctx, { screen: 'GameHUD', pieces: [{ kind: 'button', name: 'Four', text: 'Four', at: 'bottom' }] });
  assert.deepEqual(buttons(studio.screens.get('GameHUD')).filter((b) => b.name === 'Four').map((b) => b.region), ['Region_left'], 'the right edge was full');
});

test('the note a placement gives reaches the agent in the tool result', async () => {
  const studio = fakeStudio();
  const done = await L.buildStuddedUi(studio.ctx, { screen: 'GameHUD', pieces: [{ kind: 'button', name: 'Rebirth', text: 'Rebirth', at: 'bottom' }] });
  assert.match(done.placement[0], /bottom -> right/);
  assert.deepEqual(buttons(studio.screens.get('GameHUD')).map((b) => b.region), ['Region_right']);
});
