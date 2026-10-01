--!strict
--[[
	AppleWaves: enemies come in numbered waves along lanes to a base. No wave system exists in the owner
	library (survey 2026-09-30), so this one is ours. The composer writes the settings into
	ServerScriptService.AppleComponents.AppleGameConfig (a ModuleScript returning a table), section `waves`:
	  { first = 12, between = 10, baseHealth = 20, rewardShare = "killer" | "everyone",
	    enemies = { Carrot = { health = 30, speed = 6, reward = 5, damage = 1 }, ... },
	    list = { { { enemy = "Carrot", count = 6, every = 1.2 } }, ... } }       -- one entry per wave
	After the last listed wave the game keeps going: each further wave repeats the last one with more
	and tougher enemies (scaleWave), so a round never simply stops.
	World: Workspace.AppleMap.Lanes.<lane> holds waypoint Parts named 1, 2, 3 ... (the last one is at the
	base); enemy models live in ServerStorage.AppleEnemies.<name> (AppleMotion-prepared: anchored root).
	State for any screen: ReplicatedStorage.AppleState attributes Wave, Phase (intermission|wave|lost),
	NextWaveIn, EnemiesLeft, BaseHealth, BaseHealthMax. Live enemies are in Workspace.AppleEnemies with
	attributes Health, MaxHealth, Reward; a defender lowers Health and sets LastHitBy (a UserId).
]]
local AppleWaves = {}

export type Spawn = { enemy: string, count: number, every: number }
export type EnemyStats = { health: number, speed: number, reward: number, damage: number }

-- ============================================================================ pure core

--[[ The spawns of wave n (1-based). Past the listed waves, the last one grows: 25% more enemies and
	20% more health per extra wave. Returns the spawns and a health multiplier. ]]
