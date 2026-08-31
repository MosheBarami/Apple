// Fixture provenance for the prop benchmark.
//
// METHODOLOGY, AND WHY IT IS BUILT THIS WAY.
//
// Hand-authoring a "good" prop and a "bad" prop and showing the benchmark separates them proves
// nothing: whoever picks the fixtures also picks the metric, and any metric can be made decisive
// against a strawman. packages/evals/src/composition-ladder.mjs records the project already
// making that mistake once. So:
//
//   1. ONE fixture is authored bad from life, not invented: `uglyTrophy()` reconstructs the
//      project's origin bug — a base box, a stem box and a cup box, all default grey Plastic,
//      that "technically resembles a trophy" and passed every check the system had. It is the
//      permanent regression test. It is not a strawman; it is the artifact.
//
//   2. Every other bad fixture is DERIVED, by applying one named degradation to a good build and
//      changing nothing else. greyify keeps the geometry and removes the colour choice.
//      stripSmallDetail keeps the colour and removes the small parts. If the benchmark's
//      "factory default" signal is really just counting parts, greyify will not move it, and the
//      test that asserts greyify is rejected will fail. That is the point.
//
//   3. The good builds are authored, and that IS a weakness: they are the author's idea of a good
//      trophy, not a shipped artist's. What they buy is a positive control — a build with a
//      shaped silhouette, three scales of detail, chosen materials and a colour story must PASS,
//      or the benchmark is just a part-count threshold wearing a costume.
//
// Emit the scenes as inspectable JSON:  node build-fixtures.mjs --emit
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, 'fixtures');

// ---- construction helpers --------------------------------------------------------------------

const box = (name, material, size, pos, color, extra = {}) => ({
  name,
  material,
  size: size.map((v) => Math.round(v * 1000) / 1000),
  pos: pos.map((v) => Math.round(v * 1000) / 1000),
  color,
  transparency: 0,
  ...extra,
});

/** Row-major 3x3 rotation about Y, in degrees. */
export function rotY(deg) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}
/** Row-major 3x3 rotation about Z, in degrees. */
export function rotZ(deg) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

/** n items evenly around a circle of `radius` at height `y`; cb gets (x, z, angleDeg, i). */
function ring(n, radius, y, cb) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 360;
    const r = (a * Math.PI) / 180;
    out.push(cb(Math.cos(r) * radius, Math.sin(r) * radius, a, i, y));
  }
  return out;
}

const GOLD = [212, 175, 55];
const GOLD_LIT = [238, 208, 110];
const DARK_STONE = [66, 63, 60];
const MARBLE = [222, 218, 208];
const IRON = [78, 80, 86];
const WOOD = [122, 84, 48];
const WOOD_DK = [86, 58, 33];
const LEAF = [64, 112, 52];
const LEAF_LT = [92, 148, 70];
const TEAL_NEON = [90, 220, 235];

// ---- 1. the origin bug, reconstructed ---------------------------------------------------------

/**
 * THE UGLY TROPHY. Three default-grey Plastic boxes stacked into a base / stem / cup silhouette.
 * A property inspector confirms a trophy exists. A generous vision judge says "yes, a trophy".
 * It is the thing the owner rejected, and the benchmark must reject it too.
 */
export function uglyTrophy() {
  const grey = [163, 162, 165];
  return {
    name: 'trophy-ugly',
    lighting: { brightness: 3, clockTime: 14.5, ambient: [0, 0, 0], lightInstances: 0, effects: [] },
    parts: [
      box('Base', 'Plastic', [4, 1, 4], [0, 0.5, 0], grey),
      box('Stem', 'Plastic', [1, 4, 1], [0, 3, 0], grey),
      box('Cup', 'Plastic', [3, 2, 3], [0, 6, 0], grey),
    ],
  };
}

// ---- 2. good builds --------------------------------------------------------------------------

const LIGHTING_DRESSED = { brightness: 2.4, clockTime: 16.2, ambient: [42, 44, 52], lightInstances: 2, effects: ['Atmosphere'] };

/** A trophy that would survive a look: stepped plinth, nameplate, tapered stem, flared bowl,
 *  handles, rim studs. Three scales of element, four materials, a gold-on-stone colour story. */
