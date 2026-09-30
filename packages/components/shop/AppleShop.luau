--!strict
--[[
	AppleShop: each player gets a plot of tiles; they buy an item and place it on a free tile of their own
	plot; they can sell it back. Everything is checked on the server (their tile, free, affordable).
	Settings: AppleGameConfig.shop = { refund = 0.5, items = { { id, name, price, range, damage, rate,
	projectile?, color? } } }. Item models: ServerStorage.AppleDefenders.<id>. Plots: Workspace.AppleMap.Plots.<n>
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

function AppleShop.start(config: any, economy: any)
	local ReplicatedStorage = game:GetService("ReplicatedStorage")
	local ServerStorage = game:GetService("ServerStorage")
	local Players = game:GetService("Players")
	local CollectionService = game:GetService("CollectionService")
	local HttpService = game:GetService("HttpService")

	local cfg = config.shop or {}
	local items: { [string]: any } = {}
	local public = {}
	for i, item in cfg.items or {} do
		items[item.id] = item
		table.insert(public, { id = item.id, name = item.name or item.id, price = item.price or 0, order = i })
	end
	local catalog = ReplicatedStorage:FindFirstChild("AppleCatalog") or Instance.new("StringValue")
	catalog.Name = "AppleCatalog"
	catalog.Value = HttpService:JSONEncode(public)
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
		local template = templates:FindFirstChild(id)
		if not template then return false, "That item is not sold here." end
		if not economy.spend(player, item.price or 0, "buy " .. id) then return false, "Not enough money." end
		local model = template:Clone() :: Model
		local _, size = model:GetBoundingBox()
		local lift = model:GetPivot().Position.Y - (model:GetBoundingBox().Position.Y - size.Y / 2)
		local top = tile.Position + Vector3.new(0, tile.Size.Y / 2, 0)
		local look = tile.CFrame.LookVector
		model:PivotTo(CFrame.lookAt(top + Vector3.new(0, lift, 0), top + Vector3.new(look.X, lift, look.Z)))
		model:SetAttribute("Owner", player.UserId)
		model:SetAttribute("Item", id)
		model:SetAttribute("Range", item.range or 16)
		model:SetAttribute("Damage", item.damage or 5)
		model:SetAttribute("Rate", item.rate or 1)
		if item.projectile then model:SetAttribute("Projectile", item.projectile) end
		if item.color then model:SetAttribute("ShotColor", Color3.fromHex(item.color)) end
		model:SetAttribute("Tile", tile:GetFullName())
		CollectionService:AddTag(model, "AppleCreature")
		CollectionService:AddTag(model, "AppleDefender")
		model.Parent = placed
		tile:SetAttribute("Occupied", true)
		model.Destroying:Connect(function() tile:SetAttribute("Occupied", nil) end)
		return true, (item.name or id) .. " placed!"
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
