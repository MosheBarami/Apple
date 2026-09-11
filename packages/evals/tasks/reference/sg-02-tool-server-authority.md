```luau
local Players = game:GetService("Players")

local tool = script.Parent
local handle = tool:WaitForChild("Handle", 10)

local DAMAGE = 25
local COOLDOWN = 1

local equipped = false
local lastHit: { [Instance]: number } = {}
local connection: RBXScriptConnection? = nil

-- Everything happens on the server and there is no remote at all, so there is nothing for an
-- executor to replay or forge. The client's only influence is where its character is standing.
local function onTouched(hit: BasePart)
	if not equipped then
		return
	end
	local character = hit.Parent
	local victim = character and character:FindFirstChildWhichIsA("Humanoid")
	if victim == nil or victim.Health <= 0 then
		return
	end
	local wielder = Players:GetPlayerFromCharacter(tool.Parent)
	if wielder ~= nil and character == wielder.Character then
		return
	end
	local now = os.clock()
	local previous = lastHit[victim]
	if previous ~= nil and now - previous < COOLDOWN then
		return
	end
	lastHit[victim] = now
	victim:TakeDamage(DAMAGE)
end

tool.Equipped:Connect(function()
	equipped = true
	if connection == nil then
		connection = handle.Touched:Connect(onTouched)
	end
end)

tool.Unequipped:Connect(function()
	equipped = false
	table.clear(lastHit)
end)
```
