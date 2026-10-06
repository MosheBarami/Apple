-- PROOF ONLY (never shipped): the streak rules, as pure functions of the saved day and today.
local Daily = require(game.ServerScriptService:WaitForChild("Daily"))
assert(Daily.next(nil, 0, 100) == 1, "a first claim is day 1")
assert(Daily.next(99, 3, 100) == 4, "the next day continues the streak")
assert(Daily.next(97, 3, 100) == 1, "a missed day starts again")
assert(Daily.next(100, 3, 100) == nil, "a second claim the same day is refused")
assert(Daily.amount(#Daily.REWARDS + 5) == Daily.REWARDS[#Daily.REWARDS], "after the last day the last amount repeats")
print("STUDPILOT_PROOF_OK daily-reward")
