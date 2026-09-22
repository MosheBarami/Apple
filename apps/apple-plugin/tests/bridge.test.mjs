import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SOURCE = readFileSync(new URL('../src/Bridge.luau', import.meta.url), 'utf8');

// This is a transport harness, not a second implementation of Roblox.  JSONEncode/JSONDecode
// retain the object associated with a JSON marker so the assertions can inspect the exact request
// body while the production module still has to use HttpService's ordinary JSON APIs.
const PRELUDE = String.raw`
local function signal()
    local s = { listeners = {} }
    function s:Connect(fn)
        local link = { active = true }
        function link:Disconnect() self.active = false end
        table.insert(self.listeners, { fn = fn, link = link })
        return link
    end
    function s:Fire(...)
        for _, entry in self.listeners do
            if entry.link.active then entry.fn(...) end
        end
    end
    return s
end

local requests = {}
local responses = {}
local encodedBodies = {}
local decodedBodies = {}
local nextBody = 0
local nextResponse = 0
local httpAwaiting = false

local HttpService = {}
function HttpService:JSONEncode(value)
    nextBody += 1
    local marker = "body:" .. tostring(nextBody)
    encodedBodies[marker] = value
    return marker
end
function HttpService:JSONDecode(raw)
    local value = decodedBodies[raw]
    if value == nil then error("invalid JSON fixture") end
    return value
end
function HttpService:RequestAsync(request)
    local fixture = table.remove(responses, 1)
    assert(fixture ~= nil, "HTTP response queue is empty")
    table.insert(requests, {
        url = request.Url,
        method = request.Method,
        headers = request.Headers,
        body = encodedBodies[request.Body],
    })
    if fixture.await then
        fixture.await = false
        httpAwaiting = true
        coroutine.yield("http")
        httpAwaiting = false
    end
    if fixture.throw then error(fixture.throw) end
    return { Success = fixture.success, StatusCode = fixture.status, Body = fixture.body }
end

local function queueResponse(value, status, options)
    nextResponse += 1
    local marker = "response:" .. tostring(nextResponse)
    if not (options and options.invalid) then decodedBodies[marker] = value end
    table.insert(responses, {
        success = if options and options.success ~= nil then options.success else true,
        status = status or 200,
        body = if options and options.invalid then "not-json" else marker,
        await = options and options.await or false,
    })
end
local function queueFailure(message)
    table.insert(responses, { success = false, status = 0, body = "", throw = message or "offline" })
end

local jobs = {}
local task = {}
function task.spawn(fn)
    local co = coroutine.create(fn)
    table.insert(jobs, co)
    return co
end
function task.wait(seconds)
    coroutine.yield("wait", seconds)
end
local function tick()
    local co = table.remove(jobs, 1)
    if co == nil then return false end
    local ok, err = coroutine.resume(co)
    if not ok then error(err) end
    if coroutine.status(co) ~= "dead" then table.insert(jobs, co) end
    return true
end

local game = {}
function game:GetService(name)
    if name == "HttpService" then return HttpService end
    error("unexpected service " .. tostring(name))
end
local plugin = { Unloading = signal() }

local Bridge = (function()
`;

// The header must carry the version this source declares, whatever that is. Pinning the literal
// here made every honest version bump read as a transport failure.
const DECLARED_VERSION = SOURCE.match(/local PLUGIN_VERSION = "([^"]+)"/)?.[1];

