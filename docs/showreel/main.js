import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SCENES, TYPE_TEXT, TYPE_START, TYPE_STEP, SLOT, CODE, CODE_LAND, CHECK_SLAMS, TAG_WORDS, LAND_GROUPS } from './timeline.js';

// ---------------------------------------------------------------- math
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, u) => a + (b - a) * u;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const eOutExpo = (u) => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * u));
const eInExpo = (u) => (u <= 0 ? 0 : Math.pow(2, 10 * u - 10));
const eInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const eOutCubic = (u) => 1 - Math.pow(1 - u, 3);
const eInCubic = (u) => u * u * u;
const eOutBack = (u, s = 1.9) => 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2);
const spring = (u, f = 3.2, d = 5.5) => (u <= 0 ? 0 : 1 - Math.exp(-d * u) * Math.cos(f * Math.PI * 2 * u * 0.5 * 2));
const springT = (t, at, f = 2.6, d = 7) => (t < at ? 0 : 1 - Math.exp(-d * (t - at)) * Math.cos(f * Math.PI * 2 * (t - at)));
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const $ = (s, r = document) => r.querySelector(s);
const inScene = (t, k, pad = 0) => t >= SCENES[k][0] - pad && t < SCENES[k][1] + pad;

// ---------------------------------------------------------------- liquid glass refraction (per element)
let filterN = 0;
function liquid(el, { w, h, r, strength = 70, band = 46, blur = 18, sat = 1.8, bright = 1.06 }) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); const img = g.createImageData(w, h);
  const sd = (x, y) => { const qx = Math.abs(x - w / 2) - (w / 2 - r), qy = Math.abs(y - h / 2) - (h / 2 - r); return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = sd(x, y); const k = d > 0 ? 0 : Math.pow(clamp(1 + d / band), 2.2);
    let nx = sd(x + 1, y) - sd(x - 1, y), ny = sd(x, y + 1) - sd(x, y - 1); const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
    const i = (y * w + x) * 4; img.data[i] = 128 + 127 * k * nx; img.data[i + 1] = 128 + 127 * k * ny; img.data[i + 2] = 128; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const id = 'lq' + filterN++;
  $('#filters').insertAdjacentHTML('beforeend', `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feImage href="${c.toDataURL()}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="m"/><feDisplacementMap in="SourceGraphic" in2="m" scale="${strength}" xChannelSelector="R" yChannelSelector="G"/></filter>`);
  el.style.backdropFilter = `url(#${id}) blur(${blur}px) saturate(${sat}) brightness(${bright})`;
  el.style.width = w + 'px'; el.style.height = h + 'px'; el.style.setProperty('--r', r + 'px');
}

