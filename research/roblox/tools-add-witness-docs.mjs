// usage: node add-witness-docs.mjs <url> ...  — adds every corpus row of those pages (from live D1, which mirrors
// chunks.jsonl) to packages/corpus/data/chunks-witness.json in the research-feed worktree, and prints
// key -> official(docSlug, firstVecId, title, url) lines.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const W = '/Users/moshe/Developer/RbxAI-ci/apps/worker';
const WIT = '/Users/moshe/Developer/RbxAI-feed/packages/corpus/data/chunks-witness.json';
const urls = process.argv.slice(2);
const q = (sql) => JSON.parse(execFileSync(`${W}/node_modules/.bin/wrangler`, ['d1', 'execute', 'golem-corpus', '--remote', '--json', '--config', 'wrangler.apple.jsonc', '--command', sql], { cwd: W, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;
const rows = q(`select rowid, vec_id, doc_slug, title, url, kind from chunks where url in (${urls.map((u) => `'${u.replace(/'/g, "''")}'`).join(',')}) order by rowid`);
const w = JSON.parse(readFileSync(WIT, 'utf8'));
const bySlug = new Map();
for (const r of rows) { const a = bySlug.get(r.doc_slug) ?? []; a.push(r); bySlug.set(r.doc_slug, a); }
const num = (v) => Number(v.match(/-(\d+)$/)?.[1] ?? 0);
for (const [slug, rs] of bySlug) {
  rs.sort((a, b) => num(a.vec_id) - num(b.vec_id));
  w.documents[slug] = rs.map((r) => ({ vecId: r.vec_id, title: r.title, url: r.url, kind: r.kind }));
  console.log(`'${slug}', '${rs[0].vec_id}', ${JSON.stringify(rs[0].title.split(' — ')[0])}, '${rs[0].url}'`);
}
w.documents = Object.fromEntries(Object.entries(w.documents).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
writeFileSync(WIT, `${JSON.stringify(w, null, 2)}\n`);
for (const u of urls) if (![...bySlug.values()].some((rs) => rs[0].url === u)) console.log('MISSING', u);
