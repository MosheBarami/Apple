import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const worker = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'apple-ui-objectives-'));
const bundle = join(dir, 'ui.mjs');
execFileSync(join(worker, 'node_modules/.bin/esbuild'), [join(worker, 'src/ui-kit.ts'), '--bundle', '--format=esm', `--outfile=${bundle}`], { stdio: 'pipe' });
const { APPLE_UI_SOURCE: source } = await import(pathToFileURL(bundle).href);
const prelude = readFileSync(join(worker, 'tests/fixtures/apple-ui-runtime.luau'), 'utf8');
let sequence = 0;
function run(body, code = source) {
  const path = join(dir, `${sequence++}.luau`);
  writeFileSync(path, `${prelude}\nlocal UI = (function()\n${code}\nend)()\n${body}`);
  return execFileSync('luau', [path], { encoding: 'utf8', stdio: 'pipe' });
}
function mutate(needle, replacement) {
  assert.equal(source.split(needle).length, 2, 'mutation must hit exactly once');
  return source.replace(needle, replacement);
}

test('objectives are opt-in and do not invent completion from a full progress bar', () => {
  run(`local ui = UI.mount(playerGui)
    assert(find(ui.gui, "Objectives").Visible == false)
    ui:setObjectives({{ id = "lap", title = "Finish the course", current = 5, target = 5 }})
    assert(find(ui.gui, "Objectives").Visible == true)
    assert(find(ui.gui, "ProgressFill").Size[1] == 1)
    assert(find(ui.gui, "ObjectiveProgress").Text == "5 / 5")
    ui:setObjectives({{ id = "lap", title = "Finish the course", completed = true }})
    assert(find(ui.gui, "ObjectiveProgress").Text == "Completed")
    assert(find(ui.gui, "ProgressTrack").Visible == false)
    ui:setObjectives({{ id = "lap", title = "Finish the course" }})
    assert(find(ui.gui, "ObjectiveProgress").Text == "Progress unavailable")
    ui:setObjectives({})
    assert(find(ui.gui, "Objectives").Visible == false)`);
});

test('objective replacement rejects nonfinite, sparse, duplicate and overflowing state atomically', () => {
  run(`local ui = UI.mount(playerGui)
    ui:setObjectives({{id="a", title="Observed", current=1, target=4}})
    local old = find(ui.gui, "Objective_1")
    for _, pair in ipairs({{0/0, 4}, {1, math.huge}, {-1, 4}, {5, 4}, {1, 0}}) do
        assert(not pcall(function() ui:setObjectives({{id="b", title="Bad", current=pair[1], target=pair[2]}}) end))
        assert(find(ui.gui, "Objective_1") == old)
    end
    assert(not pcall(function() ui:setObjectives({[2]={id="a", title="Gap"}}) end))
    assert(not pcall(function() ui:setObjectives({{id="a", title="A"}, {id="a", title="B"}}) end))
    assert(not pcall(function() ui:setObjectives(setmetatable({}, {})) end))
    assert(not pcall(function() ui:setObjectives({{id="a",title="A",completed="true"}}) end))
    local tooMany = {}; for i=1,9 do tooMany[i] = {id=tostring(i),title="A"} end
    assert(not pcall(function() ui:setObjectives(tooMany) end))
    assert(find(ui.gui, "Objective_1") == old)
    assert(find(ui.gui, "ProgressFill").Size[1] == 0.25)`);
});

test('bounded notices retain FIFO order, expose refusal at capacity and expire without stealing focus', () => {
  const body = `local ui = UI.mount(playerGui, {reducedMotion=true})
    local selection = Instance.new("TextButton"); selection.Parent = playerGui
    services.GuiService.SelectedObject = selection
    for i=1,5 do assert(ui:notify("Notice " .. i, "info", 2)) end
    assert(ui:notify("Overflow", "error", 2) == false)
    assert(find(ui.gui, "NotificationText").Text == "Notice 1")
    assert(services.GuiService.SelectedObject == selection)
    for i=2,5 do
        services.RunService.Heartbeat:Fire(2)
        assert(find(ui.gui, "NotificationText").Text == "Notice " .. i)
    end
    services.RunService.Heartbeat:Fire(2)
    assert(find(ui.gui, "Notification").Visible == false)
    assert(services.TweenService.plays == 0)`;
  run(body);
  assert.throws(() => run(body, mutate('if #notices >= 5 then return false end', 'if #notices >= 50 then return false end')));
});

