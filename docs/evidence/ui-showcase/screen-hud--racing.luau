local Players = game:GetService("Players")
local StarterGui = game:GetService("StarterGui")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

-- Custom health meter replaces the core one (invisible until damage, so disable now)
pcall(function()
	StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Health, false)
end)

local screenGui = Instance.new("ScreenGui")
screenGui.Name = "RacingHUD"
screenGui.ResetOnSpawn = false
screenGui.IgnoreGuiInset = true
screenGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
screenGui.Parent = playerGui

local function frame(parent, props)
	local f = Instance.new("Frame")
	f.BackgroundColor3 = props.bg or Color3.fromRGB(18, 20, 26)
	f.BackgroundTransparency = props.transparency or 0.25
	f.BorderSizePixel = 0
	for k, v in pairs(props) do
		if k ~= "bg" and k ~= "transparency" then f[k] = v end
	end
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, props.radius or 8)
	corner.Parent = f
	local stroke = Instance.new("UIStroke")
	stroke.Color = props.strokeColor or Color3.fromRGB(70, 80, 100)
	stroke.Thickness = props.strokeWidth or 1
	stroke.Parent = f
	f.Parent = parent
	return f
end

local function label(parent, props)
	local t = Instance.new("TextLabel")
	t.BackgroundTransparency = 1
	t.Font = props.font or Enum.Font.GothamBold
	t.TextSize = props.textSize or 16
	t.TextColor3 = props.color or Color3.fromRGB(235, 240, 250)
	t.TextXAlignment = props.xalign or Enum.TextXAlignment.Left
	t.TextYAlignment = props.yalign or Enum.TextYAlignment.Center
	t.Text = props.text
	t.Parent = parent
	return t
end

-- ============ TOP-CENTRE BAND: race clock + event banner ============
local topBand = frame(screenGui, {
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 44),
	Size = UDim2.new(0.34, 0, 0, 40),
	radius = 10,
	strokeColor = Color3.fromRGB(255, 170, 40),
})
label(topBand, {
	text = "MIDNIGHT CIRCUIT GP — QUALIFYING",
	textSize = 13,
	color = Color3.fromRGB(255, 190, 80),
	xalign = Enum.TextXAlignment.Center,
	Position = UDim2.new(0, 0, 0.05, 0),
	Size = UDim2.new(1, 0, 0.4, 0),
})
label(topBand, {
	text = "LAP TIME 01:24.318   |   BEST 01:22.940",
	textSize = 15,
	xalign = Enum.TextXAlignment.Center,
	Position = UDim2.new(0, 0, 0.5, 0),
	Size = UDim2.new(1, 0, 0.45, 0),
})

-- ============ LEFT EDGE (below top bar): lap + position ============
local lapPanel = frame(screenGui, {
	Position = UDim2.new(0, 12, 0, 96),
	Size = UDim2.new(0.13, 0, 0, 84),
	radius = 10,
	strokeColor = Color3.fromRGB(60, 200, 255),
})
label(lapPanel, {
	text = "LAP 3 / 5",
	textSize = 20,
	color = Color3.fromRGB(120, 220, 255),
	Position = UDim2.new(0.08, 0, 0.08, 0),
	Size = UDim2.new(0.84, 0, 0.4, 0),
})
label(lapPanel, {
	text = "POSITION 2nd",
	textSize = 18,
	color = Color3.fromRGB(255, 210, 90),
	Position = UDim2.new(0.08, 0, 0.52, 0),
	Size = UDim2.new(0.84, 0, 0.4, 0),
})

-- ============ LEFT EDGE: quest tracker ============
local questPanel = frame(screenGui, {
	Position = UDim2.new(0, 12, 0, 190),
	Size = UDim2.new(0.16, 0, 0, 96),
	radius = 10,
	strokeColor = Color3.fromRGB(120, 255, 140),
})
label(questPanel, {
	text = "SEASON CHALLENGES",
	textSize = 12,
	color = Color3.fromRGB(140, 255, 160),
	Position = UDim2.new(0.08, 0, 0.06, 0),
	Size = UDim2.new(0.84, 0, 0.24, 0),
})
label(questPanel, {
	text = "Overtake 10 rivals  (7/10)",
	textSize = 13,
	Position = UDim2.new(0.08, 0, 0.34, 0),
	Size = UDim2.new(0.84, 0, 0.26, 0),
})
label(questPanel, {
	text = "Clean lap without wall hits  (0/1)",
	textSize = 13,
	Position = UDim2.new(0.08, 0, 0.64, 0),
	Size = UDim2.new(0.84, 0, 0.26, 0),
})

