import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const worker = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'apple-ui-'));
const bundle = join(dir, 'prefabs.mjs');
execFileSync(join(worker, 'node_modules/.bin/esbuild'), [join(worker, 'src/prefabs.ts'), '--bundle', '--format=esm', `--outfile=${bundle}`], { stdio: 'pipe' });
const { PREFABS } = await import(`file://${bundle}`);
const source = PREFABS.ui_kit.source;
const prelude = readFileSync(join(worker, 'tests/fixtures/apple-ui-runtime.luau'), 'utf8');
let counter = 0;
function run(body, code = source) {
  const path = join(dir, `${counter++}.luau`);
  writeFileSync(path, `${prelude}\nlocal UI = (function()\n${code}\nend)()\n${body}\nprint("UI-OK")`);
  return execFileSync('luau', [path], { encoding: 'utf8', stdio: 'pipe' });
}
const items = 'ui:setItems({{ id = "speed", name = "Speed", price = "100 Coins" }})';

test('UI kit is a self-contained client module in the install catalogue', () => {
  assert.equal(PREFABS.ui_kit.defaultParent, 'game.ReplicatedStorage');
  assert.equal(PREFABS.ui_kit.className, 'ModuleScript');
  assert.doesNotMatch(source, /https?:|rbxassetid:|FireServer|InvokeServer|SetAsync|ProcessReceipt/);
  assert.match(run('local ui = UI.mount(playerGui); assert(ui.gui.Parent == playerGui)'), /UI-OK/);
});

test('safe-area layout, scrolling, plain text and unknown balance are configured', () => {
  run(`local ui = UI.mount(playerGui)
    assert(ui.gui.ScreenInsets == Enum.ScreenInsets.CoreUISafeInsets)
    assert(ui.gui.ResetOnSpawn == false)
    assert(find(ui.gui, "Items").AutomaticCanvasSize == Enum.AutomaticSize.Y)
    assert(find(ui.gui, "Balance").Text == "—", "unobserved balance is not zero")
    ui:setBalance("<b>50</b>")
    assert(find(ui.gui, "Balance").RichText == false)
    assert(find(ui.gui, "ShopOverlay").Visible == false)`);
});

test('mount refuses duplicate screens, server execution and wrong parents', () => {
  run(`local ui = UI.mount(playerGui)
    assert(not pcall(UI.mount, playerGui))
    assert(not pcall(UI.mount, Instance.new("Folder")))
    services.RunService.IsClient = function() return false end
    assert(not pcall(UI.mount, Instance.new("PlayerGui")))
    assert(#playerGui.children == 1)`);
});

test('an unwired shop is explicitly unavailable and never invokes a fake purchase', () => {
  run(`local ui = UI.mount(playerGui); ${items}; ui:open()
    assert(find(ui.gui, "Choose").Active == false)
    assert(find(ui.gui, "Status").Text == "Shop is not connected yet.")
    find(ui.gui, "Choose").Activated:Fire()
    assert(find(ui.gui, "Status").Text == "Shop is not connected yet.")`);
});

test('a HUD-only game does not get an unsolicited shop button', () => {
  run(`local ui = UI.mount(playerGui, { showShop = false })
    assert(find(ui.gui, "OpenShop").Visible == false)
    assert(find(ui.gui, "ShopOverlay").Visible == false)`);
});

test('requests pass only the id, wait for confirmation and do not invent a balance', () => {
  run(`local calls = 0
    local ui = UI.mount(playerGui, { onRequest = function(...)
        assert(select("#", ...) == 1 and (...) == "speed")
        calls += 1; return true, "Speed unlocked"
    end })
    ${items}; ui:open(); find(ui.gui, "Choose").Activated:Fire()
    assert(calls == 1 and find(ui.gui, "Status").Text == "Speed unlocked")
    assert(find(ui.gui, "Balance").Text == "—")`);
});

