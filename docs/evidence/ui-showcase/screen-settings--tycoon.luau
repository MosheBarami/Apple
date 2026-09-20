local Players = game:GetService("Players")
local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local screenGui = Instance.new("ScreenGui")
screenGui.Name = "TycoonSettings"
screenGui.ResetOnSpawn = false
screenGui.IgnoreGuiInset = true
screenGui.Parent = playerGui

-- dim backdrop
local backdrop = Instance.new("Frame")
backdrop.Name = "Backdrop"
backdrop.Size = UDim2.fromScale(1, 1)
backdrop.BackgroundColor3 = Color3.fromRGB(12, 14, 20)
backdrop.BackgroundTransparency = 0.35
backdrop.BorderSizePixel = 0
backdrop.Parent = screenGui

-- panel: landscape 2.5:1, 75% of screen, clamped 350-800px, corner 0.1
local panel = Instance.new("Frame")
panel.Name = "SettingsPanel"
panel.AnchorPoint = Vector2.new(0.5, 0.5)
panel.Position = UDim2.fromScale(0.5, 0.5)
panel.Size = UDim2.fromScale(0.75, 0.75)
panel.BackgroundColor3 = Color3.fromRGB(28, 32, 44)
panel.BorderSizePixel = 0
panel.Parent = backdrop

local panelClamp = Instance.new("UISizeConstraint")
panelClamp.MinSize = Vector2.new(350, 140)
panelClamp.MaxSize = Vector2.new(800, 320)
panelClamp.Parent = panel

local panelAspect = Instance.new("UIAspectRatioConstraint")
panelAspect.AspectRatio = 2.5
panelAspect.AspectType = Enum.AspectType.FitWithinMaxSize
panelAspect.Parent = panel

local panelCorner = Instance.new("UICorner")
panelCorner.CornerRadius = UDim.new(0.1, 0)
panelCorner.Parent = panel

local panelStroke = Instance.new("UIStroke")
panelStroke.Color = Color3.fromRGB(90, 200, 130)
panelStroke.Thickness = 2
panelStroke.Parent = panel

-- header: single row, title flush left, close flush right
local header = Instance.new("Frame")
header.Name = "Header"
header.Size = UDim2.new(1, 0, 0.18, 0)
header.BackgroundTransparency = 1
header.Parent = panel

local title = Instance.new("TextLabel")
title.Name = "Title"
title.Position = UDim2.fromScale(0.04, 0)
title.Size = UDim2.new(0.7, 0, 1, 0)
title.BackgroundTransparency = 1
title.Text = "Factory Settings"
title.TextColor3 = Color3.fromRGB(235, 240, 245)
title.TextXAlignment = Enum.TextXAlignment.Left
title.Font = Enum.Font.GothamBlack
title.TextScaled = true
title.Parent = header

-- close: ImageButton, anchor (1,0), 10px inset, 15% of panel height, 1:1
local closeButton = Instance.new("ImageButton")
closeButton.Name = "CloseButton"
closeButton.AnchorPoint = Vector2.new(1, 0)
closeButton.Position = UDim2.new(1, -10, 0, 10)
closeButton.Size = UDim2.new(0, 0, 0.15, 0)
closeButton.BackgroundColor3 = Color3.fromRGB(45, 52, 68)
closeButton.BorderSizePixel = 0
closeButton.Image = "rbxasset://textures/ui/common/CloseX.png"
closeButton.ImageColor3 = Color3.fromRGB(235, 240, 245)
closeButton.Parent = panel

local closeAspect = Instance.new("UIAspectRatioConstraint")
closeAspect.AspectRatio = 1
closeAspect.Parent = closeButton

local closeCorner = Instance.new("UICorner")
closeCorner.CornerRadius = UDim.new(0, 8)
closeCorner.Parent = closeButton

-- scrollable row list
local list = Instance.new("ScrollingFrame")
list.Name = "Rows"
list.Position = UDim2.fromScale(0.04, 0.2)
list.Size = UDim2.new(0.92, 0, 0.66, 0)
list.BackgroundTransparency = 1
list.BorderSizePixel = 0
list.ScrollBarThickness = 6
list.CanvasSize = UDim2.new(0, 0, 0, 0)
list.AutomaticCanvasSize = Enum.AutomaticSize.Y
list.Parent = panel

local listLayout = Instance.new("UIListLayout")
listLayout.Padding = UDim.new(0, 8)
listLayout.SortOrder = Enum.SortOrder.LayoutOrder
listLayout.Parent = list

local function sectionLabel(text, order)
	local label = Instance.new("TextLabel")
	label.Name = text
	label.Size = UDim2.new(1, 0, 0, 22)
	label.BackgroundTransparency = 1
	label.Text = text
	label.TextColor3 = Color3.fromRGB(90, 200, 130)
	label.TextXAlignment = Enum.TextXAlignment.Left
	label.Font = Enum.Font.GothamBold
	label.TextSize = 16
	label.LayoutOrder = order
	label.Parent = list
end

local function rowBase(name, order)
	local row = Instance.new("Frame")
	row.Name = name
	row.Size = UDim2.new(1, 0, 0, 34)
	row.BackgroundColor3 = Color3.fromRGB(38, 44, 58)
	row.BorderSizePixel = 0
	row.LayoutOrder = order
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0, 8)
	c.Parent = row
	local lbl = Instance.new("TextLabel")
	lbl.Name = "Label"
	lbl.Position = UDim2.fromScale(0.03, 0)
	lbl.Size = UDim2.new(0.55, 0, 1, 0)
	lbl.BackgroundTransparency = 1
	lbl.Text = name
	lbl.TextColor3 = Color3.fromRGB(225, 230, 238)
	lbl.TextXAlignment = Enum.TextXAlignment.Left
	lbl.Font = Enum.Font.Gotham
	lbl.TextSize = 15
	lbl.Parent = row
	return row
