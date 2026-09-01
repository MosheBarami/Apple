--!strict
--[[
	Crystal Canyon — the canonical player-eye viewpoints.

	## Why this exists

	Gate 40's verdict is "Prototype", and the owner's ruling is that it stays UNPROVEN until a
	FRESH critic — one that has not seen the implementation narrative — judges revised
	player-eye pixels. That review will happen more than once, and a review whose cameras drift
	between runs cannot answer "did this get better", only "is this good". The second question
	is worth less, because it has no baseline.

	Today every review camera is a literal typed into a tool call. So the cameras become data,
	and they live here.

	## The one design decision worth explaining

	A viewpoint stores a PLAN position and a PLAN target — x and z only — and resolves its eye
	height against the ground at capture time.

	That is not tidiness. The world is about to gain real elevation, and any camera written with
	a hardcoded Y would end up buried inside a new terrace or floating over a new basin —
	silently, in exactly the pass where the before/after comparison matters most. Storing the
	plan position and sampling the ground keeps each camera meaning the same thing after the
	terrain moves: "a player standing here, looking at that".

	`EYE` is 5.4 studs, which is roughly a character's eye rather than the centre of its
	HumanoidRootPart. The review is meant to answer what a PLAYER sees, and a camera at hip
	height flatters a world by pushing its skyline out of frame — which is the exact thing this
	world is currently failing on.

	## Using it

	A plain ModuleScript with no dependency on the game, so it can be required from the command
	bar in Edit or Play. It is a review tool and is deliberately NOT in Install.luau's manifest,
	the same as Build.luau and MotionProbe.luau — `world/` is where command-bar tooling lives.

	    local V = require(game.ServerStorage.Viewpoints)
	    V.apply(workspace.CurrentCamera, V.byName("frost-approach"))

	`apply` sets `CameraType = Scriptable` BEFORE writing the CFrame. Not defensive — F-10 in
	docs/FAILURES.md records that a plugin-set camera CFrame keeps its position and silently
	DROPS its rotation otherwise, so an entire pass of "blocked by geometry" renders was
	actually facing +Z whatever it asked for.
]]

local Viewpoints = {}

