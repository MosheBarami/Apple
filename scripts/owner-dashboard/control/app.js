// Repo Command HQ shell: sidebar + top bar, hash router with lazily imported pages, skins (one CSS
// file per platform, swapped with a view transition), API client (?mock=1 only in demo), the
// confirm → POST → toast action path (with a dry-run mode that shows the exact upstream call and
// sends nothing), the Cmd/Ctrl+K palette, theme, the live stream (SSE, with a 20-second polling
// fallback) and the insights ticker.
//
// Page contract: control/pages/<id>.js default-exports
//   { id, title, nav, brand, needs:[apiName...], sub, links(d), render(d, ctx), actions:{...},
//     after?(root, ctx), mount?(root, ctx), unmount?() }
// render() runs on every refresh; a quiet refresh morphs the DOM (rows keyed by data-k slide in and
// fade out, .rn numbers roll). An element marked data-keep is left untouched by the morph, so a live
// widget started in mount() survives refreshes. mount() runs once per visit, unmount() on leaving;
// ctx.live(apiName, ms, fn) subscriptions are cancelled on leaving.
// A page may also ship control/actions/<id>.js exporting catalog(seen) → action specs for the palette.
import { html, agoSeconds, failCard } from './ui.js';
import { PLATFORMS, logo, brandVars, icon } from './logos.js';
import { mountField, rollAll, scramble, transition, recolourFields, morph, reduced } from './fx.js';
import { catalog, REG } from './actions.js';

// Every page the shell knows. The module itself is imported on first visit. skin: 'base' for the
// shell's own pages; platform pages use their id (control/skins/<id>.css, base when missing).
const PAGES = [
  { id: 'hq', title: 'מרכז הפיקוד', glyph: 'hq', skin: 'base' },
  { id: 'overview', title: 'סקירת AI', glyph: 'overview', skin: 'base' },
  { id: 'explorer', title: 'מפת הריפו', glyph: 'explorer', skin: 'base' },
  { id: 'repos', title: 'מאגרי GitHub', glyph: 'repos', skin: 'base' },
  { id: 'apple', title: 'Apple', brand: 'apple' },
  { id: 'tests', title: 'מעבדת בדיקות', glyph: 'flask' },
  { id: 'cloudflare', title: 'Cloudflare', brand: 'cloudflare' },
  { id: 'supabase', title: 'Supabase', brand: 'supabase' },
  { id: 'vercel', title: 'Vercel', brand: 'vercel' },
  { id: 'clerk', title: 'Clerk', brand: 'clerk' },
  { id: 'github', title: 'GitHub', brand: 'github' },
  { id: 'hf', title: 'Hugging Face', brand: 'huggingface' },
  { id: 'groq', title: 'Groq', brand: 'groq' },
  { id: 'langflow', title: 'Langflow', brand: 'langflow' },
  { id: 'sentry', title: 'Sentry', brand: 'sentry' },
  { id: 'discord', title: 'Discord', brand: 'discord' },
  { id: 'resend', title: 'Resend', brand: 'resend' },
  { id: 'roblox', title: 'Roblox', brand: 'roblox' },
  { id: 'connect', title: 'חיבורים', glyph: 'connect', skin: 'base' },
  { id: 'status', title: 'מצב הספקים', glyph: 'status', skin: 'base' },
];
const GROUPS = [
  ['מרכז', ['hq', 'overview', 'explorer', 'repos']],
  ['ריפו וידע', []],
  ['מוצר ותשתית', ['apple', 'cloudflare', 'supabase', 'vercel', 'clerk', 'github']],
  ['AI ומודלים', ['hf', 'groq', 'langflow']],
  ['תקלות, קהילה ומיילים', ['sentry', 'discord', 'resend', 'roblox']],
  ['מעבדה', ['tests']],
  ['חיבורים', ['connect', 'status']],
];
const byId = Object.fromEntries(PAGES.map((p) => [p.id, p]));
// A page listed only in GROUPS still routes: its title comes from its module once loaded (see page()).
for (const [, ids] of GROUPS) for (const id of ids) if (!byId[id]) PAGES.push(byId[id] = { id, title: id, glyph: 'bolt', auto: true });
const mods = {}; // id -> loaded page module (or the 'בבנייה' stand-in)
const MOCK = new URLSearchParams(location.search).get('mock') === '1';
const POLL_MS = 20_000;
const STALE_MS = 60_000;
const $ = (s, r = document) => r.querySelector(s);
const LS = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

// ---------- API ----------
let mockFetch = null;
async function rawFetch(path, opts = {}, timeoutMs = 25_000) {
  if (MOCK) {
    if (!mockFetch) mockFetch = (await import('./mock.js')).mockFetch;
    return mockFetch(path.split('?')[0], opts);
  }
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(path, { ...opts, signal: ctl.signal, cache: 'no-store' });
    let body = null; try { body = await res.json(); } catch { /* not JSON */ }
    if (!res.ok) {
      const reason = body?.reason || (res.status === 404 ? `השרת עוד לא מכיר את הכתובת ${path} (404).`
        : res.status === 401 || res.status === 403 ? 'השרת סירב לבקשה (אין הרשאה). רעננו את הדף ונסו שוב.' : `השרת החזיר שגיאה ${res.status}.`);
      return { ok: false, reason, status: res.status };
    }
    if (!body || typeof body !== 'object') return { ok: false, reason: 'השרת החזיר תשובה שאי אפשר לקרוא (לא JSON).' };
    return body;
  } catch (e) {
    return { ok: false, reason: e?.name === 'AbortError' ? 'השרת לא ענה בזמן (יותר מ-25 שניות). ננסה שוב בסיבוב הבא.' : 'אין חיבור לשרת של לוח הבקרה. האם הוא רץ במחשב?' };
  } finally { clearTimeout(timer); }
}
let token = null;
async function session() {
  if (token) return token;
  const s = await rawFetch('/api/cc/session');
  if (s?.ok === false || !s?.token) throw new Error(s?.reason || 'לא הצלחנו לקבל אישור פעולה מהשרת (session).');
  return (token = s.token);
}
export const api = {
  get: (path) => rawFetch(path),
  async post(path, body) {
    let t; try { t = await session(); } catch (e) { return { ok: false, reason: e.message }; }
    const send = (tk) => rawFetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cc-token': tk }, body: JSON.stringify({ ...body, confirm: true }) }, 90_000);
    let res = await send(t);
    if (res?.status === 401 || res?.status === 403) { token = null; try { res = await send(await session()); } catch { /* keep first answer */ } }
    return res;
  },
};

