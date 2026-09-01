```luau
local DataStoreService = game:GetService("DataStoreService")
local playerData = DataStoreService:GetDataStore("PlayerData")

local MAX_ATTEMPTS = 3

local DataSaver = {}

-- pcall on its own converts a crash into SILENT data loss, which is the worse outcome: the progress
-- is gone and the server looks healthy. The dominant failure is a throttle that succeeds a second
-- later, so the retry is the part that actually saves the player's session.
function DataSaver.savePlayerData(userId: number, data: { [string]: any }): boolean
	local lastError
	for attempt = 1, MAX_ATTEMPTS do
		local ok, err = pcall(function()
			playerData:UpdateAsync(`Player_{userId}`, function()
				return data
			end)
		end)
		if ok then
			return true
		end
		lastError = err
		task.wait(2 ^ attempt)
	end
	warn(`savePlayerData failed for {userId} after {MAX_ATTEMPTS} attempts: {lastError}`)
	return false
end

return DataSaver
```
