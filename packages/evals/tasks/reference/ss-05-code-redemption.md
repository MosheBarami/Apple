```luau
local DataStoreService = game:GetService("DataStoreService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local CODES = { launch = 100, summer = 250 }
local MAX_ATTEMPTS = 3

local redeemedStore = DataStoreService:GetDataStore("RedeemedCodes")
local redeemCode = ReplicatedStorage:WaitForChild("RedeemCode", 10)

-- Claiming the code and recording the claim are one atomic transform, so a player spamming the
-- remote from two servers at once still gets paid exactly once. A read-then-write pair here would
-- be the standard duplication exploit.
local function claim(userId: number, code: string): boolean
	for attempt = 1, MAX_ATTEMPTS do
		local ok, claimed = pcall(function()
			return redeemedStore:UpdateAsync(`Player_{userId}`, function(old)
				old = old or {}
				if old[code] then
					return nil
				end
				old[code] = true
				return old
			end)
		end)
		if ok then
			return claimed ~= nil
		end
		warn(`code claim attempt {attempt} failed: {claimed}`)
		task.wait(attempt)
	end
	return false
end

redeemCode.OnServerEvent:Connect(function(player, code)
	if typeof(code) ~= "string" or #code > 32 then
		return
	end
	local normalised = string.lower(code)
	local reward = CODES[normalised]
	if reward == nil then
		return
	end
	if not claim(player.UserId, normalised) then
		return
	end
	local leaderstats = player:FindFirstChild("leaderstats")
	local coins = leaderstats and leaderstats:FindFirstChild("Coins")
	if coins then
		coins.Value += reward
	end
end)
```
