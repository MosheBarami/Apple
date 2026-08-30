--!strict
-- Tree snapshots + checkpoint serialization with a per-class property whitelist
-- (Luau has no generic property reflection available to plugins).
local Paths = require(script.Parent.Paths)

local Serializer = {}

local CONTAINERS = {
	"Workspace", "ReplicatedStorage", "ServerScriptService", "ServerStorage",
	"StarterGui", "StarterPack", "StarterPlayer", "Lighting", "SoundService", "Teams",
}

local SKIP_CLASSES = { Terrain = true, Camera = true }
-- containers that cannot be destroyed/recreated; restore merges into them instead
local MERGE_CLASSES = { StarterPlayerScripts = true, StarterCharacterScripts = true }

local function propList(inst: Instance): { string }
	local props = {}
	local function add(...) for _, p in { ... } do table.insert(props, p) end end
	if inst:IsA("BasePart") then
		add("Anchored", "CanCollide", "CanTouch", "Size", "CFrame", "Color", "Material", "Transparency", "Reflectance", "CastShadow")
		if inst:IsA("Part") then add("Shape") end
		if inst:IsA("MeshPart") then add("MeshId", "TextureID") end
		if inst:IsA("SpawnLocation") then add("Neutral", "TeamColor") end
	elseif inst:IsA("Model") then
		-- PrimaryPart handled via path after children exist; skipped v1
	elseif inst:IsA("ScreenGui") then
		add("Enabled", "ResetOnSpawn", "IgnoreGuiInset", "DisplayOrder")
	elseif inst:IsA("GuiObject") then
		add("Size", "Position", "AnchorPoint", "BackgroundColor3", "BackgroundTransparency", "BorderSizePixel", "Visible", "ZIndex", "Rotation")
		if inst:IsA("TextLabel") or inst:IsA("TextButton") or inst:IsA("TextBox") then
			add("Text", "TextColor3", "TextScaled", "TextSize", "TextWrapped", "Font", "TextXAlignment", "TextYAlignment", "RichText")
		end
		if inst:IsA("ImageLabel") or inst:IsA("ImageButton") then
			add("Image", "ImageColor3", "ImageTransparency", "ScaleType")
		end
		if inst:IsA("ScrollingFrame") then add("CanvasSize", "ScrollBarThickness", "AutomaticCanvasSize") end
	elseif inst:IsA("UIListLayout") then
		add("FillDirection", "Padding", "HorizontalAlignment", "VerticalAlignment", "SortOrder")
	elseif inst:IsA("UIGridLayout") then
		add("CellSize", "CellPadding", "FillDirection", "SortOrder")
	elseif inst:IsA("UICorner") then
		add("CornerRadius")
	elseif inst:IsA("UIStroke") then
		add("Color", "Thickness", "Transparency", "ApplyStrokeMode")
	elseif inst:IsA("UIPadding") then
		add("PaddingTop", "PaddingBottom", "PaddingLeft", "PaddingRight")
	elseif inst:IsA("PointLight") or inst:IsA("SpotLight") or inst:IsA("SurfaceLight") then
		add("Brightness", "Color", "Range", "Enabled")
	elseif inst:IsA("Sound") then
		add("SoundId", "Volume", "Looped", "PlaybackSpeed")
	elseif inst:IsA("Atmosphere") then
		add("Density", "Color", "Haze")
	elseif inst:IsA("StringValue") or inst:IsA("NumberValue") or inst:IsA("BoolValue") or inst:IsA("IntValue") then
		add("Value")
	elseif inst:IsA("ProximityPrompt") then
		add("ActionText", "ObjectText", "HoldDuration", "MaxActivationDistance")
	elseif inst:IsA("ClickDetector") then
		add("MaxActivationDistance")
	elseif inst:IsA("Humanoid") then
		add("MaxHealth", "Health", "WalkSpeed", "JumpPower")
	end
	return props
end

