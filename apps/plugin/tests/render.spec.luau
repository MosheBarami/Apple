--!nocheck
--!modules Paths,Render
--[[
	Render.bounds and Render.viewpoints — the framing maths behind every capture the
	plugin produces.

	These two decide what a screenshot actually shows. A bounds that swallows the
	ground plane, or a viewpoint that puts the camera inside the subject, produces an
	image that looks like a render and proves nothing — which is the exact failure
	mode the visual-critic work has been fighting. They are pure functions of
	geometry, so they are testable here rather than only in Studio.

	HONEST LIMIT: the CFrame stub models translation only and raises on a rotated
	frame (see run.mjs). So these cover axis-aligned parts. A rotated-part bounds
	case would need real Studio, and is deliberately absent rather than faked.
]]

local ws = game:GetService("Workspace")

local function part(name, sx, sy, sz, px, py, pz, transparency)
	local p = Instance.new("Part", ws)
	p.Name = name
	p.Size = Vector3.new(sx, sy, sz)
	p.CFrame = CFrame.new(px, py, pz)
	p.Transparency = transparency or 0
	return p
end

local function fresh()
	local root = Instance.new("Folder", ws)
	root.Name = "RenderProbe"
	return root
end

-- ------------------------------------------------------------------- bounds --

H.test("bounds spans a part's corners, not its centre", function()
	local root = fresh()
	local p = part("A", 10, 4, 6, 0, 0, 0)
	p.Parent = root
	local lo, hi = Render.bounds(root)
	H.ok(lo and hi, "got bounds")
	H.eq(lo.X, -5, "lo.X"); H.eq(hi.X, 5, "hi.X")
	H.eq(lo.Y, -2, "lo.Y"); H.eq(hi.Y, 2, "hi.Y")
	H.eq(lo.Z, -3, "lo.Z"); H.eq(hi.Z, 3, "hi.Z")
end)

H.test("bounds unions every renderable descendant", function()
	local root = fresh()
	part("A", 2, 2, 2, 0, 0, 0).Parent = root
	part("B", 2, 2, 2, 20, 10, -8).Parent = root
	local lo, hi = Render.bounds(root)
	H.eq(lo.X, -1, "lo.X"); H.eq(hi.X, 21, "hi.X")
	H.eq(hi.Y, 11, "hi.Y")
	H.eq(lo.Z, -9, "lo.Z")
end)

H.test("a near-invisible part is not framed", function()
	-- Transparency >= 0.95 renders nothing, so letting it stretch the bounds would
	-- frame empty space and shrink the visible subject.
	local root = fresh()
	part("Solid", 2, 2, 2, 0, 0, 0).Parent = root
	part("Ghost", 2, 2, 2, 500, 0, 0, 1).Parent = root
	local _, hi = Render.bounds(root)
	H.eq(hi.X, 1, "an invisible part must not stretch the frame")
end)

H.test("a ground plane is excluded so framing stays on the subject", function()
	-- This is the whole reason bounds is not a naive union: a baseplate would
	-- dominate every shot and reduce the subject to a speck.
	local root = fresh()
	part("Subject", 4, 4, 4, 0, 0, 0).Parent = root
	part("Baseplate", 2048, 1, 2048, 0, -1, 0).Parent = root
	local lo, hi = Render.bounds(root)
	H.eq(lo.X, -2, "lo.X stays on the subject")
	H.eq(hi.X, 2, "hi.X stays on the subject")
end)

H.test("bounds of nothing renderable is nil rather than a zero box", function()
	-- A zero box would silently frame the origin; nil lets the caller say so.
	local root = fresh()
	local f = Instance.new("Folder", root)
	f.Name = "Empty"
	local lo, hi = Render.bounds(root)
	H.eq(lo, nil, "lo")
	H.eq(hi, nil, "hi")
end)

-- --------------------------------------------------------------- viewpoints --

local LO, HI = Vector3.new(-10, 0, -10), Vector3.new(10, 20, 10)

H.test("`all` returns the full multi-view set, each named once", function()
	-- Multi-view is the point: one angle hides most composition problems.
	local vs = Render.viewpoints(LO, HI, "all")
	H.eq(#vs, 5, "count")
	local seen = {}
	for _, v in vs do
		H.ok(not seen[v.name], "duplicate viewpoint: " .. v.name)
		seen[v.name] = true
	end
	for _, want in { "hero", "front", "side", "top", "eye" } do
		H.ok(seen[want], "missing viewpoint: " .. want)
	end
end)

H.test("a named viewpoint returns exactly that one", function()
	local vs = Render.viewpoints(LO, HI, "eye")
	H.eq(#vs, 1, "count")
	H.eq(vs[1].name, "eye", "name")
end)

H.test("an unknown name falls back to the establishing shot rather than nothing", function()
	-- Returning an empty list here would make a capture silently produce no image.
	local vs = Render.viewpoints(LO, HI, "not-a-view")
	H.eq(#vs, 1, "count")
	H.eq(vs[1].name, "hero", "falls back to hero")
end)

H.test("every camera sits outside the subject and faces it", function()
	-- A camera inside the subject renders its interior and looks like a broken build.
	local centre = (LO + HI) * 0.5
	local radius = (HI - LO).Magnitude * 0.5
	for _, v in Render.viewpoints(LO, HI, "all") do
		local d = (v.cf.Position - centre).Magnitude
		H.ok(d > 1, v.name .. ": camera is at the centre of its subject")
		-- LookVector points from the camera toward what it was aimed at, so the
		-- vector to the centre must not be behind it.
		local toCentre = (centre - v.cf.Position)
		local lv = v.cf.LookVector
		local dot = toCentre.X * lv.X + toCentre.Y * lv.Y + toCentre.Z * lv.Z
		H.ok(dot > 0, v.name .. ": camera faces away from its subject")
		H.ok(d < radius * 12, v.name .. ": camera is a postage-stamp distance away (" .. tostring(d) .. ")")
	end
end)

H.test("the top view is above the subject and the eye view is not", function()
	local byName = {}
	for _, v in Render.viewpoints(LO, HI, "all") do byName[v.name] = v.cf end
	local centre = (LO + HI) * 0.5
	H.ok(byName.top.Position.Y > centre.Y, "top is above centre")
	H.ok(byName.eye.Position.Y < byName.top.Position.Y, "eye is below top")
end)

H.test("a degenerate subject still yields a usable camera distance", function()
	-- A single flat part has near-zero magnitude; the radius floor stops the camera
	-- collapsing onto it and dividing by zero.
	local vs = Render.viewpoints(Vector3.new(0, 0, 0), Vector3.new(0, 0, 0), "hero")
	local d = vs[1].cf.Position.Magnitude
	H.ok(d > 1, "expected a non-degenerate distance, got " .. tostring(d))
end)

H.report("plugin/render")
