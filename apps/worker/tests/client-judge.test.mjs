// The client judge's rules, one criterion at a time: what counts as a placeholder, an overlap, a dead button, progression, an
// error, a badly placed model and a feature nobody asked for. Pure functions over what get_tree and the play sessions return
// (the whole loop against a stand-in Studio is in client-judge-flow.test.mjs). Every "ok" case has a "not ok" twin, because a
// rule that cannot say no is not a rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const esbuild = await import(process.env.STUDPILOT_TEST_ESBUILD || 'esbuild');
const dir = mkdtempSync(join(tmpdir(), 'client-judge-'));
test.after(() => rmSync(dir, { recursive: true, force: true }));
const alias = { '@studpilot/shared': '../../packages/shared/src/index.ts' };
const load = async (name) => {
  await esbuild.build({ entryPoints: [`src/${name}.ts`], bundle: true, format: 'esm', platform: 'node', outfile: join(dir, `${name}.mjs`), alias });
  return import(pathToFileURL(join(dir, `${name}.mjs`)).href);
};
const U = await load('client-judge-ui');
const R = await load('client-judge-rules');
const J = await load('client-judge');

/* ------------------------------------------------------------------------------------------- tree builders --- */

const bool = (v) => ({ t: 'bool', v });
const str = (v) => ({ t: 'string', v });
const numv = (v) => ({ t: 'number', v });
const udim2 = (...v) => ({ t: 'UDim2', v });
const enumv = (v) => ({ t: 'EnumItem', v });
const props = (o) => {
  const p = {};
  if (o.pos) p.Position = udim2(...o.pos);
  if (o.size) p.Size = udim2(...o.size);
  if (o.anchor) p.AnchorPoint = { t: 'Vector2', v: o.anchor };
  if (o.visible !== undefined) p.Visible = bool(o.visible);
  if (o.enabled !== undefined) p.Enabled = bool(o.enabled);
  if (o.text !== undefined) p.Text = str(o.text);
  if (o.font) p.Font = enumv(o.font);
  if (o.bgT !== undefined) p.BackgroundTransparency = numv(o.bgT);
  if (o.bg) p.BackgroundColor3 = { t: 'Color3', v: o.bg };
  if (o.auto) p.AutomaticSize = enumv('Enum.AutomaticSize.' + o.auto);
  if (o.inset !== undefined) p.IgnoreGuiInset = bool(o.inset);
  if (o.ratio) p.AspectRatio = numv(o.ratio);
  if (o.radius !== undefined) p.CornerRadius = { t: 'UDim', v: [0, o.radius] };
  if (o.thickness !== undefined) p.Thickness = numv(o.thickness);
  return p;
};
/** A get_tree node. Children are nodes too; paths are filled in by `screen`. */
const n = (name, cls, o = {}, kids = []) => ({ name, class: cls, props: props(o), children: kids, ...(o.tag ? { attributes: { AppleLibraryGame: str(o.tag) } } : {}) });
const withPaths = (node, prefix) => { node.path = prefix + node.name; node.children = (node.children ?? []).map((c) => withPaths(c, node.path + '.')); return node; };
const screen = (name, kids = [], o = {}) => U.guiFrom(withPaths(n(name, 'ScreenGui', { enabled: o.enabled ?? true, ...o }, kids), 'game.StarterGui.'));
const look = ({ font = 'Enum.Font.GothamBold', radius = 12, stroke = true, bg = [0.3, 0.6, 0.3] } = {}) => [
  ...(radius ? [n('Corner', 'UICorner', { radius })] : []), ...(stroke ? [n('Stroke', 'UIStroke', { thickness: 3, enabled: true })] : []),
].map((x) => x);
/** A text node in a look (its own UICorner / UIStroke children). */
const label = (name, text, o = {}, l = {}) => n(name, 'TextLabel', { text, font: l.font ?? 'Enum.Font.GothamBold', bg: l.bg ?? [0.3, 0.6, 0.3], ...o }, look(l));
const button = (name, text, o = {}, l = {}) => n(name, 'TextButton', { text, font: l.font ?? 'Enum.Font.GothamBold', bg: l.bg ?? [0.3, 0.6, 0.3], ...o }, look(l));
const frame = (name, o = {}, kids = []) => n(name, 'Frame', { bg: [0.3, 0.6, 0.3], ...o }, kids);

/* ------------------------------------------------------------------------------------------- placeholders --- */

test('textKinds: the defaults, the unfinished, the copied and the made-up are named; real game words pass', () => {
  const kinds = (t, o) => R.textKinds(t, o);
  for (const t of ['Label', 'TextLabel', 'TextButton', 'Button', 'Text', 'Your text here', 'Lorem ipsum dolor sit amet', 'Test', 'asdfasdf', '???', 'TODO']) {
    assert.ok(kinds(t).includes('default_text'), `${t} is a default text`);
  }
  assert.deepEqual(kinds('Loading...'), ['loading']);
  assert.deepEqual(kinds('loading name...'), ['loading']);
  assert.ok(kinds('Please wait').includes('loading'));
  for (const t of ['nil', 'Cash: nil', 'Score: null', 'undefined', 'NaN', '[object Object]', 'Hello %s', 'Welcome, {0}', '<PlayerName>']) assert.ok(kinds(t).includes('nil_value'), `${t} shows an empty value`);
  for (const t of ['$299,999', '999999', '$1.5M', '1,000,000', '11111']) assert.ok(kinds(t).includes('fake_number'), `${t} is a made-up number`);
  assert.deepEqual(kinds('Para correr apretá Shift [borrar este cartel]').sort(), ['dev_note', 'foreign_language']);
  for (const t of ['Delete this', 'delete me', 'FIXME later', 'Spawn point (test)', 'DEBUG mode', 'Put the name here']) assert.ok(kinds(t).includes('dev_note'), `${t} is a note to a developer`);
  for (const t of ['Tienda', 'Comprar', 'Bem-vindo você', 'Привет', 'こんにちは', 'שלום', 'Willkommen', 'Presiona E para jugar']) assert.ok(kinds(t).includes('foreign_language'), `${t} is not English`);
  // Real words, real numbers and the things English shares with other languages pass.
  for (const t of ['Shop', 'Buy Seed $10', '$0', 'Cash: $1,250', '12,450', 'Plant a seed', 'Play', 'Sell all', 'Rebirth x3', 'Level 12', 'Café', 'X', 'Inventory (3/10)', '+1', 'Welcome to the garden!']) {
    assert.deepEqual(kinds(t), [], `${t} is fine`);
  }
  assert.deepEqual(kinds('', { cls: 'TextButton' }), ['empty_button']);
  assert.deepEqual(kinds('', { cls: 'TextLabel' }), []);
  assert.deepEqual(kinds('Loading...', { loadingScreen: true }), [], 'a loading screen may say loading');
  assert.deepEqual(kinds('Tienda', { foreignOk: true }), [], 'when the request is for another language');
});

test('textKinds: a question a player answers is not a note to a developer; a dummy number is a made-up one; a price is not', () => {
  const kinds = (t, o) => R.textKinds(t, o);
  for (const t of ['Are you sure you want to permanently delete this item?', '(Tap an item to remove)', '[Remove current Schematic]', '(Note: Higher detail may lag your device.)', 'Dont delete other players creations',
    'Check this box if your outfit includes a Pants item (for example, shorts and a tank top)', 'Delete this item']) assert.deepEqual(kinds(t), [], t);
  for (const t of ['You can delete this UI.', 'Do not delete this', '(Example does not work)', 'Debug Menu', '[delete me]', 'This Game is a Work in Progress!']) assert.ok(kinds(t).includes('dev_note'), t);
  for (const t of ['12345', '$123,456', '123456789', 'T$123,456', '$77777']) assert.ok(kinds(t).includes('fake_number'), `${t} is a number typed in by someone who never played`);
  for (const t of ['$50,000', '$1000000', '100000']) assert.equal(kinds(t, { numbersOk: true }).includes('fake_number'), false, `${t} as a price`);
  assert.equal(kinds('$2m/s').includes('fake_number'), false, 'an income rate is not a balance');
  assert.equal(kinds('$1000000').includes('fake_number'), true, 'a million on a HUD is a balance nobody has at the start; zeros are not "repeated digits"');
  assert.equal(kinds('$50,000').includes('fake_number'), false);
  assert.equal(kinds('0.00000').includes('fake_number'), false, 'a run of zeros is a small number, not a typed-in one');
  assert.equal(kinds('Cash 55555').includes('fake_number'), true);
});

test('wantsOtherLanguage reads the request, not the game', () => {
  assert.equal(R.wantsOtherLanguage('a shop game in Spanish'), true);
  assert.equal(R.wantsOtherLanguage('translate the whole game to hebrew'), true);
  assert.equal(R.wantsOtherLanguage('translate it into Hebrew'), true);
  assert.equal(R.wantsOtherLanguage('a game for players who love Spanish food'), false, 'only "in/to/into <language>" counts');
  assert.equal(R.wantsOtherLanguage('an original brainrot game'), false);
});

test('textFindings: one finding per distinct problem text with a count; what is off screen at the start is held to less; runtime copies do not multiply', () => {
  const card = (i) => ({ where: `Grid.Card${i}`, text: 'Label', cls: 'TextLabel', state: 'hidden', via: 'screen' });
  const items = [
    ...Array.from({ length: 50 }, (_, i) => card(i)),
    { where: 'HUD.Cash', text: '$299,999', cls: 'TextLabel', state: 'shown', via: 'screen' },
    { where: 'HUD.Cash', text: '$299,999', cls: 'TextLabel', state: 'runtime', via: 'player' },
    { where: 'HUD.Hit', text: '', cls: 'TextButton', state: 'hidden', via: 'screen' },
    { where: 'HUD.Blank', text: '', cls: 'TextButton', state: 'shown', via: 'screen' },
    { where: 'HUD.Good', text: 'Shop', cls: 'TextButton', state: 'shown', via: 'screen' },
  ];
  const found = R.textFindings(items, false);
  assert.equal(found.length, 2, JSON.stringify(found.map((f) => [f.kinds, f.text])));
  assert.equal(found.find((f) => f.text === 'Label'), undefined, 'a "Label" on cards inside a window is a template a script fills in');
  const cash = found.find((f) => f.text === '$299,999');
  assert.deepEqual([cash.count, cash.state, cash.seenByPlayer], [1, 'shown', true], 'the player\'s copy is the same label seen twice');
  assert.deepEqual(found.find((f) => f.kinds.includes('empty_button')).where, 'HUD.Blank', 'only the blank button the player can see');

  // Off screen at the start, a template's "Loading..." or "nil" is filled in by a script; a note to a developer or another language is not.
  const hidden = (text, cls = 'TextLabel') => ({ where: 'Shop.Card.Name', text, cls, state: 'hidden', via: 'screen' });
  const offscreen = R.textFindings([hidden('Loading...'), hidden('nil'), hidden('???'), hidden('$2,500,000'), hidden('Tienda'), hidden('[borrar]')], false);
  assert.deepEqual(offscreen.map((f) => [f.text, f.kinds]), [['Tienda', ['foreign_language']], ['[borrar]', ['dev_note', 'foreign_language']]]);
  assert.deepEqual(R.textFindings([hidden('Tienda')], true), [], 'unless the request is for another language');
});

