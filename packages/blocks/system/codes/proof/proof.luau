-- PROOF ONLY (never shipped): a code pays once, any case; a wrong code pays nothing.
local Players = game:GetService("Players")
local Currency = require(game.ServerScriptService:WaitForChild("Currency"))
local Codes = require(game.ServerScriptService:WaitForChild("Codes"))
local player = Players:GetPlayers()[1] or Players.PlayerAdded:Wait()
repeat task.wait() until Currency.ready(player)
local c = Codes.CODES[1]
local before = Currency.get(player, c.currency)
assert(Codes.redeem(player, "definitely-not-a-code") == false, "a wrong code is refused")
assert(Codes.redeem(player, string.lower(c.code)) == true, "a right code in any case pays")
assert(Currency.get(player, c.currency) == before + c.amount, "it paid the amount")
task.wait(1.1)
assert(Codes.redeem(player, c.code) == false, "a code pays once")
print("STUDPILOT_PROOF_OK codes")
