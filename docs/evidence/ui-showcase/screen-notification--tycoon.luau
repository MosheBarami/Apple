-- Notification kit for a tycoon game: toast stack (bottom-right, engine corner),
-- a server-wide banner (top), and a coloured chat-style announcement line.
local Players = game:GetService("Players")
local player = Players.LocalPlayer

local screenGui = Instance.new("ScreenGui")
screenGui.Name = "TycoonNotifications"
screenGui.ResetOnSpawn = false
screenGui.IgnoreGuiInset = true
screenGui.Parent = player:WaitForChild("PlayerGui")

-- ============ SERVER-WIDE BANNER (top center, whole-server news) ============
local banner = Instance.new("Frame")
banner.Name = "ServerBanner"
banner.AnchorPoint = Vector2.new(0.5, 0)
banner.Position = UDim2.new(0.5, 0, 0, 12)
banner.Size = UDim2.new(0.42, 0, 0, 44)
banner.BackgroundColor3 = Color3.fromRGB(28, 30, 38)
banner.BorderSizePixel = 0
banner.Parent = screenGui

local bannerCorner = Instance.new("UICorner")
bannerCorner.CornerRadius = UDim.new(0, 8)
bannerCorner.Parent = banner

local bannerStroke = Instance.new("UIStroke")
bannerStroke.Color = Color3.fromRGB(255, 170, 40)
bannerStroke.Thickness = 2
bannerStroke.Parent = banner

local bannerIcon = Instance.new("TextLabel")
bannerIcon.Name = "BannerIcon"
bannerIcon.BackgroundTransparency = 1
bannerIcon.Position = UDim2.new(0, 10, 0, 0)
bannerIcon.Size = UDim2.new(0, 28, 1, 0)
bannerIcon.Font = Enum.Font.GothamBold
bannerIcon.Text = "!"
bannerIcon.TextSize = 22
bannerIcon.TextColor3 = Color3.fromRGB(255, 170, 40)
bannerIcon.Parent = banner

local bannerText = Instance.new("TextLabel")
bannerText.Name = "BannerText"
bannerText.BackgroundTransparency = 1
bannerText.Position = UDim2.new(0, 44, 0, 0)
bannerText.Size = UDim2.new(1, -54, 1, 0)
bannerText.Font = Enum.Font.Gotham
bannerText.Text = "SERVER EVENT: Double cash droppers for the next 15 minutes!"
bannerText.TextSize = 15
bannerText.TextColor3 = Color3.fromRGB(240, 240, 245)
bannerText.TextXAlignment = Enum.TextXAlignment.Left
bannerText.TextTruncate = Enum.TextTruncate.AtEnd
bannerText.Parent = banner

-- ============ COLOURED CHAT-STYLE ANNOUNCEMENT LINE (scrollback feel) ============
local chatLine = Instance.new("Frame")
chatLine.Name = "ChatAnnouncement"
chatLine.AnchorPoint = Vector2.new(0, 1)
chatLine.Position = UDim2.new(0, 12, 1, -12)
chatLine.Size = UDim2.new(0.34, 0, 0, 26)
chatLine.BackgroundTransparency = 1
chatLine.Parent = screenGui

local chatText = Instance.new("TextLabel")
chatText.Name = "ChatLineText"
chatText.BackgroundTransparency = 1
chatText.Size = UDim2.new(1, 0, 1, 0)
chatText.Font = Enum.Font.Gotham
chatText.RichText = true
chatText.Text = "[SYSTEM] MegaMall_Tycoon just hit 10,000 total cash earned!"
chatText.TextSize = 14
chatText.TextColor3 = Color3.fromRGB(235, 235, 240)
chatText.TextXAlignment = Enum.TextXAlignment.Left
chatText.TextTruncate = Enum.TextTruncate.AtEnd
chatText.Parent = chatLine

