```luau
local ANIMATION_ID = "rbxassetid://1234567"

local humanoid = character:WaitForChild("Humanoid", 10)
local animator = humanoid and humanoid:WaitForChild("Animator", 10)

local animation = Instance.new("Animation")
animation.AnimationId = ANIMATION_ID

-- Loaded on the Animator. The equivalent call on the Humanoid is deprecated and does not replicate
-- the same way, which is why those tracks famously play for one client and for nobody else.
local track = animator and animator:LoadAnimation(animation)
if track then
	track.Looped = true
	track:Play()
end

local function stop()
	if track then
		track:Stop()
	end
end

return stop
```
