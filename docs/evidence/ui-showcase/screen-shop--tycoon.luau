-- Shop screen for a Roblox tycoon (LocalScript body)
local Players = game:GetService("Players")
local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local screenGui = Instance.new("ScreenGui")
screenGui.Name = "TycoonShop"
screenGui.ResetOnSpawn = false
screenGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
screenGui.Parent = playerGui

-- ============ OPENER (outside the sheet, so it can always reopen) ============
local openButton = Instance.new("TextButton")
openButton.Name = "OpenShopButton"
openButton.AnchorPoint = Vector2.new(1, 0)
openButton.Position = UDim2.new(1, -16, 0, 16)
openButton.Size = UDim2.new(0, 0, 0, 0)
openButton.Size = UDim2.new(0.14, 0, 0.07, 0)
openButton.BackgroundColor3 = Color3.fromRGB(255, 170, 40)
openButton.TextColor3 = Color3.fromRGB(45, 25, 5)
openButton.Text = "OPEN SHOP"
openButton.TextScaled = true
openButton.Font = Enum.Font.GothamBold
openButton.BorderSizePixel = 0
openButton.Parent = screenGui
local openCorner = Instance.new("UICorner")
openCorner.CornerRadius = UDim.new(0, 10)
openCorner.Parent = openButton
local openStroke = Instance.new("UIStroke")
openStroke.Thickness = 3
openStroke.Color = Color3.fromRGB(45, 25, 5)
openStroke.Parent = openButton

-- ============ DIMMED BACKDROP ============
local backdrop = Instance.new("Frame")
backdrop.Name = "Backdrop"
backdrop.AnchorPoint = Vector2.new(0.5, 0.5)
backdrop.Position = UDim2.new(0.5, 0, 0.5, 0)
backdrop.Size = UDim2.new(1, 0, 1, 0)
backdrop.BackgroundColor3 = Color3.fromRGB(10, 10, 20)
backdrop.BackgroundTransparency = 0.45
backdrop.BorderSizePixel = 0
backdrop.Visible = false
backdrop.Parent = screenGui

-- ============ CENTRED MODAL SHEET (ships Visible = false) ============
local sheet = Instance.new("Frame")
sheet.Name = "ShopSheet"
sheet.AnchorPoint = Vector2.new(0.5, 0.5)
sheet.Position = UDim2.new(0.5, 0, 0.5, 0)
sheet.Size = UDim2.new(0.62, 0, 0.78, 0)
sheet.BackgroundColor3 = Color3.fromRGB(52, 38, 66)
sheet.BorderSizePixel = 0
sheet.Visible = false
sheet.Parent = backdrop
local sheetCorner = Instance.new("UICorner")
sheetCorner.CornerRadius = UDim.new(0, 14)
sheetCorner.Parent = sheet
local sheetStroke = Instance.new("UIStroke")
sheetStroke.Thickness = 4
sheetStroke.Color = Color3.fromRGB(255, 170, 40)
sheetStroke.Parent = sheet

-- ============ HEADER: title | currency pills | close ============
local header = Instance.new("Frame")
header.Name = "Header"
header.Position = UDim2.new(0, 0, 0, 0)
header.Size = UDim2.new(1, 0, 0.14, 0)
header.BackgroundColor3 = Color3.fromRGB(38, 27, 50)
header.BorderSizePixel = 0
header.Parent = sheet
local headerCorner = Instance.new("UICorner")
headerCorner.CornerRadius = UDim.new(0, 14)
headerCorner.Parent = header

local title = Instance.new("TextLabel")
title.Name = "ShopTitle"
title.AnchorPoint = Vector2.new(0, 0.5)
title.Position = UDim2.new(0.03, 0, 0.5, 0)
title.Size = UDim2.new(0.3, 0, 0.7, 0)
title.BackgroundTransparency = 1
title.TextColor3 = Color3.fromRGB(255, 210, 120)
title.Text = "PIZZA PALACE SHOP"
title.Font = Enum.Font.GothamBlack
title.TextScaled = true
title.TextXAlignment = Enum.TextXAlignment.Left
title.Parent = header

