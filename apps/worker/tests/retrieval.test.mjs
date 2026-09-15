// The mechanics of retrieval, executed.
//
// Every function under test here is a pure function of its inputs, which is the point: the
// violating input comes from this file rather than from the state of a deployment. An empty index,
// a census that could not be read, a NaN relevance score and a timestamp that says "banana" are
// all one line away, and none of them can be produced on demand against a live corpus.
//
// THE CLAIM THIS FILE EXISTS TO PROVE. `searchDocs` returning nothing has (at least) five causes —
// the corpus has no answer, the corpus is empty, the corpus has no vectors, the query had no word
// in it, the backends are down — and four of them are faults. Rendering all five as `[]` is the
// defect this repository keeps finding under other names. The distinction is asserted here by
// comparing the outcomes to EACH OTHER, not to a literal: a test that only checks
// `kind === 'empty-index'` stays green if `miss` starts returning 'empty-index' too.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(tmpdir(), `apple-retrieval-${process.pid}.mjs`);
await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'retrieval.ts')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outfile: OUT,
});
const R = await import(pathToFileURL(OUT).href);
process.on('exit', () => rmSync(OUT, { force: true }));

const NOW = Date.UTC(2026, 8, 15);
const DAY = 86_400_000;

/* ======================================================= keyword search ======================= */

test('the query the user typed survives into the MATCH expression, operators do not', () => {
  // fts5 has its own syntax. A user pasting an error message with asterisks, parentheses or a bare
  // NEAR must produce a search for those words, not a syntax error and not a different search.
  const kw = R.keywordQuery('Part.Size * OR (weld) NEAR');
  assert.ok(kw, 'a query with real words must produce a MATCH expression');
  assert.equal(/[*()]/.test(kw.match), false, `operators survived: ${kw.match}`);
  assert.match(kw.match, /^"[^"]+"( OR "[^"]+")*$/, `not a list of quoted literals: ${kw.match}`);
  assert.ok(kw.terms.includes('weld'), `the word the user actually asked for was lost: ${kw.terms.join(',')}`);
});

test('a quoted phrase stays ONE phrase and is not shredded into its words', () => {
  // `"Humanoid.WalkSpeed"` shredded into two ORed terms matches a page with Humanoid in one
  // paragraph and WalkSpeed in another — a hit the user explicitly asked not to get.
  const kw = R.keywordQuery('"set the walk speed" jumping');
  assert.deepEqual(kw.phrases, ['set the walk speed']);
  assert.ok(kw.match.includes('"set the walk speed"'), `the phrase was not kept intact: ${kw.match}`);
  assert.equal(kw.match.includes('"walk" OR "speed"'), false, `the phrase was shredded: ${kw.match}`);
});

test('stopwords are dropped, so the one word that carried the question is not drowned', () => {
  const kw = R.keywordQuery('how do i make a part that is anchored');
  assert.equal(kw.terms.includes('how'), false, `a stopword reached the OR: ${kw.terms.join(',')}`);
  assert.equal(kw.terms.includes('a'), false);
  assert.ok(kw.terms.includes('anchored'), `the meaningful term was dropped: ${kw.terms.join(',')}`);
});

test('a query made ENTIRELY of stopwords still searches for what it says', () => {
  // The guard on the guard. Dropping stopwords unconditionally turns "how to" into a query that
  // asks for nothing, and a query that asks for nothing answers "no matches" — the exact lie this
  // module exists to stop, reintroduced by an optimisation.
  const kw = R.keywordQuery('how to');
  assert.ok(kw, 'an all-stopword query must not collapse to null');
  assert.ok(kw.terms.length > 0, 'it must still carry terms');
});

test('a dotted Roblox identifier is searchable whole AND by its parts', () => {
  const kw = R.keywordQuery('Humanoid.WalkSpeed');
  assert.ok(kw.terms.includes('humanoid.walkspeed'), kw.terms.join(','));
  assert.ok(kw.terms.includes('walkspeed'), `the member name alone must also match: ${kw.terms.join(',')}`);
});

test('a query with no word in it produces NO expression rather than an empty result', () => {
  assert.equal(R.keywordQuery('!!! ??? ***'), null);
  assert.equal(R.isSearchableQuery('!!! ??? ***'), false);
  // ...and a query of real words is searchable even when every one of them is a stopword, because
  // the semantic half of the search does not care about stopwords.
  assert.equal(R.isSearchableQuery('how to'), true);
});

