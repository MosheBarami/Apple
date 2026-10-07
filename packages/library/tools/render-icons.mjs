// Renders the kit icon family (packages/blocks/assets/icons.json, UI spec v2 section 6) from its human-made sources:
// kenney-3d entries are Kenney CC0 GLB models drawn by one fixed camera, light and navy contour at 512 px; kenney-glyphs
// entries are Kenney Game Icons (CC0) white symbols given the same contour at 256 px. Nothing is drawn by hand or by AI.
// The Kenney kit zips are not in git: unzip them under $STUDPILOT_KENNEY_DIR (default private/library-src/kenney), one
// folder per kit, and the tool checks each zip against kit_zip_sha256.
//
//   node packages/library/tools/render-icons.mjs <out-dir> [--install]   (--install: copy into Studio's dev folder)
//
// It prints each PNG's sha256 next to the pinned png_sha256; a different GPU can shift pixels, so a mismatch is reported,
// not fatal. Needs a Chromium: $CHROMIUM_PATH, else Playwright's cached headless shell.
import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const LIB = join(ROOT, 'packages', 'library');
const KENNEY = process.env.STUDPILOT_KENNEY_DIR ?? join(ROOT, 'private', 'library-src', 'kenney');
const STUDIO_DEV = '/Applications/RobloxStudio.app/Contents/Resources/content/textures/studpilot';
const [out, ...flags] = process.argv.slice(2);
if (!out) { console.error('usage: render-icons.mjs <out-dir> [--install]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const family = JSON.parse(readFileSync(join(ROOT, 'packages', 'blocks', 'assets', 'icons.json'), 'utf8')).icons;
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

for (const kit of new Set(family.filter((i) => i.family === 'kenney-3d').map((i) => i.source_url.split('/').pop()))) {
  const zip = join(KENNEY, `${kit}.zip`);
  const want = family.find((i) => i.source_url.endsWith(`/${kit}`)).kit_zip_sha256;
  if (!existsSync(zip) || sha(readFileSync(zip)) !== want) { console.error(`${zip}: missing or not the pinned zip (${want.slice(0, 8)})`); process.exit(1); }
}

const page = `<!doctype html><html><body style="margin:0;background:transparent">
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const CONTOUR = '#0B1A33';
const canvas = (n) => { const c = document.createElement('canvas'); c.width = c.height = n; return c; };
// Crop to the alpha box, centre it in an n-px square with room for the line, and put a navy contour behind it.
function outline(src, n, line) {
  const d = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
  let x0 = src.width, y0 = src.height, x1 = 0, y1 = 0;
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) if (d[(y * src.width + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, s = (n - 2 * (line + n * 0.028)) / Math.max(w, h);
  const fit = canvas(n), f = fit.getContext('2d'); f.imageSmoothingQuality = 'high';
  f.drawImage(src, x0, y0, w, h, (n - w * s) / 2, (n - h * s) / 2, w * s, h * s);
  const sil = canvas(n), g = sil.getContext('2d');
  for (let a = 0; a < 48; a++) { const t = a / 48 * Math.PI * 2; for (const r of [line * 0.5, line]) g.drawImage(fit, Math.cos(t) * r, Math.sin(t) * r); }
  g.globalCompositeOperation = 'source-in'; g.fillStyle = CONTOUR; g.fillRect(0, 0, n, n);
  const o = canvas(n), c = o.getContext('2d'); c.drawImage(sil, 0, 0); c.drawImage(fit, 0, 0);
  return o.toDataURL('image/png');
}
const N = 512;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(N, N); renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
// A saturation lift after lighting, so the family reads as glossy toy plastic rather than matte clay (critic v3 round 2).
function saturate(c, k) {
  const x = c.getContext('2d'), im = x.getImageData(0, 0, c.width, c.height), d = im.data;
  for (let i = 0; i < d.length; i += 4) { const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; for (let j = 0; j < 3; j++) d[i + j] = Math.max(0, Math.min(255, l + (d[i + j] - l) * k)); }
  x.putImageData(im, 0, 0);
  return c;
}
window.model = async (url, roll = 0, tint = '') => {
  const scene = new THREE.Scene(); scene.environment = env; scene.environmentIntensity = 0.6;
  const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(3, 5, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfe4ff, 1.4); rim.position.set(-4, 2, -3); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6677aa, 0.35));
  const m = (await new GLTFLoader().loadAsync(url)).scene;
  m.traverse((o) => { if (!o.isMesh) return; if (tint) { o.material = o.material.clone(); o.material.map = null; o.material.color = new THREE.Color(tint); } o.material.roughness = 0.22; o.material.metalness = Math.min(o.material.metalness ?? 0, 0.2); });
  m.rotation.y = -Math.PI / 6;
  m.position.sub(new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()));
  const pivot = new THREE.Group(); pivot.add(m); pivot.rotation.x = 0.32; pivot.rotation.z = THREE.MathUtils.degToRad(roll); scene.add(pivot);
  const r = new THREE.Box3().setFromObject(pivot).getBoundingSphere(new THREE.Sphere()).radius;
  const cam = new THREE.PerspectiveCamera(22, 1, 0.01, 1000);
  cam.position.set(0, 0, r / Math.sin(THREE.MathUtils.degToRad(11)) * 1.14); cam.lookAt(0, 0, 0);
  renderer.setClearColor(0x000000, 0); renderer.render(scene, cam);
  const src = canvas(N); src.getContext('2d').drawImage(renderer.domElement, 0, 0);
  return outline(saturate(src, 1.3), N, 20);
};
window.glyph = async (url) => {
  const img = new Image(); img.src = url; await img.decode();
  const src = canvas(img.width * 3); const c = src.getContext('2d'); c.imageSmoothingQuality = 'high';
  c.drawImage(img, 0, 0, src.width, src.height);
  return outline(src, 256, 12);
};
window.ready = true;
</script></body></html>`;

const THREE_DIR = dirname(dirname(fileURLToPath(import.meta.resolve('three'))));
const TYPES = { '.js': 'text/javascript', '.png': 'image/png', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') { res.setHeader('content-type', 'text/html'); return res.end(page); }
  const file = u.startsWith('/three/') ? join(THREE_DIR, u.slice(7)) : u.startsWith('/kenney/') ? join(KENNEY, u.slice(8)) : u.startsWith('/repo/') ? join(ROOT, u.slice(6)) : '';
  if (!file || !existsSync(file)) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream');
  res.end(readFileSync(file));
}).listen(0, '127.0.0.1');

const shell = () => {
  const base = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  const dir = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort().pop() : undefined;
  return dir ? join(base, dir, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell') : undefined;
};
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? shell(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let drift = 0;
try {
  const tab = await browser.newPage();
  tab.on('pageerror', (e) => console.error('page:', e.message));
  await tab.goto(`http://127.0.0.1:${server.address().port}/`);
  await tab.waitForFunction(() => window.ready);
  for (const icon of family) {
    const data = icon.family === 'kenney-3d'
      ? await tab.evaluate((a) => window.model(a.url, a.roll, a.tint), { url: `/kenney/${icon.source_url.split('/').pop()}/${icon.model}`, roll: icon.render?.roll ?? 0, tint: icon.render?.tint ?? '' })
      : await tab.evaluate((url) => window.glyph(url), `/repo/${icon.file}`);
    const png = Buffer.from(data.split(',')[1], 'base64');
    writeFileSync(join(out, `${icon.name}.png`), png);
    if (flags.includes('--install')) { mkdirSync(STUDIO_DEV, { recursive: true }); copyFileSync(join(out, `${icon.name}.png`), join(STUDIO_DEV, `${icon.name}.png`)); }
    const same = sha(png) === icon.png_sha256;
    if (!same) drift += 1;
    console.log(`${same ? 'same ' : 'DRIFT'} ${icon.name} ${sha(png).slice(0, 12)}`);
  }
} finally { await browser.close(); server.close(); }
console.log(`${family.length} icons, ${drift} differ from the pinned png_sha256`);