test('pending requests block duplicate activation and item replacement', () => {
  const body = `local calls = 0
    local ui = UI.mount(playerGui, { onRequest = function() calls += 1; coroutine.yield(); return true end })
    ${items}; ui:open()
    local choose = find(ui.gui, "Choose")
    local pending = coroutine.create(function() choose.Activated:Fire() end)
    assert(coroutine.resume(pending))
    assert(find(ui.gui, "Status").Text == "Waiting for server…")
    assert(choose.Active == false and ui:setItems({}) == false)
    choose.Activated:Fire()
    assert(calls == 1, "duplicate request escaped pending guard")
    assert(coroutine.resume(pending))
    assert(choose.Active == true)`;
  run(body);
  // Falsification of the actual behavioral guard, without changing the shared checkout.
  const needle = 'if not alive or not opened or busy or item.disabled or not options.onRequest then return end';
  assert.equal(source.split(needle).length, 2);
  assert.throws(() => run(body, source.replace(needle, needle.replace('or busy ', ''))));
});

test('errors and refused requests never claim success and re-enable retry', () => {
  run(`local attempts = 0
    local ui = UI.mount(playerGui, { onRequest = function()
      attempts += 1
      if attempts == 1 then error("private server exception") end
      return false, "Not enough coins"
    end })
    ${items}; ui:open()
    find(ui.gui, "Choose").Activated:Fire()
    assert(find(ui.gui, "Status").Text == "Request failed. Try again.")
    assert(find(ui.gui, "Choose").Active == true)
    find(ui.gui, "Choose").Activated:Fire()
    assert(find(ui.gui, "Status").Text == "Not enough coins")`);
});

test('invalid replacement preserves displayed items and item events are disconnected', () => {
  run(`local calls = 0
    local ui = UI.mount(playerGui, { onRequest = function() calls += 1; return true end })
    ${items}; ui:open()
    local old = find(ui.gui, "Choose")
    assert(not pcall(function() ui:setItems({{id="x"}, {id="x"}}) end))
    assert(find(ui.gui, "Choose") == old)
    ui:setItems({})
    old.Activated:Fire()
    assert(calls == 0 and old.Activated:count() == 0)
    assert(find(ui.gui, "Empty").Visible == true)`);
});

test('controller close restores gamepad focus and respects reduced motion', () => {
  run(`services.UserInputService.GamepadEnabled = true
    local prior = Instance.new("TextButton"); prior.Parent = playerGui
    services.GuiService.SelectedObject = prior
    local ui = UI.mount(playerGui, { reducedMotion = true })
    ui:open()
    assert(services.GuiService.SelectedObject == find(ui.gui, "CloseShop"))
    assert(services.TweenService.plays == 0)
    services.UserInputService.InputBegan:Fire({ KeyCode = Enum.KeyCode.ButtonB }, false)
    assert(find(ui.gui, "ShopOverlay").Visible == false)
    assert(services.GuiService.SelectedObject == prior)`);
});

test('destroy disconnects global input and ignores a late server result', () => {
  run(`local ui = UI.mount(playerGui, { onRequest = function() coroutine.yield(); return true end })
    ${items}; ui:open()
    local pending = coroutine.create(function() find(ui.gui, "Choose").Activated:Fire() end)
    assert(coroutine.resume(pending))
    assert(ui:destroy() == true and ui:destroy() == false)
    assert(services.UserInputService.InputBegan:count() == 0)
    assert(#playerGui.children == 0)
    assert(coroutine.resume(pending), "late callback wrote to destroyed UI")
    assert(ui:setBalance(999) == false and ui:open() == false)`);
});

test('external screen destruction also disposes global input and controller state', () => {
  run(`local ui = UI.mount(playerGui); ui:open()
    ui.gui:Destroy()
    assert(services.UserInputService.InputBegan:count() == 0)
    assert(ui:open() == false and ui:destroy() == false)`);
});

test('closed or disabled choices cannot send requests, including programmatic activation', () => {
  run(`local calls = 0
    local ui = UI.mount(playerGui, { onRequest = function() calls += 1; return true end })
    ${items}
    find(ui.gui, "Choose").Activated:Fire()
    ui:setItems({{id="speed", disabled=true}}); ui:open()
    find(ui.gui, "Choose").Activated:Fire()
    assert(calls == 0)`);
});
