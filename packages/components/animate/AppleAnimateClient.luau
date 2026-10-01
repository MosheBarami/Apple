--!strict
-- AppleAnimate's client half: a real key press plays the clips bound to that key (play = "key"), so a keyboard in the
-- game types along with the player's own keyboard. Keys typed into a text box or a menu are not sent.
local UserInputService = game:GetService("UserInputService")
local remote = game:GetService("ReplicatedStorage"):WaitForChild("AppleAnimateKey") :: RemoteEvent
UserInputService.InputBegan:Connect(function(input, processed)
	if processed or input.UserInputType ~= Enum.UserInputType.Keyboard then return end
	remote:FireServer(input.KeyCode.Name)
end)

-- Every clip that plays is announced on AppleAnimatePlayed (for any screen that wants it, like a counter). With no
-- listener Roblox queues them and drops them by the thousand with an error each time (the owner's play session,
-- 2026-10-01: "invocation queue exhausted ... 1024 events dropped"), so this client always takes them.
local played = game:GetService("ReplicatedStorage"):WaitForChild("AppleAnimatePlayed", 10)
if played and played:IsA("RemoteEvent") then played.OnClientEvent:Connect(function() end) end
