/**
 * The pure parts of the game components (waves, defenders, shop, economy, game ui, feedback), run in the luau CLI.
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
  eq(Shop.refusal(item, 1, 1, false, 29, "Crystals"), "Not enough crystals.", "a shortfall names the game's own currency")
  eq(Shop.refusal(item, 1, 1, false, 29), "Not enough yet.", "and never says money")
  eq(Shop.refusal(item, 1, 1, false, 30), nil)
end)

spec("economy: spending never goes below zero or takes odd amounts", function()
  eq(Economy.afterSpend(50, 20), 30); eq(Economy.afterSpend(50, 50), 0); eq(Economy.afterSpend(50, 51), nil)
  eq(Economy.afterSpend(50, -5), nil); eq(Economy.afterSpend(50, 1.5), nil); eq(Economy.afterSpend(50, 0/0), nil)
  eq(Economy.afterGrant(10, 5), 15); eq(Economy.afterGrant(10, -5), 10); eq(Economy.afterGrant(10, 2.7), 12)
  eq(Economy.afterGrant(1e15, 10), 1e15, "capped")
end)

spec("game ui: numbers read like a game's", function()
  eq(UI.short(5), "5"); eq(UI.short(1234), "1.2K"); eq(UI.short(1000), "1K"); eq(UI.short(2500000), "2.5M"); eq(UI.short(150000), "150K")
  eq(UI.clock(12), "0:12"); eq(UI.clock(75), "1:15"); eq(UI.clock(-3), "0:00")
  local words = { nextWave = "Veggies in", left = "veggies left" }
  eq(UI.waveLine("intermission", 8, 0, words), "Veggies in 0:08"); eq(UI.waveLine("wave", 0, 7, words), "7 veggies left")
  eq(UI.waveLine("cleared", 0, 0, {}), "Wave cleared!"); eq(UI.waveLine(nil, 0, 0, {}), "")
  local g = UI.healthColours(0.9); local r = UI.healthColours(0.1); eq(g[2] > g[1], true, "full health is green"); eq(r[1] > r[2], true, "low health is red")
end)

spec("progress: upgrades cost more each level, stop at the top, and the screen agrees with the server", function()
  local rules = Shop.upgradeRules({ max = 4 })
  eq(rules.max, 4); eq(rules.growth, 1.8, "the rest keep their defaults")
  local item = { price = 50, damage = 10, range = 16, rate = 1 }
  local c1, c2 = Shop.upgradeCost(item, 1, rules), Shop.upgradeCost(item, 2, rules)
  eq(c1, 40); eq(c2 > c1, true, "the next level costs more"); eq(Shop.upgradeCost(item, 4, rules), nil, "no level past the top")
  for lv = 1, 3 do eq(UI.upgradeCost(50, lv, rules.max, rules.cost, rules.growth), Shop.upgradeCost(item, lv, rules), "screen price = server price at level " .. lv) end
  local d1, r1, f1 = Shop.stats(item, 1, rules); eq(d1, 10); eq(r1, 16); eq(f1, 1)
  local d3, r3, f3 = Shop.stats(item, 3, rules); eq(d3 > d1, true); eq(r3 > r1, true); eq(f3 > f1, true)
  eq(Shop.locked({ unlock = 3 }, 2), true); eq(Shop.locked({ unlock = 3 }, 3), false); eq(Shop.locked({}, 0), false)
end)

spec("feedback: a pop overshoots and settles; a sound role waits its gap", function()
  eq(math.abs(Fx.popScale(0)) < 1e-9, true); eq(math.abs(Fx.popScale(1) - 1) < 1e-9, true)
  local peak = 0; for i = 0, 20 do peak = math.max(peak, Fx.popScale(i / 20)) end; eq(peak > 1.05, true, "it overshoots")
  eq(Sounds.ready(nil, 5, 0.1), true); eq(Sounds.ready(4.95, 5, 0.1), false); eq(Sounds.ready(4.8, 5, 0.1), true)
  for role, r in Sounds.roles do eq(type(r.id) == "string" and r.id:match("^rbxasset") ~= nil, true, role .. " has a sound") end
end)

spec("creatures: a costume fills the torso-and-head space and stands its long side up", function()
  local space = { sx = 2, sy = 3, sz = 1 }
  local s = Creatures.fit({ sx = 1.79, sy = 0.58, sz = 0.65 }, space, true, 1)
  eq(math.abs(1.79 * s - 3) < 1e-6, true, "a carrot lying down, stood up, is as tall as the space")
  local w = Creatures.fit({ sx = 4, sy = 1, sz = 4 }, space, false, 1)
  eq(4 * w <= 2 * 1.6 + 1e-6, true, "a wide costume is limited by width")
  eq(Creatures.fit({ sx = 1, sy = 1, sz = 1 }, space, false, 1.2) > Creatures.fit({ sx = 1, sy = 1, sz = 1 }, space, false, 1), true)
  local z, x = Creatures.uprightTurns({ sx = 1.79, sy = 0.58, sz = 0.65 }); eq(z, 1); eq(x, 0)
  z, x = Creatures.uprightTurns({ sx = 0.5, sy = 0.5, sz = 2 }); eq(z, 0); eq(x, 1)
  z, x = Creatures.uprightTurns({ sx = 1, sy = 2, sz = 1 }); eq(z, 0); eq(x, 0)
end)

spec("animate: at most 12 paid presses a second per player, then again after a second", function()
  -- The owner's session reached 673K coins: standing on a keyboard shrunk onto a plot tile paid every key it touched.
  local recent, paid = {}, 0
  for i = 1, 40 do if Anim.paysPress(recent, 10 + i * 0.001) then paid += 1 end end
  eq(paid, 12, "a burst of 40 presses in a moment pays 12")
  eq(Anim.paysPress(recent, 10.5), false, "still within the second")
  eq(Anim.paysPress(recent, 11.2), true, "a second later presses pay again")
  local slow, n = {}, 0
  for i = 1, 30 do if Anim.paysPress(slow, i * 0.1) then n += 1 end end
  eq(n, 30, "ten a second, a fast typist, always pays")
end)

spec("animate: keys ease between poses, hold at the ends, and name their joints", function()
  local keys = { { t = 0, Key = { move = { 0, 0, 0 } } }, { t = 1, Key = { move = { 0, -1, 0 }, rot = { 90, 0, 0 } }, ease = "Quad" }, { t = 2, Lid = { rot = { 0, 0, 45 } } } }
  local r, m = Anim.sample(keys, "Key", 0.5); eq(m[2] < -0.5, true, "Quad is past halfway at half time"); eq(r[1] > 45, true)
  r, m = Anim.sample(keys, "Key", 5); eq(m[2], -1, "holds the last pose"); eq(r[1], 90)
  r, m = Anim.sample(keys, "Key", -1); eq(m[2], 0, "holds the first pose")
  r = Anim.sample(keys, "Lid", 0); eq(r[3], 45, "a joint with one key holds it")
  r, m = Anim.sample(keys, "Nope", 1); eq(r[1] + m[2], 0, "an unnamed joint stays at rest")
  local j = Anim.jointsOf(keys); eq(#j, 2); eq(j[1], "Key"); eq(j[2], "Lid")
  for _, style in { "Linear", "Sine", "Quad", "Back", "Bounce", "Elastic" } do
    eq(math.abs(Anim.ease(style, 0)) < 1e-9, true, style .. " starts at 0"); eq(math.abs(Anim.ease(style, 1) - 1) < 1e-6, true, style .. " ends at 1")
  end
end)

spec("upgrades: prices grow, presses and seconds pay by level, multipliers multiply", function()
  local ups = {
    { id = "Fingers", kind = "perPress", amount = 1, cost = 10, growth = 1.5 },
    { id = "Golden", kind = "multiplier", amount = 2, cost = 100, growth = 3 },
    { id = "Auto", kind = "perSecond", amount = 2, cost = 50 },
  }
  eq(Upgrades.cost(ups[1], 0), 10, "the first level costs the base price")
  eq(Upgrades.cost(ups[1], 2), 23, "then it grows")
  eq(Upgrades.cost(ups[3], 1), 75, "growth defaults to 1.5")
  eq(Upgrades.perPress(1, ups, {}), 1, "a press pays the base with nothing bought")
  eq(Upgrades.perPress(1, ups, { Fingers = 3 }), 4)
  eq(Upgrades.perPress(1, ups, { Fingers = 3, Golden = 2 }), 16, "two doublings")
  eq(Upgrades.perSecond(ups, {}), 0, "nothing pays by itself until bought")
  eq(Upgrades.perSecond(ups, { Auto = 2, Golden = 1 }), 8)
end)

spec("machines: income is base times level, multipliers stack, rebirth costs grow", function()
  local drill = { income = 3, perPress = 2 }
  eq(Machines.income(drill, 1), 3); eq(Machines.income(drill, 4), 12); eq(Machines.income(drill, 0), 3, "a level below 1 counts as 1")
  eq(Machines.income(drill, nil), 3); eq(Machines.income({}, 5), 0, "no income, no pay"); eq(Machines.income(nil, 5), 0)
  eq(Machines.pressIncome(drill, 3), 6); eq(Machines.pressIncome({ income = 3 }, 3), 0)
  local ups = { { id = "Golden", kind = "multiplier", amount = 2 }, { id = "Fingers", kind = "perPress", amount = 1 } }
  eq(Machines.multiplier(0, 0.5, nil, nil), 1, "nothing bought, nothing reborn")
  eq(Machines.multiplier(2, 0.5, nil, nil), 2, "two rebirths at +0.5 each")
  eq(Machines.multiplier(2, 0.5, ups, { Golden = 2, Fingers = 9 }), 8, "rebirths times two doublings; perPress upgrades do not multiply")
  eq(Machines.multiplier("x", 0.5, ups, {}), 1, "a bad rebirth count is none")
  local rules = Machines.rebirthRules({ cost = 100, growth = 1.5 })
  eq(rules.cost, 100); eq(rules.growth, 1.5); eq(rules.multiplier, 0.5, "the rest keep their defaults")
  eq(Machines.rebirthCost(rules, 0), 100); eq(Machines.rebirthCost(rules, 1), 150); eq(Machines.rebirthCost(rules, 2), 225)
  eq(Machines.rebirthCost(rules, 3), 337, "floored"); eq(Machines.rebirthCost(Machines.rebirthRules(nil), 0), 1000)
  eq(Machines.rebirthRefusal(99, 100, "Crystals"), "You need more crystals to rebirth."); eq(Machines.rebirthRefusal(99, 100), "You need more to rebirth."); eq(Machines.rebirthRefusal(100, 100), nil)
  local pay = Machines.payouts({
    { owner = 1, item = "Drill", level = 2 }, { owner = 1, item = "Drill", level = 1 }, { owner = 2, item = "Drill", level = 1 },
    { owner = 2, item = "Rock", level = 1 }, { owner = nil, item = "Drill", level = 1 }, { owner = 3, item = "Drill", level = 1 },
  }, { Drill = { income = 3 } })
  eq(pay[1], 9, "an owner is paid for each of their machines"); eq(pay[2], 3, "an item that is not a machine pays nothing")
  eq(pay[3], 3); eq(pay[0], nil, "an unowned model pays nobody")
end)

spec("owners: only the owner's own presses play and pay; unowned things stay open to everyone", function()
  eq(Anim.mayPress(nil, 7), true, "unowned"); eq(Anim.mayPress(7, 7), true, "the owner"); eq(Anim.mayPress(8, 7), false, "a visitor")
  eq(Upgrades.paysPress(nil, 7), true); eq(Upgrades.paysPress(7, 7), true); eq(Upgrades.paysPress(8, 7), false)
  eq(Machines.isOwn(7, 7), true); eq(Machines.isOwn(8, 7), false); eq(Machines.isOwn(nil, 7), false, "nobody's press is not the player's own")
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
    `local Creatures = (function()\n${src('creatures/AppleCreatures.luau')}\nend)()`,
    'script = nil -- client scripts start themselves only as real LocalScripts',
    `local UI = (function()\n${src('gameui/AppleGameUI.luau')}\nend)()`,
    `local Fx = (function()\n${src('fx/AppleFx.luau')}\nend)()`,
    `local Sounds = (function()\n${src('fx/AppleSounds.luau')}\nend)()`,
    `local Anim = (function()\n${src('animate/AppleAnimate.luau')}\nend)()`,
    `local Upgrades = (function()\n${src('upgrades/AppleUpgrades.luau')}\nend)()`,
    `local Machines = (function()\n${src('machines/AppleMachines.luau')}\nend)()`,
    SPEC,
  ].join('\n'));
  let out;
  try { out = execFileSync('luau', [file], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) { assert.fail(String(e.stdout) + String(e.stderr)); }
  assert.match(out, /systems: \d+ passed$/m, out);
});
