// Executes the exact proof-place server with API doubles; not a networking/engine proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const source = readFileSync(join(fixtures, 'apple-ui-studio-server.luau'), 'utf8');
const prelude = readFileSync(join(fixtures, 'apple-ui-runtime.luau'), 'utf8');
const directory = mkdtempSync(join(tmpdir(), 'apple-ui-proof-server-'));
const setup = `
local now = 10
local os = { clock = function() return now end }
services.RunService.IsStudio = function() return true end
services.ReplicatedStorage = Instance.new("ReplicatedStorage")
services.Players = { PlayerRemoving = signal(), PlayerAdded = signal(), GetPlayers = function() return {} end }
local function player()
    local humanoid = { WalkSpeed = 16 }
    return { CharacterAdded = signal(), Character = { FindFirstChildOfClass = function() return humanoid end } }, humanoid
end
`;
let sequence = 0;
function run(body, server = source) {
  const path = join(directory, `${sequence++}.luau`);
  writeFileSync(path, `${prelude}\n${setup}\n(function()\n${server}\nend)()\nlocal call = services.ReplicatedStorage:FindFirstChild("AppleUIProof").OnServerInvoke\n${body}`);
  execFileSync('luau', [path], { stdio: 'pipe' });
}

test('proof server validates item and uses its own price, not client arguments', () => {
  const body = `local p, humanoid = player()
    assert(call(p, "buy", "unavailable") == false)
    assert(call(p, "buy", {id="speed"}) == false)
    assert(call(p, "state").balance == 100)
    local ok, _, state = call(p, "buy", "speed", -1000, 999)
    assert(ok == true and state.balance == 75 and state.upgrades == 1)
    assert(humanoid.WalkSpeed == 20)
    assert(call(p, "buy", "speed") == false)
    assert(call(p, "state").balance == 75)`;
  run(body);
  const needle = 'current.balance -= 25';
  assert.equal(source.split(needle).length, 2);
  assert.throws(() => run(body, source.replace(needle, 'current.balance += 25')));
});

test('three upgrades are authoritative and a fourth neither charges nor grants', () => {
  run(`local p, humanoid = player()
    for i=1,3 do
        now += 1
        assert(call(p, "buy", "speed") == true)
        assert(humanoid.WalkSpeed == 16 + 4*i)
    end
    now += 1
    assert(call(p, "buy", "speed") == false)
    assert(call(p, "state").balance == 25 and call(p, "state").upgrades == 3)`);
});

test('missing character refuses without spending; players and departed sessions stay separate', () => {
  run(`local p = player(); local second = player()
    p.Character = nil
    assert(call(p, "buy", "speed") == false)
    assert(call(p, "state").balance == 100)
    assert(call(second, "buy", "speed") == true)
    assert(call(p, "state").balance == 100)
    services.Players.PlayerRemoving:Fire(second)
    assert(call(second, "state").balance == 100)`);
});

test('proof source refuses execution outside Studio before creating its remote', () => {
  const needle = 'assert(game:GetService("RunService"):IsStudio(), "This proof fixture is Studio-only")';
  assert.equal(source.split(needle).length, 2);
  assert.throws(() => run('', source.replace(needle, 'services.RunService.IsStudio = function() return false end\n' + needle)));
});

test('only an explicit inspection run ends automatically, returning real server state without visual approval', () => {
  const instrumentation = `
    services.delays = {}
    local task = { delay = function(seconds, fn) table.insert(services.delays, {seconds=seconds, fn=fn}) end }
    services.StudioTestService = {
      GetTestArgs = function() return {appleUIVisualProof=true} end,
      EndTest = function(_, value) services.ended=value end,
    }
  `;
  run(`assert(#services.delays==1 and services.delays[1].seconds==150)
    local p, humanoid=player()
    services.Players.GetPlayers=function() return {p} end
    for i=1,3 do now+=1; assert(call(p,"buy","speed")==true) end
    services.delays[1].fn()
    local result=services.ended
    assert(result.kind=="server_readback" and result.visualVerdict=="unreviewed" and result.ok==nil)
    assert(result.states[1].balance==25 and result.states[1].upgrades==3 and result.states[1].walkSpeed==28)`,
    instrumentation + source);
  run('assert(#services.delays==0 and services.ended==nil)',
    instrumentation.replace('{appleUIVisualProof=true}', '{appleUIVisualProof=false}') + source);
});
