local Players = game:GetService("Players")
local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local screenGui = Instance.new("ScreenGui")
screenGui.Name = "CraftingScreen"
screenGui.ResetOnSpawn = false
screenGui.Parent = playerGui

local root = Instance.new("Frame")
root.Name = "Root"
root.Size = UDim2.fromScale(1, 1)
root.BackgroundColor3 = Color3.fromRGB(24, 26, 32)
root.Parent = screenGui

local header = Instance.new("Frame")
header.Name = "Header"
header.Size = UDim2.fromScale(1, 0.09)
header.BackgroundColor3 = Color3.fromRGB(38, 42, 54)
header.Parent = root

local headerTitle = Instance.new("TextLabel")
headerTitle.Size = UDim2.fromScale(0.5, 1)
headerTitle.Position = UDim2.fromScale(0.03, 0)
headerTitle.BackgroundTransparency = 1
headerTitle.TextColor3 = Color3.fromRGB(240, 235, 220)
headerTitle.TextSize = 22
headerTitle.Font = Enum.Font.GothamBold
headerTitle.TextXAlignment = Enum.TextXAlignment.Left
headerTitle.Text = "WORKBENCH — Crafting Station"
headerTitle.Parent = header

local cashLabel = Instance.new("TextLabel")
cashLabel.Size = UDim2.fromScale(0.25, 1)
cashLabel.Position = UDim2.fromScale(0.72, 0)
cashLabel.BackgroundTransparency = 1
cashLabel.TextColor3 = Color3.fromRGB(120, 220, 140)
cashLabel.TextSize = 20
cashLabel.Font = Enum.Font.GothamBold
cashLabel.TextXAlignment = Enum.TextXAlignment.Right
cashLabel.Text = "C$ 152,400"
cashLabel.Parent = header

local levelLabel = Instance.new("TextLabel")
levelLabel.Size = UDim2.fromScale(0.2, 1)
levelLabel.Position = UDim2.fromScale(0.5, 0)
levelLabel.BackgroundTransparency = 1
levelLabel.TextColor3 = Color3.fromRGB(150, 190, 255)
levelLabel.TextSize = 20
levelLabel.Font = Enum.Font.Gotham
levelLabel.TextXAlignment = Enum.TextXAlignment.Right
levelLabel.Text = "Crafting Lv. 4"
levelLabel.Parent = header

-- Recipe list (left) : detail panel (right)
local listFrame = Instance.new("Frame")
listFrame.Name = "RecipeList"
listFrame.Size = UDim2.fromScale(0.42, 0.91)
listFrame.Position = UDim2.fromScale(0, 0.09)
listFrame.BackgroundColor3 = Color3.fromRGB(30, 33, 42)
listFrame.Parent = root

local listTitle = Instance.new("TextLabel")
listTitle.Size = UDim2.fromScale(1, 0.08)
listTitle.BackgroundColor3 = Color3.fromRGB(44, 48, 60)
listTitle.TextColor3 = Color3.fromRGB(220, 215, 200)
listTitle.TextSize = 16
listTitle.Font = Enum.Font.GothamBold
listTitle.Text = "RECIPES"
listTitle.Parent = listFrame

local listScroll = Instance.new("ScrollingFrame")
listScroll.Size = UDim2.fromScale(1, 0.92)
listScroll.Position = UDim2.fromScale(0, 0.08)
listScroll.BackgroundTransparency = 1
listScroll.ScrollBarThickness = 6
listScroll.CanvasSize = UDim2.fromScale(0, 0)
listScroll.AutomaticCanvasSize = Enum.AutomaticSize.Y
listScroll.Parent = listFrame

local listLayout = Instance.new("UIListLayout")
listLayout.Padding = UDim.new(0, 4)
listLayout.SortOrder = Enum.SortOrder.LayoutOrder
listLayout.Parent = listScroll

local detail = Instance.new("Frame")
detail.Name = "Detail"
detail.Size = UDim2.fromScale(0.58, 0.91)
detail.Position = UDim2.fromScale(0.42, 0.09)
detail.BackgroundColor3 = Color3.fromRGB(30, 33, 42)
detail.Parent = root

local detailTitle = Instance.new("TextLabel")
detailTitle.Size = UDim2.fromScale(1, 0.1)
detailTitle.BackgroundColor3 = Color3.fromRGB(44, 48, 60)
detailTitle.TextColor3 = Color3.fromRGB(240, 235, 220)
detailTitle.TextSize = 20
detailTitle.Font = Enum.Font.GothamBold
detailTitle.Text = "Vineweaver Rod"
detailTitle.Parent = detail

-- Requirement block: three axes — materials, level gate, currency price
local reqBlock = Instance.new("Frame")
reqBlock.Name = "Requirements"
reqBlock.Size = UDim2.fromScale(0.94, 0.5)
reqBlock.Position = UDim2.fromScale(0.03, 0.12)
reqBlock.BackgroundColor3 = Color3.fromRGB(36, 40, 52)
reqBlock.Parent = detail

local reqCorner = Instance.new("UICorner")
reqCorner.CornerRadius = UDim.new(0, 8)
reqCorner.Parent = reqBlock

