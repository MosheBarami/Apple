/*
 * The footer wordmark as particles (see ParticleWord.astro). Adapted from Componentry's "Particle
 * Typography" (MIT): the word is drawn once off screen, every Nth opaque pixel becomes a particle
 * with a home, the pointer pushes particles away within a radius, and each one springs home.
 * Changes from the original: squares instead of arcs (cheaper, and they read as bricks), colours
 * from the site's tokens, and the loop SLEEPS once every particle is home and the pointer has
 * gone, so a footer nobody is touching costs nothing.
 */
import { loop, onMotionChange, onThemeChange, reducedMotion, token, whileVisible } from './motion';

const RADIUS = 110, PUSH = 4, RETURN = 0.08, DAMP = 0.85, SIZE = 1.6;

export function mountParticleWords(): void {
  for (const host of document.querySelectorAll<HTMLElement>('[data-particle-word]')) {
    try { mount(host); } catch (err) { console.error('particle word failed', err); }
  }
}

function mount(host: HTMLElement): void {
  const canvas = host.querySelector('canvas');
  const ctx = canvas && canvas.getContext('2d', { willReadFrequently: true });
  if (!canvas || !ctx) return;
  const text = host.dataset.particleWord || 'Apple';

  let W = 0, H = 0, dpr = 1, colour = '#3b3d46';
  let hx = new Float32Array(0), hy = new Float32Array(0), x = new Float32Array(0), y = new Float32Array(0), vx = new Float32Array(0), vy = new Float32Array(0);
  let mx = -1e6, my = -1e6;

  const build = () => {
    W = host.clientWidth; H = host.clientHeight;
    if (!W || !H) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const family = getComputedStyle(host).fontFamily || 'sans-serif';
    let size = H * 0.92;
    ctx.font = `600 ${size}px ${family}`;
    const w = ctx.measureText(text).width;
    if (w > W * 0.96) size *= (W * 0.96) / w;
    ctx.font = `600 ${size}px ${family}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(text, W / 2, H / 2 + size * 0.04);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const step = Math.max(2, Math.round((W < 600 ? 3 : 4) * dpr));
    const px: number[] = [], py: number[] = [];
    for (let j = 0; j < canvas.height; j += step) {
      for (let i = 0; i < canvas.width; i += step) {
        if (img[(j * canvas.width + i) * 4 + 3] > 128) { px.push(i / dpr); py.push(j / dpr); }
      }
    }
    const n = px.length;
    hx = Float32Array.from(px); hy = Float32Array.from(py);
    x = Float32Array.from(px); y = Float32Array.from(py);
    vx = new Float32Array(n); vy = new Float32Array(n);
    ctx.clearRect(0, 0, W, H);
  };

  const draw = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = colour;
    for (let i = 0; i < hx.length; i++) ctx.fillRect(x[i] - SIZE / 2, y[i] - SIZE / 2, SIZE, SIZE);
  };

  const ticker = loop(() => {
    let moving = 0;
    const live = mx > -1e5;
    for (let i = 0; i < hx.length; i++) {
      if (live) {
        const dx = mx - x[i], dy = my - y[i], d = Math.hypot(dx, dy);
        if (d < RADIUS && d > 0.01) {
          const f = (RADIUS - d) / RADIUS;
          vx[i] -= (dx / d) * f * PUSH;
          vy[i] -= (dy / d) * f * PUSH;
        }
      }
      vx[i] = (vx[i] + (hx[i] - x[i]) * RETURN) * DAMP;
      vy[i] = (vy[i] + (hy[i] - y[i]) * RETURN) * DAMP;
      x[i] += vx[i]; y[i] += vy[i];
      moving = Math.max(moving, Math.abs(vx[i]) + Math.abs(vy[i]));
    }
    draw();
    if (!live && moving < 0.02) ticker.stop();
  });

  let visible = false;
  const wake = () => { if (visible && !reducedMotion()) ticker.start(); };
  const point = (cx: number, cy: number) => {
    const r = canvas.getBoundingClientRect();
    mx = cx - r.left; my = cy - r.top;
    wake();
  };
  const away = () => { mx = my = -1e6; };

  host.addEventListener('pointermove', (e) => point(e.clientX, e.clientY), { passive: true });
  host.addEventListener('pointerleave', away);
  host.addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t) point(t.clientX, t.clientY); }, { passive: true });
  host.addEventListener('touchend', away);

  const repaint = () => { colour = token('--line-strong', '#3b3d46'); draw(); };
  const ready = () => { build(); repaint(); host.classList.add('is-on'); };
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(ready);
  if ('ResizeObserver' in window) {
    let w = 0;
    new ResizeObserver(() => { if (host.clientWidth !== w) { w = host.clientWidth; build(); repaint(); } }).observe(host);
  }
  onThemeChange(repaint);
  onMotionChange(() => { if (reducedMotion()) { ticker.stop(); x.set(hx); y.set(hy); draw(); } });
  whileVisible(host, () => { visible = true; }, () => { visible = false; ticker.stop(); });
}
