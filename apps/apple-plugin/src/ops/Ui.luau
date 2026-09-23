--!nocheck
-- Apple Studio op family: USER INTERFACE (tool expansion Phase A).
--
--   ui_layout_check  (read)          lays a ScreenGui's contents out at device sizes and measures it
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

	local function handleLayoutCheck(self, op)
		local screen, screenPath, err, kind = api.resolvePath(self.game, self.options.services, op.screen, false)
		if not screen then return nil, kind or "not_found", err end
		if api.classNameOf(screen) ~= "ScreenGui" then return nil, "invalid", "screen must be a ScreenGui (for example game.StarterGui.ShopGui)" end
		local devices = op.devices or { "phone_landscape", "desktop" }
		if type(devices) ~= "table" or #devices == 0 or #devices > 5 then return nil, "invalid", "devices must list 1-5 of phone_portrait, phone_landscape, tablet, desktop, console_tv" end
		for _, device in devices do
			if not Ui.DEVICES[device] then return nil, "invalid", "unknown device " .. tostring(device) end
		end
		local coreGui = api.serviceFrom(self.game, self.options.services, "CoreGui")
		if coreGui == nil then return nil, "refused", "CoreGui is unavailable, so the layout cannot be measured without touching the place", "none" end
		local ignoreInset = read(screen, "IgnoreGuiInset") == true
		local children = api.childrenOf(screen) or {}

		local host = nil
		local ok, result = pcall(function()
			local report = {}
			for _, device in devices do
				local spec = Ui.DEVICES[device]
				local width, height = spec[1], spec[2]
				host = api.makeInstance(self.options, "ScreenGui")
				host.Name = "AppleLayoutCheck"
				host.ResetOnSpawn = false
				host.IgnoreGuiInset = ignoreInset
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
					task.wait()
					task.wait()
				end
				local measured, measureErr = measure(frame, width, height, spec[3], spec[3] and ignoreInset, screenPath)
				pcall(function() host:Destroy() end)
				host = nil
				if not measured then error(measureErr, 0) end
				table.insert(report, { device = device, size = { width, height }, elements = measured.elements, issues = measured.issues })
			end
			return report
		end)
		if host ~= nil then pcall(function() host:Destroy() end) end
		if not ok then return nil, "internal", "layout check failed: " .. tostring(result) end
		local total = 0
		for _, entry in result do total += #entry.issues end
		return { screen = screenPath, devices = result, issues = total, verdict = if total == 0 then "pass" else "issues" }
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
		},
		readProperties = {
			AutomaticSize = true, ClipsDescendants = true, ZIndexBehavior = true, IgnoreGuiInset = true,
			ResetOnSpawn = true, DisplayOrder = true, MinTextSize = true, MaxTextSize = true,
			PaddingLeft = true, PaddingRight = true, PaddingTop = true, PaddingBottom = true,
			MaxSize = true, MinSize = true, ApplyStrokeMode = true, ScreenInsets = true, SafeAreaCompatibility = true,
			FlexMode = true, GrowRatio = true, ShrinkRatio = true, ItemLineAlignment = true, Wraps = true,
			HorizontalFlex = true, VerticalFlex = true, TextTransparency = true, TextStrokeTransparency = true, TextStrokeColor3 = true,
			ScrollingDirection = true,
		},
		enumAllow = {
			ZIndexBehavior = true, ScreenInsets = true, SafeAreaCompatibility = true, UIFlexMode = true,
			ItemLineAlignment = true, ApplyStrokeMode = true, UIFlexAlignment = true,
		},
	}
end

return Ui