// ---------------------------------------------------------------- renderer + post
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); renderer.setSize(1920, 1080, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const rt = new THREE.WebGLRenderTarget(1920, 1080, { samples: 4, type: THREE.HalfFloatType });
const composer = new EffectComposer(renderer, rt);
const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
const bloom = new UnrealBloomPass(new THREE.Vector2(1920, 1080), 0.8, 0.6, 0.75);
composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(new OutputPass());
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// ---------------------------------------------------------------- shared aurora background
const BG_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`;
const BG_FRAG = `
precision highp float; varying vec2 vUv;
uniform float uT, uI, uGrid, uSpeed; uniform vec3 uA, uB, uC;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0., a = .5; for(int i = 0; i < 5; i++){ s += a*n(p); p = p*2.03 + 17.1; a *= .5; } return s; }
void main(){
  vec2 p = (vUv - .5) * vec2(1.7778, 1.);
  float t = uT * .18;
  vec2 q = vec2(fbm(p*1.3 + vec2(t, -t*.7)), fbm(p*1.3 + vec2(-t*.8, t) + 3.1));
  float f = fbm(p*1.7 + q*2.2 + vec2(t*.5, -t*.3));
  vec3 col = vec3(.006, .005, .012);
  col = mix(col, uA, smoothstep(.38, .9, f));
  col = mix(col, uB, smoothstep(.5, 1., q.y) * .75);
  col += uC * pow(smoothstep(.62, 1., f), 3.) * 1.6;
  // ribbon of light
  float rib = exp(-pow((p.y + .25*sin(p.x*2.2 + uT*.6) - .05*q.x) * 9., 2.));
  col += uC * rib * .25;
  col *= 1. - .6 * dot(p, p);
  if (uGrid > 0.) {
    float y = p.y + .12;
    if (y < 0.) {
      float z = .4 / -y; vec2 g = vec2(p.x * z, z + uT * uSpeed);
      vec2 gg = abs(fract(g * 1.5) - .5) / fwidth(g * 1.5);
      float l = 1. - min(min(gg.x, gg.y), 1.);
      col += uC * l * uGrid * smoothstep(9., 1., z) * .9;
    }
    col += uC * exp(-pow(y * 30., 2.)) * .5 * uGrid;
  }
  gl_FragColor = vec4(col * uI, 1.);
}`;
function bgMesh(a, b, c) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    vertexShader: BG_VERT, fragmentShader: BG_FRAG, depthWrite: false, depthTest: false, toneMapped: false,
    uniforms: { uT: { value: 0 }, uI: { value: 1 }, uGrid: { value: 0 }, uSpeed: { value: 1 }, uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) }, uC: { value: new THREE.Color(c) } },
  }));
  m.frustumCulled = false; m.renderOrder = -10; return m;
}

// ---------------------------------------------------------------- scene: aurora + floating liquid glass blobs (ask, pair, checks)
const aur = { scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(35, 16 / 9, 0.1, 200) };
aur.bg = bgMesh('#3a1f86', '#12306e', '#a67cff'); aur.scene.add(aur.bg);
aur.scene.environment = envTex;
aur.blobs = [];
{
  const glassM = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transmission: 1, thickness: 2.5, ior: 1.5, iridescence: 1, iridescenceIOR: 1.35, clearcoat: 1, envMapIntensity: 1.6 });
  const geos = [new THREE.TorusKnotGeometry(1.1, 0.38, 220, 32), new THREE.SphereGeometry(1.2, 64, 48), new THREE.TorusGeometry(1.3, 0.42, 48, 128), new RoundedBoxGeometry(1.9, 1.9, 1.9, 6, 0.45), new THREE.IcosahedronGeometry(1.2, 8)];
  const pos = [[-7.5, 3.2, -6], [7.8, -2.6, -5], [6.5, 3.8, -9], [-6.6, -3.4, -7], [0.5, 4.8, -12], [-1.5, -5, -10], [10, 1, -14]];
  pos.forEach((p, i) => { const m = new THREE.Mesh(geos[i % geos.length], glassM); m.position.set(...p); m.userData.p = p; m.userData.s = 0.8 + (i % 3) * 0.3; aur.scene.add(m); aur.blobs.push(m); });
  // emissive light bars that the glass refracts
  const barM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.7, 1.8), toneMapped: false });
  aur.bars = [];
  for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.035, 40, 0.035), barM); b.position.set(-12 + i * 10, 0, -26); b.rotation.z = 0.5; aur.scene.add(b); aur.bars.push(b); }
}
function updateAurora(t, mode) {
  aur.bg.material.uniforms.uT.value = t;
  const u = aur.bg.material.uniforms;
  if (mode === 'checks') { u.uGrid.value = 1; u.uSpeed.value = 1.6; u.uA.value.set('#24104f'); u.uB.value.set('#0b1d4a'); u.uI.value = 1; }
  else { u.uGrid.value = mode === 'pair' ? 0.5 : 0; u.uSpeed.value = 0.6; u.uA.value.set('#3a1f86'); u.uB.value.set('#12306e'); u.uI.value = 1; }
  aur.blobs.forEach((m, i) => {
    const [x, y, z] = m.userData.p; const s = m.userData.s;
    m.position.set(x + Math.sin(t * 0.5 + i) * 0.6, y + Math.cos(t * 0.7 + i * 2) * 0.5, z);
    m.rotation.set(t * 0.3 + i, t * 0.4 + i * 0.5, 0);
    let sc = s;
    if (mode === 'ask') sc *= eOutBack(seg(t, 2.0 + i * 0.06, 2.7 + i * 0.06), 1.4);
    m.scale.setScalar(Math.max(sc, 0.001));
    m.visible = mode !== 'checks' || i < 4;
  });
  aur.bars.forEach((b, i) => { b.position.x = -20 + ((i * 13 + t * 3) % 40); });
  const cam = aur.cam;
  if (mode === 'ask') { const u2 = eOutExpo(seg(t, 2, 3.2)); cam.position.set(Math.sin(t * 0.4) * 0.8, 0.3 - u2 * 0.3, 18 - u2 * 4 - (t - 2) * 0.3); cam.rotation.set(0, 0, (1 - u2) * 0.25); }
  else if (mode === 'pair') { cam.position.set(Math.sin(t) * 0.5, 0, 12 - (t - 6) * 1.2 - eInExpo(seg(t, 7.5, 8)) * 6); cam.rotation.set(0, 0, Math.sin(t * 0.8) * 0.05); }
  else { cam.position.set(Math.sin(t * 0.6) * 0.6, 0.6, 12 - (t - 18) * 0.6); cam.rotation.set(-0.03, 0, -0.04 + eInExpo(seg(t, 21.4, 22)) * 0.8); }
  cam.lookAt(cam.position.x * 0.2, 0, -10); cam.rotation.z += mode === 'ask' ? (1 - eOutExpo(seg(t, 2, 3.2))) * 0.25 : 0;
  bloom.strength = 0.55; bloom.radius = 0.7; bloom.threshold = 0.72;
}

// ---------------------------------------------------------------- scene: ops tunnel
const tun = { scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 900) };
const OPS = [
  ['create_instances', 'Frame "EggShop"'], ['set_props', 'UICorner.CornerRadius = 24'], ['create_instances', 'Part "LavaTile" ×30'],
  ['apply_surface', 'Neon · #ff5a1f'], ['edit_script', 'ShopServer.server.luau'], ['place_copies', 'Brick ×136'],
  ['set_props', 'UIStroke.Thickness = 2'], ['transform_instances', 'Pedestal → (−4, 0, −4)'], ['group_instances', 'Model "EggStand"'],
  ['create_instances', 'ProximityPrompt "Hatch"'], ['edit_script', 'Hatch.client.luau'], ['ui_layout_check', '0 overlaps'],
  ['play_check', '0 errors'], ['spatial_query', 'clearance ok'], ['set_props', 'TextLabel.Text = "Egg Shop"'], ['create_instances', 'Script "KillBrick"'],
  ['get_tree', 'Workspace · 412 nodes'], ['terrain_edit', 'smooth · radius 6'], ['set_props', 'Lighting.ClockTime = 17.5'], ['create_instances', 'ImageButton "Buy" ×3'],
];
function cardTexture(op, arg, i) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d');
  const r = 56; g.beginPath(); g.roundRect(6, 6, 1012, 244, r);
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(255,255,255,0.20)'); gr.addColorStop(1, 'rgba(166,124,255,0.07)');
  g.fillStyle = gr; g.fill(); g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,0.55)'; g.stroke();
  g.beginPath(); g.roundRect(10, 10, 1004, 120, [52, 52, 10, 10]); const hi = g.createLinearGradient(0, 10, 0, 130); hi.addColorStop(0, 'rgba(255,255,255,0.22)'); hi.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = hi; g.fill();
  g.fillStyle = '#a67cff'; g.beginPath(); g.arc(78, 128, 16, 0, Math.PI * 2); g.fill();
  g.font = '600 50px "DejaVu Sans Mono"'; g.fillStyle = '#e8ddff'; g.fillText(op, 120, 112);
  g.font = '500 44px Inter'; g.fillStyle = 'rgba(255,255,255,0.86)'; g.fillText(arg, 120, 182);
  g.font = '600 30px "DejaVu Sans Mono"'; g.fillStyle = 'rgba(255,255,255,0.4)'; g.textAlign = 'right'; g.fillText('#' + String(i + 1).padStart(3, '0'), 990, 70);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8; return tx;
}
function buildTunnel() {
  tun.bg = bgMesh('#1a0c40', '#071a40', '#7d5cff'); tun.bg.material.uniforms.uI.value = 0.55; tun.scene.add(tun.bg);
  tun.cards = [];
  const R = rng(7);
  for (let i = 0; i < 64; i++) {
    const [op, arg] = OPS[i % OPS.length];
    const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: cardTexture(op, arg, i), transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    const a = i * 2.39996, rad = 6.5 + (i % 3) * 2.4 + R() * 1.5, z = -10 - i * 6.2;
    m.position.set(Math.cos(a) * rad, Math.sin(a) * rad * 0.75, z);
    m.rotation.set(Math.sin(a) * 0.45, -Math.cos(a) * 0.55, (R() - 0.5) * 0.3);
    m.userData = { a, rad, z, spin: (R() - 0.5) * 0.6 };
    tun.scene.add(m); tun.cards.push(m);
  }
  // speed streaks
  const N = 1600, pos = new Float32Array(N * 6), col = new Float32Array(N * 6);
  for (let i = 0; i < N; i++) {
    const a = R() * Math.PI * 2, r = 3 + Math.pow(R(), 0.7) * 40, z = 40 - R() * 520, L = 4 + R() * 18;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    pos.set([x, y, z, x, y, z - L], i * 6);
    const v = R() < 0.25 ? [1.6, 1.6, 2.2] : [0.6 + R() * 0.5, 0.4, 1.6];
    col.set([...v.map((q) => q * 0.1), ...v], i * 6);
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); lg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  tun.streaks = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  tun.scene.add(tun.streaks);
  // tunnel rings
  tun.rings = [];
  for (let i = 0; i < 26; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(15, 0.05, 6, 120), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.8, 2.6), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, toneMapped: false }));
    ring.position.z = -i * 20; ring.scale.y = 0.75; tun.scene.add(ring); tun.rings.push(ring);
  }
  // core
  const cc = document.createElement('canvas'); cc.width = cc.height = 256; const g = cc.getContext('2d');
  const rg = g.createRadialGradient(128, 128, 0, 128, 128, 128); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.15, 'rgba(200,170,255,0.9)'); rg.addColorStop(0.5, 'rgba(120,70,255,0.25)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
  tun.glowTex = new THREE.CanvasTexture(cc);
  tun.core = new THREE.Sprite(new THREE.SpriteMaterial({ map: tun.glowTex, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: new THREE.Color(2, 2, 2) }));
  tun.core.scale.set(160, 160, 1); tun.scene.add(tun.core);
}
function updateTunnel(t) {
  const u = seg(t, 8, 12);
  const z = 30 - 300 * (1 - Math.pow(1 - u, 1.7)) - 120 * u;
  const cam = tun.cam;
  cam.position.set(Math.sin(t * 1.1) * 1.2, Math.cos(t * 0.9) * 0.8, z);
  cam.rotation.set(0, 0, 0);
  cam.rotation.z = 0.12 * Math.sin(t * 1.3) + Math.PI * eInOut(seg(t, 9.9, 10.7));
  cam.rotation.y = eInExpo(seg(t, 11.6, 12)) * -1.4;
  cam.fov = 70 + 25 * Math.exp(-((t - 8) * 3.5)) + 12 * Math.exp(-Math.pow((t - 10.3) * 3, 2)); cam.updateProjectionMatrix();
  tun.bg.material.uniforms.uT.value = t * 3;
  tun.cards.forEach((m, i) => {
    const d = m.userData; const flip = eOutExpo(seg(cam.position.z - d.z, 4, 70));
    m.rotation.z = d.spin * (t - 8) + (i % 2 ? 1 : -1) * 0.2;
    m.material.opacity = clamp((cam.position.z - d.z + 260) / 140) * clamp((cam.position.z - d.z + 2) / 6);
    m.position.x = Math.cos(d.a + (t - 8) * 0.12) * d.rad; m.position.y = Math.sin(d.a + (t - 8) * 0.12) * d.rad * 0.75;
    m.scale.setScalar(0.6 + 0.4 * flip);
  });
  tun.rings.forEach((r, i) => { r.rotation.z = t * 0.3 + i * 0.4; r.material.opacity = 0.5 + 0.5 * Math.max(0, Math.sin(t * 12.566 - i)); });
  tun.core.position.set(0, 0, z - 260);
  bloom.strength = 1.15 + 0.8 * Math.exp(-(t - 8) * 4); bloom.radius = 0.55; bloom.threshold = 0.55;
}

// ---------------------------------------------------------------- scene: brick build, egg hatch
const bld = { scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 400) };
function buildWorld() {
  const S = bld.scene; S.environment = envTex; S.environmentIntensity = 0.35;
  bld.bg = bgMesh('#1d1040', '#0a1736', '#6b4bd6'); bld.bg.material.uniforms.uI.value = 0.6; S.add(bld.bg);
  S.fog = new THREE.Fog(0x07060c, 40, 90);
  S.add(new THREE.HemisphereLight(0x9a88ff, 0x0a0812, 0.6));
  const key = new THREE.DirectionalLight(0xfff1e6, 3.2); key.position.set(12, 22, 10); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 70 }); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
  S.add(key);
  const rim = new THREE.DirectionalLight(0xa67cff, 2.2); rim.position.set(-14, 8, -12); S.add(rim);
  bld.lavaLight = new THREE.PointLight(0xff6a2a, 40, 16, 1.6); bld.lavaLight.position.set(4, 2.5, -4); S.add(bld.lavaLight);
  bld.eggLight = new THREE.PointLight(0xc4a6ff, 0, 18, 1.5); bld.eggLight.position.set(4, 6.5, 4); S.add(bld.eggLight);

  const base = new THREE.Mesh(new RoundedBoxGeometry(16.4, 0.7, 16.4, 4, 0.18), new THREE.MeshStandardMaterial({ color: 0x17161d, roughness: 0.7 }));
  base.position.y = -0.35; base.receiveShadow = true; S.add(base);
  const studG = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 24);
  const studs = new THREE.InstancedMesh(studG, new THREE.MeshStandardMaterial({ color: 0x1d1c25, roughness: 0.6 }), 256);
  const M = new THREE.Matrix4(); let k = 0;
  for (let x = -8; x < 8; x++) for (let z = -8; z < 8; z++) { M.makeTranslation(x + 0.5, 0.1, z + 0.5); studs.setMatrixAt(k++, M); }
  studs.receiveShadow = true; S.add(studs);

  const brickG = mergeGeometries([new RoundedBoxGeometry(0.96, 1.16, 0.96, 3, 0.07), studG.clone().toNonIndexed().translate(0, 0.68, 0)]);
  const plateG = mergeGeometries([new RoundedBoxGeometry(0.96, 0.36, 0.96, 3, 0.06), studG.clone().toNonIndexed().translate(0, 0.28, 0)]);
  const mats = {
    char: new THREE.MeshStandardMaterial({ color: 0x2a2833, roughness: 0.55 }),
    violet: new THREE.MeshPhysicalMaterial({ color: 0x8f63ff, roughness: 0.35, clearcoat: 0.6 }),
    lav: new THREE.MeshPhysicalMaterial({ color: 0xc8b6ff, roughness: 0.4, clearcoat: 0.5 }),
    white: new THREE.MeshPhysicalMaterial({ color: 0xeeeef4, roughness: 0.45, clearcoat: 0.4 }),
    lava: new THREE.MeshStandardMaterial({ color: 0xff5a1f, emissive: 0xff4a10, emissiveIntensity: 2.2, roughness: 0.4 }),
    leaf: new THREE.MeshPhysicalMaterial({ color: 0x6d4be0, roughness: 0.5, clearcoat: 0.3 }),
  };
  bld.mats = mats;
  const list = [];
  const add = (x, y, z, m, plate = false, grp = 0) => list.push({ x: x + 0.5, y, z: z + 0.5, m, plate, grp });
  for (let x = 0; x <= 7; x++) for (let z = -7; z <= -1; z++) { const edge = x === 0 || x === 7 || z === -7 || z === -1; if (edge) add(x, 0, z, 'char', false, 0); else add(x, 0, z, 'lava', true, 1); }
  for (let y = 0; y < 3; y++) for (const [x, z] of [[3, 3], [4, 3], [3, 4], [4, 4]]) add(x, y, z, y % 2 ? 'lav' : 'violet', false, 2);
  for (let y = 0; y < 3; y++) for (let x = -6; x <= -1; x++) add(x, y, 5, (x + y) % 2 ? 'white' : 'lav', false, 3);
  for (let y = 0; y < 2; y++) for (const x of [-6, -1]) for (let z = 2; z <= 4; z++) add(x, y, z, 'white', false, 3);
  for (let x = -5; x <= -2; x++) add(x, 0, 2, 'violet', false, 3);
  for (let y = 2; y < 4; y++) for (const x of [-6, -1]) add(x, y, 2, 'violet', false, 3);
  for (const [x, z] of [[0, 2], [1, 2], [1, 3], [2, 3], [0, 1], [-1, 1]]) add(x, 0, z, 'lav', true, 4);
  for (const [tx, tz] of [[-5, -4], [-2, -6]]) { add(tx, 0, tz, 'char', false, 5); add(tx, 1, tz, 'char', false, 5); for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) add(tx + dx, 2, tz + dz, 'leaf', false, 5); add(tx, 3, tz, 'violet', false, 5); }
  // order: group, then level, then sweep; assign quantised landing times
  list.sort((a, b) => a.grp - b.grp || a.y - b.y || (a.x + a.z) - (b.x + b.z));
  bld.bricks = list.map((b, i) => {
    const mesh = new THREE.Mesh(b.plate ? plateG : brickG, mats[b.m]); mesh.castShadow = true; mesh.receiveShadow = true;
    const gi = Math.min(LAND_GROUPS.length - 1, Math.floor((i / list.length) * LAND_GROUPS.length));
    b.land = LAND_GROUPS[gi]; b.ty = b.plate ? 0.18 : 0.58 + b.y * 1.2; b.mesh = mesh; b.r = rng(i + 3)();
    mesh.position.set(b.x, b.ty, b.z); S.add(mesh); return b;
  });
  // glass roof + sign over the shop
  bld.roof = new THREE.Mesh(new RoundedBoxGeometry(7.4, 0.32, 4.6, 4, 0.12), new THREE.MeshPhysicalMaterial({ color: 0xd9ccff, transmission: 1, thickness: 0.6, roughness: 0.08, ior: 1.4, iridescence: 0.8, clearcoat: 1 }));
  bld.roof.position.set(-3, 4.95, 3.8); S.add(bld.roof);
  const sc = document.createElement('canvas'); sc.width = 512; sc.height = 160; const sg = sc.getContext('2d');
  sg.font = '800 110px "Inter Display"'; sg.textAlign = 'center'; sg.fillStyle = '#fff'; sg.shadowColor = '#a67cff'; sg.shadowBlur = 24; sg.fillText('SHOP', 256, 120);
  const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
  bld.sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.06), new THREE.MeshBasicMaterial({ map: st, transparent: true, toneMapped: false, color: new THREE.Color(2, 2, 2) }));
  bld.sign.position.set(-3.5, 5.8, 2.2); S.add(bld.sign);
  // egg (two halves) + pet
  const ec = document.createElement('canvas'); ec.width = 512; ec.height = 256; const eg = ec.getContext('2d');
  const grd = eg.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, '#e9dcff'); grd.addColorStop(1, '#8a5cff'); eg.fillStyle = grd; eg.fillRect(0, 0, 512, 256);
  const R = rng(11); for (let i = 0; i < 90; i++) { eg.fillStyle = R() < 0.5 ? 'rgba(255,255,255,.75)' : 'rgba(70,30,160,.55)'; eg.beginPath(); eg.arc(R() * 512, R() * 256, 3 + R() * 9, 0, 7); eg.fill(); }
  const et = new THREE.CanvasTexture(ec); et.colorSpace = THREE.SRGBColorSpace;
  const eggM = new THREE.MeshPhysicalMaterial({ map: et, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1, sheen: 0.5, emissive: 0x6a3fe0, emissiveIntensity: 0 });
  bld.egg = new THREE.Group(); bld.egg.position.set(4, 3.6, 4); S.add(bld.egg);
  bld.eggTop = new THREE.Mesh(new THREE.SphereGeometry(1.05, 64, 32, 0, Math.PI * 2, 0, Math.PI * 0.46), eggM);
  bld.eggBot = new THREE.Mesh(new THREE.SphereGeometry(1.05, 64, 32, 0, Math.PI * 2, Math.PI * 0.46, Math.PI * 0.54), eggM);
  for (const h of [bld.eggTop, bld.eggBot]) { h.scale.set(1, 1.32, 1); h.position.y = 1.3; h.castShadow = true; bld.egg.add(h); }
  bld.eggM = eggM;
  bld.pet = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(1.3, 1.15, 1.1, 5, 0.42), new THREE.MeshPhysicalMaterial({ color: 0xb08cff, roughness: 0.3, clearcoat: 1, emissive: 0x5a2fd0, emissiveIntensity: 0.25 }));
  bld.pet.add(body);
  for (const sx of [-0.28, 0.28]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6 })); eye.position.set(sx, 0.12, 0.52); bld.pet.add(eye);
    const pup = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), new THREE.MeshBasicMaterial({ color: 0x110822 })); pup.position.set(sx, 0.1, 0.66); bld.pet.add(pup);
  }
  for (const sx of [-0.42, 0.42]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 20), body.material); ear.position.set(sx, 0.7, 0); ear.rotation.z = -sx * 0.6; bld.pet.add(ear); }
  bld.pet.position.set(4, 4.5, 4); S.add(bld.pet);
  // sparkles
  const N = 260, sp = new Float32Array(N * 3); bld.sparkDir = [];
  for (let i = 0; i < N; i++) { const th = R() * Math.PI * 2, ph = Math.acos(2 * R() - 1), v = 2 + R() * 7; bld.sparkDir.push([Math.sin(ph) * Math.cos(th) * v, Math.abs(Math.cos(ph)) * v * 1.2, Math.sin(ph) * Math.sin(th) * v]); }
  const sgm = new THREE.BufferGeometry(); sgm.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  bld.sparks = new THREE.Points(sgm, new THREE.PointsMaterial({ size: 0.22, map: tun.glowTex, color: new THREE.Color(3, 2.4, 4), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
  S.add(bld.sparks);
}
function updateBuild(t) {
  bld.bg.material.uniforms.uT.value = t;
  for (const b of bld.bricks) {
    const dur = 0.42, st = b.land - dur;
    if (t < st) { b.mesh.visible = false; continue; }
    b.mesh.visible = true;
    if (t < b.land) { const u = (t - st) / dur; b.mesh.position.y = b.ty + 16 * (1 - u * u); b.mesh.scale.set(0.92, 1.12, 0.92); b.mesh.rotation.y = (1 - u) * (b.r - 0.5) * 2; }
    else { const s = springT(t, b.land, 3.2, 9) ; const sq = 1 - (1 - s) * 0.45; b.mesh.position.y = b.ty; b.mesh.rotation.y = 0; b.mesh.scale.set(1 + (1 - sq) * 0.4, sq, 1 + (1 - sq) * 0.4); }
    if (b.plate && b.m === 'lava') b.mesh.scale.y *= 1;
  }
  bld.mats.lava.emissiveIntensity = 1.8 + 0.8 * Math.sin(t * 6) * Math.sin(t * 2.3);
  bld.lavaLight.intensity = t > 12.6 ? 40 + 15 * Math.sin(t * 7) : 0;
  const roofU = eOutBack(seg(t, 14.6, 15.0), 1.6); bld.roof.scale.setScalar(Math.max(roofU, 0.001)); bld.roof.visible = roofU > 0.001;
  const signU = eOutBack(seg(t, 14.75, 15.1), 2); bld.sign.scale.setScalar(Math.max(signU, 0.001));
  // egg: appears, wobbles, cracks at 16.4
  const eggIn = eOutBack(seg(t, 14.85, 15.25), 2.2);
  bld.egg.scale.setScalar(Math.max(eggIn, 0.001));
  const wob = seg(t, 15.7, 16.4);
  bld.egg.rotation.z = Math.sin(t * 38) * 0.16 * wob * wob;
  bld.eggM.emissiveIntensity = wob * wob * 0.9;
  const ck = seg(t, 16.4, 17.4);
  bld.eggTop.position.set(ck * 0.6, 1.3 + eOutCubic(ck) * 3.2 - ck * ck * 1.2, ck * 0.4); bld.eggTop.rotation.set(ck * 1.6, 0, -ck * 2.2);
  bld.eggBot.position.y = 1.3 - eOutCubic(ck) * 0.1;
  bld.eggLight.intensity = t < 16.4 ? wob * 20 : 60 * Math.exp(-(t - 16.4) * 2.5) + 12;
  const petU = springT(t, 16.55, 1.9, 6.5);
  bld.pet.scale.setScalar(Math.max(petU, 0.001)); bld.pet.visible = t > 16.55;
  bld.pet.position.y = 4.5 + petU * 0.9 + Math.max(0, Math.sin((t - 16.55) * 9)) * 0.25 * Math.exp(-(t - 16.55) * 1.5);
  bld.pet.rotation.y = 0.6 + Math.sin(t * 3) * 0.2;
  const pa = bld.sparks.geometry.attributes.position; const su = Math.max(0, t - 16.4);
  for (let i = 0; i < bld.sparkDir.length; i++) { const d = bld.sparkDir[i]; const k = 1 - Math.exp(-su * 2.6); pa.setXYZ(i, 4 + d[0] * k * 0.8, 5 + d[1] * k * 0.8 - su * su * 0.8, 4 + d[2] * k * 0.8); }
  pa.needsUpdate = true; bld.sparks.visible = t > 16.4; bld.sparks.material.opacity = clamp(1.6 - su);
  // camera: orbit, dolly zoom into the egg, crane out
  const cam = bld.cam; const target = new THREE.Vector3(-0.5, 1.2, 0);
  const egg = new THREE.Vector3(4, 5.0, 4);
  const a = lerp(0.55, 1.45, eInOut(seg(t, 12, 15.6))) + (1 - eOutExpo(seg(t, 12, 13))) * -0.9;
  const R0 = 30 - 6 * eOutExpo(seg(t, 12, 13.5));
  let pos = new THREE.Vector3(Math.cos(a) * R0, 15 + (1 - eOutExpo(seg(t, 12, 13.2))) * 12, Math.sin(a) * R0);
  let look = target.clone(); let fov = 30;
  const dz = seg(t, 15.4, 16.4);
  if (t >= 15.3) {
    const k0 = eInOut(seg(t, 15.3, 15.6)); look = target.clone().lerp(egg, k0);
    const dir = pos.clone().sub(egg); const D0 = dir.length(); dir.normalize();
    const e = eInOut(dz); const D = lerp(D0, D0 * 0.42, e);
    pos = egg.clone().add(dir.multiplyScalar(D)); pos.y -= e * 2.5;
    fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(15)) * D0 / D));
    if (t > 16.4) { const o = (t - 16.4) * 0.35; pos.sub(egg).applyAxisAngle(new THREE.Vector3(0, 1, 0), o).add(egg); }
    const up = eInExpo(seg(t, 17.55, 18)); pos.y += up * 30; look.y -= up * 2; fov += up * 20;
  }
  cam.position.copy(pos); cam.fov = Math.min(fov, 100); cam.updateProjectionMatrix(); cam.lookAt(look);
  cam.rotation.z += Math.sin(t * 0.9) * 0.02 + (1 - eOutExpo(seg(t, 12, 12.8))) * 0.35;
  bloom.strength = 0.45 + (t > 16.4 ? 0.7 * Math.exp(-(t - 16.4) * 3) : 0); bloom.radius = 0.5; bloom.threshold = 0.82;
}

// ---------------------------------------------------------------- scene: glass logo
const lg = { scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(35, 16 / 9, 0.1, 300) };
function buildLogo() {
  const S = lg.scene; S.environment = envTex; S.environmentIntensity = 1.2;
  lg.bg = bgMesh('#2a1466', '#0b2257', '#a67cff'); lg.bg.material.uniforms.uI.value = 0.9; S.add(lg.bg);
  const sh = new THREE.Shape();
  sh.moveTo(12, 29); sh.lineTo(27.8, 29); sh.quadraticCurveTo(29, 29, 29, 27.8); sh.lineTo(29, 12);
  sh.absarc(20, 12, 9, 0, -Math.PI / 2, true); sh.lineTo(12, 3); sh.absarc(12, 12, 9, -Math.PI / 2, -Math.PI, true);
  sh.lineTo(3, 20); sh.absarc(12, 20, 9, Math.PI, Math.PI / 2, true);
  const hole = new THREE.Path(); hole.absarc(15.4, 15, 4.6, 0, Math.PI * 2, false); sh.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 4, bevelEnabled: true, bevelThickness: 1.6, bevelSize: 1.1, bevelSegments: 12, curveSegments: 64 });
  geo.translate(-16, -16, -2); geo.scale(0.16, 0.16, 0.16);
  lg.mat = new THREE.MeshPhysicalMaterial({ color: 0xbfa2ff, roughness: 0.06, transmission: 1, thickness: 3, ior: 1.5, iridescence: 1, iridescenceIOR: 1.3, iridescenceThicknessRange: [200, 900], clearcoat: 1, clearcoatRoughness: 0.04, attenuationColor: new THREE.Color(0x8a5cff), attenuationDistance: 1.3, specularIntensity: 1, envMapIntensity: 1.8, dispersion: 4 });
  lg.logo = new THREE.Mesh(geo, lg.mat); lg.group = new THREE.Group(); lg.group.add(lg.logo); S.add(lg.group);
  // light bars behind it, which the glass bends
  lg.bars = [];
  const barCol = [new THREE.Color(0.8, 0.55, 1.6), new THREE.Color(0.4, 0.55, 1.5), new THREE.Color(1.1, 1.1, 1.1)];
  for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 30, 0.06), new THREE.MeshBasicMaterial({ color: barCol[i % 3], toneMapped: false })); b.position.set(-9 + i * 4.2, 0, -9); b.rotation.z = 0.6; S.add(b); lg.bars.push(b); }
  lg.ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 8, 160), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3, 7), transparent: true, toneMapped: false, blending: THREE.AdditiveBlending }));
  S.add(lg.ring);
  const R = rng(5), N = 900, p = new Float32Array(N * 3); lg.pd = [];
  for (let i = 0; i < N; i++) lg.pd.push({ a: R() * Math.PI * 2, r: 2.5 + R() * 9, y: (R() - 0.5) * 7, s: 0.4 + R() * 1.2, z: (R() - 0.5) * 6 });
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(p, 3));
  lg.parts = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.09, map: tun.glowTex, color: new THREE.Color(2.5, 2, 4), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
  S.add(lg.parts);
  const key = new THREE.DirectionalLight(0xffffff, 2); key.position.set(4, 6, 8); S.add(key);
}
function updateLogo(t) {
  lg.bg.material.uniforms.uT.value = t;
  const u = seg(t, 22, 24.2);
  const spin = (1 - eOutExpo(u)) * Math.PI * 5;
  const settle = eOutExpo(seg(t, 23.3, 24.3));
  lg.group.rotation.set(Math.sin(t * 0.7) * 0.12 + (1 - eOutExpo(u)) * 0.8, spin + Math.sin(t * 0.5) * 0.35, (1 - eOutExpo(u)) * -0.6);
  const s = lerp(0.05, 1, eOutBack(seg(t, 22, 23.0), 1.3)) * lerp(1, 0.52, settle);
  lg.group.scale.setScalar(s);
  lg.group.position.set(0, settle * 1.6 + Math.sin(t * 1.2) * 0.05, 0);
  lg.bars.forEach((b, i) => { b.position.x = -12 + ((i * 4.8 + t * 2.2) % 24); });
  const ru = seg(t, 22, 23.2); lg.ring.scale.setScalar(0.5 + eOutExpo(ru) * 14); lg.ring.material.opacity = (1 - ru) * 0.9;
  const ru2 = seg(t, 28, 29.2); if (t >= 28) { lg.ring.scale.setScalar(1 + eOutExpo(ru2) * 12); lg.ring.material.opacity = (1 - ru2) * 0.7; lg.ring.position.y = 1.6; } else lg.ring.position.y = 0;
  const pa = lg.parts.geometry.attributes.position; const pin = 1 - eOutExpo(seg(t, 22, 24.5));
  lg.pd.forEach((d, i) => { const a = d.a + t * 0.25 * d.s + pin * 3; const r = d.r * (0.4 + 0.6 * (1 - pin)) + pin * 10; pa.setXYZ(i, Math.cos(a) * r, d.y + Math.sin(t * d.s + i) * 0.3, Math.sin(a) * r * 0.5 + d.z - 3); });
  pa.needsUpdate = true;
  const cam = lg.cam; cam.position.set(Math.sin(t * 0.3) * 0.4, 0.1, 12 - (1 - eOutExpo(seg(t, 22, 24))) * -10 - (t - 22) * 0.06); cam.lookAt(0, 0.3, 0);
  bloom.strength = 0.7 + 1.2 * Math.exp(-(t - 22) * 2.5) + (t > 28 ? 0.6 * Math.exp(-(t - 28) * 3) : 0); bloom.radius = 0.7; bloom.threshold = 0.7;
}

// ---------------------------------------------------------------- DOM scenes
const L = Object.fromEntries(['cold', 'ask', 'pair', 'hud', 'shop', 'checks', 'logo'].map((k) => [k, $('#' + k)]));
Object.values(L).forEach((el) => { el.style.display = 'block'; });
const show = (k, on) => { L[k].style.display = on ? 'block' : 'none'; };
const sheen = (el, t, at, len = 0.9) => el.style.setProperty('--sheen', lerp(-70, 70, eInOut(seg(t, at, at + len))) + '%');

function mixHex(u) { const st = [[233, 221, 255], [166, 124, 255], [122, 162, 255]]; const k = u < 0.5 ? 0 : 1, v = u < 0.5 ? u * 2 : u * 2 - 1; return 'rgb(' + st[k].map((a, i) => Math.round(lerp(a, st[k + 1][i], v))).join(',') + ')'; }
// ask setup
const composer$ = $('#ask .composer'); liquid(composer$, { w: 1100, h: 280, r: 44, strength: 80, band: 60, blur: 22 });
const slot = $('#ask .slot');
SLOT.forEach((s) => { const d = document.createElement('div'); d.className = 'ph'; const n = s.text.length; d.innerHTML = [...s.text].map((c, j) => `<span style="color:${mixHex(j / Math.max(1, n - 1))}">${c === ' ' ? '&nbsp;' : c}</span>`).join(''); slot.appendChild(d); });
const CHIPS = [['Egg shop', 'UI panel', -560, -300, 0.9], ['Coins', 'currency', 610, -330, 1.0], ['Lava zone', 'zone', -700, 210, 1.05], ['Hatch', 'system', 690, 230, 0.95], ['Leaderboard', 'UI panel', -260, 340, 0.85], ['Checkpoints', 'zone', 330, -430, 0.8]];
const chipsEl = $('#ask .chips');
const chips = CHIPS.map(([a, b, x, y, s], i) => { const d = document.createElement('div'); d.className = 'glass chip'; d.innerHTML = `${a}<b>${b}</b>`; chipsEl.appendChild(d); d.style.left = '0px'; d.style.top = '0px'; d.dataset.i = i; return { d, x, y, s }; });
chips.forEach((c) => liquid(c.d, { w: Math.ceil(c.d.getBoundingClientRect().width), h: 64, r: 32, strength: 40, band: 22, blur: 14 }));

function updateAsk(t) {
  const lt = t;
  // composer entrance: tilted slab falls into place
  const e = springT(lt, 2.0, 1.4, 6.5);
  const rx = (1 - e) * 38, ry = (1 - e) * -14, sc = lerp(1.6, 1, e), ty = (1 - e) * 260;
  const dive = seg(t, 5.55, 6.0); const ds = 1 + 70 * Math.pow(dive, 3.2);
  composer$.style.transform = `perspective(1800px) translateY(${ty}px) rotateX(${rx}deg) rotateY(${ry + Math.sin(t * 1.1) * 2}deg) scale(${sc})`;
  composer$.style.opacity = clamp((lt - 2.0) / 0.12);
  sheen(composer$, t, 2.35, 1.0);
  // slot machine
  slot.style.width = '760px';
  [...slot.children].forEach((ph, k) => {
    const tin = SLOT[k].t, tout = k < SLOT.length - 1 ? SLOT[k + 1].t : 99;
    [...ph.children].forEach((sp, j) => {
      const din = seg(t, tin - 0.1 + j * 0.012, tin + 0.16 + j * 0.012), dout = seg(t, tout - 0.1 + j * 0.008, tout + 0.08 + j * 0.008);
      const y = (1 - eOutBack(din, 1.6)) * 90 - eInCubic(dout) * 90;
      const bl = (1 - din) * 10 + dout * 10;
      sp.style.transform = `translateY(${y}px) rotateX(${(1 - din) * -70 + dout * 70}deg)`;
      sp.style.filter = bl > 0.2 ? `blur(${bl}px)` : 'none';
      sp.style.opacity = din * (1 - dout);
    });
  });
  // caret after the current phrase
  const cur = SLOT.reduce((a, s, k) => (t >= s.t - 0.05 ? k : a), 0);
  const w = slot.children[cur].getBoundingClientRect().width / Math.max(0.01, sc);
  const q = $('#ask .q');
  const caret = $('#ask .caret');
  const base = q.offsetLeft + slot.offsetLeft;
  caret.style.left = base + (t < SLOT[0].t - 0.05 ? 0 : slot.children[cur].scrollWidth) + 10 + 'px';
  caret.style.opacity = Math.floor(t * 4) % 2 ? 0.2 : 1;
  // orb press + ring
  const orb = $('#ask .orb'); const press = t >= 5.5 ? 1 - 0.14 * Math.exp(-(t - 5.5) * 14) * Math.sin(Math.min(1, (t - 5.5) * 10) * Math.PI) : 1;
  orb.style.transform = `scale(${press * (1 + 0.04 * Math.sin(t * 6))})`;
  orb.style.filter = t > 5.5 ? `brightness(${1 + 0.8 * Math.exp(-(t - 5.5) * 6)})` : 'none';
  const ob = { x: 410 + 1100 - 36 - 46, y: 400 + 280 - 28 - 46 };
  const ring = $('#ask .ring'); const ru = seg(t, 5.5, 6.0); const rr = 46 + eOutExpo(ru) * 1400;
  ring.style.cssText = `left:${ob.x - rr}px;top:${ob.y - rr}px;width:${rr * 2}px;height:${rr * 2}px;opacity:${t >= 5.5 ? (1 - ru) : 0};border-width:${3 + (1 - ru) * 6}px`;
  // cursor
  const cu = eInOut(seg(t, 4.85, 5.38)); const cursor = $('#ask .cursor');
  cursor.style.left = lerp(1650, ob.x + 10, cu) + 'px'; cursor.style.top = lerp(1010, ob.y + 6, cu) + 'px';
  cursor.style.opacity = t > 4.85 && t < 5.7 ? 1 : 0; cursor.style.transform = `scale(${t > 5.47 && t < 5.6 ? 0.82 : 1})`;
  // chips orbit then get blown out by the shockwave
  chips.forEach((c, i) => {
    const ein = eOutExpo(seg(t, 2.1 + i * 0.07, 2.9 + i * 0.07));
    const blow = eInCubic(seg(t, 5.5, 5.95));
    const fx = c.x * lerp(2.4, 1, ein) * (1 + blow * 1.6) + Math.sin(t * 0.9 + i) * 18, fy = c.y * lerp(2.4, 1, ein) * (1 + blow * 1.6) + Math.cos(t * 0.7 + i * 2) * 14;
    c.d.style.transform = `translate(${960 + fx - c.d.offsetWidth / 2}px, ${540 + fy - 32}px) perspective(900px) rotateY(${(c.x > 0 ? -1 : 1) * (18 + (1 - ein) * 50)}deg) rotateX(${(c.y > 0 ? 1 : -1) * 10}deg) scale(${c.s})`;
    c.d.style.opacity = ein * (1 - blow);
    sheen(c.d, t, 3.0 + i * 0.25, 0.8);
  });
  // dive into the orb
  L.ask.style.transformOrigin = `${ob.x}px ${ob.y}px`;
  L.ask.style.transform = `scale(${ds})`;
}

// pair setup
const tilesEl = $('#pair .tiles');
const tiles = [...CODE].map((ch, i) => { const d = document.createElement('div'); d.className = 'glass tile'; d.innerHTML = `<span class="ch"></span><div class="seam"></div>`; tilesEl.appendChild(d); const x = 420 + i * 174 + (i >= 3 ? 60 : 0); d.style.left = x + 'px'; liquid(d, { w: 150, h: 196, r: 28, strength: 50, band: 30, blur: 12 }); return d; });
const n1 = $('#pair .n1'), n2 = $('#pair .n2'), st$ = $('#pair .status');
for (const n of [n1, n2]) liquid(n, { w: Math.ceil(n.getBoundingClientRect().width), h: 92, r: 30, strength: 45, band: 26, blur: 14 }); liquid(st$, { w: 300, h: 56, r: 28, strength: 30, band: 18, blur: 12 });
const pk$ = $('#pair .pkts'); for (let i = 0; i < 6; i++) pk$.insertAdjacentHTML('beforeend', '<div class="pkt"></div>');
const GLY = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function updatePair(t) {
  $('#pair .label').style.opacity = seg(t, 6.0, 6.3); $('#pair .label').style.letterSpacing = lerp(1.2, 0.5, eOutExpo(seg(t, 6, 6.8))) + 'em';
  tiles.forEach((d, i) => {
    const land = CODE_LAND(i); const ein = springT(t, 6.0 + i * 0.04, 1.8, 7);
    const ch = d.firstChild;
    if (t < land) { const k = Math.floor(t / 0.04) + i * 7; ch.textContent = GLY[(k * 13) % GLY.length]; ch.style.transform = `rotateX(${((t / 0.04) % 1) * 90}deg)`; ch.style.color = 'rgba(255,255,255,.5)'; }
    else { ch.textContent = CODE[i]; const b = springT(t, land, 3, 9); ch.style.transform = `scale(${1 + (1 - b) * 0.35})`; ch.style.color = '#fff'; ch.style.textShadow = `0 0 ${30 * Math.exp(-(t - land) * 3)}px #a67cff`; }
    d.style.transform = `translateY(${(1 - ein) * 120}px) perspective(800px) rotateY(${(i - 2.5) * -5}deg)`;
    d.style.opacity = clamp((t - 6.0 - i * 0.04) / 0.1);
    sheen(d, t, 6.95 + i * 0.05, 0.6);
  });
  const nin = eOutExpo(seg(t, 6.85, 7.25));
  n1.style.left = lerp(-500, 250, nin) + 'px'; n2.style.left = lerp(1920 + 100, 1920 - 250 - n2.offsetWidth, nin) + 'px';
  const x0 = 250 + n1.offsetWidth, x1 = 1920 - 250 - n2.offsetWidth;
  const beam = $('#pair .beam'); beam.style.left = x0 + 'px'; beam.style.width = x1 - x0 + 'px'; beam.style.transform = `scaleX(${eOutExpo(seg(t, 7.05, 7.4))})`;
  [...pk$.children].forEach((p, i) => { const u = seg(t, 7.1 + i * 0.083, 7.45 + i * 0.083); const dir = i % 2 ? -1 : 1; p.style.left = (dir > 0 ? lerp(x0, x1, eInOut(u)) : lerp(x1, x0, eInOut(u))) - 7 + 'px'; p.style.opacity = u > 0 && u < 1 ? 1 : 0; });
  const sin = springT(t, 7.3, 2, 7); st$.style.transform = `scale(${Math.max(0, sin)})`; st$.style.opacity = t > 7.3 ? 1 : 0;
  const push = eInExpo(seg(t, 7.5, 8.0)); L.pair.style.transformOrigin = '960px 745px'; L.pair.style.transform = `scale(${1 + push * 5})`; L.pair.style.opacity = 1 - seg(t, 7.85, 8.0);
}

