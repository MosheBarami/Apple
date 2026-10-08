// Chunkers and SQL writer for the studpilot-docs index. Pure functions; build.mjs does the I/O.
import { apiUrl, guideUrl, headingSlug, identWords, luauUrl } from '../../apps/studio/src/knowledge/docs-text.ts';

export const SRC_ROBLOX = 'Roblox Creator Docs';
export const SRC_LUAU = 'Luau';
const MAX_CHUNK = 3000; // chars per guide chunk
const MAX_MEMBER = 7000; // chars per API member chunk

export const SCHEMA = `
CREATE TABLE chunks (
  id INTEGER PRIMARY KEY,
  page_url TEXT NOT NULL,
  url TEXT NOT NULL,
  source TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  heading TEXT NOT NULL,
  body TEXT NOT NULL,
  ident TEXT NOT NULL,
  seq INTEGER NOT NULL
);
CREATE INDEX chunks_page ON chunks(page_url, seq);
CREATE INDEX chunks_url ON chunks(url);
CREATE VIRTUAL TABLE docs_fts USING fts5(title, heading, body, ident, content='chunks', content_rowid='id', tokenize="porter unicode61 tokenchars '_'");
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

export const DROP = `
DROP TABLE IF EXISTS docs_fts;
DROP TABLE IF EXISTS chunks;
DROP TABLE IF EXISTS meta;
`;

/** Remove Class./Datatype./Enum./Library./Global. prefixes and `A|alias` forms inside inline code. */
export function cleanText(s) {
  return String(s ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/`((?:Class|Datatype|Enum|Library|Global|Service)\.[^`\n]+)`/g, (_, inner) => {
      const alias = inner.split('|');
      const pick = alias.length > 1 ? alias[alias.length - 1] : inner;
      return '`' + pick.replace(/^(?:Class|Datatype|Enum|Library|Global|Service)\./, '') + '`';
    })
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<img[^>]*>/g, '')
    .replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fm: {}, body: md };
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return { fm, body: md.slice(m[0].length) };
}

function splitLong(text, max) {
  if (text.length <= max) return [text];
  const out = [];
  let cur = '';
  for (const para of text.split(/\n\n+/)) {
    if (cur && cur.length + para.length + 2 > max) {
      out.push(cur);
      cur = '';
    }
    if (para.length > max) {
      for (let i = 0; i < para.length; i += max) out.push(para.slice(i, i + max));
    } else cur = cur ? cur + '\n\n' + para : para;
  }
  if (cur) out.push(cur);
  return out;
}