test('modal hides objectives and pauses notice lifetime without resetting it on close', () => {
  run(`local ui = UI.mount(playerGui)
    ui:setObjectives({{id="a",title="Goal"}})
    ui:notify("Message", "info", 5)
    services.RunService.Heartbeat:Fire(3)
    ui:open()
    assert(find(ui.gui, "Objectives").Visible == false)
    assert(find(ui.gui, "Notification").Visible == false)
    services.RunService.Heartbeat:Fire(99)
    ui:close()
    assert(find(ui.gui, "Objectives").Visible == true)
    assert(find(ui.gui, "Notification").Visible == true)
    services.RunService.Heartbeat:Fire(2)
    assert(find(ui.gui, "Notification").Visible == false)`);
});

test('notification validation cannot poison the queue or timer', () => {
  run(`local ui = UI.mount(playerGui)
    ui:notify("Retained", "success", 2)
    for _, duration in ipairs({0, -1, 0/0, math.huge, 13}) do
        assert(not pcall(function() ui:notify("Bad", "info", duration) end))
    end
    assert(not pcall(function() ui:notify("Bad", "grant") end))
    assert(not pcall(function() ui:notify(10) end))
    assert(not pcall(function() ui:notify("") end))
    assert(find(ui.gui, "NotificationText").Text == "Retained")
    assert(find(ui.gui, "NotificationKind").Text == "Confirmed")
    services.RunService.Heartbeat:Fire(0/0)
    services.RunService.Heartbeat:Fire(-1)
    assert(find(ui.gui, "Notification").Visible == true)
    services.RunService.Heartbeat:Fire(2)
    assert(find(ui.gui, "Notification").Visible == false)`);
});

test('UTF-8 display truncation preserves whole characters and plain text', () => {
  run(`local ui = UI.mount(playerGui)
    local emoji = utf8.char(0x1F680)
    ui:setObjectives({{id="a", title=string.rep(emoji, 100)}})
    assert(utf8.len(find(ui.gui, "ObjectiveTitle").Text) == 80)
    assert(find(ui.gui, "ObjectiveTitle").AutomaticSize == Enum.AutomaticSize.Y)
    assert(find(ui.gui, "Objective_1").AutomaticSize == Enum.AutomaticSize.Y)
    ui:notify("<b>" .. string.rep(emoji, 200), "error")
    assert(utf8.len(find(ui.gui, "NotificationText").Text) == 160)
    assert(find(ui.gui, "NotificationText").RichText == false)
    assert(find(ui.gui, "NotificationText").AutomaticSize == Enum.AutomaticSize.Y)
    assert(find(ui.gui, "NotificationKind").Text == "Not completed")
    ui:setBalance(string.rep(emoji, 70))
    assert(utf8.len(find(ui.gui, "Balance").Text) == 60)`);
});

test('clear, external destruction and repeated remount do not retain a clock or queued notice', () => {
  const body = `for i=1,3 do
        local ui = UI.mount(playerGui)
        ui:notify("One"); ui:notify("Two")
        assert(ui:clearNotifications())
        assert(find(ui.gui, "Notification").Visible == false)
        ui:notify("Pending")
        assert(services.RunService.Heartbeat:count() == 1)
        ui.gui:Destroy()
        assert(services.RunService.Heartbeat:count() == 0)
        assert(ui:notify("Late") == false and ui:setObjectives({}) == false and ui:clearNotifications() == false)
        services.RunService.Heartbeat:Fire(30)
    end`;
  run(body);
  assert.throws(() => run(body, mutate('disconnect(connections)', '-- deliberately leak global connections')));
});

test('shop arrays share the strict bounded-array contract and invalid replacement preserves old cards', () => {
  run(`local ui = UI.mount(playerGui)
    ui:setItems({{id="a", name="A"}})
    local old = find(ui.gui, "Item_1")
    assert(not pcall(function() ui:setItems({[2]={id="b"}}) end))
    assert(not pcall(function() ui:setItems({extra={id="b"}}) end))
    assert(not pcall(function() ui:setItems(setmetatable({}, {})) end))
    assert(find(ui.gui, "Item_1") == old)`);
});
