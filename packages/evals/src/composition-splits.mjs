// Three disjoint sets over the synthetic family fixtures: CALIBRATION, VALIDATION, REGRESSION.
//
// WHY THE SPLIT IS BY FAMILY AND NOT BY FIXTURE.
// A per-fixture shuffle would put `tavern/good/v0` in CALIBRATION and `tavern/good/v1` in
// VALIDATION. Those two share a generator, a palette and a floor plan; they differ by a seeded
// jitter. Calling the second one "held out" would be a lie — it is the first one with the noise
// re-rolled. Splitting on FAMILY means the validation families were never touched while looking
// at numbers, which is the only version of "held out" worth reporting.
//
// The cost is honest and stated: five families per set is a small sample, and the sets are not
// exchangeable — VALIDATION may simply contain harder families than CALIBRATION. The per-family
// table in the report exists so a reader can see exactly which families each number came from
// instead of trusting a single aggregate.
//
// DETERMINISM. Seeded Fisher-Yates over the family list in the order `composition-families.mjs`
// declares it, with the constant below. No clock, no Math.random, no run-to-run drift. Change
// the seed and the assignment changes, which is why the seed is a written-down constant and the
// resulting assignment is asserted in composition-generalization.test.mjs — a silent reshuffle
// would let someone move an inconvenient family out of VALIDATION.

import { FAMILIES, buildFamilies, makeRng } from './composition-families.mjs';

/** The one number that decides the assignment. Fixed 2026-08-31; never re-rolled to taste. */
export const SPLIT_SEED = 20260831;

export const SET_NAMES = ['CALIBRATION', 'VALIDATION', 'REGRESSION'];

/** Seeded Fisher-Yates. Deterministic given SPLIT_SEED and the declaration order of FAMILIES. */
function shuffled(list, seed) {
  const a = [...list];
  const rng = makeRng(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** family -> set name. Round-robin over the shuffled family list, so the sets stay equal-sized. */
export function familyAssignment() {
  const order = shuffled(FAMILIES, SPLIT_SEED);
  const map = {};
  order.forEach((family, i) => {
    map[family] = SET_NAMES[i % SET_NAMES.length];
  });
  return map;
}

/**
 * { CALIBRATION: [fixture...], VALIDATION: [...], REGRESSION: [...] } plus the family map.
 * Every fixture appears in exactly one set; every family appears in exactly one set.
 */
export function buildSplits(fixtures = buildFamilies()) {
  const assignment = familyAssignment();
  const sets = Object.fromEntries(SET_NAMES.map((n) => [n, []]));
  for (const f of fixtures) {
    const set = assignment[f.family];
    if (!set) throw new Error(`fixture ${f.id} has no set assignment`);
    sets[set].push(f);
  }
  return { assignment, sets, fixtures };
}

/**
 * The disjointness proof, computed rather than asserted by hand. Returns the evidence itself so
 * the test can assert on it and the report can print it.
 */
export function disjointnessProof(splits = buildSplits()) {
  const { sets, fixtures } = splits;
  const seenIds = new Map();
  const seenFamilies = new Map();
  const idCollisions = [];
  const familyCollisions = [];

  for (const name of SET_NAMES) {
    for (const f of sets[name]) {
      const prev = seenIds.get(f.id);
      if (prev && prev !== name) idCollisions.push(`${f.id}: ${prev} + ${name}`);
      seenIds.set(f.id, name);
      const pf = seenFamilies.get(f.family);
      if (pf && pf !== name) familyCollisions.push(`${f.family}: ${pf} + ${name}`);
      seenFamilies.set(f.family, name);
    }
  }

  const covered = SET_NAMES.reduce((n, s) => n + sets[s].length, 0);
  const duplicateIds = fixtures.length !== new Set(fixtures.map((f) => f.id)).size;

  return {
    totalFixtures: fixtures.length,
    coveredFixtures: covered,
    uncovered: fixtures.filter((f) => !seenIds.has(f.id)).map((f) => f.id),
    idCollisions,
    familyCollisions,
    duplicateIds,
    sizes: Object.fromEntries(SET_NAMES.map((n) => [n, sets[n].length])),
    familiesPerSet: Object.fromEntries(
      SET_NAMES.map((n) => [n, [...new Set(sets[n].map((f) => f.family))].sort()]),
    ),
    labelBalance: Object.fromEntries(
      SET_NAMES.map((n) => [
        n,
        {
          good: sets[n].filter((f) => f.label === 'good').length,
          bad: sets[n].filter((f) => f.label === 'bad').length,
        },
      ]),
    ),
    disjoint: idCollisions.length === 0 && familyCollisions.length === 0 && !duplicateIds && covered === fixtures.length,
  };
}
