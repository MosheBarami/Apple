--[[
	Rounds: lobby LOBBY seconds -> round ROUND seconds -> lobby. At the end, each player who is alive and was moved into
	the round is paid REWARD of CURRENCY. ReplicatedStorage attributes Phase/TimeLeft and each player's Round attribute
	("Lobby 0:23") show it. Written by StudPilot's round-loop block; edit freely.
]]
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Currency = require(script.Parent:WaitForChild("Currency"))

local LOBBY = {{lobbySeconds}}
local ROUND = {{roundSeconds}}
local MIN_PLAYERS = {{minPlayers}}
local CURRENCY = {{currency}}
local REWARD = {{reward}}
local ARENA = {{arena}}
local Rounds = {}

function Rounds.clock(seconds: number): string
	seconds = math.max(0, math.floor(seconds))
	return ("%d:%02d"):format(seconds // 60, seconds % 60)
end

--[[ Pure: the players who win, given who is alive and who is in the round. ]]
function Rounds.winners(players, isAlive, isInRound)
	local out = {}
	for _, p in players do if isAlive(p) and isInRound(p) then table.insert(out, p) end end
	return out
end

local function show(phase: string, left: number)
	ReplicatedStorage:SetAttribute("Phase", phase)
	ReplicatedStorage:SetAttribute("TimeLeft", left)
	for _, p in Players:GetPlayers() do p:SetAttribute("Round", phase .. " " .. Rounds.clock(left)) end
end

local function spawns(): { BasePart }
	local arena = workspace:FindFirstChild(ARENA)
	local list = {}
	if arena then for _, d in arena:GetDescendants() do if d:IsA("BasePart") and string.sub(d.Name, 1, 5) == "Spawn" then table.insert(list, d) end end end
	return list
end

local function moveTo(player, part: BasePart?)
	local character = player.Character
	if character and part then character:PivotTo(part.CFrame + Vector3.new(0, part.Size.Y / 2 + 3, 0)) end
end

local function alive(player): boolean
	local h = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
	return h ~= nil and h.Health > 0
end

local inRound = {}
task.spawn(function()
	while true do
		for left = LOBBY, 1, -1 do
			if #Players:GetPlayers() < MIN_PLAYERS then show("Waiting", 0) task.wait(1) break end
			show("Lobby", left)
			task.wait(1)
		end
		if #Players:GetPlayers() >= MIN_PLAYERS then
			local points = spawns()
			table.clear(inRound)
			for i, p in Players:GetPlayers() do
				if alive(p) then
					inRound[p] = true
					moveTo(p, points[(i - 1) % math.max(#points, 1) + 1])
				end
			end
			for left = ROUND, 1, -1 do
				show("Round", left)
				task.wait(1)
				if next(inRound) == nil then break end
			end
			for _, p in Rounds.winners(Players:GetPlayers(), alive, function(p) return inRound[p] == true end) do
				if REWARD > 0 then Currency.grant(p, CURRENCY, REWARD, "round win") end
				p:SetAttribute("Round", "You won! +" .. REWARD)
			end
			for p in inRound do if p.Parent then p:LoadCharacter() end end
			table.clear(inRound)
			task.wait(3)
		end
	end
end)

Players.PlayerRemoving:Connect(function(p) inRound[p] = nil end)
return Rounds
