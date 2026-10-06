-- Layout lint (planning/STYLE-BIBLE.md §6.3), run in edit mode while a panel is shown (proofOpen "show"), so the
-- rectangles are the ones the picture shows. It measures what a person sees and reports, per rule:
--   clipped      content cut off by a clipping ancestor or the screen edge (more than a quarter of it hidden)
--   spill        an item's content reaching into a neighbouring item of the same list
--   collision    a text overlapping another text or an icon it does not belong to
--   same-icon    three or more items of one list showing the same picture in the same tint
--   overflow     a text larger than its box (TextFits false or TextBounds past the box)
--   tiny-text    a text under 12 px tall on screen
--   zero-size    an icon or text that is shown but has no area (a zero width or height: it can never be seen)
--   price-word   a button's price spelled with a currency word ("Gems 100") instead of the currency icon
-- Content is what carries meaning: a text with words, or a picture that is not a kit surface layer.
local HttpService = game:GetService("HttpService")
local STUD = "rbxassetid://7447638591"
local DECOR = { studs = true, shine = true, rim = true, lip = true, highlight = true, shadow = true, fill = true, outline = true, slate = true, gloss = true }
local CURRENCY = { "gems?", "coins?", "cash", "gold", "diamonds?", "tokens?", "bucks", "money" }
local findings, objects = {}, 0
local camera = workspace.CurrentCamera
local vp = camera and camera.ViewportSize or Vector2.new(1174, 623)
local function find(rule, inst, detail)
	if #findings < 80 then table.insert(findings, { rule = rule, path = inst:GetFullName(), detail = detail }) end
end
local function kitOf(o)
	local k = o:GetAttribute("StudKit")
	if type(k) ~= "string" then return nil, nil end
	local c, p = string.match(k, "^([%w_]+)%.([%w_]+)")
	return c, p
end
local function isText(o)
	return (o:IsA("TextLabel") or o:IsA("TextButton") or o:IsA("TextBox")) and o.Text ~= "" and o.TextTransparency < 0.9
end
local function isPicture(o)
	if not (o:IsA("ImageLabel") or o:IsA("ImageButton")) or o.Image == "" or o.ImageTransparency >= 0.9 then return false end
	if o.Image == STUD then return false end
	local _, p = kitOf(o)
	return not (p and DECOR[p])
end
local function shown(o)
	local x = o
	while x and x:IsA("GuiObject") do
		if not x.Visible then return false end
		x = x.Parent
	end
	return x == nil or not x:IsA("ScreenGui") or x.Enabled
end
local function rect(o)
	local p, s = o.AbsolutePosition, o.AbsoluteSize
	return { p.X, p.Y, p.X + s.X, p.Y + s.Y }
end
-- The box the text's glyphs cover, placed by its alignment inside the label.
local function textRect(o)
	local r, b = rect(o), o.TextBounds
	local w, h = math.min(b.X, r[3] - r[1]), math.min(b.Y, r[4] - r[2])
	local x = r[1]
	if o.TextXAlignment == Enum.TextXAlignment.Center then x = (r[1] + r[3] - w) / 2 elseif o.TextXAlignment == Enum.TextXAlignment.Right then x = r[3] - w end
	local y = r[2]
	if o.TextYAlignment == Enum.TextYAlignment.Center then y = (r[2] + r[4] - h) / 2 elseif o.TextYAlignment == Enum.TextYAlignment.Bottom then y = r[4] - h end
	return { x, y, x + w, y + h }
end
local function area(r) return math.max(0, r[3] - r[1]) * math.max(0, r[4] - r[2]) end
local function inter(a, b) return area({ math.max(a[1], b[1]), math.max(a[2], b[2]), math.min(a[3], b[3]), math.min(a[4], b[4]) }) end
local function related(a, b) return a == b or a:IsDescendantOf(b) or b:IsDescendantOf(a) end
-- The list item an object belongs to: its nearest kit holder whose parent holds two or more holders of the same component.
local function itemOf(o)
	local x = o.Parent
	while x and x:IsA("GuiObject") do
		local c, p = kitOf(x)
		if p == "holder" and x.Parent then
			local n = 0
			for _, s in x.Parent:GetChildren() do
				local c2, p2 = kitOf(s)
				if c2 == c and p2 == "holder" then n += 1 end
			end
			if n >= 2 then return x, c end
		end
		x = x.Parent
	end
	return nil, nil
