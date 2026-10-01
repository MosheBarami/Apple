--!strict
--[[
	AppleShop: each player gets a plot of tiles; they buy an item and place it on a free tile of their own
	plot; they can sell it back. Everything is checked on the server (their tile, free, affordable).
	Settings: AppleGameConfig.shop = { refund = 0.5, upgrade = { max, damage, range, rate, cost, growth },
	items = { { id, name, price, range, damage, rate, unlock?, projectile?, color?, blurb?, rarity? } } }.
	Progress: an item with `unlock = n` is sold once the player has reached wave n (now or in an earlier session; a game
	with no AppleGameConfig.waves has no waves, so nothing is locked);
	each item has levels bought with AppleUpgrade(id), saved with the player's money, that make every copy of it
	they own hit harder, reach further and throw faster. Item models: ServerStorage.AppleDefenders.<id>. Plots: Workspace.AppleMap.Plots.<n>
	(any container) whose tiles are BaseParts tagged AppleTile. The catalog is published for clients as the JSON
	string ReplicatedStorage.AppleCatalog; buying and selling go through ReplicatedStorage.AppleBuy and AppleSell.
]]
local AppleShop = {}

--[[ Pure: why a purchase is refused, or nil when it may go ahead. ]]
function AppleShop.refusal(item: any, tileOwner: number?, playerId: number, occupied: boolean, balance: number): string?
	if item == nil then return "That item is not sold here." end
	if tileOwner ~= playerId then return "Place it on your own plot." end
	if occupied then return "That spot is taken." end
	if balance < (item.price or 0) then return "Not enough money." end
	return nil
end

export type Upgrade = { max: number, damage: number, range: number, rate: number, cost: number, growth: number }
local UPGRADE: Upgrade = { max = 5, damage = 1.35, range = 1.5, rate = 1.1, cost = 0.8, growth = 1.8 }

