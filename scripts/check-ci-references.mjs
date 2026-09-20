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
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
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

const missing = [];
let seen = 0;
for (const f of files) {
  const body = readFileSync(join(WORKFLOWS, f), 'utf8');
  for (const [, path] of body.matchAll(REF)) {
    seen++;
    if (!existsSync(join(ROOT, path))) missing.push({ workflow: f, path });
  }
}

if (seen === 0) {
  console.error(`CI REFERENCES UNREADABLE — read ${files.length} workflow file(s) and found no `
    + 'scripts/ or infra/ path in any of them. Either CI stopped running this repository\'s own '
    + 'scripts, or this pattern no longer matches how they are written. Both are worth looking at; '
    + 'neither is a pass.');
  process.exit(2);
}

if (missing.length) {
  console.error('CI CALLS SCRIPTS THAT DO NOT EXIST\n');
  for (const m of missing) {
    console.error(`  ${m.workflow} runs ${m.path}, which is not in the tree.`);
  }
  console.error('\nEvery run touching that job fails, and it fails on the runner rather than here, so '
    + 'a green local suite says nothing about it. If the script was renamed, re-point the workflow.');
  process.exit(1);
}

console.log(`CI REFERENCES OK — ${seen} scripts/ and infra/ path(s) across ${files.length} workflow `
  + 'file(s), and every one of them is in the tree.');
