--!nocheck
--!modules Paths,Render
--[[
	Render.renderView — the rasteriser.

	This is the largest untested thing in the plugin and the one the most visible
	feature rests on: every frame the playtest viewport draws, and every render the
	agent looks at to decide whether a scene reads, comes out of here. A review put it
	plainly — roughly 340 of Render.luau's 403 lines could not even be CALLED, because
	the harness had no rotation and the rasteriser transforms every corner of every
	part into camera space.

	The harness has a real CFrame now (see run.mjs). The first section below tests THAT,
	because if the stub's maths are wrong every assertion after it is worthless — a
	camera that quietly looks down +Z renders the world behind it and everything still
	passes.
]]

local ws = game:GetService("Workspace")

local function approx(a, b, tol, what)
	H.ok(math.abs(a - b) <= (tol or 0.001), string.format("%s: expected ~%.4f, got %.4f", what or "value", b, a))
end

-- ------------------------------------------------- the harness's own maths ----

H.test("an identity CFrame transforms a point to itself", function()
	local cf = CFrame.new(0, 0, 0)
	local p = cf:PointToWorldSpace(Vector3.new(1, 2, 3))
	approx(p.X, 1, nil, "X"); approx(p.Y, 2, nil, "Y"); approx(p.Z, 3, nil, "Z")
end)

H.test("PointToObjectSpace is the exact inverse of PointToWorldSpace", function()
	local cf = CFrame.lookAt(Vector3.new(10, 5, -3), Vector3.new(-4, 2, 8))
	for _, v in { Vector3.new(1, 0, 0), Vector3.new(0, 3, -7), Vector3.new(-2, 9, 4) } do
		local back = cf:PointToObjectSpace(cf:PointToWorldSpace(v))
		approx(back.X, v.X, 0.0001, "round-trip X")
		approx(back.Y, v.Y, 0.0001, "round-trip Y")
		approx(back.Z, v.Z, 0.0001, "round-trip Z")
	end
end)

H.test("a lookAt camera puts its subject in FRONT of it, not behind", function()
	-- The sign that matters. renderView computes `z = -p.Z` and drops anything with
	-- z <= 0.05, so if the basis were flipped every part would be culled as behind the
	-- camera and an all-sky image would pass every other test in this file.
	local from, at = Vector3.new(0, 0, 20), Vector3.new(0, 0, 0)
	local cf = CFrame.lookAt(from, at)
	local p = cf:PointToObjectSpace(at)
	H.ok(-p.Z > 0, "the target must have positive view depth, got " .. tostring(-p.Z))
	approx(-p.Z, 20, 0.001, "and it is 20 studs away")
	-- The LookVector points at the subject.
	local lv = cf.LookVector
	approx(lv.Z, -1, 0.001, "LookVector.Z")
end)

H.test("the basis stays orthonormal, so the inverse really is the transpose", function()
	local cf = CFrame.lookAt(Vector3.new(3, 9, -2), Vector3.new(-5, 1, 6))
	local r, u, l = cf.RightVector, cf.UpVector, cf.LookVector
	approx(r:Dot(r), 1, 0.0001, "right is unit")
	approx(u:Dot(u), 1, 0.0001, "up is unit")
	approx(l:Dot(l), 1, 0.0001, "look is unit")
	approx(r:Dot(u), 0, 0.0001, "right . up")
	approx(r:Dot(l), 0, 0.0001, "right . look")
	approx(u:Dot(l), 0, 0.0001, "up . look")
end)

-- ------------------------------------------------------------- the rasteriser --

local function clearScene()
	for _, c in ws:GetChildren() do
		if c.Name == "Scene" then c:Destroy() end
	end
	local root = Instance.new("Folder", ws)
	root.Name = "Scene"
	return root
end

local function box(parent, name, sx, sy, sz, px, py, pz)
	local p = Instance.new("Part", parent)
	p.Name = name
	p.Size = Vector3.new(sx, sy, sz)
	p.CFrame = CFrame.new(px, py, pz)
	p.Transparency = 0
	return p
end

-- A camera 30 studs back on +Z, looking at the origin.
local function frontCamera()
	return CFrame.lookAt(Vector3.new(0, 0, 30), Vector3.new(0, 0, 0))
end

