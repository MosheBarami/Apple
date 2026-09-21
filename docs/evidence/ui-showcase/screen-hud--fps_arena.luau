local Players = game:GetService("Players")
local StarterGui = game:GetService("StarterGui")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

-- Custom health meter: disable the core one in the same breath
StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Health, false)

local screenGui = Instance.new("ScreenGui")
screenGui.Name = "ArenaHud"
screenGui.ResetOnSpawn = false
screenGui.IgnoreGuiInset = true
screenGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
screenGui.Parent = playerGui

local function make(className, props, parent)
	local inst = Instance.new(className)
	for k, v in pairs(props) do
		inst[k] = v
	end
	inst.Parent = parent
	return inst
end

local function corner(parent, radius)
	return make("UICorner", { CornerRadius = UDim.new(0, radius) }, parent)
end

local function stroke(parent, thickness, color, transparency)
	return make("UIStroke", {
		Thickness = thickness,
		Color = color,
		Transparency = transparency or 0,
		ApplyStrokeMode = Enum.ApplyStrokeMode.Border,
	}, parent)
end

local INK = Color3.fromRGB(18, 20, 26)
local PANEL = Color3.fromRGB(28, 30, 38)
local TEXT = Color3.fromRGB(235, 238, 245)
local ACCENT = Color3.fromRGB(255, 176, 32)
local RED = Color3.fromRGB(232, 62, 62)
local GREEN = Color3.fromRGB(72, 200, 110)

-- ============ TOP-CENTRE BAND: score / killstreak readout ============
local scoreBar = make("Frame", {
	Name = "ScoreBar",
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 44),
	Size = UDim2.new(0, 0, 0, 46),
	AutomaticSize = Enum.AutomaticSize.X,
	BackgroundColor3 = PANEL,
	BackgroundTransparency = 0.15,
}, screenGui)
corner(scoreBar, 8)
stroke(scoreBar, 2, INK, 0.4)

make("UIListLayout", {
	FillDirection = Enum.FillDirection.Horizontal,
	Padding = UDim.new(0, 18),
	HorizontalAlignment = Enum.HorizontalAlignment.Center,
	VerticalAlignment = Enum.VerticalAlignment.Center,
	SortOrder = Enum.SortOrder.LayoutOrder,
}, scoreBar)
make("UIPadding", {
	PaddingLeft = UDim.new(0, 16),
	PaddingRight = UDim.new(0, 16),
}, scoreBar)

local function scoreCell(order, label, value, valueColor)
	local cell = make("Frame", {
		Name = label,
		LayoutOrder = order,
		Size = UDim2.new(0, 0, 0, 30),
		AutomaticSize = Enum.AutomaticSize.X,
		BackgroundColor3 = PANEL,
		BackgroundTransparency = 1,
	}, scoreBar)
	make("UIListLayout", {
		FillDirection = Enum.FillDirection.Horizontal,
		Padding = UDim.new(0, 6),
		VerticalAlignment = Enum.VerticalAlignment.Center,
	}, cell)
	make("TextLabel", {
		Name = "Key",
		BackgroundTransparency = 1,
		Font = Enum.Font.GothamBold,
		Text = label,
		TextColor3 = Color3.fromRGB(150, 155, 168),
		TextSize = 14,
		Size = UDim2.new(0, 0, 1, 0),
		AutomaticSize = Enum.AutomaticSize.X,
	}, cell)
	make("TextLabel", {
		Name = "Val",
		BackgroundTransparency = 1,
		Font = Enum.Font.GothamBlack,
		Text = value,
		TextColor3 = valueColor,
		TextSize = 20,
		Size = UDim2.new(0, 0, 1, 0),
		AutomaticSize = Enum.AutomaticSize.X,
	}, cell)
	return cell
end

scoreCell(1, "KILLS", "12", TEXT)
scoreCell(2, "DEATHS", "4", Color3.fromRGB(200, 205, 215))
scoreCell(3, "STREAK", "x5", ACCENT)
scoreCell(4, "CREDITS", "1,250", GREEN)

-- ============ LEFT EDGE: health meter (below top bar) ============
local healthFrame = make("Frame", {
	Name = "HealthMeter",
	Position = UDim2.new(0, 16, 0, 120),
	Size = UDim2.new(0, 240, 0, 54),
	BackgroundColor3 = PANEL,
	BackgroundTransparency = 0.15,
}, screenGui)
corner(healthFrame, 8)
stroke(healthFrame, 2, INK, 0.4)

