// node render.mjs <outDir> times=1.2,3.4   |   node render.mjs <outDir> range=<startFrame>:<endFrame>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/home/user/Apple/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.mjs';
import { FPS } from './timeline.js';

const root = path.dirname(new URL(import.meta.url).pathname);
const [outDir, spec] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json' };
const server = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-vsync'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error('[page]', m.text()); });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 900000 });

let frames = [];
if (spec.startsWith('times=')) frames = spec.slice(6).split(',').map((s) => ({ t: +s, name: `t${(+s).toFixed(2)}` }));
else { const [a, b] = spec.slice(6).split(':').map(Number); for (let f = a; f < b; f++) frames.push({ t: f / FPS, name: `f${String(f).padStart(5, '0')}` }); }

const t0 = Date.now();
for (const fr of frames) {
  await page.evaluate((t) => window.seek(t), fr.t);
  await page.screenshot({ path: path.join(outDir, fr.name + '.png'), type: 'png' });
}
console.log(`${frames.length} frames, ${((Date.now() - t0) / frames.length).toFixed(0)} ms/frame`);
await browser.close(); server.close();
