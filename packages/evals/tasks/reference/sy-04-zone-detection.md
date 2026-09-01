```luau
local Players = game:GetService("Players")

local SAMPLE_INTERVAL = 0.2

-- Built once, outside the loop. Rebuilding OverlapParams per sample allocates on every tick, and
-- the query is bounded by the zone's own volume rather than by the size of the workspace.
local params = OverlapParams.new()
params.FilterType = Enum.RaycastFilterType.Exclude
params.FilterDescendantsInstances = { zone }

local inside: { [Player]: boolean } = {}

task.spawn(function()
	while true do
		local present: { [Player]: boolean } = {}
		for _, part in workspace:GetPartBoundsInBox(zone.CFrame, zone.Size, params) do
			local character = part.Parent
			local player = character and Players:GetPlayerFromCharacter(character)
			if player then
				present[player] = true
			end
		end
		for player in present do
			if not inside[player] then
				inside[player] = true
				print(`{player.Name} entered`)
			end
		end
		for player in inside do
			if not present[player] then
				inside[player] = nil
				print(`{player.Name} left`)
			end
		end
		task.wait(SAMPLE_INTERVAL)
	end
end)
```