local reqLayout = Instance.new("UIListLayout")
reqLayout.Padding = UDim.new(0, 6)
reqLayout.SortOrder = Enum.SortOrder.LayoutOrder
reqLayout.Parent = reqBlock

local reqPad = Instance.new("UIPadding")
reqPad.PaddingTop = UDim.new(0, 8)
reqPad.PaddingLeft = UDim.new(0, 10)
reqPad.PaddingRight = UDim.new(0, 10)
reqPad.PaddingBottom = UDim.new(0, 8)
reqPad.Parent = reqBlock

local function reqRow(order, text, color)
	local row = Instance.new("TextLabel")
	row.Size = UDim2.fromScale(1, 0)
	row.AutomaticSize = Enum.AutomaticSize.Y
	row.BackgroundTransparency = 1
	row.LayoutOrder = order
	row.TextColor3 = color
	row.TextSize = 17
	row.Font = Enum.Font.Gotham
	row.TextXAlignment = Enum.TextXAlignment.Left
	row.TextWrapped = true
	row.Text = text
	row.Parent = reqBlock
	return row
end

-- Materials axis: ingredient = item PLUS variant, written as what is SUBTRACTED
reqRow(1, "[-2 Oak Wood]", Color3.fromRGB(120, 220, 140))
reqRow(2, "[-1 Vined Driftwood]", Color3.fromRGB(120, 220, 140))
reqRow(3, "[-1 Mythical Driftwood]", Color3.fromRGB(230, 120, 120))
reqRow(4, "[-6 Iron Ore]", Color3.fromRGB(120, 220, 140))
-- Level gate axis (kept on screen even reading zero)
reqRow(5, "Required skill: Level 0 Crafting", Color3.fromRGB(150, 190, 255))
-- Currency price axis (kept on screen even reading zero)
reqRow(6, "Price: 150,000 C$", Color3.fromRGB(120, 220, 140))

local craftButton = Instance.new("TextButton")
craftButton.Size = UDim2.fromScale(0.94, 0.1)
craftButton.Position = UDim2.fromScale(0.03, 0.66)
craftButton.BackgroundColor3 = Color3.fromRGB(70, 140, 90)
craftButton.TextColor3 = Color3.fromRGB(240, 255, 240)
craftButton.TextSize = 20
craftButton.Font = Enum.Font.GothamBold
craftButton.Text = "CRAFT  (missing: Mythical Driftwood)"
craftButton.Parent = detail

local craftCorner = Instance.new("UICorner")
craftCorner.CornerRadius = UDim.new(0, 8)
craftCorner.Parent = craftButton

local craftAll = Instance.new("TextButton")
craftAll.Size = UDim2.fromScale(0.94, 0.08)
craftAll.Position = UDim2.fromScale(0.03, 0.78)
craftAll.BackgroundColor3 = Color3.fromRGB(50, 55, 70)
craftAll.TextColor3 = Color3.fromRGB(200, 200, 210)
craftAll.TextSize = 16
craftAll.Font = Enum.Font.Gotham
craftAll.Text = "Craft All: 0 available"
craftAll.Parent = detail

local allCorner = Instance.new("UICorner")
allCorner.CornerRadius = UDim.new(0, 8)
allCorner.Parent = craftAll

-- Recipe rows: station upgrade priced like any other recipe
local recipes = {
	{ name = "Oak Plank", have = true },
	{ name = "Vineweaver Rod", have = false, selected = true },
	{ name = "Spirit Speed Core", have = false },
	{ name = "Workbench Tier 2", have = false },
}

for i, r in ipairs(recipes) do
	local row = Instance.new("TextButton")
	row.Size = UDim2.new(1, 0, 0, 44)
	row.BackgroundColor3 = r.selected and Color3.fromRGB(60, 66, 84) or Color3.fromRGB(40, 44, 56)
	row.LayoutOrder = i
	row.Text = ""
	row.Parent = listScroll

	local rowCorner = Instance.new("UICorner")
	rowCorner.CornerRadius = UDim.new(0, 6)
	rowCorner.Parent = row

	local nameLabel = Instance.new("TextLabel")
	nameLabel.Size = UDim2.fromScale(0.7, 1)
	nameLabel.Position = UDim2.fromScale(0.04, 0)
	nameLabel.BackgroundTransparency = 1
	nameLabel.TextColor3 = Color3.fromRGB(230, 225, 210)
	nameLabel.TextSize = 17
	nameLabel.Font = Enum.Font.Gotham
	nameLabel.TextXAlignment = Enum.TextXAlignment.Left
	nameLabel.Text = r.name
	nameLabel.Parent = row

	local stateLabel = Instance.new("TextLabel")
	stateLabel.Size = UDim2.fromScale(0.24, 1)
	stateLabel.Position = UDim2.fromScale(0.74, 0)
	stateLabel.BackgroundTransparency = 1
	stateLabel.TextColor3 = r.have and Color3.fromRGB(120, 220, 140) or Color3.fromRGB(230, 120, 120)
	stateLabel.TextSize = 15
	stateLabel.Font = Enum.Font.GothamBold
	stateLabel.TextXAlignment = Enum.TextXAlignment.Right
	stateLabel.Text = r.have and "READY" or "LOCKED"
	stateLabel.Parent = row
end