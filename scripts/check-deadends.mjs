#!/usr/bin/env node
// What is written, tested, and reached by nobody.
//
// A capability exists only if a reachable product path executes it. Code that compiles, is tested,
// and has no caller is a DEAD END — and this repository has shipped one: `critic.ts` was nine
// hundred lines of measured rules with a full test suite, and zero bytes of it reached the deployed
// bundle. Every unit test passed the whole time. Nothing noticed for weeks, and the audit that did
// notice was prose nobody could run.
//
// THIS CHECKER REPORTS; IT NEVER FAILS THE SUITE ON ITS OWN. That is deliberate. A dead end is not
// automatically a defect — an entry point has no importers, a CLI is invoked by a human, a shared
// library is meant to be consumed elsewhere — so failing on the list would train people to widen
// the exception list until it was empty. What FAILS is a separate gate: every entry must carry a
// disposition in docs/backlog/DEADENDS.md, one of WIRE, DELETE or STRUCTURALLY-BLOCKED. The
// judgement stays human; the accounting is mechanical.
//
// DELETING SOURCE TO MAKE THIS GREEN IS A VIOLATION, not a fix. The disposition for a module that
// should not exist is DELETE with a dated owner statement, not a quiet removal.
//
//   node scripts/check-deadends.mjs              report, exit 0
//   node scripts/check-deadends.mjs --gate       fail when an entry has no disposition
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DISPOSITIONS = join(ROOT, 'docs', 'backlog', 'DEADENDS.md');

const args = process.argv.slice(2);
for (const a of args) {
  if (a !== '--gate') { console.error(`check-deadends: unrecognised flag ${a}`); process.exit(2); }
}
const GATE = args.includes('--gate');

const git = (a) => {
  try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim(); }
  catch { return ''; }
};

/* ------------------------------------------------------------- denominator --- */
//
// §6.3. Each exception carries its reason inline; an exception without one is a hole.

const EXCEPTIONS = [
  { glob: 'scripts/**', why: 'invoked by a human or by CI, so having no importer is their normal state' },
  { glob: 'infra/**', why: 'the same: deploy, smoke and load-test CLIs, run by a person' },
  { glob: '**/*.test.*', why: 'a test file is run by a runner, never imported' },
  { glob: '**/tests/**', why: 'test harnesses, for the same reason' },
  { glob: '**/*.d.ts', why: '§6.6 excludes type-only exports by construction — there is nothing to execute' },
  { glob: '**/*.config.*', why: 'loaded by the build tool by name, not imported by source' },
  { glob: 'packages/corpus/raw/**', why: 'vendored third-party source; not ours to wire or delete' },
  { glob: 'apps/benchmark/**', why: 'a benchmark place is built by Rojo, not imported by the product' },
  { glob: '<package.json scripts>', why: 'a file a package DECLARES as a script entry point is invoked by name' },
  { glob: 'packages/evals/**', why: 'an offline grading harness — every module in it is reached from a test BY DESIGN, which is what the package is for; §6.6 excludes cross-package library surfaces by construction' },
];

/**
 * Files a package's own manifest names as a script entry point.
 *
 * Derived from the manifests, never listed here: `packages/corpus` declares `"scan": "node
 * src/scan.mjs"`, and a file its own package says is a command is not a dead end for having no
 * importer. Hard-coding the list would go stale the first time a script was renamed.
 */
const DECLARED_ENTRIES = (() => {
  const set = new Set();
  for (const manifest of ['package.json', ...git(['ls-files', '*/package.json', '*/*/package.json']).split('\n')].filter(Boolean)) {
    try {
      const pkg = JSON.parse(readFileSync(join(ROOT, manifest), 'utf8'));
      const dir = manifest === 'package.json' ? '' : `${dirname(manifest)}/`;
      for (const body of Object.values(pkg.scripts ?? {})) {
        for (const m of String(body).matchAll(/(?:^|\s)([\w./-]+\.(?:mjs|js|ts|tsx))/g)) {
          set.add(m[1].startsWith('.') ? `${dir}${m[1].slice(2)}` : `${dir}${m[1]}`);
        }
      }
    } catch { /* not this checker's finding */ }
  }
  return set;
})();

const ENTRYPOINTS = new Set([
  // Declared in wrangler.jsonc as "main" — re-read rather than assumed.
  ...(() => {
    try {
      const cfg = readFileSync(join(ROOT, 'apps/worker/wrangler.jsonc'), 'utf8');
      const m = /"main"\s*:\s*"([^"]+)"/.exec(cfg);
      return m ? [`apps/worker/${m[1]}`] : [];
    } catch { return []; }
  })(),
  'apps/web/src/main.tsx',
]);

const isExcepted = (rel) =>
  rel.startsWith('scripts/') ||
  rel.startsWith('infra/') ||
  /\.test\./.test(rel) ||
  /(^|\/)tests?\//.test(rel) ||
  /\.d\.ts$/.test(rel) ||
  /\.config\.[cm]?[jt]s$/.test(rel) ||
  DECLARED_ENTRIES.has(rel) ||
  rel.startsWith('packages/corpus/raw/') ||
  rel.startsWith('packages/evals/') ||
  rel.startsWith('apps/benchmark/') ||
  // Astro pages and layouts are routed by the framework, not imported.
  /^apps\/site\/src\/(pages|layouts)\//.test(rel);

const tracked = git(['ls-files', '*.ts', '*.tsx', '*.mjs', '*.js']).split('\n').filter(Boolean);

/**
 * Files that can IMPORT, which is a wider set than files that can BE a dead end.
 *
 * Astro components import TypeScript from their frontmatter, and reading only .ts/.tsx/.mjs meant
 * `apps/site/src/lib/studio-plugin.ts` — imported by two pages — was reported as reached by
 * nothing. That is the checker's blind spot presented as the repository's defect: confident,
 * specific and wrong, which is the worst kind of finding a checker can produce.
 */