test('textFindings: a big number is a made-up balance in the corner but an ordinary price on a card, a reward, an income or a leaderboard', () => {
  const at = (where, text) => ({ where, text, cls: 'TextLabel', state: 'shown', via: 'screen' });
  const found = R.textFindings([
    at('HUD.Bottom.Money', '$299,999'), at('Main.Stats.Cash', '$ 676,767'),
    at('Menus.Shop.ScrollingFrame.StarterPack.Reward3.Info', '$100,000'), at('GUI.shop.tab_4.item.itemCost', '$900,000'), at('MainGui.EggStock.CrystalEgg.Price', '$1,000,000'),
    at('Workspace.Signs.Rate', '$2M/s'), at('Main.Right.Leaderboard.Entry_00', '$593.9T'), at('Workspace.Gate.Required.Speed', '2.5M'),
  ], false);
  assert.deepEqual(found.map((f) => f.text), ['$299,999', '$ 676,767']);
  // A sign in the world shows prizes, leaderboards and prices whatever it is called; only a number typed in as a stand-in is a placeholder there.
  const sign = (text) => ({ where: 'Workspace.SurfaceGui_437e1.Wheel.Names.2', text, cls: 'TextLabel', state: 'shown', via: 'world' });
  assert.deepEqual(R.textFindings([sign('$275K'), sign('1,000,000')], false), []);
  assert.deepEqual(R.textFindings([sign('12345'), sign('$77777')], false).map((f) => f.text), ['12345', '$77777']);
});

test('purchaseHits: numeric ids in purchase calls and product assignments are someone else\'s unless they are the owner\'s', () => {
  const scripts = [
    { path: 'S.Store', source: 'MarketplaceService:PromptGamePassPurchase(player, 1234567)\nlocal ProductId = 9876543\n-- MarketplaceService:PromptProductPurchase(player, 5555555)\nMarketplaceService:PromptProductPurchase(player, cfg.Id)\nGamePassId = 0' },
    { path: 'S.Config', source: 'local passes = { VipGamePassId = 424242, Coins = 10000000 }' },
  ];
  const hits = R.purchaseHits(scripts, []);
  assert.deepEqual(hits.map((h) => h.id).sort((a, b) => a - b), [424242, 1234567, 9876543], 'commented code, variables, zero and unrelated numbers are not ids');
  assert.deepEqual(hits.find((h) => h.id === 1234567).line, 1);
  assert.deepEqual(R.purchaseHits(scripts, [1234567, 9876543, 424242]), [], 'the owner\'s own ids are fine');
  assert.deepEqual(R.purchaseHits([{ path: 'S', source: 'MarketplaceService:PromptGamePassPurchase(player, GAMEPASS)' }], []), []);
  const info = R.purchaseHits([{ path: 'S.Shop', source: 'local a = MarketplaceService:GetProductInfo(1234567, Enum.InfoType.Asset)\nlocal b = MarketplaceService:GetProductInfo(1234568)\nlocal c = MarketplaceService:GetProductInfo(7654321, "Product")\nlocal d = MarketplaceService:GetProductInfo(7654322, Enum.InfoType.GamePass)' }], []);
  assert.deepEqual(info.map((h) => h.id), [7654321, 7654322], 'reading a catalog item is not selling a product; asking about a product or a pass is');
});

test('scriptTexts reads the words a script puts on screen, not identifiers', () => {
  const t = R.scriptTexts([{ path: 'S.Hud', source: 'label.Text = "Para correr apretá Shift [borrar este cartel]"\nlocal x = { Title = "Welcome", Text = \'Hello there\' }\n-- label.Text = "commented out"\nlocal id = script.Name\nlocal r = obj.Text = "a.b"' }]);
  assert.deepEqual(t.map((x) => x.text).sort(), ['Hello there', 'Para correr apretá Shift [borrar este cartel]', 'Welcome']);
  assert.ok(t.every((x) => x.via === 'script' && x.state === 'hidden'));
});

test('judgePlaceholders: ok only with nothing found, evidence names the text and where it is', () => {
  const clean = R.judgePlaceholders({ items: [{ where: 'HUD.Cash', text: '$0', cls: 'TextLabel', state: 'shown', via: 'screen' }], purchases: [], foreignOk: false, scanned: { screens: 1, texts: 1, worldGuis: 0, worldGuisTotal: 0, scripts: 2, scriptsCut: false } });
  assert.deepEqual([clean.ok, clean.measured, clean.score], [true, true, 100]);
  const bad = R.judgePlaceholders({
    items: [{ where: 'HUD.Sign.Hint', text: 'Para correr apretá Shift [borrar este cartel]', cls: 'TextLabel', state: 'shown', via: 'screen' }],
    purchases: [{ id: 1234567, path: 'S.Store', line: 4, snippet: 'PromptGamePassPurchase(player, 1234567)' }],
    foreignOk: false, scanned: { screens: 1, texts: 1, worldGuis: 3, worldGuisTotal: 40, scripts: 9, scriptsCut: true },
  });
  assert.equal(bad.ok, false);
  assert.match(bad.evidence[0], /developer note \+ other language: "Para correr apretá Shift \[borrar este cartel\]" in HUD\.Sign\.Hint \[on screen at the start\]/);
  assert.match(bad.evidence[1], /Robux products that are not yours \(1\): 1234567 in S\.Store:4/);
  assert.match(bad.evidence.at(-1), /3 of 40 signs and name tags.*script list was cut short/);
  assert.ok(bad.score < 100 && bad.fix.length > 40);
  assert.match(bad.plain, /Para correr/, 'the plain sentence quotes the words the player sees');
});

/* -------------------------------------------------------------------------------------------- ui geometry --- */

test('layoutRects: scale, offset and anchor land where Roblox puts them; layout-driven and automatic pieces are left unplaced', () => {
  const s = screen('S', [
    frame('A', { pos: [0.5, 10, 0.5, 20], size: [0.25, 0, 0, 100], anchor: [0.5, 0.5] }, [frame('Inner', { pos: [0, 5, 0, 5], size: [0.5, 0, 0.5, 0] })]),
    frame('List', { pos: [0, 0, 0, 0], size: [0.2, 0, 0.2, 0] }, [n('Layout', 'UIListLayout'), frame('Item', { size: [1, 0, 0.1, 0] })]),
    frame('Auto', { size: [0, 50, 0, 50], auto: 'XY' }),
    frame('Tall', { size: [0.1, 0, 0, 100] }, [n('Ratio', 'UIAspectRatioConstraint', { ratio: 2 })]),
  ]);
  const vp = { id: 'desktop', w: 1000, h: 800 };
  const rects = U.layoutRects(s, vp);
  const at = (name) => rects.get(U.all(s).find((x) => x.name === name));
  // The screen leaves the 58 px top bar: usable height 742.
  assert.deepEqual(at('A'), { x: 500 + 10 - 125, y: 58 + 371 + 20 - 50, w: 250, h: 100 });
  assert.deepEqual(at('Inner'), { x: 500 + 10 - 125 + 5, y: 58 + 371 + 20 - 50 + 5, w: 125, h: 50 });
  assert.ok(at('List'), 'the container of a list is placed');
  assert.equal(at('Item'), undefined, 'what a UIListLayout arranges is not placed');
  assert.equal(at('Auto'), undefined, 'AutomaticSize decides its own size');
  assert.deepEqual([at('Tall').w, at('Tall').h], [100, 50], 'a 2:1 aspect constraint fits the box: 100 wide, 50 tall');
  const full = U.layoutRects(screen('T', [frame('F', { size: [1, 0, 1, 0] })], { inset: true }), vp);
  assert.equal([...full.values()].find((r) => r.w === 1000).y, 0, 'IgnoreGuiInset screens start at the top');
});

test('paths: the plugin writes a name that is not an identifier as ["name"]; the parts and the readable form come from that, not from the dots', () => {
  assert.deepEqual(U.pathParts('game.StarterGui.HUD.Cash'), ['game', 'StarterGui', 'HUD', 'Cash']);
  assert.deepEqual(U.pathParts('game.StarterGui["Shop Gui"]["Open/Close"].Buy'), ['game', 'StarterGui', 'Shop Gui', 'Open/Close', 'Buy']);
  assert.deepEqual(U.pathParts('game.StarterGui["Pack 1.5"]["say \\"hi\\""]'), ['game', 'StarterGui', 'Pack 1.5', 'say "hi"'], 'a dot or a quote inside a name is part of the name');
  assert.equal(U.readable('game.StarterGui["Shop Gui"]["Open/Close"].Buy', 'StarterGui'), 'Shop Gui.Open/Close.Buy');
  assert.equal(U.readable('game.Workspace["Coin 1"]', 'Workspace'), 'Coin 1');
  assert.equal(U.readable('game.ServerScriptService.Economy', 'StarterGui'), 'ServerScriptService.Economy');
  assert.equal(U.lastName('game.StarterGui["Shop Gui"]["Open/Close"]'), 'Open/Close');
  assert.deepEqual(['game.StarterGui.A', 'game.StarterGui["A b"].C', 'game.Workspace.A', 'game.StarterGuiX.A'].map(U.inStarterGui), [true, true, false, false]);
  assert.equal(U.isPathUnder('game.StarterGui["A b"].C', 'game.StarterGui["A b"]'), true);
  assert.equal(U.isPathUnder('game.StarterGui.A.B', 'game.StarterGui.A'), true);
  assert.equal(U.isPathUnder('game.StarterGui.AB', 'game.StarterGui.A'), false);
  // pickButtons finds the buttons of a screen with a space in its name.
  const withPath = (root, node) => { node.path = root; node.children = (node.children ?? []).map((c) => withPath(root + (/^[A-Za-z_]\w*$/.test(c.name) ? '.' + c.name : `["${c.name}"]`), c)); return node; };
  const spaced = U.guiFrom(withPath('game.StarterGui["Shop Gui"]', n('Shop Gui', 'ScreenGui', { enabled: true }, [button('Open/Close', 'Menu', { pos: [0.01, 0, 0.4, 0], size: [0.1, 0, 0.08, 0] })])));
  const found = U.pickButtons([spaced]);
  assert.deepEqual([found.total, found.picks.map((p) => p.path)], [1, ['game.StarterGui["Shop Gui"]["Open/Close"]']]);
});

test('overlaps: two screens\' widgets on top of each other are found, at the size where they overlap', () => {
  const hud = screen('HUD', [frame('Menu', { pos: [0.01, 0, 0.35, 0], size: [0.09, 0, 0.3, 0] })]);
  const pets = screen('PetsGui', [frame('Menu', { pos: [0.01, 0, 0.33, 0], size: [0.09, 0, 0.32, 0] })]);
  const found = U.overlaps([hud, pets]);
  assert.equal(found.length, 1);
  assert.deepEqual([found[0].what, found[0].a.endsWith('HUD.Menu') || found[0].b.endsWith('HUD.Menu')], ['widgets', true]);
  assert.ok(found[0].ratio > 0.9);
  assert.deepEqual(U.overlaps([hud]), [], 'one screen alone has nothing to clash with');
  assert.deepEqual(U.overlaps([hud, screen('Elsewhere', [frame('Menu', { pos: [0.8, 0, 0.35, 0], size: [0.09, 0, 0.3, 0] })])]), []);
  assert.deepEqual(U.overlaps([hud, screen('Off', [frame('Menu', { pos: [0.01, 0, 0.35, 0], size: [0.09, 0, 0.3, 0] })], { enabled: false })]), [], 'a disabled screen is not on the player\'s screen');
  assert.deepEqual(U.overlaps([hud, screen('Hid', [frame('Menu', { visible: false, pos: [0.01, 0, 0.35, 0], size: [0.09, 0, 0.3, 0] })])]), [], 'nor is a hidden window');
});