end

local function toggleRow(name, on, order)
	local row = rowBase(name, order)
	local btn = Instance.new("TextButton")
	btn.Name = "Toggle"
	btn.AnchorPoint = Vector2.new(1, 0.5)
	btn.Position = UDim2.new(0.97, 0, 0.5, 0)
	btn.Size = UDim2.new(0.16, 0, 0.6, 0)
	btn.BackgroundColor3 = on and Color3.fromRGB(90, 200, 130) or Color3.fromRGB(70, 76, 92)
	btn.Text = on and "ON" or "OFF"
	btn.TextColor3 = Color3.fromRGB(20, 24, 32)
	btn.Font = Enum.Font.GothamBold
	btn.TextSize = 14
	btn.Parent = row
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0, 6)
	c.Parent = btn
end

local function sliderRow(name, valueText, order)
	local row = rowBase(name, order)
	local track = Instance.new("Frame")
	track.Name = "Track"
	track.AnchorPoint = Vector2.new(1, 0.5)
	track.Position = UDim2.new(0.97, 0, 0.5, 0)
	track.Size = UDim2.new(0.34, 0, 0.28, 0)
	track.BackgroundColor3 = Color3.fromRGB(60, 68, 86)
	track.BorderSizePixel = 0
	track.Parent = row
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(1, 0)
	c.Parent = track
	local fill = Instance.new("Frame")
	fill.Name = "Fill"
	fill.Size = UDim2.fromScale(0.65, 1)
	fill.BackgroundColor3 = Color3.fromRGB(90, 200, 130)
	fill.BorderSizePixel = 0
	fill.Parent = track
	local fc = Instance.new("UICorner")
	fc.CornerRadius = UDim.new(1, 0)
	fc.Parent = fill
	local val = Instance.new("TextLabel")
	val.Name = "Value"
	val.AnchorPoint = Vector2.new(1, 0.5)
	val.Position = UDim2.new(0.97, 0, 0.5, 0)
	val.Size = UDim2.new(0.1, 0, 1, 0)
	val.BackgroundTransparency = 1
	val.Text = valueText
	val.TextColor3 = Color3.fromRGB(225, 230, 238)
	val.Font = Enum.Font.GothamBold
	val.TextSize = 14
	val.Parent = row
end

local function keybindRow(name, key, order)
	local row = rowBase(name, order)
	local btn = Instance.new("TextButton")
	btn.Name = "Bind"
	btn.AnchorPoint = Vector2.new(1, 0.5)
	btn.Position = UDim2.new(0.97, 0, 0.5, 0)
	btn.Size = UDim2.new(0.14, 0, 0.6, 0)
	btn.BackgroundColor3 = Color3.fromRGB(60, 68, 86)
	btn.Text = key
	btn.TextColor3 = Color3.fromRGB(235, 240, 245)
	btn.Font = Enum.Font.GothamBold
	btn.TextSize = 14
	btn.Parent = row
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0, 6)
	c.Parent = btn
end

sectionLabel("Audio", 1)
toggleRow("Music", true, 2)
sliderRow("Music Volume", "65%", 3)
toggleRow("Sound Effects", true, 4)
sliderRow("SFX Volume", "80%", 5)

sectionLabel("Gameplay", 6)
toggleRow("Auto-Collect Droppers", true, 7)
toggleRow("Collector Full Alerts", true, 8)
toggleRow("Purchase Confirmations", false, 9)
sliderRow("Camera Sensitivity", "0.5", 10)

sectionLabel("Controls", 11)
keybindRow("Open Tycoon Panel", "T", 12)
keybindRow("Toggle Shop", "B", 13)
keybindRow("Rebirth Menu", "R", 14)

-- footer: reset + version
local footer = Instance.new("Frame")
footer.Name = "Footer"
footer.AnchorPoint = Vector2.new(0, 1)
footer.Position = UDim2.new(0.04, 0, 0.98, 0)
footer.Size = UDim2.new(0.92, 0, 0.12, 0)
footer.BackgroundTransparency = 1
footer.Parent = panel

local resetButton = Instance.new("TextButton")
resetButton.Name = "ResetDefaults"
resetButton.AnchorPoint = Vector2.new(1, 0.5)
resetButton.Position = UDim2.new(1, 0, 0.5, 0)
resetButton.Size = UDim2.new(0.3, 0, 1, 0)
resetButton.BackgroundColor3 = Color3.fromRGB(200, 80, 80)
resetButton.Text = "Reset to Defaults"
resetButton.TextColor3 = Color3.fromRGB(255, 245, 245)
resetButton.Font = Enum.Font.GothamBold
resetButton.TextSize = 15
resetButton.Parent = footer
local rc = Instance.new("UICorner")
rc.CornerRadius = UDim.new(0, 8)
rc.Parent = resetButton

local versionLabel = Instance.new("TextLabel")
versionLabel.Name = "Version"
versionLabel.Size = UDim2.new(0.5, 0, 1, 0)
versionLabel.BackgroundTransparency = 1
versionLabel.Text = "Coal Creek Mining Co. v2.4.1"
versionLabel.TextColor3 = Color3.fromRGB(140, 148, 165)
versionLabel.TextXAlignment = Enum.TextXAlignment.Left
versionLabel.Font = Enum.Font.Gotham
versionLabel.TextSize = 13
versionLabel.Parent = footer

closeButton.Activated:Connect(function()
	screenGui.Enabled = false
end)
resetButton.Activated:Connect(function()
	resetButton.Text = "Defaults Restored"
end)