// ---------- state ----------
const store = {
  dry: LS.get('hq-dry', '0') === '1',
  paused: false,
  pulse: null, pulseAt: 0,
  pings: [], // client-side history of the worker's response time
  seen: {}, // endpoint -> latest payload (feeds the palette's action list)
  lastOk: 0,
  insights: null, // derived cross-platform conclusions (server cc/insights.mjs), red first
  streamAt: 0, // last event from /api/cc/stream
};

// ---------- toasts ----------
export function toast(msg, kind = 'ok', title) {
  const box = $('#toasts'); const el = document.createElement('div');
  el.className = `toast toast-${kind}`; el.setAttribute('role', kind === 'bad' ? 'alert' : 'status');
  el.innerHTML = html`<span class="toast-ic">${icon(kind === 'ok' ? 'check' : kind === 'bad' ? 'alert' : kind === 'dry' ? 'flask' : 'bolt', 16)}</span>
    <div class="toast-tx">${title ? html`<b>${title}</b>` : ''}<p dir="auto">${msg}</p></div>
    <button class="toast-x" aria-label="סגירת ההודעה">${icon('x', 14)}</button><i class="toast-t" aria-hidden="true"></i>`.s;
  el.querySelector('.toast-x').onclick = () => el.remove();
  const ms = kind === 'bad' ? 12_000 : 7_000; el.style.setProperty('--ms', `${ms}ms`);
  box.append(el); setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 220); }, ms);
}

// ---------- modals (focus trapped, Escape cancels) ----------
const FOCUSABLE = 'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
function trap(dlg, onEsc) {
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onEsc(); return; }
    if (e.key !== 'Tab') return;
    const f = [...dlg.querySelectorAll(FOCUSABLE)]; if (!f.length) return;
    const first = f[0]; const lastEl = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); } else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
  };
  dlg.addEventListener('keydown', onKey);
  return () => dlg.removeEventListener('keydown', onKey);
}
function confirmModal({ title, what, undo, reversible = true, danger = false, confirmLabel, platform }) {
  return new Promise((resolve) => {
    const dlg = $('#modal'); const opener = document.activeElement;
    const yesLabel = store.dry ? 'להציג מה יישלח (בלי לבצע)' : confirmLabel || 'כן, לבצע';
    dlg.innerHTML = html`<div class="modal-card ${danger ? 'is-danger' : ''}" style="${brandVars(platform)}">
      <div class="modal-h">${platform && PLATFORMS[platform] ? logo(platform, 'md') : html`<span class="logo logo-md">${icon('bolt', 18)}</span>`}
        <div><p class="eyebrow">${store.dry ? 'מצב ניסוי · שום דבר לא יישלח' : PLATFORMS[platform]?.name || 'פעולה'}</p><h2 id="modal-title">${title}</h2></div></div>
      <div class="modal-b"><p class="modal-k">מה ישתנה</p><p class="modal-what" dir="auto">${what}</p>
      <p class="modal-k">${reversible ? 'איך מבטלים' : 'שימו לב'}</p><p class="modal-undo ${reversible ? 'ok' : 'bad'}" dir="auto">${undo}</p></div>
      <div class="modal-actions">
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-m="yes">${store.dry ? icon('flask', 15) : icon('check', 15)}${yesLabel}</button>
        <button class="btn" data-m="no">ביטול</button>
      </div></div>`.s;
    dlg.setAttribute('aria-labelledby', 'modal-title'); dlg.oncancel = null;
    let done = false;
    const untrap = trap(dlg, () => close(false));
    const onCancel = (e) => { e.preventDefault(); close(false); };
    function close(v) {
      if (done) return; done = true; untrap(); dlg.removeEventListener('cancel', onCancel);
      if (!v) { dlg.close(); opener?.focus?.(); }
      resolve(v ? { dlg, finish: () => { dlg.close(); if (opener?.isConnected) opener.focus(); } } : null);
    }
    dlg.addEventListener('cancel', onCancel);
    dlg.onclick = (e) => { if (e.target === dlg) close(false); const b = e.target.closest('[data-m]'); if (b) close(b.dataset.m === 'yes'); };
    dlg.showModal();
    dlg.querySelector(danger ? '[data-m="no"]' : '[data-m="yes"]').focus();
  });
}
function planModal(spec, plan) {
  const dlg = $('#modal'); const opener = document.activeElement;
  const { method, url, body, ...rest } = plan || {};
  dlg.innerHTML = html`<div class="modal-card" style="${brandVars(spec.platform)}">
    <div class="modal-h"><span class="logo logo-md dry-ic">${icon('flask', 18)}</span>
      <div><p class="eyebrow">מצב ניסוי · לא נשלח כלום</p><h2 id="modal-title">זו הקריאה המדויקת שהייתה יוצאת</h2></div></div>
    <div class="modal-b"><p class="modal-what" dir="auto">${spec.title}</p>
      <div class="plan"><span class="plan-m m-${String(method || '').toLowerCase()}">${method || '—'}</span><bdi class="plan-u">${url || '—'}</bdi></div>
      ${body ? html`<pre class="plan-b" dir="ltr">${JSON.stringify(body, null, 2)}</pre>` : html`<p class="faint small">בלי גוף בקשה.</p>`}
      ${Object.keys(rest).length ? html`<pre class="plan-b" dir="ltr">${JSON.stringify(rest, null, 2)}</pre>` : ''}
      <p class="explain">כדי לבצע באמת: לכבות את "מצב ניסוי" למעלה וללחוץ שוב.</p></div>
    <div class="modal-actions"><button class="btn btn-primary" data-m="no">הבנתי</button></div></div>`.s;
  const untrap = trap(dlg, () => shut());
  function shut() { untrap(); dlg.close(); if (opener?.isConnected) opener.focus(); }
  dlg.onclick = (e) => { if (e.target === dlg || e.target.closest('[data-m]')) shut(); };
  dlg.oncancel = (e) => { e.preventDefault(); shut(); };
  dlg.showModal(); dlg.querySelector('[data-m]').focus();
}

