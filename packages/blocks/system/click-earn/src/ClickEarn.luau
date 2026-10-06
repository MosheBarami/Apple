--[[
	ClickEarn: ClickEarn.click(player) pays AMOUNT (+ PER_LEVEL x the UPGRADE level, x the rebirth multiplier) of CURRENCY,
	at most once per COOLDOWN seconds per player. Written by StudPilot's click-earn block; edit freely.
]]
local Players = game:GetService("Players")
local Currency = require(script.Parent:WaitForChild("Currency"))

local CURRENCY = {{currency}}
local AMOUNT = {{amount}}
local COOLDOWN = {{cooldown}}
local UPGRADE = {{upgrade}}
local PER_LEVEL = {{perLevel}}
local ClickEarn = { CURRENCY = CURRENCY }

local function optional(name)
	local m = script.Parent:FindFirstChild(name)
	if not m then return nil end
	local ok, mod = pcall(require, m)
	return ok and mod or nil
end

function ClickEarn.amount(player): number
	local n = AMOUNT
	local Upgrades = UPGRADE ~= "" and optional("Upgrades")
	if Upgrades then n += PER_LEVEL * Upgrades.level(player, UPGRADE) end
	local Rebirth = optional("Rebirth")
	if Rebirth then n *= Rebirth.multiplier(player) end
	return math.floor(n)
end

local last = {}
function ClickEarn.click(player)
	local now = os.clock()
	if last[player] and now - last[player] < COOLDOWN then return end
	last[player] = now
	Currency.grant(player, CURRENCY, ClickEarn.amount(player), "click")
end

Players.PlayerRemoving:Connect(function(p) last[p] = nil end)
return ClickEarn
