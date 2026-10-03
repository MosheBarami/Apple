import type { AgentCtx } from './tools';
import type { StudioOp } from '@apple/shared';

/**
 * SCREENS THAT ARRIVED WITHOUT WORKING CODE STILL HAVE TO RESPOND.
 *
 * Library screens (a studded UI kit, a shop whose logic was stripped from the saved file) come with buttons and no
 * script that opens anything. Apple flags exactly those screens with the attribute AppleMenuBinder and adds ONE
 * LocalScript, AppleMenuBinder, that makes flagged screens open and close. A screen with working scripts of its own is
 * never flagged, so the binder never touches a button a real script already handles.
 */
export const BINDER_NAME = 'AppleMenuBinder';
export const BINDER_ATTRIBUTE = 'AppleMenuBinder';
export const BINDER_PARENT = 'game.StarterPlayer.StarterPlayerScripts';
export const BINDER_PATH = `${BINDER_PARENT}.${BINDER_NAME}`;

/** Runs on each player's client. Tested with a stand-in for the Roblox objects (tests/menu-binder.test.mjs). */
export const BINDER_SOURCE = `-- Apple menu binder. Screens that arrived without working code are flagged AppleMenuBinder; this script makes only
-- those screens open and close. A screen with scripts of its own is never flagged and never touched.
local Players = game:GetService("Players")

local FLAG = "AppleMenuBinder"
local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")

local CLOSE_KEYS = { close = true, x = true, exit = true, cross = true, xbutton = true, xbtn = true }
local CLOSE_TEXTS = { x = true, ["\\u{D7}"] = true, ["\\u{2715}"] = true, ["\\u{2716}"] = true, close = true, exit = true }
local WORDS = { "button", "btn", "frame", "menu", "window", "panel", "screen", "page", "open", "toggle", "holder", "container", "gui", "ui", "view", "tab" }
local GENERIC = { [""] = true, main = true, menu = true, open = true, toggle = true, button = true, btn = true, frame = true, gui = true, ui = true, window = true, panel = true }
local OPENISH = { main = true, menu = true, open = true, toggle = true }   -- "OpenButton", "Menu": opens the frame beside it
local PANEL_CLASSES = { "Frame", "ScrollingFrame", "CanvasGroup", "ImageLabel" }
-- Frames that hold a menu's insides are never the menu a button opens.
local STRUCTURAL = { template = true, container = true, content = true, contents = true, background = true, bg = true, top = true, bottom = true, header = true, footer = true,
	list = true, grid = true, items = true, tabs = true, buttons = true, scroll = true, scrolling = true, scrollingcontainer = true, frames = true, title = true, topbar = true, bar = true }
local MAX_DEPTH = 2   -- a menu is near the top of its screen; a frame further down is a part of one

-- Weak, so the screens a respawn replaces are not kept alive.
local screens = setmetatable({}, { __mode = "k" })   -- the flagged screens in the PlayerGui
local openers = setmetatable({}, { __mode = "k" })   -- menu -> true, for every menu some button opens
local started = setmetatable({}, { __mode = "k" })   -- menus already set to start closed
local bound = setmetatable({}, { __mode = "k" })     -- buttons already connected
local scheduled = false

-- "ShopButton", "OpenShop" and "Shop" are all "shop"; a word is only taken off when something is left.
local function keyOf(name)
	local cleaned = string.gsub(name or "", "[^%w]", "")
	local key = string.lower(cleaned)
	local changed = true
	while changed do
		changed = false
		for _, word in WORDS do
			if #key > #word and string.sub(key, 1, #word) == word then key = string.sub(key, #word + 1); changed = true end
			if #key > #word and string.sub(key, -#word) == word then key = string.sub(key, 1, -#word - 1); changed = true end
		end
	end
	return key
end

-- "pets" and "pet" are the same word.
local function canon(key)
	if #key > 4 and string.sub(key, -1) == "s" then return string.sub(key, 1, -2) end
	return key
end

local function isPanel(inst)
	for _, class in PANEL_CLASSES do
		if inst:IsA(class) then return true end
	end
	return false
end

local function depthOf(inst, root)
	local depth, node = 0, inst.Parent
	while node and node ~= root do depth += 1; node = node.Parent end
	return depth
end

-- A row in a list or a grid, or anything inside a template the game would copy, is not a menu (and a template's buttons never exist).
local function isListItem(inst, root)
	local parent = inst.Parent
	if parent and parent ~= root and (parent:IsA("ScrollingFrame") or parent:FindFirstChildOfClass("UIListLayout") or parent:FindFirstChildOfClass("UIGridLayout")) then return true end
	while parent and parent ~= root do
		if keyOf(parent.Name) == "template" then return true end
		parent = parent.Parent
	end
	return false
end

-- A button named for a close, or a plainly named button whose label is an X. A checkbox called "HideObjects" that shows an X is not one.
local function isClose(button)
	local key = keyOf(button.Name)
	if CLOSE_KEYS[key] then return true end
	if not button:IsA("TextButton") or not GENERIC[(string.gsub(key, "%d+$", ""))] then return false end
	local spaced = string.gsub(button.Text or "", "%s", "")
	return CLOSE_TEXTS[string.lower(spaced)] == true
end

-- The menu a button opens: the panel with the same name (topmost first), on its own screen; on another screen only that screen's
-- one window when the screen is named for the menu (an "IndexBTN" in the HUD opens the Index screen). Never a frame the button
-- sits inside ("SpinButton" in the Spin menu spins; it does not hide the menu), one that holds a menu's insides, or one buried
-- deep in a menu.
local function findPanel(key, panels, button)
	if STRUCTURAL[key] then return nil end
	local want, best = canon(key), nil
	local home = button:FindFirstAncestorOfClass("ScreenGui")
	for _, panel in panels do
		local near = panel.entry or (panel.screen == home and panel.depth <= MAX_DEPTH)
		if near and canon(panel.key) == want and not STRUCTURAL[panel.key] and not button:IsDescendantOf(panel.inst) and (not best or panel.depth < best.depth) then best = panel end
	end
	return best and best.inst
end

-- A button with no name of its own ("OpenButton", "Menu") opens the frame beside it.
local function siblingPanel(button)
	local found, count = nil, 0
	for _, sibling in button.Parent:GetChildren() do
		if sibling ~= button and isPanel(sibling) then
			count += 1
			found = found or sibling
			if string.find(string.lower(sibling.Name), "main") or string.find(string.lower(sibling.Name), "menu") then return sibling end
		end
	end
	return count == 1 and found or nil
end

-- Every button and every possible menu on the flagged screens. A screen named for a menu ("Index") with one window in it stands for it.
local function collect()
	local buttons, panels = {}, {}
	for gui in screens do
		if gui.Parent ~= playerGui then
			screens[gui] = nil
		else
			for _, inst in gui:GetDescendants() do
				if inst:IsA("GuiButton") then
					table.insert(buttons, inst)
				elseif isPanel(inst) and not isListItem(inst, gui) then
					table.insert(panels, { inst = inst, key = keyOf(inst.Name), depth = depthOf(inst, gui), screen = gui })
				end
			end
			local only, count = nil, 0
			for _, child in gui:GetChildren() do
				if isPanel(child) then count += 1; only = child end
			end
			if count == 1 then table.insert(panels, { inst = only, key = keyOf(gui.Name), depth = 0, screen = gui, entry = true }) end
		end
	end
	return buttons, panels
end

-- "close" for a Close button, the menu for a button that opens one, nothing for a button that is not about menus.
local function classify(button, panels)
	if isClose(button) then return "close" end
	local key = keyOf(button.Name)
	local panel = not GENERIC[key] and findPanel(key, panels, button) or nil
	if not panel and button:IsA("TextButton") then
		local textKey = keyOf(button.Text)
		if not GENERIC[textKey] then panel = findPanel(textKey, panels, button) end
	end
	if not panel and OPENISH[key] then panel = siblingPanel(button) end
	if panel ~= button then return panel end
	return nil
end

local function isOpen(panel)
	local screen = panel:FindFirstAncestorOfClass("ScreenGui")
	return panel.Visible and (not screen or screen.Enabled)
end

local function open(panel, button)
	for other in openers do
		if other ~= panel and not button:IsDescendantOf(other) and not panel:IsDescendantOf(other) then other.Visible = false end
	end
	local screen = panel:FindFirstAncestorOfClass("ScreenGui")
	if screen and not screen.Enabled then screen.Enabled = true end
	panel.Visible = true
end

-- The menu a Close button hides: the nearest menu some button opens, else the nearest frame that is a menu of its own, else the
-- outermost frame around it (a window whose only frames are called "Container" and "Content" is still the window).
local function closeTarget(button)
	local node, fallback, outer = button.Parent, nil, nil
	while node and not node:IsA("ScreenGui") do
		if openers[node] then return node end
		if isPanel(node) then
			outer = node
			if not fallback and not STRUCTURAL[keyOf(node.Name)] then fallback = node end
		end
		node = node.Parent
	end
	return fallback or outer
end

local function connect(button, target)
	if target == "close" then
		button.Activated:Connect(function()
			local menu = closeTarget(button)
			if menu then menu.Visible = false end
		end)
	else
		button.Activated:Connect(function()
			if isOpen(target) then target.Visible = false else open(target, button) end
		end)
	end
end

local function bindAll()
	local buttons, panels = collect()
	for _, button in buttons do
		if not bound[button] then
			local target = classify(button, panels)
			if target then
				bound[button] = true
				if target ~= "close" then openers[target] = true end
				connect(button, target)
			end
		end
	end
	-- Menus a button can open start closed.
	for panel in openers do
		if not started[panel] then started[panel] = true; panel.Visible = false end
	end
end

-- Screens arrive one after another; they are bound together once they are all in.
local function consider(child)
	if child:IsA("ScreenGui") and child:GetAttribute(FLAG) == true then
		screens[child] = true
		if not scheduled then
			scheduled = true
			task.defer(function()
				scheduled = false
				bindAll()
			end)
		end
	end
end

for _, child in playerGui:GetChildren() do consider(child) end
playerGui.ChildAdded:Connect(consider)
`;

