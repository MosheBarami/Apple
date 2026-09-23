// Motion for the HQ, re-implemented from the site (apps/site/src/components/picks): the "lines"
// noise field (same noise, seed and constants as noise-field.ts), rolling digits, the nav scramble,
// the pointer spotlight, sparklines and the staggered reveal. Every effect is static under
// prefers-reduced-motion and idle when its element is off screen or the tab is hidden.
import { raw, esc } from './ui.js';

const RM = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') ?? { matches: true }; // node (tests) has no matchMedia
export const reduced = () => RM.matches;

// ---------- noise (Perlin improved noise, seed 1337 — identical to the site's noise.ts) ----------
const perm = new Uint8Array(512);
(() => {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = 1337;
  for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
})();
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;
function grad(h, x, y, z) {
  const k = h & 15; const u = k < 8 ? x : y; const v = k < 4 ? y : k === 12 || k === 14 ? x : z;
  return ((k & 1) ? -u : u) + ((k & 2) ? -v : v);
}
function noise3(x, y, z) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  const u = fade(x), v = fade(y), w = fade(z);
  const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z, B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
  return lerp(
    lerp(lerp(grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z), u), lerp(grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z), u), v),
    lerp(lerp(grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1), u), lerp(grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1), u), v), w);
}

const rgb = (c) => {
  const m = String(c).trim().match(/^#([\da-f]{6})$/i);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  const n = String(c).match(/[\d.]+/g); return n ? n.slice(0, 3).map(Number) : [60, 60, 70];
};

// ---------- the "lines" field (React Bits "Waves" as the site re-implemented it) ----------
const fields = new Set();
export function mountField(host) {
  if (!host || host._nf) return; host._nf = true;
  const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true'); canvas.dataset.fx = ''; host.prepend(canvas);
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  const area = host.parentElement || host;
  const XG = 12, YG = 28;
  let W = 0, H = 0, dpr = 1, cols = 0, rows = 0, ink = [59, 61, 70];
  let px, py, cx, cy, vx, vy;
  const P = { x: -9999, y: -9999, sx: -9999, sy: -9999, lx: 0, ly: 0, speed: 0, angle: 0, on: false };
  const colours = () => { ink = rgb(getComputedStyle(document.documentElement).getPropertyValue('--line-strong') || '#3b3d46'); };
  const resize = () => {
    W = host.clientWidth; H = host.clientHeight; if (!W || !H) return;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    cols = Math.ceil((W + 200) / XG) + 1; rows = Math.ceil((H + 60) / YG) + 1;
    const n = cols * rows;
    px = new Float32Array(n); py = new Float32Array(n); cx = new Float32Array(n); cy = new Float32Array(n); vx = new Float32Array(n); vy = new Float32Array(n);
    const x0 = (W - XG * (cols - 1)) / 2, y0 = (H - YG * (rows - 1)) / 2;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) { const k = i * rows + j; px[k] = x0 + XG * i; py[k] = y0 + YG * j; }
  };
  const draw = (t, live) => {
    if (!W || !H) return;
    if (live) {
      P.sx += (P.x - P.sx) * 0.1; P.sy += (P.y - P.sy) * 0.1;
      const dx = P.x - P.lx, dy = P.y - P.ly;
      P.speed += (Math.min(100, Math.hypot(dx, dy)) - P.speed) * 0.1;
      if (dx || dy) P.angle = Math.atan2(dy, dx);
      P.lx = P.x; P.ly = P.y;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = `rgba(${ink[0]},${ink[1]},${ink[2]},0.6)`; ctx.lineWidth = 1; ctx.beginPath();
    const R = Math.max(170, P.speed);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const k = i * rows + j;
      const mv = noise3((px[k] + t * 12) * 0.002, (py[k] + t * 5) * 0.0015, 0.5) * 12;
      if (live) {
        const dx = px[k] - P.sx, dy = py[k] - P.sy, d = Math.hypot(dx, dy);
        if (P.on && d < R) { const f = (1 - d / R) * Math.cos(d * 0.001); vx[k] += Math.cos(P.angle) * f * R * P.speed * 0.00065; vy[k] += Math.sin(P.angle) * f * R * P.speed * 0.00065; }
        vx[k] = (vx[k] - cx[k] * 0.005) * 0.925; vy[k] = (vy[k] - cy[k] * 0.005) * 0.925;
        cx[k] = Math.max(-100, Math.min(100, cx[k] + vx[k] * 2)); cy[k] = Math.max(-100, Math.min(100, cy[k] + vy[k] * 2));
      }
      const x = px[k] + Math.cos(mv) * 24 + cx[k], y = py[k] + Math.sin(mv) * 12 + cy[k];
      if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  let raf = 0, t0 = 0, visible = false;
  const frame = (now) => { raf = 0; if (!t0) t0 = now; draw((now - t0) / 1000, true); if (running()) raf = requestAnimationFrame(frame); };
  const running = () => visible && host.isConnected && !reduced() && document.visibilityState === 'visible';
  const sync = () => { if (running()) { if (!raf) raf = requestAnimationFrame(frame); } else { cancelAnimationFrame(raf); raf = 0; if (host.isConnected) draw(0, false); } };
  area.addEventListener('pointermove', (e) => {
    const r = host.getBoundingClientRect(); P.x = e.clientX - r.left; P.y = e.clientY - r.top;
    if (!P.on) { P.sx = P.lx = P.x; P.sy = P.ly = P.y; P.on = true; }
  }, { passive: true });
  area.addEventListener('pointerleave', () => { P.on = false; P.x = P.y = -9999; });
  colours(); resize(); draw(0, false);
  new ResizeObserver(() => { resize(); if (!raf) draw(0, false); }).observe(host);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; host.classList.toggle('is-on', visible); sync(); }).observe(host);
  const entry = { sync, recolour: () => { colours(); if (!raf) draw(0, false); } };
  fields.add(entry);
  const gone = new MutationObserver(() => { if (!host.isConnected) { cancelAnimationFrame(raf); fields.delete(entry); gone.disconnect(); } });
  gone.observe(document.body, { childList: true, subtree: true });
}
export const recolourFields = () => fields.forEach((f) => f.recolour());
RM.addEventListener?.('change', () => fields.forEach((f) => f.sync()));
globalThis.document?.addEventListener('visibilitychange', () => fields.forEach((f) => f.sync()));

