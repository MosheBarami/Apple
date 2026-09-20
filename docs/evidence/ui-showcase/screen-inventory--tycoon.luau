local Players = game:GetService("Players")
local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local screenGui = Instance.new("ScreenGui")
screenGui.Name = "InventoryScreen"
screenGui.ResetOnSpawn = false
screenGui.IgnoreGuiInset = true
screenGui.Parent = playerGui

-- Full-screen dimmed backdrop (fade 0.5)
local backdrop = Instance.new("Frame")
backdrop.Name = "Backdrop"
backdrop.Size = UDim2.fromScale(1, 1)
backdrop.Position = UDim2.fromScale(0, 0)
backdrop.BackgroundColor3 = Color3.fromRGB(10, 12, 18)
backdrop.BackgroundTransparency = 0.5
backdrop.BorderSizePixel = 0
backdrop.Parent = screenGui

-- Main panel
local panel = Instance.new("Frame")
panel.Name = "InventoryPanel"
panel.Size = UDim2.fromScale(0.62, 0.78)
panel.Position = UDim2.fromScale(0.5, 0.5)
panel.AnchorPoint = Vector2.new(0.5, 0.5)
panel.BackgroundColor3 = Color3.fromRGB(28, 30, 40)
panel.BorderSizePixel = 0
panel.Parent = backdrop

local panelCorner = Instance.new("UICorner")
panelCorner.CornerRadius = UDim.new(0, 10)
panelCorner.Parent = panel

local panelStroke = Instance.new("UIStroke")
panelStroke.Color = Color3.fromRGB(70, 74, 96)
panelStroke.Thickness = 2
panelStroke.Parent = panel

-- Header band
local header = Instance.new("Frame")
header.Name = "Header"
header.Size = UDim2.fromScale(1, 0.12)
header.Position = UDim2.fromScale(0, 0)
header.BackgroundColor3 = Color3.fromRGB(38, 41, 56)
header.BorderSizePixel = 0
header.Parent = panel

local headerCorner = Instance.new("UICorner")
headerCorner.CornerRadius = UDim.new(0, 10)
headerCorner.Parent = header

local headerTitle = Instance.new("TextLabel")
headerTitle.Name = "Title"
headerTitle.Size = UDim2.fromScale(0.4, 0.6)
headerTitle.Position = UDim2.fromScale(0.03, 0.2)
headerTitle.BackgroundTransparency = 1
headerTitle.Text = "TYCOON INVENTORY"
headerTitle.TextColor3 = Color3.fromRGB(240, 240, 250)
headerTitle.TextSize = 22
headerTitle.Font = Enum.Font.GothamBold
headerTitle.TextXAlignment = Enum.TextXAlignment.Left
headerTitle.Parent = header

local cashLabel = Instance.new("TextLabel")
cashLabel.Name = "Cash"
cashLabel.Size = UDim2.fromScale(0.25, 0.6)
cashLabel.Position = UDim2.fromScale(0.72, 0.2)
cashLabel.BackgroundTransparency = 1
cashLabel.Text = "$1,482,300"
cashLabel.TextColor3 = Color3.fromRGB(120, 220, 140)
cashLabel.TextSize = 20
cashLabel.Font = Enum.Font.GothamBold
cashLabel.TextXAlignment = Enum.TextXAlignment.Right
cashLabel.Parent = header

local closeBtn = Instance.new("TextButton")
closeBtn.Name = "CloseButton"
closeBtn.Size = UDim2.fromScale(0.05, 0.6)
closeBtn.Position = UDim2.fromScale(0.94, 0.2)
closeBtn.BackgroundColor3 = Color3.fromRGB(200, 70, 70)
closeBtn.Text = "X"
closeBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
closeBtn.TextSize = 18
closeBtn.Font = Enum.Font.GothamBold
closeBtn.BorderSizePixel = 0
closeBtn.Parent = header

