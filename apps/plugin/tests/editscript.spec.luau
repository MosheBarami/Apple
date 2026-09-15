--!nocheck
--!modules Version,Paths,Serializer,Render,Generation,Companion,Ops
--[[
	edit_script — how Golem changes code that already exists.

	Every other mutating op adds or removes things. This one rewrites what a user
	already has, which makes its failure mode the worst in the set: a find/replace that
	matches the wrong span corrupts working code in place, and the only record is a
	checkpoint the user has to think to restore.

	Most of the risk is in two lines. `e.find` is matched literally in one branch and
	compiled to a Lua PATTERN in the other, and `e.replace` goes through gsub, where a
	`%` means something. Those are the specs that matter here.
]]

local ws = game:GetService("Workspace")

local function script_(name, source)
	local s = Instance.new("Script", ws)
	s.Name = name
	s.Source = source
	return s
end

local function edit(path, body)
	body.op = "edit_script"
	body.path = path
	return Ops.execute("e1", body)
end

-- ----------------------------------------------------------------- whole file --

H.test("source replaces the file outright and says so", function()
	local s = script_("Whole", "print('old')\n")
	local r = edit("game.Workspace.Whole", { source = "print('new')\n" })
	H.eq(r.ok, true, "ok: " .. tostring(r.error))
	H.eq(r.data.mode, "replace", "mode")
	H.eq(s.Source, "print('new')\n", "the file is the new text")
end)

H.test("the reported line count comes from what is on disk afterwards", function()
	local s = script_("Lines", "a\n")
	local r = edit("game.Workspace.Lines", { source = "a\nb\nc\n" })
	H.eq(r.data.lines, 4, "three newlines is four lines")
end)

-- --------------------------------------------------------------------- edits --

H.test("a single edit replaces the first occurrence only", function()
	local s = script_("First", "local x = 1\nlocal x = 1\n")
	local r = edit("game.Workspace.First", { edits = { { find = "local x = 1", replace = "local x = 2" } } })
	H.eq(r.ok, true, "ok: " .. tostring(r.error))
	H.eq(s.Source, "local x = 2\nlocal x = 1\n", "only the first")
	H.eq(r.data.editsApplied, 1, "one edit applied")
end)

H.test("`all` replaces every occurrence", function()
	local s = script_("All", "local x = 1\nlocal x = 1\n")
	edit("game.Workspace.All", { edits = { { find = "local x = 1", replace = "local x = 2", all = true } } })
	H.eq(s.Source, "local x = 2\nlocal x = 2\n", "both")
end)

H.test("edits apply in order, and each sees the previous one's result", function()
	local s = script_("Chain", "A\n")
	edit("game.Workspace.Chain", { edits = {
		{ find = "A", replace = "B" },
		{ find = "B", replace = "C" },
	} })
	H.eq(s.Source, "C\n", "chained")
end)

-- ------------------------------------------------- the two Lua-pattern traps --

--[[ THE FIRST TRAP: `find` is a PATTERN in the `all` branch.

	 `string.gsub` compiles its pattern, so a find containing `-`, `(`, `.`, `%` or `[`
	 means something other than itself. escapeLuaPattern exists for this, and without
	 it `find = "x - 1"` would match "x", any character, "1" — the wrong span, silently.
	 The single-edit branch uses `string.find(..., true)` and is literal already. ]]
H.test("`all` treats find as literal text, not as a pattern", function()
	local s = script_("Magic", "local n = x - 1\nlocal m = x - 1\n")
	edit("game.Workspace.Magic", { edits = { { find = "x - 1", replace = "x - 2", all = true } } })
	H.eq(s.Source, "local n = x - 2\nlocal m = x - 2\n", "the hyphen is a hyphen")
end)

H.test("every Lua magic character survives a find", function()
	for _, frag in { "a.b", "a+b", "a*b", "a?b", "a[b]", "a(b)", "a^b", "a$b", "a%b", "a-b" } do
		local s = script_("Frag", "before " .. frag .. " after\n")
		local r = edit("game.Workspace.Frag", { edits = { { find = frag, replace = "GONE", all = true } } })
		H.eq(r.ok, true, frag .. ": " .. tostring(r.error))
		H.eq(s.Source, "before GONE after\n", "find was " .. frag)
		s:Destroy()
	end
end)

--[[ THE SECOND TRAP: `%` in the REPLACEMENT.

	 In gsub a replacement's `%1` is a capture reference and `%%` is a literal percent.
	 Generated Luau contains `%` constantly — string.format, modulo, patterns — so a
	 replacement carrying one would either raise "invalid capture index" or silently
	 drop text. The handler escapes it. ]]
H.test("a percent in the replacement is written literally", function()
	local s = script_("Pct", "local fmt = OLD\nlocal g = OLD\n")
	local r = edit("game.Workspace.Pct", { edits = {
		{ find = "OLD", replace = 'string.format("%d%%", 50)', all = true },
	} })
	H.eq(r.ok, true, "ok: " .. tostring(r.error))
	H.eq(s.Source, 'local fmt = string.format("%d%%", 50)\nlocal g = string.format("%d%%", 50)\n', "verbatim")
end)

H.test("a capture reference in the replacement is text, not a reference", function()
	local s = script_("Cap", "X\n")
	local r = edit("game.Workspace.Cap", { edits = { { find = "X", replace = "%1", all = true } } })
	H.eq(r.ok, true, "ok: " .. tostring(r.error))
	H.eq(s.Source, "%1\n", "written as the two characters it is")
end)

-- ------------------------------------------------------------- the refusals --

H.test("an edit that finds nothing fails, naming which edit", function()
	local s = script_("Missing", "hello\n")
	local r = edit("game.Workspace.Missing", { edits = {
		{ find = "hello", replace = "hi" },
		{ find = "not here", replace = "x" },
	} })
	H.eq(r.ok, false, "the op fails")
	H.ok(string.find(tostring(r.error), "edit 2", 1, true), "names the index: " .. tostring(r.error))
end)

H.test("an edit that changes nothing is an error, not a silent success", function()
	-- A replace identical to its find means the model believes it changed something
	-- and did not. Reporting success there teaches it the edit landed.
	local s = script_("NoOp", "same\n")
	local r = edit("game.Workspace.NoOp", { edits = { { find = "same", replace = "same" } } })
	H.eq(r.ok, false, "refused")
	H.ok(string.find(tostring(r.error), "changed nothing", 1, true), "says why: " .. tostring(r.error))
end)

H.test("a missing script is an error that says how to create one", function()
	local r = edit("game.Workspace.NeverExisted", { source = "x" })
	H.eq(r.ok, false, "fails")
	H.ok(string.find(tostring(r.error), "create", 1, true), "names the remedy: " .. tostring(r.error))
end)

H.test("create makes the script when it is absent", function()
	local r = edit("game.Workspace.Fresh", {
		source = "print('hi')\n",
		create = { className = "Script", parent = "game.Workspace" },
	})
	H.eq(r.ok, true, "ok: " .. tostring(r.error))
	local made = ws:FindFirstChild("Fresh")
	H.ok(made, "it exists")
	H.eq(made.ClassName, "Script", "of the requested class")
	H.eq(made.Source, "print('hi')\n", "with the source")
end)

H.test("a path that is not a script is refused", function()
	local f = Instance.new("Folder", ws)
	f.Name = "NotAScript"
	local r = edit("game.Workspace.NotAScript", { source = "x" })
	H.eq(r.ok, false, "refused")
	H.ok(string.find(tostring(r.error), "not a script", 1, true), "says why: " .. tostring(r.error))
end)

H.report("plugin/editscript")