make("TextLabel", {
	Name = "HealthLabel",
	BackgroundTransparency = 1,
	Position = UDim2.new(0, 10, 0, 6),
	Size = UDim2.new(1, -20, 0, 16),
	Font = Enum.Font.GothamBold,
	Text = "HEALTH",
	TextColor3 = Color3.fromRGB(150, 155, 168),
	TextSize = 12,
	TextXAlignment = Enum.TextXAlignment.Left,
}, healthFrame)

make("TextLabel", {
	Name = "HealthValue",
	BackgroundTransparency = 1,
	Position = UDim2.new(0, 10, 0, 6),
	Size = UDim2.new(1, -20, 0, 16),
	Font = Enum.Font.GothamBlack,
	Text = "84 / 100",
	TextColor3 = TEXT,
	TextSize = 12,
	TextXAlignment = Enum.TextXAlignment.Right,
}, healthFrame)

local healthTrack = make("Frame", {
	Name = "Track",
	Position = UDim2.new(0, 10, 0, 28),
	Size = UDim2.new(1, -20, 0, 14),
	BackgroundColor3 = Color3.fromRGB(50, 52, 62),
}, healthFrame)
corner(healthTrack, 7)

local healthFill = make("Frame", {
	Name = "Fill",
	Size = UDim2.new(0.84, 0, 1, 0),
	BackgroundColor3 = GREEN,
}, healthTrack)
corner(healthFill, 7)

-- ============ LEFT EDGE: quest tracker under health ============
local questFrame = make("Frame", {
	Name = "QuestTracker",
	Position = UDim2.new(0, 16, 0, 186),
	Size = UDim2.new(0, 240, 0, 74),
	BackgroundColor3 = PANEL,
	BackgroundTransparency = 0.25,
}, screenGui)
corner(questFrame, 8)
stroke(questFrame, 2, INK, 0.5)

make("TextLabel", {
	BackgroundTransparency = 1,
	Position = UDim2.new(0, 10, 0, 6),
	Size = UDim2.new(1, -20, 0, 16),
	Font = Enum.Font.GothamBold,
	Text = "CONTRACT: FIRST BLOOD",
	TextColor3 = ACCENT,
	TextSize = 12,
	TextXAlignment = Enum.TextXAlignment.Left,
}, questFrame)

make("TextLabel", {
	BackgroundTransparency = 1,
	Position = UDim2.new(0, 10, 0, 26),
	Size = UDim2.new(1, -20, 0, 18),
	Font = Enum.Font.Gotham,
	Text = "Eliminate 10 opponents in the Foundry arena",
	TextColor3 = TEXT,
	TextSize = 13,
	TextXAlignment = Enum.TextXAlignment.Left,
	TextWrapped = true,
}, questFrame)

local questTrack = make("Frame", {
	Position = UDim2.new(0, 10, 1, -16),
	Size = UDim2.new(1, -20, 0, 8),
	BackgroundColor3 = Color3.fromRGB(50, 52, 62),
}, questFrame)
corner(questTrack, 4)
make("Frame", {
	Size = UDim2.new(0.6, 0, 1, 0),
	BackgroundColor3 = ACCENT,
}, questTrack)
	:FindFirstChildOfClass("UICorner") or corner(questTrack:FindFirstChildOfClass("Frame") or questTrack, 4)

-- ============ MID-RIGHT: minimap ============
local minimap = make("Frame", {
	Name = "Minimap",
	AnchorPoint = Vector2.new(1, 0.5),
	Position = UDim2.new(1, -16, 0.5, 0),
	Size = UDim2.new(0, 150, 0, 150),
	BackgroundColor3 = Color3.fromRGB(34, 38, 48),
}, screenGui)
corner(minimap, 10)
stroke(minimap, 2, INK, 0.4)

make("UIGridLayout", {
	CellSize = UDim2.new(0.25, 0, 0.25, 0),
	CellPadding = UDim2.new(0, 0, 0, 0),
	SortOrder = Enum.SortOrder.LayoutOrder,
}, minimap)