local closeCorner = Instance.new("UICorner")
closeCorner.CornerRadius = UDim.new(0, 6)
closeCorner.Parent = closeBtn

-- Filter / sort row
local filterRow = Instance.new("Frame")
filterRow.Name = "FilterRow"
filterRow.Size = UDim2.fromScale(1, 0.08)
filterRow.Position = UDim2.fromScale(0, 0.12)
filterRow.BackgroundColor3 = Color3.fromRGB(28, 30, 40)
filterRow.BorderSizePixel = 0
filterRow.Parent = panel

local filterLayout = Instance.new("UIListLayout")
filterLayout.FillDirection = Enum.FillDirection.Horizontal
filterLayout.Padding = UDim.new(0, 8)
filterLayout.VerticalAlignment = Enum.VerticalAlignment.Center
filterLayout.Padding = UDim.new(0, 8)
filterLayout.Parent = filterRow

local filterPad = Instance.new("UIPadding")
filterPad.PaddingLeft = UDim.new(0, 12)
filterPad.Parent = filterRow

local function makeFilterButton(text, order, active)
	local b = Instance.new("TextButton")
	b.Name = "Filter_" .. text
	b.Size = UDim2.fromScale(0.13, 0.6)
	b.BackgroundColor3 = active and Color3.fromRGB(90, 130, 240) or Color3.fromRGB(48, 52, 70)
	b.Text = text
	b.TextColor3 = Color3.fromRGB(235, 235, 245)
	b.TextSize = 15
	b.Font = Enum.Font.Gotham
	b.BorderSizePixel = 0
	b.LayoutOrder = order
	b.Parent = filterRow
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0, 6)
	c.Parent = b
	return b
end

makeFilterButton("All", 1, true)
makeFilterButton("Tools", 2, false)
makeFilterButton("Droppers", 3, false)
makeFilterButton("Upgrades", 4, false)
makeFilterButton("Pets", 5, false)

local sortLabel = Instance.new("TextLabel")
sortLabel.Name = "SortLabel"
sortLabel.Size = UDim2.fromScale(0.2, 0.6)
sortLabel.Position = UDim2.fromScale(0.78, 0.2)
sortLabel.BackgroundTransparency = 1
sortLabel.Text = "Sort: Rarity ▾"
sortLabel.TextColor3 = Color3.fromRGB(160, 165, 190)
sortLabel.TextSize = 15
sortLabel.Font = Enum.Font.Gotham
sortLabel.TextXAlignment = Enum.TextXAlignment.Right
sortLabel.Parent = filterRow

-- Item grid (60px cells, 5px buffer, 65px pitch)
local gridFrame = Instance.new("ScrollingFrame")
gridFrame.Name = "ItemGrid"
gridFrame.Size = UDim2.fromScale(0.62, 0.62)
gridFrame.Position = UDim2.fromScale(0.02, 0.21)
gridFrame.BackgroundColor3 = Color3.fromRGB(24, 26, 36)
gridFrame.BorderSizePixel = 0
gridFrame.ScrollBarThickness = 6
gridFrame.ScrollBarImageColor3 = Color3.fromRGB(90, 130, 240)
gridFrame.CanvasSize = UDim2.new(0, 0, 0, 0)
gridFrame.AutomaticCanvasSize = Enum.AutomaticSize.Y
gridFrame.Parent = panel

local gridCorner = Instance.new("UICorner")
gridCorner.CornerRadius = UDim.new(0, 8)
gridCorner.Parent = gridFrame

local gridPad = Instance.new("UIPadding")
gridPad.PaddingTop = UDim.new(0, 8)
gridPad.PaddingLeft = UDim.new(0, 8)
gridPad.PaddingRight = UDim.new(0, 8)
gridPad.Parent = gridFrame

