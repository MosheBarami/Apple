// The mechanics of retrieval, as pure functions: keyword query building, rank fusion, reranking,
// freshness, citations — and the one distinction this module was written for.
//
//[[ AN EMPTY INDEX MUST NOT ANSWER LIKE A REAL MISS.
//
//   `searchDocs` already refuses to render a double backend failure as "no results" (rag.ts).
//   That stops one step short of the case that actually ships: BOTH backends
//   answer, correctly, with nothing — because the `chunks` table has zero rows, or because the
//   vector half of it was never embedded.
//
//   That is not a fact about the corpus. It is a fact about an upload that never ran, and it
//   arrives wearing the costume of a normal, uninteresting answer. `classifyRetrieval` is the
//   place the two are told apart, and it is deliberately a pure function of a census + two backend
//   verdicts + a hit count, so a test can hand it an empty index without needing one.
//
//   The same discipline runs the other way: when the census itself could not be read, or when one
//   backend is down, "no matches" is NOT promoted to a fact. `certain:false` says so. A failure to
//   observe must not render as an observation — including this module's own failure to observe. ]]

// ---------------------------------------------------------------------------------------------
// Tokenising — shared, so the reranker measures coverage over the SAME terms the index was asked
// for. Two tokenisers would let a chunk score 100% coverage of terms the query never carried.
// ---------------------------------------------------------------------------------------------

/** Dots survive because `Humanoid.WalkSpeed` is one identifier to a Roblox developer. */
const SPLIT = /[^\p{L}\p{N}_.]+/u;

/** Common words that match most of the corpus; dropped only when something else survives. */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are',
  'was', 'were', 'be', 'been', 'do', 'does', 'did', 'how', 'what', 'why', 'when', 'where', 'who',
  'can', 'should', 'would', 'could', 'i', 'my', 'me', 'it', 'its', 'this', 'that', 'there', 'here',
  'please', 'help', 'about', 'from', 'into', 'at', 'by', 'as', 'not', 'no', 'you', 'your',
]);

const MAX_TERM_CHARS = 64;

/** Bare terms of a string, lowercased, deduped, order preserved. Dotted names also yield parts. */
export function terms(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of String(text ?? '').toLowerCase().split(SPLIT)) {
    const t = raw.replace(/^\.+|\.+$/g, '').slice(0, MAX_TERM_CHARS);
    if (t.length < 2) continue;
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
    if (t.includes('.')) {
      for (const part of t.split('.')) {
        if (part.length < 2 || seen.has(part)) continue;
        seen.add(part);
        out.push(part);
      }
    }
  }
  return out;
}

/** How many terms a single query may contribute, before phrases. */
export const MAX_QUERY_TERMS = 8;

/**
 * The terms a query is actually searched BY.
 *
 * One list, used by the FTS expression, by the reranker's coverage signal and by the relevance
 * floor — because three tokenisers would let a chunk score full coverage of terms the index was
 * never asked for, and would let the floor count a word the search discarded. The first version had
 * exactly that seam: `dropIrrelevant` counted `parts and welds` as THREE terms because `and`
 * survived in its copy of the tokenising, and applied a floor the keyword query's own two-term view
 * would not have.
 *
 * Stopwords go only when something else is left. "how to" must still search for "how to" rather
 * than collapse into a query that asks for nothing — and a query that asks for nothing answers "no
 * matches", which is the lie this whole module exists to stop, reintroduced as an optimisation.
 */
export function queryTerms(raw: string, maxTerms: number = MAX_QUERY_TERMS): string[] {
  const all = terms(raw);
  const meaty = all.filter((t) => !STOPWORDS.has(t));
  return (meaty.length ? meaty : all).slice(0, maxTerms);
}

/**
 * Is there anything in this string to search FOR?
 *
 * Separate from `keywordQuery` on purpose, and deliberately weaker than it. A query made entirely
 * of stopwords ("how do i") still has a perfectly good embedding; so does a single character. The
 * two-character floor belongs to the FTS tokeniser, where a one-letter term matches most of the
 * corpus — it is not a statement about whether the query can be searched at all. Only a query with
 * no letter or digit in it ("???", "   ") is unsearchable, and that answer must not be dressed up
 * as an empty result set.
 */
export function isSearchableQuery(raw: string): boolean {
  return /[\p{L}\p{N}]/u.test(String(raw ?? ''));
}

// ---------------------------------------------------------------------------------------------
// Keyword search — the FTS5 MATCH expression
// ---------------------------------------------------------------------------------------------

