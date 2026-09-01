--!nocheck
--!modules Config=shared/Config,Profile=server/Profile
--[[
	`Profile.sanitize` — the function every save and every load passes through.

	The engineering review named it directly: "pure, total, and security-critical — it
	is trivially testable and untested." It is the boundary where a corrupt or hostile
	DataStore value becomes an in-memory profile, and the one place where getting a
	number wrong mints currency.

	The assertions that matter are the ASYMMETRIC ones. A corrupt value must fall to
	the floor, never to the ceiling: `math.huge` becoming MAX_COUNT would be a minting
	route, and NaN surviving into a comparison poisons every later check.
]]

-- ------------------------------------------------------------------ shape
H.test("a fresh profile has both currencies at zero", function()
	local p = Profile.new()
	H.eq(p.coins, 0, "coins")
	H.eq(p.shards, 0, "shards")
	H.eq(p.version, Profile.Version, "version")
end)

H.test("sanitize rebuilds from Config, so unknown keys are dropped by never being read", function()
	local dirty = Profile.new()
	dirty.upgrades["not_a_real_upgrade"] = 999
	dirty.zones["not_a_real_zone"] = true
	dirty.codes["not_a_real_code"] = true
	local clean = Profile.sanitize(dirty)
	H.eq(clean.upgrades["not_a_real_upgrade"], nil, "unknown upgrade")
	H.eq(clean.zones["not_a_real_zone"], nil, "unknown zone")
	H.eq(clean.codes["not_a_real_code"], nil, "unknown code")
end)

-- ------------------------------------------------------------------ the asymmetry
H.test("a non-finite currency falls to ZERO, never to the ceiling", function()
	for _, bad in { math.huge, -math.huge, 0 / 0 } do
		local p = Profile.new()
		p.coins = bad
		p.shards = bad
		local clean = Profile.sanitize(p)
		H.eq(clean.coins, 0, "coins from " .. tostring(bad))
		H.eq(clean.shards, 0, "shards from " .. tostring(bad))
	end
end)

H.test("NaN never survives sanitize — it would poison every later comparison", function()
	local p = Profile.new()
	p.coins = 0 / 0
	local clean = Profile.sanitize(p)
	H.ok(clean.coins == clean.coins, "coins must not be NaN after sanitize")
end)

H.test("a negative balance is floored at zero, not carried", function()
	local p = Profile.new()
	p.coins = -5000
	H.eq(Profile.sanitize(p).coins, 0, "negative coins")
end)

H.test("a fractional balance is integral after sanitize", function()
	local p = Profile.new()
	p.coins = 12.7
	local c = Profile.sanitize(p).coins
	H.eq(c, math.floor(c), "coins must be integral")
end)

H.test("a string where a number belongs does not become currency", function()
	local p = Profile.new()
	p.coins = "999999999" :: any
	local c = Profile.sanitize(p).coins
	H.ok(type(c) == "number", "coins must be a number")
	H.eq(c, 0, "a string balance is not credited")
end)

-- ------------------------------------------------------------------ totality
H.test("sanitize is total — it survives garbage without throwing", function()
	for _, junk in { {}, { coins = {} }, { upgrades = "no" }, { zones = 5 }, { codes = true } } do
		local ok = pcall(function()
			return Profile.sanitize(junk)
		end)
		H.ok(ok, "sanitize threw on " .. tostring(junk))
	end
end)

H.test("sanitize is idempotent — sanitising twice changes nothing", function()
	local once = Profile.sanitize(Profile.new())
	local twice = Profile.sanitize(once)
	H.eq(twice.coins, once.coins, "coins")
	H.eq(twice.shards, once.shards, "shards")
	H.eq(twice.version, once.version, "version")
end)

H.test("every upgrade Config declares is present and numeric after sanitize", function()
	local clean = Profile.sanitize({})
	for _, up in Config.Upgrades do
		local level = clean.upgrades[up.Id]
		H.ok(type(level) == "number", "upgrade " .. tostring(up.Id) .. " must be numeric")
		H.ok(level >= 0, "upgrade " .. tostring(up.Id) .. " must not be negative")
	end
end)

H.report("profile.spec")
