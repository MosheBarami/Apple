// Paired proof for every Roblox anti-pattern rule.
//
// A rule that has never been seen to fire is indistinguishable from one that is wired up wrong: a
// typo in its regex makes it silently pass everything, and the eval score goes UP. So every rule
// carries two samples — one that must fire it and one that must not — and a meta-test fails the
// suite if a rule ships without that pair.
//
// The samples are deliberately short, realistic Roblox code rather than minimal regex bait: the
// point is that the rule survives contact with the surrounding idiom (a pcall wrapper, a nested
// closure, a for loop) and not just with the token it looks for.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  RULES,
  RULE_IDS,
  analyzeLuau,
  blockEnd,
  checkNoAntipattern,
  fired,
  inferContext,
  stripComments,
  blankStringContents,
  looksLikeTest,
} from './roblox-antipatterns.mjs';

// context is stated explicitly so a fire/no-fire assertion measures the RULE, not the accuracy of
// context inference — that is tested separately below.
const SAMPLES = {
  'remote-function-to-client': {
    context: 'server',
    bad: `local remote = game:GetService("ReplicatedStorage"):WaitForChild("AskConfirm", 5)
game:GetService("Players").PlayerAdded:Connect(function(player)
\tlocal answer = remote:InvokeClient(player, "ready?")
\tprint(player.Name, answer)
end)
`,
    good: `local remote = game:GetService("ReplicatedStorage"):WaitForChild("Confirm", 5)
remote.OnServerEvent:Connect(function(player, choice)
\tif typeof(choice) ~= "boolean" then
\t\treturn
\tend
\tprint(player.Name, choice)
end)
remote:FireClient(game:GetService("Players"):GetPlayers()[1], "ready?")
`,
  },

  'client-authoritative-currency': {
    context: 'client',
    bad: `local player = game:GetService("Players").LocalPlayer
local coins = player:WaitForChild("leaderstats", 10):WaitForChild("Coins", 10)
script.Parent.Activated:Connect(function()
\tcoins.Value = coins.Value + 100
end)
`,
    good: `local player = game:GetService("Players").LocalPlayer
local label = script.Parent
local coins = player:WaitForChild("leaderstats", 10):WaitForChild("Coins", 10)
local function render()
\tlabel.Text = string.format("%d coins", coins.Value)
end
coins.Changed:Connect(render)
render()
`,
  },

  'server-trusts-client-amount': {
    context: 'server',
    bad: `local remote = game:GetService("ReplicatedStorage"):WaitForChild("Buy", 5)
remote.OnServerEvent:Connect(function(player, price)
\tif typeof(price) ~= "number" then
\t\treturn
\tend
\tlocal coins = player.leaderstats.Coins
\tcoins.Value = coins.Value - price
end)
`,
    good: `local PRICES = { sword = 100, shield = 250 }
local remote = game:GetService("ReplicatedStorage"):WaitForChild("Buy", 5)
remote.OnServerEvent:Connect(function(player, itemId)
\tif typeof(itemId) ~= "string" then
\t\treturn
\tend
\tlocal price = PRICES[itemId]
\tif price == nil then
\t\treturn
\tend
\tlocal coins = player.leaderstats.Coins
\tif coins.Value < price then
\t\treturn
\tend
\tcoins.Value = coins.Value - price
end)
`,
  },

  'unvalidated-remote-arg': {
    context: 'server',
    bad: `local remote = game:GetService("ReplicatedStorage"):WaitForChild("Rename", 5)
remote.OnServerEvent:Connect(function(player, newName)
\tplayer:SetAttribute("DisplayName", newName)
end)
`,
    good: `local remote = game:GetService("ReplicatedStorage"):WaitForChild("Rename", 5)
remote.OnServerEvent:Connect(function(player, newName)
\tif typeof(newName) ~= "string" or #newName > 20 then
\t\treturn
\tend
\tplayer:SetAttribute("DisplayName", newName)
end)
`,
  },

  'busy-wait-loop': {
    context: 'server',
    bad: `local score = 0
while true do
\tscore += 1
\tif score > 1000 then
\t\tscore = 0
\tend
end
`,
    good: `local score = 0
while true do
\tscore += 1
\tif score > 1000 then
\t\tscore = 0
\tend
\ttask.wait(1)
end
`,
  },

  'unbounded-wait-for-child': {
    context: 'server',
    bad: `local ring = workspace:WaitForChild("Ring")
ring.Touched:Connect(function()
\tprint("scored")
end)
`,
    good: `local ring = workspace:WaitForChild("Ring", 10)
if ring then
\tring.Touched:Connect(function()
\t\tprint("scored")
\tend)
else
\twarn("Ring never replicated")
end
`,
  },

  'datastore-without-pcall': {
    context: 'server',
    bad: `local store = game:GetService("DataStoreService"):GetDataStore("Coins")
game:GetService("Players").PlayerRemoving:Connect(function(player)
\tstore:SetAsync(player.UserId, player:GetAttribute("Coins"))
end)
game:BindToClose(function() end)
`,
    good: `local store = game:GetService("DataStoreService"):GetDataStore("Coins")
local function save(userId, coins)
\tfor attempt = 1, 3 do
\t\tlocal ok, err = pcall(function()
\t\t\tstore:UpdateAsync(userId, function()
\t\t\t\treturn coins
\t\t\tend)
\t\tend)
\t\tif ok then
\t\t\treturn true
\t\tend
\t\twarn(\`save attempt {attempt} failed: {err}\`)
\t\ttask.wait(2 ^ attempt)
\tend
\treturn false
end
game:GetService("Players").PlayerRemoving:Connect(function(player)
\tsave(player.UserId, player:GetAttribute("Coins"))
end)
game:BindToClose(function() end)
`,
  },

  'datastore-without-retry': {
    context: 'server',
    bad: `local store = game:GetService("DataStoreService"):GetDataStore("Coins")
local function save(userId, coins)
\tlocal ok, err = pcall(function()
\t\tstore:UpdateAsync(userId, function()
\t\t\treturn coins
\t\tend)
\tend)
\tif not ok then
\t\twarn(err)
\tend
\treturn ok
end
game:BindToClose(function() end)
return save
`,
    good: `local store = game:GetService("DataStoreService"):GetDataStore("Coins")
local function save(userId, coins)
\tlocal attempts = 0
\tlocal ok, err
\trepeat
\t\tattempts += 1
\t\tok, err = pcall(function()
\t\t\tstore:UpdateAsync(userId, function()
\t\t\t\treturn coins
\t\t\tend)
\t\tend)
\t\tif not ok then
\t\t\ttask.wait(2 ^ attempts)
\t\tend
\tuntil ok or attempts >= 3
\tif not ok then
\t\twarn(err)
\tend
\treturn ok
end
game:BindToClose(function() end)
return save
`,
  },

  'set-async-read-modify-write': {
    context: 'server',
    bad: `local store = game:GetService("DataStoreService"):GetDataStore("Coins")
local function addCoins(userId, delta)
\tlocal ok, current = pcall(function()
\t\treturn store:GetAsync(userId)
\tend)
\tif not ok then
\t\treturn false
\tend
\tlocal nextValue = (current or 0) + delta
\tlocal saved = pcall(function()
\t\tstore:SetAsync(userId, nextValue)
\tend)
\treturn saved
end
game:BindToClose(function() end)
return addCoins
`,
    good: `local store = game:GetService("DataStoreService"):GetDataStore("Coins")
local function addCoins(userId, delta)
\tfor attempt = 1, 3 do
\t\tlocal ok, err = pcall(function()
\t\t\tstore:UpdateAsync(userId, function(current)
\t\t\t\treturn (current or 0) + delta
\t\t\tend)
\t\tend)
\t\tif ok then
\t\t\treturn true
\t\tend
\t\twarn(\`attempt {attempt}: {err}\`)
\t\ttask.wait(attempt)
\tend
\treturn false
end
game:BindToClose(function() end)
return addCoins
`,
  },

  'yield-inside-currency-debit': {
    context: 'server',
    bad: `local PRICES = { sword = 100 }
local remote = game:GetService("ReplicatedStorage"):WaitForChild("Buy", 5)
remote.OnServerEvent:Connect(function(player, itemId)
\tif typeof(itemId) ~= "string" then
\t\treturn
\tend
\tlocal price = PRICES[itemId]
\tlocal coins = player.leaderstats.Coins
\tif price == nil or coins.Value < price then
\t\treturn
\tend
\tlocal tool = game:GetService("ServerStorage"):WaitForChild(itemId, 5)
\ttool:Clone().Parent = player.Backpack
\tcoins.Value = coins.Value - price
end)
`,
    good: `local PRICES = { sword = 100 }
local remote = game:GetService("ReplicatedStorage"):WaitForChild("Buy", 5)
local ServerStorage = game:GetService("ServerStorage")
remote.OnServerEvent:Connect(function(player, itemId)
\tif typeof(itemId) ~= "string" then
\t\treturn
\tend
\tlocal price = PRICES[itemId]
\tlocal coins = player.leaderstats.Coins
\tif price == nil or coins.Value < price then
\t\treturn
\tend
\tcoins.Value = coins.Value - price
\tlocal tool = ServerStorage:FindFirstChild(itemId)
\tif tool then
\t\ttool:Clone().Parent = player.Backpack
\tend
end)
`,
  },

  'no-session-lock': {
    context: 'server',
    bad: `local store = game:GetService("DataStoreService"):GetDataStore("Profiles")
game:GetService("Players").PlayerAdded:Connect(function(player)
\tlocal ok, data = pcall(function()
\t\treturn store:GetAsync(player.UserId)
\tend)
\tif ok then
\t\tplayer:SetAttribute("Coins", (data and data.coins) or 0)
\tend
end)
game:BindToClose(function() end)
`,
    good: `local store = game:GetService("DataStoreService"):GetDataStore("Profiles")
local function claim(userId)
\tfor attempt = 1, 3 do
\t\tlocal ok, profile = pcall(function()
\t\t\treturn store:UpdateAsync(userId, function(old)
\t\t\t\told = old or { coins = 0, owner = nil }
\t\t\t\tif old.owner ~= nil and old.owner ~= game.JobId then
\t\t\t\t\treturn nil
\t\t\t\tend
\t\t\t\told.owner = game.JobId
\t\t\t\treturn old
\t\t\tend)
\t\tend)
\t\tif ok and profile then
\t\t\treturn profile
\t\tend
\t\ttask.wait(attempt)
\tend
\treturn nil
end
game:GetService("Players").PlayerAdded:Connect(function(player)
\tlocal profile = claim(player.UserId)
\tif profile == nil then
\t\tplayer:Kick("Your save is still open on another server. Please rejoin.")
\t\treturn
\tend
\tplayer:SetAttribute("Coins", profile.coins)
end)
game:BindToClose(function() end)
`,
  },

  'no-bindtoclose-save': {
    context: 'server',
    bad: `local store = game:GetService("DataStoreService"):GetDataStore("Coins")
game:GetService("Players").PlayerRemoving:Connect(function(player)
\tfor attempt = 1, 3 do
\t\tlocal ok = pcall(function()
\t\t\tstore:UpdateAsync(player.UserId, function()
\t\t\t\treturn player:GetAttribute("Coins")
\t\t\tend)
\t\tend)
\t\tif ok then
\t\t\tbreak
\t\tend
\tend
end)
`,
    good: `local store = game:GetService("DataStoreService"):GetDataStore("Coins")
local function save(player)
\tfor attempt = 1, 3 do
\t\tlocal ok = pcall(function()
\t\t\tstore:UpdateAsync(player.UserId, function()
\t\t\t\treturn player:GetAttribute("Coins")
\t\t\tend)
\t\tend)
\t\tif ok then
\t\t\treturn
\t\tend
\t\ttask.wait(attempt)
\tend
end
game:GetService("Players").PlayerRemoving:Connect(save)
game:BindToClose(function()
\tfor _, player in game:GetService("Players"):GetPlayers() do
\t\ttask.spawn(save, player)
\tend
\ttask.wait(2)
end)
`,
  },

  'deprecated-api': {
    context: 'server',
    bad: `local part = script.Parent
spawn(function()
\twhile true do
\t\twait(1)
\t\tpart.Transparency = 0.5
\tend
end)
part.Touched:connect(function()
\tprint("hit")
end)
local mover = Instance.new("BodyVelocity")
mover.Parent = part
`,
    good: `local part = script.Parent
task.spawn(function()
\twhile true do
\t\ttask.wait(1)
\t\tpart.Transparency = 0.5
\tend
end)
part.Touched:Connect(function()
\tprint("hit")
end)
local mover = Instance.new("LinearVelocity")
mover.Parent = part
`,
  },

  'keyboard-only-input': {
    context: 'client',
    bad: `local UserInputService = game:GetService("UserInputService")
UserInputService.InputBegan:Connect(function(input, processed)
\tif processed then
\t\treturn
\tend
\tif input.KeyCode == Enum.KeyCode.E then
\t\tprint("interact")
\tend
end)
`,
    good: `local ContextActionService = game:GetService("ContextActionService")
local function onInteract(_, state)
\tif state == Enum.UserInputState.Begin then
\t\tprint("interact")
\tend
end
ContextActionService:BindAction("Interact", onInteract, true, Enum.KeyCode.E, Enum.KeyCode.ButtonX)
ContextActionService:SetTitle("Interact", "Use")
`,
  },

  'expensive-call-per-frame': {
    context: 'client',
    bad: `local RunService = game:GetService("RunService")
RunService.Heartbeat:Connect(function(dt)
\tfor _, part in workspace:GetChildren() do
\t\tpart.Transparency = math.clamp(part.Transparency + dt, 0, 1)
\tend
end)
`,
    good: `local RunService = game:GetService("RunService")
local parts = workspace:GetChildren()
RunService.Heartbeat:Connect(function(dt)
\tfor _, part in parts do
\t\tpart.Transparency = math.clamp(part.Transparency + dt, 0, 1)
\tend
end)
`,
  },

  'streaming-unsafe-descendant': {
    context: 'client',
    bad: `local door = workspace.Lobby.Door
door.Touched:Connect(function()
\tprint("entered")
end)
`,
    good: `local lobby = workspace:WaitForChild("Lobby", 20)
local door = lobby and lobby:WaitForChild("Door", 20)
if door then
\tdoor.Touched:Connect(function()
\t\tprint("entered")
\tend)
end
`,
  },

  //[[ The two rules extracted from canonical libraries, 2026-09-01. Both samples are the shapes
  //   the reviewer used to decide the rule was worth keeping, so the pairing contract below is
  //   also the record of what each rule was accepted for. ]]
  'process-receipt-without-purchase-id': {
    context: 'unknown',
    bad: `MarketplaceService.ProcessReceipt = function(receiptInfo)
\tlocal player = Players:GetPlayerByUserId(receiptInfo.PlayerId)
\tif player == nil then
\t\treturn Enum.ProductPurchaseDecision.NotProcessedYet
\tend
\tplayer.leaderstats.Coins.Value += PRODUCTS[receiptInfo.ProductId]
\treturn Enum.ProductPurchaseDecision.PurchaseGranted
end
`,
    good: `MarketplaceService.ProcessReceipt = function(receiptInfo)
\tlocal data = sessionData[receiptInfo.PlayerId]
\tif data == nil then
\t\treturn Enum.ProductPurchaseDecision.NotProcessedYet
\tend
\tif table.find(data.GrantedPurchaseIds, receiptInfo.PurchaseId) == nil then
\t\ttable.insert(data.GrantedPurchaseIds, receiptInfo.PurchaseId)
\t\tdata.Coins += PRODUCTS[receiptInfo.ProductId]
\tend
\tif savePlayerData(data) ~= true then
\t\treturn Enum.ProductPurchaseDecision.NotProcessedYet
\tend
\treturn Enum.ProductPurchaseDecision.PurchaseGranted
end
`,
  },
  'remote-parented-before-handler': {
    context: 'server',
    //[[ Both samples pcall the DataStore read and validate the remote argument. That is not
    //   padding: the pairing contract below requires a `good` sample to be good in EVERY respect,
    //   and the first version of this one tripped `datastore-without-pcall` and
    //   `unvalidated-remote-arg` while demonstrating correct remote ordering. A sample that is
    //   right about one rule and wrong about two others teaches the wrong lesson. ]]
    bad: `local buyRemote = Instance.new("RemoteEvent")
buyRemote.Name = "Buy"
buyRemote.Parent = ReplicatedStorage
local ok, shopConfig = pcall(function()
\treturn DataStoreService:GetDataStore("Shop"):GetAsync("Config")
end)
buyRemote.OnServerEvent:Connect(function(player, itemId)
\tif typeof(itemId) ~= "string" then
\t\treturn
\tend
\tgrant(player, ok and shopConfig[itemId] or nil)
end)
`,
    good: `local buyRemote = Instance.new("RemoteEvent")
buyRemote.Name = "Buy"
local ok, shopConfig = pcall(function()
\treturn DataStoreService:GetDataStore("Shop"):GetAsync("Config")
end)
buyRemote.OnServerEvent:Connect(function(player, itemId)
\tif typeof(itemId) ~= "string" then
\t\treturn
\tend
\tgrant(player, ok and shopConfig[itemId] or nil)
end)
buyRemote.Parent = ReplicatedStorage
`,
  },
  'range-check-admits-nan': {
    context: 'server',
    // Type-checked and range-checked, which is what "validated" usually means — and NaN
    // passes both, because every comparison against it is false.
    bad: `
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local scaleRemote = ReplicatedStorage:WaitForChild("SetScale", 5)
scaleRemote.OnServerEvent:Connect(function(player, scale)
\tif typeof(scale) ~= "number" then return end
\tif scale < 0.5 or scale > 4 then return end
\tlocal character = player.Character
\tif character then
\t\tcharacter:ScaleTo(scale)
\tend
end)
`,
    // The same handler with the guard the corpus source uses: a self-comparison rejects
    // NaN, and the upper bound already rejects infinity.
    good: `
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local scaleRemote = ReplicatedStorage:WaitForChild("SetScale", 5)
scaleRemote.OnServerEvent:Connect(function(player, scale)
\tif typeof(scale) ~= "number" or scale ~= scale then return end
\tif scale < 0.5 or scale > 4 then return end
\tlocal character = player.Character
\tif character then
\t\tcharacter:ScaleTo(scale)
\tend
end)
`,
  },
};

