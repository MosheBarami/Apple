// One pixel metric, one implementation.
//
// WHY THIS FILE EXISTS (OH-6). `geometryMask`, `SKY_RGB` and `GROUND_RGB` were defined twice: in
// `apps/worker/src/composition.ts` and in `packages/evals/src/props.mjs`. One decides what the
// PRODUCT believes about a build, the other what the offline GRADER believes. A grader whose mask
// differs from the product's is a grader whose scores do not predict the product, which is the only
// reason it exists.
//
// No detector would have found it. Both copies had callers, so nothing was dead; both were correct,
// so nothing was red; and no test compared them, so the day they diverged nothing would have said
// so. That is the shape of drift that outlives every check aimed at absence — which is why the
// invariant here is aimed at DUPLICATION instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHARED = 'packages/design/src/pixels.mjs';

// Inspect the current checkout, including new source and excluding removed design files.
const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', '*.ts', '*.tsx', '*.mjs', '*.js'], {
  cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
}).split('\n').filter(rel => rel && existsSync(join(ROOT, rel)));
assert.ok(tracked.length > 50, 'source inventory must not silently become empty');

/**
 * IMPLEMENTATION sites — an `export function`/`export const`, never an import, re-export or call.
 *
 * `.d.ts` files are excluded deliberately: an ambient declaration is a description of the module,
 * not a second copy of it, and the worker needs one because the shared module is plain .mjs. That
 * declaration is the one seam the dedup could not remove, so it gets its own conformance test
 * below rather than being counted as drift here.
 */
function definitionsOf(name) {
  const decl = new RegExp(`^\\s*(?:export\\s+)?(?:function|const|let)\\s+${name}\\b`, 'm');
  return tracked.filter((rel) => {
    if (rel === 'tests/pixel-primitives.test.mjs' || rel.endsWith('.d.ts')) return false;
    const src = readFileSync(join(ROOT, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    return decl.test(src);
  });
}

for (const name of ['geometryMask', 'SKY_RGB', 'GROUND_RGB']) {
  test(`${name} is defined exactly once, in the shared module`, () => {
    const sites = definitionsOf(name);
    assert.deepEqual(sites, [SHARED], `${name} is defined in ${sites.length} place(s): ${sites.join(', ')}`);
  });
}

test('the two former copies now consume the shared module rather than redefining it', () => {
  // The positive control for the three assertions above. They would ALSO pass if both consumers
  // had simply deleted the code and stopped measuring anything — an absence check cannot tell
  // "deduplicated" from "removed".
  for (const rel of ['apps/worker/src/composition.ts', 'packages/evals/src/props.mjs']) {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    assert.match(src, /from '@golem\/design\/pixels'/, `${rel} must import the shared primitives`);
    assert.match(src, /geometryMask\(/, `${rel} must still actually USE the mask`);
  }
});

test('the ambient declaration the worker typechecks against matches the module it describes', () => {
  // The .d.ts is hand-written and is the one seam the dedup did not remove. If it drifts, the
  // worker typechecks against a shape the module does not have — which is OH-6 again, one layer
  // down and harder to see.
  const dts = readFileSync(join(ROOT, 'apps/worker/src/types/golem-pixels.d.ts'), 'utf8');
  const mod = readFileSync(join(ROOT, SHARED), 'utf8');
  for (const name of ['geometryMask', 'SKY_RGB', 'GROUND_RGB']) {
    assert.ok(dts.includes(name), `the declaration omits ${name}`);
    assert.ok(mod.includes(`export const ${name}`) || mod.includes(`export function ${name}`), `the module omits ${name}`);
  }
  const declared = [...dts.matchAll(/export (?:const|function) (\w+)/g)].map((m) => m[1]).sort();
  const actual = [...mod.matchAll(/export (?:const|function) (\w+)/g)].map((m) => m[1]).sort();
  assert.deepEqual(declared, actual, 'the declaration and the module export different names');
});
