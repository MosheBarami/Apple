--!strict
--[[
	Surfaces, after RESURFACE by cxmeel — github.com/cxmeel/resurface-plugin (Resurface License; credit and the
	list of changes are in apps/studpilot-plugin/THIRD_PARTY_NOTICES.md). Resurface brings back classic Roblox surfaces by
	making each one a MaterialVariant on Plastic (a stud colour map and normal map, one stud per tile) and giving a part
	that variant, so studs cover every face of a brick, a ball, a wedge, a mesh or a union alike.

	THE STUDPILOT RULE (owner, 2026-10-01): every part StudPilot makes is studded unless the user asked for another surface.
	So besides the two ops below, `watch` is called by Commands around every StudPilot write: the parts that write adds to
	the place get studs before the write's undo recording closes (one Ctrl+Z takes back both).

	apply_surface { paths = { string }, surface = "studs"|"inlet"|"universal"|"weld"|"glue"|"smooth"|"smooth_no_outlines",
	                maps? = { colorMap, normalMap, studsPerTile } }  -- maps for every surface but the two smooth ones
	  Gives every BasePart at or under each path that surface on all faces (meshes and unions included).
	set_surface_default { surface = "studs"|"keep", maps? = { colorMap, normalMap, studsPerTile } }
	  "keep" stops studding new parts for this Studio connection (the user asked for their own textures); "studs" is
	  the default and turns it back on.
]]
local Surface = {}

export type Variant = { name: string, colorMap: string, normalMap: string, studsPerTile: number }