export interface KeywordQuery {
  /** The expression to bind into `chunks_fts match ?`. */
  match: string;
  /** Bare terms, for the reranker's coverage signal. */
  terms: string[];
  /** Phrases the user quoted, kept as phrases. */
  phrases: string[];
}

/**
 * FTS5 string literals are double-quoted; an embedded quote is escaped by doubling it.
 *
 * The previous inline version DELETED quotes instead (`t.replaceAll('"', '')`), which turns a term
 * into a different term rather than into an escaped one. Exported so that is falsifiable directly:
 * with the tokeniser in front of it no term can currently carry a quote, so a test driving
 * `keywordQuery` alone could not tell doubling from deleting.
 */
export function ftsLiteral(s: string): string {
  return `"${s.replaceAll('"', '""')}"`;
}

/**
 * Build the keyword half of the query.
 *
 * Three things the previous inline version got wrong, each of which shows up as a bad result page
 * rather than as an error:
 *
 *   - `"` was DELETED from a term rather than escaped, so `say "hello"` searched for `hello` and
 *     `foo"bar` searched for `foobar` — a different word.
 *   - A quoted phrase was shredded into its words, so `"Humanoid.WalkSpeed"` could match a page
 *     with `Humanoid` in one paragraph and `WalkSpeed` in another.
 *   - Every word was OR-ed in at equal footing, stopwords included, so `how do i make a part` put
 *     `how`, `do`, `i`, `a` into an OR with `part` — the four commonest words in the corpus,
 *     drowning the one that carried the question.
 *
 * Returns null when nothing searchable survives. Null is NOT an empty result: the caller has to
 * decide what it means, and `classifyRetrieval` does.
 */
export function keywordQuery(raw: string, opts: { maxTerms?: number } = {}): KeywordQuery | null {
  const maxTerms = opts.maxTerms ?? MAX_QUERY_TERMS;
  const text = String(raw ?? '');

  const phrases: string[] = [];
  let rest = text;
  for (const m of text.matchAll(/"([^"]{2,})"/g)) {
    const p = m[1]!.trim().slice(0, 200);
    if (p && !phrases.includes(p)) phrases.push(p);
    rest = rest.replace(m[0], ' ');
  }

  const chosen = queryTerms(rest, maxTerms);

  if (!chosen.length && !phrases.length) return null;
  const match = [...phrases.map(ftsLiteral), ...chosen.map(ftsLiteral)].join(' OR ');
  return { match, terms: chosen, phrases };
}

// ---------------------------------------------------------------------------------------------
// Rank fusion
// ---------------------------------------------------------------------------------------------

/** The RRF constant. 60 is the published default and matches what asset-library.ts already uses. */
export const RRF_K = 60;

/**
 * Reciprocal rank fusion over any number of ranked id lists.
 *
 * A weight that is not a finite number is refused rather than coerced: `weight ?? 1` defends
 * undefined and null and lets NaN through, and one NaN here makes every fused score NaN, which
 * sorts arbitrarily and silently returns the wrong documents in the right-looking shape.
 */
export function rrfFuse(lists: { ids: string[]; weight?: number }[], k: number = RRF_K): Map<string, number> {
  const fused = new Map<string, number>();
  for (const list of lists) {
    const w = list.weight === undefined ? 1 : list.weight;
    if (!Number.isFinite(w)) throw new Error(`rrfFuse: weight must be a finite number, got ${String(list.weight)}`);
    list.ids.forEach((id, i) => {
      fused.set(id, (fused.get(id) ?? 0) + (w as number) / (k + i));
    });
  }
  return fused;
}

// ---------------------------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------------------------

export type FreshnessState = 'fresh' | 'aging' | 'stale' | 'unknown';

export interface Freshness {
  /** Null whenever the age is not known — never 0, which reads as "indexed just now". */
  ageDays: number | null;
  state: FreshnessState;
  /** Multiplier applied to a rerank score. Floored, so age can reorder but never erase. */
  decay: number;
}

export const FRESH_DAYS = 30;
export const AGING_DAYS = 180;
/** Age halves relevance over this many days, until the floor. */
export const HALF_LIFE_DAYS = 365;
/** A stale document is still a document. Below this, freshness would be censorship, not ranking. */
export const DECAY_FLOOR = 0.6;

const DAY_MS = 86_400_000;

