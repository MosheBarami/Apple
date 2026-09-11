```luau
local ServerStorage = game:GetService("ServerStorage")

local COST = 500
local wallTemplate = ServerStorage:WaitForChild("Wall", 10)

local purchased = false
local connection: RBXScriptConnection? = nil

connection = button.Touched:Connect(function(hit: BasePart)
	if purchased then
		return
	end
	local character = hit.Parent
	if character == nil or character ~= owner.Character then
		return
	end
	local cash = owner.leaderstats.Cash
	if cash.Value < COST then
		return
	end
	-- The flag is claimed before the money moves. A single step across the button fires Touched
	-- once per limb per frame, and every one of those would otherwise re-enter and charge again.
	purchased = true
	cash.Value -= COST
	if connection then
		connection:Disconnect()
	end

	local wall = wallTemplate:Clone()
	wall.Parent = workspace
	button:Destroy()
end)
```
