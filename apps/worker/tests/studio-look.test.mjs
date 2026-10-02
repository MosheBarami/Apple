/**
 * LOOK, THE CAMERA HALF: frame what was changed from several angles, player eye level included, using only the
 * plugin operations that already exist — then put the user's camera back.
 *
 * Properties under test:
 *   - the poses really point at the subject, from several sides, and one of them is at a player's eye height
 *   - the only operations used are the existing viewport / camera / capture / bounds / render ones, and the camera is
 *     only ever written through set_props on the camera or camera_focus — never anything that leaves an instance behind
 *   - the user's camera is restored, on every path including a thrown one
 *   - when the native route is not there the fallback says so ("box approximation") and the camera is still put back
 *   - a failure to look is reported as one, never as an observation
 *
 * The model and the plugin are fakes; nothing leaves the process.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { lookAtComponents, framePoses, runLook, LOOK_VIEWS } from '../src/studio-look.ts';
import { encodePng, bytesToBase64 } from '../src/png.ts';

const rgb = new Uint8Array(8 * 6 * 3).fill(120);
const PNG = bytesToBase64(await encodePng(rgb, 8, 6));
const frame = () => ({ ok: true, id: 'x', data: { source: 'studio_viewport', encoding: 'png', rgbBase64: PNG, width: 8, height: 6, view: 'viewport', subject: 'game.Workspace', capturedAt: 1 } });

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const vec = (c) => ({ right: [c[3], c[6], c[9]], up: [c[4], c[7], c[10]], back: [c[5], c[8], c[11]] });
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// ================================================================================= the geometry ===

test('lookAtComponents: the identity pose, and a quarter turn', () => {
  assert.deepEqual(lookAtComponents([0, 0, 10], [0, 0, 0]).map((n) => Math.round(n * 1e6) / 1e6), [0, 0, 10, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const turned = lookAtComponents([10, 0, 0], [0, 0, 0]).map((n) => Math.round(n * 1e6) / 1e6);
  assert.deepEqual(turned, [10, 0, 0, 0, 0, 1, 0, 1, 0, -1, 0, 0]);
});

test('lookAtComponents: for any pose the rotation is orthonormal and the camera looks at the target', () => {
  for (const [pos, target] of [[[5, 9, -3], [1, 2, 3]], [[-40, 12, 80], [0, 0, 0]], [[0, 50, 0.001], [0, 0, 0]], [[3, 3, 3], [3, -10, 3]]]) {
    const c = lookAtComponents(pos, target);
    const { right, up, back } = vec(c);
    for (const v of [right, up, back]) assert.ok(near(dot(v, v), 1, 1e-5), `unit ${JSON.stringify(pos)}`);
    assert.ok(near(dot(right, up), 0, 1e-5) && near(dot(up, back), 0, 1e-5) && near(dot(right, back), 0, 1e-5));
    const want = [target[0] - pos[0], target[1] - pos[1], target[2] - pos[2]];
    const len = Math.hypot(...want);
    const look = back.map((n) => -n);
    for (let i = 0; i < 3; i++) assert.ok(near(look[i], want[i] / len, 1e-5), `looks at the target ${JSON.stringify(pos)}`);
    assert.ok(c.every(Number.isFinite));
  }
});

const box = { centre: [10, 5, -20], size: [30, 10, 24] };

test('framePoses: several different sides, each looking at the subject, none inside it', () => {
  const poses = framePoses({ boxes: [box], spawn: null, views: LOOK_VIEWS.default });
  assert.deepEqual(poses.map((p) => p.name), ['front', 'high', 'eye']);
  const seen = new Set();
  for (const p of poses) {
    const { back } = vec(p.cframe);
    const look = back.map((n) => -n);
    const want = [p.focus[0] - p.cframe[0], p.focus[1] - p.cframe[1], p.focus[2] - p.cframe[2]];
    const len = Math.hypot(...want);
    for (let i = 0; i < 3; i++) assert.ok(near(look[i], want[i] / len, 1e-5), p.name);
    assert.ok(Math.hypot(p.cframe[0] - 10, p.cframe[1] - 5, p.cframe[2] + 20) > 15, `${p.name} must stand clear of the subject`);
    seen.add(`${Math.sign(p.cframe[0] - 10)}${Math.sign(p.cframe[2] + 20)}`);
  }
  assert.ok(seen.size >= 2, 'the views must come from more than one side');
});

test('framePoses: the eye pose stands at player eye height above the ground under the subject', () => {
  const eye = framePoses({ boxes: [box], spawn: null, views: ['eye'] })[0];
  const groundY = 5 - 10 / 2;
  assert.ok(eye.cframe[1] > groundY + 3.5 && eye.cframe[1] < groundY + 6, `eye y ${eye.cframe[1]}`);
  assert.match(eye.label, /eye/i);
});

test('framePoses: the eye pose starts from the spawn when the spawn is near, and says so', () => {
  const spawn = { centre: [10, 0.5, 20], size: [6, 1, 6] };
  const eye = framePoses({ boxes: [box], spawn, views: ['eye'] })[0];
  assert.ok(Math.abs(eye.cframe[0] - 10) < 1e-6 && Math.abs(eye.cframe[2] - 20) < 1e-6, 'the camera stands on the spawn');
  assert.ok(Math.abs(eye.cframe[1] - (0.5 + 0.5 + 4.7)) < 1e-6, 'five studs above the spawn surface');
  assert.match(eye.label, /spawn/i);
});

test('framePoses: a spawn too far away to see the subject is not used, and the label does not claim it', () => {
  const eye = framePoses({ boxes: [box], spawn: { centre: [4000, 0, 4000], size: [6, 1, 6] }, views: ['eye'] })[0];
  assert.doesNotMatch(eye.label, /from the spawn/i);
  assert.ok(Math.hypot(eye.cframe[0] - 10, eye.cframe[2] + 20) < 200);
});

test('framePoses: several boxes are framed together, and a pose never goes under the ground', () => {
  const poses = framePoses({ boxes: [box, { centre: [-60, 2, 30], size: [10, 4, 10] }], spawn: null, views: ['front', 'high', 'side', 'eye'] });
  assert.equal(poses.length, 4);
  for (const p of poses) assert.ok(p.cframe[1] > -3 - 1e-6, `${p.name} y ${p.cframe[1]}`);
});

// ==================================================================================== the run ===

function plugin({ capture = frame, setProps = () => ({ ok: true, id: 'p', data: {} }), failBounds = false, camera = [1, 2, 3, 1, 0, 0, 0, 1, 0, 0, 0, 1], noViewport = false, top } = {}) {
  const ops = [];
  const exec = async (op) => {
    ops.push(op);
    switch (op.op) {
      case 'viewport_info':
        return noViewport ? { id: 'v', ok: false, error: 'unsupported' } : { id: 'v', ok: true, data: { camera: { cframe: camera, fov: 70 }, workspaceTopLevel: top ?? [{ path: 'game.Workspace.Garden', class: 'Model', center: [10, 5, -20], size: [30, 10, 24] }, { path: 'game.Workspace.SpawnPad', class: 'SpawnLocation', center: [10, 0.5, 20], size: [6, 1, 6] }] } };
      case 'spatial_query':
        return failBounds ? { id: 's', ok: false, error: 'unsupported' } : { id: 's', ok: true, data: { action: 'bounds', path: op.path, center: [10, 5, -20], size: [30, 10, 24] } };
      case 'set_props': return setProps(op);
      case 'camera_focus': return { id: 'c', ok: true, data: { focused: op.path } };
      case 'capture_studio_viewport': return capture(op);
      default: return { id: 'o', ok: false, error: `unexpected ${op.op}` };
    }
  };
  return { ops, exec };
}

const observeFake = (verdict = 'seen') => {
  const seenInputs = [];
  const fn = async (input) => {
    seenInputs.push(input);
    return { ok: true, observations: (input.expect.length ? input.expect : ['the change']).map((about) => ({ about, verdict, note: 'visible' })), answers: [], issues: [], neurons: 77 };
  };
  fn.inputs = seenInputs;
  return fn;
};
const deps = (p, extra = {}) => ({ exec: p.exec, boxViews: async () => ({ error: 'none' }), observe: observeFake(), sleep: async () => {}, ...extra });
const args = (extra = {}) => ({ request: 'a garden', touched: ['game.Workspace.Garden.Fountain'], expect: ['a fountain'], questions: [], ...extra });

test('the native route: poses, captures, an observation call with those frames, and the camera put back', async () => {
  const p = plugin();
  const d = deps(p);
  const out = await runLook(d, args());
  assert.equal(out.ok, true);
  assert.equal(out.source, 'studio_viewport');
  assert.deepEqual(out.views, ['front', 'high', 'eye']);
  assert.equal(d.observe.inputs.length, 1);
  assert.equal(d.observe.inputs[0].frames.length, 3);
  assert.equal(out.cameraRestored, true);
  const sets = p.ops.filter((o) => o.op === 'set_props');
  assert.equal(sets.length, 4, 'three poses and the restore');
  assert.deepEqual(sets.at(-1).props.CFrame, { t: 'CFrame', v: [1, 2, 3, 1, 0, 0, 0, 1, 0, 0, 0, 1] }, 'the last write puts the saved camera back');
  assert.ok(sets.every((o) => o.path === 'game.Workspace.Camera'), 'only the camera is ever written');
  assert.equal(out.neurons, 77);
});

test('only the existing viewport, camera, capture and bounds operations are used — nothing that makes or deletes anything', async () => {
  const p = plugin();
  await runLook(deps(p), args());
  const allowed = new Set(['viewport_info', 'spatial_query', 'set_props', 'camera_focus', 'capture_studio_viewport', 'render_view']);
  assert.ok(p.ops.every((o) => allowed.has(o.op)), p.ops.map((o) => o.op).join(','));
  assert.ok(p.ops.filter((o) => o.op === 'spatial_query').every((o) => o.action === 'bounds'));
});

test('the observation request carries the user\'s request, the agent\'s expectations and where the frames came from', async () => {
  const p = plugin();
  const d = deps(p);
  await runLook(d, args({ expect: ['a fountain', 'a path'], questions: ['is the gate open?'] }));
  const input = d.observe.inputs[0];
  assert.equal(input.request, 'a garden');
  assert.deepEqual(input.expect, ['a fountain', 'a path']);
  assert.deepEqual(input.questions, ['is the gate open?']);
  assert.equal(input.source, 'studio_viewport');
  assert.ok(input.frames.some((f) => /eye/i.test(f.label)), 'one frame is at the player\'s eye level');
  assert.ok(input.frames.every((f) => f.source === 'studio_viewport' && f.pngBase64.length > 10));
});

test('the agent chooses the views, and an unknown view name is ignored rather than guessed', async () => {
  const p = plugin();
  const out = await runLook(deps(p), args({ views: ['eye', 'side', 'sideways'] }));
  assert.deepEqual(out.views, ['eye', 'side']);
});

test('bounds come from the top-level summary when the bounds query is not there', async () => {
  const p = plugin({ failBounds: true });
  const out = await runLook(deps(p), args({ touched: ['game.Workspace.Garden.Fountain.Basin'] }));
  assert.equal(out.ok, true);
  assert.deepEqual(out.views, ['front', 'high', 'eye']);
});

test('a camera that cannot be set falls back to one framed view, labelled, and the camera restore is still attempted', async () => {
  const p = plugin({ setProps: () => ({ id: 'p', ok: false, error: 'refused', failure: 'refused' }) });
  const d = deps(p);
  const out = await runLook(d, args());
  assert.equal(out.ok, true);
  assert.ok(p.ops.some((o) => o.op === 'camera_focus'));
  assert.deepEqual(out.views, ['framed by Studio']);
  assert.equal(out.cameraRestored, false, 'it could not be put back, and the outcome says so');
  assert.match(out.note, /camera/i);
});

test('native capture unavailable: the fallback is box views, labelled as a box approximation, and the camera is still restored', async () => {
  const p = plugin({ capture: () => ({ id: 'c', ok: false, error: 'native capture unavailable' }) });
  const boxFrames = [{ label: 'hero', source: 'box_approximation', pngBase64: PNG, width: 8, height: 6 }, { label: 'side', source: 'box_approximation', pngBase64: PNG, width: 8, height: 6 }];
  const d = deps(p, { boxViews: async () => ({ frames: boxFrames }) });
  const out = await runLook(d, args());
  assert.equal(out.ok, true);
  assert.equal(out.source, 'box_approximation');
  assert.match(out.note, /box approximation/i);
  assert.equal(d.observe.inputs[0].source, 'box_approximation');
  assert.equal(out.cameraRestored, true);
});

test('no way to look at all: a failure to look, with no observation made up', async () => {
  const p = plugin({ capture: () => ({ id: 'c', ok: false, error: 'no' }) });
  const d = deps(p, { boxViews: async () => ({ error: 'the renderer returned no views' }) });
  const out = await runLook(d, args());
  assert.equal(out.ok, false);
  assert.deepEqual(out.observations, []);
  assert.equal(d.observe.inputs.length, 0, 'no frame, no model call');
  assert.match(out.error, /could not look/i);
});

test('the camera is put back even when a capture throws', async () => {
  const p = plugin({ capture: () => { throw new Error('plugin went away'); } });
  const out = await runLook(deps(p), args());
  assert.equal(out.ok, false);
  const sets = p.ops.filter((o) => o.op === 'set_props');
  assert.deepEqual(sets.at(-1).props.CFrame.v, [1, 2, 3, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
});

test('no camera reading at all: the camera is not moved, and the current view is captured and labelled as such', async () => {
  const p = plugin({ noViewport: true });
  const out = await runLook(deps(p), args());
  assert.equal(out.ok, true);
  assert.equal(p.ops.filter((o) => o.op === 'set_props').length, 0, 'a camera that cannot be restored is never moved');
  assert.deepEqual(out.views, ['current view']);
  assert.equal(out.cameraRestored, null);
});

test('nothing in space to frame (no targets): the current view only', async () => {
  const p = plugin();
  const out = await runLook(deps(p), args({ touched: [], targets: [] }));
  assert.deepEqual(out.views, ['current view']);
  assert.equal(p.ops.filter((o) => o.op === 'set_props').length, 0);
});

test('a frame that is not a valid bounded PNG is dropped, not sent to the model', async () => {
  const bad = () => ({ ok: true, id: 'x', data: { source: 'studio_viewport', encoding: 'png', rgbBase64: 'AAAA', width: 8, height: 6, view: 'viewport', subject: 'x', capturedAt: 1 } });
  const p = plugin({ capture: bad });
  const d = deps(p, { boxViews: async () => ({ error: 'none' }) });
  const out = await runLook(d, args());
  assert.equal(out.ok, false);
  assert.equal(d.observe.inputs.length, 0);
});

test('raw RGB frames are encoded to PNG first', async () => {
  const p = plugin({ capture: () => ({ ok: true, id: 'x', data: { source: 'studio_viewport', encoding: 'rgb24', rgbBase64: bytesToBase64(rgb), width: 8, height: 6, view: 'viewport', subject: 'x', capturedAt: 1 } }) });
  const d = deps(p);
  await runLook(d, args());
  assert.ok(d.observe.inputs[0].frames.every((f) => f.pngBase64.startsWith('iVBOR')), 'a PNG signature in base64');
});

test('every frame is shown to the user as well as to the model, once', async () => {
  const emitted = [];
  const p = plugin();
  await runLook(deps(p, { emitFrame: (f) => emitted.push(f) }), args());
  assert.equal(emitted.length, 3);
  assert.ok(emitted.every((f) => f.source === 'studio_viewport'));
  assert.deepEqual(emitted.map((f) => f.view), ['front', 'high', 'eye (player eye level from the spawn)'], 'each frame carries its own label');
});