/**
 * How old is this, and how much should that matter?
 *
 * Every branch below exists because a timestamp reaches this function from D1, from a JSON body,
 * or from a fixture, and exactly one of those three guarantees a number. `Date.parse` of a
 * non-date returns NaN, and `NaN > AGING_DAYS` is false — so a NaN age silently classifies as
 * FRESH, the most flattering answer available, on every document whose timestamp is broken. That
 * is the shape this repository keeps finding: a guard that fails open into an observation.
 */
export function freshness(indexedAt: unknown, now: number, halfLifeDays: number = HALF_LIFE_DAYS): Freshness {
  const unknown: Freshness = { ageDays: null, state: 'unknown', decay: 1 };
  if (!Number.isFinite(now)) return unknown;

  let ms: number;
  if (typeof indexedAt === 'number') ms = indexedAt;
  else if (indexedAt instanceof Date) ms = indexedAt.getTime();
  else if (typeof indexedAt === 'string' && indexedAt.trim()) ms = Date.parse(indexedAt);
  else return unknown;

  if (!Number.isFinite(ms)) return unknown;

  const ageDays = (now - ms) / DAY_MS;
  // A document indexed in the future is a clock fault, not a fresh document. Beyond a day of skew
  // we refuse to call it anything.
  if (ageDays < -1) return unknown;

  const age = Math.max(0, ageDays);
  const state: FreshnessState = age <= FRESH_DAYS ? 'fresh' : age <= AGING_DAYS ? 'aging' : 'stale';
  const life = Number.isFinite(halfLifeDays) && halfLifeDays > 0 ? halfLifeDays : HALF_LIFE_DAYS;
  const decay = Math.max(DECAY_FLOOR, Math.pow(0.5, age / life));
  return { ageDays: Math.round(age * 10) / 10, state, decay };
}

// ---------------------------------------------------------------------------------------------
// Reranking
// ---------------------------------------------------------------------------------------------

export interface Rerankable {
  id: string;
  title: string;
  text: string;
  /** The fused retrieval score this item arrived with. */
  fusedScore: number;
  /** When this chunk was written into the index, in any of the three shapes `freshness` takes. */
  indexedAt?: unknown;
}

export interface RerankSignals {
  /** Fraction of the query's distinct terms present anywhere in the chunk. */
  coverage: number;
  /** Fraction present in the title. */
  titleCoverage: number;
  /** 1 when the query's own wording appears contiguously. */
  phrase: number;
  /** Freshness multiplier actually applied. */
  decay: number;
  freshness: FreshnessState;
  /** False when the item arrived with a score that is not a finite number. */
  fusedUsable: boolean;
}

export type Reranked<T> = T & { rerankScore: number; signals: RerankSignals };

/** How far each lexical signal may move a result. Exported so the numbers are auditable. */
export const RERANK_WEIGHTS = Object.freeze({ coverage: 1.2, titleCoverage: 0.8, phrase: 0.6 });

/**
 * Reorder a fused result set by how well each chunk actually answers the words that were typed.
 *
 * Multiplicative over the fused score, like `rerankMultiplier` in asset-library.ts, and for the
 * same reason: this reorders what the retrievers found, it does not invent relevance they did not
 * find. The maximum lexical boost is 1 + 1.2 + 0.8 + 0.6 = 3.6x and the maximum freshness penalty
 * is DECAY_FLOOR — so age can reorder near-ties and can never overturn a decisive lexical win.
 * That relationship is the thing worth asserting, not the individual constants.
 */
