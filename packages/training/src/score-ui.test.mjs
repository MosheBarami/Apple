import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTasks, UI_TASKS,
} from './ui-tasks.mjs';
import {
  buildUiTree, check, deprecatedApis, indexTree, legacyApis, resolveLayout,
  scoreUiTask, screenGuisInPlayerGui, select, VIEWPORTS,
} from './score-ui.mjs';

/**
 * A SCORER THAT CANNOT FAIL IS NOT A MEASUREMENT, AND ONE THAT CANNOT PASS IS NOT ONE EITHER.
 *
 * `apple-v3` scored WORSE than its own base and no single number revealed it. The defence is that
 * every scorer in this package is driven from both ends before it is ever pointed at a model: a
 * correct answer must pass, and a specific, named, plausible mistake must fail — with the mistake
 * being one that a regex suite would wave through. Each `does not pass` case below is exactly the
 * defect the corresponding check exists to catch, written the way a model actually writes it.
 */

const tasks = buildTasks(check, select);
const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
const fence = (luau) => '```luau\n' + luau + '\n```';

const HEAD = `
local Players = game:GetService("Players")
local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")
local gui = Instance.new("ScreenGui")
gui.Name = "Test"
gui.ResetOnSpawn = false
gui.Parent = playerGui
`;

// --------------------------------------------------------------------------------------- harness

test('the harness runs a build and reports the tree it produced', () => {
  const built = buildUiTree(`${HEAD}
local f = Instance.new("Frame")
f.Size = UDim2.fromScale(0.5, 0.5)
f.Parent = gui
`);
  assert.equal(built.ran, true);
  assert.equal(built.compiled, true);
  assert.equal(built.status, 'ok');
  const tree = indexTree(built.nodes);
  const guis = screenGuisInPlayerGui(tree);
  assert.equal(guis.length, 1);
  assert.equal(guis[0].children.filter((c) => c.class === 'Frame').length, 1);
});

test('a syntax error, a thrown build and a steady-state loop are three different outcomes', () => {
  assert.equal(buildUiTree('local x = = 1').compiled, false);

  const threw = buildUiTree(`${HEAD}\nerror("boom")`);
  assert.equal(threw.status, 'error');
  assert.match(threw.detail, /boom/);

  // A script that ends in its update loop has FINISHED BUILDING. Reporting that as a failure would
  // mark every HUD with a refresh loop wrong.
  const looped = buildUiTree(`${HEAD}
local f = Instance.new("Frame")
f.Parent = gui
while true do task.wait(1) end
`);
  assert.equal(looped.status, 'loop');
  assert.equal(indexTree(looped.nodes).roots.length >= 1, true);
});

test('an instance that was created but never parented is not in the rendered tree', () => {
  const built = buildUiTree(`${HEAD}
local f = Instance.new("Frame")
f.Size = UDim2.fromScale(0.5, 0.5)
f.Parent = gui
local ratio = Instance.new("UIAspectRatioConstraint")
ratio.AspectRatio = 1.777
`);
  const gui = screenGuisInPlayerGui(indexTree(built.nodes))[0];
  assert.equal(gui.children.some((c) => c.class === 'UIAspectRatioConstraint'), false);
});

// ---------------------------------------------------------------------------------------- layout

test('layout resolves AnchorPoint arithmetic the way Roblox does', () => {
  const built = buildUiTree(`${HEAD}
local a = Instance.new("Frame")
a.Name = "Anchored"
a.AnchorPoint = Vector2.new(0.5, 0.5)
a.Position = UDim2.fromScale(0.5, 0.5)
a.Size = UDim2.fromScale(0.5, 0.5)
a.Parent = gui
`);
  const gui = screenGuisInPlayerGui(indexTree(built.nodes))[0];
  const { rects } = resolveLayout(gui, { id: 'desktop', w: 1920, h: 1080 });
  const r = rects.get(gui.children.find((c) => c.class === 'Frame').id);
  assert.equal(Math.round(r.x), 480);
  assert.equal(Math.round(r.y), 270);
  assert.equal(Math.round(r.w), 960);
  assert.equal(Math.round(r.h), 540);
});

