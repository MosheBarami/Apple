--!strict
--[[
	AppleUpgradesClient: makes the studded upgrades screen work and feel alive. The money counter rolls to its new value
	and throws a "+N" when money comes in; the Upgrades button pops the panel open and its red X closes it; every card
	shows its level badge and next price and buys on its Buy button, with a till and a chime when it works and a shake
	when it cannot. Names come from ReplicatedStorage.AppleUpgradesConfig (screen, counter, button, panel, sounds; cards
	are named by upgrade id).
]]
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local SoundService = game:GetService("SoundService")
local TweenService = game:GetService("TweenService")
local RunService = game:GetService("RunService")
local player = Players.LocalPlayer
local config = require(ReplicatedStorage:WaitForChild("AppleUpgradesConfig")) :: any
local buy = ReplicatedStorage:WaitForChild("AppleUpgradeBuy") :: RemoteFunction
local currency = config.currency or "Coins"
-- What is printed before a price: the game's own symbol (none unless the config gives one).
local symbolPrefix = if type(config.symbol) == "string" and config.symbol ~= "" then config.symbol .. " " else ""

local function cost(u: any, level: number): number
	return math.floor(u.cost * (u.growth or 1.5) ^ level + 0.5)
end

local function short(n: number): string
	for _, s in { { 1e12, "T" }, { 1e9, "B" }, { 1e6, "M" }, { 1e3, "K" } } do
		if n >= s[1] then return (string.format("%.1f", n / s[1]):gsub("%.0$", "")) .. s[2] end
	end
	return tostring(math.floor(n))
end

local sounds: { [string]: Sound } = {}
for name, id in config.sounds or {} do
	if type(id) == "string" and id ~= "" then
		local s = Instance.new("Sound")
		s.Name = "AppleUpgrades_" .. name
		s.SoundId = id
		s.Volume = 0.5
		s.Parent = SoundService
		sounds[name] = s
	end
end
local function play(name: string)
	local s = sounds[name]
	if s then SoundService:PlayLocalSound(s) end
end

local function scaleOf(gui: Instance): UIScale
	local scale = gui:FindFirstChild("Pop") or Instance.new("UIScale")
	scale.Name = "Pop"
	scale.Parent = gui
	return scale :: UIScale
end

local function pop(gui: Instance, size: number?)
	if not gui:IsA("GuiObject") then return end
	local scale = scaleOf(gui)
	scale.Scale = size or 1.12
	TweenService:Create(scale, TweenInfo.new(0.3, Enum.EasingStyle.Back), { Scale = 1 }):Play()
end

local function shake(gui: Instance)
	if not gui:IsA("GuiObject") then return end
	local start = gui.Position
	task.spawn(function()
		for i = 1, 6 do
			gui.Position = start + UDim2.fromOffset(if i % 2 == 0 then 6 else -6, 0)
			task.wait(0.03)
		end
		gui.Position = start
	end)
end

-- A button grows a little under the mouse and dips when pressed, like the reference games.
local function springy(button: GuiButton)
	local scale = scaleOf(button)
	button.MouseEnter:Connect(function() TweenService:Create(scale, TweenInfo.new(0.12), { Scale = 1.06 }):Play() end)
	button.MouseLeave:Connect(function() TweenService:Create(scale, TweenInfo.new(0.12), { Scale = 1 }):Play() end)
	button.MouseButton1Down:Connect(function() TweenService:Create(scale, TweenInfo.new(0.06), { Scale = 0.94 }):Play() end)
	button.MouseButton1Up:Connect(function() TweenService:Create(scale, TweenInfo.new(0.12, Enum.EasingStyle.Back), { Scale = 1.06 }):Play() end)
end

