```luau
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local equipTool = ReplicatedStorage:WaitForChild("EquipTool", 10)

equipTool.OnServerEvent:Connect(function(player, tool)
	-- A type check alone is not enough. Any Instance in the DataModel can be sent, including a tool
	-- sitting in someone else's Backpack, so ownership is the thing that actually has to be proven.
	if typeof(tool) ~= "Instance" or not tool:IsA("Tool") then
		return
	end
	local backpack = player:FindFirstChildOfClass("Backpack")
	if backpack == nil or tool.Parent ~= backpack then
		return
	end
	local character = player.Character
	if character == nil then
		return
	end
	tool.Parent = character
end)
```
