// Shared helpers for the control center: safe HTML templating, he-IL formatting,
// status lights, failure cards and small hand-rolled SVG charts. No dependencies.

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s ?? ''));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const val = (v) => (v == null || v === false ? '' : v instanceof Raw ? v.s : Array.isArray(v) ? v.map(val).join('') : esc(v));
/** Tagged template: interpolations are escaped unless wrapped in raw() or produced by html``. */
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s; if (i < vals.length) out += val(vals[i]); });
  return new Raw(out);
}

// ---------- formatting (he-IL) ----------
const NF = new Intl.NumberFormat('he-IL');
const RTF = new Intl.RelativeTimeFormat('he', { numeric: 'auto' });
export const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
export const num = (n, digits) => (isNum(n) ? (digits == null ? NF.format(n) : new Intl.NumberFormat('he-IL', { maximumFractionDigits: digits }).format(n)) : '—');
export const compact = (n) => (isNum(n) ? new Intl.NumberFormat('he-IL', { notation: 'compact', maximumFractionDigits: 1 }).format(n) : '—');
/** share may arrive as a fraction (0..1) or a percentage (0..100). */
export const toFrac = (s) => (isNum(s) ? (s > 1 ? s / 100 : s) : null);
export const pct = (s, digits = 0) => { const f = toFrac(s); return f == null ? '—' : `${num(f * 100, digits)}%`; };
export function bytes(n) {
  if (!isNum(n)) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `\u2066${num(v, v < 10 && i ? 1 : 0)} ${u[i]}\u2069`; // isolated so RTL text keeps "224 KB" in order
}
const toDate = (d) => { if (d == null || d === '') return null; const t = typeof d === 'number' ? new Date(d < 1e12 ? d * 1000 : d) : new Date(d); return Number.isNaN(t.getTime()) ? null : t; };
export function rel(d) {
  const t = toDate(d); if (!t) return '—';
  const s = Math.round((t.getTime() - Date.now()) / 1000); const a = Math.abs(s);
  if (a < 45) return 'עכשיו';
  if (a < 3600) return RTF.format(Math.round(s / 60), 'minute');
  if (a < 86400) return RTF.format(Math.round(s / 3600), 'hour');
  if (a < 86400 * 30) return RTF.format(Math.round(s / 86400), 'day');
  if (a < 86400 * 365) return RTF.format(Math.round(s / (86400 * 30)), 'month');
  return RTF.format(Math.round(s / (86400 * 365)), 'year');
}
export function when(d) {
  const t = toDate(d); if (!t) return '—';
  return t.toLocaleString('he-IL', { day: 'numeric', month: 'short', year: t.getFullYear() === new Date().getFullYear() ? undefined : 'numeric', hour: '2-digit', minute: '2-digit' });
}
export const fullDate = (d) => { const t = toDate(d); return t ? t.toLocaleString('he-IL') : ''; };
/** <time> element: relative text, absolute date on hover. */
export const ago = (d) => (toDate(d) ? html`<time datetime="${toDate(d).toISOString()}" title="${fullDate(d)}">${rel(d)}</time>` : html`<span class="faint">—</span>`);
export function agoSeconds(d) {
  const t = toDate(d); if (!t) return '';
  const s = Math.max(0, Math.round((Date.now() - t.getTime()) / 1000));
  if (s < 5) return 'עודכן הרגע';
  if (s < 60) return `עודכן לפני ${num(s)} שניות`;
  if (s < 3600) { const m = Math.round(s / 60); return m === 1 ? 'עודכן לפני דקה' : `עודכן לפני ${num(m)} דקות`; }
  return `עודכן ${rel(d)}`;
}
export function duration(sec) {
  if (!isNum(sec)) return '—';
  if (sec < 60) return `${num(Math.round(sec))} שנ׳`;
  const m = Math.floor(sec / 60); const s = Math.round(sec % 60);
  if (m < 60) return `${num(m)} דק׳${s ? ` ${num(s)} שנ׳` : ''}`;
  return `${num(Math.floor(m / 60))} שע׳ ${num(m % 60)} דק׳`;
}
export const ltr = (s, cls = '') => html`<bdi class="ltr ${cls}">${s}</bdi>`;
export const short = (sha) => (sha ? String(sha).slice(0, 7) : '');
export const count = (x) => (Array.isArray(x) ? x.length : isNum(x) ? x : null);
export const arr = (x) => (Array.isArray(x) ? x : []);

