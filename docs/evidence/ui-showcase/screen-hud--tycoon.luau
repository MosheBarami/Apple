-- Tycoon HUD
local Players = game:GetService("Players")
local StarterGui = game:GetService("StarterGui")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

-- Custom health meter replaces the core one
pcall(function()
	StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Health, false)
end)

local gui = Instance.new("ScreenGui")
gui.Name = "TycoonHud"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = false
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
gui.Parent = playerGui

local function corner(parent, radius)
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0, radius)
	c.Parent = parent
	return c
end

local function stroke(parent, thickness, color, transparency)
	local s = Instance.new("UIStroke")
	s.Thickness = thickness
	s.Color = color
	s.Transparency = transparency or 0
	s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	s.Parent = parent
	return s
end

local function label(parent, text, size, pos, textSize, color, align)
	local t = Instance.new("TextLabel")
	t.BackgroundTransparency = 1
	t.Size = size
	t.Position = pos
	t.Font = Enum.Font.GothamBold
	t.Text = text
	t.TextSize = textSize
	t.TextColor3 = color
	t.TextXAlignment = align or Enum.TextXAlignment.Left
	t.Parent = parent
	return t
end

-- ============ TOP-CENTRE: currency pill ============
local cashPill = Instance.new("Frame")
cashPill.Name = "CashPill"
cashPill.AnchorPoint = Vector2.new(0.5, 0)
cashPill.Position = UDim2.new(0.5, 0, 0, 44) -- below 36px top bar
cashPill.Size = UDim2.new(0, 0, 0, 44)
cashPill.AutomaticSize = Enum.AutomaticSize.X
cashPill.BackgroundColor3 = Color3.fromRGB(28, 30, 38)
cashPill.BackgroundTransparency = 0.15
cashPill.Parent = gui
corner(cashPill, 22)
stroke(cashPill, 2, Color3.fromRGB(255, 196, 60), 0.3)

local cashIcon = Instance.new("TextLabel")
cashIcon.BackgroundTransparency = 1
cashIcon.Size = UDim2.new(0, 34, 1, 0)
cashIcon.Font = Enum.Font.GothamBold
cashIcon.Text = "$"
cashIcon.TextSize = 24
cashIcon.TextColor3 = Color3.fromRGB(255, 196, 60)
cashIcon.Parent = cashPill

local cashPad = Instance.new("UIPadding")
cashPad.PaddingLeft = UDim.new(0, 14)
cashPad.PaddingRight = UDim.new(0, 18)
cashPad.Parent = cashPill

label(cashPill, "12,450", UDim2.new(0, 0, 1, 0), UDim2.new(0, 0, 0, 0), 22, Color3.fromRGB(255, 255, 255))

-- ============ LEFT EDGE below top bar: quest tracker ============
local questPanel = Instance.new("Frame")
questPanel.Name = "QuestTracker"
questPanel.AnchorPoint = Vector2.new(0, 0)
questPanel.Position = UDim2.new(0, 12, 0, 0.12)
questPanel.Size = UDim2.new(0.22, 0, 0, 150)
questPanel.BackgroundColor3 = Color3.fromRGB(24, 26, 34)
questPanel.BackgroundTransparency = 0.2
questPanel.Parent = gui
corner(questPanel, 10)
stroke(questPanel, 2, Color3.fromRGB(120, 200, 255), 0.4)

label(questPanel, "DAILY CONTRACTS", UDim2.new(1, -20, 0, 26), UDim2.new(0, 12, 0, 8), 13, Color3.fromRGB(120, 200, 255))

local questList = Instance.new("Frame")
questList.Name = "QuestList"
questList.BackgroundTransparency = 1
questList.Position = UDim2.new(0, 0, 0, 38)
questList.Size = UDim2.new(1, 0, 1, -46)
questList.Parent = questPanel

local questLayout = Instance.new("UIListLayout")
questLayout.Padding = UDim.new(0, 8)
questLayout.FillDirection = Enum.FillDirection.Vertical
questLayout.SortOrder = Enum.SortOrder.LayoutOrder
questLayout.Parent = questList

