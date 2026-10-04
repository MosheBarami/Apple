/**
 * The modal and the honest pieces (phase T, game 1, flaws 13, 17, 18): a panel opened over the HUD buttons, which showed through
 * it; the cost on a Buy button was a bare number that never greyed out; the Rebirth button showed no cost and no progress and looked
 * available at zero; an icon bubble and its level badge overlapped. Each is held as a property of the instances written.
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
const out = join(mkdtempSync(join(tmpdir(), 'ump-')), 'm.mjs');
const ENTRY = `export * from './src/stud-ui';
export { readStudSpec } from './src/studded-ui-tool';`;
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), ['--bundle', '--format=esm', '--platform=neutral', '--main-fields=module,main', '--loader=ts', '--outfile=' + out], { cwd: WORKER, input: ENTRY, stdio: ['pipe', 'pipe', 'pipe'] });
const U = await import(`file://${out}`);
const luau = (p) => readFileSync(join(REPO, 'packages', 'components', p), 'utf8').replace(/--\[\[[\s\S]*?\]\]/g, '').replace(/--[^\n]*/g, '');

const all = (root, f = []) => { f.push(root); (root.children ?? []).forEach((c) => all(c, f)); return f; };
const child = (n, name) => (n.children ?? []).find((c) => c.name === name);
const panelsOf = (screen) => (screen.children ?? []).filter((c) => /Panel$/.test(c.name));
const card = (n, extra = {}) => ({ name: n, label: n, price: '40', icon: 'x', blurb: 'does a thing', level: 'Lv 0', ...extra });

const studded = (opts = {}) => U.studdedScreen({ name: 'HUD', pieces: [
  { kind: 'counter', name: 'Crystals', text: '0', icon: '\u{1F48E}', at: 'top-left' },
  { kind: 'panel', name: 'UpgradesPanel', title: 'Upgrades', cards: [card('A', opts), card('B')] },
] });

// ------------------------------------------------------------------------------------------------ flaw 13: the modal

test('every panel of every screen carries a dimmed backdrop as its first child, so the HUD behind it is dimmed and unreachable', () => {
  const screens = [
    studded(),
    U.waveDefenseHud([{ id: 'a', name: 'A', price: 5 }], { wave: 'Wave' }),
    U.plotSimHud([{ id: 'm', name: 'M', price: 5, income: 1 }], [{ id: 'u', label: 'U', cost: 5 }], { currency: 'Cash' }),
  ];
  let seen = 0;
  for (const screen of screens) {
    for (const panel of panelsOf(screen)) {
      seen += 1;
      const b = panel.children[0];
      assert.equal(b.name, 'Backdrop', `${panel.name}: the backdrop is under everything else in the panel`);
      assert.equal(b.className, 'Frame');
      assert.equal(b.props.Active, true, 'it swallows the tap, so a button behind it is not pressed');
      assert.equal(b.props.BackgroundColor3, '#000000');
      assert.ok(b.props.BackgroundTransparency > 0.2 && b.props.BackgroundTransparency < 0.7, 'dimmed, not black');
      assert.ok(b.props.Size.v[1] >= 4000 && b.props.Size.v[3] >= 4000, 'larger than any screen');
      assert.deepEqual(b.props.AnchorPoint.v, [0.5, 0.5]);
      assert.equal(b.props.Visible, undefined, 'it is shown and hidden with the panel, with no script');
      assert.equal(panel.props.Visible, false, 'the panel (and so the backdrop) starts hidden');
      const zs = panel.children.filter((c) => c !== b).map((c) => c.props?.ZIndex ?? 1);
      assert.ok(b.props.ZIndex < Math.min(...zs), 'under the body and the header');
      assert.ok(panel.children.some((c) => c.name === 'Close'), 'the panel still has its red X');
    }
  }
  assert.ok(seen >= 5, `${seen} panels checked`);
});

test('the panel is above the HUD regions, so the backdrop dims their buttons', () => {
  const screen = studded();
  const panel = child(screen, 'UpgradesPanel');
  assert.ok(panel.props.ZIndex >= 3, 'panel ZIndex');
  for (const region of screen.children.filter((c) => c.name.startsWith('Region_'))) assert.ok((region.props.ZIndex ?? 1) < panel.props.ZIndex, `${region.name} sits under the panel`);
});

// ------------------------------------------------------------------------------------------------ flaw 17: the card

