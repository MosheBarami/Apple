--!strict
--[[
	Crystal Canyon — deterministic edit-time world builder.

	Run this as a plain chunk from the Studio command bar (or a build plugin) in EDIT mode. It
	is not a ModuleScript and returns nothing; it does its work on execution and prints a
	summary — including the four-way part split, which is the number successive revisions of
	this file are measured against.

	THE REVISION HISTORY LIVES IN docs/WORLD-BUILDER-HISTORY.md, not here. It was four
	revisions of narrative at the top of a file that is already at Studio's 200 000-character
	ceiling for assigning `Source` from a script — which is a real build limit, not a style
	preference: the loader physically cannot install this file once it passes it. What remains
	below is the part a reader has to have in front of them to change anything safely.

	TWO PROPERTIES THIS FILE GUARANTEES.

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

	   THE CUBE PLACEMENTS KEEP THE SAME CONTRACT. Every one of them consumes
	   either zero rng (the monument, its collar, the kiosk, the outcrop
	   crystals) or a fixed number of draws taken BEFORE availability is tested
	   (the seven per cliff segment). A missing GolemPalette therefore still
	   produces the same world with the authored geometry standing in: the
	   rejected faceted spire returns to the plinth, the wall's module segments
	   build as shorter two-course masses that still seal the ring, and the
	   upgrade pad keeps the dressing it had. The summary warns loudly when that
	   has happened.

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

--[[ EVALUATES ITS ARGUMENTS AND EMITS NOTHING.

	 This exists for one job and it is worth stating plainly, because a function that
	 deliberately throws away its work looks like a mistake.

	 `Build.luau` is deterministic from ONE seeded stream. Adding or removing a single `rand()`
	 re-rolls every draw after it and rebuilds the entire world differently — F-32, which cost
	 an afternoon and was caught only because a part count happened to move. So when a piece of
	 geometry is RETIRED, its draws must stay: the chamfer, the ramp cap, the broken crest and
	 the buttress are all gone from the wall, and every `rand()` that used to size them still
	 runs, in the same order, with the same arguments.

	 Those draws sit inside the emission calls' own argument lists, so the way to keep them is to
	 keep the call and change where it goes. Lua evaluates arguments left to right before the
	 call, so routing them here consumes the stream identically and builds nothing. The stream
	 fingerprint printed at the end of the build is what proves it.

	 The alternative — extracting the draws into a program table and replaying it — is where
	 parity would actually be lost: the sequence has three short-circuits in it, and any one
	 transcribed wrongly is F-32 again, silently. ]]
--[[ THE CLIFF VOCABULARY LIVES IN ONE TABLE, and the reason is a hard Luau limit rather than
	 taste: a chunk gets 200 local registers per scope, this file runs as one top-level chunk,
	 and it was already at the ceiling. Adding the facet helpers, the deck and the archetype
	 builder as ten more top-level locals failed to compile with "Out of local registers".

	 So they are fields of `CW`. If this file grows another subsystem, do the same thing rather
	 than hunting for a local to delete — and note the other ceiling, in the header: 200 000
	 characters of `Source`. ]]
local CW = {}
function CW.discard(...: any) end

--[[ CornerWedgePart: a triangular silhouette from TWO horizontal directions at once, which is
	 the one thing a WedgePart cannot give. Used for the hoodoo caps, where the skyline needs a
	 genuine point rather than a ridge.

	 AXIS CONVENTION, MEASURED RATHER THAN ASSUMED. The ramp-cap bug (F-14) was exactly a wrong
	 guess about a WedgePart's local axes, and CornerWedgePart is less well understood again, so
	 both were probed in Studio by raycasting a 12-stud cube of each from above and reading the
	 top surface height on a 5x5 lattice:

	   WedgePart, identity CFrame (LookVector = local -Z):
	     thin (h=1) at local z = -5, full (h=11) at local z = +5, UNIFORM across x.
	     => the slope runs along local Z and descends TOWARD the LookVector.
	     => under `CFrame.lookAt(centre, centre + outward)` a wedge is thin on the OUTWARD side
	        and full behind it: a scree slope facing the player. Rotate 90 degrees about Y to
	        put the slope along the run instead.

	   CornerWedgePart, identity CFrame:
	     apex (h=11) at local (x = +5, z = -5); falls to h=1 along both -X and +Z.
	     => the point is on the LookVector side, at the +X (RightVector) corner.

	 The existing `wedge` comment above describes the OLD convention and is left alone because
	 the ramp cap it documents is gone; this one is the measured truth. ]]
function CW.cornerWedge(parent: Instance, name: string, size: Vector3, cf: CFrame, color: Color3): CornerWedgePart
	local p = Instance.new("CornerWedgePart")
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

--[[ ONE ORIENTED FACET — the primitive the whole wall rewrite is built from.

	 `pitch` is SIGNED and it is the lever that matters. Positive leans the outward face BACK
	 (its top tips away from the player, so the normal tilts up toward the sun); negative
	 OVERHANGS, which the old construction could not express at all.

	 Why orientation and not silhouette. `Lighting` is ClockTime 14, GeographicLatitude 12, so
	 the sun sits at elevation ~58 degrees (sin e = cos12 * cos30 = 0.847). For a face tilted t
	 back from vertical at azimuth offset d from the sun:

	     N·L = cos(58) * cos(d) * cos(t)  +  sin(58) * sin(t)
	         = 0.530 * cos(d) * cos(t)    +  0.848 * sin(t)

	 Every authored face in the old wall was `batter = -rand(0.035, 0.115)` with yaw at most
	 +/-7 degrees: t in [2.0, 6.6] degrees, so N·L in [0.556, 0.624] — an ELEVEN PERCENT range
	 across a 34-stud-tall, 500-stud-long surface. That is a flat panel with lines drawn on it,
	 and it is what "stacked rectangular blocks" was describing.

	 It also explains F-33, whose recorded reason was incomplete. Raising the batter to
	 5.7..12.6 degrees moved N·L to [0.612, 0.702]: the MEAN rose 15% and the SPREAD stayed at
	 15%. Every face brightened together, so nothing separated from anything. That is the general
	 trap for any change that adjusts one shared parameter across all faces.

	 The ranges here — yaw +/-32, pitch -22..+38, roll +/-18 — put N·L in [0.10, 0.94].

	 HONESTY ABOUT WHAT THAT NUMBER IS. N·L is the geometric term, not the delivered pixel.
	 This world has OutdoorAmbient (146,152,158), Ambient (112,116,122) and
	 EnvironmentDiffuseScale 0.55, so the ambient floor compresses a 9.5x N·L range into
	 something much smaller on screen. The metric is a DESIGN TOOL that says which direction to
	 move and roughly how far; it is not evidence, and no claim about this wall should be made
	 from it. The evidence is player-eye pixels and a fresh critic. ]]
function CW.facet(
	parent: Instance,
	name: string,
	kind: string, -- "block" | "wedge" | "corner"
	size: Vector3,
	centre: Vector3,
	outward: Vector3,
	yawDeg: number,
	pitchDeg: number,
	rollDeg: number,
	color: Color3
): BasePart
	local cf = CFrame.lookAt(centre, centre + outward)
		* CFrame.Angles(math.rad(pitchDeg), math.rad(yawDeg), math.rad(rollDeg))
	if kind == "wedge" then
		return wedge(parent, name, size, cf, color)
	elseif kind == "corner" then
		return CW.cornerWedge(parent, name, size, cf, color)
	end
	return newPart(parent, name, size, cf, color, true)
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
--[[ MeshParts at ServerStorage.GolemPalette.<family>.<name>, acquired from the Creator Store
	 under a recorded licence and curated by an allowlist in assets/palette.json. Fewer and
	 coherent beats more and mixed. See docs/WORLD-BUILDER-HISTORY.md. ]]

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

--[[ TEXTURE IS A PROPERTY, NOT A FACT ABOUT THE MESH. A mesh carrying a TextureID ignores
	 `Color`, so it cannot join a tinted palette; the allowlist records which ones do and why.
	 See docs/WORLD-BUILDER-HISTORY.md. ]]
--[[ `cliff_module` WAS on this list and was taken off it by a render.

	 The reasoning was that stripping the texture removes the candy-stripe banding
	 that got the three mesas rejected, which is true, and that this would make
	 them usable as tinted cliff mass, which is false. Stood against the real
	 canyon wall at the `cliff` tier in the biome's own rust, a de-textured mesa
	 reads as a SMOOTH FEATURELESS COLUMN: the underlying geometry is soft, and
	 the banding had been doing all of the geological work. The curated rock mesh
	 standing beside it in the same shot is sharply faceted and reads as rock.

	 The sharpened rule, which is what this list is really keyed on: de-texturing
	 only helps where the GEOMETRY already carries the form. A crystal's facets
	 survive the strip. A mesa's do not exist. Generating successfully, rendering
	 well alone, and even tinting correctly are all still not acceptance.

	 Left off rather than left in-and-unused: a rejected thing kept as dead
	 configuration is how a later pass reintroduces it. ]]
local DETEXTURE: { [string]: boolean } = {
	crystal = true,
	crystal_cube = true,
}

local function detexture(inst: any)
	if inst:IsA("MeshPart") then
		(inst :: MeshPart).TextureID = ""
	end
	for _, d in inst:GetDescendants() do
		if d:IsA("MeshPart") then
			(d :: MeshPart).TextureID = ""
		end
	end
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
			--[[ A family on the DETEXTURE list is tintable BY POLICY: the clone
				 that reaches the world has its TextureID cleared, so Color lands on
				 it. Decided here, performed at the clone. ]]
			if isTintable(member) or DETEXTURE[family] then
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
--[[ The cliff wall's boulder masses draw from the same curated rock shelf as
	 the scenery rocks — same meshes, same allowlist, same acquisition record —
	 and differ only in the biome ROLE they tint through and the tier they are
	 scaled to. Aliased rather than declared as its own family so a rock added to
	 the palette is available to the wall on the same commit. ]]
pools.cliff_rock = pools.rock
tintablePools.cliff_rock = tintablePools.rock

-- =========================================================================
-- THE CUBE FAMILIES — GOLEM-ORIGINATED, NOT CREATOR STORE
-- =========================================================================
--[[ GolemPalette also carries meshes this project GENERATED through Roblox GenerationService
	 (Cube). Six of nine were rejected — three on their own render, three more once they stood
	 in the world — because a Cube mesh arrives TEXTURED and a textured mesh cannot be tinted
	 into a flat-shaded palette. See docs/WORLD-BUILDER-HISTORY.md. ]]

--[[ `cliff_module` is deliberately NOT in this list, and the three meshes are
	 still in ServerStorage.GolemPalette so the rejection can be re-checked.

	 They generated successfully, they were accepted on their own thumbnails, and
	 they FAILED the moment they were rendered standing in this world: the strata
	 banding that reads as geology at asset scale reads as a candy stripe against
	 flat-shaded vertex-coloured rock, and a barber-pole tower on a red block wall
	 is a worse answer to "reads as prototype terrain" than the wall was. That is
	 a style-coherence failure, which is the gate this pass was asked to add, and
	 it is not fixable downstream: a Cube mesh carries a texture, so it cannot be
	 tinted into the biome the way every other prop here is.

	 The general rule, already written into assets/palette.json: generating is not
	 accepting, and rendering an asset ALONE is not rendering it IN CONTEXT. Three
	 of nine were rejected on their own render; these three needed the world. ]]
local CUBE_FAMILIES = { "landmark", "kiosk", "crystal_cube" }

local cubePools: { [string]: { any } } = {}
local cubeByFamily: { [string]: number } = {}
local cubeCount = 0
local cubeTotal = 0

for _, family in CUBE_FAMILIES do
	local found: { any } = {}
	local sub = if paletteRoot then paletteRoot:FindFirstChild(family) else nil
	if sub then
		for _, child in sub:GetChildren() do
			--[[ GenerationService hands back `Model -> MeshPart`. A one-part
				 Model is a wrapper, not a composition, so it is unwrapped to the
				 part: `Model:ScaleTo` is uniform-only, and the monument below
				 needs a bounded non-uniform fit. Unwrapping also keeps the part
				 accounting exact rather than "at least one". ]]
			if child:IsA("Model") then
				local parts: { any } = {}
				for _, d in child:GetDescendants() do
					if d:IsA("BasePart") then
						table.insert(parts, d)
					end
				end
				table.insert(found, if #parts == 1 then parts[1] else child)
			elseif child:IsA("BasePart") then
				table.insert(found, child)
			end
		end
		-- Same stability rule as the curated pools: GetChildren order is not
		-- contractual and this build's whole value is that two runs are equal.
		table.sort(found, function(a, b)
			return sortKey(a) < sortKey(b)
		end)
	end
	cubePools[family] = found
	cubeByFamily[family] = 0
	cubeTotal += #found
end

--[[ Draw a member deterministically. `u` is a number in [0, 1): a stream draw
	 where the caller already owns one, or a fixed authored fraction where the
	 placement must consume no rng at all. ]]
local function cubeDraw(family: string, u: number): any?
	local pool = cubePools[family]
	if not pool or #pool == 0 then
		return nil
	end
	local clone = pool[math.min(#pool, math.floor(u * #pool) + 1)]:Clone()
	if DETEXTURE[family] then
		detexture(clone)
	end
	return clone
end

--[[ How a Cube mesh is allowed to depart from uniform scale. Only the monument
	 passes one; see the landmark section for why a footprint cap plus a bounded
	 vertical stretch is the honest way to make a mesh dominate a skyline. ]]
type CubeFit = { maxW: number, maxStretch: number }

--[[ Stand a Cube mesh with its BASE on `baseY`, centred on (x, z), scaled to
	 `targetH` studs of finished height and rotated by `rot`.

	 `rot` is a rotation-only CFrame rather than a yaw so a caller that needs a
	 mesh aimed at something — the kiosk faces its pad — can hand in a
	 `CFrame.lookAt` directly instead of decomposing it back into a yaw.

	 No tint is applied and none is possible — see the header above. Material is
	 still forced to SmoothPlastic, because §9.10 fails a realistic material and
	 the texture survives it. ]]
local function cubePlace(
	parent: Instance,
	clone: any,
	family: string,
	x: number,
	z: number,
	baseY: number,
	targetH: number,
	rot: CFrame,
	collide: boolean,
	fit: CubeFit?,
	tint: Color3?
): number
	local ext = extentsOf(clone)
	local scale = targetH / math.max(0.1, ext.Y)
	--[[ `Model:ScaleTo` is uniform-only, so a fit is only honoured on a single
		 part. A multi-part Cube model has never come back from the service; if
		 one ever does it takes the uniform scale and the monument reports short
		 in the DOMINANCE line rather than being met by distorting an assembly. ]]
	local stretch = 1
	if fit and not clone:IsA("Model") then
		local wide = math.max(ext.X, ext.Z)
		local capped = fit.maxW / math.max(0.1, wide)
		if capped < scale then
			stretch = math.min(fit.maxStretch, scale / capped)
			scale = capped
		end
	end
	local h = ext.Y * scale * stretch
	local cf = CFrame.new(x, baseY + h / 2, z) * rot

	local n = 0
	local function dress(p: BasePart)
		p.Anchored = true
		p.CanCollide = collide
		p.CanTouch = false
		p.Material = Enum.Material.SmoothPlastic
		--[[ A de-textured Cube family is an ordinary tintable prop: its clone
			 arrived with TextureID cleared, so Color lands and the caller hands in
			 the biome tint under the placement. Guarded on the TEXTURE STATE rather
			 than on the family name, so a member that kept its texture can never be
			 half-painted. ]]
		if tint and (not p:IsA("MeshPart") or (p :: MeshPart).TextureID == "") then
			p.Color = tint
		end
		n += 1
	end

	if clone:IsA("Model") then
		clone:ScaleTo(scale)
		clone.Parent = parent
		clone:PivotTo(cf)
		for _, d in clone:GetDescendants() do
			if d:IsA("BasePart") then
				dress(d)
			end
		end
		n = math.max(1, n)
	else
		clone.Size = Vector3.new(ext.X * scale, h, ext.Z * scale)
		clone.CFrame = cf
		dress(clone)
		clone.Parent = parent
	end

	partCount += n
	cubeCount += n
	cubeByFamily[family] += n
	track(Vector3.new(x, baseY + h / 2, z), Vector3.new(ext.X * scale, h, ext.Z * scale))
	return h
end

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
--[[ THE FIX FOR CONTAMINATION IS STRUCTURAL. Biome is resolved where a prop STANDS, not
	 where its group is anchored, because an offset large enough to cross the boundary put rust
	 buttresses in the snow. See docs/WORLD-BUILDER-HISTORY.md. ]]

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
		--[[ Sandstone, not a pale neutral. The previous (178,152,126) was chosen to
			 warm pale meshes and it did, but a 13-stud boulder painted that light
			 sits in a saturated green meadow under a rust wall reading as an
			 unpainted import — the "raw grey/white … unstyled imported meshes"
			 note, one step further along. Darker and more saturated puts scenery
			 rock in the same family as the canyon without making it cliff, which
			 is what `cliff` is for. ]]
		stone = Color3.fromRGB(176, 140, 104),
		--[[ A separate role from `stone`, and the reason `cliff_rock` exists as a
			 family at all. A boulder MASS is part of the canyon wall, so it takes
			 the wall's own middle tone; a boulder PROP is scenery lying on the
			 ground and takes warm neutral. Painting the masses `stone` put a pale
			 sand dome against a rust wall, and the biggest object in the frame
			 read as a separate imported thing rather than as the cliff. ]]
		cliff = W.CliffB,
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
		cliff_rock = { role = "cliff", tintable = true },
		crystal = { role = "crystal", tintable = true },
		fence = { role = "wood", tintable = true },
		fence_panel = { role = "wood", tintable = true },
		sign = { role = "wood", tintable = true },
		crate = { role = "wood", tintable = true },
	},
}

local BIOME_FROST: Biome = {
	Id = "frost",
	--[[ Cool stone, not rust. A rust wall behind a snowfield was half of why the two halves of
		 the map read as one zone painted twice.

		 SATURATED cool stone, as of V4. The first version of this triple ran 21/25/29 %
		 saturation against the meadow cliff's 68 %, and the visual critic called the whole zone
		 near-monochrome pale blue-grey — §1 opens "Bright, saturated, high-key. No muted
		 palettes, no tasteful neutrals" and §9.10 makes desaturated an automatic fail. About a
		 third of the map was failing a headline criterion.

		 The hue is unchanged; only the chroma moved, to 44/50/55 %. Cool does not have to mean
		 grey, and "icy" in this style language is a saturated blue, not an absence of colour. ]]
	Cliff = { Color3.fromRGB(126, 186, 224), Color3.fromRGB(104, 166, 209), Color3.fromRGB(86, 146, 192) },
	Snow = true,
	Tint = {
		foliage = Color3.fromRGB(54, 132, 110), -- deep pine, saturated rather than blue-grey (V4)
		wood = Color3.fromRGB(104, 116, 134),
		stone = Color3.fromRGB(140, 186, 214),
		-- The middle of this biome's own Cliff triple, for the same reason as in
		-- the canyon: a boulder mass is wall, not scenery.
		cliff = Color3.fromRGB(104, 166, 209),
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
		cliff_rock = { role = "cliff", tintable = true },
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
	--[[ Cliff MASSES, not props: the boulder masses that break the canyon wall's
		 silhouette. It is a tier rather than a raw scale for the same reason
		 everything else is — three rock meshes of different source dimensions
		 asking for one band come out one band tall. Deliberately butted against
		 `landmark` at 50 rather than overlapping it: the wall is allowed to be
		 the second tallest thing in the map and is not allowed to reach the
		 monument. ]]
	cliff = { 30.0, 50.0 },
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
	cliff_rock = 5,
	crystal = 8,
	fence = 7,
	fence_panel = 7,
	sign = 8,
	crate = 4,
}

--[[ Tiers in order, so a placement can ask for a RANGE of tiers — "somewhere
	 between a small prop and a large one" — without that turning back into a
	 continuous scale factor by the back door. ]]
local TIER_ORDER = { "micro", "small", "player", "large", "sapling", "tree", "cliff", "landmark" }
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
	local clone = pool[math.min(#pool, math.floor(u * #pool) + 1)]:Clone()
	if DETEXTURE[resolved] then
		detexture(clone)
	end
	return resolved, clone
end

--[[ Stand a clone on the ground at (x, z).

	 Returns the placed height in studs, which callers use to stack (crates) and
	 to decide where a snow cap goes.

	 THE TINT IS NOT A PARAMETER. It is read from the biome under the placement,
	 which is the whole mechanism that makes contamination unwriteable. Material
	 is forced to SmoothPlastic: §7 wants flat-shaded untextured low-poly and
	 §9.10 fails a realistic material outright.

	 TextureID is not touched HERE. It is decided upstream, per family, by
	 DETEXTURE, and performed on the clone in `pick`. This function only ever
	 asks the arriving clone whether it can take a colour. That split matters:
	 the older note here claimed blanking a texture "yields an untextured white
	 blob", which is true of a sign or a crate and measurably false of a crystal.
	 Colour therefore lands on exactly the members each biome admits. ]]
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
	elseif family == "rock" or family == "cliff_rock" then
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
	--[[ A hard cap on finished FOOTPRINT, in studs. Not a scale factor and not a
		 second tier: it only ever shrinks a placement, never grows one, and the
		 tier still decides the height it is shrinking from.

		 It exists because a tier states HEIGHT and a mesh's width follows its own
		 aspect. The curated rock shelf runs up to about 2:1 wide, so a 42-stud
		 cliff mass came out EIGHTY-FOUR studs across and one of them landed in
		 the frost approach as a mountain the canonical camera was standing
		 inside. Height is the right thing for a tier to control and width is the
		 wrong thing to leave unbounded; this bounds it at the one call site that
		 asks for cliff-scale geometry. ]]
	maxW: number?,
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
		local ext = extentsOf(clone)
		local scale = targetH / math.max(0.1, ext.Y)
		if cfg.maxW then
			local wide = math.max(ext.X, ext.Z) * scale
			if wide > cfg.maxW then
				scale *= cfg.maxW / wide
			end
		end
		return place(parent, clone, resolved, x, z, y, scale, yaw, tiltX, tiltZ, collide)
	end
	--[[ The fallback body is built roughly as wide as it is tall, so capping its
		 HEIGHT at maxW caps its footprint at the same number. Applied here for the
		 same reason every other fallback matches the asset build: the two must
		 have the same skyline or the comparison the fallback exists to support is
		 worthless. ]]
	local fallbackH = if cfg.maxW then math.min(targetH, cfg.maxW) else targetH
	return fallbackProp(parent, resolved, x, z, y, fallbackH / NOMINAL[resolved], yaw, tiltX, tiltZ, collide)
end

--[[ A sign that actually says something. V5.

	 §8 asks a kiosk for "a bright sign". The world had seven `sign` props and **zero** text,
	 decal or SurfaceGui on any of them — the visual critic counted three BillboardGuis in the
	 whole Canyon and no Decal or Texture at all. A signpost with nothing written on it is set
	 dressing pretending to be signage.

	 `prop` returns a height, not the instance it placed, so the newest child is taken after the
	 call. That is order-dependent and would be a poor pattern in a long-lived API; here the two
	 statements are adjacent, and the alternative is changing `prop`'s return type for six call
	 sites that do not need it.

	 No `rand()` here: this must not shift the builder's seeded stream (F-32). ]]
local function labelledSign(parent: Instance, x: number, z: number, text: string, cfg: PropCfg): number
	local before = #parent:GetChildren()
	local h = prop(parent, "sign", x, z, cfg)
	local kids = parent:GetChildren()
	if #kids <= before then
		return h
	end
	local placed = kids[#kids]
	local board: BasePart? = if placed:IsA("BasePart")
		then placed :: BasePart
		else placed:FindFirstChildWhichIsA("BasePart", true)
	if board then
		billboard(board, text, biomeAt(x, z).Tint.accent, 13, 3.4, math.max(h * 0.6, 4))
	end
	return h
end

-- =========================================================================
-- 4. CLIFFS
-- =========================================================================
--[[ THE CANYON WALL. Named hard fail: "the orange/red perimeter is visibly repeated
	 rectangular blocks. Reads as prototype terrain. Do NOT fix by adding more bricks."

	 Seven attempts are recorded in docs/FAILURES.md (F-13, F-19, F-33, plus the buttress,
	 broken crest, ramp cap and weathering chamfer, all retired). Every one changed the wall's
	 SILHOUETTE or its material and left its SHADING alone — every authored face sat within an
	 11 % band of one Lambert value, and a 500-stud surface at one luminance is a flat panel
	 whatever its outline does. The derivation is on `CW.facet`; the honest result of the
	 replacement is F-39.

	 Per segment: ONE SEAL, full width, overlapping its neighbours, floored at 16 studs and
	 sized as the recessed back plane; ONE ARCHETYPE from a shuffled deck with adjacency repair,
	 standing forward of it by a per-segment standoff so the plan meanders; then boulder masses,
	 talus and planting below, unchanged. The determinism contract is on `CW.discard`. ]]

type CliffOpts = {
	talus: boolean?,
	planting: boolean?,
	saddles: boolean?,
	modules: boolean?, -- boulder masses as the large masses (default on)
	--[[ How far, in studs, the visible masses may step INWARD of the sealing course. This is
		 what makes the wall's plan meander instead of running as one straight fence. A segment
		 draws its own value in [-6, standoff]; negative means the mass recedes BEHIND the seal
		 line, which is what opens a gully.

		 Caps come from the clearances this file already documents, not from taste:
		   outer E/W (x = +/-146): crystals reach x = +/-96, so 50 studs of clearance; a mass is
		     at most 19.3 deep from its centre, so 18 leaves 12.7 clear.
		   outer N/S (z = 252 / -255): the meadow reaches z = 210, 42 studs; 10 leaves 12.7.
		   spur: 4 — a mass here frames the landmark between two domes.
		   butte: 0 — its courses already reach x ~ -95. ]]
	standoff: number?,
	--- Which archetypes this run may draw. Defaults to the full deck.
	deck: { string }?,
}

--[[ The widest a boulder mass may finish, in studs. The curated rock shelf runs
	 to about 2:1 wide-to-tall, so the `cliff` tier's 30-50 studs of HEIGHT was
	 producing masses 60-84 studs ACROSS — at which size one is not relief on a
	 wall, it is a hill, and the frost approach ended up with a camera standing
	 inside one. 46 is a little under the 48-stud segment stride, so two adjacent
	 masses can still touch and read as one massif without either of them
	 becoming the run. ]]
--[[ The lowest the perimeter seal's top may sit above the run's ground line.

	 16 rather than 8: a default humanoid jumps 7.15 studs from flat ground, and more from a
	 slope or a prop, so a floor set at the jump height is a floor set at exactly the number the
	 player is trying to beat. 16 is comfortably past any unassisted jump while still leaving a
	 saddle reading as a break against neighbours twice its height. ]]
local SEAL_MIN_TOP = 16

local CLIFF_MASS_MAX_W = 46

--[[ THE TALLEST A SINGLE CLIFF FACET MAY FINISH, and it is a composition gate rather than a
	 style preference.

	 `DOMINANCE` in the build summary is `monument top / tallest non-landmark top`, and it fails
	 below 1.25. Measured on the baseline: monument 81.8, tallest rival 59.5, ratio 1.37. So the
	 rival may rise to 81.8 / 1.25 = 65.4 before the gate fails, and no further.

	 This matters because the HOODOO archetype is a single tall shaft. At the outer ring
	 `height = 34 * rand(0.88, 1.5)` reaches 51, and a 1.55x shaft on top of that is 79 studs —
	 which would take the ratio to 1.04 and fail the gate outright, silently, while every other
	 measurement in the pass improved. 62 keeps the ratio at 1.32 with room to spare.

	 The design plan this construction comes from contained no dominance check and never named
	 the metric. That is exactly the shape of failure this codebase keeps recording: a change
	 that is right about the thing it is looking at and wrong about the thing it is not. ]]
CW.FACET_MAX_TOP = 62

--[[ Height band for cliff tone, in studs.

	 §7 asks for horizontal banding. It used to come from `toneOffset + k` — an INDEX — so a
	 band was a property of a MASS and every mass restarted the sequence. Banding is a property
	 of HEIGHT: the band at y = 20 is the same tone at every point on the ring, which is what
	 stratigraphy actually looks like and what makes separate masses read as one geology.

	 11 studs over walls of 30-50 gives 3-4.5 bands, which is §7's "two or three tones" read
	 across the whole ring rather than around each mass. Both biome triples are already ordered
	 light to dark, so one indexing rule serves both and the biome tint is untouched. ]]
CW.BAND = 11

--[[ The archetype deck.

	 The second cause of the repetition — after flat normals — is one recipe run thirty times.
	 The old construction made independent per-segment coin flips, and independent probability is
	 precisely why runs of identical recipes appear: a 0.62 module roll produces three module
	 segments in a row about a quarter of the time.

	 A deck cannot. Build ceil(segments / kinds) copies of each allowed archetype, shuffle, then
	 sweep once swapping any adjacent duplicate with the next non-conflicting element.

	 Drawn from the run's OWN Random, so it costs the shared stream nothing (F-32). ]]
--[[ TALUS IS NOT IN THE OUTER DECK, and that was decided by a render rather than by taste.

	 It is the cheap archetype — two wedges, no vertical structure — and it was meant to be the
	 bright counterweight that pays for the expensive ones. As a whole SEGMENT on an 84-stud
	 outer run it is a long low mass, and the deck dealt two of them side by side on the
	 meadow-side west wall along with a saddle, so the single most-photographed stretch of this
	 world came out as an unbroken low band with no vertical event anywhere in it. Three
	 captures in a row showed it and no metric in the pass did.

	 Its job is still done, and better, by the `cliff_rock` talus and boulder meshes that already
	 stand at the wall's foot. So it stays in the BUTTE deck, where masses are small and a scree
	 shoulder is the right scale, and off the ring. ]]
CW.DECK_ALL = { "FIN", "SCARP", "ALCOVE", "HOODOO" }

function CW.buildDeck(r: Random, n: number, allowed: { string }): { string }
	local deck: { string } = {}
	local copies = math.ceil(n / #allowed)
	for _ = 1, copies do
		for _, kind in allowed do
			table.insert(deck, kind)
		end
	end
	-- Fisher-Yates on the run's private stream.
	for i = #deck, 2, -1 do
		local j = r:NextInteger(1, i)
		deck[i], deck[j] = deck[j], deck[i]
	end
	-- One repair sweep. Give up rather than loop: with five kinds and a shuffled deck an
	-- unresolvable adjacency is vanishingly rare, and a loop that cannot terminate is worse
	-- than one repeat in a wall.
	for i = 2, #deck do
		if deck[i] == deck[i - 1] then
			for j = i + 1, #deck do
				if deck[j] ~= deck[i - 1] and (j == #deck or deck[j] ~= deck[j + 1]) then
					deck[i], deck[j] = deck[j], deck[i]
					break
				end
			end
		end
	end
	return deck
end


--[[ BUILD ONE SEGMENT'S VISIBLE MASS.

	 Everything here draws from `r`, a Random private to this segment, so tuning any archetype
	 cannot move any other segment's geometry — F-32's lesson applied at a finer grain than the
	 file previously applied it — and the shared stream is untouched.

	 `toneOf(y)` bands by height (see CW.BAND). `capTop` is the dominance ceiling: every
	 archetype clamps its own tallest element against it rather than trusting its proportions,
	 because the proportions are relative to `H` and `H` varies 34..51 on the outer ring.

	 THE RULE THAT SEPARATES THIS FROM THE FOUR REJECTED ATTEMPTS: adjacent facets within one
	 mass differ in pitch by at least 18 degrees and alternate sign wherever both are available.
	 Uniformly re-randomising over a wide range is NOT enough — a wide range sampled
	 independently still produces neighbouring pairs that are near-identical, and a wall of
	 mostly-similar faces reads exactly like a wall of identical ones. So pitch comes from a
	 per-archetype LADDER, jittered, never from an independent draw per facet.

	 COUNTER-SHADING IS A SAFETY REQUIREMENT, NOT A NICETY. A wide pitch range means the
	 overhanging facets render dark, and §1 forbids muted palettes while §9.10 makes desaturated
	 an automatic fail — V4 already failed a third of the map on exactly this. So any facet
	 pitched at or below -14 degrees takes one step LIGHTER than its height band. ]]
function CW.mass(
	kind: string,
	r: Random,
	anchor: Vector3,
	dir: Vector3,
	outward: Vector3,
	S: number, -- segment width along the run
	H: number, -- this segment's height (a saddle's is already reduced)
	runH: number, -- the RUN's base height, so a saddle can size against its neighbours
	D: number, -- segment depth (already multiplied)
	base: number, -- the run's ground line (sink), negative
	q: number, -- standoff: how far this mass steps inward of the seal
	toneOf: (number, number) -> Color3
)
	local function span(lo: number, hi: number): number
		return lo + r:NextNumber() * (hi - lo)
	end
	--[[ Place one facet, clipped against the dominance ceiling.

		 The clip holds the BASE and lowers the top, which is what "the mass grows from the
		 ground and is cut off at a height" means; shrinking around the centre would lift the
		 foot off the ground and leave daylight under it.

		 The first version had a `math.max(4, ...)` floor on the height and it FOUGHT the cap: a
		 hoodoo cap sitting on an already-clipped shaft had a base at the ceiling, so the floor
		 won and the cap finished 2.4 studs above it. Measured, not reasoned about — the build
		 printed a tallest cliff of 64.4 against a ceiling of 62. Here the floor is applied to
		 the base rather than to the height, so a part with no room simply is not placed. ]]
	local function put(name, shape, size: Vector3, centre: Vector3, yaw, pitch, roll)
		local base = centre.Y - size.Y / 2
		local top = math.min(centre.Y + size.Y / 2, CW.FACET_MAX_TOP)
		local h = top - base
		if h < 3 then
			return -- entirely above the ceiling; drawing it would breach the composition gate
		end
		local c = Vector3.new(centre.X, base + h / 2, centre.Z)
		CW.facet(fCliffs, name, shape, Vector3.new(size.X, h, size.Z), c, outward, yaw, pitch, roll, toneOf(c.Y, pitch))
	end

	if kind == "FIN" then
		--[[ Four wedges with the slope along the RUN, at descending heights, each advancing a
			 different amount. The old ramp cap's finding — put the slope in the skyline along
			 the run, not into the wall — is not lost with it: it became the default orientation
			 of every wedge in this vocabulary. ]]
		local ladder = { 34, -16, 12, -20 }
		local frac = { 1.00, 0.78, 0.58, 0.40 }
		local tall = r:NextInteger(1, 4)
		for n = 1, 4 do
			local w = S * span(0.28, 0.42)
			local dd = D * span(0.55, 0.95)
			local h = H * frac[n] * (if n == tall then 1.18 else 1.0)
			local at = anchor
				+ dir * (S * (-0.42 + 0.28 * (n - 1)))
				+ outward * -(q * (0.6 + 0.4 * r:NextNumber()))
				+ Vector3.new(0, base + h / 2, 0)
			-- Slope along the run: 90 degrees off the outward-facing default, alternating so
			-- the skyline zigzags instead of sawing one way.
			local yaw = (if n % 2 == 0 then 90 else -90) + span(-32, 32) * 0.35
			put("CliffFin", "wedge", Vector3.new(dd, h, w), at, yaw, ladder[n] + span(-6, 6), span(-16, 16))
		end
	elseif kind == "SCARP" then
		--[[ Three bedding planes, ROLLED so their top edges become parallel diagonals, plus a
			 wedge continuing the dip. This is the direct answer to "obvious horizontal course
			 repetition": the beds are still slabs — a bedding plane IS a slab — but they no
			 longer present horizontal edges. ]]
		local dipSign = if r:NextNumber() < 0.5 then 1 else -1
		local ladder = { 8, 20, 32 }
		local y = base
		for n = 1, 3 do
			local h = H * span(0.20, 0.30)
			local w = S * span(0.92, 1.06)
			local dd = D * span(0.5, 0.8)
			local at = anchor
				+ dir * (0.10 * S * (n - 2))
				+ outward * -(q * span(0.4, 1.0))
				+ Vector3.new(0, y + h / 2, 0)
			put("CliffBed", "block", Vector3.new(w, h, dd), at, span(-14, 14), ladder[n] + span(-5, 5), dipSign * (10 + 6 * n))
			y += h * 0.86
		end
		local ch = H * span(0.18, 0.28)
		local at = anchor + outward * -(q * 0.7) + Vector3.new(0, y + ch / 2, 0)
		put("CliffDip", "wedge", Vector3.new(D * 0.7, ch, S * 0.8), at, dipSign * 90, 24, dipSign * 14)
	elseif kind == "ALCOVE" then
		--[[ A genuine CONCAVE section, which is the one thing additive convex primitives cannot
			 fake and which §4 names explicitly. Two jambs yawed to face each other so the pocket
			 narrows outward, and an OVERHANGING lintel across them — the deepest shadow in the
			 frame, and a channel the old construction had no way to use at all. ]]
		for side = -1, 1, 2 do
			local w = S * 0.30
			local h = H * span(0.7, 0.95)
			local at = anchor
				+ dir * (side * S * span(0.24, 0.34))
				+ outward * -(q + D * 0.35)
				+ Vector3.new(0, base + h / 2, 0)
			put("CliffJamb", "wedge", Vector3.new(D * 0.7, h, w), at, -side * span(18, 30), span(6, 16), side * 10)
		end
		local lh = H * span(0.16, 0.24)
		local ly = base + H * span(0.6, 0.75)
		local at = anchor + outward * -(q + D * 0.2) + Vector3.new(0, ly + lh / 2, 0)
		put("CliffLintel", "block", Vector3.new(S * 0.78, lh, D * 0.6), at, span(-8, 8), -span(18, 26), span(-6, 6))
	elseif kind == "HOODOO" then
		--[[ Two shafts capped with CornerWedgeParts, so the skyline gets two genuine POINTS
			 rather than another ridge. A wall whose masses are all the same height is
			 repetitive whatever their shape, and this is the archetype that breaks the top
			 line. Its height is where the dominance ceiling actually binds. ]]
		for side = -1, 1, 2 do
			local w = S * span(0.16, 0.24)
			local dd = D * span(0.45, 0.65)
			local ch = H * span(0.14, 0.22)
			--[[ The cap's height is RESERVED before the shaft is sized, so the pair is clipped
				 once, at the top of the cap, rather than the shaft taking the whole ceiling and
				 leaving the cap nowhere legal to go. That was the actual defect behind the
				 64.4-stud reading. ]]
			local h = math.min(H * span(1.15, 1.55), CW.FACET_MAX_TOP - ch - base)
			local at = anchor
				+ dir * (side * S * span(0.20, 0.36))
				+ outward * -(q * span(0.5, 1.0))
				+ Vector3.new(0, base + h / 2, 0)
			put("CliffShaft", "block", Vector3.new(w, h, dd), at, side * span(20, 40), span(-8, 14), side * span(4, 12))

			local capAt = Vector3.new(at.X, at.Y + h / 2 + ch / 2, at.Z)
			put("CliffCap", "corner", Vector3.new(w * 1.25, ch, dd * 1.25), capAt, side * span(20, 40), 0, 0)
		end
		local sh = H * span(0.30, 0.40)
		local at = anchor + outward * -(q * 0.4) + Vector3.new(0, base + sh / 2, 0)
		put("CliffShoulder", "wedge", Vector3.new(D * 0.8, sh, S * 0.5), at, 90, span(26, 34), span(-10, 10))
	elseif kind == "BREACH" then
		--[[ The saddle's mass. Two wedges leaning toward each other over the sill, so the
			 skyline dips to a V rather than to a flat notch. Two parts, because a saddle is
			 meant to be the cheap segment.

			 SIZED AGAINST THE RUN, NOT AGAINST THE SADDLE'S OWN HEIGHT, and the first version
			 got this wrong in a way only the render showed. A saddle's `H` is already reduced
			 to 0.34-0.5 of the run, so 0.8-1.1 of it came out at 9-19 studs — BELOW the
			 saddle's own 16-stud sealing floor. The breach was completely hidden behind the
			 thing it was supposed to open, and the segment rendered as a bare 94-stud flat
			 panel. The whole point of a notch is that it reads against tall shoulders, so the
			 shoulders are sized off `runH`. ]]
		for side = -1, 1, 2 do
			local h = runH * span(0.55, 0.80)
			local at = anchor
				+ dir * (side * S * 0.32)
				+ outward * -(q * 0.5)
				+ Vector3.new(0, base + h / 2, 0)
			put("CliffBreach", "wedge", Vector3.new(D * 0.7, h, S * 0.36), at, -side * 90, span(14, 26), side * span(8, 18))
		end
	else -- TALUS
		--[[ Two wedges fanned in opposite slope directions at different standoffs, so one sits
			 behind the other. Pitched at the BRIGHT end of the range: this is the counterweight
			 that keeps the wall from going dark overall, and it is cheap, which is how the
			 expensive archetypes are paid for. ]]
		for n = 1, 2 do
			local w = S * span(0.4, 0.55)
			--[[ 0.72-1.0 rather than 0.42-0.62. Talus is conceptually a scree shoulder at the
				 foot of a taller face, but on this ring it IS the segment's visible mass, and
				 at 0.62 it finished below its own 0.72 seal — so the segment rendered as the
				 flat back plane with two small wedges at its foot. If it is the mass, it has
				 to be the height. ]]
			local h = H * span(0.72, 1.0)
			local dd = D * span(0.8, 1.1)
			local at = anchor
				+ dir * (S * span(-0.22, 0.22))
				+ outward * -(q * (if n == 1 then 0.5 else 1.1))
				+ Vector3.new(0, base + h / 2, 0)
			put("CliffTalus", "wedge", Vector3.new(dd, h, w), at, (if n == 1 then 90 else -90), span(26, 38), span(-14, 14))
		end
	end
end

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

	--[[ THE PRIVATE STREAM. Every parameter of the new wall geometry comes from here, never
		 from `rng`, so this whole construction costs the shared seeded stream exactly nothing
		 and the rest of the world is bit-identical to before it (F-32). The build prints a
		 stream fingerprint at the end; if it moves, this rule was broken.

		 Seeded from the run's own geometry rather than from a counter, so adding or removing a
		 `cliffRun` CALL cannot shift the seed of the runs after it. ]]
	local runSeed = math.floor(math.abs(from.X * 7919 + from.Z * 104729 + to.X * 31 + to.Z * 7) + 0.5)
	local r = Random.new(runSeed)
	local deck = CW.buildDeck(r, segments, o.deck or CW.DECK_ALL)
	local standoffMax = o.standoff or 0

	--[[ Tone by HEIGHT, not by course index — see CW.BAND. Resolved where the geometry
		 STANDS, which is the same rule `toneAt` below already enforces and for the same
		 measured reason: a mass offset along the run can cross the biome boundary. ]]
	local function toneAtY(y: number, pitch: number): Color3
		-- Biome is decided at the run's own line; a facet's lateral offset is far smaller than
		-- the standoff the old buttress had, and the run never spans the boundary.
		local set = biomeAt(from.X, (from.Z + to.Z) / 2).Cliff
		local band = math.clamp(math.floor(y / CW.BAND), 0, #set - 1)
		local idx = #set - band
		-- Counter-shading: an overhang renders dark, so it takes one step lighter. §1 forbids
		-- muted, §9.10 makes desaturated an automatic fail, and V4 already failed a third of
		-- the map this way.
		local tone = set[math.clamp(idx, 1, #set)]

		--[[ AND THEN THE FACET'S OWN PITCH IS BAKED INTO ITS ALBEDO, which is the change the
			 renders forced and the one the design plan did not anticipate.

			 The plan's whole thesis is that the old wall's faces sat inside an 11 % band of one
			 Lambert value, and that spreading their normals over -22..+38 degrees of pitch takes
			 that to 9.5x. The geometry now does exactly that — and the wall STILL rendered as a
			 flat panel, three captures in a row.

			 The reason is the one the plan flagged and then reasoned past: N·L is not the pixel.
			 This world runs OutdoorAmbient (146,152,158), Ambient (112,116,122) and
			 EnvironmentDiffuseScale 0.55 under Brightness 3, and that ambient floor compresses a
			 large N·L range into a small luminance range. A 9.5x geometric spread arrives as
			 something much flatter than 9.5x on screen.

			 So the variation goes where it cannot be compressed away: the surface colour. A
			 sun-facing facet takes a lighter step and an overhang a darker one, which is both
			 what the light would have done and what stratified rock actually looks like. This is
			 ordinary low-poly practice — bake the shading the renderer will not deliver — and
			 this file already does it everywhere else, from the biome tints to the crystal
			 shades.

			 The magnitude is bounded on purpose. §1 forbids muted palettes and §9.10 makes
			 desaturated an automatic fail; V4 already failed a third of the map that way. So the
			 darkest step is 0.16 rather than the 0.4 the raw Lambert ratio would suggest, which
			 is clearly faceted while keeping the deepest overhang a saturated rust rather than a
			 shadow. ]]
		local t = math.clamp((pitch + 22) / 60, 0, 1) -- -22 deg -> 0, +38 deg -> 1
		if t > 0.62 then
			return Palette.lift(tone, (t - 0.62) * 0.45)
		elseif t < 0.38 then
			return Palette.shade(tone, (0.38 - t) * 0.42)
		end
		return tone
	end

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

		--[[ THE BOULDER-MASS DECISION, AND ALL SEVEN OF ITS DRAWS, TAKEN UNCONDITIONALLY so the
			 run consumes the same stream either way.

			 Two or three curated rock meshes stand against the face instead of another slab.
			 They are an asset this world ALREADY uses, because a flat-shaded untextured mesh
			 takes the biome tint and a Cube-generated textured mesa cannot (F-13). Not on a
			 saddle — a saddle is a deliberate break and filling it removes the erosion it
			 expresses. Not on the inner spurs — their clearance is about a stud. ]]
		local modRoll = rng:NextNumber()
		local modU = rng:NextNumber()
		local modT = rng:NextNumber()
		local modYaw = rand(-22, 22) + (if chance(0.5) then 180 else 0)
		local modLat = rand(-0.20, 0.20)
		--[[ How far the module steps INWARD of its courses. Small on purpose: it
			 only has to stand in front of the sealing slab, and every stud of it
			 is a stud of cliff moving into the play area. ]]
		local modInset = rand(0.04, 0.20)
		--[[ Unlike the Cube modules this replaces, a boulder mass is NOT
			 meadow-only. The rock mesh is untextured and takes `biome.Tint`, so
			 the frost hollow gets the same silhouette relief in its own cool
			 stone instead of keeping a wall of plain slabs because the only
			 available geometry was the wrong colour. That was the honest limit
			 of the textured version and it is gone with it. ]]
		--[[ `height` is not in scope yet, so the run's own size is tested at the
			 placement below rather than here: this decision must be made from the
			 draws already taken so the stream is consumed identically either way. ]]
		--[[ 0.62. Raising it to 0.85 was tried and rejected: the arithmetic improved and the
			 pixels did not (F-19). ]]
		local useModule = (o.modules ~= false) and not saddle and modRoll < 0.62

		local height = baseHeight * (if saddle then rand(0.34, 0.5) else rand(0.88, 1.5))
		local courses = if saddle then 2 elseif useModule then 2 else rng:NextInteger(3, 4)
		local toneOffset = rng:NextInteger(0, 2)
		local depthMul = rand(0.78, 1.38)
		--[[ Sink the stack slightly. Every stack starting at y = 0 put every
			 segment's first seam at roughly the same height, and that shared
			 horizontal line is what the eye reads as a step. Downward only:
			 lifting a stack would leave daylight under it. ]]
		local y = -rand(0.4, 3.0)
		local sink = y -- the run's ground line, kept for the module's own base
		local setback = 0
		local topY, topCentre, topWidth, topDepth = 0, anchor, segWidth, depth
		local courseFraction = if saddle
			then { 0.62, 0.42 }
			elseif useModule then { 0.46, 0.34 }
			else { 0.46, 0.30, 0.22, 0.16 }

		for k = 1, courses do
			local h = height * courseFraction[k] * rand(0.78, 1.28)
			if k == 1 then
				--[[ THE SEAL HAS A FLOOR (F-36) AND IT IS ALSO THE WALL'S HEIGHT (F-39).

					 The floor: two multipliers stack on a saddle and the whole stack then SINKS, so the
					 worst-case seal top was 2.59 studs against a 7.15-stud jump — a full-width doorway
					 out of the world. 16 is comfortably past any unassisted jump.

					 The height: the seal kept `courseFraction[1]` = 0.46 from a construction where it
					 was the BOTTOM of a stack of courses. Those courses are gone, so on a low-archetype
					 segment nothing reached above it and the wall came out a 16-stud band. It is the
					 recessed BACK PLANE now, and a back plane is as tall as its wall.

					 Neither multiplier is a draw, so the stream is untouched. ]]
				--[[ AND IT IS ALSO THE WALL'S HEIGHT, which the first version of this rewrite got
					 wrong and the render caught.

					 The seal kept `courseFraction[1]` = 0.46 from the old construction, where it
					 was the BOTTOM of a stack of three or four courses that carried the wall to
					 30-50 studs. Those courses are gone. So on any segment whose archetype is a
					 low one — TALUS at 0.42-0.62 H, or a BREACH whose saddle H is only 11.6-17
					 — nothing reached above the seal and the wall came out a 16-stud band. The
					 meadow-wall capture showed a flat red fence, visibly worse than the stack it
					 replaced, and no metric in the pass said so.

					 The seal is meant to be the RECESSED BACK PLANE, seen through the gullies
					 between the forward masses. A back plane has to be as tall as the wall. So
					 it takes 0.72 of the segment height, and the masses stand in front of it.

					 A saddle keeps the low seal on purpose: 0.9 of a saddle's own smaller height,
					 floored at 16 studs (F-36), which is the dip the BREACH archetype opens over
					 without ever becoming a doorway.

					 Neither multiplier is a draw, so the stream is untouched. ]]
				h = math.max(h, SEAL_MIN_TOP - y, height * (if saddle then 0.85 else 0.62))
			end
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
			elseif useModule then
				--[[ THE CONNECTIVE COURSE. Under a module the upper courses stop
					 trying to be the silhouette — the mesh is the silhouette — and
					 do the job the authored geometry is genuinely better at:
					 running the full width of the segment so that the gap BETWEEN
					 two modules is filled mass rather than sky. Nearly no lateral
					 shift, for the same reason. ]]
				w = segWidth * rand(0.94, 1.02)
				lateral = rand(-0.05, 0.05) * segWidth
				dd = depth * depthMul * rand(0.6, 0.82)
				setback += depth * depthMul * rand(0.10, 0.20)
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
			--[[ BATTER — kept only as a DRAW. It leans a course back by 2.0-6.6 degrees, which is
				 the 11 % band the whole rewrite exists to escape; F-33 raised it and moved the
				 mean without moving the spread. Pitch now comes from a per-archetype ladder in
				 `cliffMass`. This still runs because removing a draw re-rolls the world. ]]
			local batter = if k == 1 then 0 else -rand(0.035, 0.115)
			-- lookAt puts the slab's Z along `outward`, so Size reads
			-- (width along the run, height, depth into the wall).
			local cf = CFrame.lookAt(centre, centre + outward)
				* CFrame.Angles(batter, math.rad(rand(-7, 7)), 0)

			--[[ ONLY THE SEAL IS DRAWN FROM THIS LOOP NOW.

				 The free courses k > 1 were the flat stacked boxes. Their DRAWS all still
				 happen — every `rand()` above and below runs exactly as it did — because this
				 builder runs off one seeded stream and removing a draw re-rolls the entire
				 world (F-32). What changed is only what is EMITTED: the visible mass is built
				 after this loop by `cliffMass`, from the run's private Random.

				 Keeping the draws in place rather than extracting them into a program table is
				 deliberate. The extraction is where the parity would be lost: the draw sequence
				 has three short-circuits in it — `o.saddles ~= false and chance(0.2)`, the
				 three-way `courses` branch, and `not saddle and not useModule and chance(0.55)`
				 — and any one of them transcribed wrongly is F-32 again, silently. Leaving the
				 code where it is cannot get it wrong.

				 The seal is now what it should always have been: not a face anybody looks at,
				 but the recessed back plane visible through the gullies between the forward
				 masses, which is what a real cliff's back wall does. It keeps its full width,
				 its overlap and its 16-stud floor (F-36). ]]
			if k == 1 then
				newPart(fCliffs, "CliffSeal", Vector3.new(w, h, dd), cf, toneAtY(centre.Y, 0), true)
			end

			--[[ WEATHERING CHAMFER — RETIRED, draws kept. It bevelled the 90-degree corner where a
				 course's vertical face met its horizontal top. There are no such corners left in
				 the vocabulary, so it was 29 parts softening an edge that no longer exists.
				 See F-39. ]]
			if k > 1 and not useModule then
				--[[ Sized to be SEEN. The first version was h * 0.30 on courses that turn out
					 to be about 4 studs tall — a 1.3-stud bevel, roughly one percent of the
					 image at playing distance, and it changed nothing. A chamfer that cannot
					 be measured in the render is not a chamfer, it is a part. ]]
				local cd = dd * 0.85
				local ch2 = h * 0.75
				local chamferAt = centre
					+ outward * (dd / 2 - cd / 2)
					+ Vector3.new(0, h / 2 + ch2 / 2, 0)
				--[[ RETIRED. The chamfer existed to soften a terrace corner, and there are no
					 terrace corners left: no facet in the new vocabulary meets its own top at
					 90 degrees with a horizontal ledge above it. It cost 29 parts to bevel an
					 edge that no longer exists.

					 Routed through `discard` rather than deleted so its draws survive. ]]
				CW.discard(
					fCliffs,
					"CliffChamfer",
					Vector3.new(w * 0.98, ch2, cd),
					CFrame.lookAt(chamferAt, chamferAt + outward),
					toneAt(centre, toneOffset + k)
				)
			end
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
		--[[ RAMP CAP — RETIRED, finding kept. Its lesson was that a slope reads in the skyline
			 when it runs ALONG the wall rather than into it, and that is now the default
			 orientation of every wedge in the vocabulary. See F-39. ]]
		--[[ Derived from the segment index, NOT from `chance()`.

			 This builder is deterministic from one seeded stream, so ADDING a random draw
			 here re-rolls every draw after it and rebuilds the whole world differently. The
			 first version of this change did exactly that: the trees, the props and the
			 landmark all moved, and the before/after screenshots stopped being a comparison
			 of one variable. A parity test costs no draw and leaves the rest of the world
			 byte-identical. See F-32. ]]
		local rampDir = if toneOffset % 2 == 0 then dir else -dir
		--[[ RETIRED, and its FINDING KEPT. The ramp cap proved that a slope reads in the
			 skyline when it runs ALONG the wall rather than into it. That is not lost with the
			 part: it became the default orientation of every wedge in the archetype vocabulary,
			 which is why FIN, BREACH and TALUS all yaw their wedges to 90 degrees off the
			 outward face. One cap on top of a stack has become the shape of the whole wall.

			 Routed through `discard` so its five draws survive. ]]
		CW.discard(
			fCliffs,
			"CliffRamp",
			Vector3.new(topDepth * rand(0.85, 1.05), ch, topWidth * rand(0.72, 0.98)),
			CFrame.lookAt(capCentre + Vector3.new(0, ch / 2, 0), capCentre + Vector3.new(0, ch / 2, 0) + rampDir)
				* CFrame.Angles(0, math.rad(rand(-12, 12)), 0),
			toneAt(capCentre, toneOffset + courses + 1)
		)

		-- A broken summit on the tall masses: two smaller slabs at their own yaw,
		-- so the top is a shattered crest instead of one ridge line. Not under a
		-- module: two extra slabs behind a mesa is the "more bricks" answer, and
		-- the mesa already has a broken summit modelled into it.
		if not saddle and not useModule and chance(0.55) then
			for k = 1, 2 do
				local sw = topWidth * rand(0.18, 0.34)
				local sh = height * rand(0.10, 0.22)
				local at = capCentre
					+ dir * rand(-topWidth * 0.32, topWidth * 0.32)
					+ inward * rand(0, topDepth * 0.35)
					+ Vector3.new(0, ch * 0.4 + sh / 2, 0)
				--[[ RETIRED. Folded into HOODOO and FIN, where the same shattered skyline comes
					 from the mass itself rather than from two slabs parked on top of it — which
					 is the "more bricks" answer §AK names as a hard failure. Draws kept. ]]
				CW.discard(
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
			--[[ RETIRED. FIN is the buttress, four times over and at four different pitches.
				 One compound silhouette per segment was the cheapest version of the right idea;
				 the archetype is the full one. Draws kept. ]]
			CW.discard(
				fCliffs,
				"CliffButtress",
				Vector3.new(bw, bh, bd),
				CFrame.lookAt(at, at + outward) * CFrame.Angles(0, math.rad(rand(-16, 16)), 0),
				toneAt(at, toneOffset + 2),
				true
			)
		end

		--[[ THE VISIBLE MASS, built from the run's PRIVATE stream.

			 Everything above this point consumed the shared seeded stream exactly as it always
			 did — the retired geometry still takes all of its draws through `discard` — and
			 everything below it (boulder masses, talus, planting, ledge rock) is unchanged. So
			 this call sits between them and costs the shared stream nothing.

			 A saddle always takes BREACH regardless of the deck, so the mesh-prop counts that
			 branch on `saddle` do not move. Everything else takes the next card. ]]
		local kind = if saddle then "BREACH" else deck[((i - 1) % #deck) + 1]
		local standoff = -6 + r:NextNumber() * (standoffMax + 6)
		CW.mass(kind, r, anchor, dir, outward, segWidth, height, baseHeight, depth * depthMul, sink, standoff, toneAtY)

		--[[ THE BOULDER MASS. Curated rock meshes at the `cliff` tier, clamped to this run's mass
			 height, stepped in by `modInset` and spread by `modLat` so the group reads as one
			 shouldered outcrop rather than three rocks in a row. ]]
		if useModule then
			local masses = if modT < 0.45 then 2 else 3
			for k = 1, masses do
				--[[ Deterministic offsets from the draws already taken, not new ones:
					 the segment's stream consumption must not depend on how many
					 masses it happened to want. ]]
				local spread = (k - (masses + 1) / 2) / masses
				local along = (modLat + spread * 0.72) * segWidth
				local at = anchor + dir * along + inward * (depth * depthMul * modInset)
				--[[ The first mass carries the silhouette at the full `cliff` tier
					 and the flankers span `tree`-to-`cliff`, so the group has a peak
					 instead of being three equal lumps. Expressed as named tiers
					 rather than a scale factor because PropCfg deliberately has no
					 scale factor — see the note on the type. ]]
				--[[ Scale is bound to THIS RUN's mass, not to the tier's top. The
					 `cliff` tier is 30-50 studs and the perimeter runs are not all
					 that tall, so a peak taken from the top of the tier on a short
					 run stands a boulder taller than the wall it is supposed to
					 belong to — which is how a mass stops reading as cliff and
					 starts reading as a dropped prop. A tall run gets the full
					 tier; anything shorter spans up into it from `tree` instead. ]]
				local tall = height >= 44
				prop(fCliffs, "cliff_rock", at.X, at.Z, {
					tier = if tall and k == 1 then "cliff" else "tree",
					tierTo = if tall and k == 1 then nil else "cliff",
					tilt = 7,
					anywhere = true,
					collide = true,
					groundY = sink,
					maxW = CLIFF_MASS_MAX_W,
				})
			end
		end

		--[[ Talus at the foot, on the inward face: mesh rock, not more slabs.

			 `cliff_rock`, not `rock`. Talus is debris that came off the wall two
			 studs behind it, so it takes the wall's tone; painted `stone` it came
			 out warm-neutral pale and a pair of near-white lumps against rust
			 read as two imported props parked at the cliff rather than as its
			 own rubble. Same meshes, same allowlist — only the biome role and the
			 tier differ, which is exactly the distinction the family encodes. ]]
		if o.talus ~= false then
			local n = rng:NextInteger(2, 3)
			for _ = 1, n do
				local along = rand(-segWidth * 0.46, segWidth * 0.46)
				local out = rand(0.18, 0.8) * depth
				local at = anchor + dir * along + inward * out
				prop(fRocks, "cliff_rock", at.X, at.Z, {
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
		-- where the old build put a painted ball; it is a rock mesh now. Skipped
		-- under a module, whose mass occupies that ledge.
		if not saddle and not useModule and chance(0.42) then
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

--[[ Outer ring: the world does not leak away.

	 STANDOFF, which is what makes the wall's plan meander instead of running as one straight
	 fence. The caps come from the clearances this file already documents rather than from
	 taste: the N/S runs face a meadow that reaches z = 210 against a wall at z = 252, so 42
	 studs, and 10 leaves 12.7 clear after a mass's own half-depth. The E/W runs face crystals
	 at x = +/-96 against a wall at x = +/-146, so 50 studs, and 18 leaves the same 12.7.

	 Asymmetric on purpose: the E/W walls are the ones the meadow-wall and frost-wall cameras
	 look straight at, so they get the deeper meander. ]]
local OUTER: { NS: CliffOpts, EW: CliffOpts } = { NS = { standoff = 10 }, EW = { standoff = 18 } }
cliffRun(
	Vector3.new(-WORLD_X - 6, 0, WORLD_Z_N),
	Vector3.new(WORLD_X + 6, 0, WORLD_Z_N),
	Vector3.new(0, 0, 1),
	84,
	34,
	28,
	OUTER_NS
)
cliffRun(
	Vector3.new(-WORLD_X - 6, 0, WORLD_Z_S),
	Vector3.new(WORLD_X + 6, 0, WORLD_Z_S),
	Vector3.new(0, 0, -1),
	84,
	34,
	28,
	OUTER_NS
)
cliffRun(Vector3.new(WORLD_X, 0, WORLD_Z_S), Vector3.new(WORLD_X, 0, WORLD_Z_N), Vector3.new(1, 0, 0), 84, 34, 28, OUTER.EW)
cliffRun(Vector3.new(-WORLD_X, 0, WORLD_Z_S), Vector3.new(-WORLD_X, 0, WORLD_Z_N), Vector3.new(-1, 0, 0), 84, 34, 28, OUTER.EW)

--[[ Inner spurs hug the hub so the clearing is enclosed rather than open on
	 four sides. Saddles are off here: a dip in a 72-stud spur beside the hub is
	 not read as erosion, it is read as a missing piece.

	 Boulder masses are off for the same class of reason, and it was measured
	 rather than assumed: a rock mesh is scaled by HEIGHT and its width follows
	 its own aspect, so a 30-stud mass off this shelf comes out 45-60 studs
	 across. Against the outer wall that is a shouldered outcrop; on a spur 64
	 studs from the monument it is a boulder standing in the approach, and the
	 hub camera came back with the landmark framed between two rust domes. The
	 enclosure here is the wall's job. Same rule as BUTTE below. ]]
--[[ The spur deck is restricted, and not out of caution. An ALCOVE is a feature of a WALL — a
	 pocket eroded into a long face — and a spur is a short shoulder beside the hub, so an
	 alcove here reads as a hole in a rock rather than as a recess in a cliff. HOODOO is
	 excluded for the reason the comment above already gives about boulder masses: a tall
	 pointed shaft 64 studs from the monument competes with it. ]]
local SPUR: CliffOpts = { saddles = false, modules = false, standoff = 4, deck = { "SCARP", "TALUS", "FIN" } }
cliffRun(Vector3.new(64, 0, -56), Vector3.new(64, 0, 16), Vector3.new(1, 0, 0), 40, 22, 20, SPUR)
cliffRun(Vector3.new(-64, 0, -56), Vector3.new(-64, 0, 16), Vector3.new(-1, 0, 0), 40, 22, 20, SPUR)
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

--[[ Free-standing buttes give each half a horizon of its own. They sit outside
	 the crystal bounds (x ±96) so they never swallow a spawn point, and that
	 clearance is TIGHT — the authored courses reach about x -95 at their
	 deepest. Cube modules are therefore off here: a module stands a few studs
	 inward of its courses and is as deep again, which is exactly enough to put a
	 mesa on top of a crystal spawn point. This is the invariant the comment
	 above has always claimed, and it is cheaper to keep it than to re-derive the
	 spawn field around a mesh. ]]
--[[ A butte is an isolated massif, not a wall, so it gets the archetypes that read as one
	 free-standing mass: fins, points and scree. No alcove and no scarp — a bedding plane needs
	 a run to bed along. Standoff 0 because its courses already reach x ~ -95 and there is no
	 clearance left to meander into. ]]
local BUTTE: CliffOpts = { saddles = false, modules = false, standoff = 0, deck = { "FIN", "HOODOO", "TALUS" } }
cliffRun(Vector3.new(-112, 0, 150), Vector3.new(-112, 0, 190), Vector3.new(-1, 0, 0), 44, 28, 24, BUTTE)
cliffRun(Vector3.new(114, 0, 100), Vector3.new(114, 0, 138), Vector3.new(1, 0, 0), 44, 26, 24, BUTTE)
cliffRun(Vector3.new(-116, 0, -158), Vector3.new(-116, 0, -198), Vector3.new(-1, 0, 0), 44, 27, 24, BUTTE)
cliffRun(Vector3.new(112, 0, -104), Vector3.new(112, 0, -140), Vector3.new(1, 0, 0), 44, 25, 24, BUTTE)

-- =========================================================================
-- 5. PRIMARY LANDMARK
-- =========================================================================
--[[ Named hard fail: "tall rectangular crystal columns on a stacked rectangular pedestal".
	 The crown is now a generated geode; the dais under it stays, because a stepped octagonal
	 drum of radial ashlar is a plinth. See docs/WORLD-BUILDER-HISTORY.md. ]]

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
		--[[ Ashlar ring: eight cut blocks laid TANGENTIALLY around the circle.

			 Two numbers here were wrong, and together they are why the owner's pixel
			 review saw a heap of rectangles from the very elevation the comment above
			 promised there wasn't one.

			 1. THE YAW WAS 90 DEGREES OUT. `CFrame.Angles(0, -ang, 0)` maps the
			    block's local +X — its CHORD axis — onto (cos ang, 0, sin ang), which
			    is the RADIAL direction. Every block was therefore laid as a plank
			    pointing straight out of the centre, and eight of them made a pinwheel
			    of spokes rather than a closed drum. Tangential yaw is -(ang + pi/2).

			 2. THE CHORD WAS MEASURED ON THE WRONG CIRCLE. It used the OUTER
			    `radius`, while the blocks stand on `rr = radius - dep/2`. At the
			    Glacier Heart's 23-stud tier that is a 20.1-stud chord placed on a
			    118-stud circumference: eight of them ask for 161 studs of arc, so
			    they overlapped and threw their corners out past one another.

			 Now measured on `rr`, and 1.06 rather than 1.14 — enough overlap to close
			 a mitre, not enough to balloon one. ]]
		--[[ INSCRIBED BY CORNER, NOT BY FACE. V3.

			 Putting the outer FACE on `radius` is the intuitive construction and it is wrong: a
			 chord's ends are further from the centre than its midpoint, so every block threw its
			 corners past its neighbour's face. Measured by the visual critic at `1.054 · R` —
			 a **1.2-stud sawtooth** all the way round the base tier, three tiers over, which is
			 most of why the plinth still read as loose blocks after F-14 fixed the pinwheel.

			 A regular polygon is defined the other way round: corners on the circumradius, faces
			 on the apothem `R·cos(π/n)`, edges `2R·sin(π/n)`. Built that way the corners land at
			 1.003 · R — a 0.07-stud sawtooth on the base tier instead of 1.2 — and the overlap
			 factor drops to 1.02, because at 1.06 it was compensating for a chord measured on
			 the wrong circle and would now re-introduce the very overshoot this removes. ]]
		local dep = radius * 0.36
		local apothem = radius * math.cos(math.pi / SIDES)
		local rr = apothem - dep / 2
		local chord = 2 * radius * math.sin(math.pi / SIDES) * 1.02
		--[[ Half a sector of twist per tier, so each step presents a FACE where the
			 tier below presents a CORNER. Without it all three tiers stack their
			 corners on one line and the drum reads as a single extruded prism. ]]
		local twist = (t - 1) * (math.pi / SIDES)
		for k = 1, SIDES do
			local ang = (k / SIDES) * math.pi * 2 + twist
			local at = Vector3.new(cx + math.cos(ang) * rr, top + h / 2, cz + math.sin(ang) * rr)
			newPart(
				parent,
				"DaisBlock",
				Vector3.new(chord, h, dep),
				CFrame.new(at) * CFrame.Angles(0, -(ang + math.pi / 2), 0),
				--[[ ONE TONE PER TIER, not one per block. The alternating `k % 2` lift painted a
					 light/dark stripe onto every individual box, so the eye could not fuse eight
					 blocks into one drum however well they met — it was counting them for you.
					 The tiers still differ from each other, which is where the banding §7 asks
					 for belongs: across courses, not around them. ]]
				tone
			)
		end
		top += h
	end
	-- Chamfer course on the crown: eight wedges falling outward off the top tier.
	local crown = tiers[#tiers]
	local cr = crown[1] :: number
	-- Same two corrections as the ashlar ring above: chord measured on the circle
	-- the wedges actually stand on, and tangential yaw rather than radial. The
	-- twist matches the crown tier's so the chamfer sits square on its own course.
	local rr = cr * math.cos(math.pi / SIDES) - cr * 0.14
	local chord = 2 * cr * math.sin(math.pi / SIDES) * 1.02
	local twist = (#tiers - 1) * (math.pi / SIDES)
	for k = 1, SIDES do
		local ang = (k / SIDES) * math.pi * 2 + twist
		local at = Vector3.new(cx + math.cos(ang) * rr, top + 0.9, cz + math.sin(ang) * rr)
		wedge(
			parent,
			"DaisChamfer",
			Vector3.new(chord * 0.92, 1.8, cr * 0.28),
			CFrame.new(at) * CFrame.Angles(0, -(ang + math.pi / 2), 0),
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
	--[[ The upper two tiers were 21 and 15.5, which put a 31-stud crown under a
		 48-stud mesh: the monument read as a mushroom, cap overhanging stem, in
		 the one shot the whole map is composed around. Widened so the crown is
		 wider than the crown MESH; the base stays at 27 because the crystal
		 collar stands at r = 30 and the dais must not reach it. ]]
	--[[ TALLER AS WELL AS WIDER-CROWNED, and the two go together.

		 The crown was 15.5 in radius under a 48-stud mesh, so the monument read
		 as a mushroom — wide cap, narrow stem — in the one shot the whole map is
		 composed around. Widening the crown alone was not enough, because the
		 mesh's own rocky base is a broad smooth dome and any of it left standing
		 proud of the plinth reads as the cap.

		 So the plinth is tall enough to SWALLOW that dome: 21 studs of masonry
		 against the previous 14.4, with the geode bedded 16 into it (below). Only
		 the crystals rise out of the stone, which is the silhouette the asset was
		 prompted for. The base stays at 27 in radius because the crystal collar
		 stands at r = 30 and the dais must not reach it. ]]
	{ { 27, 8.0 }, { 23.5, 7.0 }, { 20.5, 6.0 } },
	{ W.CliffC, W.CliffB, W.CliffA }
)

--[[ THE CROWN IS A MESH. The named hard fail was "tall rectangular crystal columns on a
	 stacked rectangular pedestal … still resembles a primitive blockout", and the answer is a
	 Cube-generated geode: one silhouette, every shard growing from one rocky base. It is the
	 one generated mesh that survived contact with the world, because its texture already
	 happened to be in this palette. See docs/WORLD-BUILDER-HISTORY.md. ]]

local GEODE_TARGET_H = 74 -- studs of finished height, inside the `landmark` tier
--[[ How far the mesh sinks into the plinth. Raised with the plinth's own height
	 so the two move together: the monument's TOP is `plinthTop - GEODE_BED +
	 GEODE_TARGET_H`, and the build prints the achieved figure and the live
	 dominance ratio, so getting this pair wrong is loud rather than silent. ]]
local GEODE_BED = 16
--[[ Measured against the tier the mesh actually STANDS ON, which is the crown,
	 not the base. This was 48 and it was checked against the bottom tier's 27
	 radius; the crown is a different number and the render showed it — a 48-wide
	 cap on a 31-wide top step is a mushroom, and it was the primary landmark in
	 the primary shot.

	 40 across is 20 in radius, inside the widened crown's 20.5, so every
	 elevation shows plinth wider than crown. It also keeps the bounding box well
	 clear of z = 44 where the north road begins — the road's SIGHTLINE, not
	 walkability: the geode's underside sits 14 studs up and a player passes
	 beneath it.

	 The narrower cap is paid for in vertical stretch, 1.29 to 1.55, still inside
	 the 1.7 licence. It buys a 68 x 40 monument instead of a 68 x 48 one, which
	 is a better proportion for a spire-shaped thing on its own account. ]]
local GEODE_MAX_W = 40
local GEODE_MAX_STRETCH = 1.7
assert(
	GEODE_TARGET_H >= TIERS.landmark[1] and GEODE_TARGET_H <= TIERS.landmark[2],
	"[Crystal Canyon] the monument must be sized inside the landmark tier"
)

-- Fixed fraction, not a draw: the palette-missing build must lay out identically.
local geode = cubeDraw("landmark", 0.5)
if geode then
	--[[ Bedded 16 studs — nearly the whole depth of the plinth — rather than
		 balanced on it. At 3 the geode's rocky base stood proud of the masonry
		 and the monument read as a mushroom; buried to here, the stone carries
		 the mass and the crystals grow out of it. The dais core is solid, so what
		 is bedded is simply inside opaque geometry. ]]
	cubePlace(
		fLandmark,
		geode,
		"landmark",
		LANDMARK.X,
		LANDMARK.Z,
		plinthTop - GEODE_BED,
		GEODE_TARGET_H,
		CFrame.Angles(0, math.rad(22), 0),
		true,
		{ maxW = GEODE_MAX_W, maxStretch = GEODE_MAX_STRETCH }
	)
else
	--[[ THE AUTHORED SPIRE, kept as the palette-missing fallback and nothing
		 else. It is the rejected crown; it stands only when the world is already
		 the degraded build the summary warns about, and it is better than an
		 empty plinth. Consumes no rng, so the layout is unchanged either way. ]]
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
	-- The point. Narrow, and taller than a level, so the shaft resolves rather
	-- than stopping.
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
end

--[[ THE COLLAR: six crystals leaning outward off the dais foot.

	 They were twelve authored boxes — a wide base and a narrower head at a
	 further lean — and at eye level a leaning box beside a blockout crown is
	 part of the same read the owner rejected. They are the cyan Cube collectible
	 mesh now, which is the same crystal the player picks up in this zone, so the
	 monument states what the game is about instead of describing it.

	 The radius moved out from 15 to 30. The geode's footprint is capped at 48
	 studs across; a collar at 15 would be standing inside it.

	 What is lost, and it is worth naming: the old ring alternated the two zone
	 hues, cyan for the meadow and violet for the frost, which made the monument
	 a legend for the map. A Cube mesh is textured and cannot be tinted violet,
	 so that read goes. The geode itself carries cyan and violet in its own art,
	 which is a weaker version of the same idea; the trade is a mesh crown and a
	 mesh collar against a two-colour key, and the rejection was about geometry.

	 Sizes and angles are AUTHORED per index rather than drawn. Nothing in this
	 block touches the rng, so the palette-missing build below lays out exactly
	 as this one does. ]]
local COLLAR_H = { 17, 12, 15, 11, 18, 13 }
local collarPlaced = 0
for i = 1, 6 do
	local ang = (i / 6) * math.pi * 2
	local r = 30
	local shard = cubeDraw("crystal_cube", (i - 0.5) / 6)
	if shard then
		cubePlace(
			fLandmark,
			shard,
			"crystal_cube",
			LANDMARK.X + math.cos(ang) * r,
			LANDMARK.Z + math.sin(ang) * r,
			-- Ground, not plinth: r = 30 is outside the bottom tier's 27, so
			-- there is no masonry under these. Sunk half a stud below the hub
			-- sand so they break OUT of the ground rather than stand on it.
			0.0,
			COLLAR_H[i],
			CFrame.Angles(math.sin(ang) * 0.24, ang, -math.cos(ang) * 0.24),
			true,
			nil,
			biomeAt(LANDMARK.X + math.cos(ang) * r, LANDMARK.Z + math.sin(ang) * r).Tint.crystal
		)
		collarPlaced += 1
	end
end

if collarPlaced == 0 then
	-- Fallback collar: the authored two-box shards, at the old radius and with
	-- the two-hue legend they always carried.
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
end

-- Six motes orbiting the monument, well above eye line. Small on purpose: the
-- review's floating-geometry complaint is about things that block a player-eye
-- view, and these sit high around the one object the composition is built to
-- draw the eye to. The orbit moved out from 19 to 36 and up: the geode's
-- footprint is capped at 52 studs across, so the old radius is inside the mesh.
for i = 1, 6 do
	local ang = (i / 6) * math.pi * 2
	local r = 36
	local at = Vector3.new(
		LANDMARK.X + math.cos(ang) * r,
		plinthTop + 44 + math.sin(ang * 2) * 6,
		LANDMARK.Z + math.sin(ang) * r
	)
	local m = box(fLandmark, "Mote", Vector3.new(2.2, 2.2, 2.2), at, P.Sell, 45, false)
	--[[ A YAW ALONE IS NOT A DIAMOND. Rotated only about Y, a cube keeps its top
		 and bottom faces horizontal, so from a camera at monument height it still
		 presents a flat square lid — which is why these read in review as six gold
		 BOXES parked in the sky, the "floating geometry with no visual purpose"
		 failure, rather than as motes. Tilting on all three axes turns a CORNER
		 toward the viewer from any angle, and a corner-on cube is an octahedral
		 silhouette.

		 Material stays SmoothPlastic. This world is single-material by decision —
		 §7 wants flat-shaded low-poly and §9.10 fails a realistic material — and a
		 Neon mote would be the only glowing object on the map, which is exactly
		 the "meaningless neon" §AQ rules out. The lightness comes from being small
		 and part-transparent instead, and the shadow is dropped because a hard
		 shadow cast by a speck of drifting light is what makes it read as a solid. ]]
	m.CFrame = CFrame.new(at) * CFrame.Angles(math.rad(35), math.rad(45), math.rad(30))
	m.Transparency = 0.28
	m.CastShadow = false
end

-- The palette apron: raw crystal and rock breaking out of the dais foot, so the
-- monument looks like it emerged from the ground rather than being dropped on
-- it. Small and low, never taller than the bottom tier. The inner radius moved
-- out from 24 for two reasons: the geode overhangs the dais to a 24-stud radius
-- and anything closer stands inside it, and the crystal collar now occupies 30.
for i = 1, 10 do
	local ang = rand(0, math.pi * 2)
	local r = rand(33, 42)
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

--[[ THE SPAWN IS DRESSED LIKE A PAD, BECAUSE IT IS THE FIRST THING ANYONE SEES. V2.

	 It used to be a bare `SpawnLocation` — a cream 20×20 square, no outline, no bevel, sitting
	 1.5 studs proud of the sand — on a single ∅26 ring. The square's half-diagonal is 14.14
	 against the ring's 13, so its four corners projected 1.14 studs past the ring and read as
	 four black crescent lobes: a rendering fault, in the highest-traffic 20×20 studs in the
	 game. §9's automatic-fail list names an undressed default `Frame` for UI; this was the
	 world-geometry equivalent.

	 Two changes. The square is 16×16, whose 11.3 half-diagonal sits comfortably INSIDE the
	 ring, so no corner can escape it again at any ring size. And it gets the halo/ring stack
	 `buildPad` gives every other floor marker, so the outline rule §2 applies here too. ]]
disc(fGround, "SpawnHalo", 15.5, 0.6, SPAWN.X, SPAWN.Z, 0.64, Palette.Outline.Color)
disc(fGround, "SpawnRing", 14, 0.7, SPAWN.X, SPAWN.Z, 0.70, Palette.shade(W.Sand, 0.32))
disc(fGround, "SpawnEdge", 11.5, 0.8, SPAWN.X, SPAWN.Z, 0.75, Palette.Outline.Color)
local spawn = Instance.new("SpawnLocation")
spawn.Name = "Spawn"
spawn.Size = Vector3.new(16, 1.2, 16)
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
--[[ LIFTED CLEAR OF THE GATE'S OWN LINTEL. V1.
	 At a lift of 30 the label's centre sat at Y 46, spanning 41.5–50.5 — and the Lintel spans
	 37.5–44.5 at the SAME Z with `AlwaysOnTop = false`, so the gate occluded its own sign. The
	 visual critic raycast 27 points across the label face from a third-person camera and found
	 it 67% occluded at 56 studs and **100% occluded from 36 studs all the way in**. It renders
	 perfectly from directly overhead, which is how it passed review.

	 Nothing in the gate reaches above the Lintel's 44.5, so a lift of 40 — centre 56, bottom
	 51.5 — clears every part by 7 studs, and does so by height rather than by a world-space
	 nudge toward the player, which would only be correct for a gate facing this way.

	 The approach angle is not made worse: 42° at 56 studs against the 41° it had before. ]]
billboard(barrier, `{frost.Name} — {Util.comma(frost.UnlockCost)} COINS`, P.Gate, 46, 9, 40)

-- =========================================================================
-- 9. GUIDANCE LANGUAGE
-- =========================================================================
--[[ HARD FAIL: "long green slabs cross the world at player eye height." The hedges were
	 solid extruded boxes. They are now planted runs of curated foliage with gaps a player can
	 see through. See docs/WORLD-BUILDER-HISTORY.md. ]]

local ROAD_TOP = 0.35

--[[ One chevron, painted on the road, pointing along dirZ. The two arms meet at
	 a vertex; each arm is yawed ±32°, and the ±3.7 stud lateral offset is what
	 puts their inner ends at x = 0 so the vertex closes. ]]
local function chevron(z: number, dirZ: number, tone: Color3)
	--[[ SIZED DOWN from arm = 14, width = 3.4 after the frost canonical camera
		 showed the result. The device is right — painted, grounded, cannot become
		 floating geometry — but at 14 studs of arm on a 24-stud road two chevrons
		 spanned nearly the whole corridor, and from a camera standing ON the road
		 they filled the lower half of frame. A route marking that large stops
		 reading as terrain and starts reading as a debug overlay drawn over the
		 game, which is a cousin of the failure this section already fixed once.

		 The CONTRAST is deliberately left alone. The guide hue is measured against
		 the surface it is painted on — 255 on IcePath against a 170 benchmark —
		 and dimming it to reduce prominence would attack the one property that
		 keeps the route legible. Area is the free variable here; contrast is not. ]]
	local arm = 9.5
	local yaw = 32
	local dx = (arm / 2) * math.sin(math.rad(yaw))
	local dz = (arm / 2) * math.cos(math.rad(yaw)) * dirZ
	for _, side in { -1, 1 } do
		newPart(
			fSigns,
			"PathChevron",
			Vector3.new(2.6, 0.3, arm),
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

--[[ GRASS IS GROUND CLUTTER AND HAS TO MEASURE LIKE IT.

	 The previous blade was `rand(3.2, 5.4) * s` studs tall with `s` up to 1.7 —
	 so up to NINE studs, against a Roblox character of about five. Standing on
	 the main road at eye height, the nearest tufts filled a third of the frame
	 and read as pale crystal shards flanking the path; nothing about them said
	 grass. That is the same "props disagree strongly in scale" failure the tier
	 table exists to prevent, in the one system that predates it and never got
	 converted.

	 The blade is now sized from the `small` tier — ground clutter you step over —
	 which is what grass is, and it is capped so no multiplier a caller passes can
	 push it back to player height.

	 The pale variant was also lifted 0.42 toward white, which on the canyon's
	 foliage green produced a near-white sage that shared no hue with the ground
	 it grows out of. Highlight and shadow are now both derived from the biome
	 foliage at much smaller separation, so a clump reads as one plant with light
	 on it rather than as two different materials interleaved. ]]
local TUFT_TIER = TIERS.small

local function tuft(x: number, z: number, s: number)
	local biome = biomeAt(x, z)
	local bright = Palette.lift(biome.Tint.foliage, if biome.Snow then 0.16 else 0.20)
	local deep = Palette.shade(biome.Tint.foliage, 0.20)
	local y = groundTop(x, z)
	local blades = rng:NextInteger(3, 4)
	local base = rand(0, math.pi * 2)
	local prev = currentBucket
	currentBucket = "detail"
	for k = 1, blades do
		local ang = base + (k / blades) * math.pi * 2
		-- `s` still varies a clump against its neighbours; the clamp is what stops
		-- it from varying grass into scenery.
		local h = math.clamp(rand(TUFT_TIER[1], TUFT_TIER[2]) * s, TUFT_TIER[1] * 0.7, TUFT_TIER[2])
		local w = 0.62 * s
		local cf = CFrame.new(x + math.cos(ang) * w, y + h / 2, z + math.sin(ang) * w)
			* CFrame.Angles(math.sin(ang) * 0.42, ang, -math.cos(ang) * 0.42)
		newPart(tuftGroup, "Tuft", Vector3.new(w, h, w), cf, if k % 2 == 0 then bright else deep, false)
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
labelledSign(gatewayGroup, -PATH_HALF - 7, 47, "CRYSTAL CANYON", { tier = "player", anywhere = true })
labelledSign(gatewayGroup, PATH_HALF + 8, 62, "THIS WAY", { tier = "player", anywhere = true })

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
--[[ Three Cube collectibles set into the head of the fan. The outcrop is the
	 meadow's resource formation and the Cube crystal is the meadow's
	 collectible, so this is the one place the two can be the same object.

	 This mesh used to be cyan-and-only-cyan, and the note here read "NOT used in
	 the frost veins, where the zone's crystal is violet and cannot be painted
	 onto a texture". That restriction is gone: `crystal_cube` is on the DETEXTURE
	 list, so the clone arrives untextured and takes whatever crystal tint the
	 biome under it declares. The mesh is now warm here and violet in the frost,
	 and it is the same accepted silhouette in both.

	 Authored heights and angles, no rng: a Cube family that fails to load must
	 not shift the tufts below it. ]]
for i, spot in { { -6, 4, 11 }, { 3, 7, 14 }, { 9, -2, 9 } } do
	local dx, dz, h = spot[1] :: number, spot[2] :: number, spot[3] :: number
	local shard = cubeDraw("crystal_cube", (i - 0.5) / 3)
	if shard then
		cubePlace(
			outcrop,
			shard,
			"crystal_cube",
			OUT_X + dx,
			OUT_Z + dz,
			5.0 + i * 0.6,
			h,
			CFrame.Angles(math.rad(9 * i), math.rad(37 * i), math.rad(-7 * i)),
			-- Collides, like the fan crystals beside them: this file's rule is
			-- that anything finishing at 9 studs or more is walked into, and
			-- these are 9 to 14.
			true,
			nil,
			biomeAt(OUT_X + dx, OUT_Z + dz).Tint.crystal
		)
	end
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

labelledSign(camp, CAMP_X + 2, CAMP_Z + 12, "PROSPECTOR'S CAMP", { tier = "player", anywhere = true })

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
	labelledSign(post, px + 14, pz + 14, "TRADING POST", { tier = "player", anywhere = true })
	fenceRun(post, px + 26, pz + 12, 2, -26, 3)
	prop(post, "bush", px - 14, pz + 15, { tier = "player", collide = false, anywhere = true })
	prop(post, "bush", px + 24, pz + 16, { tier = "player", collide = false, anywhere = true })
	prop(post, "rock", px + 27, pz - 14, { tier = "small", tierTo = "player", tilt = 18, anywhere = true })
end

--[[ THE UPGRADE KIOSK, AND IT IS NOW AN ACTUAL KIOSK.

	 The pad has always been described in this file as "a kiosk you walk past"
	 (§8) and there has never been a kiosk: there was a signpost, two crates and
	 a fence standing in for one, because the palette had no stall in it and
	 `kiosk` was one of the five families the Creator Store search came back
	 empty on. The accepted Cube generation — wooden stall, striped awning,
	 counter — is that missing family, and this is the one place in the map where
	 a shop counter is the literal correct object.

	 It stands BEHIND the pad on the axis away from the road, so the player walks
	 up to the disc with the stall facing them and nothing between. The rest of
	 the dressing moved outward to clear its footprint rather than being deleted:
	 a stall with a crate stack and a fence behind it is a business, a stall on
	 bare grass is a prop.

	 Zero rng: position, facing and height are all authored, so the layout is
	 identical when GolemPalette is missing and the pad simply keeps the dressing
	 it had before. ]]
local kiosk = folder("UpgradeKiosk", fStory)
do
	local px, pz = UPGRADE_PAD.X, UPGRADE_PAD.Y
	local KX, KZ = px - 18, pz

	local stall = cubeDraw("kiosk", 0.5)
	if stall then
		--[[ `lookAt` aims the mesh's LookVector at the pad, which is the same
			 convention the SpawnLocation uses to face the monument. If the
			 generation turns out to have been authored counter-to-+Z rather than
			 counter-to-LookVector, the correction is one term on this line and
			 nothing else in the build moves. 10.5 studs is roughly two players:
			 a market stall you walk up to, not a building. ]]
		cubePlace(
			kiosk,
			stall,
			"kiosk",
			KX,
			KZ,
			groundTop(KX, KZ),
			10.5,
			CFrame.lookAt(Vector3.zero, Vector3.new(px - KX, 0, pz - KZ).Unit),
			true
		)
	end

	labelledSign(kiosk, px - 5, pz + 16, "UPGRADE KIOSK", { tier = "player", anywhere = true })
	local h1 = prop(kiosk, "crate", px - 21, pz - 14, { tier = "small", tierTo = "player", anywhere = true })
	prop(kiosk, "crate", px - 21.5, pz - 13.4, {
		tier = "small",
		groundY = groundTop(px - 21, pz - 14) + h1,
		anywhere = true,
	})
	fenceRun(kiosk, px - 32, pz + 16, 4, -26, 2)
	prop(kiosk, "bush", px - 8, pz + 20, { tier = "player", collide = false, anywhere = true })
	prop(kiosk, "rock", px - 27, pz + 10, { tier = "small", tierTo = "player", tilt = 18, anywhere = true })
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
--[[ The zone the first review called visibly empty and the second called contaminated. It is
	 dressed from the frost biome bible only, and the density is measured against the meadow
	 rather than guessed. See docs/WORLD-BUILDER-HISTORY.md. ]]

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
--[[ The frost zone's payoff, square on the road's axis past the end of the path, so the walk
	 south terminates in something rather than in more snow. See
	 docs/WORLD-BUILDER-HISTORY.md. ]]
local heart = folder("GlacierHeart", fSecondary)
local GH_X, GH_Z = GLACIER.X, GLACIER.Y

local ghTop = stoneDais(
	heart,
	GH_X,
	GH_Z,
	0.4,
	--[[ TALLER AND DARKER, so the payoff reads as one.

		 The frost camera kept reporting the same thing: the Heart is legible and it
		 is not a PAYOFF — a modest cluster in the middle distance. The cause is not
		 size, it is CONTRAST. The crown tier was FrostDeep (168,206,228) standing on
		 snow at (242,250,255): a pale plinth on a pale field, so the formation had
		 no base to rise from and the violet crystals floated on nothing.

		 Now the whole dais sits in the dark end of the ice ramp, and the crown is
		 the darkest course rather than the lightest. That gives the crystals a mass
		 to stand on and the silhouette an edge against snow, which is what makes a
		 landmark read at distance — the monument gets the same service for free
		 from the rust canyon behind it.

		 Raised 12.6 -> 14.4 studs. Deliberately small: the composition gate divides
		 the monument's height by the SECOND tallest thing, so a Heart that grows
		 into second place starts eating the monument's dominance. At ~52 finished
		 it is still under the 59.5 currently holding second, and the DOMINANCE line
		 in the build report is what will say so if that ever stops being true. ]]
	{ { 25, 5.4 }, { 19, 4.8 }, { 13.5, 4.2 } },
	{ W.IcePathDark, W.IcePath, W.IcePathDark }
)

--[[ THE CORE IS CRYSTAL, NOT MASONRY.

	 This was seven boxes — two levels of three rotated cubes, plus a cap — and
	 the comment on them called them "three faceted shafts". A rotated cube has no
	 facets. The owner's pixel review named this object as the one that still
	 reads as a prototype, and it was right: from the road at eye height it is a
	 stack of rectangles wearing a crystal's colour.

	 It is now built from the same curated crystal meshes as the rest of the
	 world. Those only became available to this biome when `crystal` joined
	 DETEXTURE — before that the frost tintable pool was EMPTY, so a crystal
	 asked for here would have fallen back to precisely the boxes this replaces.
	 That is the whole reason this section was masonry in the first place.

	 The silhouette rule in the header above still holds, and is now carried by
	 SHAPE rather than by box count: the monument is a tall, narrow spire cluster;
	 this is a BLUNT RADIAL BURST — one stout centre with a fan leaning out around
	 it, wide exactly where the monument is narrow. "A smaller copy" is still
	 refused. It is simply refused in crystal now.

	 If the palette is absent, `prop` falls back to authored bodies on the same
	 rng draws, so the no-palette build still stands something here. ]]
prop(heart, "crystal", GH_X, GH_Z, {
	tier = "cliff",
	maxW = 21,
	tilt = 4,
	groundY = ghTop - 1.5,
	anywhere = true,
	collide = true,
})
for i = 1, 5 do
	local ang = (i / 5) * math.pi * 2 + 0.4
	local r = 8.5
	prop(heart, "crystal", GH_X + math.cos(ang) * r, GH_Z + math.sin(ang) * r, {
		tier = if i % 2 == 0 then "large" else "sapling",
		maxW = 13,
		tilt = 27,
		groundY = ghTop - 1.0,
		anywhere = true,
		collide = true,
	})
end

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

--[[ THE MONUMENT'S DOMINANCE, MEASURED RATHER THAN INTENDED.

	 The composition gate fails below 1.25 (tallest vertical ÷ second tallest),
	 and this revision changed both halves of that ratio at once: the monument's
	 crown became a mesh whose height depends on the source mesh's proportions,
	 and the canyon wall gained mesas up to the top of the `cliff` tier. Neither
	 is a number this file can assert from a comment any more, so both are read
	 back off the geometry that actually got built. Rotation is ignored, the same
	 approximation `track()` makes: this is a sanity check on a skyline, not a
	 physics-accurate AABB. ]]
local function topOf(root: Instance): number
	local m = -math.huge
	for _, d in root:GetDescendants() do
		if d:IsA("BasePart") then
			m = math.max(m, d.Position.Y + d.Size.Y / 2)
		end
	end
	return m
end

-- =========================================================================
-- 15. THE APRON — the answer to "the whole play space is one flat slab"
-- =========================================================================
--[[ V8, and the owner's §2: the play space is one 332 x 4 x 553 block of grass with everything
	 standing on it. From the overlook camera the world reads as a tabletop diorama.

	 WHY AN APRON AND NOT A HEIGHT FIELD OVER THE WHOLE WORLD. Making `groundTop(x, z)`
	 continuous and re-datuming everything was designed and rejected on two grounds, both
	 verified in this codebase rather than guessed:

	   * `Collect.farEnough` compares crystal candidates in 3-D (`d:Dot(d)` on a Vector3). Today
	     every candidate shares y = 6.4 so it behaves 2-D; give the ground relief and Y varies,
	     rejection outcomes change, the number of `NextNumber` draws changes, and the whole
	     34-crystal layout silently re-rolls. F-32 arriving through a rejection loop rather than
	     through a draw site.
	   * Reconciling a continuous field with collision geometry needs a run-length encoder whose
	     cell boundaries do not line up with the field's own discontinuities, so field and
	     collision disagree by a few studs — a player standing in the air.

	 So the relief goes where it can be built as ordinary geometry and checked by looking: an
	 apron of terraces rising from the meadow floor to the foot of the walls. It does the one
	 thing a wall-only change cannot — the wall stops being a fence on a plane and becomes the
	 top of a slope.

	 Built AFTER every prop is placed, and it re-seats what it swallows (below). A post-pass
	 takes no draws, so the fingerprint still matches the flat build.

	 The collection field stays flat: §2 is explicit that navigation stays obvious and this is a
	 simulator, not an obby. ]]
--[[ A FUNCTION, not a `do` block, and the difference is not style. Luau allots 200 local
	 registers per FUNCTION; a `do` block shares the enclosing chunk's, and this file is at that
	 ceiling too (see the note on `CW`). Wrapping this section in a function gives it its own
	 200. It is called immediately and returns nothing. ]]
;(function()
	local fApron = folder("Apron")
	currentBucket = "authored"

	--[[ Where the apron starts, per side. Inside these bounds the world is exactly as flat as it
		 was, so the crystal AABBs (meadow |x| <= 96 / z 60..210, frost z -215..-70) and every
		 pad, path and gate keep the ground they were placed on. ]]
	local INNER_X, INNER_ZN, INNER_ZS = 100, 214, -220
	local OUTER_X, OUTER_ZN, OUTER_ZS = 146, 252, -255
	local STEP = 5.5 -- terrace rise, well under a 7.15-stud jump so every edge is steppable
	local TERRACES = 3

	--- How far out of the play area a point is, as 0..1 across the apron band.
	local function outness(x: number, z: number): number
		local ax = math.max(0, (math.abs(x) - INNER_X) / (OUTER_X - INNER_X))
		local az = 0
		if z > INNER_ZN then
			az = (z - INNER_ZN) / (OUTER_ZN - INNER_ZN)
		elseif z < INNER_ZS then
			az = (INNER_ZS - z) / (INNER_ZS - OUTER_ZS)
		end
		return math.clamp(math.max(ax, az), 0, 1)
	end

	--- The apron's surface height at a point. Stepped, so it reads as terraces rather than a hill.
	local function apronTop(x: number, z: number): number
		local t = outness(x, z)
		if t <= 0 then
			return 0
		end
		return math.min(TERRACES, math.ceil(t * TERRACES)) * STEP
	end

	--[[ RAMPS. Four of them, one per side, on the axis the player actually walks: the meadow
		 corridor runs north up x = 0 and the frost road runs south down x = 0, so those two are
		 on the path. The east and west ramps sit at z = 130 and z = -140, which is where the
		 collection loop turns.

		 A ramp is a gap in the terrace edges plus a wedge, so the apron is reachable on foot
		 without a jump anywhere. §2: keep navigation obvious. ]]
	local RAMPS = {
		{ x = 0, z = 1, at = 0 }, -- north, up the meadow corridor
		{ x = 0, z = -1, at = 0 }, -- south, down the frost road
		{ x = -1, z = 0, at = 130 },
		{ x = 1, z = 0, at = -140 },
	}
	local RAMP_HALF = 16 -- half-width of a ramp

	--[[ Build one terrace as a ring of slabs. Blocks rather than a single hollow shape because
		 this world is flat-shaded primitives and a terrace edge catching light differently from
		 its deck is the whole point — the same reason the wall rewrite exists. ]]
	--[[ 92 rather than 46. A terrace is a plain ring and long slabs read identically to short
		 ones from any camera, so the shorter version was buying nothing and spending ~50
		 primitives — which matters when the whole claim of gate 2 is being materially under the
		 608-part blockout. ]]
	local SLAB = 92
	local function bench(level: number)
		local h = level * STEP
		local prev = (level - 1) * STEP
		-- The inner edge of THIS terrace, interpolated from the level.
		local fx = INNER_X + (OUTER_X - INNER_X) * ((level - 1) / TERRACES)
		local fzn = INNER_ZN + (OUTER_ZN - INNER_ZN) * ((level - 1) / TERRACES)
		local fzs = INNER_ZS + (OUTER_ZS - INNER_ZS) * ((level - 1) / TERRACES)
		local tint = biomeAt(0, 0).Cliff

		local function slab(cx: number, cz: number, sx: number, sz: number, biomeZ: number)
			--[[ NO GAPS. The first version cut a hole in each terrace where a ramp crosses, and
				 the holes were cut at SLAB granularity (46 studs) rather than ramp granularity
				 (32), so different levels' holes did not line up and left a 10.9-stud step the
				 player could not climb — measured at (116, -168), against a 7.15-stud jump.

				 The ring is solid and the ramps lie ON TOP of it. A wedge resting on terraces
				 cannot open a hole in them, which makes the enclosure invariant structural
				 rather than something the gap arithmetic has to get right. ]]
			--[[ THE APRON CHANGES MATERIAL AS IT RISES, and the first version did not — every
				 terrace took the biome's ground colour, so the overlook camera showed three
				 bright green shelves that read as ski slopes rather than as the foot of a cliff.

				 A real apron at the base of a wall is talus: ground at the bottom, rock at the
				 top, because it is the wall's own debris. So the tone blends from the biome's
				 ground toward its cliff tone across the terraces, which also ties the apron to
				 the wall standing on it instead of leaving a colour seam at the join. ]]
			local ground = biomeAt(cx, biomeZ).Ground
			local rock = biomeAt(cx, biomeZ).Cliff
			local base = if typeof(ground) == "Color3" then ground else Palette.World.Grass
			local stone = if typeof(rock) == "table" then rock[#rock] else base
			local blend = (level - 1) / math.max(1, TERRACES - 1)
			local colour = base:Lerp(stone, 0.25 + blend * 0.6)
			newPart(
				fApron,
				"ApronBench",
				Vector3.new(sx, h + 4, sz),
				CFrame.new(cx, (h + 4) / 2 - 4 + prev * 0, cz),
				colour,
				true
			)
		end

		-- East and west runs.
		for z = fzs, fzn, SLAB do
			local sz = math.min(SLAB, fzn - z)
			if sz > 6 then
				slab(-(fx + (OUTER_X - fx) / 2), z + sz / 2, OUTER_X - fx, sz, z + sz / 2)
				slab(fx + (OUTER_X - fx) / 2, z + sz / 2, OUTER_X - fx, sz, z + sz / 2)
			end
		end
		-- North and south runs, spanning the corners.
		for x = -OUTER_X, OUTER_X, SLAB do
			local sx = math.min(SLAB, OUTER_X - x)
			if sx > 6 then
				slab(x + sx / 2, fzn + (OUTER_ZN - fzn) / 2, sx, OUTER_ZN - fzn, OUTER_ZN)
				slab(x + sx / 2, fzs - (fzs - OUTER_ZS) / 2, sx, fzs - OUTER_ZS, OUTER_ZS)
			end
		end
	end

	for level = 1, TERRACES do
		bench(level)
	end

	--[[ THE RAMPS THEMSELVES. One wedge per side, running the full rise, so the apron is
		 reachable on foot. A wedge is thin on its LookVector side (measured — see `CW.facet`),
		 so it is aimed INWARD to slope down toward the player. ]]
	for _, r in RAMPS do
		local rise = TERRACES * STEP
		--[[ The ramp spans the WHOLE apron depth, so its foot is on the flat and its head is on
			 the top terrace with nothing to step over at either end. A wedge is thin on its
			 LookVector side (measured — see `CW.facet`), so it faces INWARD to slope down toward
			 the player. ]]
		local depthRun, innerEdge, outerEdge
		if r.z ~= 0 then
			innerEdge, outerEdge = INNER_ZN, OUTER_ZN
		else
			innerEdge, outerEdge = INNER_X, OUTER_X
		end
		depthRun = outerEdge - innerEdge
		local mid = (innerEdge + outerEdge) / 2
		local inward = Vector3.new(-r.x, 0, -r.z)
		local at = if r.z ~= 0
			then Vector3.new(r.at, rise / 2 - 2, r.z * mid)
			else Vector3.new(r.x * mid, rise / 2 - 2, r.at)
		wedge(
			fApron,
			"ApronRamp",
			Vector3.new(RAMP_HALF * 2, rise + 4, depthRun),
			CFrame.lookAt(at, at + inward),
			Palette.World.Sand
		)
	end

	--[[ RE-SEAT WHAT THE APRON SWALLOWED.

		 Every prop already standing in the band is now inside a terrace. Rather than move the
		 apron around them — which would make it a fence with holes — each is lifted to the
		 surface directly above it. No draws, so the stream is untouched.

		 Cliffs are excluded: they are supposed to be buried at the foot, that is what a wall
		 standing on a slope looks like. So are Crystals and Pads, which the apron does not
		 reach by construction. ]]
	local LIFT_SKIP = { Apron = true, Cliffs = true, Crystals = true, Pads = true, Ground = true }
	local lifted = 0
	for _, f in canyon:GetChildren() do
		if f:IsA("Folder") and not LIFT_SKIP[f.Name] then
			for _, d in f:GetDescendants() do
				if d:IsA("BasePart") then
					local top = apronTop(d.Position.X, d.Position.Z)
					if top > 0 then
						local foot = d.Position.Y - d.Size.Y / 2
						if foot < top then
							d.Position = Vector3.new(d.Position.X, d.Position.Y + (top - foot), d.Position.Z)
							lifted += 1
						end
					end
				end
			end
		end
	end
	--[[ THE ENCLOSURE CAP, and it exists because the apron BROKE the enclosure.

		 This is the exposure the design plan named and I still walked into: the apron lifts the
		 player up to 16.5 studs at the wall's foot, and the wall does not rise with it. Surveyed
		 from the top terrace: **122 of 256 perimeter samples cleared a 7.15-stud jump**, most of
		 them by clearing it entirely. The apron turned a sealed canyon into a wall a player can
		 step over — a strictly worse world than the flat one it replaced, and no capture would
		 ever have shown it because the player has to climb up there to find out.

		 Four invisible slabs, one per side, standing on the top terrace and rising 70 studs. The
		 enclosure invariant becomes STRUCTURAL rather than emergent from whatever heights the
		 archetype deck happened to deal — which is what it should have been before the apron
		 too, since the pre-existing buttress-and-stepped-courses construction was already a
		 staircase.

		 Invisible rather than solid because the wall is the thing the player should see; a
		 visible 70-stud extension would be a box on top of the geology. `CanCollide` on,
		 `Transparency` 1, and they are charged to the authored bucket like any other terrain. ]]
	local capBase = TERRACES * STEP
	local CAP_H = 70
	for _, side in { { x = 1, z = 0 }, { x = -1, z = 0 }, { x = 0, z = 1 }, { x = 0, z = -1 } } do
		local at, size
		if side.x ~= 0 then
			at = Vector3.new(side.x * (OUTER_X + 2), capBase + CAP_H / 2, (OUTER_ZN + OUTER_ZS) / 2)
			size = Vector3.new(4, CAP_H, OUTER_ZN - OUTER_ZS + 16)
		else
			local zEdge = if side.z > 0 then OUTER_ZN else OUTER_ZS
			at = Vector3.new(0, capBase + CAP_H / 2, zEdge + side.z * 2)
			size = Vector3.new(OUTER_X * 2 + 16, CAP_H, 4)
		end
		local cap = newPart(fApron, "EnclosureCap", size, CFrame.new(at), Palette.World.Grass, true)
		cap.Transparency = 1
		cap.CastShadow = false
	end

	print(("[Crystal Canyon] apron: %d terraces, %d ramps, %d props re-seated, 4 enclosure caps"):format(TERRACES, #RAMPS, lifted))
	currentBucket = "authored"
end)()

local landmarkTop = topOf(fLandmark)
local rivalTop = -math.huge
local rivalName = "nothing"
for _, f in canyon:GetChildren() do
	if f:IsA("Folder") and f ~= fLandmark then
		local t = topOf(f)
		if t > rivalTop then
			rivalTop, rivalName = t, f.Name
		end
	end
end
local dominance = if rivalTop > 0 then landmarkTop / rivalTop else math.huge

local cubePropCount = cubeByFamily.crystal_cube
local propTotal = assetCount + cubePropCount + buckets.fallback
local assetShare = if propTotal > 0 then ((assetCount + cubePropCount) / propTotal) * 100 else 0
local primitiveTotal = buckets.fallback + buckets.detail + buckets.authored
local extent = maxB - minB

--[[ THE STREAM FINGERPRINT — F-32, made enforceable instead of remembered.

	 One number, drawn from the SHARED seeded stream after every build step has run. If it is
	 identical between two builds, those builds consumed the shared stream identically. That is
	 the exact invariant F-32 needs and it is COMPLETE: no counting of draw sites, no positional
	 hash, no reasoning about short-circuits. If it differs, the shared stream moved and no
	 before/after comparison downstream means anything.

	 F-32 cost a whole afternoon and was caught only because the part count happened to change.
	 A change that re-rolls the world while keeping the count constant would have shipped. This
	 line is one draw and it makes that impossible. ]]
print(("[Crystal Canyon] stream fingerprint %.17g"):format(rng:NextNumber()))

print(
	string.format(
		"[Crystal Canyon] world rebuilt — %d parts, seed %d, bounds %.0f x %.0f x %.0f studs (x/y/z)\n"
			.. "  palette clones (Creator Store) %4d   [%s]\n"
			.. "  CUBE meshes (Golem-generated)  %4d   [landmark %d, kiosk %d, crystal_cube %d]\n"
			.. "  primitive prop FALLBACKS       %4d   [no palette %d (must be 0) / off palette %d (texture policy)]\n"
			.. "  primitive detail               %4d   [grass tufts, snow caps, fire ring]\n"
			.. "  authored terrain/architecture  %4d   [ground, paths, cliffs, landmarks, pads, gate, guidance]\n"
			.. "  PROPS      primitive:asset = %d:%d  (%.0f%% of props are mesh assets)\n"
			.. "  PRIMITIVES %d total, against 608 (blockout) and 471 (previous art pass)\n"
			.. "  PALETTE    %d loaded, %d curated in, %d culled out, %d untintable; %d Cube members\n"
			.. "  DOMINANCE  monument top %.1f vs %s %.1f = %.2f  (composition gate fails below 1.25)",
		partCount,
		SEED,
		extent.X,
		extent.Y,
		extent.Z,
		assetCount,
		if paletteOK then string.format("%d curated members loaded", paletteTotal) else "PALETTE MISSING",
		cubeCount,
		cubeByFamily.landmark,
		cubeByFamily.kiosk,
		cubeByFamily.crystal_cube,
		buckets.fallback,
		pickNoPalette,
		pickOffPalette,
		buckets.detail,
		buckets.authored,
		buckets.fallback,
		assetCount + cubePropCount,
		assetShare,
		primitiveTotal,
		loadedTotal,
		paletteTotal,
		#culledNames,
		#texturedNames,
		cubeTotal,
		landmarkTop,
		rivalName,
		rivalTop,
		dominance
	)
)

if dominance < 1.25 then
	warn(
		string.format(
			"[Crystal Canyon] VERTICAL DOMINANCE %.2f — below the composition gate's 1.25. The monument "
				.. "is no longer clearly the tallest thing in the map: %s reaches %.1f against its %.1f. "
				.. "Raise GEODE_TARGET_H / GEODE_MAX_W, or lower the TIERS.cliff band, before capturing "
				.. "evidence.",
			dominance,
			rivalName,
			rivalTop,
			landmarkTop
		)
	)
end

if cubeTotal == 0 then
	warn(
		"[Crystal Canyon] no Cube-generated members found under ServerStorage."
			.. PALETTE_ROOT_NAME
			.. " (expected sub-folders: "
			.. table.concat(CUBE_FAMILIES, ", ")
			.. "). The monument fell back to the REJECTED authored spire, the canyon wall's large "
			.. "masses are authored courses again, and the upgrade pad has no kiosk. The world still "
			.. "builds and still encloses — but it is the blockout landmark the review named."
	)
end

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
