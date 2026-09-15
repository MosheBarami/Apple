--!strict
--[[
	The Studio companion's decision layer.

	WHAT THIS FILE IS FOR. The companion ops — test controls, transforms, the Explorer
	edits, selection sync — all have the same shape: a payload arrives over the wire,
	and something irreversible happens to the user's open place. Every one of them is
	one bad number away from destroying work that has no undo outside Studio.

	So the DECISION is separated from the EFFECT. Everything here is a pure function of
	its arguments: no `game`, no services, no engine reads. A spec can therefore hand
	these functions the exact violating input — a NaN scale, an unknown action, a name
	that cannot round-trip through a path — and watch them refuse, which is the only way
	a guard is ever actually tested. `Ops.luau` holds the engine calls and nothing else.

	WHY `finite` EXISTS AND IS USED EVERYWHERE. Luau's `or` defaults and every `>`
	comparison fail open on NaN: `scale or 1` keeps a NaN, `scale > 0` is FALSE for NaN
	so a `if scale <= 0 then refuse` gate waves it through, and `part.Size * (0/0)` is a
	part with no size that no undo point was taken for. `math.huge` does the same in the
	other direction. Numbers crossing this boundary are checked for being numbers at all,
	then for being finite, then for being in range — in that order, because each check is
	meaningless without the one before it.
]]

local Companion = {}

-- ---------------------------------------------------------------- numbers --

--[[ The value as a finite number, or nil.

	 nil for: a non-number (a JSON string "5" included), NaN, and either infinity.
	 `v ~= v` is the NaN test — NaN is the only value not equal to itself, and it is
	 the one a range check cannot catch, because every comparison against it is false. ]]
function Companion.finite(v: any): number?
	if type(v) ~= "number" then return nil end
	if v ~= v then return nil end
	if v == math.huge or v == -math.huge then return nil end
	return v
end

--- A finite number inside [lo, hi], or nil. Written in terms of `finite` so the NaN
--- case cannot be reintroduced by someone writing the range test on its own.
local function inRange(v: any, lo: number, hi: number): number?
	local n = Companion.finite(v)
	if not n then return nil end
	if n < lo or n > hi then return nil end
	return n
end
Companion.inRange = inRange

-- ------------------------------------------------------------ test controls --

--[[ WHAT A PLUGIN CAN AND CANNOT DRIVE, STATED ONCE.

	 Studio exposes exactly three simulation controls to plugin code:
	 `RunService:Run()`, `:Pause()` and `:Stop()`. That is the whole surface. There is
	 NO plugin API for Play Solo, for "Run Client", or for starting extra clients, so
	 those are not offered here — a companion button that silently did something else
	 would be worse than one that does not exist.

	 The five actions below are the ones that map onto that surface:
	   run      start the server simulation, or resume it if it is paused
	   pause    suspend a running simulation, leaving the DataModel live
	   resume   the other half of pause; refuses when nothing is paused
	   stop     end the simulation and return to Edit
	   restart  stop then run, so the place is re-simulated from the saved state

	 `start` is kept as an alias for `run` because the worker's playtest tool has sent
	 it since before this file existed. An alias is free; a silently changed meaning is
	 not. ]]
local TEST_ALIASES: { [string]: string } = { start = "run" }
local TEST_ACTIONS: { [string]: boolean } = {
	run = true,
	pause = true,
	resume = true,
	stop = true,
	restart = true,
}

--- The actions this build accepts, sorted, for use in a refusal message.
function Companion.testActions(): { string }
	local out = {}
	for name in TEST_ACTIONS do
		table.insert(out, name)
	end
	table.sort(out)
	return out
end

export type TestPlan = {
	--- Engine calls to make, in order. Each is a RunService method name.
	calls: { string },
	--- What the caller should be told happened. Never "ok".
	note: string,
	--- True when the plan is empty because the simulation was already in the asked-for
	--- state. A no-op is reported as a no-op rather than as an action.
	noop: boolean,
}