test('on a card the level badge does not overlap the icon bubble', () => {
  const c = child(studded(), 'UpgradesPanel');
  const cardNode = all(c).find((n) => n.name === 'A');
  const bubble = child(cardNode, 'IconBubble').props, badge = child(cardNode, 'Level').props;
  const W = 160;
  const box = (p) => {
    const [xs, xo, ys, yo] = p.Position.v, [, w, , h] = p.Size.v, [ax, ay] = p.AnchorPoint.v;
    const x = xs * W + xo - ax * w, y = ys * 236 + yo - ay * h;
    return { x, y, w, h };
  };
  const b = box(bubble), t = box(badge);
  const r = b.w / 2, cx = b.x + r, cy = b.y + r;
  const nearestX = Math.max(t.x, Math.min(cx, t.x + t.w)), nearestY = Math.max(t.y, Math.min(cy, t.y + t.h));
  assert.ok(Math.hypot(nearestX - cx, nearestY - cy) >= r, 'the badge is clear of the circle');
  assert.ok(t.x + t.w <= W, 'and inside the card');
});

test('every "what it does" line on a card is one size, so a long one is not smaller than a short one', () => {
  const screen = U.studdedScreen({ name: 'HUD', pieces: [{ kind: 'panel', name: 'UpgradesPanel', title: 'U', cards: [
    card('A', { blurb: '+1 per press' }), card('B', { blurb: '+0.5 Crystals a second' }), card('C', { blurb: 'x2 everything' }),
  ] }] });
  const blurbs = all(screen).filter((n) => n.name === 'Blurb');
  assert.equal(blurbs.length, 3);
  for (const b of blurbs) {
    assert.equal(b.props.TextScaled, false);
    assert.equal(b.props.TextSize, 14);
    assert.equal(b.props.TextWrapped, true, 'wrapped, not shrunk');
  }
  // The item name and every other label still scale (only this line is fixed).
  assert.equal(all(screen).find((n) => n.name === 'ItemName').props.TextScaled, true);
});

test('a Buy button with a currency icon shows the icon beside the price and has a hidden Dim for when it cannot be paid', () => {
  const buy = (n) => child(all(child(studded(), 'UpgradesPanel')).find((c) => c.name === n), 'Buy');
  const plain = buy('A');
  assert.ok(!child(plain, 'Icon') && !child(plain, 'Dim'), 'no currency icon given: the button is what it was');
  const withIcon = U.studdedScreen({ name: 'HUD', pieces: [{ kind: 'panel', name: 'P', title: 'P', cards: [card('A', { priceIcon: '\u{1F48E}' })] }] });
  const b = child(all(withIcon).find((c) => c.name === 'A'), 'Buy');
  assert.equal(child(b, 'Icon').props.Text, '\u{1F48E}');
  assert.equal(child(b, 'Label').props.Text, '40', 'the price stays the number the script updates');
  assert.equal(child(b, 'Dim').props.Visible, false, 'greyed out only when the script says so');
  assert.ok(child(b, 'Dim').props.BackgroundTransparency < 1);
  const icon = child(b, 'Icon').props, label = child(b, 'Label').props;
  assert.ok(icon.Position.v[1] + icon.Size.v[0] * 100 < 40, 'the icon is at the left');
  assert.equal(label.AnchorPoint.v[0], 1, 'the price is at the right');
});

test('build_studded_ui: the Buy buttons of a panel carry the icon of what the counter shows, when the price is a plain number', () => {
  const read = (cards) => U.readStudSpec({ pieces: [
    { kind: 'counter', name: 'Crystals', text: '0', at: 'top-left', caption: 'Crystals' },
    { kind: 'panel', name: 'ShopPanel', title: 'Shop', cards },
  ] });
  const cards = read([{ name: 'A', label: 'A', price: '50' }, { name: 'B', label: 'B', price: '$5' }, { name: 'C', label: 'C', price: '1.2K' }]).pieces[1].cards;
  assert.equal(cards[0].priceIcon, '\u{1F48E}', 'a bare price is paid in crystals');
  assert.equal(cards[1].priceIcon, undefined, 'a price that already has its own symbol keeps it');
  assert.equal(cards[2].priceIcon, '\u{1F48E}');
  const none = U.readStudSpec({ pieces: [{ kind: 'panel', name: 'P', title: 'P', cards: [{ name: 'A', label: 'A', price: '5' }] }] }).pieces[0].cards[0];
  assert.equal(none.priceIcon, undefined, 'no counter on the screen: nothing to claim');
});

