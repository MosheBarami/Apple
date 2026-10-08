// Documentation search over the studpilot-docs D1 index (built by scripts/docs-index).
// Sources: Roblox Creator Docs (CC-BY-4.0 prose, MIT code) and the Luau site (MIT). Every hit carries its URL.
import { buildFtsQueries } from './docs-text.ts';

export type DocSource = 'Roblox Creator Docs' | 'Luau';

export interface DocHit {
  title: string;
  heading: string;
  url: string;
  snippet: string;
  source: DocSource;
  kind: 'guide' | 'api';
}

export interface DocPage {
  url: string;
  title: string;
  source: DocSource;
  text: string;
  truncated: boolean;
  from: 'index' | 'live';
}

export interface DocsFreshness {
  builtAt: string | null;
  robloxCreatorDocsSha: string | null;
  luauSiteSha: string | null;
  chunks: number;
}

const READ_CAP = 12_000;
const LIVE_HOSTS = new Set(['create.roblox.com', 'luau.org']);

interface Row {
  title: string;
  heading: string;
  url: string;
  source: DocSource;
  kind: 'guide' | 'api';
  snip: string;
}

export async function searchDocs(
  db: D1Database,
  query: string,
  opts: { limit?: number; source?: 'roblox' | 'luau' | 'all' } = {},
): Promise<DocHit[]> {
  const q = buildFtsQueries(query);
  if (!q) return [];
  const limit = Math.max(1, Math.min(opts.limit ?? 8, 25));
  const source = opts.source === 'roblox' ? 'Roblox Creator Docs' : opts.source === 'luau' ? 'Luau' : null;
  const exact = query.toLowerCase().replace(/[^a-z0-9_]/g, '');
  const sql = `SELECT c.title AS title, c.heading AS heading, c.url AS url, c.source AS source, c.kind AS kind,
      snippet(docs_fts, 2, '', '', '...', 48) AS snip
    FROM docs_fts JOIN chunks c ON c.id = docs_fts.rowid
    WHERE docs_fts MATCH ?1 AND (?2 IS NULL OR c.source = ?2)
    ORDER BY bm25(docs_fts, 10.0, 6.0, 1.0, 3.0) + CASE WHEN c.heading = 'Overview' THEN -3.0 ELSE 0.0 END
      + CASE WHEN c.heading = 'Overview' AND lower(c.title) = ?4 THEN -10.0
             WHEN c.heading <> 'Overview' AND (lower(c.heading) = ?4 OR lower(c.title || c.heading) = ?4) THEN -6.0 ELSE 0.0 END
    LIMIT ?3`;
  const run = async (match: string): Promise<Row[]> => {
    try {
      const r = await db.prepare(sql).bind(match, source, limit, exact).all<Row>();
      return r.results ?? [];
    } catch {
      return []; // a malformed MATCH must never fail the tool call
    }
  };
  let rows = await run(q.and);
  if (!rows.length && q.or !== q.and) rows = await run(q.or);
  return rows.map((r) => ({
    title: r.title,
    heading: r.heading,
    url: r.url,
    snippet: (r.snip || '').replace(/\s+/g, ' ').trim().slice(0, 320),
    source: r.source,
    kind: r.kind,
  }));
}

function cap(text: string): { text: string; truncated: boolean } {
  return text.length > READ_CAP ? { text: text.slice(0, READ_CAP), truncated: true } : { text, truncated: false };
}

/** Parse and allowlist a docs URL. Null unless https on create.roblox.com/docs or luau.org. */
export function allowedDocUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
  if (!LIVE_HOSTS.has(u.hostname)) return null;
  if (u.hostname === 'create.roblox.com' && !(u.pathname === '/docs' || u.pathname.startsWith('/docs/'))) return null;
  return u;
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|nav|footer|header)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li|pre|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

/** Full stored text of a page or member (capped), or a live fetch for allowlisted hosts not in the index. */
export async function readDoc(db: D1Database, url: string, fetcher: typeof fetch = fetch): Promise<DocPage | null> {
  const u = allowedDocUrl(url);
  if (!u) return null;
  const withFrag = u.hash ? `${u.origin}${u.pathname}${u.hash}` : null;
  const page = `${u.origin}${u.pathname}`.replace(/\/+$/, '');
  const pageAlt = u.hostname === 'luau.org' ? `${page}/` : page;

  interface Chunk { title: string; heading: string; body: string; source: DocSource; url: string }
  let chunks: Chunk[] = [];
  try {
    if (withFrag) {
      chunks = (await db.prepare('SELECT title, heading, body, source, url FROM chunks WHERE url = ?1 ORDER BY seq LIMIT 4').bind(withFrag).all<Chunk>()).results ?? [];
    }
    if (!chunks.length) {
      chunks =
        (
          await db
            .prepare('SELECT title, heading, body, source, url FROM chunks WHERE page_url IN (?1, ?2) ORDER BY seq')
            .bind(page, pageAlt)
            .all<Chunk>()
        ).results ?? [];
    }
  } catch {
    chunks = [];
  }
  if (chunks.length) {
    const text = chunks.map((c) => (c.heading && c.heading !== 'Overview' ? `## ${c.heading}\n\n${c.body}` : c.body)).join('\n\n');
    const c = cap(text);
    return { url: chunks[0].url === withFrag ? withFrag : page, title: chunks[0].title, source: chunks[0].source, ...c, from: 'index' };
  }

  // Not indexed: fetch live from the allowlisted host.
  const target = u.hostname === 'create.roblox.com' ? `${page}.md` : pageAlt;
  try {
    const res = await fetcher(target, { redirect: 'follow', headers: { accept: 'text/markdown, text/html;q=0.8' } });
    if (!res.ok) return null;
    const final = allowedDocUrl(res.url || target); // a redirect may not leave the allowlist
    if (!final) return null;
    const raw = await res.text();
    const isMd = (res.headers.get('content-type') ?? '').includes('markdown');
    const body = isMd ? raw : htmlToText(raw);
    const title = (isMd ? raw.match(/^title:\s*(.+)$/m)?.[1] ?? raw.match(/^name:\s*(.+)$/m)?.[1] : raw.match(/<title>([^<]*)<\/title>/i)?.[1]) ?? page;
    return { url: page, title: title.replace(/^["']|["']$/g, '').trim(), source: u.hostname === 'luau.org' ? 'Luau' : 'Roblox Creator Docs', ...cap(body), from: 'live' };
  } catch {
    return null;
  }
}

export async function docsFreshness(db: D1Database): Promise<DocsFreshness> {
  const rows = (await db.prepare('SELECT key, value FROM meta').all<{ key: string; value: string }>()).results ?? [];
  const m = new Map(rows.map((r) => [r.key, r.value]));
  return {
    builtAt: m.get('built_at') ?? null,
    robloxCreatorDocsSha: m.get('roblox_creator_docs_sha') ?? null,
    luauSiteSha: m.get('luau_site_sha') ?? null,
    chunks: Number(m.get('chunk_count') ?? 0),
  };
}
