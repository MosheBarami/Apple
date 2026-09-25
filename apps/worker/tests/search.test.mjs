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
const {
  escapeLike,
  snippetAround,
  isSearchable,
  MIN_QUERY,
  MAX_QUERY,
  SEARCH_TYPES,
  SEARCH_AUTHORS,
  authorForRole,
  parseSearchDate,
  parseSearchFilter,
  findMatch,
  scoreRecord,
  withinFilter,
  runSearch,
  zeroCounts,
  likePrefilterable,
  narrowing,
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  customerWorkSearchText,
  customerMessageSearchText,
} = await import(`file://${out}`);
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
  for (const q of ['door', 'ProximityPrompt', 'こんにちは 世界', 'a-b.c (d)']) {
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

// =================================================================================================
// SEARCHING A PROJECT, NOT ONLY ITS TRANSCRIPT.
//
// Everything below runs the real functions against fixtures rather than reading the source for
// them. The three defects these exist to catch are the ones that produce a RESULT LIST rather than
// an error, which is the only kind a user cannot notice:
//
//   * ordering by time and calling it relevance;
//   * dropping a filter that was not understood, so a narrow question gets the wide answer;
//   * a prefilter that excludes rows the matcher would have matched.
// =================================================================================================

const MARCH = Date.UTC(2026, 2, 1, 12, 0, 0);
const APRIL = Date.UTC(2026, 3, 1, 12, 0, 0);

const REC = (over = {}) => ({
  id: 'r1',
  type: 'message',
  author: 'you',
  title: null,
  body: '',
  createdAt: MARCH,
  ...over,
});

const FILTER = (qs) => parseSearchFilter(new URLSearchParams(qs));
const ids = (outcome) => outcome.results.map((r) => r.id);

// ------------------------------------------------------------------- the filter ---

test('with no filter given, every type and every author is searched', () => {
  const f = FILTER('q=door');
  assert.deepEqual(f.types, [...SEARCH_TYPES]);
  assert.deepEqual(f.authors, [...SEARCH_AUTHORS]);
  assert.equal(f.from, null);
  assert.equal(f.to, null);
  assert.deepEqual(f.ignored, []);
  assert.equal(f.impossible, false);
  assert.equal(f.limit, DEFAULT_SEARCH_LIMIT);
});

test('a type filter narrows to exactly what was asked for', () => {
  assert.deepEqual(FILTER('q=door&types=checkpoint').types, ['checkpoint']);
  assert.deepEqual(FILTER('q=door&types=message,checkpoint').types, ['message', 'checkpoint']);
});

test('a type nobody recognises is REPORTED and never silently widened to everything', () => {
  // The whole failure this guards: `?types=mesages` dropped leaves an unfiltered search, and a
  // full result set is read as the answer to the narrow question that was actually asked.
  const f = FILTER('q=door&types=mesages');
  assert.deepEqual(f.ignored, ['type:mesages']);
  assert.equal(f.impossible, true, 'a narrowing that survived nothing must not match everything');
  const out = runSearch([REC({ body: 'the door opens' })], f);
  assert.equal(out.results.length, 0, 'a typo must not return the whole project');
  assert.equal(out.total, 0);
});

test('a partly understood type filter applies the half it understood', () => {
  // Unlike a date, a list CAN be honoured in part: one of the two values named a real type, and
  // searching that is what the user asked for.
  const f = FILTER('q=door&types=message,mesages');
  assert.deepEqual(f.types, ['message']);
  assert.deepEqual(f.ignored, ['type:mesages']);
  assert.equal(f.impossible, false);
});

test('the author filter speaks the words the UI shows, and the ones the rows store', () => {
  assert.deepEqual(FILTER('q=door&authors=you').authors, ['you']);
  assert.deepEqual(FILTER('q=door&authors=user').authors, ['you']);
  assert.deepEqual(FILTER('q=door&authors=assistant').authors, ['apple']);
  assert.equal(authorForRole('user'), 'you');
  assert.equal(authorForRole('assistant'), 'apple');
  assert.equal(authorForRole('system'), 'system');
});

test('an author nobody recognises is reported, not ignored into a wider search', () => {
  const f = FILTER('q=door&authors=aple');
  assert.deepEqual(f.ignored, ['author:aple']);
  assert.equal(f.impossible, true);
});

test('a bare date names a DAY, and the end of that day includes the whole of it', () => {
  // `to=2026-03-01` read as midnight excludes everything that happened on the first — the
  // off-by-one-day that makes a date filter look correct until someone searches for today.
  const f = FILTER('q=door&to=2026-03-01');
  const lastMoment = REC({ createdAt: Date.UTC(2026, 2, 1, 23, 59, 59, 999) });
  const nextDay = REC({ createdAt: Date.UTC(2026, 2, 2, 0, 0, 0, 0) });
  assert.equal(withinFilter(lastMoment, f), true, 'the last millisecond of the named day is inside it');
  assert.equal(withinFilter(nextDay, f), false);
});

test('the start of a date window is inclusive from its first millisecond', () => {
  const f = FILTER('q=door&from=2026-03-01');
  assert.equal(withinFilter(REC({ createdAt: Date.UTC(2026, 2, 1, 0, 0, 0, 0) }), f), true);
  assert.equal(withinFilter(REC({ createdAt: Date.UTC(2026, 1, 28, 23, 59, 59, 999) }), f), false);
});

test('a date that cannot be read stops the search instead of removing the bound', () => {
  // A dropped bound is not a smaller failure than a wrong one: `from=yesterday` ignored means NO
  // lower bound, which is the widest possible search wearing the costume of the narrow one.
  const f = FILTER('q=door&from=yesterday');
  assert.equal(f.from, null, 'it must not become 0, which reads as "since 1970"');
  assert.deepEqual(f.ignored, ['from:yesterday']);
  assert.equal(f.impossible, true);
  assert.equal(runSearch([REC({ body: 'the door opens' })], f).results.length, 0);
});

test('an epoch in seconds is refused rather than landing in 1970', () => {
  // 1772323200 is a perfectly ordinary Unix timestamp. Read as milliseconds it is 21 January 1970,
  // which as a lower bound means "everything" — a filter that reports success and does nothing.
  assert.equal(parseSearchDate('1772323200', 'from'), null);
  assert.equal(parseSearchDate(String(MARCH), 'from'), MARCH, 'milliseconds are accepted');
});

test('a window that closes before it opens says so rather than returning the project', () => {
  const f = FILTER('q=door&from=2026-04-01&to=2026-03-01');
  assert.equal(f.impossible, true);
  assert.equal(runSearch([REC({ body: 'door' })], f).results.length, 0);
});

test('a full ISO instant is honoured as an instant', () => {
  assert.equal(parseSearchDate('2026-03-01T12:00:00.000Z', 'from'), MARCH);
});

test('the limit is capped, and a limit that is not a number is reported', () => {
  assert.equal(FILTER('q=door&limit=500').limit, MAX_SEARCH_LIMIT);
  assert.equal(FILTER('q=door&limit=5').limit, 5);
  const bad = FILTER('q=door&limit=lots');
  assert.equal(bad.limit, DEFAULT_SEARCH_LIMIT);
  assert.deepEqual(bad.ignored, ['limit:lots']);
});

// ------------------------------------------------------------------- what matches ---

test('a whole word is recognised as one, in any script', () => {
  assert.equal(findMatch('the door opens', 'door').wholeWord, true);
  assert.equal(findMatch('the doorway opens', 'door').wholeWord, false);
  assert.equal(findMatch('הדלת נפתחת', 'הדלת').wholeWord, true);
  assert.equal(findMatch('הדלתות נפתחות', 'הדלת').wholeWord, false);
});

test('a record that does not contain the query is not a hit at all', () => {
  assert.equal(scoreRecord(REC({ body: 'the window opens' }), 'door'), null);
});

test('a title-only match is still a hit, and says the snippet came from the title', () => {
  const s = scoreRecord(REC({ type: 'checkpoint', title: 'door timing', body: 'manual' }), 'door');
  assert.ok(s);
  assert.equal(s.matchedIn, 'title');
  assert.ok(s.snippet.text.includes('door'));
});

// ------------------------------------------------------------------- the ranking ---

test('a better match from March outranks a passing mention from today', () => {
  // THE defect this replaces: `order by created_at desc limit 40` answers "what matched most
  // recently", which is why the panel had to apologise with "showing the most recent".
  const out = runSearch(
    [
      REC({ id: 'old', body: 'door', createdAt: MARCH }),
      REC({ id: 'new', body: `${'x'.repeat(200)} the doorway is fine`, createdAt: APRIL }),
    ],
    FILTER('q=door'),
  );
  assert.deepEqual(ids(out), ['old', 'new']);
});

test('a whole word outranks a fragment, with nothing else differing', () => {
  // Both bodies are the same length, carry one occurrence, and were written at the same instant,
  // so the word boundary is the ONLY thing separating them.
  const a = REC({ id: 'word', body: 'the door here' });
  const b = REC({ id: 'frag', body: 'the doorway x' });
  assert.equal(a.body.length, b.body.length, 'the fixture must isolate one difference');
  assert.deepEqual(ids(runSearch([b, a], FILTER('q=door'))), ['word', 'frag']);
});

test('a name outranks a mention buried in a wall of text', () => {
  const named = REC({ id: 'named', type: 'checkpoint', title: 'door timing', body: 'z'.repeat(400) });
  const buried = REC({ id: 'buried', body: `${'z'.repeat(200)}doorway${'z'.repeat(200)}` });
  assert.deepEqual(ids(runSearch([buried, named], FILTER('q=door'))), ['named', 'buried']);
});

test('more occurrences outrank fewer, with nothing else differing', () => {
  const twice = REC({ id: 'twice', body: 'door and door here' });
  const once = REC({ id: 'once', body: 'door and gate here' });
  assert.equal(twice.body.length, once.body.length, 'the fixture must isolate one difference');
  assert.deepEqual(ids(runSearch([once, twice], FILTER('q=door'))), ['twice', 'once']);
});

test('the same query twice returns the same order, whatever order the rows arrived in', () => {
  // Equal scores and equal timestamps used to leave the order to the row scan, so paging through
  // results could show the same hit twice and never show another.
  const rows = ['c', 'a', 'b'].map((id) => REC({ id, body: 'door' }));
  const forwards = ids(runSearch(rows, FILTER('q=door')));
  const backwards = ids(runSearch([...rows].reverse(), FILTER('q=door')));
  assert.deepEqual(forwards, ['a', 'b', 'c']);
  assert.deepEqual(backwards, forwards);
});

test('time breaks a tie that relevance cannot, newest first', () => {
  const older = REC({ id: 'older', body: 'door', createdAt: MARCH });
  const newer = REC({ id: 'newer', body: 'door', createdAt: APRIL });
  assert.deepEqual(ids(runSearch([older, newer], FILTER('q=door'))), ['newer', 'older']);
});

// --------------------------------------------------------------------- the facets ---

test('the count beside a type survives choosing a different type', () => {
  // Counts narrowed by the type filter collapse every unselected facet to zero, which makes
  // choosing one a door that does not open again.
  const records = [
    REC({ id: 'm1', body: 'the door opens' }),
    REC({ id: 'm2', body: 'another door' }),
    REC({ id: 'c1', type: 'checkpoint', author: 'you', title: 'door timing', body: 'manual' }),
  ];
  const out = runSearch(records, FILTER('q=door&types=message'));
  assert.deepEqual(ids(out).sort(), ['m1', 'm2']);
  assert.equal(out.counts.checkpoint, 1, 'the unselected facet must still report what it holds');
  assert.equal(out.counts.message, 2);
});

test('the facet counts still honour the filters that are not the type filter', () => {
  const records = [
    REC({ id: 'inside', type: 'checkpoint', author: 'you', title: 'door', body: 'manual', createdAt: MARCH }),
    REC({ id: 'outside', type: 'checkpoint', author: 'you', title: 'door', body: 'manual', createdAt: APRIL }),
  ];
  const out = runSearch(records, FILTER('q=door&types=message&to=2026-03-31'));
  assert.equal(out.counts.checkpoint, 1, 'the April checkpoint is outside the window and is not counted');
});

test('an author filter excludes the other author from both the results and the counts', () => {
  const records = [
    REC({ id: 'mine', author: 'you', body: 'the door opens' }),
    REC({ id: 'theirs', author: 'apple', body: 'the door opens' }),
  ];
  const out = runSearch(records, FILTER('q=door&authors=you'));
  assert.deepEqual(ids(out), ['mine']);
  assert.equal(out.counts.message, 1);
});

// ------------------------------------------------- the pure function owns the rules ---

test('a row outside the window is refused even when the caller hands it over', () => {
  // The SQL narrowing is an optimisation. If it were also the specification, a query that skipped
  // the prefilter would quietly answer a different question than one that used it.
  const out = runSearch([REC({ body: 'door', createdAt: APRIL })], FILTER('q=door&to=2026-03-31'));
  assert.equal(out.total, 0);
  assert.equal(out.counts.message, 0);
});

test('a query too short to be a search returns nothing, however many rows match it', () => {
  const out = runSearch([REC({ body: 'a door' })], FILTER('q=a'));
  assert.equal(out.results.length, 0);
});

test('a capped result set reports the total it was cut from', () => {
  const records = ['a', 'b', 'c'].map((id) => REC({ id, body: 'door' }));
  const out = runSearch(records, FILTER('q=door&limit=2'));
  assert.equal(out.results.length, 2);
  assert.equal(out.total, 3);
  assert.equal(out.more, true);
});

test('an uncapped result set does not claim there is more', () => {
  const out = runSearch([REC({ body: 'door' })], FILTER('q=door&limit=2'));
  assert.equal(out.more, false);
  assert.equal(out.total, 1);
});

test('every type has a count, including the ones nothing matched', () => {
  const out = runSearch([REC({ body: 'door' })], FILTER('q=door'));
  for (const t of SEARCH_TYPES) assert.equal(typeof out.counts[t], 'number', t);
  assert.deepEqual(Object.keys(zeroCounts()).sort(), [...SEARCH_TYPES].sort());
});

test('a message hit carries the anchor the workspace needs to jump to it', () => {
  const out = runSearch([REC({ id: 'm9', body: 'door', messageId: 'm9' })], FILTER('q=door'));
  assert.equal(out.results[0].messageId, 'm9');
  assert.equal(out.results[0].type, 'message');
});

// ---------------------------------------------------------------- the SQL prefilter ---

test('a query SQLite can fold is prefiltered; one it cannot is not', () => {
  // SQLite's LIKE folds case for ASCII and nothing else. `Дверь` narrowed by LIKE would drop the
  // rows that spell it `дверь`, which the matcher accepts — a silent miss, the one failure a user
  // cannot see in a result list.
  assert.equal(likePrefilterable('door'), true);
  assert.equal(likePrefilterable('הדלת'), true, 'a caseless script has nothing to fold');
  assert.equal(likePrefilterable('日本語'), true);
  assert.equal(likePrefilterable('Дверь'), false);
  assert.equal(likePrefilterable('дверь'), false);
});

test('the prefilter is omitted entirely rather than narrowing wrongly', () => {
  const foldable = narrowing(FILTER('q=door'), { columns: ['content'] });
  assert.match(foldable.where, /content like \? escape/);
  const unfoldable = narrowing(FILTER('q=%D0%94%D0%B2%D0%B5%D1%80%D1%8C'), { columns: ['content'] });
  assert.equal(unfoldable.where, '', 'no clause at all beats a clause that drops rows');
  assert.deepEqual(unfoldable.args, []);
});

test('every placeholder has exactly one argument, in every combination of filters', () => {
  // A `?` without an argument does not fail loudly in SQLite: it binds the wrong value to the
  // wrong column and returns a plausible, wrong result set.
  const queries = ['q=door', 'q=door&from=2026-03-01', 'q=door&to=2026-04-01', 'q=door&from=2026-03-01&to=2026-04-01'];
  const shapes = [{ columns: ['content'] }, { columns: ['label', 'kind'] }, { columns: ['tool_trace'], require: ['tool_trace is not null'] }, {}];
  for (const qs of queries) {
    for (const shape of shapes) {
      const n = narrowing(FILTER(qs), shape);
      const holes = (n.where.match(/\?/g) ?? []).length;
      assert.equal(holes, n.args.length, `${qs} ${JSON.stringify(shape)} → ${n.where}`);
    }
  }
});

test('the query value is bound, never built into the statement text', () => {
  const n = narrowing(FILTER('q=50%25'), { columns: ['content'] });
  assert.equal(n.where.includes('50'), false, 'the value must not appear in the SQL');
  assert.deepEqual(n.args, ['%50\\%%'], 'and the wildcard in it must be escaped');
});

test('a required clause that tries to bind is refused rather than shifting every argument', () => {
  assert.throws(() => narrowing(FILTER('q=door'), { require: ['owner = ?'] }), /must not bind/);
});

test('the date bounds are the ones the filter carries, in the order they are bound', () => {
  const n = narrowing(FILTER('q=door&from=2026-03-01&to=2026-04-01'), {});
  assert.deepEqual(n.args, [Date.UTC(2026, 2, 1), Date.UTC(2026, 3, 1) + 86_400_000 - 1]);
});

// ------------------------------------------------------------------- the DO handler ---

const SESSION = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
const handler = SESSION.slice(SESSION.indexOf("path === '/search'"), SESSION.indexOf("path === '/export'"));
const gather = SESSION.slice(
  SESSION.indexOf('private async searchRecords('),
  SESSION.indexOf('// ------------------------------------------------------------------ checkpoints'),
);

test('the handler decides nothing about matching or ordering for itself', () => {
  // Two implementations of "what is a result" is one too many: the tested one must be the one that
  // ships, so the handler reads rows and hands them over.
  assert.match(handler, /runSearch\(gathered\.records, filter\)/);
  assert.match(handler, /parseSearchFilter\(url\.searchParams\)/);
  assert.equal(/order by created_at desc limit \?\s*\)/.test(handler), false, 'no ordering in the handler');
});

