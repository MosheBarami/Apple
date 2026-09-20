-- Trade screen — Tycoon trading hub
local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local player = Players.LocalPlayer

local gui = Instance.new("ScreenGui")
gui.Name = "TradeScreen"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.Parent = player:WaitForChild("PlayerGui")

local function base(props, parent)
	local f = Instance.new("Frame")
	f.BackgroundColor3 = Color3.fromRGB(28, 30, 38)
	f.BorderSizePixel = 0
	for k, v in pairs(props) do f[k] = v end
	f.Parent = parent
	return f
end

local function label(props, parent)
	local t = Instance.new("TextLabel")
	t.BackgroundTransparency = 1
	t.Font = Enum.Font.GothamBold
	t.TextColor3 = Color3.fromRGB(235, 235, 240)
	t.TextSize = 16
	for k, v in pairs(props) do t[k] = v end
	t.Parent = parent
	return t
end

local function button(props, parent)
	local b = Instance.new("TextButton")
	b.AutoButtonColor = true
	b.Font = Enum.Font.GothamBold
	b.TextColor3 = Color3.fromRGB(255, 255, 255)
	b.TextSize = 16
	b.BorderSizePixel = 0
	for k, v in pairs(props) do b[k] = v end
	b.Parent = parent
	return b
end

-- Root
local root = base({
	Size = UDim2.fromScale(0.62, 0.78),
	Position = UDim2.fromScale(0.19, 0.11),
}, gui)
Instance.new("UICorner", root).CornerRadius = UDim.new(0, 10)

-- Header
label({
	Size = UDim2.fromScale(1, 0.07),
	Text = "TRADE  —  with  BloxBaron99",
	TextSize = 22,
}, root)

-- Two-sided offer windows
local function offerPanel(xSide, titleText)
	local p = base({
		Size = UDim2.fromScale(0.46, 0.52),
		Position = UDim2.fromScale(xSide, 0.09),
		BackgroundColor3 = Color3.fromRGB(36, 39, 50),
	}, root)
	Instance.new("UICorner", p).CornerRadius = UDim.new(0, 8)
	label({
		Size = UDim2.fromScale(1, 0.14),
		Text = titleText,
		TextSize = 18,
	}, p)
	local value = label({
		Size = UDim2.fromScale(1, 0.09),
		Position = UDim2.fromScale(0, 0.14),
		Text = "Offer value: $0",
		TextColor3 = Color3.fromRGB(120, 220, 140),
		TextSize = 15,
	}, p)
	local list = Instance.new("ScrollingFrame")
	list.BackgroundColor3 = Color3.fromRGB(24, 26, 33)
	list.BorderSizePixel = 0
	list.Size = UDim2.fromScale(0.92, 0.68)
	list.Position = UDim2.fromScale(0.04, 0.26)
	list.ScrollBarThickness = 4
	list.CanvasSize = UDim2.new(0, 0, 0, 0)
	list.Parent = p
	local layout = Instance.new("UIListLayout", list)
	layout.Padding = UDim.new(0, 4)
	return p, value, list
end

local myPanel, myValue, myList = offerPanel(0.02, "YOUR OFFER")
local theirPanel, theirValue, theirList = offerPanel(0.52, "BLOXBARON99'S OFFER")

-- Sample offer rows (real strings)
local myItems = { {"Golden Drill", "$12,400"}, {"Crate of Steel Beams x40", "$3,200"}, {"Cash Payout", "$8,000"} }
local theirItems = { {"Oil Refinery Deed", "$18,000"}, {"Cash Payout", "$5,600"} }

local function fillRows(listFrame, items)
	for _, it in ipairs(items) do
		local row = base({
			Size = UDim2.new(1, 0, 0, 30),
			BackgroundColor3 = Color3.fromRGB(44, 48, 60),
		}, listFrame)
		Instance.new("UICorner", row).CornerRadius = UDim.new(0, 6)
		label({
			Size = UDim2.fromScale(0.62, 1),
			Position = UDim2.fromScale(0.04, 0),
			Text = it[1],
			TextXAlignment = Enum.TextXAlignment.Left,
			TextSize = 14,
		}, row)
		label({
			Size = UDim2.fromScale(0.3, 1),
			Position = UDim2.fromScale(0.66, 0),
			Text = it[2],
			TextXAlignment = Enum.TextXAlignment.Right,
			TextColor3 = Color3.fromRGB(120, 220, 140),
			TextSize = 14,
		}, row)
	end
end
fillRows(myList, myItems)
fillRows(theirList, theirItems)
myValue.Text = "Offer value: $23,600"
theirValue.Text = "Offer value: $23,600"

-- Unbalanced-refusal readout
local balance = label({
	Size = UDim2.fromScale(1, 0.05),
	Position = UDim2.fromScale(0, 0.63),
	Text = "Trade is balanced — both sides within $500.",
	TextColor3 = Color3.fromRGB(120, 220, 140),
	TextSize = 15,
}, root)

