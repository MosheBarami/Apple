--!strict
--[[
	AppleGameUI: makes the game's own studded HUD work. The composer writes the HUD into StarterGui as real,
	editable instances (StarterGui.AppleHUD, apps/worker/src/stud-ui.ts); this script finds its pieces by name and
	gives each one its job. Nothing on the screen is a placeholder: every number is the game's, every button acts.

	  Coins.Value          the player's money (counts up, "+N" pops beside it); Coins.Plus opens the shop
	  Wave.Title / Timer   the wave, the countdown to the next one, enemies left, "cleared", "lost"
	  Health.Fill / Label  the base's health (green, then yellow, then red)
	  Menu.Shop / Upgrade  open their panels; a panel's Close (or Escape) shuts it
	  ShopPanel ... Item_<id>  one card per item: its 3D model turning, name, info, price; Buy starts placing it
	                       (AppleShopClient); Lock covers an item until its wave is reached
	  UpgradePanel ... Up_<id> the item's level and the next level's price; Buy upgrades it (AppleUpgrade)
	  Toast                short messages (AppleClientState.say) and wave banners

	Words come from ReplicatedStorage.AppleComponents.AppleClientConfig.words, so the game speaks its theme.
	Every button presses in and out; clicks, buys and upgrades sound (AppleSounds, from the fx component).
]]
local AppleGameUI = {}

--[[ Pure: 1234 -> "1.2K", 5 -> "5". ]]
function AppleGameUI.short(n: number): string
	local abs = math.abs(n)
	for _, u in { { 1e12, "T" }, { 1e9, "B" }, { 1e6, "M" }, { 1e3, "K" } } do
		if abs >= u[1] then
			local v = n / u[1]
			return (if v >= 100 then ("%d"):format(math.floor(v)) else (("%.1f"):format(v):gsub("%.0$", ""))) .. u[2]
		end
	end
	return tostring(math.floor(n))
end

