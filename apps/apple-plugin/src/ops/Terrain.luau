--!nocheck
-- Apple Studio op family: MORE TERRAIN (tool expansion Phase A).
--
--   terrain_shape  (write)  fill_cylinder, fill_wedge, clear_region, smooth, heightmap, appearance
--   terrain_read   (read)   what a region holds: material histogram and occupancy, never raw voxels
--
-- A separate operation from terrain_edit on purpose: a plugin reports operations, not actions, so
-- adding actions to terrain_edit would offer them to every older plugin that refuses them. The same
-- 65,536-voxel ceiling and 4-stud grid as terrain_edit apply to every action, and every write is one
-- undo-recorded change (Commands' MUTATING path).

local Terrain = {}
Terrain.name = "terrain"

function Terrain.build(api)
	local RES = api.limits.terrainResolution
	local MAX_VOXELS = api.limits.terrainVoxels

	local function vector(raw, label)
		local ok, err = api.arrayShape(raw, 3, label)
		if not ok then return nil, err end
		for i = 1, 3 do if math.abs(raw[i]) > api.limits.translation then return nil, label .. " exceeds the world-coordinate limit" end end
		return Vector3.new(raw[1], raw[2], raw[3])
	end

	local function material(value, label)
		local text, err = api.safeText(value, 100, label)
		if not text then return nil, err end
		if string.match(text, "^Enum%.Material%.[A-Za-z][A-Za-z0-9_]*$") == nil then return nil, label .. " must be an Enum.Material value" end
		return api.enumValue(text)
	end

	local function terrainOf(self)
		local world = api.serviceFrom(self.game, self.options.services, "Workspace")
		if not world then return nil, "Workspace is unavailable" end
		local ok, terrain = pcall(function() return world:FindFirstChild("Terrain") end)
		if not ok or not terrain or api.classNameOf(terrain) ~= "Terrain" then return nil, "Workspace Terrain is unavailable" end
		return terrain
	end

	local function budget(sizeX, sizeY, sizeZ)
		local cells = math.max(1, math.ceil(sizeX / RES)) * math.max(1, math.ceil(sizeY / RES)) * math.max(1, math.ceil(sizeZ / RES))
		if cells > MAX_VOXELS then return nil, ("terrain edit spans %d voxels; limit is %d"):format(cells, MAX_VOXELS) end
		return cells
	end

	-- A grid-aligned region and its cell counts, so voxel arrays can be sized without trusting the
	-- engine to report them back.
	local function gridRegion(minimum, maximum)
		local lo, loErr = vector(minimum, "min")
		if not lo then return nil, loErr end
		local hi, hiErr = vector(maximum, "max")
		if not hi then return nil, hiErr end
		if hi.X <= lo.X or hi.Y <= lo.Y or hi.Z <= lo.Z then return nil, "max must be greater than min on every axis" end
		local alo = Vector3.new(math.floor(lo.X / RES) * RES, math.floor(lo.Y / RES) * RES, math.floor(lo.Z / RES) * RES)
		local ahi = Vector3.new(math.ceil(hi.X / RES) * RES, math.ceil(hi.Y / RES) * RES, math.ceil(hi.Z / RES) * RES)
		local nx, ny, nz = (ahi.X - alo.X) / RES, (ahi.Y - alo.Y) / RES, (ahi.Z - alo.Z) / RES
		if nx * ny * nz > MAX_VOXELS then return nil, ("region spans %d voxels; limit is %d"):format(nx * ny * nz, MAX_VOXELS) end
		local ok, region = pcall(function() return Region3.new(alo, ahi) end)
		if not ok then return nil, "region could not be constructed" end
		return { region = region, lo = alo, hi = ahi, nx = nx, ny = ny, nz = nz }
	end

	local function readVoxels(terrain, grid)
		local ok, materials, occupancy = pcall(function() return terrain:ReadVoxels(grid.region, RES) end)
		if not ok or type(materials) ~= "table" or type(occupancy) ~= "table" then return nil, nil, "Studio refused terrain ReadVoxels: " .. tostring(materials) end
		return materials, occupancy
	end

	local function colour(raw, label)
		local ok, err = api.arrayShape(raw, 3, label)
		if not ok then return nil, err end
		for i = 1, 3 do if raw[i] < 0 or raw[i] > 1 then return nil, label .. " channels must be 0..1" end end
		return Color3.new(raw[1], raw[2], raw[3])
	end

	-- Fractal value noise from math.noise (Perlin). Deterministic for a seed: the seed only moves
	-- the sample plane, so the same seed always reads the same heights.
	local function fbm(x, z, seed, octaves)
		local total, amplitude, frequency, norm = 0, 1, 1, 0
		for _ = 1, octaves do
			total += math.noise(x * frequency, z * frequency, seed * 0.618 + 0.5) * amplitude
			norm += amplitude
			amplitude *= 0.5
			frequency *= 2
		end
		return total / norm
	end

	local function handleShape(self, op)
		local terrain, terrainErr = terrainOf(self)
		if not terrain then return nil, "refused", terrainErr end
		local action = op.action
		if action == "fill_cylinder" then
			local center, cErr = vector(op.center, "center")
			if not center then return nil, "invalid", cErr end
			if not api.finite(op.height) or op.height <= 0 or op.height > 1024 then return nil, "invalid", "height must be > 0 and <= 1024" end
			if not api.finite(op.radius) or op.radius <= 0 or op.radius > 512 then return nil, "invalid", "radius must be > 0 and <= 512" end
			local cells, bErr = budget(op.radius * 2, op.height, op.radius * 2)
			if not cells then return nil, "invalid", bErr end
			local m, mErr = material(op.material, "material")
			if not m then return nil, "invalid", mErr end
			local ok, err = pcall(function() terrain:FillCylinder(CFrame.new(center), op.height, op.radius, m) end)
			if not ok then return nil, "internal", "Studio refused terrain FillCylinder: " .. tostring(err) end
			return { action = action, voxelsBound = cells }
		elseif action == "fill_wedge" then
			local center, cErr = vector(op.center, "center")
			if not center then return nil, "invalid", cErr end
			local size, sErr = vector(op.size, "size")
			if not size then return nil, "invalid", sErr end
			if size.X <= 0 or size.Y <= 0 or size.Z <= 0 then return nil, "invalid", "size must be positive on every axis" end
			local cells, bErr = budget(size.X, size.Y, size.Z)
			if not cells then return nil, "invalid", bErr end
			local m, mErr = material(op.material, "material")
			if not m then return nil, "invalid", mErr end
			local yaw = if api.finite(op.rotationY) then math.rad(op.rotationY) else 0
			local ok, err = pcall(function() terrain:FillWedge(CFrame.new(center) * CFrame.Angles(0, yaw, 0), size, m) end)
			if not ok then return nil, "internal", "Studio refused terrain FillWedge: " .. tostring(err) end
			return { action = action, voxelsBound = cells }
		elseif action == "clear_region" then
			local grid, gErr = gridRegion(op.min, op.max)
			if not grid then return nil, "invalid", gErr end
			local air = api.enumValue("Enum.Material.Air")
			local ok, err = pcall(function() terrain:FillRegion(grid.region, RES, air) end)
			if not ok then return nil, "internal", "Studio refused terrain FillRegion: " .. tostring(err) end
			return { action = action, voxelsCleared = grid.nx * grid.ny * grid.nz }
		elseif action == "smooth" then
			local grid, gErr = gridRegion(op.min, op.max)
			if not grid then return nil, "invalid", gErr end
			local strength = if op.strength == nil then 0.5 elseif api.finite(op.strength) and op.strength > 0 and op.strength <= 1 then op.strength else nil
			if not strength then return nil, "invalid", "strength must be > 0 and <= 1" end
			local materials, occupancy, readErr = readVoxels(terrain, grid)
			if not materials then return nil, "internal", readErr end
			local air = api.enumValue("Enum.Material.Air")
			local outMaterials, outOccupancy, changed = {}, {}, 0
			for x = 1, grid.nx do
				outMaterials[x], outOccupancy[x] = {}, {}
				for y = 1, grid.ny do
					outMaterials[x][y], outOccupancy[x][y] = {}, {}
					for z = 1, grid.nz do
						local sum, n, neighbour = 0, 0, nil
						for dx = -1, 1 do for dy = -1, 1 do for dz = -1, 1 do
							local column = occupancy[x + dx]
							local row = column and column[y + dy]
							local value = row and row[z + dz]
							if value ~= nil then
								sum += value; n += 1
								if value > 0 and neighbour == nil then neighbour = materials[x + dx][y + dy][z + dz] end
							end
						end end end
						local own = occupancy[x][y][z]
						local blended = own + (sum / n - own) * strength
						local m = materials[x][y][z]
						if own <= 0 and blended > 0 then m = neighbour or air end
						if blended <= 0.001 then blended = 0; m = air end
						if math.abs(blended - own) > 0.001 then changed += 1 end
						outMaterials[x][y][z], outOccupancy[x][y][z] = m, blended
					end
				end
			end
			local ok, err = pcall(function() terrain:WriteVoxels(grid.region, RES, outMaterials, outOccupancy) end)
			if not ok then return nil, "internal", "Studio refused terrain WriteVoxels: " .. tostring(err) end
			return { action = action, voxels = grid.nx * grid.ny * grid.nz, changed = changed }
		elseif action == "heightmap" then
			local grid, gErr = gridRegion(op.min, op.max)
			if not grid then return nil, "invalid", gErr end
			local top, tErr = material(op.material or "Enum.Material.Grass", "material")
			if not top then return nil, "invalid", tErr end
			local below = top
			if op.subMaterial ~= nil then
				local sub, sErr = material(op.subMaterial, "subMaterial")
				if not sub then return nil, "invalid", sErr end
				below = sub
			end
			local octaves, oErr = api.safeCount(op.octaves, 3, 1, 6, "octaves")
			if not octaves then return nil, "invalid", oErr end
			local seed = if op.seed == nil then 1 elseif api.integer(op.seed) then op.seed else nil
			if seed == nil then return nil, "invalid", "seed must be an integer" end
			local amplitude = if op.amplitude == nil then 1 elseif api.finite(op.amplitude) and op.amplitude >= 0 and op.amplitude <= 1 then op.amplitude else nil
			if amplitude == nil then return nil, "invalid", "amplitude must be 0..1 (a fraction of the region height)" end
			local scale = if op.scale == nil then 64 elseif api.finite(op.scale) and op.scale >= 8 and op.scale <= 2048 then op.scale else nil
			if scale == nil then return nil, "invalid", "scale must be 8-2048 studs (the width of one hill)" end
			local air = api.enumValue("Enum.Material.Air")
			local height = grid.hi.Y - grid.lo.Y
			local materials, occupancy = {}, {}
			local solid, highest, lowest = 0, -math.huge, math.huge
			for x = 1, grid.nx do
				materials[x], occupancy[x] = {}, {}
				for y = 1, grid.ny do materials[x][y], occupancy[x][y] = {}, {} end
				for z = 1, grid.nz do
					local wx = grid.lo.X + (x - 0.5) * RES
					local wz = grid.lo.Z + (z - 0.5) * RES
					local n = fbm(wx / scale, wz / scale, seed, octaves)
					local surface = grid.lo.Y + height * math.clamp(0.5 + n * amplitude, 0, 1)
					highest, lowest = math.max(highest, surface), math.min(lowest, surface)
					for y = 1, grid.ny do
						local cellBottom = grid.lo.Y + (y - 1) * RES
						local fill = math.clamp((surface - cellBottom) / RES, 0, 1)
						occupancy[x][y][z] = fill
						if fill <= 0 then
							materials[x][y][z] = air
						else
							solid += 1
							materials[x][y][z] = if surface - cellBottom <= RES * 2 then top else below
						end
					end
				end
			end
			local ok, err = pcall(function() terrain:WriteVoxels(grid.region, RES, materials, occupancy) end)
			if not ok then return nil, "internal", "Studio refused terrain WriteVoxels: " .. tostring(err) end
			return {
				action = action, voxels = grid.nx * grid.ny * grid.nz, solidVoxels = solid, seed = seed,
				surfaceMinY = math.floor(lowest * 10) / 10, surfaceMaxY = math.floor(highest * 10) / 10,
			}
		elseif action == "appearance" then
			local set = {}
			if op.water ~= nil then
				local w = op.water
				if type(w) ~= "table" then return nil, "invalid", "water must be an object" end
				local writes = {}
				if w.color ~= nil then
					local c, err = colour(w.color, "water.color")
					if not c then return nil, "invalid", err end
					writes.WaterColor = c
				end
				for field, property in { transparency = "WaterTransparency", reflectance = "WaterReflectance" } do
					if w[field] ~= nil then
						if not api.finite(w[field]) or w[field] < 0 or w[field] > 1 then return nil, "invalid", "water." .. field .. " must be 0..1" end
						writes[property] = w[field]
					end
				end
				for field, property in { waveSize = "WaterWaveSize", waveSpeed = "WaterWaveSpeed" } do
					if w[field] ~= nil then
						if not api.finite(w[field]) or w[field] < 0 or w[field] > 100 then return nil, "invalid", "water." .. field .. " must be 0..100" end
						writes[property] = w[field]
					end
				end
				for property, value in writes do
					local ok, err = pcall(function() terrain[property] = value end)
					if not ok then return nil, "internal", ("could not set Terrain.%s: %s"):format(property, tostring(err)) end
					table.insert(set, property)
				end
			end
			if op.decoration ~= nil then
				if type(op.decoration) ~= "boolean" then return nil, "invalid", "decoration must be true or false" end
				local ok, err = pcall(function() terrain.Decoration = op.decoration end)
				if not ok then return nil, "internal", "could not set Terrain.Decoration: " .. tostring(err) end
				table.insert(set, "Decoration")
			end
			if op.materialColors ~= nil then
				if type(op.materialColors) ~= "table" then return nil, "invalid", "materialColors must map material names to [r,g,b]" end
				local count = 0
				for name, raw in op.materialColors do
					count += 1
					if count > 16 then return nil, "invalid", "materialColors may name at most 16 materials" end
					if type(name) ~= "string" or string.match(name, "^[A-Za-z]+$") == nil then return nil, "invalid", "materialColors keys are material names such as Grass" end
					local m, mErr = material("Enum.Material." .. name, "materialColors." .. name)
					if not m then return nil, "invalid", mErr end
					local c, cErr = colour(raw, "materialColors." .. name)
					if not c then return nil, "invalid", cErr end
					local ok, err = pcall(function() terrain:SetMaterialColor(m, c) end)
					if not ok then return nil, "internal", "Studio refused SetMaterialColor: " .. tostring(err) end
					table.insert(set, "MaterialColor:" .. name)
				end
			end
			if #set == 0 then return nil, "invalid", "appearance needs water, decoration or materialColors" end
			return { action = action, set = set }
		end
		return nil, "invalid", "terrain_shape.action must be fill_cylinder, fill_wedge, clear_region, smooth, heightmap or appearance"
	end

	local function handleRead(self, op)
		local terrain, terrainErr = terrainOf(self)
		if not terrain then return nil, "refused", terrainErr end
		local grid, gErr = gridRegion(op.min, op.max)
		if not grid then return nil, "invalid", gErr end
		local materials, occupancy, readErr = readVoxels(terrain, grid)
		if not materials then return nil, "internal", readErr end
		local byMaterial, solid, total, occupied = {}, 0, 0, 0
		for x = 1, grid.nx do
			for y = 1, grid.ny do
				for z = 1, grid.nz do
					local fill = occupancy[x] and occupancy[x][y] and occupancy[x][y][z]
					if type(fill) == "number" then
						total += 1
						if fill > 0 then
							solid += 1
							occupied += fill
							local key = tostring(materials[x][y][z])
							byMaterial[key] = (byMaterial[key] or 0) + 1
						end
					end
				end
			end
		end
		local list = {}
		for key, cells in byMaterial do table.insert(list, { material = key, voxels = cells }) end
		table.sort(list, function(a, b) return a.voxels > b.voxels end)
		while #list > 12 do table.remove(list) end
		return {
			min = { grid.lo.X, grid.lo.Y, grid.lo.Z }, max = { grid.hi.X, grid.hi.Y, grid.hi.Z },
			voxels = total, solidVoxels = solid, empty = solid == 0,
			averageOccupancy = if solid > 0 then math.floor(occupied / solid * 100) / 100 else 0,
			materials = list,
		}
	end

	return {
		handlers = {
			terrain_shape = handleShape,
			terrain_read = handleRead,
		},
		mutating = { terrain_shape = true },
	}
end

return Terrain
