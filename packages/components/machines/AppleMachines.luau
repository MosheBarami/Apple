--!strict
--[[
	AppleMachines: the money side of a plot simulator. A player buys a machine in the shop (AppleShop) and places it
	on a tile of their plot; the placed model sits in Workspace.AppleDefenders with attributes Owner (the player's
	UserId), Item (the item id) and Level. Every second each owner is paid, through the economy, the income of every
	machine they own times their multiplier. Their own presses on a machine can pay extra, and a rebirth trades
	everything for a permanent multiplier.

	Settings: AppleGameConfig.machines = { [itemId] = { income = 1, perPress = 0 } }
	          AppleGameConfig.rebirth  = { cost = 1000, growth = 2, multiplier = 0.5 }
	income(item, level)  = item.income * level
	multiplier(player)   = (1 + rebirths * rebirth.multiplier) * every "multiplier" upgrade (AppleUpgrades) to the power of its level
	rebirth cost         = floor(rebirth.cost * rebirth.growth ^ rebirths)
	Rebirth is ReplicatedStorage.AppleRebirth() -> ok, message. It sets the money back to the economy's start, destroys
	the player's placed models, sets their Upgrade_<id> levels to 0 and adds one to the saved "Rebirths".
]]
local AppleMachines = {}

export type Machine = { income: number?, perPress: number? }
export type Rebirth = { cost: number, growth: number, multiplier: number }
export type Held = { owner: any, item: any, level: any }

local REBIRTH: Rebirth = { cost = 1000, growth = 2, multiplier = 0.5 }

