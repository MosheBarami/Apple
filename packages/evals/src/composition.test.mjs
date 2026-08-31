// Regression tests for the composition gate.
//
// These lock in the measured result, not the implementation. The property being protected is that
// the gate SEPARATES: it fires on every ladder fixture six blind critics scored 4.0 or below, and on
// none they scored 4.5 or above. A future change that keeps the code compiling but stops the gate
// firing on the scene the owner rejected is exactly the regression this catches — and it is the
// regression the previous gate already had, silently, for its whole life.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderScene } from './render-scene.mjs';
import { buildLadder } from './composition-ladder.mjs';
import { loadCompositionModule } from './composition-calibration.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const JURY = join(HERE, '..', 'tasks-visual', 'composition', 'blind', 'jury.json');

const C = await loadCompositionModule();
const jury = JSON.parse(readFileSync(JURY, 'utf8'));
const truth = Object.fromEntries(jury.consensus.map((c) => [c.id, c.mean]));

const W = 288;
const H = 180;
const live = (scene) => scene.parts.filter((p) => p.size[0] <= 600 && p.size[2] <= 600);

/** Render + measure every ladder fixture once; every test below reads this. */
const measured = buildLadder().map((entry) => {
  const r = renderScene(entry.scene, { width: W, height: H, view: 'all' });
  const views = r.views.map((v) => ({ name: v.name, metrics: C.compositionMetrics(v.rgb, v.meta.width, v.meta.height) }));
  const structure = C.structureMetrics(live(entry.scene));
  return {
    id: entry.id,
    jury: truth[entry.id],
    views,
    structure,
    fails: C.compositionHardFails(structure, views, 'scene'),
  };
});

const byId = Object.fromEntries(measured.map((m) => [m.id, m]));

test('the gate fires on every fixture the blind jury scored 4.0 or below', () => {
  const missed = measured.filter((m) => m.jury <= 4.0 && m.fails.length === 0);
  assert.deepEqual(
    missed.map((m) => m.id),
    [],
    `these bad fixtures passed the gate: ${missed.map((m) => `${m.id} (jury ${m.jury})`).join(', ')}`,
  );
});

test('the gate fires on NO fixture the blind jury scored 4.5 or above', () => {
  const wrong = measured.filter((m) => m.jury >= 4.5 && m.fails.length > 0);
  assert.deepEqual(
    wrong.map((m) => `${m.id}: ${m.fails.join(' | ')}`),
    [],
    'the gate rejected work the jury rated acceptable — a false positive',
  );
});

test('the scene the owner actually rejected is caught', () => {
  // This is the whole point. The shipped property and whole-frame-pixel checks passed this scene.
  assert.ok(byId['real-baseline'].fails.length > 0, 'real-baseline must fail the composition gate');
  assert.match(byId['real-baseline'].fails.join(' '), /no landmark|stands up/);
});

test('the 725-part failure mode is caught despite high part, material and colour counts', () => {
  const m = byId['tiled-mush'];
  assert.ok(m.structure.parts > 200, 'fixture should be part-heavy');
  assert.ok(m.fails.length > 0, 'a uniformly tiled scene must fail however many parts it has');
});

test('part count does not predict quality on this ladder', () => {
  // The project's own null hypothesis, asserted so it cannot quietly become true again.
  const good = measured.filter((m) => m.jury >= 5.5);
  const bad = measured.filter((m) => m.jury <= 3);
  const maxBadParts = Math.max(...bad.map((m) => m.structure.parts));
  const minGoodParts = Math.min(...good.map((m) => m.structure.parts));
  assert.ok(
    maxBadParts > minGoodParts,
    `part count separated the classes (bad max ${maxBadParts} <= good min ${minGoodParts}), which would mean the ladder is not testing composition`,
  );
});

test('the geometry mask is recovered from the render with negligible collision', () => {
  // The mask is derived by testing each pixel against the two background constants. A shaded
  // surface could in principle land on one exactly. Measure that rather than assuming it is rare.
  const r = renderScene(buildLadder().find((e) => e.id === 'real-improved').scene, { width: W, height: H, view: 'all' });
  for (const v of r.views) {
    const mask = C.geometryMask(v.rgb, v.meta.width, v.meta.height);
    let masked = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i]) masked++;
    // subjectCoverage is computed by the renderer from its own depth buffer: the ground truth.
    const truthPx = v.meta.subjectCoverage * mask.length;
    const err = Math.abs(masked - truthPx) / mask.length;
    assert.ok(err < 0.01, `${v.name}: mask disagrees with the depth buffer by ${(err * 100).toFixed(2)}% of the frame`);
  }
});

test('masked colourfulness separates a grey slab from a coloured build', () => {
  // The documented reason the previous check was dead. Measured here so the claim in
  // docs/COMPOSITION.md cannot drift away from the code.
  const slab = Math.max(...byId['grey-plate'].views.map((v) => v.metrics.maskedColorfulness));
  const built = Math.max(...byId['real-improved'].views.map((v) => v.metrics.maskedColorfulness));
  assert.ok(slab < C.COMPOSITION_GATES.maskedColorfulness, `grey slab masked colourfulness ${slab} should trip the floor`);
  assert.ok(built > C.COMPOSITION_GATES.maskedColorfulness, `real build masked colourfulness ${built} should clear the floor`);
  assert.ok(built / Math.max(slab, 0.01) > 5, 'the masked statistic must separate them by a wide margin');
});

