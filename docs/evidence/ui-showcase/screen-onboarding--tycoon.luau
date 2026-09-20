-- Onboarding: first-run tutorial gate screen (tycoon)
local Players = game:GetService("Players")
local player = Players.LocalPlayer

local screenGui = Instance.new("ScreenGui")
screenGui.Name = "OnboardingGui"
screenGui.ResetOnSpawn = false
screenGui.IgnoreGuiInset = true
screenGui.Parent = player:WaitForChild("PlayerGui")

-- Dim backdrop
local dim = Instance.new("Frame")
dim.Name = "Dim"
dim.Size = UDim2.fromScale(1, 1)
dim.BackgroundColor3 = Color3.fromRGB(10, 12, 18)
dim.BackgroundTransparency = 0.35
dim.BorderSizePixel = 0
dim.Parent = screenGui

-- Welcome card
local card = Instance.new("Frame")
card.Name = "WelcomeCard"
card.AnchorPoint = Vector2.new(0.5, 0.5)
card.Position = UDim2.fromScale(0.5, 0.5)
card.Size = UDim2.fromScale(0.42, 0.62)
card.BackgroundColor3 = Color3.fromRGB(28, 32, 44)
card.BorderSizePixel = 0
card.Parent = screenGui

local cardCorner = Instance.new("UICorner")
cardCorner.CornerRadius = UDim.new(0, 14)
cardCorner.Parent = card

local cardStroke = Instance.new("UIStroke")
cardStroke.Color = Color3.fromRGB(255, 189, 46)
cardStroke.Thickness = 2
cardStroke.Parent = card

local title = Instance.new("TextLabel")
title.Name = "Title"
title.Size = UDim2.fromScale(1, 0.14)
title.Position = UDim2.fromScale(0, 0.05)
title.BackgroundTransparency = 1
title.Font = Enum.Font.GothamBold
title.TextSize = 30
title.TextColor3 = Color3.fromRGB(255, 189, 46)
title.Text = "Welcome to Diner Empire Tycoon!"
title.Parent = card

local subtitle = Instance.new("TextLabel")
subtitle.Name = "Subtitle"
subtitle.Size = UDim2.fromScale(0.9, 0.1)
subtitle.Position = UDim2.fromScale(0.05, 0.19)
subtitle.BackgroundTransparency = 1
subtitle.Font = Enum.Font.Gotham
subtitle.TextSize = 16
subtitle.TextColor3 = Color3.fromRGB(200, 205, 218)
subtitle.TextWrapped = true
subtitle.Text = "Build your diner from one empty lot into the busiest restaurant on the pier. Follow the checklist below to earn your Apron Badge."
subtitle.Parent = card

-- Checklist (uniform rows: step, state, reward aligned)
local checklist = Instance.new("Frame")
checklist.Name = "Checklist"
checklist.Size = UDim2.fromScale(0.9, 0.5)
checklist.Position = UDim2.fromScale(0.05, 0.32)
checklist.BackgroundColor3 = Color3.fromRGB(20, 24, 34)
checklist.BorderSizePixel = 0
checklist.Parent = card

local listCorner = Instance.new("UICorner")
listCorner.CornerRadius = UDim.new(0, 10)
listCorner.Parent = checklist

local listLayout = Instance.new("UIListLayout")
listLayout.Padding = UDim.new(0, 6)
listLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
listLayout.VerticalAlignment = Enum.VerticalAlignment.Center
listLayout.Parent = checklist

local steps = {
	{ name = "Collect your first $50 from the register", state = "DONE", color = Color3.fromRGB(90, 200, 120) },
	{ name = "Buy the Burger Grill from the Build Menu", state = "NOW", color = Color3.fromRGB(255, 189, 46) },
	{ name = "Hire your first cook at the Staff Desk", state = "LOCKED", color = Color3.fromRGB(120, 126, 142) },
	{ name = "Serve 10 customers to unlock the Drive-Thru", state = "LOCKED", color = Color3.fromRGB(120, 126, 142) },
	{ name = "Claim the Apron Badge and open the Pier", state = "LOCKED", color = Color3.fromRGB(120, 126, 142) },
}

