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

local warns = {}
local function warn(message) table.insert(warns, message) end
-- A result carrying poison = true stands for one Studio cannot encode or send (too large).
local function poisoned(value)
    if type(value) ~= "table" then return false end
    if value.poison == true then return true end
    for _, child in value do if poisoned(child) then return true end end
    return false
end

local HttpService = {}
function HttpService:JSONEncode(value)
    if poisoned(value) then error("result too large to encode") end
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
-- Every call, counted BEFORE the queue is consulted: a request made with no response queued raises
-- inside the bridge's pcall and would otherwise leave no trace in \`requests\`.
local httpCalls = 0
function HttpService:RequestAsync(request)
    httpCalls += 1
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
-- A request that never gets an answer (RequestAsync raises) is retried ONCE on the fallback origin.
-- So "only studpilot.app is unreachable" is one raised request, and "offline" is two: the primary and
-- the fallback both fail. queueFailure is the second, which is what the older blocks below mean.
local function queuePrimaryFailure(message)
    table.insert(responses, { success = false, status = 0, body = "", throw = message or "offline" })
end
local function queueFailure(message)
    queuePrimaryFailure(message)
    queuePrimaryFailure(message)
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
        schema = "studpilot.studio-ops.v1",
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

local ID = {
    installId = string.rep("a", 32), secret = string.rep("b", 64),
    studioSessionId = string.rep("c", 32), robloxUserId = 42,
}

local function pending(id, op)
    return { id = id, seq = 1, studioOp = { op = op or "ping" } }
end

