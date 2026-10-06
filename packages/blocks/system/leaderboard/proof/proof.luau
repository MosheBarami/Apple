-- PROOF ONLY (never shipped): the published ranking appears.
local folder = game.ReplicatedStorage:WaitForChild("Leaderboard_" .. "Coins", 90)
assert(folder and folder:WaitForChild("Rank1", 90), "the top list was published")
print("STUDPILOT_PROOF_OK leaderboard")
