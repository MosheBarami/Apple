--!strict
--[[
	Crystal Canyon — Icons: one original pictogram family.

	§12 of the brief and §4 of docs/ROBLOX-STYLE-SPEC.md between them rule out
	the two easy answers. Emoji are ornament in this category and never
	functional icons, and this build ships no uploaded image assets, so every
	glyph the UI needs is DRAWN here out of Roblox UI primitives: rounded
	`Frame`s, `UICorner`, `Rotation`, and the same near-black `UIStroke` every
	other surface in the game carries.

	The previous pass drew its glyphs inline in Hud.luau from fixed pixel
	offsets inside a scale-positioned art frame. That is the bug this module
	exists to make impossible: the moment a tile resized, the interiors kept
	their pixel sizes while their positions moved, and the four icons drifted
	out of proportion with each other and with their tiles.

	So: every icon is drawn ONCE on a 32x32 design grid (`BOX`) and emitted
	entirely in SCALE units — position, size and corner radius are all fractions
	of the box. Resize the box to 32px or to 72px and you get the same drawing,
	because nothing in it is expressed in pixels. A `UIAspectRatioConstraint`
	keeps the box square inside a non-square slot, so a wide tile cannot stretch
	a coin into an egg.

	--- the construction language (this is what makes them a family) ---

	1. Every icon is 2 to 5 shapes. Nothing here is fiddly enough to lose at
	   32px, which is the size these must survive.
	2. Shapes are rounded rectangles, full stop. A circle is a rounded rectangle
	   at r = 0.5; a diamond is a rounded square at 45 degrees. There are no
	   other primitives, which is exactly why the set looks drawn by one hand.
	3. Four tones, and they mean the same thing in every icon:
	     fill   — the body of the object (white by default)
	     accent — the one coloured part: awning, buckle, magnet poles, coin face
	     cut    — a hole. Filled with the colour of the surface BEHIND the icon,
	              so the outline it carries reads as a drawn inner edge. This is
	              how the key bow, the lock shackle and the map pin get their
	              ring without a second stroke.
	     plain  — shading, never a surface: no outline. Same exemption Theme
	              gives its hard bottom edge and its header sheen (§3).
	4. Silhouette first. Detail sits INSIDE the silhouette rather than beside
	   it, so shrinking the icon loses detail rather than meaning.

	--- outline weight ---

	§2 is blunt that the outline does not thin down on small elements, and the
	icon's silhouette obeys that: its stroke is a fixed fraction of the box and
	is re-derived whenever the box's absolute size changes, so a 72px icon gets
	a genuinely thicker line than a 32px one rather than the same hairline.

	The one concession is per-shape: a stroke is never allowed to exceed 45% of
	the shape it encloses. Without it the coin's centre mark (4.5 of 32 units)
	would be swallowed by its own outline at 32px and the coin would read as a
	black blob. A line that thin is interior drawing, not a surface edge, so it
	is not what §2 is talking about.
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("CrystalCanyon")
local Palette = require(Shared:WaitForChild("Palette") :: ModuleScript)

local Icons = {}

--[[ The design grid. Every number in ART below is in these units, and nothing
	 outside this module ever sees them — they are converted to scale on the way
	 out. `x`/`y` are the CENTRE of a shape, because a pictogram is easier to
	 reason about as "a circle here, a bar there" than as a pile of corners. ]]
local BOX = 32
Icons.BOX = BOX

type Shape = {
	w: number,
	h: number,
	x: number,
	y: number,
	-- Corner radius as a fraction of the shape's SHORT axis, so 0.5 is a full
	-- pill/circle and the roundness survives any resize. UICorner's scale
	-- component is already relative to that axis, which is why this is free.
	r: number?,
	rot: number?,
	tone: string?, -- "fill" (default) | "accent" | "cut"
	plain: boolean?, -- shading rather than a surface: skip the outline
}

--[[ The set. Read these as little drawings; the comment on each says what the
	 shapes are so a future edit does not have to reverse-engineer the numbers.

	 Order inside a list is paint order — later shapes draw on top. Several icons
	 depend on it (the lock body covers the bottom of its shackle; the pack body
	 covers the bottom of its handle), which is what turns two overlapping
	 rounded rectangles into one silhouette. ]]
local ART: { [string]: { Shape } } = {
	-- A square stood on its corner, with one facet catching the light.
	shard = {
		{ w = 17, h = 17, x = 16, y = 16, r = 0.2, rot = 45 },
		{ w = 4, h = 9, x = 11.5, y = 12.5, r = 0.5, rot = 45, tone = "accent", plain = true },
	},

	-- Rim, face, and a struck mark down the middle.
	coin = {
		{ w = 25, h = 25, x = 16, y = 16, r = 0.5 },
		{ w = 15, h = 15, x = 16, y = 16, r = 0.5, tone = "accent" },
		{ w = 4.5, h = 9, x = 16, y = 16, r = 0.5 },
	},

	-- Satchel: arched handle with a hole through it, body, buckle.
	pack = {
		{ w = 15, h = 13, x = 16, y = 10, r = 0.45 },
		{ w = 7, h = 8, x = 16, y = 11.5, r = 0.4, tone = "cut" },
		{ w = 23, h = 17, x = 16, y = 21, r = 0.3 },
		{ w = 9, h = 6, x = 16, y = 22, r = 0.35, tone = "accent" },
	},

	-- Storefront: awning wider than the building, door on the ground line.
	-- Deliberately NOT a bag, because `pack` already is one.
	shop = {
		{ w = 27, h = 8, x = 16, y = 9.5, r = 0.3, tone = "accent" },
		{ w = 22, h = 17, x = 16, y = 21.5, r = 0.22 },
		{ w = 9, h = 12, x = 16, y = 24, r = 0.3, tone = "accent" },
	},

	-- Chevron on a stem, standing on a plinth: "level up", not "go this way".
	upgrades = {
		{ w = 19, h = 5.5, x = 16, y = 27, r = 0.4, tone = "accent" },
		{ w = 7.5, h = 10, x = 16, y = 19.5, r = 0.35 },
		{ w = 13, h = 7, x = 11, y = 11.5, r = 0.4, rot = -45 },
		{ w = 13, h = 7, x = 21, y = 11.5, r = 0.4, rot = 45 },
	},

	-- Key: bow with a hole, shaft, two teeth.
	codes = {
		{ w = 15, h = 15, x = 16, y = 10, r = 0.5 },
		{ w = 6.5, h = 6.5, x = 16, y = 10, r = 0.5, tone = "cut" },
		{ w = 6.5, h = 16, x = 16, y = 21, r = 0.3 },
		{ w = 8, h = 5, x = 20, y = 21.5, r = 0.3 },
		{ w = 6.5, h = 5, x = 19.2, y = 27, r = 0.3, tone = "accent" },
	},

	-- Map pin: rotated square tail under a ringed head.
	zones = {
		{ w = 13, h = 13, x = 16, y = 21, r = 0.2, rot = 45 },
		{ w = 21, h = 21, x = 16, y = 13, r = 0.5 },
		{ w = 8.5, h = 8.5, x = 16, y = 13, r = 0.5, tone = "cut" },
	},

	-- Horseshoe magnet: two legs, an arch laid over their tops, coloured poles.
	-- Built from three bars rather than a notched block because a notch cut out
	-- of a stroked shape leaves the host's outline drawn across its mouth.
	magnet = {
		{ w = 8.5, h = 20, x = 8.75, y = 19, r = 0.3 },
		{ w = 8.5, h = 20, x = 23.25, y = 19, r = 0.3 },
		{ w = 23, h = 14, x = 16, y = 11, r = 0.5 },
		{ w = 8.5, h = 6, x = 8.75, y = 26, r = 0.3, tone = "accent" },
		{ w = 8.5, h = 6, x = 23.25, y = 26, r = 0.3, tone = "accent" },
	},

	-- Arrow with motion lines behind it. The lines are what separate this from
	-- `arrow`, which is a bare chevron used as a small directional marker.
	speed = {
		{ w = 10, h = 4.5, x = 8, y = 9, r = 0.5, tone = "accent" },
		{ w = 10, h = 4.5, x = 8, y = 23, r = 0.5, tone = "accent" },
		{ w = 16, h = 6.5, x = 13, y = 16, r = 0.4 },
		{ w = 13, h = 6.5, x = 20, y = 11.5, r = 0.4, rot = 45 },
		{ w = 13, h = 6.5, x = 20, y = 20.5, r = 0.4, rot = -45 },
	},

	-- Padlock: shackle with a hole, body laid over its lower half, keyhole.
	lock = {
		{ w = 15, h = 16, x = 16, y = 12, r = 0.45 },
		{ w = 7, h = 8, x = 16, y = 12.5, r = 0.4, tone = "cut" },
		{ w = 22, h = 15, x = 16, y = 22.5, r = 0.28 },
		{ w = 5.5, h = 8, x = 16, y = 22.5, r = 0.4, tone = "cut" },
	},

	-- Two bars meeting at the bottom-left: a checkmark.
	tick = {
		{ w = 6.5, h = 13, x = 9.5, y = 19, r = 0.45, rot = -40 },
		{ w = 6.5, h = 20, x = 19, y = 16.5, r = 0.45, rot = 40 },
	},

	-- A bare right-pointing chevron.
	arrow = {
		{ w = 6.5, h = 15, x = 16, y = 11, r = 0.45, rot = -40 },
		{ w = 6.5, h = 15, x = 16, y = 21, r = 0.45, rot = 40 },
	},
}

--[[ Older call sites (and the world builder's signage vocabulary) name some of
	 these by what they look like rather than by what they do. Aliasing costs
	 nothing and keeps a rename from silently drawing the fallback. ]]
local ALIAS: { [string]: string } = {
	bag = "pack",
	key = "codes",
	pin = "zones",
	map = "zones",
	check = "tick",
	chevron = "arrow",
	bolt = "speed",
	star = "upgrades",
}

export type Options = {
	-- Defaults to filling its parent. Pass a scale size and the drawing scales
	-- with it; pass an offset size and it is exactly that many pixels square.
	size: UDim2?,
	position: UDim2?,
	anchorPoint: Vector2?,
	zIndex: number?,
	name: string?,
	rotation: number?,

	fill: Color3?, -- the body tone; white unless a caller says otherwise
	accent: Color3?, -- the one coloured part of each icon
	cut: Color3?, -- what a hole shows; defaults to the surface behind the icon
	ink: Color3?, -- outline colour; defaults to the §2 near-black
	stroke: number?, -- pin the outline weight instead of deriving it from size
}

--[[ What a `cut` shape should be filled with when the caller does not say.

	 A hole has to be painted the colour of whatever is behind the icon, and the
	 icon does not otherwise know. Walking up to the nearest opaque ancestor gets
	 it right for every case in this game: an icon inside a coloured nav tile
	 finds the tile, an icon inside a transparent art frame finds the plate that
	 frame sits on. ]]
local function surfaceBehind(parent: Instance): Color3
	local node: Instance? = parent
	while node do
		if node:IsA("GuiObject") and node.BackgroundTransparency < 1 then
			return node.BackgroundColor3
		end
		node = node.Parent
	end
	return Palette.UI.Body
end

local function resolve(name: string): ({ Shape }, string)
	local key = string.lower(name)
	key = ALIAS[key] or key
	local art = ART[key]
	if art then
		return art, key
	end
	--[[ A typo must not cost the whole HUD. `Hud.init` runs inside the boot
		 script's pcall, so raising here would disable every surface this module
		 draws into; drawing the shard instead leaves a visibly wrong but working
		 UI, and the warning names the culprit. ]]
	warn(`[CrystalCanyon] Icons: no pictogram named "{name}"; drawing SHARD instead`)
	return ART.shard, "shard"
end

--[[ Draw one pictogram into `parent` and return the box that holds it.

	 The box is transparent and square; the caller positions and sizes it, and
	 everything inside is expressed as a fraction of it. ]]
function Icons.draw(parent: Instance, name: string, opts: Options?): Frame
	local art, key = resolve(name)
	local o: Options = opts or {}

	local fill = o.fill or Palette.UI.TextLight
	-- A sensible second tone for callers that do not care: a shade of the body,
	-- which keeps a mono icon reading as one object rather than two.
	local accent = o.accent or Palette.shade(fill, 0.24)
	local cut = o.cut or surfaceBehind(parent)
	local ink = o.ink or Palette.Outline.Color
	local z = o.zIndex or (if parent:IsA("GuiObject") then parent.ZIndex + 1 else 2)

	local box = Instance.new("Frame")
	box.Name = o.name or `Icon_{key}`
	box.BackgroundTransparency = 1
	box.BorderSizePixel = 0
	box.AnchorPoint = o.anchorPoint or Vector2.new(0.5, 0.5)
	box.Position = o.position or UDim2.fromScale(0.5, 0.5)
	box.Size = o.size or UDim2.fromScale(1, 1)
	box.Rotation = o.rotation or 0
	box.ZIndex = z
	box.Parent = parent

	--[[ The drawing is square by construction, so the box must be too. Without
		 this an icon told to fill a 96x40 slot would render a stretched coin —
		 which is precisely the proportion drift this module was written to end. ]]
	local ratio = Instance.new("UIAspectRatioConstraint")
	ratio.AspectRatio = 1
	ratio.Parent = box

	-- Kept alongside the fraction of the box each shape occupies, so the stroke
	-- retune below can hold a line to 45% of the shape it encloses.
	local strokes: { { stroke: UIStroke, span: number } } = {}

	for index, shape in art do
		local tone = shape.tone or "fill"
		local piece = Instance.new("Frame")
		piece.Name = `Shape{index}`
		piece.BorderSizePixel = 0
		piece.AnchorPoint = Vector2.new(0.5, 0.5)
		piece.Position = UDim2.fromScale(shape.x / BOX, shape.y / BOX)
		piece.Size = UDim2.fromScale(shape.w / BOX, shape.h / BOX)
		piece.Rotation = shape.rot or 0
		piece.ZIndex = z + index
		piece.BackgroundColor3 = if tone == "accent" then accent elseif tone == "cut" then cut else fill
		piece.Parent = box

		local radius = Instance.new("UICorner")
		radius.CornerRadius = UDim.new(math.clamp(shape.r or 0.5, 0, 0.5), 0)
		radius.Parent = piece

		if not shape.plain then
			local s = Palette.stroke(piece, Palette.Outline.Icon)
			s.Color = ink
			table.insert(strokes, { stroke = s, span = math.min(shape.w, shape.h) / BOX })
		end
	end

	--[[ Outline weight follows the icon's real pixel size (§2: it does not thin
		 down, and a bigger icon should not look like a thinner drawing). The box
		 has no absolute size on the frame it is created, so this runs again
		 whenever that changes — which also covers the HUD's UIScale reacting to
		 a rotated phone. ]]
	local function retune()
		local px = math.min(box.AbsoluteSize.X, box.AbsoluteSize.Y)
		if px <= 0 then
			return
		end
		local base = o.stroke or math.clamp(px * 0.085, 2.2, 4.5)
		for _, entry in strokes do
			entry.stroke.Thickness = math.max(1.5, math.min(base, entry.span * px * 0.45))
		end
	end

	retune()
	local conn = box:GetPropertyChangedSignal("AbsoluteSize"):Connect(retune)
	box.Destroying:Connect(function()
		conn:Disconnect()
	end)

	return box
end

--[[ Every pictogram this module can draw, sorted. Useful for a style gate that
	 wants to render the whole family at 32 and at 72 and eyeball it. ]]
function Icons.names(): { string }
	local out = {}
	for key in ART do
		table.insert(out, key)
	end
	table.sort(out)
	return out
end

function Icons.has(name: string): boolean
	local key = string.lower(name)
	return ART[ALIAS[key] or key] ~= nil
end

return Icons
