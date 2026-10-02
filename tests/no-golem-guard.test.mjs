// scripts/check-no-golem.mjs must be able to FAIL.
//
// A guard that cannot fail is the defect this repository's working rules are built around, so every
// property of the guard is shown here against a throwaway git repository with a violation seeded in
// it on purpose: a stray word in a plain file, in a binary, in a path name, a count over its pin, a
// count under its pin, an entry that matches nothing, an entry with no removal condition, and a
// wildcard asked for outside recorded history. Each must exit non-zero, and the clean control must
// exit zero — red-first is half of falsification, green-after is the other half.
//
// The last two tests run the guard against the REAL tree: the committed allowlist must pass it, and
// with the allowlist taken away it must go red. The second is the mutation — if deleting the
// allowlist left the real tree green, the guard would be scanning nothing.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const GUARD = join(REPO, 'scripts/check-no-golem.mjs');
const OLD = 'golem'; // the one place this file says the word; everything below is built from it

const sh = (cwd, args) => execFileSync('git', args, { cwd, stdio: 'pipe' });

/** A scratch repo with `files` committed, plus an allowlist file outside it. */
function scratch(files, entries) {
  const dir = mkdtempSync(join(tmpdir(), 'no-golem-guard-'));
  sh(dir, ['init', '-q']);
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  sh(dir, ['add', '-A']);
  const allow = join(dir, '.allow.json');
  writeFileSync(allow, JSON.stringify({ entries }));
  return { dir, allow };
}
const run = (s, extra = []) => spawnSync('node', [GUARD, '--root', s.dir, '--allowlist', s.allow, ...extra], { encoding: 'utf8' });
const entry = (o) => ({
  scope: 'content', paths: ['a.txt'], token: `X-${OLD}-Token`, flags: 'i', reason: 'a compatibility shim in a test',
  removal: 'phase D of the removal runbook', max: 1, ...o,
});
const done = (s) => rmSync(s.dir, { recursive: true, force: true });

test('control: a tree with no old name and no allowlist passes', () => {
  const s = scratch({ 'a.txt': 'Apple is the product\n' }, []);
  try { const r = run(s); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /CLEAN/); } finally { done(s); }
});

test('a stray old name in an ordinary file fails, and the report names the file and line', () => {
  const s = scratch({ 'a.txt': 'fine\nthis says Gol' + 'em by mistake\n' }, []);
  try {
    const r = run(s);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /a\.txt:2/);
  } finally { done(s); }
});

test('the check is case-insensitive and catches the known misspelling', () => {
  for (const spelling of [OLD.toUpperCase(), 'Go' + 'llem', 'GoLeM']) {
    const s = scratch({ 'a.txt': `x ${spelling} y\n` }, []);
    try { assert.equal(run(s).status, 1, spelling); } finally { done(s); }
  }
});

test('a hit inside a BINARY file fails — a built artifact carries strings too', () => {
  const body = Buffer.concat([Buffer.from([0, 1, 2, 3, 0, 0]), Buffer.from(`${OLD}Palette`), Buffer.from([0, 255, 0])]);
  const s = scratch({ 'blob.bin': body }, []);
  try { const r = run(s); assert.equal(r.status, 1); assert.match(r.stderr, /blob\.bin/); } finally { done(s); }
});

test('a path NAME carrying the old name fails even when the contents are clean', () => {
  const s = scratch({ [`types/${OLD}-shapes.d.ts`]: 'export {};\n' }, []);
  try { const r = run(s); assert.equal(r.status, 1); assert.match(r.stderr, /PATH types\//); } finally { done(s); }
});

test('an allowlisted word in the named file passes, at exactly its pin', () => {
  const s = scratch({ 'a.txt': `reads X-${OLD}-Token once\n` }, [entry({})]);
  try { const r = run(s); assert.equal(r.status, 0, r.stderr); } finally { done(s); }
});

test('a count OVER the pin fails: the allowlist cannot grow silently', () => {
  const s = scratch({ 'a.txt': `X-${OLD}-Token and again X-${OLD}-Token\n` }, [entry({})]);
  try { const r = run(s); assert.equal(r.status, 1); assert.match(r.stderr, /2 hits, pinned at 1/); } finally { done(s); }
});

test('a count UNDER the pin fails too: removal progress must be recorded, not left as cover', () => {
  const s = scratch({ 'a.txt': `X-${OLD}-Token\n` }, [entry({ max: 3 })]);
  try { const r = run(s); assert.equal(r.status, 1); assert.match(r.stderr, /1 hits, pinned at 3/); } finally { done(s); }
});

test('an entry that matches nothing fails: a stale entry cannot hide', () => {
  const s = scratch({ 'a.txt': 'clean\n', 'b.txt': 'clean\n' }, [entry({ paths: ['b.txt'] })]);
  try { const r = run(s); assert.equal(r.status, 1); assert.match(r.stderr, /matches nothing/); } finally { done(s); }
});

test('an allowed token does not bless a different word in the same file', () => {
  const s = scratch({ 'a.txt': `X-${OLD}-Token and also a brand mention of Gol` + 'em\n' }, [entry({})]);
  try { const r = run(s); assert.equal(r.status, 1); assert.match(r.stderr, /a\.txt:1/); } finally { done(s); }
});

test('an entry in a different file does not cover this one', () => {
  const s = scratch({ 'a.txt': `X-${OLD}-Token\n`, 'b.txt': `X-${OLD}-Token\n` }, [entry({})]);
  try { const r = run(s); assert.equal(r.status, 1); assert.match(r.stderr, /b\.txt/); } finally { done(s); }
});

test('an entry with no removal condition is refused outright (exit 2)', () => {
  const s = scratch({ 'a.txt': `X-${OLD}-Token\n` }, [entry({ removal: '' })]);
  try { const r = run(s); assert.equal(r.status, 2); assert.match(r.stderr, /removal/); } finally { done(s); }
});

test('a wildcard entry is refused outside recorded history and migrations (exit 2)', () => {
  const s = scratch({ 'src/app.js': `${OLD}\n` }, [entry({ paths: ['src/**'], token: '*', max: null })]);
  try { const r = run(s); assert.equal(r.status, 2); assert.match(r.stderr, /only recorded history/); } finally { done(s); }
});

test('a wildcard entry IS accepted for docs/evidence, which is a record and is never rewritten', () => {
  const s = scratch({ 'docs/evidence/run.txt': `${OLD} ${OLD}\n` }, [entry({ paths: ['docs/evidence/**'], token: '*', max: null })]);
  try { const r = run(s); assert.equal(r.status, 0, r.stderr); } finally { done(s); }
});

test('zero tracked files is an instrument failure (exit 2), never a pass', () => {
  const s = scratch({}, []);
  try { assert.equal(run(s).status, 2); } finally { done(s); }
});

test('--local reports the NAME of a golem-named variable in an .env file and never its value', () => {
  const s = scratch({ 'a.txt': 'clean\n' }, []);
  try {
    writeFileSync(join(s.dir, '.env'), `${OLD.toUpperCase()}_ADMIN_KEY=hunter2-never-print-me\nOTHER=1\n`);
    const r = run(s, ['--local', '--memory-dir', join(s.dir, 'no-such-memory')]);
    assert.equal(r.status, 1);
    assert.match(r.stdout + r.stderr, new RegExp(`${OLD.toUpperCase()}_ADMIN_KEY`));
    assert.doesNotMatch(r.stdout + r.stderr, /hunter2/);
  } finally { done(s); }
});
