--!nocheck
--!modules Config=shared/Config,Util=shared/Util,Palette=shared/Palette,Zones=server/Zones
--[[
	Crystal Canyon — zone ownership.

	Zones.isUnlocked is the whole security boundary for zone content. The module's own
	header is explicit that the gate is decoration and this function is enforcement:
	"An exploiter can therefore walk into Frost Hollow whenever they like — and gain
	nothing, because Collect refuses to award a crystal in a zone this module says is
	locked." Everything below tests that sentence.

	What these tests do NOT cover: the gate's appearance. Workspace has no Canyon in this
	runtime, so prepareGates returns early by design — decoration is Studio's to prove.
	See H1 in docs/FAILURES.md.
]]

-- A profile store the spec drives directly, standing in for DataService.
local profiles = {}
local spent = {}

local function ctx()
	return {
		Config = Config,
		Util = Util,
		Remotes = __remotesFolder(),
		Data = {
			get = function(player) return profiles[player] end,
			isReady = function(player) return profiles[player] ~= nil end,
		},
		Economy = {
			-- Records the charge and answers whatever the spec set up. The real one is
			-- the atomic check-and-debit; what matters here is that Zones asks it and
			-- respects the answer, never that it reimplements the arithmetic.
			spendCoins = function(player, amount)
				table.insert(spent, { player = player, amount = amount })
				local p = profiles[player]
				if not p then return false end
				if (p.coins or 0) < amount then return false end
				p.coins -= amount
				return true
			end,
			push = function() end,
		},
	}
end

local function fresh()
	profiles = {}
	spent = {}
	local c = ctx()
	Zones.init(c)
	return c
end

local FREE = Config.Zones[1].Id
local PAID = Config.Zones[2].Id
local PAID_COST = Config.Zones[2].UnlockCost

-- ------------------------------------------------------------------ isUnlocked

H.test("the free zone is unlocked even with no profile at all", function()
	fresh()
	local p = __player("NoProfile")
	H.eq(Zones.isUnlocked(p, FREE), true, "starting zone must never be gated")
end)

H.test("a failed or in-flight load is never treated as ownership", function()
	-- The comment: "a failed load must never be treated as ownership." This is the
	-- difference between a DataStore outage costing the player access and costing the
	-- game its economy.
	fresh()
	local p = __player("Loading")
	H.eq(Zones.isUnlocked(p, PAID), false, "no profile must not unlock a paid zone")

	profiles[p] = { coins = 0 }
	H.eq(Zones.isUnlocked(p, PAID), false, "a profile with no zones table must not unlock")
end)

H.test("ownership must be exactly true, not merely truthy", function()
	-- A corrupt save could carry any value here. Only the boolean the game writes counts.
	fresh()
	local p = __player("Corrupt")
	for _, v in { 1, "true", "yes", {} } do
		profiles[p] = { coins = 0, zones = { [PAID] = v } }
		H.eq(Zones.isUnlocked(p, PAID), false, "truthy-but-not-true must not unlock")
	end
	profiles[p] = { coins = 0, zones = { [PAID] = true } }
	H.eq(Zones.isUnlocked(p, PAID), true, "the real value must unlock")
end)

H.test("a malformed zone id is refused rather than erroring", function()
	fresh()
	local p = __player("Hostile")
	profiles[p] = { coins = 999999, zones = {} }
	for _, id in { 42, {}, true, "", "../meadow", "no-such-zone" } do
		H.eq(Zones.isUnlocked(p, id), false, "unknown or malformed id must be locked")
	end
end)

-- ---------------------------------------------------------------------- unlock

H.test("an unaffordable unlock grants nothing", function()
	fresh()
	local p = __player("Broke")
	profiles[p] = { coins = PAID_COST - 1, zones = {} }

	local ok, reason = Zones.unlock(p, PAID)
	H.eq(ok, false, "must refuse")
	H.ok(reason and reason:find("NEED"), "reason must tell the player what it costs")
	H.eq(Zones.isUnlocked(p, PAID), false, "must not have granted the zone")
	H.eq(profiles[p].coins, PAID_COST - 1, "must not have taken any coins")
end)

