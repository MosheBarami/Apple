--!strict
-- The composer's two place-edit ops (apps/worker/src/compose.ts). A composed game is a NEW map filled with library
-- pieces, so props are placed as copies of imported pieces, and a UI kit's own scripts and sounds are taken out.
--
-- place_copies { items = { { from, parent, name, at = {x,y,z}, yaw, height?, length?, along? = "x"|"z" } } }
--   Copies the piece in `from` (an import folder's first Model/BasePart/Tool, or the instance itself) into `parent`
--   as `name`. The copy keeps its own world orientation and turns `yaw` degrees about the vertical; with `along` it
--   turns so its longer horizontal side runs along world X or Z. It is scaled uniformly so its world-aligned height
--   is `height`, or its longer horizontal side is `length`, and stands with the bottom of its world-aligned box
--   centred on `at`. Its scripts and sounds are not copied; its parts are anchored.
-- strip_descendants { root, classes = { "LocalScript" | "Script" | "ModuleScript" | "Sound" | "BillboardGui" | "ProximityPrompt" | "ClickDetector" } }
--   Removes every instance of those classes under `root`. The last three are a library piece's leftovers from its own
--   game (a price tag floating over a crown, a "Buy" prompt, a click that nothing answers once its script is out).
local Compose = {}

local STRIPPABLE = { LocalScript = true, Script = true, ModuleScript = true, Sound = true, BillboardGui = true, ProximityPrompt = true, ClickDetector = true }
local MAX_PLACE = 200

function Compose.build(api)
	local function piece(inst: any): any?
		if api.isA(inst, "Folder") then
			local kids = api.childrenOf(inst) or {}
			for _, want in { "Model", "BasePart", "Tool" } do
				for _, c in kids do if api.isA(c, want) then return c end end
			end
			return nil
		end
		return inst
	end

	-- The world-aligned box of every visible part.
	local function aabb(model: any): (Vector3?, Vector3?)
		local lo, hi = nil, nil
		for _, p in api.descendantsOf(model) or {} do
			if api.isA(p, "BasePart") and p.Transparency < 1 then
				local h = p.Size / 2
				for _, c in { Vector3.new(1, 1, 1), Vector3.new(1, 1, -1), Vector3.new(1, -1, 1), Vector3.new(1, -1, -1),
					Vector3.new(-1, 1, 1), Vector3.new(-1, 1, -1), Vector3.new(-1, -1, 1), Vector3.new(-1, -1, -1) } do
					local w = p.CFrame:PointToWorldSpace(h * c)
					lo = if lo then lo:Min(w) else w
					hi = if hi then hi:Max(w) else w
				end
			end
		end
		return lo, hi
	end

	-- Old-style meshes (a Part drawn by a FileMesh SpecialMesh) draw at the mesh's own size times its Scale, whatever the
	-- part's box says, so a piece measured by its parts was fitted wrong (test 4, 2026-10-02: a duck whose 12-stud box
	-- drew a 5-stud duck). Each becomes a MeshPart of the size it draws, so every box after this is what you see. One
	-- template per mesh per call; a mesh Roblox will not load stays as it was.
	local MAX_SOLIDIFY = 40
	local function solidify(self: any, root: any)
		local okService, assets = pcall(function() return self.game:GetService("AssetService") end)
		if not okService or not assets then return end
		local made: { [string]: any } = {}
		local count = 0
		for _, d in api.descendantsOf(root) or {} do
			if count >= MAX_SOLIDIFY then break end
			pcall(function()
				if not d:IsA("SpecialMesh") or d.MeshType ~= Enum.MeshType.FileMesh or d.MeshId == "" then return end
				local part = d.Parent
				if not part or not part:IsA("BasePart") or part:IsA("MeshPart") then return end
				count += 1
				local template = made[d.MeshId]
				if template == nil then
					local okMake, mp = pcall(function() return assets:CreateMeshPartAsync(d.MeshId) end)
					template = if okMake and typeof(mp) == "Instance" then mp else false
					made[d.MeshId] = template
				end
				if not template then return end
				local native = template.MeshSize
				local scale = d.Scale
				local size = Vector3.new(math.max(native.X * scale.X, 0.05), math.max(native.Y * scale.Y, 0.05), math.max(native.Z * scale.Z, 0.05))
				local mp = template:Clone()
				mp.Name = part.Name
				mp.TextureID = d.TextureId
				for _, key in { "Color", "Material", "Reflectance", "Transparency", "CastShadow", "Anchored", "CanCollide", "CanQuery", "CanTouch", "Massless" } do
					pcall(function() mp[key] = part[key] end)
				end
				mp.Size = size
				mp.CFrame = part.CFrame * CFrame.new(d.Offset)
				for _, c in part:GetChildren() do
					if c ~= d and not c:IsA("JointInstance") and not c:IsA("WeldConstraint") then c.Parent = mp end
				end
				mp.Parent = part.Parent
				part:Destroy()
			end)
		end
		for _, t in made do if t then pcall(function() t:Destroy() end) end end
	end

	local function placeOne(self: any, item: any): (string?, string?)
		if type(item) ~= "table" then return nil, "each item must be an object" end
		local name, nameErr = api.safeName(item.name, "name")
		if not name then return nil, nameErr end
		local at = item.at
		if type(at) ~= "table" or #at ~= 3 then return nil, "at must be [x, y, z]" end
		for i = 1, 3 do
			if not api.finite(at[i]) or math.abs(at[i]) > api.limits.translation then return nil, "at is outside the world" end
		end
		local yaw = if item.yaw == nil then 0 else item.yaw
		if not api.finite(yaw) then return nil, "yaw must be a number" end
		for _, key in { "height", "length" } do
			if item[key] ~= nil and (not api.finite(item[key]) or item[key] <= 0 or item[key] > 2000) then return nil, key .. " must be a positive size" end
		end
		if item.along ~= nil and item.along ~= "x" and item.along ~= "z" then return nil, "along must be x or z" end
		local source = api.resolvePath(self.game, self.options.services, item.from, false, self)
		if not source then return nil, "nothing at " .. tostring(item.from) end
		local original = piece(source)
		if not original then return nil, tostring(item.from) .. " holds nothing to place" end
		local parent, canonical, pErr = api.resolvePath(self.game, self.options.services, item.parent, true, self)
		if not parent then return nil, pErr or ("no parent " .. tostring(item.parent)) end
		local refused = api.destinationRefusal(self.game, parent, canonical, "Model")
		if refused then return nil, refused end
		local okFree, taken = pcall(function() return parent:FindFirstChild(name) end)
		if not okFree or taken then return nil, ("%s already has a %s"):format(canonical, name) end

		local copy, cloneErr = api.safeClone(original)
		if not copy then return nil, cloneErr end
		if not api.isA(copy, "Model") then
			local m = api.makeInstance(self.options, "Model")
			if not m then api.destroyInstance(copy); return nil, "could not make a Model" end
			if api.isA(copy, "Tool") then
				for _, c in api.childrenOf(copy) or {} do c.Parent = m end
				api.destroyInstance(copy)
			else
				copy.Parent = m
			end
			copy = m
		end
		for _, d in api.descendantsOf(copy) or {} do
			if api.isScript(d) or api.isA(d, "Sound") then api.destroyInstance(d)
			elseif api.isA(d, "BasePart") then pcall(function() d.Anchored = true end) end
		end
		solidify(self, copy)
		local ok, err = pcall(function()
			copy.Name = name
			copy.Parent = parent
			local lo, hi = aabb(copy)
			if not lo or not hi then error("it has nothing visible") end
			local center = (lo + hi) / 2
			local function turn(deg: number)
				if deg % 360 == 0 then return end
				copy:PivotTo(CFrame.new(center) * CFrame.Angles(0, math.rad(deg), 0) * CFrame.new(-center) * copy:GetPivot())
			end
			turn(yaw)
			if item.along then
				lo, hi = aabb(copy)
				local longX = (hi.X - lo.X) >= (hi.Z - lo.Z)
				if (item.along == "x") ~= longX then center = (lo + hi) / 2; turn(90) end
			end
			lo, hi = aabb(copy)
			local size = hi - lo
			local k = 1
			if item.height and size.Y > 0 then k = item.height / size.Y end
			if item.length then k = item.length / math.max(size.X, size.Z, 1e-3) end
			if math.abs(k - 1) > 1e-3 then copy:ScaleTo(copy:GetScale() * k) end
			lo, hi = aabb(copy)
			local bottom = Vector3.new((lo.X + hi.X) / 2, lo.Y, (lo.Z + hi.Z) / 2)
			copy:PivotTo(copy:GetPivot() + (Vector3.new(at[1], at[2], at[3]) - bottom))
		end)
		if not ok then api.destroyInstance(copy); return nil, tostring(err) end
		return api.fullPath(self.game, copy)
	end

	local function handlePlaceCopies(self: any, op: any): (any?, string?, string?)
		if type(op.items) ~= "table" or #op.items == 0 then return nil, "invalid", "items must be a non-empty list" end
		if #op.items > MAX_PLACE then return nil, "invalid", ("at most %d items per call"):format(MAX_PLACE) end
		local placed, failed = {}, {}
		for i, item in op.items do
			local path, err = placeOne(self, item)
			if path then table.insert(placed, path) else table.insert(failed, { index = i, error = err }) end
		end
		if #placed == 0 then return nil, "invalid", "nothing was placed: " .. tostring(failed[1] and failed[1].error) end
		return { placed = placed, failed = failed }
	end

	local function handleStrip(self: any, op: any): (any?, string?, string?)
		if type(op.classes) ~= "table" or #op.classes == 0 then return nil, "invalid", "classes must be a non-empty list" end
		local classes = {}
		for _, c in op.classes do
			if not STRIPPABLE[c] then return nil, "invalid", "classes may only be LocalScript, Script, ModuleScript, Sound, BillboardGui, ProximityPrompt or ClickDetector" end
			classes[c] = true
		end
		local root = api.resolvePath(self.game, self.options.services, op.root, false, self)
		if not root then return nil, "not_found", "nothing at " .. tostring(op.root) end
		if not api.writableTarget(self.game, root) then return nil, "refused", "that place is not one Apple edits" end
		local removed = 0
		for _, d in api.descendantsOf(root) or {} do
			if classes[api.classNameOf(d)] and api.destroyInstance(d) then removed += 1 end
		end
		return { removed = removed }
	end

	return {
		handlers = { place_copies = handlePlaceCopies, strip_descendants = handleStrip },
		mutating = { place_copies = true, strip_descendants = true },
	}
end

return Compose
