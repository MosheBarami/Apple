// Vercel: the dashboard's own chrome (scope switcher, project switcher, tabs) over real API data.
// Overview = the team page (deployments gauge + project cards), Deployments = the filterable list with
// status dots and the ⋯ menu (Instant Rollback / Promote / Redeploy / Cancel, each behind the confirm
// modal), Settings = General / Domains / Environment Variables (names only) / Git. Tabs the token cannot
// read (Analytics, Speed Insights, Logs, Observability, Storage) open the same view on vercel.com.
// Without VERCEL_TOKEN the same chrome renders the one-step connect state; the server sends nothing.
// Icons: Feather 4.29.2 (MIT, github.com/feathericons/feather), inlined below. Vercel mark per its brand guidelines.
import { html, raw, num, ago, arr, duration, rel } from '../ui.js';
import { rn } from '../fx.js';
import { aid } from '../actions.js';
import { offer } from '../actions/vercel.js';

const I = {
  branch: '<line x1="6" y1="3" x2="6" y2="15"></line><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M18 9a9 9 0 0 1-9 9"></path>',
  commit: '<circle cx="12" cy="12" r="4"></circle><line x1="1.05" y1="12" x2="7" y2="12"></line><line x1="17.01" y1="12" x2="22.96" y2="12"></line>',
  chev: '<polyline points="6 9 12 15 18 9"></polyline>',
  search: '<circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>',
  refresh: '<polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>',
  ext: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line>',
  more: '<circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle>',
  rollback: '<polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>',
  promote: '<circle cx="12" cy="12" r="10"></circle><polyline points="16 12 12 8 8 12"></polyline><line x1="12" y1="16" x2="12" y2="8"></line>',
  xc: '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>',
  okc: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>',
  warn: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>',
  info: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>',
  globe: '<circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>',
  key: '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>',
  github: '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>',
  check: '<polyline points="20 6 9 17 4 12"></polyline>',
  x: '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>',
  activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>',
  layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline>',
};
const ic = (n, s = 16) => raw(`<svg class="vcx-i" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`);
const MARK = raw('<svg class="vcx-mark" viewBox="0 0 76 65" width="18" height="16" aria-hidden="true"><path d="M37.53 0 75.06 65H0z" fill="currentColor"/></svg>');

const TABS = [['overview', 'Overview'], ['deployments', 'Deployments'], ['analytics', 'Analytics'], ['speed', 'Speed Insights'], ['logs', 'Logs'],
  ['observability', 'Observability'], ['storage', 'Storage'], ['settings', 'Settings']];
const REMOTE = { analytics: ['Analytics', 'analytics', 'מבקרים, דפים ומקורות תנועה'], speed: ['Speed Insights', 'speed-insights', 'Core Web Vitals מדפדפנים אמיתיים'],
  logs: ['Logs', 'logs', 'שורות הריצה של הפונקציות'], observability: ['Observability', 'observability', 'שגיאות, זמני תגובה ובקשות לפי נתיב'],
  storage: ['Storage', 'stores', 'Blob, Edge Config ומסדי נתונים מחוברים'] };
const STATES = [['READY', 'Ready', 'ready'], ['ERROR', 'Error', 'error'], ['BUILDING', 'Building', 'building'], ['QUEUED', 'Queued', 'queued'], ['CANCELED', 'Canceled', 'canceled']];
const SK = Object.fromEntries(STATES.map(([k, l, c]) => [k, [l, c]]));
SK.INITIALIZING = ['Initializing', 'building']; SK.BLOCKED = ['Blocked', 'error'];
const LIVE = new Set(['BUILDING', 'QUEUED', 'INITIALIZING']);
const NOTE = { bad: ['error', 'xc'], warn: ['warning', 'warn'], good: ['success', 'okc'], info: ['secondary', 'info'] };

const st = { tab: 'overview', project: '', q: '', env: '', status: new Set(['READY', 'ERROR', 'BUILDING', 'QUEUED', 'INITIALIZING', 'CANCELED', 'BLOCKED']), menu: '', pop: '', set: 'general' };
let offDoc = null;

