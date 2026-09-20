#!/usr/bin/env node
// Every script CI invokes, checked against the scripts that exist.
//
// THE FAILURE THIS COMES FROM. Commit 04d3800 on 2026-09-15 renamed check-spark-figures.mjs to
// check-credit-figures.mjs as part of Sparks -> Credits, and did not update .github/workflows.
// CI called a file that was no longer there and every run on main failed from that day: 34934918501
// and 35002022585 on 09-15, 35474815515 on 09-19, all `failure`.
//
// Five days of red CI, on a repository whose whole discipline is that a committed machine says when
// something is done. Nobody saw it, because a rename is exactly the change that looks finished: the
// grep for the OLD name comes back empty, which reads as "no references left" and is instead "no
// references left IN THE PLACES I GREPPED". .github is outside apps/, packages/ and scripts/.
//
// A local suite cannot catch this by running: the workflow file is data to it. So it is read.
//
//   node scripts/check-ci-references.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// The env override exists so tests/check-ci-references.test.mjs can point this at a throwaway
// repository. Nothing else sets it.
const ROOT = process.env.CI_REFERENCES_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOWS = join(ROOT, '.github', 'workflows');

if (!existsSync(WORKFLOWS)) {
  console.log('CI REFERENCES NOT CHECKED — there is no .github/workflows in this checkout. That is '
    + 'the absence of a thing to check, not a pass over a correct one.');
  process.exit(0);
}

const files = readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f));
if (files.length === 0) {
  console.error('CI REFERENCES UNREADABLE — .github/workflows exists and holds no workflow file. A '
    + 'checker that finds nothing to check must not report that as clean.');
  process.exit(2);
}

//[[ WHAT COUNTS AS A REFERENCE, and why it is deliberately narrow.
//   Only paths this repository owns and can resolve: `scripts/x.mjs`, `infra/x.mjs`, and the same
//   under node/bash. A workflow also names actions, images and shell builtins, and a checker that
//   tried to resolve those would spend its life reporting things that are not defects — which is
//   how a checker stops being read. ]]
const REF = /(?:^|[\s'"])((?:scripts|infra)\/[A-Za-z0-9_.\-/]+\.(?:mjs|js|sh|py))/g;

//[[ TRACKED, not merely PRESENT — and the difference is the whole point of this checker.
//
//   This used to be `existsSync`, and it printed "every one of them is in the tree" on the
//   strength of a stat() against the working directory. Those are not the same claim. A script
//   that exists locally and was never `git add`ed passes here and is absent on the runner, which
//   is the identical failure this file was written for, arriving from the other direction: the
//   rename left CI pointing at a file that was gone; an untracked new script leaves CI pointing at
//   a file that never arrived. Both are green locally and red on main.
//
//   The bar is the INDEX rather than HEAD, because a script staged in the same commit as the
//   workflow that calls it is correct and must not be reported as a defect. A checker that forces
//   you to commit twice gets run once. ]]
let tracked = null;
try {
  tracked = new Set(
    execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
      .toString('utf8').split('\0').filter(Boolean),
  );
} catch {
  // Not a git checkout, or git is unavailable. Say so rather than silently falling back to the
  // weaker check and reporting its result in the stronger check's words.
  console.error('CI REFERENCES UNVERIFIED — `git ls-files` did not run in ' + ROOT + ', so whether '
    + 'CI\'s scripts are tracked could not be established. A stat() against this working directory '
    + 'answers a different question and must not be reported as this one.');
  process.exit(2);
}

const missing = [];
const untracked = [];
let seen = 0;
for (const f of files) {
  const body = readFileSync(join(WORKFLOWS, f), 'utf8');
  for (const [, path] of body.matchAll(REF)) {
    seen++;
    if (!tracked.has(path)) untracked.push({ workflow: f, path });
    else if (!existsSync(join(ROOT, path))) missing.push({ workflow: f, path });
  }
}

if (seen === 0) {
  console.error(`CI REFERENCES UNREADABLE — read ${files.length} workflow file(s) and found no `
    + 'scripts/ or infra/ path in any of them. Either CI stopped running this repository\'s own '
    + 'scripts, or this pattern no longer matches how they are written. Both are worth looking at; '
    + 'neither is a pass.');
  process.exit(2);
}

if (untracked.length || missing.length) {
  console.error('CI CALLS SCRIPTS THAT WILL NOT BE ON THE RUNNER\n');
  for (const m of untracked) {
    console.error(`  ${m.workflow} runs ${m.path}, which git does not track. The runner checks out `
      + 'the commit, not this directory, so it will not be there.');
  }
  for (const m of missing) {
    console.error(`  ${m.workflow} runs ${m.path}, which git tracks and which is not on disk.`);
  }
  console.error('\nEvery run touching that job fails, and it fails on the runner rather than here, so '
    + 'a green local suite says nothing about it. If the script was renamed, re-point the workflow.');
  process.exit(1);
}

console.log(`CI REFERENCES OK — ${seen} scripts/ and infra/ path(s) across ${files.length} workflow `
  + 'file(s), and git tracks every one of them.');