// ------------------------------------------------------------------ the pairing contract
test('every rule ships with a bad sample and a good sample', () => {
  const missing = RULE_IDS.filter((id) => !SAMPLES[id]?.bad || !SAMPLES[id]?.good);
  assert.deepEqual(missing, [], `rules with no proof of firing: ${missing.join(', ')}`);
  const orphans = Object.keys(SAMPLES).filter((id) => !RULE_IDS.includes(id));
  assert.deepEqual(orphans, [], `samples for rules that no longer exist: ${orphans.join(', ')}`);
});

for (const rule of RULES) {
  const s = SAMPLES[rule.id];
  if (!s) continue; // the meta-test above is the one that fails; do not double-report

  test(`${rule.id} fires on the bad sample`, () => {
    const res = analyzeLuau(s.bad, { context: s.context });
    assert.ok(fired(res, rule.id), `expected ${rule.id}; got ${JSON.stringify(res.findings.map((f) => f.rule))}`);
    const hit = res.findings.find((f) => f.rule === rule.id);
    assert.ok(hit.line >= 1, 'a finding must point at a line');
    assert.ok(hit.why.length > 20, 'a finding must carry the reason it exists');
  });

  test(`${rule.id} stays silent on the good sample`, () => {
    const res = analyzeLuau(s.good, { context: s.context });
    assert.ok(!fired(res, rule.id), `false positive: ${JSON.stringify(res.findings.filter((f) => f.rule === rule.id))}`);
  });
}

