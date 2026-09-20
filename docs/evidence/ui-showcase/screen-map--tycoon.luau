-- MAP screen — corner minimap + full map overlay (tycoon)
local Players = game:GetService("Players")
local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local screenGui = Instance.new("ScreenGui")
screenGui.Name = "TycoonMapScreen"
screenGui.ResetOnSpawn = false
screenGui.IgnoreGuiInset = false
screenGui.Parent = playerGui

-- ============ CORNER MINIMAP (bottom-left, deliberate; acts as the button) ============
local minimapFrame = Instance.new("Frame")
minimapFrame.Name = "Minimap"
minimapFrame.AnchorPoint = Vector2.new(0, 1)
minimapFrame.Position = UDim2.new(0, 0, 1, 0)
minimapFrame.Size = UDim2.new(0.22, 0, 0.30, 0)
minimapFrame.BackgroundColor3 = Color3.fromRGB(24, 30, 26)
minimapFrame.BorderSizePixel = 0
minimapFrame.Parent = screenGui

local minimapCorner = Instance.new("UICorner")
minimapCorner.CornerRadius = UDim.new(0, 8)
minimapCorner.Parent = minimapFrame

local minimapStroke = Instance.new("UIStroke")
minimapStroke.Color = Color3.fromRGB(212, 175, 92)
minimapStroke.Thickness = 2
minimapStroke.Parent = minimapFrame

-- map terrain picture (static representation of the tycoon plot)
local mapImage = Instance.new("ImageLabel")
mapImage.Name = "MapImage"
mapImage.Size = UDim2.new(1, 0, 1, 0)
mapImage.BackgroundTransparency = 1
mapImage.Image = "rbxassetid://0"
mapImage.ImageColor3 = Color3.fromRGB(58, 92, 60)
mapImage.Parent = minimapFrame

-- central park hub (orientation anchor)
local parkBlip = Instance.new("Frame")
parkBlip.Name = "CentralPark"
parkBlip.AnchorPoint = Vector2.new(0.5, 0.5)
parkBlip.Position = UDim2.new(0.5, 0, 0.5, 0)
parkBlip.Size = UDim2.new(0.18, 0, 0.18, 0)
parkBlip.BackgroundColor3 = Color3.fromRGB(96, 160, 84)
parkBlip.BorderSizePixel = 0
parkBlip.Parent = mapImage

local parkCorner = Instance.new("UICorner")
parkCorner.CornerRadius = UDim.new(1, 0)
parkCorner.Parent = parkBlip

-- other players: coloured DOTS
local function makeDot(name, color, x, y)
	local dot = Instance.new("Frame")
	dot.Name = name
	dot.AnchorPoint = Vector2.new(0.5, 0.5)
	dot.Position = UDim2.new(x, 0, y, 0)
	dot.Size = UDim2.new(0.045, 0, 0.045, 0)
	dot.BackgroundColor3 = color
	dot.BorderSizePixel = 0
	dot.Parent = mapImage
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(1, 0)
	c.Parent = dot
	return dot
end
makeDot("PlayerDot_Beeb", Color3.fromRGB(230, 90, 90), 0.68, 0.30)
makeDot("PlayerDot_Mira", Color3.fromRGB(90, 140, 230), 0.34, 0.72)

-- the viewing player: an ARROW, not a dot (shape says "you" and carries heading)
local playerArrow = Instance.new("ImageLabel")
playerArrow.Name = "YouArrow"
playerArrow.AnchorPoint = Vector2.new(0.5, 0.5)
playerArrow.Position = UDim2.new(0.5, 0, 0.62, 0)
playerArrow.Size = UDim2.new(0.09, 0, 0.09, 0)
playerArrow.BackgroundTransparency = 1
playerArrow.Image = "rbxassetid://5761305639" -- triangle/arrow
playerArrow.ImageColor3 = Color3.fromRGB(255, 255, 255)
playerArrow.Rotation = 35
playerArrow.Parent = mapImage

