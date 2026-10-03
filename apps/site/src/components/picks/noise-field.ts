/*
 * ONE NOISE FIELD, THREE WAYS OF DRAWING IT — four of the owner's picks merged into one engine.
 *
 *   lines    React Bits "Waves": vertical threads bent by a slow noise current; the pointer
 *            drags them and they spring back.
 *   bricks   React Bits "Shape Waves": a grid of small squares (Roblox bricks) whose size rides
 *            the same current; the ones near the pointer grow and turn the accent blue.
 *   contours React Bits "Topography" drawn through React Bits "Dither": elevation bands of a
 *            morphing field as contour lines, the high ground shaded with a 4x4 ordered dither,
 *            rendered at a quarter resolution and scaled up pixelated. The pointer raises a hill.
 *
 * The picks' sources are "MIT + Commons Clause" WebGL demos. None of their code is used: this is
 * a 2D-canvas re-implementation of what each one does, on the site's own noise (./noise.ts), in
 * the site's own tokens. Every rule in ./motion.ts applies: static under reduced motion, idle off
 * screen, redrawn in the new colours when the theme flips.
 */
import { BAYER4, fbm3, noise3 } from './noise';
import { loop, onMotionChange, onThemeChange, reducedMotion, rgb, token, whileVisible } from './motion';

type Mode = 'lines' | 'bricks' | 'contours';

interface Pointer { x: number; y: number; sx: number; sy: number; lx: number; ly: number; speed: number; angle: number; on: boolean; }

export function mountFields(): void {
  for (const host of document.querySelectorAll<HTMLElement>('[data-nf]')) {
    try { mount(host); } catch (err) { console.error('noise field failed', err); }
  }
}

