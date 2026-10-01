/**
 * build_object: any object in one call (owner, 2026-10-01: "make an asmr keyboard" must come out right, fast).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
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
  // RESTATED 2026-10-01: each key is a keycap now, a top and the skirt that rides it (owner's reference keyboard).
  // RESTATED 2026-10-01 (owner's reference board): a QWERTY board with a number row gets the 13-key F row, and a space
  // bar alone on its row gets its 6 modifiers (completeKeyboard).
  assert.equal(plan.parts.length, 1 + (37 + 13 + 6) * 2);
  const keys = plan.parts.filter((p) => p.move);
  assert.equal(keys.length, 37 + 13 + 6);
  assert.equal(plan.parts.filter((p) => p.rides).length, 37 + 13 + 6, 'every key has its skirt');
  assert.equal(keys.find((p) => p.key === 'Q').text.value, 'q', 'letters are printed lowercase, like the reference');
  assert.equal(keys.find((p) => p.text?.value === '1').key, 'One');
  assert.equal(plan.parts.find((p) => p.text?.value === 'SPACE').key, 'Space');
  // RESTATED 2026-10-01: a keyboard placed key by key is laid out again by code (relayKeyboard), so the case is the
  // tool's, not the spec's. The property: the spec's scale reaches the keys, and they sit on a case.
  assert.equal(plan.parts.find((p) => p.rides === keys.find((k) => k.key === 'Q').name).size[0], 1 * 4, 'scaled');
  assert.ok(plan.parts.some((p) => /Case$/.test(p.name)), 'on a case');
  assert.ok(Math.abs(Math.min(...plan.parts.map((p) => p.at[1] - p.size[1] / 2))) < 1e-9, 'it stands on the ground');
  const names = new Set(plan.parts.map((p) => p.name));
  assert.equal(names.size, plan.parts.length, 'every part has its own name');
});

test('every key presses from its base on its own key, and the press comes back to rest', () => {
  const plan = O.expandObject(KEYBOARD);
  const q = plan.parts.find((p) => p.key === 'Q' && p.move);
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
  // RESTATED round 5: a small thing is grown whatever its scale (fitFactor), so positions are read back at that growth.
  const plan = O.expandObject({ name: 'Thing', parts: [
    { name: 'A', size: [2, 2, 2], position: { x: 4, y: 1, z: 0 }, color: '#ffffff' },
    { name: 'B', size: [2, 2, 2], pos: '0, 1, 4', color: '#ffffff' },
    { name: 'C', size: [2, 4, 2], color: '#ffffff' },
  ] });
  assert.ok(!('error' in plan), JSON.stringify(plan));
  const g = plan.grown ?? 1;
  assert.deepEqual(plan.parts.map((p) => p.at.map((n) => Math.round(n / g * 1e6) / 1e6)), [[4, 1, 0], [0, 1, 4], [0, 2, 0]]);
});

test('a part with a flat or missing size does not sink the object', () => {
  const plan = O.expandObject({ name: 'Y', parts: [{ name: 'A', size: [1, 1, 1], at: [0, 0, 0], color: '#ffffff' }, { name: 'Sheet', size: [4, 0, 2], at: [0, 1, 0], color: '#ffffff' }, { name: 'Lost', at: [0, 0, 0] }] });
  assert.ok(!('error' in plan), JSON.stringify(plan));
  assert.equal(plan.parts.length, 2);
  assert.equal(Math.round(plan.parts[1].size[1] / (plan.grown ?? 1) * 1e6) / 1e6, 0.2, 'a flat side is made thin, not refused');
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
  const keys = plan.parts.filter((p) => p.name.startsWith('Key_') && !p.rides);
  // RESTATED 2026-10-01 (owner's reference board): a QWERTY board with a number row gets the 13-key F row, and a space
  // bar alone on its row gets its 6 modifiers (completeKeyboard).
  assert.equal(keys.length, 21 + 13 + 6);
  const overlap = (a, b) => [0, 2].every((i) => Math.abs(a.at[i] - b.at[i]) < (a.size[i] + b.size[i]) / 2 - 1e-6);
  const pairs = keys.flatMap((a, i) => keys.slice(i + 1).filter((b) => overlap(a, b)).map((b) => `${a.name}/${b.name}`));
  assert.deepEqual(pairs, [], 'keys overlap');
  const key = (label) => keys.find((p) => p.text.value.toLowerCase() === label.toLowerCase());
  assert.equal(key('BACK').key, 'Backspace'); assert.equal(key('ENTER').key, 'Return'); assert.equal(key('1').key, 'One');
  assert.equal(key('SPACE').key, 'Space'); assert.equal(key('Q').key, 'Q');
  assert.ok(key('SPACE').size[0] > key('Q').size[0] * 5, 'the space bar is a space bar');
  assert.ok(keys.every((p) => p.move?.as === 'press' && p.text?.value), 'every key presses and is labelled');
  const kase = plan.parts.find((p) => p.name === 'KeyCase');
  assert.ok(kase, 'no case');
  // RESTATED 2026-10-01: a key is a top on a skirt; the skirts sit on the case.
  assert.ok(plan.parts.filter((p) => p.rides).every((p) => Math.abs(p.at[1] - p.size[1] / 2 - (kase.at[1] + kase.size[1] / 2)) < 1e-6), 'keys sit on the case');
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
  const keys = plan.parts.filter((p) => p.name.startsWith('Key_') && !p.rides);
  // RESTATED 2026-10-01: the space bar alone on its row gets its 6 modifiers (no number row here, so no F row).
  assert.equal(keys.length, 13 + 6);
  const overlap = (a, b) => [0, 2].every((i) => Math.abs(a.at[i] - b.at[i]) < (a.size[i] + b.size[i]) / 2 - 1e-6);
  assert.deepEqual(keys.flatMap((a, i) => keys.slice(i + 1).filter((b) => overlap(a, b)).map((b) => `${a.name}/${b.name}`)), [], 'keys overlap');
  assert.equal(plan.parts.find((p) => p.text?.value === 'BACK').key, 'Backspace');
  assert.equal(plan.parts.find((p) => p.key === 'Q' && p.move).move.sound, 'keyboard thock', 'a key keeps its sound');
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
  const keys = plan.parts.filter((p) => p.name.startsWith('Key_') && !p.rides);
  // RESTATED 2026-10-01 (owner's reference board): a QWERTY board with a number row gets the 13-key F row, and a space
  // bar alone on its row gets its 6 modifiers (completeKeyboard).
  assert.equal(keys.length, 10 + 13 + 6);
  assert.equal(plan.parts.filter((p) => /Case$/.test(p.name)).length, 1, 'one keyboard, one case');
  assert.ok(keys.some((p) => p.name === 'Key_Minus' && p.key === 'Minus'));
  const overlap = (a, b) => [0, 2].every((i) => Math.abs(a.at[i] - b.at[i]) < (a.size[i] + b.size[i]) / 2 - 1e-6);
  assert.deepEqual(keys.flatMap((a, i) => keys.slice(i + 1).filter((b) => overlap(a, b)).map((b) => `${a.name}/${b.name}`)), []);
  assert.ok(plan.parts.find((p) => p.key === 'Q' && p.move).at[2] > plan.parts.find((p) => p.text?.value === '1').at[2], 'rows stay front to back');
  assert.equal(new Set(plan.parts.map((p) => p.name)).size, plan.parts.length, 'every name is unique');
});

test('a name with spaces is cleaned, not refused', () => {
  const plan = O.expandObject({ name: 'ASMR keyboard!', parts: [{ size: [1, 1, 1], color: '#ffffff' }] });
  assert.equal(plan.name, 'ASMRKeyboard');
  assert.equal(O.expandObject({ name: 'AsmrKeyboard', parts: [{ size: [1, 1, 1], color: '#ffffff' }] }).name, 'AsmrKeyboard');
});

// Re-test take four: rows were used, but the model's own KeyboardBase (inside the tool's case) and a TapScreen slab stayed.
test('with rows, the model\'s own plate and screen go and the tool\'s case stays', () => {
  const plan = O.expandObject({ name: 'ASMRKeyboard', parts: [
    { name: 'KeyboardBase', size: [102, 3, 36], at: [0, 1.5, 0], color: '#22223a' },
    { name: 'TapScreen', size: [30, 3.6, 3], at: [0, 1.8, -25], color: '#111133' },
    { name: 'KeyEsc', rows: [['Esc', '1', '2', '3'], ['Q', 'W', 'E', 'R'], ['A', 'S', 'D', 'F'], ['Space']], unit: 4, move: { as: 'press', on: 'key' } },
  ] });
  assert.ok(!('error' in plan), plan.error);
  const names = plan.parts.map((p) => p.name);
  assert.ok(!names.includes('KeyboardBase'), 'the model\'s plate stayed under the case');
  assert.ok(!names.includes('TapScreen'), 'the screen slab stayed');
  assert.ok(names.includes('KeyEscCase'), 'the tool\'s case went');
  // RESTATED 2026-10-01: + the 13-key F row and the space bar's 6 modifiers (completeKeyboard).
  assert.equal(plan.parts.filter((p) => p.name.startsWith('Key_') && !p.rides).length, 13 + 13 + 6);
});

// Owner, 2026-10-01: the keys "sound like tiny bombs" — "mechanical keyboard" matched an explosion recording.
test('keyboard keys sound like real keys: short typing recordings, never an explosion', () => {
  const pool = O.keySoundPool();
  assert.ok(pool.length >= 4, `only ${pool.length} keystrokes`);
  assert.equal(new Set(pool).size, pool.length, 'every key in a row does not sound the same');
  assert.ok(O.isKeystroke({ move: { as: 'press', on: 'click' } }, 'mechanical keyboard thock'), 'asked to sound like a keyboard');
  assert.ok(O.isKeystroke({ move: { as: 'press', on: 'key' } }, undefined), 'pressed by a real key');
  assert.ok(!O.isKeystroke({ move: { as: 'spin', on: 'loop' } }, 'whoosh'), 'a fan is not a keystroke');
});

// Owner's play test, 2026-10-01: he had to jump to get onto the keyboard.
test('a rows keyboard is low enough to walk onto: case and key under half a key tall', () => {
  const plan = O.expandObject({ name: 'Kb', parts: [{ name: 'Key', rows: [['Q', 'W', 'E'], ['Space']], unit: 4, move: { as: 'press', on: 'click' } }] });
  assert.ok(plan.footprint.top <= 4 * 0.5, `the keyboard is ${plan.footprint.top} studs tall`);
});

test('rebuilding an object merges its screen: what was added to it since (upgrades) stays', () => {
  const src = readFileSync(join(WORKER, 'src', 'object-tool.ts'), 'utf8');
  assert.match(src, /await writeScreen\(ctx, screen\)/);
  assert.doesNotMatch(src, /delete_instances', paths: \[`game\.StarterGui\.\$\{plan\.name\}HUD`\]/, 'the object\'s screen is deleted and redrawn');
});

// Owner, 2026-10-01, with a reference picture: "the keyboard just dont look like this, it just a textured cube parts".
test('a key is a real keycap: a lighter inset top with dark ink on a darker skirt, smooth, pressed as one', () => {
  const plan = O.expandObject({ name: 'Kb', parts: [{ name: 'Key', rows: [['Q', 'W', 'E', 'R']], move: { as: 'press', on: 'key' } }] });
  const top = plan.parts.find((p) => p.key === 'Q' && p.move);
  const skirt = plan.parts.find((p) => p.rides === top.name);
  assert.ok(skirt && !skirt.move && !skirt.text, 'a skirt under the top, carrying nothing of its own');
  assert.ok(top.size[0] < skirt.size[0] && top.size[2] < skirt.size[2], 'the top is inset');
  assert.ok(Math.abs(top.at[1] - top.size[1] / 2 - (skirt.at[1] + skirt.size[1] / 2)) < 1e-9, 'and sits on the skirt');
  assert.ok(O.isDark(top.text.color) && !O.isDark(top.color), 'dark ink on a light top');
  assert.ok(O.isDark(O.shade(skirt.color, 0)) === O.isDark(skirt.color));
  const lum = (h) => { const n = parseInt(h.slice(1), 16); return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255); };
  assert.ok(lum(top.color) > lum(skirt.color), 'the top is lighter than the skirt');
  assert.equal(top.surface, 'smooth'); assert.equal(skirt.surface, 'smooth');
  const clip = O.withRiders(O.motionClip(top), top.name, [skirt.name]);
  assert.deepEqual(clip.keys.map((k) => k[skirt.name]), clip.keys.map((k) => k[top.name]), 'the skirt moves with its top, pose for pose');
});

// Owner, 2026-10-01: the model asked for click-pressed keys and typing on the real keyboard stopped working.
test('a keyboard key answers its real key whatever trigger the model asked for', () => {
  const rows = O.expandObject({ name: 'Kb', parts: [{ name: 'Key', rows: [['Q', 'W', 'Space']], move: { as: 'press', on: 'click' } }] });
  // RESTATED 2026-10-01: the space bar's row gets its modifiers (completeKeyboard); the property is every key, all of them.
  const moving = rows.parts.filter((p) => p.move);
  assert.ok(moving.length >= 3 && moving.every((p) => p.move.on === 'key'), moving.map((p) => p.move.on).join(','));
  assert.ok(['Q', 'W', 'Space'].every((k) => moving.some((p) => p.key === k)), 'Q, W and Space are all there');
  assert.equal(O.motionClip(rows.parts.find((p) => p.key === 'Q' && p.move)).play, 'key');
  const kase = rows.parts.find((p) => /Case$/.test(p.name));
  assert.ok(!O.isDark(kase.color), 'a light keyboard body, not a dark plane');
});

// Re-test, 2026-10-01: the space bar sat at the left, and the keys came out 2 studs across (smaller than a player's feet).
test('the space bar row is centred and keys are about 4 studs across', () => {
  const plan = O.expandObject({ name: 'Kb', scale: 2, parts: [{ name: 'Key', rows: [['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'], ['Space']], move: { as: 'press', on: 'key' } }] });
  const top = (k) => plan.parts.find((p) => p.key === k && p.move);
  const skirt = (k) => plan.parts.find((p) => p.rides === top(k).name);
  assert.ok(Math.abs(skirt('Q').size[0] - 4) < 1e-6, `a key is ${skirt('Q').size[0]} studs across`);
  // RESTATED 2026-10-01: a lone space bar gets its modifiers (completeKeyboard), so the property is a real bottom row:
  // the space bar between the two Alts, and wider than everything else on its row.
  const bottom = plan.parts.filter((p) => p.move && Math.abs(p.at[2] - top('Space').at[2]) < 1e-6).sort((a, b) => a.at[0] - b.at[0]);
  assert.deepEqual(bottom.map((p) => p.text.value), ['CTRL', 'WIN', 'ALT', 'SPACE', 'ALT', 'FN', 'CTRL']);
});

// Re-test, 2026-10-01: the reply called smooth keycaps "studded" and promised a "counter screen" in the world.
test('the build result says what was built, so the answer cannot invent it', () => {
  const plan = O.expandObject({ name: 'Kb', parts: [{ name: 'Key', rows: [['Q', 'W', 'E']], move: { as: 'press', on: 'key' } }] });
  const said = O.builtSummary(plan, 3, 3, true);
  assert.match(said, /3 keycaps \(smooth plastic/);
  assert.match(said, /on a studded stage/);
  assert.match(said, /real keyboard keys/);
  assert.match(said, /on the player's screen \(not in the world\)/);
});

// Live 2026-10-01 (new baseplate, "make an asmr keyboard"): the model wrote the space bar as five "Space" cells, laid a
// lilac DeckPlate over the keys, floated LED strips above the space bar and put the wrist rest behind the number row.
// The board came out 176 studs long with the keys hidden under a plane.
test('a wide key written as repeated cells is one key, and nothing lies over the keys', () => {
  const plan = O.expandObject({ name: 'ASMR Keyboard', scale: 4, parts: [
    { name: 'Key', rows: [
      ['Esc', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Back'],
      ['Tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', '\\'],
      ['Caps', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", 'Enter', 'Enter'],
      ['Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', 'Shift', '↑', 'Del'],
      ['Ctrl', 'Win', 'Alt', 'Space', 'Space', 'Space', 'Space', 'Space', 'Alt', 'Fn', 'Ctrl', '←', '↓', '→'],
    ], move: { as: 'press', on: 'key', sound: 'keyboard thock' } },
    { name: 'DeckPlate', size: [15.75, 0.3, 5.25], at: [0, 1.175, 0], color: '#b9a3ff' },
    { name: 'LEDStrip', size: [0.75, 0.15, 0.3], at: [-7.1, 1.47, 2.4], color: 'pink' },
    { name: 'WristRest', size: [15, 0.75, 1.5], at: [0, 1.7, -3.4], color: 'yellow', move: { as: 'wobble', on: 'touch' } },
  ] });
  assert.ok(!('error' in plan), plan.error);
  const spaces = plan.parts.filter((p) => p.text?.value === 'SPACE');
  assert.equal(spaces.length, 1, 'one space bar');
  assert.equal(plan.parts.filter((p) => p.text?.value === 'ENTER').length, 1, 'one enter');
  assert.equal(plan.parts.filter((p) => p.text?.value === 'SHIFT').length, 2, 'left and right shift both stay');
  const width = plan.footprint.x1 - plan.footprint.x0;
  assert.ok(width < 80, `the board is ${width.toFixed(1)} studs wide`);
  assert.ok(!plan.parts.some((p) => p.name === 'DeckPlate' || p.name === 'LEDStrip'), 'nothing lies over the keys');
  const keys = plan.parts.filter((p) => p.text);
  const rest = plan.parts.find((p) => p.name === 'WristRest');
  assert.ok(rest, 'the wrist rest stays');
  const front = Math.max(...keys.map((k) => k.at[2] + k.size[2] / 2));
  const back = Math.min(...keys.map((k) => k.at[2] - k.size[2] / 2));
  assert.ok(rest.at[2] - rest.size[2] / 2 > front || rest.at[2] + rest.size[2] / 2 < back, 'the wrist rest is beside the keys, not over them');
  assert.ok(Math.abs(rest.at[1] - rest.size[1] / 2) < 0.01, 'and on the ground');
});

test('a wrist rest is a block, and a key legend is capped at about half the cap', () => {
  const plan = O.expandObject({ name: 'Kb', scale: 4, parts: [
    { name: 'Key', rows: [['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'], ['Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M']], move: { as: 'press', on: 'key' } },
    { name: 'WristRest', shape: 'cylinder', size: [15, 0.5, 1.7], at: [0, 1, 3], color: 'yellow' },
  ] });
  assert.equal(plan.parts.find((p) => p.name === 'WristRest').shape, 'block', 'not a pipe');
  const src = readFileSync(join(WORKER, 'src', 'object-tool.ts'), 'utf8');
  assert.match(src, /p\.key \? \[\{ className: 'UITextSizeConstraint', name: 'Legend', props: \{ MaxTextSize: (t\.glow \? \d+ : )?\d+ \} \}\]/);
});

// Owner's screenshots, 2026-10-01: an ENTER alone on its own row, cut off from the board; a cyan LED ball floating on
// the stage; a pink bar along the keys.
test('a lone key joins the row above, and only a keyboard\'s own extras stay', () => {
  const plan = O.expandObject({ name: 'Kb', scale: 4, parts: [
    { name: 'Key', rows: [['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'], ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'], ['Enter'], ['Space']], move: { as: 'press', on: 'key' } },
    { name: 'LEDBall', shape: 'ball', size: [0.5, 0.5, 0.5], at: [9, 1, 3], color: 'cyan' },
    { name: 'GlowBar', size: [1, 0.3, 4], at: [9, 1, 0], color: 'pink' },
    { name: 'WristRest', size: [15, 0.5, 1.7], at: [0, 1, 3], color: 'yellow' },
  ] });
  const z = (label) => plan.parts.find((p) => p.text?.value === label).at[2];
  assert.equal(z('ENTER'), z('a'), 'ENTER is on the A row');
  assert.notEqual(z('SPACE'), z('a'), 'the space bar keeps its own row');
  assert.ok(!plan.parts.some((p) => p.name === 'LEDBall' || p.name === 'GlowBar'), 'no junk beside the keys');
  assert.ok(plan.parts.some((p) => p.name === 'WristRest'));
});

// Live 2026-10-01: the answer promised "two spinning knobs and a glowing light bar"; the keyboard had one knob and no bar.
test('the build result names every extra that is there and every one that was left out', () => {
  const plan = O.expandObject({ name: 'Kb', scale: 4, parts: [
    { name: 'Key', rows: [['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'], ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L']], move: { as: 'press', on: 'key' } },
    { name: 'VolumeKnob', shape: 'cylinder', size: [0.6, 0.4, 0.6], at: [6, 1, -1], color: 'grey', move: { as: 'spin', on: 'click' } },
    { name: 'LightBar', size: [10, 0.2, 0.3], at: [0, 1, -1.5], color: 'pink' },
  ] });
  assert.deepEqual(plan.dropped, ['LightBar']);
  const built = O.builtSummary(plan, 20, 19, true);
  assert.match(built, /besides the keys only: VolumeKnob/);
  assert.match(built, /left out[^:]*: LightBar/);
});

// Live 2026-10-01: a complete build_object spec followed by one stray "}" was refused; the keyboard cost 22 credits.
test('a whole argument object with stray closing brackets or trailing commas is read; anything else is still refused', async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'tools-')), 't.mjs');
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--platform=node', '--outfile=' + out, '--external:cloudflare:*', '--log-level=error'], { cwd: WORKER, stdio: 'pipe' });
  const T = await import(`file://${out}`);
  assert.deepEqual(T.recoverJsonObject('{"name":"Kb","parts":[{"a":"}"}]}}'), { name: 'Kb', parts: [{ a: '}' }] });
  assert.deepEqual(T.recoverJsonObject('{"a":1,"b":[1,2,],}'), { a: 1, b: [1, 2] });
  assert.deepEqual(T.recoverJsonObject('{"a":"x \\" }"}]\n'), { a: 'x " }' });
  for (const bad of ['{not json', '{"a":1} {"b":2}', '{"a":1} please', 'x {"a":1}', '[1,2]', '{"a":']) assert.equal(T.recoverJsonObject(bad), undefined, bad);
});

// Round 5 of test 1 (2026-10-01): 53 keys came out in one row, 270 studs long.
test('a keyboard never has a row longer than a real one: one key per row is one sequence, a long row wraps where real rows start', () => {
  const seq = ['Esc', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', 'Caps', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", 'Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', 'Shift', 'Ctrl', 'Alt', 'Space', 'Enter'];
  const want = [13, 13, 12, 12, 4];
  assert.deepEqual(O.keyboardRows([seq]).map((r) => r.length), want, 'one flat row');
  assert.deepEqual(O.keyboardRows(seq.map((k) => [k])).map((r) => r.length), want, 'one key per row');
  assert.deepEqual(O.keyboardRows([['Q', 'W', 'E'], ['A', 'S'], ['Enter'], ['Space']]), [['Q', 'W', 'E'], ['A', 'S', 'Enter'], ['Space']], 'a lone ENTER still joins its row');
  assert.ok(O.keyboardRows([Array.from({ length: 40 }, (_, i) => `k${i}`)]).every((r) => r.length <= 16), 'no starters: thirteens');
  const plan = O.expandObject({ name: 'Kb', scale: 4, parts: [{ name: 'Key', rows: seq.map((k) => [k]), move: { as: 'press', on: 'key' } }] });
  const width = plan.footprint.x1 - plan.footprint.x0;
  assert.ok(width < 80, `the board is ${width.toFixed(0)} studs wide`);
});

// Round 6 of test 1 (2026-10-01): a 36-stud unlabelled "Spacebar" bound to Space bounced beside the real SPACE key.
test('a part bound to a key a keycap already has is not a second key', () => {
  const plan = O.expandObject({ name: 'Kb', scale: 4, parts: [
    { name: 'Key', rows: [['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'], ['Space']], move: { as: 'press', on: 'key' } },
    { name: 'Spacebar', size: [9, 0.5, 1.5], at: [0, 1, 3], color: 'pink', key: 'Space', move: { as: 'press', on: 'key' } },
  ] });
  assert.ok(!plan.parts.some((p) => p.name === 'Spacebar'), 'no second space bar');
  assert.equal(plan.parts.filter((p) => p.text?.value === 'SPACE').length, 1);
});

// Owner's references, 2026-10-01: a dark gamer board with small glowing rainbow legends, and a Roblox walk-on board of
// caramel keycaps with black letters. The pastel toy slabs were neither.
test('a keyboard looks like the user asked: rgb by default, candy for sweets, pastel only when asked', () => {
  assert.equal(O.keyboardTheme('make an asmr keyboard'), 'rgb');
  assert.equal(O.keyboardTheme('make a chocolate keyboard'), 'candy');
  assert.equal(O.keyboardTheme('a cute pastel keyboard'), 'pastel');
  assert.equal(O.keyboardTheme('a red keyboard'), 'given');
  const rows = [['Esc', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'], ['Space']];
  const rgb = O.expandObject({ name: 'Kb', theme: 'rgb', parts: [{ name: 'Key', rows, move: { as: 'press', on: 'key' } }] });
  const caps = rgb.parts.filter((p) => p.text);
  assert.ok(caps.every((p) => parseInt(p.color.slice(1, 3), 16) < 90), 'dark caps');
  const legends = new Set(caps.map((p) => p.text.color));
  assert.ok(legends.size >= 5, 'a rainbow of legends across the board');
  assert.ok(rgb.parts.some((p) => p.material === 'Neon' && /Glow/.test(p.name)), 'an underglow');
  assert.ok(caps.every((p) => p.text.font === 'GothamBold'));
  const cap = caps.find((p) => p.text.value === 'Q'), skirt = rgb.parts.find((p) => p.name === `${cap.name}Skirt`);
  assert.ok(cap.size[1] + skirt.size[1] >= 0.34 * skirt.size[2], 'a chunky cap, not a slab');
  const candy = O.expandObject({ name: 'Kb', theme: 'candy', parts: [{ name: 'Key', rows, move: { as: 'press', on: 'key' } }] });
  assert.ok(candy.parts.filter((p) => p.text).every((p) => p.text.color === '#2a1a10'), 'black letters on caramel');
  const tool = readFileSync(join(WORKER, 'src', 'object-tool.ts'), 'utf8');
  assert.match(tool, /expandObject\(\{ \.\.\.a, theme: keyboardTheme\(ctx\.userRequest\?\.\(\)\)[,}]/, 'the user\'s words choose it');
});

test('every key the player presses floats a "+N" over it', () => {
  const client = readFileSync(join(WORKER, '..', '..', 'packages', 'components', 'animate', 'AppleAnimateClient.luau'), 'utf8');
  assert.match(client, /if who == me and typeof\(model\) == "Instance"/);
  assert.match(client, /label\.Text = "\+" \.\. tostring\(math\.floor\(amount\)\)/);
  const server = readFileSync(join(WORKER, '..', '..', 'packages', 'components', 'animate', 'AppleAnimate.luau'), 'utf8');
  assert.match(server, /played:FireAllClients\(model, clip\._name, player\)/);
});

test('a calculator or a keypad is never given an F row or modifiers it does not have', () => {
  assert.deepEqual(O.completeKeyboard([['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3'], ['0', '.']]), [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3'], ['0', '.']]);
  const full = O.completeKeyboard([['Esc', '1', '2'], ['Q', 'W', 'E'], ['Space']]);
  assert.equal(full[0][0], 'Esc', 'Esc moves up to the F row');
  assert.equal(full[1][0], '`', 'and the number row starts with `');
  assert.deepEqual(full[full.length - 1], ['Ctrl', 'Win', 'Alt', 'Space', 'Alt', 'Fn', 'Ctrl']);
});

// Round 11 of test 1 (2026-10-01): a hot-pink studded wrist rest and a cyan block on a dark gamer board.
test('a keyboard\'s extras wear its theme', () => {
  const plan = O.expandObject({ name: 'Kb', theme: 'rgb', parts: [
    { name: 'Key', rows: [['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'], ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L']], move: { as: 'press', on: 'key' } },
    { name: 'WristRest', size: [10, 0.5, 1.5], at: [0, 1, 3], color: '#ff4fd8' },
    { name: 'VolumeKnob', shape: 'cylinder', size: [0.6, 0.4, 0.6], at: [30, 1, -6], color: '#4fe0ff', move: { as: 'spin', on: 'click' } },
  ] });
  const rest = plan.parts.find((p) => p.name === 'WristRest'), knob = plan.parts.find((p) => p.name === 'VolumeKnob');
  assert.equal(rest.color, '#22242a'); assert.equal(rest.surface, 'smooth');
  assert.equal(knob.color, '#c9cdd6');
});

// Round 11 of test 1 (2026-10-01): a cyan studded CTRL block the model placed itself, beside the layout's own Ctrl.
test('on a board laid out by rows, only the layout\'s own keys stay', () => {
  const plan = O.expandObject({ name: 'Kb', theme: 'rgb', parts: [
    { name: 'Key', rows: [['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'], ['Space']], move: { as: 'press', on: 'key' } },
    { name: 'CtrlKey', size: [5, 1, 4], at: [-30, 1, 4], color: '#4fe0ff', text: 'Ctrl', key: 'LeftControl', move: { as: 'press', on: 'key' } },
  ] });
  assert.ok(!plan.parts.some((p) => p.name === 'CtrlKey'), 'the model\'s own Ctrl went');
  assert.equal(plan.parts.filter((p) => p.text?.value === 'CTRL' || p.text?.value === 'Ctrl').length, 2, 'the layout\'s two Ctrls stay');
});

// Round 12 of test 1 (2026-10-01): seen from the spawn, a wrist rest taller than the keys hid the whole board.
test('a wrist rest is lower than the keytops', () => {
  const plan = O.expandObject({ name: 'Kb', theme: 'rgb', parts: [
    { name: 'Key', rows: [['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'], ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L']], move: { as: 'press', on: 'key' } },
    { name: 'WristRest', size: [40, 3, 6], at: [0, 1.5, 12], color: '#ff4fd8' },
  ] });
  const rest = plan.parts.find((p) => p.name === 'WristRest');
  const keyTop = Math.max(...plan.parts.filter((p) => p.text).map((p) => p.at[1] + p.size[1] / 2));
  assert.ok(rest.at[1] + rest.size[1] / 2 < keyTop, `the rest tops out at ${(rest.at[1] + rest.size[1] / 2).toFixed(2)}, the keys at ${keyTop.toFixed(2)}`);
});

// Round 12 of test 1 (2026-10-01): the model's own part named "Case" (90x3x36, its top above the keytops) was kept as
// if it were the layout's case and swallowed every key on the hub.
test('a model part merely named Case never stands in for the layout\'s case', () => {
  for (const laid of [true, false]) {
    const keyParts = laid
      ? [{ name: 'EscKey', rows: [['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'], ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L']], move: { as: 'press', on: 'key' } }]
      : ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'].map((l, i) => ({ name: `K${i}`, size: [3, 1, 3], at: [-15 + i * 3.2, 1, 0], color: '#333333', text: l, move: { as: 'press', on: 'key' } }));
    const plan = O.expandObject({ name: 'Kb', theme: 'rgb', parts: [{ name: 'Case', size: [90, 3, 36], at: [0, 2.5, 0], color: '#2b2b3d' }, ...keyParts] });
    assert.ok(!plan.parts.some((p) => p.name === 'Case'), `laid out ${laid}: the model's Case stayed`);
    const keyTop = Math.min(...plan.parts.filter((p) => p.text).map((p) => p.at[1] + p.size[1] / 2));
    assert.ok(plan.parts.filter((p) => !p.text && !p.rides).every((p) => p.at[1] + p.size[1] / 2 < keyTop), 'nothing rises above the keys');
  }
});

// Round 13 of test 1 (2026-10-01): a bare "\" key broke the JSON twice (17 credits for a 10-credit keyboard). The schema
// now asks for symbol keys by name; the layout prints the character and binds the real key.
test('symbol keys written by name become their character and key', () => {
  assert.equal(O.symbolOf('Backslash'), '\\');
  assert.equal(O.symbolOf('Quote'), "'");
  assert.equal(O.symbolOf('Left Bracket'), '[');
  assert.equal(O.symbolOf('Q'), 'Q');
  const plan = O.expandObject({ name: 'Kb', parts: [{ name: 'Key', rows: [['Q', 'W', 'Backslash', 'Quote']], move: { as: 'press', on: 'key' } }] });
  const bs = plan.parts.find((p) => p.text?.value === '\\');
  assert.ok(bs, 'a \\ cap'); assert.equal(bs.key, 'BackSlash', 'bound to Enum.KeyCode.BackSlash');
  assert.equal(plan.parts.find((p) => p.text?.value === "'").key, 'Quote');
});

test('a bare backslash key in the arguments is read as the backslash it meant', async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'tools-')), 't.mjs');
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--platform=node', '--outfile=' + out, '--external:cloudflare:*', '--log-level=error'], { cwd: WORKER, stdio: 'pipe' });
  const T = await import(`file://${out}`);
  const bad = '{"name":"Kb","parts":[{"name":"Key","rows":[["Q","W","\\", "]"],["A","\\"]]}]}';
  assert.deepEqual(T.recoverJsonObject(bad).parts[0].rows, [['Q', 'W', '\\', ']'], ['A', '\\']]);
  assert.deepEqual(T.recoverJsonObject('{"a":"x \\" }"}'), { a: 'x " }' }, 'an escaped quote is left alone');
});

// Round 13 of test 1 (2026-10-01): the hub keyboard's bottom row was only SPACE and ENTER.
test('a space-bar row without modifiers becomes the real bottom row, its other keys moving up', () => {
  const rows = O.completeKeyboard([['Q', 'W', 'E'], ['A', 'S', 'D'], ['Space', 'Enter']]);
  assert.deepEqual(rows[rows.length - 1], ['Ctrl', 'Win', 'Alt', 'Space', 'Alt', 'Fn', 'Ctrl']);
  assert.equal(rows[rows.length - 2].at(-1), 'Enter', 'Enter joins the row above');
  assert.deepEqual(O.completeKeyboard([['Q'], ['Ctrl', 'Alt', 'Space', 'Alt']]).at(-1), ['Ctrl', 'Alt', 'Space', 'Alt'], 'a row with its modifiers is left alone');
});

// Test 2 round 1 (2026-10-01): a yellow stick of butter on the gamer keyboard's dark slate stage.
test('only a keyboard wears its theme; another object stands on a stage that contrasts with it', () => {
  assert.equal(O.contrastStage('#ffe680'), '#4f8cff', 'butter on blue');
  assert.equal(O.contrastStage('#4fa3ff'), '#ffd23f', 'a blue thing on gold');
  assert.equal(O.contrastStage('#ffffff'), '#4f8cff', 'white on blue');
  assert.equal(O.mainColour([{ color: '#ffe680', size: [12, 6, 6] }, { color: '#ffffff', size: [12, 0.5, 6] }]), '#ffe680');
  const tool = readFileSync(join(WORKER, 'src', 'object-tool.ts'), 'utf8');
  assert.match(tool, /isBoard && plan\.theme === 'rgb' \? '#3a3d46'/);
  const anim = readFileSync(join(WORKER, '..', '..', 'packages', 'components', 'animate', 'AppleAnimate.luau'), 'utf8');
  assert.ok(!/MaxActivationDistance = clip\.reach or (32|40)\b/.test(anim), 'clicks reach from the spawn');
});

// Test 2 round 2 (2026-10-01), the model's own spec as built: every detail at the butter's centre, 8 x 2 x 2, no move.
const BUTTER = { name: 'StickOfButter', parts: [
  { name: 'Butter', size: [8, 2, 2], at: [0, 1, 0], color: '#f5e27a' },
  { name: 'ButterTop', size: [8, 0.4, 2], at: [0, 0.2, 0], color: '#e8d96a' },
  { name: 'Wrapper', size: [8.4, 0.8, 2.4], at: [0, 0.4, 0], color: '#f7f3e8' },
  { name: 'Label', size: [4, 0.8, 0.4], at: [0, 0.4, 0], color: '#d9c94f' },
  { name: 'WrapperFold', size: [1.2, 0.8, 2.4], at: [0, 0.4, 0], color: '#f7f3e8' },
] };
const inside = (q, at) => [0, 1, 2].every((i) => Math.abs(at[i] - q.at[i]) < q.size[i] / 2 - 0.05);

test('no detail stays hidden inside the body: a top goes on top, a wrapper under it, a label on the side the spawn sees', () => {
  const plan = O.expandObject(BUTTER);
  assert.ok(!('error' in plan), JSON.stringify(plan));
  const by = Object.fromEntries(plan.parts.map((p) => [p.name, p]));
  for (const p of plan.parts) for (const q of plan.parts) {
    if (p !== q && q.size[0] * q.size[1] * q.size[2] > p.size[0] * p.size[1] * p.size[2]) assert.ok(!inside(q, p.at), `${p.name} is hidden inside ${q.name}`);
  }
  assert.ok(by.ButterTop.at[1] > by.Butter.at[1], 'the top is above the butter');
  assert.ok(by.Wrapper.at[1] < by.Butter.at[1], 'the wrapper is under it');
  assert.ok(by.Label.at[2] > by.Butter.at[2], 'the label faces the spawn (+Z)');
  assert.deepEqual([...plan.unburied].sort(), ['ButterTop', 'Label', 'Wrapper', 'WrapperFold'].sort());
  assert.equal(Math.min(...plan.parts.map((p) => p.at[1] - p.size[1] / 2)).toFixed(6), '0.000000', 'still grounded');
});

test('a too-small object is grown to be worth walking up to; a scale the model chose is kept', () => {
  const plan = O.expandObject(BUTTER);
  const long = plan.footprint.x1 - plan.footprint.x0;
  assert.ok(long >= 2 * O.PLAYER_HEIGHT && long <= 4 * O.PLAYER_HEIGHT, `longest side ${long}`);
  assert.ok(plan.grown > 1);
  // RESTATED round 5: a scale the model chose that still leaves it small is grown too; one that is big enough is kept.
  const small = O.expandObject({ ...BUTTER, scale: 1.25 });
  assert.ok(small.footprint.x1 - small.footprint.x0 >= 12, 'scale 1.25 left it 10.5 long');
  const kept = O.expandObject({ ...BUTTER, scale: 2 });
  assert.equal(kept.footprint.x1 - kept.footprint.x0, 16.8, 'scale 2 makes it big enough');
  assert.equal(kept.grown, undefined);
  assert.equal(O.fitFactor([{ at: [0, 10, 0], size: [20, 20, 4] }]), 1, 'big enough already');
});

test('an object nobody gave a move wobbles on a click as one, with a sound, so it gets its counter and hint', () => {
  const plan = O.expandObject(BUTTER);
  const moving = plan.parts.filter((p) => p.move);
  assert.equal(moving.length, 1);
  assert.equal(moving[0].name, 'Butter', 'the biggest part');
  assert.deepEqual([moving[0].move.as, moving[0].move.on], ['wobble', 'click']);
  assert.ok(moving[0].move.sound);
  assert.ok(plan.parts.filter((p) => p !== moving[0]).every((p) => p.rides === 'Butter'), 'the rest ride it');
  const said = O.builtSummary(plan, 1, 0, true);
  assert.ok(!/keycap/.test(said), said);
  assert.match(said, /made of: .*Label/);
  assert.match(said, /no words are printed/, 'says the label has no words, so the reply cannot promise a printed one');
  // A model that gave a move keeps its own; RESTATED round 6: a loop-only move is set off by a click instead.
  const own = O.expandObject({ ...BUTTER, parts: [{ ...BUTTER.parts[0], move: { as: 'spin', on: 'click' } }, ...BUTTER.parts.slice(1)] });
  assert.equal(own.gaveMotion, undefined);
  assert.equal(own.parts.find((p) => p.name === 'Butter').move.as, 'spin');
});

test('words on a thin side face the spawn unless a face is given', () => {
  assert.equal(O.thinFace([4, 0.8, 0.4]), 'Back', 'a label standing on the side: +Z, toward the spawn');
  assert.equal(O.thinFace([3, 0.5, 3]), 'Top', 'a keycap or a flat sign');
  const plan = O.expandObject({ name: 'Box', parts: [{ name: 'Body', size: [8, 8, 8], at: [0, 4, 0], color: '#ff0000' }, { name: 'Label', size: [4, 2, 0.2], at: [0, 4, 4.1], text: 'HI' }] });
  assert.equal(plan.parts.find((p) => p.name === 'Label').text.face, 'Back');
});

test('the build_object description holds no test answer', () => {
  const src = readFileSync(join(WORKER, 'src', 'tools.ts'), 'utf8');
  const desc = /name: 'build_object',\s*description: "([^"]+)"/.exec(src)?.[1] ?? '';
  assert.ok(desc.length > 100);
  assert.ok(!/butter/i.test(desc), 'the owner\'s own test object is not spelled out in the tool');
});

// Test 2 round 3 (2026-10-01): a wrapper over the whole top, "BUTTER" under the melty top and sideways, a clickable
// butter whose hint said "Watch it go!", and a wobble that left the top and wrapper flat.
test('a wrapper goes under the body even when its name also says fold', () => {
  const parts = [
    { name: 'ButterBody', size: [20, 6, 10], at: [0, 3, 0], color: '#ffe066' },
    { name: 'WrapperFold', size: [21, 1.2, 11], at: [0, 3, 0], color: '#fff3b0' },
  ];
  O.unbury(parts);
  assert.ok(parts[1].at[1] < parts[0].at[1], 'under, not a lid');
});

test('words nobody can see move to the side the spawn sees', () => {
  const plan = O.expandObject({ name: 'Butter', scale: 1, parts: [
    { name: 'ButterBody', size: [20, 6, 10], at: [0, 3, 0], color: '#ffe066' },
    { name: 'Wrapper', size: [21, 1.2, 11], at: [0, 6.6, 0], color: '#fff3b0', text: 'BUTTER' },
    { name: 'MeltyTop', size: [4, 1.6, 4], at: [0, 8, 0], color: '#ffd23f' },
  ] });
  const body = plan.parts.find((p) => p.name === 'ButterBody');
  assert.equal(body.text?.value, 'BUTTER', 'the words moved to the body');
  assert.equal(body.text.face, 'Back', 'on the side facing the spawn');
  assert.equal(plan.parts.find((p) => p.name === 'Wrapper').text, undefined);
  // A tall part keeps its words, on its own spawn side.
  assert.deepEqual(O.readableText([{ name: 'Sign', size: [6, 4, 1], at: [0, 2, 0], text: { value: 'HI', face: 'Top' } }, { name: 'Hat', size: [6, 1, 1], at: [0, 4.5, 0] }]), ['Sign']);
});

test('a wobbling or spinning label reads upright; only a door keeps its own axes', () => {
  const part = (as) => ({ name: 'L', shape: 'block', size: [6, 1, 2], at: [0, 0, 0], color: '#fff', text: { value: 'A', face: 'Top', color: '#000' }, move: { as, on: 'click' } });
  for (const as of ['press', 'wobble', 'spin', 'bob']) assert.deepEqual(O.uprightLabel(part(as)).Orientation, [0, -90, 0], as);
  assert.equal(O.uprightLabel(part('open')).Orientation, undefined);
  const tool = readFileSync(join(WORKER, 'src', 'object-tool.ts'), 'utf8');
  assert.match(tool, /uprightLabel\(p\)\.Orientation \? \[0, 90, 0\]/, 'a turned part\'s joint is turned back');
  assert.match(tool, /hingePoint\(leader, origin\)/, 'a rider of a turning part hinges where its leader does');
});

test('the hint says what the player can do, and the counter counts only what a player set off', () => {
  const tool = readFileSync(join(WORKER, 'src', 'object-tool.ts'), 'utf8');
  const hint = /hint: keyed \?[^\n]+\n[^\n]+/.exec(tool)?.[0] ?? '';
  assert.ok(hint.indexOf("'Click it!'") >= 0 && hint.indexOf("'Click it!'") < hint.indexOf("'Watch it go!'"), hint);
  assert.match(tool, /OnClientEvent:Connect\(function\(model, _clip, player\)[\s\S]{0,120}player == nil then return end/);
});

// Test 2 round 4 (2026-10-01): a 6 x 6 x 30 butter pointing at the spawn, and its wrapper flat over the whole top.
const ROUND4 = { name: 'StickOfButter', parts: [
  { name: 'Butter', size: [6, 6, 30], at: [0, 3, 0], color: '#ffe066', text: { value: 'BUTTER', face: 'Back' }, move: { as: 'bob', on: 'touch' } },
  { name: 'Wrapper', size: [7.2, 1.2, 31.2], at: [0, 6.6, 0], color: '#fff3b0', text: 'SALTED', move: { as: 'wobble', on: 'click' } },
] };

test('a long thing lies across the view from the spawn, its words on the side the spawn sees', () => {
  const plan = O.expandObject(ROUND4);
  const butter = plan.parts.find((p) => p.name === 'Butter');
  assert.deepEqual(butter.size, [30, 6, 6], 'long along X now');
  assert.equal(butter.text.face, 'Back');
  assert.ok(plan.footprint.x1 - plan.footprint.x0 > plan.footprint.z1 - plan.footprint.z0);
  // A wide thing stays as it was; so does one with a rotation of its own.
  assert.equal(O.faceAcross([{ name: 'A', size: [30, 6, 6], at: [0, 3, 0] }]), false);
  assert.equal(O.faceAcross([{ name: 'A', size: [6, 6, 30], at: [0, 3, 0], rot: [0, 45, 0] }]), false);
  const door = [{ name: 'Door', size: [1, 8, 4], at: [0, 4, 0], move: { as: 'open', on: 'click', hinge: 'back' } }];
  O.faceAcross(door);
  assert.equal(door[0].move.hinge, 'left', '+Z turns to -X with the part');
});

test('a wrapper laid over the whole top goes under the body, and its words stay where they can be seen', () => {
  const plan = O.expandObject(ROUND4);
  const by = Object.fromEntries(plan.parts.map((p) => [p.name, p]));
  assert.ok(by.Wrapper.at[1] < by.Butter.at[1], 'under the butter');
  assert.equal(by.Wrapper.text?.value, 'SALTED', 'its words stay: its edge is 1.2 studs tall');
  assert.equal(by.Wrapper.text.face, 'Back', 'on its edge facing the spawn, not under the butter');
  // Round 6: on a 0.4-stud edge nobody can read them, so they go and the summary cannot promise them.
  const thin = O.expandObject({ ...ROUND4, parts: [ROUND4.parts[0], { ...ROUND4.parts[1], size: [7.2, 0.4, 31.2] }] });
  assert.equal(thin.parts.find((p) => p.name === 'Wrapper').text, undefined);
  assert.ok(!/SALTED/.test(O.builtSummary(thin, 2, 0, true)));
  // A topping on top stays on top.
  const cake = [{ name: 'Cake', size: [10, 6, 10], at: [0, 3, 0] }, { name: 'Icing', size: [10, 1, 10], at: [0, 6.5, 0] }];
  O.unbury(cake);
  assert.equal(cake[1].at[1], 6.5);
});

test('an object whose moves all play by themselves answers a click (round 6: a bobbing butter nobody could press)', () => {
  const plan = O.expandObject({ name: 'StickOfButter', parts: [
    { name: 'Butter', size: [3, 3, 12], at: [0, 1.5, 0], color: '#ffe066', move: { as: 'bob', on: 'loop' } },
    { name: 'Wrapper', size: [3.4, 0.4, 12.4], at: [0, 0.2, 0], color: '#fff9c4' },
  ] });
  const butter = plan.parts.find((p) => p.name === 'Butter');
  assert.deepEqual([butter.move.as, butter.move.on], ['bob', 'click']);
  assert.equal(plan.gaveMotion, 'Butter');
  assert.match(O.builtSummary(plan, 1, 0, true), /Butter moves when clicked/);
  // A loop beside something the player can press stays a loop.
  const fan = O.expandObject({ name: 'Fan', parts: [
    { name: 'Blades', size: [8, 0.5, 8], at: [0, 6, 0], move: { as: 'spin', on: 'loop' } },
    { name: 'Button', size: [1, 1, 1], at: [3, 0.5, 0], move: { as: 'press', on: 'click' } },
  ] });
  assert.equal(fan.parts.find((p) => p.name === 'Blades').move.on, 'loop');
});

// Test 2 round 7 (2026-10-01): a "stick of butter" 12 x 9 x 6, and the reply put its wrapper "on top" (it was under).
test('a thing named for its shape gets that shape: a stick is long, a coin is flat', () => {
  assert.equal(O.shapeWord('make me a stick of butter'), 'long');
  assert.equal(O.shapeWord('StickOfButter'), 'long', 'the name says it too');
  assert.equal(O.shapeWord('a giant pizza'), 'flat');
  assert.equal(O.shapeWord('an asmr keyboard'), undefined);
  assert.equal(O.shapeWord('a bathtub'), undefined, 'a word inside another is not the word');
  const plan = O.expandObject({ name: 'StickOfButter', request: 'make me a stick of butter', parts: [
    { name: 'ButterBody', size: [12, 9, 6], at: [0, 4.5, 0], color: '#ffe066', text: { value: 'BUTTER', face: 'Back' } },
    { name: 'Wrapper', size: [13.2, 1.2, 7.2], at: [0, 9.6, 0], color: '#fff3b0' },
  ] });
  const f = plan.footprint, long = f.x1 - f.x0, deep = f.z1 - f.z0;
  assert.ok(long >= 3 * Math.max(deep, f.top) - 1e-6, `${long} x ${f.top} x ${deep} is a stick`);
  const coin = O.expandObject({ name: 'Coin', request: 'make a giant coin', parts: [{ name: 'Face', size: [10, 10, 10], at: [0, 5, 0], color: '#ffd23f' }] });
  assert.ok(coin.footprint.top <= 0.35 * (coin.footprint.x1 - coin.footprint.x0) + 1e-6, 'flat');
  // Already the right shape: left alone.
  assert.equal(O.shapeTo([{ size: [20, 4, 4], at: [0, 2, 0] }], 'long'), 1);
});

test('the summary says where each detail is on the body', () => {
  const plan = O.expandObject({ name: 'StickOfButter', parts: [
    { name: 'Butter', size: [30, 6, 6], at: [0, 4.2, 0], color: '#ffe066' },
    { name: 'Wrapper', size: [31, 1.2, 7], at: [0, 0.6, 0], color: '#fff3b0' },
    { name: 'Pat', size: [3, 1, 3], at: [0, 7.7, 0], color: '#ffd23f' },
  ] });
  const said = O.builtSummary(plan, 1, 0, true);
  assert.match(said, /Wrapper is under Butter/);
  assert.match(said, /Pat is on top of Butter/);
});

// Test 2 round 8 (2026-10-01): the model's reply promised a "SALTED" wrapper "on top" that was under, with no words.
test('an object run answers with what was built, once the play check passed', () => {
  const plan = O.expandObject({ name: 'StickOfButter', request: 'make me a stick of butter', parts: [
    { name: 'Butter', size: [3, 3, 10], at: [0, 1.9, 0], color: '#ffe066', text: 'BUTTER', move: { as: 'bob', on: 'touch' } },
    { name: 'Wrapper', size: [3.5, 0.4, 10.5], at: [0, 3.6, 0], color: '#fff3b0', text: 'SALTED', move: { as: 'wobble', on: 'click', sound: 'paper' } },
  ] });
  const said = O.objectForUser(plan);
  assert.match(said, /^Your stick of butter is in front of the spawn/);
  assert.match(said, /"BUTTER" printed/);
  assert.match(said, /wrapper underneath/);
  assert.ok(!/SALTED|on top/.test(said.replace(/printed on its top/, '')), said);
  assert.match(said, /Click it and the wrapper wobbles/);
  assert.match(said, /walk into it and the butter bobs/);
  const session = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
  assert.match(session, /call\.name === 'build_object' && out\.ok && agent\.objectRun\) \{[\s\S]{0,260}agent\.composedObject = true/);
  assert.match(session, /\(agent\.composedPlotSim \|\| agent\.composedObject\) && agent\.composedForUser && agent\.playChecked && !agent\.lastCheckProblem/);
  assert.match(session, /!\/\^the player has no\/i\.test\(seen\.leaderstats\)/, 'no money line for a game without money');
  const tool = readFileSync(join(WORKER, 'src', 'object-tool.ts'), 'utf8');
  assert.match(tool, /plan\.parts\.some\(\(p\) => p\.key\) \? \{\} : \{ forUser: objectForUser\(plan\) \}/, 'keyboards keep their own answer');
});

test('words with no colour of their own are dark ink on a light part; a colour given is kept (round 9)', () => {
  const plan = O.expandObject({ name: 'StickOfButter', parts: [
    { name: 'Butter', size: [30, 6, 8], at: [0, 3, 0], color: '#ffe066', text: 'BUTTER' },
    { name: 'Sign', size: [6, 3, 1], at: [0, 7.5, 0], color: '#ffffff', text: { value: 'HI', color: '#ff0000' } },
    { name: 'Plate', size: [30, 1, 8], at: [0, 0.5, 8], color: '#222222', text: 'YUM' },
  ] });
  const by = Object.fromEntries(plan.parts.map((p) => [p.name, p]));
  assert.equal(by.Butter.text.color, '#2b2118');
  assert.equal(by.Sign.text.color, '#ff0000', 'the model chose red');
  assert.equal(by.Plate.text.color, '#ffffff', 'white on a dark part');
});
