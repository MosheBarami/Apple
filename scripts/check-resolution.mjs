#!/usr/bin/env node
// Is the code under test the code you think it is?
//
//   node scripts/check-resolution.mjs
//
// EVERY OTHER GUARD HERE INSPECTS THE MEASUREMENT. This one inspects the RESOLUTION.
//
// A git worktree placed INSIDE the repository has the main `pnpm-workspace.yaml` as its nearest
// ancestor workspace root, so pnpm run from within it rewrites the MAIN tree's workspace links to
// point at the worktree's frozen copies. Five went tonight — `@golem/shared` in apps/web,
// apps/site and apps/worker, `@golem/design` in apps/worker and packages/evals — and for some
// window every typecheck and test in the main checkout was reading a frozen copy at an old commit.
//
// rbxai-a3's phrasing is the one to keep: a dead harness gives a WRONG number about the RIGHT
// tree; this gives a RIGHT number about the WRONG tree. The suite is green, the types check, the
// gates reproduce — about code that is not the code in front of you. Nothing in this repository
// asked that question before, and no amount of care about denominators, parsers or fingerprints
// would have caught it, because every one of those inspects the answer rather than the input.
//
// TWO THINGS THAT MAKE IT WORSE, both measured rather than assumed:
//   `pnpm install --frozen-lockfile` reports "Already up to date" and repairs NOTHING — pnpm's
//   stored state records the corrupted links as correct, so the repair tool agrees with the
//   corruption. `--force` also claimed success and left typescript missing outright. What worked
//   was removing the package's node_modules and installing again.
//
// WHY A DETECTOR RATHER THAN A RULE. The cause is avoidable by habit: do not put worktrees inside
// the repo, or never let pnpm run inside one. But two sessions did it tonight WHILE ACTIVELY
// DISCUSSING how to measure trees carefully, and I shipped a third instance in a gate. A rule that
// three people break in one evening while thinking about that exact rule is not a rule.
//
// Shape proposed by rbxai-04, who ran it against the repaired tree first; written here because
// scripts/ is this session's lane.
import { execFileSync } from 'node:child_process';
import { readdirSync, readlinkSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..'));

// Their internals are EXPECTED to be links and are not what is being audited. `.pnpm` is the
// store's own layout; `.claude/worktrees` holds trees we deliberately created.
const SKIP_DIRS = new Set(['.git', '.pnpm', 'worktrees']);

// Links that legitimately leave the checkout. The venv's interpreters point at the uv-managed
// python and must keep doing so. Anything else escaping is reported rather than allowed, because
// an allowlist that swallows the general case would pass a corrupted tree too.
const ALLOWED_ESCAPES = [/^packages\/training\/\.venv\/bin\/python[\d.]*$/];

const findings = [];
let examined = 0;
let escapes = 0;

function walk(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name === '.git' || SKIP_DIRS.has(e.name)) continue;
    const abs = join(dir, e.name);
    if (e.isSymbolicLink()) {
      examined += 1;
      const rel = relative(ROOT, abs);
      const target = readlinkSync(abs);
      let real;
      try {
        real = realpathSync(abs);
      } catch {
        findings.push({ rel, why: `DANGLING — points at ${target}, which does not exist` });
        continue;
      }
      // THE CORRUPTION. A module directory resolving into a worktree means the build is reading a
      // frozen checkout at some other commit while reporting on this one.
      if (/[/\\]\.claude[/\\]worktrees[/\\]/.test(real)) {
        findings.push({ rel, why: `RESOLVES INTO A WORKTREE — ${relative(ROOT, real)}; this tree is being built against a frozen copy at another commit` });
        continue;
      }
      if (!real.startsWith(`${ROOT}/`) && real !== ROOT) {
        escapes += 1;
        if (!ALLOWED_ESCAPES.some((re) => re.test(rel))) {
          findings.push({ rel, why: `ESCAPES THE CHECKOUT — ${real}` });
        }
      }
      continue;
    }
    if (e.isDirectory()) walk(abs);
  }
}

// Tracked-file count is printed beside the link count so the denominator is visible: a run that
// examined no symlinks at all should look obviously wrong rather than clean.
let tracked = 0;
try {
  tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n').filter(Boolean).length;
} catch { /* not a repo */ }

walk(ROOT);

console.log(`DENOMINATOR ${examined} symlink(s) under ${relative(resolve(ROOT, '..'), ROOT)}, alongside ${tracked} tracked file(s); ${escapes} leave the checkout, ${ALLOWED_ESCAPES.length} pattern(s) allowed to`);

if (!findings.length) {
  console.log(`RESOLUTION SOUND — ${examined} symlink(s), none dangling, none resolving into a worktree`);
  process.exit(0);
}
for (const f of findings) console.error(`  ${f.rel}: ${f.why}`);
console.log(`RESOLUTION BROKEN — ${findings.length} finding(s) across ${examined} symlink(s)`);
process.exit(1);
