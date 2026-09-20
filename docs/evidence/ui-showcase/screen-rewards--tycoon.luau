-- DAILY REWARDS screen — 7-day strip, one row, tall portrait tiles
local Players = game:GetService("Players")
local player = Players.LocalPlayer

local screenGui = Instance.new("ScreenGui")
screenGui.Name = "DailyRewardsScreen"
screenGui.ResetOnSpawn = false
screenGui.IgnoreGuiInset = true
screenGui.Parent = player:WaitForChild("PlayerGui")

-- Dim backdrop
local backdrop = Instance.new("Frame")
backdrop.Name = "Backdrop"
backdrop.Size = UDim2.fromScale(1, 1)
backdrop.BackgroundColor3 = Color3.fromRGB(10, 12, 24)
backdrop.BackgroundTransparency = 0.35
backdrop.BorderSizePixel = 0
backdrop.Parent = screenGui

-- Main panel (~60% width, ~72% height)
local panel = Instance.new("Frame")
panel.Name = "RewardsPanel"
panel.Size = UDim2.fromScale(0.6, 0.72)
panel.Position = UDim2.fromScale(0.5, 0.5)
panel.AnchorPoint = Vector2.new(0.5, 0.5)
panel.BackgroundColor3 = Color3.fromRGB(28, 32, 56)
panel.BorderSizePixel = 0
panel.Parent = screenGui
Instance.new("UICorner", panel).CornerRadius = UDim.new(0, 16)
local panelStroke = Instance.new("UIStroke", panel)
panelStroke.Color = Color3.fromRGB(90, 110, 190)
panelStroke.Thickness = 2

-- Header
local header = Instance.new("Frame")
header.Name = "Header"
header.Size = UDim2.fromScale(1, 0.16)
header.Position = UDim2.fromScale(0, 0)
header.BackgroundTransparency = 1
header.Parent = panel

local title = Instance.new("TextLabel")
title.Name = "Title"
title.Size = UDim2.fromScale(0.5, 1)
title.Position = UDim2.fromScale(0.03, 0)
title.BackgroundTransparency = 1
title.Font = Enum.Font.GothamBlack
title.Text = "DAILY REWARDS"
title.TextColor3 = Color3.fromRGB(255, 214, 92)
title.TextScaled = true
title.TextXAlignment = Enum.TextXAlignment.Left
title.Parent = header

local streak = Instance.new("TextLabel")
streak.Name = "StreakCounter"
streak.Size = UDim2.fromScale(0.42, 1)
streak.Position = UDim2.fromScale(0.55, 0)
streak.BackgroundTransparency = 1
streak.Font = Enum.Font.GothamBold
streak.Text = "🔥 4-Day Streak — don't break it!"
streak.TextColor3 = Color3.fromRGB(255, 140, 90)
streak.TextScaled = true
streak.TextXAlignment = Enum.TextXAlignment.Right
streak.Parent = header

-- Countdown timer strip
local countdown = Instance.new("TextLabel")
countdown.Name = "Countdown"
countdown.Size = UDim2.fromScale(0.94, 0.05)
countdown.Position = UDim2.fromScale(0.03, 0.17)
countdown.BackgroundColor3 = Color3.fromRGB(20, 24, 44)
countdown.Font = Enum.Font.GothamBold
countdown.Text = "Next reward unlocks in 07:42:18"
countdown.TextColor3 = Color3.fromRGB(160, 200, 255)
countdown.TextScaled = true
countdown.BorderSizePixel = 0
countdown.Parent = panel
Instance.new("UICorner", countdown).CornerRadius = UDim.new(0, 8)

-- Day strip: 7 equal tiles, one row, tall portrait (aspect 0.5)
local strip = Instance.new("Frame")
strip.Name = "DayStrip"
strip.Size = UDim2.fromScale(0.94, 0.52)
strip.Position = UDim2.fromScale(0.03, 0.25)
strip.BackgroundTransparency = 1
strip.Parent = panel

local layout = Instance.new("UIGridLayout")
layout.CellSize = UDim2.fromScale(1 / 7, 1)
layout.CellPadding = UDim2.fromScale(0.012, 0)
layout.FillDirection = Enum.FillDirection.Horizontal
layout.SortOrder = Enum.SortOrder.LayoutOrder
layout.Parent = strip