export function goodTrophy() {
  const p = [
    box('Plinth1', 'Granite', [5.2, 0.8, 5.2], [0, 0.4, 0], DARK_STONE),
    box('Plinth2', 'Marble', [4.4, 0.7, 4.4], [0, 1.15, 0], MARBLE),
    box('Plinth3', 'Marble', [3.7, 0.6, 3.7], [0, 1.8, 0], [206, 201, 190]),
    box('Nameplate', 'Foil', [2.6, 0.7, 0.16], [0, 1.15, 2.24], GOLD_LIT),
    box('StemA', 'Metal', [1.3, 1.1, 1.3], [0, 2.65, 0], GOLD),
    box('StemB', 'Metal', [1.0, 1.2, 1.0], [0, 3.8, 0], GOLD),
    box('StemC', 'Metal', [0.8, 1.2, 0.8], [0, 5.0, 0], GOLD),
    box('Knop', 'Foil', [1.5, 0.45, 1.5], [0, 5.83, 0], GOLD_LIT),
    box('BowlA', 'Foil', [2.1, 0.8, 2.1], [0, 6.45, 0], GOLD),
    box('BowlB', 'Foil', [2.7, 0.9, 2.7], [0, 7.3, 0], GOLD),
    box('BowlC', 'Foil', [3.1, 0.8, 3.1], [0, 8.15, 0], GOLD_LIT),
    box('Rim', 'Metal', [3.35, 0.3, 3.35], [0, 8.7, 0], GOLD_LIT),
  ];
  // handles: two uprights plus two arms per side, small elements that break the silhouette
  for (const s of [-1, 1]) {
    p.push(box(`HandleUp${s}`, 'Metal', [0.32, 2.1, 0.32], [s * 1.95, 7.4, 0], GOLD));
    p.push(box(`HandleTop${s}`, 'Metal', [0.75, 0.3, 0.32], [s * 1.72, 8.4, 0], GOLD));
    p.push(box(`HandleBot${s}`, 'Metal', [0.75, 0.3, 0.32], [s * 1.6, 6.5, 0], GOLD));
    p.push(box(`HandleCurl${s}`, 'Foil', [0.34, 0.34, 0.34], [s * 2.05, 6.35, 0], GOLD_LIT));
  }
  // rim studs and plinth corner pips: the smallest scale, the trim you only see up close
  p.push(...ring(12, 1.5, 8.9, (x, z, a, i) => box(`Stud${i}`, 'Foil', [0.3, 0.22, 0.3], [x, 8.9, z], GOLD_LIT)));
  p.push(...ring(4, 2.3, 0.95, (x, z, a, i) => box(`Pip${i}`, 'Granite', [0.45, 0.35, 0.45], [x, 0.95, z], [92, 88, 84], { rot: rotY(45) })));
  return { name: 'trophy-good', lighting: LIGHTING_DRESSED, parts: p };
}

export function goodFountain() {
  const p = [];
  // basin wall as a 16-segment ring, coping course on top, water surface inside
  p.push(...ring(16, 6.2, 0.9, (x, z, a, i) => box(`Wall${i}`, 'Cobblestone', [2.6, 1.8, 1.0], [x, 0.9, z], i % 2 ? [148, 142, 132] : [136, 130, 121], { rot: rotY(-a) })));
  p.push(...ring(16, 6.2, 1.95, (x, z, a, i) => box(`Coping${i}`, 'Marble', [2.7, 0.35, 1.3], [x, 1.95, z], MARBLE, { rot: rotY(-a) })));
  p.push(box('Water', 'Water', [11.4, 0.5, 11.4], [0, 1.5, 0], [92, 156, 178], { transparency: 0.3 }));
  p.push(box('PedestalBase', 'Marble', [3.4, 0.8, 3.4], [0, 1.9, 0], [214, 209, 198]));
  p.push(box('PedestalShaft', 'Marble', [1.9, 2.4, 1.9], [0, 3.5, 0], MARBLE));
  p.push(box('UpperBowl', 'Marble', [4.6, 0.8, 4.6], [0, 5.1, 0], [228, 224, 214]));
  p.push(box('UpperLip', 'Limestone', [4.9, 0.3, 4.9], [0, 5.6, 0], [236, 232, 222]));
  p.push(box('Finial', 'Metal', [0.9, 1.5, 0.9], [0, 6.4, 0], IRON));
  p.push(box('Spout', 'Metal', [0.5, 0.9, 0.5], [0, 7.3, 0], [148, 152, 158]));
  p.push(...ring(8, 2.3, 5.75, (x, z, a, i) => box(`Jet${i}`, 'Water', [0.36, 0.9, 0.36], [x, 5.75, z], [186, 220, 232], { transparency: 0.45 })));
  p.push(...ring(6, 4.2, 1.75, (x, z, a, i) => box(`Pebble${i}`, 'Rock', [0.5, 0.3, 0.5], [x, 1.75, z], [110, 106, 100], { rot: rotY(i * 17) })));
  p.push(...ring(4, 6.9, 0.35, (x, z, a, i) => box(`Kerb${i}`, 'Slate', [2.2, 0.7, 1.2], [x, 0.35, z], [98, 100, 104], { rot: rotY(-a) })));
  return { name: 'fountain-good', lighting: LIGHTING_DRESSED, parts: p };
}

