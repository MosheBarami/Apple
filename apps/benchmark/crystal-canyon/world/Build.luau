--!strict
--[[
	Crystal Canyon — deterministic edit-time world builder.

	Run this as a plain chunk from the Studio command bar (or a build plugin) in
	EDIT mode. It is not a ModuleScript and returns nothing; it does its work on
	execution and prints a one-line summary.

	Two properties this file is written to guarantee:

	1. IDEMPOTENT. It destroys Workspace.Canyon before rebuilding, so running it
	   twice never doubles the geometry. Anything it touches outside that folder
	   (the Sky, the spawn) is likewise found-and-replaced by name, never added.

	2. DETERMINISTIC. Every scatter decision comes from one Random seeded with
	   SEED and consumed in a fixed order. Two runs produce byte-identical
	   placement, which is what makes a screenshot diff between two builds a real
	   signal instead of noise from random placement. Do not introduce a second
	   Random, and do not reorder the build phases without expecting the whole
	   canyon to shuffle.

	Everything positional is derived from Config.Zones[].Bounds, so the world and
	the crystal spawner cannot disagree about where a zone is. Every colour comes
	from Palette.World / Palette.Pads. Materials are SmoothPlastic only: the style
	spec (§7) wants flat-shaded, untextured low-poly where colour does the work,
	and any real material is an automatic fail of §9.10.
]]

local Lighting = game:GetService("Lighting")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local ServerStorage = game:GetService("ServerStorage")
local Workspace = game:GetService("Workspace")

local SEED = 20260831

-- Shared module resolution ------------------------------------------------
--[[ This chunk has no `script` of its own, so it cannot use a relative path.
	 We look for the installed CrystalCanyon folder first and fall back to a
	 recursive search, which lets the builder run whether the shared modules have
	 been installed into ReplicatedStorage yet or are still sitting loose in
	 ServerStorage during authoring. ]]
local function findModule(name: string): ModuleScript
	local roots: { Instance } = { ReplicatedStorage, ServerScriptService, ServerStorage, Workspace }
	for _, root in roots do
		local pkg = root:FindFirstChild("CrystalCanyon")
		if pkg then
			local direct = pkg:FindFirstChild(name)
			if direct and direct:IsA("ModuleScript") then
				return direct
			end
		end
	end
	for _, root in roots do
		local found = root:FindFirstChild(name, true)
		if found and found:IsA("ModuleScript") then
			return found
		end
	end
	error(`[Crystal Canyon] could not find ModuleScript "{name}" — install src/shared first`)
end

local Config: any = require(findModule("Config"))
local Palette: any = require(findModule("Palette"))
local Util: any = require(findModule("Util"))

local W = Palette.World
local P = Palette.Pads

local rng = Util.rng(SEED)

local function rand(a: number, b: number): number
	return rng:NextNumber(a, b)
end

-- Bookkeeping -------------------------------------------------------------
local partCount = 0
local minB = Vector3.new(math.huge, math.huge, math.huge)
local maxB = Vector3.new(-math.huge, -math.huge, -math.huge)

--[[ Bounds are tracked from the axis-aligned extent of each part's position.
	 Rotation is ignored on purpose — this number exists to sanity-check that the
	 canyon is the size we think it is, not to be a physics-accurate AABB. ]]
local function track(pos: Vector3, size: Vector3)
	local half = size / 2
	minB = Vector3.new(
		math.min(minB.X, pos.X - half.X),
		math.min(minB.Y, pos.Y - half.Y),
		math.min(minB.Z, pos.Z - half.Z)
	)
	maxB = Vector3.new(
		math.max(maxB.X, pos.X + half.X),
		math.max(maxB.Y, pos.Y + half.Y),
		math.max(maxB.Z, pos.Z + half.Z)
	)
end

-- Primitives --------------------------------------------------------------

local function newPart(
	parent: Instance,
	name: string,
	size: Vector3,
	cf: CFrame,
	color: Color3,
	collide: boolean?
): Part
	local p = Instance.new("Part")
	p.Name = name
	p.Size = size
	p.CFrame = cf
	p.Color = color
	p.Material = Enum.Material.SmoothPlastic
	p.Anchored = true
	p.CanCollide = if collide == nil then true else collide
	p.CanTouch = false
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Parent = parent
	partCount += 1
	track(cf.Position, size)
	return p
end

local function box(
	parent: Instance,
	name: string,
	size: Vector3,
	pos: Vector3,
	color: Color3,
	yawDeg: number?,
	collide: boolean?
): Part
	local cf = CFrame.new(pos) * CFrame.Angles(0, math.rad(yawDeg or 0), 0)
	return newPart(parent, name, size, cf, color, collide)
end

