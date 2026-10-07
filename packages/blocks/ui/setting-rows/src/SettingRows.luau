-- Sliders drag, switches cycle through their words, and each choice is kept as an attribute on this screen named after
-- the setting (e.g. gui:GetAttribute("Music")). Written by StudPilot's setting-rows block; edit freely.
local UserInputService = game:GetService("UserInputService")
local gui = script.Parent
local list = gui:WaitForChild("Window"):WaitForChild("Content"):WaitForChild("Settings")
for _, row in list:GetChildren() do
	local fill = row:IsA("Frame") and row:FindFirstChild("Fill")
	if not fill then continue end
	local name = fill.Label.Text
	local slider, switch = fill:FindFirstChild("Slider"), fill:FindFirstChild("Switch")
	if slider and slider.Visible then
		local bar = slider:FindFirstChild("Fill")
		local knob = slider:FindFirstChild("Knob")
		local function set(share)
			share = math.clamp(share, 0, 1)
			bar.Size = UDim2.new(share, 0, 1, 0)
			if knob then knob.Position = UDim2.new(share, 0, 0.5, 0) end
			gui:SetAttribute(name, share)
		end
		set(slider:GetAttribute("Value") or 0.5)
		local dragging = false
		slider.InputBegan:Connect(function(input)
			if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
				dragging = true
				set((input.Position.X - slider.AbsolutePosition.X) / slider.AbsoluteSize.X)
			end
		end)
		UserInputService.InputEnded:Connect(function(input)
			if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then dragging = false end
		end)
		UserInputService.InputChanged:Connect(function(input)
			if dragging and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
				set((input.Position.X - slider.AbsolutePosition.X) / slider.AbsoluteSize.X)
			end
		end)
	elseif switch and switch.Visible then
		local button = switch:FindFirstChild("Fill")
		local words = string.split(switch:GetAttribute("States") or "ON/OFF", "/")
		local at = table.find(words, button.Label.Text) or 1
		local function show() button.Label.Text = words[at]; gui:SetAttribute(name, words[at]) end
		show()
		button.Activated:Connect(function() at = at % #words + 1; show() end)
	end
end
