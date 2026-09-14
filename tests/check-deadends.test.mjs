// The checker that finds code nothing reaches.
//
// Its own failure mode is the interesting one: a dead-end checker with a blind spot reports the
// repository as broken when the BLIND SPOT is broken, and that finding is confident, specific and
// wrong — the worst kind. Two of those were found while writing it: workspace imports
// (`@golem/shared`) resolved to nothing, so every shared module looked dead, and Astro frontmatter
// was never read, so a TypeScript file imported by two pages looked unreached.
//
// So half of these tests are about what the checker must NOT report.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECKER = join(ROOT, 'scripts', 'check-deadends.mjs');

const run = (flags = []) => {
  const p = spawnSync('node', [CHECKER, ...flags], { cwd: ROOT, encoding: 'utf8', timeout: 120_000 });
  return { exit: p.status, out: `${p.stdout ?? ''}${p.stderr ?? ''}` };
};

test('it reaches a verdict on the real repository', () => {
  const r = run();
  assert.equal(r.exit, 0, 'the report alone never fails the suite');
  assert.match(r.out, /DEADENDS REPORTED/);
});

test('it prints a real denominator first', () => {
  const p = spawnSync('node', [CHECKER], { cwd: ROOT, encoding: 'utf8', timeout: 120_000 });
  assert.match(p.stdout.split('\n')[0], /^DENOMINATOR \d+ files; EXCEPTIONS \d+:/);
  assert.ok(Number(/DENOMINATOR (\d+)/.exec(p.stdout)[1]) > 100, 'a token denominator would report clean without looking');
});

test('an unrecognised flag exits 2', () => {
  const p = spawnSync('node', [CHECKER, '--nonsense'], { cwd: ROOT, encoding: 'utf8', timeout: 30_000 });
  assert.equal(p.status, 2);
});

/* ------------------------------------------------- what it must NOT report --- */

test('a workspace import counts as an import, and the count is what proves it', () => {
  // THE FIRST BLIND SPOT, and a lesson about how to test one.
  //
  // The obvious assertion — "packages/shared/src/index.ts is not reported as dead" — passed WITH
  // the bug in place and with it removed, because that file has relative importers too. It was
  // green and measuring nothing: the exact shape of a test whose mechanism is inert.
  //
  // What actually moves is the EDGE COUNT. Restoring the blind spot takes the graph from 546
  // resolved edges and 31 unresolved to 496 and 81 — fifty `@golem/*` specifiers that stop being
  // followed. So the graph's own completeness is published, and asserted here.
  const r = run();
  const resolved = Number(/GRAPH (\d+) import edge\(s\) resolved/.exec(r.out)[1]);
  const unresolved = Number(/resolved, (\d+) in-repo specifier\(s\) unresolved/.exec(r.out)[1]);

  assert.ok(resolved > 500, `only ${resolved} edges resolved — a resolver that drops a class of specifier reports fewer edges, not an error`);
  // Some unresolved specifiers are legitimate: a bare package name, a type-only path. What must not
  // happen is dozens of in-repo ones going unfollowed.
  assert.ok(unresolved < 50, `${unresolved} in-repo specifiers unresolved — the graph has a hole`);
});