local quests = {
	{ "Collect 500 from the Diner", "320 / 500", 0.64 },
	{ "Hire 3 Staff Members", "2 / 3", 0.67 },
	{ "Upgrade Pizza Oven to Lv.2", "Done", 1.0 },
}
for i, q in ipairs(quests) do
	local row = Instance.new("Frame")
	row.Name = "Quest" .. i
	row.BackgroundTransparency = 1
	row.Size = UDim2.new(1, -20, 0, 30)
	row.Parent = questList
	row.LayoutOrder = i

	label(row, q[1], UDim2.new(1, 0, 0, 14), UDim2.new(0, 0, 0, 0), 12, Color3.fromRGB(235, 235, 240))

	local barBg = Instance.new("Frame")
	barBg.Name = "BarBg"
	barBg.Position = UDim2.new(0, 0, 0, 18)
	barBg.Size = UDim2.new(1, 0, 0, 6)
	barBg.BackgroundColor3 = Color3.fromRGB(50, 54, 66)
	barBg.BorderSizePixel = 0
	barBg.Parent = row
	corner(barBg, 3)

	local barFill = Instance.new("Frame")
	barFill.Name = "BarFill"
	barFill.Size = UDim2.new(q[3], 0, 1, 0)
	barFill.BackgroundColor3 = q[3] >= 1 and Color3.fromRGB(90, 220, 120) or Color3.fromRGB(255, 196, 60)
	barFill.BorderSizePixel = 0
	barFill.Parent = barBg
	corner(barFill, 3)

	label(row, q[2], UDim2.new(1, 0, 0, 12), UDim2.new(0, 0, 0, 0), 10, Color3.fromRGB(160, 165, 180), Enum.TextXAlignment.Right)
end

-- ============ MID-RIGHT: minimap ============
local minimap = Instance.new("Frame")
minimap.Name = "Minimap"
minimap.AnchorPoint = Vector2.new(1, 0.5)
minimap.Position = UDim2.new(1, -12, 0.5, 0)
minimap.Size = UDim2.new(0.16, 0, 0.16, 0)
minimap.BackgroundColor3 = Color3.fromRGB(30, 34, 44)
minimap.BackgroundTransparency = 0.1
minimap.Parent = gui
corner(minimap, 12)
stroke(minimap, 2, Color3.fromRGB(120, 200, 255), 0.4)

local mapInner = Instance.new("Frame")
mapInner.Name = "MapInner"
mapInner.Position = UDim2.new(0, 8, 0, 8)
mapInner.Size = UDim2.new(1, -16, 1, -16)
mapInner.BackgroundColor3 = Color3.fromRGB(46, 62, 50)
mapInner.BorderSizePixel = 0
mapInner.Parent = minimap
corner(mapInner, 8)

-- central park blob + radiating blocks, echoing the radial city layout
local park = Instance.new("Frame")
park.Name = "Park"
park.AnchorPoint = Vector2.new(0.5, 0.5)
park.Position = UDim2.new(0.5, 0, 0.5, 0)
park.Size = UDim2.new(0.3, 0, 0.3, 0)
park.BackgroundColor3 = Color3.fromRGB(90, 170, 90)
park.BorderSizePixel = 0
park.Parent = mapInner
corner(park, 20)

local blocks = {
	{ 0.15, 0.15, Color3.fromRGB(200, 150, 90) },
	{ 0.75, 0.15, Color3.fromRGB(200, 150, 90) },
	{ 0.15, 0.75, Color3.fromRGB(150, 150, 200) },
	{ 0.75, 0.75, Color3.fromRGB(200, 120, 120) },
}
for i, b in ipairs(blocks) do
	local blk = Instance.new("Frame")
	blk.AnchorPoint = Vector2.new(0.5, 0.5)
	blk.Position = UDim2.new(b[1], 0, b[2], 0)
	blk.Size = UDim2.new(0.18, 0, 0.18, 0)
	blk.BackgroundColor3 = b[3]
	blk.BorderSizePixel = 0
	blk.Parent = mapInner
	corner(blk, 4)
end

label(minimap, "PIER DISTRICT", UDim2.new(1, 0, 0, 16), UDim2.new(0, 0, 0, -20), 11, Color3.fromRGB(200, 210, 225), Enum.TextXAlignment.Center)

-- ============ BOTTOM-CENTRE: button rail ============
local rail = Instance.new("Frame")
rail.Name = "ButtonRail"
rail.AnchorPoint = Vector2.new(0.5, 1)
rail.Position = UDim2.new(0.5, 0, 1, -14)
rail.Size = UDim2.new(0, 0, 0, 56)
rail.AutomaticSize = Enum.AutomaticSize.X
rail.BackgroundColor3 = Color3.fromRGB(28, 30, 38)
rail.BackgroundTransparency = 0.15
rail.Parent = gui
corner(rail, 14)
stroke(rail, 2, Color3.fromRGB(255, 255, 255), 0.75)