test('a too-short query is refused before a single row is read', () => {
  assert.match(handler, /if \(!isSearchable\(raw\)\)/);
  assert.match(handler, /tooShort/);
  assert.ok(handler.indexOf('isSearchable') < handler.indexOf('this.searchRecords'), 'reject before scanning');
});

test('an impossible filter returns nothing, and says which value it could not use', () => {
  const branch = handler.slice(handler.indexOf('filter.impossible'), handler.indexOf('const gathered'));
  assert.match(branch, /results: \[\]/);
  assert.match(branch, /impossible: true/);
  assert.match(handler, /ignored: filter\.ignored/);
});

test('the search still covers every message rather than the pager window', () => {
  // `/messages` pages backwards from the newest hundred. Inheriting that bound is what made the
  // cheap client-side version useless, and it must not come back through the date filter.
  assert.equal(/created_at <\s*\?/.test(gather), false, 'no exclusive upper bound belongs here');
  assert.equal(/created_at [<>]=? \?/.test(gather), false, 'every bound comes from `narrowing`, never from the DO');
  assert.ok(gather.includes('narrowing(filter'), 'the bounds are the filter’s');
});

test('every kind of record a project holds is gathered', () => {
  for (const [table, type] of [['messages', 'message'], ['checkpoints', 'checkpoint'], ['oplog', 'activity']]) {
    assert.ok(gather.includes(`from ${table} `), `${table} is not searched`);
    assert.ok(gather.includes(`type: '${type}'`), `${type} records are never produced`);
  }
  assert.ok(gather.includes("type: 'artifact'"), 'tool steps are not searched');
  assert.ok(gather.includes("type: 'memory'"), 'what Apple remembers is not searched');
});

