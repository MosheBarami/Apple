--!strict
--[[
	Crystal Canyon — deterministic edit-time world builder.

	Run this as a plain chunk from the Studio command bar (or a build plugin) in
	EDIT mode. It is not a ModuleScript and returns nothing; it does its work on
	execution and prints a summary — including the four-way part split, which is
	the number successive revisions of this file are measured against.

	=========================================================================
	WHAT CHANGED, AND WHY — REVISION 3, THE STYLE-COHERENCE PASS
	=========================================================================

	Revision 1 built 608 primitives and was rejected as a blockout. Revision 2
	replaced the props with a curated Creator Store palette; that was accepted as
	a real improvement and rejected again for a DIFFERENT reason:

	    "the world reads too much like multiple unrelated free assets placed
	     into one map"

	The failure moved from "no asset vocabulary" to "no style coherence", and the
	named hard fails were specific: giant green slabs at eye height, lime-green
	trees standing in the snow, a canyon wall of repeated rectangles, red spheres
	on the cliff tops, a blockout landmark, props that disagree about scale, and
	raw grey imported meshes.

	Each of those is answered here by a STRUCTURE, not by a convention, because a
	convention is what failed: the previous file had the right intentions written
	in comments and still put a lime tree in the snow, because any call site
	could pass its own `tint` and its own `scale`.

	  1. BIOME ART BIBLES (§ "BIOME ART BIBLES" below). Two biomes are declared as
	     data: allowed vegetation families, a tint per material role, and the
	     cliff tones. `biomeAt(x, z)` resolves one from position, and it is the
	     ONLY path — `pick()` resolves the family through the biome and `place()`
	     takes the tint from the biome. There is no `tint` parameter on any prop
	     call any more, and `tree_round` is not an allowed family in the frost
	     biome, so it is substituted for a pine before a clone is ever drawn.
	     Writing one more prop() call cannot put a warm-green tree in the snow.

	  2. PLAYER-RELATIVE SCALE TIERS. Placements ask for a NAMED TIER — micro,
	     small, player, large, sapling, tree, landmark — expressed in studs of
	     finished height, and the builder solves the scale factor from the clone's
	     own extents. No call site sets a raw scale factor. A rock and a crate
	     that both ask for `player` come out the same height whatever their source
	     mesh measured, which is the direct fix for "trees, rocks, fences, crates
	     disagree strongly in scale".

	  3. EVERY CLONE IS TINTED INTO ITS BIOME. MeshPart.Color only takes effect
	     where TextureID is empty, so a textured mesh cannot be recoloured. The
	     loader measures that per member (`isTintable`) and each biome declares,
	     per family, whether a textured member is admissible. Frost admits none —
	     a texture authored for a temperate tree is off-palette in snow. The
	     canyon admits textured FOLIAGE only, because green-on-brown foliage art
	     is already the canyon's palette; every hard-surface family (rock, fence,
	     sign, crate, crystal) is tintable-only in both biomes, which is what
	     makes a raw grey imported fence impossible rather than merely unlikely.

	  4. GUIDANCE IS PAINTED, NOT FLOWN. The floating slab arrows are deleted.
	     Route reading is now chevrons painted flat ON the road, a lit edge trim
	     along both verges, and low marker posts at ~6 studs. See § 9.

	  5. CANYON WALLS ARE MASSIFS. Fewer, longer masses; a sealing base course
	     with irregular offset courses above it; every stack ramp-capped; eroded
	     saddles cut deliberately into the run; talus AND biome vegetation at the
	     foot so the wall never meets the ground in a straight seam. The ball
	     "crowns" that read as red eggs on the skyline are gone.

	  6. THE LANDMARK IS BUILT, NOT BLOCKED OUT. The pedestal is a stepped
	     octagonal dais of radial ashlar segments with a chamfer course, not two
	     squares per tier; the spire is a seven-level tapering faceted shaft with
	     a twist per level, not three rectangular columns. The Glacier Heart uses
	     the same dais builder so the two landmarks read as one civilisation.

	  7. THE PALETTE IS CULLED, HARD. 26 members down to 15, curated by an
	     explicit allowlist in this file (so the cull survives whatever happens to
	     ServerStorage) and recorded with a reason per exclusion in
	     assets/palette.json. Fewer and coherent beats more and mixed.

	Two properties this file has always guaranteed and still does:

	1. IDEMPOTENT. It destroys Workspace.Canyon before rebuilding, so running it
	   twice never doubles the geometry. Anything it touches outside that folder
	   (the Sky, the spawn) is likewise found-and-replaced by name, never added.

	2. DETERMINISTIC. Every scatter decision comes from one Random seeded with
	   SEED and consumed in a fixed order. Do not introduce a second Random, do
	   not call math.random, and do not reorder the build phases without
	   expecting the whole canyon to shuffle.

	   `prop()` draws ALL of its jitter (yaw, size, two tilts, family index)
	   BEFORE it decides whether a palette clone or a primitive fallback is going
	   down, and the fallback bodies consume no RNG of their own (see `wobble`).
	   The biome substitution happens before the draw and does not change the
	   draw count. So the LAYOUT is identical whether or not the palette folder
	   exists — only the geometry standing at each point differs.

	Everything positional is derived from Config.Zones[].Bounds, so the world and
	the crystal spawner cannot disagree about where a zone is. Every authored
	colour comes from Palette.World / Palette.Pads or from a biome bible.
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

local function chance(p: number): boolean
	return rng:NextNumber() < p
end

-- Bookkeeping -------------------------------------------------------------
--[[ The owner asked for the primitive-vs-asset ratio specifically, and one
	 number would be dishonest in either direction, so parts land in four buckets:

	   assetCount  palette clones. Meshes.
	   fallback    a tree/rock/bush/crystal/fence/sign/crate that came out as
	               boxes because the palette was unavailable. THIS IS THE
	               REGRESSION COUNTER: with the palette loaded it must be 0, and
	               if it is not, the world is drifting back to the blockout.
	   detail      grass tufts, snow caps, the fire ring — small primitives with
	               no palette equivalent. Charging these to "primitive props"
	               would make the ratio look worse than the build actually is.
	   authored    ground, paths, cliffs, landmark, pads, gate, arrows, ice
	               shelf. These are SUPPOSED to be primitives; they are
	               art-directed shapes, not substitutes for assets. Charging
	               them to "assets" would make the ratio look better than it is. ]]
local partCount = 0
local assetCount = 0
local buckets: { [string]: number } = { authored = 0, detail = 0, fallback = 0 }
local currentBucket = "authored"

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
	buckets[currentBucket] += 1
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

--[[ Wedges are their own class in Roblox — `Part.Shape` has no wedge member —
	 so cliff caps need a separate constructor. Orientation follows the same
	 convention as the cliff slabs (local Z runs into the wall), which means the
	 slope falls off across the wall's depth. Which of the two depth faces it
	 falls toward is a Roblox convention detail and does not matter here: either
	 way the top of the stack is a chamfered ramp rather than a flat block lid,
	 and that is the whole reason the cap exists. ]]
local function wedge(parent: Instance, name: string, size: Vector3, cf: CFrame, color: Color3): WedgePart
	local p = Instance.new("WedgePart")
	p.Name = name
	p.Size = size
	p.CFrame = cf
	p.Color = color
	p.Material = Enum.Material.SmoothPlastic
	p.Anchored = true
	p.CanCollide = true
	p.CanTouch = false
	p.Parent = parent
	partCount += 1
	buckets[currentBucket] += 1
	track(cf.Position, size)
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

-- =========================================================================
-- THE CURATED ASSET PALETTE
-- =========================================================================
--[[ MeshParts sitting at ServerStorage.GolemPalette.<family>.<name>, acquired
	 from the Roblox Creator Store, scripts stripped, normalised to one height per
	 family (see assets/palette.json for provenance per asset).

	 =====================  THE CULL  =====================

	 The acquisition pass brought back 26 members across eight families and the
	 world built from all 26 was rejected: "reads too much like multiple
	 unrelated free assets placed into one map". 26 acquired is not 26 that must
	 remain. A smaller coherent palette beats a larger incoherent one, so the
	 palette is curated down to 15 by the ALLOWLIST below, and the reason for
	 each exclusion is recorded in assets/palette.json.

	 THE ALLOWLIST LIVES HERE, IN THE BUILDER, ON PURPOSE. ServerStorage is
	 whatever the last acquisition run left behind; if the cull lived only in the
	 JSON then a re-run of the broker would quietly put the culled assets back in
	 the world. Curation that can be undone by a background job is not curation.
	 A DENY list would have the same hole from the other side — a newly acquired
	 asset nobody vetted would be admitted silently — so this is an ALLOWLIST and
	 anything loaded that is not on it is excluded AND named in a warning, which
	 is the operator's cue that the list needs a decision rather than a bypass.

	 Members are keyed by name plus width because names collide inside a family
	 (the tree_round family contains two members both literally called "Tree",
	 13.1 and 29.8 studs wide — and it is the 29.8 one that is culled).

	 =====================  TEXTURES  =====================

	 MeshPart.Color has NO EFFECT where TextureID is non-empty. That is the
	 mechanism behind two of the named hard fails: a textured mesh keeps whatever
	 palette its author baked in, so "tint it cold" silently does nothing and the
	 asset stands in the snow wearing its original green. `isTintable` measures
	 it per member at load, the pools are split, and each biome decides per family
	 whether an untintable member may be admitted at all. ]]

local PALETTE_ROOT_NAME = "GolemPalette"

local FAMILIES = { "tree_pine", "tree_round", "bush", "rock", "crystal", "fence", "sign", "crate" }

--[[ The curated 15. `w` is the normalised width recorded in assets/palette.json;
	 a live member matches on name plus a width within 2 studs of it, which is
	 loose enough to survive re-normalisation and tight enough to tell the two
	 "Tree"s apart. ]]
--[[ Keyed on ASSET ID, not on the Creator Store display name.

	 The first version of this table matched `entry.name == inst.Name` against
	 names like "pine tree low poly model". The instances in ServerStorage are
	 named `<family>_<assetId>` by the acquisition step, so NOTHING ever matched:
	 every family fell through to the authored fallback and the world rebuilt
	 itself entirely out of primitives — 1287 parts, 0 mesh clones — which is the
	 exact blockout the art pass existed to escape. It verified clean in a stub
	 harness because the harness fixture was named the way the table expected.

	 An id cannot drift the way a display name can (two of these assets are both
	 literally called "Tree"), so the id is the key and the width is kept only as
	 a sanity check that the mesh is the one that was measured. ]]
local CURATED: { [string]: { { id: number, w: number } } } = {
	tree_pine = {
		{ id = 104234188430181, w = 21.6 },
		{ id = 9926335346, w = 20.1 },
	},
	tree_round = {
		{ id = 127399080507887, w = 13.1 },
		{ id = 8317025917, w = 17.0 },
	},
	bush = {
		{ id = 8395227352, w = 5.3 },
	},
	rock = {
		{ id = 7081133535, w = 9.9 },
		{ id = 12098534165, w = 6.2 },
		{ id = 7081132350, w = 7.2 },
	},
	crystal = {
		{ id = 8886132415, w = 2.7 },
		{ id = 6031842433, w = 3.3 },
		{ id = 833341965, w = 4.7 },
	},
	fence = {
		{ id = 1239333934, w = 11.6 },
	},
	sign = {
		{ id = 921382938, w = 5.4 },
	},
	crate = {
		{ id = 430288318, w = 4.0 },
		{ id = 17307483378, w = 4.0 },
	},
}

local function extentsOf(inst: any): Vector3
	if inst:IsA("Model") then
		return inst:GetExtentsSize()
	end
	return inst.Size
end

--[[ Can this member take a colour? A MeshPart carrying a TextureID cannot: the
	 texture wins and Color is ignored. A Model is tintable only if every MeshPart
	 under it is, because a half-tinted prop is worse than an untinted one. ]]
local function isTintable(inst: any): boolean
	if inst:IsA("MeshPart") then
		return inst.TextureID == ""
	end
	if inst:IsA("Model") then
		for _, d in inst:GetDescendants() do
			if d:IsA("MeshPart") and d.TextureID ~= "" then
				return false
			end
		end
		return true
	end
	return true
end

local function curatedFor(family: string, inst: any): boolean
	local list = CURATED[family]
	if not list then
		return false
	end
	local id = tonumber(tostring(inst.Name):match("(%d+)$"))
	if not id then
		return false
	end
	local w = extentsOf(inst).X
	for _, entry in list do
		-- Width is a sanity check that this is the mesh that was measured, not
		-- the identity: the id is the identity.
		if entry.id == id and math.abs(w - entry.w) <= 2.5 then
			return true
		end
	end
	return false
end

--[[ Instance:GetChildren() order is not contractually stable, and this build's
	 whole value is that two runs are identical. Sort by a key that cannot tie:
	 the name alone is not enough, so the extents break the tie. ]]
local function sortKey(inst: any): string
	local e = extentsOf(inst)
	return string.format("%s|%.2f|%.2f|%.2f", inst.Name, e.X, e.Y, e.Z)
end

local paletteRoot = ServerStorage:FindFirstChild(PALETTE_ROOT_NAME)
local pools: { [string]: { any } } = {} -- curated members, any texture state
local tintablePools: { [string]: { any } } = {} -- curated members that take a colour
local paletteTotal = 0
local loadedTotal = 0
local culledNames: { string } = {}
local texturedNames: { string } = {}

for _, family in FAMILIES do
	local all: { any } = {}
	local tintable: { any } = {}
	local sub = if paletteRoot then paletteRoot:FindFirstChild(family) else nil
	if sub then
		local found: { any } = {}
		for _, child in sub:GetChildren() do
			if child:IsA("BasePart") or child:IsA("Model") then
				table.insert(found, child)
			end
		end
		table.sort(found, function(a, b)
			return sortKey(a) < sortKey(b)
		end)
		for _, member in found do
			loadedTotal += 1
			if not curatedFor(family, member) then
				table.insert(culledNames, `{family}/{member.Name}`)
				continue
			end
			table.insert(all, member)
			if isTintable(member) then
				table.insert(tintable, member)
			else
				table.insert(texturedNames, `{family}/{member.Name}`)
			end
		end
	end
	pools[family] = all
	tintablePools[family] = tintable
	paletteTotal += #all
end

--[[ The fence family is curated down to a single flat panel, so the shape filter
	 the previous revision needed (to keep a 65-stud fenced ENCLOSURE out of a
	 line of panels) has nothing left to filter: the enclosure is culled. The
	 alias is kept because call sites read better asking for a `fence_panel`, and
	 because it is where a second panel design would be admitted if one were ever
	 curated in. ]]
pools.fence_panel = pools.fence
tintablePools.fence_panel = tintablePools.fence

local paletteOK = paletteTotal > 0
if not paletteOK then
	warn(
		"[Crystal Canyon] ServerStorage."
			.. PALETTE_ROOT_NAME
			.. " is missing, empty, or contains nothing on the curated allowlist — FALLING BACK TO "
			.. "PRIMITIVE CONSTRUCTION.\n"
			.. "  Every tree, rock, bush, crystal, fence, sign and crate in this build will be a box "
			.. "assembly, which is the rejected blockout look. Load the palette before capturing "
			.. "anything for review. The summary line below reports the split."
	)
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
local SELL_PAD = Vector2.new(32, -12)
local UPGRADE_PAD = Vector2.new(-38, 52)

--[[ The two secondary landmarks, declared up here rather than at their build
	 sites so the keep-out test can see them. Without that, a copse anchored
	 nearby grows into the formation: measured on an earlier build, a terminus
	 pine landed 2 studs from an outcrop crystal, canopy through crystal. ]]
local OUTCROP = Vector2.new(-66, 186)
local GLACIER = Vector2.new(0, -238)

--[[ The frost slab's footprint. Computed here rather than in the GROUND section
	 because the biome lookup below needs it, and the biome lookup has to exist
	 before the first prop is placed. GROUND then draws the slab from these same
	 numbers, so the painted floor and the biome boundary cannot drift apart. ]]
local frostNorth = GATE_Z + 2
local frostSouth = WORLD_Z_S + 8
local frostWidth = (frost.Bounds.Max.X - frost.Bounds.Min.X) + 60
local frostMidX = (frost.Bounds.Min.X + frost.Bounds.Max.X) / 2

--[[ Is this spot standing on the frost slab? The footprint, not GATE_Z, is the
	 honest test: what a prop is painted against is the ground actually under it. ]]
local function onFrostFloor(x: number, z: number): boolean
	return z <= frostNorth and z >= frostSouth and math.abs(x - frostMidX) <= frostWidth / 2
end

-- =========================================================================
-- BIOME ART BIBLES
-- =========================================================================
--[[ THE FIX FOR CONTAMINATION, AND IT IS STRUCTURAL RATHER THAN A CONVENTION.

	 The previous revision had the right intention written in its comments —
	 "cold tint", "sub-alpine, essentially no round trees" — and still put
	 bright warm-green trees and green bushes inside the snow biome, because the
	 intention was expressed as arguments at each of ~90 call sites: every one of
	 them could pass its own `tint`, and the frost copses used a 0.9 pine BIAS,
	 which is a probability, not a rule. One in ten trees in the snow was a
	 temperate round tree, exactly as commissioned.

	 So the tint and the allowed families are no longer arguments. They are
	 properties of the GROUND YOU ARE STANDING ON:

	   MEADOW / CANYON   primary    warm green, sand, rust canyon
	                     secondary  cream, warm grey
	                     accent     crystal cyan
	                     vegetation warm families only (pine, round, bush)
	                     rock       WARM neutral — the palette's rocks skew pale
	                                and are tinted warm here, which is what stops
	                                them reading as frost rock in the canyon
	   FROST HOLLOW      primary    snow white, ice blue, cool grey
	                     secondary  deep pine, desaturated blue-green
	                     accent     crystal violet
	                     vegetation cold-compatible families only — tree_round is
	                                NOT one, and is substituted for a pine before
	                                a clone is drawn
	                     rock       cool blue-grey

	 `prop()` has no tint parameter. `place()` reads the tint from the biome under
	 the placement. `pick()` resolves the family through the biome's rules. There
	 is no argument a call site can pass to opt out, and adding one more prop()
	 call cannot contaminate a biome. ]]

type FamilyRule = {
	role: string, -- which Tint entry paints it
	tintable: boolean, -- true: untintable (textured) members are refused here
	substitute: string?, -- family is not native here; use this one instead
}

type Biome = {
	Id: string,
	Cliff: { Color3 },
	Snow: boolean,
	Tint: { [string]: Color3 },
	Rules: { [string]: FamilyRule },
}

local SNOW = Color3.fromRGB(242, 250, 255)

--[[ Hard-surface families are tintable-only in BOTH biomes. That is the answer
	 to "several fences and signs are raw grey/white and look like unstyled
	 imported meshes": an untintable fence cannot be painted into the palette, so
	 it is not admitted, and the authored fallback — which is always painted from
	 the biome — stands in its place. Dropped rather than accepted, deliberately.

	 Foliage is the one exception, and only in the canyon: a low-poly tree's baked
	 texture is green canopy over brown trunk, which IS this biome's palette, so
	 such a member is admitted here and refused in frost. That is the "accept it
	 only in a biome its texture suits" branch, taken exactly once. ]]
local HARD: FamilyRule = { role = "stone", tintable = true }

local BIOME_MEADOW: Biome = {
	Id = "meadow",
	Cliff = { W.CliffA, W.CliffB, W.CliffC },
	Snow = false,
	Tint = {
		foliage = Color3.fromRGB(74, 168, 82), -- warm green
		wood = Color3.fromRGB(146, 104, 62), -- warm brown, cream-lit
		stone = Color3.fromRGB(178, 152, 126), -- WARM neutral: pale meshes warmed here
		crystal = meadow.CrystalColor,
		accent = P.Arrow,
		--[[ Road paint is measured against the ROAD, not against the biome's
			 general palette. Contrast is sum|Δ| over the three channels, and this
			 file's working benchmark is Dirt on Grass = 170, the pairing §9.5
			 already passes on. Arrow green (70,200,85) scores 203 on Dirt and 197
			 on DirtLight, so one hue serves as both accent and guide here. ]]
		guide = P.Arrow,
	},
	Rules = {
		tree_pine = { role = "foliage", tintable = false },
		tree_round = { role = "foliage", tintable = false },
		bush = { role = "foliage", tintable = false },
		rock = { role = "stone", tintable = true },
		crystal = { role = "crystal", tintable = true },
		fence = { role = "wood", tintable = true },
		fence_panel = { role = "wood", tintable = true },
		sign = { role = "wood", tintable = true },
		crate = { role = "wood", tintable = true },
	},
}

local BIOME_FROST: Biome = {
	Id = "frost",
	-- Cool stone, not rust. A rust wall behind a snowfield was half of why the
	-- two halves of the map read as one zone painted twice.
	Cliff = { Color3.fromRGB(134, 152, 170), Color3.fromRGB(112, 130, 150), Color3.fromRGB(94, 112, 132) },
	Snow = true,
	Tint = {
		foliage = Color3.fromRGB(62, 104, 96), -- deep pine / desaturated blue-green
		wood = Color3.fromRGB(104, 116, 134),
		stone = Color3.fromRGB(146, 170, 188),
		crystal = frost.CrystalColor,
		accent = Color3.fromRGB(96, 214, 236),
		--[[ The frost accent is NOT reused as road paint. Measured against the ice
			 road it scores 136 on IcePath — below the 170 benchmark — and a route
			 disappearing into its own ground is the exact failure the ice road was
			 recoloured to fix once already. This paler ice-white cyan scores 255 on
			 IcePath and 329 on IcePathDark. ]]
		guide = Color3.fromRGB(176, 238, 255),
	},
	Rules = {
		tree_pine = { role = "foliage", tintable = true },
		-- NOT a cold-compatible family. Substituted, not tinted: a temperate
		-- broadleaf silhouette in snow is wrong whatever colour it is painted.
		tree_round = { role = "foliage", tintable = true, substitute = "tree_pine" },
		bush = { role = "foliage", tintable = true },
		rock = { role = "stone", tintable = true },
		crystal = { role = "crystal", tintable = true },
		fence = { role = "wood", tintable = true },
		fence_panel = { role = "wood", tintable = true },
		sign = { role = "wood", tintable = true },
		crate = { role = "wood", tintable = true },
	},
}

--[[ One boundary, derived from the gate, so the biome cannot disagree with the
	 painted floor or with the zone the server unlocks. `x` is unused today and
	 is in the signature anyway: the day the boundary stops being a straight line
	 it must not require touching a single call site. ]]
local FROST_BOUNDARY = GATE_Z + 2

local function biomeAt(_x: number, z: number): Biome
	return if z <= FROST_BOUNDARY then BIOME_FROST else BIOME_MEADOW
end

local function ruleFor(b: Biome, family: string): FamilyRule
	return b.Rules[family] or HARD
end

-- =========================================================================
-- PLAYER-RELATIVE SCALE TIERS
-- =========================================================================
--[[ "trees, rocks, fences, crates disagree strongly in scale."

	 They disagreed because scale was expressed as a MULTIPLIER OF THE SOURCE
	 ASSET: `scaleMin = 1.0` meant 4 studs on a crate, 7 on a fence, 8 on a sign
	 and 34 on a pine, so two props asking for "about one" came out four times
	 different, and every retune of a family's normalised height silently moved
	 every placement of it.

	 Tiers are stated in STUDS OF FINISHED HEIGHT, relative to a ~5-stud Roblox
	 character, and the builder solves the scale factor from the clone's own
	 extents. A rock and a crate that both ask for `player` stand the same height
	 whatever their meshes measured. No placement in this file sets a raw scale
	 factor; `tier` (optionally spanning up to `tierTo`) is the only vocabulary. ]]

local TIERS: { [string]: { number } } = {
	micro = { 0.8, 1.4 }, -- pebbles, chips
	small = { 2.0, 3.4 }, -- ground clutter you step over
	player = { 4.4, 6.0 }, -- eye height: crates, bushes, fence panels, signposts
	large = { 9.0, 12.0 }, -- boulders, big crystals, undergrowth trees
	sapling = { 14.0, 20.0 }, -- between a large prop and a tree
	tree = { 26.0, 34.0 }, -- canopy
	landmark = { 50.0, 92.0 }, -- only the two landmarks and the monument
}

--[[ Nominal finished height of a family's PRIMITIVE fallback body, so the
	 fallback stands at the tier height too. Without this the fallback build and
	 the asset build would have different skylines and the comparison the fallback
	 exists to support would be worthless. ]]
local NOMINAL: { [string]: number } = {
	tree_pine = 34,
	tree_round = 30,
	bush = 6,
	rock = 5,
	crystal = 8,
	fence = 7,
	fence_panel = 7,
	sign = 8,
	crate = 4,
}

--[[ Tiers in order, so a placement can ask for a RANGE of tiers — "somewhere
	 between a small prop and a large one" — without that turning back into a
	 continuous scale factor by the back door. ]]
local TIER_ORDER = { "micro", "small", "player", "large", "sapling", "tree", "landmark" }
local TIER_INDEX: { [string]: number } = {}
for i, name in TIER_ORDER do
	TIER_INDEX[name] = i
end

--[[ Solve a finished height from one uniform draw.

	 A span (`tier` .. `tierTo`) QUANTISES: the draw first chooses which of the
	 named tiers in the span this prop belongs to, and then sizes it inside that
	 tier. It deliberately does NOT interpolate from the bottom of one tier to the
	 top of another, because that produces heights in the gaps between tiers —
	 measured on the first run of this file, a "sapling..tree" pine came out at
	 24.4 studs, which is neither a sapling nor a tree, and a spread of those is
	 how the scale vocabulary quietly dissolves back into arbitrary numbers.

	 One draw either way, so the RNG contract is unchanged. ]]
local function tierHeight(tier: string, tierTo: string?, t: number): number
	local a = TIER_INDEX[tier]
	assert(a, `[Crystal Canyon] unknown scale tier "{tier}"`)
	local b = if tierTo then TIER_INDEX[tierTo] else a
	assert(b, `[Crystal Canyon] unknown scale tier "{tierTo}"`)
	if b < a then
		a, b = b, a
	end
	local n = b - a + 1
	local u = math.min(t, 0.999999) * n
	local step = math.floor(u)
	local band = TIERS[TIER_ORDER[a + step]]
	local frac = u - step
	return band[1] + (band[2] - band[1]) * frac
end

-- Rebuild -----------------------------------------------------------------

local existing = Workspace:FindFirstChild("Canyon")
if existing then
	existing:Destroy()
end

--[[ Roblox's default place ships a grey `Baseplate` part at the origin. The
	 canyon lays its own ground down over the play area, but the baseplate is
	 larger than the ground plane, so it survives at the edges and renders as a
	 flat grey void ringing the world — which is exactly the "world leaks away"
	 failure §7 of the style spec warns about.

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
local fFlora = folder("Flora")
local fRocks = folder("Rocks")
local fStory = folder("Storytelling")
local fSigns = folder("Signposting")
local fPaths = folder("Paths")
local fLandmark = folder("Landmark")
local fSecondary = folder("SecondaryLandmarks")
local fPads = folder("Pads")
local fGates = folder("Gates")
local fCrystals = folder("Crystals")
for _, zone in Config.Zones do
	folder(zone.Id, fCrystals) -- populated at runtime by the Collect service
end

-- =========================================================================
-- 1. GROUND
-- =========================================================================
--[[ §1: colour zones the space. Green is traversable, the pale sand circle is
	 the hub, the frost slab is the second zone. A player is meant to read where
	 they are from ground colour alone before any label loads. ]]

local groundW = WORLD_X * 2 + 40
local groundD = (WORLD_Z_N - WORLD_Z_S) + 46
local groundZ = (WORLD_Z_N + WORLD_Z_S) / 2
box(fGround, "Grass", Vector3.new(groundW, 4, groundD), Vector3.new(0, -2, groundZ), W.Grass)

-- Deeper green pools break the flat field without reading as a texture.
for _, patch in { { -115, 110, 44 }, { 112, -18, 38 }, { -104, 26, 30 }, { 74, 176, 34 } } do
	disc(fGround, "GrassPatch", patch[3], 1.4, patch[1], patch[2], 0.08, W.GrassDeep)
end

--[[ The frost zone gets its own floor so the cold half of the map is legible
	 from the hub long before the gate is affordable. It stops exactly at the
	 gate, which is what makes the gate read as a threshold rather than a prop.
	 Its top sits at y=0.15 — above the grass, below the path (0.35) — so the
	 road stays drawn on top of it.

	 The slab was widened (+60 rather than +44) and runs all the way to the south
	 wall rather than stopping 22 studs past the crystal field. Both are because
	 the zone got things to stand on that the old build had no need for: the
	 Glacier Heart sits at z -238, past the end of the crystal bounds, and the
	 frost tree line runs out to x ±132. Green grass under either of those is the
	 zoning failure §1 warns about. This is cosmetic ground only — crystal spawn
	 points come from Config.Zones, not from this slab, so widening it cannot
	 move a single collectable. ]]
box(
	fGround,
	"FrostFloor",
	Vector3.new(frostWidth, 2, frostNorth - frostSouth),
	Vector3.new(frostMidX, -0.85, (frostNorth + frostSouth) / 2),
	W.Frost
)

-- Drifts. More of them than the previous build, and irregular, because the
-- review's "visibly empty zone" complaint starts at the floor: an unbroken slab
-- of one colour is the first thing that reads as unfinished.
for _, drift in
	{
		{ -62, -140, 46 },
		{ 66, -186, 38 },
		{ -34, -96, 26 },
		{ 44, -118, 30 },
		{ -80, -206, 34 },
		{ 24, -232, 28 },
		{ -18, -168, 22 },
		{ 86, -148, 24 },
	}
do
	disc(fGround, "FrostDrift", drift[3], 1.2, drift[1], drift[2], 0.28, W.FrostDeep)
end

-- The hub: a circular sand clearing. Sitting proud of the grass by half a stud
-- gives it a visible lip instead of a seam.
disc(fGround, "HubRim", HUB_RADIUS + 5, 1.6, 0, 0, 0.30, W.Dirt)
disc(fGround, "SandHub", HUB_RADIUS, 1.8, 0, 0, 0.55, W.Sand)

--[[ Which surface is a prop standing on? Props that float half a stud above the
	 sand or sink into the frost slab are the tell that a world was assembled
	 rather than placed, and with three ground heights in play that is easy to do
	 by accident. ]]

local function groundTop(x: number, z: number): number
	if onFrostFloor(x, z) then
		return 0.15
	end
	if math.sqrt(x * x + z * z) <= HUB_RADIUS then
		return 0.55
	end
	return 0
end

-- =========================================================================
-- 2. PATHS
-- =========================================================================
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
				 frost tone: this run lies entirely on FrostFloor, which is painted
				 `W.Frost`, and an earlier build painted half the road in exactly
				 that colour so the route vanished into the ground.

				 Contrast is sum|Δ| over the three channels vs the ground beneath.
				 North path (the half that passes §9.5) is the benchmark:
				   Dirt      (201,138, 75) on Grass ( 95,201, 74) -> 170
				   DirtLight (224,164, 92) on Grass              -> 184
				 The ice road, on the frost floor:
				   IcePath     ( 96,141,173) on Frost (206,232,245) -> 273
				   IcePathDark ( 74,116,146) on Frost               -> 347 ]]
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

--[[ Path SHOULDERS. The review's "paths feel generated rather than art-directed"
	 is partly that the road is a rectangle with nothing at its edge — a road in a
	 built world has a verge that someone laid. These are short kerb slabs at an
	 irregular pitch on alternating sides, in the darker tone of the road they
	 border, so the edge is broken rather than ruler-straight. ]]
local function shoulders(fromZ: number, toZ: number, warm: boolean)
	local step = if toZ > fromZ then 1 else -1
	local z = fromZ + step * rand(8, 18)
	while (toZ - z) * step > 14 do
		local side = if chance(0.5) then 1 else -1
		local len = rand(14, 30)
		local color = if warm then W.Dirt else W.IcePathDark
		box(
			fPaths,
			"PathShoulder",
			Vector3.new(rand(3, 6), 1.2, len),
			Vector3.new(side * (PATH_HALF + rand(1.5, 3.5)), -0.45, z + step * len / 2),
			color,
			0,
			false
		)
		z += step * (len + rand(14, 40))
	end
end

shoulders(NORTH_PATH_START, NORTH_PATH_END, true)
shoulders(GATE_Z, SOUTH_PATH_END, false)

-- =========================================================================
-- 3. PROP VOCABULARY  (palette clone, or primitive fallback)
-- =========================================================================

--[[ TWO keep-out tests, and the split matters.

	 `onRoad` is ABSOLUTE. Nothing a player walks through may stand in the 24-stud
	 corridor, and no call site may opt out of it — a deliberately placed prop in
	 the middle of the road is never what was meant, whereas a deliberately placed
	 prop next to a pad usually is.

	 `blocked` is the softer one — pads, spawn, the landmark plinth, the gate —
	 and `anywhere = true` does bypass it, because dressing those is the point of
	 the storytelling clusters.

	 A prop that lands inside either is DISCARDED rather than nudged: nudging
	 would pile props against the keep-out boundary in a visible arc, which reads
	 worse than a small hole. ]]
local function onRoad(x: number, z: number): boolean
	if math.abs(x) > PATH_HALF + 5 then
		return false
	end
	local north = z >= NORTH_PATH_START - 6 and z <= NORTH_PATH_END + 6
	local south = z <= SOUTH_PATH_START + 6 and z >= SOUTH_PATH_END - 6
	return north or south
end

local function blocked(x: number, z: number): boolean
	local inNorthCorridor = z >= NORTH_PATH_START - 8 and z <= NORTH_PATH_END + 8
	local inSouthCorridor = z <= SOUTH_PATH_START + 8 and z >= SOUTH_PATH_END - 8
	if math.abs(x) <= PATH_HALF + 7 and (inNorthCorridor or inSouthCorridor) then
		return true
	end
	if (Vector2.new(x, z) - SELL_PAD).Magnitude < 27 then
		return true
	end
	if (Vector2.new(x, z) - UPGRADE_PAD).Magnitude < 27 then
		return true
	end
	if (Vector2.new(x - SPAWN.X, z - SPAWN.Z)).Magnitude < 22 then
		return true
	end
	if (Vector2.new(x - LANDMARK.X, z - LANDMARK.Z)).Magnitude < 40 then
		return true
	end
	if math.abs(z - GATE_Z) < 14 and math.abs(x) < 34 then
		return true
	end
	if (Vector2.new(x, z) - OUTCROP).Magnitude < 26 then
		return true
	end
	if (Vector2.new(x, z) - GLACIER).Magnitude < 32 then
		return true
	end
	return false
end

-- Palette draw ------------------------------------------------------------

--[[ Why a prop ended up as a primitive. Three different failures wear very
	 different faces and folding them into one counter is how the regression the
	 counter exists to catch gets missed:

	   asset       a curated palette clone went down. The good case.
	   "nopalette" the family has no curated member loaded at all — usually the
	               whole folder is missing. This is the blockout regression.
	   "offpalette" the family HAS members but none of them may stand in this
	               biome, because they are textured and this biome refuses
	               untintable members. This is working as designed: an authored,
	               biome-painted body is better than an off-palette mesh. ]]
local pickNoPalette, pickOffPalette = 0, 0

--[[ Draw a member of `family` for the ground at (x, z).

	 EXACTLY ONE RNG DRAW, ALWAYS — whatever the biome decides, whatever the pool
	 turns out to contain. That is what keeps the asset build and the primitive
	 fallback build on the same random stream, so they lay out identically and a
	 screenshot of one is a fair comparison against the other. The biome's
	 substitution happens BEFORE the draw and does not change the draw count.

	 Returns the RESOLVED family as well as the clone, because the caller has to
	 build the right fallback body when the draw comes back empty — asking for a
	 round tree in the frost hollow and getting a primitive round tree would
	 reintroduce the contamination through the back door. ]]
local function pick(family: string, x: number, z: number, r: Random): (string, any?)
	local biome = biomeAt(x, z)
	local rule = ruleFor(biome, family)
	local resolved = rule.substitute or family
	if rule.substitute then
		rule = ruleFor(biome, resolved)
	end

	local pool = if rule.tintable then tintablePools[resolved] else pools[resolved]
	local u = r:NextNumber()

	if not pool or #pool == 0 then
		if pools[resolved] and #pools[resolved] > 0 then
			pickOffPalette += 1
		else
			pickNoPalette += 1
		end
		return resolved, nil
	end
	return resolved, pool[math.min(#pool, math.floor(u * #pool) + 1)]:Clone()
end

--[[ Stand a clone on the ground at (x, z).

	 Returns the placed height in studs, which callers use to stack (crates) and
	 to decide where a snow cap goes.

	 THE TINT IS NOT A PARAMETER. It is read from the biome under the placement,
	 which is the whole mechanism that makes contamination unwriteable. Material
	 is forced to SmoothPlastic: §7 wants flat-shaded untextured low-poly and
	 §9.10 fails a realistic material outright. TextureID is left alone — the
	 palette members that carry one carry it as authored art, and blanking it
	 yields an untextured white blob. Colour therefore lands only on the members
	 that can take it, which is exactly the set each biome admits. ]]
local function place(
	parent: Instance,
	clone: any,
	family: string,
	x: number,
	z: number,
	groundY: number,
	scale: number,
	yaw: number,
	tiltX: number,
	tiltZ: number,
	collide: boolean
): number
	local biome = biomeAt(x, z)
	local tint = biome.Tint[ruleFor(biome, family).role] or biome.Tint.stone

	local ext = extentsOf(clone)
	local h = ext.Y * scale
	-- Sink a touch so a mesh whose lowest vertex is above its bounding box floor
	-- does not hover. Capped so a small prop is not buried.
	local sink = math.min(0.7, h * 0.06)
	local cf = CFrame.new(x, groundY + h / 2 - sink, z) * CFrame.Angles(math.rad(tiltX), math.rad(yaw), math.rad(tiltZ))

	local function dress(p: BasePart)
		p.Anchored = true
		p.CanCollide = collide
		p.CanTouch = false
		p.Material = Enum.Material.SmoothPlastic
		if not p:IsA("MeshPart") or (p :: MeshPart).TextureID == "" then
			p.Color = tint
		end
	end

	if clone:IsA("Model") then
		clone:ScaleTo(scale)
		clone.Parent = parent
		clone:PivotTo(cf)
		local n = 0
		for _, d in clone:GetDescendants() do
			if d:IsA("BasePart") then
				dress(d)
				n += 1
			end
		end
		partCount += math.max(1, n)
		assetCount += math.max(1, n)
	else
		clone.Size = ext * scale
		clone.CFrame = cf
		dress(clone)
		clone.Parent = parent
		partCount += 1
		assetCount += 1
	end

	track(Vector3.new(x, groundY + h / 2, z), Vector3.new(ext.X * scale, h, ext.Z * scale))
	return h
end

-- Primitive fallbacks -----------------------------------------------------
--[[ Only reached when the biome has no admissible palette member. These are
	 deliberately plain constructions — this path is a safety net, not a second
	 art direction — but they are ALWAYS painted from the biome, so a fallback
	 body is in-palette even when a mesh would not have been. Heights are driven
	 by the same tier the clone would have used, which is what keeps the skyline
	 and therefore the composition metrics comparable. ]]

local CONIFER_W = { 17, 13.5, 10, 6 }
local CONIFER_H = { 9.5, 8, 6.5, 5.5 }

--[[ A fallback body must consume ZERO RNG, and this is how it gets its internal
	 variation instead.

	 `prop()` draws its five jitter values before it knows whether an asset or a
	 box assembly is going down, so that the two builds place things in the same
	 spots. If the box assembly then drew a few more numbers of its own, every
	 prop AFTER it would shift, and the asset build and the fallback build would
	 be different worlds rather than the same world in two materials.

	 A second Random is not an option — the file has one seeded generator by
	 contract — so the variation is hashed out of the jitter values `prop()`
	 already drew. Same input, same wobble; different props, different wobble. ]]
local function wobble(a: number, b: number, k: number): number
	local t = (math.sin(k * 12.9898) * 43758.5453) % 1
	if t < 0 then
		t += 1
	end
	return a + (b - a) * t
end

local function fbConifer(
	parent: Instance,
	x: number,
	z: number,
	y: number,
	s: number,
	canopy: Color3,
	light: Color3,
	trunk: Color3,
	seed: number
)
	box(parent, "Trunk", Vector3.new(3.4 * s, 10 * s, 3.4 * s), Vector3.new(x, y + 5 * s, z), trunk, seed % 90)
	local cy = y + 7.5 * s
	for k = 1, 4 do
		local h = CONIFER_H[k] * s
		box(
			parent,
			"Tier",
			Vector3.new(CONIFER_W[k] * s, h, CONIFER_W[k] * s),
			Vector3.new(x, cy + h / 2, z),
			if k % 2 == 0 then light else canopy,
			45 + k * 21 + wobble(-8, 8, seed + k * 1.7)
		)
		cy += h * 0.63
	end
end

local function fbRound(
	parent: Instance,
	x: number,
	z: number,
	y: number,
	s: number,
	canopy: Color3,
	light: Color3,
	trunk: Color3,
	seed: number
)
	box(parent, "Trunk", Vector3.new(3.2 * s, 14 * s, 3.2 * s), Vector3.new(x, y + 7 * s, z), trunk, seed % 90)
	local blobs = 2 + math.floor(wobble(0, 1.999, seed + 0.3))
	for k = 1, blobs do
		local r = wobble(9, 13, seed + k * 2.3) * s * (1 - (k - 1) * 0.16)
		blob(
			parent,
			"Canopy",
			Vector3.new(r * 2, r * 1.7, r * 2),
			Vector3.new(
				x + wobble(-5, 5, seed + k * 3.7) * s,
				y + (14 + wobble(2, 7, seed + k * 4.1) + (k - 1) * 5) * s,
				z + wobble(-5, 5, seed + k * 5.3) * s
			),
			if k % 2 == 0 then light else canopy
		)
	end
end

--[[ Returns the height it built, matching place()'s contract. `scale` is in
	 NOMINAL units — 1.0 means "as tall as this family's nominal body" — so the
	 two paths agree about size once the tier has been solved. ]]
local function fallbackProp(
	parent: Instance,
	family: string,
	x: number,
	z: number,
	y: number,
	scale: number,
	yaw: number,
	tiltX: number,
	tiltZ: number,
	collide: boolean?
): number
	local prev = currentBucket
	currentBucket = "fallback"

	local biome = biomeAt(x, z)
	local T = biome.Tint
	local foliage = T.foliage
	local foliageLight = Palette.lift(foliage, 0.18)
	local wood = T.wood
	local stone = T.stone

	-- Hash source for wobble(): every value prop() already drew for this prop,
	-- so two props never share it and no new RNG is consumed.
	local seed = yaw + scale * 37 + tiltX * 11 + tiltZ * 13

	local height = 0
	if family == "tree_pine" then
		-- Nominal pine is 34 studs; this stack tops out near 28 * s.
		fbConifer(parent, x, z, y, scale * 34 / 28, foliage, foliageLight, wood, seed)
		height = 34 * scale
	elseif family == "tree_round" then
		-- Nominal round tree is 30 studs; this tops out near 26 * s.
		fbRound(parent, x, z, y, scale * 30 / 26, foliage, foliageLight, wood, seed)
		height = 30 * scale
	elseif family == "bush" then
		local r = 3 * scale
		blob(parent, "Bush", Vector3.new(r * 2.1, r * 2, r * 1.9), Vector3.new(x, y + r, z), foliage)
		height = 6 * scale
	elseif family == "rock" then
		local s = 5 * scale
		newPart(
			parent,
			"Rock",
			Vector3.new(s * 1.6, s, s * 1.4),
			CFrame.new(x, y + s * 0.45, z) * CFrame.Angles(math.rad(tiltX), math.rad(yaw), math.rad(tiltZ)),
			if wobble(0, 1, seed) < 0.5 then stone else Palette.shade(stone, 0.18),
			if collide == nil then true else collide
		)
		height = s
	elseif family == "crystal" then
		local h = 8 * scale
		for k = 1, 2 do
			newPart(
				parent,
				"Crystal",
				Vector3.new(2.6 * scale, h * (1 - (k - 1) * 0.35), 2.6 * scale),
				CFrame.new(x + (k - 1) * scale, y + h / 2, z)
					* CFrame.Angles(math.rad(tiltX), math.rad(yaw + (k - 1) * 40), math.rad(tiltZ)),
				if k == 1 then T.crystal else Palette.shade(T.crystal, 0.2),
				false
			)
		end
		height = h
	elseif family == "fence" or family == "fence_panel" then
		local h = 7 * scale
		local wdt = 11 * scale
		local cf = CFrame.new(x, y, z) * CFrame.Angles(0, math.rad(yaw), 0)
		for _, sx in { -0.5, 0.5 } do
			local p = cf * CFrame.new(wdt * sx, h / 2, 0)
			newPart(parent, "FencePost", Vector3.new(1.4, h, 1.4), p, wood, false)
		end
		for _, ry in { 0.45, 0.78 } do
			newPart(
				parent,
				"FenceRail",
				Vector3.new(wdt, 1.1, 0.9),
				cf * CFrame.new(0, h * ry, 0),
				Palette.lift(wood, 0.18),
				false
			)
		end
		height = h
	elseif family == "sign" then
		local h = 8 * scale
		local cf = CFrame.new(x, y, z) * CFrame.Angles(0, math.rad(yaw), 0)
		newPart(parent, "SignPost", Vector3.new(1.4, h, 1.4), cf * CFrame.new(0, h / 2, 0), wood, false)
		newPart(
			parent,
			"SignBoard",
			Vector3.new(6 * scale, 3.4 * scale, 0.7),
			cf * CFrame.new(0, h * 0.78, 0),
			Palette.lift(wood, 0.3),
			false
		)
		height = h
	else -- crate
		local s = 4 * scale
		newPart(
			parent,
			"Crate",
			Vector3.new(s, s, s),
			CFrame.new(x, y + s / 2, z) * CFrame.Angles(0, math.rad(yaw), 0),
			Palette.lift(wood, 0.22),
			if collide == nil then true else collide
		)
		height = s
	end

	currentBucket = prev
	return height
end

-- The one entry point every prop goes through --------------------------------

type PropCfg = {
	tier: string, -- a NAMED tier from TIERS. There is no raw scale factor.
	tierTo: string?, -- span the size range up to the top of a second tier
	tilt: number?,
	collide: boolean?,
	groundY: number?,
	anywhere: boolean?, -- bypass the soft keep-out test, for deliberate placement
}

--[[ RNG ORDER IS PART OF THE CONTRACT: yaw, size, tiltX, tiltZ, family index.
	 All five are drawn before anything branches, so the asset build and the
	 fallback build lay out identically. Do not move the pick() call.

	 Note what is NOT in PropCfg: a tint, and a scale factor. Both are resolved
	 by the builder — the tint from the biome under (x, z), the scale from the
	 named tier and the clone's own extents — because both were arguments in the
	 revision that put green trees in the snow and disagreed with itself about
	 how big a crate is. ]]
local function prop(parent: Instance, family: string, x: number, z: number, cfg: PropCfg): number
	local yaw = rand(0, 360)
	local sizeT = rng:NextNumber()
	-- Signed tilt from a bare NextNumber rather than rand(-tilt, tilt): most
	-- props take the default tilt of 0, and asking a Random for a number in
	-- [0, 0] is a degenerate range no API needs to be asked for.
	local tilt = cfg.tilt or 0
	local tiltX = (rng:NextNumber() * 2 - 1) * tilt
	local tiltZ = (rng:NextNumber() * 2 - 1) * tilt
	local resolved, clone = pick(family, x, z, rng)

	if onRoad(x, z) or (not cfg.anywhere and blocked(x, z)) then
		if clone then
			clone:Destroy()
		end
		return 0
	end

	local targetH = tierHeight(cfg.tier, cfg.tierTo, sizeT)
	local y = cfg.groundY or groundTop(x, z)
	--[[ 9 studs is the collision line: a bush, a chip of rock or a low crystal is
		 something a player brushes past, and being caught on one is the complaint
		 the rule exists to prevent. It is now a decision about the FINISHED
		 HEIGHT rather than about a scale factor, so it means the same thing for
		 every family. ]]
	local collide = if cfg.collide ~= nil then cfg.collide else (targetH >= 9)

	if clone then
		local scale = targetH / math.max(0.1, extentsOf(clone).Y)
		return place(parent, clone, resolved, x, z, y, scale, yaw, tiltX, tiltZ, collide)
	end
	return fallbackProp(parent, resolved, x, z, y, targetH / NOMINAL[resolved], yaw, tiltX, tiltZ, collide)
end

-- =========================================================================
-- 4. CLIFFS
-- =========================================================================
--[[ Named hard fail: "the orange/red perimeter is visibly repeated rectangular
	 blocks. Reads as prototype terrain. Do NOT fix by adding more bricks."

	 The previous run was 50 masses of 46 studs, every one built the same way:
	 three or four concentric slabs of the same width, stepped back by the same
	 mean, and a coin-flip cap. At that segment length the eye gets the rhythm
	 inside two seconds and the whole ring reads as one extrusion repeated.

	 What changed, and none of it is more bricks — this build uses FEWER cliff
	 parts than the last one:

	 1. FEWER, LONGER MASSES. 84-stud segments rather than 46, so the ring is
	    about twenty masses instead of fifty. A mass is now a composition, not a
	    tile.
	 2. A SEALING BASE COURSE, THEN AN IRREGULAR PROFILE ABOVE IT. Course 1 keeps
	    full width, no lateral offset, and overlaps its neighbours — that is the
	    course that guarantees the world cannot leak away. Courses 2+ take strong
	    independent width (0.55-1.0) and lateral offsets, so the silhouette steps
	    and breaks instead of stacking concentrically.
	 3. A BUTTRESS. Most masses get one lower, deeper sub-mass offset along the
	    run with its own yaw, which is what turns a rectangle into a massif.
	 4. EROSION IS DELIBERATE. Roughly one mass in five is a SADDLE: a low, wide,
	    ramp-capped break in the run. The wall still encloses — a saddle is a
	    dip, never a hole — but the skyline stops being continuous.
	 5. EVERY STACK IS RAMP-CAPPED. A flat lid at a shared height is the single
	    strongest "these are boxes" cue on a skyline, so no stack ends in one.
	    Tall masses also get a broken summit: two smaller slabs at their own yaw.
	 6. THE BALL CROWNS ARE GONE. They were the "repeated red/orange spheres on
	    the cliff tops" of the review — a ball painted in a rust cliff tone reads
	    as an egg, not as rock, because a sphere has no facets to catch the flat
	    shading the rest of the world is built on. Where a summit boulder is
	    wanted the build now places an actual rock MESH there, which reads as a
	    boulder because it is one.
	 7. THE FOOT IS PLANTED. Talus rock and biome vegetation at the base, so the
	    wall never meets the ground along a straight seam.

	 Tones come from the BIOME under each mass, not from a global rust triple, so
	 the south wall is cool stone rather than rust with a cold-tinted talus pile
	 in front of it. ]]

type CliffOpts = {
	talus: boolean?,
	planting: boolean?,
	saddles: boolean?,
}

local function cliffRun(
	from: Vector3,
	to: Vector3,
	outward: Vector3,
	segLen: number,
	baseHeight: number,
	depth: number,
	opts: CliffOpts?
)
	local o: CliffOpts = opts or {}
	local span = to - from
	local length = span.Magnitude
	if length < 1 then
		return
	end
	local dir = span.Unit
	local inward = -outward
	local segments = math.max(1, math.floor(length / segLen + 0.5))
	local segWidth = length / segments

	--[[ THE TONE IS RESOLVED WHERE THE GEOMETRY STANDS, not where its mass is
		 anchored. A buttress offsets up to 0.48 of a segment along the run — 40
		 studs at outer-ring scale — which is easily far enough to cross the biome
		 boundary. Measured on the first run of this file: two rust buttresses at
		 z = -77 and -80, hanging off a mass anchored at z = -44, standing in the
		 snow. That is the same contamination this revision exists to make
		 unwriteable, so it gets the same structural answer. ]]
	local function toneAt(at: Vector3, idx: number): Color3
		local set = biomeAt(at.X, at.Z).Cliff
		return set[(idx - 1) % #set + 1]
	end

	for i = 1, segments do
		local anchor = from + dir * (segWidth * (i - 0.5))

		-- Deliberate erosion. A saddle is short and wide; it breaks the skyline
		-- without opening the ring.
		local saddle = (o.saddles ~= false) and chance(0.2)
		local height = baseHeight * (if saddle then rand(0.34, 0.5) else rand(0.88, 1.5))
		local courses = if saddle then 2 else rng:NextInteger(3, 4)
		local toneOffset = rng:NextInteger(0, 2)
		local depthMul = rand(0.78, 1.38)
		--[[ Sink the stack slightly. Every stack starting at y = 0 put every
			 segment's first seam at roughly the same height, and that shared
			 horizontal line is what the eye reads as a step. Downward only:
			 lifting a stack would leave daylight under it. ]]
		local y = -rand(0.4, 3.0)
		local setback = 0
		local topY, topCentre, topWidth, topDepth = 0, anchor, segWidth, depth
		local courseFraction = if saddle then { 0.62, 0.42 } else { 0.46, 0.30, 0.22, 0.16 }

		for k = 1, courses do
			local h = height * courseFraction[k] * rand(0.78, 1.28)
			local w, lateral, dd
			if k == 1 then
				--[[ THE SEALING COURSE. Full width plus 9 studs of overlap with
					 its neighbours and no lateral offset, so however ragged the
					 profile above it becomes, the ring is continuous at ground
					 level and the world does not leak away. This is the one
					 course that is not allowed to be interesting. ]]
				w = segWidth + 9
				lateral = 0
				dd = depth * depthMul
			else
				-- Everything above it is free to be irregular: strong width
				-- variation and an independent lateral shift per course is what
				-- makes the profile step and break rather than telescope.
				w = segWidth * rand(0.55, 1.0)
				lateral = rand(-0.26, 0.26) * segWidth
				dd = depth * depthMul * rand(0.5, 0.88)
				setback += depth * depthMul * rand(0.06, 0.24)
			end
			local centre = anchor + outward * setback + dir * lateral + Vector3.new(0, y + h / 2, 0)
			-- lookAt puts the slab's Z along `outward`, so Size reads
			-- (width along the run, height, depth into the wall).
			local cf = CFrame.lookAt(centre, centre + outward) * CFrame.Angles(0, math.rad(rand(-7, 7)), 0)
			newPart(fCliffs, "CliffCourse", Vector3.new(w, h, dd), cf, toneAt(centre, toneOffset + k), true)
			y += h * 0.95
			topY, topCentre, topWidth, topDepth = y, centre, w, dd
		end

		--[[ ALWAYS a ramp cap. The wedge's slope falls across the wall's depth,
			 so the top of every mass is a chamfered ridge rather than a flat lid.
			 This is unconditional on purpose: the previous build capped 74% of
			 stacks, and the uncapped quarter was enough to keep the flat-lid line
			 legible along the run. ]]
		local capCentre = Vector3.new(topCentre.X, topY, topCentre.Z) + outward * (depth * depthMul * rand(0.02, 0.12))
		local ch = height * rand(0.12, 0.24)
		wedge(
			fCliffs,
			"CliffRamp",
			Vector3.new(topWidth * rand(0.72, 0.98), ch, topDepth * rand(0.85, 1.05)),
			CFrame.lookAt(capCentre + Vector3.new(0, ch / 2, 0), capCentre + Vector3.new(0, ch / 2, 0) + outward)
				* CFrame.Angles(0, math.rad(rand(-12, 12)), 0),
			toneAt(capCentre, toneOffset + courses + 1)
		)

		-- A broken summit on the tall masses: two smaller slabs at their own yaw,
		-- so the top is a shattered crest instead of one ridge line.
		if not saddle and chance(0.55) then
			for k = 1, 2 do
				local sw = topWidth * rand(0.18, 0.34)
				local sh = height * rand(0.10, 0.22)
				local at = capCentre
					+ dir * rand(-topWidth * 0.32, topWidth * 0.32)
					+ inward * rand(0, topDepth * 0.35)
					+ Vector3.new(0, ch * 0.4 + sh / 2, 0)
				newPart(
					fCliffs,
					"CliffCrest",
					Vector3.new(sw, sh, topDepth * rand(0.4, 0.7)),
					CFrame.lookAt(at, at + outward) * CFrame.Angles(0, math.rad(rand(-28, 28)), 0),
					toneAt(at, toneOffset + k + 1)
				)
			end
		end

		--[[ THE BUTTRESS. A lower, deeper sub-mass shouldered against the main
			 one and offset along the run, with its own yaw. One extra part turns
			 a rectangular mass into a compound silhouette, which is the cheapest
			 answer there is to "visibly repeated rectangular blocks". ]]
		if chance(0.72) then
			local bw = segWidth * rand(0.34, 0.6)
			local bh = height * rand(0.34, 0.62)
			local bd = depth * depthMul * rand(0.9, 1.35)
			local at = anchor
				+ dir * (rand(0.22, 0.48) * segWidth * (if chance(0.5) then 1 else -1))
				+ inward * (bd * 0.22)
				+ Vector3.new(0, -rand(0.5, 2.0) + bh / 2, 0)
			newPart(
				fCliffs,
				"CliffButtress",
				Vector3.new(bw, bh, bd),
				CFrame.lookAt(at, at + outward) * CFrame.Angles(0, math.rad(rand(-16, 16)), 0),
				toneAt(at, toneOffset + 2),
				true
			)
		end

		-- Talus at the foot, on the inward face: mesh rock, not more slabs.
		if o.talus ~= false then
			local n = rng:NextInteger(2, 3)
			for _ = 1, n do
				local along = rand(-segWidth * 0.46, segWidth * 0.46)
				local out = rand(0.18, 0.8) * depth
				local at = anchor + dir * along + inward * out
				prop(fRocks, "rock", at.X, at.Z, {
					tier = "small",
					tierTo = "large",
					tilt = 18,
					anywhere = true,
				})
			end
		end

		--[[ PLANTING AT THE BASE. The seam where a wall meets flat ground is a
			 straight line the length of the run, and no amount of work on the
			 silhouette above it hides that. Vegetation standing against the foot
			 breaks it — and because the family and the tint resolve through the
			 biome, the south wall gets cold pines and the canyon gets warm scrub
			 without either call site saying so. ]]
		if o.planting ~= false and chance(0.6) then
			local along = rand(-segWidth * 0.4, segWidth * 0.4)
			local at = anchor + dir * along + inward * rand(0.9, 1.5) * depth
			if chance(0.45) then
				prop(fFlora, "tree_pine", at.X, at.Z, { tier = "sapling", tierTo = "tree", tilt = 3 })
			else
				prop(fFlora, "bush", at.X, at.Z, { tier = "player", tierTo = "large", tilt = 10, collide = false })
			end
		end

		-- A boulder on a mid ledge, breaking the course seam from above. This is
		-- where the old build put a painted ball; it is a rock mesh now.
		if not saddle and chance(0.42) then
			local at = topCentre + inward * (topDepth * rand(0.1, 0.3))
			prop(fRocks, "rock", at.X, at.Z, {
				tier = "player",
				tierTo = "large",
				tilt = 22,
				collide = false,
				groundY = topY - height * rand(0.28, 0.5),
				anywhere = true,
			})
		end
	end
end

-- Outer ring: the world does not leak away.
cliffRun(
	Vector3.new(-WORLD_X - 6, 0, WORLD_Z_N),
	Vector3.new(WORLD_X + 6, 0, WORLD_Z_N),
	Vector3.new(0, 0, 1),
	84,
	34,
	28
)
cliffRun(
	Vector3.new(-WORLD_X - 6, 0, WORLD_Z_S),
	Vector3.new(WORLD_X + 6, 0, WORLD_Z_S),
	Vector3.new(0, 0, -1),
	84,
	34,
	28
)
cliffRun(Vector3.new(WORLD_X, 0, WORLD_Z_S), Vector3.new(WORLD_X, 0, WORLD_Z_N), Vector3.new(1, 0, 0), 84, 34, 28)
cliffRun(Vector3.new(-WORLD_X, 0, WORLD_Z_S), Vector3.new(-WORLD_X, 0, WORLD_Z_N), Vector3.new(-1, 0, 0), 84, 34, 28)

--[[ Inner spurs hug the hub so the clearing is enclosed rather than open on
	 four sides. Saddles are off here: a dip in a 72-stud spur beside the hub is
	 not read as erosion, it is read as a missing piece. ]]
cliffRun(Vector3.new(64, 0, -56), Vector3.new(64, 0, 16), Vector3.new(1, 0, 0), 40, 22, 20, { saddles = false })
cliffRun(Vector3.new(-64, 0, -56), Vector3.new(-64, 0, 16), Vector3.new(-1, 0, 0), 40, 22, 20, { saddles = false })
cliffRun(
	Vector3.new(-56, 0, -64),
	Vector3.new(-PATH_HALF - 8, 0, -64),
	Vector3.new(0, 0, -1),
	40,
	18,
	18,
	{ saddles = false }
)
cliffRun(
	Vector3.new(PATH_HALF + 8, 0, -64),
	Vector3.new(56, 0, -64),
	Vector3.new(0, 0, -1),
	40,
	18,
	18,
	{ saddles = false }
)

-- Free-standing buttes give each half a horizon of its own. They sit outside
-- the crystal bounds (x ±96) so they never swallow a spawn point.
cliffRun(Vector3.new(-112, 0, 150), Vector3.new(-112, 0, 190), Vector3.new(-1, 0, 0), 44, 28, 24, { saddles = false })
cliffRun(Vector3.new(114, 0, 100), Vector3.new(114, 0, 138), Vector3.new(1, 0, 0), 44, 26, 24, { saddles = false })
cliffRun(Vector3.new(-116, 0, -158), Vector3.new(-116, 0, -198), Vector3.new(-1, 0, 0), 44, 27, 24, { saddles = false })
cliffRun(Vector3.new(112, 0, -104), Vector3.new(112, 0, -140), Vector3.new(1, 0, 0), 44, 25, 24, { saddles = false })

-- =========================================================================
-- 5. PRIMARY LANDMARK
-- =========================================================================
--[[ Named hard fail: "tall rectangular crystal columns on a stacked rectangular
	 pedestal. Still a blockout. It is the PRIMARY landmark and needs the highest
	 quality in the map."

	 That reading was correct. The pedestal was three tiers of two squares each
	 (one at 0°, one at 45°), which is a stack of rectangles however it is
	 described, and the spire was three full-height boxes of constant width,
	 which is a rectangular column however it is tinted. Two changes:

	 1. THE PEDESTAL IS A STEPPED OCTAGONAL DAIS OF RADIAL ASHLAR. Each tier is a
	    ring of eight cut blocks laid tangentially around a circle, over a solid
	    core, and the top tier carries a chamfer course of wedges. The silhouette
	    is an eight-sided stepped drum with a bevelled lip; there is no elevation
	    from which it reads as a stack of squares.
	 2. THE SPIRE TAPERS AND TWISTS. Seven levels, each three facets at 0/60/120,
	    the width falling 12.0 -> 3.6 and every level rotated a further 9°. A
	    taper is what stops a shaft reading as a column, and the twist means no
	    two levels present the same facet edge to the camera, which is what makes
	    flat shading read as a cut gem.

	 Height discipline still matters. The composition gate measures
	 verticalDominance (tallest vertical ÷ second tallest) and fails below 1.25;
	 docs/COMPOSITION.md records a live Studio run where six lamp posts as tall as
	 a monument scored exactly 1.000 and failed. So every other vertical in this
	 world — cliffs ~50, tall pines 34 at the top of the tree tier, secondary
	 landmarks ~52 — is kept well under this monument's ~84. ]]

local crystalHue = meadow.CrystalColor
local frostHue = frost.CrystalColor

--[[ A stepped octagonal dais. Shared by the monument and the Glacier Heart, so
	 the map's two landmarks are visibly the same masonry in two materials rather
	 than two unrelated pedestals — which is the same "unrelated assets in one
	 map" failure expressed in authored geometry instead of bought meshes.

	 Returns the top surface height. ]]
local function stoneDais(
	parent: Instance,
	cx: number,
	cz: number,
	baseY: number,
	tiers: { { number } },
	tones: { Color3 }
): number
	local SIDES = 8
	local top = baseY
	for t, tier in tiers do
		local radius, h = tier[1] :: number, tier[2] :: number
		local tone = tones[(t - 1) % #tones + 1]
		-- Solid core, so the ring is a face and not a shell with a hole in it.
		box(
			parent,
			"DaisCore",
			Vector3.new(radius * 1.35, h, radius * 1.35),
			Vector3.new(cx, top + h / 2, cz),
			Palette.shade(tone, 0.16),
			22.5
		)
		-- Ashlar ring: eight cut blocks laid tangentially. 1.14 on the chord so
		-- neighbours share a mitre instead of showing a joint.
		local chord = 2 * radius * math.sin(math.pi / SIDES) * 1.14
		local dep = radius * 0.36
		for k = 1, SIDES do
			local ang = (k / SIDES) * math.pi * 2
			local rr = radius - dep / 2
			local at = Vector3.new(cx + math.cos(ang) * rr, top + h / 2, cz + math.sin(ang) * rr)
			newPart(
				parent,
				"DaisBlock",
				Vector3.new(chord, h, dep),
				CFrame.new(at) * CFrame.Angles(0, -ang, 0),
				if k % 2 == 0 then tone else Palette.lift(tone, 0.10)
			)
		end
		top += h
	end
	-- Chamfer course on the crown: eight wedges falling outward off the top tier.
	local crown = tiers[#tiers]
	local cr = crown[1] :: number
	local chord = 2 * cr * math.sin(math.pi / SIDES) * 1.14
	for k = 1, SIDES do
		local ang = (k / SIDES) * math.pi * 2
		local rr = cr - cr * 0.14
		local at = Vector3.new(cx + math.cos(ang) * rr, top + 0.9, cz + math.sin(ang) * rr)
		wedge(
			parent,
			"DaisChamfer",
			Vector3.new(chord * 0.92, 1.8, cr * 0.28),
			CFrame.new(at) * CFrame.Angles(0, -ang, 0),
			Palette.lift(tones[1], 0.16)
		)
	end
	return top + 1.8
end

disc(fLandmark, "MonumentRing", 34, 0.8, LANDMARK.X, LANDMARK.Z, 0.75, Palette.Outline.Color)
disc(fLandmark, "MonumentGlow", 31, 0.8, LANDMARK.X, LANDMARK.Z, 0.95, P.Sell)

local plinthTop = stoneDais(
	fLandmark,
	LANDMARK.X,
	LANDMARK.Z,
	1.0,
	{ { 27, 5.4 }, { 21, 4.8 }, { 15.5, 4.2 } },
	{ W.CliffC, W.CliffB, W.CliffA }
)

--[[ The tapering, twisting spire. Three facets per level so flat shading gives
	 each face a constant tone; the tone index walks with the level so the shaft
	 also bands vertically, which is what a cut crystal does and a painted box
	 does not. ]]
local spireTones = { crystalHue, Palette.lift(crystalHue, 0.20), Palette.shade(crystalHue, 0.22) }
local SPIRE_LEVELS = 7
local SPIRE_H = 54
local levelH = SPIRE_H / SPIRE_LEVELS
for level = 1, SPIRE_LEVELS do
	local t = (level - 1) / (SPIRE_LEVELS - 1)
	local w = 12.0 + (3.6 - 12.0) * t
	local yc = plinthTop + (level - 1) * levelH + levelH / 2
	for i = 1, 3 do
		box(
			fLandmark,
			"SpireFacet",
			Vector3.new(w, levelH * 1.04, w),
			Vector3.new(LANDMARK.X, yc, LANDMARK.Z),
			spireTones[(level + i) % 3 + 1],
			(i - 1) * 60 + (level - 1) * 9
		)
	end
end
-- The point. Narrow, and taller than a level, so the shaft resolves rather than
-- stopping.
local TIP_H = 14
local tipBase = plinthTop + SPIRE_H - 2
for i = 1, 3 do
	box(
		fLandmark,
		"SpireTip",
		Vector3.new(2.9, TIP_H, 2.9),
		Vector3.new(LANDMARK.X, tipBase + TIP_H / 2, LANDMARK.Z),
		spireTones[i],
		(i - 1) * 60 + 30
	)
end

--[[ A ring of tapered shards leaning outward off the dais. Two boxes each — a
	 wide base and a narrower head at a further lean — so a shard is a spike
	 rather than a leaning brick. Alternating the two zone crystal colours makes
	 the monument a legend for the map: cyan is the meadow, violet is the frost.
	 This is authored geometry, not a placed prop, which is why it is allowed to
	 carry the other biome's hue when nothing else in the meadow may. ]]
for i = 1, 6 do
	local ang = (i / 6) * math.pi * 2
	local r = 15
	local h = 20 + (i % 3) * 7
	local x = LANDMARK.X + math.cos(ang) * r
	local z = LANDMARK.Z + math.sin(ang) * r
	local hue = if i % 2 == 0 then frostHue else crystalHue
	local lean = CFrame.Angles(math.sin(ang) * 0.20, ang, -math.cos(ang) * 0.20)
	local leanMore = CFrame.Angles(math.sin(ang) * 0.34, ang, -math.cos(ang) * 0.34)
	newPart(
		fLandmark,
		"Shard",
		Vector3.new(5.4, h * 0.62, 5.4),
		CFrame.new(x, plinthTop - 3 + h * 0.31, z) * lean,
		hue,
		true
	)
	newPart(
		fLandmark,
		"ShardHead",
		Vector3.new(3.1, h * 0.55, 3.1),
		CFrame.new(x, plinthTop - 3 + h * 0.72, z) * leanMore * CFrame.Angles(0, math.rad(30), 0),
		Palette.shade(hue, 0.18),
		true
	)
end

-- Six motes orbiting the spire, well above eye line. Small on purpose: the
-- review's floating-geometry complaint is about things that block a player-eye
-- view, and these sit at y ~50 around the one object the composition is built
-- to draw the eye to.
for i = 1, 6 do
	local ang = (i / 6) * math.pi * 2
	local r = 19
	box(
		fLandmark,
		"Mote",
		Vector3.new(2.8, 2.8, 2.8),
		Vector3.new(
			LANDMARK.X + math.cos(ang) * r,
			plinthTop + 32 + math.sin(ang * 2) * 5,
			LANDMARK.Z + math.sin(ang) * r
		),
		P.Sell,
		45,
		false
	)
end

-- The palette apron: raw crystal and rock breaking out of the dais foot, so the
-- monument looks like it emerged from the ground rather than being dropped on
-- it. Small and low, never taller than the bottom tier.
for i = 1, 10 do
	local ang = rand(0, math.pi * 2)
	local r = rand(24, 33)
	local x = LANDMARK.X + math.cos(ang) * r
	local z = LANDMARK.Z + math.sin(ang) * r
	if i % 3 == 0 then
		prop(fLandmark, "rock", x, z, { tier = "small", tierTo = "player", tilt = 18, anywhere = true })
	else
		prop(fLandmark, "crystal", x, z, {
			tier = "small",
			tierTo = "player",
			tilt = 14,
			collide = false,
			anywhere = true,
		})
	end
end

-- =========================================================================
-- 6. SPAWN
-- =========================================================================

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
buckets.authored += 1
track(spawn.Position, spawn.Size)

-- =========================================================================
-- 7. PADS
-- =========================================================================
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

buildPad("SellPad", SELL_PAD.X, SELL_PAD.Y, P.Sell, "SELL")
-- Beside the north path at the meadow mouth, not on it: the path owns x ±12 and
-- this pad's outer halo (radius 22.5) stops at x = -15.5. It is a kiosk you walk
-- past, not a thing you have to walk around (§8).
buildPad("UpgradePad", UPGRADE_PAD.X, UPGRADE_PAD.Y, P.Upgrade, "UPGRADES")

-- =========================================================================
-- 8. GATE
-- =========================================================================
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

-- =========================================================================
-- 9. GUIDANCE LANGUAGE
-- =========================================================================
--[[ HARD FAIL, and the loudest one: "long green slabs cross the world at player
	 eye height and look BROKEN. These are the guidance arrows. At eye level they
	 read as giant floating green rectangular beams, not arrows."

	 That is exactly what they were. Each arrow was a 26-stud shaft plus two
	 18-stud heads, 7 studs wide and 2.5 thick, hanging unsupported at y = 17.
	 An arrow drawn flat and viewed from a camera at y = 6 presents its 7 x 26
	 EDGE, so the chevron shape a top-down mock-up shows is never the shape a
	 player sees: from the ground it is a beam. Six of them crossed the map.

	 They are deleted. The replacement is three devices, and the reason for
	 choosing this set over the alternatives is that NONE OF THEM CAN EVER BECOME
	 FLOATING GEOMETRY — the failure mode is designed out rather than tuned down:

	 1. CHEVRONS PAINTED ON THE ROAD. Two flat bars per chevron, 0.3 studs thick,
	    sitting 0.2 studs proud of the road surface. A player walking a corridor
	    is looking down it, so a mark on the ground is in the centre of frame at
	    the distance that matters; and because it is part of the road it cannot
	    obstruct anything or read as broken. This is the primary device.
	 2. A LIT EDGE TRIM along both verges in the biome accent, flush with the
	    road. It gives the route a continuous read at eye level between chevrons,
	    which is what a painted mark alone cannot do on a long straight.
	 3. LOW MARKER POSTS at the verge, ~6 studs to the top of the board. Tall
	    enough to be a vertical the eye catches at distance, short enough that it
	    can never dominate a player-eye view, and it stands ON THE GROUND, which
	    is the property the floating arrows lacked. The board carries the §2 thick
	    near-black outline and a chevron in the accent hue.

	 Considered and not used: floating stylised chevrons. Small floating geometry
	 is still floating geometry, and the failure being answered is specifically
	 that this world put unsupported slabs in the player's eyeline. ]]

local ROAD_TOP = 0.35

--[[ One chevron, painted on the road, pointing along dirZ. The two arms meet at
	 a vertex; each arm is yawed ±32°, and the ±3.7 stud lateral offset is what
	 puts their inner ends at x = 0 so the vertex closes. ]]
local function chevron(z: number, dirZ: number, tone: Color3)
	local arm = 14
	local yaw = 32
	local dx = (arm / 2) * math.sin(math.rad(yaw))
	local dz = (arm / 2) * math.cos(math.rad(yaw)) * dirZ
	for _, side in { -1, 1 } do
		newPart(
			fSigns,
			"PathChevron",
			Vector3.new(3.4, 0.3, arm),
			CFrame.new(side * dx, ROAD_TOP + 0.05, z - dz) * CFrame.Angles(0, math.rad(-side * yaw * dirZ), 0),
			tone,
			false
		)
	end
end

--[[ A low marker post. Post + outline plate + board + chevron bar = four parts,
	 topping out at 6.2 studs. Everything about it is grounded and short. ]]
local function markerPost(x: number, z: number, dirZ: number)
	local biome = biomeAt(x, z)
	local tone = biome.Tint.accent
	local wood = biome.Tint.wood
	local y = groundTop(x, z)
	-- Face the board across the road so it is legible from the corridor.
	local yaw = if x < 0 then 90 else -90
	local cf = CFrame.new(x, y, z) * CFrame.Angles(0, math.rad(yaw), 0)

	box(fSigns, "MarkerPost", Vector3.new(1.3, 4.6, 1.3), (cf * CFrame.new(0, 2.3, 0)).Position, wood, yaw, false)
	newPart(
		fSigns,
		"MarkerBoardOutline",
		Vector3.new(6.4, 3.2, 0.4),
		cf * CFrame.new(0, 4.7, 0),
		Palette.Outline.Color,
		false
	)
	newPart(fSigns, "MarkerBoard", Vector3.new(5.6, 2.4, 0.7), cf * CFrame.new(0, 4.7, 0), tone, false)
	-- The chevron on the board, pointing the way the road goes.
	newPart(
		fSigns,
		"MarkerChevron",
		Vector3.new(2.6, 0.7, 0.9),
		cf * CFrame.new(0.7 * dirZ, 4.7, 0) * CFrame.Angles(0, 0, math.rad(34 * dirZ)),
		Palette.lift(tone, 0.45),
		false
	)
end

--[[ The lit verge trim. A slim strip in the biome accent, flush with the road
	 edge — the continuous half of the guidance language, where the chevrons are
	 the rhythmic half. ]]
local function edgeTrim(fromZ: number, toZ: number)
	local segments = math.max(1, math.floor(math.abs(toZ - fromZ) / 46))
	local segLen = (toZ - fromZ) / segments
	for i = 1, segments do
		local z = fromZ + segLen * (i - 0.5)
		local tone = biomeAt(0, z).Tint.guide
		for _, side in { -1, 1 } do
			box(
				fSigns,
				"PathTrim",
				Vector3.new(0.9, 0.35, math.abs(segLen) - 4),
				Vector3.new(side * (PATH_HALF - 0.6), ROAD_TOP + 0.02, z),
				tone,
				0,
				false
			)
		end
	end
end

edgeTrim(NORTH_PATH_START, NORTH_PATH_END)
edgeTrim(GATE_Z, SOUTH_PATH_END)

-- Chevrons at a walking rhythm, dense enough that one is always in frame on the
-- approach to a beat and never so dense that the road becomes a decal.
for _, z in { 64, 92, 120, 148, 176, 204 } do
	chevron(z, 1, biomeAt(0, z).Tint.guide)
end
for _, z in { -86, -116, -146, -176, -206 } do
	chevron(z, -1, biomeAt(0, z).Tint.guide)
end

-- Marker posts at the beats: the mouth of each corridor, and the approach to
-- each secondary landmark. Alternating sides so they never form an avenue.
for _, m in { { -PATH_HALF - 5, 58, 1 }, { PATH_HALF + 5, 112, 1 }, { -PATH_HALF - 5, 170, 1 } } do
	markerPost(m[1] :: number, m[2] :: number, m[3] :: number)
end
for _, m in { { PATH_HALF + 5, -92, -1 }, { -PATH_HALF - 5, -150, -1 }, { PATH_HALF + 5, -206, -1 } } do
	markerPost(m[1] :: number, m[2] :: number, m[3] :: number)
end

-- =========================================================================
-- 10. FOLIAGE VOCABULARY — copses, not repeated trees
-- =========================================================================
--[[ A copse reads as a group of DIFFERENT plants:

	  * Two tree families mixed inside every MEADOW copse, with the mix ratio
	    varying per copse rather than being 50/50 everywhere.
	  * Three size tiers within one copse — `tree` at the back, `sapling` in the
	    middle, `large` near the path. That is the layering the review asked for,
	    and it stops a copse from being a row of equal verticals.
	  * Bushes and rocks at the copse edge, tufts at its foot, so the tree line
	    meets the ground instead of ending at a trunk.

	 WHAT IS NO LONGER A COPSE PARAMETER: the cold flag and the tints. A copse in
	 the frost hollow is cold because of WHERE IT IS. `pineBias` survives as a
	 composition control for the meadow, but in the frost biome it is moot — the
	 biome substitutes tree_round for tree_pine before a clone is drawn, so the
	 previous build's "0.9 bias" (which cheerfully placed one temperate broadleaf
	 in ten into the snow) cannot happen whatever number is written here.

	 THE BUSH FAMILY HAS ONE MEMBER, and culling did not change that. It is
	 handled by never letting bushes stand alone: they always appear mixed with
	 small rock and tuft clutter, across the player-to-large tiers with free yaw,
	 so the silhouette that repeats is a group's, not an asset's. ]]

local tuftGroup = folder("Tufts", fFlora)

local function tuft(x: number, z: number, s: number)
	local biome = biomeAt(x, z)
	local bright = Palette.lift(biome.Tint.foliage, if biome.Snow then 0.30 else 0.42)
	local deep = Palette.shade(biome.Tint.foliage, 0.18)
	local y = groundTop(x, z)
	local blades = rng:NextInteger(3, 4)
	local base = rand(0, math.pi * 2)
	local prev = currentBucket
	currentBucket = "detail"
	for k = 1, blades do
		local ang = base + (k / blades) * math.pi * 2
		local h = rand(3.2, 5.4) * s
		local cf = CFrame.new(x + math.cos(ang) * 0.9 * s, y + h / 2, z + math.sin(ang) * 0.9 * s)
			* CFrame.Angles(math.sin(ang) * 0.42, ang, -math.cos(ang) * 0.42)
		newPart(tuftGroup, "Tuft", Vector3.new(0.9 * s, h, 0.9 * s), cf, if k % 2 == 0 then bright else deep, false)
	end
	currentBucket = prev
end

--[[ A snow cap. Biome-gated rather than call-site-gated: snow on a prop in the
	 canyon is the same class of mistake as a green tree in the hollow, and the
	 guard belongs in one place. Contrast is against the PROP, not the ground:
	 SNOW (242,250,255) on frost stone (146,170,188) is sum|Δ| 262. ]]
local function snowCap(parent: Instance, x: number, z: number, y: number, h: number, r: number)
	if not biomeAt(x, z).Snow then
		return
	end
	local prev = currentBucket
	currentBucket = "detail"
	blob(parent, "SnowCap", Vector3.new(r * 2, r * 0.85, r * 1.8), Vector3.new(x, y + h * 0.86, z), SNOW)
	currentBucket = prev
end

--[[ Minimum spacing inside a cluster.

	 A copse placed by "random angle, random radius" will eventually put two
	 30-stud trees on the same spot — measured on an earlier build: seven pairs of
	 big props overlapping by more than 70% of their combined radii, the worst two
	 trunks 1.1 studs apart with radii of 10 and 7. That is not a dense cluster,
	 it is a modelling error, and it is very visible.

	 Candidates are PUSHED APART rather than discarded, because a discard leaves
	 the hole where the eye was promised a tree. Consumes no RNG, so the rest of
	 the world does not move when a copse's spacing is retuned. ]]
local function spaced(placed: { { number } }, x: number, z: number, minD: number): (number, number)
	for _, q in placed do
		local dx, dz = x - q[1], z - q[2]
		local d = math.sqrt(dx * dx + dz * dz)
		if d < minD then
			if d < 0.001 then
				dx, dz, d = 1, 0, 1
			end
			x = q[1] + (dx / d) * minD
			z = q[2] + (dz / d) * minD
		end
	end
	table.insert(placed, { x, z })
	return x, z
end

type CopseCfg = {
	radius: number,
	tall: number,
	mid: number,
	small: number,
	bush: number,
	rock: number,
	tuft: number,
	pineBias: number, -- 0 = all round trees, 1 = all pines (moot in the frost biome)
	faceX: number?, -- which way the path is; small stuff goes on that side
}

local function copse(name: string, cx: number, cz: number, cfg: CopseCfg)
	local group = folder(name, fFlora)
	local snowy = biomeAt(cx, cz).Snow
	local faceX = cfg.faceX or (if cx > 0 then -1 else 1)
	local r = cfg.radius
	-- One list across all three tiers: a sapling must clear the tall tree behind
	-- it as well as the other saplings.
	local placed: { { number } } = {}

	-- BACKGROUND: canopy trees, pushed away from the path side.
	for _ = 1, cfg.tall do
		local a = rand(0, math.pi * 2)
		local d = rand(0.30, 1.0) * r
		local x, z = spaced(placed, cx - faceX * r * 0.42 + math.cos(a) * d, cz + math.sin(a) * d, 17)
		local family = if chance(cfg.pineBias) then "tree_pine" else "tree_round"
		prop(group, family, x, z, { tier = "tree", tilt = 3 })
	end

	-- MIDGROUND: half-grown trees, spread across the whole anchor.
	for _ = 1, cfg.mid do
		local a = rand(0, math.pi * 2)
		local d = rand(0.25, 1.05) * r
		local x, z = spaced(placed, cx + math.cos(a) * d, cz + math.sin(a) * d, 13)
		local family = if chance(cfg.pineBias) then "tree_pine" else "tree_round"
		prop(group, family, x, z, { tier = "sapling", tilt = 4 })
	end

	-- FOREGROUND: undergrowth on the path side, deliberately at the large-prop
	-- tier so it reads as scrub in front of the mass rather than as more trees.
	for _ = 1, cfg.small do
		local a = rand(-0.9, 0.9)
		local d = rand(0.75, 1.35) * r
		local x, z = spaced(placed, cx + faceX * d, cz + math.sin(a) * r * 0.9, 9)
		local family = if chance(0.5) then "tree_pine" else "tree_round"
		prop(group, family, x, z, { tier = "large", tilt = 6 })
	end

	-- Bushes at the edge, weighted to the path side so the copse has a hem.
	for _ = 1, cfg.bush do
		local a = rand(0, math.pi * 2)
		local d = rand(0.6, 1.35) * r
		local x, z = spaced(placed, cx + faceX * r * 0.28 + math.cos(a) * d, cz + math.sin(a) * d, 6)
		prop(group, "bush", x, z, { tier = "player", tierTo = "large", tilt = 9, collide = false })
	end

	-- Rock at the foot, so the tree line meets the ground.
	for _ = 1, cfg.rock do
		local a = rand(0, math.pi * 2)
		local d = rand(0.5, 1.3) * r
		local x = cx + math.cos(a) * d
		local z = cz + math.sin(a) * d
		local h = prop(group, "rock", x, z, { tier = "small", tierTo = "player", tilt = 20 })
		if snowy and h > 0 and chance(0.6) then
			snowCap(group, x, z, groundTop(x, z), h, h * 0.42)
		end
	end

	for _ = 1, cfg.tuft do
		local a = rand(0, math.pi * 2)
		local d = rand(0.55, 1.35) * r
		tuft(cx + math.cos(a) * d, cz + math.sin(a) * d, rand(1.0, 1.7))
	end
end

--[[ A run of fence panels along a line. Panels are placed with an EXPLICIT yaw
	 so the run is a line, not a scatter — the one place in this file where a
	 prop's rotation is authored rather than random, which is why it clones
	 directly instead of going through prop(). Everything else still resolves the
	 way prop() would: the family through the biome, the tint from the ground,
	 the height from the `player` tier. ]]
local function fenceRun(parent: Instance, x0: number, z0: number, dx: number, dz: number, count: number)
	local len = math.sqrt(dx * dx + dz * dz)
	if len < 0.001 then
		return
	end
	local ux, uz = dx / len, dz / len
	local yaw = math.deg(math.atan2(ux, uz)) + 90
	for i = 1, count do
		local t = (i - 0.5) / count
		local x = x0 + dx * t
		local z = z0 + dz * t
		local resolved, clone = pick("fence_panel", x, z, rng)
		local sizeT = rng:NextNumber()
		local jitter = rand(-4, 4)
		local targetH = tierHeight("player", nil, sizeT)
		if onRoad(x, z) then
			-- Same absolute rule as prop(): a fence panel across the road is a
			-- wall, not scenery. Draws already taken, so the run's other panels
			-- are unaffected.
			if clone then
				clone:Destroy()
			end
		elseif clone then
			local scale = targetH / math.max(0.1, extentsOf(clone).Y)
			place(parent, clone, resolved, x, z, groundTop(x, z), scale, yaw + jitter, 0, 0, false)
		else
			fallbackProp(
				parent,
				resolved,
				x,
				z,
				groundTop(x, z),
				targetH / NOMINAL[resolved],
				yaw + jitter,
				0,
				0,
				false
			)
		end
	end
end

-- =========================================================================
-- 11. MEADOW COMPOSITION — the beats along the north corridor
-- =========================================================================
--[[ §7 asks for MODERATE density with clear ground between clusters, and §9.7
	 fails an evenly-scattered field. So the corridor is written as beats with
	 their z-ranges stated, and the gaps are as deliberate as the clusters:

	   z  44- 74  GATEWAY      dense — fences, signs, bushes framing the exit
	   z  74-106  OPEN         clear ground; only distant background trees
	   z 106-146  THE COPSE    dense — two large copses facing each other
	   z 146-172  OPEN         clear; one lone pine as a horizon accent
	   z 172-212  THE OUTCROP  dense — secondary landmark + prospector's camp
	   z 212-218  TERMINUS     tree line against the north wall

	 Walking north the player therefore gets tight, open, tight, open, reward. ]]

-- Beat 1: the gateway out of the hub -------------------------------------
--[[ Fences that GUIDE rather than enclose: short runs on alternating sides,
	 splayed slightly outward, so they funnel the eye up the road. A continuous
	 fence on both sides would read as a corridor wall, which is the opposite of
	 an invitation. ]]
local gatewayGroup = folder("Gateway", fStory)

fenceRun(gatewayGroup, -PATH_HALF - 6, 46, -14, 26, 3)
fenceRun(gatewayGroup, PATH_HALF + 6, 50, 16, 24, 3)
fenceRun(gatewayGroup, -PATH_HALF - 9, 84, -10, 18, 2)

-- A signpost pair at the mouth of the road. Signage beside a road is the
-- cheapest environmental storytelling there is: it says a person came this way.
prop(gatewayGroup, "sign", -PATH_HALF - 7, 47, { tier = "player", anywhere = true })
prop(gatewayGroup, "sign", PATH_HALF + 8, 62, { tier = "player", anywhere = true })

for _ = 1, 5 do
	local side = if chance(0.5) then 1 else -1
	prop(gatewayGroup, "bush", side * rand(PATH_HALF + 8, PATH_HALF + 22), rand(46, 74), {
		tier = "player",
		tierTo = "large",
		tilt = 8,
		collide = false,
	})
end
for _ = 1, 4 do
	local side = if chance(0.5) then 1 else -1
	tuft(side * rand(PATH_HALF + 3, PATH_HALF + 12), rand(46, 76), rand(1.1, 1.7))
end

-- Beat 2 is OPEN. Only the background tree line, far out against the walls,
-- so the eye has somewhere to rest and the next cluster lands.

-- Beat 3: the copse pair -------------------------------------------------
copse("MeadowCopseWest", -74, 118, {
	radius = 26,
	tall = 3,
	mid = 3,
	small = 2,
	bush = 5,
	rock = 3,
	tuft = 3,
	pineBias = 0.65,
})
copse("MeadowCopseEast", 68, 132, {
	radius = 23,
	tall = 2,
	mid = 3,
	small = 2,
	bush = 4,
	rock = 4,
	tuft = 3,
	pineBias = 0.30,
})

-- A boulder field opposite the west copse: rock as the cluster, trees absent.
-- Varying WHAT a cluster is made of is how a world avoids one grammar.
local boulderGroup = folder("MeadowBoulders", fRocks)
for i = 1, 7 do
	local a = rand(0, math.pi * 2)
	local d = rand(0, 20)
	prop(boulderGroup, "rock", 34 + math.cos(a) * d, 108 + math.sin(a) * d, {
		tier = if i <= 2 then "large" else "small",
		tierTo = if i <= 2 then "large" else "player",
		tilt = 22,
	})
end
for _ = 1, 3 do
	prop(boulderGroup, "bush", 34 + rand(-22, 22), 108 + rand(-20, 20), {
		tier = "player",
		tierTo = "large",
		tilt = 10,
		collide = false,
	})
end

-- Beat 4 is OPEN, with one accent. A single canopy pine on an otherwise empty
-- flank is a horizon marker; a group there would close the gap the beat needs.
prop(fFlora, "tree_pine", 96, 156, { tier = "tree", tilt = 2 })

-- Beat 5: SECONDARY LANDMARK — the Crystal Outcrop ------------------------
--[[ Built to be read from the road at 60 studs: a raked rock shelf with a fan of
	 large palette crystals breaking out of it, ringed by boulders.

	 Deliberately ~36 studs tall against the monument's 84. A secondary landmark
	 that competes is not a secondary landmark, and the composition gate measures
	 exactly that ratio. ]]
local outcrop = folder("CrystalOutcrop", fSecondary)
local OUT_X, OUT_Z = OUTCROP.X, OUTCROP.Y

-- The raked shelf: three offset slabs, each rotated, so it reads as broken
-- strata rather than a stack of blocks. Tones come from the biome's cliff set,
-- so the outcrop is the same rock as the wall behind it.
do
	local tones = biomeAt(OUT_X, OUT_Z).Cliff
	for k = 1, 3 do
		local w = 30 - (k - 1) * 7
		local h = 3.4 - (k - 1) * 0.5
		box(
			outcrop,
			"OutcropShelf",
			Vector3.new(w, h, w * 0.78),
			Vector3.new(OUT_X + (k - 1) * 2.2, (k - 1) * 2.6 + h / 2, OUT_Z - (k - 1) * 1.6),
			tones[k],
			(k - 1) * 19 + 8
		)
	end
end

-- The crystal fan. Sizes deliberately unequal and leaning outward from one
-- point, which is what makes a cluster read as a formation rather than a row.
for i = 1, 7 do
	local ang = math.pi * (0.15 + 0.7 * ((i - 1) / 6))
	local d = rand(3, 11)
	prop(outcrop, "crystal", OUT_X + math.cos(ang) * d, OUT_Z + math.sin(ang) * d, {
		tier = if i % 3 == 0 then "sapling" else "large",
		tilt = 16,
		groundY = rand(4, 8),
		anywhere = true,
	})
end
for i = 1, 6 do
	local ang = rand(0, math.pi * 2)
	local d = rand(17, 27)
	prop(outcrop, "rock", OUT_X + math.cos(ang) * d, OUT_Z + math.sin(ang) * d, {
		tier = "small",
		tierTo = "large",
		tilt = 20,
		anywhere = true,
	})
end
for _ = 1, 3 do
	tuft(OUT_X + rand(-26, 26), OUT_Z + rand(-24, 24), rand(1.1, 1.6))
end

--[[ THE PROSPECTOR'S CAMP. "No environmental storytelling" is answered here
	 rather than by scattering crates: someone works this outcrop, so there is a
	 corral, a crate stack going stale, a sign, and a cold fire ring — arranged in
	 a working triangle around a clear patch of ground, which is what makes it
	 read as a place someone stood rather than props dropped.

	 The corral is now two short fence runs meeting at a corner rather than the
	 palette's 45x65 stud fenced ENCLOSURE, which the cull removed: one enclosure
	 mesh and a line of panel meshes were two different fences in one camp, which
	 is precisely the "unrelated free assets" read. Two runs of the same panel is
	 one fence. ]]
local camp = folder("ProspectorsCamp", fStory)
local CAMP_X, CAMP_Z = -40, 168

fenceRun(camp, CAMP_X - 24, CAMP_Z - 14, 22, 0, 2)
fenceRun(camp, CAMP_X - 24, CAMP_Z - 14, 0, 18, 2)

-- Crate stack: the second crate stands on whatever the first turned out to be,
-- read back from the placement rather than assumed.
do
	local h1 = prop(camp, "crate", CAMP_X + 6, CAMP_Z + 4, { tier = "small", tierTo = "player", anywhere = true })
	prop(camp, "crate", CAMP_X + 6.8, CAMP_Z + 4.6, {
		tier = "small",
		groundY = groundTop(CAMP_X + 6, CAMP_Z + 4) + h1,
		anywhere = true,
	})
	prop(camp, "crate", CAMP_X + 12, CAMP_Z - 2, { tier = "small", tierTo = "player", anywhere = true })
end

prop(camp, "sign", CAMP_X + 2, CAMP_Z + 12, { tier = "player", anywhere = true })

-- A cold fire ring. Eight small stones and a charred centre — the cheapest
-- possible "someone camped here", and it reads at a glance. Charged to the
-- `detail` bucket: it is prop-scale primitive with no palette equivalent, not
-- terrain, and the split is only honest if each part is in the right bucket.
currentBucket = "detail"
do
	local stone = biomeAt(CAMP_X, CAMP_Z).Tint.stone
	for i = 1, 8 do
		local ang = (i / 8) * math.pi * 2
		box(
			camp,
			"FireStone",
			Vector3.new(rand(1.6, 2.6), rand(1.2, 1.8), rand(1.6, 2.4)),
			Vector3.new(CAMP_X - 2 + math.cos(ang) * 4.2, 0.7, CAMP_Z - 8 + math.sin(ang) * 4.2),
			if i % 2 == 0 then stone else Palette.shade(stone, 0.2),
			rand(0, 90),
			false
		)
	end
end
disc(camp, "FirePit", 3.4, 0.6, CAMP_X - 2, CAMP_Z - 8, 0.5, Color3.fromRGB(58, 48, 44), false)
currentBucket = "authored"

-- Beat 6: terminus tree line against the north wall.
copse("MeadowTerminusWest", -48, 214, {
	radius = 22,
	tall = 3,
	mid = 2,
	small = 1,
	bush = 3,
	rock = 2,
	tuft = 2,
	pineBias = 0.8,
	faceX = 1,
})
copse("MeadowTerminusEast", 46, 216, {
	radius = 20,
	tall = 2,
	mid = 2,
	small = 1,
	bush = 3,
	rock = 2,
	tuft = 2,
	pineBias = 0.7,
	faceX = -1,
})

--[[ BACKGROUND TREE LINE. Tall, sparse, hugging the ring wall on both flanks of
	 the meadow — the furthest layer of the foreground/midground/background stack.
	 It is a LINE rather than a cluster on purpose: at that distance it is a
	 silhouette against rust cliff, and its job is to stop the wall meeting the
	 grass in a bare seam. ]]
local backLine = folder("MeadowBackline", fFlora)
for _, side in { -1, 1 } do
	local z = 66
	while z < 232 do
		local x = side * rand(116, 134)
		prop(backLine, if chance(0.75) then "tree_pine" else "tree_round", x, z, { tier = "tree", tilt = 3 })
		z += rand(22, 46)
	end
end

-- =========================================================================
-- 12. HUB DRESSING
-- =========================================================================
--[[ The hub is a clearing (§7), so it stays open in the middle. What it gets is
	 a treated EDGE — clutter along the sand rim, and the two pads turned into
	 places of business rather than floating discs. ]]

local hubGroup = folder("HubEdge", fStory)

-- Rim clutter in arcs with gaps, not a ring: a continuous border would read as
-- a planted hedge and close the clearing in.
for _, arc in { { 0.10, 0.42 }, { 0.58, 0.80 }, { 1.10, 1.34 }, { 1.62, 1.86 } } do
	local a0, a1 = arc[1] * math.pi, arc[2] * math.pi
	local n = rng:NextInteger(3, 5)
	for i = 1, n do
		local ang = a0 + (a1 - a0) * ((i - 0.5) / n) + rand(-0.05, 0.05)
		local r = HUB_RADIUS + rand(2, 12)
		local x, z = math.cos(ang) * r, math.sin(ang) * r
		if i % 3 == 0 then
			prop(hubGroup, "rock", x, z, { tier = "small", tierTo = "player", tilt = 20 })
		else
			prop(hubGroup, "bush", x, z, { tier = "player", tierTo = "large", tilt = 9, collide = false })
		end
	end
end

--[[ THE TRADING POST at the sell pad. Crates you sell into, a sign, a fence at
	 the back, and a couple of bushes softening it. Placed on the far side of the
	 pad from the path so nothing stands between the player and the disc. ]]
local post = folder("TradingPost", fStory)
do
	local px, pz = SELL_PAD.X, SELL_PAD.Y
	local h1 = prop(post, "crate", px + 17, pz + 5, { tier = "small", tierTo = "player", anywhere = true })
	prop(post, "crate", px + 17.6, pz + 5.5, {
		tier = "small",
		groundY = groundTop(px + 17, pz + 5) + h1,
		anywhere = true,
	})
	prop(post, "crate", px + 22, pz - 3, { tier = "small", tierTo = "player", anywhere = true })
	prop(post, "crate", px + 12, pz - 12, { tier = "small", anywhere = true })
	prop(post, "sign", px + 14, pz + 14, { tier = "player", anywhere = true })
	fenceRun(post, px + 26, pz + 12, 2, -26, 3)
	prop(post, "bush", px - 14, pz + 15, { tier = "player", collide = false, anywhere = true })
	prop(post, "bush", px + 24, pz + 16, { tier = "player", collide = false, anywhere = true })
	prop(post, "rock", px + 27, pz - 14, { tier = "small", tierTo = "player", tilt = 18, anywhere = true })
end

-- The upgrade kiosk. Same grammar, smaller, so the two pads read as the same
-- civilisation without being a copy-paste.
local kiosk = folder("UpgradeKiosk", fStory)
do
	local px, pz = UPGRADE_PAD.X, UPGRADE_PAD.Y
	prop(kiosk, "sign", px - 13, pz + 4, { tier = "player", anywhere = true })
	local h1 = prop(kiosk, "crate", px - 18, pz - 6, { tier = "small", tierTo = "player", anywhere = true })
	prop(kiosk, "crate", px - 18.5, pz - 5.4, {
		tier = "small",
		groundY = groundTop(px - 18, pz - 6) + h1,
		anywhere = true,
	})
	fenceRun(kiosk, px - 24, pz + 14, 4, -22, 2)
	prop(kiosk, "bush", px - 10, pz + 18, { tier = "player", collide = false, anywhere = true })
	prop(kiosk, "rock", px - 24, pz + 2, { tier = "small", tierTo = "player", tilt = 18, anywhere = true })
end

-- Flanking the spawn: two signs and a low crate, so the first thing a player
-- sees at eye level is dressed rather than bare sand.
do
	prop(fStory, "sign", SPAWN.X - 17, SPAWN.Z + 6, { tier = "player", anywhere = true })
	prop(fStory, "sign", SPAWN.X + 17, SPAWN.Z + 4, { tier = "player", anywhere = true })
	prop(fStory, "crate", SPAWN.X - 21, SPAWN.Z - 8, { tier = "small", tierTo = "player", anywhere = true })
end

-- =========================================================================
-- 13. FROST HOLLOW
-- =========================================================================
--[[ The zone the first review called visibly empty and the second review called
	 contaminated. Both are addressed, and the second one structurally: every
	 placement below resolves through `biomeAt`, and everything south of
	 z = GATE_Z + 2 is the frost biome, so there is no argument any of these call
	 sites could pass that would put a warm-green tree or a warm-tinted rock in
	 the snow. Note what is absent from this whole section compared with the last
	 revision: not one `tint =`, and not one `cold = true`.

	 What makes it a different place, concretely:
	   * Composition: the cold half is EMPTIER at the edges and denser at three
	     points, so it feels like a hollow rather than a field. The meadow is the
	     reverse.
	   * Colour: violet crystals, cool blue-grey stone (the cliffs too, not just
	     the props), deep desaturated pine foliage, and NO round trees at all —
	     the biome substitutes them, so a sub-alpine tree line is guaranteed
	     rather than probable.
	   * Snow: white caps on rock and crate tops, drifts on the floor, ice
	     shelves. This is the identity cue that survives a textured mesh, which
	     is why it exists — though frost now admits no textured members anyway.
	   * Storytelling: the outpost is ABANDONED — a tipped crate, a leaning sign,
	     a broken fence — where the meadow's camp is in use.

	   z  -66..-100  THRESHOLD    dense — the abandoned outpost past the gate
	   z -100..-136  OPEN         snowfield; drifts and two lone ice spikes
	   z -136..-176  FROZEN GROVE dense — cold copses either side
	   z -176..-206  ICE SHELF    low, wide, sparse: a change of texture, not mass
	   z -206..-244  GLACIER HEART the reward at the end of the road ]]

-- Beat 1: the abandoned outpost -----------------------------------------
local outpost = folder("AbandonedOutpost", fStory)
do
	local OX, OZ = -34, -84
	-- A broken fence line: two panels standing, a gap, one more. The gap is the
	-- story.
	fenceRun(outpost, OX - 10, OZ + 8, 18, -6, 2)
	fenceRun(outpost, OX + 16, OZ - 4, -14, -6, 1)

	prop(outpost, "sign", OX + 4, OZ + 14, {
		tier = "player",
		tilt = 13, -- leaning: nobody has straightened it
		anywhere = true,
	})

	local h1 = prop(outpost, "crate", OX + 2, OZ - 6, { tier = "small", tierTo = "player", anywhere = true })
	snowCap(outpost, OX + 2, OZ - 6, groundTop(OX + 2, OZ - 6), h1, h1 * 0.5)
	-- A tipped crate. 74° is not "randomly rotated": it is on its side.
	prop(outpost, "crate", OX + 9, OZ - 9, { tier = "small", tilt = 74, anywhere = true })
	prop(outpost, "crate", OX - 5, OZ - 12, { tier = "small", anywhere = true })

	for i = 1, 5 do
		local x = OX + rand(-24, 26)
		local z = OZ + rand(-18, 18)
		local h = prop(outpost, "rock", x, z, { tier = "small", tierTo = "player", tilt = 20 })
		if h > 0 and i % 2 == 1 then
			snowCap(outpost, x, z, groundTop(x, z), h, h * 0.45)
		end
	end
	for _ = 1, 3 do
		prop(outpost, "crystal", OX + rand(-28, 28), OZ + rand(-20, 20), {
			tier = "player",
			tierTo = "large",
			tilt = 12,
			collide = false,
		})
	end
end

-- Conifers flanking the gate on the cold side: the first thing past a threshold
-- should say what kind of place you have entered.
prop(fFlora, "tree_pine", -30, -78, { tier = "tree", tilt = 3 })
prop(fFlora, "tree_pine", 31, -80, { tier = "tree", tilt = 3 })
prop(fFlora, "tree_pine", 44, -92, { tier = "sapling", tierTo = "tree", tilt = 4 })

-- Beat 2: OPEN snowfield, with two lone ice spikes far out on either flank so
-- the emptiness is composed rather than blank.
for _, spike in { { -78, -112 }, { 82, -124 } } do
	local sx, sz = spike[1] :: number, spike[2] :: number
	prop(fSecondary, "crystal", sx, sz, { tier = "sapling", tierTo = "tree", tilt = 8 })
	for _ = 1, 3 do
		local x, z = sx + rand(-11, 11), sz + rand(-11, 11)
		local h = prop(fRocks, "rock", x, z, { tier = "small", tierTo = "player", tilt = 22 })
		if h > 0 then
			snowCap(fRocks, x, z, groundTop(x, z), h, h * 0.45)
		end
	end
end

-- Beat 3: the frozen grove ------------------------------------------------
copse("FrostGroveWest", -66, -146, {
	radius = 26,
	tall = 4,
	mid = 3,
	small = 2,
	bush = 4,
	rock = 4,
	tuft = 2,
	pineBias = 1,
})
copse("FrostGroveEast", 62, -160, {
	radius = 24,
	tall = 3,
	mid = 3,
	small = 2,
	bush = 3,
	rock = 4,
	tuft = 2,
	pineBias = 1,
})

-- Crystal formations inside the grove: the zone's own resource, growing where
-- the trees thin out.
local frostVeins = folder("FrostVeins", fSecondary)
for _, vein in { { -40, -134 }, { 38, -172 }, { -22, -190 } } do
	local vx, vz = vein[1] :: number, vein[2] :: number
	local n = rng:NextInteger(3, 5)
	for i = 1, n do
		local a = rand(0, math.pi * 2)
		local d = rand(2, 10)
		prop(frostVeins, "crystal", vx + math.cos(a) * d, vz + math.sin(a) * d, {
			tier = if i == 1 then "sapling" else "player",
			tierTo = if i == 1 then nil else "large",
			tilt = 15,
		})
	end
	for _ = 1, 2 do
		prop(frostVeins, "rock", vx + rand(-14, 14), vz + rand(-14, 14), {
			tier = "small",
			tierTo = "player",
			tilt = 20,
		})
	end
end

-- Beat 4: the ice shelf ---------------------------------------------------
--[[ A LOW, WIDE beat. Everything else in this world stands up; this one lies
	 down, which is what stops the frost half from being one rhythm repeated.
	 Overlapping thin slabs at shallow angles read as fractured sheet ice. ]]
local shelf = folder("IceShelf", fGround)
for i = 1, 9 do
	local x = -58 + rand(-30, 30)
	local z = -192 + rand(-16, 16)
	box(
		shelf,
		"IceSlab",
		Vector3.new(rand(16, 34), rand(1.2, 2.6), rand(14, 28)),
		Vector3.new(x, rand(0.6, 2.0), z),
		if i % 3 == 0 then W.IcePath else (if i % 3 == 1 then W.FrostDeep else SNOW),
		rand(0, 180),
		false
	)
end
for _ = 1, 4 do
	prop(fRocks, "rock", -58 + rand(-34, 34), -192 + rand(-20, 20), {
		tier = "small",
		tierTo = "player",
		tilt = 24,
	})
end

-- Beat 5: SECONDARY LANDMARK — the Glacier Heart --------------------------
--[[ The frost zone's payoff, placed square on the road's axis past the end of
	 the path so it is the thing you walk toward from the moment the gate opens.
	 That axial placement is why the composition works from the canonical
	 "secondary zone" camera: it is the only object on the centre line.

	 It stands on the SAME stepped octagonal dais as the monument, in ice tones —
	 which is the point. Two landmarks built by two different methods is the
	 "unrelated assets" failure expressed in authored geometry; one masonry
	 language in two materials is a world.

	 ~52 studs against the monument's ~84. ]]
local heart = folder("GlacierHeart", fSecondary)
local GH_X, GH_Z = GLACIER.X, GLACIER.Y

local ghTop = stoneDais(
	heart,
	GH_X,
	GH_Z,
	0.4,
	{ { 23, 4.6 }, { 18, 4.2 }, { 13, 3.8 } },
	{ W.IcePathDark, W.IcePath, W.FrostDeep }
)

-- The core: three faceted shafts in the frost hue, shorter and stouter than the
-- monument's spire so the silhouette is a different shape, not a smaller copy.
-- Two levels only, against the monument's seven: the taper reads as a blunt
-- crystal boulder rather than a spire.
local heartTones = { frostHue, Palette.lift(frostHue, 0.22), Palette.shade(frostHue, 0.24) }
for level = 1, 2 do
	local w = 12.5 - (level - 1) * 3.5
	local h = 16 - (level - 1) * 2
	local yc = ghTop + (level - 1) * 15 + h / 2
	for i = 1, 3 do
		box(
			heart,
			"HeartFacet",
			Vector3.new(w, h, w),
			Vector3.new(GH_X, yc, GH_Z),
			heartTones[(level + i) % 3 + 1],
			(i - 1) * 60 + (level - 1) * 22
		)
	end
end
box(heart, "HeartCap", Vector3.new(6.0, 10, 6.0), Vector3.new(GH_X, ghTop + 32, GH_Z), heartTones[2], 30)

-- A ring of large palette crystals leaning out of the dais. Eight positions, but
-- the tiers alternate hard, so it is a formation and not a fence of spikes.
for i = 1, 8 do
	local ang = (i / 8) * math.pi * 2
	local r = 21
	prop(heart, "crystal", GH_X + math.cos(ang) * r, GH_Z + math.sin(ang) * r, {
		tier = if i % 2 == 0 then "sapling" else "large",
		tilt = 17,
		groundY = rand(0.6, 3.4),
		anywhere = true,
	})
end
for i = 1, 7 do
	local ang = rand(0, math.pi * 2)
	local d = rand(26, 38)
	local x, z = GH_X + math.cos(ang) * d, GH_Z + math.sin(ang) * d
	local h = prop(heart, "rock", x, z, { tier = "small", tierTo = "large", tilt = 20, anywhere = true })
	if h > 0 and i % 2 == 1 then
		snowCap(heart, x, z, groundTop(x, z), h, h * 0.45)
	end
end
-- Two conifers behind it, taller than the crystals but well under the core, so
-- the reward has a backdrop instead of sitting against bare cliff.
prop(heart, "tree_pine", -26, -248, { tier = "tree", tilt = 3, anywhere = true })
prop(heart, "tree_pine", 28, -250, { tier = "tree", tilt = 3, anywhere = true })

-- Frost background tree line, sparser than the meadow's: a hollow should feel
-- thinner at the edges than a meadow does.
local frostBackline = folder("FrostBackline", fFlora)
for _, side in { -1, 1 } do
	local z = -92
	while z > -240 do
		prop(frostBackline, "tree_pine", side * rand(112, 132), z, { tier = "tree", tilt = 3 })
		z -= rand(34, 62)
	end
end

-- Verge planting along the ice road, in clumps on alternating sides. Same rule
-- as the meadow: irregular pitch, one side at a time, bare ground between.
do
	local z = SOUTH_PATH_START - rand(24, 40)
	while z > SOUTH_PATH_END + 14 do
		local side = if chance(0.5) then 1 else -1
		local n = rng:NextInteger(1, 2)
		for _ = 1, n do
			local x = side * (PATH_HALF + rand(4, 13))
			local zz = z + rand(-8, 8)
			if onFrostFloor(x, zz) then
				prop(fFlora, "bush", x, zz, { tier = "player", tilt = 10, collide = false })
			else
				tuft(x, zz, rand(1.0, 1.5))
			end
		end
		z -= rand(40, 72)
	end
end

-- Meadow verge planting, same grammar. Kept after the frost work so the two
-- zones' RNG streams do not interleave in a way that makes one edit reshuffle
-- the other.
do
	local z = NORTH_PATH_START + rand(28, 46)
	while z < NORTH_PATH_END - 14 do
		local side = if chance(0.5) then 1 else -1
		local n = rng:NextInteger(2, 3)
		for _ = 1, n do
			tuft(side * (PATH_HALF + rand(3, 9)), z + rand(-9, 9), rand(1.0, 1.7))
		end
		if chance(0.35) then
			prop(fFlora, "bush", -side * (PATH_HALF + rand(6, 14)), z + rand(-14, 14), {
				tier = "player",
				tilt = 9,
				collide = false,
			})
		end
		z += rand(38, 64)
	end
end

-- =========================================================================
-- 14. LIGHTING
-- =========================================================================
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

-- =========================================================================
-- 15. SUMMARY
-- =========================================================================
--[[ The four-way split is reported against the PROPS, because that is what the
	 rejections have been about, and the two categories of primitive that are not
	 props are printed separately rather than folded in.

	 Two reference numbers to compare against: the first rejected baseline was
	 608 parts, ALL primitives; the second was 471 primitives with the props as
	 meshes. If the primitive total climbs back toward 608 with the asset share
	 holding, the build has started answering criticism with part count, which is
	 the thing it was explicitly told not to do.

	 The fallback line is split in two because the two halves mean opposite
	 things. `no palette` is the regression — the folder is missing and the world
	 is the blockout again. `off palette` is the texture policy working: the
	 family exists but no member of it may stand in that biome, so an authored
	 body painted from the biome went down instead of an off-palette mesh. The
	 first must be 0 when the palette is loaded. The second is allowed to be
	 non-zero and is a statement about the palette, not about the builder. ]]

pcall(function()
	game:GetService("ChangeHistoryService"):SetWaypoint("Crystal Canyon world build")
end)

local propTotal = assetCount + buckets.fallback
local assetShare = if propTotal > 0 then (assetCount / propTotal) * 100 else 0
local primitiveTotal = buckets.fallback + buckets.detail + buckets.authored
local extent = maxB - minB

print(
	string.format(
		"[Crystal Canyon] world rebuilt — %d parts, seed %d, bounds %.0f x %.0f x %.0f studs (x/y/z)\n"
			.. "  palette clones (mesh assets)   %4d   [%s]\n"
			.. "  primitive prop FALLBACKS       %4d   [no palette %d (must be 0) / off palette %d (texture policy)]\n"
			.. "  primitive detail               %4d   [grass tufts, snow caps, fire ring]\n"
			.. "  authored terrain/architecture  %4d   [ground, paths, cliffs, landmarks, pads, gate, guidance]\n"
			.. "  PROPS      primitive:asset = %d:%d  (%.0f%% of props are curated assets)\n"
			.. "  PRIMITIVES %d total, against 608 (blockout) and 471 (previous art pass)\n"
			.. "  PALETTE    %d loaded, %d curated in, %d culled out, %d untintable",
		partCount,
		SEED,
		extent.X,
		extent.Y,
		extent.Z,
		assetCount,
		if paletteOK then string.format("%d curated members loaded", paletteTotal) else "PALETTE MISSING",
		buckets.fallback,
		pickNoPalette,
		pickOffPalette,
		buckets.detail,
		buckets.authored,
		buckets.fallback,
		assetCount,
		assetShare,
		primitiveTotal,
		loadedTotal,
		paletteTotal,
		#culledNames,
		#texturedNames
	)
)

--[[ WHERE THE PRIMITIVES WENT. The total is up from the previous art pass (471
	 -> 558) and a total on its own cannot be argued with, so it is broken down by
	 system. Two of the three increases were demanded by the review — the landmark
	 "needs the highest quality in the map", and the guidance language had to be
	 replaced outright — and the third line is a DECREASE: the cliffs cost fewer
	 parts than before despite being reworked, because the fix for "repeated
	 rectangular blocks" was fewer and stronger masses rather than more bricks.
	 If a future revision moves this table the wrong way, that is the signal. ]]
do
	local spend: { [string]: number } = {}
	local order: { string } = {}
	for _, f in canyon:GetChildren() do
		if f:IsA("Folder") then
			local n = 0
			for _, d in f:GetDescendants() do
				if d:IsA("BasePart") and not d:IsA("MeshPart") then
					n += 1
				end
			end
			if n > 0 then
				spend[f.Name] = n
				table.insert(order, f.Name)
			end
		end
	end
	table.sort(order, function(a, b)
		return spend[a] > spend[b]
	end)
	local line = {}
	for _, k in order do
		table.insert(line, string.format("%s %d", k, spend[k]))
	end
	print("[Crystal Canyon] primitive spend by system: " .. table.concat(line, ", "))
end

if #culledNames > 0 then
	print("[Crystal Canyon] excluded by the curated allowlist: " .. table.concat(culledNames, ", "))
end
if #texturedNames > 0 then
	print(
		"[Crystal Canyon] curated but UNTINTABLE (carry a TextureID, so Color has no effect): "
			.. table.concat(texturedNames, ", ")
			.. "\n  These are admitted only where their own texture is already the biome's palette; "
			.. "in every other biome the authored body stands in."
	)
end

if not paletteOK then
	warn(
		"[Crystal Canyon] the build above contains ZERO palette assets. Every prop is a primitive "
			.. "fallback and this world is the rejected blockout. Load ServerStorage."
			.. PALETTE_ROOT_NAME
			.. " and re-run before capturing evidence."
	)
end
