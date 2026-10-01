/**
 * build_object: any object in one call (owner, 2026-10-01: "make an asmr keyboard" must come out right, fast).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'object-')), 'o.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'object-tool.ts'), '--bundle', '--format=esm', '--target=es2022', '--platform=node', '--outfile=' + out, '--external:cloudflare:*'], { cwd: WORKER, stdio: 'pipe' });
const O = await import(`file://${out}`);

const row = (name, x0, z, color, letters, keys = letters) => ({ name, size: [1, 0.5, 1], at: [x0, 0.85, z], color,
  repeat: { grid: [letters.length, 1, 1], step: [1.1, 0, 0], texts: letters, keys }, move: { as: 'press', on: 'key', sound: 'keyboard click' } });
const KEYBOARD = { name: 'AsmrKeyboard', scale: 4, parts: [
  { name: 'Case', size: [12.6, 0.6, 5.8], at: [0, 0.3, 0], color: '#2b2f3a' },
  row('Num', -4.95, -2.2, '#ff6fd8', ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Zero']),
  row('Top', -4.95, -1.1, '#5fd3ff', ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P']),
  row('Home', -4.65, 0, '#5dff7a', ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L']),
  row('Bottom', -4.35, 1.1, '#ffe14d', ['Z', 'X', 'C', 'V', 'B', 'N', 'M']),
  { name: 'Space', size: [5.5, 0.5, 1], at: [0, 0.85, 2.2], color: '#ffe14d', key: 'Space', move: { as: 'press', on: 'key', sound: 'keyboard click' } },
], screen: { counter: 'Keys pressed', hint: 'Type on your keyboard or click the keys!' } };

test('the ASMR keyboard expands to a case and 37 labelled keys, each bound to its real key, scaled and grounded', () => {
  const plan = O.expandObject(KEYBOARD);
  assert.ok(!('error' in plan), JSON.stringify(plan));
  assert.equal(plan.parts.length, 38);
  const keys = plan.parts.filter((p) => p.move);
  assert.equal(keys.length, 37);
  assert.deepEqual(keys.find((p) => p.text?.value === 'Q').key, 'Q');
  assert.equal(keys.find((p) => p.text?.value === '1').key, 'One');
  assert.equal(plan.parts.find((p) => p.name === 'Space').key, 'Space');
  assert.deepEqual(plan.parts[0].size, [12.6 * 4, 0.6 * 4, 5.8 * 4], 'scaled');
  assert.ok(Math.abs(Math.min(...plan.parts.map((p) => p.at[1] - p.size[1] / 2))) < 1e-9, 'it stands on the ground');
  const names = new Set(plan.parts.map((p) => p.name));
  assert.equal(names.size, plan.parts.length, 'every part has its own name');
});

test('every key presses from its base on its own key, and the press comes back to rest', () => {
  const plan = O.expandObject(KEYBOARD);
  const q = plan.parts.find((p) => p.text?.value === 'Q');
  const clip = O.motionClip(q);
  assert.equal(clip.play, 'key');
  assert.equal(clip.key, 'Q');
  const ys = clip.keys.map((k) => k[q.name].move[1]);
  assert.equal(ys[0], 0); assert.ok(ys[1] < 0, 'it goes down'); assert.equal(ys.at(-1), 0, 'and back');
  const hinge = O.hingePoint(q, [0, 2, -40]);
  assert.ok(Math.abs(hinge[1] - (2 + q.at[1] - q.size[1] / 2)) < 1e-9, 'pivot on the bottom face');
});

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

test('a bad spec is refused with a reason, before anything is built', () => {
  for (const [spec, why] of [
    [{ name: 'X', parts: [] }, /parts is empty/],
    [{ name: 'bad name', parts: [{ size: [1, 1, 1], at: [0, 0, 0], color: '#ffffff' }] }, /plain name/],
    [{ name: 'X', parts: [{ at: [0, 0, 0], color: '#ffffff' }] }, /no part could be read/],
    [{ name: 'X', parts: [{ size: [1, 1, 1], at: [0, 0, 0], color: '#ffffff', move: { as: 'dance' } }] }, /move.as/],
    [{ name: 'X', parts: [{ size: [1, 1, 1], at: [0, 0, 0], color: '#ffffff', repeat: { grid: [30, 30, 1], step: [1, 0, 1] } }] }, /more than/],
  ]) {
    const r = O.expandObject(spec);
    assert.ok('error' in r, JSON.stringify(spec));
    assert.match(r.error, why);
  }
});

test('slips a model makes are fixed, not fatal: number and word keys, colour names, odd shapes and names', () => {
  const plan = O.expandObject({ name: 'Pad', parts: [
    { name: 'key one!', shape: 'cube', size: [1, 1, 1], at: [0, 0, 0], color: 'red', text: '1', move: { as: 'press', on: 'key' } },
    { name: 'Space', size: [4, 1, 1], at: [0, 0, 2], color: 'fff', key: 'space', move: { as: 'press', on: 'keyboard' } },
    { size: [1, 1, 1], at: [3, 0, 0], color: 'not a colour', repeat: { grid: [2, 1, 1], step: [1.1, 0, 0], texts: ['a', ','] }, move: { as: 'press', on: 'key' } },
  ] });
  assert.ok(!('error' in plan), JSON.stringify(plan));
  const [one, space, a, comma] = plan.parts;
  assert.equal(one.name, 'keyone'); assert.equal(one.shape, 'block'); assert.equal(one.color, '#ff4b4b'); assert.equal(one.key, 'One', 'a key labelled 1 is the One key');
  assert.equal(space.key, 'Space'); assert.equal(space.color, '#ffffff'); assert.equal(space.move.on, 'key');
  assert.equal(a.key, 'A'); assert.equal(comma.key, 'Comma'); assert.equal(a.color, '#d7dde2', 'an unknown colour falls back to light grey');
});

test('a request for one thing is told apart from a game, an edit or a look', () => {
  for (const t of ['make an asmr keyboard', 'make me a stick of butter', 'build a giant spinning donut', 'create a lamp that glows', 'a rubber duck']) assert.ok(O.isObjectRequest(t), t);
  for (const t of ['make an obby with lava', 'make it 100x cooler', 'build a tycoon game', 'fix the shop', 'improve the map', 'make the lighting better', 'add a shop', 'add a grassy hill', 'build a small harbour with a lighthouse and a pier', '']) assert.ok(!O.isObjectRequest(t), t);
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

// Owner, 2026-10-01: the hand-placed keyboard put ENTER on BACK and keys inside keys. Rows are laid out by code.
test('a rows entry lays a keyboard out: no key overlaps another, every key answers its real key, on a case', () => {
  const plan = O.expandObject({ name: 'AsmrKeyboard', parts: [{
    name: 'Key', rows: [['Esc', '1', '2', '3', 'Back'], ['Tab', 'Q', 'W', 'E', 'R'], ['Caps', 'A', 'S', 'D', 'Enter'], ['Shift', 'Z', 'X', 'C', 'V'], ['Space']],
    move: { as: 'press', on: 'key', sound: 'keyboard click' },
  }] });
  assert.ok(!('error' in plan), plan.error);
  const keys = plan.parts.filter((p) => p.name.startsWith('Key_'));
  assert.equal(keys.length, 21);
  const overlap = (a, b) => [0, 2].every((i) => Math.abs(a.at[i] - b.at[i]) < (a.size[i] + b.size[i]) / 2 - 1e-6);
  const pairs = keys.flatMap((a, i) => keys.slice(i + 1).filter((b) => overlap(a, b)).map((b) => `${a.name}/${b.name}`));
  assert.deepEqual(pairs, [], 'keys overlap');
  const key = (n) => keys.find((p) => p.name === n);
  assert.equal(key('Key_Back').key, 'Backspace'); assert.equal(key('Key_Enter').key, 'Return'); assert.equal(key('Key_1').key, 'One');
  assert.equal(key('Key_Space').key, 'Space'); assert.equal(key('Key_Q').key, 'Q');
  assert.ok(key('Key_Space').size[0] > key('Key_Q').size[0] * 5, 'the space bar is a space bar');
  assert.ok(keys.every((p) => p.move?.as === 'press' && p.text?.value), 'every key presses and is labelled');
  const kase = plan.parts.find((p) => p.name === 'KeyCase');
  assert.ok(kase, 'no case');
  assert.ok(keys.every((p) => Math.abs(p.at[1] - p.size[1] / 2 - (kase.at[1] + kase.size[1] / 2)) < 1e-6), 'keys sit on the case');
  assert.ok(keys.every((p) => Math.abs(p.at[0]) + p.size[0] / 2 <= kase.size[0] / 2 + 1e-6), 'keys stay on the case');
  assert.ok(new Set(keys.map((p) => p.color)).size > 2, 'the keys are colourful');
});
