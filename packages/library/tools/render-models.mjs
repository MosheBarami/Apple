// Thumbnails and L5 facts for model files in any format three.js reads (GLB, glTF, FBX, OBJ with its MTL, Collada):
// one fixed three-quarter camera and studio light at 256 px with a thin navy contour (as render-thumbs.mjs), and the
// triangle count, mesh count and bounding size measured from the loaded geometry. Nothing is painted or generated.
//
//   node packages/library/tools/render-models.mjs <list.json> <root-dir> <out-dir>
//
// <list.json> is [{ key, file }] with file relative to <root-dir>. Writes <out-dir>/<key>.png and appends one line per
// model to <out-dir>/stats.jsonl ({ key, ok, triangles, meshes, size, missing } or { key, ok: false, error }); `missing`
// counts the files the model names (textures, MTL) that were not found, so its thumbnail is not faithful. Resumable.
import http from 'node:http';
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { chromium } from 'playwright-core';

const [listFile, rootDir, outDir] = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1]}` && (!listFile || !rootDir || !outDir)) { console.error('usage: render-models.mjs <list.json> <root-dir> <out-dir>'); process.exit(2); }

const page = `<!doctype html><html><body style="margin:0;background:transparent">
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';
THREE.DefaultLoadingManager.addHandler(/\\.tga$/i, new TGALoader()); // FBX and MTL often name .tga textures
const N = 256, LINE = 4, CONTOUR = '#0B1A33';
const canvas = (n) => { const c = document.createElement('canvas'); c.width = c.height = n; return c; };
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(N * 2, N * 2); renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
async function load(url) {
  const ext = url.split('.').pop().toLowerCase();
  if (ext === 'glb' || ext === 'gltf') return (await new GLTFLoader().loadAsync(url)).scene;
  if (ext === 'fbx') return await new FBXLoader().loadAsync(url);
  if (ext === 'dae') return (await new ColladaLoader().loadAsync(url)).scene;
  if (ext === 'obj') {
    const loader = new OBJLoader();
    // The materials file is the one the OBJ names (often one shared by a whole pack); none named, none loaded.
    const text = await (await fetch(url)).text();
    const lib = (text.match(/^mtllib\\s+(.+?)\\s*$/m) ?? [])[1];
    if (lib) { try { const mtl = await new MTLLoader().loadAsync(url.slice(0, url.lastIndexOf('/') + 1) + encodeURIComponent(lib)); mtl.preload(); loader.setMaterials(mtl); } catch {} }
    return loader.parse(text);
  }
  throw new Error('unsupported format ' + ext);
}
// FBX, OBJ and Collada carry Phong/Lambert colours that Blender writes as linear values and the loaders read as sRGB
// (so they come out about twice as dark). Read them as linear, and draw them with the same standard material as glTF.
const standard = (mat) => {
  const color = mat.color?.clone() ?? new THREE.Color(0xcccccc);
  if (!mat.map) color.convertLinearToSRGB();
  return new THREE.MeshStandardMaterial({ name: mat.name, color, map: mat.map ?? null, vertexColors: !!mat.vertexColors, side: mat.side, roughness: 0.8, metalness: 0, transparent: mat.transparent, opacity: mat.opacity, alphaTest: mat.alphaTest });
};
window.model = async (url) => {
  const m = await load(url);
  const legacy = !/\\.(glb|gltf)$/i.test(url);
  let triangles = 0, meshes = 0;
  m.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    meshes += 1;
    const g = o.geometry;
    triangles += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
    if (!o.material || (Array.isArray(o.material) && !o.material.length)) o.material = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    // FBX exports often carry TransparencyFactor 1, which FBXLoader reads as opacity 0: nothing would be drawn.
    for (const mat of [].concat(o.material)) if (mat.opacity < 0.05) { mat.opacity = 1; mat.transparent = false; }
    if (legacy) o.material = Array.isArray(o.material) ? o.material.map(standard) : standard(o.material);
    o.frustumCulled = false;
  });
  if (!meshes) throw new Error('no meshes');
  // FBX, OBJ and Collada return before their textures arrive: wait (at most 10 s) until every map holds its image,
  // or the thumbnail shows the 1-pixel placeholder. A texture that never arrives is counted as missing by the server.
  const maps = [];
  m.traverse((o) => { if (o.isMesh) for (const mat of [].concat(o.material)) if (mat.map) maps.push(mat.map); });
  const loaded = (t) => (t.image?.width ?? t.image?.naturalWidth ?? 0) > 1;
  for (let i = 0; i < 200 && !maps.every(loaded); i++) await new Promise((r) => setTimeout(r, 50));
  for (const t of maps) t.needsUpdate = true;
  const box = new THREE.Box3().setFromObject(m);
  const size = box.getSize(new THREE.Vector3());
  const scene = new THREE.Scene(); scene.environment = env; scene.environmentIntensity = 0.5;
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(3, 5, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfe4ff, 1.2); rim.position.set(-4, 2, -3); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6677aa, 0.4));
  m.rotation.y = -Math.PI / 6;
  m.position.sub(new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()));
  const pivot = new THREE.Group(); pivot.add(m); pivot.rotation.x = 0.3; scene.add(pivot);
  const r = new THREE.Box3().setFromObject(pivot).getBoundingSphere(new THREE.Sphere()).radius || 1;
  const cam = new THREE.PerspectiveCamera(22, 1, r / 100, r * 100);
  cam.position.set(0, 0, r / Math.sin(THREE.MathUtils.degToRad(11)) * 1.1); cam.lookAt(0, 0, 0);
  renderer.setClearColor(0x000000, 0); renderer.render(scene, cam);
  const src = canvas(N * 2); src.getContext('2d').drawImage(renderer.domElement, 0, 0);
  const d = src.getContext('2d').getImageData(0, 0, N * 2, N * 2).data;
  let x0 = N * 2, y0 = N * 2, x1 = 0, y1 = 0;
  for (let y = 0; y < N * 2; y++) for (let x = 0; x < N * 2; x++) if (d[(y * N * 2 + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 < x0) throw new Error('nothing drawn');
  const w = x1 - x0 + 1, h = y1 - y0 + 1, s = (N - 2 * (LINE + 6)) / Math.max(w, h);
  const fit = canvas(N), f = fit.getContext('2d'); f.imageSmoothingQuality = 'high';
  f.drawImage(src, x0, y0, w, h, (N - w * s) / 2, (N - h * s) / 2, w * s, h * s);
  const sil = canvas(N), g2 = sil.getContext('2d');
  for (let a = 0; a < 24; a++) { const t = a / 24 * Math.PI * 2; g2.drawImage(fit, Math.cos(t) * LINE, Math.sin(t) * LINE); }
  g2.globalCompositeOperation = 'source-in'; g2.fillStyle = CONTOUR; g2.fillRect(0, 0, N, N);
  const o = canvas(N), c = o.getContext('2d'); c.drawImage(sil, 0, 0); c.drawImage(fit, 0, 0);
  m.traverse((x) => { if (x.isMesh) { x.geometry?.dispose(); [].concat(x.material).forEach((mat) => { mat?.map?.dispose(); mat?.dispose?.(); }); } });
  return { png: o.toDataURL('image/png'), triangles: Math.round(triangles), meshes, size: [size.x, size.y, size.z].map((v) => Math.round(v * 1000) / 1000) };
};
window.ready = true;
</script></body></html>`;

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(outDir, { recursive: true });
  const statsFile = join(outDir, 'stats.jsonl');
  const done = new Set(existsSync(statsFile) ? readFileSync(statsFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).key) : []);
  const list = JSON.parse(readFileSync(listFile, 'utf8')).filter((x) => !done.has(x.key));
  const THREE_DIR = dirname(dirname(fileURLToPath(import.meta.resolve('three'))));
  const ROOT = resolve(rootDir);
  const TYPES = { '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.tga': 'image/x-tga' };
  // Packs often keep textures in a folder of their own while the model names them as siblings: a texture that is not
  // where the model says is found by file name anywhere in the same pack (the first path segment under <root-dir>).
  const byName = new Map();
  let missing = [];
  const packFiles = (pack) => {
    if (!byName.has(pack)) {
      const m = new Map();
      const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (!m.has(e.name.toLowerCase())) m.set(e.name.toLowerCase(), p); } };
      if (existsSync(join(ROOT, pack))) walk(join(ROOT, pack));
      byName.set(pack, m);
    }
    return byName.get(pack);
  };
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    if (u === '/') { res.setHeader('content-type', 'text/html'); return res.end(page); }
    const base = u.startsWith('/three/') ? THREE_DIR : u.startsWith('/files/') ? ROOT : null;
    let file = base ? resolve(join(base, u.replace(/^\/(three|files)\//, ''))) : '';
    if (base === ROOT && file.startsWith(ROOT) && !existsSync(file)) file = packFiles(u.split('/')[2]).get(u.split('/').pop().toLowerCase()) ?? file;
    if (!base || !file.startsWith(base) || !existsSync(file)) { if (base === ROOT) missing.push(u.split('/').pop()); res.statusCode = 404; return res.end(); }
    res.setHeader('content-type', TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
    res.end(readFileSync(file));
  }).listen(0, '127.0.0.1');
  const shell = () => {
    const b = join(homedir(), 'Library', 'Caches', 'ms-playwright');
    const d = existsSync(b) ? readdirSync(b).filter((x) => x.startsWith('chromium_headless_shell-')).sort().pop() : undefined;
    return d ? join(b, d, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell') : undefined;
  };
  const launch = () => chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? shell(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let browser = await launch();
  let ok = 0, failed = 0, tab;
  // A model can take the whole browser down (out of memory): start a new one and go on.
  const open = async () => { if (!browser.isConnected()) { await browser.close().catch(() => {}); browser = await launch(); } tab = await browser.newPage(); await tab.goto(`http://127.0.0.1:${server.address().port}/`); await tab.waitForFunction(() => window.ready); };
  try {
    await open();
    for (const [i, it] of list.entries()) {
      const url = '/files/' + it.file.split('/').map(encodeURIComponent).join('/');
      missing = [];
      try {
        const r = await Promise.race([tab.evaluate((u) => window.model(u), url), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout 40 s')), 40_000))]);
        writeFileSync(join(outDir, `${it.key}.png`), Buffer.from(r.png.split(',')[1], 'base64'));
        appendFileSync(statsFile, JSON.stringify({ key: it.key, ok: true, triangles: r.triangles, meshes: r.meshes, size: r.size, missing: missing.length, ...(missing.length ? { missing_files: [...new Set(missing)].slice(0, 5) } : {}) }) + '\n');
        ok += 1;
      } catch (e) {
        appendFileSync(statsFile, JSON.stringify({ key: it.key, ok: false, error: String(e.message).slice(0, 160) }) + '\n');
        failed += 1;
        await tab.close().catch(() => {}); await open();
      }
      if (i % 200 === 199) { console.log(`${i + 1}/${list.length}`); await tab.close().catch(() => {}); await open(); }
    }
  } finally { await browser.close(); server.close(); }
  console.log(`${ok} rendered, ${failed} failed -> ${outDir}`);
}
