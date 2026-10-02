/**
 * build_object: one object from the agent's own spec (owner, 2026-10-01: dumb questions, perfect results, fast).
 *
 * RESTATED phase 1 (2026-10-02, after the 13-item benchmark): the tool used to be a smart harness. It laid out keyboards,
 * recoloured and reshaped parts by their NAMES (a stick is long, a coin is flat, a "glow" glows, a "wrapper" goes under),
 * grew small things, wobbled everything that did not move, added a stage, a counter and "Click it!" to every object, moved
 * the spawn and painted the Baseplate. Every one of those was a decision the harness made about taste, from words of
 * earlier benchmarks. Now the agent decides and the tool builds exactly what the spec says; what it measures it reports
 * (`checks`) and the agent acts on it or not. These tests pin that contract; they assert properties, not expressions.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'object-'));
const entry = join(dir, 'entry.ts');
writeFileSync(entry, `export * from '${join(WORKER, 'src', 'object-tool.ts')}';\nexport { TOOLS, recoverJsonObject } from '${join(WORKER, 'src', 'tools.ts')}';\n`);
const out = join(dir, 'o.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [entry, '--bundle', '--format=esm', '--target=es2022', '--platform=node', '--outfile=' + out, '--external:cloudflare:*', '--log-level=error'], { cwd: WORKER, stdio: 'pipe' });
const O = await import(`file://${out}`);
const src = (f) => readFileSync(join(WORKER, 'src', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** A fake Studio: records every op and says "exists" for what was created. */
function studio(init = {}) {
  const ops = [];
  const exists = new Set(init.exists ?? []);
  return {
    ops, exists,
    ctx: {
      env: {}, studioConnected: () => true, createCheckpoint: async () => ({ id: 'cp' }), userRequest: () => init.request ?? 'make something',
      execStudioOp: async (op) => {
        ops.push(op);
        if (op.op === 'get_instance') return exists.has(op.path) ? { ok: true, data: {} } : { ok: false, error: 'not found' };
        if (op.op === 'create_instances') { for (const i of op.items) exists.add(`${i.parent}.${i.name}`); return { ok: true, data: {} }; }
        if (op.op === 'delete_instances') { for (const p of op.paths) exists.delete(p); return { ok: true, data: {} }; }
        if (op.op === 'spatial_query') return { ok: true, data: { parts: [], count: 0 } };
        if (op.op === 'get_tree') return { ok: true, data: { root: { name: 'StarterGui', children: [] } } };
        return { ok: true, data: {} };
      },
    },
  };
}
const created = (ops) => ops.filter((o) => o.op === 'create_instances').flatMap((o) => o.items.map((i) => `${i.parent}.${i.name}`));
const writes = (ops) => ops.filter((o) => !['get_instance', 'get_tree', 'spatial_query'].includes(o.op));
const CHEST = { name: 'Chest', parts: [
  { name: 'Body', size: [6, 3, 4], at: [0, 1.5, 0], color: '#8e5b32' },
  { name: 'Lid', size: [6, 1, 4], at: [0, 3.5, 0], color: '#a46b3a' },
  { name: 'Lock', shape: 'ball', size: [1, 1, 1], at: [0, 2.5, 2.3], color: '#ffc83d' },
] };

// ------------------------------------------------------------------------------------------- the spec ---

test('a spec expands to exactly the parts it lists, with the positions and sizes it gave', () => {
  const plan = O.expandObject(CHEST);
  assert.ok(!('error' in plan), JSON.stringify(plan));
  assert.deepEqual(plan.parts.map((p) => p.name), ['Body', 'Lid', 'Lock']);
  assert.deepEqual(plan.parts[0].size, [6, 3, 4]);
  assert.deepEqual(plan.parts[2].at, [0, 2.5, 2.3]);
  assert.equal(plan.parts[2].shape, 'ball');
  assert.equal(plan.footprint.top, 4, 'the measured top');
});

