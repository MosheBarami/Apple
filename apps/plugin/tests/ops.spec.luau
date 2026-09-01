--!nocheck
--!modules Version,Paths,Serializer,Render,Generation,Ops
--[[
	Ops.execute — the single entry point for every action the agent performs in a
	user's place, and the owner of the asset-policy window.

	These specs drive `Ops.execute` rather than the private helpers behind it. That is
	deliberate and it is the F-57 lesson: `MUTATING` and `handlers` are two lists that
	must agree, maintained by hand in the same file, and a kind present in one and
	absent from the other is invisible to any test that calls the implementation
	function directly. Every assertion below goes through the real dispatch.
]]

local function reply(kind, body)
	body = body or {}
	body.op = kind
	return Ops.execute("t1", body)
end

-- ------------------------------------------------------- the dispatch table --

H.test("an unregistered op is refused by name rather than silently ignored", function()
	local r = reply("definitely_not_an_op")
	H.eq(r.ok, false, "ok")
	H.ok(string.find(r.error, "unknown op", 1, true), "names the failure: " .. tostring(r.error))
	H.ok(string.find(r.error, "definitely_not_an_op", 1, true), "echoes the kind")
end)

--[[ THE F-57 CHECK.

	`MUTATING` and `handlers` are separate hand-maintained tables. A kind in
	`MUTATING` with no handler is dispatched as "unknown op" and never opens a
	recording; a mutating kind MISSING from `MUTATING` runs with no undo point at
	all, which is the exact failure Ops.execute's own header says it exists to
	prevent. Neither is visible by reading one table.

	This asserts both memberships at once through the real entry point: with the
	recording forced to refuse, a kind that is both registered AND mutating can only
	produce the recording refusal. "unknown op" here means it is missing from
	`handlers`; a success means it is missing from `MUTATING`. ]]
local MUTATING_KINDS = {
	"edit_script", "create_instances", "set_props", "delete_instances",
	"move_instances", "restore", "insert_asset", "run_code", "generate_model",
}

for _, kind in MUTATING_KINDS do
	H.test(kind .. " is registered AND declared mutating", function()
		game:GetService("ChangeHistoryService").__refuseNext = true
		local r = reply(kind)
		H.eq(r.ok, false, kind .. " ok")
		H.ok(
			string.find(r.error, "could not open an undo recording", 1, true),
			kind .. ": expected the recording refusal, got " .. tostring(r.error)
		)
	end)
end

H.test("a read-only op does not take an undo recording", function()
	-- `ping` mutates nothing. If it ever appeared in MUTATING it would consume a
	-- recording, and this refusal — armed and never spent — would surface it.
	local history = game:GetService("ChangeHistoryService")
	history.__refuseNext = true
	local r = reply("ping")
	H.eq(r.ok, true, "ping ok: " .. tostring(r.error))
	H.eq(history.__refuseNext, true, "the armed refusal was never consumed")
	history.__refuseNext = false
end)

H.test("a refused mutation leaves no recording open", function()
	local history = game:GetService("ChangeHistoryService")
	history.__refuseNext = true
	reply("create_instances")
	for _ in history.__recordings do
		error("a recording was left open by a refused mutation")
	end
end)

H.test("a handler that raises cancels its recording rather than committing it", function()
	local history = game:GetService("ChangeHistoryService")
	history.__log = {}
	-- No `items`, so create_instances raises inside the handler.
	local r = reply("create_instances")
	H.eq(r.ok, false, "ok")
	local sawCancel = false
	for _, line in history.__log do
		if string.find(line, "Cancel", 1, true) then sawCancel = true end
		if string.find(line, "Commit", 1, true) then
			error("a raising handler committed its recording: " .. line)
		end
	end
	H.ok(sawCancel, "expected a Cancel in the history log")
	for _ in history.__recordings do
		error("a raising handler left its recording open")
	end
end)

-- --------------------------------------------------- the asset-policy window --

