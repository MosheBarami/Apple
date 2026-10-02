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
	-- A colour family, not a flat paint: every part takes the hue s.hue (0..1) and keeps its own lightness, so a
	-- two-tone keycap stays two-tone (the plot simulator's variants of the player's own object). Set, not turned: a
	-- rainbow object turned by a hue is still a rainbow, and a recoloured tier looked like the first one.
	if type(s.hue) == "number" then
		for _, p in copy:GetDescendants() do
			if p:IsA("BasePart") then
				local _, sat, v = p.Color:ToHSV()
				p.Color = Color3.fromHSV(s.hue % 1, math.clamp(sat + 0.35, 0.45, 0.9), math.max(v, 0.35))
			end
		end
	end
	-- A copy is a still model: a part that moved under its own rig (a keycap) falls apart once copied and scaled
	-- (live 2026-10-01: a placed machine was parts scattered over five tiles).
	for _, p in copy:GetDescendants() do
		if p:IsA("BasePart") then p.Anchored = true end
	end
	-- Fit to a size, then measure: ScaleTo can fail inside its pcall and leave the copy as it was (the owner's placed
	-- a placed machine covered three plot tiles). When the measure says it did not fit, every part is scaled about the
	-- pivot by hand, joints with it.
	local function fit(measure: (Vector3) -> number, want: number)
		local _, size = (copy :: Model):GetBoundingBox()
		local have = measure(size)
		if have <= 0 then return end
		local ok, err = pcall(function() (copy :: Model):ScaleTo((copy :: Model):GetScale() * want / have) end)
		local _, after = (copy :: Model):GetBoundingBox()
		if measure(after) <= want * 1.05 then return end
		warn(("AppleBoot: %s did not scale (%s); scaling its parts"):format(s.name, if ok then "ScaleTo left it at " .. math.floor(measure(after)) else tostring(err)))
		local k = want / measure(after)
		local pivot = (copy :: Model):GetPivot()
		for _, d in copy:GetDescendants() do
			if d:IsA("BasePart") then
				local rel = pivot:ToObjectSpace(d.CFrame)
				d.Size *= k
				d.CFrame = pivot * (rel - rel.Position + rel.Position * k)
			elseif d:IsA("JointInstance") then
				d.C0 = d.C0 - d.C0.Position + d.C0.Position * k
				d.C1 = d.C1 - d.C1.Position + d.C1.Position * k
			end
		end
	end
	if s.height then
		fit(function(v) return v.Y end, s.height)
	elseif s.width then
		-- Fit the widest side to s.width (a machine on a plot tile).
		fit(function(v) return math.max(v.X, v.Z) end, s.width)
	end
	-- A machine stands on a plinth: a flat machine fitted to a plot tile is a third of a stud thin and read as a sticker on
	-- the tile (round 12 of the owner's test 1). The plinth is part of the copy, so it is placed and sold with it.
	if s.width and copy:IsA("Model") then
		local box, size = (copy :: Model):GetBoundingBox()
		if size.Y < s.width * 0.25 then
			local plinth = Instance.new("Part")
			plinth.Name = "Plinth"
			plinth.Anchored = true
			plinth.Size = Vector3.new(size.X + 0.4, 1.2, size.Z + 0.4)
			plinth.CFrame = box * CFrame.new(0, -size.Y / 2 - 0.6, 0)
			plinth.Color = Color3.fromRGB(46, 48, 56)
			plinth.Material = Enum.Material.SmoothPlastic
			plinth.TopSurface = Enum.SurfaceType.Smooth
			plinth.Parent = copy
			local glow = Instance.new("Part")
			glow.Name = "PlinthGlow"
			glow.Anchored = true
			glow.CanCollide = false
			glow.Size = Vector3.new(size.X + 0.6, 0.15, size.Z + 0.6)
			glow.CFrame = box * CFrame.new(0, -size.Y / 2 - 1.2 + 0.075, 0)
			glow.Material = Enum.Material.Neon
			glow.Color = if type(s.hue) == "number" then Color3.fromHSV(s.hue % 1, 0.8, 1) else Color3.fromRGB(180, 77, 255)
			glow.Parent = copy
		end
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