/**
 * Every mutating action: modal → POST (token + confirm:true) → toast with the real answer → refresh.
 * In dry-run mode the POST carries dryRun:true; the server answers with the exact upstream call.
 */
async function act(spec) {
  const c = await confirmModal(spec); if (!c) return null;
  const yes = c.dlg.querySelector('[data-m="yes"]'); const no = c.dlg.querySelector('[data-m="no"]');
  yes.disabled = true; no.disabled = true; yes.textContent = store.dry ? 'בודק…' : 'מבצע…'; yes.setAttribute('aria-busy', 'true');
  const res = await api.post(spec.path, { ...spec.body, ...(store.dry ? { dryRun: true } : {}) });
  c.finish();
  if (res?.ok === false) { toast(res.reason || 'הפעולה נכשלה, בלי סיבה מהשרת.', 'bad', 'לא בוצע'); return res; }
  if (res?.dryRun) { planModal(spec, res.plan); return res; }
  toast(res?.note || res?.message || spec.okMsg || 'בוצע.', 'ok', PLATFORMS[spec.platform]?.name || 'בוצע');
  load(current, { quiet: true, fresh: true });
  return res;
}

// ---------- lazy pages ----------
function building(meta, detail) {
  return html`<div class="card wip" role="status"><span class="wip-ic" aria-hidden="true">${icon('bolt', 18)}</span>
    <div><b>הדף של ${meta.title} בבנייה</b><p>הדף הזה עוד נבנה. כל שאר הלוח עובד כרגיל, ואפשר לחזור לכאן בעוד כמה דקות.</p>
    ${detail ? html`<details class="nc-d"><summary>פרטים טכניים</summary><bdi class="mono small" dir="ltr">${detail}</bdi></details>` : ''}</div></div>`;
}
async function page(id) {
  if (mods[id]) return mods[id];
  const meta = byId[id];
  try {
    const m = (await import(`./pages/${id}.js`)).default;
    if (!m || typeof m.render !== 'function') throw new Error('the module has no default export with render()');
    mods[id] = { ...meta, ...m, id, brand: m.brand ?? meta.brand, skin: meta.skin };
    if (meta.auto) { // a GROUPS-only page names itself
      Object.assign(meta, { title: m.title || id, nav: m.nav, brand: m.brand, glyph: m.glyph || meta.glyph });
      const a = document.querySelector(`.nav-a[data-id="${id}"]`);
      if (a) { a.querySelector('.logo').outerHTML = navIcon(meta).s; a.querySelector('.nav-t').textContent = meta.nav || meta.title; a.setAttribute('aria-label', meta.nav || meta.title); }
    }
  } catch (e) {
    console.warn(`page ${id} is not ready`, e); // eslint-disable-line no-console
    mods[id] = { ...meta, wip: true, detail: e?.message || String(e), render: () => building(meta, e?.message) };
  }
  return mods[id];
}
const P = (id) => mods[id] || byId[id];

// ---------- skins ----------
// html[data-skin] names the active skin; <link id="skin"> carries its file. A missing file falls back
// to base silently and is remembered, so the next visit does not ask again.
const skinMissing = new Set();
const skinLinks = {}; // id -> loaded <link>
const skinOf = (id) => (byId[id]?.skin === 'base' || skinMissing.has(id) ? 'base' : id);
function skinReady(id) {
  const want = skinOf(id);
  if (want === 'base' || skinLinks[want]) return Promise.resolve();
  return new Promise((resolve) => {
    const el = document.createElement('link'); el.rel = 'stylesheet'; el.href = `/control/skins/${want}.css`; el.dataset.skinFile = want; el.media = 'not all';
    const done = (okay) => { clearTimeout(t); if (okay) skinLinks[want] = el; else { skinMissing.add(want); el.remove(); } resolve(); };
    const t = setTimeout(() => done(false), 2500);
    el.onload = () => done(true); el.onerror = () => done(false);
    document.head.append(el);
  });
}
function setSkin(id) {
  const want = skinOf(id);
  const root = document.documentElement;
  for (const [k, el] of Object.entries(skinLinks)) el.media = k === want ? 'all' : 'not all';
  const cur = document.getElementById('skin');
  if (cur) cur.href = want === 'base' ? '/control/skins/base.css' : `/control/skins/${want}.css`;
  root.dataset.skin = want;
}

