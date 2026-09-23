/**
 * Executable Luau tests for the new Apple Studio command boundary.
 *
 * Commands.luau is embedded byte-for-byte in one standalone Luau chunk. The prelude is a small
 * Roblox-shaped mock and deliberately does not provide a source loader: if the command engine ever
 * evaluates generated source, this suite turns that mistake red.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PRELUDE } from './studio-mock.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = join(HERE, '..', 'src', 'Commands.luau');
const SOURCE = readFileSync(SOURCE_PATH, 'utf8');

// The shared Roblox-shaped mock. See tests/studio-mock.mjs for why it is not inlined here.


const SPEC = String.raw`
local function newCommands(options)
    local opts = options or {}
    opts.game = game
    return Commands.new(opts)
end
local function run(c, id, op, allow, stillCurrent) return c:execute(id, op, allow == true, stillCurrent) end
local function fakeGeneratedModel()
    local model = Instance.new("Model")
    local part = Instance.new("MeshPart"); part.Name = "GeneratedPart"; part.Size = v3(2, 3, 4); part.Anchored = true; part.Parent = model
    return model
end
local function fakeGeneration(config)
    local adapter = { calls = 0, discarded = {}, destroyed = false, config = config or {} }
    function adapter:generate(op, current)
        self.calls += 1
        if self.config.assertNoRecording then eq(history.recording, nil, "provider call must run before ChangeHistory") end
        if self.config.onGenerate then self.config.onGenerate(current, op) end
        if self.config.result then return self.config.result end
        local model = fakeGeneratedModel()
        self.lastModel = model
        return {
            ok = true, model = model, sessionScoped = true, generationId = "mock-generation",
            maxTriangles = op.maxTriangles or 6000, predefinedSchema = op.predefinedSchema or "Body1", elapsedSeconds = 1.25,
            qc = { kind = "structural", verdict = "pass", detached = true, parts = 1, trianglesMeasured = false, visualJudgementRequired = true },
        }
    end
    function adapter:discard(model) table.insert(self.discarded, model); model:Destroy(); return true end
    function adapter:destroy() self.destroyed = true end
    return adapter
end

spec("unknown operations are explicit refusals", function()
    local c = newCommands()
    local r = run(c, "unknown", { op = "not_a_studio_op" }, true)
    eq(r.ok, false, "unknown ok"); eq(r.failure, "refused", "unknown failure"); has(r.error, "unknown Studio operation")
    c:destroy()
end)

spec("ping and all read operations use data and no recording", function()
    local scriptObject = Instance.new("Script"); scriptObject.Name = "Logic"; scriptObject.Source = "local answer = 42\\nprint(answer)\\n"; scriptObject.Parent = services.ServerScriptService
    local c = newCommands()
    local ping = run(c, "ping", { op = "ping" }, false); eq(ping.ok, true); eq(ping.data.pong, true)
    local tree = run(c, "tree", { op = "get_tree", root = "game.ServerScriptService", maxDepth = 2, maxNodes = 2 }, false); eq(tree.ok, true); eq(tree.data.root.name, "ServerScriptService")
    local listed = run(c, "list", { op = "list_scripts", root = "game.ServerScriptService" }, false); eq(listed.ok, true); eq(listed.data.scripts[1].path, "game.ServerScriptService.Logic")
    local read = run(c, "read", { op = "read_script", path = "game.ServerScriptService.Logic" }, false); eq(read.ok, true); eq(read.data.source, scriptObject.Source); eq(#read.data.baseHash, 8)
    local dump = run(c, "dump", { op = "dump_scripts", root = "game.ServerScriptService" }, false); eq(dump.ok, true); eq(dump.data.scripts[1].source, scriptObject.Source)
    local search = run(c, "search", { op = "search_scripts", root = "game.ServerScriptService", query = "answer" }, false); eq(search.ok, true); eq(search.data.matches[1].line, 1)
    local badPath = run(c, "bad-path", { op = "get_tree", root = "game.Workspace..x" }, false); eq(badPath.ok, false)
    eq(history.recording, nil, "read recording")
    c:destroy()
end)

spec("the whole-place tree names the services instead of an empty game", function()
    -- WHAT THIS DEFENDS, MEASURED 2026-09-20 against the running Studio (log
    -- 0.739.0.7390687_20260919T231453Z_Studio_657fb, 52 occurrences between 12:36:06Z and
    -- 16:36:38Z, every one arriving through Bridge.pollLoop): "argument #1 expects a string, but
    -- boolean was passed", thrown by GetService inside handleTree's service sweep.
    --
    -- READ_SERVICES is a SET -- name -> true -- and every other reader indexes it by key. The
    -- sweep alone iterated it for VALUES, so serviceName was the boolean true thirteen times,
    -- GetService refused each one inside a pcall, and serviceFrom answered nil. The root-less
    -- get_tree therefore returned a well-formed game with zero children and truncated=false: the
    -- agent asked what is in the place and Studio said, in good grammar, nothing. Nothing above
    -- notices, because an empty place is a legal answer.
    --
    -- The spec above only ever asked for root = "game.ServerScriptService", which takes the
    -- other branch of handleTree and never reaches the sweep. That is why this shipped. The
    -- assertion is therefore on the ROOT-LESS call specifically, and it checks a named service
    -- carrying a real child rather than only a count, so a sweep that returns thirteen stubs
    -- cannot satisfy it either.
    local marker = Instance.new("Part"); marker.Name = "WholePlaceMarker"; marker.Parent = services.ServerScriptService
    local c = newCommands()
    local tree = run(c, "whole-place", { op = "get_tree", maxDepth = 3, maxNodes = 400 }, false)
    eq(tree.ok, true, "whole-place tree ok")
    eq(tree.data.root.name, "game", "whole-place root name")
    local byName = {}
    for _, child in tree.data.root.children do byName[child.name] = child end
    for _, serviceName in { "Workspace", "ServerScriptService", "ReplicatedStorage", "Lighting", "StarterGui" } do
        if byName[serviceName] == nil then error("whole-place tree omitted " .. serviceName, 2) end
        eq(byName[serviceName].path, "game." .. serviceName, serviceName .. " path")
    end
    eq(tree.data.root.childCount, 13, "whole-place service count")
    if tree.data.nodeCount <= 13 then error("whole-place tree returned service stubs with no contents", 2) end
    local found = false
    for _, child in byName.ServerScriptService.children do if child.name == "WholePlaceMarker" then found = true end end
    eq(found, true, "whole-place tree reaches an authored instance")
    marker:Destroy(); c:destroy()
end)

spec("ambiguous sibling names are conflicts instead of arbitrary targets", function()
    local first = Instance.new("Part"); first.Name = "Duplicate"; first.Parent = workspace
    local second = Instance.new("Part"); second.Name = "Duplicate"; second.Parent = workspace
    local c = newCommands()
    local read = run(c, "ambiguous-read", { op = "get_instance", path = "game.Workspace.Duplicate" }, false)
    eq(read.ok, false); eq(read.failure, "conflict"); has(read.error, "2 siblings")
    local write = run(c, "ambiguous-write", { op = "set_props", path = "game.Workspace.Duplicate", props = { Transparency = { t = "number", v = 0.5 } } }, true)
    eq(write.ok, false); eq(write.failure, "conflict"); eq(first.Transparency, 0); eq(second.Transparency, 0)
    first:Destroy(); second:Destroy(); c:destroy()
end)

spec("selection and logs are bounded observations", function()
    local part = Instance.new("Part"); part.Name = "Selected"; part.Parent = workspace; selection:Set({ part })
    logs.values = { { message = "hello", messageType = "MessageOutput", timestamp = 10 }, { message = "warn", messageType = "MessageWarning", timestamp = 11 } }
    local c = newCommands()
    local selected = run(c, "selection", { op = "get_selection" }, false); eq(selected.ok, true); eq(selected.data.selection[1].path, "game.Workspace.Selected")
    local result = run(c, "logs", { op = "get_logs", sinceClock = 10 }, false); eq(result.ok, true); eq(#result.data.entries, 1); eq(result.data.entries[1].message, "warn")
    c:destroy()
end)

spec("selection, camera and viewport use the companion consent boundary without undo noise", function()
    local target = workspace:FindFirstChild("Selected")
    target.CFrame = CFrame.new(4, 2, -3); target.Size = v3(2, 4, 2)
    local c = newCommands()
    local before = #history.log
    local denied = run(c, "select-denied", { op = "select", paths = { "game.Workspace.Selected" } }, false)
    eq(denied.ok, false); has(denied.error, "explicit edit consent")
    local selected = run(c, "select-live", { op = "select", paths = { "game.Workspace.Selected" } }, true)
    eq(selected.ok, true); eq(selected.data.selected, 1); eq(selection.values[1], target)
    local viewport = run(c, "viewport", { op = "viewport_info" }, false)
    eq(viewport.ok, true); eq(viewport.data.camera.fov, 70); eq(viewport.data.camera.viewportSize[1], 1280)
    local focused = run(c, "focus", { op = "camera_focus", path = "game.Workspace.Selected" }, true)
    eq(focused.ok, true); eq(focused.data.focused, "game.Workspace.Selected")
    eq(#history.log, before, "Studio-only controls must not create undo entries")
    c:destroy()
end)

spec("writes need explicit consent and edit mode", function()
    local c = newCommands()
    local denied = run(c, "denied", { op = "create_instances", items = {{ className = "Part", name = "Denied", parent = "game.Workspace" }} }, false)
    eq(denied.ok, false); has(denied.error, "explicit edit consent")
    runService.edit = false
    local modeDenied = run(c, "mode", { op = "create_instances", items = {{ className = "Part", name = "DeniedMode", parent = "game.Workspace" }} }, true)
    eq(modeDenied.ok, false); has(modeDenied.error, "Studio edit mode")
    runService.edit = true; c:destroy()
end)

-- THE STATE A CUSTOMER IS ACTUALLY IN DURING A PLAY TEST, which is both gates shut at once: the
-- entry point force-clears consent on the way into a test, so allowEdits is false AND edit mode is
-- false together. Whichever gate answers first is the sentence the user is handed, and one of them
-- names a button that refuses until the test stops. Pinned behaviourally because the ordering is
-- invisible to every assertion that only looks at one gate at a time.
spec("both gates shut at once names the one the user can act on now", function()
    local playMode = newCommands({ isEdit = function() return false end })
    local write = { op = "create_instances", items = {{ className = "Part", name = "DuringTest", parent = "game.Workspace" }} }
    local r = run(playMode, "play-mode", write, false)
    eq(r.ok, false, "a write during a Studio test must refuse")
    eq(r.failure, "refused", "play-mode failure kind")
    eq(r.remedy, "leave_test_mode", "a customer mid-test must be told to stop the test, not to press a button that refuses")
    has(r.error, "Studio edit mode")
    -- Consent is still the answer once the test is over, so the second instruction is not lost.
    local stopped = newCommands({ isEdit = function() return true end })
    local afterStop = run(stopped, "after-stop", write, false)
    eq(afterStop.remedy, "edit_consent", "in edit mode without consent the remedy is still the panel")
    playMode:destroy(); stopped:destroy()
end)

-- EVERY REMEDY THE PRODUCT HAS WRITTEN DOWN MUST BE ONE A HANDLER CAN ACTUALLY SEND. Three of them
-- could not: handlers returned three values and the dispatcher bound three, so a refusal raised
-- inside a handler reached the worker with no remedy at all and the worker printed its "this build
-- does not report what would resolve this refusal" admission over an answer the product already had.
spec("handler-level refusals carry the remedy the product wrote for them", function()
    local c = newCommands()

    -- Roblox refuses to load an asset the signed-in account does not own. The mock has no
    -- InsertService at all, which is the same shape: LoadAsset did not return a tree.
    local unowned = run(c, "unowned", { op = "insert_asset", assetId = 578157972, parent = "game.Workspace" }, true)
    eq(unowned.ok, false); eq(unowned.failure, "refused")
    eq(unowned.remedy, "take_asset_first", "an asset Roblox would not load must tell the user to take it")

    -- An asset that carries code is refused by name, and the next move is a different asset.
    services.InsertService = {
        LoadAsset = function(_, _)
            local model = Instance.new("Model"); model.Name = "WithCode"
            local part = Instance.new("Part"); part.Name = "Body"; part.Parent = model
            local code = Instance.new("Script"); code.Name = "Payload"; code.Parent = part
            return model
        end,
    }
    local scripted = run(c, "scripted", { op = "insert_asset", assetId = 1234, parent = "game.Workspace" }, true)
    services.InsertService = nil
    eq(scripted.ok, false); eq(scripted.failure, "refused")
    eq(scripted.remedy, "choose_scriptless_asset", "an asset carrying code must point at a different asset")

    -- A write aimed outside the services Apple may touch.
    local outOfScope = run(c, "scope", { op = "set_props", path = "game.Players.Someone", props = { Name = { t = "string", v = "x" } } }, true)
    eq(outOfScope.ok, false); eq(outOfScope.failure, "refused")
    eq(outOfScope.remedy, "choose_allowed_target", "a write outside the allowlist must name where Apple may write")
    local createOutOfScope = run(c, "scope-create", { op = "create_instances", items = {{ className = "Part", name = "Nope", parent = "game.Players" }} }, true)
    eq(createOutOfScope.remedy, "choose_allowed_target", "create_instances must carry the same scope remedy")

    -- The DataModel itself is the one write target the path allowlist cannot reject, because "game"
    -- resolves before any service is named. It is refused further in, by a different sentence, and
    -- it is the same question — so it answers with the same remedy instead of a silence.
    local rootProps = run(c, "scope-root", { op = "set_props", path = "game", props = { Name = { t = "string", v = "x" } } }, true)
    eq(rootProps.remedy, "choose_allowed_target", "set_props on the DataModel must name where Apple may write")
    local rootParent = run(c, "scope-root-parent", { op = "create_instances", items = {{ className = "Part", name = "Nope", parent = "game" }} }, true)
    eq(rootParent.remedy, "choose_allowed_target", "the DataModel as a parent must name where Apple may write")

    -- A refused READ keeps no remedy: the sentence names the targets Apple may WRITE to, and
    -- answering a read with it would be a true sentence about the wrong question. "select" is the
    -- case that can prove it — it resolves its paths with write=false and it forwards whatever
    -- remedy came back, so if the scope remedy stopped asking whether this is a write, this line
    -- goes red instead of a customer being told where they may write when they asked to look.
    local readOutOfScope = run(c, "scope-read", { op = "select", paths = { "game.Players.Someone" } }, true)
    eq(readOutOfScope.ok, false); eq(readOutOfScope.failure, "refused")
    eq(readOutOfScope.remedy, nil, "a refused read must not borrow the write remedy")
    c:destroy()
end)

spec("typed creation and set_props commit a recording", function()
    local c = newCommands()
    local made = run(c, "create", { op = "create_instances", items = {{ className = "Part", name = "Typed", parent = "game.Workspace", props = { Anchored = { t = "bool", v = true }, Size = { t = "Vector3", v = { 4, 2, 1 } } }, attributes = { Zone = { t = "string", v = "safe" } }, children = {{ className = "Folder", name = "Nested" }} }} }, true)
    eq(made.ok, true, "create " .. tostring(made.error)); local part = workspace:FindFirstChild("Typed"); eq(part.Anchored, true); eq(part.Size.X, 4); eq(part:GetAttribute("Zone"), "safe")
    local changed = run(c, "props", { op = "set_props", path = "game.Workspace.Typed", props = { Transparency = { t = "number", v = 0.25 } } }, true)
    eq(changed.ok, true, "props"); eq(part.Transparency, 0.25); eq(history.recording, nil, "closed recording")
    c:destroy()
end)

spec("ordinary remotes and scriptable post effects are first-class checkpoint-safe creation", function()
    local c = newCommands()
    local made = run(c, "network-and-lighting", { op = "create_instances", items = {
        { className = "RemoteEvent", name = "ShopChanged", parent = "game.ReplicatedStorage" },
        { className = "RemoteFunction", name = "BuyItem", parent = "game.ReplicatedStorage" },
        { className = "DepthOfFieldEffect", name = "ShopDepth", parent = "game.Lighting", props = {
            FocusDistance = { t = "number", v = 24 },
            InFocusRadius = { t = "number", v = 18 },
            FarIntensity = { t = "number", v = 0.25 },
        } },
    } }, true)
    eq(made.ok, true, "ordinary networking/presentation classes must be creatable: " .. tostring(made.error))
    eq(services.ReplicatedStorage:FindFirstChild("ShopChanged").ClassName, "RemoteEvent")
    eq(services.ReplicatedStorage:FindFirstChild("BuyItem").ClassName, "RemoteFunction")
    eq(services.Lighting:FindFirstChild("ShopDepth").FocusDistance, 24)
    local snap = run(c, "network-checkpoint", { op = "snapshot", root = "game", includeScripts = true, checkpointId = "cp-network" }, false)
    eq(snap.ok, true, tostring(snap.error))
    eq(snap.data.restorable, true, "ordinary remotes/effects must not poison a whole-place checkpoint")
    eq(next(snap.data.skipped), nil, "supported networking/presentation classes were skipped")
    services.ReplicatedStorage:FindFirstChild("ShopChanged"):Destroy()
    services.ReplicatedStorage:FindFirstChild("BuyItem"):Destroy()
    services.Lighting:FindFirstChild("ShopDepth"):Destroy()
    c:destroy()
end)

spec("checkpoint round-trips existing SurfaceAppearance content without granting content writes", function()
    local part = Instance.new("Part"); part.Name = "AppearanceHost"; part.Parent = workspace
    local surface = Instance.new("SurfaceAppearance"); surface.Name = "Surface"; surface.ColorMap = "rbxassetid://123456"; surface.Parent = part
    local c = newCommands()

    local refused = run(c, "content-write-refused", {
        op = "set_props",
        path = "game.Workspace.AppearanceHost.Surface",
        props = { ColorMap = { t = "string", v = "rbxassetid://999999" } },
    }, true)
    eq(refused.ok, false); has(refused.error, "external content")
    eq(surface.ColorMap, "rbxassetid://123456", "a model write must not change the existing asset reference")

    local snap = run(c, "appearance-snapshot", {
        op = "snapshot", root = "game.Workspace.AppearanceHost", includeScripts = true, checkpointId = "cp-appearance",
    }, false)
    eq(snap.ok, true, tostring(snap.error)); eq(snap.data.restorable, true)
    local savedSurface = snap.data.node.children[1]
    eq(savedSurface.className, "SurfaceAppearance")
    eq(savedSurface.props.ColorMap.v, "rbxassetid://123456", "checkpoint must retain the opaque existing content reference")

    surface.ColorMap = "rbxassetid://changed"
    local restored = run(c, "appearance-restore", {
        op = "restore", root = "game.Workspace.AppearanceHost", checkpointId = "cp-appearance", snapshot = snap.data,
    }, true, function() return true end)
    eq(restored.ok, true, tostring(restored.error))
    eq(part:FindFirstChild("Surface").ColorMap, "rbxassetid://123456")
    part:Destroy()
    c:destroy()
end)

spec("checkpoint round-trips Decal and Texture content without granting external content writes", function()
    local part = Instance.new("Part"); part.Name = "TextureHost"; part.Parent = workspace
    local decal = Instance.new("Decal"); decal.Name = "Badge"; decal.Texture = "rbxassetid://111111"; decal.Transparency = 0.15; decal.Parent = part
    local tiled = Instance.new("Texture"); tiled.Name = "Tiles"; tiled.Texture = "rbxassetid://222222"; tiled.StudsPerTileU = 3; tiled.StudsPerTileV = 4; tiled.OffsetStudsU = 0.5; tiled.OffsetStudsV = 1.25; tiled.Parent = part
    local c = newCommands()

    local refused = run(c, "texture-content-write-refused", {
        op = "set_props",
        path = "game.Workspace.TextureHost.Tiles",
        props = { Texture = { t = "string", v = "rbxassetid://999999" } },
    }, true)
    eq(refused.ok, false); has(refused.error, "external content")
    eq(tiled.Texture, "rbxassetid://222222", "ordinary writes must not change an existing texture asset reference")

    local snap = run(c, "decal-texture-snapshot", {
        op = "snapshot", root = "game.Workspace.TextureHost", includeScripts = true, checkpointId = "cp-decal-texture",
    }, false)
    eq(snap.ok, true, tostring(snap.error)); eq(snap.data.restorable, true)
    eq(next(snap.data.skipped), nil, "Decal/Texture must not poison a checkpoint")
    local savedDecal = nil
    local savedTexture = nil
    for _, child in ipairs(snap.data.node.children) do
        if child.className == "Decal" then savedDecal = child elseif child.className == "Texture" then savedTexture = child end
    end
    eq(savedDecal ~= nil, true); eq(savedDecal.props.Texture.v, "rbxassetid://111111")
    eq(savedTexture ~= nil, true); eq(savedTexture.props.Texture.v, "rbxassetid://222222")
    eq(savedTexture.props.StudsPerTileU.v, 3); eq(savedTexture.props.StudsPerTileV.v, 4)
    eq(savedTexture.props.OffsetStudsU.v, 0.5); eq(savedTexture.props.OffsetStudsV.v, 1.25)

    decal.Texture = "rbxassetid://changed-decal"; decal.Transparency = 0.8
    tiled.Texture = "rbxassetid://changed-texture"; tiled.StudsPerTileU = 9; tiled.OffsetStudsV = 7
    local restored = run(c, "decal-texture-restore", {
        op = "restore", root = "game.Workspace.TextureHost", checkpointId = "cp-decal-texture", snapshot = snap.data,
    }, true, function() return true end)
    eq(restored.ok, true, tostring(restored.error))
    local restoredDecal = part:FindFirstChild("Badge")
    local restoredTexture = part:FindFirstChild("Tiles")
    eq(restoredDecal.Texture, "rbxassetid://111111"); eq(restoredDecal.Transparency, 0.15)
    eq(restoredTexture.Texture, "rbxassetid://222222")
    eq(restoredTexture.StudsPerTileU, 3); eq(restoredTexture.StudsPerTileV, 4)
    eq(restoredTexture.OffsetStudsU, 0.5); eq(restoredTexture.OffsetStudsV, 1.25)
    part:Destroy()
    c:destroy()
end)

spec("unsupported MeshPart still makes checkpoints incomplete", function()
    local root = Instance.new("Folder"); root.Name = "UnsupportedOrdinaryCheckpoint"; root.Parent = workspace
    local mesh = Instance.new("MeshPart"); mesh.Name = "GeneratedMesh"; mesh.Parent = root
    local c = newCommands()
    local snap = run(c, "ordinary-unsupported-snapshot", {
        op = "snapshot", root = "game.Workspace.UnsupportedOrdinaryCheckpoint", includeScripts = true, checkpointId = "cp-ordinary-unsupported",
    }, false)
    eq(snap.ok, true, tostring(snap.error))
    eq(snap.data.complete, false); eq(snap.data.restorable, false); eq(snap.data.checkpointEligible, false); eq(snap.data.coverage, "incomplete")
    eq(snap.data.skipped.MeshPart, 1, "MeshPart must be named rather than silently omitted")
    root:Destroy()
    c:destroy()
end)

spec("a TouchTransmitter Roblox created does not refuse a checkpoint, and a restore may remove it (F-044)", function()
    local root = Instance.new("Folder"); root.Name = "TouchedCoins"; root.Parent = workspace
    local coin = Instance.new("Part"); coin.Name = "Coin1"; coin.Parent = root
    local touch = Instance.new("TouchTransmitter"); touch.Name = "TouchInterest"; touch.Parent = coin
    local c = newCommands()
    local snap = run(c, "touch-transmitter-snapshot", {
        op = "snapshot", root = "game.Workspace.TouchedCoins", includeScripts = true, checkpointId = "cp-touch",
    }, false)
    eq(snap.ok, true, tostring(snap.error))
    eq(snap.data.restorable, true, "an engine-made TouchTransmitter must not make the checkpoint unrestorable")
    eq(next(snap.data.skipped), nil, "a TouchTransmitter is not authored content and is not reported as skipped")
    for _, child in ipairs(snap.data.node.children[1].children or {}) do
        eq(child.className ~= "TouchTransmitter", true, "the snapshot must not claim to capture a TouchTransmitter")
    end
    coin.Transparency = 1
    local again = Instance.new("TouchTransmitter"); again.Name = "TouchInterest"; again.Parent = coin
    local restored = run(c, "touch-transmitter-restore", {
        op = "restore", root = "game.Workspace.TouchedCoins", checkpointId = "cp-touch", snapshot = snap.data,
    }, true, function() return true end)
    eq(restored.ok, true, tostring(restored.error))
    eq(root:FindFirstChild("Coin1") ~= nil, true)
    root:Destroy()
    c:destroy()
end)

spec("a ColorGradingEffect from Studio's lighting migration is checkpointed, not refused", function()
    local root = Instance.new("Folder"); root.Name = "MigratedLighting"; root.Parent = workspace
    local grading = Instance.new("ColorGradingEffect"); grading.Name = "ColorGrading"; grading.Parent = root
    local c = newCommands()
    local snap = run(c, "color-grading-snapshot", {
        op = "snapshot", root = "game.Workspace.MigratedLighting", includeScripts = true, checkpointId = "cp-grading",
    }, false)
    eq(snap.ok, true, tostring(snap.error))
    eq(snap.data.restorable, true, "a fresh place's ColorGradingEffect must not cost the customer their undo point")
    eq(next(snap.data.skipped), nil, "ColorGradingEffect must be captured, not skipped")
    eq(snap.data.node.children[1].className, "ColorGradingEffect")
    root:Destroy()
    c:destroy()
end)

spec("a MeshPart added after an eligible checkpoint can be removed without claiming mesh recreation", function()
    local root = Instance.new("Folder"); root.Name = "MeshDeleteOnly"; root.Parent = workspace
    local kept = Instance.new("Part"); kept.Name = "Kept"; kept.Parent = root
    local c = newCommands()
    local snap = run(c, "mesh-delete-only-snapshot", {
        op = "snapshot", root = "game.Workspace.MeshDeleteOnly", includeScripts = true, checkpointId = "cp-mesh-delete-only",
    }, false)
    eq(snap.ok, true, tostring(snap.error)); eq(snap.data.restorable, true)
    local later = Instance.new("MeshPart"); later.Name = "GeneratedLater"; later.Parent = root
    local restored = run(c, "mesh-delete-only-restore", {
        op = "restore", root = "game.Workspace.MeshDeleteOnly", checkpointId = "cp-mesh-delete-only", snapshot = snap.data,
    }, true, function() return true end)
    eq(restored.ok, true, tostring(restored.error))
    eq(root:FindFirstChild("GeneratedLater"), nil, "a post-checkpoint MeshPart must be removable")
    eq(root:FindFirstChild("Kept") ~= nil, true, "ordinary checkpoint content must still restore")
    root:Destroy(); c:destroy()
end)

spec("typed terrain edits are bounded, recorded and never use run_code", function()
    terrain.calls = {}
    local c = newCommands()
    local before = #history.log
    local filled = run(c, "terrain-fill", {
        op = "terrain_edit", action = "fill_block", center = { 0, 8, 0 }, size = { 32, 12, 32 }, material = "Enum.Material.Grass",
    }, true)
    eq(filled.ok, true, tostring(filled.error)); eq(terrain.calls[1].action, "fill_block"); eq(terrain.calls[1].material, Enum.Material.Grass)
    eq(#history.log, before + 2); has(history.log[before + 1], "begin:Apple terrain_edit terrain-fill"); eq(history.log[before + 2], "Commit")

    local voxels = run(c, "terrain-voxels", {
        op = "terrain_edit", action = "write_voxels", origin = { 0, 0, 0 }, dimensions = { 2, 1, 1 }, voxels = {
            { material = "Enum.Material.Rock", occupancy = 1 }, { material = "Enum.Material.Air", occupancy = 0 },
        },
    }, true)
    eq(voxels.ok, true, tostring(voxels.error)); eq(voxels.data.voxelsWritten, 2)
    local write = terrain.calls[2]; eq(write.action, "write_voxels"); eq(write.materials[1][1][1], Enum.Material.Rock); eq(write.occupancy[2][1][1], 0)

    local region = run(c, "terrain-region", {
        op = "terrain_edit", action = "fill_region", min = { -16, 0, -16 }, max = { 16, 12, 16 }, material = "Enum.Material.Rock",
    }, true)
    eq(region.ok, true, tostring(region.error)); eq(terrain.calls[3].action, "fill_region"); eq(terrain.calls[3].resolution, 4)
    local replaced = run(c, "terrain-replace", {
        op = "terrain_edit", action = "replace_material", min = { -16, 0, -16 }, max = { 16, 12, 16 }, sourceMaterial = "Enum.Material.Rock", targetMaterial = "Enum.Material.Grass",
    }, true)
    eq(replaced.ok, true, tostring(replaced.error)); eq(terrain.calls[4].action, "replace_material"); eq(terrain.calls[4].source, Enum.Material.Rock); eq(terrain.calls[4].target, Enum.Material.Grass)

    local oversized = run(c, "terrain-too-large", {
        op = "terrain_edit", action = "write_voxels", origin = { 0, 0, 0 }, dimensions = { 64, 64, 64 }, voxels = {},
    }, true)
    eq(oversized.ok, false); eq(oversized.failure, "invalid"); has(oversized.error, "bounded cell limit")
    local denied = run(c, "terrain-denied", { op = "terrain_edit", action = "fill_ball", center = {0,0,0}, radius = 8, material = "Enum.Material.Grass" }, false)
    eq(denied.ok, false); eq(denied.remedy, "edit_consent")
    c:destroy()
end)

spec("ordinary prompts, UI images, sounds and particles are creatable while new external content stays refused", function()
    local host = Instance.new("Part"); host.Name = "OrdinaryHost"; host.Parent = workspace
    local gui = Instance.new("ScreenGui"); gui.Name = "OrdinaryGui"; gui.Parent = services.StarterGui
    local c = newCommands()
    local made = run(c, "ordinary-authoring", { op = "create_instances", items = {
        { className = "ProximityPrompt", name = "Use", parent = "game.Workspace.OrdinaryHost", props = {
            ActionText = { t = "string", v = "Use" }, HoldDuration = { t = "number", v = 0.4 }, MaxActivationDistance = { t = "number", v = 12 },
        } },
        { className = "ImageButton", name = "IconButton", parent = "game.StarterGui.OrdinaryGui", props = {
            ImageColor3 = { t = "Color3", v = { 0.2, 0.4, 0.8 } }, ImageTransparency = { t = "number", v = 0.1 },
        } },
        { className = "SoundGroup", name = "SFX", parent = "game.SoundService", props = { Volume = { t = "number", v = 0.8 } } },
        { className = "Sound", name = "Click", parent = "game.Workspace.OrdinaryHost", props = { Volume = { t = "number", v = 0.6 }, Looped = { t = "bool", v = false } } },
        { className = "ParticleEmitter", name = "Dust", parent = "game.Workspace.OrdinaryHost", props = {
            Rate = { t = "number", v = 7 }, Lifetime = { t = "NumberRange", v = { 0.5, 1.5 } },
            Size = { t = "NumberSequence", v = { { 0, 0.2, 0 }, { 1, 0.8, 0 } } },
            Color = { t = "ColorSequence", v = { { 0, { 1, 0.8, 0.4 } }, { 1, { 0.2, 0.1, 0.05 } } } },
        } },
    } }, true)
    eq(made.ok, true, tostring(made.error))
    eq(host:FindFirstChild("Use").ActionText, "Use")
    eq(gui:FindFirstChild("IconButton").ImageTransparency, 0.1)
    eq(services.SoundService:FindFirstChild("SFX").Volume, 0.8)
    eq(host:FindFirstChild("Dust").Size.Keypoints[2].Value, 0.8)
    local imageRefused = run(c, "image-content-refused", { op = "set_props", path = "game.StarterGui.OrdinaryGui.IconButton", props = { Image = { t = "string", v = "rbxassetid://1" } } }, true)
    eq(imageRefused.ok, false); has(imageRefused.error, "external content")
    local soundRefused = run(c, "sound-content-refused", { op = "set_props", path = "game.Workspace.OrdinaryHost.Click", props = { SoundId = { t = "string", v = "rbxassetid://2" } } }, true)
    eq(soundRefused.ok, false); has(soundRefused.error, "external content")
    host:Destroy(); gui:Destroy(); services.SoundService:FindFirstChild("SFX"):Destroy(); c:destroy()
end)

spec("a NumberSequence written as [time, value] pairs is accepted with the default envelope", function()
    local host = Instance.new("Part"); host.Name = "PairHost"; host.Parent = workspace
    local c = newCommands()
    local made = run(c, "sequence-pairs", { op = "create_instances", items = {
        { className = "ParticleEmitter", name = "Mist", parent = "game.Workspace.PairHost", props = {
            Transparency = { t = "NumberSequence", v = { { 0, 0.3 }, { 1, 1 } } },
        } },
    } }, true)
    eq(made.ok, true, tostring(made.error))
    local kp = host:FindFirstChild("Mist").Transparency.Keypoints
    eq(kp[2].Value, 1); eq(kp[1].Envelope, 0)
    host:Destroy(); c:destroy()
end)

spec("typed mood and mixer properties used by worker tools are writable", function()
    local c = newCommands()
    local lighting = run(c, "typed-mood", { op = "set_props", path = "game.Lighting", props = {
        ShadowSoftness = { t = "number", v = 0.35 },
        GlobalShadows = { t = "bool", v = true },
        ColorShift_Top = { t = "Color3", v = { 1, 0.7, 0.4 } },
        EnvironmentDiffuseScale = { t = "number", v = 0.9 },
        FogStart = { t = "number", v = 20 },
        FogEnd = { t = "number", v = 300 },
    } }, true)
    eq(lighting.ok, true, tostring(lighting.error))
    eq(services.Lighting.ShadowSoftness, 0.35)
    eq(services.Lighting.GlobalShadows, true)
    eq(services.Lighting.ColorShift_Top.R, 1)
    eq(services.Lighting.FogEnd, 300)

    local mixer = run(c, "typed-mixer", { op = "set_props", path = "game.SoundService", props = {
        AmbientReverb = { t = "EnumItem", v = "Enum.ReverbType.Cave" },
        RolloffScale = { t = "number", v = 1.2 },
        DistanceFactor = { t = "number", v = 3.33 },
        DopplerScale = { t = "number", v = 1 },
    } }, true)
    eq(mixer.ok, true, tostring(mixer.error))
    eq(services.SoundService.AmbientReverb, "Enum.ReverbType.Cave")
    eq(services.SoundService.RolloffScale, 1.2)
    eq(services.SoundService.DistanceFactor, 3.33)
    c:destroy()
end)

spec("checkpoint restores opaque visual/audio content, sequences and deferred instance links", function()
    local root = Instance.new("Folder"); root.Name = "RichCheckpoint"; root.Parent = workspace
    local a = Instance.new("Part"); a.Name = "A"; a.Parent = root
    local b = Instance.new("Part"); b.Name = "B"; b.Parent = root
    local a0 = Instance.new("Attachment"); a0.Name = "A0"; a0.Parent = a
    local a1 = Instance.new("Attachment"); a1.Name = "A1"; a1.Parent = b
    local weld = Instance.new("WeldConstraint"); weld.Name = "Weld"; weld.Part0 = a; weld.Part1 = b; weld.Parent = root
    local beam = Instance.new("Beam"); beam.Name = "Beam"; beam.Attachment0 = a0; beam.Attachment1 = a1; beam.Texture = "rbxassetid://333"; beam.Width0 = 0.2; beam.Width1 = 0.6
    beam.Color = ColorSequence.new({ ColorSequenceKeypoint.new(0, Color3.new(1,0,0)), ColorSequenceKeypoint.new(1, Color3.new(0,0,1)) })
    beam.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0,0,0), NumberSequenceKeypoint.new(1,1,0) }); beam.Parent = root
    local sound = Instance.new("Sound"); sound.Name = "Tone"; sound.SoundId = "rbxassetid://444"; sound.Volume = 0.35; sound.Parent = root
    local c = newCommands()
    local snap = run(c, "rich-snapshot", { op = "snapshot", root = "game.Workspace.RichCheckpoint", includeScripts = true, checkpointId = "cp-rich" }, false)
    eq(snap.ok, true, tostring(snap.error)); eq(snap.data.restorable, true); eq(next(snap.data.skipped), nil)
    weld.Part0 = nil; weld.Part1 = nil; beam.Attachment0 = nil; beam.Attachment1 = nil; beam.Texture = "changed"; sound.SoundId = "changed"
    local restored = run(c, "rich-restore", { op = "restore", root = "game.Workspace.RichCheckpoint", checkpointId = "cp-rich", snapshot = snap.data }, true, function() return true end)
    eq(restored.ok, true, tostring(restored.error))
    local restoredA = root:FindFirstChild("A"); local restoredB = root:FindFirstChild("B")
    local restoredWeld = root:FindFirstChild("Weld"); local restoredBeam = root:FindFirstChild("Beam"); local restoredSound = root:FindFirstChild("Tone")
    eq(restoredWeld.Part0, restoredA); eq(restoredWeld.Part1, restoredB)
    eq(restoredBeam.Attachment0, restoredA:FindFirstChild("A0")); eq(restoredBeam.Attachment1, restoredB:FindFirstChild("A1"))
    eq(restoredBeam.Texture, "rbxassetid://333"); eq(restoredBeam.Color.Keypoints[2].Value.B, 1); eq(restoredBeam.Transparency.Keypoints[2].Value, 1)
    eq(restoredSound.SoundId, "rbxassetid://444"); eq(restoredSound.Volume, 0.35)
    root:Destroy(); c:destroy()
end)

spec("set_props can wire bounded in-place instance references after creation", function()
    local a = Instance.new("Part"); a.Name = "RefA"; a.Parent = workspace
    local b = Instance.new("Part"); b.Name = "RefB"; b.Parent = workspace
    local weld = Instance.new("WeldConstraint"); weld.Name = "RefWeld"; weld.Parent = workspace
    local c = newCommands()
    local wired = run(c, "wire-ref", { op = "set_props", path = "game.Workspace.RefWeld", props = {
        Part0 = { t = "Instance", v = "game.Workspace.RefA" }, Part1 = { t = "Instance", v = "game.Workspace.RefB" },
    } }, true)
    eq(wired.ok, true, tostring(wired.error)); eq(weld.Part0, a); eq(weld.Part1, b)
    a:Destroy(); b:Destroy(); weld:Destroy(); c:destroy()
end)

spec("create_instances preflights collisions and the whole nested tree", function()
    local c = newCommands()
    local existing = run(c, "existing-name", { op = "create_instances", items = {{ className = "Part", name = "Typed", parent = "game.Workspace" }} }, true)
    eq(existing.ok, false); eq(existing.failure, "conflict"); eq(workspace:FindFirstChild("Typed").ClassName, "Part")

    local duplicateChildren = run(c, "duplicate-children", { op = "create_instances", items = {{
        className = "Folder", name = "DuplicateTree", parent = "game.Workspace", children = {
            { className = "Part", name = "Same" }, { className = "Part", name = "Same" },
        },
    }} }, true)
    eq(duplicateChildren.ok, false); eq(duplicateChildren.failure, "conflict"); eq(workspace:FindFirstChild("DuplicateTree"), nil)

    local override = run(c, "nested-parent", { op = "create_instances", items = {{
        className = "Folder", name = "OverrideTree", parent = "game.Workspace", children = {
            { className = "Part", name = "Child", parent = "game.ServerStorage" },
        },
    }} }, true)
    eq(override.ok, false); eq(override.failure, "invalid"); eq(workspace:FindFirstChild("OverrideTree"), nil)

    local branches = {}
    for branch = 1, 40 do
        local leaves = {}
        for leaf = 1, 10 do table.insert(leaves, { className = "Part", name = "Leaf" .. tostring(leaf) }) end
        table.insert(branches, { className = "Folder", name = "Branch" .. tostring(branch), children = leaves })
    end
    local tooLarge = run(c, "create-cap", { op = "create_instances", items = {{ className = "Folder", name = "TooLarge", parent = "game.Workspace", children = branches }} }, true)
    eq(tooLarge.ok, false); eq(tooLarge.failure, "invalid"); has(tooLarge.error, "400-node"); eq(workspace:FindFirstChild("TooLarge"), nil)
    c:destroy()
end)

spec("companion structural edits resolve first, record, and keep paths unambiguous", function()
    local c = newCommands()
    local made = run(c, "companion-create", { op = "create_instances", items = {
        { className = "Part", name = "CompA", parent = "game.Workspace" },
        { className = "Part", name = "CompB", parent = "game.Workspace" },
        { className = "Folder", name = "CompDest", parent = "game.Workspace" },
    } }, true)
    eq(made.ok, true, tostring(made.error))
    local renamed = run(c, "rename", { op = "rename_instance", path = "game.Workspace.CompA", name = "CompAlpha" }, true)
    eq(renamed.ok, true); eq(renamed.data.path, "game.Workspace.CompAlpha")
    local cloned = run(c, "clone", { op = "clone_instances", paths = { "game.Workspace.CompAlpha" } }, true)
    eq(cloned.ok, true, tostring(cloned.error)); eq(#cloned.data.created, 1); has(cloned.data.created[1], "CompAlpha (2)")
    local grouped = run(c, "group", { op = "group_instances", paths = { "game.Workspace.CompAlpha", "game.Workspace.CompB" }, name = "CompGroup" }, true)
    eq(grouped.ok, true, tostring(grouped.error)); eq(grouped.data.grouped, 2)
    local ungrouped = run(c, "ungroup", { op = "ungroup_instances", paths = { grouped.data.path } }, true)
    eq(ungrouped.ok, true, tostring(ungrouped.error)); eq(#ungrouped.data.released, 2)
    local moved = run(c, "move", { op = "move_instances", moves = {{ path = "game.Workspace.CompAlpha", newParent = "game.Workspace.CompDest" }} }, true)
    eq(moved.ok, true, tostring(moved.error)); eq(moved.data.moved[1], "game.Workspace.CompDest.CompAlpha")
    local locked = run(c, "lock", { op = "set_locked", paths = { "game.Workspace.CompDest" }, locked = true }, true)
    eq(locked.ok, true); eq(locked.data.parts, 1)
    local alpha = services.Workspace:FindFirstChild("CompDest"):FindFirstChild("CompAlpha")
    eq(alpha.Locked, true); alpha.Transparency = 0.35
    local hidden = run(c, "hide", { op = "set_visible", paths = { "game.Workspace.CompDest.CompAlpha" }, visible = false }, true)
    eq(hidden.ok, true); eq(alpha.Transparency, 1); eq(alpha:GetAttribute("__AppleStudioHiddenTransparencyV1"), 0.35); eq(alpha:GetAttribute("__AppleStudioHiddenMarkerV1"), true)
    local shown = run(c, "show", { op = "set_visible", paths = { "game.Workspace.CompDest.CompAlpha" }, visible = true }, true)
    eq(shown.ok, true); eq(alpha.Transparency, 0.35); eq(alpha:GetAttribute("__AppleStudioHiddenTransparencyV1"), nil); eq(alpha:GetAttribute("__AppleStudioHiddenMarkerV1"), nil)
    alpha:SetAttribute("__AppleStudioHiddenTransparencyV1", 0.7)
    local collision = run(c, "hide-collision", { op = "set_visible", paths = { "game.Workspace.CompDest.CompAlpha" }, visible = false }, true)
    eq(collision.ok, false); eq(alpha.Transparency, 0.35, "a pre-existing reserved attribute is never overwritten")
    alpha:SetAttribute("__AppleStudioHiddenTransparencyV1", nil)
    local deleted = run(c, "delete", { op = "delete_instances", paths = { "game.Workspace.CompB", cloned.data.created[1] } }, true)
    eq(deleted.ok, true); eq(deleted.data.count, 2); eq(workspace:FindFirstChild("CompB"), nil)
    eq(history.recording, nil, "all structural recordings close")
    c:destroy()
end)

spec("transform_instances moves and scales through one recorded plan", function()
    local mover = Instance.new("Part"); mover.Name = "Mover"; mover.CFrame = CFrame.new(1, 2, 3); mover.Size = v3(1, 2, 3); mover.Parent = workspace
    local c = newCommands()
    local transformed = run(c, "transform", { op = "transform_instances", paths = { "game.Workspace.Mover" }, move = { 2, 3, 4 }, scale = 2 }, true)
    eq(transformed.ok, true, tostring(transformed.error)); eq(transformed.data.parts, 1)
    eq(mover.Position.X, 3); eq(mover.Position.Y, 5); eq(mover.Position.Z, 7)
    eq(mover.Size.X, 2); eq(mover.Size.Y, 4); eq(mover.Size.Z, 6)
    local refused = run(c, "bad-transform", { op = "transform_instances", paths = { "game.Workspace.Mover" }, scale = 0 / 0 }, true)
    eq(refused.ok, false); eq(mover.Size.X, 2, "invalid transform leaves geometry unchanged")
    c:destroy()
end)

spec("multi-target structural failures happen before the first mutation", function()
    local survivor = Instance.new("Part"); survivor.Name = "PreflightSurvivor"; survivor.Parent = workspace
    local c = newCommands()
    local result = run(c, "preflight", { op = "delete_instances", paths = { "game.Workspace.PreflightSurvivor", "game.Workspace.DoesNotExist" } }, true)
    eq(result.ok, false); eq(workspace:FindFirstChild("PreflightSurvivor"), survivor)
    eq(history.recording, nil); eq(history.log[#history.log], "Cancel")
    local service = run(c, "service-refusal", { op = "delete_instances", paths = { "game.Workspace" } }, true)
    eq(service.ok, false); eq(service.failure, "refused"); has(service.error, "because it is a service"); eq(game:GetService("Workspace"), workspace)
    local duplicate = run(c, "duplicate", { op = "delete_instances", paths = { "game.Workspace.PreflightSurvivor", "game.Workspace.PreflightSurvivor" } }, true)
    eq(duplicate.ok, false); eq(duplicate.failure, "invalid"); eq(workspace:FindFirstChild("PreflightSurvivor"), survivor)
    local moveToRoot = run(c, "move-root", { op = "move_instances", moves = {{ path = "game.Workspace.PreflightSurvivor", newParent = "game" }} }, true)
    eq(moveToRoot.ok, false); eq(moveToRoot.failure, "refused"); eq(survivor.Parent, workspace)
    local cloneToRoot = run(c, "clone-root", { op = "clone_instances", paths = { "game.Workspace.PreflightSurvivor" }, parent = "game" }, true)
    eq(cloneToRoot.ok, false); eq(cloneToRoot.failure, "refused"); eq(#workspace:GetChildren() >= 1, true)
    local createInCamera = run(c, "create-camera", { op = "create_instances", items = {{ className = "Part", name = "NoCameraChild", parent = "game.Workspace.Camera" }} }, true)
    eq(createInCamera.ok, false); has(createInCamera.error, "engine-owned"); eq(workspace:FindFirstChild("Camera"):FindFirstChild("NoCameraChild"), nil)
    c:destroy()
end)

spec("unsafe classes, properties, nonfinite values and content are refused", function()
    local c = newCommands()
    eq(run(c, "class", { op = "create_instances", items = {{ className = "ModuleScript", name = "No", parent = "game.Workspace" }} }, true).ok, false)
    eq(run(c, "prop", { op = "set_props", path = "game.Workspace.Typed", props = { Source = { t = "string", v = "bad" } } }, true).ok, false)
    eq(run(c, "nan", { op = "set_props", path = "game.Workspace.Typed", props = { Transparency = { t = "number", v = 0 / 0 } } }, true).ok, false)
    eq(run(c, "content", { op = "set_props", path = "game.Workspace.Typed", props = { Texture = { t = "Content", v = "rbxassetid://1" } } }, true).ok, false)
    local cameraScript = run(c, "camera-script", {
        op = "edit_script",
        path = "game.Workspace.Camera.HiddenScript",
        source = "return 1\\n",
        create = { className = "ModuleScript", parent = "game.Workspace.Camera" },
    }, true)
    eq(cameraScript.ok, false); eq(cameraScript.failure, "refused"); eq(workspace:FindFirstChild("Camera"):FindFirstChild("HiddenScript"), nil)
    local mismatchedParent = run(c, "mismatched-script-parent", {
        op = "edit_script",
        path = "game.ServerScriptService.Misplaced",
        source = "return 1\\n",
        create = { className = "ModuleScript", parent = "game.Workspace" },
    }, true)
    eq(mismatchedParent.ok, false); eq(mismatchedParent.failure, "conflict"); eq(workspace:FindFirstChild("Misplaced"), nil); eq(services.ServerScriptService:FindFirstChild("Misplaced"), nil)
    c:destroy()
end)

spec("edit_script checks baseHash in the editor callback", function()
    local c = newCommands()
    local read = run(c, "read-before-edit", { op = "read_script", path = "game.ServerScriptService.Logic" }, false)
    local write = run(c, "edit", { op = "edit_script", path = "game.ServerScriptService.Logic", source = "return 7\\n", baseHash = read.data.baseHash }, true)
    eq(write.ok, true, "edit " .. tostring(write.error)); eq(services.ServerScriptService:FindFirstChild("Logic").Source, "return 7\\n")
    local changed = run(c, "read-again", { op = "read_script", path = "game.ServerScriptService.Logic" }, false)
    services.ServerScriptService:FindFirstChild("Logic").Source = "-- Studio changed\\n"
    local conflict = run(c, "conflict", { op = "edit_script", path = "game.ServerScriptService.Logic", source = "return 9\\n", baseHash = changed.data.baseHash }, true)
    eq(conflict.ok, false); eq(conflict.failure, "conflict"); eq(services.ServerScriptService:FindFirstChild("Logic").Source, "-- Studio changed\\n"); eq(history.recording, nil)
    local remote = run(c, "remote", { op = "edit_script", path = "game.ServerScriptService.Logic", source = "require(123)\\n", baseHash = changed.data.baseHash }, true)
    eq(remote.ok, false, "remote module")
    c:destroy()
end)

spec("snapshot binds checkpoint identity and reports honest whole-place coverage", function()
    local folder = Instance.new("Folder"); folder.Name = "Snapshot"; folder.Parent = workspace
    local child = Instance.new("Part"); child.Name = "Part"; child.Parent = folder
    local c = newCommands()
    local snap = run(c, "snapshot", { op = "snapshot", root = "game.Workspace.Snapshot", includeScripts = true, checkpointId = "cp-subtree-1" }, false)
    eq(snap.ok, true); eq(snap.data.format, "apple-studio-snapshot-v1"); eq(snap.data.complete, true)
    eq(snap.data.restorable, true); eq(snap.data.coverage, "exact"); eq(snap.data.checkpointId, "cp-subtree-1")
    local unbound = run(c, "snapshot-place-unbound", { op = "snapshot", root = "game", includeScripts = true }, false)
    eq(unbound.ok, false); eq(unbound.failure, "invalid"); has(unbound.error, "checkpointId")
    local place = run(c, "snapshot-place", { op = "snapshot", root = "game", includeScripts = true, checkpointId = "cp-place-1" }, false)
    eq(place.ok, true, tostring(place.error)); eq(place.data.node.className, "DataModel")
    eq(place.data.root, "game"); eq(place.data.restorable, true); eq(place.data.complete, false); eq(place.data.wholePlaceComplete, false)
    eq(place.data.coverage, "supported-subset"); eq(place.data.scriptCount >= 1, true); eq(place.data.instanceCount >= 1, true)
    eq(next(place.data.skipped), nil, "default engine-owned containers/configuration must not be silently skipped")
    eq(#place.data.protected, 6, "default place must report Camera, Terrain and four TextChat configuration singletons as protected coverage")
    local protectedClasses = {}; for _, entry in ipairs(place.data.protected) do protectedClasses[entry.className] = true end
    for _, className in ipairs({"Camera","Terrain","ChatWindowConfiguration","ChatInputBarConfiguration","ChannelTabsConfiguration","BubbleChatConfiguration"}) do
        eq(protectedClasses[className], true, "missing protected coverage for " .. className)
    end
    local authoredConfig = Instance.new("ChatWindowConfiguration"); authoredConfig.Name = "AuthoredChatConfig"; authoredConfig.Parent = workspace
    local authoredPlace = run(c, "snapshot-place-authored-config", { op = "snapshot", root = "game", includeScripts = true, checkpointId = "cp-place-authored-config" }, false)
    eq(authoredPlace.ok, true); eq(authoredPlace.data.restorable, false); eq(authoredPlace.data.coverage, "incomplete")
    eq(authoredPlace.data.skipped.ChatWindowConfiguration, 1, "an authored config-class instance outside TextChatService must not disappear as protected engine content")
    authoredConfig:Destroy()
    c:destroy()
end)

spec("restore is checkpoint-bound, source-hash verified and one recorded mutation", function()
    local folder = Instance.new("Folder"); folder.Name = "RestoreTarget"; folder:SetAttribute("Version", "checkpoint"); folder.Parent = workspace
    local child = Instance.new("Part"); child.Name = "Before"; child.Transparency = 0.25; child.Parent = folder
    local scriptObject = Instance.new("ModuleScript"); scriptObject.Name = "Logic"; scriptObject.Source = "return 'checkpoint'\\n"; scriptObject.Parent = folder
    local c = newCommands()
    local snap = run(c, "restore-snapshot", { op = "snapshot", root = "game.Workspace.RestoreTarget", includeScripts = true, checkpointId = "cp-restore-1" }, false)
    eq(snap.ok, true, tostring(snap.error)); eq(snap.data.restorable, true); eq(snap.data.complete, true)
    local savedPart = nil
    for _, node in ipairs(snap.data.node.children) do if node.className == "Part" then savedPart = node end end
    eq(savedPart ~= nil, true); eq(savedPart.props.Transparency.v, 0.25, "checkpoint must preserve the pre-mutation part transparency")
    local sourceNode = nil
    for _, node in ipairs(snap.data.node.children) do if node.className == "ModuleScript" then sourceNode = node end end
    eq(sourceNode ~= nil, true); eq(sourceNode.source, "return 'checkpoint'\\n"); eq(sourceNode.sourceChars, #sourceNode.source); eq(type(sourceNode.baseHash), "string"); eq(#sourceNode.baseHash, 8)

    child.Name = "After"; child.Transparency = 0.9
    scriptObject.Source = "return 'changed'\\n"
    folder:SetAttribute("Version", "changed")
    local extra = Instance.new("Part"); extra.Name = "Extra"; extra.Parent = folder
    local beforeHistory = #history.log
    local restored = run(c, "restore-commit", { op = "restore", root = "game.Workspace.RestoreTarget", checkpointId = "cp-restore-1", snapshot = snap.data }, true, function() return true end)
    eq(restored.ok, true, tostring(restored.error)); eq(restored.data.restored, true); eq(restored.data.checkpointId, "cp-restore-1")
    eq(restored.data.scriptsRestored, 1); eq(restored.data.scriptsExpected, 1); eq(restored.data.failedInstances, 0); eq(restored.data.failedScripts, 0); eq(restored.data.failedProperties, 0)
    eq(folder:GetAttribute("Version"), "checkpoint"); eq(folder:FindFirstChild("Extra"), nil)
    eq(folder:FindFirstChild("Before").Transparency, 0.25); eq(folder:FindFirstChild("Logic").Source, "return 'checkpoint'\\n")
    eq(#history.log, beforeHistory + 2); has(history.log[beforeHistory + 1], "begin:Apple restore restore-commit"); eq(history.log[beforeHistory + 2], "Commit")
    eq(history.recording, nil)

    local wrong = run(c, "restore-wrong-id", { op = "restore", root = "game.Workspace.RestoreTarget", checkpointId = "cp-other", snapshot = snap.data }, true, function() return true end)
    eq(wrong.ok, false); eq(wrong.failure, "conflict"); eq(#history.log, beforeHistory + 2, "identity refusal happens before recording")

    local tampered = {}
    for k,v in pairs(snap.data) do tampered[k]=v end
    tampered.node = {}
    for k,v in pairs(snap.data.node) do tampered.node[k]=v end
    tampered.node.children = {}
    for i,v in ipairs(snap.data.node.children) do tampered.node.children[i]=v end
    local badScript = nil
    for _, node in ipairs(tampered.node.children) do if node.className == "ModuleScript" then badScript = node end end
    eq(badScript ~= nil, true)
    local badScriptCopy = {}; for k,v in pairs(badScript) do badScriptCopy[k]=v end
    for i,node in ipairs(tampered.node.children) do if node == badScript then tampered.node.children[i]=badScriptCopy end end
    badScriptCopy.source = "return 'tampered'\\n"
    local hashRefusal = run(c, "restore-hash", { op = "restore", root = "game.Workspace.RestoreTarget", checkpointId = "cp-restore-1", snapshot = tampered }, true, function() return true end)
    eq(hashRefusal.ok, false); eq(hashRefusal.failure, "invalid"); has(hashRefusal.error, "hash"); eq(#history.log, beforeHistory + 2)
    c:destroy()
end)

spec("incomplete snapshot is never checkpoint-eligible or mutated from", function()
    local root = Instance.new("Folder"); root.Name = "IncompleteSnapshot"; root.Parent = workspace
    local supported = Instance.new("Part"); supported.Name = "Supported"; supported.Parent = root
    local unsupported = Instance.new("MeshPart"); unsupported.Name = "Unsupported"; unsupported.Parent = root
    local c = newCommands()
    local snap = run(c, "incomplete-snapshot", { op = "snapshot", root = "game.Workspace.IncompleteSnapshot", includeScripts = true, checkpointId = "cp-incomplete-1" }, false)
    eq(snap.ok, true, tostring(snap.error)); eq(snap.data.complete, false); eq(snap.data.restorable, false); eq(snap.data.checkpointEligible, false); eq(snap.data.coverage, "incomplete")
    eq(snap.data.skipped.MeshPart, 1)
    local beforeHistory = #history.log
    local refused = run(c, "incomplete-restore", { op = "restore", root = "game.Workspace.IncompleteSnapshot", checkpointId = "cp-incomplete-1", snapshot = snap.data }, true, function() return true end)
    eq(refused.ok, false); eq(refused.failure, "invalid"); has(refused.error, "incomplete or unbound")
    eq(#history.log, beforeHistory, "incomplete checkpoint refusal happens before recording")
    eq(root:FindFirstChild("Supported"), supported); eq(root:FindFirstChild("Unsupported"), unsupported)
    root:Destroy()
    c:destroy()
end)

spec("restore rejects stale protected or unsupported current content before mutation", function()
    local c = newCommands()
    local cameraChild = Instance.new("Folder"); cameraChild.Name = "CameraStateA"; cameraChild.Parent = camera
    local snap = run(c, "stale-snapshot", { op = "snapshot", root = "game", includeScripts = true, checkpointId = "cp-stale-1" }, false)
    eq(snap.ok, true, tostring(snap.error)); eq(snap.data.restorable, true)
    local marker = Instance.new("Part"); marker.Name = "StaleMutationMarker"; marker.Parent = workspace
    cameraChild:Destroy()
    local cameraReplacement = Instance.new("Folder"); cameraReplacement.Name = "CameraStateB"; cameraReplacement.Parent = camera
    local beforeHistory = #history.log
    local stale = run(c, "stale-restore", { op = "restore", root = "game", checkpointId = "cp-stale-1", snapshot = snap.data }, true, function() return true end)
    eq(stale.ok, false); eq(stale.failure, "conflict"); has(stale.error, "protected Studio content changed")
    eq(workspace:FindFirstChild("StaleMutationMarker"), marker); eq(#history.log, beforeHistory, "stale refusal happens before recording")
    cameraReplacement:Destroy()

    local subtree = Instance.new("Folder"); subtree.Name = "UnsupportedCurrent"; subtree.Parent = workspace
    local supported = Instance.new("Part"); supported.Name = "Supported"; supported.Parent = subtree
    local supportedSnap = run(c, "unsupported-snapshot", { op = "snapshot", root = "game.Workspace.UnsupportedCurrent", checkpointId = "cp-unsupported-1", includeScripts = true }, false)
    eq(supportedSnap.ok, true)
    local unknown = Instance.new("Humanoid"); unknown.Name = "DoNotDelete"; unknown.Parent = subtree
    local refused = run(c, "unsupported-restore", { op = "restore", root = "game.Workspace.UnsupportedCurrent", checkpointId = "cp-unsupported-1", snapshot = supportedSnap.data }, true, function() return true end)
    eq(refused.ok, false); eq(refused.failure, "conflict"); has(refused.error, "unsupported current content")
    eq(subtree:FindFirstChild("DoNotDelete"), unknown); eq(subtree:FindFirstChild("Supported"), supported); eq(#history.log, beforeHistory)
    marker:Destroy(); subtree:Destroy()
    c:destroy()
end)

spec("3D generation fails closed when the adapter is unavailable", function()
    local c = newCommands()
    local generated = run(c, "generate", { op = "generate_model", prompt = "a genre-specific haunted station", parent = "game.Workspace" }, true)
    eq(generated.ok, false); eq(generated.failure, "refused"); has(generated.error, "GenerationService adapter"); has(generated.error, "no substitute")
    c:destroy()
end)

spec("inspect_model is bounded read-only structural QC with honest triangle/visual limits", function()
    local model = Instance.new("Model"); model.Name = "InspectMe"; model.Parent = workspace
    local part = Instance.new("Part"); part.Name = "Body"; part.Size = v3(4,6,8); part.Anchored = false; part.CanCollide = true; part.Parent = model
    local mesh = Instance.new("MeshPart"); mesh.Name = "Mesh"; mesh.Size = v3(2,2,2); mesh.Anchored = true; mesh.TextureID = "rbxassetid://123"; mesh.Parent = model
    local scriptObject = Instance.new("Script"); scriptObject.Name = "Code"; scriptObject.Parent = model
    local c = newCommands()
    local before = #history.log
    local inspected = run(c, "inspect", { op = "inspect_model", path = "game.Workspace.InspectMe", intent = "crate" }, false)
    eq(inspected.ok, true, tostring(inspected.error)); eq(inspected.data.kind, "structural"); eq(inspected.data.verdict, "fail")
    eq(inspected.data.parts, 2); eq(inspected.data.scripts, 1); eq(inspected.data.meshParts, 1); eq(inspected.data.texturedMeshParts, 1)
    eq(inspected.data.unanchoredParts, 1); eq(inspected.data.trianglesMeasured, false); eq(inspected.data.visualVerdict, "unreviewed")
    eq(#history.log, before, "inspection must not create undo history")
    scriptObject:Destroy()
    local clean = run(c, "inspect-clean", { op = "inspect_model", path = "game.Workspace.InspectMe" }, false)
    eq(clean.ok, true); eq(clean.data.verdict, "pass")
    model:Destroy(); c:destroy()
end)

spec("run_mode uses explicit consent, controls only Run mode, and creates no undo entries", function()
    runService.edit=true; runService.running=false; runService.runMode=false
    local c = newCommands()
    local before = #history.log
    local denied = run(c, "run-denied", { op = "run_mode", action = "start" }, false)
    eq(denied.ok, false); eq(denied.remedy, "edit_consent")
    local started = run(c, "run-start", { op = "run_mode", action = "start" }, true)
    eq(started.ok, true, tostring(started.error)); eq(started.data.running, true); eq(started.data.runMode, true); eq(runService.running, true)  -- IsEdit stays true under Run(); running is the fact
    local writeDuringRun = run(c, "run-write", { op = "set_props", path = "game.Workspace.Mover", props = { Transparency = { t = "number", v = 0.2 } } }, true)
    eq(writeDuringRun.ok, false); eq(writeDuringRun.remedy, "leave_test_mode")
    local paused = run(c, "run-pause", { op = "run_mode", action = "pause" }, true)
    eq(paused.ok, true); eq(paused.data.running, false); eq(paused.data.runMode, true)
    local resumed = run(c, "run-resume", { op = "run_mode", action = "resume" }, true)
    eq(resumed.ok, true); eq(resumed.data.running, true)
    local stopped = run(c, "run-stop", { op = "run_mode", action = "stop" }, true)
    eq(stopped.ok, true); eq(stopped.data.stopped, true); eq(stopped.data.runMode, false); eq(runService.edit, true)
    eq(#history.log, before, "RunService controls are Studio state, not DataModel undo entries")
    c:destroy()
end)

spec("Apple can stop the Run it started, although Studio reports IsRunMode false for it", function()
    runService.edit=true; runService.running=false; runService.runMode=false
    local c = newCommands()
    local started = run(c, "own-start", { op = "run_mode", action = "start" }, true)
    eq(started.ok, true, tostring(started.error)); eq(started.data.started, true)
    eq(runService:IsRunMode(), false, "the mock must model the documented IsRunMode for Run()")
    local stopped = run(c, "own-stop", { op = "run_mode", action = "stop" }, true)
    eq(stopped.ok, true, tostring(stopped.error)); eq(stopped.data.stopped, true); eq(runService.running, false); eq(runService.edit, true)
    c:destroy()
end)

spec("a test Apple did not start is still refused, and a Run-button test can still be stopped", function()
    runService.edit=false; runService.running=true; runService.runMode=false  -- the user pressed Play
    local c = newCommands()
    local refused = run(c, "play-stop", { op = "run_mode", action = "stop" }, true)
    eq(refused.ok, false); eq(refused.remedy, "leave_test_mode"); eq(runService.running, true)
    runService:Stop()
    runService:PressRunButton()
    local stopped = run(c, "button-stop", { op = "run_mode", action = "stop" }, true)
    eq(stopped.ok, true, tostring(stopped.error)); eq(stopped.data.stopped, true); eq(runService.running, false)
    c:destroy()
end)

spec("a Run the user stopped from Studio is forgotten, so it cannot authorize a later takeover", function()
    runService.edit=true; runService.running=false; runService.runMode=false
    local c = newCommands()
    eq(run(c, "own-start2", { op = "run_mode", action = "start" }, true).ok, true)
    runService:Stop()                                   -- the user pressed Studio's Stop
    eq(run(c, "observe", { op = "project_census" }, false).ok, true)  -- any command sees edit mode again
    runService.edit=false; runService.running=true      -- ...then the user started a Play test of their own
    local refused = run(c, "late-stop", { op = "run_mode", action = "stop" }, true)
    eq(refused.ok, false); eq(refused.remedy, "leave_test_mode"); eq(runService.running, true)
    runService:Stop(); c:destroy()
end)

spec("project_census replaces run_code for playtest safety counting", function()
    local marker = Instance.new("Part"); marker.Name = "CensusMarker"; marker.Parent = workspace
    local code = Instance.new("Script"); code.Name = "CensusScript"; code.Parent = services.ServerScriptService
    local c = newCommands()
    local census = run(c, "census", { op = "project_census" }, false)
    eq(census.ok, true, tostring(census.error)); eq(census.data.parts >= 1, true); eq(census.data.scripts >= 1, true)
    eq(census.data.services.Workspace >= 1, true); eq(census.data.services.ServerScriptService >= 1, true)
    local found = false; for _, name in census.data.topLevel do if name == "CensusMarker" then found = true end end
    eq(found, true)
    marker:Destroy(); code:Destroy(); c:destroy()
end)

local function fakeRenderer(config)
    local adapter = { calls = 0, config = config or {} }
    function adapter.capture(root, subject, view, width, height, env)
        adapter.calls += 1
        adapter.lastRoot = root
        adapter.lastSubject = subject
        adapter.lastView = view
        adapter.lastWidth = width
        adapter.lastHeight = height
        adapter.lastEnv = env
        if adapter.config.result then return adapter.config.result end
        return {
            subject = subject,
            boundsSize = { 1, 1, 1 },
            views = { { name = view, rgbBase64 = "AAAA", meta = { width = width, height = height } } },
        }
    end
    return adapter
end

spec("render_view is a read: no consent, no recording, and the engine resolves the target", function()
    -- The visual gate the worker runs (render_view, compose_thumbnail, inspect_visually and the
    -- automatic critique) all ride this one operation. It reads geometry and returns pixels, so it
    -- must NOT demand edit consent and must NOT manufacture an undo entry for looking at a place.
    local renderer = fakeRenderer()
    local c = newCommands({ render = renderer })
    local part = Instance.new("Part"); part.Name = "Tower"; part.Parent = services.Workspace
    -- The DELTA, not the absolute: history.log is shared by every spec in this chunk, and a
    -- count pinned to zero would only be asserting the order the specs happen to run in.
    local before = #history.log

    local r = run(c, "r1", { op = "render_view", target = "game.Workspace.Tower", view = "all", width = 120, height = 90 }, false)
    eq(r.ok, true, "rendering must not require edit consent")
    eq(history.recording, nil, "a render must not open a ChangeHistory recording")
    eq(#history.log - before, 0, "a render must leave the undo stack untouched")
    eq(renderer.calls, 1)
    eq(renderer.lastRoot, part, "the renderer is handed the instance the engine resolved, not a path")
    eq(renderer.lastSubject, "game.Workspace.Tower")
    eq(renderer.lastView, "all")
    eq(renderer.lastWidth, 120)
    eq(renderer.lastHeight, 90)
    eq(renderer.lastEnv.scene, services.Workspace, "the scene is injected; the renderer has no reach of its own")
    eq(renderer.lastEnv.lighting, services.Lighting, "lighting is judged from configuration, so it travels with the render")
    c:destroy()
end)

spec("render_view adds the real Studio viewport PNG without replacing software critique views", function()
    local renderer = fakeRenderer()
    local native = { calls = 0 }
    function native:capture(width, height)
        self.calls += 1
        return { source = "studio_viewport", encoding = "png", rgbBase64 = "iVBORw0KGgo=", width = width, height = height, capturedAt = 123000 }, nil
    end
    local c = newCommands({ render = renderer, capture = native })
    local r = run(c, "native-frame", { op = "render_view", view = "eye", width = 160, height = 100 }, false)
    eq(r.ok, true, tostring(r.error)); eq(native.calls, 1)
    eq(r.data.views[1].rgbBase64, "AAAA", "software render remains available for calibrated critique")
    eq(r.data.studioViewport.rgbBase64, "iVBORw0KGgo=")
    eq(r.data.studioViewport.encoding, "png"); eq(r.data.studioViewport.source, "studio_viewport")
    eq(r.data.studioViewport.width, 160); eq(r.data.studioViewport.height, 100)
    eq(r.data.studioViewport.view, "viewport"); eq(r.data.studioViewport.subject, "game.Workspace")
    c:destroy()
end)

spec("native viewport failure degrades to software pixels instead of failing visual inspection", function()
    local renderer = fakeRenderer()
    local native = {}
    function native:capture(_, _) return nil, "permission not granted" end
    local c = newCommands({ render = renderer, capture = native })
    local r = run(c, "native-fallback", { op = "render_view", view = "hero" }, false)
    eq(r.ok, true, tostring(r.error)); eq(r.data.views[1].rgbBase64, "AAAA"); has(r.data.studioViewportError, "permission")
    c:destroy()
end)

spec("render_view defaults, validates its arguments and never guesses a view", function()
    local renderer = fakeRenderer()
    local c = newCommands({ render = renderer })
    local r = run(c, "r2", { op = "render_view" }, false)
    eq(r.ok, true)
    eq(renderer.lastView, "hero", "an absent view is the establishing shot")
    eq(renderer.lastSubject, "game.Workspace", "an absent target renders the place")
    eq(renderer.lastWidth, 288)
    eq(renderer.lastHeight, 180)

    local bad = run(c, "r3", { op = "render_view", view = "cinematic" }, false)
    eq(bad.ok, false)
    eq(bad.failure, "invalid")
    has(bad.error, "hero, front, side, top, eye or all")

    local huge = run(c, "r4", { op = "render_view", width = 4096 }, false)
    eq(huge.ok, false)
    eq(huge.failure, "invalid")

    local missing = run(c, "r5", { op = "render_view", target = "game.Workspace.NothingHere" }, false)
    eq(missing.ok, false)
    eq(missing.failure, "not_found")

    local outside = run(c, "r6", { op = "render_view", target = "game.CoreGui.Thing" }, false)
    eq(outside.ok, false)
    eq(outside.failure, "refused", "a render may not reach anywhere a read could not")
    c:destroy()
end)

spec("an empty frame is a named failure, not a picture of the sky", function()
    -- The renderer answers "nothing renderable found under ..." as DATA. Returning that as a
    -- successful capture would hand the critic a blank frame and let a scene that does not exist
    -- score like one that does.
    local renderer = fakeRenderer({ result = { error = "nothing renderable found under game.Workspace.Empty" } })
    local c = newCommands({ render = renderer })
    local folder = Instance.new("Folder"); folder.Name = "Empty"; folder.Parent = services.Workspace
    local r = run(c, "r7", { op = "render_view", target = "game.Workspace.Empty" }, false)
    eq(r.ok, false)
    eq(r.failure, "not_found")
    has(r.error, "nothing renderable found")
    folder.Parent = nil
    c:destroy()
end)

spec("a build with no renderer refuses by name and says so in its capability report", function()
    -- THE POINT OF THE WHOLE MECHANISM. If Render.luau is not in the bundle the plugin must say
    -- render_view is unsupported at PAIRING, so the worker withholds the three visual tools and
    -- tells the user the appearance was not verified. Discovering it per call would spend a step
    -- learning what the pairing already knew.
    local c = newCommands()
    local r = run(c, "r8", { op = "render_view" }, false)
    eq(r.ok, false)
    eq(r.failure, "refused")
    has(r.error, "not bundled in this build")

    local function byOp(report, wanted)
        for _, item in report.operations do if item.op == wanted then return item end end
        return nil
    end
    local report = Commands.capabilities(c)
    eq(byOp(report, "render_view").status, "unsupported")
    has(byOp(report, "render_view").reason, "not bundled in this build")
    eq(byOp(report, "screenshot").status, "unsupported")

    local withRenderer = newCommands({ render = fakeRenderer() })
    eq(byOp(Commands.capabilities(withRenderer), "render_view").status, "supported")
    eq(byOp(Commands.capabilities(withRenderer), "screenshot").status, "supported")
    withRenderer:destroy()
    c:destroy()
end)

spec("screenshot is the same code path as a hero render, not a second one", function()
    local renderer = fakeRenderer()
    local c = newCommands({ render = renderer })
    local r = run(c, "r9", { op = "screenshot" }, false)
    eq(r.ok, true)
    eq(renderer.lastView, "hero")
    eq(renderer.lastWidth, 288)
    eq(renderer.lastHeight, 180)
    c:destroy()
end)

spec("capability report is operation-derived and reports live generation availability", function()
    local function byOp(report, wanted)
        for _, item in report.operations do if item.op == wanted then return item end end
        return nil
    end

    local unavailable = newCommands()
    local report = Commands.capabilities(unavailable)
    eq(report.schema, "golem.studio-ops.v1")
    eq(byOp(report, "get_tree").status, "supported")
    eq(byOp(report, "snapshot").status, "supported")
    eq(byOp(report, "restore").status, "supported")
    eq(byOp(report, "undo_waypoint").status, "supported")
    eq(byOp(report, "run_code").status, "unsupported")
    has(byOp(report, "run_code").reason, "no constrained plugin evaluator")
    eq(byOp(report, "run_mode").status, "supported")
    eq(byOp(report, "inspect_model").status, "supported")
    eq(byOp(report, "project_census").status, "supported")
    eq(byOp(report, "generate_model").status, "unsupported")
    for index = 2, #report.operations do
        eq(report.operations[index - 1].op < report.operations[index].op, true, "capabilities are deterministic")
    end
    unavailable:destroy()

    local generation = fakeGeneration()
    local available = newCommands({ generation = generation })
    eq(byOp(Commands.capabilities(available), "generate_model").status, "supported")
    available:destroy()

    local probed = fakeGeneration()
    function probed:probe() return { available = false, reason = "DynamicGeneration is temporarily unavailable" } end
    local probedCommands = newCommands({ generation = probed })
    eq(byOp(Commands.capabilities(probedCommands), "generate_model").status, "supported", "temporary native availability stays runtime-scoped")
    probedCommands:destroy()
end)

spec("3D generation performs provider work detached then commits one placement recording", function()
    local before = #history.log
    local adapter = fakeGeneration({ assertNoRecording = true })
    local c = newCommands({ generation = adapter })
    local generated = run(c, "generation-commit", {
        op = "generate_model", prompt = "low-poly wooden crate", intent = "crate",
        maxTriangles = 1200, predefinedSchema = "Body1", parent = "game.Workspace",
    }, true, function() return true end)
    eq(generated.ok, true, tostring(generated.error)); eq(adapter.calls, 1)
    eq(generated.data.sessionScoped, true); eq(generated.data.qc.verdict, "pass"); eq(generated.data.qc.visualJudgementRequired, true)
    has(generated.data.path, "Apple Generated Model")
    local placed = adapter.lastModel
    eq(placed, adapter.lastModel); eq(placed.Parent, workspace)
    eq(#history.log, before + 2, "generation must create exactly one recording")
    has(history.log[before + 1], "begin:Apple generate_model generation-commit")
    eq(history.log[before + 2], "Commit")
    eq(history.recording, nil)
    placed:Destroy(); c:destroy(); eq(adapter.destroyed, true)
end)

spec("generation discards detached results when consent or destination validity changes", function()
    local before = #history.log
    local live = true
    local consentAdapter = fakeGeneration({
        onGenerate = function(current)
            eq(current(), true, "consent must be live at provider start")
            live = false
        end,
    })
    local consentCommands = newCommands({ generation = consentAdapter })
    local denied = run(consentCommands, "generation-disconnect", { op = "generate_model", prompt = "crate", parent = "game.Workspace" }, true, function() return live end)
    eq(denied.ok, false); eq(denied.failure, "refused"); eq(#consentAdapter.discarded, 1); eq(consentAdapter.lastModel.__destroyed, true)
    eq(#history.log, before, "revoked consent must prevent any recording")
    consentCommands:destroy()

    local destination = Instance.new("Folder"); destination.Name = "GenerationDestination"; destination.Parent = workspace
    local destinationAdapter = fakeGeneration({ onGenerate = function() destination:Destroy() end })
    local destinationCommands = newCommands({ generation = destinationAdapter })
    local moved = run(destinationCommands, "generation-destination", { op = "generate_model", prompt = "crate", parent = "game.Workspace.GenerationDestination" }, true, function() return true end)
    eq(moved.ok, false); eq(moved.failure, "conflict"); eq(destinationAdapter.lastModel.__destroyed, true)
    eq(#history.log, before, "changed destination must prevent any recording")
    destinationCommands:destroy()
end)

spec("generation cancels or refuses placement failures and destroys the result", function()
    local adapter = fakeGeneration()
    local c = newCommands({ generation = adapter })
    local before = #history.log
    history.refuse = true
    local busy = run(c, "generation-history-busy", { op = "generate_model", prompt = "crate", parent = "game.Workspace" }, true, function() return true end)
    history.refuse = false
    eq(busy.ok, false); eq(busy.failure, "conflict"); eq(adapter.lastModel.__destroyed, true); eq(#history.log, before)

    history.finishError = true
    local failedCommit = run(c, "generation-commit-failure", { op = "generate_model", prompt = "crate", parent = "game.Workspace" }, true, function() return true end)
    eq(failedCommit.ok, false); eq(failedCommit.failure, "internal"); eq(adapter.lastModel.__destroyed, true)
    eq(history.recording, nil); eq(history.log[#history.log], "Cancel")
    c:destroy()
end)

spec("generation cancels the recording if consent ends immediately before commit", function()
    local adapter = fakeGeneration()
    local c = newCommands({ generation = adapter })
    local checks = 0
    local function current()
        checks += 1
        return checks < 4
    end
    local before = #history.log
    local result = run(c, "generation-placement-disconnect", {
        op = "generate_model", prompt = "crate", parent = "game.Workspace",
    }, true, current)
    eq(result.ok, false); eq(result.failure, "refused")
    eq(adapter.lastModel.__destroyed, true); eq(adapter.lastModel.Parent, nil)
    eq(#history.log, before + 2, "placement cancellation must finish its one opened recording")
    has(history.log[before + 1], "begin:Apple generate_model generation-placement-disconnect")
    eq(history.log[before + 2], "Cancel")
    eq(history.recording, nil)
    c:destroy()
end)

spec("history refusal and destroy are visible", function()
    local c = newCommands(); history.refuse = true
    local r = run(c, "busy", { op = "create_instances", items = {{ className = "Part", name = "Busy", parent = "game.Workspace" }} }, true)
    eq(r.ok, false); eq(r.failure, "conflict"); history.refuse = false; c:destroy()
    eq(run(c, "dead", { op = "ping" }, false).ok, false)
end)

report()
`;

function available() {
  try { execFileSync('luau', ['--help'], { stdio: 'pipe' }); return true; } catch { return false; }
}
function runLuau(source = SOURCE) {
  const dir = mkdtempSync(join(tmpdir(), 'apple-commands-'));
  const file = join(dir, 'commands.gen.luau');
  writeFileSync(file, PRELUDE + '\nlocal Commands = (function()\n' + source + '\nend)()\n' + SPEC);
  try { return { status: 0, output: execFileSync('luau', [file], { encoding: 'utf8', stdio: 'pipe' }) }; }
  catch (error) { return { status: error.status ?? 1, output: String(error.stdout ?? '') + String(error.stderr ?? '') }; }
}

test('new command engine passes executable Studio-mock suite', { skip: available() ? false : 'luau is not on PATH' }, () => {
  const result = runLuau();
  assert.match(result.output, /^commands: (\d+) passed$/m, 'suite did not report a clean run:\n' + result.output);
  const report = /^commands: (\d+) passed$/m.exec(result.output);
  assert.ok(report && Number(report[1]) >= 8, 'too few assertions ran:\n' + result.output);
  assert.equal(result.status, 0, result.output);
});

test('mutation-consent guard is live (red-first falsification)', { skip: available() ? false : 'luau is not on PATH' }, () => {
  // THE ANCHOR IS A SHAPE, NOT A LINE. It used to be the exact literal of the consent check,
  // trailing `started)` and all, and it broke the moment that call gained a remedy argument —
  // loudly, with "falsification anchor must occur once", which is the right way for a
  // spelling-pinned guard to die. The property being falsified never involved the argument list:
  // it is that the MUTATING branch contains exactly one consent check and that inverting it makes
  // the executable suite fail. Matched up to the end of the call so a further argument does not
  // retire the guard again, and still asserted UNIQUE so a second consent check cannot hide here.
  // It died loudly a second time when the edit-mode check moved in front of the consent check, so
  // the anchor now spans BOTH gates — which is also what lets the order test below aim at it.
  const anchor = /\t\tif MUTATING\[name\] or DEFERRED_MUTATING\[name\] or CONSENT_ONLY\[name\] then\n\t\t\tif not editMode\(\) then return failureResult\([^\n]*?\) end\n\t\t\tif allowEdits ~= true then return failureResult\([^\n]*?\) end/;
  const found = SOURCE.match(new RegExp(anchor, 'g')) ?? [];
  assert.equal(found.length, 1, 'falsification anchor must occur once');
  const broken = SOURCE.replace(anchor, (m) => m.replace('~= true', '== true'));
  assert.notEqual(broken, SOURCE, 'the mutation did not land — re-aim it before trusting this test');
  const result = runLuau(broken);
  assert.notEqual(result.status, 0, 'the intentionally broken mutation guard stayed green:\n' + result.output);

  // THE ORDER OF THE TWO GATES IS ITSELF THE BEHAVIOUR, and it is invisible to every test that
  // shuts one gate at a time — with only one gate shut, either order answers the same. So this
  // falsifies the order directly: put the consent check back in front, which is how the file
  // shipped, and the play-mode spec must go red. If it stays green the order is not being tested
  // and the customer is one refactor away from being told to press a button that refuses.
  const swapped = SOURCE.replace(anchor, (m) => {
    const lines = m.split('\n');
    return [lines[0], lines[2], lines[1]].join('\n');
  });
  assert.notEqual(swapped, SOURCE, 'the order mutation did not land — re-aim it before trusting this test');
  const swappedResult = runLuau(swapped);
  assert.notEqual(swappedResult.status, 0, 'consent-before-edit-mode stayed green:\n' + swappedResult.output);
});

test('every dispatcher branch binds the handler remedy, including Studio-state controls', () => {
  // WHY THIS IS A SOURCE ASSERTION AND NOT A BEHAVIOURAL ONE, said plainly rather than left to be
  // inferred: `execute` binds the handler's return in three places — the special run_mode Studio
  // state-control branch, the read/consent-only branch and the recorded-write branch — and today no READ handler produces a remedy, so nothing can be
  // executed that would notice the read branch narrowing back to three values. That is exactly the
  // condition the three unreachable remedies grew in: a slot nobody could observe, discovered only
  // when a refusal arrived with nothing in it. So the shape is pinned here until a read-side remedy
  // exists to pin it behaviourally, and the failure message says which branch lost the value.
  const branches = SOURCE.match(/local result, resultKind, resultMessage(, resultRemedy)? = handler\(self, op\)/g) ?? [];
  assert.equal(branches.length, 3, 'execute should call the handler in exactly three branches');
  for (const branch of branches) {
    assert.match(branch, /resultRemedy/, 'a dispatcher branch stopped binding the handler remedy: ' + branch);
  }
  const passed = SOURCE.match(/return result, resultKind, resultMessage, resultRemedy/g) ?? [];
  assert.equal(passed.length, 3, 'a dispatcher branch bound the remedy and then dropped it on the way out');
});

test('restore removal stays undoable for ChangeHistory', () => {
  const match = /local function clearRestoreRoot\([\s\S]*?\nend\n\nlocal function preflightDeletable/.exec(SOURCE);
  assert.ok(match, 'clearRestoreRoot implementation was not found');
  const clearRestoreRoot = match[0];
  assert.doesNotMatch(
    clearRestoreRoot,
    /:Destroy\(\)/,
    'Instance:Destroy() locks Parent and prevents ChangeHistory Undo/Cancel from restoring the pre-restore instance',
  );
  assert.match(clearRestoreRoot, /child\.Parent\s*=\s*nil/, 'restore must remove authored instances by parenting to nil so ChangeHistory can restore them');
});
