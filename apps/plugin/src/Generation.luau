--!strict
-- Roblox-native model generation and, more importantly, the QC gate that decides whether the
-- result is usable.
--
-- The constraint this module exists to enforce:
--
--     "Do not assume a generated model is good because generation succeeded."
--
-- GenerateModelAsync returns a Model roughly 20 seconds later and reports success. That tells you
-- nothing about whether the thing is 3 studs tall or 300, whether its pivot is at its base or its
-- centroid (the difference between a tree standing on the ground and a tree half-buried in it),
-- whether it is textured or a grey blob, whether it is lying on its side, or whether somebody
-- slipped a Script into it. Generation.inspect() measures all of that and returns a verdict with
-- per-check pass/fail and concrete remediation steps.
--
-- Verified facts this module is built on (docs/research/3d-asset-pipeline.md §A0, §A1, §A5):
--   * GenerationService:GenerateModelAsync WORKS from a Studio plugin in edit mode. Measured
--     20.1 s for a 6k-triangle textured prop. MaxTriangles and GenerateTextures are honoured.
--     Rate limit 10 requests/minute. Free while in beta.
--   * Its output is SESSION-SCOPED: Content{SourceType=Opaque}, MeshId empty. It does not survive
--     save/publish. Persisting it needs AssetService:CreateAssetAsync from a locally loaded plugin.
--   * InsertService:LoadAsset FAILS from a plugin even for free public-domain assets.
--     game:GetObjects("rbxassetid://…") is the only working path, and it returns an ARRAY.
--   * EditableMesh is capped at 60,000 vertices and 20,000 triangles, and is unlimited-memory in
--     Studio and plugin context (but not on clients).
local AssetService = game:GetService("AssetService")

local Generation = {}

-- ==============================================================================================
-- Clock and rate limiting
-- ==============================================================================================

-- os.clock() measures CPU time, which barely advances across a 20-second yielding RPC. Wall time
-- is what both the rate limit and the timeout actually care about.
local function nowSeconds(): number
	return DateTime.now().UnixTimestampMillis / 1000
end

--- Observed live: 10 generations per minute. Enforced as a sliding window so a burst cannot
--- borrow against the next minute.
local RATE_LIMIT = 10
local RATE_WINDOW = 60

--- Measured 20.1 s for a 6k-triangle textured prop. 90 s is ~4.5x headroom: long enough that a
--- slow-but-working generation is not thrown away, short enough that a wedged call does not hold
--- an agent step open indefinitely.
local DEFAULT_TIMEOUT = 90

--- The measured figure that produced a good textured prop. Higher costs time without visibly
--- helping at Roblox's shading fidelity; the docs note lower values read as more faceted/low-poly,
--- which happens to match the house style.
local DEFAULT_MAX_TRIANGLES = 6000

local recentCalls: { number } = {}

local function pruneWindow()
	local cutoff = nowSeconds() - RATE_WINDOW
	local kept: { number } = {}
	for _, t in recentCalls do
		if t > cutoff then table.insert(kept, t) end
	end
	recentCalls = kept
end

export type RateLimitStatus = {
	used: number,
	limit: number,
	windowSeconds: number,
	allowed: boolean,
	retryAfterSeconds: number,
}

function Generation.rateLimitStatus(): RateLimitStatus
	pruneWindow()
	local used = #recentCalls
	local retry = 0
	if used >= RATE_LIMIT then
		local oldest = recentCalls[1]
		if oldest then retry = math.max(0, math.ceil((oldest + RATE_WINDOW) - nowSeconds())) end
	end
	return {
		used = used,
		limit = RATE_LIMIT,
		windowSeconds = RATE_WINDOW,
		allowed = used < RATE_LIMIT,
		retryAfterSeconds = retry,
	}
end

-- ==============================================================================================
-- Generation
-- ==============================================================================================

export type GenerateRequest = {
	prompt: string,
	maxTriangles: number?,
	generateTextures: boolean?,
	size: Vector3?,
	--- "Body1" (single mesh) or "Car5" (body + 4 wheels). Ignored when `groups` is given.
	predefinedSchema: string?,
	--- Custom SchemaDefinition group names; the returned Model is organised to match.
	groups: { string }?,
	timeoutSeconds: number?,
	parent: Instance?,
}

export type GenerateResult = {
	ok: boolean,
	model: Model?,
	metadata: any,
	error: string?,
	elapsedSeconds: number,
	rateLimit: RateLimitStatus,
	--- Always true for GenerateModelAsync output. Kept explicit because it is the fact most
	--- likely to be forgotten: this geometry disappears on save/publish unless it is persisted.
	sessionScoped: boolean,
}

