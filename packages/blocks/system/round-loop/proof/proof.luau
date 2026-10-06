-- PROOF ONLY (never shipped): only the players alive and still in the round win.
local Rounds = require(game.ServerScriptService:WaitForChild("Rounds"))
local a, b, c = { alive = true, inRound = true }, { alive = false, inRound = true }, { alive = true, inRound = false }
local w = Rounds.winners({ a, b, c }, function(p) return p.alive end, function(p) return p.inRound end)
assert(#w == 1 and w[1] == a, "the alive player in the round wins; the dead one and the one who left do not")
assert(Rounds.clock(83) == "1:23" and Rounds.clock(5) == "0:05", "times read m:ss")
print("STUDPILOT_PROOF_OK round-loop")
