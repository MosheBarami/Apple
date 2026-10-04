/**
 * animate_model: rig a model the RigEdit way and play keyframes from code (owner's tutorial + RigEdit Lite, 2026-10-01).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'animate-')), 'a.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'animate-tool.ts'), '--bundle', '--format=esm', '--target=es2022', '--platform=node', '--outfile=' + out, '--external:cloudflare:*'], { cwd: WORKER, stdio: 'pipe' });
const A = await import(`file://${out}`);

const press = { play: 'click', length: 0.25, keys: [{ t: 0, Key: { move: [0, 0, 0] } }, { t: 0.08, ease: 'Quad', Key: { move: [0, -0.3, 0] } }, { t: 0.25, ease: 'Back', Key: { move: [0, 0, 0] } }] };

test('clips: a keyboard press is accepted as written', () => {
  const r = A.readClips({ 'Key_A.press': press, spin: { play: 'loop', keys: [{ t: 0, Fan: { rot: [0, 0, 0] } }, { t: 2, Fan: { rot: [0, 360, 0] } }] } });
  assert.ok(!('error' in r), JSON.stringify(r));
  assert.deepEqual(r.clips['Key_A.press'].keys[1], { t: 0.08, ease: 'Quad', Key: { move: [0, -0.3, 0] } });
  assert.equal(r.clips.spin.length, 2, 'length defaults to the last key');
});

test('clips: what would break the player is refused with a reason', () => {
  const bad = [
    [{}, /1 to 40 clips/],
    [{ x: { ...press, play: 'hover' } }, /play must be/],
    [{ x: { ...press, keys: [press.keys[0]] } }, /2 to 120 keys/],
    [{ x: { ...press, keys: [{ t: -1, Key: { move: [0, 0, 0] } }, press.keys[1]] } }, /seconds from 0/],
    [{ x: { ...press, keys: [{ t: 0, Key: { move: [0, 0] } }, press.keys[1]] } }, /rot and\/or move/],
    [{ x: { ...press, keys: [{ t: 0, ease: 'Wobbly', Key: { move: [0, 0, 0] } }, press.keys[1]] } }, /ease must be/],
    [{ x: { ...press, keys: [{ t: 0 }, press.keys[1]] } }, /names no joint/],
    [{ 'bad name!': press }, /plain name/],
    [{ x: { ...press, sound: 'rbxassetid://1' } }, /not a sound from StudPilot's library/],
  ];
  for (const [clips, why] of bad) {
    const r = A.readClips(clips);
    assert.ok('error' in r, `accepted ${JSON.stringify(clips).slice(0, 80)}`);
    assert.match(r.error, why);
  }
});

test('the animation player ships as a component and rig ops are on the wire', () => {
  const gen = readFileSync(join(WORKER, 'src', 'components.generated.ts'), 'utf8');
  assert.match(gen, /"animate": \{/);
  const shared = readFileSync(join(WORKER, '..', '..', 'packages', 'shared', 'src', 'index.ts'), 'utf8');
  for (const op of ['rig_model', 'set_joint_pivot', 'reset_joints']) assert.match(shared, new RegExp(`op: '${op}'`));
  const plugin = readFileSync(join(WORKER, '..', 'studpilot-plugin', 'src', 'ops', 'Joints.luau'), 'utf8');
  assert.match(plugin, /RIGEDIT LITE/, 'the plugin credits RigEdit Lite');
  for (const op of ['rig_model', 'set_joint_pivot', 'reset_joints']) assert.match(plugin, new RegExp(`${op} = handle`));
});