export function goodPortal() {
  const p = [];
  for (const s of [-1, 1]) {
    p.push(box(`PillarBase${s}`, 'Slate', [2.4, 0.9, 2.4], [s * 3.1, 0.45, 0], [86, 88, 92]));
    p.push(box(`Pillar${s}`, 'Basalt', [1.7, 7.4, 1.7], [s * 3.1, 4.6, 0], [58, 56, 62]));
    p.push(box(`PillarCap${s}`, 'Slate', [2.2, 0.7, 2.2], [s * 3.1, 8.65, 0], [92, 94, 98]));
    for (let i = 0; i < 4; i++) {
      p.push(box(`Rune${s}_${i}`, 'Neon', [0.34, 0.34, 0.12], [s * 3.1, 2.4 + i * 1.5, 0.88], TEAL_NEON));
      p.push(box(`Band${s}_${i}`, 'CorrodedMetal', [1.85, 0.24, 1.85], [s * 3.1, 1.7 + i * 1.7, 0], [96, 84, 66]));
    }
  }
  // arch: rotated voussoirs bridging the pillars, keystone at the crown
  for (let i = 0; i < 7; i++) {
    const a = -75 + i * 25;
    const r = (a * Math.PI) / 180;
    p.push(box(`Voussoir${i}`, 'Basalt', [1.5, 1.2, 1.7], [Math.sin(r) * 3.55, 8.9 + Math.cos(r) * 3.1, 0], i % 2 ? [64, 62, 68] : [56, 54, 60], { rot: rotZ(-a) }));
  }
  p.push(box('Keystone', 'Marble', [1.5, 1.5, 1.9], [0, 12.2, 0], [198, 196, 204]));
  p.push(box('Field', 'ForceField', [5.0, 7.6, 0.28], [0, 5.0, 0], [116, 214, 232], { transparency: 0.55 }));
  p.push(box('Threshold', 'Slate', [6.6, 0.5, 2.6], [0, 0.25, 0], [78, 80, 84]));
  p.push(box('Step', 'Slate', [7.6, 0.35, 3.4], [0, 0.17, 1.6], [88, 90, 94]));
  p.push(...ring(6, 2.2, 0.7, (x, z, a, i) => box(`Glyph${i}`, 'Neon', [0.42, 0.14, 0.42], [x, 0.55, z * 0.4 + 1.6], TEAL_NEON)));
  return { name: 'portal-good', lighting: { ...LIGHTING_DRESSED, lightInstances: 4 }, parts: p };
}

export function goodLamp() {
  const p = [
    box('Footing', 'Concrete', [1.9, 0.4, 1.9], [0, 0.2, 0], [122, 120, 116]),
    box('BaseA', 'Metal', [1.5, 0.6, 1.5], [0, 0.7, 0], [52, 54, 58]),
    box('BaseB', 'Metal', [1.1, 0.5, 1.1], [0, 1.25, 0], [58, 60, 64]),
    box('Pole', 'Metal', [0.5, 8.6, 0.5], [0, 5.8, 0], [62, 64, 68]),
    box('Collar', 'Foil', [0.72, 0.3, 0.72], [0, 3.2, 0], [148, 132, 92]),
    box('Arm', 'Metal', [1.9, 0.34, 0.34], [0.85, 10.2, 0], [62, 64, 68]),
    box('Brace', 'Metal', [1.1, 0.24, 0.24], [0.6, 9.6, 0], [62, 64, 68], { rot: rotZ(38) }),
    box('LanternFloor', 'Metal', [1.5, 0.22, 1.5], [1.75, 9.95, 0], [52, 54, 58]),
    box('LanternRoof', 'Metal', [1.8, 0.5, 1.8], [1.75, 11.5, 0], [46, 48, 52]),
    box('Bulb', 'Neon', [0.75, 0.95, 0.75], [1.75, 10.65, 0], [255, 232, 176]),
    box('Finial', 'Foil', [0.34, 0.6, 0.34], [1.75, 11.95, 0], [156, 138, 96]),
  ];
  for (const [dx, dz] of [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]]) {
    p.push(box(`Post${dx}${dz}`, 'Metal', [0.16, 1.4, 0.16], [1.75 + dx, 10.7, dz], [46, 48, 52]));
  }
  for (const [dx, dz, ry] of [[0, -0.68, 0], [0, 0.68, 0], [-0.68, 0, 90], [0.68, 0, 90]]) {
    p.push(box(`Pane${dx}${dz}`, 'Glass', [1.2, 1.3, 0.08], [1.75 + dx, 10.7, dz], [206, 226, 236], { transparency: 0.55, rot: rotY(ry) }));
  }
  for (let i = 0; i < 5; i++) p.push(box(`Rib${i}`, 'Metal', [0.6, 0.12, 0.6], [0, 1.9 + i * 1.55, 0], [70, 72, 76]));
  for (let i = 0; i < 4; i++) p.push(box(`Bolt${i}`, 'Metal', [0.18, 0.18, 0.18], [(i % 2 ? 0.6 : -0.6), 0.72, (i < 2 ? 0.6 : -0.6)], [96, 98, 102]));
  return { name: 'lamp-good', lighting: { ...LIGHTING_DRESSED, clockTime: 19.5, lightInstances: 3 }, parts: p };
}