test('a quote inside a literal is ESCAPED, not deleted', () => {
  // Deleting it (`replaceAll('"','')`) silently searches for a different word. Doubling is the
  // fts5 escape. Asserted on the literal builder directly because the tokeniser in front of it
  // cannot currently produce a term containing a quote.
  assert.equal(R.ftsLiteral('a"b'), '"a""b"');
  assert.equal(R.ftsLiteral('plain'), '"plain"');
});

test('the term count is capped, so one pasted paragraph cannot become a 400-term OR', () => {
  const kw = R.keywordQuery(Array.from({ length: 40 }, (_, i) => `token${i}`).join(' '));
  assert.ok(kw.terms.length <= 8, `${kw.terms.length} terms survived the cap`);
});

/* ======================================================= fusion =============================== */

test('a document found by BOTH backends outranks one found by either alone', () => {
  const fused = R.rrfFuse([{ ids: ['a', 'b'] }, { ids: ['b', 'c'] }]);
  assert.ok(fused.get('b') > fused.get('a'), 'the doubly-found document must win');
  assert.ok(fused.get('b') > fused.get('c'));
});

test('a weight that is not a finite number is REFUSED, not coerced', () => {
  // `weight ?? 1` defends undefined and null and lets NaN through. One NaN makes every fused score
  // NaN; NaN comparisons are all false, so the sort becomes arbitrary and the wrong documents come
  // back in a perfectly well-formed list.
  assert.throws(() => R.rrfFuse([{ ids: ['a'], weight: NaN }]), /finite/i);
  assert.throws(() => R.rrfFuse([{ ids: ['a'], weight: Infinity }]), /finite/i);
  assert.throws(() => R.rrfFuse([{ ids: ['a'], weight: null }]), /finite/i);
  // The control: an omitted weight is not a broken weight.
  assert.equal(R.rrfFuse([{ ids: ['a'] }]).get('a') > 0, true);
});

/* ======================================================= freshness ============================ */

test('a timestamp that cannot be read is UNKNOWN, never fresh', () => {
  // `(now - NaN) / DAY` is NaN, and `NaN > AGING_DAYS` is false — so an unguarded classifier calls
  // every broken timestamp FRESH, the most flattering answer available. That is a guard failing
  // open into an observation.
  for (const bad of ['banana', NaN, Infinity, '', null, undefined, {}]) {
    const f = R.freshness(bad, NOW);
    assert.equal(f.state, 'unknown', `${String(bad)} classified as ${f.state}`);
    assert.equal(f.ageDays, null, `${String(bad)} reported an age`);
    assert.equal(f.decay, 1, 'an unknown age must neither promote nor punish');
  }
});

test('a document indexed in the future is a clock fault, not a fresh document', () => {
  assert.equal(R.freshness(NOW + 10 * DAY, NOW).state, 'unknown');
  // A few hours of skew is not a fault.
  assert.equal(R.freshness(NOW + 3600_000, NOW).state, 'fresh');
});

test('age classifies, and decay falls with age and never below the floor', () => {
  const fresh = R.freshness(NOW - 5 * DAY, NOW);
  const aging = R.freshness(NOW - 90 * DAY, NOW);
  const stale = R.freshness(NOW - 900 * DAY, NOW);
  assert.deepEqual([fresh.state, aging.state, stale.state], ['fresh', 'aging', 'stale']);
  // The RELATIONSHIP is the claim, not the constants.
  assert.ok(fresh.decay > aging.decay, `${fresh.decay} !> ${aging.decay}`);
  assert.ok(aging.decay > stale.decay, `${aging.decay} !> ${stale.decay}`);
  assert.ok(stale.decay >= R.DECAY_FLOOR, 'age must reorder, never erase');
  assert.equal(R.freshness('2026-09-10T00:00:00Z', NOW).state, 'fresh', 'an ISO string is a timestamp too');
});

/* ======================================================= reranking ============================ */

const doc = (id, over = {}) => ({ id, title: `T-${id}`, text: `body of ${id}`, fusedScore: 0.01, ...over });

test('reranking is a permutation: nothing is invented and nothing is lost', () => {
  const out = R.rerank('anchored part', [doc('a'), doc('b'), doc('c')], { now: NOW });
  assert.deepEqual(out.map((h) => h.id).sort(), ['a', 'b', 'c']);
});

