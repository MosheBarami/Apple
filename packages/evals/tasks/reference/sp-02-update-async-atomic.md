```luau
local DataStoreService = game:GetService("DataStoreService")
local coinStore = DataStoreService:GetDataStore("Coins")

local MAX_ATTEMPTS = 3

-- The read and the write are a single operation. Reading the balance, adding to it and writing it
-- back as separate calls is a lost update: two servers both read 100, both write 150, and one of
-- the two awards is gone with nothing in the logs to show it.
local function awardCoins(userId: number, amount: number): boolean
	for attempt = 1, MAX_ATTEMPTS do
		local ok, err = pcall(function()
			coinStore:UpdateAsync(`Player_{userId}`, function(current)
				return (current or 0) + amount
			end)
		end)
		if ok then
			return true
		end
		warn(`awardCoins attempt {attempt} failed: {err}`)
		task.wait(2 ^ attempt)
	end
	return false
end

return awardCoins
```
