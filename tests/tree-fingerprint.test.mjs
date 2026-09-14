// The test of the thing that decides whether a verification result is about the tree in front of
// you or a tree that has stopped existing.
//
// `gate-suite.mjs` reported SUITE GREEN 2867/0 while a test was failing, because it had passed that
// package before the edit landed. Nothing in its output could have told anybody. This module is the
// fix, so it needs tests for the same reason every oracle here does: its failure mode is to return
// the same digest for two different trees, which reads exactly like "nothing changed".
//
// Every case below builds a real git repository and measures the real function. There is no model
// of a working tree anywhere in this file — that substitution is the house defect.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { treeFingerprint } from '../scripts/lib/tree-fingerprint.mjs';

const DIRS = [];

/** A real repository with one committed file. */
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'treefp-'));
  DIRS.push(dir);
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  writeFileSync(join(dir, 'tracked.txt'), 'one\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'first');
  return dir;
}

const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });

/* --------------------------------------------------------------- it is stable --- */

test('an unchanged tree fingerprints the same twice — otherwise every run is "stale"', () => {
  // The control that makes every assertion below mean something. A function that simply returned a
  // fresh value each call would pass all the "it changes" tests and be useless.
  const dir = repo();
  assert.equal(treeFingerprint(dir), treeFingerprint(dir));
});

/* ------------------------------------------------------- it notices each change --- */

test('a commit changes it', () => {
  const dir = repo();
  const before = treeFingerprint(dir);
  writeFileSync(join(dir, 'tracked.txt'), 'two\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'second');
  assert.notEqual(treeFingerprint(dir), before);
});

test('an unstaged edit to a tracked file changes it — THE CASE THAT CAUSED F-61', () => {
  // This is exactly what happened: session.ts was edited, uncommitted, while the suite ran. HEAD
  // did not move and no file appeared, so anything keyed on those alone would have seen nothing.
  const dir = repo();
  const before = treeFingerprint(dir);
  writeFileSync(join(dir, 'tracked.txt'), 'edited\n');
  assert.notEqual(treeFingerprint(dir), before);
});

test('staging that edit changes it again — a staged tree is a third distinct state', () => {
  const dir = repo();
  writeFileSync(join(dir, 'tracked.txt'), 'edited\n');
  const unstaged = treeFingerprint(dir);
  git(dir, 'add', '-A');
  assert.notEqual(treeFingerprint(dir), unstaged);
});

test('a new untracked file changes it', () => {
  const dir = repo();
  const before = treeFingerprint(dir);
  writeFileSync(join(dir, 'new.test.mjs'), 'test\n');
  assert.notEqual(treeFingerprint(dir), before);
});

test('a file added inside an untracked DIRECTORY changes it', () => {
  // Why --untracked-files=all is not decoration. The default porcelain output collapses an
  // untracked directory to its name, so `scratch/` looks identical whether it holds one file or a
  // hundred — and a test file dropped in there would be invisible.
  const dir = repo();
  mkdirSync(join(dir, 'scratch'));
  writeFileSync(join(dir, 'scratch', 'a.mjs'), 'a\n');
  const before = treeFingerprint(dir);
  writeFileSync(join(dir, 'scratch', 'b.mjs'), 'b\n');
  assert.notEqual(treeFingerprint(dir), before);
});

test('editing an untracked file changes it, when the size moves', () => {
  const dir = repo();
  writeFileSync(join(dir, 'untracked.mjs'), 'short\n');
  const before = treeFingerprint(dir);
  writeFileSync(join(dir, 'untracked.mjs'), 'considerably longer content\n');
  assert.notEqual(treeFingerprint(dir), before);
});

test('deleting a tracked file changes it', () => {
  const dir = repo();
  const before = treeFingerprint(dir);
  rmSync(join(dir, 'tracked.txt'));
  assert.notEqual(treeFingerprint(dir), before);
});

/* ------------------------------------------------- and the hole is pinned open --- */

test('THE DOCUMENTED BLIND SPOT: a same-size, same-mtime untracked edit is NOT caught', () => {
  // Asserted rather than described, so the limitation cannot quietly become untrue or quietly
  // become worse. `git diff` knows nothing about untracked paths, so size and mtime stand in for
  // their content; forge both and the digest cannot move.
  //
  // If someone closes this by hashing untracked contents, this test fails and they update it
  // deliberately. That is the point: a known hole with a test on it is a decision, and a known hole
  // with only a comment on it is a thing everyone forgets.
  const dir = repo();
  const p = join(dir, 'untracked.mjs');

  // BOTH timestamps are forced through utimesSync, not just the second. Reading an mtime and
  // writing it back does NOT round-trip: a fresh write lands on 1789430110309.016 and utimesSync
  // restores 1789430110309, losing the sub-millisecond fraction. So the obvious fixture — write,
  // stat, rewrite, restore — moves the mtime by a fraction of a millisecond and the digest
  // correctly changes, which would have let this test claim the hole was closed when it is not.
  const FIXED = new Date(1_700_000_000_000);
  writeFileSync(p, 'aaaa\n');
  utimesSync(p, FIXED, FIXED);
  const st = statSync(p);
  const before = treeFingerprint(dir);

  writeFileSync(p, 'bbbb\n');
  utimesSync(p, FIXED, FIXED);
  assert.equal(statSync(p).size, st.size, 'the fixture must actually hold size constant');
  assert.equal(statSync(p).mtimeMs, st.mtimeMs, 'and mtime constant — otherwise this proves nothing');

  assert.equal(treeFingerprint(dir), before, 'this is the known limit, not a passing guard');
});

test('the scratch repositories are removed', () => {
  for (const d of DIRS) rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  DIRS.length = 0;
});
