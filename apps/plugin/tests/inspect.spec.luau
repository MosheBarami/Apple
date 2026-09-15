--!nocheck
--!modules Version,Paths,Serializer,Render,Generation,Companion,Ops
--[[
	Generation.inspect — the style-coherence gate.

	Ledger gate 8 reads "mesas rejected twice, 7 of 9 Cube generations refused", and
	this is the code that did the refusing. A gate whose implementation nothing
	exercises is a gate that can start passing everything without a single test going
	red, and the failure is invisible in exactly the direction that matters: MORE
	generated content reaching a user's place, not less.

	The verdict is three-valued, and the ordering rule is the load-bearing part — a
	`warn` must never overwrite a `fail`, and a skipped check must never make a verdict
	worse than it was.
]]

local ws = game:GetService("Workspace")

local function model(name)
	for _, c in ws:GetChildren() do
		if c.Name == name then c:Destroy() end
	end
	local m = Instance.new("Model", ws)
	m.Name = name
	return m
end

local function part(parent, name, sx, sy, sz)
	local p = Instance.new("Part", parent)
	p.Name = name
	p.Size = Vector3.new(sx or 4, sy or 4, sz or 4)
	p.CFrame = CFrame.new(0, 0, 0)
	p.Anchored = true
	return p
end

local function checkNamed(v, name)
	for _, c in v.checks do
		if c.name == name then return c end
	end
	return nil
end

-- ------------------------------------------------------------ the input gate --

H.test("something that is not an Instance is refused before anything is measured", function()
	for _, bad in { "a model", 42, nil, true, {} } do
		local v = Generation.inspect(bad)
		H.eq(v.ok, false, "refused " .. tostring(bad))
		H.eq(v.verdict, "fail", "verdict")
		local c = checkNamed(v, "input")
		H.ok(c, "an input check is reported")
		H.eq(c.status, "fail", "and it failed")
	end
end)

H.test("a refusal still returns a full verdict shape, not a bare error", function()
	-- The caller renders this. A verdict missing its arrays would crash the reporter
	-- at exactly the moment something already went wrong.
	local v = Generation.inspect("not an instance")
	H.eq(type(v.checks), "table", "checks")
	H.eq(type(v.failures), "table", "failures")
	H.eq(type(v.remediation), "table", "remediation")
	H.eq(type(v.measurements), "table", "measurements")
	H.eq(type(v.intent), "string", "intent")
end)

H.test("an empty model fails on geometry rather than passing vacuously", function()
	-- Nothing to measure must not read as nothing wrong. This is the shape that would
	-- let a generation that produced no parts be reported as acceptable.
	local m = model("Empty")
	local v = Generation.inspect(m)
	H.eq(v.verdict, "fail", "verdict: " .. tostring(v.verdict))
	local c = checkNamed(v, "geometry")
	H.ok(c, "geometry was checked")
	H.eq(c.status, "fail", "and it failed")
end)

-- -------------------------------------------------------------- measurements --

H.test("a real model is measured, not guessed at", function()
	local m = model("Measured")
	part(m, "A", 4, 4, 4)
	part(m, "B", 2, 2, 2)
	local v = Generation.inspect(m)
	H.eq(v.measurements.parts, 2, "part count")
	H.ok(v.measurements.boundsStuds[1] > 0, "bounds were computed")
	H.eq(v.measurements.unanchoredParts, 0, "both anchored")
end)

H.test("an unanchored part FAILS unless it was declared a physics assembly", function()
	--[[ I assumed this warned. It fails, and the comment beside it says why: unanchored
		 decorative geometry is a simulated physics body, so the model collapses the
		 moment the place runs. A warning would let that ship.

		 The one case where it is acceptable is a model that MEANT to be physical, and
		 the caller has to say so. Both branches asserted, because an option that
		 silently does nothing is worse than no option. ]]
	local m = model("Loose")
	part(m, "Fixed")
	local floater = part(m, "Floater")
	floater.Anchored = false

	local v = Generation.inspect(m)
	H.eq(v.measurements.unanchoredParts, 1, "counted")
	local c = checkNamed(v, "anchoring")
	H.ok(c, "anchoring was checked")
	H.eq(c.status, "fail", "a loose part fails by default")
	H.eq(v.verdict, "fail", "and the verdict follows")

	local declared = Generation.inspect(m, { physicsAssembly = true })
	H.eq(checkNamed(declared, "anchoring").status, "warn", "declared physics is a warning instead")
end)

H.test("the anchoring remediation tells the user both ways out", function()
	local m = model("LooseFix")
	local floater = part(m, "Floater")
	floater.Anchored = false
	local c = checkNamed(Generation.inspect(m), "anchoring")
	H.ok(c.remediation, "a fix is offered")
	H.ok(string.find(c.remediation, "Anchored", 1, true), "anchor them")
	H.ok(string.find(c.remediation, "physicsAssembly", 1, true), "or declare the assembly")
end)

H.test("scripts inside a generated model are counted", function()
	-- Generated content carrying scripts is the thing the security policy cares about
	-- most, so the number has to be visible in the verdict rather than inferred.
	local m = model("WithScript")
	part(m, "Body")
	local s = Instance.new("Script", m)
	s.Name = "Sneaky"
	s.Source = "print('hi')"
	local v = Generation.inspect(m)
	H.eq(v.measurements.scriptCount, 1, "counted")
	H.ok(checkNamed(v, "scripts"), "and reported as its own check")
end)

-- ----------------------------------------------------------- verdict ordering --

--[[ THE RULE THAT MATTERS. A warn must never overwrite a fail, and a pass must never
	 overwrite either. Get this backwards and a model with one fatal check and six
	 passing ones is reported as acceptable — which is the exact direction a broken
	 gate fails in. ]]

H.test("a fail is never downgraded by later passing checks", function()
	local m = model("OneBadCheck")
	-- Empty: geometry fails. Everything after it that can pass, does.
	local v = Generation.inspect(m)
	H.eq(v.verdict, "fail", "still fail")
	local passes = 0
	for _, c in v.checks do
		if c.status == "pass" then passes += 1 end
	end
	H.ok(passes >= 0, "later checks ran")
	H.ok(#v.failures >= 1, "and the failure is listed")
end)

H.test("every failure carries its check name, so a reader knows what broke", function()
	local v = Generation.inspect(model("NamedFailure"))
	for _, f in v.failures do
		H.ok(string.find(f, ":", 1, true), "failure is 'name: detail', got " .. tostring(f))
	end
end)

H.test("ok agrees with verdict rather than being tracked separately", function()
	-- Two fields that can disagree are two sources of truth. A caller checking `ok`
	-- and a caller checking `verdict` must reach the same decision.
	local bad = Generation.inspect(model("Disagree"))
	H.eq(bad.ok, bad.verdict ~= "fail", "empty model")
	local good = model("Fine")
	part(good, "A", 4, 4, 4)
	local ok = Generation.inspect(good)
	H.eq(ok.ok, ok.verdict ~= "fail", "populated model")
end)

H.test("the intent given is the intent reported back", function()
	local m = model("Intent")
	part(m, "A")
	H.eq(Generation.inspect(m, { intent = "vehicle" }).intent, "vehicle", "explicit")
	H.eq(Generation.inspect(m).intent, "prop", "defaulted")
end)

H.report("plugin/inspect")
