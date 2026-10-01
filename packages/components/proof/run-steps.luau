-- PROOF ONLY (never shipped): runs the composer's steps (steps.json) in a throwaway Studio place, the way the worker's
-- executor runs them through plugin ops. Library pieces come from the local proof server as base64 .rbxm.
local HttpService = game:GetService("HttpService")
local Encoding = game:GetService("EncodingService")
local Serialization = game:GetService("SerializationService")
local HOST = "http://127.0.0.1:8765/"
local steps = HttpService:JSONDecode(HttpService:GetAsync(HOST .. "steps.json"))
local SURFACES = HttpService:JSONDecode(HttpService:GetAsync(HOST .. "surfaces.json")) -- surfaces.ts, Resurface's maps

local function resolve(path: string, create: boolean?): Instance?
	local at: Instance? = game
	local first = true
	for part in string.gmatch(path, "[^%.]+") do
		if first and part == "game" then first = false; continue end
		first = false
		local nextAt = at and at:FindFirstChild(part)
		if not nextAt and at == game then local ok, svc = pcall(function() return game:GetService(part) end); if ok then nextAt = svc end end
		at = nextAt
	end
	return at
end

local function value(v: any, prop: string): any
	if type(v) == "table" and type(v.t) == "string" then
		local x = v.v
		if v.t == "UDim2" then return UDim2.new(x[1], x[2], x[3], x[4]) end
		if v.t == "UDim" then return UDim.new(x[1], x[2]) end
		if v.t == "Vector2" then return Vector2.new(x[1], x[2]) end
		if v.t == "Vector3" then return Vector3.new(x[1], x[2], x[3]) end
		if v.t == "Color3" then return Color3.new(x[1], x[2], x[3]) end
		if v.t == "ColorSequence" then
			local keys = {}
			for _, k in x do table.insert(keys, ColorSequenceKeypoint.new(k[1], Color3.new(k[2][1], k[2][2], k[2][3]))) end
			return ColorSequence.new(keys)
		end
		if v.t == "EnumItem" then
			local _, kind, item = string.match(x, "^(Enum)%.([%w_]+)%.([%w_]+)$")
			return Enum[kind][item]
		end
		return x
	end
	if type(v) == "table" and #v == 3 and type(v[1]) == "number" then return Vector3.new(v[1], v[2], v[3]) end
	if type(v) == "string" and v:match("^#%x%x%x%x%x%x$") then return Color3.fromHex(v) end
	if type(v) == "string" and prop == "Material" then return Enum.Material[v] end
	if type(v) == "string" and (prop == "TopSurface" or prop == "BottomSurface") then return Enum.SurfaceType[v] end
	return v
end

local function build(spec: any, parent: Instance)
	local inst = Instance.new(spec.className)
	inst.Name = spec.name
	for k, v in spec.props or {} do inst[k] = value(v, k) end
	for k, v in spec.attributes or {} do inst:SetAttribute(k, v) end
	for _, c in spec.children or {} do build(c, inst) end
	inst.Parent = parent
end

-- A rerun starts clean: what an earlier run (or a proof helper) left is removed first.
for _, name in { "AppleGallery", "Penguin", "MythicNPC" } do local g = workspace:FindFirstChild(name); if g then g:Destroy() end end
for _, s in steps do
	if s.kind == "import" and s.into == "game.StarterGui" then
		local name = (s.ref.path:match("([^/]+)$") or ""):gsub("#%d+$", "")
		local g = game.StarterGui:FindFirstChild(name)
		while g do g:Destroy(); g = game.StarterGui:FindFirstChild(name) end
	end
end

