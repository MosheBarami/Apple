```luau
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local buyUpgrade = ReplicatedStorage:WaitForChild("BuyUpgrade", 10)

-- Costs and the ceiling live on the server, and the remote carries no arguments at all: there is no
-- level and no price in the payload for a client to lie about.
local COSTS = { 100, 250, 600, 1500, 4000 }
local SPEEDS = { 18, 22, 26, 30, 36 }
local MAX_LEVEL = #COSTS

buyUpgrade.OnServerEvent:Connect(function(player)
	local level = player:GetAttribute("SpeedLevel")
	if typeof(level) ~= "number" then
		level = 0
	end
	if level >= MAX_LEVEL then
		return
	end
	local nextLevel = level + 1
	local cost = COSTS[nextLevel]
	local leaderstats = player:FindFirstChild("leaderstats")
	local coins = leaderstats and leaderstats:FindFirstChild("Coins")
	if coins == nil or coins.Value < cost then
		return
	end
	coins.Value -= cost
	player:SetAttribute("SpeedLevel", nextLevel)

	local character = player.Character
	local humanoid = character and character:FindFirstChildWhichIsA("Humanoid")
	if humanoid then
		humanoid.WalkSpeed = SPEEDS[nextLevel]
	end
end)
```
