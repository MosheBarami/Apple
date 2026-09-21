-- Simulator HUD — LocalScript
local Players = game:GetService("Players")
local StarterGui = game:GetService("StarterGui")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

-- Custom health meter replaces the core one (invisible until damage otherwise)
pcall(function()
	StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Health, false)
end)

local screenGui = Instance.new("ScreenGui")
screenGui.Name = "SimulatorHUD"
screenGui.ResetOnSpawn = false
screenGui.IgnoreGuiInset = true
screenGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
screenGui.Parent = playerGui

local function base(props, parent)
	local inst = Instance.new(props.Class or "Frame")
	for k, v in pairs(props) do
		if k ~= "Class" then inst[k] = v end
	end
	inst.Parent = parent
	return inst
end

local function corner(parent, radius)
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0, radius)
	c.Parent = parent
	return c
end

local function stroke(parent, px, color)
	local s = Instance.new("UIStroke")
	s.Thickness = px
	s.Color = color
	s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	s.Parent = parent
	return s
end

local function label(props, parent)
	props.Class = "TextLabel"
	props.BackgroundTransparency = props.BackgroundTransparency or 1
	props.Font = props.Font or Enum.Font.GothamBold
	props.TextColor3 = props.TextColor3 or Color3.fromRGB(255, 255, 255)
	props.TextSize = props.TextSize or 16
	return base(props, parent)
end

-- Palette
local COL_PANEL = Color3.fromRGB(38, 40, 52)
local COL_PANEL_LIGHT = Color3.fromRGB(56, 59, 74)
local COL_GOLD = Color3.fromRGB(255, 196, 56)
local COL_GEM = Color3.fromRGB(96, 200, 255)
local COL_GREEN = Color3.fromRGB(96, 220, 120)
local COL_RED = Color3.fromRGB(235, 80, 80)
local COL_WHITE = Color3.fromRGB(255, 255, 255)
local COL_TEXT_DIM = Color3.fromRGB(200, 202, 214)

-- ============ TOP-CENTRE: currency pills ============
local currencyBar = base({
	Name = "CurrencyBar",
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 44),
	Size = UDim2.new(0, 0, 0, 44),
	AutomaticSize = Enum.AutomaticSize.X,
	BackgroundColor3 = COL_PANEL,
	BackgroundTransparency = 0.15,
}, screenGui)
corner(currencyBar, 12)
stroke(currencyBar, 2, Color3.fromRGB(20, 21, 28))
base({ Class = "UIPadding", PaddingLeft = UDim.new(0, 10), PaddingRight = UDim.new(0, 10) }, currencyBar)
base({ Class = "UIListLayout", FillDirection = Enum.FillDirection.Horizontal,
	Padding = UDim.new(0, 10), VerticalAlignment = Enum.VerticalAlignment.Center,
	SortOrder = Enum.SortOrder.LayoutOrder }, currencyBar)

local function currencyPill(order, iconText, iconColor, amountText, amountColor)
	local pill = base({
		Name = "Pill",
		LayoutOrder = order,
		Size = UDim2.new(0, 0, 0, 32),
		AutomaticSize = Enum.AutomaticSize.X,
		BackgroundColor3 = COL_PANEL_LIGHT,
	}, currencyBar)
	corner(pill, 10)
	base({ Class = "UIPadding", PaddingLeft = UDim.new(0, 8), PaddingRight = UDim.new(0, 12) }, pill)
	label({
		Name = "Icon", Size = UDim2.new(0, 22, 1, 0), Text = iconText,
		TextColor3 = iconColor, TextSize = 18,
	}, pill)
	label({
		Name = "Amount", Size = UDim2.new(0, 0, 1, 0), AutomaticSize = Enum.AutomaticSize.X,
		Text = amountText, TextColor3 = amountColor, TextSize = 16,
	}, pill)
	return pill
end

currencyPill(1, "★", COL_GOLD, "12,480", COL_GOLD)      -- Coins
currencyPill(2, "◆", COL_GEM, "326", COL_GEM)           -- Gems
currencyPill(3, "⚡", COL_GREEN, "x2.5", COL_GREEN)      -- Boost

