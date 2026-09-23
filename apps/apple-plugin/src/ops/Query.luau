--!nocheck
-- Apple Studio op family: FIND, CHANGE MANY, ASK THE WORLD, SCATTER (tool expansion Phase A).
--
--   query_instances  (read)   search by name/class/tag/attribute/property under the readable services
--   set_props_bulk   (write)  one typed change (set, adjust add/mul, attribute delete) over <= 500 targets
--   spatial_query    (read)   raycast, find_ground, bounds, overlap, check_placement, find_flat
--   scatter          (write)  seeded placement of <= 200 copies of a script-free template on the ground
--
-- Every write goes through Commands' MUTATING path (edit mode, edit consent, ONE undo recording that
-- is cancelled on any failure), and every property it touches is checked against the same
-- PROPERTY_ALLOW / CONTENT_PROPERTY tables as set_props. Nothing here evaluates received text.

local Query = {}
Query.name = "query"

Query.MAX_MATCHES = 200
Query.MAX_SCAN = 20000
Query.MAX_BULK_TARGETS = 500
Query.MAX_RAY = 5000
Query.MAX_SCATTER = 200
Query.MAX_SCATTER_NODES = 2000
Query.MAX_FLAT_SAMPLES = 256

function Query.build(api)
	local function vector(raw, label, limit)
		local ok, err = api.arrayShape(raw, 3, label)
		if not ok then return nil, err end
		for i = 1, 3 do
			if math.abs(raw[i]) > (limit or api.limits.translation) then return nil, label .. " exceeds the allowed range" end
		end
		return Vector3.new(raw[1], raw[2], raw[3])
	end

	local function pathOf(self, inst) return api.fullPath(self.game, inst) or "?" end

	-- A plain JSON scalar compared with what Studio holds. EnumItems compare by their text
	-- ("Enum.Material.Grass"), everything else by value; no instance or content is ever read.
	local function plainEquals(current, wanted)
		if type(wanted) == "number" or type(wanted) == "boolean" then return current == wanted end
		if type(wanted) == "string" then return tostring(current) == wanted or current == wanted end
		return false
	end

	local function compileQuery(q)
		if type(q) ~= "table" then return nil, "query must be an object" end
		local tests = {}
		if q.name ~= nil then
			local name, err = api.safeText(q.name, 96, "query.name")
			if not name or #name == 0 then return nil, err or "query.name must not be empty" end
			local lower = string.lower(name)
			if string.find(lower, "*", 1, true) then
				local pattern = "^" .. string.gsub(string.gsub(lower, "[%^%$%(%)%%%.%[%]%+%-%?]", "%%%0"), "%*", ".*") .. "$"
				table.insert(tests, function(inst) return string.match(string.lower(api.nameOf(inst)), pattern) ~= nil end)
			else
				table.insert(tests, function(inst) return string.find(string.lower(api.nameOf(inst)), lower, 1, true) ~= nil end)
			end
		end
		if q.className ~= nil then
			local className, err = api.safeText(q.className, 64, "query.className")
			if not className then return nil, err end
			table.insert(tests, function(inst) return api.classNameOf(inst) == className end)
		end
		if q.isA ~= nil then
			local className, err = api.safeText(q.isA, 64, "query.isA")
			if not className then return nil, err end
			table.insert(tests, function(inst) return api.isA(inst, className) end)
		end
		if q.tag ~= nil then
			local tag, err = api.safeText(q.tag, 64, "query.tag")
			if not tag or #tag == 0 then return nil, err or "query.tag must not be empty" end
			table.insert(tests, function(inst)
				local ok, has = pcall(function() return inst:HasTag(tag) end)
				return ok and has == true
			end)
		end
		if q.attribute ~= nil then
			if type(q.attribute) ~= "table" then return nil, "query.attribute must be {name, equals?}" end
			local name, err = api.safeName(q.attribute.name, "query.attribute.name")
			if not name then return nil, err end
			local wanted = q.attribute.equals
			table.insert(tests, function(inst)
				local ok, value = pcall(function() return inst:GetAttribute(name) end)
				if not ok or value == nil then return false end
				return wanted == nil or plainEquals(value, wanted)
			end)
		end
		if q.property ~= nil then
			local p = q.property
			if type(p) ~= "table" then return nil, "query.property must be {name, op, value}" end
			local name, err = api.safeText(p.name, 80, "query.property.name")
			if not name then return nil, err end
			if not api.readProperties[name] or api.contentProperty[name] then return nil, ("property %s is not in Apple's read allowlist"):format(name) end
			local cmp = p.op or "eq"
			if cmp ~= "eq" and cmp ~= "lt" and cmp ~= "gt" and cmp ~= "contains" then return nil, "query.property.op must be eq, lt, gt or contains" end
			if (cmp == "lt" or cmp == "gt") and not api.finite(p.value) then return nil, "query.property.value must be a number for lt/gt" end
			if cmp == "contains" and type(p.value) ~= "string" then return nil, "query.property.value must be a string for contains" end
			local wanted = p.value
			table.insert(tests, function(inst)
				local ok, value = pcall(function() return inst[name] end)
				if not ok or value == nil then return false end
				if cmp == "eq" then return plainEquals(value, wanted) end
				if cmp == "contains" then return string.find(string.lower(tostring(value)), string.lower(wanted), 1, true) ~= nil end
				if type(value) ~= "number" then return false end
				if cmp == "lt" then return value < wanted end
				return value > wanted
			end)
		end
		if #tests == 0 then return nil, "a query needs at least one of name, className, isA, tag, attribute or property" end
		return function(inst)
			for _, check in tests do if not check(inst) then return false end end
			return true
		end
	end

	local function queryRoots(self, root)
		if root == nil or root == "game" then
			local out = {}
			for serviceName in api.readServices do
				local service = api.serviceFrom(self.game, self.options.services, serviceName)
				if service then table.insert(out, service) end
			end
			table.sort(out, function(a, b) return api.nameOf(a) < api.nameOf(b) end)
			return out
		end
		local inst, _, err, kind = api.resolvePath(self.game, self.options.services, root, false)
		if not inst then return nil, err, kind end
		return { inst }
	end

	-- Walk breadth-first from the roots; stops at `limit` matches or MAX_SCAN visited nodes, and says
	-- which of the two happened so a partial answer is never read as a complete one.
	local function runQuery(self, q, limit)
		local matcher, err = compileQuery(q)
		if not matcher then return nil, "invalid", err end
		local roots, rootErr, rootKind = queryRoots(self, q.root)
		if not roots then return nil, rootKind or "not_found", rootErr end
		local queue, head, scanned, matches = {}, 1, 0, {}
		-- the roots themselves are not candidates: a query searches UNDER its root, as GetDescendants does
		for _, root in roots do
			local children = api.childrenOf(root)
			if children then for _, child in children do table.insert(queue, child) end end
		end
		local truncated = nil
		while head <= #queue do
			local node = queue[head]
			head += 1
			scanned += 1
			if scanned > Query.MAX_SCAN then truncated = "scan"; break end
			if matcher(node) then
				if #matches >= limit then truncated = "limit"; break end
				table.insert(matches, node)
			end
			local children = api.childrenOf(node)
			if children then for _, child in children do table.insert(queue, child) end end
		end
		return { matches = matches, scanned = scanned, truncated = truncated }
	end

	local function handleQuery(self, op)
		local limit, limitErr = api.safeCount(op.limit, 50, 1, Query.MAX_MATCHES, "query_instances.limit")
		if not limit then return nil, "invalid", limitErr end
		local result, kind, err = runQuery(self, op, limit)
		if not result then return nil, kind, err end
		local out = {}
		for _, inst in result.matches do
			table.insert(out, { path = pathOf(self, inst), className = api.classNameOf(inst) })
		end
		return { matches = out, count = #out, scanned = result.scanned, truncated = result.truncated }
	end

	--[[ set_props_bulk: the same typed change over many targets, as ONE undo step.
		Targets are either explicit paths or a query (the same one query_instances runs). Each target
		must be writable and not a service or engine-owned object. Values are validated ONCE before
		anything is touched, and the first failure returns an error, which cancels the recording and
		so undoes every target already changed. ]]
	local function bulkTargets(self, op)
		local targets = {}
		if op.targets ~= nil then
			if op.query ~= nil then return nil, "invalid", "give targets or query, not both" end
			if type(op.targets) ~= "table" or #op.targets == 0 or #op.targets > Query.MAX_BULK_TARGETS then
				return nil, "invalid", ("targets must contain 1-%d instance paths"):format(Query.MAX_BULK_TARGETS)
			end
			local seen = {}
			for index, raw in op.targets do
				if type(index) ~= "number" then return nil, "invalid", "targets must be a list" end
				local inst, canonical, err, kind, remedy = api.resolvePath(self.game, self.options.services, raw, true)
				if not inst then return nil, kind or "not_found", err, remedy end
				if not seen[inst] then seen[inst] = true; table.insert(targets, { inst = inst, path = canonical }) end
			end
		elseif op.query ~= nil then
			local result, kind, err = runQuery(self, op.query, Query.MAX_BULK_TARGETS)
			if not result then return nil, kind, err end
			if result.truncated then return nil, "invalid", ("the query matches more than %d instances or scans more than %d; narrow it"):format(Query.MAX_BULK_TARGETS, Query.MAX_SCAN) end
			for _, inst in result.matches do table.insert(targets, { inst = inst, path = pathOf(self, inst) }) end
		else
			return nil, "invalid", "set_props_bulk needs targets or query"
		end
		if #targets == 0 then return nil, "not_found", "no instance matched" end
		for _, target in targets do
			if not api.writableTarget(self.game, target.inst) then return nil, "refused", target.path .. " is outside Apple's place scope", "choose_allowed_target" end
			local refused = api.structuralRefusal(self.game, target.inst, target.path, "change")
			if refused then return nil, "refused", refused end
		end
		return targets
	end

	local function adjustments(raw)
		if raw == nil then return {} end
		if type(raw) ~= "table" or #raw > 16 then return nil, "adjust must be a list of at most 16 {property, op, value}" end
		local out = {}
		for index, entry in raw do
			if type(index) ~= "number" or type(entry) ~= "table" then return nil, "adjust must be a list of objects" end
			local name, err = api.safeText(entry.property, 80, "adjust.property")
			if not name then return nil, err end
			if not api.propertyAllow[name] or api.contentProperty[name] then return nil, ("property %s is not in Apple's write allowlist"):format(name) end
			if entry.op ~= "add" and entry.op ~= "mul" then return nil, "adjust.op must be add or mul" end
			local value = entry.value
			if api.finite(value) then
				-- a scalar
			elseif type(value) == "table" and #value == 3 and api.finite(value[1]) and api.finite(value[2]) and api.finite(value[3]) then
				value = { value[1], value[2], value[3] }
			else
				return nil, "adjust.value must be a number or [x, y, z]"
			end
			if entry.op == "mul" then
				local factors = if type(value) == "table" then value else { value }
				for _, f in factors do if f < 0 or f > 1000 then return nil, "adjust mul factors must be between 0 and 1000" end end
			end
			table.insert(out, { property = name, op = entry.op, value = value })
		end
		return out
	end

	local function adjusted(current, adjustment)
		local value, isAdd = adjustment.value, adjustment.op == "add"
		if type(current) == "number" then
			if type(value) == "table" then return nil, "a number property takes a scalar adjustment" end
			return if isAdd then current + value else current * value
		end
		local okVector = pcall(function() return current.X + current.Y + current.Z end)
		if okVector and typeof(current) == "Vector3" then
			local v = if type(value) == "table" then value else { value, value, value }
			if isAdd then return Vector3.new(current.X + v[1], current.Y + v[2], current.Z + v[3]) end
			return Vector3.new(current.X * v[1], current.Y * v[2], current.Z * v[3])
		end
		return nil, "only number and Vector3 properties can be adjusted"
	end

	local function handleBulk(self, op)
		local targets, kind, err, remedy = bulkTargets(self, op)
		if not targets then return nil, kind, err, remedy end
		local props, _, propErr = api.validateProps(op.props, "set_props_bulk.props", true, false, self.game, self.options.services)
		if propErr then return nil, "invalid", propErr end
		local attrs, attrErr = api.validateAttributes(op.attributes, "set_props_bulk.attributes")
		if attrErr then return nil, "invalid", attrErr end
		-- {t = "nil"} deletes an attribute; the decoded table cannot hold a nil, so it is listed apart.
		local removals = {}
		if type(op.attributes) == "table" then
			for name, typed in op.attributes do
				if type(typed) == "table" and typed.t == "nil" then table.insert(removals, name) end
			end
		end
		local adjust, adjustErr = adjustments(op.adjust)
		if not adjust then return nil, "invalid", adjustErr end
		if next(props) == nil and next(attrs) == nil and #removals == 0 and #adjust == 0 then
			return nil, "invalid", "set_props_bulk needs props, attributes or adjust"
		end
		local touched = {}
		for property in props do touched[property] = true end
		for _, a in adjust do touched[a.property] = true end
		local changes = {}
		for index, target in targets do
			local inst = target.inst
			local before = if index <= 20 then (api.captureProperties(self.game, inst, touched)) else nil
			for property, value in props do
				local ok, setErr = pcall(function() inst[property] = value end)
				if not ok then return nil, "invalid", ("%s: could not set %s: %s"):format(target.path, property, tostring(setErr)) end
			end
			for _, a in adjust do
				local okRead, current = pcall(function() return inst[a.property] end)
				if not okRead then return nil, "invalid", ("%s has no property %s"):format(target.path, a.property) end
				local nextValue, adjustFail = adjusted(current, a)
				if nextValue == nil then return nil, "invalid", ("%s.%s: %s"):format(target.path, a.property, adjustFail) end
				local ok, setErr = pcall(function() inst[a.property] = nextValue end)
				if not ok then return nil, "invalid", ("%s: could not set %s: %s"):format(target.path, a.property, tostring(setErr)) end
			end
			for name, value in attrs do
				local ok, setErr = pcall(function() inst:SetAttribute(name, value) end)
				if not ok then return nil, "invalid", ("%s: could not set attribute %s: %s"):format(target.path, name, tostring(setErr)) end
			end
			for _, name in removals do
				local ok, setErr = pcall(function() inst:SetAttribute(name, nil) end)
				if not ok then return nil, "invalid", ("%s: could not remove attribute %s: %s"):format(target.path, name, tostring(setErr)) end
			end
			if before then
				table.insert(changes, { path = target.path, before = before, after = (api.captureProperties(self.game, inst, touched)) })
			end
		end
		return { count = #targets, changes = changes, more = math.max(0, #targets - #changes) }
	end

	--[[ spatial_query: questions about where things are, answered by the engine's own queries.
		Read-only. Almost every "the tree floats" or "the coin is inside the wall" defect is a
		missing ground or overlap question, and this is the way to ask it without running code. ]]
	local function workspaceOf(self) return api.serviceFrom(self.game, self.options.services, "Workspace") end

	local function excludeList(self, raw)
		local out = {}
		if raw == nil then return out end
		if type(raw) ~= "table" or #raw > 20 then return nil, "exclude must be a list of at most 20 paths" end
		for _, path in raw do
			local inst, _, err = api.resolvePath(self.game, self.options.services, path, false)
			if not inst then return nil, err end
			table.insert(out, inst)
		end
		return out
	end

	local function rayParams(exclude)
		local params = RaycastParams.new()
		params.FilterType = Enum.RaycastFilterType.Exclude
		params.FilterDescendantsInstances = exclude
		return params
	end

	local function hitRecord(self, result)
		if result == nil then return { hit = false } end
		local position, normal = result.Position, result.Normal
		return {
			hit = true,
			path = if result.Instance then pathOf(self, result.Instance) else nil,
			position = { position.X, position.Y, position.Z },
			normal = { normal.X, normal.Y, normal.Z },
			material = tostring(result.Material),
			distance = result.Distance,
		}
	end

	local function cast(self, origin, direction, exclude)
		local world = workspaceOf(self)
		if not world then return nil, "Workspace is unavailable" end
		local ok, result = pcall(function() return world:Raycast(origin, direction, rayParams(exclude)) end)
		if not ok then return nil, "Studio refused the raycast: " .. tostring(result) end
		return { value = result }
	end

	local function partsInBox(self, cframe, size, exclude)
		local world = workspaceOf(self)
		if not world then return nil, "Workspace is unavailable" end
		local ok, parts = pcall(function()
			local params = OverlapParams.new()
			params.FilterType = Enum.RaycastFilterType.Exclude
			params.FilterDescendantsInstances = exclude
			return world:GetPartBoundsInBox(cframe, size, params)
		end)
		if not ok or type(parts) ~= "table" then return nil, "Studio refused the overlap query: " .. tostring(parts) end
		return parts
	end

	local function listParts(self, parts)
		local out = {}
		for _, part in parts do
			if #out >= 50 then break end
			table.insert(out, pathOf(self, part))
		end
		return out, #parts
	end

	local function handleSpatial(self, op)
		local action = op.action
		local exclude, excludeErr = excludeList(self, op.exclude)
		if not exclude then return nil, "invalid", excludeErr end
		if action == "raycast" then
			local origin, oErr = vector(op.origin, "origin")
			if not origin then return nil, "invalid", oErr end
			local direction, dErr = vector(op.direction, "direction", Query.MAX_RAY)
			if not direction then return nil, "invalid", dErr end
			local length = direction.Magnitude or math.sqrt(direction.X ^ 2 + direction.Y ^ 2 + direction.Z ^ 2)
			if length <= 0 or length > Query.MAX_RAY then return nil, "invalid", ("direction length must be > 0 and <= %d studs"):format(Query.MAX_RAY) end
			local r, err = cast(self, origin, direction, exclude)
			if not r then return nil, "internal", err end
			return { action = action, result = hitRecord(self, r.value) }
		elseif action == "find_ground" then
			local position, pErr = vector(op.position or op.origin, "position")
			if not position then return nil, "invalid", pErr end
			local r, err = cast(self, position, Vector3.new(0, -Query.MAX_RAY, 0), exclude)
			if not r then return nil, "internal", err end
			local record = hitRecord(self, r.value)
			if record.hit then record.dropFromPosition = position.Y - record.position[2] end
			return { action = action, result = record }
		elseif action == "bounds" or action == "check_placement" then
			local inst, canonical, err, kind = api.resolvePath(self.game, self.options.services, op.path, false)
			if not inst then return nil, kind or "not_found", err end
			local cframe, size, boundsErr = api.boundsOf(inst)
			if not cframe then return nil, "invalid", boundsErr end
			local centre = cframe.Position
			local bottom, top = centre.Y - size.Y / 2, centre.Y + size.Y / 2
			local data = { action = action, path = canonical, center = { centre.X, centre.Y, centre.Z }, size = { size.X, size.Y, size.Z }, bottomY = bottom, topY = top }
			if action == "bounds" then return data end
			table.insert(exclude, inst)
			-- A tiny inset keeps faces that merely touch (a part resting on the floor) from counting.
			local inset = Vector3.new(math.max(size.X - 0.1, 0.05), math.max(size.Y - 0.1, 0.05), math.max(size.Z - 0.1, 0.05))
			local parts, overlapErr = partsInBox(self, cframe, inset, exclude)
			if not parts then return nil, "internal", overlapErr end
			local listed, total = listParts(self, parts)
			data.overlapping, data.overlapCount = listed, total
			local r = cast(self, Vector3.new(centre.X, bottom + 0.05, centre.Z), Vector3.new(0, -Query.MAX_RAY, 0), exclude)
			local ground = hitRecord(self, r and r.value)
			data.ground = ground
			data.gapBelow = if ground.hit then bottom - ground.position[2] else nil
			data.floating = ground.hit and data.gapBelow > 0.5 or not ground.hit
			return data
		elseif action == "overlap" then
			local center, cErr = vector(op.center, "center")
			if not center then return nil, "invalid", cErr end
			local size, sErr = vector(op.size, "size", 2048)
			if not size then return nil, "invalid", sErr end
			if size.X <= 0 or size.Y <= 0 or size.Z <= 0 then return nil, "invalid", "size must be positive" end
			local parts, overlapErr = partsInBox(self, CFrame.new(center), size, exclude)
			if not parts then return nil, "internal", overlapErr end
			local listed, total = listParts(self, parts)
			return { action = action, parts = listed, count = total }
		elseif action == "find_flat" then
			if type(op.region) ~= "table" then return nil, "invalid", "find_flat needs region {min, max}" end
			local lo, loErr = vector(op.region.min, "region.min")
			if not lo then return nil, "invalid", loErr end
			local hi, hiErr = vector(op.region.max, "region.max")
			if not hi then return nil, "invalid", hiErr end
			if hi.X <= lo.X or hi.Y <= lo.Y or hi.Z <= lo.Z then return nil, "invalid", "region.max must be greater than region.min on every axis" end
			local samples, samplesErr = api.safeCount(op.samples, 64, 4, Query.MAX_FLAT_SAMPLES, "samples")
			if not samples then return nil, "invalid", samplesErr end
			local maxSlope = if api.finite(op.maxSlopeDeg) then math.clamp(op.maxSlopeDeg, 0, 60) else 15
			local minNormalY = math.cos(math.rad(maxSlope))
			local side = math.max(2, math.floor(math.sqrt(samples)))
			local flat, hits = {}, 0
			for i = 0, side - 1 do
				for j = 0, side - 1 do
					local x = lo.X + (hi.X - lo.X) * (i + 0.5) / side
					local z = lo.Z + (hi.Z - lo.Z) * (j + 0.5) / side
					local r = cast(self, Vector3.new(x, hi.Y, z), Vector3.new(0, lo.Y - hi.Y, 0), exclude)
					if r and r.value then
						hits += 1
						if r.value.Normal.Y >= minNormalY and #flat < 20 then
							local p = r.value.Position
							table.insert(flat, { p.X, p.Y, p.Z })
						end
					end
				end
			end
			return { action = action, sampled = side * side, hits = hits, flat = flat, maxSlopeDeg = maxSlope }
		end
		return nil, "invalid", "spatial_query.action must be raycast, find_ground, bounds, check_placement, overlap or find_flat"
	end

	--[[ scatter: seeded copies of a template on whatever the ground is.
		Deterministic by seed (a Park-Miller generator here, so the same seed gives the same layout in
		every engine and in the tests). The template must contain no script: scattering copies of code
		would be a way to spread it that no script review ever saw. ]]
	local function generator(seed)
		local state = (math.floor(math.abs(seed)) % 2147483646) + 1
		return function()
			state = (state * 16807) % 2147483647
			return state / 2147483647
		end
	end

	local function handleScatter(self, op)
		local template, templatePath, tErr, tKind = api.resolvePath(self.game, self.options.services, op.template, false)
		if not template then return nil, tKind or "not_found", tErr end
		if not api.isA(template, "BasePart") and not api.isA(template, "Model") then return nil, "invalid", "template must be a BasePart or a Model" end
		local descendants = api.descendantsOf(template) or {}
		for _, node in descendants do
			if api.isScript(node) then return nil, "refused", "the template contains a script, and scatter copies geometry, not code" end
		end
		local count, countErr = api.safeCount(op.count, 10, 1, Query.MAX_SCATTER, "count")
		if not count then return nil, "invalid", countErr end
		local perCopy = 1 + #descendants
		if perCopy * count > Query.MAX_SCATTER_NODES then
			return nil, "invalid", ("%d copies of a %d-instance template exceed the %d-instance scatter limit"):format(count, perCopy, Query.MAX_SCATTER_NODES)
		end
		if type(op.region) ~= "table" then return nil, "invalid", "scatter needs region {min, max}" end
		local lo, loErr = vector(op.region.min, "region.min")
		if not lo then return nil, "invalid", loErr end
		local hi, hiErr = vector(op.region.max, "region.max")
		if not hi then return nil, "invalid", hiErr end
		if hi.X <= lo.X or hi.Y <= lo.Y or hi.Z <= lo.Z then return nil, "invalid", "region.max must be greater than region.min on every axis" end
		local materials = nil
		if op.onMaterial ~= nil then
			if type(op.onMaterial) ~= "table" or #op.onMaterial == 0 or #op.onMaterial > 12 then return nil, "invalid", "onMaterial must list 1-12 Enum.Material names" end
			materials = {}
			for _, text in op.onMaterial do
				if type(text) ~= "string" or string.match(text, "^Enum%.Material%.[A-Za-z]+$") == nil then return nil, "invalid", "onMaterial entries must look like Enum.Material.Grass" end
				materials[text] = true
			end
		end
		local spacing = if op.minSpacing == nil then 0 elseif api.finite(op.minSpacing) and op.minSpacing >= 0 and op.minSpacing <= 500 then op.minSpacing else nil
		if spacing == nil then return nil, "invalid", "minSpacing must be 0-500 studs" end
		local scaleLo, scaleHi = 1, 1
		if op.scale ~= nil then
			if type(op.scale) ~= "table" or not api.finite(op.scale[1]) or not api.finite(op.scale[2]) or op.scale[1] < 0.2 or op.scale[2] > 5 or op.scale[1] > op.scale[2] then
				return nil, "invalid", "scale must be [min, max] within 0.2-5"
			end
			scaleLo, scaleHi = op.scale[1], op.scale[2]
		end
		local seed = if op.seed == nil then 1 elseif api.integer(op.seed) then op.seed else nil
		if seed == nil then return nil, "invalid", "seed must be an integer" end
		local parentPath = op.parent or "game.Workspace"
		local parent, canonicalParent, pErr, pKind, pRemedy = api.resolvePath(self.game, self.options.services, parentPath, true)
		if not parent then return nil, pKind or "not_found", pErr, pRemedy end
		local refused, refusedRemedy = api.destinationRefusal(self.game, parent, canonicalParent, api.classNameOf(template))
		if refused then return nil, "refused", refused, refusedRemedy end

		local random = generator(seed)
		local exclude = { template }
		local placed, points, reservations = {}, {}, {}
		local misses = { noGround = 0, material = 0, spacing = 0 }
		local attempts = 0
		local baseName = api.nameOf(template)
		while #placed < count and attempts < count * 10 do
			attempts += 1
			local x = lo.X + (hi.X - lo.X) * random()
			local z = lo.Z + (hi.Z - lo.Z) * random()
			local yaw = if op.randomYaw == false then 0 else random() * math.pi * 2
			local scale = scaleLo + (scaleHi - scaleLo) * random()
			local r = cast(self, Vector3.new(x, hi.Y, z), Vector3.new(0, lo.Y - hi.Y, 0), exclude)
			local hit = r and r.value
			if not hit then
				misses.noGround += 1
			elseif materials and not materials[tostring(hit.Material)] then
				misses.material += 1
			else
				local crowded = false
				for _, p in points do
					if (p[1] - hit.Position.X) ^ 2 + (p[3] - hit.Position.Z) ^ 2 < spacing * spacing then crowded = true; break end
				end
				if crowded then
					misses.spacing += 1
				else
					local copy, cloneErr = api.safeClone(template)
					if not copy then return nil, "internal", cloneErr end
					local name, nameErr = api.reserveUniqueName(parent, baseName, reservations)
					if not name then copy:Destroy(); return nil, "conflict", nameErr end
					local okPlace, placeErr = pcall(function()
						copy.Name = name
						if api.isA(copy, "Model") then
							if scale ~= 1 then copy:ScaleTo(copy:GetScale() * scale) end
							copy:PivotTo(CFrame.new(hit.Position) * CFrame.Angles(0, yaw, 0))
							local box, size = copy:GetBoundingBox()
							copy:PivotTo(copy:GetPivot() + Vector3.new(0, hit.Position.Y - (box.Position.Y - size.Y / 2), 0))
						else
							if scale ~= 1 then copy.Size = copy.Size * scale end
							copy.CFrame = CFrame.new(hit.Position + Vector3.new(0, copy.Size.Y / 2, 0)) * CFrame.Angles(0, yaw, 0)
						end
						copy.Parent = parent
					end)
					if not okPlace then
						pcall(function() copy:Destroy() end)
						return nil, "internal", "could not place a copy: " .. tostring(placeErr)
					end
					table.insert(exclude, copy)
					table.insert(placed, copy)
					table.insert(points, { hit.Position.X, hit.Position.Y, hit.Position.Z })
				end
			end
		end
		local sample = {}
		for index = 1, math.min(10, #points) do sample[index] = points[index] end
		return {
			template = templatePath, parent = canonicalParent, requested = count, placed = #placed,
			attempts = attempts, misses = misses, seed = seed, positions = sample,
			shortfall = if #placed < count then ("placed %d of %d: no ground %d, wrong material %d, too close %d"):format(#placed, count, misses.noGround, misses.material, misses.spacing) else nil,
		}
	end

	return {
		handlers = {
			query_instances = handleQuery,
			set_props_bulk = handleBulk,
			spatial_query = handleSpatial,
			scatter = handleScatter,
		},
		mutating = { set_props_bulk = true, scatter = true },
	}
end

return Query
