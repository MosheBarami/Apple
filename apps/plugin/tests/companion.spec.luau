--!nocheck
--!modules Version,Paths,Serializer,Render,Generation,Companion,Ops
--[[
	The Studio companion: test controls, transforms, the Explorer edits, selection sync.

	These are the ops a PERSON drives. There is no model in the loop to notice that a
	scale of zero flattened their level, and no agent step to retry after the wrong thing
	was stopped mid-playtest. So every guard below is tested by feeding it the actual
	violating input — a NaN, an unknown action, a name that breaks its own path — and
	watching it refuse. A spec that only walked the healthy path would prove that the
	healthy path works, which was never in doubt.

	The decision layer (`Companion`) is driven directly because it is pure. The effects
	go through `Ops.execute`, for the F-57 reason the ops spec gives: `MUTATING` and
	`handlers` are two hand-maintained tables, and a kind in one and not the other is
	invisible to a test that calls the implementation function.
]]

local ws = game:GetService("Workspace")
local RunService = game:GetService("RunService")
local history = game:GetService("ChangeHistoryService")

local function scene(name)
	for _, c in ws:GetChildren() do
		if c.Name == name then c:Destroy() end
	end
	local f = Instance.new("Folder", ws)
	f.Name = name
	return f
end

local function part(parent, name, x, y, z)
	local p = Instance.new("Part", parent)
	p.Name = name
	p.CFrame = CFrame.new(x or 0, y or 0, z or 0)
	return p
end

local function reply(kind, body)
	body = body or {}
	body.op = kind
	return Ops.execute("c1", body)
end

--- Floating point comparison with a stated tolerance, so a rotation can be asserted at
--- all. `H.eq` on a float would be a test that fails for being right.
local function near(actual, expected, what)
	if math.abs(actual - expected) > 1e-4 then
		error(string.format("%s: expected %g, got %g", what or "value", expected, actual), 2)
	end
end

local function editMode()
	RunService.__running = false
	RunService.__runMode = false
	RunService.__calls = {}
end

-- ================================================================== finite ==
--[[ Every guard below is built on this one. If `finite` lets a NaN through, every
	 range check downstream fails open, because NaN compares false against everything. ]]

H.test("finite rejects the three values a range check cannot catch", function()
	H.eq(Companion.finite(0 / 0), nil, "NaN")
	H.eq(Companion.finite(math.huge), nil, "+inf")
	H.eq(Companion.finite(-math.huge), nil, "-inf")
end)

H.test("finite rejects a number-shaped string, which JSON hands over freely", function()
	H.eq(Companion.finite("5"), nil, 'the string "5"')
	H.eq(Companion.finite(nil), nil, "nil")
	H.eq(Companion.finite(true), nil, "a boolean")
end)

H.test("finite passes ordinary numbers through unchanged", function()
	H.eq(Companion.finite(-3.5), -3.5, "a negative float")
	H.eq(Companion.finite(0), 0, "zero is finite; it is the SCALE check that refuses it")
end)

-- =========================================================== test controls ==
--[[ THE BUG THIS SECTION EXISTS FOR.

	 `run_mode` was `if action == "start" then Run() else Stop() end`. Every action that
	 was not exactly "start" stopped the user's simulation — a typo, an action a newer
	 worker sends to an older plugin, anything. The planner is the fix and this is where
	 it is held to it. ]]

H.test("an unknown action is refused by name rather than treated as stop", function()
	local plan, refusal = Companion.planTest("shutdown", true, true)
	H.eq(plan, nil, "no plan")
	H.ok(string.find(refusal, "shutdown", 1, true), "echoes what was asked: " .. tostring(refusal))
	H.ok(string.find(refusal, "restart", 1, true), "and names what is accepted")
end)

H.test("a non-string action is refused rather than compared against \"start\"", function()
	local plan, refusal = Companion.planTest(42, true, true)
	H.eq(plan, nil, "no plan")
	H.ok(string.find(refusal, "must be a string", 1, true), tostring(refusal))
end)

