--!strict
--[[
	Crystal Canyon — single source of truth for every tunable.

	Nothing in this game may hardcode an economy number, a colour, a size or a
	string that belongs here. Server and client both read this module, which is
	what keeps the HUD's prices honest: the client renders the same table the
	server charges against, so a UI can never advertise a price the server will
	not accept.

	Balance intent for the vertical slice (measured against a ~6 minute session):
	  0:00  spawn, collect ~25 shards, first sell  -> ~50 coins
	  1:00  first Pack upgrade
	  2:30  Speed 1 + Magnet 1
	  5:00  Frost Hollow unlock at 2,500 coins
]]

local Config = {}

Config.GameName = "CRYSTAL CANYON"
Config.Version = "1.0.0"

-- DataStore ---------------------------------------------------------------
-- The suffix is part of the key namespace on purpose: bumping it is how a
-- breaking profile change gets a clean slate instead of a migration bug.
Config.Store = {
	Name = "CrystalCanyon_Profile_v2",
	KeyPrefix = "plr_",
	AutosaveSeconds = 60,
	-- A lock older than this is treated as abandoned (server crashed, no
	-- BindToClose). Must exceed AutosaveSeconds comfortably.
	SessionLockStaleSeconds = 180,
	MaxRetries = 4,
	RetryBaseSeconds = 0.5,
}

-- Currencies --------------------------------------------------------------
Config.Currency = {
	Shards = { Id = "shards", Display = "SHARDS", Short = "Shards" },
	Coins = { Id = "coins", Display = "COINS", Short = "Coins" },
}

-- Upgrades ----------------------------------------------------------------
-- value(level) is the effective stat AT that level. Level 0 is the base state
-- every new player has. cost(level) is the price to go from `level` to
-- `level + 1`, so cost(MaxLevel) is never charged.
Config.Upgrades = {
	{
		Id = "pack",
		Name = "PACK SIZE",
		Blurb = "Carry more shards before you have to sell.",
		Icon = "pack",
		MaxLevel = 12,
		BaseValue = 25,
		PerLevel = 15,
		BaseCost = 50,
		CostGrowth = 1.6,
		Unit = "shards",
	},
	{
		Id = "speed",
		Name = "MOVE SPEED",
		Blurb = "Run the canyon faster.",
		Icon = "speed",
		MaxLevel = 8,
		BaseValue = 16,
		PerLevel = 2,
		BaseCost = 75,
		CostGrowth = 1.7,
		Unit = "studs/s",
	},
	{
		Id = "magnet",
		Name = "MAGNET",
		Blurb = "Pull crystals in from further away.",
		Icon = "magnet",
		MaxLevel = 10,
		BaseValue = 7,
		PerLevel = 2,
		BaseCost = 100,
		CostGrowth = 1.8,
		Unit = "studs",
	},
}

-- Zones -------------------------------------------------------------------
-- Order matters: index 1 is the starting zone and is always unlocked.
Config.Zones = {
	{
		Id = "meadow",
		Name = "SUNNY MEADOW",
		UnlockCost = 0,
		ShardValue = 1,
		CrystalCount = 18,
		RespawnSeconds = 4,
		-- Crystals are scattered inside this axis-aligned box, y is the ground.
		Bounds = { Min = Vector3.new(-96, 4, 60), Max = Vector3.new(96, 4, 210) },
		CrystalColor = Color3.fromRGB(120, 220, 255),
		AccentColor = Color3.fromRGB(95, 201, 74),
	},
	{
		Id = "frost",
		Name = "FROST HOLLOW",
		UnlockCost = 2500,
		ShardValue = 5,
		CrystalCount = 16,
		RespawnSeconds = 5,
		Bounds = { Min = Vector3.new(-96, 4, -215), Max = Vector3.new(96, 4, -70) },
		CrystalColor = Color3.fromRGB(180, 150, 255),
		AccentColor = Color3.fromRGB(150, 130, 235),
	},
}

-- The shop ----------------------------------------------------------------
--[[ ONE AXIS, ONE PANEL.

	 UPGRADES owns every permanent stat this game has — pack capacity, walk speed, magnet
	 radius. NOTHING HERE MAY MOVE ONE OF THOSE, temporarily or otherwise. A timed "MAGNET
	 SURGE" sitting beside an upgrade called "MAGNET" is the upgrades list again with a clock
	 bolted on, and that is precisely the defect this table exists to fix: the two panels used
	 to sell the same three `Config.Upgrades` entries at the same prices through the same
	 remote, and `Hud.luau` even lit both nav badges from one boolean because there was nothing
	 else the SHOP tile could have been about.

	 That reservation looks like it shrinks the shop to nothing. It does the opposite: it forces
	 the shop off the stat sheet entirely and onto UTILITY and COSMETICS, which is the one place
	 the two panels can never converge again. `config.spec.luau` asserts it rather than trusting
	 this comment.

	 The test that separates them is VERBS. Upgrades has one — buy a level. Shop has three (buy,
	 use, equip) and two nouns upgrades does not have (a stock count, an equipped state).

	 Everything here is bought with COINS. §1 of the owner's ruling is explicit that this
	 benchmark introduces no Robux and no paid monetisation. ]]