-- Scam-prevention lock strip
local lockStrip = base({
	Size = UDim2.fromScale(1, 0.05),
	Position = UDim2.fromScale(0, 0.69),
	BackgroundColor3 = Color3.fromRGB(60, 48, 24),
}, root)
Instance.new("UICorner", lockStrip).CornerRadius = UDim.new(0, 6)
label({
	Size = UDim2.fromScale(1, 1),
	Text = "🔒 LOCKED: contents changed — timer reset. Read both sides again before accepting.",
	TextColor3 = Color3.fromRGB(240, 200, 110),
	TextSize = 14,
}, lockStrip)

-- Countdown that BECOMES the accept control (bottom-right, per rule 0)
local countdown = button({
	Size = UDim2.fromScale(0.22, 0.09),
	Position = UDim2.fromScale(0.76, 0.88),
	Text = "5",
	BackgroundColor3 = Color3.fromRGB(90, 70, 40),
}, root)
Instance.new("UICorner", countdown).CornerRadius = UDim.new(0, 8)

-- Decline sits bottom-LEFT — far from the confirm zone (rule 4)
local decline = button({
	Size = UDim2.fromScale(0.18, 0.09),
	Position = UDim2.fromScale(0.02, 0.88),
	Text = "Decline Trade",
	BackgroundColor3 = Color3.fromRGB(150, 60, 60),
}, root)
Instance.new("UICorner", decline).CornerRadius = UDim.new(0, 8)

-- First confirm surface: mid-left strip, nowhere near the countdown/decline cluster
local confirm1 = button({
	Size = UDim2.fromScale(0.3, 0.09),
	Position = UDim2.fromScale(0.24, 0.88),
	Text = "Accept Offer",
	BackgroundColor3 = Color3.fromRGB(60, 110, 70),
	Visible = false,
}, root)
Instance.new("UICorner", confirm1).CornerRadius = UDim.new(0, 8)

-- Second confirm: a DIFFERENT surface — centered modal, costs a glance
local confirmModal = base({
	Size = UDim2.fromScale(0.4, 0.3),
	Position = UDim2.fromScale(0.3, 0.35),
	BackgroundColor3 = Color3.fromRGB(40, 44, 56),
	Visible = false,
	ZIndex = 5,
}, gui)
Instance.new("UICorner", confirmModal).CornerRadius = UDim.new(0, 10)
label({
	Size = UDim2.fromScale(1, 0.4),
	Position = UDim2.fromScale(0, 0.08),
	Text = "Final check — read both offers.\nAccept this trade with BloxBaron99?",
	TextSize = 17,
	ZIndex = 6,
}, confirmModal)
local confirm2 = button({
	Size = UDim2.fromScale(0.4, 0.22),
	Position = UDim2.fromScale(0.06, 0.6),
	Text = "Yes, Confirm Trade",
	BackgroundColor3 = Color3.fromRGB(70, 160, 90),
	ZIndex = 6,
}, confirmModal)
Instance.new("UICorner", confirm2).CornerRadius = UDim.new(0, 8)
local cancel2 = button({
	Size = UDim2.fromScale(0.4, 0.22),
	Position = UDim2.fromScale(0.54, 0.6),
	Text = "Go Back",
	BackgroundColor3 = Color3.fromRGB(90, 90, 100),
	ZIndex = 6,
}, confirmModal)
Instance.new("UICorner", cancel2).CornerRadius = UDim.new(0, 8)

-- Decline confirm: its own are-you-sure surface (rule 3)
local declineModal = base({
	Size = UDim2.fromScale(0.4, 0.26),
	Position = UDim2.fromScale(0.3, 0.37),
	BackgroundColor3 = Color3.fromRGB(40, 44, 56),
	Visible = false,
	ZIndex = 5,
}, gui)
Instance.new("UICorner", declineModal).CornerRadius = UDim.new(0, 10)
label({
	Size = UDim2.fromScale(1, 0.4),
	Position = UDim2.fromScale(0, 0.1),
	Text = "Decline this trade?\nThe negotiation will be filed under Inactive.",
	TextSize = 17,
	ZIndex = 6,
}, declineModal)
local declineYes = button({
	Size = UDim2.fromScale(0.4, 0.24),
	Position = UDim2.fromScale(0.06, 0.62),
	Text = "Yes, Decline",
	BackgroundColor3 = Color3.fromRGB(160, 70, 70),
	ZIndex = 6,
}, declineModal)
Instance.new("UICorner", declineYes).CornerRadius = UDim.new(0, 8)
local declineNo = button({
	Size = UDim2.fromScale(0.4, 0.24),
	Position = UDim2.fromScale(0.54, 0.62),
	Text = "Keep Trading",
	BackgroundColor3 = Color3.fromRGB(90, 90, 100),
	ZIndex = 6,
}, declineModal)
Instance.new("UICorner", declineNo).CornerRadius = UDim.new(0, 8)

