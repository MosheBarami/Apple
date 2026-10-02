// The menu binder: ONE generic LocalScript that makes screens which arrived without working code open and close.
//
// Owner rule: every GUI must respond. A studded UI kit (no scripts at all) or a shop whose logic was stripped from the
// saved file has buttons that do nothing. Apple flags those screens with the attribute AppleMenuBinder and adds this
// script; a screen with working scripts is never flagged, so the binder never touches a button a real script handles.
//
// The Luau is run for real with the `luau` interpreter against a small stand-in for the Roblox objects (Instance
// tree, IsA, attributes, signals). It is skipped, not faked, on a machine without `luau`; under CI its absence fails.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const esbuild = await import(process.env.APPLE_TEST_ESBUILD || 'esbuild');
const dir = mkdtempSync(join(tmpdir(), 'menu-binder-'));
test.after(() => rmSync(dir, { recursive: true, force: true }));
await esbuild.build({ entryPoints: ['src/menu-binder.ts'], bundle: true, format: 'esm', platform: 'node', outfile: join(dir, 'binder.mjs'), alias: { '@apple/shared': '../../packages/shared/src/index.ts' } });
const B = await import(pathToFileURL(join(dir, 'binder.mjs')).href);

const LUAU = process.env.LUAU_BIN || 'luau';
const COMPILE = process.env.LUAU_COMPILE_BIN || 'luau-compile';
function have(bin) { try { execFileSync(bin, ['--help'], { stdio: 'pipe' }); return true; } catch (err) { return err.code !== 'ENOENT'; } }
const HAVE = have(LUAU) && have(COMPILE);
if (!HAVE && process.env.CI) test('luau is on PATH under CI', () => assert.fail('luau / luau-compile is missing under CI, so the binder was never run'));
const skip = !HAVE && !process.env.CI ? 'luau is not installed on this machine' : false;

// A stand-in for the parts of Roblox the binder touches.
const PRELUDE = `
local PARENTS = { TextButton = "GuiButton", ImageButton = "GuiButton", GuiButton = "GuiObject", Frame = "GuiObject", ScrollingFrame = "GuiObject",
	CanvasGroup = "GuiObject", ImageLabel = "GuiObject", TextLabel = "GuiObject", ScreenGui = "LayerCollector" }
local function isA(class, target) while class do if class == target then return true end class = PARENTS[class] end return false end
local Signal = {}
Signal.__index = Signal
local function newSignal() return setmetatable({ handlers = {} }, Signal) end
function Signal:Connect(fn) table.insert(self.handlers, fn) return { Disconnect = function() end } end
function Signal:Fire(...) for _, h in self.handlers do h(...) end end
local Node = {}
Node.__index = Node
function Node:IsA(class) return isA(self.ClassName, class) end
function Node:GetChildren() return table.clone(self.kids) end
function Node:GetDescendants()
	local out = {}
	local function walk(n) for _, c in n.kids do table.insert(out, c) walk(c) end end
	walk(self)
	return out
end
function Node:IsDescendantOf(other) local n = self.Parent while n do if n == other then return true end n = n.Parent end return false end
function Node:FindFirstAncestorOfClass(class) local n = self.Parent while n do if n.ClassName == class then return n end n = n.Parent end return nil end
function Node:FindFirstChildOfClass(class) for _, c in self.kids do if c.ClassName == class then return c end end return nil end
function Node:GetAttribute(k) return self.attrs[k] end
function Node:SetAttribute(k, v) self.attrs[k] = v end
function Node:WaitForChild(name) for _, c in self.kids do if c.Name == name then return c end end end
local function make(class, name, props)
	local n = setmetatable({ ClassName = class, Name = name, kids = {}, attrs = {}, Visible = true, Enabled = true, Text = "", Activated = newSignal(), ChildAdded = newSignal() }, Node)
	for k, v in props or {} do n[k] = v end
	return n
end
local function put(parent, child) child.Parent = parent table.insert(parent.kids, child) parent.ChildAdded:Fire(child) return child end
local function click(button) button.Activated:Fire() end
local function check(cond, message) if not cond then error("FAILED: " .. message, 2) end end
local function screen(playerGui, name, flagged)
	local gui = make("ScreenGui", name)
	if flagged then gui.attrs.AppleMenuBinder = true end
	return put(playerGui, gui)
end
local playerGui = make("Instance", "PlayerGui")
local Players = { LocalPlayer = { WaitForChild = function(_, name) return playerGui end } }
local game = { GetService = function(_, name) return Players end }
-- task.defer runs after the current work, like Roblox's: flush() lets it.
local pending = {}
local task = { defer = function(fn, ...) table.insert(pending, { fn, ... }) end }
local function flush() while #pending > 0 do local job = table.remove(pending, 1) job[1](table.unpack(job, 2)) end end
`;