test('nothing is grown, reshaped, turned, recoloured or moved by what a part is called', () => {
  // A small thing stays small; a thing whose parts are named like words of old benchmarks is left exactly as written.
  const names = ['Wrapper', 'Label', 'Cap', 'Handle', 'GlowStripe', 'Flame', 'Icing', 'Base', 'Top', 'Stand', 'Stem', 'Ring'];
  const spec = { name: 'Tiny', parts: names.map((n, i) => ({ name: n, size: [1, 1, 1], at: [0, 0.5, 0], color: '#ffe066', ...(i === 0 ? { text: 'x' } : {}) })) };
  const plan = O.expandObject(spec);
  assert.ok(!('error' in plan));
  for (const p of plan.parts) {
    assert.deepEqual(p.size, [1, 1, 1], `${p.name} was resized`);
    assert.deepEqual(p.at, [0, 0.5, 0], `${p.name} was moved`);
    assert.equal(p.color, '#ffe066', `${p.name} was recoloured`);
    assert.equal(p.material, undefined, `${p.name} was made Neon by its name`);
    assert.equal(p.move, undefined, `${p.name} was given a move`);
  }
  assert.equal(plan.parts[0].text.color, '#ffffff', 'the ink is the spec\'s (white when it gave none), not repainted dark');
  assert.equal(plan.grown, undefined);
  assert.equal(plan.gaveMotion, undefined);
});

test('a thing named like a long or a flat thing keeps the proportions the agent wrote', () => {
  for (const name of ['Stick', 'Pizza', 'Plank', 'Coin']) {
    const plan = O.expandObject({ name, parts: [{ name: 'Body', size: [4, 4, 4], at: [0, 2, 0], color: '#ffffff' }] });
    assert.deepEqual(plan.parts[0].size, [4, 4, 4], name);
  }
  assert.equal(O.shapeWord, undefined);
  assert.equal(O.fitFactor, undefined);
  assert.equal(O.giveMotion, undefined);
  assert.equal(O.unbury, undefined);
  assert.equal(O.keyboardTheme, undefined);
  assert.equal(O.isObjectRequest, undefined, 'a request classifier does not route');
});

test('a part gets Neon only when the spec says Neon', () => {
  const plan = O.expandObject({ name: 'Lamp', parts: [
    { name: 'GlowBulb', size: [1, 1, 1], at: [0, 1, 0], color: '#ffffff' },
    { name: 'Bulb', size: [1, 1, 1], at: [0, 2, 0], color: '#ffffff', material: 'Neon' },
  ] });
  assert.deepEqual(plan.parts.map((p) => p.material), [undefined, 'Neon']);
});

test('names may be in any language; a repeated name is renamed; an unnamed part is named for its look', () => {
  const plan = O.expandObject({ name: 'ברווז גומי', parts: [
    { name: 'גוף', size: [2, 2, 2], at: [0, 1, 0], color: '#ffe066' },
    { name: 'גוף', size: [1, 1, 1], at: [0, 3, 0], color: '#ffe066' },
    { shape: 'wedge', size: [1, 1, 1], at: [0, 4, 0], color: '#ff8800' },
  ] });
  assert.equal(plan.name, 'ברווז גומי');
  assert.deepEqual(plan.parts.map((p) => p.name), ['גוף', 'גוף_2', 'OrangeWedge']);
  assert.match(O.expandObject({ name: '...', parts: [{ name: 'A', size: [1, 1, 1] }] }).error, /name the object/);
  assert.equal(O.lookName('#ffd23f', 'block'), 'YellowBlock');
  assert.equal(O.lookName('#4fd8ff', 'wedge'), 'CyanWedge');
});

test('a bad spec is refused with a reason, before anything is built', () => {
  for (const [spec, why] of [
    [{ name: 'X', parts: [] }, /parts is empty/],
    [{ name: 'X', parts: [{ at: [0, 0, 0], color: '#ffffff' }] }, /no part could be read/],
    [{ name: 'X', parts: [{ size: [1, 1, 1], at: [0, 0, 0], color: '#ffffff', move: { as: 'dance' } }] }, /move.as/],
    [{ name: 'X', parts: [{ size: [1, 1, 1], at: [0, 0, 0], color: '#ffffff', repeat: { grid: [30, 30, 1], step: [1, 0, 1] } }] }, /more than/],
    [{ name: 'X', scale: 0, parts: [{ size: [1, 1, 1] }] }, /scale/],
  ]) {
    const r = O.expandObject(spec);
    assert.ok('error' in r, JSON.stringify(spec));
    assert.match(r.error, why);
  }
});