/** Split a markdown page by h2/h3 headings (fence-aware). Returns chunks without ids. */
export function chunkMarkdown({ md, pageUrl, source, defaultTitle }) {
  const { fm, body } = parseFrontmatter(md);
  const title = fm.title || defaultTitle;
  const sections = [];
  let heading = '';
  let buf = [];
  let fence = false;
  const flush = () => {
    const text = cleanText(buf.join('\n'));
    if (text) sections.push({ heading, text });
    buf = [];
  };
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const h = !fence && line.match(/^(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (h) {
      flush();
      heading = h[2].replace(/`/g, '').trim();
      continue;
    }
    buf.push(line);
  }
  flush();
  if (fm.description && !sections.length) sections.push({ heading: '', text: fm.description });
  const out = [];
  let seq = 0;
  for (const s of sections) {
    const parts = splitLong(s.text, MAX_CHUNK);
    for (const text of parts) {
      const head = s.heading;
      const url = head && seq > 0 ? `${pageUrl}#${headingSlug(head)}` : pageUrl;
      const withDesc = seq === 0 && fm.description ? `${fm.description}\n\n${text}` : text;
      out.push({
        page_url: pageUrl,
        url,
        source,
        kind: 'guide',
        title,
        heading: head,
        body: withDesc,
        ident: identWords(title, head, withDesc),
        seq: seq++,
      });
    }
  }
  return out;
}

function typeOf(t) {
  if (t == null || t === '') return 'any';
  return String(t);
}

function paramList(params) {
  return (params ?? [])
    .map((p) => `${p.name}: ${typeOf(p.type)}${p.default !== undefined && p.default !== null && p.default !== '' ? ` = ${p.default}` : ''}`)
    .join(', ');
}

function returnType(returns) {
  const r = returns ?? [];
  if (!r.length) return '';
  const ts = r.map((x) => typeOf(x.type));
  return ts.length === 1 ? `: ${ts[0]}` : `: (${ts.join(', ')})`;
}

function memberText(m, group) {
  let sig;
  if (group === 'properties' || group === 'constants') sig = `${m.name}: ${typeOf(m.type)}`;
  else if (group === 'items') sig = `${m.name} = ${m.value}`;
  else if (group === 'events') sig = `${m.name}(${paramList(m.parameters)}) [event]`;
  else if (group === 'callbacks') sig = `${m.name}(${paramList(m.parameters)})${returnType(m.returns)} [callback]`;
  else sig = `${m.name}(${paramList(m.parameters)})${returnType(m.returns)}`;
  const lines = [sig];
  const summary = cleanText(m.summary);
  const desc = cleanText(m.description);
  if (summary) lines.push(summary);
  if (desc && desc !== summary) lines.push(desc);
  const params = (m.parameters ?? []).filter((p) => p.summary);
  if (params.length) lines.push('Parameters:\n' + params.map((p) => `- ${p.name} (${typeOf(p.type)}): ${cleanText(p.summary).replace(/\n/g, ' ')}`).join('\n'));
  const rets = (m.returns ?? []).filter((r) => r.summary);
  if (rets.length) lines.push('Returns:\n' + rets.map((r) => `- ${typeOf(r.type)}: ${cleanText(r.summary).replace(/\n/g, ' ')}`).join('\n'));
  const meta = [];
  if (m.tags?.length) meta.push(`Tags: ${m.tags.join(', ')}`);
  if (m.deprecation_message) meta.push(`Deprecated: ${cleanText(m.deprecation_message)}`);
  if (m.security && m.security !== 'None') meta.push(`Security: ${typeof m.security === 'string' ? m.security : JSON.stringify(m.security)}`);
  if (m.thread_safety) meta.push(`Thread safety: ${m.thread_safety}`);
  if (meta.length) lines.push(meta.join('. '));
  return lines.join('\n\n').slice(0, MAX_MEMBER);
}

const MEMBER_GROUPS = ['constructors', 'properties', 'constants', 'methods', 'functions', 'events', 'callbacks', 'math_operations', 'items'];

/** One overview chunk plus one chunk per member for a reference YAML object. */
export function chunkApi(obj, kind) {
  const name = obj.name;
  const page = apiUrl(kind, name);
  const out = [];
  let seq = 0;
  const memberNames = [];
  for (const g of MEMBER_GROUPS) for (const m of obj[g] ?? []) if (m?.name) memberNames.push(m.name.split(/[.:]/).pop());
  const label = { classes: 'Class', datatypes: 'Datatype', enums: 'Enum', globals: 'Globals', libraries: 'Library' }[kind];
  const ov = [`${label} ${name}`];
  if (obj.inherits?.length) ov.push(`Inherits: ${obj.inherits.join(' > ')}`);
  const summary = cleanText(obj.summary);
  const desc = cleanText(obj.description);
  if (summary) ov.push(summary);
  if (desc && desc !== summary) ov.push(desc);
  if (obj.tags?.length) ov.push(`Tags: ${obj.tags.join(', ')}`);
  if (obj.deprecation_message) ov.push(`Deprecated: ${cleanText(obj.deprecation_message)}`);
  if (memberNames.length) ov.push(`Members: ${memberNames.join(', ')}`.slice(0, 2500));
  const ovBody = ov.join('\n\n');
  for (const part of splitLong(ovBody, 4000)) {
    out.push({ page_url: page, url: page, source: SRC_ROBLOX, kind: 'api', title: name, heading: 'Overview', body: part, ident: identWords(name, '', part), seq: seq++ });
  }
  for (const g of MEMBER_GROUPS) {
    for (const m of obj[g] ?? []) {
      if (!m?.name) continue;
      const short = m.name.split(/[.:]/).pop();
      const body = memberText(m, g);
      out.push({
        page_url: page,
        url: apiUrl(kind, name, m.name),
        source: SRC_ROBLOX,
        kind: 'api',
        title: name,
        heading: short,
        body,
        ident: identWords(name, short, ''),
        seq: seq++,
      });
    }
  }
  return out;
}

export function luauChunks(relPath, md) {
  const { fm } = parseFrontmatter(md);
  const pageUrl = luauUrl(relPath, fm.slug);
  const base = relPath.split('/').pop().replace(/\.mdx?$/, '');
  return chunkMarkdown({ md, pageUrl, source: SRC_LUAU, defaultTitle: base });
}

export function guideChunks(relPath, md) {
  const base = relPath.split('/').pop().replace(/\.mdx?$/, '');
  return chunkMarkdown({ md, pageUrl: guideUrl(relPath), source: SRC_ROBLOX, defaultTitle: base });
}

const q = (v) => (typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");

/** SQL statements (one per entry): drop+schema, chunk inserts, FTS fill ranges, meta. Batched by size. */
export function buildSqlBatches(chunks, meta, maxBytes = 1_500_000) {
  const batches = [];
  let cur = [];
  let size = 0;
  const push = (stmt) => {
    if (size + stmt.length > maxBytes && cur.length) {
      batches.push(cur.join('\n'));
      cur = [];
      size = 0;
    }
    cur.push(stmt);
    size += stmt.length + 1;
  };
  const first = [];
  for (const s of (DROP + SCHEMA).split(';\n')) if (s.trim()) first.push(s.trim() + ';');
  // Schema goes in batch 0 on its own.
  batches.push(first.join('\n'));
  let id = 0;
  for (const c of chunks) {
    id++;
    push(
      `INSERT INTO chunks(id,page_url,url,source,kind,title,heading,body,ident,seq) VALUES(${id},${q(c.page_url)},${q(c.url)},${q(c.source)},${q(c.kind)},${q(c.title)},${q(c.heading)},${q(c.body)},${q(c.ident)},${c.seq});`,
    );
  }
  for (let a = 1; a <= id; a += 300) {
    push(`INSERT INTO docs_fts(rowid,title,heading,body,ident) SELECT id,title,heading,body,ident FROM chunks WHERE id BETWEEN ${a} AND ${Math.min(id, a + 299)};`);
  }
  if (cur.length) batches.push(cur.join('\n'));
  const metaRows = Object.entries(meta).map(([k, v]) => `INSERT INTO meta(key,value) VALUES(${q(k)},${q(v)});`);
  batches.push(metaRows.join('\n'));
  return batches;
}
