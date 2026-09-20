/**
 * TESTS FOR THE CHECKER THAT WATCHES .github — scripts/check-ci-references.mjs.
 *
 * It was written because commit 04d3800 renamed a script and did not update the workflow, and
 * main was red for five days. It then had no test of its own, and it was not in any workflow, so
 * the guard against CI calling a file that is not there was reachable only from a script nothing
 * runs.
 *
 * The case that matters here is `an untracked script is not on the runner`. The checker used to
 * answer it with existsSync against the working directory while printing "in the tree", which is a
 * different claim about a different thing — and it is the same failure that let a rebrand fix pass
 * four checks locally while every CI run failed over it. A file you have and have not committed is
 * a file the runner does not have.
 *
 * Each test builds a throwaway git repository and runs the real checker against it through
 * CI_REFERENCES_ROOT, asserting the exit code, because the exit code is what CI reads.
 *
 * Run with:  node --test tests/check-ci-references.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHECKER = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'check-ci-references.mjs');

function repo({ git = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ci-refs-'));
  mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
  mkdirSync(join(root, 'scripts'), { recursive: true });
  if (git) {
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 't@example.invalid'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 't'], { cwd: root });
  }
  return root;
}

const workflow = (root, ref) =>
  writeFileSync(join(root, '.github', 'workflows', 'ci.yml'),
    `jobs:\n  a:\n    steps:\n      - run: node ${ref}\n`);

function run(root) {
  const r = spawnSync(process.execPath, [CHECKER], {
    encoding: 'utf8',
    env: { ...process.env, CI_REFERENCES_ROOT: root },
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

test('a tracked script that CI calls is a pass', (t) => {
  const root = repo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'scripts', 'thing.mjs'), '// x\n');
  workflow(root, 'scripts/thing.mjs');
  execFileSync('git', ['add', 'scripts/thing.mjs'], { cwd: root });

  const { code, out } = run(root);
  assert.equal(code, 0, out);
  assert.match(out, /git tracks every one of them/);
});

test('a script that exists on disk and is NOT tracked is a failure', (t) => {
  // The whole reason this checker was changed. It is on disk, so existsSync says yes and the
  // runner — which checks out the commit — does not have it.
  const root = repo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'scripts', 'thing.mjs'), '// x\n');
  workflow(root, 'scripts/thing.mjs');
  // deliberately not `git add`ed

  const { code, out } = run(root);
  assert.equal(code, 1, out);
  assert.match(out, /git does not track/);
  assert.match(out, /thing\.mjs/);
});

test('staging is enough — a script added in the same commit as the workflow is not a defect', (t) => {
  // The bar is the index, not HEAD. A checker that demands two commits gets run once.
  const root = repo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'scripts', 'thing.mjs'), '// x\n');
  workflow(root, 'scripts/thing.mjs');
  execFileSync('git', ['add', 'scripts/thing.mjs', '.github/workflows/ci.yml'], { cwd: root });

  assert.equal(run(root).code, 0);
});

test('a tracked script deleted from disk is a failure, and says which case it is', (t) => {
  const root = repo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'scripts', 'thing.mjs'), '// x\n');
  workflow(root, 'scripts/thing.mjs');
  execFileSync('git', ['add', 'scripts/thing.mjs'], { cwd: root });
  rmSync(join(root, 'scripts', 'thing.mjs'));

  const { code, out } = run(root);
  assert.equal(code, 1, out);
  assert.match(out, /tracks and which is not on disk/);
});

test('a checkout with no .github is reported as not checked, not as clean', (t) => {
  const root = repo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  rmSync(join(root, '.github'), { recursive: true, force: true });

  const { code, out } = run(root);
  assert.equal(code, 0, out);
  assert.match(out, /NOT CHECKED/, 'the absence of a thing to check is not a pass over a correct one');
});

test('workflows that reference no repository script at all are unreadable, not clean', (t) => {
  const root = repo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'jobs:\n  a:\n    steps:\n      - run: echo hi\n');

  const { code, out } = run(root);
  assert.equal(code, 2, out);
  assert.match(out, /UNREADABLE/);
});

test('a directory git cannot read is UNVERIFIED — never the stronger claim', (t) => {
  // A failure to measure must not render as a measurement. Without this the checker would fall
  // back to existsSync and print the sentence about tracking.
  const root = repo({ git: false });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'scripts', 'thing.mjs'), '// x\n');
  workflow(root, 'scripts/thing.mjs');

  const { code, out } = run(root);
  assert.equal(code, 2, out);
  assert.match(out, /UNVERIFIED/);
  assert.doesNotMatch(out, /git tracks every one of them/);
});
