-- Opened-state proof (planning/STYLE-BIBLE.md §6.3), sent by scripts/eval/run-piece.mjs with three lines prepended:
--     local MODE = "list" | "show" | "restore"
--     local INDEX = <n>          -- for "show": which openable panel, from 1
--     local SIDE = "edit" | "client"
-- A panel is openable when a GuiObject carries the attribute ProofOpen = true (every StudKit window does: that is its
-- proofOpen hook). A build without the hook falls back to the hidden top-level frames of its ScreenGuis. "show" opens
-- panel INDEX only (and switches its ScreenGui on), marking what it changed so "restore" puts exactly that back.
-- Every mode answers with the panels and the screen area the UI covers, in viewport pixels, for the colour gate.
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")

local root
if SIDE == "client" then
	local player = Players.LocalPlayer
	root = player and player:FindFirstChildOfClass("PlayerGui")
else
	root = game:GetService("StarterGui")
end
if not root then return HttpService:JSONEncode({ panels = {}, source = "none", error = "no GUI root" }) end

local function guis()
	local list = {}
	for _, g in root:GetChildren() do
		if g:IsA("ScreenGui") and g.Name ~= "Freecam" then table.insert(list, g) end
	end
	table.sort(list, function(a, b) return a.Name < b.Name end)
	return list
end

local panels, source = {}, "hook"
for _, g in guis() do
	for _, d in g:GetDescendants() do
		if d:IsA("GuiObject") and d:GetAttribute("ProofOpen") == true then table.insert(panels, d) end
	end
end
if #panels == 0 then
	source = "fallback"
	for _, g in guis() do
		for _, d in g:GetChildren() do
			if d:IsA("GuiObject") and d.Visible == false then table.insert(panels, d) end
		end
	end
end
if #panels == 0 then source = "none" end

local function mark(inst, prop, value)
	if inst:GetAttribute("StudPilotProofWas_" .. prop) == nil then inst:SetAttribute("StudPilotProofWas_" .. prop, inst[prop]) end
	inst[prop] = value
end

if MODE == "restore" then
	local function putBack(inst)
		for _, prop in { "Visible", "Enabled" } do
			local was = inst:GetAttribute("StudPilotProofWas_" .. prop)
			if was ~= nil then
				inst[prop] = was
				inst:SetAttribute("StudPilotProofWas_" .. prop, nil)
			end
		end
	end
	for _, g in guis() do
		putBack(g)
		for _, inst in g:GetDescendants() do putBack(inst) end
	end
elseif MODE == "show" and #panels > 0 then
	local target = panels[((INDEX - 1) % #panels) + 1]
	for _, p in panels do if p ~= target and p.Visible then mark(p, "Visible", false) end end
	local at = target
	while at and at ~= root do
		if at:IsA("GuiObject") and not at.Visible then mark(at, "Visible", true) end
		if at:IsA("ScreenGui") and not at.Enabled then mark(at, "Enabled", true) end
		at = at.Parent
	end
end

-- The UI area: the shown panel, else every visible top-level piece of UI.
local camera = workspace.CurrentCamera
local view = camera and camera.ViewportSize or Vector2.new(0, 0)
local x0, y0, x1, y1 = math.huge, math.huge, -math.huge, -math.huge
local function add(o)
	local p, s = o.AbsolutePosition, o.AbsoluteSize
	if s.X <= 0 or s.Y <= 0 then return end
	x0, y0 = math.min(x0, p.X), math.min(y0, p.Y)
	x1, y1 = math.max(x1, p.X + s.X), math.max(y1, p.Y + s.Y)
end
if MODE == "show" and #panels > 0 then
	add(panels[((INDEX - 1) % #panels) + 1])
else
	for _, g in guis() do
		if g.Enabled then for _, d in g:GetChildren() do if d:IsA("GuiObject") and d.Visible then add(d) end end end
	end
end
local names = {}
for _, p in panels do table.insert(names, p:GetFullName()) end
return HttpService:JSONEncode({
	panels = names,
	source = source,
	viewport = { view.X, view.Y },
	bounds = x0 < x1 and { math.max(0, x0), math.max(0, y0), math.min(view.X, x1), math.min(view.Y, y1) } or nil,
})
