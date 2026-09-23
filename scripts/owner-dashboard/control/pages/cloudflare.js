// Cloudflare, drawn like the Cloudflare dashboard (Kumo): Account home with a reference-architecture
// diagram of the account's real resources, Workers & Pages (deployments, versions, ROLLBACK), Storage
// & Databases (read-only D1 console, R2 and KV browsers), AI (Workers AI neurons, AI Gateway logs),
// Analytics and Security (Turnstile, zones, cache purge). Every number comes from /api/cc/cloudflare;
// every write goes through app.act (confirm modal, dry-run plan); the consoles are guarded server-side.
import { html, raw, esc, num, compact, bytes, ago, when, arr, isNum, bars, legend, hourOf, meter } from '../ui.js';
import { rn } from '../fx.js';
import { cf } from '../actions.js';
import { cfx, previous } from '../actions/cloudflare.js';
import { stat, actBtn, swBtn, note } from './kit.js';

const PATH = '/api/cc/cloudflare/action';
const TABS = [['home', 'Account home'], ['workers', 'Workers & Pages'], ['storage', 'Storage & Databases'], ['ai', 'AI'], ['analytics', 'Analytics'], ['security', 'Security']];
const HE = { home: 'סקירת החשבון', workers: 'Workers ו-Pages', storage: 'אחסון ומסדי נתונים', ai: 'בינה מלאכותית', analytics: 'תנועה', security: 'אבטחה' };
const AI_FREE = 10000;
const st = {
  tab: 'home', worker: 'apple',
  d1: { db: '', sql: 'PRAGMA table_list', busy: false, res: null, err: null },
  kv: { ns: '', prefix: '', busy: false, res: null, err: null, back: [] },
  r2: { bucket: '', prefix: '', busy: false, res: null, err: null },
  gw: { id: '', busy: false, res: null, err: null },
};
const en = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const cn = (n) => (isNum(n) ? en.format(n) : '—');
const ms1 = (n) => (isNum(n) ? num(n, n < 10 ? 2 : 1) : '—');
const s8 = (id) => String(id || '').slice(0, 8);
const L = (s, cls = '') => html`<bdi class="cfx-ltr ${cls}" dir="ltr">${s}</bdi>`;
const tabOf = () => { const m = location.hash.match(/^#\/cloudflare\/([\w-]+)/); return m && TABS.some(([k]) => k === m[1]) ? m[1] : 'home'; };

// Product glyphs in Cloudflare's line style (24px box, drawn in the brand orange).
const G = {
  client: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  worker: '<path d="M9 4 3 12l6 8M15 4l6 8-6 8M13 8l-2 8"/>',
  pages: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13.5l2 2 4-4"/>',
  d1: '<ellipse cx="12" cy="6" rx="7" ry="2.8"/><path d="M5 6v12c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8V6M5 12c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8"/>',
  kv: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3.5M21 12v2.5"/>',
  r2: '<path d="M4 7.5h16L18 20H6z"/><ellipse cx="12" cy="7.5" rx="8" ry="2.5"/>',
  vectorize: '<path d="M4 20 19 5M4 20h6M4 20v-6"/><circle cx="15" cy="16" r="1.6"/><circle cx="18" cy="11" r="1.6"/><circle cx="9" cy="8" r="1.6"/>',
  queue: '<path d="M4 7h10M4 12h10M4 17h10M17 8l3 4-3 4"/>',
  do: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  workflow: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 6H14a3 3 0 0 1 0 6h-4a3 3 0 0 0 0 6h5.5"/>',
  ai: '<path d="M12 3.5 13.8 10 20.5 12 13.8 14 12 20.5 10.2 14 3.5 12 10.2 10z"/><path d="M19 3v4M17 5h4"/>',
  gateway: '<path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/>',
  turnstile: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>',
  zone: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  back: '<path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3"/>',
  play: '<path d="M7 5v14l11-7z"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  warn: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
};
const ic = (k, s = 16, cls = '') => raw(`<svg class="cfx-ic ${cls}" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${G[k] || ''}</svg>`);
const badge = (tone, text) => html`<span class="cfx-badge cfx-b-${tone}">${text}</span>`;
const head = (title, sub, extra = '') => html`<div class="cfx-card-h"><div><h3>${title}</h3>${sub ? html`<p>${sub}</p>` : ''}</div>${extra}</div>`;
const empty = (t) => html`<p class="cfx-empty">${t}</p>`;
const errNote = (c, k, what) => (c.errors?.[k] ? note('warn', `${what} לא נקרא`, c.errors[k]) : '');

// ---------------------------------------------------------------- insights banner (server-side)
function insights(c) {
  const list = arr(c.insights); if (!list.length) return '';
  const icn = { bad: 'warn', warn: 'warn', info: 'info', good: 'check' };
  return html`<section class="cfx-ins" aria-label="מה חשוב לדעת עכשיו">${list.map((x, i) => html`<a class="cfx-banner cfx-banner-${x.level}" href="${x.href || '#/cloudflare'}"
    data-k="ins-${i}-${x.level}" style="--i:${i}">${ic(icn[x.level] || 'info', 16)}<div><b>${x.title}</b><p>${x.detail}</p></div></a>`)}</section>`;
}

// ---------------------------------------------------------------- architecture diagram
// Layout: clients → compute → the resources the Workers bind to, stacked by group on the right in two
// sub-columns. The second sub-column sits half a row lower, so a branch into it runs through the gap
// between two nodes of the first: no line crosses a box.
const NW = 184, NH = 52, ROW = 72, XA = 16, XB = 272, XC1 = 560, XC2 = 800, W = 1000;
function graph(c) {
  const ws = arr(c.workers); const nodes = []; const groups = []; const edges = [];
  const tNeurons = c.ai?.neuronsToday;
  const req = ws.reduce((s, w) => s + (w.requests24h || 0), 0);
  const left = [{ id: 'client', ic: 'client', t: 'Clients', m: `${cn(req)} req · 24h`, flow: req }];
  for (const t of arr(c.turnstile)) left.push({ id: `ts:${t.sitekey}`, ic: 'turnstile', t: t.name || 'Turnstile', m: `${cn(Object.values(t.events24h || {}).reduce((a, b) => a + b, 0))} events · Turnstile` });
  const mid = [];
  for (const w of ws) {
    const er = w.requests24h ? (w.errors24h || 0) / w.requests24h : 0;
    mid.push({ id: `w:${w.name}`, ic: 'worker', t: w.name, m: `${cn(w.requests24h)} req · p99 ${ms1(w.cpuP99Ms)} ms`, tone: er >= 0.05 ? 'bad' : er >= 0.01 ? 'warn' : '', live: w.requests24h > 0 });
  }
  for (const p of arr(c.pages)) mid.push({ id: `pg:${p.name}`, ic: 'pages', t: p.name, m: `Pages · ${p.latest?.status || '—'}` });
  // One node per Durable Object class: each Worker that declares the class owns its own namespace.
  const doCls = new Map();
  for (const d of arr(c.durableObjects)) {
    const k = d.className || d.name; const x = doCls.get(k) || { k, n: 0, r: 0, e: 0 };
    x.n++; x.r += d.requests24h || 0; x.e += d.errors24h || 0; doCls.set(k, x);
  }
  const right = [
    ['תיאום · Durable Objects, Queues, Workflows', [
      ...[...doCls.values()].map((d) => ({ id: `do:${d.k}`, ic: 'do', t: d.n > 1 ? `${d.k} ×${d.n}` : d.k, m: `${cn(d.r)} req · ${cn(d.e)} err`, flow: d.r,
        tone: d.r && d.e / d.r >= 0.005 ? 'warn' : '' })),
      ...arr(c.queues).map((q) => ({ id: `q:${q.name}`, ic: 'queue', t: q.name, m: `${cn(q.ops24h)} ops · Queue`, flow: q.ops24h })),
      ...arr(c.workflows).map((w) => ({ id: `wf:${w.name}`, ic: 'workflow', t: w.name, m: `${cn(Object.values(w.instances || {}).reduce((a, b) => a + b, 0))} runs · Workflow`,
        tone: w.instances?.errored ? 'warn' : '' }))]],
    ['אחסון · D1, KV, R2, Vectorize', [
      ...arr(c.d1).map((d) => ({ id: `d1:${d.uuid}`, ic: 'd1', t: d.name, m: `${bytes(d.sizeBytes).replace(/[⁦⁩]/g, '')} · ${cn((d.reads24h || 0) + (d.writes24h || 0))} q`, flow: (d.reads24h || 0) + (d.writes24h || 0) })),
      ...arr(c.kv).map((k) => ({ id: `kv:${k.id}`, ic: 'kv', t: k.title, m: `${cn(k.ops24h)} ops · KV`, flow: k.ops24h })),
      ...arr(c.r2).map((b) => ({ id: `r2:${b.name}`, ic: 'r2', t: b.name, m: `${cn(b.objects)} obj · ${bytes(b.bytes).replace(/[⁦⁩]/g, '')}`, flow: b.ops24h })),
      ...arr(c.vectorize).map((v) => ({ id: `vec:${v.name}`, ic: 'vectorize', t: v.name, m: `${v.dimensions ?? '—'}d · ${v.metric || ''}` }))]],
    ['AI · Workers AI, AI Gateway', [
      ...(ws.some((w) => arr(w.bindings).some((b) => b.type === 'ai')) || tNeurons ? [{ id: 'ai', ic: 'ai', t: 'Workers AI', m: `${cn(tNeurons)} neurons today`, flow: c.ai?.requests24h,
        tone: tNeurons > AI_FREE ? 'warn' : '' }] : []),
      ...arr(c.aiGateway).map((g) => ({ id: `gw:${g.id}`, ic: 'gateway', t: g.id, m: `${cn(g.requests24h)} req · $${(g.cost24h || 0).toFixed(2)}`, flow: g.requests24h }))]],
  ].filter(([, n]) => n.length);

  // vertical placement
  let y = 36;
  for (const [label, list] of right) {
    const rows = Math.ceil(list.length / 2); const h = 34 + rows * ROW + (list.length > 1 ? ROW / 2 : 0) - (ROW - NH) + 14;
    groups.push({ x: XC1 - 14, y, w: XC2 + NW + 14 - (XC1 - 14), h, label });
    list.forEach((n, i) => nodes.push({ ...n, x: i % 2 ? XC2 : XC1, y: y + 34 + Math.floor(i / 2) * ROW + (i % 2 ? ROW / 2 : 0) }));
    y += h + 22;
  }
  const H = Math.max(y + 10, 36 + Math.max(left.length, mid.length) * ROW + 90);
  const col = (list, x, label) => {
    const h = 34 + list.length * ROW - (ROW - NH) + 14; const top = Math.max(36, (H - h) / 2);
    groups.push({ x: x - 14, y: top, w: NW + 28, h, label });
    list.forEach((n, i) => nodes.push({ ...n, x, y: top + 34 + i * ROW }));
  };
  col(left, XA, 'לקוחות · Clients'); col(mid, XB, 'מחשוב · Workers & Pages');

  const at = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const key = (b, w) => ({ d1: `d1:${b.target}`, kv_namespace: `kv:${b.target}`, r2_bucket: `r2:${b.target}`, vectorize: `vec:${b.target}`, ai: 'ai',
    queue: `q:${b.target}`, workflow: `wf:${b.target}`, service: `w:${b.target}`, durable_object_namespace: `do:${b.target}` })[b.type];
  for (const w of ws) {
    const from = at[`w:${w.name}`];
    if (from && w.requests24h) edges.push({ a: at.client, b: from, flow: w.requests24h, what: `Clients → ${w.name}`, m: `${num(w.requests24h)} בקשות, ${num(w.errors24h)} שגיאות ב-24 שעות` });
    const seen = new Set();
    for (const b of arr(w.bindings)) {
      const k = key(b, w); const to = k && at[k]; if (!to || to === from || seen.has(k)) continue; seen.add(k);
      edges.push({ a: from, b: to, flow: to.flow, what: `${w.name} → ${to.t}`, bind: b.name, m: to.m });
    }
  }
  return { nodes, groups, edges, H };
}
function edgePath(e, i, trunks) {
  const x1 = e.a.x + NW, y1 = e.a.y + NH / 2, x2 = e.b.x, y2 = e.b.y + NH / 2;
  if (e.a.x < XB) { const dx = (x2 - x1) / 2; return `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`; }
  const X = trunks[e.a.id]; const r = Math.min(10, Math.abs(y2 - y1) / 2); const s = y2 > y1 ? 1 : -1;
  if (r < 2) return `M${x1} ${y1} H${x2}`;
  return `M${x1} ${y1} H${X - r} Q${X} ${y1} ${X} ${y1 + s * r} V${y2 - s * r} Q${X} ${y2} ${X + r} ${y2} H${x2}`;
}
function arch(c) {
  const { nodes, groups, edges, H } = graph(c);
  // one numbered step per target, as in Cloudflare's reference diagrams; the list below names every source
  const step = new Map(); for (const e of edges) if (!step.has(e.b.id)) step.set(e.b.id, { n: step.size + 1, to: e.b, from: [], binds: new Set() });
  for (const e of edges) { const s = step.get(e.b.id); s.from.push(e.a.t); if (e.bind) s.binds.add(e.bind); }
  const trunks = {}; nodes.filter((n) => n.x === XB).forEach((n, i) => { trunks[n.id] = XB + NW + 26 + i * 10; });
  const dur = (f) => (f > 0 ? Math.max(0.5, 3.2 - Math.log10(f) * 0.55).toFixed(2) : 0);
  const cut = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));
  let g = '';
  for (const b of groups) g += `<g class="cfx-g"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10"/><text x="${b.x + b.w - 12}" y="${b.y + 20}">${esc(b.label)}</text></g>`;
  edges.forEach((e, i) => {
    const d = dur(e.flow);
    g += `<path class="cfx-e ${d ? 'on' : 'idle'}" d="${edgePath(e, i, trunks)}" style="--d:${d || 0}s" marker-end="url(#cfx-arrow)"><title>${esc(`${step.get(e.b.id).n}. ${e.what}${e.bind ? ` (${e.bind})` : ''}: ${e.m}`)}</title></path>`;
  });
  for (const { n, to } of step.values()) { const x = to.x - 16, y = to.y + NH / 2 - 14; g += `<g class="cfx-step"><circle cx="${x}" cy="${y}" r="8"/><text x="${x}" y="${y + 3.5}">${n}</text></g>`; }
  for (const n of nodes) {
    g += `<g class="cfx-n ${n.tone ? `t-${n.tone}` : ''}" transform="translate(${n.x} ${n.y})"><title>${esc(`${n.t} · ${n.m}`)}</title>
      <rect class="cfx-nb" width="${NW}" height="${NH}" rx="8"/><rect class="cfx-ni" x="8" y="8" width="36" height="36" rx="7"/>
      <svg x="14" y="14" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="cfx-nic">${G[n.ic]}</svg>
      <text class="cfx-nt" x="54" y="22">${esc(cut(n.t, 19))}</text><text class="cfx-nm" x="54" y="39">${esc(cut(n.m, 26))}</text>
      ${n.live ? `<circle class="cfx-live" cx="${NW - 10}" cy="10" r="3.5"/>` : ''}</g>`;
  }
  const svg = `<svg class="cfx-arch" viewBox="0 0 ${W} ${H}" role="img" aria-label="ארכיטקטורת החשבון: ${nodes.length} משאבים, ${edges.length} חיבורים" dir="ltr">
    <defs><pattern id="cfx-dots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" class="cfx-dot"/></pattern>
    <marker id="cfx-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 9 5 0 9z" class="cfx-ah"/></marker></defs>
    <rect width="${W}" height="${H}" fill="url(#cfx-dots)"/>${g}
    <text class="cfx-cap" x="16" y="${H - 12}">ACCOUNT ARCHITECTURE</text></svg>`;
  return html`<section class="card cfx-card cfx-arch-card" aria-labelledby="cfx-arch-h">
    ${head(html`<span id="cfx-arch-h">ארכיטקטורת החשבון</span>`, 'כל משאב אמיתי בחשבון, והחיבורים שה-Workers מצהירים עליהם (bindings). קו זז = הייתה תנועה ב-24 השעות האחרונות, ומהירותו לפי כמות התנועה.')}
    <div class="cfx-canvas">${raw(svg)}</div>
    <ol class="cfx-flows" dir="ltr">${[...step.values()].map((s) => html`<li><span class="cfx-num">${s.n}</span><div><span class="cfx-dim">${s.from.join(', ')} →</span> <b>${s.to.t}</b>
      ${[...s.binds].map((b) => html` <code>${b}</code>`)}<p>${s.to.m}</p></div></li>`)}</ol>
  </section>`;
}

