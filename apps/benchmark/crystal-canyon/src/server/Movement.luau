--!strict
--[[
	Crystal Canyon — is that step physically possible?

	## Why this exists

	`Collect`'s sweep used to justify itself like this:

	  "MaxPerTick is the teleport guard. A client that flings itself across a zone can put
	   every crystal inside its magnet radius in a single frame; capping the awards per tick
	   means such a jump pays out at the same rate as walking."

	The second half is false, and the first half is what makes it false. A per-tick cap
	bounds how many crystals you collect *per tick*. What bounds a walking player is not the
	tick — it is the time spent travelling between crystals. Crystals are scattered with a
	minimum separation of 9 studs, so at the base 16 studs/s a walking player arrives at
	roughly 1.8 crystals a second. A teleporting client pays no travel time at all and
	collects the full `MaxPerTick` on every tick: 3 × 10 Hz = 30 a second. The cap was never
	the binding constraint for the exploit it was named after.

	This module supplies the constraint that actually binds: distance. A player who covered
	more ground than their own top speed permits did not walk there.

	## What it deliberately does not do

	It does not punish. `Collect` skips the awards for that one tick and leaves the crystals
	standing, so a false positive costs a legitimate player a tenth of a second and nothing
	else, while a teleporter — who trips it on every hop — collects nothing. Making the
	penalty severe would invert that trade: the cheat is repeated and survives a few misses,
	whereas a laggy player only needs to be wrong about once to be robbed.

	It measures HORIZONTAL distance only. Falling is vertical and legitimately far faster
	than any walk speed; including Y would flag every player who stepped off a ledge.
]]

local Movement = {}

--[[ Headroom over the entitled speed. Slopes, knockback, a launch pad, and a server that
	 sampled two ticks late all move a player faster than a flat-ground walk. ]]
local SPEED_TOLERANCE = 1.6

--[[ An additional studs/second allowance on top of that, so the check does not sit right on
	 the boundary for a player who is simply walking. Expressed as a speed rather than a flat
	 distance on purpose: a fixed slack would be divided by the tick interval into an enormous
	 permitted velocity — 2.5 studs of slack on a 0.1 s tick is 25 studs/s of free movement,
	 more than the base walk speed, and a teleporter would simply hop in slack-sized steps. ]]
local EXTRA_SPEED = 8

--[[ A floor, in studs, for a tick so short that the computed allowance rounds to nothing.
	 Without it a burst of two samples in the same millisecond would flag a stationary
	 player. ]]
local MIN_ALLOWANCE = 1

--[[ Did the player cover more ground than their own top speed permits?

	 `dx` and `dz` are the horizontal displacement since the last sample, `dt` the time
	 between samples, and `speed` the walk speed the SERVER believes the player is entitled
	 to — from their upgrades, never from `Humanoid.WalkSpeed`, which the client owns and can
	 therefore inflate to widen its own allowance.

	 A non-positive or non-finite `dt` yields false: there is no interval to judge against,
	 and refusing to guess is the safe direction for a check whose false positives fall on
	 innocent players. ]]
function Movement.isImpossibleStep(dx: number, dz: number, dt: number, speed: number): boolean
	if dt ~= dt or dt <= 0 or dt == math.huge then
		return false
	end

	-- A corrupt or hostile speed must not widen the allowance. Anything not a real,
	-- non-negative number is treated as zero entitlement, which leaves MIN_ALLOWANCE.
	local entitled = if type(speed) == "number" and speed == speed and speed > 0 and speed ~= math.huge
		then speed
		else 0

	local allowance = math.max((entitled * SPEED_TOLERANCE + EXTRA_SPEED) * dt, MIN_ALLOWANCE)

	-- Squared comparison: no sqrt, and this runs per player per tick.
	local movedSq = dx * dx + dz * dz
	if movedSq ~= movedSq then
		-- A NaN coordinate is not a legal position. Refusing the award is correct here, in
		-- the other direction from the dt guard above: dt comes from the server's clock,
		-- but a position comes from a physics state the client influences.
		return true
	end

	return movedSq > allowance * allowance
end

--[[ Exposed for the tests and for anyone reasoning about the balance: the top horizontal
	 speed, in studs/second, that a player entitled to `speed` may sustain without tripping
	 the check. Sustained rather than instantaneous, because MIN_ALLOWANCE only matters for
	 vanishingly short ticks. ]]
function Movement.sustainableSpeed(speed: number): number
	return speed * SPEED_TOLERANCE + EXTRA_SPEED
end

return Movement