-- ============ LEFT EDGE below top bar: quest tracker ============
local questTracker = base({
	Name = "QuestTracker",
	AnchorPoint = Vector2.new(0, 0),
	Position = UDim2.new(0, 12, 0, 100),
	Size = UDim2.new(0, 230, 0, 0),
	AutomaticSize = Enum.AutomaticSize.Y,
	BackgroundColor3 = COL_PANEL,
	BackgroundTransparency = 0.15,
}, screenGui)
corner(questTracker, 12)
stroke(questTracker, 2, Color3.fromRGB(20, 21, 28))
base({ Class = "UIPadding",
	PaddingTop = UDim.new(0, 10), PaddingBottom = UDim.new(0, 10),
	PaddingLeft = UDim.new(0, 12), PaddingRight = UDim.new(0, 12) }, questTracker)
base({ Class = "UIListLayout", Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder }, questTracker)

label({
	Name = "Title", LayoutOrder = 1, Size = UDim2.new(1, 0, 0, 20),
	Text = "DAILY QUESTS", TextXAlignment = Enum.TextXAlignment.Left,
	TextColor3 = COL_GOLD, TextSize = 14,
}, questTracker)

local function questRow(order, name, progressText, pct)
	local row = base({
		Name = "Quest", LayoutOrder = order, Size = UDim2.new(1, 0, 0, 40),
		BackgroundColor3 = COL_PANEL_LIGHT,
	}, questTracker)
	corner(row, 8)
	label({
		Name = "Name", Position = UDim2.new(0, 8, 0, 3), Size = UDim2.new(1, -16, 0, 16),
		Text = name, TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = COL_WHITE, TextSize = 13,
	}, row)
	label({
		Name = "Count", Position = UDim2.new(0, 8, 0, 19), Size = UDim2.new(1, -16, 0, 14),
		Text = progressText, TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = COL_TEXT_DIM, TextSize = 12,
	}, row)
	local barBg = base({
		Name = "BarBg", Position = UDim2.new(0, 8, 1, -8), Size = UDim2.new(1, -16, 0, 5),
		BackgroundColor3 = Color3.fromRGB(24, 25, 33),
	}, row)
	corner(barBg, 3)
	local barFill = base({
		Name = "BarFill", Size = UDim2.new(pct, 0, 1, 0),
		BackgroundColor3 = COL_GREEN,
	}, barBg)
	corner(barFill, 3)
end

questRow(2, "Collect 500 Coins", "312 / 500", 0.62)
questRow(3, "Hatch 10 Eggs", "4 / 10", 0.4)
questRow(4, "Win 3 Races", "3 / 3", 1)

-- ============ MID-RIGHT: side button stack (shop, pets, codes, rebirth) ============
local sideRail = base({
	Name = "SideRail",
	AnchorPoint = Vector2.new(1, 0.5),
	Position = UDim2.new(1, -12, 0.5, 0),
	Size = UDim2.new(0, 64, 0, 0),
	AutomaticSize = Enum.AutomaticSize.Y,
	BackgroundTransparency = 1,
}, screenGui)
base({ Class = "UIListLayout", Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder,
	HorizontalAlignment = Enum.HorizontalAlignment.Right }, sideRail)

local function railButton(order, name, glyph, glyphColor, caption)
	local btn = base({
		Name = name, LayoutOrder = order, Size = UDim2.new(0, 64, 0, 64),
		BackgroundColor3 = COL_PANEL, BackgroundTransparency = 0.1,
	}, sideRail)
	corner(btn, 14)
	stroke(btn, 2, Color3.fromRGB(20, 21, 28))
	label({
		Name = "Glyph", Position = UDim2.new(0, 0, 0, 6), Size = UDim2.new(1, 0, 0, 30),
		Text = glyph, TextColor3 = glyphColor, TextSize = 24,
	}, btn)
	label({
		Name = "Caption", Position = UDim2.new(0, 0, 0, 38), Size = UDim2.new(1, 0, 0, 16),
		Text = caption, TextColor3 = COL_TEXT_DIM, TextSize = 11,
	}, btn)
	return btn
end

railButton(1, "ShopButton", "🛒", COL_GOLD, "SHOP")
railButton(2, "PetsButton", "🐾", COL_GEM, "PETS")
railButton(3, "CodesButton", "🎁", COL_GREEN, "CODES")
railButton(4, "RebirthButton", "♻", Color3.fromRGB(200, 120, 255), "REBIRTH")