// hud
const hudBar = $('#hud .bar'); liquid(hudBar, { w: 800, h: 96, r: 48, strength: 50, band: 30, blur: 18 });
function updateHud(t) {
  const ein = springT(t, 8.15, 1.6, 7); const out = eInExpo(seg(t, 11.55, 11.85));
  hudBar.style.transform = `translateY(${(1 - ein) * 200 + out * 200}px)`;
  const k = Math.floor((t - 8) / 0.5) % 3;
  [0, 1, 2].forEach((i) => $('#hud .s' + i).classList.toggle('on', i === k));
  $('#hud .n').textContent = String(Math.round(148 * eOutCubic(seg(t, 8.1, 11.4)))).padStart(3, '0');
  $('#hud .count').style.opacity = seg(t, 8.2, 8.5) * (1 - out); $('#hud .cap').style.opacity = seg(t, 8.3, 8.6) * (1 - out);
  $('#hud .count').style.transform = `translateX(${(1 - eOutExpo(seg(t, 8.2, 8.8))) * 120}px)`;
  sheen(hudBar, t, 9.0, 0.8);
}

// shop
const panel$ = $('#shop .panel'); liquid(panel$, { w: 560, h: 740, r: 44, strength: 90, band: 60, blur: 24 });
const EGGS = [['Common Egg', 'COMMON', '250', 'radial-gradient(circle at 35% 30%, #fff, #e6dcff 40%, #9e86e8)'], ['Lava Egg', 'RARE', '900', 'radial-gradient(circle at 35% 30%, #ffe2a8, #ff7a2a 45%, #a3200a)'], ['Void Egg', 'LEGENDARY', '2.5k', 'radial-gradient(circle at 35% 30%, #e8dcff, #7a4ff0 40%, #1b0b45)']];
const items = EGGS.map(([nm, rt, pr, bg], i) => { const d = document.createElement('div'); d.className = 'item'; d.style.top = 130 + i * 196 + 'px'; d.innerHTML = `<div class="egg" style="background:${bg}"></div><div><div class="nm">${nm}</div><div class="rt mono">${rt}</div></div><div class="buy"><span class="coin"></span>${pr}</div>`; $('#shop .items').appendChild(d); return d; });
function updateShop(t) {
  const ein = springT(t, 14.0, 1.5, 6.5); const out = eInExpo(seg(t, 15.25, 15.55));
  panel$.style.transform = `perspective(1600px) translateX(${(1 - ein) * 700 + out * 900}px) rotateY(${(1 - ein) * -40 - 8 + out * -30}deg)`;
  sheen(panel$, t, 14.3, 0.9);
  items.forEach((d, i) => { const e = springT(t, 14.25 + i * 0.125, 2, 7); d.style.transform = `translateX(${(1 - e) * 260}px) scale(${0.9 + 0.1 * e})`; d.style.opacity = clamp((t - 14.25 - i * 0.125) / 0.08); });
  const buy = items[0].querySelector('.buy'); const p = t > 15.05 ? Math.exp(-(t - 15.05) * 10) : 0; buy.style.transform = `scale(${1 - 0.12 * p * Math.sin(Math.min(1, (t - 15.05) * 8) * Math.PI)})`; buy.style.filter = `brightness(${1 + p * 0.8})`;
}

