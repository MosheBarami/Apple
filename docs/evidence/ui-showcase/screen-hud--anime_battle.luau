local Players = game:GetService("Players")
local StarterGui = game:GetService("StarterGui")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Health, false)

local screenGui = Instance.new("ScreenGui")
screenGui.Name = "AnimeBattleHUD"
screenGui.ResetOnSpawn = false
screenGui.IgnoreGuiInset = true
screenGui.Parent = playerGui

local function corner(parent, radius)
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0, radius)
	c.Parent = parent
	return c
end

local function stroke(parent, thickness, color)
	local s = Instance.new("UIStroke")
	s.Thickness = thickness
	s.Color = color
	s.Parent = parent
	return s
end

local function label(parent, text, size, pos, textColor, textSize)
	local t = Instance.new("TextLabel")
	t.BackgroundTransparency = 1
	t.Size = size
	t.Position = pos
	t.Text = text
	t.TextColor3 = textColor
	t.TextSize = textSize
	t.Font = Enum.Font.GothamBold
	t.Parent = parent
	return t
end

-- ============ TOP-CENTRE BAND: boss / target frame ============
local targetFrame = Instance.new("Frame")
targetFrame.Name = "TargetFrame"
targetFrame.AnchorPoint = Vector2.new(0.5, 0)
targetFrame.Position = UDim2.new(0.5, 0, 0, 44)
targetFrame.Size = UDim2.new(0.34, 0, 0, 58)
targetFrame.BackgroundColor3 = Color3.fromRGB(18, 14, 26)
targetFrame.BackgroundTransparency = 0.15
targetFrame.BorderSizePixel = 0
targetFrame.Parent = screenGui
corner(targetFrame, 8)
stroke(targetFrame, 2, Color3.fromRGB(120, 40, 60))

label(targetFrame, "Shogun of the Ashen Peak", UDim2.new(1, -16, 0, 20), UDim2.new(0, 8, 0, 4), Color3.fromRGB(255, 220, 220), 15)

local targetHpBack = Instance.new("Frame")
targetHpBack.Name = "TargetHpBack"
targetHpBack.Position = UDim2.new(0, 8, 0, 30)
targetHpBack.Size = UDim2.new(1, -16, 0, 16)
targetHpBack.BackgroundColor3 = Color3.fromRGB(45, 20, 28)
targetHpBack.BorderSizePixel = 0
targetHpBack.Parent = targetFrame
corner(targetHpBack, 4)

local targetHpFill = Instance.new("Frame")
targetHpFill.Name = "TargetHpFill"
targetHpFill.Size = UDim2.new(0.72, 0, 1, 0)
targetHpFill.BackgroundColor3 = Color3.fromRGB(232, 57, 84)
targetHpFill.BorderSizePixel = 0
targetHpFill.Parent = targetHpBack
corner(targetHpFill, 4)

-- ============ LEFT EDGE: player vitals ============
local vitals = Instance.new("Frame")
vitals.Name = "PlayerVitals"
vitals.Position = UDim2.new(0, 12, 0, 0.5, 0)
vitals.Position = UDim2.new(0, 12, 0.42, 0)
vitals.Size = UDim2.new(0, 230, 0, 96)
vitals.BackgroundColor3 = Color3.fromRGB(16, 13, 24)
vitals.BackgroundTransparency = 0.2
vitals.BorderSizePixel = 0
vitals.Parent = screenGui
corner(vitals, 10)
stroke(vitals, 2, Color3.fromRGB(70, 90, 200))

label(vitals, "Kaito — Lv. 47 Ronin", UDim2.new(1, -16, 0, 18), UDim2.new(0, 8, 0, 4), Color3.fromRGB(235, 235, 255), 14)

local hpBack = Instance.new("Frame")
hpBack.Name = "HpBack"
hpBack.Position = UDim2.new(0, 8, 0, 28)
hpBack.Size = UDim2.new(1, -16, 0, 18)
hpBack.BackgroundColor3 = Color3.fromRGB(50, 22, 30)
hpBack.BorderSizePixel = 0
hpBack.Parent = vitals
corner(hpBack, 4)

local hpFill = Instance.new("Frame")
hpFill.Name = "HpFill"
hpFill.Size = UDim2.new(0.86, 0, 1, 0)
hpFill.BackgroundColor3 = Color3.fromRGB(64, 200, 120)
hpFill.BorderSizePixel = 0
hpFill.Parent = hpBack
corner(hpFill, 4)

label(hpFill, "8,600 / 10,000 HP", UDim2.new(1, -8, 1, 0), UDim2.new(0, 6, 0, 0), Color3.fromRGB(255, 255, 255), 12)