-- minimap header strip
local minimapTitle = Instance.new("TextLabel")
minimapTitle.Name = "MinimapTitle"
minimapTitle.Size = UDim2.new(1, 0, 0, 20)
minimapTitle.BackgroundColor3 = Color3.fromRGB(16, 20, 18)
minimapTitle.BackgroundTransparency = 0.25
minimapTitle.BorderSizePixel = 0
minimapTitle.TextColor3 = Color3.fromRGB(235, 225, 200)
minimapTitle.TextSize = 13
minimapTitle.Font = Enum.Font.GothamBold
minimapTitle.Text = "BAYSIDE TYCOON  ·  click map for full view"
minimapTitle.Parent = minimapFrame

-- ============ FULL MAP OVERLAY (opened by clicking the minimap) ============
local fullMap = Instance.new("Frame")
fullMap.Name = "FullMapOverlay"
fullMap.AnchorPoint = Vector2.new(0.5, 0.5)
fullMap.Position = UDim2.new(0.5, 0, 0.5, 0)
fullMap.Size = UDim2.new(0.78, 0, 0.82, 0)
fullMap.BackgroundColor3 = Color3.fromRGB(20, 26, 22)
fullMap.BorderSizePixel = 0
fullMap.Visible = false
fullMap.Parent = screenGui

local fullCorner = Instance.new("UICorner")
fullCorner.CornerRadius = UDim.new(0, 12)
fullCorner.Parent = fullMap

local fullStroke = Instance.new("UIStroke")
fullStroke.Color = Color3.fromRGB(212, 175, 92)
fullStroke.Thickness = 2
fullStroke.Parent = fullMap

local fullTitle = Instance.new("TextLabel")
fullTitle.Name = "FullMapTitle"
fullTitle.Size = UDim2.new(1, 0, 0, 36)
fullTitle.BackgroundColor3 = Color3.fromRGB(14, 18, 16)
fullTitle.BorderSizePixel = 0
fullTitle.TextColor3 = Color3.fromRGB(235, 225, 200)
fullTitle.TextSize = 20
fullTitle.Font = Enum.Font.GothamBold
fullTitle.Text = "BAYSIDE TYCOON — WORLD MAP"
fullTitle.Parent = fullMap

-- big map canvas
local canvas = Instance.new("Frame")
canvas.Name = "MapCanvas"
canvas.Position = UDim2.new(0.02, 0, 0.06, 0)
canvas.Size = UDim2.new(0.72, 0, 0.86, 0)
canvas.BackgroundColor3 = Color3.fromRGB(46, 72, 50)
canvas.BorderSizePixel = 0
canvas.Parent = fullMap

local canvasCorner = Instance.new("UICorner")
canvasCorner.CornerRadius = UDim.new(0, 8)
canvasCorner.Parent = canvas

-- radiating paths from central park toward outer tycoon lots
local function path(x, y, w, h)
	local p = Instance.new("Frame")
	p.AnchorPoint = Vector2.new(0.5, 0.5)
	p.Position = UDim2.new(x, 0, y, 0)
	p.Size = UDim2.new(w, 0, h, 0)
	p.BackgroundColor3 = Color3.fromRGB(150, 132, 96)
	p.BorderSizePixel = 0
	p.Parent = canvas
	return p
end
path(0.5, 0.5, 0.03, 0.9)   -- north-south boulevard
path(0.5, 0.5, 0.9, 0.03)   -- east-west boulevard
path(0.28, 0.28, 0.03, 0.42)
path(0.72, 0.72, 0.03, 0.42)

local bigPark = Instance.new("Frame")
bigPark.Name = "CentralParkBig"
bigPark.AnchorPoint = Vector2.new(0.5, 0.5)
bigPark.Position = UDim2.new(0.5, 0, 0.5, 0)
bigPark.Size = UDim2.new(0.16, 0, 0.16, 0)
bigPark.BackgroundColor3 = Color3.fromRGB(96, 160, 84)
bigPark.BorderSizePixel = 0
bigPark.Parent = canvas
local bpCorner = Instance.new("UICorner")
bpCorner.CornerRadius = UDim.new(1, 0)
bpCorner.Parent = bigPark

local parkLabel = Instance.new("TextLabel")
parkLabel.Size = UDim2.new(1, 0, 1, 0)
parkLabel.BackgroundTransparency = 1
parkLabel.TextColor3 = Color3.fromRGB(20, 34, 20)
parkLabel.TextSize = 12
parkLabel.Font = Enum.Font.GothamBold
parkLabel.Text = "CENTRAL PARK & POND"
parkLabel.Parent = bigPark

