```luau
local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local playerData = DataStoreService:GetDataStore("PlayerData")

local MAX_ATTEMPTS = 3
local profiles: { [Player]: any } = {}

-- The lock is this server's JobId written into the record itself, taken and released through the
-- same atomic transform that reads it. Without it a fast rejoin leaves two servers holding one
-- profile, and the older server's autosave overwrites everything the player did after rejoining.
local function transact(userId: number, transform: (any) -> any): (boolean, any)
	for attempt = 1, MAX_ATTEMPTS do
		local ok, result = pcall(function()
			return playerData:UpdateAsync(`Player_{userId}`, transform)
		end)
		if ok then
			return true, result
		end
		warn(`profile transaction attempt {attempt} failed: {result}`)
		task.wait(2 ^ attempt)
	end
	return false, nil
end

Players.PlayerAdded:Connect(function(player)
	local ok, profile = transact(player.UserId, function(old)
		old = old or { coins = 0, owner = nil }
		if old.owner ~= nil and old.owner ~= game.JobId then
			return nil
		end
		old.owner = game.JobId
		return old
	end)
	if not ok or profile == nil then
		player:Kick("Your save is still open on another server. Please rejoin in a moment.")
		return
	end
	profiles[player] = profile
end)

Players.PlayerRemoving:Connect(function(player)
	local profile = profiles[player]
	profiles[player] = nil
	if profile == nil then
		return
	end
	transact(player.UserId, function(old)
		old = old or profile
		old.coins = profile.coins
		old.owner = nil
		return old
	end)
end)
```
