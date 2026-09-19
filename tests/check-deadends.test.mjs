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
  // What actually moves is the EDGE COUNT. Restoring the blind spot takes fifty `@golem/*`
  // specifiers out of the graph. So the graph's own completeness is published, and asserted here.
  const r = run();
  const resolved = Number(/GRAPH (\d+) import edge\(s\) resolved/.exec(r.out)[1]);
  const unresolved = Number(/resolved, (\d+) in-repo specifier\(s\) unresolved/.exec(r.out)[1]);

  assert.ok(resolved > 1000, `only ${resolved} edges resolved — a resolver that drops a class of specifier reports fewer edges, not an error`);

  //[[ THIS BOUND WAS `unresolved < 50` AGAINST A MEASURED 55, AND RAISING IT WAS THE WRONG FIX.
  //
  //   `node scripts/check-deadends.mjs --list-unresolved` names every dropped specifier, and the
  //   fifty-five it named contained ZERO dead ends. Fifty-two pointed at files that exist and were
  //   dropped by four separate holes in the resolver, each measured by removing the fix again:
  //
  //     32  Astro and JSON targets. `.astro` files were read as IMPORTERS but never accepted as
  //         TARGETS, so `../layouts/Base.astro` — imported by fourteen pages — resolved to
  //         nothing, as did the landing page's `../data/asset-wall.json`.
  //     10  Deep paths into a workspace package. `@golem/evals/src/luau-*.mjs` is how the worker
  //         reaches the whole Luau intelligence cluster on every review; packages/evals declares
  //         no `exports` map, so neither the exact-name nor the subpath branch saw them.
  //      8  `apps/worker/tests/retention.test.mjs`, whose esbuild `stdin` module is written
  //         against `resolveDir: WORKER` rather than against the test's own directory.
  //      2  `packages/sdk/types/fixtures/{bad,ok}.ts` meaning `packages/sdk/types/index.d.ts` by
  //         `../index` — there was no `.d.ts` candidate.
  //
  //   THE RESIDUE IS NOT AN IMPORT AT ALL, which is the whole of what makes it legitimate:
  //
  //     apps/worker/tests/sandbox-contract.test.mjs -> ./secret.js   and  -> ./other.luau
  //       Hostile sample PROGRAMS, quoted inside that file's case table as the source a scan must
  //       return `node_dynamic_import` and `luau_require` for. Resolving either would mean the
  //       checker had found the escape the test exists to prove is blocked.
  //
  //       Quoting one of those case lines VERBATIM here made this comment a further unresolved
  //       specifier — the scanner reads test files too, and a dynamic import inside a `//` line is
  //       still a match for its regex. Describe them; do not re-type them.
  //     tests/release-check.test.mjs -> ../layouts/Base.astro
  //       A line inside the `PAGE` template literal, the changelog fixture written into a temp
  //       tree. It is Astro source the test GENERATES, not source this repository holds.
  //
  //   THE ABSOLUTE CEILING WAS `unresolved <= 4` AND IT HAD TO GO, 2026-09-19.
  //
  //   It went red at five. The fourth and fifth are two `packages/training/src/*.test.mjs` files
  //   quoting a Luau `require` of a neighbouring module inside their own case tables — the SAME
  //   class as the sandbox-contract pair above, arrived at independently by another session.
  //   Nothing was dropped: the resolver still reports 1,597 edges. (Re-typing those two
  //   specifiers here to name them took the residue to SEVEN, which is the trap the note above
  //   describes, sprung by the session rewriting the note. Describe them; do not re-type them.)
  //
  //   Bumping 4 to 5 was available and is the wrong fix, because the number is not the property.
  //   An absolute counts quoted sample programs, and a test suite that grows more hostile samples
  //   moves it every time — so it becomes a number people bump, which is how `< 50` came to sit
  //   forty-seven above the truth in the first place.
  //
  //   WHAT IS ACTUALLY TRUE: the checker cannot tell a specifier QUOTED AS DATA from one written
  //   as source without executing the file, and every specifier it cannot tell apart lives in a
  //   test — a case table or a generated fixture. In PRODUCT source there is no such thing as a
  //   legitimate unresolved in-repo specifier: it is a resolver hole or a broken import, and both
  //   must be red at one. So the file the specifier sits in is the property, and it does not move
  //   when someone writes another sample program.
  //
  //   Held against the four measured holes above: the 32 Astro/JSON targets, the 10 `@golem/evals`
  //   deep paths and the 2 `packages/sdk` fixtures were all in non-test files and each goes red on
  //   the property alone, at ANY count. The 8 esbuild `stdin` ones were in a test file, so the
  //   ratio is what has to cover them — and it does, measured 2026-09-19 by forcing `virtualBase`
  //   to false: the residue goes 5 -> 13 and the share to 0.81%, past the 0.5% ceiling. ]]
  const share = unresolved / (resolved + unresolved);
  assert.ok(share < 0.005, `${(share * 100).toFixed(2)}% of in-repo specifiers unresolved — the graph has a hole; run with --list-unresolved`);

  const listed = run(['--list-unresolved']).out.split('\n')
    .map((l) => /UNRESOLVED (\S+) {2}-> {2}(\S+)/.exec(l)).filter(Boolean)
    .map((m) => ({ file: m[1], spec: m[2] }));
  assert.equal(listed.length, unresolved, `the count says ${unresolved} and the list names ${listed.length}`);
  assert.ok(listed.length > 0, 'nothing listed — this assertion would check nothing');

  const inProductSource = listed.filter(({ file }) => !/\.test\.|(^|\/)tests?\//.test(file));
  assert.deepEqual(inProductSource, [],
    `unresolved specifier(s) in source that is not a test: ${inProductSource.map((u) => `${u.file} -> ${u.spec}`).join(', ')}`
    + ' — a quoted sample can only be in a test, so this is a resolver hole or a broken import');
});