test('the chunk that contains the words wins against one that merely ranked near it', () => {
  const out = R.rerank(
    'anchored part welding',
    [
      doc('vague', { fusedScore: 0.02, text: 'a page about lighting' }),
      doc('exact', { fusedScore: 0.02, text: 'how to weld an anchored part; welding basics' }),
    ],
    { now: NOW },
  );
  assert.equal(out[0].id, 'exact', out.map((h) => `${h.id}:${h.rerankScore.toFixed(4)}`).join(' '));
  assert.ok(out[0].signals.coverage > out[1].signals.coverage, 'the coverage signal must be what moved it');
});

test('a title match counts for more than the same words buried in the body', () => {
  const inTitle = doc('title', { title: 'Anchored parts', text: 'lorem ipsum' });
  const inBody = doc('body', { title: 'Lighting', text: 'anchored parts appear somewhere in here' });
  const out = R.rerank('anchored parts', [inBody, inTitle], { now: NOW });
  assert.equal(out[0].id, 'title');
});

test('freshness reorders near-ties and CANNOT overturn a decisive lexical win', () => {
  // The relationship that matters. Maximum boost is 1+1.2+0.8+0.6 = 3.6x and maximum penalty is
  // the decay floor, so a document that actually answers the question cannot be buried by age.
  const staleExact = doc('stale', { title: 'Anchored parts', text: 'anchored parts, welded', indexedAt: NOW - 2000 * DAY });
  const freshVague = doc('fresh', { title: 'Lighting', text: 'nothing relevant', indexedAt: NOW });
  const out = R.rerank('anchored parts', [freshVague, staleExact], { now: NOW });
  assert.equal(out[0].id, 'stale', 'age buried the document that answered the question');
  assert.equal(out[0].signals.freshness, 'stale');

  // ...and with the lexical signal equal, the fresher one wins.
  const a = doc('old', { title: 'Anchored parts', text: 'anchored parts', indexedAt: NOW - 2000 * DAY });
  const b = doc('new', { title: 'Anchored parts', text: 'anchored parts', indexedAt: NOW });
  const tie = R.rerank('anchored parts', [a, b], { now: NOW });
  assert.equal(tie[0].id, 'new', 'between two equally good answers, the fresher one should come first');
});

test('a relevance score that is not a number cannot poison the ordering', () => {
  const out = R.rerank('parts', [doc('nan', { fusedScore: NaN }), doc('good', { fusedScore: 0.02 }), doc('ok', { fusedScore: 0.01 })], { now: NOW });
  assert.deepEqual(out.map((h) => h.id), ['good', 'ok', 'nan'], 'the unusable score must sink, not scramble the list');
  for (const h of out) assert.equal(Number.isFinite(h.rerankScore), true, `${h.id} scored ${h.rerankScore}`);
  assert.equal(out.find((h) => h.id === 'nan').signals.fusedUsable, false);
});

test('ties break deterministically, so the same search twice is the same page twice', () => {
  const items = ['a', 'b', 'c', 'd'].map((id) => doc(id));
  const once = R.rerank('zzz', items, { now: NOW }).map((h) => h.id);
  const twice = R.rerank('zzz', items, { now: NOW }).map((h) => h.id);
  assert.deepEqual(once, twice);
  assert.deepEqual(once, ['a', 'b', 'c', 'd']);
});

test('coverage counts WORDS, not fragments of words', () => {
  // Measured: `body.includes('pod')` matched `podium`, and on the real corpus that inflated a
  // Kubernetes query's coverage enough to carry five Roblox pages past the relevance floor.
  const [only] = R.rerank('pod', [doc('a', { title: 'Podium', text: 'a raised podium and a tripod' })], { now: NOW });
  assert.equal(only.signals.coverage, 0, 'a substring of a longer word is not the word');
});