--- Run `fn` and give up waiting after `seconds`.
---
--- NOTE: the underlying engine call cannot be cancelled. On timeout we stop waiting and report a
--- failure; the coroutine may still complete later and its result is discarded. That is the honest
--- behaviour available, and it is better than an agent step blocking forever.
local function withTimeout(fn: () -> any, seconds: number): (boolean, any, string?)
	local done = false
	local succeeded = false
	local value: any = nil
	task.spawn(function()
		local ok, res = pcall(fn)
		succeeded = ok
		value = res
		done = true
	end)
	local deadline = nowSeconds() + seconds
	while not done and nowSeconds() < deadline do
		task.wait(0.1)
	end
	if not done then
		return false, nil, string.format("generation did not return within %ds (the engine call cannot be cancelled and may still be running)", seconds)
	end
	if not succeeded then
		return false, nil, tostring(value)
	end
	return true, value, nil
end

--- Wrap GenerationService:GenerateModelAsync with sane defaults, the 10/min limit and a timeout.
--- Never throws: every failure path returns ok=false with a readable reason.
function Generation.generateModel(request: GenerateRequest): GenerateResult
	local started = nowSeconds()
	local limit = Generation.rateLimitStatus()
	local blank: GenerateResult = {
		ok = false,
		model = nil,
		metadata = nil,
		error = nil,
		elapsedSeconds = 0,
		rateLimit = limit,
		sessionScoped = true,
	}

	if type(request.prompt) ~= "string" or #request.prompt == 0 then
		blank.error = "a text prompt is required"
		return blank
	end
	if not limit.allowed then
		blank.error = string.format("rate limited: %d/%d generations used in the last %ds, retry in %ds", limit.used, limit.limit, limit.windowSeconds, limit.retryAfterSeconds)
		return blank
	end

	local okService, service = pcall(function()
		return (game :: any):GetService("GenerationService")
	end)
	if not okService or not service then
		blank.error = "GenerationService is unavailable in this Studio build (it is a beta service)"
		return blank
	end

	local inputs: { [string]: any } = {
		TextPrompt = request.prompt,
		MaxTriangles = request.maxTriangles or DEFAULT_MAX_TRIANGLES,
		GenerateTextures = if request.generateTextures == nil then true else request.generateTextures,
	}
	if request.size then inputs.Size = request.size end

	local schema: { [string]: any } = {}
	if request.groups and #request.groups > 0 then
		schema.SchemaDefinition = { Groups = request.groups }
	else
		schema.PredefinedSchema = request.predefinedSchema or "Body1"
	end

	table.insert(recentCalls, nowSeconds())

	local ok, value, err = withTimeout(function()
		local model, metadata = (service :: any):GenerateModelAsync(inputs, schema)
		return { model = model, metadata = metadata }
	end, request.timeoutSeconds or DEFAULT_TIMEOUT)

	local elapsed = nowSeconds() - started
	if not ok then
		blank.error = err or "generation failed"
		blank.elapsedSeconds = elapsed
		blank.rateLimit = Generation.rateLimitStatus()
		return blank
	end

	local model = (value :: any).model
	if typeof(model) ~= "Instance" or not model:IsA("Model") then
		blank.error = "generation returned no Model"
		blank.elapsedSeconds = elapsed
		blank.rateLimit = Generation.rateLimitStatus()
		return blank
	end
	if request.parent then
		local okParent = pcall(function() model.Parent = request.parent end)
		if not okParent then
			-- not fatal: the caller still has the Model and can parent it itself
			model.Parent = nil
		end
	end

	return {
		ok = true,
		model = model,
		metadata = (value :: any).metadata,
		error = nil,
		elapsedSeconds = elapsed,
		rateLimit = Generation.rateLimitStatus(),
		sessionScoped = true,
	}
end

-- ==============================================================================================
-- Asset insertion — the single adapter
-- ==============================================================================================

export type InsertResult = {
	ok: boolean,
	instances: { Instance },
	error: string?,
}

