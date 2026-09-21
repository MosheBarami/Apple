#!/usr/bin/env node
// Every workspace package that ships load-bearing source must be reachable from
// `pnpm -r test`.
//
// WHY THIS EXISTS. `apps/plugin` had no `package.json` for the whole of Phase IV. It
// is not a small package — Ops.luau is the single entry point for every mutation the
// agent performs in a user's place, and it owns the asset-policy window that decides
// which asset ids may be referenced — and `pnpm -r test`, the canonical verification
// command and the one CI runs, did not reach a line of it. Nothing reported that,
// because a directory pnpm cannot see produces no output at all: the suite was green
// and 2,901 lines of Luau were outside it.
//
// This derives the answer from the workspace rather than from a hand-maintained list,
// which is the F-57 lesson: a second list of "packages that should have tests" would
// drift out of agreement with the first exactly like `tasks.mjs` drifted out of
// agreement with `grade.mjs`. The globs below come from `pnpm-workspace.yaml`.
//
// A package may opt out ONLY by declaring why, in the file itself, beside its name.
// An opt-out that is merely absent is a failure.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// `--root <dir>` points the check at another tree. That exists so this file can be
// tested against fixtures: a checker whose own failure mode is a quiet pass is the
// defect it exists to catch, and until now nothing established that it still fails.
const rootArg = process.argv.indexOf('--root');
const ROOT = rootArg >= 0 && process.argv[rootArg + 1]
  ? resolve(process.argv[rootArg + 1])
  : join(dirname(fileURLToPath(import.meta.url)), '..');

// Directories that are workspace members but ship no logic a test could hold.
// Each needs a reason, and the reason has to be checkable by reading the directory.
const EXEMPT = {
  'apps/site': 'A static Astro marketing site: content and CSS, no logic. Its guarantee '
    + 'is the landing payload budget, enforced by scripts/check-landing-budget.mjs in the '
    + 'build job, and its build is a CI job in its own right.',
  'packages/shared': 'Type declarations and constants shared across packages. It has no '
    + 'runtime behaviour of its own; every consumer tests the behaviour it derives.',
};

/** Workspace member directories, expanded from pnpm-workspace.yaml's globs. */
function members() {
  const ws = readFileSync(join(ROOT, 'pnpm-workspace.yaml'), 'utf8');
  // Only the `packages:` block. The file also has `allowBuilds:` and
  // `minimumReleaseAgeExclude:` list items, and matching those would be nonsense.
  const block = /^packages:\n((?:\s+-\s*.*\n)+)/m.exec(ws);
  if (!block) throw new Error('no packages: block in pnpm-workspace.yaml');
  const entries = [...block[1].matchAll(/^\s*-\s*(.+?)\s*$/gm)]
    .map((m) => m[1].replace(/^['"]|['"]$/g, ''));   // quoted entries are valid YAML
  //[[ AN ENTRY THIS CANNOT EXPAND IS AN ERROR, NOT A SKIP.
  //
  //   The first version matched only unquoted globs ending in `/*` and dropped
  //   everything else silently, so `- 'apps/*'` — same meaning, still valid YAML, and
  //   the quoting style this very file already uses three lines lower — would have
  //   removed a whole tree from the check with no output. A checker whose failure mode
  //   is a quiet pass is the defect it exists to catch. ]]
  const globs = [];
  const unhandled = [];
  for (const e of entries) {
    if (/\/\*$/.test(e)) globs.push(e);
    else unhandled.push(e);
  }
  if (unhandled.length > 0) {
    throw new Error(
      `pnpm-workspace.yaml has package entries this check cannot expand: ${unhandled.join(', ')}. `
      + 'Teach it that shape rather than letting those packages go unchecked.',
    );
  }
  if (globs.length === 0) throw new Error('no package globs found in pnpm-workspace.yaml');
  const out = [];
  for (const glob of globs) {
    const base = join(ROOT, glob.slice(0, -2));
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) {
      const dir = join(base, name);
      if (!statSync(dir).isDirectory()) continue;
      out.push(dir);
    }
  }
  return out;
}

/** Source files whose behaviour a test could hold, ignoring the tests themselves. */
function sourceFileCount(dir) {
  // Widened after a review: a member whose source is Python or .jsx counted ZERO and
  // passed with no manifest at all. scripts/secret-scan.py makes .py live in this repo.
  const SRC = /\.(luau|lua|ts|tsx|mts|cts|mjs|cjs|js|jsx|py|rs|go|astro|vue|svelte)$/;
  const SKIP = new Set(['node_modules', 'dist', 'build', 'raw', '.astro', 'release', 'tests', 'test']);
  let n = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (SRC.test(e.name) && !/\.(test|spec)\./.test(e.name)) n += 1;
    }
  };
  walk(dir);
  return n;
}

