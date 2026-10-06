--[[
	Upgrades: Upgrades.buy(player, name) -> ok, message; Upgrades.level(player, name) -> number. Level n+1 costs
	cost x growth^n of CURRENCY; refused at max or without the money. Levels saved as Currency data "Upgrades".
	Written by StudPilot's upgrades block; edit freely.
]]
local Players = game:GetService("Players")
local Currency = require(script.Parent:WaitForChild("Currency"))

local CURRENCY = {{currency}}
local LIST = {{upgrades}}
local Upgrades = { CURRENCY = CURRENCY, LIST = LIST }
local byName = {}
for _, u in LIST do byName[u.name] = u end

local function levels(player)
	local t = Currency.getData(player, "Upgrades")
	if type(t) ~= "table" then t = {} end
	return t
end
local function key(name) return "Upgrade_" .. string.gsub(name, "[^%w]", "") end

--[[ Pure: the price of the next level from `level`, or nil at the max. ]]
function Upgrades.price(u, level: number): number?
	if level >= u.max then return nil end
	return math.floor(u.cost * u.growth ^ level)
end

function Upgrades.level(player, name: string): number return levels(player)[name] or 0 end
function Upgrades.cost(player, name: string): number?
	local u = byName[name]
	return u and Upgrades.price(u, Upgrades.level(player, name))
end

local function show(player)
	for _, u in LIST do
		local lv = Upgrades.level(player, u.name)
		player:SetAttribute(key(u.name) .. "_Level", lv)
		player:SetAttribute(key(u.name) .. "_Cost", Upgrades.price(u, lv) or -1)
	end
end

local last = {}
function Upgrades.buy(player, name): (boolean, string)
	if type(name) ~= "string" or not byName[name] then return false, "Unknown upgrade" end
	local now = os.clock()
	if last[player] and now - last[player] < 0.25 then return false, "Too fast" end
	last[player] = now
	if not Currency.ready(player) then return false, "Loading..." end
	local u = byName[name]
	local t = levels(player)
	local price = Upgrades.price(u, t[name] or 0)
	if not price then return false, "Max level" end
	if not Currency.spend(player, CURRENCY, price, "upgrade " .. name) then return false, "Need more " .. CURRENCY end
	t[name] = (t[name] or 0) + 1
	Currency.setData(player, "Upgrades", t)
	show(player)
	return true, ("Level %d!"):format(t[name])
end

local function join(player)
	while not Currency.ready(player) and player.Parent do task.wait(0.2) end
	if player.Parent then show(player) end
end
Players.PlayerAdded:Connect(join)
for _, p in Players:GetPlayers() do task.spawn(join, p) end
Players.PlayerRemoving:Connect(function(p) last[p] = nil end)
return Upgrades
