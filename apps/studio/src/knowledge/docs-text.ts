// Pure text helpers shared by the docs index build (scripts/docs-index) and the runtime search (docs.ts).
// Erasable TypeScript only, so Node can import this file directly.

export const ROBLOX_DOCS_ORIGIN = 'https://create.roblox.com/docs';
export const LUAU_ORIGIN = 'https://luau.org';

/** "GetPlayerByUserId" -> "Get Player By User Id", "UIListLayout" -> "UI List Layout", "a_b" -> "a b". */
export function camelSplit(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when a token mixes case inside the word (an identifier such as GetPlayerByUserId). */
export function isCamelIdentifier(tok: string): boolean {
  return /[a-z0-9][A-Z]/.test(tok) || /[A-Z]{2,}[a-z]/.test(tok);
}

/** Extra search words stored with a chunk: split identifiers from its title, heading and body. */
export function identWords(title: string, heading: string, body: string): string {
  const out = new Set<string>();
  const add = (s: string) => {
    const split = camelSplit(s);
    if (split && split.toLowerCase() !== s.toLowerCase()) out.add(split);
  };
  for (const part of [title, heading]) for (const t of part.match(/[A-Za-z0-9_]+/g) ?? []) if (isCamelIdentifier(t)) add(t);
  const seen = new Set<string>();
  for (const t of body.match(/\b[A-Za-z][A-Za-z0-9]*[a-z0-9][A-Z][A-Za-z0-9]*\b/g) ?? []) {
    if (seen.size >= 40) break;
    if (!seen.has(t)) {
      seen.add(t);
      add(t);
    }
  }
  return [...out].join(' ');
}

/** content/en-us/<path>.md -> https://create.roblox.com/docs/<path> (trailing /index dropped). */
export function guideUrl(relPath: string): string {
  let p = relPath.replace(/\\/g, '/').replace(/^content\/en-us\//, '').replace(/^\/+/, '').replace(/\.mdx?$/, '');
  p = p.replace(/(^|\/)index$/, '');
  return p ? `${ROBLOX_DOCS_ORIGIN}/${p}` : ROBLOX_DOCS_ORIGIN;
}

export type ApiKind = 'classes' | 'datatypes' | 'enums' | 'globals' | 'libraries';

/** Reference page URL, with a #Member anchor (the part after the last '.' or ':' of the member name). */
export function apiUrl(kind: ApiKind, name: string, member?: string): string {
  const base = `${ROBLOX_DOCS_ORIGIN}/reference/engine/${kind}/${name}`;
  if (!member) return base;
  const anchor = member.split(/[.:]/).pop() || member;
  return `${base}#${anchor}`;
}

/** luau-lang/site src/content/docs/<path>.md[x] -> https://luau.org/<slug or path>/ */
export function luauUrl(relPath: string, slug?: string): string {
  const p =
    (slug && slug.trim()) ||
    relPath.replace(/\\/g, '/').replace(/^src\/content\/docs\//, '').replace(/\.mdx?$/, '').replace(/(^|\/)index$/, '');
  const clean = p.replace(/^\/+|\/+$/g, '');
  return clean ? `${LUAU_ORIGIN}/${clean}/` : `${LUAU_ORIGIN}/`;
}

/** URL slug for a heading, the way the docs sites anchor them. */
export function headingSlug(h: string): string {
  return h.toLowerCase().replace(/`/g, '').replace(/[^a-z0-9\s_-]/g, '').trim().replace(/\s+/g, '-');
}

const STOP = new Set(['a', 'an', 'the', 'how', 'to', 'do', 'i', 'in', 'of', 'for', 'and', 'or', 'is', 'are', 'what', 'with', 'on', 'my', 'can', 'use', 'using', 'it', 'be']);

function terms(query: string): string[] {
  const all = query.match(/[A-Za-z0-9_]+/g) ?? [];
  const kept = all.filter((t) => !STOP.has(t.toLowerCase()) || isCamelIdentifier(t));
  return (kept.length ? kept : all).slice(0, 12);
}

function termExpr(tok: string): string {
  const q = `"${tok}"`;
  if (!isCamelIdentifier(tok)) return q;
  return `(${q} OR ident:"${camelSplit(tok).toLowerCase()}")`;
}

/** FTS5 MATCH strings for a free-text query: strict AND first, OR fallback. Null when nothing searchable. */
export function buildFtsQueries(query: string): { and: string; or: string } | null {
  const ts = terms(query);
  if (!ts.length) return null;
  const exprs = ts.map(termExpr);
  return { and: exprs.join(' AND '), or: exprs.join(' OR ') };
}