-- tycoon lots as labelled regions
local function lot(name, color, x, y, w, h, label)
	local f = Instance.new("Frame")
	f.Name = name
	f.Position = UDim2.new(x, 0, y, 0)
	f.Size = UDim2.new(w, 0, h, 0)
	f.BackgroundColor3 = color
	f.BorderSizePixel = 0
	f.Parent = canvas
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0, 6)
	c.Parent = f
	local t = Instance.new("TextLabel")
	t.Size = UDim2.new(1, 0, 1, 0)
	t.BackgroundTransparency = 1
	t.TextColor3 = Color3.fromRGB(240, 235, 220)
	t.TextSize = 13
	t.Font = Enum.Font.GothamBold
	t.Text = label
	t.Parent = f
	return f
end
lot("YourLot", Color3.fromRGB(70, 110, 150), 0.06, 0.08, 0.24, 0.20, "YOUR LOT — Pier Diner")
lot("RivalLot", Color3.fromRGB(150, 70, 70), 0.70, 0.08, 0.24, 0.20, "MIRA'S LOT — Car Wash")
lot("Expansion", Color3.fromRGB(60, 66, 60), 0.70, 0.72, 0.24, 0.20, "EXPANSION SPACE")
lot("Dropzone", Color3.fromRGB(120, 100, 60), 0.06, 0.72, 0.24, 0.20, "CARGO DROP ZONE")

-- player arrow on the big map too
local bigArrow = Instance.new("ImageLabel")
bigArrow.Name = "YouArrowBig"
bigArrow.AnchorPoint = Vector2.new(0.5, 0.5)
bigArrow.Position = UDim2.new(0.18, 0, 0.18, 0)
bigArrow.Size = UDim2.new(0.035, 0, 0.05, 0)
bigArrow.BackgroundTransparency = 1
bigArrow.Image = "rbxassetid://5761305639"
bigArrow.ImageColor3 = Color3.fromRGB(255, 255, 255)
bigArrow.Rotation = 35
bigArrow.Parent = canvas

-- waypoint markers (system-placed) with distance readouts
local function waypoint(name, x, y, label, dist)
	local w = Instance.new("Frame")
	w.Name = name
	w.AnchorPoint = Vector2.new(0.5, 0.5)
	w.Position = UDim2.new(x, 0, y, 0)
	w.Size = UDim2.new(0.028, 0, 0.045, 0)
	w.BackgroundColor3 = Color3.fromRGB(255, 214, 92)
	w.BorderSizePixel = 0
	w.Parent = canvas
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(1, 0)
	c.Parent = w
	local t = Instance.new("TextLabel")
	t.AnchorPoint = Vector2.new(0.5, 0)
	t.Position = UDim2.new(0.5, 0, 1, 2)
	t.Size = UDim2.new(0, 130, 0, 30)
	t.BackgroundTransparency = 1
	t.TextColor3 = Color3.fromRGB(255, 240, 200)
	t.TextSize = 11
	t.Font = Enum.Font.Gotham
	t.Text = label .. "\n" .. dist
	t.TextWrapped = true
	t.Parent = w
end
waypoint("WpBank", 0.5, 0.14, "BANK DEPOSIT", "142 studs")
waypoint("WpDrop", 0.18, 0.82, "CARGO DROP", "310 studs")
waypoint("WpRival", 0.82, 0.18, "MIRA'S CAR WASH", "265 studs")

-- legend + layer toggles (right panel)
local legend = Instance.new("Frame")
legend.Name = "Legend"
legend.Position = UDim2.new(0.76, 0, 0.06, 0)
legend.Size = UDim2.new(0.22, 0, 0.86, 0)
legend.BackgroundColor3 = Color3.fromRGB(26, 32, 28)
legend.BorderSizePixel = 0
legend.Parent = fullMap

local legendCorner = Instance.new("UICorner")
legendCorner.CornerRadius = UDim.new(0, 8)
legendCorner.Parent = legend

local legendTitle = Instance.new("TextLabel")
legendTitle.Size = UDim2.new(1, 0, 0, 30)
legendTitle.BackgroundTransparency = 1
legendTitle.TextColor3 = Color3.fromRGB(212, 175, 92)
legendTitle.TextSize = 15
legendTitle.Font = Enum.Font.GothamBold
legendTitle.Text = "LEGEND & LAYERS"
legendTitle.Parent = legend