// ---------- router & page lifecycle ----------
const cache = {}; // id -> {data, at}
let current = null; const seqs = {};
let navSeq = 0;
let mounted = null; // id of the page whose mount() ran for this visit
const subs = new Set(); // ctx.live subscriptions of the current page
const ctx = {
  api, act, toast, store,
  get root() { return $('#page'); },
  get data() { return cache[current]?.data; },
  get insights() { return store.insights; },
  rerender: () => paint(current),
  refresh: () => load(current, { quiet: true }),
  go: (id) => { location.hash = `#/${id}`; },
  /** Calls fn(payload) now, every `ms`, and whenever the stream says `apiName` refreshed. Returns a stop(). */
  live(apiName, ms, fn) {
    const sub = { apiName, dead: false, busy: false };
    sub.run = async () => {
      if (sub.dead || sub.busy) return; sub.busy = true;
      try { const v = await api.get(`/api/cc/${apiName}`); if (v?.ok !== false) store.seen[apiName] = v; if (!sub.dead) fn(v); } catch (e) { console.warn('live', apiName, e); } // eslint-disable-line no-console
      finally { sub.busy = false; }
    };
    sub.timer = setInterval(sub.run, Math.max(1000, ms || POLL_MS));
    sub.stop = () => { sub.dead = true; clearInterval(sub.timer); subs.delete(sub); };
    subs.add(sub); sub.run();
    return sub.stop;
  },
  runInsight: (x) => runInsight(x),
};
function teardown(id) {
  for (const s of [...subs]) s.stop();
  if (id && mounted === id) { try { P(id).unmount?.(); } catch (e) { console.warn('unmount', e); } } // eslint-disable-line no-console
  mounted = null;
}

