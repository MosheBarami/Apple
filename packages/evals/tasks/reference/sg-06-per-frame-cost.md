```luau
local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local NEAR = 30
local SAMPLE_INTERVAL = 0.1

local player = Players.LocalPlayer
local coins: { BasePart } = {}
local root: BasePart? = nil

-- The workspace is walked once, and after that only when the coin set actually changes. What is
-- left on the per-frame path is arithmetic over a list that is already in hand — the original cost
-- was proportional to the whole DataModel and grew with every part the game ever added.
for _, coin in CollectionService:GetTagged("Coin") do
	table.insert(coins, coin)
end
CollectionService:GetInstanceAddedSignal("Coin"):Connect(function(coin)
	table.insert(coins, coin)
end)
CollectionService:GetInstanceRemovedSignal("Coin"):Connect(function(coin)
	local index = table.find(coins, coin)
	if index then
		table.remove(coins, index)
	end
end)

local function bindCharacter(character: Model)
	root = character:WaitForChild("HumanoidRootPart", 10)
end
if player.Character then
	bindCharacter(player.Character)
end
player.CharacterAdded:Connect(bindCharacter)

local accumulated = 0
RunService.RenderStepped:Connect(function(delta: number)
	accumulated += delta
	if accumulated < SAMPLE_INTERVAL then
		return
	end
	accumulated = 0
	if root == nil then
		return
	end
	for _, coin in coins do
		coin.Transparency = if (coin.Position - root.Position).Magnitude < NEAR then 0 else 0.8
	end
end)
```