export function goodChest() {
  const p = [
    box('Floor', 'WoodPlanks', [5.4, 0.35, 3.2], [0, 0.35, 0], WOOD_DK),
    box('Front', 'WoodPlanks', [5.4, 2.1, 0.35], [0, 1.4, -1.42], WOOD),
    box('Back', 'WoodPlanks', [5.4, 2.1, 0.35], [0, 1.4, 1.42], WOOD_DK),
    box('Left', 'WoodPlanks', [0.35, 2.1, 3.2], [-2.52, 1.4, 0], WOOD),
    box('Right', 'WoodPlanks', [0.35, 2.1, 3.2], [2.52, 1.4, 0], WOOD),
    box('LidBack', 'Wood', [5.5, 0.4, 1.4], [0, 2.6, 0.9], WOOD_DK),
    box('LidMid', 'Wood', [5.5, 0.4, 1.3], [0, 2.95, 0.05], WOOD, { rot: rotZ(0) }),
    box('LidFront', 'Wood', [5.5, 0.4, 1.2], [0, 2.72, -0.85], WOOD, { rot: rotZ(0) }),
    box('LockPlate', 'Foil', [1.1, 1.0, 0.16], [0, 2.15, -1.62], [176, 148, 86]),
    box('Keyhole', 'Metal', [0.22, 0.34, 0.1], [0, 2.1, -1.72], [34, 32, 30]),
  ];
  for (const x of [-1.7, 1.7]) {
    p.push(box(`Band${x}`, 'Metal', [0.34, 2.3, 3.4], [x, 1.45, 0], IRON));
    p.push(box(`BandLid${x}`, 'Metal', [0.34, 0.5, 3.0], [x, 2.9, 0.1], IRON));
  }
  for (const [x, z] of [[-2.5, -1.4], [2.5, -1.4], [-2.5, 1.4], [2.5, 1.4]]) {
    p.push(box(`Corner${x}${z}`, 'Metal', [0.5, 0.5, 0.5], [x, 0.5, z], [96, 98, 104]));
    p.push(box(`Foot${x}${z}`, 'Wood', [0.6, 0.4, 0.6], [x * 0.86, 0.2, z * 0.82], WOOD_DK));
  }
  for (let i = 0; i < 6; i++) p.push(box(`Rivet${i}`, 'Metal', [0.2, 0.2, 0.14], [-1.7 + (i % 3) * 1.7, i < 3 ? 0.7 : 2.2, -1.62], [128, 130, 136]));
  for (const z of [-0.7, 0.7]) p.push(box(`Hinge${z}`, 'Metal', [0.5, 0.28, 0.5], [0, 2.5, 1.45 + z * 0.02], IRON));
  return { name: 'chest-good', lighting: LIGHTING_DRESSED, parts: p };
}

export function goodMachine() {
  const p = [
    box('Cabinet', 'Metal', [4.2, 5.2, 2.6], [0, 2.9, 0], [58, 74, 96]),
    box('Plinth', 'DiamondPlate', [4.6, 0.5, 3.0], [0, 0.25, 0], [72, 74, 80]),
    box('Hood', 'Metal', [4.4, 0.7, 2.9], [0, 5.75, 0], [44, 58, 76]),
    box('Screen', 'Glass', [3.0, 2.0, 0.16], [0, 4.1, -1.36], [122, 186, 208], { transparency: 0.35 }),
    box('ScreenBezel', 'SmoothPlastic', [3.4, 2.4, 0.14], [0, 4.1, -1.3], [30, 36, 46]),
    box('Panel', 'DiamondPlate', [3.6, 0.5, 1.5], [0, 2.7, -1.5], [86, 90, 96], { rot: rotZ(0) }),
    box('CoinDoor', 'Foil', [1.5, 0.9, 0.16], [0, 1.4, -1.38], [168, 146, 92]),
    box('Vent', 'CorrodedMetal', [2.4, 1.2, 0.16], [0, 1.5, 1.34], [96, 92, 84]),
    box('PipeA', 'Metal', [0.4, 3.4, 0.4], [-2.3, 3.0, 1.0], [126, 128, 134]),
    box('PipeB', 'Metal', [0.4, 0.4, 2.0], [-2.3, 4.6, 0.1], [126, 128, 134]),
    box('Gauge', 'Foil', [0.7, 0.7, 0.2], [-2.3, 5.0, 1.0], [188, 176, 140]),
    box('Marquee', 'Neon', [3.4, 0.6, 0.2], [0, 5.4, -1.34], [255, 138, 92]),
  ];
  for (let i = 0; i < 6; i++) p.push(box(`Button${i}`, 'Neon', [0.34, 0.2, 0.34], [-1.2 + (i % 3) * 0.85, 2.95, -1.85 - (i < 3 ? 0 : 0.35)], i % 2 ? [255, 96, 96] : [120, 240, 150]));
  for (let i = 0; i < 5; i++) p.push(box(`Slat${i}`, 'Metal', [2.2, 0.14, 0.1], [0, 1.05 + i * 0.22, 1.42], [70, 68, 64]));
  for (const [x, z] of [[-1.9, -1.2], [1.9, -1.2], [-1.9, 1.2], [1.9, 1.2]]) p.push(box(`Foot${x}${z}`, 'Metal', [0.5, 0.35, 0.5], [x, 0.18, z], [50, 52, 56]));
  for (let i = 0; i < 4; i++) p.push(box(`Bolt${i}`, 'Metal', [0.18, 0.18, 0.18], [i < 2 ? -2.0 : 2.0, i % 2 ? 0.7 : 5.4, -1.2], [140, 142, 148]));
  p.push(box('Joystick', 'Metal', [0.16, 0.6, 0.16], [-1.55, 3.2, -1.85], [40, 42, 46]));
  p.push(box('JoystickBall', 'SmoothPlastic', [0.34, 0.34, 0.34], [-1.55, 3.55, -1.85], [220, 60, 60]));
  // Side dressing. Measured need: without it the side and hero views are two blank cabinet flanks
  // and the worst-view interior edge density falls to 0.026 — within noise of the ugly trophy's
  // 0.024. A prop that only reads from the front is not a prop, and the benchmark says so.
  for (const sx of [-1, 1]) {
    p.push(box(`SideRail${sx}`, 'Metal', [0.16, 4.6, 0.3], [sx * 2.13, 3.0, -1.0], [96, 100, 108]));
    p.push(box(`SideRail2${sx}`, 'Metal', [0.16, 4.6, 0.3], [sx * 2.13, 3.0, 1.0], [96, 100, 108]));
    p.push(box(`SideDecal${sx}`, 'SmoothPlastic', [0.14, 1.6, 1.5], [sx * 2.14, 4.2, 0], [232, 118, 62]));
    p.push(box(`SideGrill${sx}`, 'CorrodedMetal', [0.14, 0.9, 1.4], [sx * 2.14, 1.5, 0], [110, 104, 92]));
    for (let i = 0; i < 3; i++) p.push(box(`SideStud${sx}_${i}`, 'Metal', [0.16, 0.2, 0.2], [sx * 2.16, 2.4 + i * 0.5, -1.6], [150, 152, 158]));
  }
  p.push(box('BackPanel', 'DiamondPlate', [3.6, 3.0, 0.14], [0, 3.6, 1.36], [66, 70, 78]));
  p.push(box('BackHatch', 'Metal', [1.4, 1.2, 0.16], [0.9, 2.6, 1.38], [104, 108, 116]));
  return { name: 'machine-good', lighting: { ...LIGHTING_DRESSED, lightInstances: 3 }, parts: p };
}

