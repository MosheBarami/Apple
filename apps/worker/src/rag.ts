// Hybrid retrieval over the Roblox docs corpus: Vectorize (semantic) + D1 FTS5 (keyword),
// merged with reciprocal rank fusion. Corpus is public documentation only — no user data.
import type { Env } from './env';
import { embed } from './gateway';

export interface DocChunk {
  vecId: string;
  title: string;
  url: string;
  text: string;
  score: number;
}

export async function searchDocs(env: Env, query: string, k = 5): Promise<DocChunk[]> {
  const [vec, fts] = await Promise.allSettled([vecSearch(env, query, 8), ftsSearch(env, query, 8)]);

  //[[ A BROKEN CORPUS MUST NOT LOOK LIKE NO MATCHES.
  //
  //   Both halves used to be wrapped in `.catch(() => [])`, so a Vectorize index that was empty,
  //   unreachable or misconfigured returned exactly what a query with no matches returns. "No
  //   results" is a normal answer nobody investigates, and eight features rest on this module with
  //   nothing able to tell the two apart.
  //
  //   One backend failing is still swallowed, deliberately: a Vectorize outage degrading to keyword
  //   search is most of the value, and making partial failure fatal would trade a real capability
  //   for tidiness. It is only when BOTH are gone that there is no retrieval at all, and that is
  //   not a result to be rendered — it is a fault to be reported. ]]
  if (vec.status === 'rejected' && fts.status === 'rejected') {
    // The REASONS are logged, never thrown. This message reaches the model through the tool
    // runner and can be repeated to a user, and §1 keeps provider and model identity out of that
    // path — the first draft interpolated `vec.reason`, which is exactly how a raw
    // `AiError: 3040 ... @cf/...` reached the Thinking card the last time, a defect the tool
    // runner's own catch block was written to fix.
    console.warn('searchDocs: both backends failed', { vec: String(vec.reason), fts: String(fts.reason) });
    throw new Error('doc search unavailable: the documentation index could not be reached');
  }
  const vecHits = vec.status === 'fulfilled' ? vec.value : [];
  const ftsHits = fts.status === 'fulfilled' ? fts.value : [];
  const rrf = new Map<string, { chunk: DocChunk; score: number }>();
  const add = (list: DocChunk[], weight: number) => {
    list.forEach((c, i) => {
      const prev = rrf.get(c.vecId);
      const s = weight / (60 + i);
      if (prev) prev.score += s;
      else rrf.set(c.vecId, { chunk: c, score: s });
    });
  };
  add(vecHits, 1);
  add(ftsHits, 1);
  return [...rrf.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(({ chunk, score }) => ({ ...chunk, score }));
}

async function vecSearch(env: Env, query: string, k: number): Promise<DocChunk[]> {
  const [vector] = await embed(env, [query]);
  if (!vector) return [];
  const res = await env.VEC.query(vector, { topK: k, returnMetadata: 'all' });
  const ids = res.matches.map((m) => m.id);
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = await env.CORPUS.prepare(`select vec_id, title, url, text from chunks where vec_id in (${placeholders})`)
    .bind(...ids)
    .all<{ vec_id: string; title: string; url: string; text: string }>();
  const byId = new Map(rows.results.map((r) => [r.vec_id, r]));
  return res.matches
    .map((m) => {
      const r = byId.get(m.id);
      return r ? { vecId: r.vec_id, title: r.title, url: r.url, text: r.text, score: m.score } : null;
    })
    .filter((x): x is DocChunk => !!x);
}

async function ftsSearch(env: Env, query: string, k: number): Promise<DocChunk[]> {
  // sanitize into fts5 OR query of bare terms
  const terms = query
    .replace(/[^\w.:\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .slice(0, 8);
  if (!terms.length) return [];
  const match = terms.map((t) => `"${t.replaceAll('"', '')}"`).join(' OR ');
  const rows = await env.CORPUS.prepare(
    `select vec_id, title, url, text, bm25(chunks_fts) as rank from chunks_fts where chunks_fts match ? order by rank limit ?`,
  )
    .bind(match, k)
    .all<{ vec_id: string; title: string; url: string; text: string; rank: number }>();
  return rows.results.map((r) => ({ vecId: r.vec_id, title: r.title, url: r.url, text: r.text, score: -r.rank }));
}
