```luau
local KILLS_REQUIRED = 10
local REWARD = 500

local Quest = {}

function Quest.recordKill(player: Player)
	if player:GetAttribute("MonsterQuestCompleted") == true then
		return
	end
	local kills = player:GetAttribute("MonsterKills")
	if typeof(kills) ~= "number" then
		kills = 0
	end
	kills += 1
	player:SetAttribute("MonsterKills", kills)
	if kills < KILLS_REQUIRED then
		return
	end
	-- The completion flag is written before the payout, and it is the same flag the guard at the
	-- top reads. An eleventh kill arriving a frame later finds the quest done and pays nothing.
	player:SetAttribute("MonsterQuestCompleted", true)
	local leaderstats = player:FindFirstChild("leaderstats")
	local coins = leaderstats and leaderstats:FindFirstChild("Coins")
	if coins then
		coins.Value += REWARD
	end
end

return Quest
```