// ---------- rolling digits (the site's .rn, 560 ms overshoot) ----------
// Markup: <span class="rn" data-rn="key" data-v="1234">1,234</span>. After each paint, rollAll()
// swaps changed numbers for per-digit columns that roll from the old value to the new one.
const last = new Map();
export function rn(key, value, text) {
  return raw(`<span class="rn" data-rn="${esc(key)}" data-v="${esc(value ?? '')}"><span class="rn-sr">${esc(text)}</span><span class="rn-vis" aria-hidden="true">${esc(text)}</span></span>`);
}
export function rollAll(root = document) {
  for (const el of root.querySelectorAll('.rn[data-rn]')) {
    const key = el.dataset.rn, v = el.dataset.v, prev = last.get(key); last.set(key, v);
    if (prev === undefined || prev === v || reduced()) { if (prev === undefined && !reduced()) countUp(el); continue; }
    const vis = el.querySelector('.rn-vis'); const text = vis.textContent;
    vis.innerHTML = [...text].map((ch, i) => /\d/.test(ch)
      ? `<span class="rn-col" style="--d:${ch};--i:${i}"><span class="rn-strip">${'0123456789'.split('').map((n) => `<span>${n}</span>`).join('')}</span></span>`
      : `<span class="rn-ch">${esc(ch)}</span>`).join('');
    el.classList.remove('rn-go'); void el.offsetWidth; el.classList.add('rn-go');
  }
}
// first paint: a short count-up from zero (the "count-up numbers" of the brief)
function countUp(el) {
  const vis = el.querySelector('.rn-vis'); const text = vis.textContent; const n = Number(el.dataset.v);
  if (!Number.isFinite(n) || !/\d/.test(text)) return;
  const t0 = performance.now(), D = 700, v0 = el.dataset.v;
  const digits = text.replace(/[^\d]/g, '');
  const step = (now) => {
    if (el.dataset.v !== v0) return; // a newer value landed mid-count: its own paint and roll own the text now
    const p = Math.min(1, (now - t0) / D), e = 1 - (1 - p) ** 3;
    let k = 0; const target = Math.round(Number(digits) * e).toString().padStart(digits.length, '0');
    vis.textContent = text.replace(/\d/g, () => target[k++] ?? '0');
    if (p < 1 && vis.isConnected) requestAnimationFrame(step); else vis.textContent = text;
  };
  requestAnimationFrame(step);
}

// ---------- scramble on hover (Hebrew glyphs for Hebrew labels) ----------
const HE = 'אבגדהוזחטיכלמנסעפצקרשת', LA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export function scramble(label) {
  if (reduced() || label._sc) return;
  const text = label.textContent || ''; if (!text.trim()) return;
  const pool = /[֐-׿]/.test(text) ? HE : LA; label._sc = true;
  label.style.display = 'inline-block'; label.style.width = `${label.getBoundingClientRect().width}px`; label.style.whiteSpace = 'nowrap'; label.style.overflow = 'hidden';
  const t0 = performance.now();
  const frame = (now) => {
    const p = Math.min(1, (now - t0) / 500); let out = '';
    for (let i = 0; i < text.length; i++) { const settle = (i / Math.max(1, text.length)) * 0.85 + 0.15; out += text[i] === ' ' || p >= settle ? text[i] : pool[Math.floor(Math.random() * pool.length)]; }
    label.textContent = out;
    if (p < 1) { requestAnimationFrame(frame); return; }
    label.textContent = text; label.style.display = label.style.width = label.style.whiteSpace = label.style.overflow = ''; label._sc = false;
  };
  requestAnimationFrame(frame);
}

