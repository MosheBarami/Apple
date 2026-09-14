--!strict
-- Executes StudioOps from the Apple agent. Mutating ops are wrapped in
-- ChangeHistoryService recordings so every AI action is natively undoable.
local ChangeHistoryService = game:GetService("ChangeHistoryService")
local ScriptEditorService = game:GetService("ScriptEditorService")
local LogService = game:GetService("LogService")
local RunService = game:GetService("RunService")
local Selection = game:GetService("Selection")

local Generation = require(script.Parent.Generation)
local Paths = require(script.Parent.Paths)
local Render = require(script.Parent.Render)
local Serializer = require(script.Parent.Serializer)

local Ops = {}

local MUTATING = {
	edit_script = true, create_instances = true, set_props = true, delete_instances = true,
	move_instances = true, restore = true, insert_asset = true, run_code = true,
	generate_model = true,
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
	return { path = op.path, source = ScriptEditorService:GetEditorSource(inst :: any) }
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

handlers.run_mode = function(op)
	if op.action == "start" then
		if RunService:IsRunning() then return { alreadyRunning = true } end
		RunService:Run()
		return { started = true }
	else
		if not RunService:IsRunning() then return { alreadyStopped = true } end
		RunService:Stop()
		return { stopped = true }
	end
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

handlers.undo_waypoint = function(op)
	ChangeHistoryService:SetWaypoint(op.name or "Apple")
	return { waypoint = true }
end

function Ops.execute(id: string, opBody: any): any
	local kind = opBody.op
	local handler = handlers[kind]
	if not handler then
		return { id = id, ok = false, error = "unknown op: " .. tostring(kind) }
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
		return { id = id, ok = false, error = tostring(result), durationMs = durationMs }
	end
	if type(result) == "table" and result.error then
		return { id = id, ok = false, error = tostring(result.error), data = result, durationMs = durationMs }
	end
	return { id = id, ok = true, data = result, durationMs = durationMs }
end

return Ops
