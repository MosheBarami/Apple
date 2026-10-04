/**
 * preload_content, EXECUTED: the Content op family (src/ops/Content.luau) run as the REAL module inside
 * the REAL command engine against the shared Studio mock.
 *
 * What is asserted is what the family promises: it asks ContentProvider:PreloadAsync about asset ids and
 * reports Success / Failure / TimedOut for each; sounds and animations are asked as a transient Sound or
 * Animation that is never parented and is destroyed after; the wait is bounded by timeoutMs; nothing
 * needs edit consent and nothing is written to the place; bad input is refused before Studio is asked.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PRELUDE, opFamilySources } from './studio-mock.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const COMMANDS = readFileSync(join(HERE, '..', 'src', 'Commands.luau'), 'utf8');

// The engine surface the family uses and the prelude omits: a virtual clock behind os.clock and task.wait
// (so a 20 s timeout costs no real time), task.spawn, and a ContentProvider whose PreloadAsync replays a
// script: `statusFor` answers per id, `loading` reports Loading before the answer, `alias` reports an id in the
// old asset-url spelling, `hangAfter` reports that many ids then never returns, `boom` throws.
const ENGINE = String.raw`
local now = 0
os = setmetatable({ clock = function() return now end }, { __index = os })
local waits = 0
task = {
    wait = function(dt) waits += 1; if waits > 5000 then error("runaway wait") end; now += dt; return dt end,
    spawn = function(fn, ...) local co = coroutine.create(fn); local ok, err = coroutine.resume(co, ...); if not ok then error(err) end; return co end,
}
local provider = { calls = 0, statusFor = {}, hangAfter = nil, boom = nil, skip = {}, loading = {}, alias = {} }
function provider:PreloadAsync(list, callback)
    self.calls += 1
    self.list = list
    if self.boom then error(self.boom) end
    local reported = 0
    for _, entry in list do
        if self.hangAfter ~= nil and reported >= self.hangAfter then coroutine.yield() end
        local id = if type(entry) == "string" then entry else (entry.SoundId or entry.AnimationId)
        if self.loading[id] then callback(id, { Name = "Loading" }) end
        if not self.skip[id] then callback(self.alias[id] or id, { Name = self.statusFor[id] or "Success" }); reported += 1 end
    end
end
`;

const SPEC = String.raw`
local c = Commands.new({ game = game, services = { ContentProvider = provider }, opFamilies = OP_FAMILIES_UNDER_TEST })
local function byOp(report, wanted) for _, item in report.operations do if item.op == wanted then return item end end end
local function fresh() provider.calls, provider.list, provider.statusFor, provider.hangAfter, provider.boom, provider.skip, provider.loading, provider.alias = 0, nil, {}, nil, nil, {}, {}, {}; now = 0; waits = 0 end
local function run(op, allow) op.op = "preload_content"; return c:execute("pc", op, allow == true) end

spec("the content family installs and preload_content is reported supported", function()
    eq(#c.opFamilyErrors, 0, "family errors: " .. table.concat(c.opFamilyErrors, " | "))
    eq(byOp(Commands.capabilities(c), "preload_content").status, "supported")
end)

spec("each id gets the status Studio reported, with no edit consent and nothing added to the place", function()
    fresh()
    provider.statusFor["rbxassetid://2"] = "Failure"
    provider.statusFor["rbxassetid://4"] = "TimedOut"
    local before = #game:GetDescendants()
    local r = run({ items = {
        { id = "rbxassetid://1", type = "image" }, { id = "rbxassetid://2", type = "mesh" },
        { id = "rbxassetid://3", type = "sound" }, { id = "rbxassetid://4", type = "animation" }, { id = "rbxassetid://5" },
    } }, false)
    eq(r.ok, true, tostring(r.error))
    local res = r.data.results
    eq(res["rbxassetid://1"], "Success"); eq(res["rbxassetid://2"], "Failure"); eq(res["rbxassetid://3"], "Success")
    eq(res["rbxassetid://4"], "TimedOut"); eq(res["rbxassetid://5"], "Success")
    eq(type(r.data.elapsedMs), "number")
    eq(#game:GetDescendants(), before, "a preload must not add anything to the place")
    eq(waits, 0, "everything reported at once, so nothing is waited for")
end)

spec("sounds and animations are asked as transient instances, images and meshes as plain strings, all destroyed after", function()
    fresh()
    local r = run({ items = {
        { id = "rbxassetid://10", type = "sound" }, { id = "rbxassetid://11", type = "animation" },
        { id = "rbxassetid://12", type = "texture" }, { id = "rbxassetid://13", type = "mesh" }, { id = "rbxassetid://14", type = "image" },
    } })
    eq(r.ok, true, tostring(r.error))
    local list = provider.list
    eq(#list, 5)
    eq(list[1].ClassName, "Sound"); eq(list[1].SoundId, "rbxassetid://10"); eq(list[1].__destroyed, true); eq(list[1].Parent, nil, "never parented")
    eq(list[2].ClassName, "Animation"); eq(list[2].AnimationId, "rbxassetid://11"); eq(list[2].__destroyed, true); eq(list[2].Parent, nil)
    for i = 3, 5 do eq(type(list[i]), "string", "plain content string") end
end)

spec("the old asset url is read as the same id, and a repeated id is asked once", function()
    fresh()
    local r = run({ items = { { id = "http://www.roblox.com/asset/?id=77" }, { id = "rbxassetid://77" }, { id = "HTTPS://www.roblox.com/asset/?id=78", type = "image" } } })
    eq(r.ok, true, tostring(r.error))
    eq(#provider.list, 2); eq(r.data.results["rbxassetid://77"], "Success"); eq(r.data.results["rbxassetid://78"], "Success")
end)

spec("Loading is not an answer, and a report spelled as the old asset url still lands on its id", function()
    fresh()
    provider.loading["rbxassetid://1"] = true
    provider.alias["rbxassetid://2"] = "HTTP://www.roblox.com/asset/?id=2"; provider.statusFor["rbxassetid://2"] = "Failure"
    local r = run({ items = { { id = "rbxassetid://1" }, { id = "rbxassetid://2", type = "sound" } } })
    eq(r.ok, true, tostring(r.error))
    eq(r.data.results["rbxassetid://1"], "Success"); eq(r.data.results["rbxassetid://2"], "Failure")
end)

spec("an id Studio never reports is TimedOut once timeoutMs has passed", function()
    fresh()
    provider.hangAfter = 2
    local r = run({ items = { { id = "rbxassetid://1" }, { id = "rbxassetid://2" }, { id = "rbxassetid://3", type = "sound" } }, timeoutMs = 300 })
    eq(r.ok, true, tostring(r.error))
    eq(r.data.results["rbxassetid://1"], "Success"); eq(r.data.results["rbxassetid://2"], "Success"); eq(r.data.results["rbxassetid://3"], "TimedOut")
    eq(r.data.elapsedMs >= 300 and r.data.elapsedMs < 400, true, "elapsedMs " .. tostring(r.data.elapsedMs))
    eq(provider.list[3].__destroyed, true, "the sound is destroyed even when the wait ended without it")
end)

spec("the default wait is 20 seconds", function()
    fresh()
    provider.hangAfter = 0
    local r = run({ items = { { id = "rbxassetid://1" } } })
    eq(r.ok, true, tostring(r.error)); eq(r.data.results["rbxassetid://1"], "TimedOut")
    eq(r.data.elapsedMs >= 20000 and r.data.elapsedMs < 20100, true, "elapsedMs " .. tostring(r.data.elapsedMs))
end)

spec("Studio returning without reporting an id also leaves it TimedOut, immediately", function()
    fresh()
    provider.skip["rbxassetid://2"] = true
    local r = run({ items = { { id = "rbxassetid://1" }, { id = "rbxassetid://2" } }, timeoutMs = 60000 })
    eq(r.ok, true, tostring(r.error)); eq(r.data.results["rbxassetid://2"], "TimedOut"); eq(r.data.elapsedMs, 0)
end)

spec("a PreloadAsync error is a failure, not a table of timeouts, and the instances are still destroyed", function()
    fresh()
    provider.boom = "ContentProvider says no"
    local r = run({ items = { { id = "rbxassetid://1", type = "sound" } } })
    eq(r.ok, false); has(r.error, "ContentProvider says no")
    eq(provider.list[1].__destroyed, true)
end)

spec("bad input is refused before Studio is asked", function()
    fresh()
    local many = {}; for i = 1, 401 do many[i] = { id = "rbxassetid://" .. i } end
    local cases = {
        { {}, "items" }, { { items = "rbxassetid://1" }, "items" }, { { items = {} }, "1 to 400" }, { { items = many }, "1 to 400" },
        { { items = { { id = "rbxassetid://1" }, extra = true } }, "plain array" },
        { { items = { "rbxassetid://1" } }, "items[1].id" },
        { { items = { { id = "rbxassetid://1" }, { id = "rbxassetid://x" } } }, "items[2].id" },
        { { items = { { id = "http://example.com/a.png" } } }, "items[1].id" },
        { { items = { { id = "12345" } } }, "items[1].id" },
        { { items = { { id = "rbxassetid://12345678901234567890" } } }, "items[1].id" },
        { { items = { { id = 5 } } }, "items[1].id" },
        { { items = { { id = "rbxassetid://1", type = "video" } } }, "items[1].type" },
        { { items = { { id = "rbxassetid://1" } }, timeoutMs = 0 }, "timeoutMs" },
        { { items = { { id = "rbxassetid://1" } }, timeoutMs = 60001 }, "timeoutMs" },
        { { items = { { id = "rbxassetid://1" } }, timeoutMs = 1.5 }, "timeoutMs" },
        { { items = { { id = "rbxassetid://1" } }, timeoutMs = "5" }, "timeoutMs" },
    }
    for i, case in cases do
        local r = run(case[1])
        eq(r.ok, false, "case " .. i .. " must be refused"); has(r.error, case[2])
    end
    eq(provider.calls, 0, "Studio was asked about invalid input")
    local edge = {}; for i = 1, 400 do edge[i] = { id = "rbxassetid://" .. i } end
    local top = run({ items = edge, timeoutMs = 60000 })
    eq(top.ok, true, tostring(top.error)); eq(provider.calls, 1)
end)

spec("without a ContentProvider the op says so", function()
    local bare = Commands.new({ game = game, services = {}, opFamilies = OP_FAMILIES_UNDER_TEST })
    local r = bare:execute("pc", { op = "preload_content", items = { { id = "rbxassetid://1" } } }, false)
    eq(r.ok, false); has(r.error, "ContentProvider")
end)

report()
`;

const available = (() => { try { execFileSync('luau', ['--help'], { stdio: 'pipe' }); return true; } catch { return false; } })();

function runSuite({ families = {} } = {}) {
  const sources = { ...opFamilySources(), ...families };
  const bodies = Object.values(sources).map((src) => `(function()\n${src}\nend)()`);
  const chunk = `local OP_FAMILIES_UNDER_TEST = {\n${bodies.join(',\n')}\n}\n`;
  const dir = mkdtempSync(join(tmpdir(), 'studpilot-content-'));
  const file = join(dir, 'content.gen.luau');
  writeFileSync(file, `${PRELUDE}\n${ENGINE}\n${chunk}local Commands = (function()\n${COMMANDS}\nend)()\n${SPEC}`);
  try { return { status: 0, output: execFileSync('luau', [file], { encoding: 'utf8', stdio: 'pipe' }) }; }
  catch (error) { return { status: error.status ?? 1, output: String(error.stdout ?? '') + String(error.stderr ?? '') }; }
}

const skip = available ? false : 'luau is not on PATH';

test('the Content op family passes the executable Studio-mock suite', { skip }, () => {
  const result = runSuite();
  assert.match(result.output, /^commands: 11 passed$/m, 'suite did not report a clean run:\n' + result.output);
  assert.equal(result.status, 0, result.output);
});

const BREAKS = [
  { why: 'sounds are asked as a Sound instance', anchor: 'local wrap = WRAP[kinds[id]]', with: 'local wrap = nil' },
  { why: 'the transient instances are destroyed', anchor: 'for _, inst in made do api.destroyInstance(inst) end', with: '' },
  { why: 'an invalid id is refused', anchor: 'if id == nil then return nil, "invalid"', with: 'if false then return nil, "invalid"' },
  { why: 'the id limit is enforced', anchor: 'if count < 1 or count > Content.MAX_ITEMS then', with: 'if count < 1 then' },
  { why: 'an unreported id is TimedOut', anchor: 'out[id] = results[id] or "TimedOut"', with: 'out[id] = results[id] or "Success"' },
  { why: 'a PreloadAsync error is reported', anchor: 'if failure ~= nil and reported < #order then', with: 'if false then' },
  { why: 'a Loading report is not final', anchor: 'and ok and FINAL[name] then', with: 'and ok then' },
  { why: 'a report is matched by its normalized id', anchor: 'local id = normalize(contentId)', with: 'local id = contentId' },
  { why: 'the wait stops at the deadline', anchor: ' and clock() < deadline do', with: ' do' },
];

test('each Content safety mechanism is load-bearing (red-first falsification)', { skip }, () => {
  const source = opFamilySources()['Content.luau'];
  for (const b of BREAKS) {
    assert.equal(source.split(b.anchor).length - 1, 1, `falsification anchor for "${b.why}" must occur exactly once`);
    const result = runSuite({ families: { 'Content.luau': source.replace(b.anchor, b.with) } });
    assert.notEqual(result.status, 0, `breaking "${b.why}" left the suite green:\n${result.output}`);
  }
});
