/**
 * TESTS FOR THE CHECKER THAT ASKS GIT, NOT THE TREE - scripts/check-committed-imports.mjs.
 *
 * It exists because apps/worker/tests/embedding-retrieval.test.mjs shipped an
 * `await import(join(REPO, 'scripts', 'build-module-embeddings.mjs'))` while that builder was in
 * nobody's clone. Locally: nine green tests. From a clean extract of the same commit:
 * ERR_MODULE_NOT_FOUND, and the whole file does not load, so the nine do not come back red - they
 * do not come back at all.
 *
 * The checker was watched failing on that exact history before this file was written. A clone
 * pinned at f5335cb reports `COMMITTED IMPORTS BROKEN ... apps/worker/tests/
 * embedding-retrieval.test.mjs imports scripts/build-module-embeddings.mjs`, exit 1; the same
 * clone at 68e9b17, which adds the builder and changes nothing else, reports OK, exit 0. The tests
 * below plant the same shapes in throwaway repositories so the guard keeps a failure it can be
 * watched producing on demand, rather than one that happened once.
 *
 * WHAT IS ASSERTED IS THE EXIT CODE, because that is what a gate reads.
 *
 * Run with:  node --test tests/check-committed-imports.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHECKER = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'check-committed-imports.mjs');

function repo({ git = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'committed-imports-'));
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'tests'), { recursive: true });
  if (git) {
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 't@example.invalid'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 't'], { cwd: root });
  }
  return root;
}

/** The shape that shipped: a test that assembles a repo path and imports it at module scope. */
const importer = (root, body) => writeFileSync(join(root, 'tests', 'a.test.mjs'),
  "import { join } from 'node:path';\nconst REPO = '.';\n" + body);

const ASSEMBLED = "await import(`file://${join(REPO, 'scripts', 'thing.mjs')}`);\n";

const track = (root, ...paths) => execFileSync('git', ['add', ...paths], { cwd: root });

function run(root) {
  const r = spawnSync(process.execPath, [CHECKER], {
    encoding: 'utf8',
    env: { ...process.env, COMMITTED_IMPORTS_ROOT: root },
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

test('a committed importer whose target git does not hold is a finding', (t) => {
  const root = repo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  importer(root, ASSEMBLED);
  // The target is written to disk and deliberately NOT added: this is the whole defect. A checker
  // that used existsSync here would call it clean, which is what the tree-reading checkers did.
  writeFileSync(join(root, 'scripts', 'thing.mjs'), 'export const x = 1;\n');
  track(root, 'tests/a.test.mjs');
  const { code, out } = run(root);
  assert.equal(code, 1, out);
  assert.match(out, /COMMITTED IMPORTS BROKEN/);
  assert.match(out, /scripts\/thing\.mjs/);
});

test('the same importer passes once the target is in the index', (t) => {
  const root = repo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  importer(root, ASSEMBLED);
  writeFileSync(join(root, 'scripts', 'thing.mjs'), 'export const x = 1;\n');
  track(root, 'tests/a.test.mjs', 'scripts/thing.mjs');
  const { code, out } = run(root);
  assert.equal(code, 0, out);
  assert.match(out, /COMMITTED IMPORTS OK/);
});

test('a file the importer builds for itself is not missing', (t) => {
  const root = repo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // packages/training/src/measure-library-yield.mjs in the real repository: esbuild writes vm.mjs
  // into a temp directory and the next line imports it. Nothing is absent; nothing should be said.
  importer(root,
    "execFileSync('esbuild', ['--outfile=' + join(REPO, 'scripts', 'thing.mjs')]);\n" + ASSEMBLED);
  track(root, 'tests/a.test.mjs');
  const { code, out } = run(root);
  assert.equal(code, 0, out);
});

test('the exemption expires with the writer that earned it', (t) => {
  const root = repo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // Same file as the test above with the --outfile line deleted. If the exemption were a list of
  // paths instead of a reading of the source, this would still pass, and that is the bug in lists.
  importer(root, ASSEMBLED);
  track(root, 'tests/a.test.mjs');
  assert.equal(run(root).code, 1);
});

test('an import whose path is a variable is not a finding, because nobody could act on it', (t) => {
  const root = repo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  importer(root, "const name = process.argv[2];\nawait import(join(REPO, name));\n");
  // There has to be one real site or the checker refuses to answer at all, which is the next test.
  writeFileSync(join(root, 'tests', 'b.test.mjs'),
    "import { join } from 'node:path';\nconst REPO = '.';\n" + ASSEMBLED);
  writeFileSync(join(root, 'scripts', 'thing.mjs'), 'export const x = 1;\n');
  track(root, 'tests/a.test.mjs', 'tests/b.test.mjs', 'scripts/thing.mjs');
  const { code, out } = run(root);
  assert.equal(code, 0, out);
});

test('finding no import site at all is refused, not reported as clean', (t) => {
  const root = repo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'tests', 'a.test.mjs'), 'export const x = 1;\n');
  track(root, 'tests/a.test.mjs');
  const { code, out } = run(root);
  assert.equal(code, 2, out);
  assert.match(out, /UNREADABLE/);
});

test('no git index is refused, not reported as clean', (t) => {
  const root = repo({ git: false });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { code, out } = run(root);
  assert.equal(code, 2, out);
  assert.match(out, /UNREADABLE/);
});

test('the real repository is clean, asked of git rather than of the tree', () => {
  const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
  const r = spawnSync(process.execPath, [CHECKER], { encoding: 'utf8', cwd: REPO });
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
});
