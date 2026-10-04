// Embeds the corpus chunks D1 holds with embedded = 0, through the worker's own /api/admin/embed-batch.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
for (const line of readFileSync('/Users/moshe/Developer/RbxAI/.env', 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const W = '/Users/moshe/Developer/RbxAI-ci/apps/worker';
const d1 = (sql) => JSON.parse(execFileSync(`${W}/node_modules/.bin/wrangler`, ['d1', 'execute', 'golem-corpus', '--remote', '--json', '--config', 'wrangler.apple.jsonc', '--command', sql], { cwd: W, encoding: 'utf8', maxBuffer: 256 << 20 }))[0].results;
let done = 0;
for (;;) {
  const rows = d1(`select vec_id, doc_slug, title, url, kind, text, content_hash from chunks where embedded = 0 order by rowid limit 180`);
  if (!rows.length) break;
  for (let i = 0; i < rows.length; i += 60) {
    const chunks = rows.slice(i, i + 60).map((r) => ({ vecId: r.vec_id, docSlug: r.doc_slug, title: r.title ?? '', url: r.url ?? '', kind: r.kind ?? 'doc', text: r.text ?? '', ...(r.content_hash ? { contentHash: r.content_hash } : {}) }));
    const res = await fetch('https://apple.moshe-barami111.workers.dev/api/admin/embed-batch', { method: 'POST', headers: { 'X-Admin-Key': process.env.GOLEM_ADMIN_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ chunks }) });
    if (!res.ok) { console.log('batch failed', res.status, (await res.text()).slice(0, 200)); process.exit(1); }
    done += chunks.length;
  }
  console.log('embedded', done);
}
console.log('backfill complete', done);