--- The ONE place `game:GetObjects` is called.
---
--- InsertService:LoadAsset fails from a plugin even for free, public-domain assets
--- ("User is not authorized to access Asset."). DataModel:GetObjects is the only working insert
--- path from plugin context — Roblox's own docs say it "does not require an asset to be trusted"
--- and "can only be used by plugins or the command bar". It is deprecated, so isolating it here
--- makes its eventual removal a one-function fix rather than a hunt.
---
--- It returns an ARRAY of top-level instances, not a container Model. That is preserved here
--- rather than papered over, because collapsing it to `[1]` silently drops geometry.
function Generation.insertAsset(assetId: number, parent: Instance?): InsertResult
	if type(assetId) ~= "number" or assetId <= 0 or assetId % 1 ~= 0 then
		return { ok = false, instances = {}, error = "assetId must be a positive integer" }
	end
	local ok, objects = pcall(function(): { Instance }
		return game:GetObjects("rbxassetid://" .. tostring(assetId))
	end)
	if not ok then
		return { ok = false, instances = {}, error = "could not load asset " .. tostring(assetId) .. ": " .. tostring(objects) }
	end
	local list = objects :: { Instance }
	if #list == 0 then
		return { ok = false, instances = {}, error = "asset " .. tostring(assetId) .. " loaded but contained nothing" }
	end
	if parent then
		for _, obj in list do
			obj.Parent = parent
		end
	end
	return { ok = true, instances = list, error = nil }
end

-- ==============================================================================================
-- QC gate
-- ==============================================================================================

export type CheckStatus = "pass" | "warn" | "fail" | "skip"

export type Check = {
	name: string,
	status: CheckStatus,
	detail: string,
	remediation: string?,
}

export type Measurements = {
	parts: number,
	meshParts: number,
	--- nil when EditableMesh could not read the geometry (permissions, memory, non-mesh model).
	triangles: number?,
	trianglesMeasured: boolean,
	heaviestMeshTriangles: number?,
	boundsStuds: { number },
	--- pivot Y minus the bounding box's base Y. 0 means "sits on the ground correctly".
	pivotAboveBaseStuds: number,
	pivotLateralOffsetStuds: number,
	unanchoredParts: number,
	scriptCount: number,
	texturedParts: number,
	defaultGreyParts: number,
	plasticParts: number,
	collidableParts: number,
	--- dot of the model's up vector with world up. 1 is perfectly upright.
	uprightDot: number,
	distinctMaterials: number,
	distinctColours: number,
}

export type Verdict = {
	ok: boolean,
	verdict: "pass" | "warn" | "fail",
	intent: string,
	checks: { Check },
	failures: { string },
	remediation: { string },
	measurements: Measurements,
	error: string?,
}

export type InspectOptions = {
	--- What the thing is meant to be ("chair", "tree", "lamp post"). Drives the scale check.
	intent: string?,
	--- Set true for a physics assembly (a vehicle) where unanchored parts are correct.
	physicsAssembly: boolean?,
	--- Set false for something genuinely meant to lie flat (a rug, a road section).
	expectUpright: boolean?,
	--- Remaining scene triangle budget. When set, exceeding it is a failure rather than a warning.
	triangleBudget: number?,
}

--- Roblox's minimum part dimension. Anything under this is a degenerate measurement, not geometry.
local MIN_STUD = 0.05
--- The factory default Part colour. Its presence at scale is the signature of geometry that was
--- created and never art-directed.
local DEFAULT_GREY = Color3.fromRGB(163, 162, 165)
local GREY_TOLERANCE = 12 / 255
--- EditableMesh's documented hard ceiling. Past this the mesh cannot be read back or edited at all.
local HARD_TRIANGLE_CEILING = 20000
--- The measured GenerateModelAsync default for a good prop. Above it, we are paying for detail
--- Roblox will not show at typical viewing distance.
local SOFT_TRIANGLE_WARN = 6000
--- A single generated prop above this is not a prop, it is a scene that should have been built.
local SOFT_PART_WARN = 200

export type ScaleRule = {
	minHeight: number,
	maxHeight: number,
	maxAnyDim: number,
	--- Whether height should be the largest dimension. A tree wider than it is tall fell over.
	tallest: boolean,
}

