-- PROOF ONLY (never shipped): the stage rule.
local Checkpoints = require(game.ServerScriptService:WaitForChild("Checkpoints"))
assert(Checkpoints.reach(1, 2, false) == 2, "the next checkpoint moves the stage on")
assert(Checkpoints.reach(1, 5, false) == nil, "skipping ahead is refused unless allowed")
assert(Checkpoints.reach(1, 5, true) == 5, "skipping ahead is allowed when set")
assert(Checkpoints.reach(4, 2, true) == nil, "an earlier checkpoint never moves the stage back")
assert(Checkpoints.number("Stage12") == 12 and Checkpoints.number("7") == 7 and Checkpoints.number("Lava") == nil, "names are numbered")
print("STUDPILOT_PROOF_OK checkpoints")
