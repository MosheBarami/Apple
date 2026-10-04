--!nocheck
--
-- Bounded adapter for Roblox's current GenerationService:GenerateModelAsync API.
--
-- The engine call cannot be cancelled once it starts.  This adapter therefore treats every
-- result as untrusted and detached: a timed-out, disconnected or retired request never gets a
-- parent, and its late Model is destroyed as soon as the engine returns it.  A successful return
-- from this module is still detached; Commands owns the one ChangeHistory recording that places it.
--
-- Current Creator Hub GenerateModelAsync reference reviewed 2026-09-18.
-- Supported here: TextPrompt, MaxTriangles, GenerateTextures=true, Body1 and Car5.  Image
-- conditioning, custom schemas, Size, persistence and uploads are intentionally outside the wire.

local Generation = {}
Generation.__index = Generation

local DEFAULT_TIMEOUT_SECONDS = 90
local DEFAULT_POLL_SECONDS = 0.10
local DEFAULT_MAX_TRIANGLES = 6000
local MAX_TRIANGLES = 20000
local MAX_PROMPT_CHARS = 1000
local MAX_INTENT_CHARS = 160
local DEFAULT_MAX_PARTS = 256
local DEFAULT_MAX_DESCENDANTS = 1024
local DEFAULT_MAX_DIMENSION = 2048

local SCHEMAS = {
	Body1 = true,
	Car5 = true,
}

local REQUEST_KEYS = {
	op = true,
	prompt = true,
	intent = true,
	maxTriangles = true,
	predefinedSchema = true,
	parent = true,
}

local function finite(value: any): boolean
	return type(value) == "number" and value == value and value < math.huge and value > -math.huge
end

local function integer(value: any): boolean
	return finite(value) and value % 1 == 0
end

local function wallClock(): number
	local okDate, dateValue = pcall(function()
		return DateTime.now().UnixTimestampMillis / 1000
	end)
	if okDate and finite(dateValue) then return dateValue end
	local okClock, clockValue = pcall(os.clock)
	if okClock and finite(clockValue) then return clockValue end
	return 0
end

local function runtimeType(value: any): string
	local ok, result = pcall(function() return typeof(value) end)
	if ok and type(result) == "string" then return result end
	if type(value) == "table" and type(value.__type) == "string" then return value.__type end
	if type(value) == "table" and value.__class == true then return "Instance" end
	return type(value)
end

local function classNameOf(inst: any): string
	local ok, value = pcall(function() return inst.ClassName end)
	if ok and type(value) == "string" then return value end
	return "Instance"
end

local function isA(inst: any, className: string): boolean
	local ok, value = pcall(function() return inst:IsA(className) end)
	if ok and value == true then return true end
	return classNameOf(inst) == className
end

local function destroyInstance(inst: any): boolean
	if inst == nil then return true end
	local ok = pcall(function() inst:Destroy() end)
	return ok
end

local function parentOf(inst: any): (boolean, any)
	local ok, parent = pcall(function() return inst.Parent end)
	return ok, parent
end

local function detach(inst: any): (boolean, string?)
	local ok, err = pcall(function() inst.Parent = nil end)
	if not ok then return false, "could not detach generated result: " .. tostring(err) end
	local readOk, parent = parentOf(inst)
	if not readOk or parent ~= nil then return false, "generated result did not remain detached" end
	return true
end

local function current(callback: any): boolean
	if callback == nil then return true end
	if type(callback) ~= "function" then return false end
	local ok, value = pcall(callback)
	return ok and value == true
end

local function vectorDimensions(value: any): (number?, number?, number?)
	local ok, x, y, z = pcall(function() return value.X, value.Y, value.Z end)
	if not ok or not finite(x) or not finite(y) or not finite(z) then return nil end
	return x, y, z
end

local function positiveDimensions(value: any, maximum: number, label: string): ({ number }?, string?)
	local x, y, z = vectorDimensions(value)
	if x == nil or y == nil or z == nil then return nil, label .. " must contain finite X, Y and Z dimensions" end
	if x <= 0 or y <= 0 or z <= 0 then return nil, label .. " dimensions must all be greater than 0" end
	if x > maximum or y > maximum or z > maximum then
		return nil, ("%s exceeds the %.0f-stud per-axis safety cap"):format(label, maximum)
	end
	return { x, y, z }
end