export function rerank<T extends Rerankable>(
  query: string,
  items: T[],
  opts: { now?: number } = {},
): Reranked<T>[] {
  const now = opts.now ?? Date.now();
  const q = queryTerms(query);
  const phrase = String(query ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

  // Normalise against the best finite score present, so weights mean the same thing whether the
  // fused scores came from RRF (~0.03) or from a cosine similarity (~0.8).
  let max = 0;
  for (const it of items) if (Number.isFinite(it.fusedScore) && it.fusedScore > max) max = it.fusedScore;
  const norm = max > 0 ? max : 1;

  //[[ COVERING THE RARE WORDS IS WHAT COVERAGE MEANS.
  //
  //   Unweighted coverage counts terms, so a page matching six ordinary words beats a page matching
  //   two distinctive ones. Measured on the real corpus, that is not a subtlety: `configure a
  //   PostgreSQL connection pool with pgbouncer` scored 0.50 coverage against "Create waterfalls
  //   with VFX — Configure cascades", on the strength of `configure`, `connection` and `pool`. The
  //   three words that made the question what it was — postgresql, pgbouncer, and the sense of
  //   `pool` it meant — appeared nowhere, and the page sailed past the relevance floor.
  //
  //   The weight is computed over THE CANDIDATES IN HAND rather than over the corpus, which needs
  //   no statistics, no extra query and no index support: a term present in every candidate cannot
  //   discriminate between them whatever its global frequency, and a term present in none of them
  //   is the one the query was really about. ]]
  const docTerms = items.map((it) => new Set(terms(`${String(it.title ?? '')}\n${String(it.text ?? '')}`)));
  const weight = new Map<string, number>();
  for (const t of q) {
    const df = docTerms.reduce((n, d) => n + (d.has(t) ? 1 : 0), 0);
    weight.set(t, Math.log(1 + items.length / (df + 0.5)));
  }
  const totalWeight = q.reduce((n, t) => n + (weight.get(t) ?? 0), 0);

  return items
    .map((it, i) => {
      const fusedUsable = Number.isFinite(it.fusedScore);
      const base = fusedUsable ? Math.max(0, it.fusedScore) / norm : 0;
      const title = String(it.title ?? '').toLowerCase();
      const body = `${title}\n${String(it.text ?? '')}`.toLowerCase();

      //[[ TOKENS, NOT SUBSTRINGS, and this was measured rather than reasoned.
      //
      //   Coverage used `body.includes(t)`, so the query term `pod` scored a hit against `podium`,
      //   `tripod` and every `Pod` inside a longer identifier. On the real corpus that inflated the
      //   coverage of `kubernetes horizontal pod autoscaler custom metrics adapter` enough to carry
      //   five Roblox pages past the relevance floor — the retriever answering a question about
      //   Kubernetes with documentation about parts. A signal that fires on fragments of words is
      //   not measuring whether the document contains the word. ]]
      const bodyTerms = docTerms[i] ?? new Set<string>();
      const titleTerms = new Set(terms(title));
      const hit = q.reduce((n, t) => n + (bodyTerms.has(t) ? (weight.get(t) ?? 0) : 0), 0);
      const titleHit = q.reduce((n, t) => n + (titleTerms.has(t) ? (weight.get(t) ?? 0) : 0), 0);
      const coverage = totalWeight > 0 ? hit / totalWeight : 0;
      const titleCoverage = totalWeight > 0 ? titleHit / totalWeight : 0;
      const phraseHit = phrase.length >= 4 && body.includes(phrase) ? 1 : 0;

      const f = freshness(it.indexedAt, now);
      const lexical =
        1 +
        RERANK_WEIGHTS.coverage * coverage +
        RERANK_WEIGHTS.titleCoverage * titleCoverage +
        RERANK_WEIGHTS.phrase * phraseHit;

      return {
        item: { ...it, rerankScore: base * lexical * f.decay, signals: { coverage, titleCoverage, phrase: phraseHit, decay: f.decay, freshness: f.state, fusedUsable } },
        i,
      };
    })
    // Ties break on arrival order, so the same inputs always produce the same page.
    .sort((a, b) => b.item.rerankScore - a.item.rerankScore || a.i - b.i)
    .map(({ item }) => item as Reranked<T>);
}

/** A lexical-only hit must cover at least this fraction of the query's distinct terms. */
export const MIN_LEXICAL_COVERAGE = 0.34;
/** Below this many query terms, a coverage floor cannot mean anything. See below. */
export const FLOOR_MIN_TERMS = 3;

/**
 * Drop results that only look retrieved.
 *
 *[[ MEASURED, on the real 8,326-chunk corpus. `kubernetes horizontal pod autoscaler custom metrics
 *   adapter` returned FIVE Roblox documentation passages, ranked and ready to be handed to the
 *   model as "official documentation". The keyword half ORs its terms, so one page containing the
 *   word `custom` is a match — and `search_docs` passes whatever it gets to a model that has been
 *   told this is what the documentation says.
 *
 *   A retriever that answers every question, including the ones its corpus has never heard of, has
 *   no negatives: "nothing matched" becomes unreachable, and with it every downstream distinction
 *   this module draws. Retrieval evaluation cannot score negatives against a retriever that never
 *   returns none.
 *
 *   TWO THINGS ARE EXEMPT, both deliberately.
 *
 *   A SEMANTIC hit is kept whatever its lexical coverage: the entire value of the vector half is
 *   finding the page about interpolating a CFrame when the question said "smoothly move a part",
 *   and a lexical floor applied to it would delete exactly the hits the embedding was paid for.
 *
 *   A query of one or two terms is exempt as a whole, because a coverage floor over it cannot
 *   distinguish anything: every match is already a half or all of the query. The floor only starts
 *   to carry information once the question says several things and a document answers one. ]]
 */
export function dropIrrelevant<T extends { signals: RerankSignals; semantic?: boolean }>(
  query: string,
  items: T[],
  opts: { minCoverage?: number } = {},
): T[] {
  const q = queryTerms(query);
  if (q.length < FLOOR_MIN_TERMS) return items;
  const floor = opts.minCoverage ?? MIN_LEXICAL_COVERAGE;
  return items.filter((it) => it.semantic === true || it.signals.phrase > 0 || it.signals.coverage >= floor);
}

// ---------------------------------------------------------------------------------------------
// The empty-index distinction
// ---------------------------------------------------------------------------------------------

export interface CorpusCensus {
  /** Rows in `chunks`. */
  chunks: number;
  /** Rows with a vector upserted, or null when this deployment cannot tell. */
  embedded: number | null;
}

/**
 * Read a census off whatever D1 returned.
 *
 * A count that is not a non-negative integer is not a census — it is a failed read wearing a
 * number, and promoting it would let `chunks: NaN` answer "the index is not empty" forever (NaN
 * === 0 is false). Anything unreadable comes back null, which downstream means "unknown", which
 * downstream means the miss is reported as UNCERTAIN.
 */
export function readCensus(raw: unknown): CorpusCensus | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const chunks = r.chunks;
  if (typeof chunks !== 'number' || !Number.isInteger(chunks) || chunks < 0) return null;
  const e = r.embedded;
  const embedded = typeof e === 'number' && Number.isInteger(e) && e >= 0 ? e : null;
  return { chunks, embedded };
}

