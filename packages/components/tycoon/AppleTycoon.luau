--!strict
--[[
	AppleTycoon: a real tycoon (owner, 2026-10-02: "make me a laundry tycoon" came out as the keyboard's plot simulator
	with washing machines swapped in; "he doesn't focus on what the user asks"). Each player gets a base. Droppers drop
	the game's item onto a conveyor, each machine over the belt turns it into the next thing and multiplies what it is
	worth, the seller at the end pays the base's owner, and buy pads on the floor unlock the next dropper, machine or
	speed-up, one after another. Nothing here is about laundry: the item, the machines and the words come from the config
	the composer wrote from the user's request.

	Map (built by compose-tycoon.ts): Workspace.AppleMap.Tycoons.<n> (Model) with parts Spawn, Conveyor (anchored, the
	belt moves what lies on it), Seller, Drops (Folder), Pads (Folder of parts with attributes Id, Price, Label), and one
	Model per unlockable named by its id in ServerStorage.AppleTycoonParts.<n> until bought. A Dropper model holds a part
	named Spout where its item appears; a Machine model holds a part named Gate on the belt.
	Settings: AppleGameConfig.tycoon = {
		item = { name, color, value },           -- what drops (its look is ServerStorage.AppleTycoonItem when there is one)
		belt = { speed },
		droppers = { [id] = { every, value? } }, -- seconds between drops; value overrides item.value
		machines = { [id] = { times, color, becomes } }, -- what passing under it does to the item
		unlocks = { { id, label, price, after? } }, -- the pads, in order; "after" is the id that must be owned first
		start = { ids built for every player from the start },
		speedUps = { [id] = speed },             -- a pad that makes the belt faster
	}
]]
local AppleTycoon = {}

export type Unlock = { id: string, label: string, price: number, after: string? }

--[[ Pure: the pads a player should see, given what they own: every unlock not owned whose "after" is owned (or none). ]]
function AppleTycoon.visiblePads(unlocks: { Unlock }, owned: { [string]: boolean }): { string }
	local out = {}
	for _, u in unlocks do
		if not owned[u.id] and (u.after == nil or u.after == "" or owned[u.after]) then table.insert(out, u.id) end
	end
	return out
end

