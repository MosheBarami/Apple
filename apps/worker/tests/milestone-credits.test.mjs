/**
 * WHAT A MILESTONE WILL COST, IN THE UNIT THE USER IS BILLED IN.
 *
 * The roadmap card already said how much WORK a milestone is — "about two Agent runs", from
 * `effortLine`. Runs are not a unit anybody is charged in, so the card also prints a cost.
 *
 * THE PRICE OF A RUN IS WHAT A BUILD OF THAT SIZE COSTS (review cycle 3, finding 6). The derivation was
 * `runs x MODE_INFO.typicalCredits`, and `typicalCredits` (4-18 ledger units, 0.03-0.12 credits) is what one
 * targeted EDIT costs. A milestone is building work, so the chip printed 0.03 credits for work the pricing page
 * prices at 1.40 credits a typical build and 0.52 a small one: a figure below the cheapest published build. It is
 * now `runs x` the published cost of one build of the milestone's size (small, medium, large -> BUILD_COSTS
 * small, typical, big), and the big row is flagged as an estimate because the pricing page says so.
 *
 * WHAT IS PINNED HERE:
 *
 *   1. The range is DERIVED from the shared build costs, never typed on a milestone. A second copy of a
 *      price is a second copy free to drift (scripts/check-credit-figures.mjs exists for that).
 *   2. It is the SPEC's own `runs`, so a two-run milestone really does read double a one-run one of its size.
 *   3. It is a RANGE and stays one where the published figure is one.
 *   4. NO MILESTONE COSTS LESS THAN A BUILD OF ITS SIZE, and none less than the cheapest published build.
 *
 * WHAT IS NOT PINNED, stated because check-credit-figures.mjs makes the same admission: this proves the card
 * AGREES with the published build costs. It cannot prove a milestone's runs cost what a build of its size
 * does; that is M6's estimate-before-you-build.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const ROOT = join(WORKER, '../..');

const bundle = (src, tag) => {
  const out = join(mkdtempSync(join(tmpdir(), tag)), 'b.mjs');
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [src, '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
    { cwd: WORKER, stdio: 'pipe' });
  return import(`file://${out}`);
};

const R = await bundle(join(WORKER, 'src', 'roadmap.ts'), 'mc-');
const S = await bundle(join(ROOT, 'packages', 'shared', 'src', 'index.ts'), 'mc-sh-');

const SCAN = {
  counts: { instances: 900, parts: 700, scripts: 6 },
  services: { Workspace: 700, ServerScriptService: 3, ReplicatedStorage: 2, StarterGui: 1 },
  classes: { Part: 700, Script: 3, LocalScript: 2, RemoteEvent: 2, ScreenGui: 1, SpawnLocation: 1 },
  named: [{ name: 'Shop', className: 'Model', path: 'game.Workspace.Shop' }],
  lighting: [], guis: ['HUD'], topLevel: ['Workspace', 'ServerScriptService'],
  place: 'Coin Simulator',
  scripts: [
    { path: 'game.ServerScriptService.Main', className: 'Script',
      source: 'local leaderstats = Instance.new("Folder")\nlocal c = Instance.new("IntValue")\nc.Name = "Coins"\nlocal ev = Instance.new("RemoteEvent")\nev:FireClient(p)' },
  ],
  truncated: { scan: false, named: false, scripts: false, source: false },
};

const shape = R.analyzeProject(SCAN);
const roadmap = R.buildRoadmap(shape, Date.UTC(2026, 8, 14));

/* ------------------------------------------------------------------- the shared helper --- */

const SIZE_ROW = { small: 'small', medium: 'typical', large: 'big' };
const row = (complexity) => S.BUILD_COSTS.find((b) => b.id === SIZE_ROW[complexity]);
const units = (credits) => Math.round(credits * S.INTERNAL_PER_CREDIT);

test('CONTROL: the chain is live and the catalogue really does vary `runs` and size', () => {
  // Without all of these, every assertion below could hold over an empty or uniform set.
  assert.ok(roadmap.milestones.length >= 5, `only ${roadmap.milestones.length} milestones`);
  const src = readFileSync(join(WORKER, 'src', 'roadmap.ts'), 'utf8');
  assert.match(src, /runs: 2,/, 'every milestone is one run, so multiplying by runs proves nothing');
  const sizes = new Set(roadmap.milestones.map((m) => m.complexity));
  assert.ok(sizes.has('small') && sizes.has('medium'), `the catalogue only has sizes ${[...sizes]}`);
  assert.equal(S.BUILD_COSTS.length, 3, 'the published build table changed shape: small, typical, big');
});

test('the retired Plan mode, and a size nobody published, get no figure rather than a borrowed one', () => {
  assert.equal(S.creditRangeForRuns('plan', 1), null);
  assert.equal(S.creditRangeForRuns('huge', 1), null);
  assert.equal(S.creditRangeForRuns(undefined, 1), null);
});

