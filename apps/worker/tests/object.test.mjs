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
  assert.equal(plan.parts.length, 1 + 37 * 2);
  const keys = plan.parts.filter((p) => p.move);
  assert.equal(keys.length, 37);
  assert.equal(plan.parts.filter((p) => p.rides).length, 37, 'every key has its skirt');
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
  const keys = plan.parts.filter((p) => p.name.startsWith('Key_') && !p.rides);
  assert.equal(keys.length, 21);
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
  assert.equal(keys.length, 13);
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
  assert.equal(keys.length, 10);
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
  assert.equal(plan.parts.filter((p) => p.name.startsWith('Key_') && !p.rides).length, 13);
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
  assert.deepEqual(rows.parts.filter((p) => p.move).map((p) => p.move.on), ['key', 'key', 'key']);
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
  const middle = (top('Q').at[0] + top('P').at[0]) / 2;
  assert.ok(Math.abs(top('Space').at[0] - middle) < 1e-6, 'the space bar is in the middle');
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
  assert.match(src, /p\.key \? \[\{ className: 'UITextSizeConstraint', name: 'Legend', props: \{ MaxTextSize: \d+ \} \}\]/);
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