// checks
const CARDS = [['Play test', '<b>0</b> errors · <b>0</b> warnings'], ['UI layout check', '<b>0</b> overlaps · <b>0</b> clipped'], ['Build audit', '<b>148</b> / 148 ops verified']];
const cards = CARDS.map(([tt, v], i) => { const d = document.createElement('div'); d.className = 'glass card'; d.style.left = 160 + i * 550 + 'px'; d.innerHTML = `<div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></svg></div><div class="t disp">${tt}</div><div class="v">${v}</div>`; $('#checks .cards').appendChild(d); liquid(d, { w: 500, h: 330, r: 40, strength: 80, band: 50, blur: 22 }); return d; });
const tag$ = $('#checks .tag'); TAG_WORDS.forEach((w) => tag$.insertAdjacentHTML('beforeend', `<span class="${w.w === 'prove.' ? 'grad-text' : ''}">${w.w}</span>`));
function updateChecks(t) {
  const away = eInCubic(seg(t, 19.92, 20.12));
  cards.forEach((d, i) => {
    const at = CHECK_SLAMS[i]; const u = seg(t, at, at + 0.24); const e = eOutBack(u, 1.4);
    const sc = lerp(2.8, 1, e) * (1 - away * 0.3);
    d.style.transform = `perspective(1400px) translateZ(${-away * 400}px) rotateY(${(i - 1) * -16 + (1 - e) * (i - 1) * -30}deg) rotateX(${(1 - e) * 20}deg) scale(${sc})`;
    d.style.opacity = clamp((t - at) / 0.06) * (1 - away);
    d.style.filter = (1 - u) * 18 + away * 16 > 0.3 ? `blur(${(1 - u) * 18 + away * 16}px)` : 'none';
    d.querySelector('path').style.strokeDashoffset = 1 - eOutCubic(seg(t, at + 0.16, at + 0.42));
    sheen(d, t, 19.4 + i * 0.12, 0.45);
  });
  const lz = $('#checks .laser'); const lu = seg(t, 19.4, 19.9); lz.style.left = lerp(80, 1840, eInOut(lu)) + 'px'; lz.style.opacity = lu > 0 && lu < 1 ? 1 : 0;
  [...tag$.children].forEach((s, i) => {
    const at = TAG_WORDS[i].t; const u = seg(t, at, at + 0.14); const e = eOutBack(u, 1.2);
    s.style.transform = `scale(${lerp(3.2, 1, e)}) translateY(${(1 - e) * 20}px)`; s.style.opacity = clamp((t - at) / 0.05);
    s.style.filter = u < 1 ? `blur(${(1 - u) * 14}px)` : 'none';
  });
  const imp = eInExpo(seg(t, 21.4, 21.98));
  tag$.style.transform = `scale(${1 + (t - 20) * 0.04 - imp * 1.0}) rotate(${imp * -25}deg)`;
  tag$.style.filter = imp > 0.02 ? `blur(${imp * 12}px) brightness(${1 + imp * 3})` : 'none';
  tag$.style.opacity = 1 - seg(t, 21.85, 21.98);
}