// ---------------------------------------------------------------- home
function kpis(c) {
  const t = c.traffic?.last24h || {}; const y = c.traffic?.prev24h || {}; const ph = arr(c.traffic?.perHour);
  const er = t.requests ? t.errors / t.requests : 0; const n = c.ai?.neuronsToday;
  const delta = y.requests ? t.requests / y.requests - 1 : null;
  return html`<section class="g g4 cfx-kpis" aria-label="מדדים">
    ${stat({ key: 'cf-req', label: 'בקשות ל-apple · 24 שעות', value: t.requests, series: ph.map((x) => x.requests), sub: isNum(delta) ? `${delta >= 0 ? '+' : ''}${num(delta * 100, 0)}% לעומת היממה שלפני` : '' })}
    ${stat({ key: 'cf-err', label: 'שגיאות', value: t.errors, tone: er >= 0.05 ? 'bad' : er >= 0.01 ? 'warn' : 'good', series: ph.map((x) => x.errors), sparkCls: 'bad', sub: t.requests ? `${num(er * 100, 2)}% מהבקשות` : '' })}
    ${stat({ key: 'cf-cpu', label: 'זמן מעבד p99', value: t.cpuP99Ms, text: ms1(t.cpuP99Ms), unit: 'ms', sub: `חציון ${ms1(t.cpuP50Ms)} ms · עכשיו ${c.health?.ms != null ? `${num(c.health.ms)} ms` : '—'}` })}
    ${stat({ key: 'cf-ai', label: 'נוירונים של Workers AI היום', value: n, text: compact(n), tone: n > AI_FREE ? 'warn' : '', sub: `${isNum(n) ? num((n / AI_FREE) * 100, 0) : '—'}% מ-10,000 החינמיים ביום` })}
  </section>`;
}
function products(c) {
  const sum = (xs, f) => arr(xs).reduce((s, x) => s + (f(x) || 0), 0);
  const P = [
    ['worker', 'Workers', arr(c.workers).length, `${cn(sum(c.workers, (w) => w.requests24h))} בקשות ביממה`, 'workers'],
    ['pages', 'Pages', arr(c.pages).length, arr(c.pages)[0]?.latest ? `פריסה ${arr(c.pages)[0].latest.status}` : '', 'workers'],
    ['do', 'Durable Objects', arr(c.durableObjects).length, `${cn(sum(c.durableObjects, (d) => d.requests24h))} קריאות`, 'workers'],
    ['workflow', 'Workflows', arr(c.workflows).length, `${cn(sum(c.workflows, (w) => Object.values(w.instances || {}).reduce((a, b) => a + b, 0)))} הרצות`, 'workers'],
    ['d1', 'D1', arr(c.d1).length, bytes(sum(c.d1, (d) => d.sizeBytes)), 'storage'],
    ['r2', 'R2', arr(c.r2).length, `${num(sum(c.r2, (b) => b.objects))} קבצים · ${bytes(sum(c.r2, (b) => b.bytes))}`, 'storage'],
    ['kv', 'KV', arr(c.kv).length, `${cn(sum(c.kv, (k) => k.ops24h))} פעולות`, 'storage'],
    ['vectorize', 'Vectorize', arr(c.vectorize).length, arr(c.vectorize).map((v) => `${v.dimensions}d`).join(' · '), 'storage'],
    ['queue', 'Queues', arr(c.queues).length, `${cn(sum(c.queues, (q) => q.ops24h))} פעולות`, 'storage'],
    ['ai', 'Workers AI', arr(c.ai?.models).length, `${cn(c.ai?.neurons24h)} נוירונים ביממה`, 'ai'],
    ['gateway', 'AI Gateway', arr(c.aiGateway).length, `$${sum(c.aiGateway, (g) => g.cost24h).toFixed(2)} ביממה`, 'ai'],
    ['turnstile', 'Turnstile', arr(c.turnstile).length, `${cn(sum(c.turnstile, (t) => Object.values(t.events24h || {}).reduce((a, b) => a + b, 0)))} אירועים`, 'security'],
    ['zone', 'Zones', arr(c.zones).length, arr(c.zones).length ? '' : 'רק workers.dev', 'security'],
  ];
  return html`<section class="cfx-prod" aria-label="המוצרים בחשבון">${P.map(([k, t, n, s, tab], i) => html`<a class="cfx-tile" href="#/cloudflare/${tab}" style="--i:${i}">
    <span class="cfx-tile-i">${ic(k, 18)}</span><span class="cfx-tile-t">${t}</span><b class="cfx-tile-n">${rn(`cf-p-${k}`, n, num(n))}</b><span class="cfx-tile-s">${s}</span></a>`)}</section>`;
}
function home(c) {
  const errs = Object.entries(c.errors || {});
  return html`${kpis(c)}${arch(c)}${products(c)}
    ${errs.length ? note('warn', `${num(errs.length)} חלקים שהטוקן לא יכול לקרוא`, errs.map(([k, v]) => `${k}: ${v}`).join(' · ')) : ''}`;
}

