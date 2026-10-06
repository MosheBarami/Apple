-- Sliders drag, switches cycle through their words, and each choice is kept as an attribute on this screen named after
-- the setting (e.g. gui:GetAttribute("Music")). Written by StudPilot's setting-rows block; edit freely.
local UserInputService = game:GetService("UserInputService")
local gui = script.Parent
local list = gui:WaitForChild("Window"):WaitForChild("Content"):WaitForChild("Settings")
local function nameOf(row) return (row.Label.Text:gsub("^[^%w]*%s*", "")) end
for _, row in list:GetChildren() do
	if not row:IsA("Frame") then continue end
	local slider, switch = row:FindFirstChild("Slider"), row:FindFirstChild("Switch")
	if slider and slider.Visible then
		local fill, knob = slider.Fill, slider.Knob
		local function set(share)
			share = math.clamp(share, 0, 1)
			fill.Size = UDim2.new(share, 0, 1, 0)
			knob.Position = UDim2.new(share, 0, 0.5, 0)
			gui:SetAttribute(nameOf(row), share)
		end
		set(slider:GetAttribute("Value") or 0.5)
		local dragging = false
		knob.MouseButton1Down:Connect(function() dragging = true end)
		UserInputService.InputEnded:Connect(function(input)
			if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then dragging = false end
		end)
		UserInputService.InputChanged:Connect(function(input)
			if dragging and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
				set((input.Position.X - slider.AbsolutePosition.X) / slider.AbsoluteSize.X)
			end
		end)
	elseif switch and switch.Visible then
		local face = switch.Face
		local words = string.split(face:GetAttribute("States") or "On/Off", "/")
		local at = 1
		local function show()
			face.Text.Text = words[at]
			gui:SetAttribute(nameOf(row), words[at])
		end
		show()
		face.Activated:Connect(function()
			at = at % #words + 1
			show()
		end)
	end
end
