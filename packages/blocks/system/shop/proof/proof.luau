-- PROOF ONLY (never shipped): a purchase is refused without the money, succeeds with it, and only once.
local Players = game:GetService("Players")
local Currency = require(game.ServerScriptService:WaitForChild("Currency"))
local Shop = require(game.ServerScriptService:WaitForChild("Shop"))
local player = Players:GetPlayers()[1] or Players.PlayerAdded:Wait()
repeat task.wait() until Currency.ready(player)
local item = Shop.ITEMS[1]
Currency.spend(player, Shop.CURRENCY, Currency.get(player, Shop.CURRENCY), "proof: empty")
assert(Shop.buy(player, item.name) == false, "a purchase with no money is refused")
assert(Shop.buy(player, "not an item") == false, "an unknown item is refused")
Currency.grant(player, Shop.CURRENCY, item.price, "proof: fund")
task.wait(0.6)
assert(Shop.buy(player, item.name) == true, "a purchase with enough money succeeds")
assert(Currency.get(player, Shop.CURRENCY) == 0, "the price was charged")
task.wait(0.6)
if Shop.ONCE then assert(Shop.buy(player, item.name) == false, "an owned item is not sold twice") end
print("STUDPILOT_PROOF_OK shop")
