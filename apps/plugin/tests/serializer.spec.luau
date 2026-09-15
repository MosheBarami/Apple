--!nocheck
--!modules Version,Paths,Serializer,Render,Generation,Companion,Ops
--[[
	Serializer.restore — the module's own header calls it "the highest-stakes
	operation in the product", and it had no test of any kind.

	It is the undo-a-bad-AI-build path. It DESTROYS the live tree before rebuilding,
	so a restore that recreates almost nothing is not a partial success — it is data
	loss that reported success. The header records exactly that bug: `restored` was a
	literal `true`, and `scriptsRestored` counted what was in the SNAPSHOT rather than
	what got written. The counters are the fix, and nothing was asserting them.

	Driven through `Ops.execute` wherever the asset policy is involved, because
	`restore` is the one op that opens the policy with `preexisting = true` — and that
	branch of `assetPolicyFor` was reachable by no test at all.
]]

local ws = game:GetService("Workspace")

local function snap(children, scripts)
	return {
		v = 1,
		containers = { { service = "Workspace", children = children } },
		scripts = scripts or {},
		scriptCount = 0,
	}
end

local function restore(snapshot)
	return Ops.execute("r1", { op = "restore", snapshot = snapshot })
end

-- ------------------------------------------------------------- the format gate --

H.test("a snapshot of an unsupported shape is refused, not half-applied", function()
	-- It destroys before it builds, so a format it cannot read must stop it BEFORE
	-- anything is cleared.
	for _, bad in { {}, { v = 2 }, "not a table" } do
		local r = Ops.execute("r0", { op = "restore", snapshot = bad })
		H.eq(r.ok, false, "expected a refusal")
		H.ok(string.find(tostring(r.error), "unsupported snapshot format", 1, true),
			"names the reason: " .. tostring(r.error))
	end
end)

-- ------------------------------------------------------ it reports what happened --

H.test("a clean restore reports what it actually created", function()
	local r = restore(snap({
		{ class = "Folder", name = "Restored", children = {
			{ class = "Part", name = "A" },
			{ class = "Part", name = "B" },
		} },
	}))
	H.eq(r.ok, true, "ok: " .. tostring(r.error))
	H.eq(r.data.restored, true, "restored")
	H.eq(r.data.instancesCreated, 3, "one folder and two parts")
	H.eq(r.data.failedInstances, 0, "failedInstances")
	H.eq(r.data.failedProperties, 0, "failedProperties")
	local folder = ws:FindFirstChild("Restored")
	H.ok(folder, "the folder is actually in the place")
	H.eq(#folder:GetChildren(), 2, "with its children")
end)

--[[ THE BUG THE COUNTERS EXIST FOR.

	 An unrecognised class cannot be created. The old code discarded that pcall and
	 still returned `restored = true`, so a snapshot that recreated a fraction of the
	 tree was indistinguishable from one that worked — after the live tree was already
	 destroyed. ]]
H.test("an instance that cannot be recreated is counted, and fails the op", function()
	local r = restore(snap({
		{ class = "Folder", name = "Partial", children = {
			{ class = "Part", name = "Good" },
			{ class = "NotARealClass", name = "Bad" },
		} },
	}))
	H.eq(r.data.failedInstances, 1, "the failure is counted")
	H.eq(r.data.restored, false, "and restored says so")
	H.eq(r.ok, false, "so Ops.execute fails the op rather than reporting success")
	H.ok(string.find(tostring(r.error), "restore incomplete", 1, true), "the error says what: " .. tostring(r.error))
end)

H.test("a property that cannot be written is counted rather than swallowed", function()
	local r = restore(snap({
		{ class = "Folder", name = "PropFail", children = {
			{ class = "Part", name = "P", props = { NotAProperty = { t = "string", v = "x" } } },
		} },
	}))
	H.eq(r.data.failedProperties, 1, "counted")
	H.eq(r.data.instancesCreated, 2, "the instance itself still came back")
end)

-- --------------------------------------------------- the preexisting asset policy --

--[[ WHY restore MAY RE-MATERIALISE AN UNVERIFIED ID.

	 A snapshot is a record of what was ALREADY in this place — Serializer.snapshot
	 read it out of the same place. Refusing those ids would make a rollback strip the
	 user's own MeshIds, which is destruction dressed up as caution.

	 So `assetPolicyFor("restore")` returns `preexisting = true`, and that branch had
	 no test. These two assert both halves: the grant exists inside the op, and it
	 does not outlive it. ]]

H.test("a restore re-materialises an asset id nothing verified", function()
	local r = restore(snap({
		{ class = "Folder", name = "AssetRestore", children = {
			{ class = "MeshPart", name = "M", props = { MeshId = { t = "string", v = "rbxassetid://424242" } } },
		} },
	}))
	H.eq(r.data.failedProperties, 0, "the MeshId must not be refused during a restore")
	local m = ws:FindFirstChild("AssetRestore"):FindFirstChild("M")
	H.eq(m.MeshId, "rbxassetid://424242", "and it is actually set")
end)

H.test("the preexisting grant does not outlive the restore", function()
	restore(snap({ { class = "Folder", name = "AfterRestore" } }))
	local part = Instance.new("MeshPart")
	H.raises(function()
		Paths.setProp(part, "MeshId", { t = "string", v = "rbxassetid://424242" })
	end, "not verified in this session", "the restore's grant leaked")
end)

-- ------------------------------------------------------------- destroy-then-build --

H.test("restoring replaces what is there rather than adding beside it", function()
	local stale = Instance.new("Folder", ws)
	stale.Name = "StaleTree"
	Instance.new("Part", stale).Name = "Old"
	restore(snap({ { class = "Folder", name = "FreshTree" } }))
	H.eq(ws:FindFirstChild("StaleTree"), nil, "the previous tree is gone")
	H.ok(ws:FindFirstChild("FreshTree"), "and the snapshot's tree is there")
end)

H.test("Terrain and Camera survive a restore", function()
	-- They cannot be destroyed and recreated, so SKIP_CLASSES keeps them. A restore
	-- that removed the Camera would leave the place unviewable.
	--
	-- The Camera is CREATED here first. Written without that, this test read
	-- `nil == nil` and passed whatever the code did — the vacuous shape that is worth
	-- more attention than a failing test, because it never asks to be looked at.
	local cam = Instance.new("Camera", ws)
	cam.Name = "Camera"
	local doomed = Instance.new("Folder", ws)
	doomed.Name = "DoomedByRestore"
	restore(snap({ { class = "Folder", name = "KeepsCamera" } }))
	H.eq(ws:FindFirstChild("Camera"), cam, "the Camera is the SAME instance, not a new one")
	H.eq(ws:FindFirstChild("DoomedByRestore"), nil, "and an ordinary folder beside it was cleared")
end)

H.report("plugin/serializer")