H.test("a render is exactly width x height x 3 bytes of base64", function()
	clearScene()
	local data, meta = Render.renderView(frontCamera(), 24, 12, 70)
	H.eq(type(data), "string", "returns a string")
	-- 24*12 = 288 pixels, 864 bytes, which is divisible by 3 so base64 has no padding.
	H.eq(#data, 864 / 3 * 4, "base64 length for 288 RGB pixels")
	H.eq(meta.width, 24, "meta width")
	H.eq(meta.height, 12, "meta height")
end)

H.test("an empty scene still renders — sky over ground, not nothing", function()
	clearScene()
	local data, meta = Render.renderView(frontCamera(), 24, 12, 70)
	H.eq(meta.partsConsidered, 0, "no parts")
	H.eq(meta.partsVisible, 0, "none visible")
	-- `distinctColours` is the PART palette, not the image, so an empty scene is 0.
	-- The sky and ground bands are still painted; they are just not parts.
	H.eq(meta.distinctColours, 0, "no parts, no palette")
	H.eq(meta.subjectCoverage, 0, "and nothing covers the frame")
end)

H.test("a part in front of the camera is rendered and counted", function()
	local root = clearScene()
	box(root, "Subject", 8, 8, 8, 0, 0, 0)
	local _, meta = Render.renderView(frontCamera(), 24, 12, 70)
	H.eq(meta.partsConsidered, 1, "considered")
	H.eq(meta.partsVisible, 1, "visible")
	H.eq(meta.partsOffCamera, 0, "none off camera")
	H.ok(meta.subjectCoverage > 0, "it covers some of the frame, got " .. tostring(meta.subjectCoverage))
	H.eq(meta.distinctColours, 1, "one part, one entry in the palette")
end)

H.test("a part BEHIND the camera is counted off-camera, not drawn", function()
	-- The near-plane rule: any corner with z <= 0.05 skips the whole part rather than
	-- being near-clipped, so a part behind the camera must not reach the buffer.
	local root = clearScene()
	box(root, "Behind", 8, 8, 8, 0, 0, 80)
	local _, meta = Render.renderView(frontCamera(), 24, 12, 70)
	H.eq(meta.partsConsidered, 1, "considered")
	H.eq(meta.partsVisible, 0, "not visible")
	H.eq(meta.partsOffCamera, 1, "counted off camera")
	H.eq(meta.subjectCoverage, 0, "and nothing was drawn")
end)

H.test("a nearer part covers more of the frame than a further one", function()
	-- Perspective. Without the divide by z this is flat and both cover the same area.
	local root = clearScene()
	box(root, "Near", 6, 6, 6, 0, 0, 10)
	local _, near = Render.renderView(frontCamera(), 32, 24, 70)
	clearScene()
	local root2 = ws:FindFirstChild("Scene")
	box(root2, "Far", 6, 6, 6, 0, 0, -40)
	local _, far = Render.renderView(frontCamera(), 32, 24, 70)
	H.ok(near.subjectCoverage > far.subjectCoverage,
		string.format("near %.3f should cover more than far %.3f", near.subjectCoverage, far.subjectCoverage))
end)

H.test("moving the camera changes the image", function()
	-- The cheapest possible check that the camera argument is actually used. A
	-- rasteriser that ignored it would pass every count assertion above.
	local root = clearScene()
	box(root, "Subject", 6, 6, 6, -10, 0, 0)
	local a = Render.renderView(CFrame.lookAt(Vector3.new(0, 0, 30), Vector3.new(0, 0, 0)), 24, 12, 70)
	local b = Render.renderView(CFrame.lookAt(Vector3.new(0, 0, 30), Vector3.new(-20, 0, 0)), 24, 12, 70)
	H.ok(a ~= b, "the same scene rendered identically from two different cameras")
end)

H.test("a wider field of view shrinks the subject", function()
	local root = clearScene()
	box(root, "Subject", 8, 8, 8, 0, 0, 0)
	local _, narrow = Render.renderView(frontCamera(), 32, 24, 40)
	local _, wide = Render.renderView(frontCamera(), 32, 24, 100)
	H.ok(narrow.subjectCoverage > wide.subjectCoverage,
		string.format("40deg %.3f should fill more than 100deg %.3f", narrow.subjectCoverage, wide.subjectCoverage))
end)

H.test("a near-invisible part is not rasterised", function()
	local root = clearScene()
	local ghost = box(root, "Ghost", 8, 8, 8, 0, 0, 0)
	ghost.Transparency = 1
	local _, meta = Render.renderView(frontCamera(), 24, 12, 70)
	H.eq(meta.partsConsidered, 0, "renderable() excludes it before anything else")
	H.eq(meta.subjectCoverage, 0, "and the frame is untouched")
end)

H.test("the material tally counts what was actually in frame", function()
	local root = clearScene()
	local a = box(root, "A", 6, 6, 6, -6, 0, 0)
	a.Material = Enum.Material.Neon
	local b = box(root, "B", 6, 6, 6, 6, 0, 0)
	b.Material = Enum.Material.Concrete
	local _, meta = Render.renderView(frontCamera(), 32, 24, 70)
	local byName = {}
	for _, m in meta.materials do byName[m.material] = m.parts end
	H.eq(byName.Neon, 1, "one Neon part")
	H.eq(byName.Concrete, 1, "one Concrete part")
end)

H.report("plugin/rasteriser")