function run(name, scenario, assertions) {
  const file = join(dir, name.replace(/\W+/g, '-') + '.luau');
  writeFileSync(file, `${PRELUDE}\n${scenario}\ndo\n${B.BINDER_SOURCE}\nend\nflush()\n${assertions}\nprint("OK")\n`);
  const r = spawnSync(LUAU, [file], { encoding: 'utf8' });
  assert.equal(r.status, 0, `${name}\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /OK\s*$/);
}

test('the binder source is one LocalScript that compiles the way Studio compiles it (-O0) and names its flag', { skip }, () => {
  const file = join(dir, 'compile.luau');
  writeFileSync(file, B.BINDER_SOURCE);
  const r = spawnSync(COMPILE, ['--null', '-O0', file], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(B.BINDER_ATTRIBUTE, 'AppleMenuBinder');
  assert.equal(B.BINDER_PATH, 'game.StarterPlayer.StarterPlayerScripts.AppleMenuBinder');
  assert.match(B.BINDER_SOURCE, /GetAttribute\(FLAG\) == true/, 'only flagged screens are bound');
  // The compile check must be able to fail: a broken copy is rejected.
  writeFileSync(file, B.BINDER_SOURCE.replace('local function bindAll()', 'local function bindAll('));
  assert.notEqual(spawnSync(COMPILE, ['--null', '-O0', file], { encoding: 'utf8' }).status, 0);
});

test('the binder passes the same source rules a script the agent writes must pass, so a later edit of it is not refused', async () => {
  const entry = join(dir, 'guards-entry.mjs');
  writeFileSync(entry, [
    `export { luauScanVariants } from ${JSON.stringify(join(process.cwd(), 'src/tools.ts'))};`,
    `export { refuseGameScript } from ${JSON.stringify(join(process.cwd(), 'src/game-independence.ts'))};`,
    `export { refuseLibraryLuau } from ${JSON.stringify(join(process.cwd(), 'src/library-guard.ts'))};`,
    `export { refuseNewHandMadeModelLuau } from ${JSON.stringify(join(process.cwd(), 'src/model-rule.ts'))};`,
    `export { UI_RULE } from ${JSON.stringify(join(process.cwd(), 'src/ui-components.ts'))};`,
    `export { FX_RULE } from ${JSON.stringify(join(process.cwd(), 'src/fx-library.ts'))};`,
  ].join('\n'));
  await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: join(dir, 'guards.mjs'), alias: { '@apple/shared': '../../packages/shared/src/index.ts' } });
  const G = await import(pathToFileURL(join(dir, 'guards.mjs')).href);
  const variants = G.luauScanVariants(B.BINDER_SOURCE);
  assert.equal(G.refuseNewHandMadeModelLuau(variants), null);
  assert.equal(G.refuseLibraryLuau(variants, G.UI_RULE), null, 'it makes no UI by hand');
  assert.equal(G.refuseLibraryLuau(variants, G.FX_RULE), null, 'it makes no sounds or effects');
  assert.equal(G.refuseGameScript(variants), null, 'it does not depend on Apple');
  // Control: the guard really refuses a script that builds UI by hand.
  assert.notEqual(G.refuseLibraryLuau(G.luauScanVariants('local f = Instance.new("Frame")'), G.UI_RULE), null);
});

test('buttons named for a menu open it, hide the other menus, and toggle; close buttons hide their menu', { skip }, () => {
  run('sidebar', `
local gui = screen(playerGui, "MainUI", true)
local side = put(gui, make("Frame", "SideButtons"))
local shopB = put(side, make("TextButton", "ShopButton"))
local rebirthB = put(side, make("TextButton", "RebirthButton"))
local indexB = put(side, make("ImageButton", "Index"))
local settingsB = put(side, make("TextButton", "SettingsBtn"))
local windows = put(gui, make("Frame", "Windows"))
local shop = put(windows, make("Frame", "ShopFrame"))
local rebirth = put(windows, make("Frame", "Rebirth"))
local index = put(windows, make("ImageLabel", "IndexMenu"))
local settings = put(windows, make("Frame", "SettingsWindow"))
local shopX = put(shop, make("TextButton", "CloseButton"))
local rebirthX = put(rebirth, make("TextButton", "Btn", { Text = " X " }))
local hud = put(gui, make("Frame", "CoinCounter"))
`, `
check(not shop.Visible and not rebirth.Visible and not index.Visible and not settings.Visible, "menus a button can open start closed")
check(hud.Visible and side.Visible and windows.Visible, "nothing else is hidden")
click(shopB)
check(shop.Visible and not rebirth.Visible, "Shop opens")
click(rebirthB)
check(rebirth.Visible and not shop.Visible, "opening Rebirth closes Shop")
click(rebirthB)
check(not rebirth.Visible, "the same button toggles it closed")
click(indexB); check(index.Visible, "an ImageButton named Index opens IndexMenu")
click(settingsB); check(settings.Visible and not index.Visible, "SettingsBtn opens SettingsWindow")
click(shopB); check(shop.Visible and not settings.Visible, "Shop again")
click(shopX); check(not shop.Visible, "CloseButton hides Shop")
click(rebirthB); check(rebirth.Visible, "Rebirth opens again")
click(rebirthX); check(not rebirth.Visible, "a button whose text is X hides the menu around it")
check(hud.Visible and side.Visible and windows.Visible, "the counter, the side bar and the holder are never hidden")
`);
});

test('an OpenButton with no menu name opens the frame beside it; a button never toggles the menu it sits in, and menu insides are not menus', { skip }, () => {
  run('open-sibling', `
local gui = screen(playerGui, "Menu", true)
local holder = put(gui, make("Frame", "Holder"))
local openB = put(holder, make("TextButton", "OpenButton"))
local main = put(holder, make("Frame", "MainFrame"))
`, `
check(not main.Visible, "the menu starts closed")
click(openB); check(main.Visible, "OpenButton opens MainFrame")
click(openB); check(not main.Visible, "and closes it again")
`);
  run('self-menu', `
local gui = screen(playerGui, "Kit", true)
local side = put(gui, make("Frame", "Container"))
local spinOpen = put(side, make("TextButton", "Spin Button"))
local spin = put(gui, make("Frame", "Spin"))
local action = put(spin, make("TextButton", "SpinButton"))
local top = put(spin, make("Frame", "Top"))
local closeB = put(top, make("TextButton", "CloseButton"))
local volume = put(gui, make("Frame", "Settings"))
local vol = put(volume, make("Frame", "VolumeFrame"))
local down = put(vol, make("TextButton", "VolumeDownButton"))
local vol2 = put(volume, make("Frame", "SfxVolumeFrame"))
local vol2 = put(volume, make("Frame", "VolumeFrame"))
local down2 = put(vol2, make("TextButton", "VolumeDownButton"))
local template = put(gui, make("Frame", "Template"))
local templateB = put(gui, make("TextButton", "Template"))
`, `
check(not spin.Visible and side.Visible, "the menu starts closed and the bar that holds its button stays")
check(#action.Activated.handlers == 0, "a button inside the Spin menu that is named for it spins; it never toggles the menu it sits in")
check(#down.Activated.handlers == 0 and vol.Visible, "and VolumeDownButton does not hide the VolumeFrame around it")
check(#down2.Activated.handlers == 0 and vol2.Visible, "nor a VolumeFrame beside it: a longer button name is not a shorter menu's")
check(#templateB.Activated.handlers == 0 and template.Visible, "a frame that only holds a menu's insides is never the menu")
click(spinOpen); check(spin.Visible, "the bar's button opens it")
click(action); check(spin.Visible, "pressing the action inside it leaves it open")
click(closeB); check(not spin.Visible, "and Close hides it")
`);
});

test('a Close in a window whose frames are all called Container and Content still hides the window; a checkbox that shows an X does not close anything', { skip }, () => {
  run('close-container', `
local wheel = screen(playerGui, "ArcadeSpinWheel", true)
local container = put(wheel, make("Frame", "Container"))
local content = put(container, make("Frame", "Content"))
local closeB = put(content, make("ImageButton", "Close"))
local xB = put(content, make("TextButton", "Btn3", { Text = " X " }))
local settings = screen(playerGui, "Settings", true)
local win = put(settings, make("Frame", "SettingsMenu"))
local hide = put(win, make("TextButton", "HideObjects", { Text = "X" }))
local plainX = put(win, make("TextButton", "Button", { Text = "x" }))
`, `
click(closeB); check(not container.Visible, "Close hides the outermost frame when none of them is a menu by name")
container.Visible = true
click(xB); check(not container.Visible, "a plainly named button labelled X closes too, numbered or not")
check(#hide.Activated.handlers == 0 and win.Visible, "HideObjects labelled X is a checkbox: it is left alone")
click(plainX); check(not win.Visible, "while a plain Button labelled x closes its window")
`);
});

test('a button with a generic name is matched by its label, and a button matching nothing gets no handler', { skip }, () => {
  run('text-and-none', `
local gui = screen(playerGui, "Kit", true)
local pets = put(gui, make("Frame", "Pets"))
local codes = put(gui, make("Frame", "CodesWindow"))
local petsB = put(gui, make("TextButton", "Button", { Text = "Pets" }))
local codesB = put(gui, make("TextButton", "Btn2", { Text = "Codes!" }))
local lonely = put(gui, make("TextButton", "Purple", { Text = "Yay" }))
local prefix = put(gui, make("TextButton", "DailyButton"))
local daily = put(gui, make("Frame", "DailyRewardFrame"))
`, `
click(petsB); check(pets.Visible, "Button labelled Pets opens Pets")
click(codesB); check(codes.Visible and not pets.Visible, "Codes! opens CodesWindow")
check(#lonely.Activated.handlers == 0, "a button that matches no menu is left alone")
click(prefix); check(daily.Visible, "Daily opens DailyRewardFrame by its start")
`);
});

test('a game whose menus are separate screens: a button on one screen opens the window of the screen named for it, and only one is open at a time', { skip }, () => {
  run('cross-screen', `
local hud = screen(playerGui, "HUD", true)
local bar = put(hud, make("Frame", "Left"))
local indexB = put(bar, make("ImageButton", "IndexBTN"))
local settingsB = put(bar, make("TextButton", "Settings", { Text = "" }))
local shopB = put(bar, make("TextButton", "ShopBTN"))
local indexGui = screen(playerGui, "Index", true)
local index = put(indexGui, make("Frame", "Frame"))
local indexX = put(put(index, make("Frame", "Title")), make("TextButton", "Close"))
local settingsGui = screen(playerGui, "Settings", true)
settingsGui.Enabled = false
local settings = put(settingsGui, make("Frame", "Frame"))
local settingsX = put(settings, make("TextButton", "Close"))
local robux = screen(playerGui, "RobuxShop", true)
local robuxFrame = put(robux, make("Frame", "Frame"))
local plain = screen(playerGui, "Index2", false)
local plainFrame = put(plain, make("Frame", "Shop"))
`, `
check(not index.Visible and not settings.Visible, "windows a button on another screen opens start closed")
check(robuxFrame.Visible, "a window nothing names is left as it was")
check(#shopB.Activated.handlers == 0, "ShopBTN matches no screen or menu exactly, so it is left alone")
click(indexB); check(index.Visible, "IndexBTN opens the window of the Index screen")
click(settingsB); check(settings.Visible and settingsGui.Enabled and not index.Visible, "opening Settings enables its screen, shows it and closes Index")
click(settingsX); check(not settings.Visible, "Close hides the window")
click(indexB); click(indexX); check(not index.Visible, "and so it does two levels down, under a Title bar (never the holder)")
check(plainFrame.Visible and #shopB.Activated.handlers == 0, "a screen nobody flagged is not part of it")
`);
});

// The shape of "StuddedUI-Free" from the owner's library (checked against the real file on 2026-09-30: 127 buttons, no scripts):
// one screen, a bar of side buttons, a window per button each with a Close in its title bar, and action buttons inside.
test('a real studded kit: every side button opens its window, every Close hides its own window, and no action button inside a window is taken for a menu', { skip }, () => {
  const sides = ['Codes', 'Shop', 'Trade', 'Spin', 'Pets', 'Upgrades', 'Rebirth', 'Settings', 'Teleport', 'Rewards', 'DailyRewards'];
  run('studded-kit', `
local gui = screen(playerGui, "StuddedUI", true)
local bar = put(gui, make("Frame", "Container"))
local sides, windows, closes = {}, {}, {}
for _, name in {${sides.map((s) => `"${s}"`).join(', ')}} do
	sides[name] = put(bar, make("TextButton", name .. " Button", { Text = "Button" }))
	windows[name] = put(gui, make("Frame", name, { Visible = false }))
	closes[name] = put(put(windows[name], make("Frame", "Top")), make("TextButton", "CloseButton"))
end
windows.Settings.Visible = true
local buy = put(windows.Shop, make("TextButton", "BuyButton"))
local claim = put(windows.DailyRewards, make("TextButton", "ClaimButton"))
local spinAction = put(put(windows.Spin, make("Frame", "Buttons")), make("TextButton", "SpinButton"))
local scroll = put(windows.Settings, make("ScrollingFrame", "ScrollingContainer"))
local music = put(put(scroll, make("Frame", "MusicVolume")), make("Frame", "VolumeFrame"))
local sfx = put(put(scroll, make("Frame", "SFXVolume")), make("Frame", "VolumeFrame"))
local musicUp, sfxDown = put(music, make("TextButton", "VolumeUpButton")), put(sfx, make("TextButton", "VolumeDownButton"))
local pets = windows.Pets
local tabs = put(pets, make("Frame", "Tabs"))
local eggsTab, indexTab = put(tabs, make("TextButton", "Eggs")), put(tabs, make("TextButton", "Index"))
local eggsView, indexView = put(pets, make("Frame", "EggsView")), put(pets, make("Frame", "IndexView", { Visible = false }))
local row = put(put(scroll, make("Frame", "Template")), make("TextButton", "Button"))
`, `
for _, name in {${sides.map((s) => `"${s}"`).join(', ')}} do
	check(not windows[name].Visible, name .. " starts closed")
	click(sides[name]); check(windows[name].Visible, name .. " opens")
	for other, w in windows do if other ~= name then check(not w.Visible, name .. " leaves " .. other .. " closed") end end
	click(closes[name]); check(not windows[name].Visible, name .. " closes with its own Close")
end
for _, b in {buy, claim, spinAction, musicUp, sfxDown, row} do check(#b.Activated.handlers == 0, b.Name .. " is an action, not a menu") end
click(sides.Spin); click(spinAction); check(windows.Spin.Visible, "pressing Spin inside the wheel leaves the wheel showing")
click(sides.Pets); click(eggsTab); check(eggsView.Visible and windows.Pets.Visible, "a tab shows its view and keeps the window")
click(indexTab); check(indexView.Visible and windows.Pets.Visible, "another tab")
click(closes.Pets); check(not windows.Pets.Visible, "the window closes")
`);
});

test('rows of a list, template copies and windows nobody opens: nothing is taken for a menu it is not', { skip }, () => {
  run('rows-and-holders', `
local gui = screen(playerGui, "Game", true)
local list = put(gui, make("ScrollingFrame", "Passes"))
local rowMoney = put(list, make("Frame", "Money"))
local moneyB = put(gui, make("TextButton", "MoneyButton"))
local template = put(gui, make("Frame", "Template"))
local coins = put(template, make("Frame", "Coins"))
local coinsB = put(gui, make("TextButton", "Coins"))
local item = put(gui, make("Frame", "Item"))
local icon = put(item, make("ImageLabel", "Icon"))
local rowButton = put(item, make("TextButton", "Button"))
local frames = put(gui, make("Frame", "Frames"))
local upgrades = put(frames, make("Frame", "Upgrades"))
local closeB = put(put(upgrades, make("Frame", "Title")), make("TextButton", "Close"))
local shop = put(frames, make("Frame", "Shop"))
`, `
check(#moneyB.Activated.handlers == 0 and rowMoney.Visible, "a row of a scrolling list is not a menu")
check(#coinsB.Activated.handlers == 0 and coins.Visible, "nor is anything inside a template")
check(#rowButton.Activated.handlers == 0 and icon.Visible, "a plain Button beside a picture does not toggle the picture; only Open/Toggle/Menu buttons open the frame beside them")
click(closeB)
check(not upgrades.Visible, "Close hides the window it is in, even when no button opens that window")
check(frames.Visible and shop.Visible, "and never the holder around every window")
`);
});

test('screens that are not flagged are never touched: no handler, nothing hidden', { skip }, () => {
  run('unflagged', `
local gui = screen(playerGui, "GameShop", false)
local shop = put(gui, make("Frame", "Shop"))
local shopB = put(gui, make("TextButton", "ShopButton"))
local closeB = put(shop, make("TextButton", "Close"))
local flaggedElsewhere = screen(playerGui, "Kit", true)
local menu = put(flaggedElsewhere, make("Frame", "Rebirth"))
local rebirthB = put(flaggedElsewhere, make("TextButton", "RebirthButton"))
`, `
check(shop.Visible, "a working game's menu keeps its own visibility")
check(#shopB.Activated.handlers == 0 and #closeB.Activated.handlers == 0, "and its buttons keep only their own handlers")
click(rebirthB); check(menu.Visible, "the flagged one beside it works")
`);
});

test('a flagged screen that arrives later (a respawn) is bound once, and only once', { skip }, () => {
  run('late', `
local gui = screen(playerGui, "Early", true)
local a = put(gui, make("Frame", "Shop"))
local ab = put(gui, make("TextButton", "ShopButton"))
`, `
-- A respawn hands the client a finished screen: it is filled in first and parented last.
local late = make("ScreenGui", "Late")
late.attrs.AppleMenuBinder = true
local shop2 = put(late, make("Frame", "Shop"))
local shopB2 = put(late, make("TextButton", "ShopButton"))
check(shop2.Visible, "not bound before it is in the PlayerGui")
put(playerGui, late)
check(shop2.Visible, "binding is deferred until the screen is fully in")
flush()
check(not shop2.Visible, "binding happens when a flagged screen is added")
click(shopB2)
check(shop2.Visible and #shopB2.Activated.handlers == 1, "one handler")
playerGui.ChildAdded:Fire(late)
flush()
check(#shopB2.Activated.handlers == 1, "a second announcement of the same screen does not bind again")
`);
});

test('isStrippedSource: empty, comment-only and decompile-failed scripts have no logic; real code does', () => {
  for (const s of ['', '   \n\n', '-- TODO', '--[[ old\ncode ]]\n-- more', '--[==[ x ]==]', '-- Decompilation panicked', 'print(1) -- decompilation panicked']) assert.equal(B.isStrippedSource(s), true, JSON.stringify(s));
  for (const s of ['print("hi")', '-- note\nlocal x = 1', 'button.Activated:Connect(function() end)']) assert.equal(B.isStrippedSource(s), false, JSON.stringify(s));
});

test('screenRoots keeps only direct children of StarterGui, once each', () => {
  assert.deepEqual(B.screenRoots(['game.StarterGui.ShopGui', 'game.StarterGui.ShopGui', 'game.StarterGui.ShopGui.Frame', 'game.Workspace.X', 'game.StarterGui["My Gui"]', 7, 'x']),
    ['game.StarterGui.ShopGui', 'game.StarterGui["My Gui"]']);
  assert.deepEqual(B.screenRoots(undefined), []);
  assert.equal(B.screenRoots(Array.from({ length: 30 }, (_, i) => `game.StarterGui.G${i}`)).length, 12, 'bounded');
});

// --- what wireScreens sends to Studio, against a stand-in plugin --------------------------------------------------

function studio(world) {
  const calls = [];
  return {
    calls,
    execStudioOp: async (op) => {
      calls.push(op);
      const handler = world[op.op];
      const out = handler ? handler(op) : { ok: false, error: `${op.op} unsupported` };
      return out.ok === undefined ? { ok: true, data: out } : out;
    },
  };
}
const btn = (screen, ...names) => ({ matches: names.map((n) => ({ path: `${screen}.Frame.${n}`, className: 'TextButton' })) });

test('wireScreens flags a script-less screen, adds the binder once, and leaves working screens alone', async () => {
  const ctx = studio({
    query_instances: (op) => btn(op.root, 'ShopButton', 'Close'),
    dump_scripts: () => ({ scripts: [] }),
    search_scripts: () => ({ matches: [] }),
    read_script: () => ({ ok: false, error: 'not found' }),
    edit_script: () => ({ ok: true, data: {} }),
    set_props: () => ({ ok: true, data: {} }),
  });
  const out = await B.wireScreens(ctx, [{ path: 'game.StarterGui.Kit', works: 'looks only' }, { path: 'game.StarterGui.Game', works: 'yes' }, { path: 'game.StarterGui.Kit2' }]);
  assert.deepEqual(out.wired, ['game.StarterGui.Kit', 'game.StarterGui.Kit2']);
  assert.deepEqual(out.left, [{ path: 'game.StarterGui.Game', why: 'its own scripts work' }]);
  assert.equal(out.binder, 'added');
  const created = ctx.calls.filter((o) => o.op === 'edit_script');
  assert.equal(created.length, 1, 'ONE binder for any number of screens');
  assert.deepEqual([created[0].path, created[0].create], [B.BINDER_PATH, { className: 'LocalScript', parent: B.BINDER_PARENT }]);
  assert.equal(created[0].source, B.BINDER_SOURCE);
  const marks = ctx.calls.filter((o) => o.op === 'set_props');
  assert.deepEqual(marks.map((o) => [o.path, o.attributes]), [['game.StarterGui.Kit', { AppleMenuBinder: { t: 'bool', v: true } }], ['game.StarterGui.Kit2', { AppleMenuBinder: { t: 'bool', v: true } }]]);
  assert.ok(!ctx.calls.some((o) => o.root === 'game.StarterGui.Game'), 'a screen whose library game works is not even read');
});

test('wireScreens leaves a screen alone when it has working code inside, no buttons, or a script elsewhere handles its buttons', async () => {
  const base = {
    query_instances: (op) => (op.root.endsWith('NoButtons') ? { matches: [] } : btn(op.root, 'RebirthButton', 'Index')),
    dump_scripts: (op) => ({ scripts: op.root.endsWith('Coded') ? [{ path: op.root + '.LocalScript', source: 'x.Activated:Connect(f)' }] : op.root.endsWith('Stripped') ? [{ path: op.root + '.LocalScript', source: '-- Decompilation panicked' }, { path: 'a', source: '' }] : [] }),
    search_scripts: (op) => ({ matches: op.query === 'RebirthButton' && op.root === undefined ? [] : [] }),
    read_script: () => ({ ok: true, data: { source: 'x' } }),
    set_props: () => ({ ok: true, data: {} }),
  };
  const ctx = studio(base);
  const out = await B.wireScreens(ctx, ['NoButtons', 'Coded', 'Stripped'].map((n) => ({ path: 'game.StarterGui.' + n })));
  assert.deepEqual(out.wired, ['game.StarterGui.Stripped'], 'stripped scripts count as no code');
  assert.deepEqual(out.left.map((l) => [l.path.split('.').pop(), l.why]), [['NoButtons', 'no buttons'], ['Coded', 'its own scripts work']]);
  assert.equal(out.binder, 'present', 'an existing binder is not written again');
  assert.equal(ctx.calls.filter((o) => o.op === 'edit_script').length, 0);
  // A working controller elsewhere that names the button (in code, not a comment) means the screen is already driven.
  const driven = studio({ ...base, search_scripts: () => ({ matches: [{ path: 'game.StarterPlayer.StarterPlayerScripts.Ctl', line: 3, text: 'gui.RebirthButton.Activated:Connect(x)' }] }) });
  const d = await B.wireScreens(driven, [{ path: 'game.StarterGui.Shop' }]);
  assert.deepEqual([d.wired.length, d.left[0].why], [0, 'a script elsewhere handles it']);
  const commented = studio({ ...base, search_scripts: () => ({ matches: [{ path: 'game.ServerScriptService.S', line: 1, text: '-- RebirthButton used to be here' }] }) });
  assert.equal((await B.wireScreens(commented, [{ path: 'game.StarterGui.Shop' }])).wired.length, 1, 'a comment is not a driver');
});

test('wireScreens never throws or half-marks: a plugin without the ops, or a refused script, leaves screens as they were', async () => {
  const none = studio({});
  assert.deepEqual(await B.wireScreens(none, [{ path: 'game.StarterGui.Kit' }]), { wired: [], left: [{ path: 'game.StarterGui.Kit', why: 'could not read it' }] });
  const refused = studio({ query_instances: (op) => btn(op.root, 'ShopButton'), dump_scripts: () => ({ scripts: [] }), search_scripts: () => ({ matches: [] }),
    read_script: () => ({ ok: false, error: 'nope' }), edit_script: () => ({ ok: false, error: 'edit consent required' }), set_props: () => ({ ok: true, data: {} }) });
  const out = await B.wireScreens(refused, [{ path: 'game.StarterGui.Kit' }]);
  assert.deepEqual([out.wired, out.binder, out.left[0].why], [[], 'failed', 'could not add the menu script']);
  assert.equal(refused.calls.filter((o) => o.op === 'set_props').length, 0, 'no screen is flagged when the script that reads the flag could not be added');
  const many = studio({ query_instances: (op) => btn(op.root, 'ShopButton'), dump_scripts: () => ({ scripts: [] }), search_scripts: () => ({ matches: [] }),
    read_script: () => ({ ok: true, data: {} }), set_props: () => ({ ok: true, data: {} }) });
  assert.equal((await B.wireScreens(many, Array.from({ length: 20 }, (_, i) => ({ path: `game.StarterGui.S${i}` })))).wired.length, 8, 'bounded per call');
});
