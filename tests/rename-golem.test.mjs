// scripts/rename-golem.mjs: the properties the rename depends on, executed on a throwaway tree.
//
// What matters about a codemod is not that it changes things but that it (1) leaves what must not change
// (wire literals, cloud names, history, other people's names) and (2) is a no-op the second time, so it can be
// re-run on a newer `main` instead of hand-merging renames. A third property is a refusal: the phase that makes
// clients send the new wire spellings must not run against a worker that does not accept them yet.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const CODEMOD = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'rename-golem.mjs');
const OLD = 'golem';
const Old = 'Golem';

function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), 'rename-golem-'));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  return dir;
}
const run = (dir, ...args) => spawnSync('node', [CODEMOD, '--root', dir, ...args], { encoding: 'utf8' });
const read = (dir, rel) => readFileSync(join(dir, rel), 'utf8');

const FILES = () => ({
  'package.json': `{ "name": "${OLD}" }\n`,
  'apps/web/package.json': `{ "name": "@${OLD}/web", "dependencies": { "@${OLD}/shared": "workspace:*" } }\n`,
  'apps/web/src/a.ts': `import { x } from '@${OLD}/shared';\n// ${Old} is brand text here\nconst socket = ['${OLD}.v1', '${OLD}.jwt.' + t];\nconst h = 'X-${Old}-Token';\n`,
  'apps/worker/src/b.ts': `const bucket = '${OLD}-corpus'; const w = '${OLD}'; // the ${OLD} worker and the apple worker\n`,
  'infra/c.mjs': `const key = process.env.${OLD.toUpperCase()}_ADMIN_KEY;\nconsole.log('${OLD.toUpperCase()}_ADMIN_KEY missing');\n`,
  'docs/guide.md': `${Old} builds it.\nThe product was renamed from ${Old} to Apple.\nThe ${OLD} worker holds the database.\n`,
  'docs/evidence/run.txt': `${Old} recorded output\n`,
  'packages/asset-library/x.jsonl': `{"creator":"IrritatingGolem"}\n`,
  'packages/asset-library/package.json': `{ "name": "@${OLD}/asset-library" }\n`,
  'packages/corpus/hash.mjs': `const d = '${OLD}/intake/file/v1';\n`,
  'tests/x.test.mjs': `assert.doesNotMatch(out, /${OLD}/i);\nassert.match(src, /from '@${OLD}\\/shared'/);\n`,
  [`types/${OLD}-shapes.d.ts`]: `export {};\n`,
});

