-- Currencies whose Stat names a player attribute follow it live (with a pop when it grows); tabs, tiles and offers run
-- their Action: open:<Screen> toggles that screen's window, fire:<Remote> asks the server (the answer flashes on the
-- label), pass:<id> offers the gamepass. Written by StudPilot's hud block; edit freely.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local MarketplaceService = game:GetService("MarketplaceService")
local TweenService = game:GetService("TweenService")
local player = Players.LocalPlayer
local gui = script.Parent
local function short(n)
	for _, u in { { 1e12, "T" }, { 1e9, "B" }, { 1e6, "M" }, { 1e3, "K" } } do
		if n >= u[1] * 10 then return (string.format("%.1f", n / u[1]):gsub("%.0$", "")) .. u[2] end
	end
	local s = tostring(math.floor(n))
	return (s:reverse():gsub("(%d%d%d)", "%1,"):reverse():gsub("^,", ""))
end
for _, line in gui:WaitForChild("Currencies"):GetChildren() do
	local stat = line:GetAttribute("Stat")
	local value = line:FindFirstChild("Value")
	if type(stat) ~= "string" or stat == "" or not value then continue end
	local prefix = string.match(value.Text, "^[^%d]*") or ""
	local last
	local function show()
		local v = player:GetAttribute(stat)
		if type(v) == "string" then value.Text = v return end
		if type(v) ~= "number" then return end
		value.Text = prefix .. short(v)
		if last and v > last then
			local pop = line:FindFirstChild("Pop") or Instance.new("UIScale")
			pop.Name = "Pop"
			pop.Parent = line
			pop.Scale = 1.15
			TweenService:Create(pop, TweenInfo.new(0.25, Enum.EasingStyle.Back), { Scale = 1 }):Play()
		end
		last = v
	end
	player:GetAttributeChangedSignal(stat):Connect(show)
	show()
end
local function run(holder, labelOf)
	local action = holder:GetAttribute("Action")
	if type(action) ~= "string" or action == "" then return end
	local kind, target = string.match(action, "^(%a+):(.+)$")
	local button = holder:FindFirstChild("Fill") or holder
	if not button:IsA("GuiButton") then
		button = Instance.new("TextButton")
		button.Name = "Press"
		button.BackgroundTransparency = 1
		button.Text = ""
		button.Size = UDim2.fromScale(1, 1)
		button.ZIndex = 20
		button:SetAttribute("StudKit", "hud.press")
		button.Parent = holder
	end
	local busy = false
	button.Activated:Connect(function()
		if kind == "open" then
			local screen = player.PlayerGui:FindFirstChild(target)
			local window = screen and screen:FindFirstChild("Window")
			if window then window.Visible = not window.Visible elseif screen then screen.Enabled = not screen.Enabled end
		elseif kind == "pass" then
			pcall(function() MarketplaceService:PromptGamePassPurchase(player, tonumber(target)) end)
		elseif kind == "fire" and not busy then
			local remote = ReplicatedStorage:FindFirstChild(target)
			if not remote then return end
			if remote:IsA("RemoteEvent") then remote:FireServer() return end
			busy = true
			local okCall, _, message = pcall(function() return remote:InvokeServer() end)
			local label = labelOf(holder)
			if label and okCall and type(message) == "string" then
				local was = label.Text
				label.Text = message
				task.wait(1.4)
				label.Text = was
			end
			busy = false
		end
	end)
end
for _, group in { "Tabs", "Tiles", "Offers" } do
	for _, holder in gui:WaitForChild(group):GetChildren() do
		if holder:IsA("Frame") then run(holder, function(h) return h:FindFirstChild("Label", true) end) end
	end
end
