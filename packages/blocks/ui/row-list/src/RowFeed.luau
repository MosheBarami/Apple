-- Feed "leaderboard": rows show ReplicatedStorage.Leaderboard_<Stat> (the leaderboard block) as it updates.
-- Feed "upgrades": each row's button buys the upgrade named by its label (ReplicatedStorage.UpgradeBuy); the value shows
-- the live level, the button the next cost, slate when it cannot be afforded. The server decides every buy.
-- Written by StudPilot's row-list block; edit freely.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local player = Players.LocalPlayer
local gui = script.Parent
local list = gui:WaitForChild("Window"):WaitForChild("Content"):WaitForChild("List")
local feed, stat = list:GetAttribute("Feed"), list:GetAttribute("Stat")
local SLATE = ColorSequence.new(Color3.fromHex("5A6270"), Color3.fromHex("3E4450"))
local function rows()
	local t = {}
	for _, r in list:GetChildren() do if r:IsA("Frame") and string.match(r.Name, "^Row%d+$") then table.insert(t, r) end end
	table.sort(t, function(a, b) return a.LayoutOrder < b.LayoutOrder end)
	return t
end
local function parts(row)
	local fill = row:FindFirstChild("Fill")
	return fill and fill:FindFirstChild("Texts"), fill and fill:FindFirstChild("Right")
end
if feed == "leaderboard" and type(stat) == "string" and stat ~= "" then
	local source = ReplicatedStorage:WaitForChild("Leaderboard_" .. stat, 120)
	if not source then return end
	local function show()
		for i, row in rows() do
			local v = source:FindFirstChild("Rank" .. i)
			local name, value = string.match(v and v.Value or "", "^(.*)|(.*)$")
			row.Visible = name ~= nil
			local texts, right = parts(row)
			if name and texts and right then
				texts.Label.Text = ("#%d  %s"):format(i, name)
				right.Value.Text = value .. " " .. stat
			end
		end
	end
	source.ChildAdded:Connect(function(v) v.Changed:Connect(show); show() end)
	source.ChildRemoved:Connect(show)
	for _, v in source:GetChildren() do v.Changed:Connect(show) end
	show()
elseif feed == "upgrades" then
	for _, row in rows() do
		local texts, right = parts(row)
		if not (texts and right) then continue end
		local name = texts.Label.Text
		local key = "Upgrade_" .. string.gsub(name, "[^%w]", "")
		local fill = right:FindFirstChild("Action") and right.Action:FindFirstChild("Fill")
		local gloss = fill and fill:FindFirstChild("Gloss")
		local colour = gloss and gloss.Color
		local function show()
			local level, cost = player:GetAttribute(key .. "_Level"), player:GetAttribute(key .. "_Cost")
			if type(level) == "number" then right.Value.Text = "Lv " .. level end
			if fill and type(cost) == "number" then
				fill.Label.Text = cost < 0 and "MAX" or tostring(cost)
				local have = stat ~= "" and player:GetAttribute(stat)
				if gloss then gloss.Color = (cost < 0 or (type(have) == "number" and have < cost)) and SLATE or colour end
			end
		end
		player:GetAttributeChangedSignal(key .. "_Level"):Connect(show)
		player:GetAttributeChangedSignal(key .. "_Cost"):Connect(show)
		if stat ~= "" then player:GetAttributeChangedSignal(stat):Connect(show) end
		show()
		if fill then
			fill.Activated:Connect(function()
				local remote = ReplicatedStorage:FindFirstChild("UpgradeBuy")
				if remote then pcall(function() return remote:InvokeServer(name) end) end
			end)
		end
	end
end