-- ============ MID-RIGHT: minimap ============
local minimap = frame(screenGui, {
	AnchorPoint = Vector2.new(1, 0),
	Position = UDim2.new(1, -12, 0, 96),
	Size = UDim2.new(0.16, 0, 0.22, 0),
	radius = 10,
	strokeColor = Color3.fromRGB(90, 100, 130),
})
label(minimap, {
	text = "SHIBUYA LOOP",
	textSize = 12,
	color = Color3.fromRGB(160, 175, 205),
	xalign = Enum.TextXAlignment.Center,
	Position = UDim2.new(0, 0, 0.02, 0),
	Size = UDim2.new(1, 0, 0.16, 0),
})
local mapTrack = frame(minimap, {
	Position = UDim2.new(0.12, 0, 0.24, 0),
	Size = UDim2.new(0.76, 0, 0.62, 0),
	bg = Color3.fromRGB(10, 12, 18),
	transparency = 0.1,
	radius = 6,
})
local playerDot = frame(mapTrack, {
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.new(0.62, 0, 0.38, 0),
	Size = UDim2.new(0.09, 0, 0.09, 0),
	bg = Color3.fromRGB(255, 90, 90),
	transparency = 0,
	radius = 100,
	strokeWidth = 0,
})
local rivalDot = frame(mapTrack, {
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.new(0.3, 0, 0.7, 0),
	Size = UDim2.new(0.07, 0, 0.07, 0),
	bg = Color3.fromRGB(90, 160, 255),
	transparency = 0,
	radius = 100,
	strokeWidth = 0,
})

-- ============ BOTTOM-CENTRE: speed + gear + boost meter ============
local speedPanel = frame(screenGui, {
	AnchorPoint = Vector2.new(0.5, 1),
	Position = UDim2.new(0.5, 0, 1, -14),
	Size = UDim2.new(0.24, 0, 0, 92),
	radius = 12,
	strokeColor = Color3.fromRGB(255, 170, 40),
})
label(speedPanel, {
	text = "218 KM/H",
	textSize = 30,
	color = Color3.fromRGB(255, 200, 100),
	xalign = Enum.TextXAlignment.Center,
	Position = UDim2.new(0, 0, 0.06, 0),
	Size = UDim2.new(1, 0, 0.42, 0),
})
label(speedPanel, {
	text = "GEAR 5   •   NITRO",
	textSize = 13,
	color = Color3.fromRGB(170, 185, 215),
	xalign = Enum.TextXAlignment.Center,
	Position = UDim2.new(0, 0, 0.5, 0),
	Size = UDim2.new(1, 0, 0.2, 0),
})
local boostTrack = frame(speedPanel, {
	Position = UDim2.new(0.08, 0, 0.76, 0),
	Size = UDim2.new(0.84, 0, 0.12, 0),
	bg = Color3.fromRGB(10, 12, 18),
	transparency = 0.1,
	radius = 6,
})
local boostFill = frame(boostTrack, {
	Position = UDim2.new(0, 0, 0, 0),
	Size = UDim2.new(0.68, 0, 1, 0),
	bg = Color3.fromRGB(80, 220, 255),
	transparency = 0,
	radius = 6,
	strokeWidth = 0,
})

-- ============ BOTTOM-LEFT-ADJACENT (left edge, above reserved thumbstick): telemetry ============
local telemetry = frame(screenGui, {
	Position = UDim2.new(0, 12, 1, -130),
	Size = UDim2.new(0.15, 0, 0, 74),
	radius = 10,
	strokeColor = Color3.fromRGB(90, 100, 130),
})
label(telemetry, {
	text = "DRIFT SCORE 4,820",
	textSize = 14,
	color = Color3.fromRGB(200, 130, 255),
	Position = UDim2.new(0.08, 0, 0.08, 0),
	Size = UDim2.new(0.84, 0, 0.36, 0),
})
label(telemetry, {
	text = "CREDITS  §12,450",
	textSize = 14,
	color = Color3.fromRGB(120, 255, 160),
	Position = UDim2.new(0.08, 0, 0.5, 0),
	Size = UDim2.new(0.84, 0, 0.36, 0),
})

-- ============ TOP-CENTRE toast (below band) ============
local toast = frame(screenGui, {
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 94),
	Size = UDim2.new(0.22, 0, 0, 34),
	bg = Color3.fromRGB(30, 60, 40),
	transparency = 0.15,
	radius = 8,
	strokeColor = Color3.fromRGB(120, 255, 140),
})
label(toast, {
	text = "PERFECT START! +250 CREDITS",
	textSize = 14,
	color = Color3.fromRGB(160, 255, 180),
	xalign = Enum.TextXAlignment.Center,
	Size = UDim2.new(1, 0, 1, 0),
})