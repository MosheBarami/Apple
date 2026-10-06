-- Toasts: a leaderstat going up shows "+N Name" sliding in from the right; other LocalScripts can call
-- gui.Notify:Fire(text). The first sample made in Studio is the template. Written by StudPilot's toast block; edit freely.
local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local gui = script.Parent
local stack = gui:WaitForChild("Stack")
local SECONDS = gui:GetAttribute("Seconds") or 3.5
local template = stack:WaitForChild("Toast1"):Clone()
for _, child in stack:GetChildren() do if child:IsA("Frame") then child:Destroy() end end
local notify = Instance.new("BindableEvent")
notify.Name = "Notify"
notify.Parent = gui
local order = 0
notify.Event:Connect(function(text)
	order += 1
	local toast = template:Clone()
	toast.Name = "Toast"
	toast.LayoutOrder = order
	toast.Fill.Text.Text = tostring(text or "")
	toast.Parent = stack
	local fill = toast.Fill
	fill.Position = UDim2.new(1.2, 0, 0, 0)
	TweenService:Create(fill, TweenInfo.new(0.3, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Position = UDim2.new(0, 0, 0, 0) }):Play()
	task.delay(SECONDS, function()
		local out = TweenService:Create(fill, TweenInfo.new(0.25), { Position = UDim2.new(1.2, 0, 0, 0) })
		out:Play()
		out.Completed:Wait()
		toast:Destroy()
	end)
end)
local function watch(stat)
	if not (stat:IsA("IntValue") or stat:IsA("NumberValue")) then return end
	local last = stat.Value
	stat.Changed:Connect(function(now)
		local gained = now - last
		last = now
		if gained > 0 then notify:Fire(("+%s %s"):format(tostring(math.floor(gained * 100 + 0.5) / 100), stat.Name)) end
	end)
end
task.spawn(function()
	local leaderstats = Players.LocalPlayer:WaitForChild("leaderstats", 60)
	if not leaderstats then return end
	for _, stat in leaderstats:GetChildren() do watch(stat) end
	leaderstats.ChildAdded:Connect(watch)
end)