function routeId() { const m = location.hash.match(/^#\/([\w-]+)/); return m && byId[m[1]] ? m[1] : 'hq'; }
const pulseOf = (p) => (store.pulse?.platforms || []).find((x) => x.id === (p.brand === 'hf' ? 'huggingface' : p.brand));

function navIcon(p) { return p.brand ? logo(p.brand, 'sm') : html`<span class="logo logo-sm logo-ui">${icon(p.glyph || p.id, 15)}</span>`; }
function navLink(id) { const p = byId[id]; return html`<a class="nav-a" href="#/${id}" data-id="${id}">${navIcon(p)}<span class="nav-t" data-scramble>${p.nav || p.title}</span><i class="dot" data-dot="${id}" aria-hidden="true"></i></a>`; }
function renderNav() {
  $('#nav').innerHTML = GROUPS.filter(([, ids]) => ids.length).map(([label, ids]) => html`<div class="nav-g"><p class="nav-gl">${label}</p>
    ${ids.map(navLink)}</div>`.s).join('');
  for (const a of document.querySelectorAll('#nav .nav-a')) {
    const lab = a.querySelector('[data-scramble]'); a.setAttribute('aria-label', lab.textContent);
    a.addEventListener('pointerenter', () => scramble(lab));
  }
  markDots();
}
function markDots() {
  let bad = 0, warn = 0;
  for (const el of document.querySelectorAll('[data-dot]')) {
    const p = byId[el.dataset.dot]; const s = p?.brand ? pulseOf(p)?.state : null;
    el.className = `dot ${s ? `dot-${s}` : ''}`;
    if (s) el.title = pulseOf(p).line || '';
    if (s === 'bad') bad++; else if (s === 'warn') warn++;
  }
  const hqDot = $('[data-dot="hq"]'); if (hqDot && store.pulse) hqDot.className = `dot dot-${bad ? 'bad' : warn ? 'warn' : 'ok'}`;
}
function markNav() {
  for (const a of document.querySelectorAll('#nav .nav-a[data-id]')) {
    const on = a.dataset.id === current; a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
}

function head(p, state) {
  const c = cache[p.id]; const d = c?.data;
  const pl = p.brand ? PLATFORMS[p.brand] : null; const pu = p.brand ? pulseOf(p) : null;
  let links = []; try { links = d && d.ok !== false && p.links ? p.links(d) || [] : []; } catch { links = []; }
  return html`<header class="phead ${p.brand ? 'phead-b' : ''}">
    <div class="phead-t">${p.brand ? logo(p.brand, 'lg') : html`<span class="logo logo-lg logo-ui">${icon(p.glyph || p.id, 24)}</span>`}
      <div class="phead-n"><p class="eyebrow">${pl ? pl.he : p.eyebrow || 'Apple · מרכז הפיקוד'}${pu ? html` · <span class="st st-${pu.state}"><i class="dot dot-${pu.state}"></i>${pu.line}</span>` : ''}</p>
        <h1 id="ptitle">${p.title}</h1>${p.sub ? html`<p class="psub">${p.sub}</p>` : ''}</div></div>
    <div class="phead-s">${links.map((l) => html`<a class="btn btn-sm btn-ghost" href="${l.url}" target="_blank" rel="noopener noreferrer">${l.label}${icon('ext', 13)}</a>`)}
      <button class="btn btn-sm" data-act="app:refresh" ${state === 'loading' ? 'disabled' : ''} aria-label="רענון עכשיו מהמקור">${icon('refresh', 14)}<span>רענון</span></button></div>
  </header>`;
}

function skeleton() {
  return html`<div class="skel" aria-busy="true" aria-label="טוען נתונים"><div class="sk sk-hero"></div><div class="g g4"><div class="sk h120"></div><div class="sk h120"></div><div class="sk h120"></div><div class="sk h120"></div></div><div class="g g2"><div class="sk h200"></div><div class="sk h200"></div></div></div>`;
}

function paint(id, state = 'ready', enter = false) {
  if (id !== current) return;
  const p = P(id); const root = $('#page'); const c = cache[id];
  const ae = document.activeElement; const fid = ae && root.contains(ae) ? ae.id : null;
  const sel = fid && 'selectionStart' in ae ? [ae.selectionStart, ae.selectionEnd] : null;
  const y = window.scrollY;
  let body; let real = false;
  if (p.wip) body = p.render();
  else if (state === 'loading' && !c) body = skeleton();
  else if (!c) body = failCard('עדיין אין נתונים.', { retry: true });
  else if (c.data?.ok === false) body = failCard(c.data.reason, { retry: true, title: p.failTitle || 'לא הצלחנו להביא את הנתונים של הדף הזה' });
  else {
    try { body = p.render(c.data, ctx); real = true; } catch (e) {
      console.warn('render failed', e); // eslint-disable-line no-console
      body = building(p, `render: ${e.message}`);
    }
  }
  const markup = html`${head(p, state)}<div class="pbody">${body}</div>`.s;
  // A quiet refresh of the page already on screen morphs it (animated diff); anything else replaces it.
  const same = root.dataset.pid === id && root.dataset.real === '1' && real && !enter;
  root.className = `page page-${id} ${p.brand ? 'pf' : ''} ${enter ? 'enter' : ''}`;
  root.setAttribute('style', p.brand ? brandVars(p.brand) : '');
  let morphed = false;
  if (same) { try { morph(root, markup); morphed = true; } catch (e) { console.warn('morph failed, repainting', e); } } // eslint-disable-line no-console
  if (!morphed) root.innerHTML = markup;
  root.dataset.pid = id; root.dataset.real = real ? '1' : '0';
  if (enter) [...root.querySelector('.pbody').children].forEach((el, i) => el.style.setProperty('--i', Math.min(i, 8)));
  for (const f of root.querySelectorAll('[data-nf]')) mountField(f);
  rollAll(root);
  try { p.after?.(root, ctx); } catch (e) { console.warn('after failed', e); } // eslint-disable-line no-console
  if (real && mounted !== id && p.mount) { mounted = id; try { p.mount(root, ctx); } catch (e) { console.warn('mount failed', e); } } // eslint-disable-line no-console
  if (!enter) window.scrollTo(0, y);
  if (fid) { const el = document.getElementById(fid); if (el && el !== document.activeElement) { el.focus({ preventScroll: true }); if (sel) try { el.setSelectionRange(...sel); } catch { /* not text */ } } }
}

async function fetchNeeds(p, fresh) {
  const q = fresh ? '?fresh=1' : '';
  if (p.wip) return { ok: true };
  if (!p.needs) {
    const d = await (p.load ? p.load(ctx) : api.get(p.endpoint));
    return d;
  }
  const out = { ok: true };
  await Promise.all(p.needs.map(async (n) => {
    const v = n === 'pulse' && !fresh && store.pulse && Date.now() - store.pulseAt < 5000 ? store.pulse : await api.get(`/api/cc/${n}${q}`);
    out[n] = v; if (v?.ok !== false) store.seen[n] = v;
    if (n === 'pulse' && v?.ok !== false) takePulse(v);
  }));
  const main = out[p.needs[0]];
  if (main?.ok === false && p.needs.length === 1) return main;
  out.fetchedAt = main?.fetchedAt;
  return out;
}

async function load(id, { quiet = false, fresh = false, enter = false } = {}) {
  const p = await page(id); const my = (seqs[id] = (seqs[id] || 0) + 1);
  if (!quiet || !cache[id]) paint(id, 'loading', enter);
  let data;
  try { data = await fetchNeeds(p, fresh); } catch (e) { data = { ok: false, reason: e?.message || 'שגיאה לא צפויה.' }; }
  if (my !== seqs[id]) return;
  cache[id] = { data, at: Date.now() };
  if (data?.ok !== false) store.lastOk = Date.now();
  if (id === current && !$('#modal').open) paint(id, 'ready', enter && !quiet);
  liveTick();
}

async function go() {
  const id = routeId(); const changed = id !== current;
  if (changed) teardown(current);
  current = id; const my = ++navSeq;
  const meta = byId[id]; document.title = `${meta.title} · Apple HQ`;
  markNav(); closeMenu();
  const [p] = await Promise.all([page(id), skinReady(id)]);
  if (my !== navSeq) return;
  for (const n of p.needs || []) listenPlatform(n);
  document.title = `${p.title} · Apple HQ`;
  const c = cache[id];
  const run = () => {
    setSkin(id);
    if (changed) window.scrollTo(0, 0);
    if (c) { paint(id, 'ready', changed); if (Date.now() - c.at > POLL_MS) load(id, { quiet: true }); } else load(id, { enter: true });
  };
  if (changed && (c || document.documentElement.dataset.skin !== skinOf(id))) transition(run); else run();
  if (changed) $('#page').focus({ preventScroll: true });
}

// ---------- live: stream first, polling as the fallback ----------
function takePulse(v) {
  store.pulse = v; store.pulseAt = Date.now();
  if (typeof v.ping?.ms === 'number') { store.pings.push(v.ping.ms); if (store.pings.length > 40) store.pings.shift(); }
  if (Array.isArray(v.insights)) takeInsights(v.insights);
  markDots();
}
const streamLive = () => Date.now() - store.streamAt < POLL_MS + 5000;
async function poll() {
  if (store.paused || document.visibilityState !== 'visible' || $('#modal').open || $('#palette').open) return;
  if (!streamLive()) {
    const [v, ins] = await Promise.all([api.get('/api/cc/pulse'), api.get('/api/cc/insights')]);
    if (v?.ok !== false) { takePulse(v); store.seen.pulse = v; }
    if (ins?.ok !== false && Array.isArray(ins?.insights)) takeInsights(ins.insights);
  }
  if (current) load(current, { quiet: true });
}
// A burst of platform:<id> events (one pulse refreshes many caches) becomes one quiet reload.
let bump = null;
function refreshSoon() {
  if (store.paused || bump) return;
  bump = setTimeout(() => { bump = null; if (current && !$('#modal').open && !$('#palette').open) load(current, { quiet: true }); }, 600);
}
let es = null; const heard = new Set();
function listenPlatform(name) {
  if (!es || heard.has(name)) return; heard.add(name);
  es.addEventListener(`platform:${name}`, () => {
    store.streamAt = Date.now();
    for (const s of subs) if (s.apiName === name) s.run();
    if ((P(current)?.needs || []).includes(name)) refreshSoon();
  });
}
function connectStream() {
  if (MOCK || !('EventSource' in window)) return;
  es = new EventSource('/api/cc/stream');
  es.addEventListener('hello', () => { store.streamAt = Date.now(); liveTick(); });
  es.addEventListener('pulse', (e) => {
    let v; try { v = JSON.parse(e.data); } catch { return; }
    store.streamAt = Date.now();
    if (v?.ok === false) return;
    takePulse(v); store.seen.pulse = v; store.lastOk = Date.now();
    for (const s of subs) if (s.apiName === 'pulse') s.run();
    const cur = P(current);
    if (!store.paused && cur?.needs?.includes('pulse') && cache[current]?.data && !$('#modal').open && !$('#palette').open) {
      cache[current].data.pulse = v; paint(current, 'ready');
    }
    liveTick();
  });
  es.onerror = () => { liveTick(); };
  for (const id of new Set(PAGES.map((p) => p.id).concat(['connectors', 'extras', 'status', 'apple']))) listenPlatform(id);
}
function liveTick() {
  const el = $('#live'); if (!el) return;
  const age = store.lastOk ? Date.now() - store.lastOk : null;
  const state = store.paused ? 'paused' : age == null ? 'wait' : age > STALE_MS ? 'stale' : 'live';
  el.dataset.state = state; el.dataset.via = streamLive() ? 'stream' : 'poll';
  $('#live-t').textContent = state === 'paused' ? 'מושהה' : state === 'wait' ? 'מתחבר…' : state === 'stale' ? `לא עודכן ${agoSeconds(store.lastOk).replace('עודכן ', '')}` : `${streamLive() ? 'שידור חי' : 'חי'} · ${agoSeconds(store.lastOk)}`;
  const pb = $('#pause'); pb.innerHTML = icon(store.paused ? 'play' : 'pause', 14).s; pb.setAttribute('aria-pressed', String(store.paused));
  pb.setAttribute('aria-label', store.paused ? 'להמשיך לעדכן אוטומטית' : 'להשהות את העדכון האוטומטי');
}

// ---------- insights: the top-bar ticker and the one-click path ----------
const SEV_HE = { bad: 'דחוף', warn: 'לבדוק', info: 'לידיעה' };
let tickI = 0; let tickTimer = null; let tickSig = '';
function takeInsights(list) {
  store.insights = list;
  const sig = list.map((x) => x.id + x.title).join('|');
  if (sig === tickSig) return; tickSig = sig;
  tickI = 0; drawTicker(true);
  clearInterval(tickTimer);
  if (list.length > 1) tickTimer = setInterval(() => { if (!store.paused && document.visibilityState === 'visible') { tickI = (tickI + 1) % Math.min(list.length, 6); drawTicker(false); } }, 6000);
  markDots();
}
function drawTicker(first) {
  const box = $('#itk'); if (!box) return;
  const list = store.insights || [];
  if (!list.length) { box.hidden = true; return; }
  box.hidden = false;
  const bad = list.filter((x) => x.sev === 'bad').length; const warn = list.filter((x) => x.sev === 'warn').length;
  const x = list[tickI] || list[0];
  const cnt = $('#itk-n'); cnt.textContent = bad ? `${bad} דחוף` : warn ? `${warn} לבדוק` : `${list.length}`; cnt.dataset.sev = bad ? 'bad' : warn ? 'warn' : 'info';
  const line = document.createElement('button');
  line.className = `itk-l sev-${x.sev}`; line.type = 'button'; line.dataset.i = String(list.indexOf(x));
  line.innerHTML = html`${PLATFORMS[x.platform] ? logo(x.platform, 'sm') : ''}<span class="itk-t" dir="auto">${x.title}</span><span class="sr"> · ${SEV_HE[x.sev]}</span>`.s;
  line.title = x.why || '';
  const vp = $('#itk-v'); const old = vp.firstElementChild;
  vp.append(line);
  if (old) { if (reduced() || first) old.remove(); else { old.classList.add('out'); setTimeout(() => old.remove(), 360); } }
}
function runInsight(x) {
  const a = x?.action; if (!a) return;
  if (a.type === 'url' && a.url) { window.open(a.url, '_blank', 'noopener,noreferrer'); return; }
  if (a.type === 'act') { const spec = REG.get(a.id) || allActions().find((s) => s.id === a.id); if (spec) { act(spec); return; } }
  if (a.page && byId[a.page]) ctx.go(a.page);
}

// ---------- toggles ----------
function setTheme(t) {
  document.documentElement.dataset.theme = t; LS.set('hq-theme', t);
  const b = $('#theme'); b.innerHTML = icon(t === 'dark' ? 'sun' : 'moon', 16).s; b.setAttribute('aria-label', t === 'dark' ? 'מעבר למצב בהיר' : 'מעבר למצב כהה');
  recolourFields();
}
function setDry(v) {
  store.dry = v; LS.set('hq-dry', v ? '1' : '0');
  const b = $('#dry'); b.setAttribute('aria-pressed', String(v)); b.classList.toggle('on', v);
  document.body.classList.toggle('is-dry', v);
}
const togglePause = () => { store.paused = !store.paused; liveTick(); if (!store.paused) poll(); };

// ---------- command palette ----------
// Every registered action: the shell's catalogue plus each platform's control/actions/<id>.js
// (export catalog(seen) or a default function), fed with whatever payloads are loaded.
const laneActs = {}; // id -> catalog fn | null (no file)
async function loadLaneActions() {
  await Promise.all(PAGES.filter((p) => p.brand && !(p.id in laneActs)).map(async (p) => {
    try { const m = await import(`./actions/${p.id}.js`); laneActs[p.id] = typeof m.catalog === 'function' ? m.catalog : typeof m.default === 'function' ? m.default : null; } catch { laneActs[p.id] = null; }
  }));
}
function allActions() {
  const out = catalog(store.seen); const ids = new Set(out.map((a) => a.id));
  for (const fn of Object.values(laneActs)) {
    if (!fn) continue;
    let list = []; try { list = fn(store.seen) || []; } catch (e) { console.warn('lane catalog failed', e); } // eslint-disable-line no-console
    for (const a of list) if (a?.id && a.path && !ids.has(a.id)) { ids.add(a.id); out.push(a); }
  }
  return out;
}
function paletteItems() {
  const pages = PAGES.map((p) => ({ kind: 'page', id: `go-${p.id}`, label: p.title, hint: p.brand ? PLATFORMS[p.brand].name : 'דף', platform: p.brand, glyph: p.glyph || p.id, run: () => ctx.go(p.id) }));
  const ins = (store.insights || []).map((x, i) => ({ kind: 'insight', id: `in-${i}`, label: x.title, hint: `${SEV_HE[x.sev]} · ${x.action?.label || ''}`, platform: PLATFORMS[x.platform] ? x.platform : null, glyph: 'alert', run: () => runInsight(x) }));
  const toggles = [
    { kind: 'toggle', id: 't-dry', label: store.dry ? 'כיבוי מצב ניסוי' : 'הדלקת מצב ניסוי (שום דבר לא נשלח)', hint: 'מתג', glyph: 'flask', run: () => setDry(!store.dry) },
    { kind: 'toggle', id: 't-theme', label: document.documentElement.dataset.theme === 'dark' ? 'מצב בהיר' : 'מצב כהה', hint: 'מתג', glyph: 'sun', run: () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark') },
    { kind: 'toggle', id: 't-pause', label: store.paused ? 'להמשיך עדכון חי' : 'להשהות עדכון חי', hint: 'מתג', glyph: 'pause', run: togglePause },
    { kind: 'toggle', id: 't-fresh', label: 'לרענן עכשיו מהמקור', hint: 'פעולה', glyph: 'refresh', run: () => load(current, { quiet: true, fresh: true }) },
  ];
  const acts = allActions().map((a) => ({ kind: 'act', id: a.id, label: a.label, hint: a.hint, platform: a.platform, run: () => act(a) }));
  return [...ins, ...pages, ...toggles, ...acts];
}
let palSel = 0; let palList = [];
async function openPalette() {
  const dlg = $('#palette'); if (dlg.open) return;
  await loadLaneActions();
  const opener = document.activeElement;
  dlg.innerHTML = html`<div class="pal"><label class="pal-in">${icon('search', 18)}<span class="sr">חיפוש דף או פעולה</span>
    <input id="pal-q" type="text" placeholder="לאן לקפוץ או מה לעשות? (למשל: הרצה, Sentry, בהיר)" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-autocomplete="list">
    <kbd>Esc</kbd></label><ul id="pal-list" class="pal-list" role="listbox" aria-label="תוצאות"></ul>
    <p class="pal-f"><span><kbd>↑</kbd><kbd>↓</kbd> בחירה</span><span><kbd>Enter</kbd> ביצוע</span>${store.dry ? html`<span class="pal-dry">${icon('flask', 13)} מצב ניסוי דלוק</span>` : ''}</p></div>`.s;
  const all = paletteItems(); const q = $('#pal-q');
  const draw = () => {
    const s = q.value.trim().toLowerCase();
    palList = (s ? all.filter((x) => `${x.label} ${x.hint} ${x.platform || ''} ${PLATFORMS[x.platform]?.name || ''}`.toLowerCase().includes(s)) : all).slice(0, 40);
    palSel = Math.min(palSel, Math.max(0, palList.length - 1));
    const grp = { insight: 'מה קורה עכשיו', page: 'דפים', toggle: 'מתגים', act: 'פעולות בלחיצה' }; let lastK = '';
    $('#pal-list').innerHTML = palList.length ? palList.map((x, i) => {
      const h = x.kind !== lastK ? html`<li class="pal-g" role="presentation">${grp[x.kind]}</li>` : ''; lastK = x.kind;
      return html`${h}<li id="pal-${i}" class="pal-i ${i === palSel ? 'on' : ''}" role="option" aria-selected="${i === palSel}" data-i="${i}">
        ${x.platform ? logo(x.platform, 'sm') : html`<span class="logo logo-sm logo-ui">${icon(x.glyph, 14)}</span>`}<span class="pal-l">${x.label}</span><span class="pal-h">${x.hint}</span></li>`.s;
    }).join('') : html`<li class="pal-empty">לא נמצא. נסו מילה אחרת.</li>`.s;
    q.setAttribute('aria-activedescendant', palList.length ? `pal-${palSel}` : '');
    $(`#pal-${palSel}`)?.scrollIntoView({ block: 'nearest' });
  };
  const close = () => { untrap(); dlg.close(); if (opener?.isConnected) opener.focus(); };
  const run = (i) => { const x = palList[i]; if (!x) return; close(); setTimeout(x.run, 0); };
  const untrap = trap(dlg, close);
  q.addEventListener('input', () => { palSel = 0; draw(); });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); palSel = (palSel + 1) % Math.max(1, palList.length); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); palSel = (palSel - 1 + palList.length) % Math.max(1, palList.length); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(palSel); }
  });
  dlg.onclick = (e) => { if (e.target === dlg) close(); const li = e.target.closest('.pal-i'); if (li) run(+li.dataset.i); };
  dlg.oncancel = (e) => { e.preventDefault(); close(); };
  palSel = 0; draw(); dlg.showModal(); q.focus();
}

