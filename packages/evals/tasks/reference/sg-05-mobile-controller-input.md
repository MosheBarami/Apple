```luau
local ContextActionService = game:GetService("ContextActionService")
local Players = game:GetService("Players")

local ACTION = "Sprint"
local BASE_SPEED = 16
local SPRINT_SPEED = 26

local player = Players.LocalPlayer

local function currentHumanoid()
	local character = player.Character
	return character and character:FindFirstChildWhichIsA("Humanoid") or nil
end

local function onSprint(_actionName: string, state: Enum.UserInputState)
	local humanoid = currentHumanoid()
	if humanoid == nil then
		return Enum.ContextActionResult.Pass
	end
	if state == Enum.UserInputState.Begin then
		humanoid.WalkSpeed = SPRINT_SPEED
	elseif state == Enum.UserInputState.End or state == Enum.UserInputState.Cancel then
		humanoid.WalkSpeed = BASE_SPEED
	end
	return Enum.ContextActionResult.Sink
end

-- One bind, three input devices, and the `true` is what creates the on-screen button. A KeyCode-only
-- binding does not degrade on a phone or a gamepad, it simply does not exist there — and those are
-- most of the sessions this game will ever get.
ContextActionService:BindAction(ACTION, onSprint, true, Enum.KeyCode.LeftShift, Enum.KeyCode.ButtonL2)
ContextActionService:SetTitle(ACTION, "Sprint")

script.Destroying:Connect(function()
	ContextActionService:UnbindAction(ACTION)
end)
```