local grid = Instance.new("UIGridLayout")
grid.CellSize = UDim2.fromOffset(60, 60)
grid.CellPadding = UDim2.fromOffset(5, 5)
grid.SortOrder = Enum.SortOrder.LayoutOrder
grid.Parent = gridFrame

local rarityColors = {
	Common = Color3.fromRGB(150, 155, 170),
	Rare = Color3.fromRGB(80, 140, 250),
	Epic = Color3.fromRGB(170, 90, 240),
	Legendary = Color3.fromRGB(240, 180, 60),
}

local items = {
	{ name = "Golden Dropper", rarity = "Legendary", count = 1, equipped = true, locked = true },
	{ name = "Steel Conveyor", rarity = "Rare", count = 4, equipped = false, locked = false },
	{ name = "Cash Upgrader Mk II", rarity = "Epic", count = 1, equipped = false, locked = false },
	{ name = "Coal Miner", rarity = "Common", count = 7, equipped = false, locked = false },
	{ name = "Iron Smelter", rarity = "Common", count = 3, equipped = false, locked = false },
	{ name = "Diamond Drill", rarity = "Epic", count = 2, equipped = false, locked = false },
	{ name = "Speed Coil", rarity = "Rare", count = 1, equipped = false, locked = false },
	{ name = "Lumber Mill", rarity = "Common", count = 5, equipped = false, locked = false },
	{ name = "Nuclear Reactor", rarity = "Legendary", count = 1, equipped = false, locked = true },
	{ name = "Robo Assistant", rarity = "Epic", count = 1, equipped = false, locked = false },
	{ name = "Paint Sprayer", rarity = "Common", count = 9, equipped = false, locked = false },
	{ name = "Crystal Refiner", rarity = "Rare", count = 2, equipped = false, locked = false },
}

local detailPane -- forward

local function selectItem(item, cell)
	-- highlight selected cell
	for _, other in ipairs(gridFrame:GetChildren()) do
		if other:IsA("TextButton") and other:FindFirstChild("SelectionStroke") then
			other.SelectionStroke.Transparency = 1
		end
	end
	local stroke = cell:FindFirstChild("SelectionStroke")
	if stroke then stroke.Transparency = 0 end
	-- update detail pane
	detailPane.ItemName.Text = item.name
	detailPane.Rarity.Text = item.rarity
	detailPane.Rarity.TextColor3 = rarityColors[item.rarity]
	detailPane.Desc.Text = item.name .. " — a dependable piece of your factory line. Upgrade it at the workbench to boost output."
	detailPane.Count.Text = "Owned: x" .. item.count
	detailPane.Lock.Text = item.locked and "🔒 Locked" or "🔓 Unlocked"
end

