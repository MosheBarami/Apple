--!strict
--[[
	AppleTycoonClient: the tycoon's money on the player's screen. StarterGui.TycoonHUD (compose-tycoon.ts) holds a
	counter whose TextLabel "Value" shows the balance AppleEconomy mirrors on the player attribute <Currency>, with a
	pop when it rises.
]]
local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local player = Players.LocalPlayer

local currency = "Cash"
local cfgModule = ReplicatedStorage:FindFirstChild("AppleComponents") and ReplicatedStorage.AppleComponents:FindFirstChild("AppleClientConfig")
if cfgModule then
	local ok, cfg = pcall(require, cfgModule)
	if ok and type(cfg) == "table" and type(cfg.currency) == "string" then currency = cfg.currency end
end

local function short(n: number): string
	for _, s in { { 1e12, "T" }, { 1e9, "B" }, { 1e6, "M" }, { 1e3, "K" } } do
		if n >= s[1] then return (string.format("%.1f", n / s[1]):gsub("%.0$", "")) .. s[2] end
	end
	return tostring(math.floor(n))
end

local function wire(screen: ScreenGui)
	local value = screen:FindFirstChild("Value", true)
	if not (value and value:IsA("TextLabel")) then return end
	local last = tonumber(player:GetAttribute(currency)) or 0
	local function draw()
		local now = tonumber(player:GetAttribute(currency)) or 0
		value.Text = short(now)
		if now > last then
			local holder = value.Parent
			if holder and holder:IsA("GuiObject") then
				local scale = holder:FindFirstChild("Pop") or Instance.new("UIScale")
				scale.Name = "Pop"
				scale.Parent = holder
				;(scale :: UIScale).Scale = 1.12
				TweenService:Create(scale, TweenInfo.new(0.25, Enum.EasingStyle.Back), { Scale = 1 }):Play()
			end
		end
		last = now
	end
	draw()
	player:GetAttributeChangedSignal(currency):Connect(draw)
end

local gui = player:WaitForChild("PlayerGui")
local function consider(child: Instance)
	if child:IsA("ScreenGui") and child.Name == "TycoonHUD" then task.defer(wire, child) end
end
for _, c in gui:GetChildren() do consider(c) end
gui.ChildAdded:Connect(consider)
