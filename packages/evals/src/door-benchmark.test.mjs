// THE DOOR BENCHMARK MUST BE ABLE TO FAIL.
//
// The mandate makes the interactive door the first release gate, and a gate that passes everything
// is not a gate. So this grades the door tasks against REAL outputs collected during training —
// including three that were genuinely broken — and asserts the suite separates them.
//
// Each bad case is a failure that actually happened:
//   apple-v1   looped out seven `Instance.new("Joint")` calls. "Joint" is not a Roblox class.
//   apple-v2   emitted `doorService:GetDoorByHandle(doorHandle)` — a service and a method that do
//              not exist, because it was trained on library internals and wrote code that belongs
//              inside a framework nobody defined.
//   the base   set `prompt.Visible`, which ProximityPrompt does not have, and used bare `wait()`.
//   plus the client-trusted-authority shape, where the server takes `hasKey` from the request.
//
// If a future model reintroduces any of these, one of these tasks has to go red.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTasks } from './tasks.mjs';
import { gradeTask } from './grade.mjs';

const { tasks } = loadTasks({ categories: ['door-mechanic'] });
const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));

// A correct door: connected prompt, real APIs, debounce, task library.
const GOOD = '```luau\n' + `
local TweenService = game:GetService("TweenService")
local door = script.Parent
local hinge = door:WaitForChild("Hinge")
local prompt = door:WaitForChild("DoorPrompt")

local isMoving = false
local isOpen = false

local function swing(targetCFrame)
	isMoving = true
	prompt.Enabled = false
	local tween = TweenService:Create(hinge, TweenInfo.new(0.5), { CFrame = targetCFrame })
	tween:Play()
	tween.Completed:Wait()
	prompt.Enabled = true
	isMoving = false
end

local closedCFrame = hinge.CFrame
local openCFrame = closedCFrame * CFrame.Angles(0, math.rad(90), 0)

prompt.PromptTriggered:Connect(function(player)
	if isMoving then
		return
	end
	isOpen = not isOpen
	swing(isOpen and openCFrame or closedCFrame)
	if isOpen then
		task.delay(3, function()
			if isOpen and not isMoving then
				isOpen = false
				swing(closedCFrame)
			end
		end)
	end
end)
` + '\n```';

// The real failures observed this session.
const V1_OUTPUT = '```luau\n' + `
local function createDoor()
	local doorModel = Instance.new("Model")
	local doorJoint = Instance.new("Joint")
	doorJoint.Parent = doorModel
	local doorJoint2 = Instance.new("Joint")
	doorJoint2.Parent = doorModel
end
` + '\n```';

const V2_OUTPUT = '```luau\n' + `
local function openDoor()
	local door = doorService:GetDoorByHandle(doorHandle)
	if door then
		door:Open()
	end
end
` + '\n```';

const BASE_OUTPUT = '```luau\n' + `
local ProximityPrompt = Instance.new("ProximityPrompt")
ProximityPrompt.Name = "DoorPrompt"
ProximityPrompt.Enabled = true
ProximityPrompt.Visible = 0.5
ProximityPrompt.MaxRadius = 2
local function OpenDoor()
	wait(1)
end
` + '\n```';

const CLIENT_TRUSTED = '```luau\n' + `
local remote = game.ReplicatedStorage:WaitForChild("OpenDoor")
remote.OnServerEvent:Connect(function(player, hasKey)
	if hasKey then
		script.Parent.CanCollide = false
	end
end)
` + '\n```';

const CASES = [
  ['GOOD door', GOOD, ['door-01-proximity-open-close', 'door-02-no-invented-api', 'door-04-cleanup-and-state'], true],
  ['apple-v1 (Joint loop)', V1_OUTPUT, ['door-02-no-invented-api'], false],
  ['apple-v2 (doorService)', V2_OUTPUT, ['door-02-no-invented-api'], false],
  ['base (prompt.Visible, bare wait)', BASE_OUTPUT, ['door-01-proximity-open-close', 'door-04-cleanup-and-state'], false],
  ['client-trusted hasKey', CLIENT_TRUSTED, ['door-03-server-authority'], false],
];

test('the door tasks load and validate', () => {
  assert.equal(tasks.length, 4, 'four door tasks expected');
  for (const t of tasks) assert.ok(t.checks.length >= 4, `${t.id} needs real checks`);
});

test('a correct door passes, and every real broken output fails', () => {
  for (const [label, text, ids, shouldPass] of CASES) {
    for (const id of ids) {
      const task = byId[id];
      assert.ok(task, `missing task ${id}`);
      const r = gradeTask(task, text);
      const passed = r.score >= 1 - 1e-9;
      assert.equal(passed, shouldPass, `${label} on ${id}: scored ${r.score.toFixed(2)}, expected ${shouldPass ? 'pass' : 'fail'}`);
    }
  }
});

test('every check carries a reason, so a red result explains itself', () => {
  // A check whose failure means nothing to the reader is a check nobody will act on.
  for (const t of tasks) {
    for (const c of t.checks) {
      if (c.type === 'luau_syntax' || c.type === 'no_antipattern') continue; // self-describing
      assert.ok(typeof c.why === 'string' && c.why.length > 20, `${t.id}: check ${c.type} needs a why`);
    }
  }
});
