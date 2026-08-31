--!strict
--[[
	Crystal Canyon — Theme: the UI construction kit.

	Every surface this game draws is built here, and that is the point. §2 of
	docs/ROBLOX-STYLE-SPEC.md says an otherwise perfect design fails the category
	test on outline weight alone, so this module is written so that there is no
	way to obtain a panel, a button, a card, a counter or an icon without the
	thick near-black outline, the rounded corner, the vertical gradient and the
	hard bottom edge already attached. Hud and Panels never call
	`Instance.new("Frame")` for a surface; they call in here.

	Section numbers in comments refer to that spec.

	Three decisions below are not obvious and are worth checking:

	1. Buttons carry TWO pieces of text machinery. The button's own `Text` is the
	   public API — callers do `btn.Text = "SELL"` and expect it to work — but its
	   single UIStroke is already spent on the silhouette (ApplyStrokeMode.Border),
	   so it cannot also carry the heavy contextual stroke §4 demands on type.
	   The caption therefore lives in a child TextLabel with its own stroke, the
	   button's native text is made invisible, and a property-changed connection
	   mirrors one into the other. `btn.Text` keeps working; the type gets its
	   outline.

	2. Depth is a real child, not a shadow (§3). Each button clips to its own
	   rounded silhouette and holds a darker band of the same hue pinned to its
	   lower edge. That band is what reads as thickness, and it is why every
	   button here sets ClipsDescendants — without the clip the band would square
	   off the rounded corners.

	3. Panels are sized by scale and clamped in pixels rather than given a fixed
	   width. A fixed 700px panel is unusable on a phone; a pure 60% scale panel
	   is unreadably narrow on one. So the panel picks a scale appropriate to the
	   viewport and a UISizeConstraint guarantees it can never exceed the screen.
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local Shared = ReplicatedStorage:WaitForChild("CrystalCanyon")
local Palette = require(Shared:WaitForChild("Palette") :: ModuleScript)
local Util = require(Shared:WaitForChild("Util") :: ModuleScript)

local Theme = {}

-- Layout constants. These are geometry, not balance, so they live here rather
-- than in Config — nothing in the economy can be tuned by moving them.
local EDGE_BUTTON = 6 -- §3 hard bottom edge, in pixels
local EDGE_PRESSED = 2 -- the edge a button sinks to while held
local HEADER_HEIGHT = 62
local BODY_PADDING = 18
local BACKDROP_DIM = 0.45

-- Below this viewport width the panel switches to a near-full-bleed layout.
-- A 60%-wide modal on a 390pt phone is a column of clipped words.
local NARROW_VIEWPORT = 700

local PANEL_SCALE_WIDE = UDim2.fromScale(0.60, 0.68)
local PANEL_SCALE_NARROW = UDim2.fromScale(0.94, 0.80)
local PANEL_MAX = Vector2.new(820, 680)
local PANEL_MIN = Vector2.new(280, 240)

-- Modals sit above the HUD. ScreenGui ZIndexBehavior is Sibling, so this only
-- has to beat the HUD's own root frames, not every descendant.
local Z_BACKDROP = 50

--------------------------------------------------------------------------------
-- primitives
--------------------------------------------------------------------------------

local function corner(inst: GuiObject, radius: UDim): UICorner
	local c = Instance.new("UICorner")
	c.CornerRadius = radius
	c.Parent = inst
	return c
end

--[[ §3 Slight vertical gradient on fills: lighter top, deeper bottom. The
	 gradient multiplies the instance's BackgroundColor3, so hover/press states
	 can recolour the fill underneath it and the shading survives. ]]
local function gradient(inst: GuiObject, fill: Color3): UIGradient
	local g = Instance.new("UIGradient")
	g.Rotation = 90 -- 0 is left-to-right; 90 runs top-to-bottom
	g.Color = ColorSequence.new(Palette.lift(fill), Palette.shade(fill, 0.10))
	g.Parent = inst
	return g
end

--[[ §3 Depth is a hard bottom edge, not a soft shadow: a darker band of the
	 same hue along the lower edge. `host` must clip, or the band's square ends
	 will punch through the rounded corners. ]]
local function hardEdge(host: GuiObject, fill: Color3, thickness: number): Frame
	local edge = Instance.new("Frame")
	edge.Name = "Edge"
	edge.AnchorPoint = Vector2.new(0.5, 1)
	edge.Position = UDim2.fromScale(0.5, 1)
	edge.Size = UDim2.new(1, 0, 0, thickness)
	edge.BackgroundColor3 = Palette.shade(fill)
	edge.BorderSizePixel = 0
	edge.ZIndex = host.ZIndex
	edge.Parent = host
	return edge
end

--[[ A surface should always draw above whatever it was parented into. Sibling
	 ZIndexBehavior would let this slide, but a ScreenGui left on the legacy
	 Global behaviour draws by absolute ZIndex, and then a button whose children
	 sat at the default 1 would vanish underneath its own panel. ]]
local function zAbove(parent: Instance): number
	if parent:IsA("GuiObject") then
		return parent.ZIndex + 1
	end
	return 1
end

--[[ Let type shrink to fit a small screen but never grow past the size the
	 design was drawn at — TextScaled alone will happily render a 60px word in a
	 pill built for 22px type. ]]
local function clampText(label: TextLabel, maxSize: number)
	label.TextScaled = true
	label.TextWrapped = false
	local c = Instance.new("UITextSizeConstraint")
	c.MaxTextSize = maxSize
	c.MinTextSize = 10
	c.Parent = label
end

--[[ The caption described in decision (1) at the top of this file. ]]
local function caption(btn: TextButton, textSize: number, bottomPad: number): TextLabel
	-- The native text stays as the API surface but is never drawn.
	btn.TextTransparency = 1
	btn.TextStrokeTransparency = 1

	local label = Instance.new("TextLabel")
	label.Name = "Caption"
	label.AnchorPoint = Vector2.new(0.5, 0)
	label.Position = UDim2.new(0.5, 0, 0, 0)
	-- Sits above the hard bottom edge so the label is optically centred in the
	-- lit face of the button rather than in its full silhouette.
	-- Only a 10px horizontal inset: a circular icon button is barely wider than
	-- its word, and a generous inset there scales "UPGRADES" down to nothing.
	label.Size = UDim2.new(1, -10, 1, -bottomPad)
	label.ZIndex = btn.ZIndex + 1
	Palette.styleText(label, textSize)
	label.TextXAlignment = Enum.TextXAlignment.Center
	label.TextYAlignment = Enum.TextYAlignment.Center
	label.Text = btn.Text
	clampText(label, textSize)
	label.Parent = btn

	btn:GetPropertyChangedSignal("Text"):Connect(function()
		label.Text = btn.Text
	end)

	return label
end

--[[ Hover and press feedback. Both states recolour the fill and shorten the
	 hard edge, so a held button physically sinks into its own thickness. Only
	 properties the button owns are touched — never Size or Position — so this
	 cannot fight a UIListLayout or a caller-set position. ]]
local function wireFeedback(btn: TextButton, fill: Color3, edge: Frame, rest: number)
	local hoverFill = Palette.lift(fill, 0.10)
	local pressFill = Palette.shade(fill, 0.12)
	local quick = TweenInfo.new(0.09, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)

	local function state(color: Color3, thickness: number)
		TweenService:Create(btn, quick, { BackgroundColor3 = color }):Play()
		TweenService:Create(edge, quick, { Size = UDim2.new(1, 0, 0, thickness) }):Play()
	end

	local hovering = false
	local held = false

	local function refresh()
		if held then
			state(pressFill, EDGE_PRESSED)
		elseif hovering then
			state(hoverFill, rest)
		else
			state(fill, rest)
		end
	end

	btn.MouseEnter:Connect(function()
		hovering = true
		refresh()
	end)
	btn.MouseLeave:Connect(function()
		-- A touch drag that leaves the button must also release it, or the
		-- button stays visually stuck down after the finger lifts elsewhere.
		hovering = false
		held = false
		refresh()
	end)
	btn.InputBegan:Connect(function(input: InputObject)
		if
			input.UserInputType == Enum.UserInputType.MouseButton1
			or input.UserInputType == Enum.UserInputType.Touch
		then
			held = true
			refresh()
		end
	end)
	btn.InputEnded:Connect(function(input: InputObject)
		if
			input.UserInputType == Enum.UserInputType.MouseButton1
			or input.UserInputType == Enum.UserInputType.Touch
		then
			held = false
			refresh()
		end
	end)
end

--[[ The one place a button is actually constructed. Theme.button, the panel
	 close button and Theme.iconButton all come through here so none of them can
	 drift from the others on outline weight or depth. ]]
local function makeButton(
	parent: Instance,
	text: string,
	fillColor: Color3,
	size: UDim2,
	position: UDim2,
	radius: UDim,
	textSize: number,
	edgeThickness: number
): (TextButton, TextLabel)
	local btn = Instance.new("TextButton")
	btn.Name = "Button"
	btn.Size = size
	btn.Position = position
	btn.BackgroundColor3 = fillColor
	btn.BorderSizePixel = 0
	btn.AutoButtonColor = false -- the hover/press states below replace it
	btn.ClipsDescendants = true -- required by hardEdge
	btn.Text = string.upper(text)
	btn.ZIndex = zAbove(parent) -- set before the edge and caption copy it
	btn.Parent = parent

	corner(btn, radius)
	gradient(btn, fillColor)
	Palette.stroke(btn, Palette.Outline.Button)
	local edge = hardEdge(btn, fillColor, edgeThickness)
	local label = caption(btn, textSize, edgeThickness)
	wireFeedback(btn, fillColor, edge, edgeThickness)

	return btn, label
end

--------------------------------------------------------------------------------
-- public surface
--------------------------------------------------------------------------------

--[[ §3 Pill or rounded, vertical gradient, hard bottom edge, thick outline,
	 heavy uppercase type. `size` and `position` are optional. ]]
function Theme.button(parent: Instance, text: string, fillColor: Color3, size: UDim2?, position: UDim2?): TextButton
	local btn = makeButton(
		parent,
		text,
		fillColor,
		size or UDim2.fromOffset(220, 54),
		position or UDim2.fromOffset(0, 0),
		Palette.Radius.Pill, -- §3 buttons are often full pills; this is the default action shape
		Palette.TextSize.Button,
		EDGE_BUTTON
	)
	return btn
end

--[[ §5.4 Item cards are white, outlined, rounded. The action button goes
	 *inside* the card, right-aligned — that is the caller's job, and the padding
	 here is what gives it somewhere to sit. ]]
function Theme.card(parent: Instance, size: UDim2?): Frame
	local card = Instance.new("Frame")
	card.Name = "Card"
	card.Size = size or UDim2.new(1, 0, 0, 92)
	card.BackgroundColor3 = Palette.UI.CardFill
	card.BorderSizePixel = 0
	card.ZIndex = zAbove(parent)
	card.Parent = parent

	corner(card, Palette.Radius.Card)
	-- §2: the outline does not thin down on small elements. A card gets the same
	-- weight as a button even when it is a 60px chip in a grid.
	Palette.stroke(card, Palette.Outline.Card)

	local pad = Instance.new("UIPadding")
	pad.PaddingTop = UDim.new(0, 12)
	pad.PaddingBottom = UDim.new(0, 12)
	pad.PaddingLeft = UDim.new(0, 14)
	pad.PaddingRight = UDim.new(0, 14)
	pad.Parent = card

	return card
end

--[[ §6 Currency counter: a dark rounded pill, coloured coin at the left end, a
	 big comma-separated number. Returns the pill and the number label; the HUD
	 owns what goes in the label (via Util.comma). ]]
function Theme.counter(parent: Instance, iconColor: Color3, position: UDim2?): (Frame, TextLabel)
	local pill = Instance.new("Frame")
	pill.Name = "Counter"
	pill.Size = UDim2.fromOffset(196, 46)
	pill.Position = position or UDim2.fromOffset(0, 0)
	pill.BackgroundColor3 = Palette.UI.CounterFill
	pill.BorderSizePixel = 0
	pill.ClipsDescendants = true
	pill.ZIndex = zAbove(parent)
	pill.Parent = parent

	corner(pill, Palette.Radius.Pill)
	gradient(pill, Palette.UI.CounterFill)
	Palette.stroke(pill, Palette.Outline.Button)
	hardEdge(pill, Palette.UI.CounterFill, 5)

	local coin = Instance.new("Frame")
	coin.Name = "Coin"
	coin.AnchorPoint = Vector2.new(0, 0.5)
	coin.Position = UDim2.new(0, 7, 0.5, -2)
	coin.Size = UDim2.fromOffset(30, 30)
	coin.BackgroundColor3 = iconColor
	coin.BorderSizePixel = 0
	coin.ZIndex = pill.ZIndex + 1
	coin.Parent = pill
	corner(coin, Palette.Radius.Icon)
	gradient(coin, iconColor)
	Palette.stroke(coin, Palette.Outline.Icon)

	local number = Instance.new("TextLabel")
	number.Name = "Amount"
	number.AnchorPoint = Vector2.new(0, 0.5)
	number.Position = UDim2.new(0, 46, 0.5, -2)
	number.Size = UDim2.new(1, -56, 0, 30)
	number.ZIndex = pill.ZIndex + 1
	Palette.styleText(number, Palette.TextSize.Counter)
	number.TextXAlignment = Enum.TextXAlignment.Left
	-- §4 never truncated to "1B"; the comma form is part of the fantasy.
	number.Text = Util.comma(0)
	clampText(number, Palette.TextSize.Counter)
	number.Parent = pill

	return pill, number
end

--[[ §6 Left-edge circular icon button. `label` is the short word inside it —
	 emoji are ornamental only in this category (§4), never functional icons, so
	 these carry heavy type instead. ]]
function Theme.iconButton(parent: Instance, label: string, fillColor: Color3, position: UDim2?): TextButton
	local btn = makeButton(
		parent,
		label,
		fillColor,
		UDim2.fromOffset(70, 70),
		position or UDim2.fromOffset(0, 0),
		Palette.Radius.Icon, -- full circle
		Palette.TextSize.Small,
		EDGE_BUTTON
	)
	btn.Name = "IconButton"
	return btn
end

--[[ §5.3 Sections are labelled, centred, outlined. Flanked by rules because a
	 bare centred word reads as a caption rather than a heading. ]]
function Theme.sectionLabel(parent: Instance, text: string): TextLabel
	local label = Instance.new("TextLabel")
	label.Name = "SectionLabel"
	label.Size = UDim2.new(1, 0, 0, 34)
	Palette.styleText(label, Palette.TextSize.Section)
	label.Text = `— {string.upper(text)} —`
	label.TextXAlignment = Enum.TextXAlignment.Center
	label.ZIndex = zAbove(parent)
	clampText(label, Palette.TextSize.Section)
	label.Parent = parent
	return label
end

--------------------------------------------------------------------------------
-- panel
--------------------------------------------------------------------------------

--[[ Keeps a panel legible on every screen (decision 3 at the top of this file).
	 Re-runs on viewport change, which also covers a phone being rotated. ]]
local function bindResponsive(panel: Frame, fixed: UDim2?)
	local constraint = Instance.new("UISizeConstraint")
	constraint.Parent = panel

	local function apply()
		local camera = workspace.CurrentCamera
		local vp = camera and camera.ViewportSize or Vector2.new(1280, 720)
		if vp.X < 1 or vp.Y < 1 then
			return -- viewport is briefly zero during the first frames
		end

		-- MaxSize is the hard guarantee that a panel is never wider than the
		-- screen; the scale below only decides how much of it to use.
		local maxX = math.min(PANEL_MAX.X, math.max(120, vp.X - 24))
		local maxY = math.min(PANEL_MAX.Y, math.max(120, vp.Y - 24))
		constraint.MaxSize = Vector2.new(maxX, maxY)
		-- Min must never cross Max or the constraint fights itself on a tiny
		-- viewport and the panel snaps to a size neither value asked for.
		constraint.MinSize = Vector2.new(math.min(PANEL_MIN.X, maxX), math.min(PANEL_MIN.Y, maxY))

		local target = fixed or (vp.X < NARROW_VIEWPORT and PANEL_SCALE_NARROW or PANEL_SCALE_WIDE)
		panel:SetAttribute("ThemeBaseSize", target)
		-- Do not stomp an in-flight open/close tween; it reads the attribute.
		if panel:GetAttribute("ThemeAnimating") ~= true then
			panel.Size = target
		end
	end

	apply()

	local conn: RBXScriptConnection? = nil
	local function watchCamera()
		if conn then
			conn:Disconnect()
		end
		local camera = workspace.CurrentCamera
		if camera then
			conn = camera:GetPropertyChangedSignal("ViewportSize"):Connect(apply)
		end
		apply()
	end
	watchCamera()

	local cameraSwap = workspace:GetPropertyChangedSignal("CurrentCamera"):Connect(watchCamera)
	panel.Destroying:Connect(function()
		if conn then
			conn:Disconnect()
		end
		cameraSwap:Disconnect()
	end)
end

--[[ §5 A modal: thick outline, ONE saturated header bar over a white body, the
	 title centred, and a large red rounded-square close button top-right with a
	 white X — never a small glyph.

	 Returns (panel, body). Two things are worth knowing about the panel:
	   • `panel.Parent` is the full-screen Backdrop this function also creates.
	     It starts hidden; Theme.open reveals and fades it.
	   • The close button is wired to Theme.close already, and `panel.Closed`
	     (a BindableEvent) fires once the close animation finishes, so Panels can
	     enforce "exactly one open at a time" without touching the button.
]]
function Theme.panel(parent: Instance, titleText: string, headerColor: Color3, size: UDim2?): (Frame, Frame)
	local backdrop = Instance.new("Frame")
	backdrop.Name = "Backdrop"
	backdrop.Size = UDim2.fromScale(1, 1)
	backdrop.BackgroundColor3 = Color3.fromRGB(0, 0, 0)
	backdrop.BackgroundTransparency = 1
	backdrop.BorderSizePixel = 0
	backdrop.ZIndex = Z_BACKDROP
	backdrop.Visible = false
	-- Active makes the backdrop swallow input, so a click aimed at the dimmed
	-- area cannot reach the HUD buttons or the world behind the modal.
	backdrop.Active = true
	backdrop.Parent = parent

	local panel = Instance.new("Frame")
	panel.Name = "Panel"
	panel.AnchorPoint = Vector2.new(0.5, 0.5)
	panel.Position = UDim2.fromScale(0.5, 0.5)
	panel.BackgroundColor3 = Palette.UI.Body
	panel.BorderSizePixel = 0
	-- Clipping is what lets a square header bar inherit the panel's rounded top
	-- corners, and what keeps the header's bottom band inside the silhouette.
	panel.ClipsDescendants = true
	panel.ZIndex = Z_BACKDROP + 1
	panel.Parent = backdrop
	corner(panel, Palette.Radius.Panel)
	Palette.stroke(panel, Palette.Outline.Panel)

	bindResponsive(panel, size)

	local header = Instance.new("Frame")
	header.Name = "Header"
	header.Size = UDim2.new(1, 0, 0, HEADER_HEIGHT)
	header.BackgroundColor3 = headerColor
	header.BorderSizePixel = 0
	header.ZIndex = panel.ZIndex + 1
	header.Parent = panel
	gradient(header, headerColor)
	hardEdge(header, headerColor, EDGE_BUTTON)

	-- §3 headers often add a diagonal sheen band. Rotated, so it reads as a
	-- highlight sweep rather than a stripe; the panel's clip trims the overhang.
	local sheen = Instance.new("Frame")
	sheen.Name = "Sheen"
	sheen.AnchorPoint = Vector2.new(0.5, 0.5)
	sheen.Position = UDim2.fromScale(0.5, 0.28)
	sheen.Size = UDim2.new(1.6, 0, 0, 22)
	sheen.Rotation = -8
	sheen.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
	sheen.BackgroundTransparency = 0.86
	sheen.BorderSizePixel = 0
	sheen.ZIndex = header.ZIndex
	sheen.Parent = header

	local title = Instance.new("TextLabel")
	title.Name = "Title"
	-- Inset equally on both sides even though only the right side holds the
	-- close button, so the title stays optically centred (§5.1).
	title.Size = UDim2.new(1, -144, 1, -EDGE_BUTTON)
	title.Position = UDim2.fromOffset(72, 0)
	title.ZIndex = header.ZIndex + 2
	Palette.styleText(title, Palette.TextSize.Title)
	title.Text = string.upper(titleText)
	title.TextXAlignment = Enum.TextXAlignment.Center
	clampText(title, Palette.TextSize.Title)
	title.Parent = header

	-- §5.2 large red rounded SQUARE, top-right, white X, outlined.
	local close, closeCaption = makeButton(
		header,
		"X",
		Palette.UI.Close,
		UDim2.fromOffset(48, 48),
		UDim2.new(1, -12, 0.5, -3),
		Palette.Radius.Button, -- square-ish, not a pill: this is a button, not a glyph
		30,
		5
	)
	close.Name = "CloseButton"
	close.AnchorPoint = Vector2.new(1, 0.5)
	-- Above the title so an overlong title can never sit on top of the only way
	-- out of the modal.
	close.ZIndex = title.ZIndex + 1
	closeCaption.ZIndex = close.ZIndex + 1
	local closeEdge = close:FindFirstChild("Edge")
	if closeEdge and closeEdge:IsA("Frame") then
		closeEdge.ZIndex = close.ZIndex
	end

	local body = Instance.new("Frame")
	body.Name = "Body"
	body.Size = UDim2.new(1, 0, 1, -HEADER_HEIGHT)
	body.Position = UDim2.fromOffset(0, HEADER_HEIGHT)
	body.BackgroundColor3 = Palette.UI.Body
	body.BorderSizePixel = 0
	body.ZIndex = panel.ZIndex + 1
	body.Parent = panel

	local pad = Instance.new("UIPadding")
	pad.PaddingTop = UDim.new(0, BODY_PADDING)
	pad.PaddingBottom = UDim.new(0, BODY_PADDING)
	pad.PaddingLeft = UDim.new(0, BODY_PADDING)
	pad.PaddingRight = UDim.new(0, BODY_PADDING)
	pad.Parent = body

	local closed = Instance.new("BindableEvent")
	closed.Name = "Closed"
	closed.Parent = panel

	close.Activated:Connect(function()
		Theme.close(panel)
	end)

	return panel, body
end

--------------------------------------------------------------------------------
-- open / close animation
--------------------------------------------------------------------------------

-- Weak keys: a destroyed panel must not be kept alive by this table.
local activeTween: { [Frame]: Tween } = setmetatable({}, { __mode = "k" }) :: any

local function baseSizeOf(panel: Frame): UDim2
	local stored = panel:GetAttribute("ThemeBaseSize")
	if typeof(stored) == "UDim2" then
		return stored
	end
	return panel.Size
end

local function scaled(size: UDim2, k: number): UDim2
	return UDim2.new(size.X.Scale * k, size.X.Offset * k, size.Y.Scale * k, size.Y.Offset * k)
end

local function backdropOf(panel: Frame): Frame?
	local p = panel.Parent
	if p and p:IsA("Frame") and p.Name == "Backdrop" then
		return p
	end
	return nil
end

--[[ Scale-in with a slight overshoot, backdrop fading up underneath it.

	 The panel itself is not faded: GuiObject transparency is not inherited, so a
	 fade would mean tweening every descendant individually and would show the
	 body through the header on the way in. Scale plus the backdrop fade buys the
	 same read for two tweens. ]]
function Theme.open(panel: Frame, onDone: (() -> ())?)
	local running = activeTween[panel]
	if running then
		running:Cancel()
		activeTween[panel] = nil
	end

	local base = baseSizeOf(panel)
	local backdrop = backdropOf(panel)
	if backdrop then
		backdrop.Visible = true
		backdrop.BackgroundTransparency = 1
		TweenService:Create(backdrop, TweenInfo.new(0.18, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
			BackgroundTransparency = BACKDROP_DIM,
		}):Play()
	end

	panel.Visible = true
	panel.Size = scaled(base, 0.82)
	panel:SetAttribute("ThemeAnimating", true)

	local tween = TweenService:Create(
		panel,
		TweenInfo.new(0.24, Enum.EasingStyle.Back, Enum.EasingDirection.Out), -- Back/Out is the overshoot
		{ Size = base }
	)
	activeTween[panel] = tween
	tween.Completed:Connect(function(state: Enum.PlaybackState)
		if activeTween[panel] == tween then
			activeTween[panel] = nil
			panel:SetAttribute("ThemeAnimating", false)
		end
		if state == Enum.PlaybackState.Completed and onDone then
			onDone()
		end
	end)
	tween:Play()
end

--[[ Collapse and hide. Fires the panel's `Closed` BindableEvent when the
	 animation actually finishes — a close that was interrupted by a re-open
	 fires nothing and leaves the panel visible, which is what the interrupting
	 open wanted. ]]
function Theme.close(panel: Frame, onDone: (() -> ())?)
	local running = activeTween[panel]
	if running then
		running:Cancel()
		activeTween[panel] = nil
	end

	local base = baseSizeOf(panel)
	local backdrop = backdropOf(panel)
	if backdrop then
		TweenService:Create(backdrop, TweenInfo.new(0.14, Enum.EasingStyle.Quad, Enum.EasingDirection.In), {
			BackgroundTransparency = 1,
		}):Play()
	end

	panel:SetAttribute("ThemeAnimating", true)
	local tween = TweenService:Create(
		panel,
		TweenInfo.new(0.14, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
		{ Size = scaled(base, 0.86) }
	)
	activeTween[panel] = tween
	tween.Completed:Connect(function(state: Enum.PlaybackState)
		if state ~= Enum.PlaybackState.Completed then
			return -- cancelled by a re-open; that open owns the panel now
		end
		if activeTween[panel] == tween then
			activeTween[panel] = nil
		end
		panel:SetAttribute("ThemeAnimating", false)
		panel.Size = base
		panel.Visible = false
		if backdrop then
			backdrop.Visible = false
		end

		local signal = panel:FindFirstChild("Closed")
		if signal and signal:IsA("BindableEvent") then
			signal:Fire()
		end
		if onDone then
			onDone()
		end
	end)
	tween:Play()
end

return Theme
