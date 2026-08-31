// The regression the mission asked for by name: "tavern interior -> cottage exterior" must fail,
// and must fail at the BLOCKOUT, before any detail is paid for.
//
// The two layouts below are not invented. They were built in live Roblox Studio on 2026-08-31 as the
// two readings of the same brief and captured through the same SceneLayout wire format the plugin
// sends, so the numbers here are the numbers production sees.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..', '..', '..', 'apps', 'worker');
const dest = join(tmpdir(), `golem-semantic-${process.pid}.mjs`);
execFileSync(
  join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'semantic.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${dest}`],
  { stdio: 'pipe', cwd: WORKER },
);
const S = await import(`file://${dest}`);
rmSync(dest, { force: true });

/** Captured from live Studio: a room you stand inside. */
const TAVERN_INTERIOR = [
  [0, 0.5, 0, 40, 1, 30, 0], [0, 12.5, 0, 40, 1, 30, 0],
  [-20, 6.5, 0, 1, 12, 30, 0], [20, 6.5, 0, 1, 12, 30, 0],
  [0, 6.5, -15, 40, 12, 1, 0], [0, 6.5, 15, 40, 12, 1, 0],
  [-8, 3, -10, 16, 4, 2, 0],
  [-11, 2, -7, 1.5, 3, 1.5, 0], [-8, 2, -7, 1.5, 3, 1.5, 0], [-5, 2, -7, 1.5, 3, 1.5, 0], [-2, 2, -7, 1.5, 3, 1.5, 0],
  [10, 2.5, 5, 6, 0.4, 6, 0], [18, 4, 10, 4, 7, 3, 0],
];

/** Captured from live Studio: a cottage standing on open ground — what the agent actually built. */
const COTTAGE_EXTERIOR = [
  [200, 0.5, 0, 90, 1, 90, 0], [200, 5.5, 0, 18, 10, 14, 0],
  [200, 11.5, 0, 22, 1, 18, 0], [200, 12.5, 0, 20, 1, 16, 0],
  [192, 2, 22, 2, 3, 2, 0], [198, 2, 22, 2, 3, 2, 0], [204, 2, 22, 2, 3, 2, 0], [210, 2, 22, 2, 3, 2, 0],
  [224, 3, -20, 4, 5, 4, 0],
];

const B4_PROMPT =
  'Build a cosy tavern interior in game.Workspace: walls with a doorway and windows, a wooden floor, ' +
  'a bar counter with stools, tables and chairs, a fireplace, and warm interior lighting. Make it look good.';

test('THE REGRESSION: a tavern-interior brief answered with a cottage exterior fails', () => {
  const c = S.semanticCheck(B4_PROMPT, COTTAGE_EXTERIOR);
  assert.equal(c.requested, 'interior');
  assert.ok(c.failures.length > 0, 'the mismatch must be caught');
  assert.match(c.failures[0], /asked for an INTERIOR but this is built as an exterior/);
});

test('the same brief answered with an actual interior passes', () => {
  const c = S.semanticCheck(B4_PROMPT, TAVERN_INTERIOR);
  assert.equal(c.requested, 'interior');
  assert.deepEqual(c.failures, [], 'a real interior must not be rejected');
});

test('the separation is wide, not marginal', () => {
  const inside = S.enclosure(TAVERN_INTERIOR).coveredFloorRatio;
  const outside = S.enclosure(COTTAGE_EXTERIOR).coveredFloorRatio;
  assert.ok(inside >= 0.9, `interior coverage ${inside} should be near total`);
  assert.ok(outside <= 0.15, `exterior coverage ${outside} should be small`);
  assert.ok(inside > outside * 5, 'the two must be far apart, not adjacent');
  // Both thresholds must sit inside the gap, or the gate is fitted to one example.
  assert.ok(S.ENCLOSURE_GATES.interiorMin > outside && S.ENCLOSURE_GATES.interiorMin < inside);
});