test('no good sample trips any error-severity rule', () => {
  // Cross-check: a rule can be individually clean and still be tripped by an unrelated sample,
  // which is how a too-broad regex escapes its own paired test. Warn-level findings are allowed —
  // the samples are minimal by design and some legitimately omit a retry or a BindToClose.
  const bad = [];
  for (const [id, s] of Object.entries(SAMPLES)) {
    const res = analyzeLuau(s.good, { context: s.context });
    for (const f of res.findings.filter((f) => f.severity === 'error')) bad.push(`${id}.good line ${f.line}: ${f.rule}`);
  }
  assert.deepEqual(bad, [], `error-severity false positives:\n  ${bad.join('\n  ')}`);
});

// ------------------------------------------------------------------ lexing
test('a rule cannot be fired by its own warning comment', () => {
  // Without comment stripping, a file documenting "-- never call wait() here, use task.wait" is
  // scored worse than one that says nothing — punishing exactly the code that got it right.
  const src = `-- Do not use wait() or spawn() in this file.
--[[ BodyVelocity is banned here. ]]
task.wait(1)
`;
  assert.deepEqual(analyzeLuau(src, { context: 'server' }).findings, []);
});

test('string contents are kept, because the dangerous shapes live inside strings', () => {
  const res = analyzeLuau('local mover = Instance.new("BodyVelocity")\n', { context: 'server' });
  assert.ok(fired(res, 'deprecated-api'), 'Instance.new("BodyVelocity") must still be caught');
});

