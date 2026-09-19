-- Open only a disposable local proof place. Actual client rendering, no upload or provider call.
assert(game.PlaceId == 0, "The UI visual proof must remain unpublished")
local storage = game:GetService("ReplicatedStorage")
assert(storage:FindFirstChild("AppleUI") and storage:FindFirstChild("AppleUIProofTheme"),
    "Open the current isolated AppleUI proof place")
print("APPLE_UI_PLAY_STARTED", storage.AppleUIProofTheme.Value)
local result = game:GetService("StudioTestService"):ExecutePlayModeAsync({ appleUIVisualProof = true })
print("APPLE_UI_PLAY_ENDED " .. game:GetService("HttpService"):JSONEncode(result))
