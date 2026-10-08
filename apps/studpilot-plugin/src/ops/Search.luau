--!nocheck
-- StudPilot Studio op family: SEARCH (plugin 2.0). All three are reads: no recording, no consent.
--
--   grep  text or Lua-pattern search over script sources, with context lines, include/exclude path
--         globs, a case flag and a result cap
--   glob  instance paths matching a slash glob ("Workspace/**/Door*"), optionally only one class (IsA)
--   list  one instance's children with class, name and child counts
--
-- Paths in globs are slash-separated names from the service down ("ReplicatedStorage/Modules/*").
-- `*` matches within one name, `?` one character, `**` any number of whole names. Every result
-- carries the canonical `game.X.Y` path the other operations take.

local Search = {}
Search.name = "search"
Search.MAX_RESULTS = 500
Search.MAX_SCAN = 60000
Search.MAX_CONTEXT = 5
Search.MAX_LINE = 400
Search.MAX_CHILDREN = 1000

function Search.build(api)
	-- One glob segment as an anchored Lua pattern; nil for "**".
	local function segmentPattern(segment: string, caseless: boolean): string?
		if segment == "**" then return nil end
		local text = if caseless then string.lower(segment) else segment
		local out = string.gsub(text, "[%^%$%(%)%%%.%[%]%+%-]", "%%%0")
		out = string.gsub(out, "%*", "[^/]*")
		out = string.gsub(out, "%?", "[^/]")
		return "^" .. out .. "$"
	end

	local function compileGlob(glob: any, label: string): (any?, string?)
		local text, err = api.safeText(glob, 400, label)
		if not text then return nil, err end
		text = string.gsub(text, "^game[/%.]", "")
		local parts = {}
		for segment in string.gmatch(text, "[^/]+") do
			table.insert(parts, { raw = segment, pattern = segmentPattern(segment, false), caseless = segmentPattern(segment, true) })
		end
		if #parts == 0 then return nil, label .. " must name at least one path segment" end
		return parts
	end

	-- Whether names[i..] matches parts[j..]; "**" consumes zero or more names.
	local function matchFrom(parts, j: number, names, i: number, caseless: boolean, budget): boolean
		budget.n += 1
		if budget.n > 20000 then return false end
		if j > #parts then return i > #names end
		local part = parts[j]
		if part.pattern == nil then
			for k = i, #names + 1 do
				if matchFrom(parts, j + 1, names, k, caseless, budget) then return true end
			end
			return false
		end
		if i > #names then return false end
		local name = if caseless then string.lower(names[i]) else names[i]
		if string.find(name, if caseless then part.caseless else part.pattern) == nil then return false end
		return matchFrom(parts, j + 1, names, i + 1, caseless, budget)
	end

	local function globMatches(parts, names, caseless: boolean): boolean
		return matchFrom(parts, 1, names, 1, caseless, { n = 0 })
	end

	-- Names from the service down, or nil when the instance is outside the place.
	local function namesOf(self, inst): { string }?
		local names = {}
		local current = inst
		local guard = 0
		while current ~= nil and current ~= self.game do
			guard += 1
			if guard > 64 then return nil end
			table.insert(names, 1, api.nameOf(current))
			current = api.parentOf(current)
		end
		if current ~= self.game then return nil end
		return names
	end

	-- The readable services a glob can reach: the literal first segment, or all of them.
	local function rootsFor(self, parts): { any }
		local roots = {}
		local first = parts and parts[1]
		if first and first.pattern ~= nil and not string.find(first.raw, "[%*%?]") then
			if api.readServices[first.raw] then
				local service = api.serviceFrom(self.game, self.options.services, first.raw)
				if service then table.insert(roots, service) end
			end
			return roots
		end
		for serviceName in api.readServices do
			local service = api.serviceFrom(self.game, self.options.services, serviceName)
			if service then table.insert(roots, service) end
		end
		table.sort(roots, function(a, b) return api.nameOf(a) < api.nameOf(b) end)
		return roots
	end

	local function count(op, field: string, default: number, maximum: number): (number?, string?)
		return api.safeCount(op[field], default, 1, maximum, field)
	end

	local function handleGlob(self, op)
		local parts, err = compileGlob(op.pattern, "glob.pattern")
		if not parts then return nil, "invalid", err end
		local className = nil
		if op.className ~= nil then
			local name, classErr = api.safeText(op.className, 80, "glob.className")
			if not name then return nil, "invalid", classErr end
			className = name
		end
		local maxResults, maxErr = count(op, "maxResults", 200, Search.MAX_RESULTS)
		if not maxResults then return nil, "invalid", maxErr end
		local caseless = op.caseSensitive == false
		local results, scanned, truncated = {}, 0, false
		for _, root in rootsFor(self, parts) do
			local candidates = { root }
			local descendants = api.descendantsOf(root)
			if descendants then for _, d in descendants do table.insert(candidates, d) end end
			for _, inst in candidates do
				scanned += 1
				if scanned > Search.MAX_SCAN then truncated = true; break end
				if className == nil or api.isA(inst, className) then
					local names = namesOf(self, inst)
					if names and globMatches(parts, names, caseless) then
						if #results >= maxResults then truncated = true; break end
						local okChildren, children = pcall(function() return inst:GetChildren() end)
						table.insert(results, { path = api.fullPath(self.game, inst), class = api.classNameOf(inst), children = if okChildren then #children else nil })
					end
				end
			end
			if truncated then break end
		end
		return { pattern = op.pattern, matches = results, count = #results, scanned = scanned, truncated = truncated }
	end

	local function handleList(self, op)
		local inst, canonical, err, pathKind = api.resolvePath(self.game, self.options.services, op.path or "game.Workspace", false, self)
		if not inst then return nil, pathKind or "not_found", err end
		local maxResults, maxErr = count(op, "maxResults", 300, Search.MAX_CHILDREN)
		if not maxResults then return nil, "invalid", maxErr end
		local children = api.childrenOf(inst) or {}
		local out = {}
		for index, child in children do
			if index > maxResults then break end
			local okGrand, grand = pcall(function() return child:GetChildren() end)
			local okDesc, desc = pcall(function() return #child:GetDescendants() end)
			table.insert(out, { name = api.nameOf(child), class = api.classNameOf(child), children = if okGrand then #grand else nil,
				descendants = if okDesc then desc else nil, path = api.fullPath(self.game, child) })
		end
		return { path = canonical, class = api.classNameOf(inst), children = out, count = #children, truncated = #children > #out }
	end

	local function clip(line: string): string
		if #line <= Search.MAX_LINE then return line end
		return string.sub(line, 1, Search.MAX_LINE) .. "…"
	end

	local function globList(raw, label: string): ({ any }?, string?)
		if raw == nil then return {} end
		local list = if type(raw) == "string" then { raw } else raw
		if type(list) ~= "table" or #list > 20 then return nil, label .. " must be a glob or a list of at most 20" end
		local out = {}
		for _, glob in list do
			local parts, err = compileGlob(glob, label)
			if not parts then return nil, err end
			table.insert(out, parts)
		end
		return out
	end

	local function handleGrep(self, op)
		local query, queryErr = api.safeText(op.query, 400, "grep.query")
		if not query then return nil, "invalid", queryErr end
		if #query == 0 then return nil, "invalid", "grep.query must not be empty" end
		local usePattern = op.pattern == true or op.regex == true
		local caseless = op.caseSensitive ~= true
		local needle = if caseless then string.lower(query) else query
		if usePattern then
			local okPattern, patternErr = pcall(string.find, "", needle)
			if not okPattern then return nil, "invalid", "grep.query is not a valid Lua pattern: " .. tostring(patternErr) end
		end
		local include, includeErr = globList(op.include, "grep.include")
		if not include then return nil, "invalid", includeErr end
		local exclude, excludeErr = globList(op.exclude, "grep.exclude")
		if not exclude then return nil, "invalid", excludeErr end
		local context = op.context or 0
		if not api.integer(context) or context < 0 or context > Search.MAX_CONTEXT then return nil, "invalid", ("grep.context must be 0..%d"):format(Search.MAX_CONTEXT) end
		local maxResults, maxErr = count(op, "maxResults", 100, Search.MAX_RESULTS)
		if not maxResults then return nil, "invalid", maxErr end

		local results, scriptsSearched, filesMatched, truncated, scanned = {}, 0, 0, false, 0
		local unreadable = 0
		local roots = if #include > 0 then {} else rootsFor(self, nil)
		if #include > 0 then
			local seen = {}
			for _, parts in include do
				for _, root in rootsFor(self, parts) do if not seen[root] then seen[root] = true; table.insert(roots, root) end end
			end
		end
		for _, root in roots do
			for _, inst in api.descendantsOf(root) or {} do
				scanned += 1
				if scanned > Search.MAX_SCAN then truncated = true; break end
				if api.isScript(inst) then
					local names = namesOf(self, inst)
					local wanted = names ~= nil
					if wanted and #include > 0 then
						wanted = false
						for _, parts in include do if globMatches(parts, names, false) then wanted = true; break end end
					end
					if wanted then for _, parts in exclude do if globMatches(parts, names, false) then wanted = false; break end end end
					if wanted then
						local source = api.scriptSource(self, inst)
						if source == nil then
							unreadable += 1
						else
							scriptsSearched += 1
							local lines = string.split(source, "\n")
							local path = api.fullPath(self.game, inst)
							local matchedHere = false
							for lineNumber, line in lines do
								local hay = if caseless then string.lower(line) else line
								local found
								if usePattern then
									local okFind, at = pcall(string.find, string.sub(hay, 1, 4000), needle)
									found = okFind and at ~= nil
								else
									found = string.find(hay, needle, 1, true) ~= nil
								end
								if found then
									if #results >= maxResults then truncated = true; break end
									matchedHere = true
									local entry = { path = path, line = lineNumber, text = clip(line) }
									if context > 0 then
										entry.before, entry.after = {}, {}
										for k = math.max(1, lineNumber - context), lineNumber - 1 do table.insert(entry.before, clip(lines[k])) end
										for k = lineNumber + 1, math.min(#lines, lineNumber + context) do table.insert(entry.after, clip(lines[k])) end
									end
									table.insert(results, entry)
								end
							end
							if matchedHere then filesMatched += 1 end
						end
					end
				end
				if truncated then break end
			end
			if truncated then break end
		end
		return { query = query, pattern = usePattern, caseSensitive = not caseless, matches = results, count = #results,
			scriptsSearched = scriptsSearched, scriptsMatched = filesMatched, unreadable = unreadable, truncated = truncated }
	end

	return {
		handlers = { grep = handleGrep, glob = handleGlob, list = handleList },
	}
end

return Search
