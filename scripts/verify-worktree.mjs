#!/usr/bin/env node
// Build the throwaway checkout the full-suite gate runs in, correctly, every time.
//
// WHY A SCRIPT AND NOT SIX SHELL LINES. Every part of this encodes something that was learned by
// getting it wrong, and each one produced a WRONG VERDICT rather than an error — which is the only
// kind of mistake a verification tool cannot afford:
//
//   1. OUTSIDE THE REPOSITORY. docs/FAILURES.md F-68: `pnpm install` inside an in-repo worktree
//      rewrote the MAIN checkout's fifteen node_modules symlinks to point into the worktree, which
//      was then deleted. Repair took three attempts. A worktree under /tmp has been measured to
//      have no effect on the main tree.
//
//   2. THE WORKING LOCKFILE, NOT THE COMMITTED ONE. The committed pnpm-lock.yaml does not satisfy
//      the committed package.json — `@golem/evals` was added as a dependency without updating it —
//      so `--frozen-lockfile` fails in a fresh checkout. That is a real repository defect and this
//      script does not hide it: it copies the working tree's lockfile and SAYS it did.
//
//   3. THE GITIGNORED INPUTS THE SUITE ACTUALLY NEEDS. `packages/corpus/raw/` and
//      `packages/corpus/data/chunks.jsonl` are ignored as re-fetchable, and two test files read
//      them directly. Without them the suite reports `SUITE RED — pnpm -r test` naming a real test
//      file, and the verdict is about the checkout rather than the code. This is the
//      stale-artifact shape: the guard measured something other than the tree it claims to judge.
//
// A missing input is reported and the worktree is still built, because "the corpus is not present"
// is a fact worth seeing rather than a reason to refuse — the suite will then fail for a stated
// reason instead of an unexplained one.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const DEST = arg('--at', '/tmp/g90-verify');
const REF = arg('--ref', 'HEAD');

if (DEST.startsWith(ROOT)) {
  console.error(`refusing to build the verify worktree inside the repository (${DEST}) — see F-68`);
  process.exit(2);
}

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const sh = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: 'pipe' });

/** Gitignored inputs the suite reads directly. Each names the test that needs it. */
const REQUIRED_INPUTS = [
  { path: 'packages/corpus/raw', why: 'packages/evals parser tests read the vendored Luau corpus' },
  { path: 'packages/corpus/data/chunks.jsonl', why: 'apps/worker/tests/retrieval-gold.test.mjs reads the built corpus' },
];

rmSync(DEST, { recursive: true, force: true });
git('worktree', 'prune');
git('worktree', 'add', '--detach', DEST, REF);
const sha = sh('git', ['rev-parse', '--short', 'HEAD'], DEST).trim();

// The lockfile, with the reason stated rather than done quietly.
cpSync(join(ROOT, 'pnpm-lock.yaml'), join(DEST, 'pnpm-lock.yaml'));
const lockDirty = git('status', '--porcelain', 'pnpm-lock.yaml').length > 0;

const missing = [];
for (const { path, why } of REQUIRED_INPUTS) {
  const from = join(ROOT, path);
  if (!existsSync(from)) { missing.push({ path, why }); continue; }
  const to = join(DEST, path);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
}

let installed = '';
try {
  installed = sh('pnpm', ['install', '--frozen-lockfile'], DEST).split('\n').at(-1) ?? '';
} catch (e) {
  console.error('pnpm install FAILED in the worktree:');
  console.error(String(e.stdout ?? e.message).slice(-600));
  process.exit(1);
}

console.log(`worktree ${DEST} at ${sha}`);
if (lockDirty) {
  console.log('  lockfile: copied from the WORKING TREE — the committed one does not satisfy the '
    + 'committed package.json, so a fresh clone cannot install. That is a real defect, not a quirk '
    + 'of this script.');
}
for (const m of missing) console.log(`  MISSING ${m.path} — ${m.why}. The suite will fail for this reason, not a code one.`);
console.log(`  install: ${installed.trim()}`);