-- Trade history strip (right rail)
local history = base({
	Size = UDim2.fromScale(0.17, 0.78),
	Position = UDim2.fromScale(0.82, 0.11),
	BackgroundColor3 = Color3.fromRGB(24, 26, 33),
}, gui)
Instance.new("UICorner", history).CornerRadius = UDim.new(0, 10)
label({
	Size = UDim2.fromScale(1, 0.06),
	Text = "Trade History",
	TextSize = 15,
}, history)
local histList = Instance.new("ScrollingFrame")
histList.BackgroundColor3 = Color3.fromRGB(24, 26, 33)
histList.BorderSizePixel = 0
histList.Size = UDim2.fromScale(0.9, 0.9)
histList.Position = UDim2.fromScale(0.05, 0.08)
histList.ScrollBarThickness = 4
histList.Parent = history
Instance.new("UIListLayout", histList).Padding = UDim.new(0, 4)
local historyRows = {
	{"Completed", "Sold Oil Derrick to MineKing42 — $31,000", Color3.fromRGB(120, 220, 140)},
	{"Completed", "Bought Steel Mill from BloxBaron99 — $22,500", Color3.fromRGB(120, 220, 140)},
	{"Declined", "Refused CashDrop's offer — under value", Color3.fromRGB(230, 130, 130)},
	{"Expired", "Offer to TycoonTy timed out", Color3.fromRGB(200, 180, 120)},
}
for _, h in ipairs(historyRows) do
	local row = base({
		Size = UDim2.new(1, 0, 0, 44),
		BackgroundColor3 = Color3.fromRGB(36, 39, 50),
	}, histList)
	Instance.new("UICorner", row).CornerRadius = UDim.new(0, 6)
	label({
		Size = UDim2.fromScale(1, 0.4),
		Position = UDim2.fromScale(0.06, 0.05),
		Text = h[1],
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = h[3],
		TextSize = 13,
	}, row)
	label({
		Size = UDim2.fromScale(1, 0.5),
		Position = UDim2.fromScale(0.06, 0.45),
		Text = h[2],
		TextXAlignment = Enum.TextXAlignment.Left,
		TextSize = 12,
	}, row)
end

-- Escrowed listing note
label({
	Size = UDim2.fromScale(0.46, 0.04),
	Position = UDim2.fromScale(0.02, 0.79),
	Text = "Escrow: your Golden Drill is held by the Trade Vault until both sides confirm.",
	TextColor3 = Color3.fromRGB(160, 170, 190),
	TextSize = 13,
}, root)

-- Timer / state machine (built once, driven by events only — no loops)
local secondsLeft = 5
local timerToken = 0
local countdownLabel = countdown

local function resetTimer(hard)
	-- Rule 1: reset on every change; removals reset hardest (full 5, additions get 3)
	secondsLeft = hard and 5 or 3
	timerToken += 1
	countdownLabel.Text = tostring(secondsLeft)
	countdownLabel.BackgroundColor3 = Color3.fromRGB(90, 70, 40)
	confirm1.Visible = false
	lockStrip.Visible = true
end

local function tick()
	local token = timerToken
	task.delay(1, function()
		if token ~= timerToken then return end
		secondsLeft -= 1
		if secondsLeft > 0 then
			countdownLabel.Text = tostring(secondsLeft)
			tick()
		else
			-- Countdown BECOMES the accept control
			countdownLabel.Text = "ACCEPT"
			countdownLabel.BackgroundColor3 = Color3.fromRGB(70, 160, 90)
			lockStrip.Visible = false
		end
	end)
end

-- Simulated content change to demonstrate the reset rule (one-shot, not a loop)
task.delay(4, function()
	resetTimer(true) -- hardest reset: a removal happened
	balance.Text = "Trade UNBALANCED — their side dropped $3,200. Refusing until re-read."
	balance.TextColor3 = Color3.fromRGB(230, 130, 130)
end)
tick()

-- Confirm-twice flow (rule 2): countdown/accept surface -> mid strip -> modal
countdownLabel.MouseButton1Click:Connect(function()
	if countdownLabel.Text == "ACCEPT" then
		confirm1.Visible = true
		confirm1.Text = "Accept Offer — press again to review"
	end
end)
confirm1.MouseButton1Click:Connect(function()
	confirmModal.Visible = true
end)
confirm2.MouseButton1Click:Connect(function()
	confirmModal.Visible = false
	confirm1.Visible = false
	balance.Text = "Trade accepted — escrow releasing items to both parties."
	balance.TextColor3 = Color3.fromRGB(120, 220, 140)
end)
cancel2.MouseButton1Click:Connect(function()
	confirmModal.Visible = false
	resetTimer(true)
end)

-- Decline confirm flow (rule 3)
decline.MouseButton1Click:Connect(function()
	declineModal.Visible = true
end)
declineYes.MouseButton1Click:Connect(function()
	declineModal.Visible = false
	balance.Text = "Trade declined and filed under Inactive."
	balance.TextColor3 = Color3.fromRGB(230, 130, 130)
end)
declineNo.MouseButton1Click:Connect(function()
	declineModal.Visible = false
end)