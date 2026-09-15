--!nocheck
--!modules Version,Paths,Serializer,Render,Generation,Companion,Ops
--[[
	The read and move handlers.

	These are what Golem uses to UNDERSTAND a project before it changes one — the
	golden creation run spent its first four tool calls entirely in here — and what it
	uses to reorganise one afterwards. They are less dramatic than the asset gate and
	they are the ones a wrong answer misleads the model with, quietly, for the rest of
	a run.
]]

local ws = game:GetService("Workspace")

local function scene(name)
	for _, c in ws:GetChildren() do
		if c.Name == name then c:Destroy() end
	end
	local f = Instance.new("Folder", ws)
	f.Name = name
	return f
end

local function script_(parent, name, source)
	local s = Instance.new("Script", parent)
	s.Name = name
	s.Source = source
	return s
end

-- ------------------------------------------------------------ search_scripts --

H.test("a search reports the path, the line NUMBER and the line text", function()
	-- All three matter: the model uses the path to read the file, the number to make a
	-- targeted edit, and the text to decide whether the match is the one it wanted.
	local root = scene("Search")
	script_(root, "A", "local x = 1\nlocal target = 2\nprint(target)\n")
	local r = Ops.execute("s1", { op = "search_scripts", query = "target", root = "game.Workspace.Search" })
	H.eq(r.ok, true, "ok: " .. tostring(r.error))
	H.eq(#r.data.matches, 2, "two lines mention it")
	H.eq(r.data.matches[1].line, 2, "first match is on line 2")
	H.eq(r.data.matches[2].line, 3, "second on line 3")
	H.ok(string.find(r.data.matches[1].path, "A", 1, true), "carries the path")
	H.ok(string.find(r.data.matches[1].text, "target", 1, true), "and the line")
end)

H.test("the query is matched literally, so a pattern character is not a wildcard", function()
	--[[ string.find with plain = true. The query below is chosen so the two readings
		 DISAGREE: as a literal, "a.c" matches only the line containing a.c; as a Lua
		 pattern the dot is any character, so it also matches abc and axc.

		 The first version of this test used "x .." against two lines and passed under
		 both readings — the mutation that removed `true` survived it. A discriminating
		 case is the whole point of the test. ]]
	local root = scene("SearchLiteral")
	script_(root, "B", "local one = abc\nlocal two = a.c\nlocal three = axc\n")
	local r = Ops.execute("s2", { op = "search_scripts", query = "a.c", root = "game.Workspace.SearchLiteral" })
	H.eq(#r.data.matches, 1, "only the literal match, not the two the pattern would add")
	H.eq(r.data.matches[1].line, 2, "and it is the a.c line")
end)

H.test("a search that finds nothing returns an empty list, not an error", function()
	local root = scene("SearchNone")
	script_(root, "C", "print('hello')\n")
	local r = Ops.execute("s3", { op = "search_scripts", query = "zzz", root = "game.Workspace.SearchNone" })
	H.eq(r.ok, true, "ok")
	H.eq(#r.data.matches, 0, "no matches")
	H.eq(r.data.query, "zzz", "and echoes what was asked")
end)

H.test("maxResults caps the answer rather than the model's context window", function()
	local root = scene("SearchCap")
	local body = ""
	for i = 1, 50 do body = body .. "hit " .. i .. "\n" end
	script_(root, "D", body)
	local r = Ops.execute("s4", { op = "search_scripts", query = "hit", root = "game.Workspace.SearchCap", maxResults = 5 })
	H.eq(#r.data.matches, 5, "capped")
end)

H.test("the default cap applies when none is asked for", function()
	local root = scene("SearchDefault")
	local body = ""
	for i = 1, 100 do body = body .. "hit " .. i .. "\n" end
	script_(root, "E", body)
	local r = Ops.execute("s5", { op = "search_scripts", query = "hit", root = "game.Workspace.SearchDefault" })
	H.eq(#r.data.matches, 40, "the 40-result default")
end)

H.test("a matched line is truncated, so one minified file cannot flood the answer", function()
	local root = scene("SearchLong")
	script_(root, "F", "x" .. string.rep("y", 500) .. "\n")
	local r = Ops.execute("s6", { op = "search_scripts", query = "x", root = "game.Workspace.SearchLong" })
	H.eq(#r.data.matches[1].text, 160, "cut to 160 characters")
end)

-- ------------------------------------------------------------ move_instances --

H.test("a move reparents and reports the new path", function()
	local root = scene("Moves")
	local from = Instance.new("Folder", root); from.Name = "From"
	local to = Instance.new("Folder", root); to.Name = "To"
	local p = Instance.new("Part", from); p.Name = "Traveller"
	local r = Ops.execute("m1", { op = "move_instances", moves = {
		{ path = "game.Workspace.Moves.From.Traveller", newParent = "game.Workspace.Moves.To" },
	} })
	H.eq(r.ok, true, "ok: " .. tostring(r.error))
	H.eq(from:FindFirstChild("Traveller"), nil, "gone from the old parent")
	H.ok(to:FindFirstChild("Traveller"), "arrived at the new one")
	H.ok(string.find(r.data.moved[1], "To.Traveller", 1, true), "reports the NEW path: " .. r.data.moved[1])
end)

H.test("a move to a path that does not exist fails without moving anything", function()
	-- Paths.resolve raises, so the op is cancelled and its recording rolled back rather
	-- than leaving half a reorganisation behind.
	local root = scene("MoveBad")
	local from = Instance.new("Folder", root); from.Name = "From"
	local p = Instance.new("Part", from); p.Name = "Stays"
	local r = Ops.execute("m2", { op = "move_instances", moves = {
		{ path = "game.Workspace.MoveBad.From.Stays", newParent = "game.Workspace.MoveBad.Nowhere" },
	} })
	H.eq(r.ok, false, "failed")
	H.ok(from:FindFirstChild("Stays"), "and it did not move")
end)

H.test("a move is a mutation, so it takes an undo recording", function()
	local history = game:GetService("ChangeHistoryService")
	history.__refuseNext = true
	local r = Ops.execute("m3", { op = "move_instances", moves = {} })
	H.eq(r.ok, false, "refused without a recording")
	H.ok(string.find(tostring(r.error), "could not open an undo recording", 1, true), tostring(r.error))
end)

-- ------------------------------------------------------------------ get_logs --

H.test("logs are returned newest-window-first with their level named", function()
	-- The model reads these to diagnose a failed playtest, so the LEVEL has to survive
	-- as a word rather than an enum it cannot compare against.
	local log = game:GetService("LogService")
	log.__history = {
		{ message = "one", messageType = Enum.MessageType.MessageOutput, timestamp = 1 },
		{ message = "two", messageType = Enum.MessageType.MessageWarning, timestamp = 2 },
		{ message = "three", messageType = Enum.MessageType.MessageError, timestamp = 3 },
	}
	local r = Ops.execute("l1", { op = "get_logs" })
	log.__history = {}
	H.eq(r.ok, true, "ok: " .. tostring(r.error))
	H.eq(r.data.total, 3, "total reported")
	H.eq(#r.data.entries, 3, "all three returned")
	H.eq(r.data.entries[2].level, "warn", "warning named")
	H.eq(r.data.entries[3].level, "error", "error named")
end)

H.test("maxEntries takes the END of the history, which is the recent part", function()
	-- Taking the first N would hand the model the oldest lines in the buffer — the ones
	-- least likely to explain what just failed.
	local log = game:GetService("LogService")
	log.__history = {}
	for i = 1, 10 do
		table.insert(log.__history, { message = "line " .. i, messageType = Enum.MessageType.MessageOutput, timestamp = i })
	end
	local r = Ops.execute("l2", { op = "get_logs", maxEntries = 3 })
	log.__history = {}
	H.eq(#r.data.entries, 3, "three returned")
	H.eq(r.data.entries[1].message, "line 8", "starting at the eighth")
	H.eq(r.data.entries[3].message, "line 10", "ending at the last")
	H.eq(r.data.total, 10, "and total still reports the whole buffer")
end)

H.test("a very long log line is truncated", function()
	local log = game:GetService("LogService")
	log.__history = { { message = string.rep("z", 900), messageType = Enum.MessageType.MessageOutput, timestamp = 1 } }
	local r = Ops.execute("l3", { op = "get_logs" })
	log.__history = {}
	H.eq(#r.data.entries[1].message, 400, "cut to 400 characters")
end)

H.test("an unknown message type falls back to output rather than to nil", function()
	local log = game:GetService("LogService")
	log.__history = { { message = "odd", messageType = Enum.MessageType.SomethingNew, timestamp = 1 } }
	local r = Ops.execute("l4", { op = "get_logs" })
	log.__history = {}
	H.eq(r.data.entries[1].level, "output", "defaulted")
end)

H.report("plugin/handlers")