H.test("an affordable unlock charges exactly the listed price", function()
	fresh()
	local p = __player("Rich")
	profiles[p] = { coins = PAID_COST + 100, zones = {} }

	local ok, reason = Zones.unlock(p, PAID)
	H.eq(ok, true, "must succeed")
	H.eq(reason, nil, "success carries no reason")
	H.eq(#spent, 1, "must charge exactly once")
	H.eq(spent[1].amount, PAID_COST, "must charge the listed price, not more or less")
	H.eq(profiles[p].coins, 100, "balance must be debited once")
	H.eq(Zones.isUnlocked(p, PAID), true, "the zone must now be owned")
end)

H.test("unlocking twice does not charge twice", function()
	fresh()
	local p = __player("Repeat")
	profiles[p] = { coins = PAID_COST * 3, zones = {} }

	H.eq(Zones.unlock(p, PAID), true)
	local ok, reason = Zones.unlock(p, PAID)
	H.eq(ok, false, "the second unlock must refuse")
	H.eq(reason, "ALREADY UNLOCKED")
	H.eq(#spent, 1, "the second attempt must not reach spendCoins")
end)

H.test("an unknown zone is refused before any charge", function()
	fresh()
	local p = __player("Prober")
	profiles[p] = { coins = 999999, zones = {} }
	for _, id in { "no-such-zone", 42, "" } do
		local ok, reason = Zones.unlock(p, id)
		H.eq(ok, false, "must refuse")
		H.eq(reason, "UNKNOWN ZONE")
	end
	H.eq(#spent, 0, "no probe may reach the wallet")
end)

H.test("unlocking before the profile lands is refused, not deferred", function()
	fresh()
	local p = __player("Early")
	local ok, reason = Zones.unlock(p, PAID)
	H.eq(ok, false)
	H.eq(reason, "STILL LOADING — TRY AGAIN")
	H.eq(#spent, 0, "must not charge against a profile that is not there")
end)

H.test("the free zone cannot be bought", function()
	-- It is already unlocked, so the sale would take coins for nothing.
	fresh()
	local p = __player("Wasteful")
	profiles[p] = { coins = 999999, zones = {} }
	local ok, reason = Zones.unlock(p, FREE)
	H.eq(ok, false)
	H.eq(reason, "ALREADY UNLOCKED")
	H.eq(#spent, 0, "must not charge for a free zone")
end)

-- ------------------------------------------------------- the published gate state

H.test("refresh publishes a state for every zone, locked ones included", function()
	-- H1: this half works. The attribute is published for every zone on every refresh,
	-- with `false` being a real published value rather than an absence — a client cannot
	-- distinguish "locked" from "never told" unless the server says false out loud.
	fresh()
	local p = __player("Fresh")
	profiles[p] = { coins = 0, zones = {} }
	Zones.refresh(p)

	for _, zone in Config.Zones do
		local published = p:GetAttribute("zone_" .. zone.Id)
		H.eq(type(published), "boolean", zone.Id .. " must publish a boolean, not nil")
	end
	H.eq(p:GetAttribute("zone_" .. FREE), true)
	H.eq(p:GetAttribute("zone_" .. PAID), false)
end)

H.test("a successful unlock republishes the gate state", function()
	fresh()
	local p = __player("Buyer")
	profiles[p] = { coins = PAID_COST, zones = {} }
	Zones.refresh(p)
	H.eq(p:GetAttribute("zone_" .. PAID), false, "locked before the purchase")

	Zones.unlock(p, PAID)
	H.eq(p:GetAttribute("zone_" .. PAID), true, "unlocked immediately after, with no respawn")
end)

H.test("a refused unlock does not republish an optimistic state", function()
	fresh()
	local p = __player("Hopeful")
	profiles[p] = { coins = 0, zones = {} }
	Zones.refresh(p)
	Zones.unlock(p, PAID)
	H.eq(p:GetAttribute("zone_" .. PAID), false, "a failed purchase must leave the gate shut")
end)

H.report("zones.spec")