for i, item in ipairs(items) do
	local cell = Instance.new("TextButton")
	cell.Name = "Cell_" .. item.name
	cell.BackgroundColor3 = Color3.fromRGB(44, 48, 66)
	cell.BorderSizePixel = 0
	cell.Text = ""
	cell.LayoutOrder = i
	cell.Parent = gridFrame

	local cellCorner = Instance.new("UICorner")
	cellCorner.CornerRadius = UDim.new(0, 6)
	cellCorner.Parent = cell

	local rarityBar = Instance.new("Frame")
	rarityBar.Name = "RarityBar"
	rarityBar.Size = UDim2.new(1, 0, 0, 4)
	rarityBar.Position = UDim2.new(0, 0, 1, -4)
	rarityBar.BackgroundColor3 = rarityColors[item.rarity]
	rarityBar.BorderSizePixel = 0
	rarityBar.Parent = cell

	local icon = Instance.new("TextLabel")
	icon.Name = "Icon"
	icon.Size = UDim2.fromScale(1, 0.7)
	icon.Position = UDim2.fromScale(0, 0.05)
	icon.BackgroundTransparency = 1
	icon.Text = "⚙"
	icon.TextColor3 = rarityColors[item.rarity]
	icon.TextSize = 24
	icon.Font = Enum.Font.GothamBold
	icon.Parent = cell

	if item.count > 1 then
		local stack = Instance.new("TextLabel")
		stack.Name = "StackCount"
		stack.Size = UDim2.fromScale(0.6, 0.25)
		stack.Position = UDim2.fromScale(0.42, 0.02)
		stack.BackgroundTransparency = 1
		stack.Text = "x" .. item.count
		stack.TextColor3 = Color3.fromRGB(235, 235, 245)
		stack.TextSize = 12
		stack.Font = Enum.Font.GothamBold
		stack.TextXAlignment = Enum.TextXAlignment.Right
		stack.Parent = cell
	end

	if item.equipped then
		local eq = Instance.new("TextLabel")
		eq.Name = "EquippedTag"
		eq.Size = UDim2.new(1, 0, 0, 14)
		eq.Position = UDim2.new(0, 0, 0, 0)
		eq.BackgroundColor3 = Color3.fromRGB(90, 130, 240)
		eq.Text = "EQUIPPED"
		eq.TextColor3 = Color3.fromRGB(255, 255, 255)
		eq.TextSize = 9
		eq.Font = Enum.Font.GothamBold
		eq.BorderSizePixel = 0
		eq.Parent = cell
	end

	if item.locked then
		local lock = Instance.new("TextLabel")
		lock.Name = "LockIcon"
		lock.Size = UDim2.fromScale(0.3, 0.25)
		lock.Position = UDim2.fromScale(0.02, 0.02)
		lock.BackgroundTransparency = 1
		lock.Text = "🔒"
		lock.TextSize = 12
		lock.Font = Enum.Font.Gotham
		lock.TextXAlignment = Enum.TextXAlignment.Left
		lock.Parent = cell
	end

	local selStroke = Instance.new("UIStroke")
	selStroke.Name = "SelectionStroke"
	selStroke.Color = Color3.fromRGB(90, 130, 240)
	selStroke.Thickness = 2
	selStroke.Transparency = 1
	selStroke.Parent = cell

	cell.MouseButton1Click:Connect(function()
		selectItem(item, cell)
	end)
end

-- Equipped region
local equippedRegion = Instance.new("Frame")
equippedRegion.Name = "EquippedRegion"
equippedRegion.Size = UDim2.fromScale(0.62, 0.13)
equippedRegion.Position = UDim2.fromScale(0.02, 0.85)
equippedRegion.BackgroundColor3 = Color3.fromRGB(24, 26, 36)
equippedRegion.BorderSizePixel = 0
equippedRegion.Parent = panel

local equippedCorner = Instance.new("UICorner")
equippedCorner.CornerRadius = UDim.new(0, 8)
equippedCorner.Parent = equippedRegion

local equippedLabel = Instance.new("TextLabel")
equippedLabel.Name = "EquippedLabel"
equippedLabel.Size = UDim2.fromScale(0.2, 0.5)
equippedLabel.Position = UDim2.fromScale(0.02, 0.25)
equippedLabel.BackgroundTransparency = 1
equippedLabel.Text = "EQUIPPED"
equippedLabel.TextColor3 = Color3.fromRGB(160, 165, 190)
equippedLabel.TextSize = 14
equippedLabel.Font = Enum.Font.GothamBold
equippedLabel.TextXAlignment = Enum.TextXAlignment.Left
equippedLabel.Parent = equippedRegion

local equippedSlot = Instance.new("Frame")
equippedSlot.Name = "EquippedSlot"
equippedSlot.Size = UDim2.fromOffset(60, 60)
equippedSlot.Position = UDim2.fromScale(0.22, 0.5)
equippedSlot.AnchorPoint = Vector2.new(0, 0.5)
equippedSlot.BackgroundColor3 = Color3.fromRGB(44, 48, 66)
equippedSlot.BorderSizePixel = 0
equippedSlot.Parent = equippedRegion

