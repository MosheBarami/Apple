#!/usr/bin/env node
// Every workspace link in this checkout points INTO this checkout.
//
// F-68, WHICH HAS NOW HAPPENED TWICE. `pnpm install` run inside an in-repo git worktree rewrites
// the MAIN checkout's workspace symlinks to point at the worktree's copy of each package. The
// worktree is then deleted, or simply drifts, and the main tree keeps resolving to it.
//
// TODAY'S INSTANCE, and what makes it worth a guard rather than a note: fourteen agents were
// working in `.claude/worktrees/`, and afterwards
//
//     apps/worker/node_modules/@golem/shared
//       -> ../../../../.claude/worktrees/wf_f5fd3617-d14-2/packages/shared
//
// So `tsc -p apps/worker` reported
//
//     Module '"@golem/shared"' has no exported member 'creditRangeForRuns'
//
// for a function exported on line 1164 of the real file, and eighteen worker tests failed. Every
// one of those messages was TRUE about the package it was reading and false about this repository.
// That is the shape the verify-worktree script already names and the only kind of mistake a
// verification tool cannot afford: a right answer about the wrong tree. Nothing was checking for
// it, so an hour went into reading correct code looking for a defect that was not in it.
//
// The check is one readlink per workspace package and it is the cheapest gate in the suite.
import { readdirSync, readlinkSync, lstatSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));

/** Every place a workspace package can be linked from. */
const HOSTS = [];
for (const group of ['apps', 'packages']) {
  const dir = join(ROOT, group);
  if (!existsSync(dir)) continue;
  for (const e of readdirSync(dir)) HOSTS.push(join(dir, e));
}
HOSTS.push(ROOT);

const bad = [];
const outside = [];
let checked = 0;

for (const host of HOSTS) {
  const scope = join(host, 'node_modules', '@golem');
  if (!existsSync(scope)) continue;
  for (const name of readdirSync(scope)) {
    const link = join(scope, name);
    let st;
    try { st = lstatSync(link); } catch { continue; }
    if (!st.isSymbolicLink()) continue;
    checked++;
    const target = resolve(dirname(link), readlinkSync(link));
    const rel = relative(ROOT, target);

    // A worktree is the specific failure. Named separately because the message has to say the word
    // "worktree" — that is what tells whoever reads it which command did this.
    if (rel.includes('.claude/worktrees/') || rel.includes('/worktrees/')) {
      bad.push({ link: relative(ROOT, link), target: rel });
      continue;
    }
    // Anything else outside the repository is the same class of defect wearing different clothes.
    if (rel.startsWith('..')) outside.push({ link: relative(ROOT, link), target });
    // A link to a package that no longer exists resolves to nothing and fails at import time with
    // a message about the importer rather than about the link.
    else if (!existsSync(target)) outside.push({ link: relative(ROOT, link), target: rel + ' (missing)' });
  }
}

// A WALK THAT FOUND NO LINKS IS A BROKEN CHECK, NOT A CLEAN TREE. This repository has nine
// workspace packages and several cross-dependencies; zero links means node_modules is absent or
// the scope directory moved, and reporting "clean" would be this file committing the very defect
// it exists to catch.
if (checked === 0) {
  console.error('MODULE RESOLUTION CHECK IS BLIND — found no @golem/* symlinks anywhere.\n'
    + 'Either node_modules is not installed, or the workspace scope has moved. It cannot tell you\n'
    + 'anything about where this checkout resolves its own packages.');
  process.exit(2);
}

if (!bad.length && !outside.length) {
  console.log(`MODULE RESOLUTION OK — all ${checked} @golem/* links resolve inside this checkout.`);
  process.exit(0);
}

if (bad.length) {
  console.error(`WORKSPACE LINKS POINT INTO A WORKTREE — ${bad.length} of ${checked}:\n`);
  for (const b of bad) console.error(`    ${b.link}\n      -> ${b.target}`);
  console.error('\nThis is F-68. Something ran `pnpm install` inside an in-repo worktree and it rewrote');
  console.error('THIS tree\'s links. Typecheck and tests will now report true things about that other');
  console.error('copy and false things about this one.');
}
if (outside.length) {
  console.error(`\n${outside.length} link(s) resolve outside the checkout or to nothing:\n`);
  for (const o of outside) console.error(`    ${o.link}\n      -> ${o.target}`);
}
console.error('\nRepair, from the repository root:');
const hosts = [...new Set([...bad, ...outside].map((x) => x.link.split('/node_modules/')[0]))];
for (const h of hosts) {
  console.error(`    for n in $(ls ${h}/node_modules/@golem); do \\`);
  console.error(`      ln -sfn "${'../'.repeat(h.split('/').length + 2)}packages/$n" "${h}/node_modules/@golem/$n"; done`);
}
console.error('\nNever run pnpm install inside an in-repo worktree. scripts/verify-worktree.mjs builds');
console.error('its throwaway checkout OUTSIDE the repository for exactly this reason.');
process.exit(1);