--[[ Pure: seconds -> "0:12". ]]
function AppleGameUI.clock(s: number): string
	s = math.max(0, math.floor(s))
	return ("%d:%02d"):format(s // 60, s % 60)
end

--[[ Pure: the health bar's colour pair for a share of health left (green, yellow, red). ]]
function AppleGameUI.healthColours(share: number): ({ number }, { number })
	if share > 0.5 then return { 93, 255, 122 }, { 20, 194, 74 } end
	if share > 0.25 then return { 255, 225, 77 }, { 255, 159, 26 } end
	return { 255, 90, 90 }, { 196, 22, 22 }
end

--[[ Pure: the line under the wave title. ]]
function AppleGameUI.waveLine(phase: string?, nextIn: number, left: number, words: { [string]: string }): string
	if phase == "intermission" then return ("%s %s"):format(words.nextWave or "Next wave in", AppleGameUI.clock(nextIn)) end
	if phase == "wave" then return ("%d %s"):format(left, words.left or "left") end
	if phase == "cleared" then return words.cleared or "Wave cleared!" end
	if phase == "lost" then return words.lost or "The base fell! Starting over..." end
	return ""
end

--[[ Pure: what an upgrade row shows: the level and the next price (nil at the top). Same rules as AppleShop. ]]
function AppleGameUI.upgradeCost(price: number, level: number, max: number, cost: number, growth: number): number?
	if level >= max then return nil end
	return math.floor(price * cost * growth ^ (level - 1) + 0.5)
end

function AppleGameUI.start()
	local Players = game:GetService("Players")
	local ReplicatedStorage = game:GetService("ReplicatedStorage")
	local TweenService = game:GetService("TweenService")
	local UserInputService = game:GetService("UserInputService")
	local RunService = game:GetService("RunService")
	local player = Players.LocalPlayer
	local gui = player:WaitForChild("PlayerGui")
	local comps = ReplicatedStorage:WaitForChild("AppleComponents")
	local cfgModule = comps:FindFirstChild("AppleClientConfig")
	local cfg = if cfgModule then require(cfgModule) :: any else {}
	local words: { [string]: string } = cfg.words or {}
	local currency: string = cfg.currency or "Coins"
	local State = require(comps:WaitForChild("AppleClientState")) :: any
	local soundsModule = comps:FindFirstChild("AppleSounds")
	local Sounds = if soundsModule then require(soundsModule) :: any else { play = function(_: string) end }
	local catalog = ReplicatedStorage:WaitForChild("AppleCatalog")
	local models = ReplicatedStorage:WaitForChild("AppleItemModels")
	local upgrade = ReplicatedStorage:WaitForChild("AppleUpgrade") :: RemoteFunction
	local state = ReplicatedStorage:WaitForChild("AppleState")

	local function tween(o: Instance, t: number, props: { [string]: any }, style: Enum.EasingStyle?)
		local tw = TweenService:Create(o, TweenInfo.new(t, style or Enum.EasingStyle.Quad, Enum.EasingDirection.Out), props)
		tw:Play()
		return tw
	end
	local function scaleOf(o: GuiObject): UIScale
		local s = o:FindFirstChild("Press") :: UIScale?
		if not s then
			local made = Instance.new("UIScale")
			made.Name = "Press"
			made.Parent = o
			s = made
		end
		return s :: UIScale
	end
	local function setText(o: Instance?, text: string)
		if o and (o:IsA("TextLabel") or o:IsA("TextButton")) then o.Text = text end
	end
	local function tint(o: Instance?, top: { number }, bottom: { number })
		local g = o and o:FindFirstChild("Tint")
		if g and g:IsA("UIGradient") then
			g.Color = ColorSequence.new(Color3.fromRGB(top[1], top[2], top[3]), Color3.fromRGB(bottom[1], bottom[2], bottom[3]))
		end
	end
	local function money(): number return player:GetAttribute(currency) or 0 end
	local function reached(): number return math.max(state:GetAttribute("Wave") or 0, player:GetAttribute("BestWave") or 0) end

	-- A button presses in, grows a little under the mouse, and clicks.
	local function button(b: Instance?, onClick: () -> ())
		if not b or not b:IsA("GuiButton") then return end
		local s = scaleOf(b)
		b.AutoButtonColor = false
		b.MouseEnter:Connect(function() tween(s, 0.12, { Scale = 1.06 }) end)
		b.MouseLeave:Connect(function() tween(s, 0.12, { Scale = 1 }) end)
		b.MouseButton1Down:Connect(function() tween(s, 0.06, { Scale = 0.9 }) end)
		b.MouseButton1Up:Connect(function() tween(s, 0.18, { Scale = 1.06 }, Enum.EasingStyle.Back) end)
		b.Activated:Connect(function()
			Sounds.play("click")
			onClick()
		end)
	end

	local function bind(hud: ScreenGui)
		hud.ResetOnSpawn = false
		local find = function(path: string): Instance?
			local at: Instance? = hud
			for part in path:gmatch("[^%.]+") do at = at and at:FindFirstChild(part) end
			return at
		end

		-- Toast: one message at a time, popped in, gone after a moment.
		local toast = find("Toast")
		local toastId = 0
		local function say(text: string, good: boolean?)
			if not toast or not toast:IsA("TextLabel") then return end
			toastId += 1
			local mine = toastId
			toast.Text = text
			toast.TextColor3 = if good == false then Color3.fromRGB(255, 110, 110) else Color3.new(1, 1, 1)
			toast.Visible = true
			local s = scaleOf(toast)
			s.Scale = 0.6
			tween(s, 0.25, { Scale = 1 }, Enum.EasingStyle.Back)
			if good == false then Sounds.play("error") end
			task.delay(2.4, function() if toastId == mine then toast.Visible = false end end)
		end
		State.Said:Connect(say)

		-- Panels: one open at a time; opening pops, closing (X or Escape) shuts.
		local panels: { GuiObject } = {}
		for _, name in { "ShopPanel", "UpgradePanel" } do
			local p = find(name)
			if p and p:IsA("GuiObject") then table.insert(panels, p) end
		end
		local function close() for _, p in panels do p.Visible = false end end
		local function open(p: Instance?)
			if not p or not p:IsA("GuiObject") then return end
			local was = p.Visible
			close()
			if was then return end
			p.Visible = true
			local s = scaleOf(p)
			s.Scale = 0.7
			tween(s, 0.28, { Scale = 1 }, Enum.EasingStyle.Back)
			Sounds.play("open")
		end
		for _, p in panels do button(p:FindFirstChild("Close"), close) end
		button(find("Menu.Shop"), function() open(find("ShopPanel")) end)
		button(find("Menu.Upgrade"), function() open(find("UpgradePanel")) end)
		button(find("Coins.Plus"), function()
			open(find("ShopPanel"))
			say(words.earn or "Beat enemies and clear waves to earn more!", true)
		end)
		UserInputService.InputBegan:Connect(function(input, processed)
			if processed then return end
			if input.KeyCode == Enum.KeyCode.Escape then close() end
		end)

		-- Money: counts up to the new amount; a gain pops "+N" beside it.
		local value = find("Coins.Value")
		local shownMoney = money()
		setText(value, AppleGameUI.short(shownMoney))
		local counter = Instance.new("NumberValue")
		counter.Value = shownMoney
		counter.Changed:Connect(function(v) setText(value, AppleGameUI.short(v)) end)
		local coins = find("Coins")
		local function pop(amount: number)
			if not coins or not coins:IsA("GuiObject") then return end
			local label = Instance.new("TextLabel")
			label.BackgroundTransparency = 1
			label.Size = UDim2.fromOffset(120, 34)
			label.Position = UDim2.new(1, 8, 0.5, 0)
			label.AnchorPoint = Vector2.new(0, 0.5)
			label.Font = Enum.Font.FredokaOne
			label.TextScaled = true
			label.Text = "+" .. AppleGameUI.short(amount)
			label.TextColor3 = Color3.fromRGB(255, 225, 77)
			label.TextXAlignment = Enum.TextXAlignment.Left
			label.ZIndex = 9
			local stroke = Instance.new("UIStroke")
			stroke.Thickness = 2.5
			stroke.Parent = label
			label.Parent = coins
			tween(label, 0.9, { Position = UDim2.new(1, 8, 0.5, -40), TextTransparency = 1 })
			tween(stroke, 0.9, { Transparency = 1 })
			task.delay(0.95, function() label:Destroy() end)
			local s = scaleOf(coins)
			s.Scale = 1.12
			tween(s, 0.3, { Scale = 1 }, Enum.EasingStyle.Back)
		end
		local cards: { [string]: Instance } = {}
		local rows: { [string]: Instance } = {}
		local refreshCards: () -> () = function() end -- the real one is set once the cards are bound, below
		player:GetAttributeChangedSignal(currency):Connect(function()
			local now = money()
			if now > shownMoney then pop(now - shownMoney); Sounds.play("cash") end
			shownMoney = now
			tween(counter, 0.35, { Value = now })
			refreshCards()
		end)

		-- The wave and the base.
		local title, timer = find("Wave.Title"), find("Wave.Timer")
		local fill, health = find("Health.Fill"), find("Health")
		local lastPhase: string? = nil
		local function showWave()
			local wave = state:GetAttribute("Wave") or 0
			local phase = state:GetAttribute("Phase")
			setText(title, ("%s %d"):format((words.wave or "Wave"):upper(), math.max(1, if phase == "intermission" then wave + 1 else wave)))
			setText(timer, AppleGameUI.waveLine(phase, state:GetAttribute("NextWaveIn") or 0, state:GetAttribute("EnemiesLeft") or 0, words))
			if phase ~= lastPhase then
				if phase == "wave" then
					say(("%s %d!"):format((words.wave or "Wave"):upper(), wave), true)
					Sounds.play("wave")
				elseif phase == "cleared" then
					say(words.cleared or "Wave cleared!", true)
					Sounds.play("cleared")
				elseif phase == "lost" then
					say(words.lost or "The base fell! Starting over...", false)
				end
				lastPhase = phase
				refreshCards()
			end
		end
		local function showHealth()
			local max = math.max(1, state:GetAttribute("BaseHealthMax") or 1)
			local share = math.clamp((state:GetAttribute("BaseHealth") or max) / max, 0, 1)
			if fill and fill:IsA("GuiObject") then
				tween(fill, 0.25, { Size = UDim2.fromScale(math.max(share, 0.02), 1) })
				local top, bottom = AppleGameUI.healthColours(share)
				tint(fill, top, bottom)
			end
		end
		for _, k in { "Wave", "Phase", "NextWaveIn", "EnemiesLeft" } do state:GetAttributeChangedSignal(k):Connect(showWave) end
		state:GetAttributeChangedSignal("NextWaveIn"):Connect(function()
			local t = state:GetAttribute("NextWaveIn") or 0
			if state:GetAttribute("Phase") == "intermission" and t > 0 and t <= 3 then Sounds.play("countdown") end
		end)
		local lastHealth = state:GetAttribute("BaseHealth") or 0
		for _, k in { "BaseHealth", "BaseHealthMax" } do
			state:GetAttributeChangedSignal(k):Connect(function()
				local now = state:GetAttribute("BaseHealth") or 0
				if now < lastHealth and health and health:IsA("GuiObject") then
					local s = scaleOf(health)
					s.Scale = 1.15
					tween(s, 0.3, { Scale = 1 }, Enum.EasingStyle.Back)
				end
				lastHealth = now
				showHealth()
			end)
		end
		showWave()
		showHealth()

		-- Shop cards: one per item in the catalog, made from the first card when the HUD has fewer.
		local grid = find("ShopPanel.Body.Grid")
		local function entries(): { Instance }
			local list = catalog:GetChildren()
			table.sort(list, function(a, b) return (a:GetAttribute("Order") or 0) < (b:GetAttribute("Order") or 0) end)
			return list
		end
		local function viewport(holder: Instance?, id: string)
			local model = models:FindFirstChild(id)
			if not holder or not model or not holder:IsA("GuiObject") or holder:FindFirstChild("View") then return end
			local vf = Instance.new("ViewportFrame")
			vf.Name = "View"
			vf.BackgroundTransparency = 1
			vf.Size = UDim2.fromScale(1, 1)
			vf.ZIndex = holder.ZIndex + 1
			vf.Ambient = Color3.fromRGB(200, 200, 200)
			vf.LightColor = Color3.new(1, 1, 1)
			vf.LightDirection = Vector3.new(-1, -1.5, -1)
			vf.Parent = holder
			local copy = model:Clone()
			copy.Parent = vf
			local cam = Instance.new("Camera")
			cam.FieldOfView = 30
			cam.Parent = vf
			vf.CurrentCamera = cam
			if not copy:IsA("Model") then return end
			local cf, size = copy:GetBoundingBox()
			local dist = (size.Magnitude / 2) / math.tan(math.rad(cam.FieldOfView / 2)) * 1.05
			local angle = 0
			-- The item turns slowly while its panel is open.
			local panel = holder:FindFirstAncestor("ShopPanel")
			local turning: RBXScriptConnection
			turning = RunService.RenderStepped:Connect(function(dt)
				if not vf:IsDescendantOf(gui) then turning:Disconnect() return end
				if panel and panel:IsA("GuiObject") and not panel.Visible then return end
				angle += dt * 0.8
				local dir = Vector3.new(math.sin(angle), 0.45, math.cos(angle)).Unit
				cam.CFrame = CFrame.lookAt(cf.Position + dir * dist, cf.Position)
			end)
			cam.CFrame = CFrame.lookAt(cf.Position + Vector3.new(0, 0.45, 1).Unit * dist, cf.Position)
		end
		local function lockText(card: Instance, wave: number)
			setText(card:FindFirstChild("Lock") and card.Lock:FindFirstChild("Label"), ("%s %d"):format((words.wave or "Wave"):upper(), wave))
		end
		refreshCards = function()
			local have, top = money(), reached()
			for id, card in cards do
				local entry = catalog:FindFirstChild(id)
				if not entry then continue end
				local unlock = entry:GetAttribute("Unlock") or 0
				local locked = unlock > top
				local lock = card:FindFirstChild("Lock")
				if lock and lock:IsA("GuiObject") then lock.Visible = locked end
				if locked then lockText(card, unlock) end
				local buy = card:FindFirstChild("Buy")
				local affordable = have >= (entry:GetAttribute("Price") or 0)
				if affordable then tint(buy, { 93, 255, 122 }, { 20, 194, 74 }) else tint(buy, { 215, 221, 226 }, { 143, 154, 163 }) end
			end
			for id, row in rows do
				local entry = catalog:FindFirstChild(id)
				if not entry then continue end
				local level = player:GetAttribute("Lv_" .. id) or 1
				local cost = AppleGameUI.upgradeCost(entry:GetAttribute("Price") or 10, level, catalog:GetAttribute("UpgradeMax") or 5,
					catalog:GetAttribute("UpgradeCost") or 0.8, catalog:GetAttribute("UpgradeGrowth") or 1.8)
				setText(row:FindFirstChild("Level"), ("LV %d"):format(level))
				local buy = row:FindFirstChild("Buy")
				setText(buy and buy:FindFirstChild("Label"), if cost then "$" .. AppleGameUI.short(cost) else "MAX")
				local locked = (entry:GetAttribute("Unlock") or 0) > top
				if not cost or locked or have < cost then tint(buy, { 215, 221, 226 }, { 143, 154, 163 }) else tint(buy, { 95, 211, 255 }, { 31, 111, 255 }) end
			end
		end
		if grid then
			local template = grid:FindFirstChildWhichIsA("ImageLabel") or grid:FindFirstChildWhichIsA("ImageButton")
			for _, entry in entries() do
				local id = entry.Name
				local card = grid:FindFirstChild("Item_" .. id)
				if not card and template then
					card = template:Clone()
					card.Name = "Item_" .. id
					local old = card:FindFirstChild("Icon") and card.Icon:FindFirstChild("View")
					if old then old:Destroy() end
					card.Parent = grid
				end
				if not card then continue end
				cards[id] = card
				if card:IsA("GuiObject") then card.LayoutOrder = entry:GetAttribute("Order") or 0 end
				setText(card:FindFirstChild("ItemName"), entry:GetAttribute("Name") or id)
				local blurb = entry:GetAttribute("Blurb")
				setText(card:FindFirstChild("Info"), if blurb and blurb ~= "" then blurb else ("%d dmg  -  %d range"):format(entry:GetAttribute("Damage") or 0, entry:GetAttribute("Range") or 0))
				local buy = card:FindFirstChild("Buy")
				setText(buy and buy:FindFirstChild("Label"), "$" .. AppleGameUI.short(entry:GetAttribute("Price") or 0))
				viewport(card:FindFirstChild("Icon"), id)
				button(buy, function()
					local entryNow = catalog:FindFirstChild(id)
					if not entryNow then return end
					if (entryNow:GetAttribute("Unlock") or 0) > reached() then
						say(("%s unlocks at %s %d."):format(entryNow:GetAttribute("Name") or id, (words.wave or "wave"):lower(), entryNow:GetAttribute("Unlock")), false)
						return
					end
					if money() < (entryNow:GetAttribute("Price") or 0) then
						say(("Not enough %s yet!"):format(currency:lower()), false)
						return
					end
					close()
					State.pick(id)
					say((words.pick or "Tap a glowing spot on your plot to place") .. " " .. (entryNow:GetAttribute("Name") or id), true)
				end)
			end
		end

		-- Upgrade rows.
		local list = find("UpgradePanel.Body.List")
		if list then
			local template = list:FindFirstChildWhichIsA("ImageLabel") or list:FindFirstChildWhichIsA("ImageButton")
			for _, entry in entries() do
				local id = entry.Name
				local row = list:FindFirstChild("Up_" .. id)
				if not row and template then
					row = template:Clone()
					row.Name = "Up_" .. id
					row.Parent = list
				end
				if not row then continue end
				rows[id] = row
				if row:IsA("GuiObject") then row.LayoutOrder = entry:GetAttribute("Order") or 0 end
				setText(row:FindFirstChild("ItemName"), entry:GetAttribute("Name") or id)
				button(row:FindFirstChild("Buy"), function()
					local ok, message = upgrade:InvokeServer(id)
					say(message or (if ok then "Upgraded!" else "Could not upgrade."), ok)
					if ok then
						Sounds.play("upgrade")
						local s = scaleOf(row :: GuiObject)
						s.Scale = 1.08
						tween(s, 0.3, { Scale = 1 }, Enum.EasingStyle.Back)
					end
					refreshCards()
				end)
			end
		end
		for _, entry in entries() do
			player:GetAttributeChangedSignal("Lv_" .. entry.Name):Connect(refreshCards)
		end
		player:GetAttributeChangedSignal("BestWave"):Connect(refreshCards)
		refreshCards()
	end

	local function watch(child: Instance)
		if child.Name == "AppleHUD" and child:IsA("ScreenGui") and not child:GetAttribute("AppleBound") then
			child:SetAttribute("AppleBound", true)
			bind(child)
		end
	end
	gui.ChildAdded:Connect(watch)
	for _, c in gui:GetChildren() do watch(c) end
end

if script and script:IsA("LocalScript") then AppleGameUI.start() end
return AppleGameUI