function AppleWaves.scaleWave(list: { { Spawn } }, n: number): ({ Spawn }, number)
	if #list == 0 then return {}, 1 end
	if n <= #list then return list[n], 1 end
	local extra = n - #list
	local out: { Spawn } = {}
	for _, s in list[#list] do
		table.insert(out, { enemy = s.enemy, count = math.ceil(s.count * (1.25 ^ extra)), every = math.max(0.25, s.every * (0.95 ^ extra)) })
	end
	return out, 1.2 ^ extra
end

--[[ Total enemies in a wave. ]]
function AppleWaves.countOf(spawns: { Spawn }): number
	local n = 0
	for _, s in spawns do n += s.count end
	return n
end

export type Point = { x: number, y: number, z: number }
--[[ Where an enemy is after travelling `distance` along a polyline, and whether it reached the end.
	Returns (point, nextIndex, done): nextIndex is the waypoint it is heading to. ]]
function AppleWaves.along(points: { Point }, distance: number): (Point, number, boolean)
	if #points == 0 then return { x = 0, y = 0, z = 0 }, 1, true end
	local left = math.max(0, distance)
	for i = 1, #points - 1 do
		local a, b = points[i], points[i + 1]
		local dx, dy, dz = b.x - a.x, b.y - a.y, b.z - a.z
		local len = math.sqrt(dx * dx + dy * dy + dz * dz)
		if left <= len and len > 0 then
			local k = left / len
			return { x = a.x + dx * k, y = a.y + dy * k, z = a.z + dz * k }, i + 1, false
		end
		left -= len
	end
	return points[#points], #points, true
end

-- ============================================================================ Roblox glue

function AppleWaves.start(config: any, economy: any?)
	local ReplicatedStorage = game:GetService("ReplicatedStorage")
	local ServerStorage = game:GetService("ServerStorage")
	local RunService = game:GetService("RunService")
	local Players = game:GetService("Players")
	local CollectionService = game:GetService("CollectionService")

	local cfg = config.waves or {}
	local list: { { Spawn } } = cfg.list or {}
	local stats: { [string]: EnemyStats } = cfg.enemies or {}
	local baseMax = cfg.baseHealth or 20

	local state = ReplicatedStorage:FindFirstChild("AppleState") or Instance.new("Configuration")
	state.Name = "AppleState"
	state.Parent = ReplicatedStorage
	local live = workspace:FindFirstChild("AppleEnemies") or Instance.new("Folder")
	live.Name = "AppleEnemies"
	live.Parent = workspace

	local map = workspace:WaitForChild("AppleMap")
	local lanes: { { Point } } = {}
	for _, lane in map:WaitForChild("Lanes"):GetChildren() do
		local pts = {}
		for _, wp in lane:GetChildren() do
			local n = tonumber(wp.Name)
			if n and wp:IsA("BasePart") then pts[n] = { x = wp.Position.X, y = wp.Position.Y, z = wp.Position.Z }; wp.Transparency = 1; wp.CanCollide = false end
		end
		local ordered = {}
		for i = 1, #pts do if pts[i] then table.insert(ordered, pts[i]) end end
		if #ordered >= 2 then table.insert(lanes, ordered) end
	end
	if #lanes == 0 then warn("AppleWaves: Workspace.AppleMap.Lanes has no lane with two or more waypoints"); return end

	type Walker = { model: Model, lane: { Point }, travelled: number, speed: number, lift: number, damage: number }
	local walkers: { [Model]: Walker } = {}
	local templates = ServerStorage:WaitForChild("AppleEnemies")

	local function setState(k: string, v: any) state:SetAttribute(k, v) end
	setState("BaseHealthMax", baseMax)
	setState("BaseHealth", baseMax)

	local function reward(model: Model)
		local amount = model:GetAttribute("Reward") or 0
		if not economy or amount <= 0 then return end
		if cfg.rewardShare == "everyone" then
			for _, p in Players:GetPlayers() do economy.grant(p, amount, "defeat") end
		else
			local by = Players:GetPlayerByUserId(model:GetAttribute("LastHitBy") or 0)
			if by then economy.grant(by, amount, "defeat") end
		end
	end

	local function remove(model: Model, defeated: boolean)
		walkers[model] = nil
		if defeated then
			reward(model)
			model:SetAttribute("Defeated", true)
			task.delay(0.35, function() model:Destroy() end)
		else
			model:Destroy()
		end
		setState("EnemiesLeft", math.max(0, (state:GetAttribute("EnemiesLeft") or 1) - 1))
	end

	local laneTurn = 0
	local function spawnOne(name: string, healthScale: number)
		local template = templates:FindFirstChild(name)
		local s = stats[name]
		if not template or not s then
			warn("AppleWaves: no enemy " .. name)
			setState("EnemiesLeft", math.max(0, (state:GetAttribute("EnemiesLeft") or 1) - 1)) -- or the wave never ends
			return
		end
		laneTurn = laneTurn % #lanes + 1
		local lane = lanes[laneTurn]
		local model = template:Clone() :: Model
		local cf, size = model:GetBoundingBox()
		local lift = model:GetPivot().Position.Y - (cf.Position.Y - size.Y / 2)
		local hp = math.floor(s.health * healthScale + 0.5)
		model:SetAttribute("Health", hp)
		model:SetAttribute("MaxHealth", hp)
		model:SetAttribute("Reward", s.reward)
		model:SetAttribute("Enemy", name)
		CollectionService:AddTag(model, "AppleCreature")
		CollectionService:AddTag(model, "AppleEnemy")
		local start = lane[1]
		model:PivotTo(CFrame.new(start.x, start.y + lift, start.z))
		model.Parent = live
		walkers[model] = { model = model, lane = lane, travelled = 0, speed = s.speed, lift = lift, damage = s.damage }
		model:GetAttributeChangedSignal("Health"):Connect(function()
			if walkers[model] and (model:GetAttribute("Health") or 0) <= 0 then remove(model, true) end
		end)
	end

	RunService.Heartbeat:Connect(function(dt)
		for model, w in walkers do
			if model.Parent == nil then walkers[model] = nil; continue end
			w.travelled += w.speed * dt
			local p, nextIndex, done = AppleWaves.along(w.lane, w.travelled)
			if done then
				setState("BaseHealth", math.max(0, (state:GetAttribute("BaseHealth") or 0) - w.damage))
				remove(model, false)
			else
				local target = w.lane[nextIndex]
				local here = Vector3.new(p.x, p.y + w.lift, p.z)
				local ahead = Vector3.new(target.x, p.y + w.lift, target.z)
				model:PivotTo(if (ahead - here).Magnitude > 0.01 then CFrame.lookAt(here, ahead) else CFrame.new(here))
			end
		end
	end)

	local function clear()
		for model in walkers do model:Destroy() end
		table.clear(walkers)
		setState("EnemiesLeft", 0)
	end

	task.spawn(function()
		local wave = 0
		while true do
			-- Intermission, counted down for the screens.
			local wait = if wave == 0 then (cfg.first or 12) else (cfg.between or 10)
			setState("Phase", "intermission")
			-- A test (Apple's play check) sets Workspace.AppleQuickStart: the countdown then ends in two seconds, so a short
			-- test session sees a wave. Players never set it.
			for t = wait, 1, -1 do
				if workspace:GetAttribute("AppleQuickStart") and t > 2 then continue end
				setState("NextWaveIn", t)
				task.wait(1)
			end
			setState("NextWaveIn", 0)
			while #Players:GetPlayers() == 0 do task.wait(1) end
			wave += 1
			local spawns, scale = AppleWaves.scaleWave(list, wave)
			setState("Wave", wave)
			setState("Phase", "wave")
			setState("EnemiesLeft", AppleWaves.countOf(spawns))
			for _, s in spawns do
				task.spawn(function()
					for _ = 1, s.count do
						if state:GetAttribute("Phase") ~= "wave" then return end
						spawnOne(s.enemy, scale)
						task.wait(s.every)
					end
				end)
			end
			-- The wave ends when every enemy is gone, or the base falls.
			while (state:GetAttribute("EnemiesLeft") or 0) > 0 and (state:GetAttribute("BaseHealth") or 0) > 0 do task.wait(0.25) end
			if (state:GetAttribute("BaseHealth") or 0) <= 0 then
				setState("Phase", "lost")
				clear()
				task.wait(6)
				wave = 0
				setState("Wave", 0)
				setState("BaseHealth", baseMax)
			end
		end
	end)
end

return AppleWaves