// ---------- events (delegated) ----------
function dispatch(e, attr) {
  const el = e.target.closest(`[${attr}]`); if (!el || !$('#page').contains(el)) return;
  const name = el.getAttribute(attr);
  if (name === 'app:refresh') { load(current, { quiet: !!cache[current], fresh: true }); return; }
  if (name === 'app:act') { const a = REG.get(el.dataset.aid) || allActions().find((x) => x.id === el.dataset.aid); if (a) act(a); return; }
  if (name === 'app:dry') { setDry(!store.dry); return; }
  if (name === 'app:insight') { const l = store.insights || []; const x = el.dataset.iid ? l.find((y) => y.id === el.dataset.iid) : l[+el.dataset.i]; if (x) runInsight(x); return; }
  const fn = P(current)?.actions?.[name];
  if (fn) { if (attr === 'data-act' && el.tagName === 'A' && !el.getAttribute('href')) e.preventDefault(); fn(el, ctx, e); }
}
document.addEventListener('click', (e) => dispatch(e, 'data-act'));
document.addEventListener('input', (e) => dispatch(e, 'data-input'));
document.addEventListener('change', (e) => dispatch(e, 'data-change'));
document.addEventListener('keydown', (e) => dispatch(e, 'data-key'));

function closeMenu() { document.body.classList.remove('nav-open'); $('#menu-btn')?.setAttribute('aria-expanded', 'false'); }
function boot() {
  if (MOCK) document.body.classList.add('is-mock');
  setTheme(LS.get('hq-theme', 'dark') === 'light' ? 'light' : 'dark');
  setDry(store.dry);
  renderNav();
  $('#theme').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  $('#dry').onclick = () => { setDry(!store.dry); toast(store.dry ? 'כל לחיצה על פעולה תראה בדיוק מה היה נשלח, בלי לשלוח.' : 'פעולות יתבצעו באמת (אחרי אישור).', store.dry ? 'dry' : 'info', store.dry ? 'מצב ניסוי דלוק' : 'מצב ניסוי כבוי'); };
  $('#pause').onclick = togglePause;
  $('#fresh').onclick = () => load(current, { quiet: true, fresh: true });
  $('#pal-btn').onclick = openPalette;
  $('#menu-btn').onclick = () => { const o = document.body.classList.toggle('nav-open'); $('#menu-btn').setAttribute('aria-expanded', String(o)); if (o) $('#nav a')?.focus(); };
  $('#scrim').onclick = closeMenu;
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
    else if (e.key === 'Escape' && document.body.classList.contains('nav-open')) { closeMenu(); $('#menu-btn').focus(); }
  });
  window.addEventListener('hashchange', go);
  setInterval(() => { for (const el of document.querySelectorAll('[data-ago]')) if (el.dataset.ago) el.textContent = agoSeconds(el.dataset.ago); liveTick(); }, 1000);
  setInterval(poll, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - store.lastOk > POLL_MS) poll(); });
  $('#itk-v').onclick = (e) => { const b = e.target.closest('.itk-l'); const x = b && (store.insights || [])[+b.dataset.i]; if (x) runInsight(x); };
  connectStream();
  if (!es) {
    api.get('/api/cc/pulse').then((v) => { if (v?.ok !== false) { takePulse(v); store.seen.pulse = v; } });
    api.get('/api/cc/insights').then((v) => { if (v?.ok !== false && Array.isArray(v?.insights)) takeInsights(v.insights); });
  }
  go();
  // GROUPS-only pages: load their module when idle so the nav shows their real names
  (window.requestIdleCallback || setTimeout)(() => { for (const p of PAGES) if (p.auto) page(p.id); });
}
boot();