test('a size keeps the published spread of ITS build, in ledger units, and the big row is flagged as an estimate', () => {
  assert.deepEqual(S.creditRangeForRuns('small', 1), { low: units(0.52), high: units(1.4), estimated: false });
  assert.deepEqual(S.creditRangeForRuns('medium', 1), { low: 210, high: 210, estimated: false }, 'a typical build is 1.40 credits = 210 ledger units');
  assert.deepEqual(S.creditRangeForRuns('large', 1), { low: units(4), high: units(12), estimated: true });
});

test('TWO RUNS COST TWICE, which is the entire reason this is multiplied', () => {
  assert.deepEqual(S.creditRangeForRuns('medium', 2), { low: 420, high: 420, estimated: false });
  assert.deepEqual(S.creditRangeForRuns('small', 2), { low: units(0.52) * 2, high: units(1.4) * 2, estimated: false });
});

test('a nonsense run count produces no figure rather than a wrong one', () => {
  for (const bad of [0, -1, 1.5, NaN, Infinity]) {
    assert.equal(S.creditRangeForRuns('medium', bad), null, `${bad} produced a credit figure`);
  }
});

test('the helper reads BUILD_COSTS rather than carrying its own copy of the prices', () => {
  // The guard that matters most: a second copy of a price is a second copy free to drift, which
  // is the defect scripts/check-credit-figures.mjs was written for.
  const src = readFileSync(join(ROOT, 'packages', 'shared', 'src', 'index.ts'), 'utf8');
  const fn = src.slice(src.indexOf('export function creditRangeForRuns'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /BUILD_COSTS\.find\(/, 'the range is computed from a price typed somewhere else');
  assert.doesNotMatch(body, /\b(?:0\.52|1\.4|12|210|600|1800)\b/, 'a published price is hard-coded inside the helper');
  assert.doesNotMatch(body, /MODE_INFO/, 'the per-request edit price is not what a milestone costs');
});

/* --------------------------------------------------------------- on the milestone itself --- */

test('every milestone carries the range, so no card has to invent one', () => {
  for (const m of roadmap.milestones) {
    assert.equal(typeof m.creditsLow, 'number', `${m.id} has no credit range`);
    assert.equal(typeof m.creditsHigh, 'number', `${m.id} has no credit range`);
    assert.equal(typeof m.creditsEstimated, 'boolean', `${m.id} does not say whether its figure is an estimate`);
    assert.ok(m.creditsLow > 0, `${m.id} claims a milestone can cost nothing`);
    assert.ok(m.creditsHigh >= m.creditsLow, `${m.id} has a range that runs backwards`);
  }
});

test('the milestone range is exactly the shared derivation for its size and runs, not a parallel calculation', () => {
  for (const m of roadmap.milestones) {
    const oneRun = S.creditRangeForRuns(m.complexity, 1);
    const runs = m.creditsHigh / oneRun.high;
    assert.deepEqual(
      { low: m.creditsLow, high: m.creditsHigh, estimated: m.creditsEstimated },
      S.creditRangeForRuns(m.complexity, runs),
      `${m.id} priced itself differently from creditRangeForRuns`,
    );
  }
});

test('NO MILESTONE COSTS LESS THAN A BUILD OF ITS SIZE, AND NONE LESS THAN THE CHEAPEST PUBLISHED BUILD', () => {
  //[[ Review cycle 3, finding 6. The chip printed runs x the per-REQUEST range: 0.03 credits for a milestone,
  //   below the 0.52 the pricing page gives for the cheapest build, and a fortieth of a typical one (1.40). ]]
  const cheapest = Math.min(...S.BUILD_COSTS.map((b) => units(b.creditsLow)));
  for (const m of roadmap.milestones) {
    assert.ok(m.creditsLow >= units(row(m.complexity).creditsLow), `${m.id} (${m.complexity}) costs ${m.creditsLow} units, less than one ${m.complexity} build`);
    assert.ok(m.creditsLow >= cheapest, `${m.id} costs ${m.creditsLow} units, less than the cheapest published build (${cheapest})`);
  }
  // A typical-size, one-run milestone is exactly what the pricing page calls a typical build.
  const typical = roadmap.milestones.find((m) => m.complexity === 'medium' && / one /.test(m.effort));
  assert.ok(typical, 'no medium one-run milestone: the comparison below would check nothing');
  assert.equal(typical.creditsLow, units(S.TYPICAL_BUILD_CREDITS));
  assert.equal(typical.creditsHigh, units(S.TYPICAL_BUILD_CREDITS));
});

test('THE RANGE TRACKS THE EFFORT LINE — a two-run milestone reads double a one-run one of the same size', () => {
  let compared = 0;
  for (const size of ['small', 'medium', 'large']) {
    const list = roadmap.milestones.filter((m) => m.complexity === size);
    const one = list.find((m) => / one /.test(m.effort));
    const two = list.find((m) => / 2 /.test(m.effort));
    if (!one || !two) continue;
    compared += 1;
    assert.equal(two.creditsHigh, one.creditsHigh * 2, `${size}: the chip and the effort line disagree`);
    assert.equal(two.creditsLow, one.creditsLow * 2);
  }
  assert.ok(compared > 0, 'no size had both a one-run and a two-run milestone — nothing was compared');
});
