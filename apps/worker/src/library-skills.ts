// The StudPilot Library's skills for the agent (master plan §4.3 category 16, §8 step 6): procedures copied word for
// word from the Roblox Creator Documentation (CC BY 4.0), each graded by two critics for an agent building in Studio.
// Only A and B reach the model (L5). search_creation_skills lists them beside the authored catalogue; read_creation_skill
// reads one by its library id, with its source and attribution.
import type { Env } from './env';
import type { Embed } from './library-code';

export const LIBRARY_SKILL_PREFIX = 'skill:docs:';
const MAX_STEPS_CHARS = 6000;

interface SkillRow { id: string; title: string; grade: string | null; grade_notes: string | null; source_url: string; attribution: string | null; body: string | null }

const offerable = (r: Pick<SkillRow, 'grade'>) => r.grade === 'A' || r.grade === 'B';
const use = (r: SkillRow) => {
  try { return ((JSON.parse(r.grade_notes ?? '[]') as { why: string }[])[0]?.why ?? '').slice(0, 160); } catch { return ''; }
};

/** The documentation procedures for a task: semantic search in the library index, A before B, at most `limit`. */
export async function searchLibrarySkills(env: Env, query: string, embed: Embed, limit = 4) {
  if (!env.LIBRARY || !query.trim()) return [];
  const [vector] = await embed(env, [query]);
  const res = await env.LIBRARY.query(vector!, { topK: 20, returnMetadata: 'all', filter: { kind: 'skill' } });
  const ids = res.matches.map((m) => String((m.metadata as Record<string, unknown> | undefined)?.item ?? '')).filter(Boolean);
  if (!ids.length) return [];
  const rows = (await env.CORPUS.prepare(`select id, title, grade, grade_notes, source_url, attribution, null as body from library_items where kind = 'skill' and id in (${ids.map(() => '?').join(',')})`).bind(...ids).all<SkillRow>()).results ?? [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const top = ids.map((id) => byId.get(id)).filter((r): r is SkillRow => !!r && offerable(r)).slice(0, Math.max(1, Math.min(limit, 6)));
  top.sort((x, y) => (x.grade === y.grade ? 0 : x.grade === 'A' ? -1 : 1));
  return top.map((r) => ({ id: r.id, title: r.title, grade: r.grade, use: use(r), source: r.source_url }));
}

/** One documentation procedure by its library id: the steps word for word, where they come from, and the credit. */
export async function readLibrarySkill(env: Env, id: string) {
  const row = await env.CORPUS.prepare('select id, title, grade, grade_notes, source_url, attribution, body from library_items where id = ? and kind = \'skill\'').bind(id).first<SkillRow>();
  if (!row || !offerable(row) || !row.body) return { error: `no library skill ${id}`, hint: 'use an id search_creation_skills returned' };
  const steps = row.body.length <= MAX_STEPS_CHARS ? row.body : `${row.body.slice(0, MAX_STEPS_CHARS)}\n[... the rest is at the source]`;
  return { id: row.id, title: row.title, steps, source: row.source_url, attribution: row.attribution, licence: 'CC BY 4.0', note: 'Official Roblox steps, copied word for word. Follow them with the Studio tools; they are not proof that a build passed.' };
}