test('a word the search DISCARDED cannot count towards coverage', () => {
  //[[ THE SEAM. The reranker measures coverage, the query builder decides what was searched for,
  //   and if they tokenise separately the reranker credits a document for containing `the`, `how`
  //   and `of` — words the FTS expression deliberately threw away. That is coverage of a query
  //   nobody ran.
  //
  //   This test exists because the falsification found the gap: swapping `queryTerms` back to
  //   `terms` inside rerank turned NOTHING red across four files. The guard was absent, not
  //   redundant. ]]
  const q = 'the how of welding parts';
  const [only] = R.rerank(q, [doc('stop', { title: 'Lighting', text: 'the how of lighting' })], { now: NOW });
  assert.equal(only.signals.coverage, 0, 'a document matching only stopwords scored coverage');
  // The control: the same document, with one of the terms the search actually used.
  const [real] = R.rerank(q, [doc('real', { title: 'Lighting', text: 'the how of welding' })], { now: NOW });
  assert.ok(real.signals.coverage > 0);
});

test('coverage weights the RARE words, because those are the ones the question was about', () => {
  // `configure a PostgreSQL connection pool with pgbouncer` scored 0.50 against a page about
  // waterfalls, on `configure`, `connection` and `pool`. The two words that made it that question
  // appeared nowhere. Weighting is computed over the candidates in hand: a word in every candidate
  // cannot tell them apart.
  const common = 'configure the connection pool settings';
  // Sixteen candidates, the number the retriever actually fuses, because the weighting is computed
  // over the candidates in hand: with three of them there is no rarity to measure.
  const items = [
    doc('generic', { title: 'Configure cascades', text: `${common} for waterfalls` }),
    doc('exact', { title: 'pgbouncer', text: `${common} for pgbouncer with postgresql` }),
    ...Array.from({ length: 14 }, (_, i) => doc(`filler${i}`, { text: `${common} for topic ${i}` })),
  ];
  const out = R.rerank('configure a postgresql connection pool with pgbouncer', items, { now: NOW });
  const byId = Object.fromEntries(out.map((h) => [h.id, h.signals.coverage]));
  assert.ok(byId.exact > byId.generic, `the page naming the rare terms scored ${byId.exact} against ${byId.generic}`);
  assert.ok(byId.generic < R.MIN_LEXICAL_COVERAGE, `a page matching only the ordinary words scored ${byId.generic}, above the floor`);
});

/* ======================================================= the relevance floor ================== */

test('A QUESTION THE CORPUS CANNOT ANSWER MUST COME BACK UNANSWERED', () => {
  // Measured on the real corpus: three ranked Roblox pages for a Kubernetes question, because the
  // keyword half ORs its terms and one page contained the word `custom`. `search_docs` hands that
  // to a model which has been told it is what the documentation says. A retriever that answers
  // every question has no negatives, and every distinction downstream of "nothing matched" dies
  // with them.
  const q = 'kubernetes horizontal pod autoscaler custom metrics adapter';
  const noise = doc('noise', { title: 'Analytics dashboard', text: 'custom metrics on the dashboard' });
  const ranked = R.rerank(q, [noise], { now: NOW });
  assert.ok(ranked[0].signals.coverage < R.MIN_LEXICAL_COVERAGE, `coverage ${ranked[0].signals.coverage} is above the floor`);
  assert.deepEqual(R.dropIrrelevant(q, ranked), [], 'keyword noise was served as documentation');
});

test('a SEMANTIC hit is exempt, because that is what the embedding was paid for', () => {
  // The whole value of the vector half is finding the page about interpolating a CFrame when the
  // question said "smoothly move a part". A lexical floor applied to it deletes exactly the hits
  // the embedding was bought to produce.
  const q = 'kubernetes horizontal pod autoscaler custom metrics adapter';
  const body = { title: 'Analytics dashboard', text: 'custom metrics on the dashboard' };
  const [lexical, semantic] = R.rerank(q, [doc('lex', { ...body, semantic: false }), doc('sem', { ...body, semantic: true })], { now: NOW });
  // Identical text, identical coverage — the ONLY difference is which backend found it.
  assert.equal(lexical.signals.coverage, semantic.signals.coverage);
  const kept = R.dropIrrelevant(q, [lexical, semantic]).map((h) => h.id);
  assert.deepEqual(kept.sort(), ['sem'], 'the semantic hit was dropped, or the lexical one survived');
});

