/**
 * THE HARNESS MUST NOT THROW ON LUAU THAT ROBLOX ACCEPTS.
 *
 * `ui-harness.luau` shims the engine so generated code can be executed and measured. Every gap in
 * the shim is a trap, because a gap surfaces as `runtime_error` on a run whose Luau was perfectly
 * correct — and score-ui.mjs says so in its own header: a throw "can mean the model used an API
 * this shim does not implement — which is my gap, not the model's mistake, and must not be counted
 * as one without a person reading the sentence."
 *
 * MEASURED, 2026-09-20. The first map the deployed model generated placed every plot with
 * `pos + Vector3.new(0, 0.5, 0)`, which is how Roblox map scripts offset from an anchor. Vector3
 * was a bare table with an EMPTY metatable, so `+` threw "attempt to perform arithmetic" and an
 * 86-part tycoon map was recorded as a model failure. With arithmetic implemented the same source
 * builds 86 parts, 0 unplaceable.
 *
 * These guards pin the operations a map script actually uses, so the gap cannot reopen quietly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUiTree } from './score-ui.mjs';

/** Build a part whose Size/Position come from the expression under test, and read them back. */
function partFrom(expr) {
  const out = buildUiTree(`
local p = Instance.new("Part")
p.Name = "Probe"
p.Size = Vector3.new(1, 1, 1)
p.Position = ${expr}
p.Parent = game:GetService("Workspace")
`);
  return out;
}

const posOf = (built) => {
  const n = built.nodes.find((x) => x.class === 'Part');
  return n?.props?.Position ?? null;
};

test('Vector3 addition works, because every map script offsets from an anchor', () => {
  const built = partFrom('Vector3.new(10, 0, -4) + Vector3.new(0, 5, 4)');
  assert.equal(built.status, 'ok', `harness threw: ${built.detail}`);
  assert.deepEqual(posOf(built), { k: 'Vector3', x: 10, y: 5, z: 0 });
});

test('Vector3 subtraction and negation work', () => {
  const a = partFrom('Vector3.new(10, 10, 10) - Vector3.new(1, 2, 3)');
  assert.equal(a.status, 'ok', `harness threw: ${a.detail}`);
  assert.deepEqual(posOf(a), { k: 'Vector3', x: 9, y: 8, z: 7 });

  const b = partFrom('-Vector3.new(1, 2, 3)');
  assert.equal(b.status, 'ok', `harness threw: ${b.detail}`);
  assert.deepEqual(posOf(b), { k: 'Vector3', x: -1, y: -2, z: -3 });
});

test('a scalar multiplies from either side, as the engine allows', () => {
  const right = partFrom('Vector3.new(1, 2, 3) * 4');
  assert.equal(right.status, 'ok', `harness threw: ${right.detail}`);
  assert.deepEqual(posOf(right), { k: 'Vector3', x: 4, y: 8, z: 12 });

  const left = partFrom('3 * Vector3.new(1, 2, 3)');
  assert.equal(left.status, 'ok', `harness threw: ${left.detail}`);
  assert.deepEqual(posOf(left), { k: 'Vector3', x: 3, y: 6, z: 9 });
});

test('componentwise multiply and divide work', () => {
  const m = partFrom('Vector3.new(2, 3, 4) * Vector3.new(5, 2, 0.5)');
  assert.equal(m.status, 'ok', `harness threw: ${m.detail}`);
  assert.deepEqual(posOf(m), { k: 'Vector3', x: 10, y: 6, z: 2 });

  const d = partFrom('Vector3.new(10, 8, 6) / 2');
  assert.equal(d.status, 'ok', `harness threw: ${d.detail}`);
  assert.deepEqual(posOf(d), { k: 'Vector3', x: 5, y: 4, z: 3 });
});

