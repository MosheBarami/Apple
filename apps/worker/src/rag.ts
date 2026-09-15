// Hybrid retrieval over the Roblox docs corpus: Vectorize (semantic) + D1 FTS5 (keyword), merged
// with reciprocal rank fusion, reranked lexically, and returned with citations.
//
// Corpus is public documentation only — no user data. The mechanics (query building, fusion,
// reranking, freshness, citations, and the empty-index distinction) live in retrieval.ts as pure
// functions, so every one of them can be handed an empty index, a NaN score or a broken timestamp
// by a test rather than by production.
import type { Env } from './env';
import { embed } from './gateway';
import {
  auditCitations,
  buildCitations,
  classifyRetrieval,
  dropIrrelevant,
  isFault,
  isSearchableQuery,
  keywordQuery,
  readCensus,
  renderCitedContext,
  rerank,
  rrfFuse,
  type Citation,
  type CorpusCensus,
  type RetrievalOutcome,
} from './retrieval';

export interface DocChunk {
  vecId: string;
  title: string;
  url: string;
  text: string;
  /** Rerank score: what the result list is ordered by. */
  score: number;
  /** The fused retrieval score before reranking, kept so a reorder is auditable. */
  fusedScore?: number;
  /** When this passage was written into the index, if this deployment records it. */
  indexedAt?: number;
}

export interface DocSearch {
  hits: DocChunk[];
  outcome: RetrievalOutcome;
  citations: Citation[];
}

export { auditCitations, renderCitedContext };

/**
 * Retrieval with its own diagnosis attached.
 *
 *[[ A BROKEN OR EMPTY CORPUS MUST NOT LOOK LIKE NO MATCHES.
 *
 *   Both halves used to be wrapped in `.catch(() => [])`, so a Vectorize index that was empty,
 *   unreachable or misconfigured returned exactly what a query with no matches returns. That half
 *   was fixed: a DOUBLE failure now throws. The half that was left is the one that actually ships,
 *   because it involves nothing failing at all — both backends answer correctly with nothing,
 *   because `chunks` has zero rows. "No results" is a normal answer nobody investigates, and eight
 *   features rest on this module with nothing able to tell that apart from an upload that never
 *   ran.
 *
 *   So a zero-hit search now COUNTS THE INDEX before it reports, and `outcome.kind` carries the
 *   answer: `miss` (the corpus has passages, none matched), `empty-index` (it has none),
 *   `unembedded-index` (it has passages and no vectors, so only keyword search could ever hit).
 *   When the count itself could not be read, or one backend was down, `outcome.certain` is false
 *   and the miss is reported as unproven rather than as a fact.
 *
 *   One backend failing is still swallowed, deliberately: a Vectorize outage degrading to keyword
 *   search is most of the value, and making partial failure fatal would trade a real capability
 *   for tidiness. It is now VISIBLE, though — `certain:false` — rather than silent. ]]
 */
export async function searchDocsDetailed(env: Env, query: string, k = 5): Promise<DocSearch> {
  const now = Date.now();
  const raw = String(query ?? '');

  if (!isSearchableQuery(raw)) {
    return {
      hits: [],
      outcome: classifyRetrieval({ hits: 0, vecOk: false, ftsOk: false, queryUsable: false, census: null }),
      citations: [],
    };
  }

  const kw = keywordQuery(raw);
  const [vec, fts] = await Promise.allSettled([vecSearch(env, raw, 8), ftsSearch(env, kw?.match ?? null, 8)]);

  if (vec.status === 'rejected' && fts.status === 'rejected') {
    // The REASONS are logged, never returned. This message reaches the model through the tool
    // runner and can be repeated to a user, and §1 keeps provider and model identity out of that
    // path — the first draft interpolated `vec.reason`, which is exactly how a raw
    // `AiError: 3040 ... @cf/...` reached the Thinking card the last time, a defect the tool
    // runner's own catch block was written to fix.
    console.warn('searchDocs: both backends failed', { vec: String(vec.reason), fts: String(fts.reason) });
    return {
      hits: [],
      outcome: classifyRetrieval({ hits: 0, vecOk: false, ftsOk: false, queryUsable: true, census: null }),
      citations: [],
    };
  }

  const vecHits = vec.status === 'fulfilled' ? vec.value : [];
  const ftsHits = fts.status === 'fulfilled' ? fts.value : [];
  const byId = new Map<string, Row>();
  for (const r of [...vecHits, ...ftsHits]) if (!byId.has(r.vec_id)) byId.set(r.vec_id, r);

  const fused = rrfFuse([
    { ids: vecHits.map((r) => r.vec_id) },
    { ids: ftsHits.map((r) => r.vec_id) },
  ]);

  const stamps = await indexedAtFor(env, [...byId.keys()]);
  // Which half found it is carried into the rerank, because it decides whether a hit with no
  // lexical overlap is a semantic find or keyword noise. See `dropIrrelevant`.
  const semantic = new Set(vecHits.map((r) => r.vec_id));
  const ranked = dropIrrelevant(
    raw,
    rerank(
      raw,
      [...byId.values()].map((r) => ({
        id: r.vec_id,
        title: r.title,
        text: r.text,
        url: r.url,
        fusedScore: fused.get(r.vec_id) ?? 0,
        indexedAt: stamps.get(r.vec_id),
        semantic: semantic.has(r.vec_id),
      })),
      { now },
    ),
  ).slice(0, k);

  const hits: DocChunk[] = ranked.map((r) => ({
    vecId: r.id,
    title: r.title,
    url: r.url,
    text: r.text,
    score: r.rerankScore,
    fusedScore: r.fusedScore,
    indexedAt: typeof r.indexedAt === 'number' ? r.indexedAt : undefined,
  }));

  // The census costs a query, so it is only paid for on the path where the answer matters: a
  // search that found nothing. A search that found something has already proved the index is not
  // empty.
  const census = hits.length ? null : await corpusCensus(env);
  const outcome = classifyRetrieval({
    hits: hits.length,
    vecOk: vec.status === 'fulfilled',
    ftsOk: fts.status === 'fulfilled',
    queryUsable: true,
    census,
  });

  return { hits, outcome, citations: buildCitations(hits.map((h) => ({ ...h, id: h.vecId })), { now }) };
}