--- Plausible stud dimensions per intent, keyed to the ~5-stud R15 avatar.
---
--- Derived from apps/worker/src/worldbuilding.ts PROPORTIONS and widened at both ends, so the check
--- catches *implausible* results rather than merely unfashionable ones. A "chair" 40 studs tall is
--- a fail; a chair 5.5 studs tall is only slightly generous and passes.
---
--- MIRROR: the canonical table is SCALE_ENVELOPES in apps/worker/src/assets.ts. This copy exists
--- because the gate must run offline inside Studio. packages/evals/src/asset-qc.test.mjs parses
--- this table and asserts it agrees with the TypeScript one, so the two cannot drift apart.
local SCALE: { [string]: ScaleRule } = {
	chair = { minHeight = 1.5, maxHeight = 7, maxAnyDim = 8, tallest = false },
	stool = { minHeight = 1, maxHeight = 5, maxAnyDim = 5, tallest = false },
	bench = { minHeight = 1.5, maxHeight = 6, maxAnyDim = 16, tallest = false },
	table = { minHeight = 1.5, maxHeight = 6, maxAnyDim = 16, tallest = false },
	counter = { minHeight = 2, maxHeight = 6, maxAnyDim = 24, tallest = false },
	crate = { minHeight = 0.5, maxHeight = 8, maxAnyDim = 10, tallest = false },
	barrel = { minHeight = 1, maxHeight = 8, maxAnyDim = 8, tallest = false },
	door = { minHeight = 6, maxHeight = 14, maxAnyDim = 14, tallest = true },
	window = { minHeight = 2, maxHeight = 12, maxAnyDim = 14, tallest = false },
	lamp = { minHeight = 8, maxHeight = 24, maxAnyDim = 26, tallest = true },
	lantern = { minHeight = 0.8, maxHeight = 6, maxAnyDim = 6, tallest = true },
	column = { minHeight = 5, maxHeight = 45, maxAnyDim = 45, tallest = true },
	statue = { minHeight = 3, maxHeight = 45, maxAnyDim = 45, tallest = true },
	fountain = { minHeight = 2, maxHeight = 24, maxAnyDim = 44, tallest = false },
	sign = { minHeight = 1, maxHeight = 22, maxAnyDim = 24, tallest = false },
	tree = { minHeight = 10, maxHeight = 70, maxAnyDim = 70, tallest = true },
	bush = { minHeight = 0.8, maxHeight = 8, maxAnyDim = 10, tallest = false },
	rock = { minHeight = 0.5, maxHeight = 40, maxAnyDim = 50, tallest = false },
	character = { minHeight = 3.5, maxHeight = 9, maxAnyDim = 9, tallest = true },
	npc = { minHeight = 3.5, maxHeight = 9, maxAnyDim = 9, tallest = true },
	vehicle = { minHeight = 2.5, maxHeight = 14, maxAnyDim = 30, tallest = false },
	car = { minHeight = 2.5, maxHeight = 10, maxAnyDim = 26, tallest = false },
	weapon = { minHeight = 0.5, maxHeight = 10, maxAnyDim = 12, tallest = false },
	sword = { minHeight = 0.5, maxHeight = 10, maxAnyDim = 12, tallest = false },
	building = { minHeight = 10, maxHeight = 250, maxAnyDim = 350, tallest = false },
	house = { minHeight = 10, maxHeight = 80, maxAnyDim = 120, tallest = false },
	prop = { minHeight = 0.3, maxHeight = 16, maxAnyDim = 24, tallest = false },
}

--- Resolve a free-text intent onto a scale rule. Exact key first, then substring, then the generic
--- `prop` envelope. Returns the key used so the verdict can say which rule it applied.
function Generation.scaleRuleFor(intent: string?): (string, ScaleRule)
	local fallback = SCALE.prop :: ScaleRule
	if type(intent) ~= "string" or #intent == 0 then return "prop", fallback end
	local text = string.lower(intent)
	local exact = SCALE[text]
	if exact then return text, exact end
	local bestKey: string? = nil
	local bestLen = 0
	for key, rule in SCALE do
		if #key > bestLen and string.find(text, key, 1, true) then
			bestKey = key
			bestLen = #key
			fallback = rule
		end
	end
	if bestKey then return bestKey, fallback end
	return "prop", SCALE.prop :: ScaleRule
end

local function isDefaultGrey(c: Color3): boolean
	return math.abs(c.R - DEFAULT_GREY.R) <= GREY_TOLERANCE
		and math.abs(c.G - DEFAULT_GREY.G) <= GREY_TOLERANCE
		and math.abs(c.B - DEFAULT_GREY.B) <= GREY_TOLERANCE
end

local function isTextured(part: BasePart): boolean
	if part:IsA("MeshPart") then
		local okTex, tex = pcall(function() return (part :: any).TextureID end)
		if okTex and type(tex) == "string" and #tex > 0 then return true end
		local okC, content = pcall(function() return (part :: any).TextureContent end)
		if okC and content ~= nil then
			local okU, uri = pcall(function() return (content :: any).Uri end)
			if okU and type(uri) == "string" and #uri > 0 then return true end
		end
	end
	for _, child in part:GetChildren() do
		if child:IsA("SurfaceAppearance") or child:IsA("Decal") or child:IsA("Texture") then return true end
	end
	return false
end