test('slips a model makes are fixed, not fatal: colour names, odd shapes and key words', () => {
  const plan = O.expandObject({ name: 'Pad', parts: [
    { name: 'one', shape: 'cube', size: [1, 1, 1], at: [0, 0, 0], color: 'red', text: '1', key: '1', move: { as: 'press', on: 'key' } },
    { name: 'Space', size: [4, 1, 1], at: [0, 0, 2], color: 'fff', key: 'space', move: { as: 'press', on: 'keypress' } },
    { size: [1, 1, 1], at: [3, 0, 0], color: 'not a colour', repeat: { grid: [2, 1, 1], step: [1.1, 0, 0], texts: ['a', ','], keys: ['a', 'Comma'] }, move: { as: 'press', on: 'key' } },
  ] });
  assert.ok(!('error' in plan), JSON.stringify(plan));
  const [one, space, a, comma] = plan.parts;
  assert.equal(one.shape, 'block'); assert.equal(one.color, '#ff4b4b'); assert.equal(one.key, 'One');
  assert.equal(space.key, 'Space'); assert.equal(space.color, '#ffffff'); assert.equal(space.move.on, 'key');
  assert.equal(a.key, 'A'); assert.equal(comma.key, 'Comma'); assert.equal(a.color, '#d7dde2', 'an unknown colour falls back to light grey');
});

test('the words printed on a part are never read as a key: only a key the agent names binds one', () => {
  const plan = O.expandObject({ name: 'Sign', parts: [{ name: 'Face', size: [4, 4, 1], at: [0, 2, 0], color: '#222222', text: 'Q', move: { as: 'press', on: 'key' } }] });
  assert.equal(plan.parts[0].key, undefined, 'the letter on it did not bind the Q key');
  assert.equal(O.keyCodeName('KING'), undefined);
  assert.equal(O.keyCodeName('q'), 'Q');
  assert.equal(O.keyCodeName('LeftShift'), 'LeftShift');
});

test('positions come however a model writes them, and a missing one stands on the ground', () => {
  const plan = O.expandObject({ name: 'Thing', parts: [
    { name: 'A', size: [2, 2, 2], position: { x: 4, y: 1, z: 0 }, color: '#ffffff' },
    { name: 'B', size: [2, 2, 2], pos: '0, 1, 4', color: '#ffffff' },
    { name: 'C', size: [2, 4, 2], color: '#ffffff' },
  ] });
  assert.ok(!('error' in plan), JSON.stringify(plan));
  assert.deepEqual(plan.parts.map((p) => p.at), [[4, 1, 0], [0, 1, 4], [0, 2, 0]]);
});

test('a part with a flat or missing size does not sink the object', () => {
  const plan = O.expandObject({ name: 'Y', parts: [{ name: 'A', size: [1, 1, 1], at: [0, 0, 0], color: '#ffffff' }, { name: 'Sheet', size: [4, 0, 2], at: [0, 1, 0], color: '#ffffff' }, { name: 'Lost', at: [0, 0, 0] }] });
  assert.ok(!('error' in plan), JSON.stringify(plan));
  assert.equal(plan.parts.length, 2);
  assert.equal(plan.parts[1].size[1], 0.2, 'a flat side is made thin, not refused');
  assert.match(plan.skipped[0], /Lost/);
});

test('colours come in every way a model writes them', () => {
  assert.equal(O.colourHex([255, 0, 128]), '#ff0080');
  assert.equal(O.colourHex([1, 0.5, 0]), '#ff8000');
  assert.equal(O.colourHex({ r: 0, g: 255, b: 0 }), '#00ff00');
  assert.equal(O.colourHex('rgb(10, 20, 30)'), '#0a141e');
  assert.equal(O.colourHex('Bright red'), '#c4281c');
  assert.equal(O.colourHex('#ABCDEF'), '#abcdef');
});

test('scale multiplies sizes and positions, and nothing else grows it', () => {
  const plan = O.expandObject({ name: 'Scaled', scale: 3, parts: [{ name: 'A', size: [1, 1, 1], at: [1, 0.5, 0], color: '#fff' }] });
  assert.deepEqual(plan.parts[0].size, [3, 3, 3]);
  assert.deepEqual(plan.parts[0].at, [3, 1.5, 0]);
});

test('a repeat grid unrolls one entry into many, each named, at its step', () => {
  const plan = O.expandObject({ name: 'Row', parts: [{ name: 'Tile', size: [1, 1, 1], at: [0, 0.5, 0], color: '#ffffff', repeat: { grid: [3, 1, 2], step: [2, 0, 2], names: ['a', 'b'], texts: ['1', '2', '3', '4', '5', '6'] } }] });
  assert.equal(plan.parts.length, 6);
  assert.equal(new Set(plan.parts.map((p) => p.name)).size, 6);
  assert.deepEqual(plan.parts[5].at, [4, 0.5, 2]);
  assert.equal(plan.parts[3].text.value, '4');
});

