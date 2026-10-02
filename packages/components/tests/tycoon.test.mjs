/**
 * AppleTycoon's pure rules (owner, 2026-10-02: a laundry tycoon must be a tycoon, not the plot simulator). The
 * Roblox half is proven live in Studio.
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
function available() { try { execFileSync('luau', ['--help'], { stdio: 'pipe' }); return true; } catch { return false; } }

test('tycoon pads appear in order, machines count once, prices read short', { skip: available() ? false : 'luau is not on PATH' }, () => {
  const file = join(mkdtempSync(join(tmpdir(), 'tycoon-')), 'tycoon.gen.luau');
  writeFileSync(file, [
    `local T = (function()\n${src('tycoon/AppleTycoon.luau')}\nend)()`,
    String.raw`
local function eq(a, b, why) if a ~= b then error((why or "value") .. ": expected " .. tostring(b) .. ", got " .. tostring(a), 2) end end
local u = { { id = "Dropper2", label = "Dropper", price = 50 }, { id = "Washer", label = "Washer", price = 150, after = "Dropper2" }, { id = "Dryer", label = "Dryer", price = 600, after = "Washer" } }
local v = T.visiblePads(u, {})
eq(#v, 1, "only the first pad at the start"); eq(v[1], "Dropper2")
v = T.visiblePads(u, { Dropper2 = true })
eq(#v, 1); eq(v[1], "Washer", "the next pad after the first is bought")
eq(#T.visiblePads(u, { Dropper2 = true, Washer = true, Dryer = true }), 0, "nothing left to buy")
eq(T.passGate(5, 2, false), 10, "a washer doubles"); eq(T.passGate(10, 2, true), 10, "the same washer twice counts once")
eq(T.short(25), "$25"); eq(T.short(1500), "$1.5K"); eq(T.short(2000000), "$2M")
print("ok")`,
  ].join('\n'));
  assert.equal(execFileSync('luau', [file], { encoding: 'utf8' }).trim(), 'ok');
});