test('verticalDominance measures landmark dominance, not size or count', () => {
  // levelled raises every vertical to the same height and changes nothing else. A metric that
  // tracked size or part count would be unmoved by that.
  assert.equal(byId['levelled'].structure.verticalDominance, 1);
  assert.ok(byId['real-improved'].structure.verticalDominance > 1.25);
  assert.ok(byId['hierarchised'].structure.verticalDominance > byId['real-improved'].structure.verticalDominance);
  assert.equal(byId['levelled'].structure.parts, byId['real-improved'].structure.parts);
});

test('the structural half of the gate needs no render at all', () => {
  // This is what makes an early blockout gate possible: reject macro composition before paying for
  // pixels or a vision call.
  const fails = C.compositionHardFails(byId['flattened'].structure, [], 'scene');
  assert.ok(fails.length > 0, 'a flattened scene must be rejectable from geometry alone');
});

test('the gate does not apply landmark rules to props', () => {
  // A trophy has no secondary vertical tier. Applying the scene rules to it would reject good work.
  const fails = C.compositionHardFails(byId['one-blob-void'].structure, byId['one-blob-void'].views, 'prop');
  assert.equal(fails.filter((f) => /no landmark|stands up|vertical variation/.test(f)).length, 0);
});

test('gini and normEntropy behave at their limits', () => {
  assert.equal(C.gini([5, 5, 5, 5]), 0);
  assert.ok(C.gini([0, 0, 0, 100]) > 0.7);
  assert.equal(C.gini([]), 0);
  assert.equal(C.gini([0, 0]), 0);
  assert.ok(Math.abs(C.normEntropy([1, 1, 1, 1]) - 1) < 1e-9);
  assert.equal(C.normEntropy([0, 0, 7]), 0);
  assert.equal(C.normEntropy([0, 0]), 0);
});

test('an empty frame is reported, not failed', () => {
  const rgb = new Uint8Array(64 * 64 * 3);
  for (let i = 0; i < 64 * 64; i++) {
    rgb[i * 3] = C.SKY_RGB[0]; rgb[i * 3 + 1] = C.SKY_RGB[1]; rgb[i * 3 + 2] = C.SKY_RGB[2];
  }
  const m = C.compositionMetrics(rgb, 64, 64);
  assert.equal(m.coverage, 0);
  const fails = C.compositionHardFails(byId['real-improved'].structure, [{ name: 'x', metrics: m }], 'scene');
  assert.equal(fails.length, 0, 'an empty view must not be judged');
});

test('structureFromLayout reads the wire format the plugin already sends', () => {
  // [x, y, z, sx, sy, sz, yawDeg] — no payload change was needed to gate on structure.
  const s = C.structureFromLayout([
    [0, 0.5, 0, 40, 1, 40, 0],
    [0, 10, 0, 2, 20, 2, 0],
    [10, 3, 0, 1, 6, 1, 0],
  ]);
  assert.equal(s.parts, 3);
  assert.ok(s.verticalDominance > 1.25, 'a 20-stud tower beside a 6-stud post is a landmark');
  assert.equal(C.structureFromLayout(undefined), null);
  assert.equal(C.structureFromLayout([]), null);
});

test('a legitimate interior is NOT rejected — the false positive the docs warn about', () => {
  // docs/COMPOSITION.md flags this risk explicitly: an interior has no landmark by design, so a
  // landmark rule could reject correct work. Measured on a plausible tavern interior (walls, floor,
  // ceiling, bar counter, stools, tables, fireplace) it passes, because the wall-and-ceiling shell
  // clusters as one tall element with the furniture beneath it. Note what the metric is really
  // reading there: enclosure against furniture, not landmark against secondary. It gives the right
  // answer for a defensible structural reason, and this test exists so that stops being luck.
  const p = (x, y, z, sx, sy, sz) => [x, y, z, sx, sy, sz, 0];
  const interior = [
    p(0, 0.5, 0, 40, 1, 30), p(0, 12.5, 0, 40, 1, 30),
    p(-20, 6.5, 0, 1, 12, 30), p(20, 6.5, 0, 1, 12, 30),
    p(0, 6.5, -15, 40, 12, 1), p(0, 6.5, 15, 40, 12, 1),
    p(-8, 3, -10, 16, 4, 2),
    ...[-14, -11, -8, -5].map((x) => p(x, 2, -7, 1.5, 3, 1.5)),
    p(10, 2.5, 5, 6, 0.4, 6), p(10, 1.2, 5, 1, 2, 1),
    p(-2, 2.5, 8, 6, 0.4, 6), p(-2, 1.2, 8, 1, 2, 1),
    p(18, 4, 10, 4, 7, 3),
  ];
  const s = C.structureFromLayout(interior);
  assert.ok(s.verticalDominance >= 1.25, `interior verticalDominance ${s.verticalDominance} must clear the gate`);
  assert.deepEqual(C.compositionHardFails(s, [], 'scene'), [], 'a furnished interior must not be rejected');
});

test('a flat empty room IS rejected — the interior test above is not vacuous', () => {
  // Same footprint, no furniture and no ceiling: nothing to build a hierarchy from.
  const p = (x, y, z, sx, sy, sz) => [x, y, z, sx, sy, sz, 0];
  const bare = [p(0, 0.5, 0, 40, 1, 30), p(-20, 0.6, 0, 1, 1.2, 30), p(20, 0.6, 0, 1, 1.2, 30)];
  const s = C.structureFromLayout(bare);
  assert.ok(C.compositionHardFails(s, [], 'scene').length > 0, 'an empty flat room must still fail');
});
