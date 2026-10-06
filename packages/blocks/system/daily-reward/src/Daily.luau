--[[
	Daily: one claim per UTC day. Daily.claim(player) -> ok, message. The streak goes on when the last claim was
	yesterday and starts again at 1 otherwise. Saved as Currency data "DailyDay" and "DailyStreak". Player attributes
	DailyStreak, DailyReady and DailyNextDay are kept for screens. Written by StudPilot's daily-reward block; edit freely.
]]
local Players = game:GetService("Players")
local Currency = require(script.Parent:WaitForChild("Currency"))

local CURRENCY = {{currency}}
local REWARDS = {{rewards}}
local Daily = { REWARDS = REWARDS, CURRENCY = CURRENCY }

local function today(): number return math.floor(os.time() / 86400) end

--[[ Pure: the streak after a claim today, or nil when today was already claimed. ]]
function Daily.next(lastDay: number?, streak: number, day: number): number?
	if lastDay == day then return nil end
	if lastDay == day - 1 then return streak + 1 end
	return 1
end

function Daily.amount(streak: number): number
	return REWARDS[math.min(streak, #REWARDS)]
end

local function show(player)
	local lastDay = Currency.getData(player, "DailyDay")
	local streak = Currency.getData(player, "DailyStreak") or 0
	local live = lastDay == today() - 1 or lastDay == today()
	player:SetAttribute("DailyStreak", live and streak or 0)
	player:SetAttribute("DailyReady", lastDay ~= today())
	local upcoming = Daily.next(lastDay, live and streak or 0, today()) or ((live and streak or 0) + 1)
	player:SetAttribute("DailyNextDay", upcoming)
	player:SetAttribute("DailyNextAmount", Daily.amount(upcoming))
end

local last = {}
function Daily.claim(player): (boolean, string)
	local now = os.clock()
	if last[player] and now - last[player] < 1 then return false, "Slow down a little" end
	last[player] = now
	if not Currency.ready(player) then return false, "Loading..." end
	local day = today()
	local streak = Daily.next(Currency.getData(player, "DailyDay"), Currency.getData(player, "DailyStreak") or 0, day)
	if not streak then return false, "Come back tomorrow!" end
	Currency.setData(player, "DailyDay", day)
	Currency.setData(player, "DailyStreak", streak)
	local amount = Daily.amount(streak)
	Currency.grant(player, CURRENCY, amount, "daily day " .. streak)
	show(player)
	return true, ("Day %d: +%d %s"):format(streak, amount, CURRENCY)
end

local function join(player)
	while not Currency.ready(player) and player.Parent do task.wait(0.2) end
	if player.Parent then show(player) end
end
Players.PlayerAdded:Connect(join)
for _, p in Players:GetPlayers() do task.spawn(join, p) end
Players.PlayerRemoving:Connect(function(p) last[p] = nil end)
return Daily
