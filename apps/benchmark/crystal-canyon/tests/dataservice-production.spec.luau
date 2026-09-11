--!nocheck
--!modules Config=shared/Config,CodeTable=server/CodeTable,Profile=server/Profile,DataService=server/DataService
--!studio false
--[[
	Crystal Canyon — DataService on a LIVE server.

	The module's header states the rule this file exists to enforce:

	  "The one deliberate softening is Studio ... A live server never does this: a silent
	   switch to 'not saving' in production is a worse outage than a kick."

	H2 was that the code did it anyway. `logDegraded` set `persistenceAvailable = false`
	with no Studio gate, from `init` when GetDataStore threw — which is exactly what a real
	DataStore outage looks like from inside a live server — after which every joiner was
	short-circuited to `state = "ready"` with a blank profile and `persist = false`. An
	empty save, handed out, played on, and never written back.

	`--!studio false` is load-bearing: RunService:IsStudio() is read once at module load, so
	production behaviour can only be tested by loading the module as production. That it
	could not be expressed before is part of why H2 survived.
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

-- ------------------------------------------------------- the outage at boot (H2)

H.test("a GetDataStore failure at boot does not hand out empty saves", function()
	__dataStoreService.__fail = true
	DataService.init({})

	local p = player("Joiner")
	join(p)

	-- The whole finding in one assertion: before the fix this was true, and the player
	-- was playable with a blank profile that would never be written.
	H.eq(DataService.isReady(p), false, "a player must NOT be playable when nothing can be saved")
	H.eq(DataService.get(p), nil, "and must not be handed a profile")
end)

H.test("that player is removed rather than left to earn nothing", function()
	__dataStoreService.__fail = true
	DataService.init({})

	local p = player("Kicked")
	join(p)

	H.eq(#p.__kicks, 1, "expected exactly one kick")
	H.ok(p.__kicks[1]:find("couldn't load"), "the message must explain, not just disconnect")
	H.ok(p.__kicks[1]:find("[Nn]othing has been lost"), "and must say the save is intact")
end)

H.test("the outage does not spare later joiners either", function()
	-- The old short-circuit made the SECOND player cheaper to get wrong than the first:
	-- it skipped the round trip entirely and went straight to a blank ready profile.
	__dataStoreService.__fail = true
	DataService.init({})

	for i = 1, 3 do
		local p = player("Joiner" .. i)
		join(p)
		H.eq(DataService.isReady(p), false, "joiner " .. i .. " must not be playable")
		H.eq(#p.__kicks, 1, "joiner " .. i .. " must be told why")
	end
end)

H.test("nothing is written while persistence is unavailable", function()
	__dataStoreService.__fail = true
	DataService.init({})
	local p = player("Silent")
	join(p)
	H.eq(DataService.save(p), false, "a failed session must never write")
	H.eq(DataService.save(p, true), false, "not even a final save")
end)

-- ------------------------------------------------------------- the healthy path

H.test("a reachable DataStore loads a profile and makes the player playable", function()
	__dataStoreService.__fail = false
	__store.__fail = false
	__store.__values = {}
	DataService.init({})

	local p = player("Healthy")
	join(p)

	H.eq(DataService.isReady(p), true, "a clean load must be playable")
	H.ok(DataService.get(p) ~= nil, "and must have a profile")
	H.eq(#p.__kicks, 0, "and must not be kicked")
end)

H.test("a loaded session writes, and the write survives a reload", function()
	__dataStoreService.__fail = false
	__store.__fail = false
	__store.__values = {}
	DataService.init({})

	local p = player("Saver")
	join(p)
	local profile = DataService.get(p)
	H.ok(profile ~= nil, "expected a profile")
	profile.coins = 1234

	H.eq(DataService.save(p, true), true, "a final save must reach the store")

	-- The stored envelope must carry the value, and must have released the lock.
	local key = Config.Store.KeyPrefix .. tostring(p.UserId)
	local stored = __store.__values[key]
	H.ok(stored ~= nil, "expected something written under " .. key)
	H.eq(stored.profile.coins, 1234, "the coins must be what was written")
	H.eq(stored.lock, nil, "a final save must release the session lock")
end)

-- ------------------------------------------------- the lock lost mid-session (H3)

local function loadedPlayer(name)
	__dataStoreService.__fail = false
	__store.__fail = false
	__store.__values = {}
	DataService.init({})
	local p = player(name)
	join(p)
	H.eq(DataService.isReady(p), true, "setup: expected a clean load")
	return p, Config.Store.KeyPrefix .. tostring(p.UserId)
end

--[[ Simulate another server legitimately taking the profile over: overwrite the stored
	 envelope with a fresh foreign lock. The next save's transform sees it and must decline
	 to write, because writing would resurrect a balance the player has moved past. ]]
local function stealLock(key, coins)
	__store.__values[key] = {
		profile = { coins = coins },
		lock = { jobId = "some-other-server", timestamp = os.time() },
	}
end

H.test("a save that finds a foreign lock does not write over it", function()
	local p, key = loadedPlayer("Stolen")
	DataService.get(p).coins = 999
	stealLock(key, 42)

	H.eq(DataService.save(p), false, "the save must decline")
	H.eq(__store.__values[key].profile.coins, 42, "the other server's copy must be untouched")
	H.eq(__store.__values[key].lock.jobId, "some-other-server", "and must still hold its lock")
end)

H.test("the player is removed rather than left earning into a discarded copy", function()
	-- H3: this used to set persist = false and return. The HUD kept crediting coins, the
	-- objective chain kept advancing, and every one of those was thrown away.
	local p, key = loadedPlayer("Ghost")
	stealLock(key, 42)
	DataService.save(p)

	H.eq(#p.__kicks, 1, "expected exactly one kick")
	H.ok(p.__kicks[1]:find("another server"), "the message must say where their save went")
	H.ok(p.__kicks[1]:find("[Nn]othing has been lost"), "and must reassure, since nothing was lost")
end)

H.test("the economy cannot credit a profile we no longer own", function()
	-- The kick is not instantaneous. get/isReady gate on state == "ready", so the session
	-- has to stop reading as ready the moment the lock is known lost, not when the player
	-- finally disconnects.
	local p, key = loadedPlayer("Uncredited")
	stealLock(key, 42)
	DataService.save(p)

	H.eq(DataService.isReady(p), false, "must not be ready after losing the lock")
	H.eq(DataService.get(p), nil, "and must hand out no profile for the economy to mutate")
end)

H.test("no further write is attempted after the lock is lost", function()
	local p, key = loadedPlayer("Quiet")
	stealLock(key, 42)
	DataService.save(p)

	local callsBefore = __store.__calls
	H.eq(DataService.save(p), false, "a later autosave must decline")
	H.eq(DataService.save(p, true), false, "and so must the final save")
	H.eq(__store.__calls, callsBefore, "neither may reach the DataStore at all")
end)

H.test("the loud warning is actually emitted", function()
	-- Several findings in FAILURES.md are "it failed silently". A refusal nobody can see in
	-- the logs is most of the way back to one.
	local before = #__warnings
	local p, key = loadedPlayer("Logged")
	stealLock(key, 42)
	DataService.save(p)

	local found = false
	for i = before + 1, #__warnings do
		if __warnings[i]:find("session lock is") then
			found = true
		end
	end
	H.ok(found, "expected a warning naming the lost lock")
end)

H.report("dataservice-production.spec")
