// Repo Command HQ shell: sidebar + glass top bar, hash router, API client (?mock=1 only in demo),
// the confirm → POST → toast action path (with a dry-run mode that shows the exact upstream call
// and sends nothing), the Cmd/Ctrl+K palette, theme, and the 20-second live pulse.
import { html, agoSeconds, failCard } from './ui.js';
import { PLATFORMS, logo, brandVars, icon } from './logos.js';
import { mountField, rollAll, scramble, transition, recolourFields } from './fx.js';
import { catalog, REG } from './actions.js';
import hq from './pages/hq.js';
import overview from './pages/overview.js';
import explorer from './pages/explorer.js';
import repos from './pages/repos.js';
import apple from './pages/apple.js';
import github from './pages/github.js';
import cloudflare from './pages/cloudflare.js';
import supabase from './pages/supabase.js';
import sentry from './pages/sentry.js';
import hf from './pages/hf.js';
import roblox from './pages/roblox.js';
import groq from './pages/groq.js';
import discord from './pages/discord.js';
import langflow from './pages/langflow.js';
import connect from './pages/connect.js';
import status from './pages/status.js';

const PAGES = [hq, overview, explorer, repos, apple, github, cloudflare, supabase, sentry, hf, roblox, groq, discord, langflow, connect, status];
const GROUPS = [
  ['מרכז', ['hq', 'overview', 'explorer', 'repos']],
  ['פלטפורמות', ['apple', 'github', 'cloudflare', 'supabase', 'sentry', 'hf', 'roblox', 'groq', 'discord', 'langflow']],
  ['חיבורים', ['connect', 'status']],
];
const byId = Object.fromEntries(PAGES.map((p) => [p.id, p]));
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

// ---------- router & page lifecycle ----------
const cache = {}; // id -> {data, at}
let current = null; const seqs = {};
const ctx = {
  api, act, toast, store,
  get root() { return $('#page'); },
  get data() { return cache[current]?.data; },
  rerender: () => paint(current),
  refresh: () => load(current, { quiet: true }),
  go: (id) => { location.hash = `#/${id}`; },
};

