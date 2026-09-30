--!strict
--[[
	AppleHud: makes a library UI kit's screens show the game. It fills the kit's own labels from the game's
	state and turns the kit's shop into this game's shop; it never draws new panels. Which label is which comes
	from ReplicatedStorage.AppleComponents.AppleClientConfig.ui (dotted paths under PlayerGui, set by the
	composer after it looked at the kit), and falls back to names when a role is not given:
	  money, wave, timer, base, baseBar, message, shopButton, shopLabel, shopPanel, shopClose, shopList, shopCard.
	Words are in AppleClientConfig.words so the game speaks its own theme ("Wave", "Next wave in", ...).
]]
local AppleHud = {}

--[[ Pure: 1234 -> "1.2K", 5 -> "5". ]]
function AppleHud.short(n: number): string
	local abs = math.abs(n)
	for _, u in { { 1e12, "T" }, { 1e9, "B" }, { 1e6, "M" }, { 1e3, "K" } } do
		if abs >= u[1] then
			local v = n / u[1]
			return (if v >= 100 then ("%d"):format(math.floor(v)) else (("%.1f"):format(v):gsub("%.0$", ""))) .. u[2]
		end
	end
	return tostring(math.floor(n))
end

--[[ Pure: keep a label's own currency sign. "$299,999" + 50 -> "$50"; "299 Coins" -> "50 Coins". ]]
function AppleHud.money(original: string, n: number): string
	local prefix = original:match("^%s*([^%d%s%.,]+)%s*[%d]") -- "$", "¢", "💰"
	local suffix = original:match("[%d][%d,%.]*%s*([^%d%s]+)%s*$") -- "Coins", "c"
	local body = AppleHud.short(n)
	if prefix then return prefix .. body end
	if suffix then return body .. " " .. suffix end
	return body
end

--[[ Pure: seconds -> "0:12". ]]
function AppleHud.clock(s: number): string
	s = math.max(0, math.floor(s))
	return ("%d:%02d"):format(s // 60, s % 60)
end

local ROLE_NAMES: { [string]: { string } } = {
	money = { "money", "cash", "coins", "coin", "gold", "sheckles", "currency", "balance" },
	wave = { "wave", "round", "level" },
	timer = { "timer", "countdown", "time", "attacktimer" },
	base = { "health", "hp", "base", "lives" },
	message = { "notification", "notify", "message", "toast", "alert" },
	shopButton = { "shopbutton", "shopbtn", "openshop", "shop" },
	shopPanel = { "shop", "store", "seedshop", "seeds" },
}

local function norm(s: string): string return (s:lower():gsub("[%s_%-]", "")) end

local function byPath(root: Instance, path: string?): Instance?
	if not path or path == "" then return nil end
	local at: Instance? = root
	for part in path:gmatch("[^%.]+") do
		at = at and at:FindFirstChild(part)
	end
	return at
end

local function guess(root: Instance, role: string, want: (Instance) -> boolean): Instance?
	local names = ROLE_NAMES[role]
	if not names then return nil end
	for _, n in names do
		for _, d in root:GetDescendants() do
			if want(d) and norm(d.Name) == n then return d end
		end
	end
	for _, n in names do
		for _, d in root:GetDescendants() do
			if want(d) and norm(d.Name):find(n, 1, true) then return d end
		end
	end
	return nil
end

local function isText(d: Instance): boolean return d:IsA("TextLabel") or d:IsA("TextButton") end
local function isButton(d: Instance): boolean return d:IsA("GuiButton") end
local function isPanel(d: Instance): boolean return d:IsA("Frame") or d:IsA("ScrollingFrame") or d:IsA("ImageLabel") or d:IsA("CanvasGroup") end

--[[ The text a role shows; a label inside a button or frame is found when the role landed on its holder. ]]
local function textOf(node: Instance?): Instance?
	if not node then return nil end
	if isText(node) then return node end
	for _, d in node:GetDescendants() do if d:IsA("TextLabel") then return d end end
	return nil
end

--[[ Set a label's text, and its copies: kits draw outlines and shadows as child labels with the same text
	("Money" with a "White" child reading "$299,999"). ]]
local function setText(label: any, text: string)
	local before = label.Text
	label.Text = text
	for _, d in label:GetDescendants() do
		if (d:IsA("TextLabel") or d:IsA("TextButton")) and d.Text == before then d.Text = text end
	end
end

local function viewport(model: Instance, holder: GuiObject)
	local vf: ViewportFrame
	if holder:IsA("ViewportFrame") then
		vf = holder
	else
		vf = Instance.new("ViewportFrame")
		vf.Name = "AppleItemView"
		vf.BackgroundTransparency = 1
		vf.Size = UDim2.fromScale(1, 1)
		vf.ZIndex = holder.ZIndex + 1
		vf.Parent = holder
	end
	local world = vf:FindFirstChildWhichIsA("WorldModel") or vf
	local copy = model:Clone()
	copy.Parent = world
	local cam = Instance.new("Camera")
	cam.FieldOfView = 30
	cam.Parent = vf
	vf.CurrentCamera = cam
	if copy:IsA("Model") then
		local cf, size = copy:GetBoundingBox()
		local r = size.Magnitude / 2
		local dist = r / math.tan(math.rad(cam.FieldOfView / 2)) * 1.05
		-- In front of the model (it faces its LookVector), a little to the side and above.
		cam.CFrame = CFrame.lookAt(cf.Position + (cf.LookVector + cf.RightVector * 0.35 + Vector3.new(0, 0.35, 0)).Unit * dist, cf.Position)
	end
end

function AppleHud.start()
	local Players = game:GetService("Players")
	local ReplicatedStorage = game:GetService("ReplicatedStorage")
	local player = Players.LocalPlayer
	local gui = player:WaitForChild("PlayerGui")
	local comps = ReplicatedStorage:WaitForChild("AppleComponents")
	local cfgModule = comps:FindFirstChild("AppleClientConfig")
	local cfg = if cfgModule then require(cfgModule) :: any else {}
	local ui = cfg.ui or {}
	local words = cfg.words or {}
	local State = require(comps:WaitForChild("AppleClientState")) :: any
	local state = ReplicatedStorage:WaitForChild("AppleState")
	local currency = cfg.currency or "Coins"
	task.wait(1) -- screens from StarterGui arrive a moment after the character

	local function find(role: string, want: (Instance) -> boolean): Instance?
		return byPath(gui, ui[role]) or guess(gui, role, want)
	end

	-- A label the game uses shows, even where the kit hid it (a counter from a feature the kit's game had off).
	local function reveal(node: Instance?)
		local at = node
		while at and not at:IsA("ScreenGui") and not at:IsA("PlayerGui") do
			if at:IsA("GuiObject") then at.Visible = true end
			at = at.Parent
		end
	end

	-- Money.
	local money = textOf(find("money", function(d) return isText(d) or isPanel(d) end)) :: any
	local moneyOriginal = if money then money.Text else ""
	local function showMoney()
		if money then setText(money, AppleHud.money(moneyOriginal, player:GetAttribute(currency) or 0)) end
	end
	player:GetAttributeChangedSignal(currency):Connect(showMoney)
	showMoney()

	-- Waves.
	local wave = textOf(find("wave", isText)) :: any
	local timer = textOf(find("timer", isText)) :: any
	local base = textOf(find("base", isText)) :: any
	for _, node in { money, wave, timer, base } do reveal(node) end
	local shopLabel = byPath(gui, ui.shopLabel) :: any
	if shopLabel and words.shop then setText(shopLabel, words.shop) end
	local bar = byPath(gui, ui.baseBar) :: any
	local barFull = if bar then bar.Size else nil
	local function showWaves()
		local phase = state:GetAttribute("Phase")
		local n = state:GetAttribute("Wave") or 0
		if wave then setText(wave, ("%s %d"):format(words.wave or "Wave", math.max(1, if phase == "intermission" then n + 1 else n))) end
		if timer then
			if phase == "intermission" then setText(timer, ("%s %s"):format(words.nextWave or "Next wave in", AppleHud.clock(state:GetAttribute("NextWaveIn") or 0)))
			elseif phase == "lost" then setText(timer, words.lost or "They got through! Starting over...")
			else setText(timer, ("%d %s"):format(state:GetAttribute("EnemiesLeft") or 0, words.left or "left")) end
		end
		local hp, max = state:GetAttribute("BaseHealth") or 0, math.max(1, state:GetAttribute("BaseHealthMax") or 1)
		if base then setText(base, ("%s %d/%d"):format(words.base or "Base", hp, max)) end
		if bar and barFull then bar.Size = UDim2.new(barFull.X.Scale * hp / max, barFull.X.Offset * hp / max, barFull.Y.Scale, barFull.Y.Offset) end
	end
	for _, k in { "Phase", "Wave", "NextWaveIn", "EnemiesLeft", "BaseHealth", "BaseHealthMax" } do
		state:GetAttributeChangedSignal(k):Connect(showWaves)
	end
	showWaves()

	-- Messages.
	local message = textOf(find("message", isText)) :: any
	local token = 0
	State.Said:Connect(function(text: string, good: boolean)
		if not message then return end
		token += 1
		local mine = token
		message.Text = text
		message.TextColor3 = if good then Color3.fromRGB(120, 255, 120) else Color3.fromRGB(255, 110, 100)
		local holder = message :: GuiObject
		holder.Visible = true
		task.delay(2.5, function() if token == mine then holder.Visible = false end end)
	end)
	if message then (message :: GuiObject).Visible = false end

	-- Shop.
	local panel = find("shopPanel", isPanel) :: any
	local list = byPath(gui, ui.shopList) or (panel and (panel:FindFirstChildWhichIsA("ScrollingFrame", true) or panel))
	local card = byPath(gui, ui.shopCard) :: any
	if not card and list then
		for _, c in list:GetChildren() do if c:IsA("GuiObject") then card = c break end end
	end
	local openButton = find("shopButton", isButton) :: any
	local close = byPath(gui, ui.shopClose) :: any
	if not close and panel then
		for _, d in panel:GetDescendants() do
			if isButton(d) and (norm(d.Name):find("close", 1, true) or norm(d.Name) == "x" or norm(d.Name) == "exit") then close = d break end
		end
	end
	if panel then
		panel.Visible = false
		if openButton and openButton ~= panel then openButton.Activated:Connect(function() panel.Visible = not panel.Visible end) end
		if close then close.Activated:Connect(function() panel.Visible = false; State.pick(nil) end) end
	end
	if list and card then
		local catalog = {}
		for _, f in ReplicatedStorage:WaitForChild("AppleCatalog"):GetChildren() do
			table.insert(catalog, { id = f.Name, name = f:GetAttribute("Name") or f.Name, price = f:GetAttribute("Price") or 0, order = f:GetAttribute("Order") or 0,
				blurb = f:GetAttribute("Blurb"), rarity = f:GetAttribute("Rarity") })
		end
		table.sort(catalog, function(a, b) return a.order < b.order end)
		local models = ReplicatedStorage:WaitForChild("AppleItemModels")
		local template = card:Clone()
		for _, c in list:GetChildren() do if c:IsA("GuiObject") and c ~= card and c.Name == card.Name then c:Destroy() end end
		card:Destroy()
		for i, item in catalog do
			local c = template:Clone()
			c.Name = "AppleItem_" .. item.id
			c.LayoutOrder = i
			c.Visible = true
			-- The creator's own sales never show in this game: Robux and gift buttons are hidden.
			for _, d in c:GetDescendants() do
				local n = norm(d.Name)
				if d:IsA("GuiObject") and (n:find("robux", 1, true) or n:find("gift", 1, true) or n:find("premium", 1, true)) then d.Visible = false end
			end
			local function shown(d: Instance): boolean
				local at: Instance? = d
				while at and at ~= c do
					if at:IsA("GuiObject") and not at.Visible then return false end
					at = at.Parent
				end
				return true
			end
			local texts = {}
			for _, d in c:GetDescendants() do if (d:IsA("TextLabel") or d:IsA("TextButton")) and shown(d) and d.Text ~= "" and not (d.Parent and (d.Parent:IsA("TextLabel") or d.Parent:IsA("TextButton"))) then table.insert(texts, d) end end
			local priceLabel, nameLabel, blurbLabel, rarityLabel = nil, nil, nil, nil
			for _, t in texts do
				local n = norm(t.Name)
				if not priceLabel and (n:find("price", 1, true) or n:find("cost", 1, true) or t.Text:find("%$") or t.Text:match("^%s*[%d,%.]+%s*%a*$")) then priceLabel = t end
			end
			for _, t in texts do
				local n = norm(t.Name)
				if t == priceLabel then continue end
				if not nameLabel and (n:find("name", 1, true) or n:find("title", 1, true)) then nameLabel = t
				elseif not blurbLabel and (n:find("desc", 1, true) or n:find("stock", 1, true) or n:find("info", 1, true) or n:find("stat", 1, true)) then blurbLabel = t
				elseif not rarityLabel and n:find("rarity", 1, true) then rarityLabel = t end
			end
			if not nameLabel then
				for _, t in texts do if t ~= priceLabel and t ~= blurbLabel and t ~= rarityLabel and (not nameLabel or #t.Text > #nameLabel.Text) then nameLabel = t end end
			end
			for _, t in texts do
				if t ~= priceLabel and t ~= nameLabel and t ~= blurbLabel and t ~= rarityLabel and not t:IsA("TextButton") then setText(t, "") end
			end
			if nameLabel then setText(nameLabel, item.name) end
			if priceLabel then setText(priceLabel, AppleHud.money(priceLabel.Text ~= "" and priceLabel.Text or "$0", item.price)) end
			if blurbLabel then setText(blurbLabel, item.blurb or "") end
			if rarityLabel then setText(rarityLabel, item.rarity or "") end
			local icon: GuiObject? = c:FindFirstChildWhichIsA("ViewportFrame", true)
			if not icon then
				for _, d in c:GetDescendants() do
					if d:IsA("ImageLabel") and (norm(d.Name):find("icon", 1, true) or norm(d.Name):find("image", 1, true) or norm(d.Name):find("picture", 1, true)) then icon = d break end
				end
			end
			local model = models:FindFirstChild(item.id)
			if icon and model then
				if icon:IsA("ImageLabel") then (icon :: ImageLabel).Image = "" end
				viewport(model, icon)
			end
			local buyButton: GuiButton? = nil
			for _, d in c:GetDescendants() do
				if d:IsA("GuiButton") and shown(d) and (norm(d.Name):find("buy", 1, true) or (d.Parent and norm(d.Parent.Name):find("buy", 1, true))) then buyButton = d break end
			end
			if not buyButton and c:IsA("GuiButton") then buyButton = c end
			if not buyButton then
				for _, d in c:GetDescendants() do if d:IsA("GuiButton") and shown(d) then buyButton = d break end end
			end
			if buyButton then
				buyButton.Activated:Connect(function()
					State.pick(item.id)
					State.say((words.pick or "Tap a glowing spot to place") .. " " .. item.name, true)
					if panel then panel.Visible = false end
				end)
			end
			c.Parent = list
		end
	end
end

if script and script:IsA("LocalScript") then AppleHud.start() end
return AppleHud