test('overlaps: a clash that exists only on a phone is found; buttons of one widget may touch', () => {
  // 0-300 px and 25%+0..200 px: apart on a 1600 px window (400-600), overlapping on an 844 px phone (211-411).
  const a = screen('A', [frame('Bar', { pos: [0, 0, 0, 0], size: [0, 300, 0, 100] })]);
  const b = screen('B', [frame('Bar', { pos: [0.25, 0, 0, 0], size: [0, 200, 0, 100] })]);
  const found = U.overlaps([a, b]);
  assert.deepEqual(found.map((o) => o.viewport), ['phone']);
  const pair = (x, y) => screen('P', [frame('Row', { pos: [0, 0, 0.5, 0], size: [0.5, 0, 0.1, 0] }, [button('One', 'One', { pos: [0, 0, 0, 0], size: [0.6, 0, 1, 0] }), button('Two', 'Two', { pos: [x, 0, 0, 0], size: [0.6, 0, 1, 0] })])]);
  assert.deepEqual(U.overlaps([pair(0.3)]), [], 'two buttons of the same widget are designed together');
  const two = [screen('X', [frame('W', { pos: [0, 0, 0.6, 0], size: [0.2, 0, 0.1, 0] }, [button('Go', 'Go', { size: [1, 0, 1, 0] })])]), screen('Y', [frame('W', { pos: [0.1, 0, 0.6, 0], size: [0.2, 0, 0.1, 0] }, [button('No', 'No', { size: [1, 0, 1, 0] })])])];
  const wb = U.overlaps(two);
  assert.ok(wb.some((o) => o.what === 'widgets'), 'their widgets overlap');
});

test('overlaps: a window that opens and closes is not a piece on the screen; two screens of one imported game are its own design', () => {
  const hud = screen('HUD', [frame('Cash', { pos: [0.4, 0, 0.45, 0], size: [0.1, 0, 0.1, 0] }, [button('Go', 'Go', { size: [1, 0, 1, 0] })])]);
  // A shop as it is usually authored: a see-through container, the panel drawn by what is inside; and one with a picture behind it.
  const shopBody = (x) => frame('Body', { bgT: 1, pos: [0.3, 0, 0.2, 0], size: [0.4, 0, 0.6, 0] }, [frame('Back', { pos: [0, 0, 0, 0], size: [1, 0, 1, 0], bgT: 0.2 }, [button('Buy', 'Buy', { pos: [0.4 + x, 0, 0.4, 0], size: [0.2, 0, 0.1, 0] }), label('Title', 'Shop', { size: [1, 0, 0.1, 0] }), label('Note', 'Seeds', { pos: [0, 0, 0.8, 0], size: [1, 0, 0.1, 0] })])]);
  const shop = screen('ShopGui', [shopBody(0)]);
  assert.deepEqual(U.overlaps([hud, shop]), [], 'the shop window covers the cash counter only while it is open');
  const [ui] = [U.layoutRects(shop, U.VIEWPORTS[0])];
  const body = U.all(shop).find((x) => x.name === 'Body');
  assert.equal(U.isWindow(body, ui.get(body), U.VIEWPORTS[0]), true);
  assert.equal(U.isWindow(U.all(hud).find((x) => x.name === 'Cash'), U.layoutRects(hud, U.VIEWPORTS[0]).get(U.all(hud).find((x) => x.name === 'Cash')), U.VIEWPORTS[0]), false, 'a counter is a piece of the screen');
  const root = screen('Root', [frame('Fill', { bgT: 1, size: [1, 0, 1, 0] }, ['A', 'B', 'C', 'D'].map((t, i) => button(t, t, { pos: [0.1 * i, 0, 0, 0], size: [0.08, 0, 0.1, 0] })))]);
  const fill = U.all(root).find((x) => x.name === 'Fill');
  assert.equal(U.isWindow(fill, U.layoutRects(root, U.VIEWPORTS[0]).get(fill), U.VIEWPORTS[0]), false, 'a see-through container as big as the screen is where the HUD is laid out');
  // Two HUD pieces of two games are the defect; the same two pieces from ONE game are how it was designed.
  const piece = (name, tag) => screen(name, [frame('Menu', { pos: [0.01, 0, 0.35, 0], size: [0.09, 0, 0.3, 0] }, [button('A', 'A', { size: [1, 0, 0.4, 0] })])], { tag });
  assert.equal(U.overlaps([piece('One', 'aaaa'), piece('Two', 'bbbb')]).length, 1, 'the menus on top of each other; their buttons are the same finding');
  assert.deepEqual(U.overlaps([piece('One', 'aaaa'), piece('Two', 'aaaa')]), []);
  assert.equal(U.overlaps([piece('One', 'aaaa'), piece('Two')]).length, 1, 'one imported, one built here');
  assert.equal(U.overlaps([piece('One'), piece('Two')]).length, 1, 'two built here');
});

test('pickButtons: the buttons outside windows are the ones that crowd the screen while nothing is open', () => {
  const hud = screen('HUD', [frame('Menu', { pos: [0, 0, 0.3, 0], size: [0.1, 0, 0.3, 0], bgT: 1 }, ['A', 'B', 'C'].map((t) => button(t, t, { size: [1, 0, 0.3, 0] })))]);
  const shop = screen('Shop', [frame('Panel', { pos: [0.2, 0, 0.1, 0], size: [0.6, 0, 0.8, 0] }, ['A', 'B', 'C', 'D', 'E'].map((t) => button('Buy' + t, 'Buy ' + t, { size: [0.2, 0, 0.2, 0] })))]);
  const r = U.pickButtons([hud, shop]);
  assert.deepEqual([r.total, r.hud], [8, 3]);
});

test('menuClusters: a small container of 3+ short buttons is a menu set; a big shop grid is not; two sets on one edge compete', () => {
  const menu = (name, side, labels) => screen(name, [frame('Menu', { pos: [side === 'left' ? 0.01 : 0.9, 0, 0.35, 0], size: [0.08, 0, 0.3, 0], bgT: 1 }, labels.map((l) => button(l, l, { size: [1, 0, 0.3, 0] })))]);
  const hud = menu('HUD', 'left', ['Shop', 'Seeds', 'Index']);
  const pets = menu('PetsGui', 'left', ['Pets', 'Eggs', 'Hatch', 'Trade']);
  const right = menu('Settings', 'right', ['Music', 'Sound', 'Help']);
  const shop = screen('ShopGui', [frame('Panel', { pos: [0.2, 0, 0.1, 0], size: [0.6, 0, 0.8, 0] }, ['A', 'B', 'C', 'D'].map((l) => button(l, 'Buy ' + l, { size: [0.2, 0, 0.2, 0] })))]);
  const clusters = U.menuClusters([hud, pets, right, shop]);
  assert.deepEqual(clusters.map((c) => [c.screen, c.side, c.buttons.length]).sort(), [['HUD', 'left', 3], ['PetsGui', 'left', 4], ['Settings', 'right', 3]], 'the shop panel is 48% of the screen: not a menu');
  const rivals = U.competingMenus(clusters);
  assert.equal(rivals.length, 1);
  assert.deepEqual(rivals[0].map((c) => c.screen).sort(), ['HUD', 'PetsGui']);
  assert.deepEqual(U.competingMenus(U.menuClusters([hud, right])), [], 'a left set and a right set are not fighting');
  // Two screens of ONE imported game are its own design (its HUD and its side bar); two games' screens are two systems.
  const tagged = (name, labels, tag) => screen(name, [frame('Menu', { pos: [0.01, 0, 0.35, 0], size: [0.08, 0, 0.3, 0], bgT: 1 }, labels.map((l) => button(l, l, { size: [1, 0, 0.3, 0] })))], { tag });
  assert.deepEqual(U.competingMenus(U.menuClusters([tagged('Hud', ['A', 'B', 'C'], 'aaaa'), tagged('Side', ['D', 'E', 'F'], 'aaaa')])), []);
  assert.equal(U.competingMenus(U.menuClusters([tagged('Hud', ['A', 'B', 'C'], 'aaaa'), tagged('Side', ['D', 'E', 'F'], 'bbbb')])).length, 1);
  assert.equal(U.competingMenus(U.menuClusters([tagged('Hud', ['A', 'B', 'C'], 'aaaa'), menu('Mine', 'left', ['D', 'E', 'F'])])).length, 1, 'one imported, one built here');
  // Buttons put straight on the screen along an edge are a set too.
  const bare = screen('Bare', ['A', 'B', 'C'].map((l, i) => button(l, l, { pos: [0.01, 0, 0.3 + i * 0.1, 0], size: [0.05, 0, 0.08, 0] })));
  assert.deepEqual(U.menuClusters([bare]).map((c) => [c.side, c.buttons.length]), [['left', 3]]);
});

test('menuClusters: a container inside another qualifying container is reported once, by the inner one, also when the names have spaces in them', () => {
  const shortBtn = (name, text) => button(name, text, { size: [1, 0, 0.2, 0] });
  const outer = n('Side Menu', 'Frame', { pos: [0.01, 0, 0.3, 0], size: [0.1, 0, 0.4, 0], bgT: 1 }, [
    shortBtn('A1', 'A1'), shortBtn('A2', 'A2'), shortBtn('A3', 'A3'),
    n('Button Row', 'Frame', { pos: [0, 0, 0.6, 0], size: [1, 0, 0.4, 0], bgT: 1 }, [shortBtn('B1', 'B1'), shortBtn('B2', 'B2'), shortBtn('B3', 'B3')]),
  ]);
  const at = (root, node) => { node.path = root; node.children = (node.children ?? []).map((c) => at(root + (/^[A-Za-z_]\w*$/.test(c.name) ? '.' + c.name : `["${c.name}"]`), c)); return node; };
  const gui = U.guiFrom(at('game.StarterGui.HUD', n('HUD', 'ScreenGui', { enabled: true }, [outer])));
  const found = U.menuClusters([gui]);
  assert.deepEqual(found.map((c) => c.buttons), [['B1', 'B2', 'B3']], 'one menu set, named by its inner row');
});

test('pickButtons: a button whose path is longer than a press can name is set aside, and still counts as on the screen', () => {
  const deep = (depth) => { let node = button('Buy', 'Buy', { pos: [0.1, 0, 0.1, 0], size: [0.1, 0, 0.1, 0] }); for (let i = 0; i < depth; i++) node = frame('L' + 'x'.repeat(20) + i, { size: [1, 0, 1, 0] }, [node]); return node; };
  const gui = screen('Deep', [deep(10)]);
  const r = U.pickButtons([gui]);
  assert.ok(U.all(gui).find((x) => x.name === 'Buy').path.length < 320);
  assert.deepEqual([r.total, r.picks.length, r.skipped.length], [1, 1, 0], 'ten levels still fit');
  const tooDeep = U.pickButtons([screen('Deep', [deep(14)])]);
  assert.deepEqual([tooDeep.total, tooDeep.picks.length], [1, 0]);
  assert.match(tooDeep.skipped[0].why, /path is too long/);
});

