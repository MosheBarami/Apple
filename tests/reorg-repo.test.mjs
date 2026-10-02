// scripts/reorg-repo.mjs is the engine behind the repository reorganisation. These tests run it against a throwaway
// repository and prove the properties its header promises: a dry run writes nothing, a move rewrites every kind of
// reference (literal path, quoted segments, relative import, relative markdown link), a count mismatch writes
// nothing, a second apply changes nothing, a conflict stops, and --check fails on a stale reference.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'reorg-repo.mjs');
const sh = (cwd, ...a) => execFileSync(a[0], a.slice(1), { cwd, encoding: 'utf8' });

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'reorg-repo-'));
  const put = (p, s) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), s); };
  put('infra/deploy.mjs', "import { x } from '../scripts/lib/x.mjs';\nconst root = new URL('..', import.meta.url).pathname;\nconsole.log(x, root);\n");
  put('tools/check.py', 'p = ROOT / "infra" / "deploy.mjs"\n');
  put('scripts/lib/x.mjs', 'export const x = 1;\n');
  put('tests/uses.test.mjs', "import { join } from 'node:path';\nconst a = join(ROOT, 'infra', 'deploy.mjs');\nconst b = 'infra/deploy.mjs';\nconst c = new URL('../infra/deploy.mjs', import.meta.url);\n");
  put('docs/OLD.md', '# Old\nsee [the runbook](RUNBOOK.md) and `docs/RUNBOOK.md`\n');
  put('docs/RUNBOOK.md', '# Runbook\nback to [old](OLD.md); the deploy script is infra/deploy.mjs\n');
  put('docs/trash.md', 'to be deleted\n');
  put('docs/keeps.md', 'mentions nothing\nversion: 1\n');
  put('scripts/reorg/plan.json', JSON.stringify({
    phases: { P1: { title: 't', default: true } },
    deletes: [{ path: 'docs/trash.md', phase: 'P1' }],
    moves: [
      { from: 'infra/deploy.mjs', to: 'platforms/cloudflare/deploy/deploy.mjs', phase: 'P1' },
      { from: 'docs/RUNBOOK.md', to: 'docs/operations/RUNBOOK.md', phase: 'P1' },
    ],
    refEdits: [{ file: 'docs/keeps.md', phase: 'P1', find: 'version: 1', replace: 'version: 2', expect: 1, rerunOk: true }],
    allowedMentions: [],
  }));
  sh(dir, 'git', 'init', '-q');
  sh(dir, 'git', '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'add', '-A');
  sh(dir, 'git', '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'fixture');
  return { dir, put, read: (p) => readFileSync(join(dir, p), 'utf8') };
}
const run = (dir, ...args) => spawnSync(process.execPath, [ENGINE, '--plan', join(dir, 'scripts/reorg/plan.json'), '--quiet', ...args], { cwd: dir, encoding: 'utf8' });

test('a dry run writes nothing', () => {
  const f = fixture();
  try {
    const r = run(f.dir);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(sh(f.dir, 'git', 'status', '--porcelain').trim(), '');
    assert.ok(existsSync(join(f.dir, 'infra/deploy.mjs')));
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test('--apply refuses the main checkout unless told it is a worktree', () => {
  const f = fixture();
  try {
    const r = run(f.dir, '--apply');
    assert.equal(r.status, 2);
    assert.ok(existsSync(join(f.dir, 'infra/deploy.mjs')), 'nothing moved');
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test('apply moves, deletes and rewrites every kind of reference; a second apply changes nothing', () => {
  const f = fixture();
  try {
    const r = run(f.dir, '--apply', '--i-am-in-a-worktree');
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!existsSync(join(f.dir, 'infra/deploy.mjs')));
    assert.ok(!existsSync(join(f.dir, 'docs/trash.md')));
    // the moved script: its relative import and its URL root were recomputed for the new depth
    const moved = f.read('platforms/cloudflare/deploy/deploy.mjs');
    assert.match(moved, /from '\.\.\/\.\.\/\.\.\/scripts\/lib\/x\.mjs'/);
    assert.match(moved, /new URL\('\.\.\/\.\.\/\.\.', import\.meta\.url\)/);
    // a reader: quoted segments, a literal path, a relative specifier
    const reader = f.read('tests/uses.test.mjs');
    assert.match(reader, /join\(ROOT, 'platforms', 'cloudflare', 'deploy', 'deploy\.mjs'\)/);
    assert.match(reader, /'platforms\/cloudflare\/deploy\/deploy\.mjs'/);
    assert.match(reader, /new URL\('\.\.\/platforms\/cloudflare\/deploy\/deploy\.mjs', import\.meta\.url\)/);
    // python pathlib segments
    assert.match(f.read('tools/check.py'), /ROOT \/ "platforms" \/ "cloudflare" \/ "deploy" \/ "deploy\.mjs"/);
    // markdown: a relative link to a moved doc, a literal path, and the moved doc's own links
    assert.match(f.read('docs/OLD.md'), /\]\(operations\/RUNBOOK\.md\)/);
    assert.match(f.read('docs/OLD.md'), /`docs\/operations\/RUNBOOK\.md`/);
    assert.match(f.read('docs/operations/RUNBOOK.md'), /\]\(\.\.\/OLD\.md\)/);
    assert.match(f.read('docs/operations/RUNBOOK.md'), /platforms\/cloudflare\/deploy\/deploy\.mjs/);
    assert.match(f.read('docs/keeps.md'), /version: 2/);
    // the touched list is complete and --check is clean
    assert.equal(run(f.dir, '--check').status, 0, run(f.dir, '--check').stdout);
    // idempotent: commit the result, apply again, no diff
    sh(f.dir, 'git', 'add', '-A');
    sh(f.dir, 'git', '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'applied');
    const again = run(f.dir, '--apply', '--i-am-in-a-worktree');
    assert.equal(again.status, 0, again.stderr);
    assert.equal(sh(f.dir, 'git', 'status', '--porcelain').trim(), '');
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test('an edit whose match count differs from the plan stops the run and writes nothing', () => {
  const f = fixture();
  try {
    const plan = JSON.parse(f.read('scripts/reorg/plan.json'));
    plan.refEdits[0].expect = 3;
    f.put('scripts/reorg/plan.json', JSON.stringify(plan));
    const r = run(f.dir, '--apply', '--i-am-in-a-worktree');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /count mismatch/);
    assert.ok(existsSync(join(f.dir, 'infra/deploy.mjs')), 'the move was not performed');
    assert.ok(existsSync(join(f.dir, 'docs/trash.md')), 'the delete was not performed');
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test('a move whose destination already exists is a conflict, never an overwrite', () => {
  const f = fixture();
  try {
    f.put('platforms/cloudflare/deploy/deploy.mjs', 'something else\n');
    sh(f.dir, 'git', 'add', '-A');
    sh(f.dir, 'git', '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'occupied');
    const r = run(f.dir, '--apply', '--i-am-in-a-worktree');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /CONFLICT/);
    assert.equal(f.read('platforms/cloudflare/deploy/deploy.mjs'), 'something else\n');
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test('--check fails when a live file still names a moved path', () => {
  const f = fixture();
  try {
    assert.equal(run(f.dir, '--apply', '--i-am-in-a-worktree').status, 0);
    f.put('docs/keeps.md', 'run node infra/deploy.mjs again\n');
    const r = run(f.dir, '--check');
    assert.equal(r.status, 1);
    assert.match(r.stdout, /stale path\s+docs\/keeps\.md/);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});
