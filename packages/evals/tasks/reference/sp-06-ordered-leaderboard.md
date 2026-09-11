```luau
local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local board = DataStoreService:GetOrderedDataStore("CoinsLeaderboard")

local REFRESH_SECONDS = 60
local TOP_N = 10

Players.PlayerRemoving:Connect(function(player)
	local coins = player:GetAttribute("Coins")
	if typeof(coins) ~= "number" then
		return
	end
	local ok, err = pcall(function()
		board:SetAsync(`Player_{player.UserId}`, math.floor(coins))
	end)
	if not ok then
		warn(`leaderboard publish failed for {player.Name}: {err}`)
	end
end)

-- The 60 seconds is a budget, not politeness: sorted reads are throttled per server, and a tighter
-- loop spends the whole quota refreshing a board nobody watches change that fast.
task.spawn(function()
	while true do
		local ok, page = pcall(function()
			return board:GetSortedAsync(false, TOP_N):GetCurrentPage()
		end)
		if ok then
			for rank, entry in page do
				print(rank, entry.key, entry.value)
			end
		else
			warn(`leaderboard refresh failed: {page}`)
		end
		task.wait(REFRESH_SECONDS)
	end
end)
```