test('the same Position with the default anchor is a DIFFERENT rectangle, and that is the defect', () => {
  const built = buildUiTree(`${HEAD}
local a = Instance.new("Frame")
a.Position = UDim2.fromScale(0.5, 1)
a.Size = UDim2.fromScale(0.6, 0.12)
a.Parent = gui
`);
  const gui = screenGuisInPlayerGui(indexTree(built.nodes))[0];
  const { rects } = resolveLayout(gui, { id: 'desktop', w: 1920, h: 1080 });
  const r = rects.get(gui.children[0].id);
  // Top edge AT the bottom of the screen: the whole bar renders below the viewport.
  assert.equal(Math.round(r.y), 1080);
  assert.equal(r.y + r.h > 1080, true);
});

test('a parented UIAspectRatioConstraint holds the shape across viewports and an unparented one does not', () => {
  const src = (parentIt) => `${HEAD}
local p = Instance.new("Frame")
p.AnchorPoint = Vector2.new(0.5, 0.5)
p.Position = UDim2.fromScale(0.5, 0.5)
p.Size = UDim2.fromScale(0.5, 0.5)
p.Parent = gui
local r = Instance.new("UIAspectRatioConstraint")
r.AspectRatio = 16/9
${parentIt ? 'r.Parent = p' : ''}
`;
  const ratios = (parentIt) => {
    const gui = screenGuisInPlayerGui(indexTree(buildUiTree(src(parentIt)).nodes))[0];
    return VIEWPORTS.map((v) => {
      const r = resolveLayout(gui, v).rects.get(gui.children[0].id);
      return r.w / r.h;
    });
  };
  const locked = ratios(true);
  assert.ok(Math.max(...locked) - Math.min(...locked) < 0.01, `locked ratios drifted: ${locked}`);
  const loose = ratios(false);
  assert.ok(Math.max(...loose) - Math.min(...loose) > 0.5, `unparented constraint should NOT hold shape: ${loose}`);
});

test('a UIListLayout stacks children and a hand-positioned pile does not', () => {
  const built = buildUiTree(`${HEAD}
local p = Instance.new("Frame")
p.Size = UDim2.fromScale(0.4, 0.6)
p.Parent = gui
local l = Instance.new("UIListLayout")
l.Padding = UDim.new(0, 8)
l.Parent = p
for i = 1, 3 do
	local b = Instance.new("TextButton")
	b.LayoutOrder = i
	b.Size = UDim2.fromScale(1, 0.2)
	b.Parent = p
end
`);
  const gui = screenGuisInPlayerGui(indexTree(built.nodes))[0];
  const panel = gui.children[0];
  const { rects } = resolveLayout(gui, { id: 'desktop', w: 1920, h: 1080 });
  const ys = panel.children.filter((c) => c.class === 'TextButton').map((c) => rects.get(c.id).y);
  assert.deepEqual(ys, [...ys].sort((a, b) => a - b));
  assert.ok(ys[1] - ys[0] > 100, 'stacked buttons must not sit on top of each other');
});

// ----------------------------------------------------------------------------------- deprecation

test('deprecated APIs are found by their engine-documented names and nothing else is', () => {
  const found = deprecatedApis(`
local l = Instance.new("TextLabel")
l.FontSize = Enum.FontSize.Size18
l.TextColor = Color3.new(1,1,1)
l:TweenPosition(UDim2.new())
wait(1)
`).map((f) => f.detail).join(' | ');
  assert.match(found, /FontSize/);
  assert.match(found, /TextColor/);
  assert.match(found, /TweenPosition/);
  assert.match(found, /wait\(\)/);

  // The modern spellings must not fire: a scorer that punishes TextColor3 would be worse than none.
  assert.deepEqual(deprecatedApis(`
local l = Instance.new("TextLabel")
l.TextColor3 = Color3.fromRGB(255,255,255)
l.BackgroundColor3 = Color3.fromRGB(0,0,0)
l.TextWrapped = true
l.TextSize = 18
task.wait(1)
`), []);

  // Superseded is not deprecated, and the two are reported separately.
  assert.deepEqual(deprecatedApis('label.Font = Enum.Font.GothamBold'), []);
  assert.equal(legacyApis('label.Font = Enum.Font.GothamBold').length, 1);
});

// ------------------------------------------------------------------------------- end-to-end pass

