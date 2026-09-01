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
	Name = "CrystalCanyon_Profile_v1",
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
-- Server-only truth. The client never sees this table; it posts a string and
-- is told yes or no.
Config.Codes = {
	WELCOME = { Reward = { coins = 250 }, Message = "Welcome to the canyon!" },
	CANYON = { Reward = { coins = 500 }, Message = "The canyon rewards you." },
	GOLEM = { Reward = { coins = 1000 }, Message = "Built by Golem." },
}
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
