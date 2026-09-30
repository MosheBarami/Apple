/**
 * The pure parts of the game components (waves, defenders, shop, economy, hud), run in the luau CLI.
 * The Roblox halves are proven in Studio (docs/autonomy/evidence/20260930-components).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(join(HERE, '..', p), 'utf8').replace(/^--!strict\n/, '');

// AppleEconomy runs at require time; a stand-in for the few Roblox objects it touches.
const STUBS = String.raw`
local function signal() return { Connect = function() return { Disconnect = function() end } end } end
script = { GetAttribute = function() return nil end }
Instance = { new = function() return { Event = signal(), Fire = function() end } end }
game = { GetService = function() return { PlayerAdded = signal(), PlayerRemoving = signal(), GetPlayers = function() return {} end } end, BindToClose = function() end }
task = { spawn = function() end, wait = function() end }
`;

const SPEC = String.raw`
local passed, failures = 0, {}
local function spec(name, fn) local ok, err = pcall(fn); if ok then passed += 1 else table.insert(failures, name .. ": " .. tostring(err)) end end
local function eq(a, b, why) if a ~= b then error((why or "value") .. ": expected " .. tostring(b) .. ", got " .. tostring(a), 2) end end

spec("waves: listed waves as given, then bigger and tougher forever", function()
  local list = { { { enemy = "Carrot", count = 4, every = 1 } }, { { enemy = "Carrot", count = 6, every = 1 }, { enemy = "Onion", count = 2, every = 2 } } }
  local w1, s1 = Waves.scaleWave(list, 1); eq(Waves.countOf(w1), 4); eq(s1, 1)
  local w2 = Waves.scaleWave(list, 2); eq(Waves.countOf(w2), 8)
  local w3, s3 = Waves.scaleWave(list, 3); eq(Waves.countOf(w3) > 8, true, "wave 3 is bigger"); eq(s3 > 1, true, "and tougher")
  local w9, s9 = Waves.scaleWave(list, 9); eq(Waves.countOf(w9) > Waves.countOf(w3), true); eq(s9 > s3, true)
  eq(#Waves.scaleWave({}, 1), 0, "no list, no enemies")
end)

spec("waves: walking along a lane", function()
  local lane = { { x = 0, y = 0, z = 0 }, { x = 10, y = 0, z = 0 }, { x = 10, y = 0, z = 10 } }
  local p, nextI, done = Waves.along(lane, 5); eq(p.x, 5); eq(nextI, 2); eq(done, false)
  p, nextI, done = Waves.along(lane, 15); eq(p.x, 10); eq(p.z, 5); eq(nextI, 3); eq(done, false)
  p, nextI, done = Waves.along(lane, 21); eq(done, true, "past the end reaches the base"); eq(p.z, 10)
  p = Waves.along(lane, -3); eq(p.x, 0, "never behind the start")
end)

spec("defenders: hit the most advanced enemy in range, else the nearest of equals, else none", function()
  local ts = { { id = "a", x = 5, z = 0, progress = 1 }, { id = "b", x = 8, z = 0, progress = 3 }, { id = "far", x = 40, z = 0, progress = 9 } }
  eq(Defenders.pick(0, 0, 10, ts).id, "b", "further along wins")
  eq(Defenders.pick(0, 0, 6, ts).id, "a", "only a is in range")
  eq(Defenders.pick(0, 0, 2, ts), nil)
  eq(Defenders.pick(0, 0, 10, { { id = "x", x = 9, z = 0, progress = 1 }, { id = "y", x = 3, z = 0, progress = 1 } }).id, "y", "tie goes to the nearest")
end)

spec("shop: a purchase is refused for the right reason", function()
  local item = { price = 30 }
  eq(Shop.refusal(nil, 1, 1, false, 100), "That item is not sold here.")
  eq(Shop.refusal(item, 2, 1, false, 100), "Place it on your own plot.")
  eq(Shop.refusal(item, nil, 1, false, 100), "Place it on your own plot.")
  eq(Shop.refusal(item, 1, 1, true, 100), "That spot is taken.")
  eq(Shop.refusal(item, 1, 1, false, 29), "Not enough money.")
  eq(Shop.refusal(item, 1, 1, false, 30), nil)
end)

spec("economy: spending never goes below zero or takes odd amounts", function()
  eq(Economy.afterSpend(50, 20), 30); eq(Economy.afterSpend(50, 50), 0); eq(Economy.afterSpend(50, 51), nil)
  eq(Economy.afterSpend(50, -5), nil); eq(Economy.afterSpend(50, 1.5), nil); eq(Economy.afterSpend(50, 0/0), nil)
  eq(Economy.afterGrant(10, 5), 15); eq(Economy.afterGrant(10, -5), 10); eq(Economy.afterGrant(10, 2.7), 12)
  eq(Economy.afterGrant(1e15, 10), 1e15, "capped")
end)

spec("hud: numbers read like a game's", function()
  eq(Hud.short(5), "5"); eq(Hud.short(1234), "1.2K"); eq(Hud.short(1000), "1K"); eq(Hud.short(2500000), "2.5M"); eq(Hud.short(150000), "150K")
  eq(Hud.money("$299,999", 50), "$50"); eq(Hud.money("299 Coins", 1500), "1.5K Coins"); eq(Hud.money("Herbert", 7), "7")
  eq(Hud.clock(12), "0:12"); eq(Hud.clock(75), "1:15"); eq(Hud.clock(-3), "0:00")
end)

print(("systems: %d passed%s"):format(passed, if #failures > 0 then ", " .. #failures .. " FAILED" else ""))
for _, f in failures do print(f) end
if #failures > 0 then error("system specs failed") end
`;

function available() { try { execFileSync('luau', ['--help'], { stdio: 'pipe' }); return true; } catch { return false; } }

test('the game components pass their luau specs', { skip: available() ? false : 'luau is not on PATH' }, () => {
  const file = join(mkdtempSync(join(tmpdir(), 'systems-')), 'systems.gen.luau');
  writeFileSync(file, [
    STUBS,
    `local Waves = (function()\n${src('waves/AppleWaves.luau')}\nend)()`,
    `local Defenders = (function()\n${src('defenders/AppleDefenders.luau')}\nend)()`,
    `local Shop = (function()\n${src('shop/AppleShop.luau')}\nend)()`,
    `local Economy = (function()\n${src('economy/AppleEconomy.luau')}\nend)()`,
    'script = nil -- the HUD starts itself only as a real LocalScript',
    `local Hud = (function()\n${src('hud/AppleHud.luau')}\nend)()`,
    SPEC,
  ].join('\n'));
  let out;
  try { out = execFileSync('luau', [file], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) { assert.fail(String(e.stdout) + String(e.stderr)); }
  assert.match(out, /systems: \d+ passed$/m, out);
});
