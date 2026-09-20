local Players = game:GetService("Players")
local PolicyService = game:GetService("PolicyService")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local screenGui = Instance.new("ScreenGui")
screenGui.Name = "GachaScreen"
screenGui.ResetOnSpawn = false
screenGui.IgnoreGuiInset = true
screenGui.Parent = playerGui

local function make(className, props, parent)
	local inst = Instance.new(className)
	for k, v in pairs(props) do inst[k] = v end
	inst.Parent = parent
	return inst
end

local function corner(parent, radius)
	return make("UICorner", { CornerRadius = UDim.new(0, radius) }, parent)
end

-- Root dim
local dim = make("Frame", {
	Size = UDim2.fromScale(1, 1),
	BackgroundColor3 = Color3.fromRGB(12, 10, 24),
	BackgroundTransparency = 0.15,
	BorderSizePixel = 0,
}, screenGui)

-- Banner panel
local banner = make("Frame", {
	Size = UDim2.fromScale(0.62, 0.78),
	Position = UDim2.fromScale(0.19, 0.11),
	BackgroundColor3 = Color3.fromRGB(28, 24, 52),
	BorderSizePixel = 0,
}, dim)
corner(banner, 14)

make("TextLabel", {
	Size = UDim2.fromScale(0.9, 0.09),
	Position = UDim2.fromScale(0.05, 0.03),
	BackgroundTransparency = 1,
	Text = "CRYSTAL SUMMON — Solar Dragon Banner",
	TextColor3 = Color3.fromRGB(255, 214, 120),
	Font = Enum.Font.GothamBold,
	TextScaled = true,
	TextXAlignment = Enum.TextXAlignment.Left,
}, banner)

make("TextLabel", {
	Size = UDim2.fromScale(0.9, 0.05),
	Position = UDim2.fromScale(0.05, 0.115),
	BackgroundTransparency = 1,
	Text = "Event ends in 3 days · Pity: 42/80 guaranteed Legendary",
	TextColor3 = Color3.fromRGB(190, 185, 220),
	Font = Enum.Font.Gotham,
	TextScaled = true,
	TextXAlignment = Enum.TextXAlignment.Left,
}, banner)

-- Odds panel (drawn before the spend control)
local oddsPanel = make("Frame", {
	Size = UDim2.fromScale(0.42, 0.62),
	Position = UDim2.fromScale(0.05, 0.19),
	BackgroundColor3 = Color3.fromRGB(20, 17, 40),
	BorderSizePixel = 0,
}, banner)
corner(oddsPanel, 10)

local oddsOpen = make("TextButton", {
	Size = UDim2.fromScale(0.9, 0.08),
	Position = UDim2.fromScale(0.05, 0.02),
	BackgroundColor3 = Color3.fromRGB(46, 40, 84),
	Text = "INDEX — Drop Rates",
	TextColor3 = Color3.fromRGB(240, 235, 255),
	Font = Enum.Font.GothamBold,
	TextScaled = true,
	BorderSizePixel = 0,
}, oddsPanel)
corner(oddsOpen, 8)

local oddsList = make("ScrollingFrame", {
	Size = UDim2.fromScale(0.9, 0.86),
	Position = UDim2.fromScale(0.05, 0.12),
	BackgroundTransparency = 1,
	BorderSizePixel = 0,
	ScrollBarThickness = 4,
	CanvasSize = UDim2.fromScale(0, 2.2),
}, oddsPanel)
make("UIListLayout", { Padding = UDim.new(0, 4), SortOrder = Enum.SortOrder.LayoutOrder }, oddsList)

-- Rates: closed set summing to 100%, zero rows kept, luck buff + owned re-normalise applied
local luckActive = true          -- "Lucky Charm II" equipped: Mythic x2
local ownedExclusive = true      -- "Solar Dragon" already owned: re-normalise remainder

local baseRates = {
	{ name = "Mythic — Solar Dragon", pct = 0.5, color = Color3.fromRGB(255, 120, 200) },
	{ name = "Legendary — Frost Wyrm", pct = 4.5, color = Color3.fromRGB(255, 170, 60) },
	{ name = "Epic — Ember Golem", pct = 15.0, color = Color3.fromRGB(170, 120, 255) },
	{ name = "Rare — Stone Crab", pct = 30.0, color = Color3.fromRGB(80, 170, 255) },
	{ name = "Common — Pebble Slug", pct = 50.0, color = Color3.fromRGB(160, 160, 170) },
	{ name = "Common — Dust Mite", pct = 0.0, color = Color3.fromRGB(160, 160, 170) }, -- zero row kept
}

local total = 0
for _, r in ipairs(baseRates) do
	local pct = r.pct
	if luckActive and r.name:find("Mythic") then pct = pct * 2 end
	if ownedExclusive and r.name:find("Solar Dragon") then pct = 0 end
	r.eff = pct
	total = total + pct
end

for i, r in ipairs(baseRates) do
	local shown = (total > 0) and (r.eff / total * 100) or 0
	local row = make("Frame", {
		Size = UDim2.fromScale(1, 0.06),
		BackgroundColor3 = Color3.fromRGB(30, 26, 56),
		BorderSizePixel = 0,
		LayoutOrder = i,
	}, oddsList)
	corner(row, 6)
	make("TextLabel", {
		Size = UDim2.fromScale(0.68, 1),
		Position = UDim2.fromScale(0.03, 0),
		BackgroundTransparency = 1,
		Text = r.name,
		TextColor3 = r.color,
		Font = Enum.Font.Gotham,
		TextScaled = true,
		TextXAlignment = Enum.TextXAlignment.Left,
	}, row)
	make("TextLabel", {
		Size = UDim2.fromScale(0.26, 1),
		Position = UDim2.fromScale(0.71, 0),
		BackgroundTransparency = 1,
		Text = string.format("%.3f%%", shown),
		TextColor3 = Color3.fromRGB(240, 235, 255),
		Font = Enum.Font.GothamBold,
		TextScaled = true,
		TextXAlignment = Enum.TextXAlignment.Right,
	}, row)
