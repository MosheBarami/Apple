// Hybrid document retrieval, executed.
//
// WHY THIS FILE EXISTS. apps/worker/src/rag.ts had NO test. Eight backlog rows — hybrid search,
// vector search, full-text search, embeddings — were marked done resting on one manual "verified
// live" check, and the module is in the product's hot path: `search_docs` is a tool the model
// calls and an authenticated route.
//
// The failure shape is the dangerous one. Both backends are wrapped in `.catch(() => [])`, so a
// Vectorize index that is empty, unreachable or misconfigured returns exactly what a query with no
// matches returns. Nothing downstream can tell "the corpus is broken" from "nothing matched", and
// the second is a normal answer nobody investigates.
//
// Found by Tommy while citing backlog rows: the row claimed done, and nothing could have caught it
// becoming untrue.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(tmpdir(), `apple-rag-${process.pid}.mjs`);

await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'rag.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: OUT,
  plugins: [{
    name: 'stub-gateway',
    // EXTERNAL, so the test and the module under test share one stub instance. Bundled, the module
    // gets a private copy and every behaviour this test sets is invisible to it.
    setup(b) {
      b.onResolve({ filter: /^\.\/gateway$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'gateway.mjs')).href, external: true }));
    },
  }],
});
const { searchDocs } = await import(pathToFileURL(OUT).href);
const { setEmbed } = await import(pathToFileURL(join(HERE, 'stubs', 'gateway.mjs')).href);
process.on('exit', () => rmSync(OUT, { force: true }));

/** A D1 stub whose two statements are answered from the fixtures given. */
function envWith({ vecMatches = [], chunks = [], ftsRows = [], vecThrows = false, d1Throws = false } = {}) {
  return {
    VEC: {
      async query() { if (vecThrows) throw new Error('vectorize unavailable'); return { matches: vecMatches }; },
    },
    CORPUS: {
      prepare(sql) {
        return {
          bind() { return this; },
          async all() {
            if (d1Throws) throw new Error('d1 unavailable');
            return { results: sql.includes('chunks_fts') ? ftsRows : chunks };
          },
        };
      },
    },
  };
}

const chunk = (id, over = {}) => ({ vec_id: id, title: `T-${id}`, url: `https://d/${id}`, text: `body ${id}`, ...over });

/* --------------------------------------------------------- the merge works --- */

test('a document found by BOTH backends outranks one found by either alone', () => {
  // The whole point of reciprocal rank fusion. If this did not hold, the hybrid search would be an
  // expensive way to run one of its two halves.
  setEmbed({ mode: 'ok' });
  return searchDocs(envWith({
    vecMatches: [{ id: 'a', score: 0.9 }, { id: 'b', score: 0.8 }],
    chunks: [chunk('a'), chunk('b')],
    ftsRows: [{ ...chunk('b'), rank: -5 }, { ...chunk('c'), rank: -4 }],
  }), 'parts and welds', 5).then((hits) => {
    assert.equal(hits[0].vecId, 'b', `b is in both lists and must rank first, got ${hits.map((h) => h.vecId).join(',')}`);
    assert.deepEqual(hits.map((h) => h.vecId).sort(), ['a', 'b', 'c']);
  });
});

test('k is honoured, so a caller cannot be handed more than it asked for', async () => {
  setEmbed({ mode: 'ok' });
  const hits = await searchDocs(envWith({
    vecMatches: [1, 2, 3, 4, 5].map((i) => ({ id: `v${i}`, score: 1 / i })),
    chunks: [1, 2, 3, 4, 5].map((i) => chunk(`v${i}`)),
  }), 'anything', 2);
  assert.equal(hits.length, 2);
});

test('a vector hit with no row in D1 is dropped, not returned half-built', async () => {
  // The index and the table can disagree: a vector survives a corpus rebuild that dropped its row.
  // Returning a chunk with an undefined title and url would put `undefined` on the user's screen.
  setEmbed({ mode: 'ok' });
  const hits = await searchDocs(envWith({
    vecMatches: [{ id: 'orphan', score: 0.9 }, { id: 'real', score: 0.8 }],
    chunks: [chunk('real')],
  }), 'q', 5);
  assert.deepEqual(hits.map((h) => h.vecId), ['real']);
  for (const h of hits) assert.ok(h.title && h.url, 'every returned chunk must be whole');
});

/* ------------------------------------------------- the FTS query is sanitised --- */

test('an FTS5 operator in the query cannot change the shape of the query', async () => {
  // fts5 has its own syntax. A user pasting an error message with quotes, asterisks or NEAR() must
  // produce a search, not a syntax error and not a different search than they asked for.
  setEmbed({ mode: 'throw' });
  let seenMatch = null;
  const env = envWith({ ftsRows: [] });
  env.CORPUS.prepare = (sql) => ({
    bind(m) { if (sql.includes('chunks_fts')) seenMatch = m; return this; },
    async all() { return { results: [] }; },
  });
  await searchDocs(env, 'Part.Size "NEAR" * OR (weld)', 5);
  assert.ok(seenMatch, 'the FTS query must have been issued');
  assert.equal(/[*()]/.test(seenMatch), false, `operators survived into the query: ${seenMatch}`);
  assert.match(seenMatch, /^"[\w.:]+"( OR "[\w.:]+")*$/, `not a list of quoted bare terms: ${seenMatch}`);
});

test('a query of only punctuation searches nothing rather than everything', async () => {
  setEmbed({ mode: 'throw' });
  const hits = await searchDocs(envWith({ ftsRows: [chunk('x')].map((c) => ({ ...c, rank: -1 })) }), '!!! ??? ***', 5);
  assert.deepEqual(hits, [], 'no usable term must mean no results, never an unfiltered match');
});

/* ------------------------------ a broken corpus must not look like no matches --- */

test('BOTH BACKENDS FAILING IS AN ERROR, not an empty result', async () => {
  // THE DEFECT THIS FILE WAS WRITTEN FOR. With both halves wrapped in `.catch(() => [])`, a corpus
  // that is unreachable, empty or misconfigured returns exactly what a query with no matches
  // returns — and "no results" is a normal answer nobody investigates. Eight features rested on
  // this module with nothing able to tell the two apart.
  setEmbed({ mode: 'throw' });
  await assert.rejects(
    () => searchDocs(envWith({ vecThrows: true, d1Throws: true }), 'parts and welds', 5),
    /unavailable/i,
    'a total retrieval failure must be reported, not rendered as zero hits',
  );
});

test('ONE backend failing still serves the other — resilience is not lost', async () => {
  // The control. Making total failure loud must not make partial failure fatal: a Vectorize outage
  // should degrade to keyword search, which is most of the value, rather than break the tool.
  setEmbed({ mode: 'throw' });
  const hits = await searchDocs(envWith({ vecThrows: true, ftsRows: [{ ...chunk('k'), rank: -3 }] }), 'welds', 5);
  assert.deepEqual(hits.map((h) => h.vecId), ['k']);
});

test('both backends returning EMPTY is a real answer and stays empty', async () => {
  // The other control, and the distinction that matters: genuinely no matches is not an error.
  setEmbed({ mode: 'ok' });
  const hits = await searchDocs(envWith({ vecMatches: [], ftsRows: [] }), 'a query about nothing', 5);
  assert.deepEqual(hits, []);
});
