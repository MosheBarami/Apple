--!strict
--[[
	AppleUpgradesClient: makes the studded upgrades screen work. The counter shows the money, the Upgrades button opens
	the panel and its red X closes it, every card says its level and next price and buys on its Buy button. Names come
	from ReplicatedStorage.AppleUpgradesConfig (screen, counter, button, panel; cards are named by upgrade id).
]]
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local player = Players.LocalPlayer
local config = require(ReplicatedStorage:WaitForChild("AppleUpgradesConfig")) :: any
local buy = ReplicatedStorage:WaitForChild("AppleUpgradeBuy") :: RemoteFunction
local currency = config.currency or "Coins"

local function cost(u: any, level: number): number
	return math.floor(u.cost * (u.growth or 1.5) ^ level + 0.5)
end

local function short(n: number): string
	for _, s in { { 1e12, "T" }, { 1e9, "B" }, { 1e6, "M" }, { 1e3, "K" } } do
		if n >= s[1] then return string.format("%.1f", n / s[1]):gsub("%.0$", "") .. s[2] end
	end
	return tostring(math.floor(n))
end

local function find(root: Instance, name: string): Instance?
	return root:FindFirstChild(name, true)
end

local function pop(gui: Instance)
	if not gui:IsA("GuiObject") then return end
	local scale = gui:FindFirstChild("Pop") or Instance.new("UIScale")
	scale.Name = "Pop"
	scale.Parent = gui
	;(scale :: UIScale).Scale = 1.12
	TweenService:Create(scale, TweenInfo.new(0.25, Enum.EasingStyle.Back), { Scale = 1 }):Play()
end

local function wire(screen: ScreenGui)
	local counter = find(screen, config.counter or currency)
	local value = counter and counter:FindFirstChild("Value")
	local function money()
		if value and value:IsA("TextLabel") then value.Text = short(player:GetAttribute(currency) or 0) end
	end
	money()
	player:GetAttributeChangedSignal(currency):Connect(function() money(); if counter then pop(counter) end end)

	local panel = screen:FindFirstChild(config.panel or "UpgradesPanel")
	local open = find(screen, config.button or "Upgrades")
	if open and open:IsA("GuiButton") and panel and panel:IsA("GuiObject") then
		open.Activated:Connect(function() panel.Visible = not panel.Visible; pop(panel) end)
		local close = panel:FindFirstChild("Close")
		if close and close:IsA("GuiButton") then close.Activated:Connect(function() panel.Visible = false end) end
	end

	for _, u in config.upgrades or {} do
		local card = panel and find(panel, u.id)
		if not card then continue end
		local label = card:FindFirstChild("ItemName")
		local button = card:FindFirstChild("Buy")
		local price = button and button:FindFirstChild("Label")
		local function refresh()
			local level = player:GetAttribute("Upgrade_" .. u.id) or 0
			if label and label:IsA("TextLabel") then label.Text = (u.label or u.id) .. "  Lv " .. level end
			if price and price:IsA("TextLabel") then
				price.Text = if level >= (u.max or 100) then "MAX" else short(cost(u, level))
			end
		end
		refresh()
		player:GetAttributeChangedSignal("Upgrade_" .. u.id):Connect(refresh)
		if button and button:IsA("GuiButton") then
			button.Activated:Connect(function()
				local ok, said = buy:InvokeServer(u.id)
				pop(if ok then card else button)
				if not ok and price and price:IsA("TextLabel") then
					price.Text = said
					task.delay(0.9, function() if price.Text == said then refresh() end end)
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
