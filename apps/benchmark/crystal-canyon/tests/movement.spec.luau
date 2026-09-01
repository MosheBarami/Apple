--!nocheck
--!modules Config=shared/Config,Movement=server/Movement
--[[
	Crystal Canyon — the teleport check.

	H4: MaxPerTick bounds a tick, not a round trip, so a teleporting client banked
	3 crystals × 10 Hz = 30/s against a walking player's ~1.8/s. This module supplies the
	constraint that actually binds, and these tests come in two halves:

	  * it must not fire on a player who is simply playing — false positives fall on
	    innocent people, and a check nobody trusts gets deleted;
	  * it must not be evadable by a cheater who knows it is there, which is the half a
	    naive threshold test would miss entirely.
]]

local TICK = 1 / Config.Collect.TickRate
local BASE = Config.upgradeValue("speed", 0)
local TOP = Config.upgradeValue("speed", 99) -- clamped to max level

-- ------------------------------------------------------- it must not fire on real play

H.test("a player walking at their entitled speed is never flagged", function()
	for _, speed in { BASE, TOP } do
		for _, dt in { TICK, TICK * 2, 0.5, 1.0 } do
			local d = speed * dt
			H.eq(Movement.isImpossibleStep(d, 0, dt, speed), false, "straight line at exactly top speed")
			H.eq(Movement.isImpossibleStep(0, d, dt, speed), false, "the other axis must behave the same")
			H.eq(
				Movement.isImpossibleStep(d * 0.7071, d * 0.7071, dt, speed),
				false,
				"diagonal at top speed is the same speed"
			)
		end
	end
end)

H.test("a standing player is never flagged, however short the tick", function()
	for _, dt in { TICK, 0.001, 1e-9 } do
		H.eq(Movement.isImpossibleStep(0, 0, dt, BASE), false, "standing still at dt=" .. tostring(dt))
	end
end)

H.test("headroom covers being pushed faster than a flat walk", function()
	-- Slopes, knockback, a conveyor. Anything at or under the sustainable speed passes.
	local speed = BASE
	local sustainable = Movement.sustainableSpeed(speed)
	H.ok(sustainable > speed, "the allowance must exceed a plain walk, or every slope trips it")
	H.eq(Movement.isImpossibleStep(sustainable * TICK * 0.99, 0, TICK, speed), false, "just under")
end)

H.test("a server hitch is judged over the interval it actually covers", function()
	-- If the sweep skips half a second, the player legitimately moved half a second's worth.
	-- An allowance that did not scale with dt would flag every player after any hitch.
	local speed = BASE
	for _, dt in { 0.5, 1.0, 3.0 } do
		H.eq(Movement.isImpossibleStep(speed * dt, 0, dt, speed), false, "hitch of " .. tostring(dt) .. "s")
	end
end)

H.test("a faster player is allowed to be faster", function()
	-- The check reads the entitlement from upgrades, so buying Speed must widen it.
	local far = BASE * 3 * TICK
	H.eq(Movement.isImpossibleStep(far, 0, TICK, BASE), true, "too far for an unupgraded player")
	H.eq(Movement.isImpossibleStep(far, 0, TICK, TOP), false, "but fine for a fully upgraded one")
end)

-- --------------------------------------------------------------- it must catch the cheat

H.test("a zone-length hop is flagged", function()
	-- The exploit: appear at a distant cluster, collect, appear at the next.
	local zone = Config.Zones[1]
	local width = zone.Bounds.Max.X - zone.Bounds.Min.X
	local depth = zone.Bounds.Max.Z - zone.Bounds.Min.Z
	H.eq(Movement.isImpossibleStep(width, 0, TICK, TOP), true, "across the zone in one tick")
	H.eq(Movement.isImpossibleStep(0, depth, TICK, TOP), true, "and the long way too")
	-- Even a hop between neighbouring crystals is beyond a tick's walk.
	H.eq(Movement.isImpossibleStep(9, 0, TICK, BASE), true, "one MIN_GAP in a single tick")
end)