// ---------- status ----------
/** state: ok | warn | bad | off. The label is always text, never colour alone. */
export const light = (state, label) => html`<span class="light light-${state}"><i aria-hidden="true"></i>${label}</span>`;
export const isFail = (x) => !!x && typeof x === 'object' && !Array.isArray(x) && x.ok === false;
export function failCard(reason, { title = 'לא הצלחנו להביא את הנתונים', level = 'bad', retry = false } = {}) {
  return html`<div class="fail fail-${level}" role="${level === 'bad' ? 'alert' : 'status'}">
    <div class="fail-ic" aria-hidden="true">${level === 'bad' ? '!' : 'i'}</div>
    <div class="fail-tx"><b>${title}</b><p dir="auto">${reason || 'השרת לא נתן סיבה.'}</p>
    ${retry ? html`<button class="btn btn-sm" data-act="app:refresh">לנסות שוב</button>` : ''}</div></div>`;
}
/** Render a sub-part of a payload that may itself be {ok:false, reason}. */
export function part(x, fn, { title = 'החלק הזה לא זמין כרגע', empty = 'אין כאן נתונים עדיין.' } = {}) {
  if (isFail(x)) return failCard(x.reason, { title, level: 'warn' });
  if (x == null || (Array.isArray(x) && !x.length)) return html`<p class="empty">${empty}</p>`;
  return fn(x);
}
export const brand = (slug, cls = '') => html`<span class="bm ${cls}" aria-hidden="true" style="--m:url('https://cdn.jsdelivr.net/npm/simple-icons@13/icons/${slug}.svg')"></span>`;
export const extLink = (url, label, cls = '') => (url ? html`<a class="${cls}" href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>` : html`<span class="${cls}">${label}</span>`);
export const escAttr = esc;

// ---------- charts (hand-rolled SVG, drawn left-to-right: time runs like a clock-face timeline) ----------
function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v)); const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
const every = (n, want) => Math.max(1, Math.ceil(n / want));

export function ring(frac, { size = 180, stroke = 16, label = '', sub = '', color = 'var(--accent)' } = {}) {
  const f = Math.max(0, Math.min(1, frac ?? 0)); const r = (size - stroke) / 2; const c = 2 * Math.PI * r;
  return html`<div class="ringbox" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="${label} ${sub}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-trk" stroke-width="${stroke}" fill="none"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color}" stroke-width="${stroke}" fill="none" stroke-linecap="round"
        stroke-dasharray="${(c * f).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})" class="ring-val"/>
    </svg>
    <div class="ringc"><b>${label}</b><small>${sub}</small></div></div>`;
}

/** Semi-circle gauge. */
export function gauge(frac, { label = '', sub = '', color = 'var(--p-accent, var(--accent))' } = {}) {
  const f = Math.max(0, Math.min(1, frac ?? 0)); const r = 80; const c = Math.PI * r;
  return html`<div class="gauge"><svg viewBox="0 0 200 112" role="img" aria-label="${label} ${sub}">
    <path d="M20 100 A80 80 0 0 1 180 100" class="ring-trk" stroke-width="16" fill="none" stroke-linecap="round"/>
    <path d="M20 100 A80 80 0 0 1 180 100" stroke="${color}" stroke-width="16" fill="none" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(2)} ${c.toFixed(2)}"/>
  </svg><div class="gauge-c"><b>${label}</b><small>${sub}</small></div></div>`;
}

export const legend = (keys) => html`<div class="legend">${keys.map((k) => html`<span><i style="background:${k.color}"></i>${k.label}</span>`)}</div>`;