test('styleClashes: two or more differences from the main screen read as another game; one does not; thin screens are ignored', () => {
  const words = (l) => [label('T', 'Title', {}, l), button('A', 'Buy', {}, l), button('B', 'Sell', {}, l), label('C', 'Cash', {}, l), label('D', 'Gems', {}, l)];
  const garden = screen('HUD', words({}));
  const pets = screen('PetsGui', words({ font: 'Enum.Font.SourceSans', radius: 0, stroke: false, bg: [0.05, 0.05, 0.08] }));
  const clash = U.styleClashes([garden, pets]);
  assert.equal(clash.length, 1);
  assert.deepEqual([clash[0].base.screen, clash[0].other.screen], ['HUD', 'PetsGui']);
  assert.deepEqual(clash[0].differs.sort(), ['corners', 'font', 'outlines'], 'dark against mid colours is not a difference; dark against light is');
  const light = screen('Light', words({ font: 'Enum.Font.Cartoon', bg: [0.95, 0.95, 0.9] }));
  assert.deepEqual(U.styleClashes([pets, light])[0].differs.sort(), ['colours', 'corners', 'font', 'outlines'], 'dark against light is a difference');
  assert.match(U.describeStyle(clash[0].other), /SourceSans, square corners, no outlines, dark colours/);
  const sameFamily = screen('Kit', words({ font: 'Enum.Font.Gotham' }));
  assert.deepEqual(U.styleClashes([garden, sameFamily]), [], 'Gotham and GothamBold are one family');
  const oneDiff = screen('Fonty', words({ font: 'Enum.Font.Cartoon' }));
  assert.deepEqual(U.styleClashes([garden, oneDiff]), [], 'a different font alone is not another game');
  assert.deepEqual(U.styleClashes([garden, screen('Thin', [label('T', 'Hi', {}, { font: 'Enum.Font.SourceSans', radius: 0, stroke: false })])]), [], 'a screen with a couple of texts says too little');
  assert.deepEqual(U.styleClashes([garden]), []);
});

test('pickButtons: what a player can press at the start, in the order a session should press it; what a Studio test cannot try is set aside', () => {
  const hud = screen('HUD', [
    button('Fun', 'Fun'), button('Settings', 'Settings'), button('Collect', 'Collect'), button('Shop', 'Shop'), button('Close', 'X'),
    button('Robux', 'Buy Robux'), button('Rejoin', 'Rejoin'), button('Vip', 'VIP'), button('Tp', 'Teleport to Lobby'), button('Dc', 'Join our Discord'),
    frame('Hidden', { visible: false }, [button('Inner', 'Buy Inner')]),
  ]);
  const off = screen('Off', [button('Nope', 'Collect all')], { enabled: false });
  const { picks, skipped, total } = U.pickButtons([hud, off]);
  assert.deepEqual(picks.map((p) => [p.label, p.role]), [['Collect', 'action'], ['Fun', 'other'], ['Settings', 'open'], ['Shop', 'open'], ['X', 'close']]);
  assert.deepEqual(skipped.map((s) => s.label), ['Buy Robux', 'Rejoin', 'VIP', 'Teleport to Lobby', 'Join our Discord']);
  assert.equal(total, 10, 'the buttons in a hidden window and on a disabled screen are not on the first screen');
  assert.ok(picks.every((p) => p.path.startsWith('game.StarterGui.HUD.')));
  const many = screen('Many', Array.from({ length: 40 }, (_, i) => button('B' + i, 'Item ' + i)));
  assert.equal(U.pickButtons([many]).picks.length, 15, 'at most what three sessions can press');
});

test('pickFlow: the opener that is visible and the buy buttons of the window it opens, even on another (disabled) screen', () => {
  const hud = screen('HUD', [button('ShopButton', 'Shop'), button('Fun', 'Fun')]);
  const shop = screen('ShopGui', [frame('Panel', {}, [button('BuySeed', 'Buy Seed $10'), button('Close', 'X'), button('Equip', 'Equip')])], { enabled: false });
  const { picks } = U.pickButtons([hud, shop]);
  const flow = U.pickFlow([hud, shop], picks);
  assert.equal(flow.opener.label, 'Shop');
  assert.deepEqual(flow.inner.map((b) => b.label), ['Buy Seed $10', 'Equip'], 'buy and equip buttons, not the closer');
  assert.equal(flow.panel, 'game.StarterGui.ShopGui.Panel');
  const openWindow = screen('ShopGui', [frame('Panel', {}, [button('BuySeed', 'Buy Seed $10')])]);
  assert.equal(U.pickFlow([hud, openWindow], U.pickButtons([hud, openWindow]).picks), null, 'a window that is already open is not a flow');
  assert.equal(U.pickFlow([screen('HUD', [button('Fun', 'Fun')])], picks.filter((p) => p.label === 'Fun')), null);
});

/* ---------------------------------------------------------------------------------- coherence, as a verdict --- */

test('judgeCoherence: names the overlap, the rival menus and the clashing looks; passes a clean start', () => {
  const words = (l) => [label('T', 'Title', {}, l), button('A', 'Buy', {}, l), button('B', 'Sell', {}, l), label('C', 'Cash', {}, l), label('D', 'Gems', {}, l)];
  const menu = (name, labels, l = {}) => screen(name, [frame('Menu', { pos: [0.01, 0, 0.35, 0], size: [0.08, 0, 0.3, 0], bgT: 1 }, labels.map((t) => button(t, t, { size: [1, 0, 0.3, 0] }, l))), ...words(l)]);
  const good = menu('HUD', ['Shop', 'Seeds', 'Index']);
  const pets = menu('PetsGui', ['Pets', 'Eggs', 'Hatch'], { font: 'Enum.Font.SourceSans', radius: 0, stroke: false, bg: [0.05, 0.05, 0.08] });
  const input = (screens, extra = {}) => ({
    overlaps: U.overlaps(screens), menus: U.menuClusters(screens), clashes: U.styleClashes(screens), shownScreens: screens.map((s) => s.name), shownButtons: 6,
    layout: [], sources: new Map([['PetsGui', 'Full Pet System']]), cutScreens: 0, scriptDrawn: [], ...extra,
  });
  const bad = R.judgeCoherence(input([good, pets]));
  assert.equal(bad.ok, false);
  assert.ok(bad.evidence.some((e) => /Screens on top of each other: HUD\.Menu and PetsGui\.Menu/.test(e)));
  assert.ok(bad.evidence.some((e) => /Two sets of left-edge menu buttons: HUD .* and PetsGui \(from "Full Pet System"\)/.test(e)));
  assert.ok(bad.evidence.some((e) => /Looks like two different games: HUD is .*PetsGui \(from "Full Pet System"\) is SourceSans/.test(e)));
  assert.equal(bad.score, 50, 'an overlap (20), a rival menu set (15) and a clashing look (15)');
  const clean = R.judgeCoherence(input([good]));
  assert.deepEqual([clean.ok, clean.score], [true, 100]);
  const layout = R.judgeCoherence(input([good], { layout: [{ screen: 'HUD', device: 'phone_landscape', kind: 'text_overflow', path: 'game.StarterGui.HUD.Menu.Shop', detail: 'its text does not fit its box' }] }));
  assert.equal(layout.ok, false);
  assert.match(layout.evidence.join('\n'), /Layout text overflow \(1\): HUD\.Menu\.Shop its text does not fit/);
  assert.equal(R.judgeCoherence(input([good], { layout: [{ screen: 'HUD', device: 'desktop', kind: 'low_contrast', path: 'x', detail: 'd' }] })).ok, true, 'low contrast alone is not a coherence defect');
  // Tripwire on purpose: these two numbers were measured on the owner library (95% of 267 finished games show at most 6 screens and 20
  // buttons outside windows). Change them only with a new measurement.
  assert.deepEqual([R.CROWDED_SCREENS, R.CROWDED_BUTTONS], [8, 20]);
  const names = (n) => Array.from({ length: n }, (_, i) => 's' + i);
  assert.equal(R.judgeCoherence(input([good], { shownScreens: names(R.CROWDED_SCREENS + 1) })).ok, false, 'nine screens on at the start is a crowd');
  assert.equal(R.judgeCoherence(input([good], { shownScreens: names(R.CROWDED_SCREENS) })).ok, true, 'eight is the most a finished game in the owner library shows');
  assert.equal(R.judgeCoherence(input([good], { shownButtons: R.CROWDED_BUTTONS + 1 })).ok, false, 'twenty-one buttons outside windows is a crowd');
  assert.equal(R.judgeCoherence(input([good], { shownButtons: R.CROWDED_BUTTONS })).ok, true);
  assert.match(R.judgeCoherence(input([good], { layout: null })).evidence.join('\n'), /not measured/);
});

/* ------------------------------------------------------------------------------------------------- buttons --- */

const play = (o = {}) => R.readPlay({
  playerJoined: true, characterSpawned: true, clientReported: true, stage: 'done', screenGuis: [], clientErrors: [], serverErrors: [], clientWarnings: [], serverWarnings: [],
  leaderstatsBefore: [{ name: 'Cash', value: 0 }], leaderstatsAfter: [{ name: 'Cash', value: 0 }], touches: [], presses: [], ...o,
}, o.index ?? 1, o.seconds ?? 5);
const pr = (path, o = {}) => ({ path, found: true, visible: true, pressed: true, activated: true, activations: 1, changes: ['X became visible'], ...o });

test('classifyPresses: a press that changed something works, one that changed nothing is silent, one that never fired is dead', () => {
  const states = R.classifyPresses(play({ presses: [
    pr('a', { changes: ['leaderstats Cash 0 → 5'] }), pr('b', { changes: [] }), pr('c', { activated: false, changes: [] }), pr('d', { found: false }), pr('e', { visible: false }), pr('f', { pressed: false, activated: false, error: 'not pressed' }),
  ] })).map((o) => [o.path, o.state]);
  assert.deepEqual(states, [['a', 'works'], ['b', 'silent'], ['c', 'dead'], ['d', 'missing'], ['e', 'hidden'], ['f', 'unpressable']]);
  // h: only a timer ticked, nothing answered the press; g: the game listens for the click another way, and its window opened
  const other = R.classifyPresses(play({ presses: [pr('h', { activated: false, changes: ['attribute NextSeedRestock 266 → 265'] }), pr('g', { activated: false, changes: ['Main.Index became visible'] })] }));
  assert.deepEqual(other.map((o) => [o.path, o.state]), [['h', 'dead'], ['g', 'works']]);
});

test('classifyPresses: a press that failed after an earlier press opened a window over it is blocked, not dead; a retry replaces it', () => {
  const first = R.classifyPresses(play({ presses: [pr('shop', { changes: ['ShopGui.Panel became visible'] }), pr('seeds', { activated: false, changes: [] }), pr('index', { activated: false, changes: [] })] }));
  assert.deepEqual(first.map((o) => o.state), ['works', 'blocked', 'blocked']);
  const retry = R.classifyPresses(play({ index: 2, presses: [pr('index', { activated: false, changes: [] }), pr('seeds', { changes: ['Seeds.Panel became visible'] })] }));
  const final = R.latestOutcomes([...first, ...retry]);
  assert.deepEqual([...final.values()].map((o) => [o.path, o.state, o.session]), [['shop', 'works', 1], ['seeds', 'works', 2], ['index', 'dead', 2]], 'pressed first, with nothing open, a button that never fires is dead');
  assert.equal(R.latestOutcomes([...retry, ...first]).get('seeds').state, 'works', 'an earlier blocked never hides a later result');
});

test('latestOutcomes: the best result over the sessions stands; a button that worked once works', () => {
  const o = (state, session) => ({ path: 'b', state, changes: [], session });
  const best = (...states) => R.latestOutcomes(states.map((s, i) => o(s, i + 1))).get('b').state;
  assert.equal(best('works', 'dead'), 'works');
  assert.equal(best('dead', 'works'), 'works');
  assert.equal(best('blocked', 'dead'), 'dead');
  assert.equal(best('dead', 'blocked'), 'dead');
  assert.equal(best('missing', 'silent'), 'silent');
  assert.equal(best('unpressable', 'blocked'), 'blocked');
});