test('a `--` inside a string does not swallow the rest of the line', () => {
  const src = 'local url = "https://example.com/a--b"\nlocal v = Instance.new("BodyGyro")\n';
  assert.ok(stripComments(src).includes('BodyGyro'));
  assert.ok(fired(analyzeLuau(src, { context: 'server' }), 'deprecated-api'));
});

test('stripComments preserves offsets so reported line numbers stay true', () => {
  const src = 'local a = 1 -- comment\nlocal b = 2\nspawn(function() end)\n';
  const stripped = stripComments(src);
  assert.equal(stripped.length, src.length);
  assert.equal(stripped.split('\n').length, src.split('\n').length);
  const res = analyzeLuau(src, { context: 'server' });
  assert.equal(res.findings.find((f) => f.rule === 'deprecated-api').line, 3);
});

test('blockEnd closes the right block through nested functions and loops', () => {
  const src = `local function outer()
\tfor i = 1, 3 do
\t\tif i == 2 then
\t\t\tlocal inner = function() end
\t\tend
\tend
end
print("after")
`;
  const end = blockEnd(src, src.indexOf('function outer'));
  assert.ok(src.slice(end).trimStart().startsWith('print("after")'), `block ended at ${JSON.stringify(src.slice(end, end + 20))}`);
});

