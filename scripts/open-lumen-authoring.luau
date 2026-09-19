-- Main-owned local review only; no publication, provider work or remote writes.
assert(game.PlaceId == 0, "Lumen review stays unpublished")
assert(workspace:FindFirstChild("LumenAuthoringMarker"), "Open the isolated Lumen place")
print("LUMEN_AUTHORING_OPEN", game:GetService("ServerScriptService"):FindFirstChild("LumenGame") ~= nil)
