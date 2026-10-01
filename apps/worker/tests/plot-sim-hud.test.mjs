/**
 * The screen of a plot simulator (src/stud-ui.ts plotSimHud). Its scripts find its pieces by name, so the names are
 * the contract: they are read from the Luau of AppleGameUI and AppleUpgradesClient and from the upgrades tool's config,
 * not typed here a second time, and each is then looked up in the screen the way the Luau looks it up.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(WORKER, '..', '..');
const out = join(mkdtempSync(join(tmpdir(), 'psh-')), 'ui.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'stud-ui.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out], { cwd: WORKER, stdio: 'pipe' });
const U = await import(`file://${out}`);

const gameUi = readFileSync(join(REPO, 'packages/components/gameui/AppleGameUI.luau'), 'utf8').replace(/--\[\[[\s\S]*?\]\]/g, '').replace(/--[^\n]*/g, '');
const upClient = readFileSync(join(REPO, 'packages/components/upgrades/AppleUpgradesClient.luau'), 'utf8').replace(/--\[\[[\s\S]*?\]\]/g, '').replace(/--[^\n]*/g, '');
const upTool = readFileSync(join(WORKER, 'src', 'upgrades-tool.ts'), 'utf8');

const ITEMS = [
  { id: 'Press', name: 'Cash Press', price: 50, income: 1, icon: '⚙' },
  { id: 'Printer', name: 'Printer', price: 1200, income: 12, colour: 'pink' },
  { id: 'Vault', name: 'Vault', price: 25000, income: 150 },
  { id: 'Mint', name: 'Mint', price: 2_500_000, income: 4200 },
];
const UPGRADES = [
  { id: 'faster', label: 'Faster Machines', cost: 100, icon: '⚡', blurb: '+10% speed' },
  { id: 'bigger', label: 'Bigger Plot', cost: 750 },
];
const WORDS = { currency: 'Cash', shop: 'Machines', upgrades: 'Boosts', rebirth: 'Rebirth', perSecond: '/s' };
const hud = () => U.plotSimHud(ITEMS, UPGRADES, WORDS);

/** How the Luau looks a dotted path up from the screen (FindFirstChild one name at a time). */
const at = (root, path) => path.split('.').reduce((n, name) => n && (n.children ?? []).find((c) => c.name === name), root);
/** FindFirstChild(name, true): the first descendant by name, depth first as Roblox does. */
const deep = (root, name) => { for (const c of root.children ?? []) { if (c.name === name) return c; const f = deep(c, name); if (f) return f; } return undefined; };
const all = (root, f = []) => { f.push(root); (root.children ?? []).forEach((c) => all(c, f)); return f; };

test('plot sim HUD: the screen is AppleHUD, the name AppleGameUI binds', () => {
  assert.equal(hud().className, 'ScreenGui');
  assert.equal(hud().name, 'AppleHUD');
  assert.match(gameUi, /child\.Name == "AppleHUD"/, 'AppleGameUI still binds a screen called AppleHUD');
});

test('plot sim HUD: every name AppleGameUI looks up for money, the menu, the toast and the shop is there', () => {
  const paths = [...gameUi.matchAll(/find\("([A-Za-z_.]+)"\)/g)].map((m) => m[1]);
  assert.ok(paths.length >= 8, `read the paths AppleGameUI looks up (${paths.length})`);
  // the ones a plot simulator has (it has no wave and no base health, and its upgrades are AppleUpgradesClient's)
  const mine = ['Coins.Value', 'Coins.Plus', 'Coins', 'Menu.Shop', 'Toast', 'ShopPanel', 'ShopPanel.Body.Grid'];
  for (const p of mine) {
    assert.ok(paths.includes(p), `AppleGameUI no longer looks up ${p}: the HUD may be wired to something stale`);
    assert.ok(at(hud(), p), `the HUD has no ${p}`);
  }
  assert.match(gameUi, /for _, name in \{ "ShopPanel", "UpgradePanel" \}/, 'AppleGameUI closes the panels it knows by these names');
  // the pieces AppleGameUI asks of a shop card, by the names it uses
  for (const child of ['Icon', 'ItemName', 'Info', 'Buy', 'Lock']) assert.match(gameUi, new RegExp(`card:FindFirstChild\\("${child}"\\)`), `AppleGameUI reads card.${child}`);
  assert.match(gameUi, /"Item_" \.\. id/);
});

