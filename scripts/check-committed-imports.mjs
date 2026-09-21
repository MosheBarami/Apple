#!/usr/bin/env node
// A committed file that imports an uncommitted one is red in every clone but this one.
//
// THE FAILURE THIS COMES FROM. apps/worker/tests/embedding-retrieval.test.mjs was committed on
// 2026-09-21 with `await import(join(REPO, 'scripts', 'build-module-embeddings.mjs'))` at module
// scope. The builder was never added to git. Locally the suite reported 3681/3681; `git archive
// HEAD` into a clean directory and the same import is ERR_MODULE_NOT_FOUND, so a clone does not
// see nine red tests -- it sees a file that will not load and nine tests that do not exist.
//
// WHY NOTHING ELSE CAUGHT IT. check-deadends builds an import graph out of static specifiers, and
// a path assembled by `join(ROOT, 'a', 'b.mjs')` is not a specifier; it is an expression, and the
// graph drops it. `node --test` reads the working tree, where the file is present. Every checker in
// this repository that answers "is it there" answers it about the tree. Only git knows what ships.
//
// WHAT IS CHECKED, AND WHY IT IS THIS NARROW. Only `import(...)` whose argument is built from
// LITERAL path segments by join()/resolve(). Not readFileSync, not execFileSync: widening to those
// was measured on this repository and produced 27 findings, all of them correct behaviour -- .env,
// fixtures a test writes into a temp dir, generated data under packages/*/runs. A gate whose list
// is mostly noise is a gate people learn to widen. An `import` is different in kind: when the path
// is wrong the module does not misbehave, it fails to load, and it takes its whole file with it.
//
// A FILE A SCRIPT BUILDS BEFORE IT IMPORTS IT IS NOT MISSING. packages/training/src/
// measure-library-yield.mjs esbuilds into a temp dir and imports `join(dir, 'vm.mjs')`. That is
// exempted by reading the same file for a writer of the same name (`--outfile=`, `outfile:`,
// writeFileSync) rather than by an allowlist, so the exemption expires when the writer does.
//
//   node scripts/check-committed-imports.mjs         report and gate; exit 1 on a finding
//
// Exit 2 means the instrument could not run -- no git index, or not one import site found in the
// whole repository. Zero findings out of zero examined is not a pass, and this file will not print
// one.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

// The env override exists so tests/check-committed-imports.test.mjs can point this at a throwaway
// repository, the way CI_REFERENCES_ROOT does for check-ci-references.mjs. Nothing else sets it.
const ROOT = process.env.COMMITTED_IMPORTS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');

let tracked;
try {
  tracked = execFileSync('git', ['-C', ROOT, 'ls-files'], { encoding: 'utf8', maxBuffer: 1 << 28 })
    .split('\n').filter(Boolean);
} catch {
  console.error(`COMMITTED IMPORTS UNREADABLE - \`git ls-files\` failed in ${ROOT}. This checker's `
    + 'whole question is what git holds; without an index it has no answer and must not print one.');
  process.exit(2);
}
if (tracked.length === 0) {
  console.error('COMMITTED IMPORTS UNREADABLE - git tracks no files here. A checker that finds '
    + 'nothing to check must not report that as clean.');
  process.exit(2);
}
const index = new Set(tracked);
const CODE = tracked.filter((f) => /\.(mjs|cjs|js|ts|tsx)$/.test(f));

//[[ `import(` ... `join(IDENT, 'a', 'b.ext')`. The base is an identifier on purpose: a literal
//   relative specifier resolves by itself and node reports it plainly, while the assembled form is
//   the one that looks like ordinary code and reads as checked. The segment list must end in an
//   extension so that `join(dir, name)` with a variable does not become a finding nobody can act on.
const SITE = /\bimport\s*\(\s*[^)]{0,120}?\b(?:join|resolve)\s*\(\s*[A-Za-z_$][\w$]*\s*,\s*((?:'[^']*'\s*,\s*)*'[^']*\.[A-Za-z0-9]{1,6}')\s*\)/g;

/** Does git hold a file at this tail? `..` is resolved against every ancestor of the importer. */
function resolvesInIndex(importer, segments) {
  const tail = segments.join('/');
  if (segments[0] === '..') {
    for (let d = dirname(importer); ; d = dirname(d)) {
      const p = normalize(join(d, tail));
      if (!p.startsWith('..') && index.has(p)) return true;
      if (d === '.') break;
    }
  }
  return index.has(tail) || tracked.some((p) => p.endsWith(`/${tail}`));
}

/**
 * Does this match begin inside a `//` comment rather than in code?
 *
 * FOUND BY THE CHECKER, ON ITSELF, THE MINUTE IT BECAME VISIBLE TO ITSELF. While
 * check-committed-imports.mjs was untracked it was not in `git ls-files` and so was never scanned.
 * The first run after committing it reported `scripts/check-committed-imports.mjs imports a/b.ext`
 * -- the prose above SITE, which spells out the pattern it recognises. A checker whose first act is
 * to indict its own documentation is a checker people turn off.
 *
 * `//` preceded by a colon is not a comment. Sources here carry URLs -- `file://`, `https://` --
 * and one sitting earlier on the same line as an import would otherwise read as commenting the
 * import out. tests/check-committed-imports.test.mjs has that line, and was watched losing the
 * finding when `[^:]` is removed from this expression.
 */
const inLineComment = (text, idx) => {
  const prefix = text.slice(text.lastIndexOf('\n', idx) + 1, idx);
  return /(^|[^:])\/\//.test(prefix);
};

/** Is the last segment a file this same source writes before it reads it? */
const producesItself = (text, segments) => {
  const name = segments[segments.length - 1];
  return new RegExp(String.raw`(?:--outfile=|outfile\s*:|writeFileSync\s*\()[^\n]{0,160}`
    + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(text);
};

const findings = [];
let sites = 0;
for (const f of CODE) {
  let text;
  try { text = readFileSync(join(ROOT, f), 'utf8'); } catch { continue; }
  // A raw NUL makes a source binary to every grep-based check in this repository (see 8900c29);
  // reading it as text would silently match nothing and count as examined.
  if (text.includes('\0')) continue;
  for (const m of text.matchAll(SITE)) {
    if (inLineComment(text, m.index)) continue;
    sites += 1;
    const segments = [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
    if (resolvesInIndex(f, segments)) continue;
    if (producesItself(text, segments)) continue;
    findings.push({ importer: f, tail: segments.join('/') });
  }
}

if (sites === 0) {
  console.error('COMMITTED IMPORTS UNREADABLE - not one assembled import site was found in '
    + `${CODE.length} tracked source files. The pattern this checker recognises has stopped `
    + 'matching the code, so a clean result here would be the instrument reporting on itself.');
  process.exit(2);
}

if (findings.length === 0) {
  console.log(`COMMITTED IMPORTS OK - ${sites} assembled import site(s) across ${CODE.length} `
    + 'tracked source files, every target held by git.');
  process.exit(0);
}

console.error(`COMMITTED IMPORTS BROKEN - ${findings.length} of ${sites} assembled import site(s) `
  + 'name a file git does not hold. Each one loads here and throws ERR_MODULE_NOT_FOUND in a clone:\n');
for (const { importer, tail } of findings) console.error(`  ${importer}\n      imports  ${tail}`);
console.error('\nCommit the file, or delete the import. Do not add the path to a list: the fix for '
  + 'a reference to something that is not there is the thing being there.');
process.exit(1);