export type RetrievalKind =
  /** Documents were found. */
  | 'hits'
  /** The index holds documents and none of them matched. A real answer. */
  | 'miss'
  /** The index holds nothing. Not an answer — an upload that never ran. */
  | 'empty-index'
  /** Rows exist but none carry a vector: the semantic half is a table nobody filled. */
  | 'unembedded-index'
  /** The query carried no word to search for. */
  | 'unsearchable'
  /** Neither backend answered. */
  | 'unavailable';

export interface RetrievalOutcome {
  kind: RetrievalKind;
  /**
   * Is this outcome a fact about the corpus?
   *
   * False whenever something that would have changed the answer could not be observed: a backend
   * down, or a census that could not be read. A `miss` with `certain:false` is "I did not find
   * anything and I cannot tell you that means there is nothing" — which is the honest sentence,
   * and the one that got skipped every time this bug was written.
   */
  certain: boolean;
  /** Plain prose for a human or a model. Never names a provider or a model (§1). */
  detail: string;
  census: CorpusCensus | null;
}

/** Is this outcome a fault to report rather than a result to render? */
export function isFault(kind: RetrievalKind): boolean {
  return kind === 'empty-index' || kind === 'unavailable';
}

export function classifyRetrieval(input: {
  hits: number;
  vecOk: boolean;
  ftsOk: boolean;
  queryUsable: boolean;
  census: CorpusCensus | null;
}): RetrievalOutcome {
  const { hits, vecOk, ftsOk, queryUsable, census } = input;

  // ORDER MATTERS, and this clause is first deliberately. A query with no word in it is refused
  // before either backend is touched — so the caller has no backend verdict to report, and if this
  // clause sat below the availability check the caller would have to invent `vecOk: true` to reach
  // it. A fabricated verdict is exactly the failure this module exists to stop.
  if (!queryUsable) {
    return {
      kind: 'unsearchable',
      certain: true,
      detail: 'the query contained no word to search for, so nothing was searched',
      census,
    };
  }
  if (!vecOk && !ftsOk) {
    return {
      kind: 'unavailable',
      certain: true,
      detail: 'the documentation index could not be reached, so nothing was searched',
      census,
    };
  }
  if (hits > 0) {
    return {
      kind: 'hits',
      certain: vecOk && ftsOk,
      detail: vecOk && ftsOk ? `${hits} matching passage${hits === 1 ? '' : 's'}` : `${hits} matching passage${hits === 1 ? '' : 's'}, from keyword or semantic search alone — the other half was unavailable, so better matches may exist`,
      census,
    };
  }
  if (census === null) {
    return {
      kind: 'miss',
      certain: false,
      detail: 'nothing matched, and the size of the documentation index could not be read — this may be an index that was never filled rather than a query with no answer',
      census,
    };
  }
  if (census.chunks === 0) {
    return {
      kind: 'empty-index',
      certain: true,
      detail: 'the documentation index is empty: it holds no passages at all, so "no matches" says nothing about the query',
      census,
    };
  }
  if (census.embedded === 0) {
    return {
      kind: 'unembedded-index',
      certain: true,
      detail: `the documentation index holds ${census.chunks} passages but none of them were embedded, so only keyword search ran and a semantic match could not have been found`,
      census,
    };
  }
  const degraded = !vecOk || !ftsOk;
  return {
    kind: 'miss',
    certain: !degraded,
    detail: degraded
      ? `nothing matched in ${census.chunks} indexed passages, but half of the search was unavailable — this is not evidence the documentation has no answer`
      : `nothing matched in ${census.chunks} indexed passages`,
    census,
  };
}

