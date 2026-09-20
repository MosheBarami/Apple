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
  //[[ A GATE THAT NAMES A SCRIPT WHICH IS NOT IN THE TREE IS NOT A FAILED CHECK.
  //
  //   check-harvest-licences stayed in this list after its whole subject was deleted on the
  //   owner's decision, and every run reported it exactly as if it had run and found something: a
  //   node stack ending in MODULE_NOT_FOUND, printed under a label that reads like a finding about
  //   asset licences. Somebody then goes looking for a licensing defect that cannot exist, in data
  //   that is no longer in the repository.
  //
  //   Those are two different states and they must not print the same. This one says which. ]]
  if (cmd === 'node' && typeof args?.[0] === 'string' && args[0].endsWith('.mjs')
      && !existsSync(join(opts.cwd ?? ROOT, args[0]))) {
    return {
      ok: false,
      out: `${args[0]} IS NOT IN THE TREE.\n\n`
        + 'This gate names a script that does not exist, so it has checked NOTHING. That is a broken\n'
        + 'entry in this suite, not a defect in whatever the label says it covers — do not read it as\n'
        + 'a finding. Restore the script, or delete the entry along with the thing it guarded.',
    };
  }
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
  //[[ FIRST, BECAUSE EVERYTHING AFTER IT IS A CLAIM ABOUT WHICHEVER TREE THE LINKS POINT AT.
  //
  //   F-68 happened a second time today: fourteen agents worked in `.claude/worktrees/` and this
  //   checkout's `@golem/shared` came back pointing at one of them. tsc then reported a missing
  //   export for a function on line 1164 of the real file and eighteen worker tests failed — every
  //   message true about the package it was reading and false about this repository. An hour went
  //   into reading correct code looking for a defect that was not in it.
  //
  //   It is the cheapest check here and it gates the meaning of every other one.
  { label: 'check-module-resolution', ...run('node', ['scripts/check-module-resolution.mjs']) },
  { label: 'check-workspace-coverage', ...run('node', ['scripts/check-workspace-coverage.mjs']) },
  { label: 'check-escape-hatches', ...run('node', ['scripts/check-escape-hatches.mjs']) },
  { label: 'check-deadends', ...run('node', ['scripts/check-deadends.mjs', '--gate']) },
  //[[ THE RENAME. WRITTEN, CORRECT, AND NEVER ONCE RUN BY ANYTHING.
  //
  //   check-rebrand.mjs has exited 1 since the day it was written and no gate, no npm script and
  //   no CI job invoked it, so its exit code carried no weight at all — drift landed on 2026-09-19
  //   and nothing noticed. It is the thing the owner has asked for more times than anything else in
  //   this repository, and the enforcement was a program nobody called.
  //
  //   --offline ON PURPOSE. The full check fetches the live origin to date its capture, and a gate
  //   that needs the network is a gate that goes red for reasons that are not about the code. The
  //   offline half is the DETERMINISTIC one and it is the half that catches source drift, which is
  //   what landed unobserved. Its success line says "IN SOURCE … THE DEPLOYED SITE WAS NOT CHECKED"
  //   rather than claiming the deployed site, so the narrower run cannot be misread as the wide one.
  //   The deployed half belongs on the deploy path: `node scripts/check-rebrand.mjs --deployed`.
  { label: 'check-rebrand', ...run('node', ['scripts/check-rebrand.mjs', '--offline']) },
  // The competitor teardown. It was a script nobody ran, which is how it came to report
  // "clean" over two of the site's six stylesheets while an 86px h1 and a 144px numeral sat in
  // the four it never opened. A guard outside the suite is a guard that has already gone stale.
  { label: 'check-copy', ...run('node', ['scripts/check-copy.mjs']) },
  // The three numbers a visitor is invited to check. One of them was false on both halves
  // while a comment above it named a test that had never been written.
  { label: 'check-proof-figures', ...run('node', ['scripts/check-proof-figures.mjs']) },
  //[[ TWENTY-THREE TOOLS WERE POINTED AT THE PRE-RENAME WORKER.
  //   `.env` held API_BASE=golem.moshe-barami111.workers.dev, and infra/e2e.mjs, infra/smoke.mjs,
  //   infra/checkpoint-test.mjs, packages/evals/src/run.mjs and eighteen others read it — so the
  //   E2E suite, the smoke test and the eval harness were all exercising the OLD deployment while
  //   reporting on "the product". It hides because the legacy host's page routes 308 to the
  //   canonical origin and /api/* deliberately does not: the site looks current and the admin calls
  //   land somewhere else. It cost four deploys on 2026-09-20 chasing a 500 that only the old
  //   worker returned. ]]
  { label: 'check-api-base', ...run('node', ['scripts/check-api-base.mjs']) },
  //[[ CI CALLED A SCRIPT THAT HAD BEEN RENAMED, AND WAS RED FOR FIVE DAYS.
  //   04d3800 renamed check-spark-figures.mjs to check-credit-figures.mjs on 2026-09-15 and did not
  //   update .github/workflows. Every run on main failed from that day. Nobody saw it because a
  //   rename is the change that looks finished: grepping the OLD name comes back empty, which reads
  //   as "no references left" and is actually "none in the places I grepped". .github is outside
  //   apps/, packages/ and scripts/. A local suite cannot catch it by RUNNING; it has to read. ]]
  { label: 'check-ci-references', ...run('node', ['scripts/check-ci-references.mjs']) },
  //[[ check-harvest-licences WENT WITH ITS SUBJECT, and this note is what is left of it.
  //
  //   It predicted, in seconds, what fraction of an asset ingest `validateProvenance` was going to
  //   refuse — written after 57,049 Kenney rows were rejected by a run that took half an hour and
  //   printed its rejects at the end. Every single thing it touched was deleted in ac82f9c on the
  //   owner's decision: asset-seeds.json, packages/corpus/data/library/, asset-library.ts (which it
  //   compiled to borrow the real validator rather than restate its rules), and the ingest itself.
  //   Its entry outlived them by a few hours and reported MODULE_NOT_FOUND under a label that read
  //   like a licence finding.
  //
  //   It is NOT re-aimed at the remaining harvesters. harvest-hf, harvest-roblox-knowledge and
  //   harvest-templates feed the training corpus, not a D1 asset catalogue, and pointing a
  //   Creator-Store licence gate at them would be inventing coverage rather than keeping it. The
  //   asset library is not to be rebuilt; see the commit. ]]
  //[[ THE CODE AND THE DATABASE SCHEMA, COMPARED.
  //
  //   Three migrations were written, committed, reviewed and shipped without ever being applied,
  //   and the owner's dashboard said "column projects.archived_at does not exist". tsc passed,
  //   1,306 web tests passed, both builds passed — every one of them a statement about the code
  //   rather than the database it talks to. This catches the half that is reachable offline: a
  //   column the client asks for that no migration creates. It cannot tell whether a migration has
  //   been APPLIED, and says so.
  { label: 'check-schema-drift', ...run('node', ['scripts/check-schema-drift.mjs']) },
  //[[ FOUR PANELS SHIPPED WITH NO STYLESHEET AT ALL.
  //
  //   `grep -c 'rk__' styles.css` returned 0, and so did `gx-ev`. Both are built from <span>s, so
  //   with no rules every span stayed inline and the owner read
  //   "Read your assetsApple can look up things you already own" on his own settings page. A
  //   selector that matches nothing fails no typecheck, no test and no build.
  { label: 'check-unstyled-classes', ...run('node', ['scripts/check-unstyled-classes.mjs']) },
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