-- ============ BOTTOM-CENTRE: action rail ============
local actionRail = base({
	Name = "ActionRail",
	AnchorPoint = Vector2.new(0.5, 1),
	Position = UDim2.new(0.5, 0, 1, -12),
	Size = UDim2.new(0, 0, 0, 52),
	AutomaticSize = Enum.AutomaticSize.X,
	BackgroundTransparency = 1,
}, screenGui)
base({ Class = "UIListLayout", FillDirection = Enum.FillDirection.Horizontal,
	Padding = UDim.new(0, 10), SortOrder = Enum.SortOrder.LayoutOrder }, actionRail)

local function actionButton(order, name, text, color)
	local btn = base({
		Name = name, LayoutOrder = order, Size = UDim2.new(0, 150, 0, 52),
		BackgroundColor3 = color,
	}, actionRail)
	corner(btn, 12)
	stroke(btn, 2, Color3.fromRGB(20, 21, 28))
	label({
		Name = "Text", Size = UDim2.new(1, 0, 1, 0),
		Text = text, TextColor3 = COL_WHITE, TextSize = 16,
	}, btn)
	return btn
end

actionButton(1, "CollectButton", "COLLECT ZONE", COL_GOLD)
actionButton(2, "EggsButton", "HATCH EGG — 250★", COL_GEM)
actionButton(3, "InventoryButton", "BACKPACK", COL_PANEL_LIGHT)

-- ============ Custom health meter (core Health disabled above) ============
local healthMeter = base({
	Name = "HealthMeter",
	AnchorPoint = Vector2.new(0, 1),
	Position = UDim2.new(0, 12, 1, -12),
	Size = UDim2.new(0, 220, 0, 26),
	BackgroundColor3 = Color3.fromRGB(24, 25, 33),
	BackgroundTransparency = 0.15,
}, screenGui)
corner(healthMeter, 8)
stroke(healthMeter, 2, Color3.fromRGB(20, 21, 28))
local healthFill = base({
	Name = "Fill", Position = UDim2.new(0, 3, 0, 3), Size = UDim2.new(1, -6, 1, -6),
	BackgroundColor3 = COL_GREEN,
}, healthMeter)
corner(healthFill, 6)
label({
	Name = "Text", Size = UDim2.new(1, 0, 1, 0),
	Text = "HP 100 / 100", TextColor3 = COL_WHITE, TextSize = 13,
}, healthMeter)

-- ============ Minimap (top-right, below player-list footprint) ============
local minimap = base({
	Name = "Minimap",
	AnchorPoint = Vector2.new(1, 0),
	Position = UDim2.new(1, -12, 0, 44),
	Size = UDim2.new(0, 140, 0, 140),
	BackgroundColor3 = Color3.fromRGB(30, 44, 34),
	BackgroundTransparency = 0.1,
}, screenGui)
corner(minimap, 12)
stroke(minimap, 2, Color3.fromRGB(20, 21, 28))
label({
	Name = "ZoneName", Position = UDim2.new(0, 0, 1, -22), Size = UDim2.new(1, 0, 0, 18),
	Text = "Volcano Zone", TextColor3 = COL_WHITE, TextSize = 12,
	BackgroundColor3 = COL_PANEL, BackgroundTransparency = 0.2,
}, minimap)
local mapDot = base({
	Name = "PlayerDot", AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.new(0.62, 0, 0.4, 0), Size = UDim2.new(0, 10, 0, 10),
	BackgroundColor3 = COL_WHITE,
}, minimap)
corner(mapDot, 5)

-- ============ Toast stack (top-centre, under currency bar) ============
local toastStack = base({
	Name = "ToastStack",
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 96),
	Size = UDim2.new(0, 300, 0, 0),
	AutomaticSize = Enum.AutomaticSize.Y,
	BackgroundTransparency = 1,
}, screenGui)
base({ Class = "UIListLayout", Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder,
	HorizontalAlignment = Enum.HorizontalAlignment.Center }, toastStack)

local function toast(order, text, color)
	local t = base({
		Name = "Toast", LayoutOrder = order, Size = UDim2.new(1, 0, 0, 34),
		BackgroundColor3 = COL_PANEL, BackgroundTransparency = 0.1,
	}, toastStack)
	corner(t, 10)
	stroke(t, 2, Color3.fromRGB(20, 21, 28))
	label({
		Name = "Text", Size = UDim2.new(1, -12, 1, 0), Position = UDim2.new(0, 6, 0, 0),
		Text = text, TextColor3 = color, TextSize = 14,
	}, t)
	return t
end

toast(1, "+1,250 Coins — Coin Magnet active!", COL_GOLD)
toast(2, "New pet hatched: Golden Dragon (Legendary)", COL_GEM)