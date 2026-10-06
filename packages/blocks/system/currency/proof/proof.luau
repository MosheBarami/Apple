-- PROOF ONLY (never shipped): a server test of the currency rules. Run in a play test.
local Currency = require(game.ServerScriptService:WaitForChild("Currency"))
assert(Currency.afterSpend(100, 40) == 60, "a spend that can be afforded leaves the rest")
assert(Currency.afterSpend(30, 40) == nil, "a spend that cannot be afforded is refused")
assert(Currency.afterSpend(100, -5) == nil, "a negative spend is refused")
assert(Currency.afterSpend(100, 1.5) == nil, "a fractional spend is refused")
assert(Currency.afterGrant(10, 5) == 15 and Currency.afterGrant(10, -5) == 10, "a grant adds, a negative grant does nothing")
print("STUDPILOT_PROOF_OK currency")
