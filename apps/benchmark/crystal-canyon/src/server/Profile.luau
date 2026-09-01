--!strict
--[[
	Crystal Canyon — the profile schema, and the one place that decides what a
	corrupt save becomes.

	Pure data. No services, no yielding, no remotes. Everything here is a
	function of its arguments and Config, which is what lets DataService call
	`sanitize` on the way OUT of the game as well as on the way in.

	The contract this module exists to guarantee, for any input at all:

	  * the result is a legal ProfileData
	  * every numeric field is a non-negative integer
	  * every key is one Config declares; unknown ids are dropped
	  * zone index 1 is unlocked

	A caller downstream of `sanitize` never has to ask "but what if the save was
	garbage". That question is answered exactly once, here.
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.CrystalCanyon.Config)
local CodeTable = require(script.Parent.CodeTable)

local Profile = {}

export type ProfileData = {
	version: number,
	coins: number,
	shards: number,
	upgrades: { [string]: number },
	zones: { [string]: boolean },
	codes: { [string]: boolean },
	objectives: { [string]: number },
	stats: { collected: number, sold: number, playtime: number },
}

--[[ Schema version. There is deliberately no migration path: Config.Store.Name
	 carries a `_v1` suffix, so a breaking schema change gets a clean namespace
	 instead of a migration bug that silently halves everyone's coins. A profile
	 loaded with any other version number is coerced to this shape and stamped
	 with this version. ]]
Profile.Version = 1

--[[ 2^53 - 1: the largest integer a Lua number represents exactly. Past this,
	 `n + 1 == n` and the economy stops being able to count, so it is the
	 ceiling for every field rather than a number chosen for taste. ]]
local MAX_COUNT = 9007199254740991

local function asTable(value: any): { [any]: any }
	if type(value) == "table" then
		return value
	end
	return {}
end

--[[ Coerce anything to a non-negative integer, optionally capped.

	 Non-finite input (NaN, +inf, -inf) becomes 0, NOT the ceiling. That
	 asymmetry is deliberate: a corrupt save must never be a route to minting
	 currency. A player whose balance was eaten by corruption can be made whole
	 by a human looking at the DataStore version history; a player handed nine
	 quadrillion coins by a rounding accident cannot be un-handed them, and the
	 economy they broke belongs to everyone else too.

	 NaN is detected with `v ~= v` because it is the only value in the language
	 that is not equal to itself — comparing it against math.huge would not
	 catch it. ]]
local function count(value: any, max: number?): number
	if type(value) ~= "number" then
		return 0
	end
	if value ~= value then
		return 0
	end
	if value == math.huge or value == -math.huge then
		return 0
	end

	local n = math.floor(value)
	if n < 0 then
		n = 0
	end

	local ceiling = max or MAX_COUNT
	if n > ceiling then
		n = ceiling
	end
	return n
end

--[[ Coerce anything loaded from the DataStore into a legal profile.

	 Total by construction: it reads `raw` only through asTable/count, both of
	 which accept any value, so there is no input — nil, a string, a number, a
	 table of the wrong shape, a table with a hostile key — that can make this
	 throw or return something illegal. DataService relies on that; it calls
	 sanitize on values it has not inspected. ]]
function Profile.sanitize(raw: any): ProfileData
	local src = asTable(raw)

	-- Upgrades: iterate Config, not the save. Anything the save knows about
	-- that Config does not is dropped by never being looked at, and a level
	-- above MaxLevel or below 0 is clamped into range rather than rejected, so
	-- a tampered level degrades to "max" instead of costing the player the
	-- upgrade entirely.
	local rawUpgrades = asTable(src.upgrades)
	local upgrades: { [string]: number } = {}
	for _, upgrade in Config.Upgrades do
		upgrades[upgrade.Id] = count(rawUpgrades[upgrade.Id], upgrade.MaxLevel)
	end

	-- Zones: index 1 is the starting zone and is unlocked unconditionally, so a
	-- profile that lost its zone table still spawns into a playable game rather
	-- than a canyon it is locked out of.
	local rawZones = asTable(src.zones)
	local zones: { [string]: boolean } = {}
	for index, zone in Config.Zones do
		zones[zone.Id] = index == 1 or rawZones[zone.Id] == true
	end

	-- Codes are stored sparsely (only redeemed ones) because the set grows with
	-- every promo we ever run, while zones are a short fixed list the UI
	-- enumerates and therefore wants explicit false entries.
	--
	-- Consequence worth knowing: retiring a code from CodeTable forgets who
	-- redeemed it, so re-adding a retired code re-grants it to everyone. Ship a
	-- new code id instead of resurrecting an old one.
	local rawCodes = asTable(src.codes)
	local codes: { [string]: boolean } = {}
	for code in CodeTable do
		if rawCodes[code] == true then
			codes[code] = true
		end
	end

	-- Objective progress is capped at its own target: past the target the step
	-- is complete and the surplus means nothing, so carrying it forward only
	-- creates a number that can look absurd in a debug dump.
	local rawObjectives = asTable(src.objectives)
	local objectives: { [string]: number } = {}
	for _, objective in Config.Objectives do
		objectives[objective.Id] = count(rawObjectives[objective.Id], objective.Target)
	end

	local rawStats = asTable(src.stats)

	-- Carried shards are capped by the pack the player actually owns, computed
	-- from the levels sanitised above rather than from the raw save — otherwise
	-- a save claiming pack level 99 would raise the cap that is meant to
	-- constrain it.
	local capacity = Config.upgradeValue("pack", upgrades.pack or 0)

	return {
		version = Profile.Version,
		coins = count(src.coins),
		shards = count(src.shards, capacity),
		upgrades = upgrades,
		zones = zones,
		codes = codes,
		objectives = objectives,
		stats = {
			collected = count(rawStats.collected),
			sold = count(rawStats.sold),
			playtime = count(rawStats.playtime),
		},
	}
end

--[[ A fresh, legal profile.

	 It is literally "what sanitize makes of nothing", and that is the point:
	 one code path means the defaults a new player gets and the defaults a
	 corrupt save falls back to can never drift apart. Add a field to sanitize
	 and new players have it too, for free. ]]
function Profile.new(): ProfileData
	return Profile.sanitize(nil)
end

return Profile