const ASSERTIONS = String.raw`
end)()

local function state()
    return {
        kind = "state", placeName = "Bridge Fixture", placeId = 77, gameId = 88,
        isRunMode = false, selectionCount = 0, pluginVersion = "1.0.0",
    }
end

local function makeBridge()
    local statuses = {}
    local activities = {}
    local executed = {}
    local calls = 0
    local capabilityCalls = 0
    local stateValue = state()
    local capabilityValue = {
        schema = "golem.studio-ops.v1",
        operations = {{ op = "run_code", status = "unsupported", reason = "fixture refusal text" }},
    }
    local executeResult = nil
    local bridge
    local config = {
        plugin = plugin,
        capabilities = function()
            capabilityCalls += 1
            return capabilityValue
        end,
        execute = function(id, op, stillCurrent)
            table.insert(executed, { id = id, op = op, stillCurrent = stillCurrent })
            -- Overridable so a block can test what the TRANSPORT does with an unusual result
            -- without rebuilding the whole fixture beside it. Default unchanged.
            if executeResult ~= nil then
                local copy = {}
                for key, value in executeResult do copy[key] = value end
                copy.id = id
                return copy
            end
            return { id = id, ok = true, data = { ran = op.op } }
        end,
        state = function()
            calls += 1
            return stateValue
        end,
        onStatus = function(value) table.insert(statuses, value) end,
        onActivity = function(value) table.insert(activities, value) end,
    }
    bridge = Bridge.new(config)
    return bridge, statuses, activities, executed,
        function(value) stateValue = value end,
        function() return calls end,
        function() return capabilityCalls end,
        function(value) capabilityValue = value end,
        function(value) executeResult = value end
end

local function pending(id, op)
    return { id = id, seq = 1, studioOp = { op = op or "ping" } }
end

-- Explicit pairing, exact live wire shape, and one state observation per poll.
do
    local bridge, statuses, _, _, _, stateCalls, capabilityCalls = makeBridge()
    assert(not bridge:isConnected(), "a new bridge must not auto-resume a session")
    queueResponse({ token = "project.secret", projectId = "project-id", projectName = "Demo Project" })
    local ok, message = bridge:connect(" ab-c123 ")
    assert(ok and message == "Connected · Demo Project")
    assert(capabilityCalls() == 1, "capabilities are sampled once for this pairing")
    assert(#requests == 1 and requests[1].url == "https://apple.moshe-barami111.workers.dev/api/studio/claim")
    assert(requests[1].method == "POST")
    assert(requests[1].headers["Content-Type"] == "application/json")
    assert(requests[1].headers["X-Golem-Token"] == "")
    assert(requests[1].headers["X-Golem-Plugin-Version"] == "${DECLARED_VERSION}")
    assert(requests[1].headers["X-Golem-Plugin-Protocol"] == "1")
    assert(requests[1].body.code == "ABC123")
    assert(requests[1].body.place.placeId == 77 and requests[1].body.place.gameId == 88)
    assert(stateCalls() == 1, "claim observes the place once")

    assert(bridge:pushEvent({ kind = "log", message = "hello", level = "info", clock = 1 }))
    assert(bridge:pushEvent({ kind = "selection", items = {{ path = "game.Workspace.Old", class = "Part" }}, count = 1, clock = 2 }))
    assert(bridge:pushEvent({ kind = "selection", items = {{ path = "game.Workspace.New", class = "Part" }}, count = 1, clock = 3 }))
    assert(not bridge:pushEvent({ kind = "log", message = "bad", level = "fatal", clock = 4 }))
    queueResponse({ ops = {}, waitMs = 20 })
    assert(tick(), "the poll coroutine must run")
    assert(stateCalls() == 2, "state is sent on every poll, including an idle poll")
    assert(requests[2].url == "https://apple.moshe-barami111.workers.dev/api/studio/poll")
    assert(requests[2].headers["X-Golem-Token"] == "project.secret")
    assert(requests[2].body.state.kind == "state")
    assert(requests[2].body.capabilities.schema == "golem.studio-ops.v1")
    assert(requests[2].body.capabilities.operations[1].reason == "fixture refusal text")
    assert(#requests[2].body.events == 2, "one log and the latest selection should be sent")
    assert(requests[2].body.events[2].items[1].path == "game.Workspace.New")
    assert(requests[2].body.events[2].truncated == false)
    queueResponse({ ops = {}, waitMs = 20 })
    assert(tick(), "the poll should continue after the first wait")
    assert(requests[3].body.events == nil, "acknowledged events must leave the queue")
    assert(requests[3].body.capabilities == nil, "one valid poll response acknowledges capabilities")
    assert(capabilityCalls() == 1, "polls reuse the pairing snapshot instead of re-sampling capabilities")
    for _, text in statuses do assert(not string.find(text, "project.secret", 1, true)) end
    bridge:disconnect()
    assert(not bridge:isConnected())
    assert(tick(), "retired poll generation should finish cooperatively")

    queueResponse({ token = "project.second", projectId = "project-id", projectName = "Demo Project" })
    assert(bridge:connect("SECOND"))
    assert(capabilityCalls() == 2, "a reconnect samples a fresh per-pairing report")
    queueResponse({ ops = {}, waitMs = 20 })
    assert(tick())
    assert(requests[#requests].body.capabilities.schema == "golem.studio-ops.v1", "a new pairing reports capabilities again")
    bridge:disconnect()
    assert(tick())
end

-- Events survive a failed request. A selection that arrives while an older value is in flight is
-- retained for the next poll rather than being erased by acknowledgement of the old request.
do
    local bridge = makeBridge()
    queueResponse({ token = "events.secret", projectId = "events-project", projectName = "Events" })
    assert(bridge:connect("EVENT1"))
    assert(bridge:pushEvent({ kind = "log", message = "kept", level = "warn", clock = 10 }))
    assert(bridge:pushEvent({ kind = "selection", items = {{ path = "game.Workspace.Before", class = "Part" }}, count = 1, clock = 11 }))
    queueFailure("offline")
    assert(tick())
    assert(#requests[#requests].body.events == 2)
    assert(requests[#requests].body.capabilities ~= nil, "failed poll must retain capability report")

    assert(bridge:pushEvent({ kind = "selection", items = {{ path = "game.Workspace.AfterFailure", class = "Part" }}, count = 1, clock = 12 }))
    queueResponse({ ops = {}, waitMs = 1 }, 200, { await = true })
    assert(tick() and httpAwaiting)
    local inFlight = requests[#requests].body.events
    assert(requests[#requests].body.capabilities ~= nil, "retry still carries capabilities until a valid reply")
    assert(inFlight[2].items[1].path == "game.Workspace.AfterFailure")
    assert(bridge:pushEvent({ kind = "selection", items = {{ path = "game.Workspace.DuringRequest", class = "Part" }}, count = 1, clock = 13 }))
    assert(tick())

    queueResponse({ ops = {}, waitMs = 1 })
    assert(tick())
    local afterAck = requests[#requests].body.events
    assert(#afterAck == 1 and afterAck[1].kind == "selection")
    assert(requests[#requests].body.capabilities == nil, "successful retry acknowledges capabilities")
    assert(afterAck[1].items[1].path == "game.Workspace.DuringRequest")
    bridge:disconnect()
    assert(tick())
end

-- A failed delivery keeps its result, and a redelivered id is answered from the replay cache.
do
    local bridge, statuses, _, executed = makeBridge()
    queueResponse({ token = "retry.secret", projectId = "retry-project", projectName = "Retry" })
    assert(bridge:connect("RETRY1"))
    queueResponse({ ops = { pending("op-1", "create_instances") }, waitMs = 1 })
    assert(tick())
    assert(#executed == 1)
    assert(type(executed[1].stillCurrent) == "function" and executed[1].stillCurrent(), "execute receives the live session fence")

    queueFailure("temporary network failure")
    assert(tick(), "poll after the operation should retry")
    local failedDelivery = requests[#requests]
    assert(failedDelivery.body.results[1].id == "op-1", "the failed poll still carried the result")

    queueResponse({ ops = { pending("op-1", "create_instances") }, waitMs = 1 })
    assert(tick())
    assert(#executed == 1, "replaying an op id must not mutate Studio twice")
    assert(requests[#requests].body.results[1].id == "op-1")
    queueResponse({ ops = {}, waitMs = 1 })
    assert(tick())
    assert(#statuses > 0 and bridge:isConnected())
    bridge:disconnect()
    assert(not executed[1].stillCurrent(), "a stored operation fence retires with its connection")
    assert(tick(), "retired retry generation should finish cooperatively")
end

-- A long session is not a leak. 2026-09-22: the replay memory kept every op id and ended the session
-- at 256, disconnecting a customer mid-run after four ordinary builds. 300 acknowledged ops must not.
do
    local bridge, statuses, _, executed = makeBridge()
    queueResponse({ token = "long.secret", projectId = "long-project", projectName = "Long" })
    assert(bridge:connect("LONG01"))
    for n = 1, 30 do
        local batch = {}
        for k = 1, 10 do table.insert(batch, pending(("long-%d-%d"):format(n, k), "get_tree")) end
        queueResponse({ ops = batch, waitMs = 1 })
        assert(tick())
        assert(bridge:isConnected(), ("the session ended after %d operations"):format(#executed))
    end
    assert(#executed == 300, "every operation ran exactly once")
    -- The recent window still dedupes: the last op, delivered again, is answered from memory.
    queueResponse({ ops = { pending("long-30-10", "get_tree") }, waitMs = 1 })
    assert(tick())
    assert(#executed == 300, "a redelivered recent op id must not run twice")
    assert(bridge:isConnected())
    for _, s in statuses do assert(not string.find(s, "too many operations", 1, true), s) end
    bridge:disconnect()
    assert(tick())
end

-- Terminal server decisions retire the generation before looking at ops.
for _, terminal in {
    { body = { detach = true, ops = { pending("detach-op") } }, needle = "ended" },
    { body = { client = { compatible = false, message = "update this plugin" }, ops = { pending("old-op") } }, needle = "update" },
    { body = { placeMismatch = { message = "wrong place" }, ops = { pending("place-op") } }, needle = "wrong place" },
} do
    local bridge, statuses, _, executed = makeBridge()
    queueResponse({ token = "terminal.secret", projectId = "terminal-project", projectName = "Terminal" })
    assert(bridge:connect("TERM1"))
    queueResponse(terminal.body)
    assert(tick())
    assert(#executed == 0, "terminal response must never execute its attached ops")
    assert(not bridge:isConnected())
    assert(string.find(statuses[#statuses], terminal.needle, 1, true) ~= nil)
end

-- 401 is terminal, its body is decoded for a useful bounded message, and no op runs.
do
    local bridge, statuses, _, executed = makeBridge()
    queueResponse({ token = "unauth.secret", projectId = "unauth-project", projectName = "Auth" })
    assert(bridge:connect("AUTH01"))
    queueResponse({ error = "token expired", message = "Pair again from Apple" }, 401, { success = false })
    assert(tick())
    assert(#executed == 0 and not bridge:isConnected())
    assert(statuses[#statuses] == "Pair again from Apple")
    assert(not string.find(statuses[#statuses], "unauth.secret", 1, true))
end

-- Retiring a generation while RequestAsync is suspended must prevent the late response from
-- executing anything.  A second check after the first op prevents a callback-triggered retire
-- from entering the next mutation in the same batch.
do
    local bridge, _, _, executed = makeBridge()
    queueResponse({ token = "generation.secret", projectId = "generation-project", projectName = "Generation" })
    assert(bridge:connect("GEN001"))
    queueResponse({ ops = { pending("late-op") }, waitMs = 1 }, 200, { await = true })
    assert(tick() and httpAwaiting, "poll must be suspended in the network await")
    bridge:disconnect()
    assert(tick() and #executed == 0)

    local statuses = {}
    local executedAgain = {}
    local second
    second = Bridge.new({
        plugin = plugin,
        execute = function(id, op, stillCurrent)
            assert(type(stillCurrent) == "function" and stillCurrent())
            table.insert(executedAgain, id)
            if id == "first-op" then second:disconnect() end
            return { id = id, ok = true }
        end,
        state = state,
        onStatus = function(value) table.insert(statuses, value) end,
        onActivity = function() end,
    })
    queueResponse({ token = "between.secret", projectId = "between-project", projectName = "Between" })
    assert(second:connect("BET001"))
    queueResponse({ ops = { pending("first-op"), pending("second-op") }, waitMs = 1 })
    assert(tick())
    assert(#executedAgain == 1, "generation must be checked between operations")
    assert(not second:isConnected())
end

-- Invalid batches are refused as a whole, so no prefix can mutate Studio under an unsafe bound.
do
    local bridge, statuses, _, executed = makeBridge()
    queueResponse({ token = "overflow.secret", projectId = "overflow-project", projectName = "Overflow" })
    assert(bridge:connect("OVER01"))
    local tooMany = {}
    for i = 1, 11 do table.insert(tooMany, pending("overflow-" .. tostring(i))) end
    queueResponse({ ops = tooMany, waitMs = 1 })
    assert(tick())
    assert(#executed == 0 and not bridge:isConnected())
    assert(string.find(statuses[#statuses], "too many", 1, true) ~= nil)
end

-- A missing state observation fails closed before claim, and before a later poll can receive ops.
do
    local bridge, statuses, _, executed, setState = makeBridge()
    setState(nil)
    local beforeRequests = #requests
    local ok = bridge:connect("NOSTATE")
    assert(not ok and not bridge:isConnected())
    assert(#requests == beforeRequests, "a missing state must prevent the claim request")
    assert(string.find(statuses[#statuses], "state", 1, true) ~= nil)

    local live, liveStatuses, _, liveExecuted, liveSetState = makeBridge()
    queueResponse({ token = "state.secret", projectId = "state-project", projectName = "State" })
    assert(live:connect("STATE1"))
    liveSetState(nil)
    queueResponse({ ops = { pending("unsafe-op") } })
    assert(tick())
    assert(#liveExecuted == 0 and not live:isConnected())
    assert(string.find(liveStatuses[#liveStatuses], "state", 1, true) ~= nil)
end

-- A REFUSAL'S REMEDY MUST CROSS THE WIRE — AND AN ARBITRARY FIELD MUST STILL NOT.
--
-- 'remedy' was added to Commands.luau and to the worker on the same evening, each with its own
-- passing tests, and it arrived nowhere: the allowlist in shapeResult dropped it, because dropping
-- the unknown is exactly that loop's job. The bug it was written to fix then reproduced verbatim,
-- in the live product, minutes after the fix "shipped" — and an independent reviewer hit it too.
-- A field that exists at both ends is not a field until something asserts on the BODY IN BETWEEN.
--
-- The negative half is the load-bearing half. If this only checked that remedy survives, widening
-- the copy to a blind key-for-key copy would pass it while re-opening the hole the allowlist exists
-- to close.
do
    -- The response queue is shared with every block above and the one before this leaves an
    -- unconsumed fixture behind. Start from a known state or this block measures that instead.
    while #responses > 0 do table.remove(responses, 1) end
    local bridge, statuses, _, executed, _, _, _, _, setExecuteResult = makeBridge()
    setExecuteResult({
        ok = false,
        error = "writes require explicit edit consent",
        failure = "refused",
        remedy = "edit_consent",
        secretToken = "must-not-cross",
    })
    queueResponse({ token = "remedy.secret", projectId = "remedy-project", projectName = "Remedy" })
    assert(bridge:connect("REMED1"))
    queueResponse({ ops = { pending("remedy-op", "create_instances") }, waitMs = 1 })
    assert(tick())
    assert(#executed == 1, "the refused op never reached execute — this assertion would be vacuous")

    -- READ THE BODY OF A FAILED DELIVERY, not of a successful one. The fixture records the body
    -- BY REFERENCE, and the bridge removes each result from that same table once the poll succeeds,
    -- so a successful poll leaves behind a recorded body whose results array has been emptied in
    -- place. Several runs of this block were spent measuring that artifact rather than the product.
    -- queueFailure keeps the results pending, which is the same trick the redelivery block above
    -- uses and the reason it could assert on a body at all.
    queueFailure("temporary network failure")
    assert(tick(), "the poll that reports the result did not run")
    local body = requests[#requests].body
    assert(type(body) == "table" and type(body.results) == "table", "the failed poll carried no results array")
    local sent = nil
    for _, entry in body.results do
        if entry.id == "remedy-op" then sent = entry end
    end
    assert(sent ~= nil, "the result was executed and never reported")
    assert(sent.failure == "refused", "the failure kind did not cross the wire")
    assert(sent.remedy == "edit_consent", "the remedy did not cross the wire; the model is left to invent one")
    assert(sent.secretToken == nil, "the allowlist let an arbitrary field through")
end

print("bridge protocol assertions passed")
`;

