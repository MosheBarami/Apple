-- Kit lint (planning/STYLE-BIBLE.md §6.1), run in edit mode after the build. Reads every ScreenGui in StarterGui and
-- reports, per rule, the GuiObjects that break it:
--   untagged  a visible GuiObject without a StudKit attribute (layout holders that draw nothing are exempt)
--   nostroke  a text with no UIStroke
--   font      a default font (SourceSans, Legacy, Arial)
--   grey      a raw grey fill (saturation below 0.15) outside the slate token and disabled states
local HttpService = game:GetService("HttpService")
local findings, objects = {}, 0
local function find(rule, inst)
	if #findings < 60 then table.insert(findings, { rule = rule, path = inst:GetFullName() }) end
end
local function sat(c)
	local h, s, v = c:ToHSV()
	return s
end
local function draws(o)
	if o.BackgroundTransparency < 0.95 then return true end
	if (o:IsA("TextLabel") or o:IsA("TextButton") or o:IsA("TextBox")) and o.Text ~= "" then return true end
	if (o:IsA("ImageLabel") or o:IsA("ImageButton")) and o.Image ~= "" and o.ImageTransparency < 0.95 then return true end
	return false
end
local function greyFill(o)
	if o.BackgroundTransparency >= 0.9 then return false end
	local kit = o:GetAttribute("StudKit")
	if type(kit) == "string" and (string.find(kit, "slate") or string.find(kit, "disabled") or string.find(kit, "white") or string.find(kit, "shadow") or string.find(kit, "highlight") or string.find(kit, "lip")) then return false end
	local g = o:FindFirstChildOfClass("UIGradient")
	if g and g.Enabled then
		for _, k in g.Color.Keypoints do if sat(k.Value) >= 0.15 then return false end end
		return true
	end
	return sat(o.BackgroundColor3) < 0.15
end
local BAD_FONTS = { "SourceSans", "Legacy", "Arial" }
for _, gui in game:GetService("StarterGui"):GetChildren() do
	if not gui:IsA("ScreenGui") then continue end
	for _, o in gui:GetDescendants() do
		if not o:IsA("GuiObject") then continue end
		objects += 1
		if draws(o) and o:GetAttribute("StudKit") == nil then find("untagged", o) end
		if (o:IsA("TextLabel") or o:IsA("TextButton") or o:IsA("TextBox")) and o.Text ~= "" then
			if not o:FindFirstChildOfClass("UIStroke") then find("nostroke", o) end
			local family = o.FontFace and o.FontFace.Family or ""
			for _, bad in BAD_FONTS do if string.find(family, bad) then find("font", o) break end end
		end
		if greyFill(o) then find("grey", o) end
	end
end
local counts = {}
for _, f in findings do counts[f.rule] = (counts[f.rule] or 0) + 1 end
return HttpService:JSONEncode({ objects = objects, findings = findings, counts = counts })
