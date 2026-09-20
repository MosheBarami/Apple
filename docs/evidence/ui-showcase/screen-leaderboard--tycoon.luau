-- World leaderboard board: SurfaceGui on a part beside spawn (tycoon genre)
local Players = game:GetService("Players")
local player = Players.LocalPlayer

-- The board part, standing in the world at the spawn landmark
local boardPart = Instance.new("Part")
boardPart.Name = "LeaderboardBoard_Cash"
boardPart.Anchored = true
boardPart.CanCollide = false
boardPart.Size = Vector3.new(12, 9, 0.6)
boardPart.Position = Vector3.new(0, 6.5, -18)
boardPart.Color = Color3.fromRGB(38, 30, 52)
boardPart.Material = Enum.Material.SmoothPlastic
boardPart.Parent = workspace

local surfaceGui = Instance.new("SurfaceGui")
surfaceGui.Name = "CashLeaderboardGui"
surfaceGui.Face = Enum.NormalId.Front
surfaceGui.CanvasSize = Vector2.new(1200, 900)
surfaceGui.LightInfluence = 0
surfaceGui.AlwaysOnTop = false
surfaceGui.Parent = boardPart

local root = Instance.new("Frame")
root.Name = "Root"
root.Size = UDim2.fromScale(1, 1)
root.BackgroundColor3 = Color3.fromRGB(38, 30, 52)
root.BorderSizePixel = 0
root.Parent = surfaceGui

local rootCorner = Instance.new("UICorner")
rootCorner.CornerRadius = UDim.new(0, 18)
rootCorner.Parent = root

local rootStroke = Instance.new("UIStroke")
rootStroke.Color = Color3.fromRGB(255, 196, 66)
rootStroke.Thickness = 4
rootStroke.Parent = root

-- Title
local title = Instance.new("TextLabel")
title.Name = "Title"
title.Size = UDim2.fromScale(1, 0.12)
title.Position = UDim2.fromScale(0, 0.02)
title.BackgroundTransparency = 1
title.Text = "ALL-TIME TOP EARNERS"
title.TextColor3 = Color3.fromRGB(255, 214, 102)
title.Font = Enum.Font.FredokaOne
title.TextScaled = true
title.Parent = root

local subtitle = Instance.new("TextLabel")
subtitle.Name = "Subtitle"
subtitle.Size = UDim2.fromScale(1, 0.05)
subtitle.Position = UDim2.fromScale(0, 0.145)
subtitle.BackgroundTransparency = 1
subtitle.Text = "Cash earned across every tycoon plot — updates at the end of each season"
subtitle.TextColor3 = Color3.fromRGB(190, 180, 210)
subtitle.Font = Enum.Font.Gotham
subtitle.TextScaled = true
subtitle.Parent = root

-- Podium: top three, larger rows with avatar thumbnails
local podiumData = {
	{ rank = 1, name = "MintyBuilds", cash = "$4,812,300", color = Color3.fromRGB(255, 214, 102) },
	{ rank = 2, name = "DrPixelPaws", cash = "$3,905,775", color = Color3.fromRGB(200, 205, 220) },
	{ rank = 3, name = "QueenOfConveyor", cash = "$2,640,120", color = Color3.fromRGB(205, 133, 90) },
}

for i, entry in ipairs(podiumData) do
	local row = Instance.new("Frame")
	row.Name = "Podium" .. entry.rank
	row.Size = UDim2.fromScale(0.92, 0.13)
	row.Position = UDim2.fromScale(0.04, 0.21 + (i - 1) * 0.145)
	row.BackgroundColor3 = Color3.fromRGB(52, 42, 72)
	row.BorderSizePixel = 0
	row.Parent = root

	local rowCorner = Instance.new("UICorner")
	rowCorner.CornerRadius = UDim.new(0, 12)
	rowCorner.Parent = row

	local rowStroke = Instance.new("UIStroke")
	rowStroke.Color = entry.color
	rowStroke.Thickness = 3
	rowStroke.Parent = row

	local rankLabel = Instance.new("TextLabel")
	rankLabel.Name = "Rank"
	rankLabel.Size = UDim2.fromScale(0.1, 1)
	rankLabel.BackgroundTransparency = 1
	rankLabel.Text = "#" .. entry.rank
	rankLabel.TextColor3 = entry.color
	rankLabel.Font = Enum.Font.FredokaOne
	rankLabel.TextScaled = true
	rankLabel.Parent = row

	local thumb = Instance.new("ImageLabel")
	thumb.Name = "Avatar"
	thumb.Size = UDim2.fromScale(0.09, 0.78)
	thumb.Position = UDim2.fromScale(0.12, 0.11)
	thumb.BackgroundColor3 = Color3.fromRGB(30, 24, 44)
	thumb.BorderSizePixel = 0
	thumb.Parent = row

	local thumbCorner = Instance.new("UICorner")
	thumbCorner.CornerRadius = UDim.new(1, 0)
	thumbCorner.Parent = thumb

	local ok, thumbContent = pcall(function()
		return Players:GetUserThumbnailAsync(1, Enum.ThumbnailType.HeadShot, Enum.ThumbnailSize.Size100x100)
	end)
	if ok then
		thumb.Image = thumbContent
	end

	local nameLabel = Instance.new("TextLabel")
	nameLabel.Name = "PlayerName"
	nameLabel.Size = UDim2.fromScale(0.5, 0.55)
	nameLabel.Position = UDim2.fromScale(0.24, 0.08)
	nameLabel.BackgroundTransparency = 1
	nameLabel.Text = entry.name
	nameLabel.TextColor3 = Color3.fromRGB(245, 240, 255)
	nameLabel.Font = Enum.Font.GothamBold
	nameLabel.TextScaled = true
	nameLabel.TextXAlignment = Enum.TextXAlignment.Left
	nameLabel.Parent = row

	local cashLabel = Instance.new("TextLabel")
	cashLabel.Name = "Cash"
	cashLabel.Size = UDim2.fromScale(0.5, 0.4)
	cashLabel.Position = UDim2.fromScale(0.24, 0.58)
	cashLabel.BackgroundTransparency = 1
	cashLabel.Text = entry.cash .. " earned"
	cashLabel.TextColor3 = entry.color
	cashLabel.Font = Enum.Font.Gotham
	cashLabel.TextScaled = true
	cashLabel.TextXAlignment = Enum.TextXAlignment.Left
	cashLabel.Parent = row