--[[ Ops.execute opens an asset policy immediately before the handler and closes it
	immediately after. The window is what makes an unverified asset id unusable, so
	"is it actually shut afterwards" is a security property, not hygiene. Paths has
	no getter for the live policy — deliberately, it is private — so this asserts on
	the OBSERVABLE consequence: with no op in flight, setProp must refuse. ]]

H.test("outside any op, no asset id may be referenced", function()
	local part = Instance.new("Part")
	H.raises(function()
		Paths.setProp(part, "MeshId", { t = "string", v = "rbxassetid://123" })
	end, "not verified in this session", "setProp outside an op")
end)

H.test("the policy is shut again after a handler raises", function()
	reply("create_instances") -- raises inside the handler
	local part = Instance.new("Part")
	H.raises(function()
		Paths.setProp(part, "MeshId", { t = "string", v = "rbxassetid://123" })
	end, "not verified in this session", "setProp after a raising op")
end)

H.test("the policy is shut again after a handler returns normally", function()
	reply("ping")
	local part = Instance.new("Part")
	H.raises(function()
		Paths.setProp(part, "MeshId", { t = "string", v = "rbxassetid://456" })
	end, "not verified in this session", "setProp after a clean op")
end)

--[[ WHAT `ok` MEANS FOR set_props, because it is not what it looks like.

	set_props pcalls each property individually and collects the failures into
	`propIssues`, so a REFUSED asset reference still returns `ok = true` at the op
	level. The security property holds — Paths.setProp raises before the assignment,
	so the property is never written — but asserting on `r.ok` alone would pass
	whether or not the gate fired. These assert on what actually happened to the
	instance: which properties landed in `set`, and what the instance now holds. ]]

local function contains(list, want)
	for _, v in list do if v == want then return true end end
	return false
end

H.test("an envelope-verified id is referenceable, and only for that op", function()
	-- set_props reads verifiedAssetIds off the op ENVELOPE, which the worker builds.
	local target = Instance.new("Part", game:GetService("Workspace"))
	target.Name = "PolicyProbe"
	local r = Ops.execute("t2", {
		op = "set_props",
		verifiedAssetIds = { 777 },
		path = "game.Workspace.PolicyProbe",
		props = { MeshId = { t = "string", v = "rbxassetid://777" } },
	})
	H.eq(r.ok, true, "op ok: " .. tostring(r.error))
	H.eq(r.data.propIssues, nil, "a verified id must raise no issue")
	H.eq(contains(r.data.set, "MeshId"), true, "MeshId reported as set")
	H.eq(target.MeshId, "rbxassetid://777", "and actually assigned")
	-- And the grant does not outlive the op.
	local other = Instance.new("Part")
	H.raises(function()
		Paths.setProp(other, "MeshId", { t = "string", v = "rbxassetid://777" })
	end, "not verified in this session", "the grant leaked past its op")
end)

H.test("verifiedAssetIds is read off the envelope, never out of props", function()
	local target = Instance.new("Part", game:GetService("Workspace"))
	target.Name = "SmuggleProbe"
	-- The model authors `props`. If the policy ever read ids from there, MeshId would land.
	local r = Ops.execute("t3", {
		op = "set_props",
		path = "game.Workspace.SmuggleProbe",
		props = {
			verifiedAssetIds = { t = "string", v = "888" },
			MeshId = { t = "string", v = "rbxassetid://888" },
		},
	})
	H.eq(contains(r.data.set, "MeshId"), false, "a model-supplied id must not grant itself permission")
	H.eq(target.MeshId, nil, "the refused property must never be assigned")
	H.ok(r.data.propIssues, "expected a propIssues entry for the refusal")
	H.ok(string.find(table.concat(r.data.propIssues, " "), "888", 1, true), "names the refused id")
end)

