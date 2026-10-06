--[[
	GamepassPerk: owners of PASS_ID get PERK ("speed", "jump" or "multiplier") AMOUNT times. Checked on join and on
	purchase. PASS_ID 0 is a placeholder; with TEST_IN_STUDIO everyone has the perk in Studio playtests. Written by
	StudPilot's gamepass-perk block; edit freely.
]]
local Players = game:GetService("Players")
local MarketplaceService = game:GetService("MarketplaceService")
local RunService = game:GetService("RunService")

local PASS_ID = {{passId}}
local PERK = {{perk}}
local AMOUNT = {{amount}}
local TEST_IN_STUDIO = {{testInStudio}}
local GamepassPerk = { AMOUNT = AMOUNT, PERK = PERK }
local owners = {}

function GamepassPerk.speedFor(owns: boolean): number return if owns then 16 * AMOUNT else 16 end
function GamepassPerk.owns(player): boolean return owners[player] == true end
function GamepassPerk.multiplier(player): number return if PERK == "multiplier" and owners[player] then AMOUNT else 1 end

local function check(player): boolean
	if TEST_IN_STUDIO and RunService:IsStudio() then return true end
	if PASS_ID == 0 then return false end
	local ok, owns = pcall(function() return MarketplaceService:UserOwnsGamePassAsync(player.UserId, PASS_ID) end)
	return ok and owns == true
end

local function apply(player)
	local h = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
	if not h then return end
	local owns = owners[player] == true
	if PERK == "speed" then h.WalkSpeed = GamepassPerk.speedFor(owns) end
	if PERK == "jump" then h.UseJumpPower = true; h.JumpPower = if owns then 50 * AMOUNT else 50 end
end

local function join(player)
	owners[player] = check(player)
	player:SetAttribute("HasPerk", owners[player])
	player.CharacterAdded:Connect(function(c) c:WaitForChild("Humanoid", 10); apply(player) end)
	apply(player)
end

MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player, passId, bought)
	if bought and passId == PASS_ID then
		owners[player] = true
		player:SetAttribute("HasPerk", true)
		apply(player)
	end
end)
Players.PlayerAdded:Connect(join)
for _, p in Players:GetPlayers() do task.spawn(join, p) end
Players.PlayerRemoving:Connect(function(p) owners[p] = nil end)
return GamepassPerk
