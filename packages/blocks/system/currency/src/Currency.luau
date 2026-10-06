--!strict
--[[
	Currency: the game's money, owned by the server. Each player's balances show in leaderstats and as player
	attributes (for screens). Only server scripts change them:
		local Currency = require(game.ServerScriptService.Currency)
		Currency.grant(player, "Coins", 10, "collect")
		if Currency.spend(player, "Coins", 50, "buy sword") then ... end
		Currency.get(player, "Coins"); Currency.getData(player, "Rebirths"); Currency.setData(player, "Rebirths", 2)
	Saving: one versioned record per player in a DataStore, written on leave, on shutdown and every 60 s. A record that
	could not be read is never written over (the player plays unsaved and is told so by the Saving attribute).
	Written by StudPilot's currency block; edit freely.
]]
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")

local CURRENCIES = {{currencies}}
local SAVE_KEY = {{saveKey}}
local VERSION = 1

local Currency = {}
Currency.NAMES = {}
for _, c in CURRENCIES do table.insert(Currency.NAMES, c.name) end

local changed = Instance.new("BindableEvent")
Currency.Changed = changed.Event -- (player, name, newAmount, delta, reason)

type Record = { v: number, balances: { [string]: number }, data: { [string]: any } }
local records: { [Player]: Record } = {}
local canSave: { [Player]: boolean } = {}

local store: DataStore? = nil
do
	local ok, result = pcall(function() return DataStoreService:GetDataStore(SAVE_KEY) end)
	if ok then store = result end
end

--[[ Pure: the balance after a spend, or nil when it cannot be afforded. Amounts are whole and not negative. ]]
function Currency.afterSpend(balance: number, amount: number): number?
	if type(amount) ~= "number" or amount ~= amount or amount < 0 or amount % 1 ~= 0 then return nil end
	if balance < amount then return nil end
	return balance - amount
end

--[[ Pure: the balance after a grant; capped so a runaway loop cannot overflow the display. ]]
function Currency.afterGrant(balance: number, amount: number): number
	if type(amount) ~= "number" or amount ~= amount or amount <= 0 then return balance end
	return math.min(balance + math.floor(amount), 1e15)
end

local function show(player: Player, name: string)
	local record = records[player]
	if not record then return end
	local amount = record.balances[name] or 0
	local stats = player:FindFirstChild("leaderstats")
	local value = stats and stats:FindFirstChild(name)
	if value and value:IsA("NumberValue") then value.Value = amount end
	player:SetAttribute(name, amount)
end

function Currency.get(player: Player, name: string): number
	local record = records[player]
	return record and record.balances[name] or 0
end

function Currency.spend(player: Player, name: string, amount: number, reason: string?): boolean
	local record = records[player]
	if not record or record.balances[name] == nil then return false end
	local after = Currency.afterSpend(record.balances[name], amount)
	if after == nil then return false end
	record.balances[name] = after
	show(player, name)
	changed:Fire(player, name, after, -amount, reason or "spend")
	return true
end

function Currency.grant(player: Player, name: string, amount: number, reason: string?)
	local record = records[player]
	if not record or record.balances[name] == nil then return end
	local before = record.balances[name]
	local after = Currency.afterGrant(before, amount)
	record.balances[name] = after
	show(player, name)
	if after > before then
		-- Lifetime earnings, for "total earned" leaderboards: saved, and the player attribute <name>Earned.
		local key = name .. "Earned"
		record.data[key] = (record.data[key] or 0) + (after - before)
		player:SetAttribute(key, record.data[key])
		changed:Fire(player, name, after, after - before, reason or "grant")
	end
end

function Currency.getData(player: Player, key: string): any
	local record = records[player]
	return record and record.data[key]
end

function Currency.setData(player: Player, key: string, value: any)
	local record = records[player]
	if not record then return end
	record.data[key] = value
	if type(value) == "number" or type(value) == "string" or type(value) == "boolean" then player:SetAttribute(key, value) end
end

local function fresh(): Record
	local r: Record = { v = VERSION, balances = {}, data = {} }
	for _, c in CURRENCIES do r.balances[c.name] = c.start end
	return r
end

local function load(player: Player): (Record, boolean)
	if not store then return fresh(), false end
	for attempt = 1, 3 do
		local ok, saved = pcall(function() return (store :: DataStore):GetAsync("u" .. player.UserId) end)
		if ok then
			local r = fresh()
			if type(saved) == "table" and type(saved.balances) == "table" then
				for name, amount in saved.balances do if type(amount) == "number" then r.balances[name] = amount end end
				if type(saved.data) == "table" then r.data = saved.data end
			end
			return r, true
		end
		task.wait(attempt)
	end
	return fresh(), false -- unread: play on, but never write this over the real record
end

local function save(player: Player)
	local record = records[player]
	if not store or not record or not canSave[player] then return end
	pcall(function()
		(store :: DataStore):UpdateAsync("u" .. player.UserId, function()
			return { v = VERSION, balances = record.balances, data = record.data, at = os.time() }
		end)
	end)
end

local function join(player: Player)
	local stats = player:FindFirstChild("leaderstats") or Instance.new("Folder")
	stats.Name = "leaderstats"
	for _, c in CURRENCIES do
		local value = stats:FindFirstChild(c.name) or Instance.new("NumberValue")
		value.Name = c.name
		value.Parent = stats
	end
	stats.Parent = player
	local record, readable = load(player)
	if player.Parent == nil then return end
	records[player] = record
	canSave[player] = readable
	player:SetAttribute("Saving", readable)
	for key, value in record.data do
		if type(value) == "number" or type(value) == "string" or type(value) == "boolean" then player:SetAttribute(key, value) end
	end
	for _, c in CURRENCIES do show(player, c.name) end
	for _, c in CURRENCIES do changed:Fire(player, c.name, record.balances[c.name], 0, "join") end
end

function Currency.ready(player: Player): boolean
	return records[player] ~= nil
end

Players.PlayerAdded:Connect(join)
for _, p in Players:GetPlayers() do task.spawn(join, p) end
Players.PlayerRemoving:Connect(function(player)
	save(player)
	records[player] = nil
	canSave[player] = nil
end)
game:BindToClose(function()
	for player in records do task.spawn(save, player) end
	task.wait(2)
end)
task.spawn(function()
	while true do
		task.wait(60)
		for player in records do save(player) end
	end
end)

return Currency