/** Stacked bars. rows: [{...}], keys: [{key,label,color}], x: row => label. */
export function bars(rows, keys, { x = (r) => r.day, h = 220, overlay = false, xfmt = (s) => s, tip } = {}) {
  rows = arr(rows);
  if (!rows.length) return html`<p class="empty">אין נתונים לתקופה הזו.</p>`;
  const W = 640; const L = 40; const R = 8; const T = 10; const B = 26; const ih = h - T - B; const iw = W - L - R;
  const tot = (r) => (overlay ? Math.max(...keys.map((k) => +r[k.key] || 0)) : keys.reduce((s, k) => s + (+r[k.key] || 0), 0));
  const max = niceMax(Math.max(...rows.map(tot)));
  const bw = iw / rows.length; const gap = Math.min(6, bw * 0.25);
  const lab = every(rows.length, 8);
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const y = T + ih - (ih * i) / 4;
    g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="grid"/><text x="${L - 6}" y="${y + 4}" class="axis" text-anchor="end">${esc(compact((max * i) / 4))}</text>`;
  }
  rows.forEach((r, i) => {
    const x0 = L + i * bw + gap / 2; let y0 = T + ih; let seg = '';
    for (const k of keys) {
      const v = +r[k.key] || 0; const bh = (ih * v) / max;
      if (overlay) seg += `<rect x="${x0}" y="${T + ih - bh}" width="${Math.max(1, bw - gap)}" height="${bh}" fill="${k.color}" rx="2"/>`;
      else { y0 -= bh; seg += `<rect x="${x0}" y="${y0}" width="${Math.max(1, bw - gap)}" height="${bh}" fill="${k.color}"/>`; }
    }
    const t = tip ? tip(r) : `${x(r)} · ${keys.map((k) => `${k.label}: ${NF.format(+r[k.key] || 0)}`).join(' · ')}`;
    g += `<g class="bar"><title>${esc(t)}</title><rect x="${L + i * bw}" y="${T}" width="${bw}" height="${ih}" fill="transparent"/>${seg}</g>`;
    if (i % lab === 0) g += `<text x="${x0 + (bw - gap) / 2}" y="${h - 8}" class="axis" text-anchor="middle">${esc(xfmt(x(r)))}</text>`;
  });
  return html`<div class="chart"><svg viewBox="0 0 ${W} ${h}" role="img" aria-label="${keys.map((k) => k.label).join(' / ')}">${raw(g)}</svg></div>`;
}

/** Multi-line chart. */
export function lines(rows, keys, { x = (r) => r.week, h = 220, xfmt = (s) => s } = {}) {
  rows = arr(rows);
  if (!rows.length) return html`<p class="empty">אין נתונים לתקופה הזו.</p>`;
  const W = 640; const L = 44; const R = 14; const T = 12; const B = 26; const ih = h - T - B; const iw = W - L - R;
  const max = niceMax(Math.max(...rows.flatMap((r) => keys.map((k) => +r[k.key] || 0))));
  const px = (i) => L + (rows.length === 1 ? iw / 2 : (iw * i) / (rows.length - 1));
  const py = (v) => T + ih - (ih * (+v || 0)) / max;
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const y = T + ih - (ih * i) / 4;
    g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="grid"/><text x="${L - 6}" y="${y + 4}" class="axis" text-anchor="end">${esc(compact((max * i) / 4))}</text>`;
  }
  const lab = every(rows.length, 7);
  rows.forEach((r, i) => { if (i % lab === 0) g += `<text x="${px(i)}" y="${h - 8}" class="axis" text-anchor="middle">${esc(xfmt(x(r)))}</text>`; });
  for (const k of keys) {
    const pts = rows.map((r, i) => `${px(i).toFixed(1)},${py(r[k.key]).toFixed(1)}`).join(' ');
    g += `<polygon points="${L},${T + ih} ${pts} ${px(rows.length - 1)},${T + ih}" fill="${k.color}" opacity=".08"/>`;
    g += `<polyline points="${pts}" fill="none" stroke="${k.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    rows.forEach((r, i) => { g += `<circle cx="${px(i)}" cy="${py(r[k.key])}" r="3.5" fill="${k.color}"><title>${esc(`${x(r)} · ${k.label}: ${NF.format(+r[k.key] || 0)}`)}</title></circle>`; });
  }
  return html`<div class="chart"><svg viewBox="0 0 ${W} ${h}" role="img" aria-label="${keys.map((k) => k.label).join(' / ')}">${raw(g)}</svg></div>`;
}

/** Horizontal bar used in tables (size bars). */
export const meter = (frac, color = 'var(--p-accent, var(--accent))') => html`<span class="meter" aria-hidden="true"><i style="width:${Math.max(frac > 0 ? 2 : 0, Math.min(100, (frac || 0) * 100)).toFixed(1)}%;background:${color}"></i></span>`;

export const shortDay = (s) => { const t = toDate(s); return t ? t.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }) : String(s ?? ''); };
export const hourOf = (s) => { const t = toDate(s); return t ? t.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : String(s ?? ''); };
