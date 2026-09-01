--!nocheck
--!modules Paths
--[[
	The asset gate. `Paths.setProp` decides, for every property an agent assigns,
	whether that assignment imports external content — and if it does, whether the
	session verified it.

	This is the security boundary that keeps an unvetted Roblox asset out of a user's
	place, so the interesting cases are the SHAPES: which strings the engine would
	resolve as an asset reference, and which are inert data that must not be gated
	(a gate that refuses `TextLabel.Text` is as broken as one that admits a MeshId).
]]

local function policy(...)
	local allow = {}
	for _, id in { ... } do allow[id] = true end
	Paths.setAssetPolicy({ allow = allow, preexisting = false })
end

--[[ THE CLASS HAS TO ACTUALLY HAVE THE PROPERTY.

	 These helpers used to assign everything to a `Part`. That passed, because the
	 harness accepted any property name — and `Part.MeshId` RAISES in real Roblox, a
	 Part having no such member. So eleven assertions here were green on a write the
	 engine rejects, and would have inverted in Studio. The stub now refuses unknown
	 members (see run.mjs), which turned all eleven red and is why this exists.

	 Each property is assigned to a class that genuinely has it. ]]
local CLASS_FOR = {
	MeshId = "MeshPart", TextureID = "MeshPart",
	Image = "ImageLabel", HoverImage = "ImageLabel",
	SoundId = "Sound",
	Texture = "Decal",
	Text = "TextLabel",
	Transparency = "Part", ZIndex = "Frame",
	Face = "HumanoidDescription", HatAccessory = "HumanoidDescription",
}

local function assign(propName, value, tag, className)
	local inst = Instance.new(className or CLASS_FOR[propName] or "Part")
	Paths.setProp(inst, propName, { t = tag or "string", v = value })
	return inst
end

--[[ "Refused" means THE GATE refused, not that anything failed.

	 The old helper returned `not ok` from a pcall, which conflated the gate's refusal
	 with any other error — including "not a valid member", which is now reachable. A
	 test that cannot tell those apart passes when the gate is broken and the write
	 merely failed for an unrelated reason.

	 So it keys on the refusals' own text. Both messages are user-facing and asserted
	 elsewhere in this file, so pinning them here is not a second source of truth. ]]
local GATE_MARKERS = { "not verified in this session", "cannot be read" }

local function refused(propName, value, tag, className)
	local ok, err = pcall(assign, propName, value, tag, className)
	if ok then return false end
	local msg = tostring(err)
	for _, marker in GATE_MARKERS do
		if string.find(msg, marker, 1, true) then return true end
	end
	-- Something else went wrong. Surface it rather than reporting it as a refusal.
	error(("%s: expected either a clean assignment or a gate refusal, got: %s"):format(propName, msg), 2)
end

-- --------------------------------------------------------- verified vs not --

H.test("with no policy open, every asset reference is refused", function()
	Paths.setAssetPolicy(nil)
	H.eq(refused("MeshId", "rbxassetid://5"), true, "MeshId")
	H.eq(refused("Image", "rbxassetid://5"), true, "Image")
	H.eq(refused("SoundId", "rbxassetid://5"), true, "SoundId")
end)

H.test("a verified id is admitted and an unverified one is not", function()
	policy(5)
	H.eq(refused("MeshId", "rbxassetid://5"), false, "the verified id")
	H.eq(refused("MeshId", "rbxassetid://6"), true, "a different id")
end)

H.test("the refusal names the gated tool rather than just saying no", function()
	policy()
	local _, err = pcall(assign, "MeshId", "rbxassetid://7")
	H.ok(string.find(tostring(err), "insert_asset", 1, true), "names insert_asset: " .. tostring(err))
end)

-- ------------------------------------------------------------ the URI shapes --

H.test("rbxassetid:// is read case-insensitively on the scheme", function()
	policy(11)
	H.eq(refused("MeshId", "rbxassetid://11"), false, "lower")
	H.eq(refused("MeshId", "RBXASSETID://11"), false, "upper")
end)