test('Magnitude and Unit answer, because spacing along a direction uses them', () => {
  const built = buildUiTree(`
local v = Vector3.new(0, 3, 4)
local p = Instance.new("Part")
p.Name = "Probe"
p.Size = Vector3.new(1, 1, 1)
p.Position = v.Unit * v.Magnitude
p.Parent = game:GetService("Workspace")
`);
  assert.equal(built.status, 'ok', `harness threw: ${built.detail}`);
  const pos = posOf(built);
  assert.equal(pos.k, 'Vector3');
  assert.ok(Math.abs(pos.y - 3) < 1e-4, `y was ${pos.y}`);
  assert.ok(Math.abs(pos.z - 4) < 1e-4, `z was ${pos.z}`);
});

test('a Vector3 is serialised with its numbers, not flattened to "other"', () => {
  const built = partFrom('Vector3.new(7, 8, 9)');
  assert.equal(built.status, 'ok');
  const pos = posOf(built);
  assert.equal(pos.k, 'Vector3', 'losing X/Y/Z is what made a map unmeasurable');
  assert.deepEqual(pos, { k: 'Vector3', x: 7, y: 8, z: 9 });
});

test('the Unit of a zero vector is zero rather than a division by zero', () => {
  const built = partFrom('Vector3.new(0, 0, 0).Unit');
  assert.equal(built.status, 'ok', `harness threw: ${built.detail}`);
  assert.deepEqual(posOf(built), { k: 'Vector3', x: 0, y: 0, z: 0 });
});

/**
 * TWO MORE GAPS FROM THE SAME RUN, AND THE SAME CLASS OF DEFECT: correct Luau that this shim could
 * not execute, recorded as the model's failure. Both were found by generating real screens.
 */
test('Clone copies descendants, because that is the only reason anyone calls it', () => {
  const built = buildUiTree(`
local board = Instance.new("Part")
board.Name = "Board"
board.Size = Vector3.new(10, 6, 1)
board.Position = Vector3.new(0, 5, 0)
local surface = Instance.new("SurfaceGui")
surface.Name = "LeaderboardSurface"
surface.Parent = board
local title = Instance.new("TextLabel")
title.Name = "Title"
title.Text = "WEEKLY"
title.Parent = surface
board.Parent = game:GetService("Workspace")

local second = board:Clone()
second.Name = "Board2"
second.Position = Vector3.new(28, 5, 0)
second.Parent = game:GetService("Workspace")
local gui = second:FindFirstChild("LeaderboardSurface")
gui.Title.Text = "DAILY"
`);
  assert.equal(built.status, 'ok', `harness threw: ${built.detail}`);
  const labels = built.nodes.filter((n) => n.class === 'TextLabel').map((n) => n.props?.Text?.v);
  assert.deepEqual(labels.sort(), ['DAILY', 'WEEKLY'], 'the clone must carry its own copy of the label');
  assert.equal(built.nodes.filter((n) => n.class === 'SurfaceGui').length, 2, 'the SurfaceGui is cloned with the part');
});

test('a clone is unparented until the script parents it', () => {
  const built = buildUiTree(`
local f = Instance.new("Frame")
f.Name = "Original"
f.Parent = game:GetService("Players").LocalPlayer:WaitForChild("PlayerGui")
local c = f:Clone()
c.Name = "Copy"
`);
  assert.equal(built.status, 'ok', `harness threw: ${built.detail}`);
  const copy = built.nodes.find((n) => n.props?.Name?.v === 'Copy');
  assert.ok(copy, 'the clone exists');
  assert.equal(copy.parent, null, 'the engine returns a clone with no Parent');
});

test('StarterGui:SetCoreGuiEnabled answers, because every custom HUD disables the core one first', () => {
  const built = buildUiTree(`
local StarterGui = game:GetService("StarterGui")
StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.Health, false)
local gui = Instance.new("ScreenGui")
gui.Name = "Hud"
gui.Parent = game:GetService("Players").LocalPlayer:WaitForChild("PlayerGui")
`);
  assert.equal(built.status, 'ok', `harness threw: ${built.detail}`);
  assert.ok(built.nodes.some((n) => n.class === 'ScreenGui' && n.props?.Name?.v === 'Hud'), 'the HUD after the call still builds');
});