// ----------------------------------------------------------------------------------------- rows (a grid) ---

test('a rows entry is a generic grid of the agent\'s labels: nothing overlaps, widths and colours are the agent\'s', () => {
  const plan = O.expandObject({ name: 'Grid', parts: [{ name: 'Cell', rows: [['A', 'B', 'C'], ['D', 'Wide']], widths: { Wide: 3 }, unit: 2, colors: ['#ff0000', '#00ff00'], case: '#222222', move: { as: 'press', on: 'click' } }] });
  assert.ok(!('error' in plan), JSON.stringify(plan));
  const cells = plan.parts.filter((p) => !p.own);
  assert.equal(cells.length, 5);
  assert.deepEqual(cells.map((c) => c.text.value), ['A', 'B', 'C', 'D', 'Wide'], 'the labels are the agent\'s, as written (no case change)');
  const wide = cells.find((c) => c.text.value === 'Wide');
  const a = cells[0];
  assert.ok(wide.size[0] > a.size[0] * 2.5, 'a width the agent gave');
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const [p, q] = [cells[i], cells[j]];
    const overlap = [0, 2].every((k) => Math.abs(p.at[k] - q.at[k]) < (p.size[k] + q.size[k]) / 2 - 1e-6);
    assert.equal(overlap, false, `${p.name} overlaps ${q.name}`);
  }
  assert.deepEqual([...new Set(cells.map((c) => c.color))].sort(), ['#00ff00', '#ff0000']);
  assert.ok(plan.parts.some((p) => p.own && /Case$/.test(p.name)), 'a case under it, because the spec asked for one');
  assert.ok(cells.every((c) => c.move.as === 'press' && c.move.on === 'click'));
});

test('rows binds a real key only to cells the agent named a key for, and has no layout, theme or modifiers of its own', () => {
  const plan = O.expandObject({ name: 'Pad', parts: [{ name: 'K', rows: [['x', 'y']], keys: [['X', 'Y']], move: { as: 'press', on: 'key' }, case: false }] });
  assert.deepEqual(plan.parts.map((p) => p.key), ['X', 'Y']);
  assert.equal(plan.parts.length, 2, 'no case, no rows of modifiers, no function row');
  const unkeyed = O.expandObject({ name: 'Pad', parts: [{ name: 'K', rows: [['x', 'y']], move: { as: 'press', on: 'key' }, case: false }] });
  assert.deepEqual(unkeyed.parts.map((p) => p.move.on), ['click', 'click'], 'with no key named it is pressed by click');
  const code = src('object-tool.ts');
  for (const gone of ['keyboardTheme', 'KEY_WIDTH', 'PASTEL', 'completeKeyboard', 'relayKeyboard', 'keyboardRows', 'symbolOf', 'keySoundPool', 'isKeystroke', 'NOT_A_KEYBOARD_PART', 'KEYBOARD_EXTRA', 'CANDY_CAPS']) {
    assert.equal(code.includes(gone), false, `${gone} is back`);
  }
});

test('a rows grid in any language keeps its labels and gives every cell its own safe name', () => {
  const plan = O.expandObject({ name: 'לוח', parts: [{ name: 'תא', rows: [['א', 'ב', 'א']], case: false }] });
  assert.deepEqual(plan.parts.map((p) => p.text.value), ['א', 'ב', 'א']);
  assert.equal(new Set(plan.parts.map((p) => p.name)).size, 3);
});

// -------------------------------------------------------------------------------------------- the checks ---

