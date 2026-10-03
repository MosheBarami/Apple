--!nocheck
--!modules Config=shared/Config,CodeTable=server/CodeTable,Profile=server/Profile,Codes=server/Codes
--[[
	Crystal Canyon — promo code redemption, and the one code that changed its spelling.

	The 1000-coin code was GOLEM until the product was renamed APPLE. People redeemed it under the old
	name and their saves hold `codes.GOLEM = true`. A plain rename left two bugs: the same player could
	redeem APPLE as if it were new (+1000 coins a second time), and a loaded old save showed the code as
	unredeemed. The two spellings are ONE code (`Aliases` in CodeTable): either one redeems it, either
	one is refused once it has been redeemed under either, and an old save is folded in on load.

	A fresh Player stub is used for every attempt that follows another by the same player, because the
	redemption cooldown (Config.CodeInput.CooldownSeconds) is keyed by Player and is not what is under
	test here. Several stubs share one profile table, which is what "the same save, a new attempt" is.
]]

local profiles = {}
local granted = {}

local function setup()
	profiles = {}
	granted = {}
	Codes.init({
		Config = Config,
		Data = {
			isReady = function(p) return profiles[p] ~= nil end,
			get = function(p) return profiles[p] end,
		},
		Economy = {
			addCoins = function(p, n) table.insert(granted, n) end,
			push = function() end,
		},
	})
end

-- A new attempt on `profile` from a player who has not tried a code yet.
local function attempt(profile, code)
	local p = __player("Tester")
	profiles[p] = profile
	return Codes.redeem(p, code)
end

local function total()
	local sum = 0
	for _, n in granted do sum += n end
	return sum
end

H.test("the current spelling redeems once and only once", function()
	setup()
	local save = Profile.new()
	local ok, msg = attempt(save, "APPLE")
	H.eq(ok, true, "first APPLE")
	H.eq(msg, "Built by Apple.", "message")
	H.eq(total(), 1000, "coins after first")
	local again = attempt(save, "apple")
	H.eq(again, false, "second APPLE")
	H.eq(total(), 1000, "no second grant")
end)

H.test("the old spelling still redeems, and counts as the same code", function()
	setup()
	local save = Profile.new()
	local ok = attempt(save, "GOLEM")
	H.eq(ok, true, "GOLEM on a fresh save")
	H.eq(total(), 1000, "coins")
	H.eq(save.codes.APPLE, true, "recorded under the canonical id")
	H.eq(save.codes.GOLEM, nil, "the alias is not recorded as a second code")
	local second, msg = attempt(save, "APPLE")
	H.eq(second, false, "APPLE after GOLEM")
	H.eq(msg, "You already used that code.", "refusal message")
	H.eq(total(), 1000, "still one grant")
end)

H.test("the new spelling first blocks the old one the same way", function()
	setup()
	local save = Profile.new()
	H.eq(attempt(save, "APPLE"), true, "APPLE")
	local ok = attempt(save, " golem ")
	H.eq(ok, false, "GOLEM after APPLE (trimmed, any case)")
	H.eq(total(), 1000, "one grant")
end)

H.test("a player who redeemed GOLEM before the rename cannot redeem APPLE again", function()
	setup()
	-- What a pre-rename save looks like once it has been through Profile.sanitize on load.
	local old = Profile.new()
	old.codes = { GOLEM = true, WELCOME = true }
	local save = Profile.sanitize(old)
	H.eq(save.codes.APPLE, true, "folded into the canonical id on load")
	H.eq(save.codes.GOLEM, nil, "the alias key is dropped")
	H.eq(save.codes.WELCOME, true, "unrelated codes are untouched")
	H.eq(attempt(save, "APPLE"), false, "APPLE")
	H.eq(attempt(save, "GOLEM"), false, "GOLEM")
	H.eq(total(), 0, "nothing granted")
end)

H.test("an unredeemed save is not shown as redeemed", function()
	local save = Profile.sanitize(Profile.new())
	H.eq(save.codes.APPLE, nil, "APPLE")
	H.eq(save.codes.GOLEM, nil, "GOLEM")
end)

H.test("an alias is not a way to mint a code that does not exist", function()
	setup()
	local save = Profile.new()
	H.eq(attempt(save, "GOLEM2"), false, "near miss")
	H.eq(attempt(save, ""), false, "empty")
	H.eq(total(), 0, "nothing granted")
	local corrupt = Profile.sanitize({ codes = { GOLEM = "yes", APPLE = 1 } })
	H.eq(corrupt.codes.APPLE, nil, "only a literal true counts, alias or not")
end)

H.report("codes.spec")
