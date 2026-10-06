-- A menu button whose Closes attribute is true hides the menu. Written by StudPilot's menu block; edit freely.
local gui = script.Parent
for _, button in gui:WaitForChild("Buttons"):GetDescendants() do
	if button:IsA("ImageButton") and button:GetAttribute("Closes") == true then
		button.Activated:Connect(function()
			gui.Enabled = false
		end)
	end
end