-- "+N" floats up from the counter and fades.
local function float(counter: GuiObject, text: string)
	local label = Instance.new("TextLabel")
	label.BackgroundTransparency = 1
	label.Text = text
	label.Font = Enum.Font.FredokaOne
	label.TextScaled = true
	label.TextColor3 = Color3.fromRGB(140, 255, 120)
	label.Size = UDim2.fromOffset(90, 34)
	label.AnchorPoint = Vector2.new(0.5, 0.5)
	label.Position = UDim2.new(1, -30, 1, 4)
	label.ZIndex = 20
	local stroke = Instance.new("UIStroke")
	stroke.Thickness = 2.5
	stroke.Parent = label
	label.Parent = counter
	local info = TweenInfo.new(0.8, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
	TweenService:Create(label, info, { Position = UDim2.new(1, -30, 1, 40), TextTransparency = 1 }):Play()
	TweenService:Create(stroke, info, { Transparency = 1 }):Play()
	task.delay(0.85, function() label:Destroy() end)
end

local function find(root: Instance, name: string): Instance?
	return root:FindFirstChild(name, true)
end

local function wire(screen: ScreenGui)
	local counter = find(screen, config.counter or currency)
	local value = counter and counter:FindFirstChild("Value")
	local shown = player:GetAttribute(currency) or 0
	local target = shown
	local function draw()
		if value and value:IsA("TextLabel") then value.Text = short(shown) end
	end
	draw()
	-- The number rolls toward the real balance instead of jumping.
	RunService.RenderStepped:Connect(function(dt)
		if shown == target then return end
		local step = math.max(1, math.abs(target - shown) * math.min(1, dt * 12))
		shown = if shown < target then math.min(target, shown + step) else math.max(target, shown - step)
		draw()
	end)
	local gained, lastFloat = 0, 0
	player:GetAttributeChangedSignal(currency):Connect(function()
		local now = player:GetAttribute(currency) or 0
		if now > target then gained += now - target end
		target = now
		if counter and counter:IsA("GuiObject") and gained > 0 and os.clock() - lastFloat > 0.12 then
			float(counter, "+" .. short(gained))
			pop(counter, 1.06)
			gained, lastFloat = 0, os.clock()
		end
	end)

	local panel = screen:FindFirstChild(config.panel or "UpgradesPanel")
	local open = find(screen, config.button or "Upgrades")
	if open and open:IsA("GuiButton") and panel and panel:IsA("GuiObject") then
		springy(open)
		open.Activated:Connect(function()
			panel.Visible = not panel.Visible
			if panel.Visible then pop(panel, 0.7) end
		end)
		local close = panel:FindFirstChild("Close")
		if close and close:IsA("GuiButton") then
			springy(close)
			close.Activated:Connect(function() panel.Visible = false end)
		end
	end

	-- The red "!" on the Upgrades button: shown, and gently bouncing, while something can be bought.
	local badge = open and open:FindFirstChild("Badge")
	local function affordable(): boolean
		local money = player:GetAttribute(currency) or 0
		for _, u in config.upgrades or {} do
			local level = player:GetAttribute("Upgrade_" .. u.id) or 0
			if level < (u.max or 100) and cost(u, level) <= money then return true end
		end
		return false
	end
	if badge and badge:IsA("GuiObject") then
		local function check() badge.Visible = affordable() end
		check()
		player:GetAttributeChangedSignal(currency):Connect(check)
		for _, u in config.upgrades or {} do player:GetAttributeChangedSignal("Upgrade_" .. u.id):Connect(check) end
		task.spawn(function()
			while badge.Parent do
				if badge.Visible then pop(badge, 1.25) end
				task.wait(1.2)
			end
		end)
	end

	for _, u in config.upgrades or {} do
		local card = panel and find(panel, u.id)
		if not card then continue end
		local badge = card:FindFirstChild("Level")
		local badgeText = badge and badge:FindFirstChild("Text")
		local button = card:FindFirstChild("Buy")
		local price = button and button:FindFirstChild("Label")
		local icon = card:FindFirstChild("IconBubble")
		-- Dim: a grey sheet over the Buy button while the price cannot be paid (or the upgrade is at its maximum).
		local dim = button and button:FindFirstChild("Dim")
		local function refresh()
			local level = player:GetAttribute("Upgrade_" .. u.id) or 0
			if badgeText and badgeText:IsA("TextLabel") then badgeText.Text = "Lv " .. level end
			if price and price:IsA("TextLabel") then
				price.Text = if level >= (u.max or 100) then "MAX" else symbolPrefix .. short(cost(u, level))
			end
			if dim and dim:IsA("GuiObject") then
				dim.Visible = level >= (u.max or 100) or (player:GetAttribute(currency) or 0) < cost(u, level)
			end
		end
		refresh()
		player:GetAttributeChangedSignal("Upgrade_" .. u.id):Connect(refresh)
		player:GetAttributeChangedSignal(currency):Connect(refresh)
		if button and button:IsA("GuiButton") then
			springy(button)
			button.Activated:Connect(function()
				local ok, said = buy:InvokeServer(u.id)
				if ok then
					play("buy")
					play("levelUp")
					pop(card, 1.1)
					if icon then pop(icon, 1.35) end
					if badge then pop(badge, 1.4) end
				else
					shake(button)
					if price and price:IsA("TextLabel") then
						price.Text = said
						task.delay(0.9, function() if price.Text == said then refresh() end end)
					end
				end
			end)
		end
	end
end

local gui = player:WaitForChild("PlayerGui")
local function consider(child: Instance)
	if child:IsA("ScreenGui") and child.Name == config.screen then task.defer(wire, child) end
end
for _, c in gui:GetChildren() do consider(c) end
gui.ChildAdded:Connect(consider)