--[[ Roughly a character's eye rather than its root part. A camera at root height sits about a
	 stud and a half low, which is enough to push a cliff's skyline out of frame. ]]
local EYE = 5.4

--[[ How far to search for ground under a viewpoint. Generous upward because the elevated
	 destinations the topology pass adds may put a camera well above the old plane. ]]
local PROBE_UP = 400
local PROBE_DOWN = 800

--[[ Folders the ground probe must ignore, because a downward ray does not know the difference
	 between the floor and the ceiling.

	 Found by testing rather than by reasoning: the `sell-pads` viewpoint resolved to a ground
	 height of 57.96 and put the camera at y = 63, because the probe fell from 400 studs and hit
	 the monument's crystal shafts on the way down. The shot would have been taken from inside
	 the sky, and nothing about the resulting image would have said why.

	 Everything listed here is scenery, overhead structure, or a collectible — never something a
	 player stands on. `Cliffs` is deliberately NOT here: a cliff ledge is exactly the kind of
	 elevated destination the topology pass adds, and a camera standing on one is a legitimate
	 player-eye shot. ]]
local NOT_GROUND = {
	Landmark = true,
	SecondaryLandmarks = true,
	Flora = true,
	Crystals = true,
	Storytelling = true,
	Signposting = true,
	Rocks = true,
}

export type Viewpoint = {
	--- Stable identifier, used as the capture id. It must not change between runs, because
	--- comparing two runs is the whole point.
	name: string,
	--- What the reviewer is being asked to look at, in one line.
	intent: string,
	--- Plan position of the eye.
	at: Vector2,
	--- Plan position being looked at.
	look: Vector2,
	--- Added to the resolved eye height, for viewpoints deliberately NOT at standing height.
	rise: number?,
	--- Added to the resolved target height, for looking up at something tall.
	targetRise: number?,
}

--[[ THE SET.

	 One entry per thing a fresh critic was asked to see, ordered as a WALK rather than as a
	 list: spawn, the hub and its landmark, north along the meadow into the collection loop,
	 back to the pads, then south through the gate into Frost Hollow. Taken in order they show
	 the game the way a player meets it, which is the only order in which "does the landmark
	 reveal work" is a meaningful question. ]]
local SET: { Viewpoint } = {
	{
		name = "spawn",
		intent = "The first frame of the game. Is this a place, or a grey box with props on it?",
		at = Vector2.new(0, -52),
		look = Vector2.new(0, 10),
		targetRise = 12,
	},
	{
		name = "hub-landmark",
		intent = "The primary landmark from the hub floor — the shot the composition is built around.",
		at = Vector2.new(0, -14),
		look = Vector2.new(0, 18),
		targetRise = 30,
	},
	{
		name = "landmark-close",
		intent = "The monument and its plinth at conversational distance, where block-counting happens.",
		at = Vector2.new(26, -4),
		look = Vector2.new(4, 16),
		targetRise = 14,
	},
	{
		name = "meadow-traverse",
		intent = "Walking the corridor north. Does the path read, and does the world open up?",
		at = Vector2.new(0, 70),
		look = Vector2.new(0, 190),
		targetRise = 6,
	},
	{
		name = "meadow-loop",
		intent = "Standing in the collection field. Are the collectibles legible as targets from here?",
		at = Vector2.new(-30, 150),
		look = Vector2.new(30, 175),
	},
	{
		name = "meadow-wall",
		intent = "The west canyon wall at eye height. THE gate-2 shot: rock, or stacked boxes?",
		at = Vector2.new(-36, 120),
		look = Vector2.new(-150, 140),
		targetRise = 14,
	},
	{
		name = "sell-pads",
		intent = "The core-loop furniture — sell and upgrade pads — as the player returns to them.",
		--- On the hub floor, 25 studs out from the sell pad at (32, -12).
		---
		--- It has been moved twice, both times because the ground probe found a ceiling. At
		--- (4, 34) it stood directly beneath the monument and resolved to y = 63; at (52, -46)
		--- it stood under the south cliff and resolved to y = 28. This position is verified
		--- clear — ground 0.55, which is the hub floor.
		---
		--- The two pads are on OPPOSITE sides of the hub (sell at +32, upgrade at -38, 64 studs
		--- apart), so no single eye-height shot contains both. This one frames the sell pad,
		--- which is the one the core loop returns to.
		at = Vector2.new(20, -34),
		look = Vector2.new(32, -12),
	},
	{
		name = "zone-transition",
		intent = "The moment the world changes biome. Authored transition, or a seam?",
		at = Vector2.new(0, -20),
		look = Vector2.new(0, -120),
		targetRise = 8,
	},
	{
		name = "frost-approach",
		intent = "Walking up to the locked gate. Is the price readable from here, on foot?",
		at = Vector2.new(0, -30),
		look = Vector2.new(0, -66),
		targetRise = 34,
	},
	{
		name = "frost-interior",
		intent = "Inside Frost Hollow. Bright and saturated per §1, or a washed-out half of the map?",
		at = Vector2.new(0, -110),
		look = Vector2.new(-20, -200),
		targetRise = 10,
	},
	{
		name = "frost-wall",
		intent = "The frost-side wall at eye height — the gate-2 question in the other biome.",
		at = Vector2.new(-24, -170),
		look = Vector2.new(-140, -180),
		targetRise = 14,
	},
	{
		name = "overlook",
		intent = "The whole composition from above the hub: silhouette, hierarchy, and whether the world has relief.",
		at = Vector2.new(0, 130),
		look = Vector2.new(0, -60),
		rise = 46,
		targetRise = 20,
	},
}

--[[ Resolve the ground height under a plan position.

	 A downward raycast from high above, landing on whatever a player would actually stand on —
	 a terrace, a bridge deck, the plain. Characters are excluded so a camera cannot perch on
	 someone's head.

	 Returns nil when there is genuinely nothing beneath. The caller treats that as "keep the
	 flat-world height" rather than as zero, because dropping to zero would put the camera
	 inside the ground plane and produce a black frame that reads as a rendering bug rather
	 than as a missing viewpoint. ]]
function Viewpoints.groundAt(world: Workspace, x: number, z: number): number?
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	local exclude: { Instance } = {}
	for _, plr in game:GetService("Players"):GetPlayers() do
		if plr.Character then
			table.insert(exclude, plr.Character)
		end
	end
	local canyon = world:FindFirstChild("Canyon")
	if canyon then
		for _, child in canyon:GetChildren() do
			if NOT_GROUND[child.Name] then
				table.insert(exclude, child)
			end
		end
	end
	params.FilterDescendantsInstances = exclude

	local hit = world:Raycast(
		Vector3.new(x, PROBE_UP, z),
		Vector3.new(0, -(PROBE_UP + PROBE_DOWN), 0),
		params
	)
	return if hit then hit.Position.Y else nil
end

--[[ Turn a viewpoint into a camera CFrame, resolving both ends against the ground. ]]
function Viewpoints.resolve(world: Workspace, vp: Viewpoint): CFrame
	local eyeGround = Viewpoints.groundAt(world, vp.at.X, vp.at.Y) or 0
	local lookGround = Viewpoints.groundAt(world, vp.look.X, vp.look.Y) or 0
	local eye = Vector3.new(vp.at.X, eyeGround + EYE + (vp.rise or 0), vp.at.Y)
	local target = Vector3.new(vp.look.X, lookGround + (vp.targetRise or EYE), vp.look.Y)
	return CFrame.lookAt(eye, target)
end

--[[ Apply a viewpoint to a camera.

	 `CameraType = Scriptable` FIRST, per F-10. ]]
function Viewpoints.apply(camera: Camera, vp: Viewpoint): CFrame
	camera.CameraType = Enum.CameraType.Scriptable
	local cf = Viewpoints.resolve(workspace, vp)
	camera.CFrame = cf
	return cf
end

function Viewpoints.all(): { Viewpoint }
	return SET
end

function Viewpoints.byName(name: string): Viewpoint?
	for _, vp in SET do
		if vp.name == name then
			return vp
		end
	end
	return nil
end

return Viewpoints