local function childrenOf(inst: any): ({ any }?, string?)
	local ok, children = pcall(function() return inst:GetChildren() end)
	if not ok or type(children) ~= "table" then return nil, "could not inspect generated descendants" end
	return children
end

local function generatedUuid(metadata: any): string?
	if type(metadata) ~= "table" then return nil end
	local value = metadata.UUID
	if type(value) ~= "string" or #value == 0 or #value > 160 then return nil end
	return value
end

local function inspectDetached(model: any, maxTriangles: number, options: any): (any?, string?)
	if runtimeType(model) ~= "Instance" or not isA(model, "Model") then
		return nil, "GenerationService returned something other than a Model"
	end
	local parentOk, parent = parentOf(model)
	if not parentOk or parent ~= nil then return nil, "generated Model was not detached before quality checks" end

	local rootChildren, rootErr = childrenOf(model)
	if not rootChildren then return nil, rootErr end
	local stack = {}
	for _, child in rootChildren do table.insert(stack, child) end
	local descendantCount = 0
	local parts = {}
	local scripts = 0
	while #stack > 0 do
		local item = table.remove(stack)
		descendantCount += 1
		if descendantCount > options.maxDescendants then
			return nil, ("generated Model exceeds the %d-descendant safety cap"):format(options.maxDescendants)
		end
		if isA(item, "LuaSourceContainer")
			or classNameOf(item) == "Script"
			or classNameOf(item) == "LocalScript"
			or classNameOf(item) == "ModuleScript"
		then
			scripts += 1
		end
		if isA(item, "BasePart") then
			table.insert(parts, item)
			if #parts > options.maxParts then
				return nil, ("generated Model exceeds the %d-part safety cap"):format(options.maxParts)
			end
		end
		local children, childrenErr = childrenOf(item)
		if not children then return nil, childrenErr end
		for _, child in children do table.insert(stack, child) end
	end

	if scripts > 0 then return nil, ("generated Model contains %d script object(s)"):format(scripts) end
	if #parts == 0 then return nil, "generated Model contains no BaseParts" end

	local largestPartAxis = 0
	for index, part in parts do
		local okSize, size = pcall(function() return part.Size end)
		if not okSize then return nil, ("could not read generated part %d size"):format(index) end
		local dimensions, dimensionsErr = positiveDimensions(size, options.maxDimension, ("generated part %d Size"):format(index))
		if not dimensions then return nil, dimensionsErr end
		largestPartAxis = math.max(largestPartAxis, dimensions[1], dimensions[2], dimensions[3])
	end

	local okBounds, _, size = pcall(function()
		local boundsCFrame, boundsSize = model:GetBoundingBox()
		return boundsCFrame, boundsSize
	end)
	if not okBounds then return nil, "could not measure the generated Model bounding box" end
	local bounds, boundsErr = positiveDimensions(size, options.maxDimension, "generated Model bounding box")
	if not bounds then return nil, boundsErr end

	-- The current MeshPart API exposes no triangle-count property.  The documented MaxTriangles
	-- input is therefore the enforceable cap in this bounded build.  An injected observer
	-- may provide an actual count in tests or a future engine build; unknown is never reported as 0.
	local measuredTriangles = nil
	if type(options.readTriangleCount) == "function" then
		local okTriangles, value = pcall(options.readTriangleCount, model)
		if okTriangles and value ~= nil then
			if not integer(value) or value <= 0 then return nil, "measured triangle count must be a positive finite integer" end
			if value > maxTriangles then
				return nil, ("generated Model has %d triangles, above the requested cap of %d"):format(value, maxTriangles)
			end
			measuredTriangles = value
		end
	end

	-- Anchor only after every structural check passes, while the Model is still detached.  This is
	-- the normalization used in Roblox's current official GenerateModelAsync examples.
	for index, part in parts do
		local okAnchor, anchorErr = pcall(function() part.Anchored = true end)
		if not okAnchor then return nil, ("could not anchor generated part %d: %s"):format(index, tostring(anchorErr)) end
	end

	return {
		kind = "structural",
		verdict = "pass",
		detached = true,
		parts = #parts,
		descendants = descendantCount,
		scripts = scripts,
		anchoredParts = #parts,
		boundsStuds = bounds,
		largestPartAxisStuds = largestPartAxis,
		triangleCap = maxTriangles,
		triangles = measuredTriangles,
		trianglesMeasured = measuredTriangles ~= nil,
		verdictScope = "structural_only",
		visualVerdict = "unreviewed",
		visualJudgementRequired = true,
	}, nil
