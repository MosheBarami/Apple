/**
 * AppleMotion's math core: which joint is a leg, arm, head, tail or body, read from geometry alone
 * (most library rigs name joints Part001…), and poses that actually move. Runs the real module in
 * the luau CLI; the Roblox glue is proven in Studio (docs/autonomy/evidence/20260930-components).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULE = readFileSync(join(HERE, '..', 'motion', 'AppleMotion.luau'), 'utf8').replace(/^--!strict\n/, '');

const SPEC = String.raw`
local passed, failures = 0, {}
local function spec(name, fn) local ok, err = pcall(fn); if ok then passed += 1 else table.insert(failures, name .. ": " .. tostring(err)) end end
local function eq(a, b, why) if a ~= b then error((why or "value") .. ": expected " .. tostring(b) .. ", got " .. tostring(a), 2) end end
local function v(x, y, z) return { x = x, y = y, z = z } end
local function roleNames(roles) local out = {}; for i, r in roles do out[i] = r.role end; return table.concat(out, ",") end

-- An R15 dummy with generic joint names: root 1, waist 2, neck 3, shoulders 4/5, elbows 6/7, hips 8/9, knees 10/11, ankles 12/13.
local R15 = {
  { pivot = v(0, 2.6, 0), center = v(0, 2.6, 0), share = 1.0 },
  { pivot = v(0, 2.9, 0), center = v(0, 3.9, 0), share = 0.55, parent = 1 },
  { pivot = v(0, 4.5, 0), center = v(0, 5.0, 0), share = 0.08, parent = 2 },
  { pivot = v(-1.0, 4.3, 0), center = v(-1.5, 3.4, 0), share = 0.07, parent = 2 },
  { pivot = v(1.0, 4.3, 0), center = v(1.5, 3.4, 0), share = 0.07, parent = 2 },
  { pivot = v(-1.5, 3.6, 0), center = v(-1.5, 2.9, 0), share = 0.04, parent = 4 },
  { pivot = v(1.5, 3.6, 0), center = v(1.5, 2.9, 0), share = 0.04, parent = 5 },
  { pivot = v(-0.5, 2.0, 0), center = v(-0.5, 1.0, 0), share = 0.12, parent = 1 },
  { pivot = v(0.5, 2.0, 0), center = v(0.5, 1.0, 0), share = 0.12, parent = 1 },
  { pivot = v(-0.5, 1.2, 0), center = v(-0.5, 0.5, 0), share = 0.06, parent = 8 },
  { pivot = v(0.5, 1.2, 0), center = v(0.5, 0.5, 0), share = 0.06, parent = 9 },
  { pivot = v(-0.5, 0.3, 0), center = v(-0.5, 0.15, -0.2), share = 0.02, parent = 10 },
  { pivot = v(0.5, 0.3, 0), center = v(0.5, 0.15, -0.2), share = 0.02, parent = 11 },
}
local R15_BOUNDS = { height = 5.3, width = 4, length = 1.2, minY = 0 }

spec("an R15 rig with generic names: legs, arms, head and body come from geometry", function()
  local r = AppleMotion.classify(R15, R15_BOUNDS)
  eq(roleNames(r), "body,body,head,arm,arm,arm,arm,leg,leg,leg,leg,leg,leg")
  eq(r[8].depth, 0); eq(r[10].depth, 1, "a knee follows its hip"); eq(r[12].depth, 1, "a foot follows its shin")
  eq(r[8].side, -1); eq(r[9].side, 1)
  eq(r[8].phase ~= r[9].phase, true, "a biped's legs alternate")
  eq(r[4].phase ~= r[5].phase, true, "and so do its arms")
end)

-- A quadruped (a bear): body root, head forward, tail behind, four legs at the corners.
local QUAD = {
  { pivot = v(0, 2, 0), center = v(0, 2, 0), share = 0.9 },
  { pivot = v(0, 2.5, -1.8), center = v(0, 2.9, -2.4), share = 0.12, parent = 1 },
  { pivot = v(0, 2.3, 1.8), center = v(0, 2.2, 2.4), share = 0.02, parent = 1 },
  { pivot = v(-0.8, 1.4, -1.2), center = v(-0.8, 0.6, -1.2), share = 0.05, parent = 1 },
  { pivot = v(0.8, 1.4, -1.2), center = v(0.8, 0.6, -1.2), share = 0.05, parent = 1 },
  { pivot = v(-0.8, 1.4, 1.2), center = v(-0.8, 0.6, 1.2), share = 0.05, parent = 1 },
  { pivot = v(0.8, 1.4, 1.2), center = v(0.8, 0.6, 1.2), share = 0.05, parent = 1 },
}
spec("a quadruped: head, tail and four legs that move in diagonal pairs", function()
  local r = AppleMotion.classify(QUAD, { height = 3.4, width = 2.2, length = 5.2, minY = 0 })
  eq(roleNames(r), "body,head,tail,leg,leg,leg,leg")
  eq(r[4].phase, r[7].phase, "front-left moves with back-right")
  eq(r[5].phase, r[6].phase, "front-right moves with back-left")
  eq(r[4].phase ~= r[5].phase, true)
end)

spec("side fins are wings and flap in mirror", function()
  local r = AppleMotion.classify({
    { pivot = v(0, 1, 0), center = v(0, 1, 0), share = 0.8 },
    { pivot = v(-0.8, 1.2, 0), center = v(-1.6, 1.1, 0), share = 0.05, parent = 1 },
    { pivot = v(0.8, 1.2, 0), center = v(1.6, 1.1, 0), share = 0.05, parent = 1 },
  }, { height = 2, width = 4, length = 2, minY = 0 })
  eq(roleNames(r), "body,wing,wing")
  local a = AppleMotion.pose(r[2], 0.4, 0, 0, nil, false)
  local b = AppleMotion.pose(r[3], 0.4, 0, 0, nil, false)
  eq(math.abs(a.rz + b.rz) < 1e-9 and a.rz ~= 0, true, "mirror flap")
end)

local function range(r, field, walk, attackAt, legs)
  local lo, hi = math.huge, -math.huge
  for i = 0, 200 do
    local t = i / 50
    local attack = if attackAt then (t - attackAt) / 0.45 else nil
    local p = AppleMotion.pose(r, t, walk, 6, if attack and attack >= 0 and attack <= 1 then attack else nil, legs)
    lo, hi = math.min(lo, p[field]), math.max(hi, p[field])
  end
  return hi - lo
end

spec("nothing stands still: idle breathes, walking swings the legs well past idle", function()
  local r = AppleMotion.classify(R15, R15_BOUNDS)
  eq(range(r[1], "lift", 0, nil, true) > 0, true, "idle body breathes")
  eq(range(r[3], "rx", 0, nil, true) > 0.05, true, "idle head moves")
  eq(range(r[8], "rx", 0, nil, true), 0, "a leg is still while idle")
  eq(range(r[8], "rx", 1, nil, true) > 0.9, true, "a walking leg swings about a radian end to end")
  eq(range(r[4], "rx", 1, nil, true) > 0.7, true, "arms swing while walking")
end)

spec("walking legs are in opposition at every moment", function()
  local r = AppleMotion.classify(R15, R15_BOUNDS)
  for i = 0, 20 do
    local t = i / 7
    local l = AppleMotion.pose(r[8], t, 1, 6, nil, true).rx
    local rr = AppleMotion.pose(r[9], t, 1, 6, nil, true).rx
    eq(math.abs(l + rr) < 1e-9, true, "left and right mirror at t=" .. t)
  end
end)

spec("an attack lunges the body forward and raises the arms, then returns", function()
  local r = AppleMotion.classify(R15, R15_BOUNDS)
  local mid = AppleMotion.pose(r[1], 1, 0, 0, 0.5, true)
  eq(mid.rx < -0.3, true, "the body leans forward (negative rx)"); eq(mid.forward > 0, true)
  eq(AppleMotion.pose(r[4], 1, 0, 0, 0.5, true).rx > 1, true, "the arm swings up and forward")
  local done = AppleMotion.pose(r[1], 1, 0, 0, 1, true)
  eq(math.abs(done.forward) < 1e-9, true, "back at the end")
end)

spec("a legless body (a fruit on one joint) hops and waddles when it walks", function()
  local r = AppleMotion.classify({ { pivot = v(0, 0.5, 0), center = v(0, 1.5, 0), share = 1 } }, { height = 3, width = 2, length = 2, minY = 0 })
  eq(r[1].role, "body")
  eq(range(r[1], "lift", 1, nil, false) > 0.1, true, "hops")
  eq(range(r[1], "rz", 1, nil, false) > 0.2, true, "waddles")
  eq(range(r[1], "rx", 0, 1, false) > 0.4, true, "lunges when it attacks")
end)

print(("motion: %d passed%s"):format(passed, if #failures > 0 then ", " .. #failures .. " FAILED" else ""))
for _, f in failures do print(f) end
if #failures > 0 then error("motion specs failed") end
`;

function available() { try { execFileSync('luau', ['--help'], { stdio: 'pipe' }); return true; } catch { return false; } }

test('AppleMotion core passes its luau specs', { skip: available() ? false : 'luau is not on PATH' }, () => {
  const file = join(mkdtempSync(join(tmpdir(), 'motion-')), 'motion.gen.luau');
  writeFileSync(file, `local AppleMotion = (function()\n${MODULE}\nend)()\n${SPEC}`);
  let out;
  try { out = execFileSync('luau', [file], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) { assert.fail(String(e.stdout) + String(e.stderr)); }
  assert.match(out, /motion: \d+ passed$/m, out);
});
