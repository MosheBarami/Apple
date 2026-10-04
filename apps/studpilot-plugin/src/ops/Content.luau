--!nocheck
-- StudPilot Studio op family: CONTENT AVAILABILITY (read-only).
--
--   preload_content  (read)  ask Studio whether asset ids load for this account, without inserting anything
--
-- Roblox answers "can this place use that image, mesh, sound or animation" only by fetching it, and a
-- sound or animation is refused for an account that lacks permission unless it is fetched AS a Sound or
-- an Animation. So those two types are wrapped in a transient instance; every other type goes as its
-- plain content string. Nothing is parented into the DataModel and nothing is written to the place or
-- to undo, so the op is not mutating and takes no edit consent.
--
-- ContentProvider:PreloadAsync can wait far longer than a tool call may, so it runs in its own thread and
-- the op waits at most timeoutMs. An id the callback never reported by then is "TimedOut".

local Content = {}
Content.name = "content"
Content.MAX_ITEMS = 400
Content.DEFAULT_TIMEOUT_MS = 20000
Content.MAX_TIMEOUT_MS = 60000

local TYPES = { image = true, mesh = true, sound = true, animation = true, texture = true, other = true }
local FINAL = { Success = true, Failure = true, TimedOut = true }
local WRAP = { sound = { "Sound", "SoundId" }, animation = { "Animation", "AnimationId" } }

-- rbxassetid://<n>, or the older http(s)://www.roblox.com/asset/?id=<n>, as rbxassetid://<n>. The scheme is
-- compared as a word, as Fx.luau does: the shipped source carries no asset-URL literal.
local SCHEME = "rbxassetid"
local function normalize(text)
	if type(text) ~= "string" or #text > 200 then return nil end
	local lower = string.lower(text)
	local scheme, digits = string.match(lower, "^(%l+)://(%d+)$")
	if scheme ~= SCHEME then digits = string.match(lower, "^https?://www%.roblox%.com/asset/?%?id=(%d+)$") end
	if digits == nil or #digits > 19 then return nil end
	return SCHEME .. "://" .. digits
end

local function clock()
	local ok, value = pcall(os.clock)
	return if ok and type(value) == "number" then value else 0
end

function Content.build(api)
	local function handlePreload(self, op)
		local items = op.items
		if type(items) ~= "table" then return nil, "invalid", "items must be an array of {id, type?}" end
		local count = #items
		if count < 1 or count > Content.MAX_ITEMS then return nil, "invalid", ("items must hold 1 to %d entries"):format(Content.MAX_ITEMS) end
		for key in items do
			if type(key) ~= "number" or key % 1 ~= 0 or key < 1 or key > count then return nil, "invalid", "items must be a plain array" end
		end
		local timeoutMs, timeoutErr = api.safeCount(op.timeoutMs, Content.DEFAULT_TIMEOUT_MS, 1, Content.MAX_TIMEOUT_MS, "timeoutMs")
		if not timeoutMs then return nil, "invalid", timeoutErr end
		-- A repeated id is asked once, as the type its first entry gave.
		local order, kinds = {}, {}
		for index = 1, count do
			local item = items[index]
			local id = if type(item) == "table" then normalize(item.id) else nil
			if id == nil then return nil, "invalid", ("items[%d].id must be a Roblox asset id (the rbxassetid scheme and digits)"):format(index) end
			if item.type ~= nil and not TYPES[item.type] then return nil, "invalid", ("items[%d].type must be image, mesh, sound, animation, texture or other"):format(index) end
			if kinds[id] == nil then kinds[id] = item.type or "other"; table.insert(order, id) end
		end
		local provider = api.serviceFrom(self.game, self.options.services, "ContentProvider")
		if provider == nil or type(provider.PreloadAsync) ~= "function" then return nil, "unsupported", "ContentProvider is unavailable in this Studio session" end

		local made, list = {}, {}
		local function cleanup() for _, inst in made do api.destroyInstance(inst) end end
		for _, id in order do
			local wrap = WRAP[kinds[id]]
			if wrap then
				local inst, makeErr = api.makeInstance(self.options, wrap[1])
				if not inst then cleanup(); return nil, "internal", makeErr or ("could not create a " .. wrap[1]) end
				table.insert(made, inst)
				local set, setErr = pcall(function() inst[wrap[2]] = id end)
				if not set then cleanup(); return nil, "internal", "could not set " .. wrap[2] .. ": " .. tostring(setErr) end
				table.insert(list, inst)
			else
				table.insert(list, id)
			end
		end

		local results, reported, finished, failure = {}, 0, false, nil
		local function record(contentId, status)
			local id = normalize(contentId)
			local ok, name = pcall(function() return status.Name end)
			if id ~= nil and kinds[id] ~= nil and results[id] == nil and ok and FINAL[name] then
				results[id] = name
				reported += 1
			end
		end
		local started = clock()
		task.spawn(function()
			local ok, err = pcall(function() provider:PreloadAsync(list, record) end)
			if not ok then failure = tostring(err) end
			finished = true
		end)
		local deadline = started + timeoutMs / 1000
		while not finished and reported < #order and clock() < deadline do task.wait(0.05) end
		cleanup()
		if failure ~= nil and reported < #order then return nil, "internal", "Studio could not preload: " .. failure end

		local out = {}
		for _, id in order do out[id] = results[id] or "TimedOut" end
		return { results = out, elapsedMs = math.max(0, math.floor((clock() - started) * 1000)) }
	end

	return {
		handlers = {
			preload_content = handlePreload,
		},
	}
end

return Content