const GOOD_PANEL = `
local Players = game:GetService("Players")
local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")

local gui = Instance.new("ScreenGui")
gui.Name = "SettingsUI"
gui.ResetOnSpawn = false
gui.Parent = playerGui

local panel = Instance.new("Frame")
panel.Name = "Panel"
panel.AnchorPoint = Vector2.new(0.5, 0.5)
panel.Position = UDim2.fromScale(0.5, 0.5)
panel.Size = UDim2.fromScale(0.5, 1)
panel.BackgroundColor3 = Color3.fromRGB(28, 28, 32)
panel.Parent = gui

local ratio = Instance.new("UIAspectRatioConstraint")
ratio.AspectRatio = 16 / 9
ratio.Parent = panel

local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(0, 12)
corner.Parent = panel

local title = Instance.new("TextLabel")
title.Name = "Title"
title.Text = "Settings"
title.Size = UDim2.fromScale(1, 0.18)
title.BackgroundTransparency = 1
title.TextColor3 = Color3.fromRGB(240, 240, 245)
title.Parent = panel
`;

test('a correct centred aspect-locked panel passes every check', () => {
  const result = scoreUiTask(byId['centered-aspect-panel'], fence(GOOD_PANEL));
  assert.equal(result.stage, 'checks', result.detail ?? result.reason);
  assert.equal(result.ok, true, JSON.stringify(result.checks.filter((c) => !c.ok), null, 1));
});

// ------------------------------------------------------------------------------- end-to-end fail
//
// Each mutation below passes `packages/evals/tasks/ui-implementation.json` — the words are all
// still there — and is caught here by the arithmetic.

test('an aspect constraint that is never parented is caught, though the words are all present', () => {
  const result = scoreUiTask(byId['centered-aspect-panel'], fence(GOOD_PANEL.replace('ratio.Parent = panel', '')));
  assert.equal(result.ok, false);
  const failed = result.checks.filter((c) => !c.ok).map((c) => c.id);
  assert.ok(failed.includes('UIAspectRatioConstraint_under_Frame'), failed.join());
  assert.ok(failed.includes('aspect_stable'), failed.join());
});

test('the default AnchorPoint beside a centred Position is caught as an off-centre rectangle', () => {
  const result = scoreUiTask(
    byId['centered-aspect-panel'],
    fence(GOOD_PANEL.replace('panel.AnchorPoint = Vector2.new(0.5, 0.5)', 'panel.AnchorPoint = Vector2.new(0, 0)')),
  );
  assert.equal(result.ok, false);
  assert.ok(result.checks.find((c) => c.id === 'centered' && !c.ok), 'centring must fail');
});

test('a panel sized in pixels is caught as not scaling, though it looks right at one size', () => {
  const result = scoreUiTask(
    byId['centered-aspect-panel'],
    fence(GOOD_PANEL.replace('panel.Size = UDim2.fromScale(0.5, 1)', 'panel.Size = UDim2.fromOffset(960, 540)')),
  );
  assert.equal(result.ok, false);
  assert.ok(result.checks.find((c) => c.id === 'scales_with_screen' && !c.ok), 'pixel sizing must fail');
});

test('a bottom bar with the default anchor is caught rendering below the screen', () => {
  const bar = (anchor) => `
local Players = game:GetService("Players")
local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")
local gui = Instance.new("ScreenGui")
gui.Parent = playerGui
local bar = Instance.new("Frame")
bar.Name = "ActionBar"
${anchor}
bar.Position = UDim2.fromScale(0.5, 1)
bar.Size = UDim2.fromScale(0.6, 0.12)
bar.Parent = gui
local list = Instance.new("UIListLayout")
list.FillDirection = Enum.FillDirection.Horizontal
list.Parent = bar
for i, n in ipairs({"Attack", "Block", "Heal"}) do
	local b = Instance.new("TextButton")
	b.Name = n
	b.Text = n
	b.LayoutOrder = i
	b.Size = UDim2.fromScale(1/3, 1)
	b.Parent = bar
end
`;
  const right = scoreUiTask(byId['bottom-action-bar'], fence(bar('bar.AnchorPoint = Vector2.new(0.5, 1)')));
  assert.equal(right.ok, true, JSON.stringify(right.checks.filter((c) => !c.ok), null, 1));

  const wrong = scoreUiTask(byId['bottom-action-bar'], fence(bar('')));
  assert.equal(wrong.ok, false);
  const ids = wrong.checks.filter((c) => !c.ok).map((c) => c.id);
  assert.ok(ids.includes('on_screen'), ids.join());
  assert.ok(ids.includes('sits_on_bottom_edge'), ids.join());
});