local list = Instance.new("UIListLayout")
list.Padding = UDim.new(0, 6)
list.HorizontalAlignment = Enum.HorizontalAlignment.Center
list.Parent = legend

local function legendRow(color, text, shape)
	local row = Instance.new("Frame")
	row.Size = UDim2.new(0.9, 0, 0, 26)
	row.BackgroundColor3 = Color3.fromRGB(34, 42, 36)
	row.BorderSizePixel = 0
	row.Parent = legend
	local rc = Instance.new("UICorner")
	rc.CornerRadius = UDim.new(0, 6)
	rc.Parent = row
	local sw = Instance.new("Frame")
	sw.AnchorPoint = Vector2.new(0, 0.5)
	sw.Position = UDim2.new(0, 8, 0.5, 0)
	sw.Size = UDim2.new(0, 14, 0, 14)
	sw.BackgroundColor3 = color
	sw.BorderSizePixel = 0
	sw.Parent = row
	if shape == "dot" then
		local sc = Instance.new("UICorner")
		sc.CornerRadius = UDim.new(1, 0)
		sc.Parent = sw
	end
	local t = Instance.new("TextLabel")
	t.Position = UDim2.new(0, 30, 0, 0)
	t.Size = UDim2.new(1, -36, 1, 0)
	t.BackgroundTransparency = 1
	t.TextColor3 = Color3.fromRGB(225, 220, 205)
	t.TextSize = 12
	t.Font = Enum.Font.Gotham
	t.TextXAlignment = Enum.TextXAlignment.Left
	t.Text = text
	t.Parent = row
end
legendRow(Color3.fromRGB(255, 255, 255), "You (arrow, faces heading)", "arrow")
legendRow(Color3.fromRGB(230, 90, 90), "Beeb — rival owner", "dot")
legendRow(Color3.fromRGB(90, 140, 230), "Mira — rival owner", "dot")
legendRow(Color3.fromRGB(255, 214, 92), "System waypoint", "dot")
legendRow(Color3.fromRGB(96, 160, 84), "Central park hub", "dot")

-- rotation setting note (rotation is a preference, not a fact)
local rotNote = Instance.new("TextLabel")
rotNote.Name = "RotationNote"
rotNote.AnchorPoint = Vector2.new(0.5, 1)
rotNote.Position = UDim2.new(0.5, 0, 1, -8)
rotNote.Size = UDim2.new(0.9, 0, 0, 40)
rotNote.BackgroundColor3 = Color3.fromRGB(16, 20, 18)
rotNote.BorderSizePixel = 0
rotNote.TextColor3 = Color3.fromRGB(180, 175, 160)
rotNote.TextSize = 11
rotNote.Font = Enum.Font.Gotham
rotNote.TextWrapped = true
rotNote.Text = "Map is fixed north-up; your arrow rotates with your avatar instead. Change this in Options > Map Rotation."
rotNote.Parent = fullMap

local rotCorner = Instance.new("UICorner")
rotCorner.CornerRadius = UDim.new(0, 6)
rotCorner.Parent = rotNote

-- close hint
local closeHint = Instance.new("TextLabel")
closeHint.AnchorPoint = Vector2.new(0.5, 1)
closeHint.Position = UDim2.new(0.5, 0, 1, -6)
closeHint.Size = UDim2.new(0.4, 0, 0, 22)
closeHint.BackgroundTransparency = 1
closeHint.TextColor3 = Color3.fromRGB(160, 155, 140)
closeHint.TextSize = 12
closeHint.Font = Enum.Font.Gotham
closeHint.Text = "Press M to close · hold Tab to peek"
closeHint.Parent = fullMap

-- ============ interaction: the minimap itself is the button ============
local openButton = Instance.new("TextButton")
openButton.Name = "MinimapButton"
openButton.Size = UDim2.new(1, 0, 1, 0)
openButton.BackgroundTransparency = 1
openButton.Text = ""
openButton.Parent = minimapFrame

openButton.MouseButton1Click:Connect(function()
	fullMap.Visible = not fullMap.Visible
end)