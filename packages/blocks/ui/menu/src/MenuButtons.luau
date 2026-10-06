-- A menu button whose Closes attribute is true hides the menu; one whose Action is open:<Screen> opens that screen's
-- window over the menu (its X brings the menu back). Written by StudPilot's menu block; edit freely.
local Players = game:GetService("Players")
local gui = script.Parent
local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")
for _, holder in gui:WaitForChild("Buttons"):GetChildren() do
	if not holder:IsA("Frame") then continue end
	local fill = holder:WaitForChild("Fill")
	if holder:GetAttribute("Closes") == true then fill.Activated:Connect(function() gui.Enabled = false end) end
	local target = string.match(holder:GetAttribute("Action") or "", "^open:(.+)$")
	if target then
		fill.Activated:Connect(function()
			local screen = playerGui:FindFirstChild(target)
			local window = screen and screen:FindFirstChild("Window")
			if screen then screen.Enabled = true end
			if window then window.Visible = true end
		end)
	end
end