local kiBack = Instance.new("Frame")
kiBack.Name = "KiBack"
kiBack.Position = UDim2.new(0, 8, 0, 54)
kiBack.Size = UDim2.new(1, -16, 0, 14)
kiBack.BackgroundColor3 = Color3.fromRGB(24, 30, 55)
kiBack.BorderSizePixel = 0
kiBack.Parent = vitals
corner(kiBack, 4)

local kiFill = Instance.new("Frame")
kiFill.Name = "KiFill"
kiFill.Size = UDim2.new(0.55, 0, 1, 0)
kiFill.BackgroundColor3 = Color3.fromRGB(90, 160, 255)
kiFill.BorderSizePixel = 0
kiFill.Parent = kiBack
corner(kiFill, 4)

label(kiBack, "KI 550 / 1000", UDim2.new(1, -8, 1, 0), UDim2.new(0, 6, 0, 0), Color3.fromRGB(210, 228, 255), 11)

-- ============ LEFT EDGE BELOW VITALS: quest tracker ============
local questTracker = Instance.new("Frame")
questTracker.Name = "QuestTracker"
questTracker.Position = UDim2.new(0, 12, 0.42, 108)
questTracker.Size = UDim2.new(0, 230, 0, 92)
questTracker.BackgroundColor3 = Color3.fromRGB(16, 13, 24)
questTracker.BackgroundTransparency = 0.25
questTracker.BorderSizePixel = 0
questTracker.Parent = screenGui
corner(questTracker, 10)
stroke(questTracker, 2, Color3.fromRGB(200, 160, 60))

label(questTracker, "SWORD TRIAL", UDim2.new(1, -16, 0, 16), UDim2.new(0, 8, 0, 4), Color3.fromRGB(255, 214, 110), 13)
label(questTracker, "Defeat 12 Ashen Cultists", UDim2.new(1, -16, 0, 16), UDim2.new(0, 8, 0, 24), Color3.fromRGB(235, 235, 245), 13)
label(questTracker, "Progress: 7 / 12", UDim2.new(1, -16, 0, 16), UDim2.new(0, 8, 0, 42), Color3.fromRGB(170, 170, 190), 12)

local questBarBack = Instance.new("Frame")
questBarBack.Position = UDim2.new(0, 8, 0, 66)
questBarBack.Size = UDim2.new(1, -16, 0, 10)
questBarBack.BackgroundColor3 = Color3.fromRGB(40, 36, 30)
questBarBack.BorderSizePixel = 0
questBarBack.Parent = questTracker
corner(questBarBack, 3)

local questBarFill = Instance.new("Frame")
questBarFill.Size = UDim2.new(0.583, 0, 1, 0)
questBarFill.BackgroundColor3 = Color3.fromRGB(255, 196, 70)
questBarFill.BorderSizePixel = 0
questBarFill.Parent = questBarBack
corner(questBarFill, 3)

-- ============ MID-RIGHT: minimap ============
local minimap = Instance.new("Frame")
minimap.Name = "Minimap"
minimap.AnchorPoint = Vector2.new(1, 0)
minimap.Position = UDim2.new(1, -12, 0, 44)
minimap.Size = UDim2.new(0, 150, 0, 150)
minimap.BackgroundColor3 = Color3.fromRGB(20, 24, 34)
minimap.BorderSizePixel = 0
minimap.Parent = screenGui
corner(minimap, 10)
stroke(minimap, 2, Color3.fromRGB(90, 110, 180))

label(minimap, "Ashen Peak", UDim2.new(1, -12, 0, 16), UDim2.new(0, 6, 0, 2), Color3.fromRGB(220, 226, 255), 12)

local mapBlip = Instance.new("Frame")
mapBlip.Name = "PlayerBlip"
mapBlip.AnchorPoint = Vector2.new(0.5, 0.5)
mapBlip.Position = UDim2.new(0.62, 0, 0.58, 0)
mapBlip.Size = UDim2.new(0, 10, 0, 10)
mapBlip.BackgroundColor3 = Color3.fromRGB(90, 200, 255)
mapBlip.BorderSizePixel = 0
mapBlip.Parent = minimap
corner(mapBlip, 5)

local enemyBlip = Instance.new("Frame")
enemyBlip.Name = "EnemyBlip"
enemyBlip.AnchorPoint = Vector2.new(0.5, 0.5)
enemyBlip.Position = UDim2.new(0.35, 0, 0.75, 0)
enemyBlip.Size = UDim2.new(0, 8, 0, 8)
enemyBlip.BackgroundColor3 = Color3.fromRGB(232, 57, 84)
enemyBlip.BorderSizePixel = 0
enemyBlip.Parent = minimap
corner(enemyBlip, 4)