-- Currency pills: icon then number, one per currency, icon sized to text
local function makeCurrencyPill(order, iconChar, amount, iconColor)
	local pill = Instance.new("Frame")
	pill.Name = "CurrencyPill" .. order
	pill.AnchorPoint = Vector2.new(1, 0.5)
	pill.Position = UDim2.new(1, -70 - (order - 1) * 0.16, 0.5, 0)
	pill.Size = UDim2.new(0.14, 0, 0.6, 0)
	pill.BackgroundColor3 = Color3.fromRGB(70, 52, 90)
	pill.BorderSizePixel = 0
	pill.Parent = header
	local pc = Instance.new("UICorner")
	pc.CornerRadius = UDim.new(0.5, 0)
	pc.Parent = pill

	local icon = Instance.new("TextLabel")
	icon.Name = "Icon"
	icon.AnchorPoint = Vector2.new(0, 0.5)
	icon.Position = UDim2.new(0.08, 0, 0.5, 0)
	icon.Size = UDim2.new(0.28, 0, 0.7, 0) -- sized to the text beside it
	icon.BackgroundTransparency = 1
	icon.TextColor3 = iconColor
	icon.Text = iconChar
	icon.Font = Enum.Font.GothamBold
	icon.TextScaled = true
	icon.Parent = pill

	local amountLabel = Instance.new("TextLabel")
	amountLabel.Name = "Amount"
	amountLabel.AnchorPoint = Vector2.new(0, 0.5)
	amountLabel.Position = UDim2.new(0.4, 0, 0.5, 0)
	amountLabel.Size = UDim2.new(0.55, 0, 0.7, 0)
	amountLabel.BackgroundTransparency = 1
	amountLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
	amountLabel.Text = amount
	amountLabel.Font = Enum.Font.GothamBold
	amountLabel.TextScaled = true
	amountLabel.TextXAlignment = Enum.TextXAlignment.Left
	amountLabel.Parent = pill
	return pill
end
makeCurrencyPill(1, "$", "12,450", Color3.fromRGB(120, 230, 120)) -- Cash
makeCurrencyPill(2, "D", "38", Color3.fromRGB(120, 180, 255))     -- Diamonds

local closeButton = Instance.new("TextButton")
closeButton.Name = "CloseButton"
closeButton.AnchorPoint = Vector2.new(1, 0.5)
closeButton.Position = UDim2.new(1, -12, 0.5, 0)
closeButton.Size = UDim2.new(0.055, 0, 0.62, 0)
closeButton.BackgroundColor3 = Color3.fromRGB(200, 60, 60)
closeButton.TextColor3 = Color3.fromRGB(255, 255, 255)
closeButton.Text = "X"
closeButton.Font = Enum.Font.GothamBold
closeButton.TextScaled = true
closeButton.BorderSizePixel = 0
closeButton.Parent = header
local closeCorner = Instance.new("UICorner")
closeCorner.CornerRadius = UDim.new(0, 8)
closeCorner.Parent = closeButton

-- ============ INNER CONTENT SHEET (different tint, holds the grid) ============
local contentSheet = Instance.new("Frame")
contentSheet.Name = "ShopContent"
contentSheet.AnchorPoint = Vector2.new(0.5, 1)
contentSheet.Position = UDim2.new(0.5, 0, 1, -12)
contentSheet.Size = UDim2.new(0.94, 0, 0.8, 0)
contentSheet.BackgroundColor3 = Color3.fromRGB(66, 50, 84)
contentSheet.BorderSizePixel = 0
contentSheet.Parent = sheet
local contentCorner = Instance.new("UICorner")
contentCorner.CornerRadius = UDim.new(0, 10)
contentCorner.Parent = contentSheet

local scroll = Instance.new("ScrollingFrame")
scroll.Name = "ProductGrid"
scroll.AnchorPoint = Vector2.new(0.5, 0.5)
scroll.Position = UDim2.new(0.5, 0, 0.5, 0)
scroll.Size = UDim2.new(0.96, 0, 0.94, 0)
scroll.BackgroundTransparency = 1
scroll.BorderSizePixel = 0
scroll.ScrollBarThickness = 6
scroll.ScrollBarImageColor3 = Color3.fromRGB(255, 170, 40)
scroll.CanvasSize = UDim2.new(0, 0, 0, 0)
scroll.AutomaticCanvasSize = Enum.AutomaticSize.Y
scroll.Parent = contentSheet

