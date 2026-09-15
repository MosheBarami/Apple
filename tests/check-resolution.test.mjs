// The test of the checker that asks whether the code under test is the code you think it is.
//
// Its failure mode is silence: a healthy tree produces no findings, so a checker that examined
// nothing looks exactly like a checker that found nothing. That is the shape this file guards —
// every case below plants a real symlink in a real scratch checkout and asks what the real
// checker says about it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECKER = join(ROOT, 'scripts', 'check-resolution.mjs');
const DIRS = [];

/** A scratch checkout with the checker in it, so ROOT resolves to the scratch tree. */
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'resolution-'));
  DIRS.push(dir);
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  mkdirSync(join(dir, 'apps', 'web', 'node_modules', '@golem'), { recursive: true });
  mkdirSync(join(dir, 'packages', 'shared'), { recursive: true });
  mkdirSync(join(dir, '.claude', 'worktrees', 'wt', 'packages', 'shared'), { recursive: true });
  writeFileSync(join(dir, 'packages', 'shared', 'index.ts'), 'export const x = 1;\n');
  cpSync(CHECKER, join(dir, 'scripts', 'check-resolution.mjs'));
  return dir;
}

function run(dir) {
  const p = spawnSync(process.execPath, [join(dir, 'scripts', 'check-resolution.mjs')], {
    cwd: dir, encoding: 'utf8', timeout: 120_000,
  });
  return { exit: p.status, out: `${p.stdout ?? ''}${p.stderr ?? ''}` };
}

/* ---------------------------------------------------------- it can be silent --- */

test('a healthy checkout reports SOUND, and says how many links it looked at', () => {
  // The control for everything below. Without a denominator, "no findings" and "no symlinks
  // examined" print the same word.
  const dir = scratch();
  symlinkSync(join(dir, 'packages', 'shared'), join(dir, 'apps', 'web', 'node_modules', '@golem', 'shared'), 'dir');
  const r = run(dir);
  assert.equal(r.exit, 0, r.out);
  assert.match(r.out, /RESOLUTION SOUND/);
  assert.match(r.out, /DENOMINATOR 1 symlink\(s\)/, 'it must say it examined exactly the one link');
});

/* ------------------------------------------------------------ the corruption --- */

test('THE DEFECT: a workspace link resolving into a worktree is caught', () => {
  // What happened tonight. @golem/shared in three packages and @golem/design in two were pointing
  // into a worktree, so every typecheck and test in the main tree was reading a frozen copy at an
  // old commit while reporting on this one.
  const dir = scratch();
  symlinkSync(
    join(dir, '.claude', 'worktrees', 'wt', 'packages', 'shared'),
    join(dir, 'apps', 'web', 'node_modules', '@golem', 'shared'),
    'dir',
  );
  const r = run(dir);
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /RESOLVES INTO A WORKTREE/);
  assert.match(r.out, /apps\/web\/node_modules\/@golem\/shared/);
  assert.match(r.out, /RESOLUTION BROKEN — 1 finding/);
});

test('a dangling link is caught — a link to nothing is not a dependency', () => {
  const dir = scratch();
  symlinkSync(join(dir, 'packages', 'gone'), join(dir, 'apps', 'web', 'node_modules', '@golem', 'shared'), 'dir');
  const r = run(dir);
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /DANGLING/);
});

/* ------------------------------------------ and the allowlist does not swallow --- */

test('THE ALLOWLIST CONTROL: an unexpected escape IS reported', () => {
  // Without this, an allowlist matching everything would pass the venv case AND the corruption,
  // and both of the tests around it would still be green.
  const dir = scratch();
  const outside = mkdtempSync(join(tmpdir(), 'resolution-outside-'));
  DIRS.push(outside);
  symlinkSync(outside, join(dir, 'apps', 'web', 'node_modules', '@golem', 'shared'), 'dir');
  const r = run(dir);
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /ESCAPES THE CHECKOUT/);
});

test('...while the venv interpreters, which must escape, do not trip it', () => {
  // These point at the uv-managed python and are correct. The pair of tests is the point: one
  // proves the allowlist admits what it should, the other proves it admits nothing else.
  const dir = scratch();
  const outside = mkdtempSync(join(tmpdir(), 'resolution-python-'));
  DIRS.push(outside);
  writeFileSync(join(outside, 'python3.12'), '#!/bin/sh\n');
  mkdirSync(join(dir, 'packages', 'training', '.venv', 'bin'), { recursive: true });
  symlinkSync(join(outside, 'python3.12'), join(dir, 'packages', 'training', '.venv', 'bin', 'python3.12'));
  const r = run(dir);
  assert.equal(r.exit, 0, r.out);
  assert.match(r.out, /RESOLUTION SOUND/);
  assert.match(r.out, /1 leave the checkout/, 'the escape is still COUNTED, just not a finding');
});

test('the scratch checkouts are removed', () => {
  for (const d of DIRS) rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  DIRS.length = 0;
});