H.test("start is an alias for run, so the playtest tool keeps working", function()
	local plan = Companion.planTest("start", false, false)
	H.eq(#plan.calls, 1, "one call")
	H.eq(plan.calls[1], "Run", "which is Run")
end)

H.test("run from edit starts, and run from paused resumes — the same call, a different story", function()
	local cold = Companion.planTest("run", false, false)
	H.eq(cold.calls[1], "Run", "cold call")
	H.eq(cold.note, "started", "cold note")
	local paused = Companion.planTest("run", false, true)
	H.eq(paused.calls[1], "Run", "paused call")
	H.eq(paused.note, "resumed", "paused note")
end)

H.test("pause and resume refuse DIFFERENTLY when nothing is running", function()
	-- Two distinct dead ends with two distinct fixes. One shared message would send a
	-- user who pressed Resume looking for a pause that never happened.
	local _, pauseRefusal = Companion.planTest("pause", false, false)
	H.ok(string.find(pauseRefusal, "nothing to pause", 1, true), tostring(pauseRefusal))
	local _, resumeRefusal = Companion.planTest("resume", false, false)
	H.ok(string.find(resumeRefusal, "nothing to resume", 1, true), tostring(resumeRefusal))
end)

H.test("pausing what is already paused is a no-op, not a second Pause", function()
	local plan = Companion.planTest("pause", false, true)
	H.eq(#plan.calls, 0, "no calls")
	H.eq(plan.noop, true, "and says so")
end)

H.test("pause suspends a running simulation", function()
	local plan = Companion.planTest("pause", true, true)
	H.eq(plan.calls[1], "Pause", "call")
	H.eq(plan.noop, false, "not a no-op")
end)

H.test("resume from paused issues Run, because Run is what resumes", function()
	local plan = Companion.planTest("resume", false, true)
	H.eq(plan.calls[1], "Run", "call")
end)

H.test("stopping what is already stopped issues nothing", function()
	local plan = Companion.planTest("stop", false, false)
	H.eq(#plan.calls, 0, "no calls")
	H.eq(plan.noop, true, "noop")
end)

H.test("restart stops BEFORE it runs, in that order", function()
	-- The order is the whole content of "restart". Reversed, it starts a simulation and
	-- then immediately kills it.
	local plan = Companion.planTest("restart", true, true)
	H.eq(#plan.calls, 2, "two calls")
	H.eq(plan.calls[1], "Stop", "first")
	H.eq(plan.calls[2], "Run", "second")
end)

H.test("restart from a cold place still ends up RUNNING", function()
	local plan = Companion.planTest("restart", false, false)
	H.eq(plan.calls[#plan.calls], "Run", "the last call leaves it running")
end)

-- ------------------------------------------------- through the real dispatch --

H.test("run_mode run actually starts the simulation", function()
	editMode()
	local r = reply("run_mode", { action = "run" })
	H.eq(r.ok, true, "ok: " .. tostring(r.error))
	H.eq(RunService:IsRunning(), true, "running")
	H.eq(r.data.running, true, "and reports the state it read back")
end)

H.test("AN UNKNOWN ACTION DOES NOT STOP A RUNNING SIMULATION", function()
	--[[ The regression this whole section exists for. Under the old `else Stop()` this
		 op ended the user's playtest and reported success. ]]
	editMode()
	RunService:Run()
	RunService.__calls = {}
	local r = reply("run_mode", { action = "halt-everything" })
	H.eq(r.ok, false, "refused")
	H.eq(#RunService.__calls, 0, "NO engine call was made")
	H.eq(RunService:IsRunning(), true, "and the simulation is still running")
end)

H.test("pause then resume moves through the paused state and back", function()
	editMode()
	RunService:Run()
	local paused = reply("run_mode", { action = "pause" })
	H.eq(paused.ok, true, "pause ok: " .. tostring(paused.error))
	H.eq(RunService:IsRunning(), false, "not stepping")
	H.eq(RunService:IsRunMode(), true, "but still in run mode — that is what paused IS")
	local resumed = reply("run_mode", { action = "resume" })
	H.eq(resumed.ok, true, "resume ok: " .. tostring(resumed.error))
	H.eq(RunService:IsRunning(), true, "running again")
end)

H.test("restart issues Stop then Run against the engine, not just in the plan", function()
	editMode()
	RunService:Run()
	RunService.__calls = {}
	local r = reply("run_mode", { action = "restart" })
	H.eq(r.ok, true, "ok: " .. tostring(r.error))
	H.eq(#RunService.__calls, 2, "two calls")
	H.eq(RunService.__calls[1], "Stop", "first")
	H.eq(RunService.__calls[2], "Run", "second")
	H.eq(RunService:IsRunning(), true, "and it ends running")
end)

H.test("run_mode takes no undo recording — starting a simulation edits nothing", function()
	editMode()
	history.__refuseNext = true
	local r = reply("run_mode", { action = "run" })
	H.eq(r.ok, true, "ok: " .. tostring(r.error))
	H.eq(history.__refuseNext, true, "the armed refusal was never consumed")
	history.__refuseNext = false
	editMode()
end)

-- =============================================================== transforms ==

H.test("a NaN scale is refused — the value every > comparison waves through", function()
	local plan, refusal = Companion.planTransform({ paths = {}, scale = 0 / 0 })
	H.eq(plan, nil, "no plan")
	H.ok(string.find(refusal, "scale", 1, true), tostring(refusal))
end)

H.test("an infinite scale is refused", function()
	local plan = Companion.planTransform({ scale = math.huge })
	H.eq(plan, nil, "no plan")
end)

H.test("a zero scale is refused rather than clamped, because zero is not reversible", function()
	local plan, refusal = Companion.planTransform({ scale = 0 })
	H.eq(plan, nil, "no plan")
	H.ok(string.find(refusal, "destroys the geometry", 1, true), tostring(refusal))
end)

H.test("a negative scale is refused; mirroring is not resizing", function()
	H.eq(Companion.planTransform({ scale = -1 }), nil, "scale -1")
end)

H.test("an absurd scale is refused at the top of the range too", function()
	H.eq(Companion.planTransform({ scale = 1e9 }), nil, "scale 1e9")
end)

H.test("a move component that is not a number names the component it refused", function()
	local plan, refusal = Companion.planTransform({ move = { 1, "2", 3 } })
	H.eq(plan, nil, "no plan")
	H.ok(string.find(refusal, "move[2]", 1, true), tostring(refusal))
end)

H.test("a move of the wrong arity is refused rather than padded with zeros", function()
	local plan, refusal = Companion.planTransform({ move = { 1, 2 } })
	H.eq(plan, nil, "no plan")
	H.ok(string.find(refusal, "three components", 1, true), tostring(refusal))
end)

H.test("a transform that asks for nothing is refused, not silently applied", function()
	local plan, refusal = Companion.planTransform({ paths = { "game.Workspace" } })
	H.eq(plan, nil, "no plan")
	H.ok(string.find(refusal, "at least one", 1, true), tostring(refusal))
end)

H.test("the identity elements are EXACT, so an unasked-for axis changes nothing", function()
	local plan = Companion.planTransform({ rotate = { 0, 90, 0 } })
	H.eq(plan.scale, 1, "scale is exactly one")
	H.eq(plan.move.X, 0, "move.X")
	H.eq(plan.move.Y, 0, "move.Y")
	H.eq(plan.move.Z, 0, "move.Z")
	H.eq(plan.scaled, false, "and it says it was not asked to scale")
	H.eq(plan.moved, false, "nor to move")
	H.eq(plan.rotated, true, "only to rotate")
end)

H.test("a move shifts a part by exactly what was asked and leaves its size alone", function()
	local root = scene("Move")
	local p = part(root, "Block", 5, 0, 0)
	local before = p.Size
	local r = reply("transform_instances", { paths = { Paths.fullPath(p) }, move = { 10, 0, -2 } })
	H.eq(r.ok, true, "ok: " .. tostring(r.error))
	near(p.Position.X, 15, "x")
	near(p.Position.Z, -2, "z")
	near(p.Size.X, before.X, "size is untouched by a move")
	H.eq(r.data.parts, 1, "one part moved")
end)

H.test("a scale multiplies the size and leaves a lone part where it stands", function()
	-- A part is its own pivot, so scaling it must not walk it across the place.
	local root = scene("Scale")
	local p = part(root, "Block", 7, 3, 0)
	local r = reply("transform_instances", { paths = { Paths.fullPath(p) }, scale = 2 })
	H.eq(r.ok, true, "ok: " .. tostring(r.error))
	near(p.Size.X, 8, "4 * 2")
	near(p.Size.Y, 2, "1 * 2")
	near(p.Position.X, 7, "x is where it was")
	near(p.Position.Y, 3, "y is where it was")
end)

H.test("a rotation turns a model's parts ABOUT THE MODEL, not about the world origin", function()
	--[[ The discriminating case. A rotation applied about the origin would fling a model
		 standing at x=100 across the map; about its own centre it turns in place.

		 The claim asserted is the relationship: the offset from the centre keeps its
		 LENGTH and changes its AXIS. Ninety degrees about Y maps (+d, 0, 0) to (0, 0, -d). ]]
	local root = scene("Rotate")
	local model = Instance.new("Model", root)
	model.Name = "Tower"
	local left = part(model, "Left", 96, 0, 0)
	local right = part(model, "Right", 104, 0, 0)
	local r = reply("transform_instances", { paths = { Paths.fullPath(model) }, rotate = { 0, 90, 0 } })
	H.eq(r.ok, true, "ok: " .. tostring(r.error))

	-- centre was x=100; the two parts sat at -4 and +4 along X.
	near(left.Position.X, 100, "left came onto the centre line in X")
	near(left.Position.Z, 4, "and -4 in X became +4 in Z")
	near(right.Position.X, 100, "right too")
	near(right.Position.Z, -4, "with the opposite sign")
	-- Length preserved: it turned, it did not drift.
	near(math.abs(left.Position.Z - right.Position.Z), 8, "the parts are still 8 studs apart")
	-- And the parts themselves turned, not merely moved.
	near(left.CFrame.RightVector.Z, -1, "the part's own right vector now points down -Z")
end)

H.test("a rotation about a model does not scale it, and a scale does not rotate it", function()
	local root = scene("RotateOnly")
	local model = Instance.new("Model", root)
	model.Name = "Tower"
	local p = part(model, "P", 10, 0, 0)
	local before = p.Size
	reply("transform_instances", { paths = { Paths.fullPath(model) }, rotate = { 0, 45, 0 } })
	near(p.Size.X, before.X, "size X unchanged by a rotation")
	near(p.Size.Z, before.Z, "size Z unchanged by a rotation")
end)

H.test("a non-spatial target is refused by name, not silently skipped", function()
	local root = scene("Nothing")
	local f = Instance.new("Folder", root)
	f.Name = "Empty"
	local r = reply("transform_instances", { paths = { Paths.fullPath(f) }, move = { 1, 0, 0 } })
	H.eq(r.ok, false, "refused")
	H.ok(string.find(r.error, "Empty", 1, true), "names the path: " .. tostring(r.error))
end)

H.test("a bad path LATE in the list leaves the earlier targets untouched", function()
	--[[ Resolve-everything-first. Without it, target 1 moves and target 2 raises, and the
		 place is half-transformed with one undo entry covering an inconsistent state. ]]
	local root = scene("Partial")
	local p = part(root, "First", 0, 0, 0)
	local r = reply("transform_instances", {
		paths = { Paths.fullPath(p), "game.Workspace.Partial.DoesNotExist" },
		move = { 50, 0, 0 },
	})
	H.eq(r.ok, false, "refused")
	near(p.Position.X, 0, "the first target did not move")
end)

H.test("a refused transform cancels its recording instead of committing an empty one", function()
	local root = scene("NoCommit")
	local p = part(root, "P", 0, 0, 0)
	history.__log = {}
	local r = reply("transform_instances", { paths = { Paths.fullPath(p) }, scale = 0 })
	H.eq(r.ok, false, "refused")
	local sawCancel = false
	for _, line in history.__log do
		if string.find(line, "Cancel", 1, true) then sawCancel = true end
		if string.find(line, "Commit", 1, true) then
			error("a refused transform committed a recording: " .. line)
		end
	end
	H.ok(sawCancel, "expected a Cancel")
end)

-- ==================================================================== names ==

H.test("a name containing a double quote is refused: its own path would not resolve", function()
	local name, refusal = Companion.validateName('Door"]')
	H.eq(name, nil, "no name")
	H.ok(string.find(refusal, "double quote", 1, true), tostring(refusal))
end)

H.test("an empty or whitespace-only name is refused", function()
	H.eq(Companion.validateName(""), nil, "empty")
	H.eq(Companion.validateName("   "), nil, "spaces")
	H.eq(Companion.validateName("\t\n"), nil, "tabs and newlines")
end)

H.test("a non-string name is refused rather than tostring'd", function()
	H.eq(Companion.validateName(7), nil, "a number")
	H.eq(Companion.validateName(nil), nil, "nil")
end)

H.test("a name is trimmed, and a DOTTED name is allowed because paths quote it", function()
	local name = Companion.validateName("  My.Part  ")
	H.eq(name, "My.Part", "trimmed and kept")
end)

H.test("the refusal names the op that asked, so a group failure does not read as a rename", function()
	local _, refusal = Companion.validateName("", "group_instances")
	H.ok(string.find(refusal, "group_instances", 1, true), tostring(refusal))
end)

H.test("a rename to a dotted name produces a path that resolves BACK to the instance", function()
	--[[ fullPath and parse are two pieces of code that must agree about quoting. This is
		 the round trip, run against the real codec rather than assumed. ]]
	local root = scene("Rename")
	local p = part(root, "Plain", 0, 0, 0)
	local r = reply("rename_instance", { path = Paths.fullPath(p), name = "Front.Door" })
	H.eq(r.ok, true, "ok: " .. tostring(r.error))
	H.eq(p.Name, "Front.Door", "renamed")
	H.eq(Paths.resolve(r.data.path), p, "and the returned path resolves to this very instance")
	H.eq(r.data.was, "Plain", "and reports what it used to be called")
end)

H.test("a rename onto a sibling's name is refused, and the instance keeps its old name", function()
	local root = scene("Clash")
	local a = part(root, "Alpha", 0, 0, 0)
	part(root, "Beta", 0, 0, 0)
	local r = reply("rename_instance", { path = Paths.fullPath(a), name = "Beta" })
	H.eq(r.ok, false, "refused")
	H.eq(a.Name, "Alpha", "and it was not renamed on the way to refusing")
end)

H.test("a service may not be renamed", function()
	local r = reply("rename_instance", { path = "game.Workspace", name = "Stage" })
	H.eq(r.ok, false, "refused")
	H.ok(string.find(r.error, "service", 1, true), tostring(r.error))
end)

-- ==================================================================== clone ==

H.test("two clones of one part get two DIFFERENT paths, each resolving to itself", function()
	--[[ Studio's own Ctrl+D leaves the copy sharing its name, which is fine in Studio and
		 fatal here: this protocol addresses instances by path, so two siblings with one
		 name have one path between them and every later op hits the original. ]]
	local root = scene("Clone")
	local p = part(root, "Crate", 0, 0, 0)
	local first = reply("clone_instances", { paths = { Paths.fullPath(p) } })
	local second = reply("clone_instances", { paths = { Paths.fullPath(p) } })
	H.eq(first.ok, true, "first ok: " .. tostring(first.error))
	H.eq(second.ok, true, "second ok: " .. tostring(second.error))
	local a, b = first.data.created[1], second.data.created[1]
	H.ok(a ~= b, "the two copies have different paths: " .. tostring(a) .. " / " .. tostring(b))
	local ra, rb = Paths.resolve(a), Paths.resolve(b)
	H.ok(ra ~= p, "the first copy is not the original")
	H.ok(rb ~= p, "the second copy is not the original")
	H.ok(ra ~= rb, "and they are not each other")
	H.eq(p.Name, "Crate", "the original keeps its name")
end)

H.test("a clone lands beside its source unless a parent is named", function()
	local root = scene("CloneHome")
	local elsewhere = Instance.new("Folder", root)
	elsewhere.Name = "Elsewhere"
	local p = part(root, "Crate", 0, 0, 0)
	local r = reply("clone_instances", { paths = { Paths.fullPath(p) }, parent = Paths.fullPath(elsewhere) })
	H.eq(r.ok, true, "ok: " .. tostring(r.error))
	H.eq(Paths.resolve(r.data.created[1]).Parent, elsewhere, "it went where it was told")
end)

H.test("an unarchivable instance is not cloned — that flag is the engine saying no", function()
	local root = scene("CloneArchivable")
	local p = part(root, "Secret", 0, 0, 0)
	p.Archivable = false
	local r = reply("clone_instances", { paths = { Paths.fullPath(p) } })
	H.eq(r.ok, false, "refused")
	H.ok(string.find(r.error, "Archivable", 1, true), tostring(r.error))
end)

H.test("a service may not be cloned", function()
	local r = reply("clone_instances", { paths = { "game.Workspace" } })
	H.eq(r.ok, false, "refused")
	H.ok(string.find(r.error, "service", 1, true), tostring(r.error))
end)

-- ========================================================== group / ungroup ==

H.test("grouping moves the targets under a new Model that the returned path resolves to", function()
	local root = scene("Group")
	local a = part(root, "A", 0, 0, 0)
	local b = part(root, "B", 4, 0, 0)
	local r = reply("group_instances", { paths = { Paths.fullPath(a), Paths.fullPath(b) }, name = "Shed" })
	H.eq(r.ok, true, "ok: " .. tostring(r.error))
	local model = Paths.resolve(r.data.path)
	H.eq(model.ClassName, "Model", "it is a Model")
	H.eq(a.Parent, model, "A moved in")
	H.eq(b.Parent, model, "B moved in")
	H.eq(model.Parent, root, "and the Model took A's place in the tree")
	H.eq(r.data.grouped, 2, "two grouped")
	H.eq(r.data.fromOtherParents, 0, "both came from the same parent")
end)

H.test("grouping across parents says how many came from elsewhere", function()
	-- Not refused — reparenting into a Model moves nothing in world space — but a caller
	-- who did not mean to reach across the tree has to be able to see that it happened.
	local root = scene("GroupSplit")
	local other = Instance.new("Folder", root)
	other.Name = "Other"
	local a = part(root, "A", 0, 0, 0)
	local b = part(other, "B", 0, 0, 0)
	local r = reply("group_instances", { paths = { Paths.fullPath(a), Paths.fullPath(b) } })
	H.eq(r.ok, true, "ok: " .. tostring(r.error))
	H.eq(r.data.fromOtherParents, 1, "one came from elsewhere")
	H.eq(b.Parent, Paths.resolve(r.data.path), "and it did move in")
end)

H.test("a group name is validated with the same rule as a rename", function()
	local root = scene("GroupName")
	local a = part(root, "A", 0, 0, 0)
	local r = reply("group_instances", { paths = { Paths.fullPath(a) }, name = 'Bad"]' })
	H.eq(r.ok, false, "refused")
	H.eq(a.Parent, root, "and nothing was regrouped on the way to refusing")
end)

H.test("ungroup releases the children into the model's parent and removes the model", function()
	local root = scene("Ungroup")
	local model = Instance.new("Model", root)
	model.Name = "Shed"
	local a = part(model, "A", 0, 0, 0)
	local b = part(model, "B", 0, 0, 0)
	local r = reply("ungroup_instances", { paths = { Paths.fullPath(model) } })
	H.eq(r.ok, true, "ok: " .. tostring(r.error))
	H.eq(a.Parent, root, "A came out")
	H.eq(b.Parent, root, "B came out")
	H.eq(#r.data.released, 2, "and both are reported")
	H.eq(root:FindFirstChild("Shed"), nil, "the Model is gone")
end)

H.test("ungrouping something that is not a container is refused by class", function()
	local root = scene("UngroupPart")
	local p = part(root, "Solid", 0, 0, 0)
	local r = reply("ungroup_instances", { paths = { Paths.fullPath(p) } })
	H.eq(r.ok, false, "refused")
	H.ok(string.find(r.error, "Part", 1, true), "names the class: " .. tostring(r.error))
	H.eq(p.Parent, root, "and it is still there")
end)

-- ===================================================================== lock ==

H.test("locking a model locks every part under it and reports the count", function()
	local root = scene("Lock")
	local model = Instance.new("Model", root)
	model.Name = "Shed"
	local a = part(model, "A", 0, 0, 0)
	local b = part(model, "B", 0, 0, 0)
	local r = reply("set_locked", { paths = { Paths.fullPath(model) }, locked = true })
	H.eq(r.ok, true, "ok: " .. tostring(r.error))
	H.eq(r.data.parts, 2, "two parts")
	H.eq(a.Locked, true, "A locked")
	H.eq(b.Locked, true, "B locked")
	H.eq(#r.data.skipped, 0, "nothing skipped")
end)

H.test("unlocking is the same op with the flag turned round", function()
	local root = scene("Unlock")
	local p = part(root, "A", 0, 0, 0)
	reply("set_locked", { paths = { Paths.fullPath(p) }, locked = true })
	H.eq(p.Locked, true, "locked first")
	local r = reply("set_locked", { paths = { Paths.fullPath(p) }, locked = false })
	H.eq(r.ok, true, "ok: " .. tostring(r.error))
	H.eq(p.Locked, false, "unlocked")
end)

H.test("a target with no parts is REPORTED as skipped, not counted as locked", function()
	local root = scene("LockEmpty")
	local f = Instance.new("Folder", root)
	f.Name = "Empty"
	local r = reply("set_locked", { paths = { Paths.fullPath(f) }, locked = true })
	H.eq(r.ok, true, "ok: " .. tostring(r.error))
	H.eq(r.data.parts, 0, "nothing was locked")
	H.eq(#r.data.skipped, 1, "and the caller is told which path did nothing")
end)

H.test("a non-boolean lock flag is refused rather than read as truthy", function()
	local root = scene("LockBad")
	local p = part(root, "A", 0, 0, 0)
	local r = reply("set_locked", { paths = { Paths.fullPath(p) }, locked = "yes" })
	H.eq(r.ok, false, "refused")
	H.eq(p.Locked, nil, "and nothing was written")
end)

-- =============================================================== visibility ==

H.test("hiding a translucent part remembers what it looked like, and showing it puts it back", function()
	--[[ The obvious implementation puts Transparency back to 0, which turns every
		 deliberately translucent window in the place into solid plastic. ]]
	local root = scene("Hide")
	local p = part(root, "Window", 0, 0, 0)
	p.Transparency = 0.4
	reply("set_visible", { paths = { Paths.fullPath(p) }, visible = false })
	H.eq(p.Transparency, 1, "hidden")
	H.eq(p:GetAttribute(Companion.HIDDEN_ATTRIBUTE), 0.4, "and the old value is on the part")
	reply("set_visible", { paths = { Paths.fullPath(p) }, visible = true })
	H.eq(p.Transparency, 0.4, "restored to what it was, not to zero")
	H.eq(p:GetAttribute(Companion.HIDDEN_ATTRIBUTE), nil, "and the note is cleared")
end)

H.test("hiding twice does not overwrite the remembered value with 1", function()
	local root = scene("HideTwice")
	local p = part(root, "Window", 0, 0, 0)
	p.Transparency = 0.4
	reply("set_visible", { paths = { Paths.fullPath(p) }, visible = false })
	reply("set_visible", { paths = { Paths.fullPath(p) }, visible = false })
	reply("set_visible", { paths = { Paths.fullPath(p) }, visible = true })
	H.eq(p.Transparency, 0.4, "still restores the original")
end)

H.test("showing a part the companion never hid leaves it exactly as it is", function()
	local root = scene("ShowUntouched")
	local p = part(root, "Ghost", 0, 0, 0)
	p.Transparency = 0.7
	local r = reply("set_visible", { paths = { Paths.fullPath(p) }, visible = true })
	H.eq(r.ok, true, "ok: " .. tostring(r.error))
	H.eq(p.Transparency, 0.7, "untouched")
end)

H.test("a GuiObject takes Visible directly and is counted separately from parts", function()
	local root = scene("HideGui")
	local frame = Instance.new("Frame", root)
	frame.Name = "Panel"
	local r = reply("set_visible", { paths = { Paths.fullPath(frame) }, visible = false })
	H.eq(r.ok, true, "ok: " .. tostring(r.error))
	H.eq(frame.Visible, false, "hidden")
	H.eq(r.data.guiObjects, 1, "counted as a gui object")
	H.eq(r.data.parts, 0, "and not as a part")
end)

H.test("something with neither parts nor Visible is reported as skipped", function()
	local root = scene("HideNothing")
	local v = Instance.new("StringValue", root)
	v.Name = "Note"
	local r = reply("set_visible", { paths = { Paths.fullPath(v) }, visible = false })
	H.eq(r.ok, true, "ok: " .. tostring(r.error))
	H.eq(#r.data.skipped, 1, "reported rather than counted as done")
	H.eq(r.data.parts + r.data.guiObjects, 0, "nothing claimed")
end)

-- ================================================================ path lists ==

H.test("an empty path list is refused rather than reported as zero work done", function()
	local r = reply("set_locked", { paths = {}, locked = true })
	H.eq(r.ok, false, "refused")
end)

H.test("a path list longer than the cap is refused with its own length", function()
	local many = {}
	for i = 1, 201 do many[i] = "game.Workspace.X" .. i end
	local r = reply("set_locked", { paths = many, locked = true })
	H.eq(r.ok, false, "refused")
	H.ok(string.find(r.error, "201", 1, true), tostring(r.error))
end)

H.test("a path that is not a string is refused by index", function()
	local r = reply("set_locked", { paths = { "game.Workspace", 7 }, locked = true })
	H.eq(r.ok, false, "refused")
	H.ok(string.find(r.error, "paths[2]", 1, true), tostring(r.error))
end)

-- ================================================================ selection ==

H.test("a capped selection still reports the REAL size", function()
	--[[ A UI rendering #items as "N selected" when the user selected four thousand is a
		 failure to observe rendered as an observation. ]]
	local entries = {}
	local over = Companion.MAX_SELECTION + 50
	for i = 1, over do entries[i] = { path = "game.Workspace.P" .. i, class = "Part" } end
	local event = Companion.selectionEvent(entries, 1)
	H.eq(#event.items, Companion.MAX_SELECTION, "items are capped")
	H.eq(event.count, over, "count is the truth")
	H.eq(event.truncated, true, "and it says the list is partial")
end)

H.test("a small selection is not marked truncated", function()
	local event = Companion.selectionEvent({
		{ path = "game.Workspace.A", class = "Part" },
		{ path = "game.Workspace.B", class = "Model" },
	}, 1)
	H.eq(#event.items, 2, "both")
	H.eq(event.truncated, false, "nothing was cut")
	H.eq(event.items[2].class, "Model", "the class travels with the path")
end)

H.test("two instances sharing a path are BOTH reported", function()
	-- Two parts called "Part" under Workspace have one path between them. Deduping would
	-- under-report a selection the user really made.
	local event = Companion.selectionEvent({
		{ path = "game.Workspace.Part", class = "Part" },
		{ path = "game.Workspace.Part", class = "Part" },
	}, 1)
	H.eq(#event.items, 2, "both kept")
	H.eq(event.count, 2, "and counted")
end)

H.test("an empty selection is an event, not an absence", function()
	local event = Companion.selectionEvent({}, 3)
	H.eq(event.kind, "selection", "still an event")
	H.eq(event.count, 0, "of nothing")
	H.eq(event.clock, 3, "carrying its clock")
end)

H.test("sameSelection distinguishes ORDER, not just membership", function()
	local a = Companion.selectionEvent({ { path = "game.A" }, { path = "game.B" } }, 1)
	local b = Companion.selectionEvent({ { path = "game.B" }, { path = "game.A" } }, 2)
	H.eq(Companion.sameSelection(a, a), true, "a selection equals itself")
	H.eq(Companion.sameSelection(a, b), false, "a reordered selection is a different one")
end)

H.test("sameSelection is false against nothing, so the first report is always sent", function()
	local a = Companion.selectionEvent({}, 1)
	H.eq(Companion.sameSelection(a, nil), false, "against nil")
end)

-- =================================================== the F-57 membership check ==
--[[ `MUTATING` and `handlers` are two hand-maintained tables in one file. A companion op
	 missing from `MUTATING` mutates the user's place with NO undo point — which is the
	 exact failure Ops.execute's own header says it exists to prevent, and it is invisible
	 to every other test here because they all pass with or without the recording.

	 With the recording forced to refuse, a kind that is both registered and mutating can
	 only produce the recording refusal. "unknown op" means it is missing from `handlers`;
	 a success means it is missing from `MUTATING`. ]]

local COMPANION_MUTATING = {
	"transform_instances", "clone_instances", "group_instances",
	"ungroup_instances", "rename_instance", "set_locked", "set_visible",
}

for _, kind in COMPANION_MUTATING do
	H.test(kind .. " is registered AND declared mutating", function()
		history.__refuseNext = true
		local r = reply(kind)
		H.eq(r.ok, false, kind .. " ok")
		H.ok(
			string.find(r.error, "could not open an undo recording", 1, true),
			kind .. ": expected the recording refusal, got " .. tostring(r.error)
		)
	end)
end

H.report("companion")
