--!nocheck
--[[
	A Luau test harness for the game's own modules.

	WHY THIS EXISTS. The independent engineering review's L8: "Zero automated tests
	exercise the game's Luau. 1,412 tests cover the surrounding TypeScript.
	`Profile.sanitize` is pure, total, and security-critical — it is trivially
	testable and untested." That gap is behind most of the other findings: four
	criticals were found by a human reading code, in modules nothing could execute.

	HOW A ROBLOX MODULE RUNS OUTSIDE ROBLOX. The modules under test open with
	`game:GetService("ReplicatedStorage")` and `require(ReplicatedStorage...)`,
	neither of which exists in the standalone runtime. Rather than refactor game
	code to suit a test — which would be testing a different program — the harness
	CONCATENATES a prelude ahead of the module source and evaluates the pair:

	    prelude (defines `game`, shadows `require`)  ..  "local M = (function()"
	    ..  the module source, verbatim  ..  "end)()"

	`local require` in the prelude shadows the global for everything after it in the
	same chunk, so the module's own require resolves against the stub with no edit
	to the module. The source is used byte-for-byte; what is tested is what ships.

	The concatenation is done by `tests/run.mjs`, because the standalone Luau CLI is
	sandboxed and exposes no `io` — Node reads the files and hands `luau` one complete
	chunk. This file is then only the assertions and the report.
]]

local harness = {}

-- ------------------------------------------------------------------ assertions
local passed, failed = 0, 0
local failures: { string } = {}

function harness.test(name: string, fn: () -> ())
	local ok, err = pcall(fn)
	if ok then
		passed += 1
	else
		failed += 1
		table.insert(failures, string.format("  %s\n      %s", name, tostring(err)))
	end
end

function harness.eq(actual: any, expected: any, what: string?)
	if actual ~= expected then
		error(string.format("%s: expected %s, got %s", what or "value", tostring(expected), tostring(actual)), 2)
	end
end

function harness.ok(cond: any, what: string?)
	if not cond then
		error(what or "expected a truthy value", 2)
	end
end

--[[ Print the tally, and raise if anything failed.
	Raising is how a failure leaves the process: the standalone CLI has no `os.exit`, so a
	non-zero exit code can only come from an uncaught error. The message is printed above
	first, so the raise adds a stacktrace, not the only record of what went wrong.
]]
function harness.report(suite: string)
	if failed == 0 then
		print(string.format("%s: %d passed", suite, passed))
		return
	end
	print(string.format("%s: %d passed, %d FAILED", suite, passed, failed))
	for _, f in failures do
		print(f)
	end
	error(string.format("%s: %d assertion(s) failed", suite, failed), 0)
end

return harness