-- blocky arena map tiles
local tiles = {
	{1, 1, 1, 0}, {1, 0, 1, 1}, {1, 1, 0, 1}, {0, 1, 1, 1},
	{1, 0, 1, 0}, {0, 1, 0, 1}, {1, 0, 1, 0}, {1, 1, 1, 1},
	{1, 1, 0, 1}, {0, 1, 1, 0}, {1, 0, 1, 1}, {1, 1, 1, 0},
	{1, 0, 1, 1}, {1, 1, 1, 0}, {0, 1, 1, 1}, {1, 1, 0, 1},
}
for i, on in ipairs(tiles) do
	local t = make("Frame", {
		LayoutOrder = i,
		BackgroundColor3 = on == 1 and Color3.fromRGB(64, 70, 84) or Color3.fromRGB(44, 48, 58),
		BackgroundTransparency = 0.1,
		BorderSizePixel = 0,
	}, minimap)
	corner(t, 3)
end

-- player dot on minimap
local dot = make("Frame", {
	Name = "PlayerDot",
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.new(0.62, 0, 0.4, 0),
	Size = UDim2.new(0, 10, 0, 10),
	BackgroundColor3 = ACCENT,
	ZIndex = 3,
}, minimap)
corner(dot, 5)
stroke(dot, 2, INK)

make("TextLabel", {
	BackgroundTransparency = 1,
	AnchorPoint = Vector2.new(0.5, 1),
	Position = UDim2.new(0.5, 0, 1, -4),
	Size = UDim2.new(1, -8, 0, 14),
	Font = Enum.Font.GothamBold,
	Text = "FOUNDRY",
	TextColor3 = Color3.fromRGB(150, 155, 168),
	TextSize = 11,
	ZIndex = 3,
}, minimap)

-- ============ BOTTOM-CENTRE: ammo + weapon rail ============
local ammoFrame = make("Frame", {
	Name = "AmmoPanel",
	AnchorPoint = Vector2.new(0.5, 1),
	Position = UDim2.new(0.5, 0, 1, -16),
	Size = UDim2.new(0, 300, 0, 64),
	BackgroundColor3 = PANEL,
	BackgroundTransparency = 0.15,
}, screenGui)
corner(ammoFrame, 10)
stroke(ammoFrame, 2, INK, 0.4)

make("TextLabel", {
	Name = "WeaponName",
	BackgroundTransparency = 1,
	Position = UDim2.new(0, 14, 0, 8),
	Size = UDim2.new(1, -28, 0, 16),
	Font = Enum.Font.GothamBold,
	Text = "VK-7 PULSE RIFLE",
	TextColor3 = Color3.fromRGB(150, 155, 168),
	TextSize = 12,
	TextXAlignment = Enum.TextXAlignment.Left,
}, ammoFrame)

make("TextLabel", {
	Name = "AmmoCount",
	BackgroundTransparency = 1,
	Position = UDim2.new(0, 14, 0, 24),
	Size = UDim2.new(0, 140, 0, 30),
	Font = Enum.Font.GothamBlack,
	Text = "24 / 90",
	TextColor3 = TEXT,
	TextSize = 26,
	TextXAlignment = Enum.TextXAlignment.Left,
}, ammoFrame)

make("TextLabel", {
	Name = "ReloadHint",
	BackgroundTransparency = 1,
	AnchorPoint = Vector2.new(1, 0.5),
	Position = UDim2.new(1, -14, 0.5, 0),
	Size = UDim2.new(0, 110, 0, 20),
	Font = Enum.Font.GothamBold,
	Text = "[R] RELOAD",
	TextColor3 = ACCENT,
	TextSize = 14,
	TextXAlignment = Enum.TextXAlignment.Right,
}, ammoFrame)

-- ============ BOTTOM-CENTRE: hotbar (custom, core Backpack stays off) ============
StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Backpack, false)

local hotbar = make("Frame", {
	Name = "Hotbar",
	AnchorPoint = Vector2.new(0.5, 1),
	Position = UDim2.new(0.5, 0, 1, -92),
	Size = UDim2.new(0, 0, 0, 52),
	AutomaticSize = Enum.AutomaticSize.X,
	BackgroundTransparency = 1,
}, screenGui)
make("UIListLayout", {
	FillDirection = Enum.FillDirection.Horizontal,
	Padding = UDim.new(0, 8),
	SortOrder = Enum.SortOrder.LayoutOrder,
}, hotbar)

