/**
 * BEFORE → AFTER, ON THE PROPERTY THAT CHANGED.
 *
 * The schema and the renderer have supported a genuine per-property before→after since they were
 * written: PropertyRow carries `changed` and `previous`, and render.tsx draws `<s>{previous}</s> →
 * {value}`. Nothing in the product ever filled them. A repo-wide grep for `changed: true` found it
 * set in one place — the design gallery.
 *
 * set_properties was a bare pass-through to the plugin op: it read no prior value and emitted no
 * panel, so a run that moved a wall 40 studs reported "set_properties ok" and the person had to go
 * and look. The read-before-write pattern is the one edit_script already uses to compute its diff.
 *
 * THE RULE THIS FILE EXISTS FOR: a value we did not read is not a value we can say changed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const { propertyChangeGroups } = await import('../src/property-diff.ts');

/** Stands in for tools.ts's own `displayTagged`, which is handed in rather than duplicated. */
const show = (v) => (v === null || v === undefined ? '—' : Array.isArray(v) ? v.join(', ') : String(v));

const rowsOf = (groups, name) => groups.find((g) => g.name === name)?.rows ?? [];

test('a property that really changed carries both halves', () => {
  const groups = propertyChangeGroups(
    { props: { Transparency: 0.5 }, attributes: {} },
    { props: { Transparency: 0 }, attributes: {} },
    show,
  );
  const [row] = rowsOf(groups, 'Properties');
  assert.equal(row.name, 'Transparency');
  assert.equal(row.value, '0.5');
  assert.equal(row.changed, true);
  assert.equal(row.previous, '0');
});

test('a property set to what it already was is shown, and is not called a change', () => {
  // Worth showing — it is a real fact about the run — and worth not colouring: a panel that marks
  // eight rows changed when one did teaches the reader to stop looking at the marks.
  const groups = propertyChangeGroups(
    { props: { Anchored: true }, attributes: {} },
    { props: { Anchored: true }, attributes: {} },
    show,
  );
  const [row] = rowsOf(groups, 'Properties');
  assert.equal(row.value, 'true');
  assert.equal(row.changed, undefined);
  assert.equal(row.previous, undefined);
});

test('a property that did not exist before is a change with nothing struck through', () => {
  // The renderer draws the strike-through only when `previous` is present, so this reads as a new
  // value rather than as a change from "—", which would be a claim about a value that was absent.
  const groups = propertyChangeGroups({ props: {}, attributes: { rarity: 'gold' } }, { props: {}, attributes: {} }, show);
  const [row] = rowsOf(groups, 'Attributes');
  assert.equal(row.changed, true);
  assert.equal(row.previous, undefined);
});

test('a read that failed marks NOTHING as changed', () => {
  // THE RULE. Absent evidence is absent: if the prior state could not be read, every row is a
  // plain value. Marking them changed would be a failure to observe rendered as an observation.
  const groups = propertyChangeGroups({ props: { Size: [4, 1, 2] }, attributes: {} }, null, show);
  const [row] = rowsOf(groups, 'Properties');
  assert.equal(row.value, '4, 1, 2');
  assert.equal(row.changed, undefined);
  assert.equal(row.previous, undefined);
});

test('only the keys the call actually touched appear', () => {
  // The panel is about what this call did. Listing every property the instance happens to have is
  // get_instance's job, and mixing them would make the changed rows impossible to find.
  const groups = propertyChangeGroups(
    { props: { Color: 'red' }, attributes: {} },
    { props: { Color: 'blue', Material: 'Neon', Size: [1, 1, 1] }, attributes: {} },
    show,
  );
  assert.deepEqual(rowsOf(groups, 'Properties').map((r) => r.name), ['Color']);
});

test('a group with no rows is dropped rather than rendered empty', () => {
  const groups = propertyChangeGroups({ props: { Color: 'red' }, attributes: {} }, null, show);
  assert.deepEqual(groups.map((g) => g.name), ['Properties']);
});

test('nothing written means no panel at all', () => {
  assert.deepEqual(propertyChangeGroups({ props: {}, attributes: {} }, null, show), []);
});

test('set_properties reads the instance before it writes, and emits the panel', () => {
  const tools = readFileSync(join(HERE, '..', 'src', 'tools.ts'), 'utf8');
  const at = tools.indexOf('  set_properties: {');
  assert.ok(at > 0);
  const body = tools.slice(at, tools.indexOf('  delete_instances: {', at));
  assert.match(body, /op: 'get_instance'/, 'the prior value has to be read before the write');
  assert.match(body, /propertyChangeGroups/);
  assert.match(body, /property_inspector/, 'and rendered through the block that has always had a renderer');
  // The read must come FIRST: reading after the write would report the value it just set as the
  // one that was there before, which is a confident lie rather than a missing panel.
  assert.ok(body.indexOf("op: 'get_instance'") < body.indexOf("op: 'set_props'"), 'the read must precede the write');
});
