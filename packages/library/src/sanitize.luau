-- Master plan §4.1 L4, run in Studio on one model after it is loaded (prepended: local TARGET = <Instance>).
-- Removes every Script, LocalScript and ModuleScript (recording what each one reached for), sounds that play on their
-- own, invisible non-colliding parts and specks, and reports the part count against the budget. Never runs any of the code it removes.
local HttpService = game:GetService("HttpService")
local BUDGET_PARTS = 600
local BANNED = { "require%s*%(%s*%d", "getfenv", "setfenv", "loadstring", "HttpService", "MarketplaceService", "TeleportService", "InsertService" }
local report = { scripts = {}, removedSounds = 0, removedParts = 0, parts = 0, overBudget = false, flagged = false }
local function obfuscated(src)
	if #src > 2000 and not string.find(src, "\n") then return true end -- one giant line
	local _, escapes = string.gsub(src, "\\%d%d%d", "")
	return escapes > 200
end
for _, d in TARGET:GetDescendants() do
	if d:IsA("LuaSourceContainer") then
		local ok, src = pcall(function() return d.Source end)
		local hits = {}
		if ok and type(src) == "string" then
			for _, pat in BANNED do if string.find(src, pat) then table.insert(hits, pat) end end
			if obfuscated(src) then table.insert(hits, "obfuscated") end
		end
		if #hits > 0 then report.flagged = true end
		table.insert(report.scripts, { name = d:GetFullName(), class = d.ClassName, flags = hits })
	end
end
for _, d in TARGET:GetDescendants() do
	if d:IsA("LuaSourceContainer") then d:Destroy() end
end
for _, d in TARGET:GetDescendants() do
	if d:IsA("Sound") and (d.Playing or d.PlayOnRemove or d.Looped) then
		d:Destroy()
		report.removedSounds += 1
	elseif d:IsA("BasePart") then
		local s = d.Size
		-- Junk is an invisible part that also does not collide (a vehicle's invisible collision and wheel parts stay:
		-- tried on a free car, 2026-10-07, where the looser rule took out 30 working parts) or a speck.
		if d.Transparency >= 1 and not d.CanCollide and #d:GetChildren() == 0 or math.max(s.X, s.Y, s.Z) < 0.05 then
			d:Destroy()
			report.removedParts += 1
		end
	end
end
for _, d in TARGET:GetDescendants() do if d:IsA("BasePart") then report.parts += 1 end end
report.overBudget = report.parts > BUDGET_PARTS
return HttpService:JSONEncode(report)