-- ============ TOP-CENTRE: currency pills ============
local currencyRow = Instance.new("Frame")
currencyRow.Name = "CurrencyRow"
currencyRow.AnchorPoint = Vector2.new(0.5, 0)
currencyRow.Position = UDim2.new(0.5, 0, 0, 110)
currencyRow.Size = UDim2.new(0, 320, 0, 30)
currencyRow.BackgroundTransparency = 1
currencyRow.Parent = screenGui

local list = Instance.new("UIListLayout")
list.FillDirection = Enum.FillDirection.Horizontal
list.HorizontalAlignment = Enum.HorizontalAlignment.Center
list.Padding = UDim.new(0, 8)
list.Parent = currencyRow

local function currencyPill(name, text, color)
	local pill = Instance.new("Frame")
	pill.Name = name
	pill.Size = UDim2.new(0, 100, 1, 0)
	pill.BackgroundColor3 = Color3.fromRGB(16, 13, 24)
	pill.BackgroundTransparency = 0.2
	pill.BorderSizePixel = 0
	pill.Parent = currencyRow
	corner(pill, 15)
	stroke(pill, 1, color)
	label(pill, text, UDim2.new(1, -10, 1, 0), UDim2.new(0, 5, 0, 0), color, 13)
	return pill
end

currencyPill("YenPill", "12,450 Yen", Color3.fromRGB(255, 214, 110))
currencyPill("GemPill", "328 Gems", Color3.fromRGB(140, 220, 255))
currencyPill("SpiritPill", "56 Spirit", Color3.fromRGB(200, 140, 255))

-- ============ BOTTOM-CENTRE: ability bar ============
local abilityBar = Instance.new("Frame")
abilityBar.Name = "AbilityBar"
abilityBar.AnchorPoint = Vector2.new(0.5, 1)
abilityBar.Position = UDim2.new(0.5, 0, 1, -14)
abilityBar.Size = UDim2.new(0, 420, 0, 62)
abilityBar.BackgroundTransparency = 1
abilityBar.Parent = screenGui

local abilityList = Instance.new("UIListLayout")
abilityList.FillDirection = Enum.FillDirection.Horizontal
abilityList.HorizontalAlignment = Enum.HorizontalAlignment.Center
abilityList.Padding = UDim.new(0, 10)
abilityList.Parent = abilityBar

local abilities = {
	{ "Q", "Crescent Slash", Color3.fromRGB(90, 160, 255) },
	{ "E", "Ember Fist", Color3.fromRGB(255, 130, 70) },
	{ "R", "Storm Step", Color3.fromRGB(120, 230, 180) },
	{ "F", "Awakened Aura", Color3.fromRGB(200, 140, 255) },
	{ "X", "Ultimate: Void Fang", Color3.fromRGB(255, 90, 120) },
}

for _, ab in ipairs(abilities) do
	local slot = Instance.new("Frame")
	slot.Name = "Ability_" .. ab[1]
	slot.Size = UDim2.new(0, 62, 1, 0)
	slot.BackgroundColor3 = Color3.fromRGB(16, 13, 24)
	slot.BackgroundTransparency = 0.15
	slot.BorderSizePixel = 0
	slot.Parent = abilityBar
	corner(slot, 10)
	stroke(slot, 2, ab[3])

	label(slot, ab[1], UDim2.new(1, 0, 0, 22), UDim2.new(0, 0, 0, 4), ab[3], 16)
	local nameLabel = Instance.new("TextLabel")
	nameLabel.BackgroundTransparency = 1
	nameLabel.Size = UDim2.new(1, -6, 0, 26)
	nameLabel.Position = UDim2.new(0, 3, 0, 28)
	nameLabel.Text = ab[2]
	nameLabel.TextColor3 = Color3.fromRGB(225, 225, 240)
	nameLabel.TextSize = 10
	nameLabel.TextWrapped = true
	nameLabel.Font = Enum.Font.Gotham
	nameLabel.Parent = slot
end

-- ============ TOP-CENTRE: toast ============
local toast = Instance.new("Frame")
toast.Name = "Toast"
toast.AnchorPoint = Vector2.new(0.5, 0)
toast.Position = UDim2.new(0.5, 0, 0, 150)
toast.Size = UDim2.new(0, 300, 0, 34)
toast.BackgroundColor3 = Color3.fromRGB(24, 40, 26)
toast.BackgroundTransparency = 0.1
toast.BorderSizePixel = 0
toast.Parent = screenGui
corner(toast, 8)
stroke(toast, 1, Color3.fromRGB(90, 220, 130))

label(toast, "+340 Yen — Ashen Cultist defeated", UDim2.new(1, -12, 1, 0), UDim2.new(0, 6, 0, 0), Color3.fromRGB(180, 255, 200), 13)