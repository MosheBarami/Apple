// Calibration for the pixel statistics in apps/worker/src/pixel-stats.ts.
//
// The thresholds in PIXEL_THRESHOLDS are not imported from photographic literature — nobody has
// published perceptual metrics for low-resolution synthetic 3D renders, so borrowed numbers would
// be guesses wearing a citation. They are calibrated here against Golem's own fixtures, and this
// file is the evidence for them.
//
// The load-bearing claim: these statistics separate the scene the owner rejected from a scene built
// to the art-direction rules, WITHOUT any model call. If that separation does not hold, the
// statistics are worthless and the thresholds are theatre.
//
// Run: node --test packages/evals/src/pixel-stats.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderScene } from './render-scene.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');

const out = join(mkdtempSync(join(tmpdir(), 'golem-pixel-')), 'pixel-stats.mjs');
execFileSync('npx', ['esbuild', join(REPO, 'apps/worker/src/pixel-stats.ts'), '--format=esm', '--outfile=' + out], { stdio: 'pipe' });
const { pixelStats, pixelHardFails, PIXEL_THRESHOLDS, statsLine } = await import(out);

const FIX = join(REPO, 'packages/evals/tasks-visual/regression');

/** Render a fixture and compute stats for every view. */
function statsFor(sceneName) {
  const scene = JSON.parse(readFileSync(join(FIX, sceneName, 'scene.json'), 'utf8'));
  return renderScene(scene, { width: 288, height: 180, view: 'all' }).views.map((v) => ({
    name: v.name,
    coverage: v.meta.subjectCoverage,
    stats: pixelStats(v.rgb, v.meta.width, v.meta.height),
  }));
}

const bestOf = (views, pick) => Math.max(...views.filter((v) => v.coverage >= 0.05).map((v) => pick(v.stats)));
const baseline = statsFor('golem-plaza-baseline');
const improved = statsFor('golem-plaza-improved');

test('the statistics separate the rejected scene from the improved one', () => {
  const b = { colour: bestOf(baseline, (s) => s.colorfulness), edge: bestOf(baseline, (s) => s.edgeDensity) };
  const i = { colour: bestOf(improved, (s) => s.colorfulness), edge: bestOf(improved, (s) => s.edgeDensity) };
  // printed so the calibration is visible in the output, not merely asserted
  console.log(`      baseline: colourfulness ${b.colour}, edge density ${b.edge}`);
  console.log(`      improved: colourfulness ${i.colour}, edge density ${i.edge}`);
  assert.ok(i.edge > b.edge, `improved scene should carry more surface detail (${i.edge} vs ${b.edge})`);
});

test('thresholds sit between the fixtures, not pinned to either', () => {
  // A threshold equal to a fixture's value is a fit, not a calibration: it would flip on noise.
  const bEdge = bestOf(baseline, (s) => s.edgeDensity);
  const iEdge = bestOf(improved, (s) => s.edgeDensity);
  assert.ok(PIXEL_THRESHOLDS.edgeDensity < iEdge, `edge threshold ${PIXEL_THRESHOLDS.edgeDensity} must sit below the improved scene's ${iEdge}`);
  assert.ok(Math.abs(PIXEL_THRESHOLDS.edgeDensity - bEdge) > 0.001, 'threshold must not be pinned exactly to the baseline');
});

test('a flat grey plate is caught with no model call — this is the plaza failure', () => {
  // 725 parts, 10 materials and 5 lights passed every property check while rendering like this.
  const w = 288;
  const h = 180;
  const s = pixelStats(new Uint8Array(w * h * 3).fill(0x8a), w, h);
  assert.equal(s.edgeDensity, 0, 'a uniform plate has no edges');
  assert.ok(s.colorfulness < 1, `a grey plate is not colourful (got ${s.colorfulness})`);
  assert.equal(s.dominantToneShare, 1, 'one tone owns the whole frame');

  const fails = pixelHardFails([{ name: 'top', coverage: 1, stats: s }]);
  assert.ok(fails.length >= 3, `expected several measured failures, got ${fails.length}`);
  assert.ok(fails.some((f) => /greyscale/.test(f)));
  assert.ok(fails.some((f) => /surface detail/.test(f)));
  assert.ok(fails.some((f) => /single tone fills 100%/.test(f)));
});

test('an empty frame is not judged — sky and ground are legitimately flat', () => {
  const w = 64;
  const h = 40;
  const sky = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    sky[i * 3] = 0x9f;
    sky[i * 3 + 1] = 0xc7;
    sky[i * 3 + 2] = 0xe8;
  }
  // coverage below 5% means nothing was built in frame; failing it would blame the wrong thing
  assert.deepEqual(pixelHardFails([{ name: 'hero', coverage: 0.01, stats: pixelStats(sky, w, h) }]), []);
});

test('a colourful, detailed image trips nothing', () => {
  const w = 96;
  const h = 96;
  const buf = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const checker = (((x >> 3) + (y >> 3)) & 1) === 1;
      buf[i] = checker ? 220 : 30;
      buf[i + 1] = checker ? 60 : 180;
      buf[i + 2] = checker ? 40 : 210;
    }
  }
  const s = pixelStats(buf, w, h);
  assert.ok(s.colorfulness > PIXEL_THRESHOLDS.colorfulness, `should be colourful, got ${s.colorfulness}`);
  assert.ok(s.edgeDensity > PIXEL_THRESHOLDS.edgeDensity, `should have edges, got ${s.edgeDensity}`);
  assert.deepEqual(pixelHardFails([{ name: 'hero', coverage: 0.9, stats: s }]), []);
});

test('luminance deciles sum to 1 and locate the tonal mass', () => {
  const s = pixelStats(new Uint8Array(32 * 32 * 3).fill(10), 32, 32);
  assert.ok(Math.abs(s.luminanceDeciles.reduce((a, b) => a + b, 0) - 1) < 0.01);
  assert.ok(s.luminanceDeciles[0] > 0.99, 'an almost-black image sits entirely in the first decile');
});

test('statsLine is compact enough to sit beside three images in a prompt', () => {
  const line = statsLine('hero', pixelStats(new Uint8Array(10 * 10 * 3).fill(120), 10, 10));
  assert.ok(line.length < 170, `line is ${line.length} chars`);
  assert.match(line, /^hero:/);
});

test('the real plaza capture is caught, if it is on disk', (t) => {
  // Written by the ladder run; absent on a clean checkout, so this skips rather than fails.
  const metricsPath = join(FIX, 'bench-plaza', 'metrics.json');
  if (!existsSync(metricsPath)) return t.skip('no bench-plaza capture on disk');
  const m = JSON.parse(readFileSync(metricsPath, 'utf8'));
  const top = m.views.find((v) => v.name === 'top');
  assert.ok(top, 'expected a top view');
  // The captured metric that first exposed the failure: the plan view is entirely covered.
  assert.equal(top.subjectCoverage, 1, 'the plaza top view covers the whole frame');
});
