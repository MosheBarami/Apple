--!strict
-- Executes StudioOps from the Apple agent. Mutating ops are wrapped in
-- ChangeHistoryService recordings so every AI action is natively undoable.
local ChangeHistoryService = game:GetService("ChangeHistoryService")
local ScriptEditorService = game:GetService("ScriptEditorService")
local LogService = game:GetService("LogService")
local RunService = game:GetService("RunService")
local Selection = game:GetService("Selection")

local Companion = require(script.Parent.Companion)
local Generation = require(script.Parent.Generation)
local Paths = require(script.Parent.Paths)
local Render = require(script.Parent.Render)
local Serializer = require(script.Parent.Serializer)

local Ops = {}

local MUTATING = {
	edit_script = true, create_instances = true, set_props = true, delete_instances = true,
	move_instances = true, restore = true, insert_asset = true, run_code = true,
	generate_model = true,
	--[[ The companion's direct-manipulation ops. Every one of them changes the place, so
		 every one of them takes an undo recording — a user who drags a slider in the
		 companion panel and then presses Ctrl+Z in Studio must get their scene back.
		 `run_mode` is deliberately NOT here: starting or stopping the simulation changes
		 no property of any instance, and taking a recording for it would put an empty
		 entry in the user's undo stack. ]]
	transform_instances = true, clone_instances = true, group_instances = true,
	ungroup_instances = true, rename_instance = true, set_locked = true, set_visible = true,
}

-- Ops that assign typed properties, and are therefore the two ways an asset id can enter a place
-- without going through `insert_asset`. See the asset-policy section of Paths.luau.
local PROPERTY_OPS = { create_instances = true, set_props = true }

-- Ids this session has actually put through the gated insert path. `insert_asset` is the only op
-- the worker emits after verifying an id, so an id that reached it is one the session has already
-- imported: letting a later MeshId name it grants nothing the place does not already contain.
local sessionVerifiedAssets: { [number]: boolean } = {}

--- What the op may reference, opened for the duration of one op and closed after it. Spelled
--- structurally rather than as `Paths.AssetPolicy` because luau-lsp cannot resolve the plugin's
--- `script.Parent` requires outside Studio, and an unresolvable type name is a new analyze error.
local function assetPolicyFor(kind: string, opBody: any): { allow: { [number]: boolean }, preexisting: boolean }?
	if kind == "restore" then
		-- A snapshot is a record of what was ALREADY here — Serializer.snapshot read it out of this
		-- same place — so re-materialising it imports nothing. Refusing would make a rollback strip
		-- the user's own MeshIds, which is destruction dressed up as caution.
		return { allow = {}, preexisting = true }
	end
	if not PROPERTY_OPS[kind] then return nil end
	local allow: { [number]: boolean } = {}
	for id in sessionVerifiedAssets do
		allow[id] = true
	end
	-- Read off the op ENVELOPE, never out of `items`/`props`. The worker builds the envelope; the
	-- model authors the payload. That is the whole reason this list is trustworthy, and it is why a
	-- worker tool must never spread model-supplied arguments into a StudioOp.
	if type(opBody.verifiedAssetIds) == "table" then
		for _, id in opBody.verifiedAssetIds do
			if type(id) == "number" and id > 0 and id % 1 == 0 then
				allow[id] = true
			end
		end
	end
	return { allow = allow, preexisting = false }
end

local SCRIPT_CONTAINERS = {
	"Workspace", "ReplicatedStorage", "ServerScriptService", "ServerStorage",
	"StarterGui", "StarterPack", "StarterPlayer", "ReplicatedFirst",
}

local function eachScript(root: Instance?, fn: (Instance) -> boolean?)
	local roots: { Instance } = {}
	if root then
		roots = { root }
	else
		for _, name in SCRIPT_CONTAINERS do
			local ok, svc = pcall(function() return (game :: any):GetService(name) end)
			if ok and svc then table.insert(roots, svc) end
		end
	end
	for _, r in roots do
		if r:IsA("LuaSourceContainer") then
			if fn(r) then return end
		end
		for _, d in r:GetDescendants() do
			if d:IsA("LuaSourceContainer") then
				if fn(d) then return end
			end
		end
	end
end

local function createFromSpec(spec: any, parentOverride: Instance?, issues: { string }): Instance
	local parent = parentOverride or Paths.resolve(spec.parent)
	local inst = Instance.new(spec.className)
	inst.Name = spec.name or spec.className
	if spec.props then
		for p, pv in spec.props do
			local ok, err = pcall(Paths.setProp, inst, p, pv)
			if not ok then
				table.insert(issues, ("%s.%s: %s"):format(inst.Name, p, tostring(err)))
			end
		end
	end
	if spec.attributes then
		for k, pv in spec.attributes do
			local ok, err = pcall(function() inst:SetAttribute(k, Paths.decode(pv)) end)
			if not ok then
				table.insert(issues, ("%s@%s: %s"):format(inst.Name, k, tostring(err)))
			end
		end
	end
	if spec.children then
		for _, ch in spec.children do
			createFromSpec(ch, inst, issues)
		end
	end
	inst.Parent = parent
	return inst
end

local function escapeLuaPattern(str: string): string
	return (str:gsub("[%(%)%.%%%+%-%*%?%[%]%^%$]", "%%%0"))
end

--[[
	FNV-1a/32 over the bytes of a script, as lowercase hex.

	This has ONE job: agree, byte for byte, with `sourceHash` in apps/worker/src/luau-review.ts, so
	the worker can say "I computed this edit against exactly the text you still hold" and the write
	transaction can check it. The worker encodes to UTF-8 before hashing precisely because a Luau
	string already is its UTF-8 bytes and `string.byte` cannot see anything else.

	The multiply is split into 16-bit halves because `h * 16777619` reaches 2^56, past the point a
	double represents integers exactly — computing it directly gives a number that is close to the
	right answer and never equal to it, which is the worst possible failure for a comparison.
]]
local function sourceHash(s: string): string
	local h = 0x811c9dc5
	for i = 1, #s do
		h = bit32.bxor(h, string.byte(s, i))
		local lo = bit32.band(h, 0xffff)
		local hi = bit32.rshift(h, 16)
		h = ((hi * 16777619) % 65536) * 65536 + (lo * 16777619) % 4294967296
		h = h % 4294967296
	end
	return string.format("%08x", h)
end

local handlers: { [string]: (op: any) -> any } = {}

handlers.ping = function(_)
	return { pong = true }
end

handlers.get_tree = function(op)
	local root = if op.root then Paths.resolve(op.root) else nil
	return Serializer.tree(root, op.maxDepth or 4, op.maxNodes or 800)
end

handlers.get_instance = function(op)
	local inst = Paths.resolve(op.path)
	local props: any = {}
	for _, p in { "ClassName", "Name" } do
		props[p] = (inst :: any)[p]
	end
	local detail: any = { path = Paths.fullPath(inst), class = inst.ClassName, childCount = #inst:GetChildren() }
	local encoded = {}
	-- probe common properties safely
	for _, p in { "Position", "Size", "CFrame", "Anchored", "Color", "Material", "Transparency", "Text", "Value", "Image", "SoundId" } do
		local ok, v = pcall(function() return (inst :: any)[p] end)
		if ok and v ~= nil then encoded[p] = Paths.encode(v) end
	end
	detail.props = encoded
	local attrs = inst:GetAttributes()
	if next(attrs) then
		local a = {}
		for k, v in attrs do a[k] = Paths.encode(v) end
		detail.attributes = a
	end
	return detail
end

handlers.list_scripts = function(op)
	local root = if op.root then Paths.resolve(op.root) else nil
	local out = {}
	eachScript(root, function(s)
		local src = ScriptEditorService:GetEditorSource(s :: any)
		table.insert(out, {
			path = Paths.fullPath(s),
			class = s.ClassName,
			lines = select(2, string.gsub(src, "\n", "\n")) + 1,
		})
		return #out >= 400
	end)
	return { scripts = out }
end

handlers.read_script = function(op)
	local inst = Paths.resolve(op.path)
	if not inst:IsA("LuaSourceContainer") then error(op.path .. " is not a script") end
	local src = ScriptEditorService:GetEditorSource(inst :: any)
	-- The hash travels with the source so an edit computed from THIS read can be pinned to it.
	return { path = op.path, source = src, baseHash = sourceHash(src), class = inst.ClassName }
end

--[[
	Every script's path, class and source in one reply, under a total character budget.

	`truncated` is the honest half: when the budget or the file cap stops the walk, the caller is
	told, because a place-wide analysis over an unknowingly partial place reports "no require
	cycles" about scripts it never saw.
]]
handlers.dump_scripts = function(op)
	local root = if op.root then Paths.resolve(op.root) else nil
	local maxScripts = math.clamp(op.maxScripts or 80, 1, 400)
	local maxChars = math.clamp(op.maxChars or 400000, 1000, 2000000)
	local out = {}
	local used = 0
	local truncated = false
	eachScript(root, function(s)
		local src = ScriptEditorService:GetEditorSource(s :: any)
		if used + #src > maxChars then
			truncated = true
			return true
		end
		used += #src
		table.insert(out, {
			path = Paths.fullPath(s),
			class = s.ClassName,
			source = src,
			baseHash = sourceHash(src),
		})
		if #out >= maxScripts then
			truncated = true
			return true
		end
		return false
	end)
	return { scripts = out, truncated = truncated, chars = used }
end

handlers.edit_script = function(op)
	local inst: Instance? = nil
	local okResolve = pcall(function() inst = Paths.resolve(op.path) end)
	if not okResolve or not inst then
		if op.create then
			local parent = Paths.resolve(op.create.parent)
			local segs = Paths.parse(op.path)
			local name = segs[#segs]
			local s = Instance.new(op.create.className)
			s.Name = name
			s.Parent = parent
			inst = s
		else
			error("script not found: " .. op.path .. ' (pass create = {className, parent} to create it)')
		end
	end
	local script2 = inst :: Instance
	if not script2:IsA("LuaSourceContainer") then error(op.path .. " is not a script") end
	local applied: any = { path = Paths.fullPath(script2) }
	ScriptEditorService:UpdateSourceAsync(script2 :: any, function(old: string): string
		-- CONCURRENT EDIT CHECK, INSIDE THE TRANSACTION.
		--
		-- `source` mode replaces the file wholesale, so a Studio-side edit made between the read
		-- the worker computed against and this write is destroyed with no trace. Checking here
		-- rather than before the call is the whole point: `UpdateSourceAsync` hands us the text it
		-- is about to overwrite, which is the only moment the answer cannot go stale.
		if op.baseHash ~= nil and sourceHash(old) ~= op.baseHash then
			error(
				("%s changed in Studio since it was read — nothing was written. Read it again and re-apply the change on top of the current text."):format(op.path)
			)
		end
		if op.source ~= nil then
			applied.mode = "replace"
			return op.source
		end
		local newSrc = old
		local applenames = {}
		for i, e in (op.edits or {}) do
			local before = newSrc
			if e.all then
				newSrc = string.gsub(newSrc, escapeLuaPattern(e.find), (e.replace:gsub("%%", "%%%%")))
			else
				local at = string.find(newSrc, e.find, 1, true)
				if not at then error(("edit %d: text to find not present in %s"):format(i, op.path)) end
				newSrc = string.sub(newSrc, 1, at - 1) .. e.replace .. string.sub(newSrc, at + #e.find)
			end
			if before == newSrc then error(("edit %d changed nothing"):format(i)) end
			table.insert(applenames, i)
		end
		applied.mode = "edits"
		applied.editsApplied = #applenames
		return newSrc
	end)
	local finalSrc = ScriptEditorService:GetEditorSource(script2 :: any)
	applied.lines = select(2, string.gsub(finalSrc, "\n", "\n")) + 1
	-- The hash of what is now on disk, so the next edit can be pinned without re-reading.
	applied.baseHash = sourceHash(finalSrc)
	return applied
end

handlers.search_scripts = function(op)
	local root = if op.root then Paths.resolve(op.root) else nil
	local results = {}
	local maxResults = op.maxResults or 40
	eachScript(root, function(s)
		local src = ScriptEditorService:GetEditorSource(s :: any)
		local lineNum = 1
		for line in string.gmatch(src .. "\n", "([^\n]*)\n") do
			if string.find(line, op.query, 1, true) then
				table.insert(results, { path = Paths.fullPath(s), line = lineNum, text = string.sub(line, 1, 160) })
				if #results >= maxResults then return true end
			end
			lineNum += 1
		end
		return false
	end)
	return { matches = results, query = op.query }
end

handlers.create_instances = function(op)
	local created = {}
	local issues = {}
	for _, spec in op.items do
		local inst = createFromSpec(spec, nil, issues)
		table.insert(created, Paths.fullPath(inst))
	end
	local result: any = { created = created }
	if #issues > 0 then
		result.propIssues = issues -- instances were still created; fix these with set_properties
	end
	return result
end

handlers.set_props = function(op)
	local inst = Paths.resolve(op.path)
	local set = {}
	local issues = {}
	if op.props then
		for p, pv in op.props do
			local ok, err = pcall(Paths.setProp, inst, p, pv)
			if ok then table.insert(set, p) else table.insert(issues, p .. ": " .. tostring(err)) end
		end
	end
	if op.attributes then
		for k, pv in op.attributes do
			local ok, err = pcall(function() inst:SetAttribute(k, Paths.decode(pv)) end)
			if ok then table.insert(set, "@" .. k) else table.insert(issues, "@" .. k .. ": " .. tostring(err)) end
		end
	end
	local result: any = { path = op.path, set = set }
	if #issues > 0 then result.propIssues = issues end
	return result
end

handlers.delete_instances = function(op)
	local deleted = {}
	for _, p in op.paths do
		local inst = Paths.resolve(p)
		if inst.ClassName == "Terrain" or inst.ClassName == "Camera" or inst == game then
			error("refusing to delete " .. p)
		end
		inst:Destroy()
		table.insert(deleted, p)
	end
	return { deleted = deleted }
end

handlers.move_instances = function(op)
	local moved = {}
	for _, m in op.moves do
		local inst = Paths.resolve(m.path)
		inst.Parent = Paths.resolve(m.newParent)
		table.insert(moved, Paths.fullPath(inst))
	end
	return { moved = moved }
end

--[[ NON-TERMINATING LOOPS CANNOT BE PREEMPTED, so they are refused before they run.

	 The server sends `timeoutMs: 10_000` with every run_code op. This plugin has
	 never read it, and could not honour it if it did: `pcall(require, module)` runs
	 on Studio's main thread with no instruction budget, and a loop that never yields
	 never gives a watchdog a chance to fire. `while true do end` hard-freezes Studio
	 and the only recovery is killing it and losing unsaved work. The server giving up
	 after 25s stops it WAITING; it does not stop Studio spinning.

	 There is no in-engine fix for the general case, so this refuses the specific case
	 that actually happens: an LLM emitting a loop with no yield in its body. A loop
	 that calls task.wait / wait / RunService:Wait / :Wait() is fine — it yields, so
	 Studio stays responsive and the op simply takes as long as it takes.

	 Deliberately a narrow syntactic check, not an analysis. It catches the common
	 mistake and says exactly why; it does not pretend to decide halting. A loop whose
	 exit condition is merely never satisfied still hangs, and that limit is stated
	 rather than papered over. ]]
--[[ `:Wait%w*%(` rather than `:Wait%s*%(`: the narrow version refused
	 `workspace:WaitForChild("X")`, which yields perfectly well — caught by testing the
	 guard against real samples rather than by reading it. The DataStore and HTTP calls
	 are here for the same reason: they yield, so a loop containing one keeps Studio
	 responsive however long it runs. ]]
--[[ CALLS THAT ACTUALLY YIELD THE CALLING THREAD.
	 Three entries were removed on 2026-09-01 because they do not, and their presence
	 made the gate wave through the exact freeze it exists to catch:

	   task.spawn  resumes f on a NEW thread and returns immediately
	   task.defer  schedules f for the next resumption point and returns immediately
	   task.delay  schedules f for later and returns immediately

	 None of them suspends the caller, so `while true do task.spawn(f) end` spins
	 forever AND spawns unbounded threads. Verified by running the gate over it.

	 A bare "RunService" was removed for a different reason: it matched the mere
	 MENTION of the service, so `while true do print(RunService) end` passed. The
	 form that genuinely yields — `RunService.Heartbeat:Wait()` — is already caught
	 by the `:Wait(` entry below, so nothing is lost.

	 `task.wait` is kept although `%f[%w]wait%s*%(` already matches it through the
	 dot: it is the clearest thing to read here, and the redundancy is now stated
	 rather than rediscovered. ]]
local YIELDS = {
	"task%.wait",
	"%f[%w]wait%s*%(",
	":Wait%w*%s*%(",
	":GetAsync", ":SetAsync", ":UpdateAsync", ":IncrementAsync",
	":RequestAsync",
}

--[[ Where the block opened just before `from` closes.

	 The old gate took `stripped:sub(to + 1)` — EVERYTHING after the loop header — as
	 the loop's body, so a yield anywhere later in the file satisfied it and
	 `while true do end` followed by a `task.wait()` on the next line passed. Measured,
	 not theorised.

	 Counting is by block opener rather than by `do`/`then` pairs, because
	 `if/elseif/else` share ONE `end`: `if` opens, `then` is ignored, and the single
	 `end` closes it. Openers are `if`, `do`, `function`, `repeat`; closers are `end`
	 and `until`. `while x do` and `for x do` are covered because their `do` is the
	 opener. Strings and comments are already gone by the time this runs. ]]
local function blockEnd(src: string, from: number): number
	local depth = 1
	local i = from
	while i <= #src do
		local s, e, word = string.find(src, "%f[%a](%a+)%f[%A]", i)
		if not s then break end
		if word == "if" or word == "do" or word == "function" or word == "repeat" then
			depth += 1
		elseif word == "end" or word == "until" then
			depth -= 1
			if depth == 0 then return (s :: number) - 1 end
		end
		i = (e :: number) + 1
	end
	return #src
end

local LOOP_HEADS = {
	-- `while (true) do` is the same loop; the optional parens were previously a bypass.
	{ pat = "while%s*%(?%s*true%s*%)?%s*do%f[%W]", kind = "while" },
	{ pat = "while%s*%(?%s*1%s*%)?%s*do%f[%W]", kind = "while" },
	{ pat = "repeat%f[%W]", kind = "repeat" },
}

local function refuseNonYieldingLoop(code: string): string?
	-- Strip strings and comments first, so a loop keyword inside a literal is not a hit.
	-- Long-bracket strings are stripped too: without that, printing a long-bracket
	-- literal whose text happens to contain a loop keyword was refused as though the
	-- literal were code. (Written as line comments on purpose — the example that
	-- motivated it cannot be quoted inside a block comment without closing it.)
	local stripped = code
		:gsub("%-%-%[%[.-%]%]", " ")
		:gsub("%-%-[^\n]*", " ")
		:gsub("%[%[.-%]%]", " ")
		:gsub('"[^"\n]*"', '""')
		:gsub("'[^'\n]*'", "''")

	--[[ EVERY loop, not just the first of each shape. The old code took one match per
		 pattern and returned on it, so a guarded loop followed by an unguarded one
		 reported the guarded verdict for both. ]]
	for _, head in LOOP_HEADS do
		local searchAt = 1
		while true do
			local from, to = stripped:find(head.pat, searchAt)
			if not from then break end
			searchAt = (to :: number) + 1

			local closeAt = blockEnd(stripped, (to :: number) + 1)
			local body = stripped:sub((to :: number) + 1, closeAt)

			if head.kind == "repeat" then
				-- `repeat` only hangs on `until false`; anything else may terminate.
				local tail = stripped:sub(closeAt + 1)
				if not tail:find("^%s*until%s+false%f[%W]") then
					continue
				end
			end

			local yields = false
			for _, y in YIELDS do
				if body:find(y) then
					yields = true
					break
				end
			end
			if not yields then
				return "refused: this code contains a loop with no yield in it (no task.wait, wait() or "
					.. ":Wait()). Such a loop cannot be interrupted and would freeze Studio permanently. "
					.. "Add a yield inside the loop, or give it a bounded counter. Note that task.spawn, "
					.. "task.defer and task.delay do NOT yield the thread that calls them."
			end
		end
	end
	return nil
end

handlers.run_code = function(op)
	local refusal = refuseNonYieldingLoop(tostring(op.code or ""))
	if refusal then
		return { error = refusal }
	end
	local module = Instance.new("ModuleScript")
	module.Name = "AppleEval"
	-- NOTE: long-bracket strings swallow a leading newline, so join segments explicitly
	local header = [[
local __prints = {}
local print = function(...)
	local parts = {}
	for i = 1, select("#", ...) do parts[i] = tostring(select(i, ...)) end
	table.insert(__prints, table.concat(parts, " "))
end
local warn = print
local __fn = function()]]
	local footer = [[
end
local ok, res = pcall(__fn)
return { ok = ok, res = res, prints = __prints }]]
	module.Source = header .. "\n" .. (op.code or "") .. "\n" .. footer
	local ok, result = pcall(require, module)
	module:Destroy()
	if not ok then
		error("code did not compile: " .. tostring(result))
	end
	local r = result :: any
	if not r.ok then
		return { error = "runtime error: " .. tostring(r.res), prints = r.prints }
	end
	return { result = Paths.encode(r.res), prints = r.prints }
end

handlers.get_logs = function(op)
	local history = LogService:GetLogHistory()
	local maxEntries = op.maxEntries or 100
	local out = {}
	local levelNames = {
		[Enum.MessageType.MessageOutput] = "output",
		[Enum.MessageType.MessageInfo] = "info",
		[Enum.MessageType.MessageWarning] = "warn",
		[Enum.MessageType.MessageError] = "error",
	}
	local from = math.max(1, #history - maxEntries + 1)
	for i = from, #history do
		local e = history[i]
		table.insert(out, {
			message = string.sub(e.message, 1, 400),
			level = levelNames[e.messageType] or "output",
			clock = e.timestamp,
		})
	end
	return { entries = out, total = #history }
end

--[[ THE TEST CONTROLS.

	 This was `if op.action == "start" then Run() else Stop() end`, and the `else` is the
	 whole reason it is now written out. EVERY action that was not exactly "start"
	 stopped the user's simulation: a typo, an action a newer worker sends to an older
	 plugin, anything at all. A control surface whose unknown input is "stop" is a
	 control surface that fails open, and it fails open onto the one button nobody wants
	 pressed by accident mid-playtest.

	 The decision is `Companion.planTest`, which is pure and is where the state machine is
	 tested. This function is the effect: read the two flags, ask for a plan, make the
	 calls. Pause and resume are the state the flags disagree about — run mode still on,
	 simulation not stepping — which is why both are read rather than just IsRunning. ]]
handlers.run_mode = function(op)
	local before = { running = RunService:IsRunning(), runMode = (RunService :: any):IsRunMode() }
	local plan, refusal = Companion.planTest(op.action, before.running, before.runMode)
	if not plan then
		return { error = refusal }
	end
	for _, call in (plan :: any).calls do
		(RunService :: any)[call](RunService)
	end
	return {
		action = op.action,
		note = (plan :: any).note,
		noop = (plan :: any).noop,
		calls = (plan :: any).calls,
		-- The state AFTER the calls, read back rather than predicted. A companion panel
		-- that rendered the state it assumed would show "running" for a Run() the engine
		-- refused.
		running = RunService:IsRunning(),
		runMode = (RunService :: any):IsRunMode(),
		-- Kept for the worker's playtest tool, which has read these two since before the
		-- panel existed and would otherwise read nil as "it did not start".
		started = (not before.running) and RunService:IsRunning() or nil,
		stopped = before.runMode and not (RunService :: any):IsRunMode() or nil,
	}
end

handlers.get_selection = function(_)
	local out = {}
	for _, inst in Selection:Get() do
		table.insert(out, { path = Paths.fullPath(inst), class = inst.ClassName })
	end
	return { selection = out }
end

handlers.select = function(op)
	local insts = {}
	for _, p in op.paths do
		table.insert(insts, Paths.resolve(p))
	end
	Selection:Set(insts)
	return { selected = #insts }
end

handlers.camera_focus = function(op)
	local inst = Paths.resolve(op.path)
	local camera = workspace.CurrentCamera
	if not camera then error("no camera") end
	local target: Vector3
	local radius = 10
	if inst:IsA("BasePart") then
		target = inst.Position
		radius = inst.Size.Magnitude
	elseif inst:IsA("Model") then
		local cf, size = inst:GetBoundingBox()
		target = cf.Position
		radius = size.Magnitude
	else
		error("cannot focus non-spatial instance")
	end
	local dist = math.max(radius * 1.6, 12)
	camera.CFrame = CFrame.lookAt(target + Vector3.new(dist * 0.6, dist * 0.55, dist * 0.6), target)
	return { focused = op.path }
end

handlers.viewport_info = function(_)
	local camera = workspace.CurrentCamera
	local info: any = {}
	if camera then
		info.camera = { cframe = { camera.CFrame:GetComponents() }, fov = camera.FieldOfView }
	end
	local spatial = {}
	for _, child in workspace:GetChildren() do
		if #spatial >= 60 then break end
		if child:IsA("Model") then
			local ok, cf, size = pcall(function()
				local c, s = child:GetBoundingBox()
				return c, s
			end)
			if ok and cf then
				table.insert(spatial, {
					path = Paths.fullPath(child), class = "Model",
					center = { math.round(cf.Position.X), math.round(cf.Position.Y), math.round(cf.Position.Z) },
					size = { math.round(size.X), math.round(size.Y), math.round(size.Z) },
				})
			end
		elseif child:IsA("BasePart") then
			table.insert(spatial, {
				path = Paths.fullPath(child), class = child.ClassName,
				center = { math.round(child.Position.X), math.round(child.Position.Y), math.round(child.Position.Z) },
				size = { math.round(child.Size.X), math.round(child.Size.Y), math.round(child.Size.Z) },
			})
		end
	end
	info.workspaceTopLevel = spatial
	return info
end

-- Studio exposes no viewport readback to plugins, so these rasterise the scene themselves and
-- hand back real pixels. See Render.luau for why that is the only option.
handlers.render_view = function(op)
	return Render.capture(op.target, op.view or "hero", op.width or 288, op.height or 180)
end

handlers.screenshot = function(op)
	return Render.capture(op.target, "hero", 288, 180)
end

handlers.snapshot = function(op)
	return Serializer.snapshot(op.includeScripts ~= false)
end

handlers.restore = function(op)
	return Serializer.restore(op.snapshot)
end

-- The GetObjects adapter lives in Generation.luau so the plugin has exactly ONE call site for it;
-- see the comment there for why InsertService:LoadAsset cannot be used from plugin context.
handlers.insert_asset = function(op)
	local parent = Paths.resolve(op.parent or "game.Workspace")
	local res = Generation.insertAsset(op.assetId, parent)
	if not res.ok then return { error = res.error } end
	-- Recorded only on success, and only here: this is the one op that carries a gate verdict.
	sessionVerifiedAssets[op.assetId] = true
	local placed = {}
	for _, obj in res.instances do
		table.insert(placed, Paths.fullPath(obj))
	end
	return { inserted = placed }
end

handlers.generate_model = function(op)
	local parent = Paths.resolve(op.parent or "game.Workspace")
	local out = Generation.generateAndInspect({
		prompt = op.prompt,
		maxTriangles = op.maxTriangles,
		predefinedSchema = op.predefinedSchema,
		parent = parent,
	}, { intent = op.intent })
	if not out.generation.ok then
		return { error = out.generation.error, rateLimit = out.generation.rateLimit }
	end
	local model = out.generation.model :: Model
	return {
		path = Paths.fullPath(model),
		elapsedSeconds = math.floor(out.generation.elapsedSeconds),
		sessionScoped = true,
		rateLimit = out.generation.rateLimit,
		qc = out.qc,
		qcText = if out.qc then Generation.verdictToText(out.qc) else nil,
	}
end

handlers.inspect_model = function(op)
	local inst = Paths.resolve(op.path)
	local verdict = Generation.inspect(inst, { intent = op.intent })
	return { qc = verdict, qcText = Generation.verdictToText(verdict) }
end

-- ------------------------------------------------ companion direct manipulation --
--[[
	The ops behind the Studio companion's own controls: transform, clone, group,
	ungroup, rename, lock and hide. These are what a person clicks, with no model in
	the loop, so they are held to a different standard than an agent tool — a wrong
	answer here is not a bad suggestion, it is the user's own scene rearranged.

	THREE RULES THEY ALL FOLLOW.

	  1. RESOLVE EVERYTHING BEFORE CHANGING ANYTHING. A bad path in position 7 must
	     leave positions 1-6 untouched. `Ops.execute` cancels the recording on a raise,
	     which covers the real engine, but the op should not depend on that alone.
	  2. REFUSE BY RAISING, not by returning `{ error = … }`. A returned error still
	     COMMITS the recording (see `Ops.execute`: the pcall succeeded), so a refusal
	     that returns leaves an empty entry on the user's undo stack. A raise cancels.
	  3. REPORT WHAT DID NOT HAPPEN. Every one of these returns the paths it skipped
	     rather than folding them into a success count, because a companion panel that
	     says "4 locked" when it locked nothing is a failure to observe rendered as an
	     observation.
]]

--- A validated list of paths from the op envelope. Bounded, because these ops are
--- driven by a selection and a Studio user can select a whole place with one drag.
local function pathList(op: any, field: string): { string }
	local raw = op[field]
	if type(raw) ~= "table" then
		return error(("%s: expected a list of paths, got %s"):format(field, typeof(raw)))
	end
	local list = raw :: { any }
	if #list == 0 then
		return error(("%s: no paths given"):format(field))
	end
	if #list > 200 then
		return error(("%s: at most 200 paths per op, got %d"):format(field, #list))
	end
	local out: { string } = {}
	for i, p in list do
		if type(p) ~= "string" then
			return error(("%s[%d]: a path must be a string, got %s"):format(field, i, typeof(p)))
		end
		table.insert(out, p)
	end
	return out
end

--- Every BasePart this instance is, or contains.
local function partsUnder(inst: Instance): { BasePart }
	local out: { BasePart } = {}
	if inst:IsA("BasePart") then
		table.insert(out, inst :: BasePart)
		return out
	end
	for _, d in inst:GetDescendants() do
		if d:IsA("BasePart") then
			table.insert(out, d :: BasePart)
		end
	end
	return out
end

--- The first free sibling name under `parent` derived from `base`.
local function uniqueName(parent: Instance, base: string): string
	if not parent:FindFirstChild(base) then
		return base
	end
	for n = 2, 999 do
		local candidate = ("%s (%d)"):format(base, n)
		if not parent:FindFirstChild(candidate) then
			return candidate
		end
	end
	return error(("%s already holds 999 things called %q"):format(Paths.fullPath(parent), base))
end

--[[ A transform turns parts about a point. This is the point, and those are the parts.

	 Each target turns about ITS OWN centre rather than about the centre of the whole
	 selection. That is a choice, and it is the one that composes: rotating three models
	 ninety degrees leaves each of them rotated in place, which is what "rotate these"
	 means when the things are separate objects. Turning them about a shared centroid
	 would also FLING them around each other, and a user who wanted that asked for a
	 different control. ]]
local function spatialBody(inst: Instance): (Vector3?, { BasePart })
	if inst:IsA("BasePart") then
		return (inst :: BasePart).Position, { inst :: BasePart }
	end
	if inst:IsA("Model") then
		local parts = partsUnder(inst)
		if #parts == 0 then
			return nil, {}
		end
		local cf = (inst :: Model):GetBoundingBox()
		return cf.Position, parts
	end
	return nil, {}
end

handlers.transform_instances = function(op)
	local plan, refusal = Companion.planTransform(op)
	if not plan then
		return error(refusal)
	end
	local p = plan :: any
	local paths = pathList(op, "paths")

	local targets = {}
	for _, path in paths do
		local inst = Paths.resolve(path)
		local origin, parts = spatialBody(inst)
		if not origin then
			return error(
				("transform_instances: %s is a %s with nothing to move. Only a BasePart, or a Model containing one, can be transformed."):format(
					path,
					inst.ClassName
				)
			)
		end
		table.insert(targets, { path = path, origin = origin :: Vector3, parts = parts })
	end

	local touched = 0
	for _, t in targets do
		for _, part in t.parts do
			local cf = part.CFrame
			-- Where the part ends up: its offset from the pivot, turned, scaled, then
			-- translated. `plan.rotate` is the identity and `plan.scale` is exactly 1
			-- when they were not asked for, so all three run unconditionally.
			local newPos = t.origin + p.rotate:VectorToWorldSpace(cf.Position - t.origin) * p.scale + p.move
			-- Its orientation: composed with the rotation, then re-seated at newPos.
			local turned = p.rotate * cf
			part.CFrame = turned + (newPos - turned.Position)
			if p.scaled then
				part.Size = part.Size * p.scale
			end
			touched += 1
		end
	end
	return {
		transformed = #targets,
		parts = touched,
		moved = p.moved,
		rotated = p.rotated,
		scaled = p.scaled,
	}
end

--[[ Clone, and why the copy is renamed.

	 Studio's own Ctrl+D leaves the copy sharing its source's name, and in Studio that is
	 harmless — the Explorer addresses instances by identity. This protocol addresses them
	 by PATH, and two siblings with one name have one path between them. A returned path
	 that resolves to the original is worse than no path at all: every later op the
	 companion sends about "the copy" would silently hit the thing it was copied from.

	 So the copy takes the first free `Name (n)`, and the path handed back resolves to the
	 copy. That is stated here because it is a visible difference from Studio. ]]
handlers.clone_instances = function(op)
	local paths = pathList(op, "paths")
	local parentOverride: Instance? = if op.parent then Paths.resolve(op.parent) else nil
	local sources = {}
	for _, path in paths do
		local inst = Paths.resolve(path)
		local refused = Companion.refuseStructural(inst, path, "clone")
		if refused then
			return error(refused)
		end
		if (inst :: any).Archivable == false then
			return error(
				("clone_instances: %s has Archivable off, which is the engine's own way of saying it must not be copied"):format(
					path
				)
			)
		end
		local parent = parentOverride or inst.Parent
		if not parent then
			return error(("clone_instances: %s has no parent, so there is nowhere to put the copy"):format(path))
		end
		table.insert(sources, { inst = inst, parent = parent :: Instance })
	end

	local created = {}
	for _, s in sources do
		local copy = s.inst:Clone()
		if not copy then
			return error(("clone_instances: the engine refused to copy %s"):format(Paths.fullPath(s.inst)))
		end
		copy.Name = uniqueName(s.parent, s.inst.Name)
		copy.Parent = s.parent
		table.insert(created, Paths.fullPath(copy))
	end
	return { created = created }
end

--[[ Group into a Model, the way Studio's Ctrl+G does: the new Model lands where the
	 FIRST target was, and everything else moves in beside it. Targets from elsewhere in
	 the tree are counted and reported rather than refused — reparenting into a Model
	 moves nothing in world space, so this is a reorganisation, not a relocation — but a
	 caller who did not mean to reach across the tree should be able to see that it
	 happened. ]]
handlers.group_instances = function(op)
	local paths = pathList(op, "paths")
	local name, nameErr = Companion.validateName(op.name or "Model", "group_instances")
	if not name then
		return error(nameErr)
	end

	local targets = {}
	for _, path in paths do
		local inst = Paths.resolve(path)
		local refused = Companion.refuseStructural(inst, path, "group")
		if refused then
			return error(refused)
		end
		if not inst.Parent then
			return error(("group_instances: %s has no parent"):format(path))
		end
		table.insert(targets, inst)
	end

	local home = (targets[1] :: Instance).Parent :: Instance
	local fromElsewhere = 0
	for _, inst in targets do
		if inst.Parent ~= home then
			fromElsewhere += 1
		end
	end

	local model = Instance.new("Model")
	model.Name = uniqueName(home, name :: string)
	model.Parent = home
	for _, inst in targets do
		inst.Parent = model
	end
	return { path = Paths.fullPath(model), grouped = #targets, fromOtherParents = fromElsewhere }
end

handlers.ungroup_instances = function(op)
	local paths = pathList(op, "paths")
	local targets = {}
	for _, path in paths do
		local inst = Paths.resolve(path)
		local refused = Companion.refuseStructural(inst, path, "ungroup")
		if refused then
			return error(refused)
		end
		if not (inst:IsA("Model") or inst:IsA("Folder")) then
			return error(
				("ungroup_instances: %s is a %s. Only a Model or a Folder holds children on behalf of something else; ungrouping anything else would move its parts out of the thing that owns them."):format(
					path,
					inst.ClassName
				)
			)
		end
		if not inst.Parent then
			return error(("ungroup_instances: %s has no parent to release its children into"):format(path))
		end
		table.insert(targets, inst)
	end

	local released = {}
	local removed = {}
	for _, inst in targets do
		local parent = inst.Parent :: Instance
		for _, child in inst:GetChildren() do
			child.Parent = parent
			table.insert(released, Paths.fullPath(child))
		end
		table.insert(removed, Paths.fullPath(inst))
		inst:Destroy()
	end
	return { released = released, removed = removed }
end

--[[ Rename, with the new path PROVED rather than assumed.

	 A rename is the one edit that changes how everything else addresses the instance.
	 `Paths.fullPath` and `Paths.parse` are two pieces of code that have to agree about
	 quoting for that address to survive, and a name a user typed is exactly the input
	 that finds the place they disagree. So the new path is resolved back here, in the
	 same op, and the rename is UNDONE if it does not land on the instance it names.

	 THE ROUND-TRIP CHECK CANNOT BE FALSIFIED TODAY, and should not be read as a tested
	 clause. `Companion.validateName` already refuses the one input known to break the
	 quoting (a double quote), and the sibling check below refuses the other way two
	 instances can share a path — so with both in place there is no name left that
	 reaches here and fails. It stays because it is the DISAGREEMENT that is being
	 guarded against: the day the two codecs drift, this catches it in the op that caused
	 it rather than in some later op that resolves to the wrong instance. The mutation
	 suite deliberately does not claim to cover it. ]]
handlers.rename_instance = function(op)
	if type(op.path) ~= "string" then
		return error(("rename_instance: path must be a string, got %s"):format(typeof(op.path)))
	end
	local inst = Paths.resolve(op.path)
	local refused = Companion.refuseStructural(inst, op.path, "rename")
	if refused then
		return error(refused)
	end
	local name, nameErr = Companion.validateName(op.name)
	if not name then
		return error(nameErr)
	end
	local wanted = name :: string
	local parent = inst.Parent
	if parent then
		local clash = parent:FindFirstChild(wanted)
		if clash and clash ~= inst then
			return error(
				("rename_instance: %s already has a child called %q, and two siblings sharing one name cannot both be addressed by path."):format(
					Paths.fullPath(parent),
					wanted
				)
			)
		end
	end

	local was = inst.Name
	inst.Name = wanted
	local after = Paths.fullPath(inst)
	local ok, back = pcall(Paths.resolve, after)
	if not ok or back ~= inst then
		inst.Name = was
		return error(
			("rename_instance: %q produces the path %s, which does not resolve back to this instance. The rename was undone."):format(
				wanted,
				after
			)
		)
	end
	return { path = after, was = was, name = wanted }
end

handlers.set_locked = function(op)
	if type(op.locked) ~= "boolean" then
		return error(("set_locked: locked must be true or false, got %s"):format(typeof(op.locked)))
	end
	local paths = pathList(op, "paths")
	local changed = 0
	local skipped = {}
	for _, path in paths do
		local inst = Paths.resolve(path)
		local parts = partsUnder(inst)
		if #parts == 0 then
			table.insert(skipped, path)
		end
		for _, part in parts do
			(part :: any).Locked = op.locked
			changed += 1
		end
	end
	return { locked = op.locked, parts = changed, skipped = skipped }
end

--[[ Hiding a part must not forget what it looked like.

	 A BasePart has no Visible property, so hiding one means Transparency = 1 and showing
	 it again means putting the old value back. Putting 0 back instead — the obvious
	 implementation — turns every deliberately translucent window, water plane and ghost
	 into solid plastic, and the user has no way to know which parts were changed.

	 The old value is kept in an attribute on the part itself, so it survives a save, a
	 reload, and a different companion session. Hiding something already hidden does NOT
	 overwrite it: the guard is `== nil`, so the FIRST hide is the one that is remembered
	 and a double hide is idempotent. ]]
local function setPartVisible(part: BasePart, visible: boolean)
	local remembered = part:GetAttribute(Companion.HIDDEN_ATTRIBUTE)
	if not visible then
		if remembered == nil then
			part:SetAttribute(Companion.HIDDEN_ATTRIBUTE, part.Transparency)
		end
		part.Transparency = 1
		return
	end
	if type(remembered) == "number" then
		part.Transparency = remembered
		part:SetAttribute(Companion.HIDDEN_ATTRIBUTE, nil)
	end
	-- No attribute means this part was never hidden by the companion. Showing it is
	-- already true, and forcing Transparency to 0 would be this op editing something
	-- nobody asked it to touch.
end

handlers.set_visible = function(op)
	if type(op.visible) ~= "boolean" then
		return error(("set_visible: visible must be true or false, got %s"):format(typeof(op.visible)))
	end
	local paths = pathList(op, "paths")
	local parts = 0
	local guiObjects = 0
	local skipped = {}
	for _, path in paths do
		local inst = Paths.resolve(path)
		local body = partsUnder(inst)
		if #body > 0 then
			for _, part in body do
				setPartVisible(part, op.visible)
				parts += 1
			end
		else
			-- Anything with a Visible property — every GuiObject — takes it directly.
			-- Anything else is reported as skipped rather than counted as done.
			local ok = pcall(function()
				(inst :: any).Visible = op.visible
			end)
			if ok then
				guiObjects += 1
			else
				table.insert(skipped, path)
			end
		end
	end
	return { visible = op.visible, parts = parts, guiObjects = guiObjects, skipped = skipped }
end

handlers.undo_waypoint = function(op)
	ChangeHistoryService:SetWaypoint(op.name or "Apple")
	return { waypoint = true }
end

--[[ WHAT KIND OF FAILURE WAS THAT?

	 `OpResult.error` is a sentence written for a human. Until this existed it was the ONLY thing
	 separating "that path does not exist" from "Studio never answered", so the agent decided
	 whether to retry by pattern-matching English — and a reworded error silently changed the
	 decision. `OpFailureKind` in packages/shared is the typed answer; the worker's op-failure.ts
	 turns a kind plus "does this op mutate" into a retry verdict.

	 NOTHING HERE READS AN ERROR MESSAGE. That is the whole discipline of this function. It
	 classifies from three things it genuinely owns:

	   * whether the op exists at all                     -> refused
	   * whether an undo recording could be opened        -> conflict
	   * whether the path the op ADDRESSED still resolves -> not_found

	 The third is an observation of the place as it stands now, not a guess about the wording: if
	 the instance the op was aimed at is not there, the failure is a missing target whatever the
	 handler happened to say on its way out.

	 EVERYTHING ELSE IS `internal`, WHICH IS NOT RETRYABLE. That is the deliberately conservative
	 default: an unclassified failure must never invite a repeat of a mutation. Narrowing it
	 further means giving the remaining `error(...)` sites structured kinds — a per-site change
	 across this file and Paths.luau — and until that is done, the honest report is "not known",
	 not a plausible guess. ]]
local function primaryPath(opBody: any): string?
	if type(opBody.path) == "string" then return opBody.path end
	if type(opBody.paths) == "table" and type(opBody.paths[1]) == "string" then return opBody.paths[1] end
	if type(opBody.root) == "string" then return opBody.root end
	if type(opBody.parent) == "string" then return opBody.parent end
	return nil
end

local function classifyFailure(opBody: any): string
	-- An op that CREATES the thing it names cannot be judged by whether that thing exists: the
	-- whole point of the call was that it did not.
	if opBody.create ~= nil then return "internal" end
	local path = primaryPath(opBody)
	if path then
		local ok = pcall(Paths.resolve, path)
		if not ok then return "not_found" end
	end
	return "internal"
end

function Ops.execute(id: string, opBody: any): any
	local kind = opBody.op
	local handler = handlers[kind]
	if not handler then
		-- `refused`, not `internal`: the plugin understood the request perfectly and declined it.
		-- An op this build does not implement is the one failure a retry can never fix, and an
		-- older installed build lacking a newer op is the steady state (see plugin-version.ts).
		return { id = id, ok = false, error = "unknown op: " .. tostring(kind), failure = "refused" }
	end
	local t0 = os.clock()
	--[[ A MUTATING OP WITHOUT A RECORDING IS REFUSED, NOT PERFORMED.

		 `TryBeginRecording` returns nil when a recording is already open — which
		 happens for real: a poll loop leaked by a plugin reload, or an op cancelled
		 mid-yield leaving its recording open forever. The old code took the nil,
		 ran the handler anyway, and then skipped both Commit and Cancel, reporting
		 ok = true. Two things followed, and the file's own header claim that "every
		 AI action is natively undoable" was false on exactly this path:

		   * NO UNDO. The place was modified and Ctrl+Z would not reverse it.
		   * NO ROLLBACK. `create_instances` parents each item as it goes, so an
		     invalid className on item 5 of 10 threw with items 1-4 already in the
		     place and nothing to Cancel — a half-modified place with no undo point,
		     which is the precise failure the recording exists to prevent.

		 Refusing is strictly better than proceeding. The agent sees a clear error
		 and can retry; the user's place is untouched. Losing an op is recoverable,
		 an un-undoable partial mutation is not. ]]
	local recording: string? = nil
	if MUTATING[kind] then
		recording = ChangeHistoryService:TryBeginRecording("Apple: " .. kind)
		if not recording then
			return {
				id = id,
				ok = false,
				error = "could not open an undo recording (another one is already open), so this "
					.. "mutation was refused rather than performed without one",
				-- `conflict`: Studio is not in a state that allows this, and it may well allow it
				-- later. It is NOT retryable automatically all the same — the open recording is
				-- usually a leaked one, and hammering it changes nothing.
				failure = "conflict",
			}
		end
	end
	-- Opened immediately before the handler and closed immediately after, so every path out of the
	-- handler — return, error, refusal — leaves the plugin back at "no asset may be referenced".
	Paths.setAssetPolicy(assetPolicyFor(kind, opBody))
	local ok, result = pcall(handler, opBody)
	Paths.setAssetPolicy(nil)
	if recording then
		ChangeHistoryService:FinishRecording(recording, if ok then Enum.FinishRecordingOperation.Commit else Enum.FinishRecordingOperation.Cancel)
	end
	local durationMs = math.floor((os.clock() - t0) * 1000)
	if not ok then
		return { id = id, ok = false, error = tostring(result), durationMs = durationMs, failure = classifyFailure(opBody) }
	end
	if type(result) == "table" and result.error then
		-- A handler that knows what kind of failure it produced says so; one that does not leaves
		-- the field off and the worker reads that as unclassified, never as retryable.
		local declared = if type(result.failure) == "string" then result.failure else nil
		return {
			id = id,
			ok = false,
			error = tostring(result.error),
			data = result,
			durationMs = durationMs,
			failure = declared or classifyFailure(opBody),
		}
	end
	return { id = id, ok = true, data = result, durationMs = durationMs }
end

return Ops
