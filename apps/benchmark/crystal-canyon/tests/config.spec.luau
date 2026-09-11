--!nocheck
--!modules Config=shared/Config
--[[
	Crystal Canyon — Config invariants.

	Config is the single source of truth both the server and the client read, so an
	edit here is an economy change with no compiler to catch it. These tests assert
	the properties the module's own comments claim, because a comment that is not
	checked is a wish. Where a claim turned out to be false, the test states the
	claim and the fix follows it — see docs/FAILURES.md F-26..F-28.
]]

-- --------------------------------------------------------------- documented claims

H.test("session lock outlives the autosave interval, as Store's comment requires", function()
	-- "A lock older than this is treated as abandoned ... Must exceed AutosaveSeconds
	-- comfortably." If it did not, a live server would keep declaring its own lock
	-- stale and two servers could hold one profile.
	H.ok(
		Config.Store.SessionLockStaleSeconds > Config.Store.AutosaveSeconds * 2,
		"stale threshold must comfortably exceed the autosave interval"
	)
end)

H.test("zone 1 is free, as the Zones comment requires", function()
	-- "Order matters: index 1 is the starting zone and is always unlocked."
	H.eq(Config.Zones[1].UnlockCost, 0, "starting zone unlock cost")
end)

-- --------------------------------------------------------------- progression shape

H.test("every id is unique", function()
	local seen = {}
	for _, up in Config.Upgrades do
		H.ok(not seen[up.Id], "duplicate upgrade id " .. tostring(up.Id))
		seen[up.Id] = true
	end
	seen = {}
	for _, zone in Config.Zones do
		H.ok(not seen[zone.Id], "duplicate zone id " .. tostring(zone.Id))
		seen[zone.Id] = true
	end
end)

H.test("zone unlock cost and shard value both rise with depth", function()
	for i = 2, #Config.Zones do
		local prev, cur = Config.Zones[i - 1], Config.Zones[i]
		H.ok(cur.UnlockCost > prev.UnlockCost, cur.Id .. " must cost more than " .. prev.Id)
		H.ok(cur.ShardValue > prev.ShardValue, cur.Id .. " must pay more than " .. prev.Id)
	end
end)

H.test("zone bounds are well formed and do not overlap", function()
	-- Overlapping boxes would let one crystal belong to two zones, so a locked
	-- zone's crystals could be farmed from inside an unlocked one.
	for _, z in Config.Zones do
		H.ok(z.Bounds.Max.X > z.Bounds.Min.X, z.Id .. " bounds inverted on X")
		H.ok(z.Bounds.Max.Z > z.Bounds.Min.Z, z.Id .. " bounds inverted on Z")
		H.ok(z.CrystalCount > 0, z.Id .. " must contain crystals")
		H.ok(z.RespawnSeconds > 0, z.Id .. " respawn must be positive")
	end
	for i = 1, #Config.Zones do
		for j = i + 1, #Config.Zones do
			local a, b = Config.Zones[i], Config.Zones[j]
			local overlaps = a.Bounds.Min.X < b.Bounds.Max.X
				and b.Bounds.Min.X < a.Bounds.Max.X
				and a.Bounds.Min.Z < b.Bounds.Max.Z
				and b.Bounds.Min.Z < a.Bounds.Max.Z
			H.ok(not overlaps, a.Id .. " and " .. b.Id .. " bounds overlap")
		end
	end
end)

H.test("upgrades actually grow in both value and price", function()
	for _, up in Config.Upgrades do
		H.ok(up.MaxLevel >= 1, up.Id .. " must have at least one level to buy")
		H.ok(up.BaseCost > 0, up.Id .. " must cost something")
		H.ok(up.CostGrowth > 1, up.Id .. " price must grow, or later levels are free-ish")
		H.ok(up.PerLevel > 0, up.Id .. " must improve per level")
	end
end)

H.test("upgrade prices rise strictly with level", function()
	for _, up in Config.Upgrades do
		for lvl = 1, up.MaxLevel - 1 do
			local prev = Config.upgradeCost(up.Id, lvl - 1)
			local cur = Config.upgradeCost(up.Id, lvl)
			H.ok(cur > prev, string.format("%s: cost(%d) must exceed cost(%d)", up.Id, lvl, lvl - 1))
		end
	end
end)

H.test("max level is the signal to stop selling", function()
	for _, up in Config.Upgrades do
		H.eq(Config.upgradeCost(up.Id, up.MaxLevel), nil, up.Id .. " at max must have no price")
		H.ok(Config.upgradeCost(up.Id, up.MaxLevel - 1) ~= nil, up.Id .. " below max must have a price")
	end
end)