export function goodAltar() {
  const p = [
    box('StepA', 'Slate', [8.4, 0.5, 7.0], [0, 0.25, 0], [104, 106, 110]),
    box('StepB', 'Slate', [7.2, 0.5, 5.8], [0, 0.75, 0], [114, 116, 120]),
    box('Body', 'Limestone', [5.2, 2.2, 3.8], [0, 2.1, 0], [206, 200, 184]),
    box('Slab', 'Marble', [6.0, 0.55, 4.4], [0, 3.48, 0], [228, 224, 214]),
    box('SlabLip', 'Marble', [6.3, 0.2, 4.7], [0, 3.16, 0], [216, 212, 202]),
    box('Bowl', 'Foil', [1.7, 0.5, 1.7], [0, 3.98, 0], GOLD),
    box('Flame', 'Neon', [0.8, 0.9, 0.8], [0, 4.5, 0], [255, 168, 84]),
  ];
  for (const [x, z] of [[-2.4, -1.6], [2.4, -1.6], [-2.4, 1.6], [2.4, 1.6]]) {
    p.push(box(`Post${x}${z}`, 'Basalt', [0.7, 3.0, 0.7], [x * 1.32, 2.5, z * 1.35], [62, 60, 58]));
    p.push(box(`PostCap${x}${z}`, 'Foil', [0.9, 0.28, 0.9], [x * 1.32, 4.1, z * 1.35], GOLD));
    p.push(box(`Brazier${x}${z}`, 'CorrodedMetal', [0.55, 0.4, 0.55], [x * 1.32, 4.4, z * 1.35], [104, 82, 58]));
  }
  for (let i = 0; i < 6; i++) p.push(box(`Relief${i}`, 'Limestone', [0.6, 1.4, 0.14], [-2.0 + i * 0.8, 2.1, -1.96], [188, 182, 166]));
  for (let i = 0; i < 4; i++) p.push(box(`Candle${i}`, 'SmoothPlastic', [0.22, 0.55, 0.22], [-1.5 + i, 3.9, 1.5], [232, 226, 206]));
  for (let i = 0; i < 4; i++) p.push(box(`Wick${i}`, 'Neon', [0.12, 0.22, 0.12], [-1.5 + i, 4.3, 1.5], [255, 200, 120]));
  return { name: 'altar-good', lighting: { ...LIGHTING_DRESSED, lightInstances: 5 }, parts: p };
}

export function goodKiosk() {
  const p = [
    box('Deck', 'WoodPlanks', [6.4, 0.4, 4.2], [0, 0.2, 0], WOOD_DK),
    box('Counter', 'WoodPlanks', [6.2, 1.5, 0.6], [0, 1.15, -1.8], WOOD),
    box('CounterTop', 'Wood', [6.6, 0.28, 1.1], [0, 2.04, -1.9], [148, 108, 66]),
    box('BackWall', 'WoodPlanks', [6.2, 3.4, 0.35], [0, 2.1, 1.9], WOOD_DK),
    box('Shelf', 'Wood', [5.6, 0.22, 0.7], [0, 2.5, 1.5], WOOD),
    box('Sign', 'Wood', [5.0, 1.2, 0.24], [0, 5.0, 1.7], [154, 96, 52]),
    box('SignText', 'Neon', [3.4, 0.4, 0.12], [0, 5.0, 1.52], [255, 214, 132]),
    box('Roof', 'WoodPlanks', [7.2, 0.35, 5.0], [0, 4.5, 0], [140, 96, 56], { rot: rotZ(0) }),
    box('RoofRidge', 'Metal', [7.3, 0.24, 0.5], [0, 4.72, 0], [96, 98, 104]),
  ];
  for (const [x, z] of [[-2.9, -1.75], [2.9, -1.75], [-2.9, 1.75], [2.9, 1.75]]) p.push(box(`Post${x}${z}`, 'Wood', [0.4, 4.4, 0.4], [x, 2.2, z], WOOD_DK));
  for (let i = 0; i < 8; i++) p.push(box(`Awning${i}`, 'Fabric', [0.85, 0.16, 1.5], [-3.0 + i * 0.86, 4.28, -2.1], i % 2 ? [206, 74, 66] : [238, 232, 220], { rot: rotZ(-14) }));
  for (let i = 0; i < 4; i++) p.push(box(`Jar${i}`, 'Glass', [0.42, 0.6, 0.42], [-1.8 + i * 1.2, 2.45, 1.5], [178, 206, 198], { transparency: 0.4 }));
  for (let i = 0; i < 3; i++) p.push(box(`Crate${i}`, 'Wood', [0.9, 0.8, 0.9], [-2.1 + i * 2.0, 0.8, 1.0], [132, 94, 54], { rot: rotY(i * 12) }));
  for (let i = 0; i < 5; i++) p.push(box(`Fruit${i}`, 'SmoothPlastic', [0.28, 0.28, 0.28], [-1.6 + i * 0.8, 2.32, -1.9], i % 2 ? [220, 96, 60] : [222, 186, 72]));
  return { name: 'kiosk-good', lighting: LIGHTING_DRESSED, parts: p };
}

