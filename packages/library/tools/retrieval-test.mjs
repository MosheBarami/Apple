// Library acceptance L-A6 (master plan §4.6), step 1: run every frozen query through the deployed library search
// (GET /api/admin/library/search, the code the build model uses) and lay the top 5 out for a fresh critic: one board
// row per query with the five thumbnails for visual kinds, a text listing for code, skills and fonts.
//
//   ADMIN_KEY=... API_BASE=https://studpilot.app node packages/library/tools/retrieval-test.mjs \
//     <queries.jsonl> <items-dir> <private-dir> <out-dir>
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const VISUAL = new Set(['prop', 'building', 'character', 'vehicle', 'map', 'icon', 'frame']);

/** The local preview image of a library item, or undefined. Pure apart from the path layout it names. */
export function thumbOf(item, priv) {
  const key = item.id.replace(/:/g, '__');
  if (item.id.startsWith('kenney:')) return join(priv, 'library-thumbs', `${key}.png`);
  if (item.id.startsWith('oga:')) return join(priv, 'library-thumbs', 'oga', `${key}.png`);
  if (item.id.startsWith('gi:')) return join(priv, 'library-src', 'game-icons', item.file);
  if (item.id.startsWith('kenney2d:')) return join(priv, 'library-src', 'kenney-2d', item.file);
  return undefined;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [qFile, itemsDir, priv, out] = process.argv.slice(2);
  const base = process.env.API_BASE, key = process.env.ADMIN_KEY;
  if (!out || !base || !key) { console.error('usage: ADMIN_KEY=.. API_BASE=.. retrieval-test.mjs <queries.jsonl> <items-dir> <private-dir> <out-dir>'); process.exit(2); }
  mkdirSync(out, { recursive: true });
  const items = new Map(readdirSync(itemsDir).filter((f) => f.endsWith('.jsonl')).flatMap((f) => readFileSync(join(itemsDir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))).map((i) => [i.id, i]));
  const queries = readFileSync(qFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const results = [];
  for (const q of queries) {
    // Icons and frames are one shelf to a builder; terrain and scenery pieces are props tagged environment.
    const kind = q.kind === 'icon' || q.kind === 'frame' ? '' : q.kind === 'map' ? 'prop' : q.kind;
    const url = `${base}/api/admin/library/search?q=${encodeURIComponent(q.query)}&limit=5${kind ? `&kind=${kind}` : ''}`;
    const res = await (await fetch(url, { headers: { 'X-Admin-Key': key } })).json();
    results.push({ ...q, cards: res.cards ?? [], error: res.error });
  }
  writeFileSync(join(out, 'results.jsonl'), results.map((r) => JSON.stringify(r)).join('\n') + '\n');
  // Boards: 8 visual queries per board, each a row of its 5 results.
  const { chromium } = await import('playwright-core');
  const b = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  const shell = readdirSync(b).filter((x) => x.startsWith('chromium_headless_shell-')).sort().pop();
  const browser = await chromium.launch({ executablePath: join(b, shell, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell') });
  const page = await browser.newPage({ viewport: { width: 1200, height: 400 } });
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const img = (p) => (p && existsSync(p) ? `data:${p.endsWith('.svg') ? 'image/svg+xml' : 'image/png'};base64,${readFileSync(p).toString('base64')}` : '');
  const visual = results.filter((r) => VISUAL.has(r.kind));
  const boards = [];
  for (let s = 0; s * 8 < visual.length; s++) {
    const chunk = visual.slice(s * 8, (s + 1) * 8);
    const html = chunk.map((r) => `<div class=q><h3>${r.id}${r.multi ? ' (set)' : ''}: ${esc(r.query)}</h3><div class=row>${r.cards.map((c, k) => `<div class=c><b>${k + 1}</b><img src="${img(thumbOf(items.get(c.id) ?? { id: c.id }, priv))}"><i>${esc(c.title)}</i><u>${esc(c.family ?? '')}</u></div>`).join('') || '<em>no results</em>'}</div></div>`).join('');
    await page.setContent(`<style>body{margin:0;background:#e2e8f0;font:11px Arial}.q{padding:4px 8px;border-bottom:2px solid #94a3b8}.q h3{margin:2px 0;font-size:14px;color:#0b1a33}.row{display:flex}.c{position:relative;width:220px;text-align:center}.c img{width:120px;height:120px;object-fit:contain}.c b{position:absolute;left:6px;top:0;color:#c8143c;font-size:14px}.c i,.c u{display:block;font-style:normal;text-decoration:none;color:#334;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.c u{color:#778;font-size:10px}</style><div id=g>${html}</div>`, { waitUntil: 'load' });
    const name = `board-${String(s + 1).padStart(2, '0')}.jpg`;
    await (await page.$('#g')).screenshot({ path: join(out, name), type: 'jpeg', quality: 82 });
    boards.push({ board: name, queries: chunk.map((r) => r.id) });
  }
  await browser.close();
  const text = results.filter((r) => !VISUAL.has(r.kind));
  writeFileSync(join(out, 'text.md'), text.map((r) => `\n=== ${r.id}${r.multi ? ' (set)' : ''} [${r.kind}]: ${r.query}\n${r.cards.map((c, k) => `  ${k + 1}. ${c.title} [${c.grade}] - ${c.line}`).join('\n') || '  (no results)'}`).join('\n') + '\n');
  writeFileSync(join(out, 'boards.json'), JSON.stringify({ boards, text: text.map((r) => r.id) }));
  console.log(`${results.length} queries, ${results.filter((r) => r.error).length} errors, ${results.filter((r) => !r.cards.length).length} empty; ${boards.length} boards, ${text.length} text`);
}
