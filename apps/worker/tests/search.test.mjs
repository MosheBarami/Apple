// Searching a conversation.
//
// The cheap version of this feature is a client-side filter over the ~100 messages the workspace
// already holds. It is worse than having no search at all: it answers "no results" for text that
// is demonstrably in the conversation, and the user cannot tell that apart from the true answer.
// So the search runs against every row, and the tests below cover the two things that then go
// wrong quietly — LIKE's wildcards being treated as the user's, and a snippet that does not
// contain the thing you searched for.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const out = join(tmpdir(), `apple-search-${process.pid}.mjs`);
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
  join(WORKER, 'src', 'search.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${out}`,
], { cwd: WORKER, stdio: 'pipe' });
const { escapeLike, snippetAround, isSearchable, MIN_QUERY, MAX_QUERY } = await import(`file://${out}`);
process.on('exit', () => rmSync(out, { force: true }));

// ------------------------------------------------------------- LIKE wildcards ---

test("a literal % is escaped, so searching for it does not match everything", () => {
  // Unescaped, `%%%` is three wildcards: every message matches and the user gets their whole
  // transcript back as a "result".
  assert.equal(escapeLike('50%'), '50\\%');
  assert.equal(escapeLike('%%%'), '\\%\\%\\%');
});

test('a literal _ is escaped, so it does not match any single character', () => {
  assert.equal(escapeLike('a_b'), 'a\\_b');
});

test('the escape character itself is escaped first', () => {
  // Escaping `%` before `\` would turn `\%` into `\\%` — a literal backslash followed by a live
  // wildcard. Doing them in one pass is what avoids that.
  assert.equal(escapeLike('a\\b'), 'a\\\\b');
  assert.equal(escapeLike('\\%'), '\\\\\\%');
});

test('ordinary text passes through untouched', () => {
  for (const q of ['door', 'ProximityPrompt', 'שלום עולם', 'a-b.c (d)']) {
    assert.equal(escapeLike(q), q, q);
  }
});

// -------------------------------------------------------------------- snippets ---

const LONG = `${'filler '.repeat(400)}the door opens with a ProximityPrompt${' more '.repeat(400)}`;

test('the snippet is a window around the MATCH, not the start of the message', () => {
  // This is the whole point. A result list showing the first 120 characters of a 4,000-character
  // message displays nothing the user typed, and reads as a broken search.
  const s = snippetAround(LONG, 'ProximityPrompt');
  assert.ok(s, 'a present phrase must be found');
  assert.ok(s.text.includes('ProximityPrompt'), `snippet omitted the match: ${s.text.slice(0, 60)}…`);
  assert.equal(s.text.startsWith('filler filler'), false, 'it must not just be the head of the message');
});

test('the reported offset really points at the match inside the snippet', () => {
  // The UI highlights by offset rather than searching again, so an offset that is off by the
  // ellipsis marks the wrong characters.
  const s = snippetAround(LONG, 'ProximityPrompt');
  assert.equal(s.text.slice(s.matchStart, s.matchStart + s.matchLength), 'ProximityPrompt');
});

test('the offset is right when the match is at the very start', () => {
  const s = snippetAround('door opens here', 'door');
  assert.equal(s.text.slice(s.matchStart, s.matchStart + s.matchLength), 'door');
  assert.equal(s.text.startsWith('…'), false, 'nothing was cut, so nothing should claim it was');
});

test('the offset is right when the match is at the very end', () => {
  const s = snippetAround('everything before the door', 'door');
  assert.equal(s.text.slice(s.matchStart, s.matchStart + s.matchLength), 'door');
  assert.equal(s.text.endsWith('…'), false);
});

test('a cut is marked, an uncut edge is not', () => {
  const s = snippetAround(LONG, 'ProximityPrompt');
  assert.ok(s.text.startsWith('…'), 'text was cut from the front and must say so');
  assert.ok(s.text.endsWith('…'), 'text was cut from the end and must say so');
});

test('matching is case-insensitive but the snippet shows the original casing', () => {
  const s = snippetAround('The Door Is Locked', 'door');
  assert.equal(s.text.slice(s.matchStart, s.matchStart + s.matchLength), 'Door');
});

test('every occurrence is counted, not just the one shown', () => {
  const s = snippetAround('door, door, and another door', 'door');
  assert.equal(s.occurrences, 3);
});

