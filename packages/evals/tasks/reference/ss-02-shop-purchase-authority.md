```luau
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerStorage = game:GetService("ServerStorage")
local buyItem = ReplicatedStorage:WaitForChild("BuyItem", 10)

-- Prices live here, on the server. The client sends an id and nothing else; given the chance to
-- send a price it would eventually send a negative one.
local PRICES = { sword = 100, shield = 250 }

buyItem.OnServerEvent:Connect(function(player, itemId)
	if typeof(itemId) ~= "string" then
		return
	end
	local price = PRICES[itemId]
	if price == nil then
		return
	end
	local leaderstats = player:FindFirstChild("leaderstats")
	local coins = leaderstats and leaderstats:FindFirstChild("Coins")
	if coins == nil or coins.Value < price then
		return
	end
	-- Check and debit with nothing in between. A yield here would let a second fire of the remote
	-- re-enter this handler while the balance still reads the old value, and one payment would buy
	-- two swords.
	coins.Value -= price

	local template = ServerStorage:FindFirstChild(itemId)
	if template then
		template:Clone().Parent = player.Backpack
	end
end)
```
