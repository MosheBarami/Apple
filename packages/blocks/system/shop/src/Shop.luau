--[[
	Shop: the server answers every purchase: Shop.buy(player, name) -> ok, message (ShopStart serves it to clients as
	ReplicatedStorage.ShopBuy:InvokeServer(name)).
	Refused: an unknown name, an item already owned (when ONCE), a price the player cannot pay, or a second request within
	half a second. Owned items are saved in the currency record (Currency.getData(player, "Owned")) and mirrored as the
	player attribute Owns_<name without spaces> for screens. Written by StudPilot's shop block; edit freely.
]]
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Currency = require(script.Parent:WaitForChild("Currency"))

local CURRENCY = {{currency}}
local ITEMS = {{items}}
local ONCE = {{once}}

local byName = {}
for _, item in ITEMS do byName[item.name] = item end

local Shop = { CURRENCY = CURRENCY, ITEMS = ITEMS, ONCE = ONCE }

local function key(name) return "Owns_" .. string.gsub(name, "[^%w]", "") end
local last = {}

local function owned(player)
	local list = Currency.getData(player, "Owned")
	if type(list) ~= "table" then list = {} end
	return list
end

function Shop.buy(player, name): (boolean, string)
	if type(name) ~= "string" then return false, "Unknown item" end
	local item = byName[name]
	if not item then return false, "Unknown item" end
	local now = os.clock()
	if last[player] and now - last[player] < 0.5 then return false, "Too fast" end
	last[player] = now
	if not Currency.ready(player) then return false, "Loading..." end
	local list = owned(player)
	if ONCE and list[name] then return false, "Owned" end
	if not Currency.spend(player, CURRENCY, item.price, "shop: " .. name) then return false, "Need more " .. CURRENCY end
	list[name] = true
	Currency.setData(player, "Owned", list)
	player:SetAttribute(key(name), true)
	return true, "Bought!"
end

local function showOwned(player)
	while not Currency.ready(player) and player.Parent do task.wait(0.2) end
	for name in owned(player) do player:SetAttribute(key(name), true) end
end
Players.PlayerAdded:Connect(showOwned)
for _, p in Players:GetPlayers() do task.spawn(showOwned, p) end
Players.PlayerRemoving:Connect(function(p) last[p] = nil end)

return Shop