H.test("rbxthumb carries its id beside width and height", function()
	policy(12)
	H.eq(refused("Image", "rbxthumb://type=Asset&id=12&w=150&h=150"), false, "verified thumb")
	H.eq(refused("Image", "rbxthumb://type=Asset&id=13&w=150&h=150"), true, "unverified thumb")
end)

H.test("rbxgameasset names an asset by alias, so it can never be checked", function()
	-- An alias carries no id. There is nothing to compare against the verified list,
	-- so it is refused even when the underlying asset happens to be verified.
	policy(14)
	H.eq(refused("MeshId", "rbxgameasset://Models/Tree"), true, "alias with a full policy")
	local _, err = pcall(assign, "MeshId", "rbxgameasset://Models/Tree")
	H.ok(string.find(tostring(err), "cannot be read", 1, true), "explains why: " .. tostring(err))
end)

H.test("rbxasset:// is engine content and is never gated", function()
	-- Shipped inside the engine: first-party, no licence question, no import.
	Paths.setAssetPolicy(nil)
	H.eq(refused("MeshId", "rbxasset://textures/face.png"), false, "engine texture with no policy at all")
end)

H.test("an http URL is read for an explicit id and refused without one", function()
	policy(15)
	H.eq(refused("Image", "https://www.roblox.com/asset/?id=15"), false, "verified")
	H.eq(refused("Image", "https://example.com/whatever.png"), true, "no id to check")
end)

H.test("an unrecognised shape on a content property is refused, not waved through", function()
	policy(16)
	H.eq(refused("MeshId", "some-unrecognised-thing"), true, "unknown shape")
end)

-- ------------------------------------------------- content vs inert property --

H.test("a bare number is an asset id only on a content property", function()
	policy(20)
	H.eq(refused("Face", 21, "number"), true, "unverified bare id on a content prop")
	H.eq(refused("Face", 20, "number"), false, "verified bare id on a content prop")
	-- The same number as ordinary data must not be gated.
	H.eq(refused("Transparency", 21, "number"), false, "a number on an ordinary property is data")
	H.eq(refused("ZIndex", 999999, "number"), false, "so is a large one")
end)