test('ceiling height alone does NOT separate them — coverage is the signal', () => {
  // 12 vs 11 studs. A gate built on ceiling height would have passed the cottage.
  const a = S.enclosure(TAVERN_INTERIOR).ceilingHeight;
  const b = S.enclosure(COTTAGE_EXTERIOR).ceilingHeight;
  assert.ok(Math.abs(a - b) < 3, `heights ${a} and ${b} are too close to distinguish`);
});

test('an unstated request is measured but never gated', () => {
  // "Build a tavern" is genuinely ambiguous. Guessing would reject correct work.
  const c = S.semanticCheck('Build a tavern. Make it look good.', COTTAGE_EXTERIOR);
  assert.equal(c.requested, 'unstated');
  assert.deepEqual(c.failures, []);
});

test('a brief naming both sides is treated as unstated rather than adjudicated', () => {
  assert.equal(S.requestedEnclosure('a shop interior opening onto a garden'), 'unstated');
});

test('explicit exterior requests are gated the other way', () => {
  assert.equal(S.requestedEnclosure('Build a town plaza with a monument'), 'exterior');
  const c = S.semanticCheck('Build a town plaza with a monument', TAVERN_INTERIOR);
  assert.ok(c.failures.length > 0, 'a sealed room is not a plaza');
  assert.match(c.failures[0], /built as an enclosed room/);
});

test('empty geometry yields no verdict rather than a false one', () => {
  assert.equal(S.semanticCheck(B4_PROMPT, []), null);
  assert.equal(S.semanticCheck(B4_PROMPT, undefined), null);
});

// ---------------------------------------------------------------------------------------------
// Rebuild trigger
// ---------------------------------------------------------------------------------------------

const pass = (sig, score, parts) => ({ signature: sig, score, parts });

test('THE b4 CASE: a correction pass that changed nothing triggers a rebuild', () => {
  // Round 2 returned the same part/material/light counts and the same critique, defect for defect.
  const sig = S.sceneSignature(COTTAGE_EXTERIOR);
  const v = S.shouldRebuild([pass(sig, 4, 351), pass(sig, 4, 351)]);
  assert.equal(v.rebuild, true);
  assert.match(v.reason, /changed nothing/);
});

test('a semantic mismatch triggers a rebuild immediately, not after three passes', () => {
  const v = S.shouldRebuild([pass('a', 4, 100)], 1);
  assert.equal(v.rebuild, true);
  assert.match(v.reason, /not the thing that was asked for/);
});

test('adding parts without improving the score triggers a rebuild', () => {
  // The reflex the composition work already falsified, now caught inside the loop.
  const v = S.shouldRebuild([pass('a', 5, 200), pass('b', 5, 600)]);
  assert.equal(v.rebuild, true);
  assert.match(v.reason, /added 400 parts/);
});

test('three flat passes trigger a rebuild', () => {
  const v = S.shouldRebuild([pass('a', 5, 100), pass('b', 5, 120), pass('c', 6, 140)]);
  assert.equal(v.rebuild, true);
  assert.match(v.reason, /stopped paying/);
});

test('genuine improvement does NOT trigger a rebuild', () => {
  assert.equal(S.shouldRebuild([pass('a', 4, 100), pass('b', 7, 130)]).rebuild, false);
  assert.equal(S.shouldRebuild([pass('a', 4, 100)]).rebuild, false, 'one pass is never enough to judge');
  assert.equal(S.shouldRebuild([]).rebuild, false);
});

test('the scene signature moves when the scene moves and holds when it does not', () => {
  assert.equal(S.sceneSignature(COTTAGE_EXTERIOR), S.sceneSignature(COTTAGE_EXTERIOR));
  assert.notEqual(S.sceneSignature(COTTAGE_EXTERIOR), S.sceneSignature(TAVERN_INTERIOR));
  assert.equal(S.sceneSignature([]), 'empty');
  assert.equal(S.sceneSignature(undefined), 'empty');
  assert.notEqual(S.sceneSignature(COTTAGE_EXTERIOR), S.sceneSignature(COTTAGE_EXTERIOR.slice(1)));
});
