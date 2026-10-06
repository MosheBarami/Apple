// WorldKit (style bible §4): world nodes expand to anchored, tagged parts, and keep the recipe's place in the tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandWorld, WORLD_COMPONENTS } from '../src/worldkit.ts';

test('every component expands, keeps its parent, and tags and anchors every part', () => {
  const nodes = {
    path: { from: [0, 0], to: [0, -40] },
    stall: { at: [10, -20], title: 'Eggs' },
    hill: { at: [0, -120] },
    hillring: { center: [0, 0] },
    flowers: { at: [-10, -10] },
  };
  assert.deepEqual(Object.keys(nodes).sort(), [...WORLD_COMPONENTS].sort());
  for (const [world, n] of Object.entries(nodes)) {
    const out = expandWorld({ world, parent: 'game.Workspace', ...n });
    assert.equal(out.parent, 'game.Workspace', `${world} keeps the recipe's parent`);
    const parts = [];
    const walk = (s) => { if (s.className === 'Part') parts.push(s); (s.children ?? []).forEach(walk); };
    walk(out);
    assert.ok(parts.length > 0, world);
    for (const p of parts) {
      assert.equal(p.props.Anchored, true, `${world}.${p.name} is anchored`);
      assert.match(p.attributes.WorldKit, /^\w+\.\w+$/, `${world}.${p.name} carries its WorldKit tag`);
    }
  }
});

test('an unknown component is refused by name', () => {
  assert.throws(() => expandWorld({ world: 'castle' }), /no component "castle"/);
});