// ------------------------------------------------------------------ context
test('context inference separates client files from server files', () => {
  assert.equal(inferContext('local p = game.Players.LocalPlayer\n'), 'client');
  assert.equal(inferContext('game:GetService("DataStoreService")\n'), 'server');
  assert.equal(inferContext('local t = {}\nreturn t\n'), 'unknown', 'a plain module must not be guessed at');
});

test('a context-scoped rule on the wrong side is reported as skipped, not as clean', () => {
  // Reporting "no findings" for a rule that never ran would let a task claim coverage the analyzer
  // never attempted — the exact way a benchmark starts lying about itself.
  const res = analyzeLuau(SAMPLES['client-authoritative-currency'].bad, { context: 'server' });
  assert.ok(res.skipped.includes('client-authoritative-currency'));
  assert.ok(!res.ruleIds.includes('client-authoritative-currency'));
});

// ------------------------------------------------------------------ grader entry point
test('checkNoAntipattern defaults to the error-severity rules only', () => {
  // The default must not deduct for style. `unbounded-wait-for-child` is a warn; a task that cares
  // about it opts in by naming it.
  const code = 'local ring = workspace:WaitForChild("Ring")\nprint(ring)\n';
  assert.equal(checkNoAntipattern(code, { context: 'server' }).passed, true);
  const opted = checkNoAntipattern(code, { context: 'server', rules: ['unbounded-wait-for-child'] });
  assert.equal(opted.passed, false);
  assert.match(opted.detail, /unbounded-wait-for-child/);
});

test('checkNoAntipattern fails an empty response instead of scoring it clean', () => {
  const r = checkNoAntipattern('');
  assert.equal(r.passed, false);
  assert.match(r.detail, /no code/);
});