/** A script with nothing but comments and blank lines, or one the library saved as a failed decompile, has no logic left. */
export function isStrippedSource(source: string): boolean {
  if (/decompilation panicked/i.test(source)) return true;
  return source.replace(/--\[(=*)\[[\s\S]*?\]\1\]/g, '').replace(/--[^\n]*/g, '').trim().length === 0;
}

const SCREEN_ROOT = /^game\.StarterGui(?:\.[^.[\]\s]+|\["[^"\]]+"\])$/;
/** The screens (direct children of StarterGui) among the paths an import reported. */
export function screenRoots(inserted: unknown): string[] {
  return Array.isArray(inserted) ? [...new Set(inserted.filter((p): p is string => typeof p === 'string' && SCREEN_ROOT.test(p)))].slice(0, 12) : [];
}

const lastName = (path: string) => (/\["([^"]+)"\]$/.exec(path)?.[1] ?? path.split('.').pop() ?? '');
const GENERIC_BUTTON = /^(button|btn|textbutton|imagebutton|frame|main|menu|open|close|x|exit|ok|yes|no)$/i;
const MAX_SCREENS = 8;

export interface ScreenToWire { path: string; /** The library's verdict for what the screen came from, when known. */ works?: string }
export interface WireResult {
  /** Screens that now open and close. */
  wired: string[];
  /** Screens left alone, with the reason (for the model, never for the user). */
  left: { path: string; why: string }[];
  binder?: 'added' | 'present' | 'failed';
}