--[[ A flat disc. Roblox's cylinder primitive runs along its own X axis, so a
	 ground disc is a cylinder stood on end — that 90° roll is the whole trick,
	 and Size.X becomes the disc's thickness. ]]
local function disc(
	parent: Instance,
	name: string,
	radius: number,
	thickness: number,
	x: number,
	z: number,
	top: number,
	color: Color3,
	collide: boolean?
): Part
	local cf = CFrame.new(x, top - thickness / 2, z) * CFrame.Angles(0, 0, math.rad(90))
	local p = newPart(parent, name, Vector3.new(thickness, radius * 2, radius * 2), cf, color, collide)
	p.Shape = Enum.PartType.Cylinder
	return p
end

local function blob(parent: Instance, name: string, size: Vector3, pos: Vector3, color: Color3): Part
	local p = newPart(parent, name, size, CFrame.new(pos), color, false)
	p.Shape = Enum.PartType.Ball
	return p
end

--[[ Floating world label. The style spec's outline rule (§2) is not a UI-only
	 rule in practice: a sign with a hairline border reads as a different game, so
	 every billboard here goes through Palette.stroke at panel weight and gets the
	 vertical gradient from §3. Sized in studs, not pixels, so it stays oversized
	 at distance the way the category does it. ]]
local function billboard(adornee: BasePart, text: string, fill: Color3, studsW: number, studsH: number, lift: number)
	local bb = Instance.new("BillboardGui")
	bb.Name = "Label"
	bb.Size = UDim2.fromScale(studsW, studsH)
	bb.StudsOffsetWorldSpace = Vector3.new(0, lift, 0)
	bb.LightInfluence = 0
	bb.MaxDistance = 700
	bb.AlwaysOnTop = false
	bb.Parent = adornee

	local frame = Instance.new("Frame")
	frame.Size = UDim2.fromScale(1, 1)
	frame.BackgroundColor3 = fill
	frame.BorderSizePixel = 0
	frame.Parent = bb

	local corner = Instance.new("UICorner")
	corner.CornerRadius = Palette.Radius.Panel
	corner.Parent = frame

	local grad = Instance.new("UIGradient")
	grad.Rotation = 90
	grad.Color = ColorSequence.new(Palette.lift(fill, 0.22), Palette.shade(fill, 0.22))
	grad.Parent = frame

	Palette.stroke(frame, Palette.Outline.Panel)

	local label = Instance.new("TextLabel")
	label.Size = UDim2.new(1, -16, 1, -12)
	label.Position = UDim2.new(0, 8, 0, 6)
	label.Text = text
	label.TextScaled = true
	label.Parent = frame
	Palette.styleText(label, Palette.TextSize.Title, Palette.UI.TextLight)
end

-- Zone geometry -----------------------------------------------------------

local meadow = Config.zoneById("meadow")
local frost = Config.zoneById("frost")
assert(meadow and frost, "[Crystal Canyon] Config.Zones must define meadow and frost")

local HUB_RADIUS = 55
local PATH_HALF = 12 -- 24 studs: 3-4 players abreast, per §7

--[[ The playable box is derived from the crystal bounds rather than written
	 down twice. Widening a zone in Config widens the canyon automatically, which
	 is the only way the cliffs can be guaranteed to still enclose it. ]]
local WORLD_X = math.max(
	math.abs(meadow.Bounds.Min.X),
	math.abs(meadow.Bounds.Max.X),
	math.abs(frost.Bounds.Min.X),
	math.abs(frost.Bounds.Max.X)
) + 50
local WORLD_Z_N = meadow.Bounds.Max.Z + 42
local WORLD_Z_S = frost.Bounds.Min.Z - 40

local NORTH_PATH_START = 44
local NORTH_PATH_END = meadow.Bounds.Max.Z + 8
local SOUTH_PATH_START = -44
local SOUTH_PATH_END = frost.Bounds.Min.Z - 10
local GATE_Z = frost.Bounds.Max.Z + 4 -- just outside the frost crystal field

local LANDMARK = Vector3.new(0, 0, 18)
local SPAWN = Vector3.new(0, 0, -34)

-- Rebuild -----------------------------------------------------------------

local existing = Workspace:FindFirstChild("Canyon")
if existing then
	existing:Destroy()
end

--[[ Roblox's default place ships a grey `Baseplate` part at the origin. The
	 canyon lays its own ground down over the play area, but the baseplate is
	 larger than the ground plane, so it survives at the edges and renders as a
	 flat grey void ringing the world — which is exactly the "world leaks away"
	 failure §7 of the style spec warns about, and it was visible in the first
	 render of this build.

	 Removing it by name is safe here because this is a generated fixture place:
	 nothing else owns a part called Baseplate. Guarded on class and position so
	 a hand-placed part that merely shares the name is left alone. ]]
local baseplate = Workspace:FindFirstChild("Baseplate")
if
	baseplate
	and baseplate:IsA("BasePart")
	and math.abs(baseplate.Position.X) < 1
	and math.abs(baseplate.Position.Z) < 1
	and baseplate.Size.X >= 512
	and baseplate.Size.Z >= 512
then
	-- Measured shape of the stock part: Position (0, -8, 0), Size 2048 x 16 x 2048.
	-- Keyed on the footprint rather than an exact vector so a slightly different
	-- template still matches, while a small hand-placed part named Baseplate does not.
	baseplate:Destroy()
end

local canyon = Instance.new("Folder")
canyon.Name = "Canyon"
canyon.Parent = Workspace

local function folder(name: string, parent: Instance?): Folder
	local f = Instance.new("Folder")
	f.Name = name
	f.Parent = parent or canyon
	return f
end

local fGround = folder("Ground")
local fCliffs = folder("Cliffs")
local fProps = folder("Props")
local fPaths = folder("Paths")
local fLandmark = folder("Landmark")
local fPads = folder("Pads")
local fGates = folder("Gates")
local fCrystals = folder("Crystals")
for _, zone in Config.Zones do
	folder(zone.Id, fCrystals) -- populated at runtime by the Collect service
end

-- 1. Ground ---------------------------------------------------------------
--[[ §1: colour zones the space. Green is traversable, the pale sand circle is
	 the hub, the frost slab is the second zone. A player is meant to read where
	 they are from ground colour alone before any label loads. ]]

local groundW = WORLD_X * 2 + 40
local groundD = (WORLD_Z_N - WORLD_Z_S) + 46
local groundZ = (WORLD_Z_N + WORLD_Z_S) / 2
box(fGround, "Grass", Vector3.new(groundW, 4, groundD), Vector3.new(0, -2, groundZ), W.Grass)

-- Deeper green pools break the flat field without reading as a texture.
for _, patch in { { -115, 110, 44 }, { 112, -18, 38 }, { -104, 26, 30 } } do
	disc(fGround, "GrassPatch", patch[3], 1.4, patch[1], patch[2], 0.08, W.GrassDeep)
end

--[[ The frost zone gets its own floor so the cold half of the map is legible
	 from the hub long before the gate is affordable. It stops exactly at the
	 gate, which is what makes the gate read as a threshold rather than a prop.
	 Its top sits at y=0.15 — above the grass, below the path (0.35) — so the
	 road stays drawn on top of it. ]]
local frostNorth = GATE_Z + 2
local frostSouth = frost.Bounds.Min.Z - 22
-- Named rather than inlined into the box() call below because the props that
-- stand on this slab have to be painted against it, and a second copy of these
-- numbers is how the paint and the floor would drift apart.
local frostWidth = (frost.Bounds.Max.X - frost.Bounds.Min.X) + 44
local frostMidX = (frost.Bounds.Min.X + frost.Bounds.Max.X) / 2
box(
	fGround,
	"FrostFloor",
	Vector3.new(frostWidth, 2, frostNorth - frostSouth),
	Vector3.new(frostMidX, -0.85, (frostNorth + frostSouth) / 2),
	W.Frost
)
disc(fGround, "FrostDrift", 46, 1.2, -62, -140, 0.28, W.FrostDeep)
disc(fGround, "FrostDrift", 38, 1.2, 66, -186, 0.28, W.FrostDeep)

--[[ Is this spot standing on the frost slab? The footprint, not GATE_Z, is the
	 honest test: what a prop is painted against is the ground actually under it.
	 (For the tree clusters the two answers happen to coincide — no cluster anchor
	 falls in the 2 studs between them — but the floor is the reason.) ]]
local function onFrostFloor(x: number, z: number): boolean
	return z <= frostNorth and z >= frostSouth and math.abs(x - frostMidX) <= frostWidth / 2
end

--[[ Cold-zone FOLIAGE tones. Local to the builder on purpose: they are world
	 dressing for one zone, not part of the pinned style vocabulary in Palette.

	 This is the ice path's defect, three hundred lines further down the file.
	 Frost-zone props were painted `canopy = W.Frost` / `canopyLight = W.FrostDeep`
	 while standing on a FrostFloor that is literally `W.Frost` — so per tree one
	 set of conifer tiers was BYTE-IDENTICAL to the ground under it and the other
	 was 81 away, the same 0/81 pair the ice-path fix records as unacceptable. The
	 grass tufts had it too, staying meadow green 104 studs into the snow, which
	 fights the colour zoning §1 calls a gameplay tool rather than decoration.

	 Contrast is sum|Δ| over the three channels against W.Frost (206,232,245),
	 the floor all of this stands on. The north half is the benchmark, being the
	 half that already passes:
	   Canopy      ( 62,158, 78) on Grass ( 95,201, 74) ->  80   sat 0.61
	   CanopyLight ( 87,184, 95) on Grass                ->  46   sat 0.53
	   Tuft        (110,214, 88) on Grass                ->  42   sat 0.59
	   GrassDeep   ( 72,172, 60) on Grass                ->  66   sat 0.65
	 The replacements, on the frost floor:
	   COLD_CANOPY       ( 44,116,100) on Frost -> 423   sat 0.62
	   COLD_CANOPY_LIGHT ( 70,150,128) on Frost -> 335   sat 0.53
	   COLD_TUFT         ( 88,192,140) on Frost -> 263   sat 0.54
	   COLD_TUFT_DEEP    ( 56,140,104) on Frost -> 383   sat 0.60

	 They clear the north benchmark several times over, deliberately. The north's
	 foliage can read at Δ 42-80 because green-on-green shares a hue family and the
	 silhouette does the rest; the cold zone has no such family to borrow, since
	 everything near Frost is a pale blue-white and pale-on-pale is exactly the
	 desaturated mush §9.10 fails outright. So the separation is carried in VALUE,
	 the way the ice path carries it (273/347 against this same floor) — while the
	 saturation column above stays level with the north tones, so nothing here is
	 duller than the half that passed.

	 Within each pair the tone break is what makes a conifer read as stacked tiers
	 and a tuft as separate blades, so it is held at northern strength:
	   COLD_CANOPY vs COLD_CANOPY_LIGHT -> 88 (north canopy pair: 68)
	   COLD_TUFT   vs COLD_TUFT_DEEP    -> 120 (north tuft pair:  108)
	 And they stay green-dominant, which keeps them off the blue-dominant ice road
	 they are planted beside: COLD_TUFT is 92 from IcePath, a wider break than the
	 north path's own Dirt/DirtLight step (66). ]]
local COLD_CANOPY = Color3.fromRGB(44, 116, 100)
local COLD_CANOPY_LIGHT = Color3.fromRGB(70, 150, 128)
local COLD_TUFT = Color3.fromRGB(88, 192, 140)
local COLD_TUFT_DEEP = Color3.fromRGB(56, 140, 104)

-- The hub: a circular sand clearing. Sitting proud of the grass by half a stud
-- gives it a visible lip instead of a seam.
disc(fGround, "HubRim", HUB_RADIUS + 5, 1.6, 0, 0, 0.30, W.Dirt)
disc(fGround, "SandHub", HUB_RADIUS, 1.8, 0, 0, 0.55, W.Sand)

-- 2. Paths ----------------------------------------------------------------
--[[ §7: wide and contrasting hard with the ground. Built as segments in two
	 tones rather than one long slab — the tone break is what stops 170 studs of
	 orange from reading as a decal. ]]

local function pathRun(fromZ: number, toZ: number, segments: number, warm: boolean)
	local span = toZ - fromZ
	local segLen = span / segments
	for i = 1, segments do
		local z = fromZ + segLen * (i - 0.5)
		local light = (i % 2 == 0)
		local color
		if warm then
			color = if light then W.DirtLight else W.Dirt
		else
			--[[ Past the gate the road is worn ice, not dirt. It must NOT be a
				 frost tone: this run (z -66..-225) lies entirely on FrostFloor,
				 which is painted `W.Frost`. The first build used
				 `if light then W.Frost else W.FrostDeep`, so half the road was
				 literally the same colour as the ground beneath it. Measured on the
				 built geometry: 3 of the 6 segments came out at sum|Δ| = 0 against
				 the floor and the other 3 at 81. The route did not read as a route.

				 Contrast below is sum|Δ| over the three channels vs the ground.
				 The north path is the benchmark the spec (§9.5) sets, since it is
				 the half that already passes:
				   Dirt      (201,138, 75) on Grass      ( 95,201, 74) -> 170
				   DirtLight (224,164, 92) on Grass                    -> 184
				 The replacement, on the frost floor:
				   IcePath     ( 96,141,173) on Frost (206,232,245)    -> 273
				   IcePathDark ( 74,116,146) on Frost                  -> 347
				 Both ice tones clear the north benchmark by 1.5-2x. And the two ice
				 tones are 74 apart from each other, against 66 for Dirt/DirtLight,
				 so the segment-to-segment tone break still reads about as strongly
				 as it does in the north. ]]
			color = if light then W.IcePath else W.IcePathDark
		end
		box(
			fPaths,
			"PathSegment",
			Vector3.new(PATH_HALF * 2, 1.4, math.abs(segLen) + 0.6),
			Vector3.new(0, -0.35, z),
			color
		)
	end
end

pathRun(NORTH_PATH_START, NORTH_PATH_END, 8, true)
pathRun(SOUTH_PATH_START, GATE_Z, 3, true)
pathRun(GATE_Z, SOUTH_PATH_END, 6, false)

-- 3. Cliffs ---------------------------------------------------------------
--[[ §7: banded horizontally in three tones of the same rust hue. The banding —
	 not the colour — is what makes a cliff read as rock instead of a brown wall,
	 so each segment is a stack of slabs that (a) changes tone every layer and
	 (b) steps back toward the outside as it rises. Segment base heights are
	 jittered so the skyline is ragged; a level top edge reads as a fence. ]]

--[[ Three tones of the one rust hue, cycled. The first build's fixed
	 {A, B, C, B} order meant the band that meets the ground was CliffA for every
	 segment on the map, so the banding ran as one continuous stripe the length of
	 each wall. `toneOffset` below rotates the starting tone per segment; cycling
	 (rather than picking at random) still guarantees adjacent layers differ. ]]
local CLIFF_TONES = { W.CliffA, W.CliffB, W.CliffC }
local LAYER_FRACTION = { 0.46, 0.28, 0.20, 0.15 }

local function cliffRun(from: Vector3, to: Vector3, outward: Vector3, segLen: number, baseHeight: number, depth: number)
	local span = to - from
	local length = span.Magnitude
	if length < 1 then
		return
	end
	local dir = span.Unit
	local segments = math.max(1, math.floor(length / segLen + 0.5))
	local segWidth = length / segments

	for i = 1, segments do
		local anchor = from + dir * (segWidth * (i - 0.5))
		-- Wider than the first build's 0.76-1.28. A ±12% spread on the total
		-- height is a ripple; this is what makes the skyline ragged (§7).
		local height = baseHeight * rand(0.66, 1.44)
		local layers = rng:NextInteger(3, 4)
		local toneOffset = rng:NextInteger(0, 2)
		--[[ Sink the stack slightly. Every stack starting at y = 0 and splitting
			 by the same LAYER_FRACTION put every segment's first band seam at
			 roughly the same height — that shared horizontal line is what the eye
			 reads as a step. Downward only: lifting a stack would leave daylight
			 under it and the ring wall exists to stop the world leaking away.
			 3.0 is comfortably under the shortest possible base layer
			 (32 * 0.66 * 0.46 * 0.74 ≈ 7.2 studs), so no segment can sink flush. ]]
		local y = -rand(0.4, 3.0)
		local setback = 0
		for k = 1, layers do
			local h = height * LAYER_FRACTION[k] * rand(0.74, 1.30)
			--[[ The step back toward the outside was a fixed (k-1) * depth * 0.17,
				 identical on every segment, so tier k sat at exactly the same depth
				 the whole way along the run and the tiers joined into one continuous
				 terrace — the staircase. Randomising the step per layer per segment
				 breaks that line while keeping the same mean (0.16), so the wall
				 still leans back by the same amount overall. ]]
			setback += depth * rand(0.06, 0.26)
			--[[ 7 studs of overlap between neighbours rather than 4. That extra
				 headroom is what pays for the larger along-run jitter below: at the
				 worst case (one slab shifted -2.8, its neighbour +2.8) two adjacent
				 base slabs still overlap ~1.4 studs, so the wall never opens a seam. ]]
			local w = (segWidth + 7) * (1 - 0.07 * (k - 1))
			local d = depth * (1 - 0.17 * (k - 1))
			local centre = anchor + outward * setback + dir * rand(-2.8, 2.8) + Vector3.new(0, y + h / 2, 0)
			-- lookAt puts the slab's Z along `outward`, so Size reads
			-- (width along the run, height, depth into the wall).
			local cf = CFrame.lookAt(centre, centre + outward) * CFrame.Angles(0, math.rad(rand(-5, 5)), 0)
			newPart(fCliffs, "CliffSlab", Vector3.new(w, h, d), cf, CLIFF_TONES[(toneOffset + k - 1) % 3 + 1], true)
			y += h * 0.95
		end
	end
end

-- Outer ring: the world does not leak away.
cliffRun(
	Vector3.new(-WORLD_X - 6, 0, WORLD_Z_N),
	Vector3.new(WORLD_X + 6, 0, WORLD_Z_N),
	Vector3.new(0, 0, 1),
	38,
	32,
	26
)
cliffRun(
	Vector3.new(-WORLD_X - 6, 0, WORLD_Z_S),
	Vector3.new(WORLD_X + 6, 0, WORLD_Z_S),
	Vector3.new(0, 0, -1),
	38,
	32,
	26
)
cliffRun(Vector3.new(WORLD_X, 0, WORLD_Z_S), Vector3.new(WORLD_X, 0, WORLD_Z_N), Vector3.new(1, 0, 0), 38, 32, 26)
cliffRun(Vector3.new(-WORLD_X, 0, WORLD_Z_S), Vector3.new(-WORLD_X, 0, WORLD_Z_N), Vector3.new(-1, 0, 0), 38, 32, 26)

-- Inner spurs hug the hub so the clearing is enclosed rather than open on four
-- sides. They stop short of the path corridors on purpose.
cliffRun(Vector3.new(64, 0, -56), Vector3.new(64, 0, 16), Vector3.new(1, 0, 0), 24, 21, 18)
cliffRun(Vector3.new(-64, 0, -56), Vector3.new(-64, 0, 16), Vector3.new(-1, 0, 0), 24, 21, 18)
cliffRun(Vector3.new(-56, 0, -64), Vector3.new(-PATH_HALF - 8, 0, -64), Vector3.new(0, 0, -1), 22, 17, 16)
cliffRun(Vector3.new(PATH_HALF + 8, 0, -64), Vector3.new(56, 0, -64), Vector3.new(0, 0, -1), 22, 17, 16)

-- Two free-standing buttes give the meadow a horizon of its own. They sit
-- outside the crystal bounds (x ±96) so they never swallow a spawn point, and
-- clear of the ring wall's inner face so they read as separate rock.
cliffRun(Vector3.new(-112, 0, 150), Vector3.new(-112, 0, 186), Vector3.new(-1, 0, 0), 36, 26, 22)
cliffRun(Vector3.new(114, 0, 100), Vector3.new(114, 0, 134), Vector3.new(1, 0, 0), 34, 24, 22)

-- 4. Landmark -------------------------------------------------------------
--[[ §7: one landmark dominates and the eye lands on it from spawn. This is an
	 86-stud crystal monument on a stepped plinth at the head of the hub, on the
	 spawn's sight line north toward the meadow.

	 Two construction notes worth checking:
	 - Each plinth tier is two boxes, one at 0° and one at 45° and slightly
	   smaller. A union of two squares is an eight-pointed step, NOT an octagon
	   (an octagon is their intersection, which parts cannot express) — the 0.9
	   factor is what keeps those points shallow enough to read as chiselled rock
	   instead of a throwing star.
	 - The spire is three boxes at 0/60/120°, each a different tone of the same
	   crystal hue. Flat shading gives every facet a constant colour, so the tone
	   split is what makes it read as a faceted gem rather than a lit cylinder. ]]

local crystalHue = meadow.CrystalColor
local frostHue = frost.CrystalColor

disc(fLandmark, "MonumentRing", 34, 0.8, LANDMARK.X, LANDMARK.Z, 0.75, Palette.Outline.Color)
disc(fLandmark, "MonumentGlow", 31, 0.8, LANDMARK.X, LANDMARK.Z, 0.95, P.Sell)

local tiers = {
	{ 46, 5.5, W.CliffC },
	{ 36, 5.0, W.CliffB },
	{ 26, 4.5, W.CliffA },
}
local plinthTop = 1.0
for _, tier in tiers do
	local wdt, hgt, col = tier[1] :: number, tier[2] :: number, tier[3] :: Color3
	local y = plinthTop + hgt / 2
	box(fLandmark, "PlinthTier", Vector3.new(wdt, hgt, wdt), Vector3.new(LANDMARK.X, y, LANDMARK.Z), col)
	box(
		fLandmark,
		"PlinthTier",
		Vector3.new(wdt * 0.9, hgt, wdt * 0.9),
		Vector3.new(LANDMARK.X, y, LANDMARK.Z),
		Palette.shade(col, 0.12),
		45
	)
	plinthTop += hgt
end

local SPIRE_H = 54
local spireTones = { crystalHue, Palette.lift(crystalHue, 0.20), Palette.shade(crystalHue, 0.22) }
for i = 1, 3 do
	box(
		fLandmark,
		"SpireFacet",
		Vector3.new(9.5, SPIRE_H, 9.5),
		Vector3.new(LANDMARK.X, plinthTop + SPIRE_H / 2, LANDMARK.Z),
		spireTones[i],
		(i - 1) * 60
	)
end
local TIP_H = 19
local tipBase = plinthTop + SPIRE_H - 3
for i = 1, 3 do
	box(
		fLandmark,
		"SpireTip",
		Vector3.new(6, TIP_H, 6),
		Vector3.new(LANDMARK.X, tipBase + TIP_H / 2, LANDMARK.Z),
		spireTones[((i + 1) % 3) + 1],
		(i - 1) * 60 + 30
	)
end

-- A ring of smaller shards leaning outward off the plinth. Alternating the two
-- zone crystal colours makes the monument a legend for the map.
for i = 1, 6 do
	local ang = (i / 6) * math.pi * 2
	local r = 15
	local h = 22 + (i % 3) * 8
	local x = LANDMARK.X + math.cos(ang) * r
	local z = LANDMARK.Z + math.sin(ang) * r
	local hue = if i % 2 == 0 then frostHue else crystalHue
	local lean = CFrame.Angles(math.sin(ang) * 0.20, ang, -math.cos(ang) * 0.20)
	for k = 1, 2 do
		local cf = CFrame.new(x, plinthTop - 3 + h / 2, z) * lean * CFrame.Angles(0, math.rad((k - 1) * 45), 0)
		newPart(
			fLandmark,
			"Shard",
			Vector3.new(5.5, h, 5.5),
			cf,
			if k == 1 then hue else Palette.shade(hue, 0.18),
			true
		)
	end
end

-- Eight floating cubes orbiting the spire. Cheap, and it makes the landmark the
-- only thing on the skyline that moves the eye.
for i = 1, 8 do
	local ang = (i / 8) * math.pi * 2
	local r = 20
	box(
		fLandmark,
		"Mote",
		Vector3.new(4.5, 4.5, 4.5),
		Vector3.new(
			LANDMARK.X + math.cos(ang) * r,
			plinthTop + 34 + math.sin(ang * 2) * 5,
			LANDMARK.Z + math.sin(ang) * r
		),
		P.Sell,
		45,
		false
	)
end

-- 5. Spawn ----------------------------------------------------------------

disc(fGround, "SpawnRing", 13, 0.8, SPAWN.X, SPAWN.Z, 0.75, Palette.Outline.Color)
local spawn = Instance.new("SpawnLocation")
spawn.Name = "Spawn"
spawn.Size = Vector3.new(20, 1.2, 20)
-- lookAt aims the spawn's LookVector at the monument, so a fresh character is
-- already facing the landmark and the path beyond it.
spawn.CFrame = CFrame.lookAt(Vector3.new(SPAWN.X, 0.9, SPAWN.Z), Vector3.new(LANDMARK.X, 0.9, LANDMARK.Z))
spawn.Color = Palette.lift(W.Sand, 0.35)
spawn.Material = Enum.Material.SmoothPlastic
spawn.Anchored = true
spawn.Neutral = true
spawn.Duration = 0
spawn.TopSurface = Enum.SurfaceType.Smooth
spawn.BottomSurface = Enum.SurfaceType.Smooth
spawn.Parent = canyon
partCount += 1
track(spawn.Position, spawn.Size)

-- 6. Pads -----------------------------------------------------------------
--[[ §8: flat coloured discs, outlined, floating label, plus the §7 coloured
	 floor ring so the pad is visible before its text resolves.

	 The pad itself is the Part named SellPad/UpgradePad — not a Model — so the
	 Economy service's server-side proximity check can read `.Position` directly.
	 Its disc radius is kept under Config.Sell.PadRadius so standing anywhere on
	 the visible gold is inside the radius the server will actually accept. ]]

local function buildPad(name: string, x: number, z: number, fill: Color3, text: string): Part
	local haloR = 21
	disc(fPads, name .. "Halo", haloR + 1.5, 0.5, x, z, 0.62, Palette.Outline.Color, false)
	disc(fPads, name .. "Ring", haloR, 0.5, x, z, 0.72, Palette.shade(fill, 0.30), false)

	disc(fPads, name .. "Edge", 13, 1.0, x, z, 0.95, Palette.Outline.Color, false)
	local pad = disc(fPads, name, 11.5, 1.0, x, z, 1.10, fill, false)
	disc(fPads, name .. "Inlay", 7.5, 1.0, x, z, 1.22, Palette.lift(fill, 0.30), false)

	billboard(pad, text, fill, 26, 7.5, 13)
	return pad
end

buildPad("SellPad", 32, -12, P.Sell, "SELL")
-- Beside the north path at the meadow mouth, not on it: the path owns x ±12 and
-- this pad's outer halo (radius 22.5) stops at x = -15.5. It is a kiosk you walk
-- past, not a thing you have to walk around (§8).
buildPad("UpgradePad", -38, 52, P.Upgrade, "UPGRADES")

-- 7. Gate -----------------------------------------------------------------
--[[ A locked gate across the south path. The Barrier part is named so the Zones
	 service can flip it per player via an attribute; the builder only ever
	 produces the locked state, because "locked" is what an unpaid player and a
	 fresh Studio session should both see. ]]

local gate = Instance.new("Model")
gate.Name = frost.Id
gate.Parent = fGates
gate:SetAttribute("ZoneId", frost.Id)

local postX = PATH_HALF + 6
for _, sx in { -1, 1 } do
	local x = postX * sx
	box(gate, "PostBase", Vector3.new(11, 5, 11), Vector3.new(x, 2.5, GATE_Z), Palette.shade(P.Gate, 0.45))
	box(gate, "Post", Vector3.new(8.5, 28, 8.5), Vector3.new(x, 19, GATE_Z), P.Gate)
	box(gate, "PostCap", Vector3.new(12, 5, 12), Vector3.new(x, 35.5, GATE_Z), Palette.shade(P.Gate, 0.28))
end
box(gate, "Lintel", Vector3.new(postX * 2 + 14, 7, 10), Vector3.new(0, 41, GATE_Z), P.Gate)

local barrier =
	box(gate, "Barrier", Vector3.new(postX * 2 - 4, 30, 3), Vector3.new(0, 16, GATE_Z), Palette.shade(P.Gate, 0.15))
barrier.Transparency = 0.15

-- Two diagonals and a rail: the geometry says "barred" without a word of text.
for _, tilt in { 34, -34 } do
	newPart(
		gate,
		"Brace",
		Vector3.new(postX * 2 + 4, 4.5, 4.5),
		CFrame.new(0, 16, GATE_Z - 3) * CFrame.Angles(0, 0, math.rad(tilt)),
		Palette.lift(P.Gate, 0.25),
		false
	)
end
box(
	gate,
	"Rail",
	Vector3.new(postX * 2 - 2, 4, 4.5),
	Vector3.new(0, 27, GATE_Z - 3),
	Palette.lift(P.Gate, 0.25),
	0,
	false
)

-- Oversized padlock, because §7 says progression is signposted physically.
box(gate, "LockBody", Vector3.new(9, 9, 4), Vector3.new(0, 16, GATE_Z - 6), P.Sell, 0, false)
box(gate, "LockShackle", Vector3.new(6, 6, 3), Vector3.new(0, 22, GATE_Z - 6), Palette.shade(P.Sell, 0.25), 0, false)

gate.PrimaryPart = barrier
-- Reads the price out of Config so the sign can never advertise a cost the
-- server would not charge.
billboard(barrier, `{frost.Name} — {Util.comma(frost.UnlockCost)} COINS`, P.Gate, 46, 9, 30)

-- 8. Arrows ---------------------------------------------------------------
--[[ §8: giant, outlined, green, floating, pointing at the objective. Three
	 boxes per arrow — a shaft and two 45° chevron halves — so it stays flat-shaded
	 low-poly rather than becoming a mesh. ]]

local function arrow(z: number)
	local y = 17
	local tip = z + 22
	box(fProps, "ArrowShaft", Vector3.new(7, 2.5, 26), Vector3.new(0, y, z), P.Arrow, 0, false)
	local inset = 6.4
	box(fProps, "ArrowHead", Vector3.new(7, 2.5, 18), Vector3.new(-inset, y, tip - inset), P.Arrow, 45, false)
	box(fProps, "ArrowHead", Vector3.new(7, 2.5, 18), Vector3.new(inset, y, tip - inset), P.Arrow, 135, false)
end

for _, z in { 62, 112, 162, 202 } do
	arrow(z)
end

-- 9. Trees ----------------------------------------------------------------
--[[ §7: conifers are stacked cones; deciduous are one to three rounded blobs on
	 a straight trunk. Roblox has no cone primitive, so a conifer tier is a box
	 given a yaw offset per tier — the diamond footprint and the shrinking stack
	 produce the faceted stepped-cone silhouette the category uses, and it stays
	 flat-shaded low-poly, which a smooth cylinder would not.

	 Everything here is oversized: a 27-42 stud tree against a 5 stud player is
	 the point. Realistic scale reads as empty. ]]

local CONIFER_W = { 17, 13.5, 10, 6 }
local CONIFER_H = { 9.5, 8, 6.5, 5.5 }

local function conifer(parent: Instance, x: number, z: number, s: number, canopy: Color3, canopyLight: Color3)
	box(parent, "Trunk", Vector3.new(3.4 * s, 10 * s, 3.4 * s), Vector3.new(x, 5 * s, z), W.Trunk, rand(0, 90))
	local y = 7.5 * s
	for k = 1, 4 do
		local h = CONIFER_H[k] * s
		box(
			parent,
			"Tier",
			Vector3.new(CONIFER_W[k] * s, h, CONIFER_W[k] * s),
			Vector3.new(x, y + h / 2, z),
			if k % 2 == 0 then canopyLight else canopy,
			45 + k * 21 + rand(-8, 8)
		)
		y += h * 0.63
	end
end

local function deciduous(parent: Instance, x: number, z: number, s: number, canopy: Color3, canopyLight: Color3)
	box(parent, "Trunk", Vector3.new(3.2 * s, 14 * s, 3.2 * s), Vector3.new(x, 7 * s, z), W.Trunk, rand(0, 90))
	local blobs = rng:NextInteger(1, 3)
	for k = 1, blobs do
		local r = rand(9, 13) * s * (1 - (k - 1) * 0.16)
		blob(
			parent,
			"Canopy",
			Vector3.new(r * 2, r * 1.7, r * 2),
			Vector3.new(x + rand(-5, 5) * s, (14 + rand(2, 7) + (k - 1) * 5) * s, z + rand(-5, 5) * s),
			if k % 2 == 0 then canopyLight else canopy
		)
	end
end

--[[ Clusters, never an even scatter (§9.7). Each entry is an anchor the trees
	 are jittered around; the gaps between anchors are the "clear ground between
	 clusters" the spec asks for. Frost-zone clusters swap in the cold canopy so
	 the tree line participates in the colour zoning. ]]
local TREE_CLUSTERS = {
	{ -80, 78 },
	{ 82, 92 },
	{ -72, 132 },
	{ 88, 148 },
	{ -86, 188 },
	{ 70, 196 },
	{ -88, 26 },
	{ 84, 44 },
	{ -86, -22 },
	{ 86, -34 },
	{ -80, -96 },
	{ 84, -118 },
	{ -70, -156 },
	{ 78, -178 },
	{ -52, -84 },
	{ 54, -88 },
}

for _, anchor in TREE_CLUSTERS do
	local cx, cz = anchor[1] :: number, anchor[2] :: number
	-- Cluster-level, not per-tree: the cluster is the unit the eye reads, and a
	-- single tree in a group painted from the other zone's palette reads as a bug.
	local cold = onFrostFloor(cx, cz)
	local canopy = if cold then COLD_CANOPY else W.Canopy
	local canopyLight = if cold then COLD_CANOPY_LIGHT else W.CanopyLight
	local group = folder("TreeCluster", fProps)
	local count = rng:NextInteger(2, 3)
	for _ = 1, count do
		local x = cx + rand(-16, 16)
		local z = cz + rand(-16, 16)
		local s = rand(0.95, 1.5)
		if rng:NextNumber() < 0.62 then
			conifer(group, x, z, s, canopy, canopyLight)
		else
			deciduous(group, x, z, s * 0.9, canopy, canopyLight)
		end
	end
end

-- 10. Rocks ---------------------------------------------------------------
--[[ §7: faceted lumps in twos and threes, rotated irregularly. A box tumbled on
	 all three axes is a facet cluster under flat shading; a sphere would read as
	 a bubble. ]]

local ROCK_CLUSTERS = {
	{ -30, 58 },
	{ 28, 74 },
	{ -26, 122 },
	{ 30, 168 },
	{ -34, 204 },
	{ -30, -58 },
	{ 30, -96 },
	{ -28, -140 },
	{ 32, -196 },
	{ -46, 8 },
	{ 48, -4 },
	{ -58, 44 },
	{ 60, 62 },
	{ 104, 40 },
	{ -108, 70 },
	{ 100, -140 },
}

for _, anchor in ROCK_CLUSTERS do
	local cx, cz = anchor[1] :: number, anchor[2] :: number
	local group = folder("RockCluster", fProps)
	local count = rng:NextInteger(2, 3)
	for _ = 1, count do
		local size = rand(5, 11)
		local x = cx + rand(-9, 9)
		local z = cz + rand(-9, 9)
		local cf = CFrame.new(x, size * 0.34, z)
			* CFrame.Angles(math.rad(rand(-22, 22)), math.rad(rand(0, 360)), math.rad(rand(-22, 22)))
		newPart(
			group,
			"Rock",
			Vector3.new(size, size * rand(0.6, 0.95), size * rand(0.75, 1.2)),
			cf,
			if rng:NextNumber() < 0.5 then W.Rock else W.RockDark,
			true
		)
	end
	-- One chip leaning on the group so the pair never reads as a matched set.
	if rng:NextNumber() < 0.55 then
		local s = rand(2.5, 4.5)
		newPart(
			group,
			"Chip",
			Vector3.new(s, s * 0.8, s * 1.1),
			CFrame.new(cx + rand(-13, 13), s * 0.4, cz + rand(-13, 13))
				* CFrame.Angles(0, math.rad(rand(0, 360)), math.rad(rand(-18, 18))),
			W.RockDark,
			false
		)
	end
end

-- 11. Grass tufts ---------------------------------------------------------
--[[ §7: small spiky clusters at path edges and against props — never a uniform
	 field. Blades fan outward from a shared centre so the cluster silhouette is
	 spiky rather than a bristle brush. ]]

local tuftGroup = folder("Tufts", fProps)

local function tuft(x: number, z: number, s: number)
	-- Blade tones follow the ground the clump stands on, so the verge planting the
	-- spec asks for at every path edge can run the length of the ice road without
	-- dragging meadow green into the snow.
	local cold = onFrostFloor(x, z)
	local bright = if cold then COLD_TUFT else W.Tuft
	local deep = if cold then COLD_TUFT_DEEP else W.GrassDeep
	local blades = rng:NextInteger(3, 4)
	local base = rand(0, math.pi * 2)
	for k = 1, blades do
		local ang = base + (k / blades) * math.pi * 2
		local h = rand(3.2, 5.4) * s
		local cf = CFrame.new(x + math.cos(ang) * 0.9 * s, h / 2, z + math.sin(ang) * 0.9 * s)
			* CFrame.Angles(math.sin(ang) * 0.42, ang, -math.cos(ang) * 0.42)
		newPart(tuftGroup, "Tuft", Vector3.new(0.9 * s, h, 0.9 * s), cf, if k % 2 == 0 then bright else deep, false)
	end
end

--[[ Verge planting. The first build claimed in a comment to alternate sides but
	 actually placed one tuft on BOTH verges every 28 studs, all the way down both
	 paths — a symmetric double row at a fixed pitch, which is the uniform field
	 §7 rules out, not a cluster.

	 Instead: clumps of 2-3 tufts, at an irregular pitch, on ONE side, crossing to
	 the far side only sometimes. The bare verge between clumps is the "clear
	 ground between clusters" half of the rule. ]]
local function tuftClump(x: number, z: number, spread: number, scaleMin: number, scaleMax: number)
	local n = rng:NextInteger(2, 3)
	for _ = 1, n do
		tuft(x + rand(-spread, spread), z + rand(-spread, spread), rand(scaleMin, scaleMax))
	end
end

local function vergeClumps(fromZ: number, toZ: number)
	-- Works for the south path too, where toZ < fromZ.
	local step = if toZ > fromZ then 1 else -1
	local z = fromZ + step * rand(10, 20)
	while (toZ - z) * step > 12 do
		local side = if rng:NextNumber() < 0.5 then 1 else -1
		tuftClump(side * (PATH_HALF + rand(3, 7)), z, 4, 1.0, 1.6)
		if rng:NextNumber() < 0.35 then
			tuftClump(-side * (PATH_HALF + rand(3, 7)), z + rand(-12, 12), 4, 1.0, 1.5)
		end
		z += step * rand(36, 62)
	end
end

--[[ The south verge stops short of SOUTH_PATH_END. It used to be held here by a
	 COLOUR argument — tufts were meadow green and everything past the gate is
	 snow, so running them down the ice road pushed green grass deep into the cold
	 zone and fought the ground-colour zoning §1 asks for. That argument is gone:
	 tuft() now reads the ground it stands on and paints the cold stretch from
	 COLD_TUFT / COLD_TUFT_DEEP, so the ~104 studs of verge below z = -64 are
	 frozen scrub rather than meadow green, and the same recolour catches the
	 single tufts planted against the cold rock and tree clusters further down.

	 The limit stays at -170 anyway, for a different and smaller reason: every
	 scatter decision downstream of here comes out of the same seeded Random in a
	 fixed order, so moving this bound reshuffles the prop tufts that follow it.
	 That is a composition change, not a defect fix, and this build is one that
	 has already been walked. The deepest stretch of road reading as bare snow is
	 a defensible look; it is not what was wrong. ]]
local SOUTH_VERGE_END = -170

vergeClumps(NORTH_PATH_START, NORTH_PATH_END)
vergeClumps(SOUTH_PATH_START, SOUTH_VERGE_END)

--[[ Against props: the spec's second placement rule for tufts. These stay single
	 tufts on purpose — the rock or tree cluster IS the cluster the grass is read
	 against, and doubling them up here would tip the density past "moderate". ]]
for i = 1, #ROCK_CLUSTERS, 2 do
	local anchor = ROCK_CLUSTERS[i]
	tuft(anchor[1] + rand(-12, 12), anchor[2] + rand(-12, 12), rand(0.9, 1.4))
end
for i = 2, #TREE_CLUSTERS, 3 do
	local anchor = TREE_CLUSTERS[i]
	tuft(anchor[1] + rand(-18, 18), anchor[2] + rand(-18, 18), rand(1.0, 1.5))
end

-- 12. Lighting ------------------------------------------------------------
--[[ §1/§7: bright, high-key, clear cyan sky, midday. No dark lighting and no
	 heavy fog — both are listed as things the category does not do, and fog in
	 particular would eat the landmark from spawn, which is the one composition
	 rule this world is built around. ]]

Lighting.Ambient = Color3.fromRGB(112, 116, 122)
Lighting.OutdoorAmbient = Color3.fromRGB(146, 152, 158)
Lighting.Brightness = 3
Lighting.ClockTime = 14
Lighting.GeographicLatitude = 12
Lighting.ExposureCompensation = 0
Lighting.EnvironmentDiffuseScale = 0.55
Lighting.EnvironmentSpecularScale = 0.2
Lighting.GlobalShadows = true
Lighting.FogStart = 0
Lighting.FogEnd = 100000
Lighting.FogColor = W.Sky

--[[ Technology is not scriptable in every Studio build; a failure here is
	 cosmetic (the world still renders), so it must not abort the build. ]]
pcall(function()
	Lighting.Technology = Enum.Technology.Future
end)

for _, child in Lighting:GetChildren() do
	if child:IsA("Sky") or child:IsA("Atmosphere") then
		child:Destroy()
	end
end

--[[ A fresh Sky ships with Roblox's default skybox ids already populated —
	 the clear blue-cyan daytime sky §1 asks for. The skybox faces are
	 deliberately left untouched: assigning "" to them yields a black void, which
	 is the most expensive way to fail §9.10. Only the night ornaments are off. ]]
local sky = Instance.new("Sky")
sky.Name = "CanyonSky"
sky.CelestialBodiesShown = true
sky.StarCount = 0
sky.Parent = Lighting

local atmos = Instance.new("Atmosphere")
atmos.Name = "CanyonAir"
-- Density stays low on purpose: just enough aerial perspective to separate the
-- far cliffs from the sky, nowhere near the "heavy fog" §7 rules out.
atmos.Density = 0.18
atmos.Offset = 0.1
atmos.Color = W.Sky
atmos.Decay = Color3.fromRGB(150, 200, 235)
atmos.Glare = 0
atmos.Haze = 0.6
atmos.Parent = Lighting

-- 13. Summary -------------------------------------------------------------

pcall(function()
	game:GetService("ChangeHistoryService"):SetWaypoint("Crystal Canyon world build")
end)

local extent = maxB - minB
print(
	string.format(
		"[Crystal Canyon] world rebuilt — %d parts, bounds %.0f x %.0f x %.0f studs (x/y/z), seed %d",
		partCount,
		extent.X,
		extent.Y,
		extent.Z,
		SEED
	)
)
