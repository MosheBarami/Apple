--!nocheck
--!modules Config=shared/Config,Profile=server/Profile,DataService=server/DataService
--!studio true
--[[
	Crystal Canyon — DataService in STUDIO.

	The counterpart to dataservice-production.spec. The H2 fix makes an unreachable
	DataStore a kick, and the whole risk of that change is over-correcting into a game
	nobody can playtest. The module's header is explicit that this softening is deliberate:

	  "Studio has no DataStore access in many configurations, and a benchmark nobody can
	   playtest is worthless — so in Studio only, an unreachable DataStore degrades to an
	   in-memory profile and says so loudly, instead of kicking."

	Same module, same outage, opposite required behaviour. The only difference between this
	file and its sibling is the `--!studio` line.
]]

local function player(name)
	local p = __player(name)
	p.__kicks = {}
	p.Kick = function(_self, message)
		table.insert(p.__kicks, message)
	end
	return p
end

local function join(p)
	__playersService.PlayerAdded:Fire(p)
end

--[[ ORDER MATTERS HERE, and deliberately so.

	 `persistenceAvailable` is module-level state with no way back: a server that degrades
	 once stays degraded for its whole life, which is the correct behaviour and the reason
	 the warning is emitted exactly once rather than per player. A spec cannot un-degrade
	 the module without a reset hook, and adding a test-only hook to production code to make
	 the tests tidier would be a worse trade than ordering them.

	 So the healthy case runs FIRST, while persistence is still available, and everything
	 after it observes the one degradation this chunk will ever have. ]]

H.test("a REACHABLE DataStore in Studio still persists normally", function()
	-- Runs first, before anything degrades. The softening is for an unreachable store, not
	-- for Studio as such: a Studio session with API access must behave like production, or
	-- the benchmark never exercises the code that ships.
	__dataStoreService.__fail = false
	__store.__fail = false
	__store.__values = {}
	DataService.init({})

	local p = player("StudioWithApi")
	join(p)
	H.eq(DataService.isReady(p), true, "expected a clean load")
	DataService.get(p).coins = 777
	H.eq(DataService.save(p, true), true, "Studio with a working store must write")

	local stored = __store.__values[Config.Store.KeyPrefix .. tostring(p.UserId)]
	H.ok(stored ~= nil, "expected a written envelope")
	H.eq(stored.profile.coins, 777, "with the real value")
end)

H.test("a store that fails at LOAD time degrades, rather than kicking", function()
	-- A different path from the one below, and the only one that consults
	-- degradeToMemory's return value.
	--
	-- Boot-time unavailability (GetDataStore throws) degrades the whole server up front,
	-- after which onPlayerAdded short-circuits and never asks again. This is the other
	-- case: API access is granted, the handle is obtained, and the REQUEST is refused.
	-- The load then takes the `status == "error"` branch, which is where Studio's softening
	-- actually lives. Mutation testing found that nothing exercised it — see F-30.
	--
	-- Runs here, while persistenceAvailable is still true, because the short-circuit below
	-- would otherwise swallow it.
	__dataStoreService.__fail = false -- the handle is obtained...
	__store.__fail = true             -- ...and then every request is refused
	DataService.init({})

	local p = player("LoadFailed")
	join(p)

	H.eq(DataService.isReady(p), true, "Studio must degrade, not kick, on a refused load")
	H.ok(DataService.get(p) ~= nil, "and must hand over an in-memory profile")
	H.eq(#p.__kicks, 0, "and must not kick a playtester")
end)

H.test("an unreachable DataStore is playable in Studio", function()
	-- This is the call that degrades the module for the rest of the chunk.
	--
	-- BOTH flags, and the second is not redundant: the previous test already handed
	-- DataService a working store, and `store` is never cleared. Failing only
	-- GetDataStore would leave that cached store answering happily, and this test would
	-- pass while testing nothing. A mutation caught exactly that — see F-30.
	__dataStoreService.__fail = true
	__store.__fail = true
	DataService.init({})

	local p = player("Playtester")
	join(p)

	H.eq(DataService.isReady(p), true, "a playtest must still run")
	H.ok(DataService.get(p) ~= nil, "with a real in-memory profile")
	H.eq(#p.__kicks, 0, "and nobody gets kicked")
end)

H.test("it said so loudly", function()
	-- "and says so loudly" is in the module header. A degraded session that looks identical
	-- to a healthy one is how someone loses an hour of playtest progress and blames the
	-- game. Searched across the whole run because the warning fires once, at the moment of
	-- degradation, which was the previous test.
	local found = false
	for _, w in __warnings do
		if w:find("PERSISTENCE DEGRADED") and w:find("in%-memory") then
			found = true
		end
	end
	H.ok(found, "expected a PERSISTENCE DEGRADED warning naming the in-memory fallback")
end)

H.test("the in-memory profile is a legal fresh profile, not a stub", function()
	local p = player("Fresh")
	join(p)

	local profile = DataService.get(p)
	local expected = Profile.new()
	H.eq(profile.coins, expected.coins, "coins must start where a new profile starts")
	H.eq(profile.shards, expected.shards, "and so must shards")
	H.ok(profile.zones ~= nil, "and the zones table must exist, or Zones refuses everything")
	H.ok(profile.upgrades ~= nil, "and the upgrades table, or the shop cannot render")
end)

H.test("a degraded session writes nothing", function()
	local p = player("NoWrite")
	join(p)

	local before = __store.__calls
	DataService.get(p).coins = 5000
	H.eq(DataService.save(p), false, "an autosave must not claim to have written")
	H.eq(DataService.save(p, true), false, "nor the final save")
	H.eq(__store.__calls, before, "and nothing may reach the DataStore")
end)

H.test("the degradation is announced once, not once per player", function()
	-- Ten players joining a degraded server must not produce ten identical warnings; the
	-- one that matters would scroll away.
	local degraded = 0
	for _, w in __warnings do
		if w:find("PERSISTENCE DEGRADED") then
			degraded += 1
		end
	end
	H.eq(degraded, 1, "expected exactly one degradation warning for the whole session")
end)

H.report("dataservice-studio.spec")
