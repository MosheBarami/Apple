// The composition ladder: a labelled set of scenes used to decide which composition metrics are
// real and which are decoration.
//
// EXPERIMENTAL DESIGN, AND WHY IT IS BUILT THIS WAY.
//
// The obvious way to calibrate a metric is to hand-author a "good" scene and a "bad" scene and show
// that the metric separates them. That method is worthless here, because whoever chooses the metric
// also chooses the fixtures, and any metric can be made decisive against a strawman. The project
// already has one measured instance of exactly that failure: whole-frame colourfulness separated
// its two fixtures by 1.1 points against a threshold of 12 and was shipped as a check anyway.
//
// So most of this ladder is not authored. It is DERIVED, by applying named composition
// transformations to one real scene — the 219-part plaza a production agent actually built
// (regression/golem-plaza-improved/scene.json, independently scored 5/10 by the live critic). Each
// transformation changes ONE compositional property and holds part count, material count and colour
// count as close to constant as the operation allows. A metric that claims to measure composition
// must move when composition moves and stay put when it does not. A metric that is really tracking
// part count cannot survive this, because part count barely changes across the ladder.
//
// Three fixtures are adversarial on purpose — built to make the metrics in
// apps/worker/src/composition.ts look good on a scene that is bad:
//   * tiled-mush     many parts, many materials, many colours, uniformly tiled, no hierarchy. The
//                    725-part failure reproduced deliberately: every global statistic rises and the
//                    composition is dead.
//   * one-blob-void  a single tall mass alone in a large empty footprint. Maximal Gini, maximal
//                    silhouette prominence, and it is not a scene.
//   * confetti       small parts at random heights over the whole footprint. Maximum height
//                    variation, zero structure.
// If a metric ranks these highly that is a false positive, and it is reported as one.
//
// Labels are the author's prior, not ground truth. composition-calibration.mjs re-scores every
// rendered fixture with independent blind critics and reports where labels and critics disagree,
// because the mission is explicit that the builder's own labels cannot be trusted.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REG = join(HERE, '..', 'tasks-visual', 'regression');

const loadScene = (name) => JSON.parse(readFileSync(join(REG, name, 'scene.json'), 'utf8'));
const clone = (s) => JSON.parse(JSON.stringify(s));

/** parts that are not the giant baseplate — the same exclusion the renderer uses for framing */
const isGround = (p) => p.size[0] > 600 || p.size[2] > 600;
const vol = (p) => p.size[0] * p.size[1] * p.size[2];

// ---------------------------------------------------------------------------------------------
// Named composition transformations. Each is a single, describable change to structure.
// ---------------------------------------------------------------------------------------------

/** Collapse every part into one height band: destroys verticality, keeps everything else. */
function flatten(scene) {
  const s = clone(scene);
  for (const p of s.parts) {
    if (isGround(p)) continue;
    const h = 1.2;
    p.size = [p.size[0], h, p.size[2]];
    p.pos = [p.pos[0], 1 + h / 2, p.pos[2]];
  }
  return s;
}

/** Give every part the same volume: destroys large/medium/small, keeps the layout. */
function equalise(scene) {
  const s = clone(scene);
  const live = s.parts.filter((p) => !isGround(p));
  const mean = Math.cbrt(live.reduce((a, p) => a + vol(p), 0) / live.length);
  for (const p of live) {
    const top = p.pos[1] + p.size[1] / 2;
    p.size = [mean, mean, mean];
    p.pos = [p.pos[0], top - mean / 2, p.pos[2]];
  }
  return s;
}

/** Raise every vertical to the tallest height: several equal landmarks, so none is a landmark. */
function levelUp(scene) {
  const s = clone(scene);
  const live = s.parts.filter((p) => !isGround(p));
  const tallest = Math.max(...live.map((p) => p.pos[1] + p.size[1] / 2));
  for (const p of live) {
    if (p.size[1] < 2) continue; // floor tiles are not the subject; this is about vertical elements
    const base = p.pos[1] - p.size[1] / 2;
    const h = Math.max(1, tallest - base);
    p.size = [p.size[0], h, p.size[2]];
    p.pos = [p.pos[0], base + h / 2, p.pos[2]];
  }
  return s;
}

