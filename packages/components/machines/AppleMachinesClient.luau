--!strict
--[[
	AppleMachinesClient: the plot simulator's own corner of the HUD (stud-ui.ts plotSimHud), which no other script
	drives: the "+N/s" under the money shows what the player's machines pay each second (IncomePerSecond), and the
	Rebirth button opens RebirthPanel, which says what a rebirth costs and gives, and rebirths on Confirm through
	ReplicatedStorage.AppleRebirth. Live 2026-10-01 the label sat at "+0/s" with a machine earning, and Rebirth did nothing.
]]
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local player = Players.LocalPlayer

local function short(n: number): string
	for _, s in { { 1e12, "T" }, { 1e9, "B" }, { 1e6, "M" }, { 1e3, "K" } } do
		if n >= s[1] then return (string.format("%.1f", n / s[1]):gsub("%.0$", "")) .. s[2] end
	end
	return tostring(math.floor(n))
end

local function pop(gui: Instance)
	if not gui:IsA("GuiObject") then return end
	local scale = gui:FindFirstChild("Pop") or Instance.new("UIScale")
	scale.Name = "Pop"
	scale.Parent = gui
	;(scale :: UIScale).Scale = 1.15
	TweenService:Create(scale, TweenInfo.new(0.3, Enum.EasingStyle.Back), { Scale = 1 }):Play()
end

local PANELS = { "ShopPanel", "UpgradesPanel", "RebirthPanel" }

-- One panel at a time, whichever script opened it (owner's screenshot, 2026-10-01: Upgrades opened over the Shop and
-- the shop's icons showed through it).
local function onePanel(screen: ScreenGui)
	for _, name in PANELS do
		local panel = screen:FindFirstChild(name)
		if panel and panel:IsA("GuiObject") then
			-- A panel fits the window: on a small screen (or Studio's small view) the Shop's bottom row and its prices
			-- were cut off (owner's screenshot, 2026-10-01).
			local fit = panel:FindFirstChild("Fit") or Instance.new("UIScale")
			fit.Name = "Fit"
			fit.Parent = panel
			local function size()
				local view = workspace.CurrentCamera and workspace.CurrentCamera.ViewportSize or Vector2.new(1280, 720)
				local h, w = panel.Size.Y.Offset + 60, panel.Size.X.Offset + 40
				;(fit :: UIScale).Scale = math.min(1, if h > 0 then (view.Y - 40) / h else 1, if w > 0 then (view.X - 260) / w else 1)
			end
			size()
			if workspace.CurrentCamera then workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(size) end
			panel:GetPropertyChangedSignal("Visible"):Connect(function()
				if not panel.Visible then return end
				size()
				for _, other in PANELS do
					local o = screen:FindFirstChild(other)
					if o and o ~= panel and o:IsA("GuiObject") then o.Visible = false end
				end
			end)
		end
	end
end

local function wire(screen: ScreenGui)
	onePanel(screen)
	local coins = screen:FindFirstChild("Coins")
	local perSecond = coins and coins:FindFirstChild("PerSecond")
	if perSecond and perSecond:IsA("TextLabel") then
		local function draw() perSecond.Text = "+" .. short(tonumber(player:GetAttribute("IncomePerSecond")) or 0) .. "/s" end
		draw()
		player:GetAttributeChangedSignal("IncomePerSecond"):Connect(draw)
	end

	local menu = screen:FindFirstChild("Menu")
	local open = menu and menu:FindFirstChild("Rebirth")
	local panel = screen:FindFirstChild("RebirthPanel")
	if not (open and open:IsA("GuiButton") and panel and panel:IsA("GuiObject")) then return end
	local info, bonus, confirm = panel:FindFirstChild("Info", true), panel:FindFirstChild("Bonus", true), panel:FindFirstChild("Confirm", true)
	local function refresh()
		local cost = tonumber(player:GetAttribute("RebirthCost")) or 0
		local rebirths = tonumber(player:GetAttribute("Rebirths")) or 0
		local mult = tonumber(player:GetAttribute("Multiplier")) or 1
		if info and info:IsA("TextLabel") then
			info.Text = ("Rebirth for $%s: start over with every machine and upgrade gone, and earn more forever. Rebirths: %d"):format(short(cost), rebirths)
		end
		-- What a rebirth gives, not only what you have (a bare "x1" read as "a rebirth gives nothing").
		local nextMult = tonumber(player:GetAttribute("NextMultiplier")) or mult
		local function x(n: number) return "x" .. tostring(math.floor(n * 100 + 0.5) / 100) end
		if bonus and bonus:IsA("TextLabel") then bonus.Text = x(mult) .. "  →  " .. x(nextMult) end
	end
	refresh()
	for _, a in { "RebirthCost", "Rebirths", "Multiplier", "NextMultiplier" } do player:GetAttributeChangedSignal(a):Connect(refresh) end
	open.Activated:Connect(function()
		panel.Visible = not panel.Visible
		if panel.Visible then refresh(); pop(panel) end
	end)
	local close = panel:FindFirstChild("Close", true)
	if close and close:IsA("GuiButton") then close.Activated:Connect(function() panel.Visible = false end) end
	local remote = ReplicatedStorage:WaitForChild("AppleRebirth", 10)
	if confirm and confirm:IsA("GuiButton") and remote and remote:IsA("RemoteFunction") then
		local label = confirm:FindFirstChild("Label", true)
		local word = if label and label:IsA("TextLabel") then label.Text else "REBIRTH"
		confirm.Activated:Connect(function()
			local ok, said = remote:InvokeServer()
			if label and label:IsA("TextLabel") then
				label.Text = tostring(said or "")
				task.delay(1.6, function() label.Text = word end)
			end
			if ok then pop(bonus or panel); task.delay(1.2, function() panel.Visible = false end) end
		end)
	end
end

-- The hub's pads open their panels when the player steps on them (live 2026-10-01: the SHOP pad did nothing).
local function padOpens(screen: ScreenGui)
	local map = workspace:WaitForChild("AppleMap", 10)
	if not map then return end
	local last = 0
	for pad, panelName in { ShopPad = "ShopPanel", SellPad = "RebirthPanel" } do
		local part = map:FindFirstChild(pad)
		local panel = screen:FindFirstChild(panelName)
		if part and part:IsA("BasePart") and panel and panel:IsA("GuiObject") then
			part.Touched:Connect(function(hit: BasePart)
				local character = player.Character
				if not character or not hit:IsDescendantOf(character) or os.clock() - last < 1.5 or panel.Visible then return end
				last = os.clock()
				for _, other in { "ShopPanel", "UpgradesPanel", "RebirthPanel" } do
					local o = screen:FindFirstChild(other)
					if o and o:IsA("GuiObject") then o.Visible = false end
				end
				panel.Visible = true
				pop(panel)
			end)
		end
	end
end

local gui = player:WaitForChild("PlayerGui")
local function consider(child: Instance)
	if child:IsA("ScreenGui") and child.Name == "AppleHUD" then task.defer(wire, child); task.spawn(padOpens, child) end
end
for _, c in gui:GetChildren() do consider(c) end
gui.ChildAdded:Connect(consider)
