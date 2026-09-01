--!strict
--[[
	Crystal Canyon — crystal spawning and the server-authoritative collection sweep.

	Collection is a server sweep, never a client claim. There is deliberately no
	"I picked this up" remote: the server measures the distance from the
	character's HumanoidRootPart itself, so a modified client can lie about
	nothing except where its own character is standing — and that is already
	constrained by the physics replication the engine enforces.

	Two independent loops share one Heartbeat connection:

	  * the SWEEP, rate-limited to Config.Collect.TickRate, which decides what was
	    collected and what respawned;
	  * the ANIMATION, which runs every frame so the gems spin smoothly.

	They are separate because they have opposite cost profiles. The sweep must be
	allocation-free per crystal (see sweep() below); the animation necessarily
	builds one CFrame per visible crystal per frame, which is the price of
	server-side motion and is why it touches only the anchored root of each gem.
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("CrystalCanyon")
local Config = require(Shared:WaitForChild("Config"))
local Util = require(Shared:WaitForChild("Util"))
local Palette = require(Shared:WaitForChild("Palette"))
local Movement = require(script.Parent.Movement)

-- Services are reached through ctx only; the three modules above are shared
-- data with no init order of their own, so requiring them directly is safe and
-- keeps this file readable.
type Ctx = {
	Config: any,
	Util: any,
	Remotes: Folder,
	Data: any,
	Economy: any,
	Upgrades: any,
	Zones: any,
	Collect: any,
	Codes: any,
	Shop: any,
}

type Crystal = {
	model: Model,
	core: BasePart,
	parts: { BasePart },
	light: PointLight,
	basePos: Vector3,
	tilt: CFrame,
	phase: number,
	active: boolean,
	respawnAt: number,
}

type ZoneState = {
	id: string,
	value: number,
	respawn: number,
	color: Color3,
	records: { Crystal },
	-- Copied from Config at spawn so the locked-zone notice costs no lookup per tick.
	bounds: { Min: Vector3, Max: Vector3 },
	name: string,
	cost: number,
}

local Collect = {}

local ctx: Ctx = nil :: any
local zoneStates: { ZoneState } = {}
local remotePop: RemoteEvent = nil :: any
local remoteNotify: RemoteEvent = nil :: any

-- Fixed base so the canyon's crystal layout is identical on every server and
-- across every run: a screenshot diff between two builds is then a real signal.
local SEED_BASE = 20260831
local SEED_STRIDE = 7919

-- Scatter shaping.
local EDGE_MARGIN = 6 -- keep gems off the zone boundary so none clips a cliff
local MIN_GAP = 9 -- rejection-sampled minimum separation, in studs
local PLACE_ATTEMPTS = 24
local HOVER_HEIGHT = 2.4 -- centre height above the zone's ground plane

-- Gem proportions. Oversized on purpose (§7: realistic scale reads as empty).
--[[ SCALED UP FOR §7. V11.

	 §7 asks for props "oversized relative to the player". A crystal was about 1.5 studs tall
	 against a ~5-stud character — the visual critic called them undersized, and they are the
	 one prop in the game a player is meant to spot from across a field and walk toward.

	 1.8× makes a crystal roughly 3 studs: still smaller than the character, which is right for
	 something you collect, but large enough to read as a target at the distance the magnet
	 radius (7 studs at level 0) actually operates over.

	 Applied as a factor rather than by editing three vectors, so the proportions between core,
	 wedge and shard — which were tuned together — cannot drift apart in a later edit. ]]
local CRYSTAL_SCALE = 1.8
local CORE_SIZE = Vector3.new(1.15, 1.5, 1.15) * CRYSTAL_SCALE
local WEDGE_SIZE = Vector3.new(1.15, 0.85, 0.575) * CRYSTAL_SCALE
local SHARD_SIZE = Vector3.new(0.55, 0.95, 0.55) * CRYSTAL_SCALE

local BOB_HEIGHT = 0.35
local BOB_SPEED = 1.6
local SPIN_SPEED = 0.9

-- One pack-full toast per player per this many seconds. Without it a player who
-- stands in a crystal field with a full pack gets ten toasts a second.
local FULL_NOTIFY_COOLDOWN = 3
local lastFullNotify: { [Player]: number } = {}

-- H1: standing in a locked zone used to be completely silent. Collect refuses the
-- award (that refusal IS the security boundary and has not changed), but the player
-- got no crystals and no reason -- indistinguishable from the game being broken.
-- Longer than the pack-full cooldown because walking the length of a locked zone is
-- one continuous mistake, not a repeated one.
local LOCKED_NOTIFY_COOLDOWN = 8
local lastLockedNotify: { [Player]: number } = {}

--[[ Where each player was at the previous sweep, so the next one can ask whether they could
	 have walked here. Cleared on death and on leaving, because a respawn is a legitimate
	 teleport and a stale sample would flag the first tick after it. ]]
local lastStep: { [Player]: { x: number, z: number, t: number } } = {}

local FLIP = CFrame.Angles(math.pi, 0, 0)

--[[ Find or create a container. It deliberately never destroys an existing
	 child of the wrong class: Workspace.Canyon is built at edit time by
	 world/Build.luau, and a runtime module that felt entitled to delete it
	 because it was a Model rather than a Folder would erase the whole world. ]]
local function ensureFolder(parent: Instance, name: string): Instance
	local existing = parent:FindFirstChild(name)
	if existing then
		return existing
	end
	local folder = Instance.new("Folder")
	folder.Name = name
	folder.Parent = parent
	return folder
end

local function decorate(part: BasePart, color: Color3)
	part.Anchored = false
	part.CanCollide = false
	part.CanTouch = false
	-- Crystals must never appear in a raycast: they sit in the open where the
	-- camera and any future mouse-target code would otherwise catch them.
	part.CanQuery = false
	part.CastShadow = false
	part.Material = Enum.Material.SmoothPlastic
	part.Color = color
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
end

--[[ A faceted low-poly gem: a diamond core capped by a mirrored wedge pair top
	 and bottom, plus one small satellite shard so it reads as a cluster rather
	 than a lone block (§7: props are clustered, never evenly scattered).

	 Only the core is anchored. Everything else is welded to it, which makes the
	 whole assembly anchored in the solver while costing exactly one replicated
	 part when the animation moves it. ]]
local function buildCrystal(zone: any, index: number, position: Vector3, rng: Random): Crystal
	local base = zone.CrystalColor
	local bright = Palette.lift(base, 0.24)
	local deep = Palette.shade(base, 0.2)

	local model = Instance.new("Model")
	model.Name = `Crystal_{index}`

	local core = Instance.new("Part")
	core.Name = "Core"
	core.Size = CORE_SIZE
	decorate(core, base)
	core.Anchored = true
	core.CFrame = CFrame.new(position)
	core.Parent = model
	model.PrimaryPart = core

	local parts: { BasePart } = { core }

	local capY = CORE_SIZE.Y * 0.5 + WEDGE_SIZE.Y * 0.5
	local capZ = WEDGE_SIZE.Z * 0.5
	-- Two wedges back-to-back make a ridged cap; the same pair flipped through
	-- FLIP makes the point underneath, giving the octahedral silhouette.
	local caps = {
		{ cf = CFrame.new(0, capY, -capZ), color = bright },
		{ cf = CFrame.new(0, capY, capZ) * CFrame.Angles(0, math.pi, 0), color = bright },
		{ cf = FLIP * CFrame.new(0, capY, -capZ), color = deep },
		{ cf = FLIP * (CFrame.new(0, capY, capZ) * CFrame.Angles(0, math.pi, 0)), color = deep },
	}

	for i = 1, #caps do
		local cap = caps[i]
		local wedge = Instance.new("WedgePart")
		wedge.Name = `Facet{i}`
		wedge.Size = WEDGE_SIZE
		decorate(wedge, cap.color)
		wedge.Massless = true
		wedge.CFrame = core.CFrame * cap.cf
		wedge.Parent = model
		parts[#parts + 1] = wedge
	end

	local shard = Instance.new("Part")
	shard.Name = "Shard"
	shard.Size = SHARD_SIZE
	decorate(shard, bright)
	shard.Massless = true
	shard.CFrame = core.CFrame * CFrame.new(0.78, -0.42, 0.32) * CFrame.Angles(0, rng:NextNumber(0, math.pi), math.rad(22))
	shard.Parent = model
	parts[#parts + 1] = shard

	for i = 2, #parts do
		local weld = Instance.new("WeldConstraint")
		weld.Part0 = core
		weld.Part1 = parts[i]
		weld.Parent = core
	end

	local light = Instance.new("PointLight")
	light.Color = bright
	light.Brightness = 2.2
	light.Range = 11
	light.Shadows = false
	light.Parent = core

	return {
		model = model,
		core = core,
		parts = parts,
		light = light,
		basePos = position,
		-- A fixed lean per gem, applied after the spin so it leans as it turns
		-- rather than wobbling. Precomputed so the animation allocates nothing
		-- beyond the frame's own CFrame composition.
		tilt = CFrame.Angles(math.rad(rng:NextNumber(-9, 9)), 0, math.rad(rng:NextNumber(-9, 9))),
		phase = rng:NextNumber(0, math.pi * 2),
		active = true,
		respawnAt = 0,
	}
end

local function setVisible(rec: Crystal, visible: boolean)
	local t = visible and 0 or 1
	local parts = rec.parts
	for i = 1, #parts do
		parts[i].Transparency = t
	end
	rec.light.Enabled = visible
end

local function farEnough(placed: { Vector3 }, candidate: Vector3): boolean
	for i = 1, #placed do
		local d = placed[i] - candidate
		if d:Dot(d) < MIN_GAP * MIN_GAP then
			return false
		end
	end
	return true
end

local function spawnZone(zone: any, zoneIndex: number, crystalsFolder: Instance): ZoneState
	local folder = ensureFolder(crystalsFolder, zone.Id)
	folder:ClearAllChildren() -- idempotent: re-running init never doubles the field

	local rng = Util.rng(SEED_BASE + zoneIndex * SEED_STRIDE)
	local min = zone.Bounds.Min
	local max = zone.Bounds.Max

	local placed: { Vector3 } = table.create(zone.CrystalCount)
	local records: { Crystal } = table.create(zone.CrystalCount)

	for i = 1, zone.CrystalCount do
		local position = Vector3.zero
		-- Rejection sampling with a hard attempt cap. The cap matters: without
		-- it a tight zone could loop forever, and with it the layout is still
		-- fully deterministic because the RNG is consumed in a fixed order.
		for attempt = 1, PLACE_ATTEMPTS do
			local candidate = Vector3.new(
				rng:NextNumber(min.X + EDGE_MARGIN, max.X - EDGE_MARGIN),
				min.Y + HOVER_HEIGHT,
				rng:NextNumber(min.Z + EDGE_MARGIN, max.Z - EDGE_MARGIN)
			)
			position = candidate
			if attempt == PLACE_ATTEMPTS or farEnough(placed, candidate) then
				break
			end
		end

		placed[#placed + 1] = position
		local rec = buildCrystal(zone, i, position, rng)
		rec.model.Parent = folder
		records[#records + 1] = rec
	end

	return {
		id = zone.Id,
		value = zone.ShardValue,
		respawn = zone.RespawnSeconds,
		color = zone.CrystalColor,
		records = records,
		-- Carried so the locked-zone notice needs neither a Config lookup nor a
		-- string build inside the tick loop.
		bounds = zone.Bounds,
		name = zone.Name,
		cost = zone.UnlockCost,
	}
end

local function notifyPackFull(player: Player, now: number)
	local last = lastFullNotify[player]
	if last and now - last < FULL_NOTIFY_COOLDOWN then
		return
	end
	lastFullNotify[player] = now
	remoteNotify:FireClient(player, {
		kind = "warn",
		text = "PACK FULL — SELL AT THE GOLD PAD",
	})
end

--[[ Tell a player standing in a zone they do not own why nothing is happening.

	 The test is the zone's bounding box, not proximity to a crystal: an AABB test is
	 O(1) per zone and answers the question the player is actually asking ("why is this
	 place empty?"), whereas scanning a locked zone's crystal list would reintroduce
	 exactly the per-crystal cost the sweep is built to avoid. ]]
--[[ One containment rule, used by both branches of the sweep.

	 The locked branch asks it "why is this place empty?"; the unlocked branch asks it "has this
	 player ever been here?". Those are two questions about one fact, and answering them with two
	 copies of the same four comparisons is how they drift.

	 X and Z only, deliberately and not by omission. The bounds are a plan footprint, and the
	 world is about to gain real elevation under §2 — a Y test here would start refusing players
	 standing on a terrace inside the zone they are standing in. ]]
local function insideBounds(origin: Vector3, b: any): boolean
	return b ~= nil
		and origin.X >= b.Min.X
		and origin.X <= b.Max.X
		and origin.Z >= b.Min.Z
		and origin.Z <= b.Max.Z
end

local function notifyZoneLocked(player: Player, zone: any, now: number)
	local last = lastLockedNotify[player]
	if last and now - last < LOCKED_NOTIFY_COOLDOWN then
		return
	end
	lastLockedNotify[player] = now
	remoteNotify:FireClient(player, {
		kind = "warn",
		text = `{zone.name} IS LOCKED — {Util.comma(zone.cost)} COINS`,
	})
end

--[[ The sweep. Cost is O(players x crystals-in-unlocked-zones) and it allocates
	 NOTHING per crystal per tick: the crystal list is a flat pre-built array,
	 the distance test is a squared Vector3 dot (no sqrt, no table), and the
	 per-player scalars are computed once before the inner loop. The only
	 allocations in a quiet tick are Players:GetPlayers() — once per tick, not
	 once per crystal — and the Pop payload, which exists only when something is
	 actually collected. ]]
local function sweep(now: number)
	-- Respawn pass first, so a crystal that came back this tick is collectable
	-- this tick. Respawns are polled off this array rather than scheduled with
	-- task.delay per crystal, which would mean one live thread per gem.
	for zi = 1, #zoneStates do
		local records = zoneStates[zi].records
		for i = 1, #records do
			local rec = records[i]
			if not rec.active and now >= rec.respawnAt then
				rec.active = true
				setVisible(rec, true)
			end
		end
	end

	for _, player in Players:GetPlayers() do
		local profile = ctx.Data.get(player)
		if profile then
			local character = player.Character
			local root = character and character:FindFirstChild("HumanoidRootPart")
			local humanoid = character and character:FindFirstChildOfClass("Humanoid")

			if not (root and root:IsA("BasePart") and humanoid and humanoid.Health > 0) then
				-- No character, or a dead one. Drop the sample: whatever position they
				-- reappear at is a respawn, not a step.
				lastStep[player] = nil
			end

			if root and root:IsA("BasePart") and humanoid and humanoid.Health > 0 then
				local upgrades = profile.upgrades
				local radius = Config.upgradeValue("magnet", (upgrades and upgrades.magnet) or 0)
				local radiusSq = radius * radius
				local origin = root.Position

				--[[ Two guards, and they bound different things.

					 MaxPerTick bounds a single tick: a client that flings itself
					 across a zone can put every crystal inside its magnet radius
					 in one frame, and this stops that frame paying out all of
					 them.

					 It does NOT, as this comment used to claim, make the jump pay
					 "at the same rate as walking". What limits a walking player is
					 travel time — crystals are 9 studs apart at minimum, so 16
					 studs/s arrives at roughly 1.8 a second — while a teleporting
					 client pays no travel time and banks the full cap on every
					 tick, 30 a second. See H4 in docs/FAILURES.md.

					 So the second guard is the one that actually binds the exploit:
					 a player who covered more ground than their own top speed
					 allows did not walk here, and is awarded nothing this tick. The
					 crystals are left standing, so the cost of a false positive is
					 one tenth of a second. ]]
				local entitledSpeed = Config.upgradeValue("speed", (upgrades and upgrades.speed) or 0)
				local step = lastStep[player]
				local teleported = false
				if step then
					teleported = Movement.isImpossibleStep(
						origin.X - step.x,
						origin.Z - step.z,
						now - step.t,
						entitledSpeed
					)
				end
				lastStep[player] = { x = origin.X, z = origin.Z, t = now }

				local budget = if teleported then 0 else Config.Collect.MaxPerTick
				local gained = 0
				local packFull = false
				local visitedChanged = false

				for zi = 1, #zoneStates do
					if budget <= 0 or packFull then
						break
					end
					local zs = zoneStates[zi]
					-- A locked zone awards nothing. This — not the gate's
					-- collision — is what stops a locked player farming it.
					if not ctx.Zones.isUnlocked(player, zs.id) then
						-- Locked. Award nothing, but say so if they are standing in it.
						if insideBounds(origin, zs.bounds) then
							notifyZoneLocked(player, zs, now)
						end
					else
						--[[ Has this player ever actually STOOD here?

							 A latch, set once and never cleared, so a player jittering across the
							 boundary cannot make the HUD flap. Buying a zone does not set it —
							 `Zones.unlock` deliberately leaves it alone, because owning a place
							 you have never seen is exactly the dead end the objective HUD closes.

							 One boolean lookup per unlocked zone per player per tick, short-
							 circuiting forever once latched. That stays inside this sweep's
							 stated "allocates NOTHING per crystal per tick" contract, because it
							 is per ZONE and not per crystal. ]]
						if profile.visited and not profile.visited[zs.id] and insideBounds(origin, zs.bounds) then
							profile.visited[zs.id] = true
							visitedChanged = true
						end

						local records = zs.records
						for i = 1, #records do
							if budget <= 0 then
								break
							end
							local rec = records[i]
							if rec.active then
								-- Measured against the scatter anchor, not the
								-- bobbing render position, so the pickup radius
								-- does not breathe with the animation.
								local delta = rec.basePos - origin
								if delta:Dot(delta) <= radiusSq then
									local added = ctx.Economy.addShards(player, zs.value)
									if added <= 0 then
										-- The pack is full. Leave the crystal
										-- standing: a full player must not
										-- silently delete the world's crystals
										-- for everyone else, and for themselves
										-- the gem is still there when they get
										-- back from the sell pad.
										packFull = true
										break
									end

									rec.active = false
									rec.respawnAt = now + zs.respawn
									setVisible(rec, false)

									budget -= 1
									gained += added

									remotePop:FireClient(player, {
										position = rec.basePos,
										text = `+{Util.comma(added)}`,
										color = zs.color,
									})
								end
							end
						end
					end
				end

				if gained > 0 then
					local objectives = profile.objectives
					if objectives then
						objectives.collect = (objectives.collect or 0) + gained
					end
				end

				--[[ A first visit is a Sync-worthy event even when nothing was collected: the
					 objective resolver reads `visited`, so latching it without pushing would
					 leave the chip saying EXPLORE FROST HOLLOW while the player stands in Frost
					 Hollow — the resolver's stated invariant is that every writer of one of its
					 inputs also pushes. The `objectives.collect` write above stays gated on
					 `gained`, because walking into a zone is not collecting.

					 One authoritative snapshot per tick rather than one per crystal: the client
					 renders Sync and nothing else, so coalescing here is what keeps the HUD
					 cheap. ]]
				if gained > 0 or visitedChanged then
					ctx.Economy.push(player)
				end

				if packFull then
					notifyPackFull(player, now)
				end
			end
		end
	end
end

local function animate(elapsed: number)
	for zi = 1, #zoneStates do
		local records = zoneStates[zi].records
		for i = 1, #records do
			local rec = records[i]
			if rec.active then
				local t = elapsed + rec.phase
				local base = rec.basePos
				rec.core.CFrame = CFrame.new(base.X, base.Y + math.sin(t * BOB_SPEED) * BOB_HEIGHT, base.Z)
					* CFrame.Angles(0, t * SPIN_SPEED, 0)
					* rec.tilt
			end
		end
	end
end

function Collect.init(context: Ctx)
	ctx = context

	remotePop = ctx.Remotes:WaitForChild("Pop") :: RemoteEvent
	remoteNotify = ctx.Remotes:WaitForChild("Notify") :: RemoteEvent

	local canyon = ensureFolder(Workspace, "Canyon")
	local crystalsFolder = ensureFolder(canyon, "Crystals")

	zoneStates = {}
	for index, zone in Config.Zones do
		zoneStates[#zoneStates + 1] = spawnZone(zone, index, crystalsFolder)
	end

	Players.PlayerRemoving:Connect(function(player)
		lastFullNotify[player] = nil
		lastLockedNotify[player] = nil
		lastStep[player] = nil
	end)

	local interval = 1 / Config.Collect.TickRate
	local accumulator = 0
	local elapsed = 0

	RunService.Heartbeat:Connect(function(dt)
		elapsed += dt
		accumulator += dt
		if accumulator >= interval then
			-- Reset rather than subtract. After a server hitch, subtracting
			-- would let several ticks fire back to back and hand out several
			-- MaxPerTick budgets in one frame — exactly the burst the cap
			-- exists to prevent. A dropped tick is the cheaper failure.
			accumulator = 0
			sweep(os.clock())
		end
		animate(elapsed)
	end)
end

--[[ Diagnostics for the evidence pass: how many crystals in a zone are
	 currently standing. Not part of any gameplay path. ]]
function Collect.activeCount(zoneId: string): number
	for zi = 1, #zoneStates do
		local zs = zoneStates[zi]
		if zs.id == zoneId then
			local n = 0
			for i = 1, #zs.records do
				if zs.records[i].active then
					n += 1
				end
			end
			return n
		end
	end
	return 0
end

return Collect