export function goodMonument() {
  const p = [
    box('StepA', 'Granite', [7.4, 0.6, 7.4], [0, 0.3, 0], [92, 90, 88]),
    box('StepB', 'Granite', [6.2, 0.6, 6.2], [0, 0.9, 0], [102, 100, 98]),
    box('Plinth', 'Marble', [4.8, 1.8, 4.8], [0, 2.1, 0], [204, 200, 192]),
    box('PlinthCap', 'Marble', [5.2, 0.35, 5.2], [0, 3.17, 0], [216, 212, 204]),
    box('ShaftA', 'Limestone', [3.0, 4.0, 3.0], [0, 5.35, 0], [212, 206, 190]),
    box('ShaftB', 'Limestone', [2.5, 4.0, 2.5], [0, 9.35, 0], [206, 200, 184]),
    box('ShaftC', 'Limestone', [2.0, 3.6, 2.0], [0, 13.15, 0], [200, 194, 178]),
    box('Capstone', 'Foil', [1.7, 1.5, 1.7], [0, 15.7, 0], GOLD),
    box('Tip', 'Neon', [0.7, 0.8, 0.7], [0, 16.85, 0], [255, 236, 176]),
  ];
  for (let i = 0; i < 4; i++) {
    const ry = i * 90;
    p.push(box(`Plaque${i}`, 'Foil', [2.0, 1.0, 0.14], [Math.round(Math.cos((ry * Math.PI) / 180)) * 2.46, 2.2, Math.round(Math.sin((ry * Math.PI) / 180)) * 2.46], [178, 152, 96], { rot: rotY(ry) }));
    p.push(box(`Band${i}`, 'Marble', [3.2, 0.26, 3.2], [0, 7.4 + i * 2.6, 0], [222, 218, 206]));
  }
  p.push(...ring(4, 3.1, 1.4, (x, z, a, i) => box(`Urn${i}`, 'Granite', [0.8, 1.0, 0.8], [x, 1.4, z], [110, 106, 102], { rot: rotY(45) })));
  p.push(...ring(8, 2.9, 0.75, (x, z, a, i) => box(`Bollard${i}`, 'Basalt', [0.4, 0.5, 0.4], [x * 1.25, 0.75, z * 1.25], [70, 68, 66])));
  for (let i = 0; i < 6; i++) p.push(box(`Glyph${i}`, 'Limestone', [0.34, 0.34, 0.1], [0, 5.0 + i * 1.3, -1.55], [176, 170, 156]));
  return { name: 'monument-good', lighting: LIGHTING_DRESSED, parts: p };
}

export function goodTree() {
  const p = [
    box('TrunkA', 'Wood', [1.7, 3.2, 1.7], [0, 1.6, 0], WOOD_DK),
    box('TrunkB', 'Wood', [1.4, 3.0, 1.4], [0.15, 4.6, 0.1], WOOD, { rot: rotZ(-4) }),
    box('TrunkC', 'Wood', [1.1, 2.6, 1.1], [0.35, 7.3, 0.2], WOOD, { rot: rotZ(-7) }),
  ];
  for (const [x, z, ry] of [[1.0, 0, 0], [-1.0, 0, 0], [0, 1.0, 90], [0, -1.0, 90]]) {
    p.push(box(`Root${x}${z}`, 'Wood', [1.2, 0.7, 0.8], [x, 0.35, z], WOOD_DK, { rot: rotY(ry) }));
  }
  const branches = [[2.3, 6.4, 0.4, 34], [-2.1, 7.0, -0.5, -30], [0.5, 8.2, 2.2, 20], [0.2, 8.6, -2.0, -22]];
  branches.forEach(([x, y, z, rz], i) => p.push(box(`Branch${i}`, 'Wood', [2.6, 0.55, 0.55], [x, y, z], WOOD, { rot: rotZ(rz) })));
  const canopy = [
    [0.4, 11.0, 0.2, 6.4, 3.4, 6.0],
    [-2.6, 9.9, 0.6, 4.2, 2.6, 3.8],
    [2.7, 10.2, -0.9, 4.0, 2.4, 3.6],
    [0.2, 9.6, 2.9, 3.6, 2.2, 3.4],
    [0.0, 12.6, -0.6, 4.4, 2.4, 4.0],
  ];
  canopy.forEach(([x, y, z, sx, sy, sz], i) => p.push(box(`Canopy${i}`, 'LeafyGrass', [sx, sy, sz], [x, y, z], i % 2 ? LEAF : LEAF_LT, { rot: rotY(i * 13) })));
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    p.push(box(`Tuft${i}`, 'Grass', [0.85, 0.7, 0.85], [Math.cos(a) * 3.4 + 0.3, 9.6 + (i % 4) * 1.2, Math.sin(a) * 3.1], i % 3 ? LEAF_LT : LEAF, { rot: rotY(i * 26) }));
  }
  for (let i = 0; i < 5; i++) p.push(box(`Knot${i}`, 'Wood', [0.34, 0.34, 0.34], [(i % 2 ? 0.85 : -0.8), 1.4 + i * 1.3, (i % 3 ? 0.5 : -0.6)], [96, 66, 38]));
  return { name: 'tree-good', lighting: LIGHTING_DRESSED, parts: p };
}