const problems = [];
const covered = [];
const ALL = members();

// `apps/*` and `apps/benchmark/*` both match, so `apps/benchmark` is itself listed
// while being only a container for the real member beneath it. A directory that holds
// another member is not a package; its contents belong to that member.
const isContainer = (dir) => ALL.some((other) => other !== dir && other.startsWith(dir + '/'));

/**
 * Every test file a package OWNS, relative to it.
 *
 * Tracked files only, and vendored trees excluded. Walking the directory instead picked up 120
 * `.test.ts` files from `packages/corpus/raw/Quenty__NevermoreEngine` — third-party sources the
 * corpus ingests, which this repository neither runs nor should. A denominator that counts other
 * people's tests reports a gap that cannot be closed, and a finding nobody can act on gets muted.
 */
function testFilesIn(dir) {
  const rel = relative(ROOT, dir).replaceAll('\\', '/');
  let listed = '';
  try {
    listed = execFileSync('git', ['ls-files', `${rel}/*.test.mjs`, `${rel}/**/*.test.mjs`,
      `${rel}/*.test.ts`, `${rel}/**/*.test.ts`], { cwd: ROOT, encoding: 'utf8' });
  } catch { return []; }
  return listed.split('\n').filter(Boolean)
    .filter((f) => !f.includes('/raw/') && !f.includes('/node_modules/'))
    .map((f) => f.slice(rel.length + 1));
}

/**
 * Which of a package's test files a path in its test script reaches.
 *
 * Matched in JS rather than by asking a shell: macOS ships bash 3.2, which has no `globstar`, so
 * `**` there silently behaves as `*` and the answer would be wrong in the direction that reports
 * a gap where there is none.
 */