-- Explicit pairing, exact live wire shape, and one state observation per poll.
do
    local bridge, statuses, _, _, _, stateCalls, capabilityCalls = makeBridge()
    assert(not bridge:isConnected(), "a new bridge must not auto-resume a session")
    queueResponse({ token = "project.secret", projectId = "project-id", projectName = "Demo Project" })
    local ok, message = bridge:connect(ID)
    assert(ok and message == "Connected · Demo Project")
    assert(capabilityCalls() == 1, "capabilities are sampled once for this pairing")
    assert(#requests == 1 and requests[1].url == "https://studpilot.app/api/studio/announce")
    assert(requests[1].method == "POST")
    assert(requests[1].headers["Content-Type"] == "application/json")
    assert(requests[1].headers["X-StudPilot-Token"] == "")
    assert(requests[1].headers["X-StudPilot-Plugin-Version"] == "${DECLARED_VERSION}")
    assert(requests[1].headers["X-StudPilot-Plugin-Protocol"] == "1")
    assert(requests[1].body.installId == ID.installId and requests[1].body.secret == ID.secret)
    assert(requests[1].body.studioSessionId == ID.studioSessionId and requests[1].body.robloxUserId == 42)
    assert(requests[1].body.wait == true and requests[1].body.connectedProjectId == nil)
    assert(requests[1].body.place.placeId == 77 and requests[1].body.place.gameId == 88)
    assert(stateCalls() == 1, "claim observes the place once")

    assert(bridge:pushEvent({ kind = "log", message = "hello", level = "info", clock = 1 }))
    assert(bridge:pushEvent({ kind = "selection", items = {{ path = "game.Workspace.Old", class = "Part" }}, count = 1, clock = 2 }))
    assert(bridge:pushEvent({ kind = "selection", items = {{ path = "game.Workspace.New", class = "Part" }}, count = 1, clock = 3 }))
    assert(not bridge:pushEvent({ kind = "log", message = "bad", level = "fatal", clock = 4 }))
    queueResponse({ ops = {}, waitMs = 20 })
    assert(tick(), "the poll coroutine must run")
    assert(stateCalls() == 2, "state is sent on every poll, including an idle poll")
    assert(requests[2].url == "https://studpilot.app/api/studio/poll")
    assert(requests[2].headers["X-StudPilot-Token"] == "project.secret")
    assert(requests[2].body.state.kind == "state")
    assert(requests[2].body.capabilities.schema == "studpilot.studio-ops.v1")
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
    assert(bridge:connect(ID))
    assert(capabilityCalls() == 2, "a reconnect samples a fresh per-pairing report")
    queueResponse({ ops = {}, waitMs = 20 })
    assert(tick())
    assert(requests[#requests].body.capabilities.schema == "studpilot.studio-ops.v1", "a new pairing reports capabilities again")
    bridge:disconnect()
    assert(tick())
end

-- Events survive a failed request. A selection that arrives while an older value is in flight is
-- retained for the next poll rather than being erased by acknowledgement of the old request.
do
    local bridge = makeBridge()
    queueResponse({ token = "events.secret", projectId = "events-project", projectName = "Events" })
    assert(bridge:connect(ID))
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
    assert(bridge:connect(ID))
    queueResponse({ ops = { pending("op-1", "create_instances") }, waitMs = 1 })
    assert(tick())
    assert(#executed == 1)
    assert(type(executed[1].stillCurrent) == "function" and executed[1].stillCurrent(), "execute receives the live session fence")

    queueFailure("temporary network failure")
    assert(tick(), "poll after the operation should retry")
    assert(string.find(statuses[#statuses], "hiccup", 1, true) ~= nil, "a failed poll says it is retrying")
    local failedDelivery = requests[#requests]
    assert(failedDelivery.body.results[1].id == "op-1", "the failed poll still carried the result")

    queueResponse({ ops = { pending("op-1", "create_instances") }, waitMs = 1 })
    assert(tick())
    assert(#executed == 1, "replaying an op id must not mutate Studio twice")
    assert(requests[#requests].body.results[1].id == "op-1")
    queueResponse({ ops = {}, waitMs = 1 })
    assert(tick())
    assert(#statuses > 0 and bridge:isConnected())
    -- Round 7, 2026-09-24: one failed poll left the dock reading "Connection hiccup — retrying…" for
    -- the rest of a live build while every op still landed. A poll that succeeds again says so.
    assert(statuses[#statuses] == "Connected · Retry", "recovered, the dock must not keep a stale hiccup: " .. tostring(statuses[#statuses]))
    bridge:disconnect()
    assert(not executed[1].stillCurrent(), "a stored operation fence retires with its connection")
    assert(tick(), "retired retry generation should finish cooperatively")
end

-- Live 2026-09-29: a result Studio could not send kept the session on "Connection hiccup" forever and
-- every later op waited behind it. After three failed sends it is answered with a short failure.
do
    local bridge, statuses, _, executed, _, _, _, _, setExecuteResult = makeBridge()
    queueResponse({ token = "big.secret", projectId = "big-project", projectName = "Big" })
    assert(bridge:connect(ID))
    setExecuteResult({ ok = true, data = { poison = true } })
    queueResponse({ ops = { pending("op-big", "snapshot") }, waitMs = 1 })
    assert(tick())
    assert(#executed == 1)
    local before, warned = #requests, #warns
    for _ = 1, 3 do assert(tick()) end
    assert(#requests == before, "an unencodable body never reaches HttpService")
    assert(string.find(statuses[#statuses], "hiccup", 1, true) ~= nil)
    assert(#warns == warned + 2 and string.find(warns[warned + 1], "could not encode", 1, true) ~= nil, tostring(warns[warned + 1]))
    assert(string.find(warns[#warns], "too large to send", 1, true) ~= nil, "the owner can see what happened")
    queueResponse({ ops = { pending("op-big", "snapshot") }, waitMs = 1 })
    assert(tick())
    local sent = requests[#requests].body.results[1]
    assert(sent.id == "op-big" and sent.ok == false and string.find(sent.error, "could not send its result", 1, true), "the stuck result is answered as failed")
    assert(#executed == 1, "a redelivered id answers from the replaced replay entry")
    queueResponse({ ops = {}, waitMs = 1 })
    assert(tick())
    assert(statuses[#statuses] == "Connected · Big", tostring(statuses[#statuses]))
    bridge:disconnect()
    assert(tick())
end

-- A long session is not a leak. 2026-09-22: the replay memory kept every op id and ended the session
-- at 256, disconnecting a customer mid-run after four ordinary builds. 300 acknowledged ops must not.
do
    local bridge, statuses, _, executed = makeBridge()
    queueResponse({ token = "long.secret", projectId = "long-project", projectName = "Long" })
    assert(bridge:connect(ID))
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
    assert(bridge:connect(ID))
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
    assert(bridge:connect(ID))
    queueResponse({ error = "token expired", message = "Pair again from StudPilot" }, 401, { success = false })
    assert(tick())
    assert(#executed == 0 and not bridge:isConnected())
    assert(statuses[#statuses] == "Pair again from StudPilot")
    assert(not string.find(statuses[#statuses], "unauth.secret", 1, true))
end

-- Retiring a generation while RequestAsync is suspended must prevent the late response from
-- executing anything.  A second check after the first op prevents a callback-triggered retire
-- from entering the next mutation in the same batch.
do
    local bridge, _, _, executed = makeBridge()
    queueResponse({ token = "generation.secret", projectId = "generation-project", projectName = "Generation" })
    assert(bridge:connect(ID))
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
    assert(second:connect(ID))
    queueResponse({ ops = { pending("first-op"), pending("second-op") }, waitMs = 1 })
    assert(tick())
    assert(#executedAgain == 1, "generation must be checked between operations")
    assert(not second:isConnected())
end

-- Invalid batches are refused as a whole, so no prefix can mutate Studio under an unsafe bound.
do
    local bridge, statuses, _, executed = makeBridge()
    queueResponse({ token = "overflow.secret", projectId = "overflow-project", projectName = "Overflow" })
    assert(bridge:connect(ID))
    local tooMany = {}
    for i = 1, 11 do table.insert(tooMany, pending("overflow-" .. tostring(i))) end
    queueResponse({ ops = tooMany, waitMs = 1 })
    assert(tick())
    assert(#executed == 0 and not bridge:isConnected())
    assert(string.find(statuses[#statuses], "too many", 1, true) ~= nil)
end

-- F-059, 2026-09-24: a build that needed the Creator Store while nobody had said which asset sources
-- the project may use was refused, and Studio had no way to ask. The worker now says on the poll that
-- the answer is owed; the dock hears it, and the person's answer rides the next poll until one lands.
do
    local heard = {}
    local config = {
        plugin = plugin,
        execute = function(id) return { id = id, ok = true } end,
        state = state,
        onStatus = function() end,
        onActivity = function() end,
        onAssetSources = function(value) table.insert(heard, value) end,
    }
    local bridge = Bridge.new(config)
    assert(not bridge:answerAssetSources({ "creator_store" }), "an answer with no pairing has nowhere to go")
    queueResponse({ token = "sources.secret", projectId = "sources-project", projectName = "Sources" })
    assert(bridge:connect(ID))
    queueResponse({ ops = {}, waitMs = 1, assetSources = { owed = true } })
    assert(tick())
    assert(#heard == 1 and heard[1].owed == true, "the dock is not told the answer is owed")
    queueResponse({ ops = {}, waitMs = 1, assetSources = { owed = true } })
    assert(tick())
    assert(#heard == 1, "an unchanged question is announced again on every poll")

    assert(not bridge:answerAssetSources({}), "nothing picked is not an answer")
    assert(not bridge:answerAssetSources("creator_store"), "only a list is an answer")
    assert(bridge:answerAssetSources({ "creator_store", "from_scratch" }))
    queueFailure("offline")
    assert(tick())
    local sent = requests[#requests].body.assetSourcesAnswer
    assert(type(sent) == "table" and sent.allow[1] == "creator_store" and sent.allow[2] == "from_scratch", "the answer never left Studio")
    queueResponse({ ops = {}, waitMs = 1, assetSources = { owed = false } })
    assert(tick())
    assert(requests[#requests].body.assetSourcesAnswer ~= nil, "a failed poll dropped the answer")
    assert(#heard == 2 and heard[2].owed == false, "the dock is not told the question is settled")
    queueResponse({ ops = {}, waitMs = 1 })
    assert(tick())
    assert(requests[#requests].body.assetSourcesAnswer == nil, "an acknowledged answer is sent again")
    assert(#heard == 2, "a settled question with nothing new is announced again")

    -- A 200 response can still mean the worker failed to save the answer. Retry that answer.
    assert(bridge:answerAssetSources({ "creator_store" }))
    queueResponse({ ops = {}, waitMs = 1, assetSources = { owed = true, message = "StudPilot could not save that. Try again.", retryable = true } })
    assert(tick())
    assert(requests[#requests].body.assetSourcesAnswer ~= nil, "the save attempt never reached the worker")
    queueResponse({ ops = {}, waitMs = 1, assetSources = { owed = false } })
    assert(tick())
    assert(requests[#requests].body.assetSourcesAnswer ~= nil, "a rejected answer was not retried")
    queueResponse({ ops = {}, waitMs = 1 })
    assert(tick())
    assert(requests[#requests].body.assetSourcesAnswer == nil, "a saved answer was retried")

    -- A policy refusal needs a new choice from the person, not repeated writes every poll.
    assert(bridge:answerAssetSources({ "creator_store" }))
    queueResponse({ ops = {}, waitMs = 1, assetSources = { owed = true, message = "Change it in Settings.", retryable = false } })
    assert(tick())
    queueResponse({ ops = {}, waitMs = 1, assetSources = { owed = true } })
    assert(tick())
    assert(requests[#requests].body.assetSourcesAnswer == nil, "a rejected policy answer was retried without a new choice")

    -- A refusal to store the answer comes back as a bounded sentence, never raw text with the token.
    queueResponse({ ops = {}, waitMs = 1, assetSources = { owed = true, message = "Pick at least one source." } })
    assert(tick())
    assert(heard[6].owed == true and heard[6].message == "Pick at least one source.")
    queueResponse({ ops = {}, waitMs = 1, assetSources = { owed = true, message = "leak sources.secret" } })
    assert(tick())
    assert(heard[7].message ~= nil and not string.find(heard[7].message, "sources.secret", 1, true), "the token reached the dock")
    bridge:disconnect()
    assert(tick())
end

-- A missing state observation fails closed before claim, and before a later poll can receive ops.
do
    local bridge, statuses, _, executed, setState = makeBridge()
    setState(nil)
    local beforeRequests = #requests
    local ok = bridge:connect(ID)
    assert(not ok and not bridge:isConnected())
    assert(#requests == beforeRequests, "a missing state must prevent the claim request")
    assert(string.find(statuses[#statuses], "state", 1, true) ~= nil)

    local live, liveStatuses, _, liveExecuted, liveSetState = makeBridge()
    queueResponse({ token = "state.secret", projectId = "state-project", projectName = "State" })
    assert(live:connect(ID))
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
        error = "writes require a live StudPilot connection to this Studio",
        failure = "refused",
        remedy = "reconnect_studio",
        secretToken = "must-not-cross",
    })
    queueResponse({ token = "remedy.secret", projectId = "remedy-project", projectName = "Remedy" })
    assert(bridge:connect(ID))
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
    assert(sent.remedy == "reconnect_studio", "the remedy did not cross the wire; the model is left to invent one")
    assert(sent.secretToken == nil, "the allowlist let an arbitrary field through")
end

-- THE ONE-RELEASE FALLBACK. studpilot.app is the primary. A request that never gets an answer
-- (RequestAsync raises: offline, or Studio has not been allowed to reach the new host yet) is tried
-- once on the former host. An HTTP status, a 401, 403, 404 or 500 included, is an answer and is
-- never taken somewhere else.
do
    local PRIMARY, FALLBACK = "https://studpilot.app", "https://apple.moshe-barami111.workers.dev"
    -- Earlier blocks leave bridges polling; tick() resumes the OLDEST job, so start from none of them
    -- and from no queued response, or a tick below would run somebody else's session.
    table.clear(jobs)
    assert(#responses == 0, "an earlier block left a response queued")

    -- Claim: the primary raises, the fallback answers, and the retry is the same request.
    local bridge, statuses = makeBridge()
    local base = #requests
    queuePrimaryFailure("HttpError: ConnectFail")
    queueResponse({ token = "fallback.secret", projectId = "fb-project", projectName = "Fallback" })
    local ok, message = bridge:connect(ID)
    assert(ok and message == "Connected · Fallback", tostring(message))
    assert(#requests == base + 2, "one raised request and one retry, no more")
    assert(requests[base + 1].url == PRIMARY .. "/api/studio/announce", requests[base + 1].url)
    assert(requests[base + 2].url == FALLBACK .. "/api/studio/announce", requests[base + 2].url)
    assert(requests[base + 2].method == "POST" and requests[base + 2].body.installId == ID.installId)
    for _, field in { "Content-Type", "X-StudPilot-Token", "X-StudPilot-Plugin-Version", "X-StudPilot-Plugin-Protocol" } do
        assert(requests[base + 2].headers[field] == requests[base + 1].headers[field], field .. " differs on the retry")
    end

    -- Poll: the same, and a recovered poll does not leave the dock saying "hiccup".
    local before = #requests
    queuePrimaryFailure("HttpError: ConnectFail")
    queueResponse({ ops = {}, waitMs = 1 })
    assert(tick())
    assert(#requests == before + 2, "a poll is retried once, not forever")
    assert(requests[before + 1].url == PRIMARY .. "/api/studio/poll", requests[before + 1].url)
    assert(requests[before + 2].url == FALLBACK .. "/api/studio/poll", requests[before + 2].url)
    assert(requests[before + 2].headers["X-StudPilot-Token"] == "fallback.secret", "the session token travels to the fallback")
    assert(bridge:isConnected() and statuses[#statuses] == "Connected · Fallback", tostring(statuses[#statuses]))

    -- NOT STICKY: the next poll asks the primary first, and when the primary answers nothing else is asked.
    before = #requests
    queueResponse({ ops = {}, waitMs = 1 })
    assert(tick())
    assert(#requests == before + 1 and requests[before + 1].url == PRIMARY .. "/api/studio/poll")
    bridge:disconnect()
    assert(tick())

    -- An HTTP status from the primary is the answer. The queued second response must stay unasked.
    for _, status in { 401, 403, 404, 500 } do
        local b = makeBridge()
        before = #requests
        queueResponse({ message = "the primary answered" }, status, { success = false })
        queueResponse({ token = "must.not.be.asked", projectId = "x", projectName = "X" })
        local claimed, text = b:connect(ID)
        assert(not claimed and not b:isConnected(), "HTTP " .. status .. " paired")
        assert(#requests == before + 1 and requests[before + 1].url == PRIMARY .. "/api/studio/announce",
            "HTTP " .. status .. " from the primary went on to the fallback")
        assert(#responses == 1, "the fallback's response was consumed after HTTP " .. status)
        table.remove(responses, 1)
        if status == 403 then assert(text == "StudPilot did not recognise this Studio.", tostring(text)) end
    end
    for _, status in { 401, 403, 500 } do
        local b = makeBridge()
        queueResponse({ token = "poll.answer", projectId = "pa-project", projectName = "PollAnswer" })
        assert(b:connect(ID))
        before = #requests
        queueResponse({ message = "the primary answered" }, status, { success = false })
        queueResponse({ ops = {}, waitMs = 1 })
        assert(tick())
        assert(#requests == before + 1 and requests[before + 1].url == PRIMARY .. "/api/studio/poll",
            "HTTP " .. status .. " on a poll went on to the fallback")
        assert(#responses == 1, "the fallback's response was consumed after HTTP " .. status)
        table.remove(responses, 1)
        b:disconnect()
        for _ = 1, 3 do tick() end
    end

    -- The fallback's own answer is final too.
    local b = makeBridge()
    before = #requests
    queuePrimaryFailure("HttpError: ConnectFail")
    queueResponse({ message = "not recognised" }, 403, { success = false })
    local claimed, text = b:connect(ID)
    assert(not claimed and text == "StudPilot did not recognise this Studio.", tostring(text))
    assert(#requests == before + 2)

    -- Both hosts unreachable: two requests, then the network message, never a loop.
    before = #requests
    local callsBefore = httpCalls
    queueFailure("HttpError: ConnectFail")
    claimed, text = b:connect(ID)
    assert(not claimed and text == "Could not reach StudPilot — check Studio’s network permission.", tostring(text))
    assert(#requests == before + 2 and #responses == 0, "an unreachable network is two requests, not more")
    assert(httpCalls == callsBefore + 2, "an unreachable network made " .. tostring(httpCalls - callsBefore) .. " calls, not two")
end

-- Connect without a code: waiting, a malformed identity, the heartbeat that follows a moved Studio, and release.
do
    table.clear(jobs)
    local bridge, statuses = makeBridge()
    local before = #requests
    queueResponse({ waiting = true })
    local ok, message, state = bridge:connect(ID)
    assert(not ok and state == "waiting" and message == "Waiting for StudPilot", tostring(message))
    assert(not bridge:isConnected())
    assert(#requests == before + 1 and requests[before + 1].headers["X-StudPilot-Token"] == "", "an announce carries no session token")

    before = #requests
    local bad = bridge:connect({ installId = "short", secret = ID.secret, studioSessionId = ID.studioSessionId, robloxUserId = 1 })
    assert(not bad and #requests == before, "a malformed identity must not reach the network")

    queueResponse({ token = "p1.secret", projectId = "p1", projectName = "One" })
    assert(bridge:connect(ID))
    assert(bridge:projectName() == "One")
    before = #requests
    queueResponse({ waiting = true })
    bridge:heartbeat(ID)
    assert(#requests == before + 1 and requests[before + 1].url == "https://studpilot.app/api/studio/announce")
    assert(requests[before + 1].body.connectedProjectId == "p1" and requests[before + 1].body.wait == false)
    assert(bridge:isConnected() and bridge:projectName() == "One", "a plain heartbeat changes nothing")

    queueResponse({ token = "p2.secret", projectId = "p2", projectName = "Two" })
    bridge:heartbeat(ID)
    assert(bridge:isConnected() and bridge:projectName() == "Two", "a heartbeat carrying another project's token moves the session")
    for _, text in statuses do assert(not string.find(text, "secret", 1, true), "a status leaked a credential") end

    before = #requests
    queueResponse({ ok = true })
    bridge:release(ID)
    assert(not bridge:isConnected() and statuses[#statuses] == "Disconnected")
    assert(requests[before + 1].url == "https://studpilot.app/api/studio/release")
    assert(requests[before + 1].body.secret == ID.secret and requests[before + 1].body.installId == ID.installId)
    table.clear(jobs)
    table.clear(responses)
end

print("bridge protocol assertions passed")
`;

function runLuau() {
  const directory = mkdtempSync(join(tmpdir(), 'studpilot-bridge-'));
  const file = join(directory, 'bridge.luau');
  writeFileSync(file, PRELUDE + SOURCE + ASSERTIONS);
  return execFileSync('luau', [file], { encoding: 'utf8' });
}

test('StudPilot Bridge transport executes its protocol and safety contract under Luau', () => {
  const output = runLuau();
  assert.match(output, /bridge protocol assertions passed/);
});

test('Bridge source is independent, memory-only, and fixed to the StudPilot HTTPS origin', () => {
  assert.ok(SOURCE.length > 1000);
  // The product origin first, the former host as the ONE-RELEASE fallback, and no third host.
  assert.match(SOURCE, /local STUDPILOT_ORIGIN = "https:\/\/studpilot\.app"/);
  assert.match(SOURCE, /local FALLBACK_ORIGIN = "https:\/\/apple\.moshe-barami111\.workers\.dev"/);
  const hosts = [...new Set([...SOURCE.matchAll(/https?:\/\/[A-Za-z0-9.-]+/g)].map((m) => m[0]))].sort();
  assert.deepEqual(hosts, ['https://apple.moshe-barami111.workers.dev', 'https://studpilot.app']);
  assert.match(SOURCE, /X-StudPilot-Token/);
  assert.match(SOURCE, /X-StudPilot-Plugin-Version/);
  assert.ok(DECLARED_VERSION, 'Bridge.luau no longer declares PLUGIN_VERSION as a quoted literal');
  assert.match(SOURCE, /X-StudPilot-Plugin-Protocol/);
  // The token stays memory-only: the transport never touches plugin settings (the host keeps only the install identity).
  assert.doesNotMatch(SOURCE, /GetSetting|SetSetting|apple_session|studpilot_session|LoadAsset|loadstring|HttpGet/);
  assert.doesNotMatch(SOURCE, /studio\/claim|Enter the pairing code/, 'the transport still speaks the removed pairing-code flow');
  assert.doesNotMatch(SOURCE, /apiBase|baseUrl/i);
});
