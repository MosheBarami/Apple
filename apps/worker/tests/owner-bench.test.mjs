/** The owner's benchmark evaluator's pure parts (owner-bench.ts). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'owner-bench-')), 'b.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'owner-bench.ts'), '--bundle', '--format=esm', '--platform=node', '--outfile=' + out, '--external:cloudflare:*'], { cwd: WORKER, stdio: 'pipe' });
const B = await import(`file://${out}`);

test('the census counts what a place holds by class', () => {
  const c = B.countTree({ class: 'Workspace', children: [{ class: 'Model', children: [{ class: 'Part' }, { class: 'MeshPart', children: [{ class: 'ParticleEmitter' }, { class: 'Sound' }] }, { class: 'Script' }, { class: 'Motor6D' }] }, { class: 'ScreenGui' }] },
    { parts: 0, scripts: 0, sounds: 0, animations: 0, fx: 0, screens: 0, lights: 0, truncated: false });
  assert.deepEqual([c.parts, c.scripts, c.sounds, c.animations, c.fx, c.screens], [2, 1, 1, 1, 1, 1]);
});

test('the camera looks at what was built from every angle', () => {
  for (const a of B.benchAngles([10, 5, -20], [12, 6, 8])) {
    const cf = B.lookAt(a.eye, [10, 5, -20]);
    const look = [-cf[5], -cf[8], -cf[11]];
    const to = [10 - a.eye[0], 5 - a.eye[1], -20 - a.eye[2]];
    const n = Math.hypot(...to);
    assert.ok(look.every((v, i) => Math.abs(v - to[i] / n) < 1e-9), `${a.name} looks at the centre`);
  }
});

test('the judge is read strictly and clamped to the rubric', () => {
  const ok = B.parseJudge('thinking... {"works":2,"professional":1,"matches":3,"polished":0,"noErrors":2,"performance":2,"sound":0,"animation":1,"fx":-1,"critique":["flat"]}');
  assert.deepEqual(ok.scores, { works: 2, professional: 1, matches: 2, polished: 0, noErrors: 2, performance: 2, sound: 0, animation: 1, fx: 0 });
  assert.deepEqual(ok.critique, ['flat']);
  assert.equal(B.parseJudge('{"works":2}'), null, 'a missing criterion is no score, never a guess');
  assert.match(B.judgePrompt('make me a duck', { parts: 3, scripts: 0, sounds: 0, animations: 0, fx: 0, screens: 0, lights: 0, truncated: false }, 'ok', 'done'), /make me a duck/);
});
