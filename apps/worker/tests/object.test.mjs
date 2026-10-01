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
    [{ name: 'X', parts: [{ size: [1, 0, 1], at: [0, 0, 0], color: '#ffffff' }] }, /size/],
    [{ name: 'X', parts: [{ size: [1, 1, 1], at: [0, 0, 0], color: 'red' }] }, /color/],
    [{ name: 'X', parts: [{ size: [1, 1, 1], at: [0, 0, 0], color: '#ffffff', move: { as: 'dance' } }] }, /move.as/],
    [{ name: 'X', parts: [{ size: [1, 1, 1], at: [0, 0, 0], color: '#ffffff', repeat: { grid: [30, 30, 1], step: [1, 0, 1] } }] }, /more than/],
  ]) {
    const r = O.expandObject(spec);
    assert.ok('error' in r, JSON.stringify(spec));
    assert.match(r.error, why);
  }
});
