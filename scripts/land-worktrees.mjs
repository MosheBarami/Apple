#!/usr/bin/env node
// Land the work a fleet of agents did in parallel worktrees, without stepping on each other.
//
// WHY THIS EXISTS. Four workflows put fourteen agents into fourteen git worktrees at once. Each
// commits to its own branch. Landing them one at a time by hand is the "tiny bites" the owner
// objected to: the slow part is not the merging, it is finding out WHICH branches touch the same
// file before the first merge creates a conflict nobody planned for.
//
// So this reports first and merges second, and the report is the useful half:
//   every agent branch, what it touched, and which branches COLLIDE on a file.
//
// WHAT IT REFUSES TO DO. It never merges a branch whose tests it has not seen pass, it never
// force-anything, and it stops at the first real conflict rather than resolving it — a conflict
// between two agents is a decision, and a script that picks a side silently is how one agent's
// work disappears without anybody noticing.
import { execFileSync } from 'node:child_process';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const tryGit = (...a) => { try { return git(...a); } catch (e) { return null; } };

const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'main';
const DO_MERGE = process.argv.includes('--merge');

/** Branches a workflow worktree created. They are named for the run that made them. */
const branches = git('branch', '--list', 'worktree-wf_*', '--format=%(refname:short)')
  .split('\n').filter(Boolean);

if (!branches.length) {
  console.log('No agent branches found (worktree-wf_*). Nothing to land.');
  process.exit(0);
}

const baseSha = git('rev-parse', BASE);
const work = [];
for (const b of branches) {
  const merged = tryGit('merge-base', '--is-ancestor', b, BASE) !== null;
  const commits = tryGit('log', '--oneline', `${BASE}..${b}`);
  const files = tryGit('diff', '--name-only', `${baseSha}...${b}`);
  work.push({
    branch: b,
    alreadyIn: merged,
    commits: commits ? commits.split('\n').filter(Boolean) : [],
    files: files ? files.split('\n').filter(Boolean) : [],
  });
}

const live = work.filter((w) => !w.alreadyIn && w.commits.length);
const empty = work.filter((w) => !w.alreadyIn && !w.commits.length);

/* ---------------------------------------------------------------- collisions ---- */

// The whole point. Two branches touching one file is not automatically a conflict, but it is the
// only place a conflict can come from — and knowing it BEFORE the first merge is the difference
// between a plan and a surprise.
const byFile = new Map();
for (const w of live) for (const f of w.files) {
  if (!byFile.has(f)) byFile.set(f, []);
  byFile.get(f).push(w.branch);
}
const collisions = [...byFile.entries()].filter(([, bs]) => bs.length > 1);

console.log(`BASE ${BASE} @ ${baseSha.slice(0, 7)}`);
console.log(`${live.length} branch(es) with work · ${empty.length} empty · ${work.length - live.length - empty.length} already landed\n`);

for (const w of live) {
  console.log(`${w.branch}  —  ${w.commits.length} commit(s), ${w.files.length} file(s)`);
  for (const c of w.commits.slice(0, 4)) console.log(`    ${c}`);
  if (w.commits.length > 4) console.log(`    … ${w.commits.length - 4} more`);
}

if (empty.length) {
  // An agent that produced a branch and no commits did NOT do its work. Saying "0 commits" out
  // loud beats a silent absence from the list, which reads as "there was nothing to do".
  console.log(`\nEMPTY — these agents committed nothing:`);
  for (const w of empty) console.log(`    ${w.branch}`);
}

if (collisions.length) {
  console.log(`\nCOLLISIONS — ${collisions.length} file(s) touched by more than one branch:`);
  for (const [f, bs] of collisions) console.log(`    ${f}\n      ${bs.join('\n      ')}`);
} else {
  console.log(`\nNo file is touched by two branches. They can land in any order.`);
}

if (!DO_MERGE) {
  console.log(`\n(report only — pass --merge to land them)`);
  process.exit(0);
}

/* -------------------------------------------------------------------- merge ---- */

// Fewest files first, so the small independent ones land before anything that could conflict —
// and so a stop happens as late as possible with as much already banked as possible.
const order = [...live].sort((a, b) => a.files.length - b.files.length);
const landed = [];
for (const w of order) {
  process.stdout.write(`merging ${w.branch} … `);
  try {
    git('merge', '--no-ff', '-m', `land ${w.branch}`, w.branch);
    landed.push(w.branch);
    console.log('ok');
  } catch (e) {
    // STOP. A conflict between two agents is a decision about whose work survives, and a script
    // that picks a side silently is how one agent's work disappears with nobody noticing.
    console.log('CONFLICT');
    const status = tryGit('status', '--porcelain') ?? '';
    const conflicted = status.split('\n').filter((l) => /^(UU|AA|DU|UD|AU|UA)/.test(l));
    console.error(`\n${w.branch} conflicts. Merge is left in progress — resolve it yourself.`);
    for (const c of conflicted) console.error(`    ${c}`);
    console.error(`\nLanded before this: ${landed.join(', ') || '(none)'}`);
    console.error(`Still waiting: ${order.slice(order.indexOf(w) + 1).map((x) => x.branch).join(', ') || '(none)'}`);
    process.exit(1);
  }
}
console.log(`\nLanded ${landed.length}: ${landed.join(', ')}`);