test('opting out of the topbar inset on tappable UI is caught, and the engine default passes', () => {
  const hud = (extra) => `
local Players = game:GetService("Players")
local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")
local gui = Instance.new("ScreenGui")
gui.Name = "HUD"
${extra}
gui.Parent = playerGui
local pill = Instance.new("TextButton")
pill.Name = "Coins"
pill.Text = "0"
pill.AnchorPoint = Vector2.new(1, 0)
pill.Position = UDim2.fromScale(0.98, 0.02)
pill.Size = UDim2.fromScale(0.15, 0.06)
pill.Parent = gui
pill.Activated:Connect(function() print("shop") end)
`;
  const fine = scoreUiTask(byId['hud-currency-pill'], fence(hud('')));
  assert.equal(fine.ok, true, JSON.stringify(fine.checks.filter((c) => !c.ok), null, 1));

  const opted = scoreUiTask(byId['hud-currency-pill'], fence(hud('gui.IgnoreGuiInset = true')));
  assert.equal(opted.checks.find((c) => c.id === 'safe_area_interactive').ok, false);

  const none = scoreUiTask(byId['hud-currency-pill'], fence(hud('gui.ScreenInsets = Enum.ScreenInsets.None')));
  assert.equal(none.checks.find((c) => c.id === 'safe_area_interactive').ok, false);
});

test('_G and shared are writable, because Roblox Luau writes them and the interpreter freezes them', () => {
  // A real answer did `_G.CoinCounter = CoinCounter` and the standalone interpreter's frozen `_G`
  // turned a working build into "attempt to modify a readonly table" — a harness gap that would
  // have been recorded as the model failing.
  const built = buildUiTree(`${HEAD}
_G.Thing = { n = 1 }
shared.Other = 2
local f = Instance.new("Frame")
f.Parent = gui
`);
  assert.equal(built.status, 'ok', built.detail);
});

test('a zero-size positioning anchor is judged by what it renders, not by its own empty box', () => {
  // A real answer built its coin counter as a zero-size Frame in the corner with the sized button
  // inside it. That is ordinary Roblox and renders exactly right; asking whether the FRAME is on
  // screen answered "zero area" and marked a correct build wrong.
  const answer = fence(`${HEAD}
local anchor = Instance.new("Frame")
anchor.Name = "CoinAnchor"
anchor.AnchorPoint = Vector2.new(1, 0)
anchor.Position = UDim2.new(1, -12, 0, 12)
anchor.Size = UDim2.new(0, 0, 0, 0)
anchor.BackgroundTransparency = 1
anchor.Parent = gui
local button = Instance.new("TextButton")
button.Name = "Coins"
button.Text = "0"
button.AnchorPoint = Vector2.new(1, 0)
button.Size = UDim2.new(0, 150, 0, 44)
button.Parent = anchor
button.Activated:Connect(function() end)
`);
  const result = scoreUiTask(byId['hud-currency-pill'], answer);
  assert.equal(result.checks.find((c) => c.id === 'on_screen').ok, true, JSON.stringify(result.checks, null, 1));
  assert.equal(result.checks.find((c) => c.id === 'in_top_right').ok, true);

  // The extent is still a real measurement, not a way of passing everything: push the anchor 100px
  // past the right edge and the button it carries goes off screen with it.
  const off = scoreUiTask(byId['hud-currency-pill'], answer.replace('anchor.Position = UDim2.new(1, -12, 0, 12)', 'anchor.Position = UDim2.new(1, 100, 0, 12)'));
  const offCheck = off.checks.find((c) => c.id === 'on_screen');
  assert.equal(offCheck.ok, false, offCheck.detail);
  assert.match(offCheck.detail, /past the right/);
});

test('a child called Play is reachable by name, and TweenService still has its own Create', () => {
  // A real answer did `panel[name].Activated:Connect(...)` over {"Play","Shop","Settings","Quit"}
  // and died on "attempt to index function with 'Activated'" — because the shim's shared method
  // table answered `Play`. A button called Play is the commonest element in Roblox UI, and the
  // harness fault was being recorded as the model's.
  const built = buildUiTree(`${HEAD}
local panel = Instance.new("Frame")
panel.Parent = gui
for _, name in ipairs({ "Play", "Shop", "Cancel", "Create" }) do
	local b = Instance.new("TextButton")
	b.Name = name
	b.Parent = panel
end
for _, name in ipairs({ "Play", "Shop", "Cancel", "Create" }) do
	panel[name].Activated:Connect(function() end)
end
local TweenService = game:GetService("TweenService")
TweenService:Create(panel, TweenInfo.new(0.2), { BackgroundTransparency = 1 }):Play()
`);
  assert.equal(built.status, 'ok', built.detail);
});