// ---------------------------------------------------------------------------------------------
// Citations
// ---------------------------------------------------------------------------------------------

export interface Citable {
  id: string;
  title: string;
  url: string;
  indexedAt?: unknown;
}

export interface Citation {
  /** 1-based marker, as it appears in the rendered context and in the answer. */
  n: number;
  title: string;
  url: string;
  /** Every chunk that contributed to this source, in the order retrieved. */
  chunkIds: string[];
  freshness: FreshnessState;
  ageDays: number | null;
}

/**
 * One numbered entry per SOURCE, not per chunk.
 *
 * Three chunks of the Humanoid page are one citation — a reader following `[2]` three times to the
 * same URL learns nothing the second and third time, and an answer that cites [2][3][4] for one
 * page looks corroborated when it is not.
 */
export function buildCitations(hits: Citable[], opts: { now?: number } = {}): Citation[] {
  const now = opts.now ?? Date.now();
  const byUrl = new Map<string, Citation>();
  for (const h of hits) {
    const url = String(h.url ?? '').trim();
    if (!url) continue;
    const found = byUrl.get(url);
    if (found) {
      if (!found.chunkIds.includes(h.id)) found.chunkIds.push(h.id);
      continue;
    }
    const f = freshness(h.indexedAt, now);
    byUrl.set(url, {
      n: byUrl.size + 1,
      title: String(h.title ?? '').trim() || url,
      url,
      chunkIds: [h.id],
      freshness: f.state,
      ageDays: f.ageDays,
    });
  }
  return [...byUrl.values()];
}

/** The context block a model is given, with the markers it is expected to cite by. */
export function renderCitedContext(
  hits: (Citable & { text: string })[],
  citations: Citation[],
  opts: { excerptChars?: number } = {},
): string {
  const cap = opts.excerptChars ?? 900;
  const nByUrl = new Map(citations.map((c) => [c.url, c.n]));
  const blocks: string[] = [];
  for (const h of hits) {
    const n = nByUrl.get(String(h.url ?? '').trim());
    if (n === undefined) continue;
    blocks.push(`[${n}] ${h.title}\n${String(h.text ?? '').slice(0, cap)}`);
  }
  return blocks.join('\n\n');
}

export interface CitationAudit {
  /** Markers the answer used that exist. */
  used: number[];
  /** Markers the answer used that DO NOT exist — a citation of a source it was never shown. */
  unknown: number[];
  /** Sources supplied and never cited. */
  unused: number[];
}

/**
 * Which sources did the answer actually cite?
 *
 * The one that matters is `unknown`. A model handed three passages and writing "[4]" has cited a
 * document that does not exist, and the marker makes the sentence look sourced — the most
 * expensive kind of wrong, because it survives review. `[0]` counts as unknown for the same
 * reason; there is no source zero.
 *
 * Markdown links are not citations: `[docs](https://…)` is a link whose label happens to sit in
 * brackets, and counting `[1](…)` as a citation of source 1 would let link syntax forge one.
 */
export function auditCitations(answer: string, citations: Citation[]): CitationAudit {
  const known = new Set(citations.map((c) => c.n));
  const used = new Set<number>();
  const unknown = new Set<number>();
  const text = String(answer ?? '');
  for (const m of text.matchAll(/\[(\d{1,3})\](?!\()/g)) {
    const n = Number(m[1]);
    if (known.has(n)) used.add(n);
    else unknown.add(n);
  }
  const asc = (a: number, b: number) => a - b;
  return {
    used: [...used].sort(asc),
    unknown: [...unknown].sort(asc),
    unused: citations.map((c) => c.n).filter((n) => !used.has(n)),
  };
}