// logo
const word$ = $('#logo .word'); [...'StudPilot'].forEach((c) => word$.insertAdjacentHTML('beforeend', `<span>${c}</span>`));
const url$ = $('#logo .url'); liquid(url$, { w: 300, h: 70, r: 35, strength: 40, band: 24, blur: 14 });
function updateLogoDom(t) {
  const ls = lerp(0.14, -0.045, eOutExpo(seg(t, 23.6, 25.2)));
  word$.style.letterSpacing = ls + 'em';
  [...word$.children].forEach((s, i) => { const at = 23.6 + i * 0.045; const u = seg(t, at, at + 0.5); const e = eOutExpo(u);
    s.style.transform = `translateY(${(1 - e) * 90}px) rotateX(${(1 - e) * 80}deg)`; s.style.opacity = clamp((t - at) / 0.12); s.style.filter = u < 1 ? `blur(${(1 - e) * 18}px)` : 'none'; });
  const sw = seg(t, 27.0, 27.9);
  [...word$.children].forEach((s, i) => { const g = sw > 0 && sw < 1 ? Math.exp(-Math.pow((i / 8) * 1.2 - (sw * 1.6 - 0.2), 2) * 30) : 0; s.style.color = g > 0.05 ? mixHex(0.3 * g) : '#f7f5ff'; s.style.textShadow = `0 0 ${10 + 40 * g}px rgba(166,124,255,${0.35 + 0.6 * g})`; });
  const tg = $('#logo .tagl'); const tu = eOutExpo(seg(t, 25.0, 25.8)); tg.style.opacity = seg(t, 25.0, 25.4); tg.style.transform = `translateY(${(1 - tu) * 30}px)`; tg.style.filter = tu < 1 ? `blur(${(1 - tu) * 10}px)` : 'none';
  const uu = springT(t, 26.2, 1.8, 7); url$.style.transform = `scale(${Math.max(0, uu)})`; url$.style.opacity = t > 26.2 ? 1 : 0; sheen(url$, t, 27.1, 0.7);
  L.logo.style.transform = `scale(${1 + (t - 23.5) * 0.004})`;
}