H.test("an unknown id has no price and no value", function()
	H.eq(Config.upgradeCost("no-such-upgrade", 0), nil)
	H.eq(Config.upgradeValue("no-such-upgrade", 0), 0)
	H.eq(Config.zoneById("no-such-zone"), nil)
	H.eq(Config.upgradeById("no-such-upgrade"), nil)
end)

-- ------------------------------------------------- corrupt levels (F-26, F-27)

H.test("a negative level is never a discount", function()
	-- upgradeValue clamps to [0, MaxLevel]; upgradeCost must clamp identically.
	-- Before the fix, cost("pack", -50) was 0 — a free upgrade for anyone who
	-- could get a negative level into a profile.
	for _, up in Config.Upgrades do
		local base = Config.upgradeCost(up.Id, 0)
		for _, lvl in { -1, -5, -50, -1e9 } do
			H.eq(Config.upgradeCost(up.Id, lvl), base, string.format("%s: cost(%s)", up.Id, tostring(lvl)))
		end
	end
end)

H.test("a non-finite level degrades to a legal value, as upgradeValue claims", function()
	-- "Clamped so a corrupt profile with an out-of-range level degrades to a legal
	-- value instead of an absurd one." NaN is out of range; math.clamp passes it
	-- through, so the claim needed an explicit guard to become true.
	local nan = 0 / 0
	for _, up in Config.Upgrades do
		for _, lvl in { nan, math.huge, -math.huge } do
			local v = Config.upgradeValue(up.Id, lvl)
			H.ok(v == v, up.Id .. ": value must never be NaN")
			H.ok(v >= up.BaseValue, up.Id .. ": value must not fall below base")
			H.ok(v <= up.BaseValue + up.PerLevel * up.MaxLevel, up.Id .. ": value must not exceed max")

			local c = Config.upgradeCost(up.Id, lvl)
			H.ok(c == nil or (c == c and c >= 0), up.Id .. ": cost must be nil or a real non-negative number")
		end
	end
end)

H.test("upgradeValue clamps a level above max", function()
	for _, up in Config.Upgrades do
		local ceiling = up.BaseValue + up.PerLevel * up.MaxLevel
		H.eq(Config.upgradeValue(up.Id, up.MaxLevel + 500), ceiling, up.Id .. " value ceiling")
	end
end)

-- --------------------------------------------------------------- anti-abuse shape

H.test("every rate limit permits a burst and refills", function()
	for name, limit in Config.RateLimits do
		H.ok(limit.Burst >= 1, name .. " burst must allow at least one call")
		H.ok(limit.RefillPerSecond > 0, name .. " must refill, or the bucket empties forever")
	end
end)

H.test("selling and collecting are bounded", function()
	H.ok(Config.Sell.CoinsPerShard > 0, "shards must be worth something")
	H.ok(Config.Sell.PadRadius > 0, "pad radius must be positive")
	H.ok(Config.Sell.CooldownSeconds > 0, "sell must have a cooldown")
	H.ok(Config.Collect.MaxPerTick > 0, "collection must permit progress")
	H.ok(Config.Collect.TickRate > 0, "the sweep must run")
	-- The comment calls MaxPerTick a guard "against a teleport exploit granting a
	-- whole zone at once", so it must be well below the smallest zone's crystal count.
	local smallest = math.huge
	for _, z in Config.Zones do
		smallest = math.min(smallest, z.CrystalCount)
	end
	H.ok(Config.Collect.MaxPerTick < smallest, "MaxPerTick must not permit a whole zone in one tick")
end)

H.test("every objective is reachable", function()
	for _, o in Config.Objectives do
		H.ok(o.Target >= 1, o.Id .. " target must be reachable")
		H.ok(#o.Text > 0, o.Id .. " needs display text")
	end
end)

-- ------------------------------------------------------------- what must NOT be here (M9)

H.test("no promo code table replicates to the client", function()
	-- Config is required by the client on boot, so anything in it is published. The code table
	-- used to be here behind a comment claiming "the client never sees this table". It lives in
	-- server/CodeTable.luau now, and this is the guard against it drifting back.
	H.eq(Config.Codes, nil, "Config must not carry the code table")
	for key, value in Config do
		if type(value) == "table" and type(key) == "string" then
			H.ok(
				not key:lower():find("code") or key == "CodeInput",
				"suspicious code-ish table on Config: " .. key
			)
		end
	end
end)

H.test("the input rule the client needs is still shared", function()
	-- The other half of M9: moving the secret must not take the client's trimming rule with
	-- it, or the code box stops matching what the server will accept.
	H.ok(Config.CodeInput.MaxLength >= 4, "the box must allow a real code")
	H.ok(Config.CodeInput.CooldownSeconds > 0, "and rate-limit guessing")
end)

H.report("config.spec")
