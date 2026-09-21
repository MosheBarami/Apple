-- Horror HUD — LocalScript
local Players = game:GetService("Players")
local StarterGui = game:GetService("StarterGui")
local player = Players.LocalPlayer

-- Core collision: custom health meter replaces the core one
pcall(function()
	StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Health, false)
end)

local gui = Instance.new("ScreenGui")
gui.Name = "HorrorHud"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
gui.Parent = player:WaitForChild("PlayerGui")

local INK = Color3.fromRGB(12, 10, 12)
local BLOOD = Color3.fromRGB(148, 26, 30)
local BONE = Color3.fromRGB(214, 206, 196)
local DIRT = Color3.fromRGB(38, 34, 36)
local SICKLY = Color3.fromRGB(122, 138, 74)

local function base(className, props, parent)
	local inst = Instance.new(className)
	for k, v in pairs(props) do inst[k] = v end
	inst.Parent = parent
	return inst
end

local function corner(r, inst)
	base("UICorner", { CornerRadius = UDim.new(0, r) }, inst)
end

local function stroke(color, thickness, inst)
	base("UIStroke", { Color = color, Thickness = thickness, Transparency = 0.25 }, inst)
end

-- ============ TOP-CENTRE BAND: chapter title + objective ============
local topBand = base("Frame", {
	Name = "TopCentre",
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 36), -- below Roblox top bar
	Size = UDim2.new(0.42, 0, 0, 64),
	BackgroundTransparency = 1,
}, gui)

local chapter = base("TextLabel", {
	Size = UDim2.new(1, 0, 0, 22),
	BackgroundTransparency = 1,
	Font = Enum.Font.SpecialElite,
	Text = "CHAPTER II — THE FLOODED BASEMENT",
	TextColor3 = BONE,
	TextSize = 16,
	TextTransparency = 0.15,
}, topBand)

local objective = base("TextLabel", {
	Position = UDim2.new(0, 0, 0, 26),
	Size = UDim2.new(1, 0, 0, 34),
	BackgroundTransparency = 1,
	Font = Enum.Font.SpecialElite,
	Text = "Find the fuse for the breaker — 2 of 4 fuses collected",
	TextColor3 = Color3.fromRGB(168, 158, 148),
	TextSize = 14,
	TextWrapped = true,
}, topBand)

-- ============ LEFT EDGE: survival meters (below top bar) ============
local meters = base("Frame", {
	Name = "Meters",
	Position = UDim2.new(0, 0, 0, 0.18),
	Size = UDim2.new(0, 0, 0, 0),
	BackgroundTransparency = 1,
}, gui)
base("UIListLayout", {
	Padding = UDim.new(0, 10),
	SortOrder = Enum.SortOrder.LayoutOrder,
}, meters)

local function makeMeter(order, label, fillColor, fillPct)
	local holder = base("Frame", {
		LayoutOrder = order,
		Size = UDim2.new(0, 190, 0, 34),
		BackgroundColor3 = INK,
		BackgroundTransparency = 0.25,
	}, meters)
	corner(4, holder)
	stroke(DIRT, 1, holder)

	base("TextLabel", {
		Position = UDim2.new(0, 8, 0, 3),
		Size = UDim2.new(1, -16, 0, 12),
		BackgroundTransparency = 1,
		Font = Enum.Font.SpecialElite,
		Text = label,
		TextColor3 = BONE,
		TextSize = 11,
		TextXAlignment = Enum.TextXAlignment.Left,
	}, holder)

	local track = base("Frame", {
		Position = UDim2.new(0, 8, 0, 18),
		Size = UDim2.new(1, -16, 0, 8),
		BackgroundColor3 = Color3.fromRGB(24, 20, 22),
		BorderSizePixel = 0,
	}, holder)
	corner(3, track)

	local fill = base("Frame", {
		Size = UDim2.new(fillPct, 0, 1, 0),
		BackgroundColor3 = fillColor,
		BorderSizePixel = 0,
	}, track)
	corner(3, fill)
	return fill
end

-- Custom health meter (core Health disabled above)
makeMeter(1, "VITALS", BLOOD, 0.72)
-- Sanity meter — compact, animates color not a blocking panel
makeMeter(2, "SANITY", SICKLY, 0.41)
-- Battery for the flashlight
makeMeter(3, "FLASHLIGHT BATTERY", Color3.fromRGB(196, 168, 84), 0.63)

-- ============ MID-RIGHT: minimap ============
local minimap = base("Frame", {
	Name = "Minimap",
	AnchorPoint = Vector2.new(1, 0.5),
	Position = UDim2.new(1, -12, 0.5, 0),
	Size = UDim2.new(0, 150, 0, 150),
	BackgroundColor3 = INK,
	BackgroundTransparency = 0.2,
}, minimap and gui or gui)
corner(6, minimap)
stroke(DIRT, 2, minimap)

base("TextLabel", {
	Size = UDim2.new(1, 0, 0, 18),
	BackgroundTransparency = 1,
	Font = Enum.Font.SpecialElite,
	Text = "GROUND FLOOR",
	TextColor3 = BONE,
	TextSize = 11,
}, minimap)