end
local content = {}
for _, gui in game:GetService("StarterGui"):GetChildren() do
	if not gui:IsA("ScreenGui") or not gui.Enabled then continue end
	for _, o in gui:GetDescendants() do
		if not o:IsA("GuiObject") or not shown(o) then continue end
		objects += 1
		local r = rect(o)
		if area(r) < 4 then
			if (o:IsA("ImageLabel") or o:IsA("ImageButton")) and o.Image ~= "" and o.Image ~= STUD or (isText(o)) then
				find("zero-size", o, string.format("%s is %dx%d: it can never be seen", o.Name, math.floor(r[3] - r[1]), math.floor(r[4] - r[2])))
			end
			continue
		end
		local c, p = kitOf(o)
		if isText(o) then
			table.insert(content, { o = o, r = textRect(o), text = true })
			local tr = textRect(o)
			if tr[4] - tr[2] < 12 then find("tiny-text", o, string.format("'%s' is %d px tall", string.sub(o.Text, 1, 30), math.floor(tr[4] - tr[2]))) end
			if not o.TextScaled and (o.TextBounds.X > o.AbsoluteSize.X + 2 or o.TextBounds.Y > o.AbsoluteSize.Y + 2) then
				find("overflow", o, string.format("'%s' needs %dx%d in a %dx%d box", string.sub(o.Text, 1, 30), o.TextBounds.X, o.TextBounds.Y, o.AbsoluteSize.X, o.AbsoluteSize.Y))
			elseif o.TextScaled and not o.TextFits then
				find("overflow", o, string.format("'%s' does not fit even scaled", string.sub(o.Text, 1, 30)))
			end
			-- A price is the text of a button: a reward note ("100 coins" under a coin icon) is not one.
			local inButton = false
			local a = o.Parent
			while a and a:IsA("GuiObject") do
				local ac = kitOf(a)
				if ac == "button" then inButton = true break end
				a = a.Parent
			end
			local lower = string.lower(o.Text)
			for _, w in (inButton and CURRENCY or {}) do
				if string.match(lower, "^%s*" .. w .. "%s*[%d,%.]+[kmb]?%s*$") or string.match(lower, "^%s*[%d,%.]+[kmb]?%s*" .. w .. "%s*$") then
					find("price-word", o, string.format("'%s' spells the currency; show its icon and the number", o.Text))
					break
				end
			end
		elseif isPicture(o) then
			table.insert(content, { o = o, r = r, text = false })
		end
	end
end
-- clipped: against every clipping ancestor and the screen.
for _, e in content do
	local visible, full = e.r, area(e.r)
	if full < 16 then continue end
	local x = e.o.Parent
	while x and x:IsA("GuiObject") do
		if x.ClipsDescendants then
			local cr = rect(x)
			visible = { math.max(visible[1], cr[1]), math.max(visible[2], cr[2]), math.min(visible[3], cr[3]), math.min(visible[4], cr[4]) }
		end
		x = x.Parent
	end
	visible = { math.max(visible[1], 0), math.max(visible[2], 0), math.min(visible[3], vp.X), math.min(visible[4], vp.Y) }
	local hidden = 1 - area(visible) / full
	if hidden > 0.25 then
		local what = e.text and ("'" .. string.sub(e.o.Text, 1, 30) .. "'") or "a picture"
		find("clipped", e.o, string.format("%s is %d%% cut off", what, math.floor(hidden * 100)))
	end
end
-- spill and collision.
for i, a in content do
	local ia, ca = itemOf(a.o)
	if ia then
		for _, s in ia.Parent:GetChildren() do
			local cs, ps = kitOf(s)
			if s ~= ia and cs == ca and ps == "holder" and s:IsA("GuiObject") and shown(s) then
				local share = inter(a.r, rect(s)) / math.max(1, area(a.r))
				if share > 0.08 then find("spill", a.o, string.format("%d%% of it lies on the neighbouring %s '%s'", math.floor(share * 100), ca, s.Name)) end
			end
		end
	end
	if a.text then
		for j, b in content do
			if i ~= j and not related(a.o, b.o) and (b.text == false or j > i) then
				local share = inter(a.r, b.r) / math.max(1, area(a.r))
				if share > 0.12 then
					local what = b.text and ("text '" .. string.sub(b.o.Text, 1, 24) .. "'") or ("picture " .. b.o.Name)
					find("collision", a.o, string.format("'%s' is %d%% covered by %s", string.sub(a.o.Text, 1, 24), math.floor(share * 100), what))
				end
			end
		end
	end
end
-- same-icon: the first picture of each item of a list.
local lists = {}
for _, e in content do
	if not e.text then
		local item, c = itemOf(e.o)
		if item then
			local key = item.Parent
			lists[key] = lists[key] or { items = {}, component = c }
			if not lists[key].items[item] then lists[key].items[item] = e.o.Image .. "|" .. tostring(e.o.ImageColor3) end
		end
	end
end
for parent, l in lists do
	local counts, n = {}, 0
	for _, k in l.items do
		n += 1
		counts[k] = (counts[k] or 0) + 1
	end
	for _, c in counts do
		if c >= 3 then
			find("same-icon", parent, string.format("%d of %d %ss show the same picture in the same tint", c, n, l.component))
			break
		end
	end
end
return HttpService:JSONEncode({ objects = objects, viewport = { vp.X, vp.Y }, findings = findings })
