-- Counters whose Stat names a currency follow the player's balance (a player attribute the currency block keeps).
-- Written by StudPilot's hud block; edit freely.
local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local player = Players.LocalPlayer
local gui = script.Parent
local function short(n)
	local units = { { 1e12, "T" }, { 1e9, "B" }, { 1e6, "M" }, { 1e3, "K" } }
	for _, u in units do
		if n >= u[1] * 10 then return (string.format("%.1f", n / u[1]):gsub("%.0$", "")) .. u[2] end
	end
	local s = tostring(math.floor(n))
	return (s:reverse():gsub("(%d%d%d)", "%1,"):reverse():gsub("^,", ""))
end
for _, counter in gui:WaitForChild("Top"):WaitForChild("Counters"):GetChildren() do
	local stat = counter:GetAttribute("Stat")
	if type(stat) ~= "string" or stat == "" then continue end
	local label = counter:WaitForChild("Face"):WaitForChild("Value")
	local last = nil
	local function show()
		local v = player:GetAttribute(stat)
		if type(v) ~= "number" then return end
		label.Text = short(v)
		if last and v > last then
			local scale = counter:FindFirstChild("Pop") or Instance.new("UIScale")
			scale.Name = "Pop"
			scale.Parent = counter
			scale.Scale = 1.12
			TweenService:Create(scale, TweenInfo.new(0.25, Enum.EasingStyle.Back), { Scale = 1 }):Play()
		end
		last = v
	end
	player:GetAttributeChangedSignal(stat):Connect(show)
	show()
end