test('overlapping-looking repeats are counted without double counting', () => {
  assert.equal(snippetAround('aaaa', 'aa').occurrences, 2);
});

test('a phrase that is not there returns nothing rather than an empty snippet', () => {
  assert.equal(snippetAround('the door opens', 'window'), null);
});

test('an empty query is never a match', () => {
  assert.equal(snippetAround('anything at all', ''), null);
  assert.equal(snippetAround('anything at all', '   '), null);
});

test('Hebrew is found and windowed like anything else', () => {
  // The app is used in Hebrew. A search that quietly only works in ASCII is a search that does not
  // work.
  const text = `${'מילוי '.repeat(100)}הדלת נפתחת עם ProximityPrompt${' עוד'.repeat(100)}`;
  const s = snippetAround(text, 'הדלת');
  assert.ok(s, 'Hebrew must be searchable');
  assert.ok(s.text.includes('הדלת'));
  assert.equal(s.text.slice(s.matchStart, s.matchStart + s.matchLength), 'הדלת');
});

test('a snippet of a message with no spaces still contains the match', () => {
  // The word-boundary nudge must never push the match out of the window.
  const s = snippetAround('x'.repeat(300) + 'NEEDLE' + 'y'.repeat(300), 'NEEDLE');
  assert.ok(s.text.includes('NEEDLE'));
  assert.equal(s.text.slice(s.matchStart, s.matchStart + s.matchLength), 'NEEDLE');
});

test('a match longer than the window is not truncated out of its own snippet', () => {
  const phrase = 'z'.repeat(400);
  const s = snippetAround(`start ${phrase} end`, phrase);
  assert.equal(s.text.slice(s.matchStart, s.matchStart + s.matchLength), phrase);
});

// ------------------------------------------------------------- what is a query ---

test('one character is not a search', () => {
  // It matches most of a transcript. Returning that is not a result set; it is a slow way to
  // re-render the conversation.
  assert.equal(isSearchable('a'), false);
  assert.equal(isSearchable(' a '), false);
  assert.equal(isSearchable('ab'), true);
  assert.equal(MIN_QUERY, 2);
});

test('blank is not a search', () => {
  for (const q of ['', '  ', '\t\n']) assert.equal(isSearchable(q), false, JSON.stringify(q));
});

test('an absurdly long query is refused rather than scanned for', () => {
  assert.equal(isSearchable('x'.repeat(MAX_QUERY)), true);
  assert.equal(isSearchable('x'.repeat(MAX_QUERY + 1)), false);
});

// ----------------------------------------------------------------- the handler ---

const SESSION = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
const handler = SESSION.slice(SESSION.indexOf("path === '/search'"), SESSION.indexOf("path === '/export'"));

test('the query is bound, never interpolated into the SQL', () => {
  assert.match(handler, /content like \? escape/);
  assert.equal(/like '%\$\{/.test(handler), false, 'the pattern must not be built into the statement text');
  assert.match(handler, /escapeLike\(q\)/);
});

test('the search covers every message, not a recent window', () => {
  // No `where created_at <` clause: that is what makes this different from `/messages`, and it is
  // the entire reason the feature exists.
  assert.equal(/created_at <\s*\?/.test(handler), false, 'search must not inherit the paging window');
});

test('a capped result set says it was capped', () => {
  // Silently returning 40 of 900 and calling it the results is the same defect as a truncated
  // export: it looks complete.
  assert.match(handler, /limit \+ 1/);
  assert.match(handler, /const more = rows\.length > limit/);
  assert.match(handler, /\bmore,/);
});

test('a too-short query returns an explanation, not everything', () => {
  assert.match(handler, /if \(!isSearchable\(raw\)\)/);
  assert.match(handler, /tooShort/);
  assert.ok(handler.indexOf('isSearchable') < handler.indexOf('this.sql'), 'reject before scanning');
});

const INDEX = readFileSync(join(WORKER, 'src', 'index.ts'), 'utf8');
const route = INDEX.slice(INDEX.indexOf("app.get('/api/projects/:id/search'"), INDEX.indexOf("app.get('/api/projects/:id/export'"));

test('search is scoped to a project the caller owns', () => {
  assert.match(route, /withOwnedProject\(c, c\.req\.param\('id'\)\)/);
  assert.match(route, /if \(!ctx\) return c\.json\(\{ error: 'not found' \}, 404\)/);
  assert.ok(route.indexOf('withOwnedProject') < route.indexOf('stub.fetch'));
});
