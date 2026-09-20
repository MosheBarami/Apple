local Players = game:GetService("Players")
local player = Players.LocalPlayer

local gui = Instance.new("ScreenGui")
gui.Name = "SeasonPassScreen"
gui.ResetOnSpawn = false
gui.Parent = player:WaitForChild("PlayerGui")

local root = Instance.new("Frame")
root.Name = "PassPanel"
root.Size = UDim2.new(0.88, 0, 0.48, 0)
root.Position = UDim2.new(0.06, 0, 0.26, 0)
root.BackgroundColor3 = Color3.fromRGB(28, 30, 38)
root.BorderSizePixel = 0
root.Parent = gui
Instance.new("UICorner", root).CornerRadius = UDim.new(0, 10)
local rootStroke = Instance.new("UIStroke", root)
rootStroke.Thickness = 2
rootStroke.Color = Color3.fromRGB(90, 96, 120)

-- HEADER
local header = Instance.new("Frame")
header.Name = "Header"
header.Size = UDim2.new(1, 0, 0.16, 0)
header.BackgroundColor3 = Color3.fromRGB(38, 41, 54)
header.BorderSizePixel = 0
header.Parent = root
Instance.new("UICorner", header).CornerRadius = UDim.new(0, 10)

local seasonTitle = Instance.new("TextLabel")
seasonTitle.Size = UDim2.new(0.3, 0, 1, 0)
seasonTitle.Position = UDim2.new(0.02, 0, 0, 0)
seasonTitle.BackgroundTransparency = 1
seasonTitle.TextColor3 = Color3.fromRGB(255, 214, 92)
seasonTitle.TextSize = 20
seasonTitle.Font = Enum.Font.GothamBold
seasonTitle.TextXAlignment = Enum.TextXAlignment.Left
seasonTitle.Text = "MINECRAFT MILLIONAIRE — SEASON 4: GOLD RUSH"
seasonTitle.Parent = header

local timer = Instance.new("TextLabel")
timer.Size = UDim2.new(0.22, 0, 1, 0)
timer.Position = UDim2.new(0.34, 0, 0, 0)
timer.BackgroundTransparency = 1
timer.TextColor3 = Color3.fromRGB(200, 205, 220)
timer.TextSize = 15
timer.Font = Enum.Font.Gotham
timer.Text = "Season ends in 12d 04h 31m"
timer.Parent = header

local xpReadout = Instance.new("TextLabel")
xpReadout.Size = UDim2.new(0.2, 0, 1, 0)
xpReadout.Position = UDim2.new(0.57, 0, 0, 0)
xpReadout.BackgroundTransparency = 1
xpReadout.TextColor3 = Color3.fromRGB(140, 230, 160)
xpReadout.TextSize = 15
xpReadout.Font = Enum.Font.GothamBold
xpReadout.Text = "Season XP: 7,450 / 10,000"
xpReadout.Parent = header

local closeBtn = Instance.new("TextButton")
closeBtn.Size = UDim2.new(0.05, 0, 0.7, 0)
closeBtn.Position = UDim2.new(0.93, 0, 0.15, 0)
closeBtn.BackgroundColor3 = Color3.fromRGB(200, 70, 70)
closeBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
closeBtn.TextSize = 16
closeBtn.Font = Enum.Font.GothamBold
closeBtn.Text = "X"
closeBtn.Parent = header
Instance.new("UICorner", closeBtn).CornerRadius = UDim.new(0, 6)

-- SCROLLING TRACK (shared x-axis: free lane, tier rail, premium lane)
local track = Instance.new("ScrollingFrame")
track.Name = "Track"
track.Size = UDim2.new(1, 0, 0.62, 0)
track.Position = UDim2.new(0, 0, 0.16, 0)
track.BackgroundTransparency = 1
track.ScrollBarThickness = 8
track.ScrollBarImageColor3 = Color3.fromRGB(255, 214, 92)
track.CanvasSize = UDim2.new(0, 0, 0, 0)
track.AutomaticCanvasSize = Enum.AutomaticSize.X
track.ScrollingDirection = Enum.ScrollingDirection.X
track.Parent = root

local TIER_COUNT = 10
local COL_W = 0.09