--- Read the true triangle count back through EditableMesh.
---
--- This is the only way to know what a generated mesh actually costs — MeshPart exposes no
--- triangle count. It is best-effort by design: CreateEditableMeshAsync only loads content owned
--- by or shared with the Studio user, and returns nil when a memory budget is exhausted, so a
--- library MeshPart owned by someone else will simply not measure. Unmeasured is reported as
--- unmeasured, never as zero.
local function measureTriangles(parts: { BasePart }): (number?, number?)
	local total = 0
	local heaviest = 0
	local measuredAny = false
	for _, part in parts do
		if not part:IsA("MeshPart") then continue end
		local okContent, content = pcall(function() return (part :: any).MeshContent end)
		if not okContent or content == nil then continue end
		local okMesh, mesh = pcall(function()
			return (AssetService :: any):CreateEditableMeshAsync(content)
		end)
		if not okMesh or mesh == nil then continue end
		local okTris, tris = pcall(function() return (mesh :: any):GetTriangles() end)
		if okTris and type(tris) == "table" then
			local n = #(tris :: { any })
			total += n
			if n > heaviest then heaviest = n end
			measuredAny = true
		end
		pcall(function() (mesh :: any):Destroy() end)
	end
	if not measuredAny then return nil, nil end
	return total, heaviest
end

local function collectParts(root: Instance): ({ BasePart }, number)
	local parts: { BasePart } = {}
	local scripts = 0
	if root:IsA("BasePart") then table.insert(parts, root) end
	if root:IsA("LuaSourceContainer") then scripts += 1 end
	for _, d in root:GetDescendants() do
		if d:IsA("BasePart") then
			table.insert(parts, d)
		elseif d:IsA("LuaSourceContainer") then
			scripts += 1
		end
	end
	return parts, scripts
end

local function boundsOf(root: Instance): (CFrame?, Vector3?)
	if root:IsA("Model") then
		local ok, cf, size = pcall(function()
			local c, s = (root :: Model):GetBoundingBox()
			return c, s
		end)
		if ok and cf and size then return cf, size end
		return nil, nil
	elseif root:IsA("BasePart") then
		return (root :: BasePart).CFrame, (root :: BasePart).Size
	end
	return nil, nil
end