local railPad = Instance.new("UIPadding")
railPad.PaddingLeft = UDim.new(0, 10)
railPad.PaddingRight = UDim.new(0, 10)
railPad.PaddingTop = UDim.new(0, 8)
railPad.PaddingBottom = UDim.new(0, 8)
railPad.Parent = rail

local railLayout = Instance.new("UIListLayout")
railLayout.FillDirection = Enum.FillDirection.Horizontal
railLayout.Padding = UDim.new(0, 10)
railLayout.SortOrder = Enum.SortOrder.LayoutOrder
railLayout.Parent = rail

local buttons = {
	{ "UPGRADES", Color3.fromRGB(90, 160, 255) },
	{ "STAFF", Color3.fromRGB(90, 220, 120) },
	{ "SHOP", Color3.fromRGB(255, 196, 60) },
	{ "REBIRTH", Color3.fromRGB(230, 90, 120) },
}
for i, b in ipairs(buttons) do
	local btn = Instance.new("TextButton")
	btn.Name = "Btn" .. b[1]
	btn.Size = UDim2.new(0, 110, 1, 0)
	btn.BackgroundColor3 = b[2]
	btn.BackgroundTransparency = 0.25
	btn.Font = Enum.Font.GothamBold
	btn.Text = b[1]
	btn.TextSize = 15
	btn.TextColor3 = Color3.fromRGB(255, 255, 255)
	btn.AutoButtonColor = true
	btn.LayoutOrder = i
	btn.Parent = rail
	corner(btn, 10)
	stroke(btn, 1, b[2], 0.2)
end

-- ============ Toasts (top-centre, under cash pill) ============
local toastHolder = Instance.new("Frame")
toastHolder.Name = "Toasts"
toastHolder.AnchorPoint = Vector2.new(0.5, 0)
toastHolder.Position = UDim2.new(0.5, 0, 0, 100)
toastHolder.Size = UDim2.new(0.3, 0, 0, 0)
toastHolder.AutomaticSize = Enum.AutomaticSize.Y
toastHolder.BackgroundTransparency = 1
toastHolder.Parent = gui

local toastLayout = Instance.new("UIListLayout")
toastLayout.Padding = UDim.new(0, 6)
toastLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
toastLayout.SortOrder = Enum.SortOrder.LayoutOrder
toastLayout.Parent = toastHolder

local function makeToast(text, color)
	local toast = Instance.new("Frame")
	toast.Name = "Toast"
	toast.Size = UDim2.new(1, 0, 0, 34)
	toast.BackgroundColor3 = Color3.fromRGB(28, 30, 38)
	toast.BackgroundTransparency = 0.1
	toast.LayoutOrder = #toastHolder:GetChildren()
	toast.Parent = toastHolder
	corner(toast, 8)
	stroke(toast, 1, color, 0.2)

	local pad = Instance.new("UIPadding")
	pad.PaddingLeft = UDim.new(0, 12)
	pad.PaddingRight = UDim.new(0, 12)
	pad.Parent = toast

	label(toast, text, UDim2.new(1, 0, 1, 0), UDim2.new(0, 0, 0, 0), 13, color, Enum.TextXAlignment.Center)
	return toast
end

makeToast("Diner produced $120 while you were away", Color3.fromRGB(255, 196, 60))
makeToast("Pizza Oven upgraded to Level 2", Color3.fromRGB(90, 220, 120))

-- ============ Custom health meter (replaces disabled core Health) ============
local healthBar = Instance.new("Frame")
healthBar.Name = "HealthMeter"
healthBar.AnchorPoint = Vector2.new(0, 1)
healthBar.Position = UDim2.new(0, 12, 1, -14)
healthBar.Size = UDim2.new(0.18, 0, 0, 18)
healthBar.BackgroundColor3 = Color3.fromRGB(28, 30, 38)
healthBar.BackgroundTransparency = 0.15
healthBar.Parent = gui
corner(healthBar, 9)
stroke(healthBar, 2, Color3.fromRGB(230, 90, 90), 0.4)

local healthFill = Instance.new("Frame")
healthFill.Name = "HealthFill"
healthFill.Position = UDim2.new(0, 3, 0, 3)
healthFill.Size = UDim2.new(1, -6, 1, -6)
healthFill.BackgroundColor3 = Color3.fromRGB(90, 220, 120)
healthFill.BorderSizePixel = 0
healthFill.Parent = healthBar
corner(healthFill, 7)