test('what is measured is reported, never repaired: hidden parts, floating parts, covered or low-contrast words, proportions', () => {
  const plan = O.expandObject({ name: 'Mess', parts: [
    { name: 'Body', size: [10, 4, 4], at: [0, 2, 0], color: '#cccccc' },
    { name: 'Buried', size: [1, 1, 1], at: [0, 2, 0], color: '#ff0000' },
    { name: 'Floater', size: [1, 1, 1], at: [20, 9, 0], color: '#00ff00' },
    { name: 'Faint', size: [3, 0.4, 3], at: [-3, 4.2, 0], color: '#cccccc', text: { value: 'hi', color: '#d0d0d0' } },
    { name: 'Lid', size: [3, 0.4, 3], at: [-3, 4.6, 0], color: '#333333' },
  ] });
  const before = JSON.stringify(plan.parts);
  const c = O.measureObject(plan);
  assert.equal(JSON.stringify(plan.parts), before, 'measuring changed nothing');
  assert.deepEqual(c.hiddenParts, ['Buried']);
  assert.deepEqual(c.floatingParts, ['Floater']);
  assert.deepEqual(c.coveredText, ['Faint'], 'a Lid sits on its Top-face words');
  assert.equal(c.lowContrastText[0].part, 'Faint');
  assert.ok(c.lowContrastText[0].ratio < 3);
  assert.equal(c.nothingMoves, true);
  assert.deepEqual(c.size, [41, 9.4 - 0, 10].map((n, i) => c.size[i]));
  assert.ok(c.proportions.ratio > 1);
  assert.equal(c.playerHeights, Math.round(Math.max(...c.size) / 5 * 10) / 10);
  const moving = O.expandObject({ name: 'M', parts: [{ name: 'A', size: [1, 1, 1], at: [0, 0.5, 0], color: '#fff', move: { as: 'spin', on: 'loop' } }] });
  assert.equal(O.measureObject(moving).nothingMoves, false);
});

test('contrast is measured, not repainted: dark on light is fine, light on light is low', () => {
  assert.ok(O.contrastRatio('#000000', '#ffffff') > 20);
  assert.ok(O.contrastRatio('#ffffff', '#fffde0') < 3);
  assert.equal(O.contrastRatio('#123456', '#123456'), 1);
});

// ------------------------------------------------------------------------------------------ the build ---

test('an object is built from its spec and nothing else: no stage, no screen, no kit, no ground, spawn, lighting or camera change', async () => {
  const { ctx, ops } = studio();
  const r = await O.TOOLS.build_object.run(ctx, CHEST);
  assert.equal(r.changed, true, JSON.stringify(r));
  assert.equal(r.object, 'game.Workspace.Chest');
  assert.equal(r.parts, 3);
  assert.equal(r.moving, 0);
  assert.equal(r.checks.nothingMoves, true, 'the verifier note says nothing moves');
  assert.match(r.note, /Information, not a verdict/);
  assert.match(r.note, /Nothing was added that the spec did not ask for/);
  assert.deepEqual(created(ops).filter((p) => !/Chest\./.test(p) || /Chest$/.test(p)), ['game.Workspace.Chest']);
  const text = JSON.stringify(writes(ops));
  for (const banned of ['Stage', 'StarterGui', 'Baseplate', 'SpawnLocation', 'Lighting', 'AppleAnimations', 'Click it', 'wobble', 'squish', 'Counter', 'camera_focus', 'MyObject']) assert.equal(text.includes(banned), false, `an unasked build wrote ${banned}`);
  assert.equal(ops.some((o) => o.op === 'rig_model' || o.op === 'edit_script' || o.op === 'camera_focus'), false);
  assert.equal(r.forUser, undefined, 'no canned answer');
});

test('a stage, a screen and the camera come only when the agent asks, and a counter only when it names one', async () => {
  const s = studio();
  const r = await O.TOOLS.build_object.run(s.ctx, { ...CHEST, stage: { color: '#4f8cff', height: 3 }, focus: true });
  assert.equal(r.stage, 'game.Workspace.ChestStage');
  assert.ok(created(s.ops).includes('game.Workspace.ChestStage'));
  assert.ok(s.ops.some((o) => o.op === 'camera_focus' && o.path === 'game.Workspace.Chest'));
  assert.equal(created(s.ops).some((p) => /HUD/.test(p)), false, 'a stage is not a screen');
  const withScreen = studio();
  await O.TOOLS.build_object.run(withScreen.ctx, { ...CHEST, parts: [...CHEST.parts.slice(0, 2), { ...CHEST.parts[2], move: { as: 'pop', on: 'click' } }], screen: { counter: 'פתיחות' } });
  assert.ok(withScreen.ops.some((o) => o.op === 'edit_script' && /ChestHUDScript/.test(o.path)), 'the counter the agent named');
  const hint = JSON.stringify(withScreen.ops.filter((o) => o.op === 'create_instances'));
  assert.equal(hint.includes('Click it'), false);
  const none = studio();
  await O.TOOLS.build_object.run(none.ctx, { ...CHEST, stage: 'none', screen: false });
  assert.equal(created(none.ops).some((p) => /Stage|HUD/.test(p)), false, 'none is accepted and means none');
});

