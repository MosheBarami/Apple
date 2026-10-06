--[[
	Rebirth: Rebirth.rebirth(player) -> ok, message. Costs BASE_COST x COST_GROWTH^rebirths of CURRENCY, resets that
	currency to 0 and adds a rebirth (saved as Currency data "Rebirths"). Rebirth.multiplier(player) is
	1 + rebirths x STEP; multiply earnings by it. Written by StudPilot's rebirth block; edit freely.
]]
local Players = game:GetService("Players")
local Currency = require(script.Parent:WaitForChild("Currency"))

local CURRENCY = {{currency}}
local BASE_COST = {{baseCost}}
local COST_GROWTH = {{costGrowth}}
local STEP = {{multiplierStep}}
local COMPOUND = {{compound}}
local Rebirth = { CURRENCY = CURRENCY }

local function count(player): number return Currency.getData(player, "Rebirths") or 0 end
function Rebirth.cost(player): number return math.floor(BASE_COST * COST_GROWTH ^ count(player)) end
local function multiplierAt(n: number): number return if COMPOUND then STEP ^ n else 1 + n * STEP end
function Rebirth.multiplier(player): number return multiplierAt(count(player)) end

local function show(player)
	player:SetAttribute("Rebirths", count(player))
	player:SetAttribute("Multiplier", Rebirth.multiplier(player))
	player:SetAttribute("NextMultiplier", multiplierAt(count(player) + 1))
	player:SetAttribute("RebirthCost", Rebirth.cost(player))
end

local last = {}
function Rebirth.rebirth(player): (boolean, string)
	local now = os.clock()
	if last[player] and now - last[player] < 1 then return false, "Slow down a little" end
	last[player] = now
	if not Currency.ready(player) then return false, "Loading..." end
	local cost = Rebirth.cost(player)
	local have = Currency.get(player, CURRENCY)
	if have < cost then return false, ("Need %d %s"):format(cost, CURRENCY) end
	if not Currency.spend(player, CURRENCY, have, "rebirth") then return false, "Try again" end
	Currency.setData(player, "Rebirths", count(player) + 1)
	show(player)
	return true, ("Rebirth %d! x%s"):format(count(player), tostring(Rebirth.multiplier(player)))
end

local function join(player)
	while not Currency.ready(player) and player.Parent do task.wait(0.2) end
	if player.Parent then show(player) end
end
Players.PlayerAdded:Connect(join)
for _, p in Players:GetPlayers() do task.spawn(join, p) end
Players.PlayerRemoving:Connect(function(p) last[p] = nil end)
return Rebirth
