--!strict
--[[
	AppleUpgrades: upgrades that really work. Players earn the currency (AppleEconomy) every time they set an
	animated object off (ServerStorage.AppleAnimatePressed: a key, a click, a prompt) and every second, and buy
	upgrades on ReplicatedStorage.AppleUpgradeBuy(id). Every purchase is checked here; levels are kept with the
	money (AppleEconomy.setData "Upgrade_<id>", mirrored as a player attribute for the screen).

	ReplicatedStorage.AppleUpgradesConfig returns
	  { currency, perPress = 1, upgrades = { { id, label, kind = "perPress"|"perSecond"|"multiplier", amount,
	    cost, growth = 1.5, max = 100 } } }
	perPress adds `amount` coins to a press per level, perSecond pays `amount` a second per level, multiplier
	multiplies everything by `amount` per level.
]]
local AppleUpgrades = {}

export type Upgrade = { id: string, label: string?, kind: string, amount: number, cost: number, growth: number?, max: number? }

--[[ Pure: what the next level of an upgrade costs. ]]
function AppleUpgrades.cost(u: Upgrade, level: number): number
	return math.floor(u.cost * (u.growth or 1.5) ^ level + 0.5)
end

--[[ Pure: the multiplier every earning gets from the levels owned. ]]
function AppleUpgrades.multiplier(upgrades: { Upgrade }, levels: { [string]: number }): number
	local m = 1
	for _, u in upgrades do
		if u.kind == "multiplier" then m *= (u.amount or 2) ^ (levels[u.id] or 0) end
	end
	return m
end

--[[ Pure: what one press pays. ]]
function AppleUpgrades.perPress(base: number, upgrades: { Upgrade }, levels: { [string]: number }): number
	local add = base
	for _, u in upgrades do
		if u.kind == "perPress" then add += (u.amount or 1) * (levels[u.id] or 0) end
	end
	return math.floor(add * AppleUpgrades.multiplier(upgrades, levels))
end

--[[ Pure: what a second pays. ]]
function AppleUpgrades.perSecond(upgrades: { Upgrade }, levels: { [string]: number }): number
	local add = 0
	for _, u in upgrades do
		if u.kind == "perSecond" then add += (u.amount or 1) * (levels[u.id] or 0) end
	end
	return math.floor(add * AppleUpgrades.multiplier(upgrades, levels))
end

--[[ Pure: whether a press by `userId` pays: the pressed thing has no owner (nil), or its owner is the presser. ]]
function AppleUpgrades.paysPress(owner: any, userId: number): boolean
	return owner == nil or owner == userId
end

--[[ The Owner attribute (a UserId) of a pressed model or its nearest owned ancestor. ]]
local function ownerOf(inst: Instance?): any
	local at = inst
	while at and at ~= workspace do
		local owner = at:GetAttribute("Owner")
		if owner ~= nil then return owner end
		at = at.Parent
	end
	return nil
end

function AppleUpgrades.start()
	local ReplicatedStorage = game:GetService("ReplicatedStorage")
	local ServerStorage = game:GetService("ServerStorage")
	local Players = game:GetService("Players")
	local folder = game:GetService("ServerScriptService"):WaitForChild("AppleComponents")
	local Economy = require(folder:WaitForChild("AppleEconomy")) :: any
	local config = require(ReplicatedStorage:WaitForChild("AppleUpgradesConfig")) :: any
	local upgrades: { Upgrade } = config.upgrades or {}
	local byId: { [string]: Upgrade } = {}
	for _, u in upgrades do byId[u.id] = u end

	local function levels(player: Player): { [string]: number }
		local out = {}
		for _, u in upgrades do out[u.id] = tonumber(Economy.getData(player, "Upgrade_" .. u.id)) or 0 end
		return out
	end

	local buy = ReplicatedStorage:FindFirstChild("AppleUpgradeBuy") or Instance.new("RemoteFunction")
	buy.Name = "AppleUpgradeBuy"
	buy.Parent = ReplicatedStorage
	local last: { [Player]: number } = {}
	;(buy :: RemoteFunction).OnServerInvoke = function(player: Player, id: any)
		if type(id) ~= "string" or not byId[id] then return false, "No such upgrade" end
		if os.clock() - (last[player] or 0) < 0.15 then return false, "Slow down" end
		last[player] = os.clock()
		local u = byId[id]
		local level = levels(player)[id]
		if level >= (u.max or 100) then return false, "Maxed out!" end
		local price = AppleUpgrades.cost(u, level)
		if not Economy.spend(player, price, "upgrade " .. id) then return false, "Not enough " .. Economy.CURRENCY end
		Economy.setData(player, "Upgrade_" .. id, level + 1)
		return true, (u.label or id) .. " is level " .. (level + 1)
	end
	Players.PlayerRemoving:Connect(function(p) last[p] = nil end)

	-- The screen shows the config's currency; when the economy keeps its money under another name (a game composed with
	-- Coins, upgrades that say Taps) the balance is mirrored under the config's name too, so the counter is never stuck.
	local shown = config.currency or Economy.CURRENCY
	if shown ~= Economy.CURRENCY then
		Economy.Changed:Connect(function(player: Player, amount: number) player:SetAttribute(shown, amount) end)
		for _, p in Players:GetPlayers() do p:SetAttribute(shown, Economy.get(p)) end
	end

	-- Show every player's level from the start, even before they buy one.
	local function show(player: Player)
		for id, level in levels(player) do player:SetAttribute("Upgrade_" .. id, level) end
	end
	Economy.Changed:Connect(function(player: Player, _amount: number, _delta: number, reason: string)
		if reason == "join" then show(player) end
	end)
	for _, p in Players:GetPlayers() do task.defer(show, p) end

	local base = tonumber(config.perPress) or 1
	local pressed = ServerStorage:FindFirstChild("AppleAnimatePressed") or Instance.new("BindableEvent")
	pressed.Name = "AppleAnimatePressed"
	pressed.Parent = ServerStorage
	;(pressed :: BindableEvent).Event:Connect(function(player: Player, model: Instance?)
		-- Another player's machine pays its owner, never a visitor who clicks or steps on it.
		if typeof(player) == "Instance" and player:IsA("Player") and AppleUpgrades.paysPress(ownerOf(model), player.UserId) then
			local pay = AppleUpgrades.perPress(base, upgrades, levels(player))
			player:SetAttribute("PerPress", pay) -- what the "+N" over a pressed key says (AppleAnimateClient)
			Economy.grant(player, pay, "press")
		end
	end)

	task.spawn(function()
		while true do
			task.wait(1)
			for _, p in Players:GetPlayers() do
				local pay = AppleUpgrades.perSecond(upgrades, levels(p))
				if pay > 0 then Economy.grant(p, pay, "auto") end
			end
		end
	end)
end

if script and script:IsA("Script") then AppleUpgrades.start() end
return AppleUpgrades