--- Inspect a generated or inserted model and decide whether it is actually usable.
---
--- Returns a structured verdict rather than throwing, on purpose: a QC gate that throws is worse
--- than no gate at all, because the caller's error handling will treat the crash as "generation
--- failed" and retry the identical prompt.
function Generation.inspect(model: Instance, options: InspectOptions?): Verdict
	local opts: InspectOptions = options or {}
	local intent = opts.intent or "prop"
	local checks: { Check } = {}
	local failures: { string } = {}
	local remediation: { string } = {}
	-- only ever "pass", "warn" or "fail" — a skipped check cannot make a verdict worse
	local worst: "pass" | "warn" | "fail" = "pass"

	local function add(name: string, status: CheckStatus, detail: string, fix: string?)
		table.insert(checks, { name = name, status = status, detail = detail, remediation = fix })
		if status == "fail" then
			worst = "fail"
			table.insert(failures, name .. ": " .. detail)
			if fix then table.insert(remediation, fix) end
		elseif status == "warn" then
			if worst ~= "fail" then worst = "warn" end
			if fix then table.insert(remediation, fix) end
		end
	end

	local measurements: Measurements = {
		parts = 0,
		meshParts = 0,
		triangles = nil,
		trianglesMeasured = false,
		heaviestMeshTriangles = nil,
		boundsStuds = { 0, 0, 0 },
		pivotAboveBaseStuds = 0,
		pivotLateralOffsetStuds = 0,
		unanchoredParts = 0,
		scriptCount = 0,
		texturedParts = 0,
		defaultGreyParts = 0,
		plasticParts = 0,
		collidableParts = 0,
		uprightDot = 1,
		distinctMaterials = 0,
		distinctColours = 0,
	}

	if typeof(model) ~= "Instance" then
		add("input", "fail", "inspect() was not given an Instance", "pass the Model returned by generateModel() or insertAsset()")
		return { ok = false, verdict = "fail", intent = intent, checks = checks, failures = failures, remediation = remediation, measurements = measurements, error = "not an Instance" }
	end

	local okCollect, parts, scripts = pcall(collectParts, model)
	if not okCollect then
		add("input", "fail", "could not walk the model's descendants: " .. tostring(parts), "the instance may have been destroyed; regenerate it")
		return { ok = false, verdict = "fail", intent = intent, checks = checks, failures = failures, remediation = remediation, measurements = measurements, error = tostring(parts) }
	end
	local partList = parts :: { BasePart }
	measurements.parts = #partList
	measurements.scriptCount = scripts :: number

	-- ---- 1. Scripts. Checked first: this is an untrusted-code injection vector, and nothing
	--         else about the model matters if it carries one.
	if measurements.scriptCount > 0 then
		add(
			"scripts",
			"fail",
			string.format("model contains %d script(s)", measurements.scriptCount),
			"REFUSE this model. Free Roblox models are the classic backdoor-script vector. Delete it and use procedural geometry or a verified Mesh asset instead."
		)
	else
		add("scripts", "pass", "no Script, LocalScript or ModuleScript in the model")
	end

	-- ---- 2. Geometry exists.
	if measurements.parts == 0 then
		add("geometry", "fail", "the model contains no BaseParts", "generation produced an empty container; retry with a more concrete prompt")
	else
		add("geometry", "pass", string.format("%d part(s)", measurements.parts))
		if measurements.parts > SOFT_PART_WARN then
			add(
				"part_count",
				"warn",
				string.format("%d parts is high for a single object (soft limit %d)", measurements.parts, SOFT_PART_WARN),
				"consider whether this should be several models; a single Model above ~2000 parts becomes slow to manipulate and replicate"
			)
		end
	end

	-- ---- 3. Bounds and scale plausibility.
	local cf, size = boundsOf(model)
	local ruleKey, rule = Generation.scaleRuleFor(intent)
	if not cf or not size then
		add("bounds", "skip", "instance has no spatial extent to measure")
	else
		local s = size :: Vector3
		measurements.boundsStuds = { s.X, s.Y, s.Z }
		local largest = math.max(s.X, s.Y, s.Z)
		local smallest = math.min(s.X, s.Y, s.Z)
		if smallest < MIN_STUD then
			add("bounds", "fail", string.format("bounding box %.2f x %.2f x %.2f studs has a degenerate axis", s.X, s.Y, s.Z), "the mesh is flat or empty on one axis; regenerate")
		else
			add("bounds", "pass", string.format("%.1f x %.1f x %.1f studs", s.X, s.Y, s.Z))
		end

		if s.Y < rule.minHeight or s.Y > rule.maxHeight or largest > rule.maxAnyDim then
			add(
				"scale",
				"fail",
				string.format(
					"%.1f studs tall (largest dimension %.1f) is implausible for a '%s' — the '%s' rule expects height %.1f-%.1f and no dimension over %.1f, against a 5-stud avatar",
					s.Y, largest, intent, ruleKey, rule.minHeight, rule.maxHeight, rule.maxAnyDim
				),
				string.format(
					"rescale so height lands in %.1f-%.1f studs (multiply by about %.2f), or state a different intent if this really is meant to be that size",
					rule.minHeight, rule.maxHeight,
					if s.Y > 0 then math.clamp((rule.minHeight + rule.maxHeight) / 2 / s.Y, 0.01, 100) else 1
				)
			)
		else
			add("scale", "pass", string.format("%.1f studs tall is plausible for a '%s' (rule '%s')", s.Y, intent, ruleKey))
		end

		if rule.tallest and s.Y < largest - 0.01 then
			add(
				"orientation_aspect",
				"fail",
				string.format("a '%s' should be taller than it is wide, but height %.1f is under the largest dimension %.1f — it is lying on its side", intent, s.Y, largest),
				"rotate the model 90 degrees about X or Z so its long axis is vertical, then re-inspect"
			)
		end

		-- ---- 4. Pivot vs bounding-box base. A pivot at the centroid means placing the model at a
		--         ground position buries half of it; a pivot below the base makes it float.
		local okPivot, pivot = pcall(function() return (model :: any):GetPivot() :: CFrame end)
		if okPivot and pivot then
			local p = pivot :: CFrame
			local c = cf :: CFrame
			local baseY = c.Position.Y - s.Y / 2
			measurements.pivotAboveBaseStuds = p.Position.Y - baseY
			measurements.pivotLateralOffsetStuds = Vector2.new(p.Position.X - c.Position.X, p.Position.Z - c.Position.Z).Magnitude
			measurements.uprightDot = p.UpVector:Dot(Vector3.yAxis)

			-- 0.5 studs is below the visible threshold at Roblox's 0.05-stud grid; 5% of height
			-- keeps the rule meaningful for both a 2-stud crate and a 60-stud tree.
			local vTol = math.max(0.5, s.Y * 0.05)
			local hTol = math.max(0.5, math.max(s.X, s.Z) * 0.10)
			if math.abs(measurements.pivotAboveBaseStuds) > vTol then
				local verb = if measurements.pivotAboveBaseStuds > 0 then "float" else "sink into"
				add(
					"pivot",
					"fail",
					string.format("pivot sits %.2f studs above the bounding-box base (tolerance %.2f) — placed at a ground position this model will %s the ground", measurements.pivotAboveBaseStuds, vTol, verb),
					string.format("move the pivot to the base: model:PivotTo(model:GetPivot() * CFrame.new(0, %.3f, 0)) then re-inspect, or set a PrimaryPart whose base is the model's base", -measurements.pivotAboveBaseStuds)
				)
			elseif measurements.pivotLateralOffsetStuds > hTol then
				add(
					"pivot",
					"warn",
					string.format("pivot is %.2f studs off-centre horizontally (tolerance %.2f) — the model will not rotate about itself", measurements.pivotLateralOffsetStuds, hTol),
					"recentre the pivot horizontally before using this model in an array or a rotation"
				)
			else
				add("pivot", "pass", string.format("pivot is %.2f studs from the base, within %.2f", measurements.pivotAboveBaseStuds, vTol))
			end

			-- ---- 5. Orientation sanity.
			if opts.expectUpright ~= false then
				-- 0.85 is roughly 32 degrees of tilt: past that a "standing" object reads as fallen
				-- rather than artfully leaning.
				if measurements.uprightDot < 0.85 then
					add(
						"orientation",
						"fail",
						string.format("the model's up vector is %.2f against world up — it is tilted about %.0f degrees", measurements.uprightDot, math.deg(math.acos(math.clamp(measurements.uprightDot, -1, 1)))),
						"reset the orientation: model:PivotTo(CFrame.new(model:GetPivot().Position))"
					)
				else
					add("orientation", "pass", string.format("upright (up vector dot %.2f)", measurements.uprightDot))
				end
			else
				add("orientation", "skip", "caller declared this model is not meant to stand upright")
			end
		else
			add("pivot", "skip", "instance exposes no pivot")
		end
	end

	-- ---- 6. Surface: textured, or an untextured grey blob?
	local materials: { [string]: boolean } = {}
	local colours: { [string]: boolean } = {}
	for _, part in partList do
		if part:IsA("MeshPart") then measurements.meshParts += 1 end
		if not part.Anchored then measurements.unanchoredParts += 1 end
		if part.CanCollide then measurements.collidableParts += 1 end
		if isTextured(part) then measurements.texturedParts += 1 end
		local matName = part.Material.Name
		materials[matName] = true
		if matName == "Plastic" or matName == "SmoothPlastic" then measurements.plasticParts += 1 end
		if isDefaultGrey(part.Color) then measurements.defaultGreyParts += 1 end
		colours[string.format("%d,%d,%d", math.round(part.Color.R * 255), math.round(part.Color.G * 255), math.round(part.Color.B * 255))] = true
	end
	for _ in materials do measurements.distinctMaterials += 1 end
	for _ in colours do measurements.distinctColours += 1 end

	if measurements.parts > 0 then
		local greyFraction = measurements.defaultGreyParts / measurements.parts
		local plasticFraction = measurements.plasticParts / measurements.parts
		if measurements.texturedParts == 0 and measurements.distinctColours <= 1 and greyFraction >= 1 then
			add(
				"surface",
				"fail",
				"every part is untextured factory-default grey plastic — this is a blob, not a model",
				"regenerate with GenerateTextures = true, or apply a palette and a Material to every part (never leave Material=Plastic or Color=163,162,165)"
			)
		elseif measurements.texturedParts == 0 and plasticFraction > 0.7 then
			add(
				"surface",
				"warn",
				string.format("no textures and %.0f%% of parts are default plastic", plasticFraction * 100),
				"set a real Enum.Material on every part; material is the cheapest quality win available"
			)
		else
			add("surface", "pass", string.format("%d/%d parts textured, %d distinct material(s), %d distinct colour(s)", measurements.texturedParts, measurements.parts, measurements.distinctMaterials, measurements.distinctColours))
		end
	end

	-- ---- 7. Triangles, read back through EditableMesh where possible.
	local okTri, tri, heaviest = pcall(measureTriangles, partList)
	if okTri and tri ~= nil then
		measurements.triangles = tri :: number
		measurements.heaviestMeshTriangles = heaviest :: number?
		measurements.trianglesMeasured = true
		local total = tri :: number
		local budget = opts.triangleBudget
		if total == 0 then
			add("triangles", "fail", "measured 0 triangles — the mesh has no geometry", "regenerate; an empty mesh is a failed generation that reported success")
		elseif budget ~= nil and total > budget then
			add("triangles", "fail", string.format("%d triangles exceeds the remaining scene budget of %d", total, budget), "regenerate with a lower MaxTriangles, or free budget elsewhere in the scene")
		elseif total > HARD_TRIANGLE_CEILING then
			add("triangles", "fail", string.format("%d triangles is over EditableMesh's hard 20,000 ceiling — this mesh cannot be read back or edited", total), "regenerate with MaxTriangles <= 20000")
		elseif total > SOFT_TRIANGLE_WARN then
			add("triangles", "warn", string.format("%d triangles is above the %d soft budget for a prop", total, SOFT_TRIANGLE_WARN), "lower MaxTriangles; at typical viewing distance the extra detail is not visible")
		else
			add("triangles", "pass", string.format("%d triangles", total))
		end
	else
		add("triangles", "skip", "EditableMesh could not read this geometry back (not owned by the Studio user, or not a mesh) — triangle cost is UNKNOWN, not zero")
	end

	-- ---- 8. Collision.
	if measurements.parts > 0 then
		if measurements.collidableParts == 0 then
			add(
				"collision",
				"fail",
				"no part has CanCollide = true — players will walk straight through this",
				"set CanCollide = true on the solid parts (leave it false only for foliage canopies and decorative fringes)"
			)
		else
			local fidelityIssues: { string } = {}
			for _, part in partList do
				if not part:IsA("MeshPart") then continue end
				local okF, fidelity = pcall(function() return (part :: any).CollisionFidelity end)
				if okF and fidelity ~= nil and typeof(fidelity) == "EnumItem" then
					local name = (fidelity :: EnumItem).Name
					if name == "PreciseConvexDecomposition" then
						table.insert(fidelityIssues, part.Name .. " uses PreciseConvexDecomposition")
					end
				end
			end
			if #fidelityIssues > 0 then
				add(
					"collision",
					"warn",
					string.format("%d mesh part(s) use PreciseConvexDecomposition: %s", #fidelityIssues, table.concat(fidelityIssues, ", ")),
					"set CollisionFidelity = Box or Hull on decorative meshes; precise decomposition is the most expensive option and is rarely needed for a prop"
				)
			else
				add("collision", "pass", string.format("%d/%d parts collidable", measurements.collidableParts, measurements.parts))
			end
		end
	end

	-- ---- 9. Anchoring. Unanchored decorative geometry is a simulated physics body: the model
	--         collapses the moment the place runs.
	if measurements.unanchoredParts > 0 then
		if opts.physicsAssembly then
			add("anchoring", "warn", string.format("%d unanchored part(s) — accepted because this was declared a physics assembly", measurements.unanchoredParts), "confirm every unanchored part is welded or constrained to the assembly root")
		else
			add(
				"anchoring",
				"fail",
				string.format("%d of %d parts are unanchored", measurements.unanchoredParts, measurements.parts),
				"set Anchored = true on every part (or weld them to an anchored root and pass physicsAssembly = true)"
			)
		end
	elseif measurements.parts > 0 then
		add("anchoring", "pass", "all parts anchored")
	end

	return {
		ok = worst == "pass",
		verdict = worst,
		intent = intent,
		checks = checks,
		failures = failures,
		remediation = remediation,
		measurements = measurements,
		error = nil,
	}
end

--- Compact one-screen summary of a verdict, for the agent transcript and the Studio output window.
function Generation.verdictToText(v: Verdict): string
	local lines: { string } = { string.format("QC %s for '%s'", string.upper(v.verdict), v.intent) }
	for _, c in v.checks do
		local mark = if c.status == "pass" then "ok" elseif c.status == "warn" then "!!" elseif c.status == "skip" then ".." else "XX"
		table.insert(lines, string.format("  [%s] %s: %s", mark, c.name, c.detail))
	end
	if #v.remediation > 0 then
		table.insert(lines, "Fix:")
		for _, r in v.remediation do
			table.insert(lines, "  - " .. r)
		end
	end
	return table.concat(lines, "\n")
end

--- Generate, then immediately QC. The only entry point a tool should use: it makes it structurally
--- impossible to accept a generated model without inspecting it, because inspection is not a
--- separate step the caller can forget.
function Generation.generateAndInspect(request: GenerateRequest, options: InspectOptions?): { generation: GenerateResult, qc: Verdict? }
	local gen = Generation.generateModel(request)
	if not gen.ok or not gen.model then return { generation = gen, qc = nil } end
	local opts: InspectOptions = options or {}
	if opts.intent == nil then opts.intent = request.prompt end
	return { generation = gen, qc = Generation.inspect(gen.model :: Model, opts) }
end

return Generation