/** Keep only the tallest structure and its immediate column: a landmark alone in an empty plot. */
function isolateLargest(scene) {
  const s = clone(scene);
  const live = s.parts.filter((p) => !isGround(p));
  const tallest = live.reduce((a, b) => (b.pos[1] + b.size[1] / 2 > a.pos[1] + a.size[1] / 2 ? b : a));
  const near = (p) =>
    Math.abs(p.pos[0] - tallest.pos[0]) < tallest.size[0] * 1.5 + 3 &&
    Math.abs(p.pos[2] - tallest.pos[2]) < tallest.size[2] * 1.5 + 3;
  s.parts = [...s.parts.filter(isGround), ...live.filter(near)];
  return s;
}

/** Drop everything small: the blockout — correct massing, zero surface detail. */
function blockout(scene) {
  const s = clone(scene);
  s.parts = s.parts.filter((p) => isGround(p) || Math.max(...p.size) >= 3);
  for (const p of s.parts) if (!isGround(p)) p.material = 'Concrete';
  return s;
}

/** Tile the whole footprint with identical parts: the 725-part failure, reproduced deliberately. */
function tiledMush(scene) {
  const s = clone(scene);
  const live = s.parts.filter((p) => !isGround(p));
  const xs = live.map((p) => p.pos[0]);
  const zs = live.map((p) => p.pos[2]);
  const lox = Math.min(...xs); const hix = Math.max(...xs);
  const loz = Math.min(...zs); const hiz = Math.max(...zs);
  // reuse the real palette and materials so material/colour counts stay high — the whole point is
  // that variety without arrangement buys nothing
  const mats = [...new Set(live.map((p) => p.material))];
  const cols = live.map((p) => p.color);
  const parts = s.parts.filter(isGround);
  let k = 0;
  for (let x = lox; x <= hix; x += 3) {
    for (let z = loz; z <= hiz; z += 3) {
      // rotations are inherited from the real parts: without this every derived fixture has
      // rotationEntropy 0 by construction and the metric appears to separate when it is only
      // detecting which fixtures this file authored.
      parts.push({
        name: `Tile${k}`,
        material: mats[k % mats.length],
        size: [2.6, 2.6, 2.6],
        pos: [x, 2.3, z],
        rot: live[k % live.length].rot,
        color: cols[k % cols.length],
        transparency: 0,
      });
      k++;
    }
  }
  s.parts = parts;
  return s;
}

/** Random small parts at random heights over the footprint: maximum variation, zero structure. */
function confetti(scene) {
  const s = clone(scene);
  const live = s.parts.filter((p) => !isGround(p));
  const xs = live.map((p) => p.pos[0]); const zs = live.map((p) => p.pos[2]);
  const lox = Math.min(...xs); const hix = Math.max(...xs);
  const loz = Math.min(...zs); const hiz = Math.max(...zs);
  const mats = [...new Set(live.map((p) => p.material))];
  const cols = live.map((p) => p.color);
  let seed = 20260831; // deterministic so the fixture is reproducible
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const parts = s.parts.filter(isGround);
  for (let i = 0; i < live.length; i++) {
    const sz = 1 + rnd() * 2;
    parts.push({
      name: `Bit${i}`,
      material: mats[i % mats.length],
      size: [sz, sz, sz],
      pos: [lox + rnd() * (hix - lox), 1 + rnd() * 22, loz + rnd() * (hiz - loz)],
      rot: live[i % live.length].rot,
      color: cols[i % cols.length],
      transparency: 0,
    });
  }
  s.parts = parts;
  return s;
}

/** One flat slab and nothing else — the degenerate floor of the ladder. */
function greyPlate(scene) {
  const s = clone(scene);
  s.parts = [
    ...s.parts.filter(isGround),
    { name: 'Slab', material: 'Plastic', size: [48, 1, 48], pos: [0, 0.5, 0], rot: s.parts.find((q) => !isGround(q))?.rot, color: [163, 162, 165], transparency: 0 },
  ];
  return s;
}

/**
 * Shove the whole build into one corner of its own ground slab, keeping every part, material,
 * height and relationship intact. The composition is now unbalanced and nothing else has changed.
 *
 * This fixture exists to test ONE metric against its own stated purpose. centroidOffset claims to
 * measure balance, and it scored AUC 1.000 on the first ladder — but that ladder contained no
 * unbalanced scene, so its stated purpose was never tested and the score could only have come from
 * something else. If centroidOffset rates this fixture as an IMPROVEMENT, it is measuring the
 * wrong thing and its perfect score was luck.
 */
