/**
 * WHAT A MILESTONE WILL COST, IN THE UNIT THE USER IS BILLED IN.
 *
 * The roadmap card already said how much WORK a milestone is — "about two Agent runs", from
 * `effortLine`. Runs are not a unit anybody is charged in. The composer, two clicks away, shows
 * "Typically 4-18 Credits" per Agent run, so the arithmetic that turns one into the other was
 * sitting in front of the user, unperformed.
 *
 * The derivation is `runs × MODE_INFO[mode].typicalCredits`, and the multiplication is the point:
 * with `runs` varying between 1 and 2 across the catalogue, a two-run Agent milestone is
 * 20-60 Credits where the mode's own line says 10-30. Reprinting the mode range on the card would
 * have understated half the catalogue by exactly a factor of two.
 *
 * WHAT IS PINNED HERE:
 *
 *   1. The range is DERIVED from the shared billing constants, never typed on a milestone. A
 *      second copy of a price is a second copy free to drift, and this repository has a guard
 *      (scripts/check-credit-figures.mjs) that exists because exactly that happened three times
 *      inside one component.
 *   2. It is the SPEC's own `runs`, so a two-run milestone really does read double a one-run one.
 *   3. It is a RANGE and stays one. Collapsing 4-18 to a single number would be inventing a
 *      precision the measurements behind COST-MODEL.md do not have.
 *
 * WHAT IS NOT PINNED, stated because check-credit-figures.mjs makes the same admission: this
 * proves the card AGREES with the billing constants. It cannot prove the constants are
 * representative of a real run. See that file's header for a measured run that blew through them.
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

test('CONTROL: the chain is live and the catalogue really does vary `runs`', () => {
  // Without both of these, every assertion below could hold over an empty or uniform set.
  assert.ok(roadmap.milestones.length >= 5, `only ${roadmap.milestones.length} milestones`);
  const src = readFileSync(join(WORKER, 'src', 'roadmap.ts'), 'utf8');
  assert.match(src, /runs: 2,/, 'every milestone is one run, so multiplying by runs proves nothing');
});

test('a mode with a single published figure yields a range of one number', () => {
  // Plan is published as "2", not "2-2". Fabricating a spread would be as dishonest as
  // collapsing one.
  assert.deepEqual(S.creditRangeForRuns('plan', 1), { low: 2, high: 2 });
});

test('a mode with a published spread keeps both ends', () => {
  assert.deepEqual(S.creditRangeForRuns('agent', 1), { low: 4, high: 18 });
});

test('TWO RUNS COST TWICE, which is the entire reason this is computed', () => {
  assert.deepEqual(S.creditRangeForRuns('agent', 2), { low: 8, high: 36 });
});

test('a nonsense run count produces no figure rather than a wrong one', () => {
  for (const bad of [0, -1, 1.5, NaN, Infinity]) {
    assert.equal(S.creditRangeForRuns('agent', bad), null, `${bad} produced a credit figure`);
  }
});

test('the helper reads MODE_INFO rather than carrying its own copy of the prices', () => {
  // The guard that matters most: a second copy of a price is a second copy free to drift, which
  // is the defect scripts/check-credit-figures.mjs was written for.
  const src = readFileSync(join(ROOT, 'packages', 'shared', 'src', 'index.ts'), 'utf8');
  const fn = src.slice(src.indexOf('export function creditRangeForRuns'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /MODE_INFO\[/, 'the range is computed from a price typed somewhere else');
  assert.doesNotMatch(body, /\b(?:18|30)\b/, 'a published price is hard-coded inside the helper');
});

/* --------------------------------------------------------------- on the milestone itself --- */

test('every milestone carries the range, so no card has to invent one', () => {
  for (const m of roadmap.milestones) {
    assert.equal(typeof m.creditsLow, 'number', `${m.id} has no credit range`);
    assert.equal(typeof m.creditsHigh, 'number', `${m.id} has no credit range`);
    assert.ok(m.creditsLow > 0, `${m.id} claims a milestone can cost nothing`);
    assert.ok(m.creditsHigh >= m.creditsLow, `${m.id} has a range that runs backwards`);
  }
});

test('the milestone range is exactly the shared derivation, not a parallel calculation', () => {
  for (const m of roadmap.milestones) {
    const runs = m.creditsHigh / S.creditRangeForRuns(m.mode, 1).high;
    assert.deepEqual(
      { low: m.creditsLow, high: m.creditsHigh },
      S.creditRangeForRuns(m.mode, runs),
      `${m.id} priced itself differently from creditRangeForRuns`,
    );
  }
});

test('THE RANGE TRACKS THE EFFORT LINE — a two-run milestone reads double a one-run one', () => {
  const byMode = new Map();
  for (const m of roadmap.milestones) {
    if (!byMode.has(m.mode)) byMode.set(m.mode, []);
    byMode.get(m.mode).push(m);
  }
  let compared = 0;
  for (const [, list] of byMode) {
    const one = list.find((m) => / one /.test(m.effort));
    const two = list.find((m) => / 2 /.test(m.effort));
    if (!one || !two) continue;
    compared += 1;
    assert.equal(two.creditsHigh, one.creditsHigh * 2, 'the chip and the effort line disagree');
    assert.equal(two.creditsLow, one.creditsLow * 2);
  }
  assert.ok(compared > 0, 'no mode had both a one-run and a two-run milestone — nothing was compared');
});