test('--list-unresolved names the specifiers the count is counting', () => {
  // The count alone is an assertion nobody can act on: 55 was a number, and every attempt to move
  // it was a guess about which class the resolver was dropping. The flag turns it back into a list
  // of decisions.
  const r = run(['--list-unresolved']);
  const unresolved = Number(/resolved, (\d+) in-repo specifier\(s\) unresolved/.exec(r.out)[1]);
  const listed = r.out.split('\n').filter((l) => l.includes('UNRESOLVED '));
  assert.equal(listed.length, unresolved, `the count says ${unresolved} and the list names ${listed.length}`);
  // Each line carries the file AND the specifier — a specifier with no file is not actionable.
  for (const l of listed) assert.match(l, /UNRESOLVED \S+ {2}-> {2}\S+/, l);
  // And the flag is opt-in: the default report stays the size it was.
  assert.doesNotMatch(run().out, /UNRESOLVED /);
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

test('the graph includes untracked source and excludes deleted or ignored files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'deadends-working-tree-'));
  try {
    mkdirSync(join(dir, 'apps/web/src/lib'), { recursive: true });
    const source = (name, body) => writeFileSync(join(dir, 'apps/web/src/lib', name), body);
    source('removed.ts', 'export const removed = 1;\n');
    source('reached.ts', 'export const used = 1;\n');
    writeFileSync(join(dir, '.gitignore'), 'ignored.ts\n');
    assert.equal(spawnSync('git', ['init', '-q'], { cwd: dir }).status, 0);
    assert.equal(spawnSync('git', ['add', '--', '.gitignore', 'apps/web/src/lib/removed.ts', 'apps/web/src/lib/reached.ts'], { cwd: dir }).status, 0);
    rmSync(join(dir, 'apps/web/src/lib/removed.ts'));
    // Assemble fixture imports so the real-tree regex does not treat them as real edges.
    const importLine = (target) => `${['im', 'port'].join('')} { used } from './${target}';\n`;
    source('fresh.ts', 'export const used = 2;\n');
    source('fresh-entry.ts', importLine('fresh') + importLine('reached') + 'export const entry = 1;\n');
    source('ignored.ts', 'export const ignored = 1;\n');
    const invoke = (checker) => spawnSync('node', [checker, '--root', dir], { encoding: 'utf8', timeout: 30_000 });
    const result = invoke(CHECKER);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /GRAPH 2 import edge\(s\) resolved, 0 in-repo/);
    assert.match(result.stdout, /fresh-entry\.ts/);
    assert.doesNotMatch(result.stdout, /(?:removed|reached|ignored|fresh)\.ts/);

    // Falsify the inventory mechanism, without changing the shared checkout.
    const original = readFileSync(CHECKER, 'utf8');
    const needle = "'--cached', '--others', '--exclude-standard'";
    assert.equal(original.split(needle).length - 1, 1);
    const broken = join(dir, 'checker.cjs.mjs');
    writeFileSync(broken, original.replace(needle, "'--cached', '--exclude-standard'"));
    const control = invoke(broken);
    assert.equal(control.status, 0, control.stderr);
    assert.match(control.stdout, /reached\.ts/, 'omitting untracked importers must reopen the false dead end');
    assert.doesNotMatch(control.stdout, /GRAPH 2 import edge\(s\) resolved/);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test('it finds a module nothing imports', () => {
  // PLANTED INTO A CLONE, not borrowed from the repository and not written into it.
  //
  // This used to name a real file — apps/web/src/components/plans.tsx, written mid-flight for w12
  // and never given an importer. That made the test a hostage to the repository staying broken in
  // one specific way: the day a peer session wired plans.tsx, which is the outcome everyone
  // wanted, this test went red reporting a checker that was working perfectly. A test whose
  // fixture IS the defect it describes must be repaired every time the defect is fixed, and the
  // cheapest repair is always to delete it.
  //
  // Planting into the real tree was the other option and is worse: the checker enumerates
  // `git ls-files`, so the plant has to be added to a shared index while other sessions are
  // working in it. Hence `--root`.
  const dir = mkdtempSync(join(tmpdir(), 'deadends-'));
  try {
    for (const rel of ['apps/web/src/lib', 'docs/backlog', 'scripts']) mkdirSync(join(dir, rel), { recursive: true });
    writeFileSync(join(dir, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n");
    writeFileSync(join(dir, 'docs', 'backlog', 'DEADENDS.md'), '# dead ends\n');
    writeFileSync(join(dir, 'apps', 'web', 'src', 'lib', 'reached.ts'), "export const used = 1;\n");
    writeFileSync(join(dir, 'apps', 'web', 'src', 'lib', 'entry.ts'), "import { used } from './reached';\nexport const app = used;\n");
    writeFileSync(join(dir, 'apps', 'web', 'src', 'lib', 'orphan.ts'), 'export const nothingImportsThis = 1;\n');
    spawnSync('git', ['init', '-q'], { cwd: dir });
    spawnSync('git', ['add', '-A'], { cwd: dir });

    const p = spawnSync('node', [CHECKER, '--root', dir], { cwd: ROOT, encoding: 'utf8', timeout: 120_000 });
    const out = `${p.stdout ?? ''}${p.stderr ?? ''}`;
    assert.match(out, /orphan\.ts/, `a module with no importer must be named: ${out}`);
    assert.match(out, /[1-9]\d* module\(s\) with no importer/, 'and counted');

    // THE CONTROL. `reached.ts` has an importer and must NOT be reported, or the assertion above
    // is satisfied by a checker that calls everything dead.
    assert.doesNotMatch(out, /reached\.ts/, 'a module WITH an importer must not be reported');
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test('it distinguishes "no importer" from "reached only by a test"', () => {
  // The critic.ts shape is the second one, and it is the more dangerous: every unit test passes
  // while nothing ships. Collapsing the two would lose that distinction.
  const r = run();
  assert.match(r.out, /module\(s\) with no importer/);
  assert.match(r.out, /module\(s\) reached only from a test or eval harness/);
});

/* THE TEST THAT USED TO SIT HERE WROTE INTO THE REAL REPOSITORY AND THE REAL GIT INDEX.
 *
 * It wrote apps/web/src/lib/planted-dead-end.ts into the working tree, `git add`ed it so
 * `git ls-files` would see it, and removed it with `git rm -f` in a finally. In a checkout shared
 * by several live sessions that is not a test, it is a race: between the add and the rm, whichever
 * session commits next takes the file — because `git commit` writes the whole index, not the paths
 * that session staged. It happened twice on 2026-09-15. One commit shipped the fixture; a later one
 * shipped its deletion; neither author had touched the file, and the second author spent real time
 * working out whose uncommitted work they had just destroyed.
 *
 * It was also redundant. 'it finds a module nothing imports' above plants the same orphan into a
 * temp clone via --root, asserts it is named AND counted, and carries the control this one lacked:
 * a module that DOES have an importer and must not be reported. That control is the difference
 * between proving the checker looks and proving it can produce output.
 *
 * --root exists for exactly this, and its own comment in the checker says so. One test was moved
 * over and this one was left behind.
 */

/* ------------------------------------------------------- the disposition gate --- */

test('--gate passes only when every entry carries a disposition', () => {
  const r = run(['--gate']);
  assert.equal(r.exit, 0, r.out);
  assert.match(r.out, /DEADENDS ALL DISPOSITIONED/);
});

test('--gate fails when an entry has none', () => {
  // HERMETIC, for the same reason as the plant above. This used to edit the REAL DEADENDS.md,
  // swapping `plans.tsx — WIRE` for prose and restoring it afterwards. It depended on plans.tsx
  // still being an undispositioned dead end, and it mutated a tracked ledger in a tree other
  // sessions are working in — so a crash between the write and the finally would have left a
  // corrupted ledger behind with no indication of why.
  const dir = mkdtempSync(join(tmpdir(), 'deadends-gate-'));
  try {
    mkdirSync(join(dir, 'apps/web/src/lib'), { recursive: true });
    mkdirSync(join(dir, 'docs/backlog'), { recursive: true });
    writeFileSync(join(dir, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n");
    writeFileSync(join(dir, 'apps', 'web', 'src', 'lib', 'orphan.ts'), 'export const nothingImportsThis = 1;\n');
    writeFileSync(join(dir, 'docs', 'backlog', 'DEADENDS.md'), '# dead ends\n\n- apps/web/src/lib/orphan.ts — thinking about it\n');
    spawnSync('git', ['init', '-q'], { cwd: dir });
    spawnSync('git', ['add', '-A'], { cwd: dir });

    const undecided = spawnSync('node', [CHECKER, '--root', dir, '--gate'], { cwd: ROOT, encoding: 'utf8', timeout: 120_000 });
    const out = `${undecided.stdout ?? ''}${undecided.stderr ?? ''}`;
    assert.equal(undecided.status, 1, out);
    assert.match(out, /NO DISPOSITION: apps\/web\/src\/lib\/orphan\.ts/);

    // THE CONTROL: one of the three words, and the same tree passes. Without it this would also
    // pass against a --gate that failed unconditionally.
    writeFileSync(join(dir, 'docs', 'backlog', 'DEADENDS.md'), '# dead ends\n\n- apps/web/src/lib/orphan.ts — WIRE into the workspace next pass\n');
    spawnSync('git', ['add', '-A'], { cwd: dir });
    const decided = spawnSync('node', [CHECKER, '--root', dir, '--gate'], { cwd: ROOT, encoding: 'utf8', timeout: 120_000 });
    assert.equal(decided.status, 0, `${decided.stdout}${decided.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
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