function routeId() { const m = location.hash.match(/^#\/([\w-]+)/); return m && byId[m[1]] ? m[1] : 'hq'; }
const pulseOf = (p) => (store.pulse?.platforms || []).find((x) => x.id === (p.brand === 'hf' ? 'huggingface' : p.brand));

function navIcon(p) { return p.brand ? logo(p.brand, 'sm') : html`<span class="logo logo-sm logo-ui">${icon(p.glyph || p.id, 15)}</span>`; }
function renderNav() {
  $('#nav').innerHTML = GROUPS.map(([label, ids]) => html`<div class="nav-g"><p class="nav-gl">${label}</p>
    ${ids.map((id) => { const p = byId[id]; return html`<a class="nav-a" href="#/${id}" data-id="${id}">${navIcon(p)}<span class="nav-t" data-scramble>${p.nav || p.title}</span><i class="dot" data-dot="${id}" aria-hidden="true"></i></a>`; })}</div>`.s).join('');
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
  const links = d && d.ok !== false && p.links ? p.links(d) : [];
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
  const p = byId[id]; const root = $('#page'); const c = cache[id];
  const ae = document.activeElement; const fid = ae && root.contains(ae) ? ae.id : null;
  const sel = fid && 'selectionStart' in ae ? [ae.selectionStart, ae.selectionEnd] : null;
  const y = window.scrollY;
  let body;
  if (state === 'loading' && !c) body = skeleton();
  else if (!c) body = failCard('עדיין אין נתונים.', { retry: true });
  else if (c.data?.ok === false) body = failCard(c.data.reason, { retry: true, title: p.failTitle || 'לא הצלחנו להביא את הנתונים של הדף הזה' });
  else {
    try { body = p.render(c.data, ctx); } catch (e) {
      console.warn('render failed', e); // eslint-disable-line no-console
      body = failCard(`התקבלו נתונים בצורה שהדף לא ציפה לה (${e.message}).`, { title: 'שגיאה בהצגת הדף', retry: true });
    }
  }
  root.className = `page page-${id} ${p.brand ? 'pf' : ''} ${enter ? 'enter' : ''}`;
  root.setAttribute('style', p.brand ? brandVars(p.brand) : '');
  root.innerHTML = html`${head(p, state)}<div class="pbody">${body}</div>`.s;
  if (enter) [...root.querySelector('.pbody').children].forEach((el, i) => el.style.setProperty('--i', Math.min(i, 8)));
  for (const f of root.querySelectorAll('[data-nf]')) mountField(f);
  rollAll(root);
  p.after?.(root, ctx);
  if (!enter) window.scrollTo(0, y);
  if (fid) { const el = document.getElementById(fid); if (el) { el.focus({ preventScroll: true }); if (sel) try { el.setSelectionRange(...sel); } catch { /* not text */ } } }
}

async function fetchNeeds(p, fresh) {
  const q = fresh ? '?fresh=1' : '';
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
  const p = byId[id]; const my = (seqs[id] = (seqs[id] || 0) + 1);
  if (!quiet || !cache[id]) paint(id, 'loading', enter);
  let data;
  try { data = await fetchNeeds(p, fresh); } catch (e) { data = { ok: false, reason: e?.message || 'שגיאה לא צפויה.' }; }
  if (my !== seqs[id]) return;
  cache[id] = { data, at: Date.now() };
  if (data?.ok !== false) store.lastOk = Date.now();
  if (id === current && !$('#modal').open) paint(id, 'ready', enter && !quiet);
  liveTick();
}

function go() {
  const id = routeId(); const changed = id !== current; current = id;
  const p = byId[id]; document.title = `${p.title} · Apple HQ`;
  markNav(); closeMenu();
  const c = cache[id];
  const run = () => {
    if (changed) window.scrollTo(0, 0);
    if (c) { paint(id, 'ready', changed); if (Date.now() - c.at > POLL_MS) load(id, { quiet: true }); } else load(id, { enter: true });
  };
  if (changed && c) transition(run); else run();
  if (changed) $('#page').focus({ preventScroll: true });
}

// ---------- live pulse ----------
function takePulse(v) {
  store.pulse = v; store.pulseAt = Date.now();
  if (typeof v.ping?.ms === 'number') { store.pings.push(v.ping.ms); if (store.pings.length > 40) store.pings.shift(); }
  markDots();
}
async function poll() {
  if (store.paused || document.visibilityState !== 'visible' || $('#modal').open || $('#palette').open) return;
  const v = await api.get('/api/cc/pulse'); if (v?.ok !== false) { takePulse(v); store.seen.pulse = v; }
  if (current) load(current, { quiet: true });
}
function liveTick() {
  const el = $('#live'); if (!el) return;
  const age = store.lastOk ? Date.now() - store.lastOk : null;
  const state = store.paused ? 'paused' : age == null ? 'wait' : age > STALE_MS ? 'stale' : 'live';
  el.dataset.state = state;
  $('#live-t').textContent = state === 'paused' ? 'מושהה' : state === 'wait' ? 'מתחבר…' : state === 'stale' ? `לא עודכן ${agoSeconds(store.lastOk).replace('עודכן ', '')}` : `חי · ${agoSeconds(store.lastOk)}`;
  const pb = $('#pause'); pb.innerHTML = icon(store.paused ? 'play' : 'pause', 14).s; pb.setAttribute('aria-pressed', String(store.paused));
  pb.setAttribute('aria-label', store.paused ? 'להמשיך לעדכן אוטומטית' : 'להשהות את העדכון האוטומטי');
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
function paletteItems() {
  const pages = PAGES.map((p) => ({ kind: 'page', id: `go-${p.id}`, label: p.title, hint: p.brand ? PLATFORMS[p.brand].name : 'דף', platform: p.brand, glyph: p.glyph || p.id, run: () => ctx.go(p.id) }));
  const toggles = [
    { kind: 'toggle', id: 't-dry', label: store.dry ? 'כיבוי מצב ניסוי' : 'הדלקת מצב ניסוי (שום דבר לא נשלח)', hint: 'מתג', glyph: 'flask', run: () => setDry(!store.dry) },
    { kind: 'toggle', id: 't-theme', label: document.documentElement.dataset.theme === 'dark' ? 'מצב בהיר' : 'מצב כהה', hint: 'מתג', glyph: 'sun', run: () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark') },
    { kind: 'toggle', id: 't-pause', label: store.paused ? 'להמשיך עדכון חי' : 'להשהות עדכון חי', hint: 'מתג', glyph: 'pause', run: togglePause },
    { kind: 'toggle', id: 't-fresh', label: 'לרענן עכשיו מהמקור', hint: 'פעולה', glyph: 'refresh', run: () => load(current, { quiet: true, fresh: true }) },
  ];
  const acts = catalog(store.seen).map((a) => ({ kind: 'act', id: a.id, label: a.label, hint: a.hint, platform: a.platform, run: () => act(a) }));
  return [...pages, ...toggles, ...acts];
}
let palSel = 0; let palList = [];
function openPalette() {
  const dlg = $('#palette'); if (dlg.open) return;
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
    const grp = { page: 'דפים', toggle: 'מתגים', act: 'פעולות בלחיצה' }; let lastK = '';
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
  if (name === 'app:act') { const a = REG.get(el.dataset.aid) || catalog(store.seen).find((x) => x.id === el.dataset.aid); if (a) act(a); return; }
  if (name === 'app:dry') { setDry(!store.dry); return; }
  const fn = byId[current]?.actions?.[name];
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
  api.get('/api/cc/pulse').then((v) => { if (v?.ok !== false) { takePulse(v); store.seen.pulse = v; } });
  go();
}
boot();