/**
 * Nudge apart any two interpenetrating parts whose faces are EXACTLY coplanar — the z-fighting
 * the technical-art lens flags, and the fix it prescribes ("offset coincident surfaces by at
 * least 0.01 studs"), applied to the fixtures themselves.
 *
 * This exists because the critic caught the author. The first version of these builds had 7
 * coplanar interpenetrating pairs in the trophy and 17 in the chest — real construction
 * sloppiness that would z-fight on hardware. Loosening the critic to make the positive controls
 * pass would have been the wrong repair; fixing the geometry is the right one, and the test
 * asserts the count stays at zero.
 */
export function deconflict(scene) {
  const s = clone(scene);
  const span = (p, a) => [p.pos[a] - p.size[a] / 2, p.pos[a] + p.size[a] / 2];
  const identity = (r) => !r || [1, 0, 0, 0, 1, 0, 0, 0, 1].every((v, i) => Math.abs(r[i] - v) < 1e-9);
  const eps = [0.013, 0.017, 0.019, 0.023, 0.029, 0.031, 0.037, 0.041];
  for (let pass = 0; pass < eps.length; pass++) {
    let moved = 0;
    const aligned = s.parts.filter((p) => identity(p.rot));
    for (let i = 0; i < aligned.length; i++) {
      for (let j = i + 1; j < aligned.length; j++) {
        const a = aligned[i];
        const b = aligned[j];
        const overlaps = [0, 1, 2].every((ax) => {
          const [al, ah] = span(a, ax);
          const [bl, bh] = span(b, ax);
          return Math.min(ah, bh) - Math.max(al, bl) > 1e-6;
        });
        if (!overlaps) continue;
        const axis = [0, 1, 2].find((ax) => span(a, ax).some((x) => span(b, ax).some((y) => Math.abs(x - y) < 1e-6)));
        if (axis === undefined) continue;
        // move the smaller part, so the silhouette-defining masses stay where they were placed
        const small = a.size[0] * a.size[1] * a.size[2] <= b.size[0] * b.size[1] * b.size[2] ? a : b;
        const other = small === a ? b : a;
        small.pos[axis] += (small.pos[axis] >= other.pos[axis] ? 1 : -1) * eps[pass];
        small.pos[axis] = Math.round(small.pos[axis] * 10000) / 10000;
        moved++;
      }
    }
    if (!moved) break;
  }
  return s;
}

const RAW_BUILDERS = {
  trophy: goodTrophy,
  fountain: goodFountain,
  portal: goodPortal,
  lamp: goodLamp,
  chest: goodChest,
  machine: goodMachine,
  altar: goodAltar,
  kiosk: goodKiosk,
  monument: goodMonument,
  tree: goodTree,
};

export const GOOD_BUILDERS = Object.fromEntries(
  Object.entries(RAW_BUILDERS).map(([k, f]) => [k, () => deconflict(f())]),
);

// ---- 3. degradations: one property removed, everything else held ------------------------------

const clone = (s) => JSON.parse(JSON.stringify(s));
const maxDim = (p) => Math.max(...p.size);
/** The prop's cube-equivalent size — the scale buckets are relative to this, not to its height,
 *  so a tall thin obelisk and a squat chest are bucketed on the same footing. */
function cubeScale(parts) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], p.pos[a] - maxDim(p) / 2);
      hi[a] = Math.max(hi[a], p.pos[a] + maxDim(p) / 2);
    }
  }
  return Math.cbrt(Math.max(hi[0] - lo[0], 0.1) * Math.max(hi[1] - lo[1], 0.1) * Math.max(hi[2] - lo[2], 0.1));
}

/** Colour choice removed. Geometry, materials-as-shape and part count all untouched. */
export function greyify(scene) {
  const s = clone(scene);
  s.name = `${scene.name}-greyed`;
  for (const p of s.parts) {
    p.material = 'Plastic';
    p.color = [163, 162, 165];
    p.transparency = 0;
  }
  return s;
}

/** Material variety removed, colours kept. Isolates material_intent from factory_default. */
export function monoMaterial(scene) {
  const s = clone(scene);
  s.name = `${scene.name}-mono`;
  for (const p of s.parts) p.material = 'Plastic';
  return s;
}

/** Every element below the small-scale threshold deleted: the blockout. Colour and material kept. */
export function stripSmallDetail(scene) {
  const s = clone(scene);
  s.name = `${scene.name}-blockout`;
  const M = cubeScale(s.parts);
  s.parts = s.parts.filter((p) => maxDim(p) >= 0.15 * M);
  return s;
}

