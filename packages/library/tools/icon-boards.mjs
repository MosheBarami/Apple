// L5 grading boards for image icons (SVG or PNG): per family, numbered 10 x 10 boards of the icons as they are, each
// with its name under it, and an index of number -> item id (the same index.json shape as the 3D boards).
//
//   node packages/library/tools/icon-boards.mjs <items.jsonl> <root-dir> <out-dir>
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { chromium } from 'playwright-core';

const [itemsFile, rootDir, outDir] = process.argv.slice(2);
if (!itemsFile || !rootDir || !outDir) { console.error('usage: icon-boards.mjs <items.jsonl> <root-dir> <out-dir>'); process.exit(2); }
const PER = 100, COLS = 10, CELL = 128;
const items = readFileSync(itemsFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const families = new Map();
for (const it of items) families.set(it.family, [...(families.get(it.family) ?? []), it]);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const ROOT = resolve(rootDir);
const server = http.createServer((req, res) => {
  const file = resolve(join(ROOT, decodeURIComponent(req.url.split('?')[0])));
  if (!file.startsWith(ROOT) || !existsSync(file)) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', extname(file) === '.svg' ? 'image/svg+xml' : 'image/png');
  res.end(readFileSync(file));
}).listen(0, '127.0.0.1');
const b = join(homedir(), 'Library', 'Caches', 'ms-playwright');
const shell = existsSync(b) ? readdirSync(b).filter((x) => x.startsWith('chromium_headless_shell-')).sort().pop() : undefined;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? (shell && join(b, shell, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell')) });
const page = await browser.newPage({ viewport: { width: COLS * CELL, height: 400 } });
mkdirSync(outDir, { recursive: true });
const index = [];
for (const [family, its] of [...families].sort()) {
  its.sort((x, y) => x.id.localeCompare(y.id));
  for (let s = 0; s * PER < its.length; s++) {
    const chunk = its.slice(s * PER, (s + 1) * PER);
    const cells = chunk.map((it, k) => `<div class=c><b>${k + 1}</b><img src="http://127.0.0.1:${server.address().port}/${it.file.split('/').map(encodeURIComponent).join('/')}"><i>${esc(it.title.replace(/ icon$/, ''))}</i></div>`).join('');
    await page.setContent(`<style>body{margin:0;background:#e2e8f0;font:11px Arial}#g{display:grid;grid-template-columns:repeat(${COLS},${CELL}px)}.c{position:relative;height:${CELL + 14}px;text-align:center}.c img{width:88px;height:88px;margin-top:16px;object-fit:contain}.c b{position:absolute;left:4px;top:2px;color:#c8143c;font-size:14px}.c i{display:block;font-style:normal;color:#334;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding:0 4px}</style><div id=g>${cells}</div>`, { waitUntil: 'networkidle' });
    const name = `${family.replace(/:/g, '__')}--${s + 1}`;
    await (await page.$('#g')).screenshot({ path: join(outDir, `${name}.jpg`), type: 'jpeg', quality: 85 });
    index.push({ sheet: `${name}.jpg`, family, items: chunk.map((it, k) => ({ n: k + 1, id: it.id, title: it.title })) });
  }
}
await browser.close(); server.close();
writeFileSync(join(outDir, 'index.json'), JSON.stringify(index));
console.log(`${index.length} boards, ${items.length} icons -> ${outDir}`);
