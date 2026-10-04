// scripts/check-old-names.mjs: the guard that keeps the former names (Apple, Golem) out of the tree.
// Ported from the 2026-10-02 golem guard's tests when the guard took over both names (StudPilot
// handoff task 1.2). Each property is tested on a scratch git repository, and the real tree is
// checked last, with a mutation that proves the guard is reading it.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parseAllowlist } from '../scripts/check-old-names.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const GUARD = join(REPO, 'scripts/check-old-names.mjs');
// The one place this file spells the words; everything below is built from them.
const OLD_A = 'app' + 'le';
const OLD_G = 'gol' + 'em';

const sh = (cwd, args) => execFileSync('git', args, { cwd, stdio: 'pipe' });

/** A scratch repo with `files` committed, plus an allowlist file outside its tracked set. */
function scratch(files, lines) {
  const dir = mkdtempSync(join(tmpdir(), 'check-old-names-'));
  sh(dir, ['init', '-q']);
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  sh(dir, ['add', '-A']);
  const allow = join(dir, '.allow.txt');
  writeFileSync(allow, lines.join('\n') + '\n');
  return { dir, allow };
}
const run = (s, extra = []) => spawnSync('node', [GUARD, '--root', s.dir, '--allowlist', s.allow, ...extra], { encoding: 'utf8' });
const line = (o = {}) => {
  const e = { scope: 'content', paths: 'a.txt', token: `X-${OLD_G}-Token`, max: '1', reason: 'a compatibility shim in a test', removal: 'when the counters read zero', ...o };
  return [e.scope, e.paths, e.token, e.max, e.reason, e.removal].join(' | ');
};
const done = (s) => rmSync(s.dir, { recursive: true, force: true });

test('control: a tree with neither old name and no allowlist passes', () => {
  const s = scratch({ 'a.txt': 'StudPilot is the product\n' }, []);
  try { const r = run(s); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /CLEAN/); } finally { done(s); }
});

test('each old name in an ordinary file fails, and the report names the file and line', () => {
  for (const word of [OLD_A, OLD_G]) {
    const s = scratch({ 'a.txt': `fine\nthis says ${word[0].toUpperCase()}${word.slice(1)} by mistake\n` }, []);
    try {
      const r = run(s);
      assert.equal(r.status, 1, word);
      assert.match(r.stderr, /a\.txt:2/, word);
    } finally { done(s); }
  }
});

test('the check is case-insensitive and catches the known misspelling', () => {
  const s = scratch({ 'a.txt': `${OLD_A.toUpperCase()}\n${OLD_G.replace('l', 'll')}\n` }, []);
  try { const r = run(s, ['--count']); assert.equal(r.status, 1); assert.equal(r.stdout.trim(), '2'); } finally { done(s); }
});

test('a hit inside a BINARY file fails — a built artifact carries strings too', () => {
  const s = scratch({ 'b.bin': Buffer.concat([Buffer.from([0, 1, 2, 0]), Buffer.from(`${OLD_A}Studio`)]) }, []);
  try { assert.equal(run(s).status, 1); } finally { done(s); }
});

test('a path NAME carrying an old name fails even when the contents are clean', () => {
  const s = scratch({ [`src/${OLD_A}-mark.css`]: 'body {}\n' }, []);
  try { const r = run(s); assert.equal(r.status, 1); assert.match(r.stderr, /PATH/); } finally { done(s); }
});

test('an allowlisted word in the named file passes, at exactly its pin', () => {
  const s = scratch({ 'a.txt': `X-${OLD_G}-Token\n` }, [line()]);
  try { const r = run(s); assert.equal(r.status, 0, r.stderr); } finally { done(s); }
});

test('a count OVER the pin fails: the allowlist cannot grow silently', () => {
  const s = scratch({ 'a.txt': `X-${OLD_G}-Token\nX-${OLD_G}-Token\n` }, [line()]);
  try { const r = run(s); assert.equal(r.status, 1); assert.match(r.stderr, /pinned at 1/); } finally { done(s); }
});

test('a count UNDER the pin fails too: removal progress must be recorded, not left as cover', () => {
  const s = scratch({ 'a.txt': `X-${OLD_G}-Token\n` }, [line({ max: '2' })]);
  try { const r = run(s); assert.equal(r.status, 1); assert.match(r.stderr, /lower the pin/); } finally { done(s); }
});

