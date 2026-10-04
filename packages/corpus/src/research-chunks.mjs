// StudPilot's own research notes (packages/corpus/research/NN-topic.md) as corpus chunks, so search_docs reaches them.
// Each note is an original synthesis written for StudPilot, with a numbered source list; every chunk keeps its [S#]
// citations and points its url at the first source it cites. See PROVENANCE.md, "Source 3".
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'research');
const MAX = 2400;

const sha8 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 8);

/** [S3] -> url, from the note's "## Sources" list. */
export function sourcesOf(md) {
  const at = md.search(/^## Sources\s*$/m);
  const out = new Map();
  if (at < 0) return out;
  for (const m of md.slice(at).matchAll(/^\s*[-*]?\s*\[S(\d+)\][^\n]*?(https?:\/\/[^\s)>\]]+)/gm)) out.set(Number(m[1]), m[2].replace(/[.,;]+$/, ''));
  return out;
}

/** Split a block that is too long on paragraph boundaries. */
function pieces(text) {
  if (text.length <= MAX) return [text];
  const out = [];
  let cur = '';
  for (const para of text.split(/\n{2,}/)) {
    if (cur && cur.length + para.length + 2 > MAX) { out.push(cur); cur = ''; }
    cur = cur ? `${cur}\n\n${para}` : para;
    while (cur.length > MAX) { out.push(cur.slice(0, MAX)); cur = cur.slice(MAX); }
  }
  if (cur.trim()) out.push(cur);
  return out;
}

export function noteChunks(file, md) {
  const base = path.basename(file, '.md');
  const topic = (md.match(/^# (.+)$/m)?.[1] ?? base).trim();
  const sources = sourcesOf(md);
  const firstUrl = sources.values().next().value;
  const body = md.slice(0, md.search(/^## Sources\s*$/m) >= 0 ? md.search(/^## Sources\s*$/m) : md.length);
  const chunks = [];
  let h2 = '';
  for (const section of body.split(/^(?=#{2,3} )/m)) {
    const head = section.match(/^(#{2,3}) (.+)$/m);
    if (!head) continue;
    if (head[1] === '##') h2 = head[2].trim();
    const title = head[1] === '##' ? `${topic} — ${h2}` : `${topic} — ${h2} — ${head[2].trim()}`;
    const text = section.replace(/^#{2,3} .+\n/, '').trim();
    if (text.length < 80) continue;
    pieces(text).forEach((part, i) => {
      const cited = [...part.matchAll(/\[S(\d+)\]/g)].map((m) => sources.get(Number(m[1]))).find(Boolean);
      const url = cited ?? firstUrl;
      if (!url) return;
      chunks.push({
        // Vectorize ids are capped at 64 bytes: the note number and a content hash, nothing longer.
        vecId: `research-${base.slice(0, 2)}-${sha8(title + i + part)}${sha8(part + i)}`,
        docSlug: `research-${base}`,
        title: i ? `${title} (${i + 1})` : title,
        url,
        kind: 'research',
        text: part,
        embed: true,
      });
    });
  }
  return chunks;
}

export function researchChunks(dir = DIR) {
  let files = [];
  try { files = readdirSync(dir).filter((f) => /^\d\d-.+\.md$/.test(f)).sort(); } catch { return []; }
  return files.flatMap((f) => noteChunks(f, readFileSync(path.join(dir, f), 'utf8')));
}
