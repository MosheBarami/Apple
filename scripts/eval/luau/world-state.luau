--!nocheck
-- StudPilot evaluation harness: the state of the open place, in four modes.
--
-- run-piece.mjs sends this through Studio's `execute_luau` (Edit datamodel) after putting two lines in
-- front of it:
--     local MODE = "capture" | "reset" | "verify" | "measure"
--     local BASELINE_JSON = [=====[ ...json from `capture`, or "" for capture... ]=====]
-- It returns ONE JSON string and nothing else.
--
--   capture  records what the PRISTINE place holds: every instance under the services a run can write to
--            (name + class + position among same-named siblings, as a path), the scalar properties a run can
--            change (Lighting, SoundService, Workspace gravity, the kept parts), and whether the Terrain is
--            empty. Run it once, on a clean Baseplate; the result is the harness's definition of "clean".
--   reset    destroys everything that was not in the baseline (so Baseplate, SpawnLocation, Terrain, the camera
--            and the engine's own singletons survive because the baseline lists them), puts the recorded
--            properties back, rebuilds a kept part a run deleted, and clears the Terrain if it was empty.
--   verify   changes nothing; lists what differs from the baseline. "Clean" means nothing differs.
--   measure  changes nothing; describes what a run ADDED: how many instances and parts, their bounding box,
--            the screen UIs, and where the spawn is.
--
-- Only standard Luau and Roblox API is used, so tests/eval-world-state.test.mjs can run this file under the
-- real `luau` interpreter against a small stand-in for the DataModel.

local HttpService = game:GetService("HttpService")

-- The services an op of the Studio plugin can write to (apps/studpilot-plugin/src/Commands.luau, PLACE_SERVICES).
local SERVICES = {
	"Workspace", "ReplicatedStorage", "ServerScriptService", "ServerStorage", "StarterGui", "StarterPack",
	"StarterPlayer", "ReplicatedFirst", "Lighting", "SoundService", "Teams", "TextChatService", "MaterialService",
}

-- Classes the engine makes at run time and nobody authors: never inventoried, never destroyed.
local IGNORED_CLASSES = { Camera = true, Terrain = true, TouchTransmitter = true }

-- The scalar properties a run can change, by service (the write allowlist of the Studio plugin), with their type.
local SERVICE_PROPS = {
	Lighting = {
		Ambient = "Color3", Brightness = "number", ClockTime = "number", ColorShift_Bottom = "Color3",
		ColorShift_Top = "Color3", EnvironmentDiffuseScale = "number", EnvironmentSpecularScale = "number",
		ExposureCompensation = "number", FogColor = "Color3", FogEnd = "number", FogStart = "number",
		GeographicLatitude = "number", GlobalShadows = "boolean", OutdoorAmbient = "Color3", ShadowSoftness = "number",
	},
	SoundService = {
		AmbientReverb = "enum:ReverbType", DistanceFactor = "number", DopplerScale = "number", RolloffScale = "number",
	},
	Workspace = { Gravity = "number" },
	-- Whether a ScreenGui in StarterGui is drawn in Studio's edit-mode viewport: the UI captures depend on it.
	StarterGui = { ShowDevelopmentGui = "boolean" },
}
local PART_PROPS = {
	Anchored = "boolean", CanCollide = "boolean", Transparency = "number", Reflectance = "number",
	Material = "enum:Material", Color = "Color3", Size = "Vector3",
}
local MAX_INVENTORY = 20000

local function getService(name)
	local ok, service = pcall(function()
		return game:GetService(name)
	end)
	if ok then
		return service
	end
	return nil
end

local function isBasePart(inst)
	local ok, result = pcall(function()
		return inst:IsA("BasePart")
	end)
	return ok and result == true
end

local function encodeValue(kind, value)
	if kind == "Color3" then
		return { value.R, value.G, value.B }
	elseif kind == "Vector3" then
		return { value.X, value.Y, value.Z }
	elseif string.sub(kind, 1, 5) == "enum:" then
		return value.Name
	end
	return value
end

local function decodeValue(kind, stored)
	if kind == "Color3" then
		return Color3.new(stored[1], stored[2], stored[3])
	elseif kind == "Vector3" then
		return Vector3.new(stored[1], stored[2], stored[3])
	elseif string.sub(kind, 1, 5) == "enum:" then
		return Enum[string.sub(kind, 6)][stored]
	end
	return stored
end

local function sameValue(a, b)
	if type(a) == "table" and type(b) == "table" then
		if #a ~= #b then
			return false
		end
		for i = 1, #a do
			if math.abs(a[i] - b[i]) > 1e-4 then
				return false
			end
		end
		return true
	end
	if type(a) == "number" and type(b) == "number" then
		return math.abs(a - b) <= 1e-4
	end
	return a == b
end

local function readProps(inst, spec)
	local out = {}
	for name, kind in pairs(spec) do
		local ok, value = pcall(function()
			return inst[name]
		end)
		if ok and value ~= nil then
			out[name] = encodeValue(kind, value)
		end
	end
	return out
end

local function readCFrame(part)
	return { part.CFrame:GetComponents() }
end

-- A key for each instance: PATH#Class, where the path counts same-named siblings (Part, Part#2, ...).
-- Children are visited in a stable order (by name, then class) so a rerun yields the same keys.
local function sortedChildren(parent)
	local kids = {}
	for _, child in ipairs(parent:GetChildren()) do
		if not IGNORED_CLASSES[child.ClassName] then
			table.insert(kids, child)
		end
	end
	table.sort(kids, function(a, b)
		if a.Name ~= b.Name then
			return a.Name < b.Name
		end
		return a.ClassName < b.ClassName
	end)
	return kids
end

-- visit(inst, key, parentKey, depth) for every inventoried descendant of `root`; `root` itself is not visited.
local function walk(root, rootKey, visit)
	local count = 0
	local function go(parent, parentKey, depth)
		local seen = {}
		for _, child in ipairs(sortedChildren(parent)) do
			local base = child.Name .. "#" .. child.ClassName
			seen[base] = (seen[base] or 0) + 1
			local key = parentKey .. "/" .. child.Name .. "#" .. child.ClassName
			if seen[base] > 1 then
				key = key .. "#" .. seen[base]
			end
			count += 1
			if count > MAX_INVENTORY then
				error("more than " .. MAX_INVENTORY .. " instances under " .. rootKey)
			end
			-- visit may answer false to say "do not descend into this one" (it is being destroyed or counted whole)
			local descend = visit(child, key, parentKey, depth)
			if descend ~= false then
				go(child, key, depth + 1)
			end
		end
	end
	go(root, rootKey, 1)
end

local function inventoryOf(service, name)
	local keys = {}
	walk(service, name, function(inst, key)
		table.insert(keys, key)
		return true
	end)
	return keys
end

local function baselineSet(baseline)
	local set = {}
	for _, keys in pairs(baseline.inventory) do
		for _, key in ipairs(keys) do
			set[key] = true
		end
	end
	return set
end

local function terrainCells()
	local terrain = workspace:FindFirstChildOfClass("Terrain")
	if not terrain then
		return nil
	end
	local ok, n = pcall(function()
		return terrain:CountCells()
	end)
	if ok then
		return n
	end
	return nil
end

-- ------------------------------------------------------------------ capture
local function capture()
	local out = { inventory = {}, props = {}, parts = {}, terrainCells = terrainCells() }
	for _, name in ipairs(SERVICES) do
		local service = getService(name)
		if service then
			out.inventory[name] = inventoryOf(service, name)
			local spec = SERVICE_PROPS[name]
			if spec then
				out.props[name] = readProps(service, spec)
			end
		end
	end
	-- The parts a reset must be able to put back: BasePart children of Workspace that the pristine place has.
	for _, child in ipairs(sortedChildren(workspace)) do
		if isBasePart(child) then
			local entry = readProps(child, PART_PROPS)
			entry.cframe = readCFrame(child)
			entry.class = child.ClassName
			out.parts["Workspace/" .. child.Name .. "#" .. child.ClassName] = entry
		end
	end
	return out
end

-- ------------------------------------------------------------------ the diff against the baseline
local function diff(baseline)
	local known = baselineSet(baseline)
	local extra, missing, propDiffs = {}, {}, {}
	for _, name in ipairs(SERVICES) do
		local service = getService(name)
		if service then
			local present = {}
			for _, key in ipairs(inventoryOf(service, name)) do
				present[key] = true
				if not known[key] then
					table.insert(extra, key)
				end
			end
			for _, key in ipairs(baseline.inventory[name] or {}) do
				if not present[key] then
					table.insert(missing, key)
				end
			end
			local spec = SERVICE_PROPS[name]
			if spec then
				local now = readProps(service, spec)
				for prop, was in pairs(baseline.props[name] or {}) do
					if now[prop] ~= nil and not sameValue(now[prop], was) then
						table.insert(propDiffs, name .. "." .. prop)
					end
				end
			end
		end
	end
	for key, entry in pairs(baseline.parts) do
		local name = string.match(key, "^Workspace/(.+)#[^#]+$")
		local part = name and workspace:FindFirstChild(name)
		if part and isBasePart(part) then
			local now = readProps(part, PART_PROPS)
			for prop, was in pairs(entry) do
				if PART_PROPS[prop] and now[prop] ~= nil and not sameValue(now[prop], was) then
					table.insert(propDiffs, key .. "." .. prop)
				end
			end
			if not sameValue(readCFrame(part), entry.cframe) then
				table.insert(propDiffs, key .. ".CFrame")
			end
		end
	end
	local cells = terrainCells()
	if cells ~= nil and baseline.terrainCells ~= nil and cells ~= baseline.terrainCells then
		table.insert(propDiffs, "Terrain.cells " .. tostring(baseline.terrainCells) .. " -> " .. tostring(cells))
	end
	table.sort(extra)
	table.sort(missing)
	table.sort(propDiffs)
	return { extra = extra, missing = missing, propDiffs = propDiffs }
end

-- ------------------------------------------------------------------ reset
local function reset(baseline)
	local known = baselineSet(baseline)
	local removed = {}
	local removedTotal = 0
	for _, name in ipairs(SERVICES) do
		local service = getService(name)
		if service then
			local doomed = {}
			walk(service, name, function(inst, key)
				if known[key] then
					return true
				end
				table.insert(doomed, inst)
				return false -- the whole subtree goes with it
			end)
			for _, inst in ipairs(doomed) do
				local descendants = #inst:GetDescendants() + 1
				local ok = pcall(function()
					inst:Destroy()
				end)
				if ok then
					removedTotal += descendants
					removed[name] = (removed[name] or 0) + descendants
				end
			end
		end
	end

	-- Properties a run can have changed.
	local restored = {}
	for name, spec in pairs(SERVICE_PROPS) do
		local service = getService(name)
		if service then
			for prop, kind in pairs(spec) do
				local was = baseline.props[name] and baseline.props[name][prop]
				if was ~= nil then
					local ok, current = pcall(function()
						return service[prop]
					end)
					if ok and not sameValue(encodeValue(kind, current), was) then
						local set = pcall(function()
							service[prop] = decodeValue(kind, was)
						end)
						if set then
							table.insert(restored, name .. "." .. prop)
						end
					end
				end
			end
		end
	end

	-- The kept parts: put the recorded properties back; rebuild one a run deleted.
	local rebuilt = {}
	for key, entry in pairs(baseline.parts) do
		local name = string.match(key, "^Workspace/(.+)#[^#]+$")
		local part = name and workspace:FindFirstChild(name)
		if name and (not part or not isBasePart(part)) then
			local made = Instance.new(entry.class)
			made.Name = name
			part = made
			part.Parent = workspace
			table.insert(rebuilt, key)
		end
		if name and part then
			for prop, kind in pairs(PART_PROPS) do
				local was = entry[prop]
				if was ~= nil then
					local ok, current = pcall(function()
						return part[prop]
					end)
					if ok and not sameValue(encodeValue(kind, current), was) then
						pcall(function()
							part[prop] = decodeValue(kind, was)
						end)
						table.insert(restored, key .. "." .. prop)
					end
				end
			end
			if not sameValue(readCFrame(part), entry.cframe) then
				part.CFrame = CFrame.new(table.unpack(entry.cframe))
				table.insert(restored, key .. ".CFrame")
			end
		end
	end

	-- Terrain: only a pristine place with NO terrain can be put back by clearing it.
	local terrainCleared = false
	if baseline.terrainCells == 0 then
		local terrain = workspace:FindFirstChildOfClass("Terrain")
		local cells = terrainCells()
		if terrain and cells ~= nil and cells > 0 then
			terrain:Clear()
			terrainCleared = true
		end
	end
	table.sort(restored)
	table.sort(rebuilt)
	return { removedInstances = removedTotal, removedByService = removed, restored = restored, rebuilt = rebuilt, terrainCleared = terrainCleared }
end

-- ------------------------------------------------------------------ measure
local function extentsOf(part)
	local cf, size = part.CFrame, part.Size
	local r, u, l = cf.RightVector, cf.UpVector, cf.LookVector
	local p = cf.Position
	local hx = (math.abs(r.X) * size.X + math.abs(u.X) * size.Y + math.abs(l.X) * size.Z) / 2
	local hy = (math.abs(r.Y) * size.X + math.abs(u.Y) * size.Y + math.abs(l.Y) * size.Z) / 2
	local hz = (math.abs(r.Z) * size.X + math.abs(u.Z) * size.Y + math.abs(l.Z) * size.Z) / 2
	return p.X - hx, p.Y - hy, p.Z - hz, p.X + hx, p.Y + hy, p.Z + hz
end

local function measure(baseline)
	local known = baselineSet(baseline)
	local addedByService, addedTotal, addedParts, addedScripts = {}, 0, 0, 0
	local minX, minY, minZ, maxX, maxY, maxZ = math.huge, math.huge, math.huge, -math.huge, -math.huge, -math.huge
	local screenGuis = {}

	local function countWhole(inst, serviceName)
		local all = inst:GetDescendants()
		table.insert(all, inst)
		for _, d in ipairs(all) do
			if not IGNORED_CLASSES[d.ClassName] then
				addedTotal += 1
				addedByService[serviceName] = (addedByService[serviceName] or 0) + 1
				if serviceName == "Workspace" and isBasePart(d) then
					addedParts += 1
					local a, b, c, x, y, z = extentsOf(d)
					minX, minY, minZ = math.min(minX, a), math.min(minY, b), math.min(minZ, c)
					maxX, maxY, maxZ = math.max(maxX, x), math.max(maxY, y), math.max(maxZ, z)
				end
				if d:IsA("LuaSourceContainer") then
					addedScripts += 1
				end
			end
		end
	end

	for _, name in ipairs(SERVICES) do
		local service = getService(name)
		if service then
			walk(service, name, function(inst, key)
				if known[key] then
					return true
				end
				countWhole(inst, name)
				if name == "StarterGui" and inst:IsA("ScreenGui") then
					local guiObjects, texts = 0, 0
					for _, d in ipairs(inst:GetDescendants()) do
						if d:IsA("GuiObject") then
							guiObjects += 1
							local ok, text = pcall(function()
								return d.Text
							end)
							if ok and type(text) == "string" and text ~= "" then
								texts += 1
							end
						end
					end
					table.insert(screenGuis, { name = inst.Name, enabled = inst.Enabled, guiObjects = guiObjects, texts = texts })
				end
				return false
			end)
		end
	end

	local bounds = nil
	if addedParts > 0 then
		bounds = { min = { minX, minY, minZ }, max = { maxX, maxY, maxZ } }
	end

	-- Where the player spawns: the pristine SpawnLocation, found by class, or the origin.
	local spawn = { position = { 0, 0, 0 }, size = { 6, 1, 6 } }
	for _, child in ipairs(workspace:GetChildren()) do
		if child:IsA("SpawnLocation") then
			local p = child.Position
			spawn = { position = { p.X, p.Y, p.Z }, size = { child.Size.X, child.Size.Y, child.Size.Z } }
			break
		end
	end

	local viewport = nil
	local camera = workspace.CurrentCamera
	if camera then
		local ok, size = pcall(function()
			return camera.ViewportSize
		end)
		if ok then
			viewport = { size.X, size.Y }
		end
	end

	return {
		addedInstances = addedTotal,
		addedParts = addedParts,
		addedScripts = addedScripts,
		addedByService = addedByService,
		bounds = bounds,
		screenGuis = screenGuis,
		spawn = spawn,
		viewport = viewport,
		terrainCells = terrainCells(),
	}
end

-- ------------------------------------------------------------------ run
local baseline = nil
if MODE ~= "capture" then
	baseline = HttpService:JSONDecode(BASELINE_JSON)
end

local result
if MODE == "capture" then
	result = capture()
elseif MODE == "reset" then
	result = reset(baseline)
elseif MODE == "verify" then
	result = diff(baseline)
elseif MODE == "measure" then
	result = measure(baseline)
else
	error("unknown MODE " .. tostring(MODE))
end

return HttpService:JSONEncode(result)
