-- PROOF ONLY (never shipped): owners get the perk, others do not.
local GamepassPerk = require(game.ServerScriptService:WaitForChild("GamepassPerk"))
assert(GamepassPerk.speedFor(true) == 16 * GamepassPerk.AMOUNT, "an owner walks faster")
assert(GamepassPerk.speedFor(false) == 16, "a non-owner walks at the normal speed")
print("STUDPILOT_PROOF_OK gamepass-perk")
