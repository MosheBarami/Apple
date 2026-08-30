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
  const [vecHits, ftsHits] = await Promise.all([vecSearch(env, query, 8).catch(() => []), ftsSearch(env, query, 8).catch(() => [])]);
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
