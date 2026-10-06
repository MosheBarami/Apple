--[[
	Checkpoints: parts in Workspace.FOLDER named 1, 2, 3 (or Stage1, Stage2...). Touching the next one saves the stage
	(leaderstats Stage, Currency data "Stage"); a character spawns on its stage's checkpoint. Written by StudPilot's
	checkpoints block; edit freely.
]]
local Players = game:GetService("Players")
local Currency = require(script.Parent:WaitForChild("Currency"))

local FOLDER = {{folder}}
local SKIP_AHEAD = {{skipAhead}}
local Checkpoints = {}

function Checkpoints.number(name: string): number?
	return tonumber(string.match(name, "^(%d+)$") or string.match(name, "^[Ss]tage%s*(%d+)$"))
end

--[[ Pure: the stage after touching checkpoint `touched` from stage `stage`, or nil when it does not change. ]]
function Checkpoints.reach(stage: number, touched: number, skipAhead: boolean): number?
	if touched <= stage then return nil end
	if touched == stage + 1 or skipAhead then return touched end
	return nil
end

local folder = workspace:WaitForChild(FOLDER, 30)
local function partFor(stage: number): BasePart?
	if not folder then return nil end
	for _, p in folder:GetDescendants() do
		if p:IsA("BasePart") and Checkpoints.number(p.Name) == stage then return p end
	end
	return nil
end

local function stageOf(player): number return Currency.getData(player, "Stage") or 1 end
local function show(player)
	local stats = player:FindFirstChild("leaderstats")
	if not stats then return end
	local v = stats:FindFirstChild("Stage") or Instance.new("IntValue")
	v.Name = "Stage"
	v.Value = stageOf(player)
	v.Parent = stats
end

local function wire(part: BasePart)
	local n = Checkpoints.number(part.Name)
	if not n then return end
	part.Touched:Connect(function(hit)
		local player = Players:GetPlayerFromCharacter(hit.Parent)
		if not player or not Currency.ready(player) then return end
		local h = hit.Parent:FindFirstChildOfClass("Humanoid")
		if not h or h.Health <= 0 then return end
		local nextStage = Checkpoints.reach(stageOf(player), n, SKIP_AHEAD)
		if nextStage then
			Currency.setData(player, "Stage", nextStage)
			show(player)
		end
	end)
end
if folder then
	for _, p in folder:GetDescendants() do if p:IsA("BasePart") then wire(p) end end
	folder.DescendantAdded:Connect(function(p) if p:IsA("BasePart") then wire(p) end end)
end

local function join(player)
	while not Currency.ready(player) and player.Parent do task.wait(0.2) end
	if not player.Parent then return end
	show(player)
	local function place(character)
		local part = partFor(stageOf(player))
		local root = character:WaitForChild("HumanoidRootPart", 10)
		if part and root then
			task.wait()
			character:PivotTo(part.CFrame + Vector3.new(0, part.Size.Y / 2 + 3, 0))
		end
	end
	player.CharacterAdded:Connect(place)
	if player.Character then place(player.Character) end
end
Players.PlayerAdded:Connect(join)
for _, p in Players:GetPlayers() do task.spawn(join, p) end
return Checkpoints
