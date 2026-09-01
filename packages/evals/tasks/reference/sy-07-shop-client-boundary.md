```luau
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local player = Players.LocalPlayer
local buyItem = ReplicatedStorage:WaitForChild("BuyItem", 10)
local shopResult = ReplicatedStorage:WaitForChild("ShopResult", 10)

local button = script.Parent
local balanceLabel = button.Parent:WaitForChild("Balance", 10)
local ITEM_ID = "sword"

-- The client sends an id and nothing else. It has no say in the price and no way to move the
-- balance; it only renders what the server has already replicated to it.
local function renderBalance()
	local leaderstats = player:FindFirstChild("leaderstats")
	local coins = leaderstats and leaderstats:FindFirstChild("Coins")
	balanceLabel.Text = if coins then string.format("%d coins", coins.Value) else "..."
end

button.Activated:Connect(function()
	button.Active = false
	buyItem:FireServer(ITEM_ID)
end)

shopResult.OnClientEvent:Connect(function(ok: boolean, message: string?)
	button.Active = true
	if not ok and message then
		warn(message)
	end
	renderBalance()
end)

renderBalance()
```
