--!strict
--[[
	AppleEconomy: one currency per player, shown in leaderstats, spent and granted only on the server, and
	saved. The rest of a composed game asks this module for money: AppleEconomy.spend(player, 40) returns
	false when the player cannot afford it, AppleEconomy.grant(player, 5, "kill") adds. Saving uses a
	DataStore when the place allows it (published, Studio API access on) and keeps playing without one.
	Settings come from the module's attributes, so a composer can set them without editing code:
	  Currency (string, default "Coins"), Start (number, default 50), DataKey (string, default "AppleEconomy1").
]]
local Players = game:GetService("Players")

local AppleEconomy = {}

local module = script
local CURRENCY = (module:GetAttribute("Currency") :: string?) or "Coins"
local START = (module:GetAttribute("Start") :: number?) or 50
local DATA_KEY = (module:GetAttribute("DataKey") :: string?) or "AppleEconomy1"

AppleEconomy.CURRENCY = CURRENCY

local changed = Instance.new("BindableEvent")
AppleEconomy.Changed = changed.Event -- (player, newAmount, delta, reason)

local balances: { [Player]: number } = {}
local store: any = nil
local storeWhy: string? = nil

--[[ Pure: the balance after a spend, or nil when it cannot be afforded. Amounts are whole and non-negative. ]]
function AppleEconomy.afterSpend(balance: number, amount: number): number?
	if type(amount) ~= "number" or amount ~= amount or amount < 0 or amount % 1 ~= 0 then return nil end
	if balance < amount then return nil end
	return balance - amount
end

--[[ Pure: the balance after a grant, capped so a runaway loop cannot overflow the display. ]]
function AppleEconomy.afterGrant(balance: number, amount: number): number
	if type(amount) ~= "number" or amount ~= amount or amount <= 0 then return balance end
	return math.min(balance + math.floor(amount), 1e15)
end

local function show(player: Player)
	local stats = player:FindFirstChild("leaderstats")
	local value = stats and stats:FindFirstChild(CURRENCY)
	if value and value:IsA("NumberValue") then value.Value = balances[player] or 0 end
	player:SetAttribute(CURRENCY, balances[player] or 0)
end

function AppleEconomy.get(player: Player): number
	return balances[player] or 0
end

function AppleEconomy.spend(player: Player, amount: number, reason: string?): boolean
	local after = AppleEconomy.afterSpend(balances[player] or 0, amount)
	if after == nil then return false end
	balances[player] = after
	show(player)
	changed:Fire(player, after, -amount, reason or "spend")
	return true
end

function AppleEconomy.grant(player: Player, amount: number, reason: string?)
	if balances[player] == nil then return end
	local after = AppleEconomy.afterGrant(balances[player], amount)
	local delta = after - balances[player]
	balances[player] = after
	show(player)
	if delta > 0 then changed:Fire(player, after, delta, reason or "grant") end
end

local function openStore()
	if store or storeWhy then return end
	local ok, result = pcall(function() return game:GetService("DataStoreService"):GetDataStore(DATA_KEY) end)
	if ok then store = result else storeWhy = tostring(result) end
end

local function load(player: Player): number
	openStore()
	if not store then return START end
	local ok, saved = pcall(function() return store:GetAsync("u" .. player.UserId) end)
	if ok and type(saved) == "table" and type(saved.balance) == "number" then return saved.balance end
	return START
end

local function save(player: Player)
	if not store or balances[player] == nil then return end
	local amount = balances[player]
	pcall(function()
		store:UpdateAsync("u" .. player.UserId, function() return { balance = amount, at = os.time() } end)
	end)
end

local function join(player: Player)
	local stats = player:FindFirstChild("leaderstats") or Instance.new("Folder")
	stats.Name = "leaderstats"
	local value = stats:FindFirstChild(CURRENCY) or Instance.new("NumberValue")
	value.Name = CURRENCY
	value.Parent = stats
	stats.Parent = player
	balances[player] = load(player)
	show(player)
	changed:Fire(player, balances[player], 0, "join")
end

Players.PlayerAdded:Connect(join)
for _, p in Players:GetPlayers() do task.spawn(join, p) end
Players.PlayerRemoving:Connect(function(player)
	save(player)
	balances[player] = nil
end)
game:BindToClose(function()
	for player in balances do save(player) end
end)
task.spawn(function()
	while true do
		task.wait(60)
		for player in balances do save(player) end
	end
end)

return AppleEconomy
