// An index nobody filled must not answer like a corpus with no answer.
//
// WHY THIS FILE EXISTS, beside rag.test.mjs. That file proved the loud half: when BOTH backends
// throw, `searchDocs` reports a fault instead of rendering zero hits. It also, correctly, asserted
// the control — "both backends returning EMPTY is a real answer and stays empty".
//
// That control is where the remaining defect lived. Both backends returning empty is a real answer
// ONLY IF the index has something in it. Against a `chunks` table with zero rows — a deployment
// where the uploader never ran, a database replaced by a deploy, a corpus half-uploaded and
// abandoned — nothing throws, nothing warns, and every question about Roblox comes back "no
// matching documentation". That answer is about the upload, not about the query, and there was no
// way for anything downstream to tell.
//
// These tests drive the real module with a stubbed D1 and Vectorize, because the distinction is
// only worth anything if it survives the wiring: the census has to actually be queried, its answer
// actually consulted, and an unreadable census must NOT be laundered into a confident miss.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(tmpdir(), `apple-rag-state-${process.pid}.mjs`);

await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'rag.ts')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outfile: OUT,
  plugins: [
    {
      name: 'stub-gateway',
      // EXTERNAL so the test and the module under test share one stub instance.
      setup(b) {
        b.onResolve({ filter: /^\.\/gateway$/ }, () => ({
          path: pathToFileURL(join(HERE, 'stubs', 'gateway.mjs')).href,
          external: true,
        }));
      },
    },
  ],
});
const { searchDocs, searchDocsDetailed } = await import(pathToFileURL(OUT).href);
const { setEmbed } = await import(pathToFileURL(join(HERE, 'stubs', 'gateway.mjs')).href);
process.on('exit', () => rmSync(OUT, { force: true }));

const chunk = (id, over = {}) => ({ vec_id: id, title: `T-${id}`, url: `https://d/${id}`, text: `body ${id}`, ...over });

/**
 * A D1 + Vectorize stub that answers each statement from fixtures and RECORDS what was asked, so a
 * test can assert that a query was or was not issued — "the census was consulted" is a claim about
 * a call, not about a return value.
 */
function envWith({
  vecMatches = [],
  chunks = [],
  ftsRows = [],
  stamps = [],
  census = { chunks: 8326, embedded: 8000 },
  censusThrows = false,
  stampsThrow = false,
  vecThrows = false,
  ftsThrows = false,
} = {}) {
  const sqlSeen = [];
  let vecQueries = 0;
  const env = {
    sqlSeen,
    get vecQueries() {
      return vecQueries;
    },
    VEC: {
      async query() {
        vecQueries++;
        if (vecThrows) throw new Error('vectorize unavailable');
        return { matches: vecMatches };
      },
    },
    CORPUS: {
      prepare(sql) {
        sqlSeen.push(sql);
        return {
          bound: [],
          bind(...args) {
            this.bound = args;
            return this;
          },
          async all() {
            if (sql.includes('chunks_fts')) {
              if (ftsThrows) throw new Error('fts unavailable');
              return { results: ftsRows };
            }
            if (sql.includes('indexed_at')) {
              if (stampsThrow) throw new Error('no such column: indexed_at');
              return { results: stamps };
            }
            return { results: chunks };
          },
          async first() {
            if (censusThrows) throw new Error('no such table: chunks');
            return census;
          },
        };
      },
    },
  };
  return env;
}

const censusIssued = (env) => env.sqlSeen.filter((s) => s.includes('count(*)')).length;

/* ============ the distinction ============================================================== */