test('judgeButtons: all working passes; one dead button fails and is named; silent ones are tolerated up to a third', () => {
  const labels = new Map([['game.StarterGui.HUD.Shop', 'Shop'], ['game.StarterGui.HUD.Pets', 'Pets']]);
  const out = (state, path = 'game.StarterGui.HUD.Shop') => ({ path, state, changes: state === 'works' ? ['X became visible'] : [], session: 1 });
  const run = (outcomes, extra = {}) => R.judgeButtons({ outcomes, labels, total: outcomes.length, skipped: [], virtualInputMissing: false, ...extra });
  const good = run([out('works'), out('works', 'game.StarterGui.HUD.Pets')]);
  assert.deepEqual([good.ok, good.measured, good.score >= 90], [true, true, true]);
  const dead = run([out('works'), out('dead', 'game.StarterGui.HUD.Pets')]);
  assert.equal(dead.ok, false);
  assert.match(dead.evidence[0], /Does nothing: "Pets" \(HUD\.Pets\) was pressed with a real click and the button never fired/);
  assert.equal(dead.score, 50);
  const silent = run([out('works', 'a'), out('works', 'b'), out('silent', 'c')]);
  assert.equal(silent.ok, true, 'one silent button in three is a Buy that could not be afforded, not a dead screen');
  assert.equal(run([out('works', 'a'), out('silent', 'b')]).ok, false, 'half silent is not');
  assert.equal(run([out('silent', 'a'), out('silent', 'b')]).ok, false, 'nothing that works is not');
  const none = R.judgeButtons({ outcomes: [], labels, total: 0, skipped: [], virtualInputMissing: false });
  assert.deepEqual([none.ok, none.measured], [true, true], 'a first screen without buttons has nothing to press');
  const unpressed = R.judgeButtons({ outcomes: [], labels, total: 4, skipped: [], virtualInputMissing: false });
  assert.deepEqual([unpressed.ok, unpressed.measured], [false, false], 'buttons that exist but were never pressed are NOT a pass');
  const noVirtual = R.judgeButtons({ outcomes: [out('unpressable')], labels, total: 1, skipped: [], virtualInputMissing: true });
  assert.deepEqual([noVirtual.ok, noVirtual.measured], [false, false]);
  const blocked = run([out('works'), out('blocked', 'game.StarterGui.HUD.Pets')]);
  assert.ok(blocked.evidence.some((e) => /Not verified: "Pets" could not be reached after another window opened over it/.test(e)));
});