function lopsided(scene) {
  const s = clone(scene);
  const live = s.parts.filter((p) => !isGround(p));
  const floorY = Math.min(...live.map((p) => p.pos[1] - p.size[1] / 2));
  // Paving must stay put. The camera frames the geometry's bounding box, so translating EVERY part
  // by the same vector moves the box with it and the render is bit-identical — the first version of
  // this fixture did exactly that and proved nothing. Only the things standing ON the floor move.
  const isFloor = (p) => p.size[1] <= 1.5 && p.pos[1] + p.size[1] / 2 - floorY <= 2;
  const span = Math.max(...live.map((p) => p.pos[0])) - Math.min(...live.map((p) => p.pos[0]));
  const shift = span * 0.32;
  for (const p of live) if (!isFloor(p)) p.pos = [p.pos[0] + shift, p.pos[1], p.pos[2] + shift * 0.5];
  return s;
}

/**
 * The one constructive transformation: impose a focal hierarchy WITHOUT adding parts. The landmark
 * grows into a real landmark and the repeated verticals step down into a secondary tier. This is
 * what "fix the composition" means mechanically, and it is the case a metric must reward if it is
 * worth anything — note that part count, material count and colour count are all unchanged.
 */
function hierarchise(scene) {
  const s = clone(scene);
  const live = s.parts.filter((p) => !isGround(p));
  const verticals = live.filter((p) => p.size[1] >= 4);
  if (!verticals.length) return s;
  const tallest = verticals.reduce((a, b) => (b.pos[1] + b.size[1] / 2 > a.pos[1] + a.size[1] / 2 ? b : a));
  const fx = tallest.pos[0];
  const fz = tallest.pos[2];
  for (const p of live) {
    const isFocus = Math.abs(p.pos[0] - fx) < 4 && Math.abs(p.pos[2] - fz) < 4;
    if (isFocus && p.size[1] >= 2) {
      const base = p.pos[1] - p.size[1] / 2;
      p.size = [p.size[0] * 1.4, p.size[1] * 2.2, p.size[2] * 1.4];
      p.pos = [p.pos[0], base + p.size[1] / 2, p.pos[2]];
    } else if (p.size[1] >= 6) {
      const base = p.pos[1] - p.size[1] / 2;
      p.size = [p.size[0], p.size[1] * 0.62, p.size[2]];
      p.pos = [p.pos[0], base + p.size[1] / 2, p.pos[2]];
    }
  }
  return s;
}

// ---------------------------------------------------------------------------------------------

/**
 * The ladder. `label` is the author's prior on a 1-9 scale and is deliberately treated as suspect;
 * `failure` names the compositional defect the fixture is meant to embody.
 */
export function buildLadder() {
  const improved = loadScene('golem-plaza-improved');
  const baseline = loadScene('golem-plaza-baseline');

  return [
    { id: 'grey-plate', label: 1, source: 'derived', failure: 'one flat untextured slab; nothing to read', scene: greyPlate(improved) },
    { id: 'real-baseline', label: 2, source: 'REAL — the scene the owner rejected, critic-scored 2/10', failure: 'scattered primitives on a factory-grey slab, no hierarchy', scene: baseline },
    { id: 'tiled-mush', label: 2, source: 'derived (adversarial)', failure: 'high part/material/colour count, uniformly tiled, zero arrangement', scene: tiledMush(improved) },
    { id: 'confetti', label: 2, source: 'derived (adversarial)', failure: 'maximum height variation with no structure', scene: confetti(improved) },
    { id: 'flattened', label: 3, source: 'derived', failure: 'correct plan, all verticality removed', scene: flatten(improved) },
    { id: 'equalised', label: 3, source: 'derived', failure: 'correct layout, every mass the same size — no large/medium/small', scene: equalise(improved) },
    { id: 'one-blob-void', label: 3, source: 'derived (adversarial)', failure: 'a single mass alone in a large empty footprint', scene: isolateLargest(improved) },
    { id: 'levelled', label: 4, source: 'derived', failure: 'several equal-height verticals; no element dominates', scene: levelUp(improved) },
    { id: 'blockout', label: 5, source: 'derived', failure: 'correct massing, no surface detail and no material language', scene: blockout(improved) },
    { id: 'real-improved', label: 5, source: 'REAL — production agent output, critic-scored 5/10', failure: 'competent layout, weak focal dominance, floats on a bare plane', scene: improved },
    { id: 'lopsided', label: 3, source: 'derived (adversarial — targets centroidOffset)', failure: 'the entire build shoved into one corner; every other property unchanged', scene: lopsided(improved) },
    { id: 'hierarchised', label: 7, source: 'derived', failure: 'none intended — focal hierarchy imposed without adding parts', scene: hierarchise(improved) },
  ];
}
