-- PROOF ONLY (never shipped): clicks faster than the cooldown pay nothing.
local Players = game:GetService("Players")
local Currency = require(game.ServerScriptService:WaitForChild("Currency"))
local ClickEarn = require(game.ServerScriptService:WaitForChild("ClickEarn"))
local player = Players:GetPlayers()[1] or Players.PlayerAdded:Wait()
repeat task.wait() until Currency.ready(player)
local before = Currency.get(player, ClickEarn.CURRENCY)
for _ = 1, 20 do ClickEarn.click(player) end
local paid = Currency.get(player, ClickEarn.CURRENCY) - before
assert(paid > 0, "a click pays")
assert(paid == ClickEarn.amount(player), "twenty instant clicks pay once")
print("STUDPILOT_PROOF_OK click-earn")