-- compact live tree for the agent -------------------------------------------
function Serializer.tree(root: Instance?, maxDepth: number, maxNodes: number): any
	local count = 0
	local function walk(inst: Instance, depth: number): any?
		if SKIP_CLASSES[inst.ClassName] and depth > 0 then
			return { name = inst.Name, class = inst.ClassName }
		end
		count += 1
		if count > maxNodes then return nil end
		local kids = inst:GetChildren()
		local node: any = { name = inst.Name, class = inst.ClassName }
		if inst:IsA("BasePart") then
			node.pos = { math.round(inst.Position.X * 10) / 10, math.round(inst.Position.Y * 10) / 10, math.round(inst.Position.Z * 10) / 10 }
			node.size = { math.round(inst.Size.X * 10) / 10, math.round(inst.Size.Y * 10) / 10, math.round(inst.Size.Z * 10) / 10 }
		end
		if #kids > 0 then
			if depth >= maxDepth then
				node.moreChildren = #kids
			else
				local ch = {}
				for _, k in kids do
					local sub = walk(k, depth + 1)
					if sub then table.insert(ch, sub) end
					if count > maxNodes then
						node.truncated = true
						break
					end
				end
				node.children = ch
			end
		end
		return node
	end

	if root then
		return { root = walk(root, 0), nodeCount = count }
	end
	local out = {}
	for _, svcName in CONTAINERS do
		local ok, svc = pcall(function() return (game :: any):GetService(svcName) end)
		if ok and svc then
			table.insert(out, walk(svc, 0))
		end
	end
	return { services = out, nodeCount = count }
end

-- full snapshot for checkpoints ----------------------------------------------
function Serializer.snapshot(includeScripts: boolean): any
	local scripts = {}
	local instanceCount = 0

	local function serialize(inst: Instance, depth: number): any?
		if SKIP_CLASSES[inst.ClassName] then return nil end
		if depth > 40 then return nil end
		instanceCount += 1
		if instanceCount > 25000 then return nil end
		local node: any = { class = inst.ClassName, name = inst.Name }
		local props = {}
		for _, p in propList(inst) do
			local ok, v = pcall(function() return (inst :: any)[p] end)
			if ok and v ~= nil then props[p] = Paths.encode(v) end
		end
		if next(props) then node.props = props end
		local attrs = inst:GetAttributes()
		if next(attrs) then
			local enc = {}
			for k, v in attrs do enc[k] = Paths.encode(v) end
			node.attrs = enc
		end
		if inst:IsA("LuaSourceContainer") and includeScripts then
			table.insert(scripts, { path = Paths.fullPath(inst), class = inst.ClassName, source = (inst :: any).Source })
			node.scriptRef = #scripts
		end
		local kids = {}
		for _, k in inst:GetChildren() do
			local sub = serialize(k, depth + 1)
			if sub then table.insert(kids, sub) end
		end
		if #kids > 0 then node.children = kids end
		return node
	end

	local containers = {}
	for _, svcName in CONTAINERS do
		local ok, svc = pcall(function() return (game :: any):GetService(svcName) end)
		if ok and svc then
			local kids = {}
			for _, k in (svc :: Instance):GetChildren() do
				local sub = serialize(k, 0)
				if sub then table.insert(kids, sub) end
			end
			table.insert(containers, { service = svcName, children = kids })
		end
	end
	return { v = 1, containers = containers, scripts = scripts, scriptCount = #scripts, instanceCount = instanceCount }
end

function Serializer.restore(snapshot: any): any
	if type(snapshot) ~= "table" or snapshot.v ~= 1 then error("unsupported snapshot format") end
	local created = 0
	local function build(node: any, parent: Instance)
		local ok, inst = pcall(function() return Instance.new(node.class) end)
		if not ok then return end
		created += 1
		local i = inst :: Instance
		i.Name = node.name
		if node.props then
			for p, pv in node.props do
				pcall(function() Paths.setProp(i, p, pv) end)
			end
		end
		if node.attrs then
			for k, pv in node.attrs do
				pcall(function() i:SetAttribute(k, Paths.decode(pv)) end)
			end
		end
		if node.scriptRef and snapshot.scripts[node.scriptRef] then
			pcall(function() (i :: any).Source = snapshot.scripts[node.scriptRef].source end)
		end
		if node.children then
			for _, ch in node.children do build(ch, i) end
		end
		i.Parent = parent
	end

	local function clearChildren(inst: Instance)
		for _, child in inst:GetChildren() do
			if SKIP_CLASSES[child.ClassName] then
				-- keep
			elseif MERGE_CLASSES[child.ClassName] then
				clearChildren(child)
			else
				pcall(function() child:Destroy() end)
			end
		end
	end
	local function buildInto(node: any, parent: Instance)
		if MERGE_CLASSES[node.class] then
			local existing = parent:FindFirstChildOfClass(node.class)
			if existing then
				if node.children then
					for _, ch in node.children do buildInto(ch, existing) end
				end
				return
			end
		end
		build(node, parent)
	end
	for _, container in snapshot.containers do
		local ok, svc = pcall(function() return (game :: any):GetService(container.service) end)
		if ok and svc then
			clearChildren(svc :: Instance)
			for _, node in container.children do
				buildInto(node, svc :: Instance)
			end
		end
	end
	return { restored = true, instancesCreated = created, scriptsRestored = snapshot.scriptCount }
end

return Serializer