test('phase A renames the product, keeps what is protected, and renames the files', () => {
  const dir = tree(FILES());
  try {
    const r = run(dir, '--phase', 'A');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(read(dir, 'package.json'), '{ "name": "apple" }\n', 'the root package');
    assert.match(read(dir, 'apps/web/package.json'), /"@apple\/web".*"@apple\/shared"/);
    assert.match(read(dir, 'packages/asset-library/package.json'), /@apple\/asset-library/, 'the package manifest is ours even under a third-party-data directory');
    const a = read(dir, 'apps/web/src/a.ts');
    assert.match(a, /from '@apple\/shared'/);
    assert.match(a, /Apple is brand text/);
    assert.match(a, new RegExp(`'${OLD}\\.v1'`), 'the wire literal is protected until B2');
    assert.match(a, new RegExp(`'X-${Old}-Token'`));
    const b = read(dir, 'apps/worker/src/b.ts');
    assert.match(b, new RegExp(`'${OLD}-corpus'`), 'a cloud-bound name is protected until C');
    assert.match(b, new RegExp(`w = '${OLD}'`), 'the quoted worker name is protected until C');
    assert.match(b, /the legacy worker and the apple worker/, 'a bare lowercase mention is the OTHER worker, not the brand');
    const c = read(dir, 'infra/c.mjs');
    assert.match(c, /envCompat\('APPLE_ADMIN_KEY'\)/, 'an environment read goes through the compat helper');
    assert.match(c, /import \{ envCompat \} from '\.\.\/scripts\/lib\/env-compat\.mjs';/);
    assert.match(c, /APPLE_ADMIN_KEY missing/, 'and the message names the new variable');
    const doc = read(dir, 'docs/guide.md');
    assert.match(doc, /^Apple builds it\./m);
    assert.match(doc, new RegExp(`renamed from ${Old} to Apple`), 'a sentence ABOUT the rename stays as history');
    assert.match(doc, /The legacy worker holds the database/, 'docs: a line about infrastructure');
    assert.equal(read(dir, 'docs/evidence/run.txt'), `${Old} recorded output\n`, 'recorded runs are never rewritten');
    assert.equal(read(dir, 'packages/asset-library/x.jsonl'), '{"creator":"IrritatingGolem"}\n', 'other people\'s names');
    assert.match(read(dir, 'packages/corpus/hash.mjs'), new RegExp(`'${OLD}/intake/file/v1'`), 'hash domain separators are a phase D decision');
    assert.equal(existsSync(join(dir, `types/${OLD}-shapes.d.ts`)), false);
    assert.equal(existsSync(join(dir, 'types/apple-shapes.d.ts')), true, 'file names are renamed');
    const t = read(dir, 'tests/x.test.mjs');
    assert.match(t, new RegExp(`doesNotMatch\\(out, /${OLD}/i\\)`), 'an ABSENCE pattern is left for a human, never turned into a check for the new name');
    assert.match(t, /from '@apple\\\/shared'/, 'but the escaped package scope inside a regex is renamed');
    assert.match(r.stdout, /NEEDS HUMAN/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('IDEMPOTENT: the second run changes nothing', () => {
  const dir = tree(FILES());
  try {
    assert.equal(run(dir, '--phase', 'A').status, 0);
    const second = run(dir, '--phase', 'A');
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /nothing to change: this run is a no-op/);
    assert.match(second.stdout, /files changed: 0 +paths renamed: 0/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('--dry-run writes nothing and renames nothing, and still reports', () => {
  const dir = tree(FILES());
  try {
    const before = read(dir, 'apps/web/src/a.ts');
    const r = run(dir, '--phase', 'A', '--dry-run');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /DRY RUN/);
    assert.match(r.stdout, /text: token swap/);
    assert.equal(read(dir, 'apps/web/src/a.ts'), before);
    assert.equal(existsSync(join(dir, `types/${OLD}-shapes.d.ts`)), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('--only runs one rule class and leaves the others for the next commit', () => {
  const dir = tree(FILES());
  try {
    assert.equal(run(dir, '--phase', 'A', '--only', 'scope').status, 0);
    assert.match(read(dir, 'apps/web/src/a.ts'), /from '@apple\/shared'/, 'the scope is renamed');
    assert.match(read(dir, 'apps/web/src/a.ts'), new RegExp(`${Old} is brand text`), 'prose is not');
    assert.match(read(dir, 'infra/c.mjs'), new RegExp(`process\\.env\\.${OLD.toUpperCase()}_ADMIN_KEY`), 'neither is an env read');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('phase B2 REFUSES to run while the deployed worker does not report that it accepts both spellings', () => {
  const dir = tree(FILES());
  try {
    const r = run(dir, '--phase', 'B2', '--health-url', 'http://127.0.0.1:9/api/health');
    assert.equal(r.status, 3, r.stderr);
    assert.match(r.stderr, /Not guessing|Refusing/);
    assert.match(read(dir, 'apps/web/src/a.ts'), new RegExp(`'${OLD}\\.v1'`), 'nothing was rewritten');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('phase B2 (forced) renames the wire literals the clients send, and only those', () => {
  const dir = tree(FILES());
  try {
    assert.equal(run(dir, '--phase', 'A').status, 0);
    const r = run(dir, '--phase', 'B2', '--force');
    assert.equal(r.status, 0, r.stderr);
    const a = read(dir, 'apps/web/src/a.ts');
    assert.match(a, /'apple\.v1'/);
    assert.match(a, /'X-Apple-Token'/);
    assert.match(read(dir, 'apps/worker/src/b.ts'), new RegExp(`'${OLD}-corpus'`), 'cloud names still wait for C');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a file the allowlist marks codemod:skip is not touched by B2 (the compatibility shims say the old name on purpose)', () => {
  const files = FILES();
  files['apps/shim/legacy.ts'] = `export const OLD_SPELLING = '${OLD}.v1';\n`;
  files['scripts/golem-allowlist.json'] = JSON.stringify({ entries: [{ id: 's', scope: 'content', paths: ['apps/shim/legacy.ts'], token: `${OLD}\\.v1`, max: 1, codemod: 'skip', reason: 'a shim', removal: 'phase D' }] });
  const dir = tree(files);
  try {
    assert.equal(run(dir, '--phase', 'B2', '--force').status, 0);
    assert.equal(read(dir, 'apps/shim/legacy.ts'), `export const OLD_SPELLING = '${OLD}.v1';\n`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