async function step(ctx: AgentCtx, op: StudioOp, timeoutMs = 60_000) {
  const out = await ctx.execStudioOp(op, timeoutMs);
  return out.ok ? { ok: true as const, data: (out.data ?? {}) as Record<string, unknown> } : { ok: false as const, failure: out.failure, error: out.error };
}

/** Whether a script outside the screen already talks about one of its buttons, in code rather than a comment. */
async function drivenFromOutside(ctx: AgentCtx, screen: string, buttonNames: string[]) {
  const probes = [...new Set(buttonNames.filter((n) => n.length >= 4 && !GENERIC_BUTTON.test(n)))].slice(0, 3);
  for (const query of probes) {
    const found = await step(ctx, { op: 'search_scripts', query, maxResults: 10 });
    if (!found.ok) return undefined;
    const hits = Array.isArray(found.data.matches) ? found.data.matches as { path?: unknown; text?: unknown }[] : [];
    if (hits.some((h) => typeof h.path === 'string' && !h.path.startsWith(screen) && h.path !== BINDER_PATH && !/^\s*--/.test(String(h.text ?? '')))) return true;
  }
  return false;
}

/**
 * Make the screens that arrived without working code open and close. Screens the library says work ('yes'), screens with
 * no buttons, screens holding working code of their own, and screens a script elsewhere already handles are left alone.
 * Nothing here can fail a build: an operation the paired plugin lacks or refuses just leaves the screen as it was.
 */
