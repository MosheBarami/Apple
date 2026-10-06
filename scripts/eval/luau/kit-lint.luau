-- Kit lint v2 (planning/UI-SPEC-v2.md §3.5 and §9), run in edit or play mode on every ScreenGui. Rules:
--   untagged      a visible GuiObject that draws something and has no StudKit attribute
--   nostroke      a text with no UIStroke
--   font          a font other than FredokaOne
--   emoji         an emoji in any text
--   banned-text   "R$", "Gems <n>", ">" used as an arrow, "Placeholder", "Coming soon", "Empty", "Item Name"
--   same-hue      a stroke whose colour is within dE 25 of the face it outlines (the contour must be the navy, so a
--                 navy stroke always passes, even round a navy track)
--   white-band    a translucent white frame covering more than 15 % of a face (the v1 shine band)
--   black-shadow  a translucent black frame (shadows are the contour colour or a darker shade of the face)
--   navy-body     a window body darker than the cloud body (no navy wells unless the request asked for dark)
--   tinted-fixed  ImageColor3 on an icon that is not from a tintable family image
--   hidden-scroll a ScrollingFrame whose canvas is taller than it and that shows no scroll bar
--   small-text    text under 18 px at 1080p (scaled from the current viewport)
local HttpService = game:GetService("HttpService")
local findings, objects = {}, 0
local camera = workspace.CurrentCamera
local vpY = camera and camera.ViewportSize.Y or 1080
local function find(rule, inst, detail)
	if #findings < 80 then table.insert(findings, { rule = rule, path = inst:GetFullName(), detail = detail }) end
end
local function isText(o)
	return (o:IsA("TextLabel") or o:IsA("TextButton") or o:IsA("TextBox")) and o.Text ~= ""
end
local function draws(o)
	if o.BackgroundTransparency < 0.95 then return true end
	if isText(o) then return true end
	if (o:IsA("ImageLabel") or o:IsA("ImageButton")) and o.Image ~= "" and o.ImageTransparency < 0.95 then return true end
	return false
end
-- CIE Lab from sRGB, for the dE 76 of the same-hue rule.
local function lab(c)
	local function lin(v) return v <= 0.04045 and v / 12.92 or ((v + 0.055) / 1.055) ^ 2.4 end
	local r, g, b = lin(c.R), lin(c.G), lin(c.B)
	local x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
	local y = 0.2126 * r + 0.7152 * g + 0.0722 * b
	local z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
	local function f(t) return t > 0.008856 and t ^ (1 / 3) or 7.787 * t + 16 / 116 end
	return 116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))
end
local function dE(a, b)
	local l1, a1, b1 = lab(a)
	local l2, a2, b2 = lab(b)
	return math.sqrt((l1 - l2) ^ 2 + (a1 - a2) ^ 2 + (b1 - b2) ^ 2)
end
-- The colour a face shows: the middle of its gradient, else its background.
local function faceColour(o)
	local g = o:FindFirstChildOfClass("UIGradient")
	if g and g.Enabled and #g.Color.Keypoints > 0 then
		local k = g.Color.Keypoints
		return k[math.ceil(#k / 2)].Value
	end
	return o.BackgroundColor3
end
local EMOJI = { "[\240-\244][\128-\191][\128-\191][\128-\191]", "\226\156[\128-\191]", "\226\157[\128-\191]", "\226\152[\128-\191]", "\226\153[\128-\191]", "\239\184\143" }
local BANNED = { "R%$", "[Gg]ems %d", "%s>%s", "^>%s", "[Pp]laceholder", "[Cc]oming soon", "^%s*[Ee]mpty%s*$", "[Ii]tem [Nn]ame" }
local function lum(c) return 0.2126 * c.R + 0.7152 * c.G + 0.0722 * c.B end

for _, gui in game:GetService("StarterGui"):GetChildren() do
	if not gui:IsA("ScreenGui") then continue end
	for _, o in gui:GetDescendants() do
		if o:IsA("UIStroke") then
			local parent = o.Parent
			if parent and parent:IsA("GuiObject") and not isText(parent) and parent.BackgroundTransparency < 0.95 and o.Transparency < 0.9 then
				local d = dE(o.Color, faceColour(parent))
				if o.Name ~= "Rim" and o.Color:ToHex() ~= "0b1a33" and d < 25 then find("same-hue", o, string.format("stroke dE %.0f from its face", d)) end
			end
			continue
		end
		if not o:IsA("GuiObject") then continue end
		objects += 1
		local kit = o:GetAttribute("StudKit")
		if draws(o) and kit == nil then find("untagged", o) end
		if isText(o) then
			if not o:FindFirstChildOfClass("UIStroke") then find("nostroke", o) end
			local family = o.FontFace and o.FontFace.Family or ""
			if not string.find(family, "FredokaOne") and not string.find(family, "Fredoka") then find("font", o, family) end
			for _, pat in EMOJI do if string.find(o.Text, pat) then find("emoji", o, string.sub(o.Text, 1, 30)) break end end
			for _, pat in BANNED do if string.find(o.Text, pat) then find("banned-text", o, string.sub(o.Text, 1, 30)) break end end
			local px = o.TextBounds.Y * 1080 / math.max(1, vpY)
			if o.Visible and px > 0 and px < 18 then find("small-text", o, string.format("'%s' is %d px at 1080p", string.sub(o.Text, 1, 24), math.floor(px))) end
		end
		if o:IsA("Frame") and o.BackgroundTransparency > 0.05 and o.BackgroundTransparency < 0.95 then
			local c = o.BackgroundColor3
			local parent = o.Parent
			local share = parent and parent:IsA("GuiObject") and (o.AbsoluteSize.X * o.AbsoluteSize.Y) / math.max(1, parent.AbsoluteSize.X * parent.AbsoluteSize.Y) or 0
			if c.R > 0.9 and c.G > 0.9 and c.B > 0.9 and share > 0.15 then find("white-band", o, string.format("%d%% of its face", math.floor(share * 100))) end
			if c.R < 0.06 and c.G < 0.06 and c.B < 0.06 then find("black-shadow", o) end
		end
		if kit == "window.body" and lum(faceColour(o)) < 0.75 then find("navy-body", o) end
		if (o:IsA("ImageLabel") or o:IsA("ImageButton")) and o.Image ~= "" and o.ImageColor3 ~= Color3.new(1, 1, 1) and o:GetAttribute("StudKitTinted") ~= true and kit ~= nil and string.find(kit, "icon") then
			find("tinted-fixed", o)
		end
		if o:IsA("ScrollingFrame") and o.AbsoluteCanvasSize.Y > o.AbsoluteSize.Y + 4 and o.ScrollBarThickness == 0 then
			find("hidden-scroll", o, string.format("canvas %d px in a %d px frame", o.AbsoluteCanvasSize.Y, o.AbsoluteSize.Y))
		end
	end
end
local counts = {}
for _, f in findings do counts[f.rule] = (counts[f.rule] or 0) + 1 end
return HttpService:JSONEncode({ objects = objects, findings = findings, counts = counts })
