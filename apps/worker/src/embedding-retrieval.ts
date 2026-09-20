// Find the verified module a customer MEANT, when their words are not the module's words.
//
// THE MEASUREMENT THIS ANSWERS. packages/training/runs/knowledge-reach.json: the 80 verified
// modules are found 80/80 when the query is phrased like the module's own contract, and 49/80
// (61%) when it is phrased the way a customer talks. The knowledge is PRESENT and is not REACHED —
// this repository's central failure shape, at the knowledge layer.
//
// docs/knowledge-retrieval-diagnosis.md puts a ceiling of 74% top-1 on any pure scoring fix,
// because six of the thirty-one failures are VOCABULARY ABSENT: the customer's noun appears nowhere
// in the module's id, family or contract, so no weighting over those tokens can reach it.
// `interval-overlap` scores exactly ZERO under the keyword scorer on "check if two time slots
// clash". An embedding does not score tokens, so it is not subject to that floor. Whether it
// actually clears it is measured by packages/training/src/measure-embedding-retrieval.mjs, which
// bundles THIS file with the repo's own esbuild and scores it on the same 80 recorded queries —
// never on a retyped imitation of it.
//
// WHY THIS FILE EXISTS TWICE OVER. It was measured once and never committed: docs/embedding-
// retrieval.md has carried a "66/80 — 82.5%, as it would ship" row against this path since
// 2026-09-20 while `apps/worker/src/embedding-retrieval.ts` was absent from the tree AND from every
// branch in git. The harness imports it, so the harness could not run, so the number could not be
// reproduced by anyone who tried. A number whose instrument is missing is not a result. This file
// restores the instrument; the run that re-measured it is cited in docs/embedding-retrieval.md.
//
// SAFETY, and it is the same argument verified-modules.ts makes. The index is STATICALLY imported
// so esbuild embeds it in the bundle: no filesystem read at runtime, no fetch, no external code.
// Every vector in it was produced by scripts/build-module-embeddings.mjs from text this repository
// already carries.
import index from './generated/embedding-index.json';

interface QuantisedRow { id: string; b64: string; scale: number }
interface EmbeddingIndex {
  schemaVersion: number;
  model: string;
  dims: number;
  queryPrefix: string;
  builtAt: string;
  moduleTextHash: string;
  uiTextHash: string;
  modules: QuantisedRow[];
  ui: QuantisedRow[];
}

const IX = index as unknown as EmbeddingIndex;

/** The encoder the index was built with. A query embedded by any other model is meaningless here. */
export const EMBEDDING_MODEL = IX.model;
export const EMBEDDING_DIMS = IX.dims;
export const EMBEDDING_BUILT_AT = IX.builtAt;

/**
 * THE QUERY INSTRUCTION TRAVELS WITH THE INDEX, it is not chosen by the caller.
 *
 * bge-*-en-v1.5 is ASYMMETRIC: it was trained with this instruction on the query side and nothing
 * on the document side. If the index were built with an instruction and a caller embedded without
 * one, every score would be quietly low and nothing would say why — a silent degradation, which is
 * worse than an error. So the prefix is read off the index and exported for the caller to apply.
 */
export const EMBEDDING_QUERY_PREFIX = IX.queryPrefix ?? '';

/**
 * The SHA-256 prefixes of the exact strings that were embedded, carried so a staleness check is
 * possible at all. apps/worker/tests/embedding-retrieval.test.mjs recomputes them from the corpus
 * on disk and fails when they have diverged — see the header of scripts/build-module-embeddings.mjs
 * for why a stale index is the dangerous case: it still loads, still returns five confident
 * answers, and says nothing.
 */
export const EMBEDDING_MODULE_TEXT_HASH = IX.moduleTextHash;
export const EMBEDDING_UI_TEXT_HASH = IX.uiTextHash;

