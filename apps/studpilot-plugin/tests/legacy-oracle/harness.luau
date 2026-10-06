--!nocheck
--[[
	Assertions for the plugin's own Luau specs.

	WHY THIS EXISTS. `apps/plugin` had no `package.json`, so `pnpm -r test` — the
	canonical verification command, and the one CI runs — did not reach it at all.
	Ops.luau and Render.luau are load-bearing (Ops.execute is the single entry point
	for every mutation the agent performs, and it owns the asset-policy window that
	decides which asset ids may enter a user's place) and were covered by nothing.

	This is deliberately the SAME shape as the Crystal Canyon harness rather than a
	new vocabulary: one prelude concatenated ahead of module source, evaluated as a
	single chunk by the standalone Luau CLI, with Node doing the file reading. See
	`tests/run.mjs` for why. The module source is used byte-for-byte; what is tested
	is what ships.
]]

local harness = {}

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

--- Assert that `fn` raises, and that the message contains `needle`.
--- Asserting on the MESSAGE matters here: a refusal an agent cannot read is
--- indistinguishable from a crash, and several of these refusals name the tool to
--- use instead. A test that only checked "it threw" would pass on the wrong throw.
function harness.raises(fn: () -> (), needle: string, what: string?)
	local ok, err = pcall(fn)
	if ok then
		error(string.format("%s: expected an error containing %q, but it returned", what or "call", needle), 2)
	end
	if not string.find(tostring(err), needle, 1, true) then
		error(string.format("%s: expected an error containing %q, got %s", what or "call", needle, tostring(err)), 2)
	end
end

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