test('a part that moves is rigged, with the agent\'s sound said back; one sound the library cannot match is reported silent', async () => {
  const { ctx, ops } = studio();
  const spec = { ...CHEST, parts: [{ name: 'Lid', size: [6, 1, 4], at: [0, 3.5, 0], color: '#a46b3a', move: { as: 'open', on: 'click', hinge: 'back', sound: 123456 } }, CHEST.parts[0]] };
  const r = await O.TOOLS.build_object.run(ctx, spec);
  assert.equal(r.moving, 1);
  const script = ops.find((o) => o.op === 'edit_script' && /AppleAnimations/.test(o.path)).source;
  assert.match(script, /rbxassetid:\/\/123456/);
  assert.match(r.sounds[0], /id 123456/);
  assert.ok(ops.some((o) => o.op === 'rig_model'));
  const quiet = studio();
  const q = await O.TOOLS.build_object.run(quiet.ctx, { ...spec, parts: [{ ...spec.parts[0], move: { as: 'open', on: 'click', sound: 'zzzzqqqq nothing matches this' } }, CHEST.parts[0]] });
  assert.match(q.sounds[0], /no match in the sound library, so it is silent/);
  const none = studio();
  await O.TOOLS.build_object.run(none.ctx, { ...spec, parts: [{ ...spec.parts[0], move: { as: 'open', on: 'click' } }, CHEST.parts[0]] });
  assert.equal(/sound/.test(none.ops.find((o) => o.op === 'edit_script' && /AppleAnimations/.test(o.path)).source), false, 'no sound unless the agent asked for one');
});

test('a taken name is an error the agent resolves, never a silent delete; replace: true says so', async () => {
  const taken = studio({ exists: ['game.Workspace.Chest'] });
  const r = await O.TOOLS.build_object.run(taken.ctx, CHEST);
  assert.match(r.error, /already exists/);
  assert.equal(taken.ops.some((o) => o.op === 'delete_instances'), false);
  assert.equal(taken.ops.some((o) => o.op === 'create_instances'), false);
  const replace = studio({ exists: ['game.Workspace.Chest'] });
  const ok = await O.TOOLS.build_object.run(replace.ctx, { ...CHEST, replace: true });
  assert.equal(ok.changed, true);
  assert.deepEqual(replace.ops.filter((o) => o.op === 'delete_instances').map((o) => o.paths), [['game.Workspace.Chest']]);
});

test('a Hebrew object gets its own name, not a shared default, and two different ones do not collide', async () => {
  const { ctx, exists } = studio();
  const a = await O.TOOLS.build_object.run(ctx, { name: 'ברווז גומי', parts: [{ name: 'גוף', size: [2, 2, 2], at: [0, 1, 0], color: '#ffe066' }] });
  const b = await O.TOOLS.build_object.run(ctx, { name: 'כלב רובוט', parts: [{ name: 'גוף', size: [2, 2, 2], at: [0, 1, 0], color: '#cccccc' }] });
  assert.equal(a.object, 'game.Workspace.ברווז גומי');
  assert.equal(b.object, 'game.Workspace.כלב רובוט');
  assert.ok(exists.has('game.Workspace.ברווז גומי') && exists.has('game.Workspace.כלב רובוט'));
  const again = await O.TOOLS.build_object.run(ctx, { name: 'ברווז גומי', parts: [{ name: 'גוף', size: [2, 2, 2], at: [0, 1, 0], color: '#ffe066' }] });
  assert.match(again.error, /already exists/);
});

test('it stands where the agent said, else beside what is there', async () => {
  const at = studio();
  await O.TOOLS.build_object.run(at.ctx, { ...CHEST, at: [50, 0, 10] });
  const model = at.ops.find((o) => o.op === 'create_instances' && o.items[0].name === 'Chest').items[0];
  const body = model.children.find((c) => c.name === 'Body');
  const plan = O.expandObject(CHEST);
  const zc = (plan.footprint.z0 + plan.footprint.z1) / 2;
  const pos = body.props.Position.v ?? body.props.Position;
  assert.equal(pos[0], 50, 'x on the given place');
  assert.ok(Math.abs(pos[2] - (10 - zc)) < 1e-9, 'the footprint is centred on the given z');
  const beside = studio();
  await O.TOOLS.build_object.run(beside.ctx, CHEST);
  assert.ok(beside.ops.some((o) => o.op === 'spatial_query' && o.action === 'overlap'));
});