function mount(host: HTMLElement): void {
  const mode = (host.dataset.nf || 'lines') as Mode;
  const canvas = host.querySelector('canvas');
  const ctx = canvas && canvas.getContext('2d');
  if (!canvas || !ctx) return;
  const area = host.parentElement || host;

  let W = 0, H = 0, dpr = 1;
  let ink: [number, number, number] = [60, 60, 70];
  let soft: [number, number, number] = [40, 40, 48];
  let accent: [number, number, number] = [91, 124, 250];
  const P: Pointer = { x: -9999, y: -9999, sx: -9999, sy: -9999, lx: 0, ly: 0, speed: 0, angle: 0, on: false };

  const readColours = () => {
    ink = rgb(token('--line-strong', '#3b3d46'));
    soft = rgb(token('--line', '#2e2e2e'));
    accent = rgb(token('--accent', '#5b7cfa'));
  };

  /* ---------------------------------------------------------------- lines (Waves) */
  const XG = 12, YG = 28;
  let cols = 0, rows = 0;
  let px = new Float32Array(0), py = new Float32Array(0), cx = new Float32Array(0), cy = new Float32Array(0), vx = new Float32Array(0), vy = new Float32Array(0);

  const setLines = () => {
    cols = Math.ceil((W + 200) / XG) + 1;
    rows = Math.ceil((H + 60) / YG) + 1;
    const n = cols * rows;
    px = new Float32Array(n); py = new Float32Array(n);
    cx = new Float32Array(n); cy = new Float32Array(n); vx = new Float32Array(n); vy = new Float32Array(n);
    const x0 = (W - XG * (cols - 1)) / 2, y0 = (H - YG * (rows - 1)) / 2;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const k = i * rows + j; px[k] = x0 + XG * i; py[k] = y0 + YG * j;
    }
  };

  const drawLines = (t: number, live: boolean) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = `rgba(${ink[0]},${ink[1]},${ink[2]},0.6)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const R = Math.max(170, P.speed);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const k = i * rows + j;
        const mv = noise3((px[k] + t * 12) * 0.002, (py[k] + t * 5) * 0.0015, 0.5) * 12;
        if (live) {
          const dx = px[k] - P.sx, dy = py[k] - P.sy, d = Math.hypot(dx, dy);
          if (P.on && d < R) {
            const f = (1 - d / R) * Math.cos(d * 0.001);
            vx[k] += Math.cos(P.angle) * f * R * P.speed * 0.00065;
            vy[k] += Math.sin(P.angle) * f * R * P.speed * 0.00065;
          }
          vx[k] = (vx[k] - cx[k] * 0.005) * 0.925;
          vy[k] = (vy[k] - cy[k] * 0.005) * 0.925;
          cx[k] = Math.max(-100, Math.min(100, cx[k] + vx[k] * 2));
          cy[k] = Math.max(-100, Math.min(100, cy[k] + vy[k] * 2));
        }
        const x = px[k] + Math.cos(mv) * 24 + cx[k];
        const y = py[k] + Math.sin(mv) * 12 + cy[k];
        if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  };

  /* ---------------------------------------------------------------- bricks (Shape Waves) */
  const CELL = 16;
  const drawBricks = (t: number) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const R = 170;
    const nx = Math.ceil(W / CELL), ny = Math.ceil(H / CELL);
    const ox = (W - nx * CELL) / 2, oy = (H - ny * CELL) / 2;
    const base = `rgb(${ink[0]},${ink[1]},${ink[2]})`;
    const hot = `rgb(${accent[0]},${accent[1]},${accent[2]})`;
    for (let pass = 0; pass < 2; pass++) {
      ctx.fillStyle = pass === 0 ? base : hot;
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        const x = ox + (i + 0.5) * CELL, y = oy + (j + 0.5) * CELL;
        const n = fbm3(x * 0.0045, y * 0.0045 - t * 0.05, t * 0.08) * 0.5 + 0.5;
        const d = P.on ? Math.hypot(x - P.sx, y - P.sy) : 1e9;
        const near = d < R ? 1 - d / R : 0;
        const isHot = near > 0.35;
        if ((pass === 1) !== isHot) continue;
        const s = Math.min(0.62, Math.pow(n, 2.2) * 0.75 + near * 0.35) * CELL;
        if (s < 1.2) continue;
        ctx.globalAlpha = isHot ? 0.18 + near * 0.32 : 0.22 + n * 0.4;
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
  };

  /* ---------------------------------------------------------------- contours (Topography + Dither) */
  const PX = 4, BANDS = 7;
  let img: ImageData | null = null;
  let elev = new Float32Array(0);
  const drawContours = (t: number) => {
    const w = canvas.width, h = canvas.height;
    if (!img || img.width !== w || img.height !== h) { img = ctx.createImageData(w, h); elev = new Float32Array(w * h); }
    const d = img.data;
    const hill = P.on ? 1 : 0;
    const hx = P.sx / PX, hy = P.sy / PX, hr = 42;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let e = fbm3(x * 0.012, y * 0.018, t * 0.04) * 0.5 + 0.5;
        if (hill) {
          const dx = x - hx, dy = y - hy;
          e += 0.22 * Math.exp(-(dx * dx + dy * dy) / (hr * hr));
        }
        elev[y * w + x] = e;
      }
    }
    /* A contour is where the band changes between neighbouring cells, so every line is one cell
       wide however steep or flat the ground is. */
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const e = elev[i];
        const b = Math.floor(e * BANDS);
        const line = (x + 1 < w && Math.floor(elev[i + 1] * BANDS) !== b) || (y + 1 < h && Math.floor(elev[i + w] * BANDS) !== b);
        const high = Math.max(0, Math.min(1, (e - 0.55) / 0.35));
        const dot = !line && high * 0.55 > BAYER4[(x & 3) + ((y & 3) << 2)];
        const c = line ? ink : soft;
        const o = i * 4;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2];
        d[o + 3] = line ? 190 : dot ? 130 : 0;
      }
    }
    ctx.putImageData(img, 0, 0);
  };

  /* ---------------------------------------------------------------- shared */
  const resize = () => {
    W = host.clientWidth; H = host.clientHeight;
    if (!W || !H) return;
    if (mode === 'contours') {
      canvas.width = Math.ceil(W / PX); canvas.height = Math.ceil(H / PX);
    } else {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      if (mode === 'lines') setLines();
    }
  };

  let frameNo = 0;
  const draw = (t: number, live: boolean) => {
    if (!W || !H) return;
    if (live) {
      P.sx += (P.x - P.sx) * 0.1; P.sy += (P.y - P.sy) * 0.1;
      const dx = P.x - P.lx, dy = P.y - P.ly;
      P.speed += (Math.min(100, Math.hypot(dx, dy)) - P.speed) * 0.1;
      if (dx || dy) P.angle = Math.atan2(dy, dx);
      P.lx = P.x; P.ly = P.y;
    }
    if (mode === 'lines') drawLines(t, live);
    else if (mode === 'bricks') drawBricks(t);
    else if (live ? frameNo++ % 3 === 0 : true) drawContours(t);
  };

  const ticker = loop((t) => draw(t, true));
  let visible = false;
  const still = () => draw(0, false);
  const sync = () => {
    if (visible && !reducedMotion()) ticker.start();
    else { ticker.stop(); if (visible) still(); }
  };

  area.addEventListener('pointermove', (e) => {
    const r = host.getBoundingClientRect();
    P.x = e.clientX - r.left; P.y = e.clientY - r.top;
    if (!P.on) { P.sx = P.lx = P.x; P.sy = P.ly = P.y; P.on = true; }
  }, { passive: true });
  area.addEventListener('pointerleave', () => { P.on = false; P.x = P.y = -9999; });

  readColours();
  resize();
  if ('ResizeObserver' in window) new ResizeObserver(() => { resize(); if (!ticker.running) still(); }).observe(host);
  onThemeChange(() => { readColours(); if (!ticker.running) still(); });
  onMotionChange(sync);
  whileVisible(host, () => { visible = true; host.classList.add('is-on'); sync(); }, () => { visible = false; sync(); });
}