/**
 * THE FLOOR BELOW WHICH A UI LOOKUP MUST SAY IT FOUND NOTHING.
 *
 * Measured, not chosen by feel, and RE-AIMED against the corpus as it stands rather than inherited.
 * docs/embedding-retrieval.md chose 0.55 against a 21-row UI corpus. That corpus is now 29 rows —
 * the eight screen files the document predicted would land have landed — and on 2026-09-20 the
 * same harness re-measured every floor over the shipping composition (live `getUIConstruction`
 * first, embedding only on its misses), 53 recorded lookups:
 *
 *   floor 0.55   right 31/34   WRONG 3   invented 13 of the 19 genuinely-uncovered lookups
 *   floor 0.60   right 29/34   wrong 0   invented  4 of 19
 *   lexical only right 27/34   wrong 0   invented  0
 *
 * 0.55 buys four extra right answers with three WRONG ones and thirteen inventions. Under this
 * module's own contract — a miss must SAY it is a miss — that is not a trade worth taking, so the
 * floor moves to 0.60, where the embedding still adds two covered lookups over the lexical
 * resolver and answers nothing it should have declined.
 *
 * SAY THE LIMIT OUT LOUD: this floor was picked by looking at the same 53 lookups it is scored on,
 * so 29/34 is selection-optimistic. It is written down here rather than presented as a tuned
 * constant that fell out of nowhere.
 *
 * FOUR INVENTIONS IN NINETEEN IS ONLY ACCEPTABLE BECAUSE THEY ARRIVE LABELLED.
 * `suggestUIByVector` returns `recordedMatch: false` on every stage-two hit, so an invention reads
 * as "the closest thing anyone inspected is tycoon" and never as sourced construction for a trading
 * screen. A stage-two hit wearing a stage-one boolean would break the contract above.
 */
export const UI_SIMILARITY_FLOOR = 0.6;

/**
 * int8 -> float, one scale per vector, over the L2-normalised original. The bytes are stored
 * unsigned, so 128..255 are the negative half and are folded back before scaling.
 */
function dequantise(row: QuantisedRow, dims: number): Float32Array {
  const bytes = typeof atob === 'function'
    ? Uint8Array.from(atob(row.b64), (c) => c.charCodeAt(0))
    : new Uint8Array(Buffer.from(row.b64, 'base64'));
  if (bytes.length !== dims) {
    throw new Error(`embedding-index: row ${row.id} has ${bytes.length} bytes, index declares ${dims} dims`);
  }
  const v = new Float32Array(dims);
  for (let i = 0; i < dims; i += 1) {
    //[[ `noUncheckedIndexedAccess` types every index read as possibly-undefined. The length was
    //   checked against `dims` above, so the byte is there; `?? 0` states that rather than
    //   asserting it away with `!`, and a zero byte is a zero component either way.
    const byte = bytes[i] ?? 0;
    const signed = byte > 127 ? byte - 256 : byte;
    v[i] = (signed / 127) * row.scale;
  }
  return v;
}

//[[ DECODED ONCE PER ISOLATE, ON FIRST USE.
//   Decoding at module scope would pay 109 base64 decodes on every cold start including the
//   requests that never search. Decoding per call would pay them on every search. Neither is
//   necessary: the index is immutable and the isolate is reused.
let MODULE_VECTORS: { id: string; v: Float32Array }[] | null = null;
let UI_VECTORS: { id: string; v: Float32Array }[] | null = null;
const decodeAll = (rows: QuantisedRow[]) => rows.map((r) => ({ id: r.id, v: dequantise(r, IX.dims) }));
const moduleVectors = () => (MODULE_VECTORS ??= decodeAll(IX.modules));
const uiVectors = () => (UI_VECTORS ??= decodeAll(IX.ui));

/**
 * L2-normalise. The stored vectors are already unit length, and so are the query vectors the
 * measurement harness hands in — but `gateway.ts embed()` returns whatever the provider returned,
 * and an unnormalised query turns every score into a similarity scaled by the query's magnitude.
 * That would not fail; it would silently move the UI floor. Normalising is idempotent on a unit
 * vector, so doing it here costs one pass and removes the whole class of mistake.
 */