local counts = {}
local problems = {}
for i, s in steps do
	local ok, err = pcall(function()
		if s.kind == "create" then
			local parent = resolve(s.parent)
			for _, item in s.items do
				local old = parent:FindFirstChild(item.name)
				if old then old:Destroy() end
				build(item, parent)
			end
		elseif s.kind == "import" then
			local text = HttpService:GetAsync(HOST .. s.key .. ".b64")
			local roots = Serialization:DeserializeInstancesAsync(Encoding:Base64Decode(buffer.fromstring((text:gsub("%s", "")))))
			local into = resolve(s.into)
			for _, r in roots do r.Parent = into end
		elseif s.kind == "script" then
			local parent = resolve(s.parent)
			local old = parent:FindFirstChild(s.name)
			if old then old:Destroy() end
			local sc = Instance.new(s.className)
			sc.Name = s.name
			sc.Source = s.source
			sc.Parent = parent
		elseif s.kind == "place" then
			local holder = resolve(s.from)
			local piece = holder and (holder:FindFirstChildWhichIsA("Model") or holder:FindFirstChildWhichIsA("BasePart") or holder:FindFirstChildWhichIsA("Tool"))
			if not piece then error("nothing to place in " .. s.from) end
			local copy = piece:Clone()
			if not copy:IsA("Model") then local m = Instance.new("Model"); if copy:IsA("Tool") then for _, c in copy:GetChildren() do c.Parent = m end else copy.Parent = m end; copy = m end
			for _, d in copy:GetDescendants() do if d:IsA("BaseScript") or d:IsA("Sound") then d:Destroy() elseif d:IsA("BasePart") then d.Anchored = true end end
			copy.Name = s.name
			copy.Parent = resolve(s.parent)
			-- The world-aligned box of every part (what "height", "length" and "bottom" mean here).
			local function aabb(): (Vector3, Vector3)
				local lo, hi = Vector3.new(math.huge, math.huge, math.huge), Vector3.new(-math.huge, -math.huge, -math.huge)
				for _, p in copy:GetDescendants() do
					if p:IsA("BasePart") and p.Transparency < 1 then
						local h = p.Size / 2
						for _, c in { Vector3.new(1,1,1), Vector3.new(1,1,-1), Vector3.new(1,-1,1), Vector3.new(1,-1,-1), Vector3.new(-1,1,1), Vector3.new(-1,1,-1), Vector3.new(-1,-1,1), Vector3.new(-1,-1,-1) } do
							local w = p.CFrame:PointToWorldSpace(h * c)
							lo, hi = lo:Min(w), hi:Max(w)
						end
					end
				end
				if lo.X == math.huge then local cf, sz = copy:GetBoundingBox(); return cf.Position - sz / 2, cf.Position + sz / 2 end
				return lo, hi
			end
			local center = copy:GetBoundingBox().Position
			local function turn(deg: number)
				copy:PivotTo(CFrame.new(center) * CFrame.Angles(0, math.rad(deg), 0) * CFrame.new(-center) * copy:GetPivot())
			end
			turn(s.yaw or 0)
			if s.along then
				local lo, hi = aabb()
				local longX = (hi.X - lo.X) >= (hi.Z - lo.Z)
				if (s.along == "x") ~= longX then turn(90) end
			end
			local lo, hi = aabb()
			local size = hi - lo
			local k = 1
			if s.height and size.Y > 0 then k = s.height / size.Y end
			if s.length then k = s.length / math.max(size.X, size.Z, 1e-3) end
			if math.abs(k - 1) > 1e-3 then copy:ScaleTo(copy:GetScale() * k) end
			lo, hi = aabb()
			local bottom = Vector3.new((lo.X + hi.X) / 2, lo.Y, (lo.Z + hi.Z) / 2)
			copy:PivotTo(copy:GetPivot() + (Vector3.new(s.at[1], s.at[2], s.at[3]) - bottom))
		elseif s.kind == "strip" then
			local root = resolve(s.root)
			if not root then error("nothing at " .. s.root) end
			local classes = {}
			for _, c in s.classes do classes[c] = true end
			local gone = 0
			for _, d in root:GetDescendants() do
				if classes[d.ClassName] and d.Parent then d:Destroy(); gone += 1 end
			end
			print(("COMPOSE stripped %d from %s"):format(gone, s.root))
		elseif s.kind == "surface" then
			-- What the plugin's Surface family does (ops/Surface.luau, after Resurface): one MaterialVariant, every face.
			local m = SURFACES[s.surface]
			local variant
			for _, v in game.MaterialService:GetDescendants() do
				if v:IsA("MaterialVariant") and v.ColorMap == m.colorMap and v.NormalMap == m.normalMap then variant = v end
			end
			if not variant then
				variant = Instance.new("MaterialVariant")
				variant.Name = "Studs"
				variant.BaseMaterial = Enum.Material.Plastic
				variant.ColorMap = m.colorMap
				variant.NormalMap = m.normalMap
				variant.StudsPerTile = m.studsPerTile
				variant.Parent = game.MaterialService
			end
			local n = 0
			for _, path in s.paths do
				local root = resolve(path)
				for _, p in (if root then root:GetDescendants() else {}) do
					if p:IsA("BasePart") then
						p.Material = variant.BaseMaterial
						p.MaterialVariant = variant.Name
						for _, f in { "TopSurface", "BottomSurface", "LeftSurface", "RightSurface", "FrontSurface", "BackSurface" } do (p :: any)[f] = Enum.SurfaceType.Smooth end
						n += 1
					end
				end
			end
			print(("COMPOSE studded %d parts"):format(n))
		elseif s.kind == "set" then
			local target = resolve(s.path)
			if not target then error("nothing at " .. s.path) end
			for k, v in s.props do target[k] = value(v, k) end
		elseif s.kind == "hide" then
			for _, p in s.paths do local g = resolve(p); if g and g:IsA("GuiObject") then g.Visible = false end end
		elseif s.kind == "delete" then
			for _, p in s.paths do local g = resolve(p); if g then g:Destroy() end end
		end
	end)
	counts[s.kind] = (counts[s.kind] or 0) + 1
	if not ok then
		local line = ("step %d (%s %s) failed: %s"):format(i, s.kind, tostring(s.key or s.name or s.parent), tostring(err))
		warn("COMPOSE " .. line)
		table.insert(problems, line)
	end
	if i % 10 == 0 then task.wait() end
end
local parts = {}
for k, v in counts do table.insert(parts, k .. "=" .. v) end
print("COMPOSE done: " .. table.concat(parts, " "))
pcall(function() HttpService:PostAsync(HOST .. "compose", "done: " .. table.concat(parts, " ") .. "\n" .. table.concat(problems, "\n")) end)