function runLuau() {
  const directory = mkdtempSync(join(tmpdir(), 'apple-bridge-'));
  const file = join(directory, 'bridge.luau');
  writeFileSync(file, PRELUDE + SOURCE + ASSERTIONS);
  return execFileSync('luau', [file], { encoding: 'utf8' });
}

test('Apple Bridge transport executes its protocol and safety contract under Luau', () => {
  const output = runLuau();
  assert.match(output, /bridge protocol assertions passed/);
});

test('Bridge source is independent, memory-only, and fixed to the Apple HTTPS origin', () => {
  assert.ok(SOURCE.length > 1000);
  assert.match(SOURCE, /https:\/\/apple\.moshe-barami111\.workers\.dev/);
  assert.match(SOURCE, /X-Golem-Token/);
  assert.match(SOURCE, /X-Golem-Plugin-Version/);
  assert.ok(DECLARED_VERSION, 'Bridge.luau no longer declares PLUGIN_VERSION as a quoted literal');
  assert.match(SOURCE, /X-Golem-Plugin-Protocol/);
  assert.doesNotMatch(SOURCE, /GetSetting|SetSetting|golem_session|LoadAsset|loadstring|HttpGet/);
  assert.doesNotMatch(SOURCE, /apiBase|baseUrl/i);
});