test('plot sim HUD: one shop card per machine, with the children AppleGameUI wires', () => {
  const grid = at(hud(), 'ShopPanel.Body.Grid');
  const cards = grid.children.filter((c) => /^Item_/.test(c.name));
  assert.deepEqual(cards.map((c) => c.name), ITEMS.map((i) => `Item_${i.id}`));
  ITEMS.forEach((it, i) => {
    const card = cards[i];
    const child = (n) => (card.children ?? []).find((c) => c.name === n);
    assert.equal(child('Icon')?.className, 'Frame', `${card.name}: Icon is the Frame the machine's model turns in`);
    assert.equal(child('ItemName').props.Text, it.name);
    assert.match(child('Info').props.Text, /^\+[\d.]+[KMB]?\/s$/, `${card.name}: Info says what it earns`);
    assert.equal(child('Buy').className, 'ImageButton', `${card.name}: Buy is a button`);
    assert.match(child('Buy').children.find((c) => c.name === 'Label').props.Text, /^\$\d/, `${card.name}: the price is on the button`);
    assert.equal(child('Lock').props.Visible, false, `${card.name}: Lock starts hidden`);
    assert.ok(child('IconBubble'), `${card.name}: the icon bubble`);
    assert.equal(card.props.LayoutOrder, i);
  });
  assert.equal(at(hud(), 'ShopPanel.Body.Grid.Item_Press.Info').props.Text, '+1/s');
  assert.equal(at(hud(), 'ShopPanel.Body.Grid.Item_Mint.Info').props.Text, '+4.2K/s');
  assert.equal(at(hud(), 'ShopPanel.Body.Grid.Item_Mint.Buy.Label').props.Text, '$2.5M');
  assert.equal(at(hud(), 'ShopPanel.Body.Grid.Item_Press.IconBubble.Icon').props.Text, '⚙');
});