// ---------- spotlight border: cards follow the pointer with a 320px radial ----------
globalThis.document?.addEventListener('pointermove', (e) => {
  const c = e.target.closest?.('.spot'); if (!c) return;
  const r = c.getBoundingClientRect(); c.style.setProperty('--mx', `${e.clientX - r.left}px`); c.style.setProperty('--my', `${e.clientY - r.top}px`);
}, { passive: true });

// ---------- sparkline (drawn in with pathLength; time runs left to right) ----------
export function spark(values, { w = 120, h = 32, cls = '', area = true, label = '' } = {}) {
  const v = (values || []).map((x) => (Number.isFinite(+x) ? +x : 0));
  if (v.length < 2) return raw(`<svg class="spark ${cls}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><line x1="0" x2="${w}" y1="${h - 2}" y2="${h - 2}" class="spark-base"/></svg>`);
  const max = Math.max(...v), min = Math.min(0, ...v), span = max - min || 1;
  const pts = v.map((y, i) => [(i / (v.length - 1)) * w, h - 3 - ((y - min) / span) * (h - 6)]);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  const [lx, ly] = pts[pts.length - 1];
  return raw(`<svg class="spark ${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"'}>
    ${area ? `<path class="spark-area" d="${d}L${w} ${h}L0 ${h}Z"/>` : ''}<path class="spark-line" d="${d}" pathLength="1"/><circle class="spark-dot" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.2"/></svg>`);
}

// ---------- page / skin transition ----------
// View Transitions where the browser has them; otherwise a short cross-fade of the whole app.
export function transition(fn) {
  if (reduced()) { fn(); return null; }
  if (document.startViewTransition) return document.startViewTransition(fn);
  const r = document.documentElement; fn();
  r.classList.remove('xfade'); void r.offsetWidth; r.classList.add('xfade');
  setTimeout(() => r.classList.remove('xfade'), 320);
  return null;
}

// ---------- morph: the animated diff of a quiet refresh ----------
// Patches `el`'s children to match `markup` in place, so what did not change is not touched (focus,
// scroll, running canvases). Children keyed with data-k are matched by key: a new key slides in
// (.is-in), a vanished one fades out (.is-out) before it is removed. data-keep elements belong to a
// live widget and are left alone; data-fx children are injected by effects and are skipped.
const TRANSIENT = ['is-on', 'rn-go', 'is-in'];
const kOf = (n) => (n.nodeType === 1 ? n.getAttribute('data-k') : null);
const skip = (n) => n.nodeType === 1 && (n.hasAttribute('data-fx') || n.classList.contains('is-out'));
export function morph(el, markup) {
  const t = document.createElement('template'); t.innerHTML = markup;
  kids(el, t.content);
}
function kids(from, to) {
  const old = [...from.childNodes].filter((n) => !skip(n));
  const keyed = new Map(); for (const n of old) { const k = kOf(n); if (k != null) keyed.set(k, n); }
  const used = new Set(); const next = []; let i = 0;
  for (const nn of [...to.childNodes]) {
    const k = kOf(nn); let m = null;
    if (k != null) { const c = keyed.get(k); if (c && c.tagName === nn.tagName && !used.has(c)) m = c; } else {
      while (i < old.length && (used.has(old[i]) || kOf(old[i]) != null)) i++;
      const c = old[i];
      if (c && c.nodeType === nn.nodeType && (c.nodeType !== 1 || c.tagName === nn.tagName)) { m = c; i++; }
    }
    if (m) { used.add(m); patch(m, nn); next.push(m); } else { if (k != null && keyed.size && nn.nodeType === 1 && !reduced()) nn.classList.add('is-in'); next.push(nn); }
  }
  for (const n of old) {
    if (used.has(n)) continue;
    if (kOf(n) != null && !reduced() && n.nodeType === 1) { n.classList.add('is-out'); setTimeout(() => n.remove(), 260); } else n.remove();
  }
  let cur = from.firstChild;
  for (const n of next) {
    while (cur && cur !== n && skip(cur)) cur = cur.nextSibling;
    if (cur === n) { cur = cur.nextSibling; continue; }
    from.insertBefore(n, cur);
  }
}
function patch(a, b) {
  if (a.nodeType !== 1) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
  if (a.hasAttribute('data-keep') && b.hasAttribute('data-keep') && a.getAttribute('data-keep') === b.getAttribute('data-keep')) return;
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name) && !(name === 'open' && a.tagName === 'DETAILS') && name !== 'style') a.removeAttribute(name);
  for (const { name, value } of [...b.attributes]) {
    if (name === 'class') { const keep = TRANSIENT.filter((c) => a.classList.contains(c)); const v = [value, ...keep].join(' ').trim(); if (a.getAttribute('class') !== v) a.setAttribute('class', v); continue; }
    if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  }
  if (b.hasAttribute('style') && a.getAttribute('style') !== b.getAttribute('style')) a.setAttribute('style', b.getAttribute('style'));
  if ((a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT') && a === document.activeElement) return;
  kids(a, b);
}