-- The kinds Resurface offers. Their maps (Resurface's public images, src/Assets/MaterialVariants.luau) are not written
-- here: the shipped plugin holds no asset id (tests/worker-capability-contract.test.mjs); the worker sends them in the op
-- (apps/worker/src/surfaces.ts) and each is checked to be an image id before it is used.
Surface.KINDS = { studs = "Studs", inlet = "Inlet", universal = "Universal", weld = "Weld", glue = "Glue" }

--[[ Pure: the maps an op carries, if they are image ids and nothing else. ]]
function Surface.readMaps(maps: any): Variant?
	if type(maps) ~= "table" then return nil end
	local function id(v: any): string?
		if type(v) ~= "string" then return nil end
		local scheme, digits = string.match(v, "^(%a+)://(%d+)$")
		if scheme ~= "rbxassetid" or not digits or #digits > 20 then return nil end
		return v
	end
	local colorMap, normalMap = id(maps.colorMap), id(maps.normalMap)
	local spt = maps.studsPerTile
	if not colorMap or not normalMap or type(spt) ~= "number" or spt <= 0 or spt > 64 then return nil end
	return { name = "", colorMap = colorMap, normalMap = normalMap, studsPerTile = spt }
end

local SMOOTH = { smooth = true, smooth_no_outlines = true }
-- Materials that are an effect, not a surface: glowing, see-through and shield parts stay as they are.
local EFFECT_MATERIALS = { Neon = true, Glass = true, ForceField = true }

--[[ Pure: whether the automatic rule studs this part. A part someone already gave a variant, an invisible helper, an
	effect material, a mesh dressed by a SurfaceAppearance, and anything in Terrain keep what they have. ]]
function Surface.wantsStuds(part: { Transparency: number, Material: string, MaterialVariant: string, hasAppearance: boolean, isTerrain: boolean }): boolean
	if part.isTerrain or part.hasAppearance then return false end
	if part.Transparency >= 1 then return false end
	if EFFECT_MATERIALS[part.Material] then return false end
	if part.MaterialVariant ~= "" then return false end
	return true
end

--[[ Pure: a name not already taken (Resurface's createUniqueKey, for one name). ]]
function Surface.uniqueName(base: string, taken: { [string]: boolean }): string
	if not taken[base] then return base end
	local n = 2
	while taken[base .. "_" .. n] do n += 1 end
	return base .. "_" .. n
end

function Surface.build(api)
	local MaterialService = game:GetService("MaterialService")
	local defaultSurface = "studs"
	local studMaps: Variant? = nil -- given by the worker (set_surface_default / apply_surface); nothing is studded before

	-- The MaterialVariant for a surface: one already in the place with the same maps (made by Resurface or by an
	-- earlier StudPilot run) is reused, so a place never collects copies.
	local function variantFor(kind: string, v: Variant?): MaterialVariant?
		if not v or not Surface.KINDS[kind] then return nil end
		local taken = {}
		for _, object in MaterialService:GetDescendants() do
			if object:IsA("MaterialVariant") then
				taken[object.Name] = true
				if object.ColorMap == v.colorMap and object.NormalMap == v.normalMap and object.StudsPerTile == v.studsPerTile then return object end
			end
		end
		local made = Instance.new("MaterialVariant")
		made.Name = Surface.uniqueName(Surface.KINDS[kind], taken)
		made.BaseMaterial = Enum.Material.Plastic
		made.ColorMap = v.colorMap
		made.NormalMap = v.normalMap
		made.StudsPerTile = v.studsPerTile
		made.Parent = MaterialService
		return made
	end

	local SURFACE_PROPS = { "TopSurface", "BottomSurface", "LeftSurface", "RightSurface", "FrontSurface", "BackSurface" }
	local function give(part: BasePart, kind: string, variant: MaterialVariant?)
		if SMOOTH[kind] then
			part.Material = if kind == "smooth_no_outlines" then Enum.Material.SmoothPlastic else Enum.Material.Plastic
			part.MaterialVariant = ""
			local surface = if kind == "smooth_no_outlines" then Enum.SurfaceType.SmoothNoOutlines else Enum.SurfaceType.Smooth
			for _, prop in SURFACE_PROPS do (part :: any)[prop] = surface end
			return
		end
		if not variant then return end
		part.Material = variant.BaseMaterial
		part.MaterialVariant = variant.Name
		for _, prop in SURFACE_PROPS do (part :: any)[prop] = Enum.SurfaceType.Smooth end
	end

	local function describe(part: BasePart)
		return {
			Transparency = part.Transparency, Material = part.Material.Name, MaterialVariant = part.MaterialVariant,
			hasAppearance = part:FindFirstChildWhichIsA("SurfaceAppearance") ~= nil, isTerrain = part:IsA("Terrain"),
		}
	end

	local function partsUnder(roots: { Instance }): { BasePart }
		local seen, out = {}, {}
		local function add(p: Instance)
			if p:IsA("BasePart") and not seen[p] then seen[p] = true; table.insert(out, p :: BasePart) end
		end
		for _, root in roots do
			if root == workspace or root:IsA("Terrain") then continue end
			add(root)
			for _, d in root:GetDescendants() do add(d) end
		end
		return out
	end

	local function handleApply(self: any, op: any): (any?, string?, string?)
		local kind = op.surface
		if type(kind) ~= "string" or not (Surface.KINDS[kind] or SMOOTH[kind]) then
			return nil, "invalid", "surface must be studs, inlet, universal, weld, glue, smooth or smooth_no_outlines"
		end
		if type(op.paths) ~= "table" or #op.paths == 0 or #op.paths > 50 then return nil, "invalid", "paths must list 1 to 50 places" end
		local roots = {}
		for _, path in op.paths do
			local target = api.resolvePath(self.game, self.options.services, path, false, self)
			if not target then return nil, "not_found", "nothing at " .. tostring(path) end
			if not api.writableTarget(self.game, target) then return nil, "refused", "that place is not one StudPilot edits" end
			table.insert(roots, target)
		end
		local parts = partsUnder(roots)
		if #parts > 20000 then return nil, "invalid", "more than 20000 parts; give a smaller place" end
		local maps = if SMOOTH[kind] then nil else Surface.readMaps(op.maps)
		if not SMOOTH[kind] and not maps then return nil, "invalid", "maps must be { colorMap, normalMap } image ids and studsPerTile" end
		if kind == "studs" then studMaps = maps end
		local variant = if SMOOTH[kind] then nil else variantFor(kind, maps)
		for _, p in parts do give(p, kind, variant) end
		return { surface = kind, parts = #parts, variant = variant and variant.Name or nil }
	end

	local function handleDefault(_self: any, op: any): (any?, string?, string?)
		if op.surface ~= "studs" and op.surface ~= "keep" then return nil, "invalid", "surface must be studs or keep" end
		if op.surface == "studs" then
			local maps = Surface.readMaps(op.maps)
			if not maps then return nil, "invalid", "maps must be { colorMap, normalMap } image ids and studsPerTile" end
			studMaps = maps
		end
		defaultSurface = op.surface
		return { surface = defaultSurface }
	end

	-- Around every StudPilot write (Commands.execute): remember the parts the write adds; when it succeeds, stud them.
	local function watch(_self: any, opName: string): (() -> any)?
		if defaultSurface ~= "studs" or not studMaps or opName == "apply_surface" or opName == "restore" then return nil end
		local added: { BasePart } = {}
		local conn = game.DescendantAdded:Connect(function(d)
			if d:IsA("BasePart") then table.insert(added, d) end
		end)
		return function()
			conn:Disconnect()
			if #added == 0 then return 0 end
			local variant = variantFor("studs", studMaps)
			local n = 0
			for _, p in added do
				if p.Parent and not p:IsDescendantOf(MaterialService) and Surface.wantsStuds(describe(p)) then
					give(p, "studs", variant)
					n += 1
				end
			end
			return n
		end
	end

	return {
		handlers = { apply_surface = handleApply, set_surface_default = handleDefault },
		mutating = { apply_surface = true },
		consentOnly = { set_surface_default = true },
		watch = watch,
	}
end

return Surface
