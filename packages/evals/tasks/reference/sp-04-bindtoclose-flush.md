```luau
local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local coinStore = DataStoreService:GetDataStore("Coins")

local MAX_ATTEMPTS = 3

local function save(player: Player)
	local coins = player:GetAttribute("Coins")
	if typeof(coins) ~= "number" then
		return
	end
	for attempt = 1, MAX_ATTEMPTS do
		local ok, err = pcall(function()
			coinStore:UpdateAsync(`Player_{player.UserId}`, function()
				return coins
			end)
		end)
		if ok then
			return
		end
		warn(`coin save attempt {attempt} for {player.Name} failed: {err}`)
		task.wait(attempt)
	end
end

Players.PlayerRemoving:Connect(save)

-- PlayerRemoving is not reliably delivered for everyone before the process exits on a shutdown or a
-- soft shutdown. BindToClose is the ~30 second window in which the last session can still be
-- flushed; each player is saved on its own thread so one slow write cannot eat the whole budget.
game:BindToClose(function()
	local pending = 0
	for _, player in Players:GetPlayers() do
		pending += 1
		task.spawn(function()
			save(player)
			pending -= 1
		end)
	end
	while pending > 0 do
		task.wait(0.1)
	end
end)
```