test('the build result says what was built, from the plan, so the answer cannot invent it', async () => {
  const plan = O.expandObject({ name: 'Sign', parts: [{ name: 'Board', size: [8, 4, 1], at: [0, 3, 0], color: '#223344', text: { value: 'Open', face: 'Back', color: '#ffffff' } }, { name: 'Post', size: [1, 3, 1], at: [0, 1.5, 0], color: '#8e5b32' }] });
  const said = O.builtSummary(plan, 0, true);
  assert.match(said, /2 parts, studded/);
  assert.match(said, /nothing moves/);
  assert.match(said, /Board reads "Open"/);
  assert.match(said, /made of: Board, Post/);
  assert.equal(/keycap|keyboard|stage|counter|click/i.test(said), false, said);
});

// ------------------------------------------------------------------------------------------ motion and clips ---

test('every motion preset is a clip the animation player accepts', async () => {
  const outA = join(mkdtempSync(join(tmpdir(), 'anim-')), 'a.mjs');
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'animate-tool.ts'), '--bundle', '--format=esm', '--target=es2022', '--platform=node', '--outfile=' + outA, '--external:cloudflare:*'], { cwd: WORKER, stdio: 'pipe' });
  const A = await import(`file://${outA}`);
  for (const as of ['press', 'spin', 'bob', 'open', 'wobble', 'pop']) for (const on of ['click', 'loop', 'touch', 'prompt', 'once']) {
    const part = { name: 'Thing', shape: 'block', size: [2, 2, 2], at: [0, 1, 0], color: '#ffffff', move: { as, on } };
    const r = A.readClips({ [`Thing.${as}`]: O.motionClip(part) });
    assert.ok(!('error' in r), `${as}/${on}: ${r.error}`);
  }
});

test('a key-bound part presses from its base on its own key, and comes back to rest', () => {
  const plan = O.expandObject({ name: 'Pad', parts: [{ name: 'Q', size: [2, 1, 2], at: [0, 0.5, 0], color: '#fff', key: 'q', move: { as: 'press', on: 'key' } }] });
  const q = plan.parts[0];
  const clip = O.motionClip(q);
  assert.equal(clip.play, 'key');
  assert.equal(clip.key, 'Q');
  const ys = clip.keys.map((k) => k[q.name].move[1]);
  assert.equal(ys[0], 0); assert.ok(ys[1] < 0, 'it goes down'); assert.equal(ys.at(-1), 0, 'and back');
  const hinge = O.hingePoint(q, [0, 2, -40]);
  assert.ok(Math.abs(hinge[1] - (2 + q.at[1] - q.size[1] / 2)) < 1e-9, 'pivot on the bottom face');
});

test('a part with words on its top reads upright from the +Z side; a door keeps its own axes', () => {
  const label = { name: 'L', shape: 'block', size: [4, 1, 2], at: [0, 0, 0], color: '#fff', text: { value: 'x', face: 'Top', color: '#000' } };
  assert.deepEqual(O.uprightLabel(label), { Size: [2, 1, 4], Orientation: [0, -90, 0] });
  assert.deepEqual(O.uprightLabel({ ...label, move: { as: 'open', on: 'click' } }).Size, [4, 1, 2]);
  assert.deepEqual(O.uprightLabel({ ...label, text: { ...label.text, face: 'Back' } }).Size, [4, 1, 2]);
});

test('words go on the thin side by default, unless a face is given', () => {
  assert.equal(O.thinFace([6, 0.5, 6]), 'Top');
  assert.equal(O.thinFace([6, 6, 0.5]), 'Back');
  assert.equal(O.thinFace([0.5, 6, 6]), 'Right');
  const plan = O.expandObject({ name: 'Sign', parts: [{ name: 'A', size: [6, 6, 0.5], at: [0, 3, 0], color: '#222', text: 'x' }, { name: 'B', size: [6, 6, 0.5], at: [0, 9, 0], color: '#222', text: { value: 'y', face: 'Front' } }] });
  assert.deepEqual(plan.parts.map((p) => p.text.face), ['Back', 'Front']);
});

// --------------------------------------------------------------------------------------------- the HUD ---

