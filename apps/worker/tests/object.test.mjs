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
  assert.equal(plan.parts.find((p) => p.text?.value === 'SPACE').key, 'Space');
  // RESTATED 2026-10-01: a keyboard placed key by key is laid out again by code (relayKeyboard), so the case is the
  // tool's, not the spec's. The property: the spec's scale reaches the keys, and they sit on a case.
  assert.equal(keys.find((p) => p.text?.value === 'Q').size[0], 1 * 4, 'scaled');
  assert.ok(plan.parts.some((p) => /Case$/.test(p.name)), 'on a case');
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
    // RESTATED 2026-10-01: a bad name is no longer refused; it is cleaned (test 'a name with spaces is cleaned').
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
  const key = (label) => keys.find((p) => p.text.value === label);
  assert.equal(key('BACK').key, 'Backspace'); assert.equal(key('ENTER').key, 'Return'); assert.equal(key('1').key, 'One');
  assert.equal(key('SPACE').key, 'Space'); assert.equal(key('Q').key, 'Q');
  assert.ok(key('SPACE').size[0] > key('Q').size[0] * 5, 'the space bar is a space bar');
  assert.ok(keys.every((p) => p.move?.as === 'press' && p.text?.value), 'every key presses and is labelled');
  const kase = plan.parts.find((p) => p.name === 'KeyCase');
  assert.ok(kase, 'no case');
  assert.ok(keys.every((p) => Math.abs(p.at[1] - p.size[1] / 2 - (kase.at[1] + kase.size[1] / 2)) < 1e-6), 'keys sit on the case');
  assert.ok(keys.every((p) => Math.abs(p.at[0]) + p.size[0] / 2 <= kase.size[0] / 2 + 1e-6), 'keys stay on the case');
  assert.ok(new Set(keys.map((p) => p.color)).size > 2, 'the keys are colourful');
});

// Owner, 2026-10-01, the re-test: the model ignored rows, hand-placed the keys on a base, a case and a wrist rest, and
// stood an 18-stud CounterScreen behind them. The tool lays such a keyboard out again itself.
test('a keyboard placed key by key is laid out again by code; the screen wall and the plates go', () => {
  const row = (labels, z, colour, w = 3) => labels.map((l, i) => ({ name: `K${z}_${i}`, size: [w, 1.2, 3], at: [-20 + i * 3.1, 3.6, z], color: colour, text: l, move: { as: 'press', on: 'key', sound: 'keyboard thock' } }));
  const plan = O.expandObject({ name: 'AsmrKeyboard', parts: [
    { name: 'KeyboardBase', size: [102, 3, 42], at: [0, 1.5, 0], color: '#22223a' },
    { name: 'WristRest', size: [102, 2, 6], at: [0, 1, 24], color: '#ff4fa0' },
    { name: 'CounterScreen', size: [30, 18, 3], at: [0, 9, -30], color: '#111133' },
    ...row(['Q', 'W', 'E', 'R', 'T', 'Y'], -6, '#7be0ff'),
    ...row(['A', 'S', 'D', 'F', 'G'], -2.9, '#ff7bd1'), // half a key off: still its own row
    { name: 'BackspaceKey', size: [12, 1.2, 3], at: [-18, 3.6, -6.2], color: '#ffe27a', text: 'Back', move: { as: 'press', on: 'key' } },
    { name: 'Spacebar', size: [48, 1.2, 3], at: [0, 3.6, 3], color: '#ffe27a', text: 'Space', move: { as: 'press', on: 'key' } },
  ] });
  assert.ok(!('error' in plan), plan.error);
  const names = plan.parts.map((p) => p.name);
  for (const gone of ['KeyboardBase', 'CounterScreen']) assert.ok(!names.includes(gone), `${gone} is still there`);
  const keys = plan.parts.filter((p) => p.name.startsWith('Key_'));
  assert.equal(keys.length, 13);
  const overlap = (a, b) => [0, 2].every((i) => Math.abs(a.at[i] - b.at[i]) < (a.size[i] + b.size[i]) / 2 - 1e-6);
  assert.deepEqual(keys.flatMap((a, i) => keys.slice(i + 1).filter((b) => overlap(a, b)).map((b) => `${a.name}/${b.name}`)), [], 'keys overlap');
  assert.equal(plan.parts.find((p) => p.text?.value === 'BACK').key, 'Backspace');
  assert.equal(plan.parts.find((p) => p.text?.value === 'Q').move.sound, 'keyboard thock', 'a key keeps its sound');
  assert.ok(plan.parts.some((p) => p.name === 'KeyCase'), 'the keys sit on a case');
  assert.ok(plan.footprint.top < 6, `the keyboard is ${plan.footprint.top} studs tall`);
});

// The live re-test, take two: the model gave one rows entry per row, with "-" and "=" keys, and the build died on
// "two parts are named Key_0_11". Rows entries are one keyboard, symbol keys are named by their key, and a repeated
// name is renamed rather than fatal.
test('one rows entry per row is one keyboard; symbol keys and repeated names never sink the build', () => {
  const move = { as: 'press', on: 'key', sound: 'keyboard click' };
  const plan = O.expandObject({ name: 'AsmrKeyboard', parts: [
    { name: 'Key', rows: [['Esc', '1', '2', '-', '=']], at: [0, 0, -4], move },
    { name: 'Key', rows: [['Q', 'W', '[', ']']], at: [0, 0, 0], move },
    { name: 'Key', rows: [['Space']], at: [0, 0, 4], move },
    { name: 'Glow', size: [1, 1, 1], color: '#ffffff' }, { name: 'Glow', size: [1, 1, 1], at: [3, 0.5, 0], color: '#ffffff' },
  ] });
  assert.ok(!('error' in plan), plan.error);
  const keys = plan.parts.filter((p) => p.name.startsWith('Key_'));
  assert.equal(keys.length, 10);
  assert.equal(plan.parts.filter((p) => /Case$/.test(p.name)).length, 1, 'one keyboard, one case');
  assert.ok(keys.some((p) => p.name === 'Key_Minus' && p.key === 'Minus'));
  const overlap = (a, b) => [0, 2].every((i) => Math.abs(a.at[i] - b.at[i]) < (a.size[i] + b.size[i]) / 2 - 1e-6);
  assert.deepEqual(keys.flatMap((a, i) => keys.slice(i + 1).filter((b) => overlap(a, b)).map((b) => `${a.name}/${b.name}`)), []);
  assert.ok(plan.parts.find((p) => p.text?.value === 'Q').at[2] > plan.parts.find((p) => p.text?.value === '1').at[2], 'rows stay front to back');
  assert.equal(new Set(plan.parts.map((p) => p.name)).size, plan.parts.length, 'every name is unique');
});

test('a name with spaces is cleaned, not refused', () => {
  const plan = O.expandObject({ name: 'ASMR keyboard!', parts: [{ size: [1, 1, 1], color: '#ffffff' }] });
  assert.equal(plan.name, 'ASMRKeyboard');
  assert.equal(O.expandObject({ name: 'AsmrKeyboard', parts: [{ size: [1, 1, 1], color: '#ffffff' }] }).name, 'AsmrKeyboard');
});
