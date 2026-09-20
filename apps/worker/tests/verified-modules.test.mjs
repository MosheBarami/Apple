/**
 * THE MODULES MUST BE RIGHT, AND THE RIGHT ONE MUST COME BACK.
 *
 * eval-v4 measured the model at 0/8 on game logic. The failures are near-misses — correct house
 * style, wrong arithmetic. apple-v4 answered `honest-percent` with `* 99` where the contract says
 * the scale is 0..100. A customer never sees that: the build succeeds and the number is quietly
 * wrong forever.
 *
 * This library exists so the model stops re-deriving that logic. Which means two things have to
 * hold, and these tests pin both:
 *   1. every shipped module actually passes its own checks — enforced at build time, re-asserted
 *      here so a hand-edited bundle cannot slip through;
 *   2. a lookup returns the RIGHT module or admits it has none, because a plausible wrong module is
 *      worse than no module: nothing downstream checks what the model installs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const ROOT = join(WORKER, '..', '..');

const out = join(mkdtempSync(join(tmpdir(), 'apple-vmod-')), 'vm.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'verified-modules.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { stdio: 'pipe', cwd: WORKER });
const { askVerifiedModule, searchVerifiedModules, getVerifiedModule, VERIFIED_MODULE_COUNT, CONFIDENCE_FLOOR } = await import(out);

test('the bundle is not stale, and building it re-runs every module against its checks', () => {
  // --check rebuilds from the curriculum, which executes all 80. A module that stopped passing
  // would change the bundle and fail here rather than ship.
  execFileSync('node', [join(ROOT, 'scripts', 'build-verified-modules.mjs'), '--check'], { stdio: 'pipe' });
});

test('the library is not empty and carries real Luau', () => {
  assert.ok(VERIFIED_MODULE_COUNT >= 50, `only ${VERIFIED_MODULE_COUNT} modules shipped`);
  const m = getVerifiedModule('honest-percent');
  assert.ok(m, 'honest-percent is the case the model got wrong; it must be in the library');
  assert.match(m.source, /return function/, 'the source must be a module, not a description of one');
});

test('the shipped honest-percent is the version the MODEL failed to write', () => {
  // The whole point. apple-v4 wrote `* 99`; the contract is a 0..100 scale. If the library ever
  // shipped the model's version, this tool would launder the defect it exists to prevent.
  const m = getVerifiedModule('honest-percent');
  assert.ok(!/\*\s*99\b/.test(m.source), `the library is shipping the wrong constant: ${m.source}`);
  assert.match(m.source, /100/, 'the 0..100 scale must be in the source');
});

test('a need finds the right module by its words, not by luck', () => {
  const hits = searchVerifiedModules('stop the player using an ability too often', 5).map((m) => m.id);
  assert.ok(hits.includes('cooldown-clock'), `expected cooldown-clock among ${hits.join(', ')}`);
});

//[[ 2026-09-21 — RE-AIMED, AND THE QUERY IT USED TO USE IS NOW THE TEST BELOW IT.
//
//   This asked 'work out a level from experience points' and asserted `level-from-xp` was somewhere
//   in the five. It was — in position two, behind `prestige-conversion`, at a relative margin of
//   0.08. A confidence floor now declines that request rather than naming a wrong module first, so
//   the assertion moved to a request the door is actually sure about and the old query became the
//   worked example of the case the floor exists for. The PROPERTY is unchanged and is what is
//   asserted: a need never returns source, only ids to ask for.
test('asking by need returns a shortlist and withholds source until an id is named', () => {
  const a = askVerifiedModule({ need: 'pickaxe wears out after so many swings' });
  assert.equal(a.found, false, 'a need is a shortlist, never a direct install');
  assert.ok(a.candidates.length > 0);
  assert.ok(a.candidates.every((c) => !('source' in c)), 'source must not ride along on a fuzzy match');
  assert.ok(a.candidates.some((c) => c.id === 'tool-durability'), `got ${a.candidates.map((c) => c.id).join(', ')}`);
});

/**
 * THE DOOR DECLINES WHEN IT IS NOT SURE, INSTEAD OF NAMING A WRONG MODULE FIRST.
 *
 * Both halves are needed or the guard is decoration. A floor that declined EVERYTHING would pass an
 * "it declines" assertion while destroying the library's only door, so a request the door is sure
 * about has to still come back — and `searchVerifiedModules` must be untouched, because the
 * few-shot arms retrieve their worked examples through it and a floor there would silently change
 * a measurement nobody re-ran.
 *
 * The declining query is not invented for this test: it is the one the test above used to use.
 * `prestige-conversion` ranked first on it and `level-from-xp`, the right answer, ranked second,
 * 0.08 apart. packages/training/src/measure-library-abstention.mjs has the distribution this floor
 * is read off, and 0/80 for what a near-miss scores when it is actually executed.
 */
test('a need the door is not sure about is declined rather than answered with the runner-up', () => {
  const unsure = askVerifiedModule({ need: 'work out a level from experience points' });
  assert.equal(unsure.found, false);
  assert.ok(!unsure.candidates || unsure.candidates.length === 0, `offered ${(unsure.candidates ?? []).map((c) => c.id).join(', ')}`);
  assert.match(unsure.note, /not one of the checked modules|write it yourself/i);

  const sure = askVerifiedModule({ need: 'pickaxe wears out after so many swings' });
  assert.ok(sure.candidates?.length > 0, 'the floor must not close the door on requests it does cover');

  // The retriever the few-shot arms use is deliberately NOT gated; only the model-facing answer is.
  assert.ok(searchVerifiedModules('work out a level from experience points', 5).length >= 2,
    'searchVerifiedModules must keep returning the full shortlist for the arms that measure it');

  assert.ok(CONFIDENCE_FLOOR > 0 && CONFIDENCE_FLOOR < 1, 'a floor of 0 or 1 is not a policy, it is an off switch');
});

test('asking by id returns the source', () => {
  const a = askVerifiedModule({ id: 'cooldown-clock' });
  assert.equal(a.found, true);
  assert.ok(a.source.length > 50);
  assert.match(a.verified, /executed/i, 'the guarantee travels with the code');
});

test('an uncovered need SAYS so and tells the model to disclose it', () => {
  const a = askVerifiedModule({ need: 'render a volumetric cloud shader' });
  assert.equal(a.found, false);
  assert.ok(!a.candidates || a.candidates.length === 0);
  // Silence here would send the model back to writing logic by hand with no signal — the 0/8.
  assert.match(a.note, /not one of the checked modules|write it yourself/i);
});

test('an unknown id offers candidates instead of inventing a module', () => {
  const a = askVerifiedModule({ id: 'cooldown' });
  assert.equal(a.found, false);
  assert.ok(a.candidates.some((c) => c.id === 'cooldown-clock'));
  assert.match(a.note, /unverified|Pick one/i);
});
