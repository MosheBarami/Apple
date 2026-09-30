/**
 * THE PLAYER-SIDE CHECK (F-046), EXECUTED.
 *
 * `run_mode` is a server-only simulation with no player, and on 2026-09-23 that is how a customer was
 * told a HUD "is verified" while, in a real Test session, its LocalScript errored and PlayerGui held
 * no ScreenGui. These specs run the REAL PlayCheck.luau and the REAL Commands.luau against the shared
 * Studio mock, whose StudioTestService:ExecutePlayModeAsync fake starts a simulated solo session on a
 * copy of the place and runs the harness the plugin inserted, the way Studio would.
 *
 * What is asserted is what the product promises: the two gates come first, the harness is present
 * during the session and GONE afterwards on every path, and the report says what the player had on
 * screen and which client errors happened — including when that is "no ScreenGui at all".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PRELUDE, opFamiliesChunk } from './studio-mock.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const COMMANDS = readFileSync(join(HERE, '..', 'src', 'Commands.luau'), 'utf8');
const PLAY_CHECK = readFileSync(join(HERE, '..', 'src', 'PlayCheck.luau'), 'utf8');

const SPEC = String.raw`
local MARKER = "__ApplePlayCheckHarnessV1"
local function harnessInPlace()
    local n = 0
    for _, container in { services.ServerScriptService, services.ReplicatedFirst, services.StarterPlayer, workspace } do
        for _, node in container:GetDescendants() do if node:GetAttribute(MARKER) ~= nil then n += 1 end end
    end
    return n
end
local function fresh() runService.edit = true; runService.running = false; runService.runMode = false; studioTest.running = false; studioTest.onSession = nil end
local function newCommands(extra)
    local opts = extra or {}
    opts.game = game
    if opts.opFamilies == nil then opts.opFamilies = OP_FAMILIES_UNDER_TEST end
    if opts.playCheck == nil then opts.playCheck = PlayCheck end
    if opts.playCheck == false then opts.playCheck = nil end
    return Commands.new(opts)
end
local function byOp(report, wanted) for _, item in report.operations do if item.op == wanted then return item end end end
local function find(list, name) for _, item in list or {} do if item.name == name then return item end end end

spec("the capability report names play_check, and says why when this Studio cannot run it", function()
    fresh()
    local c = newCommands()
    eq(byOp(Commands.capabilities(c), "play_check").status, "supported")
    c:destroy()
    local missing = newCommands({ playCheck = false })  -- require(script.Parent.PlayCheck) cannot load here
    local entry = byOp(Commands.capabilities(missing), "play_check")
    eq(entry.status, "unsupported"); has(entry.reason, "not bundled")
    missing:destroy()
    local method = studioTest.ExecutePlayModeAsync
    studioTest.ExecutePlayModeAsync = nil
    local old = newCommands()
    studioTest.ExecutePlayModeAsync = method
    local oldEntry = byOp(Commands.capabilities(old), "play_check")
    eq(oldEntry.status, "unsupported"); has(oldEntry.reason, "ExecutePlayModeAsync")
    local refused = old:execute("old", { op = "play_check" }, true)
    eq(refused.ok, false); eq(refused.failure, "refused")
    old:destroy()
end)

spec("play_check asks edit mode first, then consent, and starts nothing when either is shut", function()
    fresh()
    studioTest.onSession = simulatePlaySession({})
    local c = newCommands()
    local sessions = studioTest.sessions
    local denied = c:execute("no-consent", { op = "play_check" }, false)
    eq(denied.ok, false); eq(denied.remedy, "edit_consent")
    runService.edit = false
    local testing = c:execute("testing", { op = "play_check" }, true)
    eq(testing.ok, false); eq(testing.remedy, "leave_test_mode", "edit mode is asked about before consent")
    runService.edit = true
    runService.running = true  -- Apple's own Run() simulation: IsEdit stays true, but it is not edit mode
    local running = c:execute("running", { op = "play_check" }, true)
    eq(running.ok, false); eq(running.remedy, "leave_test_mode")
    runService.running = false
    eq(studioTest.sessions, sessions, "no Test session may start behind a shut gate")
    eq(harnessInPlace(), 0, "a refused check inserts nothing")
    c:destroy()
end)

spec("F-046 reproduced: a LocalScript named like a GUI and a client error are reported as the player saw them", function()
    fresh()
    local shopGui = Instance.new("LocalScript"); shopGui.Name = "ShopGui"; shopGui.Parent = services.StarterGui
    local beforeHistory = #history.log
    studioTest.onSession = simulatePlaySession({
        onClient = function(world)
            world.clientError("ResetOnSpawn is not a valid member of LocalScript Players.Player1.PlayerGui.ShopGui", nil)
            world.clientWarning("Infinite yield possible on 'PlayerGui:WaitForChild(\"CoinGui\")'")
        end,
    })
    local c = newCommands()
    local r = c:execute("f046", { op = "play_check", seconds = 3 }, true)
    eq(r.ok, true, tostring(r.error))
    local d = r.data
    eq(d.completed, true, "stage " .. tostring(d.stage)); eq(d.playerJoined, true); eq(d.characterSpawned, true)
    eq(d.clientReported, true, "the client half must answer"); eq(d.playerGuiFound, true)
    eq(#d.screenGuis, 0, "there is NO ScreenGui in PlayerGui, and the report must say so")
    local other = find(d.otherPlayerGuiChildren, "ShopGui")
    eq(other ~= nil, true, "the LocalScript that is not a GUI is named"); eq(other.class, "LocalScript")
    eq(#d.clientErrors >= 1, true, "the client error must be reported"); has(d.clientErrors[1].message, "ResetOnSpawn is not a valid member")
    eq(#d.clientWarnings, 1); has(d.clientWarnings[1].message, "Infinite yield")
    eq(#d.serverErrors, 0, "no server error happened, and none is invented")
    eq(studioTest.lastWorld.harnessInEditDuringSession, 2, "both halves were in the place for the session")
    eq(d.harnessRemoved, true); eq(harnessInPlace(), 0, "the harness must never be left in the customer's place")
    eq(#history.log, beforeHistory, "a play check leaves nothing on the undo stack")
    shopGui:Destroy(); c:destroy()
end)

spec("a working counter is read, and walking onto a coin shows what the coin did", function()
    fresh()
    local gui = Instance.new("ScreenGui"); gui.Name = "CoinGui"; gui.Enabled = true; gui.Parent = services.StarterGui
    local frame = Instance.new("Frame"); frame.Name = "Bar"; frame.Parent = gui
    local label = Instance.new("TextLabel"); label.Name = "CoinLabel"; label.Text = "Coins: 0"; label.Parent = frame
    local hiddenFrame = Instance.new("Frame"); hiddenFrame.Name = "Shop"; hiddenFrame.Visible = false; hiddenFrame.Parent = gui
    local hidden = Instance.new("TextButton"); hidden.Name = "Buy"; hidden.Text = "Buy"; hidden.Parent = hiddenFrame
    local coin = Instance.new("Part"); coin.Name = "Coin1"; coin.Position = v3(10, 3, 0); coin.Size = v3(2, 2, 2); coin.Parent = workspace
    studioTest.onSession = simulatePlaySession({
        onServer = function(world)
            world.serverError("ServerScriptService.CoinScript:3: attempt to index nil with 'Parent'", nil)
            local stats = Instance.new("Folder"); stats.Name = "leaderstats"; stats.Parent = world.player
            local coins = Instance.new("IntValue"); coins.Name = "Coins"; coins.Value = 0; coins.Parent = stats
            local copy = world.workspace:FindFirstChild("Coin1")
            copy.Touched:Connect(function() coins.Value += 1; copy.Transparency = 1 end)
        end,
    })
    local c = newCommands()
    local r = c:execute("coins", { op = "play_check", seconds = 4, touch = { "game.Workspace.Coin1" } }, true)
    eq(r.ok, true, tostring(r.error))
    local d = r.data
    eq(d.completed, true, "stage " .. tostring(d.stage)); eq(d.waitedSeconds, 4)
    eq(d.leaderstatsBefore[1].name, "Coins"); eq(d.leaderstatsBefore[1].value, 0)
    eq(#d.touches, 1); eq(d.touches[1].path, "game.Workspace.Coin1"); eq(d.touches[1].found, true); eq(d.touches[1].moved, true)
    eq(d.touches[1].leaderstatsAfter[1].value, 1, "the coin paid out"); eq(d.touches[1].transparency, 1)
    eq(d.characterAt ~= nil, true, "the report says where the character stood")
    eq(d.characterAt.finish[1], 10); eq(d.characterAt.finish[2], 3); eq(d.characterAt.finish[3], 0)  -- after walking onto the coin
    local shown = find(d.screenGuis, "CoinGui")
    eq(shown ~= nil, true); eq(shown.enabled, true)
    local coinLabel = find(shown.labels, "CoinLabel"); eq(coinLabel.visible, true); eq(coinLabel.text, "Coins: 0")
    eq(find(shown.labels, "Buy").visible, false, "text inside a hidden frame is not what the player sees")
    eq(#d.serverErrors, 1, "a server error that fired before the harness connected is still read from history")
    has(d.serverErrors[1].message, "attempt to index nil")
    eq(coin.Transparency, 0, "the session ran on a COPY: the edit place is untouched")
    eq(harnessInPlace(), 0)
    gui:Destroy(); coin:Destroy(); c:destroy()
end)

spec("a session stopped by hand reports that nothing was observed, and still removes the harness", function()
    fresh()
    studioTest.onSession = simulatePlaySession({ stopAt = 2 })
    local c = newCommands()
    local r = c:execute("stopped", { op = "play_check" }, true)
    eq(r.ok, false); eq(r.failure, "internal")
    has(r.error, "ended without the check's report"); has(r.error, "nothing about the player was observed"); has(r.error, "were removed")
    eq(harnessInPlace(), 0); c:destroy()
end)

spec("no player within the bound is a finished check that says so, not a pass", function()
    fresh()
    studioTest.onSession = simulatePlaySession({ noPlayer = true })
    local c = newCommands()
    local r = c:execute("alone", { op = "play_check" }, true)
    eq(r.ok, true, tostring(r.error)); eq(r.data.completed, false); eq(r.data.stage, "no_player"); eq(r.data.playerJoined, false)
    eq(harnessInPlace(), 0); c:destroy()
end)

spec("Studio refusing the session (a test already running) is reported, and the harness still leaves", function()
    fresh()
    studioTest.onSession = simulatePlaySession({})
    studioTest.running = true
    local c = newCommands()
    local r = c:execute("busy", { op = "play_check" }, true)
    studioTest.running = false
    eq(r.ok, false); eq(r.failure, "internal"); has(r.error, "Studio refused StudioTestService:ExecutePlayModeAsync"); has(r.error, "already running")
    eq(harnessInPlace(), 0); c:destroy()
end)

spec("arguments are bounded and every touch target is resolved before anything is inserted", function()
    fresh()
    studioTest.onSession = simulatePlaySession({})
    local sessions = studioTest.sessions
    local c = newCommands()
    local stash = Instance.new("Part"); stash.Name = "Stash"; stash.Parent = services.ServerStorage
    eq(c:execute("long", { op = "play_check", seconds = 99 }, true).failure, "invalid")
    eq(c:execute("short", { op = "play_check", seconds = 1 }, true).failure, "invalid")
    eq(c:execute("outside", { op = "play_check", touch = { "game.ServerStorage.Stash" } }, true).failure, "invalid")
    eq(c:execute("missing", { op = "play_check", touch = { "game.Workspace.NoSuchCoin" } }, true).failure, "not_found")
    eq(c:execute("many", { op = "play_check", touch = { "game.Workspace", "game.Workspace", "game.Workspace", "game.Workspace", "game.Workspace", "game.Workspace" } }, true).failure, "invalid")
    eq(c:execute("camera", { op = "play_check", touch = { "game.Workspace.Camera" } }, true).failure, "invalid")
    eq(studioTest.sessions, sessions, "an invalid request starts no session"); eq(harnessInPlace(), 0)
    stash:Destroy(); c:destroy()
end)

spec("a leftover harness does nothing in someone else's session and is swept before the next check", function()
    fresh()
    local leftover = Instance.new("Script"); leftover.Name = PlayCheck.SERVER_NAME; leftover.Source = PlayCheck.SERVER_SOURCE
    leftover:SetAttribute(MARKER, "stale-nonce"); leftover.Parent = services.ServerScriptService
    local leftoverClient = Instance.new("LocalScript"); leftoverClient.Name = PlayCheck.CLIENT_NAME; leftoverClient.Source = PlayCheck.CLIENT_SOURCE
    leftoverClient:SetAttribute(MARKER, "stale-nonce"); leftoverClient.Parent = services.ReplicatedFirst
    -- The person presses Play themselves: no args, so the leftover must not act or end their test.
    studioTest.onSession = simulatePlaySession({ stopAt = 30 })
    local theirs = studioTest:ExecutePlayModeAsync(nil)
    eq(theirs, nil, "a leftover harness must never end a session it did not start")
    eq(studioTest.lastWorld.serverGame:GetService("ReplicatedStorage"):FindFirstChild("ApplePlayCheckChannel"), nil, "it must not even open its channel")
    -- A later args table from another run is not this harness's either.
    studioTest.onSession = simulatePlaySession({ stopAt = 30 })
    eq(studioTest:ExecutePlayModeAsync({ applePlayCheck = 1, nonce = "someone-else", seconds = 3 }), nil)
    studioTest.onSession = simulatePlaySession({})
    local c = newCommands()
    local r = c:execute("after-leftover", { op = "play_check", seconds = 3 }, true)
    eq(r.ok, true, tostring(r.error)); eq(r.data.completed, true)
    eq(studioTest.lastWorld.harnessInEditDuringSession, 2, "the stale copies were swept first, so exactly one harness ran")
    eq(harnessInPlace(), 0); c:destroy()
end)

spec("the place removes the harness (an anti-cheat): the plugin's watchdog still ends the Test session, and the report says it was cut short", function()
    fresh()
    local watchdogs = 0
    studioTest.onSession = simulatePlaySession({
        onServer = function(world)
            local copy = world.serverGame:GetService("ServerScriptService"):FindFirstChild(PlayCheck.SERVER_NAME)
            if copy then copy:Destroy() end
        end,
        serverPlugin = function(dm, scheduler) if PlayCheck.watchdog(dm, scheduler) then watchdogs += 1 end end,
        stopAt = 300,
    })
    local c = newCommands()
    local r = c:execute("lost-harness", { op = "play_check", seconds = 3 }, true)
    eq(watchdogs, 1, "the watchdog is set in the server DataModel of an Apple check")
    eq(studioTest.running, false, "the session ended, so Studio is back in edit mode")
    eq(studioTest.lastWorld.now <= PlayCheck.WATCHDOG_SECONDS, true, "ended by the watchdog, not left to run")
    eq(r.ok, true, tostring(r.error)); eq(r.data.completed, false); eq(r.data.stage, "watchdog")
    eq(harnessInPlace(), 0); c:destroy()
end)

spec("the watchdog stays out of a Test session the person started, and out of the client", function()
    fresh()
    local set = nil
    studioTest.onSession = simulatePlaySession({ stopAt = 30, serverPlugin = function(dm, scheduler) set = PlayCheck.watchdog(dm, scheduler) end })
    eq(studioTest:ExecutePlayModeAsync(nil), nil); eq(set, false, "no Apple args: the person's own Play is never ended")
    local clientGame = { GetService = function() return { GetTestArgs = function() error("GetTestArgs failed from a client LocalScript") end } end }
    eq(PlayCheck.watchdog(clientGame, { delay = function() error("nothing may be scheduled") end }), false, "where the args cannot be read nothing is set")
end)

spec("the harness is fixed plugin text: nothing from the wire reaches its source", function()
    fresh()
    local seen = {}
    studioTest.onSession = function(args)
        for _, container in { services.ServerScriptService, services.ReplicatedFirst } do
            for _, node in container:GetDescendants() do
                if node:GetAttribute(MARKER) ~= nil then table.insert(seen, node.Source) end
            end
        end
        return nil
    end
    local c = newCommands()
    c:execute("wire", { op = "play_check", seconds = 3, code = "error('x')", source = "error('y')" }, true)
    eq(#seen, 2)
    for _, source in seen do eq(source == PlayCheck.SERVER_SOURCE or source == PlayCheck.CLIENT_SOURCE, true, "harness source must be the shipped text") end
    eq(harnessInPlace(), 0); c:destroy()
end)

spec("the money counters are read just after the character spawned and again after the wait and the touches, for a game that keeps its money outside leaderstats", function()
    fresh()
    local gui = Instance.new("ScreenGui"); gui.Name = "Hud"; gui.Enabled = true; gui.Parent = services.StarterGui
    local bottom = Instance.new("Frame"); bottom.Name = "Bottom"; bottom.Parent = gui
    local money = Instance.new("TextLabel"); money.Name = "Money"; money.Text = "$0"; money.Parent = bottom
    local level = Instance.new("TextLabel"); level.Name = "Level"; level.Text = "Level 1"; level.Parent = bottom
    local blank = Instance.new("TextLabel"); blank.Name = "Coins"; blank.Text = "Coins"; blank.Parent = bottom
    local shop = Instance.new("Frame"); shop.Name = "Shop"; shop.Visible = false; shop.Parent = gui
    local price = Instance.new("TextLabel"); price.Name = "CashPrice"; price.Text = "$500"; price.Parent = shop
    local coin = Instance.new("Part"); coin.Name = "Coin1"; coin.Position = v3(10, 3, 0); coin.Size = v3(2, 2, 2); coin.Parent = workspace
    studioTest.onSession = simulatePlaySession({
        onServer = function(world)
            world.workspace:FindFirstChild("Coin1").Touched:Connect(function()
                for _, node in world.playerGui:GetDescendants() do if node.Name == "Money" then node.Text = "$25" end end
            end)
        end,
    })
    local c = newCommands()
    local r = c:execute("hud", { op = "play_check", seconds = 4, touch = { "game.Workspace.Coin1" } }, true)
    eq(r.ok, true, tostring(r.error))
    local hud = r.data.hud
    eq(hud ~= nil, true, "the report carries the counters")
    eq(#hud.first, 1, "the level has digits but is no counter, a text with no digit is no counter, and the price sits in a hidden window")
    eq(hud.first[1].name, "Hud.Bottom.Money"); eq(hud.first[1].text, "$0", "the first look is before the coin")
    eq(hud.afterWait[1].text, "$25", "after the touch the counter moved: the coin paid")
    eq(hud.afterPresses, nil, "nothing was pressed, so nothing was read after presses")
    eq(r.data.leaderstatsBefore, nil, "and this game has no leaderstats at all")
    local seen = {}
    for _, w in hud.widgets do seen[w.gui .. "." .. w.name] = w.visible end
    eq(seen["Hud.Bottom"], true, "the piece the game shows"); eq(seen["Hud.Shop"], false, "the window the game hides is hidden, whatever it was authored as")
    gui:Destroy(); coin:Destroy(); c:destroy()
    eq(harnessInPlace(), 0)
end)

report()
`;

function available() {
  try { execFileSync('luau', ['--help'], { stdio: 'pipe' }); return true; } catch { return false; }
}

export function runPlayCheckSuite({ playCheck = PLAY_CHECK, commands = COMMANDS } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'apple-play-check-'));
  const file = join(dir, 'play-check.gen.luau');
  writeFileSync(file, `${PRELUDE}\n${opFamiliesChunk()}local PlayCheck = (function()\n${playCheck}\nend)()\nlocal Commands = (function()\n${commands}\nend)()\n${SPEC}`);
  try { return { status: 0, output: execFileSync('luau', [file], { encoding: 'utf8', stdio: 'pipe' }) }; }
  catch (error) { return { status: error.status ?? 1, output: String(error.stdout ?? '') + String(error.stderr ?? '') }; }
}

const skip = available() ? false : 'luau is not on PATH';

test('play_check passes the executable Studio-mock suite', { skip }, () => {
  const result = runPlayCheckSuite();
  assert.match(result.output, /^commands: (\d+) passed$/m, 'suite did not report a clean run:\n' + result.output);
  assert.ok(Number(/^commands: (\d+) passed$/m.exec(result.output)[1]) >= 10, 'too few specs ran:\n' + result.output);
  assert.equal(result.status, 0, result.output);
});

/**
 * RED-FIRST, KEPT. Each break removes one mechanism the product promise stands on; the executable
 * suite must go red for every one. Every anchor is asserted to occur exactly once before it is
 * replaced, so a break that misses cannot report green as if it had been tested.
 */