test('AN EMPTY INDEX IS A FAULT, a corpus with no answer is a result', async () => {
  // THE DEFECT. Both of these searches find nothing, nothing throws in either, and until now both
  // returned exactly `[]`.
  setEmbed({ mode: 'ok' });
  const emptyEnv = envWith({ vecMatches: [], ftsRows: [], census: { chunks: 0, embedded: 0 } });
  const fullEnv = envWith({ vecMatches: [], ftsRows: [], census: { chunks: 8326, embedded: 8000 } });

  const empty = await searchDocsDetailed(emptyEnv, 'how do i weld two parts', 5);
  const miss = await searchDocsDetailed(fullEnv, 'how do i weld two parts', 5);

  assert.deepEqual(empty.hits, []);
  assert.deepEqual(miss.hits, []);
  // Same hits. Different answers.
  assert.notEqual(empty.outcome.kind, miss.outcome.kind, 'an unfilled index still reads as a miss');
  assert.equal(empty.outcome.kind, 'empty-index');
  assert.equal(miss.outcome.kind, 'miss');
  assert.equal(miss.outcome.certain, true);

  // And the census was actually consulted rather than assumed.
  assert.equal(censusIssued(emptyEnv), 1, 'the index was never counted');
});

test('the compatible surface THROWS on an empty index and does not on a miss', async () => {
  // Every existing caller renders what `searchDocs` returns to a user or hands it to a model, so
  // the fault has to arrive as a fault on that path too.
  setEmbed({ mode: 'ok' });
  await assert.rejects(
    () => searchDocs(envWith({ census: { chunks: 0, embedded: 0 } }), 'welding parts', 5),
    /empty/i,
    'an index with no rows must not be reported as "no matching documentation"',
  );
  const hits = await searchDocs(envWith({ census: { chunks: 8326, embedded: 8000 } }), 'welding parts', 5);
  assert.deepEqual(hits, [], 'the control: a genuine miss is still an empty array, not an error');
});

test('a census that could not be read is reported as UNKNOWN, not as a confident miss', async () => {
  // A failure to observe must not render as an observation. This is the branch that decides
  // whether an outage in the count becomes a claim about the corpus.
  setEmbed({ mode: 'ok' });
  const env = envWith({ censusThrows: true });
  const res = await searchDocsDetailed(env, 'welding parts', 5);
  assert.equal(res.outcome.kind, 'miss');
  assert.equal(res.outcome.certain, false);
  assert.match(res.outcome.detail, /could not be read/i);
  // ...and an uncertain miss is still not a fault: the tool keeps working.
  const hits = await searchDocs(envWith({ censusThrows: true }), 'welding parts', 5);
  assert.deepEqual(hits, []);
});

test('an index with rows and no vectors says so', async () => {
  setEmbed({ mode: 'ok' });
  const res = await searchDocsDetailed(envWith({ census: { chunks: 8326, embedded: 0 } }), 'welding parts', 5);
  assert.equal(res.outcome.kind, 'unembedded-index');
  assert.match(res.outcome.detail, /embedded/i);
});

test('a search that FOUND something does not pay for a census', async () => {
  // The count is only worth a query on the path where the answer matters. Finding something has
  // already proved the index is not empty.
  setEmbed({ mode: 'ok' });
  const env = envWith({ vecMatches: [{ id: 'a', score: 0.9 }], chunks: [chunk('a')] });
  const res = await searchDocsDetailed(env, 'welding parts', 5);
  assert.equal(res.hits.length, 1);
  assert.equal(res.outcome.kind, 'hits');
  assert.equal(censusIssued(env), 0, 'the happy path must not buy a count it does not need');
});

test('a miss found with the semantic half down is not stated as a fact', async () => {
  setEmbed({ mode: 'throw' });
  const res = await searchDocsDetailed(envWith({ ftsRows: [] }), 'welding parts', 5);
  assert.equal(res.outcome.kind, 'miss');
  assert.equal(res.outcome.certain, false, 'half a search finding nothing is not evidence of nothing');
});

test('a query with no word in it never reaches a backend', async () => {
  // Embedding costs neurons. Answering "no matches" for `???` by paying for an embedding and a
  // full-text scan is the expensive way to say the same nothing — and it reports the wrong reason.
  setEmbed({ mode: 'ok' });
  const env = envWith({});
  const res = await searchDocsDetailed(env, '!!! ??? ***', 5);
  assert.equal(res.outcome.kind, 'unsearchable');
  assert.equal(env.vecQueries, 0, 'an unsearchable query paid for an embedding');
  assert.equal(env.sqlSeen.length, 0, 'an unsearchable query hit the database');
});

