// Tests for the layout metrics in layout-metrics.mjs.
//
// The claim under test: composition failures can be detected from geometry alone, with no model
// call. Specifically that the scene the owner rejected is distinguishable from one built to the
// art-direction rules by its PLACEMENT, not just its part count.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutMetrics, latticeScore, rotationEntropy, neighbourSpacingCV, LAYOUT_BANDS } from './layout-metrics.mjs';

const FIX = join(dirname(fileURLToPath(import.meta.url)), '..', 'tasks-visual', 'regression');
const scene = (n) => JSON.parse(readFileSync(join(FIX, n, 'scene.json'), 'utf8'));

test('the rejected plaza is flagged as a grid clone; the rule-built one is not', () => {
  const bad = layoutMetrics(scene('golem-plaza-baseline'), { kind: 'plaza' });
  const good = layoutMetrics(scene('golem-plaza-improved'), { kind: 'plaza' });
  console.log(`      rejected: lattice ${bad.latticeScore}, rotationEntropy ${bad.rotationEntropy}, spacingCV ${bad.neighbourSpacingCV}`);
  console.log(`      improved: lattice ${good.latticeScore}, rotationEntropy ${good.rotationEntropy}, spacingCV ${good.neighbourSpacingCV}`);
  assert.ok(bad.flags.some((f) => f.startsWith('grid clone')), 'the rejected plaza should be flagged a grid clone');
  assert.ok(!good.flags.some((f) => f.startsWith('grid clone')), 'the rule-built plaza should not be');
});

test('spacing moves from pathological into the healthy band', () => {
  const bad = layoutMetrics(scene('golem-plaza-baseline'), { kind: 'plaza' });
  const good = layoutMetrics(scene('golem-plaza-improved'), { kind: 'plaza' });
  const [lo, hi] = LAYOUT_BANDS.healthySpacingCV;
  assert.ok(bad.neighbourSpacingCV > hi, `rejected CV ${bad.neighbourSpacingCV} should sit above the healthy band`);
  assert.ok(good.neighbourSpacingCV >= lo && good.neighbourSpacingCV <= hi, `improved CV ${good.neighbourSpacingCV} should sit inside ${lo}-${hi}`);
});

test('tiled paving counts as structure, not as hundreds of props', () => {
  // Before the flat-on-floor rule every paving tile was a prop, which flagged a well-dressed
  // scene as cluttered purely because its floor was tiled rather than one slab.
  const good = layoutMetrics(scene('golem-plaza-improved'), { kind: 'plaza' });
  assert.ok(good.structural >= 40, `expected the paving to be classified structural, got ${good.structural}`);
});

test('four identical objects on a symmetric grid is the canonical grid clone', () => {
  const props = [-20, 20].flatMap((x) => [-20, 20].map((z) => ({ pos: [x, 5, z], size: [1, 10, 1] })));
  assert.equal(latticeScore(props), 1);
  assert.equal(rotationEntropy(props), 0);
});

test('varied placement and rotation reads as designed, not stamped', () => {
  const props = Array.from({ length: 12 }, (_, i) => {
    const a = i * 0.7 + 0.13;
    return { pos: [Math.cos(a) * (9 + i * 1.7), 2, Math.sin(a) * (11 + i * 1.3)], size: [2, 3, 2], rot: [Math.cos(a), 0, -Math.sin(a), 0, 1, 0, Math.sin(a), 0, Math.cos(a)] };
  });
  assert.ok(latticeScore(props) < LAYOUT_BANDS.gridClone.lattice);
  assert.ok(rotationEntropy(props) > LAYOUT_BANDS.gridClone.rotationEntropy);
});

test('evenly spaced fence posts are flagged as mechanical', () => {
  const props = Array.from({ length: 10 }, (_, i) => ({ pos: [i * 6, 4, 0], size: [1, 8, 1] }));
  assert.ok(neighbourSpacingCV(props) < LAYOUT_BANDS.mechanicalSpacingCV);
});

test('a wide flat build is called out as a plate', () => {
  const parts = Array.from({ length: 8 }, (_, i) => ({ pos: [i * 12 - 40, 0.5, 0], size: [10, 1, 10], transparency: 0 }));
  parts.push({ pos: [0, 1.5, 0], size: [2, 2, 2], transparency: 0 });
  const m = layoutMetrics({ parts }, { kind: 'plaza' });
  assert.ok(m.flags.some((f) => f.startsWith('flat:')), `expected a flatness flag, got ${JSON.stringify(m.flags)}`);
});

test('an unknown scene kind skips the density band rather than inventing one', () => {
  const m = layoutMetrics(scene('golem-plaza-improved'), { kind: 'not-a-real-kind' });
  assert.ok(!m.flags.some((f) => f.startsWith('sparse') || f.startsWith('cluttered')));
  assert.ok(typeof m.propDensity === 'number', 'the number is still reported, only the band is skipped');
});
