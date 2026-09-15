--!nocheck
--!modules Version,Paths,Serializer,Render,Generation,Companion,Ops
--[[
	Serializer.snapshot and Serializer.tree — reading the place OUT.

	`restore` is covered in serializer.spec.luau. This is the other half, and the pair
	only means anything together: a snapshot that omits something restores a place
	missing it, and nothing in either module notices, because each is individually
	consistent. So the last section here is a ROUND TRIP — snapshot a tree, clear the
	place, restore it, and compare — which is the only assertion that can catch the two
	halves agreeing on the wrong thing.

	`tree` is the other reader: it is what `get_project_tree` returns, and therefore the
	first thing Golem sees of a project it has never met.
]]

local ws = game:GetService("Workspace")

local function scene()
	for _, c in ws:GetChildren() do
		if c.Name == "Snap" then c:Destroy() end
	end
	local root = Instance.new("Folder", ws)
	root.Name = "Snap"
	return root
end

-- ------------------------------------------------------------------- tree ----

H.test("tree reports name and class for every node", function()
	local root = scene()
	local p = Instance.new("Part", root)
	p.Name = "Block"
	-- `tree` wraps its node: { root = <node>, nodeCount = n }. The wrapper is what
	-- carries nodeCount, which a caller needs to know whether it saw the whole place.
	local t = Serializer.tree(root, 4, 100)
	H.eq(t.root.name, "Snap", "root name")
	H.eq(t.root.class, "Folder", "root class")
	H.ok(t.nodeCount >= 2, "nodeCount is reported")
	H.eq(#t.root.children, 1, "one child")
	H.eq(t.root.children[1].name, "Block", "child name")
	H.eq(t.root.children[1].class, "Part", "child class")
end)

H.test("a BasePart carries position and size, rounded to a tenth", function()
	-- Rounded because this goes into a model's context window: full float precision is
	-- noise that costs tokens and tells the model nothing.
	local root = scene()
	local p = Instance.new("Part", root)
	p.Name = "Rounded"
	p.Size = Vector3.new(4.44444, 1, 2)
	p.CFrame = CFrame.new(1.23456, 0, -7.89)
	local t = Serializer.tree(root, 4, 100)
	local node = t.root.children[1]
	H.eq(node.size[1], 4.4, "size rounded")
	H.eq(node.pos[1], 1.2, "pos rounded")
	H.eq(node.pos[3], -7.9, "negative rounds too")
end)

H.test("a Folder carries no geometry, because it has none", function()
	local root = scene()
	local t = Serializer.tree(root, 4, 100)
	H.eq(t.root.pos, nil, "no pos")
	H.eq(t.root.size, nil, "no size")
end)

H.test("beyond maxDepth the children become a COUNT, not a silent omission", function()
	-- The difference matters to a model: "3 more children" is a prompt to look deeper;
	-- an absent key reads as a leaf.
	local root = scene()
	local a = Instance.new("Folder", root); a.Name = "A"
	for i = 1, 3 do
		local c = Instance.new("Part", a)
		c.Name = "Deep" .. i
	end
	local t = Serializer.tree(root, 1, 100)
	local node = t.root.children[1]
	H.eq(node.children, nil, "children are not walked at the limit")
	H.eq(node.moreChildren, 3, "the count is reported instead")
end)

H.test("hitting maxNodes marks the node truncated rather than lying about the tree", function()
	local root = scene()
	for i = 1, 10 do
		local c = Instance.new("Part", root)
		c.Name = "P" .. i
	end
	local t = Serializer.tree(root, 4, 4)
	H.eq(t.root.truncated, true, "says it stopped early")
	H.ok(#t.root.children < 10, "and did stop, got " .. tostring(#t.root.children))
end)

H.test("the node budget stops the walk INSIDE a subtree, not only between siblings", function()
	--[[ The sibling loop breaks on the budget, so a flat tree stops either way and a
		 flat test cannot tell whether the recursion respects it. This one nests: with a
		 budget of 5 against 30 nodes down one chain, only the early return inside walk
		 can stop it, and without that the whole chain is walked and counted. ]]
	local root = scene()
	local node = root
	for i = 1, 30 do
		local child = Instance.new("Folder", node)
		child.Name = "D" .. i
		node = child
	end
	local t = Serializer.tree(root, 50, 5)
	H.ok(t.nodeCount <= 6, "the walk stopped at the budget, counted " .. tostring(t.nodeCount))
	-- And the depth actually reached is short, rather than the full thirty.
	local depth, cur = 0, t.root
	while cur and cur.children and cur.children[1] do
		depth += 1
		cur = cur.children[1]
	end
	H.ok(depth < 10, "expected a shallow tree under the budget, got depth " .. tostring(depth))
end)

H.test("Terrain and the Camera are named but never descended into", function()
	-- Walking Terrain is meaningless and walking the Camera is noise; both still have
	-- to APPEAR, or a model reading the tree concludes the place has no camera.
	local root = scene()
	local cam = Instance.new("Camera", root)
	cam.Name = "Camera"
	Instance.new("Part", cam).Name = "AttachedToCamera"
	local t = Serializer.tree(root, 4, 100)
	local node = t.root.children[1]
	H.eq(node.class, "Camera", "it is listed")
	H.eq(node.children, nil, "and not descended into")
end)

-- --------------------------------------------------------------- snapshot ----

local function snapOf(root)
  -- The snapshot walks whole services, so find our subtree inside the Workspace one.
  local snap = Serializer.snapshot(true)
  for _, container in snap.containers do
    if container.service == "Workspace" then
      for _, node in container.children do
        if node.name == root.Name then return snap, node end
      end
    end
  end
  return snap, nil
end

H.test("a snapshot records class, name and the properties that matter", function()
	local root = scene()
	local p = Instance.new("Part", root)
	p.Name = "Recorded"
	p.Anchored = true
	p.Transparency = 0.5
	local _, node = snapOf(root)
	H.ok(node, "our subtree is in the snapshot")
	local child = node.children[1]
	H.eq(child.class, "Part", "class")
	H.eq(child.name, "Recorded", "name")
	H.ok(child.props, "properties captured")
	H.eq(child.props.Anchored.v, true, "Anchored")
	H.eq(child.props.Transparency.v, 0.5, "Transparency")
end)

H.test("attributes are captured and encoded, not dropped", function()
	local root = scene()
	local p = Instance.new("Part", root)
	p.Name = "Tagged"
	p:SetAttribute("Zone", "meadow")
	p:SetAttribute("Level", 3)
	local _, node = snapOf(root)
	local child = node.children[1]
	H.ok(child.attrs, "attributes captured")
	H.eq(child.attrs.Zone.v, "meadow", "string attribute")
	H.eq(child.attrs.Level.v, 3, "number attribute")
end)

H.test("scripts are collected once and referenced by index", function()
	-- Source lives in a side table rather than inline, so a tree with the same module
	-- in ten places carries the text once.
	local root = scene()
	local s = Instance.new("Script", root)
	s.Name = "Logic"
	s.Source = "print('hello')\n"
	local snap, node = snapOf(root)
	local child = node.children[1]
	H.ok(child.scriptRef, "the node points at the script table")
	H.eq(snap.scripts[child.scriptRef].source, "print('hello')\n", "and the source is there")
	H.ok(snap.scriptCount >= 1, "counted")
end)

H.test("a snapshot skips Terrain and the Camera entirely", function()
	--[[ Not merely "does not descend" — omits. Serializer.restore recreates whatever a
		 snapshot contains and its clearChildren KEEPS these two classes, so a snapshot
		 that included the Camera would restore a SECOND one beside the original every
		 time. The tree test above covers not-descending; this covers not-including. ]]
	local root = scene()
	local cam = Instance.new("Camera", root)
	cam.Name = "SnapCam"
	Instance.new("Part", root).Name = "Ordinary"
	local _, node = snapOf(root)
	H.ok(node, "our subtree is in the snapshot")
	local names = {}
	for _, c in node.children do names[c.name] = c.class end
	H.eq(names.Ordinary, "Part", "the ordinary part is there")
	H.eq(names.SnapCam, nil, "and the Camera is not")
end)

H.test("includeScripts = false leaves the source behind", function()
	local root = scene()
	local s = Instance.new("Script", root)
	s.Name = "Skipped"
	s.Source = "print('secret')\n"
	local snap = Serializer.snapshot(false)
	H.eq(snap.scriptCount, 0, "no scripts collected")
	H.eq(#snap.scripts, 0, "and the table is empty")
end)

-- ------------------------------------------------------------ the round trip --

--[[ THE ONLY TEST THAT CATCHES THE TWO HALVES AGREEING ON THE WRONG THING.

	 snapshot and restore are each internally consistent whatever they do. A property
	 snapshot never reads is a property restore never writes, and neither module has a
	 way to notice. Comparing a tree against itself across both is what does. ]]
H.test("a tree survives snapshot -> restore intact", function()
	local root = scene()
	local model = Instance.new("Model", root)
	model.Name = "Rig"
	local a = Instance.new("Part", model)
	a.Name = "Base"
	a.Anchored = true
	a.Transparency = 0.25
	a:SetAttribute("Zone", "frost")
	local s = Instance.new("Script", model)
	s.Name = "Behaviour"
	s.Source = "-- restored\nreturn true\n"

	local snap = Serializer.snapshot(true)
	local result = Serializer.restore(snap)
	H.eq(result.restored, true, "restore reported success: " .. tostring(result.error))

	local back = ws:FindFirstChild("Snap")
	H.ok(back, "the subtree came back")
	local rig = back:FindFirstChild("Rig")
	H.ok(rig, "the model came back")
	local base = rig:FindFirstChild("Base")
	H.ok(base, "the part came back")
	H.eq(base.Anchored, true, "Anchored survived")
	H.eq(base.Transparency, 0.25, "Transparency survived")
	H.eq(base:GetAttribute("Zone"), "frost", "the attribute survived")
	local beh = rig:FindFirstChild("Behaviour")
	H.ok(beh, "the script came back")
	H.eq(beh.Source, "-- restored\nreturn true\n", "with its source")
end)

H.test("the round trip reports the same instance count it wrote", function()
	local root = scene()
	for i = 1, 5 do
		local p = Instance.new("Part", root)
		p.Name = "N" .. i
	end
	local snap = Serializer.snapshot(true)
	local result = Serializer.restore(snap)
	H.eq(result.failedInstances, 0, "nothing failed to rebuild")
	H.eq(result.failedProperties, 0, "no property was refused")
	H.eq(result.instancesCreated, snap.instanceCount, "created what the snapshot held")
end)

H.report("plugin/snapshot")
