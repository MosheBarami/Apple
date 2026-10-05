--!nocheck
-- StudPilot evaluation harness: the state of the open place, in six modes.
--
-- run-piece.mjs sends this through Studio's `execute_luau` (Edit datamodel) after putting three lines in
-- front of it:
--     local MODE = "capture" | "reset" | "verify" | "measure" | "ui-enable" | "ui-restore"
--     local BASELINE_JSON = [=====[ ...json from `capture`, or "" for capture... ]=====]
--     local PROPERTY_NAMES = { "Anchored", "CanCollide", ... }   -- PROPERTY_ALLOW of apps/studpilot-plugin/src/Commands.luau
-- It returns ONE JSON string and nothing else.
--
--   capture    records what the PRISTINE place holds: every instance under the services a run can write to
--              (name + class + position among same-named siblings, as a path) and, for EVERY one of them and for the
--              services themselves, each property the plugin is allowed to write that the instance has, and its
--              attributes. Run it once, on a clean Baseplate; the result is the harness's definition of "clean".
--   reset      destroys everything that was not in the baseline (so Baseplate, SpawnLocation, Terrain, the camera
--              and the engine's own singletons survive because the baseline lists them), puts every recorded
--              property and attribute of every kept instance back, rebuilds a Baseplate or SpawnLocation a run
--              deleted, and clears the Terrain if it was empty.
--   verify     changes nothing; lists what differs from the baseline: extra and missing instances and every recorded
--              property or attribute that has another value. "Clean" means nothing differs.
--   measure    changes nothing; describes what a run ADDED: how many instances and parts, the box to frame (not counting
--              invisible parts or ground-sized slabs), the terrain it edited, the screen UIs, and where the player spawns.
--   ui-enable  turns on the ScreenGuis a run added that are switched off (a modal opened by a button), so the capture can
--              see them; each is marked with an attribute so `ui-restore` puts exactly those back. A reset destroys them anyway.
--
-- What is tracked, and what is not. The property list is the plugin's own write allowlist, read from Commands.luau by
-- world.mjs, never typed here, plus Gravity and ShowDevelopmentGui. A name counts for a class only if it reads without
-- error on an instance of that class and has a value of a type this file can record (booleans, numbers, strings, Color3,
-- Vector3, Vector2, UDim2, CFrame, enums, NumberRange, PhysicalProperties). A property of another type (a Font, an
-- instance reference) is not tracked. Instances are matched by their path key, so a renamed or moved kept instance is
-- reported as missing (and, for a part directly in Workspace, rebuilt), not silently accepted.
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

-- Properties the harness tracks that the plugin's allowlist does not name (a service property a run could still reach).
-- Whether a ScreenGui in StarterGui is drawn in Studio's edit-mode viewport (the UI captures depend on it) is one.
local EXTRA_PROPERTY_NAMES = { "Gravity", "ShowDevelopmentGui" }
-- Position and Orientation follow CFrame: tracked through it, not twice.
local FOLLOWS_CFRAME = { Position = true, Orientation = true }
local MAX_INVENTORY = 20000
local ENGINE_ATTRIBUTE_PREFIX = "RBX"
-- Framing: a part this see-through is not the piece, and a part this big is the ground it stands on.
local HIDDEN_TRANSPARENCY = 0.95
local HUGE_STUDS = 300
-- A terrain box wider than this (studs) is a sentinel, not a measurement.
local MAX_TERRAIN_SPAN = 8192
local TERRAIN_VOXEL = 4
local WAS_DISABLED_ATTRIBUTE = "EvalWasDisabled"

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

-- ------------------------------------------------------------------ values
-- A value as plain data: a boolean, number or string as itself; anything else as { t = <type>, v = { numbers or strings } }.
-- Returns nil for a type that is not tracked (an Instance, a function, a Font...), and { t = "nil" } for a property whose
-- value is nil, so "was nil, is now set" is a difference like any other.
local function encodeValue(value)
	if value == nil then
		return { t = "nil", v = {} }
	end
	local kind = typeof(value)
	if kind == "boolean" or kind == "string" then
		return value
	elseif kind == "number" then
		if value ~= value then
			return { t = "num", v = { "nan" } }
		elseif value == math.huge then
			return { t = "num", v = { "inf" } }
		elseif value == -math.huge then
			return { t = "num", v = { "-inf" } }
		end
		return value
	elseif kind == "Color3" then
		return { t = kind, v = { value.R, value.G, value.B } }
	elseif kind == "Vector3" then
		return { t = kind, v = { value.X, value.Y, value.Z } }
	elseif kind == "Vector2" then
		return { t = kind, v = { value.X, value.Y } }
	elseif kind == "UDim2" then
		return { t = kind, v = { value.X.Scale, value.X.Offset, value.Y.Scale, value.Y.Offset } }
	elseif kind == "CFrame" then
		return { t = kind, v = { value:GetComponents() } }
	elseif kind == "EnumItem" then
		return { t = kind, v = { tostring(value.EnumType), value.Name } }
	elseif kind == "NumberRange" then
		return { t = kind, v = { value.Min, value.Max } }
	elseif kind == "PhysicalProperties" then
		return { t = kind, v = { value.Density, value.Friction, value.Elasticity, value.FrictionWeight, value.ElasticityWeight } }
	end
	return nil
end

local function decodeValue(enc)
	if type(enc) ~= "table" then
		return enc
	end
	local t, v = enc.t, enc.v
	if t == "nil" then
		return nil
	elseif t == "num" then
		if v[1] == "inf" then
			return math.huge
		elseif v[1] == "-inf" then
			return -math.huge
		end
		return 0 / 0
	elseif t == "Color3" then
		return Color3.new(v[1], v[2], v[3])
	elseif t == "Vector3" then
		return Vector3.new(v[1], v[2], v[3])
	elseif t == "Vector2" then
		return Vector2.new(v[1], v[2])
	elseif t == "UDim2" then
		return UDim2.new(v[1], v[2], v[3], v[4])
	elseif t == "CFrame" then
		return CFrame.new(table.unpack(v))
	elseif t == "EnumItem" then
		return Enum[v[1]][v[2]]
	elseif t == "NumberRange" then
		return NumberRange.new(v[1], v[2])
	elseif t == "PhysicalProperties" then
		return PhysicalProperties.new(v[1], v[2], v[3], v[4], v[5])
	end
	error("cannot decode a value of type " .. tostring(t))
end

local function sameValue(a, b)
	if type(a) == "table" and type(b) == "table" then
		if a.t ~= b.t or #a.v ~= #b.v then
			return false
		end
		for i = 1, #a.v do
			local x, y = a.v[i], b.v[i]
			if type(x) == "number" and type(y) == "number" then
				if math.abs(x - y) > 1e-4 then
					return false
				end
			elseif x ~= y then
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

-- ------------------------------------------------------------------ properties and attributes
local ALL_NAMES = {}
do
	local seen = {}
	for _, list in ipairs({ PROPERTY_NAMES, EXTRA_PROPERTY_NAMES }) do
		for _, name in ipairs(list) do
			if not seen[name] then
				seen[name] = true
				table.insert(ALL_NAMES, name)
			end
		end
	end
	table.sort(ALL_NAMES)
end

local function readProperty(inst, name)
	local ok, value = pcall(function()
		return inst[name]
	end)
	return ok, value
end

-- A property as recorded data right now, or nil when it cannot be read or is not a tracked type. (Not `ok and encode(v) or nil`:
-- a false boolean is a value, and that idiom would turn it into "unreadable".)
local function currentEncoded(inst, name)
	local ok, value = readProperty(inst, name)
	if not ok then
		return nil
	end
	return encodeValue(value)
end

-- The tracked property names of an instance's class: those that read without error and hold a value of a tracked type.
-- Worked out on the first instance of each class and reused (a class has the same properties on every instance).
local namesByClass = {}
local function namesFor(inst)
	local class = inst.ClassName
	local known = namesByClass[class]
	if known then
		return known
	end
	local list = {}
	local hasCFrame = false
	for _, name in ipairs(ALL_NAMES) do
		local ok, value = readProperty(inst, name)
		if ok and encodeValue(value) ~= nil then
			table.insert(list, name)
			if name == "CFrame" then
				hasCFrame = true
			end
		end
	end
	if hasCFrame then
		local kept = {}
		for _, name in ipairs(list) do
			if not FOLLOWS_CFRAME[name] then
				table.insert(kept, name)
			end
		end
		list = kept
	end
	namesByClass[class] = list
	return list
end

local function readAttributes(inst)
	local out = {}
	local ok, all = pcall(function()
		return inst:GetAttributes()
	end)
	if ok and type(all) == "table" then
		for name, value in pairs(all) do
			if string.sub(name, 1, #ENGINE_ATTRIBUTE_PREFIX) ~= ENGINE_ATTRIBUTE_PREFIX then
				local enc = encodeValue(value)
				if enc ~= nil then
					out[name] = enc
				end
			end
		end
	end
	return out
end

local function stateOf(inst)
	local props = {}
	for _, name in ipairs(namesFor(inst)) do
		local ok, value = readProperty(inst, name)
		if ok then
			local enc = encodeValue(value)
			if enc ~= nil then
				props[name] = enc
			end
		end
	end
	return { name = inst.Name, class = inst.ClassName, props = props, attrs = readAttributes(inst) }
end

local function sortedKeys(t)
	local keys = {}
	for k in pairs(t) do
		table.insert(keys, k)
	end
	table.sort(keys)
	return keys
end

-- The names of what differs between an instance now and what was recorded, as "<key>.<Property>" and "<key>@<attribute>".
local function stateDiffs(key, inst, was)
	local diffs = {}
	for _, name in ipairs(sortedKeys(was.props)) do
		-- A property that was readable and is not now (or changed to a type this file does not record) is a difference:
		-- a failure to read must not look like "unchanged".
		local now = currentEncoded(inst, name)
		if now == nil or not sameValue(now, was.props[name]) then
			table.insert(diffs, key .. "." .. name)
		end
	end
	local nowAttrs = readAttributes(inst)
	for _, name in ipairs(sortedKeys(was.attrs or {})) do
		if nowAttrs[name] == nil or not sameValue(nowAttrs[name], was.attrs[name]) then
			table.insert(diffs, key .. "@" .. name)
		end
	end
	for _, name in ipairs(sortedKeys(nowAttrs)) do
		if (was.attrs or {})[name] == nil then
			table.insert(diffs, key .. "@" .. name)
		end
	end
	return diffs
end

-- Put every recorded property and attribute back. Returns what was restored and what could not be.
local function restoreState(key, inst, was, restored, failed)
	for _, name in ipairs(sortedKeys(was.props)) do
		local now = currentEncoded(inst, name)
		if now == nil or not sameValue(now, was.props[name]) then
			local done = pcall(function()
				inst[name] = decodeValue(was.props[name])
			end)
			table.insert(done and restored or failed, key .. "." .. name)
		end
	end
	local nowAttrs = readAttributes(inst)
	for _, name in ipairs(sortedKeys(was.attrs or {})) do
		if nowAttrs[name] == nil or not sameValue(nowAttrs[name], was.attrs[name]) then
			local done = pcall(function()
				inst:SetAttribute(name, decodeValue(was.attrs[name]))
			end)
			table.insert(done and restored or failed, key .. "@" .. name)
		end
	end
	for _, name in ipairs(sortedKeys(nowAttrs)) do
		if (was.attrs or {})[name] == nil then
			local done = pcall(function()
				inst:SetAttribute(name, nil)
			end)
			table.insert(done and restored or failed, key .. "@" .. name)
		end
	end
end

-- ------------------------------------------------------------------ the tree
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

-- Every inventoried instance now, by key, and the services themselves by name.
local function liveMap()
	local live = {}
	for _, name in ipairs(SERVICES) do
		local service = getService(name)
		if service then
			live[name] = service
			walk(service, name, function(inst, key)
				live[key] = inst
				return true
			end)
		end
	end
	return live
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

-- Where the terrain is, in studs, or nil when the engine cannot say (an error, an empty box, or a box so wide that it is a limit and not a measurement).
local function terrainExtents()
	local terrain = workspace:FindFirstChildOfClass("Terrain")
	if not terrain then
		return nil
	end
	local ok, ext = pcall(function()
		local region = terrain.MaxExtents
		local lo, hi = region.Min, region.Max
		return {
			min = { lo.X * TERRAIN_VOXEL, lo.Y * TERRAIN_VOXEL, lo.Z * TERRAIN_VOXEL },
			max = { (hi.X + 1) * TERRAIN_VOXEL, (hi.Y + 1) * TERRAIN_VOXEL, (hi.Z + 1) * TERRAIN_VOXEL },
		}
	end)
	if not ok or ext == nil then
		return nil
	end
	for i = 1, 3 do
		local span = ext.max[i] - ext.min[i]
		if span ~= span or span <= 0 or span > MAX_TERRAIN_SPAN then
			return nil
		end
	end
	return ext
end

-- ------------------------------------------------------------------ capture
local function capture()
	local out = { format = 2, inventory = {}, state = {}, terrainCells = terrainCells() }
	for _, name in ipairs(SERVICES) do
		local service = getService(name)
		if service then
			out.inventory[name] = inventoryOf(service, name)
			out.state[name] = stateOf(service)
			walk(service, name, function(inst, key)
				out.state[key] = stateOf(inst)
				return true
			end)
		end
	end
	return out
end

-- ------------------------------------------------------------------ the diff against the baseline
local function diff(baseline)
	local known = baselineSet(baseline)
	local live = liveMap()
	local extra, missing, propDiffs = {}, {}, {}
	for key in pairs(live) do
		if string.find(key, "/", 1, true) and not known[key] then
			table.insert(extra, key)
		end
	end
	for _, keys in pairs(baseline.inventory) do
		for _, key in ipairs(keys) do
			if not live[key] then
				table.insert(missing, key)
			end
		end
	end
	for key, was in pairs(baseline.state) do
		local inst = live[key]
		if inst then
			for _, d in ipairs(stateDiffs(key, inst, was)) do
				table.insert(propDiffs, d)
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

	-- A part directly in Workspace that a run deleted: make it again from its recorded class and name, then the properties go back below.
	local rebuilt = {}
	local live = liveMap()
	for _, key in ipairs(sortedKeys(baseline.state)) do
		local was = baseline.state[key]
		if not live[key] and string.match(key, "^Workspace/[^/]+$") and type(was.class) == "string" then
			local ok, made = pcall(function()
				return Instance.new(was.class)
			end)
			if ok and isBasePart(made) then
				made.Name = was.name
				made.Parent = workspace
				table.insert(rebuilt, key)
			end
		end
	end
	if #rebuilt > 0 then
		live = liveMap()
	end

	-- Every recorded property and attribute of every kept instance (the services included).
	local restored, failed = {}, {}
	for _, key in ipairs(sortedKeys(baseline.state)) do
		local inst = live[key]
		if inst then
			restoreState(key, inst, baseline.state[key], restored, failed)
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
	table.sort(failed)
	return { removedInstances = removedTotal, removedByService = removed, restored = restored, rebuilt = rebuilt, restoreFailed = failed, terrainCleared = terrainCleared }
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

local function newBox()
	return { n = 0, lo = { math.huge, math.huge, math.huge }, hi = { -math.huge, -math.huge, -math.huge } }
end
local function grow(box, a, b, c, x, y, z)
	box.n += 1
	box.lo = { math.min(box.lo[1], a), math.min(box.lo[2], b), math.min(box.lo[3], c) }
	box.hi = { math.max(box.hi[1], x), math.max(box.hi[2], y), math.max(box.hi[3], z) }
end
local function boxBounds(box)
	if box.n == 0 then
		return nil
	end
	return { min = box.lo, max = box.hi }
end

local function guiObjectCount(gui)
	local n = 0
	for _, d in ipairs(gui:GetDescendants()) do
		if d:IsA("GuiObject") then
			n += 1
		end
	end
	return n
end

local function measure(baseline)
	local known = baselineSet(baseline)
	local addedByService, addedTotal, addedParts, addedScripts = {}, 0, 0, 0
	-- Three boxes: every part, the visible ones, and the visible ones that are not ground-sized. The camera frames the
	-- smallest that is not empty, so an invisible trigger or a 2048-stud slab does not shrink the piece to a speck.
	local allBox, visibleBox, framedBox = newBox(), newBox(), newBox()
	local hiddenParts, hugeParts = 0, 0
	local screenGuis = {}
	local addedSpawns = {}

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
					grow(allBox, a, b, c, x, y, z)
					local okT, transparency = pcall(function()
						return d.Transparency
					end)
					local hidden = okT and type(transparency) == "number" and transparency >= HIDDEN_TRANSPARENCY
					local size = d.Size
					local huge = math.max(size.X, size.Y, size.Z) > HUGE_STUDS
					if hidden then
						hiddenParts += 1
					else
						grow(visibleBox, a, b, c, x, y, z)
						if huge then
							hugeParts += 1
						else
							grow(framedBox, a, b, c, x, y, z)
						end
					end
					if d:IsA("SpawnLocation") then
						local okE, enabled = pcall(function()
							return d.Enabled
						end)
						if not okE or enabled ~= false then
							local p = d.Position
							table.insert(addedSpawns, { name = d.Name, position = { p.X, p.Y, p.Z }, size = { size.X, size.Y, size.Z } })
						end
					end
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

	-- What the terrain is doing: edited when its cell count moved off the baseline's, with the box it fills when the engine says.
	local cells = terrainCells()
	local baseCells = baseline.terrainCells
	local extents = terrainExtents()
	local edited = false
	if cells ~= nil and baseCells ~= nil then
		edited = cells ~= baseCells
	elseif extents ~= nil and (baseCells == nil or baseCells == 0) then
		edited = true
	end
	local terrain = { cells = cells, baselineCells = baseCells, edited = edited, extents = edited and extents or nil }

	-- The box to frame: the parts by the rule above, joined with the terrain the run edited.
	local basis = "framed"
	local partBox = framedBox
	if partBox.n == 0 then
		basis = "huge"
		partBox = visibleBox
	end
	if partBox.n == 0 then
		basis = "hidden"
		partBox = allBox
	end
	local bounds = boxBounds(partBox)
	local partBounds = bounds
	if terrain.extents then
		if bounds then
			local lo, hi = {}, {}
			for i = 1, 3 do
				lo[i] = math.min(bounds.min[i], terrain.extents.min[i])
				hi[i] = math.max(bounds.max[i], terrain.extents.max[i])
			end
			bounds = { min = lo, max = hi }
		else
			bounds = { min = terrain.extents.min, max = terrain.extents.max }
		end
	end
	local framing = { basis = addedParts > 0 and basis or nil, hiddenParts = hiddenParts, hugeParts = hugeParts, includesTerrain = terrain.extents ~= nil }

	-- Where the player spawns: a SpawnLocation the run added and left enabled, else the pristine enabled one, else the
	-- origin (with no enabled SpawnLocation Roblox puts the player there). The source says which.
	table.sort(addedSpawns, function(a, b)
		return a.name < b.name
	end)
	local spawn = { position = { 0, 0, 0 }, size = { 6, 1, 6 }, source = "default" }
	if addedSpawns[1] then
		spawn = { position = addedSpawns[1].position, size = addedSpawns[1].size, source = "added" }
	else
		for _, child in ipairs(workspace:GetChildren()) do
			if child:IsA("SpawnLocation") then
				local okE, enabled = pcall(function()
					return child.Enabled
				end)
				if not okE or enabled ~= false then
					local p = child.Position
					spawn = { position = { p.X, p.Y, p.Z }, size = { child.Size.X, child.Size.Y, child.Size.Z }, source = "pristine" }
					break
				end
			end
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
		partBounds = partBounds,
		framing = framing,
		terrain = terrain,
		screenGuis = screenGuis,
		spawn = spawn,
		viewport = viewport,
		terrainCells = cells,
	}
end

-- ------------------------------------------------------------------ the capture of a UI that is switched off
local function uiEnable(baseline)
	local known = baselineSet(baseline)
	local enabled = {}
	local gui = getService("StarterGui")
	if gui then
		walk(gui, "StarterGui", function(inst, key)
			if known[key] then
				return true
			end
			if inst:IsA("ScreenGui") and inst.Enabled == false and guiObjectCount(inst) > 0 then
				inst:SetAttribute(WAS_DISABLED_ATTRIBUTE, true)
				inst.Enabled = true
				table.insert(enabled, inst.Name)
			end
			return false
		end)
	end
	return { enabled = enabled }
end

local function uiRestore()
	local restored = {}
	local gui = getService("StarterGui")
	if gui then
		for _, d in ipairs(gui:GetDescendants()) do
			if d:IsA("ScreenGui") and d:GetAttribute(WAS_DISABLED_ATTRIBUTE) == true then
				d.Enabled = false
				d:SetAttribute(WAS_DISABLED_ATTRIBUTE, nil)
				table.insert(restored, d.Name)
			end
		end
	end
	return { restored = restored }
end

-- ------------------------------------------------------------------ run
local baseline = nil
if MODE ~= "capture" and MODE ~= "ui-restore" then
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
elseif MODE == "ui-enable" then
	result = uiEnable(baseline)
elseif MODE == "ui-restore" then
	result = uiRestore()
else
	error("unknown MODE " .. tostring(MODE))
end

return HttpService:JSONEncode(result)
