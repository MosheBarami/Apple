```luau
local DataStoreService = game:GetService("DataStoreService")
local playerData = DataStoreService:GetDataStore("PlayerData")

local REBIRTH_COST = 10000
local MAX_ATTEMPTS = 3

-- The whole rebirth is one atomic transform: the balance is read, spent and the counter raised
-- inside a single store operation. Split across two calls, a player firing the remote twice in the
-- same second rebirths twice off one balance — and the second rebirth is free.
local function rebirth(userId: number): boolean
	for attempt = 1, MAX_ATTEMPTS do
		local ok, profile = pcall(function()
			return playerData:UpdateAsync(`Player_{userId}`, function(old)
				old = old or { coins = 0, rebirths = 0 }
				if (old.coins or 0) < REBIRTH_COST then
					return nil
				end
				old.coins = 0
				old.rebirths = (old.rebirths or 0) + 1
				return old
			end)
		end)
		if ok then
			return profile ~= nil
		end
		warn(`rebirth attempt {attempt} failed: {profile}`)
		task.wait(attempt)
	end
	return false
end

return rebirth
```