test('work search records use customer words and never raw tool names or operation errors', () => {
  const scripted = customerWorkSearchText('edit_script', 'edit_script failed at ServerScriptService.Shop:17; stack trace');
  assert.match(scripted.title, /script/i);
  assert.doesNotMatch(JSON.stringify(scripted), /edit_script|ServerScriptService|stack trace|:17/);
  const unknown = customerWorkSearchText('future_internal_tool', 'run_id=abc123 private diagnostic');
  assert.ok(unknown.title && unknown.body, 'an unknown work type still has a friendly search label');
  assert.doesNotMatch(JSON.stringify(unknown), /future_internal_tool|run_id|abc123/);
  const safeRecord = REC({ type: 'artifact', title: scripted.title, body: scripted.body });
  const visible = runSearch([safeRecord], FILTER('q=script'));
  assert.equal(visible.results.length, 1, 'the friendly label remains searchable');
  assert.doesNotMatch(JSON.stringify(visible), /edit_script|ServerScriptService|stack trace|:17/);
  assert.equal(runSearch([safeRecord], FILTER('q=ServerScriptService')).results.length, 0);
  const code = gather.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal((code.match(/customerWorkSearchText\(/g) ?? []).length, 2,
    'both tool steps and Studio operations must use the customer-safe search text');
});

test('assistant message search matches only the prose the customer can read', () => {
  const wire = '{"className":"Part","name":"MovingPlatform3","parent":"game.Workspace","props":{"Anchored":{"t":"bool","v":false}}}';
  const body = customerMessageSearchText('assistant', `I built a moving platform.\n${wire}\nTry it now.`);
  assert.equal(body, 'I built a moving platform.\nTry it now.');
  const record = REC({ body, author: 'apple' });
  assert.equal(runSearch([record], FILTER('q=platform')).results.length, 1);
  assert.equal(runSearch([record], FILTER('q=className')).results.length, 0);
  assert.equal(customerMessageSearchText('user', wire), wire, 'the customer’s own text is not rewritten');
  assert.match(gather, /body: customerMessageSearchText\(r\.role, r\.content\)/,
    'the real message search path must use the same visible-prose rule');
});

test('searching a friendly work label is not filtered out by raw SQL text', () => {
  const code = gather.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const artifacts = code.slice(code.indexOf('const n = narrowing', code.indexOf("type: 'message'")), code.indexOf("type: 'artifact'"));
  const activity = code.slice(code.indexOf('const n = narrowing', code.indexOf("type: 'checkpoint'")), code.indexOf("type: 'activity'"));
  assert.ok(artifacts && activity, 'both work scans must still be located');
  assert.doesNotMatch(artifacts, /columns:\s*\['tool_trace'\]/,
    'friendly titles are derived after SQL reads the tool trace');
  assert.doesNotMatch(activity, /columns:\s*\['summary', 'kind'\]/,
    'friendly titles are derived after SQL reads the operation');
});

test('the type filter is NOT applied while gathering, so the facet counts can exist', () => {
  assert.equal(/filter\.types/.test(gather), false, 'narrowing by type here would zero every other count');
});

test('EVERY bounded scan reports its own cap, not just one of them', () => {
  // `assert.match(gather, /truncated = true/)` was the first version of this, and it was a check
  // that the channel exists: blanking the report in the messages block left the artifact block's
  // identical line to satisfy the regex, and the break came back green (F-59). A scan that asked
  // for one row more than it will keep, and then never says the extra row arrived, is a search
  // silently answering over part of a project.
  //
  // The two counts are the property: one report per cap-probing scan. The checkpoint scan is
  // deliberately absent from both — it does not ask for an extra row, because retention keeps only
  // 25 checkpoints and its limit of 1000 cannot be reached.
  const probes = (gather.match(/SCAN_\w+ \+ 1,/g) ?? []).length;
  const reports = (gather.match(/truncated = true/g) ?? []).length;
  assert.ok(probes >= 3, `expected the message, artifact and activity scans to probe their caps, saw ${probes}`);
  assert.equal(reports, probes, 'a scan that probes its cap and never reports it hides a partial answer');
  assert.match(handler, /scanTruncated: gathered\.truncated/);
});

test('memory is dated by what happened, never by now', () => {
  // `Date.now()` would claim an edit that never happened, and would drag memory into every
  // "since yesterday" window for ever.
  //
  // Comments are stripped first. Without that this scanned the prose that EXPLAINS the rule and
  // failed on it — a guard reporting a defect it had itself written, which is the noisiest way a
  // marker-scanning assertion can be wrong.
  const code = gather.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(code.includes("type: 'memory'"), 'the slice must still contain the code it judges');
  assert.equal(/Date\.now\(\)/.test(code), false);
  assert.match(code, /memoryEditedAt/);
});

const INDEX = readFileSync(join(WORKER, 'src', 'index.ts'), 'utf8');
const route = INDEX.slice(INDEX.indexOf("app.get('/api/projects/:id/search'"), INDEX.indexOf("app.get('/api/projects/:id/export'"));

test('search is scoped to a project the caller owns', () => {
  assert.match(route, /withOwnedProject\(c, c\.req\.param\('id'\)\)/);
  assert.match(route, /if \(!ctx\) return c\.json\(\{ error: 'not found' \}, 404\)/);
  assert.ok(route.indexOf('withOwnedProject') < route.indexOf('stub.fetch'));
});

test('the filters reach the Durable Object rather than being dropped at the edge', () => {
  assert.match(route, /url\.searchParams/);
});