local slots = {
	{ key = "1", name = "VK-7 RIFLE", selected = true },
	{ key = "2", name = "M6 SIDEARM", selected = false },
	{ key = "3", name = "FRAG x2", selected = false },
	{ key = "4", name = "MEDKIT", selected = false },
}
for i, slot in ipairs(slots) do
	local f = make("Frame", {
		Name = "Slot" .. slot.key,
		LayoutOrder = i,
		Size = UDim2.new(0, 96, 1, 0),
		BackgroundColor3 = slot.selected and Color3.fromRGB(52, 56, 68) or PANEL,
		BackgroundTransparency = slot.selected and 0 or 0.25,
	}, hotbar)
	corner(f, 8)
	stroke(f, slot.selected and 2 or 1, slot.selected and ACCENT or INK, slot.selected and 0 or 0.5)
	make("TextLabel", {
		BackgroundTransparency = 1,
		Position = UDim2.new(0, 8, 0, 6),
		Size = UDim2.new(1, -16, 0, 14),
		Font = Enum.Font.GothamBlack,
		Text = slot.key,
		TextColor3 = slot.selected and ACCENT or Color3.fromRGB(120, 125, 138),
		TextSize = 12,
		TextXAlignment = Enum.TextXAlignment.Left,
	}, f)
	make("TextLabel", {
		BackgroundTransparency = 1,
		Position = UDim2.new(0, 8, 0, 24),
		Size = UDim2.new(1, -16, 0, 20),
		Font = Enum.Font.GothamBold,
		Text = slot.name,
		TextColor3 = slot.selected and TEXT or Color3.fromRGB(160, 165, 178),
		TextSize = 11,
		TextXAlignment = Enum.TextXAlignment.Left,
	}, f)
end

-- ============ CENTRE: reticle + hit marker ============
local reticle = make("Frame", {
	Name = "Reticle",
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.new(0.5, 0, 0.5, 0),
	Size = UDim2.new(0, 6, 0, 6),
	BackgroundColor3 = TEXT,
	BackgroundTransparency = 0.2,
	ZIndex = 5,
}, screenGui)
corner(reticle, 3)

local hitMarker = make("Frame", {
	Name = "HitMarker",
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.new(0.5, 0, 0.5, 0),
	Size = UDim2.new(0, 22, 0, 22),
	BackgroundTransparency = 1,
	ZIndex = 4,
}, screenGui)
make("ImageLabel", {
	BackgroundTransparency = 1,
	Size = UDim2.new(1, 0, 1, 0),
	Image = "rbxasset://textures/ui/common/robux.png",
	ImageTransparency = 1, -- placeholder kept invisible; cross drawn below
}, hitMarker)
-- draw the X with four thin rotated bars
for i = 0, 3 do
	local bar = make("Frame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(0.5, 0, 0.5, 0),
		Size = UDim2.new(0, 3, 0, 22),
		BackgroundColor3 = RED,
		Rotation = 45 + i * 90,
		ZIndex = 4,
	}, hitMarker)
	-- offset each bar outward from centre
	local off = Instance.new("UIOffset")
	local pad = make("UIPadding", {}, bar)
	pad.PaddingTop = UDim.new(0, 0)
	bar.Position = UDim2.new(0.5, (i < 2) and -8 or 8, 0.5, (i % 2 == 0) and -8 or 8)
end

-- ============ TOAST (top-centre, under score bar) ============
local toast = make("Frame", {
	Name = "Toast",
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 100),
	Size = UDim2.new(0, 0, 0, 36),
	AutomaticSize = Enum.AutomaticSize.X,
	BackgroundColor3 = Color3.fromRGB(40, 44, 54),
	BackgroundTransparency = 0.1,
	ZIndex = 6,
}, screenGui)
corner(toast, 8)
stroke(toast, 2, ACCENT, 0.2)
make("UIPadding", {
	PaddingLeft = UDim.new(0, 14),
	PaddingRight = UDim.new(0, 14),
}, toast)
make("TextLabel", {
	BackgroundTransparency = 1,
	Size = UDim2.new(0, 0, 1, 0),
	AutomaticSize = Enum.AutomaticSize.X,
	Font = Enum.Font.GothamBold,
	Text = "DOUBLE KILL! +150 credits",
	TextColor3 = ACCENT,
	TextSize = 15,
}, toast)