H.test("a cheater who steps just under the threshold is still bounded", function()
	-- The test a plain threshold check would miss. Someone who knows the limit will hop the
	-- largest step that passes, every tick. That is fine ONLY if the resulting sustained
	-- speed is bounded — which is what makes this a speed limit rather than a step limit.
	local speed = BASE
	local step = 0
	-- Largest passing step at this tick length, found by bisection.
	local lo, hi = 0, 10000
	for _ = 1, 60 do
		local mid = (lo + hi) / 2
		if Movement.isImpossibleStep(mid, 0, TICK, speed) then
			hi = mid
		else
			lo = mid
		end
	end
	step = lo
	local sustained = step / TICK
	H.ok(
		sustained <= Movement.sustainableSpeed(speed) * 1.001,
		string.format("evading in small hops yields %.1f studs/s, above the %.1f cap",
			sustained, Movement.sustainableSpeed(speed))
	)
	-- And that cap must actually be near walking pace, not a formality.
	H.ok(sustained < speed * 3, string.format("%.1f studs/s is more than 3x a %.1f walk", sustained, speed))
end)

H.test("the crystal rate a cheater can sustain is close to a walker's", function()
	-- The number H4 is about. A walking player meets a crystal every MIN_GAP studs at most;
	-- so does a hopping one, once the hop is speed-limited. Before this module the hopper
	-- got MaxPerTick every tick regardless of distance.
	local MIN_GAP = 9
	local walker = BASE / MIN_GAP
	local hopper = Movement.sustainableSpeed(BASE) / MIN_GAP
	local perTickCap = Config.Collect.MaxPerTick * Config.Collect.TickRate
	H.ok(hopper / walker < 3, string.format("hopper %.2f/s vs walker %.2f/s", hopper, walker))
	H.ok(
		perTickCap / walker > 10,
		string.format("sanity: the old per-tick cap alone allowed %.1fx a walker", perTickCap / walker)
	)
end)

-- ------------------------------------------------------------------- hostile inputs

H.test("a nonsense interval never flags anyone", function()
	-- No interval means nothing to judge against, and refusing to guess is the safe
	-- direction for a check whose false positives land on innocent players.
	local nan = 0 / 0
	for _, dt in { 0, -1, -1e9, nan, math.huge } do
		H.eq(Movement.isImpossibleStep(1e9, 1e9, dt, BASE), false, "dt=" .. tostring(dt))
	end
end)

H.test("a hostile speed cannot widen the allowance", function()
	-- Humanoid.WalkSpeed belongs to the client, so the caller passes the entitlement from
	-- the profile. If a corrupt value reached here anyway it must not buy anything.
	local nan = 0 / 0
	for _, speed in { nan, math.huge, -1e9, "fast", nil, {} } do
		H.eq(
			Movement.isImpossibleStep(500, 0, TICK, speed),
			true,
			"500 studs in one tick must be impossible for speed=" .. tostring(speed)
		)
	end
end)

H.test("a NaN position is refused, unlike a NaN interval", function()
	-- Deliberately the opposite direction from the dt guard: dt comes from the server's
	-- clock, a position comes from a physics state the client influences.
	local nan = 0 / 0
	H.eq(Movement.isImpossibleStep(nan, 0, TICK, BASE), true, "NaN dx")
	H.eq(Movement.isImpossibleStep(0, nan, TICK, BASE), true, "NaN dz")
end)

H.test("direction never matters, only distance", function()
	local d = BASE * 6
	for _, pair in { { d, 0 }, { -d, 0 }, { 0, d }, { 0, -d }, { -d, -d } } do
		H.eq(
			Movement.isImpossibleStep(pair[1], pair[2], TICK, BASE),
			true,
			"a big step is a big step whichever way it points"
		)
	end
end)

H.report("movement.spec")