function unit(v: ArrayLike<number>): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i += 1) { const x = v[i] ?? 0; n += x * x; }
  n = Math.sqrt(n) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i += 1) out[i] = (v[i] ?? 0) / n;
  return out;
}

function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

/** Rank `rows` against an already-unit query. Ties break by id so the order is total and stable. */
function rank(q: Float32Array, rows: { id: string; v: Float32Array }[], limit: number) {
  const scored = rows.map((r) => ({ id: r.id, score: cosine(q, r.v) }));
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return scored.slice(0, Math.max(0, limit));
}

/**
 * The whole module search: 80 dot products. There is no candidate stage and no reranker — at this
 * corpus size a candidate stage would be pure latency, and saying so is more honest than shipping
 * one because retrieval systems usually have one.
 *
 * @param queryVector the query embedded by EMBEDDING_MODEL, with EMBEDDING_QUERY_PREFIX applied.
 */
export function searchModulesByVector(queryVector: ArrayLike<number>, limit = 5): { id: string; score: number }[] {
  if (!queryVector || queryVector.length !== IX.dims) return [];
  return rank(unit(queryVector), moduleVectors(), limit);
}

/**
 * STAGE ONE FOR A UI LOOKUP: the row whose id IS the query, separators folded out of both sides.
 *
 * Twenty-five of the 53 recorded lookups are a row's own name, including the underscore ids the
 * model is handed verbatim by `get_ui_construction`'s description and pinned into `get_genre_kit`'s
 * JSON enum. Answering those with a nearest-neighbour search would replace a deterministic bug with
 * a probabilistic one. They are settled here, exactly, and only what this returns null for is
 * allowed to reach the embedding.
 *
 * The fold strips separators rather than canonicalising them to one, so `tower defense`,
 * `tower-defense` and `tower_defense` are the same key. It deliberately does NOT reach spelling:
 * `tower_defence` is a different string and is stage two's problem.
 */
export function resolveUIByIdentity(query: string, ids: readonly string[]): string | null {
  const fold = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, '');
  const key = fold(query);
  if (!key) return null;
  //[[ A COLLISION MUST NOT BE ANSWERED BY WHICHEVER ROW CAME FIRST.
  //   Two ids that fold to the same key make this lookup ambiguous, and the honest answer to an
  //   ambiguous identity is "not an identity match" — the query falls through to stage two, which
  //   reports its confidence. The test asserts the fold is injective over the shipped corpus, so
  //   this branch is a guard against the corpus changing, not a known case.
  let found: string | null = null;
  for (const id of ids) {
    if (fold(id) !== key) continue;
    if (found) return null;
    found = id;
  }
  return found;
}

/**
 * STAGE TWO: the nearest UI row, but only if it is near enough to be worth naming, and never
 * wearing stage one's authority.
 *
 * `recordedMatch` is false on every result this returns. The caller shows a stage-one hit as the
 * construction guide for that genre and a stage-two hit as "the closest thing anyone inspected",
 * because two of the twenty uncovered lookups do come back above the floor and must not read as
 * sourced answers. Below the floor this returns null, which is the right answer for a lookup
 * nothing in the corpus covers.
 */
export function suggestUIByVector(
  queryVector: ArrayLike<number>,
  floor = UI_SIMILARITY_FLOOR,
): { id: string; score: number; recordedMatch: false; note: string } | null {
  if (!queryVector || queryVector.length !== IX.dims) return null;
  const [best] = rank(unit(queryVector), uiVectors(), 1);
  if (!best || best.score < floor) return null;
  return {
    id: best.id,
    score: best.score,
    recordedMatch: false,
    note: `no reference was recorded for this request; the closest thing anyone inspected is ${best.id}`,
  };
}
