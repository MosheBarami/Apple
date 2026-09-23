--!nocheck
-- Apple Studio op family: COLLISION GROUPS (tool expansion Phase A).
--
--   collision_groups       (write)  register a group, set whether two groups collide, assign parts
--   collision_groups_list  (read)   the registered groups and every pair that does NOT collide
--
-- PhysicsService is reached for exactly these calls; it is not added to the path allowlists, so no
-- other operation can read or write it. BasePart.CollisionGroup joins PROPERTY_ALLOW and
-- READ_PROPERTIES so a checkpoint records and restores which group a part is in.

local Physics = {}
Physics.name = "physics"
Physics.MAX_ASSIGN = 500
Physics.DEFAULT_MAX_GROUPS = 32

function Physics.build(api)
	local function physics(self)
		local service = api.serviceFrom(self.game, self.options.services, "PhysicsService")
		if service == nil then return nil, "PhysicsService is unavailable in this Studio session" end
		return service
	end

	local function groupName(value, label)
		local name, err = api.safeText(value, 100, label)
		if not name then return nil, err end
		if #name == 0 or string.find(name, "[%c]") then return nil, label .. " must be a non-empty name without control characters" end
		return name
	end

	local function registered(service, name)
		local ok, value = pcall(function() return service:IsCollisionGroupRegistered(name) end)
		return ok and value == true
	end

	local function groupList(service)
		local ok, groups = pcall(function() return service:GetRegisteredCollisionGroups() end)
		if not ok or type(groups) ~= "table" then return nil, "PhysicsService did not list its collision groups" end
		local names = {}
		for _, group in groups do
			local name = if type(group) == "table" then group.name else nil
			if type(name) == "string" then table.insert(names, name) end
		end
		return names
	end

	local function maxGroups(service)
		local ok, value = pcall(function() return service:GetMaxCollisionGroups() end)
		if ok and api.integer(value) then return value end
		return Physics.DEFAULT_MAX_GROUPS
	end

	local function handleWrite(self, op)
		local service, serviceErr = physics(self)
		if not service then return nil, "refused", serviceErr, "none" end
		local action = op.action
		if action == "register" then
			local name, err = groupName(op.group, "group")
			if not name then return nil, "invalid", err end
			if registered(service, name) then return { action = action, group = name, alreadyRegistered = true } end
			local names = groupList(service) or {}
			local limit = maxGroups(service)
			if #names >= limit then
				return nil, "refused", ("this place already has %d collision groups, Roblox's limit; reuse one of: %s"):format(#names, table.concat(names, ", "))
			end
			local ok, regErr = pcall(function() service:RegisterCollisionGroup(name) end)
			if not ok then return nil, "internal", "Studio refused RegisterCollisionGroup: " .. tostring(regErr) end
			return { action = action, group = name, registered = true, groups = #names + 1, limit = limit }
		elseif action == "set_collidable" then
			local a, aErr = groupName(op.group, "group")
			if not a then return nil, "invalid", aErr end
			local b, bErr = groupName(op.other, "other")
			if not b then return nil, "invalid", bErr end
			if type(op.collidable) ~= "boolean" then return nil, "invalid", "collidable must be true or false" end
			for _, name in { a, b } do
				if not registered(service, name) then return nil, "not_found", ("collision group %s is not registered; register it first"):format(name) end
			end
			local ok, setErr = pcall(function() service:CollisionGroupSetCollidable(a, b, op.collidable) end)
			if not ok then return nil, "internal", "Studio refused CollisionGroupSetCollidable: " .. tostring(setErr) end
			return { action = action, group = a, other = b, collidable = op.collidable }
		elseif action == "assign" then
			local name, err = groupName(op.group, "group")
			if not name then return nil, "invalid", err end
			if not registered(service, name) then return nil, "not_found", ("collision group %s is not registered; register it first"):format(name) end
			if type(op.paths) ~= "table" or #op.paths == 0 or #op.paths > Physics.MAX_ASSIGN then
				return nil, "invalid", ("paths must list 1-%d BaseParts or Models"):format(Physics.MAX_ASSIGN)
			end
			local parts = {}
			for _, path in op.paths do
				local inst, canonical, resolveErr, kind, remedy = api.resolvePath(self.game, self.options.services, path, true)
				if not inst then return nil, kind or "not_found", resolveErr, remedy end
				if not api.writableTarget(self.game, inst) then return nil, "refused", canonical .. " is outside Apple's place scope", "choose_allowed_target" end
				local found, partsErr = api.partsUnder(inst)
				if not found then return nil, "invalid", partsErr end
				if #found == 0 then return nil, "invalid", canonical .. " contains no BasePart" end
				for _, part in found do table.insert(parts, part) end
				if #parts > api.limits.affectedParts then return nil, "invalid", "assign exceeds the affected-part limit" end
			end
			for _, part in parts do
				local ok, setErr = pcall(function() part.CollisionGroup = name end)
				if not ok then return nil, "internal", "could not set CollisionGroup: " .. tostring(setErr) end
			end
			return { action = action, group = name, parts = #parts }
		end
		return nil, "invalid", "collision_groups.action must be register, set_collidable or assign"
	end

	local function handleList(self, _op)
		local service, serviceErr = physics(self)
		if not service then return nil, "refused", serviceErr, "none" end
		local names, err = groupList(service)
		if not names then return nil, "internal", err end
		local notColliding = {}
		for i = 1, #names do
			for j = i, #names do
				local ok, collides = pcall(function() return service:CollisionGroupsAreCollidable(names[i], names[j]) end)
				if ok and collides == false then table.insert(notColliding, { names[i], names[j] }) end
			end
		end
		return { groups = names, limit = maxGroups(service), notColliding = notColliding }
	end

	return {
		handlers = {
			collision_groups = handleWrite,
			collision_groups_list = handleList,
		},
		mutating = { collision_groups = true },
		propertyAllow = { CollisionGroup = true },
		readProperties = { CollisionGroup = true },
	}
end

return Physics
