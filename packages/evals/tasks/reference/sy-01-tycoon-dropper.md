```luau
local ServerStorage = game:GetService("ServerStorage")

local DROP_INTERVAL = 2
local DROP_VALUE = 5
local MAX_DROPS = 30

local template = ServerStorage:WaitForChild("Drop", 10)
local live: { BasePart } = {}

collector.Touched:Connect(function(hit: BasePart)
	local index = table.find(live, hit)
	if index == nil then
		return
	end
	-- Removed from the live list BEFORE the payout: Touched fires repeatedly for one contact, and
	-- without this the same drop pays out several times on its way through the collector.
	table.remove(live, index)
	hit:Destroy()
	owner.leaderstats.Cash.Value += DROP_VALUE
end)

task.spawn(function()
	while true do
		task.wait(DROP_INTERVAL)
		-- The cap is not cosmetic. An uncapped dropper on an idle tycoon is thousands of unanchored
		-- parts in the physics solver, which is what turns a tycoon server into a slideshow.
		if #live < MAX_DROPS then
			local drop = template:Clone()
			drop.CFrame = dropper.CFrame * CFrame.new(0, -2, 0)
			drop.Parent = workspace
			table.insert(live, drop)
		end
	end
end)
```
