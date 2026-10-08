--!nocheck
-- StudPilot Studio op family: USER INTERFACE (tool expansion Phase A).
--
--   ui_layout_check  (read)          lays a ScreenGui's contents out at device sizes and measures it
--   measure_ui       (read)          the same lay-out at five viewport sizes with the build_ui engine's
--                                    checks (text fit, parent overflow, sibling overlap, covered buttons,
--                                    touch targets, tiny text); one entry per defect
--   play_check_ui    (consent-only)  the player-side play check, plus pressing on-screen buttons (F-050)
--
-- ui_layout_check changes nothing in the place: it clones the screen's children into a temporary
-- ScreenGui in CoreGui (Studio's own UI layer, which is never saved), placed far outside the
-- viewport, lets the engine lay it out, reads AbsolutePosition / AbsoluteSize / TextFits, and
-- destroys the clone on EVERY path. Scripts inside the clone are removed before it is parented.
--
-- It also adds the UI classes and properties build_ui needs (UIFlexItem, CanvasGroup, AutomaticSize,
-- padding, text-size limits, flex layout, ScreenGui insets). None is Content.

local Ui = {}
Ui.name = "ui"

Ui.DEVICES = {
	phone_portrait = { 390, 844, true },
	phone_landscape = { 844, 390, true },
	tablet = { 1024, 768, true },
	desktop = { 1920, 1080, false },
	console_tv = { 1920, 1080, false },
}
Ui.MIN_TOUCH = 44
-- measure_ui (the build_ui engine's check): five real screen sizes, the last three touch screens.
Ui.VIEWPORTS = {
	desktop = { 1920, 1080, false },
	laptop = { 1366, 768, false },
	tablet = { 1024, 768, true },
	phone_landscape = { 844, 390, true },
	phone_portrait = { 390, 844, true },
}
Ui.VIEWPORT_ORDER = { "desktop", "laptop", "tablet", "phone_landscape", "phone_portrait" }
Ui.MIN_TOUCH_PHONE = 32
Ui.MIN_TEXT_PHONE = 12
Ui.MAX_DEFECTS = 40
Ui.TOP_BAR = 58
Ui.MAX_ISSUES = 30

local function luminance(c)
	local function channel(v) if v <= 0.03928 then return v / 12.92 end return ((v + 0.055) / 1.055) ^ 2.4 end
	return 0.2126 * channel(c.R) + 0.7152 * channel(c.G) + 0.0722 * channel(c.B)
end

function Ui.contrast(a, b)
	local la, lb = luminance(a), luminance(b)
	if la < lb then la, lb = lb, la end
	return (la + 0.05) / (lb + 0.05)
end

function Ui.build(api)
	local function read(inst, property)
		local ok, value = pcall(function() return inst[property] end)
		if ok then return value end
		return nil
	end

	local function isGuiObject(inst)
		return api.isA(inst, "GuiObject") or read(inst, "AbsoluteSize") ~= nil
	end

	local function isInteractive(inst)
		local class = api.classNameOf(inst)
		return api.isA(inst, "GuiButton") or class == "TextButton" or class == "ImageButton" or class == "TextBox"
	end

	local function hasText(inst)
		local class = api.classNameOf(inst)
		return class == "TextLabel" or class == "TextButton" or class == "TextBox"
	end

	local function visibleWithin(node, root)
		local current, depth = node, 0
		while current and current ~= root and depth < 64 do
			depth += 1
			if read(current, "Visible") == false then return false end
			current = api.parentOf(current)
		end
		return current == root
	end

	local function underScrolling(node, root)
		local current = api.parentOf(node)
		while current and current ~= root do
			if api.classNameOf(current) == "ScrollingFrame" then return true end
			current = api.parentOf(current)
		end
		return false
	end

	local function relativeName(node, root, prefix)
		local names, current = {}, node
		while current and current ~= root do
			table.insert(names, 1, api.nameOf(current))
			current = api.parentOf(current)
		end
		return prefix .. "." .. table.concat(names, ".")
	end

	local function background(node, root)
		local current = node
		while current and current ~= root do
			local transparency = read(current, "BackgroundTransparency")
			local colour = read(current, "BackgroundColor3")
			if type(transparency) == "number" and transparency < 0.5 and colour then return colour end
			current = api.parentOf(current)
		end
		return nil
	end

	local function measure(frame, width, height, touch, topInset, prefix)
		local issues, elements, interactive = {}, 0, {}
		local function add(kind, node, detail)
			if #issues < Ui.MAX_ISSUES then table.insert(issues, { kind = kind, path = relativeName(node, frame, prefix), detail = detail }) end
		end
		local origin = read(frame, "AbsolutePosition")
		if not origin then return nil, "Studio did not lay the check out (no AbsolutePosition)" end
		for _, node in api.descendantsOf(frame) or {} do
			if isGuiObject(node) and visibleWithin(node, frame) then
				local pos, size = read(node, "AbsolutePosition"), read(node, "AbsoluteSize")
				if pos and size then
					elements += 1
					local x, y, w, h = pos.X - origin.X, pos.Y - origin.Y, size.X, size.Y
					local rect = { x = x, y = y, w = w, h = h, node = node }
					if not underScrolling(node, frame) then
						if w > 0 and h > 0 and (x + w <= 0 or y + h <= 0 or x >= width or y >= height) then
							add("offscreen", node, ("entirely outside the %dx%d screen"):format(width, height))
						elseif x < -1 or y < -1 or x + w > width + 1 or y + h > height + 1 then
							add("clipped", node, ("extends past the %dx%d screen edge"):format(width, height))
						end
					end
					if hasText(node) and read(node, "TextFits") == false and (read(node, "Text") or "") ~= "" then
						add("text_overflow", node, "its text does not fit its box")
					end
					if isInteractive(node) then
						table.insert(interactive, rect)
						if touch and math.min(w, h) < Ui.MIN_TOUCH then
							add("small_touch_target", node, ("%dx%d px is under the %d px a finger needs"):format(math.floor(w), math.floor(h), Ui.MIN_TOUCH))
						end
						if topInset and y < Ui.TOP_BAR then add("under_top_bar", node, "sits under Roblox's top bar, where the player cannot press it") end
					end
					if hasText(node) and (read(node, "TextTransparency") or 0) < 0.5 then
						local fg, bg = read(node, "TextColor3"), background(node, frame)
						if fg and bg then
							local ratio = Ui.contrast(fg, bg)
							local large = (read(node, "TextSize") or 14) >= 18
							if ratio < (if large then 3 else 4.5) then
								add("low_contrast", node, ("text contrast %.1f:1 is under %s:1"):format(ratio, if large then "3" else "4.5"))
							end
						end
					end
				end
			end
		end
		for i = 1, math.min(#interactive, 100) do
			for j = i + 1, math.min(#interactive, 100) do
				local a, b = interactive[i], interactive[j]
				if not api.isDescendantOf(a.node, b.node) and not api.isDescendantOf(b.node, a.node) then
					local ix = math.min(a.x + a.w, b.x + b.w) - math.max(a.x, b.x)
					local iy = math.min(a.y + a.h, b.y + b.h) - math.max(a.y, b.y)
					local smaller = math.min(a.w * a.h, b.w * b.h)
					if ix > 0 and iy > 0 and smaller > 0 and ix * iy > smaller * 0.25 then
						add("overlap", a.node, "overlaps the button " .. relativeName(b.node, frame, prefix))
					end
				end
			end
		end
		return { elements = elements, issues = issues }
	end

	-- Lays the screen's children out once per size: a clone in a frame of that size inside a temporary
	-- ScreenGui in CoreGui, measured by `measureOne(frame, size, ignoreInset, screenPath, screen)`, then
	-- destroyed. Returns the list of measurements and the screen's path, or nil and the failure.
	local function layOut(self, op, sizes, measureOne)
		local screen, screenPath, err, kind = api.resolvePath(self.game, self.options.services, op.screen, false, self)
		if not screen then return nil, kind or "not_found", err end
		if api.classNameOf(screen) ~= "ScreenGui" then return nil, "invalid", "screen must be a ScreenGui (for example game.StarterGui.ShopGui)" end
		local coreGui = api.serviceFrom(self.game, self.options.services, "CoreGui")
		if coreGui == nil then return nil, "refused", "CoreGui is unavailable, so the layout cannot be measured without touching the place", "none" end
		local ignoreInset = read(screen, "IgnoreGuiInset") == true
		local zBehavior = read(screen, "ZIndexBehavior")
		local children = api.childrenOf(screen) or {}

		local host = nil
		local ok, result = pcall(function()
			local report = {}
			for _, size in sizes do
				local width, height = size.width, size.height
				host = api.makeInstance(self.options, "ScreenGui")
				host.Name = "AppleLayoutCheck"
				host.ResetOnSpawn = false
				host.IgnoreGuiInset = ignoreInset
				if zBehavior ~= nil then pcall(function() host.ZIndexBehavior = zBehavior end) end
				local frame = api.makeInstance(self.options, "Frame")
				frame.Name = "Device"
				frame.BackgroundTransparency = 1
				frame.Size = UDim2.new(0, width, 0, height)
				-- Far outside the viewport: laid out by the engine, never seen by the person.
				frame.Position = UDim2.new(0, -20000 - width, 0, 0)
				frame.Parent = host
				for _, child in children do
					local copy = api.safeClone(child)
					if copy then
						for _, node in api.descendantsOf(copy) or {} do
							if api.isScript(node) then pcall(function() node.Parent = nil end) end
						end
						if not api.isScript(copy) then copy.Parent = frame end
					end
				end
				host.Parent = coreGui
				if type(self.options.waitForLayout) == "function" then
					self.options.waitForLayout(host)
				else
					-- AutomaticSize, flex and text measurement settle over a few frames.
					for _ = 1, size.frames or 2 do task.wait() end
				end
				local measured, measureErr = measureOne(frame, size, ignoreInset, screenPath, screen)
				pcall(function() host:Destroy() end)
				host = nil
				if not measured then error(measureErr, 0) end
				table.insert(report, measured)
			end
			return report
		end)
		if host ~= nil then pcall(function() host:Destroy() end) end
		if not ok then return nil, "internal", "layout check failed: " .. tostring(result) end
		return result, screenPath
	end

	local function handleLayoutCheck(self, op)
		local devices = op.devices or { "phone_landscape", "desktop" }
		if type(devices) ~= "table" or #devices == 0 or #devices > 5 then return nil, "invalid", "devices must list 1-5 of phone_portrait, phone_landscape, tablet, desktop, console_tv" end
		local sizes = {}
		for _, device in devices do
			local spec = Ui.DEVICES[device]
			if not spec then return nil, "invalid", "unknown device " .. tostring(device) end
			table.insert(sizes, { name = device, width = spec[1], height = spec[2], touch = spec[3] })
		end
		local result, screenPath, err, extra = layOut(self, op, sizes, function(frame, size, ignoreInset, prefix)
			local measured, measureErr = measure(frame, size.width, size.height, size.touch, size.touch and ignoreInset, prefix)
			if not measured then return nil, measureErr end
			return { device = size.name, size = { size.width, size.height }, elements = measured.elements, issues = measured.issues }
		end)
		if result == nil then return nil, screenPath, err, extra end
		local total = 0
		for _, entry in result do total += #entry.issues end
		return { screen = screenPath, devices = result, issues = total, verdict = if total == 0 then "pass" else "issues" }
	end

	------------------------------------------------------------------------------------------------
	-- measure_ui: the build_ui engine's check. Every defect names the element and the viewports it
	-- happens at. Kinds:
	--   text_overflow      the text does not fit its box (TextFits false, or TextBounds past the padded box)
	--   text_truncated     single-line text cut with "..." (minor: deliberate in lists, a defect in a title)
	--   text_cramped       text on a filled box with under 4 px of room to its edge
	--   collapsed          an element with text laid out 0 px wide or tall
	--   overflows_parent   spills past its parent's edge (cut_off when the parent clips)
	--   overlap            two siblings outside a layout cover each other
	--   covered            a button or input has another element drawn over it
	--   off_screen, past_screen_edge, under_top_bar
	--   small_touch_target, tiny_text (touch viewports), unbounded_scaled_text, low_contrast
	------------------------------------------------------------------------------------------------
	local LAYOUTS = { UIListLayout = true, UIGridLayout = true, UIPageLayout = true, UITableLayout = true }

	local function childOfClass(node, className)
		for _, child in api.childrenOf(node) or {} do
			if api.classNameOf(child) == className then return child end
		end
		return nil
	end

	local function painted(node)
		local bgT = read(node, "BackgroundTransparency")
		if type(bgT) == "number" and bgT < 0.95 then return true end
		if hasText(node) and (read(node, "Text") or "") ~= "" and (read(node, "TextTransparency") or 0) < 0.95 then return true end
		local image = read(node, "Image")
		if type(image) == "string" and image ~= "" and (read(node, "ImageTransparency") or 0) < 0.95 then return true end
		return false
	end

	local function udimPx(value, total)
		if value == nil then return 0 end
		local okScale, scale = pcall(function() return value.Scale end)
		local okOffset, offset = pcall(function() return value.Offset end)
		return (if okScale and type(scale) == "number" then scale * total else 0) + (if okOffset and type(offset) == "number" then offset else 0)
	end

	-- The text box inside its UIPadding: left, top, right, bottom insets in px.
	local function insets(node, w, h)
		local pad = childOfClass(node, "UIPadding")
		if not pad then return 0, 0, 0, 0 end
		return udimPx(read(pad, "PaddingLeft"), w), udimPx(read(pad, "PaddingTop"), h), udimPx(read(pad, "PaddingRight"), w), udimPx(read(pad, "PaddingBottom"), h)
	end

	local function enumName(value)
		if value == nil then return nil end
		return string.match(tostring(value), "([%w_]+)$")
	end

	-- Does `a` draw over `b`? Neither is the other's ancestor. Sibling ordering: the two branches under
	-- the common ancestor compare ZIndex, then child order (later draws on top). Global: ZIndex first.
	local function drawsAbove(a, b, frame, global)
		if global then
			local za, zb = read(a, "ZIndex") or 1, read(b, "ZIndex") or 1
			if za ~= zb then return za > zb end
		end
		local chainA, seen = {}, {}
		local current = a
		while current and current ~= frame do
			table.insert(chainA, current)
			seen[current] = #chainA
			current = api.parentOf(current)
		end
		local branchB, cur = b, b
		while cur and cur ~= frame and seen[cur] == nil do
			branchB = cur
			cur = api.parentOf(cur)
		end
		if cur == nil then return false end
		local idx = seen[cur]
		local branchA = if idx then chainA[idx - 1] else chainA[#chainA]
		if branchA == nil or branchB == nil or branchA == branchB then return false end
		if not global then
			local za, zb = read(branchA, "ZIndex") or 1, read(branchB, "ZIndex") or 1
			if za ~= zb then return za > zb end
		end
		local order = {}
		for i, child in api.childrenOf(api.parentOf(branchA)) or {} do order[child] = i end
		return (order[branchA] or 0) > (order[branchB] or 0)
	end

	local function overlapArea(a, b)
		local ix = math.min(a.x + a.w, b.x + b.w) - math.max(a.x, b.x)
		local iy = math.min(a.y + a.h, b.y + b.h) - math.max(a.y, b.y)
		if ix <= 0 or iy <= 0 then return 0, 0, 0 end
		return ix * iy, ix, iy
	end

	local function contains(a, b)
		return a.x <= b.x + 1 and a.y <= b.y + 1 and a.x + a.w >= b.x + b.w - 1 and a.y + a.h >= b.y + b.h - 1
	end

	local function inspectText(node, r, touch, add)
		local label = read(node, "Text") or ""
		if label == "" then return end
		if r.w < 1 or r.h < 1 then
			add("collapsed", node, ("has text but is laid out %dx%d px (a fill or %% size inside an auto-sized parent collapses)"):format(math.floor(r.w), math.floor(r.h)))
			return
		end
		local l, t, rt, b = insets(node, r.w, r.h)
		local innerW, innerH = r.w - l - rt, r.h - t - b
		local bounds = read(node, "TextBounds")
		local truncate = enumName(read(node, "TextTruncate"))
		local wrapped = read(node, "TextWrapped") == true
		local fits = read(node, "TextFits")
		local over = bounds ~= nil and (bounds.X > innerW + 1 or bounds.Y > innerH + 1)
		if (fits == false or over) and truncate ~= nil and truncate ~= "None" and not wrapped then
			add("text_truncated", node, ("\"%s\" is cut with an ellipsis at %d px wide"):format(string.sub(label, 1, 40), math.floor(innerW)))
		elseif fits == false or over then
			local need = if bounds then (" (needs %dx%d px, has %dx%d)"):format(math.ceil(bounds.X), math.ceil(bounds.Y), math.floor(innerW), math.floor(innerH)) else ""
			add("text_overflow", node, "its text does not fit its box" .. need)
		elseif bounds ~= nil and (read(node, "BackgroundTransparency") or 1) < 0.95 then
			local xAlign = enumName(read(node, "TextXAlignment")) or "Center"
			local free = innerW - bounds.X
			local room = if xAlign == "Center" then math.min(l, rt) + free / 2 else math.min(l, rt)
			if room < 4 then
				add("text_cramped", node, ("its text is %d px from the edge of its filled box; pad or widen it"):format(math.max(0, math.floor(room))))
			end
		end
		if read(node, "TextScaled") == true then
			local limit = childOfClass(node, "UITextSizeConstraint")
			if limit == nil then
				add("unbounded_scaled_text", node, "TextScaled with no UITextSizeConstraint: huge on big screens, tiny on phones")
			elseif touch and (read(limit, "MinTextSize") or 1) < Ui.MIN_TEXT_PHONE then
				add("tiny_text", node, ("scaled text may shrink to %d px on a phone"):format(read(limit, "MinTextSize") or 1))
			end
		elseif touch and (read(node, "TextSize") or 14) < Ui.MIN_TEXT_PHONE then
			add("tiny_text", node, ("%d px text is too small to read on a phone"):format(read(node, "TextSize") or 14))
		end
	end

	local function inspect(frame, size, ignoreInset, prefix, screen)
		local width, height, touch = size.width, size.height, size.touch
		local found = {}
		local function add(kind, node, detail)
			table.insert(found, { kind = kind, path = relativeName(node, frame, prefix), detail = detail })
		end
		local origin = read(frame, "AbsolutePosition")
		if not origin then return nil, "Studio did not lay the check out (no AbsolutePosition)" end
		local insetsName = enumName(read(screen, "ScreenInsets"))
		local topBarOpen = ignoreInset and insetsName ~= "CoreUISafeInsets" and insetsName ~= "TopbarSafeInsets"
		local global = enumName(read(screen, "ZIndexBehavior")) == "Global"

		local nodes, rects, spilled = {}, {}, {}
		for _, node in api.descendantsOf(frame) or {} do
			if #nodes >= 600 then break end
			if isGuiObject(node) and visibleWithin(node, frame) then
				local pos, abs = read(node, "AbsolutePosition"), read(node, "AbsoluteSize")
				if pos and abs then
					table.insert(nodes, node)
					rects[node] = { x = pos.X - origin.X, y = pos.Y - origin.Y, w = abs.X, h = abs.Y }
				end
			end
		end

		for _, node in nodes do
			local r = rects[node]
			local parent = api.parentOf(node)
			local interactive = isInteractive(node)
			-- The screen's edges.
			if not underScrolling(node, frame) then
				if r.w > 0 and r.h > 0 and (r.x + r.w <= 0 or r.y + r.h <= 0 or r.x >= width or r.y >= height) then
					add("off_screen", node, ("entirely outside the %dx%d screen"):format(width, height))
				elseif parent == frame and (r.x < -1 or r.y < -1 or r.x + r.w > width + 1 or r.y + r.h > height + 1) then
					add("past_screen_edge", node, ("extends past the %dx%d screen edge"):format(width, height))
				end
			end
			-- Its parent's edges. A small text-less leaf may hang over a corner on purpose (a badge).
			local pr = rects[parent]
			if spilled[parent] then
				spilled[node] = true
			elseif pr and api.classNameOf(parent) ~= "ScrollingFrame" then
				local left, top = pr.x - r.x, pr.y - r.y
				local right, bottom = (r.x + r.w) - (pr.x + pr.w), (r.y + r.h) - (pr.y + pr.h)
				local worst = math.max(left, top, right, bottom)
				local leaf = not interactive and not (hasText(node) and (read(node, "Text") or "") ~= "") and #(api.childrenOf(node) or {}) == 0
				local badge = leaf and math.max(left, right) <= r.w / 2 and math.max(top, bottom) <= r.h / 2
				if worst > 1 and not badge then
					spilled[node] = true
					local side = if worst == right then "right" elseif worst == bottom then "bottom" elseif worst == left then "left" else "top"
					if read(parent, "ClipsDescendants") == true then
						add("cut_off", node, ("%d px is hidden past the %s edge of %s, which clips"):format(math.floor(worst), side, api.nameOf(parent)))
					else
						add("overflows_parent", node, ("spills %d px past the %s edge of %s"):format(math.floor(worst), side, api.nameOf(parent)))
					end
				end
			end
			if hasText(node) then
				inspectText(node, r, touch, add)
				if (read(node, "Text") or "") ~= "" and (read(node, "TextTransparency") or 0) < 0.5 then
					local fg, bg = read(node, "TextColor3"), background(node, frame)
					if fg and bg then
						local ratio = Ui.contrast(fg, bg)
						local large = (read(node, "TextSize") or 14) >= 18
						if ratio < (if large then 3 else 4.5) then
							add("low_contrast", node, ("text contrast %.1f:1 is under %s:1"):format(ratio, if large then "3" else "4.5"))
						end
					end
				end
			end
			if interactive then
				if touch and math.min(r.w, r.h) < Ui.MIN_TOUCH_PHONE then
					add("small_touch_target", node, ("%dx%d px is under the %d px a finger needs"):format(math.floor(r.w), math.floor(r.h), Ui.MIN_TOUCH_PHONE))
				end
				if topBarOpen and r.y < Ui.TOP_BAR then add("under_top_bar", node, "sits under Roblox's top bar, where the player cannot press it") end
			end
		end

		local function hasContent(node)
			if painted(node) or isInteractive(node) then return true end
			for _, d in api.descendantsOf(node) or {} do
				if rects[d] and (painted(d) or isInteractive(d)) then return true end
			end
			return false
		end

		-- Siblings that no layout positions must not sit on each other. A plain backdrop under a
		-- sibling it fully holds (a shadow, a dim) is a deliberate layer, not a collision.
		local byParent, parents = {}, {}
		for _, node in nodes do
			local parent = api.parentOf(node)
			local free = true
			if parent ~= frame then
				for _, child in api.childrenOf(parent) or {} do
					if LAYOUTS[api.classNameOf(child)] then free = false end
				end
			end
			if free then
				if byParent[parent] == nil then
					byParent[parent] = {}
					table.insert(parents, parent)
				end
				table.insert(byParent[parent], node)
			end
		end
		for _, parent in parents do
			local content = {}
			for _, node in byParent[parent] do
				if hasContent(node) then table.insert(content, node) end
			end
			for i = 1, math.min(#content, 60) do
				for j = i + 1, math.min(#content, 60) do
					local a, b = content[i], content[j]
					local ra, rb = rects[a], rects[b]
					local area, ix, iy = overlapArea(ra, rb)
					local smaller = math.min(ra.w * ra.h, rb.w * rb.h)
					if area > math.max(16, smaller * 0.04) then
						local backdrop = false
						for _, pair in { { a, b }, { b, a } } do
							local outer, inner = pair[1], pair[2]
							if contains(rects[outer], rects[inner]) and not isInteractive(outer) and not hasText(outer)
								and #(api.childrenOf(outer) or {}) <= 3 and drawsAbove(inner, outer, frame, global) then
								backdrop = true
							end
						end
						if not backdrop then
							add("overlap", a, ("overlaps its sibling %s by %dx%d px"):format(api.nameOf(b), math.floor(ix), math.floor(iy)))
						end
					end
				end
			end
		end

		-- Nothing may be drawn over a button or an input.
		local checked = 0
		for _, target in nodes do
			if isInteractive(target) then
				local rt = rects[target]
				local cx, cy = rt.x + rt.w / 2, rt.y + rt.h / 2
				for _, other in nodes do
					checked += 1
					if checked > 40000 then break end
					if other ~= target and not api.isDescendantOf(other, target) and not api.isDescendantOf(target, other)
						and (painted(other) or isInteractive(other) or read(other, "Active") == true) then
						local ro = rects[other]
						local area = overlapArea(rt, ro)
						local overCentre = cx > ro.x and cx < ro.x + ro.w and cy > ro.y and cy < ro.y + ro.h
						if area > 0 and (overCentre or area > rt.w * rt.h * 0.25) and drawsAbove(other, target, frame, global) then
							add("covered", target, ("%s is drawn over it"):format(relativeName(other, frame, prefix)))
							break
						end
					end
				end
			end
		end

		return { name = size.name, size = { width, height }, elements = #nodes, found = found }
	end

	local function handleMeasure(self, op)
		local wanted = op.viewports or Ui.VIEWPORT_ORDER
		if type(wanted) ~= "table" or #wanted == 0 or #wanted > #Ui.VIEWPORT_ORDER then
			return nil, "invalid", "viewports must list 1-5 of " .. table.concat(Ui.VIEWPORT_ORDER, ", ")
		end
		local sizes = {}
		for _, name in wanted do
			local spec = Ui.VIEWPORTS[name]
			if not spec then return nil, "invalid", "unknown viewport " .. tostring(name) .. "; use " .. table.concat(Ui.VIEWPORT_ORDER, ", ") end
			table.insert(sizes, { name = name, width = spec[1], height = spec[2], touch = spec[3], frames = 3 })
		end
		local result, screenPath, err, extra = layOut(self, op, sizes, inspect)
		if result == nil then return nil, screenPath, err, extra end
		-- One entry per defect, naming every viewport it happens at.
		local defects, byKey, viewports, truncated = {}, {}, {}, false
		for _, entry in result do
			table.insert(viewports, { name = entry.name, size = entry.size, elements = entry.elements })
			for _, item in entry.found do
				local key = item.kind .. "@" .. item.path
				local existing = byKey[key]
				if existing then
					table.insert(existing.at, entry.name)
				elseif #defects < Ui.MAX_DEFECTS then
					local defect = { kind = item.kind, path = item.path, detail = item.detail, at = { entry.name } }
					byKey[key] = defect
					table.insert(defects, defect)
				else
					truncated = true
				end
			end
		end
		return {
			screen = screenPath,
			verdict = if #defects == 0 then "pass" else "defects",
			defects = defects,
			truncated = truncated,
			viewports = viewports,
		}
	end

	-- The play check with button presses. Only a separate operation so that the worker can offer
	-- presses to plugins that report it and never to one that would ignore the field.
	local function handlePlayCheckUi(self, op)
		if type(op.press) ~= "table" or #op.press == 0 then return nil, "invalid", "play_check_ui needs press: 1-5 button paths" end
		local playCheck = api.handlers.play_check
		if type(playCheck) ~= "function" then return nil, "refused", "the player-side play check is not in this build", "none" end
		return playCheck(self, op)
	end

	return {
		handlers = {
			ui_layout_check = handleLayoutCheck,
			measure_ui = handleMeasure,
			play_check_ui = handlePlayCheckUi,
		},
		consentOnly = { play_check_ui = true },
		createClasses = { UIFlexItem = true, CanvasGroup = true },
		propertyAllow = {
			AutomaticSize = true, ClipsDescendants = true, ZIndexBehavior = true, IgnoreGuiInset = true,
			ResetOnSpawn = true, DisplayOrder = true, MinTextSize = true, MaxTextSize = true,
			PaddingLeft = true, PaddingRight = true, PaddingTop = true, PaddingBottom = true,
			MaxSize = true, MinSize = true, ApplyStrokeMode = true, ScreenInsets = true, SafeAreaCompatibility = true,
			FlexMode = true, GrowRatio = true, ShrinkRatio = true, ItemLineAlignment = true, Wraps = true,
			HorizontalFlex = true, VerticalFlex = true, TextTransparency = true, TextStrokeTransparency = true, TextStrokeColor3 = true,
			ScrollingDirection = true,
			TextTruncate = true, FontFace = true, VerticalScrollBarInset = true,
		},
		readProperties = {
			AutomaticSize = true, ClipsDescendants = true, ZIndexBehavior = true, IgnoreGuiInset = true,
			ResetOnSpawn = true, DisplayOrder = true, MinTextSize = true, MaxTextSize = true,
			PaddingLeft = true, PaddingRight = true, PaddingTop = true, PaddingBottom = true,
			MaxSize = true, MinSize = true, ApplyStrokeMode = true, ScreenInsets = true, SafeAreaCompatibility = true,
			FlexMode = true, GrowRatio = true, ShrinkRatio = true, ItemLineAlignment = true, Wraps = true,
			HorizontalFlex = true, VerticalFlex = true, TextTransparency = true, TextStrokeTransparency = true, TextStrokeColor3 = true,
			ScrollingDirection = true,
			TextTruncate = true, FontFace = true, VerticalScrollBarInset = true,
		},
		enumAllow = {
			ZIndexBehavior = true, ScreenInsets = true, SafeAreaCompatibility = true, UIFlexMode = true,
			ItemLineAlignment = true, ApplyStrokeMode = true, UIFlexAlignment = true,
			TextTruncate = true, ScrollBarInset = true,
		},
	}
end

return Ui