const BREAKS = [
  {
    why: 'the harness is removed after the session',
    file: 'playCheck',
    anchor: '\tlocal remaining = removeAll()\n',
    with: '\tlocal remaining = 0\n',
  },
  {
    why: 'the plugin ends an Apple check the place stopped (watchdog)',
    file: 'playCheck',
    anchor: '\t\tpcall(function() studioTest:EndTest({ nonce = args.nonce, harness = 1, stage = "watchdog" }) end)\n',
    with: '\n',
  },
  {
    why: 'the watchdog never touches a session without Apple args',
    file: 'playCheck',
    anchor: 'if not okArgs or type(args) ~= "table" or args.applePlayCheck ~= 1 or type(args.nonce) ~= "string" then return false end\n\tlocal delay',
    with: 'if not okArgs then return false end\n\tlocal delay',
  },
  {
    why: 'the harness acts only on its own nonce',
    file: 'playCheck',
    anchor: 'if script:GetAttribute(MARKER) ~= args.nonce then return end\n',
    with: '\n',
  },
  {
    why: 'the client half reports what is in PlayerGui',
    file: 'playCheck',
    anchor: '\tchannel:FireServer({ nonce = marker, playerGui = playerGui ~= nil, screenGuis = guis,',
    with: '\tchannel:FireServer({ nonce = marker, playerGui = playerGui ~= nil, screenGuis = {},',
  },
  {
    why: 'client errors are collected',
    file: 'playCheck',
    anchor: '\tlocal errors, warnings = collectLogs(LogService, tonumber(request.since) or 0, scriptErrors)\n',
    with: '\tlocal errors, warnings = {}, {}\n',
  },
  {
    why: 'the money counters are read after the wait and the touches',
    file: 'playCheck',
    anchor: '\tlocal afterWait = readCounters()\n',
    with: '\tlocal afterWait = nil\n',
  },
  {
    why: 'the money counters are read just after the character spawned',
    file: 'playCheck',
    anchor: '\tif ok then firstCounters = list end\n',
    with: '\t_ = ok\n',
  },
  {
    why: 'the character position is read after the touches',
    file: 'playCheck',
    anchor: 'report.at.finish = where()\n',
    with: '\n',
  },
  {
    why: 'a piece of the screen is on only if it shows',
    file: 'playCheck',
    anchor: 'visible = on and shown(node, gui) })',
    with: 'visible = on })',
  },
  {
    why: 'a counter must be visible to be a counter',
    file: 'playCheck',
    anchor: 'string.find(text, "%d") and shown(node, gui) and counterName(node, gui)',
    with: 'string.find(text, "%d") and counterName(node, gui)',
  },
  {
    why: 'play_check takes the edit-mode and consent gates',
    file: 'commands',
    anchor: '\tcamera_focus = true,\n\tplay_check = true,\n',
    with: '\tcamera_focus = true,\n',
  },
];

test('each play_check mechanism is load-bearing (red-first falsification)', { skip }, () => {
  for (const b of BREAKS) {
    const source = b.file === 'playCheck' ? PLAY_CHECK : COMMANDS;
    assert.equal(source.split(b.anchor).length - 1, 1, `falsification anchor for "${b.why}" must occur exactly once`);
    const broken = source.replace(b.anchor, b.with);
    const result = runPlayCheckSuite(b.file === 'playCheck' ? { playCheck: broken } : { commands: broken });
    assert.notEqual(result.status, 0, `breaking "${b.why}" left the suite green:\n${result.output}`);
  }
});
