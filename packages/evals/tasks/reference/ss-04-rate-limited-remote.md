```luau
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local attack = ReplicatedStorage:WaitForChild("Attack", 10)

local COOLDOWN = 0.5
local lastAttack: { [Player]: number } = {}

attack.OnServerEvent:Connect(function(player)
	local now = os.clock()
	local previous = lastAttack[player]
	if previous ~= nil and now - previous < COOLDOWN then
		return
	end
	lastAttack[player] = now
	print(`{player.Name} attacked`)
end)

-- The table is keyed by Player, so without this the entry survives every player who ever joined and
-- the server leaks memory for as long as it lives.
Players.PlayerRemoving:Connect(function(player)
	lastAttack[player] = nil
end)
```