// cold open
function updateCold(t) {
  const lu = eOutExpo(seg(t, 0.05, 0.6));
  const line = $('#cold .line'); line.style.width = lu * 1500 + 'px'; line.style.opacity = 1 - seg(t, 0.4, 0.7);
  const n = clamp(Math.floor((t - TYPE_START) / TYPE_STEP) + 1, 0, TYPE_TEXT.length);
  $('#cold .tx').textContent = TYPE_TEXT.slice(0, t < TYPE_START ? 0 : n);
  $('#cold .caret').style.opacity = n >= TYPE_TEXT.length && Math.floor(t * 4) % 2 ? 0.15 : 1;
  const typed = $('#cold .typed'); typed.style.opacity = seg(t, 0.25, 0.35);
  const push = eInExpo(seg(t, 1.2, 2.0));
  typed.style.transform = `perspective(900px) translateZ(${(t - 0.3) * 40 + push * 600}px) rotateX(${push * 12}deg)`;
  typed.style.filter = push > 0.02 ? `blur(${push * 8}px)` : 'none';
}

// ---------------------------------------------------------------- frame
let tunnelReady = false;
function render(t) {
  let pass = null;
  if (t < 2) { renderer.setClearColor(0x000000, 1); }
  if (inScene(t, 'ask') || inScene(t, 'pair')) { updateAurora(t, t < 6 ? 'ask' : 'pair'); pass = aur; }
  else if (inScene(t, 'tunnel')) { updateTunnel(t); pass = tun; }
  else if (inScene(t, 'build')) { updateBuild(t); pass = bld; }
  else if (inScene(t, 'checks')) { updateAurora(t, 'checks'); pass = aur; }
  else if (inScene(t, 'logo')) { updateLogo(t); pass = lg; }
  if (pass) { renderPass.scene = pass.scene; renderPass.camera = pass.cam; composer.render(); }
  else { renderer.setRenderTarget(null); renderer.clear(); }
  show('cold', t < 2.0); if (t < 2) updateCold(t);
  show('ask', inScene(t, 'ask')); if (inScene(t, 'ask')) updateAsk(t);
  show('pair', inScene(t, 'pair')); if (inScene(t, 'pair')) updatePair(t);
  show('hud', t >= 8.1 && t < 11.9); if (t >= 8.1 && t < 11.9) updateHud(t);
  show('shop', t >= 13.95 && t < 15.6); if (t >= 13.95 && t < 15.6) updateShop(t);
  show('checks', inScene(t, 'checks')); if (inScene(t, 'checks')) updateChecks(t);
  show('logo', t >= 23.5); if (t >= 23.5) updateLogoDom(t);
}

window.seek = async (t) => { render(t); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return true; };

(async () => {
  await Promise.all(['600 50px "DejaVu Sans Mono"', '500 44px Inter', '800 110px "Inter Display"', '600 64px "Inter Display"'].map((f) => document.fonts.load(f)));
  buildTunnel(); buildWorld(); buildLogo();
  // compile every scene once so the first real frame of each is not a cold start
  for (const t of [3, 9, 13, 19, 23]) render(t);
  window.ready = true;
})();
