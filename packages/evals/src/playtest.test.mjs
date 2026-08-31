// Regression tests for playtest safety.
//
// The hazard these lock out was reproduced in live Studio on 2026-08-31: `RunService:Run()` executes
// server scripts against the EDIT DataModel and `Stop()` does not revert them, so a startup script
// that destroys instances destroys the user's committed work permanently. The script-free control
// case is harmless; the scripted case lost two objects and never got them back.
//
// What is protected here is the DECISION LOGIC — when to take a checkpoint, and what counts as
// destruction. The end-to-end restore is proven separately against live Studio, because no unit test
// can stand in for Roblox's own semantics.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const WORKER = join(REPO, 'apps', 'worker');

const dest = join(tmpdir(), `golem-playtest-${process.pid}.mjs`);
execFileSync(
  join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'playtest.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${dest}`],
  { stdio: 'pipe', cwd: WORKER },
);
const P = await import(`file://${dest}`);
rmSync(dest, { force: true });

const census = (o = {}) => ({
  instances: 100, parts: 40, scripts: 5,
  services: { Workspace: 60, ServerScriptService: 5, Lighting: 2 },
  topLevel: ['Baseplate', 'Plaza', 'Terrain'],
  ...o,
});

test('the live reproduction case is detected: top-level objects destroyed', () => {
  // Literally what happened: ReproB and ReproModel vanished across a Run/Stop cycle.
  const before = census({ topLevel: ['Baseplate', 'Camera', 'ReproA', 'ReproB', 'ReproModel', 'Terrain'], parts: 6 });
  const after = census({ topLevel: ['Baseplate', 'Camera', 'ReproA', 'Terrain'], parts: 2 });
  const lost = P.destructiveDelta(before, after);
  assert.ok(lost.length > 0, 'the reproduced loss must be detected');
  assert.match(lost.join(' '), /ReproB/);
  assert.match(lost.join(' '), /parts destroyed/);
});

test('a playtest that only ADDS instances is not a loss and must not roll back', () => {
  // A running game spawns things. Rolling that back would make playtesting useless.
  const before = census();
  const after = census({ instances: 180, parts: 95, topLevel: ['Baseplate', 'Plaza', 'Terrain', 'Projectile'] });
  assert.deepEqual(P.destructiveDelta(before, after), []);
});

test('small churn inside a service is tolerated, a quarter of it is not', () => {
  const before = census({ services: { Workspace: 60 } });
  assert.deepEqual(P.destructiveDelta(before, census({ services: { Workspace: 57 } })), []);
  assert.ok(P.destructiveDelta(before, census({ services: { Workspace: 40 } })).length > 0);
});

test('a tiny service is not judged by the percentage rule', () => {
  // 2 -> 1 is 50% but means nothing; the rule needs at least 8 descendants to have an opinion.
  const before = census({ services: { Lighting: 2 }, topLevel: ['Baseplate'] });
  const after = census({ services: { Lighting: 1 }, topLevel: ['Baseplate'] });
  assert.deepEqual(P.destructiveDelta(before, after), []);
});

test('a place with real work in it is always protected first', () => {
  assert.equal(P.needsProtection(census({ instances: 100 })), true);
  assert.equal(P.needsProtection(census({ instances: P.CHECKPOINT_FLOOR_INSTANCES })), true);
});

test('an essentially empty place is not checkpointed — there is nothing to lose', () => {
  // Also the b3-plaza case: the agent never built anything, so a full snapshot would be pure cost.
  assert.equal(P.needsProtection(census({ instances: 3 })), false);
});

test('an unreadable census is treated as "protect", never as "nothing to lose"', () => {
  assert.equal(P.needsProtection(null), true);
  assert.equal(P.parseCensus('not json'), null);
  assert.equal(P.parseCensus(undefined), null);
  assert.equal(P.parseCensus({}), null);
  assert.equal(P.parseCensus({ instances: 'many' }), null);
});

test('the census parses the shapes run_code actually returns', () => {
  // {t,v} is the REAL one and it is the one that was missing. The plugin runs every run_code return
  // through Paths.encode, which wraps a string as {"t":"string","v":"..."}. The first version of
  // parseCensus handled only {result} and a bare string, so against the live plugin it returned
  // null, the delta was never computed, and a live playtest destroyed 14 parts while "protected".
  // Every unit test passed. This case is why the end-to-end proof was not optional.
  const json = '{"instances":9,"parts":4,"scripts":1,"services":{"Workspace":9},"topLevel":["A","B"]}';
  for (const shape of [json, JSON.parse(json), { result: json }, { result: JSON.parse(json) },
                       { t: 'string', v: json }, { t: 'string', v: JSON.parse(json) },
                       // the shape live Studio actually returns, captured from the wire
                       { result: { v: json, t: 'string' }, prints: [] },
                       { data: { result: { v: json, t: 'string' }, prints: [] } }]) {
    const c = P.parseCensus(shape);
    assert.ok(c, `failed to parse ${JSON.stringify(shape).slice(0, 40)}`);
    assert.equal(c.instances, 9);
    assert.equal(c.parts, 4);
    assert.deepEqual(c.topLevel, ['A', 'B']);
  }
});

test('the census script is Luau that only counts and returns', () => {
  assert.match(P.CENSUS_LUAU, /^\s*local svc = \{/);
  assert.match(P.CENSUS_LUAU, /return string\.format/);
  assert.equal(P.CENSUS_LUAU.includes('RunService'), false, 'the census must not touch run state');
  assert.equal(/:Destroy\(\)|:Remove\(\)|\.Parent\s*=/.test(P.CENSUS_LUAU), false, 'the census must never mutate');
});