test('a query of one or two terms is exempt from the floor entirely', () => {
  // A coverage floor cannot distinguish anything over a two-word query: every match is already half
  // the query. It only starts to carry information once the question says several things and a
  // document answers one of them.
  const ranked = R.rerank('parts welds', [doc('a', { text: 'nothing in common' })], { now: NOW });
  assert.equal(ranked[0].signals.coverage, 0);
  assert.equal(R.dropIrrelevant('parts welds', ranked).length, 1, 'a short query must not be filtered');
  // The control: the same zero-coverage hit under a longer query IS dropped.
  const longer = R.rerank('anchored welded parts moving together', [doc('a', { text: 'nothing in common' })], { now: NOW });
  assert.equal(R.dropIrrelevant('anchored welded parts moving together', longer).length, 0);
});

test('an exact phrase survives the floor whatever its term coverage', () => {
  const q = 'set the network owner of an unanchored assembly';
  const item = doc('p', { text: 'you should set the network owner of an unanchored assembly yourself' });
  const ranked = R.rerank(q, [item], { now: NOW });
  assert.equal(ranked[0].signals.phrase, 1);
  assert.equal(R.dropIrrelevant(q, ranked).length, 1);
});

/* ======================================================= the census =========================== */

test('a count that is not a non-negative integer is NOT a census', () => {
  // The dangerous one is NaN: `NaN === 0` is false, so an unvalidated NaN count answers "the index
  // is not empty" forever, and every empty-index miss is reported as a real miss.
  assert.equal(R.readCensus({ chunks: NaN }), null);
  assert.equal(R.readCensus({ chunks: '8326' }), null, 'a string from a driver is not a count');
  assert.equal(R.readCensus({ chunks: -1 }), null);
  assert.equal(R.readCensus({ chunks: 1.5 }), null);
  assert.equal(R.readCensus(null), null);
  assert.equal(R.readCensus(undefined), null);
  // The controls.
  assert.deepEqual(R.readCensus({ chunks: 0, embedded: 0 }), { chunks: 0, embedded: 0 });
  assert.deepEqual(R.readCensus({ chunks: 12, embedded: 'x' }), { chunks: 12, embedded: null }, 'an unreadable embed count is unknown, not zero');
});

/* ======================= an empty index must not answer like a real miss ====================== */

const classify = (over) =>
  R.classifyRetrieval({ hits: 0, vecOk: true, ftsOk: true, queryUsable: true, census: { chunks: 8326, embedded: 8000 }, ...over });

test('AN EMPTY INDEX AND A REAL MISS ARE DIFFERENT ANSWERS', () => {
  // THE DEFECT THIS MODULE WAS WRITTEN FOR. Both backends answer, correctly, with nothing — one
  // because the documentation has no answer, one because nobody ever ran the upload. As `[]` they
  // are the same bytes, and "no results" is a normal answer nobody investigates.
  const empty = classify({ census: { chunks: 0, embedded: 0 } });
  const miss = classify({ census: { chunks: 8326, embedded: 8000 } });

  assert.equal(empty.kind, 'empty-index');
  assert.equal(miss.kind, 'miss');
  // Asserted against EACH OTHER: if `miss` ever started reporting 'empty-index' too, the two
  // equality checks above would both still pass.
  assert.notEqual(empty.kind, miss.kind, 'an unfilled index must not classify as a miss');
  assert.notEqual(empty.detail, miss.detail, 'and it must not read the same to whoever gets told');
  assert.match(empty.detail, /empty/i);
  assert.equal(R.isFault(empty.kind), true, 'an empty index is a fault to report');
  assert.equal(R.isFault(miss.kind), false, 'a real miss is a result to render');
});

test('an index with rows and NO VECTORS is its own answer', () => {
  // Keyword-only retrieval looks healthy until someone asks a question only semantic search could
  // answer, and then it looks like the documentation does not cover it.
  const o = classify({ census: { chunks: 8326, embedded: 0 } });
  assert.equal(o.kind, 'unembedded-index');
  assert.notEqual(o.kind, classify({}).kind);
  assert.match(o.detail, /embedded/i);
});

test('a miss reported while the index could not be counted is NOT certain', () => {
  // A failure to observe must not render as an observation — including this module's own.
  const o = classify({ census: null });
  assert.equal(o.kind, 'miss');
  assert.equal(o.certain, false, 'a miss with no census behind it must not be stated as a fact');
  assert.notEqual(o.certain, classify({}).certain, 'and it must differ from a miss that IS backed by a census');
  assert.match(o.detail, /could not be read/i);
});

