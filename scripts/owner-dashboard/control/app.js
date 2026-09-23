// Executive Control Center shell: hash router, API client (with ?mock=1 fallback only),
// confirmation modal, toasts, "updated X ago" ticker and the 60 s refresh of the visible page.
import { html, esc, agoSeconds, failCard } from './ui.js';
import overview from './pages/overview.js';
import explorer from './pages/explorer.js';
import repos from './pages/repos.js';
import github from './pages/github.js';
import supabase from './pages/supabase.js';
import cloudflare from './pages/cloudflare.js';
import sentry from './pages/sentry.js';
import hf from './pages/hf.js';
import more from './pages/more.js';

const PAGES = [overview, explorer, repos, github, supabase, cloudflare, sentry, hf, more];
const byId = Object.fromEntries(PAGES.map((p) => [p.id, p]));
const MOCK = new URLSearchParams(location.search).get('mock') === '1';
const REFRESH_MS = 60_000;
const $ = (s, r = document) => r.querySelector(s);

// ---------- API ----------
let mockFetch = null;
async function rawFetch(path, opts = {}, timeoutMs = 25_000) {
  if (MOCK) {
    if (!mockFetch) mockFetch = (await import('./mock.js')).mockFetch;
    return mockFetch(path, opts);
  }
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(path, { ...opts, signal: ctl.signal, cache: 'no-store' });
    let body = null; try { body = await res.json(); } catch { /* not JSON */ }
    if (!res.ok) {
      const reason = body?.reason || (res.status === 404 ? `השרת עוד לא מכיר את הכתובת ${path} (404). כנראה שהחלק הזה בשרת עדיין לא מוכן.`
        : res.status === 401 || res.status === 403 ? 'השרת סירב לבקשה (אין הרשאה). רעננו את הדף ונסו שוב.'
          : `השרת החזיר שגיאה ${res.status}.`);
      return { ok: false, reason, status: res.status };
    }
    if (!body || typeof body !== 'object') return { ok: false, reason: 'השרת החזיר תשובה שאי אפשר לקרוא (לא JSON).' };
    return body;
  } catch (e) {
    return { ok: false, reason: e?.name === 'AbortError' ? 'השרת לא ענה בזמן (עברו יותר מ-25 שניות). ננסה שוב בעוד דקה.' : 'אין חיבור לשרת של לוח הבקרה. האם הוא רץ במחשב?' };
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

// ---------- toasts ----------
export function toast(msg, kind = 'ok') {
  const box = $('#toasts'); const el = document.createElement('div');
  el.className = `toast toast-${kind}`; el.setAttribute('role', kind === 'bad' ? 'alert' : 'status');
  el.innerHTML = `<span class="toast-ic" aria-hidden="true">${kind === 'ok' ? '✓' : kind === 'bad' ? '✗' : 'i'}</span><p dir="auto">${esc(msg)}</p><button class="toast-x" aria-label="סגירת ההודעה">×</button>`;
  el.querySelector('.toast-x').onclick = () => el.remove();
  box.append(el); setTimeout(() => el.remove(), kind === 'bad' ? 12_000 : 8_000);
}

// ---------- confirmation modal (focus trapped, Escape cancels) ----------
const FOCUSABLE = 'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
function confirmModal({ title, what, undo, reversible = true, danger = false, confirmLabel = 'כן, לבצע' }) {
  return new Promise((resolve) => {
    const dlg = $('#modal'); const opener = document.activeElement;
    dlg.innerHTML = html`<div class="modal-card ${danger ? 'is-danger' : ''}">
      <h2 id="modal-title">${title}</h2>
      <p class="modal-what" dir="auto">${what}</p>
      <p class="modal-undo ${reversible ? 'ok' : 'bad'}"><b>${reversible ? 'אפשר לבטל?' : 'שימו לב:'}</b> ${undo}</p>
      <div class="modal-actions">
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-m="yes">${confirmLabel}</button>
        <button class="btn" data-m="no">ביטול</button>
      </div></div>`.s;
    dlg.setAttribute('aria-labelledby', 'modal-title');
    let done = false;
    const close = (v) => {
      if (done) return; done = true; dlg.removeEventListener('keydown', onKey); dlg.removeEventListener('cancel', onCancel);
      if (!v) { dlg.close(); opener?.focus?.(); }
      resolve(v ? { dlg, opener, finish: () => { dlg.close(); opener?.isConnected && opener.focus(); } } : null);
    };
    const onCancel = (e) => { e.preventDefault(); close(false); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(false); return; }
      if (e.key !== 'Tab') return;
      const f = [...dlg.querySelectorAll(FOCUSABLE)]; if (!f.length) return;
      const first = f[0]; const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    dlg.addEventListener('keydown', onKey); dlg.addEventListener('cancel', onCancel);
    dlg.onclick = (e) => { if (e.target === dlg) close(false); const b = e.target.closest('[data-m]'); if (b) close(b.dataset.m === 'yes'); };
    dlg.showModal();
    // safest default: focus lands on "cancel" for destructive actions
    dlg.querySelector(danger ? '[data-m="no"]' : '[data-m="yes"]').focus();
  });
}

/**
 * Every mutating action goes through here: modal → POST (token + confirm:true) → toast → refresh.
 * spec: {title, what, undo, reversible, danger, confirmLabel, path, body, okMsg}
 */
async function act(spec) {
  const c = await confirmModal(spec); if (!c) return null;
  const yes = c.dlg.querySelector('[data-m="yes"]'); const no = c.dlg.querySelector('[data-m="no"]');
  yes.disabled = true; no.disabled = true; yes.textContent = 'מבצע…'; yes.setAttribute('aria-busy', 'true');
  const res = await api.post(spec.path, spec.body);
  c.finish();
  const note = res?.note || res?.message || res?.reason;
  if (res?.ok === false) toast(note || 'הפעולה נכשלה, בלי סיבה מהשרת.', 'bad');
  else toast(note || spec.okMsg || 'בוצע.', 'ok');
  load(current, { quiet: true });
  return res;
}

// ---------- router & page lifecycle ----------
const cache = {}; // id -> {data, at}
let current = null; const seqs = {};
const ctx = {
  api, act, toast,
  get root() { return $('#page'); },
  get data() { return cache[current]?.data; },
  rerender: () => paint(current),
  refresh: () => load(current, { quiet: true }),
};

function routeId() { const m = location.hash.match(/^#\/([\w-]+)/); return m && byId[m[1]] ? m[1] : 'overview'; }

function renderNav() {
  const items = PAGES.map((p) => html`<a class="nav-a" href="#/${p.id}" data-id="${p.id}">${p.icon ? html`<span class="nav-ic" aria-hidden="true">${p.icon}</span>` : ''}${p.nav || p.title}</a>`);
  $('#nav').innerHTML = html`${items}<a class="nav-a nav-live" href="/live"><span class="nav-ic" aria-hidden="true">◉</span>העבודה החיה</a>`.s;
}
function markNav() {
  for (const a of document.querySelectorAll('#nav .nav-a[data-id]')) {
    const on = a.dataset.id === current; a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
}

function head(p, state) {
  const c = cache[p.id];
  const at = c?.data?.fetchedAt || c?.at;
  return html`<div class="phead">
    <div class="phead-t">${p.mark || ''}<div><h1 id="ptitle">${p.title}</h1>${p.sub ? html`<p class="psub">${p.sub}</p>` : ''}</div></div>
    <div class="phead-s">
      <span class="ago" data-ago="${at ? new Date(at).toISOString() : ''}" aria-live="off">${state === 'loading' ? 'טוען…' : at ? agoSeconds(at) : ''}</span>
      <button class="btn btn-sm" data-act="app:refresh" ${state === 'loading' ? 'disabled' : ''}>↻ רענון</button>
    </div></div>`;
}

function skeleton() {
  return html`<div class="skel" aria-busy="true" aria-label="טוען נתונים"><div class="sk h40"></div><div class="g g3"><div class="sk h120"></div><div class="sk h120"></div><div class="sk h120"></div></div><div class="sk h200"></div></div>`;
}

function paint(id, state = 'ready') {
  if (id !== current) return;
  const p = byId[id]; const root = $('#page'); const c = cache[id];
  // keep focus + caret across re-renders (search boxes survive the 60 s refresh)
  const ae = document.activeElement; const fid = ae && root.contains(ae) ? ae.id : null;
  const sel = fid && 'selectionStart' in ae ? [ae.selectionStart, ae.selectionEnd] : null;
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
  root.className = `page page-${id} ${p.theme ? `pf pf-${p.theme}` : ''}`;
  root.innerHTML = html`${head(p, state)}<div class="pbody">${body}</div>`.s;
  if (fid) { const el = document.getElementById(fid); if (el) { el.focus(); if (sel) try { el.setSelectionRange(...sel); } catch { /* not text */ } } }
}

async function load(id, { quiet = false } = {}) {
  const p = byId[id]; const my = (seqs[id] = (seqs[id] || 0) + 1);
  if (!quiet || !cache[id]) paint(id, 'loading');
  let data;
  try { data = await (p.load ? p.load(ctx) : api.get(p.endpoint)); } catch (e) { data = { ok: false, reason: e?.message || 'שגיאה לא צפויה.' }; }
  if (my !== seqs[id]) return; // a newer request for this page already started
  cache[id] = { data, at: Date.now() };
  paint(id);
}

function go() {
  const id = routeId(); const changed = id !== current; current = id;
  const p = byId[id]; document.title = `${p.title} · מרכז הבקרה של Apple`;
  markNav(); closeMenu();
  if (changed) window.scrollTo(0, 0);
  const c = cache[id];
  if (c) { paint(id); if (Date.now() - c.at > REFRESH_MS) load(id, { quiet: true }); } else load(id);
  if (changed) $('#page').focus({ preventScroll: true });
}

// ---------- events (delegated) ----------
function dispatch(e, attr) {
  const el = e.target.closest(`[${attr}]`); if (!el || !$('#page').contains(el)) return;
  const name = el.getAttribute(attr);
  if (name === 'app:refresh') { load(current, { quiet: !!cache[current] }); return; }
  const fn = byId[current]?.actions?.[name];
  if (fn) { if (attr === 'data-act' && el.tagName === 'A' && !el.getAttribute('href')) e.preventDefault(); fn(el, ctx, e); }
}
document.addEventListener('click', (e) => dispatch(e, 'data-act'));
document.addEventListener('input', (e) => dispatch(e, 'data-input'));
document.addEventListener('change', (e) => dispatch(e, 'data-change'));
document.addEventListener('keydown', (e) => dispatch(e, 'data-key'));

const menuBtn = () => $('#menu-btn');
function closeMenu() { $('#nav').classList.remove('open'); menuBtn()?.setAttribute('aria-expanded', 'false'); }
function boot() {
  renderNav();
  if (MOCK) document.body.classList.add('is-mock');
  menuBtn().addEventListener('click', () => { const o = $('#nav').classList.toggle('open'); menuBtn().setAttribute('aria-expanded', String(o)); if (o) $('#nav a')?.focus(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#nav').classList.contains('open')) { closeMenu(); menuBtn().focus(); } });
  window.addEventListener('hashchange', go);
  setInterval(() => { for (const el of document.querySelectorAll('[data-ago]')) if (el.dataset.ago) el.textContent = agoSeconds(el.dataset.ago); }, 1000);
  setInterval(() => { if (document.visibilityState === 'visible' && current && !$('#modal').open) load(current, { quiet: true }); }, REFRESH_MS);
  document.addEventListener('visibilitychange', () => { const c = cache[current]; if (document.visibilityState === 'visible' && c && Date.now() - c.at > REFRESH_MS) load(current, { quiet: true }); });
  go();
}
boot();