local equippedSlotCorner = Instance.new("UICorner")
equippedSlotCorner.CornerRadius = UDim.new(0, 6)
equippedSlotCorner.Parent = equippedSlot

local equippedSlotStroke = Instance.new("UIStroke")
equippedSlotStroke.Color = Color3.fromRGB(240, 180, 60)
equippedSlotStroke.Thickness = 2
equippedSlotStroke.Parent = equippedSlot

local equippedIcon = Instance.new("TextLabel")
equippedIcon.Name = "Icon"
equippedIcon.Size = UDim2.fromScale(1, 1)
equippedIcon.BackgroundTransparency = 1
equippedIcon.Text = "⚙"
equippedIcon.TextColor3 = rarityColors.Legendary
equippedIcon.TextSize = 24
equippedIcon.Font = Enum.Font.GothamBold
equippedIcon.Parent = equippedSlot

local equippedName = Instance.new("TextLabel")
equippedName.Name = "EquippedName"
equippedName.Size = UDim2.fromScale(0.4, 0.4)
equippedName.Position = UDim2.fromScale(0.32, 0.3)
equippedName.BackgroundTransparency = 1
equippedName.Text = "Golden Dropper — $12,500/min"
equippedName.TextColor3 = Color3.fromRGB(240, 240, 250)
equippedName.TextSize = 15
equippedName.Font = Enum.Font.Gotham
equippedName.TextXAlignment = Enum.TextXAlignment.Left
equippedName.Parent = equippedRegion

-- Detail pane
detailPane = {}
local detail = Instance.new("Frame")
detail.Name = "DetailPane"
detail.Size = UDim2.fromScale(0.33, 0.77)
detail.Position = UDim2.fromScale(0.65, 0.21)
detail.BackgroundColor3 = Color3.fromRGB(24, 26, 36)
detail.BorderSizePixel = 0
detail.Parent = panel

local detailCorner = Instance.new("UICorner")
detailCorner.CornerRadius = UDim.new(0, 8)
detailCorner.Parent = detail

local detailIcon = Instance.new("TextLabel")
detailIcon.Name = "DetailIcon"
detailIcon.Size = UDim2.fromScale(0.4, 0.28)
detailIcon.Position = UDim2.fromScale(0.3, 0.04)
detailIcon.BackgroundTransparency = 1
detailIcon.Text = "⚙"
detailIcon.TextColor3 = rarityColors.Legendary
detailIcon.TextSize = 48
detailIcon.Font = Enum.Font.GothamBold
detailIcon.Parent = detail

local detailName = Instance.new("TextLabel")
detailName.Name = "ItemName"
detailName.Size = UDim2.fromScale(0.9, 0.08)
detailName.Position = UDim2.fromScale(0.05, 0.34)
detailName.BackgroundTransparency = 1
detailName.Text = "Golden Dropper"
detailName.TextColor3 = Color3.fromRGB(240, 240, 250)
detailName.TextSize = 20
detailName.Font = Enum.Font.GothamBold
detailName.Parent = detail

local detailRarity = Instance.new("TextLabel")
detailRarity.Name = "Rarity"
detailRarity.Size = UDim2.fromScale(0.9, 0.05)
detailRarity.Position = UDim2.fromScale(0.05, 0.42)
detailRarity.BackgroundTransparency = 1
detailRarity.Text = "Legendary"
detailRarity.TextColor3 = rarityColors.Legendary
detailRarity.TextSize = 15
detailRarity.Font = Enum.Font.GothamBold
detailRarity.Parent = detail

