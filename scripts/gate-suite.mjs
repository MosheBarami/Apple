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
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { treeFingerprint } from './lib/tree-fingerprint.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Root-level `*.test.mjs`. `tests/e2e` is Playwright and belongs to its own gate. */
const rootTests = readdirSync(join(ROOT, 'tests'))
  .filter((f) => f.endsWith('.test.mjs'))
  .map((f) => join('tests', f));

//[[ --at-head IS WITHDRAWN. I SHIPPED IT AND IT COULD CORRUPT THE SHARED CHECKOUT.
//
//   The problem it solves is real: with several sessions editing, the fingerprint moved three
//   times in nine seconds, so the suite can never finish over a still tree and G90 can never go
//   green however healthy the suite is. Running at a commit in a detached worktree is the right
//   shape and rbxai-04 measured it working — 780/780 at HEAD while the same suite on disk was
//   1468 pass / 4 fail.
//
//   What I built was not that. It symlinked the MAIN checkout's node_modules INTO an in-repo
//   worktree and then ran `pnpm -r test` there, which makes the two trees share one set of module
//   directories — so anything pnpm writes while resolving inside the worktree lands in the
//   checkout every other session is using. Five workspace links (@golem/shared in web, site and
//   worker; @golem/design in worker and evals) were found pointing into a worktree tonight, and
//   for some window every typecheck and test in the main tree was reading a frozen copy at an old
//   commit. I cannot prove my run caused it and I am not going to claim it did not.
//
//   The falsification harness has used in-repo worktrees all night without incident, because it
//   never symlinks node_modules and never invokes pnpm. That is the difference, and it is the
//   whole difference.
//
//   The safe shape, for whoever builds it next: put the worktree OUTSIDE the repository, so its
//   own pnpm-workspace.yaml is the nearest workspace root rather than the main one, and give it
//   its OWN modules via `pnpm install --offline` from the shared store. Never share module
//   directories between two trees that both run pnpm.
//
//   Tommy's phrasing is the one worth keeping: a dead harness gives a WRONG number about the RIGHT
//   tree; this gives a RIGHT number about the WRONG tree. Every habit built today inspects the
//   measurement. None of them inspects the RESOLUTION. ]]

const fingerprintBefore = treeFingerprint(ROOT);

const run = (cmd, args, opts = {}) => {
  try {
    return { out: execFileSync(cmd, args, { cwd: opts.cwd ?? ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }), ok: true };
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
//[[ EVERY PART IS LABELLED, BECAUSE `SUITE RED` ALONE CANNOT BE ACTED ON.
//
//   This printed one line — SUITE RED — and nothing about WHICH of five parts failed. Two of us
//   spent real time on a red run that turned out to be a checker rather than a test, and neither
//   could tell from the output; I only found it by re-running the parts by hand. A verdict that
//   cannot say what produced it sends whoever reads it back to the beginning.
//
//   The labels are printed on failure with a tail of the offending output, which is the smallest
//   thing that turns "the suite is red" into somewhere to look. ]]
const parts = [
  { label: 'check-workspace-coverage', ...run('node', ['scripts/check-workspace-coverage.mjs']) },
  { label: 'check-escape-hatches', ...run('node', ['scripts/check-escape-hatches.mjs']) },
  { label: 'check-deadends', ...run('node', ['scripts/check-deadends.mjs', '--gate']) },
  // The competitor teardown. It was a script nobody ran, which is how it came to report
  // "clean" over two of the site's six stylesheets while an 86px h1 and a 144px numeral sat in
  // the four it never opened. A guard outside the suite is a guard that has already gone stale.
  { label: 'check-copy', ...run('node', ['scripts/check-copy.mjs']) },
  // The three numbers a visitor is invited to check. One of them was false on both halves
  // while a comment above it named a test that had never been written.
  { label: 'check-proof-figures', ...run('node', ['scripts/check-proof-figures.mjs']) },
  // 57,049 rows were refused by an ingest that ran for half an hour before saying so, and the
  // rejects print at the end. This predicts the run in seconds, per source, before it starts.
  { label: 'check-harvest-licences', ...run('node', ['scripts/check-harvest-licences.mjs']) },
  //[[ THE BUILD IS A CHECK, AND NOTHING HERE WAS RUNNING IT.
  //
  //   `tsc --noEmit` passed over a settings.tsx carrying a JSX comment in expression position —
  //   `{cond && ( {/* … */} <div>` — which is a hard syntax error to esbuild. The typecheck was
  //   green, the tests were green, the commit landed, and the SPA did not build. The bundle
  //   deployed to production was the previous one, silently, because the uploader ships whatever
  //   is in dist/ and dist/ still held the last successful build.
  //
  //   That is the worst shape a failure can take here: every gate green, the deploy reporting
  //   success, and the change simply not present. Typecheck and tests both answer questions about
  //   the code; only the build answers whether it can be shipped.
  { label: 'build site', ...run('npx', ['astro', 'build'], { cwd: join(ROOT, 'apps', 'site') }) },
  { label: 'build web', ...run('npx', ['vite', 'build'], { cwd: join(ROOT, 'apps', 'web') }) },
  { label: 'pnpm -r test', ...run('pnpm', ['-r', 'test']) },
];
// Skipped rather than passed vacuously if the directory holds none: an empty glob would make
// `node --test` exit non-zero and turn "no root tests" into "the suite is red".
if (rootTests.length) parts.push({ label: `root tests (${rootTests.length} files)`, ...run('node', ['--test', ...rootTests]) });

let out = parts.map((p) => p.out).join('\n');
const broken = parts.filter((p) => !p.ok);
if (broken.length) {
  console.log(summarise(out));
  for (const b of broken) {
    const lines = b.out.split('\n').filter((l) => l.trim());
    console.error(`  FAILED: ${b.label}`);
    // The last few lines carry the verdict for a checker and the failure list for a test run.
    for (const l of lines.slice(-6)) console.error(`    ${l.slice(0, 160)}`);
  }
  console.log(`SUITE RED — ${broken.map((b) => b.label).join(', ')}`);
  process.exit(1);
}
const s = summarise(out);
console.log(s);
// Belt and braces: a zero exit AND no failure line anywhere.
const failures = [...out.matchAll(/fail (\d+)/g)].map((m) => Number(m[1])).filter((n) => n > 0);
if (failures.length || /SELFTEST FAIL/.test(out)) {
  // A part exited 0 while reporting failures inside its own output — so the label above cannot
  // name it, and the failing test names are the only thing that can.
  for (const line of out.split('\n')) {
    if (/^\s*✖|SELFTEST FAIL/.test(line)) console.error(`    ${line.trim().slice(0, 160)}`);
  }
  console.log(`SUITE RED — ${failures.reduce((a, b) => a + b, 0)} failing test(s) reported by a part that still exited 0`);
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