--[[ Pure: the rebirth rules, with the game's own numbers over the defaults. ]]
function AppleMachines.rebirthRules(given: any?): Rebirth
	local out = table.clone(REBIRTH)
	for k, v in (given or {}) :: any do if type(v) == "number" and v == v then (out :: any)[k] = v end end
	return out
end

--[[ Pure: what a machine pays each second at a level (1 is as bought). ]]
function AppleMachines.income(item: any, level: any): number
	if type(item) ~= "table" or type(item.income) ~= "number" then return 0 end
	local lv = if type(level) == "number" and level == level then math.max(1, math.floor(level)) else 1
	return math.max(0, item.income) * lv
end

--[[ Pure: what a press of a machine pays, before the multiplier. ]]
function AppleMachines.pressIncome(item: any, level: any): number
	if type(item) ~= "table" or type(item.perPress) ~= "number" then return 0 end
	local lv = if type(level) == "number" and level == level then math.max(1, math.floor(level)) else 1
	return math.max(0, item.perPress) * lv
end

--[[ Pure: the multiplier on everything a player earns. `upgrades` and `levels` are AppleUpgrades' list and the
     player's Upgrade_<id> levels; only the "multiplier" kind counts. ]]
function AppleMachines.multiplier(rebirths: any, perRebirth: number, upgrades: { any }?, levels: { [string]: number }?): number
	local n = if type(rebirths) == "number" and rebirths == rebirths then math.max(0, math.floor(rebirths)) else 0
	local m = 1 + n * perRebirth
	for _, u in upgrades or {} do
		if type(u) == "table" and u.kind == "multiplier" then m *= (u.amount or 2) ^ ((levels or {})[u.id] or 0) end
	end
	return m
end

--[[ Pure: the money needed for the next rebirth. ]]
function AppleMachines.rebirthCost(rules: Rebirth, rebirths: any): number
	local n = if type(rebirths) == "number" and rebirths == rebirths then math.max(0, math.floor(rebirths)) else 0
	return math.floor(rules.cost * rules.growth ^ n)
end

--[[ Pure: why a rebirth is refused, or nil when it may go ahead. The shortfall is named in the game's own currency, never "money". ]]
function AppleMachines.rebirthRefusal(balance: number, cost: number, currency: string?): string?
	if balance < cost then
		return if type(currency) == "string" and currency ~= "" then ("You need more %s to rebirth."):format(currency:lower()) else "You need more to rebirth."
	end
	return nil
end

--[[ Pure: what each owner earns this second before their multiplier: { [owner] = sum of income(machine, level) }. ]]
function AppleMachines.payouts(held: { Held }, machines: { [string]: Machine }): { [number]: number }
	local out: { [number]: number } = {}
	for _, h in held do
		local def = if type(h.item) == "string" then machines[h.item] else nil
		if type(h.owner) == "number" and def then
			out[h.owner] = (out[h.owner] or 0) + AppleMachines.income(def, h.level)
		end
	end
	return out
end

--[[ Pure: whether a press by `userId` on something owned by `owner` is the owner's own. ]]
function AppleMachines.isOwn(owner: any, userId: number): boolean
	return type(owner) == "number" and owner == userId
end

function AppleMachines.start(config: any, economy: any)
	local ReplicatedStorage = game:GetService("ReplicatedStorage")
	local ServerStorage = game:GetService("ServerStorage")
	local Players = game:GetService("Players")
	local TweenService = game:GetService("TweenService")
	if not economy then warn("AppleMachines: there is no economy, so nothing can be paid"); return end

	local machines: { [string]: Machine } = if type(config.machines) == "table" then config.machines else {}
	local rules = AppleMachines.rebirthRules(config.rebirth)

	-- A game without waves still has a HUD that reads AppleState; say it is simply playing.
	if not ReplicatedStorage:FindFirstChild("AppleState") and type(config.waves) ~= "table" then
		local state = Instance.new("Configuration")
		state.Name = "AppleState"
		state:SetAttribute("Phase", "play")
		state.Parent = ReplicatedStorage
	end

	local placed = workspace:FindFirstChild("AppleDefenders") or Instance.new("Folder")
	placed.Name = "AppleDefenders"
	placed.Parent = workspace

	-- AppleUpgrades' list, when the game has upgrades: multiplier upgrades raise every payment.
	local upgrades: { any }? = nil
	local function upgradeList(): { any }
		if upgrades then return upgrades end
		local module = ReplicatedStorage:FindFirstChild("AppleUpgradesConfig")
		if module and module:IsA("ModuleScript") then
			local ok, cfg = pcall(require, module)
			if ok and type(cfg) == "table" and type(cfg.upgrades) == "table" then upgrades = cfg.upgrades end
		end
		return upgrades or {}
	end
	local function levels(player: Player): { [string]: number }
		local out = {}
		for _, u in upgradeList() do out[u.id] = tonumber(player:GetAttribute("Upgrade_" .. u.id)) or 0 end
		return out
	end
	local function rebirthsOf(player: Player): number
		return tonumber(economy.getData(player, "Rebirths")) or 0
	end
	local function multiplierOf(player: Player): number
		return AppleMachines.multiplier(rebirthsOf(player), rules.multiplier, upgradeList(), levels(player))
	end

	local function ownerOf(inst: Instance?): any
		local at = inst
		while at and at ~= workspace do
			local owner = at:GetAttribute("Owner")
			if owner ~= nil then return owner end
			at = at.Parent
		end
		return nil
	end

	local function show(player: Player, perSecond: number?)
		player:SetAttribute("Rebirths", rebirthsOf(player))
		player:SetAttribute("RebirthCost", AppleMachines.rebirthCost(rules, rebirthsOf(player)))
		player:SetAttribute("Multiplier", multiplierOf(player))
		-- After a rebirth: one more rebirth, and upgrade levels back to 0.
		player:SetAttribute("NextMultiplier", AppleMachines.multiplier(rebirthsOf(player) + 1, rules.multiplier, nil, nil))
		if perSecond then player:SetAttribute("IncomePerSecond", perSecond) end
	end
	economy.Changed:Connect(function(player: Player, _amount: number, _delta: number, reason: string)
		if reason == "join" then show(player, 0) end
	end)
	for _, p in Players:GetPlayers() do task.defer(show, p, 0) end

	-- Every second: each owner is paid for every machine they own.
	task.spawn(function()
		while true do
			task.wait(1)
			local held: { Held } = {}
			for _, m in placed:GetChildren() do
				table.insert(held, { owner = m:GetAttribute("Owner"), item = m:GetAttribute("Item"), level = m:GetAttribute("Level") })
			end
			local totals = AppleMachines.payouts(held, machines)
			for _, p in Players:GetPlayers() do
				local pay = math.floor((totals[p.UserId] or 0) * multiplierOf(p))
				if pay > 0 then economy.grant(p, pay, "machine") end
				show(p, pay)
			end
		end
	end)

	-- A press of the owner's own machine can pay extra (a visitor's press never does).
	local pressed = ServerStorage:FindFirstChild("AppleAnimatePressed") or Instance.new("BindableEvent")
	pressed.Name = "AppleAnimatePressed"
	pressed.Parent = ServerStorage
	;(pressed :: BindableEvent).Event:Connect(function(player: Player, model: Instance?)
		if typeof(player) ~= "Instance" or not player:IsA("Player") or typeof(model) ~= "Instance" then return end
		if not AppleMachines.isOwn(ownerOf(model), player.UserId) then return end
		local item = model:GetAttribute("Item")
		local def = if type(item) == "string" then machines[item] else nil
		local pay = math.floor(AppleMachines.pressIncome(def, model:GetAttribute("Level")) * multiplierOf(player))
		if pay > 0 then economy.grant(player, pay, "press") end
	end)

	-- THE ACTIVE ACTION: every machine on a plot can be pressed (a click, a tap, or the prompt beside it). The server counts the press
	-- (ServerStorage.AppleAnimatePressed, which AppleUpgrades and the machine's own perPress above pay from), the player's own machine
	-- answers with a bounce, a spark burst, a sound and a floating "+N", and a visitor's press does nothing. Without this nothing in the
	-- world was pressable, so "+N per press" upgrades paid for an action that could not be taken (owner's recording, 2026-10-04).
	local lastPress: { [Player]: number } = {}
	local lastModel: { [Player]: Instance } = {}
	local function targetPart(model: Instance): BasePart?
		if model:IsA("BasePart") then return model end
		if model:IsA("Model") and model.PrimaryPart then return model.PrimaryPart end
		return model:FindFirstChildWhichIsA("BasePart", true)
	end
	local function feedback(model: Instance, amount: number)
		local part = targetPart(model)
		if not part then return end
		local pop = Instance.new("BillboardGui")
		pop.Name = "PressPop"
		pop.Size = UDim2.new(0, 120, 0, 40)
		pop.StudsOffset = Vector3.new(0, part.Size.Y / 2 + 2, 0)
		pop.AlwaysOnTop = true
		local label = Instance.new("TextLabel")
		label.Size = UDim2.new(1, 0, 1, 0)
		label.BackgroundTransparency = 1
		label.TextScaled = true
		label.Font = Enum.Font.FredokaOne
		label.TextColor3 = Color3.fromRGB(255, 244, 194)
		label.TextStrokeTransparency = 0
		label.Text = "+" .. tostring(amount)
		label.Parent = pop
		pop.Parent = part
		TweenService:Create(pop, TweenInfo.new(0.7, Enum.EasingStyle.Quad), { StudsOffset = pop.StudsOffset + Vector3.new(0, 4, 0) }):Play()
		TweenService:Create(label, TweenInfo.new(0.7), { TextTransparency = 1, TextStrokeTransparency = 1 }):Play()
		task.delay(0.8, function() pop:Destroy() end)
		local sparks = Instance.new("ParticleEmitter")
		sparks.Rate = 0
		sparks.Lifetime = NumberRange.new(0.3, 0.6)
		sparks.Speed = NumberRange.new(8, 14)
		sparks.SpreadAngle = Vector2.new(180, 180)
		sparks.Size = NumberSequence.new(0.5, 0)
		sparks.LightEmission = 1
		sparks.Parent = part
		sparks:Emit(10)
		task.delay(1, function() sparks:Destroy() end)
		local sound = Instance.new("Sound")
		sound.SoundId = "rbxassetid://4612375051"
		sound.Volume = 0.4
		sound.Parent = part
		sound:Play()
		task.delay(1.5, function() sound:Destroy() end)
		if model:IsA("Model") then
			local from = model:GetPivot()
			model:PivotTo(from * CFrame.new(0, 0.5, 0))
			task.delay(0.08, function() if model.Parent then model:PivotTo(from) end end)
		end
	end
	-- Every payer of a press (the machine's own perPress, AppleUpgrades) grants separately: one burst shows their sum.
	local owed: { [Player]: number } = {}
	economy.Changed:Connect(function(player: Player, _amount: number, delta: number, reason: string)
		if reason ~= "press" or delta <= 0 then return end
		local first = owed[player] == nil
		owed[player] = (owed[player] or 0) + delta
		if not first then return end
		task.delay(0.05, function()
			local total = owed[player] or 0
			owed[player] = nil
			local model = lastModel[player]
			if model and model.Parent and total > 0 then feedback(model, total) end
		end)
	end)
	local function press(player: Player, model: Instance)
		if not AppleMachines.isOwn(ownerOf(model), player.UserId) then return end
		local now = os.clock()
		if now - (lastPress[player] or 0) < 0.12 then return end
		lastPress[player] = now
		lastModel[player] = model
		pressed:Fire(player, model, "press")
	end
	local function makePressable(model: Instance)
		if model:GetAttribute("Item") == nil then return end
		local part = targetPart(model)
		if not part or part:FindFirstChild("ApplePress") then return end
		local click = Instance.new("ClickDetector")
		click.Name = "ApplePress"
		click.MaxActivationDistance = 40
		click.MouseClick:Connect(function(player: Player) press(player, model) end)
		click.Parent = part
		local prompt = Instance.new("ProximityPrompt")
		prompt.Name = "ApplePressPrompt"
		prompt.ActionText = "Press"
		prompt.ObjectText = tostring(model:GetAttribute("Item"))
		prompt.HoldDuration = 0
		prompt.MaxActivationDistance = 10
		prompt.RequiresLineOfSight = false
		prompt.Triggered:Connect(function(player: Player) press(player, model) end)
		prompt.Parent = part
	end
	placed.ChildAdded:Connect(function(model) task.defer(makePressable, model) end)
	for _, model in placed:GetChildren() do task.defer(makePressable, model) end
	Players.PlayerRemoving:Connect(function(player) lastPress[player] = nil; lastModel[player] = nil end)

	local remote = ReplicatedStorage:FindFirstChild("AppleRebirth") or Instance.new("RemoteFunction")
	remote.Name = "AppleRebirth"
	remote.Parent = ReplicatedStorage
	local busy: { [Player]: boolean } = {}
	;(remote :: RemoteFunction).OnServerInvoke = function(player: Player)
		if busy[player] then return false, "One moment." end
		busy[player] = true
		local n = rebirthsOf(player)
		local cost = AppleMachines.rebirthCost(rules, n)
		local why = AppleMachines.rebirthRefusal(economy.get(player), cost, economy.CURRENCY)
		if why then
			busy[player] = nil
			return false, why
		end
		-- Money back to the start, machines and upgrade levels gone, one more rebirth.
		economy.spend(player, economy.get(player), "rebirth")
		if (economy.START or 0) > 0 then economy.grant(player, economy.START, "rebirth start") end
		for _, m in placed:GetChildren() do
			if m:GetAttribute("Owner") == player.UserId then m:Destroy() end
		end
		for _, u in upgradeList() do economy.setData(player, "Upgrade_" .. u.id, 0) end
		economy.setData(player, "Rebirths", n + 1)
		show(player, 0)
		busy[player] = nil
		return true, ("Rebirth %d! Everything pays x%s now."):format(n + 1, tostring(math.floor(multiplierOf(player) * 100 + 0.5) / 100))
	end
	Players.PlayerRemoving:Connect(function(p) busy[p] = nil end)
end

return AppleMachines
