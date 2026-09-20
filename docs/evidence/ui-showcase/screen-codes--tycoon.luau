-- Codes redemption screen (tycoon genre kit + screen-codes construction)
local Players = game:GetService("Players")
local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local function make(className, props, parent)
	local inst = Instance.new(className)
	for k, v in pairs(props) do
		inst[k] = v
	end
	inst.Parent = parent
	return inst
end

local screenGui = make("ScreenGui", {
	Name = "CodesScreen",
	ResetOnSpawn = false,
	IgnoreGuiInset = true,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
	DisplayOrder = 50,
}, playerGui)

-- Panel exclusivity: opening codes closes any other open panel
for _, other in ipairs(playerGui:GetChildren()) do
	if other:IsA("ScreenGui") and other.Name:match("Panel$") and other.Enabled then
		other.Enabled = false
	end
end

-- ===== Launcher rail (left edge) =====
local rail = make("Frame", {
	Name = "LauncherRail",
	AnchorPoint = Vector2.new(0, 0.5),
	Position = UDim2.new(0, 0, 0.5, 0),
	Size = UDim2.new(0.055, 0, 0.42, 0),
	BackgroundColor3 = Color3.fromRGB(28, 30, 38),
	BackgroundTransparency = 0.15,
}, screenGui)
make("UICorner", { CornerRadius = UDim.new(0, 12) }, rail)
make("UIStroke", { Color = Color3.fromRGB(70, 74, 90), Thickness = 2 }, rail)
make("UIListLayout", {
	Padding = UDim.new(0.06, 0),
	HorizontalAlignment = Enum.HorizontalAlignment.Center,
	VerticalAlignment = Enum.VerticalAlignment.Center,
	SortOrder = Enum.SortOrder.LayoutOrder,
}, rail)

local codesButton = make("TextButton", {
	Name = "CodesButton",
	Size = UDim2.new(0.78, 0, 0, 0),
	AspectRatio = 1,
	BackgroundColor3 = Color3.fromRGB(46, 50, 64),
	Text = "🎁",
	TextSize = 22,
	TextColor3 = Color3.fromRGB(255, 214, 102),
	LayoutOrder = 1,
}, rail)
make("UICorner", { CornerRadius = UDim.new(1, 0) }, codesButton)
make("UIStroke", { Color = Color3.fromRGB(255, 214, 102), Thickness = 2 }, codesButton)

-- ===== Codes panel =====
local panel = make("Frame", {
	Name = "CodesPanel",
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.new(0.5, 0, 0.5, 0),
	Size = UDim2.new(0.34, 0, 0.26, 0),
	BackgroundColor3 = Color3.fromRGB(24, 26, 34),
	Visible = false,
}, screenGui)
make("UICorner", { CornerRadius = UDim.new(0, 14) }, panel)
make("UIStroke", { Color = Color3.fromRGB(255, 214, 102), Thickness = 2 }, panel)

-- Title
make("TextLabel", {
	Name = "Title",
	Position = UDim2.new(0, 0, 0.06, 0),
	Size = UDim2.new(1, 0, 0.2, 0),
	BackgroundTransparency = 1,
	Text = "Redeem a Code",
	TextColor3 = Color3.fromRGB(255, 214, 102),
	TextSize = 26,
	Font = Enum.Font.GothamBold,
}, panel)

-- One line of instruction
make("TextLabel", {
	Name = "Instruction",
	Position = UDim2.new(0, 0, 0.28, 0),
	Size = UDim2.new(1, 0, 0.14, 0),
	BackgroundTransparency = 1,
	Text = "Type a code below and press Redeem to claim your reward.",
	TextColor3 = Color3.fromRGB(200, 204, 218),
	TextSize = 15,
	Font = Enum.Font.Gotham,
}, panel)

-- One TextBox
local codeBox = make("TextBox", {
	Name = "CodeInput",
	Position = UDim2.new(0.1, 0, 0.48, 0),
	Size = UDim2.new(0.8, 0, 0.2, 0),
	BackgroundColor3 = Color3.fromRGB(38, 42, 54),
	PlaceholderText = "Enter code here...",
	PlaceholderColor3 = Color3.fromRGB(130, 134, 150),
	Text = "",
	TextColor3 = Color3.fromRGB(255, 255, 255),
	TextSize = 18,
	Font = Enum.Font.Gotham,
	ClearTextOnFocus = false,
}, panel)
make("UICorner", { CornerRadius = UDim.new(0, 8) }, codeBox)
make("UIStroke", { Color = Color3.fromRGB(70, 74, 90), Thickness = 2 }, codeBox)

-- One confirm button
local redeemButton = make("TextButton", {
	Name = "RedeemButton",
	Position = UDim2.new(0.25, 0, 0.74, 0),
	Size = UDim2.new(0.5, 0, 0.18, 0),
	BackgroundColor3 = Color3.fromRGB(88, 178, 92),
	Text = "Redeem",
	TextColor3 = Color3.fromRGB(255, 255, 255),
	TextSize = 20,
	Font = Enum.Font.GothamBold,
}, panel)
make("UICorner", { CornerRadius = UDim.new(0, 8) }, redeemButton)

-- One close control
local closeButton = make("TextButton", {
	Name = "CloseButton",
	AnchorPoint = Vector2.new(1, 0),
	Position = UDim2.new(1, -8, 0.06, 0),
	Size = UDim2.new(0.14, 0, 0.14, 0),
	BackgroundColor3 = Color3.fromRGB(200, 62, 62),
	Text = "✕",
	TextColor3 = Color3.fromRGB(255, 255, 255),
	TextSize = 18,
	Font = Enum.Font.GothamBold,
}, panel)
make("UICorner", { CornerRadius = UDim.new(1, 0) }, closeButton)

-- Feedback label (what the game says back)
local feedback = make("TextLabel", {
	Name = "Feedback",
	Position = UDim2.new(0, 0, 0.94, 0),
	Size = UDim2.new(1, 0, 0.06, 0),
	BackgroundTransparency = 1,
	Text = "",
	TextColor3 = Color3.fromRGB(120, 220, 130),
	TextSize = 14,
	Font = Enum.Font.Gotham,
}, panel)

-- ===== Wiring (no loops, no RunService) =====
local codes = {
	["WELCOME2TYCOON"] = "+$500 starting cash",
	["DROPSHIP50"] = "+50 drop bonus",
	["PLOTUPGRADE"] = "free plot upgrade",
}

local function setFeedback(text, good)
	feedback.Text = text
	feedback.TextColor3 = good and Color3.fromRGB(120, 220, 130) or Color3.fromRGB(240, 120, 120)
end

codesButton.MouseButton1Click:Connect(function()
	panel.Visible = true
	codeBox.Text = ""
	setFeedback("", true)
end)

closeButton.MouseButton1Click:Connect(function()
	panel.Visible = false
end)

redeemButton.MouseButton1Click:Connect(function()
	local entered = codeBox.Text:upper():gsub("%s+", "")
	if entered == "" then
		setFeedback("Type a code first.", false)
	elseif codes[entered] then
		setFeedback("Code redeemed! " .. codes[entered], true)
		codeBox.Text = ""
	else
		setFeedback("That code is invalid or expired.", false)
	end
end)