--[[ Pure: an item's value after passing a machine. Each machine counts once per item. ]]
function AppleTycoon.passGate(value: number, times: number, alreadyPassed: boolean): number
	if alreadyPassed or type(times) ~= "number" or times <= 0 then return value end
	return math.floor(value * times + 0.5)
end

--[[ Pure: a price as a pad shows it: 1500 -> "$1.5K". ]]
function AppleTycoon.short(n: number): string
	for _, s in { { 1e12, "T" }, { 1e9, "B" }, { 1e6, "M" }, { 1e3, "K" } } do
		if n >= s[1] then return "$" .. (string.format("%.1f", n / s[1]):gsub("%.0$", "")) .. s[2] end
	end
	return "$" .. tostring(math.floor(n))
end

local MAX_LIVE = 30
local ITEM_LIFETIME = 40

function AppleTycoon.start(config: any, economy: any)
	local Players = game:GetService("Players")
	local ServerStorage = game:GetService("ServerStorage")
	local RunService = game:GetService("RunService")

	local cfg = config.tycoon or {}
	local item = cfg.item or {}
	local unlocks: { Unlock } = cfg.unlocks or {}
	local byId: { [string]: Unlock } = {}
	for _, u in unlocks do byId[u.id] = u end
	local startIds: { string } = cfg.start or {}

	local map = workspace:WaitForChild("AppleMap")
	local bases = map:WaitForChild("Tycoons")
	local storage = ServerStorage:WaitForChild("AppleTycoonParts")
	local itemTemplate = ServerStorage:FindFirstChild("AppleTycoonItem")

	type Base = { model: Model, n: string, owner: Player?, owned: { [string]: boolean }, live: { BasePart }, timers: { [string]: number }, speed: number }
	local states: { [Model]: Base } = {}

	local function setBelt(state: Base)
		local belt = state.model:FindFirstChild("Conveyor")
		if belt and belt:IsA("BasePart") then
			belt.AssemblyLinearVelocity = belt.CFrame.RightVector * state.speed
		end
	end

	local function pad(state: Base, id: string): BasePart?
		local pads = state.model:FindFirstChild("Pads")
		local p = pads and pads:FindFirstChild(id)
		return if p and p:IsA("BasePart") then p else nil
	end

	local function showPads(state: Base)
		local visible = {}
		for _, id in AppleTycoon.visiblePads(unlocks, state.owned) do visible[id] = true end
		for _, u in unlocks do
			local p = pad(state, u.id)
			if p then
				local on = visible[u.id] == true and state.owner ~= nil
				p.Transparency = if on then 0 else 1
				p.CanTouch = on
				p.CanCollide = false
				for _, d in p:GetDescendants() do
					if d:IsA("BillboardGui") or d:IsA("SurfaceGui") then d.Enabled = on end
					if d:IsA("Light") then d.Enabled = on end
				end
			end
		end
	end

	local function build(state: Base, id: string)
		state.owned[id] = true
		local held = storage:FindFirstChild(state.n)
		local m = held and held:FindFirstChild(id)
		if m then m.Parent = state.model end
		if cfg.speedUps and cfg.speedUps[id] then
			state.speed = math.max(state.speed, cfg.speedUps[id])
			setBelt(state)
		end
	end

	local function reset(state: Base)
		state.owner = nil
		state.model:SetAttribute("Owner", nil)
		for _, d in state.live do if d.Parent then d:Destroy() end end
		state.live = {}
		local held = storage:FindFirstChild(state.n)
		if held then
			for id in state.owned do
				local m = state.model:FindFirstChild(id)
				if m then m.Parent = held end
			end
		end
		state.owned = {}
		state.speed = (cfg.belt and cfg.belt.speed) or 6
		setBelt(state)
		showPads(state)
	end

	local function spawnAt(state: Base): CFrame?
		local s = state.model:FindFirstChild("Spawn")
		return if s and s:IsA("BasePart") then s.CFrame + Vector3.new(0, 4, 0) else nil
	end

	-- The pads: the owner steps on one, pays, and the thing appears (the next pads appear with it).
	for _, b in bases:GetChildren() do
		if not b:IsA("Model") then continue end
		local state: Base = { model = b, n = b.Name, owner = nil, owned = {}, live = {}, timers = {}, speed = (cfg.belt and cfg.belt.speed) or 6 }
		states[b] = state
		setBelt(state)
		local pads = b:FindFirstChild("Pads")
		for _, u in unlocks do
			local p = pads and pads:FindFirstChild(u.id)
			if not (p and p:IsA("BasePart")) then continue end
			local busy = false
			local label = p:FindFirstChild("Label", true)
			p.Touched:Connect(function(hit: BasePart)
				if busy or not state.owner or state.owned[u.id] or p.Transparency >= 1 then return end
				local character = state.owner.Character
				if not character or not hit:IsDescendantOf(character) then return end
				busy = true
				if economy.spend(state.owner, u.price, "tycoon " .. u.id) then
					build(state, u.id)
					showPads(state)
				elseif label and label:IsA("TextLabel") then
					local was = label.Text
					label.Text = "Need " .. AppleTycoon.short(u.price)
					task.delay(1.2, function() label.Text = was end)
				end
				task.delay(0.6, function() busy = false end)
			end)
		end
		-- The seller: every item that reaches it pays the base's owner once, then goes.
		local seller = b:FindFirstChild("Seller", true)
		local sellPart = if seller and seller:IsA("BasePart") then seller elseif seller and seller:IsA("Model") then seller.PrimaryPart or seller:FindFirstChildWhichIsA("BasePart", true) else nil
		if sellPart then
			sellPart.Touched:Connect(function(hit: BasePart)
				if hit:GetAttribute("TycoonItem") ~= true or hit:GetAttribute("Sold") then return end
				hit:SetAttribute("Sold", true)
				local value = hit:GetAttribute("Value") or 1
				if state.owner then economy.grant(state.owner, value, "tycoon sale") end
				hit:Destroy()
			end)
		end
		reset(state)
	end

	-- A machine's gate turns each item into the next thing, once.
	local function wireGate(state: Base, gate: BasePart, id: string)
		local rule = cfg.machines and cfg.machines[id] or {}
		gate.Touched:Connect(function(hit: BasePart)
			if hit:GetAttribute("TycoonItem") ~= true then return end
			local key = "Passed_" .. id
			local passed = hit:GetAttribute(key) == true
			hit:SetAttribute("Value", AppleTycoon.passGate(hit:GetAttribute("Value") or 1, rule.times or 2, passed))
			if passed then return end
			hit:SetAttribute(key, true)
			if type(rule.color) == "string" then
				local ok, c = pcall(Color3.fromHex, rule.color)
				if ok then hit.Color = c end
			end
			if type(rule.becomes) == "string" then hit.Name = rule.becomes end
			if rule.material and Enum.Material[rule.material] then hit.Material = (Enum.Material :: any)[rule.material] end
		end)
	end
	for _, state in states do
		local function consider(m: Instance)
			if m:IsA("Model") and cfg.machines and cfg.machines[m.Name] then
				local gate = m:FindFirstChild("Gate", true)
				if gate and gate:IsA("BasePart") and not gate:GetAttribute("Wired") then
					gate:SetAttribute("Wired", true)
					wireGate(state, gate, m.Name)
				end
			end
		end
		for _, m in state.model:GetChildren() do consider(m) end
		state.model.ChildAdded:Connect(consider)
	end

	local itemColor = Color3.fromRGB(150, 110, 80)
	if type(item.color) == "string" then
		local ok, c = pcall(Color3.fromHex, item.color)
		if ok then itemColor = c end
	end

	local function drop(state: Base, dropper: Model, id: string)
		local spout = dropper:FindFirstChild("Spout", true)
		if not (spout and spout:IsA("BasePart")) then return end
		local d: BasePart
		if itemTemplate and itemTemplate:IsA("BasePart") then
			d = itemTemplate:Clone()
		else
			local p = Instance.new("Part")
			p.Size = Vector3.new(2.2, 1.4, 2.2) -- big enough to see riding the belt (round 2: the laundry was invisible)
			p.Material = Enum.Material.Fabric
			p.Color = itemColor
			d = p
		end
		d.Name = item.name or "Item"
		d.Anchored = false
		d.CanCollide = true
		d.CanTouch = true
		d.CFrame = spout.CFrame - Vector3.new(0, spout.Size.Y / 2 + d.Size.Y / 2 + 0.1, 0)
		d:SetAttribute("TycoonItem", true)
		local dcfg = cfg.droppers and cfg.droppers[id] or {}
		d:SetAttribute("Value", dcfg.value or item.value or 1)
		local folder = state.model:FindFirstChild("Drops") or state.model
		d.Parent = folder
		pcall(function() d:SetNetworkOwner(nil) end)
		table.insert(state.live, d)
		-- The cap: the oldest goes first, so an idle base cannot bury the server.
		while #state.live > MAX_LIVE do
			local old = table.remove(state.live, 1)
			if old and old.Parent then old:Destroy() end
		end
		task.delay(ITEM_LIFETIME, function() if d.Parent then d:Destroy() end end)
	end

	local clock = 0
	RunService.Heartbeat:Connect(function(dt)
		clock += dt
		for _, state in states do
			if not state.owner then continue end
			for i = #state.live, 1, -1 do if not state.live[i].Parent then table.remove(state.live, i) end end
			for id, rule in (cfg.droppers or {}) do
				if not state.owned[id] then continue end
				local m = state.model:FindFirstChild(id)
				if not (m and m:IsA("Model")) then continue end
				if (state.timers[id] or 0) <= clock then
					state.timers[id] = clock + math.max(0.3, rule.every or 2)
					drop(state, m, id)
				end
			end
		end
	end)

	local function claim(player: Player)
		for _, state in states do if state.owner == player then return end end
		local names = {}
		for b in states do table.insert(names, b.Name) end
		table.sort(names)
		for _, n in names do
			local state = states[bases:FindFirstChild(n) :: Model]
			if state and not state.owner then
				state.owner = player
				state.model:SetAttribute("Owner", player.UserId)
				for _, id in startIds do build(state, id) end
				showPads(state)
				local function place(character: Model)
					local at = spawnAt(state)
					if at then task.defer(function() character:PivotTo(at) end) end
				end
				player.CharacterAdded:Connect(place)
				if player.Character then place(player.Character) end
				return
			end
		end
	end
	Players.PlayerAdded:Connect(claim)
	for _, p in Players:GetPlayers() do task.spawn(claim, p) end
	Players.PlayerRemoving:Connect(function(player)
		for _, state in states do if state.owner == player then reset(state) end end
	end)
end

return AppleTycoon
