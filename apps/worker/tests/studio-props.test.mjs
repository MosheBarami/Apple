/**
 * THE ONE BUILD THIS PRODUCT EVER ATTEMPTED IN THE OWNER'S PLACE, and why it failed.
 *
 * From the project's own operation log, 2026-09-19: snapshot ok, snapshot ok, get_tree ok, and then
 *
 *     op_4  create_instances  ok=0  "instance props.Position must be a typed property value"
 *
 * The model wrote `Position` without the `{t, v}` tag the wire uses. The worker forwarded it
 * unexamined, so the refusal was produced by the plugin, in Studio, after a round trip — and it is
 * a failed build in a customer's log rather than a correction the model could have made instantly.
 *
 * These tests are about the gate that now sits in front of both write paths. The interesting half
 * is not what it fixes; it is what it REFUSES to guess.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'studio-props-'));
const out = join(dir, 'm.mjs');
await build({ entryPoints: [join(HERE, '..', 'src', 'studio-props.ts')], bundle: true, format: 'esm', platform: 'neutral', outfile: out });
const M = await import(pathToFileURL(out).href);
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));

test('a value that is already tagged is passed through untouched', () => {
  const r = M.normaliseProps({ Position: { t: 'Vector3', v: [0, 5, 0] }, Anchored: { t: 'bool', v: true } });
  assert.deepEqual(r.props.Position, { t: 'Vector3', v: [0, 5, 0] });
  assert.equal(r.normalised.length, 0, 'nothing was wrong, so nothing should be reported as fixed');
  assert.equal(r.refusals.length, 0);
});

test('WHAT CANNOT BE ANYTHING ELSE IS TAGGED, and the build succeeds instead of failing', () => {
  const r = M.normaliseProps({ Transparency: 0.5, Anchored: true, Name: 'Floor', Material: 'Enum.Material.Neon', Parent: null });
  assert.deepEqual(r.props.Transparency, { t: 'number', v: 0.5 });
  assert.deepEqual(r.props.Anchored, { t: 'bool', v: true });
  assert.deepEqual(r.props.Name, { t: 'string', v: 'Floor' });
  // A string that spells an enum is an enum. Tagging it `string` would send "Enum.Material.Neon"
  // as a name and set nothing.
  assert.deepEqual(r.props.Material, { t: 'EnumItem', v: 'Enum.Material.Neon' });
  assert.deepEqual(r.props.Parent, { t: 'nil' });
  assert.equal(r.refusals.length, 0);
  assert.equal(r.normalised.length, 5);
});

test('AN ARRAY IS REFUSED, NOT GUESSED — this is the whole reason the wire is tagged', () => {
  const r = M.normaliseProps({ Position: [0, 5, 0], Color: [1, 0.5, 0] });
  assert.equal(Object.keys(r.props).length, 0, 'nothing may be sent when part of the set is unreadable');
  assert.equal(r.refusals.length, 2);
  // The message has to carry the repair, because "must be a typed property value" is what the
  // plugin already said and the model wrote it wrong anyway.
  for (const ref of r.refusals) {
    assert.match(ref.message, /"t":"Vector3"/);
    assert.match(ref.message, /Color3/);
    assert.ok(ref.message.startsWith(ref.name), 'a refusal must name the property it is about');
  }
  // Falsification of the design, not just the code: [1,0.5,0] is a valid Vector3 AND a valid
  // Color3, so any implementation that produced a value here would be guessing.
  assert.deepEqual(r.props.Position, undefined);
  assert.deepEqual(r.props.Color, undefined);
});

test('a half-written tagged value is refused rather than treated as a plain object', () => {
  // `{v: [0,5,0]}` with no `t` is the shape a model produces when it half-remembers the format.
  const r = M.normaliseProps({ Position: { v: [0, 5, 0] } });
  assert.equal(r.refusals.length, 1);
  assert.match(r.refusals[0].message, /no "t"/);
});

test('a non-finite number is refused, because NaN is not a number the wire can carry', () => {
  const r = M.normaliseProps({ Transparency: Number.NaN, Reflectance: Number.POSITIVE_INFINITY });
  assert.equal(r.refusals.length, 2);
  assert.equal(Object.keys(r.props).length, 0);
});

test('CHILDREN ARE WHERE THIS MATTERS MOST, and a refusal says which one', () => {
  const items = [
    { className: 'Model', name: 'House', props: { Name: 'House' }, children: [
      { className: 'Part', name: 'Wall', props: { Position: [0, 5, 0], Anchored: true } },
    ] },
  ];
  const r = M.normaliseItems(items);
  assert.equal(r.refusals.length, 1);
  // An item list of twenty has twenty Sizes in it; "Size" alone is not an answer.
  assert.equal(r.refusals[0].name, 'items[0].children[0].props.Position');
  // And the sibling that WAS readable is still reported as fixed, so the model can see both halves.
  assert.ok(r.normalised.some((n) => n.name === 'items[0].children[0].props.Anchored'));
});

test('a clean item list comes back with its props rewritten and nothing else changed', () => {
  const items = [{ className: 'Part', name: 'Floor', parent: 'Workspace', props: { Anchored: true } }];
  const r = M.normaliseItems(items);
  assert.equal(r.refusals.length, 0);
  assert.equal(r.items[0].className, 'Part');
  assert.equal(r.items[0].parent, 'game.Workspace', 'the plugin resolves only paths rooted at game');
  assert.deepEqual(r.items[0].props.Anchored, { t: 'bool', v: true });
  // The input must not be mutated: the caller may still hold it for the transcript.
  assert.equal(items[0].props.Anchored, true);
});

test('the exact payload from the failed op is now caught before it leaves the worker', () => {
  // Reconstructed from op_4_mu8vhmsn: a create_instances whose Position was not tagged.
  const r = M.normaliseItems([{ className: 'Part', name: 'Ground', props: { Position: [0, 0, 0], Size: [100, 1, 100] } }]);
  assert.equal(r.refusals.length, 2, 'the op that failed in Studio must fail here instead');
  assert.match(r.refusals[0].message, /only you know which you meant/);
});

// ---- item SHAPE (2026-09-22, vis-01 street lamp after D-RUN-1) --------------------------------------
// The plugin refused two create_instances calls in a row — "className must be a string", then "path
// must be a string" — because the tool's item schema was an untyped object and the model wrote
// Roblox's own property spelling. Unambiguous spellings are renamed here; nothing is guessed.

test('Roblox-spelled item keys are renamed to the wire fields, recursively', () => {
  const r = M.normaliseItems([{ ClassName: 'Model', Name: 'StreetLamp', Parent: 'Workspace',
    Children: [{ ClassName: 'Part', Name: 'Post', Properties: { Anchored: true } }] }]);
  assert.equal(r.refusals.length, 0, JSON.stringify(r.refusals));
  const [lamp] = r.items;
  assert.equal(lamp.className, 'Model');
  assert.equal(lamp.name, 'StreetLamp');
  assert.equal(lamp.parent, 'game.Workspace');
  assert.equal('ClassName' in lamp, false, 'the alias must not travel beside the field');
  assert.equal(lamp.children[0].className, 'Part');
  assert.deepEqual(lamp.children[0].props.Anchored, { t: 'bool', v: true }, 'renamed props are still tagged');
});

test('a top-level item with no parent is built in Workspace; children never gain one', () => {
  const r = M.normaliseItems([{ className: 'Model', name: 'Lamp', children: [{ className: 'Part', name: 'Post' }] }]);
  assert.equal(r.items[0].parent, 'game.Workspace');
  assert.equal('parent' in r.items[0].children[0], false);
});

test('a parent written as a tagged Instance or a {path} object means its path', () => {
  const r = M.normaliseItems([
    { className: 'Part', name: 'A', parent: { t: 'Instance', v: 'Workspace.Town' } },
    { className: 'Part', name: 'B', parent: { path: 'Workspace.Town' } },
  ]);
  assert.deepEqual(r.items.map((i) => i.parent), ['game.Workspace.Town', 'game.Workspace.Town']);
});

// 2026-09-22, coin game run 76b59615: the first create_instances was refused by the plugin with
// 'path must start with "game"', because the default above was the bare 'Workspace'. The rule is the
// plugin's, so it is read from the plugin source rather than restated here from memory.
test('every top-level parent is rooted at game, as the plugin path resolver requires', async () => {
  const { readFileSync } = await import('node:fs');
  const plugin = readFileSync(new URL('../../apple-plugin/src/Commands.luau', import.meta.url), 'utf8');
  assert.match(plugin, /if first ~= "game" then return nil, 'path must start with "game"' end/,
    'the plugin no longer requires game-rooted paths — revisit parentPath() in studio-props.ts');
  const r = M.normaliseItems([
    { className: 'Part', name: 'A' },
    { className: 'Part', name: 'B', parent: 'Workspace' },
    { className: 'Part', name: 'C', parent: 'workspace.Coins' },
    { className: 'Part', name: 'D', parent: 'game.ReplicatedStorage' },
    { className: 'Part', name: 'E', parent: 'ServerStorage' },
    { className: 'Part', name: 'F', parent: { t: 'Instance', v: 'game.Workspace' } },
  ]);
  assert.deepEqual(r.items.map((i) => i.parent),
    ['game.Workspace', 'game.Workspace', 'game.Workspace.Coins', 'game.ReplicatedStorage', 'game.ServerStorage', 'game.Workspace']);
  for (const i of r.items) assert.match(i.parent, /^game(\.|$)/);
});

test('an item with NO className is refused in the worker, before any round trip to Studio', () => {
  const r = M.normaliseItems([{ name: 'Mystery' }, { className: 'Part', name: 'Ok', children: [{ name: 'Orphan' }] }]);
  const names = r.refusals.map((x) => x.name);
  assert.ok(names.includes('items[0].className'), JSON.stringify(names));
  assert.ok(names.includes('items[1].children[0].className'), JSON.stringify(names));
});

test('control: an item already in wire shape is passed through with its fields unchanged', () => {
  const item = { className: 'Part', name: 'Floor', parent: 'game.Workspace.Town', props: { Size: { t: 'Vector3', v: [4, 1, 4] } } };
  const r = M.normaliseItems([item]);
  assert.equal(r.refusals.length, 0);
  assert.deepEqual(r.items[0], item);
});