const importerSources = [...tracked, ...git(['ls-files', '*.astro']).split('\n').filter(Boolean)];
const examined = tracked.filter((f) => !isExcepted(f) && !f.includes('node_modules/'));

console.log(`DENOMINATOR ${examined.length} files; EXCEPTIONS ${EXCEPTIONS.length}: ${EXCEPTIONS.map((e) => e.glob).join(', ')}`);

/* ----------------------------------------------------------------- the graph --- */

/** Bytes, not grep — the tree has carried files that grep classes as binary and skips silently. */
function readText(rel) {
  try { return readFileSync(join(ROOT, rel)).toString('utf8'); } catch { return ''; }
}

/**
 * Every workspace package's name mapped to its entry file, read from the manifests rather than
 * hard-coded — so a new package is followed the day it exists.
 *
 * Without this, `import { X } from '@golem/shared'` resolves to nothing and EVERY file in
 * packages/shared and packages/design looks unimported. That is the checker's blind spot reported
 * as the repository's defect, which is the worst kind of finding: confident, specific and wrong.
 */
const WORKSPACE = (() => {
  const map = new Map();
  for (const manifest of git(['ls-files', '*/package.json', '*/*/package.json']).split('\n').filter(Boolean)) {
    try {
      const pkg = JSON.parse(readFileSync(join(ROOT, manifest), 'utf8'));
      if (!pkg.name?.startsWith('@')) continue;
      const entry = pkg.main ?? pkg.module ?? 'src/index.ts';
      map.set(pkg.name, `${dirname(manifest)}/${entry}`);
    } catch { /* an unparseable manifest is check-escape-hatches' finding, not this one */ }
  }
  return map;
})();

/** Resolve a specifier to a tracked path, trying the extensions this repo actually uses. */
function resolveSpecifier(fromRel, spec) {
  // A workspace import counts as an import. It is how one package reaches another, and treating it
  // as unresolvable makes every shared module look dead.
  if (WORKSPACE.has(spec)) return WORKSPACE.get(spec);
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(join(ROOT, fromRel)), spec);
  const candidates = [
    base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}.js`,
    join(base, 'index.ts'), join(base, 'index.tsx'), join(base, 'index.mjs'),
  ];
  for (const c of candidates) {
    if (!existsSync(c)) continue;
    const rel = relative(ROOT, c);
    if (tracked.includes(rel)) return rel;
  }
  return null;
}

// Every file that imports each file. Built over ALL tracked sources including tests, because a
// module imported only by a test is a different finding from one imported by nobody at all.
const importers = new Map(tracked.map((f) => [f, new Set()]));
const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[\s\S]{0,400}?from\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

for (const rel of importerSources) {
  const src = readText(rel);
  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2] ?? m[3];
    const target = resolveSpecifier(rel, spec);
    if (target) importers.get(target)?.add(rel);
  }
}

/* --------------------------------------------------------------- the findings --- */

const findings = [];
const isTestLike = (rel) => /\.test\.|\/tests?\//.test(rel) || rel.startsWith('packages/evals/');

for (const rel of examined) {
  if (ENTRYPOINTS.has(rel)) continue;
  const from = [...(importers.get(rel) ?? [])];

  if (from.length === 0) {
    findings.push({ rel, kind: 'no-importer', detail: 'imported by nothing in the tree' });
    continue;
  }
  // The critic.ts shape: imported, tested, and reached only from a test or an eval harness. This is
  // the finding that matters most, because every unit test passes while nothing ships.
  if (from.every(isTestLike)) {
    findings.push({ rel, kind: 'test-only', detail: `imported only by ${from.slice(0, 3).join(', ')}` });
  }
}

/* --------------------------------------------------------------- dispositions --- */

const dispositionText = existsSync(DISPOSITIONS) ? readText('docs/backlog/DEADENDS.md') : '';
const VOCABULARY = /\b(WIRE|DELETE|STRUCTURALLY-BLOCKED)\b/;

const undispositioned = findings.filter((f) => {
  const line = dispositionText.split('\n').find((l) => l.includes(f.rel));
  return !line || !VOCABULARY.test(line);
});

/* -------------------------------------------------------------------- report --- */

const byKind = (k) => findings.filter((f) => f.kind === k);
console.log(`  ${byKind('no-importer').length} module(s) with no importer`);
console.log(`  ${byKind('test-only').length} module(s) reached only from a test or eval harness`);

for (const f of findings) {
  const line = dispositionText.split('\n').find((l) => l.includes(f.rel));
  const disp = line && VOCABULARY.test(line) ? VOCABULARY.exec(line)[1] : 'UNDISPOSITIONED';
  console.log(`  ${disp.padEnd(21)} ${f.rel}  — ${f.detail}`);
}

if (!GATE) {
  console.log(`DEADENDS REPORTED — ${findings.length} entr${findings.length === 1 ? 'y' : 'ies'}, ${undispositioned.length} undispositioned`);
  process.exit(0);
}

if (undispositioned.length) {
  console.error('');
  for (const f of undispositioned) {
    console.error(`  NO DISPOSITION: ${f.rel} — add WIRE, DELETE or STRUCTURALLY-BLOCKED to docs/backlog/DEADENDS.md`);
  }
  console.log(`DEADENDS UNDISPOSITIONED — ${undispositioned.length} of ${findings.length}`);
  process.exit(1);
}

console.log(`DEADENDS ALL DISPOSITIONED — ${findings.length} entr${findings.length === 1 ? 'y' : 'ies'}`);
