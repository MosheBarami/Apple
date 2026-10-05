/**
 * scripts/eval/lib/capture-plan.mjs: where the four world cameras go, world versus UI, what size a picture really is, and how a
 * play-test console is read. Pure, so each rule is checked with numbers.
 *
 * Run with:  node --test tests/eval-capture-plan.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import {
  DEFAULT_SPAWN, EMPTY_BOUNDS, EYE_HEIGHT, cameraPlan, classifyBuild, classifyConsole, consoleDelta, extractImage, imageSize, orbit, playTestCounts, sizeLabel, uiShotName,
} from '../scripts/eval/lib/capture-plan.mjs';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const bounds = { min: [10, 0, -20], max: [50, 12, 20] };

test('four cameras, in the fixed order, each with a finite position and a look-at', () => {
  const plan = cameraPlan(bounds, DEFAULT_SPAWN);
  assert.deepEqual(plan.cameras.map((c) => c.name), ['overview', 'three-quarter', 'close-up', 'spawn-eye']);
  for (const c of plan.cameras) for (const v of [...c.position, ...c.lookAt]) assert.ok(Number.isFinite(v), `${c.name}: ${v}`);
  assert.equal(plan.built, true);
});

test('the plan is a pure function of the bounds: the same box gives the same cameras, a different box a different plan', () => {
  assert.deepEqual(cameraPlan(bounds), cameraPlan({ min: [...bounds.min], max: [...bounds.max] }));
  assert.notDeepEqual(cameraPlan(bounds).cameras[0], cameraPlan({ min: [0, 0, 0], max: [4, 4, 4] }).cameras[0]);
});

test('the overview is the highest and farthest camera, the close-up the nearest, and all three look at the piece', () => {
  const plan = cameraPlan(bounds, DEFAULT_SPAWN);
  const [overview, three, close] = plan.cameras;
  const center = plan.center;
  assert.deepEqual(center, [30, 6, 0]);
  assert.ok(overview.position[1] > three.position[1] && three.position[1] > close.position[1], 'high, raised, low');
  assert.ok(dist(overview.position, center) > dist(three.position, center), 'overview is farther than three-quarter');
  assert.ok(dist(three.position, center) > dist(close.lookAt, close.position), 'and three-quarter than close-up');
  assert.deepEqual(overview.lookAt, center);
  assert.deepEqual(three.lookAt, center);
  assert.ok(close.lookAt[1] < center[1], 'the close-up looks a little below the middle, at the front of the piece');
});

test('three-quarter fits the piece: a sphere around the box fills the 70 degree view from that distance', () => {
  const plan = cameraPlan(bounds);
  const R = Math.hypot(40, 12, 40) / 2;
  const fit = R / Math.sin((70 / 2) * (Math.PI / 180));
  assert.ok(Math.abs(dist(plan.cameras[1].position, plan.center) - 1.3 * fit) < 0.1, 'three-quarter sits at 1.3 x the fitting distance');
});

test('a tiny piece (a coin) is framed at a sane distance: the radius never goes under 4 studs, the close-up never closer than 10', () => {
  const coin = cameraPlan({ min: [0, 0, 0], max: [2, 0.3, 2] });
  assert.equal(coin.radius, 4);
  const close = coin.cameras[2];
  assert.ok(dist(close.position, close.lookAt) >= 10 - 0.02, `the close-up is ${dist(close.position, close.lookAt)} studs from its target`);
});

test('the player is photographed from eye height at the spawn, looking level at the piece; on top of the spawn it looks down -Z', () => {
  const plan = cameraPlan(bounds, { position: [0, 0.5, 0], size: [12, 1, 12] });
  const eye = plan.cameras[3];
  assert.deepEqual(eye.position, [0, 1 + EYE_HEIGHT, 0], 'the spawn top is at y 1, the eyes 4.5 above it');
  assert.equal(eye.lookAt[1], eye.position[1], 'level gaze');
  assert.deepEqual([eye.lookAt[0], eye.lookAt[2]], [30, 0]);
  const onSpawn = cameraPlan({ min: [-2, 0, -2], max: [2, 4, 2] }, { position: [0, 0.5, 0], size: [12, 1, 12] }).cameras[3];
  assert.deepEqual(onSpawn.lookAt, [0, 1 + EYE_HEIGHT, -20]);
});

test('nothing built still gets a plan, around the spawn, and says it was not built', () => {
  const plan = cameraPlan(null, DEFAULT_SPAWN);
  assert.equal(plan.built, false);
  assert.deepEqual(plan.bounds, { min: EMPTY_BOUNDS.min, max: EMPTY_BOUNDS.max });
  assert.equal(plan.cameras.length, 4);
});

test('orbit puts a point at the asked distance, elevation and azimuth', () => {
  const p = orbit([0, 0, 0], 10, 90, 0);
  assert.ok(Math.abs(p[1] - 10) < 1e-9 && Math.abs(p[0]) < 1e-9 && Math.abs(p[2]) < 1e-9);
  const q = orbit([5, 5, 5], 10, 0, 90);
  assert.ok(Math.abs(q[0] - 15) < 1e-9 && Math.abs(q[1] - 5) < 1e-9 && Math.abs(q[2] - 5) < 1e-9);
});

test('classifyBuild: world, ui, both or none; a ScreenGui with nothing in it is not a UI', () => {
  assert.equal(classifyBuild({ addedParts: 3, screenGuis: [] }).kind, 'world');
  assert.equal(classifyBuild({ addedParts: 0, screenGuis: [{ name: 'G', guiObjects: 4 }] }).kind, 'ui');
  assert.equal(classifyBuild({ addedParts: 3, screenGuis: [{ name: 'G', guiObjects: 4 }] }).kind, 'both');
  const none = classifyBuild({ addedParts: 0, screenGuis: [{ name: 'Empty', guiObjects: 0 }] });
  assert.equal(none.kind, 'none');
  assert.deepEqual(none.emptyScreenGuis, ['Empty']);
  assert.equal(classifyBuild(null).kind, 'none');
});

// ---------------------------------------------------------------- pictures
function crc32(buf) {
  let crc = ~0;
  for (const b of buf) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return ~crc >>> 0;
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const png = (w, h) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.alloc(h * (1 + w * 3)))), chunk('IEND', Buffer.alloc(0))]);
};
const jpeg = (w, h) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...Array(14).fill(0), 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);

test('imageSize reads the real pixels of a PNG or a JPEG, and says null for anything else', () => {
  assert.deepEqual(imageSize(png(1920, 1080)), { format: 'png', width: 1920, height: 1080 });
  assert.deepEqual(imageSize(jpeg(1280, 720)), { format: 'jpeg', width: 1280, height: 720 });
  assert.equal(imageSize(Buffer.from('not a picture at all, just text bytes here')), null);
  assert.equal(imageSize(Buffer.alloc(4)), null);
  assert.equal(imageSize(null), null);
});

test('extractImage finds the picture however the server sends it: an image item, a data URL, JSON, or bare base64', () => {
  const bytes = png(64, 36);
  const b64 = bytes.toString('base64');
  assert.deepEqual(extractImage({ images: [{ data: b64 }] }).bytes, bytes);
  assert.equal(extractImage({ images: [{ data: b64 }] }).source, 'image-item');
  assert.deepEqual(extractImage({ text: `data:image/png;base64,${b64}` }).bytes, bytes);
  assert.equal(extractImage({ text: '{}', json: { image: b64 } }).source, 'json.image');
  assert.equal(extractImage({ text: '{}', json: { base64: `data:image/png;base64,${b64}` } }).source, 'json.base64');
  const big = png(600, 400); // a real screenshot is far over the 200 characters a bare string must have
  assert.equal(extractImage({ text: big.toString('base64') }).source, 'text-base64');
  assert.equal(extractImage({ text: 'screen_capture failed' }), null);
  assert.equal(extractImage({ text: 'A'.repeat(300) }), null, 'base64 that is not a picture is not accepted');
});

test('A PICTURE IS NAMED BY THE PIXELS IT HAS: only an exact target size is labelled a target', () => {
  assert.deepEqual(uiShotName({ width: 1920, height: 1080 }), { label: '1920x1080', file: 'ui-1920x1080.png', target: '1920x1080' });
  assert.deepEqual(uiShotName({ width: 1280, height: 720 }), { label: '1280x720', file: 'ui-1280x720.png', target: '1280x720' });
  assert.deepEqual(uiShotName({ width: 1919, height: 1080 }), { label: '1919x1080', file: 'ui-1919x1080.png', target: null });
  assert.deepEqual(uiShotName({ width: 3840, height: 2160 }), { label: '3840x2160', file: 'ui-3840x2160.png', target: null }, 'a retina capture is not "1920x1080"');
  assert.equal(sizeLabel({ width: 5, height: 7 }), '5x7');
});

// ---------------------------------------------------------------- console
test('classifyConsole counts errors and warnings; a stack block belongs to the error above it', () => {
  const text = [
    'Workspace.Script:3: attempt to index nil with "Name"',
    'Stack Begin',
    'Script "Workspace.Script", Line 3',
    'Stack End',
    'Infinite yield possible on "Workspace:WaitForChild("Thing")"',
    'ServerScriptService.Main:9: Unable to cast value to Object',
    'Error: The asset failed to load',
    'something harmless printed by the game',
  ].join('\n');
  const c = classifyConsole(text);
  assert.equal(c.errors, 2);
  assert.equal(c.warnings, 1);
  assert.match(c.errorLines[0], /attempt to index nil/);
});

test('a stack with no message above it is still one error; an empty console is zero of both', () => {
  assert.equal(classifyConsole('Stack Begin\nScript x, Line 1\nStack End').errors, 1);
  assert.deepEqual(classifyConsole(''), { errors: 0, warnings: 0, errorLines: [], warningLines: [] });
  assert.equal(classifyConsole('Hello from the game\nSpawned 4 coins').errors, 0);
});

test('consoleDelta is what the console gained; a console that was cleared is read whole', () => {
  assert.equal(consoleDelta('a\nb\n', 'a\nb\nc\n'), 'c\n');
  assert.equal(consoleDelta('old stuff', 'brand new'), 'brand new');
  assert.equal(consoleDelta(null, 'x'), 'x');
});

test('playTestCounts uses the LARGER of the console and the typed log, and says when nothing could be read', () => {
  assert.equal(playTestCounts({ console: { errors: 1, warnings: 0 }, logServer: { errors: 0, warnings: 3 }, logClient: null }).errors, 1);
  assert.equal(playTestCounts({ console: { errors: 0, warnings: 0 }, logServer: { errors: 2, warnings: 0 }, logClient: { errors: 1, warnings: 1 } }).errors, 3);
  assert.equal(playTestCounts({ console: { errors: 0, warnings: 0 }, logServer: null, logClient: null }).errors, 0);
  assert.equal(playTestCounts({ console: null, logServer: null, logClient: null }), null, 'no reading is null, never zero');
});
