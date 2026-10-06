-- A menu button whose Closes attribute is true hides the menu. Written by StudPilot's menu block; edit freely.
local gui = script.Parent
for _, holder in gui:WaitForChild("Buttons"):GetChildren() do
	if holder:IsA("Frame") and holder:GetAttribute("Closes") == true then
		holder:WaitForChild("Fill").Activated:Connect(function() gui.Enabled = false end)
	end
end