test('a NaN count reaches the classifier as UNKNOWN, not as a populated index', () => {
  // The join between the two guards, which is where F-47 lived: each stage right about its own
  // half, nothing testing the seam.
  const o = R.classifyRetrieval({ hits: 0, vecOk: true, ftsOk: true, queryUsable: true, census: R.readCensus({ chunks: NaN }) });
  assert.equal(o.certain, false, 'a NaN count must not be laundered into a confident miss');
});

test('a miss found with half the search down is NOT certain either', () => {
  const degraded = classify({ vecOk: false });
  assert.equal(degraded.kind, 'miss');
  assert.equal(degraded.certain, false);
  assert.equal(classify({}).certain, true, 'the control: with both halves up a miss is a fact');
});

test('both backends down is unavailable, and it is a fault', () => {
  const o = classify({ vecOk: false, ftsOk: false });
  assert.equal(o.kind, 'unavailable');
  assert.equal(R.isFault(o.kind), true);
  assert.notEqual(o.kind, classify({ census: { chunks: 0, embedded: 0 } }).kind, 'unreachable is not the same as empty');
});

test('a query with no word in it is refused before any backend verdict is invented', () => {
  const o = R.classifyRetrieval({ hits: 0, vecOk: false, ftsOk: false, queryUsable: false, census: null });
  assert.equal(o.kind, 'unsearchable', 'nothing was searched, so nothing can be said about the backends');
});

test('hits are hits, but hits found with half the search down say so', () => {
  assert.equal(classify({ hits: 3 }).kind, 'hits');
  assert.equal(classify({ hits: 3 }).certain, true);
  assert.equal(classify({ hits: 3, ftsOk: false }).certain, false);
});

/* ======================================================= citations ============================ */

const cite = (id, url, over = {}) => ({ id, url, title: `Page ${url}`, text: `text ${id}`, ...over });

test('three chunks of one page are ONE citation', () => {
  // An answer citing [2][3][4] for a single page looks corroborated when it is not.
  const cites = R.buildCitations([cite('a', 'https://d/p1'), cite('b', 'https://d/p1'), cite('c', 'https://d/p2')], { now: NOW });
  assert.equal(cites.length, 2);
  assert.deepEqual(cites.map((c) => c.n), [1, 2]);
  assert.deepEqual(cites[0].chunkIds, ['a', 'b']);
});

test('a citation carries how old its source is', () => {
  const [fresh, old] = R.buildCitations(
    [cite('a', 'https://d/new', { indexedAt: NOW - DAY }), cite('b', 'https://d/old', { indexedAt: NOW - 900 * DAY })],
    { now: NOW },
  );
  assert.equal(fresh.freshness, 'fresh');
  assert.equal(old.freshness, 'stale');
  assert.ok(old.ageDays > fresh.ageDays);
});

test('a marker the answer invented is caught', () => {
  // The expensive kind of wrong: `[4]` makes a sentence look sourced, and it survives review.
  const cites = R.buildCitations([cite('a', 'https://d/p1'), cite('b', 'https://d/p2')], { now: NOW });
  const audit = R.auditCitations('Use Anchored [1]. It is documented in the API reference [4].', cites);
  assert.deepEqual(audit.used, [1]);
  assert.deepEqual(audit.unknown, [4], 'a citation of a source that was never supplied must be reported');
  assert.deepEqual(audit.unused, [2]);
});

test('a markdown link is not a citation, and there is no source zero', () => {
  const cites = R.buildCitations([cite('a', 'https://d/p1')], { now: NOW });
  const audit = R.auditCitations('See [1](https://d/p1) and [0] and [1].', cites);
  assert.deepEqual(audit.used, [1], 'the link must not forge a citation of source 1 by itself');
  assert.deepEqual(audit.unknown, [0], 'there is no source zero');
});

test('the context a model is shown is numbered the same way the citations are', () => {
  const hits = [cite('a', 'https://d/p1'), cite('b', 'https://d/p2')];
  const cites = R.buildCitations(hits, { now: NOW });
  const ctx = R.renderCitedContext(hits, cites, { excerptChars: 20 });
  assert.match(ctx, /^\[1\] /);
  assert.ok(ctx.includes('[2] '));
  // A chunk with no citation (no url) is left out rather than rendered with a marker that means
  // nothing.
  const orphan = R.renderCitedContext([...hits, { id: 'c', url: '', title: 'x', text: 'y' }], cites);
  assert.equal(orphan.includes('[3]'), false);
});