end

-- Ranked rows 4 through 8, plain table treatment
local rankedData = {
	{ rank = 4, name = "BrickLord99", cash = "$1,877,450" },
	{ rank = 5, name = "SprocketSage", cash = "$1,204,980" },
	{ rank = 6, name = "TinyTycoonTina", cash = "$942,610" },
	{ rank = 7, name = "GearsAndGreed", cash = "$733,205" },
	{ rank = 8, name = "PlotBaronVex", cash = "$588,040" },
}

for i, entry in ipairs(rankedData) do
	local row = Instance.new("Frame")
	row.Name = "Row" .. entry.rank
	row.Size = UDim2.fromScale(0.92, 0.055)
	row.Position = UDim2.fromScale(0.04, 0.66 + (i - 1) * 0.062)
	row.BackgroundColor3 = Color3.fromRGB(46, 37, 64)
	row.BorderSizePixel = 0
	row.Parent = root

	local rowCorner = Instance.new("UICorner")
	rowCorner.CornerRadius = UDim.new(0, 8)
	rowCorner.Parent = row

	local rankLabel = Instance.new("TextLabel")
	rankLabel.Name = "Rank"
	rankLabel.Size = UDim2.fromScale(0.08, 1)
	rankLabel.BackgroundTransparency = 1
	rankLabel.Text = "#" .. entry.rank
	rankLabel.TextColor3 = Color3.fromRGB(170, 160, 195)
	rankLabel.Font = Enum.Font.GothamBold
	rankLabel.TextScaled = true
	rankLabel.Parent = row

	local nameLabel = Instance.new("TextLabel")
	nameLabel.Name = "PlayerName"
	nameLabel.Size = UDim2.fromScale(0.5, 1)
	nameLabel.Position = UDim2.fromScale(0.1, 0)
	nameLabel.BackgroundTransparency = 1
	nameLabel.Text = entry.name
	nameLabel.TextColor3 = Color3.fromRGB(225, 218, 240)
	nameLabel.Font = Enum.Font.Gotham
	nameLabel.TextScaled = true
	nameLabel.TextXAlignment = Enum.TextXAlignment.Left
	nameLabel.Parent = row

	local cashLabel = Instance.new("TextLabel")
	cashLabel.Name = "Cash"
	cashLabel.Size = UDim2.fromScale(0.35, 1)
	cashLabel.Position = UDim2.fromScale(0.62, 0)
	cashLabel.BackgroundTransparency = 1
	cashLabel.Text = entry.cash
	cashLabel.TextColor3 = Color3.fromRGB(255, 214, 102)
	cashLabel.Font = Enum.Font.GothamBold
	cashLabel.TextScaled = true
	cashLabel.TextXAlignment = Enum.TextXAlignment.Right
	cashLabel.Parent = row
end

-- Your own standing, pinned at the bottom of the board
local youRow = Instance.new("Frame")
youRow.Name = "YourStanding"
youRow.Size = UDim2.fromScale(0.92, 0.055)
youRow.Position = UDim2.fromScale(0.04, 0.935)
youRow.BackgroundColor3 = Color3.fromRGB(64, 50, 30)
youRow.BorderSizePixel = 0
youRow.Parent = root

local youCorner = Instance.new("UICorner")
youCorner.CornerRadius = UDim.new(0, 8)
youCorner.Parent = youRow

local youStroke = Instance.new("UIStroke")
youStroke.Color = Color3.fromRGB(255, 196, 66)
youStroke.Thickness = 2
youStroke.Parent = youRow

local youLabel = Instance.new("TextLabel")
youLabel.Name = "YouText"
youLabel.Size = UDim2.fromScale(1, 1)
youLabel.BackgroundTransparency = 1
youLabel.Text = "YOU — Rank #23 · $412,880 earned · 37 ranks to the top 10"
youLabel.TextColor3 = Color3.fromRGB(255, 226, 150)
youLabel.Font = Enum.Font.GothamBold
youLabel.TextScaled = true
youLabel.Parent = youRow