--!strict
--[[ Crystal Canyon — small shared helpers. Deliberately tiny; anything with a
	 policy decision in it belongs in a service, not here. ]]

local Util = {}

--[[ §4 of the style spec: numbers are large and comma-separated (999,999,999).
	 Big numbers are part of the fantasy, so the HUD never truncates to "1B". ]]
function Util.comma(n: number): string
	local whole = tostring(math.floor(math.abs(n)))
	local out = ""
	local count = 0
	for i = #whole, 1, -1 do
		out = whole:sub(i, i) .. out
		count += 1
		if count % 3 == 0 and i > 1 then
			out = "," .. out
		end
	end
	return (n < 0 and "-" or "") .. out
end

--[[ Deterministic scatter. A seeded RNG means the world builder produces the
	 same canyon every run, so a screenshot diff between two builds is a real
	 signal rather than noise from random placement. ]]
function Util.rng(seed: number): Random
	return Random.new(seed)
end

function Util.round(n: number, places: number?): number
	local m = 10 ^ (places or 0)
	return math.floor(n * m + 0.5) / m
end

return Util
