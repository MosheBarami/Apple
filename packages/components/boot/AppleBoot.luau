--!strict
-- Starts a composed game. It stages the imported library pieces (config.stage), builds new creatures
-- (config.creatures), then readies what the build could not do with plain objects: every model in the
-- containers listed in AppleGameConfig.prepare is made animatable (AppleMotion.prepare), and every instance in
-- Workspace with an AppleTags attribute ("AppleTile, ...") gets those CollectionService tags. Then it starts the
-- systems listed in `start`, in order, each with the whole config and the economy. A system that fails to
-- start is named in Output and the others still start.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local CollectionService = game:GetService("CollectionService")
local folder = game:GetService("ServerScriptService"):WaitForChild("AppleComponents")
local config = require(folder:WaitForChild("AppleGameConfig")) :: any

local function resolve(path: string): Instance?
	local at: Instance? = game
	for part in string.gmatch(path, "[^%.]+") do at = at and at:FindFirstChild(part) end
	return at
end

-- The piece inside an import folder: the library item itself (a Model, or a Part/MeshPart wrapped in one).
local function pieceOf(holder: Instance?): Instance?
	if not holder then return nil end
	if not holder:IsA("Folder") then return holder end
	return holder:FindFirstChildWhichIsA("Model") or holder:FindFirstChildWhichIsA("BasePart") or holder:FindFirstChildWhichIsA("Tool")
end

-- Staging: library pieces the build imported (ServerStorage.AppleParts.<key>) go, as copies, to the place a system
-- reads them from, under the name it knows them by, at the size the recipe asked for.
for _, s in config.stage or {} do
	local item = pieceOf(resolve(s.from))
	local to = resolve(s.to)
	if not item or not to then warn("AppleBoot: cannot stage " .. tostring(s.from) .. " into " .. tostring(s.to)); continue end
	local copy = item:Clone()
	if copy:IsA("Tool") then
		local m = Instance.new("Model")
		for _, c in copy:GetChildren() do c.Parent = m end
		copy:Destroy()
		copy = m
	elseif not copy:IsA("Model") then
		local m = Instance.new("Model")
		copy.Parent = m
		if copy:IsA("BasePart") then m.PrimaryPart = copy end
		copy = m
	end
	for _, d in copy:GetDescendants() do
		if d:IsA("Script") or d:IsA("LocalScript") then d:Destroy() end
	end
	copy.Name = s.name
	if s.color then
		-- A tint: a peach becomes an orange, a pale piece takes the game's colour. Textures would hide it, so they go.
		local colour = Color3.fromHex(s.color)
		for _, p in copy:GetDescendants() do
			if p:IsA("BasePart") then
				p.Color = colour
				if p:IsA("MeshPart") then p.TextureID = "" end
			elseif p:IsA("SpecialMesh") then
				p.TextureId = ""
			elseif p:IsA("Decal") or p:IsA("Texture") or p:IsA("SurfaceAppearance") then
				p:Destroy()
			end
		end
	end
	-- A colour family, not a flat paint: every part's hue turns by s.hue (0..1) and keeps its own lightness, so a
	-- two-tone keycap stays two-tone (the plot simulator's variants of the player's own object).
	if type(s.hue) == "number" then
		for _, p in copy:GetDescendants() do
			if p:IsA("BasePart") then
				local h, sat, v = p.Color:ToHSV()
				p.Color = Color3.fromHSV((h + s.hue) % 1, math.max(sat, 0.35), v)
			end
		end
	end
	if s.height then
		local _, size = (copy :: Model):GetBoundingBox()
		if size.Y > 0 then pcall(function() (copy :: Model):ScaleTo((copy :: Model):GetScale() * s.height / size.Y) end) end
	elseif s.width then
		-- Fit the widest side to s.width (a machine on a plot tile).
		local _, size = (copy :: Model):GetBoundingBox()
		local wide = math.max(size.X, size.Z)
		if wide > 0 then pcall(function() (copy :: Model):ScaleTo((copy :: Model):GetScale() * s.width / wide) end) end
	end
	copy.Parent = to
end

-- New creatures first (AppleCreatures), so the preparation below animates them too.
local creatures = folder:FindFirstChild("AppleCreatures")
if creatures and config.creatures then
	local ok, err = pcall(function() (require(creatures) :: any).start(config) end)
	if not ok then warn("AppleBoot: creatures were not built: " .. tostring(err)) end
end

local shared = ReplicatedStorage:FindFirstChild("AppleComponents")
local motionModule = shared and shared:FindFirstChild("AppleMotion")
if motionModule then
	local Motion = require(motionModule) :: any
	for _, path in config.prepare or {} do
		local at: Instance? = game
		for part in string.gmatch(path, "[^%.]+") do at = at and at:FindFirstChild(part) end
		if at then
			for _, model in at:GetChildren() do
				if model:IsA("Model") then
					local ok, err = pcall(Motion.prepare, model)
					if not ok then warn("AppleBoot: could not prepare " .. model:GetFullName() .. ": " .. tostring(err)) end
				end
			end
		end
	end
end

-- Places stream their content: a player far from a plot would not have its tiles, so tiles could not glow or be
-- picked (seen in a check 2026-10-01: plot found, 0 tiles). The plots are always sent to every player.
local plots = workspace:FindFirstChild("AppleMap") and workspace.AppleMap:FindFirstChild("Plots")
for _, plot in (if plots then plots:GetChildren() else {}) do
	if plot:IsA("Model") then pcall(function() (plot :: any).ModelStreamingMode = Enum.ModelStreamingMode.Persistent end) end
end

for _, d in workspace:GetDescendants() do
	local tags = d:GetAttribute("AppleTags")
	if type(tags) == "string" then
		for tag in string.gmatch(tags, "[^,%s]+") do CollectionService:AddTag(d, tag) end
	end
end

local economy = if folder:FindFirstChild("AppleEconomy") then require(folder.AppleEconomy) :: any else nil
for _, name in config.start or {} do
	local module = folder:FindFirstChild(name)
	if not module then
		warn("AppleBoot: " .. name .. " is not installed")
		continue
	end
	local ok, err = pcall(function() (require(module) :: any).start(config, economy) end)
	if not ok then warn("AppleBoot: " .. name .. " did not start: " .. tostring(err)) end
end
