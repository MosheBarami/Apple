-- Feed "leaderboard": rows show ReplicatedStorage.Leaderboard_<Stat> (from the leaderboard block) as it updates.
-- Feed "upgrades": each row's button buys the upgrade named by its label (ReplicatedStorage.UpgradeBuy) and the value shows
-- the live level; the button shows the next cost and turns grey when it cannot be afforded. The server decides every buy.
-- Written by StudPilot's row-list block; edit freely.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local player = Players.LocalPlayer
local gui = script.Parent
local list = gui:WaitForChild("Window"):WaitForChild("Content"):WaitForChild("List")
local feed, stat = list:GetAttribute("Feed"), list:GetAttribute("Stat")
local GREY = ColorSequence.new(Color3.fromRGB(215, 221, 226), Color3.fromRGB(143, 154, 163))
local function rows()
	local t = {}
	for _, r in list:GetChildren() do if r:IsA("Frame") and string.match(r.Name, "^Row%d+$") then table.insert(t, r) end end
	table.sort(t, function(a, b) return a.LayoutOrder < b.LayoutOrder end)
	return t
end

if feed == "leaderboard" and type(stat) == "string" and stat ~= "" then
	local source = ReplicatedStorage:WaitForChild("Leaderboard_" .. stat, 120)
	if not source then return end
	local function show()
		for i, row in rows() do
			local v = source:FindFirstChild("Rank" .. i)
			local name, value = string.match(v and v.Value or "", "^(.*)|(.*)$")
			row.Visible = name ~= nil
			if name then
				row.Texts.Label.Text = name
				row.Right.Value.Text = value .. " " .. stat
				row.Chip.Icon.Text = tostring(i)
			end
		end
	end
	source.DescendantAdded:Connect(show)
	source.DescendantRemoving:Connect(function() task.defer(show) end)
	for _, v in source:GetChildren() do v.Changed:Connect(show) end
	source.ChildAdded:Connect(function(v) v.Changed:Connect(show) end)
	show()
elseif feed == "upgrades" then
	for _, row in rows() do
		local name = row.Texts.Label.Text
		local key = "Upgrade_" .. string.gsub(name, "[^%w]", "")
		local action = row.Right:FindFirstChild("Action")
		local face = action and action:FindFirstChild("Face")
		local tint = face and face:FindFirstChild("Tint")
		local colour = tint and tint.Color
		local function show()
			local level, cost = player:GetAttribute(key .. "_Level"), player:GetAttribute(key .. "_Cost")
			if type(level) == "number" then row.Right.Value.Text = "Lv " .. level end
			if face and type(cost) == "number" then
				face.Text.Text = cost < 0 and "MAX" or (tostring(cost) .. (stat ~= "" and (" " .. stat) or ""))
				local have = stat ~= "" and player:GetAttribute(stat)
				if tint then tint.Color = (cost < 0 or (type(have) == "number" and have < cost)) and GREY or colour end
			end
		end
		player:GetAttributeChangedSignal(key .. "_Level"):Connect(show)
		player:GetAttributeChangedSignal(key .. "_Cost"):Connect(show)
		if stat ~= "" then player:GetAttributeChangedSignal(stat):Connect(show) end
		show()
		if face then
			face.Activated:Connect(function()
				local remote = ReplicatedStorage:FindFirstChild("UpgradeBuy")
				if remote then pcall(function() return remote:InvokeServer(name) end) end
			end)
		end
	end
end
