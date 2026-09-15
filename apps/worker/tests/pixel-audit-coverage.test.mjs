/**
 * The pixel audit must not report a clean image for a scene it never looked at.
 *
 * `pixelHardFails` judges only views with geometry in them — `views.filter(v => v.coverage >= 0.05)`
 * — because sky and ground fill are legitimately flat and an empty frame would trip every threshold
 * for the wrong reason. That filter is right and is kept.
 *
 * WHAT IT COULD NOT TELL APART. `coverage` arrives from the plugin's own render metadata:
 * vision.ts:262 is `coverage: view.meta.subjectCoverage`, unvalidated. If that number is missing,
 * null, or NaN, `undefined >= 0.05` is false, every view is dropped, `judged` is empty, and the
 * function returns [] — which is the same value it returns for an image with nothing wrong.
 *
 * Measured on a FLAT GREY PLATE, the exact failure this module was written to catch:
 *
 *   coverage 0.5        -> 2 failures reported   (correct: greyscale + flat tone)
 *   coverage missing    -> 0 failures            reads as clean
 *   coverage null       -> 0 failures            reads as clean
 *   coverage NaN        -> 0 failures            reads as clean
 *
 * A render nobody could measure is not a render with nothing wrong. Same shape as the critic panel
 * reporting six lenses when six threw, and the fix is the same: say so.
 *
 * A LEGITIMATELY EMPTY FRAME STAYS SILENT — coverage readable and below the floor is the case the
 * filter exists for, and turning that into noise would make the signal useless.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'pixaudit-')), 'ps.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'pixel-stats.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const { pixelStats, pixelHardFails, PIXEL_THRESHOLDS } = await import(`file://${out}`);

const W = 48, H = 48;
/** A flat plate: one tone with a little dither, which is the plaza failure this module exists for. */
function plate(r, g, b, jitter = 4) {
  const a = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const j = ((i * 7919) % (2 * jitter)) - jitter;
    a[i * 3] = Math.max(0, Math.min(255, r + j));
    a[i * 3 + 1] = Math.max(0, Math.min(255, g + j));
    a[i * 3 + 2] = Math.max(0, Math.min(255, b + j));
  }
  return a;
}
/** A busy image: many tones and edges, which must trip nothing. */
function busy() {
  const a = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const x = i % W, y = (i / W) | 0;
    a[i * 3] = (x * 5 + y * 3) % 256;
    a[i * 3 + 1] = (x * 11 + y * 7) % 256;
    a[i * 3 + 2] = (x * 3 + y * 13) % 256;
  }
  return a;
}
const GREY = pixelStats(plate(128, 128, 128), W, H);
const BUSY = pixelStats(busy(), W, H);
const view = (stats, coverage) => ({ name: 'hero', stats, coverage });

test('CONTROL: a flat grey plate with readable coverage IS caught', async () => {
  // If this stops failing, every assertion below passes for the wrong reason.
  const fails = pixelHardFails([view(GREY, 0.5)]);
  assert.ok(fails.length >= 1, 'the grey-slab signature must be reported');
  assert.ok(fails.some((f) => /greyscale/.test(f)), `expected a greyscale failure, got: ${fails.join(' | ')}`);
});

test('CONTROL: a colourful, detailed image with readable coverage trips nothing', async () => {
  // And a guard that complained about everything would satisfy the cases below too.
  assert.deepEqual(pixelHardFails([view(BUSY, 0.5)]), [], 'a busy image must be clean');
});

const UNREADABLE = [['missing', undefined], ['null', null], ['NaN', NaN], ['a string', '0.5'], ['negative', -1]];

for (const [label, coverage] of UNREADABLE) {
  test(`coverage that is ${label} does not render as a clean image`, async () => {
    const fails = pixelHardFails([view(GREY, coverage)]);
    assert.notDeepEqual(fails, [],
      `a flat grey plate with ${label} coverage reported NOTHING — a render nobody measured is not a render with nothing wrong`);
    assert.ok(fails.some((f) => /coverage|not judged|unmeasur/i.test(f)),
      `the report must say the audit could not run; got: ${fails.join(' | ')}`);
  });
}

test('a legitimately empty frame stays silent', async () => {
  // Coverage readable and below the floor is exactly what the filter is for. Turning that into a
  // complaint would make the new signal worthless within a week.
  const fails = pixelHardFails([view(GREY, 0.01)]);
  assert.deepEqual(fails, [], `an empty frame must not be judged; got: ${fails.join(' | ')}`);
});

test('one unreadable view among readable ones does not hide the others', async () => {
  const fails = pixelHardFails([view(BUSY, 0.5), view(GREY, undefined)]);
  assert.ok(fails.some((f) => /coverage|not judged|unmeasur/i.test(f)), 'the unreadable view must be named');
  // and the readable one is still judged on its own merits
  const clean = pixelHardFails([view(BUSY, 0.5), view(BUSY, 0.6)]);
  assert.deepEqual(clean, [], 'two good views must still be clean');
});

test('the thresholds are the ones these fixtures were built against', async () => {
  // A fixture calibrated against numbers that have since moved proves nothing.
  assert.equal(PIXEL_THRESHOLDS.colorfulness, 12);
  assert.equal(PIXEL_THRESHOLDS.dominantToneShare, 0.6);
  assert.ok(GREY.colorfulness < PIXEL_THRESHOLDS.colorfulness, 'the grey fixture must actually be grey');
  assert.ok(BUSY.colorfulness > PIXEL_THRESHOLDS.colorfulness, 'the busy fixture must actually be colourful');
});