function reachedBy(pattern, files) {
  const p = pattern.replace(/^\.\//, '');
  // A bare directory means node discovers everything under it.
  if (!p.includes('*') && !p.includes('.test.')) return files.filter((f) => f.startsWith(p.replace(/\/$/, '') + '/'));

  // `**/` MATCHES ZERO DIRECTORIES as well as many — `src/**/*.test.mjs` covers src/chunk.test.mjs.
  // Treating it as "at least one directory" made this report a gap against the very glob that
  // fixes the gap, which is the sort of finding that gets a checker switched off.
  const esc = (x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  let rx = '';
  for (let i = 0; i < p.length; i += 1) {
    if (p.startsWith('**/', i)) { rx += '(?:[^/]+/)*'; i += 2; continue; }
    if (p.startsWith('**', i)) { rx += '.*'; i += 1; continue; }
    if (p[i] === '*') { rx += '[^/]*'; continue; }
    rx += esc(p[i]);
  }
  const re = new RegExp(`^${rx}$`);
  return files.filter((f) => re.test(f));
}

for (const dir of ALL) {
  if (isContainer(dir)) continue;
  const rel = relative(ROOT, dir).replaceAll('\\', '/');
  const manifest = join(dir, 'package.json');

  // A directory with sources and no manifest is invisible to pnpm entirely. This is
  // the exact shape of the defect: not a failing test, an absent one.
  if (!existsSync(manifest)) {
    const n = sourceFileCount(dir);
    if (n > 0) {
      problems.push(`${rel}: ${n} source file(s) and NO package.json, so \`pnpm -r test\` `
        + 'cannot see it at all. Add a manifest with a "test" script.');
    }
    continue;
  }

  const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
  //[[ A `test` script that cannot fail is not coverage.
  //
  //   This checked only for a non-empty string, so `"test": "true"` would pass. It now
  //   rejects the trivial no-ops. What it still CANNOT establish is whether the script
  //   runs anything: apps/plugin's own test exits 0 with a SKIPPED message when the
  //   Luau CLI is absent, so on a machine without it this reports the package covered
  //   while zero assertions run. CI installs Luau in the same job as `pnpm -r test`,
  //   so the CI claim is sound — but that is a fact about ci.yml, not something this
  //   file proves, and it is written down here rather than assumed. ]]
  const script = typeof pkg.scripts?.test === 'string' ? pkg.scripts.test.trim() : '';
  const hasTest = script !== '' && !['true', ':', 'exit 0', 'echo'].includes(script);
  if (hasTest) {
    covered.push(rel);

    //[[ A BARE DIRECTORY AFTER `node --test` RUNS ON MY MACHINE AND NOT ON THE RUNNER.
    //
    //   `@golem/lumen-isles` and `@golem/site` both shipped `"test": "node --test tests/"`. On
    //   Node 26 that discovers the directory and passes. On Node 22 — which is `NODE_VERSION` in
    //   ci.yml — the runner resolves `tests/` as a module specifier and dies before a single
    //   assertion:
    //
    //       Error: Cannot find module '/home/runner/.../apps/experiences/lumen-isles/tests'
    //
    //   `pnpm -r test` stops at the first failing package, so this also hid whether apps/site's
    //   274 tests would have run at all — they were never reached. It cost a red CI job that read
    //   like a missing directory, in a commit where the directory is plainly present.
    //
    //   Four other packages in this repository already write the file list (`node --test
    //   tests/*.test.mjs`), which the shell expands and every supported Node accepts. This makes
    //   that the rule rather than the convention. `node --test` with NO argument is still the best
    //   form and is untouched by this.
    for (const arg of script.split(/\s+/)) {
      if (arg.startsWith('-') || arg.includes('*') || arg === '') continue;
      const candidate = join(dir, arg.replace(/^["']|["']$/g, ''));
      if (existsSync(candidate) && statSync(candidate).isDirectory()) {
        problems.push(
          `${rel}: its "test" script passes the directory "${arg}" to node --test. `
          + `Node ${'22'} — ci.yml's NODE_VERSION — resolves that as a module and fails before any `
          + 'test runs, while a newer local Node discovers it and passes. Name the files '
          + '(`tests/*.test.mjs`) or drop the argument entirely.',
        );
      }
    }

    //[[ A TEST SCRIPT'S GLOB IS A DENOMINATOR, and an explicit one stops growing.
    //
    //   packages/corpus ran `node --test src/intake/*.test.mjs`. A new test written at
    //   src/chunk.test.mjs — covering 525 lines of heading and code-block splitting that had never
    //   been reachable — sat one directory above the glob and was never run by `pnpm -r test`. It
    //   passed locally when invoked by hand, which is the worst version: the author sees green.
    //
    //   This file already exists because a package fell out of the suite. A test file falling out
    //   of its own package is the same failure one level down, and it is quieter, because the
    //   package still reports a number and the number still goes up.
    //
    //   `node --test` with no path argument discovers recursively and cannot drift. A script that
    //   names paths is asked to account for every test file in its package.
    const named = script.match(/(?:"[^"]*\.test\.[a-z]+"|\S*\.test\.[a-z]+)/g);
    if (named) {
      const reached = new Set();
      const files = testFilesIn(dir);
      for (const raw of named) {
        for (const f of reachedBy(raw.replace(/"/g, ''), files)) reached.add(f);
      }
      const missed = files.filter((f) => !reached.has(f));
      if (missed.length) {
        problems.push(
          `${rel}: its "test" script names paths and misses ${missed.length} test file(s) — `
          + `${missed.slice(0, 3).join(', ')}${missed.length > 3 ? ', …' : ''}. `
          + 'Use `node --test` with no path so discovery cannot drift, or widen the glob.',
        );
      }
    }
    continue;
  }
  if (EXEMPT[rel]) continue;

  const n = sourceFileCount(dir);
  if (n > 0) {
    problems.push(`${rel}: ${n} source file(s) and no "test" script. Add one, or add an `
      + 'entry to EXEMPT in this file explaining why it needs none.');
  }
}

// An exemption for a package that no longer exists is a comment pretending to be a
// check, so it fails too.
const memberRels = new Set(ALL.map((d) => relative(ROOT, d).replaceAll('\\', '/')));
for (const rel of Object.keys(EXEMPT)) {
  if (!memberRels.has(rel)) {
    problems.push(`EXEMPT names "${rel}", which is not a workspace member any more. Remove it.`);
  }
}

if (problems.length > 0) {
  console.error('workspace coverage: FAILED');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`workspace coverage: ${covered.length} package(s) reachable from \`pnpm -r test\``);
console.log(`  ${covered.join(', ')}`);
console.log(`  exempt: ${Object.keys(EXEMPT).join(', ') || 'none'}`);
