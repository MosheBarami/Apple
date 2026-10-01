--!strict
-- AppleAnimate's client half: a real key press plays the clips bound to that key (play = "key"), so a keyboard in the
-- game types along with the player's own keyboard. Keys typed into a text box or a menu are not sent.
local UserInputService = game:GetService("UserInputService")
local remote = game:GetService("ReplicatedStorage"):WaitForChild("AppleAnimateKey") :: RemoteEvent
UserInputService.InputBegan:Connect(function(input, processed)
	if processed or input.UserInputType ~= Enum.UserInputType.Keyboard then return end
	remote:FireServer(input.KeyCode.Name)
end)