/** Collapsed to three stacked boxes spanning the same bounds: the origin bug's shape, applied to
 *  any noun. Keeps the overall proportion AND the three commonest material/colour pairs, so the
 *  fixture is not caught by the surface signals for free — it has to be caught on form. */
export function boxify(scene) {
  const s = clone(scene);
  s.name = `${scene.name}-boxed`;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const p of s.parts) {
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], p.pos[a] - p.size[a] / 2);
      hi[a] = Math.max(hi[a], p.pos[a] + p.size[a] / 2);
    }
  }
  const w = hi[0] - lo[0];
  const h = hi[1] - lo[1];
  const d = hi[2] - lo[2];
  const cx = (lo[0] + hi[0]) / 2;
  const cz = (lo[2] + hi[2]) / 2;
  // keep the three commonest surfaces so material_intent and factory_default cannot claim the kill
  const freq = new Map();
  for (const p of s.parts) {
    const k = `${p.material}|${p.color.join(',')}`;
    freq.set(k, (freq.get(k) ?? 0) + 1);
  }
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k.split('|'));
  while (top.length < 3) top.push(top[0]);
  s.parts = [0, 1, 2].map((i) =>
    box(
      `Mass${i}`,
      top[i][0],
      [w * (1 - i * 0.12), h / 3, d * (1 - i * 0.12)],
      [cx, lo[1] + h / 6 + (i * h) / 3, cz],
      top[i][1].split(',').map(Number),
    ),
  );
  return s;
}

/** Every part given the same volume: destroys the large/medium/small hierarchy, holds layout. */
export function equalise(scene) {
  const s = clone(scene);
  s.name = `${scene.name}-equalised`;
  const mean = Math.cbrt(s.parts.reduce((a, p) => a + p.size[0] * p.size[1] * p.size[2], 0) / s.parts.length);
  for (const p of s.parts) p.size = [mean, mean, mean];
  return s;
}

/** 240 identical tiles buried inside the bounds: part count soars, silhouette does not move.
 *  The check that "more parts" is not a way to pass. */
export function partSpam(scene) {
  const s = clone(scene);
  s.name = `${scene.name}-spam`;
  const src = s.parts[0];
  const lo = Math.min(...s.parts.map((p) => p.pos[1]));
  let k = 0;
  for (let i = 0; i < 240; i++) {
    const a = (i / 240) * Math.PI * 2 * 7;
    s.parts.push(box(`Spam${k++}`, src.material, [0.2, 0.2, 0.2], [Math.cos(a) * 0.3, lo + 0.4 + (i % 12) * 0.05, Math.sin(a) * 0.3], src.color));
  }
  return s;
}

export const DEGRADATIONS = {
  greyed: { fn: greyify, targets: 'factory_default', why: 'colour and material choice removed, geometry untouched' },
  mono: { fn: monoMaterial, targets: 'material_intent', why: 'one material everywhere, colours kept' },
  blockout: { fn: stripSmallDetail, targets: 'detail_scale', why: 'small elements deleted, colour and material kept' },
  boxed: { fn: boxify, targets: 'silhouette', why: 'collapsed to three stacked boxes over the same bounds' },
  equalised: { fn: equalise, targets: 'detail_scale', why: 'every part the same size: no scale hierarchy' },
  spam: { fn: partSpam, targets: 'efficiency', why: '240 hidden tiles: part count without form' },
};

// ---- 4. the fixture set ----------------------------------------------------------------------

/**
 * Every fixture the benchmark is tested against, with the label it must be graded as.
 * `expect: 'pass'` fixtures are the positive controls; without them a benchmark that rejects
 * everything would look perfect.
 */
export function buildSuiteFixtures({ degradeAll = false } = {}) {
  const out = [];
  out.push({ id: 'trophy-ugly', prop: 'trophy', expect: 'fail', scene: uglyTrophy(), note: 'the origin bug, reconstructed from life' });
  for (const [prop, build] of Object.entries(GOOD_BUILDERS)) {
    const good = build();
    out.push({ id: `${prop}-good`, prop, expect: 'pass', scene: good, note: 'positive control' });
    // Degrading all ten props is 60 extra renders; the trophy carries the full ladder and the
    // rest carry the two degradations that map to the origin bug. --all runs the whole grid.
    const set = degradeAll || prop === 'trophy' ? Object.keys(DEGRADATIONS) : ['greyed', 'blockout'];
    for (const d of set) {
      out.push({
        id: `${prop}-${d}`,
        prop,
        expect: 'fail',
        scene: DEGRADATIONS[d].fn(good),
        note: `derived: ${DEGRADATIONS[d].why}`,
        targets: DEGRADATIONS[d].targets,
      });
    }
  }
  return out;
}

// ---- CLI: write the scenes out as inspectable JSON --------------------------------------------

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(FIX, { recursive: true });
  const written = [];
  const emit = (name, scene) => {
    writeFileSync(join(FIX, `${name}.json`), `${JSON.stringify(scene, null, 1)}\n`);
    written.push(`${name}.json (${scene.parts.length} parts)`);
  };
  emit('trophy-ugly', uglyTrophy());
  for (const [prop, build] of Object.entries(GOOD_BUILDERS)) emit(`${prop}-good`, build());
  console.log(written.join('\n'));
}
