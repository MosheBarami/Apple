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
import {
  RULES,
  RULE_IDS,
  analyzeLuau,
  blockEnd,
  checkNoAntipattern,
  fired,
  inferContext,
  stripComments,
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
