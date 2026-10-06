--[[
	Leaderboard: every EVERY seconds, saves each player's STAT to an OrderedDataStore and publishes the global top SIZE as
	ReplicatedStorage.Leaderboard_<STAT>: StringValues Rank1..RankN, each "DisplayName|Value". Without DataStore access
	(an unpublished place) it ranks the players in this server. Written by StudPilot's leaderboard block; edit freely.
]]
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local STAT = {{stat}}
local SIZE = {{size}}
local EVERY = {{every}}

local folder = ReplicatedStorage:FindFirstChild("Leaderboard_" .. STAT) or Instance.new("Folder")
folder.Name = "Leaderboard_" .. STAT
folder.Parent = ReplicatedStorage

local ok, store = pcall(function() return DataStoreService:GetOrderedDataStore("Top_" .. STAT) end)
if not ok then store = nil end

local function valueOf(player): number?
	local v = player:GetAttribute(STAT)
	if type(v) == "number" then return v end
	local stats = player:FindFirstChild("leaderstats")
	local s = stats and stats:FindFirstChild(STAT)
	return s and tonumber(s.Value)
end

local names = {}
local function nameOf(userId: number): string
	if names[userId] then return names[userId] end
	local p = Players:GetPlayerByUserId(userId)
	if p then names[userId] = p.DisplayName return p.DisplayName end
	local okName, n = pcall(function() return Players:GetNameFromUserIdAsync(userId) end)
	names[userId] = okName and n or ("Player " .. userId)
	return names[userId]
end

local function publish(rows)
	for i = 1, SIZE do
		local row = rows[i]
		local v = folder:FindFirstChild("Rank" .. i)
		if row then
			v = v or Instance.new("StringValue")
			v.Name = "Rank" .. i
			v.Value = row.name .. "|" .. tostring(math.floor(row.value))
			v.Parent = folder
		elseif v then
			v:Destroy()
		end
	end
end

local function refresh()
	local rows = {}
	if store then
		for _, p in Players:GetPlayers() do
			local v = valueOf(p)
			if v then pcall(function() store:SetAsync(tostring(p.UserId), math.floor(v)) end) end
		end
		local okPages, pages = pcall(function() return store:GetSortedAsync(false, SIZE) end)
		if okPages then
			for _, entry in pages:GetCurrentPage() do
				table.insert(rows, { name = nameOf(tonumber(entry.key) or 0), value = entry.value })
			end
		end
	end
	if #rows == 0 then
		for _, p in Players:GetPlayers() do
			local v = valueOf(p)
			if v then table.insert(rows, { name = p.DisplayName, value = v }) end
		end
		table.sort(rows, function(a, b) return a.value > b.value end)
	end
	publish(rows)
end

task.spawn(function()
	task.wait(5)
	while true do
		refresh()
		task.wait(EVERY)
	end
end)
