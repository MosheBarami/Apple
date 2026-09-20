/**
 * THE PLAN MUST NOT QUIETLY LOSE PART OF THE MAP.
 *
 * A plan view is a drawing of a subset: only parts this process can read a Size and a Position off
 * appear in it. The danger is not that the subset exists — it is that the subset is invisible, so a
 * map whose walls were all placed by CFrame draws as an empty field and reads as "the model built
 * almost nothing". That is a failure to observe rendering as an observation, which this repository
 * refuses.
 *
 * So every refusal is counted, and these guards hold the counters honest.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectParts, renderMapPlan, PART_CLASSES } from './render-map-plan.mjs';

const v3 = (x, y, z) => ({ k: 'Vector3', x, y, z });
const col = (r, g, b) => ({ k: 'Color3', r, g, b });
const str = (v) => ({ k: 'str', v });
const node = (id, cls, props) => ({ id, class: cls, props, children: [] });

test('a part placed by CFrame is counted unplaceable, never silently dropped', () => {
  const nodes = [
    node(1, 'Part', { Name: str('Floor'), Size: v3(100, 1, 100), Position: v3(0, 0, 0), Color: col(0.3, 0.4, 0.3) }),
    // CFrame is opaque in the harness, so Position never lands on the node.
    node(2, 'Part', { Name: str('Wall'), Size: v3(2, 10, 40), Color: col(0.5, 0.5, 0.5) }),
    node(3, 'Part', { Name: str('Tower'), Size: v3(4, 30, 4), Color: col(0.6, 0.2, 0.2) }),
  ];
  const got = collectParts(nodes);

  assert.equal(got.parts.length, 1, 'only the part with real coordinates is drawable');
  assert.equal(got.unplaceable, 2, 'both CFrame-placed parts must be reported, not lost');
  assert.equal(got.unsized, 0);
});

test('a part with no Size is counted unsized', () => {
  const got = collectParts([node(1, 'Part', { Name: str('Ghost'), Position: v3(0, 0, 0) })]);
  assert.equal(got.parts.length, 0);
  assert.equal(got.unsized, 1);
  assert.equal(got.unplaceable, 0, 'a missing Size is a different finding from a missing Position');
});

test('a BrickColor part is drawn neutral and counted, not given an invented colour', () => {
  const got = collectParts([
    node(1, 'Part', { Name: str('Brick'), Size: v3(4, 4, 4), Position: v3(0, 0, 0) }),
  ]);
  assert.equal(got.parts.length, 1, 'it still occupies space, so it still draws');
  assert.equal(got.unknownColour, 1, 'the missing colour must be disclosed');
  assert.equal(got.parts[0].colour, '#6f6f78', 'a flat neutral, not a guess at what BrickColor meant');
});

test('a map where nothing is placeable refuses to draw rather than drawing an empty field', () => {
  const got = collectParts([node(1, 'Part', { Name: str('W'), Size: v3(2, 10, 40), Color: col(1, 1, 1) })]);
  const plan = renderMapPlan({ parts: got.parts });
  assert.equal(plan.svg, null, 'an empty plan is a lie about the map; refuse instead');
  assert.match(plan.reason, /Size and a Position/);
});

test('the plan places a part at its real coordinates and states the scale it drew', () => {
  const nodes = [
    node(1, 'Part', { Name: str('Ground'), Size: v3(200, 1, 120), Position: v3(0, 0, 0), Color: col(0.2, 0.5, 0.2) }),
    node(2, 'SpawnLocation', { Name: str('Spawn'), Size: v3(6, 1, 6), Position: v3(0, 1, 0), Color: col(0.3, 0.9, 0.5) }),
  ];
  const got = collectParts(nodes);
  const plan = renderMapPlan({ parts: got.parts, width: 800, height: 600 });

  assert.equal(plan.drawn, 2);
  assert.equal(plan.bounds.studsWide, 200, 'the plan reports the real extent in studs');
  assert.equal(plan.bounds.studsDeep, 120);
  assert.ok(plan.svg.includes('SPAWN'), 'a spawn is marked, because it is the first thing a reader looks for');
  assert.ok(
    plan.svg.includes('rotation not modelled'),
    'every plan must say what it cannot see, on the drawing itself',
  );
});

test('a SpawnLocation is recognised as a part class', () => {
  assert.ok(PART_CLASSES.has('SpawnLocation'));
  assert.ok(PART_CLASSES.has('MeshPart'));
  assert.ok(!PART_CLASSES.has('Frame'), 'a GUI object has no place in a world plan');
});
