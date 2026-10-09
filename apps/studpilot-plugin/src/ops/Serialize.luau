--!nocheck
-- StudPilot Studio op family: SERIALIZE / DESERIALIZE (plugin 2.0).
--
--   serialize    (read)   a subtree as JSON: every scriptable property the API dump says a plugin can
--                          write back (typed {t,v} values), attributes, tags, script source on request
--   deserialize  (write)  recreate such JSON under a parent, as ONE undo recording
--
-- The property set is Permissions.captureList (ApiDump.luau): what a plugin can set is what is worth
-- reading back. A reference to an instance INSIDE the serialized subtree is also given relative to its
-- root (`rel`, names joined by "/"), so a deserialized copy links to its own parts, not the original's.
-- Scripts come back through ScriptEditorService with the same written-source refusal as edit_script.

local Serialize = {}
Serialize.name = "serialize"
Serialize.MAX_NODES = 3000
Serialize.MAX_DEPTH = 40
Serialize.MAX_SOURCE_CHARS = 1000000

function Serialize.build(api)
	local function relativeOf(root, inst): string?
		local names = {}
		local current = inst
		local guard = 0
		while current ~= nil and current ~= root do
			guard += 1
			if guard > Serialize.MAX_DEPTH + 2 then return nil end
			table.insert(names, 1, api.nameOf(current))
			current = api.parentOf(current)
		end
		if current ~= root then return nil end
		return if #names == 0 then "." else table.concat(names, "/")
	end

	local function handleSerialize(self, op)
		local root, canonical, err, pathKind = api.resolvePath(self.game, self.options.services, op.path, false, self)
		if not root then return nil, pathKind or "not_found", err end
		local perms = api.permissions()
		if perms == nil then return nil, "refused", "this plugin build is missing its Roblox API dump", "none" end
		local maxDepth, depthErr = api.safeCount(op.maxDepth, Serialize.MAX_DEPTH, 0, Serialize.MAX_DEPTH, "serialize.maxDepth")
		if not maxDepth then return nil, "invalid", depthErr end
		local maxNodes, nodesErr = api.safeCount(op.maxNodes, 500, 1, Serialize.MAX_NODES, "serialize.maxNodes")
		if not maxNodes then return nil, "invalid", nodesErr end
		local includeSource = op.includeSource ~= false
		local state = { nodes = 0, truncated = false, sourceChars = 0, notes = {} }

		local function node(inst, depth)
			if state.nodes >= maxNodes then state.truncated = true; return nil end
			state.nodes += 1
			local className = api.classNameOf(inst)
			local set = perms.captureList(className)
			local out = { class = className, name = api.nameOf(inst) }
			if set == nil then table.insert(state.notes, className .. " is not in this plugin's API dump; only its name and children are serialized") end
			local props, issues = api.captureProperties(self.game, inst, set or {}, true)
			for property, typed in props do
				if type(typed) == "table" and typed.t == "Instance" then
					local okRef, target = pcall(function() return inst[property] end)
					local rel = if okRef and target ~= nil then relativeOf(root, target) else nil
					if rel then typed.rel = rel end
				end
			end
			for _, issue in issues do if #state.notes < 40 then table.insert(state.notes, className .. ": " .. issue) end end
			out.props = props
			local attrs = api.captureAttributes(self.game, inst)
			if next(attrs) ~= nil then out.attributes = attrs end
			local okTags, tags = pcall(function() return inst:GetTags() end)
			if okTags and type(tags) == "table" and #tags > 0 then out.tags = tags end
			if api.isScript(inst) and includeSource then
				local source = api.scriptSource(self, inst)
				if source ~= nil and state.sourceChars + #source <= Serialize.MAX_SOURCE_CHARS then
					state.sourceChars += #source
					out.source = source
				else
					state.truncated = true
					out.sourceOmitted = true
				end
			end
			local children = api.childrenOf(inst) or {}
			if #children > 0 then
				if depth >= maxDepth then
					out.childCount = #children
					state.truncated = true
				else
					out.children = {}
					for _, child in children do
						local childNode = node(child, depth + 1)
						if childNode then table.insert(out.children, childNode) else break end
					end
				end
			end
			return out
		end

		local tree = node(root, 0)
		return { path = canonical, root = tree, nodes = state.nodes, truncated = state.truncated, notes = state.notes, apiVersion = perms.version }
	end

	local function handleDeserialize(self, op)
		local parent, parentPath, err, pathKind, remedy = api.resolvePath(self.game, self.options.services, op.parent, true, self)
		if not parent then return nil, pathKind or "not_found", err, remedy end
		local roots = if type(op.nodes) == "table" and op.nodes[1] ~= nil then op.nodes elseif type(op.node) == "table" then { op.node } else nil
		if roots == nil then return nil, "invalid", "deserialize takes `node` (one serialized tree) or `nodes` (a list)" end
		local count = 0
		local created, pendingRefs, scripts = {}, {}, {}

		-- Validate and build detached first; nothing is parented into the place until every node passed.
		local function build(spec, depth)
			if type(spec) ~= "table" then return nil, "each node must be an object" end
			if depth > Serialize.MAX_DEPTH then return nil, "the tree is nested too deeply" end
			count += 1
			if count > Serialize.MAX_NODES then return nil, ("a deserialize may create at most %d instances"):format(Serialize.MAX_NODES) end
			local className = spec.class or spec.className
			if type(className) ~= "string" then return nil, "each node needs a class" end
			local isScript = api.scriptClasses[className] == true
			if not isScript and not api.createClasses[className] then
				local perms = api.permissions()
				local why = nil
				if perms then
					local _, reason = perms.creatable(className)
					why = reason
				end
				return nil, why or ("class %s cannot be created"):format(className)
			end
			local name, nameErr = api.safeName(spec.name or className, "node name")
			if not name then return nil, nameErr end
			local plain, refs = {}, {}
			for property, typed in spec.props or {} do
				if type(typed) == "table" and typed.t == "Instance" then refs[property] = typed else plain[property] = typed end
			end
			local props, _, propErr = api.validateProps(plain, name .. ".props", false, false, self.game, self.options.services, className)
			if propErr then return nil, propErr end
			local attrs, attrErr = api.validateAttributes(spec.attributes, name .. ".attributes")
			if attrErr then return nil, attrErr end
			local source = nil
			if isScript and spec.source ~= nil then
				local text, textErr = api.safeText(spec.source, 240000, name .. ".source")
				if not text then return nil, textErr end
				local danger = api.sourceDanger(text)
				if danger then return nil, name .. ": " .. danger end
				source = text
			end
			local inst, makeErr = api.makeInstance(self.options, className)
			if not inst then return nil, makeErr end
			table.insert(created, inst)
			local okSet, setErr = pcall(function()
				inst.Name = name
				for property, value in props do inst[property] = value end
				for attribute, value in attrs do inst:SetAttribute(attribute, value) end
				for _, tag in (if type(spec.tags) == "table" then spec.tags else {}) do if type(tag) == "string" and #tag <= 100 then inst:AddTag(tag) end end
			end)
			if not okSet then return nil, ("%s: %s"):format(name, tostring(setErr)) end
			if next(refs) ~= nil then table.insert(pendingRefs, { inst = inst, refs = refs, label = name }) end
			if source ~= nil then table.insert(scripts, { inst = inst, source = source }) end
			for _, childSpec in (if type(spec.children) == "table" then spec.children else {}) do
				local child, childErr = build(childSpec, depth + 1)
				if not child then return nil, childErr end
				local okParent, parentErr = pcall(function() child.Parent = inst end)
				if not okParent then return nil, tostring(parentErr) end
			end
			return inst
		end

		local function discard()
			for _, inst in created do pcall(function() inst:Destroy() end) end
		end

		local tops = {}
		for _, spec in roots do
			local inst, buildErr = build(spec, 0)
			if not inst then discard(); return nil, "invalid", buildErr end
			local refusal = api.destinationRefusal(self.game, parent, parentPath, api.classNameOf(inst))
			if refusal then discard(); return nil, "refused", refusal end
			table.insert(tops, inst)
		end
		for _, inst in tops do
			local ok, parentErr = api.parentInstance(inst, parent)
			if not ok then discard(); return nil, "internal", "could not parent: " .. tostring(parentErr) end
		end
		-- References: inside the new tree by `rel`, otherwise by absolute path.
		local unresolved = {}
		for _, pending in pendingRefs do
			local top = pending.inst
			while api.parentOf(top) ~= nil and api.parentOf(top) ~= parent do top = api.parentOf(top) end
			for property, typed in pending.refs do
				local target = nil
				if type(typed.rel) == "string" then
					target = top
					if typed.rel ~= "." then
						for segment in string.gmatch(typed.rel, "[^/]+") do
							target = target and target:FindFirstChild(segment)
						end
					end
				end
				if target == nil then
					local value = api.decodeValue(typed, pending.label .. "." .. property, true, self.game, self.options.services)
					target = value
				end
				if target ~= nil then
					local ok = pcall(function() pending.inst[property] = target end)
					if not ok then table.insert(unresolved, pending.label .. "." .. property) end
				else
					table.insert(unresolved, pending.label .. "." .. property)
				end
			end
		end
		for _, item in scripts do
			local wrote, writeErr = api.sourceWrite(self.editor, item.inst, function() return item.source end)
			if not wrote then discard(); return nil, "internal", "could not write script source: " .. tostring(writeErr) end
		end
		local paths = {}
		for _, inst in tops do table.insert(paths, api.fullPath(self.game, inst)) end
		return { created = paths, instances = #created, scripts = #scripts, unresolvedReferences = unresolved }
	end

	return {
		handlers = { serialize = handleSerialize, deserialize = handleDeserialize },
		mutating = { deserialize = true },
	}
end

return Serialize