const L = (s) => html`<bdi dir="ltr">${s}</bdi>`;
const hash = (s) => [...String(s || '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
// Vercel's default avatar is a two-stop gradient keyed by the account; no image is fetched.
const avatar = (seed, size = 20) => { const h = hash(seed); return html`<span class="vcx-av" style="--s:${size}px;--a:${h % 360};--b:${(h >> 9) % 360}" aria-hidden="true"></span>`; };
const dot = (state) => { const [l, c] = SK[state] || [state || '—', 'queued']; return html`<span class="vcx-st vcx-st-${c}"><i class="vcx-dot"></i><span>${l}</span></span>`; };
const badge = (text, tone = 'gray', cls = '') => html`<span class="vcx-badge vcx-badge-${tone} ${cls}">${text}</span>`;
const vbtn = (spec, label, icn, kind = 'secondary') => html`<button class="vcx-btn vcx-btn-${kind} vcx-btn-sm" data-act="app:act" data-aid="${aid(spec)}">${icn ? ic(icn) : ''}<span>${label}</span></button>`;
const extA = (url, label, kind = 'secondary', sm = true) => (url ? html`<a class="vcx-btn vcx-btn-${kind} ${sm ? 'vcx-btn-sm' : ''}" href="${url}" target="_blank" rel="noopener noreferrer"><span>${label}</span>${ic('ext', 14)}</a>` : '');
const errNote = (reason) => html`<div class="vcx-note vcx-note-error" role="alert">${ic('xc')}<p>${reason}</p></div>`;
const https = (u) => (u ? `https://${String(u).replace(/^https?:\/\//, '')}` : '');
const dash = (v, ...rest) => (v?.scope?.slug ? `https://vercel.com/${[v.scope.slug, ...rest].map(encodeURIComponent).join('/')}` : 'https://vercel.com/dashboard');

// ---------------------------------------------------------------- chrome
function top(v, connected) {
  const ps = arr(v?.projects); const s = v?.scope || {};
  const cur = ps.find((p) => p.id === st.project);
  return html`<header class="vcx-top">
    <a class="vcx-home" href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer" aria-label="Vercel">${MARK}</a>
    <span class="vcx-slash" aria-hidden="true">/</span>
    <div class="vcx-pop-w">
      <button class="vcx-scope" data-act="pop" data-k="scope" aria-expanded="${st.pop === 'scope'}">${connected ? avatar(s.slug || s.id) : html`<span class="vcx-av vcx-av-off" style="--s:20px"></span>`}
        <b>${connected ? L(s.name || s.slug || '—') : 'לא מחובר'}</b>${connected ? badge(s.type === 'team' ? 'Team' : 'Hobby', 'gray', 'vcx-badge-sm') : ''}${ic('chev', 14)}</button>
      ${st.pop === 'scope' ? html`<div class="vcx-menu vcx-menu-scope" role="menu">
        <p class="vcx-menu-h">Scope</p>
        ${connected ? html`<div class="vcx-menu-i on">${avatar(s.slug || s.id)}<span>${L(s.name || s.slug)}</span>${ic('check', 14)}</div>`
          : html`<div class="vcx-menu-i">חסר VERCEL_TOKEN</div>`}
        <p class="vcx-menu-f">כדי לעבור לצוות אחר: <code>VERCEL_TEAM_ID=team_…</code> ב-‎.env</p></div>` : ''}
    </div>
    ${connected && ps.length ? html`<span class="vcx-slash" aria-hidden="true">/</span>
      <label class="vcx-proj">${cur ? html`<span class="vcx-fw">${(cur.name || '?').slice(0, 1).toUpperCase()}</span>` : ic('layers', 14)}
        <select id="vcx-proj" data-change="proj" aria-label="פרויקט">
          <option value="" ${!st.project ? 'selected' : ''}>כל הפרויקטים</option>
          ${ps.map((p) => html`<option value="${p.id}" ${st.project === p.id ? 'selected' : ''}>${p.name}</option>`)}
        </select>${ic('chev', 14)}</label>` : ''}
    <span class="vcx-grow"></span>
    <button class="vcx-find" data-act="find" aria-label="חיפוש (Cmd+K)">${ic('search', 14)}<span><bdi dir="ltr">Find…</bdi></span><kbd dir="ltr">⌘K</kbd></button>
    <a class="vcx-btn vcx-btn-tertiary vcx-btn-sm vcx-hide-s" href="https://vercel.com/docs" target="_blank" rel="noopener noreferrer">Docs</a>
    <button class="vcx-btn vcx-btn-secondary vcx-btn-sm vcx-ib" data-act="app:refresh" aria-label="רענון עכשיו מהמקור" title="רענון">${ic('refresh', 14)}</button>
    ${connected ? avatar(v.user?.username || s.slug, 30) : html`<span class="vcx-av vcx-av-off" style="--s:30px" aria-hidden="true"></span>`}
  </header>
  <nav class="vcx-tabs" role="tablist" aria-label="לשוניות Vercel">${TABS.map(([k, l]) => html`<button class="vcx-tab ${st.tab === k ? 'on' : ''}" role="tab" id="vcx-t-${k}" aria-selected="${st.tab === k}" data-act="tab" data-k="${k}">${l}</button>`)}</nav>`;
}

const notes = (list) => (arr(list).length ? html`<section class="vcx-notes" aria-label="מסקנות">${arr(list).map((i, n) => {
  const [t, icn] = NOTE[i.level] || NOTE.info;
  return html`<div class="vcx-note vcx-note-${t}" style="--i:${n}" role="${i.level === 'bad' ? 'alert' : 'status'}">${ic(icn)}<p><b>${i.title}</b> ${i.detail}</p>
    ${i.href ? html`<a class="vcx-note-a" href="${i.href}" target="_blank" rel="noopener noreferrer">פתיחה${ic('ext', 13)}</a>` : ''}</div>`;
})}</section>` : '');

// ---------------------------------------------------------------- not connected
function disconnected(v) {
  const will = [['layers', 'Projects', 'כרטיס לכל פרויקט: framework, ריפו, ה-commit האחרון והדומיין של production'],
    ['activity', 'Deployments', 'כל הפריסות עם נקודת סטטוס, משך בנייה, ענף ו-commit, וסינון לפי סביבה וסטטוס'],
    ['rollback', 'פעולות', 'Redeploy, Promote to Production, Instant Rollback ו-Cancel, כל אחת עם חלון אישור'],
    ['globe', 'Domains', 'כל דומיין עם בדיקת DNS (Valid / Invalid Configuration) ו-aliases'],
    ['key', 'Environment Variables', 'שמות, סוגים וסביבות בלבד. ערכים לא נשלפים אף פעם'],
    ['okc', 'Checks', 'תוצאות הבדיקות שרצו על הפריסות האחרונות']];
  return html`${notes(v.insights)}
  <section class="vcx-empty vcx-connect" aria-labelledby="vcx-c-h">
    <div class="vcx-empty-ic">${MARK}</div>
    <h2 id="vcx-c-h">חברו את Vercel</h2>
    <p class="vcx-muted">צעד אחד: יוצרים Token, מוסיפים שורה לקובץ ‎.env ומפעילים מחדש את לוח הבקרה.</p>
    <ol class="vcx-steps">
      <li><span class="vcx-n">1</span><div><b>יוצרים Token</b><p class="vcx-muted">ב-${L('vercel.com/account/tokens')} → Create Token. Scope: החשבון או הצוות.</p></div></li>
      <li><span class="vcx-n">2</span><div><b>מוסיפים ל-‎.env</b><pre class="vcx-code" dir="ltr"><code>VERCEL_TOKEN=…${'\n'}# optional, for a team: VERCEL_TEAM_ID=team_…</code></pre></div></li>
      <li><span class="vcx-n">3</span><div><b>מפעילים מחדש את לוח הבקרה</b><p class="vcx-muted">הדף הזה יתמלא לבד בנתונים אמיתיים.</p></div></li>
    </ol>
    <div class="vcx-row-c">${extA(v.docs || 'https://vercel.com/account/tokens', 'Create Token', 'primary', false)}${extA('https://vercel.com/docs/rest-api#authentication', 'Docs', 'secondary', false)}</div>
    ${v.how ? html`<details class="vcx-det"><summary>איך בדיוק</summary><p dir="auto">${v.how}</p></details>` : ''}
  </section>
  <h3 class="vcx-h3">מה יופיע כאן אחרי החיבור</h3>
  <section class="vcx-grid vcx-will">${will.map(([i, t, d], n) => html`<article class="vcx-card vcx-ghost" style="--i:${n}"><div class="vcx-card-h">${ic(i)}<b>${t}</b></div><p class="vcx-muted">${d}</p><div class="vcx-sk"></div><div class="vcx-sk vcx-sk-s"></div></article>`)}</section>`;
}

// ---------------------------------------------------------------- overview
function overview(v) {
  const deps = arr(v.deployments); const now = Date.now();
  const day = deps.filter((d) => (d.createdAt || 0) >= now - 86400000);
  const cnt = (s) => day.filter((d) => (s === 'BUILDING' ? LIVE.has(d.state) : d.state === s)).length;
  const done = cnt('READY') + cnt('ERROR');
  const rate = done ? cnt('READY') / done : null;
  const ps = arr(v.projects).filter((p) => !st.q || p.name.toLowerCase().includes(st.q.toLowerCase()));
  const p = arr(v.projects).find((x) => x.id === st.project);
  const lastOf = (id) => deps.find((d) => d.projectId === id);
  return html`${p ? production(v, p) : ''}
  <div class="vcx-ov">
    <aside class="vcx-side">
      <section class="vcx-card vcx-usage" aria-labelledby="vcx-u-h" style="--i:0">
        <div class="vcx-card-h"><h3 id="vcx-u-h">פריסות · 24 שעות</h3>${badge('Live', 'blue-subtle', 'vcx-badge-sm vcx-live')}</div>
        ${v.deployments ? html`<div class="vcx-gauge-w">${gaugeEl(rate)}<div><p class="vcx-big">${rn('vc-day', day.length, num(day.length))}</p><p class="vcx-muted">פריסות ביממה${rate == null ? '' : `, ${num(Math.round(rate * 100))}% הצליחו`}</p></div></div>
          <ul class="vcx-kv">${[['READY', 'Ready'], ['ERROR', 'Error'], ['BUILDING', 'Building'], ['CANCELED', 'Canceled']].map(([s, l]) => html`<li>${dot(s === 'BUILDING' ? 'BUILDING' : s)}<b>${rn(`vc-c-${s}`, cnt(s), num(cnt(s)))}</b></li>`)}</ul>` : errNote(v.errors?.deployments || 'לא הצלחנו לקרוא את הפריסות')}
      </section>
      <section class="vcx-card" aria-labelledby="vcx-r-h" style="--i:1">
        <div class="vcx-card-h"><h3 id="vcx-r-h">Recent Deployments</h3><button class="vcx-link" data-act="tab" data-k="deployments">הכול</button></div>
        <ul class="vcx-mini">${deps.slice(0, 6).map((d) => html`<li data-k="m-${d.id}">${dot(d.state)}<div><a href="${d.inspectorUrl || https(d.url)}" target="_blank" rel="noopener noreferrer">${L(d.url || d.id)}</a>
          <small class="vcx-muted">${d.project} · ${d.target === 'production' ? 'Production' : 'Preview'} · ${ago(d.createdAt)}</small></div></li>`)}
          ${!deps.length && v.deployments ? html`<li class="vcx-muted">אין עדיין פריסות.</li>` : ''}</ul>
      </section>
    </aside>
    <section class="vcx-main" aria-label="פרויקטים">
      <div class="vcx-bar"><label class="vcx-input vcx-grow">${ic('search')}<input id="vcx-q-p" type="search" placeholder="חיפוש פרויקטים…" value="${st.q}" data-input="q" autocomplete="off"></label></div>
      ${v.projects ? html`<div class="vcx-grid">${ps.map((x, n) => {
        const d = lastOf(x.id); const dom = arr(x.production?.aliases)[0] || arr(x.domains).find((z) => !z.redirect)?.name || x.production?.url;
        return html`<article class="vcx-card vcx-pc" data-k="p-${x.id}" style="--i:${Math.min(n + 2, 10)}">
          <div class="vcx-pc-h"><span class="vcx-fw vcx-fw-l" title="${x.framework || 'Other'}">${x.name.slice(0, 1).toUpperCase()}</span>
            <div class="vcx-pc-n"><button class="vcx-pc-t" data-act="proj-open" data-k="${x.id}">${x.name}</button>${dom ? html`<a class="vcx-muted vcx-pc-u" href="${https(dom)}" target="_blank" rel="noopener noreferrer">${L(dom)}</a>` : html`<span class="vcx-muted">אין דומיין</span>`}</div>
            <span class="vcx-circ" title="${x.production ? SK[x.production.state]?.[0] || x.production.state : 'אין production'}">${x.production ? dot(x.production.state) : ic('activity', 14)}</span></div>
          ${x.repo ? html`<span class="vcx-repo">${ic('github', 14)}${L(x.repo)}</span>` : ''}
          <p class="vcx-pc-c">${d?.commit?.message ? String(d.commit.message).split('\n')[0] : html`<span class="vcx-muted">אין commit אחרון ברשימה</span>`}</p>
          <p class="vcx-muted vcx-pc-f">${d ? html`${ago(d.createdAt)}${d.commit?.ref ? html` · ${ic('branch', 13)}${L(d.commit.ref)}` : ''}` : html`עודכן ${ago(x.updatedAt)}`}</p>
        </article>`;
      })}${!ps.length ? html`<div class="vcx-empty vcx-empty-s"><p>${st.q ? 'אין פרויקט בשם הזה.' : 'אין עדיין פרויקטים בחשבון.'}</p></div>` : ''}</div>` : errNote(v.errors?.projects || 'לא הצלחנו לקרוא את הפרויקטים')}
    </section>
  </div>`;
}

function gaugeEl(frac) {
  const f = frac == null ? 0 : Math.max(0, Math.min(1, frac)); const c = 2 * Math.PI * 22;
  const tone = frac == null ? 'gray' : f >= 0.9 ? 'green' : f >= 0.6 ? 'amber' : 'red';
  return html`<span class="vcx-gauge vcx-gauge-${tone}" role="img" aria-label="${frac == null ? 'אין פריסות שהסתיימו' : `${Math.round(f * 100)}% הצליחו`}">
    <svg viewBox="0 0 56 56" width="56" height="56"><circle cx="28" cy="28" r="22" class="vcx-g-trk"/><circle cx="28" cy="28" r="22" class="vcx-g-arc" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 28 28)"/></svg>
    <b>${frac == null ? '—' : Math.round(f * 100)}</b></span>`;
}

function production(v, p) {
  const deps = arr(v.deployments).filter((d) => d.projectId === p.id);
  const cur = deps.find((d) => d.id === p.production?.id) || (p.production && { ...p.production, project: p.name, projectId: p.id, target: 'production' });
  const back = deps.find((d) => d.target === 'production' && d.state === 'READY' && cur && d.id !== cur.id && (d.createdAt || 0) < (cur.createdAt || 0));
  const acts = cur ? offer({ ...cur, project: p.name, projectId: p.id }, v).filter((s) => s.body.kind === 'redeploy') : [];
  const doms = arr(p.domains).filter((z) => !z.redirect);
  return html`<section class="vcx-prod" aria-labelledby="vcx-pd-h">
    <div class="vcx-sec-h"><div><h2 id="vcx-pd-h">Production Deployment</h2><p class="vcx-muted">הפריסה שהמבקרים של ${p.name} רואים עכשיו.</p></div>
      <div class="vcx-row">${cur?.inspectorUrl ? extA(cur.inspectorUrl, 'Build Logs') : ''}${acts.map((s) => vbtn(s, 'Redeploy', 'refresh'))}${back ? vbtn(offer(back, v).find((s) => s.body.kind === 'rollback'), 'Instant Rollback', 'rollback') : ''}</div></div>
    ${cur ? html`<div class="vcx-card vcx-pd">
      <a class="vcx-shot" href="${https(cur.url)}" target="_blank" rel="noopener noreferrer" aria-label="פתיחת הפריסה">${MARK}<span>${L(cur.url || '')}</span></a>
      <dl class="vcx-pd-d">
        <div><dt>Deployment</dt><dd>${L(cur.url || cur.id)}</dd></div>
        <div><dt>Domains</dt><dd class="vcx-doms">${doms.slice(0, 2).map((z) => html`<a href="${https(z.name)}" target="_blank" rel="noopener noreferrer">${L(z.name)}${ic('ext', 13)}</a>`)}${doms.length > 2 ? badge(`+${doms.length - 2}`, 'gray', 'vcx-badge-sm') : ''}${!doms.length ? html`<span class="vcx-muted">—</span>` : ''}</dd></div>
        <div class="vcx-pd-2"><div><dt>Status</dt><dd>${dot(cur.state)}</dd></div><div><dt>Created</dt><dd>${ago(cur.createdAt)}${cur.creator ? html` · ${L(cur.creator)}` : ''}</dd></div></div>
        <div><dt>Source</dt><dd class="vcx-src">${cur.commit?.ref ? html`<span>${ic('branch', 14)}${L(cur.commit.ref)}</span>` : ''}${cur.commit?.sha ? html`<span>${ic('commit', 14)}<code>${String(cur.commit.sha).slice(0, 7)}</code> ${cur.commit.message ? String(cur.commit.message).split('\n')[0] : ''}</span>` : html`<span class="vcx-muted">—</span>`}</dd></div>
      </dl></div>` : html`<div class="vcx-empty vcx-empty-s"><p>אין עדיין פריסה ל-production בפרויקט הזה.</p></div>`}
  </section>`;
}

// ---------------------------------------------------------------- deployments
function deployments(v) {
  if (!v.deployments) return errNote(v.errors?.deployments || 'לא הצלחנו לקרוא את הפריסות');
  const q = st.q.toLowerCase();
  const rows = arr(v.deployments).filter((d) => (!st.project || d.projectId === st.project)
    && (!st.env || (st.env === 'production' ? d.target === 'production' : d.target !== 'production'))
    && st.status.has(d.state)
    && (!q || [d.url, d.project, d.commit?.message, d.commit?.ref, d.creator, d.id].some((x) => String(x || '').toLowerCase().includes(q))));
  const on = STATES.filter(([k]) => st.status.has(k)).length;
  return html`<div class="vcx-sec-h"><div><h2>Deployments</h2><p class="vcx-muted">${num(arr(v.deployments).length)} הפריסות האחרונות${st.project ? ' של הפרויקט' : ' בכל הפרויקטים'}. בדיקות (Checks) רצות על ${num(Object.keys(v.checks || {}).length)} האחרונות.</p></div></div>
  <div class="vcx-bar">
    <label class="vcx-input vcx-grow">${ic('search')}<input id="vcx-q" type="search" placeholder="חיפוש לפי ענף, כתובת או commit…" value="${st.q}" data-input="q" autocomplete="off">${st.q ? html`<button class="vcx-x" data-act="clearq" aria-label="ניקוי">${ic('x', 14)}</button>` : ''}</label>
    <div class="vcx-seg" role="group" aria-label="סביבה">${[['', 'All Environments'], ['production', 'Production'], ['preview', 'Preview']].map(([k, l]) => html`<button class="${st.env === k ? 'on' : ''}" aria-pressed="${st.env === k}" data-act="env" data-k="${k}">${l}</button>`)}</div>
    <div class="vcx-pop-w"><button class="vcx-btn vcx-btn-secondary vcx-filter" data-act="pop" data-k="status" aria-expanded="${st.pop === 'status'}"><span class="vcx-dots">${STATES.map(([, , c]) => html`<i class="vcx-dot vcx-st-${c}"></i>`)}</span><span>Status</span>${badge(`${on}/5`, 'gray', 'vcx-badge-sm vcx-badge-o')}${ic('chev', 14)}</button>
      ${st.pop === 'status' ? html`<div class="vcx-menu" role="menu">${STATES.map(([k, l, c]) => html`<button class="vcx-menu-i" role="menuitemcheckbox" aria-checked="${st.status.has(k)}" data-act="stat" data-k="${k}"><span class="vcx-st vcx-st-${c}"><i class="vcx-dot"></i>${l}</span>${st.status.has(k) ? ic('check', 14) : ''}</button>`)}</div>` : ''}</div>
  </div>
  <div class="vcx-card vcx-list" role="list">${rows.length ? rows.map((d, n) => {
    const acts = offer(d, v); const ch = arr(v.checks?.[d.id]); const chFail = ch.some((r) => r.conclusion === 'failed');
    return html`<div class="vcx-dr ${LIVE.has(d.state) ? 'is-live' : ''}" role="listitem" data-k="d-${d.id}" style="--i:${Math.min(n, 12)}">
      <div class="vcx-dr-1"><a class="vcx-dr-u" href="${d.inspectorUrl || https(d.url)}" target="_blank" rel="noopener noreferrer">${L(d.url || d.id)}</a>
        <span class="vcx-muted">${d.target === 'production' ? 'Production' : 'Preview'}${d.current ? html` ${badge('Current', 'blue', 'vcx-badge-sm')}` : ''}${d.substate === 'STAGED' ? html` ${badge('Staged', 'amber-subtle', 'vcx-badge-sm')}` : ''}</span></div>
      <div class="vcx-dr-2">${dot(d.state)}<span class="vcx-muted">${LIVE.has(d.state) ? html`<span class="vcx-spin" aria-hidden="true"></span>${rel(d.createdAt)}` : d.duration ? duration(d.duration / 1000) : d.errorCode ? L(d.errorCode) : '—'}</span></div>
      <div class="vcx-dr-3"><span class="vcx-dr-c" title="${d.commit?.message || ''}">${d.commit?.message ? String(d.commit.message).split('\n')[0] : html`<span class="vcx-muted">${d.source || '—'}</span>`}</span>
        <span class="vcx-muted">${d.commit?.ref ? html`${ic('branch', 13)}${L(d.commit.ref)}` : ''}${d.commit?.sha ? html` ${ic('commit', 13)}<code>${String(d.commit.sha).slice(0, 7)}</code>` : ''}${ch.length ? html` ${badge(`Checks ${chFail ? '✕' : '✓'} ${ch.length}`, chFail ? 'red-subtle' : 'green-subtle', 'vcx-badge-sm')}` : ''}</span></div>
      <div class="vcx-dr-4 vcx-muted">${ago(d.createdAt)}${d.creator ? html` · ${L(d.creator)}` : ''} ${avatar(d.creator || d.project, 22)}</div>
      <div class="vcx-dr-5 vcx-pop-w"><button class="vcx-kebab" data-act="menu" data-k="${d.id}" aria-label="פעולות על הפריסה" aria-expanded="${st.menu === d.id}">${ic('more')}</button>
        ${st.menu === d.id ? html`<div class="vcx-menu vcx-menu-end" role="menu">
          ${acts.filter((s) => s.body.kind !== 'redeploy').map((s) => html`<button class="vcx-menu-i" role="menuitem" data-act="app:act" data-aid="${aid(s)}"><span>${({ rollback: 'Instant Rollback', promote: 'Promote to Production', cancel: 'Cancel Deployment' })[s.body.kind]}</span>${ic(s.body.kind === 'cancel' ? 'xc' : s.body.kind, 14)}</button>`)}
          ${acts.some((s) => s.body.kind !== 'redeploy') ? html`<hr>` : ''}
          ${acts.filter((s) => s.body.kind === 'redeploy').map((s) => html`<button class="vcx-menu-i" role="menuitem" data-act="app:act" data-aid="${aid(s)}"><span>Redeploy</span>${ic('refresh', 14)}</button>`)}
          ${d.inspectorUrl ? html`<a class="vcx-menu-i" role="menuitem" href="${d.inspectorUrl}" target="_blank" rel="noopener noreferrer"><span>Inspect Deployment</span>${ic('ext', 14)}</a>` : ''}
          ${d.url && d.state === 'READY' ? html`<a class="vcx-menu-i" role="menuitem" href="${https(d.url)}" target="_blank" rel="noopener noreferrer"><span>Visit</span>${ic('ext', 14)}</a>` : ''}
        </div>` : ''}</div>
    </div>`;
  }) : html`<div class="vcx-empty vcx-empty-s"><p>אין פריסות בסינון הזה.</p><button class="vcx-btn vcx-btn-secondary vcx-btn-sm" data-act="reset">איפוס הסינון</button></div>`}</div>`;
}

// ---------------------------------------------------------------- settings
function settings(v) {
  if (!v.projects) return errNote(v.errors?.projects || 'לא הצלחנו לקרוא את הפרויקטים');
  const p = arr(v.projects).find((x) => x.id === st.project) || arr(v.projects)[0];
  if (!p) return html`<div class="vcx-empty"><p>אין עדיין פרויקטים בחשבון.</p></div>`;
  const SUBS = [['general', 'General'], ['domains', 'Domains'], ['env', 'Environment Variables'], ['git', 'Git']];
  let body;
  if (st.set === 'domains') {
    body = html`<section class="vcx-card vcx-set"><div class="vcx-set-h"><h3>Domains</h3><p class="vcx-muted">הדומיינים של ${p.name} ובדיקת ה-DNS של כל אחד.</p></div>
      ${p.domainsError ? errNote(p.domainsError) : p.domains == null ? html`<p class="vcx-muted vcx-pad">הפרטים נטענים רק ל-8 הפרויקטים שעודכנו לאחרונה.</p>` : html`<table class="vcx-table"><thead><tr><th>Domain</th><th>Configuration</th><th>Record</th><th>Redirect</th></tr></thead><tbody>
        ${p.domains.map((z) => html`<tr data-k="z-${z.name}"><td><a href="${https(z.name)}" target="_blank" rel="noopener noreferrer">${L(z.name)}</a></td>
          <td>${z.misconfigured === true || z.verified === false ? badge(html`${ic('xc', 12)}${z.verified === false ? 'Pending Verification' : 'Invalid Configuration'}`, 'red-subtle') : z.misconfigured === false ? badge(html`${ic('okc', 12)}Valid Configuration`, 'blue-subtle') : badge('לא נבדק', 'gray')}</td>
          <td>${z.configuredBy ? L(z.configuredBy) : '—'}</td><td>${z.redirect ? L(`→ ${z.redirect}`) : '—'}</td></tr>`)}</tbody></table>`}
    </section>
    <section class="vcx-card vcx-set"><div class="vcx-set-h"><h3>Account Domains</h3><p class="vcx-muted">הדומיינים של ה-scope כולו. רכישה, העברה וחידוש נשארים ב-Vercel.</p></div>
      ${v.domains == null ? errNote(v.errors?.domains || 'לא הצלחנו לקרוא את הדומיינים') : html`<table class="vcx-table"><thead><tr><th>Domain</th><th>Verified</th><th>Registrar</th><th>Expires</th></tr></thead><tbody>
        ${v.domains.map((z) => html`<tr data-k="a-${z.name}"><td>${L(z.name)}</td><td>${z.verified ? badge('Verified', 'green-subtle') : badge('Unverified', 'amber-subtle')}</td><td>${z.serviceType === 'zeit.world' ? 'Vercel' : L(z.serviceType || '—')}</td><td>${z.expiresAt ? html`${ago(z.expiresAt)}${z.renew === false ? html` ${badge('Auto-renew off', 'amber-subtle', 'vcx-badge-sm')}` : ''}` : '—'}</td></tr>`)}
        ${!v.domains.length ? html`<tr><td colspan="4" class="vcx-muted">אין דומיינים ברמת החשבון.</td></tr>` : ''}</tbody></table>`}
    </section>
    <section class="vcx-card vcx-set"><div class="vcx-set-h"><h3>Aliases</h3><p class="vcx-muted">כתובות שמצביעות לפריסה מסוימת.</p></div>
      ${v.aliases == null ? errNote(v.errors?.aliases || 'לא הצלחנו לקרוא את ה-aliases') : html`<table class="vcx-table"><thead><tr><th>Alias</th><th>Deployment</th><th>Created</th></tr></thead><tbody>
        ${v.aliases.filter((a) => !st.project || a.projectId === p.id).slice(0, 20).map((a) => html`<tr data-k="al-${a.alias}"><td>${L(a.alias)}</td><td><code>${L(String(a.deploymentId || '').slice(0, 16))}</code></td><td>${ago(a.createdAt)}</td></tr>`)}</tbody></table>`}
    </section>`;
  } else if (st.set === 'env') {
    body = html`<section class="vcx-card vcx-set"><div class="vcx-set-h"><h3>Environment Variables</h3><p class="vcx-muted">שמות, סוגים וסביבות בלבד. הערכים לא נשלפים לכאן אף פעם, ושינוי משתנים נעשה רק ב-Vercel.</p></div>
      ${p.envError ? errNote(p.envError) : p.env == null ? html`<p class="vcx-muted vcx-pad">הפרטים נטענים רק ל-8 הפרויקטים שעודכנו לאחרונה.</p>` : html`<table class="vcx-table"><thead><tr><th>Key</th><th>Type</th><th>Environments</th><th>Updated</th></tr></thead><tbody>
        ${p.env.map((e) => html`<tr data-k="e-${e.key}-${e.target.join('')}"><td><code>${L(e.key)}</code></td><td>${badge(e.type || '—', e.type === 'sensitive' || e.type === 'secret' ? 'purple-subtle' : 'gray', 'vcx-badge-sm')}</td>
          <td>${e.target.map((t) => badge(t[0].toUpperCase() + t.slice(1), 'gray', 'vcx-badge-sm vcx-badge-o'))}${e.gitBranch ? html` ${ic('branch', 12)}${L(e.gitBranch)}` : ''}</td><td>${ago(e.updatedAt)}</td></tr>`)}
        ${!p.env.length ? html`<tr><td colspan="4" class="vcx-muted">אין משתני סביבה בפרויקט.</td></tr>` : ''}</tbody></table>`}
      <div class="vcx-set-f"><span class="vcx-muted">לעריכה ולצפייה בערכים</span>${extA(dash(v, p.name, 'settings', 'environment-variables'), 'Open in Vercel')}</div>
    </section>`;
  } else if (st.set === 'git') {
    body = html`<section class="vcx-card vcx-set"><div class="vcx-set-h"><h3>Connected Git Repository</h3></div>
      <dl class="vcx-dl"><div><dt>Repository</dt><dd>${p.repo ? html`${ic('github', 14)} ${L(p.repo)}` : '—'}</dd></div><div><dt>Provider</dt><dd>${p.gitProvider || '—'}</dd></div><div><dt>Production Branch</dt><dd>${p.productionBranch ? html`${ic('branch', 14)} ${L(p.productionBranch)}` : '—'}</dd></div></dl></section>`;
  } else {
    body = html`<section class="vcx-card vcx-set"><div class="vcx-set-h"><h3>General</h3></div>
      <dl class="vcx-dl"><div><dt>Project Name</dt><dd>${L(p.name)}</dd></div><div><dt>Project ID</dt><dd><code>${L(p.id)}</code></dd></div>
        <div><dt>Framework Preset</dt><dd>${p.framework || 'Other'}</dd></div><div><dt>Node.js Version</dt><dd>${p.nodeVersion || '—'}</dd></div>
        <div><dt>Created</dt><dd>${ago(p.createdAt)}</dd></div><div><dt>Updated</dt><dd>${ago(p.updatedAt)}</dd></div>
        <div><dt>Status</dt><dd>${p.paused ? badge('Paused', 'amber-subtle') : badge('Active', 'green-subtle')}</dd></div></dl>
      <div class="vcx-set-f"><span class="vcx-muted">מחיקה, העברה ושינוי הגדרות נשארים ב-Vercel.</span>${extA(dash(v, p.name, 'settings'), 'Open in Vercel')}</div></section>`;
  }
  return html`<div class="vcx-sec-h"><div><h2>Project Settings</h2><p class="vcx-muted">${L(p.name)}</p></div></div>
    <div class="vcx-settings"><nav class="vcx-snav" aria-label="הגדרות">${SUBS.map(([k, l]) => html`<button class="${st.set === k ? 'on' : ''}" aria-current="${st.set === k ? 'page' : 'false'}" data-act="set" data-k="${k}">${l}</button>`)}</nav><div class="vcx-sbody">${body}</div></div>`;
}

function remote(v, k) {
  const [t, path, what] = REMOTE[k]; const p = arr(v?.projects).find((x) => x.id === st.project);
  return html`<section class="vcx-empty" aria-labelledby="vcx-rm-h"><div class="vcx-empty-ic">${ic(k === 'storage' ? 'layers' : 'activity', 20)}</div>
    <h2 id="vcx-rm-h">${t}</h2><p class="vcx-muted">${what}. התצוגה הזו חיה ב-Vercel עצמו: ה-API של ה-Token לא מחזיר אותה, אז לא מוצגים כאן מספרים מומצאים.</p>
    <div class="vcx-row-c">${extA(p ? dash(v, p.name, path) : dash(v, path), `Open ${t}`, 'primary', false)}</div></section>`;
}

export default {
  id: 'vercel', title: 'Vercel', nav: 'Vercel', brand: 'vercel', needs: ['vercel', 'pulse'],
  sub: 'פרויקטים, פריסות, דומיינים ומשתני סביבה (שמות בלבד), עם Redeploy, Promote, Rollback ו-Cancel מאחורי אישור',
  links: (d) => (d?.vercel?.ok !== false && d?.vercel?.scope?.slug ? [{ label: 'Vercel', url: `https://vercel.com/${encodeURIComponent(d.vercel.scope.slug)}` }] : []),
  render(d) {
    const v = d.vercel || {};
    const connected = v.ok !== false;
    if (!connected && v.configured !== false) {
      return html`<div class="vcx">${top(null, false)}<div class="vcx-body">${errNote(v.reason || 'Vercel לא ענה')}<p class="vcx-muted">אם הטוקן נמחק או פג, יוצרים חדש ב-${L('vercel.com/account/tokens')} ומחליפים את VERCEL_TOKEN ב-‎.env.</p></div></div>`;
    }
    let body;
    if (!connected) body = disconnected(v);
    else if (st.tab === 'overview') body = html`${notes(v.insights)}${overview(v)}`;
    else if (st.tab === 'deployments') body = html`${notes(v.insights)}${deployments(v)}`;
    else if (st.tab === 'settings') body = settings(v);
    else body = remote(v, st.tab);
    return html`<div class="vcx">${top(v, connected)}<div class="vcx-body" role="tabpanel" aria-labelledby="vcx-t-${st.tab}">${body}</div></div>`;
  },
  actions: {
    tab(el, ctx) { st.tab = el.dataset.k; st.menu = ''; st.pop = ''; ctx.rerender(); },
    proj(el, ctx) { st.project = el.value; ctx.rerender(); },
    'proj-open'(el, ctx) { st.project = el.dataset.k; ctx.rerender(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
    q(el, ctx) { st.q = el.value; ctx.rerender(); },
    clearq(el, ctx) { st.q = ''; ctx.rerender(); },
    env(el, ctx) { st.env = el.dataset.k; ctx.rerender(); },
    stat(el, ctx) { const k = el.dataset.k; const on = !st.status.has(k); for (const s of k === 'BUILDING' ? ['BUILDING', 'INITIALIZING'] : k === 'ERROR' ? ['ERROR', 'BLOCKED'] : [k]) if (on) st.status.add(s); else st.status.delete(s); ctx.rerender(); },
    reset(el, ctx) { st.q = ''; st.env = ''; STATES.forEach(([k]) => st.status.add(k)); st.status.add('INITIALIZING'); st.status.add('BLOCKED'); ctx.rerender(); },
    menu(el, ctx) { st.menu = st.menu === el.dataset.k ? '' : el.dataset.k; st.pop = ''; ctx.rerender(); },
    pop(el, ctx) { st.pop = st.pop === el.dataset.k ? '' : el.dataset.k; st.menu = ''; ctx.rerender(); },
    set(el, ctx) { st.set = el.dataset.k; ctx.rerender(); },
    find() { document.getElementById('pal-btn')?.click(); },
  },
  // Menus close on any click outside their button (after the shell's delegated handler has run) and on Escape.
  mount(root, ctx) {
    const close = (e) => {
      if (!st.menu && !st.pop) return;
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      if (e.type === 'click' && (e.target.closest?.('[data-act="menu"],[data-act="pop"],[data-act="stat"]'))) return;
      setTimeout(() => { st.menu = ''; st.pop = ''; ctx.rerender(); }, 0);
    };
    document.addEventListener('click', close, true); document.addEventListener('keydown', close, true);
    offDoc = () => { document.removeEventListener('click', close, true); document.removeEventListener('keydown', close, true); };
  },
  unmount() { offDoc?.(); offDoc = null; st.menu = ''; st.pop = ''; },
};
