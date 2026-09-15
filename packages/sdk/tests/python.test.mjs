// The Python client's own suite, driven from `node --test` so `pnpm -r test` reaches it.
//
// WHY A BRIDGE AND NOT A SEPARATE COMMAND. `scripts/check-workspace-coverage.mjs` exists
// because a package pnpm could not see had 2,901 lines outside the suite for a whole
// phase. A Python client whose tests only run when somebody remembers to type
// `python3 -m unittest` is the same hole one level down: the package would report covered
// while its Python half ran nothing.
//
// A MISSING INTERPRETER SKIPS LOUDLY — it never passes. `t.skip` renders as skipped in the
// summary, which is the honest rendering of "this was not measured". Reporting a pass for
// a suite that did not run is the exact failure this repository is organised against.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PY_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'python');

function interpreter() {
  for (const candidate of ['python3', 'python']) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'pipe' });
      return candidate;
    } catch {
      /* try the next one */
    }
  }
  return null;
}

test('the Python client suite passes', (t) => {
  const python = interpreter();
  if (!python) {
    t.skip('no python3 on this machine — the Python client was NOT measured here');
    return;
  }
  const res = spawnSync(python, ['-m', 'unittest', 'discover', '-s', 'tests', '-t', '.'], {
    cwd: PY_DIR,
    encoding: 'utf8',
  });
  const output = `${res.stdout}\n${res.stderr}`;
  const ran = /^Ran (\d+) tests?/m.exec(output);

  // THE COUNT IS ASSERTED, not just the exit code. `unittest` exits 0 and prints OK for an
  // empty suite, so a discovery pattern that stopped matching would report success while
  // measuring nothing — which is precisely the shape of failure this file is guarding.
  assert.ok(ran, `could not read a test count from unittest:\n${output}`);
  const count = Number(ran[1]);
  assert.ok(count >= 20, `the Python suite ran only ${count} tests — discovery is broken`);
  assert.equal(res.status, 0, `python tests failed:\n${output}`);
  assert.match(output, /\nOK\b/, `unittest did not report OK:\n${output}`);
});