test('judgeButtons: every button dead at once points at one cover, and names the full-screen piece that takes the clicks', () => {
  const outcomes = ['One', 'Two', 'Three', 'Four'].map((n) => ({ path: 'game.StarterGui.HUD.' + n, state: 'dead', changes: [], session: 1 }));
  const all = R.judgeButtons({ outcomes, labels: new Map(), total: 4, skipped: [], virtualInputMissing: false, covers: ['HUD.Tutorial'] });
  assert.equal(all.ok, false);
  assert.match(all.evidence[0], /^All 4 buttons that were pressed are dead together, which points to one thing covering them or taking the clicks \(on the player's screen: HUD\.Tutorial\), not to 4 broken scripts$/);
  assert.match(all.fix, /^If every button is dead, look first for what covers them/);
  const some = R.judgeButtons({ outcomes: [...outcomes.slice(0, 3), { path: 'game.StarterGui.HUD.Five', state: 'works', changes: ['X became visible'], session: 1 }], labels: new Map(), total: 4, skipped: [], virtualInputMissing: false, covers: ['HUD.Tutorial'] });
  assert.doesNotMatch(some.evidence.join('\n'), /dead together/, 'one that works shows nothing covers them all');
  assert.match(some.evidence.join('\n'), /Something on the player's screen can take clicks meant for a button under it: HUD\.Tutorial/);
  // Which pieces take clicks: a shown piece of half the screen or more that is a button or has Active on; a see-through frame does not.
  const active = (name, o = {}) => n(name, 'Frame', { size: [1, 0, 1, 0], bgT: 0.5, ...o });
  const withActive = (node) => { node.props.Active = { t: 'bool', v: true }; return node; };
  const scr = screen('HUD', [withActive(active('Tutorial')), active('Glass'), withActive(active('Closed', { visible: false })), withActive(active('Small', { size: [0.3, 0, 0.3, 0] })), button('Skip', 'Skip', { size: [0.9, 0, 0.9, 0] })]);
  assert.deepEqual(U.coveringPieces([scr]), ['HUD.Tutorial', 'HUD.Skip'], 'not the frame that lets clicks through, the one that is closed, or the small one');
  assert.deepEqual(U.coveringPieces([screen('Off', [withActive(active('Tutorial'))], { enabled: false })]), []);
});

test('planSession: at most five presses a session, the collecting buttons wait for the walk, blocked ones go first, the shop flow goes last', () => {
  const mk = () => ({ acts: ['A1', 'A2'], rest: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7'] });
  const pool = mk();
  const s1 = J.planSession(1, pool, [], ['coin1', 'coin2'], null);
  assert.deepEqual([s1.seconds, s1.touch, s1.press], [15, [], ['R1', 'R2', 'R3', 'R4', 'R5']], 'the long wait, no touches, navigation buttons only');
  const s2 = J.planSession(2, pool, ['R2'], ['coin1', 'coin2'], null);
  assert.deepEqual([s2.touch, s2.press], [['coin1', 'coin2'], ['R2', 'A1', 'A2', 'R6', 'R7']], 'walk onto the coins first; then the retry, the collectors, what is left');
  const flowPool = mk();
  J.planSession(1, flowPool, [], [], null);
  const s3 = J.planSession(3, flowPool, ['R9'], [], { opener: 'Shop', inner: ['Buy1', 'Buy2'] });
  assert.equal(s3.press.length, 5);
  assert.deepEqual(s3.press.slice(-3), ['Shop', 'Buy1', 'Buy2'], 'the opener comes right before the buttons of its window');
  const solo = J.planSession(1, mk(), [], ['coin1'], null, 1);
  assert.deepEqual(solo.press, ['R1', 'R2', 'R3', 'R4', 'R5'], 'five slots, navigation first');
  const soloFew = J.planSession(1, { acts: ['A1', 'A2'], rest: ['R1'] }, [], [], null, 1);
  assert.deepEqual(soloFew.press, ['R1', 'A1', 'A2'], 'with one session there is no later walk, so the collectors go now');
  const onlyActs = J.planSession(1, { acts: ['A1', 'A2'], rest: [] }, [], [], null);
  assert.deepEqual(onlyActs.press, ['A1', 'A2'], 'nothing else to press');
  for (const p of [s1, s2, s3, solo]) assert.ok(p.press.length <= 5 && p.touch.length <= 5);
});

/* ---------------------------------------------------------------------------------------------- progression --- */

const moves = (p, labels = new Map()) => R.movesOf(p, labels);

test('movesOf: standing still, walking onto a part and pressing a button each say what moved', () => {
  const passive = moves(play({ seconds: 15, leaderstatsBefore: [{ name: 'Cash', value: 0 }], leaderstatsAfter: [{ name: 'Cash', value: 30 }] }));
  assert.deepEqual(passive.map((m) => [m.step, m.name, m.from, m.to]), [['standing in the game for 15 s', 'Cash', 0, 30]]);
  const walk = moves(play({ index: 2, touches: [
    { path: 'game.Workspace.Coins.Coin1', found: true, leaderstatsAfter: [{ name: 'Cash', value: 5 }] },
    { path: 'game.Workspace.Coins.Coin2', found: true, leaderstatsAfter: [{ name: 'Cash', value: 10 }] },
    { path: 'game.Workspace.Ghost', found: false },
  ] }));
  assert.deepEqual(walk.map((m) => [m.step, m.from, m.to]), [['walking onto Coins.Coin1', 0, 5], ['walking onto Coins.Coin2', 5, 10]]);
  const pressed = moves(play({ presses: [pr('game.StarterGui.Shop.Buy', { changes: ['leaderstats Cash 10 → 0', 'leaderstats Seeds none → 1', 'WalkSpeed 16 → 20', 'HUD.Cash text "$10" → "$0"', 'Shop.Panel became visible', 'Level up! text "a" → "b"'] })] }), new Map([['game.StarterGui.Shop.Buy', 'Buy']]));
  assert.deepEqual(pressed.map((m) => [m.name, m.from, m.to, m.kind]), [['Cash', 10, 0, 'currency'], ['Seeds', null, 1, 'currency'], ['WalkSpeed', 16, 20, 'body'], ['HUD.Cash', 10, 0, 'ui']]);
  assert.ok(pressed.every((m) => m.step === 'pressing "Buy"'));
  assert.deepEqual(moves(play({})), [], 'nothing moved, nothing listed');
  // The plugin names a label by its path, and Roblox names have spaces in them ("Cash Frame"): the HUD counter is still a counter.
  const spaced = moves(play({ presses: [pr('game.StarterGui.HUD.Collect', { changes: ['HUD.Cash Frame.Amount text "$0" → "$25"'] })] }));
  assert.deepEqual(spaced.map((m) => [m.name, m.from, m.to, m.kind]), [['HUD.Cash Frame.Amount', 0, 25, 'ui']]);
  // Money kept outside leaderstats: the plugin reads the HUD counters 2 s in, after the wait and touches, and after the presses.
  const c = (name, text) => ({ name, text });
  const hud = (first, afterWait, afterPresses) => ({ hud: { first, afterWait, afterPresses } });
  const idle = moves(play({ seconds: 15, leaderstatsBefore: null, leaderstatsAfter: null, ...hud([c('Main.Bottom.Money', '$0')], [c('Main.Bottom.Money', '$1.5K')], null) }));
  assert.deepEqual(idle.map((m) => [m.step, m.name, m.from, m.to]), [['standing in the game for 15 s', 'Main.Bottom.Money', 0, 1500]]);
  const walked = moves(play({ index: 2, leaderstatsBefore: null, leaderstatsAfter: null, touches: [{ path: 'game.Workspace.Coins.Coin1', found: true }, { path: 'game.Workspace.Coins.Coin2', found: true }], ...hud([c('HUD.Cash Frame.Amount', 'Cash: 10')], [c('HUD.Cash Frame.Amount', 'Cash: 40')], null) }));
  assert.deepEqual(walked.map((m) => [m.step, m.from, m.to]), [['walking onto Coins.Coin1 and 1 more', 10, 40]]);
  const bought = moves(play({ presses: [pr('game.StarterGui.Shop.Buy')], ...hud([c('Main.Money', '$100')], [c('Main.Money', '$100')], [c('Main.Money', '$75')]) }), new Map([['game.StarterGui.Shop.Buy', 'Buy Seed']]));
  assert.deepEqual(bought.map((m) => [m.step, m.from, m.to]), [['pressing "Buy Seed"', 100, 75]]);
  assert.deepEqual(moves(play({ ...hud([c('Main.Money', '$100')], [c('Main.Money', '$100')], null) })), [], 'a counter that did not move did not pay');
  assert.deepEqual(moves(play({ ...hud(null, [c('Main.Money', '$100')], null) })), [], 'without the first look there is nothing to compare');
  assert.deepEqual(moves(play({ ...hud([c('Main.Money', '$5')], [c('Other.Money', '$50')], null) })), [], 'a counter is compared with itself');
  const clock = moves(play({ seconds: 15, leaderstatsBefore: [{ name: 'PlayTime', value: 0 }, { name: 'Cash', value: 1 }], leaderstatsAfter: [{ name: 'PlayTime', value: 15 }, { name: 'Cash', value: 1 }] }));
  assert.deepEqual(clock, [], 'time played is not something the player earned');
  const restock = moves(play({ presses: [pr('game.StarterGui.Main.Seeds.TextButton', { changes: ['attribute NextSeedRestock 266 → 265', 'attribute Money 400 → 360'] })] }));
  assert.deepEqual(restock.map((m) => m.name), ['Money'], 'a shop\'s restock countdown ticking down is no spending');
});

test('judgeProgression: a loop the quick test cannot play (plant, then wait for a wave) passes only in a built library game that ran clean, with its counter and goals on screen', () => {
  const input = (extra = {}) => ({ plays: [play()], moves: [], goals: ['Rebirth', 'Index'], currencies: [], noStats: true, counters: ['Main.Bottom.Money'],
    knownLoop: ['Buy a Cactus seed at the seed shop.', 'Plant it in a lane on your plot.', 'Brainrots walk down the lanes; your plants defeat them for money.', 'Rebirth.'], cleanRun: true, ...extra });
  const known = R.judgeProgression(input());
  assert.deepEqual([known.ok, known.measured, known.score], [true, true, 70]);
  assert.match(known.evidence[0], /^Earning was not seen in the quick test: in this game it takes steps the test does not take \(Buy a Cactus seed at the seed shop; Plant it in a lane on your plot; Brainrots walk/);
  assert.match(known.fix, /^Do not rewrite the money loop/);
  for (const [why, extra] of [['not a built library game', { knownLoop: undefined }], ['errors while playing', { cleanRun: false }], ['no money counter on screen', { counters: [] }], ['no long-term goal', { goals: [] }]]) {
    assert.equal(R.judgeProgression(input(extra)).ok, false, why);
  }
  const earn = { session: 2, step: 'walking onto Coins.Coin1', name: 'Cash', from: 0, to: 5, kind: 'currency' };
  assert.doesNotMatch(R.judgeProgression(input({ moves: [earn] })).evidence.join('\n'), /Earning was not seen/, 'what the test saw comes first');
  const byId = (ok) => ['placeholders', 'ui_coherence', 'buttons_work', 'errors', 'construction', 'fit_uniqueness'].map((id) => ({ id, ok, measured: true, score: 100, evidence: [], fix: '', plain: '' }));
  const verdict = R.compose([...byId(true), known], []);
  assert.equal(verdict.verdict, 'ready');
  assert.match(verdict.forUser, /my quick test could not play it all the way through, so play one round yourself/);
  assert.doesNotMatch(verdict.forUser, /it has real progression/);
});

test('judgeProgression: earn and spend passes; earn without spend, or neither, fails with the loop that was seen', () => {
  const input = (mv, extra = {}) => ({ plays: [play()], moves: mv, goals: ['Rebirth'], currencies: ['Cash'], noStats: false, ...extra });
  const earn = { session: 2, step: 'walking onto Coins.Coin1', name: 'Cash', from: 0, to: 5, kind: 'currency' };
  const spend = { session: 3, step: 'pressing "Buy Seed"', name: 'Cash', from: 20, to: 10, kind: 'currency' };
  const both = R.judgeProgression(input([earn, spend]));
  assert.deepEqual([both.ok, both.score], [true, 100]);
  assert.ok(both.evidence[0].startsWith('Moved by walking onto Coins.Coin1: Cash 0 -> 5'));
  assert.ok(both.evidence.some((e) => e.startsWith('Moved by pressing "Buy Seed": Cash 20 -> 10')));
  const onlyEarn = R.judgeProgression(input([earn]));
  assert.equal(onlyEarn.ok, false);
  assert.match(onlyEarn.evidence.join('\n'), /Earning works, but no buy or upgrade button was pressed .*so spending was not tried/, 'nothing was pressed: not tried, not "nothing to buy"');
  const tried = R.judgeProgression(input([earn], { spendTried: 2 }));
  assert.match(tried.evidence.join('\n'), /Earning works, but pressing 2 buy\/upgrade buttons after earning took no money and gave nothing/);
  assert.match(R.judgeProgression(input([earn], { spendTried: 1 })).evidence.join('\n'), /pressing 1 buy\/upgrade button after earning/);
  assert.match(onlyEarn.plain, /could not see anything they can spend it on/);
  const upgrade = R.judgeProgression(input([earn, { session: 3, step: 'pressing "Speed"', name: 'WalkSpeed', from: 16, to: 20, kind: 'body' }]));
  assert.equal(upgrade.ok, true, 'a speed upgrade is something bought');
  const nothing = R.judgeProgression(input([], { currencies: ['Cash', 'Coins'] }));
  assert.equal(nothing.ok, false);
  assert.match(nothing.evidence.join('\n'), /Nothing the player earned moved in ~25 s of play \(stats: Cash, Coins\)/);
  assert.match(nothing.plain, /In the test nothing could be earned/);
  assert.match(R.judgeProgression(input([], { noStats: true, currencies: [] })).evidence.join('\n'), /no leaderstats folder and no money counter the judge could recognise on screen .*: there is no currency at all, or it is shown some other way/);
  // A game that keeps its money in a data module has a counter on the HUD and no leaderstats: it has a currency, and the judge says so.
  const hudOnly = R.judgeProgression(input([], { noStats: true, currencies: [], counters: ['Main.Bottom.Money'] }));
  assert.match(hudOnly.evidence.join('\n'), /keeps its money outside leaderstats \(counters: Main\.Bottom\.Money\); none of them moved/);
  assert.doesNotMatch(hudOnly.evidence.join('\n'), /no currency at all/);
  // A loop through proximity prompts was not tried, and the judge does not claim there is none.
  const prompted = R.judgeProgression(input([], { prompts: ['Harvest', 'Sell'] }));
  assert.match(prompted.evidence.join('\n'), /Not exercised: the world has 2 proximity prompt\(s\) \(Harvest, Sell\)/);
  assert.match(prompted.plain, /^I could not confirm that players can earn/);
  assert.equal(prompted.ok, false, 'not tried is not a pass');
  assert.doesNotMatch(R.judgeProgression(input([earn, spend], { prompts: ['Sell'] })).evidence.join('\n'), /Not exercised/, 'the note is for the case where nothing was earned');
  assert.equal(R.judgeProgression(input([earn, spend], { goals: [] })).ok, true, 'a missing long-term goal costs points, not the verdict');
  assert.equal(R.judgeProgression(input([earn, spend], { goals: [] })).score, 75);
  const walking = { session: 1, step: 'pressing "Shop"', name: 'Cash', from: 5, to: 0, kind: 'currency' };
  assert.equal(R.judgeProgression(input([walking])).ok, false, 'spending with nothing earned is still no loop');
  const blind = R.judgeProgression({ plays: [play({ playerJoined: false })], moves: [], goals: [], currencies: [], noStats: false });
  assert.deepEqual([blind.ok, blind.measured], [false, false], 'no player, no verdict');
});

/* ---------------------------------------------------------------------------------------------------- errors --- */

test('summariseErrors: private-asset failures are counted apart, repeats collapse, Studio\'s own noise is dropped, endless waits are named', () => {
  const s = R.summariseErrors([
    play({ clientErrors: [{ message: 'Failed to load sound rbxassetid://123: not authorized' }, { message: 'PetsGui.Client:12: attempt to index nil', source: 'game.StarterGui.PetsGui.Client' }, { message: 'ApplePlayCheckClient boom' }], serverErrors: [{ message: 'Economy:4: bad argument' }], clientWarnings: [{ message: 'Infinite yield possible on \'ReplicatedStorage:WaitForChild("PetEvents")\'' }, { message: 'Failed to load animation rbxassetid://9 (403)' }] }),
    play({ index: 2, clientErrors: [{ message: 'PetsGui.Client:12: attempt to index nil' }, { message: 'Failed to load sound rbxassetid://456: not authorized' }] }),
  ]);
  assert.deepEqual(s.errors.map((e) => [e.side, e.message]), [['client', 'PetsGui.Client:12: attempt to index nil'], ['server', 'Economy:4: bad argument']]);
  assert.equal(s.privateAssets, 2, 'two different private assets, counted');
  assert.deepEqual(s.yields, ['ReplicatedStorage:WaitForChild("PetEvents")']);
});

test('judgeErrors: errors and endless waits fail, private assets alone pass with a note, no player means not measured', () => {
  const clean = R.judgeErrors([play(), play({ index: 2 })]);
  assert.deepEqual([clean.ok, clean.score], [true, 100]);
  assert.match(clean.evidence[0], /No script errors in 2 play session/);
  const priv = R.judgeErrors([play({ clientErrors: [{ message: 'Failed to load sound rbxassetid://1: not authorized' }] })]);
  assert.equal(priv.ok, true);
  assert.match(priv.evidence.join('\n'), /1 sound\/animation\/image assets failed to load because they are private/);
  const bad = R.judgeErrors([play({ clientErrors: [{ message: 'X:1: oops', source: 'game.StarterGui.X' }], serverWarnings: [{ message: "Infinite yield possible on 'Workspace:WaitForChild(\"Gone\")'" }] })]);
  assert.equal(bad.ok, false);
  assert.match(bad.evidence[0], /client error: X:1: oops \(game\.StarterGui\.X\)/);
  assert.match(bad.evidence[1], /waits forever for something that is not there: Workspace:WaitForChild\("Gone"\)/);
  assert.equal(bad.score, 70);
  const waiting = R.judgeErrors([play({ clientWarnings: [{ message: "Infinite yield possible on 'ReplicatedStorage:WaitForChild(\"Remotes\")'" }] })]);
  assert.equal(waiting.ok, false, 'a script that waits forever for a missing folder never starts its feature, even though it throws nothing');
  assert.equal(waiting.score, 90);
  // Code loaded from a Roblox asset id is not code anybody here wrote, and it fails the day the id goes private.
  const scripts = [
    { path: 'game.ServerScriptService.Loader', source: 'local m = require(123456789)\nlocal x = require(script.Parent.Module)\n-- require(987654321)\nlocal y = require(game.ReplicatedStorage.Shared)' },
    { path: 'game.ServerScriptService["Old Free Model"]', source: 'require( 111222333 ).start()' },
  ];
  const remote = R.remoteRequires(scripts);
  assert.deepEqual(remote.map((r) => [r.path, r.line, r.id]), [['game.ServerScriptService.Loader', 1, 123456789], ['game.ServerScriptService["Old Free Model"]', 1, 111222333]], 'a module in the project, a comment and a short number are not remote');
  const loaded = R.judgeErrors([play()], remote);
  assert.equal(loaded.ok, false, 'no error was thrown and the code is still not the project\'s');
  assert.match(loaded.evidence.join('\n'), /2 places in the code load a module from a Roblox asset id.*require\(123456789\) in ServerScriptService\.Loader:1; require\(111222333\) in ServerScriptService\.Old Free Model:1/);
  assert.equal(loaded.score, 70);
  assert.match(loaded.plain, /loads code from outside the project/);
  assert.equal(R.judgeErrors([play()], []).ok, true);
  const none = R.judgeErrors([play({ playerJoined: false, characterSpawned: false, clientReported: false })]);
  assert.deepEqual([none.ok, none.measured], [false, false]);
  const half = R.judgeErrors([play({ clientReported: false })]);
  assert.equal(half.ok, true);
  assert.match(half.evidence.join('\n'), /client did not answer/, 'a session whose client never answered cannot vouch for client errors');
});

/* ------------------------------------------------------------------------------------------- construction --- */

const facts = (over = {}) => ({ items: [], spawns: [{ path: 'game.Workspace.SpawnLocation', center: [0, 0.5, 0], canCollide: true, overlapCount: 0, groundHit: true }], originGround: null, groundY: 1, notChecked: 0, itemsSeen: 0, asked: true, ...over });
const item = (over = {}) => ({ path: 'game.Workspace.Tree', name: 'Tree', tagged: false, center: [10, 5, 10], size: [4, 8, 4], bottomY: 1, topY: 9, overlapCount: 0, overlapping: [], floating: false, gapBelow: 0, groundHit: true, ...over });

test('constructionFindings: floating, overlapping, hanging over nothing, default names, far, buried and sky-high are found; sane models are not', () => {
  const find = (i, over) => R.constructionFindings(facts({ items: [item(i)], ...over }));
  assert.deepEqual(find({}), []);
  assert.match(find({ floating: true, gapBelow: 26 })[0], /Tree floats 26 studs above the ground/);
  assert.deepEqual(find({ name: 'Sky Platform', path: 'game.Workspace.Sky Platform', floating: true, gapBelow: 30 }), [], 'a platform is meant to be up there');
  assert.match(find({ overlapCount: 2, overlapping: ['game.Workspace.Wall.Part1'] })[0], /Tree overlaps 2 other part\(s\) \(Wall\.Part1\)/);
  assert.match(find({ groundHit: false, floating: true })[0], /Tree hangs over empty space/);
  assert.match(find({ name: 'Part', path: 'game.Workspace.Part' })[0], /default name \("Part"\)/);
  assert.match(find({ center: [900, 5, 0], tagged: true })[0], /stands 900 studs from the spawn/);
  assert.match(find({ center: [20, -30, 0], bottomY: -34, topY: -26, tagged: true })[0], /buried under the map \(its top is 27 studs below/);
  assert.match(find({ center: [10, 600, 0], bottomY: 596, topY: 604 })[0], /studs up in the sky/);
  assert.deepEqual(find({ tagged: true, floating: true, overlapCount: 5, gapBelow: 40 }), [], 'an imported piece is the original\'s design: only where it stands is judged');
  assert.equal(find({ center: [400, -70, 0], bottomY: -74, topY: -66, tagged: true }).length, 1, 'far below the start and away from it is buried too');
  assert.deepEqual(find({ center: [400, -30, 0], bottomY: -34, topY: -26, tagged: true }), [], 'a lower level of a big map is not');
  assert.deepEqual(find({ center: [400, 2, 0], tagged: true }), [], '400 studs away is a big map, not a lost piece');
});

test('constructionFindings: the spawn is checked; a missing one, an occupied one and one over nothing are found', () => {
  assert.deepEqual(R.constructionFindings(facts()), []);
  assert.match(R.constructionFindings(facts({ spawns: [], originGround: true }))[0], /no spawn point, so players start at the world origin/);
  assert.match(R.constructionFindings(facts({ spawns: [], originGround: false }))[0], /fall out of the world/);
  assert.match(R.constructionFindings(facts({ spawns: [{ path: 'game.Workspace.Spawn', overlapCount: 3, canCollide: true, groundHit: true }] }))[0], /Spawn Spawn is inside something \(3 parts overlap it\)/);
  assert.deepEqual(R.constructionFindings(facts({ spawns: [{ path: 'game.Workspace.SpawnFallback', overlapCount: 2, canCollide: false, groundHit: true }] })), [], 'a script\'s invisible marker is stood on top of');
  assert.match(R.constructionFindings(facts({ spawns: [{ path: 'game.Workspace.Spawn', canCollide: false, groundHit: false }] }))[0], /cannot be stood on and nothing is under it/);
  assert.deepEqual(R.constructionFindings(facts({ spawns: [{ path: 'game.Workspace.Spawn', canCollide: true, groundHit: false }] })), [], 'a solid spawn over the void is a floating island, not a fall');
});

test('constructionFindings: a test player who ended far below where they started fell out of the world; one who walked a long way did not', () => {
  const stood = (...ys) => ys.map((y, i) => ({ when: ['at the spawn', 'after 15 s', 'after the touches'][i] + ' in session 1', pos: [0, y, 0] }));
  assert.deepEqual(R.constructionFindings(facts({ stood: stood(3, 3, 60) })), [], 'higher, or on a hill, is not a fall');
  assert.deepEqual(R.constructionFindings(facts({ stood: stood(3, -20, 3) })), [], 'a dip is not a fall');
  assert.match(R.constructionFindings(facts({ stood: stood(3, -140) }))[0], /^The test player fell out of the world: after 15 s in session 1 it stood 141 studs below the ground it started on \(height -140\)\.$/);
  // Started high (a sky lobby) and stayed there: fine. Started high and dropped past the ground the spawn stands on: a fall.
  assert.deepEqual(R.constructionFindings(facts({ groundY: 1000, stood: stood(1003, 1003, 1003) })), []);
  assert.equal(R.constructionFindings(facts({ groundY: 1000, stood: stood(1003, 400) })).length, 1);
  const judged = R.judgeConstruction(facts({ stood: stood(3, 3, 3) }));
  assert.equal(judged.ok, true);
  assert.match(judged.evidence.at(-1), /The test player's height was read 3 times during play/);
  assert.doesNotMatch(judged.evidence.at(-1), /inferred from the ground under the spawn/);
  assert.match(R.judgeConstruction(facts()).evidence.at(-1), /inferred from the ground under the spawn, not observed/, 'with no reading the old honesty stays');
});

test('judgeConstruction: ok with nothing found, not ok with a list, not measured when Studio did not answer', () => {
  assert.deepEqual([R.judgeConstruction(facts({ items: [item()] })).ok, R.judgeConstruction(facts()).score], [true, 100]);
  const bad = R.judgeConstruction(facts({ items: [item({ floating: true, gapBelow: 12 }), item({ name: 'Part', path: 'game.Workspace.Part' })], notChecked: 4, itemsSeen: 30 }));
  assert.equal(bad.ok, false);
  assert.match(bad.evidence.at(-1), /Checked 2 objects \(2 added by StudPilot, 0 imported\) of 30 in the world.*4 more were not checked.*inferred from the ground under the spawn/);
  assert.equal(bad.score, 84);
  const dark = R.judgeConstruction(facts({ asked: false }));
  assert.deepEqual([dark.ok, dark.measured], [false, false]);
});

/* ---------------------------------------------------------------------------------------------------- fit --- */

const nm = (where, text) => ({ where, text });
/** What a game about seeds and brainrots cannot help naming: without these the request's own nouns would be "missing". */
const core = [nm('screen Shop', 'Seed Shop'), nm('Workspace', 'Brainrot Base')];
const fitInput = (o = {}) => ({ request: 'an original grow a garden game', names: core, texts: [], currencies: ['Cash'], currencyScreens: [], shopWindows: [], duplicateScreens: [], menus: [], sourceNames: [], sourceCount: 3, ...o });
const kinds = (input) => R.fitFindings(input).map((f) => f.kind + ':' + f.text);

test('fitFindings: a pet system in a garden game is unrequested; asked for, or in a pet game, it is not', () => {
  const pets = [nm('screen PetsGui', 'PetsGui'), nm('screen PetsGui', 'Hatch')];
  const found = R.fitFindings(fitInput({ names: [...pets, ...core] }));
  assert.equal(found.length, 1);
  assert.match(found[0].text, /^a pet and egg system is in the game \(Pets Gui in screen PetsGui; Hatch in screen PetsGui\) but the request for a garden or farming game does not call for it$/);
  assert.equal(found[0].kind, 'unrequested');
  assert.deepEqual(R.fitFindings(fitInput({ names: [...pets, ...core], request: 'a garden game where you can also hatch pets' })), [], 'the user asked for pets');
  assert.deepEqual(R.fitFindings(fitInput({ names: pets, request: 'a pet simulator' })), [], 'a pet game has pets');
  assert.deepEqual(R.fitFindings(fitInput({ names: pets, request: 'make me something fun' })), [], 'with no genre to judge by, only the always-wrong leftovers are flagged');
});

test('fitFindings: what comes from a game the user named is what the user asked for; the same names from another game are not', () => {
  const eggs = (source) => [nm('screen Main', 'Egg Opening'), nm('screen Main', 'Admin Panel')].map((x) => ({ ...x, source }));
  const likePvb = R.fitFindings(fitInput({ request: 'make a game like Plants vs Brainrots with seeds', names: [...eggs('Plants vs Brainrots'), ...core] }));
  assert.deepEqual(likePvb, [], 'eggs and an admin panel of the game the user asked for are its own');
  const other = R.fitFindings(fitInput({ request: 'make a game like Plants vs Brainrots with seeds', names: [...eggs('Full Pet System'), ...core] }));
  assert.equal(other.length, 2, 'the same names from a game the user did not name are still extras');
  assert.equal(R.fitFindings(fitInput({ request: 'a garden game', names: [...eggs('Plants vs Brainrots'), ...core] })).length, 2, 'and when the user did not name it at all');
  assert.equal(R.fitFindings(fitInput({ request: 'a Plants vs Brainrots game', names: [...eggs('Plants vs Brainrots (2)'), ...core] })).length, 0, 'a copy number or a "fully working" tag in the library name is not part of it');
  // What the named game brings still counts as being there when the request asks for it.
  assert.deepEqual(R.fitFindings(fitInput({ request: 'a Plants vs Brainrots game with pets', names: [{ ...nm('s', 'Hatch'), source: 'Plants vs Brainrots' }, ...core] })).filter((f) => f.kind === 'missing'), []);
});

test('fitFindings: admin panels, events, duels, codes and Robux stores are leftovers unless asked for, in any genre', () => {
  const leftovers = [nm('screen A', 'Admin Commands'), nm('screen H', 'Halloween Event'), nm('ServerScriptService', 'Duels Machine'), nm('screen C', 'Redeem code'), nm('screen S', 'Buy VIP with Robux')];
  const found = R.fitFindings(fitInput({ names: leftovers, request: 'make me something fun' }));
  assert.deepEqual(found.map((f) => f.kind), ['leftover', 'leftover', 'leftover', 'leftover', 'leftover']);
  assert.match(found.map((f) => f.text).join('\n'), /an admin or commands panel[\s\S]*seasonal event[\s\S]*duels or battle arena[\s\S]*redeem-codes box[\s\S]*Robux or game pass store/);
  assert.deepEqual(R.fitFindings(fitInput({ names: [...leftovers, nm('s', 'Sword')], request: 'a fighting game with duels, admin commands, a halloween event, promo codes and a vip gamepass' })), []);
  assert.deepEqual(R.fitFindings(fitInput({ names: [nm('screen H', 'Halloween Event')], request: 'a scary horror game' })), [], 'a horror game may have Halloween');
  assert.equal(R.fitFindings(fitInput({ names: [nm('s', 'PetsFrame'), ...core], request: 'a brainrot game' })).length, 1, 'pets in a brainrot game are the owner\'s own example of foolish');
  assert.deepEqual(R.fitFindings(fitInput({ names: [nm('s', 'Seeds shop'), ...core], request: 'a brainrot game' })), [], 'Plants vs Brainrots is a brainrot game with seeds');
  assert.equal(R.fitFindings(fitInput({ names: [nm('s', 'Sword'), ...core], request: 'a grow a garden game' })).length, 1, 'weapons in a garden');
});

test('fitFindings: a request whose own nouns nothing in the game mentions is missing what it asked for; naming it anywhere is enough', () => {
  const missing = (request, names, texts = []) => R.fitFindings(fitInput({ request, names, texts })).filter((f) => f.kind === 'missing');
  const empty = missing('an original brainrot game', [nm('Workspace', 'Baseplate'), nm('screen HUD', 'Shop')]);
  assert.equal(empty.length, 1, 'a shell with a shop and a HUD is not a brainrot game');
  assert.equal(empty[0].weight, 25);
  assert.match(empty[0].text, /^the request asks for brainrot characters, but no screen, folder, model or label in the game mentions it$/);
  assert.deepEqual(missing('an original brainrot game', [nm('Workspace', 'Tralalero Tralala')]), [], 'a character\'s name is enough');
  assert.deepEqual(missing('a garden game', [nm('screen HUD', 'Plant')]), [], 'one seed, plant or plot word is enough');
  assert.equal(missing('a garden game with pets', [nm('screen HUD', 'Plant')]).length, 1, 'the pets it asked for are not there');
  assert.equal(missing('a garden game with pets', [nm('screen HUD', 'Plant')])[0].text.startsWith('the request asks for pets or eggs'), true);
  assert.deepEqual(missing('a garden game with pets', [nm('screen HUD', 'Plant'), nm('screen Pets', 'Hatch')]), []);
  assert.equal(missing('a tycoon with droppers and a sword fight', [nm('Workspace', 'Baseplate')])[0].text.includes('a tycoon (droppers, a collector, buy pads) and weapons or fighting'), true, 'two missing things are one finding');
  assert.deepEqual(missing('make me something fun', []), [], 'a request with no checkable noun asks for nothing checkable');
  // A label the game shows counts as much as a name.
  assert.deepEqual(missing('an original brainrot game', [], [{ where: 'HUD.Title', text: 'Steal a Brainrot!', cls: 'TextLabel', state: 'shown', via: 'screen' }]), []);
  // A feature that lives only in code is still in the game.
  assert.deepEqual(R.fitFindings(fitInput({ request: 'a game with pets', names: [], scriptNames: ['PetService'] })).filter((f) => f.kind === 'missing'), []);
  assert.equal(R.fitFindings(fitInput({ request: 'a game with pets', names: [], scriptNames: ['Economy'] })).filter((f) => f.kind === 'missing').length, 1);
  const judged = R.judgeFit(fitInput({ request: 'an original brainrot game', names: [nm('Workspace', 'Baseplate')] }));
  assert.equal(judged.ok, false);
  assert.equal(judged.score, 75);
  assert.match(judged.plain, /^The game is missing something you asked for: brainrot characters\.$/);
  assert.match(judged.fix, /build or import that feature/);
});

test('fitFindings: two currencies, two money displays, two shops, two menus and two screens of one name are duplicates', () => {
  assert.deepEqual(kinds(fitInput({ currencies: ['Cash', 'Coins'] })), ['duplicate:two currencies doing the same job: Cash and Coins']);
  assert.deepEqual(kinds(fitInput({ currencies: ['Coins', 'Gems'] })), [], 'coins and gems are two different jobs');
  assert.match(R.fitFindings(fitInput({ currencyScreens: [{ screen: 'HUD', text: '$5' }, { screen: 'Hud2', text: '$5' }] }))[0].text, /shown by 2 different screens at the start: HUD, Hud2/);
  assert.deepEqual(R.fitFindings(fitInput({ currencyScreens: [{ screen: 'HUD', text: '$5' }, { screen: 'HUD', text: '$5' }] })), [], 'one screen showing it twice is one screen');
  const shops = (a, b) => R.fitFindings(fitInput({ shopWindows: [{ screen: 'A', name: a, path: 'game.StarterGui.A.' + a }, { screen: 'B', name: b, path: 'game.StarterGui.B.' + b }] }));
  assert.match(shops('Shop', 'ShopGui')[0].text, /two shops: A\.Shop and B\.ShopGui/);
  assert.deepEqual(shops('SeedShop', 'GearShop'), [], 'a seed shop and a gear shop are two jobs');
  const cluster = (screen) => ({ screen, path: 'p' + screen, buttons: ['a', 'b', 'c'], side: 'left' });
  assert.match(R.fitFindings(fitInput({ menus: [cluster('HUD'), cluster('Pets')] }))[0].text, /two sets of side menu buttons on the left: HUD \[a, b, c\] and Pets/);
  assert.match(R.fitFindings(fitInput({ duplicateScreens: ['MainGui'] }))[0].text, /two screens with the same name: MainGui/);
});

test('fitFindings: a source game\'s name or a promo on screen, and a game stitched from too many sources, are leftovers', () => {
  const t = (text, via = 'screen', state = 'shown') => ({ where: 'HUD.Title', text, cls: 'TextLabel', state, via });
  const brand = R.fitFindings(fitInput({ texts: [t('Plants vs Brainrots')], sourceNames: ['Plants vs Brainrots (2)'] }));
  assert.equal(brand[0].kind, 'branding');
  assert.match(brand[0].text, /"Plants vs Brainrots" names the source game "Plants vs Brainrots" \(HUD\.Title\)/);
  assert.deepEqual(R.fitFindings(fitInput({ texts: [t('Plants vs Brainrots')], sourceNames: ['Plants vs Brainrots'], request: 'remake plants vs brainrots' })), [], 'when the user asked for that name');
  assert.equal(R.fitFindings(fitInput({ texts: [t('Join our discord.gg/abc')] }))[0].kind, 'branding');
  assert.equal(R.fitFindings(fitInput({ texts: [t('Made by Bob123')] }))[0].kind, 'branding');
  assert.deepEqual(R.fitFindings(fitInput({ texts: [t('Garden'), t('Plants vs Brainrots', 'script', 'hidden')], sourceNames: ['Grow a Garden', 'Plants vs Brainrots'] })), [], 'a word of the name is not the name; a hidden script string is not on screen');
  assert.equal(R.fitFindings(fitInput({ sourceCount: 13 }))[0].kind, 'sources');
  assert.deepEqual(R.fitFindings(fitInput({ sourceCount: 8 })), []);
});

test('judgeFit: ok when nothing is unrequested, duplicated or left over; the plain sentence names the strangest thing', () => {
  const ok = R.judgeFit(fitInput({ names: [nm('s', 'Seeds'), nm('s', 'Shop'), ...core], texts: [{ where: 'w', text: 'x', cls: 'TextLabel', state: 'shown', via: 'screen' }] }));
  assert.deepEqual([ok.ok, ok.score], [true, 100]);
  const bad = R.judgeFit(fitInput({ names: [nm('screen PetsGui', 'Pets'), nm('screen A', 'Admin'), ...core], currencies: ['Cash', 'Money'] }));
  assert.equal(bad.ok, false);
  assert.equal(bad.score, 45);
  assert.match(bad.plain, /like a pet and egg system and an admin or commands panel/);
  assert.doesNotMatch(bad.plain, /screen|game\./);
});

/* ------------------------------------------------------------------------------------------------- verdict --- */

const crit = (id, over = {}) => ({ id, ok: true, measured: true, score: 100, evidence: ['e'], fix: `fix ${id}`, plain: `plain ${id}`, ...over });
const all7 = (over = {}) => ['placeholders', 'ui_coherence', 'buttons_work', 'progression', 'errors', 'construction', 'fit_uniqueness'].map((id) => crit(id, over[id]));

test('compose: ready only when all seven are measured yes; the score never says ready-ish when the verdict says no', () => {
  const ready = R.compose(all7(), ['a screenshot was not judged']);
  assert.deepEqual([ready.verdict, ready.score, ready.fixes], ['ready', 100, []]);
  assert.match(ready.forUser, /^Your game passed every check a player would notice/);
  const nearly = R.compose(all7({ construction: { ok: false, score: 90 } }), []);
  assert.equal(nearly.verdict, 'not ready');
  assert.equal(nearly.score, 79, '97 points of 100 is capped: one no is a no');
  const blind = R.compose(all7({ progression: { ok: false, measured: false, score: 0 }, errors: { ok: false, measured: false, score: 0 } }), []);
  assert.equal(blind.verdict, 'not ready');
  assert.match(blind.forUser, /I could not finish testing this game, so I cannot say it is ready/);
  assert.equal(blind.fixes.length, 2, 'the unmeasured ones are listed too, so the next run measures them');
  const almost = R.compose(all7({ ui_coherence: { ok: false, score: 80 } }).map((c) => ({ ...c, score: 100 })), []);
  assert.equal(almost.score, 79);
  assert.equal(R.compose(all7().slice(0, 6), []).verdict, 'not ready', 'a missing criterion is not a pass');
  assert.equal(R.compose(all7({ errors: { ok: true, measured: false } }), []).verdict, 'not ready', 'a yes that was not observed is not a yes');
});

test('compose: forUser is 2-4 plain sentences with no path, tool name or id; fixes come in the order that removes the most work', () => {
  const failing = all7({
    fit_uniqueness: { ok: false, plain: 'The game carries things you did not ask for.' }, errors: { ok: false }, construction: { ok: false }, progression: { ok: false, plain: 'Right now players cannot earn anything.' },
    buttons_work: { ok: false, plain: 'Some buttons do nothing.' }, ui_coherence: { ok: false }, placeholders: { ok: false },
  });
  const v = R.compose(failing, []);
  assert.deepEqual(v.fixes.map((f) => f.split(':')[0]), ['fit_uniqueness', 'errors', 'construction', 'progression', 'buttons_work', 'ui_coherence', 'placeholders']);
  const sentences = v.forUser.split(/(?<=\.)\s+/);
  assert.ok(sentences.length >= 2 && sentences.length <= 4, `${sentences.length} sentences: ${v.forUser}`);
  assert.match(v.forUser, /^This game is not ready to hand over yet\. Right now players cannot earn anything\. The game carries things you did not ask for\. I will fix these and check again\.$/);
  assert.doesNotMatch(v.forUser, /game\.[A-Z]|_|\bplay_check|\bget_tree\b|\d{5,}/);
});

test('every fix the rules give an agent names a tool that exists and none that D-UIONLY-1 forbids', () => {
  const src = R.compose(all7({ placeholders: { ok: false, fix: 'x' } }), []);
  assert.ok(src.fixes.length === 1);
  const c = [
    R.judgePlaceholders({ items: [{ where: 'w', text: 'Label', cls: 'TextLabel', state: 'shown', via: 'screen' }], purchases: [], foreignOk: false, scanned: { screens: 1, texts: 1, worldGuis: 0, worldGuisTotal: 0, scripts: 0, scriptsCut: false } }),
    R.judgeErrors([play({ clientErrors: [{ message: 'x' }] })]),
    R.judgeConstruction(facts({ items: [item({ floating: true, gapBelow: 9 })] })),
    R.judgeFit(fitInput({ names: [nm('s', 'Admin')] })),
  ];
  for (const x of c) {
    for (const bad of [/BackgroundColor3/, /\bFont\b/, /set_props\b/, /run_luau/]) assert.doesNotMatch(x.fix, bad, x.id);
  }
  assert.match(c[0].fix, /set_properties Text/);
  assert.match(c[3].fix, /delete_instances/);
});

test('withinBudget: a long answer gives up evidence, never the verdict, the words for the user or the fixes', () => {
  const long = Array.from({ length: 8 }, (_, i) => `line ${i} ` + 'x'.repeat(900));
  const answer = { verdict: 'not ready', score: 10, forUser: 'words', fixes: ['fix'], criteria: Array.from({ length: 7 }, () => ({ evidence: [...long] })) };
  assert.ok(JSON.stringify(answer).length > J.ANSWER_BUDGET_CHARS);
  const cut = J.withinBudget(answer);
  assert.ok(JSON.stringify(cut).length <= J.ANSWER_BUDGET_CHARS, String(JSON.stringify(cut).length));
  assert.deepEqual([cut.verdict, cut.forUser, cut.fixes], ['not ready', 'words', ['fix']]);
  assert.ok(cut.criteria.every((c) => c.evidence[0].startsWith('line 0') && /^\(\d+ more\)$/.test(c.evidence.at(-1))), 'the first lines stay and the cut says how many went');
  const short = { criteria: [{ evidence: ['a', 'b'] }] };
  assert.deepEqual(J.withinBudget(short).criteria[0].evidence, ['a', 'b']);
});
