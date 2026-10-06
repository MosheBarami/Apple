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
		if type(v) == "string" then label.Text = v return end
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

-- Buttons: Action "open:<Screen>" toggles that screen's window, "fire:<Remote>" asks the server through that remote (the
-- answer shows briefly on the button), "pass:<id>" offers the gamepass.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local MarketplaceService = game:GetService("MarketplaceService")
for _, holder in gui.Top:WaitForChild("Buttons"):GetChildren() do
	local face = holder:FindFirstChild("Face")
	local action = face and face:GetAttribute("Action")
	if type(action) ~= "string" or action == "" then continue end
	local kind, target = string.match(action, "^(%a+):(.+)$")
	local label = face:FindFirstChild("Label")
	local busy = false
	face.Activated:Connect(function()
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
			local okCall, ok, message = pcall(function() return remote:InvokeServer() end)
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