local dayData = {
	{ day = "Day 1", art = "💵", qty = "x250", state = "Claimed", chipColor = Color3.fromRGB(70, 80, 110), chipText = Color3.fromRGB(170, 180, 210), tileColor = Color3.fromRGB(38, 42, 68) },
	{ day = "Day 2", art = "💵", qty = "x400", state = "Claimed", chipColor = Color3.fromRGB(70, 80, 110), chipText = Color3.fromRGB(170, 180, 210), tileColor = Color3.fromRGB(38, 42, 68) },
	{ day = "Day 3", art = "🧰", qty = "x2", state = "Claimed", chipColor = Color3.fromRGB(70, 80, 110), chipText = Color3.fromRGB(170, 180, 210), tileColor = Color3.fromRGB(38, 42, 68) },
	{ day = "Day 4", art = "💎", qty = "x15", state = "Claimable", chipColor = Color3.fromRGB(90, 200, 120), chipText = Color3.fromRGB(12, 40, 20), tileColor = Color3.fromRGB(46, 56, 96), promoted = true },
	{ day = "Day 5", art = "⚙️", qty = "x3", state = "Locked", chipColor = Color3.fromRGB(50, 54, 80), chipText = Color3.fromRGB(140, 145, 175), tileColor = Color3.fromRGB(30, 34, 58) },
	{ day = "Day 6", art = "🎁", qty = "x1", state = "Locked", chipColor = Color3.fromRGB(50, 54, 80), chipText = Color3.fromRGB(140, 145, 175), tileColor = Color3.fromRGB(30, 34, 58) },
	{ day = "Day 7", art = "🏆", qty = "GRAND", state = "Locked", chipColor = Color3.fromRGB(50, 54, 80), chipText = Color3.fromRGB(140, 145, 175), tileColor = Color3.fromRGB(30, 34, 58) },
}

for i, data in ipairs(dayData) do
	local tile = Instance.new("Frame")
	tile.Name = data.day .. "Tile"
	tile.BackgroundColor3 = data.tileColor
	tile.BorderSizePixel = 0
	tile.LayoutOrder = i
	tile.Parent = strip
	Instance.new("UICorner", tile).CornerRadius = UDim.new(0, 10)

	if data.promoted then
		local s = Instance.new("UIStroke", tile)
		s.Color = Color3.fromRGB(255, 214, 92)
		s.Thickness = 3
	end

	local dayLabel = Instance.new("TextLabel")
	dayLabel.Name = "DayLabel"
	dayLabel.Size = UDim2.fromScale(1, 0.16)
	dayLabel.Position = UDim2.fromScale(0, 0.04)
	dayLabel.BackgroundTransparency = 1
	dayLabel.Font = Enum.Font.GothamBold
	dayLabel.Text = data.day
	dayLabel.TextColor3 = data.promoted and Color3.fromRGB(255, 214, 92) or Color3.fromRGB(200, 205, 235)
	dayLabel.TextScaled = true
	dayLabel.Parent = tile

	local art = Instance.new("TextLabel")
	art.Name = "RewardArt"
	art.Size = UDim2.fromScale(1, 0.42)
	art.Position = UDim2.fromScale(0, 0.22)
	art.BackgroundTransparency = 1
	art.Font = Enum.Font.GothamBlack
	art.Text = data.art
	art.TextColor3 = Color3.fromRGB(255, 255, 255)
	art.TextScaled = true
	art.Parent = tile

	local qty = Instance.new("TextLabel")
	qty.Name = "Quantity"
	qty.Size = UDim2.fromScale(1, 0.14)
	qty.Position = UDim2.fromScale(0, 0.66)
	qty.BackgroundTransparency = 1
	qty.Font = Enum.Font.GothamBold
	qty.Text = data.qty
	qty.TextColor3 = Color3.fromRGB(230, 235, 255)
	qty.TextScaled = true
	qty.Parent = tile

	local chip = Instance.new("TextLabel")
	chip.Name = "StateChip"
	chip.Size = UDim2.fromScale(0.86, 0.11)
	chip.Position = UDim2.fromScale(0.07, 0.85) -- chip touches bottom padding
	chip.BackgroundColor3 = data.chipColor
	chip.Font = Enum.Font.GothamBold
	chip.Text = data.state
	chip.TextColor3 = data.chipText
	chip.TextScaled = true
	chip.BorderSizePixel = 0
	chip.Parent = tile
	Instance.new("UICorner", chip).CornerRadius = UDim.new(0, 6)
end

-- Claim button
local claim = Instance.new("TextButton")
claim.Name = "ClaimButton"
claim.Size = UDim2.fromScale(0.94, 0.1)
claim.Position = UDim2.fromScale(0.03, 0.82)
claim.BackgroundColor3 = Color3.fromRGB(90, 200, 120)
claim.Font = Enum.Font.GothamBlack
claim.Text = "CLAIM DAY 4 — 15 GEMS"
claim.TextColor3 = Color3.fromRGB(12, 40, 20)
claim.TextScaled = true
claim.BorderSizePixel = 0
claim.Parent = panel
Instance.new("UICorner", claim).CornerRadius = UDim.new(0, 12)
local claimStroke = Instance.new("UIStroke", claim)
claimStroke.Color = Color3.fromRGB(160, 255, 190)
claimStroke.Thickness = 2

-- Close button
local close = Instance.new("TextButton")
close.Name = "CloseButton"
close.Size = UDim2.fromScale(0.05, 0.06)
close.Position = UDim2.fromScale(0.93, 0.02)
close.BackgroundColor3 = Color3.fromRGB(60, 40, 60)
close.Font = Enum.Font.GothamBold
close.Text = "✕"
close.TextColor3 = Color3.fromRGB(255, 180, 180)
close.TextScaled = true
close.BorderSizePixel = 0
close.Parent = panel
Instance.new("UICorner", close).CornerRadius = UDim.new(0, 8)