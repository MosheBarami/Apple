// library_search (master plan §3, §4.6 L-A6): the library by meaning first, then filters. Only A and B items reach
// the build model (L5): the most relevant first, A before B among those; an item rated Mild (horror styles) only
// when the caller allows it. Each result is the text card of §3.3: GLM never sees a picture. `uploaded` says whether
// the item is on Roblox yet (an asset id), so a caller can tell what it may insert today.
import type { Env } from './env';
import type { Embed } from './library-code';

export interface LibraryCard {
  id: string; title: string; kind: string; family: string | null; grade: string; licence: string;
  triangles: number | null; line: string; uploaded: boolean;
}
interface Row {
  id: string; title: string; kind: string; family: string | null; grade: string | null; licence_class: string;
  triangles: number | null; grade_notes: string | null; roblox_asset_id: number | null; maturity: string | null;
}

const line = (r: Row) => {
  try { return ((JSON.parse(r.grade_notes ?? '[]') as { why: string }[])[0]?.why ?? '').slice(0, 140); } catch { return ''; }
};

/** Whether a row may be offered: graded A or B, and not Mild unless allowed. Pure. */
export const offered = (r: Pick<Row, 'grade' | 'maturity'>, allowMild = false) =>
  (r.grade === 'A' || r.grade === 'B') && (allowMild || r.maturity !== 'Mild');

export async function searchLibrary(
  env: Env, embed: Embed,
  opts: { query: string; kind?: string; family?: string; limit?: number; allowMild?: boolean; oneFamily?: boolean },
): Promise<{ cards: LibraryCard[] } | { error: string }> {
  // A set (a village, a matching UI) comes from one style family: the family of the best match, searched again (§3).
  if (opts.oneFamily && !opts.family) {
    const first = await searchLibrary(env, embed, { ...opts, oneFamily: false, limit: 1 });
    if ('error' in first || !first.cards[0]?.family) return first;
    return searchLibrary(env, embed, { ...opts, oneFamily: false, family: first.cards[0].family });
  }
  if (!env.LIBRARY) return { error: 'the library index is not configured here' };
  const query = opts.query.trim();
  if (!query) return { error: 'a query is required' };
  // kind may name several, comma-separated ("code,skill": a module or an official recipe with its code).
  const kinds = (opts.kind ?? '').split(',').map((k) => k.trim()).filter(Boolean);
  const filter: Record<string, string | { $in: string[] }> = {};
  if (kinds.length) filter.kind = kinds.length === 1 ? kinds[0]! : { $in: kinds };
  if (opts.family) filter.family = opts.family;
  const [vector] = await embed(env, [query]);
  const res = await env.LIBRARY.query(vector!, { topK: 40, returnMetadata: 'all', ...(Object.keys(filter).length ? { filter } : {}) });
  const ids = res.matches.map((m) => String((m.metadata as Record<string, unknown> | undefined)?.item ?? '')).filter(Boolean);
  if (!ids.length) return { cards: [] };
  const rows = (await env.CORPUS.prepare(`select id, title, kind, family, grade, licence_class, triangles, grade_notes, roblox_asset_id, maturity from library_items where id in (${ids.map(() => '?').join(',')})`).bind(...ids).all<Row>()).results ?? [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const limit = Math.max(1, Math.min(opts.limit ?? 8, 12));
  // The most relevant offered items first, then A before B among them (as library_code and the skills do): sorting
  // all 40 candidates by grade first let the few A items of a kind push relevant B items out of every answer.
  const top = ids.map((id) => byId.get(id)).filter((r): r is Row => !!r && offered(r, opts.allowMild)).slice(0, limit);
  top.sort((x, y) => (x.grade === y.grade ? 0 : x.grade === 'A' ? -1 : 1));
  return {
    cards: top.map((r) => ({
      id: r.id, title: r.title, kind: r.kind, family: r.family, grade: r.grade!, licence: r.licence_class,
      triangles: r.triangles, line: line(r), uploaded: r.roblox_asset_id != null,
    })),
  };
}