-- schematic rooms
local rooms = {
	{ UDim2.new(0.12, 0, 0.28, 0), UDim2.new(0.34, 0, 0.30, 0) }, -- foyer
	{ UDim2.new(0.52, 0, 0.28, 0), UDim2.new(0.34, 0, 0.22, 0) }, -- gallery
	{ UDim2.new(0.30, 0, 0.62, 0), UDim2.new(0.40, 0, 0.26, 0) }, -- stair hall
}
for _, r in ipairs(rooms) do
	base("Frame", {
		Position = r[1], Size = r[2],
		BackgroundColor3 = Color3.fromRGB(46, 42, 44),
		BackgroundTransparency = 0.15,
		BorderSizePixel = 0,
	}, minimap)
end
-- player blip
base("Frame", {
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.new(0.44, 0, 0.72, 0),
	Size = UDim2.new(0, 8, 0, 8),
	BackgroundColor3 = BLOOD,
	BorderSizePixel = 0,
}, minimap)

-- ============ BOTTOM-CENTRE: button rail ============
local rail = base("Frame", {
	Name = "ButtonRail",
	AnchorPoint = Vector2.new(0.5, 1),
	Position = UDim2.new(0.5, 0, 1, -14),
	Size = UDim2.new(0, 0, 0, 44),
	BackgroundTransparency = 1,
}, gui)
base("UIListLayout", {
	FillDirection = Enum.FillDirection.Horizontal,
	Padding = UDim.new(0, 8),
	SortOrder = Enum.SortOrder.LayoutOrder,
}, rail)

local function railButton(order, text)
	local btn = base("TextButton", {
		LayoutOrder = order,
		Size = UDim2.new(0, 96, 1, 0),
		BackgroundColor3 = INK,
		BackgroundTransparency = 0.2,
		Font = Enum.Font.SpecialElite,
		Text = text,
		TextColor3 = BONE,
		TextSize = 13,
		AutoButtonColor = true,
	}, rail)
	corner(4, btn)
	stroke(DIRT, 1, btn)
	return btn
end

railButton(1, "[F] LIGHT")
railButton(2, "[E] HIDE")
railButton(3, "[Q] CROUCH")
railButton(4, "[TAB] MAP")

-- ============ TOASTS (top-centre, under objective) ============
local toastHolder = base("Frame", {
	Name = "Toasts",
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 108),
	Size = UDim2.new(0.34, 0, 0, 0),
	BackgroundTransparency = 1,
}, gui)
base("UIListLayout", {
	Padding = UDim.new(0, 6),
	SortOrder = Enum.SortOrder.LayoutOrder,
	HorizontalAlignment = Enum.HorizontalAlignment.Center,
}, toastHolder)

local function toast(order, text, color)
	local t = base("TextLabel", {
		LayoutOrder = order,
		Size = UDim2.new(1, 0, 0, 26),
		BackgroundColor3 = INK,
		BackgroundTransparency = 0.15,
		Font = Enum.Font.SpecialElite,
		Text = "  " .. text,
		TextColor3 = color,
		TextSize = 13,
		TextXAlignment = Enum.TextXAlignment.Left,
	}, toastHolder)
	corner(3, t)
	stroke(DIRT, 1, t)
end

toast(1, "You hear footsteps above you.", BLOOD)
toast(2, "Fuse acquired — the breaker hums.", SICKLY)

-- ============ QUEST TRACKER (left edge, under meters) ============
local tracker = base("Frame", {
	Name = "QuestTracker",
	AnchorPoint = Vector2.new(0, 1),
	Position = UDim2.new(0, 12, 1, -14),
	Size = UDim2.new(0, 210, 0, 92),
	BackgroundColor3 = INK,
	BackgroundTransparency = 0.3,
}, gui)
corner(4, tracker)
stroke(DIRT, 1, tracker)

base("TextLabel", {
	Position = UDim2.new(0, 8, 0, 4),
	Size = UDim2.new(1, -16, 0, 16),
	BackgroundTransparency = 1,
	Font = Enum.Font.SpecialElite,
	Text = "ESCAPE THE MANSION",
	TextColor3 = BONE,
	TextSize = 12,
	TextXAlignment = Enum.TextXAlignment.Left,
}, tracker)

local steps = {
	"✓ Restore power to the stairwell",
	"✓ Collect the cellar key",
	"○ Find the flooded basement hatch",
	"○ Do not let it see you",
}
for i, s in ipairs(steps) do
	base("TextLabel", {
		Position = UDim2.new(0, 8, 0, 22 + (i - 1) * 17),
		Size = UDim2.new(1, -16, 0, 16),
		BackgroundTransparency = 1,
		Font = Enum.Font.SpecialElite,
		Text = s,
		TextColor3 = (s:sub(1, 1) == "✓") and Color3.fromRGB(120, 130, 110) or Color3.fromRGB(168, 158, 148),
		TextSize = 11,
		TextXAlignment = Enum.TextXAlignment.Left,
	}, tracker)
end