// ---------------------------------------------------------------- workers & pages
const TRIG = { secret: 'עדכון סוד', deployment: 'פריסת קוד', upload: 'העלאת קוד', rollback: 'חזרה לגרסה', version_upload: 'העלאת גרסה' };
const HANDLERS = new Set(['fetch', 'scheduled', 'queue', 'tail', 'email', 'trace', 'alarm']);
const trig = (x) => TRIG[x.trigger] || x.trigger || x.source || '—';
function workersTable(c) {
  const ws = arr(c.workers);
  return html`<section class="card cfx-card flush" aria-labelledby="cfx-wk-h">${head(html`<span id="cfx-wk-h">Workers</span>`, `${num(ws.length)} בחשבון · 24 השעות האחרונות`)}
    <div class="cfx-tw"><table class="cfx-t"><thead><tr><th>שם</th><th>בקשות</th><th>שגיאות</th><th>CPU p50 / p99</th><th>גרסה מגישה</th><th>פריסה אחרונה</th><th>מפעילים</th></tr></thead>
    <tbody>${ws.map((w) => html`<tr data-k="w-${w.name}" class="${st.worker === w.name ? 'on' : ''}">
      <td><button class="cfx-link" data-act="worker" data-w="${w.name}">${ic('worker', 14)}${L(w.name)}</button>${w.url ? html` <a class="cfx-ext" href="${w.url}" target="_blank" rel="noopener noreferrer" aria-label="פתיחת ${w.name}">${ic('ext', 12)}</a>` : ''}</td>
      <td class="n">${num(w.requests24h)}</td><td class="n ${w.errors24h ? 'bad' : ''}">${num(w.errors24h)}</td><td class="n">${L(`${ms1(w.cpuP50Ms)} / ${ms1(w.cpuP99Ms)} ms`)}</td>
      <td>${arr(w.serving).map((v) => badge(arr(w.serving).length > 1 ? 'warning' : 'neutral', html`#${v.number ?? s8(v.id)} · ${num(v.pct)}%`))}</td>
      <td>${w.deployments?.[0] ? html`${ago(w.deployments[0].createdAt)} · ${trig(w.deployments[0])}` : '—'}</td>
      <td>${arr(w.handlers).filter((h) => HANDLERS.has(h)).map((h) => html`<code>${h}</code> `)}${arr(w.crons).map((x) => badge('outline', L(x)))}</td></tr>`)}</tbody></table></div></section>`;
}
function bindings(w) {
  const TYPE = { d1: 'D1', kv_namespace: 'KV', r2_bucket: 'R2', vectorize: 'Vectorize', ai: 'Workers AI', durable_object_namespace: 'Durable Object', queue: 'Queue',
    workflow: 'Workflow', analytics_engine: 'Analytics Engine', images: 'Images', secret_text: 'סוד', plain_text: 'משתנה', service: 'Service', browser: 'Browser', version_metadata: 'Version metadata' };
  const b = arr(w.bindings);
  return html`<section class="card cfx-card" aria-labelledby="cfx-bd-h">${head(html`<span id="cfx-bd-h">חיבורים (bindings) של ${L(w.name)}</span>`, 'לסודות ולמשתנים מוצג רק השם. הערך לא יוצא מהשרת.')}
    ${b.length ? html`<ul class="cfx-binds">${b.map((x) => html`<li><span class="cfx-badge cfx-b-${x.type === 'secret_text' ? 'danger' : 'neutral'}">${TYPE[x.type] || x.type}</span>
      <code>${x.name}</code>${x.target ? L(x.target, 'cfx-dim') : ''}</li>`)}</ul>` : empty('אין חיבורים.')}
    <dl class="cfx-kv"><dt>compatibility_date</dt><dd>${L(w.compatDate || '—')}</dd><dt>usage model</dt><dd>${L(w.usageModel || '—')}</dd>
      <dt>build</dt><dd>${L(w.buildSha || '—')}</dd><dt>נוצר</dt><dd>${when(w.createdAt)}</dd></dl></section>`;
}
function deployments(w) {
  const deps = arr(w.deployments); const vs = arr(w.versions); const serving = new Set(arr(w.serving).map((v) => v.id));
  const numOf = new Map(vs.map((v) => [v.id, v.number])); const prev = previous(w); const cur = arr(w.serving)[0]?.number;
  return html`<div class="g g2">
    <section class="card cfx-card flush" aria-labelledby="cfx-dp-h">${head(html`<span id="cfx-dp-h">פריסות</span>`, `${num(deps.length)} האחרונות של ${w.name}. פריסה = איזו גרסה מגישה כמה אחוז מהתנועה.`,
      prev ? actBtn(cfx.rollback(w.name, prev, cur), `Rollback ל-#${prev.number ?? s8(prev.id)}`, { cls: 'btn-sm btn-primary cfx-rb', ic: null }) : '')}
      <div class="cfx-tw"><table class="cfx-t"><thead><tr><th>מתי</th><th>סוג</th><th>גרסאות</th><th>הודעה</th></tr></thead>
      <tbody>${deps.map((d, i) => html`<tr data-k="d-${d.id}"><td>${ago(d.createdAt)}${i === 0 ? html` ${badge('success', 'פעילה')}` : ''}</td><td>${trig(d)}</td>
        <td>${d.versions.map((v) => badge('neutral', html`#${numOf.get(v.id) ?? s8(v.id)} · ${num(v.pct)}%`))}</td><td class="cfx-msg" dir="auto">${d.message || html`<span class="cfx-dim">—</span>`}</td></tr>`)}</tbody></table></div></section>
    <section class="card cfx-card flush" aria-labelledby="cfx-vs-h">${head(html`<span id="cfx-vs-h">גרסאות</span>`, 'חזרה לגרסה יוצרת פריסה חדשה שמגישה אותה ב-100%. אותה פעולה על הגרסה החדשה מחזירה את המצב.')}
      <div class="cfx-tw"><table class="cfx-t"><thead><tr><th>#</th><th>נוצרה</th><th>מקור</th><th>הודעה</th><th></th></tr></thead>
      <tbody>${vs.slice(0, 12).map((v) => html`<tr data-k="v-${v.id}" class="${serving.has(v.id) ? 'on' : ''}"><td class="n">${L(`#${v.number ?? '?'}`)}</td><td>${ago(v.createdAt)}</td><td>${trig(v)}</td>
        <td class="cfx-msg" dir="auto">${v.message || html`<span class="cfx-dim">${L(s8(v.id))}</span>`}</td>
        <td>${serving.has(v.id) ? badge('success', 'מגישה עכשיו') : actBtn(cfx.rollback(w.name, v, cur), prev?.id === v.id ? 'Rollback' : 'חזרה לגרסה', { cls: `btn-sm ${prev?.id === v.id ? 'btn-primary' : 'btn-ghost'}`, ic: null })}</td></tr>`)}</tbody></table></div></section>
  </div>`;
}
function observability(c) {
  const s = c.settings || {};
  return html`<section class="card cfx-card flush" aria-labelledby="cfx-ob-h">${head(html`<span id="cfx-ob-h">Observability של apple</span>`, 'מתג = חלון אישור, ואז שינוי ב-Worker החי. בפריסה הבאה wrangler.toml קובע שוב.')}
    <div class="sw-row"><div class="li-m"><b>Workers Logs</b><span>כל שורה שה-Worker כותב נשמרת לחיפוש</span></div>${c.settings ? swBtn(cf.toggle('logs', !!s.logs), !!s.logs, 'Logs') : '—'}</div>
    <div class="sw-row"><div class="li-m"><b>Traces</b><span>כמה זמן לקח כל שלב בכל בקשה</span></div>${c.settings ? swBtn(cf.toggle('traces', !!s.traces), !!s.traces, 'Traces') : '—'}</div>
    <div class="sw-row"><div class="li-m"><b>דגימה</b><span>איזה חלק מהבקשות נשמר</span></div><b>${L(`${num((s.sampling ?? 0) * 100)}%`)}</b></div>
    <div class="sw-row"><div class="li-m"><b>Logpush</b><span>שליחת יומנים לשירות חיצוני</span></div>${badge(s.logpush ? 'success' : 'neutral', s.logpush ? 'דלוק' : 'כבוי')}</div>
    <div class="sw-row"><div class="li-m"><b>workers.dev</b><span>הכתובת הציבורית ותצוגות מקדימות</span></div>${badge(c.subdomain?.enabled ? 'success' : 'neutral', c.subdomain?.enabled ? 'פעילה' : 'כבויה')} ${badge(c.subdomain?.previews ? 'info' : 'neutral', c.subdomain?.previews ? 'Previews' : 'בלי Previews')}</div>
    ${errNote(c, 'settings', 'הגדרות ה-Worker')}</section>`;
}
function doWf(c) {
  return html`<div class="g g2">
    <section class="card cfx-card flush" aria-labelledby="cfx-do-h">${head(html`<span id="cfx-do-h">Durable Objects</span>`, '24 השעות האחרונות')}
      ${arr(c.durableObjects).length ? html`<div class="cfx-tw"><table class="cfx-t"><thead><tr><th>מחלקה</th><th>Worker</th><th>אחסון</th><th>קריאות</th><th>שגיאות</th></tr></thead>
      <tbody>${arr(c.durableObjects).map((d) => html`<tr data-k="do-${d.id}"><td>${ic('do', 14)} ${L(d.className || d.name)}</td><td>${L(d.script || '—')}</td><td>${d.sqlite ? 'SQLite' : 'KV'}</td>
        <td class="n">${num(d.requests24h)}</td><td class="n ${d.errors24h ? 'bad' : ''}">${num(d.errors24h)}${d.requests24h ? html` <span class="cfx-dim">(${num((d.errors24h / d.requests24h) * 100, 2)}%)</span>` : ''}</td></tr>`)}</tbody></table></div>` : empty('אין.')}
      ${errNote(c, 'durableObjects', 'Durable Objects')}</section>
    <section class="card cfx-card flush" aria-labelledby="cfx-wf-h">${head(html`<span id="cfx-wf-h">Workflows ו-Pages</span>`)}
      <div class="cfx-tw"><table class="cfx-t"><thead><tr><th>שם</th><th>סוג</th><th>מצב</th></tr></thead><tbody>
      ${arr(c.workflows).map((w) => html`<tr data-k="wf-${w.name}"><td>${ic('workflow', 14)} ${L(w.name)}</td><td>Workflow · ${L(w.className || '')}</td>
        <td>${Object.entries(w.instances || {}).filter(([, v]) => v).map(([k, v]) => badge(k === 'errored' ? 'danger' : k === 'complete' ? 'success' : 'neutral', `${k} ${num(v)}`))}</td></tr>`)}
      ${arr(c.pages).map((p) => html`<tr data-k="pg-${p.name}"><td>${ic('pages', 14)} ${L(p.name)}</td><td>Pages · ${L(p.branch || '')}</td>
        <td>${p.latest ? html`${badge(p.latest.status === 'success' ? 'success' : 'warning', p.latest.status || '—')} ${ago(p.latest.createdAt)}` : '—'}</td></tr>`)}</tbody></table></div></section></div>`;
}
function workersTab(c) {
  const ws = arr(c.workers); const w = ws.find((x) => x.name === st.worker) || ws[0];
  return html`${workersTable(c)}${w ? html`${deployments(w)}<div class="g g2">${bindings(w)}${observability(c)}</div>` : ''}${doWf(c)}${errNote(c, 'workers', 'Workers')}`;
}

// ---------------------------------------------------------------- consoles (read kinds, guarded on the server)
async function read(ctx, key, body) {
  st[key].busy = true; st[key].err = null; ctx.rerender();
  const r = await ctx.api.post(PATH, body);
  st[key].busy = false;
  if (r?.ok === false || !r) st[key].err = r?.reason || 'הקריאה נכשלה'; else st[key].res = r;
  ctx.rerender();
  return r;
}
const busyBtn = (s, act, label, cls = 'btn-primary') => html`<button class="btn btn-sm ${cls}" data-act="${act}" ${s.busy ? 'disabled' : ''}>${s.busy ? html`<span class="cfx-spin" aria-hidden="true"></span>` : ic('play', 13)}<span>${label}</span></button>`;
const skel = (n = 4) => html`<div class="cfx-skel" aria-busy="true">${Array.from({ length: n }, () => html`<i></i>`)}</div>`;

function d1Console(c) {
  const s = st.d1; const dbs = arr(c.d1); if (!s.db && dbs[0]) s.db = dbs[0].uuid;
  const r = s.res;
  const EX = ['PRAGMA table_list', "SELECT name, type FROM sqlite_master WHERE type = 'table' ORDER BY name", 'SELECT COUNT(*) AS n FROM chunks'];
  return html`<section class="card cfx-card flush" aria-labelledby="cfx-d1c-h">${head(html`<span id="cfx-d1c-h">D1 · קונסולת שאילתות (קריאה בלבד)</span>`,
    'שאילתה אחת: SELECT, WITH…SELECT, EXPLAIN או PRAGMA table_info/table_list/index_list. השרת חוסם כתיבה, טבלאות סודות ועמודות רגישות (מוצגות •••). עד 200 שורות.')}
    <div class="cfx-console">
      <div class="cfx-row"><label class="cfx-lab" for="cfx-d1-db">מסד</label><select id="cfx-d1-db" class="cfx-in" data-change="d1db">${dbs.map((d) => html`<option value="${d.uuid}" ${d.uuid === s.db ? 'selected' : ''}>${d.name}</option>`)}</select>
        <span class="cfx-ex">${EX.map((q) => html`<button class="cfx-chipb" data-act="d1ex" data-q="${q}" dir="ltr">${q.length > 34 ? `${q.slice(0, 33)}…` : q}</button>`)}</span></div>
      <textarea id="cfx-d1-sql" class="cfx-in cfx-sql" dir="ltr" spellcheck="false" rows="3" data-input="d1sql" data-key="d1key" aria-label="שאילתת SQL">${s.sql}</textarea>
      <div class="cfx-row">${busyBtn(s, 'd1run', 'הרצה')}<span class="cfx-dim">Ctrl/⌘+Enter</span>
        ${r ? html`<span class="cfx-meta">${num(r.rows?.length)} שורות${r.truncated ? ' (נחתך ב-200)' : ''} · נקראו ${num(r.rowsRead)} · ${L(`${ms1(r.durationMs)} ms`)}</span>` : ''}</div>
      ${s.err ? note('bad', 'השאילתה לא רצה', s.err) : ''}
      ${s.busy && !r ? skel() : ''}
      ${r ? html`${arr(r.masked).length ? html`<p class="cfx-mask">${ic('lock', 13)} עמודות מוסתרות: ${arr(r.masked).map((m) => html`<code>${m}</code> `)}</p>` : ''}
        <div class="cfx-tw cfx-res"><table class="cfx-t cfx-mono"><thead><tr>${arr(r.columns).map((k) => html`<th dir="ltr">${arr(r.masked).includes(k) ? ic('lock', 11) : ''}${k}</th>`)}</tr></thead>
        <tbody>${arr(r.rows).map((row) => html`<tr>${row.map((v) => html`<td dir="ltr" class="${v === '•••' ? 'cfx-dim' : ''}">${v == null ? html`<span class="cfx-dim">NULL</span>` : String(v)}</td>`)}</tr>`)}</tbody></table></div>` : ''}
    </div></section>`;
}
function r2Browser(c) {
  const s = st.r2; const bs = arr(c.r2); if (!s.bucket && bs[0]) s.bucket = bs[0].name;
  const r = s.res && s.res.bucket === s.bucket ? s.res : null; const parts = s.prefix.split('/').filter(Boolean);
  return html`<section class="card cfx-card flush" aria-labelledby="cfx-r2-h">${head(html`<span id="cfx-r2-h">R2 · דפדפן קבצים</span>`, 'שם, גודל, תאריך העלאה וסוג בלבד. תוכן הקבצים לא נקרא.')}
    <div class="cfx-console"><div class="cfx-row"><label class="cfx-lab" for="cfx-r2-b">דלי</label>
      <select id="cfx-r2-b" class="cfx-in" data-change="r2b">${bs.map((b) => html`<option value="${b.name}" ${b.name === s.bucket ? 'selected' : ''}>${b.name}</option>`)}</select>
      <nav class="cfx-crumbs" dir="ltr" aria-label="נתיב"><button class="cfx-link" data-act="r2cd" data-p="">${s.bucket}</button>${parts.map((p, i) => html`<span>/</span><button class="cfx-link" data-act="r2cd" data-p="${parts.slice(0, i + 1).join('/')}/">${p}</button>`)}</nav>
      ${busyBtn(s, 'r2run', 'רענון', 'btn-ghost')}</div>
      ${s.err ? note('bad', 'הרשימה לא נקראה', s.err) : ''}
      ${s.busy && !r ? skel() : ''}
      ${r ? html`<div class="cfx-tw"><table class="cfx-t"><thead><tr><th>שם</th><th>גודל</th><th>סוג</th><th>הועלה</th></tr></thead><tbody>
        ${s.prefix ? html`<tr><td colspan="4"><button class="cfx-link" data-act="r2up">${ic('back', 14)} למעלה</button></td></tr>` : ''}
        ${arr(r.prefixes).map((p) => html`<tr data-k="p-${p}"><td colspan="4"><button class="cfx-link" data-act="r2cd" data-p="${p}">${ic('folder', 14)}${L(p.slice(s.prefix.length))}</button></td></tr>`)}
        ${arr(r.objects).map((o) => html`<tr data-k="o-${o.key}"><td>${ic('file', 14)} ${L(String(o.key).slice(s.prefix.length))}</td><td class="n">${bytes(o.size)}</td><td>${L(o.contentType || '—', 'cfx-dim')}</td><td>${ago(o.uploaded)}</td></tr>`)}
        ${!arr(r.prefixes).length && !arr(r.objects).length ? html`<tr><td colspan="4" class="cfx-dim">ריק.</td></tr>` : ''}</tbody></table></div>
        ${r.truncated ? html`<p class="cfx-meta">מוצגים 100 הראשונים.</p>` : ''}` : ''}</div></section>`;
}
function kvBrowser(c) {
  const s = st.kv; const ns = arr(c.kv); if (!s.ns && ns[0]) s.ns = ns[0].id;
  const r = s.res && s.res.ns === s.ns ? s.res : null;
  return html`<section class="card cfx-card flush" aria-labelledby="cfx-kv-h">${head(html`<span id="cfx-kv-h">KV · מפתחות</span>`, 'שמות מפתחות ותפוגה בלבד. ערכים לא נקראים, וקטע ארוך ואקראי בשם (מזהה חיבור, טוקן) מקוצר ל-….')}
    <div class="cfx-console"><div class="cfx-row"><label class="cfx-lab" for="cfx-kv-ns">Namespace</label>
      <select id="cfx-kv-ns" class="cfx-in" data-change="kvns">${ns.map((k) => html`<option value="${k.id}" ${k.id === s.ns ? 'selected' : ''}>${k.title}</option>`)}</select>
      <input id="cfx-kv-p" class="cfx-in" dir="ltr" placeholder="prefix" value="${s.prefix}" data-input="kvp" data-key="kvkey" aria-label="קידומת">
      ${busyBtn(s, 'kvrun', 'חיפוש')}</div>
      ${s.err ? note('bad', 'המפתחות לא נקראו', s.err) : ''}
      ${s.busy && !r ? skel() : ''}
      ${r ? html`<div class="cfx-tw"><table class="cfx-t"><thead><tr><th>מפתח</th><th>תפוגה</th></tr></thead><tbody>
        ${arr(r.keys).map((k) => html`<tr data-k="k-${k.name}"><td>${ic('kv', 14)} ${L(k.name)}</td><td>${k.expiration ? when(k.expiration * 1000) : html`<span class="cfx-dim">ללא</span>`}</td></tr>`)}
        ${arr(r.keys).length ? '' : html`<tr><td colspan="2" class="cfx-dim">אין מפתחות.</td></tr>`}</tbody></table></div>
        <div class="cfx-row">${s.back.length ? html`<button class="btn btn-sm btn-ghost" data-act="kvprev">הקודמים</button>` : ''}${r.cursor ? html`<button class="btn btn-sm" data-act="kvnext">עוד 100</button>` : ''}</div>` : ''}
    </div></section>`;
}
function storageTab(c) {
  return html`<section class="card cfx-card flush" aria-labelledby="cfx-d1-h">${head(html`<span id="cfx-d1-h">D1 · מסדי נתונים</span>`, 'SQLite מנוהל. 24 השעות האחרונות.')}
    <div class="cfx-tw"><table class="cfx-t"><thead><tr><th>שם</th><th>גודל</th><th>טבלאות</th><th>אזור</th><th>שאילתות קריאה</th><th>שאילתות כתיבה</th><th>שורות שנקראו</th><th>שורות שנכתבו</th></tr></thead>
    <tbody>${arr(c.d1).map((d) => html`<tr data-k="d1-${d.uuid}"><td>${ic('d1', 14)} ${L(d.name)}</td><td class="n">${bytes(d.sizeBytes)}</td><td class="n">${num(d.tables)}</td><td>${L(d.region || '—')}</td>
      <td class="n">${num(d.reads24h)}</td><td class="n">${num(d.writes24h)}</td><td class="n">${compact(d.rowsRead24h)}</td><td class="n">${compact(d.rowsWritten24h)}</td></tr>`)}</tbody></table></div>${errNote(c, 'd1', 'D1')}</section>
    ${arr(c.d1).length ? d1Console(c) : ''}
    <div class="g g2">
      <section class="card cfx-card flush" aria-labelledby="cfx-r2l-h">${head(html`<span id="cfx-r2l-h">R2 · דליים</span>`)}
        <div class="cfx-tw"><table class="cfx-t"><thead><tr><th>שם</th><th>קבצים</th><th>נפח</th><th>פעולות ביממה</th><th>מיקום</th></tr></thead>
        <tbody>${arr(c.r2).map((b) => html`<tr data-k="r2-${b.name}"><td>${ic('r2', 14)} ${L(b.name)}</td><td class="n">${num(b.objects)}</td><td class="n">${bytes(b.bytes)}</td><td class="n">${num(b.ops24h)} <span class="cfx-dim">(${num(b.writes24h)} כתיבות)</span></td><td>${L(b.location || '—')}</td></tr>`)}</tbody></table></div>${errNote(c, 'r2', 'R2')}</section>
      <section class="card cfx-card flush" aria-labelledby="cfx-kvl-h">${head(html`<span id="cfx-kvl-h">KV · Namespaces</span>`)}
        <div class="cfx-tw"><table class="cfx-t"><thead><tr><th>שם</th><th>מזהה</th><th>פעולות ביממה</th></tr></thead>
        <tbody>${arr(c.kv).map((k) => html`<tr data-k="kv-${k.id}"><td>${ic('kv', 14)} ${L(k.title)}</td><td>${L(s8(k.id), 'cfx-dim')}</td><td class="n">${num(k.ops24h)}</td></tr>`)}</tbody></table></div>${errNote(c, 'kv', 'KV')}</section>
    </div>
    <div class="g g2">${arr(c.r2).length ? r2Browser(c) : ''}${arr(c.kv).length ? kvBrowser(c) : ''}</div>
    <div class="g g2">
      <section class="card cfx-card flush" aria-labelledby="cfx-vec-h">${head(html`<span id="cfx-vec-h">Vectorize</span>`, 'אינדקסים לחיפוש לפי משמעות')}
        ${arr(c.vectorize).length ? html`<div class="cfx-tw"><table class="cfx-t"><thead><tr><th>שם</th><th>ממדים</th><th>מדד</th><th>נוצר</th></tr></thead>
        <tbody>${arr(c.vectorize).map((v) => html`<tr data-k="vec-${v.name}"><td>${ic('vectorize', 14)} ${L(v.name)}</td><td class="n">${num(v.dimensions)}</td><td>${L(v.metric || '—')}</td><td>${ago(v.createdAt)}</td></tr>`)}</tbody></table></div>` : empty('אין אינדקסים.')}</section>
      <section class="card cfx-card flush" aria-labelledby="cfx-q-h">${head(html`<span id="cfx-q-h">Queues</span>`)}
        ${arr(c.queues).length ? html`<div class="cfx-tw"><table class="cfx-t"><thead><tr><th>שם</th><th>שולחים</th><th>צורכים</th><th>פעולות ביממה</th></tr></thead>
        <tbody>${arr(c.queues).map((q) => html`<tr data-k="q-${q.id}"><td>${ic('queue', 14)} ${L(q.name)}</td><td>${arr(q.producerScripts).map((x) => L(x)) || num(q.producers)}</td><td>${arr(q.consumerScripts).map((x) => L(x))}</td><td class="n">${num(q.ops24h)}</td></tr>`)}</tbody></table></div>` : empty('אין תורים.')}</section>
    </div>`;
}

// ---------------------------------------------------------------- AI
function gwLogs(c) {
  const s = st.gw; const gs = arr(c.aiGateway); if (!s.id && gs[0]) s.id = gs[0].id;
  const r = s.res && s.res.gateway === s.id ? s.res : null;
  return html`<section class="card cfx-card flush" aria-labelledby="cfx-gl-h">${head(html`<span id="cfx-gl-h">AI Gateway · יומן בקשות</span>`, '50 האחרונות: מודל, מצב, טוקנים, עלות, מטמון וזמן. תוכן הבקשה והתשובה לא נקרא.',
    html`<div class="cfx-row"><select id="cfx-gw" class="cfx-in" data-change="gwid" aria-label="Gateway">${gs.map((g) => html`<option value="${g.id}" ${g.id === s.id ? 'selected' : ''}>${g.id}</option>`)}</select>${busyBtn(s, 'gwrun', 'רענון', 'btn-ghost')}</div>`)}
    ${s.err ? note('bad', 'היומן לא נקרא', s.err) : ''}${s.busy && !r ? skel(6) : ''}
    ${r ? html`<div class="cfx-tw"><table class="cfx-t"><thead><tr><th>מתי</th><th>מודל</th><th>מצב</th><th>טוקנים (קלט / פלט)</th><th>עלות</th><th>מטמון</th><th>זמן</th></tr></thead>
      <tbody>${arr(r.logs).map((l) => html`<tr data-k="gl-${l.id}"><td>${ago(l.createdAt)}</td><td>${L(l.model || '—')} <span class="cfx-dim">${L(l.provider || '')}</span></td>
        <td>${badge(l.success ? 'success' : 'danger', L(l.status ?? '—'))}</td><td class="n">${L(`${num(l.tokensIn)} / ${num(l.tokensOut)}`)}</td><td class="n">${L(isNum(l.cost) ? `$${l.cost.toFixed(4)}` : '—')}</td>
        <td>${l.cached ? badge('info', 'מהמטמון') : ''}</td><td class="n">${L(isNum(l.durationMs) ? `${num(l.durationMs)} ms` : '—')}</td></tr>`)}</tbody></table></div>` : ''}</section>`;
}
function aiTab(c) {
  const a = c.ai || {}; const n = a.neuronsToday; const f = isNum(n) ? n / AI_FREE : 0; const over = Math.max(0, (n || 0) - AI_FREE);
  const models = arr(a.models); const top = Math.max(1, ...models.map((m) => m.neurons || 0));
  return html`<div class="g g21">
    <section class="card cfx-card" aria-labelledby="cfx-ai-h">${head(html`<span id="cfx-ai-h">Workers AI · נוירונים היום</span>`, 'המכסה החינמית: 10,000 נוירונים ביום, מתאפסת בחצות UTC. מעבר לה 0.011$ לכל 1,000.')}
      <p class="cfx-big">${rn('cf-ai-today', n, compact(n))}<small> / 10K</small></p>${meter(Math.min(1, f), f > 1 ? 'var(--warn)' : 'var(--accent)')}
      <dl class="cfx-kv"><dt>היום</dt><dd>${num(n, 0)} (${num(f * 100, 0)}%)</dd><dt>חריגה עד עכשיו</dt><dd>${L(`$${((over / 1000) * 0.011).toFixed(2)}`)}</dd>
        <dt>24 שעות</dt><dd>${num(a.neurons24h, 0)} נוירונים · ${num(a.requests24h)} בקשות</dd></dl></section>
    <section class="card cfx-card flush" aria-labelledby="cfx-md-h">${head(html`<span id="cfx-md-h">מודלים · 24 שעות</span>`)}
      ${models.length ? html`<div class="cfx-tw"><table class="cfx-t"><thead><tr><th>מודל</th><th>בקשות</th><th>נוירונים</th><th>טוקנים</th></tr></thead>
      <tbody>${models.map((m) => html`<tr data-k="m-${m.model}"><td>${L(String(m.model || '').replace(/^@cf\//, ''))}</td><td class="n">${num(m.requests)}</td>
        <td class="n"><span class="cfx-bar"><i style="width:${((m.neurons || 0) / top) * 100}%"></i></span>${compact(m.neurons)}</td><td class="n">${L(`${cn(m.tokensIn)} / ${cn(m.tokensOut)}`)}</td></tr>`)}</tbody></table></div>` : empty('אין שימוש ביממה האחרונה.')}</section></div>
    <section class="card cfx-card flush" aria-labelledby="cfx-gw-h">${head(html`<span id="cfx-gw-h">AI Gateway</span>`, '24 השעות האחרונות')}
      <div class="cfx-tw"><table class="cfx-t"><thead><tr><th>Gateway</th><th>בקשות</th><th>עלות</th><th>שגיאות</th><th>מהמטמון</th><th>טוקנים (קלט / פלט)</th><th>הגדרות</th></tr></thead>
      <tbody>${arr(c.aiGateway).map((g) => html`<tr data-k="gw-${g.id}"><td>${ic('gateway', 14)} ${L(g.id)}</td><td class="n">${num(g.requests24h)}</td><td class="n">${L(`$${(g.cost24h || 0).toFixed(2)}`)}</td>
        <td class="n ${g.errors24h ? 'bad' : ''}">${num(g.errors24h)}</td><td class="n">${num(g.cached24h)}</td><td class="n">${L(`${cn(g.tokensIn24h)} / ${cn(g.tokensOut24h)}`)}</td>
        <td>${badge(g.collectLogs ? 'success' : 'neutral', g.collectLogs ? 'יומן' : 'בלי יומן')} ${g.cacheTtl ? badge('info', `cache ${g.cacheTtl}s`) : ''} ${g.rateLimit ? badge('neutral', `limit ${g.rateLimit}`) : ''} ${g.authentication ? badge('neutral', 'auth') : ''}</td></tr>`)}</tbody></table></div>
      ${errNote(c, 'aiGateway', 'AI Gateway')}</section>
    ${arr(c.aiGateway).length ? gwLogs(c) : ''}`;
}

// ---------------------------------------------------------------- analytics
function analyticsTab(c) {
  if (!c.traffic) return note('warn', 'אין נתוני תנועה', c.errors?.analytics || 'Analytics לא החזיר נתונים.');
  const ph = arr(c.traffic.perHour);
  const keys = [{ key: 'requests', label: 'בקשות', color: 'var(--cfx-orange)' }, { key: 'errors', label: 'שגיאות', color: 'var(--bad)' }];
  const ws = arr(c.workers);
  const dl = (a, b) => (isNum(a) && b ? html`<span class="cfx-delta ${a >= b ? 'up' : 'down'}">${a >= b ? '▲' : '▼'} ${num(Math.abs(a / b - 1) * 100, 0)}%</span>` : '');
  const sum = (xs, f) => arr(xs).reduce((s, x) => s + (f(x) || 0), 0);
  return html`<section class="card cfx-card" aria-labelledby="cfx-ph-h">${head(html`<span id="cfx-ph-h">בקשות ל-apple לפי שעה</span>`, '24 השעות האחרונות, UTC → שעון מקומי')}
      <div class="cfx-draw">${bars(ph, keys, { h: 200, overlay: true, x: (r) => r.hour, xfmt: hourOf })}</div>${legend(keys)}</section>
    <section class="card cfx-card flush" aria-labelledby="cfx-cmp-h">${head(html`<span id="cfx-cmp-h">כל ה-Workers · היום מול אתמול</span>`)}
      <div class="cfx-tw"><table class="cfx-t"><thead><tr><th>Worker</th><th>בקשות</th><th>אתמול</th><th>שגיאות</th><th>אתמול</th><th>בקשות-משנה</th><th>CPU p99</th></tr></thead>
      <tbody>${ws.map((w) => html`<tr data-k="a-${w.name}"><td>${L(w.name)}</td><td class="n">${num(w.requests24h)} ${dl(w.requests24h, w.prev24h?.requests)}</td><td class="n cfx-dim">${num(w.prev24h?.requests)}</td>
        <td class="n">${num(w.errors24h)}</td><td class="n cfx-dim">${num(w.prev24h?.errors)}</td><td class="n">${num(w.subrequests24h)}</td><td class="n">${L(`${ms1(w.cpuP99Ms)} ms`)}</td></tr>`)}</tbody></table></div></section>
    <section class="g g4" aria-label="פעולות אחסון ביממה">
      ${stat({ key: 'cf-d1r', label: 'D1 · שאילתות קריאה', value: sum(c.d1, (d) => d.reads24h), sub: `${compact(sum(c.d1, (d) => d.rowsRead24h))} שורות נקראו` })}
      ${stat({ key: 'cf-d1w', label: 'D1 · שאילתות כתיבה', value: sum(c.d1, (d) => d.writes24h), sub: `${compact(sum(c.d1, (d) => d.rowsWritten24h))} שורות נכתבו` })}
      ${stat({ key: 'cf-r2o', label: 'R2 · פעולות', value: sum(c.r2, (b) => b.ops24h), sub: `${num(sum(c.r2, (b) => b.writes24h))} כתיבות` })}
      ${stat({ key: 'cf-kvo', label: 'KV · פעולות', value: sum(c.kv, (k) => k.ops24h), sub: `${num(arr(c.kv).length)} namespaces` })}
    </section>`;
}

// ---------------------------------------------------------------- security
function securityTab(c) {
  const ts = arr(c.turnstile); const zs = arr(c.zones);
  const EV = { challenge_issued: 'אתגרים', challenge_solved: 'נפתרו', challenge_non_interactive_solved: 'נפתרו לבד', non_interactive_solved: 'נפתרו לבד', interactive_solved: 'נפתרו בלחיצה', challenge_siteverify_failed_invalid_token: 'אימות נכשל: טוקן', siteverify_failed_invalid_token: 'אימות נכשל: טוקן' };
  return html`<section class="card cfx-card flush" aria-labelledby="cfx-ts-h">${head(html`<span id="cfx-ts-h">Turnstile</span>`, 'ווידג׳טים ואירועים ב-24 השעות האחרונות. המפתח הסודי לא נקרא.')}
      ${ts.length ? html`<div class="cfx-tw"><table class="cfx-t"><thead><tr><th>שם</th><th>Site key</th><th>מצב</th><th>דומיינים</th><th>אירועים</th></tr></thead>
      <tbody>${ts.map((t) => html`<tr data-k="ts-${t.sitekey}"><td>${ic('turnstile', 14)} ${t.name}</td><td>${L(t.sitekey, 'cfx-dim')}</td><td>${badge('neutral', t.mode || '—')}</td>
        <td>${arr(t.domains).map((d) => badge('outline', L(d)))}</td>
        <td>${Object.entries(t.events24h || {}).map(([k, v]) => badge(/fail/i.test(k) ? 'danger' : 'neutral', html`${EV[k] || k} ${num(v)}`))}</td></tr>`)}</tbody></table></div>` : empty('אין ווידג׳טים.')}
      ${errNote(c, 'turnstile', 'Turnstile')}</section>
    <section class="card cfx-card flush" aria-labelledby="cfx-zn-h">${head(html`<span id="cfx-zn-h">Zones · דומיינים</span>`, 'ניקוי מטמון שייך לדומיין. אין כאן מחיקות או שינויי אבטחה.')}
      ${zs.length ? html`<div class="cfx-tw"><table class="cfx-t"><thead><tr><th>דומיין</th><th>מצב</th><th>תוכנית</th><th></th></tr></thead>
        <tbody>${zs.map((z) => html`<tr data-k="z-${z.id}"><td>${ic('zone', 14)} ${L(z.name)}</td><td>${badge(z.status === 'active' ? 'success' : 'warning', z.status || '—')}</td><td>${z.plan || '—'}</td>
          <td>${actBtn(cfx.purge(z), 'ניקוי מטמון', { cls: 'btn-sm btn-ghost', ic: null })}</td></tr>`)}</tbody></table></div>`
      : note('info', 'אין דומיינים בחשבון', 'האתר רץ על workers.dev, ולכן אין מטמון של דומיין לנקות. כשיתווסף דומיין, יופיע כאן כפתור "ניקוי מטמון".')}
      ${errNote(c, 'zones', 'Zones')}</section>
    <section class="card cfx-card" aria-labelledby="cfx-ac-h">${head(html`<span id="cfx-ac-h">החשבון</span>`)}
      <dl class="cfx-kv"><dt>שם</dt><dd>${c.account?.name || '—'}</dd><dt>Account ID</dt><dd>${L(c.account?.id || '—')}</dd>
        <dt>תוכנית Workers</dt><dd>${c.plan?.paid ? badge('orange', 'Workers Paid') : badge('neutral', 'לא ידוע')} <span class="cfx-dim">${c.plan?.why || ''}</span></dd></dl></section>`;
}

// ---------------------------------------------------------------- page
const PANES = { home, workers: workersTab, storage: storageTab, ai: aiTab, analytics: analyticsTab, security: securityTab };
function tabs() {
  return html`<nav class="cfx-tabs" role="tablist" aria-label="חלקי הדף">${TABS.map(([k, l]) => html`<a class="cfx-tab ${st.tab === k ? 'on' : ''}" role="tab" href="#/cloudflare/${k}"
    aria-selected="${st.tab === k}" title="${HE[k]}">${l}</a>`)}</nav>`;
}
function auto(ctx) {
  const c = ctx.data?.cloudflare; if (!c || c.ok === false) return;
  if (st.tab === 'storage') {
    if (st.r2.bucket && !st.r2.res && !st.r2.busy && !st.r2.err) read(ctx, 'r2', { kind: 'r2-list', bucket: st.r2.bucket, prefix: st.r2.prefix });
    if (st.kv.ns && !st.kv.res && !st.kv.busy && !st.kv.err) read(ctx, 'kv', { kind: 'kv-keys', ns: st.kv.ns, prefix: st.kv.prefix });
  }
  if (st.tab === 'ai' && st.gw.id && !st.gw.res && !st.gw.busy && !st.gw.err) read(ctx, 'gw', { kind: 'gw-logs', gateway: st.gw.id });
}
const runD1 = (ctx) => { const el = document.getElementById('cfx-d1-sql'); if (el) st.d1.sql = el.value; return read(ctx, 'd1', { kind: 'd1-query', db: st.d1.db, sql: st.d1.sql }); };
const runKv = (ctx, cursor) => read(ctx, 'kv', { kind: 'kv-keys', ns: st.kv.ns, prefix: st.kv.prefix || undefined, cursor });
const runR2 = (ctx) => read(ctx, 'r2', { kind: 'r2-list', bucket: st.r2.bucket, prefix: st.r2.prefix || undefined });

export default {
  id: 'cloudflare', title: 'Cloudflare', nav: 'Cloudflare', brand: 'cloudflare', needs: ['cloudflare'],
  sub: 'השרת שמריץ את האתר: הארכיטקטורה, התנועה, הפריסות, האחסון וה-AI של החשבון',
  links: (d) => {
    const id = d.cloudflare?.account?.id; const base = id && `https://dash.cloudflare.com/${id}`;
    return [{ label: 'Cloudflare Dashboard', url: base && `${base}/${{ home: 'home', workers: 'workers-and-pages', storage: 'workers/d1', ai: 'ai/workers-ai', analytics: 'workers-and-pages', security: 'turnstile' }[tabOf()]}` }];
  },
  render(d) {
    const c = d.cloudflare || {}; st.tab = tabOf();
    return html`<div class="cfx" data-tab="${st.tab}">${tabs()}${st.tab === 'home' ? insights(c) : ''}<div class="cfx-pane" role="tabpanel" aria-label="${HE[st.tab]}">${PANES[st.tab](c)}</div></div>`;
  },
  after(root, ctx) { auto(ctx); },
  actions: {
    worker: (el, ctx) => { st.worker = el.dataset.w; ctx.rerender(); },
    d1db: (el) => { st.d1.db = el.value; st.d1.res = null; },
    d1sql: (el) => { st.d1.sql = el.value; },
    d1ex: (el, ctx) => { st.d1.sql = el.dataset.q; const t = document.getElementById('cfx-d1-sql'); if (t) t.value = el.dataset.q; runD1(ctx); },
    d1run: (el, ctx) => runD1(ctx),
    d1key: (el, ctx, e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); runD1(ctx); } },
    kvns: (el, ctx) => { st.kv = { ...st.kv, ns: el.value, res: null, err: null, back: [] }; runKv(ctx); },
    kvp: (el) => { st.kv.prefix = el.value; },
    kvkey: (el, ctx, e) => { if (e.key === 'Enter') { e.preventDefault(); st.kv.back = []; runKv(ctx); } },
    kvrun: (el, ctx) => { st.kv.back = []; runKv(ctx); },
    kvnext: (el, ctx) => { const cur = st.kv.res?.cursor; if (!cur) return; st.kv.back.push(st.kv.res.at || null); runKv(ctx, cur).then((r) => { if (r?.ok !== false && st.kv.res) st.kv.res.at = cur; }); },
    kvprev: (el, ctx) => { const cur = st.kv.back.pop(); runKv(ctx, cur || undefined).then((r) => { if (r?.ok !== false && st.kv.res) st.kv.res.at = cur; }); },
    r2b: (el, ctx) => { st.r2 = { ...st.r2, bucket: el.value, prefix: '', res: null, err: null }; runR2(ctx); },
    r2cd: (el, ctx) => { st.r2.prefix = el.dataset.p || ''; runR2(ctx); },
    r2up: (el, ctx) => { st.r2.prefix = st.r2.prefix.split('/').filter(Boolean).slice(0, -1).map((x) => `${x}/`).join(''); runR2(ctx); },
    r2run: (el, ctx) => runR2(ctx),
    gwid: (el, ctx) => { st.gw = { ...st.gw, id: el.value, res: null, err: null }; read(ctx, 'gw', { kind: 'gw-logs', gateway: st.gw.id }); },
    gwrun: (el, ctx) => read(ctx, 'gw', { kind: 'gw-logs', gateway: st.gw.id }),
  },
};