--[[ THE GATE IS TWO-TIER, and the order matters.

	`assetIdsIn` tests for a URI shape BEFORE it asks whether the property is a
	content property. So the rule is not "content properties are gated":

	  * a URI-shaped string (rbxassetid://, rbxthumb://, rbxgameasset://) is an asset
	    reference on ANY property, gated everywhere;
	  * every other form — a bare number, a digit string, an http URL — is only an
	    asset reference on a content property, and is inert data elsewhere.

	That is stricter than gating by property name alone, and it is what closes the
	gap where a new engine property nobody has added to ASSET_PROPS accepts a URI.
	These assertions pin both tiers, because a refactor that "simplified" the order
	would silently open exactly that gap. ]]

H.test("a URI-shaped string is gated on an ordinary property too", function()
	policy()
	H.eq(refused("Text", "rbxassetid://22"), true, "a URI is a reference wherever it appears")
	H.eq(refused("Value", "rbxassetid://23", "string", "StringValue"), true,
		"including on a property that is not in ASSET_PROPS")
end)

H.test("a non-URI string on an ordinary property is inert", function()
	policy()
	-- No engine path turns TextLabel.Text into a fetch, so gating ordinary prose
	-- would break every UI build for no security gain.
	H.eq(refused("Text", "Collect 10 crystals"), false, "prose")
	H.eq(refused("Name", "1234567"), false, "a numeric Name is data, not an id")
	H.eq(refused("Text", "https://example.com/?id=99"), false, "even a URL, on a non-content property")
end)

H.test("the Content tag makes any property name a content property", function()
	-- Gating only on the property NAME would leave the codec tag as an open door:
	-- the engine resolves an id assigned as a plain string exactly as it resolves a
	-- tagged one. This is the tier-two discriminator — a bare digit string, which is
	-- an asset id only when the property is content.
	policy()
	-- Assigned to a StringValue's `Value`, which exists, so the only thing that can
	-- differ between these two lines is the codec tag.
	H.eq(refused("Value", "1234", "Content", "StringValue"), true, "tagged Content")
	H.eq(refused("Value", "1234", "string", "StringValue"), false, "untagged, unknown name")
end)

H.test("clearing a content property imports nothing", function()
	policy()
	H.eq(refused("MeshId", ""), false, "empty string")
	H.eq(refused("MeshId", "   "), false, "whitespace only")
end)

H.test("HumanoidDescription's comma lists are read as a set of ids", function()
	-- One unverified id in the list is enough to refuse the whole assignment.
	policy(30, 31)
	H.eq(refused("HatAccessory", "30,31"), false, "both verified")
	H.eq(refused("HatAccessory", "30,32"), true, "one unverified")
end)

-- ----------------------------------------------------------------- preexisting --

H.test("a restore may re-materialise what the place already contained", function()
	-- A snapshot is a record of this same place. Refusing would make a rollback
	-- strip the user's own MeshIds, which is destruction dressed up as caution.
	Paths.setAssetPolicy({ allow = {}, preexisting = true })
	H.eq(refused("MeshId", "rbxassetid://40"), false, "an id nothing verified")
	H.eq(refused("MeshId", "rbxgameasset://Models/Tree"), false, "even an unreadable alias")
end)

-- --------------------------------------------------------------- path parsing --

H.test("paths parse into segments, including bracketed names", function()
	local segs = Paths.parse('game.Workspace["My Part"].Handle')
	H.eq(#segs, 4, "segment count")
	H.eq(segs[1], "game", "1")
	H.eq(segs[2], "Workspace", "2")
	H.eq(segs[3], "My Part", "3 keeps its space")
	H.eq(segs[4], "Handle", "4")
end)

H.test("an unclosed bracket is an error rather than a silent truncation", function()
	H.raises(function() Paths.parse('game.Workspace["My Part') end, "unclosed bracket", "parse")
end)

H.test("a path that does not start at game is refused", function()
	H.raises(function() Paths.resolve("Workspace.Thing") end, 'must start with "game"', "resolve")
end)

H.test("fullPath round-trips a name that needs brackets", function()
	local ws = game:GetService("Workspace")
	local part = Instance.new("Part", ws)
	part.Name = "My Part"
	local p = Paths.fullPath(part)
	H.ok(string.find(p, '["My Part"]', 1, true), "brackets a spaced name: " .. p)
	local segs = Paths.parse(p)
	H.eq(segs[#segs], "My Part", "and parses back to the same name")
end)

--[[ ASSET_PROPS IS THE TIER-2 LIST, and it is hand-maintained.

	 A URI is gated on any property (tier 1, asserted above). Every OTHER form — a bare
	 number, a digit string, an http URL — is an asset reference only on a property
	 this list names. So dropping an entry silently narrows the gate for exactly the
	 shapes tier 1 cannot see, and the URI tests would all still pass.

	 One entry per engine surface, so a removal is caught wherever it happens. ]]
H.test("each content-property family gates the non-URI forms too", function()
	policy(70)
	local cases = {
		{ "SoundId", "Sound" },
		{ "Image", "ImageLabel" },
		{ "Texture", "Decal" },
		{ "MeshId", "MeshPart" },
		{ "Face", "HumanoidDescription" },
	}
	for _, c in cases do
		local prop, class = c[1], c[2]
		-- A bare digit string is an asset id ONLY because the property is in the list.
		H.eq(refused(prop, "71", "string", class), true, prop .. ": an unverified digit string")
		H.eq(refused(prop, "70", "string", class), false, prop .. ": the verified one")
		-- And the http form, which is also tier 2.
		H.eq(refused(prop, "https://www.roblox.com/asset/?id=71", "string", class), true, prop .. ": http id")
	end
end)

H.report("plugin/paths")