test('plot sim HUD: the upgrades panel, button, badge and cards are the ones AppleUpgradesClient finds', () => {
  // what the upgrades tool writes into the config the client reads
  const panelName = /panel: '(\w+)'/.exec(upTool)?.[1], buttonName = /button: '(\w+)'/.exec(upTool)?.[1];
  assert.ok(panelName && buttonName, 'read the names the upgrades tool configures');
  assert.match(upClient, /screen:FindFirstChild\(config\.panel/, 'the client looks the panel up as a child of the screen');
  const screen = hud();
  const panel = (screen.children ?? []).find((c) => c.name === panelName);
  assert.ok(panel, `a ${panelName} directly on the screen`);
  assert.equal(panel.props.Visible, false);
  const button = deep(screen, buttonName);
  assert.ok(button && button.className === 'ImageButton', `a ${buttonName} button`);
  assert.equal(at(screen, `Menu.${buttonName}`), button, 'it is in the menu');
  assert.equal(button.children.find((c) => c.name === 'Badge')?.props.Visible, false, 'a hidden red Badge on it');
  assert.ok(panel.children.some((c) => c.name === 'Close' && c.className === 'ImageButton'), 'a red Close on the panel');
  for (const n of ['Badge', 'Level', 'Text', 'Buy', 'Label', 'IconBubble', 'Close', 'Value']) {
    assert.match(upClient, new RegExp(`FindFirstChild\\("${n}"\\)`), `AppleUpgradesClient still looks for ${n}`);
  }
  // one card per upgrade, found by its id inside the panel, with what the client updates
  for (const u of UPGRADES) {
    const card = deep(panel, u.id);
    assert.ok(card, `a card named ${u.id}`);
    assert.equal(card.children.find((c) => c.name === 'Level').children.find((c) => c.name === 'Text').props.Text, 'Lv 0');
    assert.match(card.children.find((c) => c.name === 'Buy').children.find((c) => c.name === 'Label').props.Text, /^\$ \d/);
    assert.ok(card.children.some((c) => c.name === 'IconBubble'));
    assert.equal(card.children.find((c) => c.name === 'ItemName').props.Text, u.label);
  }
  assert.equal(deep(panel, 'faster').children.find((c) => c.name === 'Blurb').props.Text, '+10% speed');
  assert.equal(at(deep(panel, 'faster'), 'IconBubble.Icon').props.Text, '⚡');
  // the counter the client rolls: named like the currency's config (Coins here), with a Value
  assert.match(upClient, /find\(screen, config\.counter or currency\)/);
  assert.equal(at(screen, 'Coins.Value').className, 'TextLabel');
});

test('plot sim HUD: money counter with its caption and per-second label; Shop, Upgrades and Rebirth buttons', () => {
  const s = hud();
  assert.equal(at(s, 'Coins.Caption').props.Text, 'CASH');
  assert.equal(at(s, 'Coins.PerSecond').props.Text, '+0/s');
  assert.equal(at(s, 'Coins.Value').props.Text, '0');
  assert.equal(at(s, 'Coins.Plus').className, 'ImageButton');
  const menu = at(s, 'Menu');
  assert.deepEqual(menu.children.filter((c) => c.className === 'ImageButton').map((c) => c.name), ['Shop', 'Upgrades', 'Rebirth']);
  for (const name of ['Shop', 'Upgrades', 'Rebirth']) {
    const b = at(s, `Menu.${name}`);
    assert.ok(b.children.some((c) => c.name === 'Shine'), `${name} is glossy`);
    assert.ok(at(b, 'IconBubble.Icon'), `${name} has an icon`);
    assert.ok(at(b, 'Label'), `${name} has a label`);
  }
  assert.equal(at(s, 'Menu.Shop.Label').props.Text, 'MACHINES');
  assert.equal(at(s, 'Menu.Rebirth.Badge'), undefined, 'only Shop and Upgrades carry a Badge');
  assert.equal(at(s, 'Menu.Shop.Badge').props.Visible, false);
  assert.equal(at(s, 'Menu.Upgrades.Badge').props.Visible, false);
});

test('plot sim HUD: every panel starts hidden and has a Close; the rebirth panel can be used', () => {
  const s = hud();
  const panels = s.children.filter((c) => /Panel$/.test(c.name));
  assert.deepEqual(panels.map((p) => p.name), ['ShopPanel', 'UpgradesPanel', 'RebirthPanel']);
  for (const p of panels) {
    assert.equal(p.props.Visible, false, `${p.name} starts hidden`);
    assert.ok(p.children.some((c) => c.name === 'Close'), `${p.name} has a Close`);
    assert.ok(p.children.some((c) => c.name === 'Body') && p.children.some((c) => c.name === 'Header'));
  }
  assert.equal(at(s, 'RebirthPanel.Header.Title').props.Text, 'REBIRTH');
  assert.equal(at(s, 'RebirthPanel.Body.Confirm').className, 'ImageButton');
  assert.ok(at(s, 'RebirthPanel.Body.Bonus') && at(s, 'RebirthPanel.Body.Info'));
  assert.equal(at(s, 'Toast').props.Visible, false);
  assert.equal(at(s, 'ShopPanel.Header.Title').props.Text, 'MACHINES');
  assert.equal(at(s, 'UpgradesPanel.Header.Title').props.Text, 'BOOSTS');
});

test('plot sim HUD: studded like the rest (stud tile, outline, gradient) and no two siblings share a name', () => {
  const nodes = all(hud());
  const studded = nodes.filter((n) => n.props?.Image === U.STUD_IMAGE);
  assert.ok(studded.length > 30, `many studded surfaces (${studded.length})`);
  for (const n of studded) {
    assert.ok(n.children.some((c) => c.className === 'UICorner') && n.children.some((c) => c.className === 'UIStroke') && n.children.some((c) => c.className === 'UIGradient'), `${n.name} is a full studded surface`);
  }
  for (const n of nodes) {
    const names = (n.children ?? []).map((c) => c.name);
    assert.equal(new Set(names).size, names.length, `${n.name} has two children with one name: ${names.join(',')}`);
  }
  for (const n of nodes.filter((x) => x.className === 'TextLabel')) assert.equal(n.props.Font.v, 'Enum.Font.FredokaOne', `${n.name} is in the game font`);
});

test('plot sim HUD: words come from the game; it copes with no machines and a lot of them', () => {
  const plain = U.plotSimHud([], [], { currency: 'Gems' });
  assert.equal(at(plain, 'Coins.Caption').props.Text, 'GEMS');
  assert.equal(at(plain, 'Coins.PerSecond').props.Text, '+0/s');
  assert.equal(at(plain, 'Menu.Shop.Label').props.Text, 'SHOP');
  assert.equal(at(plain, 'ShopPanel.Body.Grid').children.filter((c) => /^Item_/.test(c.name)).length, 0);
  const many = U.plotSimHud(Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, name: `M${i}`, price: 10 + i, income: 1 + i })), [], { currency: 'Cash', perSecond: ' per sec' });
  const grid = at(many, 'ShopPanel.Body.Grid');
  assert.equal(grid.children.filter((c) => /^Item_/.test(c.name)).length, 12);
  assert.equal(grid.className, 'ScrollingFrame', 'twelve cards scroll');
  assert.equal(at(many, 'ShopPanel.Body.Grid.Item_m0.Info').props.Text, '+1 per sec');
  // the panel stays on a screen: two rows of cards at most, the rest scrolls
  assert.ok(many.children.find((c) => c.name === 'ShopPanel').props.Size.v[3] <= 40 + 30 + 2 * 236 + 14 + 26);
});

test('stud-ui: the lane-defense HUD and the generic studded screen are byte-for-byte what they were (a TRIPWIRE: look at the diff before re-recording)', () => {
  // studCard was lifted out of studdedScreen for the plot simulator; nothing that existed may have moved.
  const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
  const screen = U.studdedScreen({ name: 'X', pieces: [
    { kind: 'counter', name: 'Coins', text: '0', at: 'top-left', caption: 'Coins' },
    { kind: 'button', name: 'Upgrades', text: 'Up', at: 'left', badge: true },
    { kind: 'panel', name: 'P', title: 'T', cards: [{ name: 'a', label: 'A', price: '$1', icon: 'x', blurb: 'b', level: 'Lv 0' }, { name: 'b', label: 'B', price: '$2' }] },
  ] });
  assert.equal(hash(screen), 'd39ade4b4b51c86b');
  assert.equal(hash(U.waveDefenseHud([{ id: 'a', name: 'A', price: 5, blurb: 'x' }], { wave: 'Wave' })), 'aa546348cf3427e1');
});