test('a build that sizes itself from AbsoluteSize is recorded as UNMEASURABLE, never as wrong', () => {
  // AbsoluteSize is decided by the renderer after a frame. This harness has no renderer, so the
  // rectangles for such a build would be measuring the harness. It must say so.
  const answer = fence(`${HEAD}
local scroll = Instance.new("ScrollingFrame")
scroll.Name = "Items"
scroll.Size = UDim2.fromScale(1, 1)
scroll.Parent = gui
local grid = Instance.new("UIGridLayout")
grid.Parent = scroll
local function fit()
	local cell = scroll.AbsoluteSize.X / 3
	grid.CellSize = UDim2.fromOffset(cell, cell)
end
fit()
for i = 1, 6 do
	local tile = Instance.new("Frame")
	tile.LayoutOrder = i
	tile.Parent = scroll
end
`);
  const result = scoreUiTask(byId['shop-grid'], answer);
  assert.equal(result.runtimeMeasuredLayout, true);
  const geometric = result.checks.find((c) => c.id === 'tiles_are_square');
  assert.equal(geometric.skipped, true, 'a geometry check over an unresolvable build must be skipped');
  assert.equal(geometric.ok, false, 'skipped is NOT a pass');
  assert.match(geometric.detail, /AbsoluteSize/);
  // Structure is still scored: the harness could see these without a renderer.
  assert.equal(result.checks.find((c) => c.id === 'has_UIGridLayout').ok, true);
  assert.match(result.reason, /^unmeasurable:/);
});

test('prose instead of code, and a build that throws, are reported as their own failures', () => {
  assert.equal(scoreUiTask(byId['centered-aspect-panel'], 'Here is how you would do it: first create a ScreenGui...').reason, 'no_code_block');
  const thrown = scoreUiTask(byId['centered-aspect-panel'], fence('error("nope")'));
  assert.equal(thrown.reason, 'runtime_error');
  assert.match(thrown.detail, /nope/);
});

/**
 * EVERY TASK MUST BE PASSABLE, OR THE EVAL MEASURES ITSELF.
 *
 * A task whose checks no correct answer can satisfy reports the model as failing at something the
 * scorer got wrong, and it reports it forever without anybody noticing — the number goes down and
 * the cause looks like the model. So each of the six carries a reference answer here, written by
 * hand, and a task is only allowed into the suite while a human-written correct answer scores it
 * green. These are NOT shown to the model and are not a marking key: the scorer never compares an
 * answer to them, it only ever runs what the model wrote.
 */
