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
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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
  const globs = [...ws.matchAll(/^\s*-\s*(\S+\/\*)\s*$/gm)].map((m) => m[1]);
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
  const SRC = /\.(luau|lua|ts|tsx|mjs|js)$/;
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
  const hasTest = typeof pkg.scripts?.test === 'string' && pkg.scripts.test.trim() !== '';
  if (hasTest) {
    covered.push(rel);
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