local function lane(ySize, yPos, name, label, color)
	local f = Instance.new("Frame")
	f.Name = name
	f.Size = UDim2.new(1, 0, ySize, 0)
	f.Position = UDim2.new(0, 0, yPos, 0)
	f.BackgroundColor3 = color
	f.BorderSizePixel = 0
	f.Parent = track
	local l = Instance.new("TextLabel")
	l.Size = UDim2.new(0.08, 0, 1, 0)
	l.BackgroundTransparency = 1
	l.TextColor3 = Color3.fromRGB(220, 224, 236)
	l.TextSize = 14
	l.Font = Enum.Font.GothamBold
	l.Text = label
	l.Parent = f
	return f
end

local freeLane = lane(0.42, 0, "FreeLane", "FREE", Color3.fromRGB(34, 38, 50))
local rail = lane(0.16, 0.42, "TierRail", "TIER", Color3.fromRGB(24, 26, 34))
local premiumLane = lane(0.42, 0.58, "PremiumLane", "PREMIUM", Color3.fromRGB(46, 40, 30))

local freeRewards = {
	"500 Cash", "Drill Skin", "1,000 Cash", "Conveyor Boost",
	"2,000 Cash", "Crate x3", "5,000 Cash", "Miner Pet",
	"8,000 Cash", "Factory Banner",
}
local premiumRewards = {
	"2,500 Cash", "Golden Drill", "5,000 Cash", "Auto-Seller",
	"10,000 Cash", "VIP Plot Sign", "20,000 Cash", "Diamond Pickaxe",
	"40,000 Cash", "Golden Tycoon Crown",
}
local tierStates = { -- per tier: freeState, premiumState
	{"claimed", "claimed"}, {"claimed", "locked"}, {"claimable", "locked"},
	{"claimable", "locked"}, {"locked", "locked"}, {"locked", "locked"},
	{"locked", "locked"}, {"locked", "locked"}, {"locked", "locked"}, {"locked", "locked"},
}
local stateColors = {
	claimed = Color3.fromRGB(60, 66, 60),
	claimable = Color3.fromRGB(70, 120, 80),
	locked = Color3.fromRGB(44, 47, 58),
}
local stateText = {
	claimed = Color3.fromRGB(150, 155, 150),
	claimable = Color3.fromRGB(230, 255, 230),
	locked = Color3.fromRGB(120, 125, 140),
}

local function makeNode(parent, i, label, isPremium)
	local state = tierStates[i][isPremium and 2 or 1]
	local b = Instance.new("TextButton")
	b.Name = "Tier" .. i .. (isPremium and "Premium" or "Free")
	b.Size = UDim2.new(COL_W, -6, 0.8, 0)
	b.Position = UDim2.new(0.08 + (i - 1) * COL_W, 3, 0.1, 0)
	b.BackgroundColor3 = stateColors[state]
	b.TextColor3 = stateText[state]
	b.TextSize = 12
	b.Font = Enum.Font.Gotham
	b.Text = label .. (state == "claimable" and "\nCLAIM" or state == "claimed" and "\n✓" or "\n🔒")
	b.AutoButtonColor = (state == "claimable")
	b.Parent = parent
	Instance.new("UICorner", b).CornerRadius = UDim.new(0, 6)
	local st = Instance.new("UIStroke", b)
	st.Thickness = 1
	st.Color = (state == "claimable") and Color3.fromRGB(140, 230, 160) or Color3.fromRGB(70, 74, 90)
end

for i = 1, TIER_COUNT do
	makeNode(freeLane, i, freeRewards[i], false)
	makeNode(premiumLane, i, premiumRewards[i], true)
	local tierLabel = Instance.new("TextLabel")
	tierLabel.Size = UDim2.new(COL_W, -6, 1, 0)
	tierLabel.Position = UDim2.new(0.08 + (i - 1) * COL_W, 3, 0, 0)
	tierLabel.BackgroundTransparency = 1
	tierLabel.TextColor3 = (i <= 3) and Color3.fromRGB(255, 214, 92) or Color3.fromRGB(160, 165, 180)
	tierLabel.TextSize = 14
	tierLabel.Font = Enum.Font.GothamBold
	tierLabel.Text = "Tier " .. i
	tierLabel.Parent = rail
end