test('an unknown rule id is a loud error, not a silently-passing check', () => {
  // A typo'd rule name in a task file used to be the cheapest way to make a check pass forever.
  const r = checkNoAntipattern('print(1)\n', { rules: ['no-such-rule'] });
  assert.equal(r.passed, false);
  assert.match(r.detail, /unknown anti-pattern rule/);
});

test('the pass detail says how many rules actually ran', () => {
  const r = checkNoAntipattern('local t = {}\nreturn t\n', { context: 'server' });
  assert.equal(r.passed, true);
  assert.match(r.detail, /rule\(s\) run as server/);
});


//[[ ============================================================================
//   THE TWO RULES EXTRACTED FROM CANONICAL LIBRARIES, 2026-09-01.
//
//   Nineteen were proposed from ProfileService, Janitor, roblox-lua-promise, Knit and
//   goodsignal; a reviewer whose default was to reject threw out seventeen, mostly for firing
//   on correct code. Both survivors carry a NARROWING the reviewer demanded, and the tests for
//   those narrowings matter more than the tests for the bad shapes — a rule that fires on the
//   exploit and also on the fix is a rule that gets switched off.
//   ============================================================================ ]]

const RECEIPT_NO_ID = `
MarketplaceService.ProcessReceipt = function(receiptInfo)
\tlocal player = Players:GetPlayerByUserId(receiptInfo.PlayerId)
\tif player == nil then return Enum.ProductPurchaseDecision.NotProcessedYet end
\tplayer.leaderstats.Coins.Value += PRODUCTS[receiptInfo.ProductId]
\treturn Enum.ProductPurchaseDecision.PurchaseGranted
end`;

const RECEIPT_WITH_LOG = `
MarketplaceService.ProcessReceipt = function(receiptInfo)
\tlocal data = sessionData[receiptInfo.PlayerId]
\tif table.find(data.GrantedPurchaseIds, receiptInfo.PurchaseId) == nil then
\t\ttable.insert(data.GrantedPurchaseIds, receiptInfo.PurchaseId)
\t\tdata.Coins += PRODUCTS[receiptInfo.ProductId]
\tend
\tif save(data) ~= true then return Enum.ProductPurchaseDecision.NotProcessedYet end
\treturn Enum.ProductPurchaseDecision.PurchaseGranted
end`;

/** The narrowing: a correct handler that delegates the idempotency check to a helper. A
 *  body-scoped search fires on this; a file-scoped search does not. */
const RECEIPT_DELEGATED = `
local function grantOnce(receiptInfo)
\tlocal key = receiptInfo.PlayerId .. "_" .. receiptInfo.PurchaseId
\tif granted[key] then return true end
\tgranted[key] = true
\treturn savePlayerData(key)
end

MarketplaceService.ProcessReceipt = function(receiptInfo)
\tif not grantOnce(receiptInfo) then return Enum.ProductPurchaseDecision.NotProcessedYet end
\treturn Enum.ProductPurchaseDecision.PurchaseGranted
end`;

test('a ProcessReceipt that never reads PurchaseId is a double-grant', () => {
  assert.ok(fired(analyzeLuau(RECEIPT_NO_ID), 'process-receipt-without-purchase-id'));
});

test('...and a PurchaseId log clears it', () => {
  assert.ok(!fired(analyzeLuau(RECEIPT_WITH_LOG), 'process-receipt-without-purchase-id'));
});

test('...and so does delegating the check to a helper in the same file', () => {
  // File-scoped, not body-scoped. ProfileService's own reference implementation delegates, so a
  // body-scoped rule would condemn the code it was derived from.
  assert.ok(!fired(analyzeLuau(RECEIPT_DELEGATED), 'process-receipt-without-purchase-id'));
});

test('the receipt rule is context-null, so a minimal handler file is not skipped', () => {
  // A bare ProcessReceipt file trips none of inferContext's server tokens and resolves to
  // 'unknown'. Scoping the rule to ['server'] would silently skip the one file it exists for.
  const res = analyzeLuau(RECEIPT_NO_ID);
  assert.equal(res.context, 'unknown');
  assert.ok(!res.skipped.includes('process-receipt-without-purchase-id'));
});

const REMOTE_PUBLISHED_EARLY = `
local buyRemote = Instance.new("RemoteEvent")
buyRemote.Name = "Buy"
buyRemote.Parent = ReplicatedStorage
local shopConfig = DataStoreService:GetDataStore("Shop"):GetAsync("Config")
buyRemote.OnServerEvent:Connect(function(player, itemId)
\tgrant(player, shopConfig[itemId])
end)`;

const REMOTE_PUBLISHED_LAST = `
local buyRemote = Instance.new("RemoteEvent")
buyRemote.Name = "Buy"
local shopConfig = DataStoreService:GetDataStore("Shop"):GetAsync("Config")
buyRemote.OnServerEvent:Connect(function(player, itemId)
\tgrant(player, shopConfig[itemId])
end)
buyRemote.Parent = ReplicatedStorage`;

