#!/usr/bin/env node
// One decisive token for "the whole suite passed".
//
// `pnpm -r test` prints per-package counts and exits non-zero on failure, but a gate needs a single
// success-only string that cannot appear in a partial run. Grepping for "fail 0" is not that: a run
// where five packages pass and one fails still contains "fail 0" five times.
//
// AND `pnpm -r test` IS NOT THE WHOLE SUITE. It recurses over workspace MEMBERS. Tests at the
// repository root are in no member, so `tests/gate-check.test.mjs` — the test of the program that
// decides whether every gate in GATES.md is met — ran nowhere near the gate that claims the suite
// passes. This is the same shape as the defect check-workspace-coverage.mjs exists for, one level
// out: not a package pnpm could not see, but a directory pnpm was never asked about. Both are run
// here now, and both are summed.
//
// DO NOT MAKE THIS DISCOVER TESTS BY WALKING DIRECTORIES. It invokes each package's own `test`
// script on purpose. `packages/corpus` holds the SCRAPED UPSTREAM REPOSITORIES the corpus ingests
// under `raw/`, and its script globs `src/**/*.test.mjs` to stay out of them. A bare `node --test`
// from that package finds 376 tests and fails 125 — every failure a third-party TypeScript test
// from a vendored repo that node cannot run without a loader, and that no change to this codebase
// can fix. Measured by rbxai-04, who ran exactly that command while verifying something else and
// got a convincing false regression in a neighbouring lane.
//
// That is the mirror of the staleness problem below: a red describing something other than the
// tree under test. Both have the same root — a result that does not say WHAT it measured — and a
// walker added here for convenience would make the false red permanent.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { treeFingerprint } from './lib/tree-fingerprint.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Root-level `*.test.mjs`. `tests/e2e` is Playwright and belongs to its own gate. */
const rootTests = readdirSync(join(ROOT, 'tests'))
  .filter((f) => f.endsWith('.test.mjs'))
  .map((f) => join('tests', f));

const fingerprintBefore = treeFingerprint(ROOT);

const run = (cmd, args) => {
  try {
    return { out: execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }), ok: true };
  } catch (e) {
    return { out: `${e.stdout ?? ''}${e.stderr ?? ''}`, ok: false };
  }
};

// A SUPERSET of root `pnpm test`, which is
// `node scripts/check-workspace-coverage.mjs && pnpm -r test`. Running only the second half here
// meant a gate could report SUITE GREEN while a workspace package had quietly dropped out of the
// recursion — which is the exact defect check-workspace-coverage.mjs exists to catch, skipped by
// the oracle that claims the suite passed.
// The escape-hatch checker runs HERE, not only inside its own test. A refuter found it was
// referenced by nothing — not this file, not root `pnpm test`, not CI — which under §2.3 makes it
// a dead end however good it is. Its own test builds a scratch clone and asserts the real tree is
// clean, so the content was checked indirectly; running it directly is what makes a violation in
// the live tree fail the suite rather than a copy of it.
const parts = [
  run('node', ['scripts/check-workspace-coverage.mjs']),
  run('node', ['scripts/check-escape-hatches.mjs']),
  run('node', ['scripts/check-deadends.mjs', '--gate']),
  run('pnpm', ['-r', 'test']),
];
// Skipped rather than passed vacuously if the directory holds none: an empty glob would make
// `node --test` exit non-zero and turn "no root tests" into "the suite is red".
if (rootTests.length) parts.push(run('node', ['--test', ...rootTests]));

let out = parts.map((p) => p.out).join('\n');
if (parts.some((p) => !p.ok)) {
  console.log(summarise(out));
  console.log('SUITE RED');
  process.exit(1);
}
const s = summarise(out);
console.log(s);
// Belt and braces: a zero exit AND no failure line anywhere.
const failures = [...out.matchAll(/fail (\d+)/g)].map((m) => Number(m[1])).filter((n) => n > 0);
if (failures.length || /SELFTEST FAIL/.test(out)) {
  console.log('SUITE RED');
  process.exit(1);
}
// The staleness check is LAST, after every other way of being red, so a run that is both stale and
// failing reports the failure — a red test is a fact about the code either way, while staleness
// only invalidates a green.
//
// THE SUCCESS OUTPUT IS DELIBERATELY UNCHANGED, and the fingerprint is NOT printed on it. Gate
// evidence records an output-sha256 and re-verification requires it to reproduce; a tree hash in
// the success line would differ on every commit, so the gate over this script would quarantine
// permanently and read as "cannot reproduce" when nothing was wrong. The hash is diagnostic, so it
// belongs only on the path that already fails.
const fingerprintAfter = treeFingerprint(ROOT);
if (fingerprintAfter !== fingerprintBefore) {
  console.log(`  tree ${fingerprintBefore} at start, ${fingerprintAfter} at end`);
  console.log('SUITE STALE — the working tree changed while the suite ran, so this result describes a tree that no longer exists. Re-run without editing.');
  process.exit(1);
}
console.log('SUITE GREEN');

function summarise(text) {
  const pass = [...text.matchAll(/pass (\d+)/g)].reduce((a, m) => a + Number(m[1]), 0);
  const fail = [...text.matchAll(/fail (\d+)/g)].reduce((a, m) => a + Number(m[1]), 0);
  return `  tests passed: ${pass}   failed: ${fail}`;
}