--[[ Turn an action plus the CURRENT simulation state into engine calls.

	 `running` and `runMode` are passed in rather than read, so the spec can drive all
	 six reachable states without a live Studio. They come from RunService:IsRunning()
	 and RunService:IsRunMode(). Paused is the state the two disagree about: run mode is
	 still on, but the simulation is not stepping — that derivation is the reason both
	 are taken rather than one.

	 THE BUG THIS REPLACES. `run_mode` used to be `if action == "start" then Run() else
	 Stop() end`. Every value that was not exactly "start" — a typo, a new action a
	 newer worker sends to an older plugin, a hand-built op — STOPPED the user's
	 simulation. An unknown action is now refused by name. ]]
function Companion.planTest(action: any, running: boolean, runMode: boolean): (TestPlan?, string?)
	if type(action) ~= "string" then
		return nil, ("run_mode: action must be a string, got %s"):format(typeof(action))
	end
	local wanted = TEST_ALIASES[action] or action
	if not TEST_ACTIONS[wanted] then
		return nil,
			("run_mode: %q is not a test control. This plugin drives %s — Studio exposes no plugin API for Play Solo or for extra clients, so those cannot be started from here."):format(
				action,
				table.concat(Companion.testActions(), ", ")
			)
	end

	if wanted == "run" then
		if running then
			return { calls = {}, note = "already running", noop = true }, nil
		end
		return { calls = { "Run" }, note = if runMode then "resumed" else "started", noop = false }, nil
	end

	if wanted == "pause" then
		if not runMode and not running then
			return nil, "run_mode: nothing is running, so there is nothing to pause. Start the simulation with action \"run\" first."
		end
		if not running then
			return { calls = {}, note = "already paused", noop = true }, nil
		end
		return { calls = { "Pause" }, note = "paused", noop = false }, nil
	end

	if wanted == "resume" then
		if running then
			return { calls = {}, note = "already running", noop = true }, nil
		end
		if not runMode then
			return nil, "run_mode: nothing is paused, so there is nothing to resume. Start the simulation with action \"run\"."
		end
		return { calls = { "Run" }, note = "resumed", noop = false }, nil
	end

	if wanted == "stop" then
		if not running and not runMode then
			return { calls = {}, note = "already stopped", noop = true }, nil
		end
		return { calls = { "Stop" }, note = "stopped", noop = false }, nil
	end

	-- restart. A restart must END RUNNING whatever it started from, which is why the
	-- cold case still issues Run rather than reporting that there was nothing to do.
	if running or runMode then
		return { calls = { "Stop", "Run" }, note = "restarted", noop = false }, nil
	end
	return { calls = { "Run" }, note = "started (nothing was running to restart)", noop = false }, nil
end

-- --------------------------------------------------------------- transforms --

--[[ LIMITS, AND WHY EACH ONE IS WHERE IT IS.

	 MAX_TRANSLATION  Roblox's world is float32. Past ~1e6 studs a position stops being
	                  representable to stud precision and a part "moved" there cannot be
	                  moved back to where it was. Refusing is recoverable; arriving there
	                  is not.
	 MIN_SCALE/MAX    A scale of 0 collapses every part to zero size, which destroys the
	                  geometry and is NOT reversed by scaling back up (0 * n = 0). A
	                  negative scale mirrors through the origin, which is never what a
	                  "scale by" control means. Both are refused rather than clamped: a
	                  clamp would silently do something the caller did not ask for.
	 MAX_DEGREES      A rotation is periodic, so a huge value is not dangerous — it is
	                  evidence the caller sent garbage, and saying so beats obeying it. ]]
local MAX_TRANSLATION = 1e6
local MIN_SCALE = 0.001
local MAX_SCALE = 1000
local MAX_DEGREES = 36000

export type TransformPlan = {
	move: Vector3,
	rotate: CFrame,
	scale: number,
	moved: boolean,
	rotated: boolean,
	scaled: boolean,
}

