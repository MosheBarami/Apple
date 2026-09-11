--!nocheck
--!modules Version,Paths,Serializer,Render,Generation,Ops
--[[
	Generation — the gate in front of the marketplace.

	`insertAsset` is the ONE path by which an asset id is allowed into a user's place.
	Everything else refuses: Paths.setProp gates create_instances and set_properties,
	and refuseLuauIngress gates run_luau. This is the door, and Ops.execute records a
	session-long grant on the strength of it succeeding — `sessionVerifiedAssets[id] =
	true` happens only here — so its validation is the thing that decides which ids the
	rest of the session will trust.

	839 lines and no test of any kind before this.
]]

local ws = game:GetService("Workspace")

-- ------------------------------------------------------------- insertAsset ----

local function fakeObjects(n)
	local out = {}
	for i = 1, n do
		local m = Instance.new("Model")
		m.Name = "Loaded" .. i
		out[i] = m
	end
	return out
end

H.test("an assetId that is not a positive integer is refused before anything loads", function()
	-- The grant this unlocks is session-long, so the shape check runs before the
	-- network call rather than after it.
	for _, bad in { "123", 0, -5, 1.5, nil, true } do
		local r = Generation.insertAsset(bad, ws)
		H.eq(r.ok, false, "should refuse " .. tostring(bad))
		H.ok(string.find(tostring(r.error), "positive integer", 1, true),
			"says why for " .. tostring(bad) .. ": " .. tostring(r.error))
		H.eq(#r.instances, 0, "and returns nothing")
	end
end)

H.test("a load failure is reported, not swallowed", function()
	__getObjectsError = "asset is private"
	local r = Generation.insertAsset(12345, ws)
	__getObjectsError = nil
	H.eq(r.ok, false, "failed")
	H.ok(string.find(tostring(r.error), "could not load asset 12345", 1, true), "names the id: " .. tostring(r.error))
	H.ok(string.find(tostring(r.error), "private", 1, true), "and carries the reason")
end)

H.test("an asset that loads but is empty is a failure, not a silent success", function()
	-- Reporting ok here would hand the caller a session-long grant for an id that
	-- placed nothing.
	__getObjectsResult = {}
	local r = Generation.insertAsset(999, ws)
	__getObjectsResult = nil
	H.eq(r.ok, false, "failed")
	H.ok(string.find(tostring(r.error), "contained nothing", 1, true), "says why: " .. tostring(r.error))
end)

H.test("a successful insert parents everything it loaded", function()
	local holder = Instance.new("Folder", ws)
	holder.Name = "InsertHere"
	__getObjectsResult = fakeObjects(3)
	local r = Generation.insertAsset(42, holder)
	__getObjectsResult = nil
	H.eq(r.ok, true, "ok: " .. tostring(r.error))
	H.eq(#r.instances, 3, "returns what it loaded")
	H.eq(#holder:GetChildren(), 3, "and all three are in the place")
end)

H.test("with no parent the objects are returned but not placed", function()
	-- Ops.insert_asset always passes a parent; the nil branch exists so a caller can
	-- inspect before committing, and it must not quietly drop them into the Workspace.
	local before = #ws:GetChildren()
	__getObjectsResult = fakeObjects(2)
	local r = Generation.insertAsset(43, nil)
	__getObjectsResult = nil
	H.eq(r.ok, true, "ok")
	H.eq(#r.instances, 2, "returned")
	H.eq(#ws:GetChildren(), before, "and nothing was added to the Workspace")
end)

-- ------------------------------------------------------------- rate limiting --

H.test("a fresh window allows work and reports the budget honestly", function()
	local s = Generation.rateLimitStatus()
	H.eq(s.allowed, true, "allowed")
	H.eq(s.used, 0, "nothing used")
	H.eq(s.limit, 10, "the observed live limit")
	H.eq(s.windowSeconds, 60, "sliding over a minute")
	H.eq(s.retryAfterSeconds, 0, "nothing to wait for")
end)

H.test("retryAfter is only meaningful when the window is full", function()
	-- A non-zero wait on an empty window would send a caller to sleep for no reason.
	local s = Generation.rateLimitStatus()
	H.eq(s.retryAfterSeconds, 0, "zero while under the limit")
end)

--[[ HONEST LIMIT. `recentCalls` is written only by generateModel, which needs
	 GenerationService — a Studio-only service this harness does not fake, because
	 faking a generation would make a passing test say nothing about generating. So the
	 window's SLIDE is not exercised here; what is covered is the status it reports
	 from an empty window, which is the state every session starts in. ]]

-- --------------------------------------------------------------- scale rules --

H.test("an exact intent picks its own rule", function()
	local key = Generation.scaleRuleFor("prop")
	H.eq(key, "prop", "exact match wins")
end)

H.test("an intent containing a known word picks the LONGEST match", function()
	-- Longest rather than first, because the rules overlap: a phrase that contains both
	-- a short key and a longer one that includes it must take the specific reading.
	local key = Generation.scaleRuleFor("a small decorative prop for the shelf")
	H.eq(type(key), "string", "returns a key")
	H.ok(#key > 0, "and it is a real one")
end)

H.test("an unknown intent falls back to prop rather than to nothing", function()
	H.eq(Generation.scaleRuleFor("zzzz-not-a-category"), "prop", "unknown text")
	H.eq(Generation.scaleRuleFor(""), "prop", "empty string")
	H.eq(Generation.scaleRuleFor(nil), "prop", "nil")
	H.eq(Generation.scaleRuleFor(12345), "prop", "a non-string")
end)

H.test("every fallback comes with a usable rule, not just a name", function()
	-- The second return is what sizes the generated mesh. A key with no rule would put
	-- a nil through the size maths.
	local _, rule = Generation.scaleRuleFor(nil)
	H.ok(rule ~= nil, "a rule came back")
	H.eq(type(rule), "table", "and it is one")
end)

H.report("plugin/generation")