/** The narrowing: parent-then-connect with NOTHING yielding between them is two statements in
 *  one resumption of the same thread. No client can run in the gap, so there is no window. */
const REMOTE_NO_YIELD = `
local ping = Instance.new("RemoteEvent")
ping.Parent = ReplicatedStorage
ping.OnServerEvent:Connect(function(player) print(player) end)`;

test('a remote replicated before its handler, across a yield, drops calls', () => {
  assert.ok(fired(analyzeLuau(REMOTE_PUBLISHED_EARLY), 'remote-parented-before-handler'));
});

test('...and parenting last clears it', () => {
  assert.ok(!fired(analyzeLuau(REMOTE_PUBLISHED_LAST), 'remote-parented-before-handler'));
});

test('...and so does having nothing yield in the gap', () => {
  // This is the narrowing that keeps the rule off correct code that simply orders its lines the
  // other way: without a yield there is no window for a client to call into.
  assert.ok(!fired(analyzeLuau(REMOTE_NO_YIELD), 'remote-parented-before-handler'));
});

// ------------------------------------------------- delegated pcall (F-52)
test('a helper that pcalls the function it was handed counts as protection', () => {
  // Found by running these rules over this repository's own server code.
  // DataService.luau wraps every DataStore call in `withRetry(label, function() ... end)`
  // and withRetry is a retry loop around `pcall(fn)`. It scored three ERROR findings for
  // being MORE careful than the rule asks — and because this rule grades model output,
  // it was marking down the better answer. `datastore-without-retry`, in this same file,
  // asks for exactly the helper that `datastore-without-pcall` was penalising.
  const delegated = [
    'local function withRetry(label, fn)',
    '\tfor attempt = 1, 3 do',
    '\t\tlocal ok, result = pcall(fn)',
    '\t\tif ok then return true, result end',
    '\tend',
    '\treturn false, nil',
    'end',
    'local store = DataStoreService:GetDataStore("Profiles")',
    'withRetry("save", function()',
    '\treturn store:UpdateAsync(key, transform)',
    'end)',
  ].join('\n');
  assert.ok(!fired(analyzeLuau(delegated, { context: 'server' }), 'datastore-without-pcall'));
});

test('a helper that does NOT pcall its parameter is still unprotected', () => {
  // The permissive direction lets real bugs through, so the widening is narrow: the
  // helper must pcall one of its OWN parameters by name. Merely taking a callback,
  // or merely containing the word pcall, is not protection.
  const passthrough = [
    'local function run(label, fn) return fn() end',
    'local store = DataStoreService:GetDataStore("Profiles")',
    'run("save", function()',
    '\treturn store:UpdateAsync(key, transform)',
    'end)',
  ].join('\n');
  assert.ok(fired(analyzeLuau(passthrough, { context: 'server' }), 'datastore-without-pcall'));

  // And a bare call is untouched by any of this.
  const bare = 'local store = DataStoreService:GetDataStore("P")\nstore:UpdateAsync(key, transform)';
  assert.ok(fired(analyzeLuau(bare, { context: 'server' }), 'datastore-without-pcall'));
});

test("this repository's own DataService passes every rule in this file", () => {
  // The check that produced the fix above, kept as a regression. If DataService grows
  // an unprotected DataStore call, or a rule regresses into flagging it again, this is
  // where it shows up.
  const src = readFileSync(
    new URL('../../../apps/benchmark/crystal-canyon/src/server/DataService.luau', import.meta.url),
    'utf8',
  );
  const res = analyzeLuau(src, { path: 'DataService.luau', context: 'server' });
  const errors = res.findings.filter((f) => f.severity === 'error');
  assert.deepEqual(errors.map((f) => `${f.rule}:${f.line}`), []);
});

test('a deprecated call named inside a string is prose, a class name is usage', () => {
  // Found by running this rule over apps/plugin/src/Ops.luau:351, which contains
  // "refused: this code contains a loop with no yield in it (no task.wait, wait() or "
  // — a refusal message listing the allowed yields, reported as a deprecated call.
  // This rule grades model output, so a model writing that same sensible message was
  // being marked down for it.
  assert.ok(!fired(analyzeLuau('local m = "use task.wait, not wait()"', {}), 'deprecated-api'));
  assert.ok(!fired(analyzeLuau("local m = 'no spawn() here'", {}), 'deprecated-api'));

  // Strings are not simply discarded: Instance.new("BodyVelocity") is real legacy
  // usage whose whole evidence lives inside one.
  assert.ok(fired(analyzeLuau('local x = Instance.new("BodyVelocity")', {}), 'deprecated-api'));

  // And real calls are untouched.
  assert.ok(fired(analyzeLuau('wait(1)', {}), 'deprecated-api'));
  assert.ok(fired(analyzeLuau('part.Touched:connect(fn)', {}), 'deprecated-api'));
});

