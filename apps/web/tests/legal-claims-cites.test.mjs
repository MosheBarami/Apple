/**
 * THE LINE CITES IN planning/proof/M2/LEGAL-CLAIMS.md TO THE APP'S OWN FILES CANNOT DRIFT SILENTLY (M2 fix cycle 2).
 *
 * The legal-claims table is evidence: every row says where in the code the claim is true. A comment added above a cited line moved six of
 * them by one (`auth-pages.tsx:853` was really 854) and nothing noticed, because a line number alone cannot tell you what it was meant to point at.
 *
 * So a cite into a file of apps/web/src is written WITH THE SYMBOL it points at, in one code span:
 *
 *     `auth-pages.tsx:854 supabase.auth.signUp(`          one line: the text after the space must be on line 854
 *     `roblox-signin.ts:299-323 describeConnection`        a range: the text must be on one of the lines 299 to 323
 *
 * and this test reads the file and fails when the text is not on the cited line, saying where it is now. A cite with no symbol fails too (so
 * a bare `auth-pages.tsx:854` cannot come back), and so does a `:96` continuation that borrows the file of the cite before it.
 *
 * Scope: the cites into apps/web/src. A file name that also exists under apps/worker/src (`turnstile.ts`) is ambiguous and is not read as an app
 * file; the worker's own cites belong to the lanes that own the worker and are not checked here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { WEB } from './ui-bundle.mjs';

const ROOT = join(WEB, '..', '..');
const DOC = 'planning/proof/M2/LEGAL-CLAIMS.md';
const walk = (dir) => readdirSync(join(ROOT, dir), { recursive: true }).filter((f) => /\.(tsx?|mjs|css)$/.test(f)).map((f) => `${dir}/${f}`);
const APP = walk('apps/web/src');
const WORKER = walk('apps/worker/src');

/** Where a cited file name is: its path under apps/web/src when it is an app file and nothing else answers to the name, otherwise null. */
function appFile(name) {
  if (name.includes('/')) return name.startsWith('apps/web/src/') ? name : null;
  const inApp = APP.filter((f) => basename(f) === name);
  const elsewhere = [...WORKER].filter((f) => basename(f) === name);
  return inApp.length === 1 && elsewhere.length === 0 ? inApp[0] : null;
}