end

make("TextLabel", {
	Size = UDim2.fromScale(0.9, 0.07),
	Position = UDim2.fromScale(0.05, 0.93),
	BackgroundTransparency = 1,
	Text = "Percentages rounded to 3 decimals; actual odds sum to exactly 100%.",
	TextColor3 = Color3.fromRGB(150, 145, 180),
	Font = Enum.Font.Gotham,
	TextScaled = true,
	TextXAlignment = Enum.TextXAlignment.Left,
}, oddsPanel)

-- Roll controls (right side)
local rollColumn = make("Frame", {
	Size = UDim2.fromScale(0.42, 0.62),
	Position = UDim2.fromScale(0.53, 0.19),
	BackgroundTransparency = 1,
}, banner)

local function rollButton(text, sub, yPos, costColor)
	local btn = make("TextButton", {
		Size = UDim2.fromScale(1, 0.26),
		Position = UDim2.fromScale(0, yPos),
		BackgroundColor3 = Color3.fromRGB(70, 50, 160),
		Text = "",
		BorderSizePixel = 0,
		AutoButtonColor = true,
	}, rollColumn)
	corner(btn, 10)
	make("TextLabel", {
		Size = UDim2.fromScale(0.9, 0.5),
		Position = UDim2.fromScale(0.05, 0.08),
		BackgroundTransparency = 1,
		Text = text,
		TextColor3 = Color3.fromRGB(255, 255, 255),
		Font = Enum.Font.GothamBold,
		TextScaled = true,
		TextXAlignment = Enum.TextXAlignment.Left,
	}, btn)
	make("TextLabel", {
		Size = UDim2.fromScale(0.9, 0.34),
		Position = UDim2.fromScale(0.05, 0.58),
		BackgroundTransparency = 1,
		Text = sub,
		TextColor3 = costColor,
		Font = Enum.Font.Gotham,
		TextScaled = true,
		TextXAlignment = Enum.TextXAlignment.Left,
	}, btn)
	return btn
end

-- PolicyService branch: REPLACE the purchase control, don't grey it
local success, policyInfo = pcall(function()
	return PolicyService:GetPolicyInfoForPlayerAsync(player)
end)
local paidRestricted = success and policyInfo
	and table.find(policyInfo.ArePaidRandomItemsRestricted, true) ~= nil

if paidRestricted then
	local blocked = make("Frame", {
		Size = UDim2.fromScale(1, 0.26),
		Position = UDim2.fromScale(0, 0.0),
		BackgroundColor3 = Color3.fromRGB(60, 40, 40),
		BorderSizePixel = 0,
	}, rollColumn)
	corner(blocked, 10)
	make("TextLabel", {
		Size = UDim2.fromScale(0.9, 0.8),
		Position = UDim2.fromScale(0.05, 0.1),
		BackgroundTransparency = 1,
		Text = "Sorry, paid summons are unavailable in your region. Earn Crystals free from the Daily Tycoon payout and roll with those instead.",
		TextColor3 = Color3.fromRGB(255, 200, 200),
		Font = Enum.Font.Gotham,
		TextScaled = true,
		TextWrapped = true,
	}, blocked)
else
	rollButton("SUMMON x1", "250 Crystals", 0.0, Color3.fromRGB(255, 214, 120))
end

-- Free earnable path always present
rollButton("FREE DAILY ROLL", "1 free roll · resets at tycoon payout", 0.32, Color3.fromRGB(140, 230, 160))
rollButton("SUMMON x10", "2,250 Crystals · 1 guaranteed Epic+", 0.64, Color3.fromRGB(255, 214, 120))

-- Reveal cutscene overlay (hidden until a roll resolves)
local reveal = make("Frame", {
	Size = UDim2.fromScale(1, 1),
	BackgroundColor3 = Color3.fromRGB(8, 6, 18),
	BackgroundTransparency = 1,
	Visible = false,
	BorderSizePixel = 0,
}, screenGui)

make("TextLabel", {
	Size = UDim2.fromScale(0.6, 0.12),
	Position = UDim2.fromScale(0.2, 0.38),
	BackgroundTransparency = 1,
	Text = "You pulled: EPIC — Ember Golem",
	TextColor3 = Color3.fromRGB(170, 120, 255),
	Font = Enum.Font.GothamBold,
	TextScaled = true,
}, reveal)

local skip = make("TextButton", {
	Size = UDim2.fromScale(0.16, 0.07),
	Position = UDim2.fromScale(0.82, 0.88),
	BackgroundColor3 = Color3.fromRGB(46, 40, 84),
	Text = "SKIP >>",
	TextColor3 = Color3.fromRGB(240, 235, 255),
	Font = Enum.Font.GothamBold,
	TextScaled = true,
	BorderSizePixel = 0,
}, reveal)
corner(skip, 8)

skip.MouseButton1Click:Connect(function()
	reveal.Visible = false
	reveal.BackgroundTransparency = 1
end)

-- Wire rolls to the reveal cutscene
local function doRoll()
	reveal.Visible = true
	reveal.BackgroundTransparency = 0.1
end
for _, child in ipairs(rollColumn:GetChildren()) do
	if child:IsA("TextButton") then
		child.MouseButton1Click:Connect(doRoll)
	end
end