test('an Astro page counts as an importer', () => {
  // THE SECOND BLIND SPOT. Astro components import TypeScript from their frontmatter, and reading
  // only .ts/.tsx/.mjs meant a file imported by two pages looked unreached.
  const r = run();
  assert.doesNotMatch(r.out, /apps\/site\/src\/lib\/studio-plugin\.ts/);
  // And the import really is only from .astro — so this test would fail without the fix.
  const importers = execFileSync('git', ['grep', '-l', 'studio-plugin', '--', 'apps/site'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean);
  assert.ok(importers.every((f) => f.endsWith('.astro') || f.endsWith('studio-plugin.ts')), importers.join(', '));
});

test('a file its own package declares as a script is not a dead end', () => {
  // Derived from the manifests rather than listed, so a renamed script does not silently become a
  // finding. packages/corpus declares "scan": "node src/scan.mjs".
  const r = run();
  assert.doesNotMatch(r.out, /packages\/corpus\/src\/scan\.mjs/);
});

test('the declared-entry exclusion is derived, not hard-coded', () => {
  const src = readFileSync(CHECKER, 'utf8');
  assert.match(src, /DECLARED_ENTRIES/);
  assert.match(src, /pkg\.scripts/);
  assert.doesNotMatch(src, /'packages\/corpus\/src\/scan\.mjs'/, 'the path must not appear as a literal');
});

/* --------------------------------------------------- what it MUST report --- */

test('it finds a module nothing imports', () => {
  // The real one: apps/web/src/components/plans.tsx, written mid-flight for w12 and never given an
  // importer — by the same session that wrote this checker.
  const r = run();
  assert.match(r.out, /apps\/web\/src\/components\/plans\.tsx/);
});

test('it distinguishes "no importer" from "reached only by a test"', () => {
  // The critic.ts shape is the second one, and it is the more dangerous: every unit test passes
  // while nothing ships. Collapsing the two would lose that distinction.
  const r = run();
  assert.match(r.out, /module\(s\) with no importer/);
  assert.match(r.out, /module\(s\) reached only from a test or eval harness/);
});

test('a planted dead end is found', () => {
  // Proof it is looking rather than reciting: a new unreferenced module must appear.
  const planted = join(ROOT, 'apps/web/src/lib/planted-dead-end.ts');
  writeFileSync(planted, 'export const nothingImportsThis = 1;\n');
  execFileSync('git', ['add', planted], { cwd: ROOT });
  try {
    const r = run();
    assert.match(r.out, /planted-dead-end\.ts/);
  } finally {
    execFileSync('git', ['rm', '-f', '-q', planted], { cwd: ROOT });
  }
});

/* ------------------------------------------------------- the disposition gate --- */

test('--gate passes only when every entry carries a disposition', () => {
  const r = run(['--gate']);
  assert.equal(r.exit, 0, r.out);
  assert.match(r.out, /DEADENDS ALL DISPOSITIONED/);
});

test('--gate fails when an entry has none', () => {
  // The accounting is what is mechanical; the judgement stays human. A finding with no WIRE,
  // DELETE or STRUCTURALLY-BLOCKED beside it is one nobody has decided about.
  const deadends = join(ROOT, 'docs/backlog/DEADENDS.md');
  const before = readFileSync(deadends, 'utf8');
  writeFileSync(deadends, before.replace(/plans\.tsx — WIRE/, 'plans.tsx — thinking about it'));
  try {
    const r = run(['--gate']);
    assert.equal(r.exit, 1, r.out);
    assert.match(r.out, /NO DISPOSITION: apps\/web\/src\/components\/plans\.tsx/);
  } finally {
    writeFileSync(deadends, before);
  }
});

test('only the three words count as a disposition', () => {
  const src = readFileSync(CHECKER, 'utf8');
  assert.match(src, /WIRE\|DELETE\|STRUCTURALLY-BLOCKED/);
});

test('a package subpath export resolves, so the module behind it is not reported dead', () => {
  // The resolver read only `pkg.main`, so `@golem/design/pixels` — and ./rules, ./retrieve,
  // ./checks, ./playbooks alongside it — resolved to nothing, and every module behind those
  // specifiers looked imported by nothing at all.
  //
  // The worst case is the one that actually happened: a module that had JUST been made canonical
  // by deduplicating two copies into it was reported as the repository's newest dead end. A
  // checker's blind spot presented as the repository's defect is the most expensive kind of
  // finding, because it is confident, specific and wrong — and the obvious remedy is to undo the
  // very change that was right.
  const out = spawnSync('node', [CHECKER], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
  const combined = `${out.stdout}${out.stderr}`;

  assert.doesNotMatch(combined, /packages\/design\/src\/pixels\.mjs/, 'the shared pixel module is imported by two packages');

  // POSITIVE CONTROL. The assertion above is an absence, and an absence also holds if the checker
  // stopped reporting anything at all. The graph line is the measurement that cannot be satisfied
  // by silence.
  const graph = /GRAPH (\d+) import edge\(s\) resolved, (\d+) in-repo specifier\(s\) unresolved/.exec(combined);
  assert.ok(graph, 'the checker must still publish its graph size');
  assert.ok(Number(graph[1]) > 500, `expected a real graph, got ${graph[1]} edges`);

  // And the subpaths are genuinely in the map, not merely absent from the findings.
  const src = readFileSync(CHECKER, 'utf8');
  assert.match(src, /pkg\.exports/, 'the resolver must read the exports map');
});