Config.Shop = {
	Consumables = {
		{
			Id = "flare",
			Name = "SIGNAL FLARE",
			Blurb = "Burn one to call the trader. Sells your whole pack where you stand — worth most deep in the canyon.",
			Icon = "flare",
			--[[ 60 coins, derived rather than picked. The flare attacks the loop's dominant
				 friction, which is not a stat: the walk back to the pad. The sell pad is at
				 (32, -12) and the meadow's centroid is about (0, 135), so a round trip is
				 roughly 300 studs — about 19 s at base WalkSpeed 16 — and nothing in
				 `Config.Upgrades` shortens it. Pack size raises what you carry per trip, not
				 the trip.

				 Valued against H4's MEASURED 0.40 crystals/s rather than the sweep comment's
				 estimated 1.8: that trip is worth ~15 coins in the meadow at level 0 and ~76 in
				 Frost, where shards are worth 5. So 60 sits deliberately ABOVE its early-meadow
				 value and BELOW its Frost value — a bad buy on minute one, a clear buy once you
				 are deep. That is the right shape for a convenience item: never mandatory,
				 never a trap. The card copy says so out loud. ]]
			Cost = 60,
			--[[ Bounds the profile field, and gives BUY a dead state ("STOCKED") that is not
				 the same sentence as UPGRADES' "MAX". ]]
			MaxStock = 5,
		},
	},
	--[[ Bought once, owned forever, one equipped at a time.

		 Colours are taken FROM THE WORLD, per the HUD's standing rule that nothing in this
		 interface is a colour invented for a menu. Two of the three reference
		 `Config.Zones[n].CrystalColor` by expression rather than by re-typed literal, so a
		 trail can never drift from the crystal it is named after.

		 Prices: 250 lands inside the first session, which is the point of having a cosmetic at
		 all; 700 sits after the first few upgrades; 1,500 is 60 % of the Frost unlock and
		 deliberately not 2,000+, where the top trail would sit right under the zone price and
		 push the scripted 5:00 Frost beat past 7:00. All three together (2,450) come to just
		 under one zone unlock, which is the intended read — the whole cosmetic set costs about
		 one zone. ]]
	Trails = {
		{ Id = "dust", Name = "DUST TRAIL", Blurb = "Canyon dust, kicked up behind you.", Icon = "trail", Cost = 250, Color = Color3.fromRGB(232, 211, 169) },
		{ Id = "crystal", Name = "CRYSTAL TRAIL", Blurb = "A meadow-shard shimmer.", Icon = "trail", Cost = 700, Color = Config.Zones[1].CrystalColor },
		{ Id = "frost", Name = "FROST TRAIL", Blurb = "Frost Hollow, in your wake.", Icon = "trail", Cost = 1500, Color = Config.Zones[2].CrystalColor },
	},
}

-- Selling -----------------------------------------------------------------
Config.Sell = {
	CoinsPerShard = 2,
	-- Server-side proximity check. The client never asserts where it is; the
	-- server measures. Generous enough to be forgiving, tight enough that it
	-- cannot be used to sell from across the map.
	PadRadius = 12,
	CooldownSeconds = 0.35,
}

-- Collection --------------------------------------------------------------
Config.Collect = {
	-- Server tick rate for the proximity sweep. 10 Hz is imperceptible to a
	-- player and keeps the sweep cost trivial at this crystal count.
	TickRate = 10,
	-- Guards against a teleport exploit granting a whole zone at once.
	MaxPerTick = 3,
}

-- Codes -------------------------------------------------------------------
-- The code TABLE is deliberately not here: this module replicates to every client, so a
-- list living here is a published list. It is in server/CodeTable.luau. See M9.
--
-- What stays is the input rule, because the client has to know it: the code box trims to
-- MaxLength so the interface never promises something the server will refuse.
Config.CodeInput = {
	MaxLength = 24,
	CooldownSeconds = 1.5,
}

-- Onboarding --------------------------------------------------------------
-- A short, physical objective chain. Each step is satisfied by a server fact,
-- never by the client claiming it did the thing.
Config.Objectives = {
	{ Id = "collect", Text = "COLLECT 25 SHARDS", Target = 25 },
	{ Id = "sell", Text = "SELL AT THE GOLD PAD", Target = 1 },
	{ Id = "upgrade", Text = "BUY ANY UPGRADE", Target = 1 },
}

-- Anti-abuse --------------------------------------------------------------
-- Token bucket per player per remote. Burst is what a human can produce by
-- mashing; Refill is the sustained rate.
Config.RateLimits = {
	Purchase = { Burst = 6, RefillPerSecond = 2 },
	Sell = { Burst = 6, RefillPerSecond = 3 },
	Code = { Burst = 4, RefillPerSecond = 0.5 },
	Unlock = { Burst = 4, RefillPerSecond = 1 },
	--[[ BuyItem and UseItem both spend, so they take Purchase's rate. Equip spends nothing and
		 is limited only against flooding.

		 WORTH SAYING BECAUSE A READER WILL ASSUME OTHERWISE: `Net.takeToken` keys its buckets by
		 REMOTE NAME and only reads its parameters through `LIMIT_KEY`. Two remotes mapping to
		 `Item` therefore get two INDEPENDENT buckets that happen to have identical parameters —
		 not one shared bucket. Spending a BuyItem token does not slow UseItem down. ]]
	Item = { Burst = 6, RefillPerSecond = 2 },
	Equip = { Burst = 8, RefillPerSecond = 3 },
}

-- Derived helpers ---------------------------------------------------------

function Config.upgradeById(id: string)
	for _, up in Config.Upgrades do
		if up.Id == id then
			return up
		end
	end
	return nil
end

function Config.zoneById(id: string)
	for _, zone in Config.Zones do
		if zone.Id == id then
			return zone
		end
	end
	return nil
end

function Config.trailById(id: string)
	for _, trail in Config.Shop.Trails do
		if trail.Id == id then
			return trail
		end
	end
	return nil
end

function Config.consumableById(id: string)
	for _, item in Config.Shop.Consumables do
		if item.Id == id then
			return item
		end
	end
	return nil
end

--[[ Returns `(entry, kind)` where kind is "consumable" or "trail", so `Shop` can branch once
	 instead of searching both tables at every call site — and so a future third product
	 category is one row here rather than a new lookup at five call sites. ]]
function Config.shopItemById(id: string): (any?, string?)
	local item = Config.consumableById(id)
	if item then
		return item, "consumable"
	end
	local trail = Config.trailById(id)
	if trail then
		return trail, "trail"
	end
	return nil, nil
end

--[[ Coerce a level from an untrusted profile into [0, max].

	 math.clamp alone is not enough: it passes NaN straight through, so the old
	 `math.clamp(math.floor(level), 0, MaxLevel)` returned NaN for a NaN level and
	 the "degrades to a legal value" promise below was false. Non-finite input is
	 handled explicitly, and NaN is detected with `v ~= v` because it is the only
	 value that is not equal to itself.

	 +inf saturates to max and -inf to 0, which is what a clamp means; NaN carries
	 no magnitude at all, so it becomes 0 — the same asymmetry Profile.count makes,
	 and for the same reason: corruption must never be a route to a better outcome
	 than the player earned. ]]
local function levelIn(level: any, max: number): number
	if type(level) ~= "number" or level ~= level then
		return 0
	end
	if level == math.huge then
		return max
	end
	if level == -math.huge then
		return 0
	end
	return math.clamp(math.floor(level), 0, max)
end

--[[ Effective stat value at a level. Clamped so a corrupt profile with an
	 out-of-range level degrades to a legal value instead of an absurd one. ]]
function Config.upgradeValue(id: string, level: number): number
	local up = Config.upgradeById(id)
	if not up then
		return 0
	end
	return up.BaseValue + up.PerLevel * levelIn(level, up.MaxLevel)
end

--[[ Price to go from `level` to `level + 1`. Returns nil at max level, which
	 is the signal every caller uses to render "MAX" and refuse the purchase. ]]
function Config.upgradeCost(id: string, level: number): number?
	local up = Config.upgradeById(id)
	if not up then
		return nil
	end
	-- The same clamp upgradeValue uses. Without the lower bound, a negative level
	-- priced the next upgrade at CostGrowth^level of base — cost("pack", -50) was
	-- 0, a free upgrade for anyone who could get a negative level into a profile.
	-- Profile.sanitize floors levels at 0, so this is defence in depth; it is here
	-- because the guarantee lived in a different module than the arithmetic.
	local lvl = levelIn(level, up.MaxLevel)
	if lvl >= up.MaxLevel then
		return nil
	end
	return math.floor(up.BaseCost * (up.CostGrowth ^ lvl))
end

return Config