test('a line that matches nothing fails: a stale exception cannot hide', () => {
  const s = scratch({ 'a.txt': 'clean\n' }, [line()]);
  try { const r = run(s); assert.equal(r.status, 1); assert.match(r.stderr, /matches nothing/); } finally { done(s); }
});

test('an allowed token does not bless a different word in the same file', () => {
  const s = scratch({ 'a.txt': `X-${OLD_G}-Token\nBuilt with ${OLD_A}\n` }, [line()]);
  try { const r = run(s); assert.equal(r.status, 1); assert.match(r.stderr, /a\.txt:2/); } finally { done(s); }
});

test('a line for a different file does not cover this one', () => {
  const s = scratch({ 'a.txt': `X-${OLD_G}-Token\n`, 'b.txt': `X-${OLD_G}-Token\n` }, [line()]);
  try { const r = run(s); assert.equal(r.status, 1); assert.match(r.stderr, /b\.txt:1/); } finally { done(s); }
});

test('a line with no removal condition is refused outright (exit 2)', () => {
  const s = scratch({ 'a.txt': `X-${OLD_G}-Token\n` }, [line({ removal: '' })]);
  try { assert.equal(run(s).status, 2); } finally { done(s); }
});

test('a wildcard line is refused outside recorded history and migrations (exit 2)', () => {
  const s = scratch({ 'src/a.ts': `${OLD_A}\n` }, [line({ paths: 'src/**', token: '*', max: '*' })]);
  try { assert.equal(run(s).status, 2); } finally { done(s); }
});

test('a wildcard line IS accepted for docs/evidence, which is a record and is never rewritten', () => {
  const s = scratch({ 'docs/evidence/run.md': `${OLD_A} built it\n${OLD_G} too\n` }, [line({ paths: 'docs/evidence/**', token: '*', max: '*' })]);
  try { const r = run(s); assert.equal(r.status, 0, r.stderr); } finally { done(s); }
});

test('zero tracked files is an instrument failure (exit 2), never a pass', () => {
  const dir = mkdtempSync(join(tmpdir(), 'check-old-names-empty-'));
  try {
    sh(dir, ['init', '-q']);
    const r = spawnSync('node', [GUARD, '--root', dir, '--allowlist', join(dir, 'none.txt')], { encoding: 'utf8' });
    assert.equal(r.status, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('parseAllowlist: six fields, a reason and a removal, or the line is refused', () => {
  const ok = parseAllowlist(line());
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.entries.length, 1);
  assert.equal(ok.entries[0].max, 1);
  assert.ok(parseAllowlist('content | a.txt | x | 1 | too few').problems.length > 0);
  assert.ok(parseAllowlist(line({ max: '0' })).problems.length > 0);
  assert.ok(parseAllowlist(line({ token: '*', max: '1', paths: 'docs/evidence/**' })).problems.length > 0, 'a wildcard carries no count');
  assert.deepEqual(parseAllowlist('# a comment\n\n').entries, []);
});

test('the real tree passes the guard with the committed allowlist', () => {
  const r = spawnSync('node', [GUARD], { cwd: REPO, encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`.slice(0, 4000));
});

test('MUTATION: with the allowlist taken away the real tree goes red — the guard is reading the tree', () => {
  const r = spawnSync('node', [GUARD, '--allowlist', join(tmpdir(), 'no-such-allowlist.txt'), '--count'], { cwd: REPO, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.ok(Number(r.stdout.trim()) > 100, `only ${r.stdout.trim()} violations without the allowlist`);
});

test('every committed allowlist line says why it exists and when it goes', () => {
  const { entries, problems } = parseAllowlist(readFileSync(join(REPO, 'planning/rename-allowlist.txt'), 'utf8'));
  assert.deepEqual(problems, []);
  assert.ok(entries.length > 10, 'the allowlist has almost no lines — this test would check nothing');
  for (const e of entries) {
    assert.ok(e.reason.length >= 8, `${e.where}: no reason`);
    assert.ok(e.removal.length >= 8, `${e.where}: no removal condition`);
  }
});