--- Three finite numbers from a wire triple, or a refusal naming the component at fault.
local function triple(field: string, raw: any, limit: number): ({ number }?, string?)
	if type(raw) ~= "table" then
		return nil, ("transform_instances: %s must be a list of three numbers, got %s"):format(field, typeof(raw))
	end
	local list = raw :: { any }
	if #list ~= 3 then
		return nil, ("transform_instances: %s needs exactly three components, got %d"):format(field, #list)
	end
	local out = {}
	for i = 1, 3 do
		local n = inRange(list[i], -limit, limit)
		if not n then
			return nil,
				("transform_instances: %s[%d] must be a finite number within +-%g, got %s"):format(
					field,
					i,
					limit,
					tostring(list[i])
				)
		end
		out[i] = n
	end
	return out, nil
end

--[[ Validate a transform request and reduce it to the three things applying it needs.

	 The identity elements are EXACT, not approximate: a request that only rotates comes
	 back with `move` equal to Vector3.zero and `scale` equal to 1, so applying it
	 translates by exactly nothing and multiplies every size by exactly one. That is what
	 makes it safe for the apply step to run all three unconditionally. ]]
function Companion.planTransform(op: any): (TransformPlan?, string?)
	if type(op) ~= "table" then
		return nil, "transform_instances: expected an op body"
	end

	local move = Vector3.zero
	local moved: boolean = false
	if op.move ~= nil then
		local v, err = triple("move", op.move, MAX_TRANSLATION)
		if not v then
			return nil, err
		end
		local t = v :: { number }
		move = Vector3.new(t[1], t[2], t[3])
		moved = true
	end

	local rotate = CFrame.new(0, 0, 0)
	local rotated: boolean = false
	if op.rotate ~= nil then
		local v, err = triple("rotate", op.rotate, MAX_DEGREES)
		if not v then
			return nil, err
		end
		local t = v :: { number }
		rotate = CFrame.Angles(math.rad(t[1]), math.rad(t[2]), math.rad(t[3]))
		rotated = true
	end

	local scale = 1
	local scaled: boolean = false
	if op.scale ~= nil then
		local s = inRange(op.scale, MIN_SCALE, MAX_SCALE)
		if not s then
			return nil,
				("transform_instances: scale must be a finite number between %g and %g, got %s. A scale of zero or less destroys the geometry rather than resizing it."):format(
					MIN_SCALE,
					MAX_SCALE,
					tostring(op.scale)
				)
		end
		scale = s
		scaled = true
	end

	if not moved and not rotated and not scaled then
		return nil, "transform_instances: nothing to do — pass at least one of move, rotate or scale."
	end

	-- Built into a NAMED local rather than returned as a bare literal. Luau infers a table
	-- literal's boolean fields as the singleton `false | true` rather than `boolean`, which is not
	-- exactly TransformPlan and made the analyzer reject a plan that is perfectly correct. Naming
	-- the type at construction is the fix; a `::` cast here would have silenced the same complaint
	-- while also silencing a real mismatch the day this shape changes.
	local plan: TransformPlan =
		{ move = move, rotate = rotate, scale = scale, moved = moved, rotated = rotated, scaled = scaled }
	return plan, nil
end

-- ------------------------------------------------------------------- names --

local MAX_NAME = 100

--[[ A name that survives the round trip through a path.

	 `Paths.fullPath` brackets any name that is not a bare identifier and escapes a
	 double quote inside it; `Paths.parse` closes a bracket at the first `"]`. Those two
	 disagree about an embedded quote, so an instance named `Door"]` gets a path that
	 resolves to something else — or to nothing. Every later op on that instance then
	 addresses the wrong thing, silently.

	 Dots are ALLOWED, because the bracket form handles them correctly and Studio lets a
	 user type them; refusing them would be this file inventing a rule the engine does
	 not have. ]]
function Companion.validateName(raw: any, forOp: string?): (string?, string?)
	local who = forOp or "rename_instance"
	if type(raw) ~= "string" then
		return nil, ("%s: name must be a string, got %s"):format(who, typeof(raw))
	end
	local trimmed = (string.match(raw, "^%s*(.-)%s*$") :: string)
	if trimmed == "" then
		return nil, ("%s: a name cannot be empty or only whitespace."):format(who)
	end
	if #trimmed > MAX_NAME then
		return nil, ("%s: a name may be at most %d characters, got %d."):format(who, MAX_NAME, #trimmed)
	end
	if string.find(trimmed, '"', 1, true) then
		return nil,
			("%s: a name may not contain a double quote — it cannot be addressed by path afterwards, so every later op would resolve to the wrong instance."):format(
				who
			)
	end
	if string.find(trimmed, "%c") then
		return nil, ("%s: a name may not contain control characters."):format(who)
	end
	return trimmed, nil
end

-- --------------------------------------------------------------- selection --

--[[ How many selected instances the plugin will describe per poll.

	 A Studio user can select ten thousand parts with one drag. Sending all of them would
	 put a megabyte of paths through a poll body that also carries op results, on a loop
	 that runs every few seconds. ]]
local MAX_SELECTION = 100

--[[ The selection event, capped but never misreported.

	 `count` is the REAL size of the selection; `items` is the part of it that fits.
	 Those are deliberately two numbers: a UI that renders `#items` as "3 selected" when
	 the user selected 4,000 is showing a failure to observe as an observation. When the
	 cap bites, `truncated` says so and `count` still tells the truth.

	 Duplicates are NOT removed. Two parts both named "Part" under Workspace have the
	 same full path, and dropping one would under-report a real selection. ]]
function Companion.selectionEvent(entries: { any }, clock: number): any
	local items = {}
	for _, e in entries do
		if #items >= MAX_SELECTION then
			break
		end
		if type(e) == "table" and type(e.path) == "string" and e.path ~= "" then
			table.insert(items, { path = e.path, class = tostring(e.class or "Instance") })
		end
	end
	return {
		kind = "selection",
		items = items,
		count = #entries,
		-- Truncation is a statement about the CAP, not about how many entries survived
		-- shaping. Deriving it from `#items` would report "truncated" for a selection that
		-- merely contained something unreadable, which is a different fact.
		truncated = #entries > MAX_SELECTION,
		clock = clock,
	}
end

--- How many selected instances one event will describe. Exposed so a spec can drive the
--- cap from the constant rather than from a number copied beside it.
Companion.MAX_SELECTION = MAX_SELECTION

--- Do two selection events describe the same selection? Used to keep an unchanged
--- selection off the wire: Studio raises SelectionChanged for a re-click of the same
--- instance, and a poll body that repeats itself every two seconds is pure cost.
function Companion.sameSelection(a: any, b: any): boolean
	if type(a) ~= "table" or type(b) ~= "table" then
		return false
	end
	if a.count ~= b.count then
		return false
	end
	local ai, bi = a.items or {}, b.items or {}
	if #ai ~= #bi then
		return false
	end
	for i = 1, #ai do
		if ai[i].path ~= bi[i].path then
			return false
		end
	end
	return true
end

-- ------------------------------------------------------- structural targets --

--[[ Instances the companion refuses to restructure.

	 Terrain and the Camera are engine-owned children of Workspace: cloning one produces
	 an object the engine will not accept, and renaming one breaks every script that
	 looks it up by name. A SERVICE (a direct child of `game`) is worse — `game.Workspace`
	 renamed is a place whose scripts no longer resolve anything.

	 This is the same refusal `delete_instances` already makes for Terrain and the Camera,
	 extended to services and applied to every structural op rather than to one of them. ]]
local PROTECTED_CLASSES: { [string]: boolean } = { Terrain = true, Camera = true }

function Companion.refuseStructural(inst: Instance, path: string, verb: string): string?
	if inst == (game :: any) then
		return ("refusing to %s the DataModel itself (%s)"):format(verb, path)
	end
	if PROTECTED_CLASSES[inst.ClassName] then
		return ("refusing to %s %s: %s is engine-owned and cannot be replaced"):format(verb, path, inst.ClassName)
	end
	if inst.Parent == (game :: any) then
		return ("refusing to %s %s: it is a service, and scripts resolve services by name"):format(verb, path)
	end
	return nil
end

--- The attribute that remembers what a part looked like before it was hidden.
--- Named, not derived: an unhide that guessed `Transparency = 0` would turn every
--- deliberately translucent window into glass on its way back.
Companion.HIDDEN_ATTRIBUTE = "AppleHiddenTransparency"

return Companion