/** Every line cite in the document, in reading order, with the file a `:NNN` continuation inherits. */
export function citesIn(markdown) {
  const cites = [];
  markdown.split('\n').forEach((line, at) => {
    let inherited = null;
    for (const m of line.matchAll(/`([^`]+)`/g)) {
      const full = /^([\w./-]+\.(?:tsx?|mjs|css)):(\d+)(?:-(\d+))?(?:\s+(.+))?$/.exec(m[1]);
      const more = /^:(\d+)(?:-(\d+))?(?:\s+(.+))?$/.exec(m[1]);
      if (full) {
        inherited = full[1];
        cites.push({ docLine: at + 1, span: m[1], file: full[1], from: Number(full[2]), to: Number(full[3] ?? full[2]), needle: full[4]?.trim(), continuation: false });
      } else if (more && inherited) {
        cites.push({ docLine: at + 1, span: m[1], file: inherited, from: Number(more[1]), to: Number(more[2] ?? more[1]), needle: more[3]?.trim(), continuation: true });
      }
    }
  });
  return cites;
}

/** What is wrong with each cite, as sentences. `read` gives the lines of an app file by its path. */
function problems(list, read) {
  const wrong = [];
  for (const c of list) {
    const where = `${DOC}:${c.docLine} \`${c.span}\``;
    if (c.continuation) { wrong.push(`${where}: a bare continuation borrows the file of the cite before it; write \`${c.file}:${c.from} <symbol>\``); continue; }
    if (!c.needle) { wrong.push(`${where}: cited with no symbol, so nothing can tell when it drifts; write \`${c.file}:${c.from} <text on that line>\``); continue; }
    const lines = read(c.path);
    if (c.from < 1 || c.to > lines.length || c.to < c.from) { wrong.push(`${where}: ${c.path} has ${lines.length} lines`); continue; }
    if (lines.slice(c.from - 1, c.to).some((l) => l.includes(c.needle))) continue;
    const found = lines.flatMap((l, i) => (l.includes(c.needle) ? [i + 1] : []));
    wrong.push(`${where}: "${c.needle}" is not on ${c.from === c.to ? `line ${c.from}` : `lines ${c.from}-${c.to}`} of ${c.path}; ${found.length ? `it is on ${found.slice(0, 6).join(', ')}` : 'it is nowhere in the file'}`);
  }
  return wrong;
}

const doc = readFileSync(join(ROOT, DOC), 'utf8');
const cites = citesIn(doc);
const mine = cites.map((c) => ({ ...c, path: appFile(c.file) })).filter((c) => c.path);
const sourceLines = new Map();
const linesOf = (path) => {
  if (!sourceLines.has(path)) sourceLines.set(path, readFileSync(join(ROOT, path), 'utf8').split('\n'));
  return sourceLines.get(path);
};

test('the scan reads real cites: the document has line cites, and the app files it cites are the ones this work is about', () => {
  assert.ok(cites.length > 100, `${cites.length} cites found in ${DOC}`);
  assert.ok(mine.length >= 20, `${mine.length} cites into apps/web/src`);
  const files = new Set(mine.map((c) => c.file));
  for (const must of ['auth-pages.tsx', 'age-gate.ts', 'auth-providers.ts', 'identity-card.tsx', 'roblox-signin.ts', 'settings.tsx']) {
    assert.ok(files.has(must), `no cite of ${must} was found, so its rows are not guarded`);
  }
  assert.ok(mine.filter((c) => c.file === 'auth-pages.tsx').length >= 6, 'the six auth-pages.tsx cites that drifted are not all there');
  assert.equal(appFile('turnstile.ts'), null, 'a name the worker shares is not read as an app file');
  assert.equal(appFile('auth-pages.tsx'), 'apps/web/src/routes/auth-pages.tsx');
});

test('EVERY CITE INTO THE APP NAMES THE SYMBOL IT POINTS AT, and the symbol is on the cited line', () => {
  const wrong = problems(mine, linesOf);
  assert.deepEqual(wrong, [], `${wrong.length} cite(s) of ${DOC} drifted or name nothing:\n${wrong.join('\n')}`);
});

test('the checker can see a drifted cite, a bare one, a continuation and a symbol that is gone (it is run on text of its own, not only on the document)', () => {
  const file = ['one', 'two supabase.auth.signUp(', 'three AGE_GATE_PASSED', 'four'];
  const made = citesIn('| row | `auth-pages.tsx:2 supabase.auth.signUp(` and `auth-pages.tsx:3 supabase.auth.signUp(` and `auth-pages.tsx:2` and `age-gate.ts:3 AGE_GATE_PASSED`, `:4` and `age-gate.ts:1-3 AGE_GATE_PASSED` and `age-gate.ts:1 GONE` | x |')
    .map((c) => ({ ...c, path: 'f' }));
  assert.deepEqual(made.map((c) => [c.file, c.from, c.to, c.needle ?? null, c.continuation]), [
    ['auth-pages.tsx', 2, 2, 'supabase.auth.signUp(', false],
    ['auth-pages.tsx', 3, 3, 'supabase.auth.signUp(', false],
    ['auth-pages.tsx', 2, 2, null, false],
    ['age-gate.ts', 3, 3, 'AGE_GATE_PASSED', false],
    ['age-gate.ts', 4, 4, null, true],
    ['age-gate.ts', 1, 3, 'AGE_GATE_PASSED', false],
    ['age-gate.ts', 1, 1, 'GONE', false],
  ]);
  const wrong = problems(made, () => file);
  assert.equal(wrong.length, 4, wrong.join('\n'));
  assert.match(wrong[0], /"supabase\.auth\.signUp\(" is not on line 3 of f; it is on 2/, 'a drifted cite says where the symbol is now');
  assert.match(wrong[1], /cited with no symbol/);
  assert.match(wrong[2], /bare continuation/);
  assert.match(wrong[3], /"GONE" is not on line 1 of f; it is nowhere in the file/);
});