local detailDesc = Instance.new("TextLabel")
detailDesc.Name = "Desc"
detailDesc.Size = UDim2.fromScale(0.9, 0.2)
detailDesc.Position = UDim2.fromScale(0.05, 0.49)
detailDesc.BackgroundTransparency = 1
detailDesc.Text = "Golden Dropper — a dependable piece of your factory line. Upgrade it at the workbench to boost output."
detailDesc.TextColor3 = Color3.fromRGB(180, 185, 205)
detailDesc.TextSize = 14
detailDesc.Font = Enum.Font.Gotham
detailDesc.TextWrapped = true
detailDesc.TextXAlignment = Enum.TextXAlignment.Left
detailDesc.TextYAlignment = Enum.TextYAlignment.Top
detailDesc.Parent = detail

local detailCount = Instance.new("TextLabel")
detailCount.Name = "Count"
detailCount.Size = UDim2.fromScale(0.9, 0.05)
detailCount.Position = UDim2.fromScale(0.05, 0.7)
detailCount.BackgroundTransparency = 1
detailCount.Text = "Owned: x1"
detailCount.TextColor3 = Color3.fromRGB(180, 185, 205)
detailCount.TextSize = 14
detailCount.Font = Enum.Font.Gotham
detailCount.TextXAlignment = Enum.TextXAlignment.Left
detailCount.Parent = detail

local detailLock = Instance.new("TextLabel")
detailLock.Name = "Lock"
detailLock.Size = UDim2.fromScale(0.9, 0.05)
detailLock.Position = UDim2.fromScale(0.05, 0.75)
detailLock.BackgroundTransparency = 1
detailLock.Text = "🔒 Locked"
detailLock.TextColor3 = Color3.fromRGB(240, 180, 60)
detailLock.TextSize = 14
detailLock.Font = Enum.Font.Gotham
detailLock.TextXAlignment = Enum.TextXAlignment.Left
detailLock.Parent = detail

local equipBtn = Instance.new("TextButton")
equipBtn.Name = "EquipButton"
equipBtn.Size = UDim2.fromScale(0.42, 0.08)
equipBtn.Position = UDim2.fromScale(0.05, 0.84)
equipBtn.BackgroundColor3 = Color3.fromRGB(90, 130, 240)
equipBtn.Text = "Equip"
equipBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
equipBtn.TextSize = 16
equipBtn.Font = Enum.Font.GothamBold
equipBtn.BorderSizePixel = 0
equipBtn.Parent = detail

local equipCorner = Instance.new("UICorner")
equipCorner.CornerRadius = UDim.new(0, 6)
equipCorner.Parent = equipBtn

local deleteBtn = Instance.new("TextButton")
deleteBtn.Name = "DeleteButton"
deleteBtn.Size = UDim2.fromScale(0.42, 0.08)
deleteBtn.Position = UDim2.fromScale(0.53, 0.84)
deleteBtn.BackgroundColor3 = Color3.fromRGB(200, 70, 70)
deleteBtn.Text = "Delete"
deleteBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
deleteBtn.TextSize = 16
deleteBtn.Font = Enum.Font.GothamBold
deleteBtn.BorderSizePixel = 0
deleteBtn.Parent = detail

local deleteCorner = Instance.new("UICorner")
deleteCorner.CornerRadius = UDim.new(0, 6)
deleteCorner.Parent = deleteBtn

local confirmLabel = Instance.new("TextLabel")
confirmLabel.Name = "DeleteConfirm"
confirmLabel.Size = UDim2.fromScale(0.9, 0.05)
confirmLabel.Position = UDim2.fromScale(0.05, 0.93)
confirmLabel.BackgroundTransparency = 1
confirmLabel.Text = "Deleting is permanent — click Delete twice to confirm."
confirmLabel.TextColor3 = Color3.fromRGB(200, 120, 120)
confirmLabel.TextSize = 12
confirmLabel.Font = Enum.Font.Gotham
confirmLabel.Parent = detail

detailPane.ItemName = detailName
detailPane.Rarity = detailRarity
detailPane.Desc = detailDesc
detailPane.Count = detailCount
detailPane.Lock = detailLock

-- initial selection
selectItem(items[1], gridFrame:FindFirstChild("Cell_" .. items[1].name))