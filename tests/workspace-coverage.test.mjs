// The checker that decides whether every package is reachable from `pnpm -r test`.
//
// WHY IT MATTERS. `apps/plugin` had no `package.json` for the whole of Phase IV. It is not a small
// package — Ops.luau is the single entry point for every mutation the agent performs in a user's
// place — and `pnpm -r test`, the canonical verification command and the one CI runs, did not reach
// a line of it. Nothing reported that, because a directory pnpm cannot see produces no output at
// all: the suite was green and 2,901 lines of Luau were outside it.
//
// WHY THIS FILE. That checker then had no test. Its own comments record two near-misses already —
// a quoted glob in pnpm-workspace.yaml silently removing a whole tree, and a `"test": "true"` that
// counted as coverage — both found by review rather than by anything that would catch the third.
// A checker whose failure mode is a quiet pass needs the same treatment it gives everyone else.
//
// Each case builds a fixture tree and runs the real script against it with --root.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECKER = join(ROOT, 'scripts', 'check-workspace-coverage.mjs');

const WORKSPACE = "packages:\n  - 'apps/*'\n  - 'packages/*'\n";

/**
 * Build a fixture workspace.
 *
 * `apps/site` and `packages/shared` are always created because the script's EXEMPT map names them,
 * and an exemption for a package that does not exist is itself a failure — correctly, but it would
 * drown every other assertion here.
 */
function fixture(packages, { workspace = WORKSPACE } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ws-coverage-'));
  writeFileSync(join(dir, 'pnpm-workspace.yaml'), workspace);
  for (const name of ['apps/site', 'packages/shared']) mkdirSync(join(dir, name), { recursive: true });

  for (const [name, spec] of Object.entries(packages)) {
    const pkg = join(dir, name);
    mkdirSync(pkg, { recursive: true });
    if (spec.manifest !== null) writeFileSync(join(pkg, 'package.json'), JSON.stringify(spec.manifest ?? {}));
    for (const file of spec.files ?? []) {
      const full = join(pkg, file);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, '// source\n');
    }
  }

  const proc = spawnSync('node', [CHECKER, '--root', dir], { encoding: 'utf8', timeout: 30_000 });
  return { exit: proc.status, out: `${proc.stdout ?? ''}${proc.stderr ?? ''}`, dir };
}

const withTest = { name: 'p', scripts: { test: 'node --test' } };

/* --------------------------------------------------------------- it passes --- */

test('a package with sources and a real test script is covered', () => {
  const r = fixture({ 'packages/thing': { manifest: withTest, files: ['src/index.ts'] } });
  assert.equal(r.exit, 0, r.out);
  assert.match(r.out, /packages\/thing/);
});

test('a package with a manifest and no sources needs no test', () => {
  // Nothing to hold. Demanding a test here would push people toward empty test files.
  const r = fixture({ 'packages/empty': { manifest: { name: 'empty' } } });
  assert.equal(r.exit, 0, r.out);
});

/* ---------------------------------------------------------------- it fails --- */

test('THE ORIGINAL DEFECT: sources with no package.json is a failure', () => {
  // apps/plugin, for the whole of Phase IV. pnpm cannot see the directory, so it produces no
  // output at all — the suite stays green with thousands of lines outside it.
  const r = fixture({ 'apps/invisible': { manifest: null, files: ['src/Ops.luau', 'src/Net.luau'] } });
  assert.equal(r.exit, 1);
  assert.match(r.out, /NO package\.json/);
  assert.match(r.out, /apps\/invisible/);
});

test('a test script that cannot fail is not coverage', () => {
  // `"test": "true"` passed this check once. It runs nothing and exits 0 forever.
  for (const script of ['true', ':', 'exit 0', 'echo', '']) {
    const r = fixture({ 'packages/fake': { manifest: { name: 'fake', scripts: { test: script } }, files: ['src/a.ts'] } });
    assert.equal(r.exit, 1, `"test": ${JSON.stringify(script)} should not count as coverage`);
    assert.match(r.out, /no "test" script/);
  }
});

test('a package with no scripts block at all is a failure', () => {
  const r = fixture({ 'packages/bare': { manifest: { name: 'bare' }, files: ['src/a.ts'] } });
  assert.equal(r.exit, 1);
});

test('sources in Python or .jsx count, not only TypeScript', () => {
  // A member whose source is Python counted ZERO and passed with no manifest at all.
  for (const file of ['src/scan.py', 'src/view.jsx', 'src/lib.rs', 'src/page.astro']) {
    const r = fixture({ 'packages/other': { manifest: null, files: [file] } });
    assert.equal(r.exit, 1, `${file} should count as a source file`);
  }
});

/* ----------------------------------------------------- it cannot pass quietly --- */

test('a QUOTED glob is expanded, not silently dropped', () => {
  // The near-miss: the first version matched only unquoted globs and dropped everything else with
  // no output, so `- 'apps/*'` — valid YAML, and the style the real file uses — removed a whole
  // tree from the check. The fixture above uses quoted globs throughout, so this asserts it by
  // finding a defect inside one.
  const r = fixture({ 'apps/invisible': { manifest: null, files: ['src/a.ts'] } }, { workspace: "packages:\n  - 'apps/*'\n  - 'packages/*'\n" });
  assert.equal(r.exit, 1, 'a quoted glob must still be expanded');
});

test('an entry the expander does not understand is an error, not a skip', () => {
  const r = fixture({}, { workspace: 'packages:\n  - apps/web\n' });
  assert.notEqual(r.exit, 0);
  assert.match(r.out, /cannot expand/);
});

test('a workspace file with no packages block is an error', () => {
  const r = fixture({}, { workspace: 'allowBuilds:\n  - esbuild\n' });
  assert.notEqual(r.exit, 0);
  assert.match(r.out, /no packages: block/);
});

test('an exemption for a package that no longer exists is a failure', () => {
  // Otherwise EXEMPT is a comment pretending to be a check: the package is gone, the reason stays,
  // and nobody notices the exemption now covers nothing.
  const r = fixture({ 'packages/thing': { manifest: withTest, files: ['src/a.ts'] } }, {
    workspace: "packages:\n  - 'packages/*'\n",   // drops apps/*, so apps/site stops being a member
  });
  assert.equal(r.exit, 1);
  assert.match(r.out, /not a workspace member any more/);
});

test('a container directory is not itself required to have a manifest', () => {
  // `apps/*` and `apps/benchmark/*` both match, so apps/benchmark is listed while being only a
  // container for the real member beneath it.
  const r = fixture(
    { 'apps/bench/inner': { manifest: withTest, files: ['src/a.ts'] } },
    { workspace: "packages:\n  - 'apps/*'\n  - 'apps/bench/*'\n  - 'packages/*'\n" },
  );
  assert.equal(r.exit, 0, r.out);
});

/* ------------------------------------------------- it still passes for real --- */

test('this repository itself passes', () => {
  const proc = spawnSync('node', [CHECKER], { cwd: ROOT, encoding: 'utf8', timeout: 30_000 });
  assert.equal(proc.status, 0, `${proc.stdout}${proc.stderr}`);
  assert.match(proc.stdout, /package\(s\) reachable/);
});