export async function wireScreens(ctx: AgentCtx, screens: ScreenToWire[]): Promise<WireResult> {
  const result: WireResult = { wired: [], left: [] };
  const flagged: string[] = [];
  for (const screen of screens.slice(0, MAX_SCREENS)) {
    if (screen.works === 'yes') { result.left.push({ path: screen.path, why: 'its own scripts work' }); continue; }
    const buttons = await step(ctx, { op: 'query_instances', root: screen.path, isA: 'GuiButton', limit: 40 });
    const matches = buttons.ok && Array.isArray(buttons.data.matches) ? buttons.data.matches as { path?: unknown }[] : [];
    if (!buttons.ok || !matches.length) { result.left.push({ path: screen.path, why: buttons.ok ? 'no buttons' : 'could not read it' }); continue; }
    const inside = await step(ctx, { op: 'dump_scripts', root: screen.path, maxScripts: 40, maxChars: 120_000 });
    if (!inside.ok) { result.left.push({ path: screen.path, why: 'could not read its scripts' }); continue; }
    const own = Array.isArray(inside.data.scripts) ? inside.data.scripts as { source?: unknown }[] : [];
    if (own.some((s) => typeof s.source === 'string' && !isStrippedSource(s.source))) { result.left.push({ path: screen.path, why: 'its own scripts work' }); continue; }
    const names = matches.map((m) => lastName(String(m.path ?? '')));
    if (await drivenFromOutside(ctx, screen.path, names) !== false) { result.left.push({ path: screen.path, why: 'a script elsewhere handles it' }); continue; }
    flagged.push(screen.path);
  }
  if (!flagged.length) return result;
  const present = await step(ctx, { op: 'read_script', path: BINDER_PATH });
  if (present.ok) result.binder = 'present';
  else {
    const made = await step(ctx, { op: 'edit_script', path: BINDER_PATH, source: BINDER_SOURCE, create: { className: 'LocalScript', parent: BINDER_PARENT } });
    result.binder = made.ok ? 'added' : 'failed';
    if (!made.ok) { for (const path of flagged) result.left.push({ path, why: 'could not add the menu script' }); return result; }
  }
  for (const path of flagged) {
    const marked = await step(ctx, { op: 'set_props', path, attributes: { [BINDER_ATTRIBUTE]: { t: 'bool', v: true } } });
    if (marked.ok) result.wired.push(path); else result.left.push({ path, why: 'could not mark it' });
  }
  return result;
}