/* ============ the pipeline is wired, not merely present ==================================== */

test('reranking actually reorders what fusion returned', async () => {
  // A reranker that is unit-tested and unwired reorders nothing. `far` wins the fusion (rank 1 in
  // the vector list and absent from the keyword list beats rank 3), and loses on the words.
  setEmbed({ mode: 'ok' });
  const env = envWith({
    vecMatches: [
      { id: 'far', score: 0.99 },
      { id: 'near', score: 0.4 },
    ],
    chunks: [
      chunk('far', { title: 'Lighting and atmosphere', text: 'sky, clouds, colour grading' }),
      chunk('near', { title: 'Welding parts together', text: 'use a WeldConstraint to weld two parts' }),
    ],
  });
  const res = await searchDocsDetailed(env, 'weld two parts', 5);
  assert.deepEqual(res.hits.map((h) => h.vecId), ['near', 'far'], 'the chunk that answers the question must come first');
  assert.ok(res.hits[0].fusedScore < res.hits[1].fusedScore, 'and it must have won DESPITE a worse fused score');
});

test('citations come back with the hits, one per source', async () => {
  setEmbed({ mode: 'ok' });
  const env = envWith({
    vecMatches: [{ id: 'a1', score: 0.9 }, { id: 'a2', score: 0.8 }, { id: 'b1', score: 0.7 }],
    chunks: [
      chunk('a1', { url: 'https://d/page-a' }),
      chunk('a2', { url: 'https://d/page-a' }),
      chunk('b1', { url: 'https://d/page-b' }),
    ],
  });
  const res = await searchDocsDetailed(env, 'welding', 5);
  assert.equal(res.citations.length, 2, 'two chunks of one page are one citation');
  assert.deepEqual(res.citations.map((c) => c.n), [1, 2]);
  assert.deepEqual(res.citations[0].chunkIds.sort(), ['a1', 'a2']);
});

test('freshness is read from the index and travels with the result', async () => {
  setEmbed({ mode: 'ok' });
  const old = Date.now() - 900 * 86_400_000;
  const env = envWith({
    vecMatches: [{ id: 'a', score: 0.9 }],
    chunks: [chunk('a')],
    stamps: [{ vec_id: 'a', indexed_at: old }],
  });
  const res = await searchDocsDetailed(env, 'welding', 5);
  assert.equal(res.hits[0].indexedAt, old);
  assert.equal(res.citations[0].freshness, 'stale', 'a source indexed two and a half years ago is not fresh');
});

test('a deployment whose index predates the timestamp column still searches', async () => {
  // The column is added by corpus-init, and databases that predate it must not lose retrieval —
  // they lose the freshness SIGNAL, which is reported as unknown rather than as fresh.
  setEmbed({ mode: 'ok' });
  const env = envWith({ vecMatches: [{ id: 'a', score: 0.9 }], chunks: [chunk('a')], stampsThrow: true });
  const res = await searchDocsDetailed(env, 'welding', 5);
  assert.equal(res.hits.length, 1);
  assert.equal(res.citations[0].freshness, 'unknown');
  assert.equal(res.citations[0].ageDays, null);
});

test('the keyword half is given a sanitised MATCH expression, once', async () => {
  setEmbed({ mode: 'throw' });
  const env = envWith({ ftsRows: [] });
  await searchDocsDetailed(env, 'Part.Size "NEAR" * OR (weld)', 5);
  const fts = env.sqlSeen.filter((s) => s.includes('chunks_fts'));
  assert.equal(fts.length, 1, 'the keyword half must be issued exactly once');
});

test('both backends failing is still a fault, not an empty page', async () => {
  // The guarantee rag.test.mjs established, preserved through the rewrite.
  setEmbed({ mode: 'throw' });
  const res = await searchDocsDetailed(envWith({ vecThrows: true, ftsThrows: true }), 'welding parts', 5);
  assert.equal(res.outcome.kind, 'unavailable');
  await assert.rejects(() => searchDocs(envWith({ vecThrows: true, ftsThrows: true }), 'welding parts', 5), /unavailable/i);
});
