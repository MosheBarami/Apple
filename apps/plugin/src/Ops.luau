--!strict
-- Executes StudioOps from the Golem agent. Mutating ops are wrapped in
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

handlers.run_code = function(op)
	local module = Instance.new("ModuleScript")
	module.Name = "GolemEval"
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
	ChangeHistoryService:SetWaypoint(op.name or "Golem")
	return { waypoint = true }
end

function Ops.execute(id: string, opBody: any): any
	local kind = opBody.op
	local handler = handlers[kind]
	if not handler then
		return { id = id, ok = false, error = "unknown op: " .. tostring(kind) }
	end
	local t0 = os.clock()
	local recording: string? = nil
	if MUTATING[kind] then
		local rec = ChangeHistoryService:TryBeginRecording("Golem: " .. kind)
		recording = rec
	end
	local ok, result = pcall(handler, opBody)
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
