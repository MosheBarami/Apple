--!strict
--[[
	Crystal Canyon — style tokens.

	This module is the machine-readable half of docs/ROBLOX-STYLE-SPEC.md. The
	spec is prose so a human can judge it; this is the same grammar as values so
	the UI cannot drift from it, and so the style gate has something concrete to
	assert against.

	Section numbers below refer to that document.

	The single most load-bearing token here is Outline. Section 2 of the spec is
	blunt about it: an otherwise perfect design fails the category test on
	outline weight alone, and "if in doubt, the outline is too thin". Every
	surface this game draws goes through stroke() below.
]]

local Palette = {}

-- §2 Outline — near-black, thick, and it does NOT thin down on small elements.
Palette.Outline = {
	Color = Color3.fromRGB(17, 17, 17),
	Panel = 4,
	Button = 3,
	Card = 3,
	Icon = 3,
	-- Type carries it too: white fill, black stroke, soft drop shadow (§4).
	Text = 3,
}

-- §3 Shape — rounded rectangles everywhere, buttons often full pills.
Palette.Radius = {
	Panel = UDim.new(0, 18),
	Card = UDim.new(0, 14),
	Button = UDim.new(0, 12),
	Pill = UDim.new(1, 0),
	Icon = UDim.new(1, 0),
}

-- §1 UI colour. One saturated hue for the header; everything else neutral.
Palette.UI = {
	HeaderCyan = Color3.fromRGB(60, 185, 240),
	HeaderGreen = Color3.fromRGB(95, 201, 74),
	HeaderPurple = Color3.fromRGB(150, 110, 225),
	HeaderGold = Color3.fromRGB(245, 190, 60),

	Body = Color3.fromRGB(255, 255, 255),
	BodyTint = Color3.fromRGB(238, 245, 250),
	CardFill = Color3.fromRGB(255, 255, 255),

	Buy = Color3.fromRGB(70, 200, 85), -- buy / confirm / positive
	Close = Color3.fromRGB(232, 62, 62), -- close / cancel / danger
	Premium = Color3.fromRGB(245, 190, 60), -- premium / VIP / rare
	Locked = Color3.fromRGB(150, 158, 165), -- locked / unavailable, desaturated

	SoftCurrency = Color3.fromRGB(250, 205, 65), -- shards, yellow-gold
	HardCurrency = Color3.fromRGB(90, 215, 130), -- coins, green

	--[[ Body copy on a white card. NOT `Locked` — the style audit caught blurbs,
		 prices and code results all rendered in the desaturated `Locked` grey,
		 which §9.10 fails outright ("nothing on screen is thin, subtle,
		 desaturated"). `Locked` means a control is unavailable; live copy that a
		 player is meant to read uses this instead, which is dark enough to carry
		 the category's contrast. ]]
	TextMuted = Color3.fromRGB(88, 96, 104),

	CounterFill = Color3.fromRGB(38, 42, 48), -- §6 currency counters are dark pills
	TextLight = Color3.fromRGB(255, 255, 255),
	TextDark = Color3.fromRGB(30, 34, 38),
}

--[[ §3 Depth is a hard bottom edge, not a soft shadow. Given a button fill,
	 this is the darker band drawn along its lower edge that reads as thickness. ]]
function Palette.shade(color: Color3, amount: number?): Color3
	local k = 1 - (amount or 0.28)
	return Color3.new(color.R * k, color.G * k, color.B * k)
end

--[[ §3 Slight vertical gradient on fills: lighter top, deeper bottom. ]]
function Palette.lift(color: Color3, amount: number?): Color3
	local k = amount or 0.18
	return Color3.new(
		math.min(1, color.R + (1 - color.R) * k),
		math.min(1, color.G + (1 - color.G) * k),
		math.min(1, color.B + (1 - color.B) * k)
	)
end

-- §4 Typography — heavy weight only, predominantly uppercase.
Palette.Font = {
	Display = Enum.Font.FredokaOne,
	Body = Enum.Font.GothamBold,
	Number = Enum.Font.FredokaOne,
}

Palette.TextSize = {
	Title = 34,
	Section = 22,
	Card = 20,
	Button = 22,
	Counter = 26,
	Small = 16,
}

-- §7 World construction. Colour does the work; geometry is flat-shaded low-poly.
Palette.World = {
	Grass = Color3.fromRGB(95, 201, 74),
	GrassDeep = Color3.fromRGB(72, 172, 60),
	Dirt = Color3.fromRGB(201, 138, 75),
	DirtLight = Color3.fromRGB(224, 164, 92),
	StonePath = Color3.fromRGB(200, 208, 214),
	Sand = Color3.fromRGB(232, 211, 169),

	-- §7 Cliffs are banded horizontally in two or three tones of the same rust
	-- hue. That banding is what makes them read as rock rather than a brown wall.
	CliffA = Color3.fromRGB(181, 83, 58),
	CliffB = Color3.fromRGB(154, 70, 50),
	CliffC = Color3.fromRGB(142, 63, 46),

	Canopy = Color3.fromRGB(62, 158, 78),
	CanopyLight = Color3.fromRGB(87, 184, 95),
	Trunk = Color3.fromRGB(122, 82, 48),
	Rock = Color3.fromRGB(126, 134, 141),
	RockDark = Color3.fromRGB(100, 108, 115),
	Tuft = Color3.fromRGB(110, 214, 88),

	Frost = Color3.fromRGB(206, 232, 245),
	FrostDeep = Color3.fromRGB(168, 206, 228),

	--[[ The frost zone's PATH, deliberately not a frost tone. The first build
		 painted the southern path in Frost/FrostDeep on top of a FrostFloor that
		 is literally `Frost` — so half the road was byte-identical to the ground
		 under it and the route vanished. §9.5 wants the path to contrast hard
		 with the ground, the way Dirt-on-Grass does in the north. ]]
	IcePath = Color3.fromRGB(96, 141, 173),
	IcePathDark = Color3.fromRGB(74, 116, 146),

	Sky = Color3.fromRGB(127, 200, 240),
}

-- §8 Interaction affordances.
Palette.Pads = {
	Sell = Color3.fromRGB(245, 190, 60),
	Upgrade = Color3.fromRGB(60, 185, 240),
	Gate = Color3.fromRGB(232, 62, 62),
	GateOpen = Color3.fromRGB(70, 200, 85),
	Arrow = Color3.fromRGB(70, 200, 85),
}

--[[ Apply the mandatory outline to any GuiObject. Every surface in this game
	 goes through here — that is the point. A call site that skips it is the bug
	 the style gate is looking for. ]]
function Palette.stroke(inst: GuiObject, thickness: number?): UIStroke
	local s = Instance.new("UIStroke")
	s.Color = Palette.Outline.Color
	s.Thickness = thickness or Palette.Outline.Button
	s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	s.LineJoinMode = Enum.LineJoinMode.Round
	s.Parent = inst
	return s
end

--[[ §4 Display type: white fill + black outline + drop shadow, near-universal. ]]
function Palette.styleText(label: TextLabel | TextButton | TextBox, size: number?, color: Color3?)
	label.Font = Palette.Font.Display
	label.TextColor3 = color or Palette.UI.TextLight
	label.TextSize = size or Palette.TextSize.Card
	label.TextStrokeTransparency = 1 -- real stroke below, not the blurry built-in
	label.BackgroundTransparency = 1
	local s = Instance.new("UIStroke")
	s.Color = Palette.Outline.Color
	s.Thickness = Palette.Outline.Text
	s.ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual
	s.LineJoinMode = Enum.LineJoinMode.Round
	s.Parent = label
end

return Palette