local grid = Instance.new("UIGridLayout")
grid.CellSize = UDim2.new(0.3, 0, 0, 150)
grid.CellPadding = UDim2.new(0.05, 0, 0.03, 0)
grid.SortOrder = Enum.SortOrder.LayoutOrder
grid.Parent = scroll
local gridPad = Instance.new("UIPadding")
gridPad.PaddingTop = UDim.new(0, 8)
gridPad.PaddingLeft = UDim.new(0, 8)
gridPad.PaddingRight = UDim.new(0, 8)
gridPad.Parent = scroll

-- ============ PRODUCT CARDS: uniform grid, price pill, owned state ============
local products = {
	{ name = "Double Dough Mixer", desc = "Doubles pizza output", price = "$2,500", owned = false },
	{ name = "Speedy Oven Mk II", desc = "Bakes 40% faster", price = "$4,800", owned = false },
	{ name = "Delivery Scooter", desc = "+$15 per delivery", price = "$1,200", owned = true },
	{ name = "Neon Sign Pack", desc = "Attracts more customers", price = "$900", owned = false },
	{ name = "Golden Topping Bar", desc = "Pizzas sell for 2x", price = "25 D", owned = false },
	{ name = "Second Floor Build", desc = "Unlocks rooftop dining", price = "$9,000", owned = false },
}

local function makeCard(order, data)
	local card = Instance.new("Frame")
	card.Name = "Card_" .. data.name
	card.BackgroundColor3 = Color3.fromRGB(84, 64, 106)
	card.BorderSizePixel = 0
	card.LayoutOrder = order
	card.Parent = scroll
	local cc = Instance.new("UICorner")
	cc.CornerRadius = UDim.new(0, 10)
	cc.Parent = card
	local cs = Instance.new("UIStroke")
	cs.Thickness = 2
	cs.Color = data.owned and Color3.fromRGB(120, 230, 120) or Color3.fromRGB(255, 170, 40)
	cs.Parent = card

	local nameLabel = Instance.new("TextLabel")
	nameLabel.Name = "ProductName"
	nameLabel.Position = UDim2.new(0.06, 0, 0.08, 0)
	nameLabel.Size = UDim2.new(0.88, 0, 0.22, 0)
	nameLabel.BackgroundTransparency = 1
	nameLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
	nameLabel.Text = data.name
	nameLabel.Font = Enum.Font.GothamBold
	nameLabel.TextScaled = true
	nameLabel.TextXAlignment = Enum.TextXAlignment.Left
	nameLabel.Parent = card

	local descLabel = Instance.new("TextLabel")
	descLabel.Name = "ProductDesc"
	descLabel.Position = UDim2.new(0.06, 0, 0.32, 0)
	descLabel.Size = UDim2.new(0.88, 0, 0.2, 0)
	descLabel.BackgroundTransparency = 1
	descLabel.TextColor3 = Color3.fromRGB(205, 190, 225)
	descLabel.Text = data.desc
	descLabel.Font = Enum.Font.Gotham
	descLabel.TextScaled = true
	descLabel.TextXAlignment = Enum.TextXAlignment.Left
	descLabel.Parent = card

	local buyButton = Instance.new("TextButton")
	buyButton.Name = "BuyButton"
	buyButton.AnchorPoint = Vector2.new(0.5, 1)
	buyButton.Position = UDim2.new(0.5, 0, 0.92, 0)
	buyButton.Size = UDim2.new(0.7, 0, 0.26, 0)
	buyButton.Font = Enum.Font.GothamBold
	buyButton.TextScaled = true
	buyButton.BorderSizePixel = 0
	buyButton.Parent = card
	local bc = Instance.new("UICorner")
	bc.CornerRadius = UDim.new(0, 8)
	bc.Parent = buyButton

	if data.owned then
		buyButton.BackgroundColor3 = Color3.fromRGB(50, 90, 50)
		buyButton.TextColor3 = Color3.fromRGB(160, 235, 160)
		buyButton.Text = "OWNED"
		buyButton.Active = false
	else
		buyButton.BackgroundColor3 = Color3.fromRGB(255, 170, 40)
		buyButton.TextColor3 = Color3.fromRGB(45, 25, 5)
		buyButton.Text = "BUY  " .. data.price
	end
	return card
end
for i, data in ipairs(products) do
	makeCard(i, data)
end

-- ============ OPEN / CLOSE wiring (opener is NOT a descendant of the sheet) ============
openButton.MouseButton1Click:Connect(function()
	backdrop.Visible = true
	sheet.Visible = true
end)
closeButton.MouseButton1Click:Connect(function()
	sheet.Visible = false
	backdrop.Visible = false
end)