test('AppleUpgradesClient greys the Buy button while the price cannot be paid, and again when the money changes', () => {
  const client = luau('upgrades/AppleUpgradesClient.luau');
  assert.match(client, /button:FindFirstChild\("Dim"\)/);
  assert.match(client, /dim\.Visible = level >= \(u\.max or 100\) or \(player:GetAttribute\(currency\) or 0\) < cost\(u, level\)/);
  assert.match(client, /player:GetAttributeChangedSignal\(currency\):Connect\(refresh\)/, 'a change in the money re-checks every button');
});

// ------------------------------------------------------------------------------------------------ flaw 18: the rebirth button

const rebirth = (p = {}) => U.studdedScreen({ name: 'HUD', pieces: U.readStudSpec({ pieces: [{ kind: 'button', name: 'Rebirth', text: 'Rebirth', at: 'right', ...p }] }).pieces });
const rebirthButton = (screen) => all(screen).find((n) => n.name === 'Rebirth');

test('a rebirth button is premium coloured and shows its cost, its progress and a lock while it cannot be paid', () => {
  const b = rebirthButton(rebirth());
  assert.equal(child(b, 'Cost').className, 'TextLabel', 'a Cost line');
  assert.equal(child(child(b, 'Progress'), 'Fill').className, 'ImageLabel', 'a Progress bar with a Fill the script sizes');
  const lock = child(b, 'Lock');
  assert.ok(lock && lock.props.Visible !== false, 'locked until the script unlocks it (a new player has nothing)');
  assert.equal(lock.props.Active, true, 'a locked button cannot be pressed');
  assert.equal(child(b, 'Label').props.Text, 'Rebirth');
  const plain = all(U.studdedScreen({ name: 'HUD', pieces: U.readStudSpec({ pieces: [{ kind: 'button', name: 'Upgrades', text: 'Upgrades', at: 'right' }] }).pieces })).find((n) => n.name === 'Upgrades');
  assert.ok(plain, 'a plain Upgrades button to compare with');
  assert.notEqual(JSON.stringify(child(b, 'Tint')), JSON.stringify(child(plain, 'Tint')), 'it is not the Upgrades blue');
  const read = U.readStudSpec({ pieces: [{ kind: 'button', name: 'Prestige', text: 'Prestige', at: 'right' }, { kind: 'button', name: 'Shop', text: 'Shop', at: 'right' }] });
  assert.equal(read.pieces[0].progress, true, 'prestige is rebirth');
  assert.equal(read.pieces[0].colour, 'purple');
  assert.equal(read.pieces[1].progress, undefined, 'other buttons are plain');
});

test('progress can be asked for on any button, and refused on a rebirth', () => {
  const spec = (p) => U.readStudSpec({ pieces: [{ kind: 'button', name: 'Ascend', text: 'Ascend', at: 'right', ...p }] }).pieces[0];
  assert.equal(spec({ progress: true }).progress, true);
  const r = U.readStudSpec({ pieces: [{ kind: 'button', name: 'Rebirth', text: 'Rebirth', at: 'right', progress: false }] }).pieces[0];
  assert.equal(r.progress, undefined);
  assert.equal(r.colour, 'purple');
  assert.ok(!child(rebirthButton(U.studdedScreen({ name: 'HUD', pieces: [r] })), 'Lock'));
});

test('the plot simulator owns rebirth: its Rebirth button has the same pieces and its client script drives them', () => {
  const hud = U.plotSimHud([], [], { currency: 'Cash' });
  const b = child(child(hud, 'Menu'), 'Rebirth');
  for (const n of ['Cost', 'Progress', 'Lock']) assert.ok(child(b, n), `Rebirth.${n}`);
  assert.ok(child(child(b, 'Progress'), 'Fill'));
  assert.ok(child(b, 'IconBubble'), 'its picture is still there');
  const menu = child(hud, 'Menu');
  assert.ok(menu.props.Size.v[3] >= 64 + 64 + 80 + 28, 'the menu column is tall enough for the taller button');
  const client = luau('machines/AppleMachinesClient.luau');
  for (const n of ['Cost', 'Progress', 'Lock', 'Fill']) assert.match(client, new RegExp(`FindFirstChild\\("${n}"\\)`), `the client looks up ${n}`);
  assert.match(client, /lock\.Visible = have < need/, 'locked while the money is short of RebirthCost');
  assert.match(client, /GetAttributeChangedSignal\(currencyName\):Connect\(paintButton\)/, 'repainted when the money changes');
  assert.match(client, /GetAttributeChangedSignal\("RebirthCost"\):Connect\(paintButton\)/);
});