const REFERENCE = {
  'centered-aspect-panel': GOOD_PANEL,

  'bottom-action-bar': `${HEAD}
local bar = Instance.new("Frame")
bar.Name = "ActionBar"
bar.AnchorPoint = Vector2.new(0.5, 1)
bar.Position = UDim2.fromScale(0.5, 1)
bar.Size = UDim2.fromScale(0.6, 0.12)
bar.Parent = gui
local list = Instance.new("UIListLayout")
list.FillDirection = Enum.FillDirection.Horizontal
list.SortOrder = Enum.SortOrder.LayoutOrder
list.Parent = bar
for i, n in ipairs({ "Attack", "Block", "Heal" }) do
	local b = Instance.new("TextButton")
	b.Name = n
	b.Text = n
	b.LayoutOrder = i
	b.Size = UDim2.fromScale(1 / 3, 1)
	b.Parent = bar
end
`,

  'menu-list-stack': `${HEAD}
local panel = Instance.new("Frame")
panel.Name = "Menu"
panel.AnchorPoint = Vector2.new(0.5, 0.5)
panel.Position = UDim2.fromScale(0.5, 0.5)
panel.Size = UDim2.fromScale(0.4, 0.6)
panel.Parent = gui
local pad = Instance.new("UIPadding")
pad.PaddingTop = UDim.new(0.04, 0)
pad.PaddingBottom = UDim.new(0.04, 0)
pad.PaddingLeft = UDim.new(0.06, 0)
pad.PaddingRight = UDim.new(0.06, 0)
pad.Parent = panel
local list = Instance.new("UIListLayout")
list.FillDirection = Enum.FillDirection.Vertical
list.SortOrder = Enum.SortOrder.LayoutOrder
list.Padding = UDim.new(0.03, 0)
list.Parent = panel
for i, name in ipairs({ "Play", "Shop", "Settings", "Quit" }) do
	local b = Instance.new("TextButton")
	b.Name = name
	b.Text = name
	b.LayoutOrder = i
	b.Size = UDim2.fromScale(1, 0.22)
	b.Parent = panel
end
`,

  'shop-grid': `${HEAD}
local panel = Instance.new("Frame")
panel.Name = "Shop"
panel.AnchorPoint = Vector2.new(0.5, 0.5)
panel.Position = UDim2.fromScale(0.5, 0.5)
panel.Size = UDim2.fromScale(0.6, 0.6)
panel.Parent = gui
local scroll = Instance.new("ScrollingFrame")
scroll.Name = "Items"
scroll.Size = UDim2.fromScale(1, 1)
scroll.CanvasSize = UDim2.fromScale(0, 0)
scroll.AutomaticCanvasSize = Enum.AutomaticSize.Y
scroll.Parent = panel
local grid = Instance.new("UIGridLayout")
grid.CellSize = UDim2.fromScale(0.3, 0)
grid.CellPadding = UDim2.fromScale(0.02, 0.02)
grid.Parent = scroll
for i = 1, 6 do
	local tile = Instance.new("Frame")
	tile.Name = "Tile" .. i
	tile.LayoutOrder = i
	tile.Parent = scroll
	local r = Instance.new("UIAspectRatioConstraint")
	r.AspectRatio = 1
	r.Parent = tile
	local n = Instance.new("TextLabel")
	n.Text = "Item " .. i
	n.Size = UDim2.fromScale(1, 0.6)
	n.Parent = tile
	local p = Instance.new("TextLabel")
	p.Text = "100"
	p.Position = UDim2.fromScale(0, 0.6)
	p.Size = UDim2.fromScale(1, 0.4)
	p.Parent = tile
end
`,

  'hud-currency-pill': `${HEAD}
local pill = Instance.new("TextButton")
pill.Name = "Coins"
pill.Text = "0"
pill.AnchorPoint = Vector2.new(1, 0)
pill.Position = UDim2.fromScale(0.98, 0.02)
pill.Size = UDim2.fromScale(0.15, 0.06)
pill.Parent = gui
pill.Activated:Connect(function() print("shop") end)
`,

  'fullscreen-backdrop': `
local Players = game:GetService("Players")
local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")
local gui = Instance.new("ScreenGui")
gui.ScreenInsets = Enum.ScreenInsets.None
gui.ResetOnSpawn = false
gui.Parent = playerGui
local back = Instance.new("Frame")
back.Name = "Backdrop"
back.Size = UDim2.fromScale(1, 1)
back.BackgroundColor3 = Color3.fromRGB(12, 12, 14)
back.Parent = gui
local label = Instance.new("TextLabel")
label.Name = "LoadingLabel"
label.Text = "Loading..."
label.AnchorPoint = Vector2.new(0.5, 0.5)
label.Position = UDim2.fromScale(0.5, 0.5)
label.Size = UDim2.fromScale(0.5, 0.1)
label.BackgroundTransparency = 1
label.Parent = back
`,
};

test('a hand-written correct answer passes every task in the suite', () => {
  for (const task of tasks) {
    const reference = REFERENCE[task.id];
    assert.ok(reference, `${task.id} has no reference answer — an unpassable task cannot be scored`);
    const result = scoreUiTask(task, fence(reference));
    assert.equal(result.stage, 'checks', `${task.id}: ${result.reason} ${result.detail ?? ''}`);
    assert.equal(result.ok, true, `${task.id} failed: ${JSON.stringify(result.checks.filter((c) => !c.ok), null, 1)}`);
  }
});

test('every task declares at least one geometric check, not only class-presence checks', () => {
  const geometric = new Set(['centered', 'on_screen', 'aspect_stable', 'scales_with_screen', 'stacked', 'children_contained', 'full_bleed', 'sits_on_bottom_edge', 'tiles_are_square', 'in_top_right']);
  for (const t of tasks) {
    assert.ok(t.checks.some((c) => geometric.has(c.id)), `${t.id} has no geometric check`);
  }
  assert.equal(tasks.length, UI_TASKS.length);
});
