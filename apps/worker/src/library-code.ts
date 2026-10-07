// The StudPilot Library's code modules for the agent (master plan §4.3 category 14, §8 step 6): a search over the
// audited, graded modules and the plan that inserts one with its dependencies. Only A/B modules that are standalone
// (no string-require loader, every dependency in the library) and not audited unsafe are ever offered or inserted;
// a restricted one says which feature it is for. Bundles (instance trees) live in R2 under library/code/.
import type { Env } from './env';

/** Embeds texts with the library index's model (gateway.embed in the worker; injected so this file stays testable). */
export type Embed = (env: Env, texts: string[]) => Promise<number[][]>;

export interface CodeRow {
  id: string;
  title: string;
  package_name: string | null;
  grade: string | null;
  sanitize: string | null;
  grade_notes: string | null;
  deps: string | null;
  standalone: number | null;
  bundle_key: string | null;
  load_test: string | null;
  licence_class: string;
  attribution: string | null;
  source_url: string;
}
export interface TreeNode { name: string; className: 'ModuleScript' | 'Script' | 'LocalScript' | 'Folder'; source?: string; children?: TreeNode[] }
export interface Bundle { id: string; name: string; tree: TreeNode; deps: { alias: string; id: string | null }[]; licence: string; attribution?: string; source_url: string }

const COLUMNS = 'id, title, package_name, grade, sanitize, grade_notes, deps, standalone, bundle_key, load_test, licence_class, attribution, source_url';

/** Whether a row may reach a user's place: graded A/B, standalone, bundled, not audited unsafe, and not failed to load. Pure. */
export function offerable(r: CodeRow): boolean {
  if (r.grade !== 'A' && r.grade !== 'B') return false;
  if (r.standalone !== 1 || !r.bundle_key) return false;
  // L8: a package that did not load when built and required in Studio is never offered.
  try { if ((JSON.parse(r.load_test ?? 'null') as { ok?: boolean } | null)?.ok === false) return false; } catch { return false; }
  return audit(r).verdict !== 'unsafe';
}

/** { verdict, note } from the sanitize report: clean-scan, safe, restricted (with what for) or unsafe. Pure. */
export function audit(r: Pick<CodeRow, 'sanitize'>): { verdict: string; note?: string } {
  try {
    const s = JSON.parse(r.sanitize ?? '{}') as { audit?: string; audit_notes?: { verdict: string; why: string }[] };
    const restricted = s.audit_notes?.find((n) => n.verdict === 'restricted');
    return { verdict: s.audit ?? 'unknown', ...(s.audit === 'restricted' && restricted ? { note: restricted.why.slice(0, 220) } : {}) };
  } catch {
    return { verdict: 'unknown' };
  }
}

const use = (r: CodeRow) => {
  try { return (JSON.parse(r.grade_notes ?? '[]') as { why: string }[])[0]?.why ?? ''; } catch { return ''; }
};

/** The shortlist for a need: semantic search in the library index, filtered to offerable code modules. */
export async function searchLibraryCode(env: Env, need: string, embed: Embed, limit = 8) {
  if (!env.LIBRARY) return { error: 'the library index is not configured here' };
  const [vector] = await embed(env, [need]);
  const res = await env.LIBRARY.query(vector!, { topK: 40, returnMetadata: 'all', filter: { kind: 'code' } });
  const ids = res.matches.map((m) => String((m.metadata as Record<string, unknown> | undefined)?.item ?? '')).filter(Boolean);
  if (!ids.length) return { modules: [] };
  const rows = (await env.CORPUS.prepare(`select ${COLUMNS} from library_items where id in (${ids.map(() => '?').join(',')})`).bind(...ids).all<CodeRow>()).results ?? [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  // The most relevant offerable packages, A before B (stable, so relevance orders each grade): a superseded B like
  // ProfileService must not shadow its A successor ProfileStore.
  const top = ids.map((id) => byId.get(id)).filter((r): r is CodeRow => !!r && offerable(r)).slice(0, Math.max(1, Math.min(limit, 15)));
  top.sort((x, y) => (x.grade === y.grade ? 0 : x.grade === 'A' ? -1 : 1));
  const modules = top.map((r) => {
    const a = audit(r);
    return { id: r.id, name: r.package_name, grade: r.grade, use: use(r), audit: a.verdict, ...(a.note ? { only_when: a.note } : {}), needs: (JSON.parse(r.deps ?? '[]') as { alias: string }[]).map((d) => d.alias), licence: r.licence_class };
  });
  return { modules };
}

/** The bundles to insert for one id, dependencies first, each once; refuses anything not offerable. */
export async function insertPlan(env: Env, id: string): Promise<{ bundles: (Bundle & { row: CodeRow })[] } | { error: string }> {
  if (!env.MEDIA) return { error: 'the library store is not configured here' };
  const out: (Bundle & { row: CodeRow })[] = [];
  const seen = new Set<string>();
  const visit = async (want: string, depth: number): Promise<string | null> => {
    if (seen.has(want)) return null;
    if (depth > 8) return `dependency chain too deep at ${want}`;
    seen.add(want);
    const row = await env.CORPUS.prepare(`select ${COLUMNS} from library_items where id = ?`).bind(want).first<CodeRow>();
    if (!row || row.id.split(':')[0] !== 'code') return `no library code module ${want}`;
    if (!offerable(row)) return `${want} is not offered (grade ${row.grade ?? 'none'}, audit ${audit(row).verdict}, standalone ${row.standalone === 1})`;
    const obj = await env.MEDIA!.get(row.bundle_key!);
    if (!obj) return `the bundle of ${want} is missing`;
    const bundle = JSON.parse(await obj.text()) as Bundle;
    for (const d of bundle.deps) {
      if (!d.id) return `${want} needs ${d.alias}, which is not in the library`;
      const why = await visit(d.id, depth + 1);
      if (why) return why;
    }
    out.push({ ...bundle, row });
    return null;
  };
  const why = await visit(id, 0);
  return why ? { error: why } : { bundles: out };
}

/** The name a bundle takes in Packages: its alias where a dependent asked for one, else its own name. Pure. */
export function aliasFor(bundles: Bundle[], id: string, fallback: string): string {
  for (const b of bundles) for (const d of b.deps) if (d.id === id) return d.alias;
  return fallback;
}

/** The notice that travels with the code (MIT and Apache require it). Pure. */
export const header = (b: Bundle) => `-- ${b.name}: ${b.attribution ?? b.source_url}\n-- From the StudPilot Library (${b.licence}, ${b.source_url}); keep this notice with the code.\n`;

export type CodeOp =
  | { op: 'create_instances'; items: { className: 'Folder'; name: string; parent: string }[] }
  | { op: 'edit_script'; path: string; source: string; create: { className: 'ModuleScript' | 'Script' | 'LocalScript'; parent: string } };

/** The Studio ops that build one bundle's tree under a parent path, parents before children; `prefix` (the notice) goes on the root only. Pure. */
export function treeOps(node: TreeNode, parent: string, prefix = ''): CodeOp[] {
  if (!/^[A-Za-z_][A-Za-z0-9_ ]*$/.test(node.name)) throw new Error(`cannot name an instance "${node.name}"`);
  const path = `${parent}.${node.name}`;
  const self: CodeOp = node.className === 'Folder'
    ? { op: 'create_instances', items: [{ className: 'Folder', name: node.name, parent }] }
    : { op: 'edit_script', path, source: prefix + (node.source ?? ''), create: { className: node.className, parent } };
  return [self, ...(node.children ?? []).flatMap((c) => treeOps(c, path))];
}