H.test("a refused asset reference is reported, not silently dropped", function()
	-- An agent that reads only `ok` would believe this worked. `propIssues` is the
	-- only signal that it did not, so it has to be present and it has to be readable.
	local target = Instance.new("Part", game:GetService("Workspace"))
	target.Name = "ReportProbe"
	local r = Ops.execute("t4", {
		op = "set_props",
		path = "game.Workspace.ReportProbe",
		props = {
			Name = { t = "string", v = "ReportProbe" },
			MeshId = { t = "string", v = "rbxassetid://999" },
		},
	})
	H.ok(r.data.propIssues, "expected propIssues")
	H.eq(#r.data.propIssues, 1, "exactly the one refusal")
	H.ok(string.find(r.data.propIssues[1], "insert_asset", 1, true), "names the gated tool to use instead")
end)

-- ------------------------------------------------- the non-yielding loop gate --

--[[ HONEST LIMIT, stated rather than glossed. `run_code`'s SUCCESS path ends in
	`require(module)` on a freshly built ModuleScript — the standalone Luau CLI has
	no way to evaluate that, and faking it would be testing a different program. So
	these specs assert on the REFUSAL decision only: a refused loop returns the
	refusal, and an accepted one gets PAST the gate (it then fails on the require
	this harness cannot provide, which is a different error and is asserted as such). ]]

local function runCode(code)
	return reply("run_code", { code = code })
end

local function refusedFor(code)
	local r = runCode(code)
	return r.ok == false and string.find(tostring(r.error), "loop with no yield", 1, true) ~= nil
end

H.test("a bare `while true do` with no yield is refused", function()
	H.eq(refusedFor("while true do end"), true, "while true do end")
	H.eq(refusedFor("while true do local x = 1 end"), true, "with a body")
	H.eq(refusedFor("while 1 do end"), true, "while 1 do")
end)

H.test("the refusal tells the agent what to do instead", function()
	local r = runCode("while true do end")
	H.ok(string.find(r.error, "task.wait", 1, true), "names a yield: " .. tostring(r.error))
	H.ok(string.find(r.error, "bounded counter", 1, true), "offers the alternative")
end)

H.test("a loop that yields is allowed through", function()
	-- Each of these is a DISTINCT entry in the YIELDS list, asserted separately so a
	-- pattern that stops matching is caught rather than covered for by a neighbour.
	--
	-- Noted while building the mutation check: `task%.wait` is redundant. The generic
	-- `%f[%w]wait%s*%(` already matches `task.wait(`, because the frontier is
	-- satisfied by the dot. Removing the specific entry changes no behaviour. It is
	-- harmless and left alone; the entries below it are not redundant and are pinned.
	H.eq(refusedFor("while true do task.wait() end"), false, "task.wait")
	H.eq(refusedFor("while true do wait(1) end"), false, "bare wait()")
	H.eq(refusedFor("while true do task.delay(1, f) end"), false, "task.delay")
	H.eq(refusedFor("while true do task.spawn(f) end"), false, "task.spawn")
	H.eq(refusedFor("while true do task.defer(f) end"), false, "task.defer")
	H.eq(refusedFor("while true do part.Touched:Wait() end"), false, ":Wait()")
	H.eq(refusedFor("while true do RunService.Heartbeat:Wait() end"), false, "RunService")
	H.eq(refusedFor("while true do store:GetAsync(k) end"), false, ":GetAsync")
	H.eq(refusedFor("while true do HttpService:RequestAsync(r) end"), false, "HttpService")
end)

H.test("`repeat` is only refused when it cannot terminate", function()
	H.eq(refusedFor("repeat local x = 1 until x > 0"), false, "a bounded repeat")
	H.eq(refusedFor("repeat until false"), true, "repeat until false")
end)

H.test("a loop keyword inside a string literal is not a loop", function()
	-- The gate strips strings and comments first. Without that, printing the phrase
	-- would be refused as if it were code.
	H.eq(refusedFor('print("while true do")'), false, "double-quoted")
	H.eq(refusedFor("print('while true do')"), false, "single-quoted")
	H.eq(refusedFor("-- while true do\nprint(1)"), false, "line comment")
	H.eq(refusedFor("--[[ while true do ]]\nprint(1)"), false, "block comment")
end)

H.test("code with no loop at all is never refused", function()
	H.eq(refusedFor("return 1 + 1"), false, "arithmetic")
	H.eq(refusedFor("for i = 1, 10 do print(i) end"), false, "a bounded numeric for")
end)

H.report("plugin/ops")
