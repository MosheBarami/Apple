-- The action button asks the server through the remote named by its Fires attribute and flashes the answer.
-- Written by StudPilot's progress-panel block; edit freely.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local gui = script.Parent
local action = gui:WaitForChild("Window"):WaitForChild("Content"):WaitForChild("Progress"):WaitForChild("Action")
local fires = action:GetAttribute("Fires")
local fill = action:WaitForChild("Fill")
local busy = false
fill.Activated:Connect(function()
	local remote = type(fires) == "string" and fires ~= "" and ReplicatedStorage:FindFirstChild(fires)
	if busy or not remote then return end
	busy = true
	local okCall, _, message = pcall(function() return remote:InvokeServer() end)
	if okCall and type(message) == "string" then
		local was = fill.Label.Text
		fill.Label.Text = message
		task.wait(1.4)
		fill.Label.Text = was
	end
	busy = false
end)