end

local function validateRequest(request: any): (any?, string?)
	if type(request) ~= "table" then return nil, "generate_model payload must be a table" end
	for key in request do
		if type(key) ~= "string" or REQUEST_KEYS[key] ~= true then
			return nil, "generate_model contains an unsupported field"
		end
	end
	if request.op ~= "generate_model" then return nil, 'operation must be "generate_model"' end
	if type(request.prompt) ~= "string" then return nil, "generate_model.prompt must be a string" end
	if #request.prompt == 0 or string.match(request.prompt, "^%s*$") then return nil, "generate_model.prompt must not be blank" end
	if #request.prompt > MAX_PROMPT_CHARS then return nil, ("generate_model.prompt exceeds %d characters"):format(MAX_PROMPT_CHARS) end
	if string.find(request.prompt, "%z", 1, true) then return nil, "generate_model.prompt contains a NUL byte" end
	if request.intent ~= nil then
		if type(request.intent) ~= "string" or #request.intent > MAX_INTENT_CHARS or string.find(request.intent, "%z", 1, true) then
			return nil, ("generate_model.intent must be a string of at most %d characters"):format(MAX_INTENT_CHARS)
		end
	end
	if type(request.parent) ~= "string" or #request.parent == 0 or #request.parent > 320 then
		return nil, "generate_model.parent must be a non-empty Studio path of at most 320 characters"
	end
	if string.find(request.parent, "%z", 1, true) then return nil, "generate_model.parent contains a NUL byte" end
	local maxTriangles = request.maxTriangles
	if maxTriangles == nil then maxTriangles = DEFAULT_MAX_TRIANGLES end
	if not integer(maxTriangles) or maxTriangles <= 0 or maxTriangles > MAX_TRIANGLES then
		return nil, ("generate_model.maxTriangles must be a positive integer no greater than %d"):format(MAX_TRIANGLES)
	end
	local schema = request.predefinedSchema or "Body1"
	if type(schema) ~= "string" or SCHEMAS[schema] ~= true then
		return nil, 'generate_model.predefinedSchema must be "Body1" or "Car5"'
	end
	return {
		prompt = request.prompt,
		intent = request.intent,
		maxTriangles = maxTriangles,
		predefinedSchema = schema,
		inputs = {
			TextPrompt = request.prompt,
			MaxTriangles = maxTriangles,
			GenerateTextures = true,
		},
		schema = { PredefinedSchema = schema },
	}, nil
end

function Generation.new(options: any?): any
	local opts = options or {}
	local gameRef = opts.game
	if gameRef == nil then
		local okGame, value = pcall(function() return game end)
		if okGame then gameRef = value end
	end
	local service = opts.service
	local serviceError = nil
	if service == nil and gameRef ~= nil then
		local okService, value = pcall(function() return gameRef:GetService("GenerationService") end)
		if okService then service = value else serviceError = tostring(value) end
	end
	local methodAvailable = false
	if service ~= nil then
		local okMethod, method = pcall(function() return service.GenerateModelAsync end)
		methodAvailable = okMethod and type(method) == "function"
	end

	local self = setmetatable({
		service = service,
		serviceError = serviceError,
		methodAvailable = methodAvailable,
		destroyed = false,
		epoch = 0,
		inflight = nil,
		now = opts.now or wallClock,
		spawn = opts.spawn or function(callback) return task.spawn(callback) end,
		wait = opts.wait or function(seconds) return task.wait(seconds) end,
		timeoutSeconds = opts.timeoutSeconds or DEFAULT_TIMEOUT_SECONDS,
		pollSeconds = opts.pollSeconds or DEFAULT_POLL_SECONDS,
		maxParts = opts.maxParts or DEFAULT_MAX_PARTS,
		maxDescendants = opts.maxDescendants or DEFAULT_MAX_DESCENDANTS,
		maxDimension = opts.maxDimension or DEFAULT_MAX_DIMENSION,
		readTriangleCount = opts.readTriangleCount,
	}, Generation)
	return self
end

function Generation:probe(): any
	if self.destroyed then return { available = false, reason = "generation adapter is destroyed" } end
	if self.service == nil then
		return { available = false, reason = "GenerationService is unavailable in this Studio build" }
	end
	if not self.methodAvailable then
		return { available = false, reason = "GenerationService.GenerateModelAsync is unavailable in this Studio build" }
	end
	return {
		available = true,
		method = "GenerateModelAsync",
		capability = "DynamicGeneration",
		sessionScoped = true,
	}