-- FOOTER
local footer = Instance.new("Frame")
footer.Name = "Footer"
footer.Size = UDim2.new(1, 0, 0.22, 0)
footer.Position = UDim2.new(0, 0, 0.78, 0)
footer.BackgroundColor3 = Color3.fromRGB(38, 41, 54)
footer.BorderSizePixel = 0
footer.Parent = root
Instance.new("UICorner", footer).CornerRadius = UDim.new(0, 10)

local upsell = Instance.new("TextButton")
upsell.Name = "PremiumUpsell"
upsell.Size = UDim2.new(0.42, 0, 0.6, 0)
upsell.Position = UDim2.new(0.02, 0, 0.2, 0)
upsell.BackgroundColor3 = Color3.fromRGB(190, 140, 40)
upsell.TextColor3 = Color3.fromRGB(30, 24, 10)
upsell.TextSize = 15
upsell.Font = Enum.Font.GothamBold
upsell.Text = "UNLOCK PREMIUM TRACK — 799 Robux (10 extra rewards)"
upsell.Parent = footer
Instance.new("UICorner", upsell).CornerRadius = UDim.new(0, 8)

local confirm = Instance.new("Frame")
confirm.Name = "UpsellConfirm"
confirm.Visible = false
confirm.Size = UDim2.new(0.4, 0, 0.5, 0)
confirm.Position = UDim2.new(0.03, 0, 0.25, 0)
confirm.BackgroundColor3 = Color3.fromRGB(60, 50, 24)
confirm.BorderSizePixel = 0
confirm.Parent = footer
Instance.new("UICorner", confirm).CornerRadius = UDim.new(0, 8)
local confirmText = Instance.new("TextLabel")
confirmText.Size = UDim2.new(1, -10, 0.5, 0)
confirmText.Position = UDim2.new(0, 5, 0, 0)
confirmText.BackgroundTransparency = 1
confirmText.TextColor3 = Color3.fromRGB(255, 230, 170)
confirmText.TextSize = 12
confirmText.Font = Enum.Font.Gotham
confirmText.Text = "Buy Premium for 799 Robux?"
confirmText.Parent = confirm
local yesBtn = Instance.new("TextButton")
yesBtn.Size = UDim2.new(0.45, 0, 0.35, 0)
yesBtn.Position = UDim2.new(0.03, 0, 0.58, 0)
yesBtn.BackgroundColor3 = Color3.fromRGB(90, 170, 90)
yesBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
yesBtn.TextSize = 12
yesBtn.Font = Enum.Font.GothamBold
yesBtn.Text = "Buy"
yesBtn.Parent = confirm
Instance.new("UICorner", yesBtn).CornerRadius = UDim.new(0, 6)
local noBtn = Instance.new("TextButton")
noBtn.Size = UDim2.new(0.45, 0, 0.35, 0)
noBtn.Position = UDim2.new(0.52, 0, 0.58, 0)
noBtn.BackgroundColor3 = Color3.fromRGB(120, 70, 70)
noBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
noBtn.TextSize = 12
noBtn.Font = Enum.Font.GothamBold
noBtn.Text = "Cancel"
noBtn.Parent = confirm
Instance.new("UICorner", noBtn).CornerRadius = UDim.new(0, 6)

upsell.MouseButton1Click:Connect(function()
	confirm.Visible = not confirm.Visible
end)
noBtn.MouseButton1Click:Connect(function()
	confirm.Visible = false
end)

local missionsBtn = Instance.new("TextButton")
missionsBtn.Name = "MissionsButton"
missionsBtn.Size = UDim2.new(0.24, 0, 0.6, 0)
missionsBtn.Position = UDim2.new(0.74, 0, 0.2, 0)
missionsBtn.BackgroundColor3 = Color3.fromRGB(70, 76, 96)
missionsBtn.TextColor3 = Color3.fromRGB(230, 234, 246)
missionsBtn.TextSize = 14
missionsBtn.Font = Enum.Font.GothamBold
missionsBtn.Text = "Season Missions (3/5 done)"
missionsBtn.Parent = footer
Instance.new("UICorner", missionsBtn).CornerRadius = UDim.new(0, 8)

closeBtn.MouseButton1Click:Connect(function()
	gui.Enabled = false
end)