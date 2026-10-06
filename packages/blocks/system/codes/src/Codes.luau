--[[
	Codes: Codes.redeem(player, text) -> ok, message. A code is matched ignoring case and spaces at the ends, pays its
	reward once per player (used codes are saved in the currency record) and is refused when unknown or used. One try per
	second per player. Written by StudPilot's codes block; edit freely.
]]
local Players = game:GetService("Players")
local Currency = require(script.Parent:WaitForChild("Currency"))

local CODES = {{codes}}
local Codes = { CODES = CODES }
local byCode = {}
for _, c in CODES do byCode[string.upper(c.code)] = c end
local last = {}

function Codes.redeem(player, text): (boolean, string)
	if type(text) ~= "string" or #text > 40 then return false, "That code did not work" end
	local now = os.clock()
	if last[player] and now - last[player] < 1 then return false, "Slow down a little" end
	last[player] = now
	if not Currency.ready(player) then return false, "Loading..." end
	local code = string.upper((text:gsub("^%s+", ""):gsub("%s+$", "")))
	local reward = byCode[code]
	if not reward then return false, "That code did not work" end
	local used = Currency.getData(player, "Codes")
	if type(used) ~= "table" then used = {} end
	if used[code] then return false, "You already used that code" end
	used[code] = true
	Currency.setData(player, "Codes", used)
	Currency.grant(player, reward.currency, reward.amount, "code " .. code)
	return true, ("+%d %s!"):format(reward.amount, reward.currency)
end

Players.PlayerRemoving:Connect(function(p) last[p] = nil end)
return Codes