--[[ Pure: the upgrade rules, with the game's own numbers over the defaults. ]]
function AppleShop.upgradeRules(given: any?): Upgrade
	local out = table.clone(UPGRADE)
	for k, v in (given or {}) :: any do if type(v) == "number" then (out :: any)[k] = v end end
	return out
end

--[[ Pure: what an item does at a level (1 is as bought). ]]
function AppleShop.stats(item: any, level: number, rules: Upgrade): (number, number, number)
	local up = math.max(0, level - 1)
	return math.floor((item.damage or 5) * rules.damage ^ up + 0.5), (item.range or 16) + rules.range * up, (item.rate or 1) * rules.rate ^ up
end

--[[ Pure: the price of the next level after `level`, or nil at the top. ]]
function AppleShop.upgradeCost(item: any, level: number, rules: Upgrade): number?
	if level >= rules.max then return nil end
	return math.floor((item.price or 10) * rules.cost * rules.growth ^ (level - 1) + 0.5)
end

--[[ Pure: whether an item is still locked for a player who has reached wave `reached`. ]]
function AppleShop.locked(item: any, reached: number): boolean
	return (item.unlock or 0) > reached
end

function AppleShop.start(config: any, economy: any)
	local ReplicatedStorage = game:GetService("ReplicatedStorage")
	local ServerStorage = game:GetService("ServerStorage")
	local Players = game:GetService("Players")
	local CollectionService = game:GetService("CollectionService")

	local cfg = config.shop or {}
	local rules = AppleShop.upgradeRules(cfg.upgrade)
	local items: { [string]: any } = {}
	local public = {}
	for i, item in cfg.items or {} do
		items[item.id] = item
		table.insert(public, { id = item.id, name = item.name or item.id, price = item.price or 0, order = i, blurb = item.blurb, rarity = item.rarity,
			unlock = item.unlock or 0, damage = item.damage or 5, range = item.range or 16, rate = item.rate or 1 })
	end
	local catalog = ReplicatedStorage:FindFirstChild("AppleCatalog") or Instance.new("Folder")
	catalog.Name = "AppleCatalog"
	for _, entry in public do
		local f = catalog:FindFirstChild(entry.id) or Instance.new("Folder")
		f.Name = entry.id
		f:SetAttribute("Name", entry.name)
		f:SetAttribute("Price", entry.price)
		f:SetAttribute("Order", entry.order)
		f:SetAttribute("Blurb", entry.blurb)
		f:SetAttribute("Rarity", entry.rarity)
		f:SetAttribute("Unlock", entry.unlock)
		f:SetAttribute("Damage", entry.damage)
		f:SetAttribute("Range", entry.range)
		f:SetAttribute("Rate", entry.rate)
		f.Parent = catalog
	end
	-- The upgrade rules, so a screen shows the same prices and numbers the server charges and applies.
	for k, v in rules :: any do catalog:SetAttribute("Upgrade" .. k:sub(1, 1):upper() .. k:sub(2), v) end
	catalog.Parent = ReplicatedStorage
	-- Clients render each item's model in its shop card, so a copy of every item model is visible to them.
	local previews = ReplicatedStorage:FindFirstChild("AppleItemModels") or Instance.new("Folder")
	previews.Name = "AppleItemModels"
	previews.Parent = ReplicatedStorage
	local templates = ServerStorage:WaitForChild("AppleDefenders")
	for id in items do
		local t = templates:FindFirstChild(id)
		if t and not previews:FindFirstChild(id) then local copy = t:Clone(); copy.Parent = previews end
	end

	local placed = workspace:FindFirstChild("AppleDefenders") or Instance.new("Folder")
	placed.Name = "AppleDefenders"
	placed.Parent = workspace

	local plots = workspace:WaitForChild("AppleMap"):WaitForChild("Plots")
	-- A game without waves (a plot simulator) has nothing to reach: every item is open and `unlock` is ignored.
	local hasWaves = type(config.waves) == "table"
	local function reached(player: Player): number
		if not hasWaves then return math.huge end
		local state = ReplicatedStorage:FindFirstChild("AppleState") -- AppleWaves makes it, after the shop starts
		local now = if state then (state:GetAttribute("Wave") or 0) else 0
		return math.max(now, economy.getData(player, "BestWave") or 0)
	end
	local function levelOf(player: Player, id: string): number
		return economy.getData(player, "Lv_" .. id) or 1
	end
	-- A model placed by a player does what the item does at that player's level.
	local function apply(model: Instance, item: any, level: number)
		local damage, range, rate = AppleShop.stats(item, level, rules)
		model:SetAttribute("Damage", damage)
		model:SetAttribute("Range", range)
		model:SetAttribute("Rate", rate)
		model:SetAttribute("Level", level)
	end

	-- A copy of an item on a tile, owned by the player (a purchase, or the starter a new player is given).
	local function put(player: Player, id: string, item: any, template: Instance, tile: BasePart)
		local model = template:Clone() :: Model
		local _, size = model:GetBoundingBox()
		local lift = model:GetPivot().Position.Y - (model:GetBoundingBox().Position.Y - size.Y / 2)
		local top = tile.Position + Vector3.new(0, tile.Size.Y / 2, 0)
		local look = tile.CFrame.LookVector
		model:PivotTo(CFrame.lookAt(top + Vector3.new(0, lift, 0), top + Vector3.new(look.X, lift, look.Z)))
		model:SetAttribute("Owner", player.UserId)
		model:SetAttribute("Item", id)
		apply(model, item, levelOf(player, id))
		if item.projectile then model:SetAttribute("Projectile", item.projectile) end
		if item.color then model:SetAttribute("ShotColor", Color3.fromHex(item.color)) end
		model:SetAttribute("Tile", tile:GetFullName())
		CollectionService:AddTag(model, "AppleCreature")
		CollectionService:AddTag(model, "AppleDefender")
		model.Parent = placed
		tile:SetAttribute("Occupied", true)
		model.Destroying:Connect(function() tile:SetAttribute("Occupied", nil) end)
	end

	-- A new player's plot is not empty: shop.starter is placed free on its first tile (owner's critique, 2026-10-01: an
	-- empty 4x4 plot and nothing to do until the first purchase; the agent's answer even promised a starter).
	local function giveStarter(player: Player, plot: Instance)
		local id = cfg.starter
		local item = type(id) == "string" and items[id] or nil
		if not item then return end
		local template = templates:WaitForChild(id, 15)
		if not template or plot:GetAttribute("Owner") ~= player.UserId then return end
		-- On the free tile nearest where the player appears, so it is the first thing they see (round 12 of the owner's
		-- test 1: it went to the far corner of a 36-stud plot).
		local spawnPoint = plot:FindFirstChild("Spawn", true)
		local from = if spawnPoint and spawnPoint:IsA("BasePart") then spawnPoint.Position else nil
		local best, bestDist = nil, math.huge
		for _, tile in plot:GetDescendants() do
			if tile:IsA("BasePart") and CollectionService:HasTag(tile, "AppleTile") and not tile:GetAttribute("Occupied") then
				local d = if from then (tile.Position - from).Magnitude else 0
				-- Beside the spawn, not under it: the tile the player lands on stays free (round 14: they spawned on it).
				local under = from and math.abs(tile.Position.X - from.X) < tile.Size.X / 2 and math.abs(tile.Position.Z - from.Z) < tile.Size.Z / 2
				if not under and d < bestDist then best, bestDist = tile, d end
			end
		end
		if best then put(player, id, item, template, best) end
	end

	local function plotOf(player: Player): Instance?
		for _, plot in plots:GetChildren() do
			if plot:GetAttribute("Owner") == player.UserId then return plot end
		end
		return nil
	end
	local function claim(player: Player)
		if plotOf(player) then return end
		for _, plot in plots:GetChildren() do
			if not plot:GetAttribute("Owner") then
				plot:SetAttribute("Owner", player.UserId)
				plot:SetAttribute("OwnerName", player.DisplayName)
				player:SetAttribute("Plot", plot.Name)
				task.spawn(giveStarter, player, plot)
				for _, d in plot:GetDescendants() do
					if d:IsA("TextLabel") and d.Name == "OwnerName" then d.Text = player.DisplayName end
				end
				local spawnPoint = plot:FindFirstChild("Spawn", true)
				if spawnPoint and spawnPoint:IsA("BasePart") then
					player.RespawnLocation = if spawnPoint:IsA("SpawnLocation") then spawnPoint else nil
					local function go(character: Model) task.wait(0.2); character:PivotTo(spawnPoint.CFrame + Vector3.new(0, 4, 0)) end
					player.CharacterAdded:Connect(go)
					if player.Character then task.spawn(go, player.Character) end
				end
				return
			end
		end
	end
	local function release(player: Player)
		local plot = plotOf(player)
		for _, d in placed:GetChildren() do if d:GetAttribute("Owner") == player.UserId then d:Destroy() end end
		if plot then
			plot:SetAttribute("Owner", nil)
			plot:SetAttribute("OwnerName", nil)
			for _, t in plot:GetDescendants() do
				if t:IsA("BasePart") then t:SetAttribute("Occupied", nil) end
				if t:IsA("TextLabel") and t.Name == "OwnerName" then t.Text = "" end
			end
		end
	end
	Players.PlayerAdded:Connect(claim)
	for _, p in Players:GetPlayers() do task.spawn(claim, p) end
	Players.PlayerRemoving:Connect(release)

	local function remote(class: string, name: string): any
		local r = ReplicatedStorage:FindFirstChild(name) or Instance.new(class)
		r.Name = name
		r.Parent = ReplicatedStorage
		return r
	end

	remote("RemoteFunction", "AppleBuy").OnServerInvoke = function(player: Player, id: any, tile: any)
		if type(id) ~= "string" or typeof(tile) ~= "Instance" or not tile:IsA("BasePart") or not CollectionService:HasTag(tile, "AppleTile") then
			return false, "Pick an item, then a free spot on your plot."
		end
		local item = items[id]
		local plot = plotOf(player)
		local owner = if plot and tile:IsDescendantOf(plot) then player.UserId else nil
		local why = AppleShop.refusal(item, owner, player.UserId, tile:GetAttribute("Occupied") == true, economy.get(player))
		if why then return false, why end
		if AppleShop.locked(item, reached(player)) then return false, ("Unlocks at wave %d."):format(item.unlock) end
		local template = templates:FindFirstChild(id)
		if not template then return false, "That item is not sold here." end
		if not economy.spend(player, item.price or 0, "buy " .. id) then return false, "Not enough money." end
		put(player, id, item, template, tile)
		return true, (item.name or id) .. " placed!"
	end

	remote("RemoteFunction", "AppleUpgrade").OnServerInvoke = function(player: Player, id: any)
		local item = type(id) == "string" and items[id] or nil
		if not item then return false, "That item is not sold here." end
		if AppleShop.locked(item, reached(player)) then return false, ("Unlocks at wave %d."):format(item.unlock) end
		local level = levelOf(player, id)
		local cost = AppleShop.upgradeCost(item, level, rules)
		if not cost then return false, (item.name or id) .. " is at its top level." end
		if not economy.spend(player, cost, "upgrade " .. id) then return false, "Not enough money." end
		level += 1
		economy.setData(player, "Lv_" .. id, level)
		for _, m in placed:GetChildren() do
			if m:GetAttribute("Owner") == player.UserId and m:GetAttribute("Item") == id then apply(m, item, level) end
		end
		return true, ("%s is now level %d!"):format(item.name or id, level)
	end

	remote("RemoteFunction", "AppleSell").OnServerInvoke = function(player: Player, model: any)
		if typeof(model) ~= "Instance" or model.Parent ~= placed or model:GetAttribute("Owner") ~= player.UserId then return false, "That is not yours." end
		local item = items[model:GetAttribute("Item") or ""]
		local back = math.floor((item and item.price or 0) * (cfg.refund or 0.5))
		model:Destroy()
		if back > 0 then economy.grant(player, back, "sell") end
		return true, ("Sold for %d"):format(back)
	end
end

return AppleShop
