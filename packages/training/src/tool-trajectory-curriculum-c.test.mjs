import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_TRAJECTORY_CURRICULUM_C } from './tool-trajectory-curriculum-c.mjs';
import { TOOL_TRAJECTORY_CURRICULUM } from './tool-trajectory-curriculum.mjs';
import { TOOL_TRAJECTORY_CURRICULUM_B } from './tool-trajectory-curriculum-b.mjs';
import { loadRegistry, verifyTrajectory, applyMutation } from './tool-trajectory-verify.mjs';

/**
 * Batch C's standing proof: every general visual-craft seed verifies against the live registry,
 * every declared mutation turns the verifier red (so green was watched failing on this data), the
 * families are new, and the seeds actually carry the techniques they exist to teach.
 */
const registry = await loadRegistry();
const C = TOOL_TRAJECTORY_CURRICULUM_C;

test('every batch C seed verifies against the live tool registry', async () => {
  const failures = [];
  for (const seed of C) {
    const result = await verifyTrajectory(seed, { registry });
    if (!result.ok) failures.push(`${seed.id}: ${result.problems.join('; ')}`);
  }
  assert.deepEqual(failures, [], failures.join('\n'));
  assert.ok(C.length >= 14, `batch C has ${C.length} seeds`);
});

test('every batch C mutation turns the verifier red, through several different arms', async () => {
  const silent = [];
  const arms = new Set();
  const arm = (p) =>
    /is not one of/.test(p) ? 'bad enum' :
    /is blank/.test(p) ? 'blank required string' :
    /expected \w+, got/.test(p) ? 'wrong type' :
    /plan validator refused it/.test(p) ? 'plan the product refuses' :
    /the trajectory never calls it/.test(p) ? 'plan promising an uncalled tool' :
    /typed envelope/.test(p) ? 'bare value where an envelope belongs' :
    /unknown property type/.test(p) ? 'unknown envelope kind' : 'other';
  for (const seed of C) {
    const result = await verifyTrajectory(applyMutation(seed), { registry });
    if (result.ok) silent.push(seed.id);
    for (const p of result.problems) arms.add(arm(p));
  }
  assert.deepEqual(silent, [], `these mutations proved nothing: ${silent.join(', ')}`);
  assert.ok(arms.size >= 6, [...arms].join(', '));
  assert.ok(!arms.has('other'), 'a mutation failed for a reason this test cannot name');
});

test('batch C families and ids are new to batches A and B, and unique inside C', () => {
  const earlier = [...TOOL_TRAJECTORY_CURRICULUM, ...TOOL_TRAJECTORY_CURRICULUM_B];
  const families = new Set(earlier.map((s) => s.family));
  const ids = new Set(earlier.map((s) => s.id));
  const seen = new Set();
  for (const seed of C) {
    assert.ok(!families.has(seed.family) && !seen.has(seed.family), `${seed.id}: family ${seed.family} repeats`);
    assert.ok(!ids.has(seed.id), `${seed.id}: id repeats`);
    seen.add(seed.family);
  }
});

test('the UI seeds carry the styling techniques, and the map seeds build in layers', () => {
  const classes = (items) => items.flatMap((i) => [i.className, ...classes(i.children ?? [])]);
  const uiCalls = C.filter((s) => s.family.startsWith('ui-')).flatMap((s) => s.trajectory).filter((t) => t.tool === 'create_instances');
  const uiClasses = new Set(uiCalls.flatMap((t) => classes(t.args.items)));
  for (const k of ['UIStroke', 'UICorner', 'UIGradient', 'UIAspectRatioConstraint', 'UIListLayout', 'UIGridLayout', 'ImageButton']) assert.ok(uiClasses.has(k), `no UI seed uses ${k}`);
  const text = JSON.stringify(C);
  for (const font of ['Enum.Font.FredokaOne', 'Enum.Font.LuckiestGuy']) assert.ok(text.includes(font), font);
  assert.ok(!/[^\x00-\x7F]"/.test(JSON.stringify(uiCalls)), 'a UI label uses a non-ASCII glyph that may render as an empty box');
  const tools = new Set(C.flatMap((s) => s.trajectory.map((t) => t.tool)));
  for (const t of ['shape_terrain', 'edit_terrain', 'scatter_instances', 'set_mood', 'check_ui_layout', 'check_composition']) assert.ok(tools.has(t), `no seed calls ${t}`);
});
