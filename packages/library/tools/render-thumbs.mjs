// Library thumbnails (master plan §4.1 L7 previews, and what L5's two critics grade from): each item's own model drawn
// by one fixed three-quarter camera and studio light at 256 px on transparency, true colours, with a thin navy contour
// so the silhouette reads on any board. Nothing is painted or generated; the picture is the item.
//
//   node packages/library/tools/render-thumbs.mjs <items.jsonl> <packs-dir> <out-dir> [--only <family>] [--limit N]
//
// Writes <out-dir>/<id with ':' as '__'>.png and skips files that already exist, so a long run can be resumed.
// Needs a Chromium: $CHROMIUM_PATH, else Playwright's cached headless shell.
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const [itemsFile, packsDir, outDir] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!itemsFile || !packsDir || !outDir) { console.error('usage: render-thumbs.mjs <items.jsonl> <packs-dir> <out-dir> [--only <family>] [--limit N]'); process.exit(2); }
mkdirSync(outDir, { recursive: true });
let items = readFileSync(itemsFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((i) => i.file?.toLowerCase().endsWith('.glb'));
if (flag('only')) items = items.filter((i) => i.family === flag('only'));
if (flag('limit')) items = items.slice(0, Number(flag('limit')));
export const thumbName = (id) => `${id.replace(/:/g, '__')}.png`;
const todo = items.filter((i) => !existsSync(join(outDir, thumbName(i.id))));

const page = `<!doctype html><html><body style="margin:0;background:transparent">
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const N = 256, LINE = 4, CONTOUR = '#0B1A33';
const canvas = (n) => { const c = document.createElement('canvas'); c.width = c.height = n; return c; };
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(N * 2, N * 2); renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
window.thumb = async (url) => {
  const scene = new THREE.Scene(); scene.environment = env; scene.environmentIntensity = 0.5;
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(3, 5, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfe4ff, 1.2); rim.position.set(-4, 2, -3); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6677aa, 0.4));
  const m = (await new GLTFLoader().loadAsync(url)).scene;
  m.rotation.y = -Math.PI / 6;
  m.position.sub(new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()));
  const pivot = new THREE.Group(); pivot.add(m); pivot.rotation.x = 0.3; scene.add(pivot);
  const r = new THREE.Box3().setFromObject(pivot).getBoundingSphere(new THREE.Sphere()).radius || 1;
  const cam = new THREE.PerspectiveCamera(22, 1, r / 100, r * 100);
  cam.position.set(0, 0, r / Math.sin(THREE.MathUtils.degToRad(11)) * 1.1); cam.lookAt(0, 0, 0);
  renderer.setClearColor(0x000000, 0); renderer.render(scene, cam);
  // Crop to the drawn pixels and fill the square, so a long thin item is as readable as a round one.
  const src = canvas(N * 2); src.getContext('2d').drawImage(renderer.domElement, 0, 0);
  const d = src.getContext('2d').getImageData(0, 0, N * 2, N * 2).data;
  let x0 = N * 2, y0 = N * 2, x1 = 0, y1 = 0;
  for (let y = 0; y < N * 2; y++) for (let x = 0; x < N * 2; x++) if (d[(y * N * 2 + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const w = Math.max(1, x1 - x0 + 1), h = Math.max(1, y1 - y0 + 1), s = (N - 2 * (LINE + 6)) / Math.max(w, h);
  const fit = canvas(N), f = fit.getContext('2d'); f.imageSmoothingQuality = 'high';
  f.drawImage(src, x0, y0, w, h, (N - w * s) / 2, (N - h * s) / 2, w * s, h * s);
  const sil = canvas(N), g = sil.getContext('2d');
  for (let a = 0; a < 24; a++) { const t = a / 24 * Math.PI * 2; g.drawImage(fit, Math.cos(t) * LINE, Math.sin(t) * LINE); }
  g.globalCompositeOperation = 'source-in'; g.fillStyle = CONTOUR; g.fillRect(0, 0, N, N);
  const o = canvas(N), c = o.getContext('2d'); c.drawImage(sil, 0, 0); c.drawImage(fit, 0, 0);
  m.traverse((x) => { if (x.isMesh) { x.geometry.dispose(); [].concat(x.material).forEach((mat) => { mat.map?.dispose(); mat.dispose(); }); } });
  return o.toDataURL('image/png');
};
window.ready = true;
</script></body></html>`;

const THREE_DIR = dirname(dirname(fileURLToPath(import.meta.resolve('three'))));
const PACKS = resolve(packsDir);
const TYPES = { '.js': 'text/javascript', '.png': 'image/png', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') { res.setHeader('content-type', 'text/html'); return res.end(page); }
  const file = u.startsWith('/three/') ? join(THREE_DIR, u.slice(7)) : u.startsWith('/packs/') ? join(PACKS, u.slice(7)) : '';
  if (!file || !file.startsWith(file.startsWith(THREE_DIR) ? THREE_DIR : PACKS) || !existsSync(file)) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
  res.end(readFileSync(file));
}).listen(0, '127.0.0.1');

const shell = () => {
  const base = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  const dir = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort().pop() : undefined;
  return dir ? join(base, dir, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell') : undefined;
};
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? shell(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let done = 0, failed = 0;
try {
  let tab;
  const open = async () => { tab = await browser.newPage(); await tab.goto(`http://127.0.0.1:${server.address().port}/`); await tab.waitForFunction(() => window.ready); };
  await open();
  for (const it of todo) {
    try {
      const data = await tab.evaluate((u) => window.thumb(u), `/packs/${it.file}`);
      writeFileSync(join(outDir, thumbName(it.id)), Buffer.from(data.split(',')[1], 'base64'));
      done += 1;
    } catch (e) {
      failed += 1;
      console.error(`fail ${it.id}: ${String(e.message).slice(0, 120)}`);
      await tab.close().catch(() => {}); await open();
    }
    if (done % 200 === 0 && done) { console.log(`${done}/${todo.length}`); await tab.close(); await open(); }
  }
} finally { await browser.close(); server.close(); }
console.log(`${done} rendered, ${failed} failed, ${items.length - todo.length} already there -> ${outDir}`);