-- ============ TOAST STACK (bottom-right, engine's corner) ============
local toastStack = Instance.new("Frame")
toastStack.Name = "ToastStack"
toastStack.AnchorPoint = Vector2.new(1, 1)
toastStack.Position = UDim2.new(1, -12, 1, -12)
toastStack.Size = UDim2.new(0, 300, 0, 0)
toastStack.BackgroundTransparency = 1
toastStack.Parent = screenGui

local stackLayout = Instance.new("UIListLayout")
stackLayout.FillDirection = Enum.FillDirection.Vertical
stackLayout.VerticalAlignment = Enum.VerticalAlignment.Bottom
stackLayout.HorizontalAlignment = Enum.HorizontalAlignment.Right
stackLayout.Padding = UDim.new(0, 8)
stackLayout.SortOrder = Enum.SortOrder.LayoutOrder
stackLayout.Parent = toastStack

local function makeToast(order, title, body, accent)
	local toast = Instance.new("Frame")
	toast.Name = "Toast"
	toast.LayoutOrder = order
	toast.Size = UDim2.new(1, 0, 0, 64)
	toast.BackgroundColor3 = Color3.fromRGB(24, 26, 34)
	toast.BorderSizePixel = 0
	toast.Parent = toastStack

	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 8)
	corner.Parent = toast

	local stroke = Instance.new("UIStroke")
	stroke.Color = accent
	stroke.Thickness = 2
	stroke.Parent = toast

	local accentBar = Instance.new("Frame")
	accentBar.Name = "AccentBar"
	accentBar.Position = UDim2.new(0, 0, 0, 0)
	accentBar.Size = UDim2.new(0, 4, 1, 0)
	accentBar.BackgroundColor3 = accent
	accentBar.BorderSizePixel = 0
	accentBar.Parent = toast

	local accentCorner = Instance.new("UICorner")
	accentCorner.CornerRadius = UDim.new(0, 2)
	accentCorner.Parent = accentBar

	local titleLabel = Instance.new("TextLabel")
	titleLabel.Name = "Title"
	titleLabel.BackgroundTransparency = 1
	titleLabel.Position = UDim2.new(0, 14, 0, 8)
	titleLabel.Size = UDim2.new(1, -28, 0, 18)
	titleLabel.Font = Enum.Font.GothamBold
	titleLabel.Text = title
	titleLabel.TextSize = 15
	titleLabel.TextColor3 = accent
	titleLabel.TextXAlignment = Enum.TextXAlignment.Left
	titleLabel.TextTruncate = Enum.TextTruncate.AtEnd
	titleLabel.Parent = toast

	local bodyLabel = Instance.new("TextLabel")
	bodyLabel.Name = "Body"
	bodyLabel.BackgroundTransparency = 1
	bodyLabel.Position = UDim2.new(0, 14, 0, 28)
	bodyLabel.Size = UDim2.new(1, -28, 0, 30)
	bodyLabel.Font = Enum.Font.Gotham
	bodyLabel.Text = body
	bodyLabel.TextSize = 13
	bodyLabel.TextColor3 = Color3.fromRGB(220, 220, 228)
	bodyLabel.TextXAlignment = Enum.TextXAlignment.Left
	bodyLabel.TextYAlignment = Enum.TextYAlignment.Top
	bodyLabel.TextWrapped = true
	bodyLabel.Parent = toast

	return toast
end

-- Toast 1: one player's own outcome (no actions)
makeToast(1, "Dropper Upgraded", "Gold Dropper Lv. 4 now earns $120 per drop.", Color3.fromRGB(90, 200, 120))

-- Toast 2: actionable — binary, at most two buttons (Claim / Later)
local claimToast = makeToast(2, "Daily Collector Bonus", "Your collector is full. Claim 2,500 cash now?", Color3.fromRGB(255, 170, 40))
claimToast.Size = UDim2.new(1, 0, 0, 96)

local buttonRow = Instance.new("Frame")
buttonRow.Name = "ButtonRow"
buttonRow.BackgroundTransparency = 1
buttonRow.Position = UDim2.new(0, 14, 0, 60)
buttonRow.Size = UDim2.new(1, -28, 0, 28)
buttonRow.Parent = claimToast

local rowLayout = Instance.new("UIListLayout")
rowLayout.FillDirection = Enum.FillDirection.Horizontal
rowLayout.Padding = UDim.new(0, 8)
rowLayout.Parent = buttonRow

local function makeButton(name, text, color)
	local btn = Instance.new("TextButton")
	btn.Name = name
	btn.Size = UDim2.new(0.5, -4, 1, 0)
	btn.BackgroundColor3 = color
	btn.BorderSizePixel = 0
	btn.Font = Enum.Font.GothamBold
	btn.Text = text
	btn.TextSize = 14
	btn.TextColor3 = Color3.fromRGB(18, 18, 22)
	btn.Parent = buttonRow

	local btnCorner = Instance.new("UICorner")
	btnCorner.CornerRadius = UDim.new(0, 6)
	btnCorner.Parent = btn

	return btn
end

local claimBtn = makeButton("ClaimButton", "CLAIM $2,500", Color3.fromRGB(255, 200, 80))
local laterBtn = makeButton("LaterButton", "LATER", Color3.fromRGB(120, 124, 136))

claimBtn.MouseButton1Click:Connect(function()
	claimToast:Destroy()
end)
laterBtn.MouseButton1Click:Connect(function()
	claimToast:Destroy()
end)

-- Toast 3: passive income report
makeToast(3, "Offline Earnings", "While you were away your mall earned $8,430.", Color3.fromRGB(90, 160, 255))