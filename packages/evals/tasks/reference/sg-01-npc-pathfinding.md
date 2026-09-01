```luau
local PathfindingService = game:GetService("PathfindingService")

local humanoid = npc:WaitForChild("Humanoid", 10)
local root = npc:WaitForChild("HumanoidRootPart", 10)

-- ComputeAsync throws on an unreachable or malformed request, and an unprotected throw here kills
-- the whole NPC script — the NPC then stands still for the rest of the server's life.
local function computePath()
	local path = PathfindingService:CreatePath({ AgentRadius = 2, AgentCanJump = true })
	local ok, err = pcall(function()
		path:ComputeAsync(root.Position, goal.Position)
	end)
	if not ok then
		warn(`path computation failed: {err}`)
		return nil
	end
	if path.Status ~= Enum.PathStatus.Success then
		return nil
	end
	return path
end

local function walk()
	local path = computePath()
	if path == nil then
		task.wait(1)
		return
	end
	local blocked = false
	local connection = path.Blocked:Connect(function()
		blocked = true
	end)
	for _, waypoint in path:GetWaypoints() do
		if blocked then
			break
		end
		if waypoint.Action == Enum.PathWaypointAction.Jump then
			humanoid.Jump = true
		end
		humanoid:MoveTo(waypoint.Position)
		-- MoveToFinished, not a fixed sleep: a guessed duration either wastes time on short hops or
		-- cuts long ones short, and the NPC drifts further off the path with every waypoint.
		if not humanoid.MoveToFinished:Wait() then
			break
		end
	end
	connection:Disconnect()
end

task.spawn(function()
	while true do
		walk()
		task.wait(0.5)
	end
end)
```
