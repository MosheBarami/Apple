--!nocheck
--!modules Util=shared/Util
--[[
	Crystal Canyon — Util.comma and Util.round.

	comma is the only number formatter the HUD uses, so every balance a player ever
	sees passes through it. §4 of the style spec: "numbers are large and
	comma-separated (999,999,999)" and the HUD never truncates to "1B".
]]

H.test("groups in threes from the right", function()
	H.eq(Util.comma(0), "0")
	H.eq(Util.comma(5), "5")
	H.eq(Util.comma(999), "999")
	H.eq(Util.comma(1000), "1,000")
	H.eq(Util.comma(1001), "1,001")
	H.eq(Util.comma(12345), "12,345")
	H.eq(Util.comma(999999), "999,999")
	H.eq(Util.comma(1234567), "1,234,567")
end)

H.test("never truncates a large number", function()
	-- The style spec forbids "1B". Nine digits must render as nine digits.
	H.eq(Util.comma(999999999), "999,999,999")
	H.eq(Util.comma(1000000000), "1,000,000,000")
end)

H.test("truncates toward zero rather than rounding", function()
	H.eq(Util.comma(0.9), "0")
	H.eq(Util.comma(1000.9), "1,000")
	H.eq(Util.comma(-1000.9), "-1,000")
end)

H.test("carries the sign", function()
	H.eq(Util.comma(-1), "-1")
	H.eq(Util.comma(-1234), "-1,234")
	H.eq(Util.comma(-1234567), "-1,234,567")
end)

H.test("never renders negative zero (F-28)", function()
	-- A fraction between -1 and 0 truncates to zero magnitude. Emitting "-0" would
	-- put a number no player can reach on the HUD.
	H.eq(Util.comma(-0.5), "0")
	H.eq(Util.comma(-0.001), "0")
	H.eq(Util.comma(-0), "0")
end)

H.test("every comma position is a multiple of three from the right", function()
	-- Property check across a wide range, rather than trusting the examples above.
	for _, n in { 1, 12, 123, 1234, 12345, 123456, 1234567, 12345678, 123456789 } do
		local s = Util.comma(n)
		local digits = s:gsub(",", "")
		H.eq(#digits, #tostring(n), "no digits lost for " .. tostring(n))
		local tail = s:find(",")
		if tail then
			H.eq((#s - tail) % 4, 3, "comma spacing for " .. tostring(n))
		end
		H.ok(not s:match("^,") and not s:match(",$"), "no leading or trailing comma for " .. tostring(n))
	end
end)

H.test("round is half-up and honours places", function()
	H.eq(Util.round(2.4), 2)
	H.eq(Util.round(2.5), 3)
	H.eq(Util.round(2.6), 3)
	H.eq(Util.round(1.25, 1), 1.3)
	H.eq(Util.round(0), 0)
end)

H.test("rng forwards the seed unchanged", function()
	-- Roblox guarantees Random.new(seed) replays identically; that guarantee cannot be
	-- exercised outside Roblox, and a stub that replayed identically would only be
	-- testing the stub. What Util adds is the pass-through, so that is what is tested:
	-- the comment's claim ("a screenshot diff between two builds is a real signal")
	-- fails if the seed is mangled on the way in, which this catches.
	H.eq(Util.rng(12345).__seed, 12345, "seed must reach Random.new untouched")
	H.eq(Util.rng(0).__seed, 0, "zero is a seed like any other")
	H.eq(Util.rng(-7).__seed, -7, "no clamping or absolute value")
end)

H.report("util.spec")