test('blanking strings does not shift the line a finding reports', () => {
  // `matches()` computes a line number from a character index, so the blanked view
  // has to be the same length as the source or every finding after a string points
  // at the wrong line.
  const src = 'local a = 1\nlocal s = "padding padding padding"\nwait(1)';
  assert.equal(blankStringContents(src).length, src.length);
  const hit = analyzeLuau(src, {}).findings.find((f) => f.rule === 'deprecated-api');
  assert.equal(hit.line, 3, 'the wait() is on line 3');
});

// ------------------------------------------- tests are exempt from one rule (F-55)
test('a datastore spec is not marked down for the pcall that would defeat it', () => {
  // Found by running these rules over the 2,646 Luau files fetched this session:
  // datastore-without-pcall produced 134 findings and 93 came from ONE file,
  // NevermoreEngine's DataStoreMock.spec.lua. In a test an unprotected throw is the
  // desired behaviour — it fails the test — and a pcall would swallow what the test
  // exists to observe.
  const spec = [
    'local Jest = require("Jest")',
    'local describe = Jest.Globals.describe',
    'local it = Jest.Globals.it',
    'local expect = Jest.Globals.expect',
    'describe("DataStoreMock", function()',
    '\tit("round-trips", function()',
    '\t\tmockStore:SetAsync("k", 1)',
    '\t\texpect(mockStore:GetAsync("k")).toBe(1)',
    '\tend)',
    'end)',
  ].join('\n');
  assert.ok(looksLikeTest(spec));
  assert.ok(!fired(analyzeLuau(spec, { context: 'server' }), 'datastore-without-pcall'));
});

test('test detection is strict enough not to exempt production code', () => {
  // A file that merely contains the word test is not a test, and neither is one that
  // uses a single one of the call shapes.
  assert.ok(!looksLikeTest('local latest = testValue'));
  assert.ok(!looksLikeTest('local function describe(x) return x end'));
  assert.ok(!looksLikeTest('local s = DataStoreService:GetDataStore("P")\ns:SetAsync(k, v)'));

  // And the rule still fires on genuinely unprotected production code.
  assert.ok(fired(analyzeLuau('local s = DataStoreService:GetDataStore("P")\ns:SetAsync(k, v)', { context: 'server' }), 'datastore-without-pcall'));
});

test('the exemption is scoped to one rule, not granted to all of them', () => {
  // Other rules have their own relationship to test code, and some should still apply:
  // a test that hands a RemoteFunction to a client still demonstrates the pattern.
  const testSrc = [
    'local Jest = require("Jest")',
    'describe("net", function()',
    '\tit("responds", function()',
    '\t\tlocal rf = Instance.new("RemoteFunction")',
    '\t\trf:InvokeClient(player)',
    '\t\texpect(true).toBe(true)',
    '\tend)',
    'end)',
  ].join('\n');
  assert.ok(looksLikeTest(testSrc));
  assert.ok(fired(analyzeLuau(testSrc, { context: 'server' }), 'remote-function-to-client'));
});

test('a generic, typed retry helper is recognised as protection', () => {
  // The F-52 fix worked on untyped helpers and failed on modern Luau — the code most
  // worth getting right. slime-factory-tycoon's
  //   local function retry<T>(fn: () -> T, attempts: number)
  // broke it twice: `<T>` sits between the name and the paren, and a `[^)]*` parameter
  // capture ends at the `)` inside `() -> T` rather than the one closing the list.
  const generic = [
    'local function retry<T>(fn: () -> T, attempts: number): (boolean, T?)',
    '\tfor i = 1, attempts do',
    '\t\tlocal ok, result = pcall(fn)',
    '\t\tif ok then return true, result end',
    '\tend',
    '\treturn false, nil',
    'end',
    'local store = DataStoreService:GetDataStore("Profiles")',
    'local ok, result = retry(function()',
    '\treturn store:UpdateAsync(key, transform)',
    'end, 3)',
  ].join('\n');
  assert.ok(!fired(analyzeLuau(generic, { context: 'server' }), 'datastore-without-pcall'));
});

test("a library's own :SetAsync method is not the DataStore's", () => {
  // ProfileStore declares `function Profile:SetAsync()` — its view-mode save — and the
  // rule flagged the definition line and every call to ProfileStore's own API, eight
  // times in the leading DataStore library. F-49's shape a third time: a regex cannot
  // type a receiver, so the decidable question is whether the file defines the method.
  const ownMethod = [
    'function Profile:SetAsync()',
    '\tSaveProfileAsync(self, nil, true)',
    'end',
    'local profile = getProfile()',
    'profile:SetAsync()',
  ].join('\n');
  assert.ok(!fired(analyzeLuau(ownMethod, { context: 'server' }), 'datastore-without-pcall'));

  // Per method name, not blanket: defining :UpdateAsync must not exempt :SetAsync.
  const partial = [
    'function Store:UpdateAsync() end',
    'local s = DataStoreService:GetDataStore("P")',
    's:SetAsync(key, value)',
  ].join('\n');
  assert.ok(fired(analyzeLuau(partial, { context: 'server' }), 'datastore-without-pcall'));
});
