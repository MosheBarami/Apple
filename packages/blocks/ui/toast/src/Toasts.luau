-- Popups that stack in a corner. A leaderstat going up shows "+N Name"; other LocalScripts can call
-- gui.Notify:Fire(icon, text). The samples made in Studio are the look; the first is the template. Written by
-- StudPilot's toast block; edit freely.
local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local gui = script.Parent
local stack = gui:WaitForChild("Stack")
local SECONDS = gui:GetAttribute("Seconds") or 3.5
local corner = gui:GetAttribute("Corner") or "bottom-right"
local right = corner ~= "bottom-left"
local top = corner == "top-right"
stack.AnchorPoint = Vector2.new(right and 1 or 0, top and 0 or 1)
stack.Position = UDim2.new(right and 1 or 0, right and -16 or 16, top and 0 or 1, top and 90 or -16)
stack:FindFirstChildOfClass("UIListLayout").VerticalAlignment = top and Enum.VerticalAlignment.Top or Enum.VerticalAlignment.Bottom

local template = stack:WaitForChild("Toast1"):Clone()
for _, child in stack:GetChildren() do
	if child:IsA("Frame") then child:Destroy() end
end

local notify = Instance.new("BindableEvent")
notify.Name = "Notify"
notify.Parent = gui
local order = 0
notify.Event:Connect(function(icon, text)
	order += 1
	local toast = template:Clone()
	toast.Name = "Toast"
	toast.LayoutOrder = top and order or -order
	toast.Face.IconBubble.Icon.Text = tostring(icon or "⭐")
	toast.Face.Text.Text = tostring(text or "")
	local scale = Instance.new("UIScale")
	scale.Scale = 0.6
	scale.Parent = toast
	toast.Parent = stack
	TweenService:Create(scale, TweenInfo.new(0.25, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = 1 }):Play()
	task.delay(SECONDS, function()
		local fade = TweenService:Create(scale, TweenInfo.new(0.2), { Scale = 0 })
		fade:Play()
		fade.Completed:Wait()
		toast:Destroy()
	end)
	local list = {}
	for _, t in stack:GetChildren() do if t:IsA("Frame") then table.insert(list, t) end end
	if #list > 5 then table.sort(list, function(a, b) return math.abs(a.LayoutOrder) < math.abs(b.LayoutOrder) end); list[1]:Destroy() end
end)

local ICONS = { coin = "💰", cash = "💵", gem = "💎", win = "🏆", kill = "⚔", level = "⭐", xp = "⭐" }
local function iconFor(name)
	local lower = string.lower(name)
	for key, icon in ICONS do if string.find(lower, key, 1, true) then return icon end end
	return template.Face.IconBubble.Icon.Text
end
local function watch(stat)
	if not (stat:IsA("IntValue") or stat:IsA("NumberValue")) then return end
	local last = stat.Value
	stat.Changed:Connect(function(now)
		local gained = now - last
		last = now
		if gained > 0 then notify:Fire(iconFor(stat.Name), ("+%s %s"):format(tostring(math.floor(gained * 100 + 0.5) / 100), stat.Name)) end
	end)
end
task.spawn(function()
	local leaderstats = Players.LocalPlayer:WaitForChild("leaderstats", 60)
	if not leaderstats then return end
	for _, stat in leaderstats:GetChildren() do watch(stat) end
	leaderstats.ChildAdded:Connect(watch)
end)