end

function Generation:discard(model: any): boolean
	return destroyInstance(model)
end

function Generation:generate(request: any, stillCurrent: any): any
	local normalized, requestErr = validateRequest(request)
	if not normalized then return { ok = false, failure = "invalid", error = requestErr } end
	local capability = self:probe()
	if capability.available ~= true then
		return { ok = false, failure = "refused", error = capability.reason .. "; no substitute was created" }
	end
	if not current(stillCurrent) then
		return { ok = false, failure = "refused", error = "the Studio connection or edit consent ended before generation started; no substitute was created" }
	end
	if self.inflight ~= nil and self.inflight.done ~= true then
		return { ok = false, failure = "conflict", error = "a previous GenerationService call is still finishing and its result will be discarded" }
	end
	if not finite(self.timeoutSeconds) or self.timeoutSeconds <= 0 then
		return { ok = false, failure = "internal", error = "generation timeout configuration is invalid" }
	end

	self.epoch += 1
	local token = self.epoch
	local job: any = {
		done = false,
		retired = false,
		cleanedLate = false,
		model = nil,
		metadata = nil,
		error = nil,
	}
	self.inflight = job
	local started = self.now()

	self.spawn(function()
		local called, model, metadata = pcall(function()
			return self.service:GenerateModelAsync(normalized.inputs, normalized.schema)
		end)
		if not called then
			job.error = tostring(model)
			job.done = true
			if self.inflight == job then self.inflight = nil end
			return
		end
		if runtimeType(model) ~= "Instance" or not isA(model, "Model") then
			destroyInstance(model)
			job.error = "GenerationService returned no Model"
			job.done = true
			if self.inflight == job then self.inflight = nil end
			return
		end
		local detached, detachErr = detach(model)
		if not detached then
			destroyInstance(model)
			job.error = detachErr
			job.done = true
			if self.inflight == job then self.inflight = nil end
			return
		end
		if job.retired or self.destroyed or self.epoch ~= token then
			destroyInstance(model)
			job.cleanedLate = true
			job.done = true
			if self.inflight == job then self.inflight = nil end
			return
		end
		job.model = model
		job.metadata = metadata
		job.done = true
		if self.inflight == job then self.inflight = nil end
	end)

	local deadline = started + self.timeoutSeconds
	while not job.done do
		if self.destroyed or self.epoch ~= token or not current(stillCurrent) then
			job.retired = true
			return {
				ok = false,
				failure = "refused",
				error = "the Studio connection or edit consent ended while generation was running; any late result will be destroyed",
			}
		end
		if self.now() >= deadline then
			job.retired = true
			return {
				ok = false,
				failure = "timeout",
				error = ("GenerationService did not return within %.0f seconds; any late result will be destroyed"):format(self.timeoutSeconds),
			}
		end
		self.wait(self.pollSeconds)
	end

	if job.error ~= nil then
		return { ok = false, failure = "internal", error = "GenerationService failed: " .. tostring(job.error) }
	end
	local model = job.model
	if model == nil then
		return { ok = false, failure = "internal", error = "GenerationService completed without a usable Model" }
	end
	if self.destroyed or self.epoch ~= token or not current(stillCurrent) then
		destroyInstance(model)
		return { ok = false, failure = "refused", error = "the Studio connection or edit consent ended before quality checks completed; generated result was destroyed" }
	end

	local qc, qcErr = inspectDetached(model, normalized.maxTriangles, self)
	if not qc then
		destroyInstance(model)
		return { ok = false, failure = "invalid", error = "generated Model failed structural QC: " .. tostring(qcErr) }
	end
	if self.destroyed or self.epoch ~= token or not current(stillCurrent) then
		destroyInstance(model)
		return { ok = false, failure = "refused", error = "the Studio connection or edit consent ended after quality checks; generated result was destroyed" }
	end

	return {
		ok = true,
		model = model,
		metadata = job.metadata,
		generationId = generatedUuid(job.metadata),
		qc = qc,
		maxTriangles = normalized.maxTriangles,
		predefinedSchema = normalized.predefinedSchema,
		elapsedSeconds = math.max(0, self.now() - started),
		sessionScoped = true,
	}
end

function Generation:destroy()
	if self.destroyed then return end
	self.destroyed = true
	self.epoch += 1
	local job = self.inflight
	if job ~= nil and job.done ~= true then job.retired = true end
end

return Generation