test('each object counter gets its own spot on screen, and a name in any language is a safe Luau string in its script', async () => {
  const tree = { name: 'StarterGui', children: [
    { name: 'FirstHUD', class: 'ScreenGui', children: [{ name: 'TopLeft', children: [{ name: 'Counter' }] }] },
    { name: 'GameHUD', class: 'ScreenGui', children: [{ name: 'Coins' }] },
    { name: 'SecondHUD', class: 'ScreenGui', children: [{ name: 'Top', children: [{ name: 'Counter' }] }] },
  ] };
  assert.deepEqual(O.objectScreens(tree), ['FirstHUD', 'SecondHUD'], 'object screens only, in order');
  assert.deepEqual(O.objectScreens(null), []);
  assert.equal(O.COUNTER_SPOTS[0], 'top-left');
  assert.equal(new Set(O.COUNTER_SPOTS).size, O.COUNTER_SPOTS.length, 'no two the same');
  const s = studio();
  const failed = await O.writeObjectHud(s.ctx, 'שם "מוזר"', { counter: 'x' });
  assert.equal(failed, null);
  const script = s.ops.find((o) => o.op === 'edit_script').source;
  assert.match(script, /WaitForChild\("שם \\"מוזר\\"HUD"\)/, 'the quote is escaped, not a Luau injection');
});

// ------------------------------------------------------------------------ the tool description and schema ---

test('the build_object description and schema hold no subject word, document the opt-ins, and ask for a name on every part', () => {
  const def = O.TOOLS.build_object.def;
  const text = JSON.stringify(def);
  assert.ok(def.description.length > 300);
  for (const w of ['butter', 'keyboard', 'piano', 'donut', 'pizza', 'asmr', 'crown', 'stick', 'coin', 'cookie', 'pencil', 'sword']) assert.equal(new RegExp(`\\b${w}\\b`, 'i').test(text), false, `the tool text names ${w}`);
  assert.match(def.description, /Nothing unasked is added \(stage, screen, focus are opt-in\)/);
  for (const opt of ['stage', 'screen', 'focus', 'at', 'replace', 'scale']) assert.ok(opt in def.parameters.properties, `${opt} is documented`);
  assert.match(def.parameters.properties.stage.description, /absent: none/);
  assert.match(def.parameters.properties.screen.description, /absent: none/);
  assert.deepEqual(def.parameters.properties.parts.items.required, ['name']);
  assert.deepEqual(def.parameters.required, ['name', 'parts']);
});

test('a whole argument object with stray closing brackets or trailing commas is read; anything else is still refused', () => {
  assert.deepEqual(O.recoverJsonObject('{"name":"Kb","parts":[{"a":"}"}]}}'), { name: 'Kb', parts: [{ a: '}' }] });
  assert.deepEqual(O.recoverJsonObject('{"a":1,"b":[1,2,],}'), { a: 1, b: [1, 2] });
  assert.deepEqual(O.recoverJsonObject('{"a":"x \\" }"}]\n'), { a: 'x " }' });
  for (const bad of ['{not json', '{"a":1} {"b":2}', '{"a":1} please', 'x {"a":1}', '[1,2]', '{"a":']) assert.equal(O.recoverJsonObject(bad), undefined, bad);
});

test('a bare backslash in a rows label is read as the backslash it meant', () => {
  const bad = '{"name":"Kb","parts":[{"name":"Key","rows":[["Q","W","\\", "]"],["A","\\"]]}]}';
  assert.deepEqual(O.recoverJsonObject(bad).parts[0].rows, [['Q', 'W', '\\', ']'], ['A', '\\']]);
  assert.deepEqual(O.recoverJsonObject('{"a":"x \\" }"}'), { a: 'x " }' }, 'an escaped quote is left alone');
});

test('the session no longer decides what an object request is, answers for it, or fences the run after it', () => {
  const session = src('do/session.ts');
  assert.equal(/isObjectRequest|objectUpgradeLine|composedObject|objectBuilt|objectRun|AFTER_OBJECT|builtObject.*spec/.test(session.replace(/storage\.(get|put|delete)[^;]*builtObject[^;]*;/g, '')), false);
  const tool = src('object-tool.ts');
  for (const gone of ['isObjectRequest', 'objectForUser', 'objectUpgradeLine', 'mergeUpgrade', 'coolKit', 'COOL_ORB_COLOURS', 'groundAndSpawn', 'giveMotion', 'fitFactor', 'shapeWord', 'shapeTo', 'unbury', 'wrapAround', 'toEnds', 'settle', 'faceAcross', 'readableText', 'GLOW_NAME', 'LONG_WORDS', 'FLAT_WORDS', 'UP_WORDS', 'DOWN_WORDS', 'set_mood']) {
    assert.equal(tool.includes(gone), false, `${gone} is back in object-tool.ts`);
  }
});