for _, step in ipairs(steps) do
	local row = Instance.new("Frame")
	row.Name = step.state .. "Row"
	row.Size = UDim2.fromScale(0.94, 0.16)
	row.BackgroundColor3 = Color3.fromRGB(34, 39, 54)
	row.BorderSizePixel = 0
	row.Parent = checklist

	local rowCorner = Instance.new("UICorner")
	rowCorner.CornerRadius = UDim.new(0, 8)
	rowCorner.Parent = row

	local rowLabel = Instance.new("TextLabel")
	rowLabel.Name = "StepText"
	rowLabel.Size = UDim2.fromScale(0.78, 1)
	rowLabel.Position = UDim2.fromScale(0.03, 0)
	rowLabel.BackgroundTransparency = 1
	rowLabel.Font = Enum.Font.Gotham
	rowLabel.TextSize = 14
	rowLabel.TextXAlignment = Enum.TextXAlignment.Left
	rowLabel.TextColor3 = Color3.fromRGB(225, 228, 238)
	rowLabel.TextTruncate = Enum.TextTruncate.AtEnd
	rowLabel.Text = step.name
	rowLabel.Parent = row

	local stateLabel = Instance.new("TextLabel")
	stateLabel.Name = "StateText"
	stateLabel.Size = UDim2.fromScale(0.16, 1)
	stateLabel.Position = UDim2.fromScale(0.81, 0)
	stateLabel.BackgroundTransparency = 1
	stateLabel.Font = Enum.Font.GothamBold
	stateLabel.TextSize = 13
	stateLabel.TextColor3 = step.color
	stateLabel.Text = step.state
	stateLabel.Parent = row
end

-- Skip button: exits the tutorial WITHOUT awarding the completion badge
local skipBtn = Instance.new("TextButton")
skipBtn.Name = "SkipButton"
skipBtn.AnchorPoint = Vector2.new(0.5, 1)
skipBtn.Position = UDim2.fromScale(0.5, 0.94)
skipBtn.Size = UDim2.fromScale(0.9, 0.07)
skipBtn.BackgroundColor3 = Color3.fromRGB(52, 58, 76)
skipBtn.BorderSizePixel = 0
skipBtn.Font = Enum.Font.Gotham
skipBtn.TextSize = 15
skipBtn.TextColor3 = Color3.fromRGB(200, 205, 218)
skipBtn.Text = "Skip tutorial — you will NOT earn the Apron Badge"
skipBtn.Parent = card

local skipCorner = Instance.new("UICorner")
skipCorner.CornerRadius = UDim.new(0, 8)
skipCorner.Parent = skipBtn

-- Replay note (replay lives in Settings; badge only on full completion)
local replayNote = Instance.new("TextLabel")
replayNote.Name = "ReplayNote"
replayNote.Size = UDim2.fromScale(0.9, 0.05)
replayNote.Position = UDim2.fromScale(0.05, 0.85)
replayNote.BackgroundTransparency = 1
replayNote.Font = Enum.Font.Gotham
replayNote.TextSize = 12
replayNote.TextColor3 = Color3.fromRGB(140, 146, 164)
replayNote.Text = "You can replay this tutorial anytime from Settings > Tutorial."
replayNote.Parent = card

-- Spotlight prompt: contextual just-in-time hint for the current step
local spotlight = Instance.new("Frame")
spotlight.Name = "SpotlightPrompt"
spotlight.AnchorPoint = Vector2.new(0.5, 0)
spotlight.Position = UDim2.fromScale(0.5, 0.06)
spotlight.Size = UDim2.fromScale(0.34, 0.09)
spotlight.BackgroundColor3 = Color3.fromRGB(255, 189, 46)
spotlight.BorderSizePixel = 0
spotlight.Parent = screenGui

local spotCorner = Instance.new("UICorner")
spotCorner.CornerRadius = UDim.new(0, 10)
spotCorner.Parent = spotlight

local spotText = Instance.new("TextLabel")
spotText.Name = "PromptText"
spotText.Size = UDim2.fromScale(0.92, 0.8)
spotText.Position = UDim2.fromScale(0.04, 0.1)
spotText.BackgroundTransparency = 1
spotText.Font = Enum.Font.GothamBold
spotText.TextSize = 15
spotText.TextColor3 = Color3.fromRGB(28, 32, 44)
spotText.TextWrapped = true
spotText.Text = "Walk to the glowing Build Menu and buy the Burger Grill — $50"
spotText.Parent = spotlight

-- Completion toast (fires only when the final step is actually completed, never on skip)
local toast = Instance.new("Frame")
toast.Name = "CompletionToast"
toast.AnchorPoint = Vector2.new(0.5, 1)
toast.Position = UDim2.fromScale(0.5, 0.96)
toast.Size = UDim2.fromScale(0.3, 0.07)
toast.BackgroundColor3 = Color3.fromRGB(90, 200, 120)
toast.BorderSizePixel = 0
toast.Visible = false
toast.Parent = screenGui

local toastCorner = Instance.new("UICorner")
toastCorner.CornerRadius = UDim.new(0, 10)
toastCorner.Parent = toast

local toastText = Instance.new("TextLabel")
toastText.Name = "ToastText"
toastText.Size = UDim2.fromScale(1, 1)
toastText.BackgroundTransparency = 1
toastText.Font = Enum.Font.GothamBold
toastText.TextSize = 16
toastText.TextColor3 = Color3.fromRGB(16, 40, 24)
toastText.Text = "Apron Badge earned! The Pier is now open."
toastText.Parent = toast