/**
 * The compatible surface: hits, or a thrown fault.
 *
 * A fault is thrown rather than returned empty for the same reason the double-backend failure is:
 * an empty index and an unreachable one are not results, and anything that renders them to a user
 * or hands them to a model should be interrupted rather than fed nothing.
 *
 * NO PRODUCTION CALLER REMAINS, and that is worth stating rather than leaving to be discovered.
 * `search_docs`, `/api/docs/search`, `/api/admin/rag-test` and the admin model-test all moved to
 * `searchDocsDetailed`, because every one of them would rather explain a fault than propagate it.
 * What keeps this here is `tests/rag.test.mjs`: the guarantee that a total retrieval failure is an
 * error and not an empty page is written against THIS function, and it is a guarantee worth
 * keeping expressible. If a future caller wants an exception instead of a diagnosis, this is the
 * shape — and if none ever does, this and its tests should go together, not separately.
 */
export async function searchDocs(env: Env, query: string, k = 5): Promise<DocChunk[]> {
  const res = await searchDocsDetailed(env, query, k);
  if (isFault(res.outcome.kind)) throw new Error(`doc search unavailable: ${res.outcome.detail}`);
  return res.hits;
}

interface Row {
  vec_id: string;
  title: string;
  url: string;
  text: string;
}

async function vecSearch(env: Env, query: string, k: number): Promise<Row[]> {
  const [vector] = await embed(env, [query]);
  if (!vector) return [];
  const res = await env.VEC.query(vector, { topK: k, returnMetadata: 'all' });
  const ids = res.matches.map((m) => m.id);
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = await env.CORPUS.prepare(`select vec_id, title, url, text from chunks where vec_id in (${placeholders})`)
    .bind(...ids)
    .all<Row>();
  const byId = new Map(rows.results.map((r) => [r.vec_id, r]));
  // Order is the vector index's, not D1's: `in (...)` returns rows in table order and would throw
  // the ranking away before fusion ever saw it.
  return res.matches.map((m) => byId.get(m.id)).filter((r): r is Row => !!r);
}

async function ftsSearch(env: Env, match: string | null, k: number): Promise<Row[]> {
  // A query that produced no MATCH expression is not a search that found nothing — there was no
  // search. Returning [] here would be indistinguishable from a miss, so the caller is told by the
  // null it passed in and this half simply contributes nothing.
  if (!match) return [];
  const rows = await env.CORPUS.prepare(
    `select vec_id, title, url, text, bm25(chunks_fts) as rank from chunks_fts where chunks_fts match ? order by rank limit ?`,
  )
    .bind(match, k)
    .all<Row & { rank: number }>();
  return rows.results.map((r) => ({ vec_id: r.vec_id, title: r.title, url: r.url, text: r.text }));
}

/**
 * How big is the index?
 *
 * Every failure mode returns null rather than a zero. A `count(*)` that threw is not evidence of an
 * empty table — it is evidence of nothing — and a null travels through `classifyRetrieval` as
 * "unknown", which downgrades a miss to uncertain instead of accusing the corpus of being empty.
 */
export async function corpusCensus(env: Pick<Env, 'CORPUS'>): Promise<CorpusCensus | null> {
  try {
    const row = await env.CORPUS.prepare(
      `select count(*) as chunks, coalesce(sum(case when embedded = 1 then 1 else 0 end), 0) as embedded from chunks`,
    ).first<{ chunks: number; embedded: number }>();
    const census = readCensus(row);
    if (census) return census;
  } catch {
    // Deployments predating the `embedded` column reach here; the count still exists.
  }
  try {
    const row = await env.CORPUS.prepare(`select count(*) as chunks from chunks`).first<{ chunks: number }>();
    return readCensus(row);
  } catch {
    return null;
  }
}

/**
 * Index timestamps for a set of chunks, for the freshness signal.
 *
 * An empty map is returned whenever they cannot be read — a deployment without the column, or a
 * failed query. That flows into `freshness()` as `undefined`, which classifies as `unknown` and
 * applies no decay: an unreadable timestamp must not make a document look fresh, and must not make
 * it look stale either.
 */
async function indexedAtFor(env: Pick<Env, 'CORPUS'>, ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  try {
    const placeholders = ids.map(() => '?').join(',');
    const rows = await env.CORPUS.prepare(`select vec_id, indexed_at from chunks where vec_id in (${placeholders})`)
      .bind(...ids)
      .all<{ vec_id: string; indexed_at: number | null }>();
    const out = new Map<string, number>();
    for (const r of rows.results) {
      if (typeof r.indexed_at === 'number' && Number.isFinite(r.indexed_at)) out.set(r.vec_id, r.indexed_at);
    }
    return out;
  } catch {
    return new Map();
  }
}
