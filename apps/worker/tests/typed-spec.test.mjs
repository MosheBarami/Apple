/**
 * RESTATED in M4. This was the last assertion of tests/compose.test.mjs's compose_game block ("composer values become the plugin's
 * typed values"), written against compose-run.ts, which is removed with the whole-game path. The function it pinned lives on in
 * typed-spec.ts and is used by dress-object, library-object, object-tool and studded-ui-tool, so the property is still live.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { propValue, typed } from '../src/typed-spec.ts';

test('recipe values become the plugin\'s typed values', () => {
  assert.deepEqual(propValue('Size', [4, 1, 4]), { t: 'Vector3', v: [4, 1, 4] });
  assert.deepEqual(propValue('Material', 'Grass'), { t: 'EnumItem', v: 'Enum.Material.Grass' });
  assert.deepEqual(propValue('TopSurface', 'Studs'), { t: 'EnumItem', v: 'Enum.SurfaceType.Studs' });
  const c = propValue('Color', '#ff8000');
  assert.equal(c.t, 'Color3'); assert.equal(c.v[0], 1); assert.ok(Math.abs(c.v[1] - 128 / 255) < 1e-9); assert.equal(c.v[2], 0);
  assert.deepEqual(propValue('Anchored', true), { t: 'bool', v: true });
  assert.deepEqual(propValue('', 'AppleTile'), { t: 'string', v: 'AppleTile' });
  assert.equal(propValue('X', undefined), undefined, 'a value it cannot type is dropped, not guessed');
});

test('an already typed value passes through unchanged, and a spec is typed recursively, props and attributes and children', () => {
  const udim = { t: 'UDim2', v: [0, 10, 0, 20] };
  assert.equal(propValue('Size', udim), udim);
  const spec = typed({ className: 'Frame', name: 'Panel', props: { Size: udim, Visible: false }, attributes: { slot: 3 }, children: [{ className: 'Part', name: 'Child', props: { Material: 'Wood' } }] });
  assert.deepEqual(spec.props, { Size: udim, Visible: { t: 'bool', v: false } });
  assert.deepEqual(spec.attributes, { slot: { t: 'number', v: 3 } });
  assert.deepEqual(spec.children[0].props, { Material: { t: 'EnumItem', v: 'Enum.Material.Wood' } });
  assert.equal('children' in typed({ className: 'Part', name: 'Leaf' }), false, 'no empty children list');
});
